# PRD + Implementation Plan (Revised): Risk Engine in a Bun Monorepo

## 0) Summary
Build a deterministic, headless Risk game engine as a TypeScript library (`risk-engine`) inside a Bun monorepo. The engine is map/renderer-agnostic: the “board” is a validated graph (territories + adjacency + optional continents). The engine validates and applies actions via a strict phase machine, emits events for replay/UI, supports async play with auto-defend, configurable fortification rules, full cards + trading with explicit trade value schedule, and (later) teams with cooperative placement/fortify while preventing friendly fire.

Near-term focus: the engine package and its tests. The monorepo is set up now so we can later add a React/Vite frontend and Convex backend that both consume the same engine.

---

## 1) Monorepo Architecture (Bun)

### 1.1 Workspace layout (initial)
- `packages/risk-engine/`  
  The core library (this PRD).
- `packages/shared/` (optional, keep tiny)  
  Shared ID types, helpers, maybe schema validation utilities if needed.

### 1.2 Planned additions (later)
- `apps/web/` (React + Vite or TanStack)  
  Uses engine for legal move UI, previews, and rendering guidance.
- `packages/backend/` (Convex)  
  Uses engine for authoritative validation/apply and persistence.

### 1.3 Monorepo constraints
- `risk-engine` must be:
  - ESM-compatible
  - no Node-only dependencies
  - deterministic (no wall clock, ambient randomness)
  - JSON-serializable types
- Keep `risk-engine` dependency graph small; ideally zero runtime deps.

---

## 2) Product Goals / Non-goals

### Goals
- Graph-based maps (no opinionated board).
- Deterministic simulation and replay.
- Async-friendly: defender never needs to respond; auto-defend uses best defense (max dice).
- Variants via ruleset config:
  - fortify: adjacent vs connected
  - cards/trading: ABCW + explicit trade values, forced trade, territory bonus
  - teams: cooperative place/fortify/traverse; no friendly fire
- Setup phase: automated, “classic-like”, including neutral territories (per your direction to match classic rules as closely as possible).

### Non-goals (v1)
- UI/networking.
- Complex bots/AI.
- Fog-of-war projections (can add later).
- Supporting every Risk edition variant out of the gate.

---

## 3) Core Engine Concepts

### 3.1 Determinism + RNG
All randomness comes from engine-controlled RNG state:
- `rng: { seed: string|number; index: number }`
- Every random draw/roll consumes RNG deterministically.

### 3.2 State machine (phases)
Phases (v1):
- `Setup` (automated steps may run via engine-generated actions or internal setup runner)
- `Reinforcement`
- `Attack`
- `Occupy` (pending after capture)
- `Fortify`
- `GameOver`

A `pending` field enforces required next steps, e.g. Occupy.

### 3.3 Actions vs Events
- **Action**: what a player requests (or what an automated setup runner performs).
- **Event**: what happened (dice, losses, capture, trades, elimination, etc.), used for replay/animation.

---

## 4) Data Model

### 4.1 Map: GraphMap
- `territories: Record<TerritoryId, { name?: string; continentId?: string; tags?: string[] }>`
- `adjacency: Record<TerritoryId, TerritoryId[]>`
- `continents?: Record<ContinentId, { territoryIds: TerritoryId[]; bonus: number }>`

Map validation:
- all IDs exist
- no invalid edges
- enforce undirected symmetry (default)
- continents reference valid territories

### 4.2 GameState
Minimum fields:

**Players**
- `players: Record<PlayerId, { status: 'alive'|'defeated'; teamId?: TeamId }>`
- `turnOrder: PlayerId[]`

**Territories**
- `territories: Record<TerritoryId, { ownerId: PlayerId | 'neutral'; armies: number }>`
  - Include `'neutral'` explicitly since you want neutrals in setup and potentially later.
  - Neutral is a “non-player owner” that cannot take actions.

**Turn**
- `turn: { currentPlayerId: PlayerId; phase: Phase; round: number }`
- `pending?: { type: 'Occupy'; from; to; minMove; maxMove }`

**Reinforcements**
- `reinforcements?: { remaining: number; sources?: Record<string, number> }`

**Cards**
- `deck: { draw: CardId[]; discard: CardId[] }`
- `cardsById: Record<CardId, { kind: 'A'|'B'|'C'|'W'; territoryId?: TerritoryId }>`
- `hands: Record<PlayerId, CardId[]>`
- `tradesCompleted: number`
- `capturedThisTurn: boolean`

