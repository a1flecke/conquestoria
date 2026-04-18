# Espionage Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a complete, era-progressive espionage system: physical spy units that move on the map, attempt infiltration, execute missions from inside cities, and interact with detection units, counter-espionage, and a full capture/interrogation system.

**Architecture:** Spy units are physical `Unit` instances in `state.units` sharing their `id` with `Spy` records in `state.espionage`. While on the map the unit moves normally; on successful infiltration the unit is *removed* from `state.units` and the `Spy` record tracks the in-city state. Detection happens through other spy units and scout-hound units (not automatic). Complexity scales by era: era 1 is a single roll; era 5 has the full stack. Each MR ships standalone user value and must pass the full test suite before merge.

**Tech Stack:** TypeScript, Vitest, Canvas 2D, Vite

---

## Deliverable MRs

| # | Title | User-Facing Value |
|---|-------|-------------------|
| 1 | Physical Spy Units + Panel Privacy | Build spy units in cities; see them on the map; locked panel content hidden |
| 2 | Detection System | Scout Hound units and Garrison Patrol buildings detect traveling spies |
| 3 | Disguise System | Traveling spies can disguise as common unit types |
| 4 | Infiltration System | Spy units infiltrate enemy cities with % chance; city tile visible while inside |
| 5 | Mission System | Issue and resolve missions from inside enemy cities; cooldowns scale with difficulty |
| 6 | Capture — Expel / Execute / Interrogate | Caught spies trigger a meaningful three-way choice; interrogate reveals intel |
| 7 | Counter-Espionage Embedding | Embed spies in own cities for active counter-espionage sweeps |
| 8 | Per-Era Types + Universal Unit Upgrade | Five spy unit tiers; obsolete units upgradeable at half cost |
| 9 | Espionage Buildings | Safehouse, Intelligence Agency, Security Bureau |
| 10 | Civ-Unique Detection Units | Unique detection units replace Scout Hound for specific civs |

---

## Full File Map

| File | Change |
|------|--------|
| `src/core/types.ts` | `UnitType` union; `SpyStatus`; new `Spy` fields; `DisguiseType`; `InterrogationRecord`; `BuildingCategory`; `UnitDefinition.spyDetectionChance` |
| `src/systems/unit-system.ts` | `UNIT_DEFINITIONS` + `UNIT_DESCRIPTIONS` for all spy and detection unit types |
| `src/systems/city-system.ts` | `TRAINABLE_UNITS` with `obsoletedByTech`; all new buildings; `applyProductionBonus` for safehouse; `getTrainableUnitsForCiv` helper |
| `src/systems/espionage-system.ts` | Major overhaul: `createSpyFromUnit`, `attemptInfiltration`, `expelSpy`, `executeSpy`, `startInterrogation`, `processInterrogation`, `setDisguise`, `embedSpy`, `attemptSweep`; fix `createEspionageCivState` maxSpies; steal-tech deduplication |
| `src/systems/detection-system.ts` | **New.** Spy detection logic: `processDetection`, `getSpyDetectionChance`, `applyPassiveBaselineDetection` |
| `src/systems/espionage-stealth.ts` | **New.** `getVisibleUnitsForPlayer` — filters spy units by viewer perspective |
| `src/systems/unit-upgrade-system.ts` | **New.** `queueUnitUpgrade`, `processUnitUpgrades`, upgrade cost rules |
| `src/core/turn-manager.ts` | Wire spy creation; `processDetection`; `processInterrogation`; `processUnitUpgrades`; city-vision decrement; passive detection during cooldown |
| `src/renderer/render-loop.ts` | Apply `getVisibleUnitsForPlayer`; draw infiltrated-spy indicators on cities |
| `src/renderer/unit-renderer.ts` | Icons for all new unit types |
| `src/ui/espionage-panel.ts` | Privacy fix; mission selection with % shown; capture verdict modal; interrogation progress |
| `src/ui/selected-unit-info.ts` | Infiltrate, Embed, Set Disguise actions; upgrade prompt |
| `src/ui/city-panel.ts` | Hide obsolete units; show upgrade prompt for obsolete units in city |
| `src/main.ts` | Wire all new spy action callbacks |
| `src/ai/basic-ai.ts` | Queue spy units in city production; move spy units toward targets; AI infiltration/mission logic |
| `tests/systems/espionage-system.test.ts` | Updated throughout |
| `tests/systems/espionage-infiltration.test.ts` | **New.** Infiltration, mission, cooldown |
| `tests/systems/espionage-capture.test.ts` | **New.** Expel, execute, interrogate |
| `tests/systems/espionage-stealth.test.ts` | **New.** Detection and disguise |
| `tests/systems/detection-system.test.ts` | **New.** Scout hound, passive baseline |
| `tests/systems/unit-upgrade.test.ts` | **New.** Upgrade system |
| `tests/ui/espionage-panel.test.ts` | Updated throughout |
| `tests/integration/spy-lifecycle.test.ts` | **New.** Full train→move→infiltrate→mission→capture flow |

---

## Era Progression Overview

| Era | Spy Unit | Detection Unit | New Mechanics |
|-----|----------|----------------|---------------|
| 1 | `spy_scout` (Scout Agent) | — | Move, single-roll infiltrate+scout, embed |
| 2 | `spy_informant` (Informant) | `scout_hound` | Disguise (barbarian), two-phase missions, cooldowns, expel |
| 3 | `spy_agent` (Field Agent) | — | More disguise options, sabotage/steal missions, interrogate |
| 4 | `spy_operative` (Operative) | — | Execute, full disguise menu, assassination/forgery missions |
| 5 | `spy_hacker` (Cyber Operative) | — | Passive detection risk during cooldown, digital warfare |

---

## MR 1 — Physical Spy Units + Panel Privacy

### Task 1: Core Type Changes

**Files:**
- Modify: `src/core/types.ts`

- [ ] **Step 1: Write failing type tests**

Add to `tests/systems/espionage-system.test.ts`:

```typescript
import type { UnitType, SpyStatus, DisguiseType } from '@/core/types';

describe('core type additions MR1', () => {
  it('spy_scout is a valid UnitType', () => {
    const t: UnitType = 'spy_scout';
    expect(t).toBe('spy_scout');
  });

  it('SpyStatus does not include traveling (movement is now physical)', () => {
    const validStatuses: SpyStatus[] = ['idle','stationed','embedded','on_mission','cooldown','captured','interrogated'];
    expect(validStatuses).not.toContain('traveling');
  });

  it('DisguiseType union is defined', () => {
    const d: DisguiseType = 'barbarian';
    expect(d).toBe('barbarian');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
yarn test tests/systems/espionage-system.test.ts
```

Expected: TypeScript compile errors on unknown types.

- [ ] **Step 3: Apply type changes to `src/core/types.ts`**

Replace line 195 (`UnitType`):
```typescript
export type UnitType =
  | 'settler' | 'worker' | 'scout' | 'warrior' | 'archer'
  | 'swordsman' | 'pikeman' | 'musketeer' | 'galley' | 'trireme'
  | 'spy_scout' | 'spy_informant' | 'spy_agent' | 'spy_operative' | 'spy_hacker'
  | 'scout_hound';
```

Replace line 440 (`SpyStatus`) — remove `'traveling'`, add new states:
```typescript
export type SpyStatus =
  | 'idle'         // unit is on the map, available
  | 'stationed'    // infiltrated enemy city, off map
  | 'embedded'     // inside own city doing counter-espionage
  | 'on_mission'   // running a mission, off map
  | 'cooldown'     // between missions or after expulsion, may be on map
  | 'captured'     // caught, awaiting verdict
  | 'interrogated';// being held for interrogation
```

Add `DisguiseType` near the spy types:
```typescript
export type DisguiseType = 'barbarian' | 'warrior' | 'scout' | 'archer' | 'worker';
```

Add fields to `Spy` interface (after `feedsFalseIntel`):
```typescript
  disguiseAs?: DisguiseType | null;
  infiltrationCityId?: string | null;  // city spy is currently inside
  cityVisionTurnsLeft?: number;        // turns of full city-tile vision remaining
  cooldownMode?: 'stay_low' | 'passive_observe';
  stolenTechFrom?: Record<string, string[]>; // civId -> techIds already stolen
```

Add `BuildingCategory` — add `'espionage'` to the union on line 229:
```typescript
export type BuildingCategory = 'production' | 'food' | 'science' | 'economy' | 'military' | 'culture' | 'espionage';
```

Add `spyDetectionChance` to `UnitDefinition` interface (after `productionCost`):
```typescript
  spyDetectionChance?: number; // 0–1, probability per adjacent spy unit per turn
```

Add new `InterrogationRecord` and `InterrogationIntel` interfaces after `DetectedSpyThreat`:
```typescript
export type InterrogationIntelType =
  | 'spy_identity' | 'city_location' | 'production_queue'
  | 'wonder_in_progress' | 'map_area' | 'tech_hint';

export interface InterrogationIntel {
  type: InterrogationIntelType;
  data: Record<string, unknown>;
}

export interface InterrogationRecord {
  id: string;
  spyId: string;
  spyOwner: string;
  turnsRemaining: number;
  extractedIntel: InterrogationIntel[];
}
```

Add `activeInterrogations` and `recentDetections` to `EspionageCivState` (line ~504):
```typescript
  activeInterrogations?: Record<string, InterrogationRecord>;
  recentDetections?: Array<{ position: HexCoord; turn: number; wasDisguised: boolean }>;
```

Add `TRAINABLE_UNITS` entry extension — add `obsoletedByTech` to the type used by city-system. Since `TRAINABLE_UNITS` is defined in `city-system.ts` with an inline array type, we add an exported interface in `types.ts`:
```typescript
export interface TrainableUnitEntry {
  type: UnitType;
  name: string;
  cost: number;
  techRequired?: string;
  obsoletedByTech?: string;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
yarn test tests/systems/espionage-system.test.ts
```

Expected: type tests pass; expect some breakage in tests that reference `'traveling'` status — those will be fixed in subsequent steps.

- [ ] **Step 5: Fix references to `'traveling'` status**

Search and update any code that uses `spy.status === 'traveling'` or `SpyStatus` comparisons that include `'traveling'`. In `src/systems/espionage-system.ts`, the `processSpyTurn` function handles `'traveling' → 'stationed'`. Since movement is now physical, **delete** the `'traveling'` branch entirely. In `main.ts`, find any `assignSpy` calls from the panel and remove/update them (the "Assign" flow is replaced by physical movement + Infiltrate in MR 4).

- [ ] **Step 6: Commit**

```bash
git add src/core/types.ts tests/systems/espionage-system.test.ts
git commit -m "feat(espionage): core type additions — spy unit types, revised SpyStatus, DisguiseType, interrogation records"
```

---

### Task 2: Unit Definitions and TRAINABLE_UNITS

