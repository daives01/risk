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
