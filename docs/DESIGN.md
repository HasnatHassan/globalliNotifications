# Design Notes

Why the system is built the way it is, what it trades off, and what
extending it actually takes. Every claim here is backed by code or a
test. Known gaps are listed in §6.

## 1. Goals

1. **Producers don't know about notifications.** Gameplay code calls
   `gameEngine.playerLeveledUp(1, 15)` and nothing else.
2. **Event-specific logic lives in one place.** Wording, recipients
   and category sit in the event's formatter. The pipeline is generic.
3. **Untrusted input stops at the edge of the core, by one rule.**
   Producers reject malformed payloads and unknown players or items
   to the caller. The service re-applies the same reference check to
   anything arriving on the bus.
4. **Failures stay local.** One broken channel, handler or observer
   cannot stop the others.
5. **Small enough to defend line by line.** No DI container and no
   framework magic.

## 2. Patterns

| Pattern                       | Where                                                        | Why                                                                                    |
| ----------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| Event-driven / Observer       | `EventBus`, producers, `service.listenTo(bus)`               | Producers and consumers are decoupled. More consumers (analytics, achievements) can subscribe. |
| Strategy + typed registry     | `notifications/formatters/*`, `NotificationFactory`          | One file per event. `FormatterRegistry` is a mapped type, so a missing formatter fails to compile. |
| Ports & adapters              | `PreferenceStore`, `NotificationRepository`, `NotificationChannel`, `NotificationClient`, `EventBus`, `PlayerLookup`, `ItemLookup` | Adapters can be swapped and tests use fakes. Store ports are async so a database adapter fits. |
| Schema as single source       | `domain/eventSchemas.ts`                                     | Producers and HTTP validate with the same schemas. `satisfies` ties each schema to its TS type. `EVENT_REFERENCES` declares each event's player and item fields explicitly, typed against the event so a misspelt field fails to compile. |
| Value object                  | `Notification`                                               | Immutable. Read state changes replace the stored value, so no reference can mutate the inbox. |
| Idempotent consumer           | Notification id = `eventId:type:recipient`, `save()` returns false on a repeat | A redelivered event (normal with brokers) produces no second notification, within the dedupe window (§6). |
| Composition roots             | `composition.ts`, `server/createServer.ts`, `demo.ts`        | Wiring is explicit, and `NotificationSystem` exposes ports, not concrete stores. |

## 3. Key decisions

**Formatters decide recipients.** Friend-accepted notifies the
*requester*, and PvP notifies the *victim*. Keeping that next to the
wording puts everything about one event in one file.

**Preferences are checked before persistence.** A disabled category
is the player's choice, so storing the notification anyway would
resurface it in the inbox. Suppressions are reported through
`onDispatch`.

**Every notification gets exactly one outcome.** Clients report what
happened (`delivered` or `recipient-offline`), and the service
combines the channels' answers:

- `sent`: at least one channel delivered it to a live client.
- `offline`: accepted, but the player has no connection. It is
  replayed from the inbox on connect.
- `undelivered`: every channel failed or timed out. It is still
  stored and replayed.
- `suppressed`, `duplicates`, `failed` (processing threw), or the
  whole event is `rejected` (unknown reference).

Metrics built on `onDispatch` can therefore count real deliveries.

**One validation rule, two enforcement points.** Shape is checked by
`parseEventPayload`, and references (players *and* items) by
`findUnknownReferences`. Producers apply both and **throw
synchronously**, so `playerLeveledUp(1, -5)`,
`friendRequestSent(999, 1)` and `itemAcquired(2, "SwordOfAzerot")`
all fail the same way, at the call site, and publish nothing.
Synchronous rather than a rejected promise on purpose: the brief calls
producers fire-and-forget, and an un-awaited rejection would crash
the Node process. The
service applies the same reference check again because the bus may
carry events from publishers other than our producers. The HTTP
harness does no validation of its own; it maps the producers' errors
to 400/404.

**Failures are contained at every fan-out.**

- **Per channel:** isolated with `allSettled`, and each send is
  bounded by a timeout (default 5 s), so a hung push/email adapter
  counts as failed instead of freezing the pipeline.
