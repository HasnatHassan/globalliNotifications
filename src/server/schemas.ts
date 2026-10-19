import { z } from "zod";

// Event payload validation lives in the domain (src/domain/eventSchemas.ts).
// These schemas cover only HTTP-specific input.

export const playerIdSchema = z.coerce.number().int().positive();

export const preferencesUpdateSchema = z
  .object({ GAME: z.boolean(), SOCIAL: z.boolean() })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, "At least one category is required");

export const readStateSchema = z.object({ read: z.boolean() }).strict();
