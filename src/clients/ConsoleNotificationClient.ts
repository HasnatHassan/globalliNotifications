import type { Notification } from "../domain/Notification.js";
import type { NotificationClient } from "./NotificationClient.js";

/** Mock client that "displays" notifications by printing them. */
export class ConsoleNotificationClient implements NotificationClient {
  constructor(
    private readonly nameOf: (playerId: number) => string = (id) => `#${id}`,
    private readonly write: (line: string) => void = console.log,
  ) {}

  deliver(n: Notification): void {
    this.write(`  📨 → ${this.nameOf(n.userId)} (#${n.userId}) [${n.category}/${n.type}] ${n.message}`);
  }
}
