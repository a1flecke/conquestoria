# Cost Dynamics Drift Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Execute inline only; do not use subagents.

**Goal:** Reconcile the merged cost-dynamics MVP with the approved economy contract so maintenance, strain, rush-buy, unrest, and UI behavior are correct, fun, and explainable.

**Architecture:** Keep one canonical economy system responsible for maintenance policy, projections, resolved status, strain normalization, rush-buy quotes, and rush-buy execution. UI and turn processing consume economy helpers; they do not reimplement support assignment, strain thresholds, or purchase validation. Existing production completion remains shared through `completeCityProductionItem`, with rush-buy moved out of `src/main.ts` into `src/systems/economy-system.ts`.

**Tech Stack:** TypeScript, Vite, Vitest, JSDOM UI tests, serializable `GameState`, event bus notifications.

---

## Spec And Rule Inputs

- Design spec: `docs/superpowers/specs/2026-05-20-cost-dynamics-drift-reconciliation-design.md`
- Original economy design: `docs/superpowers/specs/2026-05-16-cost-dynamics-design.md`
- Existing implementation plan to reconcile against: `docs/superpowers/plans/2026-05-16-cost-dynamics-implementation.md`
- Required repo rules:
  - `.claude/rules/spec-fidelity.md`
  - `.claude/rules/game-systems.md`
  - `.claude/rules/strategy-game-mechanics.md`
  - `.claude/rules/end-to-end-wiring.md`
  - `.claude/rules/ui-panels.md`
  - `docs/superpowers/plans/README.md`

## File Structure

- Modify `src/core/types.ts`
  - Replace the active economy strain/status contract with `TreasuryStrainLevel = 'none' | 'low' | 'high' | 'critical'`.
  - Keep save compatibility by accepting old status shapes through economy normalization helpers, not by keeping old labels active.
- Modify `src/systems/economy-system.ts`
  - Central policy object, maintenance row helpers, city building maintenance, civ unit maintenance, projections, resolved economy, status normalization, strain events, rush-buy quote, rush-buy execution, HUD/tooltip formatting.
- Modify `src/core/turn-manager.ts`
  - Continue applying economy once per civ turn, but store compact resolved status and emit strain events for `low`, `high`, and `critical` according to the new contract.
- Modify `src/systems/faction-system.ts`
  - Read normalized last-resolved status and add economy pressure only for Era 3+ `critical`.
- Modify `src/ui/notification-routing.ts`
  - Route high and critical strain with era-aware wording and no per-city spam.
- Modify `src/ui/city-panel.ts`
  - Show `Free support`, `Paid upkeep`, built/future upkeep, clear disabled reasons, and immediate rerender after buy.
- Modify `src/main.ts`
  - Replace inline rush-buy mutation with `rushBuyActiveProduction`.
  - Keep HUD reading projected economy.
- Test files:
  - Modify `tests/systems/economy-system.test.ts`
  - Modify `tests/core/turn-manager.test.ts`
  - Modify `tests/systems/faction-system.test.ts`
  - Create `tests/ui/notification-routing.test.ts`
  - Modify `tests/ui/city-panel.test.ts`
  - Modify `tests/storage/save-persistence.test.ts`

## Player Truth Table

| Before | Action | Internal Change | Immediate Visible Result | Still Reachable |
|---|---|---|---|---|
| Treasury can cover a negative net turn | End turn | Gold decreases, unpaid maintenance remains `0` | HUD shows lower gold and negative net, no strain label | Rush-buy if affordable |
| Projected strain is `low` | Open city panel with active item | Quote validates active item and gold | Buy button remains enabled if affordable | Queue controls, build/unit catalog |
| Projected strain is `high` | Open city panel with active item | Quote rejects with `treasury-strain-too-high` | Disabled reason says treasury strain is too high | Normal production, queue controls |
| Projected strain is `critical` in Era 2 | End turn | Status stored as `critical`; no economy unrest pressure | Notification mentions rush-buy block, not unrest | Economy recovery actions |
| Last resolved strain is `critical` in Era 3 | Faction turn computes pressure | Economy pressure contributes to unrest | Existing unrest UI appears only if thresholds are crossed | Stabilization and garrison tools |
| Active normal building, enough gold, strain below high | Click `Buy now` | Gold spent; active building completes through shared helper | Panel rerenders with building complete, queue shifted, new quote | Build/unit catalog |
| Active item is `legendary:*` or wonder-classified | Open city panel | Quote rejects | Disabled reason says wonders cannot be bought | Legendary wonder panel |
| Quote was available, but state changed before click | Click old/stale button | Execution revalidates current state | Either current item buys or current disabled reason appears | Queue and catalog |

## Misleading UI Risks

- `Treasury strain` must not appear when reserves still paid the bill. Negative net gold is not strain.
- `Rush-buy blocked` must not appear at `low`; only `high` and `critical` block spending.
- `Critical strain` before Era 3 must not mention unrest pressure.
- `Free support` must not count exempt core buildings as consuming support.
- Defender support must not imply units need to stand in cities.
- Build options must show `0 upkeep` for protected items so players know the game is not secretly taxing essentials.
- Rush-buy must not leave stale buy buttons able to buy another item without rerender.
- The city panel must keep the full build and unit catalog reachable.

## Interaction Replay Checklist

- Open panel with no active production and verify no active buy button.
- Add first active item and verify a buy quote appears.
- Add second item and verify queue row plus ETA remains visible.
- Buy active item and verify panel rerenders with the next item active.
- Click the new buy button after rerender and verify it targets the new active item only.
- Reorder and remove follow-up queue items after a buy and verify visible order/ETA updates.
- Reopen panel and verify completed building/unit state plus recalculated upkeep.

## Queue And ETA Checklist

- Active item stays in the current production block.
- Follow-up items stay in the production queue block.
- ETA text remains visible for follow-up items.
- Rush-buy only completes index `0`.
- After buy, the next item starts at `0` progress unless current production completion semantics already return carryover.
- Unknown or invalid active production returns `invalid-active-item` and does not spend gold.

---

### Task 1: Economy Type Contract And Save Normalization

**Files:**
- Modify: `src/core/types.ts`
- Modify: `src/systems/economy-system.ts`
- Modify: `tests/systems/economy-system.test.ts`
- Modify: `tests/storage/save-persistence.test.ts`

- [ ] **Step 1: Read the required rules and spec**

Run:

```bash
sed -n '1,260p' .claude/rules/spec-fidelity.md
sed -n '1,260p' .claude/rules/game-systems.md
sed -n '1,260p' .claude/rules/end-to-end-wiring.md
sed -n '1,460p' docs/superpowers/specs/2026-05-20-cost-dynamics-drift-reconciliation-design.md
```

Expected: the rule files and reconciliation spec are visible. Keep the exact four-band contract and old-save normalization behavior from the spec.

- [ ] **Step 2: Add failing economy contract tests**

In `tests/systems/economy-system.test.ts`, update the import list to include the new helpers:

```ts
import {
  applyEconomyTurn,
  calculateCivEconomy,
  calculateMaintenance,
  emitEconomyStrainIfNeeded,
  getEconomyStatusForCiv,
  getRushBuyQuote,
  normalizeEconomyStatus,
} from '@/systems/economy-system';
```

Append this `describe` block:

```ts
describe('treasury strain contract', () => {
  it('uses none low high and critical strain from unpaid maintenance only', () => {
    const state = makeState();
    state.civilizations.player.gold = 20;

    expect(calculateCivEconomy(state, 'player', {
      grossGoldPerTurn: 0,
      maintenanceOverride: { buildingUpkeep: 12, unitUpkeep: 3 },
    })).toMatchObject({
      netGoldPerTurn: -15,
      unpaidMaintenance: 0,
      strainLevel: 'none',
      rushBuyDisabled: false,
    });

    state.civilizations.player.gold = 16;

    expect(calculateCivEconomy(state, 'player', {
      grossGoldPerTurn: 0,
      maintenanceOverride: { buildingUpkeep: 20, unitUpkeep: 0 },
    })).toMatchObject({
      unpaidMaintenance: 4,
      strainLevel: 'low',
      rushBuyDisabled: false,
    });

    state.civilizations.player.gold = 15;

    expect(calculateCivEconomy(state, 'player', {
      grossGoldPerTurn: 0,
      maintenanceOverride: { buildingUpkeep: 20, unitUpkeep: 0 },
    })).toMatchObject({
      unpaidMaintenance: 5,
      strainLevel: 'high',
      rushBuyDisabled: true,
    });

    state.civilizations.player.gold = 10;

    expect(calculateCivEconomy(state, 'player', {
      grossGoldPerTurn: 0,
      maintenanceOverride: { buildingUpkeep: 20, unitUpkeep: 0 },
    })).toMatchObject({
      unpaidMaintenance: 10,
      strainLevel: 'critical',
      rushBuyDisabled: true,
    });
  });

  it('normalizes missing and merged-MVP economy status safely', () => {
    const state = makeState();

    expect(getEconomyStatusForCiv({ ...state, economyStatusByCiv: undefined }, 'player').strainLevel).toBe('none');

    expect(normalizeEconomyStatus({
      civId: 'player',
      grossGoldPerTurn: 0,
      maintenanceGoldPerTurn: 0,
      netGoldPerTurn: -5,
      projectedGold: 5,
      unpaidMaintenance: 0,
      strainLevel: 'strained',
      rushBuyDisabled: false,
      breakdown: { buildingUpkeep: 0, unitUpkeep: 0, freeBuildings: 0, freeUnits: 0, paidBuildings: 0, paidUnits: 0 },
    } as any, 'player', 12)).toMatchObject({
      turn: 12,
      strainLevel: 'none',
      unpaidMaintenance: 0,
    });

    expect(normalizeEconomyStatus({
      civId: 'player',
      grossGoldPerTurn: 0,
      maintenanceGoldPerTurn: 10,
      netGoldPerTurn: -10,
      projectedGold: 0,
      unpaidMaintenance: 10,
      strainLevel: 'critical',
      rushBuyDisabled: true,
      breakdown: { buildingUpkeep: 10, unitUpkeep: 0, freeBuildings: 0, freeUnits: 0, paidBuildings: 1, paidUnits: 0 },
    } as any, 'player', 12)).toMatchObject({
      turn: 12,
      buildingMaintenance: 10,
      unitMaintenance: 0,
      strainLevel: 'critical',
    });
  });
});
```

