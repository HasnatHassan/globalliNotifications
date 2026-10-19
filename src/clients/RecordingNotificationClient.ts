import type { Notification } from "../domain/Notification.js";
import type { NotificationClient } from "./NotificationClient.js";

/** Test double that keeps every delivered notification in memory. */
export class RecordingNotificationClient implements NotificationClient {
  readonly delivered: Notification[] = [];

  deliver(n: Notification): void {
    this.delivered.push(n);
  }

  clear(): void {
    this.delivered.length = 0;
  }
}
