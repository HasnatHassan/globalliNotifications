import { describe, expect, it } from "vitest";
import {
  EVENT_REFERENCES,
  EVENT_TYPES,
  findUnknownReferences,
  InvalidEventError,
  itemIdsOf,
  parseEventPayload,
  playerIdsOf,
} from "../src/domain/eventSchemas.js";
import { ctx } from "./helpers/fixtures.js";

describe("event payload validation", () => {
  it("accepts a well-formed payload and trims text", () => {
    expect(parseEventPayload({ type: "CHALLENGE_COMPLETED", playerId: 1, challengeName: "  Dragon Slayer " })).toEqual({
      type: "CHALLENGE_COMPLETED",
      playerId: 1,
      challengeName: "Dragon Slayer",
    });
  });

  it.each([
    ["negative level", { type: "PLAYER_LEVELED_UP", playerId: 1, newLevel: -5 }],
    ["NaN level", { type: "PLAYER_LEVELED_UP", playerId: 1, newLevel: Number.NaN }],
    ["fractional player id", { type: "PLAYER_LEVELED_UP", playerId: 1.5, newLevel: 2 }],
    ["zero player id", { type: "NEW_FOLLOWER", followerId: 0, followedId: 1 }],
    ["empty challenge name", { type: "CHALLENGE_COMPLETED", playerId: 1, challengeName: "   " }],
    ["empty item id", { type: "ITEM_ACQUIRED", playerId: 1, itemId: "" }],
    ["unknown field", { type: "NEW_FOLLOWER", followerId: 2, followedId: 1, extra: true }],
    ["missing field", { type: "FRIEND_REQUEST_SENT", fromPlayerId: 3 }],
    ["unknown type", { type: "GUILD_INVITE", playerId: 1 }],
    ["not an object", "PLAYER_LEVELED_UP"],
  ])("rejects %s", (_label, input) => {
    expect(() => parseEventPayload(input)).toThrow(InvalidEventError);
  });
});

describe("references", () => {
  it("are declared explicitly per event type", () => {
    expect(playerIdsOf({ type: "ITEM_ACQUIRED", playerId: 2, itemId: "SwordOfAzeroth" })).toEqual([2]);
    expect(itemIdsOf({ type: "ITEM_ACQUIRED", playerId: 2, itemId: "SwordOfAzeroth" })).toEqual(["SwordOfAzeroth"]);
    expect(playerIdsOf({ type: "FRIEND_REQUEST_ACCEPTED", accepterId: 1, requesterId: 3 })).toEqual([1, 3]);
    expect(itemIdsOf({ type: "NEW_FOLLOWER", followerId: 2, followedId: 1 })).toEqual([]);
  });

  it("every event type declares at least one player reference", () => {
    for (const type of EVENT_TYPES) expect(EVENT_REFERENCES[type].players.length).toBeGreaterThan(0);
  });

  it("finds unknown players and items with one rule", () => {
    expect(findUnknownReferences({ type: "FRIEND_REQUEST_SENT", fromPlayerId: 77, toPlayerId: 1 }, ctx)).toEqual({
      players: [77],
      items: [],
    });
    expect(findUnknownReferences({ type: "ITEM_ACQUIRED", playerId: 2, itemId: "SwordOfAzerot" }, ctx)).toEqual({
      players: [],
      items: ["SwordOfAzerot"],
    });
    expect(findUnknownReferences({ type: "ITEM_ACQUIRED", playerId: 2, itemId: "SwordOfAzeroth" }, ctx)).toBeUndefined();
  });
});
