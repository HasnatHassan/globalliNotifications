import { ItemCatalog, SEED_ITEMS } from "../../src/catalog/ItemCatalog.js";
import { PlayerDirectory, SEED_PLAYERS } from "../../src/catalog/PlayerDirectory.js";
import type { FormatterContext } from "../../src/notifications/formatters/NotificationFormatter.js";

export const at = new Date("2026-01-01T12:00:00.000Z");

export const ctx: FormatterContext = {
  players: new PlayerDirectory(SEED_PLAYERS),
  items: new ItemCatalog(SEED_ITEMS),
};
