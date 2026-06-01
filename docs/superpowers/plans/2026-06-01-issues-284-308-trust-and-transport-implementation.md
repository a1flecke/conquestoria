# Issues 284, 297-306, 308 Trust Fixes And Transport MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the linked trust bugs (#284, #297-#306, #308) and ship a small, readable Transport MVP for island access, tuned for 10-12 year old players: concrete rules, visible reasons, and no UI promises that execution can violate.
**Architecture:** Move player-visible legality into shared system helpers, keep gameplay state serializable, keep UI as a caller/renderer, and make execution paths revalidate before mutation. Transport cargo is stored as plain unit ids, loaded cargo remains in `state.units` but is ignored by map occupancy, rendering, selection, and order queues.
**Tech Stack:** TypeScript, Vite, Vitest, Canvas renderer, DOM UI, existing sprite TSX catalog, local OGG SFX catalog. Target agent: Sonnet 4.5, medium effort.

---

## Source Material

- Design spec: `docs/superpowers/specs/2026-06-01-issues-284-308-trust-and-transport-design.md`
- GitHub issues: #284, #297, #298, #299, #300, #301, #302, #303, #304, #305, #306, #308
- Required repo rules before edits:
  - `CLAUDE.md`
  - `.claude/rules/game-systems.md`
  - `.claude/rules/ui-panels.md`
  - `.claude/rules/strategy-game-mechanics.md`
  - `.claude/rules/end-to-end-wiring.md`
  - `.claude/rules/sprites.md`

## Non-Negotiable Gameplay Decisions

- Target audience is 10-12 year olds, so prefer direct verbs, clear blockers, and simple cargo rules.
- Add a separate `transport` unit. Do not make Galley carry units.
- Initial cargo capacity is 1 land unit.
- Use metadata now for future capacity growth and large-unit cargo sizes.
- Load and unload consume the land unit's action/movement, not the Transport's.
- Transport destruction destroys cargo.
- AI transport planning is deferred; AI must not crash if it owns or sees Transports.
- Ranged attackers take no counter-damage from melee-only defenders at range, but can take counter-damage from ranged or bombard-capable defenders that can return fire at that distance.
- Create a follow-up GitHub issue after these bug fixes land for the larger naval transport roadmap.

## Current Root Causes To Fix

- `executeUnitMove()` in `src/systems/unit-movement-system.ts` mutates after a best-effort path and does not revalidate destination occupancy, visibility, terrain legality, or movement budget.
- Movement preview, blocker reason, pathfinding, and execution use overlapping but different movement cost logic.
- `buildUnitOccupancy()` in `src/systems/unit-occupancy.ts` indexes every unit by position, so loaded cargo would still occupy a tile unless explicitly excluded.
- `getUnmovedUnits()` in `src/systems/unit-system.ts` ignores busy workers and has no concept of loaded cargo.
- Worker improvement eligibility in `src/systems/improvement-system.ts` treats every improvement that can improve a resource as resource-required, which blocks generic mines on empty hills and leaks hidden resources in UI eligibility.
- `TRAINABLE_UNITS` lacks unit-level coastal requirements, and `processCity()` only drops invalid coastal buildings.
- `resolveCombat()` in `src/systems/combat-system.ts` always applies attacker damage whenever the defender has strength.
- Rest/Fortify UI eligibility is looser than the actual player promise.
- New unit additions are not protected by a single checklist for type, catalog, sprite, SFX, production, AI, and UI wiring.

---

## Task 1: Baseline And Rule Read

- [ ] Confirm the branch/worktree is current:

```bash
git status --short
git fetch origin main
git rebase origin/main
```

- [ ] If mise blocks commands, run:

```bash
mise trust
```

- [ ] If Yarn says the project has not been installed, run:

```bash
./scripts/run-with-mise.sh yarn install
```

- [ ] Read the source material listed above.

