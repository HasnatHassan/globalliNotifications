import type { DomainEvent, EventOfType, EventType } from "../domain/events.js";
import { Notification } from "../domain/Notification.js";
import { challengeCompletedFormatter } from "./formatters/challengeCompleted.js";
import { friendAcceptedFormatter } from "./formatters/friendAccepted.js";
import { friendRequestFormatter } from "./formatters/friendRequest.js";
import { itemAcquiredFormatter } from "./formatters/itemAcquired.js";
import { levelUpFormatter } from "./formatters/levelUp.js";
import { newFollowerFormatter } from "./formatters/newFollower.js";
import type { FormatterContext, NotificationFormatter } from "./formatters/NotificationFormatter.js";
import { playerAttackedFormatter } from "./formatters/playerAttacked.js";
import { playerDefeatedFormatter } from "./formatters/playerDefeated.js";

/** One formatter per event type. A missing entry is a compile error. */
export type FormatterRegistry = { [K in EventType]: NotificationFormatter<EventOfType<K>> };

export const DEFAULT_FORMATTERS: FormatterRegistry = {
  PLAYER_LEVELED_UP: levelUpFormatter,
  ITEM_ACQUIRED: itemAcquiredFormatter,
  CHALLENGE_COMPLETED: challengeCompletedFormatter,
  PLAYER_ATTACKED: playerAttackedFormatter,
  PLAYER_DEFEATED: playerDefeatedFormatter,
  FRIEND_REQUEST_SENT: friendRequestFormatter,
  FRIEND_REQUEST_ACCEPTED: friendAcceptedFormatter,
  NEW_FOLLOWER: newFollowerFormatter,
};

/** Turns a domain event into zero or more Notification objects. */
export class NotificationFactory {
  constructor(
    private readonly ctx: FormatterContext,
    private readonly formatters: FormatterRegistry = DEFAULT_FORMATTERS,
  ) {}

  create(event: DomainEvent): Notification[] {
    // TS cannot correlate event.type with the mapped registry entry,
    // so widen once here. The registry type guarantees they match.
    const formatter = this.formatters[event.type] as NotificationFormatter<DomainEvent>;
    return formatter.format(event, this.ctx).map(
      (draft) =>
        new Notification({
          // Deterministic id: a redelivered event maps to the same notification,
          // which lets the repository reject the duplicate.
          id: `${event.id}:${draft.type}:${draft.recipientId}`,
          userId: draft.recipientId,
          type: draft.type,
          category: formatter.category,
          title: draft.title,
          message: draft.message,
          createdAt: event.occurredAt,
          ...(draft.metadata ? { metadata: draft.metadata } : {}),
        }),
    );
  }
}
