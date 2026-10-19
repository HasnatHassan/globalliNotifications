import type { Notification } from "../domain/Notification.js";
import type { PlayerId } from "../domain/types.js";

/** Maximum notifications kept per player. History replay and unread counts cover exactly this window. */
export const INBOX_CAPACITY = 100;

/** How many recent notification ids the in-memory adapter remembers for duplicate detection (all players). */
export const DEDUPE_WINDOW = 10_000;

/**
 * Port: per-player inbox, used for history and offline catch-up.
 * Async so a database-backed adapter can implement it unchanged.
 * Stored notifications are immutable; read state changes replace them.
 */
export interface NotificationRepository {
  readonly capacity: number;
  /**
   * Stores the notification. Resolves false if the same id was already saved
   * (idempotent). Adapters define how far back that check reaches: the
   * in-memory one remembers the last DEDUPE_WINDOW ids, independent of inbox
   * eviction; a database would use a unique constraint.
   */
  save(notification: Notification): Promise<boolean>;
  /** Newest first, at most `limit` (default: the whole inbox, i.e. `capacity`). */
  listFor(playerId: PlayerId, limit?: number): Promise<Notification[]>;
  /** The updated notification, or undefined if the player has no notification with that id. */
  setRead(playerId: PlayerId, notificationId: string, read: boolean): Promise<Notification | undefined>;
  /** Marks the player's whole inbox as read and resolves how many changed. */
  markAllAsRead(playerId: PlayerId): Promise<number>;
  unreadCount(playerId: PlayerId): Promise<number>;
}

/**
 * Bounded FIFO inbox: when a player exceeds `capacity`, the oldest
 * notifications are dropped, read or not. Listing, replay and unread counts
 * all cover the same window, so they always agree. Duplicate detection keeps
 * its own, larger window so an evicted notification cannot be re-created by
 * a redelivered event.
 */
export class InMemoryNotificationRepository implements NotificationRepository {
  /** Oldest first. */
  readonly #inbox = new Map<PlayerId, Notification[]>();
  readonly #seen = new Set<string>();
  /** Insertion order of #seen, oldest first, to forget ids beyond the window. */
  readonly #seenOrder: string[] = [];

  constructor(
    readonly capacity: number = INBOX_CAPACITY,
    readonly dedupeWindow: number = DEDUPE_WINDOW,
  ) {
    if (!Number.isInteger(capacity) || capacity < 1) throw new RangeError("capacity must be a positive integer");
    if (!Number.isInteger(dedupeWindow) || dedupeWindow < capacity) {
      throw new RangeError("dedupeWindow must be an integer >= capacity");
    }
  }

  async save(notification: Notification): Promise<boolean> {
    if (this.#seen.has(notification.id)) return false;
    this.#remember(notification.id);
    const list = this.#inbox.get(notification.userId) ?? [];
    list.push(notification);
    if (list.length > this.capacity) list.splice(0, list.length - this.capacity);
    this.#inbox.set(notification.userId, list);
    return true;
  }

  async listFor(playerId: PlayerId, limit: number = this.capacity): Promise<Notification[]> {
    if (!(limit > 0)) return [];
    return (this.#inbox.get(playerId) ?? []).slice(-Math.floor(limit)).reverse();
  }

  async setRead(playerId: PlayerId, notificationId: string, read: boolean): Promise<Notification | undefined> {
    const list = this.#inbox.get(playerId);
    const index = list?.findIndex((n) => n.id === notificationId) ?? -1;
    if (!list || index < 0) return undefined;
    const updated = list[index]!.withReadState(read);
    list[index] = updated;
    return updated;
  }

  async markAllAsRead(playerId: PlayerId): Promise<number> {
    const list = this.#inbox.get(playerId) ?? [];
    let changed = 0;
    list.forEach((n, i) => {
      if (!n.read) {
        list[i] = n.withReadState(true);
        changed++;
      }
    });
    return changed;
  }

  async unreadCount(playerId: PlayerId): Promise<number> {
    return (this.#inbox.get(playerId) ?? []).filter((n) => !n.read).length;
  }

  #remember(id: string): void {
    this.#seen.add(id);
    this.#seenOrder.push(id);
    if (this.#seenOrder.length > this.dedupeWindow) this.#seen.delete(this.#seenOrder.shift()!);
  }
}
