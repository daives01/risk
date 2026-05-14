# Teammate Turn Delegation for Team Games

## Summary

Add a per-game delegation feature for team games that lets a player opt in to allow teammates to play their turns on their behalf. When it is that player's turn, eligible teammates can explicitly enter a temporary frontend-only "play for X" mode and submit gameplay actions as that engine player. This does not change chat identity, account identity, or core game engine behavior.

## Problem

Team async games can last a long time. A player may be unavailable for days and want teammates to keep the game moving without giving away account credentials or forcing timeout-based play.

## Goals

- Let a player opt in per game to allow teammates to take their turns.
- Let eligible teammates explicitly enter and exit a visible "play for Alice" mode only when Alice's turn is active.
- Keep the core engine model unchanged.
- Preserve auditability on the backend.
- Avoid changing chat identity or history UI semantics.

## Non-Goals

- No global account-level impersonation setting.
- No delegation outside team games.
- No delegation for spectators.
- No delegated chat, profile actions, or account actions.
- No history UI rewrite showing the real actor.
- No persistent frontend impersonation mode across refreshes.
- No engine-level player identity changes.

## User Stories

- As a player in a team game, I can toggle `Allow teammates to play my turns` for this game.
- As a teammate, when it is Alice's turn and Alice has enabled delegation, I can click `Play for Alice`.
- As a teammate in delegated mode, I can make normal gameplay moves on Alice's behalf.
- As a teammate in delegated mode, I can stop playing for Alice at any time.
- As Alice, I can revoke delegation at any time, including during my turn.
- As the system, I can audit both the turn owner and the authenticated user who actually submitted the move.

## Eligibility Rules

- Applies only in team games.
- Delegation is configured per game, per player seat.
- A delegated actor must be on the same team as the turn owner.
- The delegated actor may be dead and still play for an alive teammate.
- The turn owner must be alive for delegation to matter.
- The turn owner can always play their own turn normally.
- Spectators cannot delegate or act as delegates.

## UX Requirements

- Each player sees their own per-game toggle in the game UI: `Allow teammates to play my turns`.
- The toggle only affects that current game.
- The `Play for Alice` button appears only when:
  - it is Alice's turn,
  - Alice has delegation enabled,
  - the viewer is an authenticated teammate,
  - the viewer is not Alice,
  - the game is active.
- Clicking `Play for Alice` enters a frontend-only delegated mode.
- Delegated mode ends when:
  - the user clicks `Stop playing for Alice`,
  - the page refreshes,
  - the turn changes,
  - delegation is revoked,
  - eligibility is otherwise lost.
- Delegated mode must be visually obvious.
- Recommended treatment: a strong full-page accent border plus a persistent top banner stating `Playing for Alice`.
- History playback mode should disable delegated interaction the same way it disables normal interaction.
- No delegation affordance in finished games.

## Behavioral Requirements

- While in delegated mode, gameplay controls should behave as if the user is the current turn owner for action submission only.
- Chat remains authored by the real authenticated user and never impersonates the delegated player.
- Turn notifications remain unchanged and continue targeting the real turn owner only.
- The visible game history continues to attribute actions to the engine player whose turn it was, not the teammate who clicked.

## Backend Requirements

- Store a per-game opt-in flag on the player's game membership record.
- Extend gameplay authorization so that action submission may be performed by:
  - the active engine player, or
  - an eligible teammate acting for that active engine player when delegation is enabled.
- Record audit data for delegated actions, including:
  - target engine player id,
  - authenticated acting user id,
  - whether the action was delegated.
- Audit data does not need to be surfaced in the existing history UI.
- Resignation should remain self-only unless explicitly expanded later.

## Frontend Requirements

- Add local delegated-mode state on the game page.
- Add a clear entry control: `Play for <name>`.
- Add a clear exit control: `Stop playing for <name>`.
- Replace normal "not your turn" treatment with delegated controls when delegated mode is active.
- Ensure all existing gameplay actions route through the delegated target player id while delegated mode is active.
- Reset delegated mode automatically when the active turn no longer matches the delegated target.

## Data Model Changes

- `gamePlayers`
  - add `allowTeammatesToAct: boolean` or optional boolean defaulting false.
- `gameActions`
  - add optional audit fields such as:
    - `actingUserId`
    - `wasDelegated`
  - optionally add a display-only snapshot like `actingDisplayName` if useful for admin/debugging.

## Acceptance Criteria

1. In an active team game, a player can enable and disable delegation for their own seat.
2. When it is that player's turn, eligible teammates see `Play for <name>`.
3. Entering delegated mode enables gameplay actions for that turn only.
4. Delegated mode is visually obvious and can be exited explicitly.
5. Refreshing the page exits delegated mode.
6. Revoking delegation immediately prevents further delegated actions.
7. A dead teammate can successfully act for a living teammate if delegation is enabled.
8. Chat remains authored by the real sender.
9. Visible game history remains unchanged.
10. Backend audit data records the real acting user for delegated actions.
11. No delegation affordances appear in non-team, lobby, or finished states.

## Edge Cases

- Turn changes while delegate mode is active.
- Delegation revoked while delegate mode is active.
- Two teammates open delegated mode at once; backend authorization should still be valid and existing optimistic concurrency should handle conflicts.
- Dead current player should not create a usable delegation state.
- Viewer is on same team but not a participant in the game: no access.
- History replay open while delegated mode is active: actions remain blocked.

## Open Design Decisions

- Whether the per-game delegation toggle belongs in the players panel, header, or a compact personal settings area within the game page.
- Whether to show any passive hint to the owner that a teammate is currently in delegated mode. This is not required for v1.

## Recommended V1 Scope

- Include:
  - per-game toggle,
  - explicit `Play for X` / `Stop playing for X`,
  - strong visual delegated mode treatment,
  - gameplay-only authorization,
  - backend audit fields.
- Exclude:
  - delegated resign,
  - delegated chat,
  - history/admin UI for audit display,
  - cross-game or global settings.
