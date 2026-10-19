# Code Standards

## General

- Keep modules small and single-purpose: one formatter per file,
  one port per file.
- Depend on interfaces (ports), not concrete classes. Wire concrete
  classes only in `src/composition.ts`.
- Fix root causes. Do not layer workarounds.
- Do not invent product behavior that is not in
  `context/project-overview.md`. Log gaps as open questions in
  `progress-tracker.md`.

## TypeScript

- `strict` + `noUncheckedIndexedAccess` are on and must stay on.
- No `any`. Use discriminated unions (`DomainEvent`) and
  `Record<EventType, …>` so missing cases fail to compile.
- ESM with `NodeNext` resolution: relative imports end in `.js`.
- Use `import type` for type-only imports.
- Validate unknown input (HTTP bodies, params, WS query) with zod at
  the boundary. Internal code trusts typed values.

## Server (Express + ws)

- Route handlers parse input, call a producer or store, and shape
  the response. No business rules in handlers.
- Response shapes: success `{ data: … }`, error
  `{ error: { message, details? } }` with the right status code.
- The WebSocket hub only maps player id → sockets and serialises
  messages.

## Styling (demo page)

- Use the CSS custom property tokens from `context/ui-context.md`
  and no hardcoded colors outside `:root`.

## Errors and Logging

- Event handlers and channels must not throw into the bus. Catch,
  log with context (event type, recipient, channel), and continue.
- Use the injected `Logger` (`src/logger.ts`). Tests inject a silent
  logger.

## Data and Storage

- Every store has an interface plus an in-memory adapter.
- `Notification` is created only through formatters and the
  factory. Callers never build it ad hoc.

## Testing

- Every formatter has unit tests for its message, category and
  recipient.
- The service has tests for preference gating, persistence and
  channel error isolation.
- An integration test runs the brief's four triggers end to end
  through the real composition root with a recording client.

## File Organization

- `src/domain/` — types, events, `Notification` class
- `src/catalog/` — static reference data
- `src/preferences/` — preference port + adapter
- `src/notifications/` — formatters, factory, repository, service
- `src/channels/` — channel port + in-app channel
- `src/clients/` — delivery client port + console/ws adapters
- `src/events/` — event bus
- `src/producers/` — simulated game/social systems
- `src/server/` — HTTP + WS adapters
- `tests/` — Vitest specs mirroring `src/`
