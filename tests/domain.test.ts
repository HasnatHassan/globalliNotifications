import { describe, expect, it } from "vitest";
import { ItemCatalog, isNotifiableRarity, SEED_ITEMS } from "../src/catalog/ItemCatalog.js";
import { PlayerDirectory, SEED_PLAYERS } from "../src/catalog/PlayerDirectory.js";
import { Notification } from "../src/domain/Notification.js";

describe("Notification", () => {
  it("assigns id/createdAt, defaults metadata and serialises to a DTO", () => {
    const n = new Notification({ userId: 1, type: "LEVEL_UP", category: "GAME", title: "t", message: "m" });
    expect(n.id).toMatch(/[0-9a-f-]{36}/);
    expect(n.read).toBe(false);
    n.markAsRead();
    expect(n.toJSON()).toMatchObject({ userId: 1, type: "LEVEL_UP", category: "GAME", metadata: {}, read: true });
    n.markAsUnread();
    expect(n.read).toBe(false);
    expect(typeof n.toJSON().createdAt).toBe("string");
  });
});

describe("catalogs", () => {
  it("resolves player names with a fallback for unknown ids", () => {
    const players = new PlayerDirectory(SEED_PLAYERS);
    expect(players.nameOf(3)).toBe("Cara");
    expect(players.nameOf(99)).toBe("Player #99");
    expect(players.exists(99)).toBe(false);
  });

  it("treats unknown items as common and only rare+ as notifiable", () => {
    const items = new ItemCatalog(SEED_ITEMS);
    expect(items.get("SwordOfAzeroth")).toMatchObject({ name: "Sword of Azeroth", rarity: "legendary" });
    expect(items.get("Mystery").rarity).toBe("common");
    expect(["common", "uncommon", "rare", "epic", "legendary"].map((r) => isNotifiableRarity(r as never))).toEqual([
      false,
      false,
      true,
      true,
      true,
    ]);
  });
});
