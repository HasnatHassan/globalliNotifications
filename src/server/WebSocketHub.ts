import type { IncomingMessage, Server } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import type { PlayerMessenger } from "../clients/WebSocketNotificationClient.js";
import type { PlayerId } from "../domain/types.js";
import type { Logger } from "../logger.js";
import { playerIdSchema } from "./schemas.js";

const HEARTBEAT_MS = 30_000;

export interface HubOptions {
  /** Rejects connections for players that do not exist. */
  isKnownPlayer(playerId: PlayerId): boolean;
  /** First message a newly connected player receives (e.g. their inbox history). */
  welcome(playerId: PlayerId): unknown;
}

/**
 * Tracks live game-client connections per player (a player may have several
 * tabs/devices). Connect with ws://host/ws?userId=<id>.
 * Demo only: real auth would derive the player from a verified token.
 */
export class WebSocketHub implements PlayerMessenger {
  readonly #sockets = new Map<PlayerId, Set<WebSocket>>();
  readonly #alive = new WeakMap<WebSocket, boolean>();
  #wss: WebSocketServer | undefined;
  #heartbeat: NodeJS.Timeout | undefined;

  constructor(private readonly logger: Logger) {}

  attach(server: Server, options: HubOptions): void {
    this.#wss = new WebSocketServer({ server, path: "/ws" });
    this.#wss.on("connection", (socket, req) => this.#onConnection(socket, req, options));
    // Drop connections that stopped answering pings (e.g. a closed laptop lid).
    this.#heartbeat = setInterval(() => {
      for (const socket of this.#wss?.clients ?? []) {
        if (this.#alive.get(socket) === false) {
          socket.terminate();
          continue;
        }
        this.#alive.set(socket, false);
        socket.ping();
      }
    }, HEARTBEAT_MS);
    this.#heartbeat.unref();
  }

  sendTo(playerId: PlayerId, message: unknown): number {
    const sockets = this.#sockets.get(playerId);
    if (!sockets) return 0;
    const payload = JSON.stringify(message);
    let sent = 0;
    for (const socket of sockets) {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(payload);
        sent++;
      }
    }
    return sent;
  }

  broadcast(message: unknown): void {
    const payload = JSON.stringify(message);
    for (const sockets of this.#sockets.values()) {
      for (const socket of sockets) if (socket.readyState === WebSocket.OPEN) socket.send(payload);
    }
  }

  connectionCount(playerId: PlayerId): number {
    return this.#sockets.get(playerId)?.size ?? 0;
  }

  async close(): Promise<void> {
    clearInterval(this.#heartbeat);
    for (const socket of this.#wss?.clients ?? []) socket.terminate();
    await new Promise<void>((resolve) => (this.#wss ? this.#wss.close(() => resolve()) : resolve()));
  }

  #onConnection(socket: WebSocket, req: IncomingMessage, { isKnownPlayer, welcome }: HubOptions): void {
    const url = new URL(req.url ?? "/", "http://localhost");
    const parsed = playerIdSchema.safeParse(url.searchParams.get("userId"));
    if (!parsed.success || !isKnownPlayer(parsed.data)) {
      socket.close(1008, "Unknown or missing userId");
      return;
    }
    const playerId = parsed.data;

    const set = this.#sockets.get(playerId) ?? new Set<WebSocket>();
    set.add(socket);
    this.#sockets.set(playerId, set);
    this.#alive.set(socket, true);
    socket.on("pong", () => this.#alive.set(socket, true));
    socket.on("close", () => {
      set.delete(socket);
      if (set.size === 0) this.#sockets.delete(playerId);
    });

    socket.send(JSON.stringify(welcome(playerId)));
    this.logger.info("Client connected", { playerId, connections: set.size });
  }
}
