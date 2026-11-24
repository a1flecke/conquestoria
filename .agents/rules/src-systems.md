---
trigger: glob
globs: "**/src/systems/**, **/src/core/**, **/src/ai/**, **/src/storage/**, **/tests/simulation/**"
description: "Canonical Conquestoria gameplay systems, invariants, AI, movement, balance, and storage rules."
---

Before editing gameplay systems, core turn flow, AI, or storage files, read the matching canonical rules in `.claude/rules/`:
- Always for `src/systems/**`, `src/core/**`, `src/ai/**`, `src/storage/**`:
  - `.claude/rules/game-systems.md`
  - `.claude/rules/invariants.md`
- For `src/systems/**` or `src/core/**`:
  - `.claude/rules/strategy-game-mechanics.md`
  - `.claude/rules/action-contracts.md` (also applies to `src/ai/**`)
- For unit movement files (`unit-movement-*.ts`, `unit-system.ts`, `unit-low-level-move.ts`, `unit-lifecycle.ts`):
  - `.claude/rules/movement-actions.md`
- For `src/ai/**`, `src/core/**`, or `tests/simulation/**`:
  - `.claude/rules/ai-simulation.md`
- For turn orchestration, pathfinding, movement cost/legality, fog, elimination, AI schedulers, or `src/storage/**`:
  - `.claude/rules/performance-budgets.md`
- For content, balance, wonders, tech/building/unit descriptions, or Great Generals:
  - `.claude/rules/game-balance.md`
  - `.claude/rules/wonder-content.md`
  - `.claude/rules/content-description-honesty.md`
  - `.claude/rules/great-general-content.md`
