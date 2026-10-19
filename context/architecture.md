# Architecture Context

## Stack

| Layer      | Technology                 | Role                                                   |
| ---------- | -------------------------- | ------------------------------------------------------ |
| Language   | TypeScript 5 (strict), ESM | Whole codebase                                         |
| Runtime    | Node.js 20.19+ / 22.12+    | CLI demo and server                                    |
| Validation | zod 3                      | Event payload schemas (domain) and HTTP input          |
| HTTP       | Express 4                  | Demo harness REST API + static page                    |
| Real-time  | `ws` 8                     | Demo harness push to connected clients                 |
| Tests      | Vitest 4                   | Unit + integration tests                               |
| UI         | Vanilla HTML/CSS/JS        | One demo page with no build step (`public/`)           |

## Pipeline

```
Producer ── parseEventPayload + findUnknownReferences ── publish ──▶ EventBus
          (invalid → throws synchronously at the call site, nothing published)      (accepts; dispatches async, in order)
                                                                            │
                                                                            ▼
                                                  NotificationService.handle(event)
   1. findUnknownReferences (same rule, guard for any publisher)   → rejected (UNKNOWN_REFERENCE)
   2. NotificationFactory → formatter(event) → Notification[]      (id = eventId:type:recipient)
   for each notification, in its own try/catch                       (throws → failed)
   3. PreferenceStore.isEnabled(recipient, category)?   no → suppressed
   4. NotificationRepository.save()                      false → duplicate
   5. every NotificationChannel.send(), isolated + timeout:
        any "delivered" → sent · any "recipient-offline" → offline · none succeeded → undelivered
   6. dispatch listeners (isolated)
```

## System Boundaries

**Core** (the challenge deliverable):

- `src/domain`: events, event schemas (`parseEventPayload`), the
  explicit reference map (`EVENT_REFERENCES`,
  `findUnknownReferences`), `Notification`, categories. Depends only
  on zod.
- `src/catalog`: `PlayerLookup` / `ItemLookup` ports and seed data.
  Synchronous because this is cached reference data, not a store
  the pipeline writes to.
- `src/preferences`: `PreferenceStore` port (async) + in-memory
  adapter.
- `src/notifications`: formatters (one file per event type), factory
  (registry), `NotificationRepository` port (async) + bounded
  in-memory inbox, and `NotificationService`. All notification rules
  live here.
- `src/channels`: `NotificationChannel` port + `InAppChannel`.
- `src/clients`: `NotificationClient` port (the external delivery
  mechanism the brief says to mock) + console, recording and
  WebSocket clients.
- `src/events`: `EventBus` port + in-memory queue implementation.
- `src/producers`: simulated `GameEngine` / `SocialSystem`. They
  validate (shape and references) and publish, and know nothing
  about notifications.
- `src/composition.ts`: core composition root. It returns
  `NotificationSystem`, which exposes ports only.

**Demo harness** (optional, depends on the core, never the reverse):

- `src/server`: `http.ts` (routes), `WebSocketHub.ts` (player
  sockets, heartbeat, inbox replay with buffering), `ActivityFeed.ts`
  (operator socket), `createServer.ts` (server composition root,
  upgrade routing, origin check), `index.ts` (process entry).
- `public/`: demo page.
- `src/demo.ts`: CLI composition root and walkthrough.

## Storage Model

- In-memory adapters behind async ports:
  - Preferences: `Map<PlayerId, Record<Category, boolean>>`. Only
    boolean values for known categories are stored.
  - Inbox: `Map<PlayerId, Notification[]>`, a FIFO capped at
    `INBOX_CAPACITY` (100). Listing, replay and unread count all
    cover the same window. `save` is idempotent by notification id
    over a separate window of the last `DEDUPE_WINDOW` (10,000) ids,
    independent of inbox eviction.
- `Notification` is immutable. Read-state changes replace the stored
  value, so a reference held elsewhere cannot alter stored state.
- A database adapter implements the same async interfaces and is
  wired in `composition.ts`. What it adds and the in-memory version
  does not handle (transactions, retries, pagination) is listed in
  `docs/DESIGN.md`.

## Auth and Access Model

- No authentication (out of scope). The harness takes `userId` on
  connect and checks that the player exists. Acceptable for a local
  demo only.
- WebSocket upgrades carrying a foreign `Origin` are refused (403),
  so other web pages cannot read a player's stream. Clients without
  an `Origin` header (non-browser) are allowed.
- A player socket receives only that player's notifications and
  read-state changes. Dispatch outcomes go only to `/ws/activity`,
  which is an operator feed (behind admin auth, or absent, in
  production).

## Invariants

1. Producers never import from `notifications`, `channels` or
   `clients`. They validate and publish only.
2. One reference rule (`findUnknownReferences`, players and items).
   Producers throw at the call site; the service rejects bus events
   that violate it before any notification is built.
3. The preference check happens before persistence and before any
   channel is called. Suppressed notifications are never stored or
   sent.
4. Only formatters know message wording and recipient rules.
5. A failing channel, bus handler, dispatch listener or individual
   notification (sync throw or rejection) never stops the others and
   never surfaces to the publisher. Every channel send has a timeout.
6. `sent` means delivered to a live client by at least one channel.
   An offline recipient is `offline`, not `sent`.
7. Concrete classes are instantiated only in composition roots
   (`composition.ts`, `server/createServer.ts`, `demo.ts`) and tests.
8. The core never imports from `src/server`.
