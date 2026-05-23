# Marketplace S4a — Per-Resource Yield & Happiness Effects

**Slice:** S4a in the [Marketplace & Trade Roadmap](../specs/2026-05-20-marketplace-trade-roadmap.md)
**Depends on:** S2b (`getCivAvailableResources` — already merged)
**Blocks:** S4b (strategic resource prerequisites for units/buildings)

## Goal

Owning a resource (as determined by `getCivAvailableResources`) now confers a passive empire-wide effect: luxury resources grant happiness or per-city yield bonuses; two strategic resources (cattle, salt) get small passive bonuses. The bonus is visible in the city panel and HUD. Effects are recomputed fresh each turn from current ownership — no stale copy is stored.

This slice also patches two companion issues introduced by prior work:
- Six new resources added in S2a (gold, silver, furs, sheep, cattle, salt) have no placement zones in `generate-earth-maps.ts` and therefore never appear on earth maps.
- Several existing resources have missing geographic zones (iron, horses, spices, gems, ivory, wine, copper — see §Earth map).
- The earth map generator's stone fallback incorrectly uses `hills` terrain, but S2a moved stone to `mountain` terrain. The fallback must be updated to `mountain`.

## Effect table (all 16 resources)

| Resource | Type | Effect in S4a |
|---|---|---|
| silk | luxury | happiness +1 (empire-wide, non-stacking) |
| wine | luxury | happiness +1 |
| ivory | luxury | happiness +1 |
| furs | luxury | happiness +1 |
| incense | luxury | happiness +1 |
| gems | luxury | gold +1/turn (all cities) |
| gold | luxury | gold +1/turn (all cities) |
| silver | luxury | gold +1/turn (all cities) |
| spices | luxury | gold +1/turn (all cities) |
| sheep | luxury | production +1/turn (all cities) |
| cattle | strategic | food +1/turn (all cities) |
| salt | strategic | gold +1/turn (all cities) |
| copper | strategic | null — waits for S4b gating |
| iron | strategic | null — waits for S4b gating |
| horses | strategic | null — waits for S4b gating |
| stone | strategic | null — waits for S4b gating |

**Thematic rationale:**
- Silk, wine, ivory, furs, incense → comfort and prestige → happiness
- Gems, gold, silver, spices → high monetary/trade value → gold/turn
- Sheep → wool (textiles) → production/turn
- Cattle → livestock sustenance → food/turn
- Salt → preservation and trade → gold/turn
- Copper/iron/horses/stone → their value is unlocking units and buildings (S4b)

**Magnitude:** flat +1 in S4a. Era/tech scaling deferred to a future slice.

**Scope:** empire-wide, non-stacking **per resource**. Owning three silk tiles gives +1 happiness, not +3 — duplicates are for selling (S8+). However, owning silk **and** wine gives +2 happiness (two distinct resources, each contributes once). Same rule applies to yield resources: gems + silver both contribute +1 gold/turn each, so a civ owning both gets +2 gold/turn per city.

**Loss timing:** computed fresh each turn from the current resource ownership state at the point each subsystem runs. Yield bonuses (gold, production, food) are applied in the per-civ city loop; happiness reduction is applied during `processFactionTurn` at the top of the turn. In practice: an improvement destroyed by combat mid-turn drops the yield bonus on the following turn's city processing and drops the happiness pressure reduction on the following turn's faction pass. No persistent copy of effects is stored, so nothing can go stale.

## Data model

### `ResourceEffect` and `effect` field in `trade-system.ts`

```typescript
export interface ResourceEffect {
  type: 'happiness' | 'gold' | 'production' | 'food';
  amount: number; // always 1 in S4a
}

export interface ResourceDefinition {
  id: ResourceType;
  name: string;
  type: 'luxury' | 'strategic';
  terrain: string | string[];
  basePrice: number;
  tech: string;
  icon: string;
  requiredImprovement: BuildableImprovementType;
  effect: ResourceEffect | null; // null = no S4a passive
}
```

**Save compatibility:** `effect` is a field on `RESOURCE_DEFINITIONS` (static data, not saved `GameState`). Old saves load without migration.

## Architecture

### New pure helpers in `resource-acquisition-system.ts`