- [ ] Run baseline targeted checks before editing:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/unit-movement.test.ts tests/systems/unit-movement-regression.test.ts tests/systems/worker-action-system.test.ts tests/ui/selected-unit-info.test.ts tests/systems/city-system.test.ts tests/systems/combat-system.test.ts tests/renderer/sprites/sprite-catalog.test.ts tests/audio/sfx-catalog.test.ts
```

Expected result: tests pass before changes. If they fail, use `superpowers:systematic-debugging` and record whether the failure is pre-existing.

---

## Task 2: Add Transport State And Catalog Metadata

### Tests First

- [ ] Add failing tests in `tests/systems/transport-system.test.ts`:
  - loading a friendly land unit onto an adjacent friendly Transport sets `transportId` on cargo, adds the cargo id to the Transport, sets the cargo unit `hasActed`, `hasMoved`, and `movementPointsLeft: 0`, and does not consume Transport movement/action.
  - capacity rejects a second cargo unit with reason `no-capacity`.
  - cargo-size metadata is used to compute capacity, even though all current land units are size 1.
  - unloading onto an adjacent passable unoccupied land tile clears `transportId`, removes cargo id from the Transport, places the land unit on the chosen tile, and consumes only the land unit.
  - destroying a Transport removes cargo units from `state.units` and from the owner's civilization unit list.

### Implementation

- [ ] Update `src/core/types.ts`:

```ts
export type UnitType =
  | 'settler'
  | 'worker'
  // existing types...
  | 'expedition'
  | 'transport';

export interface UnitDefinition {
  // existing fields...
  cargoCapacity?: number;
  cargoSize?: number;
}

export interface Unit {
  // existing fields...
  cargoUnitIds?: string[];
  transportId?: string;
}
```

- [ ] Update `src/systems/unit-system.ts`:
  - add `transport` to `UNIT_DEFINITIONS` with `domain: 'naval'`, `strength: 0`, `cargoCapacity: 1`, no attack profile, and production cost aligned with early ships.
  - add `cargoSize: 1` to current land units or use a helper default of 1 for land units and 0 for naval units. Prefer helper default if it avoids repeated metadata.
  - update `UNIT_DESCRIPTIONS.galley` so it no longer promises transport.
  - add `UNIT_DESCRIPTIONS.transport`.
  - initialize `cargoUnitIds: []` from `createUnit()` when `UNIT_DEFINITIONS[type].cargoCapacity` is defined.

- [ ] Add `src/systems/transport-system.ts` with these exported helpers:

```ts
export type TransportFailureReason =
  | 'missing-unit'
  | 'missing-transport'
  | 'not-land-unit'
  | 'not-transport'
  | 'wrong-owner'
  | 'already-loaded'
  | 'not-adjacent-to-shore'
  | 'no-capacity'
  | 'missing-destination'
  | 'invalid-destination'
  | 'destination-occupied'
  | 'destination-not-land';

