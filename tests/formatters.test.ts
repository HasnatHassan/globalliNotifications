import { describe, expect, it } from "vitest";
import type { AnyEventPayload } from "../src/domain/events.js";
import { NotificationFactory } from "../src/notifications/NotificationFactory.js";
import { at, ctx, ev } from "./helpers/fixtures.js";

const factory = new NotificationFactory(ctx);
const one = (payload: AnyEventPayload) => {
  const list = factory.create(ev(payload));
  expect(list).toHaveLength(1);
  return list[0]!;
};

describe("game event formatters", () => {
  it("level up", () => {
    const n = one({ type: "PLAYER_LEVELED_UP", playerId: 1, newLevel: 15 });
    expect(n).toMatchObject({ userId: 1, category: "GAME", type: "LEVEL_UP", metadata: { level: 15 } });
    expect(n.message).toBe("Congratulations! You've reached level 15!");
    expect(n.createdAt).toEqual(at);
  });

  it("rare item acquired uses the catalog name and rarity", () => {
    const n = one({ type: "ITEM_ACQUIRED", playerId: 2, itemId: "SwordOfAzeroth" });
    expect(n).toMatchObject({ userId: 2, category: "GAME", type: "ITEM_ACQUIRED" });
    expect(n.message).toBe("You've acquired the legendary Sword of Azeroth!");
  });

  it.each(["HealthPotion", "IronDagger", "UnknownThing"])("common/unknown item %s produces nothing", (itemId) => {
    expect(factory.create(ev({ type: "ITEM_ACQUIRED", playerId: 2, itemId }))).toEqual([]);
  });

  it("challenge completed", () => {
    const n = one({ type: "CHALLENGE_COMPLETED", playerId: 4, challengeName: "Dragon Slayer" });
    expect(n).toMatchObject({ userId: 4, category: "GAME", type: "CHALLENGE_COMPLETED" });
    expect(n.message).toBe("You've completed the challenge 'Dragon Slayer'!");
  });

  it("PvP notifies the victim / loser", () => {
    expect(one({ type: "PLAYER_ATTACKED", attackerId: 2, victimId: 4 })).toMatchObject({
      userId: 4,
      type: "PVP_ATTACKED",
      message: "Player 'Bob' is attacking you!",
    });
    expect(one({ type: "PLAYER_DEFEATED", winnerId: 2, loserId: 4 })).toMatchObject({
      userId: 4,
      type: "PVP_DEFEATED",
      message: "You were defeated by Player 'Bob'.",
    });
  });
});

describe("social event formatters", () => {
  it("friend request notifies the target", () => {
    const n = one({ type: "FRIEND_REQUEST_SENT", fromPlayerId: 3, toPlayerId: 1 });
    expect(n).toMatchObject({ userId: 1, category: "SOCIAL", type: "FRIEND_REQUEST" });
    expect(n.message).toBe("Player 'Cara' has sent you a friend request.");
  });

  it("friend accepted notifies the original requester", () => {
    const n = one({ type: "FRIEND_REQUEST_ACCEPTED", accepterId: 1, requesterId: 3 });
    expect(n).toMatchObject({ userId: 3, category: "SOCIAL", type: "FRIEND_ACCEPTED" });
    expect(n.message).toBe("Player 'Alice' accepted your friend request.");
  });

  it("new follower notifies the followed player", () => {
    const n = one({ type: "NEW_FOLLOWER", followerId: 2, followedId: 1 });
    expect(n).toMatchObject({ userId: 1, category: "SOCIAL", type: "NEW_FOLLOWER" });
    expect(n.message).toBe("Player 'Bob' started following you.");
  });

  it.each<AnyEventPayload>([
    { type: "FRIEND_REQUEST_SENT", fromPlayerId: 1, toPlayerId: 1 },
    { type: "FRIEND_REQUEST_ACCEPTED", accepterId: 1, requesterId: 1 },
    { type: "NEW_FOLLOWER", followerId: 1, followedId: 1 },
    { type: "PLAYER_ATTACKED", attackerId: 1, victimId: 1 },
    { type: "PLAYER_DEFEATED", winnerId: 1, loserId: 1 },
  ])("self-targeted $type produces nothing", (payload) => {
    expect(factory.create(ev(payload))).toEqual([]);
  });
});

describe("notification ids", () => {
  it("are derived from the event id, so a redelivered event maps to the same notification", () => {
    const payload = { type: "PLAYER_LEVELED_UP", playerId: 1, newLevel: 2 } as const;
    expect(factory.create(ev(payload, "evt-x"))[0]!.id).toBe(factory.create(ev(payload, "evt-x"))[0]!.id);
    expect(factory.create(ev(payload, "evt-y"))[0]!.id).not.toBe(factory.create(ev(payload, "evt-x"))[0]!.id);
  });
});
