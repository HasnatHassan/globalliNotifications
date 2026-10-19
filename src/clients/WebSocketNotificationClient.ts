import type { Notification } from "../domain/Notification.js";
import type { PlayerId } from "../domain/types.js";
import type { DeliveryStatus, NotificationClient } from "./NotificationClient.js";

/** Anything that can push a message to a player's live connections (implemented by the WS hub). */
export interface PlayerMessenger {
  /**
   * Sends to every connection of the player and returns how many there were.
   * `dedupeKey` lets a connection that is still receiving its inbox replay
   * skip a message the replay already contains.
   */
  sendTo(playerId: PlayerId, message: unknown, dedupeKey?: string): number;
}

/**
 * Real-time client: pushes to the player's open sockets. Offline players
 * still have the notification in their inbox, which is replayed on connect.
 */
export class WebSocketNotificationClient implements NotificationClient {
  constructor(private readonly messenger: PlayerMessenger) {}

  deliver(n: Notification): DeliveryStatus {
    const connections = this.messenger.sendTo(n.userId, { type: "notification", data: n.toJSON() }, n.id);
    return connections > 0 ? "delivered" : "recipient-offline";
  }
}
