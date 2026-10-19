import type { EventOfType } from "../../domain/events.js";
import type { NotificationFormatter } from "./NotificationFormatter.js";

export const playerAttackedFormatter: NotificationFormatter<EventOfType<"PLAYER_ATTACKED">> = {
  category: "GAME",
  format: (e, { players }) =>
    e.attackerId === e.victimId
      ? []
      : [
          {
            recipientId: e.victimId,
            type: "PVP_ATTACKED",
            title: "Under Attack!",
            message: `Player '${players.nameOf(e.attackerId)}' is attacking you!`,
            metadata: { attackerId: e.attackerId },
          },
        ],
};