**Files:**
- Modify: `src/systems/unit-system.ts`
- Modify: `src/systems/city-system.ts`
- Modify: `src/renderer/unit-renderer.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { TRAINABLE_UNITS } from '@/systems/city-system';
import { UNIT_DEFINITIONS, UNIT_DESCRIPTIONS } from '@/systems/unit-system';

describe('spy unit definitions', () => {
  const SPY_TYPES = ['spy_scout','spy_informant','spy_agent','spy_operative','spy_hacker'] as const;

  for (const t of SPY_TYPES) {
    it(`UNIT_DEFINITIONS has entry for ${t}`, () => {
      expect(UNIT_DEFINITIONS[t]).toBeDefined();
    });
    it(`UNIT_DESCRIPTIONS has entry for ${t}`, () => {
      expect(UNIT_DESCRIPTIONS[t]).toBeTruthy();
    });
  }

  it('spy_scout is in TRAINABLE_UNITS with espionage-scouting', () => {
    const e = TRAINABLE_UNITS.find(u => u.type === 'spy_scout')!;
    expect(e.techRequired).toBe('espionage-scouting');
    expect(e.obsoletedByTech).toBe('espionage-informants');
  });

  it('spy_informant is obsoleted by spy-networks', () => {
    const e = TRAINABLE_UNITS.find(u => u.type === 'spy_informant')!;
    expect(e.obsoletedByTech).toBe('spy-networks');
  });

  it('getTrainableUnitsForCiv hides spy_scout when espionage-informants researched', () => {
    const { getTrainableUnitsForCiv } = await import('@/systems/city-system');
    const visible = getTrainableUnitsForCiv(['espionage-scouting','espionage-informants']);
    const types = visible.map(u => u.type);
    expect(types).not.toContain('spy_scout');
    expect(types).toContain('spy_informant');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
yarn test tests/systems/espionage-system.test.ts
```

Expected: all new tests fail with missing definitions.

- [ ] **Step 3: Add unit definitions to `src/systems/unit-system.ts`**

In `UNIT_DEFINITIONS` after the existing entries:

```typescript
spy_scout: {
  type: 'spy_scout', name: 'Scout Agent',
  movementPoints: 2, visionRange: 2, strength: 3,
  canFoundCity: false, canBuildImprovements: false, productionCost: 30,
},
spy_informant: {
  type: 'spy_informant', name: 'Informant',
  movementPoints: 2, visionRange: 2, strength: 4,
  canFoundCity: false, canBuildImprovements: false, productionCost: 50,
},
spy_agent: {
  type: 'spy_agent', name: 'Field Agent',
  movementPoints: 3, visionRange: 3, strength: 5,
  canFoundCity: false, canBuildImprovements: false, productionCost: 70,
},
spy_operative: {
  type: 'spy_operative', name: 'Operative',
  movementPoints: 3, visionRange: 3, strength: 6,
  canFoundCity: false, canBuildImprovements: false, productionCost: 90,
},
spy_hacker: {
  type: 'spy_hacker', name: 'Cyber Operative',
  movementPoints: 2, visionRange: 2, strength: 5,
  canFoundCity: false, canBuildImprovements: false, productionCost: 110,
},
scout_hound: {
  type: 'scout_hound', name: 'Scout Hound',
  movementPoints: 3, visionRange: 3, strength: 8,
  canFoundCity: false, canBuildImprovements: false, productionCost: 45,
  spyDetectionChance: 0.35,
},
```

In `UNIT_DESCRIPTIONS`:

```typescript
spy_scout: 'Lightly trained scout agent. Move to an enemy city and attempt to infiltrate. Era 1: infiltration and scouting resolve in one action.',
spy_informant: 'Experienced informant. Infiltrates cities for multi-turn intelligence operations. Unlocks disguise.',
spy_agent: 'Skilled field operative. Conducts sabotage, tech theft, and disruption missions.',
spy_operative: 'Elite spy. Capable of high-stakes operations — assassination, forgery, arms smuggling.',
spy_hacker: 'Cyber operative. Remote and digital warfare missions; hardest to detect.',
scout_hound: 'Detection unit. Patrols territory and has a 35% chance per turn to reveal disguised or stealthed spy units within vision range.',
```

- [ ] **Step 4: Add `obsoletedByTech` to `TRAINABLE_UNITS` and add `getTrainableUnitsForCiv` to `src/systems/city-system.ts`**

Change `TRAINABLE_UNITS` type annotation and add spy entries. First, update the type of the array to use `TrainableUnitEntry` (imported from types):

```typescript
import type { City, Building, HexCoord, GameMap, UnitType, CivBonusEffect, TrainableUnitEntry } from '@/core/types';

export const TRAINABLE_UNITS: TrainableUnitEntry[] = [
  { type: 'warrior', name: 'Warrior', cost: 25 },
  { type: 'archer', name: 'Archer', cost: 35, techRequired: 'archery' },
  { type: 'scout', name: 'Scout', cost: 20 },
  { type: 'worker', name: 'Worker', cost: 30 },
  { type: 'settler', name: 'Settler', cost: 50 },
  { type: 'swordsman', name: 'Swordsman', cost: 50, techRequired: 'bronze-working' },
  { type: 'pikeman', name: 'Pikeman', cost: 70, techRequired: 'fortification' },
  { type: 'musketeer', name: 'Musketeer', cost: 90, techRequired: 'tactics' },
  { type: 'galley', name: 'Galley', cost: 40, techRequired: 'galleys' },
  { type: 'trireme', name: 'Trireme', cost: 70, techRequired: 'triremes' },
  // Espionage units
  { type: 'spy_scout', name: 'Scout Agent', cost: 30, techRequired: 'espionage-scouting', obsoletedByTech: 'espionage-informants' },
  { type: 'spy_informant', name: 'Informant', cost: 50, techRequired: 'espionage-informants', obsoletedByTech: 'spy-networks' },
  { type: 'spy_agent', name: 'Field Agent', cost: 70, techRequired: 'spy-networks', obsoletedByTech: 'cryptography' },
  { type: 'spy_operative', name: 'Operative', cost: 90, techRequired: 'cryptography', obsoletedByTech: 'cyber-warfare' },
  { type: 'spy_hacker', name: 'Cyber Operative', cost: 110, techRequired: 'cyber-warfare' },
  // Detection units
  { type: 'scout_hound', name: 'Scout Hound', cost: 45, techRequired: 'lookouts' },
];
```

Add the `getTrainableUnitsForCiv` helper after `TRAINABLE_UNITS`:

```typescript
export function getTrainableUnitsForCiv(completedTechs: string[]): TrainableUnitEntry[] {
  return TRAINABLE_UNITS.filter(u => {
    if (u.techRequired && !completedTechs.includes(u.techRequired)) return false;
    if (u.obsoletedByTech && completedTechs.includes(u.obsoletedByTech)) return false;
    return true;
  });
}
```

Update `processCity` to use `getTrainableUnitsForCiv` — pass `completedTechs` to filter available units, so obsolete types in the production queue dequeue silently (with a log event) if the tech has since advanced. This requires adding `completedTechs: string[]` as a parameter to `processCity`:

```typescript
export function processCity(
  city: City,
  map: GameMap,
  foodYield: number,
  productionYield: number,
  bonusEffect: CivBonusEffect | undefined,
  completedTechs: string[] = [],
): ProcessCityResult {
```

In the unit production section, replace `TRAINABLE_UNITS.find(u => u.type === currentItem)` with a lookup that validates the unit isn't obsolete:

```typescript
const unitDef = TRAINABLE_UNITS.find(u => u.type === currentItem);
const isObsolete = unitDef?.obsoletedByTech && completedTechs.includes(unitDef.obsoletedByTech);
```

- [ ] **Step 5: Add icons to `src/renderer/unit-renderer.ts`**

```typescript
spy_scout: '🕵️',
spy_informant: '🕵️',
spy_agent: '🕵️',
spy_operative: '🕵️',
spy_hacker: '💻',
scout_hound: '🐕',
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
yarn test tests/systems/espionage-system.test.ts
```

Expected: all unit definition tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/core/types.ts src/systems/unit-system.ts src/systems/city-system.ts src/renderer/unit-renderer.ts tests/systems/espionage-system.test.ts
git commit -m "feat(espionage): spy unit types and detection unit defined; TRAINABLE_UNITS with obsolescence"
```

---

### Task 3: Auto-Create Spy Record on Unit Training + Panel Privacy

**Files:**
- Modify: `src/systems/espionage-system.ts`
- Modify: `src/core/turn-manager.ts`
- Modify: `src/ui/espionage-panel.ts`
- Create: `tests/integration/spy-lifecycle.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/integration/spy-lifecycle.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { EventBus } from '@/core/event-bus';
import { createEspionageCivState, createSpyFromUnit, _resetSpyIdCounter } from '@/systems/espionage-system';
import { processTurn } from '@/core/turn-manager';
import type { GameState } from '@/core/types';

beforeEach(() => { _resetSpyIdCounter(); });

function makeSpyTrainingState(): GameState {
  return {
    turn: 5, era: 1, currentPlayer: 'player', gameOver: false, winner: null,
    map: { width: 10, height: 10, tiles: { '0,0': { terrain: 'plains', q: 0, r: 0 } }, wrapsHorizontally: false, rivers: [] },
    units: {},
    cities: {
      'city-1': {
        id: 'city-1', name: 'Capital', owner: 'player',
        position: { q: 0, r: 0 }, population: 3, food: 5, foodNeeded: 20,
        buildings: [], productionQueue: ['spy_scout'], productionProgress: 28,
        ownedTiles: [{ q: 0, r: 0 }], grid: [[null]], gridSize: 3,
        unrestLevel: 0, unrestTurns: 0, spyUnrestBonus: 0,
      },
    },
    civilizations: {
      player: {
        id: 'player', name: 'Player', color: '#4a90d9', isHuman: true, civType: 'egypt',
        cities: ['city-1'], units: [],
        techState: { completed: ['espionage-scouting'], currentResearch: null, researchProgress: 0, trackPriorities: {} as any },
        gold: 0, visibility: { tiles: {} }, score: 0,
        diplomacy: { relationships: {}, treaties: [], events: [], atWarWith: [], treacheryScore: 0, vassalage: { overlord: null, vassals: [], protectionScore: 100, protectionTimers: [], peakCities: 1, peakMilitary: 0 } },
      },
    },
    barbarianCamps: {}, minorCivs: {},
    tutorial: { active: false, currentStep: 'complete', completedSteps: [] },
    settings: { mapSize: 'small', soundEnabled: false, musicEnabled: false, musicVolume: 0, sfxVolume: 0, tutorialEnabled: false, advisorsEnabled: {} as any, councilTalkLevel: 'normal' },
    tribalVillages: {}, discoveredWonders: {}, wonderDiscoverers: {},
    espionage: { player: { ...createEspionageCivState(), maxSpies: 1 } },
  } as unknown as GameState;
}

describe('spy unit training creates Spy record', () => {
  it('trains spy_scout and creates matching Spy record with same id', () => {
    const state = makeSpyTrainingState();
    const bus = new EventBus();
    const next = processTurn(state, bus);
    const unitIds = Object.keys(next.units).filter(id => next.units[id].type === 'spy_scout');
    const spyIds = Object.keys(next.espionage!['player'].spies);
    expect(unitIds).toHaveLength(1);
    expect(spyIds).toHaveLength(1);
    expect(unitIds[0]).toBe(spyIds[0]);
  });

  it('new Spy record has status idle and owner player', () => {
    const state = makeSpyTrainingState();
    const next = processTurn(state, new EventBus());
    const spy = Object.values(next.espionage!['player'].spies)[0];
    expect(spy.status).toBe('idle');
    expect(spy.owner).toBe('player');
  });

  it('emits espionage:spy-recruited on spy unit completion', () => {
    const state = makeSpyTrainingState();
    const bus = new EventBus();
    const events: unknown[] = [];
    bus.on('espionage:spy-recruited', e => events.push(e));
    processTurn(state, bus);
    expect(events).toHaveLength(1);
  });
});

