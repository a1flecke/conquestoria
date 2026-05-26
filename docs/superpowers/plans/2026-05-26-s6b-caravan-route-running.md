# S6b: Physical Caravan Route-Running Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make trade-route caravans physically walk between their two cities each turn, blockable by enemy units, and self-consuming after a fixed number of round trips.

**Architecture:** A new exported function `advanceRouteRunners` in `unit-movement-system.ts` iterates all active trade routes each turn, finds each route's caravan, computes a one-step A* path toward the current target city, checks for enemy blocking, and moves the caravan via spread-copy (immutable). Direction flips on arrival at each city; trips decrement on `fromCity` arrival; caravan and route are removed at zero trips. Turn-manager calls this function after S6a scrubbing and before trade income.

**Tech Stack:** TypeScript, Vitest — no new libraries. Relies on existing `findPath` (A* in `unit-system.ts`), `isAtWar` (diplomacy-system.ts), `removeRouteForUnit` (trade-system.ts).

---

## Files Changed

| File | Change |
|---|---|
| `src/core/types.ts` | Add `'trips-exhausted'` to `GameEvents['trade:route-ended']['reason']` union (line 1148) |
| `src/systems/trade-system.ts` | Add `'trips-exhausted'` to `removeRouteForUnit` reason parameter type (line 453) |
| `src/main.ts` | Add `'trips-exhausted'` entry to `reasonText` map in `trade:route-ended` handler (line 2842) |
| `src/systems/unit-movement-system.ts` | Add `advanceRouteRunners` (exported) + `processCaravanArrival` (private) |
| `src/core/turn-manager.ts` | Import + call `advanceRouteRunners` after S6a scrubbing (line 727) |
| `tests/systems/trade-system.test.ts` | Add `describe('S6b — physical caravan movement')` block with 9 tests |

---

## Task 1: Extend the `'trips-exhausted'` reason type

**Files:**
- Modify: `src/core/types.ts:1148`
- Modify: `src/systems/trade-system.ts:453`
- Modify: `src/main.ts:2842–2848`

This unlocks the full reason union before any tests reference it.

- [ ] **Step 1.1: Add `'trips-exhausted'` to the GameEvents type union**

In `src/core/types.ts`, find line 1148:
```ts
'trade:route-ended': { routeId: string; fromCityId: string; toCityId: string; reason: 'unit-died' | 'unit-disbanded' | 'war-declared' | 'hostile-relations' | 'embargo' };
```
Change to:
```ts
'trade:route-ended': { routeId: string; fromCityId: string; toCityId: string; reason: 'unit-died' | 'unit-disbanded' | 'war-declared' | 'hostile-relations' | 'embargo' | 'trips-exhausted' };
```

- [ ] **Step 1.2: Widen the `removeRouteForUnit` reason parameter**

In `src/systems/trade-system.ts`, line 453:
```ts
  reason: 'unit-died' | 'unit-disbanded' = 'unit-died',
```
Change to:
```ts
  reason: 'unit-died' | 'unit-disbanded' | 'trips-exhausted' = 'unit-died',
```

- [ ] **Step 1.3: Add `'trips-exhausted'` to the UI reason-text map**

In `src/main.ts`, the `reasonText` record inside the `trade:route-ended` handler (lines 2842–2848) currently reads:
```ts
  const reasonText: Record<string, string> = {
    'unit-died': 'caravan destroyed',
    'unit-disbanded': 'caravan disbanded',
    'war-declared': 'war declared — caravan is free to redeploy',
    'hostile-relations': 'hostile relations — caravan is free to redeploy',
    'embargo': 'embargo enforced — caravan is free to redeploy',
  };
```
Add the new entry:
```ts
  const reasonText: Record<string, string> = {
    'unit-died': 'caravan destroyed',
    'unit-disbanded': 'caravan disbanded',
    'war-declared': 'war declared — caravan is free to redeploy',
    'hostile-relations': 'hostile relations — caravan is free to redeploy',
    'embargo': 'embargo enforced — caravan is free to redeploy',
    'trips-exhausted': 'caravan retired after completing its service',
  };
```