**RNG**
- `rng: { seed; index }`

**Versioning**
- `stateVersion: number`
- `rulesetVersion: number`

---

## 5) RulesetConfig (Variant Knobs)

### 5.1 Setup
You want “automated process that mimics classic,” including some neutrals.

Config proposal:
- `setup: {`
  - `mode: 'classicLikeRandomWithNeutrals'`
  - `neutralTerritoryCount: number` (or `neutralShare: number`)
  - `neutralInitialArmies: number` (commonly 1; could allow >1)
  - `playerInitialArmies: (playerCount: number) => number` (can be a table; keep deterministic)
  - `distribution: 'roundRobin' | 'random'` (after shuffling territory list)
`}`

Implementation note: “match actual rules” can be interpreted multiple ways across editions. The PRD will treat setup as a configurable module with one default mode that:
- shuffles territories (seeded)
- assigns some to neutral, rest to players round-robin
- then places initial armies round-robin across owned territories until budgets exhausted (seeded tie-breaking)

This yields a classic-feeling setup without requiring a UI-driven claim phase.

### 5.2 Combat (async auto-defend)
- `maxAttackDice = 3`
- `maxDefendDice = 2`
- `defenderDiceStrategy = 'alwaysMax'`
- `allowAttackerDiceChoice: boolean` (optional)

### 5.3 Fortify
- `fortifyMode: 'adjacent' | 'connected'`
- `allowFortifyWithTeammate: boolean`
- `allowFortifyThroughTeammates: boolean` (you said yes)

### 5.4 Cards / Trading
- `tradeValues: number[]`
- `tradeValueOverflow: 'repeatLast'` (your choice)
- `forcedTradeHandSize: number` (classic 5)
- `tradeSets: { allowThreeOfAKind: true; allowOneOfEach: true; wildActsAsAny: true }`
- `territoryTradeBonus: { enabled: boolean; bonusArmies: number }`
  - bonus goes into reinforcement pool; player allocates later
- `awardCardOnCapture: boolean`
- `deckDefinition: {`
  - `kinds: Array<'A'|'B'|'C'>` distribution rules
  - `wildCount: number`
  - `territoryLinked: boolean` (cards correspond to territories or not)
`}`

### 5.5 Teams
- `teamsEnabled: boolean`
- `preventAttackingTeammates: boolean`
- `allowPlaceOnTeammate: boolean`
- `allowFortifyWithTeammate: boolean`
- `allowFortifyThroughTeammates: boolean`
- Win condition: `lastTeamStanding`

### 5.6 Continent bonuses in teams (your new rule)
You want:
- no friendly fire required
- but also avoid “every teammate gets full bonus”

Interpretation that satisfies both:
- A continent’s bonus is awarded **once per reinforcement phase**, to the **current player** if their **team controls the continent**, and the recipient is the team member who has the **majority of territories in that continent**.
- If there’s a tie for majority among teammates, break tie deterministically (turn order, or lowest PlayerId, or seeded RNG—prefer deterministic by ID/order).

Config shape:
- `continents: { teamBonusRecipient: 'majorityHolderOnTeam' }`

Important detail: “team controls continent” needs a definition. Recommended:
- A team controls a continent if **all territories in it are owned by that team or by neutral?**
  - To keep classic meaning, I recommend: **must be fully owned by that team (no neutrals, no enemies)**.
  - If neutrals exist after setup, they block continent control until captured.

So:
- `teamControlsContinent(teamId, continent) = every territory owner is a player on teamId`

Then recipient:
- among players on that team, choose the one with most territories in that continent.

This ensures:
- bonus isn’t multiplied by teammates
- no friendly fire needed to “consolidate”
- it still rewards internal consolidation without punishing teamwork too hard

---

## 6) Permissions Layer (teams without infecting everything)
Centralize checks:

Capabilities:
- `canPlace(actorId, territoryOwnerId)`
- `canFortifyFrom(actorId, territoryOwnerId)`
- `canFortifyTo(actorId, territoryOwnerId)`
- `canTraverseForFortify(actorId, territoryOwnerId)` (for connected paths)
- `canAttackInto(actorId, targetOwnerId)` (disallow teammate + disallow neutral? decide below)

