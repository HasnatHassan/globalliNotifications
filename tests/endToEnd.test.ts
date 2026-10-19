import { describe, expect, it } from "vitest";
import { RecordingNotificationClient } from "../src/clients/RecordingNotificationClient.js";
import { createNotificationSystem } from "../src/composition.js";
import { silentLogger } from "../src/logger.js";

describe("end to end through the composition root", () => {
  it("handles the brief's example triggers", async () => {
    const client = new RecordingNotificationClient();
    const { gameEngine, socialSystem } = createNotificationSystem({ client, logger: silentLogger });

    await gameEngine.playerLeveledUp(1, 15);
    await gameEngine.itemAcquired(2, "SwordOfAzeroth");
    await socialSystem.friendRequestSent(3, 1);
    await socialSystem.friendRequestAccepted(1, 3);

    expect(client.delivered.map((n) => [n.userId, n.category, n.message])).toEqual([
      [1, "GAME", "Congratulations! You've reached level 15!"],
      [2, "GAME", "You've acquired the legendary Sword of Azeroth!"],
      [1, "SOCIAL", "Player 'Cara' has sent you a friend request."],
      [3, "SOCIAL", "Player 'Alice' accepted your friend request."],
    ]);
  });

  it("respects preferences and keeps an inbox per player", async () => {
    const client = new RecordingNotificationClient();
    const { gameEngine, socialSystem, preferences, repository } = createNotificationSystem({ client, logger: silentLogger });

    preferences.update(1, { SOCIAL: false });
    await socialSystem.friendRequestSent(3, 1);
    await socialSystem.playerFollowed(2, 1);
    await gameEngine.playerLeveledUp(1, 20);

    expect(client.delivered.map((n) => n.type)).toEqual(["LEVEL_UP"]);
    expect(repository.listFor(1).map((n) => n.type)).toEqual(["LEVEL_UP"]);
    expect(repository.listFor(3)).toEqual([]);
  });
});