- [ ] **Step 3: Add failing save-persistence normalization coverage**

In `tests/storage/save-persistence.test.ts`, add this import beside the other system imports:

```ts
import { normalizeEconomyStatus } from '@/systems/economy-system';
```

Append this test near the other economy/save shape tests:

```ts
it('normalizes old economy status shapes without surprising strain', () => {
  const normalized = normalizeEconomyStatus({
    civId: 'player',
    grossGoldPerTurn: 2,
    maintenanceGoldPerTurn: 6,
    netGoldPerTurn: -4,
    projectedGold: 11,
    unpaidMaintenance: 0,
    strainLevel: 'strained',
    rushBuyDisabled: false,
    breakdown: {
      buildingUpkeep: 6,
      unitUpkeep: 0,
      freeBuildings: 0,
      freeUnits: 0,
      paidBuildings: 2,
      paidUnits: 0,
    },
  } as any, 'player', 44);

  expect(normalized).toEqual({
    turn: 44,
    grossGoldIncome: 2,
    buildingMaintenance: 6,
    unitMaintenance: 0,
    netGoldPerTurn: -4,
    unpaidMaintenance: 0,
    strainLevel: 'none',
  });
});
```

- [ ] **Step 4: Run the failing contract tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/economy-system.test.ts tests/storage/save-persistence.test.ts
```

Expected: FAIL because `normalizeEconomyStatus` does not exist and the active type still uses `stable | strained | critical`.

- [ ] **Step 5: Replace economy types**

In `src/core/types.ts`, replace the current economy block with this block:

```ts
// --- Economy ---

export type TreasuryStrainLevel = 'none' | 'low' | 'high' | 'critical';
export type EconomyStrainLevel = TreasuryStrainLevel;

export interface EconomyMaintenanceBreakdown {
  buildingUpkeep: number;
  unitUpkeep: number;
  freeBuildings: number;
  freeUnits: number;
  paidBuildings: number;
  paidUnits: number;
}

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

In `GameEvents`, replace the economy event type with:

```ts
  'economy:treasury-strain': { civId: string; level: Exclude<TreasuryStrainLevel, 'none'>; netGoldPerTurn: number; unpaidMaintenance: number };
```

- [ ] **Step 6: Add compatibility result types and normalization helper**

In `src/systems/economy-system.ts`, update the economy imports:

```ts
import type {
  City,
  EconomyMaintenanceBreakdown,
  EconomyStatus,
  GameState,
  TreasuryStrainLevel,
  Unit,
  UnitType,
} from '@/core/types';
```

Add these interfaces near the top of the file, after `ECONOMY_RULES`:

```ts
export interface EconomyProjection extends EconomyStatus {
  civId: string;
  startingGold: number;
  endingGold: number;
  grossGoldPerTurn: number;
  grossGoldIncome: number;
  maintenanceGoldPerTurn: number;
  buildingMaintenance: number;
  unitMaintenance: number;
  totalMaintenance: number;
  projectedGold: number;
  rushBuyDisabled: boolean;
  breakdown: EconomyMaintenanceBreakdown;
}

interface LegacyEconomyStatus {
  civId?: string;
  grossGoldPerTurn?: number;
  grossGoldIncome?: number;
  maintenanceGoldPerTurn?: number;
  buildingMaintenance?: number;
  unitMaintenance?: number;
  netGoldPerTurn?: number;
  projectedGold?: number;
  unpaidMaintenance?: number;
  strainLevel?: string;
  rushBuyDisabled?: boolean;
  breakdown?: Partial<EconomyMaintenanceBreakdown>;
  turn?: number;
}
```

Add this helper below `getFreeGeneralUnitSlots`:

```ts
function getTreasuryStrainLevel(unpaidMaintenance: number, totalMaintenance: number): TreasuryStrainLevel {
  if (unpaidMaintenance <= 0) return 'none';
  const ratio = unpaidMaintenance / Math.max(1, totalMaintenance);
  if (unpaidMaintenance >= 10 || ratio >= 0.5) return 'critical';
  if (unpaidMaintenance >= 5 || ratio >= 0.25) return 'high';
  return 'low';
}
```

Add this exported normalization helper below the strain helper:

```ts
export function normalizeEconomyStatus(
  raw: LegacyEconomyStatus | undefined,
  civId: string,
  currentTurn: number,
): EconomyStatus {
  if (!raw) {
    return {
      turn: currentTurn,
      grossGoldIncome: 0,
      buildingMaintenance: 0,
      unitMaintenance: 0,
      netGoldPerTurn: 0,
      unpaidMaintenance: 0,
      strainLevel: 'none',
    };
  }

  const grossGoldIncome = raw.grossGoldIncome ?? raw.grossGoldPerTurn ?? 0;
  const buildingMaintenance = raw.buildingMaintenance
    ?? raw.breakdown?.buildingUpkeep
    ?? raw.maintenanceGoldPerTurn
    ?? 0;
  const unitMaintenance = raw.unitMaintenance
    ?? raw.breakdown?.unitUpkeep
    ?? 0;
  const totalMaintenance = buildingMaintenance + unitMaintenance;
  const netGoldPerTurn = raw.netGoldPerTurn ?? grossGoldIncome - totalMaintenance;
  const unpaidMaintenance = raw.unpaidMaintenance ?? 0;

  return {
    turn: raw.turn ?? currentTurn,
    grossGoldIncome,
    buildingMaintenance,
    unitMaintenance,
    netGoldPerTurn,
    unpaidMaintenance,
    strainLevel: getTreasuryStrainLevel(unpaidMaintenance, totalMaintenance),
  };
}
```

- [ ] **Step 7: Update economy calculations to return projection-compatible status**

Replace the current private `getStrainLevel` function with `getTreasuryStrainLevel` from Step 6.

Change `calculateCivEconomy` return type to `EconomyProjection`, and return both old-compatible computed aliases and new compact fields:

```ts
export function calculateCivEconomy(
  state: GameState,
  civId: string,
  options: CalculateCivEconomyOptions = {},
): EconomyProjection {
  const civ = state.civilizations[civId];
  const grossGoldIncome = options.grossGoldPerTurn ?? projectCivGrossGold(state, civId);
  const baseBreakdown = calculateMaintenance(state, civId);
  const breakdown = {
    ...baseBreakdown,
    buildingUpkeep: options.maintenanceOverride?.buildingUpkeep ?? baseBreakdown.buildingUpkeep,
    unitUpkeep: options.maintenanceOverride?.unitUpkeep ?? baseBreakdown.unitUpkeep,
  };
  const buildingMaintenance = breakdown.buildingUpkeep;
  const unitMaintenance = breakdown.unitUpkeep;
  const totalMaintenance = buildingMaintenance + unitMaintenance;
  const netGoldPerTurn = grossGoldIncome - totalMaintenance;
  const startingGold = civ?.gold ?? 0;
  const endingGold = Math.max(0, startingGold + netGoldPerTurn);
  const unpaidMaintenance = Math.max(0, totalMaintenance - (startingGold + grossGoldIncome));
  const strainLevel = getTreasuryStrainLevel(unpaidMaintenance, totalMaintenance);

  return {
    civId,
    turn: state.turn,
    startingGold,
    endingGold,
    grossGoldPerTurn: grossGoldIncome,
    grossGoldIncome,
    maintenanceGoldPerTurn: totalMaintenance,
    buildingMaintenance,
    unitMaintenance,
    totalMaintenance,
    netGoldPerTurn,
    projectedGold: endingGold,
    unpaidMaintenance,
    strainLevel,
    rushBuyDisabled: strainLevel === 'high' || strainLevel === 'critical',
    breakdown,
  };
}
```

- [ ] **Step 8: Store compact resolved status**

Add this helper in `src/systems/economy-system.ts`:

```ts
function toResolvedEconomyStatus(result: EconomyProjection): EconomyStatus {
  return {
    turn: result.turn,
    grossGoldIncome: result.grossGoldIncome,
    buildingMaintenance: result.buildingMaintenance,
    unitMaintenance: result.unitMaintenance,
    netGoldPerTurn: result.netGoldPerTurn,
    unpaidMaintenance: result.unpaidMaintenance,
    strainLevel: result.strainLevel,
  };
}
```

Replace the `economyStatusByCiv` assignment inside `applyEconomyTurn` with:

```ts
    economyStatusByCiv: {
      ...(state.economyStatusByCiv ?? {}),
      [civId]: toResolvedEconomyStatus(status),
    },
```

Update `getEconomyStatusForCiv` to return normalized resolved status:

```ts
export function getEconomyStatusForCiv(state: GameState, civId: string): EconomyStatus {
  return normalizeEconomyStatus(state.economyStatusByCiv?.[civId] as any, civId, state.turn);
}
```

- [ ] **Step 9: Update strain event emission**

Replace `emitEconomyStrainIfNeeded` with:

```ts
export function emitEconomyStrainIfNeeded(
  previous: EconomyStatus | undefined,
  current: EconomyStatus,
  bus: EventBus,
  civId: string,
): void {
  if (current.strainLevel === 'none') return;
  const previousStatus = normalizeEconomyStatus(previous as any, civId, current.turn);
  if (
    previousStatus.strainLevel === current.strainLevel
    && previousStatus.unpaidMaintenance === current.unpaidMaintenance
    && previousStatus.turn === current.turn
  ) {
    return;
  }
  bus.emit('economy:treasury-strain', {
    civId,
    level: current.strainLevel,
    netGoldPerTurn: current.netGoldPerTurn,
    unpaidMaintenance: current.unpaidMaintenance,
  });
}
```

