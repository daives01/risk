# Frontend Style Guide

## Direction
- Layout shells and recurring surfaces use semantic classes from `web/src/index.css` (`app-*`, `glass-panel`, `soft-grid`).
- Local component internals use utility classes for one-off spacing and alignment.
- New pages should not invent parallel shell systems; use existing semantic wrappers first.
- Prefer calm, dense, readable control surfaces over flashy layouts in gameplay/lobby contexts.

## Rules
- Prefer semantic shell classes for app/page scaffolding.
- Prefer utility classes for local composition inside cards/panels.
- Keep spacing scale consistent with existing tokens (`p-2`, `p-3`, `p-4`, `gap-2`, `gap-3`, `gap-4`).
- Use uppercase monospace accents only for navigational/meta labels, not body copy.
- Keep interaction states explicit (`hover`, `focus-visible`, `disabled`) on all clickable controls.
- Avoid layout shift on interaction (`Copy` -> `Copied`, loading labels, etc.): reserve width with fixed button widths or stable labels.
- Do not expose internal IDs in UI copy (`team-1`); map to user-facing labels (`Team 1`) unless user-renamed.
- Use concise status chips/badges for counts and diagnostics; avoid long stacked warning blocks.

## Keyboard Shortcuts
- Use helpers from `web/src/lib/keyboard-shortcuts.ts`.
- Avoid ad-hoc typing-target/modifier checks in pages.

## Control Patterns
- Use shared primitives in `web/src/components/ui` as defaults:
  - `Select` for variable-length options or labels that can wrap/truncate (team assignment, card reward preset, rule mode).
  - `Switch` for boolean toggles in settings/rules contexts.
  - `Popover` for compact pickers (like color palettes) and secondary controls.
- Avoid native `<select>` and raw `<input type="checkbox">` in app surfaces.
- Prefer one control type per decision. Do not mix segmented controls + selects for the same semantic field on the same screen.

## Color UX
- Player color selection should show:
  - Trigger: swatch + human name (`Blue`, `Teal`, etc.).
  - Picker: swatch grid ordered perceptually (cool -> warm), with taken colors visually disabled.
- Keep color names in `risk-engine` so backend/frontend share one vocabulary.

## Realtime & Optimistic UX
- For lobby edits that are fast and frequently repeated (color/team assignment), prefer optimistic UI:
  - Update local pending state immediately.
  - Do not hard-disable the entire control while request is in flight.
  - Protect against stale responses with request sequencing/versioning when needed.
- Show error feedback without abruptly reverting unrelated fields.

## Teams Section Principles
- Order content as:
  1. Controls (`team count`, `auto rebalance`)
  2. Editable rows (`team name`, `size`)
  3. Compact validation text
- Keep “at a glance” values in single-line badges (`Players`, `Unassigned`, `Balance`).
- Prefer short helper text (`text-xs`) over verbose paragraphs for setup guidance.