```typescript
/**
 * Returns the aggregate per-city yield bonus from all owned resources whose
 * effect type is NOT 'happiness' (i.e. gold, production, food effects only).
 * Non-stacking per resource: owning any number of the same resource counts once.
 * Different resources with the same effect type DO accumulate
 * (gems + silver → +2 gold/turn).
 */
export function getCivResourceYieldBonus(
  state: GameState,
  civId: string,
): ResourceYield

/**
 * Returns the count of distinct happiness-type luxuries owned by the civ.
 * Empire-wide, non-stacking.
 */
export function getCivHappinessFromResources(
  state: GameState,
  civId: string,
): number
```

Both call `getCivAvailableResources(state, civId)` internally, then loop over `RESOURCE_DEFINITIONS` filtering by owned resource and effect type.

### `turn-manager.ts` — yield bonus wiring

`getCivResourceYieldBonus` is called **once per civ** (not per city) before the city loop. The result is added alongside wonder city bonuses when computing each city's final yields:

```typescript
const resourceYieldBonus = getCivResourceYieldBonus(newState, civId);

// Per city:
const yields = {
  food:       Math.floor((baseYields.food       + (wonderCityBonuses.food       ?? 0) + resourceYieldBonus.food)       * unrestMultiplier),
  production: Math.floor((baseYields.production + (wonderCityBonuses.production ?? 0) + resourceYieldBonus.production) * unrestMultiplier),
  gold:       Math.floor((baseYields.gold       + (wonderCityBonuses.gold       ?? 0) + resourceYieldBonus.gold)       * unrestMultiplier),
  science:    Math.floor((baseYields.science    + (wonderCityBonuses.science    ?? 0))                                 * unrestMultiplier),
};
```

### `faction-system.ts` — happiness reduces unrest pressure

**Performance constraint:** `computeUnrestPressure` is called once per city, not once per civ. Calling `getCivHappinessFromResources` (which itself calls `getCivAvailableResources`) inside it would scan all owned tiles once per city per turn — O(cities²) per civ. Instead, `processFactionTurn` computes happiness once per civ and passes it down.

```typescript
// In processFactionTurn, build a happiness map before the city loop:
import { getCivHappinessFromResources } from './resource-acquisition-system';

// Before the per-city loop in processFactionTurn:
const civHappiness: Record<string, number> = {};
for (const civId of Object.keys(nextState.civilizations)) {
  civHappiness[civId] = getCivHappinessFromResources(nextState, civId);
}

// computeUnrestPressure gains a happiness parameter:
export function computeUnrestPressure(
  cityId: string,
  state: GameState,
  ownerHappiness: number,  // pre-computed, passed from processFactionTurn
): number {
  // ...existing pressure logic...
  pressure -= ownerHappiness * 2; // up to −10 from 5 happiness luxuries
  return Math.min(100, Math.max(0, pressure));
}
```

There is **1 internal call site** of `computeUnrestPressure` in `faction-system.ts` (line ~179 in `processFactionTurn`). Because the function is `export`ed, add `ownerHappiness` as an **optional parameter with default 0** to avoid breaking any future external callers:

```typescript
export function computeUnrestPressure(
  cityId: string,
  state: GameState,
  ownerHappiness = 0,
): number
```

The internal call site passes `civHappiness[city.owner] ?? 0`; any external call site that omits the argument defaults to 0 (no happiness benefit), which is safe.

Effect in context: each luxury happiness resource offsets 2 pressure. Five luxuries (−10) meaningfully counteracts two wars' worth of war-weariness (2 × 8 = +16) or two-and-a-half cities of overextension.

No new `GameState` fields are added. Happiness is fully computed each turn from live resource ownership.

## UI surface

### City panel — resource bonus subsection

A new "Resources" row group is inserted below the yield summary. It is split into two labelled sub-rows to avoid confusing empire-wide bonuses with per-city yields:

```
Empire bonuses
  Silk    → +1 happiness
  Ivory   → +1 happiness

City bonuses
  Gems    → +1 gold/turn
  Sheep   → +1 production/turn
```

Rules:
- "Empire bonuses" shows only happiness-type resources; each line represents a unique owned resource (non-stacking). The label makes clear the bonus is not specific to this city.
- "City bonuses" shows yield-type resources (gold, production, food). These apply equally to every city, but showing them here gives per-city context.
- A sub-row header that has no resources beneath it is omitted entirely (e.g., if the civ owns only yield resources, only "City bonuses" appears; the "Empire bonuses" header is omitted).
- The entire "Resources" section is omitted if no effect-bearing resources are owned.
- Uses `state.currentPlayer` (never hardcoded `'player'`).
- `createTextNode` / `textContent` only — no `innerHTML` with game strings.
- **Naming**: the gold (resource) displays as "Gold deposits → +1 gold/turn" to avoid the confusing "Gold → +1 gold" collision between resource name and currency name.

