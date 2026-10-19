import type { NotificationChannel } from "../channels/NotificationChannel.js";
import type { DeliveryStatus } from "../clients/NotificationClient.js";
import type { NotificationCategory } from "../domain/categories.js";
import { findUnknownReferences, type ReferenceLookups, type UnknownReferences } from "../domain/eventSchemas.js";
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

export interface FailedNotification {
  readonly notificationId: string;
  readonly userId: PlayerId;
  readonly type: NotificationType;
  readonly error: string;
}

/** Outcome of one event. Every notification the event produced lands in exactly one list. */
export interface DispatchResult {
  readonly event: DomainEvent;
  /** Stored, and delivered to a live client by at least one channel. */
  readonly sent: Notification[];
  /** Stored and accepted, but the player has no live connection: replayed from the inbox on connect. */
  readonly offline: Notification[];
  /** Stored, but every channel failed or timed out. Still replayed from the inbox on connect. */
  readonly undelivered: Notification[];
  /** Not stored or sent: the player disabled the category. */
  readonly suppressed: SuppressedNotification[];
  /** Already saved before (the same event was delivered again). Skipped. */
  readonly duplicates: Notification[];
  /** Processing this notification threw (e.g. the preference store or inbox failed). Others were unaffected. */
  readonly failed: FailedNotification[];
  /** Set when the whole event was refused before any notification was built. */
  readonly rejected?: { readonly reason: "UNKNOWN_REFERENCE" } & UnknownReferences;
}

export type DispatchListener = (result: DispatchResult) => void;

export interface NotificationServiceOptions {
  /** Upper bound for one channel send. A hung channel counts as failed instead of stalling the pipeline. */
  readonly channelTimeoutMs?: number;
}

export const DEFAULT_CHANNEL_TIMEOUT_MS = 5_000;

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

class ChannelTimeoutError extends Error {
  constructor(channel: string, ms: number) {
    super(`${channel} did not respond within ${ms}ms`);
  }
}

/** Races a send against a timer; the timer never keeps the process alive. */
function withTimeout<T>(work: Promise<T>, ms: number, channel: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new ChannelTimeoutError(channel, ms)), ms);
    timer.unref();
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Orchestrates the pipeline for each event:
 * check references → create → per notification: check preferences → persist → fan out.
 * It is generic over event types. All event-specific knowledge lives in formatters.
 */
export class NotificationService {
  readonly #listeners = new Set<DispatchListener>();
  readonly #channelTimeoutMs: number;

  constructor(
    private readonly factory: NotificationFactory,
    private readonly references: ReferenceLookups,
    private readonly preferences: PreferenceStore,
    private readonly repository: NotificationRepository,
    private readonly channels: readonly NotificationChannel[],
    private readonly logger: Logger,
    options: NotificationServiceOptions = {},
  ) {
    this.#channelTimeoutMs = options.channelTimeoutMs ?? DEFAULT_CHANNEL_TIMEOUT_MS;
  }

  /** Subscribe to every event on the bus. Returns the unsubscribe function. */
  listenTo(bus: EventBus): () => void {
    return bus.subscribeAll(async (event) => {
      await this.handle(event);
    });
  }

  /** Observe the outcome of every handled event (metrics, the demo activity feed, tests). */
  onDispatch(listener: DispatchListener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  async handle(event: DomainEvent): Promise<DispatchResult> {
    const result = {
      event,
      sent: [] as Notification[],
      offline: [] as Notification[],
      undelivered: [] as Notification[],
      suppressed: [] as SuppressedNotification[],
      duplicates: [] as Notification[],
      failed: [] as FailedNotification[],
    };

    // Same rule the producers enforce; repeated here because the bus may carry
    // events from publishers other than our producers.
    const unknown = findUnknownReferences(event, this.references);
    if (unknown) {
      this.logger.warn("Event rejected: unknown reference", { eventId: event.id, eventType: event.type, ...unknown });
      return this.#finish({ ...result, rejected: { reason: "UNKNOWN_REFERENCE", ...unknown } });
    }

    for (const notification of this.factory.create(event)) {
      // Isolated per notification: one recipient's failure must not cost the others theirs.
      try {
        await this.#process(notification, result);
      } catch (e) {
        const { id: notificationId, userId, type } = notification;
        result.failed.push({ notificationId, userId, type, error: errorMessage(e) });
        this.logger.error("Notification processing failed", { eventId: event.id, notificationId, userId, error: errorMessage(e) });
      }
    }

    return this.#finish(result);
  }

  async #process(notification: Notification, result: Omit<DispatchResult, "event" | "rejected">): Promise<void> {
    const { userId, type, category } = notification;

    if (!(await this.preferences.isEnabled(userId, category))) {
      result.suppressed.push({ userId, type, category, reason: "PREFERENCE_DISABLED" });
      this.logger.info("Notification suppressed by preference", { userId, type, category });
      return;
    }

    if (!(await this.repository.save(notification))) {
      result.duplicates.push(notification);
      this.logger.info("Duplicate event ignored", { notificationId: notification.id });
      return;
    }

    const statuses = await this.#sendToChannels(notification);
    if (statuses.includes("delivered")) result.sent.push(notification);
    else if (statuses.includes("recipient-offline")) result.offline.push(notification);
    else result.undelivered.push(notification);
  }

  /** Statuses of the channels that succeeded. Never rejects; failures and timeouts are logged. */
  async #sendToChannels(notification: Notification): Promise<DeliveryStatus[]> {
    // The `async` wrapper turns a synchronous throw into a rejection, so one
    // broken channel can never skip the others; the timeout bounds a hung one.
    const results = await Promise.allSettled(
      this.channels.map((channel) =>
        withTimeout((async () => channel.send(notification))(), this.#channelTimeoutMs, channel.name),
      ),
    );
    const statuses: DeliveryStatus[] = [];
    results.forEach((r, i) => {
      if (r.status === "fulfilled") {
        statuses.push(r.value);
        return;
      }
      this.logger.error("Channel delivery failed", {
        channel: this.channels[i]?.name,
        notificationId: notification.id,
        userId: notification.userId,
        error: errorMessage(r.reason),
      });
    });
    return statuses;
  }

  #finish(result: DispatchResult): DispatchResult {
    const handled =
      result.sent.length + result.offline.length + result.undelivered.length + result.suppressed.length +
      result.duplicates.length + result.failed.length;
    if (handled === 0 && !result.rejected) {
      this.logger.info("Event produced no notifications", { eventType: result.event.type });
    }
    for (const listener of this.#listeners) {
      try {
        listener(result);
      } catch (e) {
        // Observers must not affect delivery or each other.
        this.logger.error("Dispatch listener failed", { eventId: result.event.id, error: errorMessage(e) });
      }
    }
    return result;
  }
}
