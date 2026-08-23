# Rogue Elephant Host Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver Issue #705's Rogue Elephant Host warning, spawn, targeting, and Handler command mechanics; #706 retains command break and resolution.

**Architecture:** Add a serializable `rogueElephantHosts` record beside `stampedes`. A new Host system owns eligibility, deterministic spawning, targets, and command facts; combat, AI, UI, and renderer consume those facts without unit-ID branches.

**Tech Stack:** TypeScript, Vitest, existing crisis-force system, Canvas and DOM presentation.

---

## Scope boundary

- Include era 4–9, one Host per target, Stampede exclusion, one warning turn, Explorer/Standard/Veteran force sizes, exact strengths, priority targeting, and a radius-2 non-stacking +20% Handler modifier.
- Exclude Handler-death conversion, dispersal, terminal outcomes, gold, Recovered Harnesses, and expiry; those are #706.

## Files

- `src/core/types.ts`: Host lifecycle and command types.
- `src/systems/rogue-elephant-host-system.ts`: canonical Host scheduling, spawning, target, and command helpers.
- `src/systems/stampede-system.ts`, `src/core/turn-manager.ts`: shared pressure exclusion, target-turn invocation, and canonical Host movement/attack toward its persisted target.
- `src/storage/save-migrations.ts`: next-schema migration plus idempotent Host normalization for warning and active saves.
- `src/systems/unit-system.ts`, sprite catalog: crisis-only Handler/Elephant definitions and valid temporary mappings.
- `src/systems/combat-system.ts`: typed command fact affects attack and defense once.
- `src/ai/ai-crisis-response.ts`, `src/systems/world-pressure-presentation.ts`, `src/ui/selected-unit-info.ts`, `src/renderer/render-loop.ts`: viewer-safe consumers.
- `tests/systems/rogue-elephant-host-system.test.ts` plus mirrored combat, turn, AI, presentation, and UI tests.

## Task 1: Typed Host lifecycle and spawn — 🟡 implemented foundation; comprehensive boundary/save fixtures remain

- [ ] Write failing `tests/systems/rogue-elephant-host-system.test.ts` tests proving an Era-6 human target Host has exactly one Handler plus 1/2/3 elephants for Explorer/Standard/Veteran after its warning turn; an AI target always uses Standard’s two elephants; all Host units have 100 health and no spawn-turn action; Era 9 uses Handler 37 and Elephant 60; eras 3 and 10, an active Stampede, and prior Host all reject scheduling.
- [ ] Run `bash scripts/run-with-mise.sh yarn test --run tests/systems/rogue-elephant-host-system.test.ts`; confirm it fails because Host types/APIs do not exist.
- [ ] Add `RogueElephantHostState`, `GameState.rogueElephantHosts`, and `rogue-elephant-host-system.ts`. Persist `forceId`, warning/active phase, target, severity, and one-game completion eligibility. Human targets use their selected pressure severity; AI targets use Standard. Implement `getRogueHandlerStrength(era) = 22 + 3 × (clamp(era, 4, 9) - 4)` and `getRogueElephantStrength(era) = 40 + 4 × (clamp(era, 4, 9) - 4)`. Spawn `rogue_handler` and `rogue_elephant` under `CRISIS_FORCE_OWNER` with the existing crisis-force registration helper; never put them in trainable catalogs.
- [ ] Add temporary valid sprite mappings, the next save-schema migration, and an idempotent normalizer. Cover schema 0, immediately prior schema, current schema, malformed Host/force records, and warning/active save round trips. Invoke the shared Host scheduler/process helper in the same target-civ turn path as Stampede handling.
- [ ] Run `bash scripts/run-with-mise.sh yarn test --run tests/systems/rogue-elephant-host-system.test.ts tests/systems/unit-system.test.ts tests/core/turn-manager.test.ts`; expect PASS.
- [ ] Commit: `git add src/core/types.ts src/systems/rogue-elephant-host-system.ts src/systems/stampede-system.ts src/core/turn-manager.ts src/systems/unit-system.ts src/renderer/sprites tests/systems/rogue-elephant-host-system.test.ts tests/systems/unit-system.test.ts tests/core/turn-manager.test.ts && git commit -m "feat(705): spawn rogue elephant hosts"`.

## Task 2: Target priority and canonical Handler command fact — 🟡 implemented; adversarial target-priority and combat-history coverage remain

