# Cost Dynamics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Do not use subagents for this work.

**Goal:** Add generous, kid-friendly unit/building maintenance and active-item rush-buying without making normal early play feel punished.

**Architecture:** Add a single economy resolver that owns maintenance, projected economy, resolved economy status, strain, and rush-buy quotes. Refactor production completion into a shared helper so normal turn production and rush-buy use the same building/unit side effects. UI reads economy projections and quotes; it does not reimplement maintenance math.

**Tech Stack:** TypeScript, Vite, Vitest, DOM tests with JSDOM, Canvas game shell.

---

## Spec And Rule Inputs

- Spec: `docs/superpowers/specs/2026-05-16-cost-dynamics-design.md`
- Repo rules to read before editing:
  - `.claude/rules/game-systems.md` for `src/core/**` and `src/systems/**`
  - `.claude/rules/strategy-game-mechanics.md` for `src/core/**` and `src/systems/**`
  - `.claude/rules/end-to-end-wiring.md` for `src/**`
  - `.claude/rules/ui-panels.md` for `src/ui/**` and `src/main.ts`
  - `docs/superpowers/plans/README.md` for city panel and queue/rush-buy UI guardrails

## File Structure

- Create `src/systems/economy-system.ts`
  - Owns maintenance policy, city building upkeep, civ unit upkeep, economy projection, resolved economy application, rush-buy quotes, and rush-buy execution.
- Modify `src/core/types.ts`
  - Adds serializable economy status types, `GameState.economyStatusByCiv`, and economy notification events.
- Modify `src/systems/city-system.ts`
  - Extracts production completion into `completeCityProductionItem`.
  - Keeps `processCity` behavior unchanged by calling the helper.
- Modify `src/core/turn-manager.ts`
  - Uses economy resolver to apply net gold with a zero floor.
  - Stores last resolved economy status.
  - Emits treasury strain notifications.
  - Uses shared production completion for city production where needed.
- Modify `src/systems/faction-system.ts`
  - Adds Era 3+ unrest pressure from last resolved critical treasury strain.
- Modify `src/ui/city-panel.ts`
  - Shows maintenance summary and future upkeep.
  - Shows active-item rush-buy quote and disabled reasons.
  - Calls `onRushBuyActiveProduction`.
- Modify `src/main.ts`
  - HUD shows projected net gold.
  - City panel callback executes rush-buy and updates state/HUD/render loop.
- Modify `src/ui/notification-routing.ts`
  - Routes economy strain events to one civilization-level warning per turn.
- Test files:
  - Create `tests/systems/economy-system.test.ts`
  - Modify `tests/systems/faction-system.test.ts`
  - Create `tests/systems/rush-buy-system.test.ts`
  - Modify `tests/ui/city-panel.test.ts`
  - Create `tests/ui/hud-economy.test.ts`

## Player Truth Table

| Before | Action | Internal change | Immediate visible result | Still reachable |
|---|---|---|---|---|
| HUD shows `Gold 40 (+6)` from gross income | Add enough optional buildings to create upkeep | Projected economy recomputes net | HUD shows `Gold 40 (+2 net)` and compact strain only if unpaid maintenance exists | City panel breakdown |
| City panel has no active production | View production block | Rush-buy quote returns `no-active-production` | No buy button or disabled text `No active production to buy` | Build list remains reachable |
| City panel active `Workshop`, enough gold, no high strain | Click `Buy now: 10 gold` | Gold decreases, workshop completes, queue shifts | Panel rerenders: workshop appears in Buildings, new active item appears or no active production | Build list, queue controls |
| City panel active `Warrior`, enough gold, no high strain | Click `Buy now: X gold` | Gold decreases, unit is created through shared completion path | Panel rerenders, gold/HUD updates, queue shifts | Unit remains selectable through normal game surfaces |
| Active production is `legendary:pyramids` | View production block | Rush-buy quote returns `wonder-blocked` | Disabled reason says wonders cannot be bought | Legendary Wonders tab remains reachable |
| Projected strain is `high` | View active production | Rush-buy quote returns `treasury-strain` | Disabled reason says treasury strain is too high | Remove queue, delete units, end turn, normal production |
| Player deletes units or gains gold after high strain projection | Reopen or rerender city panel | Projection recalculates | Buy button becomes available if strain drops and gold is enough | All build options |

## Misleading UI Risks

- `Free support` is misleading if exempt buildings consume support. Exempt rows must say `0 upkeep` and not count against support used.
- `Two defenders per city free` is misleading if units must stand in cities. Defender slots are empire support capacity; tests must prove position does not matter.
- `Net gold` is misleading if it omits maintenance. HUD projection must include building upkeep and unit upkeep.
- `Treasury strain` is misleading if reserves can still pay the bill. Strain starts only when `unpaidMaintenance > 0`.
- `Buy now` is misleading if it can buy wonders, follow-up queue items, or stale DOM rows. Rush-buy applies only to the active item and rerenders after every click.

## Interaction Replay Checklist

- Add first production item, see active item and buy quote.
- Add second production item, see active item plus queue row and ETA.
- Rush-buy active item, see queue shift and quote recalculate for the next item.
- Remove queued follow-up after a rush-buy, see ETA/order update.
- Repeat-click old buy button must not buy twice from stale DOM because panel rerenders.
- Reopen city panel after rush-buy and see completed building/unit outcome reflected.

## Queue And ETA Checklist

- Active item remains in the current production block.
- Follow-up queue remains in the existing `Production Queue` block.
- Rush-buy only targets the active item.
- ETA text must recalculate after buy, reorder, and remove.
- If an active item becomes invalid through existing tech/legendary rules, normal queue filtering still owns invalidation; rush-buy should quote `invalid-active-item` for unknown ids.

---

### Task 1: Economy Types And Resolver

**Files:**
- Modify: `src/core/types.ts`
- Create: `src/systems/economy-system.ts`
- Create: `tests/systems/economy-system.test.ts`

- [ ] **Step 1: Read rules before editing**

Run:

```bash
sed -n '1,220p' .claude/rules/game-systems.md
sed -n '1,220p' .claude/rules/strategy-game-mechanics.md
sed -n '1,220p' .claude/rules/end-to-end-wiring.md
```

Expected: rules are visible in terminal; keep mutations in system helpers and keep UI wired to computed data.

- [ ] **Step 2: Write failing tests for maintenance and strain**

