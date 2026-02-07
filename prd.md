# PRD: Next Feature Milestones for Risk MVP

## Context
Current MVP game loop is working. This document defines the next prioritized milestones and implementation tasks across:
- `packages/risk-engine` (headless, reusable game mechanics)
- `convex` + `web` (product/app behavior, UI, persistence, authoring workflows)

Date: 2026-02-07

## Product + Architecture Guardrails
1. Put core Risk rules/mechanics in `risk-engine`.
2. Put presentation, UX interactions, and product-specific workflows in `web`/`convex`.
3. Extend existing team support in-engine rather than re-implementing team logic in app code.
4. Keep map authoring/admin affordances in app/backend, except map validation primitives that are game-agnostic.

## Prioritization Rationale
1. **Map-based player caps** first: unlocks bigger matches and prevents invalid game setups.
2. **Team game completion** second: highest gameplay value, partially supported already in engine.
3. **Async game support (turn timers + weekend exclusion)** third: critical product mode for long-form multiplayer and retention.
4. **Game-start ruleset configuration** fourth: high leverage, already mostly supported by `risk-engine`, and unblocks variant playstyles.
5. **Player color selection** fifth: key readability/identity improvement in multiplayer lobbies and matches.
6. **In-game chat (global + team)** sixth: supports coordination and social stickiness.
7. **Replay scrubbing timeline** seventh: improves learnability, shareability, and post-game analysis.
8. **In-game information + highlighting UX** eighth: improves playability/readability once teams and colors are clear.
9. **Admin JSON import + LLM prompt copy** ninth: creator productivity feature; lower player-facing urgency.

## Execution Tracker

### Milestones
- [x] Milestone 1: Map-Configurable Player Counts (P0)
- [x] Milestone 2: Full Team Games (P0)
- [x] Milestone 3: Async Game Support (Turn Timers + Weekend Exclusion) (P0)
- [ ] Milestone 4: Game Start Ruleset Configuration (P1)
- [ ] Milestone 5: Pre-Game Player Color Selection (P1)
- [ ] Milestone 6: In-Game Chat (Global + Team) (P1)
- [ ] Milestone 7: Replay Scrubbing Timeline (P1)
- [ ] Milestone 8: In-Game Player Info + Highlighting UX (P1)
- [ ] Milestone 9: Admin Map JSON Import + “Copy Prompt” for LLM Seeding (P2)

### Tasks
- [ ] 1.1 Define map player-cap metadata
- [ ] 1.2 Enforce in game creation/start
- [ ] 1.3 UI wiring for create-game and admin editor
- [ ] 1.4 Test coverage
- [ ] 2.1 Confirm and extend engine team mechanics
- [ ] 2.2 Team setup data model in game lifecycle
- [ ] 2.3 Team setup UX in lobby/create flow
- [ ] 2.4 Test + rollout
- [ ] 3.1 Define async timing model + rules
- [ ] 3.2 Persist turn deadlines and enforce timeout behavior
- [ ] 3.3 Create/lobby/in-game UI for timer selection + visibility
- [ ] 3.4 Notifications + tests for async mode
- [ ] 4.1 Define game-level ruleset overrides model
- [ ] 4.2 Wire ruleset into action processing
- [ ] 4.3 Add host-facing pre-game settings UI
- [ ] 4.4 Extend `risk-engine` for fortify-count limits
- [ ] 5.1 Data model + permission rules
- [ ] 5.2 Lobby color picker UX
- [ ] 5.3 In-game rendering integration
- [ ] 5.4 Validation and tests
- [ ] 6.1 Define chat data model + visibility rules
- [ ] 6.2 Backend chat mutations/queries + access control
- [ ] 6.3 In-game chat UI/UX
- [ ] 6.4 Chat moderation/safety baseline + tests
- [ ] 7.1 Expand replay data model for frame timeline
- [ ] 7.2 Scrubbable history UI controls
- [ ] 7.3 Replay correctness/performance
- [ ] 7.4 Optional share/export follow-up
- [ ] 8.1 Enrich player info panel
- [ ] 8.2 Add highlight filters (player/team click)
- [ ] 8.3 Interaction and correctness polish
- [ ] 9.1 Define import JSON contract and validation
- [ ] 9.2 Admin editor import UX
- [ ] 9.3 “Copy Prompt” helper for LLM generation
- [ ] 9.4 Documentation + safeguards

