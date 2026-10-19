import { isNotifiableRarity } from "../../catalog/ItemCatalog.js";
import type { EventOfType } from "../../domain/events.js";
import type { NotificationFormatter } from "./NotificationFormatter.js";

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
