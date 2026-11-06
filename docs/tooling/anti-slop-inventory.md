# Anti-slop final audit inventory

Issue #17 final policy, after the iterative cleanup sequence through #58. The
pinned generic plugin has 18 rules; all are accounted for below, plus the built-in
accumulator rule. Normal policy is explicit in `.oxlintrc.json`; the opt-in audit
reports every generic rule without turning deferred preferences into enforcement.

Run `bun run check`, `bun run format:check`, and
`bun run audit:anti-slop > /tmp/risk-audit.json` from the root. Final verification:
634 tests pass, normal lint/typecheck/build and formatting pass, and all selected
error rules have zero findings. No vendor/generated/agent asset diagnostics.
Warnings below are explained deferrals, not a suppression baseline. The sole
remaining scoped policy is permanent engine dictionary enforcement; no temporary
assertion override remains. See [policy evidence](anti-slop-policy.md) and
[issue #17](https://github.com/daives01/risk/issues/17) for the merged PR sequence.

| Rule                                                  | Final findings | Normal policy                       | Decision / coverage                                                                                                                                                                              |
| ----------------------------------------------------- | -------------: | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `anti-slop/no-array-filter-map`                       |              0 | Error globally                      | Reviewed and cleaned; enforced in normal checks.                                                                                                                                                 |
| `anti-slop/no-reduce-accumulator-copy`                |              0 | Error globally                      | Reviewed and cleaned; enforced in normal checks.                                                                                                                                                 |
| `anti-slop/no-chained-type-assertions`                |              0 | Error globally                      | Reviewed and cleaned; enforced in normal checks.                                                                                                                                                 |
| `anti-slop/no-conditional-empty-object-spread`        |              0 | Error globally                      | Reviewed and cleaned; enforced in normal checks.                                                                                                                                                 |
| `anti-slop/no-known-value-widening`                   |             24 | Explicitly deferred                 | Deferred: incremental sparse patches/winner builders and runtime-keyed dictionaries need owner contracts. Improve only when actual domain evidence supports it.                                  |
| `anti-slop/no-module-mocking`                         |              0 | Error globally                      | Error globally; pinned detector covers Jest/Vitest only. Separate source audit found no Bun mocks; this does not enforce Bun mock.module.                                                        |
| `anti-slop/no-object-parameters`                      |              0 | Error globally                      | Reviewed and cleaned; enforced in normal checks.                                                                                                                                                 |
| `anti-slop/no-reflect-apply`                          |              0 | Error globally                      | Reviewed and cleaned; enforced in normal checks.                                                                                                                                                 |
| `anti-slop/no-reflect-get`                            |              0 | Error globally                      | Reviewed and cleaned; enforced in normal checks.                                                                                                                                                 |
| `anti-slop/no-runtime-typeof`                         |             80 | Explicitly deferred                 | Deferred: real boundary validation, RNG string/number dispatch and CSS unions. Deleting narrowing would weaken contracts; type-guard option alone is insufficient.                               |
| `anti-slop/no-unsafe-dictionary-type`                 |              7 | Engine error; other scopes deferred | Engine error; backend/frontend deferred: checked parser records and open historical actions/events legitimately contain unknown fields. Schema evolution requires separate compatibility review. |
| `anti-slop/no-shape-in-symbol-names`                  |              0 | Explicitly deferred                 | Not adopted: fixed substring vocabulary conflicts with geometry terminology; no configurable vocabulary. Audit remains available.                                                                |
| `anti-slop/no-unknown-parameters`                     |             45 | Explicitly deferred                 | Deferred: parsers, external data and caught errors intentionally start unknown. Preserve runtime validation; reconsider only with adequate rule exemptions.                                      |
| `anti-slop/no-unknown-returns`                        |              0 | Error globally                      | Reviewed and cleaned; enforced in normal checks.                                                                                                                                                 |
| `anti-slop/no-unknown-type-aliases`                   |              0 | Error globally                      | Reviewed and cleaned; enforced in normal checks.                                                                                                                                                 |
| `anti-slop/no-widen-then-assert`                      |              0 | Error globally                      | Reviewed and cleaned; enforced in normal checks.                                                                                                                                                 |
| `anti-slop/require-readable-spacing`                  |              0 | Error globally                      | Error globally; dedicated baseline and cooperating Oxfmt/isolated spacing-fix workflow merged.                                                                                                   |
| `anti-slop/require-safety-comment-for-type-assertion` |              0 | Error globally                      | Error globally after cleanup; concrete invariants required. Temporary engine-only assertion override removed.                                                                                    |
| `oxc/no-accumulating-spread`                          |              0 | Error globally                      | Reviewed and cleaned; enforced in normal checks.                                                                                                                                                 |

## Deferred findings and follow-up boundaries

The seven dictionary findings are parser records (`typeAdapters`, `map-import`),
open historical payloads (`historyPayloads`, backend/frontend timeline), and the
display formatter. They describe untrusted/open fields honestly. Widening's 24
findings include sparse/incremental owner constructions; runtime typeof's 80 and
unknown parameters' 45 include the validation added during this work. Counts can
change with real boundary improvements; do not remove evidence to reduce counts.
The naming detector reports zero but remains intentionally unadopted. Effect
rules remain excluded because the repository does not directly use Effect.

## Upgrade procedure

1. Choose an explicit upstream SHA and review generic index, rules, shared helpers,
   nested vendor attribution and licenses; compare copied files byte-for-byte.
2. Retain MIT LICENSE and nested eslint-stylistic attribution. Update provenance
   in `vendor/anti-slop/README.md`; keep application imports out of vendored code.
3. Pin `oxlint` and `@oxlint/plugins` to exactly the same version (both currently
   `1.91.0`), update `bun.lock`, and verify with frozen-lockfile installation.
   Oxfmt is separately pinned to `0.76.0`.
4. Review every new/changed rule and scope explicitly. New upstream rules must
   enter an audit/fit review; never automatically activate a preset or Effect rules.
5. Verify CLI plugin loading, targeted detector probes and behavior, root check,
   formatting and full audit. Refresh this table and decision evidence; confirm
   vendor/generated/agent exclusions and React lint coverage remain intact.

The pinned source remains `13909c9e07590f5a85d93c62712259fe14a883f7`.
Zero matches prove only the pinned detectors found none; module-mocking coverage
is especially limited as stated above. Deferred-rule adoption or schema changes
need a separate reviewed follow-up rather than being implied by issue closure.

## Initial audit retained for comparison

Historical step-1 baseline, before policy adoption. At that stage no new rules ran in `check`. Run `bun run audit:anti-slop > audit.json` from the root; JSON diagnostics retain every location. Warnings are advisory; plugin/configuration errors fail. Counts below include application, engine, backend, tests and scripts, excluding generated, agent, dist and vendor assets. Counts are a snapshot, not a suppression baseline.

| Rule                                                  | Count | Representative location                         | Fit / next review                                                                              |
| ----------------------------------------------------- | ----: | ----------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `anti-slop/no-array-filter-map`                       |     1 | web/src/lib/game/chat-mentions.ts:117           | Preserve callback order and indexes; defer to step 2.                                          |
| `anti-slop/no-reduce-accumulator-copy`                |     0 | —                                               | Review immutable reducer contracts in step 2.                                                  |
| `anti-slop/no-chained-type-assertions`                |    11 | convex/historyTimeline.test.ts:34               | Typed fixture builders preferred; step 3.                                                      |
| `anti-slop/no-conditional-empty-object-spread`        |    54 | convex/slackAdmin.ts:65                         | Convex omitted fields can be intentional; preserve serialization in step 5.                    |
| `anti-slop/no-known-value-widening`                   |    28 | convex/gameplay.team-endgame.test.ts:52         | Review finite literals versus intentional widening; step 6.                                    |
| `anti-slop/no-module-mocking`                         |     0 | —                                               | Only Jest/Vitest detection; Bun mock.module is not covered. Step 9 needs a separate Bun audit. |
| `anti-slop/no-object-parameters`                      |     0 | —                                               | Broad object contracts need boundary-specific review; step 6.                                  |
| `anti-slop/no-reflect-apply`                          |     0 | —                                               | Preserve receiver binding; step 4.                                                             |
| `anti-slop/no-reflect-get`                            |     0 | —                                               | Validate dynamic property boundaries; step 4.                                                  |
| `anti-slop/no-runtime-typeof`                         |    58 | web/src/pages/game/hooks/use-game-history.ts:92 | Legitimate external-input narrowing; defer until parsing work in step 8.                       |
| `anti-slop/no-unsafe-dictionary-type`                 |    14 | convex/gameplay.ts:212                          | Open dictionaries can be legitimate; validate lookup contracts in step 6.                      |
| `anti-slop/no-shape-in-symbol-names`                  |     0 | —                                               | Domain terminology may be legitimate; assess names individually in step 10.                    |
| `anti-slop/no-unknown-parameters`                     |    19 | convex/sendEmail.ts:16                          | Unknown input is legitimate at trust boundaries; step 7.                                       |
| `anti-slop/no-unknown-returns`                        |     0 | —                                               | Unknown output requires boundary review; step 7.                                               |
| `anti-slop/no-unknown-type-aliases`                   |     0 | —                                               | Unknown aliases can model external data; step 7.                                               |
| `anti-slop/no-widen-then-assert`                      |     0 | —                                               | Review inferred values and fixtures individually; step 3.                                      |
| `anti-slop/require-readable-spacing`                  |  2347 | scripts/seed-maps.ts:30                         | Large style footprint; compare Oxfmt before step 10 adoption.                                  |
| `anti-slop/require-safety-comment-for-type-assertion` |   519 | convex/sendEmail.ts:92                          | Require concrete invariants only after assertion cleanup; step 11.                             |
| `oxc/no-accumulating-spread`                          |     0 | —                                               | Review copying cost and immutability contracts; step 2.                                        |

These were initial fit assessments, not policy decisions. Review every diagnostic in each later bounded PR, including zero-count rules with detection gaps. Effect rules are excluded because the repo does not directly use Effect.

Representative review: chat-mentions.ts maps team IDs then filters absent IDs;
this is legitimate eager processing whose callback semantics must survive step 2.
slackAdmin.ts conditionally patches teamName/defaultChannelId/status: omission
preserves existing stored fields, so replacing omission with undefined is unsafe.
use-game-history.ts checks historical event fields at runtime and supplies display
fallbacks; these are legitimate defensive checks, not evidence to delete narrowing.

Initial verification: root `bun run check` passed. Audit exits 0 with all 18 generic rules
configured, plus the built-in accumulator rule; no vendor/generated/agent diagnostics.
Zero counts mean no matches under the pinned syntactic detectors, not proof of coverage.
