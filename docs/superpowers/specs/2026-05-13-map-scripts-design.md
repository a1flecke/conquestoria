# Map Scripts Design

**Issue:** #132  
**Date:** 2026-05-13

## Overview

Replace the single procedural map generator with a **map script** system. Players choose a named map type in campaign setup; each type controls terrain generation, resource placement, and civ start positions. Five map scripts ship in this feature:

| Script | Description |
|---|---|
| **Earth** | Recognizable real-world continents; real civ homelands; real-world resources |
| **Old World** | Europe, Asia, Africa; same homeland/resource rules as Earth |
| **New World** | North and South America; Aztec homeland; colonizer spots for England/France/Spain/Viking |
| **Balanced World** | Procedural; algorithmically fair zone-per-civ terrain and resources; contested luxury hotspot at center |
| **Single Continent** | Procedural; one large connected landmass; island fringe with bonus resources |

All five scripts support small (30×30), medium (50×50), and large (80×80) maps.

### Horizontal wrapping per script

| Script | `wrapsHorizontally` |
|---|---|
| Earth | `true` — the globe wraps east→west |
| Old World | `false` — cropped region, edges are real boundaries |
| New World | `false` — cropped region, edges are real boundaries |
| Balanced World | `true` — inherits existing behaviour |
| Single Continent | `true` — ocean on both sides of the continent connects |

`loadGeoMap` sets `wrapsHorizontally` on the returned `GameMap` based on the script. The renderer's ghost-tile pass and the input coordinate-normalisation path both read `map.wrapsHorizontally`, so no additional changes are needed there.

---

## Campaign Setup UI

The existing "Map size" section becomes a combined **Map** section with two rows:

**Row 1 — Map type** (5 card buttons):  
`🌍 Earth` · `🗺️ Old World` · `🌎 New World` · `⚖️ Balanced` · `🏝️ Continent`

**Mobile layout:** five cards in a single row is too narrow on a 375 px screen (~67 px each). Use a 3+2 grid instead: first row has Earth, Old World, New World; second row has Balanced, Continent (centred). On screens ≥ 480 px wide, all five can appear in a single row with `repeat(5, minmax(0, 1fr))`.

A short description line below the type row updates when the selection changes. All five strings:

| Script | Description shown in UI |
|---|---|
| Earth | "Real-world geography. Civilizations start near their historical homelands; fantasy and out-of-region civs get good constrained starts. Resources follow real-world distribution." |
| Old World | "Europe, Asia, and Africa. Historical civilizations start at their homelands. Best for Old World civs — Aztec gets a constrained random start. Resources follow real-world distribution." |
| New World | "North and South America. Aztec starts in Central Mexico. England, France, Spain, and Viking begin as colonizers on the eastern seaboard. Other civs get a constrained random start." |
| Balanced World | "Procedurally generated. Each civilization receives an equal share of terrain and resources. A cluster of luxury resources in the middle creates a natural conflict hotspot." |
| Single Continent | "One large connected landmass with small islands in the surrounding ocean. Fast early contact between civilizations; islands reward naval exploration with bonus resources." |

**Row 2 — Size** (3 card buttons, unchanged):  
`Small · 30×30 · up to 3 civs` · `Medium · 50×50 · up to 5 civs` · `Large · 80×80 · up to 8 civs`

`maxPlayers` continues to be gated by size, not script. Opponent count refreshes when size changes, same as today.

Default selection on first load: `Earth` + `Medium`.

---

## Infrastructure & Types

### `MapScript` type (`src/core/types.ts`)

```typescript
export type MapScript =
  | 'procedural'
  | 'earth'
  | 'old-world'
  | 'new-world'
  | 'balanced'
  | 'single-continent';
```

`'procedural'` is the existing noise-based generator, kept as-is for backwards compatibility with saved games that predate this feature. It is **not** a selectable option in the campaign setup UI — new games must use one of the five named scripts. The campaign setup defaults to `'earth'`.

### `GameConfig` (`src/core/game-state.ts`)

Add `mapScript: MapScript` (default `'procedural'`). Existing `mapSize` field is unchanged. Saved games that predate this feature and therefore lack `mapScript` must deserialize with `mapScript: 'procedural'` so they continue to work correctly.

