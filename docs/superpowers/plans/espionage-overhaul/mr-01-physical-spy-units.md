# MR 1 — Physical Spy Units + Panel Privacy

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the abstract "Recruit Spy" button with physical spy units trained from cities. Spy units appear on the map and can be targeted in combat. Locked panel content is hidden until relevant techs are researched.

**Prerequisite MRs:** None — this is the foundation.

---

## Task 1: Core Type Changes

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
  unitType: UnitType;                  // physical unit type — needed to recreate unit on expulsion
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

- [ ] **Step 5: Fix `initializeEspionage` maxSpies guard**

In `src/systems/espionage-system.ts`, line ~837, change:
```typescript
civState.maxSpies = Math.max(1, maxSpies);
```
to:
```typescript
civState.maxSpies = maxSpies;
```
A civ with no espionage techs should start with 0 max spies and earn the cap by researching techs. The `Math.max(1, ...)` guard was a safety net from the abstract recruit era — remove it.

- [ ] **Step 6: Fix references to `'traveling'` status**

Search and update any code that uses `spy.status === 'traveling'` or `SpyStatus` comparisons that include `'traveling'`. In `src/systems/espionage-system.ts`, the `processSpyTurn` function handles `'traveling' → 'stationed'`. Since movement is now physical, **delete** the `'traveling'` branch entirely. In `main.ts`, find any `assignSpy` calls from the panel and remove/update them (the "Assign" flow is replaced by physical movement + Infiltrate in MR 4).

- [ ] **Step 7: Commit**

```bash
git add src/core/types.ts tests/systems/espionage-system.test.ts
git commit -m "feat(espionage): core type additions — spy unit types, revised SpyStatus, DisguiseType, interrogation records"
```

---

## Task 2: Unit Definitions and TRAINABLE_UNITS

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
  canFoundCity: false, canBuildImprovements: false, productionCost: 55,
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
scout_hound: 'Detection unit. Patrols territory and has a 35% chance per turn to reveal disguised or stealthed spy units within vision range. Moving an enemy unit into a tile occupied by a spy triggers combat — spies have low strength and usually lose.',
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
  { type: 'scout_hound', name: 'Scout Hound', cost: 55, techRequired: 'lookouts' },
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

## Task 3: Auto-Create Spy Record on Unit Training + Panel Privacy

**Files:**
- Modify: `src/systems/espionage-system.ts`
- Modify: `src/core/turn-manager.ts`
- Modify: `src/ui/espionage-panel.ts`
- Create: `tests/integration/spy-lifecycle.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/integration/spy-lifecycle.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { EventBus } from '@/core/event-bus';
import { createEspionageCivState, createSpyFromUnit } from '@/systems/espionage-system';
import { processTurn } from '@/core/turn-manager';
import type { GameState } from '@/core/types';

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
  unitType: UnitType,
  seed: string,
): { state: EspionageCivState; spy: Spy } {
  const rng = createRng(seed);
  const nameIndex = Math.floor(rng() * SPY_NAMES.length);
  const spy: Spy = {
    id: unitId,
    owner,
    name: `Agent ${SPY_NAMES[nameIndex]}`,
    unitType,
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
      result.completedUnit,
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

## Task 4: Combat Death Cleanup + AI Training

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
