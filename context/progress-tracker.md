# Progress Tracker

Update this file after every meaningful implementation change.

## Current Phase

- Complete; published to https://github.com/HasnatHassan/globalliNotifications

## Current Goal

- Commit and push Units 10–12, then check a fresh clone and click
  through the demo page.

## Completed

- Unit 0: Scaffold (git, package.json, strict tsconfig, vitest,
  context files, CLAUDE.md)
- Unit 1: Domain (`Notification`, categories, `DomainEvent` union),
  catalogs
- Unit 2: `PreferenceStore` port + in-memory map
- Unit 3: Formatters + typed registry/factory; rare+ item rule;
  self-targeted events skipped
- Unit 4: `NotificationService`, `InAppChannel`, clients, inbox
  repository, `onDispatch`
- Unit 5: `InMemoryEventBus`, producers, `composition.ts`, CLI demo
- Unit 6: Demo harness: Express API, `WebSocketHub`, demo page
- Unit 7: README, `docs/DESIGN.md`, `docs/AI_USAGE.md`; dependency
  upgrades
- Unit 8: Read/unread state (`setRead`, `markAllAsRead`,
  `unreadCount`, PATCH/read-all endpoints, `read-state` sync, UI)
- Unit 9: Demo page fixes for apparent duplicates (idempotent
  render, live-only animation, stale-socket guard, double-submit
  guard, descriptive activity log)
- Unit 10: Hardening after code review:
  - Server stability: an `error` handler on every socket and socket
    server; a clear EADDRINUSE message; 413 for oversized bodies and
    400 only for real JSON parse errors.
  - Failure isolation: channels, bus handlers and dispatch listeners
    are isolated against synchronous throws; `sent` vs `undelivered`.
  - Validation: one set of domain event schemas used by producers
    and HTTP; producers reject bad input; the service rejects events
    naming unknown players; player fields found by schema identity
    (replaced by an explicit map in Unit 11).
  - Event ids, and notification ids derived from them, give
    idempotent saves.
  - Async ports (preferences, inbox). The bus resolves on acceptance
    and dispatches asynchronously in order.
  - Immutable `Notification`. Inbox capacity, replay and unread count
    agree.
  - Activity feed moved to `/ws/activity`, with a same-origin check
    on WebSocket upgrades.
  - `exactOptionalPropertyTypes` on; `engines` fixed; one formatter
    per file; `NotificationSystem` exposes ports only.
  - Tests: fresh server per test, no sleeps, and coverage of every
    reproduced bug.
  - Docs rewritten to match the code.
- Unit 11: Hardening after review round 2:
  - Per-channel send timeout (default 5 s), so a hung channel can't
    stall the pipeline.
  - Clients report `delivered` / `recipient-offline`; new `offline`
    outcome, so `sent` means actually delivered.
  - Duplicate detection gets its own window (10,000 ids),
    independent of inbox eviction.
  - One reference rule for players and items: producers reject to
    the caller (`UnknownReferenceError`), the service re-checks bus
    events, and HTTP only maps errors. Unknown item ids are now
    rejected.
  - Explicit `EVENT_REFERENCES` map replaces schema-identity
    detection.
  - Per-notification isolation inside one event (`failed` outcome).
  - Docs: git history described as it happened, the review named
    plainly as a separate AI session, scope note, new known limits.

- Unit 12: Audit against the brief:
  - Demo console error (`offline is not iterable`): caused by a server
    started before the latest build. `prestart`/`predemo` now rebuild
    first, and the page tolerates missing fields.
  - Producers validate synchronously, so the brief's fire-and-forget
    calls can't cause an unhandled rejection; a no-op handler is
    attached to the publish promise.
  - Documented that "new level" is not verified (the game engine owns
    level state).

Status: `npm test` green (also in shuffled order), `tsc` strict
clean, `npm run demo` verified, reviewer path (`npm install` then
`npm start` / `npm run demo` with no prior build) verified on a clean
copy. Units 10–12 are **not committed yet**. The browser page has not been re-checked by hand since
Unit 10.

## In Progress

- None.

## Next Up

- Commit Units 10–12, push, and check a fresh clone of `origin/main`.
- Manually click through the demo page in a browser.

## Open Questions

Each question is resolved with the assumption shown, and each
assumption is documented in the README.

- The brief says a `Notification` class is "provided", but none was
  given. **Assumed:** we define it as an immutable value object (id,
  userId, type, category, title, message, metadata, createdAt,
  read).
- Default preferences for a player with no saved settings.
  **Assumed:** every category is enabled until the player turns it
  off.
- What counts as "rare or valuable"? **Assumed:** rarity `rare`,
  `epic` or `legendary`. Common items produce no notification.
- Who is notified on PvP? **Assumed:** the victim or loser only.
- Self-targeted social or PvP events. **Assumed:** no notification.
- Inbox overflow. **Assumed:** keep the latest 100 per player,
  dropping the oldest even if unread (documented limit).
- Unknown item ids. **Assumed:** invalid input, rejected to the
  caller (a typo must not silently become "common").
- Friend accepted without a prior request. **Assumed:** not checked;
  the social system owns friendship state.

## Architecture Decisions

- **TypeScript + Node** (user choice). Strict typing makes event
  dispatch exhaustive at compile time.
- **EventBus contract = accepted, not processed.** A broker can
  implement it. In-memory dispatch is async and ordered; `drain()`
  is in-process only.
- **Formatter registry (Strategy).** The only place that knows
  wording and recipients.
- **Domain event schemas plus an explicit reference map as the
  single validation source.** Producers enforce it, the service
  re-checks as a guard, and HTTP only maps errors.
- **Per-channel timeout and truthful delivery status.** A hung
  channel is cut off; offline recipients are reported as `offline`.
- **Async store ports; sync catalog ports.** Stores may be remote.
  Catalogs are cached reference data used inside synchronous
  formatters.
- **Idempotency via event ids.** Notification id =
  `eventId:type:recipient`, and the repository rejects repeats within
  a 10,000-id window that is independent of inbox eviction.
- **Preference gate before persistence.** Disabled means not stored
  and not sent.
- **Read state on the server; `Notification` immutable.**
- **Activity feed separate from player sockets**, with a same-origin
  check on upgrades.
- **Composition roots:** `composition.ts` (core), `createServer.ts`
  (harness), `demo.ts` (CLI). The hub's player checks are late-bound
  to the system created right after it, because the hub is also that
  system's delivery client.

## Session Notes

- Node 25 used locally. `.nvmrc` pins 22, and `engines` is
  `^20.19.0 || >=22.12.0` (required by the Vitest toolchain).
- Dependencies are pinned exactly. express 4.22.3, ws 8.22.0, tsx
  4.23.15, vitest 4.1.11 and @types/ws 8.18.1 were chosen to clear
  `npm audit` and to type `ws`'s `autoPong` option.
