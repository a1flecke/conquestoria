# Cultural Territory And Worker Improvements Design

## Context

GitHub issue: https://github.com/a1flecke/conquestoria/issues/157

Workers must not build farms or other improvements outside their own civilization's territory. The current code already has `City.ownedTiles` and `HexTile.owner`, and recent `origin/main` rejects worker actions on unowned or enemy-owned tiles. The missing product model is a satisfying cultural territory system: cities should begin useful, stronger neighboring civilizations should be able to constrain borders, and the UI should explain why worker actions are available or blocked.

This work intentionally includes the heavier cultural frontier destination, but it must be delivered in small MRs that each ship coherent behavior. Early MRs use simple radius and milestone rules; later MRs replace the resolution internals with richer culture pressure without changing the player-facing contract.

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

### MR1: Ownership Foundation

- Founding creates radius 2 cultural territory for the new city.
- `City.ownedTiles` remains the city-facing attribution list.
- `HexTile.owner` remains the fast civ lookup for renderer, worker actions, and resource systems.
- Workers can improve only own-civ tiles.
- The selected-worker map guidance distinguishes buildable tiles from blocked tiles.

### MR2: Deterministic Territory Recalculation

- Add a canonical helper that recalculates city-attributed territory from city claims.
- Founding, capture, raze, city loss, and save normalization use that helper instead of manual tile-owner edits.
- The first implementation may still use simple radius bands, but it must centralize claim generation, claim resolution, and state application.

### MR3: Simple Cultural Growth

- Cities can grow from radius 2 to radius 3 during turn processing.
- Growth eligibility comes from simple population/maturity milestones plus culture-building modifiers.
- Growth happens once per round/turn flow, while major political events still recalculate immediately.

### MR4: Soft Trim Competition

- Overlapping city claims compare a simple pressure score.
- A rival claim wins or keeps an overlapping tile only when its pressure beats the competing claim by at least `2`.
- Ties and smaller margins preserve the current holder when possible, then use deterministic city-id tie-breakers.
- Improvements transfer with the tile owner when a tile flips.

### MR5: Culture Frontier

- Add persistent frontier state for contested tiles.
- Frontier state tracks current holder, challenger, pressure source city, accumulated progress, trend, and player-facing reason text.
- Border changes can occur through gradual culture pressure, not only milestone recalculation.
- The player can inspect why a tile is held, contested, or likely to flip.

### MR6: UX Polish And Balance

- Tune thresholds and pressure weights.
- Add notification-log entries for meaningful border changes, especially improvement transfers.
- Make selected-worker and border guidance clear enough for normal play.

## Architecture

`src/systems/city-territory-system.ts` should become the canonical territory module. It owns three responsibilities:

1. Claim generation: create candidate tile claims for each city.
2. Claim resolution: choose a winning city for each tile.
3. State application: update `City.ownedTiles`, `HexTile.owner`, and invalid worked-tile claims.

Other systems should call this module rather than editing territorial ownership directly. The relevant paths include city founding, city capture, raze/city loss, turn processing, save normalization, and any future culture-frontier tick.

The model stays city-attributed. `HexTile.owner` stores the owning civ id for fast lookup. `City.ownedTiles` stores which city controls the tile. If a tile belongs to a civ, exactly one living city of that civ should attribute it unless the tile is intentionally neutral/unowned.

Existing city work normalization should remain part of the application path. If a city loses a tile, its `workedTiles` must drop that coordinate before yields are calculated again.

## Gameplay Rules

Workers may only improve tiles where `tile.owner === worker.owner`. This remains true even with open borders.

Newly founded cities claim radius 2 territory, excluding invalid claim terrain such as ocean and mountains. Early MRs can use radius bands. Later MRs add pressure and frontier progress without changing the rule that worker improvements require own-civ ownership.

Gradual growth happens during turn flow. Founding, capture, raze, and city loss recalculate immediately so major political events feel responsive.

When a tile changes owner through cultural pressure, existing improvements stay on the tile and become usable by the new owner. The old owner must stop receiving yields from that tile as soon as territory is recalculated.

Soft Trim defines "clearly stronger rival pressure" as pressure at least `2` higher than the competing claim. The exact pressure formula can evolve across MRs, but the margin requirement is part of the player-facing contract unless later design explicitly changes it.

## UI And Feedback

When a worker is selected, the map should show improvement guidance:

- Green: owned by the worker's civ and at least one worker action is valid.
- Amber: owned by the worker's civ but blocked by terrain, city center, existing improvement, missing river, missing tech, or another local rule.
- Red: otherwise plausible improvement terrain blocked because the tile is foreign or unowned.

The selected-unit panel should explain why the worker has no action on the current tile. Examples include "Outside your territory", "City centers cannot be improved", "Requires river", "Already improved", and "Requires technology".

MR4 and later should add notification-log entries when a tile flips between civs. If a tile has a completed or in-progress improvement, the notification should mention that the improvement transferred. MR5 should add inspectable frontier explanations only after frontier state exists.

## Error Handling And Save Behavior

`applyWorkerAction` must reject outside-territory actions at the mutation layer even if the UI is stale. It should return a specific failure reason for outside territory instead of only a generic invalid action.

Legacy saves should normalize ownership when loaded. If `City.ownedTiles` and `HexTile.owner` disagree, territory recalculation should rebuild ownership first, then city work normalization should remove invalid worked tiles.

Territory recalculation must be deterministic. Identical state must produce identical ownership, including tie-breaks, so tests and saves remain stable.

## Testing Requirements

Each MR needs focused regressions:

- Founding radius 2 claims land, avoids invalid terrain, and updates `HexTile.owner`.
- Workers cannot improve unowned or foreign tiles; the mutation result reports the outside-territory reason.
- Selected-worker UI/map guidance shows buildable, owned-blocked, and foreign-blocked tiles distinctly.
- Territory recalculation is deterministic across founding, capture, raze, city loss, and load normalization.
- Radius 3 growth happens only when milestone thresholds are met.
- Soft Trim flips overlapping claims only when pressure margin is at least `2`; margin `0` or `1` is insufficient.
- Improvement transfer causes the new owner to receive yields and the old owner to stop receiving yields.
- Culture frontier progress produces deterministic flips and visible explanations for held, contested, and likely-to-flip tiles.

## Implementation Guardrails

- Keep state serializable plain objects.
- Use axial hex coordinates and existing wrapped-coordinate helpers.
- Do not branch shared gameplay logic on platform or distribution.
- Do not ship player-visible actions whose backing behavior is deferred to a later MR.
- If an MR exposes a button, highlight, notification, or inspection label, tests must prove the live UI path renders or updates it.
- Before implementation begins, create a separate implementation plan that maps each MR to files, tests, and verification commands.