export function getUnitCargoSize(unit: Unit): number;
export function getTransportCapacity(transport: Unit): number;
export function getTransportCargo(state: GameState, transportId: string): Unit[];
export function getTransportCargoUsed(state: GameState, transportId: string): number;
export function canLoadUnitOntoTransport(state: GameState, unitId: string, transportId: string): { ok: true } | { ok: false; reason: TransportFailureReason; message: string };
export function loadUnitOntoTransport(state: GameState, unitId: string, transportId: string): TransportActionResult;
export function getUnloadDestinations(state: GameState, transportId: string): HexCoord[];
export function canUnloadUnitFromTransport(state: GameState, transportId: string, cargoUnitId: string, destination: HexCoord): { ok: true } | { ok: false; reason: TransportFailureReason; message: string };
export function unloadUnitFromTransport(state: GameState, transportId: string, cargoUnitId: string, destination: HexCoord): TransportActionResult;
export function syncTransportCargoPositions(state: GameState, transportId: string): GameState;
export function removeTransportAndCargo(state: GameState, transportId: string): GameState;
```

- [ ] Keep load/unload mutations immutable enough to match surrounding system style: return a new `GameState` from transport helpers instead of mutating UI-local references.

- [ ] Shore rule for MVP:
  - load is legal if the cargo land unit is adjacent to the Transport, or the unit is in a friendly coastal city and the Transport is adjacent to that city tile.
  - unload is legal onto an adjacent land tile that is passable for that land unit and unoccupied, or through a friendly coastal city tile if the city tile is a valid destination.

- [ ] Use `UNIT_DEFINITIONS[unit.type].domain ?? 'land'` to reject naval cargo and prevent Transport-in-Transport loops.

- [ ] Search every unit removal/destruction path and route Transport removal through `removeTransportAndCargo()`:

```bash
rg -n "unit:destroyed|delete .*units|remainingUnits|removeUnit|defenderSurvived|attackerSurvived" src tests
```

- [ ] When a Transport moves, call `syncTransportCargoPositions()` so loaded cargo positions remain aligned with the carrying Transport for save/debug readability.

---

## Task 3: Exclude Loaded Cargo From Occupancy, Rendering, And Order Queues

### Tests First

- [ ] Extend `tests/systems/unit-occupancy.test.ts` or create it if missing:
  - `buildUnitOccupancy()` does not include units with `transportId`.
  - hostile active units still block movement.

- [ ] Extend `tests/systems/unit-system.test.ts` or the smallest existing unit queue test:
  - `getUnmovedUnits()` excludes workers with an active `workerTask`.
  - `getUnmovedUnits()` excludes loaded cargo.
  - `getUnmovedUnits()` still includes a normal unacted unit.

### Implementation

- [ ] Update `src/systems/unit-occupancy.ts`:

```ts
for (const [unitId, unit] of Object.entries(units)) {
  if (unit.transportId) continue;
  // existing index logic
}
```

- [ ] Add an exported helper in `src/systems/unit-system.ts`:

```ts
export function isUnitAwaitingOrders(unit: Unit): boolean {
  return !unit.transportId
    && !unit.hasMoved
    && !unit.hasActed
    && !unit.skippedTurn
    && !unit.isFortified
    && !unit.committedToRouteId
    && !unit.workerTask;
}
```

- [ ] Make `getUnmovedUnits()` call `isUnitAwaitingOrders()`.

- [ ] Search for active unit rendering and selection filters:

```bash
rg -n "Object\\.values\\(.*units|getUnmovedUnits|buildUnitOccupancy|transportId|render.*unit|selectedUnit" src tests
```

- [ ] Update renderer and stack-picker paths so loaded cargo is not rendered, selected, or shown in tile stacks.

- [ ] If any save/load or state normalization path strips unknown fields, preserve `cargoUnitIds` and `transportId`.

---

## Task 4: Centralize Movement Legality And Revalidate Execution

### Tests First

- [ ] Extend movement tests in `tests/systems/unit-movement.test.ts` and `tests/systems/unit-movement-regression.test.ts`:
  - `executeUnitMove()` refuses movement onto a foreign neutral occupied tile when not attacking.
  - `executeUnitMove()` refuses movement onto a hostile occupied tile when called as movement rather than attack.
  - multi-step movement through costly terrain fails if total cost exceeds current movement points.
  - direct one-step forced march into a passable costly tile still succeeds and ends at 0 movement.
  - land units cannot move into coast/ocean through direct execution.
  - Transport can enter coast after `galleys`.
  - Transport cannot enter ocean before `celestial-navigation`.
  - Transport can enter ocean after `celestial-navigation`.
  - Expedition pathfinding honors `terrainCostOverrides`.

### Implementation

- [ ] In `src/systems/unit-system.ts`, add state-aware movement cost helpers:

```ts
export interface UnitMovementContext {
  completedTechs?: string[];
}

export type UnitMovementBlockerCode =
  | 'unknown-tile'
  | 'unexplored'
  | 'impassable-water'
  | 'impassable-terrain'
  | 'requires-celestial-navigation'
  | 'occupied'
  | 'unreachable'
  | 'insufficient-movement';

