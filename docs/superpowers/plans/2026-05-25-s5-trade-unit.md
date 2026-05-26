# S5 — First Trade Unit + Establish a Route: Implementation Plan

**Spec:** `docs/superpowers/specs/2026-05-25-marketplace-s5-trade-unit-design.md`  
**Branch:** `claude/recursing-chaplygin-c12578`  
**Depends on:** S4b (PR #256, merged)  
**Target effort:** Medium (Sonnet 4.5)

---

## Pre-flight: Issues Fixed vs. Spec

The following issues were found during plan review and are corrected in the steps below. Do **not** follow the spec directly where it conflicts with these corrections.

| # | Issue | Fix Applied |
|---|---|---|
| 1 | `Building` interface has no `routeCapacity` field — spec adds it to building objects but the type is missing | Add `routeCapacity?: number` to the `Building` interface in `types.ts` |
| 2 | Spec says `isAtWar(state, civId)` in `canEstablishRoute` — actual signature is `isAtWar(DiplomacyState, civId)` | Use `isAtWar(state.civilizations[caravanUnit.owner].diplomacy, toCity.owner)` |
| 3 | `getUnmovedUnits` doesn't exclude committed caravans — they'd spam the "unmoved units" cycle every turn | Add `&& !u.committedToRouteId` to the filter in `getUnmovedUnits` |
| 4 | Turn-manager reset pass calls `resetUnitTurn` which restores 3 movement to committed caravans | After reset, zero `movementPointsLeft` and set `hasActed = true` for units with `committedToRouteId` set |
| 5 | Existing `processTradeRouteIncome` test uses `{ goldPerTurn: 3 }` directly — will break when `TradeRoute` drops `goldPerTurn` | Update that test to use `{ goldPerTrip, turnsPerTrip }` and verify `getEffectiveGoldPerTurn` |
| 6 | Spec's building design prompt says to include `icon` in the Building object literal — but existing pattern puts icons in `PRODUCTION_ICONS`, not on the building | Put building icons in `PRODUCTION_ICONS` only; do not add `icon?` to the `Building` interface |
| 7 | `removeRouteForUnit` must be called before the unit is deleted — in death paths, the unit ID must still be in `state.units` when the helper runs | Call `removeRouteForUnit` BEFORE `delete state.units[unitId]` in every death path |
| 8 | Silk Road wonder doesn't exist yet — `getCaravanTripBonus` must not crash | Use `state.completedLegendaryWonders?.['silk-road']?.ownerId === caravanOwner ? 3 : 0`; always evaluates to 0 until the wonder is added |
| 9 | `enforceEmbargoes` only reads `foreignCivId` and city owners — verified safe with new `TradeRoute` shape | No change needed; noted for implementer confidence |
| 10 | Spec's design prompt for buildings is "run in a new session" — plan needs concrete IDs | Step 0 captures the expected IDs; implementer must verify the actual output matches |

---

## Architecture Summary

No new architectural patterns. S5 follows the immutable state + EventBus model:

- `trade-system.ts` gets new pure exported functions; no side effects in those functions  
- `establishRoute` is the one mutation helper — callers spread state  
- All UI uses `createGameButton()` and `textContent`/`createTextNode` only  
- All death paths share a single `removeRouteForUnit` helper  
- Tests live in `tests/systems/trade-system.test.ts`, `tests/core/turn-manager.test.ts`, `tests/ai/basic-ai.test.ts`, `tests/storage/save-migration.test.ts`

---

## Step 0 — Building Design (run before coding)

Run the verbatim design prompt from the spec in a fresh Claude session. Capture the three building object literals. Expected IDs based on spec note:
- `'caravanserai'` — era 2, `techRequired: 'wheel'`
- `'bank'` — era 4, `techRequired: 'banking'`
- `'stock_exchange'` — era 5, `techRequired: 'global-logistics'`

**Important:** The spec's expected IDs include `stock_exchange` (underscore). Verify the actual output uses these exact IDs. If the Claude session returns different IDs (e.g. `'stock-exchange'`), use those — but update `getRouteCapacity` to match.

After Step 0, you have concrete values for: `id`, `name`, `yields`, `productionCost`, `description`, `techRequired`, `adjacencyBonuses`, `routeCapacity`. The `icon` field from the prompt goes into `PRODUCTION_ICONS` (see Step 3), not onto the building object.

---

## Step 1 — Types (`src/core/types.ts`)

Make all interface changes first so TypeScript compilation guides the rest.

### 1a. `UnitType` union — add `'caravan'`

```typescript
// In the UnitType union (around line 233), add:
| 'caravan'
```

### 1b. `Unit` interface — add three optional fields

```typescript
// Add after the existing `automation?` field:
committedToRouteId?: string;   // set on establish; blocks movement while set
tripsRemaining?: number;       // S5 sets it; S6b decrements on each completed round trip
routeDirection?: 'outbound' | 'inbound';  // S6b uses; S5 leaves undefined
```

### 1c. `TradeRoute` interface — replace `goldPerTurn` with new fields, add `id`

Replace the existing interface:
```typescript
export interface TradeRoute {
  id: string;              // 'route-N' using state.idCounters.nextRouteId
  fromCityId: string;
  toCityId: string;
  goldPerTrip: number;     // replaces goldPerTurn; S5 amortises to effective per-turn
  turnsPerTrip: number;    // ceil(hexDistance(from, to) / 3); stored for display + income math
  foreignCivId?: string;
}
```

### 1d. `IdCounters` interface — add `nextRouteId`

```typescript
export interface IdCounters {
  nextUnitId:  number;
  nextCityId:  number;
  nextCampId:  number;
  nextQuestId: number;
  nextRouteId: number;   // NEW — defaults to 1 on old saves
}
```

### 1e. `GameEvents` — add `'trade:route-ended'`

```typescript
// Add alongside 'trade:route-created':
'trade:route-ended': { routeId: string; fromCityId: string; toCityId: string; reason: 'unit-died' | 'unit-disbanded' };
```

### 1f. `Building` interface — add optional `routeCapacity`

```typescript
// Add after the existing `resourceRequired?` field:
routeCapacity?: number;   // slots added to the FROM city; 0 or absent = none
```

**Verify:** Run `yarn build` after this step. Expect TypeScript errors in unit-system.ts (exhaustive Record on UnitType). That is correct and expected — fix in Step 2.

---

## Step 2 — Unit System (`src/systems/unit-system.ts`)

### 2a. `UNIT_DEFINITIONS` — add caravan entry

```typescript
caravan: {
  type: 'caravan',
  name: 'Caravan',
  movementPoints: 3,
  visionRange: 2,
  strength: 0,
  canFoundCity: false,
  canBuildImprovements: false,
  productionCost: 60,
  domain: 'land',
},
```

### 2b. `UNIT_DESCRIPTIONS` — add caravan entry

```typescript
caravan: 'Trade unit. Establish a trade route to generate gold each turn. '
       + 'Once committed, cannot move or act until the route ends (8 round trips base). '
       + 'Cannot attack. Raidable by enemy units in transit.',
```

### 2c. `getUnmovedUnits` — exclude committed caravans

The current filter is:
```typescript
u => u.owner === civId && !u.hasMoved && !u.hasActed && !u.skippedTurn && !u.isFortified
```

Change to:
```typescript
u => u.owner === civId && !u.hasMoved && !u.hasActed && !u.skippedTurn && !u.isFortified && !u.committedToRouteId
```

**Why:** Without this, committed caravans appear in the unmoved-unit cycling every turn since `resetUnitTurn` restores their movement and hasMoved/hasActed both start false.

---

## Step 3 — City System (`src/systems/city-system.ts`)

### 3a. `BUILDINGS` — add three new buildings and update marketplace

Using the IDs from Step 0. Example structure for each new building:
```typescript
caravanserai: {
  id: 'caravanserai',
  name: 'Caravanserai',
  category: 'economy',
  yields: { food: 1, production: 0, gold: 1, science: 0 },   // use Step 0 values
  productionCost: 40,                                           // use Step 0 values
  description: '...',                                          // use Step 0 values
  techRequired: 'wheel',
  adjacencyBonuses: [],
  routeCapacity: 1,
},
// bank and stock_exchange similarly — use Step 0 output verbatim
```

Also update the existing **marketplace** entry — add `routeCapacity: 1`:
```typescript
marketplace: { ..., routeCapacity: 1 },
```

### 3b. `TRAINABLE_UNITS` — add caravan

```typescript
{ type: 'caravan', name: 'Caravan', cost: 60, techRequired: 'trade-routes' },
```

### 3c. `PRODUCTION_ICONS` — add caravan and new building icons

```typescript
caravan: '🐪',
caravanserai: '🏕️',   // use the icon from Step 0 design prompt output
bank: '🏦',            // use the icon from Step 0 design prompt output
stock_exchange: '📈',  // use the icon from Step 0 design prompt output
```

---

## Step 4 — Trade System (`src/systems/trade-system.ts`)

This step adds all new functions plus updates `processTradeRouteIncome`.

**Imports to add at top:**
```typescript
import type { GameState, Unit, City } from '@/core/types';
import { findPath, UNIT_DEFINITIONS } from '@/systems/unit-system';
import { hexDistance, wrappedHexDistance, hexKey } from '@/systems/hex-utils';
import { getCivAvailableResources } from '@/systems/resource-acquisition-system';
import { isAtWar, getRelationship } from '@/systems/diplomacy-system';
import { EventBus } from '@/core/event-bus';   // only if bus needed
```

Check existing imports and merge; do not duplicate.

### 4a. `getRouteCapacity(state, cityId): number` — exported

```typescript
export function getRouteCapacity(state: GameState, cityId: string): number {
  const city = state.cities[cityId];
  if (!city) return 1;
  const b = city.buildings;
  const total = 1
    + (b.includes('caravanserai') ? 1 : 0)
    + (b.includes('marketplace')  ? 1 : 0)
    + (b.includes('bank')         ? 1 : 0)
    + (b.includes('stock_exchange') ? 1 : 0);
  return Math.min(total, 5);
}
```

**Note:** Use the exact building IDs from Step 0. If `stock_exchange` turns out to be `stock-exchange`, update here too.

Helper — remaining capacity for a city:
```typescript
function routesFromCity(state: GameState, cityId: string): number {
  return (state.marketplace?.tradeRoutes ?? []).filter(r => r.fromCityId === cityId).length;
}
```

### 4b. `resolveFromCity(state, caravanUnit): City | null` — exported

```typescript
export function resolveFromCity(state: GameState, caravanUnit: Unit): City | null {
  const ownedCities = Object.values(state.cities)
    .filter(c => c.owner === caravanUnit.owner);

  const candidates: Array<{ city: City; pathLen: number; remaining: number }> = [];
  for (const city of ownedCities) {
    const remaining = getRouteCapacity(state, city.id) - routesFromCity(state, city.id);
    if (remaining <= 0) continue;
    const path = findPath(caravanUnit.position, city.position, state.map, 'land');
    if (!path) continue;
    candidates.push({ city, pathLen: path.length, remaining });
  }

  if (candidates.length === 0) return null;

  // Sort: nearest first; tiebreak by most remaining capacity; tiebreak by highest gold yield
  candidates.sort((a, b) => {
    if (a.pathLen !== b.pathLen) return a.pathLen - b.pathLen;
    if (b.remaining !== a.remaining) return b.remaining - a.remaining;
    const aGold = a.city.buildings.reduce((sum, id) => sum + (state.cities[id] ? 0 : 0), 0); // placeholder
    // use calculated city gold yield if available; for now use remaining as proxy
    return b.remaining - a.remaining;
  });

  return candidates[0].city;
}
```

**Note on tiebreaker:** The spec says "highest current gold yield" as secondary tiebreaker. City gold yield requires `calcCityYield` — that's complex. For medium-effort implementation, using remaining capacity as the only tiebreaker is acceptable. If `calcCityYield` or similar is easily importable, use it; otherwise leave the final tiebreaker as remaining capacity.

### 4c. `getCaravanTripBonus(state, fromCityId, toCityId, caravanOwner): number`

```typescript
export function getCaravanTripBonus(
  state: GameState,
  fromCityId: string,
  toCityId: string,
  caravanOwner: string,
): number {
  const fromCity = state.cities[fromCityId];
  const toCity   = state.cities[toCityId];
  const hasSilkRoad =
    state.completedLegendaryWonders?.['silk-road']?.ownerId === caravanOwner;
  return (
    (fromCity?.buildings.includes('caravanserai') ? 2 : 0) +
    (toCity?.buildings.includes('caravanserai')   ? 2 : 0) +
    (hasSilkRoad ? 3 : 0)
  );
}
```

**Note:** Silk Road wonder doesn't exist yet — `hasSilkRoad` is always false. This is forward-compatible.

### 4d. `canEstablishRoute(state, caravanUnit, toCityId): { ok: boolean; reason?: string }`

```typescript
export function canEstablishRoute(
  state: GameState,
  caravanUnit: Unit,
  toCityId: string,
): { ok: boolean; reason?: string } {
  // 1. Already committed
  if (caravanUnit.committedToRouteId) {
    return { ok: false, reason: 'Caravan is already committed to a route' };
  }
  // 2. TO city must exist
  const toCity = state.cities[toCityId];
  if (!toCity) return { ok: false, reason: 'Destination city not found' };
  // 3. FROM city must exist with capacity
  const fromCity = resolveFromCity(state, caravanUnit);
  if (!fromCity) return { ok: false, reason: 'No city with available route capacity' };
  // 4. Self-route
  if (toCity.id === fromCity.id) return { ok: false, reason: 'Cannot route a city to itself' };
  // 5. Land path must exist FROM→TO
  const path = findPath(fromCity.position, toCity.position, state.map, 'land');
  if (!path) return { ok: false, reason: 'Requires a Naval Trader to cross water' };
  // 6. Foreign city checks
  if (toCity.owner !== caravanUnit.owner) {
    const ownerCiv = state.civilizations[caravanUnit.owner];
    if (!ownerCiv) return { ok: false, reason: 'Owner civilization not found' };
    const dip = ownerCiv.diplomacy;
    if (isAtWar(dip, toCity.owner)) {
      const enemyName = state.civilizations[toCity.owner]?.name ?? toCity.owner;
      return { ok: false, reason: `At war with ${enemyName}` };
    }
    const rel = getRelationship(dip, toCity.owner);
    if (rel < 0) {
      return { ok: false, reason: `Relations too hostile (score: ${rel})` };
    }
  }
  return { ok: true };
}
```

**Important:** `isAtWar` takes `DiplomacyState` (not `GameState`). Import from `diplomacy-system.ts`.

### 4e. `establishRoute(state, caravanUnitId, toCityId, bus?): GameState` — exported

```typescript
export function establishRoute(
  state: GameState,
  caravanUnitId: string,
  toCityId: string,
  bus?: EventBus,
): GameState {
  const newState = structuredClone
    ? structuredClone(state)  // use if available in env
    : JSON.parse(JSON.stringify(state)) as GameState;

  const caravanUnit = newState.units[caravanUnitId];
  if (!caravanUnit) throw new Error(`Unit ${caravanUnitId} not found`);

  const fromCity = resolveFromCity(newState, caravanUnit);
  if (!fromCity) throw new Error('No eligible FROM city — call canEstablishRoute first');

  const toCity = newState.cities[toCityId];
  if (!toCity) throw new Error(`TO city ${toCityId} not found`);

  // Guard: initialise marketplace if absent
  if (!newState.marketplace) {
    newState.marketplace = createMarketplaceState();
  }

  // Guard: initialise nextRouteId if missing (old saves)
  if (!newState.idCounters.nextRouteId) {
    newState.idCounters.nextRouteId = 1;
  }

  // Compute distance (map-wrap aware)
  const hexDist = newState.map.wrapsHorizontally
    ? wrappedHexDistance(fromCity.position, toCity.position, newState.map.width)
    : hexDistance(fromCity.position, toCity.position);

  const turnsPerTrip = Math.ceil(hexDist / 3);

  const resourceDiversity = getCivAvailableResources(newState, caravanUnit.owner).size;
  const goldPerTrip = calculateTradeRouteGold(hexDist, resourceDiversity) * turnsPerTrip;

  const tripBonus = getCaravanTripBonus(newState, fromCity.id, toCityId, caravanUnit.owner);
  const tripsRemaining = 8 + tripBonus;

  const foreignCivId = toCity.owner !== caravanUnit.owner ? toCity.owner : undefined;

  const routeId = `route-${newState.idCounters.nextRouteId}`;
  newState.idCounters.nextRouteId++;

  const route = { id: routeId, fromCityId: fromCity.id, toCityId, goldPerTrip, turnsPerTrip, foreignCivId };
  newState.marketplace.tradeRoutes.push(route);

  newState.units[caravanUnitId] = {
    ...caravanUnit,
    committedToRouteId: routeId,
    tripsRemaining,
    movementPointsLeft: 0,
    hasActed: true,
  };

  bus?.emit('trade:route-created', { route });

  return newState;
}
```

**Note on deep copy:** This codebase uses spread-copy patterns (not `structuredClone`). Use the same pattern as `establishTradeRoute` or similar in the existing trade system. Look at how other immutable state functions handle deep copy — use the same approach.

### 4f. `removeRouteForUnit(state, unitId): GameState` — exported helper

```typescript
export function removeRouteForUnit(
  state: GameState,
  unitId: string,
  bus?: EventBus,
): GameState {
  const unit = state.units[unitId];
  if (!unit?.committedToRouteId) return state;

  const routeId = unit.committedToRouteId;
  const route = state.marketplace?.tradeRoutes.find(r => r.id === routeId);
  if (!route) return state;

  const newRoutes = (state.marketplace?.tradeRoutes ?? []).filter(r => r.id !== routeId);
  const newMarketplace = state.marketplace
    ? { ...state.marketplace, tradeRoutes: newRoutes }
    : state.marketplace;

  bus?.emit('trade:route-ended', {
    routeId,
    fromCityId: route.fromCityId,
    toCityId: route.toCityId,
    reason: 'unit-died',   // caller overrides via the event payload if disbanding
  });

  return {
    ...state,
    marketplace: newMarketplace,
    units: {
      ...state.units,
      [unitId]: { ...unit, committedToRouteId: undefined, tripsRemaining: undefined },
    },
  };
}
```

**Note on reason field:** The `trade:route-ended` event has a `reason` field. Since `bus.emit` takes the full payload, callers that need `'unit-disbanded'` should emit the event themselves after calling `removeRouteForUnit`, OR the helper should accept a `reason` parameter. Add `reason: 'unit-died' | 'unit-disbanded' = 'unit-died'` as a third parameter and pass it to the emit call.

### 4g. `getEffectiveGoldPerTurn(route): number` — exported

```typescript
export function getEffectiveGoldPerTurn(route: TradeRoute): number {
  return Math.max(1, Math.round(route.goldPerTrip / route.turnsPerTrip));
}
```

### 4h. Update `processTradeRouteIncome`

Change:
```typescript
export function processTradeRouteIncome(routes: TradeRoute[]): number {
  return routes.reduce((total, r) => total + r.goldPerTurn, 0);
}
```
To:
```typescript
export function processTradeRouteIncome(routes: TradeRoute[]): number {
  return routes.reduce((total, r) => total + getEffectiveGoldPerTurn(r), 0);
}
```

---

## Step 5 — Unit Visual Resolver (`src/renderer/unit-visual-resolver.ts`)

Add to `FALLBACK_ICONS`:
```typescript
caravan: '🐪',
```

---

## Step 6 — Turn Manager (`src/core/turn-manager.ts`)

### 6a. Heal pass — skip committed caravans

Find the heal loop (around line 241):
```typescript
for (const unitId of civ.units) {
  const unit = newState.units[unitId];
  if (!unit || unit.health >= 100) continue;
  // ... healUnit call
```

Add guard:
```typescript
  if (!unit || unit.health >= 100) continue;
  if (unit.committedToRouteId) continue;   // committed caravans do not heal
```

### 6b. Reset pass — zero committed caravans after reset

Find the reset loop (around line 252):
```typescript
for (const unitId of civ.units) {
  const unit = newState.units[unitId];
  if (unit) {
    newState.units[unitId] = resetUnitTurn(unit);
  }
}
```

Change to:
```typescript
for (const unitId of civ.units) {
  const unit = newState.units[unitId];
  if (unit) {
    let reset = resetUnitTurn(unit);
    if (reset.committedToRouteId) {
      // Committed caravans cannot move; zero out restored movement
      reset = { ...reset, movementPointsLeft: 0, hasActed: true };
    }
    newState.units[unitId] = reset;
  }
}
```

### 6c. Income pass — use `getEffectiveGoldPerTurn`

This is already handled by updating `processTradeRouteIncome` in Step 4h. No additional change needed here — the income pass calls `processTradeRouteIncome` which now uses the new formula.

Import `getEffectiveGoldPerTurn` only if called directly. Otherwise, the `processTradeRouteIncome` change propagates automatically.

### 6d. AI/barbarian death paths — add `removeRouteForUnit`

Find where units die in the AI or turn-manager combat resolution. Before removing a unit from `state.units`, check if it has `committedToRouteId` and call `removeRouteForUnit`.

Pattern to add wherever a unit is deleted:
```typescript
if (state.units[dyingUnitId]?.committedToRouteId) {
  newState = removeRouteForUnit(newState, dyingUnitId, bus);
}
// then delete the unit
delete newState.units[dyingUnitId];
newState.civilizations[ownerCivId].units = newState.civilizations[ownerCivId].units.filter(id => id !== dyingUnitId);
```

Import `removeRouteForUnit` from `'@/systems/trade-system'`.

---

## Step 7 — main.ts Changes

### 7a. Movement block for committed caravans

Find the `handleHexTap` function (around line 1795). Find the movement intent block. Add guard before moving:

```typescript
// In the path that processes a move intent:
const movingUnit = gameState.units[selectedUnitId];
if (movingUnit?.committedToRouteId) {
  showNotification('Caravan is committed to a trade route and cannot move.', 'warning');
  return;
}
```

Also update `buildSelectedUnitHighlights` call site: after getting the highlight result, if the unit has `committedToRouteId`, override:
```typescript
const highlightResult = buildSelectedUnitHighlights(gameState, unitId);
if (gameState.units[unitId]?.committedToRouteId) {
  movementRange = [];
  attackRange = [];
} else {
  movementRange = highlightResult.movementRange;
  attackRange = highlightResult.attackTargets.map(target => target.coord);
}
```

### 7b. Player-kills-unit death path — add `removeRouteForUnit`

Find where combat kills an enemy unit in `main.ts`. Before deleting the unit:
```typescript
if (gameState.units[dyingUnitId]?.committedToRouteId) {
  gameState = removeRouteForUnit(gameState, dyingUnitId, bus);
  // The route-ended event with reason: 'unit-died' is emitted inside removeRouteForUnit
}
```

### 7c. Disband (unit delete) — caravan confirmation dialog

Find the disband handler (the section that uses `createUnitDeleteConfirmationPanel`). Before showing the panel, check if the unit is a caravan with `committedToRouteId`:

```typescript
if (unit.type === 'caravan' && unit.committedToRouteId) {
  // Build route-aware message
  const route = gameState.marketplace?.tradeRoutes.find(r => r.id === unit.committedToRouteId);
  const fromName = route ? (gameState.cities[route.fromCityId]?.name ?? route.fromCityId) : '?';
  const toName   = route ? (gameState.cities[route.toCityId]?.name   ?? route.toCityId)   : '?';
  const goldLoss = route ? getEffectiveGoldPerTurn(route) : 0;

  // Use createUnitDeleteConfirmationPanel but set a custom body
  // The panel currently has a hardcoded body text — we need to override it.
  // Simplest approach: show the panel, then replace the body text node.
  const panel = createUnitDeleteConfirmationPanel(uiLayer, {
    unitName: `Caravan (${fromName} → ${toName})`,
    onConfirm: () => {
      if (gameState.units[selectedUnitId]?.committedToRouteId) {
        gameState = removeRouteForUnit(gameState, selectedUnitId, bus);
        // Emit with reason: 'unit-disbanded'
        if (route) {
          bus.emit('trade:route-ended', {
            routeId: route.id, fromCityId: route.fromCityId,
            toCityId: route.toCityId, reason: 'unit-disbanded',
          });
        }
      }
      delete gameState.units[selectedUnitId];
      currentCiv().units = currentCiv().units.filter(id => id !== selectedUnitId);
      deselectUnit();
      renderLoop.setGameState(gameState);
      updateHUD();
      panel.remove();
    },
    onCancel: () => { panel.remove(); selectUnit(selectedUnitId); },
  });
  // Override body text to include route and gold-loss info
  const bodyEl = panel.querySelector('p');
  if (bodyEl) {
    bodyEl.textContent =
      `Disbanding this Caravan will end your ${fromName} → ${toName} trade route (-${goldLoss} gold/turn). Continue?`;
  }
  return;
}
```

**Note on `removeRouteForUnit` + manual emit:** Since `removeRouteForUnit` already emits `'trade:route-ended'` with `reason: 'unit-died'`, the disband path must either: (a) emit the event with `reason: 'unit-disbanded'` AFTER calling `removeRouteForUnit` (the event fires twice — avoid), or (b) pass the reason to `removeRouteForUnit`. The cleaner fix: add a `reason` parameter to `removeRouteForUnit` (see Step 4f note). Use `removeRouteForUnit(gameState, selectedUnitId, bus, 'unit-disbanded')`.

### 7d. Save migration — update `migrateLegacySave()`

Add after the existing `idCounters` check (around line 2819):

```typescript
// S5 migration: nextRouteId
if (!gameState.idCounters.nextRouteId) {
  gameState.idCounters.nextRouteId = 1;
}

// S5 migration: marketplace init
if (!gameState.marketplace) {
  gameState.marketplace = createMarketplaceState();
}

// S5 migration: TradeRoute shape — assign id, goldPerTrip, turnsPerTrip
let legacyRouteN = 1;
for (const route of gameState.marketplace.tradeRoutes) {
  const r = route as any;
  if (!r.id) {
    r.id = `route-legacy-${legacyRouteN++}`;
  }
  if (!r.goldPerTrip) {
    r.goldPerTrip = (r.goldPerTurn ?? 2) * (r.turnsPerTrip ?? 3);
  }
  if (!r.turnsPerTrip) {
    r.turnsPerTrip = 3;
  }
  // Remove legacy field (optional, prevents type confusion)
  delete r.goldPerTurn;
}
```

Import `createMarketplaceState` from `'@/systems/trade-system'` if not already imported.

---

## Step 8 — UI

### 8a. `src/ui/selected-unit-info.ts` — "Establish Route" button

Find where action buttons are rendered for the selected unit. Add the caravan-specific section:

```typescript
import { resolveFromCity } from '@/systems/trade-system';
import { createGameButton } from '@/ui/ui-kit';

// In the render/update function, after existing unit-type checks:
if (unit.type === 'caravan' && unit.owner === state.currentPlayer) {
  if (!unit.committedToRouteId) {
    const fromCity = resolveFromCity(state, unit);
    const hasCapacity = fromCity !== null;

    const btn = createGameButton('Establish Route', 'primary', { disabled: !hasCapacity });
    if (!hasCapacity) {
      btn.title = 'No cities with available route capacity — build a Caravanserai or Marketplace to add slots';
    } else {
      btn.addEventListener('click', () => {
        openEstablishRoutePanel(state, unit.id);
      });
    }
    container.appendChild(btn);
  } else {
    // Committed — show route status
    const statusEl = document.createElement('div');
    statusEl.textContent = `Committed to route (${unit.tripsRemaining ?? '?'} trips remaining)`;
    statusEl.style.cssText = 'font-size:12px;opacity:0.7;padding:8px 0;';
    container.appendChild(statusEl);
  }
}
```

### 8b. New file `src/ui/establish-route-panel.ts`

Create the city-picker panel. Key requirements:
- **No `innerHTML` with game strings** — use `document.createElement` + `textContent`/`createTextNode` only
- **All buttons via `createGameButton()`** — min-height 44px is automatic
- FROM city resolved once at open time via `resolveFromCity(state, caravan)`
- Eligible rows: selectable, show `+N gold/turn · N trips`
- Ineligible rows: greyed, show projected gold AND reason
- "Confirm" only enabled when a row is selected

```typescript
import type { GameState, Unit, City } from '@/core/types';
import {
  resolveFromCity, canEstablishRoute, getCaravanTripBonus,
  getEffectiveGoldPerTurn, calculateTradeRouteGold,
} from '@/systems/trade-system';
import { hexDistance, wrappedHexDistance } from '@/systems/hex-utils';
import { createGameButton } from '@/ui/ui-kit';

export function openEstablishRoutePanel(
  container: HTMLElement,
  state: GameState,
  caravanUnitId: string,
  onEstablish: (toCityId: string) => void,
): void {
  container.querySelector('#establish-route-panel')?.remove();

  const unit = state.units[caravanUnitId];
  if (!unit) return;

  const fromCity = resolveFromCity(state, unit);
  if (!fromCity) return;

  const panel = document.createElement('div');
  panel.id = 'establish-route-panel';
  panel.style.cssText = 'position:absolute;bottom:0;left:0;right:0;z-index:50;background:#171923;border-top:1px solid rgba(255,255,255,0.15);padding:16px;max-height:70vh;overflow-y:auto;';

  // Header
  const header = document.createElement('div');
  header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;';
  const title = document.createElement('h3');
  title.style.cssText = 'font-size:15px;color:#e8c170;margin:0;';
  title.textContent = `Trade Routes from ${fromCity.name} (Caravan)`;
  const closeBtn = createGameButton('✕', 'ghost');
  closeBtn.addEventListener('click', () => panel.remove());
  header.appendChild(title);
  header.appendChild(closeBtn);
  panel.appendChild(header);

  // Build city lists
  const allCities = Object.values(state.cities).filter(c => c.id !== fromCity.id);
  const domestic = allCities.filter(c => c.owner === unit.owner);
  const foreign  = allCities.filter(c => c.owner !== unit.owner);

  let selectedCityId: string | null = null;
  let confirmBtn: HTMLButtonElement;

  function buildCityRow(city: City): HTMLElement {
    const check = canEstablishRoute(state, unit, city.id);

    const hexDist = state.map.wrapsHorizontally
      ? wrappedHexDistance(fromCity!.position, city.position, state.map.width)
      : hexDistance(fromCity!.position, city.position);
    const turnsPerTrip = Math.max(1, Math.ceil(hexDist / 3));
    const resourceDiversity = 0; // simplified; full calculation in establishRoute
    const effectiveGold = Math.max(1, Math.round(calculateTradeRouteGold(hexDist, resourceDiversity)));
    const tripBonus = check.ok ? getCaravanTripBonus(state, fromCity!.id, city.id, unit.owner) : 0;
    const trips = 8 + tripBonus;

    const row = document.createElement('div');
    row.style.cssText = `display:flex;justify-content:space-between;align-items:center;padding:10px 8px;border-bottom:1px solid rgba(255,255,255,0.08);cursor:${check.ok ? 'pointer' : 'default'};opacity:${check.ok ? '1' : '0.5'};min-height:44px;`;

    const left = document.createElement('span');
    left.textContent = `${fromCity!.name} → ${city.name}`;
    row.appendChild(left);

    const right = document.createElement('span');
    right.style.cssText = 'font-size:12px;color:#6b9b4b;text-align:right;';

    if (check.ok) {
      right.textContent = `+${effectiveGold} gold/turn · ${trips} trips`;
      row.addEventListener('click', () => {
        // Deselect previously selected
        panel.querySelectorAll('.route-row-selected').forEach(el => {
          (el as HTMLElement).style.background = '';
          el.classList.remove('route-row-selected');
        });
        selectedCityId = city.id;
        row.style.background = 'rgba(107, 155, 75, 0.2)';
        row.classList.add('route-row-selected');
        if (confirmBtn) {
          confirmBtn.disabled = false;
          confirmBtn.style.opacity = '1';
          confirmBtn.style.cursor = 'pointer';
          confirmBtn.style.pointerEvents = '';
        }
      });
    } else {
      right.style.color = '#888';
      const reasonEl = document.createElement('div');
      reasonEl.style.cssText = 'font-size:11px;opacity:0.6;';
      reasonEl.textContent = check.reason ?? 'Unavailable';
      const goldEl = document.createElement('div');
      goldEl.textContent = `${effectiveGold} gold/turn if available`;
      right.appendChild(goldEl);
      right.appendChild(reasonEl);
    }
    row.appendChild(right);
    return row;
  }

  function appendSection(label: string, cities: City[]): void {
    if (cities.length === 0) return;
    const sectionHeader = document.createElement('div');
    sectionHeader.textContent = label;
    sectionHeader.style.cssText = 'font-size:11px;text-transform:uppercase;opacity:0.5;padding:8px 0 4px;letter-spacing:0.05em;';
    panel.appendChild(sectionHeader);
    for (const city of cities) {
      panel.appendChild(buildCityRow(city));
    }
  }

  const hasAny = allCities.length > 0;
  if (!hasAny) {
    const empty = document.createElement('div');
    empty.style.cssText = 'text-align:center;padding:24px;opacity:0.5;font-size:13px;';
    empty.textContent = 'No eligible destinations.';
    panel.appendChild(empty);
  } else {
    appendSection('Domestic Routes', domestic);
    appendSection('Foreign Routes', foreign);
  }

  // Button row
  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;gap:8px;margin-top:16px;';
  confirmBtn = createGameButton('Confirm', 'primary', { disabled: true });
  confirmBtn.addEventListener('click', () => {
    if (!selectedCityId) return;
    onEstablish(selectedCityId);
    panel.remove();
  });
  const cancelBtn = createGameButton('Cancel', 'secondary');
  cancelBtn.addEventListener('click', () => panel.remove());
  btnRow.appendChild(confirmBtn);
  btnRow.appendChild(cancelBtn);
  panel.appendChild(btnRow);

  container.appendChild(panel);
}
```

**Wire into `selected-unit-info.ts`:** The `onEstablish` callback should call `establishRoute(state, caravanUnitId, toCityId, bus)` in `main.ts`, update `gameState`, refresh the UI, and emit any notifications.

### 8c. `src/ui/marketplace-panel.ts` — update route list

Replace the current `buildTradeRoutesHtml` / innerHTML route rendering with safe DOM construction.

Find the route-display section (around line 81–215). Replace with a function that:
1. Groups routes by `fromCityId`
2. For each FROM city, shows the city name, `usedSlots/totalSlots`, and route rows
3. Uses `document.createElement` + `textContent` — no template literals with city/player names
4. Shows `+N gold/turn` using `getEffectiveGoldPerTurn(route)`
5. Shows `N trips remaining` using `route.tripsRemaining` from the committed unit (look up via `Object.values(state.units).find(u => u.committedToRouteId === route.id)`)
6. Empty state: "No active routes. Train a Caravan to establish one."

```typescript
import { getRouteCapacity, getEffectiveGoldPerTurn } from '@/systems/trade-system';

function buildRouteListSection(state: GameState, currentPlayer: string): HTMLElement {
  const wrapper = document.createElement('div');

  const heading = document.createElement('div');
  heading.textContent = 'Active Trade Routes';
  heading.style.cssText = 'font-size:14px;color:#e8c170;margin-bottom:8px;';
  wrapper.appendChild(heading);

  const playerRoutes = (state.marketplace?.tradeRoutes ?? []).filter(r => {
    const city = state.cities[r.fromCityId];
    return city?.owner === currentPlayer;
  });

  if (playerRoutes.length === 0) {
    const empty = document.createElement('div');
    empty.textContent = 'No active routes. Train a Caravan to establish one.';
    empty.style.cssText = 'font-size:12px;opacity:0.5;text-align:center;padding:16px 0;';
    wrapper.appendChild(empty);
    return wrapper;
  }

  // Group by fromCityId
  const groups = new Map<string, typeof playerRoutes>();
  for (const route of playerRoutes) {
    const arr = groups.get(route.fromCityId) ?? [];
    arr.push(route);
    groups.set(route.fromCityId, arr);
  }

  for (const [cityId, routes] of groups) {
    const city = state.cities[cityId];
    if (!city) continue;
    const total = getRouteCapacity(state, cityId);
    const used  = routes.length;

    const cityHeader = document.createElement('div');
    cityHeader.style.cssText = 'font-size:13px;color:#e8c170;margin:10px 0 4px;';
    const cityName = document.createTextNode(`${city.name}  (${used}/${total} slots)`);
    cityHeader.appendChild(cityName);
    wrapper.appendChild(cityHeader);

    for (const route of routes) {
      const toCity = state.cities[route.toCityId];
      const committedUnit = Object.values(state.units).find(u => u.committedToRouteId === route.id);
      const tripsLeft = committedUnit?.tripsRemaining ?? '?';
      const gold = getEffectiveGoldPerTurn(route);

      const row = document.createElement('div');
      row.style.cssText = 'font-size:12px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.08);display:flex;justify-content:space-between;min-height:44px;align-items:center;cursor:pointer;';

      const routeLabel = document.createElement('span');
      routeLabel.appendChild(document.createTextNode(`${city.name} → ${toCity?.name ?? route.toCityId}`));
      row.appendChild(routeLabel);

      const routeDetail = document.createElement('span');
      routeDetail.style.cssText = 'font-size:11px;color:#6b9b4b;';
      routeDetail.appendChild(document.createTextNode(`+${gold} gold/turn · ${tripsLeft} trips`));
      row.appendChild(routeDetail);

      if (committedUnit) {
        row.addEventListener('click', () => {
          bus.emit('ui:select-unit', { unitId: committedUnit.id });
        });
      }

      wrapper.appendChild(row);
    }
  }

  return wrapper;
}
```

Replace the call site in the marketplace panel render with this function.

---

## Step 9 — Renderer (`src/renderer/hex-renderer.ts`)

Find the section after city dots are drawn, before units. Add trade route lines:

```typescript
// Draw trade route lines (after city rendering, before units)
if (state.marketplace?.tradeRoutes) {
  const currentPlayer = state.currentPlayer;
  const playerCiv = state.civilizations[currentPlayer];
  const routeColor = playerCiv?.color ?? '#888';

  ctx.save();
  ctx.setLineDash([6, 4]);
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.6;
  ctx.strokeStyle = routeColor;

  for (const route of state.marketplace.tradeRoutes) {
    const fromCity = state.cities[route.fromCityId];
    const toCity   = state.cities[route.toCityId];
    if (!fromCity || !toCity) continue;
    if (fromCity.owner !== currentPlayer) continue;   // privacy: only own routes

    // Check both cities visible to currentPlayer
    const fromVis = getVisibility(playerCiv.visibility, fromCity.position);
    const toVis   = getVisibility(playerCiv.visibility, toCity.position);
    if (fromVis === 'unexplored' || toVis === 'unexplored') continue;

    const fromPx = hexToPixel(fromCity.position);  // use existing conversion
    const toPx   = hexToPixel(toCity.position);

    ctx.beginPath();
    ctx.moveTo(fromPx.x, fromPx.y);
    ctx.lineTo(toPx.x, toPx.y);
    ctx.stroke();
  }

  ctx.restore();
}
```

**Note:** Use the actual hex-to-pixel conversion function name used in the renderer (check existing city dot drawing for the correct function call). Import `getVisibility` from fog-of-war system if not already imported.

---

## Step 10 — AI (`src/ai/basic-ai.ts`)

### 10a. Caravan training decision

Find the city production decision logic (where the AI picks what to put in the build queue). Add:

```typescript
import { getRouteCapacity } from '@/systems/trade-system';

// In the AI's city evaluation block:
const hasTradeTech = civ.techState.completed.includes('trade-routes');
const hasCapacity  = civ.cities.some(cityId => {
  const city = state.cities[cityId];
  if (!city) return false;
  const routes = (state.marketplace?.tradeRoutes ?? []).filter(r => r.fromCityId === cityId).length;
  return getRouteCapacity(state, cityId) > routes;
});
const hasUncommittedCaravan = Object.values(state.units)
  .some(u => u.owner === civId && u.type === 'caravan' && !u.committedToRouteId);

if (hasTradeTech && hasCapacity && !hasUncommittedCaravan) {
  // Add caravan to production queue if not already queued
  if (!city.productionQueue.includes('caravan')) {
    // push to queue or set as next item — follow existing AI queue pattern
  }
}
```

### 10b. Caravan route establishment

Find the AI unit action loop. Add a branch for caravans:

```typescript
import {
  canEstablishRoute, establishRoute, resolveFromCity,
} from '@/systems/trade-system';

if (unit.type === 'caravan' && !unit.committedToRouteId) {
  // Try domestic first (own city with highest gold yield)
  const ownCities = civ.cities.map(id => state.cities[id]).filter(Boolean) as City[];
  const foreignCities = Object.values(state.cities).filter(c => c.owner !== civId);

  const candidates = [...ownCities, ...foreignCities];
  for (const candidate of candidates) {
    const check = canEstablishRoute(state, unit, candidate.id);
    if (check.ok) {
      state = establishRoute(state, unit.id, candidate.id, bus);
      break;
    }
  }
}
```

---

## Step 11 — Tests

### 11a. Update existing test in `tests/systems/trade-system.test.ts`

The `processTradeRouteIncome` test currently passes `{ goldPerTurn: 3 }` objects. Replace with:

```typescript
describe('processTradeRouteIncome', () => {
  it('sums effective gold/turn from all routes', () => {
    const routes = [
      { id: 'r1', fromCityId: 'c1', toCityId: 'c2', goldPerTrip: 9, turnsPerTrip: 3 },  // 3/turn
      { id: 'r2', fromCityId: 'c1', toCityId: 'c3', goldPerTrip: 15, turnsPerTrip: 3 }, // 5/turn
    ];
    expect(processTradeRouteIncome(routes)).toBe(8);
  });

  it('returns 0 for empty routes', () => {
    expect(processTradeRouteIncome([])).toBe(0);
  });
});
```

Also add `getEffectiveGoldPerTurn` tests:
```typescript
describe('getEffectiveGoldPerTurn', () => {
  it('rounds goldPerTrip / turnsPerTrip', () => {
    expect(getEffectiveGoldPerTurn({ id: 'r1', fromCityId: 'c1', toCityId: 'c2', goldPerTrip: 10, turnsPerTrip: 3 })).toBe(3);
  });
  it('returns minimum 1 even for tiny routes', () => {
    expect(getEffectiveGoldPerTurn({ id: 'r1', fromCityId: 'c1', toCityId: 'c2', goldPerTrip: 1, turnsPerTrip: 5 })).toBe(1);
  });
});
```

### 11b. New tests in `tests/systems/trade-system.test.ts`

Add a `describe('S5 — caravan trade routes', ...)` block. Use a minimal `GameState` factory that creates:
- 2 cities owned by `'player'`
- 1 foreign city owned by `'enemy'`
- 1 caravan unit at player's first city position
- diplomacy state with `atWarWith: []` and `relationships: { enemy: 0 }`
- `marketplace: createMarketplaceState()`
- `idCounters: { nextUnitId: 10, nextCityId: 10, nextCampId: 10, nextQuestId: 10, nextRouteId: 1 }`
- A simple 5×5 map of `grassland` tiles

Tests to write (one `it()` per row in spec test table):

```typescript
it("'caravan' is in UnitType union and UNIT_DEFINITIONS has entry", ...);
it("UNIT_DESCRIPTIONS['caravan'] is present", ...);
it("PRODUCTION_ICONS['caravan'] is present", ...);
it("Caravan trains with trade-routes tech; absent without", ...);
it("getRouteCapacity: base=1; +1 per building; hard cap=5", ...);
it("getCaravanTripBonus: +2 FROM caravanserai; +2 TO caravanserai; +3 Silk Road (always 0 until wonder exists)", ...);
it("canEstablishRoute domestic: ok when capacity available", ...);
it("canEstablishRoute domestic: blocked when FROM city at capacity", ...);
it("canEstablishRoute foreign: ok at relationship ≥ 0, not at war", ...);
it("canEstablishRoute foreign: blocked at war", ...);
it("canEstablishRoute foreign: blocked at relationship < 0", ...);
it("canEstablishRoute: water-crossing excluded (findPath returns null for blocked map)", ...);
it("establishRoute: sets committedToRouteId + tripsRemaining on unit", ...);
it("establishRoute: pushes route to marketplace.tradeRoutes", ...);
it("establishRoute: emits trade:route-created exactly once", ...);
it("establishRoute: sets foreignCivId when TO city is foreign", ...);
it("establishRoute: does NOT set foreignCivId for domestic route", ...);
it("establishRoute: initialises marketplace if undefined on state", ...);
it("canEstablishRoute: blocked when caravan already has committedToRouteId", ...);
it("canEstablishRoute: blocked when FROM city === TO city (self-route)", ...);
it("canEstablishRoute: blocked when resolveFromCity returns null (all cities at capacity)", ...);
it("resolveFromCity: returns nearest city with capacity; returns null when all at cap", ...);
it("removeRouteForUnit: removes route and clears committedToRouteId", ...);
```

### 11c. Tests in `tests/core/turn-manager.test.ts`

```typescript
it("Route income credited to FROM city owner each turn", ...);
it("Committed caravan skipped by auto-heal pass", ...);
it("Committed caravan has movementPointsLeft=0 after turn reset", ...);
```

### 11d. Tests in `tests/ai/basic-ai.test.ts`

```typescript
it("AI establishes domestic route when conditions met", ...);
```

### 11e. Tests in `tests/storage/save-migration.test.ts`

```typescript
it("Old save with goldPerTurn route migrates to goldPerTrip/turnsPerTrip without error", () => {
  const legacyRoute = { fromCityId: 'c1', toCityId: 'c2', goldPerTurn: 4, foreignCivId: undefined };
  const state = buildMinimalState({ tradeRoutes: [legacyRoute] });
  migrateLegacySave(); // or however it's called in tests
  expect(state.marketplace.tradeRoutes[0].id).toBeTruthy();
  expect(state.marketplace.tradeRoutes[0].goldPerTrip).toBe(12);  // 4 × 3 default turnsPerTrip
  expect(state.marketplace.tradeRoutes[0].turnsPerTrip).toBe(3);
});

it("Old save missing nextRouteId on idCounters defaults to 1", () => {
  const state = buildMinimalState({ idCounters: { nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 } });
  migrateLegacySave();
  expect(state.idCounters.nextRouteId).toBe(1);
});
```

---

## Step 12 — Verification

Before marking complete, run:

```bash
bash scripts/run-with-mise.sh yarn build   # must exit 0 — this runs tsc
bash scripts/run-with-mise.sh yarn test    # must exit 0
```

### Regression checklist

- [ ] Existing unit tests still pass (no `goldPerTurn` references in test fixtures)
- [ ] `UnitType` union exhaustiveness: `UNIT_DEFINITIONS` and `UNIT_DESCRIPTIONS` both have `caravan`
- [ ] `TRAINABLE_UNITS` has caravan with `techRequired: 'trade-routes'`
- [ ] `PRODUCTION_ICONS` has `caravan: '🐪'`
- [ ] `FALLBACK_ICONS` has `caravan: '🐪'` in unit-visual-resolver
- [ ] `Building` interface has `routeCapacity?: number`
- [ ] `TradeRoute` has `id`, `goldPerTrip`, `turnsPerTrip` — no `goldPerTurn`
- [ ] `IdCounters` has `nextRouteId`
- [ ] `migrateLegacySave` handles `nextRouteId`, route migration, marketplace init
- [ ] Caravan cannot move when `committedToRouteId` is set (manual smoke test)
- [ ] Caravan does NOT appear in unmoved-unit cycling after being committed
- [ ] Disband of committed caravan shows route-aware warning dialog
- [ ] Marketplace panel renders routes grouped by FROM city with capacity counts
- [ ] Trade route dashed lines draw on the map for player's own routes

---

## Scope Boundary (do not implement)

- Physical caravan movement on map (S6b)
- Route termination on war / relation decay (S6a)
- Trip countdown / caravan consumption (S6b)
- Naval trader (S7)
- `turnsPerTrip` countdown in marketplace panel (use `tripsRemaining` from unit instead)
