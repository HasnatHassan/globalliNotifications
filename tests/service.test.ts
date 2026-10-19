import { describe, expect, it, vi } from "vitest";
import { InAppChannel } from "../src/channels/InAppChannel.js";
import type { NotificationChannel } from "../src/channels/NotificationChannel.js";
import type { NotificationClient } from "../src/clients/NotificationClient.js";
import { RecordingNotificationClient } from "../src/clients/RecordingNotificationClient.js";
import { silentLogger, type Logger } from "../src/logger.js";
import { DEFAULT_FORMATTERS, NotificationFactory } from "../src/notifications/NotificationFactory.js";
import { InMemoryNotificationRepository } from "../src/notifications/NotificationRepository.js";
import { NotificationService } from "../src/notifications/NotificationService.js";
import { InMemoryPreferenceStore } from "../src/preferences/InMemoryPreferenceStore.js";
import type { PreferenceStore } from "../src/preferences/PreferenceStore.js";
import { ctx, ev } from "./helpers/fixtures.js";

interface SetupOptions {
  channels?: NotificationChannel[];
  logger?: Logger;
  preferences?: PreferenceStore;
  factory?: NotificationFactory;
  channelTimeoutMs?: number;
}

function setup(options: SetupOptions = {}) {
  const client = new RecordingNotificationClient();
  const preferences = options.preferences ?? new InMemoryPreferenceStore();
  const repository = new InMemoryNotificationRepository();
  const service = new NotificationService(
    options.factory ?? new NotificationFactory(ctx),
    ctx,
    preferences,
    repository,
    options.channels ?? [new InAppChannel(client)],
    options.logger ?? silentLogger,
    options.channelTimeoutMs === undefined ? {} : { channelTimeoutMs: options.channelTimeoutMs },
  );
  return { client, preferences, repository, service };
}

const levelUp = () => ev({ type: "PLAYER_LEVELED_UP", playerId: 1, newLevel: 15 });
const friendRequest = () => ev({ type: "FRIEND_REQUEST_SENT", fromPlayerId: 3, toPlayerId: 1 });
const throwingChannel = (name: string): NotificationChannel => ({
  name,
  send: () => {
    throw new Error(`${name} exploded`); // synchronous throw, not a rejected promise
  },
});
const clientChannel = (client: NotificationClient) => new InAppChannel(client);

describe("NotificationService: pipeline", () => {
  it("creates, persists and delivers an allowed notification", async () => {
    const { client, repository, service } = setup();
    const result = await service.handle(levelUp());
    expect(result.sent).toHaveLength(1);
    expect(client.delivered.map((n) => n.message)).toEqual(["Congratulations! You've reached level 15!"]);
    expect(await repository.listFor(1)).toHaveLength(1);
  });

  it("suppresses a disabled category: not stored, not sent", async () => {
    const { client, preferences, repository, service } = setup();
    await preferences.update(1, { SOCIAL: false });
    const result = await service.handle(friendRequest());
    expect(result.suppressed).toEqual([{ userId: 1, type: "FRIEND_REQUEST", category: "SOCIAL", reason: "PREFERENCE_DISABLED" }]);
    expect(result.sent).toEqual([]);
    expect(client.delivered).toEqual([]);
    expect(await repository.listFor(1)).toEqual([]);
  });

  it("only gates the disabled category", async () => {
    const { client, preferences, service } = setup();
    await preferences.update(1, { SOCIAL: false });
    await service.handle(levelUp());
    expect(client.delivered).toHaveLength(1);
  });
});

describe("NotificationService: delivery outcomes", () => {
  it("reports an offline recipient as offline, not sent (still stored for replay)", async () => {
    const offlineClient: NotificationClient = { deliver: () => "recipient-offline" };
    const { repository, service } = setup({ channels: [clientChannel(offlineClient)] });
    const result = await service.handle(levelUp());
    expect(result.sent).toEqual([]);
    expect(result.offline).toHaveLength(1);
    expect(await repository.listFor(1)).toHaveLength(1);
  });

  it("counts as sent when any channel delivered", async () => {
    const offlineClient: NotificationClient = { deliver: () => "recipient-offline" };
    const { service } = setup({ channels: [clientChannel(offlineClient), clientChannel(new RecordingNotificationClient())] });
    expect((await service.handle(levelUp())).sent).toHaveLength(1);
  });

  it("counts as undelivered when every channel fails", async () => {
    const { repository, service } = setup({
      channels: [throwingChannel("a"), { name: "b", send: () => Promise.reject(new Error("down")) }],
    });
    const result = await service.handle(levelUp());
    expect([result.sent, result.offline]).toEqual([[], []]);
    expect(result.undelivered).toHaveLength(1);
    expect(await repository.listFor(1)).toHaveLength(1);
  });
});

