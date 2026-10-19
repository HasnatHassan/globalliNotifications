import type { EventOfType } from "../../domain/events.js";
import type { NotificationFormatter } from "./NotificationFormatter.js";

export const friendAcceptedFormatter: NotificationFormatter<EventOfType<"FRIEND_REQUEST_ACCEPTED">> = {
  category: "SOCIAL",
  format: (e, { players }) =>
    e.accepterId === e.requesterId
      ? []
      : [
          {
            recipientId: e.requesterId,
            type: "FRIEND_ACCEPTED",
            title: "Friend Request Accepted",
            message: `Player '${players.nameOf(e.accepterId)}' accepted your friend request.`,
            metadata: { accepterId: e.accepterId },
          },
        ],
};
