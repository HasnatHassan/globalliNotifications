import type { PlayerId } from "./types.js";

/**
 * Domain events emitted by different parts of the game platform.
 * Producers publish these; they know nothing about notifications.
 * `type` is the discriminant, so `switch`/`Record` lookups are exhaustive.
 */
interface BaseEvent {
  /** Unique per occurrence. Consumers use it to make redelivery idempotent. */
  readonly id: string;
  readonly occurredAt: Date;
}

export interface PlayerLeveledUpEvent extends BaseEvent {
  readonly type: "PLAYER_LEVELED_UP";
  readonly playerId: PlayerId;
  readonly newLevel: number;
}

export interface ItemAcquiredEvent extends BaseEvent {
  readonly type: "ITEM_ACQUIRED";
  readonly playerId: PlayerId;
  readonly itemId: string;
}

export interface ChallengeCompletedEvent extends BaseEvent {
  readonly type: "CHALLENGE_COMPLETED";
  readonly playerId: PlayerId;
  readonly challengeName: string;
}

export interface PlayerAttackedEvent extends BaseEvent {
  readonly type: "PLAYER_ATTACKED";
  readonly attackerId: PlayerId;
  readonly victimId: PlayerId;
}

export interface PlayerDefeatedEvent extends BaseEvent {
  readonly type: "PLAYER_DEFEATED";
  readonly winnerId: PlayerId;
  readonly loserId: PlayerId;
}

export interface FriendRequestSentEvent extends BaseEvent {
  readonly type: "FRIEND_REQUEST_SENT";
  readonly fromPlayerId: PlayerId;
  readonly toPlayerId: PlayerId;
}

export interface FriendRequestAcceptedEvent extends BaseEvent {
  readonly type: "FRIEND_REQUEST_ACCEPTED";
  /** The player who accepted the request. */
  readonly accepterId: PlayerId;
  /** The player who originally sent the request (the one notified). */
  readonly requesterId: PlayerId;
}

export interface NewFollowerEvent extends BaseEvent {
  readonly type: "NEW_FOLLOWER";
  readonly followerId: PlayerId;
  readonly followedId: PlayerId;
}

export type DomainEvent =
  | PlayerLeveledUpEvent
  | ItemAcquiredEvent
  | ChallengeCompletedEvent
  | PlayerAttackedEvent
  | PlayerDefeatedEvent
  | FriendRequestSentEvent
  | FriendRequestAcceptedEvent
  | NewFollowerEvent;

export type EventType = DomainEvent["type"];

export type EventOfType<T extends EventType> = Extract<DomainEvent, { type: T }>;

/** What a producer supplies; `id` and `occurredAt` are stamped on publish. */
export type EventPayload<T extends EventType> = Omit<EventOfType<T>, "id" | "occurredAt">;

/** Discriminated union of every payload, so `switch (payload.type)` narrows. */
export type AnyEventPayload = { [K in EventType]: EventPayload<K> }[EventType];
