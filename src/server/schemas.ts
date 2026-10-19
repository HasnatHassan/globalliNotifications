import { z } from "zod";

export const playerIdSchema = z.coerce.number().int().positive();

export const preferencesUpdateSchema = z
  .object({ GAME: z.boolean(), SOCIAL: z.boolean() })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, "At least one category is required");

const id = z.number().int().positive();

/** Simulated platform events accepted by POST /api/events (occurredAt is set server-side). */
export const simulateEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("PLAYER_LEVELED_UP"), playerId: id, newLevel: z.number().int().min(1).max(1000) }),
  z.object({ type: z.literal("ITEM_ACQUIRED"), playerId: id, itemId: z.string().min(1).max(100) }),
  z.object({ type: z.literal("CHALLENGE_COMPLETED"), playerId: id, challengeName: z.string().trim().min(1).max(100) }),
  z.object({ type: z.literal("PLAYER_ATTACKED"), attackerId: id, victimId: id }),
  z.object({ type: z.literal("PLAYER_DEFEATED"), winnerId: id, loserId: id }),
  z.object({ type: z.literal("FRIEND_REQUEST_SENT"), fromPlayerId: id, toPlayerId: id }),
  z.object({ type: z.literal("FRIEND_REQUEST_ACCEPTED"), accepterId: id, requesterId: id }),
  z.object({ type: z.literal("NEW_FOLLOWER"), followerId: id, followedId: id }),
]);

export type SimulateEventInput = z.infer<typeof simulateEventSchema>;
