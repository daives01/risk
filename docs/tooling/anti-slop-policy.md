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

| Remaining scope                                                           | Findings | Assessment                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------- | -------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `convex/typeAdapters.ts`, `web/src/lib/map-import.ts` record guards       |        2 | Legitimate `Record<string, unknown>` while checking untrusted data. Backend readers now validate every nested engine member; map imports validate fields before construction. Keep these inputs unknown.                                    |
| `convex/historyTimeline.ts` action parameters                             |        2 | Historical action objects are inspected defensively. A current engine `Action` excludes redacted/legacy representations. A shared public action schema must precede narrowing.                                                              |
| `convex/gameplay.ts` RawEvent, redaction input/output, stored action cast |        4 | Persisted history and public redaction are a separate boundary. Do not assert current private engine event types onto public/redacted history. The broad stored action cast deserves a schema-backed replacement, not an annotation rename. |
| `web/src/lib/game/types.ts` action/frame events                           |        2 | Public replay events include redacted and historical payloads. A shared public event schema is needed before replacing the open representation.                                                                                             |
| `web/src/lib/game/history-timeline.ts` visibility input                   |        1 | Only the event discriminator is consumed; additional historical fields remain unknown.                                                                                                                                                      |
| `web/src/lib/game/attack-dice-result.ts` inspected candidate              |        1 | Validates the discriminator, strings and rolls before display; the candidate is still untrusted during inspection.                                                                                                                          |
| `web/src/lib/game/display.ts` event formatter                             |        1 | Intentionally formats missing/legacy event fields with fallbacks. Preserve accepted history while introducing a public event schema.                                                                                                        |

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

| Remaining scope                                                    | Findings | Assessment                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------ | -------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `convex/typeAdapters.ts` readers, structural helpers and callbacks |       19 | These functions inspect untrusted serialized engine data. They validate all nested members before returning typed GameState/GraphMap, with malformed/optional/identity tests from #21. Callback values remain unknown while being checked. |
| `web/src/lib/map-import.ts` scalar parsers                         |        2 | `ensureString` and `ensureInteger` must inspect unknown imported JSON fields before constructing editor data.                                                                                                                              |
| `convex/historyTimeline.ts` JSON equality inputs                   |        2 | Comparison accepts arbitrary field values without treating them as a domain object. No input parsing claim is made.                                                                                                                        |
| Email/join-game/game error formatters                              |        5 | JavaScript can throw any value; error boundaries retain unknown and narrow it before accessing Error/string details.                                                                                                                       |
| `web/src/lib/game/display.ts` historical event IDs                 |        3 | Missing/legacy IDs are validated as strings and receive explicit display fallbacks. A public history contract remains a separate follow-up.                                                                                                |
| `web/src/lib/game/adapters.ts` query adapter inputs                |        3 | These currently assert local view facades. Generated-query contracts and the producer's remaining `any` fields deserve assertion cleanup; this is a genuine weakness, not proof that all unknown inputs should be banned.                  |

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

| Call                                                                        | Module-mocking diagnostics |
| --------------------------------------------------------------------------- | -------------------------: |
| `import { mock } from "bun:test"; mock.module("dependency", () => ({}))`    |                          0 |
| `import { vi } from "vitest"; vi.mock("dependency", () => ({}))`            |                          1 |
| `import { jest } from "@jest/globals"; jest.mock("dependency", () => ({}))` |                          1 |

This rule provides **no Bun module-mocking protection**. The current absence of
Bun module mocks comes from the source audit, not this rule. Its recognition of
framework method calls is syntactic, not arbitrary alias/data-flow analysis.
Before claiming Bun coverage, add or upstream a separately reviewed detector and
verify it through the native CLI. Future use of Bun module mocks requires fresh
seam review; enabling the existing rule must not be cited as evidence that Bun
module substitution is checked. Temporary fixtures were removed after the trial.

## Formatting baseline

This dedicated baseline changes presentation only. It runs Oxfmt 0.76.0 on
existing authored-file scope, then autofixes only `require-readable-spacing`
from vendored anti-slop revision `13909c9e07590f5a85d93c62712259fe14a883f7`, then
runs Oxfmt again. The isolated temporary Oxlint config disables the default
correctness category, includes only that one warning rule and the pinned local
plugin, and repeats the normal vendor/generated/agent/dist exclusions. The
temporary config is removed afterward. No other rule's autofix runs, no new
normal rule severity is enabled, and `check` still has no formatter gate.