### HUD — happiness chip

A `☺ N` chip is added alongside the existing per-turn yield chips (food, production, gold, science). Computes `getCivHappinessFromResources(state, state.currentPlayer)`. The chip is omitted when the value is 0 (no clutter when no luxuries are owned).

The chip must be **self-explanatory**: players have never seen a happiness number in this game before. Use a tooltip or inline label that makes the effect clear. Recommended display: `☺ 3 — reduces unrest risk`. If the HUD layout cannot support a tooltip, add a parenthetical: `☺ 3 (stability)`. The raw number alone is not enough.

### Marketplace panel — effect annotation

Each resource row in the marketplace panel (already filtered by tech in S3) gains a small effect badge:

```
🧵 Silk    luxury   ★ +1 happiness
💎 Gems    luxury   $ +1 gold/turn
🐑 Sheep   luxury   ⚙ +1 production/turn
⚙️ Iron    strategic  (unit prerequisite — S4b)
```

Resources with `effect: null` (copper, iron, horses, stone) show `(unlocks advanced units & buildings)` as a player-readable hint that their value comes later. Do not use internal slice names like "S4b". Uses `textContent` only.

## Earth map — geographic zones

### Problem

`generate-earth-maps.ts` places resources via a `RESOURCE_ZONES` array. Six new S2a resources have no zones and cannot appear on earth maps. Several existing resources have notable geographic gaps.

### Zone additions and patches

The full intended `RESOURCE_ZONES` table after this slice (new entries marked **NEW**, missing-zone patches marked **PATCH**):

