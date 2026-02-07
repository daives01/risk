# Frontend Tech Debt Audit (Priority Order)

Scope audited: `/Users/daniel/Documents/risk/web/src`

## Remediation Progress (2026-02-07)

- [x] P0.1 Lint failures fixed (`bun run lint` now passes).
- [x] P0.2 `game.tsx` decomposed into feature modules:
  - `web/src/lib/game/use-game-queries.ts`
  - `web/src/lib/game/use-game-actions.ts`
  - `web/src/lib/game/use-game-shortcuts.ts`
  - `web/src/lib/game/adapters.ts`
  - `web/src/lib/game/display.ts`
  - `web/src/components/game/game-panels.tsx`
- [x] P0.3 `admin-map-editor.tsx` decomposed with extracted editor validation module:
  - `web/src/lib/map-editor-validation.ts`
- [x] P1.4 Dead/abandoned game UI path removed:
  - deleted `web/src/components/game/action-panel.tsx`
  - deleted `web/src/components/game/game-board.tsx`
  - deleted `web/src/components/game/phase-panel.tsx`
  - deleted `web/src/components/game/player-list.tsx`
  - deleted `web/src/components/game/event-log.tsx`
  - deleted `web/src/lib/use-game-controller.ts`
- [x] P1.5 Keyboard handling centralized via shared shortcut helpers (`web/src/lib/keyboard-shortcuts.ts`) and route-scoped hook (`web/src/lib/game/use-game-shortcuts.ts`).
- [x] P1.6 Duplicate upload/image logic extracted to `web/src/lib/map-upload.ts` and wired into both admin pages.
- [x] P2.7 Auth page scaffolding consolidated with shared `web/src/components/auth/auth-shell.tsx`.
- [x] P2.8 Type boundary adapters added for gameplay view/map data (`web/src/lib/game/adapters.ts`) and editor validation types (`web/src/lib/map-editor-validation.ts`).
- [x] P3.9 Styling direction codified in `web/STYLE_GUIDE.md`.

## P0 - Must fix immediately

### 1) Lint is currently failing (12 errors, 3 warnings)
- Evidence:
  - `/Users/daniel/Documents/risk/web/src/pages/join-game.tsx:23` (`react-hooks/set-state-in-effect`)
  - `/Users/daniel/Documents/risk/web/src/pages/admin-map-editor.tsx:224` and `:225` (`no-explicit-any`)
  - `/Users/daniel/Documents/risk/web/src/components/ui/button.tsx:64` (`react-refresh/only-export-components`)
  - `/Users/daniel/Documents/risk/web/src/components/game/map-canvas.tsx:243`, `:248`, `:252` (`react-hooks/refs`)
- Why this hurts later:
  - Blocks safe refactors and gradually normalizes broken standards.
  - Increases chance of subtle React behavior bugs (especially effect and ref misuse).
- Recommended cleanup:
  - Get `bun run lint` green as a release gate.
  - Move non-component exports (`buttonVariants`) out of component modules or adjust architecture.
  - Remove `as any` from map validation code and enforce typed adapters.
  - Replace effect-driven state toggles in join flow with event/action-driven flow.

### 2) `GamePage` is a high-risk monolith (~1000 LOC)
- Evidence:
  - `/Users/daniel/Documents/risk/web/src/pages/game.tsx` (1009 lines)
  - Mixed concerns: data loading, action orchestration, history playback, keyboard handling, and full UI rendering in one file.
- Why this hurts later:
  - Any change risks unrelated regressions.
  - Hard to unit test and hard to onboard new contributors.
  - High merge-conflict probability as features grow.
- Recommended cleanup:
  - Split into feature modules:
    - `useGameQueries` (Convex data access)
    - `useGameActions` (submit/trade/end-turn/reinforcement mutations)
    - `useGameShortcuts` (all keyboard behavior)
    - `GameTopBar`, `GamePlayersCard`, `GameHistoryPanel`, `GameHandPanel`
  - Keep page file as composition only.

### 3) `AdminMapEditorPage` is also a high-risk monolith (~900 LOC)
- Evidence:
  - `/Users/daniel/Documents/risk/web/src/pages/admin-map-editor.tsx` (900 lines)
  - Contains upload, geometry, validation, drag interactions, continent editing, and publish/save orchestration.
- Why this hurts later:
  - Hard to evolve editor features without breaking existing map tooling.
  - Validation and mutation logic is tightly coupled to view state.
- Recommended cleanup:
  - Extract into:
    - `useMapEditorState`
    - `useMapEditorValidation`
    - `MapEditorCanvas`
    - `TerritoryManagerPanel`
    - `ContinentManagerPanel`
  - Share upload/dimension utilities with admin maps page.

