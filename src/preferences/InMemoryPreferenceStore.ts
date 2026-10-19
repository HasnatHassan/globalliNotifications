import { NOTIFICATION_CATEGORIES, type NotificationCategory } from "../domain/categories.js";
import type { PlayerId } from "../domain/types.js";
import type { CategoryPreferences, PreferenceStore } from "./PreferenceStore.js";

/** Opt-out model: players without saved preferences receive every category. */
const DEFAULT_PREFERENCES: CategoryPreferences = Object.fromEntries(
  NOTIFICATION_CATEGORIES.map((c) => [c, true]),
) as CategoryPreferences;

/** The "simple dictionary or map" the brief suggests, behind the PreferenceStore port. */
export class InMemoryPreferenceStore implements PreferenceStore {
  readonly #prefs = new Map<PlayerId, CategoryPreferences>();

  get(playerId: PlayerId): CategoryPreferences {
    return { ...DEFAULT_PREFERENCES, ...this.#prefs.get(playerId) };
  }

  update(playerId: PlayerId, changes: Partial<CategoryPreferences>): CategoryPreferences {
    const next = { ...this.get(playerId), ...changes };
    this.#prefs.set(playerId, next);
    return { ...next };
  }

  isEnabled(playerId: PlayerId, category: NotificationCategory): boolean {
    return this.get(playerId)[category];
  }
}
