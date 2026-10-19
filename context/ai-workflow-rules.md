# AI Workflow Rules

## Approach

Build the project in small steps using a spec-driven workflow. The
six files in `context/` define what to build
(`project-overview.md`), how it is structured (`architecture.md`),
how code is written (`code-standards.md`), how the demo UI looks
(`ui-context.md`), how the AI works (this file) and where things
stand (`progress-tracker.md`). Always implement against these
specs. Do not infer or invent behavior from scratch.

## Scoping Rules

- Work on one feature unit at a time (see units in
  `progress-tracker.md`).
- Prefer small, verifiable increments over large speculative changes.
- Do not combine unrelated system boundaries in a single step.

## When to Split Work

Split an implementation step if it combines:

- Core domain/pipeline changes and server/UI changes
- More than one new port/adapter pair
- Behavior that the context files do not clearly define

If a change cannot be verified end to end quickly, the scope is too
broad. Split it.

## Handling Missing Requirements

- Do not invent product behavior that the context files do not define.
- If a requirement is ambiguous, resolve it in the relevant context
  file before implementing it.
- If a requirement is missing, add it as an open question in
  `progress-tracker.md` before continuing.

## Protected Files

Do not modify the following unless explicitly instructed:

- `context/project-overview.md` scope sections (product scope changes
  need the user's decision)
- `package-lock.json` by hand (only through npm)
- Anything in `node_modules/` or `dist/`

## Keeping Docs in Sync

Update the relevant context file whenever implementation changes:

- System architecture or boundaries → `architecture.md`
- Storage model decisions → `architecture.md`
- Code conventions or standards → `code-standards.md`
- Feature scope → `project-overview.md`
- Design rationale / tradeoffs → `docs/DESIGN.md`

## Before Moving to the Next Unit

1. The current unit works end to end within its defined scope.
2. No invariant defined in `architecture.md` was violated.
3. `progress-tracker.md` reflects the completed work.
4. `npm run build` and `npm test` pass.
