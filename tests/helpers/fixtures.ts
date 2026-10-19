import { ItemCatalog, SEED_ITEMS } from "../../src/catalog/ItemCatalog.js";
import { PlayerDirectory, SEED_PLAYERS } from "../../src/catalog/PlayerDirectory.js";
import type { AnyEventPayload, DomainEvent } from "../../src/domain/events.js";
import type { FormatterContext } from "../../src/notifications/formatters/NotificationFormatter.js";

export const at = new Date("2026-01-01T12:00:00.000Z");

export const players = new PlayerDirectory(SEED_PLAYERS);
export const ctx: FormatterContext = { players, items: new ItemCatalog(SEED_ITEMS) };

let seq = 0;
/** Builds a complete domain event from a payload, with a unique id. */
export function ev(payload: AnyEventPayload, id = `evt-${++seq}`): DomainEvent {
  return { ...payload, id, occurredAt: at } as DomainEvent;
}
