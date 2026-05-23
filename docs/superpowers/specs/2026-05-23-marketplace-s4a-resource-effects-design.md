# Marketplace S4a — Per-Resource Yield & Happiness Effects

**Slice:** S4a in the [Marketplace & Trade Roadmap](../specs/2026-05-20-marketplace-trade-roadmap.md)
**Depends on:** S2b (`getCivAvailableResources` — already merged)
**Blocks:** S4b (strategic resource prerequisites for units/buildings)

## Goal

Owning a resource (as determined by `getCivAvailableResources`) now confers a passive empire-wide effect: luxury resources grant happiness or per-city yield bonuses; two strategic resources (cattle, salt) get small passive bonuses. The bonus is visible in the city panel and HUD. Losing a resource removes the bonus immediately (same turn).

This slice also patches two companion issues introduced by prior work:
- Six new resources added in S2a (gold, silver, furs, sheep, cattle, salt) have no placement zones in `generate-earth-maps.ts` and therefore never appear on earth maps.
- Several existing resources have missing geographic zones (iron, horses, spices, gems, ivory, wine, copper — see §Earth map).
- The roadmap "Current state" table incorrectly lists stone's terrain as `mountain`; S2a moved it to `hills`.

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

**Scope:** empire-wide, non-stacking. Owning three silk tiles still gives +1 happiness, not +3. Duplicates are for selling (S8+).

**Loss timing:** immediate (same turn). The effect is derived fresh from `getCivAvailableResources` each turn; no persistent copy to go stale.

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
 * Returns the aggregate per-city yield bonus from all owned non-happiness
 * resources. Empire-wide, non-stacking: owning any amount of a resource
 * counts once.
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

`computeUnrestPressure` gains a happiness offset (capped so pressure cannot go below 0):

```typescript
import { getCivHappinessFromResources } from './resource-acquisition-system';

// At the end of computeUnrestPressure, before the final cap:
const happiness = getCivHappinessFromResources(state, owner);
pressure -= happiness * 2; // up to −10 from 5 happiness luxuries
return Math.min(100, Math.max(0, pressure));
```

Effect in context: each luxury happiness resource offsets 2 pressure. Five luxuries (−10) meaningfully counteracts two wars' worth of war-weariness (2 × 8 = +16) or two-and-a-half cities of overextension.

No new `GameState` fields are added. Happiness is fully computed each turn from live resource ownership.

## UI surface

### City panel — resource bonus subsection

A new "Resources" row group is inserted below the yield summary in the city panel. One line per owned resource that has an effect, using `createTextNode` / `textContent` only:

```
Silk      → +1 happiness
Ivory     → +1 happiness
Gems      → +1 gold/turn
Sheep     → +1 production/turn
```

- Happiness lines are identical across all city panels (empire-wide effect, not city-specific).
- Only resources with a non-null effect are shown; the section is omitted entirely if the civ owns no effect-bearing resources.
- Uses `state.currentPlayer` (never hardcoded `'player'`).

### HUD — happiness chip

A `☺ N` chip is added alongside the existing per-turn yield chips (food, production, gold, science). Computes `getCivHappinessFromResources(state, state.currentPlayer)`. The chip is omitted when the value is 0 (no clutter when no luxuries are owned).

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

// Gems
{ resource: 'gems', terrain: 'hills',  lonMin: 20,   lonMax: 40,   latMin: -30, latMax: 5  }, // S. Africa (diamonds)
{ resource: 'gems', terrain: 'hills',  lonMin: 75,   lonMax: 85,   latMin: 10,  latMax: 25 }, // India (diamonds)
{ resource: 'gems', terrain: 'jungle', lonMin: -80,  lonMax: -65,  latMin: -20, latMax: 5  }, // S. America
{ resource: 'gems', terrain: 'hills',  lonMin: 95,   lonMax: 103,  latMin: 17,  latMax: 27 }, // PATCH: Myanmar (rubies/jade)
{ resource: 'gems', terrain: 'hills',  lonMin: 135,  lonMax: 145,  latMin: -32, latMax: -25 }, // PATCH: Australia (opals)

