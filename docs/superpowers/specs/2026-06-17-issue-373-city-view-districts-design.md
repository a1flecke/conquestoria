# City View Redesign — Districts & Citizens (Issue #373)

## Overview

Two-MR redesign of the city panel. The current 7×7 square building grid and positional adjacency bonus system are removed entirely. In their place, the city panel gains two purpose-built views: a **Districts tab** (visual exploration of what has been built, grouped by theme) and a **Citizens tab** (citizen allocation with focus modes as the primary control).

---

## MR1: Grid & Adjacency Removal

### Motivation

The 7×7 building grid does not scale as cities age and building counts grow. Adjacency bonuses couple building placement to spatial position in a way the player cannot intuit and the grid renders poorly. Building yields are intrinsic — a Granary gives food because it is a Granary, not because of where it sits.

### `city-center` fate

`city-center` is a grid-only concept: it lives at `grid[3][3]` and is never in `city.buildings`. It has no yield definition in `BUILDINGS` — it exists solely as an adjacency target for rules like `{ building: 'library', adjacentTo: 'city-center', bonus: { science: 1 } }`. Since those rules are removed with the grid, `city-center` disappears cleanly. No migration is needed for `city-center`. It does not appear in the Districts view.

### Balance: intrinsic yield adjustment

Removing adjacency bonuses reduces the effective yield of buildings that were commonly placed near `city-center` or each other. The affected base yields must be increased in the same MR to maintain pre-removal parity:

| Building | Old effective yield (with typical adjacency) | Adjustment |
|---|---|---|
| Library | +2 science + typically +1 (near city-center) | raise base to +3 science |
| Granary | +2 food + typically +1 (near city-center) | raise base to +3 food |
| Workshop | +2 production + typically +1 (near city-center) | raise base to +3 production |
| Marketplace | +3 gold + typically +1 (near city-center) | raise base to +4 gold |

Less-common adjacency pairs (Library+Temple, Marketplace+Harbor, Workshop+Forge, etc.) are situational bonuses that players were unlikely to reliably achieve; those bonuses are removed without compensation. The net effect on a typical city is neutral or slightly positive.

### Data model

Remove from the `City` interface in `src/core/types.ts`:
- `grid: (string | null)[][]`
- `gridSize: 3 | 5 | 7`

Remove from the `Building` interface in `src/core/types.ts`:
- `adjacencyBonuses?: AdjacencyBonus[]`

Remove the `AdjacencyBonus` type from `src/core/types.ts` if it is not referenced elsewhere.

Remove the `adjacencyBonuses: []` literal from every building definition in `src/systems/city-system.ts`.

### Systems

- **`src/systems/adjacency-system.ts`** — delete the file entirely. Exports removed: `ADJACENCY_RULES`, `calculateAdjacencyBonuses`, `getTotalAdjacencyYields`, `findOptimalSlot`, `isSlotUnlocked`, `getGridNeighbors`.
- **`src/systems/resource-system.ts`** — remove the `getTotalAdjacencyYields` call and the surrounding `if (city.grid)` block from the city yield calculation. Building yields continue to sum from `city.buildings` using each building's `yields` field.
- **`src/systems/city-system.ts`** — remove `createEmptyCityGrid`, grid initialization in `foundCity` (the `grid[3][3] = 'city-center'` placement and `grid`/`gridSize` fields in the returned city object), `getUnplacedBuildings`, and all `findOptimalSlot` / `isSlotUnlocked` usage. Apply the base yield adjustments from the balance table above.
- **`src/systems/city-maturity-system.ts`** — remove `gridSize` from all maturity level definitions, from the `CityMaturityLevel` type, and from the maturity upgrade logic. Leave `districtPages` for now; MR2 removes it.

### Save migration

`src/storage/save-manager.ts`: when loading a saved game, strip `grid` and `gridSize` from any city object that has them. Saves created before this MR load cleanly; the grid was UI/placement state, not gameplay state.

### UI

- **`src/ui/city-grid.ts`** — remove `renderBuildingBoard`, the "Unplaced buildings — tap one to place it" section, and the `activePlacingId` placing-state logic. Remove the `onPlaceBuilding?: (buildingId: string, row: number, col: number) => void` field from `CityGridCallbacks`. The file continues to contain the Citizens (worked-land) section; it is not deleted in this MR.

### Tests

- Delete or update any test that exercises adjacency bonus calculation.
- Add a yield regression for a city with `[granary, library, workshop, marketplace]`: verify the total yields equal the sum of the updated intrinsic yields with no adjacency component (i.e., the adjacency rules produce exactly zero contribution).
- Specifically assert that `[library, temple]` does **not** produce the old Library+Temple adjacency bonus of +2 science.
- Add a save-migration test: loading a serialised city that contains `grid` and `gridSize` fields produces a valid `City` object without those fields, and yields calculate correctly from `buildings` alone.

---

## MR2: Districts Tab + Citizens Tab

### Tab structure

The city panel tab bar changes from `List | Grid | Wonders` to:

```
Queue | Districts | Citizens | Wonders
```

The `CityPanelTab` type becomes `'list' | 'districts' | 'citizens' | 'wonders'`. This renames `'grid'` to `'districts'`, adds `'citizens'`, and formally adds `'wonders'` which existed as a tab but was not in the type. The `'list'` tab label changes from "List" to "Queue" in the UI — no logic change, purely a display rename to better describe its purpose.

### Districts tab

**Purpose**: "Here is what this city has become." A read-only view of every building the city contains, grouped by thematic district. No forward-looking content — no hints about what could be built, no tech-tree peeking, no empty placeholder cards.

**District derivation**: at render time, group `city.buildings` by the `category` field from `BUILDINGS[id]`. Districts are computed, not stored.

