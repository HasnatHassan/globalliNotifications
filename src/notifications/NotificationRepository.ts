import type { Notification } from "../domain/Notification.js";
import type { PlayerId } from "../domain/types.js";

/** Port: per-player inbox, used for history and offline catch-up. */
export interface NotificationRepository {
  save(notification: Notification): void;
  /** Newest first. */
  listFor(playerId: PlayerId, limit?: number): Notification[];
  /** Returns the updated notification, or undefined if the player has no such notification. */
  setRead(playerId: PlayerId, notificationId: string, read: boolean): Notification | undefined;
  /** Marks every notification in the player's inbox as read and returns how many changed. */
  markAllAsRead(playerId: PlayerId): number;
  unreadCount(playerId: PlayerId): number;
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

  setRead(playerId: PlayerId, notificationId: string, read: boolean): Notification | undefined {
    const n = this.#inbox.get(playerId)?.find((x) => x.id === notificationId);
    if (!n) return undefined;
    if (read) n.markAsRead();
    else n.markAsUnread();
    return n;
  }

  markAllAsRead(playerId: PlayerId): number {
    const unread = (this.#inbox.get(playerId) ?? []).filter((n) => !n.read);
    unread.forEach((n) => n.markAsRead());
    return unread.length;
  }

  unreadCount(playerId: PlayerId): number {
    return (this.#inbox.get(playerId) ?? []).filter((n) => !n.read).length;
  }
}
