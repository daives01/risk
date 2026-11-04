# Anti-slop adoption decisions

The pinned plugin is an audit tool, not an automatic preset. Normal enforcement
covers reviewed scopes only; `bun run audit:anti-slop` continues to expose all
remaining generic-rule findings. See #17 and the inventory for the sequence.

## Dictionary contracts

`no-unsafe-dictionary-type` is enforced in `packages/risk-engine/**`, including
its tests. The engine's one finding was a map fixture declared as
`Record<string, {}>`; it now uses `GraphMap["territories"]`, the actual owner
contract. Engine findings: 1 → 0. Global findings: 14 → 13.

Backend/frontend enforcement is deliberately deferred. This is an intentional
scope decision, not a temporary suppression. The pinned rule has no option to
exempt record predicates or representations of data awaiting validation. An
unknown dictionary at a parser boundary must not become a trusted domain object
without runtime checks. No disables or equivalent aliases hide those findings.

| Remaining scope | Findings | Assessment |
| --- | ---: | --- |
| `convex/typeAdapters.ts`, `web/src/lib/map-import.ts` record guards | 2 | Legitimate `Record<string, unknown>` while checking untrusted data. Backend readers now validate every nested engine member; map imports validate fields before construction. Keep these inputs unknown. |
| `convex/historyTimeline.ts` action parameters | 2 | Historical action objects are inspected defensively. A current engine `Action` excludes redacted/legacy representations. A shared public action schema must precede narrowing. |
| `convex/gameplay.ts` RawEvent, redaction input/output, stored action cast | 4 | Persisted history and public redaction are a separate boundary. Do not assert current private engine event types onto public/redacted history. The broad stored action cast deserves a schema-backed replacement, not an annotation rename. |
| `web/src/lib/game/types.ts` action/frame events | 2 | Public replay events include redacted and historical payloads. A shared public event schema is needed before replacing the open representation. |
| `web/src/lib/game/history-timeline.ts` visibility input | 1 | Only the event discriminator is consumed; additional historical fields remain unknown. |
| `web/src/lib/game/attack-dice-result.ts` inspected candidate | 1 | Validates the discriminator, strings and rolls before display; the candidate is still untrusted during inspection. |
| `web/src/lib/game/display.ts` event formatter | 1 | Intentionally formats missing/legacy event fields with fallbacks. Preserve accepted history while introducing a public event schema. |

Follow-up before broadening this rule: define version-aware public action/event
contracts at persistence/redaction boundaries, test omitted secret card IDs and
legacy/malformed history, then derive backend/frontend replay consumers from
those contracts. Re-evaluate the parser exemptions upstream separately. Until
then these 13 findings remain visible in the opt-in audit, with no claim that
all dictionary contracts are validated.

## Known-value widening

`no-known-value-widening` remains audit-only for the entire workspace. Finite
frontend lookup tables are useful to tighten independently: card metadata and
sort ranks now satisfy `Record<CardKind, ...>` while retaining finite keys, and
an explicit runtime `CardKind` predicate validates arbitrary card-kind strings
before indexing. Unknown values still use the display fallback and stable final
sort group. Prototype-like names (`constructor`, `__proto__`, `toString`) now take
that same fallback rather than resolving inherited object properties.

Verification URL errors now select only supported codes through a domain lookup
function, retaining each supported message and the generic fallback for arbitrary
codes. The classic-map color/continent/territory tables keep inferred finite keys;
`satisfies` validates metadata without adding an open index signature to their
inferred types, and territory continent references must name a known continent.
Their dynamic grouping accumulator remains an open dictionary.

This bounded review removes six frontend findings: frontend 9 → 3, global
30 → 24 (engine 12 and backend 9 unchanged). Remaining frontend findings are
`map-editor-validation.ts`'s runtime adjacency builder,
`classic-map-layout.ts`'s grouping accumulator, and `admin-map-editor.tsx`'s
runtime adjacency editor. Their keys come from runtime data.
Backend findings include `historyTimeline.ts`'s sparse territory-entry builder
and `lobby.ts`'s runtime player record; engine reinforcement source accumulators
are similarly incremental. `gameTransition.ts`'s incremental winner object uses
the same legitimate construction pattern, although this pinned detector does
not report its Doc-derived annotation. Those annotations express the final
owned contract while fields are added under real runtime conditions. Removing them or adding equivalent aliases merely to
silence this rule would obscure that contract. No blanket enforcement, aliases,
or disables are introduced. Reconsider broader adoption only if upstream can
distinguish harmful loss of finite information from honest construction and
open runtime dictionaries; the remaining findings stay visible in the audit.

The remaining 24 diagnostics are accounted for as follows: engine reinforcement
helpers/source construction (6), fixed reinforcement fixtures (3), permission
fixtures (2), incremental winner construction (1); backend team-order/endgame
fixtures (4), sparse history patches (1), runtime team assignments (1), public
trade-action redaction (1), fixed seed anchors (1), incremental lobby player
construction (1); frontend open adjacency construction/editing (2) and continent
grouping (1). Fixed fixtures, seed anchors, and partial helper results can still
be tightened independently where that improves their owner contracts. Public
redaction needs the history-schema follow-up described above. This decision
neither declares every remaining annotation ideal nor fabricates a finite key
set for runtime dictionaries.

## Unknown inputs

`no-unknown-parameters` remains audit-only. Its pinned implementation has no
configuration options and exempts only a `cause` parameter and type-predicate
subjects. Unknown input is required at genuine parsing/error boundaries;
relabeling it as trusted data would remove the reason to validate it.