- [ ] **Step 10: Update direct test expectations from old names**

In the existing tests in `tests/systems/economy-system.test.ts`, replace:

```ts
expect(status.strainLevel).toBe('critical');
expect(status.rushBuyDisabled).toBe(true);
```

with the same assertions; these remain valid. Replace any old `'stable'` expectation with `'none'` and any old `'strained'` expectation with the correct new band from unpaid maintenance.

Replace existing `emitEconomyStrainIfNeeded` calls:

```ts
emitEconomyStrainIfNeeded(undefined, status, bus);
emitEconomyStrainIfNeeded(status, status, bus);
```

with:

```ts
emitEconomyStrainIfNeeded(undefined, status, bus, 'player');
emitEconomyStrainIfNeeded(status, status, bus, 'player');
```

In `tests/core/turn-manager.test.ts`, replace:

```ts
expect(status!.netGoldPerTurn).toBe(status!.grossGoldPerTurn - status!.maintenanceGoldPerTurn);
expect(result.civilizations.player.gold).toBe(status!.projectedGold);
```

with:

```ts
expect(status!.netGoldPerTurn).toBe(status!.grossGoldIncome - status!.buildingMaintenance - status!.unitMaintenance);
expect(result.civilizations.player.gold).toBe(Math.max(0, 20 + status!.netGoldPerTurn));
```

- [ ] **Step 11: Run contract tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/economy-system.test.ts tests/storage/save-persistence.test.ts tests/core/turn-manager.test.ts
```

Expected: PASS for the updated economy contract, normalization, and turn-manager shape.

- [ ] **Step 12: Commit Task 1**

Run:

```bash
git add src/core/types.ts src/systems/economy-system.ts tests/systems/economy-system.test.ts tests/storage/save-persistence.test.ts tests/core/turn-manager.test.ts
git commit -m "fix(economy): restore treasury strain contract"
```

Expected: commit succeeds.

---

### Task 2: Maintenance Breakdown Rows And Basic-First Support Priority

**Files:**
- Modify: `src/systems/economy-system.ts`
- Modify: `tests/systems/economy-system.test.ts`

- [ ] **Step 1: Add failing support-priority tests**

In `tests/systems/economy-system.test.ts`, update the imports:

```ts
import {
  applyEconomyTurn,
  calculateCityBuildingMaintenance,
  calculateCivEconomy,
  calculateCivUnitMaintenance,
  calculateMaintenance,
  emitEconomyStrainIfNeeded,
  getEconomyStatusForCiv,
  getRushBuyQuote,
  normalizeEconomyStatus,
} from '@/systems/economy-system';
```

Add this helper after `addUnits`:

```ts
function addUnitOfType(state: GameState, type: Parameters<typeof createUnit>[0], id: string): void {
  const unit = createUnit(type, 'player', { q: state.cities.capital.position.q + 1, r: state.cities.capital.position.r }, state.idCounters);
  unit.id = id;
  state.units[id] = unit;
  state.civilizations.player.units.push(id);
}
```

Append this `describe` block:

```ts
describe('support assignment priority', () => {
  it('protects basic buildings before advanced high-upkeep buildings', () => {
    const state = makeState();
    city(state).population = 1;
    city(state).maturity = 'outpost';
    city(state).buildings = [
      'herbalist',
      'workshop',
      'shrine',
      'barracks',
      'library',
      'granary',
      'marketplace',
      'forum',
      'temple',
      'forge',
      'observatory',
      'security-bureau',
    ];

    const maintenance = calculateCityBuildingMaintenance(state, 'capital');

    expect(maintenance.freeSupport).toBe(4);
    expect(maintenance.exemptBuildings.map(row => row.id)).toEqual([
      'herbalist',
      'workshop',
      'shrine',
      'barracks',
      'library',
      'granary',
    ]);
    expect(maintenance.supportedBuildings.map(row => row.id)).toEqual([
      'marketplace',
      'forum',
      'temple',
      'forge',
    ]);
    expect(maintenance.paidBuildings.map(row => row.id)).toEqual([
      'observatory',
      'security-bureau',
    ]);
    expect(maintenance.upkeep).toBe(4);
  });

  it('assigns free defender slots to basic defenders before advanced specialists regardless of position', () => {
    const state = makeState();
    addUnitOfType(state, 'war_hound', 'war-hound');
    addUnitOfType(state, 'shadow_warden', 'shadow-warden');
    addUnitOfType(state, 'musketeer', 'musketeer');
    addUnitOfType(state, 'swordsman', 'swordsman');
    addUnitOfType(state, 'pikeman', 'pikeman');
    addUnitOfType(state, 'warrior', 'warrior-extra');
    addUnitOfType(state, 'warrior', 'warrior');
    addUnitOfType(state, 'archer', 'archer');

    const maintenance = calculateCivUnitMaintenance(state, 'player');

    expect(maintenance.defenderSlots).toBe(2);
    expect(maintenance.freeDefenderUnits.map(row => row.id)).toEqual(['archer', 'warrior']);
    expect(maintenance.paidUnits.map(row => row.id)).toContain('war-hound');
    expect(maintenance.paidUnits.map(row => row.id)).toContain('shadow-warden');
  });
});
```

- [ ] **Step 2: Run the failing support tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/economy-system.test.ts
```

Expected: FAIL because `calculateCityBuildingMaintenance` and `calculateCivUnitMaintenance` do not exist.

- [ ] **Step 3: Add maintenance row types**

In `src/systems/economy-system.ts`, add after `EconomyProjection`:

```ts
export type MaintenanceReason = 'exempt' | 'free-support' | 'free-defender' | 'paid';

export interface MaintenanceRow {
  id: string;
  label: string;
  upkeep: number;
  reason: MaintenanceReason;
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
```

- [ ] **Step 4: Replace policy data with priority-aware policy**

In `ECONOMY_RULES`, replace `advancedBuildingUpkeep`, `advancedUnitTypes`, `criticalDeficitThreshold`, and `criticalTreasuryThreshold` with this data:

```ts
  buildingUpkeep: {
    default: 1,
    advanced: 2,
  },
  advancedBuildingIds: new Set([
    'forge',
    'observatory',
    'harbor',
    'amphitheater',
    'security-bureau',
    'intelligence-agency',
  ]),
  unitUpkeep: {
    default: 1,
    advanced: 2,
  },
  advancedUnitTypes: new Set<UnitType>([
    'swordsman',
    'pikeman',
    'musketeer',
    'galley',
    'trireme',
    'spy_scout',
    'spy_informant',
    'spy_agent',
    'spy_operative',
    'spy_hacker',
    'scout_hound',
    'shadow_warden',
    'war_hound',
  ]),
  specialistUnitTypes: new Set<UnitType>([
    'galley',
    'trireme',
    'spy_scout',
    'spy_informant',
    'spy_agent',
    'spy_operative',
    'spy_hacker',
    'scout_hound',
    'shadow_warden',
    'war_hound',
  ]),
  basicDefenderTypes: new Set<UnitType>(['warrior', 'archer']),
  defenderSlotsPerCity: 2,
  strainThresholds: {
    highUnpaidMaintenance: 5,
    highUnpaidRatio: 0.25,
    criticalUnpaidMaintenance: 10,
    criticalUnpaidRatio: 0.5,
  },
```

Then update `getBuildingUpkeep`, `getUnitUpkeep`, and `getTreasuryStrainLevel` to use the new properties:

```ts
function getBuildingUpkeep(buildingId: string): number {
  if (ECONOMY_RULES.coreFreeBuildings.has(buildingId)) return 0;
  return ECONOMY_RULES.advancedBuildingIds.has(buildingId)
    ? ECONOMY_RULES.buildingUpkeep.advanced
    : ECONOMY_RULES.buildingUpkeep.default;
}

function getUnitUpkeep(unitType: UnitType): number {
  if (ECONOMY_RULES.freeUnitTypes.has(unitType)) return 0;
  return ECONOMY_RULES.advancedUnitTypes.has(unitType)
    ? ECONOMY_RULES.unitUpkeep.advanced
    : ECONOMY_RULES.unitUpkeep.default;
}

function getTreasuryStrainLevel(unpaidMaintenance: number, totalMaintenance: number): TreasuryStrainLevel {
  if (unpaidMaintenance <= 0) return 'none';
  const ratio = unpaidMaintenance / Math.max(1, totalMaintenance);
  if (
    unpaidMaintenance >= ECONOMY_RULES.strainThresholds.criticalUnpaidMaintenance
    || ratio >= ECONOMY_RULES.strainThresholds.criticalUnpaidRatio
  ) {
    return 'critical';
  }
  if (
    unpaidMaintenance >= ECONOMY_RULES.strainThresholds.highUnpaidMaintenance
    || ratio >= ECONOMY_RULES.strainThresholds.highUnpaidRatio
  ) {
    return 'high';
  }
  return 'low';
}
```

- [ ] **Step 5: Add labels and priority sorters**

In `src/systems/economy-system.ts`, add these helpers below upkeep helpers:

