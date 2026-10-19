/**
 * CLI composition root and walkthrough: simulates different parts of the
 * platform triggering events and shows how the notification system responds.
 * Run: npm run build && npm run demo
 */
import { PlayerDirectory, SEED_PLAYERS } from "./catalog/PlayerDirectory.js";
import { ConsoleNotificationClient } from "./clients/ConsoleNotificationClient.js";
import { createNotificationSystem } from "./composition.js";
import { silentLogger } from "./logger.js";

// The console client stands in for the game client, which knows its own players' names.
const clientDirectory = new PlayerDirectory(SEED_PLAYERS);
const system = createNotificationSystem({
  client: new ConsoleNotificationClient((id) => clientDirectory.nameOf(id)),
  logger: silentLogger,
});
const { gameEngine, socialSystem, preferences, repository, players } = system;

system.onDispatch(({ event, sent, suppressed }) => {
  for (const s of suppressed) {
    console.log(`  🔕 suppressed for ${players.nameOf(s.userId)} (#${s.userId}): ${s.category} notifications disabled`);
  }
  if (sent.length + suppressed.length === 0) console.log(`  ∅  ${event.type} produced no notification`);
});

/** Prints a step, runs it, and waits until the notification system has fully processed it. */
async function step(title: string, action: () => Promise<void>): Promise<void> {
  console.log(`\n▶ ${title}`);
  try {
    await action();
  } catch (err) {
    console.log(`  ⛔ rejected by producer: ${err instanceof Error ? err.message : String(err)}`);
  }
  await system.drain();
}

console.log("Players:", players.list().map((p) => `${p.id}=${p.name}`).join(", "));

console.log("\n=== Example triggers from the brief ===");
await step("gameEngine.playerLeveledUp(1, 15)  // User 1 leveled up to 15", () => gameEngine.playerLeveledUp(1, 15));
await step('gameEngine.itemAcquired(2, "SwordOfAzeroth")  // User 2 acquired an item', () =>
  gameEngine.itemAcquired(2, "SwordOfAzeroth"),
);
await step("socialSystem.friendRequestSent(3, 1)  // User 3 sent a friend request to user 1", () =>
  socialSystem.friendRequestSent(3, 1),
);
await step("socialSystem.friendRequestAccepted(1, 3)  // User 1 accepted friend request from 3", () =>
  socialSystem.friendRequestAccepted(1, 3),
);

console.log("\n=== Additional events ===");
await step('gameEngine.challengeCompleted(4, "Dragon Slayer")', () => gameEngine.challengeCompleted(4, "Dragon Slayer"));
await step("gameEngine.playerAttacked(2, 4) then playerDefeated(2, 4)  // PvP", async () => {
  await gameEngine.playerAttacked(2, 4);
  await gameEngine.playerDefeated(2, 4);
});
await step("socialSystem.playerFollowed(2, 1)  // Bob follows Alice", () => socialSystem.playerFollowed(2, 1));
await step('gameEngine.itemAcquired(2, "HealthPotion")  // common item → not notified', () =>
  gameEngine.itemAcquired(2, "HealthPotion"),
);

console.log("\n=== Invalid input is rejected ===");
await step("gameEngine.playerLeveledUp(1, -5)  // invalid level", () => gameEngine.playerLeveledUp(1, -5));
await step("socialSystem.friendRequestSent(77, 1)  // player 77 does not exist", () =>
  socialSystem.friendRequestSent(77, 1),
);
await step('gameEngine.itemAcquired(2, "SwordOfAzerot")  // typo: unknown item', () =>
  gameEngine.itemAcquired(2, "SwordOfAzerot"),
);

console.log("\n=== User preferences ===");
await step("Alice (#1) disables SOCIAL notifications", async () => {
  console.log("  prefs(1) =", JSON.stringify(await preferences.update(1, { SOCIAL: false })));
});
await step("socialSystem.friendRequestSent(4, 1)  // social → suppressed", () => socialSystem.friendRequestSent(4, 1));
await step("gameEngine.playerLeveledUp(1, 16)  // game → still delivered", () => gameEngine.playerLeveledUp(1, 16));

console.log("\n=== Inbox for Alice (#1), newest first ===");
for (const n of await repository.listFor(1)) {
  console.log(`  • [${n.category}] ${n.message}`);
}
console.log();
