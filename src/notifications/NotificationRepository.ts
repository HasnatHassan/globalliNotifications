import type { Notification } from "../domain/Notification.js";
import type { PlayerId } from "../domain/types.js";

/** Port: per-player inbox, used for history and offline catch-up. */
export interface NotificationRepository {
  save(notification: Notification): void;
  /** Newest first. */
  listFor(playerId: PlayerId, limit?: number): Notification[];
  markAsRead(playerId: PlayerId, notificationId: string): boolean;
}

export class InMemoryNotificationRepository implements NotificationRepository {
  readonly #inbox = new Map<PlayerId, Notification[]>();

  constructor(private readonly maxPerPlayer = 100) {}

  save(notification: Notification): void {
    const list = this.#inbox.get(notification.userId) ?? [];
    list.push(notification);
    // Bound memory per player; oldest notifications fall off first.
    if (list.length > this.maxPerPlayer) list.splice(0, list.length - this.maxPerPlayer);
    this.#inbox.set(notification.userId, list);
  }

  listFor(playerId: PlayerId, limit = 50): Notification[] {
    return (this.#inbox.get(playerId) ?? []).slice(-limit).reverse();
  }

  markAsRead(playerId: PlayerId, notificationId: string): boolean {
    const n = this.#inbox.get(playerId)?.find((x) => x.id === notificationId);
    if (!n) return false;
    n.markAsRead();
    return true;
  }
}