---

## Milestone 1: Map-Configurable Player Counts (P0)

### Outcome
Each map defines allowed player range (or max), create-game UI respects it, backend enforces it, and lobby/start flows remain consistent.

### Task 1.1: Define map player-cap metadata
- Scope: `convex/schema.ts`, map validators, map draft/publish APIs.
- Subtasks:
1. Add map-level player constraints to map data model (recommend `minPlayers`, `maxPlayers` on map doc metadata).
2. Update `adminMaps` create/save/publish validators to require valid bounds (`min >= 2`, `max >= min`).
3. Backfill existing maps with safe defaults (e.g. 2-6) through migration/seed script.
4. Expose these fields in `maps.list` and `maps.getByMapId` responses.
- Ownership: app/backend (not engine).

### Task 1.2: Enforce in game creation/start
- Scope: `convex/lobby.ts`, create-game mutation.
- Subtasks:
1. Replace hardcoded 2-6 check with selected map bounds.
2. Validate requested `maxPlayers` against map constraints.
3. Add defensive checks at `startGame` to ensure joined player count stays valid.
4. Return clear errors for invalid configurations.
- Ownership: app/backend.

### Task 1.3: UI wiring for create-game and admin editor
- Scope: `web/src/pages/create-game.tsx`, `web/src/pages/admin-map-editor.tsx`.
- Subtasks:
1. Show map player range in map picker cards.
2. Constrain max-player selector based on selected map.
3. Add map-editor inputs for min/max players with inline validation.
4. Display useful helper copy (example recommended size derived from map territory count, optional).
- Ownership: app/frontend.

### Task 1.4: Test coverage
- Subtasks:
1. Convex mutation tests (or integration tests) for invalid/valid create flows.
2. UI tests for create-game selector behavior.
3. Regression test ensuring old maps without metadata are migrated.
- Ownership: app/backend + frontend.

### Acceptance Criteria
- Cannot create or start a game outside map player bounds.
- Admin can edit player bounds per map.
- Create-game UI only offers valid choices.

---

## Milestone 2: Full Team Games (P0)

### Outcome
Team mode is fully playable end-to-end: assignment, permissions, win condition, and continent bonus behavior.

### Task 2.1: Confirm and extend engine team mechanics
- Scope: `packages/risk-engine`.
- Subtasks:
1. Verify existing team permission flags cover placement/attack/fortify requirements (already partially present).
2. Add/confirm team victory evaluation (`last team standing`) in game-end logic.
3. Implement continent bonus allocation rule for teams:
   - If a team fully controls a continent, only one player receives the bonus.
   - Bonus recipient = teammate with majority of that continent's territories (tie-break deterministic rule required).
4. Add explicit tests for majority bonus and tie behavior.
5. Ensure event/state output is deterministic and serializable.
- Ownership: `risk-engine` (core game mechanics).

### Task 2.2: Team setup data model in game lifecycle
- Scope: `convex/schema.ts`, `convex/lobby.ts`, `convex/gameplay.ts`, game views.
- Subtasks:
1. Add optional team configuration to games (team mode flag, team assignments, assignment strategy).
2. Store `teamId` per engine player consistently when game starts.
3. Pass teams config into engine action application and legal action generation (already partly wired; normalize all call sites).
4. Include team metadata in public/player game views.
- Ownership: app/backend integration layer.

### Task 2.3: Team setup UX in lobby/create flow
- Scope: `web/src/pages/create-game.tsx`, lobby UI.
- Subtasks:
1. Add team-mode toggle when creating game.
2. Add host controls to assign/rebalance teams before start.
3. Add validation: prevent start when team setup is invalid (e.g., empty team, heavily unbalanced if disallowed).
4. Show team composition preview.
- Ownership: app/frontend.

### Task 2.4: Test + rollout
- Subtasks:
1. Engine tests for team win + continent bonus distribution.
2. Backend tests for game creation/start with teams.
3. End-to-end smoke scenario: 2v2 team game with teammate placement and fortify.
- Ownership: engine + app.

