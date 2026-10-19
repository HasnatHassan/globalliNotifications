import type { Notification } from "../domain/Notification.js";

/**
 * Port for the external mechanism that delivers notifications to the game
 * client. The brief puts this out of scope, so we provide mock adapters.
 */
export interface NotificationClient {
  deliver(notification: Notification): void | Promise<void>;
}
