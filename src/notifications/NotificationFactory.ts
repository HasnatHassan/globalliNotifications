import type { DomainEvent, EventOfType, EventType } from "../domain/events.js";
import { Notification } from "../domain/Notification.js";
import {
  challengeCompletedFormatter,
  itemAcquiredFormatter,
  levelUpFormatter,
  playerAttackedFormatter,
  playerDefeatedFormatter,
} from "./formatters/gameFormatters.js";
import type { FormatterContext, NotificationFormatter } from "./formatters/NotificationFormatter.js";
import {
  friendAcceptedFormatter,
  friendRequestFormatter,
  newFollowerFormatter,
} from "./formatters/socialFormatters.js";

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
        new Notification(
          {
            userId: draft.recipientId,
            type: draft.type,
            category: formatter.category,
            title: draft.title,
            message: draft.message,
            ...(draft.metadata ? { metadata: draft.metadata } : {}),
          },
          undefined,
          event.occurredAt,
        ),
    );
  }
}
