import { describe, expect, it, vi } from "vitest";
import { InMemoryEventBus } from "../src/events/EventBus.js";
import { silentLogger } from "../src/logger.js";
import { ev } from "./helpers/fixtures.js";

const levelUp = (newLevel: number) => ev({ type: "PLAYER_LEVELED_UP", playerId: 1, newLevel });

describe("InMemoryEventBus", () => {
  it("publish resolves on acceptance, before handlers run (broker semantics)", async () => {
    const bus = new InMemoryEventBus(silentLogger);
    const handler = vi.fn();
    bus.subscribeAll(handler);
    await bus.publish(levelUp(2));
    expect(handler).not.toHaveBeenCalled();
    await bus.drain();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("delivers events one at a time, in publish order", async () => {
    const bus = new InMemoryEventBus(silentLogger);
    const seen: number[] = [];
    bus.subscribeAll(async (e) => {
      if (e.type !== "PLAYER_LEVELED_UP") return;
      await new Promise((r) => setTimeout(r, 5 - e.newLevel)); // later events finish faster if run concurrently
      seen.push(e.newLevel);
    });
    await Promise.all([1, 2, 3, 4].map((n) => bus.publish(levelUp(n))));
    await bus.drain();
    expect(seen).toEqual([1, 2, 3, 4]);
  });

  it("routes to typed and wildcard subscribers, and supports unsubscribe", async () => {
    const bus = new InMemoryEventBus(silentLogger);
    const typed = vi.fn();
    const other = vi.fn();
    const all = vi.fn();
    bus.subscribe("PLAYER_LEVELED_UP", typed);
    bus.subscribe("NEW_FOLLOWER", other);
    const off = bus.subscribeAll(all);
    await bus.publish(levelUp(2));
    await bus.drain();
    off();
    await bus.publish(levelUp(3));
    await bus.drain();
    expect(typed).toHaveBeenCalledTimes(2);
    expect(other).not.toHaveBeenCalled();
    expect(all).toHaveBeenCalledTimes(1);
  });

  it("isolates handler errors (sync or async) from other handlers and the publisher", async () => {
    const error = vi.fn();
    const bus = new InMemoryEventBus({ ...silentLogger, error });
    const healthy = vi.fn();
    bus.subscribeAll(() => {
      throw new Error("sync bug");
    });
    bus.subscribeAll(async () => {
      throw new Error("async bug");
    });
    bus.subscribeAll(healthy);
    await expect(bus.publish(levelUp(2))).resolves.toBeUndefined();
    await bus.drain();
    expect(healthy).toHaveBeenCalled();
    expect(error).toHaveBeenCalledTimes(2);
  });
});