- **Per notification:** each notification an event produces is
  processed in its own `try/catch`, so a failing preference lookup
  or inbox write for one recipient doesn't cost the others theirs.
- **Per listener and per bus handler:** isolated too.

**The bus contract is "accepted", not "processed".** `publish`
resolves once the event is queued, which is what Kafka, SQS or Redis
Streams can promise. The in-memory bus dispatches on a later
macrotask, one event at a time in publish order. `drain()` exists
only on the in-memory class, for tests, the CLI demo and shutdown.
The HTTP harness returns `202 Accepted` for the same reason.
Sequential dispatch keeps per-player ordering simple. The channel
timeout bounds how long one notification can hold up the queue.

**Bounded inbox.** A FIFO capped at 100 per player. Replay on
connect sends the whole inbox, and the unread count is computed over
the same window. The demo page trims its list to the same capacity,
so list and badge cannot disagree. The cost: once a player exceeds
100, the oldest notifications are dropped even if unread (see §6).

**Replay vs live race.** A connection is registered *before* its
inbox is loaded, so nothing published meanwhile is missed. Live
pushes are buffered until the welcome message is sent, and buffered
pushes the replay already contains are dropped by notification id.
The client also renders idempotently by id.

**Activity feed is an operator channel.** Dispatch outcomes go to
`/ws/activity` only, never to player sockets, and it can be switched
off (`ACTIVITY_FEED=off`). Cross-origin WebSocket upgrades are
refused, so a different web page cannot connect.

## 4. Tradeoffs

| Decision                        | Benefit                                         | Cost / risk                                                          |
| ------------------------------- | ----------------------------------------------- | -------------------------------------------------------------------- |
| In-process bus                  | Zero infrastructure                             | Events are lost on crash; single process only                        |
| Sequential dispatch + timeout   | Simple ordering; a hung channel is cut off      | A slow channel still delays later events by up to the timeout per notification. The real fix is a queue per channel (§5) |
| In-memory stores                | No setup for reviewers                          | Data is lost on restart                                              |
| Sync catalog ports              | Formatters stay synchronous and simple          | A real user service needs a local read model/cache behind `PlayerLookup` |
| Category-level preferences      | Exactly what the brief asks                     | No per-type or per-channel control yet (see §5)                      |
| At-most-once push + inbox replay | Simple; offline players catch up on connect    | No per-message acks; a dropped socket relies on the replay           |
| No auth                         | Out of scope; frictionless local demo           | Any local client can claim any `userId`                              |

## 5. Extending it

**Add an event type (e.g. Guild Invite).**

1. Add the event interface to the `DomainEvent` union
   (`domain/events.ts`).
2. Add its schema to `EVENT_PAYLOAD_SCHEMAS` and its player/item
   fields to `EVENT_REFERENCES`. Both are compile errors until you do.
3. Add a `NotificationType` member if it is a new kind of
   notification.
4. Add a formatter file and register it in `DEFAULT_FORMATTERS`.
   Compile error until you do.
5. Add a producer method for the subsystem that emits it.

The service, preferences, inbox, channels and HTTP validation need no
change. In the demo harness only, the `emit()` switch in `http.ts`
fails to compile until a case is added, and the page's `EVENTS` /
`ICONS` tables need an entry to offer it in the form.

**Swap in a database.** Implement `PreferenceStore` and
`NotificationRepository` (already async) and wire them in
`composition.ts`. The in-memory versions don't handle these, so a
database adapter must:

- Make `save` a single insert on a unique notification id, which
  keeps idempotency.
- Do capacity eviction in the same transaction, or as a background
  job.
- Page `listFor` instead of returning the whole inbox.
- Handle errors. A failed save currently fails the event's handler,
  and the bus logs it. With a broker, that becomes a retry.

**Use a broker.** Implement `EventBus` over Kafka/SQS. Run the
notification service as a consumer. The idempotent save already
handles redelivery. Per-player ordering requires partitioning by
recipient.