```ts
function getBuildingLabel(buildingId: string): string {
  return BUILDINGS[buildingId]?.name ?? buildingId;
}

function getUnitLabel(unit: Unit): string {
  return UNIT_DEFINITIONS[unit.type]?.name ?? unit.type;
}

function getBuildingMaintenancePriority(buildingId: string): number {
  if (ECONOMY_RULES.coreFreeBuildings.has(buildingId)) return 0;
  const building = BUILDINGS[buildingId];
  if (building?.pacing?.band === 'starter') return 1;
  if (building?.category === 'food' || building?.category === 'production' || building?.category === 'economy') return 2;
  if (ECONOMY_RULES.advancedBuildingIds.has(buildingId)) return 4;
  return 3;
}

function getUnitMaintenancePriority(unit: Unit): number {
  if (ECONOMY_RULES.freeUnitTypes.has(unit.type)) return 0;
  if (ECONOMY_RULES.basicDefenderTypes.has(unit.type)) return 1;
  if (!ECONOMY_RULES.specialistUnitTypes.has(unit.type) && (UNIT_DEFINITIONS[unit.type]?.strength ?? 0) > 0) return 2;
  if (ECONOMY_RULES.advancedUnitTypes.has(unit.type)) return 3;
  return 4;
}

function compareBuildingSupportCandidates(
  left: { id: string; upkeep: number },
  right: { id: string; upkeep: number },
): number {
  const priorityDelta = getBuildingMaintenancePriority(left.id) - getBuildingMaintenancePriority(right.id);
  if (priorityDelta !== 0) return priorityDelta;
  if (left.upkeep !== right.upkeep) return left.upkeep - right.upkeep;
  return left.id.localeCompare(right.id);
}

function compareUnitSupportCandidates(left: Unit, right: Unit): number {
  const priorityDelta = getUnitMaintenancePriority(left) - getUnitMaintenancePriority(right);
  if (priorityDelta !== 0) return priorityDelta;
  const upkeepDelta = getUnitUpkeep(left.type) - getUnitUpkeep(right.type);
  if (upkeepDelta !== 0) return upkeepDelta;
  return left.id.localeCompare(right.id);
}
```

- [ ] **Step 6: Implement city building breakdown**

Add this exported helper before `calculateMaintenance`:

```ts
export function calculateCityBuildingMaintenance(state: GameState, cityId: string): CityBuildingMaintenance {
  const city = state.cities[cityId];
  if (!city) {
    return { cityId, freeSupport: 0, supportUsed: 0, upkeep: 0, exemptBuildings: [], supportedBuildings: [], paidBuildings: [], rows: [] };
  }

  const freeSupport = getFreeBuildingSlots(city);
  const exemptBuildings: MaintenanceRow[] = [];
  const candidates: MaintenanceRow[] = [];

  for (const buildingId of city.buildings) {
    if (!BUILDINGS[buildingId]) continue;
    if (ECONOMY_RULES.coreFreeBuildings.has(buildingId)) {
      exemptBuildings.push({ id: buildingId, label: getBuildingLabel(buildingId), upkeep: 0, reason: 'exempt' });
      continue;
    }
    candidates.push({
      id: buildingId,
      label: getBuildingLabel(buildingId),
      upkeep: getBuildingUpkeep(buildingId),
      reason: 'paid',
    });
  }

  candidates.sort(compareBuildingSupportCandidates);

  const supportedBuildings = candidates.slice(0, freeSupport).map(row => ({ ...row, upkeep: 0, reason: 'free-support' as const }));
  const paidBuildings = candidates.slice(freeSupport).map(row => ({ ...row, reason: 'paid' as const }));
  const upkeep = paidBuildings.reduce((sum, row) => sum + row.upkeep, 0);

  return {
    cityId,
    freeSupport,
    supportUsed: supportedBuildings.length,
    upkeep,
    exemptBuildings,
    supportedBuildings,
    paidBuildings,
    rows: [...exemptBuildings, ...supportedBuildings, ...paidBuildings],
  };
}
```

- [ ] **Step 7: Implement civ unit breakdown**

Add this exported helper below `calculateCityBuildingMaintenance`:

```ts
export function calculateCivUnitMaintenance(state: GameState, civId: string): CivUnitMaintenance {
  const civ = state.civilizations[civId];
  if (!civ) {
    return {
      civId,
      freeSupport: 0,
      supportUsed: 0,
      defenderSlots: 0,
      defenderSlotsUsed: 0,
      upkeep: 0,
      exemptUnits: [],
      freeDefenderUnits: [],
      supportedUnits: [],
      paidUnits: [],
      rows: [],
    };
  }

  const cities = civ.cities.map(cityId => state.cities[cityId]).filter((city): city is City => Boolean(city));
  const units = civ.units.map(unitId => state.units[unitId]).filter((unit): unit is Unit => Boolean(unit));
  const exemptUnitIds = new Set<string>();
  const exemptUnits: MaintenanceRow[] = [];

  for (const unit of units) {
    if (ECONOMY_RULES.freeUnitTypes.has(unit.type)) {
      exemptUnitIds.add(unit.id);
      exemptUnits.push({ id: unit.id, label: getUnitLabel(unit), upkeep: 0, reason: 'exempt' });
    }
  }

  const defenderSlots = cities.length * ECONOMY_RULES.defenderSlotsPerCity;
  const combatUnits = units
    .filter(unit => !exemptUnitIds.has(unit.id) && (UNIT_DEFINITIONS[unit.type]?.strength ?? 0) > 0)
    .sort(compareUnitSupportCandidates);
  const freeDefenderUnits = combatUnits.slice(0, defenderSlots).map(unit => ({
    id: unit.id,
    label: getUnitLabel(unit),
    upkeep: 0,
    reason: 'free-defender' as const,
  }));

  const freeUnitIds = new Set([...exemptUnitIds, ...freeDefenderUnits.map(row => row.id)]);
  const freeSupport = getFreeGeneralUnitSlots(cities);
  const supportCandidates = units
    .filter(unit => !freeUnitIds.has(unit.id))
    .sort(compareUnitSupportCandidates);
  const supportedUnits = supportCandidates.slice(0, freeSupport).map(unit => ({
    id: unit.id,
    label: getUnitLabel(unit),
    upkeep: 0,
    reason: 'free-support' as const,
  }));

  for (const row of supportedUnits) freeUnitIds.add(row.id);

  const paidUnits = units
    .filter(unit => !freeUnitIds.has(unit.id))
    .sort(compareUnitSupportCandidates)
    .map(unit => ({
      id: unit.id,
      label: getUnitLabel(unit),
      upkeep: getUnitUpkeep(unit.type),
      reason: 'paid' as const,
    }));
  const upkeep = paidUnits.reduce((sum, row) => sum + row.upkeep, 0);

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
    rows: [...exemptUnits, ...freeDefenderUnits, ...supportedUnits, ...paidUnits],
  };
}
```

- [ ] **Step 8: Refactor aggregate maintenance to use breakdown helpers**

Replace the body of `calculateMaintenance` with:

```ts
export function calculateMaintenance(state: GameState, civId: string): EconomyMaintenanceBreakdown {
  const civ = state.civilizations[civId];
  if (!civ) {
    return {
      buildingUpkeep: 0,
      unitUpkeep: 0,
      freeBuildings: 0,
      freeUnits: 0,
      paidBuildings: 0,
      paidUnits: 0,
    };
  }

  const cityBreakdowns = civ.cities.map(cityId => calculateCityBuildingMaintenance(state, cityId));
  const unitBreakdown = calculateCivUnitMaintenance(state, civId);

  return {
    buildingUpkeep: cityBreakdowns.reduce((sum, breakdown) => sum + breakdown.upkeep, 0),
    unitUpkeep: unitBreakdown.upkeep,
    freeBuildings: cityBreakdowns.reduce(
      (sum, breakdown) => sum + breakdown.exemptBuildings.length + breakdown.supportedBuildings.length,
      0,
    ),
    freeUnits: unitBreakdown.exemptUnits.length + unitBreakdown.freeDefenderUnits.length + unitBreakdown.supportedUnits.length,
    paidBuildings: cityBreakdowns.reduce((sum, breakdown) => sum + breakdown.paidBuildings.length, 0),
    paidUnits: unitBreakdown.paidUnits.length,
  };
}
```