Create `tests/systems/economy-system.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { City, GameState, HexCoord, Unit, UnitType } from '@/core/types';
import {
  calculateCityBuildingMaintenance,
  calculateCivEconomy,
  calculateCivUnitMaintenance,
  getRushBuyQuote,
  projectCivEconomy,
} from '@/systems/economy-system';
import { createDiplomacyState } from '@/systems/diplomacy-system';

function city(id: string, overrides: Partial<City> = {}): City {
  return {
    id,
    name: id,
    owner: 'player',
    position: { q: 0, r: 0 },
    population: 2,
    food: 0,
    foodNeeded: 20,
    buildings: [],
    productionQueue: [],
    productionProgress: 0,
    ownedTiles: [],
    workedTiles: [],
    focus: 'balanced',
    maturity: 'outpost',
    grid: [[null]],
    gridSize: 3,
    unrestLevel: 0,
    unrestTurns: 0,
    spyUnrestBonus: 0,
    idleProduction: null,
    ...overrides,
  };
}

function unit(id: string, type: UnitType, position: HexCoord = { q: 0, r: 0 }): Unit {
  return {
    id,
    type,
    owner: 'player',
    position,
    movementPointsLeft: 2,
    health: 100,
    experience: 0,
    hasMoved: false,
    hasActed: false,
    isResting: false,
  };
}

function state(overrides: Partial<GameState> = {}): GameState {
  const c = city('city-1');
  return {
    turn: 12,
    era: 2,
    currentPlayer: 'player',
    gameOver: false,
    winner: null,
    map: { width: 10, height: 10, tiles: {}, wrapsHorizontally: false, rivers: [] },
    units: {},
    cities: { [c.id]: c },
    civilizations: {
      player: {
        id: 'player',
        name: 'Player',
        color: '#4a90d9',
        isHuman: true,
        civType: 'egypt',
        cities: [c.id],
        units: [],
        techState: { completed: [], currentResearch: null, researchProgress: 0, researchQueue: [], trackPriorities: {} as any },
        gold: 0,
        visibility: { tiles: {} },
        score: 0,
        diplomacy: createDiplomacyState(['player'], 'player'),
      },
    },
    barbarianCamps: {},
    minorCivs: {},
    tutorial: { active: false, currentStep: 'complete', completedSteps: [] },
    settings: {
      mapSize: 'small',
      soundEnabled: false,
      musicEnabled: false,
      musicVolume: 0,
      sfxVolume: 0,
      tutorialEnabled: false,
      advisorsEnabled: {} as any,
      councilTalkLevel: 'normal',
    },
    tribalVillages: {},
    discoveredWonders: {},
    wonderDiscoverers: {},
    embargoes: [],
    defensiveLeagues: [],
    ...overrides,
  } as GameState;
}

describe('economy-system', () => {
  it('keeps likely-needed buildings free and charges optional excess deterministically', () => {
    const s = state();
    s.cities['city-1'].population = 1;
    s.cities['city-1'].buildings = [
      'herbalist',
      'workshop',
      'shrine',
      'barracks',
      'library',
      'granary',
      'marketplace',
      'harbor',
      'forge',
      'observatory',
      'security-bureau',
    ];

    const result = calculateCityBuildingMaintenance(s, 'city-1');

    expect(result.freeSupport).toBe(4);
    expect(result.exemptBuildings.map(row => row.id)).toEqual([
      'herbalist',
      'workshop',
      'shrine',
      'barracks',
      'library',
      'granary',
    ]);
    expect(result.supportedBuildings.map(row => row.id)).toEqual([
      'marketplace',
      'forge',
      'harbor',
      'observatory',
    ]);
    expect(result.paidBuildings.map(row => row.id)).toEqual(['security-bureau']);
    expect(result.upkeep).toBe(2);
  });

  it('grants two free combat defenders per city without requiring city position', () => {
    const s = state();
    s.cities['city-1'].population = 1;
    s.units = {
      settler: unit('settler', 'settler', { q: 5, r: 5 }),
      worker: unit('worker', 'worker', { q: 5, r: 6 }),
      scout: unit('scout', 'scout', { q: 6, r: 6 }),
      warrior1: unit('warrior1', 'warrior', { q: 9, r: 9 }),
      warrior2: unit('warrior2', 'warrior', { q: 8, r: 8 }),
      archer: unit('archer', 'archer', { q: 7, r: 7 }),
      swordsman: unit('swordsman', 'swordsman', { q: 6, r: 7 }),
    };
    s.civilizations.player.units = Object.keys(s.units);

    const result = calculateCivUnitMaintenance(s, 'player');

    expect(result.exemptUnits.map(row => row.id)).toEqual(['scout', 'settler', 'worker']);
    expect(result.freeDefenderUnits.map(row => row.id)).toEqual(['warrior1', 'warrior2']);
    expect(result.freeSupport).toBe(4);
    expect(result.upkeep).toBe(0);
  });

  it('charges excess armies after exemptions and generous support are exhausted', () => {
    const s = state();
    const units = Array.from({ length: 10 }, (_, index) => unit(`warrior-${index}`, 'warrior', { q: index, r: 0 }));
    s.units = Object.fromEntries(units.map(u => [u.id, u]));
    s.civilizations.player.units = units.map(u => u.id);

    const result = calculateCivUnitMaintenance(s, 'player');

    expect(result.freeDefenderUnits).toHaveLength(2);
    expect(result.supportedUnits).toHaveLength(4);
    expect(result.paidUnits).toHaveLength(4);
    expect(result.upkeep).toBe(4);
  });

  it('uses reserves before creating treasury strain', () => {
    const s = state();
    s.civilizations.player.gold = 20;

    const result = calculateCivEconomy(s, 'player', 0, { buildingMaintenance: 12, unitMaintenance: 3 });

    expect(result.totalMaintenance).toBe(15);
    expect(result.netGoldPerTurn).toBe(-15);
    expect(result.endingGold).toBe(5);
    expect(result.unpaidMaintenance).toBe(0);
    expect(result.strainLevel).toBe('none');
  });

  it('classifies unpaid maintenance into low high and critical strain', () => {
    const s = state();

    expect(calculateCivEconomy(s, 'player', 0, { buildingMaintenance: 2, unitMaintenance: 0 }).strainLevel).toBe('low');
    expect(calculateCivEconomy(s, 'player', 0, { buildingMaintenance: 5, unitMaintenance: 0 }).strainLevel).toBe('high');
    expect(calculateCivEconomy(s, 'player', 0, { buildingMaintenance: 10, unitMaintenance: 0 }).strainLevel).toBe('critical');
  });

  it('projects current economy for HUD and rush-buy without mutating state', () => {
    const s = state();
    s.cities['city-1'].buildings = ['marketplace'];
    s.civilizations.player.gold = 30;

    const projected = projectCivEconomy(s, 'player');

    expect(projected.grossGoldIncome).toBeGreaterThanOrEqual(0);
    expect(s.civilizations.player.gold).toBe(30);
  });

  it('quotes only active normal production and blocks legendary wonders', () => {
    const s = state();
    s.civilizations.player.gold = 100;
    s.cities['city-1'].productionQueue = ['workshop'];
    s.cities['city-1'].productionProgress = 2;

    expect(getRushBuyQuote(s, 'player', 'city-1')).toMatchObject({
      available: true,
      itemId: 'workshop',
      cost: 25,
    });

    s.cities['city-1'].productionQueue = ['legendary:pyramids'];
    expect(getRushBuyQuote(s, 'player', 'city-1')).toMatchObject({
      available: false,
      reason: 'wonders-cannot-be-bought',
    });
  });
});
```

- [ ] **Step 3: Run the failing economy tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/economy-system.test.ts
```

Expected: FAIL because `@/systems/economy-system` does not exist.

- [ ] **Step 4: Add economy types**

In `src/core/types.ts`, add near the civilization section:

```ts
export type TreasuryStrainLevel = 'none' | 'low' | 'high' | 'critical';

export interface EconomyStatus {
  turn: number;
  grossGoldIncome: number;
  buildingMaintenance: number;
  unitMaintenance: number;
  netGoldPerTurn: number;
  unpaidMaintenance: number;
  strainLevel: TreasuryStrainLevel;
}
```

In `GameState`, add:

```ts
  economyStatusByCiv?: Record<string, EconomyStatus>;
```

In `GameEvents`, add:

```ts
  'economy:treasury-strain': { civId: string; level: Exclude<TreasuryStrainLevel, 'none'>; netGoldPerTurn: number; unpaidMaintenance: number };
```

- [ ] **Step 5: Create the economy resolver**

Create `src/systems/economy-system.ts`:

```ts
import type { City, EconomyStatus, GameState, TreasuryStrainLevel, Unit, UnitType } from '@/core/types';
import type { EventBus } from '@/core/event-bus';
import { BUILDINGS, getProductionCostForItem, TRAINABLE_UNITS } from '@/systems/city-system';
import { calculateProjectedCityYields } from '@/systems/city-work-system';
import { resolveCivDefinition } from '@/systems/civ-registry';
import { UNIT_DEFINITIONS } from '@/systems/unit-system';
import { getLegendaryWonderCityYieldBonus, getLegendaryWonderCivYieldBonus } from '@/systems/legendary-wonder-system';
import { processTradeRouteIncome } from '@/systems/trade-system';

export type RushBuyDisabledReason =
  | 'no-active-production'
  | 'invalid-active-item'
  | 'not-owner'
  | 'not-enough-gold'
  | 'treasury-strain-too-high'
  | 'wonders-cannot-be-bought';

export interface MaintenanceRow {
  id: string;
  label: string;
  upkeep: number;
  reason: 'exempt' | 'free-support' | 'paid';
}

export interface CityBuildingMaintenance {
  cityId: string;
  freeSupport: number;
  supportUsed: number;
  upkeep: number;
  exemptBuildings: MaintenanceRow[];
  supportedBuildings: MaintenanceRow[];
  paidBuildings: MaintenanceRow[];
  rows: MaintenanceRow[];
}

export interface CivUnitMaintenance {
  civId: string;
  freeSupport: number;
  supportUsed: number;
  defenderSlots: number;
  defenderSlotsUsed: number;
  upkeep: number;
  exemptUnits: MaintenanceRow[];
  freeDefenderUnits: MaintenanceRow[];
  supportedUnits: MaintenanceRow[];
  paidUnits: MaintenanceRow[];
  rows: MaintenanceRow[];
}

