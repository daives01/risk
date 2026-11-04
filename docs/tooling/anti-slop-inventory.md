# Anti-slop audit inventory

Step 1 of #17 only. No new rules run in `check`. Run `bun run audit:anti-slop > audit.json` from the root; JSON diagnostics retain every location. Warnings are advisory; plugin/configuration errors fail. Counts below include application, engine, backend, tests and scripts, excluding generated, agent, dist and vendor assets. Counts are a snapshot, not a suppression baseline.

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

These are fit assessments, not approval to refactor or enforce. Review every diagnostic in each later bounded PR, including zero-count rules with detection gaps. Effect rules are excluded because the repo does not directly use Effect.

Representative review: chat-mentions.ts maps team IDs then filters absent IDs;
this is legitimate eager processing whose callback semantics must survive step 2.
slackAdmin.ts conditionally patches teamName/defaultChannelId/status: omission
preserves existing stored fields, so replacing omission with undefined is unsafe.
use-game-history.ts checks historical event fields at runtime and supplies display
fallbacks; these are legitimate defensive checks, not evidence to delete narrowing.

Verification: root `bun run check` passes. Audit exits 0 with all 18 generic rules
configured, plus the built-in accumulator rule; no vendor/generated/agent diagnostics.
Zero counts mean no matches under the pinned syntactic detectors, not proof of coverage.
