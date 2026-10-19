import type { DomainEvent, EventOfType, EventType } from "../domain/events.js";
import type { Logger } from "../logger.js";

export type EventHandler<E extends DomainEvent = DomainEvent> = (event: E) => void | Promise<void>;

/** Port: the platform's event transport. In-process today; a broker could implement it later. */
export interface EventBus {
  publish(event: DomainEvent): Promise<void>;
  subscribe<T extends EventType>(type: T, handler: EventHandler<EventOfType<T>>): () => void;
  subscribeAll(handler: EventHandler): () => void;
}

/**
 * Typed in-process pub/sub. publish() resolves once every handler has
 * settled, so callers (demo, tests, HTTP) can observe the outcome.
 * Handler errors are logged, never rethrown to the publisher.
 */
export class InMemoryEventBus implements EventBus {
  readonly #handlers = new Map<EventType | "*", Set<EventHandler>>();

  constructor(private readonly logger: Logger) {}

  subscribe<T extends EventType>(type: T, handler: EventHandler<EventOfType<T>>): () => void {
    return this.#add(type, handler as EventHandler);
  }

  subscribeAll(handler: EventHandler): () => void {
    return this.#add("*", handler);
  }

  async publish(event: DomainEvent): Promise<void> {
    const handlers = [...(this.#handlers.get(event.type) ?? []), ...(this.#handlers.get("*") ?? [])];
    const results = await Promise.allSettled(handlers.map(async (h) => h(event)));
    for (const r of results) {
      if (r.status === "rejected") {
        this.logger.error("Event handler failed", {
          eventType: event.type,
          error: r.reason instanceof Error ? r.reason.message : String(r.reason),
        });
      }
    }
  }

  #add(key: EventType | "*", handler: EventHandler): () => void {
    const set = this.#handlers.get(key) ?? new Set<EventHandler>();
    set.add(handler);
    this.#handlers.set(key, set);
    return () => set.delete(handler);
  }
}
