# Vendored anti-slop

Source: https://github.com/dmmulroy/anti-slop/tree/13909c9e07590f5a85d93c62712259fe14a883f7/src

Pinned revision: `13909c9e07590f5a85d93c62712259fe14a883f7` (upstream package 0.1.2).
Generic index, rules, shared helpers and nested vendor sources are copied byte-for-byte;
upstream tests and Effect sources are omitted. LICENSE is upstream MIT; nested
vendor files retain their upstream attribution. package.json is local ESM metadata.

Review: generic rules use AST/scope visitors through eslintCompatPlugin; no
application imports or runtime integration. Readable spacing delegates to the
included attributed eslint-stylistic implementation. Unknown/typeof rules are
opinionated boundary policies, not proof of unsafe code. Module mocking recognizes
Jest/Vitest only. All 18 generic rules are opt-in warnings.

Update by fetching an explicit upstream SHA, reviewing changes to index, rules,
shared and vendor, copying those directories and LICENSE again (excluding tests),
and updating this provenance. Compare copied files against upstream. Review new
rules explicitly; never automatically activate them. Keep @oxlint/plugins and
oxlint pinned to the identical version (currently 1.91.0); upstream used 1.78.0,
so local CLI loading and full checks are required for compatibility verification.
Run bun run check and bun run audit:anti-slop, refresh the inventory, and verify
no vendor/generated assets appear in diagnostics. Normal checks exclude vendor.
