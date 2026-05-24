# S4b — Strategic Resource Prerequisites for Units & Buildings

**Date:** 2026-05-24
**Slice:** S4b (Phase 2 — Resources Matter)
**Depends on:** S4a (resource tracking + `getCivAvailableResources` stable)
**Parent roadmap:** `docs/superpowers/specs/2026-05-20-marketplace-trade-roadmap.md`
**Next slice:** S5 (first trade unit)

---

## 1. Overview

S4a gave strategic resources passive yield or happiness effects. S4b makes them **prerequisites**: certain units and buildings require both the enabling tech **and** the corresponding strategic resource to build. A civ without the resource can see the item in a locked section of the city panel but cannot queue it.

S4b also performs a **historical unit/building audit**: the existing roster is thin (no cavalry, no siege, gaps in melee progression). New units and buildings are added in this slice to fill era-appropriate gaps, with resource gating where historically and gameplay-appropriate. The guard principle: every era must offer at least one buildable offensive unit and one defensive unit with no resource gate.

---

## 2. Resource gate data model

### 2.1 `TrainableUnitEntry` extension (`src/core/types.ts`)

Add an optional field:

```ts
resourceRequired?: ResourceType[];  // all resources must be available; empty/absent = ungated
```

This mirrors `techRequired`. The check is conjunctive: **all** listed resources must be in `getCivAvailableResources(state, civId)`.

### 2.2 `Building` extension (`src/systems/city-system.ts`)

Add the same field:

```ts
resourceRequired?: ResourceType[];
```

### 2.3 Filter function changes

**`getTrainableUnitsForCiv`** gains a second parameter:

```ts
function getTrainableUnitsForCiv(
  completedTechs: string[],
  civType?: string,
  availableResources?: Set<ResourceType>,
): TrainableUnitEntry[]
```

If `availableResources` is provided, any entry with `resourceRequired` is filtered out unless all listed resources are present. When `availableResources` is omitted (backwards-compat), resource filtering is skipped — existing call sites that don't pass it continue to work.

**`getAvailableBuildings`** gains an optional `availableResources` parameter with the same semantics.

### 2.4 `processCity` dequeue extension

The existing tech-drop dequeue in `processCity` is extended to also drop queued items whose `resourceRequired` entries are not all met by the civ's current resources. This means:

- Losing a Mine to pillage → iron gone → Swordsman in queue silently dequeues (same turn).
- Re-acquiring the resource allows the item to be re-queued.

`processCity` already receives `completedTechs`. It will now also receive `availableResources: Set<ResourceType>` (optional, defaults to empty set, preserving backwards-compat). The caller in `turn-manager.ts` must supply it.

### 2.5 Save compatibility

No new `GameState` fields. `resourceRequired` is read-only data on catalogue entries — old saves carry no trace of it and will just see the gate applied on load. No migration needed.

---

## 3. New units

All new units follow the [end-to-end-wiring rule](../../.claude/rules/end-to-end-wiring.md): they need entries in `TRAINABLE_UNITS`, `UNIT_DEFINITIONS`, `UNIT_DESCRIPTIONS`, `unit-renderer.ts`, `turn-manager.ts` (production side-effects if any), death cleanup in `main.ts` (if any), AI usage in `basic-ai.ts`, and tech-gated dequeue in `processCity`.

### 3.1 Complete new unit table

| Unit | Tech | Resource(s) | Cost | Era | Attack profile | Notes |
|------|------|-------------|------|-----|----------------|-------|
| Axeman | stone-weapons | copper | 22 | 1–2 | melee | Early powerful melee; obsoletedByTech: bronze-working |
| Spearman | bronze-working | — | 32 | 2 | melee | Basic anti-cavalry polearm; obsoletedByTech: fortification |
| Horseman | horseback-riding | horses | 55 | 2–3 | melee | Basic cavalry; obsoletedByTech: iron-forging |
| Cavalry | horseback-riding | horses + iron | 85 | 3 | melee | Powerful mounted; obsoletedByTech: iron-forging |
| Knight | iron-forging | horses + iron | 115 | 3–4 | melee | Heavy cavalry; supersedes Horseman + Cavalry |
| Crossbowman | tactics | copper | 75 | 3–4 | ranged | Precision ranged upgrade over Archer |
| Catapult | siege-warfare | stone | 110 | 4 | siege/bombard | Anti-city bombardment; attacks cities + adjacent units |
| Ballista | siege-warfare | iron | 100 | 4 | ranged/siege | Anti-unit precision siege; higher range than Catapult |

### 3.2 Existing unit re-gate

**Swordsman** already exists with `techRequired: 'bronze-working'`. Add `resourceRequired: ['iron']`. No other field changes.

### 3.3 Obsolescence notes

`obsoletedByTech` removes older units from the trainable list when the player reaches a newer tech — the same pattern used by spy tiers. When Horseman and Cavalry are both obsoleted by `iron-forging`, Knight becomes the only trainable cavalry. This ensures cities don't offer all three tiers simultaneously.