### `GameState` (`src/core/types.ts`)

Also add `mapScript: MapScript` to `GameState` (copied from `GameConfig` in `createNewGame`). `GameConfig` is ephemeral; `GameState` is what gets saved and loaded. Without this, the active script is lost after save/reload. Old saves that lack this field deserialize as `'procedural'`.

### `createNewGame` dispatch

`createNewGame` copies `config.mapScript` onto the returned `GameState` immediately after construction (`state.mapScript = config.mapScript`).

Switch on `config.mapScript` before generating the map:

```
'procedural'        → generateMap(w, h, seed)
'earth'             → loadGeoMap(EARTH_TILES, EARTH_RIVERS, size, true)
'old-world'         → loadGeoMap(OLD_WORLD_TILES, OLD_WORLD_RIVERS, size, false)
'new-world'         → loadGeoMap(NEW_WORLD_TILES, NEW_WORLD_RIVERS, size, false)
'balanced'          → generateBalancedMap(w, h, seed, civCount)   // returns { map, startPositions }
'single-continent'  → generateContinentMap(w, h, seed)            // returns { map, continentHexes }
```

For geo scripts start positions come from `findStartPositions(map, civIds, mapScript, size)` as usual. For `'balanced'`, start positions come directly from `generateBalancedMap`'s return value — **do not call `findStartPositions` again** or the Voronoi balance guarantee is broken. For `'single-continent'`, pass `continentHexes` as a candidate filter to `findStartPositions` so island tiles are excluded.

`loadGeoMap(tiles, rivers, size, wrapsHorizontally)` lives in a new file `src/systems/geo-map-loader.ts`. It:
1. Converts the flat `GeoTile[]` for the given size into `Record<string, HexTile>`, initialising non-geographic fields to defaults: `wonder: null`, `owner: null`, `improvement: 'none'`, `improvementTurnsLeft: 0`, `hasRiver: false`.
2. Derives `elevation` from terrain type: `mountain` → `'mountain'`, `hills` or `volcanic` → `'highland'`, all others → `'lowland'`.
3. Sets `map.rivers` from the `rivers[size]` export.
4. Calls `applyRiversToMap(map, rivers[size])` (imported from `river-system.ts`) to set `hasRiver: true` on the appropriate tiles.
5. Sets `map.wrapsHorizontally` from the parameter.

### `findStartPositions` (`src/systems/map-generator.ts`)

New signature: `findStartPositions(map, civIds, mapScript, size, candidateHexes?)`.

- `civIds: string[]` — civ IDs in player order (from `config.players.map(p => p.civId)`).
- `mapScript: MapScript` — controls lookup strategy.
- `size: 'small' | 'medium' | 'large'` — needed to look up the right precomputed coord table.
- `candidateHexes?: Set<string>` — optional hex-key whitelist (used by Single Continent to exclude island tiles).

Returns `HexCoord[]` in the **same order as `civIds`** — `positions[i]` is the start for `civIds[i]`.

For geo scripts, looks up each civ's coord in the precomputed `*_START_POSITIONS[size]` table. Any civ without a table entry falls back to the greedy constrained-random algorithm, which respects `candidateHexes` if provided.

**All existing callers** of the old `findStartPositions(map, count)` signature must be updated to pass `civIds` and `mapScript`. For callers using `'procedural'`, pass the real civ ID list and `'procedural'`; the greedy algorithm runs for all entries.

**Small-map proximity relaxation:** on geo scripts, precomputed historical positions are used as-is even if they violate `MIN_MAJOR_CIV_START_DISTANCE`. Europe contains many civs in a small area and they will naturally be closer than the normal minimum. The distance constraint is only enforced for fallback constrained-random positions.

---

## Geo Map Data Files

Three committed TypeScript data files live in `src/systems/`:

- `earth-map-data.ts`
- `old-world-map-data.ts`
- `new-world-map-data.ts`

Each exports two constants:

```typescript
type GeoTile = { q: number; r: number; terrain: TerrainType; resource: string | null };

export const EARTH_TILES: Record<'small' | 'medium' | 'large', GeoTile[]>;
export const EARTH_START_POSITIONS: Record<'small' | 'medium' | 'large', Record<string, HexCoord>>;
// e.g. { medium: { egypt: {q:24,r:28}, rome: {q:26,r:22}, ... } }
```

