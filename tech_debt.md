# Tech Debt Priorities

## Progress (2026-02-08)

- `P0 testing`: In progress.
  - Added targeted unit tests for invite collision handling and email retry behavior:
    - `convex/inviteCodes.test.ts`
    - `convex/sendEmail.test.ts`
  - Remaining: add true integration tests for Convex lobby/gameplay/async turn orchestration and page-level UI tests.

- `P1 type-safety boundaries`: Partially addressed.
  - Replaced repeated map/state cast chains in core modules with typed adapter functions:
    - `convex/typeAdapters.ts`
    - adopted in `convex/gameplay.ts`, `convex/asyncTurns.ts`, `convex/games.ts`, `convex/lobby.ts`, `convex/adminMaps.ts`.
  - Replaced `submitAction` argument validator from `v.any()` to an explicit action union validator in `convex/gameplay.ts`.
  - Remaining: schema-level replacement for `games.state` and `gameActions.events` `v.any()` fields.

- `P1 query scalability`: Addressed for the highest-impact scans.
  - Added targeted indexes in `convex/schema.ts`:
    - `games.by_visibility_status_createdAt`
    - `games.by_status_timingMode_turnDeadlineAt`
  - Replaced full-table scans with indexed queries:
    - `convex/games.ts` `listPublicGames`
    - `convex/asyncTurns.ts` `processExpiredTurns`
  - Remaining: `listMyGames` still performs per-row game doc lookups; consider denormalized listing fields or a materialized membership view for larger scale.

- `P2 invite/email reliability`: Addressed.
  - Invite code generation is now cryptographically strong and collision-safe with bounded retries:
    - `convex/inviteCodes.ts`
    - wired into `convex/lobby.ts`
  - Outbound email sends now have retry/backoff + structured logs:
    - `convex/sendEmail.ts`
  - Added tests for both paths.

## P0 - Critical game flows are under-tested outside the engine package

Why this is high risk:
- Most tests are concentrated in `risk-engine`, but orchestration layers that handle auth, persistence, and side effects have sparse/no direct tests.
- Current check status is green, but it does not protect many production-critical flows from regressions.

Evidence:
- Convex non-generated modules: 26 vs only 7 Convex test files.
- Untested high-impact modules include:
  - `convex/gameplay.ts`
  - `convex/lobby.ts`
  - `convex/games.ts`
  - `convex/asyncTurns.ts`
  - `convex/auth.ts`
  - `convex/sendEmail.ts`
  - `convex/adminMaps.ts`
  - `convex/maps.ts`
  - `convex/userSettings.ts`
- UI surface has no page-level tests:
  - `web/src/pages` has 12 page files and 0 test files.
  - Large complex page with no test safety net: `web/src/pages/game.tsx`.

Suggested fix direction:
- Add integration tests for Convex mutations/queries around lobby join/start, action submission, async turn timeout processing, and auth/email flows.
- Add page-level tests (or e2e smoke tests) for `game`, `lobby`, and auth pages.

## P1 - Type-safety boundaries are weak at persistence and API edges

Why this is high risk:
- `any`-typed payloads and frequent cast chains reduce compile-time guarantees where data enters/leaves trusted boundaries.
- This increases chance of runtime failures and makes refactors riskier.

Evidence:
- Schema stores core objects with `v.any()`:
  - `convex/schema.ts:77` (`games.state`)
  - `convex/schema.ts:107` (`gameActions.action`)
  - `convex/schema.ts:108` (`gameActions.events`)
- Action args also use `v.any()`:
  - `convex/gameplay.ts:136`
- Cast-heavy auth and interop:
  - `convex/auth.ts:25`
  - `convex/auth.ts:37`
  - `convex/auth.ts:46`
- Repeated `as unknown as` map/state conversions:
  - `convex/gameplay.ts:187`
  - `convex/asyncTurns.ts:183`
  - `convex/adminMaps.ts:289`

Suggested fix direction:
- Replace `v.any()` with explicit validators for stored state/action/event payloads (or validated serialized envelopes).
- Introduce typed adapter functions for map/state reads instead of repeated cast chains.

## P1 - Query patterns will not scale with game count

Why this is high risk:
- Multiple server paths perform full table scans or high fan-out reads; this is manageable now but creates avoidable latency/cost cliffs as usage grows.

Evidence:
- Full scans:
  - `convex/asyncTurns.ts:151` (`query("games").collect()` then filter in memory)
  - `convex/games.ts:237` (`listPublicGames` collects all games then filters)
- Per-row lookup fan-out:
  - `convex/games.ts:270` onward (`listMyGames` does `db.get` for each player doc)

Suggested fix direction:
- Add targeted indexes for status/visibility/timing/deadline query patterns.
- Replace collect-then-filter with indexed queries and cursor/limit pagination.
- Denormalize lightweight listing fields where needed to avoid N+1 patterns.

## P2 - Frontend bundle and page complexity are trending toward maintenance drag

Why this is a concern:
- Production build currently emits a large chunk warning.
- Very large page components increase regression risk and make feature work slower.

Evidence:
- `bun run check` build output warns main bundle is large (`dist/assets/index-*.js` ~622 kB).
- `web/src/pages/game.tsx` is very large (~1267 lines) and carries many responsibilities (state, controls, history playback, chat, highlight logic).
- Other large page/components include `web/src/pages/admin-map-editor.tsx` (~1039 lines) and `convex/gameplay.ts` (~1057 lines).

Suggested fix direction:
- Split `game` page into focused hooks/components by domain (actions, history playback, chat, turn timer).
- Add route- or feature-level code splitting for heavy game/admin flows.

## P2 - Invite code and side-effect reliability hardening is incomplete

Why this is a concern:
- Some operational edges are handled optimistically with minimal safeguards; low-frequency failures can be painful to debug.

Evidence:
- Invite code generation uses non-cryptographic random and no retry/uniqueness guard:
  - `convex/lobby.ts:47`
  - `convex/lobby.ts:158`
  - `convex/schema.ts:102` (`by_code` index exists but no explicit uniqueness enforcement/retry flow).
- Email sending path has limited resilience/observability:
  - `convex/sendEmail.ts` sends and returns; no retry/backoff/dead-letter instrumentation in this module.

Suggested fix direction:
- Add collision-safe invite creation (retry loop + deterministic uniqueness check).
- Add structured logging + retry policy around outbound email actions.