The starting audit reported 2,449 spacing findings across 161 files. After this
sequence, spacing diagnostics and `bun run format:check` drift are both zero;
a further formatting pass leaves files unchanged. Other generic-rule counts
remain unchanged: assertion evidence 491, runtime typeof 61, unknown parameters
34, known-value widening 24, and unsafe dictionaries 13.

Verification compares changed authored JS/TS source to the preceding commit.
Transpiled JavaScript ASTs retain operators, literal decoded values, declaration
kinds, optional-chain boundaries, computed property distinctions and tagged
template raw content. The comparison ignores positions/comments, quote form,
transparent parentheses and quoted noncomputed property-name spelling. A second
source AST comparison checks type-bearing structure, normalizing JSX text
representation only where the transpiled AST already proves identical output.
Oxfmt's one added empty statement in the home keyboard Escape handler is an ASI
guard; only empty entries in statement lists are ignored, never a loop/body
slot. JSON/JSONC configuration values are also compared, including reordered
package metadata, so the baseline introduces no configuration policy change.

JSX whitespace needs special care: Oxfmt initially split or merged adjacent
text children in four pages. Eight text runs in admin map preview, admin Slack,
create game and lobby now use explicit string expressions to preserve their
original compiled child strings and topology. These are deliberate
representation-only edits, not a claim that every source difference is a blank
line. Other JSX source whitespace changes compile identically. HTML/CSS changes
are formatter line wrapping and equivalent quoting; the production CSS asset
retains the same content hash (`index-B_u4n8YS.css`). Documentation changes
include this record and the updated tooling baseline status. Static comparison
and the full suite do not substitute for a browser visual regression test.

After this baseline merges, enable readable-spacing in a separate policy PR,
verifying compatibility again. A formatter gate can be considered independently;
this baseline leaves the normal check sequence unchanged. Regeneration must
use the pinned tools and isolated one-rule autofix; never run the entire audit's
autofixes to update the baseline.

## Readable-spacing enforcement

After the dedicated baseline, `require-readable-spacing` is enforced as an
error workspace-wide at zero findings. `bun run check` reaches it through the
normal Oxlint lint command. No formatter-drift gate is added.

`bun run format` now runs Oxfmt, the isolated `format:spacing` autofix, Oxfmt
again, and a final spacing-only check with warnings denied. This makes the
published command cooperate with the readability policy and fail visibly if
reflow leaves unresolved findings. `format:check` still checks Oxfmt drift;
the normal lint gate separately checks readable spacing.

`.oxlintrc.spacing.json` disables the default correctness category and enables
only this one warning rule from the pinned generic plugin. It does not extend
the normal/audit rule presets, so formatting cannot autofix unrelated candidate
policies. Its vendor/generated/agent/dist exclusions match the normal audit
scope. Keep exclusions synchronized across the normal, audit and spacing-only
configs when scope changes. Upstream rule or formatter upgrades require fresh
convergence and semantic review; newly added upstream rules remain opt-in.

## Naming policy

`no-shape-in-symbol-names` is deliberately not adopted; it remains visible in
the audit at 0 → 0 findings. The pinned rule bans a case-insensitive `shape`
substring in local identifier/private/JSX names, while exempting statically
borrowed member names. It has no domain vocabulary option.

Separate unexecuted CLI fixtures confirm that `territoryShape` and
`reshapeTerritory` each produce a diagnostic, while `geometry.shape` as a
borrowed member produces none. These are trial examples, not current repository
findings. A map renderer can legitimately name geometry or a geometry operation
with those words; the substring alone does not establish a weak abstraction.

Keep the owner/domain language in `CONTEXT.md` and review names for their actual
role. There is no current symbol to rename, and introducing mechanical aliases
or banning valid geometry vocabulary would add no evidence. No disable or
customized vendor implementation hides the rule. Reconsider only a policy that
distinguishes vague catch-all names from meaningful geometric terminology.

## Assertion evidence: engine production

