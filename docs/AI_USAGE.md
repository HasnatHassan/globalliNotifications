# AI Usage: Process, Prompts and Tools

This project was built with **Claude Code** (Anthropic's agentic
coding CLI, running inside VS Code), using a **spec-driven, context
file workflow**. This document records how the requirements became
working code, and where the human stayed in the loop.

## Tools

| Tool                         | Used for                                                                 |
| ---------------------------- | ------------------------------------------------------------------------ |
| Claude Code (VS Code)        | Planning, implementation, running build/tests/demo, docs                 |
| Claude Code **plan mode**    | Read-only planning phase that produced an approved plan before any code |
| `context/` files + `CLAUDE.md` | Persistent specs the agent re-reads, which keep it on scope across sessions |
| `tsc` (strict), Vitest, `npm audit` | Feedback signals the agent had to satisfy before moving on        |

## Workflow

```
Requirements (PDF brief)
   │
   ▼
1. Plan mode: agent reads the brief + the six template files, asks clarifying questions
   │            (stack? how far should the "real-time" demo go?)
   ▼
2. Approved plan: layout, patterns, 8 implementation units, verification steps
   │
   ▼
3. Unit 0: fill the six context files (the specs) + CLAUDE.md, before any code
   │
   ▼
4. Units 1–7, one at a time: implement → typecheck → test → run → update tracker → commit
   │
   ▼
5. Review passes: refactor smells, enforce standards, dependency audit, docs
```

### The six context files

The agent was given six template files and asked to fill them in for
this project before writing code:

| File                               | Role                                                              |
| ---------------------------------- | ----------------------------------------------------------------- |
| `context/project-overview.md`      | What to build: features, scope, success criteria                  |
| `context/architecture.md`          | Pipeline, folder boundaries, storage, **invariants**              |
| `context/code-standards.md`        | TypeScript rules, error handling, testing expectations            |
| `context/ui-context.md`            | Color tokens and layout for the demo page                         |
| `context/ai-workflow-rules.md`     | How the agent scopes work, when to split, what not to invent      |
| `context/progress-tracker.md`      | Current unit, completed units, **open questions**, decisions log  |

`CLAUDE.md` points the agent at these files and lists the commands.
Specs come first, so ambiguities in the brief are written down as
open questions with an explicit assumption instead of being silently
invented. Examples: the "provided" `Notification` class that wasn't
attached, what counts as "rare", and default preferences.

## Prompts used

**1. Kick-off prompt** (with the six template files attached):

> complete this assessment, i want to use 6 files system approach like
> having a context dir in it like a gave you the files as well as
> claude.md and readme file to have a complete grip and understanding of
> the project. i will give you the scenario and the requirements in the
> assessment you can start working on it properly as a senior full stack
> dev and make a proper plan for this: *[full challenge brief pasted]*

**2. Clarifying questions the agent asked** (answers chosen by the
developer):

| Question                                   | Options offered                                         | Chosen                      |
| ------------------------------------------ | ------------------------------------------------------- | --------------------------- |
| Which stack?                               | TypeScript + Node · Java 21 + Gradle · C# / .NET 8      | **TypeScript + Node**       |
| How far should the real-time demo go?      | Core + CLI only · Core + WebSocket demo · Full Next.js  | **Core + WebSocket demo**   |

**3. Plan approval.** The agent produced a written plan: repository
layout, the event → bus → service → formatter → preference → inbox →
channel → client pipeline, 8 units, and verification steps. The
developer approved it before any file outside the plan was written.

## What the agent did per unit

| Unit | Output                                                                  | Verified by                                    |
| ---- | ----------------------------------------------------------------------- | ---------------------------------------------- |
| 0    | Scaffold, strict tsconfig, six context files, CLAUDE.md                 | `npm run build`                                |
| 1–4  | Domain, catalogs, preferences, formatters, factory, service, channels   | `tsc`, 27 unit/integration tests               |
| 5    | Event bus, producers, CLI demo                                          | `npm run demo` output matches the brief's wording |
| 6    | Express + WebSocket server, hub, demo page                              | HTTP + WS integration tests, curl smoke test   |
| 7    | README, DESIGN.md, this file                                            | Review                                         |

## Corrections made during review

The loop was not "generate once and ship". These changes came out of
review passes against the context files:

- **Removed a dependency cycle hack.** The first server wiring
  resolved the WebSocket hub lazily to break a hub ↔ notification
  system cycle. It was refactored so the hub receives its
  `isKnownPlayer` and `welcome` callbacks in `attach()`, which made
  the construction order linear.
- **Removed `any` from tests** to satisfy `code-standards.md` (typed
  WS messages and a typed `json<T>()` helper).
- **Removed a mutable "name ref" workaround** in the CLI demo.
- **Dependency audit.** `npm audit` flagged advisories in `express`
  4.21 (path-to-regexp, body-parser, qs), `ws` 8.18 and dev tooling.
  The packages were upgraded to patched releases that were at least
  two weeks old, and audit now reports 0 vulnerabilities.
- **Self-targeted events.** A player befriending, following or
  attacking themselves produces no notification. This is documented
  and tested rather than left as undefined behavior.

## Patterns that worked well with AI

- **Specs before code.** The context files act as long-term memory
  and guardrails. The invariants in `architecture.md` gave the agent
  a checklist to review its own code against.
- **Small units with a hard "green before next" gate** (typecheck +
  tests + run) kept errors local and cheap to fix.
- **Ask, don't assume.** The agent was set up to stop and ask about
  decisions that change the product (stack, scope) and to log smaller
  assumptions in the tracker.
- **Type-level guarantees** (discriminated unions, mapped registry
  types) let the compiler catch mistakes the AI might otherwise
  introduce when adding event types.

## What the developer remains responsible for

AI wrote most of the code, but the developer owns the decisions and
must be able to defend every line: the architecture choices (see
[`DESIGN.md`](DESIGN.md)), the assumptions in
[`progress-tracker.md`](../context/progress-tracker.md), and manually
checking the live demo in a browser.
