import express, { type NextFunction, type Request, type Response } from "express";
import { fileURLToPath } from "node:url";
import { ZodError } from "zod";
import type { NotificationSystem } from "../composition.js";
import { InvalidEventError, parseEventPayload, UnknownReferenceError } from "../domain/eventSchemas.js";
import type { AnyEventPayload } from "../domain/events.js";
import type { PlayerId } from "../domain/types.js";
import type { Logger } from "../logger.js";
import type { CategoryPreferences } from "../preferences/PreferenceStore.js";
import { playerIdSchema, preferencesUpdateSchema, readStateSchema } from "./schemas.js";

const PUBLIC_DIR = fileURLToPath(new URL("../../public", import.meta.url));
export const MAX_BODY_BYTES = 10 * 1024;

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

/** Maps a validated payload to the producer method a real game subsystem would call. */
function emit({ gameEngine, socialSystem }: NotificationSystem, e: AnyEventPayload): Promise<void> {
  // Producers throw synchronously on invalid input; the async route wrapper turns that into a 4xx.
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

/** Errors raised by express.json() (body-parser) carry a `type`; map the client-caused ones. */
function bodyParserError(err: unknown): HttpError | undefined {
  if (typeof err !== "object" || err === null || !("type" in err)) return undefined;
  switch (err.type) {
    case "entity.too.large":
      return new HttpError(413, `Request body exceeds ${MAX_BODY_BYTES} bytes`);
    case "entity.parse.failed":
      return new HttpError(400, "Malformed JSON body");
    case "encoding.unsupported":
    case "charset.unsupported":
      return new HttpError(415, "Unsupported body encoding");
    default:
      return undefined;
  }
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
  const { players, items, preferences, repository } = system;
  const notifyPlayer = options.notifyPlayer ?? (() => {});
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: MAX_BODY_BYTES }));
  app.use(express.static(PUBLIC_DIR));

  const playerParam = (req: Request): PlayerId => {
    const id = playerIdSchema.parse(req.params.id);
    if (!players.exists(id)) throw new HttpError(404, `Player ${id} not found`);
    return id;
  };

  app.get("/api/health", (_req, res) => res.json({ data: { status: "ok" } }));
  app.get("/api/players", (_req, res) => res.json({ data: players.list() }));
  app.get("/api/items", (_req, res) => res.json({ data: items.list() }));

  app.get(
    "/api/players/:id/preferences",
    route(async (req, res) => res.json({ data: await preferences.get(playerParam(req)) })),
  );

  app.put(
    "/api/players/:id/preferences",
    route(async (req, res) => {
      const id = playerParam(req);
      const changes = preferencesUpdateSchema.parse(req.body) as Partial<CategoryPreferences>;
      const updated = await preferences.update(id, changes);
      logger.info("Preferences updated", { playerId: id, ...updated });
      res.json({ data: updated });
    }),
  );

  app.get(
    "/api/players/:id/notifications",
    route(async (req, res) => {
      const inbox = await repository.listFor(playerParam(req));
      res.json({ data: inbox.map((n) => n.toJSON()) });
    }),
  );

  // Read state: { read: true } marks as read, { read: false } marks as unread.
  app.patch(
    "/api/players/:id/notifications/:notificationId",
    route(async (req, res) => {
      const id = playerParam(req);
      const { read } = readStateSchema.parse(req.body);
      const updated = await repository.setRead(id, String(req.params.notificationId), read);
      if (!updated) throw new HttpError(404, "Notification not found");
      const unread = await repository.unreadCount(id);
      notifyPlayer(id, { type: "read-state", data: { ids: [updated.id], read, unread } });
      res.json({ data: { notification: updated.toJSON(), unread } });
    }),
  );

  app.post(
    "/api/players/:id/notifications/read-all",
    route(async (req, res) => {
      const id = playerParam(req);
      const updated = await repository.markAllAsRead(id);
      notifyPlayer(id, { type: "read-state", data: { all: true, read: true, unread: 0 } });
      res.json({ data: { updated, unread: 0 } });
    }),
  );

  // Validation (shape and references) happens in the producers, exactly as for
  // any other caller; this route only maps their errors to status codes.
  // Accepted, not processed: the bus delivers asynchronously, so 202 is the honest status.
  app.post(
    "/api/events",
    route(async (req, res) => {
      const payload = parseEventPayload(req.body); // narrows the type for emit(); producers re-check
      await emit(system, payload);
      res.status(202).json({ data: { accepted: true, type: payload.type } });
    }),
  );

  app.use("/api", (_req, res) => res.status(404).json({ error: { message: "Not found" } }));

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const known = err instanceof HttpError ? err : bodyParserError(err);
    if (known) {
      res.status(known.status).json({ error: { message: known.message } });
      return;
    }
    if (err instanceof UnknownReferenceError) {
      res.status(404).json({ error: { message: err.message, details: err.unknown } });
      return;
    }
    if (err instanceof InvalidEventError) {
      res.status(400).json({ error: { message: "Invalid event", details: err.issues } });
      return;
    }
    if (err instanceof ZodError) {
      res.status(400).json({ error: { message: "Invalid request", details: err.flatten() } });
      return;
    }
    logger.error("Unhandled request error", { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: { message: "Internal server error" } });
  });

  return app;
}
