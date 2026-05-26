# S6b Design — Physical Caravan Route-Running + Raidable

**Date:** 2026-05-26  
**Slice:** S6b (depends on S6a — route termination hooks)  
**Roadmap:** `docs/superpowers/specs/2026-05-20-marketplace-trade-roadmap.md` (D-Q7)

## What This Delivers

The caravan unit physically travels back and forth between its two cities each turn along the shortest land path. It is raidable — enemy units can move to its tile and attack it; the caravan never initiates combat. If a civ-at-war unit is already on the caravan's next tile the caravan skips that step and the player is notified. Killing it ends the route via S6a's existing `removeRouteForUnit` hook. After a fixed number of round trips the caravan is consumed and the route ends with a `'trips-exhausted'` notification.

## Locked-in Decisions

| Question | Answer |
|---|---|
| Where in turn-manager does movement fire? | After `scrubEmbargoedRoutes` (S6a), before trade-route income |
| Path: recompute or store? | Recompute each turn via `findPath` — simpler, no stale-path state |
| Direction tracking | `Unit.routeDirection` (already optional on `Unit`); `undefined` → treat as `'outbound'` |
| `tripsRemaining` at 0 | Caravan consumed, route ends with `'trips-exhausted'` reason |
| Route-path visualisation | Already handled: `render-loop.ts` `drawTradeRouteLines` draws dashed line; caravan renders at updated `position` automatically |
| Raidability | Enemy MOVES to caravan tile → existing combat system triggers; no new code. Caravan skips its step + notifies when enemy unit (from a civ at war with caravan owner) is already on `path[1]`. |
| Fog-of-war on caravan move | No fog update during route-runner (follows barbarian movement pattern; per-civ `updateVisibility` already ran earlier in the turn) |
| Position update method | Direct spread-copy `{ ...unit, position: nextStep }` — NOT `moveUnit()` (which would reduce `movementPointsLeft` already zeroed). `hasMoved` stays false; `hasActed: true` is already set by per-civ loop. |

## Data Model

Both fields are already defined on `Unit` in `types.ts`:

```ts
routeDirection?: 'outbound' | 'inbound';  // undefined → outbound
tripsRemaining?: number;                   // set by establishRoute; decremented on fromCity arrival
```

No `Unit` type changes needed (fields already exist). No save migration needed (fields are optional).

**`types.ts` change required:** add `'trips-exhausted'` to `GameEvents['trade:route-ended']['reason']` union.  
**`trade-system.ts` change required:** update `removeRouteForUnit` `reason` parameter type to include `'trips-exhausted'`.  
**`main.ts` change required:** add `'trips-exhausted': 'caravan retired after completing its service'` to the `reasonText` map in the `trade:route-ended` handler (~line 2843).

## Core Function

```
advanceRouteRunners(state: GameState, bus?: EventBus): GameState
```

Lives in `src/systems/unit-movement-system.ts`. Exported.

**Guard:** `if (!state.marketplace?.tradeRoutes?.length) return state;`

**Algorithm for each route in `state.marketplace.tradeRoutes`:**

1. Find caravan: `Object.values(state.units).find(u => u.committedToRouteId === route.id)`
2. If no caravan, skip (route may have been severed same turn by S6a)
3. Determine target city:
   - `(caravan.routeDirection ?? 'outbound') === 'outbound'` → `state.cities[route.toCityId]`
   - `'inbound'` → `state.cities[route.fromCityId]`
4. **If `targetCity` is undefined** (city razed since route was established): skip this route
5. `findPath(caravan.position, targetCity.position, map, 'land')`
6. If `!path` or `path.length === 0`: skip (no land path — terrain changed; caravan waits)
7. If `path.length === 1` (caravan already at destination): process arrival (see below); continue
8. **Enemy-blocking check:** look up `path[1]`; if any unit owned by a civ at war with `caravan.owner` occupies that tile:
   - Emit `notification:show` with message `"Trade route to [route.toCityId city name] is blocked by enemy forces."` (type `'warning'`) — always uses the route's permanent TO city as the identifier, regardless of current travel direction
   - Skip movement this turn; continue to next route
   - Note: notification fires every turn the path remains blocked; no throttling for MVP