## P1 - High-value cleanup

### 4) Dead/abandoned game UI architecture is still in repo
- Evidence:
  - Unused components (not imported anywhere):
    - `/Users/daniel/Documents/risk/web/src/components/game/action-panel.tsx`
    - `/Users/daniel/Documents/risk/web/src/components/game/game-board.tsx`
    - `/Users/daniel/Documents/risk/web/src/components/game/phase-panel.tsx`
    - `/Users/daniel/Documents/risk/web/src/components/game/player-list.tsx`
    - `/Users/daniel/Documents/risk/web/src/components/game/event-log.tsx`
  - Likely orphan hook:
    - `/Users/daniel/Documents/risk/web/src/lib/use-game-controller.ts`
- Why this hurts later:
  - Creates “which path is real?” confusion and accidental edits to dead code.
  - Drifts types and behavior from the live implementation.
- Recommended cleanup:
  - Delete dead path or migrate back to it intentionally.
  - If kept for future use, move to an explicit `archive/` folder with README status.

### 5) Keyboard shortcut handling is fragmented and collision-prone
- Evidence:
  - Global listeners in multiple places:
    - `/Users/daniel/Documents/risk/web/src/components/ui/global-keyboard-nav.tsx`
    - `/Users/daniel/Documents/risk/web/src/pages/home.tsx`
    - `/Users/daniel/Documents/risk/web/src/pages/game.tsx`
    - `/Users/daniel/Documents/risk/web/src/components/game/map-canvas.tsx`
- Why this hurts later:
  - Shortcut conflicts become hard to debug.
  - Page-specific handlers can interfere with app-wide navigation logic.
- Recommended cleanup:
  - Centralize shortcut registration with scoped contexts (app-level vs route-level).
  - Standardize typing checks and modifier handling in one utility.

### 6) Duplicate helper logic across admin pages
- Evidence:
  - Duplicate `uploadImage` + `readImageDimensions` in:
    - `/Users/daniel/Documents/risk/web/src/pages/admin-maps.tsx`
    - `/Users/daniel/Documents/risk/web/src/pages/admin-map-editor.tsx`
- Why this hurts later:
  - Inconsistent bug fixes and behavior drift.
- Recommended cleanup:
  - Extract shared file utilities to `/Users/daniel/Documents/risk/web/src/lib/map-upload.ts`.

## P2 - Medium priority (future-proofing)

### 7) Repeated auth form patterns should be consolidated
- Evidence:
  - Similar card/form/error/loading patterns in:
    - `/Users/daniel/Documents/risk/web/src/pages/login.tsx`
    - `/Users/daniel/Documents/risk/web/src/pages/signup.tsx`
    - `/Users/daniel/Documents/risk/web/src/pages/reset-password.tsx`
    - `/Users/daniel/Documents/risk/web/src/pages/forgot-password.tsx`
- Why this hurts later:
  - Visual and behavior drift when adding features like password policy, anti-abuse messaging, and accessibility improvements.
- Recommended cleanup:
  - Introduce shared `AuthLayout` and reusable field/error/footer components.

### 8) Type boundaries are too loose in key gameplay/admin flows
- Evidence:
  - Multiple ad-hoc local types that mirror backend contracts (`PublicState`, `MapVisual`, `GameAction`) in `/Users/daniel/Documents/risk/web/src/pages/game.tsx`.
  - `as` casting and `as any` usage in core editor validation flow.
- Why this hurts later:
  - Backend/frontend drift will fail at runtime instead of compile time.
- Recommended cleanup:
  - Introduce a typed adapter layer for Convex query results and remove untyped casts from page components.

## P3 - Lower priority polish

### 9) Style system mixes utility classes and custom semantic classes inconsistently
- Evidence:
  - Heavy custom classes in `/Users/daniel/Documents/risk/web/src/index.css` (`.app-*`, `.glass-panel`, `.soft-grid`) while pages also rely on inline utility compositions.
- Why this hurts later:
  - Harder to enforce consistent design and spacing rules as UI scales.
- Recommended cleanup:
  - Pick a direction per surface (semantic class layer or utility-first) and codify rules in a frontend style guide.

## Suggested execution order
1. Make lint pass and enforce it in CI/pre-commit.
2. Break up `game.tsx` into hooks + presentational components.
3. Break up `admin-map-editor.tsx` similarly.
4. Remove/archive dead game components and unused controller hook.
5. Centralize keyboard shortcut system.
6. Extract duplicated upload/image utilities.
7. Consolidate auth page scaffolding.
8. Tighten type adapters and remove broad casts.
