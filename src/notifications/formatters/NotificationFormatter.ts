import type { ItemLookup } from "../../catalog/ItemCatalog.js";
import type { PlayerLookup } from "../../catalog/PlayerDirectory.js";
import type { NotificationCategory } from "../../domain/categories.js";
import type { DomainEvent } from "../../domain/events.js";
import type { NotificationMetadata, NotificationType } from "../../domain/Notification.js";
import type { PlayerId } from "../../domain/types.js";

/** Lookups formatters may use to build human-readable messages. */
export interface FormatterContext {
  readonly players: PlayerLookup;
  readonly items: ItemLookup;
}

/** What a formatter produces: who gets notified and what they read. */
export interface NotificationDraft {
  readonly recipientId: PlayerId;
  readonly type: NotificationType;
  readonly title: string;
  readonly message: string;
  readonly metadata?: NotificationMetadata;
}

/**
 * Strategy for a single event type. Formatters are the only place that knows
 * wording, category and recipient rules. Returning [] means "do not notify".
 * Formatters may assume every referenced player exists (the service checks).
 */
export interface NotificationFormatter<E extends DomainEvent> {
  readonly category: NotificationCategory;
  format(event: E, ctx: FormatterContext): NotificationDraft[];
}
