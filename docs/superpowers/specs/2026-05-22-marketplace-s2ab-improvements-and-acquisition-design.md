# S2a + S2b — Resource Improvements & Acquisition Model — Design Spec

**Roadmap slices:** S2a and S2b of `2026-05-20-marketplace-trade-roadmap.md`
**Origin:** GitHub issue [#234](https://github.com/a1flecke/conquestoria/issues/234)
**Value shipped:** Workers can build resource-harvesting improvements on tiles; owning a resource is now a real, enforceable condition (tech + improvement, or tech alone on a city-center tile); the marketplace panel and inspection UI reflect actual ownership rather than raw tile counts. Expands the resource catalog from 10 to 16 entries.

---

## Locked decisions

| Decision | Choice |
|---|---|
| Acquisition gate | tech known **AND** required improvement built (improvementTurnsLeft === 0), except city-center tiles which need tech only |
| Building required for acquisition | **None** — building interactions are deferred to S4a |
| New resources | gold, silver, furs, cattle, sheep, salt — 6 additions, total 16 |
| Cattle reveal tech | domestication (era 1) — cattle domestication predates horses by millennia |
| S2a + S2b delivery | Single PR — S2b's acquisition helper is useless without S2a's improvements; combining avoids dead-end UX |
| Improvement tech gate | New improvements have `requiredTech: null` (consistent with existing farm/mine) — the resource tech gates acquisition, not the improvement build |
| Quarry (improvement) vs quarry-building | Distinct — quarry is a tile improvement for harvesting stone; quarry-building is an existing city building for production |
| Ranch dead-promise | `livestock-breeding` tech currently unlocks "Ranch" but no Ranch building exists — flag in spec, implement in S4a |

---

## Expanded resource catalog — all 16

| Resource | Type | Terrain | Improvement | Reveal tech (era) | Icon | Base price |
|---|---|---|---|---|---|---|
| silk | luxury | grassland | plantation | irrigation (2) | 🧵 | 8 |
| wine | luxury | plains | plantation | pottery (1) | 🍇 | 7 |
| spices | luxury | jungle | plantation | cartography (2) | 🌶️ | 10 |
| gems | luxury | hills | mine | mining-tech (3) | 💎 | 12 |
| ivory | luxury | forest | camp | foraging (1) | 🐘 | 9 |
| incense | luxury | desert | plantation | currency (3) | 🕯️ | 6 |
| copper | strategic | hills | mine | stone-weapons (1) | 🪙 | 5 |
| iron | strategic | hills | mine | bronze-working (2) | ⚙️ | 8 |
| horses | strategic | plains | pasture | animal-husbandry (2) | 🐎 | 7 |
| stone | strategic | mountain | quarry | gathering (1) | 🪨 | 4 |
| **gold** | **luxury** | **hills** | **mine** | **currency (3)** | **⭐** | **15** |
| **silver** | **luxury** | **hills** | **mine** | **mining-tech (3)** | **🥈** | **11** |
| **furs** | **luxury** | **forest, tundra** | **camp** | **foraging (1)** | **🦊** | **9** |
| **cattle** | **strategic** | **grassland, plains** | **pasture** | **domestication (1)** | **🐄** | **5** |
| **sheep** | **luxury** | **hills, plains** | **pasture** | **animal-husbandry (2)** | **🐑** | **7** |
| **salt** | **strategic** | **hills** | **mine** | **pottery (1)** | **🧂** | **5** |

Historical notes:
- **Incense → plantation on desert**: frankincense/myrrh trees are cultivated in arid Arabia and the Horn of Africa; Civ V and VI both use plantation here.
- **Salt → hills with mine**: major traded salt deposits (Wieliczka, Hallstatt, Khewra) are in hill/mountain terrain.
- **Furs → forest + tundra**: the Siberian and North American fur trades ran through boreal and tundra regions; tundra terrain exists in the game.
- **Cattle → domestication (era 1)**: cattle taming (~8000 BCE) predates horse domestication by millennia; domestication already says "Animal pens" in its unlocks.

---

## Four new improvement types

### plantation

| Field | Value |
|---|---|
| Valid terrains | grassland, plains, jungle, desert |
| Build turns | 4 |
| Yield bonus | +1 food, +1 gold |
| Hex icon | 🌿 |
| requiredTech | null |
| Covers | silk, wine, spices, incense |

Plantation overlaps with farm on some terrains. That is intentional — a player can choose farm (pure food) or plantation (food + trade value) on the same tile. Plantation is only meaningful where a resource tile exists.

### pasture

| Field | Value |
|---|---|
| Valid terrains | grassland, plains, hills |
| Build turns | 3 |
| Yield bonus | +1 food |
| Hex icon | 🌾 |
| requiredTech | null |
| Covers | horses, cattle, sheep |

### camp

| Field | Value |
|---|---|
| Valid terrains | forest, tundra |
| Build turns | 3 |
| Yield bonus | +1 food |
| Hex icon | ⛺ |
| requiredTech | null |
| Covers | ivory, furs |

### quarry *(improvement — distinct from quarry-building city building)*

| Field | Value |
|---|---|
| Valid terrains | mountain |
| Build turns | 5 |
| Yield bonus | +1 production |
| Hex icon | ⛏️ |
| requiredTech | null |
| Covers | stone |

---

## Map generation — placing the 6 new resources

The map generators (`map-generator.ts`, `balanced-map-generator.ts`, `continent-map-generator.ts`) must place the new resources on matching terrain tiles. Without this, new resources never appear on any map and the entire system is dead.

**Placement rules** (terrain from resource catalog table above):

| Resource | Valid spawn terrain(s) | Category |
|---|---|---|
| gold | hills | luxury |
| silver | hills | luxury |
| furs | forest, tundra | luxury |
| cattle | grassland, plains | strategic |
| sheep | hills, plains | luxury |
| salt | hills | strategic |

Follow the existing resource-placement pattern in each map generator (scan tiles of matching terrain, place with a seeded-RNG probability or balanced quota). Seeded RNG only — never `Math.random()`.

**Placement density**: use the same probability/quota as existing resources on the same terrain type (e.g., hills already has gems/copper/iron — add gold/silver/salt at the same per-tile rate so they appear with similar frequency). The balanced map generator may need its resource quota adjusted to accommodate the larger catalog.

---

## S2a — data model and improvement wiring (end-to-end)

### `types.ts`

Extend `ImprovementType`:
```
'farm' | 'mine' | 'lumber_camp' | 'watermill' | 'plantation' | 'pasture' | 'camp' | 'quarry' | 'none'
```

Extend `LuxuryResource` and `StrategicResource`:
```ts
export type LuxuryResource = 'silk' | 'wine' | 'spices' | 'gems' | 'ivory' | 'incense'
  | 'gold' | 'silver' | 'furs' | 'sheep';
export type StrategicResource = 'copper' | 'iron' | 'horses' | 'stone' | 'cattle' | 'salt';
```

### `trade-system.ts`

Add `requiredImprovement: ImprovementType` field to `ResourceDefinition`. Populate for all 16 resources per the table above. Also add 6 new `RESOURCE_DEFINITIONS` entries with all fields (id, name, type, terrain, basePrice, tech, icon, requiredImprovement).

Export `RESOURCE_ICONS` and `RESOURCE_TECH` maps updated for the 6 new entries.

### `improvement-system.ts`

Add four new entries to `IMPROVEMENT_DEFINITIONS` (plantation, pasture, camp, quarry) per the spec tables above. Add to `IMPROVEMENT_BUILD_TURNS` record.

### `worker-action-system.ts`

New improvements are `BuildableImprovementType` entries — they inherit the existing `applyWorkerAction` path automatically. No logic changes needed; the `IMPROVEMENT_DEFINITIONS.validTerrains` check handles terrain gating.

### `hex-renderer.ts`

Add improvement icons for the four new types alongside the existing improvement-icon rendering. Use the same draw pattern as existing improvements (centered on tile, full size).

Add 6 new resource icons to the resource-rendering path (same pattern as S1's 10 icons): ⭐ gold, 🥈 silver, 🦊 furs, 🐄 cattle, 🐑 sheep, 🧂 salt.

### `resource-system.ts` (yield contributions)

Apply new improvement yield bonuses in city tile-yield calculation alongside existing farm/mine/lumber_camp/watermill yields.

### Tech `unlocks` arrays (`tech-definitions.ts`)

Add "Reveal X resource" lines to the relevant techs:
- domestication: add "Reveal Cattle resource"
- pottery: add "Reveal Salt resource"
- animal-husbandry: add "Reveal Sheep resource"
- foraging: add "Reveal Furs resource"
- currency: add "Reveal Gold resource" *(incense already here)*
- mining-tech: add "Reveal Silver resource" *(gems already here)*

### Save migration

`ImprovementType` is stored in `tile.improvement`. Old saves will have values from the old union only — no existing tile will have a new improvement value, so old saves load safely with no migration needed for improvement types.

`ResourceType` is stored in `tile.resource`. Old saves will not have new resource values on tiles — map generation adds resources at game creation, not migration. New resource types will only appear on maps generated after S2a ships. No migration needed.

---

## S2b — acquisition model and inventory UI

### New file: `src/systems/resource-acquisition-system.ts`

```ts
export function getCivAvailableResources(
  state: GameState,
  civId: string,
): Set<ResourceType>
```

Logic (per roadmap requirements 4 + 5):
1. Gather all cities owned by `civId`.
2. For each city, iterate its `ownedTiles`.
3. For each tile: if `tile.resource` is set, look up its `RESOURCE_DEFINITIONS` entry.
4. **City-center tile**: if `hexKey(tile.coord) === hexKey(city.position)` → resource available if `completedTechs` includes the resource's `tech` field.
5. **Non-city-center tile**: resource available if `completedTechs` includes `tech` AND `tile.improvement === def.requiredImprovement` AND `tile.improvementTurnsLeft === 0`.
6. Never use `cities[0]` — iterate all cities in the civ.

### `marketplace-panel.ts`

- Replace `countPlayerResources` call with `getCivAvailableResources(state, state.currentPlayer)`.
- Filter displayed resources to those whose `tech` the current player has completed (req. 2 — deferred to S3 per roadmap, but acquisition count uses the new helper now).
- "You own" display: change from a numeric count to a binary badge — **"✓ Owned"** or **"✗ Not available"**. The old `countPlayerResources` returned raw tile counts (e.g. "3") which were misleading; having three iron tiles confers no extra benefit over one. The new acquisition model is boolean: you have the resource type or you don't.

### Territory / tile inspection panel

When a tile is inspected and it has a `resource`, show:
- Resource name + type (already in S1).
- Acquisition status line:
  - If player lacks the reveal tech: *(hidden — no resource shown, per S1 spec)*
  - If player has tech and tile is a city-center: "✓ Available — city tile, tech researched"
  - If player has tech and improvement is complete: "✓ Available — [ImprovementName] built"
  - If player has tech and improvement is in progress: "⏳ [ImprovementName] in progress ([N] turns)"
  - If player has tech and no improvement: "✗ Needs [ImprovementName] to harvest"
  - If player has tech and wrong improvement: "✗ Needs [ImprovementName] to harvest"

All dynamic text via `textContent` / `createTextNode()` — never `innerHTML` with game strings.

---

## Marketplace panel "Your Resources" section

Add a compact summary section above the price list:

```
Your Resources
Luxury (3): Silk, Wine, Furs
Strategic (2): Iron, Salt
```

Empty state: "No resources yet — build improvements on resource tiles."

Rendered with `textContent` only. Refreshes on panel open (panel is recreated each toggle).

---

## Colors and animation

No new colors or animations needed for S2a/S2b:
- Marketplace luxury/strategic type colors (`#d4a` / `#8af`) auto-apply to new resources by type.
- Hex resource icons are static emoji, same as S1.
- Improvement hex icons are static emoji.
- Sparklines already exist for all resources.

---

## Buildings to add in S4a (out of scope for S2a/S2b)

| Building | Tech gate | Resource prerequisite | Yield | Status |
|---|---|---|---|---|
| **Mint** | currency | gold OR silver in territory | +3 gold | New — does not exist |
| **Ranch** | livestock-breeding | cattle in territory | +2 food | Tech unlock exists; building does **not** — dead promise, fix in S4a |
| **Tannery** | foraging | furs OR ivory in territory | +2 gold | New — does not exist |

Existing building interactions (S4a scope, not S2a/S2b):
- Granary + salt → +1 food (preservation)
- Forge + iron/copper → +1 production bonus
- Stable + horses → unit XP or capacity bonus
- Quarry-building + stone → +1 production bonus

---

## Tests

### Catalog tests (`tests/systems/trade-system.test.ts`)

- All 16 resources have `icon`, `tech`, `requiredImprovement` set (non-empty strings).
- All 6 new resources appear in `RESOURCE_DEFINITIONS`.
- Each new `ImprovementType` has an entry in `IMPROVEMENT_DEFINITIONS`.

### Improvement terrain validity (`tests/systems/improvement-system.test.ts`)

For each new improvement, positive test (valid terrain accepts) and at least one negative test (invalid terrain blocks).

| Improvement | Valid terrain (positive) | Invalid terrain (negative) |
|---|---|---|
| plantation | grassland | hills |
| pasture | plains | jungle |
| camp | forest | plains |
| camp | tundra | hills |
| quarry | mountain | grassland |

### Acquisition model — spec-fidelity conjunctions (`tests/systems/resource-acquisition-system.test.ts`)

Per roadmap requirements 4 + 5 — all six:
1. tech without improvement → unavailable
2. improvement without tech → unavailable
3. tech + improvement (turnsLeft === 0) → available
4. tech + improvement in progress (turnsLeft > 0) → unavailable
5. city-center tile + tech only → available (no improvement needed)
6. city-center tile + no tech → unavailable
7. Multi-city coverage: resource on city-2's tile is counted (not cities[0] only)
8. furs on tundra tile + camp + foraging → available
9. cattle on grassland + pasture + domestication → available

### Marketplace panel (`tests/ui/marketplace-panel.test.ts`)

- "You own" count uses acquisition helper, not raw tile scan.
- Player with tech + completed improvement: owned count = 1.
- Player with tech but no improvement: owned count = 0.
- "Your Resources" section lists correctly owned resources.
- Empty state shown when no resources owned.

### Tech unlocks coverage

Verify domestication, pottery, animal-husbandry, foraging, currency, mining-tech all contain their new "Reveal X resource" lines.

---

## Out of scope (deferred to later slices)

- Filtering marketplace to only tech-known resources → S3
- Per-resource yield/happiness effects → S4a
- Strategic resource prerequisites for units/buildings → S4b
- Mint, Ranch, Tannery buildings → S4a
- Trade routes → S5
- Buy/sell/barter transactions → S8–S10
