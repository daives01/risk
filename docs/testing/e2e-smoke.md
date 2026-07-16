# End-to-end Smoke Harness

The Smoke Harness uses Playwright to exercise representative individual and team Games through the real browser, authentication, Vite frontend, and Convex dev deployment.

## Prerequisites

- The target Convex deployment contains at least one published map supporting two and four players.
- Four reusable, email-verified Smoke Users exist. Do not use personal accounts.
- `SMOKE_ORIGIN` is an origin trusted by Better Auth. For the shared dev deployment this should normally be the same canonical Tailscale origin configured as `SITE_URL`.
- Chromium is installed once with `bunx playwright install chromium`.

Set these variables without committing their values:

```sh
export SMOKE_ORIGIN=http://100.x.y.z:5173
export SMOKE_USER_ALPHA=smoke-alpha
export SMOKE_USER_BRAVO=smoke-bravo
export SMOKE_USER_CHARLIE=smoke-charlie
export SMOKE_USER_DELTA=smoke-delta
export SMOKE_USER_PASSWORD='shared smoke-user password'
```

The identifiers may be usernames or email addresses. All four Smoke Users currently share one password so credential rotation stays simple.

## Run locally

```sh
bun run test:e2e
```

The Bun scripts load the gitignored `.env.local` automatically. Explicit shell
or CI environment variables take precedence over values in that file.

Playwright starts the Vite frontend and connects it to the Convex deployment configured in `.env.local`. If the frontend is already running at `SMOKE_ORIGIN`, Playwright reuses it.

To target an already-running hosted frontend:

```sh
SMOKE_SKIP_WEB_SERVER=1 bun run test:e2e
```

For interactive debugging:

```sh
bun run test:e2e:ui
```

The harness creates uniquely named Games and finishes them through Resignation. Because the initial target is the shared dev deployment, tests run serially and do not delete unrelated data.

## Coverage

The individual journey verifies Game creation, invite joining, start, reinforcement placement, a complete turn, Resignation endgame, realtime observation, and Replay Mode.

The team journey verifies four-player creation, balanced team assignment, delegated reinforcement placement, a complete delegated turn, team Resignations, and team victory.

Compatibility tests in `convex/gameTransition.compatibility.test.ts` separately load pre-refactor persisted individual, team, and async Games, apply the next Game Transition, and read the resulting Replay Timeline through the public history query. These run as part of `bun run check`.

## Smoke Artifacts

Failures retain a Playwright trace, screenshot, video, and step log under `test-results/`. The HTML report is written to `playwright-report/`. Both directories and authenticated browser state are ignored by Git.

## CI progression

Do not make a shared dev deployment a required CI dependency. Provision an isolated Convex preview deployment and dedicated credentials first, then provide the same environment variables to the CI job and run `bun run test:e2e` after `bun run check`.
