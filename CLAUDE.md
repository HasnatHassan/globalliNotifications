# CLAUDE.md

Real-time notification system for a gaming platform (Globalli coding
challenge). TypeScript + Node, Express + ws for the live demo.

## Read first (spec-driven workflow)

Before any change, read the context files. They are the source of
truth:

1. `context/project-overview.md` — what we build, scope, success criteria
2. `context/architecture.md` — pipeline, boundaries, invariants
3. `context/code-standards.md` — TS/style/testing rules
4. `context/ui-context.md` — demo page tokens and layout
5. `context/ai-workflow-rules.md` — how to scope and sequence work
6. `context/progress-tracker.md` — current unit, open questions, ADRs

Work one unit at a time, and update `progress-tracker.md` when a unit
is done. If behavior is not specified, add an open question instead
of inventing it.

## Commands

```bash
npm install
npm run build      # tsc → dist/
npm test           # vitest
npm run typecheck  # src + tests
npm run demo       # CLI walkthrough of the brief's event triggers
npm start          # demo harness at http://localhost:3000 (PORT, ACTIVITY_FEED=off)
npm run dev        # server with tsx watch
```

## Key rules (summary — details in context/)

- Producers validate (via `src/domain/eventSchemas.ts`) and publish
  only. Only formatters know wording and recipients.
- Reject events naming unknown players; check preferences before
  persisting or sending.
- Isolate every fan-out (channels, handlers, listeners) against
  synchronous throws.
- Instantiate concrete classes only in composition roots
  (`src/composition.ts`, `src/server/createServer.ts`, `src/demo.ts`).
- The core never imports from `src/server` (the demo harness).
- ESM: relative imports end in `.js`.
