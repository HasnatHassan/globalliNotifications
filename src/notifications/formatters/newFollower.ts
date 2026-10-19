import type { EventOfType } from "../../domain/events.js";
import type { NotificationFormatter } from "./NotificationFormatter.js";

export const newFollowerFormatter: NotificationFormatter<EventOfType<"NEW_FOLLOWER">> = {
  category: "SOCIAL",
  format: (e, { players }) =>
    e.followerId === e.followedId
      ? []
      : [
          {
            recipientId: e.followedId,
            type: "NEW_FOLLOWER",
            title: "New Follower",
            message: `Player '${players.nameOf(e.followerId)}' started following you.`,
            metadata: { followerId: e.followerId },
          },
        ],
};
