---
trigger: glob
globs: "**/src/ui/**, **/src/renderer/**, **/src/app/**, **/src/presentation/**, **/src/input/**, **/src/main.ts, **/tests/e2e/**"
description: "Canonical Conquestoria UI panel, renderer invalidation, sprite, session publication, and input reliability rules."
---

Before editing UI, renderer, presentation, app controller, input, or E2E interaction files, read the matching canonical rules:
- For `src/ui/**`, `src/renderer/**`, `src/main.ts`:
  - `.claude/rules/ui-panels.md`
  - Activate the `button-styling` skill (`.claude/skills/button-styling.md`) before creating or editing buttons in `src/ui/`.
- For `src/renderer/**`:
  - `.claude/rules/renderer-invalidation.md`
  - `.claude/rules/sprites.md` (for `src/renderer/sprites/**`, `terrain/**`, `improvements/**`, `hex-renderer.ts`).
- For `src/app/**`, `src/presentation/**`, `src/main.ts`:
  - `.claude/rules/session-publication.md`
  - `.claude/rules/action-contracts.md` (for `src/app/controllers/**`).
- For `src/input/**`, `src/ui/**`, `src/app/controllers/**`, `tests/e2e/**`:
  - `.claude/rules/input-reliability.md`
  - `.claude/rules/action-contracts.md` (for `src/input/**`).
