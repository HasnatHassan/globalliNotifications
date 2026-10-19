# Design Notes

This document explains why the system is built the way it is, what
was traded off, and what extending it would involve.

## 1. Goals that shaped the design

1. **Producers must not know about notifications.** The game engine
   should not change when we add a channel or a new wording.
2. **Adding an event type should be local.** One file plus one
   registry entry.
3. **Every external dependency is swappable.** That covers delivery
   client, storage and transport. The brief explicitly says to mock
   the client, so the boundary exists anyway. We use it everywhere.
4. **Keep it small enough to defend line by line.** No DI container,
   no framework magic.

## 2. Patterns and why

| Pattern                         | Where                                          | Why                                                                                                   |
| ------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Event-driven / Observer         | `EventBus`, producers, `service.listenTo(bus)` | Decouples emitters from consumers. Other consumers (analytics, achievements) can subscribe later.    |
| Strategy + Registry             | `formatters/*`, `NotificationFactory`          | Event-specific logic sits in one place. The service is closed for modification.                      |
| Ports & Adapters (hexagonal)    | `PreferenceStore`, `NotificationRepository`, `NotificationChannel`, `NotificationClient`, `EventBus` | Swap in-memory for Postgres/Redis/Kafka/APNs without touching business logic. Tests use fakes. |
| Pipeline / orchestrator         | `NotificationService.handle`                   | One readable sequence: create → gate → persist → fan out.                                             |
| Composition root (manual DI)    | `composition.ts`, `server/createServer.ts`     | All wiring is explicit and in one place, which suits a codebase this size better than a container.   |
| Discriminated unions            | `DomainEvent`, `FormatterRegistry`             | A missing formatter or a misspelt field is a compile error, not a runtime bug.                       |

### Why formatters decide recipients

Recipient rules are event-specific. Friend-accepted notifies the
*requester*, not the actor, and PvP notifies the *victim*. Putting
them next to the wording keeps everything about one event in one
file. The service stays generic, so it is easy to test.

### Why check preferences before persisting

A disabled category means the player chose not to be bothered.
Storing the notification anyway would resurface it in the inbox and
break that choice. Suppressions are logged and exposed through
`onDispatch`, which is where metrics would hook in.

### Why category-level preferences

