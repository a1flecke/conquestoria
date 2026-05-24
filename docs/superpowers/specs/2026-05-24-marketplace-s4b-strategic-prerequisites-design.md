# S4b — Strategic Resource Prerequisites for Units & Buildings

**Date:** 2026-05-24
**Slice:** S4b (Phase 2 — Resources Matter)
**Depends on:** S4a (resource tracking + `getCivAvailableResources` stable)
**Parent roadmap:** `docs/superpowers/specs/2026-05-20-marketplace-trade-roadmap.md`
**Next slice:** S5 (first trade unit)

---

## 1. Overview

S4a gave strategic resources passive yield or happiness effects. S4b makes them **prerequisites**: certain units and buildings require both the enabling tech **and** the corresponding strategic resource to build. A civ without the resource can see the item in a locked section of the city panel but cannot queue it.

S4b also performs a **historical unit/building audit**: the existing roster is thin (no cavalry, no siege, gaps in melee progression). New units and buildings are added in this slice to fill era-appropriate gaps, with resource gating where historically and gameplay-appropriate.

**Guard principle:** every era must always offer at least one buildable offensive unit and one defensive unit with **no resource gate**, so resource-poor starts are never dead-ends.

---

## 2. Resource gate data model

### 2.1 `TrainableUnitEntry` extension (`src/core/types.ts`)

Add an optional field to the `TrainableUnitEntry` interface (line ~677):

```ts
resourceRequired?: ResourceType[];  // all resources must be available; empty/absent = ungated
```

This mirrors `techRequired`. The check is conjunctive: **all** listed resources must be in `getCivAvailableResources(state, civId)`.

### 2.2 `Building` interface extension (`src/core/types.ts`)

`Building` is defined in `src/core/types.ts` (line ~297), **not** in `city-system.ts`. Add the same optional field there:

```ts
resourceRequired?: ResourceType[];
```

### 2.3 `UnitType` union extension (`src/core/types.ts`)

Add all 8 new unit type literals to the `UnitType` union (line ~232):

```ts
export type UnitType =
  | 'settler' | 'worker' | 'scout' | 'warrior' | 'archer'
  | 'swordsman' | 'pikeman' | 'musketeer' | 'galley' | 'trireme'
  | 'axeman' | 'spearman' | 'horseman' | 'cavalry' | 'knight'
  | 'crossbowman' | 'catapult' | 'ballista'
  | 'spy_scout' | 'spy_informant' | 'spy_agent' | 'spy_operative' | 'spy_hacker'
  | 'scout_hound' | 'shadow_warden' | 'war_hound';
```

### 2.4 Filter function changes

**`getTrainableUnitsForCiv`** (`src/systems/city-system.ts`) gains a third parameter:

```ts
function getTrainableUnitsForCiv(
  completedTechs: string[],
  civType?: string,
  availableResources?: Set<ResourceType>,
): TrainableUnitEntry[]
```

If `availableResources` is provided, any entry with `resourceRequired` is filtered out unless all listed resources are present. When omitted (backwards-compat), resource filtering is skipped.

**`getAvailableBuildings`** gains the same optional `availableResources: Set<ResourceType>` parameter with identical semantics.

### 2.5 `processCity` dequeue extension

The existing tech-drop dequeue in `processCity` is extended to also drop queued items whose `resourceRequired` entries are not all met. This means:

- Pillaged Mine → iron gone → Swordsman in queue dequeued same turn.
- Re-acquiring the resource allows re-queuing.

`processCity` receives a new `availableResources: Set<ResourceType>` parameter (optional, defaults to empty set for backward-compat). The caller in `turn-manager.ts` must supply it.

### 2.6 Building discount stacking

Multiple discount-granting buildings (Armory, War Academy, Cavalry Academy, Siege Workshop) can coexist in a city. **Discounts do not stack** — the largest applicable discount wins for a given unit type. This matches the Safehouse pattern (single highest-discount applies). `applyProductionBonus` in `city-system.ts` is extended to implement this.

### 2.7 Save compatibility

No new `GameState` fields. `resourceRequired` is read-only catalogue data — old saves carry no trace of it and see the gate applied on load. No migration needed.

---

## 3. New units