// Ivory
{ resource: 'ivory', terrain: 'forest', lonMin: 10,  lonMax: 40,   latMin: -15, latMax: 10 }, // Central/West Africa
{ resource: 'ivory', terrain: 'forest', lonMin: 33,  lonMax: 42,   latMin: -10, latMax: 5  }, // PATCH: East Africa
{ resource: 'ivory', terrain: 'forest', lonMin: 75,  lonMax: 105,  latMin: 8,   latMax: 22 }, // PATCH: South Asia (Indian elephant)

// Wine
{ resource: 'wine', terrain: 'grassland', lonMin: -5,   lonMax: 30,   latMin: 35, latMax: 47 }, // Mediterranean/France
{ resource: 'wine', terrain: 'grassland', lonMin: -123, lonMax: -119, latMin: 37, latMax: 39 }, // PATCH: California (Napa)
{ resource: 'wine', terrain: 'grassland', lonMin: 18,   lonMax: 22,   latMin: -34, latMax: -32 }, // PATCH: S. Africa (Cape)
{ resource: 'wine', terrain: 'grassland', lonMin: -72,  lonMax: -68,  latMin: -37, latMax: -30 }, // PATCH: Chile/Mendoza

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

Stone keeps its existing global fallback (8% of hills tiles — stone is geographically ubiquitous).

### Regeneration

After updating `generate-earth-maps.ts`, run:
```
bash scripts/run-with-mise.sh yarn generate-maps
```
This overwrites `src/systems/earth-map-data.ts`, `old-world-map-data.ts`, and `new-world-map-data.ts`.

## Tests

| # | Test | Type |
|---|---|---|
| 1 | Every entry in `RESOURCE_DEFINITIONS` has `effect` defined (non-undefined — may be `null`) | catalog |
| 2 | `getCivHappinessFromResources` returns 1 for a civ owning silk | positive |
| 3 | `getCivResourceYieldBonus` returns `{ gold: 1, ... }` for a civ owning gems | positive |
| 4 | `getCivResourceYieldBonus` returns `{ production: 1, ... }` for a civ owning sheep | positive |
| 5 | `getCivResourceYieldBonus` returns `{ food: 1, ... }` for a civ owning cattle | positive |
| 6 | `getCivResourceYieldBonus` returns `{ gold: 1, ... }` for a civ owning salt | positive |
| 7 | Civ owning 3 silk tiles (3 different cities) → happiness still 1 (non-stacking) | non-stacking |
| 8 | Civ with no owned resources → happiness 0, all yield bonuses 0 | negative |
| 9 | Copper/iron/horses/stone produce no S4a effect (`getCivResourceYieldBonus` returns zeros, `getCivHappinessFromResources` returns 0 for a civ owning only those) | negative |
| 10 | Silk improvement destroyed (`improvementTurnsLeft > 0`) → `getCivHappinessFromResources` returns 0 same turn | loss |
| 11 | Civ with 3 cities owning gems → all 3 cities receive +1 gold in turn processing | all-cities |
| 12 | AI civ owning spices accrues gold/turn via the same turn-manager code path | AI parity |
| 13 | City with pressure 45, civ owns 3 happiness luxuries → pressure reduced by 6 → 39 → no unrest | unrest |
| 14 | `computeUnrestPressure` with happiness = 5 → pressure reduced by 10 | unrest magnitude |
| 15 | Old-save load: `GameState` with no `effect` on RESOURCE_DEFINITIONS initialises without crash (static data, no migration) | save-compat |
| 16 | Earth map (small): each resource in RESOURCE_ZONES appears within at least one of its declared lon/lat bounding boxes | geo-coverage |

## Roadmap updates required

Update `2026-05-20-marketplace-trade-roadmap.md`:
- Current-state table: stone terrain `mountain` → `hills`
- Record S4a locked decisions (this spec path, effect magnitudes, happiness→pressure wiring)
- Mark S4a as "In progress"

## Out of scope

- Era/tech scaling of bonuses (deferred)
- Happiness affecting anything beyond unrest pressure (golden age mechanic, etc.) — deferred
- S4b strategic resource prerequisites for units/buildings
- Monopoly price detection using resource counts (S12)
- Old-world and new-world map data geographic review (can be a follow-up; earth map is the primary)
