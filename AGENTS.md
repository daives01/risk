this is a bun monorepo for a risk game called "Legally Distinct Global Domination". a vite frontend and convex backend share the same risk-engine typescript lib.

use `bun run check` from the root to run linting, testing, typechecking, and build

## Agent skills

### Issue tracker

Issues for this repo are tracked in GitHub Issues via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

This repo uses the default triage label vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, and `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

This repo is configured as single-context: skills should look for a root `CONTEXT.md` and `docs/adr/`. See `docs/agents/domain.md`.
