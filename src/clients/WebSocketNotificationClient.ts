import type { Notification } from "../domain/Notification.js";
import type { PlayerId } from "../domain/types.js";
import type { NotificationClient } from "./NotificationClient.js";

/** Anything that can push a message to a player's live connections (implemented by the WS hub). */
export interface PlayerMessenger {
  sendTo(playerId: PlayerId, message: unknown): number;
}

/**
 * Real-time client: pushes to the player's open sockets. Offline players
 * still have the notification in their inbox (the repository), which is
 * replayed when they connect.
 */
export class WebSocketNotificationClient implements NotificationClient {
  constructor(private readonly messenger: PlayerMessenger) {}

  deliver(n: Notification): void {
    this.messenger.sendTo(n.userId, { type: "notification", data: n.toJSON() });
  }
}
