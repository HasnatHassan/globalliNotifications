import type { PlayerId } from "../domain/types.js";
import { publishEvent, type ProducerDeps } from "./publishEvent.js";

/** Simulated social system. Validates input and publishes social domain events only. */
export class SocialSystem {
  constructor(private readonly deps: ProducerDeps) {}

  /** `fromPlayerId` sent a friend request to `toPlayerId`. */
  friendRequestSent(fromPlayerId: PlayerId, toPlayerId: PlayerId): Promise<void> {
    return publishEvent(this.deps, { type: "FRIEND_REQUEST_SENT", fromPlayerId, toPlayerId });
  }

  /** `accepterId` accepted the friend request previously sent by `requesterId`. */
  friendRequestAccepted(accepterId: PlayerId, requesterId: PlayerId): Promise<void> {
    return publishEvent(this.deps, { type: "FRIEND_REQUEST_ACCEPTED", accepterId, requesterId });
  }

  /** `followerId` started following `followedId`. */
  playerFollowed(followerId: PlayerId, followedId: PlayerId): Promise<void> {
    return publishEvent(this.deps, { type: "NEW_FOLLOWER", followerId, followedId });
  }
}