```typescript
// Horses
{ resource: 'horses', terrain: 'plains', lonMin: 50,   lonMax: 100,  latMin: 40, latMax: 55 }, // Central Asian steppe
{ resource: 'horses', terrain: 'plains', lonMin: -110, lonMax: -95,  latMin: 30, latMax: 50 }, // Great Plains (Americas)
{ resource: 'horses', terrain: 'plains', lonMin: 35,   lonMax: 55,   latMin: 15, latMax: 30 }, // PATCH: Arabian Peninsula

// Iron
{ resource: 'iron', terrain: 'hills', lonMin: 5,   lonMax: 30,   latMin: 50, latMax: 65 }, // N. Europe/Scandinavia
{ resource: 'iron', terrain: 'hills', lonMin: 105, lonMax: 120,  latMin: 30, latMax: 45 }, // China
{ resource: 'iron', terrain: 'hills', lonMin: -95, lonMax: -75,  latMin: 40, latMax: 50 }, // Great Lakes (US)
{ resource: 'iron', terrain: 'hills', lonMin: -50, lonMax: -40,  latMin: -22, latMax: -10 }, // PATCH: Brazil/Minas Gerais
{ resource: 'iron', terrain: 'hills', lonMin: 83,  lonMax: 88,   latMin: 21, latMax: 25 }, // PATCH: India/Jharkhand

// Silk
{ resource: 'silk', terrain: 'grassland', lonMin: 95, lonMax: 115, latMin: 30, latMax: 40 }, // China

// Spices
{ resource: 'spices', terrain: 'jungle', lonMin: 95,  lonMax: 140, latMin: -10, latMax: 20 }, // SE Asia
{ resource: 'spices', terrain: 'jungle', lonMin: 70,  lonMax: 85,  latMin: 8,   latMax: 20 }, // S. India
{ resource: 'spices', terrain: 'jungle', lonMin: 38,  lonMax: 42,  latMin: -8,  latMax: 0  }, // PATCH: Zanzibar/E. Africa

// Incense
{ resource: 'incense', terrain: 'desert', lonMin: 40, lonMax: 60, latMin: 15, latMax: 30 }, // Arabian Peninsula
{ resource: 'incense', terrain: 'desert', lonMin: 10, lonMax: 40, latMin: 15, latMax: 30 }, // N. Africa / Horn

// Gems — terrain MUST be 'hills' (gems requires a mine; mines can't be built on jungle)
{ resource: 'gems', terrain: 'hills', lonMin: 20,   lonMax: 40,   latMin: -30, latMax: 5  }, // S. Africa (diamonds, Kimberlite pipes)
{ resource: 'gems', terrain: 'hills', lonMin: 75,   lonMax: 85,   latMin: 10,  latMax: 25 }, // India (diamonds, Golconda)
{ resource: 'gems', terrain: 'hills', lonMin: -80,  lonMax: -65,  latMin: -20, latMax: 5  }, // S. America (emeralds, Andes/Colombia — hills, not jungle)
{ resource: 'gems', terrain: 'hills', lonMin: 95,   lonMax: 103,  latMin: 17,  latMax: 27 }, // PATCH: Myanmar (rubies/jade)
{ resource: 'gems', terrain: 'hills', lonMin: 135,  lonMax: 145,  latMin: -32, latMax: -25 }, // PATCH: Australia (opals)

// Ivory
{ resource: 'ivory', terrain: 'forest', lonMin: 10,  lonMax: 40,   latMin: -15, latMax: 10 }, // Central/West Africa
{ resource: 'ivory', terrain: 'forest', lonMin: 33,  lonMax: 42,   latMin: -10, latMax: 5  }, // PATCH: East Africa
{ resource: 'ivory', terrain: 'forest', lonMin: 75,  lonMax: 105,  latMin: 8,   latMax: 22 }, // PATCH: South Asia (Indian elephant)

// Wine — terrain MUST be 'plains' (wine's RESOURCE_DEFINITION terrain; plantation is buildable on plains)
{ resource: 'wine', terrain: 'plains', lonMin: -5,   lonMax: 30,   latMin: 35, latMax: 47 }, // Mediterranean/France/Iberia
{ resource: 'wine', terrain: 'plains', lonMin: -123, lonMax: -119, latMin: 37, latMax: 39 }, // PATCH: California (Napa)
{ resource: 'wine', terrain: 'plains', lonMin: 18,   lonMax: 22,   latMin: -34, latMax: -32 }, // PATCH: S. Africa (Cape)
{ resource: 'wine', terrain: 'plains', lonMin: -72,  lonMax: -68,  latMin: -37, latMax: -30 }, // PATCH: Chile/Mendoza

// Copper
{ resource: 'copper', terrain: 'hills', lonMin: -80,  lonMax: -65,  latMin: -35, latMax: 10 }, // S. America (Andes)
{ resource: 'copper', terrain: 'hills', lonMin: -9,   lonMax: -5,   latMin: 37,  latMax: 43 }, // Iberian Peninsula
{ resource: 'copper', terrain: 'hills', lonMin: 25,   lonMax: 30,   latMin: -15, latMax: -8 }, // PATCH: Zambia/DRC Copper Belt
{ resource: 'copper', terrain: 'hills', lonMin: -115, lonMax: -108, latMin: 32,  latMax: 48 }, // PATCH: Arizona/Montana (US)

// Gold (NEW)
{ resource: 'gold', terrain: 'hills', lonMin: 25,   lonMax: 32,   latMin: -30, latMax: -22 }, // S. Africa (Witwatersrand)
{ resource: 'gold', terrain: 'hills', lonMin: -122, lonMax: -114, latMin: 36,  latMax: 42  }, // California/Sierra Nevada
{ resource: 'gold', terrain: 'hills', lonMin: 120,  lonMax: 150,  latMin: 55,  latMax: 65  }, // Siberia (Lena/Kolyma)
{ resource: 'gold', terrain: 'hills', lonMin: -3,   lonMax: 2,    latMin: 5,   latMax: 10  }, // W. Africa (Ghana/Gold Coast)

// Silver (NEW)
{ resource: 'silver', terrain: 'hills', lonMin: -107, lonMax: -98, latMin: 20, latMax: 30 }, // Mexico (Zacatecas)
{ resource: 'silver', terrain: 'hills', lonMin: -70,  lonMax: -63, latMin: -24, latMax: -14 }, // Bolivia/Peru (Potosí)
{ resource: 'silver', terrain: 'hills', lonMin: 12,   lonMax: 20,  latMin: 49, latMax: 53 }, // C. Europe (Saxony/Bohemia)

// Furs (NEW — forest and tundra)
{ resource: 'furs', terrain: 'forest', lonMin: 60,   lonMax: 140,  latMin: 55, latMax: 70 }, // Siberia
{ resource: 'furs', terrain: 'tundra', lonMin: 60,   lonMax: 140,  latMin: 55, latMax: 70 }, // Siberia (tundra belt)
{ resource: 'furs', terrain: 'forest', lonMin: -135, lonMax: -70,  latMin: 50, latMax: 70 }, // Canada
{ resource: 'furs', terrain: 'tundra', lonMin: -135, lonMax: -70,  latMin: 50, latMax: 70 }, // Canada (tundra)
{ resource: 'furs', terrain: 'forest', lonMin: 15,   lonMax: 30,   latMin: 60, latMax: 70 }, // Scandinavia

// Sheep (NEW — hills and plains)
{ resource: 'sheep', terrain: 'hills',  lonMin: -10, lonMax: 2,   latMin: 50, latMax: 60 }, // British Isles
{ resource: 'sheep', terrain: 'plains', lonMin: 80,  lonMax: 120, latMin: 40, latMax: 52 }, // C. Asia/Mongolia
{ resource: 'sheep', terrain: 'plains', lonMin: -73, lonMax: -60, latMin: -52, latMax: -37 }, // Patagonia/Argentina
{ resource: 'sheep', terrain: 'hills',  lonMin: -8,  lonMax: 2,   latMin: 38, latMax: 43 }, // Iberia/Castile (merino)

// Cattle (NEW — grassland and plains)
{ resource: 'cattle', terrain: 'plains',    lonMin: -105, lonMax: -95, latMin: 35, latMax: 50 }, // Great Plains (N. America)
{ resource: 'cattle', terrain: 'grassland', lonMin: -65,  lonMax: -57, latMin: -40, latMax: -28 }, // Argentine Pampas
{ resource: 'cattle', terrain: 'grassland', lonMin: 32,   lonMax: 42,  latMin: -5,  latMax: 10 }, // East Africa (Maasai)

// Salt (NEW — hills)
{ resource: 'salt', terrain: 'hills', lonMin: 12,  lonMax: 25,  latMin: 47, latMax: 55 }, // C. Europe (Wieliczka/Austria)
{ resource: 'salt', terrain: 'hills', lonMin: 44,  lonMax: 58,  latMin: 30, latMax: 38 }, // Zagros/Iran
{ resource: 'salt', terrain: 'hills', lonMin: -70, lonMax: -65, latMin: -25, latMax: -16 }, // Andes (Atacama)
{ resource: 'salt', terrain: 'hills', lonMin: -5,  lonMax: 10,  latMin: 30, latMax: 37 }, // N. Africa/Atlas
```