export interface CivEconomyResult extends EconomyStatus {
  civId: string;
  startingGold: number;
  endingGold: number;
  totalMaintenance: number;
  buildingBreakdown: CityBuildingMaintenance[];
  unitBreakdown: CivUnitMaintenance;
  rushBuyBlockedByStrain: boolean;
}

export interface RushBuyQuote {
  available: boolean;
  reason?: RushBuyDisabledReason;
  itemId?: string;
  label?: string;
  cost?: number;
  remainingProduction?: number;
}

const CORE_FREE_BUILDINGS = new Set(['city-center', 'herbalist', 'workshop', 'shrine', 'barracks', 'library', 'granary']);
const FREE_UNIT_TYPES = new Set<UnitType>(['settler', 'worker', 'scout']);
const ADVANCED_UNIT_TYPES = new Set<UnitType>([
  'swordsman', 'pikeman', 'musketeer', 'galley', 'trireme',
  'spy_scout', 'spy_informant', 'spy_agent', 'spy_operative', 'spy_hacker',
  'scout_hound', 'shadow_warden', 'war_hound',
]);
const ADVANCED_BUILDINGS = new Set(['forge', 'observatory', 'harbor', 'amphitheater', 'security-bureau']);
const MATURITY_SUPPORT: Record<City['maturity'], number> = {
  outpost: 0,
  village: 1,
  town: 2,
  city: 3,
  metropolis: 4,
};
export const ECONOMY_UNREST_PRESSURE = 12;

function buildingLabel(id: string): string {
  return BUILDINGS[id]?.name ?? id;
}

function unitLabel(unit: Unit): string {
  return UNIT_DEFINITIONS[unit.type]?.name ?? unit.type;
}

function buildingUpkeep(id: string): number {
  if (CORE_FREE_BUILDINGS.has(id)) return 0;
  if (ADVANCED_BUILDINGS.has(id)) return 2;
  return BUILDINGS[id] ? 1 : 0;
}

function unitUpkeep(type: UnitType): number {
  if (FREE_UNIT_TYPES.has(type)) return 0;
  if (ADVANCED_UNIT_TYPES.has(type)) return 2;
  return 1;
}

function buildingPriority(id: string): number {
  if (CORE_FREE_BUILDINGS.has(id)) return 0;
  const building = BUILDINGS[id];
  if (building?.pacing?.band === 'starter') return 1;
  if (building?.category === 'economy' || building?.category === 'food' || building?.category === 'production') return 2;
  return 3;
}

function unitPriority(type: UnitType): number {
  if (type === 'warrior' || type === 'archer') return 0;
  if (type === 'swordsman' || type === 'pikeman' || type === 'musketeer') return 1;
  if (type === 'war_hound') return 2;
  return 3;
}

function strainLevel(unpaidMaintenance: number, totalMaintenance: number): TreasuryStrainLevel {
  if (unpaidMaintenance <= 0) return 'none';
  const ratio = unpaidMaintenance / Math.max(1, totalMaintenance);
  if (unpaidMaintenance >= 10 || ratio >= 0.5) return 'critical';
  if (unpaidMaintenance >= 5 || ratio >= 0.25) return 'high';
  return 'low';
}

export function calculateCityBuildingMaintenance(state: GameState, cityId: string): CityBuildingMaintenance {
  const city = state.cities[cityId];
  if (!city) {
    return { cityId, freeSupport: 0, supportUsed: 0, upkeep: 0, exemptBuildings: [], supportedBuildings: [], paidBuildings: [], rows: [] };
  }

  const freeSupport = 4 + Math.floor(city.population / 2) + (MATURITY_SUPPORT[city.maturity] ?? 0);
  const exemptBuildings: MaintenanceRow[] = [];
  const candidates = city.buildings
    .filter(id => BUILDINGS[id])
    .map(id => ({ id, label: buildingLabel(id), upkeep: buildingUpkeep(id), reason: 'paid' as const }));

  const paidCandidates: MaintenanceRow[] = [];
  for (const row of candidates) {
    if (CORE_FREE_BUILDINGS.has(row.id) || row.upkeep === 0) {
      exemptBuildings.push({ ...row, upkeep: 0, reason: 'exempt' });
    } else {
      paidCandidates.push(row);
    }
  }

  paidCandidates.sort((left, right) =>
    buildingPriority(left.id) - buildingPriority(right.id)
    || left.upkeep - right.upkeep
    || left.id.localeCompare(right.id),
  );

  const supportedBuildings = paidCandidates.slice(0, freeSupport).map(row => ({ ...row, upkeep: 0, reason: 'free-support' as const }));
  const paidBuildings = paidCandidates.slice(freeSupport).map(row => ({ ...row, reason: 'paid' as const }));
  const upkeep = paidBuildings.reduce((sum, row) => sum + row.upkeep, 0);
  const rows = [...exemptBuildings, ...supportedBuildings, ...paidBuildings];

  return {
    cityId,
    freeSupport,
    supportUsed: supportedBuildings.length,
    upkeep,
    exemptBuildings,
    supportedBuildings,
    paidBuildings,
    rows,
  };
}

function isCombatCapable(unit: Unit): boolean {
  return (UNIT_DEFINITIONS[unit.type]?.strength ?? 0) > 0;
}

export function calculateCivUnitMaintenance(state: GameState, civId: string): CivUnitMaintenance {
  const civ = state.civilizations[civId];
  if (!civ) {
    return { civId, freeSupport: 0, supportUsed: 0, defenderSlots: 0, defenderSlotsUsed: 0, upkeep: 0, exemptUnits: [], freeDefenderUnits: [], supportedUnits: [], paidUnits: [], rows: [] };
  }

  const units = civ.units.map(id => state.units[id]).filter((u): u is Unit => Boolean(u));
  const exemptUnits: MaintenanceRow[] = [];
  const candidates: Unit[] = [];
  for (const u of units) {
    if (FREE_UNIT_TYPES.has(u.type)) {
      exemptUnits.push({ id: u.id, label: unitLabel(u), upkeep: 0, reason: 'exempt' });
    } else {
      candidates.push(u);
    }
  }

  const defenderSlots = civ.cities.length * 2;
  const combat = candidates
    .filter(isCombatCapable)
    .sort((left, right) =>
      unitPriority(left.type) - unitPriority(right.type)
      || unitUpkeep(left.type) - unitUpkeep(right.type)
      || left.id.localeCompare(right.id),
    );
  const defenderIds = new Set(combat.slice(0, defenderSlots).map(u => u.id));
  const freeDefenderUnits = combat
    .filter(u => defenderIds.has(u.id))
    .map(u => ({ id: u.id, label: unitLabel(u), upkeep: 0, reason: 'free-support' as const }));

  const totalPopulation = civ.cities.reduce((sum, id) => sum + (state.cities[id]?.population ?? 0), 0);
  const freeSupport = 2 + civ.cities.length * 2 + Math.floor(totalPopulation / 3);
  const remaining = candidates
    .filter(u => !defenderIds.has(u.id))
    .map(u => ({ id: u.id, label: unitLabel(u), upkeep: unitUpkeep(u.type), reason: 'paid' as const, type: u.type }))
    .sort((left, right) =>
      unitPriority(left.type) - unitPriority(right.type)
      || left.upkeep - right.upkeep
      || left.id.localeCompare(right.id),
    );

  const supportedUnits = remaining.slice(0, freeSupport).map(({ type: _type, ...row }) => ({ ...row, upkeep: 0, reason: 'free-support' as const }));
  const paidUnits = remaining.slice(freeSupport).map(({ type: _type, ...row }) => ({ ...row, reason: 'paid' as const }));
  const upkeep = paidUnits.reduce((sum, row) => sum + row.upkeep, 0);
  const rows = [...exemptUnits, ...freeDefenderUnits, ...supportedUnits, ...paidUnits];

  return {
    civId,
    freeSupport,
    supportUsed: supportedUnits.length,
    defenderSlots,
    defenderSlotsUsed: freeDefenderUnits.length,
    upkeep,
    exemptUnits,
    freeDefenderUnits,
    supportedUnits,
    paidUnits,
    rows,
  };
}

