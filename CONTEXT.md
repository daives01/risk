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

**Engine Player**:
The in-game player identity used by the deterministic game engine after a game starts.
_Avoid_: User, lobby player

## Relationships

- A **Smoke User** is a specialized **User**
- A **Smoke Harness** signs in one or more **Smoke Users**
- A **Local Smoke Run** uses the **Smoke Harness**
- A **User** can become a **Lobby Player** by joining a **Lobby**
- A **Lobby** can produce exactly one **Game** when started
- A **Lobby Player** is mapped to exactly one **Engine Player** when the **Game** starts
- A **Local Smoke Run** starts the web app but relies on the shared Convex dev deployment rather than a local backend
- A **Local Smoke Run** targets exactly one **Smoke Origin**
- A failed **Local Smoke Run** produces one or more **Smoke Artifacts**

## Example Dialogue

> **Dev:** "Should the smoke test create fresh accounts through signup?"
> **Domain expert:** "No. Use seeded **Smoke Users**, let the **Smoke Harness** sign them in as real **Users**, join them to a **Lobby**, and then verify the **Game** starts correctly."

## Flagged Ambiguities

- "test users in our dev database" was ambiguous between generic accounts and domain-specific seeded accounts — resolved: call them **Smoke Users** when they are permanent reusable accounts for end-to-end testing.
- "player" can mean both a **Lobby Player** and an **Engine Player** — resolved: use the specific term for the pre-game or in-game phase.
- "smoke test" was ambiguous between harness validation and full gameplay validation — resolved: v1 focuses on the **Smoke Harness** proving the end-to-end setup works reliably.
- "local stack" was ambiguous between frontend-only and frontend-plus-backend startup — resolved: a **Local Smoke Run** starts the web app locally and targets the already-running shared Convex dev deployment.
- "local URL" was ambiguous between `localhost` and the auth-approved network address — resolved: the first **Smoke Origin** is a configurable Tailscale URL, and changing it later should be easy.
- "debug output" was ambiguous between ephemeral diagnostics and repo fixtures — resolved: **Smoke Artifacts** are failure-only local outputs and are not tracked in git.