Step 11 begins with production engine code only. Its assertion-comment findings
are 11 → 0; global findings are 491 → 480. The rule remains audit-only while
engine test fixtures, map assets, backend and frontend assertions are reviewed
in separate bounded changes. No normal severity or scope override is added.

Two legal-action trade-set casts were redundant because `findValidTradeSets`
already returns branded card arrays. The resignation empty hand now uses the
owning `GameState["hands"]` contract. Reinforcement counting stores territory
keys as strings because its only consumers are counting and string-set
membership; it no longer fabricates a brand that those consumers do not need.

Three non-const assertions remain in the touched production files, each with a
specific invariant. A private legal-action helper brands only existing own keys
from the same state's territory dictionary and preserves `Object.keys` order;
it is not a public trust-string API or a claim of validation of external data.
The two deck-creation casts brand generated IDs registered under their exact
keys in `cardsById`: non-negative territory indices use `card_<number>`, and
unique wild indices use the disjoint `card_w<number>` namespace.

Map symmetry validation now compares an existing reverse-neighbor string with
the candidate key directly. An invalid adjacency key can still participate in
a symmetry check; it must not be branded on a false claim that membership was
already established. Regression coverage checks exact unknown-key/asymmetry
errors and confirms that a reverse edge does not erase invalid membership
errors. Existing deterministic engine, action-order, card and resignation
suites continue to pass; no gameplay rule or external contract is changed.

## Assertion evidence: engine test fixtures

Engine test assertion-comment findings are 233 → 0; the entire engine scope is
now zero, and global findings are 480 → 247. The existing engine override now
enforces `require-safety-comment-for-type-assertion` as an error. Maps, backend
and frontend remain visible in the audit. When those scopes reach zero, move
this rule to the global rules and remove its engine-scoped key.

Private `src/testing/fixtures.ts` constructors label synthetic strings with the
five nominal ID categories. Each of their five assertions documents precisely
that test-only purpose; they neither validate external input nor establish
membership in a state/map. They are excluded from the production build and are
not exported from the package index. The three documented production assertions
from the preceding change remain unchanged.

Event expectations now check the discriminator of the exact supplied event,
including undefined. Indexed checks retain their original index, and existing
searches retain their predicates. A negative test covers missing and wrong-kind
events. Action fixtures use actual discriminant narrowing; empty decks use the
owning DeckState contract, and malformed visual fixtures are constructed without
casting away readonly contracts. Redundant string assertions are removed without
runtime coercion. Four pre-existing nominal matcher errors now use synthetic
CardId expected values, preserving the exact strings being compared.

`typecheck:engine-tests` is part of root typecheck and checks every engine test
and its private support with strict TypeScript and no emit. Previously the
production project excluded tests. The full root check passes, including 557
tests and production builds; formatting and the fresh audit pass as well. No
unchecked event assertions, action any casts, or undocumented engine assertions
remain.

## Assertion evidence: authored map

The authored classic map's two private nominal helpers now document their
actual inputs: literals maintained inside that map module. Neither helper is
exported or parses external strings. Existing validation checks adjacency and
continent territory references; an added integrity test also checks that each
territory's declared continent exists and includes it. These are concrete data
invariants, not a generic trust-string API. The map data and helper behavior are
unchanged. Map assertion-comment findings are 2 → 0; global findings are
247 → 245. Maps remain audit-only until global assertion enforcement follows the
remaining backend/frontend cleanup; no temporary map override is added.

## Current Game public-state boundary prerequisite

Current Game views now return a checked `TimelinePublicState`, whose turn phase
uses the engine `Phase` owner type. Public player statuses remain arbitrary
strings, as do public IDs and visible hand card kinds. Database helpers use the
generated query/mutation database contexts. Removing the redundant player
projection and hand string assertions reduces assertion-comment findings from
245 to 242 globally (backend 138 to 135; frontend remains 107; engine/maps zero).
No safety-rule severity changes are included.

The public reader checks every required field, nested dictionary value and array
element, plus optional pending occupation and reinforcement fields. It preserves
the original object, extras, and absent versus own-undefined optional fields.
Number validation remains `typeof number`, without new range, finiteness,
consistency or ID-membership restrictions. The parser adds three
`no-unknown-parameters` findings (34 to 37 globally) and one `no-runtime-typeof`
finding (61 to 62); `no-known-value-widening` remains 24 and
`no-unsafe-dictionary-type` remains 13. These boundary diagnostics remain visible
in the audit rather than being hidden by assertions.