export function calculateCivEconomy(
  state: GameState,
  civId: string,
  grossGoldIncome: number,
  overrideMaintenance?: { buildingMaintenance: number; unitMaintenance: number },
): CivEconomyResult {
  const civ = state.civilizations[civId];
  const buildingBreakdown = civ
    ? civ.cities.map(cityId => calculateCityBuildingMaintenance(state, cityId))
    : [];
  const unitBreakdown = calculateCivUnitMaintenance(state, civId);
  const buildingMaintenance = overrideMaintenance?.buildingMaintenance ?? buildingBreakdown.reduce((sum, row) => sum + row.upkeep, 0);
  const unitMaintenance = overrideMaintenance?.unitMaintenance ?? unitBreakdown.upkeep;
  const totalMaintenance = buildingMaintenance + unitMaintenance;
  const startingGold = civ?.gold ?? 0;
  const netGoldPerTurn = grossGoldIncome - totalMaintenance;
  const endingGold = Math.max(0, startingGold + netGoldPerTurn);
  const unpaidMaintenance = Math.max(0, totalMaintenance - (startingGold + grossGoldIncome));
  const level = strainLevel(unpaidMaintenance, totalMaintenance);

  return {
    civId,
    turn: state.turn,
    startingGold,
    endingGold,
    grossGoldIncome,
    buildingMaintenance,
    unitMaintenance,
    totalMaintenance,
    netGoldPerTurn,
    unpaidMaintenance,
    strainLevel: level,
    rushBuyBlockedByStrain: level === 'high' || level === 'critical',
    buildingBreakdown,
    unitBreakdown,
  };
}

export function projectCivEconomy(state: GameState, civId: string): CivEconomyResult {
  const civ = state.civilizations[civId];
  if (!civ) return calculateCivEconomy(state, civId, 0);
  const civDef = resolveCivDefinition(state, civ.civType);
  let grossGoldIncome = 0;
  for (const cityId of civ.cities) {
    const city = state.cities[cityId];
    if (!city) continue;
    const yields = calculateProjectedCityYields(state, cityId, civDef?.bonusEffect);
    const wonderCityBonus = getLegendaryWonderCityYieldBonus(state, civId, cityId);
    grossGoldIncome += yields.gold + (wonderCityBonus.gold ?? 0);
    if (city.productionQueue.length === 0 && city.idleProduction === 'gold') {
      grossGoldIncome += yields.production;
    }
  }
  const wonderCivBonus = getLegendaryWonderCivYieldBonus(state, civId);
  grossGoldIncome += wonderCivBonus.gold ?? 0;
  if (civDef?.bonusEffect.type === 'allied_kingdoms') {
    const allianceCount = civ.diplomacy.treaties.filter(t => t.type === 'alliance').length;
    grossGoldIncome += allianceCount * civDef.bonusEffect.allianceYieldBonus;
  }
  for (const treaty of civ.diplomacy.treaties) {
    if (treaty.type === 'trade_agreement' && treaty.goldPerTurn) {
      grossGoldIncome += treaty.goldPerTurn;
    }
  }
  if (state.marketplace) {
    grossGoldIncome += processTradeRouteIncome(
      state.marketplace.tradeRoutes.filter(route => state.cities[route.fromCityId]?.owner === civId),
    );
  }
  return calculateCivEconomy(state, civId, grossGoldIncome);
}

export function applyEconomyTurn(state: GameState, civId: string, result: CivEconomyResult): GameState {
  const civ = state.civilizations[civId];
  if (!civ) return state;
  return {
    ...state,
    civilizations: {
      ...state.civilizations,
      [civId]: { ...civ, gold: result.endingGold },
    },
    economyStatusByCiv: {
      ...(state.economyStatusByCiv ?? {}),
      [civId]: {
        turn: state.turn,
        grossGoldIncome: result.grossGoldIncome,
        buildingMaintenance: result.buildingMaintenance,
        unitMaintenance: result.unitMaintenance,
        netGoldPerTurn: result.netGoldPerTurn,
        unpaidMaintenance: result.unpaidMaintenance,
        strainLevel: result.strainLevel,
      },
    },
  };
}

function activeItemLabel(itemId: string): string {
  return BUILDINGS[itemId]?.name ?? TRAINABLE_UNITS.find(u => u.type === itemId)?.name ?? itemId;
}

export function getRushBuyQuote(state: GameState, civId: string, cityId: string): RushBuyQuote {
  const city = state.cities[cityId];
  const civ = state.civilizations[civId];
  if (!city || !civ || city.owner !== civId) return { available: false, reason: 'not-owner' };
  const itemId = city.productionQueue[0];
  if (!itemId) return { available: false, reason: 'no-active-production' };
  if (itemId.startsWith('legendary:')) return { available: false, reason: 'wonders-cannot-be-bought', itemId, label: activeItemLabel(itemId) };
  const building = BUILDINGS[itemId];
  const unit = TRAINABLE_UNITS.find(u => u.type === itemId);
  if (!building && !unit) return { available: false, reason: 'invalid-active-item', itemId, label: activeItemLabel(itemId) };

  const projected = projectCivEconomy(state, civId);
  if (projected.rushBuyBlockedByStrain) {
    return { available: false, reason: 'treasury-strain-too-high', itemId, label: activeItemLabel(itemId) };
  }

  const civDef = resolveCivDefinition(state, civ.civType);
  const totalCost = getProductionCostForItem(itemId, { city, bonusEffect: civDef?.bonusEffect, era: state.era });
  const remainingProduction = Math.max(0, totalCost - city.productionProgress);
  const cost = Math.max(10, Math.ceil(remainingProduction * 2.5));
  if (civ.gold < cost) {
    return { available: false, reason: 'not-enough-gold', itemId, label: activeItemLabel(itemId), cost, remainingProduction };
  }

  return { available: true, itemId, label: activeItemLabel(itemId), cost, remainingProduction };
}

export function emitEconomyStrainIfNeeded(bus: EventBus, result: CivEconomyResult): void {
  if (result.strainLevel === 'none') return;
  bus.emit('economy:treasury-strain', {
    civId: result.civId,
    level: result.strainLevel,
    netGoldPerTurn: result.netGoldPerTurn,
    unpaidMaintenance: result.unpaidMaintenance,
  });
}
```

Do not add rush-buy execution yet; that comes after shared production completion in Task 2.

- [ ] **Step 6: Run economy tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/economy-system.test.ts
```

Expected: PASS for maintenance, strain, projection, and quote tests.

- [ ] **Step 7: Commit Task 1**

```bash
git add src/core/types.ts src/systems/economy-system.ts tests/systems/economy-system.test.ts
git commit -m "feat(economy): add maintenance resolver"
```

---

### Task 2: Shared Production Completion And Rush-Buy Execution

**Files:**
- Modify: `src/systems/city-system.ts`
- Modify: `src/systems/economy-system.ts`
- Create: `tests/systems/rush-buy-system.test.ts`

- [ ] **Step 1: Write failing rush-buy execution tests**