- [ ] **Step 9: Run support-priority tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/economy-system.test.ts
```

Expected: PASS. Keep the expected order from Step 1 by encoding explicit priority policy in `getBuildingMaintenancePriority`; do not weaken the test to match the old highest-upkeep-first behavior.

- [ ] **Step 10: Commit Task 2**

Run:

```bash
git add src/systems/economy-system.ts tests/systems/economy-system.test.ts
git commit -m "fix(economy): prioritize basic free support"
```

Expected: commit succeeds.

---

### Task 3: Canonical Rush-Buy Execution Helper

**Files:**
- Modify: `src/systems/economy-system.ts`
- Modify: `src/main.ts`
- Modify: `tests/systems/economy-system.test.ts`

- [ ] **Step 1: Add failing rush-buy execution tests**

In `tests/systems/economy-system.test.ts`, update imports:

```ts
import {
  applyEconomyTurn,
  calculateCityBuildingMaintenance,
  calculateCivEconomy,
  calculateCivUnitMaintenance,
  calculateMaintenance,
  emitEconomyStrainIfNeeded,
  getEconomyStatusForCiv,
  getRushBuyQuote,
  normalizeEconomyStatus,
  rushBuyActiveProduction,
} from '@/systems/economy-system';
```

Append this `describe` block:

```ts
describe('rush buy execution', () => {
  it('buys the active building through shared completion and shifts the queue', () => {
    const state = makeState();
    state.civilizations.player.gold = 100;
    city(state).productionQueue = ['workshop', 'warrior'];
    city(state).productionProgress = 2;
    const bus = new EventBus();
    const buildingComplete = vi.fn();
    bus.on('city:building-complete', buildingComplete);

    const result = rushBuyActiveProduction(state, 'player', 'capital', bus);

    expect(result).toMatchObject({ success: true, itemId: 'workshop', cost: 25 });
    expect(result.state!.civilizations.player.gold).toBe(75);
    expect(result.state!.cities.capital.buildings).toContain('workshop');
    expect(result.state!.cities.capital.productionQueue).toEqual(['warrior']);
    expect(result.state!.cities.capital.productionProgress).toBe(0);
    expect(buildingComplete).toHaveBeenCalledWith({ cityId: 'capital', buildingId: 'workshop' });
    expect(state.civilizations.player.gold).toBe(100);
  });

  it('buys the active unit through shared completion and creates the unit', () => {
    const state = makeState();
    state.civilizations.player.gold = 100;
    city(state).productionQueue = ['warrior'];
    city(state).productionProgress = 0;
    const bus = new EventBus();
    const unitTrained = vi.fn();
    bus.on('city:unit-trained', unitTrained);

    const result = rushBuyActiveProduction(state, 'player', 'capital', bus);

    expect(result.success).toBe(true);
    expect(result.state!.cities.capital.productionQueue).toEqual([]);
    expect(Object.values(result.state!.units).some(unit => unit.type === 'warrior' && unit.owner === 'player')).toBe(true);
    expect(unitTrained).toHaveBeenCalledWith({ cityId: 'capital', unitType: 'warrior' });
  });

  it('uses matching disabled reasons for quote and execution and preserves state on failure', () => {
    const state = makeState();
    state.civilizations.player.gold = 100;
    city(state).productionQueue = ['legendary:pyramids'];
    const bus = new EventBus();

    const quote = getRushBuyQuote(state, 'player', 'capital');
    const result = rushBuyActiveProduction(state, 'player', 'capital', bus);

    expect(quote).toMatchObject({ available: false, reason: 'wonders-cannot-be-bought' });
    expect(result).toMatchObject({ success: false, reason: 'wonders-cannot-be-bought' });
    expect(result.state).toBe(state);
    expect(state.civilizations.player.gold).toBe(100);
  });

  it('rejects not-owner, insufficient gold, and high strain without spending gold', () => {
    const bus = new EventBus();

    const notOwner = makeState();
    notOwner.civilizations.player.gold = 100;
    notOwner.cities.capital.owner = 'ai-1';
    notOwner.cities.capital.productionQueue = ['workshop'];
    expect(rushBuyActiveProduction(notOwner, 'player', 'capital', bus)).toMatchObject({
      success: false,
      reason: 'not-owner',
    });

    const poor = makeState();
    poor.civilizations.player.gold = 1;
    poor.cities.capital.productionQueue = ['workshop'];
    expect(rushBuyActiveProduction(poor, 'player', 'capital', bus)).toMatchObject({
      success: false,
      reason: 'not-enough-gold',
    });
    expect(poor.civilizations.player.gold).toBe(1);

    const highStrain = makeState();
    highStrain.civilizations.player.gold = 23;
    highStrain.cities.capital.productionQueue = ['workshop'];
    for (let index = 0; index < 36; index++) {
      addUnitOfType(highStrain, 'warrior', `strain-warrior-${index}`);
    }
    const result = rushBuyActiveProduction(highStrain, 'player', 'capital', bus);
    expect(result.success).toBe(false);
    expect(result.reason).toBe('treasury-strain-too-high');
  });
});
```

- [ ] **Step 2: Run failing rush-buy tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/economy-system.test.ts
```

Expected: FAIL because `rushBuyActiveProduction` does not exist and `getRushBuyQuote` still accepts `(state, cityId)`.

- [ ] **Step 3: Add stable rush-buy reason/result types**

In `src/systems/economy-system.ts`, replace `RushBuyQuote.reason: string | null` with stable reasons:

```ts
export type RushBuyDisabledReason =
  | 'no-active-production'
  | 'invalid-active-item'
  | 'not-owner'
  | 'not-enough-gold'
  | 'treasury-strain-too-high'
  | 'wonders-cannot-be-bought';

export interface RushBuyQuote {
  available: boolean;
  itemId: string | null;
  cost: number;
  reason: RushBuyDisabledReason | null;
  message: string | null;
  status: EconomyProjection;
}

export type RushBuyResult =
  | { success: true; state: GameState; itemId: string; label: string; cost: number }
  | { success: false; state: GameState; reason: RushBuyDisabledReason; message: string };
```

- [ ] **Step 4: Update quote signature and disabled reasons**

Change `getRushBuyQuote` signature to:

```ts
export function getRushBuyQuote(state: GameState, civId: string, cityId: string): RushBuyQuote {
```

Replace its body with:

```ts
  const city = state.cities[cityId];
  const civ = state.civilizations[civId];
  const ownerStatus = calculateCivEconomy(state, civId);

  if (!city || !civ) {
    return { available: false, itemId: null, cost: 0, reason: 'invalid-active-item', message: 'This production item cannot be bought.', status: ownerStatus };
  }

  if (city.owner !== civId) {
    return { available: false, itemId: null, cost: 0, reason: 'not-owner', message: 'Only the owner can buy production.', status: ownerStatus };
  }

  const itemId = city.productionQueue[0] ?? null;
  if (!itemId) {
    return { available: false, itemId: null, cost: 0, reason: 'no-active-production', message: 'No active production to buy.', status: ownerStatus };
  }

  if (itemId.startsWith('legendary:')) {
    return { available: false, itemId, cost: 0, reason: 'wonders-cannot-be-bought', message: 'Wonders cannot be bought.', status: ownerStatus };
  }

  if (ownerStatus.strainLevel === 'high' || ownerStatus.strainLevel === 'critical') {
    return {
      available: false,
      itemId,
      cost: 0,
      reason: 'treasury-strain-too-high',
      message: 'Treasury strain is too high.',
      status: ownerStatus,
    };
  }

  const civDef = resolveCivDefinition(state, civ.civType ?? '');
  const cost = getProductionCostForItem(itemId, { city, bonusEffect: civDef?.bonusEffect, era: state.era });
  if (cost <= 0) {
    return { available: false, itemId, cost: 0, reason: 'invalid-active-item', message: 'This production item cannot be bought.', status: ownerStatus };
  }

  const remainingProduction = Math.max(1, cost - city.productionProgress);
  const rushCost = Math.ceil(remainingProduction * ECONOMY_RULES.rushBuyMultiplier);
  if (civ.gold < rushCost) {
    return {
      available: false,
      itemId,
      cost: rushCost,
      reason: 'not-enough-gold',
      message: `Not enough gold: need ${rushCost}.`,
      status: ownerStatus,
    };
  }

  return { available: true, itemId, cost: rushCost, reason: null, message: null, status: ownerStatus };
}
```

- [ ] **Step 5: Implement rush-buy execution**

Update imports in `src/systems/economy-system.ts`:

```ts
import { BUILDINGS, completeCityProductionItem, getProductionCostForItem, TRAINABLE_UNITS } from './city-system';
import { createUnit, UNIT_DEFINITIONS } from './unit-system';
import { createSpyFromUnit, isSpyUnitType } from './espionage-system';
```

Add this helper near the quote functions:

```ts
function getProductionLabel(itemId: string): string {
  return BUILDINGS[itemId]?.name
    ?? TRAINABLE_UNITS.find(unit => unit.type === itemId)?.name
    ?? itemId;
}
```

Add this function below `getRushBuyQuote`:

```ts
export function rushBuyActiveProduction(
  state: GameState,
  civId: string,
  cityId: string,
  bus: EventBus,
): RushBuyResult {
  const quote = getRushBuyQuote(state, civId, cityId);
  if (!quote.available || !quote.itemId) {
    return {
      success: false,
      state,
      reason: quote.reason ?? 'invalid-active-item',
      message: quote.message ?? 'This production item cannot be bought.',
    };
  }

  const city = state.cities[cityId];
  const civ = state.civilizations[civId];
  if (!city || !civ || city.owner !== civId) {
    return { success: false, state, reason: 'not-owner', message: 'Only the owner can buy production.' };
  }

  const completion = completeCityProductionItem(city, quote.itemId);
  const nextCiv = { ...civ, gold: civ.gold - quote.cost, units: [...civ.units] };
  if (nextCiv.gold < 0) {
    return { success: false, state, reason: 'not-enough-gold', message: `Not enough gold: need ${quote.cost}.` };
  }

  let nextState: GameState = {
    ...state,
    cities: {
      ...state.cities,
      [cityId]: completion.city,
    },
    civilizations: {
      ...state.civilizations,
      [civId]: nextCiv,
    },
    units: { ...state.units },
    espionage: state.espionage ? { ...state.espionage } : state.espionage,
  };

  if (completion.completedBuilding) {
    bus.emit('city:building-complete', { cityId, buildingId: completion.completedBuilding });
  }

  if (completion.completedUnit) {
    const civDef = resolveCivDefinition(nextState, civ.civType ?? '');
    const newUnit = createUnit(completion.completedUnit, civId, city.position, nextState.idCounters, civDef?.bonusEffect);
    nextState.units = { ...nextState.units, [newUnit.id]: newUnit };
    nextState.civilizations = {
      ...nextState.civilizations,
      [civId]: {
        ...nextState.civilizations[civId],
        units: [...nextState.civilizations[civId].units, newUnit.id],
      },
    };
    bus.emit('city:unit-trained', { cityId, unitType: completion.completedUnit });

    if (isSpyUnitType(completion.completedUnit) && nextState.espionage?.[civId]) {
      const { state: updatedEspionage, spy } = createSpyFromUnit(
        nextState.espionage[civId],
        newUnit.id,
        civId,
        completion.completedUnit,
        `spy-unit-${newUnit.id}-${nextState.turn}`,
      );
      nextState.espionage = {
        ...nextState.espionage,
        [civId]: updatedEspionage,
      };
      bus.emit('espionage:spy-recruited', { civId, spy });
    }
  }

  const status = calculateCivEconomy(nextState, civId);
  nextState = {
    ...nextState,
    economyStatusByCiv: {
      ...(nextState.economyStatusByCiv ?? {}),
      [civId]: toResolvedEconomyStatus(status),
    },
  };

  return {
    success: true,
    state: nextState,
    itemId: quote.itemId,
    label: getProductionLabel(quote.itemId),
    cost: quote.cost,
  };
}
```

- [ ] **Step 6: Replace inline rush-buy mutation in main**

In `src/main.ts`, change the economy import:

