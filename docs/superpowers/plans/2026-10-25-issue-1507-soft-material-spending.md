# MR10 — Soft Material Spending, Substitutions, and Yield Scope

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every soft resource advantage consume a finite, optional material allotment (or an explicit Circular Manufacturing substitution), freeze the selected terms for active work, and stop duplicating strategic resource tile yields into every city.

**Architecture:** A new pure `soft-material-terms.ts` selects eligible advantages from the owning civ's live resources, free reserve stock, and Circular Manufacturing choice. The active occurrence persists that selection on `CityProductionMaterials` and reserves its stock rows alongside the hard recipe, so release/spend and cost pricing share one snapshot. Resource tile effects move from the empire-wide yield helper into the city that works the tile; happiness access remains empire-wide.

**Tech Stack:** TypeScript, Vitest, existing `GameState`/reserve ledger/round phase, jsdom city panel tests, Playwright browser smoke.

---

### Task 0: Register the active plan

**Files:**
- Create: `docs/superpowers/plans/2026-10-25-issue-1507-soft-material-spending.md`
- Modify: `docs/docs-lifecycle-manifest.json`

- [ ] Add the plan as `active`, owned by open issue #1507, with the delete-on-completion reason.
- [ ] Run `./scripts/dev.sh docs-lifecycle`, expect `docs lifecycle ok`.

### Task 1: Finite soft terms and selection

**Files:**
- Modify: `src/systems/resource-advantages.ts`
- Create: `src/systems/soft-material-terms.ts`
- Test: `tests/systems/soft-material-spending.test.ts`

- [ ] Add `DEFAULT_SOFT_MATERIAL_COST = 5` next to the advantage catalog and a `softCost?: number` field on each stored-resource advantage. Ivory keeps its access-only, non-substitutable term.
- [ ] Write failing tests: two factories with 5 free coal cannot both hold the 20% term; no coal still prices the factory at normal cost; Circular Manufacturing aluminum applies the term without creating stock or satisfying a hard uranium recipe; `allowMaterialSubstitution:false` never substitutes.
- [ ] Implement `selectSoftMaterialTerms(state, civId, itemId)` returning `{ multiplier, rows, substitutions }`:
  - eligible advantage requires live resource **and** enough free stock for `softCost`, or an allowed matching Circular substitution;
  - each selected stock term becomes an aggregated `MaterialCostRow`;
  - multiplier is the product of selected discounts, floored at `0.75`.
- [ ] Run the focused test, then commit.

### Task 2: Freeze and reserve the active soft terms

**Files:**
- Modify: `src/core/types/commerce.ts`
- Modify: `src/systems/city-production-materials.ts`
- Test: `tests/systems/city-production-materials.test.ts`
- Test: `tests/systems/soft-material-spending.test.ts`

- [ ] Extend `CityProductionMaterials` with optional `softTerms` `{ itemId, occurrence, multiplier, rows, substitutions }` and `ActiveMaterialCommitment` with optional `softRows`.
- [ ] Write failing tests: activating a factory with 5 coal reserves 5 coal and stores the 20% snapshot; a second factory with no free coal reserves nothing and uses normal cost; release returns the 5 coal; completion spends hard + soft exactly once; changing unrelated offers does not alter the snapshot.
- [ ] Update `beginCityMaterialOccurrence` / `syncCityMaterialCommitment` to reserve hard rows first, then select/reserve soft rows from the remaining free stock, and store the snapshot; keep a resource-free item's soft-only commitment.
- [ ] Update `releaseCityMaterialCommitment` and `spendActiveMaterialRecipe` to release/consume `softRows` with the hard recipe exactly once.
- [ ] Run focused tests, then commit.

### Task 3: One price for the active snapshot everywhere

**Files:**
- Modify: `src/systems/city-production-cost.ts`
- Modify: `src/systems/production-cost-context.ts`
- Modify: `src/systems/unit-upgrade-system.ts`
- Test: `tests/systems/production-cost-parity.test.ts`
- Test: `tests/systems/unit-upgrade.test.ts`