### Acceptance Criteria
- Team games can be created, started, and completed.
- Teammate placement/fortify works, teammate attack respects ruleset.
- Game ends with `winningTeamId` when applicable.
- Team-controlled continents grant exactly one bonus per continent per turn.

---

## Milestone 3: Async Game Support (Turn Timers + Weekend Exclusion) (P0)

### Outcome
Games can run in realtime or async mode with per-turn deadlines and optional weekend exclusion.

### Task 3.1: Define async timing model + rules
- Scope: `convex/schema.ts`, lobby/create models, game runtime state.
- Subtasks:
1. Add game timing mode at creation:
   - `realtime` (no timer, no email reminders)
   - `async_1d`
   - `async_3d`
2. Add `excludeWeekends` boolean for async modes.
3. Define canonical deadline semantics:
   - Deadline based on turn start timestamp.
   - When `excludeWeekends=true`, Saturday/Sunday time does not count.
   - Example: Friday 5:00 PM + 1 day => Monday 5:00 PM.
4. Store absolute `turnDeadlineAt` on game state for deterministic enforcement.
- Ownership: app/backend.

### Task 3.2: Persist turn deadlines and enforce timeout behavior
- Scope: `convex/gameplay.ts`, scheduled jobs/cron, turn advancement logic.
- Subtasks:
1. Compute next deadline whenever turn advances.
2. Add timeout handler job to process expired turns.
3. Define deterministic timeout resolution by phase (auto-end turn, forced minimal occupy, or auto-resign if blocked).
4. Emit timeline events for timeout actions so replay/history remains accurate.
- Ownership: app/backend + engine integration.

### Task 3.3: Create/lobby/in-game UI for timer selection + visibility
- Scope: `web/src/pages/create-game.tsx`, `web/src/pages/lobby.tsx`, `web/src/pages/game.tsx`.
- Subtasks:
1. Add timing selector (`Realtime`, `1 day`, `3 day`) and weekend checkbox on game creation.
2. Show countdown/deadline in lobby and in-game HUD.
3. Disable/hide weekend toggle when realtime is selected.
4. Show explicit copy of timezone/deadline timestamps to avoid ambiguity.
- Ownership: app/frontend.

### Task 3.4: Notifications + tests for async mode
- Scope: `convex/emails.ts`, scheduler tests, gameplay tests.
- Subtasks:
1. Send email reminders for async games only (e.g., turn start and near expiry).
2. Never send async emails in realtime mode.
3. Test weekend exclusion date math around Friday/Saturday/Sunday boundaries.
4. Add end-to-end test for timeout progression.
- Ownership: app/backend.

### Acceptance Criteria
- Host can choose realtime, 1-day async, or 3-day async at game creation.
- Weekend exclusion works exactly as specified.
- Realtime mode has no timer and no email reminders.
- Expired turns are resolved automatically and deterministically.

---

## Milestone 4: Game Start Ruleset Configuration (P1)

### Outcome
Hosts can configure supported `risk-engine` rules when creating/starting a game, and those rules are persisted and applied consistently by backend + engine runtime.

### Task 4.1: Define game-level ruleset overrides model
- Scope: `convex/schema.ts`, create/start mutations, game document model.
- Subtasks:
1. Add optional `rulesetOverrides` object to game metadata, with explicit allowlist of fields.
2. Start with high-value fields already supported by `risk-engine`:
   - `fortify.fortifyMode` (`adjacent` vs `connected`)
   - `fortify.maxFortifiesPerTurn` (new engine support required)
   - `cards.forcedTradeHandSize`
   - `cards.awardCardOnCapture`
   - `combat.allowAttackerDiceChoice`
   - team permission flags where relevant for team games
3. Store resolved effective ruleset snapshot at game start for deterministic replay.
4. Validate override bounds/types and reject unknown fields.
- Ownership: app/backend integration (modeling), engine remains source of truth for rule semantics.

### Task 4.2: Wire ruleset into action processing
- Scope: `convex/lobby.ts`, `convex/gameplay.ts`, legal-actions integration.
- Subtasks:
1. Ensure all engine calls (`applyAction`, legal action generation, reinforcement calculations) use game’s effective ruleset.
2. Remove remaining `defaultRuleset` assumptions from runtime paths where game-specific overrides should apply.
3. Add compatibility fallback for legacy games without overrides.
- Ownership: app/backend + engine integration.

