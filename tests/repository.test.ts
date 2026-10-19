import { describe, expect, it } from "vitest";
import { Notification } from "../src/domain/Notification.js";
import { InMemoryNotificationRepository } from "../src/notifications/NotificationRepository.js";
import { at } from "./helpers/fixtures.js";

const note = (i: number, userId = 1) =>
  new Notification({ id: `n${i}`, userId, type: "LEVEL_UP", category: "GAME", title: "t", message: `m${i}`, createdAt: at });

async function filled(count: number, capacity = 100) {
  const repo = new InMemoryNotificationRepository(capacity);
  for (let i = 1; i <= count; i++) await repo.save(note(i));
  return repo;
}

describe("InMemoryNotificationRepository", () => {
  it("lists newest first and honours limit", async () => {
    const repo = await filled(4);
    expect((await repo.listFor(1, 2)).map((n) => n.id)).toEqual(["n4", "n3"]);
  });

  it("returns nothing for a zero or negative limit", async () => {
    const repo = await filled(4);
    expect(await repo.listFor(1, 0)).toEqual([]);
    expect(await repo.listFor(1, -1)).toEqual([]);
  });

  it("is idempotent by notification id", async () => {
    const repo = await filled(1);
    expect(await repo.save(note(1))).toBe(false);
    expect(await repo.listFor(1)).toHaveLength(1);
  });

  it("still detects a duplicate after the original was evicted from the inbox", async () => {
    const repo = await filled(150, 100); // n1..n50 evicted
    expect(await repo.save(note(1))).toBe(false);
    expect((await repo.listFor(1)).some((n) => n.id === "n1")).toBe(false);
  });

  it("forgets ids beyond the dedupe window", async () => {
    const repo = new InMemoryNotificationRepository(2, 3);
    for (let i = 1; i <= 4; i++) await repo.save(note(i)); // window now n2..n4
    expect(await repo.save(note(1))).toBe(true);
    expect(await repo.save(note(4))).toBe(false);
  });

  it("requires a dedupe window at least as large as the inbox", () => {
    expect(() => new InMemoryNotificationRepository(100, 50)).toThrow(RangeError);
  });

  it("keeps the newest `capacity` entries, and listing and unread count cover the same window", async () => {
    const repo = await filled(130, 100);
    const inbox = await repo.listFor(1);
    expect(inbox).toHaveLength(100);
    expect(inbox[0]!.id).toBe("n130");
    expect(inbox.at(-1)!.id).toBe("n31");
    expect(await repo.unreadCount(1)).toBe(inbox.filter((n) => !n.read).length);
  });

  it("sets read state per player and rejects another player's notification", async () => {
    const repo = await filled(2);
    expect((await repo.setRead(1, "n1", true))?.read).toBe(true);
    expect(await repo.unreadCount(1)).toBe(1);
    expect((await repo.setRead(1, "n1", false))?.read).toBe(false);
    expect(await repo.setRead(1, "missing", true)).toBeUndefined();
    expect(await repo.setRead(2, "n1", true)).toBeUndefined();
  });

  it("marks all as read and reports how many changed", async () => {
    const repo = await filled(3);
    await repo.setRead(1, "n2", true);
    expect(await repo.markAllAsRead(1)).toBe(2);
    expect(await repo.unreadCount(1)).toBe(0);
    expect(await repo.markAllAsRead(1)).toBe(0);
  });

  it("hands out immutable values, so callers cannot change stored state", async () => {
    const repo = await filled(1);
    const [n] = await repo.listFor(1);
    expect(() => {
      (n as { read: boolean }).read = true;
    }).toThrow(TypeError);
    expect(await repo.unreadCount(1)).toBe(1);
  });
});