- [ ] **Step 1.4: Build to verify the type changes compile**

```bash
bash scripts/run-with-mise.sh yarn build 2>&1 | tail -10
```
Expected: exit 0, no TypeScript errors.

- [ ] **Step 1.5: Commit**

```bash
git add src/core/types.ts src/systems/trade-system.ts src/main.ts
git commit -m "feat(trade): add 'trips-exhausted' route-end reason type and UI text"
```

---

## Task 2: Write the 9 failing S6b tests

**Files:**
- Modify: `tests/systems/trade-system.test.ts` (append new describe block after S6a tests)

Add these imports at the top of the test file if not already present:
```ts
import { advanceRouteRunners } from '@/systems/unit-movement-system';
```

Then add the following describe block. Add it after the last existing `describe` block inside `describe('trade-system', () => { ... })`:

```ts
describe('S6b — physical caravan movement', () => {
  function makeS6bState(overrides: {
    caravanPos?: { q: number; r: number };
    routeDirection?: 'outbound' | 'inbound';
    tripsRemaining?: number;
    atWarWith?: string[];
    extraUnits?: Record<string, any>;
    mountainAt?: { q: number; r: number };
    extraRoutes?: any[];
    extraCaravans?: Record<string, any>;
    caravanOwner?: string;
  } = {}): GameState {
    const base = makeMinimalState({
      caravanPos: overrides.caravanPos ?? { q: 0, r: 0 },
      atWarWith: overrides.atWarWith ?? [],
    });

    // Place caravan at route from city1 (0,0) to city2 (2,0)
    const route = {
      id: 'route1',
      fromCityId: 'city1',
      toCityId: 'city2',
      goldPerTrip: 10,
      turnsPerTrip: 3,
    };

    const caravan: any = {
      ...base.units['caravan1'],
      id: 'caravan1',
      owner: overrides.caravanOwner ?? 'player',
      committedToRouteId: 'route1',
      routeDirection: overrides.routeDirection,
      tripsRemaining: overrides.tripsRemaining ?? 3,
      movementPointsLeft: 0,
      hasActed: true,
    };

    const units: Record<string, any> = { caravan1: caravan, ...overrides.extraUnits };
    if (overrides.extraCaravans) {
      Object.assign(units, overrides.extraCaravans);
    }

    const tradeRoutes = [route, ...(overrides.extraRoutes ?? [])];

    // If caravanOwner is 'enemy', move city1/city2 ownership and fix civ.units
    let civilizations = base.civilizations;
    if (overrides.caravanOwner === 'enemy') {
      civilizations = {
        ...base.civilizations,
        enemy: { ...base.civilizations['enemy'], units: ['caravan1'] },
        player: { ...base.civilizations['player'], units: [] },
      };
    }

    let tiles = base.map.tiles;
    if (overrides.mountainAt) {
      const { q, r } = overrides.mountainAt;
      tiles = {
        ...tiles,
        [`${q},${r}`]: { q, r, terrain: 'mountain', resources: [], improvement: null, featureOverlay: null } as any,
      };
    }

    return {
      ...base,
      civilizations,
      units,
      map: { ...base.map, tiles },
      marketplace: { ...base.marketplace, tradeRoutes },
    } as any;
  }

  it('advances caravan one step per turn toward toCityId', () => {
    // city1=(0,0), city2=(2,0); caravan starts at (0,0) outbound
    const state = makeS6bState({ caravanPos: { q: 0, r: 0 } });
    const result = advanceRouteRunners(state);
    const caravan = result.units['caravan1']!;
    // Should have moved one step toward (2,0)
    expect(caravan.position.q).toBeGreaterThan(0);
  });

  it('flips routeDirection to inbound on arrival at toCityId', () => {
    // Place caravan already at city2 (2,0) outbound
    const state = makeS6bState({
      caravanPos: { q: 2, r: 0 },
      routeDirection: 'outbound',
      tripsRemaining: 3,
    });
    const result = advanceRouteRunners(state);
    const caravan = result.units['caravan1']!;
    expect(caravan.routeDirection).toBe('inbound');
    // trips should NOT decrement on outbound arrival
    expect(caravan.tripsRemaining).toBe(3);
  });

  it('flips routeDirection to outbound and decrements tripsRemaining on arrival at fromCityId', () => {
    // Place caravan at city1 (0,0) inbound with 3 trips left
    const state = makeS6bState({
      caravanPos: { q: 0, r: 0 },
      routeDirection: 'inbound',
      tripsRemaining: 3,
    });
    const result = advanceRouteRunners(state);
    const caravan = result.units['caravan1']!;
    expect(caravan.routeDirection).toBe('outbound');
    expect(caravan.tripsRemaining).toBe(2);
  });

  it('removes caravan and route with trips-exhausted when tripsRemaining reaches 0', () => {
    // Place caravan at city1 (0,0) inbound with exactly 1 trip left
    const state = makeS6bState({
      caravanPos: { q: 0, r: 0 },
      routeDirection: 'inbound',
      tripsRemaining: 1,
    });
    const bus = { emit: vi.fn(), on: vi.fn(), off: vi.fn() } as any;
    const result = advanceRouteRunners(state, bus);

    expect(result.units['caravan1']).toBeUndefined();
    expect(result.marketplace!.tradeRoutes).toHaveLength(0);
    expect(bus.emit).toHaveBeenCalledWith('trade:route-ended', expect.objectContaining({
      routeId: 'route1',
      reason: 'trips-exhausted',
    }));
  });

  it('blocks caravan movement and emits warning when at-war unit occupies path[1]', () => {
    // Place enemy unit at (1,0) — the first step from (0,0) toward (2,0)
    const enemyUnit = {
      id: 'enemy-warrior',
      type: 'warrior',
      owner: 'enemy',
      position: { q: 1, r: 0 },
      health: 100, movementPointsLeft: 0, hasActed: true, hasMoved: false, skippedTurn: false, isResting: false,
    };
    const state = makeS6bState({
      caravanPos: { q: 0, r: 0 },
      routeDirection: 'outbound',
      atWarWith: ['enemy'],
      extraUnits: { 'enemy-warrior': enemyUnit as any },
    });
    const bus = { emit: vi.fn(), on: vi.fn(), off: vi.fn() } as any;
    const result = advanceRouteRunners(state, bus);

    // Caravan must NOT have moved
    expect(result.units['caravan1']!.position).toEqual({ q: 0, r: 0 });
    // Warning notification must have fired
    expect(bus.emit).toHaveBeenCalledWith('notification:show', expect.objectContaining({ type: 'warning' }));
  });

  it('does NOT block caravan movement when non-war unit occupies path[1]', () => {
    // Place a neutral unit at (1,0) — player is not at war with 'neutral'
    const neutralUnit = {
      id: 'neutral-warrior',
      type: 'warrior',
      owner: 'neutral',
      position: { q: 1, r: 0 },
      health: 100, movementPointsLeft: 0, hasActed: true, hasMoved: false, skippedTurn: false, isResting: false,
    };
    const state = makeS6bState({
      caravanPos: { q: 0, r: 0 },
      routeDirection: 'outbound',
      atWarWith: [],
      extraUnits: { 'neutral-warrior': neutralUnit as any },
    });
    const bus = { emit: vi.fn(), on: vi.fn(), off: vi.fn() } as any;
    const result = advanceRouteRunners(state, bus);

    // Caravan MUST have moved
    expect(result.units['caravan1']!.position.q).toBeGreaterThan(0);
    expect(bus.emit).not.toHaveBeenCalledWith('notification:show', expect.anything());
  });

  it('navigates around an impassable mountain tile', () => {
    // Place mountain at (1,0) — direct path between (0,0) and (2,0)
    const state = makeS6bState({
      caravanPos: { q: 0, r: 0 },
      mountainAt: { q: 1, r: 0 },
    });
    const result = advanceRouteRunners(state);
    const caravan = result.units['caravan1']!;
    // Caravan must NOT be at the mountain tile
    expect(caravan.position).not.toEqual({ q: 1, r: 0 });
    // Caravan must have moved (not stayed at origin)
    expect(caravan.position).not.toEqual({ q: 0, r: 0 });
  });

  it('advances two concurrent routes independently', () => {
    // Second caravan + route: caravan2 from city1(0,0) to city2(2,0) too
    const route2 = { id: 'route2', fromCityId: 'city1', toCityId: 'city2', goldPerTrip: 10, turnsPerTrip: 3 };
    const caravan2: any = {
      id: 'caravan2', type: 'caravan', owner: 'player',
      position: { q: 0, r: 0 },
      committedToRouteId: 'route2',
      routeDirection: undefined,
      tripsRemaining: 3,
      health: 100, movementPointsLeft: 0, hasActed: true, hasMoved: false, skippedTurn: false, isResting: false,
    };
    const state = makeS6bState({
      caravanPos: { q: 0, r: 0 },
      extraCaravans: { caravan2 },
      extraRoutes: [route2],
    });
    const result = advanceRouteRunners(state);

    // Both caravans must have moved
    expect(result.units['caravan1']!.position.q).toBeGreaterThan(0);
    expect(result.units['caravan2']!.position.q).toBeGreaterThan(0);
  });

  it('advances AI-owned caravan identically to player-owned caravan (actor-complete)', () => {
    // enemy civ owns the caravan; city1 and city2 are player cities
    // The route still runs from city1 to city2 — owner-agnostic
    const state = makeS6bState({
      caravanPos: { q: 0, r: 0 },
      caravanOwner: 'enemy',
    });
    const result = advanceRouteRunners(state);
    expect(result.units['caravan1']!.position.q).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2.1: Add the `advanceRouteRunners` import to the test file**

At the top of `tests/systems/trade-system.test.ts`, find the last import line and add below it:
```ts
import { advanceRouteRunners } from '@/systems/unit-movement-system';
```

- [ ] **Step 2.2: Append the `makeS6bState` helper and describe block**

Paste the helper function and describe block shown above just before the final closing `});` of the outer `describe('trade-system', ...)` block.

- [ ] **Step 2.3: Run the tests to confirm they all fail (function not yet implemented)**

```bash
bash scripts/run-with-mise.sh yarn test -- tests/systems/trade-system.test.ts 2>&1 | grep -E "FAIL|PASS|Cannot find|advanceRouteRunners"
```
Expected: 9 test failures mentioning `advanceRouteRunners is not a function` or similar.

---

## Task 3: Implement `advanceRouteRunners` in `unit-movement-system.ts`

**Files:**
- Modify: `src/systems/unit-movement-system.ts` (append at bottom of file)

- [ ] **Step 3.1: Add new imports at the top of `unit-movement-system.ts`**

Find the current import block (lines 1–9):
```ts
import type { EventBus } from '@/core/event-bus';
import type { GameState, HexCoord, VillageOutcomeType } from '@/core/types';
import { updateVisibility } from '@/systems/fog-of-war';
import { syncCivilizationContactsFromVisibility } from '@/systems/discovery-system';
import { hexKey, wrappedHexDistance, hexDistance } from '@/systems/hex-utils';
import { moveUnit, getMovementCostForUnit, findPath, UNIT_DEFINITIONS } from '@/systems/unit-system';
import { visitVillage } from '@/systems/village-system';
import { processWonderDiscovery } from '@/systems/wonder-system';
import { refreshLastSeenPresentationsForCiv } from '@/systems/last-seen-presentation';
```

Add two more imports after line 9:
```ts
import { isAtWar } from '@/systems/diplomacy-system';
import { removeRouteForUnit } from '@/systems/trade-system';
```

- [ ] **Step 3.2: Append the private `processCaravanArrival` helper**

Append after the last exported function in `unit-movement-system.ts`:

```ts
function processCaravanArrival(
  state: GameState,
  caravanId: string,
  route: { id: string; fromCityId: string; toCityId: string },
  arrivedAtToCity: boolean,
  bus?: EventBus,
): GameState {
  if (arrivedAtToCity) {
    return {
      ...state,
      units: {
        ...state.units,
        [caravanId]: { ...state.units[caravanId]!, routeDirection: 'inbound' },
      },
    };
  }

  // Arrived at fromCity (inbound leg complete)
  const caravan = state.units[caravanId]!;
  const tripsRemaining = (caravan.tripsRemaining ?? 1) - 1;

  if (tripsRemaining <= 0) {
    // Remove caravan from units and from civ's units array
    const { [caravanId]: _removed, ...remainingUnits } = state.units;
    const ownerCiv = state.civilizations[caravan.owner];
    const newCivs = ownerCiv
      ? {
          ...state.civilizations,
          [caravan.owner]: {
            ...ownerCiv,
            units: ownerCiv.units.filter((id: string) => id !== caravanId),
          },
        }
      : state.civilizations;
    const stateWithoutCaravan = { ...state, units: remainingUnits, civilizations: newCivs };
    return removeRouteForUnit(stateWithoutCaravan, caravanId, bus, 'trips-exhausted', route.id);
  }

  return {
    ...state,
    units: {
      ...state.units,
      [caravanId]: { ...state.units[caravanId]!, routeDirection: 'outbound', tripsRemaining },
    },
  };
}
```

- [ ] **Step 3.3: Append the exported `advanceRouteRunners` function**

```ts
export function advanceRouteRunners(state: GameState, bus?: EventBus): GameState {
  if (!state.marketplace?.tradeRoutes?.length) return state;
  let newState = state;

  for (const route of state.marketplace.tradeRoutes) {
    const caravan = Object.values(newState.units).find(u => u.committedToRouteId === route.id);
    if (!caravan) continue;

    const isOutbound = (caravan.routeDirection ?? 'outbound') === 'outbound';
    const targetCity = newState.cities[isOutbound ? route.toCityId : route.fromCityId];
    if (!targetCity) continue;

    const path = findPath(caravan.position, targetCity.position, newState.map, 'land');
    if (!path || path.length === 0) continue;

    if (path.length === 1) {
      // Already at destination
      newState = processCaravanArrival(newState, caravan.id, route, isOutbound, bus);
      continue;
    }

    // Enemy-blocking check
    const nextStep = path[1]!;
    const ownerCiv = newState.civilizations[caravan.owner];
    const blocked = ownerCiv != null && Object.values(newState.units).some(u =>
      u.id !== caravan.id &&
      u.position.q === nextStep.q && u.position.r === nextStep.r &&
      isAtWar(ownerCiv.diplomacy, u.owner),
    );

    if (blocked) {
      const toCity = newState.cities[route.toCityId];
      bus?.emit('notification:show', {
        message: `Trade route to ${toCity?.name ?? route.toCityId} is blocked by enemy forces.`,
        type: 'warning',
      });
      continue;
    }

    // Move caravan one step via spread-copy (NOT moveUnit — movementPointsLeft is already 0)
    const from = { ...caravan.position };
    newState = {
      ...newState,
      units: {
        ...newState.units,
        [caravan.id]: { ...newState.units[caravan.id]!, position: nextStep },
      },
    };
    bus?.emit('unit:move', { unitId: caravan.id, from, to: nextStep });

    // Check if this step is arrival
    if (nextStep.q === targetCity.position.q && nextStep.r === targetCity.position.r) {
      const movedCaravan = newState.units[caravan.id];
      if (movedCaravan) {
        newState = processCaravanArrival(newState, caravan.id, route, isOutbound, bus);
      }
    }
  }

  return newState;
}
```

- [ ] **Step 3.4: Run the 9 S6b tests and confirm they pass**

```bash
bash scripts/run-with-mise.sh yarn test -- tests/systems/trade-system.test.ts 2>&1 | grep -E "✓|✗|PASS|FAIL|S6b"
```
Expected: all 9 S6b tests pass. Zero failures.

- [ ] **Step 3.5: Run the full test suite to check for regressions**

```bash
bash scripts/run-with-mise.sh yarn test 2>&1 | tail -20
```
Expected: exit 0, same pass count as before plus 9 new passes.

- [ ] **Step 3.6: Commit**

```bash
git add src/systems/unit-movement-system.ts tests/systems/trade-system.test.ts
git commit -m "feat(trade): implement advanceRouteRunners with TDD — S6b caravan physical movement"
```

---

## Task 4: Wire `advanceRouteRunners` into `turn-manager.ts`

**Files:**
- Modify: `src/core/turn-manager.ts` (line 39 for import; ~line 727 for call)

- [ ] **Step 4.1: Add the import**

Find the current import at line 39 in `turn-manager.ts` (or wherever unit-movement-system is imported):

Check if `unit-movement-system` is already imported:
```bash
grep -n "unit-movement-system" src/core/turn-manager.ts
```

If not found, add after the existing `unit-system` import:
```ts
import { advanceRouteRunners } from '@/systems/unit-movement-system';
```

If `unit-movement-system` is already imported, add `advanceRouteRunners` to that import.

- [ ] **Step 4.2: Insert the `advanceRouteRunners` call**

In `src/core/turn-manager.ts`, find the S6a scrubbing block (lines ~723–727):
```ts
  // --- S6a: terminate routes to embargoed civs ---
  if (newState.embargoes && newState.marketplace) {
    newState = scrubEmbargoedRoutes(newState, bus);
    newState = { ...newState, embargoes: cleanupEmbargoes(newState.embargoes) };
  }

  if (newState.marketplace) {  // <-- income loop starts here
```

Insert between these two blocks:
```ts
  // --- S6b: advance caravan route-runners ---
  if (newState.marketplace) {
    newState = advanceRouteRunners(newState, bus);
  }
```

So the result looks like:
```ts
  // --- S6a: terminate routes to embargoed civs ---
  if (newState.embargoes && newState.marketplace) {
    newState = scrubEmbargoedRoutes(newState, bus);
    newState = { ...newState, embargoes: cleanupEmbargoes(newState.embargoes) };
  }

  // --- S6b: advance caravan route-runners ---
  if (newState.marketplace) {
    newState = advanceRouteRunners(newState, bus);
  }

  if (newState.marketplace) {  // income loop
    for (const civId of Object.keys(newState.civilizations)) {
```

- [ ] **Step 4.3: Build to confirm no TypeScript errors**

```bash
bash scripts/run-with-mise.sh yarn build 2>&1 | tail -15
```
Expected: exit 0, no errors.

- [ ] **Step 4.4: Run the full test suite**

```bash
bash scripts/run-with-mise.sh yarn test 2>&1 | tail -20
```
Expected: exit 0. All 9 S6b tests still pass.

- [ ] **Step 4.5: Commit**

```bash
git add src/core/turn-manager.ts
git commit -m "feat(trade): wire advanceRouteRunners into turn-manager after S6a scrubbing — S6b"
```

---

## Task 5: Final build, test, push, PR

- [ ] **Step 5.1: Run the full build one final time**

```bash
bash scripts/run-with-mise.sh yarn build 2>&1 | tail -10
```
Expected: exit 0.

- [ ] **Step 5.2: Run the full test suite one final time**

```bash
bash scripts/run-with-mise.sh yarn test 2>&1 | tail -20
```
Expected: exit 0, all tests green.

- [ ] **Step 5.3: Push the branch**

```bash
git push -u origin HEAD
```

- [ ] **Step 5.4: Open a PR**

```bash
gh pr create \
  --title "feat(trade): S6b — physical caravan route-running + trips-exhausted" \
  --body "$(cat <<'EOF'
## Summary

- Caravans now physically walk one hex per turn between their two cities along the shortest land path (A*).
- Enemy units (from civs at war with the caravan owner) on the next tile block movement and fire a `notification:show` warning.
- Each `fromCity` arrival decrements `tripsRemaining`; at zero, the caravan unit is removed and the route ends with `'trips-exhausted'`.
- `'trips-exhausted'` added to the `trade:route-ended` reason union in `types.ts`, `removeRouteForUnit`, and the `reasonText` map in `main.ts`.
- `advanceRouteRunners` is actor-complete — iterates all routes regardless of owner.
- Wired into `turn-manager` after S6a scrubbing, before trade-route income.

## Tests

9 new tests in `tests/systems/trade-system.test.ts` under `describe('S6b — physical caravan movement')`:
1. Advances one step per turn toward destination
2. Flips direction to inbound on toCityId arrival
3. Flips direction to outbound + decrements trips on fromCityId arrival
4. Removes caravan + route with trips-exhausted when tripsRemaining reaches 0
5. Enemy-at-war unit on path[1] blocks movement + emits notification:show warning
6. Neutral (non-war) unit on path[1] does NOT block movement
7. Navigates around impassable mountain tile
8. Two concurrent routes both advance independently
9. AI-owned caravan advances identically to player-owned (actor-complete)

## Spec

`docs/superpowers/specs/2026-05-26-marketplace-s6b-caravan-route-running-design.md`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review Notes

After writing this plan, checked against the spec:

**Spec coverage:**
- ✅ `advanceRouteRunners` in `unit-movement-system.ts` — Task 3
- ✅ Turn-manager wiring after `scrubEmbargoedRoutes` — Task 4
- ✅ Guard `if (!state.marketplace?.tradeRoutes?.length) return state` — Task 3 step 3.3
- ✅ Find caravan by `committedToRouteId` — Task 3 step 3.3
- ✅ `undefined` routeDirection → `'outbound'` — Task 3 step 3.3
- ✅ Skip when `targetCity` undefined (razed city) — Task 3 step 3.3
- ✅ Skip when no path or path.length === 0 — Task 3 step 3.3
- ✅ `path.length === 1` → process arrival — Task 3 step 3.3
- ✅ Enemy-blocking check with `isAtWar` — Task 3 step 3.3
- ✅ Notification uses route's permanent `toCityId` city name — Task 3 step 3.3
- ✅ Spread-copy NOT `moveUnit()` — Task 3 step 3.2 comment
- ✅ `bus?.emit('unit:move', ...)` — Task 3 step 3.3
- ✅ Arrival at `toCityId` → `routeDirection: 'inbound'` — Task 3 step 3.2
- ✅ Arrival at `fromCityId` → decrement `tripsRemaining` — Task 3 step 3.2
- ✅ `tripsRemaining <= 0` → remove caravan + `removeRouteForUnit('trips-exhausted')` — Task 3 step 3.2
- ✅ Remove caravan from `civ.units` array — Task 3 step 3.2
- ✅ All 9 tests — Task 2
- ✅ `'trips-exhausted'` in types.ts, trade-system.ts, main.ts — Task 1

**Invariant coverage:**
- ✅ No `Math.random()` — uses `findPath` deterministic A*
- ✅ Immutable: spread-copy throughout; no direct mutation
- ✅ Actor-complete: test 9 covers enemy-owned caravan
- ✅ `state.currentPlayer` never hardcoded
- ✅ State updated before `bus.emit` in `processCaravanArrival`
- ✅ Enemy-blocking scope: only `isAtWar` civs, test 6 proves neutral doesn't block

**No open issues found.**
