# History Replay Divergence Note

## What happened

We saw history playback where:

- the **Recent Events** list kept advancing,
- but the **map state stopped changing** after a certain frame.

Debug logs showed repeated replay errors like:

- `Cannot attack: current phase is Reinforcement, expected Attack`
- `Cannot end turn: current phase is Reinforcement, expected Fortify`

That means timeline replay state drifted, then every later action was being replayed against the wrong phase.

## Root cause

History replay was reconstructing the initial game state from seed/setup logic (`createInitialStateFromSeed`) and then replaying actions.

If reconstruction is even slightly different from the real starting state used at game start, replay can diverge.

## Current mitigation

1. We now persist the exact initial engine snapshot for new games:
   - `games.initialState` in schema
   - written when game transitions to active

2. Timeline replay now starts from `initialState` when present.

3. Legacy fallback remains for old games (without `initialState`):
   - if replay fails, advance from recorded events (`applyEventsFallbackForTimeline`)
   - include `replayError` in timeline frames for diagnostics

## Important: Should this happen for future games?

For games created after this change, replay should be deterministic and this class of divergence should be very unlikely, because replay starts from the exact persisted initial state.

If divergence still appears in future games, that indicates a new bug (not the old reconstruction issue).

## How to remove legacy glue (once you decide)

When you no longer need support for legacy games:

1. In `convex/gameplay.ts`:
   - remove `applyEventsFallbackForTimeline`
   - remove `allowEventFallback` branching in `getHistoryTimeline`
   - on replay error, fail hard (or mark frame and stop), but do not mutate sim state from event glue

2. In `web/src/lib/game/types.ts`:
   - remove `HistoryFrame.replayError`

3. In `web/src/pages/game.tsx`:
   - remove temporary history debug logging (`historyDebug` / `replayError` console output)

4. Optional cleanup:
   - remove `createInitialStateFromSeed` from `convex/gameplay.ts` if no longer used anywhere else

## Files touched by this mitigation

- `convex/schema.ts` (`games.initialState`)
- `convex/lobby.ts` (persist `initialState` at game start)
- `convex/gameplay.ts` (timeline replay path, legacy fallback)
- `web/src/lib/game/types.ts` (`replayError`)
- `web/src/pages/game.tsx` (history debug logging)
