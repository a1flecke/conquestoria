# S5 — First Trade Unit + Establish a Route

**Slice:** Phase 3 of the Marketplace & Trade Roadmap  
**Depends on:** S4b (strategic resource prerequisites — merged PR #256)  
**Roadmap:** `docs/superpowers/specs/2026-05-20-marketplace-trade-roadmap.md`  
**Status:** Design approved, awaiting implementation

---

## Goal

Make the dead `trade-routes` tech unlock real. A player who researches `trade-routes` (era 4) can train a **Caravan** unit, move it toward a destination city, and establish a trade route that pays gold every turn. Domestic routes work unconditionally; foreign routes require a neutral-or-better relationship and no active war. Route capacity is capped per city and scales with economy buildings. The caravan is committed to the route and will be consumed after a fixed number of round trips (implemented as a counter; physical travel arrives in S6b).

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

### No new `MarketplaceState` fields

`getRouteCapacity` and `getCaravanTripBonus` are **pure computed functions** — they derive from existing building lists. No new stored state.

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

### `getRouteCapacity(state: GameState, cityId: string): number`

```
base = 1
+ (city.buildings includes 'caravanserai' ? 1 : 0)
+ (city.buildings includes 'marketplace'  ? 1 : 0)
+ (city.buildings includes 'bank'         ? 1 : 0)
+ (city.buildings includes 'stockExchange'? 1 : 0)
return Math.min(total, 5)
```

"Remaining capacity" = `getRouteCapacity(state, cityId)` minus count of existing routes where `fromCityId === cityId`.

### `getCaravanTripBonus(state: GameState, fromCityId: string, toCityId: string, caravanOwner: string): number`

```
bonus = 0
+ (fromCity.buildings includes 'caravanserai' ? 2 : 0)
+ (toCity.buildings   includes 'caravanserai' ? 2 : 0)
+ (caravanOwner controls Silk Road wonder ? 3 : 0)
return bonus
```

### `canEstablishRoute(state, caravanUnit, toCityId): { ok: boolean; reason?: string }`

Checks in order:

1. `toCity` exists
2. A land path exists: `findPath(fromCity.position, toCity.position, state.map, 'land') !== null` — else `{ ok: false, reason: 'Requires a Naval Trader to cross water' }`
3. FROM city has remaining capacity — else `{ ok: false, reason: 'City of X is at capacity (N/N routes)' }`
4. If `toCity.owner !== caravanUnit.owner` (foreign): relationship ≥ 0 AND not at war — else `{ ok: false, reason: 'At war with Y' }` or `{ ok: false, reason: 'Relations too hostile (score: N)' }`
5. Returns `{ ok: true }`

FROM city = owned city nearest to the caravan's current position with remaining capacity (A* distance, `'land'` domain). Tiebreaker: highest `getRouteCapacity` remaining slots; secondary tiebreaker: city with higher current gold yield.

### `establishRoute(state, caravanUnitId, toCityId): GameState`

Immutable (returns spread-copy). Steps:

1. Resolve FROM city via nearest-eligible logic above
2. Compute `hexDist = hexDistance(fromCity.position, toCity.position)` (wrapped if `map.wrapsHorizontally`)
3. `turnsPerTrip = Math.ceil(hexDist / 3)`
4. `resourceDiversity = getCivAvailableResources(state, fromCiv).size` (count of distinct resource types the FROM civ currently owns — from `resource-acquisition-system.ts`, capped at 5 by `calculateTradeRouteGold` internally)
5. `goldPerTrip = calculateTradeRouteGold(hexDist, resourceDiversity) * turnsPerTrip`  
   *(so effective gold/turn ≈ `calculateTradeRouteGold(hexDist, resourceDiversity)` — consistent with current formula)*
6. `tripsRemaining = 8 + getCaravanTripBonus(state, fromCityId, toCityId, caravanOwner)`
7. `id = \`route-${state.idCounters.nextRouteId}\``; increment `state.idCounters.nextRouteId`
8. Push route to `marketplace.tradeRoutes`
9. Set `unit.committedToRouteId = route.id`, `unit.tripsRemaining = tripsRemaining`, zero out `movementPointsLeft`
10. Emit `trade:route-created` event (already defined in `types.ts`)
11. Return new `GameState`

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
caravan: 'Trade unit. Move toward a destination city and establish a trade route. '
       + 'Committed to the route until consumed (8 round trips base). '
       + 'Cannot attack or be healed. Raidable by enemy units.',
```

### 2. Unit-renderer fallback icon (`src/renderer/unit-visual-resolver.ts`)

```typescript
caravan: '🐪',
```

### 3. Turn-manager side-effects (`src/core/turn-manager.ts`)

No special state record. When the production queue completes a `'caravan'` item, the standard unit-creation path suffices — `committedToRouteId` starts `undefined`.

### 4. Death cleanup (`src/main.ts`)

When a caravan unit dies (any cause): find route where `route.id === unit.committedToRouteId`, remove it from `state.marketplace.tradeRoutes`, emit `trade:route-ended` notification.

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

Tapping opens `EstablishRoutePanel`.

### `EstablishRoutePanel` (`src/ui/establish-route-panel.ts`)

Mobile-first panel, full-width bottom sheet style.

**Layout:**
```
[ Establish Trade Route — Caravan ]  [✕]

Domestic Routes
  ● Athens → Sparta    +3 gold/turn · 8 trips
  ● Athens → Corinth   +2 gold/turn · 10 trips  ← Caravanserai bonus

Foreign Routes
  ● Athens → Carthage  +6 gold/turn · 8 trips   🟢 Neutral
  ○ Athens → Persia    +7 gold/turn              🔴 At War
  ○ Athens → Egypt     +5 gold/turn              Requires Naval Trader

[ Confirm ]  [ Cancel ]
```

Rules:
- Eligible rows: selectable, show gold/turn + trip count
- Ineligible rows: greyed, show reason, not selectable
- Selecting a row previews the route (highlight the TO city on map if possible)
- "Confirm" calls `establishRoute`; panel closes; selected-unit-info refreshes
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

The existing route list section in `src/ui/marketplace-panel.ts` (currently always empty) is populated:

```
Active Trade Routes (2/3 slots used in Rome)
  Rome → Cairo      +4 gold/turn · 6 trips remaining  🟢
  Rome → Athens     +2 gold/turn · 8 trips remaining
```

Tapping a route entry selects the committed caravan unit on the map (if visible).

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

- [ ] `TradeRoute` migration: assign `id`, default `goldPerTrip`/`turnsPerTrip` from old `goldPerTurn` field
- [ ] `Unit`: all new fields optional — no migration needed
- [ ] New buildings: cities in old saves lack them; `routeCapacity` defaults to 1 (base) — no migration needed
- [ ] `marketplace.tradeRoutes` existing empty array unchanged
- [ ] Add one load-old-save regression test

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
| `getEffectiveGoldPerTurn`: rounds correctly, min 1 | `tests/systems/trade-system.test.ts` |
| Route income credited to FROM city owner each turn | `tests/core/turn-manager.test.ts` |
| Caravan death removes route from `marketplace.tradeRoutes` | `tests/core/turn-manager.test.ts` |
| AI establishes domestic route when conditions met (parity) | `tests/ai/basic-ai.test.ts` |
| Old save with `goldPerTurn` route migrates without error | `tests/storage/save-migration.test.ts` |

---

## Out of scope (S6+ work)

- Physical caravan movement on the map (S6b)
- Route termination on war / hostile relations (S6a)
- Trip countdown / caravan consumption (S6b)
- Naval trader unit (S7)
- Trade tiers / upgrades (S7)
- Sell/buy/barter transactions (S8–S10)