### Task 4.3: Add host-facing pre-game settings UI
- Scope: `web/src/pages/create-game.tsx`, `web/src/pages/lobby.tsx`.
- Subtasks:
1. Add “Game Rules” panel with sensible defaults and tooltips.
2. Allow host to edit settings pre-start; lock settings once game becomes active.
3. Show read-only rules summary to all players in lobby and in-game sidebar.
4. Add inline validation and “reset to default rules” action.
- Ownership: app/frontend.

### Task 4.4: Extend `risk-engine` for fortify-count limits
- Subtasks:
1. Add engine ruleset config for fortify count (e.g. `fortify.maxFortifiesPerTurn`).
2. Add turn-scoped state tracking for fortifies used and reset behavior on turn advance.
3. Enforce cap in `applyAction` fortify flow and legal action generation.
4. Preserve backward compatibility for existing persisted games (migration/default handling).
5. Add deterministic unit tests for:
   - zero/one/multi fortify caps
   - cap reached behavior
   - interaction with `adjacent` and `connected` fortify modes
6. Expose this setting in pre-game rules UI with validation and helper copy.
- Ownership: `risk-engine` + app/backend/frontend integration.

### Acceptance Criteria
- Host can configure supported rules before game start.
- Active game behavior matches configured rules (not global defaults).
- Configured fortify count per turn is enforced by engine runtime and legal action generation.
- Legacy games still run with default behavior.

---

## Milestone 5: Pre-Game Player Color Selection (P1)

### Outcome
Player colors are chosen in lobby before start, with host override permissions and self-service player updates.

### Task 5.1: Data model + permission rules
- Scope: `convex/schema.ts`, lobby mutations/queries.
- Subtasks:
1. Add `color` field to `gamePlayers` (or equivalent lobby assignment structure).
2. Add palette constraints and uniqueness enforcement per game.
3. Permission rules:
   - host can change any player color;
   - player can change own color;
   - non-host cannot change others.
4. Add deterministic fallback assignment for unset colors.
- Ownership: app/backend.

### Task 5.2: Lobby color picker UX
- Scope: `web/src/pages/lobby.tsx`.
- Subtasks:
1. Show current color swatch next to each player.
2. Add picker interaction for self; host gets controls for all rows.
3. Prevent conflicting selections in real time (disable taken colors, optimistic updates with rollback on conflict).
4. Persist changes and reflect across all connected lobby clients.
- Ownership: app/frontend.

### Task 5.3: In-game rendering integration
- Scope: `web/src/lib/game/display.ts`, game view adapters/projections.
- Subtasks:
1. Replace turn-order-derived color mapping with persisted player color mapping.
2. Keep neutral and spectator-safe defaults.
3. Ensure color references are used consistently in map nodes, player list, events, and highlights.
- Ownership: app/frontend + backend view projection.

### Task 5.4: Validation and tests
- Subtasks:
1. Backend tests for permission and uniqueness constraints.
2. Frontend tests for host vs player controls and conflict handling.
3. Regression check for older games without stored colors.
- Ownership: app/backend + frontend.

### Acceptance Criteria
- Each player has one visible color in lobby and match.
- Host can edit anyone; player can edit self only.
- No duplicate colors within a game unless explicitly allowed by future rule.

---

## Milestone 6: In-Game Chat (Global + Team) (P1)

### Outcome
Players can send text chat during games in both global and team-only channels.

### Task 6.1: Define chat data model + visibility rules
- Scope: `convex/schema.ts`, game view/query design.
- Subtasks:
1. Add `gameMessages` table with `gameId`, `senderUserId`, `senderEnginePlayerId`, `channel`, `body`, `createdAt`.
2. Channel types: `global` and `team`.
3. Team message visibility: only teammates and eligible spectators/admins per policy.
4. Persist enough sender metadata for stable replay/log display.
- Ownership: app/backend.

### Task 6.2: Backend chat mutations/queries + access control
- Scope: `convex` mutations/queries.
- Subtasks:
1. Add send-message mutation with membership and channel authorization checks.
2. Add paginated query/subscription for recent messages.
3. Enforce input limits (length, rate limiting, basic sanitization).
4. Prevent non-team members from reading/writing team chat.
- Ownership: app/backend.

