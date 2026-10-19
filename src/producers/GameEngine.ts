import type { PlayerId } from "../domain/types.js";
import { publishEvent, type ProducerDeps } from "./publishEvent.js";

/**
 * Simulated game engine. Real gameplay code would call these methods.
 * It validates its input and publishes domain events; it knows nothing about
 * notifications. Every method throws synchronously (InvalidEventError or
 * UnknownReferenceError) on bad input and publishes nothing; the returned
 * promise resolves once the event is accepted by the bus.
 */
export class GameEngine {
  constructor(private readonly deps: ProducerDeps) {}

  playerLeveledUp(playerId: PlayerId, newLevel: number): Promise<void> {
    return publishEvent(this.deps, { type: "PLAYER_LEVELED_UP", playerId, newLevel });
  }

  itemAcquired(playerId: PlayerId, itemId: string): Promise<void> {
    return publishEvent(this.deps, { type: "ITEM_ACQUIRED", playerId, itemId });
  }

  challengeCompleted(playerId: PlayerId, challengeName: string): Promise<void> {
    return publishEvent(this.deps, { type: "CHALLENGE_COMPLETED", playerId, challengeName });
  }

  playerAttacked(attackerId: PlayerId, victimId: PlayerId): Promise<void> {
    return publishEvent(this.deps, { type: "PLAYER_ATTACKED", attackerId, victimId });
  }

  playerDefeated(winnerId: PlayerId, loserId: PlayerId): Promise<void> {
    return publishEvent(this.deps, { type: "PLAYER_DEFEATED", winnerId, loserId });
  }
}