All new units require the full 6-point end-to-end wiring per `.claude/rules/end-to-end-wiring.md`:
1. `TRAINABLE_UNITS` entry in `city-system.ts`
2. `UNIT_DEFINITIONS` + `UNIT_DESCRIPTIONS` in `unit-system.ts`
3. `PRODUCTION_ICONS` entry in `city-system.ts`
4. SVG sprite + catalog entry in `sprite-catalog.ts` (see §3.5)
5. `turn-manager.ts` production side-effects (none for these types — no special state)
6. AI usage in `basic-ai.ts`

No new unit type in this slice has spy-style or settler-style special state, so `main.ts` death cleanup and `turn-manager.ts` state bootstrap are no-ops (same as Warrior).

### 3.1 Complete new unit table

| Unit | Tech | Resource(s) | Cost | Strength | Move | Vision | Attack profile | Notes |
|------|------|-------------|------|----------|------|--------|----------------|-------|
| Axeman | stone-weapons | copper | 22 | 18 | 2 | 2 | melee | Early powerful melee; obsoletedByTech: fortification |
| Spearman | bronze-working | — | 32 | 20 | 2 | 2 | melee | Basic anti-cavalry polearm; obsoletedByTech: fortification |
| Horseman | horseback-riding | horses | 55 | 25 | 3 | 2 | melee | Basic cavalry; **no obsoletedByTech** (see §3.3) |
| Cavalry | horseback-riding | horses + iron | 85 | 35 | 3 | 2 | melee | Powerful mounted; **no obsoletedByTech** (see §3.3) |
| Knight | iron-forging | horses + iron | 115 | 45 | 3 | 2 | melee | Heavy cavalry; supersedes Horseman + Cavalry by stats |
| Crossbowman | tactics | copper | 75 | 30 | 2 | 3 | ranged | Precision ranged; range 2; targets units only |
| Catapult | siege-warfare | stone | 110 | 20 | 1 | 2 | bombard | Anti-city; range 2; targets cities + units; move 1 (slow) |
| Ballista | siege-warfare | iron | 100 | 25 | 2 | 3 | ranged | Anti-unit precision; range 3; targets units only |

**Strength ladder context:** Warrior 10 → Archer 15 → Axeman 18 → Spearman/Swordsman 20/25 → Horseman/Cavalry 25/35 → Pikeman 35 → Knight/Crossbowman 45/30 → Musketeer 50. Balance tests must verify these ratios produce 2–4 exchange combat between same-era units.

### 3.2 Existing unit re-gate

**Swordsman** already exists (`techRequired: 'bronze-working'`). Add `resourceRequired: ['iron']`. No stat changes.

### 3.3 Obsolescence — cavalry line

`obsoletedByTech` on Horseman and Cavalry would create a gameplay dead-end: a civ with `iron-forging + horses` but no iron loses both units and cannot train Knight (which also needs iron). Therefore:

- **Horseman and Cavalry have NO `obsoletedByTech`** — they remain in the trainable list indefinitely.
- Knight's superior stats (strength 45 vs 25/35) mean players naturally prefer it when available.
- Axeman and Spearman both use `obsoletedByTech: fortification`. By that point (era 3), Swordsman and Pikeman are better options on all paths.

### 3.4 Attack profiles — complete values

All `attackProfile` values must use exact enum literals from `UnitAttackProfile.kind`:

| Unit | kind | range | targets |
|------|------|-------|---------|
| Axeman, Spearman, Horseman, Cavalry, Knight | `'melee'` | 1 | `['unit']` |
| Crossbowman | `'ranged'` | 2 | `['unit']` |
| Catapult | `'bombard'` | 2 | `['unit', 'city']` |
| Ballista | `'ranged'` | 3 | `['unit']` |

Melee units have no `attackProfile` property (same as Warrior/Swordsman — melee is the implicit default in `combat-system.ts`).

### 3.5 Sprites and motion — required for all 8 new units

The sprite catalog test (`tests/renderer/sprites/sprite-catalog.test.ts`) enforces that every `UnitType` has an entry in `UNIT_SPRITE_CATALOG`. This test **will fail** without adding sprites for all 8 new units. Follow the extension recipe from `.claude/rules/sprites.md`:

1. Design the SVG sprite in Claude Design; export as a JSX component.
2. Add the exported component to `src/renderer/sprites/units.tsx`.
3. Register it in `sprite-catalog.ts` via `withMotion(type, FooSprite)`.
4. Add the motion style to `UNIT_MOTION_STYLES`:

| Unit | Motion style |
|------|-------------|
| Axeman | `'humanoid'` |
| Spearman | `'humanoid'` |
| Horseman | `'animal'` (quadruped gait — same as `scout_hound`) |
| Cavalry | `'animal'` |
| Knight | `'animal'` |
| Crossbowman | `'humanoid'` |
| Catapult | `'animal'` (static siege engine — treated as slow-moving object; if a dedicated `'siege'` motion style is added, use that instead) |
| Ballista | `'animal'` (same fallback as Catapult until a siege motion style exists) |

**Visual direction for sprites:**
- Axeman: Bronze-era warrior with a copper-headed axe; shorter than Swordsman; more primitive armour
- Spearman: Classical foot soldier with long spear and round shield; lighter build than Pikeman
- Horseman: Lightly-armoured rider on a horse; no heavy plate; faster, more mobile look than Knight
- Cavalry: Chain-mail armoured rider; heavier mount; visible iron sword at hip
- Knight: Full plate armour; lance or sword; heraldic shield element showing civ palette
- Crossbowman: Cloaked figure with a mechanical crossbow; aiming pose
- Catapult: Wooden torsion frame with a stone cup; crew of 2 figures visible
- Ballista: Iron bolt-shooter on a rotating mount; single operator

Fallback (emoji) icons in `PRODUCTION_ICONS` for the build queue (used when sprite is not available at current zoom):

