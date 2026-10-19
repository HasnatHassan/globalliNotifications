import type { Notification } from "../domain/Notification.js";

/**
 * What the delivery mechanism reports back:
 * - "delivered": handed to at least one live client
 * - "recipient-offline": accepted, but the player has no live connection
 *   (they get it from the inbox replay on their next connect)
 */
export type DeliveryStatus = "delivered" | "recipient-offline";

/**
 * Port for the external mechanism that delivers notifications to the game
 * client. The brief puts this out of scope, so we provide mock adapters.
 * Throwing or rejecting means the delivery attempt failed.
 */
export interface NotificationClient {
  deliver(notification: Notification): DeliveryStatus | Promise<DeliveryStatus>;
}
