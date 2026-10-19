# Architecture Context

## Stack

| Layer      | Technology                 | Role                                          |
| ---------- | -------------------------- | --------------------------------------------- |
| Language   | TypeScript 5 (strict), ESM | Whole codebase                                |
| Runtime    | Node.js ≥ 20               | CLI demo and server                           |
| HTTP       | Express 4                  | Demo REST API + static page                   |
| Real-time  | `ws` 8                     | Push notifications to connected game clients  |
| Validation | zod 3                      | Validate HTTP / WebSocket input at the edge   |
| Tests      | Vitest 4                   | Unit + integration tests                      |
| UI         | Vanilla HTML/CSS/JS        | One demo page with no build step (`public/`)  |

## Pipeline

```
Producer ──publish──▶ EventBus ──▶ NotificationService
                                     │ 1. NotificationFactory → formatter for event.type
                                     │ 2. formatter → [{recipient, Notification}] (or none)
                                     │ 3. PreferenceStore.isEnabled(recipient, category)?
                                     │ 4. NotificationRepository.save()
                                     ▼ 5. every NotificationChannel.send()  (allSettled)
                               InAppChannel ──▶ NotificationClient (console | websocket)
```

## System Boundaries

- `src/domain` — `Notification` class, categories, the domain
  event union. Pure types and values with no I/O and no imports
  from other layers.
- `src/catalog` — read-only reference data (player names, item
  names and rarity). Formatters use it to build messages.
- `src/preferences` — `PreferenceStore` port + in-memory adapter.
- `src/notifications` — formatters (one per event type), the
  factory (registry), the repository (inbox) and
  `NotificationService` (the orchestrator). All business rules
  live here.
- `src/channels` — `NotificationChannel` port + `InAppChannel`.
- `src/clients` — `NotificationClient` port (external delivery
  mechanism the brief tells us to mock) + console and WebSocket
  adapters.
- `src/events` — typed in-process `EventBus`.
- `src/producers` — simulated `GameEngine` and `SocialSystem`.
  They only publish events and know nothing about notifications.
- `src/composition.ts` — the only place that wires concrete
  classes together (manual dependency injection).
- `src/server` — demo delivery layer. `http.ts` (Express routes,
  zod-validated, calls producers and stores), `WebSocketHub.ts`
  (player id → sockets, heartbeat, `welcome` replay of the inbox),
  `schemas.ts`, and `createServer.ts` (server-side wiring plus the
  activity feed). No business rules live here.
- `src/logger.ts` — `Logger` port with console and silent
  implementations.
- `src/demo.ts` — CLI walkthrough of the brief's example triggers.
- `public/` — static demo page.

## Storage Model

- **In-memory `Map`s only** (the brief allows a simple map).
  - Preferences: `Map<PlayerId, Record<Category, boolean>>`.
  - Inbox: `Map<PlayerId, Notification[]>`, newest last, capped
    per player.
  - Catalogs: static seed data.
- Every store sits behind an interface, so a Postgres/Redis
  adapter is a new class plus one line in `composition.ts`.

## Auth and Access Model

- No authentication (out of scope). The demo client connects with
  `/ws?userId=<id>`, and the server checks that the id exists in
  `PlayerDirectory`.
- A socket only receives notifications addressed to its own player.
- In production the player id would come from a verified session
  token, never from the query string.

## Invariants

1. Producers never import from `notifications`, `channels` or
   `clients`. They only publish events.
2. The preference check happens before persistence and before any
   channel is called. A suppressed notification is never stored or
   sent.
3. Only formatters know message wording and recipient rules. The
   service is generic over event types.
4. A failing channel or client never stops other channels or
   crashes the event bus (errors are isolated and logged).
5. `src/domain` has no dependencies on other `src/` folders.
6. Concrete adapters are created only in `composition.ts`
   (and in tests).
