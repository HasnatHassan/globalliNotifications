import { ItemCatalog, SEED_ITEMS, type ItemLookup } from "./catalog/ItemCatalog.js";
import { PlayerDirectory, SEED_PLAYERS, type PlayerLookup } from "./catalog/PlayerDirectory.js";
import { InAppChannel } from "./channels/InAppChannel.js";
import type { NotificationChannel } from "./channels/NotificationChannel.js";
import type { NotificationClient } from "./clients/NotificationClient.js";
import { InMemoryEventBus, type EventBus } from "./events/EventBus.js";
import { consoleLogger, type Logger } from "./logger.js";
import { NotificationFactory } from "./notifications/NotificationFactory.js";
import { InMemoryNotificationRepository, type NotificationRepository } from "./notifications/NotificationRepository.js";
import { NotificationService, type DispatchListener } from "./notifications/NotificationService.js";
import { InMemoryPreferenceStore } from "./preferences/InMemoryPreferenceStore.js";
import type { PreferenceStore } from "./preferences/PreferenceStore.js";
import { GameEngine } from "./producers/GameEngine.js";
import { SocialSystem } from "./producers/SocialSystem.js";

export interface AppOptions {
  /** Delivery mechanism for the in-app channel (console, WebSocket, test recorder). */
  client: NotificationClient;
  logger?: Logger;
  /** Additional channels (e.g. push/email adapters) to fan out to. */
  extraChannels?: NotificationChannel[];
  /** Upper bound per channel send (default 5s). */
  channelTimeoutMs?: number;
}

/** What callers (server, demo, tests) may depend on: ports and producers only, no concrete stores. */
export interface NotificationSystem {
  readonly players: PlayerLookup;
  readonly items: ItemLookup;
  readonly preferences: PreferenceStore;
  readonly repository: NotificationRepository;
  readonly bus: EventBus;
  readonly gameEngine: GameEngine;
  readonly socialSystem: SocialSystem;
  onDispatch(listener: DispatchListener): () => void;
  /** Resolves when every published event has been processed. In-process runtime only (tests, demo, shutdown). */
  drain(): Promise<void>;
}

/**
 * Core composition root: the one place the core's concrete adapters are chosen.
 * Swapping an adapter (database-backed stores, a broker-backed bus) is a change
 * here plus the new adapter class; consumers only see the ports above.
 */
export function createNotificationSystem(options: AppOptions): NotificationSystem {
  const logger = options.logger ?? consoleLogger;

  const players = new PlayerDirectory(SEED_PLAYERS);
  const items = new ItemCatalog(SEED_ITEMS);
  const preferences = new InMemoryPreferenceStore();
  const repository = new InMemoryNotificationRepository();
  const factory = new NotificationFactory({ players, items });
  const channels: NotificationChannel[] = [new InAppChannel(options.client), ...(options.extraChannels ?? [])];
  const references = { players, items };
  const service = new NotificationService(
    factory,
    references,
    preferences,
    repository,
    channels,
    logger,
    options.channelTimeoutMs === undefined ? {} : { channelTimeoutMs: options.channelTimeoutMs },
  );

  const bus = new InMemoryEventBus(logger);
  service.listenTo(bus);

  return {
    players,
    items,
    preferences,
    repository,
    bus,
    gameEngine: new GameEngine({ bus, references }),
    socialSystem: new SocialSystem({ bus, references }),
    onDispatch: (listener) => service.onDispatch(listener),
    drain: () => bus.drain(),
  };
}
