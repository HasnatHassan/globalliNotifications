export const RARITIES = ["common", "uncommon", "rare", "epic", "legendary"] as const;
export type Rarity = (typeof RARITIES)[number];

export interface Item {
  readonly id: string;
  readonly name: string;
  readonly rarity: Rarity;
}

/** Items at or above this rarity are "rare or valuable" and worth notifying about. */
export const NOTIFIABLE_MIN_RARITY: Rarity = "rare";

export function isNotifiableRarity(rarity: Rarity): boolean {
  return RARITIES.indexOf(rarity) >= RARITIES.indexOf(NOTIFIABLE_MIN_RARITY);
}

/** Port: read-only item reference data (cached, hence synchronous; see PlayerLookup). */
export interface ItemLookup {
  has(id: string): boolean;
  /** Callers reject unknown ids first; the common-item fallback is only a safety net. */
  get(id: string): Item;
  list(): Item[];
}

/** Read-only item metadata (stands in for the game's item database). */
export class ItemCatalog implements ItemLookup {
  readonly #items: Map<string, Item>;

  constructor(items: readonly Item[]) {
    this.#items = new Map(items.map((i) => [i.id, i]));
  }

  has(id: string): boolean {
    return this.#items.has(id);
  }

  get(id: string): Item {
    return this.#items.get(id) ?? { id, name: id, rarity: "common" };
  }

  list(): Item[] {
    return [...this.#items.values()];
  }
}

export const SEED_ITEMS: readonly Item[] = [
  { id: "SwordOfAzeroth", name: "Sword of Azeroth", rarity: "legendary" },
  { id: "DragonscaleShield", name: "Dragonscale Shield", rarity: "epic" },
  { id: "EmberAmulet", name: "Ember Amulet", rarity: "rare" },
  { id: "IronDagger", name: "Iron Dagger", rarity: "common" },
  { id: "HealthPotion", name: "Health Potion", rarity: "common" },
];