**Render rule**: render a district card only if `city.buildings` contains at least one building of that category. A brand-new city with an empty `buildings` array shows an empty-state message: *"No districts yet — build your first building to found one."*

**District card ordering**: render in this fixed order so the most fundamental districts always appear first:

1. Food Quarter
2. Industry
3. Academy
4. Commerce
5. Garrison
6. Culture Quarter
7. Shadow Network *(espionage)*

**District themes** (category → display name, icon, accent colour):

| Category | District name | Icon | Accent |
|---|---|---|---|
| `food` | Food Quarter | 🌾 | `#64c864` |
| `production` | Industry | ⚒️ | `#d98c4a` |
| `science` | Academy | 🔭 | `#4a90d9` |
| `economy` | Commerce | 🏪 | `#e8c170` |
| `military` | Garrison | ⚔️ | `#d94a4a` |
| `culture` | Culture Quarter | 🎭 | `#b464d9` |
| `espionage` | Shadow Network | 🕵️ | `#7a8899` |

**District card structure** (per district):
- **Header**: accent-coloured icon, district name, and a total yield summary for that category.
- **Body**: one row per building — icon, building name, yield string. Always expanded; no collapse affordance needed for MVP. A mature city with 4–6 buildings per district is comfortable in a scrollable panel.

**Total yield summary format**: show all non-zero yield types summed across the district's buildings, e.g. `+6 food/turn` or `+3 gold · +1 food/turn` for mixed-yield districts. Omit zero types entirely.

**Zero-yield buildings** (Barracks, Walls, Stable, espionage buildings): in the building row's yield field, show `BUILDINGS[id].description` in place of a yield string. The existing descriptions already contain the relevant effect text (e.g. "Defends the city", "Trains mounted units").

**Building row ordering within a district**: match the order buildings appear in `city.buildings` (i.e., build order). This means older buildings appear first, which gives a satisfying chronicle of the city's growth.

### Citizens tab

**Purpose**: control which tiles citizens work. Focus modes are the primary control; hex tile assignment is the manual override for players who want fine-grained control.

**Focus modes** (unchanged from current system): `balanced`, `food`, `production`, `gold`, `science`. Displayed as a row of buttons; the active named mode is highlighted gold. When focus is `custom` (set by tapping tiles), show a greyed-out "Custom" indicator in the row so the player can see they have overridden the auto-assignment; clicking any named focus button exits custom mode.

**Yield summary**: directly below the focus buttons, show a one-line summary of the current focus effect, e.g.:
- Named mode: *"Food focus: auto-assigning to highest food tiles — +8 food/turn, growing in 14 turns"*
- Custom mode: *"Custom assignment — 5 tiles worked, 2 unassigned"*

The summary recalculates from `calculateProjectedCityYields` and matches the yields shown in the panel header.

**Manual override section**: separated by a divider and labelled *"Manual override — tap tiles to reassign"*. Shows each workable tile from `getWorkableTilesForCity(state, city.id)` as a compact card:
- Terrain icon (same icon system used in the main map)
- Yield string (e.g. `+3 🌾` or `+2 ⚒️ +1 💰`)
- Status indicator: a green dot and "working" label when worked; dim "idle" label when not

Tapping a worked tile unworks it; tapping an idle tile works it if a citizen is available. If no citizens are unassigned, tapping an idle tile does nothing — the tile card shows a muted appearance (reduced opacity) and is non-interactive. Either successful tap calls `onToggleWorkedTile` and sets focus to `custom`. The focus button row immediately reflects the switch to Custom.

**Unassigned citizen count**: shown in the panel sub-header line ("Pop 7 · 5 citizens working · 2 unassigned"), not repeated inside the tab body.

### Implementation notes

- **`src/ui/city-districts.ts`** (new file): exports `createCityDistrictsTab(city: City): HTMLElement`. Imports `BUILDINGS` from `city-system.ts`. No callbacks needed — the tab is read-only. If `BUILDINGS[id]` is undefined for a building ID in `city.buildings` (possible with old saves), skip that building silently rather than throwing.
- **`src/ui/city-grid.ts`**: export the Citizens section as `createCityWorkSection(city, state, options): HTMLElement` so `city-panel.ts` can call it from the Citizens tab handler.
- **`src/systems/city-maturity-system.ts`**: remove `districtPages` from all maturity level definitions and from the `CityMaturityLevel` type. District presence is now derived from `city.buildings` at render time.
- No new state fields are added to `City` or `GameState`.

### Tests

- **Empty state**: `createCityDistrictsTab` with `city.buildings = []` renders the *"No districts yet"* message and no district cards.
- **Card presence**: `createCityDistrictsTab` renders exactly one card per distinct building category present in `city.buildings`.
- **No peeking**: a city that has Food and Science buildings but no Economy buildings renders no Commerce card — even if Commerce buildings are tech-unlocked.
- **Card ordering**: given buildings from `food`, `military`, and `science` categories, the rendered cards appear in the spec-defined order (Food Quarter first, Academy second, Garrison third).
- **Zero-yield row**: a Barracks building row shows its description text, not a yield string.
- **Multi-yield header total**: a district containing a Harbor (food + gold) shows both yield types in the header total string.
- **Building row order**: buildings within a district appear in `city.buildings` insertion order.
- **Citizens tab focus buttons**: clicking a named focus button calls `onSetCityFocus` with the correct value.
- **Citizens tab tile tap**: tapping an idle tile when citizens are available calls `onToggleWorkedTile` and the focus indicator switches to Custom.
- **Citizens tab — no available citizens**: tapping an idle tile when all citizens are assigned does not call `onToggleWorkedTile` and does not change focus.
- **Citizens tab yield summary**: switching focus mode updates the summary text to reflect the new focus.