Create `tests/systems/rush-buy-system.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import type { City, GameState } from '@/core/types';
import { EventBus } from '@/core/event-bus';
import { createDiplomacyState } from '@/systems/diplomacy-system';
import { rushBuyActiveProduction } from '@/systems/economy-system';

function city(overrides: Partial<City> = {}): City {
  return {
    id: 'city-1',
    name: 'Capital',
    owner: 'player',
    position: { q: 0, r: 0 },
    population: 2,
    food: 0,
    foodNeeded: 20,
    buildings: [],
    productionQueue: ['workshop'],
    productionProgress: 2,
    ownedTiles: [],
    workedTiles: [],
    focus: 'balanced',
    maturity: 'outpost',
    grid: Array.from({ length: 7 }, (_, row) => Array.from({ length: 7 }, (_, col) => row === 3 && col === 3 ? 'city-center' : null)),
    gridSize: 3,
    unrestLevel: 0,
    unrestTurns: 0,
    spyUnrestBonus: 0,
    idleProduction: null,
    ...overrides,
  };
}

function state(c: City = city()): GameState {
  return {
    turn: 12,
    era: 1,
    currentPlayer: 'player',
    gameOver: false,
    winner: null,
    map: { width: 10, height: 10, tiles: {}, wrapsHorizontally: false, rivers: [] },
    units: {},
    cities: { [c.id]: c },
    civilizations: {
      player: {
        id: 'player',
        name: 'Player',
        color: '#4a90d9',
        isHuman: true,
        civType: 'egypt',
        cities: [c.id],
        units: [],
        techState: { completed: [], currentResearch: null, researchProgress: 0, researchQueue: [], trackPriorities: {} as any },
        gold: 100,
        visibility: { tiles: {} },
        score: 0,
        diplomacy: createDiplomacyState(['player'], 'player'),
      },
    },
    barbarianCamps: {},
    minorCivs: {},
    tutorial: { active: false, currentStep: 'complete', completedSteps: [] },
    settings: {
      mapSize: 'small',
      soundEnabled: false,
      musicEnabled: false,
      musicVolume: 0,
      sfxVolume: 0,
      tutorialEnabled: false,
      advisorsEnabled: {} as any,
      councilTalkLevel: 'normal',
    },
    tribalVillages: {},
    discoveredWonders: {},
    wonderDiscoverers: {},
    embargoes: [],
    defensiveLeagues: [],
  } as GameState;
}

describe('rush-buy-system', () => {
  it('buys active normal building through shared completion semantics', () => {
    const bus = new EventBus();
    const complete = vi.fn();
    bus.on('city:building-complete', complete);

    const result = rushBuyActiveProduction(state(), 'player', 'city-1', bus);

    expect(result.success).toBe(true);
    expect(result.state.civilizations.player.gold).toBe(75);
    expect(result.state.cities['city-1'].buildings).toContain('workshop');
    expect(result.state.cities['city-1'].grid.flat()).toContain('workshop');
    expect(result.state.cities['city-1'].productionQueue).toEqual([]);
    expect(result.state.cities['city-1'].productionProgress).toBe(0);
    expect(complete).toHaveBeenCalledWith({ cityId: 'city-1', buildingId: 'workshop' });
  });

  it('buys active normal unit through shared completion semantics', () => {
    const bus = new EventBus();
    const trained = vi.fn();
    bus.on('city:unit-trained', trained);
    const c = city({ productionQueue: ['warrior'], productionProgress: 0 });

    const result = rushBuyActiveProduction(state(c), 'player', 'city-1', bus);

    expect(result.success).toBe(true);
    expect(result.state.civilizations.player.gold).toBe(80);
    expect(result.state.civilizations.player.units).toHaveLength(1);
    const newUnitId = result.state.civilizations.player.units[0];
    expect(result.state.units[newUnitId].type).toBe('warrior');
    expect(result.state.units[newUnitId].position).toEqual({ q: 0, r: 0 });
    expect(trained).toHaveBeenCalledWith({ cityId: 'city-1', unitType: 'warrior' });
  });

  it('rejects high treasury strain with an explicit reason', () => {
    const bus = new EventBus();
    const s = state(city({ productionQueue: ['warrior'] }));
    s.civilizations.player.gold = 20;
    s.units = Object.fromEntries(Array.from({ length: 100 }, (_, index) => [`u-${index}`, {
      id: `u-${index}`,
      type: 'warrior',
      owner: 'player',
      position: { q: index, r: 0 },
      movementPointsLeft: 2,
      health: 100,
      experience: 0,
      hasMoved: false,
      hasActed: false,
      isResting: false,
    }]));
    s.civilizations.player.units = Object.keys(s.units);

    const result = rushBuyActiveProduction(s, 'player', 'city-1', bus);

    expect(result).toMatchObject({ success: false, reason: 'treasury-strain-too-high' });
  });
});
```

- [ ] **Step 2: Run failing rush-buy tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/rush-buy-system.test.ts
```

Expected: FAIL because `rushBuyActiveProduction` and `completeCityProductionItem` are missing.

- [ ] **Step 3: Extract production completion helper**

In `src/systems/city-system.ts`, add:

```ts
export interface ProductionCompletionResult {
  city: City;
  completedBuilding: string | null;
  completedUnit: UnitType | null;
}

export function completeCityProductionItem(city: City, itemId: string): ProductionCompletionResult {
  const building = BUILDINGS[itemId];
  if (building) {
    const buildings = city.buildings.includes(building.id)
      ? city.buildings
      : [...city.buildings, building.id];
    const completedCity = placeBuildingInGrid({ ...city, buildings }, building.id);
    return { city: completedCity, completedBuilding: building.id, completedUnit: null };
  }

  const unitDef = TRAINABLE_UNITS.find(u => u.type === itemId);
  if (unitDef) {
    return { city, completedBuilding: null, completedUnit: unitDef.type };
  }

  return { city, completedBuilding: null, completedUnit: null };
}
```

Then replace the duplicate completion logic inside `processCity` with:

```ts
    const completion = completeCityProductionItem({ ...city, buildings: newBuildings }, currentItem);
    if (completion.completedBuilding && newProgress >= getProductionCostForItem(currentItem, { city, bonusEffect, era })) {
      completedBuilding = completion.completedBuilding;
      newBuildings.length = 0;
      newBuildings.push(...completion.city.buildings);
      newQueue.shift();
      newProgress = 0;
    }

    if (completion.completedUnit && newProgress >= getProductionCostForItem(currentItem, { city, bonusEffect, era })) {
      completedUnit = completion.completedUnit;
      newQueue.shift();
      newProgress = 0;
    }
```

Keep the final `if (completedBuilding) nextCity = placeBuildingInGrid(...)` block or remove it only if tests prove placement still happens exactly once. Prefer keeping it because `placeBuildingInGrid` is idempotent.

- [ ] **Step 4: Add rush-buy execution**

Append to `src/systems/economy-system.ts`:

```ts
import {
  completeCityProductionItem,
  getProductionCostForItem,
} from '@/systems/city-system';
import { createSpyFromUnit, isSpyUnitType } from '@/systems/espionage-system';
```

Merge imports instead of duplicating existing imports.

Add:

```ts
export type RushBuyResult =
  | { success: true; state: GameState; itemId: string; label: string; cost: number }
  | { success: false; state: GameState; reason: RushBuyDisabledReason };

export function rushBuyActiveProduction(
  state: GameState,
  civId: string,
  cityId: string,
  bus: EventBus,
): RushBuyResult {
  const quote = getRushBuyQuote(state, civId, cityId);
  if (!quote.available || !quote.itemId || quote.cost === undefined) {
    return { success: false, state, reason: quote.reason ?? 'invalid-active-item' };
  }

  const city = state.cities[cityId];
  const civ = state.civilizations[civId];
  if (!city || !civ) return { success: false, state, reason: 'not-owner' };

  const completion = completeCityProductionItem(city, quote.itemId);
  if (!completion.completedBuilding && !completion.completedUnit) {
    return { success: false, state, reason: 'invalid-active-item' };
  }

  const nextCity: City = {
    ...completion.city,
    productionQueue: city.productionQueue.slice(1),
    productionProgress: 0,
  };
  let nextState: GameState = {
    ...state,
    cities: { ...state.cities, [cityId]: nextCity },
    civilizations: {
      ...state.civilizations,
      [civId]: { ...civ, gold: civ.gold - quote.cost },
    },
  };

  if (completion.completedBuilding) {
    bus.emit('city:building-complete', { cityId, buildingId: completion.completedBuilding });
  }

  if (completion.completedUnit) {
    const civDef = resolveCivDefinition(state, civ.civType);
    const newUnit = createUnit(completion.completedUnit, civId, city.position, civDef?.bonusEffect);
    nextState = {
      ...nextState,
      units: { ...nextState.units, [newUnit.id]: newUnit },
      civilizations: {
        ...nextState.civilizations,
        [civId]: {
          ...nextState.civilizations[civId],
          units: [...nextState.civilizations[civId].units, newUnit.id],
        },
      },
    };
    bus.emit('city:unit-trained', { cityId, unitType: completion.completedUnit });

    if (isSpyUnitType(completion.completedUnit) && nextState.espionage?.[civId]) {
      const { state: updatedEsp, spy } = createSpyFromUnit(
        nextState.espionage[civId],
        newUnit.id,
        civId,
        completion.completedUnit,
        `spy-unit-${newUnit.id}-${nextState.turn}`,
      );
      nextState = {
        ...nextState,
        espionage: { ...nextState.espionage, [civId]: updatedEsp },
      };
      bus.emit('espionage:spy-recruited', { civId, spy });
    }
  }

  return { success: true, state: nextState, itemId: quote.itemId, label: quote.label ?? quote.itemId, cost: quote.cost };
}
```

- [ ] **Step 5: Run rush-buy and city tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/rush-buy-system.test.ts tests/systems/city-system.test.ts
```

