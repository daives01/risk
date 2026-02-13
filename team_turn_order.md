# Team Turn Order Implementation Plan

## Current Behavior
- Turn order is determined by a simple random shuffle of all player IDs
- No consideration for team distribution
- Teammates may be clustered together or spread randomly

## Desired Behavior
- Team players should be evenly interleaved in the turn order
- Example with 2 teams (4 players each): Team A, Team B, Team A, Team B, etc.
- Example with 3 teams (2 players each): Team A, Team B, Team C, Team A, Team B, Team C

## Implementation Approach

### Option 1: Interleaved Shuffle (Recommended)

1. Group players by their team ID
2. Shuffle each team group independently
3. Create turn order by round-robin selection from each team
4. Randomly rotate which team goes first

Example for 2 teams (A: [p1, p2], B: [p3, p4]):
- Shuffle Team A: [p2, p1]
- Shuffle Team B: [p4, p3]
- Randomly decide Team A goes first
- Result: [p2, p4, p1, p3] or [p1, p3, p2, p4] depending on rotation

### Option 2: Pattern-Based Shuffle

1. Define a pattern (e.g., alternating team IDs)
2. Place players into the pattern slots
3. Shuffle within each team's slots

## Files to Modify

1. **`convex/lobby.ts`** (around line 644)
   - `startGame` function where initial turn order is set
   - Access to team assignments via `teamAssignmentsByUserId`

2. **`convex/gameplay.ts`** (around line 767)
   - `createInitialStateFromSeed` function
   - Need to preserve team assignments when reseeding

## Implementation Details

### New Function: `createTeamAwareTurnOrder`

```typescript
function createTeamAwareTurnOrder(
  playerIds: PlayerId[],
  playerTeamMap: Map<PlayerId, TeamId>,
  rng: Rng
): PlayerId[] {
  // Group players by team
  const teamGroups = new Map<TeamId, PlayerId[]>();
  for (const pid of playerIds) {
    const teamId = playerTeamMap.get(pid);
    if (!teamId) continue; // Solo mode - fall back to simple shuffle
    const group = teamGroups.get(teamId) ?? [];
    group.push(pid);
    teamGroups.set(teamId, group);
  }

  // If no teams found, use simple shuffle
  if (teamGroups.size === 0) {
    return rng.shuffle(playerIds);
  }

  // Shuffle each team group
  const shuffledGroups = new Map<TeamId, PlayerId[]>();
  for (const [teamId, players] of teamGroups) {
    shuffledGroups.set(teamId, rng.shuffle(players));
  }

  // Get team IDs and shuffle their order
  const teamIds = Array.from(teamGroups.keys());
  const shuffledTeamOrder = rng.shuffle(teamIds);

  // Interleave players from each team
  const turnOrder: PlayerId[] = [];
  const maxPlayersPerTeam = Math.max(...Array.from(teamGroups.values()).map(g => g.length));

  for (let i = 0; i < maxPlayersPerTeam; i++) {
    for (const teamId of shuffledTeamOrder) {
      const teamPlayers = shuffledGroups.get(teamId)!;
      if (i < teamPlayers.length) {
        turnOrder.push(teamPlayers[i]!);
      }
    }
  }

  return turnOrder;
}
```

## Edge Cases

1. **Uneven teams**: If Team A has 3 players and Team B has 2, the pattern becomes: A, B, A, B, A
2. **Solo mode**: Should fall back to simple shuffle
3. **More than 2 teams**: Should work with 3, 4, or more teams
4. **Empty teams**: Teams with no players should be excluded
5. **Reseeding**: `createInitialStateFromSeed` must preserve team structure

## Testing Considerations

1. Turn order always alternates between different teams (no two consecutive same-team players unless team count = 1)
2. All players are included exactly once
3. Order is deterministic given the same RNG seed
4. Works with various team configurations (2v2, 3v3, 2v2v2, etc.)

## Migration Notes

- This is a breaking change for game seeds
- Existing games will continue using old turn order
- New games will use the team-aware turn order
- Consider adding a game setting to toggle this feature
