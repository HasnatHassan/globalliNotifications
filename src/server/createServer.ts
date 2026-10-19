import { createServer as createHttpServer, type IncomingMessage, type Server } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketNotificationClient } from "../clients/WebSocketNotificationClient.js";
import { createNotificationSystem, type NotificationSystem } from "../composition.js";
import { consoleLogger, type Logger } from "../logger.js";
import { ActivityFeed } from "./ActivityFeed.js";
import { createHttpApp } from "./http.js";
import { WebSocketHub } from "./WebSocketHub.js";

export interface ServerOptions {
  /** 0 picks a free port. */
  port: number;
  logger?: Logger;
  /** Expose the operator activity stream at /ws/activity (default true). */
  activityFeed?: boolean;
  heartbeatMs?: number;
}

export interface RunningServer {
  readonly server: Server;
  readonly system: NotificationSystem;
  readonly hub: WebSocketHub;
  readonly port: number;
  close(): Promise<void>;
}

/**
 * Browsers always send Origin on WebSocket upgrades and the server cannot rely
 * on CORS for them, so reject cross-site pages here. Non-browser clients
 * (game clients, tests) send no Origin and are allowed.
 */
function isAllowedOrigin(req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

function rejectUpgrade(socket: Duplex, status: number, reason: string): void {
  socket.end(`HTTP/1.1 ${status} ${reason}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
}

/**
 * Server composition root: wires the notification system to HTTP + WebSocket
 * and starts listening. Rejects (e.g. EADDRINUSE) if the port cannot be bound.
 */
export async function startServer(options: ServerOptions): Promise<RunningServer> {
  const logger = options.logger ?? consoleLogger;

  // The hub needs the system's inbox and the system needs the hub as its delivery
  // client, so the hub's lookups are late-bound to the system created next.
  let system: NotificationSystem | undefined;
  const hub = new WebSocketHub(
    {
      isKnownPlayer: (id) => system?.players.exists(id) ?? false,
      welcome: async (id) => {
        if (!system) throw new Error("Notification system not ready");
        const history = await system.repository.listFor(id);
        return {
          message: {
            type: "welcome",
            data: {
              player: { id, name: system.players.nameOf(id) },
              history: history.map((n) => n.toJSON()),
              // Same window as `history`, so the badge and the list always agree.
              unread: history.filter((n) => !n.read).length,
              capacity: system.repository.capacity,
            },
          },
          deliveredKeys: history.map((n) => n.id),
        };
      },
      ...(options.heartbeatMs !== undefined ? { heartbeatMs: options.heartbeatMs } : {}),
    },
    logger,
  );
  const ready = createNotificationSystem({ client: new WebSocketNotificationClient(hub), logger });
  system = ready;

  const activity = options.activityFeed === false ? undefined : new ActivityFeed(logger);
  if (activity) {
    const brief = (list: { userId: number; type: string }[]) => list.map(({ userId, type }) => ({ userId, type }));
    ready.onDispatch(({ event, sent, offline, undelivered, suppressed, duplicates, failed, rejected }) => {
      activity.broadcast({
        type: "activity",
        data: {
          event,
          sent: brief(sent),
          offline: brief(offline),
          undelivered: brief(undelivered),
          suppressed,
          duplicates: duplicates.length,
          failed: brief(failed),
          rejected,
        },
      });
    });
  }

  const server = createHttpServer(
    createHttpApp(ready, logger, { notifyPlayer: (id, message) => void hub.sendTo(id, message) }),
  );

  server.on("upgrade", (req, socket, head) => {
    socket.on("error", () => socket.destroy()); // raw socket errors before the WebSocket takes over
    const { pathname } = new URL(req.url ?? "/", "http://localhost");
    if (!isAllowedOrigin(req)) return rejectUpgrade(socket, 403, "Forbidden");
    if (pathname === "/ws") return hub.handleUpgrade(req, socket, head);
    if (pathname === "/ws/activity" && activity) return activity.handleUpgrade(req, socket, head);
    rejectUpgrade(socket, 404, "Not Found");
  });

  const closeRealtime = async () => {
    await hub.close();
    await activity?.close();
  };

  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(options.port, () => {
        server.off("error", reject);
        resolve();
      });
    });
  } catch (err) {
    await closeRealtime();
    throw err;
  }
  server.on("error", (err) => logger.error("HTTP server error", { error: err.message }));

  const address = server.address();
  const port = typeof address === "object" && address ? address.port : options.port;

  return {
    server,
    system: ready,
    hub,
    port,
    async close() {
      await closeRealtime();
      await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
      await ready.drain();
    },
  };
}