### 3.4 Attack profiles for new units

Existing profiles in `unit-system.ts` cover `melee`, `ranged`, `siege`, `bombard`. The new units use:

- **Axeman / Spearman / Horseman / Cavalry / Knight**: melee (same as Warrior/Swordsman)
- **Crossbowman**: ranged, range 2, targets units only (same profile family as Archer)
- **Catapult**: `bombard`, range 2, targets cities + units (standard bombard, no splash in this slice — see §9)
- **Ballista**: `ranged`, range 3, targets units only (longer range and no city bombardment)

---

## 4. New buildings

All new buildings follow the existing `Building` shape with the added `resourceRequired` field. They are added to the `BUILDINGS` record in `city-system.ts` and to `PRODUCTION_ICONS`.

### 4.1 Complete new building table

| Building | Tech | Resource | Category | Yields | Cost | Effect description |
|----------|------|----------|----------|--------|------|--------------------|
| Bronze Workshop | stone-weapons | copper | production | +1 prod, +1 sci | 30 | Copper-tool crafting boosts output and knowledge |
| Armory | stone-weapons | copper | military | — | 40 | 15% cost reduction for melee/ranged units trained here |
| Ranch | animal-husbandry | horses | food | +2 food | 35 | Pasture and breeding grounds |
| Cavalry Academy | horseback-riding | horses | military | — | 55 | 15% cost reduction for mounted units trained here |
| Iron Foundry | iron-forging | iron | production | +3 prod | 80 | Advanced smelting (no Forge prerequisite — iron-forging tech is sufficient) |
| War Academy | iron-forging | iron | military | — | 70 | 15% cost reduction for all melee and ranged units |
| Masonry Works | state-workforce | stone | production | +2 prod | 50 | Quarried stone speeds construction; walls 20% cheaper |
| Siege Workshop | siege-warfare | stone | military | — | 90 | 20% cost reduction for siege units (Catapult, Ballista) |

**Notes:**
- Military buildings (Armory, Cavalry Academy, War Academy, Siege Workshop) grant production cost discounts only — no XP system in this slice. The discount is implemented via `getProductionCostForItem`, using the same pattern as the Safehouse 25% spy discount. Each applies to the relevant unit types (melee/ranged, cavalry, all military, siege respectively).
- "Walls cheaper" for Masonry Works is a production cost modifier in `getProductionCostForItem` for `walls`.
- No `prerequisiteBuildings` field introduced in this slice — Iron Foundry requires only iron-forging tech + iron resource.

### 4.2 Existing buildings — no changes

No existing building gets a new resource requirement. The guard principle (basic buildings always buildable) is preserved.

---

## 5. City panel lock UI

### 5.1 Trigger condition

A unit or building appears in the **locked section** when:
- Its `techRequired` is met (player has the tech), AND
- Its `resourceRequired` is NOT fully met (one or more resources missing)

Items where the tech is also unmet stay invisible (not shown locked). Only tech-met, resource-blocked items surface in this section.

### 5.2 Visual design

The locked section appears below the trainable units list in the build list tab. Header: `🔒 Locked — missing resources`. Each item renders similarly to a trainable item but:

- Background is dimmed (`rgba(255,255,255,0.04)`)
- Text opacity ~50%
- Leading lock icon `🔒`
- Sub-line: `Requires [Resource Name] — [how to get it]` e.g. `Requires Iron — build a Mine on an Iron tile`
- For multi-resource items (Cavalry: horses + iron): `Requires Horses and Iron`

