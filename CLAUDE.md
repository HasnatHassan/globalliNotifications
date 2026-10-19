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
npm start          # http://localhost:3000 live demo (PORT env to override)
npm run dev        # server with tsx watch
```

## Key rules (summary — details in context/)

- Producers only publish events. Only formatters know wording and
  recipients.
- Check preferences before persisting or sending.
- Wire concrete classes only in `src/composition.ts`.
- ESM: relative imports end in `.js`.
