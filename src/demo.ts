/**
 * CLI walkthrough: simulates different parts of the platform triggering events
 * and shows how the notification system responds.  Run: npm run build && npm run demo
 */
import { PlayerDirectory, SEED_PLAYERS } from "./catalog/PlayerDirectory.js";
import { ConsoleNotificationClient } from "./clients/ConsoleNotificationClient.js";
import { createNotificationSystem } from "./composition.js";
import { silentLogger } from "./logger.js";

// The console client stands in for the game client, which knows its own players' names.
const clientDirectory = new PlayerDirectory(SEED_PLAYERS);
const { gameEngine, socialSystem, preferences, repository, service, players } = createNotificationSystem({
  client: new ConsoleNotificationClient((id) => clientDirectory.nameOf(id)),
  logger: silentLogger,
});

service.onDispatch(({ event, sent, suppressed }) => {
  for (const s of suppressed) {
    console.log(`  🔕 suppressed for ${players.nameOf(s.userId)} (#${s.userId}): ${s.category} notifications disabled`);
  }
  if (sent.length === 0 && suppressed.length === 0) {
    console.log(`  ∅  ${event.type} produced no notification`);
  }
});

function step(title: string): void {
  console.log(`\n▶ ${title}`);
}

console.log("Players:", players.list().map((p) => `${p.id}=${p.name}`).join(", "));

console.log("\n=== Example triggers from the brief ===");
step("gameEngine.playerLeveledUp(1, 15)  // User 1 leveled up to 15");
await gameEngine.playerLeveledUp(1, 15);

step('gameEngine.itemAcquired(2, "SwordOfAzeroth")  // User 2 acquired an item');
await gameEngine.itemAcquired(2, "SwordOfAzeroth");

step("socialSystem.friendRequestSent(3, 1)  // User 3 sent a friend request to user 1");
await socialSystem.friendRequestSent(3, 1);

step("socialSystem.friendRequestAccepted(1, 3)  // User 1 accepted friend request from 3");
await socialSystem.friendRequestAccepted(1, 3);

console.log("\n=== Additional events ===");
step('gameEngine.challengeCompleted(4, "Dragon Slayer")');
await gameEngine.challengeCompleted(4, "Dragon Slayer");

step("gameEngine.playerAttacked(2, 4) then playerDefeated(2, 4)  // PvP");
await gameEngine.playerAttacked(2, 4);
await gameEngine.playerDefeated(2, 4);

step("socialSystem.playerFollowed(2, 1)  // Bob follows Alice");
await socialSystem.playerFollowed(2, 1);

step('gameEngine.itemAcquired(2, "HealthPotion")  // common item → not notified');
await gameEngine.itemAcquired(2, "HealthPotion");

console.log("\n=== User preferences ===");
step("Alice (#1) disables SOCIAL notifications");
preferences.update(1, { SOCIAL: false });
console.log("  prefs(1) =", JSON.stringify(preferences.get(1)));

step("socialSystem.friendRequestSent(4, 1)  // social → suppressed");
await socialSystem.friendRequestSent(4, 1);

step("gameEngine.playerLeveledUp(1, 16)  // game → still delivered");
await gameEngine.playerLeveledUp(1, 16);

console.log("\n=== Inbox for Alice (#1), newest first ===");
for (const n of repository.listFor(1)) {
  console.log(`  • [${n.category}] ${n.message}`);
}
console.log();
