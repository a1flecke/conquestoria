# S2a + S2b — Resource Improvements & Acquisition Model — Design Spec

**Roadmap slices:** S2a and S2b of `2026-05-20-marketplace-trade-roadmap.md`
**Origin:** GitHub issue [#234](https://github.com/a1flecke/conquestoria/issues/234)
**Value shipped:** Workers can build resource-harvesting improvements on tiles; owning a resource is now a real, enforceable condition (tech + improvement, or tech alone on a city-center tile); the marketplace panel and inspection UI reflect actual ownership rather than raw tile counts. Expands the resource catalog from 10 to 16 entries.

---

## Locked decisions

| Decision | Choice |
|---|---|
| Acquisition gate | tech known **AND** required improvement built (`improvementTurnsLeft === 0`), except city-center tiles which need tech only |
| Building required for acquisition | **None** — building interactions are deferred to S4a |
| New resources | gold, silver, furs, cattle, sheep, salt — 6 additions, total 16 |
| Cattle reveal tech | domestication (era 1) — cattle domestication predates horses by millennia |
| S2a + S2b delivery | Single PR — S2b's acquisition helper is useless without S2a's improvements; combining avoids dead-end UX |
| Improvement tech gate | New improvements have `requiredTech: null` (consistent with existing farm/mine) — the resource tech gates acquisition, not the improvement build |
| Quarry (improvement) vs quarry-building | Distinct — quarry is a tile improvement for harvesting stone (mountain terrain); quarry-building is an existing city building for production (state-workforce tech) |
| Ranch dead-promise | `livestock-breeding` tech currently unlocks "Ranch" but no Ranch building exists — flag in spec, implement in S4a |
| Stone terrain correction | Existing `trade-system.ts` has stone with `terrain: 'hills'` and map-generator places it on hills — **both must be corrected to `mountain`** in this slice so the quarry improvement can harvest it. Old saves retain stone on hills; those tiles show "✗ Needs Quarry to harvest" which is acceptable for old saves only. |
| `ResourceDefinition.terrain` field | Extended to `string \| string[]` to support multi-terrain resources (furs, cattle, sheep). The field is documentation; acquisition logic reads tile terrain via improvement `validTerrains`, not this field. |
| Fashion probability after expansion | Luxury count grows 6 → 10 (adding gold, silver, furs, sheep). The per-turn fashion trigger chance stays at 5% but any specific luxury's selection probability drops from 1/6 to 1/10. This is **intentional** — more luxury variety means no single resource dominates fashion. Accept without compensation. |
| Tech-filter (req. 2) | **S3 only** — marketplace panel in S2b does NOT filter rows by tech. That is S3's scope. S2b only replaces the ownership count with the acquisition helper. |
| Resource loss semantics | `getCivAvailableResources` is a pure function; losing a tile (via combat or cultural spread) automatically removes the resource from the returned set on the next call. No persistent inventory state is introduced in S2a/S2b, keeping loss implicit and correct. |
| Enemy-city-center tile | When a player captures a city whose center tile has a resource and the player has the enabling tech, `getCivAvailableResources` returns that resource — the city is now owned by the civ. This is intentional and rewards conquest. |

---

## Expanded resource catalog — all 16

`ResourceDefinition.terrain` is now `string | string[]`. Multi-terrain resources list all valid spawn terrains.

| Resource | Type | Terrain(s) | Improvement | Reveal tech (era) | Icon | Base price |
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
| stone | strategic | **mountain** *(corrected from hills)* | quarry | gathering (1) | 🪨 | 4 |
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
- **Stone → mountain**: quarrying is mountain work (Giza, Roman marble quarries). The existing code has stone on hills — correct it.

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

Plantation overlaps with farm on some terrains (grassland, plains, desert, jungle). That is intentional — a player can choose farm (pure food +2) or plantation (food +1, gold +1) on the same tile. Plantation is only meaningful where a resource tile exists, but the worker action UI cannot enforce this — it will offer plantation as an option on any valid terrain tile. This is acceptable friction; the tech-reveal system prevents plantation from being useful without the resource.

**Three-way collision on jungle tiles with ivory:** farm, plantation, and lumber_camp are all valid on jungle. The worker action menu will show all three. Only camp (not plantation) harvests ivory. The inspection panel's "✗ Needs Camp to harvest" message is the player's signal to build the right improvement. Do not suppress the other options from the menu — that is S3+ scope.

### pasture

| Field | Value |
|---|---|
| Valid terrains | grassland, plains, hills |
| Build turns | 3 |
| Yield bonus | +1 food |
| Hex icon | 🐂 |
| requiredTech | null |
| Covers | horses, cattle, sheep |

Icon is 🐂 (ox) — distinct from 🐄 (cattle resource icon), 🐎 (horses resource icon), and 🌾 (farm tile improvement icon which already uses that glyph in `hex-renderer.ts`).

### camp

| Field | Value |
|---|---|
| Valid terrains | forest, tundra |
| Build turns | 3 |
| Yield bonus | +1 food |
| Hex icon | ⛺ |
| requiredTech | null |
| Covers | ivory, furs |

**Forest-terrain mutation trap:** `worker-action-system.ts` line 154 mutates a forest or jungle tile to plains when a farm is built there. If a player builds a farm on a forest tile containing ivory or furs, the tile becomes plains — and camp is not valid on plains. The ivory/furs resource becomes permanently un-harvestable on that tile. This is an existing design tension made visible for the first time by S2a. **Do not attempt to fix in this slice.** The inspection panel's acquisition status will correctly show "✗ Needs Camp to harvest" on the mutated plains tile, giving the player feedback (though no remedy). Flag as a known limitation in the PR description.

### quarry *(tile improvement — distinct from quarry-building city building)*

| Field | Value |
|---|---|
| Valid terrains | mountain |
| Build turns | 5 |
| Yield bonus | +1 production |
| Hex icon | ⚒️ |
| requiredTech | null |
| Covers | stone |

Icon is ⚒️ (hammer-and-pick) — distinct from ⛏️ which is already used by `quarry-building` in `city-system.ts`. The quarry-building icon appears in the city panel; the quarry improvement icon appears on the hex map. They appear in different contexts but using the same glyph would still be confusing.

---

## Map generation — placing the 6 new resources

The map generators (`map-generator.ts`, `balanced-map-generator.ts`, `continent-map-generator.ts`) must place the new resources on matching terrain tiles. Without this, new resources never appear on any map.

### Stone terrain correction (affects all map generators)

The current `TERRAIN_RESOURCES` in `map-generator.ts` places stone on hills. This must be moved to mountain in this slice. Update every generator's stone placement to use mountain terrain, matching the corrected `ResourceDefinition.terrain` field.

### Placement rules for new resources

| Resource | Valid spawn terrain(s) | Category |
|---|---|---|
| gold | hills | luxury |
| silver | hills | luxury |
| furs | forest, tundra | luxury |
| cattle | grassland, plains | strategic |
| sheep | hills, plains | luxury |
| salt | hills | strategic |

Seeded RNG only — never `Math.random()`.

### TERRAIN_RESOURCES dual-maintenance risk

`map-generator.ts` uses a private `TERRAIN_RESOURCES: Record<string, string[]>` constant that maps terrain → resource list. This is a **second place** where terrain-resource mapping lives alongside `ResourceDefinition.terrain`. They must agree. Add a **catalog test** asserting that every resource in `RESOURCE_DEFINITIONS` appears in at least one `TERRAIN_RESOURCES` array in the base map generator. This catches divergence early.

Preferred long-term fix (if feasible within this slice): derive `TERRAIN_RESOURCES` from `RESOURCE_DEFINITIONS` rather than hardcoding it, eliminating the dual-maintenance surface entirely.

### LUXURY_RESOURCES hardcoded list in `balanced-map-generator.ts`

`balanced-map-generator.ts` contains a hardcoded constant:
```ts
const LUXURY_RESOURCES = ['silk', 'wine', 'spices', 'gems', 'ivory', 'incense'] as const;
```
This list drives hotspot placement and zone equalization. It **must be updated** to include gold, silver, furs, sheep — otherwise the new luxury resources are systematically under-placed (they only get the base random pass, not the hotspot/equalization passes). If this constant exists in other generators, update those too.

### Hills resource density

Hills currently hosts gems, copper, iron (3 resources at 15% per tile). After S2a, hills gains gold, silver, salt, sheep (7 resources total). At uniform 15% per tile, the probability that any hills tile has *some* resource rises to ≈ 1 − (0.85)^7 ≈ 69%. **Reduce the per-tile probability for hills resources to 8–10%** so density stays in the same range as before. Apply the reduction to all hill resources (existing and new) for consistency. The balanced map generator's quota system may handle this automatically — verify and adjust.

---

## S2a — data model and improvement wiring (end-to-end)

### `types.ts`

Extend `ImprovementType`:
```ts
'farm' | 'mine' | 'lumber_camp' | 'watermill' | 'plantation' | 'pasture' | 'camp' | 'quarry' | 'none'
```

Extend `LuxuryResource` and `StrategicResource`:
```ts
export type LuxuryResource = 'silk' | 'wine' | 'spices' | 'gems' | 'ivory' | 'incense'
  | 'gold' | 'silver' | 'furs' | 'sheep';
export type StrategicResource = 'copper' | 'iron' | 'horses' | 'stone' | 'cattle' | 'salt';
```

### `trade-system.ts`

Add `requiredImprovement: BuildableImprovementType` field to `ResourceDefinition`. Change `terrain` to `string | string[]`. Populate all 16 resources per the catalog table above. Add 6 new `RESOURCE_DEFINITIONS` entries. Update `RESOURCE_ICONS` and `RESOURCE_TECH` maps for the 6 new entries.

### `improvement-system.ts`

Add four new entries to `IMPROVEMENT_DEFINITIONS` (plantation, pasture, camp, quarry) per the spec tables above.

**Exhaustiveness requirement:** `IMPROVEMENT_BUILD_TURNS` is typed `Record<ImprovementType, number>`. TypeScript enforces exhaustiveness — the build will fail if the new union members are added to `ImprovementType` without simultaneously adding them to the `IMPROVEMENT_BUILD_TURNS` literal object. Extend the union and the record object **in the same edit**, not in separate commits.

### `worker-action-system.ts`

New improvements are `BuildableImprovementType` entries and inherit the existing `applyWorkerAction` path automatically. No logic changes needed; `IMPROVEMENT_DEFINITIONS.validTerrains` handles terrain gating.

### `hex-renderer.ts`

Add improvement icons for the four new types (🌿 plantation, 🐂 pasture, ⛺ camp, ⚒️ quarry) using the same draw pattern as existing improvements (centered on tile, full size).

In-progress improvements (non-zero `improvementTurnsLeft`) show the turn countdown only, same as existing improvements. No construction-state icon is introduced — this is a known limitation, not a regression.

Add 6 new resource icons to the resource-rendering path (same S1 pattern): ⭐ gold, 🥈 silver, 🦊 furs, 🐄 cattle, 🐑 sheep, 🧂 salt.

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

**Improvement types on tiles:** Old saves have `tile.improvement` values from the old union only. New improvement type strings will not appear on any tile in an old save. Old saves load safely — no migration needed.

**Resource types on tiles:** Old saves have `tile.resource` values from the old union only. New resources only appear on maps generated after S2a ships. Old saves load safely — no migration needed.

**`LastSeenTilePresentation.improvement`** (types.ts line 221) also stores `ImprovementType`. Same argument applies — old values remain valid union members. No migration needed.

**`MarketplaceState.prices` and `priceHistory`:** Old saves have these records with 10 keys (original resources). After S2a ships, `updatePrices` iterates all 16 `RESOURCE_DEFINITIONS` entries. Missing keys fall back to `?? def.basePrice` inside `updatePrices`, so new resources get priced correctly after the first turn without a migration step. This is safe but should be noted: **old saves will show sparklines starting from turn N (when S2a shipped), not from game start**. That is acceptable.

**`MarketplaceState.fashionable`** is typed `ResourceType | null`. An old save cannot contain a new resource ID in this field since it was written before those IDs existed. Loads safely.

---

## S2b — acquisition model and inventory UI

### New file: `src/systems/resource-acquisition-system.ts`

```ts
export function getCivAvailableResources(
  state: GameState,
  civId: string,
): Set<ResourceType>
```

**Logic** (per roadmap requirements 4 + 5):
1. Gather all cities owned by `civId` — iterate `state.civilizations[civId].cities`, look each up in `state.cities`. Never use `cities[0]` or any single-city shortcut.
2. For each city, iterate `city.ownedTiles` (territory tiles, not `workedTiles` — an unworked tile with a completed improvement still counts for acquisition).
3. For each coord in `ownedTiles`: look up `state.map.tiles[hexKey(coord)]`. If the tile has a `resource`, find its `RESOURCE_DEFINITIONS` entry.
4. **City-center tile**: if `hexKey(coord) === hexKey(city.position)` → resource available if `completedTechs` includes the resource's `tech` field. No improvement required.
5. **Non-city-center tile**: resource available if `completedTechs` includes `tech` AND `tile.improvement === def.requiredImprovement` AND `tile.improvementTurnsLeft === 0`.
6. **Return semantics**: the function returns the set of resource *types* where at least one qualifying tile exists. Finding one qualifying tile is sufficient — a second qualifying tile for the same resource type adds nothing. The model is boolean per resource type, not counted.

**Resource loss** is implicit: losing a tile (via combat, cultural spread, or city capture) means `getCivAvailableResources` no longer considers that tile on the next call. No persistent inventory field is needed. S4a effects should read from this function, not from cached state.

### `marketplace-panel.ts`

- Replace `countPlayerResources` with `getCivAvailableResources(state, state.currentPlayer)`.
- **Do not filter displayed resources by tech** — that is S3's scope. All 16 resources remain visible in the panel after S2b, same as before.
- "You own" display: change from a numeric count to a binary badge — **"✓ Owned"** or **"✗ Not available"**. The old numeric count (e.g. "3") was misleading; having three iron tiles confers no extra benefit over one. The new model is boolean per resource type.

### Territory / tile inspection panel

When a tile is inspected and the viewer has the resource's reveal tech, show the resource name + type (S1) plus an acquisition status line. The status line is determined as follows:

| Condition | Status line shown |
|---|---|
| No reveal tech | *(entire resource section hidden — per S1 spec)* |
| Has tech + tile is a city-center of the viewing civ | ✓ Available — city tile, tech researched |
| Has tech + improvement complete (`turnsLeft === 0`) | ✓ Available — [ImprovementName] built |
| Has tech + matching improvement in progress | ⏳ [ImprovementName] in progress ([N] turns) |
| Has tech + no improvement on tile | ✗ Needs [ImprovementName] to harvest |
| Has tech + wrong improvement on tile | ✗ Needs [ImprovementName] to harvest (note: existing improvements cannot be removed in this release — this is a known limitation, not a bug introduced by S2a) |
| Has tech + tile owned by another civ | [Resource name + type only] — Foreign territory |

The "Foreign territory" row shows the resource name and type but no ownership status line, since the viewer cannot build improvements there. This prevents misleading "✗ Needs Plantation" messages on tiles the player can never improve.

All dynamic text via `textContent` / `createTextNode()` — never `innerHTML` with game strings.

---

## Marketplace panel "Your Resources" section

Add a compact summary section **above the price list** using this exact structure:

```
Your Resources
Luxury (3): Silk, Wine, Furs
Strategic (2): Iron, Salt
```

If only one type has resources:

```
Your Resources
Luxury (1): Gold
Strategic (0): —
```

Empty state (no resources of either type):

```
Your Resources
None yet — research techs and build improvements to harvest resources.
```

The empty state names the two required steps (tech + improvement) rather than just "build improvements." Rendered with `textContent` only. Panel is recreated on each open (existing toggle behavior), so no explicit refresh needed.

---

## Colors and animation

No new colors or animations needed for S2a/S2b:
- Marketplace luxury/strategic type colors (`#d4a` / `#8af`) auto-apply to new resources by type.
- Hex resource icons are static emoji, same as S1.
- Improvement hex icons are static emoji.
- Sparklines exist for all resources; new resources will begin accumulating history from the turn S2a ships.

---

## Buildings to add in S4a (out of scope for S2a/S2b)

| Building | Tech gate | Resource prerequisite | Yield | Status |
|---|---|---|---|---|
| **Mint** | currency | gold OR silver in territory | +3 gold | New — does not exist |
| **Ranch** | livestock-breeding | cattle in territory | +2 food | Tech unlock exists; building does **not** — dead promise, fix in S4a |
| **Tannery** | foraging | furs OR ivory in territory | +2 gold | New — does not exist |

Existing building interactions (S4a scope, not S2a/S2b):
- Granary + salt → +1 food (preservation bonus)
- Forge + iron/copper → +1 production bonus
- Stable + horses → unit XP or capacity bonus
- Quarry-building + stone → +1 production bonus

---

## Tests

### Catalog tests (`tests/systems/trade-system.test.ts`)

- All 16 resources have `icon`, `tech`, `requiredImprovement` set (non-empty strings).
- All 16 resources appear in at least one terrain entry in `TERRAIN_RESOURCES` in the base map generator (catches dual-maintenance divergence).
- All 6 new resources appear in `RESOURCE_DEFINITIONS`.
- Each new `ImprovementType` has an entry in `IMPROVEMENT_DEFINITIONS` and `IMPROVEMENT_BUILD_TURNS`.

### Improvement terrain validity (`tests/systems/improvement-system.test.ts`)

| Improvement | Valid terrain (positive) | Invalid terrain (negative) |
|---|---|---|
| plantation | grassland | hills |
| pasture | plains | jungle |
| camp | forest | plains |
| camp | tundra | hills |
| quarry | mountain | grassland |

### Acquisition model — spec-fidelity conjunctions (`tests/systems/resource-acquisition-system.test.ts`)

1. tech without improvement → unavailable
2. improvement without tech → unavailable
3. tech + improvement (`turnsLeft === 0`) → available
4. tech + improvement in progress (`turnsLeft > 0`) → unavailable
5. city-center tile + tech only → available (no improvement needed)
6. city-center tile + no tech → unavailable
7. Multi-city: resource on city-2's tile is counted (not cities[0] only)
8. furs on tundra + camp + foraging → available
9. cattle on grassland + pasture + domestication → available
10. Resource on enemy-owned tile → not returned even if viewer has tech (the helper is called with the viewing civ's id; it only iterates that civ's cities)
11. Second qualifying tile for same resource type → still returns resource once (Set semantics, not count)

### Marketplace panel (`tests/ui/marketplace-panel.test.ts`)

- Player with tech + completed improvement: badge shows "✓ Owned" (not a numeric count).
- Player with tech but no improvement: badge shows "✗ Not available".
- "Your Resources" summary section lists correctly owned resources by type.
- "Your Resources" empty state shows when no resources owned, text mentions tech and improvements.
- Panel uses `state.currentPlayer` — never hardcoded civ id.

### Tech unlocks coverage

Verify domestication, pottery, animal-husbandry, foraging, currency, mining-tech all contain their new "Reveal X resource" lines.

---

## Known limitations (acceptable for this slice)

- **Wrong-improvement dead end**: a player who builds the wrong improvement on a resource tile cannot remove it. The inspection panel shows "✗ Needs [X] to harvest" which is accurate but offers no remedy. Improvement removal is out of scope for this and subsequent slices.
- **Forest-mutation trap**: building a farm on a forest/jungle tile with ivory or furs mutates the terrain to plains, making camp un-buildable. The resource becomes permanently un-harvestable on that tile. Document in PR description; do not attempt to gate farms on resource tiles in this slice.
- **In-progress improvement display**: the hex renderer shows only a turn countdown for in-progress improvements, not which improvement is building. New improvements follow this same pattern.
- **Old-save stone tiles on hills**: stone placed on hills in pre-S2a saves cannot be harvested (quarry requires mountain). Inspection panel will correctly show "✗ Needs Quarry to harvest." No migration offered.

---

## Out of scope (deferred to later slices)

- Filtering marketplace to only tech-known resources → S3
- Per-resource yield/happiness effects → S4a
- Strategic resource prerequisites for units/buildings → S4b
- Mint, Ranch, Tannery buildings → S4a
- Trade routes → S5
- Buy/sell/barter transactions → S8–S10
