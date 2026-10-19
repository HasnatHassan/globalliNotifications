# Globalli Notifications

## Overview

A real-time, in-app notification system for an online multiplayer
gaming platform. Different parts of the platform (game engine,
social system) emit domain events; this system captures them, turns
them into clear player-facing notifications, filters them by each
player's preferences, stores them in an inbox and pushes them to the
game client in real time. It is built for the Globalli coding
challenge, so the focus is the core notification logic and how
easy it is to extend and defend, not production infrastructure.

## Goals

1. Every supported event type turns into the correct notification
   for the correct recipient, with the wording the brief asks for.
2. A player who disabled a category (Game / Social) gets no
   notifications from that category.
3. Adding a new event type is a small, compiler-guided change: the
   event type, its schema, one formatter file and its registry entry
   (missing schema or registry entries fail to compile), plus a
   producer method if a subsystem needs a new call. The service,
   preferences, inbox and channels stay unchanged.
4. A reviewer can clone, `npm install && npm run build`, then run
   `npm run demo` (CLI) or `npm start` (live browser demo).

## Core User Flow

1. A game subsystem calls a producer method, for example
   `gameEngine.playerLeveledUp(1, 15)`.
2. The producer validates the input (shape, and that every referenced
   player and item exists), stamps an event id and time, and publishes
   a typed domain event on the event bus. Invalid input rejects the
   call and nothing is published.
3. `NotificationService` receives the event, re-applies the same
   reference check (as a guard for any publisher), and looks up the
   formatter registered for that event type.
4. The formatter decides the recipients and builds a
   `Notification` (or skips it, for example for a common item).
5. The service checks the recipient's preferences for the
   notification's category. A disabled category means the
   notification is suppressed and counted.
6. An allowed notification is saved to the recipient's inbox (a
   redelivered event is ignored) and sent through every channel
   (in-app → `NotificationClient`).
7. The client (console mock or WebSocket) delivers it to the
   player in real time. Offline players see it in their inbox
   history when they next connect.

## Features

### In-Game Events (category `GAME`)

- Level Up: "Congratulations! You've reached level 15!"
- Item Acquired (rare, epic or legendary only):
  "You've acquired the legendary Sword of Azeroth!"
- Challenge Completed: "You've completed the challenge 'Dragon Slayer'!"
- PvP (optional in the brief, included): attacked / defeated by
  another player. The victim is notified.

### Social Events (category `SOCIAL`)

- Friend Request: "Player 'Cara' has sent you a friend request."
- Friend Accepted: "Player 'Alice' accepted your friend request."
- New Follower: "Player 'Bob' started following you."

### Preferences

- Per player, per category on/off map (`GAME`, `SOCIAL`).
- Every category is enabled until the player turns it off.

### Delivery

- In-app channel only (per the brief). Clients: console mock
  (CLI demo) and WebSocket (browser demo).
- In-memory inbox per player for history and offline catch-up,
  keeping the latest 100 (older ones are dropped, read or not).
- Read/unread state per notification (mark read, mark unread, mark
  all read) with an unread count. It is stored server-side and
  synced across a player's open connections.

## Scope

### In Scope

- **Core:** event validation and capture, notification creation,
  preference check, inbox, dispatch.
- Simulated `GameEngine` and `SocialSystem` producers using the
  brief's method names.
- CLI demo, unit and integration tests.
- **Demo harness (optional, isolated in `src/server` and
  `public/`):** a small HTTP + WebSocket server and a one-page client
  that make real-time delivery visible. The core never depends on it.

### Out of Scope

- Push, email and SMS channels (designed for, not built).
- Authentication. A player id is passed on connect, which is
  acceptable for a demo only.
- Persistent storage, multi-instance scaling, message brokers.
- Real client-side rendering beyond the demo page.

## Success Criteria

1. `npm run build` and `npm test` pass on a fresh clone.
2. `npm run demo` shows the four brief triggers producing the
   expected notifications for the expected recipients.
3. Disabling a category for a player stops that player's
   notifications in that category (CLI and browser demo).
4. The browser demo shows a social event from player 3 arriving
   live in player 1's feed.
