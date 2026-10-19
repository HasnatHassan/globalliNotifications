import { createServer, type Server } from "node:http";
import { connect as tcpConnect } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WebSocket, type ClientOptions } from "ws";
import { silentLogger } from "../src/logger.js";
import { startServer, type RunningServer, type ServerOptions } from "../src/server/createServer.js";
import { WebSocketHub, type Welcome } from "../src/server/WebSocketHub.js";

interface WsMessage {
  type: string;
  data: Record<string, unknown>;
}

const json = async <T>(res: Response) => (await res.json()) as T;
const started: RunningServer[] = [];

async function boot(options: Partial<ServerOptions> = {}) {
  const app = await startServer({ port: 0, logger: silentLogger, ...options });
  started.push(app);
  const base = `http://localhost:${app.port}`;
  const send = (method: string, path: string, body?: unknown) =>
    fetch(`${base}${path}`, {
      method,
      headers: { "content-type": "application/json" },
      ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }),
    });
  return {
    app,
    base,
    get: (path: string) => fetch(`${base}${path}`),
    post: (path: string, body: unknown) => send("POST", path, body),
    put: (path: string, body: unknown) => send("PUT", path, body),
    patch: (path: string, body: unknown) => send("PATCH", path, body),
    wsUrl: (path: string) => `ws://localhost:${app.port}${path}`,
  };
}

/** A WebSocket client that records messages and lets tests await them without polling. */
async function openClient(url: string, options: ClientOptions = {}) {
  const ws = new WebSocket(url, options);
  const messages: WsMessage[] = [];
  const waiters: { pred: (m: WsMessage) => boolean; resolve: (m: WsMessage) => void }[] = [];
  ws.on("message", (raw) => {
    const msg = JSON.parse(String(raw)) as WsMessage;
    messages.push(msg);
    for (const w of [...waiters]) {
      if (w.pred(msg)) {
        waiters.splice(waiters.indexOf(w), 1);
        w.resolve(msg);
      }
    }
  });
  const closed = new Promise<number>((resolve) => ws.on("close", (code) => resolve(code)));
  await new Promise<void>((resolve, reject) => {
    ws.once("open", () => resolve());
    ws.once("error", reject);
  });
  return {
    ws,
    messages,
    closed,
    next(pred: (m: WsMessage) => boolean, timeoutMs = 2000): Promise<WsMessage> {
      const found = messages.find(pred);
      if (found) return Promise.resolve(found);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("timed out waiting for message")), timeoutMs);
        waiters.push({ pred, resolve: (m) => (clearTimeout(timer), resolve(m)) });
      });
    },
    notifications: () => messages.filter((m) => m.type === "notification").map((m) => m.data),
  };
}

const isNotification = (message: string) => (m: WsMessage) => m.type === "notification" && m.data.message === message;

beforeEach(() => {
  started.length = 0;
});
afterEach(async () => {
  await Promise.all(started.map((app) => app.close()));
});

describe("HTTP API", () => {
  it("lists players and default preferences", async () => {
    const t = await boot();
    expect((await json<{ data: unknown[] }>(await t.get("/api/players"))).data).toHaveLength(4);
    expect((await json<{ data: unknown }>(await t.get("/api/players/2/preferences"))).data).toEqual({ GAME: true, SOCIAL: true });
  });

  it("validates input with consistent error shapes", async () => {
    const t = await boot();
    expect((await t.get("/api/players/99/preferences")).status).toBe(404);
    expect((await t.put("/api/players/2/preferences", { GAME: "no" })).status).toBe(400);
    expect((await t.put("/api/players/2/preferences", {})).status).toBe(400);
    const bad = await t.post("/api/events", { type: "PLAYER_LEVELED_UP", playerId: 1, newLevel: -5 });
    expect(bad.status).toBe(400);
    expect((await json<{ error: { message: string } }>(bad)).error.message).toBe("Invalid event");
    expect((await t.post("/api/events", { type: "FRIEND_REQUEST_SENT", fromPlayerId: 3, toPlayerId: 42 })).status).toBe(404);
    expect((await t.post("/api/events", { type: "ITEM_ACQUIRED", playerId: 2, itemId: "SwordOfAzerot" })).status).toBe(404);
    expect((await t.get("/api/nope")).status).toBe(404);
  });

  it("returns 400 for malformed JSON and 413 for an oversized body", async () => {
    const t = await boot();
    const malformed = await t.post("/api/events", "{not json");
    expect(malformed.status).toBe(400);
    expect((await json<{ error: { message: string } }>(malformed)).error.message).toBe("Malformed JSON body");
    const huge = await t.post("/api/events", { type: "NEW_FOLLOWER", pad: "x".repeat(20_000) });
    expect(huge.status).toBe(413);
  });

  it("fails fast with EADDRINUSE when the port is taken", async () => {
    const t = await boot();
    await expect(startServer({ port: t.app.port, logger: silentLogger })).rejects.toMatchObject({ code: "EADDRINUSE" });
  });
});

