import type { EventOfType } from "../../domain/events.js";
import type { NotificationFormatter } from "./NotificationFormatter.js";

export const playerDefeatedFormatter: NotificationFormatter<EventOfType<"PLAYER_DEFEATED">> = {
  category: "GAME",
  format: (e, { players }) =>
    e.winnerId === e.loserId
      ? []
      : [
          {
            recipientId: e.loserId,
            type: "PVP_DEFEATED",
            title: "Defeated",
            message: `You were defeated by Player '${players.nameOf(e.winnerId)}'.`,
            metadata: { winnerId: e.winnerId },
          },
        ],
};
