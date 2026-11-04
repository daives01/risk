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