export function getMovementCostForUnitInContext(
  unit: Unit,
  terrain: string,
  context: UnitMovementContext = {},
): number;
```

- [ ] Preserve existing `getMovementCostForUnit()` as a compatibility wrapper, but route new code through the unit-aware helper.

- [ ] Transport terrain rule:
  - existing naval units can enter `coast`.
  - `transport` can enter `coast` only if `completedTechs` includes `galleys`. In normal play this is already true because Transport unlocks with `galleys`, but the movement helper should still enforce the rule for saves/tests/editor-spawned units.
  - `transport` can enter `ocean` only if `completedTechs` includes both `galleys` and `celestial-navigation`.
  - other existing naval units keep current ocean/coast behavior unless the issue explicitly requires a change.

- [ ] Update `findPath()` to accept optional unit and movement context so pathfinding uses terrain overrides and Transport ocean gating:

```ts
export interface FindPathOptions {
  unit?: Unit;
  completedTechs?: string[];
}
```

- [ ] Update `getMovementBlockerReason()` and `getMovementRange()` to use the same unit-aware movement helper.

- [ ] In `src/systems/unit-movement-system.ts`, replace `ExecuteUnitMoveResult` with a typed union:

```ts
export type ExecuteUnitMoveResult =
  | {
      ok: true;
      from: HexCoord;
      to: HexCoord;
      path: HexCoord[];
      revealedTiles: HexCoord[];
      discoveredWonders: WonderDiscoveryResult[];
      villageOutcome?: { outcome: VillageOutcomeType; message: string; position: HexCoord };
    }
  | {
      ok: false;
      from: HexCoord;
      to: HexCoord;
      path: HexCoord[];
      reason: UnitMovementBlockerCode | 'missing-unit';
      message: string;
      revealedTiles: [];
      discoveredWonders: [];
    };
```

- [ ] Add `validateUnitMove()` in `src/systems/unit-movement-system.ts`:
  - checks unit exists and is not loaded cargo.
  - normalizes wrapped destination.
  - checks tile exists.
  - checks visibility for player actors when visibility is available.
  - checks passability with completed techs from `state.civilizations[unit.owner].techState.completed`.
  - builds occupancy with `buildUnitOccupancy()` and rejects any active occupant unless the caller is using a separate combat path.
  - finds a path using the state-aware helper.
  - sums total path cost using the same helper.
  - allows only the direct adjacent forced march exception.
  - returns a typed blocker and player-readable message on failure.

- [ ] Make `executeUnitMove()` call `validateUnitMove()` before mutation and return the failure result without mutating state.

- [ ] After a successful Transport move, synchronize cargo positions to the Transport destination before visibility refresh. Loaded cargo must not create additional vision, because visibility updates already ignore loaded cargo through the active-unit filters.

- [ ] Update all `executeUnitMove()` callers to check `result.ok` before reading success-only fields. Use `rg`:

```bash
rg -n "executeUnitMove\\(" src tests
```

- [ ] Keep attack/city-assault callers on their existing combat path. Do not make regular movement implicitly attack occupied tiles.

---

## Task 5: Worker Improvement Trust Fixes

### Tests First

- [ ] In `tests/systems/worker-action-system.test.ts`, add:
  - `applyWorkerAction()` can build a Mine on an owned empty hill.
  - `getAvailableWorkerActions()` includes Mine on an owned empty hill.
  - same-improvement replacement is not available when `allowReplacement: true`.
  - `applyWorkerAction()` rejects same-improvement replacement.
  - a hidden resource under a visible tile does not make a resource-specific improvement appear if the player's completed techs do not reveal that resource.
  - a revealed matching resource does allow its required improvement.

- [ ] In `tests/ui/selected-unit-info.test.ts`, add:
  - build buttons include yield text, for example `Build Mine (+2 Prod, +1 Gold)`.
  - replacement buttons include yield text.
  - same replacement is absent.

### Implementation

- [ ] Update `src/systems/improvement-system.ts`:
  - split generic terrain eligibility from resource-specific eligibility.
  - add explicit metadata so resource-bearing improvements do not all behave the same:

```ts
type ImprovementResourceMode = 'generic' | 'resource-only' | 'generic-or-resource';

