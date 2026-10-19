import type { DomainEvent, EventOfType, EventType } from "../domain/events.js";
import type { Logger } from "../logger.js";

export type EventHandler<E extends DomainEvent = DomainEvent> = (event: E) => void | Promise<void>;

/**
 * Port: the platform's event transport.
 * `publish` resolves once the event is accepted for delivery, NOT when
 * handlers have finished. That is the contract a broker (Kafka, SQS, Redis
 * Streams) can actually honour, so callers must not depend on handler
 * completion.
 */
export interface EventBus {
  publish(event: DomainEvent): Promise<void>;
  subscribe<T extends EventType>(type: T, handler: EventHandler<EventOfType<T>>): () => void;
  subscribeAll(handler: EventHandler): () => void;
}

/**
 * In-process implementation. Events are queued and dispatched asynchronously,
 * one at a time in publish order; the handlers for one event run concurrently
 * and their errors are logged, never surfaced to the publisher.
 */
export class InMemoryEventBus implements EventBus {
  readonly #handlers = new Map<EventType | "*", Set<EventHandler>>();
  readonly #queue: DomainEvent[] = [];
  #draining: Promise<void> | undefined;

  constructor(private readonly logger: Logger) {}

  subscribe<T extends EventType>(type: T, handler: EventHandler<EventOfType<T>>): () => void {
    return this.#add(type, handler as EventHandler);
  }

  subscribeAll(handler: EventHandler): () => void {
    return this.#add("*", handler);
  }

  async publish(event: DomainEvent): Promise<void> {
    this.#queue.push(event);
    this.#schedule();
  }

  /**
   * Resolves when every event published so far has been handled.
   * In-process only (not part of the port): used by tests, the CLI demo and
   * graceful shutdown.
   */
  async drain(): Promise<void> {
    while (this.#draining) await this.#draining;
  }

  #schedule(): void {
    if (this.#draining) return;
    this.#draining = (async () => {
      // Defer to a macrotask: handlers never run inside, or before the caller resumes from, publish().
      await new Promise<void>((resolve) => setImmediate(resolve));
      for (let event = this.#queue.shift(); event; event = this.#queue.shift()) await this.#dispatch(event);
    })().finally(() => {
      this.#draining = undefined;
      if (this.#queue.length > 0) this.#schedule(); // published between the loop ending and this callback
    });
  }

  async #dispatch(event: DomainEvent): Promise<void> {
    const handlers = [...(this.#handlers.get(event.type) ?? []), ...(this.#handlers.get("*") ?? [])];
    const results = await Promise.allSettled(handlers.map(async (h) => h(event)));
    for (const r of results) {
      if (r.status === "rejected") {
        this.logger.error("Event handler failed", {
          eventId: event.id,
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