```ts
import { calculateCivEconomy, formatGoldHudText, formatMaintenanceTooltip, getRushBuyQuote, rushBuyActiveProduction } from '@/systems/economy-system';
```

Remove these now-unused imports if TypeScript reports them unused:

```ts
completeCityProductionItem
BUILDINGS
TRAINABLE_UNITS
createUnit
createSpyFromUnit
isSpyUnitType
```

Replace the `onRushBuyActiveProduction` callback body with:

```ts
    onRushBuyActiveProduction: (cityId) => {
      const targetCity = gameState.cities[cityId];
      if (!targetCity) return gameState;
      const result = rushBuyActiveProduction(gameState, gameState.currentPlayer, cityId, bus);
      if (!result.success) {
        showNotification(result.message, 'warning');
        return gameState;
      }

      gameState = result.state;
      renderLoop.setGameState(gameState);
      updateHUD();
      showNotification(`${targetCity.name}: rush bought ${result.label} for ${result.cost} gold.`, 'success');
      return gameState;
    },
```

- [ ] **Step 7: Update quote call sites**

Replace all calls:

```ts
getRushBuyQuote(state, city.id)
getRushBuyQuote(gameState, cityId)
```

with:

```ts
getRushBuyQuote(state, state.currentPlayer, city.id)
getRushBuyQuote(gameState, gameState.currentPlayer, cityId)
```

In `src/ui/city-panel.ts`, use the current player as the acting civilization so not-owner validation remains real:

```ts
const rushBuyQuote = getRushBuyQuote(state, state.currentPlayer, city.id);
```

In tests, use:

```ts
getRushBuyQuote(state, 'player', 'capital')
```

- [ ] **Step 8: Run rush-buy tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/economy-system.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit Task 3**

Run:

```bash
git add src/systems/economy-system.ts src/main.ts tests/systems/economy-system.test.ts
git commit -m "fix(economy): centralize rush buy execution"
```

Expected: commit succeeds.

---

### Task 4: Turn Manager, Notifications, And Unrest Gating

**Files:**
- Modify: `src/core/turn-manager.ts`
- Modify: `src/systems/faction-system.ts`
- Modify: `src/ui/notification-routing.ts`
- Modify: `tests/core/turn-manager.test.ts`
- Modify: `tests/systems/faction-system.test.ts`
- Create: `tests/ui/notification-routing.test.ts`

- [ ] **Step 1: Add failing turn-manager and notification tests**

In `tests/core/turn-manager.test.ts`, add this test near existing economy tests:

```ts
it('emits high treasury strain and stores compact economy status', () => {
  const state = createNewGame(undefined, 'turn-economy-high', 'small');
  const bus = new EventBus();
  const listener = vi.fn();
  bus.on('economy:treasury-strain', listener);
  const city = foundCity('player', { q: 2, r: 2 }, state.map, state.idCounters);
  city.id = 'capital';
  city.population = 1;
  city.workedTiles = [];
  city.productionQueue = [];
  state.cities = { capital: city };
  state.civilizations.player.cities = ['capital'];
  state.civilizations.player.units = [];
  state.units = {};
  state.civilizations.player.gold = 23;
  for (let index = 0; index < 36; index++) {
    const unit = createUnit('warrior', 'player', city.position, state.idCounters);
    state.units[unit.id] = unit;
    state.civilizations.player.units.push(unit.id);
  }

  const result = processTurn(state, bus);
  const status = result.economyStatusByCiv?.player;

  expect(status).toEqual(expect.objectContaining({
    turn: state.turn,
    strainLevel: 'high',
    unpaidMaintenance: expect.any(Number),
  }));
  expect(status).not.toHaveProperty('rushBuyDisabled');
  expect(status).not.toHaveProperty('breakdown');
  expect(listener).toHaveBeenCalledWith(expect.objectContaining({ civId: 'player', level: 'high' }));
});
```

Create `tests/ui/notification-routing.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { createNewGame } from '@/core/game-state';
import { routeEconomyTreasuryStrain } from '@/ui/notification-routing';

describe('economy notification routing', () => {
  it('routes high strain as a rush-buy block without city spam', () => {
    const state = createNewGame(undefined, 'notify-high', 'small');
    const sink = vi.fn();

    routeEconomyTreasuryStrain(state, {
      civId: 'player',
      level: 'high',
      netGoldPerTurn: -6,
      unpaidMaintenance: 6,
    }, sink);

    expect(sink).toHaveBeenCalledTimes(1);
    expect(sink).toHaveBeenCalledWith('player', expect.stringContaining('Rush-buy is unavailable'), 'warning');
  });

  it('does not mention unrest for critical strain before Era 3', () => {
    const state = createNewGame(undefined, 'notify-critical-era2', 'small');
    state.era = 2;
    const sink = vi.fn();

    routeEconomyTreasuryStrain(state, {
      civId: 'player',
      level: 'critical',
      netGoldPerTurn: -12,
      unpaidMaintenance: 12,
    }, sink);

    expect(sink.mock.calls[0][1]).toContain('Critical treasury strain');
    expect(sink.mock.calls[0][1]).not.toMatch(/unrest/i);
  });

  it('mentions unrest pressure for critical strain from Era 3 onward', () => {
    const state = createNewGame(undefined, 'notify-critical-era3', 'small');
    state.era = 3;
    const sink = vi.fn();

    routeEconomyTreasuryStrain(state, {
      civId: 'player',
      level: 'critical',
      netGoldPerTurn: -12,
      unpaidMaintenance: 12,
    }, sink);

    expect(sink.mock.calls[0][1]).toContain('unrest pressure');
  });
});
```

- [ ] **Step 2: Add failing unrest negative tests**

In `tests/systems/faction-system.test.ts`, replace the current two economy strain tests with:

```ts
it('ignores critical treasury strain before Era 3 so the early game stays forgiving', () => {
  const state = makeState({ era: 2 });
  state.economyStatusByCiv = {
    player: {
      turn: state.turn - 1,
      grossGoldIncome: 0,
      buildingMaintenance: 0,
      unitMaintenance: 30,
      netGoldPerTurn: -30,
      unpaidMaintenance: 30,
      strainLevel: 'critical',
    },
  };

  expect(computeUnrestPressure('city-1', state)).toBe(0);
});

it('adds treasury strain pressure in Era 3 only for critical strain', () => {
  const critical = makeState({ era: 3 });
  critical.economyStatusByCiv = {
    player: {
      turn: critical.turn - 1,
      grossGoldIncome: 0,
      buildingMaintenance: 0,
      unitMaintenance: 30,
      netGoldPerTurn: -30,
      unpaidMaintenance: 30,
      strainLevel: 'critical',
    },
  };

  const high = makeState({ era: 3 });
  high.economyStatusByCiv = {
    player: {
      turn: high.turn - 1,
      grossGoldIncome: 0,
      buildingMaintenance: 20,
      unitMaintenance: 0,
      netGoldPerTurn: -20,
      unpaidMaintenance: 5,
      strainLevel: 'high',
    },
  };

  const low = makeState({ era: 3 });
  low.economyStatusByCiv = {
    player: {
      turn: low.turn - 1,
      grossGoldIncome: 0,
      buildingMaintenance: 20,
      unitMaintenance: 0,
      netGoldPerTurn: -20,
      unpaidMaintenance: 4,
      strainLevel: 'low',
    },
  };

  expect(computeUnrestPressure('city-1', critical)).toBe(20);
  expect(computeUnrestPressure('city-1', high)).toBe(0);
  expect(computeUnrestPressure('city-1', low)).toBe(0);
});
```

- [ ] **Step 3: Run failing turn/notification/faction tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/core/turn-manager.test.ts tests/systems/faction-system.test.ts tests/ui/notification-routing.test.ts
```

Expected: FAIL before implementation because turn manager does not emit high strain, faction pressure still includes non-critical economy pressure, or notification copy does not match the new era-aware wording.

- [ ] **Step 4: Update turn manager event emission call**

In `src/core/turn-manager.ts`, update the economy emission call from:

```ts
emitEconomyStrainIfNeeded(previousEconomyStatusByCiv[civId], newState.economyStatusByCiv![civId], bus);
```

to:

```ts
emitEconomyStrainIfNeeded(previousEconomyStatusByCiv[civId], newState.economyStatusByCiv![civId], bus, civId);
```

Search `src/core/turn-manager.ts` for old compact-status field reads:

```bash
rg -n "grossGoldPerTurn|maintenanceGoldPerTurn|projectedGold|rushBuyDisabled|breakdown" src/core/turn-manager.ts
```

Expected: no matches against `EconomyStatus` values. Replace any match with `grossGoldIncome`, `buildingMaintenance + unitMaintenance`, `Math.max(0, civ.gold + netGoldPerTurn)`, or a fresh `calculateCivEconomy(...)` projection as required by the surrounding code.

- [ ] **Step 5: Update faction pressure gating**

In `src/systems/faction-system.ts`, make sure the economy import is:

```ts
import { getEconomyStatusForCiv } from './economy-system';
```

Inside `computeUnrestPressure`, replace the current economy pressure block with:

```ts
  if (state.era >= 3) {
    const economy = getEconomyStatusForCiv(state, owner);
    if (economy.strainLevel === 'critical') {
      pressure += Math.min(MAX_PRESSURE_ECONOMY, 12 + economy.unpaidMaintenance * 2);
    }
  }