Rivers are stored as a parallel export (using the existing `RiverSegment` type from `src/systems/river-system.ts`):
```typescript
export const EARTH_RIVERS: Record<'small' | 'medium' | 'large', RiverSegment[]>;
```

---

## Generation Script

**Location:** `scripts/generate-earth-maps.ts`  
**Run:** `yarn generate-maps` (not part of `yarn build` or `yarn test`)  
**Output:** The three data files above, overwritten in place and committed.

### Algorithm

1. Read two committed data files from `scripts/data/`:
   - `ne_110m_admin_0_countries.geojson` — land/ocean polygons from [Natural Earth](https://www.naturalearthdata.com/) (public domain, ~100 KB).
   - `mountain-ranges.json` — a hand-authored list of approximate lat/lon bounding polygons for major mountain ranges (Himalayas, Andes, Rockies, Alps, Urals, Atlas, Caucasus, Hindu Kush, Zagros, Ethiopian Highlands). This replaces a raster elevation dataset, which would be large and complex to process. The script fetches and caches both files on first run if missing.
2. For each map script × size, define a hex grid of the target dimensions.
3. For each hex, compute the lat/lon of its center using an inverse Mercator projection, cropped to the map's geographic bounds:
   - Earth: full world (−180°→+180° lon, −80°→+80° lat)
   - Old World: −15°→+150° lon, −40°→+70° lat
   - New World: −170°→−30° lon, −60°→+75° lat
4. Determine land/ocean by point-in-polygon test against the country features. Land tiles adjacent to ocean tiles become `coast`.
5. Assign terrain from lat/lon zone rules (applied in priority order — first match wins):
   - Inside a mountain-range polygon (core): `mountain`
   - Inside a mountain-range polygon (edge/buffer): `hills`
   - |lat| > 65°: `snow` (if noise < 0.5) or `tundra`
   - |lat| < 20°, land: `jungle` (if within 30° of a coast or river) or `desert`
   - |lat| < 30°, interior land, low moisture proxy (distance from coast > 10° lon): `desert`
   - Central Asian interior (35–55°N, 50–100°E), non-mountain: `plains`
   - Mediterranean (30–47°N, −5°→+37°E), coastal/low: `grassland`
   - Default land, moist/temperate: `forest` (higher lat) or `grassland` / `plains` (mid lat)
6. Place resources from the geographic zone table (see below). Resource placement is determined at build time using a fixed internal seed — geo map resources are the same in every game (unlike procedural maps where placement is seed-dependent).
7. Define `RiverSegment[]` arrays for named river corridors (Nile, Amazon, Yangtze, Mississippi, Congo, Rhine, Ganges, Volga) as hand-authored hex-edge sequences. Store these in the data file as `EARTH_RIVERS` etc. Do **not** set `hasRiver` directly — `loadGeoMap` calls `applyRiversToMap` at runtime to set those flags from the segment data.
8. Apply hand-authored historical start positions (hardcoded in the script, validated against the grid — abort with an error if any coord resolves to ocean or mountain).
9. Write TypeScript source files.

### Geographic Resource Zone Table

Resources are assigned by lat/lon bounding boxes. A hex receives a resource if it falls inside the zone and passes the existing 15% terrain-match probability check.

| Resource | Primary zone(s) |
|---|---|
| Horses | Central Asian steppe (40–55°N, 50–100°E); Great Plains (30–50°N, 95–110°W) |
| Iron | Northern Europe (50–65°N, 5–30°E); China (30–45°N, 105–120°E); Great Lakes (40–50°N, 75–95°W) |
| Silk | China interior (30–40°N, 95–115°E) |
| Spices | Southeast Asia (−10–20°N, 95–140°E); South India (8–20°N, 70–85°E) |
| Incense | Arabian Peninsula (15–30°N, 40–60°E); North Africa (15–30°N, 10–40°E) |
| Gems | Sub-Saharan Africa (−30–5°N, 20–40°E); India (10–25°N, 75–85°E); South America (−20–5°N, 65–80°W — Colombia/Brazil emeralds) |
| Ivory | Sub-Saharan Africa (−15–10°N, 10–40°E) |
| Wine | Mediterranean coast (35–47°N, −5–30°E) |
| Copper | Andes (−35–10°S, 65–80°W); Iberia (37–43°N, 5–9°W) |
| Stone | Near mountain terrain globally — not zone-specific; applied to any `hills` hex adjacent to a `mountain` hex, with an 8% chance (matching the existing `placeResources` rule) |

---

## Start Position System

### Historical starts (precomputed in data files, per size)

| Civ | Earth & Old World anchor | New World |
|---|---|---|
| Egypt | Nile delta | constrained random |
| Rome | Italian peninsula | constrained random |
| Greece | Aegean coast | constrained random |
| Babylon | Mesopotamia | constrained random |
| Persia | Iranian plateau | constrained random |
| India | Indus Valley / Ganges plain | constrained random |
| China | Yellow River valley | constrained random |
| Mongolia | Mongolian steppe | constrained random |
| Japan | Japanese islands | constrained random |
| Zulu | Southern Africa | constrained random |
| England | British Isles | Virginia coast (colonizer) |
| France | Northern France | St. Lawrence mouth (colonizer) |
| Spain | Iberian Peninsula | Gulf of Mexico coast (colonizer) |
| Viking | Scandinavia | Newfoundland (colonizer) |
| Germany | Central Europe | constrained random |
| Russia | Eastern European plain | constrained random |
| Ottoman | Anatolia | constrained random |
| Aztec | Central Mexico (Earth only) | Central Mexico |

Aztec does not have a defined start on Old World — treated as constrained random there.

### Fallback rule

Any civ not in the table for the active map script (all fantasy civs; any real civ marked "constrained random" above) runs through the existing `findStartPositions` greedy spacing algorithm. The fallback is seeded and guaranteed to land on a quality tile (land, not tundra/desert, ≥10 land hexes in radius-2 neighborhood).

### Colonizer start definition

A "colonizer start" is just a pre-authored `HexCoord` stored in the `NEW_WORLD_START_POSITIONS` data for the relevant civ. England/France/Spain/Viking each have one coord per size. These coords are coastal land tiles, hand-tuned in the generation script.

---

## Balanced World Generator (`src/systems/balanced-map-generator.ts`)

```typescript
generateBalancedMap(width, height, seed, civCount): { map: GameMap; startPositions: HexCoord[] }
```

`generateBaseTerrain` is exported from `src/systems/map-generator.ts`. `generateBalancedMap` and `generateContinentMap` both import it. `generateMap` is refactored to call `generateBaseTerrain` internally, preserving its existing public API. `civCount` is `config.players.length` (human + opponents) in `createNewGame`.

`createNewGame` uses the `startPositions` returned by this function directly and **does not call `findStartPositions` again** — doing so would recompute different starts and break the balance guarantee.

Both `generateBalancedMap` and `generateContinentMap` set `map.wrapsHorizontally = true` on the `GameMap` they return.

**Steps:**
1. Call `generateBaseTerrain(width, height, seed)` for noise + terrain assignment (no resources, no rivers).
2. Collect all land tile candidates; run the greedy start-position algorithm to pick `civCount` well-spaced starts.
3. Voronoi-assign every hex to its nearest start by wrapped hex distance — each start "owns" a zone.
4. Audit each zone — two independent metrics:
   - **Resource count:** total resources in the zone.
   - **Terrain quality score:** sum of per-tile scores (grassland/plains = 3, forest/hills = 2, coast = 1, desert/tundra/mountain = 0).
5. Level-up under-served zones:
   - For each zone whose resource count is below the mean: add one resource to a valid unoccupied terrain hex in that zone. If no valid hex exists, skip.
   - For each zone whose terrain quality score is below the mean: convert up to 2 desert or tundra hexes within the zone to plains (only if they are land tiles, not coast). This is a light nudge, not a guarantee of parity.
6. Compute the **centroid of all start positions** (average q and r). Search outward from the centroid until a land tile (not ocean, mountain, or tundra) is found. Place a cluster of 3–5 luxury resources on land hexes within 4 tiles of that anchor point, covering 2–3 distinct luxury types.
7. Place standard resources on remaining land tiles procedurally (same 15% chance as `placeResources`).
8. Return `{ map, startPositions }` where `startPositions` are the `civCount` greedy picks from step 2.

---

## Single Continent Generator (`src/systems/continent-map-generator.ts`)

```typescript
generateContinentMap(width, height, seed): { map: GameMap; continentHexes: Set<string> }
```

`continentHexes` is the set of hex keys (from `hexKey(coord)`) that are on the main landmass. `createNewGame` passes this to `findStartPositions` as `candidateHexes` so island tiles are automatically excluded from start candidates.

**Steps:**
1. Initialize all hexes as ocean.
2. Mark the center hex as land unconditionally, then flood-fill BFS outward: expand to a neighbor if `landNoise(q, r) > threshold` (initial threshold 0.1). Continue until ~55% of non-edge hexes are land. If the BFS exhausts reachable candidates before 55%, lower `threshold` by 0.05 and restart. Retry up to 10 times; if 55% is still not reached, accept the largest continent achieved.
3. Force a 3-hex ocean border at all map edges (set any land hex within 3 of the edge back to ocean). Track the surviving land hexes as `continentHexes`.
4. Scatter 3–5 island clusters in the ocean region: pick a random ocean hex ≥5 hexes from the nearest continent edge hex, flood-fill an 8–15 hex blob. Island hexes are **not** added to `continentHexes`.
5. Assign terrain within all land hexes (continent + islands) using `generateBaseTerrain`.
6. Place standard resources procedurally on continent hexes. Place bonus resources (gems, ivory, spices) on island hexes to reward naval exploration.
7. Set `map.wrapsHorizontally = true`.
8. Return `{ map, continentHexes }`.

---

## In-Game Notification for Colonizer Starts

When a game begins and the active civ's start position is a colonizer start (i.e., the civ was looked up in `NEW_WORLD_START_POSITIONS` rather than falling back to constrained random), the advisor system fires a one-time turn-1 notification:

> "Your civilization has established a colonial presence in the New World. Explore and expand to claim this untamed land."

The trigger is: `state.mapScript === 'new-world' && civId is in NEW_WORLD_START_POSITIONS[size] && civId is not 'aztec'`. The Aztec get no notification (Central Mexico is their homeland, not a colony). This notification uses the existing `EventBus` / advisor notification path and does not require new infrastructure.

---

## Required Tests

Tests live in `tests/systems/` mirroring `src/systems/`.

| Test file | What it covers |
|---|---|
| `tests/systems/geo-map-loader.test.ts` | `loadGeoMap` produces correct `Record<string, HexTile>`; `elevation` derived correctly; `wrapsHorizontally` set from parameter; rivers applied via `applyRiversToMap`; defaults initialised for `wonder`, `owner`, etc. |
| `tests/systems/balanced-map-generator.test.ts` | Zone resource counts within 1 of each other after levelling; luxury cluster exists within 4 tiles of start centroid and covers ≥2 distinct types; `startPositions.length === civCount`; `wrapsHorizontally === true`. |
| `tests/systems/continent-map-generator.test.ts` | Land coverage 50–60%; no land within 3 hexes of any map edge; `continentHexes` contains no island tiles; islands contain bonus resources; `wrapsHorizontally === true`. |
| `tests/systems/map-generator.test.ts` (extend) | `findStartPositions` with a geo script returns positions in `civIds` order; known civ gets table coord; unknown civ gets valid land coord; island-excluded candidate set respected. |
| `tests/ui/campaign-setup.test.ts` (extend) | Map type cards render for all 5 scripts; selecting a type updates the description text; `mapScript` is passed through to `GameConfig` on start. |

---

## Out-of-Scope

- Natural wonders (placement on geo maps) — deferred to a follow-up issue
- Hotseat multiplayer: the existing `hotseat-setup.ts` flow also calls `createNewGame`. Map script selection should appear in hotseat setup too, but the UI work for that screen is deferred — hotseat games created before this feature will use `'procedural'` via the backwards-compat default.
- AI civ selection weighted by map script (e.g., preferring Old World civs on Old World) — deferred
- Map script shown on the in-game HUD or save file name — deferred
- Campaign setup map-type preference persistence across sessions — selections reset to Earth + Medium on each open.
