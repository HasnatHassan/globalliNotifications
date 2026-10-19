import type { PlayerId } from "../domain/types.js";

export interface Player {
  readonly id: PlayerId;
  readonly name: string;
}

/**
 * Port: read-only player reference data. Synchronous by design: this is
 * cached reference data (a real system would keep a local read model of the
 * user service), not a store the notification pipeline writes to.
 */
export interface PlayerLookup {
  exists(id: PlayerId): boolean;
  /** Display name. Callers reject unknown players first; the fallback is only a safety net. */
  nameOf(id: PlayerId): string;
  list(): Player[];
}

export class PlayerDirectory implements PlayerLookup {
  readonly #players: Map<PlayerId, Player>;

  constructor(players: readonly Player[]) {
    this.#players = new Map(players.map((p) => [p.id, p]));
  }

  exists(id: PlayerId): boolean {
    return this.#players.has(id);
  }

  nameOf(id: PlayerId): string {
    return this.#players.get(id)?.name ?? `#${id}`;
  }

  list(): Player[] {
    return [...this.#players.values()];
  }
}

export const SEED_PLAYERS: readonly Player[] = [
  { id: 1, name: "Alice" },
  { id: 2, name: "Bob" },
  { id: 3, name: "Cara" },
  { id: 4, name: "Dan" },
];