Neutral interactions:
- Attacking neutral territories: decide now.
  - Classic Risk has no neutral owner, but your setup includes neutrals; you likely want them to be attackable.
  - So: allow attacking `'neutral'` as if it were an enemy that never takes turns and always auto-defends (still max dice based on armies).

---

## 7) Actions (v1) and Semantics

### 7.1 Player actions
- `TradeCards { cardIds }`
- `PlaceReinforcements { territoryId, count }`
- `Attack { from, to, attackerDice? }` (defender dice auto)
- `Occupy { moveArmies }`
- `Fortify { from, to, count }`
- `EndAttackPhase` (transitions to Fortify)
- `EndTurn` (optional explicit; or engine ends turn after Fortify action + “skip fortify” action)

### 7.2 Engine/internal setup actions (optional)
To keep everything event-sourced, consider modeling setup as actions too:
- `RunSetup` (single action that produces deterministic setup events and finalizes state)
or
- `SetupStep` actions (assign territories, place armies), though that’s more complexity than needed.

Recommendation: implement `createGame()` that produces a fully-initialized post-setup state, plus emitted `setupEvents` (optional). That keeps API simple.

---

## 8) Key Algorithms

### 8.1 Setup: classic-like random with neutrals
Input: map territories, players, RNG seed, setup config.

Algorithm (deterministic):
1. Shuffle territory IDs using RNG stream.
2. Assign first `neutralTerritoryCount` to `'neutral'`, rest distributed round-robin among players in randomized turn order (turn order also generated deterministically from seed).
3. Initialize each owned territory with 1 army.
4. Compute each player’s initial army budget (classic table or config function).
5. Place remaining initial armies in round-robin across that player’s territories:
   - choose territory order deterministically (e.g., cycle through shuffled list filtered by owner) or allow player choice later (not desired now).
6. Set phase to `Reinforcement`, `round=1`, currentPlayer = first in turn order.

This yields a “mimics classic” feel without interactive claiming.

### 8.2 Combat
- Defender dice always max: `min(maxDefendDice, defenderArmies)`
- Dice roll uses RNG stream.
- Ties go to defender.

### 8.3 Connected fortify pathfinding
BFS from `from` to `to` over adjacency where each node is traversable if:
- owned by actor OR (teams enabled and owned by actor’s team) when traversal-through-teammates is enabled.

### 8.4 Continent bonus recipient in teams
Per reinforcement calculation for current player:
- For each continent:
  - If not team mode: classic “player controls all” → current player gets bonus.
  - If team mode:
    - If team controls all territories in continent:
      - Find teammate with majority territories in that continent.
      - If current player is that majority-holder, add bonus; otherwise current player gets none from that continent.
This yields “bonus awarded once per team, to majority holder”.

---

## 9) Validation Rules (selected critical ones)

### Reinforcement
- Must resolve forced trades first if hand size ≥ threshold.
- Can only place on territories you can place on (self or teammate if allowed).
- Cannot place more than remaining.

### Attack
- Must be in Attack phase and no pending Occupy.
- `from` must be controlled by actor (recommend: own territory only; don’t allow attacks from teammate territories even if you can place/fortify there—keeps agency clear and prevents “using teammate armies offensively”).
- `to` owner must not be actor or teammate (if prevent friendly fire).
- adjacency required.
- `from.armies >= 2`.

### Occupy
- Only when pending exists.
- `moveArmies` within `[minMove, maxMove]`.

### Fortify
- Only in Fortify phase.
- `count >= 1` and leave at least 1 behind.
- `from/to` must be permissible (self/teammate based on config).
- adjacency or connected path based on mode.

### Cards/Trade
- Must be in Reinforcement phase (or optionally also allow in Attack phase if you want classic; recommend Reinforcement only for simplicity).
- Set validity enforced (with wild substitution).
- Cards must be in player hand.

---

## 10) Events (minimum contract)
Emit events sufficient for replay and UI animation:

- Setup:
  - `SetupCompleted { turnOrder, neutralTerritories, assignmentsSummary }`
- Reinforcement:
  - `ReinforcementsGranted { playerId, amount, sources }`
  - `CardsTraded { playerId, cardIds, value, tradesCompletedAfter }`
  - `ReinforcementsPlaced { playerId, territoryId, count }`
