# S5 — First Trade Unit + Establish a Route

**Slice:** Phase 3 of the Marketplace & Trade Roadmap  
**Depends on:** S4b (strategic resource prerequisites — merged PR #256)  
**Roadmap:** `docs/superpowers/specs/2026-05-20-marketplace-trade-roadmap.md`  
**Status:** Design approved, awaiting implementation

---

## Goal

Make the dead `trade-routes` tech unlock real. A player who researches `trade-routes` (era 4) can train a **Caravan** unit and establish a trade route that pays gold every turn. In S5, route establishment is **position-independent** — the player selects a destination from a city picker; the caravan is immediately committed wherever it stands. Physical travel (the caravan actually walking between cities) is S6b scope.

Domestic routes (own cities) require only available capacity. Foreign routes additionally require a neutral-or-better relationship and no active war. Route capacity is capped per city and scales with economy buildings. The caravan is committed to the route for a fixed number of round trips (counter stored, countdown begins in S6b).

---

## Locked decisions

| Decision | Choice |
|---|---|
| Unit name / icon | **Caravan** / 🐪 |
| Movement / vision / strength | 3 / 2 / 0 (civilian, non-combat) |
| Production cost | 60 |
| Tech gate | `trade-routes` (era 4, already exists) |
| Domain | `land` |
| Base trips | **8 round trips** |
| Route capacity formula | `1 (base) + caravanserai + marketplace + bank + stockExchange` — hard cap 5, per FROM city |
| Trip bonus sources | Caravanserai in FROM city +2, Caravanserai in TO city +2, Silk Road wonder +3 |
| Era scaling (S7) | Merchant (era 5) = 12 base trips; Trade Convoy (era 6) = 16 base trips |
| Establish-route UX | "Establish Route" button → city picker panel (eligible destinations + gold/turn preview) → confirm |
| FROM city detection | Nearest eligible owned city with remaining capacity (A* land path must exist) |
| Architecture | Approach B — `TradeRoute` gets `id`; `Unit` gets `committedToRouteId?`, `tripsRemaining?`, `routeDirection?` |
| Intercontinental gate | `findPath(fromCity, toCity, map, 'land') === null` → excluded from picker, shown locked with reason "Requires a Naval Trader to cross water" |
| Naval trade | Separate unit type, S7 scope; same data model, `domain: 'naval'` |
| Air trade | Deferred indefinitely |
| Income model (S5) | Amortised per-turn: `effectiveGoldPerTurn = goldPerTrip / turnsPerTrip` (min 1). S6b switches to fire-on-arrival. |
| Route rendering | Dashed line between city centers, drawn in owning civ's colour, fog/privacy respected |
| Caravan fate | Committed (cannot move while `committedToRouteId` set); death removes route; trip countdown in S6b |

---

## Data model changes

All new fields are **optional** — old saves load without migration.

### `IdCounters` (in `src/core/types.ts`)

Add `nextRouteId: number` to the existing `IdCounters` interface. Default value `1`. Used by `establishRoute` to generate stable, incrementing route IDs (`'route-1'`, `'route-2'`, …). Old saves missing this field default to `1` at load time.

### `TradeRoute` (in `src/core/types.ts`)

```typescript
export interface TradeRoute {
  id: string;              // NEW — 'route-N' using state.idCounters.nextRouteId
  fromCityId: string;
  toCityId: string;
  goldPerTrip: number;     // replaces goldPerTurn; S5 amortises to effective per-turn
  turnsPerTrip: number;    // ceil(hexDistance(from, to) / 3); stored for display + income math
  foreignCivId?: string;   // unchanged
}
```

**Save migration:** Any `TradeRoute` loaded from an old save that is missing `id` gets a generated one (`'route-legacy-N'`) at load time; missing `goldPerTrip` defaults to `(route as any).goldPerTurn ?? 2`; missing `turnsPerTrip` defaults to `3`. `IdCounters` missing `nextRouteId` defaults to `1`.

### `Unit` (in `src/core/types.ts`)

```typescript
// Add optional fields to existing Unit interface:
committedToRouteId?: string;   // set on establish; blocks movement while set
tripsRemaining?: number;       // S5 sets it; S6b decrements on each completed round trip
routeDirection?: 'outbound' | 'inbound';  // S6b uses; S5 leaves undefined
```

### `GameEvents` (in `src/core/types.ts`)

Add one new event:
```typescript
'trade:route-ended': { routeId: string; fromCityId: string; toCityId: string; reason: 'unit-died' | 'unit-disbanded' };
```
(`trade:route-created` already exists.)

### No new `MarketplaceState` fields

`getRouteCapacity`, `resolveFromCity`, and `getCaravanTripBonus` are **pure computed functions** — they derive from existing building lists and unit positions. No new stored state.

---

## New buildings

### Design prompt (run verbatim in a new session before implementing)

> *"Design three new economy buildings for Conquestoria, a Civilization-style strategy game. Each needs: `id`, `name`, `category: 'economy'`, `yields` (food/production/gold/science), `productionCost`, `description` (1 sentence, flavor + mechanical effect), `techRequired` (use the exact tech id given), `icon` (single emoji), and `routeCapacity: 1` (adds one trade route slot to the city). Keep yields modest — these are trade infrastructure, not production powerhouses. Be historically grounded.*
>
> *Building 1: **Caravanserai** — `techRequired: 'wheel'` (era 2). Persian/Silk Road roadside inn that resupplied and sheltered merchant caravans. Should feel like early-game trade infrastructure — small gold yield, maybe a touch of food (merchants need feeding).*
>
> *Building 2: **Bank** — `techRequired: 'banking'` (era 4). Medici-era financial institution enabling letters of credit and long-distance trade without moving physical gold. Should give meaningful gold yield — this is the era of commercial empires.*
>
> *Building 3: **Stock Exchange** — `techRequired: 'global-logistics'` (era 5). Amsterdam/London-era institution enabling joint-stock companies and financed global trade empires. Highest gold yield of the three, possibly a small science yield (financial innovation).*
>
> *Return a TypeScript object literal for each, matching the `Building` interface from `src/systems/city-system.ts` (fields: `id`, `name`, `category`, `yields`, `productionCost`, `description`, `techRequired`, `adjacencyBonuses: []`, `icon`, `routeCapacity`). Do NOT include `pacing`."*

### Marketplace (existing) — add `routeCapacity`

Add `routeCapacity: 1` to the existing `marketplace` entry in `BUILDINGS`. No other changes.

### Route capacity summary

| Building | Era | Tech | `routeCapacity` |
|---|---|---|---|
| *(base — always)* | — | — | 1 |
| Caravanserai | 2 | `wheel` | +1 |
| Marketplace | 3 | `currency` | +1 |
| Bank | 4 | `banking` | +1 |
| Stock Exchange | 5 | `global-logistics` | +1 |
| **Hard cap** | | | **5** |

---

## System functions (all in `src/systems/trade-system.ts`)

### `resolveFromCity(state: GameState, caravanUnit: Unit): City | null`

**Exported.** Resolves the FROM city for a given caravan: the nearest owned city (by A* land-path length) that has remaining route capacity. Returns `null` if no eligible city exists (all cities at capacity or no land path to any owned city).

Tiebreaker: highest remaining capacity slots; secondary: highest current gold yield.

Used by both `canEstablishRoute` and `EstablishRoutePanel` so the FROM city is always the same value in both the UI and the mutation.

### `getRouteCapacity(state: GameState, cityId: string): number`

```
// Building IDs are as returned by the Claude design prompt — confirmed at implementation time.
// Expected: 'caravanserai', 'marketplace', 'bank', 'stock_exchange' (implementer must verify).
base = 1
+ (city.buildings includes 'caravanserai'  ? 1 : 0)
+ (city.buildings includes 'marketplace'   ? 1 : 0)
+ (city.buildings includes 'bank'          ? 1 : 0)
+ (city.buildings includes 'stock_exchange'? 1 : 0)
return Math.min(total, 5)
```

**Note:** The exact IDs for `bank` and `stock_exchange` are defined by the Claude design prompt in the New Buildings section. The implementer must use the IDs exactly as returned. This function must be updated to match.

"Remaining capacity" = `getRouteCapacity(state, cityId)` minus count of existing routes where `fromCityId === cityId`.

### `getCaravanTripBonus(state: GameState, fromCityId: string, toCityId: string, caravanOwner: string): number`

```
bonus = 0
+ (fromCity.buildings includes 'caravanserai' ? 2 : 0)
+ (toCity.buildings   includes 'caravanserai' ? 2 : 0)
+ (caravanOwner controls 'silk-road' wonder ? 3 : 0)   // forward-compatible placeholder:
                                                         // returns 0 until Silk Road wonder exists
return bonus
```

**Note on Caravanserai TO city bonus:** This reveals whether a foreign city has a Caravanserai (the trip count preview in the picker will differ). Foreign city buildings are visible on city select per existing conventions — this is acceptable.

**Note on Silk Road wonder:** If the wonder does not yet exist in the game, this clause always returns 0. The check is forward-compatible and harmless.

### `canEstablishRoute(state, caravanUnit, toCityId): { ok: boolean; reason?: string }`

Checks in order:

1. Caravan does not already have `committedToRouteId` set — else `{ ok: false, reason: 'Caravan is already committed to a route' }`
2. `toCity` exists
3. `fromCity = resolveFromCity(state, caravanUnit)` is not null — else `{ ok: false, reason: 'No city with available route capacity' }`
4. `toCity.id !== fromCity.id` — else `{ ok: false, reason: 'Cannot route a city to itself' }`
5. A land path exists: `findPath(fromCity.position, toCity.position, state.map, 'land') !== null` — else `{ ok: false, reason: 'Requires a Naval Trader to cross water' }`
6. If `toCity.owner !== caravanUnit.owner` (foreign): relationship ≥ 0 AND not at war — else `{ ok: false, reason: 'At war with Y' }` or `{ ok: false, reason: 'Relations too hostile (score: N)' }`
7. Returns `{ ok: true }`

### `establishRoute(state, caravanUnitId, toCityId): GameState`

Immutable (returns spread-copy). Steps:

1. Resolve `fromCity = resolveFromCity(state, caravanUnit)` (guard: if null, throw — caller should have called `canEstablishRoute` first)
2. Guard: if `state.marketplace` is undefined, initialise it with `createMarketplaceState()` (already exported from `trade-system.ts`) before proceeding
3. Compute `hexDist`: use `wrappedHexDistance(fromCity.position, toCity.position, map.width)` when `map.wrapsHorizontally`, else `hexDistance(fromCity.position, toCity.position)`
4. `turnsPerTrip = Math.ceil(hexDist / 3)`
5. `resourceDiversity = getCivAvailableResources(state, fromCiv.owner).size` (distinct resource count from `resource-acquisition-system.ts`; capped at 5 internally by `calculateTradeRouteGold`)
6. `goldPerTrip = calculateTradeRouteGold(hexDist, resourceDiversity) * turnsPerTrip`  
   *(effective gold/turn = `goldPerTrip / turnsPerTrip` ≈ `calculateTradeRouteGold(…)` — S6b fires full `goldPerTrip` on arrival)*
7. `tripsRemaining = 8 + getCaravanTripBonus(state, fromCityId, toCityId, caravanOwner)`
8. `foreignCivId = toCity.owner !== fromCity.owner ? toCity.owner : undefined`
9. `id = \`route-${state.idCounters.nextRouteId}\``; increment `state.idCounters.nextRouteId`
10. Push `{ id, fromCityId, toCityId, goldPerTrip, turnsPerTrip, foreignCivId }` to `marketplace.tradeRoutes`
11. Set `unit.committedToRouteId = route.id`, `unit.tripsRemaining = tripsRemaining`, zero out `movementPointsLeft`
12. Emit `trade:route-created` event (already defined in `types.ts`)
13. Return new `GameState`

**Actor-complete:** used by both the player path in `main.ts` and AI path in `basic-ai.ts`.

---

## Caravan unit — 6 mandatory wirings

### 1. `UNIT_DEFINITIONS` + `UNIT_DESCRIPTIONS` (`src/systems/unit-system.ts`)

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

```typescript
caravan: 'Trade unit. Establish a trade route to generate gold each turn. '
       + 'Once committed, cannot move or act until the route ends (8 round trips base). '
       + 'Cannot attack. Raidable by enemy units in transit.',
```

### 2. Unit-renderer fallback icon (`src/renderer/unit-visual-resolver.ts`)

```typescript
caravan: '🐪',
```

### 3. Turn-manager side-effects (`src/core/turn-manager.ts`)

No special state record. When the production queue completes a `'caravan'` item, the standard unit-creation path suffices — `committedToRouteId` starts `undefined`.

**Movement block enforcement:** In `src/main.ts`, at the movement intent handler (where a hex tap is resolved as a move for a selected unit), add a guard: if `unit.committedToRouteId` is set, suppress movement and show a notification *"Caravan is committed to a trade route and cannot move."* Also suppress movement highlights in `buildSelectedUnitHighlights` for committed caravans (return an empty highlight set).

**Auto-heal skip:** In `src/core/turn-manager.ts`, the auto-heal pass must skip units where `unit.committedToRouteId` is set. Committed caravans do not heal — they are stationary goods trains, not soldiers.

### 4. Death cleanup (`src/main.ts` + `src/core/turn-manager.ts`)

**Actor-complete.** Route cleanup must fire for ALL causes of caravan death, not just player-visible combat:

- **Player kills enemy caravan** (combat in `main.ts`): find route where `route.id === dyingUnit.committedToRouteId`; remove from `marketplace.tradeRoutes`; emit `trade:route-ended` event with `reason: 'unit-died'`.
- **AI turn / barbarian kills caravan** (combat resolved in `turn-manager.ts` or `basic-ai.ts`): same cleanup via a shared helper `removeRouteForUnit(state, unitId): GameState` called from all death paths.
- **Player disbands caravan** (`main.ts` disband handler): must show a confirmation dialog — *"Disbanding this Caravan will end your [City A] → [City B] trade route (-N gold/turn). Continue?"* — before removing the unit. On confirm: call `removeRouteForUnit`, then remove the unit. Emit `trade:route-ended` with `reason: 'unit-disbanded'`. This satisfies the "no silent destructive UI" rule.

`removeRouteForUnit(state: GameState, unitId: string): GameState` — shared helper in `src/systems/trade-system.ts`. Finds and removes the route where `caravanUnitId`… wait — routes don't store `caravanUnitId` in this design (the unit stores `committedToRouteId`). The helper looks up the unit, reads `unit.committedToRouteId`, then filters `marketplace.tradeRoutes` to remove the matching `id`. Returns new `GameState`.

### 5. AI usage (`src/ai/basic-ai.ts`)

Train a Caravan when:
- Civ has `trade-routes` tech
- Has a city with remaining route capacity
- Does not already have an uncommitted Caravan available

Establish a route when a committed-free Caravan exists:
- Domestic first (own city with highest gold yield)
- Foreign second (highest-relationship civ with a city reachable by land)

Use `canEstablishRoute` + `establishRoute` (same helpers as the player).

### 6. Tech-gated dequeue

`TRAINABLE_UNITS` entry includes `techRequired: 'trade-routes'`. Existing `getTrainableUnitsForCiv(completedTechs)` in `processCity` silently dequeues if the tech is absent. No new code needed.

### PRODUCTION_ICONS entry

```typescript
caravan: '🐪',
```

---

## Establish-route UX

### "Establish Route" button (`src/ui/selected-unit-info.ts`)

Shown on any selected Caravan unit owned by `state.currentPlayer` that does **not** already have `committedToRouteId` set.

- If `resolveFromCity(state, unit)` returns a city → button enabled, tapping opens `EstablishRoutePanel`
- If `resolveFromCity` returns `null` (all cities at capacity) → button rendered **disabled** with tooltip *"No cities with available route capacity — build a Caravanserai or Marketplace to add slots"*. Do not hide the button; show it greyed so the player understands the mechanic.

Use `createGameButton()` for both states.

### `EstablishRoutePanel` (`src/ui/establish-route-panel.ts`)

Mobile-first panel, full-width bottom sheet style. FROM city is resolved once at panel-open time via `resolveFromCity(state, caravan)` and displayed in the header.

**Layout:**
```
[ Trade Routes from Rome (Caravan) ]  [✕]
  Rome has 1/2 route slots available.

Domestic Routes
  ● Rome → Athens     +3 gold/turn · 8 trips
  ● Rome → Corinth    +2 gold/turn · 10 trips  ← caravanserai in Corinth

Foreign Routes
  ● Rome → Carthage   +6 gold/turn · 8 trips   🟢 Neutral
  ○ Rome → Persia     +7 gold/turn · 8 trips    🔴 At War
  ○ Rome → Egypt      +5 gold/turn · 8 trips    Requires Naval Trader

[ Confirm ]  [ Cancel ]
```

**Empty state** (no eligible destinations at all):
```
[ Trade Routes from Rome (Caravan) ]  [✕]
  No eligible destinations.
  Domestic: all own cities at capacity.
  Foreign: all reachable civs are at war or hostile.
[ Close ]
```

Rules:
- FROM city shown in header — always the city returned by `resolveFromCity`, not the caravan's current position tile name
- Eligible rows: selectable, show `+N gold/turn · N trips`
- Ineligible rows: greyed, show reason AND projected `+N gold/turn` (so the player can see what they'd earn if relations improved), not selectable
- Selecting a row previews the route (highlight the TO city on map if possible)
- "Confirm" only enabled when a row is selected; calls `establishRoute`; panel closes; selected-unit-info refreshes
- `textContent` / `createTextNode` only — no `innerHTML` with game strings
- All buttons via `createGameButton()`, min-height 44px

---

## Map rendering

In `src/renderer/hex-renderer.ts`, after drawing city dots and before drawing units:

- For each route in `state.marketplace.tradeRoutes` where `fromCity.owner === currentPlayer`:
  - Draw a **dashed line** from `fromCity` pixel centre to `toCity` pixel centre
  - Colour: owning civ's colour at 60% opacity
  - Dash: `[6, 4]`
  - Only draw if both tiles are within explored/visible area for `currentPlayer` (privacy rule)

---

## Marketplace panel update

The existing route list section in `src/ui/marketplace-panel.ts` (currently always empty) is populated. Routes are grouped by FROM city; each city header shows its capacity:

```
Active Trade Routes

  Rome  (2/3 slots)
    Rome → Cairo      +4 gold/turn · 6 trips remaining  🟢
    Rome → Athens     +2 gold/turn · 8 trips remaining

  Athens  (1/2 slots)
    Athens → Sparta   +3 gold/turn · 8 trips remaining
```

If the player has no routes yet:
```
Active Trade Routes
  No active routes. Train a Caravan to establish one.
```

Tapping a route entry selects the committed caravan unit on the map (if visible). Capacity numbers come from `getRouteCapacity(state, cityId)` and the current route count for that city.

---

## Income (turn-manager)

`processTradeRouteIncome` currently sums `route.goldPerTurn`. After this change, routes have `goldPerTrip` and `turnsPerTrip` instead. Add a helper:

```typescript
export function getEffectiveGoldPerTurn(route: TradeRoute): number {
  return Math.max(1, Math.round(route.goldPerTrip / route.turnsPerTrip));
}
```

`processTradeRouteIncome` uses `getEffectiveGoldPerTurn(route)` per route. S6b replaces this with trip-on-arrival logic — no further structural change needed.

---

## S6a / S6b forward compatibility

S5 lays the correct model. Future slices only add behaviour — no rework:

- **S6a (termination):** adds a turn-start pass that checks `route.foreignCivId` against `isAtWar` and relationship score; removes routes below threshold; emits notification. Uses existing `route.id` and `unit.committedToRouteId`.
- **S6b (physical travel):** sets `unit.routeDirection`, advances position one step per turn via `findPath`; income fires on arrival (replaces `getEffectiveGoldPerTurn`); decrements `unit.tripsRemaining`; removes unit + route when `tripsRemaining === 0`.
- **S7 (naval trader):** new `UnitType` with `domain: 'naval'`; `canEstablishRoute` passes `'naval'` to `findPath`; Dock/Harbor give trip bonuses instead of Caravanserai.

---

## Save compatibility checklist

- [ ] `TradeRoute` migration: assign `id` (`'route-legacy-N'`), default `goldPerTrip` from `(r as any).goldPerTurn ?? 2`, default `turnsPerTrip` to `3`. In practice old saves have empty `tradeRoutes` arrays (nothing ever pushed to them before S5) so this migration is a safety net only.
- [ ] `IdCounters` migration: `nextRouteId` defaults to `1` if missing
- [ ] `Unit`: all new fields optional — no migration needed
- [ ] New buildings: cities in old saves lack them; `routeCapacity` base of 1 applies — no migration needed
- [ ] `marketplace` itself may be `undefined` on very old saves — `establishRoute` guards against this (step 2); save-load should also initialise it on load if absent
- [ ] Add one load-old-save regression test verifying `tradeRoutes` array is present and `marketplace` is initialized

---

## Test coverage

| Test | File |
|---|---|
| `'caravan'` in `UnitType` union; `UNIT_DEFINITIONS` entry present | `tests/systems/unit-system.test.ts` |
| `UNIT_DESCRIPTIONS['caravan']` present | `tests/systems/unit-system.test.ts` |
| `PRODUCTION_ICONS['caravan']` present | `tests/systems/city-system.test.ts` |
| Caravan trains with `trade-routes` tech; absent without | `tests/systems/city-system.test.ts` |
| `getRouteCapacity`: base=1; +1 per building; cap=5 | `tests/systems/trade-system.test.ts` |
| `getCaravanTripBonus`: +2 FROM caravanserai; +2 TO caravanserai; +3 Silk Road | `tests/systems/trade-system.test.ts` |
| `canEstablishRoute` domestic: ok when capacity available | `tests/systems/trade-system.test.ts` |
| `canEstablishRoute` domestic: blocked when FROM city at capacity | `tests/systems/trade-system.test.ts` |
| `canEstablishRoute` foreign: ok at relationship ≥ 0, not at war | `tests/systems/trade-system.test.ts` |
| `canEstablishRoute` foreign: blocked at war | `tests/systems/trade-system.test.ts` |
| `canEstablishRoute` foreign: blocked at relationship < 0 | `tests/systems/trade-system.test.ts` |
| `canEstablishRoute`: water-crossing excluded (findPath returns null) | `tests/systems/trade-system.test.ts` |
| `establishRoute`: sets `committedToRouteId` + `tripsRemaining` on unit | `tests/systems/trade-system.test.ts` |
| `establishRoute`: pushes route to `marketplace.tradeRoutes` | `tests/systems/trade-system.test.ts` |
| `establishRoute`: emits `trade:route-created` exactly once | `tests/systems/trade-system.test.ts` |
| `establishRoute`: sets `foreignCivId` when TO city is foreign | `tests/systems/trade-system.test.ts` |
| `establishRoute`: does NOT set `foreignCivId` when TO city is domestic | `tests/systems/trade-system.test.ts` |
| `establishRoute`: initialises `marketplace` if undefined on state | `tests/systems/trade-system.test.ts` |
| `canEstablishRoute`: blocked when caravan already has `committedToRouteId` | `tests/systems/trade-system.test.ts` |
| `canEstablishRoute`: blocked when FROM city === TO city (self-route) | `tests/systems/trade-system.test.ts` |
| `canEstablishRoute`: blocked when `resolveFromCity` returns null (all cities at capacity) | `tests/systems/trade-system.test.ts` |
| `resolveFromCity`: returns nearest city with capacity; returns null when all at cap | `tests/systems/trade-system.test.ts` |
| `getEffectiveGoldPerTurn`: rounds correctly, min 1 | `tests/systems/trade-system.test.ts` |
| Route income credited to FROM city owner each turn | `tests/core/turn-manager.test.ts` |
| Committed caravan skipped by auto-heal pass | `tests/core/turn-manager.test.ts` |
| Committed caravan cannot move (movement block) | `tests/main/unit-movement.test.ts` (or integration) |
| Uncommitted caravan CAN move normally | `tests/main/unit-movement.test.ts` |
| Player-side caravan death removes route (`removeRouteForUnit`) | `tests/systems/trade-system.test.ts` |
| AI-side caravan death also removes route (actor-complete) | `tests/core/turn-manager.test.ts` |
| AI establishes domestic route when conditions met (parity) | `tests/ai/basic-ai.test.ts` |
| Old save with `goldPerTurn` route migrates without error | `tests/storage/save-migration.test.ts` |
| Old save missing `nextRouteId` on `idCounters` defaults to 1 | `tests/storage/save-migration.test.ts` |

---

## Out of scope (S6+ work)

- Physical caravan movement on the map (S6b)
- Route termination on war / hostile relations (S6a)
- Trip countdown / caravan consumption (S6b)
- Naval trader unit (S7)
- Trade tiers / upgrades (S7)
- Sell/buy/barter transactions (S8–S10)