Both views parse private state first and select public cache before private
projection using the existing nullish preference. Missing/null cache falls back;
missing state returns null; Lobby views bypass parsing. Compatibility deliberately
tightens for malformed non-null public caches: they throw `Invalid public game
state` instead of being served unchecked or silently repaired. Invalid private
state still throws first even with a valid cache.

Current and snapshot writers continue to use `publicGameStateProjection`, which
omits the standard root hands, RNG, deck order and card catalog fields and emits
card counts. The reader is structural validation, not sanitization: arbitrary
extra fields, including secret-looking extras in a corrupted cache, are
preserved. This change does not claim that malicious cache extras are redacted.
Historical event/action/snapshot/patch unchecked boundaries remain separate and
deferred; they are not private GameState contracts.

Coverage includes public parser identity/immutability, legacy statuses, all six
phases, unknown IDs, optional presence, empty dictionaries, zero/false, malformed
nested data and sparse arrays, shared cache selection and private-first errors,
projection redaction/counts, and an actual convex-test spectator query including
Lobby bypass. Authenticated view hand/team/delegation logic is unchanged and uses
the same checked selection helper. BetterAuth's component test helper requires
`import.meta.glob`, unsupported by Bun, so this change adds no authenticated
component query test or module mocks. Existing individual/team/async persisted
transition fixtures continue to pass. A single historical timeline fixture now
uses its `TimelinePublicState` owner annotation to retain its literal phase.
The full root check passes: 563 tests, typechecking, lint and production builds;
formatting and the fresh audit also pass.

## Assertion evidence: auth email contracts

Auth's four assertions and the email action's one environment assertion are
removed. Assertion-comment findings are 242 → 237 globally (backend 135 → 130;
frontend 107; engine/maps zero). Both touched modules and the new auth email
handler/test modules have zero assertion findings. The rule remains audit-only
outside the existing engine override; no global enforcement is added. Other
audit counts remain unchanged: runtime typeof 62, unknown parameters 37,
known-value widening 24 and unsafe dictionaries 13.

The installed BetterAuth SDK accepts the real generated component API and
exposes a query/mutation/action context union. Auth construction still accepts
all three contexts: only action contexts supply the selected email capability,
and absence rejects lazily when an email callback runs. Ordinary authenticated
reads do not fail during auth construction. The handler invokes the generated
internal email action reference through the original sender method receiver,
awaits its null result, and preserves action rejection. The stale offline-stub
comment and raw action-name strings are removed. Both environment reads retain
`globalThis.process?.env ?? {}` and the missing-process fallback.

Password reset handling retains URL parsing, the last pathname segment, the
primary web origin, and conditional token query insertion, including existing
percent-encoding and trailing-slash behavior. Verification retains the supplied
URL. Recipients, subjects, HTML builders, origin selection, plugins, credentials
and delivery retries are unchanged. A context without email capability now gets
an explicit error on email invocation; malformed reset URLs still fail first.

Three Bun-safe tests exercise the real auth-owned handlers with a typed selected
action sink: lazy capability failure, generated action identity, exact payloads,
receiver preservation, encoded/missing reset tokens, malformed URLs, deferred
action completion and original rejection propagation. They send no messages and
use no module mocks or fabricated whole Convex contexts. Auth callback wiring
and the query/mutation construction path were inspected directly; BetterAuth's
component helper still requires Bun-unsupported `import.meta.glob`, so this does
not claim an authenticated component integration test. Full root check passes
with 566 tests, typechecking, lint and builds; formatting, audit and diff checks
also pass.

### Reinforcement input contract prerequisite

`calculateReinforcements` accepts the `players`, `territories`, and `turnOrder`
fields it actually reads. Its private team-recipient helper requires only players
and territories. Full `GameState` callers remain compatible; a lobby can supply
real reinforcement inputs without fabricating unrelated RNG, deck, or hand state.
No calculation or tie-breaking logic changes. A minimal-input test covers the
stored turn-order fallback, explicit override, team bonus recipient, and input
immutability. Backend caller cleanup follows separately.