### Task 6.3: In-game chat UI/UX
- Scope: `web/src/pages/game.tsx` and related components.
- Subtasks:
1. Add chat panel with channel switcher (`Global`, `Team` when team mode active).
2. Show sender name/color and timestamp.
3. Add unread indicator and auto-scroll behavior.
4. Keep mobile layout usable without obscuring action controls.
- Ownership: app/frontend.

### Task 6.4: Chat moderation/safety baseline + tests
- Subtasks:
1. Add mute/report placeholder hooks for future moderation.
2. Add backend tests for channel access and rate limits.
3. Add frontend tests for channel switching and render behavior.
- Ownership: app/backend + frontend.

### Acceptance Criteria
- Global chat is visible to all game participants.
- Team chat is visible only to teammates.
- Unauthorized reads/writes are blocked server-side.

---

## Milestone 7: Replay Scrubbing Timeline (P1)

### Outcome
Players can scrub through game history smoothly using a timeline, not only stepwise history controls.

### Task 7.1: Expand replay data model for frame timeline
- Scope: existing action/event history pipeline.
- Subtasks:
1. Ensure frame list is complete and index-addressable for every action.
2. Include summary labels per frame (turn, action type, actor).
3. Keep deterministic frame reconstruction from persisted actions.
- Ownership: app/backend + frontend adapters.

### Task 7.2: Scrubbable history UI controls
- Scope: `web/src/pages/game.tsx`.
- Subtasks:
1. Add timeline slider for frame index scrub.
2. Add keyboard shortcuts and play/pause support.
3. Add quick-jump controls (turn boundaries, captures, eliminations).
4. Keep current “History” mode behavior as fallback.
- Ownership: app/frontend.

### Task 7.3: Replay correctness/performance
- Subtasks:
1. Ensure scrubbed frame state never affects live action submission.
2. Optimize render path for long games (memoization/windowing as needed).
3. Add regression tests for frame/event alignment.
- Ownership: app/frontend + backend.

### Task 7.4: Optional share/export follow-up
- Subtasks:
1. Define follow-up scope for shareable replay links or exported event logs.
2. Keep out of MVP if it delays core scrub feature.
- Ownership: product + app planning.

### Acceptance Criteria
- User can drag a timeline to any frame and view board state instantly.
- Scrubbing is read-only and cannot mutate live game state.
- Existing history playback still works.

---

## Milestone 8: In-Game Player Info + Highlighting UX (P1)

### Outcome
Players can quickly understand game state and focus map highlights by player/team.

### Task 8.1: Enrich player info panel
- Scope: projections + UI panels.
- Subtasks:
1. Add team label in player rows when team mode is active.
2. Show: territories, total troops, reserve troops, card count.
3. Team-private hand visibility: teammate card details visible only to teammates (if enabled by rules/product decision), otherwise count only.
4. Keep spectator-safe projection rules explicit.
- Ownership:
  - Visibility rules derived from game info policy: app/backend.
  - Rendering: app/frontend.

### Task 8.2: Add highlight filters (player/team click)
- Scope: `web/src/components/game/game-panels.tsx`, `web/src/components/game/map-canvas.tsx`, `web/src/pages/game.tsx`.
- Subtasks:
1. Introduce highlight state: `none | player:<id> | team:<id>`.
2. Make player row clickable to highlight owned territories.
3. Add clickable team chips/labels to highlight all team territories.
4. Visually de-emphasize non-highlighted territories while preserving action affordances.
5. Add clear/reset interaction and keyboard shortcut.
- Ownership: app/frontend.

### Task 8.3: Interaction and correctness polish
- Subtasks:
1. Ensure highlight mode does not interfere with placement/attack/fortify selection states.
2. Ensure colorblind-safe contrast and clear selected vs highlighted visuals.
3. Preserve map performance with large territory counts (memoized highlight sets).
- Ownership: app/frontend.

### Acceptance Criteria
- Clicking a player highlights exactly that player’s territories.
- Clicking a team highlights all territories owned by team members.
- Player info panel includes team + troop/reserve/card data as applicable.

---

## Milestone 9: Admin Map JSON Import + “Copy Prompt” for LLM Seeding (P2)

