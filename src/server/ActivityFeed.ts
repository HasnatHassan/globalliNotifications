import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocket, WebSocketServer } from "ws";
import type { Logger } from "../logger.js";

/**
 * Operator/debug stream of every dispatch outcome (who was notified, what was
 * suppressed). Deliberately separate from player sockets, which only ever see
 * their own notifications. Enabled for the local demo; in production this
 * would sit behind admin authentication or not exist.
 */
export class ActivityFeed {
  readonly #wss = new WebSocketServer({ noServer: true, maxPayload: 1024 });

  constructor(private readonly logger: Logger) {
    this.#wss.on("error", (err) => this.logger.error("Activity feed server error", { error: err.message }));
  }

  handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
    this.#wss.handleUpgrade(req, socket, head, (ws) => {
      ws.on("error", (err) => {
        this.logger.warn("Activity feed client error", { error: err.message });
        ws.terminate();
      });
    });
  }

  broadcast(message: unknown): void {
    const payload = JSON.stringify(message);
    for (const ws of this.#wss.clients) if (ws.readyState === WebSocket.OPEN) ws.send(payload);
  }

  async close(): Promise<void> {
    for (const ws of this.#wss.clients) ws.terminate();
    await new Promise<void>((resolve) => this.#wss.close(() => resolve()));
  }
}
