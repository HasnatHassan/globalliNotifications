import type { PlayerId } from "../domain/types.js";

export interface Player {
  readonly id: PlayerId;
  readonly name: string;
}

/** Read-only lookup of player display names (stands in for the platform's user service). */
export class PlayerDirectory {
  readonly #players: Map<PlayerId, Player>;

  constructor(players: readonly Player[]) {
    this.#players = new Map(players.map((p) => [p.id, p]));
  }

  exists(id: PlayerId): boolean {
    return this.#players.has(id);
  }

  /** Display name, or a neutral fallback so a missing profile never blocks a notification. */
  nameOf(id: PlayerId): string {
    return this.#players.get(id)?.name ?? `Player #${id}`;
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