Root checks (567 tests), formatting verification, and the full audit pass.
Assertion findings remain 237 (engine zero); no policy scope changes here.

### Lobby construction and validator contracts

Lobby assertion findings fell from 18 to zero (global 237 to 219). Ruleset,
timing, and team-name values already carry their contracts from Convex argument
and storage validators; redundant assertions are removed. Slack workspace
lookups use the selected database capability and inferred index callbacks.
The reinforcement call supplies real players, territories, and turn order under
the narrowed engine contract instead of fabricating a complete `GameState`.

Three nominal engine ID conversions retain concrete evidence: territory keys
come from the checked graph defining this game's territory namespace; indexed
player strings establish unique engine seats; team assignments are checked
against the generated team set before construction. The notification action's
explicit `any` export annotation is removed so the generated internal reference
retains its actual argument/return contract. Its implementation is unchanged;
remaining notification-body assertions are tracked separately.

Root checks (567 tests), formatting verification, and audit pass. Other audit
counts remain unchanged. No new enforcement scope or runtime validation is added.

### Notification orchestration contracts

Notification cleanup reduces global assertion findings from 219 to 208. Internal
queries/actions use their generated references; the Slack action export, context
result, and parallel channel result tuple retain inferred types instead of `any`.
Timing values already satisfy the storage validator contract. Runtime environment
access uses the installed platform types directly.

Two narrow email assertions remain with evidence: both Better Auth adapter
lookups select the user model, whose installed schema requires a string email.
The SDK's `findOne` return is `any`, so inference alone cannot prove that field;
the assertions describe only the consumed optional email and nullable row. This
is a trusted component model contract, not validation of arbitrary JSON.

Root checks (567 tests), formatting verification and full audit pass. No delivery,
retry, recipient, URL, catch, or concurrency behavior changes. Slack HTTP response
parsing and timeout player-ID assertions remain separate tracked boundaries.
Other audit counts and enforcement scopes are unchanged.

### Slack HTTP response and admin-action boundaries

Slack auth.test and chat.postMessage response bodies now pass checked readers
instead of unchecked assertions. Readers require a boolean `ok` and validate
only consumed optional string fields (`error`, `team`, `team_id`, `ts`). They
preserve identity, extra fields, absent versus explicit undefined properties,
and empty strings; they impose no timestamp formatting or workspace membership
claim. Malformed envelopes or consumed fields now throw an explicit response
error rather than flowing into delivery or credential decisions.

Auth JSON decoding still precedes the HTTP check, and HTTP errors retain priority
over shape validation. The existing chat HTTP 429 branch precedes decoding;
retry/error classification and valid-response behavior are unchanged. Tests cover
success/failure envelopes, malformed primitive/array/null bodies and fields,
optional presence, identity, extras, and immutability without network requests.
Admin actions use the real action context and generated admin-query reference;
environment casts are removed without changing authorization or token handling.

Root checks (571 tests), formatting verification, and full audit pass. Assertion
findings fall 208 to 202. Honest boundary checks raise deferred runtime-typeof
findings 62 to 68 and unknown-parameter findings 37 to 39. Other counts and
policy enforcement scopes are unchanged.

### Current transition event ownership and timeout inputs

Current transition History Frame events retain the engine's `GameEvent` union:
all producers are `applyAction` results, including timeout and reinforcement
batch accumulation. Winner and elimination selection now discriminate that union
instead of widening to unknown and recovering it through assertions. The stored
first-timeout marker has its own local `TurnTimedOut` variant; it remains excluded
from returned engine events as before. No persisted or redacted historical input
is relabeled as an engine event.

Schema-proven timing/ruleset and generated scheduler-reference casts are removed.
Remaining nominal territory assertions explain their actual boundaries: owned
checked-state keys selected by a bounded RNG, or wire strings whose existence and
placement legality the engine checks. The timeout mutation uses the actual context
and one nominal player conversion; current-player/staleness checks precede engine
actions. Two new tests verify unknown wire territory and mismatched scheduled
player rejection without History Frame or state writes. Existing transition tests
cover delegated provenance, timeout scheduling, winner fields and omission.