9. Move caravan: spread-copy unit with `position: path[1]`; emit `unit:move`
10. If `path[1]` equals `targetCity.position`: process arrival (see below)

**Arrival at `toCityId` (outbound):**
- Set `routeDirection: 'inbound'` on caravan

**Arrival at `fromCityId` (inbound):**
- Decrement `tripsRemaining` by 1
- If `tripsRemaining <= 0`:
  - Remove caravan from `state.units` and from owner civ's `units` array
  - Call `removeRouteForUnit(newState, caravanId, bus, 'trips-exhausted', routeId)`
  - (No further processing for this route — route is now removed)
- Else: set `routeDirection: 'outbound'` on caravan

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
| `src/core/types.ts` | Add `'trips-exhausted'` to `GameEvents['trade:route-ended']['reason']` |
| `src/systems/trade-system.ts` | Add `'trips-exhausted'` to `removeRouteForUnit` reason parameter type |
| `src/main.ts` | Add `'trips-exhausted'` to `reasonText` map in `trade:route-ended` handler |
| `tests/systems/trade-system.test.ts` | Add S6b describe block (9 tests) |

`hex-renderer.ts` — **no changes needed**.

## Tests

All tests live in `tests/systems/trade-system.test.ts` under a new `describe('S6b — physical caravan movement')` block. They use the existing `makeMinimalState` fixture.

| # | Name | Asserts |
|---|---|---|
| 1 | advances one step per turn toward destination | After `advanceRouteRunners`, caravan.position moves one tile closer to `toCityId` |
| 2 | reverses direction on arrival at toCityId | Caravan placed at `toCityId` position; `routeDirection` flips to `'inbound'` |
| 3 | reverses direction + decrements trips on arrival at fromCityId | Caravan placed at `fromCityId` position with `routeDirection: 'inbound'`; `routeDirection` flips to `'outbound'`, `tripsRemaining` decremented by 1 |
| 4 | caravan consumed + route ended with trips-exhausted | `tripsRemaining: 1`, caravan at `fromCityId`, direction `'inbound'`; after advance: unit removed, route removed, `trade:route-ended` fires with reason `'trips-exhausted'` |
| 5 | enemy unit on path blocks movement + emits notification | Place enemy unit (owner at war) on `path[1]`; caravan does not advance; `notification:show` fires with type `'warning'` |
| 6 | neutral unit on path does NOT block movement | Place unit owned by a non-war civ on `path[1]`; caravan advances through normally |
| 7 | path avoids impassable terrain | Mountain placed between cities; caravan navigates around it (path length > direct distance) |
| 8 | two concurrent routes both advance independently | Two routes with two caravans; both advance one step each per `advanceRouteRunners` call |
| 9 | actor-complete: AI-owned caravan advances same as player caravan | Route owned by `'enemy'` civ; `advanceRouteRunners` advances it identically to a player-owned caravan |

## Invariants

- **No `Math.random()`** — `findPath` is deterministic A\*
- **Immutable turn processing** — spread-copy throughout; never `state.units[id] = ...`
- **Actor-complete** — iterates all routes regardless of `fromCity.owner`; no `if owner === 'player'` branches
- **`state.currentPlayer` not hardcoded** — route-runner is owner-agnostic
- **Event ordering** — state is updated before `bus.emit` calls (S6a pattern)
- **Save compatibility** — `routeDirection` undefined defaults to `'outbound'`; old saves load without migration
- **Enemy-blocking scope** — only civs that are `isAtWar` with the caravan owner block movement; neutral/friendly foreign units do not
- **No caravan-initiated combat** — caravan strength is 0; it never attacks; enemies raid by moving onto the caravan's tile on their turn
