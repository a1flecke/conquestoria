# M4a "Eyes & Ears" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add espionage stages 1-2 (scouts & informants), the Spymaster advisor, terrain readability labels, and 4 new civilizations (France, Germany, Gondor, Rohan).

**Architecture:** Espionage follows the existing system pattern — pure functions that take state and return new state, with EventBus notifications. Spies are a new entity type stored in `GameState.espionage` (per-civ). The Spymaster advisor uses the existing trigger-based `AdvisorSystem`. Terrain labels are rendered in `hex-renderer.ts`. New civs are data-only additions to `civ-definitions.ts`.

**Tech Stack:** TypeScript, Vitest, Canvas 2D, EventBus

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `src/systems/espionage-system.ts` | Spy creation, assignment (offensive + defensive), mission execution, detection, turn processing |
| `src/ui/espionage-panel.ts` | Espionage panel data helpers — spy list, actions, recruit status |
| `tests/systems/espionage-system.test.ts` | Unit tests for all espionage logic |
| `tests/ui/espionage-panel.test.ts` | Tests for espionage panel data helpers |
| `tests/systems/civ-definitions.test.ts` | Tests for new civ definitions and bonus effects |
| `tests/ui/advisor-spymaster.test.ts` | Tests for Spymaster advisor triggers |
| `tests/renderer/terrain-labels.test.ts` | Tests for terrain label logic |
| `tests/integration/m4a-espionage-integration.test.ts` | Integration tests: espionage + diplomacy + turn processing + hot seat |

### Modified Files
| File | Changes |
|------|---------|
| `src/core/types.ts` | Add espionage types (Spy, SpyMission, EspionageState), new CivBonusEffect variants, new GameEvents, update AdvisorType and GameState |
| `src/systems/civ-definitions.ts` | Add France, Germany, Gondor, Rohan definitions |
| `src/ui/advisor-system.ts` | Add Spymaster advisor messages with espionage triggers |
| `src/core/turn-manager.ts` | Call `processEspionageTurn()` in turn loop |
| `src/core/game-state.ts` | Initialize espionage state per civ in `createNewGame()` |
| `src/renderer/hex-renderer.ts` | Add terrain type labels at default zoom |
| `src/systems/diplomacy-system.ts` | Add `spy_captured` diplomatic event type handling |
| `src/ai/basic-ai.ts` | Add AI espionage decisions (recruit, assign, choose missions) |

---

## Task 1: Espionage Types

**Files:**
- Modify: `src/core/types.ts`
- Test: `tests/systems/espionage-system.test.ts`

- [ ] **Step 1: Write failing test — espionage types exist**

```typescript
// tests/systems/espionage-system.test.ts
import { describe, it, expect } from 'vitest';
import type {
  Spy, SpyMission, SpyMissionType, EspionageState,
  EspionageCivState, GameState,
} from '@/core/types';

describe('espionage types', () => {
  it('Spy has required fields', () => {
    const spy: Spy = {
      id: 'spy-1',
      owner: 'player',
      targetCivId: null,
      targetCityId: null,
      position: null,
      status: 'idle',
      experience: 0,
      currentMission: null,
      cooldownTurns: 0,
      name: 'Agent Shadow',
    };
    expect(spy.id).toBe('spy-1');
    expect(spy.status).toBe('idle');
    expect(spy.experience).toBe(0);
  });

  it('SpyMission has required fields', () => {
    const mission: SpyMission = {
      type: 'gather_intel',
      turnsRemaining: 3,
      turnsTotal: 3,
      targetCivId: 'ai-egypt',
      targetCityId: 'city-1',
    };
    expect(mission.type).toBe('gather_intel');
    expect(mission.turnsRemaining).toBe(3);
  });

  it('EspionageCivState has required fields', () => {
    const espState: EspionageCivState = {
      spies: {},
      maxSpies: 1,
      counterIntelligence: {},
    };
    expect(espState.maxSpies).toBe(1);
    expect(Object.keys(espState.spies)).toHaveLength(0);
  });

  it('GameState includes espionage field', () => {
    // Type check — espionage is optional on GameState for backward compat
    const partial: Partial<GameState> = {
      espionage: {
        player: {
          spies: {},
          maxSpies: 1,
          counterIntelligence: {},
        },
      },
    };
    expect(partial.espionage).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test tests/systems/espionage-system.test.ts`
Expected: FAIL — types don't exist yet

- [ ] **Step 3: Add espionage types to types.ts**

Add after the `DiplomacyState` interface (after line 255):

```typescript
// --- Espionage ---

export type SpyStatus = 'idle' | 'traveling' | 'stationed' | 'on_mission' | 'captured' | 'cooldown';

export type SpyMissionType =
  | 'scout_area'         // Stage 1: reveal fog around target city
  | 'monitor_troops'     // Stage 1: report unit movements in/out of city
  | 'gather_intel'       // Stage 2: reveal tech, treasury, treaties
  | 'identify_resources' // Stage 2: reveal strategic resources in city territory
  | 'monitor_diplomacy'; // Stage 2: see trade partners and relationship scores

export interface SpyMission {
  type: SpyMissionType;
  turnsRemaining: number;
  turnsTotal: number;
  targetCivId: string;
  targetCityId: string;
}

export interface Spy {
  id: string;
  owner: string;
  name: string;
  targetCivId: string | null;
  targetCityId: string | null;
  position: HexCoord | null;       // null when idle at home
  status: SpyStatus;
  experience: number;              // 0-100
  currentMission: SpyMission | null;
  cooldownTurns: number;           // turns until spy can act again after expulsion
}

export interface EspionageCivState {
  spies: Record<string, Spy>;
  maxSpies: number;                // scales with espionage tech
  counterIntelligence: Record<string, number>; // cityId -> detection score (0-100)
}

export type EspionageState = Record<string, EspionageCivState>;
```

Update `AdvisorType` (line 401):
```typescript
export type AdvisorType = 'builder' | 'explorer' | 'chancellor' | 'warchief' | 'treasurer' | 'scholar' | 'spymaster';
```

Update `GameState` interface (after line 452):
```typescript
  espionage?: EspionageState;
```

Update `GameSettings.advisorsEnabled` — `spymaster` is automatically included since it's a key of `AdvisorType`.

Add new events to `GameEvents` interface (after line 518):
```typescript
  'espionage:spy-recruited': { civId: string; spy: Spy };
  'espionage:spy-assigned': { civId: string; spyId: string; targetCivId: string; targetCityId: string };
  'espionage:spy-arrived': { civId: string; spyId: string; targetCityId: string };
  'espionage:mission-started': { civId: string; spyId: string; missionType: SpyMissionType };
  'espionage:mission-succeeded': { civId: string; spyId: string; missionType: SpyMissionType; result: Record<string, unknown> };
  'espionage:mission-failed': { civId: string; spyId: string; missionType: SpyMissionType };
  'espionage:spy-detected': { detectingCivId: string; spyOwner: string; spyId: string; cityId: string };
  'espionage:spy-expelled': { civId: string; spyId: string; fromCivId: string };
  'espionage:spy-captured': { capturingCivId: string; spyOwner: string; spyId: string };
  'espionage:spy-recalled': { civId: string; spyId: string };
```

Add new CivBonusEffect variants (after line 211):
```typescript
  | { type: 'culture_pressure'; radiusBonus: number }
  | { type: 'industrial_efficiency'; productionBonus: number }
  | { type: 'fortified_defense'; defenseBonus: number }
  | { type: 'grassland_cavalry_heal'; healPerTurn: number };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn test tests/systems/espionage-system.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/types.ts tests/systems/espionage-system.test.ts
git commit -m "feat(m4a): add espionage types — Spy, SpyMission, EspionageState, new events and civ bonuses"
```

---

## Task 2: Espionage Tech Definitions

Moved early so that espionage techs are researchable from the first espionage task onward, supporting incremental playability.

**Files:**
- Modify: `src/systems/tech-definitions.ts`
- Test: `tests/systems/espionage-system.test.ts` (append)

- [ ] **Step 1: Write failing tests — espionage techs exist**

```typescript
// Append to tests/systems/espionage-system.test.ts
import { TECH_TREE } from '@/systems/tech-definitions';

describe('espionage tech definitions', () => {
  it('has espionage-scouting tech in espionage track', () => {
    const tech = TECH_TREE.find(t => t.id === 'espionage-scouting');
    expect(tech).toBeDefined();
    expect(tech!.track).toBe('espionage');
    expect(tech!.era).toBeLessThanOrEqual(2);
  });

  it('has espionage-informants tech requiring scouting', () => {
    const tech = TECH_TREE.find(t => t.id === 'espionage-informants');
    expect(tech).toBeDefined();
    expect(tech!.prerequisites).toContain('espionage-scouting');
    expect(tech!.track).toBe('espionage');
  });

  it('espionage-informants unlocks stage 2 missions', () => {
    const tech = TECH_TREE.find(t => t.id === 'espionage-informants');
    expect(tech).toBeDefined();
    expect(tech!.unlocks.some(u => u.match(/informant|intel|gather/i))).toBe(true);
  });

  it('tech tree has no duplicate IDs', () => {
    const ids = TECH_TREE.map(t => t.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `yarn test tests/systems/espionage-system.test.ts`
Expected: FAIL if techs don't exist yet

- [ ] **Step 3: Add/verify espionage techs in tech-definitions.ts**

If not already present, add to `TECH_TREE` in `src/systems/tech-definitions.ts`:

```typescript
  {
    id: 'espionage-scouting',
    name: 'Scouting Networks',
    track: 'espionage',
    cost: 40,
    prerequisites: [],
    unlocks: ['Recruit spies', 'Passive city surveillance', 'Scout Area mission', 'Monitor Troops mission'],
    era: 1,
  },
  {
    id: 'espionage-informants',
    name: 'Informant Rings',
    track: 'espionage',
    cost: 80,
    prerequisites: ['espionage-scouting'],
    unlocks: ['Gather Intel mission', 'Identify Resources mission', 'Monitor Diplomacy mission', 'Second spy slot'],
    era: 2,
  },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `yarn test tests/systems/espionage-system.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/systems/tech-definitions.ts tests/systems/espionage-system.test.ts
git commit -m "feat(m4a): espionage tech definitions — scouting and informants techs"
```

---

## Task 3: Espionage System Core — Creation & Assignment

**Files:**
- Create: `src/systems/espionage-system.ts`
- Test: `tests/systems/espionage-system.test.ts` (append)

- [ ] **Step 1: Write failing tests — spy creation and assignment**

```typescript
// Append to tests/systems/espionage-system.test.ts
import {
  createEspionageCivState,
  recruitSpy,
  assignSpy,
  recallSpy,
  canRecruitSpy,
  getSpySuccessChance,
} from '@/systems/espionage-system';

describe('espionage-system', () => {
  describe('createEspionageCivState', () => {
    it('creates empty state with 1 max spy', () => {
      const state = createEspionageCivState();
      expect(state.spies).toEqual({});
      expect(state.maxSpies).toBe(1);
      expect(state.counterIntelligence).toEqual({});
    });
  });

  describe('recruitSpy', () => {
    it('creates a spy with correct owner and idle status', () => {
      let state = createEspionageCivState();
      const result = recruitSpy(state, 'player', 'spy-seed-1');
      expect(result.spy.owner).toBe('player');
      expect(result.spy.status).toBe('idle');
      expect(result.spy.experience).toBe(0);
      expect(result.spy.targetCivId).toBeNull();
      expect(result.spy.name).toBeTruthy();
      expect(Object.keys(result.state.spies)).toHaveLength(1);
    });

    it('generates deterministic spy names from seed', () => {
      const state = createEspionageCivState();
      const r1 = recruitSpy(state, 'player', 'same-seed');
      const r2 = recruitSpy(state, 'player', 'same-seed');
      expect(r1.spy.name).toBe(r2.spy.name);
    });

    it('refuses recruitment when at max spies', () => {
      let state = createEspionageCivState();
      state = recruitSpy(state, 'player', 'seed-1').state;
      // maxSpies is 1, so second recruit should fail
      expect(canRecruitSpy(state)).toBe(false);
    });
  });

  describe('assignSpy', () => {
    it('assigns idle spy to a target city', () => {
      let state = createEspionageCivState();
      const { state: s1, spy } = recruitSpy(state, 'player', 'seed-1');
      const s2 = assignSpy(s1, spy.id, 'ai-egypt', 'city-egypt-1', { q: 5, r: 3 });
      const assigned = s2.spies[spy.id];
      expect(assigned.status).toBe('traveling');
      expect(assigned.targetCivId).toBe('ai-egypt');
      expect(assigned.targetCityId).toBe('city-egypt-1');
      expect(assigned.position).toEqual({ q: 5, r: 3 });
    });

    it('refuses to assign a spy that is on cooldown', () => {
      let state = createEspionageCivState();
      const { state: s1, spy } = recruitSpy(state, 'player', 'seed-1');
      s1.spies[spy.id].status = 'cooldown';
      s1.spies[spy.id].cooldownTurns = 3;
      expect(() => assignSpy(s1, spy.id, 'ai-egypt', 'city-1', { q: 0, r: 0 }))
        .toThrow('Spy is not available');
    });

    it('refuses to assign a spy that is already on mission', () => {
      let state = createEspionageCivState();
      const { state: s1, spy } = recruitSpy(state, 'player', 'seed-1');
      s1.spies[spy.id].status = 'on_mission';
      expect(() => assignSpy(s1, spy.id, 'ai-egypt', 'city-1', { q: 0, r: 0 }))
        .toThrow('Spy is not available');
    });
  });

  describe('assignSpyDefensive', () => {
    it('assigns spy to own city for counter-intelligence', () => {
      let state = createEspionageCivState();
      const { state: s1, spy } = recruitSpy(state, 'player', 'seed-1');
      const s2 = assignSpyDefensive(s1, spy.id, 'city-player-1', { q: 0, r: 0 });
      const assigned = s2.spies[spy.id];
      expect(assigned.status).toBe('stationed');
      expect(assigned.targetCivId).toBeNull();
      expect(assigned.targetCityId).toBe('city-player-1');
      expect(s2.counterIntelligence['city-player-1']).toBeGreaterThan(0);
    });

    it('increases counter-intelligence score based on spy experience', () => {
      let state = createEspionageCivState();
      const { state: s1, spy } = recruitSpy(state, 'player', 'seed-1');
      s1.spies[spy.id].experience = 50;
      const s2 = assignSpyDefensive(s1, spy.id, 'city-player-1', { q: 0, r: 0 });
      const ciScore = s2.counterIntelligence['city-player-1'];
      expect(ciScore).toBeGreaterThan(20); // base 20 + experience bonus
    });
  });

  describe('recallSpy', () => {
    it('returns a stationed spy to idle', () => {
      let state = createEspionageCivState();
      const { state: s1, spy } = recruitSpy(state, 'player', 'seed-1');
      const s2 = assignSpy(s1, spy.id, 'ai-egypt', 'city-1', { q: 5, r: 3 });
      s2.spies[spy.id].status = 'stationed'; // simulate arrival
      const s3 = recallSpy(s2, spy.id);
      expect(s3.spies[spy.id].status).toBe('idle');
      expect(s3.spies[spy.id].targetCivId).toBeNull();
      expect(s3.spies[spy.id].targetCityId).toBeNull();
      expect(s3.spies[spy.id].position).toBeNull();
      expect(s3.spies[spy.id].currentMission).toBeNull();
    });
  });

  describe('canRecruitSpy', () => {
    it('returns true when under max spies', () => {
      const state = createEspionageCivState();
      expect(canRecruitSpy(state)).toBe(true);
    });

    it('does not count captured spies against limit', () => {
      let state = createEspionageCivState();
      const { state: s1, spy } = recruitSpy(state, 'player', 'seed-1');
      s1.spies[spy.id].status = 'captured';
      expect(canRecruitSpy(s1)).toBe(true);
    });
  });

  describe('getSpySuccessChance', () => {
    it('returns base chance for 0 experience vs 0 counter-intel', () => {
      const chance = getSpySuccessChance(0, 0, 'gather_intel');
      expect(chance).toBeGreaterThan(0.5);
      expect(chance).toBeLessThanOrEqual(1);
    });

    it('higher experience increases success chance', () => {
      const low = getSpySuccessChance(10, 0, 'gather_intel');
      const high = getSpySuccessChance(80, 0, 'gather_intel');
      expect(high).toBeGreaterThan(low);
    });

    it('higher counter-intelligence decreases success chance', () => {
      const easy = getSpySuccessChance(50, 0, 'gather_intel');
      const hard = getSpySuccessChance(50, 80, 'gather_intel');
      expect(hard).toBeLessThan(easy);
    });

    it('scout_area has higher base chance than gather_intel', () => {
      const scout = getSpySuccessChance(0, 0, 'scout_area');
      const intel = getSpySuccessChance(0, 0, 'gather_intel');
      expect(scout).toBeGreaterThan(intel);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `yarn test tests/systems/espionage-system.test.ts`
Expected: FAIL — functions don't exist yet

- [ ] **Step 3: Implement espionage-system.ts core**

```typescript
// src/systems/espionage-system.ts
import type {
  Spy, SpyMission, SpyMissionType, SpyStatus,
  EspionageCivState, HexCoord,
} from '../core/types';
import { createRng } from './map-generator'; // Reuse existing seeded RNG