export interface ImprovementDefinition {
  // existing fields...
  resourceMode: ImprovementResourceMode;
}
```

  - set `farm`, `lumber_camp`, and `watermill` to `generic`.
  - set `mine` and `quarry` to `generic-or-resource`, so Mine on an empty hill is legal and Quarry remains a normal terrain improvement.
  - set `plantation`, `pasture`, and `camp` to `resource-only`, so they appear only for known matching resources and do not leak hidden resources.
  - keep `RESOURCE_GATED_IMPROVEMENTS` for matching known resources and hints, but do not use it to block `generic` or `generic-or-resource` terrain improvements.
  - add a viewer-safe option for player-facing resource checks:

```ts
export interface WorkerActionEligibilityOptions {
  isCityTile?: boolean;
  allowReplacement?: boolean;
  knownResource?: ResourceType | null;
}
```

- [ ] Add helper:

```ts
export function getKnownTileResourceForWorkerAction(tile: HexTile, completedTechs: string[]): ResourceType | null {
  if (!tile.resource) return null;
  const definition = RESOURCE_DEFINITIONS.find(resource => resource.id === tile.resource);
  return definition && completedTechs.includes(definition.tech) ? definition.id : null;
}
```

- [ ] Make UI-facing calls pass `knownResource` instead of relying on raw `tile.resource`.

- [ ] In `applyWorkerAction()`, compute `knownResource` from the unit owner's completed techs and use the same eligibility contract for player-issued worker actions. This preserves trust even though the raw map still stores hidden resources.

- [ ] Update `getWorkerActionLabel()` to include yields for build actions:

```ts
return `Build ${getImprovementDisplayName(action)} ${formatImprovementYieldLabel(action)}`.trim();
```

- [ ] Update replacement label generation in `src/ui/selected-unit-info.ts` to include the target improvement yield.

- [ ] Ensure blocker hints do not leak hidden resources. If a resource is not known, show terrain/tech hints only.

---

## Task 6: Coastal Unit Production Gates

### Tests First

- [ ] In `tests/systems/city-system.test.ts`, add:
  - `getTrainableUnitsForCity()` includes Galley, Trireme, and Transport only for coastal cities with required techs.
  - inland city queues drop a queued Galley/Trireme/Transport before production completes.
  - `processCity()` reports the dropped unit id through a visible result field.

- [ ] In `tests/ui/city-panel.test.ts`, add:
  - inland city panel does not show Galley/Trireme/Transport.
  - coastal city panel shows Transport after `galleys`.

### Implementation

- [ ] Update `src/core/types.ts`:

```ts
export interface TrainableUnitEntry {
  // existing fields...
  coastalRequired?: boolean;
}
```

- [ ] Update `src/systems/city-system.ts`:
  - add `transport` to `TRAINABLE_UNITS` with `techRequired: 'galleys'` and `coastalRequired: true`.
  - mark `galley` and `trireme` with `coastalRequired: true`.
  - add `transport` to `PRODUCTION_ICONS`.
  - add `getTrainableUnitsForCity(city, completedTechs, mapTiles, civType?, availableResources?)`.
  - make `getTrainableUnitsForCiv()` remain tech/resource/civ-only for callers that do not have a city.
  - update city-panel callers to use `getTrainableUnitsForCity()`.

- [ ] Update `CityProcessResult`:

```ts
droppedProductionItem: string | null;
droppedBuilding: string | null;
droppedUnit: UnitType | null;
```

- [ ] Keep `droppedBuilding` for compatibility, but use `droppedProductionItem` in new notifications.

- [ ] In `processCity()`, use the same city-aware availability helper for queued units. Drop invalid coastal units before accumulating production.

- [ ] Update turn-manager notification path so dropped units and buildings both show a visible message.

---

## Task 7: Combat, Rest, Fortify, And Healing Clarity

### Tests First

- [ ] In `tests/systems/combat-system.test.ts`, add:
  - Archer attacking Warrior from distance 2 takes `attackerDamage: 0`.
  - Archer attacking Archer from distance 2 can take attacker damage.
  - Ballista/Catapult defender that can return fire at the attack distance can damage the attacker.
  - Warrior attacking Warrior adjacent still produces normal attacker and defender damage.

- [ ] In `tests/ui/selected-unit-info.test.ts`, add:
  - Rest is hidden after a unit has moved.
  - Fortify is hidden after a unit has moved.
  - Rest text communicates stronger healing in owned cities than in the field when applicable.

### Implementation

- [ ] Update `src/systems/combat-system.ts`:
  - import `hexDistance` or use wrapped distance if the combat caller already passes wrapped context. Prefer a simple distance from attacker to defender unless the existing combat path already handles wrapping.
  - add helper:

```ts
function canCounterAttackAtDistance(defender: Unit, distance: number): boolean {
  const profile = UNIT_DEFINITIONS[defender.type].attackProfile;
  if (!profile) return distance <= 1 && UNIT_DEFINITIONS[defender.type].strength > 0;
  if (profile.kind === 'melee') return distance <= 1;
  return profile.range >= distance;
}
```

- [ ] Treat units without an `attackProfile` as melee for counter-attack purposes.

- [ ] In `resolveCombat()`, set `attackerDamage` to 0 when `canCounterAttackAtDistance(defender, distance)` is false. Keep defender damage formula intact.

- [ ] Update `src/ui/selected-unit-info.ts`:
  - Rest and Fortify buttons require `!unit.hasMoved && !unit.hasActed && unit.movementPointsLeft > 0`.
  - Rest is still shown only when `canHeal(unit)` is true.
  - Healing labels should distinguish friendly city, friendly territory, and field.

---

## Task 8: Wire Transport UI And SFX

### Player Truth Table

| Selected unit | State | Button shown | Result |
| --- | --- | --- | --- |
| Land unit | adjacent to friendly Transport with capacity | `Load onto Transport` | land unit loads and panel rerenders |
| Land unit | no nearby legal Transport | no load button | no false promise |
| Transport | empty | cargo line says `Empty` | no unload button |
| Transport | carrying one unit and legal land destination exists | `Unload` | destination choice appears or first clear destination is used if UI pattern already exists |
| Transport | carrying one unit and no legal land destination exists | disabled/hidden unload with clear reason | no mutation |

### Misleading UI Risks

- Do not show Load if capacity is full.
- Do not show Load for naval units.
- Do not show Unload if no legal destination exists.
- Do not show loaded cargo as selectable on the map.
- Do not let cargo look available in next-unit cycling.
- Do not consume Transport action points on load/unload.

### Interaction Replay Checklist

- Load a Warrior onto an adjacent Transport, confirm the Warrior disappears from the map and the Transport panel says it is carrying Warrior.
- Move the Transport along coast, confirm cargo follows internally and is not separately selectable.
- Unload Warrior onto land, confirm Warrior appears on destination tile with no movement/actions remaining.
- Destroy Transport in a test, confirm cargo is destroyed.
- Save and reload during cargo state if save infrastructure is touched; confirm cargo remains loaded.

### Tests First

- [ ] In `tests/ui/selected-unit-info.test.ts`, add:
  - selected Transport renders `Empty`.
  - selected Transport renders `Carrying: Warrior` when cargo exists.
  - legal land unit renders `Load onto Transport`.
  - load callback rerenders panel and removes button after load.
  - legal Transport renders `Unload`.
  - unload callback rerenders panel and updates cargo state.

### Implementation

- [ ] Update `src/ui/selected-unit-info.ts` props to accept transport callbacks:

```ts
onLoadTransport?: (unitId: string, transportId: string) => void;
onUnloadTransport?: (transportId: string, cargoUnitId: string, destination: HexCoord) => void;
getTransportOptions?: (unitId: string) => Array<{ transportId: string; label: string }>;
getUnloadOptions?: (transportId: string) => Array<{ cargoUnitId: string; destination: HexCoord; label: string }>;
```

- [ ] Use `textContent`/DOM nodes only. Do not introduce `innerHTML`.

- [ ] Update `src/main.ts` live callbacks:
  - call `loadUnitOntoTransport()` and `unloadUnitFromTransport()`.
  - replace `gameState` with returned state.
  - play load/unload SFX.
  - rerender selected unit panel immediately.
  - update movement range/occupancy after the action.

- [ ] Add SFX catalog entries in the existing audio catalog files:
  - Transport movement uses naval locomotion.
  - Transport sink/death has a unit SFX entry.
  - Load and unload have short action SFX entries.

- [ ] Add local OGG assets under `public/audio/sfx/`. If curated audio is unavailable, copy the closest existing local OGG as a temporary wired asset and call this out in the PR summary.

---

## Task 9: Transport Sprite And Animation Registration

### Tests First

- [ ] Extend `tests/renderer/sprites/sprite-catalog.test.ts`:
  - `transport` is present in `UNIT_SPRITE_CATALOG`.
  - catalog coverage includes every `UnitType`.

- [ ] Extend animation/motion tests if present:
  - Transport uses the naval motion style.

### Implementation

- [ ] Update `src/renderer/sprites/units.tsx`:
  - add `TransportSprite` matching the existing v2 unit style.
  - use faction palette inputs; do not hardcode civilization colors.
  - use naval details: hull, sail/cargo silhouette, waterline, and small deck cargo shape.

- [ ] Update `src/renderer/sprites/sprite-catalog.ts`:
  - add one `UNIT_SPRITE_CATALOG` entry for `transport`.

- [ ] Update any unit motion/animation registration file found by:

```bash
rg -n "UNIT_MOTION|motionStyle|galley|trireme|naval" src/renderer src
```

- [ ] Visually inspect the sprite if a renderer snapshot helper exists. Otherwise rely on catalog tests and code review.

---

## Task 10: Start-Turn Selection And Busy Worker Queue

### Tests First

- [ ] Add/extend tests for the smallest file that owns start-turn selection:
  - after loading a state with a busy worker and an idle Warrior, the idle Warrior is selected first.
  - a busy worker is not selected as the next unit needing orders.
  - loaded cargo is not selected at turn start.

### Implementation

- [ ] Use `isUnitAwaitingOrders()` from Task 3 anywhere the UI chooses the next unit.

- [ ] Search and update all unit cycling paths:

```bash
rg -n "next.*unit|unit.*orders|getUnmovedUnits|skippedTurn|isFortified|workerTask|selectedUnit" src/main.ts src/ui src/input src/systems
```

- [ ] At the start of a player turn, if `getUnmovedUnits()` returns at least one unit, select it and keep existing camera behavior predictable.

---

## Task 11: Guardrail Updates

- [ ] Update `.claude/rules/game-systems.md`:
  - movement execution must revalidate terrain, occupancy, visibility, and cost before mutation.
  - cargo/transport state must be handled by shared systems, including destruction cleanup.
  - player-visible eligibility cannot inspect hidden resources.

- [ ] Update `.claude/rules/ui-panels.md`:
  - UI actions must use shared eligibility helpers and rerender after mutating panel-owned state.
  - panels must test both action availability and immediate post-action visible state.

- [ ] Update `.claude/rules/end-to-end-wiring.md`:
  - new trainable units require type, production, icon, sprite, SFX, AI decision, save compatibility, UI, and tests in the same work unless explicitly deferred.

- [ ] Because `.claude/**` is touched, run:

```bash
./scripts/run-with-mise.sh yarn test:hooks
```

---

## Task 12: #308 Sprite Verification

- [ ] Run sprite catalog tests:

```bash
./scripts/run-with-mise.sh yarn test --run tests/renderer/sprites/sprite-catalog.test.ts
```

- [ ] Inspect `UNIT_SPRITE_CATALOG` and confirm all current `UnitType` entries have catalog registrations, including the new `transport`.

- [ ] Do not add root-cause claims for missing sprites beyond the guardrails above. Missing sprites are expected while new content is in flight; this work verifies current delivery and protects the new Transport.

---

## Task 13: Follow-Up GitHub Issue For Fuller Naval Transport Roadmap

- [ ] After the bug-fix branch lands, create a GitHub issue titled:

```text
Plan fuller naval transport progression and AI island logistics
```

- [ ] Use this issue body:

```md
The bug-fix Transport MVP shipped a separate capacity-1 Transport for player island access. Follow-up work should flesh out the long-term naval transport model.

Scope:
- era-scaled transport capacity
- larger/heavier unit cargo sizes
- transport upgrades or later transport classes
- AI island settlement planning
- AI naval escort planning
- naval danger scoring
- transport UI polish for multiple cargo/destinations
- balance and tech pacing
- curated transport load/unload/sink sound effects if placeholders remain
- save migration concerns for richer cargo state

The MVP intentionally did not implement AI transport routing or multi-unit cargo.
```

- [ ] Use:

```bash
gh issue create --repo a1flecke/conquestoria --title "Plan fuller naval transport progression and AI island logistics" --body-file /tmp/conquestoria-naval-transport-followup.md
```

If the branch has not landed yet, prepare the issue body in the PR summary and create the issue immediately after merge.

---

## Task 14: Full Verification

- [ ] Run source rule checks for every changed `src` file:

```bash
scripts/check-src-rule-violations.sh path/to/changed-src-file.ts path/to/another-changed-src-file.ts
```

- [ ] Run targeted tests:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/transport-system.test.ts tests/systems/unit-movement.test.ts tests/systems/unit-movement-regression.test.ts tests/systems/worker-action-system.test.ts tests/ui/selected-unit-info.test.ts tests/systems/city-system.test.ts tests/ui/city-panel.test.ts tests/systems/combat-system.test.ts tests/renderer/sprites/sprite-catalog.test.ts tests/audio/sfx-catalog.test.ts
```

- [ ] Run hook tests if `.claude/**` changed:

```bash
./scripts/run-with-mise.sh yarn test:hooks
```

- [ ] Run build:

```bash
./scripts/run-with-mise.sh yarn build
```

- [ ] Run full tests:

```bash
./scripts/run-with-mise.sh yarn test
```

- [ ] Inspect branch and working tree diffs:

```bash
git diff --stat origin/main...HEAD
git diff --stat
git diff origin/main...HEAD -- src tests docs .claude
git diff -- src tests docs .claude
```

---

## Self-Review Checklist

- [ ] Every issue has a direct regression:
  - #284 same replacement absent/rejected
  - #297 foreign/neutral movement stacking rejected at execution
  - #298 Transport moves land units over water
  - #299 busy workers and loaded cargo excluded from order queues
  - #300 costly multi-step movement cannot overrun movement points
  - #301 Mine can be built on empty hills
  - #302 hidden resources do not leak worker actions
  - #303 start-turn auto-selection chooses an actual available unit
  - #304 Rest/Fortify/healing rules match UI text
  - #305 ships and Transport require coastal cities
  - #306 ranged counter-damage depends on defender return-fire ability
  - #308 sprite catalog is verified
- [ ] UI availability and system execution use the same helper wherever practical.
- [ ] Movement execution has no mutation path before validation succeeds.
- [ ] Loaded cargo cannot be rendered, selected, counted as occupying a tile, or cycled as needing orders.
- [ ] Transport cargo destruction is shared and actor-agnostic.
- [ ] No player-facing worker helper reads raw hidden resources.
- [ ] No new unit lacks sprite, production icon, SFX decision, production entry, description, and tests.
- [ ] No deferred AI behavior crashes because of `transport`.
- [ ] No `innerHTML` was added.
- [ ] Any copied temporary OGG assets are called out clearly in the PR summary.