The "how to get it" hints follow this pattern (derived from the resource definition's `requiredImprovement` field):
- Mine-class improvements: `build a Mine on an [Resource] tile`
- Pasture: `build a Pasture on a Horses/Cattle tile`
- Quarry: `build a Quarry on a Stone tile`
- City-center exception: no improvement hint if the resource is city-center accessible

### 5.3 Collapsing behaviour

If more than 3 items are locked, show the first 3 and a `Show X more` button that expands in-place. This avoids the locked section overwhelming cities in an early game state where many things haven't been unlocked.

### 5.4 No click action

Clicking a locked item does nothing — it is non-interactive. No button, no toast. The text explanation is the feedback.

---

## 6. AI parity

### 6.1 Production selection

`basic-ai.ts` calls `getTrainableUnitsForCiv` and `getAvailableBuildings`. Both now accept `availableResources`. The AI must compute `getCivAvailableResources(state, civId)` before production selection and pass it to both filter functions. This ensures the AI never queues a resource-blocked item.

### 6.2 Dequeue (passive)

When a civ's resource access changes mid-game (mine pillaged, etc.), `processCity` dequeues resource-blocked items. This fires automatically for AI cities during the turn manager's processing loop — no separate AI code path needed.

### 6.3 AI training the new units

New units (Horseman, Cavalry, Knight, Crossbowman, Catapult, Ballista, Axeman, Spearman) must be included in AI production candidacy. The `basic-ai.ts` `availableItems` list is currently a hardcoded subset (`['warrior', 'scout', 'granary', 'settler']`). For S4b, expand this to derive the list from `getTrainableUnitsForCiv` + `getAvailableBuildings`, filtered through personality weights, rather than a hardcoded list. This is both a correctness requirement and a general improvement (the AI currently misses swordsman, pikeman, archer, etc.).

---

## 7. Test matrix

### 7.1 Resource gate conjunctions (spec-fidelity)

For each gated unit/building, at least three tests:
1. `tech=met, resource=missing` → not in `getTrainableUnitsForCiv` / `getAvailableBuildings`
2. `tech=missing, resource=present` → not trainable (tech gate holds independently)
3. `tech=met, resource=met` → appears in trainable list (positive)

For multi-resource items (Cavalry: horses + iron):
4. `tech + horses, no iron` → blocked
5. `tech + iron, no horses` → blocked
6. `tech + horses + iron` → trainable

### 7.2 City panel lock section

7. Tech met + resource missing → item appears in locked section with reason text
8. Tech met + resource met → item absent from locked section (in trainable list instead)
9. Tech missing → item absent from both sections

### 7.3 `processCity` dequeue

10. Item queued, resource subsequently removed → dequeued same turn
11. Item queued, resource present → not dequeued
12. (Regression) Tech-drop dequeue still works (existing tests pass)

### 7.4 AI parity

13. AI civ with resource + tech → queues the gated unit
14. AI civ without resource → never queues the resource-blocked unit
15. AI civ loses resource mid-game → `processCity` dequeues it (no zombie production)

### 7.5 Icon coverage regression

16. All new units have entries in `PRODUCTION_ICONS` (existing icon-coverage test catches this)
17. All new buildings have entries in `PRODUCTION_ICONS`

---

## 8. Files affected

| File | Change |
|------|--------|
| `src/core/types.ts` | Add `resourceRequired?: ResourceType[]` to `TrainableUnitEntry`; add `prerequisiteBuildings?: string[]` to `Building` (if implemented) |
| `src/systems/city-system.ts` | Add `resourceRequired` to `Building` type; add 8 new buildings to `BUILDINGS`; add 8 new units + re-gate swordsman in `TRAINABLE_UNITS`; add 16 entries to `PRODUCTION_ICONS`; update `getTrainableUnitsForCiv` and `getAvailableBuildings` to accept + apply `availableResources` |
| `src/systems/unit-system.ts` | Add `UNIT_DEFINITIONS` + `UNIT_DESCRIPTIONS` for all 8 new unit types |
| `src/renderer/unit-renderer.ts` | Add icon for each new unit type |
| `src/core/turn-manager.ts` | Pass `availableResources` to `processCity`; handle new unit production side-effects (none for these unit types — no special state) |
| `src/ai/basic-ai.ts` | Compute `getCivAvailableResources` before production selection; pass to `getTrainableUnitsForCiv` and `getAvailableBuildings`; expand `availableItems` from hardcoded list to derived list |
| `src/ui/city-panel.ts` | Add locked-section rendering (tech-met + resource-blocked items) with reason text and collapse affordance |
| `src/systems/resource-acquisition-system.ts` | No functional changes; consumed as-is by the new callers |
| `src/systems/trade-system.ts` | No changes (resource definitions already have `effect: null` for the 4 strategic resources) |
| `tests/systems/city-system.test.ts` | New tests per §7 test matrix |
| `tests/ui/city-panel.test.ts` | Lock-section DOM tests per §7.2 |
| `tests/ai/basic-ai.test.ts` | AI parity tests per §7.4 |

---

## 9. Out of scope for S4b

- Catapult splash/area damage (Catapult uses standard `bombard` profile in this slice; splash requires `combat-system.ts` extension — defer to a follow-up issue)
- Cavalry movement bonus (mounted units moving faster — a future enhancement)
- Resource trading (S8/S9)
- Unit upgrade paths between new tiers (future slice after S5)
- `prerequisiteBuildings` for Iron Foundry (simplify by dropping if complex; just tech-gate)

---

## 10. Locked-in decisions from this brainstorm

| Decision | Choice |
|----------|--------|
| Gate direction | `resourceRequired: ResourceType[]` on unit/building entry (not `prerequisiteFor` on resource) |
| Cavalry tier | Single powerful tier: horseback-riding + horses; Cavalry adds iron; Knight upgrades both at iron-forging |
| Siege | Catapult (stone, bombard) + Ballista (iron, precision ranged), both at siege-warfare era 4 |
| Copper gates | Axeman (unit, early) + Crossbowman (unit, late) + Bronze Workshop + Armory (buildings) |
| Lock UI | Separate grayed-out section below trainable list; collapsed beyond 3 items; tech-missing items hidden entirely |
| AI production list | Derived from `getTrainableUnitsForCiv` + `getAvailableBuildings`, not hardcoded — this also fixes the AI's current unit-selection gaps |
| Resource loss dequeue | Yes — losing a resource mid-game dequeues resource-blocked items the same turn (consistent with tech-drop) |