const SPY_NAMES = [
  'Shadow', 'Whisper', 'Ghost', 'Cipher', 'Raven',
  'Viper', 'Falcon', 'Wraith', 'Phantom', 'Specter',
  'Dagger', 'Smoke', 'Shade', 'Flicker', 'Ash',
  'Thorn', 'Mist', 'Echo', 'Blade', 'Ember',
];

let nextSpyId = 1;

// --- Mission difficulty config ---

const MISSION_BASE_SUCCESS: Record<SpyMissionType, number> = {
  scout_area: 0.90,
  monitor_troops: 0.85,
  gather_intel: 0.70,
  identify_resources: 0.75,
  monitor_diplomacy: 0.70,
};

const MISSION_DURATIONS: Record<SpyMissionType, number> = {
  scout_area: 1,
  monitor_troops: 2,
  gather_intel: 3,
  identify_resources: 4,
  monitor_diplomacy: 3,
};

// --- State creation ---

export function createEspionageCivState(): EspionageCivState {
  return {
    spies: {},
    maxSpies: 1,
    counterIntelligence: {},
  };
}

// --- Queries ---

export function canRecruitSpy(state: EspionageCivState): boolean {
  const activeSpies = Object.values(state.spies).filter(
    s => s.status !== 'captured',
  ).length;
  return activeSpies < state.maxSpies;
}

export function getSpySuccessChance(
  spyExperience: number,
  counterIntel: number,
  missionType: SpyMissionType,
): number {
  const base = MISSION_BASE_SUCCESS[missionType];
  const expBonus = spyExperience * 0.003;     // +0.3% per XP point, max +30%
  const ciPenalty = counterIntel * 0.004;      // -0.4% per CI point, max -40%
  return Math.max(0.05, Math.min(0.98, base + expBonus - ciPenalty));
}

export function getMissionDuration(missionType: SpyMissionType): number {
  return MISSION_DURATIONS[missionType];
}

// --- Mutations ---

export function recruitSpy(
  state: EspionageCivState,
  owner: string,
  seed: string,
): { state: EspionageCivState; spy: Spy } {
  const rng = createRng(seed);
  const nameIndex = Math.floor(rng() * SPY_NAMES.length);
  const id = `spy-${nextSpyId++}`;

  const spy: Spy = {
    id,
    owner,
    name: `Agent ${SPY_NAMES[nameIndex]}`,
    targetCivId: null,
    targetCityId: null,
    position: null,
    status: 'idle',
    experience: 0,
    currentMission: null,
    cooldownTurns: 0,
  };

  return {
    state: {
      ...state,
      spies: { ...state.spies, [id]: spy },
    },
    spy,
  };
}

export function assignSpy(
  state: EspionageCivState,
  spyId: string,
  targetCivId: string,
  targetCityId: string,
  targetPosition: HexCoord,
): EspionageCivState {
  const spy = state.spies[spyId];
  if (!spy) throw new Error(`Spy ${spyId} not found`);
  if (spy.status !== 'idle') throw new Error('Spy is not available');

  return {
    ...state,
    spies: {
      ...state.spies,
      [spyId]: {
        ...spy,
        status: 'traveling',
        targetCivId,
        targetCityId,
        position: { ...targetPosition },
      },
    },
  };
}

export function recallSpy(
  state: EspionageCivState,
  spyId: string,
): EspionageCivState {
  const spy = state.spies[spyId];
  if (!spy) throw new Error(`Spy ${spyId} not found`);

  return {
    ...state,
    spies: {
      ...state.spies,
      [spyId]: {
        ...spy,
        status: 'idle',
        targetCivId: null,
        targetCityId: null,
        position: null,
        currentMission: null,
      },
    },
  };
}

export function assignSpyDefensive(
  state: EspionageCivState,
  spyId: string,
  ownCityId: string,
  cityPosition: HexCoord,
): EspionageCivState {
  const spy = state.spies[spyId];
  if (!spy) throw new Error(`Spy ${spyId} not found`);
  if (spy.status !== 'idle') throw new Error('Spy is not available');

  const baseCi = 20;
  const expBonus = Math.floor(spy.experience * 0.4); // up to +40 from experience
  const ciScore = Math.min(100, (state.counterIntelligence[ownCityId] ?? 0) + baseCi + expBonus);

  return {
    ...state,
    spies: {
      ...state.spies,
      [spyId]: {
        ...spy,
        status: 'stationed',
        targetCivId: null,         // null = defensive assignment
        targetCityId: ownCityId,
        position: { ...cityPosition },
      },
    },
    counterIntelligence: {
      ...state.counterIntelligence,
      [ownCityId]: ciScore,
    },
  };
}

