import { describe, expect, it, vi } from "vitest";
import type { NotificationChannel } from "../src/channels/NotificationChannel.js";
import { InAppChannel } from "../src/channels/InAppChannel.js";
import { RecordingNotificationClient } from "../src/clients/RecordingNotificationClient.js";
import { silentLogger, type Logger } from "../src/logger.js";
import { NotificationFactory } from "../src/notifications/NotificationFactory.js";
import { InMemoryNotificationRepository } from "../src/notifications/NotificationRepository.js";
import { NotificationService } from "../src/notifications/NotificationService.js";
import { InMemoryPreferenceStore } from "../src/preferences/InMemoryPreferenceStore.js";
import { at, ctx } from "./helpers/fixtures.js";

function setup(extraChannels: NotificationChannel[] = [], logger: Logger = silentLogger) {
  const client = new RecordingNotificationClient();
  const preferences = new InMemoryPreferenceStore();
  const repository = new InMemoryNotificationRepository();
  const service = new NotificationService(
    new NotificationFactory(ctx),
    preferences,
    repository,
    [new InAppChannel(client), ...extraChannels],
    logger,
  );
  return { client, preferences, repository, service };
}

const levelUp = { type: "PLAYER_LEVELED_UP", playerId: 1, newLevel: 15, occurredAt: at } as const;
const friendRequest = { type: "FRIEND_REQUEST_SENT", fromPlayerId: 3, toPlayerId: 1, occurredAt: at } as const;

describe("NotificationService", () => {
  it("creates, persists and delivers an allowed notification", async () => {
    const { client, repository, service } = setup();
    const result = await service.handle(levelUp);
    expect(result.sent).toHaveLength(1);
    expect(result.suppressed).toEqual([]);
    expect(client.delivered.map((n) => n.message)).toEqual(["Congratulations! You've reached level 15!"]);
    expect(repository.listFor(1)).toHaveLength(1);
  });

  it("suppresses a notification whose category is disabled: not stored, not sent", async () => {
    const { client, preferences, repository, service } = setup();
    preferences.update(1, { SOCIAL: false });
    const result = await service.handle(friendRequest);
    expect(result.sent).toEqual([]);
    expect(result.suppressed).toEqual([
      { userId: 1, type: "FRIEND_REQUEST", category: "SOCIAL", reason: "PREFERENCE_DISABLED" },
    ]);
    expect(client.delivered).toEqual([]);
    expect(repository.listFor(1)).toEqual([]);
  });

  it("only gates the disabled category", async () => {
    const { client, preferences, service } = setup();
    preferences.update(1, { SOCIAL: false });
    await service.handle(levelUp);
    expect(client.delivered).toHaveLength(1);
  });

  it("isolates a failing channel: others still deliver and the error is logged", async () => {
    const error = vi.fn();
    const broken: NotificationChannel = { name: "broken", send: () => Promise.reject(new Error("boom")) };
    const { client, service } = setup([broken], { ...silentLogger, error });
    const result = await service.handle(levelUp);
    expect(result.sent).toHaveLength(1);
    expect(client.delivered).toHaveLength(1);
    expect(error).toHaveBeenCalledWith("Channel delivery failed", expect.objectContaining({ channel: "broken", error: "boom" }));
  });

  it("notifies dispatch listeners, including for events that produce nothing", async () => {
    const { service } = setup();
    const listener = vi.fn();
    service.onDispatch(listener);
    await service.handle({ type: "ITEM_ACQUIRED", playerId: 2, itemId: "HealthPotion", occurredAt: at });
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ sent: [], suppressed: [] }));
  });
});

describe("InMemoryNotificationRepository", () => {
  it("returns newest first, honours limit, caps per player and tracks read state", async () => {
    const { repository, service } = setup();
    for (let level = 2; level <= 5; level++) await service.handle({ ...levelUp, newLevel: level });
    expect(repository.listFor(1, 2).map((n) => n.metadata.level)).toEqual([5, 4]);
    expect(repository.unreadCount(1)).toBe(4);

    const [latest] = repository.listFor(1);
    expect(repository.setRead(1, latest!.id, true)?.read).toBe(true);
    expect(repository.unreadCount(1)).toBe(3);
    expect(repository.setRead(1, latest!.id, false)?.read).toBe(false);
    expect(repository.setRead(1, "nope", true)).toBeUndefined();
    expect(repository.setRead(2, latest!.id, true)).toBeUndefined(); // another player's inbox

    expect(repository.markAllAsRead(1)).toBe(4);
    expect(repository.unreadCount(1)).toBe(0);
    expect(repository.markAllAsRead(1)).toBe(0);

    const capped = new InMemoryNotificationRepository(2);
    for (const n of repository.listFor(1)) capped.save(n);
    expect(capped.listFor(1)).toHaveLength(2);
  });
});