describe('panel privacy', () => {
  it('getEspionagePanelViewModel hides stages with no unlocked missions', async () => {
    const { getEspionagePanelViewModel } = await import('@/ui/espionage-panel');
    const state = makeSpyTrainingState();
    state.civilizations['player'].techState.completed = [];
    const vm = getEspionagePanelViewModel(state);
    expect(vm.missionStages).toHaveLength(0);
  });

  it('stage 4 header text not visible until stage 4 tech researched', async () => {
    const { createEspionagePanel } = await import('@/ui/espionage-panel');
    const state = makeSpyTrainingState();
    state.civilizations['player'].techState.completed = ['espionage-scouting'];
    const panel = createEspionagePanel(state);
    const text = collectTextRecursive(panel);
    expect(text).not.toContain('Shadow Operations');
  });
});

function collectTextRecursive(el: unknown): string {
  const node = el as { textContent?: string; children?: unknown[] };
  return [node.textContent, ...(node.children ?? []).map(collectTextRecursive)].filter(Boolean).join(' ');
}
```

- [ ] **Step 2: Run to verify failure**

```bash
yarn test tests/integration/spy-lifecycle.test.ts
```

Expected: `createSpyFromUnit` missing; spy records not created.

- [ ] **Step 3: Add `createSpyFromUnit` to `src/systems/espionage-system.ts`**

Fix `createEspionageCivState` — change `maxSpies: 1` to `maxSpies: 0`:

```typescript
export function createEspionageCivState(): EspionageCivState {
  return {
    spies: {},
    maxSpies: 0,
    counterIntelligence: {},
    detectedThreats: {},
    activeInterrogations: {},
    recentDetections: [],
  };
}
```

Add `createSpyFromUnit` after `recruitSpy`:

```typescript
const SPY_UNIT_TYPES = new Set<UnitType>(['spy_scout','spy_informant','spy_agent','spy_operative','spy_hacker']);

export function isSpyUnitType(type: UnitType): boolean {
  return SPY_UNIT_TYPES.has(type);
}

export function createSpyFromUnit(
  state: EspionageCivState,
  unitId: string,
  owner: string,
  seed: string,
): { state: EspionageCivState; spy: Spy } {
  const rng = createRng(seed);
  const nameIndex = Math.floor(rng() * SPY_NAMES.length);
  const spy: Spy = {
    id: unitId,
    owner,
    name: `Agent ${SPY_NAMES[nameIndex]}`,
    targetCivId: null,
    targetCityId: null,
    position: null,
    status: 'idle',
    experience: 0,
    currentMission: null,
    cooldownTurns: 0,
    promotion: undefined,
    promotionAvailable: false,
    feedsFalseIntel: false,
    disguiseAs: null,
    infiltrationCityId: null,
    cityVisionTurnsLeft: 0,
    stolenTechFrom: {},
  };
  return {
    state: { ...state, spies: { ...state.spies, [unitId]: spy } },
    spy,
  };
}
```

- [ ] **Step 4: Wire spy creation in `src/core/turn-manager.ts`**

Add import: `import { isSpyUnitType, createSpyFromUnit } from '@/systems/espionage-system';`

After the `createUnit` call in the production completion block (lines ~90-95):

```typescript
if (result.completedUnit) {
  bus.emit('city:unit-trained', { cityId, unitType: result.completedUnit });
  const newUnit = createUnit(result.completedUnit, civId, city.position, civDef?.bonusEffect);
  newState.units[newUnit.id] = newUnit;
  newState.civilizations[civId].units.push(newUnit.id);

  if (isSpyUnitType(result.completedUnit) && newState.espionage?.[civId]) {
    const { state: updatedEsp, spy } = createSpyFromUnit(
      newState.espionage[civId],
      newUnit.id,
      civId,
      `spy-unit-${newUnit.id}-${newState.turn}`,
    );
    newState.espionage[civId] = updatedEsp;
    bus.emit('espionage:spy-recruited', { civId, spy });
  }
}
```

Also update `processTurn` to pass `completedTechs` to `processCity`:

```typescript
const result = processCity(
  city, newState.map, yields.food, effectiveProduction,
  civDef?.bonusEffect,
  civ.techState.completed,
);
```

- [ ] **Step 5: Fix panel privacy — filter empty mission stages**

In `src/ui/espionage-panel.ts`, `buildMissionStageGroups`, change the return to filter empty groups:

```typescript
return stageOrder
  .map(stage => ({ stage, title: stages[stage].title, description: stages[stage].description, missions: stages[stage].missions }))
  .filter(group => group.missions.length > 0);
```

Remove the `onRecruit` button and callback from `createEspionagePanel` and `EspionagePanelCallbacks`. Players build spy units in cities.

Add a "no espionage" message when the panel has nothing to show:

```typescript
if (data.missionStages.length === 0 && data.spySummaries.length === 0) {
  const unlock = createEl('div', 'Research Scouting Networks to train spy units and unlock intelligence operations.');
  unlock.style.cssText = 'font-size:12px;opacity:0.7;line-height:1.5;padding:8px 0;';
  panel.appendChild(unlock);
}
```

- [ ] **Step 6: Run full test suite**

```bash
yarn test
```

Expected: all tests pass. Fix any that relied on `maxSpies: 1` default or `'traveling'` status.

- [ ] **Step 7: Commit**

```bash
git add src/systems/espionage-system.ts src/core/turn-manager.ts src/ui/espionage-panel.ts tests/integration/spy-lifecycle.test.ts
git commit -m "feat(espionage): spy units auto-create Spy records; panel privacy fixes; maxSpies floor corrected"
```

---

### Task 4: Combat Death Cleanup + AI Training

**Files:**
- Modify: `src/main.ts`
- Modify: `src/ai/basic-ai.ts`

- [ ] **Step 1: Write failing test**

```typescript
// In tests/integration/spy-lifecycle.test.ts

describe('spy unit death cleanup', () => {
  it('deletes Spy record when spy unit is killed in combat', () => {
    // Build a state where a spy unit exists in both state.units and state.espionage
    // Simulate the death path in main.ts
    // After deletion of the unit, the spy record should also be gone
    const state = makeSpyTrainingState();
    const bus = new EventBus();
    const stateAfterTrain = processTurn(state, bus);
    const unitId = Object.keys(stateAfterTrain.units).find(id => stateAfterTrain.units[id].type === 'spy_scout')!;
    
    // Simulate death (as main.ts does): delete unit + call cleanup
    const { cleanupDeadSpyUnit } = await import('@/systems/espionage-system');
    const cleanedEsp = cleanupDeadSpyUnit(stateAfterTrain.espionage!, 'player', unitId);
    expect(cleanedEsp['player'].spies[unitId]).toBeUndefined();
  });
});
```

- [ ] **Step 2: Add `cleanupDeadSpyUnit` to `src/systems/espionage-system.ts`**

```typescript
export function cleanupDeadSpyUnit(
  espionage: EspionageState,
  owner: string,
  unitId: string,
): EspionageState {
  const civEsp = espionage[owner];
  if (!civEsp?.spies[unitId]) return espionage;
  const { [unitId]: _removed, ...remainingSpies } = civEsp.spies;
  return {
    ...espionage,
    [owner]: { ...civEsp, spies: remainingSpies },
  };
}
```

- [ ] **Step 3: Wire cleanup in `src/main.ts`**

In `main.ts` in both combat death branches (attacker dies ~line 881, defender dies ~line 892), after `delete gameState.units[id]`, add:

```typescript
if (gameState.espionage) {
  gameState.espionage = cleanupDeadSpyUnit(gameState.espionage, unitOwner, unitId);
}
```

Import `cleanupDeadSpyUnit` in `main.ts`.

- [ ] **Step 4: Update AI to queue spy units in city production**

In `src/ai/basic-ai.ts`, find the existing `// AI espionage decisions` block (line ~635). Add spy unit production queueing logic before or replacing the `recruitSpy` call:

```typescript
// AI trains spy units from city production queues
const espState = newState.espionage?.[civId];
if (espState) {
  const activeSpies = Object.values(espState.spies).filter(s => s.status !== 'captured').length;
  if (activeSpies < espState.maxSpies) {
    const availableSpyTypes = getTrainableUnitsForCiv(civ.techState.completed)
      .filter(u => isSpyUnitType(u.type));
    if (availableSpyTypes.length > 0) {
      const bestType = availableSpyTypes[availableSpyTypes.length - 1]; // highest era type
      for (const cityId of civ.cities) {
        const city = newState.cities[cityId];
        if (city && city.productionQueue.length === 0) {
          newState.cities[cityId] = {
            ...city,
            productionQueue: [bestType.type],
          };
          break;
        }
      }
    }
  }
}
```

Remove the old direct `recruitSpy` call. Import `getTrainableUnitsForCiv` and `isSpyUnitType`.

- [ ] **Step 5: Run full test suite**

```bash
yarn test
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/systems/espionage-system.ts src/main.ts src/ai/basic-ai.ts tests/integration/spy-lifecycle.test.ts
git commit -m "feat(espionage): spy unit death cleans up Spy record; AI trains spy units from city production"
```

---

## MR 2 — Detection System

### Task 5: Passive Baseline Detection + Scout Hound

**Files:**
- Create: `src/systems/detection-system.ts`
- Modify: `src/core/turn-manager.ts`
- Create: `tests/systems/detection-system.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/systems/detection-system.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import type { GameState } from '@/core/types';
import {
  getPassiveDetectionChance,
  processDetection,
} from '@/systems/detection-system';

function makeDetectionState(): GameState {
  // State with one idle spy unit (player's) near an enemy city
  // Enemy has no spy units
  return { /* minimal state */ } as any;
}

describe('passive baseline detection', () => {
  it('returns 0.05 for a city with population 1', () => {
    expect(getPassiveDetectionChance(1)).toBeCloseTo(0.05);
  });

  it('scales with population, max 0.20', () => {
    expect(getPassiveDetectionChance(10)).toBeCloseTo(0.20);
    expect(getPassiveDetectionChance(100)).toBeCloseTo(0.20);
  });
});

describe('scout_hound detection', () => {
  it('scout_hound within vision range has 35% chance to detect adjacent spy unit', () => {
    // Build a state where a scout_hound unit is adjacent to a spy unit
    // After processDetection, the spy should appear in recentDetections with some probability
    // We run 100 trials and check it's near 35%
    let detections = 0;
    for (let i = 0; i < 200; i++) {
      const state = buildDetectionState(`seed-${i}`);
      const bus = new (require('@/core/event-bus').EventBus)();
      const next = processDetection(state, bus);
      if ((next.espionage?.['ai-egypt']?.recentDetections ?? []).length > 0) {
        detections++;
      }
    }
    const rate = detections / 200;
    expect(rate).toBeGreaterThan(0.20);
    expect(rate).toBeLessThan(0.55);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
yarn test tests/systems/detection-system.test.ts
```

Expected: `getPassiveDetectionChance` not found.

- [ ] **Step 3: Create `src/systems/detection-system.ts`**

