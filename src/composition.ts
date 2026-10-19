import { ItemCatalog, SEED_ITEMS } from "./catalog/ItemCatalog.js";
import { PlayerDirectory, SEED_PLAYERS } from "./catalog/PlayerDirectory.js";
import { InAppChannel } from "./channels/InAppChannel.js";
import type { NotificationChannel } from "./channels/NotificationChannel.js";
import type { NotificationClient } from "./clients/NotificationClient.js";
import { InMemoryEventBus } from "./events/EventBus.js";
import { consoleLogger, type Logger } from "./logger.js";
import { NotificationFactory } from "./notifications/NotificationFactory.js";
import { InMemoryNotificationRepository } from "./notifications/NotificationRepository.js";
import { NotificationService } from "./notifications/NotificationService.js";
import { InMemoryPreferenceStore } from "./preferences/InMemoryPreferenceStore.js";
import { GameEngine } from "./producers/GameEngine.js";
import { SocialSystem } from "./producers/SocialSystem.js";

export interface AppOptions {
  /** Delivery mechanism for the in-app channel (console, WebSocket, test recorder). */
  client: NotificationClient;
  logger?: Logger;
  /** Additional channels (e.g. push/email adapters) to fan out to. */
  extraChannels?: NotificationChannel[];
}

/**
 * Composition root: the only place concrete implementations are chosen and wired.
 * Swapping an adapter (DB-backed preferences, Kafka bus, push channel) is a change here only.
 */
export function createNotificationSystem(options: AppOptions) {
  const logger = options.logger ?? consoleLogger;

  const players = new PlayerDirectory(SEED_PLAYERS);
  const items = new ItemCatalog(SEED_ITEMS);
  const preferences = new InMemoryPreferenceStore();
  const repository = new InMemoryNotificationRepository();
  const factory = new NotificationFactory({ players, items });
  const channels: NotificationChannel[] = [new InAppChannel(options.client), ...(options.extraChannels ?? [])];
  const service = new NotificationService(factory, preferences, repository, channels, logger);

  const bus = new InMemoryEventBus(logger);
  service.listenTo(bus);

  return {
    bus,
    players,
    items,
    preferences,
    repository,
    service,
    gameEngine: new GameEngine(bus),
    socialSystem: new SocialSystem(bus),
  };
}

export type NotificationSystem = ReturnType<typeof createNotificationSystem>;
