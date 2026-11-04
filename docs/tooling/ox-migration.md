# Ox tooling adoption

Oxlint and Oxfmt are pinned at the workspace root. `bun run lint:ox`
checks the whole monorepo; `bun run lint` also retains the existing web
ESLint checks. ESLint remains necessary until React Hooks and React Refresh
coverage has been compared rule by rule. Oxlint warnings are initially advisory;
errors fail the check. This expands coverage without suppressing existing findings.

`bun run format` writes formatting; `bun run format:check` reports drift.
A dedicated formatting baseline now applies Oxfmt 0.76.0 and the pinned
anti-slop readable-spacing autofix to authored files. Both formatter drift and
spacing diagnostics are zero after that baseline. The configuration keeps the
single-quote/no-semicolon style. Formatting and readable-spacing enforcement
are still deliberately outside the normal `check` gate pending a separate
policy PR. Generated Convex code, vendor sources, lockfiles, and agent assets
remain excluded. See [the baseline verification and update sequence](anti-slop-policy.md#formatting-baseline).

## Anti-slop assessment

https://github.com/dmmulroy/anti-slop is MIT licensed and explicitly intended
for vendoring, rather than installing an official npm package. Its local plugin
requires `@oxlint/plugins` pinned to exactly the Oxlint version. There is no
Effect dependency in this repo, so the Effect rules do not apply.

Useful candidates are chained-assertion checks and accumulator-copy checks.
The whole preset is a larger policy decision: it rejects runtime `typeof`
narrowing, unknown parameters, conditional empty-object spreads, and symbols
containing “shape”. Boundary parsing and existing test fixtures need review
before enabling those policies. Do not enable the full preset just to adopt Oxlint.

The reviewed generic plugin is now vendored with its MIT license and provenance.
The iterative adoption records selected enforcement and explicit deferrals in
[the policy decisions](anti-slop-policy.md); the opt-in audit still reports every
generic rule. Vendor sources stay out of formatting so future updates remain
reviewable. New upstream revisions and rules require a fresh review.
