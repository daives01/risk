# Ox tooling adoption

Oxlint and Oxfmt are pinned at the workspace root. `bun run lint:ox`
checks the whole monorepo; `bun run lint` also retains the existing web
ESLint checks. ESLint remains necessary until React Hooks and React Refresh
coverage has been compared rule by rule. Oxlint warnings are initially advisory;
errors fail the check. This expands coverage without suppressing existing findings.

`bun run format` writes formatting; `bun run format:check` reports drift.
Formatting is intentionally not yet part of `check`: the default-config dry run
reported 175 files needing changes. The configuration keeps the existing common
single-quote/no-semicolon style. Land a dedicated formatting baseline before
making formatting a required gate. Generated Convex code and agent assets are excluded.

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

Recommended follow-up: vendor a reviewed upstream commit with its MIT license
and provenance, select rules explicitly, measure diagnostics, and fix violations
before making those rules errors. Keep upstream source out of formatting to
make future updates reviewable. This PR does not vendor or enable anti-slop.