The brief asks for category-level preferences explicitly ("Game
Events", "Social Events"). Categories are a closed union
(`NOTIFICATION_CATEGORIES`), and each formatter declares its
category, so adding per-type preferences later is additive (see §4).

## 3. Tradeoffs

| Decision                                   | Benefit                                                  | Cost / risk                                                                 | When to revisit                         |
| ------------------------------------------ | -------------------------------------------------------- | --------------------------------------------------------------------------- | --------------------------------------- |
| In-process event bus                       | Zero infrastructure, synchronous to test                 | Events are lost on crash; single process only; no replay                    | Multiple instances, or events from other services |
| `publish()` awaits handlers                | Demo, tests and HTTP can observe outcomes deterministically | A slow handler delays the publisher                                       | Move to a queue so producers fire and forget |
| In-memory stores                           | Simple, fast, no setup for reviewers                     | Data is lost on restart; memory grows (inbox capped at 100 per player)      | Any real deployment                     |
| At-most-once real-time push + inbox        | Simple; the inbox covers offline players                 | A socket can drop a message mid-flight. The client then relies on inbox re-sync on reconnect. | Add acks / sequence numbers per client |
| Formatters as plain objects                | No class boilerplate; easy to test                       | Wording is hard-coded English                                               | i18n (see §4)                           |
| Express + `ws`                             | Ubiquitous and well understood                           | Fewer built-ins than e.g. Socket.IO (rooms, auto-reconnect)                 | If client features grow                 |
| No auth                                    | Out of scope; keeps the demo frictionless                | Anyone can connect as any player                                            | Before anything is exposed publicly     |

## 4. "What would it take to…" scenarios

**Add a new event type (for example Guild Invite).**
Add a member to the `DomainEvent` union, then a formatter in
`formatters/socialFormatters.ts`. TypeScript now flags
`DEFAULT_FORMATTERS` until you register it. Then add a producer
method and, for the demo, a zod schema entry. The service, channels
and preferences do not change.

**Add push notifications or email.**
Implement `NotificationChannel` (for example a `PushChannel` wrapping
APNs/FCM) and pass it in `extraChannels` in `composition.ts`. Failure
isolation already exists. Next steps: per-channel preferences (the
`PreferenceStore` key becomes `(category, channel)`), and only
sending push when the player is offline, by asking the hub for the
connection count.

**Per-event-type preferences ("mute PvP but keep level ups").**
Extend the store to
`{ categories: Record<Category, boolean>, types?: Partial<Record<NotificationType, boolean>> }`
and change `isEnabled(userId, category)` to
`isEnabled(userId, notification)`, where a type override beats its
category. It is a one-line change in the service and the formatters
stay the same.

**Quiet hours / do-not-disturb.**
Add a policy step between the preference check and delivery. Store
the notification as usual but defer the push (or send it silently).
This suggests turning the gate into a list of `DeliveryPolicy`
objects (`preferences`, `quietHours`, `rateLimit`) that each return
`allow | suppress | defer`.

**Batching / digests ("Bob and 4 others followed you").**
Introduce an aggregation step keyed by `(recipient, type)` with a
short window, implemented as a decorator around the channel or a
scheduled job reading the inbox. Formatters gain a `formatBatch`
method.

**Rate limiting / spam (a player spamming friend requests).**
A `DeliveryPolicy` with a per-(sender, recipient) token bucket. This
belongs in the social system too, but the notification layer should
defend itself.

**Scale horizontally (many server instances).**
1. Replace `InMemoryEventBus` with Kafka/SQS/Redis Streams behind
   the `EventBus` interface. Consumers become a separate worker
   service.
2. Persist preferences and the inbox (Postgres, or Redis for hot
   inbox data).
3. Player sockets live on different nodes. Publish deliveries to
   Redis pub/sub (or a channel per player), and each node's
   `WebSocketHub` pushes to the sockets it holds. `PlayerMessenger`
   is already the seam for this.
4. Make handling idempotent by using the event id as the
   notification id, so redeliveries from the broker do not duplicate
   notifications.

**Localisation.**
Formatters return a message key plus params
(`{ key: "levelUp", params: { level: 15 } }`) instead of a string.
The client, or a render step that knows the player's locale,
produces the text.

**Guaranteed delivery.**
Give each client a cursor (the last seen notification id or a
sequence number). On reconnect, the hub sends everything after the
cursor instead of the latest 50. The client acks pushes.

## 5. Failure handling

| Failure                         | Behavior                                                                                   |
| ------------------------------- | ------------------------------------------------------------------------------------------ |
| A channel/client throws         | Logged with channel, notification and user. Other channels still deliver (`allSettled`).  |
| An event handler throws         | Logged by the bus. Other handlers still run, and the publisher never sees the error.      |
| Recipient offline               | Notification stays in the inbox and is replayed in the `welcome` message on connect.      |
| Dead TCP connection             | 30 s ping/pong heartbeat terminates it and removes it from the player's socket set.       |
| Bad HTTP input / unknown player | 400 / 404 with `{ error: { message, details } }`. Nothing is published.                  |
| Unknown item id                 | Treated as common, so no notification.                                                     |
| Unknown player name             | Fallback `Player #<id>`, so a missing profile never blocks a notification.                |

## 6. Likely questions

- **Why not call the notification service directly from the game
  engine?** That couples gameplay code to notification concerns. It
  also blocks other consumers and makes moving to a broker a rewrite
  instead of an adapter swap.
- **Why is `publish` async and awaited?** It makes outcomes
  observable in tests, the demo and HTTP responses. In production the
  producer would publish to a broker and return immediately.
- **How do you guarantee every event type is handled?**
  `FormatterRegistry` is a mapped type over `EventType`, so a missing
  key fails `tsc`.
- **What happens if a player has two tabs open?** The hub keeps a
  `Set<WebSocket>` per player and pushes to every open one.
- **Where would you add metrics?** `service.onDispatch` (sent and
  suppressed counts per type) plus the error logs from channels and
  the bus.
- **How is this tested?** Unit tests per formatter and store, service
  tests with a recording client and a deliberately failing channel,
  an end-to-end test through the real composition root, and HTTP + WS
  tests against a server on a random port.
