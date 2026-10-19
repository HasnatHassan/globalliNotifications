import { NOTIFICATION_CATEGORIES, type NotificationCategory } from "../domain/categories.js";
import type { PlayerId } from "../domain/types.js";
import type { CategoryPreferences, PreferenceStore } from "./PreferenceStore.js";

/** Every category is enabled until the player turns it off. */
const DEFAULT_PREFERENCES: CategoryPreferences = Object.fromEntries(
  NOTIFICATION_CATEGORIES.map((c) => [c, true]),
) as CategoryPreferences;

/** The "simple dictionary or map" the brief suggests, behind the PreferenceStore port. */
export class InMemoryPreferenceStore implements PreferenceStore {
  readonly #prefs = new Map<PlayerId, CategoryPreferences>();

  async get(playerId: PlayerId): Promise<CategoryPreferences> {
    return { ...DEFAULT_PREFERENCES, ...this.#prefs.get(playerId) };
  }

  async update(playerId: PlayerId, changes: Partial<CategoryPreferences>): Promise<CategoryPreferences> {
    const next = await this.get(playerId);
    // Runtime guard as well as the type: a stray `undefined` must never become a stored preference.
    for (const category of NOTIFICATION_CATEGORIES) {
      const value: unknown = changes[category];
      if (typeof value === "boolean") next[category] = value;
    }
    this.#prefs.set(playerId, next);
    return { ...next };
  }

  async isEnabled(playerId: PlayerId, category: NotificationCategory): Promise<boolean> {
    return (await this.get(playerId))[category];
  }
}