describe("WebSocket connections", () => {
  it("rejects unknown players", async () => {
    const t = await boot();
    const client = await openClient(t.wsUrl("/ws?userId=99"));
    expect(await client.closed).toBe(1008);
  });

  it("rejects cross-origin browser pages and accepts same-origin ones", async () => {
    const t = await boot();
    const status = await new Promise<number>((resolve) => {
      const ws = new WebSocket(t.wsUrl("/ws?userId=1"), { origin: "https://evil.example" });
      ws.on("unexpected-response", (_req, res) => resolve(res.statusCode ?? 0));
      ws.on("error", () => {});
    });
    expect(status).toBe(403);
    const sameOrigin = await openClient(t.wsUrl("/ws?userId=1"), { origin: t.base });
    await sameOrigin.next((m) => m.type === "welcome");
    sameOrigin.ws.close();
  });

  it("survives a malformed frame from one client", async () => {
    const t = await boot();
    const bystander = await openClient(t.wsUrl("/ws?userId=1"));
    await bystander.next((m) => m.type === "welcome");

    const raw = tcpConnect(t.app.port, "localhost");
    raw.on("error", () => {});
    raw.write(
      [
        "GET /ws?userId=2 HTTP/1.1",
        `Host: localhost:${t.app.port}`,
        "Upgrade: websocket",
        "Connection: Upgrade",
        "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==",
        "Sec-WebSocket-Version: 13",
        "",
        "",
      ].join("\r\n"),
    );
    await new Promise<void>((resolve) => raw.once("data", () => resolve())); // 101 Switching Protocols
    raw.write(Buffer.from([0x81, 0x02, 0x68, 0x69])); // text frame without the mandatory client mask
    await new Promise((resolve) => raw.once("close", resolve));

    expect((await t.get("/api/health")).status).toBe(200);
    await t.post("/api/events", { type: "NEW_FOLLOWER", followerId: 2, followedId: 1 });
    await bystander.next(isNotification("Player 'Bob' started following you."));
    bystander.ws.close();
  });

  it("terminates connections that stop answering heartbeats", async () => {
    const t = await boot({ heartbeatMs: 20 });
    const silent = await openClient(t.wsUrl("/ws?userId=1"), { autoPong: false });
    expect(await silent.closed).toBe(1006); // terminated, no close handshake
  });
});