describe("NotificationService: input it does not trust", () => {
  it("rejects events that reference unknown players or items, storing nothing", async () => {
    const { client, repository, service } = setup();
    const result = await service.handle(ev({ type: "FRIEND_REQUEST_SENT", fromPlayerId: 77, toPlayerId: 1 }));
    expect(result.rejected).toEqual({ reason: "UNKNOWN_REFERENCE", players: [77], items: [] });
    const item = await service.handle(ev({ type: "ITEM_ACQUIRED", playerId: 2, itemId: "SwordOfAzerot" }));
    expect(item.rejected).toEqual({ reason: "UNKNOWN_REFERENCE", players: [], items: ["SwordOfAzerot"] });
    expect(client.delivered).toEqual([]);
    expect(await repository.listFor(1)).toEqual([]);
  });

  it("ignores a redelivered event (same event id)", async () => {
    const { client, service } = setup();
    const event = levelUp();
    await service.handle(event);
    const again = await service.handle(event);
    expect(again.duplicates).toHaveLength(1);
    expect(again.sent).toEqual([]);
    expect(client.delivered).toHaveLength(1);
  });
});

describe("NotificationService: failure isolation", () => {
  it("a channel that throws synchronously does not skip later channels", async () => {
    const error = vi.fn();
    const later = new RecordingNotificationClient();
    const { service } = setup({ channels: [throwingChannel("broken"), clientChannel(later)], logger: { ...silentLogger, error } });
    const result = await service.handle(levelUp());
    expect(later.delivered).toHaveLength(1);
    expect(result.sent).toHaveLength(1);
    expect(error).toHaveBeenCalledWith("Channel delivery failed", expect.objectContaining({ channel: "broken", error: "broken exploded" }));
  });

  it("times out a channel that never responds, so it cannot stall the pipeline", async () => {
    const error = vi.fn();
    const hung: NotificationChannel = { name: "hung", send: () => new Promise(() => {}) };
    const delivered = new RecordingNotificationClient();
    const { service } = setup({ channels: [hung, clientChannel(delivered)], channelTimeoutMs: 20, logger: { ...silentLogger, error } });
    const result = await service.handle(levelUp());
    expect(result.sent).toHaveLength(1);
    expect(error).toHaveBeenCalledWith("Channel delivery failed", expect.objectContaining({ channel: "hung", error: "hung did not respond within 20ms" }));
  });

  it("isolates notifications from each other: one recipient's failure does not cost the others", async () => {
    // An event that notifies two players, and a preference store that fails for one of them.
    const factory = new NotificationFactory(ctx, {
      ...DEFAULT_FORMATTERS,
      PLAYER_DEFEATED: {
        category: "GAME",
        format: (e) =>
          [e.winnerId, e.loserId].map((recipientId) => ({ recipientId, type: "PVP_DEFEATED" as const, title: "t", message: "m" })),
      },
    });
    const store = new InMemoryPreferenceStore();
    const preferences: PreferenceStore = {
      get: (id) => store.get(id),
      update: (id, c) => store.update(id, c),
      isEnabled: async (id, category) => {
        if (id === 2) throw new Error("preference store timeout");
        return store.isEnabled(id, category);
      },
    };
    const { client, service } = setup({ factory, preferences });
    const result = await service.handle(ev({ type: "PLAYER_DEFEATED", winnerId: 2, loserId: 4 }));
    expect(result.failed).toEqual([expect.objectContaining({ userId: 2, error: "preference store timeout" })]);
    expect(result.sent.map((n) => n.userId)).toEqual([4]);
    expect(client.delivered.map((n) => n.userId)).toEqual([4]);
  });

  it("a throwing dispatch listener does not stop other listeners or fail the dispatch", async () => {
    const error = vi.fn();
    const { service } = setup({ logger: { ...silentLogger, error } });
    const healthy = vi.fn();
    service.onDispatch(() => {
      throw new Error("listener bug");
    });
    service.onDispatch(healthy);
    await expect(service.handle(levelUp())).resolves.toMatchObject({ sent: [expect.anything()] });
    expect(healthy).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledWith("Dispatch listener failed", expect.objectContaining({ error: "listener bug" }));
  });

  it("reports events that produce nothing to listeners", async () => {
    const { service } = setup();
    const listener = vi.fn();
    service.onDispatch(listener);
    await service.handle(ev({ type: "ITEM_ACQUIRED", playerId: 2, itemId: "HealthPotion" }));
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ sent: [], suppressed: [], undelivered: [], offline: [] }));
  });
});
