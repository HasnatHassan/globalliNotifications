import { z } from "zod";
import type { AnyEventPayload, DomainEvent, EventPayload, EventType } from "./events.js";
import type { PlayerId } from "./types.js";

/** Schema for a player id field. Which fields are player references is declared in EVENT_REFERENCES. */
export const playerRef = z.number().int().positive();

const text = (max: number) => z.string().trim().min(1).max(max);

/**
 * Validation for every event payload. This is the one place that defines what
 * a well-formed event is; producers and the HTTP layer both use it.
 * `satisfies` keeps each schema in lockstep with its TypeScript event type.
 */
export const EVENT_PAYLOAD_SCHEMAS = {
  PLAYER_LEVELED_UP: z
    .object({ type: z.literal("PLAYER_LEVELED_UP"), playerId: playerRef, newLevel: z.number().int().min(1).max(10_000) })
    .strict(),
  ITEM_ACQUIRED: z.object({ type: z.literal("ITEM_ACQUIRED"), playerId: playerRef, itemId: text(100) }).strict(),
  CHALLENGE_COMPLETED: z
    .object({ type: z.literal("CHALLENGE_COMPLETED"), playerId: playerRef, challengeName: text(100) })
    .strict(),
  PLAYER_ATTACKED: z.object({ type: z.literal("PLAYER_ATTACKED"), attackerId: playerRef, victimId: playerRef }).strict(),
  PLAYER_DEFEATED: z.object({ type: z.literal("PLAYER_DEFEATED"), winnerId: playerRef, loserId: playerRef }).strict(),
  FRIEND_REQUEST_SENT: z
    .object({ type: z.literal("FRIEND_REQUEST_SENT"), fromPlayerId: playerRef, toPlayerId: playerRef })
    .strict(),
  FRIEND_REQUEST_ACCEPTED: z
    .object({ type: z.literal("FRIEND_REQUEST_ACCEPTED"), accepterId: playerRef, requesterId: playerRef })
    .strict(),
  NEW_FOLLOWER: z.object({ type: z.literal("NEW_FOLLOWER"), followerId: playerRef, followedId: playerRef }).strict(),
} satisfies { [K in EventType]: z.ZodType<EventPayload<K>> };

export const EVENT_TYPES = Object.keys(EVENT_PAYLOAD_SCHEMAS) as [EventType, ...EventType[]];

export class InvalidEventError extends Error {
  constructor(readonly issues: z.ZodIssue[]) {
    super(`Invalid event: ${issues.map((i) => `${i.path.join(".") || "(root)"} ${i.message}`).join("; ")}`);
    this.name = "InvalidEventError";
  }
}

const envelope = z.object({ type: z.enum(EVENT_TYPES) }).passthrough();

/** Validates unknown input into a typed payload, or throws InvalidEventError. */
export function parseEventPayload(input: unknown): AnyEventPayload {
  const head = envelope.safeParse(input);
  if (!head.success) throw new InvalidEventError(head.error.issues);
  const result = (EVENT_PAYLOAD_SCHEMAS[head.data.type] as z.ZodType<AnyEventPayload>).safeParse(input);
  if (!result.success) throw new InvalidEventError(result.error.issues);
  return result.data;
}

type ReferenceFields<K extends EventType> = readonly Exclude<keyof EventPayload<K>, "type">[];

/**
 * Which fields of each event reference players or catalog items. Declared
 * explicitly (not inferred) so nothing silently drops out of the checks; the
 * mapped type makes a missing event type or a misspelt field a compile error.
 */
export const EVENT_REFERENCES: { [K in EventType]: { players: ReferenceFields<K>; items?: ReferenceFields<K> } } = {
  PLAYER_LEVELED_UP: { players: ["playerId"] },
  ITEM_ACQUIRED: { players: ["playerId"], items: ["itemId"] },
  CHALLENGE_COMPLETED: { players: ["playerId"] },
  PLAYER_ATTACKED: { players: ["attackerId", "victimId"] },
  PLAYER_DEFEATED: { players: ["winnerId", "loserId"] },
  FRIEND_REQUEST_SENT: { players: ["fromPlayerId", "toPlayerId"] },
  FRIEND_REQUEST_ACCEPTED: { players: ["accepterId", "requesterId"] },
  NEW_FOLLOWER: { players: ["followerId", "followedId"] },
};

type AnyEvent = DomainEvent | AnyEventPayload;

function fieldValues(event: AnyEvent, kind: "players" | "items"): unknown[] {
  const fields = (EVENT_REFERENCES[event.type] as { players: readonly string[]; items?: readonly string[] })[kind] ?? [];
  const record = event as unknown as Record<string, unknown>;
  return fields.map((field) => record[field]);
}

/** Every player id an event references (actors and targets). */
export function playerIdsOf(event: AnyEvent): PlayerId[] {
  return fieldValues(event, "players") as PlayerId[];
}

/** Every catalog item id an event references. */
export function itemIdsOf(event: AnyEvent): string[] {
  return fieldValues(event, "items") as string[];
}

/** The reference data an event is checked against (structurally satisfied by the catalog ports). */
export interface ReferenceLookups {
  readonly players: { exists(id: PlayerId): boolean };
  readonly items: { has(id: string): boolean };
}

export interface UnknownReferences {
  readonly players: PlayerId[];
  readonly items: string[];
}

/** The single reference rule, used by producers (to reject the call) and the service (as a consumer-side guard). */
export function findUnknownReferences(event: AnyEvent, lookups: ReferenceLookups): UnknownReferences | undefined {
  const players = playerIdsOf(event).filter((id) => !lookups.players.exists(id));
  const items = itemIdsOf(event).filter((id) => !lookups.items.has(id));
  return players.length + items.length > 0 ? { players, items } : undefined;
}

export class UnknownReferenceError extends Error {
  constructor(readonly unknown: UnknownReferences) {
    const parts = [
      unknown.players.length > 0 ? `unknown player id(s) ${unknown.players.join(", ")}` : "",
      unknown.items.length > 0 ? `unknown item id(s) ${unknown.items.join(", ")}` : "",
    ].filter(Boolean);
    super(`Invalid event: ${parts.join("; ")}`);
    this.name = "UnknownReferenceError";
  }
}
