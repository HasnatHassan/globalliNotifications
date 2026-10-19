import type { EventOfType } from "../../domain/events.js";
import type { NotificationFormatter } from "./NotificationFormatter.js";

export const challengeCompletedFormatter: NotificationFormatter<EventOfType<"CHALLENGE_COMPLETED">> = {
  category: "GAME",
  format: (e) => [
    {
      recipientId: e.playerId,
      type: "CHALLENGE_COMPLETED",
      title: "Challenge Completed",
      message: `You've completed the challenge '${e.challengeName}'!`,
      metadata: { challengeName: e.challengeName },
    },
  ],
};