| Unit | Emoji |
|------|-------|
| Axeman | 🪓 |
| Spearman | 🗼 |
| Horseman | 🏇 |
| Cavalry | 🐎 |
| Knight | ♞ |
| Crossbowman | 🎯 |
| Catapult | 🪨 |
| Ballista | 🏹 (distinct from Archer's 🏹 — Ballista renders at LOD; at full zoom the sprite distinguishes them) |

*Note:* if Archer and Ballista sharing 🏹 in the queue creates confusion at low zoom, change Ballista to ⟶ or 🔩 during implementation.

---

## 4. New buildings

All new buildings follow the existing `Building` shape with `resourceRequired` added. They are added to `BUILDINGS` in `city-system.ts`, to `PRODUCTION_ICONS`, and require SVG sprites in `BUILDING_SPRITE_CATALOG` (see §4.3).

### 4.1 Complete new building table

| Building | Tech | Resource | Category | Yields | Cost | Effect |
|----------|------|----------|----------|--------|------|--------|
| Bronze Workshop | stone-weapons | copper | production | +1 prod, +1 sci | 30 | Copper-tool crafting |
| Armory | stone-weapons | copper | military | — | 40 | 15% cost reduction for melee/ranged units (this city only) |
| Ranch | animal-husbandry | horses | food | +2 food | 35 | Pasture and breeding grounds |
| Cavalry Academy | horseback-riding | horses | military | — | 55 | 15% cost reduction for cavalry-type units |
| Iron Foundry | iron-forging | iron | production | +3 prod | 80 | Advanced smelting; stacks with Forge (+6 total in iron cities) |
| War Academy | iron-forging | iron | military | — | 70 | 15% cost reduction for all melee and ranged units |
| Masonry Works | state-workforce | stone | production | +2 prod | 50 | Quarried stone speeds construction; Walls 20% cheaper |
| Siege Workshop | siege-warfare | stone | military | — | 90 | 20% cost reduction for siege units (Catapult, Ballista) |

**Cavalry unit types** (for Cavalry Academy discount): Horseman, Cavalry, Knight.

**Melee/ranged unit types** (for Armory and War Academy discount): Warrior, Axeman, Spearman, Swordsman, Pikeman, Musketeer, Archer, Crossbowman.

**Discount stacking (§2.6):** A Swordsman in a city with both Armory and War Academy gets a 15% discount (the larger of the two matching discounts), **not** 30%.

**Iron Foundry + Forge stacking:** These are different buildings unlocked at different techs. A city with both earns +3 + +3 = +6 production/turn. This is intentional — iron-rich cities become industrial hubs. The implementer should note this in the building description ("Pairs with Forge for +6 total").

### 4.2 Tech tree description update required

`horseback-riding` in `tech-definitions.ts` currently says `unlocks: ['Unlock Stable, mounted units']`. Since Horseman now requires the horses resource, this description must be updated to: `'Unlock Stable; Horseman (requires Horses resource)'`.

Similarly for other new units, verify the unlocking tech's `unlocks` description array reflects the resource requirement.

### 4.3 Building sprites — required for all 8 new buildings

The sprite catalog test enforces every key in `BUILDINGS` has an entry in `BUILDING_SPRITE_CATALOG`. Follow `.claude/rules/sprites.md`:

1. Design and export each building SVG sprite.
2. Add to `src/renderer/sprites/buildings.tsx`.
3. Register in `sprite-catalog.ts` `BUILDING_SPRITE_CATALOG`.

**Visual direction:**
- Bronze Workshop: A small forge-like structure with copper pipes/tools visible; glowing element
- Armory: Stone building with weapons rack silhouette on the wall; shields and swords
- Ranch: Fenced pasture with a horse silhouette; wooden gate
- Cavalry Academy: Circular training ring with horse and rider mid-drill; distinctive pennant
- Iron Foundry: Larger industrial forge; billowing smoke; iron chains/gears
- War Academy: Stone institution with training dummies; crossed swords above entrance
- Masonry Works: Cut-stone blocks on a platform; chisels and scaffolding
- Siege Workshop: Workshop with catapult arm visible through the open door; stone pile outside

**Emoji fallbacks for `PRODUCTION_ICONS`:**

| Building | Emoji |
|----------|-------|
| Bronze Workshop | 🔧 |
| Armory | 🛡️ |
| Ranch | 🐄 |
| Cavalry Academy | 🎠 |
| Iron Foundry | 🏭 |
| War Academy | 🏋️ |
| Masonry Works | 🧱 |
| Siege Workshop | 🪚 |

*Note:* check for emoji conflicts with existing PRODUCTION_ICONS — Cattle resource uses 🐄 but Ranch as a building shares the emoji. If this causes visual confusion in the build queue, change Ranch to 🌾 during implementation.

### 4.4 Existing buildings — no changes

No existing building gets a new resource requirement. The guard principle (basic buildings always buildable) is preserved.

---

## 5. City panel lock UI

### 5.1 Trigger condition

A unit **or building** appears in the **locked section** when:
- Its `techRequired` is met (player has the tech), AND
- Its `resourceRequired` is NOT fully met (one or more resources missing)

Items where the tech is also unmet stay invisible — not shown at all. Only tech-met, resource-blocked items surface in the locked section.

### 5.2 Visual design

The locked section appears below the trainable units/buildings lists in the build list tab. Header: `🔒 Locked — missing resources`. Each item:

- Background: `rgba(255,255,255,0.04)` (dimmer than trainable items)
- Text opacity: ~50%
- Leading lock emoji: `🔒`
- Name line: `🔒 Swordsman` (unit icon, name)
- Reason line: `Requires Iron — build a Mine on an Iron tile`

**Multi-resource items** (Cavalry, Knight) list all missing resources with individual hints:
```
Requires Horses (Pasture on Horses tile) and Iron (Mine on Iron tile)
```

The "how to get it" hints derive from `RESOURCE_DEFINITIONS[resource].requiredImprovement`:
- `mine` → `Mine on a [Resource] tile`
- `pasture` → `Pasture on a [Resource] tile`
- `quarry` → `Quarry on a [Resource] tile`
- `plantation` → `Plantation on a [Resource] tile`
- City-center exception: omit the improvement hint if the resource is city-center accessible

All text rendered via `textContent`/`createTextNode()` — never `innerHTML` with game strings.

### 5.3 Collapsing behaviour

If more than 3 items are locked, show the first 3 and a **`Show X more` button** constructed with `createGameButton('Show X more locked', 'secondary')` from `src/ui/ui-kit.ts`. The button expands the section in-place. This avoids the locked section overwhelming the city panel in early game when most advanced units are unavailable.

### 5.4 No click action on locked items

Locked items are non-interactive — no click handler, no `cursor: pointer`. The explanatory text is the only feedback.

### 5.5 Panel refresh after resource acquisition

When the player builds a Mine and acquires iron, the **next** city panel open must show Swordsman in the trainable section, not the locked section. Panel refresh is handled naturally (city panel re-creates from current state on each open). No special incremental update is needed.

---

## 6. AI parity

### 6.1 Production selection — resource gate

`basic-ai.ts` must compute `getCivAvailableResources(state, civId)` before building the production candidate list, then pass it to both `getTrainableUnitsForCiv` and `getAvailableBuildings`. This ensures the AI never queues a resource-blocked item.

### 6.2 AI production list — expand from hardcoded to derived

The current hardcoded `availableItems = ['warrior', 'scout', 'granary', 'settler']` in `basic-ai.ts` misses swordsman, pikeman, archer, and all new units. Replace this with a derived list from `getTrainableUnitsForCiv(completedTechs, civType, availableResources)` filtered through personality weights. This is both a correctness requirement for S4b and a general fix for the existing AI unit-selection gap.

### 6.3 Dequeue (passive)

`processCity` dequeues resource-blocked items automatically for AI cities via the turn manager loop. No separate AI code path is needed.

---

## 7. Test matrix

### 7.1 Resource gate conjunctions (spec-fidelity — applies to EVERY gated unit and building)

For each resource-gated entry, at minimum:
1. `tech=met, resource=missing` → not returned by `getTrainableUnitsForCiv` / `getAvailableBuildings`
2. `tech=missing, resource=present` → not returned (tech gate independent)
3. `tech=met, resource=met` → appears in list (positive)

For **multi-resource items** (Cavalry: horses + iron; Knight: horses + iron):
4. `tech + horses, no iron` → blocked
5. `tech + iron, no horses` → blocked
6. `tech + horses + iron` → trainable

### 7.2 City panel lock section (covers both units and buildings)

7. Tech met + resource missing (unit) → unit appears in locked section with resource name and acquisition hint
8. Tech met + resource missing (building) → building appears in locked section
9. Tech met + resource met → item in trainable list, absent from locked section
10. Tech missing → item absent from both sections
11. Multi-resource: shows all missing resources with individual acquisition hints
12. Locked section has > 3 items → only 3 shown; `Show X more` button present
13. Locked section has ≤ 3 items → no `Show X more` button

### 7.3 `processCity` dequeue

14. Item queued, resource subsequently removed → dequeued same turn (regression: no zombie production)
15. Item queued, resource present throughout → not dequeued
16. (Regression) Tech-drop dequeue still works for existing tech-gated units

### 7.4 AI parity

17. AI civ with tech + resource → queues the gated unit (positive)
18. AI civ with tech, no resource → never queues resource-blocked unit
19. AI civ loses resource mid-game → `processCity` dequeues it

### 7.5 Combat stats and balance

20. Same-era unit battles resolve in 2–4 exchanges (statistical sampling with seeded RNG — e.g., Axeman vs Axeman, Spearman vs Warrior, Horseman vs Horseman)
21. Strength ladder is monotonically non-decreasing across eras for each role

### 7.6 Guard principle regression

22. `getTrainableUnitsForCiv([], undefined, new Set())` returns at minimum Warrior (always available regardless of era) — demonstrates ungated era 1 baseline
23. Era 2 techs + no resources → Spearman still trainable (ungated era 2 melee check)

### 7.7 Icon and sprite coverage

24. All new unit types have entries in `PRODUCTION_ICONS` (existing icon-coverage test catches this)
25. All new building IDs have entries in `PRODUCTION_ICONS`
26. All new unit types have entries in `UNIT_SPRITE_CATALOG` (sprite-catalog test)
27. All new building IDs have entries in `BUILDING_SPRITE_CATALOG` (sprite-catalog test)
28. All new unit types have entries in `UNIT_MOTION_STYLES`

### 7.8 UNIT_DEFINITIONS completeness

29. Every new `UnitType` value has an entry in `UNIT_DEFINITIONS` and `UNIT_DESCRIPTIONS` (TypeScript exhaustiveness enforces this, but add an explicit test)

---

## 8. Files affected

| File | Change |
|------|--------|
| `src/core/types.ts` | Add `resourceRequired?: ResourceType[]` to `Building` and `TrainableUnitEntry`; extend `UnitType` union with 8 new literals |
| `src/systems/city-system.ts` | Add 8 new buildings to `BUILDINGS` with `resourceRequired`; add 9 unit entries (8 new + swordsman re-gate) to `TRAINABLE_UNITS`; add 16 entries to `PRODUCTION_ICONS`; update `getTrainableUnitsForCiv` and `getAvailableBuildings` to accept + filter `availableResources`; extend `applyProductionBonus` for new military building discounts (non-stacking) |
| `src/systems/unit-system.ts` | Add `UNIT_DEFINITIONS` (strength, movementPoints, visionRange, attackProfile) + `UNIT_DESCRIPTIONS` for all 8 new unit types |
| `src/core/turn-manager.ts` | Pass `availableResources` to `processCity`; extend resource-dequeue logic |
| `src/systems/tech-definitions.ts` | Update `horseback-riding` (and other affected techs) `unlocks` description to reflect resource requirements |
| `src/renderer/sprites/units.tsx` | Add 8 new SVG sprite components |
| `src/renderer/sprites/buildings.tsx` | Add 8 new SVG sprite components |
| `src/renderer/sprites/sprite-catalog.ts` | Add 8 unit entries to `UNIT_SPRITE_CATALOG`; add 8 building entries to `BUILDING_SPRITE_CATALOG`; add 8 entries to `UNIT_MOTION_STYLES` |
| `src/renderer/unit-renderer.ts` | Emoji fallback icons automatically covered via `PRODUCTION_ICONS` — verify unit-renderer icon path still works |
| `src/ai/basic-ai.ts` | Compute `getCivAvailableResources` before production selection; pass to filter functions; replace hardcoded `availableItems` with derived list |
| `src/ui/city-panel.ts` | Add locked-section rendering (tech-met + resource-blocked items) with reason text, multi-resource hints, collapse affordance via `createGameButton()` |
| `tests/systems/city-system.test.ts` | Tests per §7.1, §7.3, §7.5, §7.6 |
| `tests/ui/city-panel.test.ts` | Tests per §7.2 |
| `tests/ai/basic-ai.test.ts` | Tests per §7.4 |
| `tests/renderer/sprites/sprite-catalog.test.ts` | Tests per §7.7 (existing test catches new entries automatically) |

---

## 9. Out of scope for S4b

- Catapult splash/area damage (Catapult uses standard `bombard` profile; splash requires `combat-system.ts` extension — file a follow-up issue with notes on the desired splash radius and damage reduction formula)
- Cavalry movement bonus (mounted units moving faster in open terrain — future slice)
- Resource trading (S8/S9)
- Unit upgrade paths between new tiers (after S5)
- A dedicated `'siege'` motion style for Catapult/Ballista (treated as `'animal'` for now)

---

## 10. Locked-in decisions from this brainstorm

| Decision | Choice |
|----------|--------|
| Gate field location | `resourceRequired: ResourceType[]` on `Building` and `TrainableUnitEntry` in `types.ts`; NOT a `prerequisiteFor` field on the resource definition |
| Cavalry tier | Horseman (horseback-riding + horses); Cavalry (horseback-riding + horses + iron); Knight (iron-forging + horses + iron). No `obsoletedByTech` on Horseman/Cavalry to avoid dead-ends |
| Siege | Catapult (siege-warfare + stone, bombard) + Ballista (siege-warfare + iron, ranged). Both era 4 |
| Copper gates | Axeman (early melee unit) + Crossbowman (late ranged unit) + Bronze Workshop + Armory (buildings) |
| Discount stacking | Non-stacking — highest applicable discount wins per unit type per city |
| Lock UI | Separate grayed-out section below trainable list; collapsed beyond 3 via `createGameButton()`; multi-resource shows all acquisition hints; tech-missing items hidden entirely |
| AI production list | Derived from `getTrainableUnitsForCiv` + `getAvailableBuildings`, replacing the hardcoded list |
| Resource loss dequeue | Yes — same turn as the resource is lost (consistent with tech-drop dequeue) |
| Sprites required | Yes — all 8 units + all 8 buildings require SVG sprites per `sprites.md` recipe; sprite catalog test enforces this |
