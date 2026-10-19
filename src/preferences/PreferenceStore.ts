import type { NotificationCategory } from "../domain/categories.js";
import type { PlayerId } from "../domain/types.js";

export type CategoryPreferences = Record<NotificationCategory, boolean>;

/** Port: per-player, per-category notification preferences. Async so a database adapter fits unchanged. */
export interface PreferenceStore {
  get(playerId: PlayerId): Promise<CategoryPreferences>;
  /** Applies only boolean values for known categories; anything else is ignored. */
  update(playerId: PlayerId, changes: Partial<CategoryPreferences>): Promise<CategoryPreferences>;
  isEnabled(playerId: PlayerId, category: NotificationCategory): Promise<boolean>;
}
