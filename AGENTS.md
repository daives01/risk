this is a bun monorepo for a risk game called "Legally Distinct Global Domination". a vite frontend and convex backend share the same risk-engine typescript lib.

use `bun run check` from the root to run linting, testing, typechecking, and build

## Cursor Cloud specific instructions

### Services overview

| Service | Path | Dev command | Notes |
|---------|------|-------------|-------|
| **web** (Vite + React) | `web/` | `bun run dev:web` | Runs on `http://localhost:5173` |
| **convex** (backend) | `convex/` | `bun run dev:backend` (`convex dev`) | Requires Convex cloud auth (see below) |
| **risk-engine** | `packages/risk-engine/` | library, no server | Shared game logic |
| **risk-maps** | `packages/maps/` | library, no server | Map graph definitions |

### Key commands (all from workspace root)

- **Full check:** `bun run check` (typecheck, lint, test, build)
- **Tests only:** `bun test` (383 Bun tests across all packages)
- **Lint only:** `bun run lint` (ESLint on `web/`)
- **Typecheck only:** `bun run typecheck`
- **Build only:** `bun run build` (builds risk-engine then web)
- **Frontend dev:** `bun run dev:web`
- **Both frontend + backend:** `bun run dev` (requires Convex auth)

### Convex backend

`convex dev` requires authentication with the Convex cloud platform. It will prompt for login on first run. Without it, the Vite frontend starts but auth/data flows won't work. All 383 unit tests run independently of the Convex backend.

### No Docker, no external databases

The project uses Convex as both database and backend runtime. No Docker, PostgreSQL, Redis, or other infrastructure is needed locally.
