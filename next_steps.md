# Next Steps

## Context
Overseer tasks were reinitialized and then removed. The next work item is M1: Monorepo + engine skeleton from `plan.md`.

## M1 Checklist
- Verify Bun workspace layout (root `package.json` workspaces are correct).
- Ensure `packages/risk-engine` builds to ESM + types.
- Add basic engine types (IDs, state shape placeholders).
- Implement map validation utilities.
- Implement deterministic RNG module.
- Add sample tests and confirm `bun test` passes.
- Add a dummy consumer (or test) that imports `risk-engine` successfully.

## Commands (suggested)
- `bun install`
- `bun test`
- `bun run build` (or package-specific build, if defined)

## Notes
- `plan.md` acceptance criteria for M1:
  - `risk-engine` builds to ESM + types
  - basic types, map validation, RNG module
  - `bun test` passes sample tests
  - `risk-engine` can be imported by a dummy consumer
