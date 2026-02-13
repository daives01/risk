# Team Continent Reward System Plan

## Current State

The team continent reward system currently uses a "majority holder" approach where:

1. **Team Control**: A continent counts as controlled if all territories are owned by players on the same team
2. **Majority Holder**: The player on that team who owns the most territories receives the entire continent bonus
3. **Tie-Breaker**: Uses alphabetical playerId sorting (`"p0"` < `"p1"` < `"p2"`, etc.)

### Problem with Current Implementation

The alphabetical tie-breaker is based on **lobby join order** (who joined first), not **game turn order** (who goes first). This is unintuitive because:

- Players experience the game through turn order
- The first player to act might not be `"p0"` if turn order was shuffled
- It's confusing to say "the player who joined first wins ties"

## Proposed Changes

### 1. Update Tie-Breaker to Use Turn Order

**Change**: Instead of sorting by playerId alphabetically, use the game's turn order to break ties.

**Logic**:
```typescript
// Current (alphabetical):
const sortedPlayers = [...playerCounts.keys()].sort();

// Proposed (turn order):
const sortedPlayers = [...playerCounts.keys()].sort(
  (a, b) => turnOrder.indexOf(a) - turnOrder.indexOf(b)
);
```

**Benefits**:
- More intuitive: "first player in turn order wins ties"
- Aligns tie-breaking with how players experience the game
- Easier to communicate to players

### 2. Maintain Majority-Take-All Behavior

The core "majority holder gets everything" approach remains unchanged:

- If one player owns the most territories in a continent → they get the full bonus
- If multiple players tie for most → player earlier in turn order wins
- Other teammates receive 0 for that continent

### 3. Add Configuration Option for Individual Bonuses

Add a new `continentBonusRecipient` option: `"individual"`

When enabled:
- Team mode is still active (attack restrictions, fortify rules, etc.)
- But continent bonuses are calculated individually
- Each player only gets bonuses for continents they personally control (all territories)
- No team-based bonus sharing

**Use Case**: Players who want team coordination for attacks but traditional Risk-style individual continent control.

## Implementation Details

### Required Changes

1. **`reinforcements.ts`**:
   - Update `findTeamContinentBonusRecipient()` to accept `turnOrder` parameter
   - Change sorting logic from alphabetical to turn order based
   - Handle new `"individual"` config option

2. **`config.ts`**:
   - Update `TeamsConfig` interface to include new `"individual"` option:
   ```typescript
   readonly continentBonusRecipient: "majorityHolderOnTeam" | "individual";
   ```

3. **`calculateReinforcements()` function**:
   - Pass `turnOrder` through the call chain
   - Add logic branch for `"individual"` mode

4. **Tests**:
   - Update existing tests to use turn order instead of alphabetical sorting
   - Add tests for `"individual"` mode
   - Add explicit tie-breaker tests with turn order

## Edge Cases

### 1. Tied Territory Counts

**Scenario**: Two teammates each own 2 territories in a 4-territory continent (bonus = 5)

**Resolution**: Player who appears first in `turnOrder` array wins the 5 bonus

**Example**:
```
turnOrder = ["p2", "p0", "p1", "p3"]
p0 owns: ["t1", "t2"]  // 2 territories
p1 owns: ["t3", "t4"]  // 2 territories (tie!)

Winner: p0 (appears at index 1, p1 is at index 2)
```

### 2. Zero-Territory Players

If a player on the team owns 0 territories in a continent, they're not considered in the tie-breaker (obviously).

### 3. Large Teams with Small Bonuses

With the new turn-order tie-breaker, ties are still possible with large teams sharing small bonuses. The rule is consistent: whoever's earlier in turn order wins.

## Player Communication

### How to Explain to Players

**Current (confusing)**:
> "When your team controls a continent, the player with the most territories gets the bonus. If tied, the player who joined the lobby first wins."

**Proposed (clear)**:
> "When your team controls a continent, the player with the most territories gets the bonus. If tied, the player who goes first in turn order wins."

### UI Considerations

- In team games, show turn order clearly in the UI
- Consider highlighting the "continent bonus leader" on the team
- Show tie-breaker indicator when territory counts are equal

## Migration Path

1. Implement turn order tie-breaker (no breaking change, just more intuitive)
2. Add `"individual"` config option as new feature
3. Update game settings UI to expose the new option
4. Document the behavior changes in release notes

## Decision Rationale

### Why Majority-Take-All?

After considering proportional distribution, we determined that majority-take-all is the best approach because:

1. **Simplicity**: Easy to understand and communicate
2. **Strategic Depth**: Creates interesting team dynamics about who should hold continents
3. **Precedent**: Matches how other online Risk games handle team continents
4. **Team Coordination**: Since teammates can place on each other's territories, supporting the "continent holder" becomes a viable strategy

### Why Turn Order Tie-Breaker?

1. **Intuitive**: Players already think in terms of turn order
2. **Visible**: Turn order is displayed in the UI, unlike lobby join order
3. **Consistent**: Aligns with other game mechanics that use turn order

## Future Considerations

- Consider a "team pool" system where bonus troops go to a shared pool (requires significant UI/engine changes)
- Monitor player feedback on the new tie-breaker
- Consider adding a visual indicator in the UI showing who would win a tie

## Related Files

- `/packages/risk-engine/src/reinforcements.ts` - Core bonus calculation logic
- `/packages/risk-engine/src/config.ts` - TeamsConfig interface
- `/packages/risk-engine/src/reinforcements.test.ts` - Test coverage
- `/convex/gameTeams.ts` - Team configuration resolution
- `/convex/lobby.ts` - Turn order initialization
