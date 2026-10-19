import { describe, expect, it } from "vitest";
import type { NotificationChannel } from "../src/channels/NotificationChannel.js";
import { RecordingNotificationClient } from "../src/clients/RecordingNotificationClient.js";
import { createNotificationSystem } from "../src/composition.js";
import { UnknownReferenceError } from "../src/domain/eventSchemas.js";
import { silentLogger } from "../src/logger.js";

function system(extra: { extraChannels?: NotificationChannel[]; channelTimeoutMs?: number } = {}) {
  const client = new RecordingNotificationClient();
  return { client, ...createNotificationSystem({ client, logger: silentLogger, ...extra }) };
}

describe("end to end through the composition root", () => {
  it("handles the brief's example triggers", async () => {
    const s = system();
    await s.gameEngine.playerLeveledUp(1, 15);
    await s.gameEngine.itemAcquired(2, "SwordOfAzeroth");
    await s.socialSystem.friendRequestSent(3, 1);
    await s.socialSystem.friendRequestAccepted(1, 3);
    await s.drain();

    expect(s.client.delivered.map((n) => [n.userId, n.category, n.message])).toEqual([
      [1, "GAME", "Congratulations! You've reached level 15!"],
      [2, "GAME", "You've acquired the legendary Sword of Azeroth!"],
      [1, "SOCIAL", "Player 'Cara' has sent you a friend request."],
      [3, "SOCIAL", "Player 'Alice' accepted your friend request."],
    ]);
  });

  it("respects preferences and keeps an inbox per player", async () => {
    const s = system();
    await s.preferences.update(1, { SOCIAL: false });
    await s.socialSystem.friendRequestSent(3, 1);
    await s.socialSystem.playerFollowed(2, 1);
    await s.gameEngine.playerLeveledUp(1, 20);
    await s.drain();

    expect(s.client.delivered.map((n) => n.type)).toEqual(["LEVEL_UP"]);
    expect((await s.repository.listFor(1)).map((n) => n.type)).toEqual(["LEVEL_UP"]);
    expect(await s.repository.listFor(3)).toEqual([]);
  });

  it("throws on unknown players at the call site and stores nothing", async () => {
    const s = system();
    expect(() => s.gameEngine.playerLeveledUp(999, 5)).toThrow(UnknownReferenceError);
    await s.drain();
    expect(s.client.delivered).toEqual([]);
    expect(await s.repository.listFor(999)).toEqual([]);
  });

  it("a hung channel does not block later events for other players", async () => {
    const hung: NotificationChannel = { name: "hung", send: () => new Promise(() => {}) };
    const s = system({ extraChannels: [hung], channelTimeoutMs: 20 });
    await s.gameEngine.playerLeveledUp(1, 2);
    await s.gameEngine.playerLeveledUp(2, 3);
    await s.drain();
    expect(s.client.delivered.map((n) => n.userId)).toEqual([1, 2]);
  });
});