**Stone fallback fix:** The existing generator fallback `if (terrain === 'hills' && r < 0.08) return 'stone'` is wrong — S2a moved stone to `mountain` terrain (requiring a quarry, which is buildable only on mountains). Update the fallback to:
```typescript
if (terrain === 'mountain' && r < 0.15) return 'stone';
```
Threshold raised from 8% to 15% because mountains are rarer than hills on the map, preserving roughly the same total stone tile count. Stone is geographically ubiquitous so a global mountain fallback is appropriate.

### Regeneration

After updating `generate-earth-maps.ts`, run:
```
bash scripts/run-with-mise.sh yarn generate-maps
```
This overwrites `src/systems/earth-map-data.ts`, `old-world-map-data.ts`, and `new-world-map-data.ts`.

## Tests

**Helpers (unit)**

| # | Test | Type |
|---|---|---|
| 1 | Every entry in `RESOURCE_DEFINITIONS` has `effect` defined (non-undefined — may be `null`) | catalog |
| 2 | `getCivHappinessFromResources` returns 1 for a civ owning silk | positive |
| 3 | `getCivResourceYieldBonus` returns `{ gold: 1, ... }` for a civ owning gems | positive |
| 4 | `getCivResourceYieldBonus` returns `{ production: 1, ... }` for a civ owning sheep | positive |
| 5 | `getCivResourceYieldBonus` returns `{ food: 1, ... }` for a civ owning cattle | positive |
| 6 | `getCivResourceYieldBonus` returns `{ gold: 1, ... }` for a civ owning salt | positive |
| 7 | Civ owning 3 silk tiles (3 different cities) → `getCivHappinessFromResources` returns 1, not 3 (same-resource non-stacking) | non-stacking |
| 8 | Civ owning silk AND wine → `getCivHappinessFromResources` returns 2 (different resources accumulate) | accumulation |
| 9 | Civ owning gems AND silver → `getCivResourceYieldBonus` returns `{ gold: 2, ... }` (different resources accumulate) | accumulation |
| 10 | Civ with no owned resources → happiness 0, all yield bonuses 0 | negative |
| 11 | Copper/iron/horses/stone → `getCivResourceYieldBonus` returns all zeros; `getCivHappinessFromResources` returns 0 | negative |
| 12 | `getCivResourceYieldBonus` returns 0 happiness contribution (happiness resources excluded from yield bonus) | negative |
| 13 | Silk improvement destroyed (`improvementTurnsLeft > 0`) → `getCivHappinessFromResources` returns 0 | loss |