### Outcome
Admins can bootstrap maps from LLM-generated JSON, then refine anchors/links in editor.

### Task 9.1: Define import JSON contract and validation
- Scope: map editor + validation layer.
- Subtasks:
1. Define `MapImportJson` schema covering at minimum:
   - territory IDs/names
   - adjacency
   - continents + bonuses
   - optional draft anchor suggestions (normalized x/y)
   - optional recommended player bounds metadata
2. Build strict parser with actionable errors (missing territories, asymmetric adjacency, duplicate IDs, bad bonuses).
3. Reuse existing normalize/validate functions where possible.
- Ownership: app/frontend/backend (import workflow), with risk-engine validators reused.

### Task 9.2: Admin editor import UX
- Scope: `web/src/pages/admin-map-editor.tsx`.
- Subtasks:
1. Add “Import JSON” input surface (paste modal and/or file upload).
2. Add preview step before apply (counts, warnings, changed entities).
3. Apply imported graph + continents + optional anchors non-destructively with confirm step.
4. Preserve undo path (cancel before save; optional snapshot stack).
- Ownership: app/frontend.

### Task 9.3: “Copy Prompt” helper for LLM generation
- Scope: admin editor UI.
- Subtasks:
1. Add “Copy Prompt” button that copies a canonical instruction template for LLMs.
2. Prompt should include:
   - exact JSON schema
   - strict formatting constraints
   - adjacency symmetry requirement
   - continent assignment requirements
   - optional anchor guidance and quality checklist
3. Include an example JSON snippet in prompt template.
4. Add “Prompt copied” toast and telemetry (optional).
- Ownership: app/frontend.

### Task 9.4: Documentation + safeguards
- Subtasks:
1. Add docs section for map import workflow and expected cleanup steps.
2. Clarify that imported anchors are draft-quality and must be adjusted manually.
3. Add validation gate to prevent publish until imported map passes full checks.
- Ownership: app + docs.

### Acceptance Criteria
- Admin can paste/import valid JSON and populate map draft quickly.
- Invalid JSON gives specific, line-item feedback.
- Copy-prompt button produces reusable instructions for external LLM tools.

---

## Cross-Cutting Technical Notes

### Engine vs App Boundaries
- **`risk-engine`** should own:
  - Team interaction permissions.
  - Team win conditions.
  - Team-aware continent reinforcement allocation logic.
  - Core ruleset semantics and rule-processing behavior.
- **App layer (`convex`/`web`)** should own:
  - Team assignment UX and persistence.
  - Async timer scheduling, deadline computation, and notification delivery.
  - Game-specific ruleset override storage, pre-game settings UX, and permissions.
  - Player color selection storage, permissions, and rendering.
  - Chat channels, visibility enforcement integration, and chat UX.
  - Replay timeline UX and frame scrubbing controls.
  - Public/private game projections and teammate card visibility policy.
  - Highlighting and UI interactions.
  - Admin map JSON import and LLM prompt copy tool.
  - Map-level player-cap metadata (product constraint, not core battle mechanic).

### Suggested Delivery Sequence
1. Milestone 1 (map player caps)
2. Milestone 2 (team games core completion)
3. Milestone 3 (async game support)
4. Milestone 4 (game-start ruleset configuration)
5. Milestone 5 (pre-game player colors)
6. Milestone 6 (in-game chat)
7. Milestone 7 (replay scrubbing timeline)
8. Milestone 8 (in-game info + highlighting)
9. Milestone 9 (map import + prompt tooling)

### Dependencies and Risks
- Team bonus majority rule needs deterministic tie-break (define early to avoid replay/version drift).
- Weekend exclusion timer math must be timezone-safe and consistent across server jobs and UI.
- Timeout handling policy must be explicit per phase to avoid player confusion or stalled states.
- Team-chat access control must be server-authoritative to prevent information leaks.
- Projection changes for teammate card visibility can leak hidden info if not tested carefully.
- Larger player counts may expose UI scaling/performance issues in panels and map labels.

### Definition of Done (overall)
1. All milestones have backend + frontend + tests where applicable.
2. Engine mechanics are covered by deterministic unit tests.
3. No app-specific UX logic leaks into `risk-engine`.
4. Existing non-team game behavior remains unchanged.
