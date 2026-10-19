/**
 * Notification categories a player can enable or disable.
 * Preferences are keyed by category, not by individual event type.
 */
export const NOTIFICATION_CATEGORIES = ["GAME", "SOCIAL"] as const;

export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<NotificationCategory, string> = {
  GAME: "Game Events",
  SOCIAL: "Social Events",
};
