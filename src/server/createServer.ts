import { createServer as createHttpServer, type Server } from "node:http";
import { WebSocketNotificationClient } from "../clients/WebSocketNotificationClient.js";
import { createNotificationSystem, type NotificationSystem } from "../composition.js";
import { consoleLogger, type Logger } from "../logger.js";
import { createHttpApp } from "./http.js";
import { WebSocketHub } from "./WebSocketHub.js";

export interface RunningServer {
  server: Server;
  system: NotificationSystem;
  hub: WebSocketHub;
  port: number;
  close(): Promise<void>;
}

/** Wires the notification system to HTTP + WebSocket and starts listening. Port 0 picks a free port. */
export async function startServer(port: number, logger: Logger = consoleLogger): Promise<RunningServer> {
  const hub = new WebSocketHub(logger);
  const system = createNotificationSystem({ client: new WebSocketNotificationClient(hub), logger });

  // Activity feed for the demo page: what each event produced or why it was suppressed.
  system.service.onDispatch(({ event, sent, suppressed }) => {
    hub.broadcast({
      type: "activity",
      data: {
        eventType: event.type,
        at: event.occurredAt.toISOString(),
        event,
        sent: sent.map((n) => ({ userId: n.userId, type: n.type, online: hub.connectionCount(n.userId) > 0 })),
        suppressed,
      },
    });
  });

  const server = createHttpServer(
    createHttpApp(system, logger, { notifyPlayer: (id, message) => void hub.sendTo(id, message) }),
  );
  // Catch-up on connect: the client gets its inbox, so nothing sent while offline is lost.
  hub.attach(server, {
    isKnownPlayer: (id) => system.players.exists(id),
    welcome: (id) => ({
      type: "welcome",
      data: {
        player: { id, name: system.players.nameOf(id) },
        history: system.repository.listFor(id).map((n) => n.toJSON()),
        unread: system.repository.unreadCount(id),
      },
    }),
  });

  await new Promise<void>((resolve) => server.listen(port, resolve));
  const address = server.address();
  const actualPort = typeof address === "object" && address ? address.port : port;

  return {
    server,
    system,
    hub,
    port: actualPort,
    async close() {
      await hub.close();
      await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    },
  };
}