```

Do not add pressure for `low` or `high`.

- [ ] **Step 6: Update notification routing copy**

In `src/ui/notification-routing.ts`, replace `routeEconomyTreasuryStrain` with:

```ts
export function routeEconomyTreasuryStrain(
  state: GameState,
  event: GameEvents['economy:treasury-strain'],
  sink: NotificationSink,
): void {
  const civ = state.civilizations[event.civId];
  if (!civ) return;

  if (event.level === 'low') {
    sink(
      event.civId,
      `Treasury strain: ${event.unpaidMaintenance} maintenance went unpaid. Rush-buy is still available if you can afford it.`,
      'warning',
    );
    return;
  }

  if (event.level === 'high') {
    sink(
      event.civId,
      `Treasury strain is high (${event.netGoldPerTurn}/turn). Rush-buy is unavailable until the budget recovers.`,
      'warning',
    );
    return;
  }

  const unrestNote = state.era >= 3
    ? ' This increases unrest pressure until the budget recovers.'
    : '';
  sink(
    event.civId,
    `Critical treasury strain (${event.netGoldPerTurn}/turn). Rush-buy is unavailable.${unrestNote}`,
    'warning',
  );
}
```

- [ ] **Step 7: Run tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/core/turn-manager.test.ts tests/systems/faction-system.test.ts tests/ui/notification-routing.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit Task 4**

Run:

```bash
git add src/core/turn-manager.ts src/systems/faction-system.ts src/ui/notification-routing.ts tests/core/turn-manager.test.ts tests/systems/faction-system.test.ts tests/ui/notification-routing.test.ts
git commit -m "fix(economy): gate strain unrest and notifications"
```

Expected: commit succeeds.

---

### Task 5: HUD Formatting And Projection Copy

**Files:**
- Modify: `src/systems/economy-system.ts`
- Modify: `src/main.ts`
- Modify: `tests/systems/economy-system.test.ts`

- [ ] **Step 1: Add failing HUD formatter tests**

In `tests/systems/economy-system.test.ts`, add `formatGoldHudText` to the existing economy-system import list:

```ts
import {
  applyEconomyTurn,
  calculateCityBuildingMaintenance,
  calculateCivEconomy,
  calculateCivUnitMaintenance,
  calculateMaintenance,
  emitEconomyStrainIfNeeded,
  formatGoldHudText,
  getEconomyStatusForCiv,
  getRushBuyQuote,
  normalizeEconomyStatus,
  rushBuyActiveProduction,
} from '@/systems/economy-system';
```

Append to `tests/systems/economy-system.test.ts`:

```ts
describe('gold HUD text', () => {
  it('shows projected net gold and strain labels', () => {
    expect(formatGoldHudText({
      turn: 1,
      grossGoldIncome: 5,
      buildingMaintenance: 0,
      unitMaintenance: 0,
      netGoldPerTurn: 5,
      unpaidMaintenance: 0,
      strainLevel: 'none',
    }, 42)).toBe('42 (+5 net)');

    expect(formatGoldHudText({
      turn: 1,
      grossGoldIncome: 0,
      buildingMaintenance: 20,
      unitMaintenance: 0,
      netGoldPerTurn: -20,
      unpaidMaintenance: 4,
      strainLevel: 'low',
    }, 42)).toBe('42 (-20 net) · Treasury strain');

    expect(formatGoldHudText({
      turn: 1,
      grossGoldIncome: 0,
      buildingMaintenance: 20,
      unitMaintenance: 0,
      netGoldPerTurn: -20,
      unpaidMaintenance: 5,
      strainLevel: 'high',
    }, 42)).toBe('42 (-20 net) · Rush-buy blocked');

    expect(formatGoldHudText({
      turn: 1,
      grossGoldIncome: 0,
      buildingMaintenance: 20,
      unitMaintenance: 0,
      netGoldPerTurn: -20,
      unpaidMaintenance: 10,
      strainLevel: 'critical',
    }, 42)).toBe('42 (-20 net) · Critical strain');
  });
});
```

- [ ] **Step 2: Run failing HUD test**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/economy-system.test.ts
```

Expected: FAIL because `formatGoldHudText` still uses `/turn` and no strain label.

- [ ] **Step 3: Update HUD formatter**

Replace `formatGoldHudText` in `src/systems/economy-system.ts` with:

```ts
export function formatGoldHudText(status: EconomyStatus | EconomyProjection, currentGold: number): string {
  const sign = status.netGoldPerTurn >= 0 ? '+' : '';
  const base = `${currentGold} (${sign}${status.netGoldPerTurn} net)`;
  if (status.strainLevel === 'critical') return `${base} · Critical strain`;
  if (status.strainLevel === 'high') return `${base} · Rush-buy blocked`;
  if (status.strainLevel === 'low') return `${base} · Treasury strain`;
  return base;
}
```

- [ ] **Step 4: Keep HUD using current projection**

In `src/main.ts`, confirm `updateHUD` computes:

```ts
const economyStatus = calculateCivEconomy(gameState, civ.id);
goldSpan.textContent = `💰 ${formatGoldHudText(economyStatus, civ.gold)}`;
```

If `updateHUD` reads resolved `economyStatusByCiv`, replace that read with `calculateCivEconomy(gameState, civ.id)` so the HUD updates immediately from current state.

- [ ] **Step 5: Run HUD tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/economy-system.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit Task 5**

Run:

```bash
git add src/systems/economy-system.ts src/main.ts tests/systems/economy-system.test.ts
git commit -m "fix(ui): label projected treasury strain"
```

Expected: commit succeeds.

---

### Task 6: City Panel Support, Future Upkeep, And Rush-Buy UX

**Files:**
- Modify: `src/ui/city-panel.ts`
- Modify: `tests/ui/city-panel.test.ts`

- [ ] **Step 1: Read UI rules**

Run:

```bash
sed -n '1,260p' .claude/rules/ui-panels.md
sed -n '1,260p' docs/superpowers/plans/README.md
```

Expected: confirm dynamic text uses `textContent`, buttons have touch-friendly styling, panel rerenders after mutations, and catalogs stay reachable.

- [ ] **Step 2: Add failing visible UI tests**

In `tests/ui/city-panel.test.ts`, add these tests near the current maintenance/rush-buy tests:

```ts
it('shows free support, paid upkeep, and future upkeep without hiding build choices', () => {
  const { container, city, state } = makeMultiCityFixture();
  city.population = 1;
  city.buildings = [
    'herbalist',
    'workshop',
    'shrine',
    'barracks',
    'library',
    'granary',
    'marketplace',
    'forum',
    'temple',
    'forge',
    'observatory',
    'security-bureau',
  ];

  const panel = createCityPanel(container, city, state, {
    onBuild: () => {},
    onOpenWonderPanel: () => {},
    onClose: () => {},
  });

  const text = collectText(panel);
  expect(text).toContain('Free support');
  expect(text).toContain('Paid upkeep');
  expect(text).toContain('gold/turn');
  expect(text).toContain('0 upkeep');
  expect(text).toContain('Build');
  expect(text).toContain('Units');
  expect(panel.querySelectorAll('.build-item').length).toBeGreaterThan(0);
});

it('rerenders after rush-buy so the next active item and ETA are visible', () => {
  const { container, city, state } = makeMultiCityFixture();
  city.productionQueue = ['workshop', 'warrior'];
  city.productionProgress = 2;
  state.civilizations[state.currentPlayer].gold = 100;
  const onRushBuyActiveProduction = vi.fn((cityId: string) => {
    const updatedCity = {
      ...state.cities[cityId],
      buildings: [...state.cities[cityId].buildings, 'workshop'],
      productionQueue: ['warrior'],
      productionProgress: 0,
    };
    state.civilizations[state.currentPlayer].gold = 75;
    state.cities[cityId] = updatedCity;
    return state;
  });

  const panel = createCityPanel(container, city, state, {
    onBuild: () => {},
    onRushBuyActiveProduction,
    onOpenWonderPanel: () => {},
    onClose: () => {},
  });

  const button = panel.querySelector<HTMLButtonElement>('[data-rush-buy]');
  expect(button?.textContent).toContain('Buy now');
  clickElement(button);

  const refreshed = container.querySelector<HTMLElement>('#city-panel');
  expect(refreshed).toBeTruthy();
  const text = collectText(refreshed!);
  expect(text).toContain('Workshop');
  expect(text).toContain('Warrior');
  expect(text).toContain('turns remaining');
  expect(onRushBuyActiveProduction).toHaveBeenCalledWith(city.id);
});

it('shows explicit rush-buy disabled reason for wonders', () => {
  const { container, city, state } = makeMultiCityFixture();
  city.productionQueue = ['legendary:pyramids'];

  const panel = createCityPanel(container, city, state, {
    onBuild: () => {},
    onRushBuyActiveProduction: () => state,
    onOpenWonderPanel: () => {},
    onClose: () => {},
  });

  expect(collectText(panel)).toContain('Wonders cannot be bought');
});

it('shows treasury strain disabled reason without hiding the queue', () => {
  const { container, city, state } = makeMultiCityFixture();
  city.productionQueue = ['workshop', 'warrior'];
  city.productionProgress = 2;
  state.civilizations[state.currentPlayer].gold = 23;
  state.civilizations[state.currentPlayer].units = [];
  state.units = {};
  for (let index = 0; index < 36; index++) {
    const unit = createUnit('warrior', state.currentPlayer, city.position, state.idCounters);
    state.units[unit.id] = unit;
    state.civilizations[state.currentPlayer].units.push(unit.id);
  }

  const panel = createCityPanel(container, city, state, {
    onBuild: () => {},
    onRushBuyActiveProduction: () => state,
    onOpenWonderPanel: () => {},
    onClose: () => {},
  });

  const text = collectText(panel);
  expect(text).toContain('Treasury strain is too high');
  expect(text).toContain('Warrior');
  expect(panel.querySelector<HTMLButtonElement>('[data-rush-buy]')?.disabled).toBe(true);
});
```

Place these tests inside the existing `describe('city-panel navigation', ...)` block, where `makeMultiCityFixture` is already defined.