describe("real-time delivery", () => {
  it("pushes to the recipient only; player sockets never receive other players' activity", async () => {
    const t = await boot();
    const alice = await openClient(t.wsUrl("/ws?userId=1"));
    const dan = await openClient(t.wsUrl("/ws?userId=4"));
    await Promise.all([alice.next((m) => m.type === "welcome"), dan.next((m) => m.type === "welcome")]);

    expect((await t.post("/api/events", { type: "FRIEND_REQUEST_SENT", fromPlayerId: 3, toPlayerId: 1 })).status).toBe(202);
    await alice.next(isNotification("Player 'Cara' has sent you a friend request."));

    // Sentinel to Dan: once it arrives, everything sent to Dan earlier has arrived too (ordered stream).
    await t.post("/api/events", { type: "PLAYER_LEVELED_UP", playerId: 4, newLevel: 9 });
    await dan.next(isNotification("Congratulations! You've reached level 9!"));
    expect(dan.messages.map((m) => m.type)).toEqual(["welcome", "notification"]);
    expect(alice.messages.some((m) => m.type === "activity")).toBe(false);
    alice.ws.close();
    dan.ws.close();
  });

  it("delivers each notification exactly once per connection, across parallel events and tabs", async () => {
    const t = await boot();
    const tabs = await Promise.all([openClient(t.wsUrl("/ws?userId=2")), openClient(t.wsUrl("/ws?userId=2"))]);
    await Promise.all(tabs.map((tab) => tab.next((m) => m.type === "welcome")));

    await Promise.all([
      t.post("/api/events", { type: "NEW_FOLLOWER", followerId: 1, followedId: 2 }),
      t.post("/api/events", { type: "NEW_FOLLOWER", followerId: 3, followedId: 2 }),
      t.post("/api/events", { type: "PLAYER_ATTACKED", attackerId: 4, victimId: 2 }),
    ]);
    await t.app.system.drain();
    await t.post("/api/events", { type: "PLAYER_LEVELED_UP", playerId: 2, newLevel: 50 }); // sentinel

    for (const tab of tabs) {
      await tab.next(isNotification("Congratulations! You've reached level 50!"));
      const ids = tab.notifications().map((n) => n.id);
      expect(ids).toHaveLength(4);
      expect(new Set(ids).size).toBe(4);
      tab.ws.close();
    }
  });

  it("streams dispatch outcomes on the separate activity feed", async () => {
    const t = await boot();
    const feed = await openClient(t.wsUrl("/ws/activity"));
    await t.put("/api/players/1/preferences", { SOCIAL: false });
    await t.post("/api/events", { type: "FRIEND_REQUEST_SENT", fromPlayerId: 3, toPlayerId: 1 });
    const activity = await feed.next((m) => m.type === "activity");
    expect(activity.data).toMatchObject({
      event: { type: "FRIEND_REQUEST_SENT", fromPlayerId: 3, toPlayerId: 1 },
      sent: [],
      suppressed: [{ userId: 1, category: "SOCIAL" }],
    });

    // Dan has no connection: reported as offline, not sent.
    await t.post("/api/events", { type: "PLAYER_LEVELED_UP", playerId: 4, newLevel: 2 });
    const offline = await feed.next((m) => m.type === "activity" && (m.data.event as { type: string }).type === "PLAYER_LEVELED_UP");
    expect(offline.data).toMatchObject({ sent: [], offline: [{ userId: 4, type: "LEVEL_UP" }] });

    // Once connected, the same kind of event counts as sent.
    const dan = await openClient(t.wsUrl("/ws?userId=4"));
    await dan.next((m) => m.type === "welcome");
    await t.post("/api/events", { type: "PLAYER_LEVELED_UP", playerId: 4, newLevel: 3 });
    const live = await feed.next(
      (m) => m.type === "activity" && (m.data.event as { newLevel?: number }).newLevel === 3,
    );
    expect(live.data).toMatchObject({ sent: [{ userId: 4 }], offline: [] });
    dan.ws.close();
    feed.ws.close();
  });

  it("does not expose the activity feed when disabled", async () => {
    const t = await boot({ activityFeed: false });
    const status = await new Promise<number>((resolve) => {
      const ws = new WebSocket(t.wsUrl("/ws/activity"));
      ws.on("unexpected-response", (_req, res) => resolve(res.statusCode ?? 0));
      ws.on("error", () => {});
    });
    expect(status).toBe(404);
  });
});