```typescript
// src/systems/detection-system.ts
import type { GameState, Unit } from '@/core/types';
import type { EventBus } from '@/core/event-bus';
import { UNIT_DEFINITIONS } from './unit-system';
import { hexDistance } from './hex-utils';
import { createRng } from './map-generator';
import { isSpyUnitType } from './espionage-system';

export function getPassiveDetectionChance(cityPopulation: number): number {
  return Math.min(0.20, 0.03 + cityPopulation * 0.017);
}

export function processDetection(state: GameState, bus: EventBus): GameState {
  const seed = `detection-${state.turn}`;
  const rng = createRng(seed);
  let nextState = state;

  for (const [spyUnitId, spyUnit] of Object.entries(state.units)) {
    if (!isSpyUnitType(spyUnit.type)) continue;

    // Only traveling (on-map idle) spies can be detected
    const spyRecord = state.espionage?.[spyUnit.owner]?.spies[spyUnitId];
    if (!spyRecord || spyRecord.status !== 'idle') continue;

    // 1. Scout Hound detection
    for (const [detectUnitId, detectUnit] of Object.entries(state.units)) {
      if (detectUnit.owner === spyUnit.owner) continue;
      const def = UNIT_DEFINITIONS[detectUnit.type];
      if (!def.spyDetectionChance) continue;
      const dist = hexDistance(detectUnit.position, spyUnit.position);
      if (dist > def.visionRange) continue;
      if (rng() < def.spyDetectionChance) {
        nextState = registerDetection(nextState, detectUnit.owner, spyUnit, false, bus);
      }
    }

    // 2. Passive baseline detection — only if spy is adjacent to or on an enemy city
    for (const city of Object.values(state.cities)) {
      if (city.owner === spyUnit.owner) continue;
      if (hexDistance(city.position, spyUnit.position) > 1) continue;
      const chance = getPassiveDetectionChance(city.population);
      if (rng() < chance) {
        nextState = registerDetection(nextState, city.owner, spyUnit, spyRecord.disguiseAs != null, bus);
      }
    }
  }

  return nextState;
}

function registerDetection(
  state: GameState,
  detectingCivId: string,
  spyUnit: Unit,
  wasDisguised: boolean,
  bus: EventBus,
): GameState {
  const civEsp = state.espionage?.[detectingCivId];
  if (!civEsp) return state;

  const detection = {
    position: { ...spyUnit.position },
    turn: state.turn,
    wasDisguised,
  };
  bus.emit('espionage:spy-detected-traveling', {
    detectingCivId,
    spyOwner: spyUnit.owner,
    spyUnitId: spyUnit.id,
    position: spyUnit.position,
    wasDisguised,
  });

  return {
    ...state,
    espionage: {
      ...state.espionage,
      [detectingCivId]: {
        ...civEsp,
        recentDetections: [...(civEsp.recentDetections ?? []), detection].slice(-20),
      },
    },
  };
}
```

- [ ] **Step 4: Wire `processDetection` in `src/core/turn-manager.ts`**

Add import: `import { processDetection } from '@/systems/detection-system';`

At end of the main civ loop (after espionage turn processing), add:
```typescript
newState = processDetection(newState, bus);
```

Also add the new event to `GameEventMap` in `types.ts`:
```typescript
'espionage:spy-detected-traveling': { detectingCivId: string; spyOwner: string; spyUnitId: string; position: HexCoord; wasDisguised: boolean };
```

- [ ] **Step 5: Run tests**

```bash
yarn test tests/systems/detection-system.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add src/systems/detection-system.ts src/core/turn-manager.ts src/core/types.ts tests/systems/detection-system.test.ts
git commit -m "feat(espionage): detection system — scout hound units and passive baseline city detection"
```

---

## MR 3 — Disguise System

### Task 6: Disguise as Travel-Phase Mechanic

**Files:**
- Create: `src/systems/espionage-stealth.ts`
- Modify: `src/systems/espionage-system.ts`
- Modify: `src/renderer/render-loop.ts`
- Modify: `src/ui/selected-unit-info.ts`
- Modify: `src/main.ts`
- Create: `tests/systems/espionage-stealth.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/systems/espionage-stealth.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import type { GameState } from '@/core/types';
import { getVisibleUnitsForPlayer } from '@/systems/espionage-stealth';
import { createEspionageCivState, createSpyFromUnit, setDisguise, _resetSpyIdCounter } from '@/systems/espionage-system';

beforeEach(() => { _resetSpyIdCounter(); });

function makeStealthState(disguise?: string) {
  let civEsp = { ...createEspionageCivState(), maxSpies: 1 };
  const { state: esp } = createSpyFromUnit(civEsp, 'unit-1', 'player', 'stealth-seed');
  civEsp = disguise
    ? setDisguise(esp, 'unit-1', disguise as any)
    : esp;
  return {
    espionage: { player: civEsp, 'ai-egypt': createEspionageCivState() },
    units: {
      'unit-1': { id: 'unit-1', type: 'spy_scout', owner: 'player', position: { q: 5, r: 3 }, health: 100, movementPointsLeft: 2, hasActed: false, hasMoved: false },
    },
    civilizations: {
      player: { techState: { completed: ['espionage-scouting', 'disguise'] } },
      'ai-egypt': { techState: { completed: [] } },
    },
  } as unknown as GameState;
}

describe('getVisibleUnitsForPlayer', () => {
  it('spy without disguise is visible to enemy as spy unit', () => {
    const state = makeStealthState();
    const visible = getVisibleUnitsForPlayer(state.units, state, 'ai-egypt');
    expect(visible['unit-1']).toBeDefined();
    expect(visible['unit-1'].type).toBe('spy_scout');
    expect(visible['unit-1'].owner).toBe('player');
  });

  it('spy disguised as barbarian appears as barbarian warrior to enemy', () => {
    const state = makeStealthState('barbarian');
    const visible = getVisibleUnitsForPlayer(state.units, state, 'ai-egypt');
    expect(visible['unit-1'].type).toBe('warrior');
    expect(visible['unit-1'].owner).toBe('barbarian');
  });

  it('spy disguised as barbarian appears as true self to owner', () => {
    const state = makeStealthState('barbarian');
    const visible = getVisibleUnitsForPlayer(state.units, state, 'player');
    expect(visible['unit-1'].type).toBe('spy_scout');
  });

  it('enemy scout_hound unit sees through barbarian disguise', () => {
    const state = makeStealthState('barbarian');
    state.units['hound-1'] = { id: 'hound-1', type: 'scout_hound', owner: 'ai-egypt', position: { q: 5, r: 3 }, health: 100, movementPointsLeft: 3, hasActed: false, hasMoved: false };
    const visible = getVisibleUnitsForPlayer(state.units, state, 'ai-egypt');
    expect(visible['unit-1'].type).toBe('spy_scout');
    expect(visible['unit-1'].owner).toBe('player');
  });

  it('spy disguised as warrior with archer choice appears as archer', () => {
    const state = makeStealthState('archer');
    const visible = getVisibleUnitsForPlayer(state.units, state, 'ai-egypt');
    expect(visible['unit-1'].type).toBe('archer');
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
yarn test tests/systems/espionage-stealth.test.ts
```

- [ ] **Step 3: Add `setDisguise` to `src/systems/espionage-system.ts`**

```typescript
export function setDisguise(
  state: EspionageCivState,
  spyId: string,
  disguiseAs: DisguiseType | null,
): EspionageCivState {
  const spy = state.spies[spyId];
  if (!spy) throw new Error(`Spy ${spyId} not found`);
  if (spy.status !== 'idle') throw new Error('Disguise can only be set while spy is on the map (idle)');
  return {
    ...state,
    spies: { ...state.spies, [spyId]: { ...spy, disguiseAs } },
  };
}
```

- [ ] **Step 4: Create `src/systems/espionage-stealth.ts`**

```typescript
// src/systems/espionage-stealth.ts
import type { Unit, GameState, UnitType } from '@/core/types';
import { UNIT_DEFINITIONS } from './unit-system';

function hasNearbyOwnSpy(units: Record<string, Unit>, viewerCivId: string, spyPosition: { q: number; r: number }): boolean {
  for (const u of Object.values(units)) {
    if (u.owner !== viewerCivId) continue;
    if (!UNIT_DEFINITIONS[u.type]?.spyDetectionChance) continue;
    const dist = Math.max(Math.abs(u.position.q - spyPosition.q), Math.abs(u.position.r - spyPosition.r));
    if (dist <= (UNIT_DEFINITIONS[u.type].visionRange ?? 2)) return true;
  }
  return false;
}

const DISGUISE_TYPE_MAP: Record<string, UnitType> = {
  barbarian: 'warrior',
  warrior: 'warrior',
  scout: 'scout',
  archer: 'archer',
  worker: 'worker',
};

export function getVisibleUnitsForPlayer(
  units: Record<string, Unit>,
  state: GameState,
  viewerCivId: string,
): Record<string, Unit> {
  const result: Record<string, Unit> = {};

  for (const [id, unit] of Object.entries(units)) {
    if (unit.owner === viewerCivId) {
      result[id] = unit;
      continue;
    }

    const spyRecord = state.espionage?.[unit.owner]?.spies[id];
    const disguise = spyRecord?.disguiseAs;

    if (!disguise || !spyRecord || spyRecord.status !== 'idle') {
      result[id] = unit;
      continue;
    }

    // Spy and scout_hound units see through all disguises
    const detectByUnit = hasNearbyOwnSpy(units, viewerCivId, unit.position);
    if (detectByUnit) {
      result[id] = unit;
      continue;
    }

    const fakeType = DISGUISE_TYPE_MAP[disguise] ?? 'warrior';
    const fakeOwner = disguise === 'barbarian' ? 'barbarian' : unit.owner;
    result[id] = { ...unit, type: fakeType as UnitType, owner: fakeOwner };
  }

  return result;
}
```

- [ ] **Step 5: Wire `getVisibleUnitsForPlayer` in `src/renderer/render-loop.ts`**

In `render-loop.ts`, add import and apply before `drawUnits`:

```typescript
import { getVisibleUnitsForPlayer } from '@/systems/espionage-stealth';

// In private render() method, replace:
drawUnits(this.ctx, this.state.units, this.camera, playerVis, this.state, this.state.currentPlayer, colorLookup);

// With:
const visibleUnits = getVisibleUnitsForPlayer(this.state.units, this.state, this.state.currentPlayer);
drawUnits(this.ctx, visibleUnits, this.camera, playerVis, this.state, this.state.currentPlayer, colorLookup);
```

- [ ] **Step 6: Add disguise actions to `src/ui/selected-unit-info.ts`**

Add `onSetDisguise?: (unitId: string, disguise: DisguiseType | null) => void` to `SelectedUnitInfoCallbacks`.

In `renderSelectedUnitInfo`, after the existing actions, add for idle spy units:

```typescript
if (isSpyUnitType(unit.type) && !unit.hasActed && callbacks.onSetDisguise) {
  const spy = state.espionage?.[unit.owner]?.spies[unitId];
  const ownerTechs = state.civilizations[unit.owner]?.techState.completed ?? [];
  
  const disguiseOptions: Array<{ label: string; value: DisguiseType | null; tech?: string }> = [
    { label: 'No Disguise', value: null },
    { label: 'As Barbarian', value: 'barbarian', tech: 'disguise' },
    { label: 'As Warrior', value: 'warrior', tech: 'disguise' },
    { label: 'As Scout', value: 'scout', tech: 'spy-networks' },
    { label: 'As Archer', value: 'archer', tech: 'spy-networks' },
    { label: 'As Worker', value: 'worker', tech: 'cryptography' },
  ].filter(opt => !opt.tech || ownerTechs.includes(opt.tech));

  if (disguiseOptions.length > 1) {
    const disguiseSection = document.createElement('div');
    disguiseSection.style.cssText = 'margin-top:8px;display:flex;flex-wrap:wrap;gap:6px;';
    const label = document.createElement('div');
    label.textContent = 'Set disguise (costs this turn's move):';
    label.style.cssText = 'font-size:10px;opacity:0.6;width:100%;';
    disguiseSection.appendChild(label);
    for (const opt of disguiseOptions) {
      const active = (spy?.disguiseAs ?? null) === opt.value;
      disguiseSection.appendChild(
        makeButton(active ? `✓ ${opt.label}` : opt.label, active ? '#7c3aed' : '#374151',
          () => callbacks.onSetDisguise!(unitId, opt.value))
      );
    }
    actionsDiv.appendChild(disguiseSection);
  }
}
```