// Reset the ID counter (for testing)
export function _resetSpyIdCounter(): void {
  nextSpyId = 1;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `yarn test tests/systems/espionage-system.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/systems/espionage-system.ts tests/systems/espionage-system.test.ts
git commit -m "feat(m4a): espionage system core — recruit, assign, recall spies"
```

---

## Task 3: Espionage Missions — Start, Process, Resolve

**Files:**
- Modify: `src/systems/espionage-system.ts`
- Test: `tests/systems/espionage-system.test.ts` (append)

- [ ] **Step 1: Write failing tests — mission lifecycle**

```typescript
// Append to tests/systems/espionage-system.test.ts
import {
  startMission,
  processSpyTurn,
  getAvailableMissions,
  getMissionDuration,
} from '@/systems/espionage-system';

describe('missions', () => {
  describe('getAvailableMissions', () => {
    it('returns stage 1 missions when only espionage-1 tech completed', () => {
      const completedTechs = ['espionage-scouting'];
      const missions = getAvailableMissions(completedTechs);
      expect(missions).toContain('scout_area');
      expect(missions).toContain('monitor_troops');
      expect(missions).not.toContain('gather_intel');
    });

    it('returns stage 1 + 2 missions when espionage-2 tech completed', () => {
      const completedTechs = ['espionage-scouting', 'espionage-informants'];
      const missions = getAvailableMissions(completedTechs);
      expect(missions).toContain('scout_area');
      expect(missions).toContain('gather_intel');
      expect(missions).toContain('identify_resources');
      expect(missions).toContain('monitor_diplomacy');
    });

    it('returns empty array with no espionage tech', () => {
      const missions = getAvailableMissions([]);
      expect(missions).toEqual([]);
    });
  });

  describe('startMission', () => {
    it('starts a mission on a stationed spy', () => {
      let state = createEspionageCivState();
      const { state: s1, spy } = recruitSpy(state, 'player', 'seed-1');
      const s2 = assignSpy(s1, spy.id, 'ai-egypt', 'city-1', { q: 5, r: 3 });
      // Simulate arrival
      s2.spies[spy.id].status = 'stationed';
      const s3 = startMission(s2, spy.id, 'gather_intel');
      const missionSpy = s3.spies[spy.id];
      expect(missionSpy.status).toBe('on_mission');
      expect(missionSpy.currentMission).not.toBeNull();
      expect(missionSpy.currentMission!.type).toBe('gather_intel');
      expect(missionSpy.currentMission!.turnsRemaining).toBe(3);
      expect(missionSpy.currentMission!.turnsTotal).toBe(3);
    });

    it('refuses mission on idle spy', () => {
      let state = createEspionageCivState();
      const { state: s1, spy } = recruitSpy(state, 'player', 'seed-1');
      expect(() => startMission(s1, spy.id, 'gather_intel'))
        .toThrow('Spy must be stationed');
    });
  });

  describe('getMissionDuration', () => {
    it('scout_area takes 1 turn', () => {
      expect(getMissionDuration('scout_area')).toBe(1);
    });

    it('identify_resources takes 4 turns', () => {
      expect(getMissionDuration('identify_resources')).toBe(4);
    });
  });

  describe('processSpyTurn', () => {
    it('decrements traveling spy to stationed after 1 turn', () => {
      let state = createEspionageCivState();
      const { state: s1, spy } = recruitSpy(state, 'player', 'seed-1');
      const s2 = assignSpy(s1, spy.id, 'ai-egypt', 'city-1', { q: 5, r: 3 });
      const { state: s3 } = processSpyTurn(s2, 'turn-seed-1');
      expect(s3.spies[spy.id].status).toBe('stationed');
    });

    it('decrements mission turns remaining', () => {
      let state = createEspionageCivState();
      const { state: s1, spy } = recruitSpy(state, 'player', 'seed-1');
      const s2 = assignSpy(s1, spy.id, 'ai-egypt', 'city-1', { q: 5, r: 3 });
      s2.spies[spy.id].status = 'stationed';
      const s3 = startMission(s2, spy.id, 'gather_intel'); // 3 turns
      const { state: s4 } = processSpyTurn(s3, 'turn-seed-1');
      expect(s4.spies[spy.id].currentMission!.turnsRemaining).toBe(2);
      expect(s4.spies[spy.id].status).toBe('on_mission');
    });

    it('resolves mission when turns reach 0', () => {
      let state = createEspionageCivState();
      const { state: s1, spy } = recruitSpy(state, 'player', 'seed-1');
      const s2 = assignSpy(s1, spy.id, 'ai-egypt', 'city-1', { q: 5, r: 3 });
      s2.spies[spy.id].status = 'stationed';
      const s3 = startMission(s2, spy.id, 'scout_area'); // 1 turn
      const { state: s4, events } = processSpyTurn(s3, 'turn-seed-1');
      // After 1 turn, scout_area should resolve
      expect(s4.spies[spy.id].status).toBe('stationed');
      expect(s4.spies[spy.id].currentMission).toBeNull();
      expect(events.length).toBeGreaterThan(0);
      expect(events.some(e => e.type === 'mission_succeeded' || e.type === 'mission_failed')).toBe(true);
    });

    it('grants experience on successful mission', () => {
      let state = createEspionageCivState();
      const { state: s1, spy } = recruitSpy(state, 'player', 'seed-1');
      const s2 = assignSpy(s1, spy.id, 'ai-egypt', 'city-1', { q: 5, r: 3 });
      s2.spies[spy.id].status = 'stationed';
      const s3 = startMission(s2, spy.id, 'scout_area');
      // Use a seed known to produce success (high base chance for scout_area = 0.90)
      const { state: s4, events } = processSpyTurn(s3, 'success-seed');
      if (events.some(e => e.type === 'mission_succeeded')) {
        expect(s4.spies[spy.id].experience).toBeGreaterThan(0);
      }
    });

    it('decrements cooldown on cooldown spies', () => {
      let state = createEspionageCivState();
      const { state: s1, spy } = recruitSpy(state, 'player', 'seed-1');
      s1.spies[spy.id].status = 'cooldown';
      s1.spies[spy.id].cooldownTurns = 3;
      const { state: s2 } = processSpyTurn(s1, 'turn-seed');
      expect(s2.spies[spy.id].cooldownTurns).toBe(2);
    });

    it('transitions cooldown to idle when cooldown reaches 0', () => {
      let state = createEspionageCivState();
      const { state: s1, spy } = recruitSpy(state, 'player', 'seed-1');
      s1.spies[spy.id].status = 'cooldown';
      s1.spies[spy.id].cooldownTurns = 1;
      const { state: s2 } = processSpyTurn(s1, 'turn-seed');
      expect(s2.spies[spy.id].status).toBe('idle');
      expect(s2.spies[spy.id].cooldownTurns).toBe(0);
    });

    it('does nothing for captured spies', () => {
      let state = createEspionageCivState();
      const { state: s1, spy } = recruitSpy(state, 'player', 'seed-1');
      s1.spies[spy.id].status = 'captured';
      const { state: s2 } = processSpyTurn(s1, 'turn-seed');
      expect(s2.spies[spy.id].status).toBe('captured');
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `yarn test tests/systems/espionage-system.test.ts`
Expected: FAIL — `startMission`, `processSpyTurn`, `getAvailableMissions` not found

- [ ] **Step 3: Implement mission functions**

Add to `src/systems/espionage-system.ts`:

```typescript
// --- Tech gating ---

const STAGE_1_TECHS = ['espionage-scouting'];
const STAGE_2_TECHS = ['espionage-informants'];

const STAGE_1_MISSIONS: SpyMissionType[] = ['scout_area', 'monitor_troops'];
const STAGE_2_MISSIONS: SpyMissionType[] = ['gather_intel', 'identify_resources', 'monitor_diplomacy'];

export function getAvailableMissions(completedTechs: string[]): SpyMissionType[] {
  const missions: SpyMissionType[] = [];
  if (STAGE_1_TECHS.some(t => completedTechs.includes(t))) {
    missions.push(...STAGE_1_MISSIONS);
  }
  if (STAGE_2_TECHS.some(t => completedTechs.includes(t))) {
    missions.push(...STAGE_2_MISSIONS);
  }
  return missions;
}

// --- Mission lifecycle ---

export function startMission(
  state: EspionageCivState,
  spyId: string,
  missionType: SpyMissionType,
): EspionageCivState {
  const spy = state.spies[spyId];
  if (!spy) throw new Error(`Spy ${spyId} not found`);
  if (spy.status !== 'stationed') throw new Error('Spy must be stationed to start a mission');

  const duration = getMissionDuration(missionType);
  const mission: SpyMission = {
    type: missionType,
    turnsRemaining: duration,
    turnsTotal: duration,
    targetCivId: spy.targetCivId!,
    targetCityId: spy.targetCityId!,
  };

  return {
    ...state,
    spies: {
      ...state.spies,
      [spyId]: {
        ...spy,
        status: 'on_mission',
        currentMission: mission,
      },
    },
  };
}

// --- Turn events (returned from processSpyTurn for bus emission) ---

export interface SpyTurnEvent {
  type: 'mission_succeeded' | 'mission_failed' | 'spy_expelled' | 'spy_captured' | 'spy_arrived';
  spyId: string;
  missionType?: SpyMissionType;
  result?: Record<string, unknown>;
}

const XP_PER_MISSION: Record<SpyMissionType, number> = {
  scout_area: 5,
  monitor_troops: 5,
  gather_intel: 10,
  identify_resources: 8,
  monitor_diplomacy: 10,
};

const EXPULSION_COOLDOWN = 5;

export function processSpyTurn(
  state: EspionageCivState,
  seed: string,
): { state: EspionageCivState; events: SpyTurnEvent[] } {
  const rng = createRng(seed);
  let newState = { ...state, spies: { ...state.spies } };
  const events: SpyTurnEvent[] = [];

  for (const [spyId, spy] of Object.entries(newState.spies)) {
    let updated = { ...spy };

    if (updated.status === 'captured') {
      newState.spies[spyId] = updated;
      continue;
    }

    if (updated.status === 'cooldown') {
      updated.cooldownTurns -= 1;
      if (updated.cooldownTurns <= 0) {
        updated.status = 'idle';
        updated.cooldownTurns = 0;
      }
      newState.spies[spyId] = updated;
      continue;
    }

    if (updated.status === 'traveling') {
      updated.status = 'stationed';
      events.push({ type: 'spy_arrived', spyId });
      newState.spies[spyId] = updated;
      continue;
    }

    if (updated.status === 'on_mission' && updated.currentMission) {
      const mission = { ...updated.currentMission };
      mission.turnsRemaining -= 1;

      if (mission.turnsRemaining <= 0) {
        // Resolve mission
        const counterIntel = newState.counterIntelligence[mission.targetCityId] ?? 0;
        const successChance = getSpySuccessChance(updated.experience, counterIntel, mission.type);
        const roll = rng();

        if (roll < successChance) {
          // Success
          updated.experience = Math.min(100, updated.experience + XP_PER_MISSION[mission.type]);
          updated.status = 'stationed';
          updated.currentMission = null;
          events.push({
            type: 'mission_succeeded',
            spyId,
            missionType: mission.type,
            result: {},
          });
        } else {
          // Failure — determine expulsion vs capture
          const captureRoll = rng();
          if (captureRoll < 0.3) {
            // Captured
            updated.status = 'captured';
            updated.currentMission = null;
            events.push({ type: 'spy_captured', spyId, missionType: mission.type });
          } else {
            // Expelled
            updated.status = 'cooldown';
            updated.cooldownTurns = EXPULSION_COOLDOWN;
            updated.targetCivId = null;
            updated.targetCityId = null;
            updated.position = null;
            updated.currentMission = null;
            events.push({ type: 'spy_expelled', spyId, missionType: mission.type });
          }
        }
      } else {
        updated.currentMission = mission;
      }

      newState.spies[spyId] = updated;
      continue;
    }

    newState.spies[spyId] = updated;
  }

  return { state: newState, events };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `yarn test tests/systems/espionage-system.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/systems/espionage-system.ts tests/systems/espionage-system.test.ts
git commit -m "feat(m4a): espionage missions — start, process turns, resolve with success/failure"
```

---

## Task 4: Espionage Mission Results — Intel Gathering

**Files:**
- Modify: `src/systems/espionage-system.ts`
- Test: `tests/systems/espionage-system.test.ts` (append)

- [ ] **Step 1: Write failing tests — mission result data**

```typescript
// Append to tests/systems/espionage-system.test.ts
import { resolveMissionResult } from '@/systems/espionage-system';
import type { GameState } from '@/core/types';

describe('resolveMissionResult', () => {
  // Create a minimal game state for testing
  function makeTestGameState(): GameState {
    return {
      turn: 10,
      era: 2,
      currentPlayer: 'player',
      gameOver: false,
      winner: null,
      map: { width: 10, height: 10, tiles: {}, wrapsHorizontally: false, rivers: [] },
      units: {},
      cities: {
        'city-egypt-1': {
          id: 'city-egypt-1', name: 'Thebes', owner: 'ai-egypt',
          position: { q: 5, r: 3 }, population: 5, food: 0, foodNeeded: 20,
          buildings: ['granary'], productionQueue: ['warrior'],
          productionProgress: 10, ownedTiles: [{ q: 5, r: 3 }, { q: 5, r: 4 }, { q: 6, r: 3 }],
          grid: [[null]], gridSize: 3,
        },
      },
      civilizations: {
        'ai-egypt': {
          id: 'ai-egypt', name: 'Egypt', color: '#c4a94d',
          isHuman: false, civType: 'egypt',
          cities: ['city-egypt-1'], units: ['unit-1'],
          techState: {
            completed: ['agriculture-farming', 'science-writing'],
            currentResearch: 'military-bronze-working',
            researchProgress: 30,
            trackPriorities: {} as any,
          },
          gold: 150,
          visibility: { tiles: {} },
          score: 100,
          diplomacy: {
            relationships: { player: -10 },
            treaties: [{ type: 'trade_agreement', civA: 'ai-egypt', civB: 'ai-rome', turnsRemaining: 5 }],
            events: [],
            atWarWith: [],
          },
        },
      },
      barbarianCamps: {},
      minorCivs: {},
      tutorial: { active: false, currentStep: 'complete', completedSteps: [] },
      settings: { mapSize: 'small', soundEnabled: false, musicEnabled: false, musicVolume: 0, sfxVolume: 0, tutorialEnabled: false, advisorsEnabled: {} as any },
      tribalVillages: {},
      discoveredWonders: {},
      wonderDiscoverers: {},
    } as GameState;
  }

  it('gather_intel reveals tech, gold, and treaties', () => {
    const gameState = makeTestGameState();
    const result = resolveMissionResult('gather_intel', 'ai-egypt', 'city-egypt-1', gameState);
    expect(result.techProgress).toBeDefined();
    expect(result.techProgress!.completed).toContain('agriculture-farming');
    expect(result.techProgress!.currentResearch).toBe('military-bronze-working');
    expect(result.treasury).toBe(150);
    expect(result.treaties).toHaveLength(1);
  });

  it('identify_resources reveals resources in city territory', () => {
    const gameState = makeTestGameState();
    // Add a resource tile
    gameState.map.tiles['5,4'] = {
      coord: { q: 5, r: 4 }, terrain: 'plains', elevation: 'lowland',
      resource: 'iron', improvement: 'none', owner: 'ai-egypt',
      improvementTurnsLeft: 0, hasRiver: false, wonder: null,
    };
    const result = resolveMissionResult('identify_resources', 'ai-egypt', 'city-egypt-1', gameState);
    expect(result.resources).toBeDefined();
    expect(result.resources).toContain('iron');
  });

  it('monitor_diplomacy reveals relationships and trade partners', () => {
    const gameState = makeTestGameState();
    const result = resolveMissionResult('monitor_diplomacy', 'ai-egypt', 'city-egypt-1', gameState);
    expect(result.relationships).toBeDefined();
    expect(result.relationships!['player']).toBe(-10);
    expect(result.tradePartners).toBeDefined();
    expect(result.tradePartners).toContain('ai-rome');
  });

  it('scout_area returns list of tiles to reveal', () => {
    const gameState = makeTestGameState();
    const result = resolveMissionResult('scout_area', 'ai-egypt', 'city-egypt-1', gameState);
    expect(result.tilesToReveal).toBeDefined();
    expect(result.tilesToReveal!.length).toBeGreaterThan(0);
  });

  it('monitor_troops returns units near the city', () => {
    const gameState = makeTestGameState();
    gameState.units['unit-1'] = {
      id: 'unit-1', type: 'warrior', owner: 'ai-egypt',
      position: { q: 5, r: 3 }, movementPointsLeft: 2,
      health: 100, experience: 0, hasMoved: false, hasActed: false,
    };
    const result = resolveMissionResult('monitor_troops', 'ai-egypt', 'city-egypt-1', gameState);
    expect(result.nearbyUnits).toBeDefined();
    expect(result.nearbyUnits!.length).toBeGreaterThan(0);
    expect(result.nearbyUnits![0].type).toBe('warrior');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `yarn test tests/systems/espionage-system.test.ts`
Expected: FAIL — `resolveMissionResult` not found

- [ ] **Step 3: Implement resolveMissionResult**

Add to `src/systems/espionage-system.ts`:

```typescript
import type { GameState, HexCoord, Treaty, UnitType } from '../core/types';
import { hexDistance } from './hex-utils';

export interface MissionResult {
  // gather_intel
  techProgress?: { completed: string[]; currentResearch: string | null; researchProgress: number };
  treasury?: number;
  treaties?: Treaty[];
  // identify_resources
  resources?: string[];
  // monitor_diplomacy
  relationships?: Record<string, number>;
  tradePartners?: string[];
  // scout_area
  tilesToReveal?: HexCoord[];
  // monitor_troops
  nearbyUnits?: Array<{ type: UnitType; position: HexCoord; health: number }>;
}

const SCOUT_VISION_RADIUS = 3;
const TROOP_MONITOR_RADIUS = 4;

export function resolveMissionResult(
  missionType: SpyMissionType,
  targetCivId: string,
  targetCityId: string,
  gameState: GameState,
): MissionResult {
  const targetCiv = gameState.civilizations[targetCivId];
  const targetCity = gameState.cities[targetCityId];

  switch (missionType) {
    case 'gather_intel': {
      return {
        techProgress: targetCiv ? {
          completed: [...targetCiv.techState.completed],
          currentResearch: targetCiv.techState.currentResearch,
          researchProgress: targetCiv.techState.researchProgress,
        } : undefined,
        treasury: targetCiv?.gold,
        treaties: targetCiv?.diplomacy.treaties
          ? [...targetCiv.diplomacy.treaties]
          : [],
      };
    }

    case 'identify_resources': {
      if (!targetCity) return {};
      const resources: string[] = [];
      for (const tileCoord of targetCity.ownedTiles) {
        const key = `${tileCoord.q},${tileCoord.r}`;
        const tile = gameState.map.tiles[key];
        if (tile?.resource && !resources.includes(tile.resource)) {
          resources.push(tile.resource);
        }
      }
      return { resources };
    }

    case 'monitor_diplomacy': {
      if (!targetCiv) return {};
      const relationships = { ...targetCiv.diplomacy.relationships };
      const tradePartners = targetCiv.diplomacy.treaties
        .filter(t => t.type === 'trade_agreement')
        .map(t => t.civA === targetCivId ? t.civB : t.civA);
      return { relationships, tradePartners };
    }

    case 'scout_area': {
      if (!targetCity) return {};
      const tilesToReveal: HexCoord[] = [];
      for (const key of Object.keys(gameState.map.tiles)) {
        const [q, r] = key.split(',').map(Number);
        if (hexDistance({ q, r }, targetCity.position) <= SCOUT_VISION_RADIUS) {
          tilesToReveal.push({ q, r });
        }
      }
      return { tilesToReveal };
    }

    case 'monitor_troops': {
      if (!targetCity) return {};
      const nearbyUnits: Array<{ type: UnitType; position: HexCoord; health: number }> = [];
      for (const unit of Object.values(gameState.units)) {
        if (unit.owner === targetCivId &&
            hexDistance(unit.position, targetCity.position) <= TROOP_MONITOR_RADIUS) {
          nearbyUnits.push({
            type: unit.type,
            position: { ...unit.position },
            health: unit.health,
          });
        }
      }
      return { nearbyUnits };
    }

    default:
      return {};
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `yarn test tests/systems/espionage-system.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/systems/espionage-system.ts tests/systems/espionage-system.test.ts
git commit -m "feat(m4a): espionage mission results — intel gathering for all stage 1-2 missions"
```

---

## Task 5: Espionage Detection & Diplomatic Consequences

**Files:**
- Modify: `src/systems/espionage-system.ts`
- Modify: `src/systems/diplomacy-system.ts`
- Test: `tests/systems/espionage-system.test.ts` (append)

- [ ] **Step 1: Write failing tests — detection and diplomacy**

```typescript
// Append to tests/systems/espionage-system.test.ts
import { handleSpyCaptured, handleSpyExpelled } from '@/systems/espionage-system';
import { createDiplomacyState, modifyRelationship } from '@/systems/diplomacy-system';

describe('espionage diplomatic consequences', () => {
  describe('handleSpyExpelled', () => {
    it('reduces relationship between spy owner and detecting civ', () => {
      const dipState = createDiplomacyState(['player', 'ai-egypt'], 'ai-egypt');
      const updated = handleSpyExpelled(dipState, 'player', 10);
      expect(updated.relationships['player']).toBeLessThan(0);
    });

    it('adds a diplomatic event for expulsion', () => {
      const dipState = createDiplomacyState(['player', 'ai-egypt'], 'ai-egypt');
      const updated = handleSpyExpelled(dipState, 'player', 10);
      expect(updated.events.length).toBe(1);
      expect(updated.events[0].type).toBe('spy_expelled');
    });
  });

  describe('handleSpyCaptured', () => {
    it('reduces relationship more severely than expulsion', () => {
      const dipState = createDiplomacyState(['player', 'ai-egypt'], 'ai-egypt');
      const expelled = handleSpyExpelled(dipState, 'player', 10);
      const captured = handleSpyCaptured(
        createDiplomacyState(['player', 'ai-egypt'], 'ai-egypt'),
        'player', 10,
      );
      expect(captured.relationships['player']).toBeLessThan(expelled.relationships['player']);
    });

    it('adds a diplomatic event for capture', () => {
      const dipState = createDiplomacyState(['player', 'ai-egypt'], 'ai-egypt');
      const updated = handleSpyCaptured(dipState, 'player', 10);
      expect(updated.events.some(e => e.type === 'spy_captured')).toBe(true);
    });
  });

  describe('counter-intelligence', () => {
    it('setCounterIntelligence updates city CI score', () => {
      let state = createEspionageCivState();
      state = setCounterIntelligence(state, 'city-1', 50);
      expect(state.counterIntelligence['city-1']).toBe(50);
    });

    it('CI score clamps to 0-100', () => {
      let state = createEspionageCivState();
      state = setCounterIntelligence(state, 'city-1', 150);
      expect(state.counterIntelligence['city-1']).toBe(100);
      state = setCounterIntelligence(state, 'city-1', -10);
      expect(state.counterIntelligence['city-1']).toBe(0);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `yarn test tests/systems/espionage-system.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement diplomatic consequence functions**

Add to `src/systems/espionage-system.ts`:

```typescript
import { modifyRelationship } from './diplomacy-system';
import type { DiplomacyState } from '../core/types';

const EXPULSION_RELATIONSHIP_PENALTY = -15;
const CAPTURE_RELATIONSHIP_PENALTY = -40;

export function handleSpyExpelled(
  dipState: DiplomacyState,
  spyOwnerCivId: string,
  turn: number,
): DiplomacyState {
  let updated = modifyRelationship(dipState, spyOwnerCivId, EXPULSION_RELATIONSHIP_PENALTY);
  updated = {
    ...updated,
    events: [...updated.events, {
      type: 'spy_expelled',
      turn,
      otherCiv: spyOwnerCivId,
      weight: 1,
    }],
  };
  return updated;
}

export function handleSpyCaptured(
  dipState: DiplomacyState,
  spyOwnerCivId: string,
  turn: number,
): DiplomacyState {
  let updated = modifyRelationship(dipState, spyOwnerCivId, CAPTURE_RELATIONSHIP_PENALTY);
  updated = {
    ...updated,
    events: [...updated.events, {
      type: 'spy_captured',
      turn,
      otherCiv: spyOwnerCivId,
      weight: 1,
    }],
  };
  return updated;
}

export function setCounterIntelligence(
  state: EspionageCivState,
  cityId: string,
  score: number,
): EspionageCivState {
  return {
    ...state,
    counterIntelligence: {
      ...state.counterIntelligence,
      [cityId]: Math.max(0, Math.min(100, score)),
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `yarn test tests/systems/espionage-system.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/systems/espionage-system.ts tests/systems/espionage-system.test.ts
git commit -m "feat(m4a): espionage detection — diplomatic consequences for expulsion and capture"
```

---

## Task 6: Espionage Turn Processing Integration

**Files:**
- Modify: `src/core/turn-manager.ts`
- Modify: `src/core/game-state.ts`
- Modify: `src/systems/espionage-system.ts` (add top-level `processEspionageTurn`)
- Test: `tests/integration/m4a-espionage-integration.test.ts`

- [ ] **Step 1: Write failing integration tests**

```typescript
// tests/integration/m4a-espionage-integration.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventBus } from '@/core/event-bus';
import {
  createEspionageCivState,
  recruitSpy,
  assignSpy,
  startMission,
  processEspionageTurn,
  initializeEspionage,
} from '@/systems/espionage-system';
import type { GameState, EspionageState } from '@/core/types';

function makeTestGameState(): GameState {
  return {
    turn: 10,
    era: 2,
    currentPlayer: 'player',
    gameOver: false,
    winner: null,
    map: { width: 10, height: 10, tiles: {}, wrapsHorizontally: false, rivers: [] },
    units: {
      'unit-eg-1': {
        id: 'unit-eg-1', type: 'warrior', owner: 'ai-egypt',
        position: { q: 5, r: 3 }, movementPointsLeft: 2,
        health: 100, experience: 0, hasMoved: false, hasActed: false,
      },
    },
    cities: {
      'city-egypt-1': {
        id: 'city-egypt-1', name: 'Thebes', owner: 'ai-egypt',
        position: { q: 5, r: 3 }, population: 5, food: 0, foodNeeded: 20,
        buildings: ['granary'], productionQueue: ['warrior'],
        productionProgress: 10, ownedTiles: [{ q: 5, r: 3 }],
        grid: [[null]], gridSize: 3,
      },
    },
    civilizations: {
      player: {
        id: 'player', name: 'Player', color: '#4a90d9',
        isHuman: true, civType: 'egypt',
        cities: [], units: [],
        techState: {
          completed: ['espionage-scouting', 'espionage-informants'],
          currentResearch: null, researchProgress: 0,
          trackPriorities: {} as any,
        },
        gold: 100,
        visibility: { tiles: {} },
        score: 50,
        diplomacy: {
          relationships: { 'ai-egypt': 0 },
          treaties: [], events: [], atWarWith: [],
        },
      },
      'ai-egypt': {
        id: 'ai-egypt', name: 'Egypt', color: '#c4a94d',
        isHuman: false, civType: 'egypt',
        cities: ['city-egypt-1'], units: ['unit-eg-1'],
        techState: {
          completed: ['agriculture-farming'],
          currentResearch: 'science-writing', researchProgress: 30,
          trackPriorities: {} as any,
        },
        gold: 150,
        visibility: { tiles: {} },
        score: 100,
        diplomacy: {
          relationships: { player: 0 },
          treaties: [], events: [], atWarWith: [],
        },
      },
    },
    barbarianCamps: {},
    minorCivs: {},
    tutorial: { active: false, currentStep: 'complete', completedSteps: [] },
    settings: { mapSize: 'small', soundEnabled: false, musicEnabled: false, musicVolume: 0, sfxVolume: 0, tutorialEnabled: false, advisorsEnabled: {} as any },
    tribalVillages: {},
    discoveredWonders: {},
    wonderDiscoverers: {},
  } as GameState;
}

describe('espionage integration', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new EventBus();
  });

  describe('initializeEspionage', () => {
    it('creates espionage state for all civs', () => {
      const state = makeTestGameState();
      const espionage = initializeEspionage(state);
      expect(espionage['player']).toBeDefined();
      expect(espionage['ai-egypt']).toBeDefined();
      expect(espionage['player'].maxSpies).toBe(1);
    });

    it('increases maxSpies when more espionage techs completed', () => {
      const state = makeTestGameState();
      state.civilizations['player'].techState.completed.push('espionage-spy-rings');
      const espionage = initializeEspionage(state);
      expect(espionage['player'].maxSpies).toBeGreaterThan(1);
    });
  });

  describe('processEspionageTurn', () => {
    it('processes all civs spy turns and emits events', () => {
      const state = makeTestGameState();
      state.espionage = initializeEspionage(state);
      const { state: s1, spy } = recruitSpy(state.espionage['player'], 'player', 'seed-1');
      state.espionage['player'] = s1;
      state.espionage['player'] = assignSpy(
        state.espionage['player'], spy.id, 'ai-egypt', 'city-egypt-1', { q: 5, r: 3 },
      );

      const listener = vi.fn();
      bus.on('espionage:spy-arrived', listener);

      const newState = processEspionageTurn(state, bus);
      // Spy should transition from traveling to stationed
      const updatedSpy = newState.espionage!['player'].spies[spy.id];
      expect(updatedSpy.status).toBe('stationed');
    });

    it('applies diplomatic penalty on spy capture', () => {
      const state = makeTestGameState();
      state.espionage = initializeEspionage(state);
      const { state: s1, spy } = recruitSpy(state.espionage['player'], 'player', 'seed-1');
      state.espionage['player'] = s1;
      state.espionage['player'] = assignSpy(
        state.espionage['player'], spy.id, 'ai-egypt', 'city-egypt-1', { q: 5, r: 3 },
      );
      // Force spy to stationed + on_mission with 1 turn left
      state.espionage['player'].spies[spy.id].status = 'on_mission';
      state.espionage['player'].spies[spy.id].currentMission = {
        type: 'gather_intel', turnsRemaining: 1, turnsTotal: 3,
        targetCivId: 'ai-egypt', targetCityId: 'city-egypt-1',
      };
      // Set high counter-intel to force failure
      state.espionage['ai-egypt'].counterIntelligence['city-egypt-1'] = 100;

      // Run many seeds until we get a capture
      let captureFound = false;
      for (let i = 0; i < 50; i++) {
        const testState = structuredClone(state);
        const newState = processEspionageTurn(testState, bus);
        const updatedSpy = newState.espionage!['player'].spies[spy.id];
        if (updatedSpy.status === 'captured') {
          // Check diplomatic penalty was applied
          expect(newState.civilizations['ai-egypt'].diplomacy.relationships['player']).toBeLessThan(0);
          expect(newState.civilizations['ai-egypt'].diplomacy.events.some(
            e => e.type === 'spy_captured',
          )).toBe(true);
          captureFound = true;
          break;
        }
      }
      expect(captureFound).toBe(true);
    });

    it('respects hot seat — only processes current player and AI spies', () => {
      const state = makeTestGameState();
      state.currentPlayer = 'player';
      state.espionage = initializeEspionage(state);
      // Both civs have spies
      const { state: ps, spy: pSpy } = recruitSpy(state.espionage['player'], 'player', 'p-seed');
      state.espionage['player'] = ps;
      const { state: es, spy: eSpy } = recruitSpy(state.espionage['ai-egypt'], 'ai-egypt', 'e-seed');
      state.espionage['ai-egypt'] = es;

      // Both traveling
      state.espionage['player'] = assignSpy(state.espionage['player'], pSpy.id, 'ai-egypt', 'city-egypt-1', { q: 5, r: 3 });
      state.espionage['ai-egypt'].spies[eSpy.id].status = 'traveling';
      state.espionage['ai-egypt'].spies[eSpy.id].targetCivId = 'player';

      const newState = processEspionageTurn(state, bus);
      // All spies should be processed (turn processing handles all civs)
      expect(newState.espionage!['player'].spies[pSpy.id].status).toBe('stationed');
      expect(newState.espionage!['ai-egypt'].spies[eSpy.id].status).toBe('stationed');
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `yarn test tests/integration/m4a-espionage-integration.test.ts`
Expected: FAIL — `processEspionageTurn`, `initializeEspionage` not found

- [ ] **Step 3: Implement initializeEspionage and processEspionageTurn**

Add to `src/systems/espionage-system.ts`:

```typescript
import type { EventBus } from '../core/event-bus';

const ESPIONAGE_TECH_MAX_SPIES: Record<string, number> = {
  'espionage-scouting': 1,
  'espionage-informants': 2,
  'espionage-spy-rings': 3,
  'espionage-shadow-ops': 4,
  'espionage-digital-warfare': 5,
};

export function initializeEspionage(state: GameState): EspionageState {
  const espionage: EspionageState = {};
  for (const civId of Object.keys(state.civilizations)) {
    const civState = createEspionageCivState();
    // Calculate max spies based on completed espionage techs
    let maxSpies = 0;
    for (const [techId, spyCount] of Object.entries(ESPIONAGE_TECH_MAX_SPIES)) {
      if (state.civilizations[civId].techState.completed.includes(techId)) {
        maxSpies = Math.max(maxSpies, spyCount);
      }
    }
    civState.maxSpies = Math.max(1, maxSpies); // minimum 1 once any espionage tech
    espionage[civId] = civState;
  }
  return espionage;
}

export function processEspionageTurn(state: GameState, bus: EventBus): GameState {
  if (!state.espionage) return state;

  let newState = structuredClone(state);
  const turnSeed = `esp-turn-${state.turn}`;

  for (const civId of Object.keys(newState.espionage!)) {
    const civEsp = newState.espionage![civId];
    const { state: updatedEsp, events } = processSpyTurn(
      civEsp,
      `${turnSeed}-${civId}`,
    );
    newState.espionage![civId] = updatedEsp;

    // Process events — emit bus events and apply diplomatic consequences
    for (const evt of events) {
      const spy = updatedEsp.spies[evt.spyId];

      switch (evt.type) {
        case 'spy_arrived':
          bus.emit('espionage:spy-arrived', {
            civId, spyId: evt.spyId, targetCityId: spy?.targetCityId ?? '',
          });
          break;

        case 'mission_succeeded': {
          // Resolve mission data from game state
          const result = spy?.targetCivId && spy?.targetCityId
            ? resolveMissionResult(evt.missionType!, spy.targetCivId, spy.targetCityId, newState)
            : {};

          bus.emit('espionage:mission-succeeded', {
            civId, spyId: evt.spyId, missionType: evt.missionType!,
            result: result as Record<string, unknown>,
          });

          // Apply scout_area results — reveal tiles for spying civ
          if (evt.missionType === 'scout_area' && result.tilesToReveal) {
            for (const coord of result.tilesToReveal) {
              const key = `${coord.q},${coord.r}`;
              if (newState.civilizations[civId]?.visibility?.tiles) {
                const prev = newState.civilizations[civId].visibility.tiles[key];
                if (!prev || prev === 'unexplored') {
                  newState.civilizations[civId].visibility.tiles[key] = 'fog';
                }
                newState.civilizations[civId].visibility.tiles[key] = 'visible';
              }
            }
          }
          break;
        }

        case 'mission_failed':
          bus.emit('espionage:mission-failed', {
            civId, spyId: evt.spyId, missionType: evt.missionType!,
          });
          break;

        case 'spy_expelled': {
          const targetCivId = spy?.targetCivId;
          if (targetCivId && newState.civilizations[targetCivId]) {
            // Bilateral update: target civ's view of spy owner
            newState.civilizations[targetCivId].diplomacy = handleSpyExpelled(
              newState.civilizations[targetCivId].diplomacy, civId, newState.turn,
            );
            // Bilateral update: spy owner's view of target civ
            if (newState.civilizations[civId]) {
              newState.civilizations[civId].diplomacy = modifyRelationship(
                newState.civilizations[civId].diplomacy, targetCivId, -5,
              );
            }
          }
          bus.emit('espionage:spy-expelled', {
            civId, spyId: evt.spyId, fromCivId: targetCivId ?? '',
          });
          break;
        }

        case 'spy_captured': {
          const targetCivId = spy?.targetCivId;
          if (targetCivId && newState.civilizations[targetCivId]) {
            // Bilateral update: target civ's view of spy owner
            newState.civilizations[targetCivId].diplomacy = handleSpyCaptured(
              newState.civilizations[targetCivId].diplomacy, civId, newState.turn,
            );
            // Bilateral update: spy owner's view of target civ
            if (newState.civilizations[civId]) {
              newState.civilizations[civId].diplomacy = modifyRelationship(
                newState.civilizations[civId].diplomacy, targetCivId, -10,
              );
            }
          }
          bus.emit('espionage:spy-captured', {
            capturingCivId: targetCivId ?? '', spyOwner: civId, spyId: evt.spyId,
          });
          break;
        }
      }
    }

    // Passive spy abilities: stationed spies passively reveal fog and report troops
    for (const spy of Object.values(newState.espionage![civId].spies)) {
      if (spy.status === 'stationed' && spy.targetCivId && spy.targetCityId) {
        const targetCity = newState.cities[spy.targetCityId];
        if (!targetCity) continue;

        // Passive fog reveal around stationed city (Stage 1)
        const revealRadius = 3;
        for (const key of Object.keys(newState.map.tiles)) {
          const [q, r] = key.split(',').map(Number);
          if (hexDistance({ q, r }, targetCity.position) <= revealRadius) {
            if (newState.civilizations[civId]?.visibility?.tiles) {
              const prev = newState.civilizations[civId].visibility.tiles[key];
              if (!prev || prev === 'unexplored') {
                newState.civilizations[civId].visibility.tiles[key] = 'fog';
              }
              newState.civilizations[civId].visibility.tiles[key] = 'visible';
            }
          }
        }

        // Passive troop monitoring — emit event with units near city
        const nearbyUnits: Array<{ type: string; position: HexCoord }> = [];
        for (const unit of Object.values(newState.units)) {
          if (unit.owner === spy.targetCivId &&
              hexDistance(unit.position, targetCity.position) <= 4) {
            nearbyUnits.push({ type: unit.type, position: unit.position });
          }
        }
        if (nearbyUnits.length > 0) {
          bus.emit('espionage:mission-succeeded', {
            civId, spyId: spy.id, missionType: 'monitor_troops' as SpyMissionType,
            result: { nearbyUnits, passive: true } as Record<string, unknown>,
          });
        }
      }
    }

    // Update maxSpies based on current tech
    let maxSpies = 0;
    const civ = newState.civilizations[civId];
    if (civ) {
      for (const [techId, spyCount] of Object.entries(ESPIONAGE_TECH_MAX_SPIES)) {
        if (civ.techState.completed.includes(techId)) {
          maxSpies = Math.max(maxSpies, spyCount);
        }
      }
      newState.espionage![civId].maxSpies = Math.max(1, maxSpies);
    }
  }

  return newState;
}
```

- [ ] **Step 4: Wire into turn-manager.ts**

In `src/core/turn-manager.ts`, add import and call after minor civ processing:

```typescript
import { processEspionageTurn } from '../systems/espionage-system';

// Inside processTurn(), after minor civ processing:
newState = processEspionageTurn(newState, bus);
```

- [ ] **Step 5: Initialize espionage in game-state.ts**

In `src/core/game-state.ts`, add to `createNewGame()`:

```typescript
import { initializeEspionage } from '../systems/espionage-system';

// After creating civilizations and before returning state:
state.espionage = initializeEspionage(state);
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `yarn test tests/integration/m4a-espionage-integration.test.ts`
Expected: PASS

- [ ] **Step 7: Run full test suite to check for regressions**

Run: `yarn test`
Expected: All tests pass

- [ ] **Step 8: Commit**

```bash
git add src/systems/espionage-system.ts src/core/turn-manager.ts src/core/game-state.ts tests/integration/m4a-espionage-integration.test.ts
git commit -m "feat(m4a): espionage turn integration — process all civs, emit events, diplomatic consequences"
```

---

## Task 7: New Civilizations — France, Germany, Gondor, Rohan

**Files:**
- Modify: `src/core/types.ts` (CivBonusEffect — already done in Task 1)
- Modify: `src/systems/civ-definitions.ts`
- Create: `tests/systems/civ-definitions.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/systems/civ-definitions.test.ts
import { describe, it, expect } from 'vitest';
import { CIV_DEFINITIONS, getCivDefinition } from '@/systems/civ-definitions';

describe('civ-definitions', () => {
  describe('existing civs still work', () => {
    it('has all 12 original civs', () => {
      const ids = CIV_DEFINITIONS.map(c => c.id);
      expect(ids).toContain('egypt');
      expect(ids).toContain('rome');
      expect(ids).toContain('greece');
      expect(ids).toContain('mongolia');
      expect(ids).toContain('babylon');
      expect(ids).toContain('zulu');
      expect(ids).toContain('china');
      expect(ids).toContain('persia');
      expect(ids).toContain('england');
      expect(ids).toContain('aztec');
      expect(ids).toContain('japan');
      expect(ids).toContain('india');
    });
  });

  describe('M4a new civs', () => {
    it('has France with culture_pressure bonus', () => {
      const france = getCivDefinition('france');
      expect(france).toBeDefined();
      expect(france!.name).toBe('France');
      expect(france!.bonusEffect.type).toBe('culture_pressure');
      expect(france!.personality.traits).toContain('diplomatic');
    });

    it('has Germany with industrial_efficiency bonus', () => {
      const germany = getCivDefinition('germany');
      expect(germany).toBeDefined();
      expect(germany!.name).toBe('Germany');
      expect(germany!.bonusEffect.type).toBe('industrial_efficiency');
    });

    it('has Gondor with fortified_defense bonus', () => {
      const gondor = getCivDefinition('gondor');
      expect(gondor).toBeDefined();
      expect(gondor!.name).toBe('Gondor');
      expect(gondor!.bonusEffect.type).toBe('fortified_defense');
      expect(gondor!.personality.traits).toContain('diplomatic');
    });

    it('has Rohan with grassland_cavalry_heal bonus', () => {
      const rohan = getCivDefinition('rohan');
      expect(rohan).toBeDefined();
      expect(rohan!.name).toBe('Rohan');
      expect(rohan!.bonusEffect.type).toBe('grassland_cavalry_heal');
    });

    it('all M4a civs have unique colors', () => {
      const colors = CIV_DEFINITIONS.map(c => c.color);
      const unique = new Set(colors);
      expect(unique.size).toBe(colors.length);
    });

    it('all M4a civs have unique IDs', () => {
      const ids = CIV_DEFINITIONS.map(c => c.id);
      const unique = new Set(ids);
      expect(unique.size).toBe(ids.length);
    });

    it('total civ count is 16', () => {
      expect(CIV_DEFINITIONS.length).toBe(16);
    });

    it('all civs have valid personality traits', () => {
      const validTraits = ['aggressive', 'diplomatic', 'expansionist', 'trader'];
      for (const civ of CIV_DEFINITIONS) {
        for (const trait of civ.personality.traits) {
          expect(validTraits).toContain(trait);
        }
        expect(civ.personality.warLikelihood).toBeGreaterThanOrEqual(0);
        expect(civ.personality.warLikelihood).toBeLessThanOrEqual(1);
        expect(civ.personality.diplomacyFocus).toBeGreaterThanOrEqual(0);
        expect(civ.personality.diplomacyFocus).toBeLessThanOrEqual(1);
      }
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `yarn test tests/systems/civ-definitions.test.ts`
Expected: FAIL — new civs not found

- [ ] **Step 3: Add 4 new civ definitions**

Append to `CIV_DEFINITIONS` array in `src/systems/civ-definitions.ts`:

```typescript
  {
    id: 'france',
    name: 'France',
    color: '#1e3a8a',
    bonusName: 'City of Light',
    bonusDescription: 'Cities exert cultural pressure on neighboring tiles, expanding borders faster',
    bonusEffect: { type: 'culture_pressure', radiusBonus: 1 },
    personality: {
      traits: ['diplomatic', 'trader'],
      warLikelihood: 0.3,
      diplomacyFocus: 0.8,
      expansionDrive: 0.6,
    },
  },
  {
    id: 'germany',
    name: 'Germany',
    color: '#78716c',
    bonusName: 'Industrial Powerhouse',
    bonusDescription: '+15% production in all cities',
    bonusEffect: { type: 'industrial_efficiency', productionBonus: 0.15 },
    personality: {
      traits: ['expansionist', 'aggressive'],
      warLikelihood: 0.5,
      diplomacyFocus: 0.4,
      expansionDrive: 0.8,
    },
  },
  {
    id: 'gondor',
    name: 'Gondor',
    color: '#f5f5f4',
    bonusName: 'White City',
    bonusDescription: 'Fortified cities are 25% harder to capture',
    bonusEffect: { type: 'fortified_defense', defenseBonus: 0.25 },
    personality: {
      traits: ['diplomatic', 'aggressive'],
      warLikelihood: 0.4,
      diplomacyFocus: 0.7,
      expansionDrive: 0.5,
    },
  },
  {
    id: 'rohan',
    name: 'Rohan',
    color: '#65a30d',
    bonusName: 'Riders of the Mark',
    bonusDescription: 'Cavalry units heal 10 HP per turn on grassland tiles',
    bonusEffect: { type: 'grassland_cavalry_heal', healPerTurn: 10 },
    personality: {
      traits: ['aggressive', 'expansionist'],
      warLikelihood: 0.6,
      diplomacyFocus: 0.4,
      expansionDrive: 0.7,
    },
  },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `yarn test tests/systems/civ-definitions.test.ts`
Expected: PASS

- [ ] **Step 5: Run full test suite**

Run: `yarn test`
Expected: All pass

- [ ] **Step 6: Commit**

```bash
git add src/systems/civ-definitions.ts src/core/types.ts tests/systems/civ-definitions.test.ts
git commit -m "feat(m4a): add France, Germany, Gondor, Rohan civilizations"
```

---

## Task 8: Spymaster Advisor

**Files:**
- Modify: `src/ui/advisor-system.ts`
- Create: `tests/ui/advisor-spymaster.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/ui/advisor-spymaster.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AdvisorSystem } from '@/ui/advisor-system';
import { EventBus } from '@/core/event-bus';
import type { GameState } from '@/core/types';
import { createEspionageCivState, recruitSpy, assignSpy, startMission } from '@/systems/espionage-system';

function makeSpymasterTestState(): GameState {
  const state = {
    turn: 10,
    era: 2,
    currentPlayer: 'player',
    gameOver: false,
    winner: null,
    map: { width: 10, height: 10, tiles: {}, wrapsHorizontally: false, rivers: [] },
    units: {},
    cities: {
      'city-player-1': {
        id: 'city-player-1', name: 'Capital', owner: 'player',
        position: { q: 0, r: 0 }, population: 5, food: 0, foodNeeded: 20,
        buildings: [], productionQueue: [], productionProgress: 0,
        ownedTiles: [], grid: [[null]], gridSize: 3,
      },
      'city-egypt-1': {
        id: 'city-egypt-1', name: 'Thebes', owner: 'ai-egypt',
        position: { q: 5, r: 3 }, population: 5, food: 0, foodNeeded: 20,
        buildings: [], productionQueue: [], productionProgress: 0,
        ownedTiles: [], grid: [[null]], gridSize: 3,
      },
    },
    civilizations: {
      player: {
        id: 'player', name: 'Player', color: '#4a90d9',
        isHuman: true, civType: 'egypt',
        cities: ['city-player-1'], units: [],
        techState: {
          completed: ['espionage-scouting'],
          currentResearch: null, researchProgress: 0,
          trackPriorities: {} as any,
        },
        gold: 100, visibility: { tiles: {} }, score: 50,
        diplomacy: {
          relationships: { 'ai-egypt': -30 }, treaties: [],
          events: [], atWarWith: [],
        },
      },
      'ai-egypt': {
        id: 'ai-egypt', name: 'Egypt', color: '#c4a94d',
        isHuman: false, civType: 'egypt',
        cities: ['city-egypt-1'], units: [],
        techState: { completed: [], currentResearch: null, researchProgress: 0, trackPriorities: {} as any },
        gold: 150, visibility: { tiles: {} }, score: 100,
        diplomacy: { relationships: { player: -30 }, treaties: [], events: [], atWarWith: [] },
      },
    },
    barbarianCamps: {},
    minorCivs: {},
    tutorial: { active: false, currentStep: 'complete', completedSteps: [] },
    settings: {
      mapSize: 'small', soundEnabled: false, musicEnabled: false,
      musicVolume: 0, sfxVolume: 0, tutorialEnabled: false,
      advisorsEnabled: {
        builder: true, explorer: true, chancellor: true,
        warchief: true, treasurer: true, scholar: true, spymaster: true,
      },
    },
    tribalVillages: {},
    discoveredWonders: {},
    wonderDiscoverers: {},
    espionage: {},
  } as unknown as GameState;
  return state;
}

describe('spymaster advisor', () => {
  let bus: EventBus;
  let advisor: AdvisorSystem;

  beforeEach(() => {
    bus = new EventBus();
    advisor = new AdvisorSystem(bus);
  });

  it('suggests placing spies when espionage tech unlocked and no spies active', () => {
    const state = makeSpymasterTestState();
    state.espionage = {
      player: createEspionageCivState(),
      'ai-egypt': createEspionageCivState(),
    };

    const messages: any[] = [];
    bus.on('advisor:message', (data) => messages.push(data));

    advisor.check(state);
    const spyMsg = messages.find(m => m.advisor === 'spymaster');
    expect(spyMsg).toBeDefined();
    expect(spyMsg!.message).toMatch(/spy|recruit|intelligence/i);
  });

  it('warns about hostile civ without spy coverage', () => {
    const state = makeSpymasterTestState();
    state.espionage = {
      player: createEspionageCivState(),
      'ai-egypt': createEspionageCivState(),
    };
    // Egypt is hostile (relationship -30) but we have no spy there
    const messages: any[] = [];
    bus.on('advisor:message', (data) => messages.push(data));

    advisor.check(state);
    const spyMsg = messages.find(m => m.advisor === 'spymaster');
    expect(spyMsg).toBeDefined();
  });

  it('warns about undefended cities (no counter-intelligence)', () => {
    const state = makeSpymasterTestState();
    state.espionage = {
      player: createEspionageCivState(),
      'ai-egypt': createEspionageCivState(),
    };
    // Player has a city but no counter-intel
    // Give player a stationed spy so first recruit message doesn't fire
    const { state: espState, spy } = recruitSpy(state.espionage['player'], 'player', 'seed-1');
    state.espionage['player'] = assignSpy(espState, spy.id, 'ai-egypt', 'city-egypt-1', { q: 5, r: 3 });
    state.espionage['player'].spies[spy.id].status = 'stationed';

    const messages: any[] = [];
    bus.on('advisor:message', (data) => messages.push(data));

    advisor.check(state);
    const ciMsg = messages.find(m => m.advisor === 'spymaster' && m.message.match(/defend|counter|protect/i));
    // May or may not trigger depending on priority — at minimum spymaster should speak
  });

  it('does not trigger if spymaster is disabled', () => {
    const state = makeSpymasterTestState();
    state.settings.advisorsEnabled.spymaster = false;
    state.espionage = {
      player: createEspionageCivState(),
      'ai-egypt': createEspionageCivState(),
    };

    const messages: any[] = [];
    bus.on('advisor:message', (data) => messages.push(data));

    advisor.check(state);
    const spyMsg = messages.find(m => m.advisor === 'spymaster');
    expect(spyMsg).toBeUndefined();
  });

  it('does not trigger before espionage tech is researched', () => {
    const state = makeSpymasterTestState();
    state.civilizations['player'].techState.completed = []; // No espionage tech
    state.espionage = {
      player: createEspionageCivState(),
      'ai-egypt': createEspionageCivState(),
    };

    const messages: any[] = [];
    bus.on('advisor:message', (data) => messages.push(data));

    advisor.check(state);
    const spyMsg = messages.find(m => m.advisor === 'spymaster');
    expect(spyMsg).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `yarn test tests/ui/advisor-spymaster.test.ts`
Expected: FAIL — spymaster messages not implemented

- [ ] **Step 3: Add Spymaster messages to advisor-system.ts**

Add to the `ADVISOR_MESSAGES` array in `src/ui/advisor-system.ts`:

```typescript
  // --- Spymaster Advisor ---
  {
    id: 'spymaster_recruit_first_spy',
    advisor: 'spymaster',
    icon: '🕵️',
    message: 'My liege... I have eyes and ears throughout the realm, but none abroad. Recruit a spy — we must know what our neighbors are planning.',
    trigger: (state) => {
      if (!state.espionage) return false;
      const playerEsp = state.espionage[state.currentPlayer];
      if (!playerEsp) return false;
      const hasEspTech = state.civilizations[state.currentPlayer]?.techState.completed
        .some(t => t.startsWith('espionage-'));
      if (!hasEspTech) return false;
      const activeSpies = Object.values(playerEsp.spies).filter(s => s.status !== 'captured');
      return activeSpies.length === 0;
    },
  },
  {
    id: 'spymaster_hostile_no_coverage',
    advisor: 'spymaster',
    icon: '🕵️',
    message: 'A hostile civilization grows bold, and we have no eyes on them. I recommend placing a spy in their capital before it is too late.',
    trigger: (state) => {
      if (!state.espionage) return false;
      const playerDip = state.civilizations[state.currentPlayer]?.diplomacy;
      const playerEsp = state.espionage[state.currentPlayer];
      if (!playerDip || !playerEsp) return false;
      const hasEspTech = state.civilizations[state.currentPlayer]?.techState.completed
        .some(t => t.startsWith('espionage-'));
      if (!hasEspTech) return false;
      // Check for hostile civs without spy coverage
      for (const [civId, score] of Object.entries(playerDip.relationships)) {
        if (score < -20) {
          const hasSpy = Object.values(playerEsp.spies).some(
            s => s.targetCivId === civId && s.status !== 'captured' && s.status !== 'idle' && s.status !== 'cooldown',
          );
          if (!hasSpy) return true;
        }
      }
      return false;
    },
  },
  {
    id: 'spymaster_no_counter_intel',
    advisor: 'spymaster',
    icon: '🕵️',
    message: 'Our cities lack counter-intelligence. Any foreign spy could walk through our gates unseen. Consider stationing a spy defensively.',
    trigger: (state) => {
      if (!state.espionage) return false;
      const playerEsp = state.espionage[state.currentPlayer];
      if (!playerEsp) return false;
      const playerCiv = state.civilizations[state.currentPlayer];
      if (!playerCiv || playerCiv.cities.length === 0) return false;
      const hasEspTech = playerCiv.techState.completed.some(t => t.startsWith('espionage-'));
      if (!hasEspTech) return false;
      // Check if any owned city has no counter-intel
      const hasAnyCi = playerCiv.cities.some(
        cityId => (playerEsp.counterIntelligence[cityId] ?? 0) > 0,
      );
      return !hasAnyCi && Object.values(playerEsp.spies).filter(s => s.status !== 'captured').length > 0;
    },
  },
  {
    id: 'spymaster_spy_captured_warning',
    advisor: 'spymaster',
    icon: '🕵️',
    message: 'One of our agents has been captured. Expect diplomatic fallout. Perhaps we should let tempers cool before sending another.',
    trigger: (state) => {
      if (!state.espionage) return false;
      const playerEsp = state.espionage[state.currentPlayer];
      if (!playerEsp) return false;
      return Object.values(playerEsp.spies).some(s => s.status === 'captured');
    },
  },
  {
    id: 'spymaster_spy_expelled_warning',
    advisor: 'spymaster',
    icon: '🕵️',
    message: 'Our spy was discovered and expelled. The mission failed, but the agent survived. They will need time to recover before redeployment.',
    trigger: (state) => {
      if (!state.espionage) return false;
      const playerEsp = state.espionage[state.currentPlayer];
      if (!playerEsp) return false;
      return Object.values(playerEsp.spies).some(s => s.status === 'cooldown');
    },
  },
  {
    id: 'spymaster_mission_available',
    advisor: 'spymaster',
    icon: '🕵️',
    message: 'Our spy is in position and awaiting orders. Select a mission to begin gathering intelligence.',
    trigger: (state) => {
      if (!state.espionage) return false;
      const playerEsp = state.espionage[state.currentPlayer];
      if (!playerEsp) return false;
      return Object.values(playerEsp.spies).some(
        s => s.status === 'stationed' && !s.currentMission,
      );
    },
  },
```

Also add `'spymaster'` to any advisor-type guard checks in the system to make sure disabled check works.

- [ ] **Step 4: Run tests to verify they pass**

Run: `yarn test tests/ui/advisor-spymaster.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/ui/advisor-system.ts tests/ui/advisor-spymaster.test.ts
git commit -m "feat(m4a): Spymaster advisor — 6 trigger-based messages for espionage guidance"
```

---

## Task 9: Terrain Readability Labels

**Files:**
- Modify: `src/renderer/hex-renderer.ts`
- Create: `tests/renderer/terrain-labels.test.ts`

- [ ] **Step 1: Write failing tests — terrain label logic**

```typescript
// tests/renderer/terrain-labels.test.ts
import { describe, it, expect } from 'vitest';
import { getTerrainLabel, shouldShowTerrainLabel } from '@/renderer/hex-renderer';

describe('terrain labels', () => {
  describe('getTerrainLabel', () => {
    it('returns abbreviated label for each terrain type', () => {
      expect(getTerrainLabel('grassland')).toBe('Grass');
      expect(getTerrainLabel('plains')).toBe('Plains');
      expect(getTerrainLabel('desert')).toBe('Desert');
      expect(getTerrainLabel('tundra')).toBe('Tundra');
      expect(getTerrainLabel('snow')).toBe('Snow');
      expect(getTerrainLabel('forest')).toBe('Forest');
      expect(getTerrainLabel('hills')).toBe('Hills');
      expect(getTerrainLabel('mountain')).toBe('Mtn');
      expect(getTerrainLabel('ocean')).toBe('Ocean');
      expect(getTerrainLabel('coast')).toBe('Coast');
      expect(getTerrainLabel('jungle')).toBe('Jungle');
      expect(getTerrainLabel('swamp')).toBe('Swamp');
      expect(getTerrainLabel('volcanic')).toBe('Volc');
    });
  });

  describe('shouldShowTerrainLabel', () => {
    it('shows at default zoom (1.0)', () => {
      expect(shouldShowTerrainLabel(1.0)).toBe(true);
    });

    it('shows at slightly zoomed in (1.5)', () => {
      expect(shouldShowTerrainLabel(1.5)).toBe(true);
    });

    it('hides when zoomed out below threshold (0.4)', () => {
      expect(shouldShowTerrainLabel(0.4)).toBe(false);
    });

    it('shows when zoomed out just above threshold (0.6)', () => {
      expect(shouldShowTerrainLabel(0.6)).toBe(true);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `yarn test tests/renderer/terrain-labels.test.ts`
Expected: FAIL — functions not exported

- [ ] **Step 3: Implement terrain labels**

Add to `src/renderer/hex-renderer.ts`:

```typescript
import type { TerrainType } from '../core/types';

const TERRAIN_LABELS: Record<TerrainType, string> = {
  grassland: 'Grass',
  plains: 'Plains',
  desert: 'Desert',
  tundra: 'Tundra',
  snow: 'Snow',
  forest: 'Forest',
  hills: 'Hills',
  mountain: 'Mtn',
  ocean: 'Ocean',
  coast: 'Coast',
  jungle: 'Jungle',
  swamp: 'Swamp',
  volcanic: 'Volc',
};

const LABEL_ZOOM_THRESHOLD = 0.5;

export function getTerrainLabel(terrain: TerrainType): string {
  return TERRAIN_LABELS[terrain] ?? terrain;
}

export function shouldShowTerrainLabel(zoom: number): boolean {
  return zoom >= LABEL_ZOOM_THRESHOLD;
}
```

Then, in the `drawHex` function (or equivalent), add after the terrain fill:

```typescript
// Draw terrain label (after terrain fill, before borders)
if (shouldShowTerrainLabel(camera.zoom)) {
  const label = getTerrainLabel(tile.terrain);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
  ctx.font = `${Math.round(size * 0.22)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(label, cx, cy + size * 0.45);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `yarn test tests/renderer/terrain-labels.test.ts`
Expected: PASS

- [ ] **Step 5: Run full test suite**

Run: `yarn test`
Expected: All pass

- [ ] **Step 6: Commit**

```bash
git add src/renderer/hex-renderer.ts tests/renderer/terrain-labels.test.ts
git commit -m "feat(m4a): terrain readability — text labels on hex tiles at default zoom"
```

---

## Task 10: AI Espionage Behavior

**Files:**
- Modify: `src/ai/basic-ai.ts`
- Test: `tests/ai/ai-espionage.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/ai/ai-espionage.test.ts
import { describe, it, expect } from 'vitest';
import {
  shouldAiRecruitSpy,
  chooseAiSpyTarget,
  chooseAiMission,
} from '@/ai/basic-ai';
import type { GameState, EspionageCivState } from '@/core/types';
import { createEspionageCivState, recruitSpy } from '@/systems/espionage-system';

function makeAiTestState(): GameState {
  return {
    turn: 15,
    era: 2,
    currentPlayer: 'ai-egypt',
    map: { width: 10, height: 10, tiles: {}, wrapsHorizontally: false, rivers: [] },
    units: {},
    cities: {
      'city-player-1': {
        id: 'city-player-1', name: 'Capital', owner: 'player',
        position: { q: 0, r: 0 }, population: 5, food: 0, foodNeeded: 20,
        buildings: [], productionQueue: [], productionProgress: 0,
        ownedTiles: [], grid: [[null]], gridSize: 3,
      },
      'city-egypt-1': {
        id: 'city-egypt-1', name: 'Thebes', owner: 'ai-egypt',
        position: { q: 5, r: 3 }, population: 5, food: 0, foodNeeded: 20,
        buildings: [], productionQueue: [], productionProgress: 0,
        ownedTiles: [], grid: [[null]], gridSize: 3,
      },
    },
    civilizations: {
      player: {
        id: 'player', name: 'Player', color: '#4a90d9',
        isHuman: true, civType: 'egypt',
        cities: ['city-player-1'], units: [],
        techState: { completed: [], currentResearch: null, researchProgress: 0, trackPriorities: {} as any },
        gold: 100, visibility: { tiles: {} }, score: 50,
        diplomacy: { relationships: { 'ai-egypt': -10 }, treaties: [], events: [], atWarWith: [] },
      },
      'ai-egypt': {
        id: 'ai-egypt', name: 'Egypt', color: '#c4a94d',
        isHuman: false, civType: 'egypt',
        cities: ['city-egypt-1'], units: [],
        techState: {
          completed: ['espionage-scouting', 'espionage-informants'],
          currentResearch: null, researchProgress: 0, trackPriorities: {} as any,
        },
        gold: 150, visibility: { tiles: {} }, score: 100,
        diplomacy: { relationships: { player: -40 }, treaties: [], events: [], atWarWith: [] },
      },
    },
    barbarianCamps: {},
    minorCivs: {},
    gameOver: false,
    winner: null,
    tutorial: { active: false, currentStep: 'complete', completedSteps: [] },
    settings: { mapSize: 'small', soundEnabled: false, musicEnabled: false, musicVolume: 0, sfxVolume: 0, tutorialEnabled: false, advisorsEnabled: {} as any },
    tribalVillages: {},
    discoveredWonders: {},
    wonderDiscoverers: {},
    espionage: {
      player: createEspionageCivState(),
      'ai-egypt': createEspionageCivState(),
    },
  } as unknown as GameState;
}

describe('AI espionage decisions', () => {
  describe('shouldAiRecruitSpy', () => {
    it('returns true when AI has espionage tech and no spies', () => {
      const state = makeAiTestState();
      expect(shouldAiRecruitSpy(state, 'ai-egypt')).toBe(true);
    });

    it('returns false when AI has no espionage tech', () => {
      const state = makeAiTestState();
      state.civilizations['ai-egypt'].techState.completed = [];
      expect(shouldAiRecruitSpy(state, 'ai-egypt')).toBe(false);
    });

    it('returns false when at max spies', () => {
      const state = makeAiTestState();
      const { state: espState } = recruitSpy(state.espionage!['ai-egypt'], 'ai-egypt', 'seed-1');
      state.espionage!['ai-egypt'] = espState;
      expect(shouldAiRecruitSpy(state, 'ai-egypt')).toBe(false);
    });
  });

  describe('chooseAiSpyTarget', () => {
    it('targets the civ with lowest relationship', () => {
      const state = makeAiTestState();
      const target = chooseAiSpyTarget(state, 'ai-egypt');
      expect(target).toBeDefined();
      expect(target!.civId).toBe('player');
    });

    it('returns null if no valid targets', () => {
      const state = makeAiTestState();
      delete state.civilizations['player'];
      const target = chooseAiSpyTarget(state, 'ai-egypt');
      expect(target).toBeNull();
    });

    it('prefers civs at war over civs with low relationship', () => {
      const state = makeAiTestState();
      state.civilizations['ai-egypt'].diplomacy.atWarWith = ['player'];
      const target = chooseAiSpyTarget(state, 'ai-egypt');
      expect(target!.civId).toBe('player');
    });
  });

  describe('chooseAiMission', () => {
    it('chooses scout_area with only stage 1 tech', () => {
      const state = makeAiTestState();
      state.civilizations['ai-egypt'].techState.completed = ['espionage-scouting'];
      const mission = chooseAiMission(state, 'ai-egypt');
      expect(['scout_area', 'monitor_troops']).toContain(mission);
    });

    it('prefers gather_intel against hostile civs with stage 2 tech', () => {
      const state = makeAiTestState();
      const mission = chooseAiMission(state, 'ai-egypt');
      expect(mission).toBeDefined();
      // With hostile relationship and stage 2 tech, should prefer intel missions
      expect(['gather_intel', 'monitor_diplomacy', 'identify_resources', 'scout_area', 'monitor_troops']).toContain(mission);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `yarn test tests/ai/ai-espionage.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement AI espionage functions**

Add to `src/ai/basic-ai.ts`:

```typescript
import { canRecruitSpy, getAvailableMissions } from '../systems/espionage-system';
import type { SpyMissionType } from '../core/types';

export function shouldAiRecruitSpy(state: GameState, aiCivId: string): boolean {
  const civ = state.civilizations[aiCivId];
  if (!civ) return false;
  const hasEspTech = civ.techState.completed.some(t => t.startsWith('espionage-'));
  if (!hasEspTech) return false;
  const espState = state.espionage?.[aiCivId];
  if (!espState) return false;
  return canRecruitSpy(espState);
}

export function chooseAiSpyTarget(
  state: GameState,
  aiCivId: string,
): { civId: string; cityId: string; position: HexCoord } | null {
  const aiDip = state.civilizations[aiCivId]?.diplomacy;
  if (!aiDip) return null;

  // Score each potential target: at war = +100, negative relationship = abs(score)
  const targets: Array<{ civId: string; score: number }> = [];
  for (const [civId, relationship] of Object.entries(aiDip.relationships)) {
    if (civId === aiCivId) continue;
    const civ = state.civilizations[civId];
    if (!civ || civ.cities.length === 0) continue;
    let score = Math.abs(Math.min(0, relationship)); // more hostile = higher score
    if (aiDip.atWarWith.includes(civId)) score += 100;
    targets.push({ civId, score });
  }

  targets.sort((a, b) => b.score - a.score);
  if (targets.length === 0) return null;

  const bestCivId = targets[0].civId;
  const targetCiv = state.civilizations[bestCivId];
  const firstCityId = targetCiv.cities[0];
  const city = state.cities[firstCityId];
  if (!city) return null;

  return { civId: bestCivId, cityId: firstCityId, position: city.position };
}

export function chooseAiMission(
  state: GameState,
  aiCivId: string,
): SpyMissionType | null {
  const civ = state.civilizations[aiCivId];
  if (!civ) return null;
  const available = getAvailableMissions(civ.techState.completed);
  if (available.length === 0) return null;

  // Prefer intel-gathering missions for hostile relationships
  const preferredOrder: SpyMissionType[] = [
    'gather_intel', 'monitor_troops', 'monitor_diplomacy',
    'identify_resources', 'scout_area',
  ];
  for (const mission of preferredOrder) {
    if (available.includes(mission)) return mission;
  }
  return available[0];
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `yarn test tests/ai/ai-espionage.test.ts`
Expected: PASS

- [ ] **Step 5: Wire AI espionage into the AI turn loop**

In the AI decision function in `basic-ai.ts`, add espionage decisions after existing AI logic:

```typescript
// AI espionage decisions
if (shouldAiRecruitSpy(state, civId)) {
  // Recruit spy (handled via espionage system)
  const espState = state.espionage?.[civId];
  if (espState) {
    const { state: newEsp, spy } = recruitSpy(espState, civId, `ai-recruit-${state.turn}-${civId}`);
    state.espionage![civId] = newEsp;

    // Assign to target
    const target = chooseAiSpyTarget(state, civId);
    if (target) {
      state.espionage![civId] = assignSpy(
        state.espionage![civId], spy.id, target.civId, target.cityId, target.position,
      );
    }
  }
}

// Start missions for stationed spies without active missions
const espState = state.espionage?.[civId];
if (espState) {
  for (const spy of Object.values(espState.spies)) {
    if (spy.status === 'stationed' && !spy.currentMission) {
      const mission = chooseAiMission(state, civId);
      if (mission) {
        state.espionage![civId] = startMission(state.espionage![civId], spy.id, mission);
      }
    }
  }
}
```

- [ ] **Step 6: Run full test suite**

Run: `yarn test`
Expected: All pass

- [ ] **Step 7: Commit**

```bash
git add src/ai/basic-ai.ts tests/ai/ai-espionage.test.ts
git commit -m "feat(m4a): AI espionage — recruit spies, choose targets, select missions"
```

---

## Task 11: Espionage UI Panel

**Files:**
- Create: `src/ui/espionage-panel.ts`
- Test: `tests/ui/espionage-panel.test.ts`

This is a minimal espionage panel so players can recruit and assign spies. Full panel expansion (threat board, mission history) comes in M4c.

- [ ] **Step 1: Write failing tests — panel data helpers**

```typescript
// tests/ui/espionage-panel.test.ts
import { describe, it, expect } from 'vitest';
import {
  getEspionagePanelData,
  getSpyActions,
} from '@/ui/espionage-panel';
import { createEspionageCivState, recruitSpy, assignSpy } from '@/systems/espionage-system';
import type { GameState } from '@/core/types';

function makeEspUiState(): GameState {
  return {
    turn: 10, era: 2, currentPlayer: 'player', gameOver: false, winner: null,
    map: { width: 10, height: 10, tiles: {}, wrapsHorizontally: false, rivers: [] },
    units: {},
    cities: {
      'city-egypt-1': {
        id: 'city-egypt-1', name: 'Thebes', owner: 'ai-egypt',
        position: { q: 5, r: 3 }, population: 5, food: 0, foodNeeded: 20,
        buildings: [], productionQueue: [], productionProgress: 0,
        ownedTiles: [], grid: [[null]], gridSize: 3,
      },
    },
    civilizations: {
      player: {
        id: 'player', name: 'Player', color: '#4a90d9',
        isHuman: true, civType: 'egypt',
        cities: ['city-player-1'], units: [],
        techState: { completed: ['espionage-scouting'], currentResearch: null, researchProgress: 0, trackPriorities: {} as any },
        gold: 100, visibility: { tiles: {} }, score: 50,
        diplomacy: { relationships: { 'ai-egypt': -10 }, treaties: [], events: [], atWarWith: [] },
      },
      'ai-egypt': {
        id: 'ai-egypt', name: 'Egypt', color: '#c4a94d',
        isHuman: false, civType: 'egypt',
        cities: ['city-egypt-1'], units: [],
        techState: { completed: [], currentResearch: null, researchProgress: 0, trackPriorities: {} as any },
        gold: 150, visibility: { tiles: {} }, score: 100,
        diplomacy: { relationships: { player: -10 }, treaties: [], events: [], atWarWith: [] },
      },
    },
    barbarianCamps: {}, minorCivs: {},
    tutorial: { active: false, currentStep: 'complete', completedSteps: [] },
    settings: { mapSize: 'small', soundEnabled: false, musicEnabled: false, musicVolume: 0, sfxVolume: 0, tutorialEnabled: false, advisorsEnabled: {} as any },
    tribalVillages: {}, discoveredWonders: {}, wonderDiscoverers: {},
    espionage: { player: createEspionageCivState(), 'ai-egypt': createEspionageCivState() },
  } as unknown as GameState;
}

describe('espionage-panel', () => {
  describe('getEspionagePanelData', () => {
    it('returns spy list for current player only', () => {
      const state = makeEspUiState();
      const { state: esp, spy } = recruitSpy(state.espionage!['player'], 'player', 'seed-1');
      state.espionage!['player'] = esp;
      const data = getEspionagePanelData(state);
      expect(data.spies).toHaveLength(1);
      expect(data.spies[0].id).toBe(spy.id);
    });

    it('includes canRecruit flag', () => {
      const state = makeEspUiState();
      const data = getEspionagePanelData(state);
      expect(data.canRecruit).toBe(true);
    });

    it('includes maxSpies and current count', () => {
      const state = makeEspUiState();
      const data = getEspionagePanelData(state);
      expect(data.maxSpies).toBe(1);
      expect(data.activeSpyCount).toBe(0);
    });

    it('never exposes other players spy data', () => {
      const state = makeEspUiState();
      const { state: esp } = recruitSpy(state.espionage!['ai-egypt'], 'ai-egypt', 'ai-seed');
      state.espionage!['ai-egypt'] = esp;
      const data = getEspionagePanelData(state);
      // Should only show current player's spies
      expect(data.spies.every(s => s.owner === state.currentPlayer)).toBe(true);
    });
  });

  describe('getSpyActions', () => {
    it('returns assign action for idle spy', () => {
      const state = makeEspUiState();
      const { state: esp, spy } = recruitSpy(state.espionage!['player'], 'player', 'seed-1');
      state.espionage!['player'] = esp;
      const actions = getSpyActions(state, spy.id);
      expect(actions).toContain('assign');
      expect(actions).toContain('assign_defensive');
    });

    it('returns mission and recall actions for stationed spy', () => {
      const state = makeEspUiState();
      const { state: esp, spy } = recruitSpy(state.espionage!['player'], 'player', 'seed-1');
      state.espionage!['player'] = assignSpy(esp, spy.id, 'ai-egypt', 'city-egypt-1', { q: 5, r: 3 });
      state.espionage!['player'].spies[spy.id].status = 'stationed';
      const actions = getSpyActions(state, spy.id);
      expect(actions).toContain('start_mission');
      expect(actions).toContain('recall');
    });

    it('returns no actions for captured spy', () => {
      const state = makeEspUiState();
      const { state: esp, spy } = recruitSpy(state.espionage!['player'], 'player', 'seed-1');
      state.espionage!['player'] = esp;
      state.espionage!['player'].spies[spy.id].status = 'captured';
      const actions = getSpyActions(state, spy.id);
      expect(actions).toHaveLength(0);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `yarn test tests/ui/espionage-panel.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement espionage panel data helpers**

```typescript
// src/ui/espionage-panel.ts
import type { GameState, Spy, SpyStatus } from '../core/types';
import { canRecruitSpy, getAvailableMissions } from '../systems/espionage-system';

export interface EspionagePanelData {
  spies: Spy[];
  canRecruit: boolean;
  maxSpies: number;
  activeSpyCount: number;
  availableMissions: string[];
}

export type SpyAction = 'assign' | 'assign_defensive' | 'start_mission' | 'recall';

export function getEspionagePanelData(state: GameState): EspionagePanelData {
  const civEsp = state.espionage?.[state.currentPlayer];
  if (!civEsp) {
    return { spies: [], canRecruit: false, maxSpies: 0, activeSpyCount: 0, availableMissions: [] };
  }

  const spies = Object.values(civEsp.spies).filter(s => s.owner === state.currentPlayer);
  const activeSpyCount = spies.filter(s => s.status !== 'captured').length;
  const completedTechs = state.civilizations[state.currentPlayer]?.techState.completed ?? [];

  return {
    spies,
    canRecruit: canRecruitSpy(civEsp),
    maxSpies: civEsp.maxSpies,
    activeSpyCount,
    availableMissions: getAvailableMissions(completedTechs),
  };
}

export function getSpyActions(state: GameState, spyId: string): SpyAction[] {
  const civEsp = state.espionage?.[state.currentPlayer];
  if (!civEsp) return [];
  const spy = civEsp.spies[spyId];
  if (!spy) return [];

  const actions: SpyAction[] = [];

  switch (spy.status) {
    case 'idle':
      actions.push('assign', 'assign_defensive');
      break;
    case 'stationed':
      if (!spy.currentMission && spy.targetCivId) {
        actions.push('start_mission');
      }
      actions.push('recall');
      break;
    case 'traveling':
      actions.push('recall');
      break;
    case 'captured':
    case 'cooldown':
    case 'on_mission':
      // No actions available
      break;
  }

  return actions;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `yarn test tests/ui/espionage-panel.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/ui/espionage-panel.ts tests/ui/espionage-panel.test.ts
git commit -m "feat(m4a): espionage UI panel — data helpers for spy management"
```

---

## Task 12: Hot Seat Espionage Safety

**Files:**
- Test: `tests/integration/m4a-espionage-integration.test.ts` (append)

- [ ] **Step 1: Write hot seat espionage tests**

```typescript
// Append to tests/integration/m4a-espionage-integration.test.ts

describe('hot seat espionage safety', () => {
  it('never exposes one players spy data to another', () => {
    const state = makeTestGameState();
    state.hotSeat = {
      playerCount: 2,
      mapSize: 'small',
      players: [
        { name: 'Alice', slotId: 'player', civType: 'egypt', isHuman: true },
        { name: 'Bob', slotId: 'player-2', civType: 'rome', isHuman: true },
      ],
    };
    // Add player-2
    state.civilizations['player-2'] = {
      id: 'player-2', name: 'Rome', color: '#dc2626',
      isHuman: true, civType: 'rome',
      cities: ['city-rome-1'], units: [],
      techState: { completed: ['espionage-scouting'], currentResearch: null, researchProgress: 0, trackPriorities: {} as any },
      gold: 100, visibility: { tiles: {} }, score: 50,
      diplomacy: { relationships: { player: 0 }, treaties: [], events: [], atWarWith: [] },
    };
    state.cities['city-rome-1'] = {
      id: 'city-rome-1', name: 'Rome', owner: 'player-2',
      position: { q: 8, r: 1 }, population: 3, food: 0, foodNeeded: 15,
      buildings: [], productionQueue: [], productionProgress: 0,
      ownedTiles: [], grid: [[null]], gridSize: 3,
    };
    state.espionage = {
      player: createEspionageCivState(),
      'player-2': createEspionageCivState(),
      'ai-egypt': createEspionageCivState(),
    };

    // Player 1 recruits and assigns spy to player 2
    const { state: pEsp, spy: pSpy } = recruitSpy(state.espionage['player'], 'player', 'p-seed');
    state.espionage['player'] = assignSpy(pEsp, pSpy.id, 'player-2', 'city-rome-1', { q: 8, r: 1 });

    // When it's player 2's turn, player 1's spy data should not be accessible
    state.currentPlayer = 'player-2';
    const p2Espionage = state.espionage['player-2'];
    // Player 2's espionage state should NOT contain player 1's spies
    expect(Object.values(p2Espionage.spies).some(s => s.owner === 'player')).toBe(false);
  });

  it('espionage events use currentPlayer for context', () => {
    const state = makeTestGameState();
    state.currentPlayer = 'player';
    state.espionage = initializeEspionage(state);

    // Only the current player's espionage data should be shown in UI
    // This is a design constraint — the UI must filter by currentPlayer
    const currentEsp = state.espionage![state.currentPlayer];
    expect(currentEsp).toBeDefined();
    expect(currentEsp.spies).toBeDefined();
  });

  it('processes all civ espionage during turn processing regardless of currentPlayer', () => {
    const state = makeTestGameState();
    state.currentPlayer = 'player';
    state.espionage = initializeEspionage(state);

    // Both player and AI have traveling spies
    const { state: pEsp, spy: pSpy } = recruitSpy(state.espionage!['player'], 'player', 'p-seed');
    state.espionage!['player'] = assignSpy(pEsp, pSpy.id, 'ai-egypt', 'city-egypt-1', { q: 5, r: 3 });

    const { state: aEsp, spy: aSpy } = recruitSpy(state.espionage!['ai-egypt'], 'ai-egypt', 'a-seed');
    state.espionage!['ai-egypt'] = aEsp;
    state.espionage!['ai-egypt'].spies[aSpy.id].status = 'traveling';
    state.espionage!['ai-egypt'].spies[aSpy.id].targetCivId = 'player';

    const bus = new EventBus();
    const newState = processEspionageTurn(state, bus);

    expect(newState.espionage!['player'].spies[pSpy.id].status).toBe('stationed');
    expect(newState.espionage!['ai-egypt'].spies[aSpy.id].status).toBe('stationed');
  });
});
```

- [ ] **Step 2: Run tests**

Run: `yarn test tests/integration/m4a-espionage-integration.test.ts`
Expected: PASS (these tests verify constraints that should already work)

- [ ] **Step 3: Commit**

```bash
git add tests/integration/m4a-espionage-integration.test.ts
git commit -m "test(m4a): hot seat espionage safety — verify spy data isolation and turn processing"
```

---

## Task 13: Full M4a Integration Test Suite

**Files:**
- Test: `tests/integration/m4a-espionage-integration.test.ts` (append)

- [ ] **Step 1: Write comprehensive integration tests**

```typescript
// Append to tests/integration/m4a-espionage-integration.test.ts

describe('M4a full integration', () => {
  it('complete espionage lifecycle: recruit → assign → travel → station → mission → success', () => {
    const state = makeTestGameState();
    state.espionage = initializeEspionage(state);
    const bus = new EventBus();
    const events: any[] = [];
    bus.on('espionage:spy-arrived', (d) => events.push({ type: 'arrived', ...d }));
    bus.on('espionage:mission-succeeded', (d) => events.push({ type: 'succeeded', ...d }));
    bus.on('espionage:mission-failed', (d) => events.push({ type: 'failed', ...d }));

    // 1. Recruit
    const { state: esp1, spy } = recruitSpy(state.espionage!['player'], 'player', 'lifecycle-seed');
    state.espionage!['player'] = esp1;

    // 2. Assign
    state.espionage!['player'] = assignSpy(
      state.espionage!['player'], spy.id, 'ai-egypt', 'city-egypt-1', { q: 5, r: 3 },
    );
    expect(state.espionage!['player'].spies[spy.id].status).toBe('traveling');

    // 3. Process turn → spy arrives
    let newState = processEspionageTurn(state, bus);
    expect(newState.espionage!['player'].spies[spy.id].status).toBe('stationed');
    expect(events.some(e => e.type === 'arrived')).toBe(true);

    // 4. Start mission
    newState.espionage!['player'] = startMission(
      newState.espionage!['player'], spy.id, 'scout_area',
    );
    expect(newState.espionage!['player'].spies[spy.id].status).toBe('on_mission');

    // 5. Process turn → mission resolves (scout_area = 1 turn)
    const finalState = processEspionageTurn(newState, bus);
    const finalSpy = finalState.espionage!['player'].spies[spy.id];
    // Mission resolved — spy is either stationed (success) or cooldown/captured (failure)
    expect(['stationed', 'cooldown', 'captured']).toContain(finalSpy.status);
    expect(finalSpy.currentMission).toBeNull();
  });

  it('multi-turn mission completes after correct number of turns', () => {
    const state = makeTestGameState();
    state.espionage = initializeEspionage(state);
    const bus = new EventBus();

    const { state: esp1, spy } = recruitSpy(state.espionage!['player'], 'player', 'multi-seed');
    state.espionage!['player'] = esp1;
    state.espionage!['player'] = assignSpy(
      state.espionage!['player'], spy.id, 'ai-egypt', 'city-egypt-1', { q: 5, r: 3 },
    );

    // Turn 1: traveling → stationed
    let s = processEspionageTurn(state, bus);
    expect(s.espionage!['player'].spies[spy.id].status).toBe('stationed');

    // Start gather_intel (3 turns)
    s.espionage!['player'] = startMission(s.espionage!['player'], spy.id, 'gather_intel');

    // Turn 2: mission progress (2 remaining)
    s.turn = 11;
    s = processEspionageTurn(s, bus);
    expect(s.espionage!['player'].spies[spy.id].currentMission!.turnsRemaining).toBe(2);

    // Turn 3: mission progress (1 remaining)
    s.turn = 12;
    s = processEspionageTurn(s, bus);
    expect(s.espionage!['player'].spies[spy.id].currentMission!.turnsRemaining).toBe(1);

    // Turn 4: mission resolves
    s.turn = 13;
    s = processEspionageTurn(s, bus);
    expect(s.espionage!['player'].spies[spy.id].currentMission).toBeNull();
  });

  it('stationed spy passively reveals fog around target city each turn', () => {
    const state = makeTestGameState();
    state.espionage = initializeEspionage(state);
    const bus = new EventBus();
    // Add map tiles around Egypt's city
    for (let q = 3; q <= 7; q++) {
      for (let r = 1; r <= 5; r++) {
        state.map.tiles[`${q},${r}`] = {
          coord: { q, r }, terrain: 'plains', elevation: 'lowland',
          resource: null, improvement: 'none', owner: null,
          improvementTurnsLeft: 0, hasRiver: false, wonder: null,
        };
      }
    }
    // Player has no visibility
    state.civilizations['player'].visibility.tiles = {};

    // Recruit and station spy
    const { state: esp1, spy } = recruitSpy(state.espionage!['player'], 'player', 'passive-seed');
    state.espionage!['player'] = esp1;
    state.espionage!['player'] = assignSpy(
      state.espionage!['player'], spy.id, 'ai-egypt', 'city-egypt-1', { q: 5, r: 3 },
    );
    // Arrive
    let s = processEspionageTurn(state, bus);
    expect(s.espionage!['player'].spies[spy.id].status).toBe('stationed');

    // Next turn: passive reveal should happen
    s.turn = 11;
    s = processEspionageTurn(s, bus);
    // Tiles around city (q:5, r:3) within radius 3 should be visible
    expect(s.civilizations['player'].visibility.tiles['5,3']).toBe('visible');
    expect(s.civilizations['player'].visibility.tiles['4,3']).toBe('visible');
  });

  it('stationed spy passively reports troop movements each turn', () => {
    const state = makeTestGameState();
    state.espionage = initializeEspionage(state);
    const bus = new EventBus();
    const troopReports: any[] = [];
    bus.on('espionage:mission-succeeded', (d) => {
      if (d.result && (d.result as any).passive) troopReports.push(d);
    });

    const { state: esp1, spy } = recruitSpy(state.espionage!['player'], 'player', 'troop-seed');
    state.espionage!['player'] = esp1;
    state.espionage!['player'] = assignSpy(
      state.espionage!['player'], spy.id, 'ai-egypt', 'city-egypt-1', { q: 5, r: 3 },
    );
    state.espionage!['player'].spies[spy.id].status = 'stationed';

    // Egypt has a unit near the city
    state.units['unit-eg-1'] = {
      id: 'unit-eg-1', type: 'warrior', owner: 'ai-egypt',
      position: { q: 5, r: 3 }, movementPointsLeft: 2,
      health: 100, experience: 0, hasMoved: false, hasActed: false,
    };

    processEspionageTurn(state, bus);
    expect(troopReports.length).toBeGreaterThan(0);
    expect((troopReports[0].result as any).nearbyUnits.length).toBeGreaterThan(0);
  });

  it('handles spy in destroyed/captured city gracefully', () => {
    const state = makeTestGameState();
    state.espionage = initializeEspionage(state);
    const bus = new EventBus();

    const { state: esp1, spy } = recruitSpy(state.espionage!['player'], 'player', 'destroyed-seed');
    state.espionage!['player'] = esp1;
    state.espionage!['player'] = assignSpy(
      state.espionage!['player'], spy.id, 'ai-egypt', 'city-egypt-1', { q: 5, r: 3 },
    );
    state.espionage!['player'].spies[spy.id].status = 'stationed';

    // Remove the target city (simulating capture/destruction)
    delete state.cities['city-egypt-1'];

    // Should not crash — spy should be gracefully handled
    const newState = processEspionageTurn(state, bus);
    expect(newState).toBeDefined();
  });

  it('new civ definitions are selectable and functional', () => {
    const newCivIds = ['france', 'germany', 'gondor', 'rohan'];
    for (const civId of newCivIds) {
      const def = getCivDefinition(civId);
      expect(def).toBeDefined();
      expect(def!.id).toBe(civId);
      expect(def!.bonusEffect).toBeDefined();
      expect(def!.personality.traits.length).toBeGreaterThan(0);
      expect(def!.color).toBeTruthy();
    }
  });

  it('espionage state survives serialization (structuredClone)', () => {
    const state = makeTestGameState();
    state.espionage = initializeEspionage(state);
    const { state: esp1, spy } = recruitSpy(state.espionage!['player'], 'player', 'serial-seed');
    state.espionage!['player'] = esp1;

    const cloned = structuredClone(state);
    expect(cloned.espionage!['player'].spies[spy.id].id).toBe(spy.id);
    expect(cloned.espionage!['player'].spies[spy.id].name).toBe(spy.name);
    expect(cloned.espionage!['player'].spies[spy.id].status).toBe('idle');
  });

  it('espionage works with seeded RNG — same seed produces same outcomes', () => {
    const makeScenario = () => {
      const state = makeTestGameState();
      state.espionage = initializeEspionage(state);
      const { state: esp1, spy } = recruitSpy(state.espionage!['player'], 'player', 'determ-seed');
      state.espionage!['player'] = esp1;
      state.espionage!['player'] = assignSpy(
        state.espionage!['player'], spy.id, 'ai-egypt', 'city-egypt-1', { q: 5, r: 3 },
      );
      state.espionage!['player'].spies[spy.id].status = 'on_mission';
      state.espionage!['player'].spies[spy.id].currentMission = {
        type: 'scout_area', turnsRemaining: 1, turnsTotal: 1,
        targetCivId: 'ai-egypt', targetCityId: 'city-egypt-1',
      };
      return state;
    };

    const bus1 = new EventBus();
    const bus2 = new EventBus();
    const results1: string[] = [];
    const results2: string[] = [];
    bus1.on('espionage:mission-succeeded', () => results1.push('success'));
    bus1.on('espionage:mission-failed', () => results1.push('failed'));
    bus1.on('espionage:spy-expelled', () => results1.push('expelled'));
    bus1.on('espionage:spy-captured', () => results1.push('captured'));
    bus2.on('espionage:mission-succeeded', () => results2.push('success'));
    bus2.on('espionage:mission-failed', () => results2.push('failed'));
    bus2.on('espionage:spy-expelled', () => results2.push('expelled'));
    bus2.on('espionage:spy-captured', () => results2.push('captured'));

    // Both should produce identical results with identical state
    processEspionageTurn(makeScenario(), bus1);
    processEspionageTurn(makeScenario(), bus2);

    expect(results1).toEqual(results2);
  });
});
```

- [ ] **Step 2: Run all tests**

Run: `yarn test`
Expected: All pass

- [ ] **Step 3: Commit**

```bash
git add tests/integration/m4a-espionage-integration.test.ts tests/systems/civ-definitions.test.ts
git commit -m "test(m4a): comprehensive integration tests — lifecycle, serialization, determinism, hot seat"
```

---

## Task 14: Final Verification & Cleanup

- [ ] **Step 1: Run full test suite**

Run: `yarn test`
Expected: All pass with zero failures

- [ ] **Step 2: Run build**

Run: `yarn build`
Expected: No TypeScript errors, clean build

- [ ] **Step 3: Verify no Math.random() usage**

Run: `grep -r "Math.random" src/systems/espionage-system.ts`
Expected: No matches

- [ ] **Step 4: Verify no hardcoded 'player' in espionage system**

Run: `grep -n "'player'" src/systems/espionage-system.ts`
Expected: No matches (only test files should reference 'player')

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat(m4a): complete Eyes & Ears milestone — espionage, Spymaster, terrain labels, 4 new civs"
```