Root checks (573 tests), formatting verification and audit pass. Global assertion
findings fall 202 to 188; transition and timeout source findings are zero.
Deferred runtime-typeof findings fall 68 to 63 through honest producer typing;
other audit counts and enforcement scopes are unchanged.

### Gameplay input evidence and transition test fixtures

The four remaining gameplay input assertions retain explicit evidence. Acting IDs
come from game-scoped rows populated at game start; delegation checks and engine
legality remain authoritative. The action validator checks the seven submitted
variant shapes and fields; its plain wire IDs acquire only engine nominal brands,
with card/territory existence and legality checked by `applyAction`. No new auth,
membership, error-order or action behavior is introduced.

Transition, delegation and team-timeout tests use the existing private test-only
engine ID constructors rather than ad hoc brands, and real mutation contexts
rather than `any` assertions. Stored private states pass the real checked reader;
rejections narrow through `instanceof`. The combat persistence test now first
compares stored events against the returned engine events, then selects the same
AttackResolved event through its discriminator. Fixture values, event ordering,
expected dice counts, and engine behavior remain unchanged. No test helper is
added to the production engine exports.

Root checks (573 tests), formatting verification and audit pass. Assertion
findings fall 188 to 149. The three cleaned test files have zero findings; the
two remaining gameplay findings concern historical action/event records and
remain separate work. Other audit counts and enforcement scopes are unchanged.

### Remaining backend fixture evidence

Backend test assertion findings fall from 24 to zero (global 149 to 125).
Team endgame, turn timing/order, and pre-refactor compatibility fixtures use the
existing private engine ID constructors with unchanged literal values. Redundant
territory-record casts are removed under their actual `GameState` owner contract;
compatibility tests pass real mutation contexts instead of asserting `never`.
The malformed overflow test retains its intentional bad-value cast with explicit
negative-test evidence; its runtime rejection expectation is unchanged.

Root checks (573 tests), formatting verification and full audit pass. Fixture
values, deterministic ordering, compatibility payloads and all expectations are
preserved. Removing the two redundant territory casts also reduces deferred
known-value-widening findings 24 to 22. Other counts and enforcement scopes are
unchanged; no test helper is added to production exports. Remaining backend
assertion findings are 18 production sites, with frontend 107.

### Backend record owners outside replay

Ordinary backend record cleanup reduces assertion findings 125 to 112. Current
game views use validator-owned team names and plain stored player-ID keys;
`projectHand` accepts the string key actually used by the engine hand dictionary.
Authorization, hand visibility and all existing conditions remain unchanged.
Admin map visual updates retain `Doc<'maps'>['visual']` and its storage-ID brand,
avoiding conversion through the engine's plain-string visual contract and back.
Palette membership uses direct equality, and inferred team anchor dictionaries
need no assertion. A new test covers every palette member and invalid prototype,
empty and whitespace-bearing strings.

Three retained assertions state concrete evidence: Better Auth model-specific
user identity fields from the installed component schema (whose general adapter
returns `any`), and the validated in-repo map literal's JSON-only metadata/arrays
cloned into mutable storage. No arbitrary external payload is trusted through
these comments. Root checks (574 tests), formatting verification and full audit
pass. Other counts and enforcement scopes are unchanged. Backend assertion
findings now comprise only five replay/history sites; frontend remains 107.

### Historical public payload boundary

All three History Window snapshot branches now read checked public state without
parsing private state. Patches validate the actual partial contract (partial
territory entries, complete supplied turn, nullable deletion fields), retaining
identity, extras, zero/false values, and missing versus explicit null/undefined.
No range, membership, or cross-field consistency constraints are added.
Historical actions/events remain open records with unknown fields; missing or
nonstring discriminators and future variants remain accepted. Redaction preserves
the existing shapes, private-card omission, and eliminated-card count fallback
(including zero for already-redacted records without a transfer array).

Malformed snapshot/patch fields, primitive/array records, or sparse event lists
now fail explicitly instead of being cast into trusted types. Game-luck replay
checks its actual consumed combat fields using plain wire territory strings;
malformed AttackResolved events throw. Existing missing-snapshot/falsy-patch
messages and event-before-patch error order remain intact. Private engine event
unions are not assigned to untrusted historical records.