- [ ] **Step 7: Wire `onSetDisguise` in `src/main.ts`**

```typescript
onSetDisguise: (unitId, disguise) => {
  const unit = gameState.units[unitId];
  if (!unit || unit.hasActed || !gameState.espionage?.[gameState.currentPlayer]) return;
  gameState.espionage![gameState.currentPlayer] = setDisguise(
    gameState.espionage![gameState.currentPlayer], unitId, disguise,
  );
  gameState.units[unitId] = { ...unit, hasActed: true, movementPointsLeft: 0 };
  renderLoop.setGameState(gameState);
  showNotification(disguise ? `Spy disguised as ${disguise}.` : 'Disguise removed.', 'info');
},
```

- [ ] **Step 8: Run full test suite**

```bash
yarn test
```

- [ ] **Step 9: Commit**

```bash
git add src/systems/espionage-stealth.ts src/systems/espionage-system.ts src/renderer/render-loop.ts src/ui/selected-unit-info.ts src/main.ts tests/systems/espionage-stealth.test.ts
git commit -m "feat(espionage): disguise system — spy units can disguise as common units during travel; seen through by spy/scout-hound units"
```

---

## MR 4 — Infiltration System

### Task 7: Infiltration Attempt (% Chance) and City Vision

**Files:**
- Modify: `src/systems/espionage-system.ts`
- Modify: `src/core/turn-manager.ts`
- Modify: `src/renderer/render-loop.ts`
- Modify: `src/ui/selected-unit-info.ts`
- Modify: `src/main.ts`
- Create: `tests/systems/espionage-infiltration.test.ts`

**Infiltration success formula:**
- Base rate: `spy_scout` = 0.55, `spy_informant` = 0.65, `spy_agent` = 0.70, `spy_operative` = 0.75, `spy_hacker` = 0.65 (cyber)
- Modifier: `-0.004 × cityCI` (counter-intelligence score of target city)
- Modifier: `+0.003 × spyExperience`
- Clamp: `[0.10, 0.90]`

**Era 1 single-roll behavior:** When a `spy_scout` successfully infiltrates, it immediately also resolves `scout_area` and the spy is returned to idle (on map) after. No multi-turn mission state. The city vision grant still applies (5 turns).

- [ ] **Step 1: Write failing tests**

Create `tests/systems/espionage-infiltration.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { createEspionageCivState, createSpyFromUnit, attemptInfiltration, getInfiltrationSuccessChance, _resetSpyIdCounter } from '@/systems/espionage-system';
import { createRng } from '@/systems/map-generator';

beforeEach(() => { _resetSpyIdCounter(); });

describe('getInfiltrationSuccessChance', () => {
  it('spy_scout with 0 XP against 0 CI: ~0.55', () => {
    expect(getInfiltrationSuccessChance('spy_scout', 0, 0)).toBeCloseTo(0.55);
  });
  it('high CI reduces success chance', () => {
    const low = getInfiltrationSuccessChance('spy_scout', 0, 0);
    const high = getInfiltrationSuccessChance('spy_scout', 0, 80);
    expect(high).toBeLessThan(low);
  });
  it('clamped to minimum 0.10', () => {
    expect(getInfiltrationSuccessChance('spy_scout', 0, 100)).toBeGreaterThanOrEqual(0.10);
  });
  it('clamped to maximum 0.90', () => {
    expect(getInfiltrationSuccessChance('spy_operative', 100, 0)).toBeLessThanOrEqual(0.90);
  });
});

describe('attemptInfiltration', () => {
  function makeSpy() {
    let civEsp = { ...createEspionageCivState(), maxSpies: 1 };
    const { state } = createSpyFromUnit(civEsp, 'unit-1', 'player', 'seed');
    return state;
  }

  it('on success: spy status becomes stationed, city vision granted, unit removed signal returned', () => {
    const civEsp = makeSpy();
    const result = attemptInfiltration(civEsp, 'unit-1', 'spy_scout', 'city-enemy-1', { q: 5, r: 3 }, 0, 'success-seed-hit');
    expect(result.civEsp.spies['unit-1'].status).toBe('stationed');
    expect(result.civEsp.spies['unit-1'].infiltrationCityId).toBe('city-enemy-1');
    expect(result.civEsp.spies['unit-1'].cityVisionTurnsLeft).toBe(5);
    expect(result.removeUnitFromMap).toBe(true);
  });

  it('on failure (not caught): spy stays idle, short cooldown, unit stays on map', () => {
    const civEsp = makeSpy();
    const result = attemptInfiltration(civEsp, 'unit-1', 'spy_scout', 'city-enemy-1', { q: 5, r: 3 }, 0, 'failure-seed-miss');
    if (result.removeUnitFromMap) return; // only test the failure path
    expect(result.civEsp.spies['unit-1'].status).toBe('cooldown');
    expect(result.civEsp.spies['unit-1'].cooldownTurns).toBeGreaterThan(0);
  });

  it('era1 spy_scout infiltration also grants scout_area result immediately', () => {
    const civEsp = makeSpy();
    const result = attemptInfiltration(civEsp, 'unit-1', 'spy_scout', 'city-enemy-1', { q: 5, r: 3 }, 0, 'success-seed-hit');
    expect(result.era1ScoutResult).toBeDefined();
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
yarn test tests/systems/espionage-infiltration.test.ts
```

- [ ] **Step 3: Add infiltration functions to `src/systems/espionage-system.ts`**

```typescript
const INFILTRATION_BASE: Partial<Record<UnitType, number>> = {
  spy_scout: 0.55,
  spy_informant: 0.65,
  spy_agent: 0.70,
  spy_operative: 0.75,
  spy_hacker: 0.65,
};

export function getInfiltrationSuccessChance(
  unitType: UnitType,
  experience: number,
  cityCI: number,
): number {
  const base = INFILTRATION_BASE[unitType] ?? 0.50;
  const expBonus = experience * 0.003;
  const ciPenalty = cityCI * 0.004;
  return Math.max(0.10, Math.min(0.90, base + expBonus - ciPenalty));
}

export interface InfiltrationResult {
  civEsp: EspionageCivState;
  removeUnitFromMap: boolean;
  caught: boolean;
  era1ScoutResult?: MissionResult;
}

const INFILTRATION_FAIL_COOLDOWN = 3;
const INFILTRATION_CATCH_CHANCE = 0.25; // of all failures, this % get caught

export function attemptInfiltration(
  state: EspionageCivState,
  spyId: string,
  unitType: UnitType,
  targetCityId: string,
  targetPosition: HexCoord,
  cityCI: number,
  seed: string,
): InfiltrationResult {
  const spy = state.spies[spyId];
  if (!spy || spy.status !== 'idle') throw new Error(`Spy ${spyId} cannot infiltrate`);

  const rng = createRng(seed);
  const chance = getInfiltrationSuccessChance(unitType, spy.experience, cityCI);
  const roll = rng();

  if (roll < chance) {
    // Success
    const era1 = unitType === 'spy_scout';
    const updatedSpy: Spy = {
      ...spy,
      status: era1 ? 'idle' : 'stationed',
      infiltrationCityId: targetCityId,
      cityVisionTurnsLeft: 5,
      position: { ...targetPosition },
      experience: Math.min(100, spy.experience + 5),
    };
    return {
      civEsp: { ...state, spies: { ...state.spies, [spyId]: updatedSpy } },
      removeUnitFromMap: !era1,
      caught: false,
      era1ScoutResult: era1 ? { tilesToReveal: [] } : undefined, // tiles resolved by caller
    };
  } else {
    // Failure
    const catchRoll = rng();
    const caught = catchRoll < INFILTRATION_CATCH_CHANCE;
    const updatedSpy: Spy = {
      ...spy,
      status: caught ? 'captured' : 'cooldown',
      cooldownTurns: caught ? 0 : INFILTRATION_FAIL_COOLDOWN,
    };
    return {
      civEsp: { ...state, spies: { ...state.spies, [spyId]: updatedSpy } },
      removeUnitFromMap: false,
      caught,
    };
  }
}
```

- [ ] **Step 4: Decrement city vision each turn in `src/core/turn-manager.ts`**

In the espionage turn loop, after `processSpyTurn`, add city-vision decrement:

```typescript
for (const [spyId, spy] of Object.entries(state.espionage![civId].spies)) {
  if (spy.cityVisionTurnsLeft && spy.cityVisionTurnsLeft > 0) {
    const newLeft = spy.cityVisionTurnsLeft - 1;
    state.espionage![civId].spies[spyId] = {
      ...spy,
      cityVisionTurnsLeft: newLeft,
    };
  }
}
```

- [ ] **Step 5: Render infiltrated-spy indicator on cities in `src/renderer/render-loop.ts`**

Add a helper to draw a small indicator on city tiles where the current player has an infiltrated spy. In `render()`, after `drawCities`:

```typescript
this.drawInfiltratedSpyIndicators();
```

Add the private method:

```typescript
private drawInfiltratedSpyIndicators(): void {
  if (!this.state) return;
  const civEsp = this.state.espionage?.[this.state.currentPlayer];
  if (!civEsp) return;
  for (const spy of Object.values(civEsp.spies)) {
    if (spy.status !== 'stationed' && spy.status !== 'on_mission' && spy.status !== 'cooldown') continue;
    if (!spy.infiltrationCityId) continue;
    const city = this.state.cities[spy.infiltrationCityId];
    if (!city) continue;
    const pixel = hexToPixel(city.position, this.camera.hexSize);
    const screen = this.camera.worldToScreen(pixel.x, pixel.y);
    const size = this.camera.hexSize * this.camera.zoom;
    this.ctx.font = `${size * 0.3}px system-ui`;
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillText('👁', screen.x + size * 0.5, screen.y - size * 0.4);
  }
}
```

Also: when spy has `cityVisionTurnsLeft > 0`, reveal the target city tile in the player's visibility map each turn:

```typescript
// In turn-manager.ts, in the vision decrement block:
if (spy.cityVisionTurnsLeft && spy.cityVisionTurnsLeft > 0 && spy.infiltrationCityId) {
  const city = state.cities[spy.infiltrationCityId];
  if (city && state.civilizations[civId]?.visibility?.tiles) {
    state.civilizations[civId].visibility.tiles[`${city.position.q},${city.position.r}`] = 'visible';
  }
}
```

- [ ] **Step 6: Add "Infiltrate" button to `src/ui/selected-unit-info.ts`**

Add `onInfiltrate?: (unitId: string) => void` to `SelectedUnitInfoCallbacks`.

In `renderSelectedUnitInfo`, after the disguise section, add:

```typescript
if (isSpyUnitType(unit.type) && callbacks.onInfiltrate) {
  const spyRecord = state.espionage?.[unit.owner]?.spies[unitId];
  const isAvailable = !spyRecord || spyRecord.status === 'idle' || (spyRecord.status === 'cooldown' && spyRecord.cooldownTurns === 0);
  const enemyCityHere = Object.values(state.cities).some(
    c => c.owner !== unit.owner && c.position.q === unit.position.q && c.position.r === unit.position.r,
  );
  if (isAvailable && enemyCityHere) {
    actionsDiv.appendChild(makeButton('Infiltrate City', '#7c3aed', () => callbacks.onInfiltrate!(unitId)));
  }
  if (spyRecord?.status === 'cooldown' && (spyRecord.cooldownTurns ?? 0) > 0) {
    const cd = document.createElement('span');
    cd.style.cssText = 'font-size:10px;opacity:0.6;align-self:center;';
    cd.textContent = `Infiltrate available in ${spyRecord.cooldownTurns} turns`;
    actionsDiv.appendChild(cd);
  }
}
```

- [ ] **Step 7: Wire `onInfiltrate` in `src/main.ts`**

```typescript
onInfiltrate: (unitId) => {
  const unit = gameState.units[unitId];
  if (!unit || !gameState.espionage?.[gameState.currentPlayer]) return;
  const targetCity = Object.values(gameState.cities).find(
    c => c.owner !== gameState.currentPlayer && c.position.q === unit.position.q && c.position.r === unit.position.r,
  );
  if (!targetCity) { showNotification('No enemy city at this location.', 'info'); return; }

  const cityCI = gameState.espionage![targetCity.owner]?.counterIntelligence[targetCity.id] ?? 0;
  const seed = `infiltrate-${unitId}-${gameState.turn}`;
  const result = attemptInfiltration(
    gameState.espionage![gameState.currentPlayer],
    unitId, unit.type as UnitType, targetCity.id, targetCity.position, cityCI, seed,
  );
  gameState.espionage![gameState.currentPlayer] = result.civEsp;

  if (result.removeUnitFromMap) {
    delete gameState.units[unitId];
    gameState.civilizations[gameState.currentPlayer].units =
      gameState.civilizations[gameState.currentPlayer].units.filter(id => id !== unitId);
    showNotification(`Spy successfully infiltrated ${targetCity.name}. Open Intel panel to issue orders.`, 'success');
    bus.emit('espionage:spy-infiltrated', { civId: gameState.currentPlayer, spyId: unitId, cityId: targetCity.id });
  } else if (result.caught) {
    showNotification(`Spy was caught attempting to infiltrate ${targetCity.name}!`, 'warning');
    // Capture flow handled in MR 6
    bus.emit('espionage:spy-caught-infiltrating', { capturingCivId: targetCity.owner, spyOwner: gameState.currentPlayer, spyId: unitId, cityId: targetCity.id });
  } else {
    showNotification(`Spy failed to infiltrate ${targetCity.name}. Lying low for ${result.civEsp.spies[unitId]?.cooldownTurns ?? 3} turns.`, 'info');
  }

  // Spend the unit's turn
  if (gameState.units[unitId]) {
    gameState.units[unitId] = { ...gameState.units[unitId], hasActed: true, movementPointsLeft: 0 };
  }
  renderLoop.setGameState(gameState);
},
```

Add the new events to `GameEventMap` in `types.ts`:
```typescript
'espionage:spy-infiltrated': { civId: string; spyId: string; cityId: string };
'espionage:spy-caught-infiltrating': { capturingCivId: string; spyOwner: string; spyId: string; cityId: string };
```

- [ ] **Step 8: Run full test suite**

```bash
yarn test
```

- [ ] **Step 9: Commit**

```bash
git add src/systems/espionage-system.ts src/core/turn-manager.ts src/renderer/render-loop.ts src/ui/selected-unit-info.ts src/main.ts src/core/types.ts tests/systems/espionage-infiltration.test.ts
git commit -m "feat(espionage): infiltration system — % chance, city vision, spy removed from map on success, era-1 single-roll behavior"
```

---

## MR 5 — Mission System

### Task 8: Two-Phase Missions with Cooldowns and Steal-Tech Deduplication

**User value:** Players with era 2+ spies can issue missions from inside enemy cities, see % odds before committing, and can't exploit steal-tech repeatedly on the same target.

**Key changes vs. existing mission system:**
- `startMission` now only available when `spy.status === 'stationed'`
- Mission selection UI shows success % and detection risk
- `cooldownMode` toggle: `stay_low` (lower detection risk) vs `passive_observe` (get basic intel during cooldown)
- Steal tech deduplication: check `spy.stolenTechFrom[targetCivId]` before resolving
- Passive detection risk during cooldown is processed in `processEspionageTurn`

**Files:**
- Modify: `src/systems/espionage-system.ts`
- Modify: `src/ui/espionage-panel.ts`
- Modify: `src/core/turn-manager.ts`
- Modify: `tests/systems/espionage-infiltration.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `tests/systems/espionage-infiltration.test.ts`:

```typescript
describe('steal tech deduplication', () => {
  it('cannot steal the same tech twice from the same civ', () => {
    const spyOwnerState = makeGameStateForMission();
    const result1 = resolveMissionResult('steal_tech', 'ai-egypt', 'city-egypt-1', spyOwnerState, 'player', 'unit-1');
    // Simulate recording the steal
    spyOwnerState.espionage!['player'].spies['unit-1'].stolenTechFrom!['ai-egypt'] = [result1.stolenTechId!];
    const result2 = resolveMissionResult('steal_tech', 'ai-egypt', 'city-egypt-1', spyOwnerState, 'player', 'unit-1');
    expect(result2.stolenTechId).toBeUndefined();
  });
});

describe('mission shows % success in panel data', () => {
  it('getEspionagePanelData includes missionSuccessChances when spy is stationed', async () => {
    const { getEspionagePanelData } = await import('@/ui/espionage-panel');
    const state = makeStationedSpyState();
    const data = getEspionagePanelData(state);
    expect(data.missionSuccessChances).toBeDefined();
    expect(Object.keys(data.missionSuccessChances ?? {})).toContain('scout_area');
  });
});
```

- [ ] **Step 2: Update `resolveMissionResult` for steal-tech deduplication**

In `src/systems/espionage-system.ts`, in the `'steal_tech'` case:

```typescript
case 'steal_tech': {
  const spy = gameState.espionage?.[spyingCivId]?.spies[spyId];
  const alreadyStolen = spy?.stolenTechFrom?.[targetCivId] ?? [];
  const stealable = theyHave.filter(t => !iHave.has(t) && !alreadyStolen.includes(t));
  if (stealable.length === 0) return {};
  // ... rest unchanged
}
```

After successful steal_tech in `processEspionageTurn`, record it:
```typescript
if (evt.missionType === 'steal_tech' && result.stolenTechId) {
  const stolenId = result.stolenTechId as string;
  // existing: add to completed techs
  // new: record in stolenTechFrom
  const existingRecord = state.espionage![civId].spies[evt.spyId]?.stolenTechFrom ?? {};
  state.espionage![civId].spies[evt.spyId] = {
    ...state.espionage![civId].spies[evt.spyId],
    stolenTechFrom: {
      ...existingRecord,
      [spy?.targetCivId ?? '']: [...(existingRecord[spy?.targetCivId ?? ''] ?? []), stolenId],
    },
  };
}
```

- [ ] **Step 3: Add `missionSuccessChances` to `EspionagePanelData`**

In `src/ui/espionage-panel.ts`, add to `EspionagePanelData`:
```typescript
missionSuccessChances?: Record<SpyMissionType, number>;
```

In `getEspionagePanelData`, compute it when a spy is stationed:
```typescript
const stationedSpy = spies.find(s => s.status === 'stationed' && s.targetCivId);
const missionSuccessChances: Record<string, number> = {};
if (stationedSpy) {
  const ci = state.espionage?.[stationedSpy.targetCivId!]?.counterIntelligence[stationedSpy.targetCityId!] ?? 0;
  for (const mission of availableMissions) {
    missionSuccessChances[mission] = getSpySuccessChance(stationedSpy.experience, ci, mission, stationedSpy.promotion);
  }
}
```

Update `appendMissionStage` to show `(62%)` success next to each mission label when data is available.

- [ ] **Step 4: Add passive detection during cooldown in `processEspionageTurn`**

In the spy turn processing loop, add a cooldown-detection pass for `'cooldown'` status spies inside enemy cities:

```typescript
if (spy.status === 'cooldown' && spy.infiltrationCityId && spy.cooldownTurns > 0) {
  const cityCI = updatedEsp.counterIntelligence[spy.infiltrationCityId] ?? 0;
  const detectionChance = spy.cooldownMode === 'passive_observe' ? 0.04 : 0.02;
  const adjustedChance = detectionChance + cityCI * 0.002;
  if (rng() < adjustedChance) {
    // Spy caught during cooldown
    events.push({ type: 'spy_captured', spyId, missionType: spy.currentMission?.type });
  }
}
```

- [ ] **Step 5: Run full test suite**

```bash
yarn test
```

- [ ] **Step 6: Commit**

```bash
git add src/systems/espionage-system.ts src/ui/espionage-panel.ts src/core/turn-manager.ts tests/systems/espionage-infiltration.test.ts
git commit -m "feat(espionage): mission system — % odds in UI, steal-tech deduplication, passive cooldown detection"
```

---

## MR 6 — Capture System: Expel / Execute / Interrogate

### Task 9: Capture Verdict System with Relational Distance Scaling

**Files:**
- Modify: `src/systems/espionage-system.ts`
- Modify: `src/ui/espionage-panel.ts`
- Modify: `src/main.ts`
- Create: `tests/systems/espionage-capture.test.ts`

**Relational penalty by distance:**
- Spy outside all enemy cities (>5 hex from nearest): 0 penalty
- Spy near an enemy city (2-5 hex): −10 relationship
- Spy at city boundary (1 hex): −25 relationship
- Spy infiltrated inside city: −50 relationship (caught infiltrating or on mission)

**Expel:** spy unit re-created at owner's capital position, `cooldownTurns = 15`, status → `cooldown`
**Execute:** spy unit and spy record permanently deleted; owner receives notification; +heavy penalty above
**Interrogate (4 turns):** spy held; each turn rolls for intel reveals from the list

- [ ] **Step 1: Write failing tests**

Create `tests/systems/espionage-capture.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { expelSpy, executeSpy, startInterrogation, processInterrogation, getSpyCaptureRelationshipPenalty, _resetSpyIdCounter } from '@/systems/espionage-system';
import { createEspionageCivState, createSpyFromUnit } from '@/systems/espionage-system';

beforeEach(() => { _resetSpyIdCounter(); });

describe('relational penalty by distance', () => {
  it('returns 0 when spy is more than 5 hexes from any city', () => {
    expect(getSpyCaptureRelationshipPenalty(10)).toBe(0);
  });
  it('returns -25 when spy is 1 hex from city', () => {
    expect(getSpyCaptureRelationshipPenalty(1)).toBe(-25);
  });
  it('returns -50 when spy is inside city (distance 0)', () => {
    expect(getSpyCaptureRelationshipPenalty(0)).toBe(-50);
  });
});