**Turn processing (integration)**

| # | Test | Type |
|---|---|---|
| 14 | Civ with 3 cities owning gems → all 3 cities receive +1 gold in turn processing (not cities[0] only) | all-cities |
| 15 | AI civ owning spices accrues +1 gold/turn per city via same turn-manager code path as human civ | AI parity |
| 16 | `getCivResourceYieldBonus` called exactly once per civ per turn-manager pass, not once per city | arch regression |

**Faction / unrest**

| # | Test | Type |
|---|---|---|
| 17 | `computeUnrestPressure` with `ownerHappiness=3` → pressure reduced by 6 | unrest magnitude |
| 18 | City at base pressure 45 with 3 happiness luxuries → pressure 39 → no unrest fires | unrest positive |
| 19 | City at base pressure 45 with 0 happiness luxuries → pressure 45 → unrest fires (without happiness, same pressure triggers) | unrest negative |
| 20 | `computeUnrestPressure` called with no `ownerHappiness` arg (omitted) → defaults to 0, no crash | API safety |

**UI — city panel**

| # | Test | Type |
|---|---|---|
| 21 | Civ owning silk: city panel DOM contains "Empire bonuses" header and "Silk" text in happiness sub-section | DOM |
| 22 | Civ owning gems: city panel DOM contains "City bonuses" header and "Gems" text with "+1 gold/turn" | DOM |
| 23 | "Gold deposits" (not "Gold") appears for the gold resource to avoid currency name collision | naming |
| 24 | Civ owning only yield resources (gems, no silk): "Empire bonuses" header absent from DOM | DOM negative |
| 25 | Civ owning no resources: entire "Resources" section absent from city panel DOM | DOM negative |

**UI — HUD**

| # | Test | Type |
|---|---|---|
| 26 | Civ with 2 happiness luxuries: HUD contains "☺" chip with value 2 | HUD |
| 27 | Civ with 0 happiness luxuries: HUD does not contain "☺" chip | HUD negative |

**UI — marketplace panel**

| # | Test | Type |
|---|---|---|
| 28 | Silk row in marketplace panel contains "+1 happiness" badge text | DOM |
| 29 | Iron row in marketplace panel contains "unlocks advanced units" hint text (not raw "null") | DOM |

**Save compatibility & map**

| # | Test | Type |
|---|---|---|
| 30 | Old `GameState` save (pre-S4a) loads without crash — `effect` is static data, no migration needed | save-compat |
| 31 | Earth map (small): each of the 16 resources appears at least once; gold/furs/sheep/cattle/salt/silver each appear in at least one tile within their declared lon/lat bounding boxes | geo-coverage |

## Roadmap updates required

Update `2026-05-20-marketplace-trade-roadmap.md`:
- Current-state table: stone terrain entry should read `stone(mountain)` — S2a moved stone FROM hills TO mountain; earth-map generator stone fallback also needs updating from `hills` to `mountain` (captured in §Earth map above).
- Record S4a locked decisions (this spec path, effect magnitudes, non-stacking rule, happiness→pressure wiring, happiness magnitude = 2 pressure per point).
- Mark S4a as "In progress".

## Out of scope

- Era/tech scaling of bonuses (deferred)
- Happiness affecting anything beyond unrest pressure (golden age mechanic, etc.) — deferred
- S4b strategic resource prerequisites for units/buildings
- Monopoly price detection using resource counts (S12)
- Old-world and new-world map data geographic review (can be a follow-up; earth map is the primary)
