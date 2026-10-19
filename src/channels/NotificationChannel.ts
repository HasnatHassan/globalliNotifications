import type { DeliveryStatus } from "../clients/NotificationClient.js";
import type { Notification } from "../domain/Notification.js";

/**
 * Port: a delivery channel (in-app today; push, email or SMS later).
 * Resolves with what happened; throwing or rejecting means the attempt failed.
 * The service isolates failures and applies a timeout to every send.
 */
export interface NotificationChannel {
  readonly name: string;
  send(notification: Notification): Promise<DeliveryStatus>;
}
