# Legally Distinct Global Domination

Legally Distinct Global Domination is a multiplayer strategy game with authenticated users, pre-game lobbies, and active games backed by a shared deterministic engine. This context document captures the user-facing domain language so product, gameplay, and testing discussions stay precise.

## Language

**User**:
An authenticated account that can sign in to the app.
_Avoid_: Test user, account, player account

**Smoke User**:
A reusable seeded User reserved for end-to-end smoke testing.
_Avoid_: Throwaway user, signup user

**Smoke Harness**:
The reusable Playwright setup that provisions smoke users, opens browsers, and drives a representative end-to-end app flow.
_Avoid_: Test script, QA setup

**Local Smoke Run**:
A local execution of the Smoke Harness that starts the web app against the shared Convex dev deployment and verifies the end-to-end flow.
_Avoid_: Full local stack, local backend run

**Smoke Origin**:
The canonical browser origin that the Smoke Harness uses for authentication and end-to-end navigation.
_Avoid_: Base URL, localhost default

**Smoke Artifact**:
A failure-only debug artifact from the Smoke Harness, such as a trace, screenshot, or milestone log, used to diagnose why a local smoke run failed.
_Avoid_: Checked-in fixture, permanent test output

**Lobby**:
A pre-game space where users gather, configure settings, and start a game.
_Avoid_: Room, match, pending game

**Lobby Player**:
A user who has joined a lobby and occupies a seat in that lobby.
_Avoid_: User, engine player

**Game**:
An active or finished play session created from a lobby.
_Avoid_: Lobby, match setup

**Game Transition**:
One authoritative change from a **Game**'s current state to its next state, caused by an in-game action, resignation, or turn timeout. A Game Transition records one or more **History Frames** and may advance the turn or finish the Game.
_Avoid_: Database update, state patch, action handler

**Game Transition Source**:
The origin responsible for a **Game Transition**: a **User** acting as their own **Engine Player**, a User acting as a delegated Engine Player, or the system resolving a turn timeout.
_Avoid_: Request source, caller, action owner

**Engine Player**:
The in-game player identity used by the deterministic game engine after a game starts.
_Avoid_: User, lobby player

**Resignation**:
An in-game action in which an **Engine Player** leaves active play, giving up their territories and cards and potentially advancing the turn or finishing the **Game**.
_Avoid_: Logout, leave lobby, elimination request

**Replay Timeline**:
The ordered sequence of historical in-game action frames for a **Game**.
_Avoid_: Recent events, event log, history panel

**History Frame**:
A single step in the **Replay Timeline** representing one applied in-game action and its resulting public game state.
_Avoid_: Turn, event, message

**Turn Boundary**:
A marker in the **Replay Timeline** where control passes from one **Engine Player** turn to the next.
_Avoid_: Frame, action

**Since-My-Last-Turn Shortcut**:
A replay navigation shortcut that jumps to the earliest **History Frame** after the viewer's own most recent completed **Engine Player** turn.
_Avoid_: Catch-up mode, unread history

**Recent Replay Window**:
The default loaded slice of the **Replay Timeline**, starting at the latest available history window and expanding backward as older windows are fetched.
_Avoid_: Whole history, full replay

**Whole-History Mode**:
A replay mode that expands the **Replay Timeline** beyond the **Recent Replay Window** to cover the full match.
_Avoid_: Default history, recent window

**Active Frame Label**:
A single-line text summary of the currently selected **History Frame** shown adjacent to the replay controls.
_Avoid_: Event list, side panel, detailed log

**Replay Control Band**:
The page-width replay surface that groups the **Replay Timeline**, playback controls, and **Active Frame Label**.
_Avoid_: Header controls, corner controls, timeline popover

**Replay Mode**:
The game-view mode where the map displays a selected **History Frame** instead of the live game state.
_Avoid_: Overlay, side panel, live mode

## Relationships

