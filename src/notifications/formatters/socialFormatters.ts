import type { EventOfType } from "../../domain/events.js";
import type { NotificationFormatter } from "./NotificationFormatter.js";

// Social actions targeting oneself are meaningless, so they produce no notification.

export const friendRequestFormatter: NotificationFormatter<EventOfType<"FRIEND_REQUEST_SENT">> = {
  category: "SOCIAL",
  format: (e, { players }) =>
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
