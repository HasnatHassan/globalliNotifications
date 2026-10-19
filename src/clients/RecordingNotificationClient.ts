import type { Notification } from "../domain/Notification.js";
import type { DeliveryStatus, NotificationClient } from "./NotificationClient.js";

/** Test double that keeps every delivered notification in memory. */
export class RecordingNotificationClient implements NotificationClient {
  readonly delivered: Notification[] = [];

  deliver(n: Notification): DeliveryStatus {
    this.delivered.push(n);
    return "delivered";
  }

  clear(): void {
    this.delivered.length = 0;
  }
}