If `tests/systems/city-system.test.ts` does not exist, run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/economy-system.test.ts tests/systems/rush-buy-system.test.ts
```

Expected: PASS. If TypeScript import conflicts appear in `economy-system.ts`, consolidate city-system imports into one import block.

- [ ] **Step 6: Commit Task 2**

```bash
git add src/systems/city-system.ts src/systems/economy-system.ts tests/systems/rush-buy-system.test.ts
git commit -m "feat(economy): add rush buy execution"
```

---

### Task 3: Turn Manager Economy Application And Notifications

**Files:**
- Modify: `src/core/turn-manager.ts`
- Modify: `src/ui/notification-routing.ts`
- Modify: `tests/systems/economy-system.test.ts`
- Create or modify: `tests/systems/turn-manager-economy.test.ts`

- [ ] **Step 1: Write failing turn-manager tests**

Create `tests/systems/turn-manager-economy.test.ts` with a focused fixture based on existing turn-manager tests:

```ts
import { describe, expect, it, vi } from 'vitest';
import type { City, GameState } from '@/core/types';
import { EventBus } from '@/core/event-bus';
import { processTurn } from '@/core/turn-manager';
import { createDiplomacyState } from '@/systems/diplomacy-system';

function city(overrides: Partial<City> = {}): City {
  return {
    id: 'city-1',
    name: 'Capital',
    owner: 'player',
    position: { q: 0, r: 0 },
    population: 1,
    food: 0,
    foodNeeded: 20,
    buildings: ['security-bureau', 'observatory', 'forge', 'harbor', 'marketplace', 'temple', 'walls', 'stable', 'safehouse'],
    productionQueue: [],
    productionProgress: 0,
    ownedTiles: [],
    workedTiles: [],
    focus: 'balanced',
    maturity: 'outpost',
    grid: [[null]],
    gridSize: 3,
    unrestLevel: 0,
    unrestTurns: 0,
    spyUnrestBonus: 0,
    idleProduction: null,
    ...overrides,
  };
}

function state(gold: number): GameState {
  const c = city();
  return {
    turn: 20,
    era: 3,
    currentPlayer: 'player',
    gameOver: false,
    winner: null,
    map: { width: 10, height: 10, tiles: {}, wrapsHorizontally: false, rivers: [] },
    units: {},
    cities: { [c.id]: c },
    civilizations: {
      player: {
        id: 'player',
        name: 'Player',
        color: '#4a90d9',
        isHuman: true,
        civType: 'egypt',
        cities: [c.id],
        units: [],
        techState: { completed: [], currentResearch: null, researchProgress: 0, researchQueue: [], trackPriorities: {} as any },
        gold,
        visibility: { tiles: {} },
        score: 0,
        diplomacy: createDiplomacyState(['player'], 'player'),
      },
    },
    barbarianCamps: {},
    minorCivs: {},
    tutorial: { active: false, currentStep: 'complete', completedSteps: [] },
    settings: {
      mapSize: 'small',
      soundEnabled: false,
      musicEnabled: false,
      musicVolume: 0,
      sfxVolume: 0,
      tutorialEnabled: false,
      advisorsEnabled: {} as any,
      councilTalkLevel: 'normal',
    },
    tribalVillages: {},
    discoveredWonders: {},
    wonderDiscoverers: {},
    embargoes: [],
    defensiveLeagues: [],
  } as GameState;
}

describe('turn-manager economy', () => {
  it('applies maintenance with a zero gold floor and stores resolved status', () => {
    const bus = new EventBus();
    const next = processTurn(state(0), bus);

    expect(next.civilizations.player.gold).toBe(0);
    expect(next.economyStatusByCiv?.player).toMatchObject({
      turn: 20,
      strainLevel: 'high',
    });
    expect(next.economyStatusByCiv!.player.buildingMaintenance).toBeGreaterThan(0);
  });

  it('emits one treasury strain event for an affected civ turn', () => {
    const bus = new EventBus();
    const strain = vi.fn();
    bus.on('economy:treasury-strain', strain);

    processTurn(state(0), bus);

    expect(strain).toHaveBeenCalledTimes(1);
    expect(strain.mock.calls[0][0]).toMatchObject({ civId: 'player', level: 'high' });
  });
});
```

- [ ] **Step 2: Run failing turn-manager tests**

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/turn-manager-economy.test.ts
```

Expected: FAIL because `processTurn` still directly adds gross gold and does not store economy status.

- [ ] **Step 3: Integrate economy in turn-manager**

In `src/core/turn-manager.ts`, import:

```ts
import { applyEconomyTurn, calculateCivEconomy, emitEconomyStrainIfNeeded } from '@/systems/economy-system';
```

Remove the direct gold update block:

```ts
    // Update gold
    newState.civilizations[civId].gold += totalGold;
```

Do not apply economy at that exact location yet. Keep accumulating `totalGold` until after diplomacy treaty income is known.

Keep vassalage, treaty, and trade route income behavior coherent:

- Vassalage tribute should still be based on positive gross income before maintenance, as it is today.
- If tribute currently subtracts after gold is added, move it before `calculateCivEconomy` by reducing `totalGold` for the vassal and directly adding tribute to the overlord.
- Treaty `goldPerTurn` should add to `totalGold`, not directly to `civ.gold`.
- Marketplace trade route income should add to `totalGold` inside this civ loop before `calculateCivEconomy`; remove the later block that directly adds route income to `newState.civilizations[civId].gold`.

Use this replacement for vassalage block:

```ts
    if (civ.diplomacy?.vassalage.overlord) {
      const tribute = processVassalageTribute(totalGold);
      totalGold -= tribute.tributeAmount;
      const overlordId = civ.diplomacy.vassalage.overlord;
      if (newState.civilizations[overlordId]) {
        newState.civilizations[overlordId].gold += tribute.tributeAmount;
      }
    }
```

Place it before `calculateCivEconomy`.

In the diplomacy treaty loop, replace direct gold mutation:

```ts
          newState.civilizations[civId].gold += treaty.goldPerTurn;
```

with:

```ts
          totalGold += treaty.goldPerTurn;
```

Before applying economy, add marketplace route income:

```ts
    if (newState.marketplace) {
      totalGold += processTradeRouteIncome(
        newState.marketplace.tradeRoutes.filter(route => {
          const city = newState.cities[route.fromCityId];
          return city?.owner === civId;
        }),
      );
    }
```

Then apply economy after diplomacy treaty processing and marketplace route income, before visibility updates:

```ts
    const economyResult = calculateCivEconomy(newState, civId, totalGold);
    newState = applyEconomyTurn(newState, civId, economyResult);
    emitEconomyStrainIfNeeded(bus, economyResult);
```

In the later marketplace section, delete only the direct route-income addition loop:

```ts
    // Trade route income for each civ
    for (const [civId, civ] of Object.entries(newState.civilizations)) {
      const civRouteIncome = processTradeRouteIncome(
        newState.marketplace.tradeRoutes.filter(r => {
          const city = newState.cities[r.fromCityId];
          return city?.owner === civId;
        }),
      );
      newState.civilizations[civId].gold += civRouteIncome;
    }
```

Keep fashion cycle and price updates in the marketplace section unchanged.

- [ ] **Step 4: Route economy strain notifications**

In `src/ui/notification-routing.ts`, extend the local routing type:

```ts
type EconomyTreasuryStrainRoutingEvent =
  GameEvents['economy:treasury-strain'] & { type: 'economy:treasury-strain' };
```

Add a route helper:

```ts
export function routeEconomyTreasuryStrain(
  _state: GameState,
  event: EconomyTreasuryStrainRoutingEvent,
  sink: NotificationSink,
): void {
  if (event.level === 'low') {
    sink(event.civId, 'Treasury strain: maintenance is outpacing available gold.', 'warning');
    return;
  }
  if (event.level === 'high') {
    sink(event.civId, 'Treasury strain is high. Rush-buy is unavailable until the budget recovers.', 'warning');
    return;
  }
  sink(event.civId, 'Treasury strain is critical. From Era 3 onward, this increases unrest pressure.', 'warning');
}
```

In `src/main.ts`, add `routeEconomyTreasuryStrain` to the existing import from `@/ui/notification-routing` near `routeFactionTransition` and `routeTerritoryTileFlipped`. Then add this listener after the existing `territory:tile-flipped` listener or before the faction listeners:

```ts
bus.on('economy:treasury-strain', event => {
  routeEconomyTreasuryStrain(gameState, { type: 'economy:treasury-strain', ...event }, appendToCivLog);
});
```

