import type { EventOfType } from "../../domain/events.js";
import type { NotificationFormatter } from "./NotificationFormatter.js";

export const friendRequestFormatter: NotificationFormatter<EventOfType<"FRIEND_REQUEST_SENT">> = {
  category: "SOCIAL",
  format: (e, { players }) =>
    // A social action targeting oneself is meaningless, so it produces nothing.
    e.fromPlayerId === e.toPlayerId
      ? []
      : [
          {
            recipientId: e.toPlayerId,
            type: "FRIEND_REQUEST",
            title: "Friend Request",
            message: `Player '${players.nameOf(e.fromPlayerId)}' has sent you a friend request.`,
            metadata: { fromPlayerId: e.fromPlayerId },
          },
        ],
};