- [ ] **Step 3: Run failing UI tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/city-panel.test.ts
```

Expected: FAIL because the panel still renders `Maintenance: -0/turn`, not `Free support` and `Paid upkeep`, and the button copy still says `Rush buy`.

- [ ] **Step 4: Update city-panel imports and helpers**

In `src/ui/city-panel.ts`, replace the economy import with:

```ts
import {
  calculateCityBuildingMaintenance,
  calculateCivEconomy,
  formatMaintenanceTooltip,
  getRushBuyQuote,
  type RushBuyDisabledReason,
} from '@/systems/economy-system';
```

Add this helper near the top of the file:

```ts
function getRushBuyReasonText(reason: RushBuyDisabledReason | null): string {
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

- [ ] **Step 5: Compute city maintenance and future upkeep**

Inside `createCityPanel`, after `economyStatus`:

```ts
  const cityMaintenance = calculateCityBuildingMaintenance(state, city.id);
```

Change the quote call to:

```ts
  const rushBuyQuote = getRushBuyQuote(state, state.currentPlayer, city.id);
```

Add a helper inside `createCityPanel`:

```ts
  const getFutureBuildingUpkeep = (buildingId: string): number => {
    const futureCity = city.buildings.includes(buildingId)
      ? city
      : { ...city, buildings: [...city.buildings, buildingId] };
    const futureState = {
      ...state,
      cities: {
        ...state.cities,
        [city.id]: futureCity,
      },
    };
    const row = calculateCityBuildingMaintenance(futureState, city.id).rows.find(candidate => candidate.id === buildingId);
    return row?.upkeep ?? 0;
  };
```

- [ ] **Step 6: Render built building upkeep**

In the `buildingPlaceholders` loop, before appending HTML:

```ts
      const upkeep = cityMaintenance.rows.find(row => row.id === bid)?.upkeep ?? 0;
```

Change the building placeholder line to include upkeep:

```ts
        <strong data-text="bldg-name-${idx}"></strong> - <span data-text="bldg-desc-${idx}"></span>${upkeep > 0 ? ` · ${upkeep} gold/turn` : ''}
```

Use a normal hyphen, not an em dash.

- [ ] **Step 7: Render future upkeep on build options**

In the `availableBuildings` loop, add:

```ts
    const futureUpkeep = getFutureBuildingUpkeep(b.id);
    const upkeepText = futureUpkeep > 0 ? `${futureUpkeep} gold/turn` : '0 upkeep';
```

Change the build item detail line from:

```ts
      <div style="font-size:11px;opacity:0.7;">${yieldStr}${turns} turns</div>
```

to:

```ts
      <div style="font-size:11px;opacity:0.7;">${yieldStr}${turns} turns · ${upkeepText}</div>
```

- [ ] **Step 8: Replace maintenance summary markup**

Replace the current maintenance summary block:

```ts
    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:16px;font-size:12px;color:#d9d3c0;">
      <span title="" data-maintenance-summary>Maintenance: -${economyStatus.maintenanceGoldPerTurn}/turn</span>
      <span>Net treasury: ${economyStatus.netGoldPerTurn >= 0 ? '+' : ''}${economyStatus.netGoldPerTurn}/turn</span>
      ${economyStatus.strainLevel !== 'stable' ? '<span style="color:#d9a25c;" data-text="economy-strain"></span>' : ''}
    </div>
```

with:

```ts
    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:16px;font-size:12px;color:#d9d3c0;">
      <span title="" data-maintenance-summary>Free support: ${cityMaintenance.supportUsed}/${cityMaintenance.freeSupport} buildings</span>
      <span>Paid upkeep: ${cityMaintenance.upkeep} gold/turn</span>
      <span>Net treasury: ${economyStatus.netGoldPerTurn >= 0 ? '+' : ''}${economyStatus.netGoldPerTurn}/turn</span>
      ${economyStatus.strainLevel !== 'none' ? '<span style="color:#d9a25c;" data-text="economy-strain"></span>' : ''}
    </div>
```

- [ ] **Step 9: Update rush-buy button copy and reason**

Replace:

```ts
    const rushBuyLabel = rushBuyQuote.cost > 0 ? `Rush buy (${rushBuyQuote.cost} gold)` : 'Rush buy';
```

with:

```ts
    const rushBuyLabel = rushBuyQuote.available && rushBuyQuote.cost > 0 ? `Buy now: ${rushBuyQuote.cost} gold` : 'Buy now';
```

Replace the reason setter:

```ts
    if (rushBuyQuote.reason) {
      setText('rush-reason', rushBuyQuote.reason);
    }
```

with:

```ts
    if (rushBuyQuote.reason) {
      setText('rush-reason', getRushBuyReasonText(rushBuyQuote.reason));
    }
```

Replace the title setter:

```ts
    if (rushButton && rushBuyQuote.reason) rushButton.title = rushBuyQuote.reason;
```

with:

```ts
    if (rushButton && rushBuyQuote.reason) rushButton.title = getRushBuyReasonText(rushBuyQuote.reason);
```

- [ ] **Step 10: Ensure panel rerender uses returned state**

Find the rush-buy button event listener. It should look like:

```ts
      const nextState = callbacks.onRushBuyActiveProduction?.(city.id);
      rerenderPanel(nextState);
```

If it only calls the callback without rerendering, replace it with the snippet above.

- [ ] **Step 11: Run city panel tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/city-panel.test.ts
```

Expected: PASS.

- [ ] **Step 12: Commit Task 6**

Run:

```bash
git add src/ui/city-panel.ts tests/ui/city-panel.test.ts
git commit -m "fix(ui): explain upkeep and rush buy state"
```

Expected: commit succeeds.

---

### Task 7: Final Regression Sweep And Review

**Files:**
- Review and, when verification exposes a real defect, modify one or more of:
  - `src/core/types.ts`
  - `src/systems/economy-system.ts`
  - `src/core/turn-manager.ts`
  - `src/systems/faction-system.ts`
  - `src/ui/notification-routing.ts`
  - `src/ui/city-panel.ts`
  - `src/main.ts`
  - `tests/systems/economy-system.test.ts`
  - `tests/core/turn-manager.test.ts`
  - `tests/systems/faction-system.test.ts`
  - `tests/ui/notification-routing.test.ts`
  - `tests/ui/city-panel.test.ts`
  - `tests/storage/save-persistence.test.ts`

- [ ] **Step 1: Run source rule checks**

Run:

```bash
scripts/check-src-rule-violations.sh src/core/types.ts src/systems/economy-system.ts src/core/turn-manager.ts src/systems/faction-system.ts src/ui/notification-routing.ts src/ui/city-panel.ts src/main.ts
```

Expected: PASS. The city-panel rush-buy button must keep a style with `background`, `color`, and `min-height:44px` so the UI hook stays green.

- [ ] **Step 2: Run targeted test suite**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/economy-system.test.ts tests/core/turn-manager.test.ts tests/systems/faction-system.test.ts tests/ui/notification-routing.test.ts tests/ui/city-panel.test.ts tests/storage/save-persistence.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run build**

Run:

```bash
./scripts/run-with-mise.sh yarn build
```

Expected: PASS. This is required because `yarn test` does not type-check.

- [ ] **Step 4: Run full test suite**

Run:

```bash
./scripts/run-with-mise.sh yarn test
```

Expected: PASS.

- [ ] **Step 5: Inspect branch and working-tree diffs**

Run:

```bash
git diff --stat origin/main...HEAD
git diff --stat
git diff origin/main...HEAD -- src tests docs/superpowers
```

Expected:

- Source changes are limited to economy contract, economy resolver, turn manager, faction pressure, notification routing, HUD/city panel wiring, and tests.
- `git diff --stat` is empty before final status.
- Plan/spec docs are the only docs changed.

- [ ] **Step 6: Manual playability review checklist**

Inspect the final diff and verify:

- Early-game essentials stay free: core buildings, settlers, workers, scouts, two defenders per city.
- Negative net gold with reserves does not create strain.
- `low` warns but does not block rush-buy.
- `high` and `critical` block rush-buy with visible reasons.
- Critical strain before Era 3 does not mention or apply unrest.
- Critical strain from Era 3 onward contributes unrest pressure.
- Build options show future upkeep, including `0 upkeep`.
- City panel still exposes all build and unit items.
- Rush-buy never buys wonders, `legendary:*`, or follow-up queue entries.
- Rush-buy execution no longer mutates state inline in `main.ts`.
- Saved old-shape economy status cannot surprise the player with false high/critical consequences.

- [ ] **Step 7: Commit verification fixes**

If verification required changes, stage the known reconciliation files:

```bash
git add src/core/types.ts src/systems/economy-system.ts src/core/turn-manager.ts src/systems/faction-system.ts src/ui/notification-routing.ts src/ui/city-panel.ts src/main.ts tests/systems/economy-system.test.ts tests/core/turn-manager.test.ts tests/systems/faction-system.test.ts tests/ui/notification-routing.test.ts tests/ui/city-panel.test.ts tests/storage/save-persistence.test.ts
git commit -m "fix(economy): address reconciliation regressions"
```

If no verification changes were needed, do not create an empty commit.

## Final Self-Review Checklist For Implementer

- Spec coverage: every section in `2026-05-20-cost-dynamics-drift-reconciliation-design.md` maps to a task above.
- No old active labels: no gameplay code or tests still expect `stable` or `strained` except normalization tests for legacy shape.
- Data correctness: compact saved status has `turn`, `grossGoldIncome`, `buildingMaintenance`, `unitMaintenance`, `netGoldPerTurn`, `unpaidMaintenance`, and `strainLevel`.
- Logic correctness: strain is based on unpaid maintenance; reserves can absorb negative net turns.
- Playability: kids can build likely-needed infrastructure and two defenders per city without penalty.
- UI clarity: HUD says `net`; city panel says `Free support`, `Paid upkeep`, future upkeep, and exact rush-buy disabled reasons.
- UX safety: open city panel rerenders after buy; stale buttons cannot double-buy.
- Architecture: rush-buy mutation lives in `src/systems/economy-system.ts`, not inline in `src/main.ts`.
- Regression coverage: system, turn, faction, notification, city panel, and save persistence tests cover the drift.
- Final verification: source rule checks, targeted tests, build, full tests, and diff review have all been run.