- [ ] **Step 5: Run turn-manager tests**

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/turn-manager-economy.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit Task 3**

```bash
git add src/core/turn-manager.ts src/ui/notification-routing.ts src/main.ts tests/systems/turn-manager-economy.test.ts
git commit -m "feat(economy): apply maintenance during turns"
```

---

### Task 4: Era 3+ Unrest Integration

**Files:**
- Modify: `src/systems/faction-system.ts`
- Modify: `tests/systems/faction-system.test.ts`

- [ ] **Step 1: Add failing faction tests**

Append to `tests/systems/faction-system.test.ts`:

```ts
it('does not add treasury strain pressure before Era 3', () => {
  const base = makeState({ era: 2 });
  base.economyStatusByCiv = {
    player: {
      turn: base.turn - 1,
      grossGoldIncome: 0,
      buildingMaintenance: 20,
      unitMaintenance: 0,
      netGoldPerTurn: -20,
      unpaidMaintenance: 20,
      strainLevel: 'critical',
    },
  };

  expect(computeUnrestPressure('city-1', base)).toBe(0);
});

it('adds treasury strain pressure in Era 3 only for critical strain', () => {
  const critical = makeState({ era: 3 });
  critical.economyStatusByCiv = {
    player: {
      turn: critical.turn - 1,
      grossGoldIncome: 0,
      buildingMaintenance: 20,
      unitMaintenance: 0,
      netGoldPerTurn: -20,
      unpaidMaintenance: 20,
      strainLevel: 'critical',
    },
  };

  const high = makeState({ era: 3 });
  high.economyStatusByCiv = {
    player: {
      turn: high.turn - 1,
      grossGoldIncome: 0,
      buildingMaintenance: 8,
      unitMaintenance: 0,
      netGoldPerTurn: -8,
      unpaidMaintenance: 8,
      strainLevel: 'high',
    },
  };

  expect(computeUnrestPressure('city-1', critical)).toBeGreaterThan(computeUnrestPressure('city-1', high));
  expect(computeUnrestPressure('city-1', high)).toBe(0);
});
```

- [ ] **Step 2: Run failing faction tests**

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/faction-system.test.ts
```

Expected: FAIL because critical economy status does not affect pressure.

- [ ] **Step 3: Add economy pressure helper**

In `src/systems/faction-system.ts`, import:

```ts
import { ECONOMY_UNREST_PRESSURE } from './economy-system';
```

Inside `computeUnrestPressure`, after spy unrest bonus:

```ts
  const economyStatus = state.economyStatusByCiv?.[owner];
  if (state.era >= 3 && economyStatus?.strainLevel === 'critical') {
    pressure += ECONOMY_UNREST_PRESSURE;
  }
```

- [ ] **Step 4: Run faction tests**

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/faction-system.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 4**

```bash
git add src/systems/faction-system.ts tests/systems/faction-system.test.ts
git commit -m "feat(economy): add treasury strain unrest pressure"
```

---

### Task 5: HUD Projection

**Files:**
- Create: `src/ui/hud-economy.ts`
- Modify: `src/main.ts`
- Create: `tests/ui/hud-economy.test.ts`

- [ ] **Step 1: Write failing HUD helper tests**

Create `tests/ui/hud-economy.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { GameState } from '@/core/types';
import { formatGoldHudText } from '@/ui/hud-economy';

describe('hud-economy', () => {
  it('labels positive and negative projected net gold clearly', () => {
    expect(formatGoldHudText(42, 5, 'none')).toBe('💰 42 (+5 net)');
    expect(formatGoldHudText(42, -3, 'low')).toBe('💰 42 (-3 net) · Treasury strain');
    expect(formatGoldHudText(42, -8, 'high')).toBe('💰 42 (-8 net) · Rush-buy blocked');
    expect(formatGoldHudText(42, -12, 'critical')).toBe('💰 42 (-12 net) · Critical strain');
  });
});
```

- [ ] **Step 2: Run failing HUD test**

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/hud-economy.test.ts
```

Expected: FAIL because `src/ui/hud-economy.ts` does not exist.

- [ ] **Step 3: Add HUD formatter**

Create `src/ui/hud-economy.ts`:

```ts
import type { TreasuryStrainLevel } from '@/core/types';

export function formatGoldHudText(gold: number, netGoldPerTurn: number, strainLevel: TreasuryStrainLevel): string {
  const sign = netGoldPerTurn >= 0 ? '+' : '';
  const base = `💰 ${gold} (${sign}${netGoldPerTurn} net)`;
  if (strainLevel === 'critical') return `${base} · Critical strain`;
  if (strainLevel === 'high') return `${base} · Rush-buy blocked`;
  if (strainLevel === 'low') return `${base} · Treasury strain`;
  return base;
}
```

- [ ] **Step 4: Wire HUD to projection**

In `src/main.ts`, import:

```ts
import { projectCivEconomy } from '@/systems/economy-system';
import { formatGoldHudText } from '@/ui/hud-economy';
```

In `updateHUD`, replace the gold span text:

```ts
  const economy = projectCivEconomy(gameState, gameState.currentPlayer);
  goldSpan.textContent = formatGoldHudText(civ.gold, economy.netGoldPerTurn, economy.strainLevel);
```

Keep `totalGold` calculation for other local display only if still used; remove it if it becomes unused.

- [ ] **Step 5: Run HUD test**

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/hud-economy.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit Task 5**

```bash
git add src/ui/hud-economy.ts src/main.ts tests/ui/hud-economy.test.ts
git commit -m "feat(ui): show projected net gold"
```

---

### Task 6: City Panel Maintenance And Rush-Buy UX

**Files:**
- Modify: `src/ui/city-panel.ts`
- Modify: `src/main.ts`
- Modify: `tests/ui/city-panel.test.ts`

- [ ] **Step 1: Read UI rule**

```bash
sed -n '1,260p' .claude/rules/ui-panels.md
sed -n '1,260p' docs/superpowers/plans/README.md
```

Expected: confirm `textContent` for dynamic values, immediate panel rerender, no hidden full catalog.

- [ ] **Step 2: Add failing city panel tests**

Append focused tests to `tests/ui/city-panel.test.ts` using existing `createCityPanel` fixtures:

```ts
it('shows city maintenance support and future upkeep without hiding build choices', () => {
  city.buildings = ['herbalist', 'workshop', 'marketplace', 'harbor', 'forge', 'observatory', 'security-bureau'];
  const panel = createCityPanel(container, city, state, {
    onBuild: vi.fn(),
    onOpenWonderPanel: vi.fn(),
    onClose: vi.fn(),
  });

  expect(panel.textContent).toContain('Free support');
  expect(panel.textContent).toContain('Paid upkeep');
  expect(panel.textContent).toContain('Build');
  expect(panel.textContent).toContain('Units');
  expect(panel.querySelectorAll('.build-item').length).toBeGreaterThan(0);
});

it('shows buy now for active normal production and rerenders after click', () => {
  city.productionQueue = ['workshop', 'warrior'];
  city.productionProgress = 2;
  state.civilizations[state.currentPlayer].gold = 100;
  const onRushBuyActiveProduction = vi.fn((cityId: string) => {
    state.civilizations[state.currentPlayer].gold = 75;
    state.cities[cityId] = {
      ...state.cities[cityId],
      buildings: [...state.cities[cityId].buildings, 'workshop'],
      productionQueue: ['warrior'],
      productionProgress: 0,
    };
    return state;
  });

  const panel = createCityPanel(container, city, state, {
    onBuild: vi.fn(),
    onOpenWonderPanel: vi.fn(),
    onClose: vi.fn(),
    onRushBuyActiveProduction,
  });

  const button = panel.querySelector<HTMLButtonElement>('[data-rush-buy-active]');
  expect(button?.textContent).toContain('Buy now');
  button!.click();

  const refreshed = container.querySelector('#city-panel')!;
  expect(onRushBuyActiveProduction).toHaveBeenCalledWith(city.id);
  expect(refreshed.textContent).toContain('Workshop');
  expect(refreshed.textContent).toContain('Warrior');
});

it('shows explicit disabled reasons for treasury strain and legendary wonders', () => {
  city.productionQueue = ['legendary:pyramids'];
  const panel = createCityPanel(container, city, state, {
    onBuild: vi.fn(),
    onOpenWonderPanel: vi.fn(),
    onClose: vi.fn(),
  });

  expect(panel.textContent).toContain('Wonders cannot be bought');
});
```