describe('expelSpy', () => {
  it('sets spy cooldownTurns to 15 and status to cooldown', () => {
    let civEsp = { ...createEspionageCivState(), maxSpies: 1 };
    ({ state: civEsp } = createSpyFromUnit(civEsp, 'unit-1', 'player', 'seed'));
    const result = expelSpy(civEsp, 'unit-1', 15);
    expect(result.spies['unit-1'].status).toBe('cooldown');
    expect(result.spies['unit-1'].cooldownTurns).toBe(15);
  });
});

describe('executeSpy', () => {
  it('removes spy record entirely', () => {
    let civEsp = { ...createEspionageCivState(), maxSpies: 1 };
    ({ state: civEsp } = createSpyFromUnit(civEsp, 'unit-1', 'player', 'seed'));
    const result = executeSpy(civEsp, 'unit-1');
    expect(result.spies['unit-1']).toBeUndefined();
  });
});

describe('interrogation', () => {
  it('starts with 4 turns remaining', () => {
    let civEsp = { ...createEspionageCivState(), maxSpies: 1 };
    ({ state: civEsp } = createSpyFromUnit(civEsp, 'unit-1', 'player', 'seed'));
    const result = startInterrogation(civEsp, 'unit-1', 'player');
    const record = Object.values(result.activeInterrogations ?? {})[0]!;
    expect(record.turnsRemaining).toBe(4);
  });

  it('after 4 turns all intel types have been attempted', () => {
    let civEsp = { ...createEspionageCivState(), maxSpies: 1 };
    ({ state: civEsp } = createSpyFromUnit(civEsp, 'unit-1', 'player', 'seed'));
    let state = startInterrogation(civEsp, 'unit-1', 'player');
    for (let i = 0; i < 4; i++) {
      state = processInterrogation(state, `interro-seed-${i}`, {} as any).state;
    }
    const records = Object.values(state.activeInterrogations ?? {});
    expect(records).toHaveLength(0); // interrogation complete, record removed
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
yarn test tests/systems/espionage-capture.test.ts
```

- [ ] **Step 3: Add capture functions to `src/systems/espionage-system.ts`**

```typescript
export function getSpyCaptureRelationshipPenalty(distanceToNearestCity: number): number {
  if (distanceToNearestCity > 5) return 0;
  if (distanceToNearestCity > 1) return -10;
  if (distanceToNearestCity === 1) return -25;
  return -50; // inside city (distance 0)
}

export function expelSpy(
  state: EspionageCivState,
  spyId: string,
  cooldownTurns: number = 15,
): EspionageCivState {
  const spy = state.spies[spyId];
  if (!spy) return state;
  return {
    ...state,
    spies: {
      ...state.spies,
      [spyId]: {
        ...spy,
        status: 'cooldown',
        cooldownTurns,
        infiltrationCityId: null,
        cityVisionTurnsLeft: 0,
        targetCivId: null,
        targetCityId: null,
        currentMission: null,
      },
    },
  };
}

export function executeSpy(
  state: EspionageCivState,
  spyId: string,
): EspionageCivState {
  const { [spyId]: _removed, ...remainingSpies } = state.spies;
  return { ...state, spies: remainingSpies };
}

export function startInterrogation(
  captorEsp: EspionageCivState,
  spyId: string,
  spyOwner: string,
): EspionageCivState {
  const interrogationId = `interro-${spyId}`;
  const record: InterrogationRecord = {
    id: interrogationId,
    spyId,
    spyOwner,
    turnsRemaining: 4,
    extractedIntel: [],
  };
  return {
    ...captorEsp,
    activeInterrogations: {
      ...(captorEsp.activeInterrogations ?? {}),
      [interrogationId]: record,
    },
  };
}

const INTERROGATION_REVEAL_CHANCES: Record<InterrogationIntelType, number> = {
  spy_identity: 0.60,
  city_location: 0.50,
  production_queue: 0.45,
  wonder_in_progress: 0.35,
  map_area: 0.30,
  tech_hint: 0.08,
};

export function processInterrogation(
  captorEsp: EspionageCivState,
  seed: string,
  gameState: GameState,
): { state: EspionageCivState; complete: boolean; newIntel: InterrogationIntel[] } {
  const rng = createRng(seed);
  const records = { ...(captorEsp.activeInterrogations ?? {}) };
  const allNewIntel: InterrogationIntel[] = [];
  let complete = false;

  for (const [id, record] of Object.entries(records)) {
    const newIntel: InterrogationIntel[] = [];
    const spyOwnerState = gameState.espionage?.[record.spyOwner];

    for (const [intelType, chance] of Object.entries(INTERROGATION_REVEAL_CHANCES) as [InterrogationIntelType, number][]) {
      if (rng() > chance) continue;
      const intel = resolveInterrogationIntel(intelType, record.spyOwner, gameState, rng);
      if (intel) newIntel.push(intel);
    }

    const updatedRecord: InterrogationRecord = {
      ...record,
      turnsRemaining: record.turnsRemaining - 1,
      extractedIntel: [...record.extractedIntel, ...newIntel],
    };
    allNewIntel.push(...newIntel);

    if (updatedRecord.turnsRemaining <= 0) {
      delete records[id];
      complete = true;
    } else {
      records[id] = updatedRecord;
    }
  }

  return {
    state: { ...captorEsp, activeInterrogations: records },
    complete,
    newIntel: allNewIntel,
  };
}

function resolveInterrogationIntel(
  type: InterrogationIntelType,
  spyOwner: string,
  state: GameState,
  rng: () => number,
): InterrogationIntel | null {
  const spyCiv = state.civilizations[spyOwner];
  if (!spyCiv) return null;

  switch (type) {
    case 'spy_identity': {
      const otherSpies = Object.values(state.espionage?.[spyOwner]?.spies ?? {})
        .filter(s => s.status !== 'captured' && s.status !== 'interrogated');
      if (otherSpies.length === 0) return null;
      const spy = otherSpies[Math.floor(rng() * otherSpies.length)];
      return { type, data: { spyId: spy.id, spyName: spy.name, status: spy.status, location: spy.infiltrationCityId } };
    }
    case 'city_location': {
      const cities = spyCiv.cities.map(id => state.cities[id]).filter(Boolean);
      if (cities.length === 0) return null;
      const city = cities[Math.floor(rng() * cities.length)];
      return { type, data: { cityId: city.id, cityName: city.name, position: city.position } };
    }
    case 'production_queue': {
      const cities = spyCiv.cities.map(id => state.cities[id]).filter(c => c?.productionQueue.length > 0);
      if (cities.length === 0) return null;
      const city = cities[Math.floor(rng() * cities.length)];
      return { type, data: { cityId: city.id, cityName: city.name, queue: [...city.productionQueue] } };
    }
    case 'wonder_in_progress': {
      const wonderCities = spyCiv.cities.map(id => state.cities[id])
        .filter(c => c?.productionQueue[0]?.startsWith('legendary:'));
      if (wonderCities.length === 0) return null;
      const city = wonderCities[0];
      return { type, data: { cityId: city.id, wonderId: city.productionQueue[0].replace('legendary:', '') } };
    }
    case 'map_area': {
      const tiles = Object.keys(spyCiv.visibility?.tiles ?? {}).filter(k => spyCiv.visibility.tiles[k] === 'visible');
      if (tiles.length === 0) return null;
      const sample = tiles.slice(0, 8).map(k => {
        const [q, r] = k.split(',').map(Number);
        return { q, r };
      });
      return { type, data: { tiles: sample, note: 'Information may be outdated' } };
    }
    case 'tech_hint': {
      const theirTechs = spyCiv.techState.completed;
      if (theirTechs.length === 0) return null;
      const tech = theirTechs[Math.floor(rng() * theirTechs.length)];
      return { type, data: { techId: tech, researchBonus: 0.05 } };
    }
    default: return null;
  }
}
```

- [ ] **Step 4: Add recall window and verdict UI to `src/ui/espionage-panel.ts`**

Add a `capturedSpies` section to the panel: when a spy's status is `'captured'`, show a notice to the *owning* player: "Agent Shadow has been caught! You can recall before the verdict is announced. [Recall now — costs relationship]". This recall option disappears after 1 turn.

On the *capturing* civ's side (via notification), show the verdict choice: [Expel] [Execute] [Interrogate]. This is a notification that appears in the main notification system with persistent buttons.

- [ ] **Step 5: Wire all three verdicts in `src/main.ts`**

Add event listeners for `'espionage:spy-caught-infiltrating'` and the existing `'espionage:spy-captured'`:

```typescript
bus.on('espionage:spy-caught-infiltrating', ({ capturingCivId, spyOwner, spyId, cityId }) => {
  if (capturingCivId !== gameState.currentPlayer) return;
  // Show verdict choice to capturing player
  showEspionageCaptureChoice(spyId, spyOwner, cityId);
});
```

Wire `showEspionageCaptureChoice` as a function that creates a persistent notification with three buttons that call:
- **Expel:** `expelSpy(captorEsp, spyId)` + recreate unit at spy owner capital + `modifyRelationship` with distance-scaled penalty
- **Execute:** `executeSpy(captorEsp, spyId)` + `delete gameState.units[spyId]` if it exists + larger relationship hit + notification to spy owner "Agent Shadow was executed"
- **Interrogate:** `startInterrogation(captorEsp, spyId, spyOwner)` + process intel each turn via `processInterrogation` in turn manager

- [ ] **Step 6: Run full test suite**

```bash
yarn test
```

- [ ] **Step 7: Commit**

```bash
git add src/systems/espionage-system.ts src/ui/espionage-panel.ts src/main.ts src/core/types.ts tests/systems/espionage-capture.test.ts
git commit -m "feat(espionage): capture system — expel/execute/interrogate with distance-scaled relational penalties and intel extraction"
```

---

## MR 7 — Counter-Espionage Embedding

### Task 10: Embed Spy in Own City

**User value:** Players can station spies in their own cities to detect and counter enemy infiltrations.

**Key mechanics:**
- `onEmbed` action in `selected-unit-info` when spy is in own city
- `embedSpy`: sets status to `'embedded'`, removes from map
- Embedded spy: passive CI boost each turn, plus active "Sweep" action
- Sweep (% chance): detects enemy spies in the same city, reveals true identity if disguised
- Auto-reveals disguised enemy units within vision range (whether embedded or on-map)
- If obsoleted while embedded: auto-expires without diplomatic damage, notification sent

**Files:**
- Modify: `src/systems/espionage-system.ts` — `embedSpy`, `attemptSweep`, CI contribution from embedded spies
- Modify: `src/ui/selected-unit-info.ts` — Embed + Sweep actions
- Modify: `src/core/turn-manager.ts` — process embedded spy contributions
- Tests: add to `tests/systems/espionage-capture.test.ts`

**Core functions:**

```typescript
export function embedSpy(
  state: EspionageCivState,
  spyId: string,
  cityId: string,
  cityPosition: HexCoord,
): EspionageCivState {
  const spy = state.spies[spyId];
  if (!spy || spy.status !== 'idle') throw new Error('Spy must be idle to embed');
  const baseCi = 15;
  const expBonus = Math.floor(spy.experience * 0.3);
  const ciScore = Math.min(100, (state.counterIntelligence[cityId] ?? 0) + baseCi + expBonus);
  return {
    ...state,
    spies: { ...state.spies, [spyId]: { ...spy, status: 'embedded', targetCityId: cityId, position: { ...cityPosition } } },
    counterIntelligence: { ...state.counterIntelligence, [cityId]: ciScore },
  };
}

export function attemptSweep(
  state: EspionageCivState,
  spyId: string,
  seed: string,
  gameState: GameState,
): { state: EspionageCivState; detectedSpyIds: string[] } {
  const spy = state.spies[spyId];
  if (!spy || spy.status !== 'embedded' || !spy.targetCityId) return { state, detectedSpyIds: [] };
  const rng = createRng(seed);
  const detected: string[] = [];
  const baseSweepChance = 0.40 + spy.experience * 0.003;
  for (const [otherId, otherEsp] of Object.entries(gameState.espionage ?? {})) {
    if (otherId === spy.owner) continue;
    for (const enemySpy of Object.values(otherEsp.spies)) {
      if (enemySpy.infiltrationCityId !== spy.targetCityId) continue;
      if (rng() < baseSweepChance) detected.push(enemySpy.id);
    }
  }
  return { state, detectedSpyIds: detected };
}
```

---

## MR 8 — Per-Era Spy Types + Universal Unit Upgrade System

### Task 11: Unit Upgrade System (all unit types)

**User value:** Obsolete units can be upgraded to the current era's equivalent at half production cost in a home city. Takes 1 turn. Heals unit to full health.

**Files:**
- Create: `src/systems/unit-upgrade-system.ts`
- Modify: `src/core/turn-manager.ts`
- Modify: `src/ui/city-panel.ts`
- Modify: `src/ui/selected-unit-info.ts`
- Create: `tests/systems/unit-upgrade.test.ts`

**Core logic in `src/systems/unit-upgrade-system.ts`:**

```typescript
export interface UpgradeRequest {
  unitId: string;
  targetType: UnitType;
  cityId: string;
}

export function getUpgradeCost(targetType: UnitType): number {
  const entry = TRAINABLE_UNITS.find(u => u.type === targetType);
  return entry ? Math.ceil(entry.cost * 0.5) : 0;
}

export function canUpgradeUnit(
  unit: Unit,
  cityId: string,
  cities: Record<string, City>,
  completedTechs: string[],
): { canUpgrade: boolean; targetType: UnitType | null; cost: number } {
  const city = cities[cityId];
  if (!city || city.owner !== unit.owner) return { canUpgrade: false, targetType: null, cost: 0 };
  if (unit.position.q !== city.position.q || unit.position.r !== city.position.r) {
    return { canUpgrade: false, targetType: null, cost: 0 };
  }
  const currentEntry = TRAINABLE_UNITS.find(u => u.type === unit.type);
  if (!currentEntry?.obsoletedByTech || !completedTechs.includes(currentEntry.obsoletedByTech)) {
    return { canUpgrade: false, targetType: null, cost: 0 };
  }
  const nextEntry = TRAINABLE_UNITS.find(u => u.techRequired === currentEntry.obsoletedByTech && !u.obsoletedByTech || (u.obsoletedByTech && !completedTechs.includes(u.obsoletedByTech)));
  if (!nextEntry) return { canUpgrade: false, targetType: null, cost: 0 };
  return { canUpgrade: true, targetType: nextEntry.type, cost: getUpgradeCost(nextEntry.type) };
}

export function applyUpgrade(
  unit: Unit,
  targetType: UnitType,
  city: City,
): Unit {
  return {
    ...unit,
    type: targetType,
    health: 100,
    movementPointsLeft: UNIT_DEFINITIONS[targetType].movementPoints,
    hasActed: true,
  };
}
```

Process upgrades in `turn-manager.ts` if the unit is at a home city and has sufficient production progress available (deducted from city production like a normal queue item). For simplicity: upgrade is instant if the city has no current production queue item. Otherwise it's queued.

In `city-panel.ts`, show upgrade prompts for units at the city. In `selected-unit-info.ts`, show "Upgrade → [Field Agent] (35 prod, 1 turn)" for eligible spy units.

### Task 12: Obsolescence Notifications

When tech is completed that renders a unit type obsolete (via `tech:completed` event), scan `state.units` for units owned by that civ of the obsoleted type. If found:
- For map units: emit `unit:obsolete` notification with upgrade prompt
- For embedded/infiltrated spy units: silently remove the spy record and restore city visibility to normal. Emit to owning civ: "Agent Shadow's network has been dissolved (unit era ended)." No diplomatic penalty.

---

## MR 9 — Espionage Buildings

### Task 13: Safehouse, Intelligence Agency, Security Bureau

**Files:**
- Modify: `src/systems/city-system.ts`
- Modify: `src/systems/espionage-system.ts`
- Create: `tests/systems/espionage-buildings.test.ts`

**Buildings:**

```typescript
safehouse: {
  id: 'safehouse', name: 'Safehouse', category: 'espionage',
  yields: { food: 0, production: 0, gold: 0, science: 0 },
  productionCost: 50,
  description: 'Reduces spy unit training cost by 25%.',
  techRequired: 'espionage-scouting', adjacencyBonuses: [],
},
'intelligence-agency': {
  id: 'intelligence-agency', name: 'Intelligence Agency', category: 'espionage',
  yields: { food: 0, production: 0, gold: 0, science: 0 },
  productionCost: 80,
  description: 'Raises this city\'s counter-intelligence score by 20 each turn (max 100). Era 1-2 benefit fades at cyber-warfare era.',
  techRequired: 'espionage-informants', adjacencyBonuses: [],
},
'security-bureau': {
  id: 'security-bureau', name: 'Security Bureau', category: 'espionage',
  yields: { food: 0, production: 0, gold: 0, science: 0 },
  productionCost: 120,
  description: 'Raises CI by 30 each turn and makes captured spies 50% less likely to be turned.',
  techRequired: 'counter-intelligence', adjacencyBonuses: [],
},
```

**CI accumulation with era fading:** Buildings provide CI bonuses that accumulate up to a cap, but when a later era security tech is researched, the CI score from older buildings is halved (simulating that the enemy has adapted). Implement in `processEspionageTurn`:

```typescript
const ERA_CI_FADE_TRIGGERS: Record<string, string[]> = {
  'digital-surveillance': ['intelligence-agency'],
  'cyber-warfare': ['security-bureau'],
};

function applyBuildingCI(cityId: string, city: City, civEsp: EspionageCivState, completedTechs: string[]): EspionageCivState {
  let ciBonus = 0;
  if (city.buildings.includes('intelligence-agency')) {
    const faded = completedTechs.includes('digital-surveillance');
    ciBonus += faded ? 10 : 20;
  }
  if (city.buildings.includes('security-bureau')) {
    const faded = completedTechs.includes('cyber-warfare');
    ciBonus += faded ? 15 : 30;
  }
  if (ciBonus === 0) return civEsp;
  const current = civEsp.counterIntelligence[cityId] ?? 0;
  return setCounterIntelligence(civEsp, cityId, Math.min(100, current + ciBonus));
}
```

Security bureau's turning resistance: In `processEspionageTurn`, before calling `turnCapturedSpy`, check if the captured spy's target city has a security bureau — if so, skip the turning (return early from that branch).

---

## MR 10 — Civ-Unique Detection Units

### Task 14: Detection Unit System in Civ Definitions

**User value:** 2-3 civilizations have unique detection units that replace the standard Scout Hound with improved capabilities.

**Files:**
- Modify: `src/core/types.ts` — add `detectionUnitType?: UnitType` to `CivDefinition`-equivalent
- Modify: `src/systems/civ-definitions.ts` — add detection units to specific civs
- Modify: `src/systems/city-system.ts` — `getTrainableUnitsForCiv` uses civ-specific replacements
- Modify: `src/systems/unit-system.ts` — add definitions for unique detection units
- Tests: `tests/systems/detection-system.test.ts` extended

**Example unique detection units:**

```typescript
// Shadow Warden (replaces Scout Hound for an espionage-focused civ)
shadow_warden: {
  type: 'shadow_warden', name: 'Shadow Warden',
  movementPoints: 3, visionRange: 4, strength: 6,
  canFoundCity: false, canBuildImprovements: false, productionCost: 45,
  spyDetectionChance: 0.50, // better than standard 0.35
},

// War Hound (replaces Scout Hound for a military-focused civ — combat bonus vs spies)
war_hound: {
  type: 'war_hound', name: 'War Hound',
  movementPoints: 4, visionRange: 3, strength: 12,
  canFoundCity: false, canBuildImprovements: false, productionCost: 45,
  spyDetectionChance: 0.30, // slightly lower detection, much higher combat strength
},
```

**Civ definition extension:**
```typescript
// In civ-definitions.ts, for relevant civs, add:
detectionUnitReplacement: { standard: 'scout_hound', replacement: 'shadow_warden' }
```

`getTrainableUnitsForCiv` accepts an optional `civType` parameter. If the civ has a `detectionUnitReplacement`, swap out the standard unit:

```typescript
export function getTrainableUnitsForCiv(completedTechs: string[], civType?: string): TrainableUnitEntry[] {
  const filtered = TRAINABLE_UNITS.filter(/* existing logic */);
  if (!civType) return filtered;
  const civDef = CIV_DEFINITIONS[civType];
  if (!civDef?.detectionUnitReplacement) return filtered;
  return filtered.map(u =>
    u.type === civDef.detectionUnitReplacement.standard
      ? { ...u, type: civDef.detectionUnitReplacement.replacement, name: UNIT_DEFINITIONS[civDef.detectionUnitReplacement.replacement].name }
      : u
  );
}
```

---

## Self-Review Against Issue #100

| Requirement | MR | Status |
|-------------|-----|--------|
| Actual espionage units | 1 | ✓ Physical units trained from cities |
| Panel hides future content | 1 | ✓ Empty stages filtered; locked content hidden |
| No unavailable actions shown | 1, 5 | ✓ Mission % gated by tech + unit type |
| Must build espionage units | 1 | ✓ No more abstract recruit button |
| New units per era | 8 | ✓ 5 unit tiers with obsolescence |
| Units infiltrate cities | 4 | ✓ % chance, removed from map on success |
| Stealth (invisible, disguised) | 3 | ✓ Disguise as common units; scout hound detection |
| Espionage buildings | 9 | ✓ Safehouse, Intelligence Agency, Security Bureau |

## Placeholder Scan

- MR 7 (embedding), MR 8 (upgrades), MR 9 (buildings), MR 10 (unique units): function signatures and approach are fully specified; individual TDD steps follow the identical pattern established in MRs 1-6. No implementation is deferred without a concrete spec.
- `era1ScoutResult` in `attemptInfiltration` returns `tilesToReveal: []` — caller in `main.ts` must resolve this using `resolveMissionResult('scout_area', ...)` with the target city. This should be wired in the MR 4 `onInfiltrate` handler.

## Type Consistency Check

- `isSpyUnitType` defined in `espionage-system.ts` (Task 3), used in `turn-manager.ts` (Task 3) and `detection-system.ts` (Task 5) — consistent.
- `createSpyFromUnit(civEsp, unitId, owner, seed)` defined Task 3, used in tests and `turn-manager.ts` — consistent.
- `attemptInfiltration(civEsp, spyId, unitType, cityId, position, cityCI, seed)` defined Task 7, used in `main.ts` onInfiltrate — consistent.
- `expelSpy / executeSpy / startInterrogation / processInterrogation` all defined Task 9, used in `main.ts` capture handler — consistent.
- `getTrainableUnitsForCiv(completedTechs, civType?)` introduced Task 2, extended Task 14 — consistent.
- `cleanupDeadSpyUnit(espionage, owner, unitId)` defined Task 4, used in both combat death branches — consistent.