- Combat:
  - `AttackResolved { from, to, attackDice, defendDice, rolls, losses }`
  - `TerritoryCaptured { from, to, newOwnerId }`
  - `PlayerEliminated { eliminatedId, byId, cardsTransferred }`
  - `OccupyResolved { from, to, moved }`
- Fortify:
  - `FortifyResolved { from, to, moved }`
- Turn:
  - `CardDrawn { playerId, cardId }`
  - `TurnEnded { playerId }`
  - `TurnAdvanced { nextPlayerId, round }`
- Game end:
  - `GameEnded { winningPlayerId?; winningTeamId? }`

---

## 11) Public API (v1)

### Required
- `createGame({ map, players, ruleset, seed }): { state: GameState; events?: GameEvent[] }`
- `validateAction(state, action, ctx): ValidationResult`
- `applyAction(state, action, ctx): ApplyResult`
  - returns `{ ok: true, state, events }` or `{ ok: false, errors }`

### Recommended
- `getLegalActions(state, ctx): Action[]`
- `selectors/*` for UI convenience (pure)

`ctx` minimally:
- `actorId: PlayerId`

---

## 12) Testing Plan

### Unit tests
- Map validation
- Setup determinism (same seed → same assignments)
- Combat determinism (same seed/index + action → same dice/events)
- Trading legality and value schedule (including overflow repeat-last)
- Forced trade enforcement
- Team permissions (cannot attack teammate; can fortify through teammates in connected mode)
- Continent bonus recipient majority logic (including ties)

### Property/invariant tests
- No negative armies
- Defeated players own 0 territories
- Total card count conserved across deck/discard/hands
- No action can mutate state if invalid
- Replay from action log matches step-by-step apply

---

## 13) Milestones & Acceptance Criteria

### M1 — Monorepo + Engine Skeleton
- Bun workspace created
- `risk-engine` builds to ESM + types
- basic types, map validation, RNG module

**Done when**
- `bun test` passes sample tests
- `risk-engine` can be imported by a dummy consumer

### M2 — Setup (automated classic-like with neutrals)
- `createGame` produces post-setup playable state
- neutrals assigned as configured
- initial armies placed deterministically

**Done when**
- same seed yields identical setup
- no territory unassigned; army counts valid

### M3 — Reinforcement core (no cards yet)
- reinforcements computed and placed
- phase transitions to Attack

**Done when**
- placement respects permissions; cannot exceed remaining

### M4 — Combat + Occupy (async auto-defend)
- attack resolution, capture, pending occupy, elimination detection

**Done when**
- defender never acts; engine auto-defends
- capture forces occupy step
- elimination transfers cards later (once cards are implemented)

### M5 — Fortify modes
- adjacent fortify
- connected fortify with BFS pathfinding
- teammate traversal support behind config (even if teams not fully implemented yet)

**Done when**
- connected mode finds valid paths; rejects invalid

### M6 — Cards: deck, hands, draw-on-capture
- deck model + reshuffle
- capturedThisTurn → draw 1 at end turn

**Done when**
- draw only if capture occurred
- deterministic draws from RNG/stack state

### M7 — Trading (explicit list, repeat-last overflow)
- set validation with wilds
- forced trade threshold
- territory trade bonus as allocatable reinforcements

**Done when**
- trade schedule matches config; overflow repeats last value

### M8 — Teams + continent bonus majority recipient
- permissions for place/fortify/traverse
- prevent attacking teammates
- win condition last team standing
- continent bonuses: awarded only to the majority-holder teammate when team controls continent

**Done when**
- no friendly fire needed to secure continent bonus
- bonus not multiplied across team members
- tie-breaking deterministic

### M9 — Polish
- `getLegalActions`
- replay helper (optional)
- stronger invariants

---

## 14) Explicit Decisions / Defaults
- Trade values overflow: **repeat last**.
- Connected fortify traversal: **allowed through teammate territories** (when enabled).
- Continent bonus in teams: if team controls entire continent, bonus goes to **majority-holder** teammate only (ties broken deterministically).
- Setup: automated seeded shuffle assignment with **some neutrals** and classic-like initial troop distribution.

---

If you want, I can also provide:
- a concrete `RulesetConfig` default object definition (no giant code, just the shape and example values), and
- the exact tie-break rules I recommend (e.g., “lowest index in turnOrder wins ties”) so behavior is fully specified.
