# S6b Design — Physical Caravan Route-Running + Raidable

**Date:** 2026-05-26  
**Slice:** S6b (depends on S6a — route termination hooks)  
**Roadmap:** `docs/superpowers/specs/2026-05-20-marketplace-trade-roadmap.md` (D-Q7)

## What This Delivers

The caravan unit physically travels back and forth between its two cities each turn along the shortest land path. It is raidable — enemy units can attack it in transit via the existing combat system. Killing it ends the route via S6a's existing `removeRouteForUnit` hook. After a fixed number of trips the caravan is consumed and the route ends.

## Locked-in Decisions

| Question | Answer |
|---|---|
| Where in turn-manager does movement fire? | After `scrubEmbargoedRoutes` (S6a), before trade-route income |
| Path: recompute or store? | Recompute each turn via `findPath` — simpler, no stale-path state |
| Direction tracking | `Unit.routeDirection` (already optional on `Unit`); `undefined` → treat as `'outbound'` |
| `tripsRemaining` at 0 | Caravan consumed (`unit-died`), route ends — same as combat death |
| Route-path visualisation | Already handled: `render-loop.ts` `drawTradeRouteLines` draws dashed line; caravan renders at updated `position` automatically |
| Raidability | No new code — existing combat system covers it; regression test only |
| Fog-of-war on caravan move | No fog update during route-runner (follows barbarian movement pattern; per-civ `updateVisibility` already ran earlier in the turn) |

## Data Model

Both fields are already defined on `Unit` in `types.ts`:

```ts
routeDirection?: 'outbound' | 'inbound';  // undefined → outbound
tripsRemaining?: number;                   // set by establishRoute; decremented on fromCity arrival
```

No `types.ts` changes needed. No save migration needed (fields are optional).

## Core Function

```
advanceRouteRunners(state: GameState, bus?: EventBus): GameState
```

Lives in `src/systems/unit-movement-system.ts`. Exported.

**Algorithm for each route in `state.marketplace.tradeRoutes`:**

1. Find caravan: `Object.values(state.units).find(u => u.committedToRouteId === route.id)`
2. If no caravan, skip (route may have been severed same turn by S6a)
3. Determine target city:
   - `(caravan.routeDirection ?? 'outbound') === 'outbound'` → `state.cities[route.toCityId]`
   - `'inbound'` → `state.cities[route.fromCityId]`
4. `findPath(caravan.position, targetCity.position, map, 'land')`
5. If `!path` or `path.length === 0`: skip (no land path — terrain changed; caravan waits)
6. If `path.length === 1` (already at destination): process arrival (see below)
7. Otherwise: move caravan to `path[1]`; emit `unit:move`; if `path[1]` equals target position, process arrival

**Arrival at `toCityId` (outbound):**
- Set `routeDirection: 'inbound'`

**Arrival at `fromCityId` (inbound):**
- Set `routeDirection: 'outbound'`
- Decrement `tripsRemaining` by 1
- If `tripsRemaining <= 0`:
  - Remove caravan from `state.units` and from owner civ's `units` array
  - Call `removeRouteForUnit(state, caravanId, bus, 'unit-died', routeId)`
  - (No further processing for this route)

## Turn-Manager Wiring

Insert after `scrubEmbargoedRoutes` call (~line 726), before income loop (~line 730):

```ts
// --- S6b: advance caravan route-runners ---
if (newState.marketplace) {
  newState = advanceRouteRunners(newState, bus);
}
```

Import `advanceRouteRunners` from `@/systems/unit-movement-system`.

## Files Changed

| File | Change |
|---|---|
| `src/systems/unit-movement-system.ts` | Add `advanceRouteRunners` (exported) |
| `src/core/turn-manager.ts` | Import + call `advanceRouteRunners` after S6a scrubbing |
| `tests/systems/trade-system.test.ts` | Add S6b describe block (7 tests) |

`hex-renderer.ts`, `types.ts`, `trade-system.ts` — **no changes needed**.

## Tests

All tests live in `tests/systems/trade-system.test.ts` under a new `describe('S6b — physical caravan movement')` block. They use the existing `makeMinimalState` fixture.

| # | Name | Asserts |
|---|---|---|
| 1 | advances one step per turn toward destination | After `advanceRouteRunners`, caravan.position moves one tile closer to `toCityId` |
| 2 | reverses on arrival at toCityId | After caravan reaches `toCityId`, `routeDirection` becomes `'inbound'` |
| 3 | reverses on arrival at fromCityId + decrements trips | After caravan reaches `fromCityId`, `routeDirection` becomes `'outbound'`, `tripsRemaining` decremented by 1 |
| 4 | caravan consumed + route ended at tripsRemaining=0 | When `tripsRemaining` starts at 1 and caravan arrives at `fromCityId`, unit removed, route removed, `trade:route-ended` with `unit-died` fired |
| 5 | combat kill regression (S6a) | `removeRouteForUnit` with `unit-died` still removes route and clears unit (existing test, add to S6b block as regression marker) |
| 6 | path avoids impassable terrain | Place a mountain between cities; caravan navigates around it (path > 1 step but avoids mountain tile) |
| 7 | actor-complete: AI caravan moves same as player caravan | Route owned by `'enemy'` civ; `advanceRouteRunners` advances it identically |

## Invariants

- **No `Math.random()`** — `findPath` is deterministic A\*
- **Immutable turn processing** — spread-copy throughout; never `state.units[id] = ...`
- **Actor-complete** — iterates all routes regardless of `fromCity.owner`; no `if owner === 'player'` branches
- **`state.currentPlayer` not hardcoded** — route-runner is owner-agnostic
- **Event ordering** — state is updated before `bus.emit` calls (S6a pattern)
- **Save compatibility** — `routeDirection` undefined defaults to `'outbound'`; old saves load without migration
