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
4. Units 1–9, one at a time: implement → typecheck → test → run → update tracker
   │
   ▼
5. Two review rounds by a separate AI session against the brief → Units 10 and 11
```

### How this maps to the git history

Units were built and verified one at a time, but **commits were made
in batches, not per unit**. The per-unit trail is in
`context/progress-tracker.md`, not in git:

| Commit                     | Contains                                                  |
| -------------------------- | --------------------------------------------------------- |
| Core pipeline, CLI demo    | Units 0–5: each verified (typecheck, tests, demo) before the next, committed together at the end |
| Server and demo page       | Unit 6 (the optional demo harness, added after the core was complete) |
| Docs                       | Unit 7                                                    |
| Two feature commits        | Units 8–9 (read/unread, demo page fixes)                  |
| Hardening                  | Units 10–12 (review rounds and the audit), committed together |

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

**1. Kick-off prompt** (sent with the six context templates and the
full challenge brief):

> Act as a senior full-stack engineer and take this coding challenge
> from requirements to a working, defensible solution.
>
> Use a spec-driven workflow built on six context files. I've attached
> templates for `project-overview.md`, `architecture.md`,
> `code-standards.md`, `ui-context.md`, `ai-workflow-rules.md` and
> `progress-tracker.md`. Fill them in for this project in a `context/`
> directory, and add a `CLAUDE.md` and a `README.md`, so that anyone
> picking the project up, human or agent, has complete context on the
> scope, architecture, standards and current state.
>
> The scenario and requirements are below. Before writing any code,
> analyse them, raise any decisions that need my input, and propose an
> implementation plan for me to review.
>
> *[Challenge brief: scenario, technical requirements, example event
> triggers, scope note]*

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

**4. Follow-up feature prompt** (after reviewing the live demo):

> The live demo doesn't let players manage read state. Add support for
> marking notifications as read and unread, and surface it in the demo
> UI.

The agent treated this as a new unit. It updated the context files
first, then implemented the feature across the domain, repository,
API, WebSocket layer and demo page, with tests (see Unit 8 below).

**5. Defect investigation prompt** (after using the demo):

> Players sometimes appear to receive duplicate notifications, or
> notifications for actions they didn't trigger. Investigate the root
> cause end to end, from the server to the client, before changing
> anything.

The agent checked the running server's inbox data first. Every event
had produced exactly one notification, so the server was not at
fault. The repeats came from the same trigger being fired twice. The
agent then fixed what made the page misleading (Unit 9) and added a
regression test for exactly-once delivery per connection.

**6. Code review remediation prompt, round 1** (with the full review attached):

> I reviewed the codebase against the brief and found a set of
> concrete issues: crash paths, broken failure isolation, missing
> core validation, interfaces that don't support the claims made
> about them, a privacy leak in the activity feed, inconsistent inbox
> accounting, and docs that contradict the code. Fix them properly
> and precisely, prioritising correctness and keeping the changes
> efficient.

**7. Code review remediation prompt, round 2** (with the second
review and the challenge PDF attached):

> Check the code against the attached brief and the second review.
> Fix the remaining issues properly. I'll handle committing and
> pushing myself.

**8. Defect report and strict audit prompt** (with a browser console
error attached):

> The live demo throws `TypeError: offline is not iterable` in the
> console. Find the cause, and audit the whole codebase strictly
> against the brief.

The agent traced the error to a server process started before the
latest build: the page is served from disk, the server from `dist/`.
It made `npm start` and `npm run demo` rebuild first, and made the
page tolerate missing fields. The audit also found that the brief's
fire-and-forget calling style (`gameEngine.playerLeveledUp(1, 15);`)
would crash the process on invalid input, because producers returned
a rejected promise. Producers now throw synchronously (Unit 12).

## What the agent did per unit

| Unit | Output                                                                  | Verified by                                       |
| ---- | ----------------------------------------------------------------------- | ------------------------------------------------- |
| 0    | Scaffold, strict tsconfig, six context files, CLAUDE.md                 | `npm run build`                                   |
| 1–4  | Domain, catalogs, preferences, formatters, factory, service, channels   | `tsc`, unit tests                                 |
| 5    | Event bus, producers, CLI demo                                          | `npm run demo` output matches the brief's wording |
| 6    | Express + WebSocket server, hub, demo page                              | HTTP + WS integration tests, curl smoke test      |
| 7    | README, DESIGN.md, this file                                            | Review                                            |
| 8    | Read/unread state, read-all, cross-tab sync, demo UI                    | Integration tests, curl smoke test                |
| 9    | Demo page fixes for apparent duplicates                                 | Inbox data from the running server, regression test |
| 10   | Hardening from review round 1 (below)                                   | Tests for every reproduced bug, shuffled runs, smoke test |
| 11   | Hardening from review round 2 (below)                                   | Tests for every reproduced bug, shuffled runs     |
| 12   | Stale-build console error, synchronous producer validation              | Repro script, regression test, simulated fresh-clone `npm start` |

## Code reviews and what changed

The developer had the codebase reviewed against the brief twice. Both
reviews came from **a separate AI session, not a human reviewer**. It
read the code and ran probe scripts against the build to reproduce
each finding. The developer passed each review back as one
remediation unit (prompts 6 and 7).

### Round 1 (Unit 10)

The review confirmed the core pipeline but reproduced real defects,
mostly in the demo harness and in claims the docs made.

| Finding                                                          | Fix                                                                                         |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| One malformed WebSocket frame crashed the server                 | `error` handlers on every socket and server; regression test sends an unmasked frame         |
| A channel that throws synchronously skipped the others           | Channels called via `async` wrappers; a test with a synchronous throw                        |
| "Sent" was reported even when every channel failed               | New `undelivered` outcome; `sent` means at least one channel accepted                         |
| One throwing dispatch listener broke the others                  | Listeners isolated with try/catch                                                            |
| Inbox cap (100), replay (50) and unread count disagreed          | One capacity for all three; the page trims to it                                             |
| Oversized body → 500; any SyntaxError → "Malformed JSON"         | 413 / 400 mapped from body-parser error types                                                |
| Producers accepted garbage (level -5, NaN, unknown players)      | Shared domain schemas validate in producers; service rejects unknown players                 |
| `preferences.update(1, { GAME: undefined })` broke a preference  | `exactOptionalPropertyTypes` on, plus a runtime boolean guard                                |
| Inbox handed out mutable stored objects; `listFor(id, 0)` = all  | Immutable `Notification`; limit ≤ 0 returns nothing                                          |
| "Swap in a DB with one line" while ports were synchronous        | Store ports made async; the claim rewritten with what a DB adapter must add                  |
| Bus contract only worked in-process                              | `publish` resolves on acceptance; ordered async dispatch; `drain()` only on the in-memory bus |
| Player fields guessed from names ending in `Id`                  | Identified by schema identity (replaced in round 2 by an explicit map)                       |
| Events had no ids, despite docs proposing id-based dedupe        | Event ids; idempotent saves keyed by `eventId:type:recipient`                                |
| Activity feed broadcast to every player; no origin check         | Separate `/ws/activity`; cross-origin upgrades refused                                       |
| Docs contradicted code (wording, counts, engines, rules)         | Docs rewritten to match; the pre-written Q&A removed                                         |
| Tests: shared server state, sleeps, no failure-path coverage     | Fresh server per test, event-driven waits, one behavior per test                             |

### Round 2 (Unit 11)

| Finding                                                                 | Fix                                                                                              |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| A channel that never responds froze every later notification           | Per-channel send timeout (default 5 s): a hung channel counts as failed; end-to-end test         |
| Offline players were counted as "sent"                                  | Clients report `delivered` / `recipient-offline`; new `offline` outcome                           |
| Duplicate detection only covered the 100-notification inbox            | Separate dedupe window (10,000 ids) independent of inbox eviction; documented as a limit         |
| Three validation behaviours (throw / silent drop / ignored item typo)  | One rule (`findUnknownReferences`) for players and items; producers reject at the call site (made synchronous in Unit 12); the service re-checks as a guard; HTTP maps errors only |
| No per-notification isolation inside one event                          | Each notification processed in its own try/catch; new `failed` outcome; test with a failing preference store |
| Player-field detection by schema identity was fragile                   | Explicit `EVENT_REFERENCES` map, typed against each event's fields                               |
| Friend-accepted doesn't verify a prior request                          | Documented: the social system owns that state; the notification layer trusts its events          |
| Git history didn't match the "commit per unit" claim                    | Workflow and history described as they actually happened (above)                                |
| Docs called the review "independent"                                    | Stated plainly as a separate AI session                                                          |

## Corrections the agent made during implementation

These came from the agent's own passes against the context files,
before the reviews:

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
