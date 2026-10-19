import express, { type NextFunction, type Request, type Response } from "express";
import { fileURLToPath } from "node:url";
import { ZodError } from "zod";
import type { NotificationSystem } from "../composition.js";
import type { Logger } from "../logger.js";
import type { PlayerId } from "../domain/types.js";
import {
  playerIdSchema,
  preferencesUpdateSchema,
  readStateSchema,
  simulateEventSchema,
  type SimulateEventInput,
} from "./schemas.js";

const PUBLIC_DIR = fileURLToPath(new URL("../../public", import.meta.url));

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

type Handler = (req: Request, res: Response) => unknown;
const route = (fn: Handler) => (req: Request, res: Response, next: NextFunction) =>
  Promise.resolve(fn(req, res)).catch(next);

/** Maps a validated request to the producer method a real game subsystem would call. */
function emit({ gameEngine, socialSystem }: NotificationSystem, e: SimulateEventInput): Promise<void> {
  switch (e.type) {
    case "PLAYER_LEVELED_UP":
      return gameEngine.playerLeveledUp(e.playerId, e.newLevel);
    case "ITEM_ACQUIRED":
      return gameEngine.itemAcquired(e.playerId, e.itemId);
    case "CHALLENGE_COMPLETED":
      return gameEngine.challengeCompleted(e.playerId, e.challengeName);
    case "PLAYER_ATTACKED":
      return gameEngine.playerAttacked(e.attackerId, e.victimId);
    case "PLAYER_DEFEATED":
      return gameEngine.playerDefeated(e.winnerId, e.loserId);
    case "FRIEND_REQUEST_SENT":
      return socialSystem.friendRequestSent(e.fromPlayerId, e.toPlayerId);
    case "FRIEND_REQUEST_ACCEPTED":
      return socialSystem.friendRequestAccepted(e.accepterId, e.requesterId);
    case "NEW_FOLLOWER":
      return socialSystem.playerFollowed(e.followerId, e.followedId);
  }
}

/** Every player id referenced by an event (fields ending in "Id", except itemId). */
function referencedPlayerIds(e: SimulateEventInput): number[] {
  return Object.entries(e)
    .filter(([k, v]) => k.endsWith("Id") && k !== "itemId" && typeof v === "number")
    .map(([, v]) => v as number);
}

export interface HttpAppOptions {
  /** Pushes a message to the player's open connections (keeps read state in sync across tabs). */
  notifyPlayer?: (playerId: PlayerId, message: unknown) => void;
}

/**
 * Thin HTTP adapter for the demo: parse → call producer/store → shape response.
 * No notification rules live here.
 */
export function createHttpApp(system: NotificationSystem, logger: Logger, options: HttpAppOptions = {}) {
  const notifyPlayer = options.notifyPlayer ?? (() => {});
  const { players, items, preferences, repository } = system;
  const app = express();
  app.use(express.json({ limit: "10kb" }));
  app.use(express.static(PUBLIC_DIR));

  const playerParam = (req: Request): number => {
    const id = playerIdSchema.parse(req.params.id);
    if (!players.exists(id)) throw new HttpError(404, `Player ${id} not found`);
    return id;
  };

  app.get("/api/health", (_req, res) => res.json({ data: { status: "ok" } }));

  app.get("/api/players", (_req, res) => res.json({ data: players.list() }));

  app.get("/api/items", (_req, res) => res.json({ data: items.list() }));

  app.get(
    "/api/players/:id/preferences",
    route((req, res) => res.json({ data: preferences.get(playerParam(req)) })),
  );

  app.put(
    "/api/players/:id/preferences",
    route((req, res) => {
      const id = playerParam(req);
      const updated = preferences.update(id, preferencesUpdateSchema.parse(req.body));
      logger.info("Preferences updated", { playerId: id, ...updated });
      res.json({ data: updated });
    }),
  );

  app.get(
    "/api/players/:id/notifications",
    route((req, res) => res.json({ data: repository.listFor(playerParam(req)).map((n) => n.toJSON()) })),
  );

  // Read state: { read: true } marks as read, { read: false } marks as unread.
  app.patch(
    "/api/players/:id/notifications/:notificationId",
    route((req, res) => {
      const id = playerParam(req);
      const { read } = readStateSchema.parse(req.body);
      const updated = repository.setRead(id, String(req.params.notificationId), read);
      if (!updated) throw new HttpError(404, "Notification not found");
      const unread = repository.unreadCount(id);
      notifyPlayer(id, { type: "read-state", data: { ids: [updated.id], read, unread } });
      res.json({ data: { notification: updated.toJSON(), unread } });
    }),
  );

  app.post(
    "/api/players/:id/notifications/read-all",
    route((req, res) => {
      const id = playerParam(req);
      const updated = repository.markAllAsRead(id);
      notifyPlayer(id, { type: "read-state", data: { all: true, read: true, unread: 0 } });
      res.json({ data: { updated, unread: 0 } });
    }),
  );

  app.post(
    "/api/events",
    route(async (req, res) => {
      const event = simulateEventSchema.parse(req.body);
      const unknown = referencedPlayerIds(event).filter((id) => !players.exists(id));
      if (unknown.length > 0) throw new HttpError(400, `Unknown player id(s): ${unknown.join(", ")}`);
      await emit(system, event);
      res.status(202).json({ data: { accepted: true, type: event.type } });
    }),
  );

  app.use("/api", (_req, res) => res.status(404).json({ error: { message: "Not found" } }));

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ZodError) {
      res.status(400).json({ error: { message: "Invalid request", details: err.flatten() } });
      return;
    }
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: { message: err.message } });
      return;
    }
    if (err instanceof SyntaxError) {
      res.status(400).json({ error: { message: "Malformed JSON body" } });
      return;
    }
    logger.error("Unhandled request error", { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: { message: "Internal server error" } });
  });

  return app;
}