- [ ] Add `activeItemId`/`activeSoftDiscount` to `ProductionCostContext`; `buildProductionCostContext` copies the city's matching `softTerms` snapshot.
- [ ] `getProductionCostForItem` uses the frozen multiplier for the active item and live estimates for every other item.
- [ ] For upgrades, select soft terms at evaluation time, price with the same snapshot semantics, report missing soft rows, and consume hard + soft atomically with gold; a failed placement/gold check consumes neither.
- [ ] Write failing parity tests across city panel cost, queue cost, rush-buy quote/payment, upgrade preview/payment, and AI cost; stale occurrences fall back safely.
- [ ] Run focused tests, then commit.

### Task 4: Worked-tile resource scope and presentation

**Files:**
- Modify: `src/systems/resource-system.ts` (or the existing city-yield owner)
- Modify: `src/systems/city-work-system.ts`
- Modify: `src/systems/resource-acquisition-system.ts`
- Modify: `src/ui/city-panel.ts`
- Test: `tests/systems/resource-effects.test.ts`
- Test: `tests/ui/city-panel-resources.test.ts`

- [ ] Write failing tests: a worked coal tile adds production only to the working city, not a second city; an unworked owned coal tile adds nothing; imported iron with no domestic tile adds no tile output; happiness access remains empire-wide.
- [ ] Add `getCityWorkedResourceEffects` and apply non-happiness effects inside `calculateCityYields` only for actual worked tiles (including the worked city center by the existing center rule).
- [ ] Remove the empire-wide non-happiness bonus from `city-work-system`; keep `getCivHappinessFromResources` as the explicitly scoped access effect.
- [ ] City panel: label happiness as `Empire bonuses`, worked resources as `Worked-tile bonuses` for this city, and stop listing unworked owned resources as city yields.
- [ ] Run focused tests, then commit.

### Task 5: Acceptance, persistence and verification

**Files:**
- Test: `tests/systems/soft-material-spending.test.ts`
- Test: `tests/systems/material-reserves-calibration.test.ts`
- Modify: `docs/superpowers/plans/2026-10-25-issue-1507-soft-material-spending.md`

- [ ] Add acceptance assertions for the two-factory coal fixture, normal-cost fallback, Circular substitution boundaries, frozen active terms, and no foreign-mine tile output.
- [ ] If the optional persisted fields change the persisted-shape snapshot, update it with the documented additive proof; no schema bump is needed because absent fields mean “no soft snapshot”.
- [ ] Run `./scripts/dev.sh verify-impact`, source checks, every mirrored test, full profile, AI playability, builds (web `/conquestoria/`, Tauri relative), and the browser replay.
- [ ] Tick this plan, record measured results, update #1507/#1497 after merge, and keep later slices unchecked.

## Player truth table

| Before / action | State change | Immediate visible result | Still reachable |
|---|---|---|---|
| Factory queued, 5 free coal | Activate factory | 5 coal reserved; cost shows the 20% term; Supplies committed +5 | Queue tail, remove/reorder, normal-cost fallback |
| Second factory, no free coal | Activate second factory | No reservation, normal cost, honest “no soft term” copy | Full catalog and free alternatives |
| Active factory, unrelated coal offer changes | Commit unrelated state | Active price/term unchanged (snapshot) | Current panel values |
| Circular aluminum selected, no aluminum stock | Activate eligible unit | Soft term applies with no stock row; hard uranium weapon unaffected | Hard recipe and fuel rules |
| Active factory removed | Remove head | 5 coal returns to free; cost/term disappears | Every remaining queue entry |
| Worked coal tile | End turn | Only that city gains +1 production | Other cities' own yields |

## Misleading UI risks

- Never label a soft term “required”; it is optional and normal-cost production remains possible.
- “Committed” includes only actually reserved soft stock, not an estimate for a queued tail.
- Circular Manufacturing is a substitution term, never stored stock, hard-material eligibility, or fuel.
- Worked-tile bonuses apply only in the working city; empire happiness stays separately labeled.

## Interaction replay checklist

- [ ] Activate, remove, reorder, and reopen a soft-discounted item; verify reservation, price, and visible fallback.
- [ ] Attempt a second soft term with no free stock; verify normal cost and no reservation.
- [ ] Change an unrelated resource/offer and verify the active term does not move.
- [ ] Select Circular Manufacturing and verify no stock appears in Supplies.
- [ ] Work/unwork a resource tile and verify only that city's yield and label change.
