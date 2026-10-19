import { describe, expect, it } from "vitest";
import { ItemCatalog, isNotifiableRarity, RARITIES, SEED_ITEMS } from "../src/catalog/ItemCatalog.js";
import { Notification } from "../src/domain/Notification.js";
import { at, players } from "./helpers/fixtures.js";

const props = { id: "n1", userId: 1, type: "LEVEL_UP", category: "GAME", title: "t", message: "m", createdAt: at } as const;

describe("Notification", () => {
  it("defaults metadata and read state and serialises to a DTO", () => {
    expect(new Notification(props).toJSON()).toEqual({
      ...props,
      createdAt: at.toISOString(),
      metadata: {},
      read: false,
    });
  });

  it("is immutable: read state changes return a new instance", () => {
    const n = new Notification({ ...props, metadata: { level: 3 } });
    const read = n.withReadState(true);
    expect(read).not.toBe(n);
    expect([n.read, read.read]).toEqual([false, true]);
    expect(read.withReadState(true)).toBe(read);
    expect(Object.isFrozen(n)).toBe(true);
    expect(Object.isFrozen(n.metadata)).toBe(true);
    expect(() => {
      (n as { read: boolean }).read = true;
    }).toThrow(TypeError);
  });

  it("does not share the caller's Date", () => {
    const createdAt = new Date(at);
    const n = new Notification({ ...props, createdAt });
    createdAt.setFullYear(2000);
    expect(n.createdAt).toEqual(at);
  });
});

describe("catalogs", () => {
  it("resolves player names", () => {
    expect(players.nameOf(3)).toBe("Cara");
    expect(players.exists(99)).toBe(false);
  });

  it("treats unknown items as common", () => {
    const items = new ItemCatalog(SEED_ITEMS);
    expect(items.get("SwordOfAzeroth")).toMatchObject({ name: "Sword of Azeroth", rarity: "legendary" });
    expect(items.get("Mystery").rarity).toBe("common");
  });

  it("only rare and above are notifiable", () => {
    expect(RARITIES.filter(isNotifiableRarity)).toEqual(["rare", "epic", "legendary"]);
  });
});
