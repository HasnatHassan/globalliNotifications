import type { PlayerId } from "../domain/types.js";
import type { EventBus } from "../events/EventBus.js";

/**
 * Simulated game engine. Real gameplay code would call these methods.
 * It only publishes domain events and has no knowledge of notifications.
 */
export class GameEngine {
  constructor(
    private readonly bus: EventBus,
    private readonly now: () => Date = () => new Date(),
  ) {}

  playerLeveledUp(playerId: PlayerId, newLevel: number): Promise<void> {
    return this.bus.publish({ type: "PLAYER_LEVELED_UP", playerId, newLevel, occurredAt: this.now() });
  }

  itemAcquired(playerId: PlayerId, itemId: string): Promise<void> {
    return this.bus.publish({ type: "ITEM_ACQUIRED", playerId, itemId, occurredAt: this.now() });
  }

  challengeCompleted(playerId: PlayerId, challengeName: string): Promise<void> {
    return this.bus.publish({ type: "CHALLENGE_COMPLETED", playerId, challengeName, occurredAt: this.now() });
  }

  playerAttacked(attackerId: PlayerId, victimId: PlayerId): Promise<void> {
    return this.bus.publish({ type: "PLAYER_ATTACKED", attackerId, victimId, occurredAt: this.now() });
  }

  playerDefeated(winnerId: PlayerId, loserId: PlayerId): Promise<void> {
    return this.bus.publish({ type: "PLAYER_DEFEATED", winnerId, loserId, occurredAt: this.now() });
  }
}