- [ ] Write failing Host and combat tests proving target order is: target-owned valuable improvement, then Fort/Citadel, then the least-defended legal city approach; ties are stable. Prove the active Host’s canonical pass moves/attacks only toward that selected legal target, never uses hidden rival state, and uses shared world move/combat helpers. Prove exactly +20% attack and defense with a Handler within two hexes, no bonus at three hexes, and no stacking from two nearby Handlers.
- [ ] Run `bash scripts/run-with-mise.sh yarn test --run tests/systems/rogue-elephant-host-system.test.ts tests/systems/combat-system.test.ts`; confirm RED for missing facts, not unrelated regression.
- [ ] Add `RogueHostTarget` and `getRogueElephantCommandFact(state, elephantUnitId): { percent: 20; handlerUnitId: string } | undefined`. It must require the active Host, a live same-force Handler, and axial distance at most two. Rank only legal target-player candidates and break ties by stable IDs.
- [ ] Feed the returned fact through the existing named combat-fact/modifier seam for attack and defense. Process Host units in stable force/unit order through shared move/combat helpers toward the persisted target, stopping when movement or combat ends. Do not implement strength changes in AI, renderer, or bare `unit.type` branches.
- [ ] Run the same focused command; expect PASS. Commit with `git add src/systems/rogue-elephant-host-system.ts src/systems/combat-system.ts tests/systems/rogue-elephant-host-system.test.ts tests/systems/combat-system.test.ts && git commit -m "feat(705): coordinate rogue elephant host attacks"`.

## Task 3: Viewer-safe presentation and AI use — 🟡 selected-unit and visible-AI paths implemented; world-pressure presentation coverage remains

### Player Truth Table

| Before | Event | Immediate visible result |
|---|---|---|
| Warning Host | Open panel/select visible unit | “Rogue Elephant Host is approaching; prepare defenses.” and one-turn warning. |
| Active Host, Handler in range | Select elephant | “Handler command: +20% attack and defense within 2 hexes.” |
| Handler outside range | Reselect/rerender | Command label and overlay disappear. |
| Other hot-seat player | Handoff/rerender | No Host target, warning, Handler, or route information appears. |

### Misleading UI Risks

- Never show command text for a dead, different-force, or out-of-range Handler.
- Never call the warning an active attack phase.
- Never expose a hidden target improvement, Fort, city approach, or AI intent.

### Interaction Replay Checklist

- Open warning, advance one target turn, reopen, and verify active status replaces it.
- Select in-range elephant, move Handler beyond two hexes, reselect, and verify immediate removal.
- Change `currentPlayer` in a two-human fixture and verify stale Host text and overlays vanish.

- [ ] Write failing DOM/AI tests: warning and active command text render; out-of-range and other-player views omit all command/Host facts; hidden Host actors are not AI dispatch candidates.
- [ ] Run `bash scripts/run-with-mise.sh yarn test --run tests/systems/world-pressure-presentation.test.ts tests/ui/selected-unit-info.test.ts tests/ai/ai-crisis-response.test.ts`; confirm RED for missing Host presentation values.
- [ ] Implement `getRogueElephantHostPresentationForViewer(state, viewerId)` as the sole presentation read model; it exposes only current-viewer-visible warning/active facts. Add AI dispatch only for currently visible actors permitted by that read model, and route visible state changes through current panel-refresh behavior.
- [ ] Run `scripts/check-src-rule-violations.sh src/systems/rogue-elephant-host-system.ts src/systems/stampede-system.ts src/systems/combat-system.ts src/core/turn-manager.ts src/ai/ai-crisis-response.ts src/systems/world-pressure-presentation.ts src/ui/selected-unit-info.ts` then rerun the focused five test files; expect PASS.
- [ ] Commit with `git add src/systems/world-pressure-presentation.ts src/ui/selected-unit-info.ts src/renderer src/ai/ai-crisis-response.ts tests/systems/world-pressure-presentation.test.ts tests/ui/selected-unit-info.test.ts tests/ai/ai-crisis-response.test.ts && git commit -m "feat(705): present rogue elephant host pressure"`.

## Final verification

- [ ] Update this plan’s checked steps and Issue #547’s #705 status in the completion PR.
- [ ] Run `git diff --check`, inspect `git diff --stat origin/main...HEAD`, `git diff --stat`, and every source diff.
- [ ] Run `bash scripts/run-with-mise.sh yarn build`.
- [ ] Run `bash scripts/run-with-mise.sh yarn test:durable` and `bash scripts/run-with-mise.sh yarn test:durable:status`.
