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

---

## Campaign Setup UI

The existing "Map size" section becomes a combined **Map** section with two rows:

**Row 1 — Map type** (5 card buttons, full width):  
`🌍 Earth` · `🗺️ Old World` · `🌎 New World` · `⚖️ Balanced` · `🏝️ Continent`

A short description line below the row updates to describe the selected type. Example for Earth:  
> "Real-world geography. Civilizations start near their historical homelands; fantasy and out-of-region civs get good constrained starts. Resources follow real-world distribution."

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

`'procedural'` is the existing noise-based generator, kept as-is for backwards compatibility with saved games that predate this feature.

### `GameConfig` (`src/core/game-state.ts`)

Add `mapScript: MapScript` (default `'procedural'`). Existing `mapSize` field is unchanged. Saved games that predate this feature and therefore lack `mapScript` must deserialize with `mapScript: 'procedural'` so they continue to work correctly.

### `createNewGame` dispatch

Switch on `config.mapScript` before generating the map:

```
'procedural'        → existing generateMap(w, h, seed)
'earth'             → loadGeoMap(EARTH_TILES, size) + EARTH_START_POSITIONS
'old-world'         → loadGeoMap(OLD_WORLD_TILES, size) + OLD_WORLD_START_POSITIONS
'new-world'         → loadGeoMap(NEW_WORLD_TILES, size) + NEW_WORLD_START_POSITIONS
'balanced'          → generateBalancedMap(w, h, seed, civCount)
'single-continent'  → generateContinentMap(w, h, seed)
```

`loadGeoMap(tiles, size)` lives in a new file `src/systems/geo-map-loader.ts`. It converts the flat tile array for the given size into the `Record<string, HexTile>` format the renderer expects, then applies the river list from the data file.

### `findStartPositions` (`src/systems/map-generator.ts`)

Gains a `mapScript: MapScript` and `civIds: string[]` parameter (civ IDs come from `config.players.map(p => p.civId)` in `createNewGame`). For geo scripts, looks up each civ's coord in the precomputed `*_START_POSITIONS` table for the given size, then falls back to the existing greedy constrained-random algorithm for any civ not in the table.

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

1. Read `scripts/data/ne_110m_admin_0_countries.geojson` — committed to the repo from [Natural Earth](https://www.naturalearthdata.com/) (public domain, ~100 KB). The script fetches and caches it on first run if the file is missing.
2. For each map script × size, define a hex grid of the target dimensions.
3. For each hex, compute the lat/lon of its center using an inverse Mercator projection, cropped to the map's geographic bounds:
   - Earth: full world (−180°→+180° lon, −80°→+80° lat)
   - Old World: −15°→+150° lon, −40°→+70° lat
   - New World: −170°→−30° lon, −60°→+75° lat
4. Determine land/ocean by point-in-polygon test against the GeoJSON country features.
5. Assign terrain from lat/lon + elevation zone rules:
   - |lat| > 65°: `snow` or `tundra`
   - High elevation (major ranges): `mountain`
   - High elevation (foothills): `hills`
   - |lat| < 30°, low moisture: `desert`
   - Tropical (|lat| < 20°, coastal/wet): `jungle`
   - Temperate + moderate moisture: `forest`
   - Central Asian interior: `plains`
   - Mediterranean / temperate coastal: `grassland`
   - Default: `plains`
6. Place resources from the geographic zone table (see below).
7. Mark named river corridors (Nile, Amazon, Yangtze, Mississippi, Congo, Rhine, Ganges, Volga) as `hasRiver: true` on the relevant hex band.
8. Apply hand-authored historical start positions (hardcoded in the script, validated against the grid — error if the computed coord is ocean).
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
| Gems | Sub-Saharan Africa (−30–5°N, 20–40°E); India (10–25°N, 75–85°E) |
| Ivory | Sub-Saharan Africa (−15–10°N, 10–40°E) |
| Wine | Mediterranean coast (35–47°N, −5–30°E) |
| Copper | Andes (−35–10°S, 65–80°W); Iberia (37–43°N, 5–9°W) |

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

```
generateBalancedMap(width, height, seed, civCount) → GameMap
```

1. Generate base terrain by calling a new shared helper `generateBaseTerrain(width, height, seed): Record<string, HexTile>` extracted from `map-generator.ts` (the noise + terrain assignment logic, without resource placement or river generation). `civCount` comes from `config.players.length` in `createNewGame`.
2. Collect all land tile candidates; run the greedy start-position algorithm to pick `civCount` well-spaced starts.
3. Voronoi-assign every hex to its nearest start by wrapped hex distance — each start "owns" a zone.
4. Audit each zone:
   - Score terrain quality (grassland/plains > forest/hills > desert/tundra).
   - Count existing resources.
5. For each zone below the median resource count: add one resource to a valid unoccupied terrain hex within the zone.
6. Place a cluster of 3–5 luxury resources on hexes within 3 tiles of the geographic center of the map, creating a contested region equidistant from all starts.
7. Return the adjusted `GameMap`; start positions are the `civCount` greedy picks from step 2.

---

## Single Continent Generator (`src/systems/continent-map-generator.ts`)

```
generateContinentMap(width, height, seed) → GameMap
```

1. Initialize all hexes as ocean.
2. Flood-fill outward from the map center: at each step, expand to a neighbor if `landNoise(q, r) > threshold`. Continue until ~55% of non-edge hexes are land.
3. Force a 3-hex ocean border at all map edges so the continent never reaches the horizontal wrap seam.
4. Scatter 3–5 island clusters in the ocean ring: pick a random ocean hex ≥5 hexes from the continent edge, flood-fill a 8–15 hex blob using the same noise function with a higher threshold.
5. Assign terrain within all land hexes using the existing `getTerrain` noise functions.
6. Place standard resources procedurally on the continent; place bonus resources (gems, ivory, spices) on island hexes to reward naval exploration.
7. Start positions use the existing greedy max-distance algorithm restricted to continent hexes (islands excluded from start candidates).

---

## Out-of-Scope

- Natural wonders (placement on geo maps) — deferred to a follow-up issue
- Hotseat multiplayer map-script selection (each player sees the same map; no per-player script) — no changes needed
- AI civ selection weighted by map script (e.g., preferring Old World civs on Old World) — deferred
- Map script shown on the in-game HUD or save file name — deferred
