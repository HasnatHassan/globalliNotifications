# Progress Tracker

Update this file after every meaningful implementation change.

## Current Phase

- In progress

## Current Goal

- Unit 1: Domain model and catalogs

## Completed

- Unit 0: Scaffold (git, package.json, strict tsconfig, vitest,
  context files, CLAUDE.md)

## In Progress

- None.

## Next Up

1. Domain: `Notification`, categories, event union, catalogs
2. Preferences store
3. Formatters + factory
4. Service + channels + clients + repository
5. EventBus + producers + CLI demo
6. HTTP + WebSocket server + demo page
7. README, docs/DESIGN.md, docs/AI_USAGE.md, publish to GitHub

## Open Questions

- The brief says a `Notification` class is "provided", but none was
  given. **Assumed:** we define it with the fields the brief implies
  (id, userId, type, category, message, createdAt, metadata, read).
- Default preferences for a player with no saved settings.
  **Assumed:** all categories are enabled (opt-out model).
- What counts as "rare or valuable"? **Assumed:** rarity `rare`,
  `epic` or `legendary` in `ItemCatalog`. `common`/`uncommon` items
  produce no notification. Unknown item ids are treated as
  `common`.

## Architecture Decisions

- **TypeScript + Node** (user choice). Strict typing makes event
  dispatch exhaustive at compile time.
- **In-process typed EventBus.** Decouples producers from the
  notification system, and its interface can later be backed by a
  broker.
- **Formatter registry (Strategy).** The only place that knows
  wording and recipients, which keeps the service Open/Closed.
- **Ports & adapters for preferences, inbox, channels and clients.**
  The brief asks us to mock the delivery client, and the same
  boundary makes testing trivial.
- **Manual DI in `composition.ts`.** No framework to explain, and
  wiring stays explicit.

## Session Notes

- Node 25 used locally. `.nvmrc` pins 22 and `engines` requires ≥20.
