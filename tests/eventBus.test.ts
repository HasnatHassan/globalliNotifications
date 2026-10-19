import { describe, expect, it, vi } from "vitest";
import { InMemoryEventBus } from "../src/events/EventBus.js";
import { silentLogger } from "../src/logger.js";
import { at } from "./helpers/fixtures.js";

const event = { type: "PLAYER_LEVELED_UP", playerId: 1, newLevel: 2, occurredAt: at } as const;

describe("InMemoryEventBus", () => {
  it("routes to typed and wildcard subscribers, and supports unsubscribe", async () => {
    const bus = new InMemoryEventBus(silentLogger);
    const typed = vi.fn();
    const other = vi.fn();
    const all = vi.fn();
    bus.subscribe("PLAYER_LEVELED_UP", typed);
    bus.subscribe("NEW_FOLLOWER", other);
    const off = bus.subscribeAll(all);

    await bus.publish(event);
    expect(typed).toHaveBeenCalledWith(event);
    expect(other).not.toHaveBeenCalled();
    expect(all).toHaveBeenCalledTimes(1);

    off();
    await bus.publish(event);
    expect(all).toHaveBeenCalledTimes(1);
  });

  it("never rethrows handler errors to the publisher", async () => {
    const error = vi.fn();
    const bus = new InMemoryEventBus({ ...silentLogger, error });
    const healthy = vi.fn();
    bus.subscribeAll(() => {
      throw new Error("bad handler");
    });
    bus.subscribeAll(healthy);
    await expect(bus.publish(event)).resolves.toBeUndefined();
    expect(healthy).toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith("Event handler failed", expect.objectContaining({ error: "bad handler" }));
  });
});