**Scale the WebSocket tier.** Sockets live on different nodes.
Publish deliveries to Redis pub/sub keyed by player, and have each
node's `WebSocketHub` push to the sockets it holds.
`PlayerMessenger` is the seam for this.

**Push or email channel.** Implement `NotificationChannel` (resolve
`delivered` or `recipient-offline`) and pass it in `extraChannels`.
Failure isolation, the timeout and the outcome accounting already
apply. For slow providers, put a queue per channel behind the
adapter, so the pipeline only waits for the enqueue. Per-channel
preferences would extend the `PreferenceStore` key to
`(category, channel)`.

**Per-type preferences, quiet hours, rate limits, digests.** Turn the
single preference check into a list of delivery policies that each
return `allow | suppress | defer`. Digests ("Bob and 4 others
followed you") need an aggregation step keyed by
`(recipient, type)` with a time window.

## 6. Known limits

- The inbox drops the oldest notifications past 100 per player,
  including unread ones. A real store would archive or paginate.
- Duplicate detection remembers the last 10,000 notification ids
  across all players (independent of inbox eviction). An event
  redelivered after that window would notify again. A database
  adapter would use a unique constraint, which has no window.
- `playerLeveledUp` doesn't check that the level is actually new
  (higher than before). The game engine owns level state, and the
  notification layer has none.
- `friendRequestAccepted(1, 3)` notifies player 3 without checking
  that a request was ever sent. The social system owns friendship
  state; the notification layer trusts its events.
- The channel timeout bounds channels only. A hung preference store
  or inbox would still hold the queue; a database adapter would set
  its own query timeouts.
- Ten distinct follow actions are ten events and ten notifications.
  Deduplicating *semantic* repeats (unfollow/refollow spam) belongs in
  the social system or a digest policy. The notification layer only
  deduplicates *redelivered* events.
- No authentication or per-message acknowledgement in the harness.
- English-only wording in formatters. i18n would return a message key
  plus params and render per locale.

## 7. Failure handling

| Failure                                      | Behavior                                                                     |
| -------------------------------------------- | ---------------------------------------------------------------------------- |
| Malformed producer input                     | `InvalidEventError` thrown synchronously at the call site, nothing published; HTTP 400 |
| Unknown player or item (e.g. an item-id typo) | `UnknownReferenceError` thrown synchronously, nothing published; HTTP 404   |
| Un-awaited producer call whose publish fails | No unhandled rejection (a handler is attached); awaiting callers still see it |
| Unknown reference arriving on the bus anyway | Service rejects the event before formatting and logs it                       |
| Same event delivered twice                   | Second save returns false; reported as a duplicate, nothing sent             |
| Channel throws (sync), rejects or hangs      | Logged (hangs cut off by the timeout); other channels still run; `undelivered` if none succeeded |
| Recipient not connected                      | `offline`; stored and replayed on connect                                    |
| Preference store or inbox throws for one notification | That notification is `failed`; the event's other notifications proceed |
| Dispatch listener throws                     | Logged; other listeners run; delivery unaffected                             |
| Bus handler throws                           | Logged; other handlers run; the publisher never sees it                      |
| Malformed WebSocket frame                    | That socket is dropped and logged; the server keeps running                  |
| Client stops answering pings                 | Terminated on the next heartbeat sweep                                       |
| Cross-origin WebSocket upgrade               | 403                                                                          |
| Body over 10 kB / malformed JSON             | 413 / 400                                                                    |
| Port already in use                          | Clear message, exit code 1                                                   |

## 8. Scope

The brief asks to focus on the required features and welcomes extras
once those are complete. The core (event handling, preferences,
notification creation and dispatch, the example triggers in
`npm run demo`) was finished and verified first. The HTTP/WebSocket
harness and demo page came after, live in `src/server` and `public/`,
and can be deleted without touching the core.

The core's abstractions each answer a stated requirement:

- **Ports** answer "mock the delivery mechanism" and "flexibility as
  the system grows".
- **The formatter registry** answers "determine the type of
  notification".
- **The injectable producer clock** exists so tests get deterministic
  event ids and times.
