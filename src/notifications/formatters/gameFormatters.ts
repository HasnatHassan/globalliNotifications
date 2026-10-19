import { isNotifiableRarity } from "../../catalog/ItemCatalog.js";
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

export const itemAcquiredFormatter: NotificationFormatter<EventOfType<"ITEM_ACQUIRED">> = {
  category: "GAME",
  format: (e, { items }) => {
    const item = items.get(e.itemId);
    // Only "rare or valuable" items are worth interrupting the player for.
    if (!isNotifiableRarity(item.rarity)) return [];
    return [
      {
        recipientId: e.playerId,
        type: "ITEM_ACQUIRED",
        title: "Item Acquired",
        message: `You've acquired the ${item.rarity} ${item.name}!`,
        metadata: { itemId: item.id, itemName: item.name, rarity: item.rarity },
      },
    ];
  },
};

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
