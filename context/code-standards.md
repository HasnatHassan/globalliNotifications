# Code Standards

## General

- Keep modules small and single-purpose: one formatter per file, one
  port per file.
- Depend on interfaces (ports), not concrete classes. Instantiate
  concrete classes only in composition roots (`src/composition.ts`,
  `src/server/createServer.ts`, `src/demo.ts`) and tests.
- Fix root causes. Do not layer workarounds.
- Do not invent product behavior that is not in
  `context/project-overview.md`. Log gaps as open questions in
  `progress-tracker.md`.
- Docs state only what the code does. No test counts or claims a
  test doesn't back.

## TypeScript

- `strict`, `noUncheckedIndexedAccess` and
  `exactOptionalPropertyTypes` are on and must stay on.
- No `any`, and no `as never` to dodge it. Narrow with unions,
  `unknown` and schemas.
- Use discriminated unions (`DomainEvent`) and mapped types
  (`FormatterRegistry`, `EVENT_PAYLOAD_SCHEMAS satisfies …`) so a
  missing case fails to compile.
- ESM with `NodeNext` resolution: relative imports end in `.js`.
  Use `import type` for type-only imports.

## Validation

- Event payloads are validated by `parseEventPayload`
  (`src/domain/eventSchemas.ts`), the single definition used by
  producers and HTTP alike.
- Player and item reference fields are declared in
  `EVENT_REFERENCES`, never inferred from names or schema identity.
  Existence is checked only via `findUnknownReferences`, the one rule
  shared by producers and the service.
- HTTP-only input (route params, preference and read-state bodies)
  is validated in `src/server/schemas.ts`.

## Errors and Logging

- Anything that fans out (channels, bus handlers, dispatch
  listeners, the notifications of one event) must call each target
  through an `async` wrapper and `Promise.allSettled` or
  `try/catch`, so a synchronous throw cannot skip the rest.
- Every call to an external delivery mechanism has a timeout.
- Report outcomes truthfully: a client says whether it actually
  delivered (`delivered` vs `recipient-offline`).
- Every socket and socket server has an `error` handler.
- Map client errors to 4xx (400 invalid, 404 unknown, 413 too large).
  500 is only for genuine bugs.
- Use the injected `Logger`. Tests inject a silent logger.

## Server (demo harness)

- Route handlers parse input, call a producer or port, and shape the
  response. No business rules.
- Response shapes: `{ data }` or `{ error: { message, details? } }`.
- Player sockets carry only that player's data. Diagnostics go to the
  separate activity feed.

## Styling (demo page)

- Use the CSS custom property tokens from `context/ui-context.md`;
  no hardcoded colors outside `:root`.
- Render user-visible text with `textContent`, never `innerHTML`.

## Testing

- One behavior per `it`.
- Every formatter: message, category, recipient.
- Every failure-isolation rule has a test that uses a synchronous
  throw, not just a rejected promise.
- Server tests start a fresh server per test (port 0) and wait on
  events or sentinel messages, never fixed sleeps or polling loops.
