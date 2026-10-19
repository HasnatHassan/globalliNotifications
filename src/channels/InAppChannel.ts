import type { NotificationClient } from "../clients/NotificationClient.js";
import type { Notification } from "../domain/Notification.js";
import type { NotificationChannel } from "./NotificationChannel.js";

/** In-app channel: hands the notification to the game client's delivery mechanism. */
export class InAppChannel implements NotificationChannel {
  readonly name = "in-app";

  constructor(private readonly client: NotificationClient) {}

  async send(notification: Notification): Promise<void> {
    await this.client.deliver(notification);
  }
}
