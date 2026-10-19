# Progress Tracker

Update this file after every meaningful implementation change.

## Current Phase

- Complete; published to https://github.com/HasnatHassan/globalliNotifications

## Current Goal

- Do a final fresh-clone check.

## Completed

- Unit 0: Scaffold (git, package.json, strict tsconfig, vitest,
  context files, CLAUDE.md)
- Unit 1: Domain (`Notification`, categories, `DomainEvent` union),
  catalogs (players, items with rarity)
- Unit 2: `PreferenceStore` port + in-memory map (opt-in by default)
- Unit 3: One formatter per event type (8) + typed registry/factory;
  rare+ item rule; self-targeted events skipped
- Unit 4: `NotificationService` (create → gate → persist → fan out),
  `InAppChannel`, console/recording clients, inbox repository,
  channel error isolation, `onDispatch` hook
- Unit 5: `InMemoryEventBus`, `GameEngine`/`SocialSystem` producers,
  `composition.ts`, CLI demo
- Unit 6: Express API + zod validation, `WebSocketHub` (per-player
  sockets, heartbeat, inbox replay), activity feed, demo page
- Unit 7: README, `docs/DESIGN.md`, `docs/AI_USAGE.md`; dependency
  upgrades (0 audit findings)
- Unit 8: Read/unread notifications. `Notification.markAsUnread`;
  repository `setRead`, `markAllAsRead`, `unreadCount`;
  `PATCH /api/players/:id/notifications/:nid` `{ read }` and
  `POST …/notifications/read-all` (replace the old
  `POST …/:nid/read`); `read-state` WS message syncs other tabs; the
  demo page has an unread highlight, a per-item toggle,
  click-to-read, an unread badge and "Mark all read".

Status: 33 tests passing, `tsc` strict clean, `npm run demo` and
`npm start` verified; the browser demo was checked manually end to
end.

## In Progress

- None.

## Next Up

- None.

## Open Questions

Each question is resolved with the assumption shown, and each
assumption is documented in the README.

- The brief says a `Notification` class is "provided", but none was
  given. **Assumed:** we define it (id, userId, type, category,
  title, message, metadata, createdAt, read).
- Default preferences for a player with no saved settings.
  **Assumed:** all categories enabled (opt-out model).
- What counts as "rare or valuable"? **Assumed:** rarity `rare`,
  `epic` or `legendary`. Common and unknown items produce no
  notification.
- Who is notified on PvP? **Assumed:** the victim or loser only.
- Self-targeted social or PvP events. **Assumed:** no notification.

## Architecture Decisions

- **TypeScript + Node** (user choice). Strict typing makes event
  dispatch exhaustive at compile time.
- **In-process typed EventBus.** Decouples producers from the
  notification system, and its interface can later be backed by a
  broker.
- **Formatter registry (Strategy).** The only place that knows
  wording and recipients, which keeps the service Open/Closed.
- **Ports & adapters for preferences, inbox, channels, clients and
  the bus.** The brief asks us to mock the delivery client, and the
  same boundary makes testing trivial.
- **Manual DI in `composition.ts`.** No framework to explain, and
  wiring stays explicit.
- **Preference gate before persistence.** Disabled means not stored
  and not sent.
- **Read state lives on the server, not in the client.** It
  survives reloads, and the hub pushes `read-state` to the player's
  other connections, so multiple tabs or devices agree.
- **WebSocket hub configured through `attach(server, { isKnownPlayer, welcome })`.**
  Avoids a construction cycle between the hub and the notification
  system.

## Session Notes

- Node 25 used locally. `.nvmrc` pins 22 and `engines` requires ≥20.
- Dependencies are pinned exactly. express 4.22.3, ws 8.22.0, tsx
  4.23.15 and vitest 4.1.11 were chosen to clear `npm audit`.
