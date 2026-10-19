import { describe, expect, it, vi } from "vitest";
import { InvalidEventError, UnknownReferenceError } from "../src/domain/eventSchemas.js";
import type { EventBus } from "../src/events/EventBus.js";
import { GameEngine } from "../src/producers/GameEngine.js";
import { SocialSystem } from "../src/producers/SocialSystem.js";
import { at, ctx } from "./helpers/fixtures.js";

function deps() {
  const publish = vi.fn<EventBus["publish"]>(async () => {});
  const bus: EventBus = { publish, subscribe: () => () => {}, subscribeAll: () => () => {} };
  return { publish, deps: { bus, references: ctx, clock: { now: () => at, newId: () => "evt-1" } } };
}

describe("producers", () => {
  it("stamp id and time and publish the brief's events", async () => {
    const { publish, deps: d } = deps();
    await new GameEngine(d).playerLeveledUp(1, 15);
    await new SocialSystem(d).friendRequestAccepted(1, 3);
    expect(publish.mock.calls.map(([e]) => e)).toEqual([
      { type: "PLAYER_LEVELED_UP", playerId: 1, newLevel: 15, id: "evt-1", occurredAt: at },
      { type: "FRIEND_REQUEST_ACCEPTED", accepterId: 1, requesterId: 3, id: "evt-1", occurredAt: at },
    ]);
  });

  it.each([
    ["level -5", (g: GameEngine) => g.playerLeveledUp(1, -5)],
    ["NaN level", (g: GameEngine) => g.playerLeveledUp(1, Number.NaN)],
    ["empty challenge", (g: GameEngine) => g.challengeCompleted(1, "")],
    ["non-integer player", (g: GameEngine) => g.playerAttacked(1.5, 2)],
  ])("throw on malformed input (%s) at the call site, without publishing", (_label, call) => {
    const { publish, deps: d } = deps();
    expect(() => call(new GameEngine(d))).toThrow(InvalidEventError);
    expect(publish).not.toHaveBeenCalled();
  });

  it.each([
    ["unknown sender", (s: SocialSystem) => s.friendRequestSent(999, 1), { players: [999], items: [] }],
    ["unknown recipient", (s: SocialSystem) => s.playerFollowed(1, 999), { players: [999], items: [] }],
  ])("throw on %s at the call site, without publishing", (_label, call, unknown) => {
    const { publish, deps: d } = deps();
    expect(() => call(new SocialSystem(d))).toThrow(expect.objectContaining({ name: "UnknownReferenceError", unknown }));
    expect(publish).not.toHaveBeenCalled();
  });

  it("throw on an unknown item id instead of silently treating it as common", () => {
    const { publish, deps: d } = deps();
    expect(() => new GameEngine(d).itemAcquired(2, "SwordOfAzerot")).toThrow(UnknownReferenceError);
    expect(publish).not.toHaveBeenCalled();
  });

  it("a fire-and-forget call whose publish fails does not cause an unhandled rejection", async () => {
    const { deps: d } = deps();
    const failing = { ...d, bus: { ...d.bus, publish: () => Promise.reject(new Error("broker down")) } };
    const engine = new GameEngine(failing);
    engine.playerLeveledUp(1, 15); // brief-style call: not awaited
    await new Promise((resolve) => setImmediate(resolve)); // vitest fails the run on unhandled rejections
    await expect(engine.playerLeveledUp(1, 16)).rejects.toThrow("broker down"); // awaiting callers still see it
  });
});
