# City View Redesign — Districts & Citizens (Issue #373)

## Overview

Two-MR redesign of the city panel. The current 7×7 square building grid and positional adjacency bonus system are removed entirely. In their place, the city panel gains two purpose-built views: a **Districts tab** (visual exploration of what has been built) and an improved **Citizens tab** (citizen allocation).

---

## MR1: Grid & Adjacency Removal

### Motivation

The 7×7 building grid does not scale as cities age and building counts grow. Adjacency bonuses (e.g. Library adjacent to Temple → +2 science) couple building placement to spatial position in a way the player cannot intuit. Building yields are intrinsic — a Granary gives food because it is a Granary, not because of what is next to it.

### Data model

Remove from the `City` interface in `src/core/types.ts`:
- `grid: (string | null)[][]`
- `gridSize: 3 | 5 | 7`

Remove the `adjacencyBonuses: []` field from every building definition in `src/systems/city-system.ts`.

### Systems

- **`src/systems/adjacency-system.ts`** — delete the file entirely. All exports (`ADJACENCY_RULES`, `calculateAdjacencyBonuses`, `getTotalAdjacencyYields`, `findOptimalSlot`, `isSlotUnlocked`, `getGridNeighbors`) are removed.
- **`src/systems/resource-system.ts`** — remove the `getTotalAdjacencyYields` call and the surrounding `if (city.grid)` block from the city yield calculation. Building yields continue to sum from `city.buildings` using each building's `yields` field.
- **`src/systems/city-system.ts`** — remove `createEmptyCityGrid`, grid initialization in `createCity` (the `grid[3][3] = 'city-center'` placement), `getUnplacedBuildings`, and any `findOptimalSlot` usage.
- **`src/systems/city-maturity-system.ts`** — remove `gridSize` from all maturity level definitions and from the maturity upgrade logic. Leave `districtPages` in place for now; MR2 removes it once district derivation is live.

### Save migration

`src/storage/save-manager.ts`: when loading a saved game, strip `grid` and `gridSize` from any city object that has them. Saves created before this MR load cleanly; no data is lost because the grid was UI state, not gameplay state.

### UI

- **`src/ui/city-grid.ts`** — remove `renderBuildingBoard`, the "Unplaced buildings — tap one to place it" flow, and the `activePlacingId` placing-state logic. The file continues to contain the Citizens (worked-land) section; it is not deleted yet.

### Tests

- Delete or update any test that exercises adjacency bonus calculation.
- Add a yield regression: a city with `[granary, library, workshop]` produces the correct sum of intrinsic building yields with no adjacency component.
- Add a save-migration test: loading a serialised city that contains `grid` and `gridSize` fields produces a valid `City` object without those fields.

---

## MR2: Districts Tab + Citizens Tab

### Tab structure

The city panel tab bar changes from `List | Grid | Wonders` to:

```
Queue | Districts | Citizens | Wonders
```

The `CityPanelTab` type is updated accordingly: `'list' | 'districts' | 'citizens' | 'wonders'` (renaming `grid` to `districts`, adding `citizens`, and adding `wonders` which currently exists as a tab but was not in the type).

### Districts tab

**Purpose**: "Here is what this city has become." A read-only view of every building the city contains, grouped by thematic district. No forward-looking content — no hints about what could be built, no tech-tree peeking.

**District derivation**: districts are derived at render time from `city.buildings` by grouping each building ID by its `category` field from `BUILDINGS`. No new state is stored.

**Render rule**: a district card is only rendered if `city.buildings` contains at least one building of that category. A city with no economy buildings shows no Commerce district — the tab adapts to exactly what exists.

**District themes** (category → display name, icon, accent colour):

| Category | District name | Icon | Accent |
|---|---|---|---|
| `food` | Food Quarter | 🌾 | `#64c864` |
| `production` | Industry | ⚒️ | `#d98c4a` |
| `science` | Academy | 🔭 | `#4a90d9` |
| `economy` | Commerce | 🏪 | `#e8c170` |
| `military` | Garrison | ⚔️ | `#d94a4a` |
| `culture` | Culture Quarter | 🎭 | `#b464d9` |
| `espionage` | Intelligence | 🕵️ | `#888888` |

**District card structure** (per district):
- Header: icon, district name, total yield contribution for this category (sum of all contained buildings' yields, displayed as `+N food/turn` etc.)
- Expanded body: one row per building — icon, name, individual yield string
- Cards are always expanded (no collapse interaction needed for MVP)

**Yield display**: only show yield types with a non-zero value. Buildings with all-zero yields (e.g. Barracks, Walls, Stable, espionage buildings) show `BUILDINGS[id].description` in place of a yield string — the existing description field already contains the relevant effect text.

### Citizens tab

**Purpose**: control which tiles citizens work. Focus modes are the primary control; hex tiles are the manual override.

**Focus modes** (unchanged from current system): `balanced`, `food`, `production`, `gold`, `science`. Displayed as a row of buttons; the active mode is highlighted. Switching mode calls the existing `onSetCityFocus` callback.

**Yield summary**: below the focus buttons, a one-line summary shows the effect of the current focus on total yields and the relevant consequence (e.g. "Food focus: +8 food/turn — growing in 14 turns").

**Manual override section**: separated by a divider, labelled "Manual override — tap tiles to reassign". Shows each workable hex tile as a small card with terrain icon, yield string, and a worked/idle indicator. Tapping a tile calls `onToggleWorkedTile` and sets focus to `custom`. Switching back to a named focus mode clears manual overrides.

**Unassigned citizen count**: shown in the panel sub-header ("Pop 7 · 5 citizens working · 2 unassigned"). Not repeated inside the tab body.

### Implementation notes

- `city-grid.ts` is updated to export the Citizens section as a standalone render function, callable from the new tab structure in `city-panel.ts`.
- The Districts render function lives in a new `src/ui/city-districts.ts` — `city-panel.ts` is already ~965 lines and the district grouping logic warrants its own file.
- Remove `districtPages` from all maturity level definitions in `src/systems/city-maturity-system.ts`; district presence is now derived from `city.buildings` at render time, not stored on the maturity level.
- No new state fields are added to `City` or `GameState`.

### Tests

- Districts tab renders zero cards for a city with an empty `buildings` array.
- Districts tab renders exactly one card per distinct building category present in `city.buildings`.
- Districts tab does not render a card for a category not represented in `city.buildings` (tech-tree / future-building isolation).
- Citizens tab: switching a focus mode calls `onSetCityFocus` with the correct focus value.
- Citizens tab: tapping a hex tile calls `onToggleWorkedTile` and switches focus to `custom`.
