import type { EventOfType } from "../../domain/events.js";
import type { NotificationFormatter } from "./NotificationFormatter.js";

export const levelUpFormatter: NotificationFormatter<EventOfType<"PLAYER_LEVELED_UP">> = {
  category: "GAME",
  format: (e) => [
    {
      recipientId: e.playerId,
      type: "LEVEL_UP",
      title: "Level Up!",
      message: `Congratulations! You've reached level ${e.newLevel}!`,
      metadata: { level: e.newLevel },
    },
  ],
};