If the existing test file uses different `beforeEach` names, add this as a separate `describe('maintenance and rush-buy UI', ...)` block with local `container`, `city`, and `state` fixtures. The assertions must inspect visible panel text after clicks, not only callback calls.

- [ ] **Step 3: Run failing city panel tests**

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/city-panel.test.ts
```

Expected: FAIL because city panel has no maintenance summary or rush-buy controls.

- [ ] **Step 4: Add callback and economy imports**

In `src/ui/city-panel.ts`, import:

```ts
import {
  calculateCityBuildingMaintenance,
  getRushBuyQuote,
  type RushBuyDisabledReason,
} from '@/systems/economy-system';
```

Extend `CityPanelCallbacks`:

```ts
  onRushBuyActiveProduction?: (cityId: string) => GameState | void;
```

Add helper:

```ts
function rushBuyReasonText(reason: RushBuyDisabledReason | undefined): string {
  switch (reason) {
    case 'no-active-production': return 'No active production to buy';
    case 'not-enough-gold': return 'Not enough gold';
    case 'treasury-strain-too-high': return 'Treasury strain is too high';
    case 'wonders-cannot-be-bought': return 'Wonders cannot be bought';
    case 'not-owner': return 'Only the owner can buy production';
    case 'invalid-active-item': return 'This production item cannot be bought';
    default: return 'Cannot buy this item';
  }
}
```

- [ ] **Step 5: Render maintenance and rush-buy**

Near the top of `createCityPanel`, after `currentCiv`, compute:

```ts
  const cityMaintenance = calculateCityBuildingMaintenance(state, city.id);
  const rushBuyQuote = getRushBuyQuote(state, state.currentPlayer, city.id);
```

In each built building row, include nonzero upkeep:

```ts
const upkeepRow = cityMaintenance.rows.find(row => row.id === bid);
const upkeepText = upkeepRow?.upkeep ? ` · ${upkeepRow.upkeep} gold/turn` : ' · 0 upkeep';
```

Add a maintenance summary after the yield row:

```html
<div style="background:rgba(255,255,255,0.06);border-radius:8px;padding:8px;margin-bottom:12px;font-size:12px;">
  <strong>Free support</strong>: <span data-text="maintenance-support"></span><br>
  <strong>Paid upkeep</strong>: <span data-text="maintenance-paid"></span>
</div>
```

Set:

```ts
  setText('maintenance-support', `${cityMaintenance.supportUsed}/${cityMaintenance.freeSupport} buildings`);
  setText('maintenance-paid', `${cityMaintenance.upkeep} gold/turn`);
```

For build options, append future upkeep text:

```ts
const futureCity = {
  ...city,
  buildings: city.buildings.includes(b.id) ? city.buildings : [...city.buildings, b.id],
};
const futureState = {
  ...state,
  cities: { ...state.cities, [city.id]: futureCity },
};
const futureRow = calculateCityBuildingMaintenance(futureState, city.id).rows.find(row => row.id === b.id);
const futureUpkeep = futureRow?.upkeep ?? 0;
```

For active production, add inside `currentProductionHtml`:

```html
<div data-rush-buy-row style="margin-top:10px;"></div>
```

After `panel.innerHTML = html`, populate the row with DOM APIs:

```ts
  const rushRow = panel.querySelector<HTMLElement>('[data-rush-buy-row]');
  if (rushRow && city.productionQueue.length > 0) {
    if (rushBuyQuote.available && rushBuyQuote.cost !== undefined) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.rushBuyActive = 'true';
      button.textContent = `Buy now: ${rushBuyQuote.cost} gold`;
      button.style.cssText = 'padding:6px 10px;border-radius:6px;background:#d4aa2c;border:none;color:#111;cursor:pointer;font-size:12px;font-weight:bold;';
      button.addEventListener('click', () => {
        const nextState = callbacks.onRushBuyActiveProduction?.(city.id);
        rerenderPanel(nextState);
      });
      rushRow.appendChild(button);
    } else {
      const reason = document.createElement('div');
      reason.dataset.rushBuyDisabledReason = rushBuyQuote.reason ?? 'unknown';
      reason.style.cssText = 'font-size:12px;color:#d9a25c;';
      reason.textContent = rushBuyReasonText(rushBuyQuote.reason);
      rushRow.appendChild(reason);
    }
  }
```

This code references `rerenderPanel`, so place the DOM population after `rerenderPanel` is declared or split into a local `renderRushBuyRow` function called after `rerenderPanel` exists.

- [ ] **Step 6: Wire main callback**

In `src/main.ts`, import:

```ts
import { rushBuyActiveProduction } from '@/systems/economy-system';
```

Add to `createCityPanel` callbacks:

```ts
    onRushBuyActiveProduction: (cityId) => {
      const result = rushBuyActiveProduction(gameState, gameState.currentPlayer, cityId, bus);
      if (!result.success) {
        showNotification(`Cannot buy production: ${result.reason}`, 'warning');
        return gameState;
      }
      gameState = result.state;
      renderLoop.setGameState(gameState);
      updateHUD();
      showNotification(`${gameState.cities[cityId].name}: bought ${result.label} for ${result.cost} gold`, 'success');
      return gameState;
    },
```

- [ ] **Step 7: Run city panel tests**

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/city-panel.test.ts
```

Expected: PASS and visible DOM tests prove maintenance text, disabled reasons, and immediate rerender.

- [ ] **Step 8: Commit Task 6**

```bash
git add src/ui/city-panel.ts src/main.ts tests/ui/city-panel.test.ts
git commit -m "feat(ui): add maintenance and rush buy controls"
```

---

### Task 7: Save Compatibility, Rule Checks, And Regression Sweep

**Files:**
- Modify only if failures require it:
  - `src/storage/**`
  - `src/core/game-state.ts`
  - `tests/**`

- [ ] **Step 1: Run source rule checks for changed source files**

Run with the actual changed source paths:

```bash
scripts/check-src-rule-violations.sh src/core/types.ts src/systems/economy-system.ts src/systems/city-system.ts src/core/turn-manager.ts src/systems/faction-system.ts src/ui/city-panel.ts src/ui/hud-economy.ts src/ui/notification-routing.ts src/main.ts
```

Expected: PASS. If it reports `innerHTML` risk in newly added dynamic UI, replace dynamic sections with `textContent`/DOM creation.

- [ ] **Step 2: Run targeted tests**

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/economy-system.test.ts tests/systems/rush-buy-system.test.ts tests/systems/turn-manager-economy.test.ts tests/systems/faction-system.test.ts tests/ui/hud-economy.test.ts tests/ui/city-panel.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run build**

```bash
./scripts/run-with-mise.sh yarn build
```

Expected: PASS. This catches type errors that `yarn test` does not.

- [ ] **Step 4: Run full test suite**

```bash
./scripts/run-with-mise.sh yarn test
```

Expected: PASS.

- [ ] **Step 5: Inspect committed and uncommitted diffs**

```bash
git diff --stat origin/main...HEAD
git diff --stat
git diff origin/main...HEAD -- src tests docs/superpowers
```

Expected:

- Source changes are limited to economy, production completion, turn manager, faction pressure, HUD, city panel, notification routing, and tests.
- `git diff --stat` is empty before final status.

- [ ] **Step 6: Commit verification fixes if any**

If verification required changes:

```bash
git add <changed-files>
git commit -m "fix(economy): address maintenance regressions"
```

If no changes were required, do not create an empty commit.

## Final Self-Review Checklist For Implementer

- Gameplay remains fun: likely-needed buildings are free, two defenders per city are free, reserves absorb bad turns before strain starts.
- No hidden punishment: gold floors at `0`; no disbanding, no building shutdown, no negative gold.
- No data drift: `economyStatusByCiv` is serializable and optional for old saves.
- No logic ambiguity: support assignment order is deterministic for buildings and units.
- No UI confusion: HUD says `net`, city panel says `Free support` and `Paid upkeep`, disabled rush-buy gives one clear reason.
- No stale interaction bug: buy button rerenders the panel immediately after success.
- No wonder exploit: `legendary:*` and future wonder-classified items cannot be bought.
- No unrest surprise: treasury strain unrest pressure starts only in Era 3+ and uses last resolved critical status.
- No notification spam: one strain warning per civ turn, not one per city.
- Regression coverage exists for resolver math, rush-buy, turn application, unrest gating, HUD projection, and city panel visible DOM.
