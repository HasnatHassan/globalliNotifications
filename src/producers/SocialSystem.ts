import type { PlayerId } from "../domain/types.js";
import type { EventBus } from "../events/EventBus.js";

/** Simulated social system. It publishes social domain events only. */
export class SocialSystem {
  constructor(
    private readonly bus: EventBus,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** `fromPlayerId` sent a friend request to `toPlayerId`. */
  friendRequestSent(fromPlayerId: PlayerId, toPlayerId: PlayerId): Promise<void> {
    return this.bus.publish({ type: "FRIEND_REQUEST_SENT", fromPlayerId, toPlayerId, occurredAt: this.now() });
  }

  /** `accepterId` accepted the friend request previously sent by `requesterId`. */
  friendRequestAccepted(accepterId: PlayerId, requesterId: PlayerId): Promise<void> {
    return this.bus.publish({ type: "FRIEND_REQUEST_ACCEPTED", accepterId, requesterId, occurredAt: this.now() });
  }

  /** `followerId` started following `followedId`. */
  playerFollowed(followerId: PlayerId, followedId: PlayerId): Promise<void> {
    return this.bus.publish({ type: "NEW_FOLLOWER", followerId, followedId, occurredAt: this.now() });
  }
}
