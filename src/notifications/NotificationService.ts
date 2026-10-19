import type { NotificationChannel } from "../channels/NotificationChannel.js";
import type { NotificationCategory } from "../domain/categories.js";
import type { DomainEvent } from "../domain/events.js";
import type { Notification, NotificationType } from "../domain/Notification.js";
import type { PlayerId } from "../domain/types.js";
import type { EventBus } from "../events/EventBus.js";
import type { Logger } from "../logger.js";
import type { PreferenceStore } from "../preferences/PreferenceStore.js";
import type { NotificationFactory } from "./NotificationFactory.js";
import type { NotificationRepository } from "./NotificationRepository.js";

export interface SuppressedNotification {
  readonly userId: PlayerId;
  readonly type: NotificationType;
  readonly category: NotificationCategory;
  readonly reason: "PREFERENCE_DISABLED";
}

export interface DispatchResult {
  readonly event: DomainEvent;
  readonly sent: Notification[];
  readonly suppressed: SuppressedNotification[];
}

/**
 * Orchestrates the pipeline for each event:
 * create → check preferences → persist → fan out to channels.
 * It is generic over event types. All event-specific knowledge lives in formatters.
 */
export class NotificationService {
  readonly #dispatchListeners = new Set<(result: DispatchResult) => void>();

  constructor(
    private readonly factory: NotificationFactory,
    private readonly preferences: PreferenceStore,
    private readonly repository: NotificationRepository,
    private readonly channels: readonly NotificationChannel[],
    private readonly logger: Logger,
  ) {}

  /** Subscribe to every event on the bus. Returns the unsubscribe function. */
  listenTo(bus: EventBus): () => void {
    return bus.subscribeAll((event) => this.handle(event).then(() => undefined));
  }

  /** Observe the outcome of every handled event (demo output, metrics, tests). */
  onDispatch(listener: (result: DispatchResult) => void): () => void {
    this.#dispatchListeners.add(listener);
    return () => this.#dispatchListeners.delete(listener);
  }

  async handle(event: DomainEvent): Promise<DispatchResult> {
    const sent: Notification[] = [];
    const suppressed: SuppressedNotification[] = [];

    for (const notification of this.factory.create(event)) {
      const { userId, type, category } = notification;

      if (!this.preferences.isEnabled(userId, category)) {
        suppressed.push({ userId, type, category, reason: "PREFERENCE_DISABLED" });
        this.logger.info("Notification suppressed by preference", { userId, type, category });
        continue;
      }

      this.repository.save(notification);
      await this.#sendToChannels(notification);
      sent.push(notification);
    }

    if (sent.length === 0 && suppressed.length === 0) {
      this.logger.info("Event produced no notifications", { eventType: event.type });
    }
    const result: DispatchResult = { event, sent, suppressed };
    this.#dispatchListeners.forEach((listener) => listener(result));
    return result;
  }

  async #sendToChannels(notification: Notification): Promise<void> {
    const results = await Promise.allSettled(this.channels.map((c) => c.send(notification)));
    results.forEach((result, i) => {
      if (result.status === "rejected") {
        // Isolate failures: one broken channel must not block the others.
        this.logger.error("Channel delivery failed", {
          channel: this.channels[i]?.name,
          notificationId: notification.id,
          userId: notification.userId,
          error: result.reason instanceof Error ? result.reason.message : String(result.reason),
        });
      }
    });
  }
}