- A **Smoke User** is a specialized **User**
- A **Smoke Harness** signs in one or more **Smoke Users**
- A **Local Smoke Run** uses the **Smoke Harness**
- A **User** can become a **Lobby Player** by joining a **Lobby**
- A **Lobby** can produce exactly one **Game** when started
- A **Game Transition** changes exactly one **Game** from one authoritative state to the next
- A **Game Transition** records one or more **History Frames**
- A **Game Transition** has exactly one **Game Transition Source**
- A **Lobby Player** is mapped to exactly one **Engine Player** when the **Game** starts
- A **Resignation** changes one living **Engine Player** to defeated
- A **Resignation** causes a **Game Transition**
- A **Game** contains exactly one **Replay Timeline**
- A **Replay Timeline** contains one or more **History Frames**
- A **Turn Boundary** separates contiguous ranges of **History Frames**
- A **Since-My-Last-Turn Shortcut** targets a position within the **Replay Timeline**
- A **Recent Replay Window** is a partial view of a **Replay Timeline**
- **Whole-History Mode** includes the entire **Replay Timeline**
- An **Active Frame Label** describes exactly one **History Frame** at a time
- A **Replay Control Band** presents the **Replay Timeline** and its controls together
- **Replay Mode** presents one selected **History Frame** from the **Replay Timeline**
- A **Local Smoke Run** starts the web app but relies on the shared Convex dev deployment rather than a local backend
- A **Local Smoke Run** targets exactly one **Smoke Origin**
- A failed **Local Smoke Run** produces one or more **Smoke Artifacts**

## Example Dialogue

> **Dev:** "Should the smoke test create fresh accounts through signup?"
> **Domain expert:** "No. Use seeded **Smoke Users**, let the **Smoke Harness** sign them in as real **Users**, join them to a **Lobby**, and then verify the **Game** starts correctly."

> **Dev:** "When I scrub the **Replay Timeline**, am I moving between turns or actions?"
> **Domain expert:** "Between **History Frames**. **Turn Boundaries** are markers layered on top so the replay is precise without losing turn structure."

> **Dev:** "Where should history open by default?"
> **Domain expert:** "On the latest **History Frame**. Use the **Since-My-Last-Turn Shortcut** when a player wants to catch up from their own previous **Engine Player** turn."

> **Dev:** "Should the scrubber always show the entire match?"
> **Domain expert:** "No. Start with the latest **Recent Replay Window**, fetch one older window when replay opens, and let players opt into **Whole-History Mode** when they need the full replay."

> **Dev:** "Do we still need a scrolling event list next to replay?"
> **Domain expert:** "No. Remove the side panel and show only an **Active Frame Label** for the currently selected **History Frame**."

> **Dev:** "Should replay controls stay in the page header?"
> **Domain expert:** "No. Keep playback controls with the **Replay Control Band** so the controls remain close to the **Replay Timeline**."

> **Dev:** "Does opening history layer on top of live play?"
> **Domain expert:** "No. Opening history enters **Replay Mode**, where the map follows the selected **History Frame** until the player exits replay."

## Flagged Ambiguities

- "test users in our dev database" was ambiguous between generic accounts and domain-specific seeded accounts — resolved: call them **Smoke Users** when they are permanent reusable accounts for end-to-end testing.
- "player" can mean both a **Lobby Player** and an **Engine Player** — resolved: use the specific term for the pre-game or in-game phase.
- "history" was ambiguous between a wordy event list and the actual replayable sequence — resolved: call the replayable sequence the **Replay Timeline**, and call each step a **History Frame**.
- "catch up" was ambiguous between opening at an older default position and an explicit jump action — resolved: history opens on the latest **History Frame**, and catch-up uses a **Since-My-Last-Turn Shortcut**.
- "my last turn" was ambiguous under team delegation — resolved: the **Since-My-Last-Turn Shortcut** uses the viewer's own **Engine Player**, not delegated play context.
- "history scope" was ambiguous between a turn-count window, a backend action window, and the full match — resolved: default to a **Recent Replay Window** based on loaded history windows, with **Whole-History Mode** as an explicit expansion.
- "history text" was ambiguous between a persistent event list and the selected replay step — resolved: keep only an **Active Frame Label** and remove the side-panel event list.
- "history controls" was ambiguous between header actions and replay-surface actions — resolved: playback controls belong in the **Replay Control Band**.
- "history open" was ambiguous between an overlay and a mode switch — resolved: opening history enters **Replay Mode**.
- "smoke test" was ambiguous between harness validation and full gameplay validation — resolved: v1 focuses on the **Smoke Harness** proving the end-to-end setup works reliably.
- "local stack" was ambiguous between frontend-only and frontend-plus-backend startup — resolved: a **Local Smoke Run** starts the web app locally and targets the already-running shared Convex dev deployment.
- "local URL" was ambiguous between `localhost` and the auth-approved network address — resolved: the first **Smoke Origin** is a configurable Tailscale URL, and changing it later should be easy.
- "debug output" was ambiguous between ephemeral diagnostics and repo fixtures — resolved: **Smoke Artifacts** are failure-only local outputs and are not tracked in git.
