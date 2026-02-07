# Frontend Style Guide

## Direction
- Layout shells and recurring surfaces use semantic classes from `web/src/index.css` (`app-*`, `glass-panel`, `soft-grid`).
- Local component internals use utility classes for one-off spacing and alignment.
- New pages should not invent parallel shell systems; use existing semantic wrappers first.

## Rules
- Prefer semantic shell classes for app/page scaffolding.
- Prefer utility classes for local composition inside cards/panels.
- Keep spacing scale consistent with existing tokens (`p-2`, `p-3`, `p-4`, `gap-2`, `gap-3`, `gap-4`).
- Use uppercase monospace accents only for navigational/meta labels, not body copy.
- Keep interaction states explicit (`hover`, `focus-visible`, `disabled`) on all clickable controls.

## Keyboard Shortcuts
- Use helpers from `web/src/lib/keyboard-shortcuts.ts`.
- Avoid ad-hoc typing-target/modifier checks in pages.
