import type { Notification } from "../domain/Notification.js";

/**
 * Port: a delivery channel (in-app today; push, email or SMS later).
 * Channels may reject. The service isolates and logs those failures.
 */
export interface NotificationChannel {
  readonly name: string;
  send(notification: Notification): Promise<void>;
}
