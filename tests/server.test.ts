import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { silentLogger } from "../src/logger.js";
import { startServer, type RunningServer } from "../src/server/createServer.js";

let app: RunningServer;
let base: string;

beforeAll(async () => {
  app = await startServer(0, silentLogger);
  base = `http://localhost:${app.port}`;
});
afterAll(() => app.close());

const post = (path: string, body: unknown) =>
  fetch(`${base}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const put = (path: string, body: unknown) =>
  fetch(`${base}${path}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const patch = (path: string, body: unknown) =>
  fetch(`${base}${path}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

const json = async <T>(res: Response) => (await res.json()) as T;

interface WsMessage {
  type: "welcome" | "notification" | "activity" | "read-state";
  data: Record<string, unknown>;
}

/** Opens a socket for a player and collects every JSON message it receives. */
async function connect(userId: number | string) {
  const ws = new WebSocket(`ws://localhost:${app.port}/ws?userId=${userId}`);
  const messages: WsMessage[] = [];
  ws.on("message", (raw) => messages.push(JSON.parse(String(raw))));
  await new Promise<void>((resolve, reject) => {
    ws.once("open", () => resolve());
    ws.once("error", reject);
  });
  const waitFor = async (pred: (m: WsMessage) => boolean, timeoutMs = 1000): Promise<WsMessage> => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const found = messages.find(pred);
      if (found) return found;
      await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error("timed out waiting for message");
  };
  return { ws, messages, waitFor };
}

describe("HTTP API", () => {
  it("lists players and default preferences", async () => {
    const players = await json<{ data: unknown[] }>(await fetch(`${base}/api/players`));
    expect(players.data).toHaveLength(4);
    const prefs = await json<{ data: unknown }>(await fetch(`${base}/api/players/2/preferences`));
    expect(prefs.data).toEqual({ GAME: true, SOCIAL: true });
  });

  it("validates input and returns consistent error shapes", async () => {
    expect((await fetch(`${base}/api/players/99/preferences`)).status).toBe(404);
    expect((await put("/api/players/2/preferences", { GAME: "no" })).status).toBe(400);
    expect((await put("/api/players/2/preferences", {})).status).toBe(400);
    const bad = await post("/api/events", { type: "PLAYER_LEVELED_UP", playerId: 1 });
    expect(bad.status).toBe(400);
    expect((await json<{ error: { message: string } }>(bad)).error.message).toBe("Invalid request");
    const unknown = await post("/api/events", { type: "FRIEND_REQUEST_SENT", fromPlayerId: 3, toPlayerId: 42 });
    expect(unknown.status).toBe(400);
    expect((await fetch(`${base}/api/nope`)).status).toBe(404);
  });
});

describe("real-time delivery over WebSocket", () => {
  it("rejects unknown players", async () => {
    const ws = new WebSocket(`ws://localhost:${app.port}/ws?userId=99`);
    const code = await new Promise<number>((resolve) => ws.on("close", (c) => resolve(c)));
    expect(code).toBe(1008);
  });

  it("pushes a friend request from player 3 to connected player 1 only", async () => {
    const alice = await connect(1);
    const dan = await connect(4);
    await alice.waitFor((m) => m.type === "welcome");

    const res = await post("/api/events", { type: "FRIEND_REQUEST_SENT", fromPlayerId: 3, toPlayerId: 1 });
    expect(res.status).toBe(202);

    const msg = await alice.waitFor((m) => m.type === "notification");
    expect(msg.data).toMatchObject({
      userId: 1,
      category: "SOCIAL",
      message: "Player 'Cara' has sent you a friend request.",
    });
    await dan.waitFor((m) => m.type === "activity");
    expect(dan.messages.filter((m) => m.type === "notification")).toEqual([]);
    alice.ws.close();
    dan.ws.close();
  });

  it("honours preferences and replays the inbox on reconnect", async () => {
    await put("/api/players/3/preferences", { GAME: false });
    await post("/api/events", { type: "PLAYER_LEVELED_UP", playerId: 3, newLevel: 7 }); // suppressed
    await post("/api/events", { type: "NEW_FOLLOWER", followerId: 2, followedId: 3 }); // delivered while offline

    const cara = await connect(3);
    const welcome = await cara.waitFor((m) => m.type === "welcome");
    expect((welcome.data.history as { message: string }[]).map((n) => n.message)).toEqual([
      "Player 'Bob' started following you.",
    ]);

    expect(welcome.data.unread).toBe(1);
    cara.ws.close();
  });

  it("delivers each notification exactly once per connection, even for parallel events and multiple tabs", async () => {
    const tab1 = await connect(2);
    const tab2 = await connect(2);
    await tab1.waitFor((m) => m.type === "welcome");
    await tab2.waitFor((m) => m.type === "welcome");

    await Promise.all([
      post("/api/events", { type: "NEW_FOLLOWER", followerId: 1, followedId: 2 }),
      post("/api/events", { type: "NEW_FOLLOWER", followerId: 3, followedId: 2 }),
      post("/api/events", { type: "PLAYER_ATTACKED", attackerId: 4, victimId: 2 }),
    ]);
    // Wait for all three activity entries, then let any stray duplicates arrive.
    const deadline = Date.now() + 1000;
    while (tab1.messages.filter((m) => m.type === "activity").length < 3 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 10));
    }
    await new Promise((r) => setTimeout(r, 50));

    for (const tab of [tab1, tab2]) {
      const ids = tab.messages.filter((m) => m.type === "notification").map((m) => m.data.id);
      expect(ids).toHaveLength(3);
      expect(new Set(ids).size).toBe(3);
    }
    const activity = tab1.messages.find((m) => m.type === "activity");
    expect(activity?.data.event).toMatchObject({ type: expect.any(String) });
    tab1.ws.close();
    tab2.ws.close();
  });

  it("marks notifications read/unread and syncs read state to the player's sockets", async () => {
    await post("/api/events", { type: "PLAYER_LEVELED_UP", playerId: 4, newLevel: 2 });
    await post("/api/events", { type: "PLAYER_LEVELED_UP", playerId: 4, newLevel: 3 });
    const dan = await connect(4);
    await dan.waitFor((m) => m.type === "welcome");

    const inbox = await json<{ data: { id: string; read: boolean }[] }>(await fetch(`${base}/api/players/4/notifications`));
    const id = inbox.data[0]!.id;

    const read = await json<{ data: { notification: { read: boolean }; unread: number } }>(
      await patch(`/api/players/4/notifications/${id}`, { read: true }),
    );
    expect(read.data).toMatchObject({ notification: { read: true }, unread: 1 });
    const sync = await dan.waitFor((m) => m.type === "read-state");
    expect(sync.data).toMatchObject({ ids: [id], read: true, unread: 1 });

    const unread = await json<{ data: { unread: number } }>(await patch(`/api/players/4/notifications/${id}`, { read: false }));
    expect(unread.data.unread).toBe(2);

    const all = await json<{ data: { updated: number; unread: number } }>(await post("/api/players/4/notifications/read-all", {}));
    expect(all.data).toEqual({ updated: 2, unread: 0 });

    expect((await patch(`/api/players/4/notifications/${id}`, { read: "yes" })).status).toBe(400);
    expect((await patch(`/api/players/4/notifications/missing`, { read: true })).status).toBe(404);
    expect((await patch(`/api/players/1/notifications/${id}`, { read: true })).status).toBe(404); // not Alice's
    dan.ws.close();
  });
});
