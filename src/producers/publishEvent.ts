import { randomUUID } from "node:crypto";
import { findUnknownReferences, parseEventPayload, UnknownReferenceError, type ReferenceLookups } from "../domain/eventSchemas.js";
import type { AnyEventPayload, DomainEvent } from "../domain/events.js";
import type { EventBus } from "../events/EventBus.js";

/** Injectable id/time source so tests get deterministic events. */
export interface ProducerClock {
  now(): Date;
  newId(): string;
}

export const systemClock: ProducerClock = { now: () => new Date(), newId: randomUUID };

export interface ProducerDeps {
  readonly bus: EventBus;
  /** Players and items the event may reference. */
  readonly references: ReferenceLookups;
  readonly clock?: ProducerClock;
}

/**
 * The one validation path for every producer call.
 *
 * Invalid input (InvalidEventError, UnknownReferenceError) throws
 * synchronously at the call site, like any argument error, and nothing is
 * published. That matters because platform code calls producers
 * fire-and-forget (`gameEngine.playerLeveledUp(1, 15);`): a rejected promise
 * nobody awaits would be an unhandled rejection and take the process down.
 *
 * The returned promise resolves when the bus has accepted the event. A
 * no-op handler is attached so an un-awaited publish failure cannot crash
 * the process either; callers that await still see the rejection. Logging
 * and retrying publish failures is the bus adapter's job.
 */
export function publishEvent({ bus, references, clock = systemClock }: ProducerDeps, payload: AnyEventPayload): Promise<void> {
  const valid = parseEventPayload(payload);
  const unknown = findUnknownReferences(valid, references);
  if (unknown) throw new UnknownReferenceError(unknown);
  const accepted = bus.publish({ ...valid, id: clock.newId(), occurredAt: clock.now() } as DomainEvent);
  accepted.catch(() => {});
  return accepted;
}