Real Convex query/backfill tests cover every snapshot branch, public-only replay
with invalid current private state, optional patches, redaction, malformed data,
and compatibility/error precedence. Compiler inspection confirms the generated
History Window result has `TimelinePublicState | null` snapshots,
`TimelineStatePatch | null | undefined` patches, and open action/event records
with unknown fields, rather than `any` payloads.

Root checks (601 tests), formatting verification and audit pass; independent
review also passes all 27 new tests. Assertion findings fall 112 to 107, all in
the frontend; backend findings are zero. Honest validation changes deferred
runtime-typeof 63 to 71 and unknown parameters 39 to 47; dictionary findings fall
13 to 10 as unchecked record assertions disappear. Widening remains 22. No new
policy enforcement scope is added; global assertion enforcement follows the
remaining frontend cleanup.

### Native pointer contracts

Pointer snapshots retain the browser's string pointer type instead of asserting
only mouse/touch/pen. Existing controller behavior is unchanged; tests cover
mouse, pen, empty and vendor values, immediate panning, drag thresholds and click
suppression. Globe handlers own typed canvas events and capture/release through
currentTarget. Root checks (605 tests), formatting and audit pass. Assertion
findings fall 107 to 100; other counts and policy scopes are unchanged.

### UI style and highlight contracts

Exact local CSS custom-property contracts replace five style assertions, and
existing HighlightFilter template types replace four highlight assertions.
Runtime property values, layout, null/undefined handling and toggling behavior
remain unchanged. Root checks (605 tests), formatting and audit pass. Assertion
findings fall 100 to 91; no policy scopes change.

### Frontend query and replay contracts

Generated API return types replace handwritten view, chat, home and replay
facades. Player-view preference, private-hand defaults, auth query skips and
replay cache/window logic remain intact. Historical event fields stay unknown;
visibility checks guard their discriminator. Display formatting requires only
the territory-name structure it reads. Replay IDs are string cache keys, not
mutation arguments; generated branded IDs remain assignable without branding
synthetic test keys.

Map adaptation uses the existing structural graph reader and retains node-scale
normalization. Malformed graphs now fail explicitly; dangling string references
remain available for domain validation. Real query-backed adapter tests cover
null defaults, player/private-hand preference, graph identity, normalization and
malformed adjacency. Existing replay expectations are preserved.

Root checks (608 tests), formatting verification and audit pass. Independent
review approves. Assertion findings fall 91 to 78; deferred typeof is 73,
unknown parameters 44, dictionary 8, widening 22. No policy scopes change.

### Lobby UI query, mutation and option contracts

Generated lobby data and optimistic query results retain their actual contracts;
mutation overrides derive from FunctionArgs. Repeated route ID casts consolidate
into one documented SDK nominal boundary, leaving server ID validation, lookup
and authorization authoritative. Missing-ID skips and existing defaults remain.
Select values resolve through rendered options before state changes; palette
labels use own entries rather than inherited keys. Shared preset entries use an
explicit ordered owner key tuple, preserving schedules and display order.

Tests cover invalid/prototype-like options, palette labels and preset schedules.
Root checks (611 tests), formatting and audit pass; independent review approves
with no findings. Assertion findings fall 78 to 49; other counts and enforcement
scopes are unchanged. No lobby findings remain unexplained.

### Game UI wire actions and chat identity

Generated view and mutation contracts replace game facades and private engine
ID/action assertions. Optimistic and auto-attack paths consume actual wire action
arguments. Chat callbacks carry generated message IDs; pending optimistic sentinel
IDs are rejected before edit start, edit submission and deletion. The cache-only
sentinel assertion documents that guard; route text retains one documented SDK
boundary. Existing auth, query skips, optimistic state and layout remain intact.

Unknown attack event fields use runtime property guards, preserving numeric
filtering, defaults, and stopping at the latest matching malformed attack rather
than searching older ones. Tests cover legacy/unknown event fields, malformed
latest events and pending message IDs. Root checks (614 tests), formatting and
audit pass; independent review approves. Assertion findings fall 49 to 24;
dictionary findings fall 8 to 7. Other counts/scopes remain unchanged.
