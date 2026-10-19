import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocket, WebSocketServer } from "ws";
import type { PlayerMessenger } from "../clients/WebSocketNotificationClient.js";
import type { PlayerId } from "../domain/types.js";
import type { Logger } from "../logger.js";
import { playerIdSchema } from "./schemas.js";

export interface Welcome {
  /** First message the connection receives (e.g. the inbox replay). */
  readonly message: unknown;
  /** Dedupe keys already covered by `message`; matching live pushes queued meanwhile are dropped. */
  readonly deliveredKeys: Iterable<string>;
}

export interface HubOptions {
  isKnownPlayer(playerId: PlayerId): boolean;
  welcome(playerId: PlayerId): Promise<Welcome>;
  heartbeatMs?: number;
}

interface Connection {
  readonly socket: WebSocket;
  readonly playerId: PlayerId;
  alive: boolean;
  /** Set until the welcome has been sent; live pushes wait here so ordering is welcome → live. */
  pending: { payload: string; key?: string | undefined }[] | undefined;
}

/**
 * Tracks live game-client connections per player (a player may have several
 * tabs/devices). Clients connect with /ws?userId=<id> and only ever receive
 * messages addressed to that player. Demo only: real auth would derive the
 * player from a verified token, not a query parameter.
 */
export class WebSocketHub implements PlayerMessenger {
  readonly #wss: WebSocketServer;
  readonly #connections = new Map<PlayerId, Set<Connection>>();
  readonly #heartbeat: NodeJS.Timeout;

  constructor(
    private readonly options: HubOptions,
    private readonly logger: Logger,
  ) {
    // Clients never need to send data; a small cap bounds memory per frame.
    this.#wss = new WebSocketServer({ noServer: true, maxPayload: 1024 });
    this.#wss.on("error", (err) => this.logger.error("WebSocket server error", { error: err.message }));
    this.#heartbeat = setInterval(() => this.#sweep(), options.heartbeatMs ?? 30_000);
    this.#heartbeat.unref();
  }

  /** Called by the HTTP server's upgrade router after origin checks. */
  handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
    const userId = new URL(req.url ?? "/", "http://localhost").searchParams.get("userId");
    const parsed = playerIdSchema.safeParse(userId);
    this.#wss.handleUpgrade(req, socket, head, (ws) => {
      if (!parsed.success || !this.options.isKnownPlayer(parsed.data)) {
        ws.close(1008, "Unknown or missing userId");
        return;
      }
      void this.#onConnection(ws, parsed.data);
    });
  }

  sendTo(playerId: PlayerId, message: unknown, dedupeKey?: string): number {
    const connections = this.#connections.get(playerId);
    if (!connections) return 0;
    const payload = JSON.stringify(message);
    for (const conn of connections) {
      if (conn.pending) conn.pending.push({ payload, key: dedupeKey });
      else if (conn.socket.readyState === WebSocket.OPEN) conn.socket.send(payload);
    }
    return connections.size;
  }

  connectionCount(playerId: PlayerId): number {
    return this.#connections.get(playerId)?.size ?? 0;
  }

  async close(): Promise<void> {
    clearInterval(this.#heartbeat);
    for (const ws of this.#wss.clients) ws.terminate();
    await new Promise<void>((resolve) => this.#wss.close(() => resolve()));
  }

  async #onConnection(socket: WebSocket, playerId: PlayerId): Promise<void> {
    const conn: Connection = { socket, playerId, alive: true, pending: [] };
    const set = this.#connections.get(playerId) ?? new Set<Connection>();
    set.add(conn);
    this.#connections.set(playerId, set);

    // A protocol error from one client (e.g. an unmasked frame) must only drop that client.
    socket.on("error", (err) => {
      this.logger.warn("WebSocket client error", { playerId, error: err.message });
      socket.terminate();
    });
    socket.on("pong", () => (conn.alive = true));
    socket.on("close", () => {
      set.delete(conn);
      if (set.size === 0) this.#connections.delete(playerId);
    });

    // Registered before loading the inbox, so nothing published meanwhile is missed;
    // queued pushes already contained in the replay are dropped by dedupe key.
    try {
      const { message, deliveredKeys } = await this.options.welcome(playerId);
      if (socket.readyState !== WebSocket.OPEN) return;
      socket.send(JSON.stringify(message));
      const replayed = new Set(deliveredKeys);
      for (const { payload, key } of conn.pending ?? []) {
        if (key === undefined || !replayed.has(key)) socket.send(payload);
      }
      this.logger.info("Client connected", { playerId, connections: set.size });
    } catch (err) {
      this.logger.error("Failed to send welcome", { playerId, error: err instanceof Error ? err.message : String(err) });
      socket.close(1011, "Could not load inbox");
    } finally {
      conn.pending = undefined;
    }
  }

  /** Terminates connections that did not answer the previous ping (e.g. a closed laptop lid). */
  #sweep(): void {
    for (const set of this.#connections.values()) {
      for (const conn of set) {
        if (!conn.alive) {
          conn.socket.terminate();
          continue;
        }
        conn.alive = false;
        conn.socket.ping();
      }
    }
  }
}
