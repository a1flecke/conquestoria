# Cultural Territory And Worker Improvements Design

## Context

GitHub issue: https://github.com/a1flecke/conquestoria/issues/157

Workers must not build farms or other improvements outside their own civilization's territory. The current code already has `City.ownedTiles` and `HexTile.owner`, and recent `origin/main` rejects worker actions on unowned or enemy-owned tiles. The missing product model is a satisfying cultural territory system: cities should begin useful, stronger neighboring civilizations should be able to constrain borders, and the UI should explain why worker actions are available or blocked.

This work intentionally includes the heavier cultural frontier destination, but it must be delivered in small MRs that each ship coherent behavior. Early MRs use simple radius and milestone rules while introducing the same canonical ownership path that later MRs will enrich with pressure and frontier state. No MR should add a temporary ownership path that must be thrown away later.

## Goals

- Workers can only improve tiles owned by their own civilization.
- City territory is cultural territory, not merely a static city-radius bookkeeping field.
- Territory remains city-attributed so existing city yields, resource supply, capture, and city panels stay coherent.
- New cities begin with useful radius 2 territory unless clearly stronger nearby rival culture trims overlapping tiles.
- Cultural territory can grow, compete, transfer improvements, and eventually advance through a visible frontier/progress model.
- Selected-worker UI and map highlights show why a tile is buildable or blocked.
- All ownership changes flow through canonical systems/helpers instead of scattered direct tile-owner mutation.

## Non-Goals

- Open borders does not allow workers to improve foreign tiles.
- Workers do not build improvements for allies, vassals, or treaty partners in this work.
- MR1 does not need the full frontier history model, but it must not introduce APIs or state shapes that block it.
- Culture frontier UI should not ship before the underlying frontier state exists.

## MR Ladder

### MR1: Canonical Ownership Foundation

- Add the first canonical territory recalculation helper in `city-territory-system`.
- Founding creates radius 2 cultural territory for the new city.
- Radius 2 claims include valid land tiles and exclude ocean and mountains.
- New founding claims may take neutral tiles and same-civ tiles, but they do not steal valid foreign-held tiles in MR1. This is the early "strong neighbor protection" rule until pressure-based Soft Trim arrives.
- `City.ownedTiles` remains the city-facing attribution list.
- `HexTile.owner` remains the fast civ lookup for renderer, worker actions, and resource systems.
- Workers can improve only own-civ tiles.
- The selected-worker panel explains the current tile, and selected-worker map guidance distinguishes buildable tiles from blocked tiles in movement-preview range.

### MR2: Ownership Path Integration

- Keep founding on the MR1 helper, and move capture, raze, city loss, save normalization, and territory-normalization turn hooks onto the canonical territory helper.
- Remove or bypass scattered manual tile-owner edits in those paths.
- Preserve deterministic holder tie-break behavior when migrating old or partially inconsistent state.

### MR3: Simple Cultural Growth

- Cities can grow from radius 2 to radius 3 during turn processing.
- A city qualifies for radius 3 when any of these are true:
  - population is at least 4
  - maturity is `town`, `city`, or `metropolis`
  - population is at least 3 and the city has at least one culture-category building
  - the city has at least two culture-category buildings
- Growth happens once per round/turn flow, while major political events still recalculate immediately.

### MR4: Soft Trim Competition

- Overlapping city claims compare a simple pressure score.
- A rival claim wins or keeps an overlapping tile only when its pressure beats the competing claim by at least `2`.
- Ties and smaller margins preserve the current holder when possible, then use deterministic city-id tie-breakers.
- Completed improvements transfer with the tile owner when a tile flips.
- In-progress improvements do not transfer. If a tile with `improvementTurnsLeft > 0` flips, the construction is cancelled, the tile resets to `improvement: 'none'`, and any worker task assigned to that tile is cleared.

### MR5: Culture Frontier

- Add persistent frontier state for contested tiles.
- Frontier state lives in serializable game state, keyed by tile coordinate.
- Frontier state tracks current holder, challenger, holder city, challenger city, accumulated progress, trend, and player-facing reason text.
- Border changes can occur through gradual culture pressure, not only milestone recalculation.
- The player can inspect why a tile is held, contested, or likely to flip.
- Frontier records are deleted when their tile no longer has competing claims, when either source city is gone, or when a city capture/raze/loss invalidates the holder or challenger.

### MR6: UX Polish And Balance

- Tune thresholds and pressure weights.
- Add notification-log entries for meaningful border changes, especially improvement transfers.
- Make selected-worker and border guidance clear enough for normal play.

## Architecture

`src/systems/city-territory-system.ts` should become the canonical territory module. It owns three responsibilities from MR1 onward:

1. Claim generation: create candidate tile claims for each city.
2. Claim resolution: choose a winning city for each tile.
3. State application: update `City.ownedTiles`, `HexTile.owner`, and invalid worked-tile claims.

Other systems should call this module rather than editing territorial ownership directly. MR1 wires founding. MR2 wires city capture, raze/city loss, save normalization, and territory-normalization turn hooks. MR3 adds growth to the turn hook. MR5 adds the culture-frontier tick.

