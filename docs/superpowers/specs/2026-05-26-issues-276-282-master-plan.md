---
name: issues-276-282-master-plan
description: Sequencing and coordination plan for fixing GitHub issues 276–282 across three MRs
metadata:
  type: project
---

# Issues 276–282 — Master Fix Plan

**Date:** 2026-05-26
**Issues:** #276, #277, #278, #279, #280, #281, #282

## Overview

Seven issues group into three independent clusters, each delivered as a separate MR.
Order: **MR-A → MR-C → MR-B**

| MR | Issues | Theme | Spec |
|----|--------|-------|------|
| MR-A | #277, #280, #282 | Worker turn-state & improvement UX | `2026-05-26-mr-a-worker-improvements-design.md` |
| MR-C | #276, #279 | Polish: city icon centering + hotkeys/journey | `2026-05-26-mr-c-polish-design.md` |
| MR-B | #278, #281 | Wonders UI data safety & redesign | `2026-05-26-mr-b-wonders-ui-design.md` |

## Rationale for Ordering

- **MR-A first:** Pure bug fixes, no new state fields, touches `turn-manager.ts` and `improvement-system.ts`. Self-contained.
- **MR-C second:** Adds `UnitAutomation` journey mode to `types.ts` and `turn-manager.ts`. Must come after MR-A so both PRs don't race on `turn-manager.ts`.
- **MR-B last:** No shared files with MR-A/C. Wonders changes are isolated to `wonder-codex/`, `legendary-wonder-*.ts`, and `notification-routing.ts`.

## Cross-MR File Conflicts

| File | MR-A | MR-C | MR-B |
|------|------|------|------|
| `src/core/turn-manager.ts` | ✓ worker reset guard | ✓ journey step advance | — |
| `src/core/types.ts` | — | ✓ UnitAutomation journey | — |
| `src/systems/improvement-system.ts` | ✓ blocker description | — | — |
| `src/ui/worker-task-warning-panel.ts` | ✓ generalize copy | — | — |
| `src/systems/wonder-codex/presentation.ts` | — | — | ✓ visibility gate |
| `src/ui/legendary-wonder-notifications.ts` | — | — | ✓ linkedCityId |

MR-A and MR-C share `turn-manager.ts` — sequence them, do not merge in parallel.

## Root Cause Summary

**MR-A root cause:** The improvement/worker system only handles the "happy path" (build from empty tile, one charge). Three edge cases are unhandled: (1) workers with active tasks are incorrectly re-queued each turn because `resetUnitTurn` clears `hasActed` unconditionally, (2) blocker reasons don't name specific tech/resource, (3) no replacement path exists when a tile already has an improvement.

**MR-C root cause:** Independent cosmetic/feature gaps. City icon uses a fixed vertical baseline that doesn't account for emoji optical offset. Keyboard shortcuts and multi-turn auto-move are missing entirely.

**MR-B root cause:** The Wonder Codex shows all legendary wonders to all players with no discovery gate (natural wonders have `isNaturalVisible`; legendary wonders have no equivalent). The `wonder:legendary-ready` notification names a wonder as actionable but doesn't deep-link to the correct city panel, so players open the wrong city and can't find the action.