describe("inbox replay and read state", () => {
  it("replays the whole inbox on connect, and the unread count matches it", async () => {
    const t = await boot();
    for (let level = 1; level <= 105; level++) await t.app.system.gameEngine.playerLeveledUp(4, level);
    await t.app.system.drain();

    const dan = await openClient(t.wsUrl("/ws?userId=4"));
    const welcome = await dan.next((m) => m.type === "welcome");
    const history = welcome.data.history as { message: string; read: boolean }[];
    expect(history).toHaveLength(100);
    expect(history[0]!.message).toBe("Congratulations! You've reached level 105!");
    expect(welcome.data).toMatchObject({ unread: 100, capacity: 100 });
    expect((await json<{ data: unknown[] }>(await t.get("/api/players/4/notifications"))).data).toHaveLength(100);
    dan.ws.close();
  });

  it("honours preferences and replays notifications sent while offline", async () => {
    const t = await boot();
    await t.put("/api/players/3/preferences", { GAME: false });
    await t.post("/api/events", { type: "PLAYER_LEVELED_UP", playerId: 3, newLevel: 7 }); // suppressed
    await t.post("/api/events", { type: "NEW_FOLLOWER", followerId: 2, followedId: 3 }); // stored while offline
    await t.app.system.drain();

    const cara = await openClient(t.wsUrl("/ws?userId=3"));
    const welcome = await cara.next((m) => m.type === "welcome");
    expect((welcome.data.history as { message: string }[]).map((n) => n.message)).toEqual(["Player 'Bob' started following you."]);
    expect(welcome.data.unread).toBe(1);
    cara.ws.close();
  });

  it("marks read/unread and syncs read state to the player's sockets", async () => {
    const t = await boot();
    await t.app.system.gameEngine.playerLeveledUp(4, 2);
    await t.app.system.gameEngine.playerLeveledUp(4, 3);
    await t.app.system.drain();
    const dan = await openClient(t.wsUrl("/ws?userId=4"));
    await dan.next((m) => m.type === "welcome");

    const inbox = await json<{ data: { id: string }[] }>(await t.get("/api/players/4/notifications"));
    const path = `/api/players/4/notifications/${encodeURIComponent(inbox.data[0]!.id)}`;

    const read = await json<{ data: { notification: { read: boolean }; unread: number } }>(await t.patch(path, { read: true }));
    expect(read.data).toMatchObject({ notification: { read: true }, unread: 1 });
    expect((await dan.next((m) => m.type === "read-state")).data).toMatchObject({ read: true, unread: 1 });

    expect((await json<{ data: { unread: number } }>(await t.patch(path, { read: false }))).data.unread).toBe(2);
    const all = await json<{ data: { updated: number; unread: number } }>(await t.post("/api/players/4/notifications/read-all", {}));
    expect(all.data).toEqual({ updated: 2, unread: 0 });

    expect((await t.patch(path, { read: "yes" })).status).toBe(400);
    expect((await t.patch("/api/players/4/notifications/missing", { read: true })).status).toBe(404);
    expect((await t.patch(path.replace("/players/4/", "/players/1/"), { read: true })).status).toBe(404);
    dan.ws.close();
  });
});

describe("WebSocketHub replay race", () => {
  let server: Server;
  afterEach(() => new Promise<void>((resolve) => server.close(() => resolve())));

  it("holds live pushes until the welcome is sent, and drops pushes the replay already contains", async () => {
    let releaseWelcome!: (w: Welcome) => void;
    const welcome = new Promise<Welcome>((resolve) => (releaseWelcome = resolve));
    const hub = new WebSocketHub({ isKnownPlayer: () => true, welcome: () => welcome }, silentLogger);
    server = createServer();
    server.on("upgrade", (req, socket, head) => hub.handleUpgrade(req, socket, head));
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as { port: number }).port;

    const client = await openClient(`ws://localhost:${port}/ws?userId=1`);
    // Registered synchronously in the upgrade callback, before the client saw `open`; now awaiting the welcome.
    expect(hub.connectionCount(1)).toBe(1);

    hub.sendTo(1, { type: "notification", data: { id: "already-in-replay" } }, "already-in-replay");
    hub.sendTo(1, { type: "notification", data: { id: "new" } }, "new");
    releaseWelcome({ message: { type: "welcome", data: {} }, deliveredKeys: ["already-in-replay"] });

    await client.next((m) => m.type === "notification" && m.data.id === "new");
    expect(client.messages.map((m) => [m.type, m.data.id])).toEqual([
      ["welcome", undefined],
      ["notification", "new"],
    ]);
    client.ws.close();
    await hub.close();
  });
});