The model stays city-attributed. `HexTile.owner` stores the owning civ id for fast lookup. `City.ownedTiles` stores which city controls the tile. If a tile belongs to a civ, exactly one living city of that civ should attribute it unless the tile is intentionally neutral/unowned.

Existing city work normalization should remain part of the application path. If a city loses a tile, its `workedTiles` must drop that coordinate before yields are calculated again.

The helper APIs should expose structured claim and resolution metadata so later MRs can add pressure/frontier behavior without changing every caller. The intended shape is:

- `TerritoryClaim`: city id, civ id, coord, radius band, pressure score, and reason.
- `TerritoryResolution`: coord, previous owner, winning city/civ or neutral, competing claims, and ownership-change reason.
- `recalculateTerritory(state, options)`: returns a new state plus changed-tile metadata for UI/events.

## Gameplay Rules

Workers may only improve tiles where `tile.owner === worker.owner`. This remains true even with open borders.

Newly founded cities claim radius 2 territory, excluding invalid claim terrain such as ocean and mountains. MR1 does not steal valid foreign-held tiles. Later MRs add pressure and frontier progress without changing the rule that worker improvements require own-civ ownership.

Gradual growth happens during turn flow. Founding, capture, raze, and city loss recalculate immediately so major political events feel responsive.

When a tile changes owner through cultural pressure, completed improvements stay on the tile and become usable by the new owner. The old owner must stop receiving yields from that tile as soon as territory is recalculated. In-progress improvements are cancelled on flip, because the original worker can no longer legally complete the work and the new owner did not spend the worker action.

Soft Trim defines "clearly stronger rival pressure" as pressure at least `2` higher than the competing claim. MR4 uses this v1 pressure formula:

```text
pressure = 6 + maturityBonus + floor(population / 2) + cultureBonus - distance
```

- `maturityBonus`: outpost 0, village 1, town 2, city 3, metropolis 4.
- `cultureBonus`: +1 per culture-category building, capped at +3.
- `distance`: wrapped city distance from city center to the tile.

The formula can be tuned in MR6, but the `+2` margin requirement is part of the player-facing contract unless later design explicitly changes it.

## UI And Feedback

When a worker is selected, the map should show improvement guidance in movement-preview range. The selected-unit panel explains the worker's current tile. The map preview explains where the worker could move and then build.

- Green: owned by the worker's civ and at least one worker action is valid.
- Amber: owned by the worker's civ but blocked by terrain, city center, existing improvement, missing river, missing tech, or another local rule.
- Red: otherwise plausible improvement terrain blocked because the tile is foreign or unowned. Red should be limited to visible or fog-known tiles where showing the terrain does not leak unexplored information.

The selected-unit panel should explain why the worker has no action on the current tile. Examples include "Outside your territory", "City centers cannot be improved", "Requires river", "Already improved", and "Requires technology".

MR4 and later should add notification-log entries when a tile flips between civs. If a tile has a completed improvement, the notification should mention that the improvement transferred. If in-progress construction is cancelled, the notification should mention cancellation instead of transfer. MR5 should add inspectable frontier explanations only after frontier state exists.

## Error Handling And Save Behavior

`applyWorkerAction` must reject outside-territory actions at the mutation layer even if the UI is stale. It should return a specific failure reason for outside territory instead of only a generic invalid action.

Legacy saves should normalize ownership when loaded. If `City.ownedTiles` and `HexTile.owner` disagree, territory recalculation should use the existing `HexTile.owner` as the current holder for tie preservation, rebuild ownership through the canonical helper, then city work normalization should remove invalid worked tiles. This avoids surprising players by flipping every ambiguous legacy tile at once.

Territory recalculation must be deterministic. Identical state must produce identical ownership, including tie-breaks, so tests and saves remain stable.

## Testing Requirements

Each MR needs focused regressions:

- Founding radius 2 claims land, avoids invalid terrain, and updates `HexTile.owner`.
- Founding beside valid foreign-held territory does not steal that foreign territory in MR1.
- Workers cannot improve unowned or foreign tiles; the mutation result reports the outside-territory reason.
- Selected-worker UI/map guidance shows buildable, owned-blocked, and foreign-blocked tiles distinctly.
- Territory recalculation is deterministic across founding, capture, raze, city loss, and load normalization.
- Radius 3 growth happens only when milestone thresholds are met.
- Soft Trim flips overlapping claims only when pressure margin is at least `2`; margin `0` or `1` is insufficient.
- Completed improvement transfer causes the new owner to receive yields and the old owner to stop receiving yields.
- In-progress improvement flips cancel construction and clear the original worker task.
- Culture frontier progress produces deterministic flips and visible explanations for held, contested, and likely-to-flip tiles.
- Frontier records are cleaned up when source cities are captured, razed, lost, or no longer competing for the tile.

## Implementation Guardrails

- Keep state serializable plain objects.
- Use axial hex coordinates and existing wrapped-coordinate helpers.
- Do not branch shared gameplay logic on platform or distribution.
- Do not ship player-visible actions whose backing behavior is deferred to a later MR.
- If an MR exposes a button, highlight, notification, or inspection label, tests must prove the live UI path renders or updates it.
- Before implementation begins, create a separate implementation plan that maps each MR to files, tests, and verification commands.