The query-selection hook now accepts the boolean it actually consumes
(`hasSession`), rather than an unknown session object. Its caller supplies
`Boolean(session)`, preserving every previous truthiness and pending-query
condition. This removes one unnecessary unknown contract: 35 → 34 findings.

| Remaining scope | Findings | Assessment |
| --- | ---: | --- |
| `convex/typeAdapters.ts` readers, structural helpers and callbacks | 19 | These functions inspect untrusted serialized engine data. They validate all nested members before returning typed GameState/GraphMap, with malformed/optional/identity tests from #21. Callback values remain unknown while being checked. |
| `web/src/lib/map-import.ts` scalar parsers | 2 | `ensureString` and `ensureInteger` must inspect unknown imported JSON fields before constructing editor data. |
| `convex/historyTimeline.ts` JSON equality inputs | 2 | Comparison accepts arbitrary field values without treating them as a domain object. No input parsing claim is made. |
| Email/join-game/game error formatters | 5 | JavaScript can throw any value; error boundaries retain unknown and narrow it before accessing Error/string details. |
| `web/src/lib/game/display.ts` historical event IDs | 3 | Missing/legacy IDs are validated as strings and receive explicit display fallbacks. A public history contract remains a separate follow-up. |
| `web/src/lib/game/adapters.ts` query adapter inputs | 3 | These currently assert local view facades. Generated-query contracts and the producer's remaining `any` fields deserve assertion cleanup; this is a genuine weakness, not proof that all unknown inputs should be banned. |

Shared parsing already exists for engine persistence and map imports; preserve
those runtime checks and their rejected-input behavior. Typed query adapters and
external response parsing remain bounded assertion-cleanup work. Broader adoption
requires a rule policy that supports actual parser/error inputs; moving a parser's
unknown parameter into a cosmetic wrapper is not an acceptable substitute.

## Unknown return contracts

`no-unknown-returns` is enforced workspace-wide at a zero baseline. The pinned
rule checks explicit unknown return annotations, including local aliases/unions
and Promise/PromiseLike wrappers; it does not prove that inferred returns or
`any` are parsed. Unknown parser inputs remain permitted under the input decision
above. Functions should expose their checked output contract, without changing
unknown inputs into trusted values simply to satisfy lint.

## Unknown aliases

`no-unknown-type-aliases` is enforced workspace-wide at a zero baseline. The
pinned rule resolves local aliases/unions that conceal the unknown top type;
unknown remains explicit at parsing/error inputs. This does not prohibit domain
objects with individual unknown fields pending validation, and does not claim
cross-module type-checker analysis or runtime validation.

## Runtime narrowing

`no-runtime-typeof` deliberately remains audit-only. Its default audit reports
61 findings. A separate trial with the supported `allowInTypeGuards: true`
option reports 50; exempting predicate bodies does not make a blanket ban fit
this repository. No normal-check option or rule enforcement is added.

Concrete counterexamples that remain in the trial:

- `risk-engine/src/rng.ts` dispatches on its documented `string | number` seed.
  A string must be hashed while a numeric seed must retain its numeric path;
  this is deterministic domain behavior, not an unparsed-input shortcut.
- `web/src/components/game/map-canvas.tsx` distinguishes a `number | string`
  CSS height and validates numeric node scale before rendering. Wrapping these
  checks in named predicates solely for lint would add ceremony without stronger
  validation. The browser-availability check is already exempt as an undefined
  existence probe and is not one of the flagged findings.
- Runtime checks in `risk-engine/src/index.test.ts` assert that branded IDs
  remain strings. They test nominal IDs' runtime representation, not function
  exports.

Other findings include map/engine persistence validation and defensive handling
of legacy replay fields. Those checks must preserve both accepted and rejected
input behavior. Boundary parsing already exists and is tested; deleting its
narrowing or asserting inputs as trusted would weaken it. The default audit
stays at 61 → 61 with all locations visible, rather than hiding findings through
predicate wrappers or disables. Reconsider only a narrower policy that can
separate missing boundary validation from valid union dispatch and runtime representation checks.

To reproduce the option trial, copy `.oxlintrc.audit.json` to a temporary config
in the repository root (so its relative plugin path stays valid), change only
`anti-slop/no-runtime-typeof` to `["warn", { "allowInTypeGuards": true }]`, and
run `bunx oxlint -c <temporary-config> --format json .`. Compare the rule's
locations with the default audit, then remove the temporary config. The trial
does not change the normal gate or the checked-in audit defaults.

## Module mocking

`no-module-mocking` is enforced workspace-wide for the pinned detector's actual
Jest/Vitest coverage. Repository findings are 0 → 0. A separate source search
for mock/jest/vi identifiers, mockModule and unstable_mockModule across authored
JS/TS found no module mocks, including no Bun `mock.module` use. There is no
module-mock cleanup or artificial dependency seam to introduce in existing suites.

The CLI was also exercised on temporary, unexecuted fixtures using the checked-in
audit config:

| Call | Module-mocking diagnostics |
| --- | ---: |
| `import { mock } from "bun:test"; mock.module("dependency", () => ({}))` | 0 |
| `import { vi } from "vitest"; vi.mock("dependency", () => ({}))` | 1 |
| `import { jest } from "@jest/globals"; jest.mock("dependency", () => ({}))` | 1 |

This rule provides **no Bun module-mocking protection**. The current absence of
Bun module mocks comes from the source audit, not this rule. Its recognition of
framework method calls is syntactic, not arbitrary alias/data-flow analysis.
Before claiming Bun coverage, add or upstream a separately reviewed detector and
verify it through the native CLI. Future use of Bun module mocks requires fresh
seam review; enabling the existing rule must not be cited as evidence that Bun
module substitution is checked. Temporary fixtures were removed after the trial.
