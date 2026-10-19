import type { NotificationCategory } from "../domain/categories.js";
import type { PlayerId } from "../domain/types.js";

export type CategoryPreferences = Record<NotificationCategory, boolean>;

/** Port: where per-player, per-category notification preferences live. */
export interface PreferenceStore {
  get(playerId: PlayerId): CategoryPreferences;
  update(playerId: PlayerId, changes: Partial<CategoryPreferences>): CategoryPreferences;
  isEnabled(playerId: PlayerId, category: NotificationCategory): boolean;
}
