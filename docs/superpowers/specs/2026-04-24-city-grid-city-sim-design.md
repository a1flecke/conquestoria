# City Grid And Worked Land Design

## Summary

Improve the city Grid tab so it becomes a real city management surface instead of a mostly inert visual. This design addresses:

- [Issue #114](https://github.com/a1flecke/conquestoria/issues/114): improved farms do not show in city grid, and city inhabitants cannot be assigned to land.
- [Issue #116](https://github.com/a1flecke/conquestoria/issues/116): completed Barracks do not show in city grid.
- [Issue #31](https://github.com/a1flecke/conquestoria/issues/31): players do not understand what Grid view does.

The first delivery should create immediate value while laying a durable foundation for a deeper city simulation over many milestones and multiple MRs.

## Audiences

The UI must work for two primary audiences:

- Kids ages 7-12 on laptop and iPad. They need clear labels, helpful focus buttons, visible people working tiles, and forgiving automation.
- An adult on iPhone. The city view must keep tap targets readable, avoid giant unstructured grids, and support quick decisions without requiring precision editing.

## Design Goals

- Make completed buildings render truthfully in the building grid.
- Make farms, mines, water tiles, and other worked land visibly useful.
- Make citizen assignment affect actual yields, not just UI.
- Add focus modes that let casual players say what a city should prioritize.
- Preserve manual control for players who want to tune worked tiles.
- Allow city maturity to grow with population and flexible technology milestones.
- Keep the maximum city grid at 7x7 with a true center tile.
- Prevent city crowding and overlapping worked tiles across every civilization.
- Make the design sliceable into small MRs that each deliver visible gameplay value.

## Non-Goals For The First MR

- Do not implement specialists, governors, housing, amenities, pollution, district adjacency, offshore improvements, or tile purchasing yet.
- Do not require a complete city-builder economy rewrite.
- Do not add an 8x8 grid.
- Do not make straight turn count a maturity requirement.
- Do not hide manual controls behind automation only.

## City Maturity

Cities have maturity types that match the tech era structure:

| Maturity | Era | Initial Population Threshold | Required Maturity Tech Count | City Layout Unlock |
|---|---:|---:|---:|---:|
| Outpost | 1 | 1 | 0 | 3x3 core |
| Village | 2 | 3 | 1 | 3x3 core plus first Worked Land And Water district page |
| Town | 3 | 5 | 2 | 5x5 building grid |
| City | 4 | 8 | 3 | 5x5 grid plus advanced district pages |
| Metropolis | 5 | 12 | 4 | 7x7 building grid |

Population thresholds are tuning constants, not sacred balance. They must live in typed maturity definitions so later MRs can adjust them without rewriting UI or tests. The structural rule is stable: later maturity requires more people and more qualifying knowledge.

Maturity tech requirements are flexible groups, not single hard gates. A city should not be blocked forever because the player skipped exactly one named tech. Qualifying maturity techs must be explicit metadata, not inferred from all techs in a track.

Likely qualifying tracks include civics, construction, agriculture, medicine, science, and economy when the tech represents settlement organization or urban systems. Examples include `early-empire`, `state-workforce`, `civil-service`, `foundations`, `masonry`, `aqueducts`, `arches`, `city-planning`, `granary-design`, `crop-rotation`, `fertilization`, `sanitation`, `medicine`, `surgery`, `engineering`, and `currency`.

Maturity upgrades happen automatically when a city meets both requirements. The player sees a short positive notification, for example: `Ephyra became a Town. New city slots unlocked.`

## Grid Shape

The building grid grows to a maximum of 7x7. The city center remains a single true center tile.

Because even-sized square grids do not have a single true center, maturity levels do not use literal 4x4 or 6x6 centered grids. Full square-grid expansion happens in odd rings:

- Outpost: 3x3 centered in the 7x7 model
- Village: 3x3 core plus the first district page for worked land and water
- Town: 5x5 centered in the 7x7 model
- City: 5x5 plus advanced district pages and additional non-grid city systems
- Metropolis: 7x7 centered in the 7x7 model

Implementation may store a 7x7 grid immediately and unlock centered odd-ring subsets, or migrate from the existing 5x5 shape to a 7x7 shape. Either way, UI and systems must treat locked slots as unavailable and must never silently hide completed buildings.

## District Pages

The city view should support district pages so the interface remains usable on iPhone while the city grows.

The first version keeps the current Grid tab but turns it into a structured city-management screen:

- **Overview**: city maturity, focus, yields, worked citizen count, and building grid summary.
- **Buildings/Core**: centered building grid, city center, placed buildings, unplaced buildings if any, adjacency details.
- **Worked Land And Water**: every workable owned tile with terrain, water/land type, improvement, total yield, worked/unworked state, and focus controls.

Later district pages can add Industry, Commerce, Culture, Military, Specialists, and Administration. The design should not force all late-game interactions into one tiny board.

## Building Grid Rules

Completed buildings must appear in the building grid.

When a building completes:

- Add it to `city.buildings`.
- Auto-place it in the best available unlocked grid slot using adjacency scoring.
- If no unlocked slot exists, keep it in `city.buildings` and add it to an unplaced-building list or equivalent derived state.
- The grid UI must show unplaced buildings with clear text and no silent hiding.

Auto-placement is required for the first MR. Manual building relocation can come later.

Barracks is the immediate regression target: a completed Barracks must render in the grid after completion.

## Worked Land And Water

Citizens work explicit tiles. The city center gives fixed base yield and does not consume a citizen.

`city.workedTiles` is the source of worked-land yields. The old implicit behavior, `ownedTiles.slice(0, population)`, may be used only as migration/default fallback when a city has no valid `workedTiles` yet.

Workable tiles include:

- owned land tiles around the city, excluding invalid terrain such as mountain if it cannot be worked
- owned water tiles where citizens can fish, trap, gather reeds, collect shellfish, or work coastal commerce
- tiles with completed improvements
- unimproved tiles with base terrain yields
- future water improvements such as fisheries, offshore wind farms, oil rigs, sea platforms, and harbor-linked commerce

Water must be a first-class city-work tile type, not a later exception. Worker build rules may still limit which improvements can be built today, but the city assignment model must allow water work.

Each worked-land row or card must show:

- terrain or water type
- improvement state, including completed farm/mine
- total yield contribution
- worked/unworked state
- whether focus selected it
- whether another city already works it, when relevant

## City Spacing, Territory, And Work Claims

City growth needs rules for where cities can exist and which city can use each tile. These rules are gameplay rules, not UI preferences.

### City Spacing

Player and major-civ AI city centers must be at least 4 hexes away from every existing city center, regardless of owner. Distance 4 is allowed; distance 3 or less is blocked. This creates a believable rural catchment around each settlement while still leaving enough room for kids to expand on normal maps without the game feeling empty. It also gives cities room to grow into a 7x7 management model without making overlap impossible.

Minor-civ placement may keep stricter rules where they already exist, such as larger spacing from starts, other minor civs, and camps. The shared hard rule remains: no newly founded city may violate the 4-hex city-center minimum against any existing player, AI, or minor-civ city.

Spacing must use wrapped distance on wrapped maps. A city near the left map edge cannot be founded too close to a city mirrored across the right edge.

Existing saves and captured cities are grandfathered. The rule prevents new too-close founding; it does not delete, move, or invalidate cities that already exist.

### Territory Versus Active Work

The game should distinguish three related concepts:

- **Civilization control**: `map.tiles[hexKey(coord)].owner` tells which civilization controls the tile.
- **City workable area**: tiles a city may consider for assignment based on city position, maturity, ownership/control, terrain, water access, and future district rules.
- **Active work claim**: exactly one city is currently using a tile for citizen yields.

`city.workedTiles` remains the authoritative save data for active work assignments. A shared territory/work system builds a central `CityWorkClaimIndex` from all cities whenever assignments are validated, changed, or displayed:

```ts
interface TileWorkClaim {
  cityId: string;
  civId: string;
  coord: HexCoord;
}

type CityWorkClaimIndex = Record<string, TileWorkClaim>;
```

The invariant is strict: a hex key may have at most one active work claim across all cities and all civilizations. This includes:

- two cities owned by the same civilization
- cities owned by different major civilizations
- minor-civ cities
- cities near a wrapped map edge

If an older save or a future migration produces duplicate claims, normalization resolves them deterministically:

1. Remove claims from cities that no longer control the tile.
2. Prefer a city owned by the tile controller.
3. Prefer the city whose center is closest to the tile.
4. Break remaining ties by stable city id order.
5. Refill losing cities from their focus mode when possible.

### Cross-Civ Boundary Pressure

A city may work only tiles currently controlled by its civilization, unless a later feature explicitly grants shared access through diplomacy, trade, vassalage, or occupation rules. No such shared-access exception is part of the first implementation.

When another civilization's boundary growth, conquest, culture pressure, minor-civ expansion, or capture changes tile ownership, the territory system must invalidate any worked-tile claims held by cities that no longer control those tiles. If the losing city has a non-custom focus, it should immediately choose replacement tiles if valid unclaimed tiles are available. If the losing city is custom, it should remove invalid tiles and leave open citizen slots visible to the player.

The current player should receive a compact notification when one of their cities loses active worked tiles because of ownership changes, for example: `Ephyra lost 2 worked tiles near the border.` Avoid noisy notifications for hidden foreign-only changes.

### Assignment Behavior

Focus assignment and manual assignment both consult the central claim index.

- Focus assignment skips tiles already worked by another city.
- Manual assignment refuses a claimed tile and shows who is working it.
- If the claimed tile belongs to another city owned by the same player, the first implementation should show `Worked by Corinth` and keep the tile disabled. A later MR can add a deliberate transfer action.
- If the claimed tile belongs to a foreign city, the UI should show `Worked by another city` unless the foreign city name is visible through normal intel.

This is what keeps larger cities friendly: overlap is allowed in the potential workable area, but active work is exclusive and legible.

## Focus Modes

Cities have persistent focus:

- `balanced`
- `food`
- `production`
- `gold`
- `science`
- `custom`

Focus buttons are kid-friendly automation. When a player chooses Food, Production, Gold, Science, or Balanced, the system assigns the best available tiles for that focus up to population.

Manual tile toggles switch the city to `custom`. Custom assignments persist until invalid or until the player chooses a focus again.

Focus reassignment runs when:

- city population changes
- an improvement completes on a workable city tile
- city ownership/owned tiles change
- a worked tile becomes invalid
- the player changes focus

If a focus reassignment changes worked tiles because of a meaningful event, show a short notification such as `Ephyra reassigned citizens for Food focus.`

Focused cities should occasionally remind the player they are still focused. Use a default cadence of about seven turns per city for non-balanced, non-custom focus, stored as `lastFocusReminderTurn`. Avoid reminders while the city panel is already open for that city.

## Map Feedback

The map must show worked tiles with person-style markers rather than abstract pips. Each person marker carries a small focus glyph on the marker itself, so players can understand:

- someone is working this tile
- what the city is currently focused on

Examples:

- person marker with food glyph for Food focus
- person marker with hammer glyph for Production focus
- person marker with coin glyph for Gold focus
- person marker with science glyph for Science focus
- neutral glyph for Balanced or Custom

Markers must respect fog of war and map wrapping. A viewer should only see worked markers for visible tiles.

## Data Model

Add typed city fields:

```ts
export type CityFocus = 'balanced' | 'food' | 'production' | 'gold' | 'science' | 'custom';
export type CityMaturity = 'outpost' | 'village' | 'town' | 'city' | 'metropolis';

interface City {
  workedTiles: HexCoord[];
  focus: CityFocus;
  maturity: CityMaturity;
  lastFocusReminderTurn?: number;
  grid: (string | null)[][];
  gridSize: 3 | 5 | 7;
}
```

The implementation may derive `maturity` from population and completed techs instead of persisting it, but player-facing UI and save migration must still behave consistently. If persisted, migration must normalize it on load and after turn processing.

Add typed city-territory definitions:

```ts
export const MIN_CITY_CENTER_DISTANCE = 4;

interface CityFoundingBlocker {
  reason: 'too-close' | 'invalid-terrain' | 'occupied' | 'unreachable';
  cityId?: string;
  cityName?: string;
  distance?: number;
}
```

`CityWorkClaimIndex` should be derived from `city.workedTiles`, not stored as separate long-term save truth in the first implementation. A later optimization may cache it, but save/load must never trust a stale cached index over city assignments plus map ownership.

Add typed maturity definitions, for example:

```ts
interface CityMaturityDefinition {
  id: CityMaturity;
  era: number;
  populationRequired: number;
  maturityTechsRequired: number;
  gridSize: 3 | 5 | 7;
  districtPages: string[];
}
```

Add explicit tech metadata for maturity qualification rather than inferring from text.

## System Ownership

Shared gameplay logic should live outside UI:

- `src/systems/city-territory-system.ts`
  - define `MIN_CITY_CENTER_DISTANCE`
  - validate founding positions against all existing cities
  - return player-facing founding blockers
  - build the central work-claim index
  - expose whether a tile is unclaimed, worked by this city, worked by another friendly city, or worked by a visible/hidden foreign city
  - normalize duplicate or invalid work claims after save load, territory changes, capture, razing, or migration

- `src/systems/city-work-system.ts`
  - derive workable tiles
  - calculate tile yield contributions
  - choose worked tiles by focus
  - set focus
  - manually work/unwork tiles
  - normalize invalid worked tiles
  - require a `CityWorkClaimIndex` or equivalent claim resolver before assigning tiles

- `src/systems/city-maturity-system.ts`
  - define maturity tiers
  - count qualifying maturity techs
  - resolve city maturity
  - return upgrade transitions

- existing `src/systems/city-system.ts`
  - initialize new city fields
  - grow grid to 7x7 model
  - auto-place completed buildings

- existing player and AI founding callers
  - call shared founding validation before invoking `foundCity`
  - surface or react to `CityFoundingBlocker` results without duplicating the validation rules

- existing `src/systems/resource-system.ts`
  - calculate city yields from explicit `workedTiles`
  - keep building and adjacency yield behavior

UI handlers should call these helpers and rerender. They must not reimplement eligibility or yield calculation in parallel.

Player founding and AI founding must use the same validation helper. The player action should disable or reject founding with a clear message such as `Too close to Ephyra`. AI settlers should choose another valid site instead of bypassing the rule.

## UI Contract

The city panel must visibly refresh after every action that changes the same panel:

- focus button clicked
- tile worked
- tile unworked
- building completion reflected after rerender
- maturity upgrade reflected after turn processing

The Worked Land And Water page must keep every workable tile reachable. Recommendations or focus sorting can reorder the list, but cannot hide lower-ranked tiles without a tested `Show all` affordance.

Tiles that are in this city's potential workable area but already claimed by another city must remain visible in the appropriate filtered view or show-all state. They are unavailable for assignment and labeled with the claim reason.

The panel should use simple labels:

- `Worked 3/5 citizens`
- `Food focus`
- `Needs 1 more settlement tech`
- `Needs 2 more population`
- `Water work: fishing/trapping`
- `Worked by Corinth`
- `Too close to Ephyra`

The UI should not explain controls with large tutorial paragraphs. It should use clear labels, compact helper text, and visible state.

## Testing Requirements

System tests:

- founding a city initializes focus, worked tiles, maturity, and a 7x7-compatible grid
- founding a city fails when it is within 3 hexes of an owned city
- founding a city fails when it is within 3 hexes of a foreign or minor-civ city
- founding distance uses wrapped distance on wrapped maps
- player and AI founding use the same spacing helper
- worked tiles drive yields, including farm yield
- water tiles can be selected and contribute water yields
- city center yields do not consume a citizen
- focus assignment selects the best tiles for food/production/gold/science
- focus assignment skips tiles claimed by another city
- manual assignment switches focus to `custom`
- manual assignment refuses a tile claimed by another city
- invalid worked tiles are removed and replaced when focus allows
- cross-civ ownership changes invalidate losing cities' worked tiles
- the work-claim index never returns two active city claims for the same hex key
- maturity requires both population and enough qualifying maturity techs
- near-miss maturity cases fail: population without techs, techs without population
- maturity upgrades unlock the correct grid size or district page set
- completed Barracks auto-places in the building grid
- completed buildings with no slot are surfaced as unplaced, not hidden

UI tests:

- Grid tab shows Buildings/Core and Worked Land And Water sections
- a farm tile appears with its improvement and yield
- water tile appears as workable
- claimed overlap tile appears as unavailable with `Worked by ...` text when the city is known
- clicking a focus button rerenders worked tiles and visible yields
- manual tile toggle rerenders immediately and shows `Custom`
- blocked founding shows `Too close to ...` and does not consume the settler
- every workable tile remains reachable from the panel
- unplaced buildings are visible when present

Renderer tests:

- worked-person markers render for visible worked tiles
- markers carry the focus glyph
- markers do not render through fog
- markers respect horizontal wrapping

Save/load tests:

- older saves without `workedTiles`, `focus`, or `maturity` normalize on load
- older saves with duplicate worked-tile claims normalize to one claim per tile
- older 5x5 grids normalize into the new 7x7-compatible shape without losing buildings

## Suggested MR Slicing

MR 1 should be valuable on its own:

- data fields and migration
- shared city spacing validation
- city work-claim index and duplicate-claim normalization
- explicit worked tiles
- focus assignment
- farm and water visibility in the city panel
- completed building auto-placement
- Barracks regression coverage

Later MRs can add:

- district-page polish and deeper mobile ergonomics
- worked-person map markers
- richer water improvements
- manual building relocation
- specialists
- industry/commerce/culture/military district systems
- governors and city automation personalities
- late-game city systems for City and Metropolis maturity

## Open Tuning

Population thresholds are intentionally tunable. The first implementation should use the table in this spec as initial data, but future balancing can adjust thresholds without changing the feature contract.

The stable contract is:

- city types match eras
- growth requires population plus flexible qualifying techs
- tech count threshold increases at later maturity levels
- max grid is 7x7
- water can be worked
- cities cannot be founded within 4 hexes of another city center
- active worked tiles are exclusive across all cities and civilizations
- territory changes invalidate city work claims that no longer control the tile
- citizen assignment affects actual yields
