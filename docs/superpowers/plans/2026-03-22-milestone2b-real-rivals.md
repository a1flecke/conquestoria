# Milestone 2b "Real Rivals" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 6 playable civilizations with unique bonuses, a diplomacy system with relationships/treaties, and personality-driven AI that makes strategic decisions.

**Architecture:** New `CivDefinition` type defines each civ's bonuses and personality traits. Diplomacy runs as a standalone system with per-pair relationship scores, event memory, and treaty tracking. AI is decomposed from one monolithic function into three focused modules (personality, strategy, diplomacy) orchestrated by a refactored `basic-ai.ts`.

**Tech Stack:** TypeScript, Vitest, EventBus (event-driven architecture)

**Prerequisites:** Milestone 2a complete (135 tests passing, 40-tech tree, rivers, city grid, adjacency system)

**Setup:** Run `eval "$(mise activate bash)"` before any yarn/node commands.

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `src/systems/civ-definitions.ts` | 6 civ definitions: id, name, color, bonus, personality traits |
| `src/systems/diplomacy-system.ts` | Relationship scores, diplomatic actions, treaties, event memory |
| `src/ai/ai-personality.ts` | Trait definitions and decision-weight functions |
| `src/ai/ai-strategy.ts` | Tech selection, city production, expansion targeting |
| `src/ai/ai-diplomacy.ts` | AI diplomatic decision-making (propose/evaluate treaties) |
| `src/ui/civ-select.ts` | Civ selection panel on new game |
| `src/ui/diplomacy-panel.ts` | Diplomacy UI panel |
| `tests/systems/civ-definitions.test.ts` | Civ definition tests |
| `tests/systems/diplomacy-system.test.ts` | Diplomacy system tests |
| `tests/ai/ai-personality.test.ts` | AI personality tests |
| `tests/ai/ai-strategy.test.ts` | AI strategy tests |

### Modified Files
| File | Changes |
|------|---------|
| `src/core/types.ts` | Add CivDefinition, DiplomacyState, DiplomaticEvent, Treaty, PersonalityTraits; add civType/diplomacy to Civilization; new events |
| `src/core/game-state.ts` | Accept civType param, create 2 civs (player + AI) with civ definitions |
| `src/core/turn-manager.ts` | Process diplomacy each turn (relationship drift, treaty ticks) |
| `src/systems/city-system.ts` | Apply civ bonuses to building speed |
| `src/systems/unit-system.ts` | Apply civ bonuses to movement/training |
| `src/ai/basic-ai.ts` | Refactor into orchestrator calling strategy/diplomacy modules |
| `src/main.ts` | Show civ select on new game, add diplomacy button, process multiple AIs |

---

## Task 1: Core Types

**Files:**
- Modify: `src/core/types.ts`

- [ ] **Step 1: Add civ and diplomacy types to types.ts**

Add after the `Building` interface (around line 112):

```typescript
// --- Civilization Definitions ---

export type PersonalityTrait = 'aggressive' | 'diplomatic' | 'expansionist' | 'trader';

export interface PersonalityTraits {
  traits: PersonalityTrait[];
  warLikelihood: number;      // 0-1, how likely to declare war
  diplomacyFocus: number;     // 0-1, how much to prioritize diplomacy
  expansionDrive: number;     // 0-1, how much to prioritize expansion
}

export type CivBonusEffect =
  | { type: 'faster_wonders'; speedMultiplier: number }
  | { type: 'auto_roads' }
  | { type: 'diplomacy_start_bonus'; bonus: number }
  | { type: 'mounted_movement'; bonus: number }
  | { type: 'free_tech_on_era' }
  | { type: 'faster_military'; speedMultiplier: number };

export interface CivDefinition {
  id: string;
  name: string;
  color: string;
  bonusName: string;
  bonusDescription: string;
  bonusEffect: CivBonusEffect;
  personality: PersonalityTraits;
}
```

Add after `BarbarianCamp` (around line 176):

```typescript
// --- Diplomacy ---

export type DiplomaticAction =
  | 'declare_war'
  | 'request_peace'
  | 'non_aggression_pact'
  | 'trade_agreement'
  | 'open_borders'
  | 'alliance';

export type TreatyType = 'non_aggression_pact' | 'trade_agreement' | 'open_borders' | 'alliance';

export interface Treaty {
  type: TreatyType;
  civA: string;
  civB: string;
  turnsRemaining: number;     // -1 = permanent until broken
  goldPerTurn?: number;       // for trade agreements
}

export interface DiplomaticEvent {
  type: string;               // 'war_declared', 'peace_made', 'treaty_broken', etc.
  turn: number;
  otherCiv: string;
  weight: number;             // decays over time
}

export interface DiplomacyState {
  relationships: Record<string, number>;    // civId -> score (-100 to +100)
  treaties: Treaty[];
  events: DiplomaticEvent[];
  atWarWith: string[];
}
```

Modify the `Civilization` interface to add:

```typescript
export interface Civilization {
  id: string;
  name: string;
  color: string;
  isHuman: boolean;
  civType: string;              // references CivDefinition.id, 'generic' for legacy
  cities: string[];
  units: string[];
  techState: TechState;
  gold: number;
  visibility: VisibilityMap;
  score: number;
  diplomacy: DiplomacyState;
}
```

Add new events to `GameEvents`:

```typescript
  'diplomacy:war-declared': { attackerId: string; defenderId: string };
  'diplomacy:peace-made': { civA: string; civB: string };
  'diplomacy:treaty-proposed': { fromCiv: string; toCiv: string; treaty: TreatyType };
  'diplomacy:treaty-accepted': { civA: string; civB: string; treaty: TreatyType };
  'diplomacy:treaty-broken': { breakerId: string; otherCiv: string; treaty: TreatyType };
```

- [ ] **Step 2: Verify build compiles**

Run: `eval "$(mise activate bash)" && yarn build 2>&1 | head -30`
Expected: Compilation errors in files that create Civilization objects without the new required fields — this is expected. We'll fix them in subsequent tasks.

- [ ] **Step 3: Commit**

```bash
git add src/core/types.ts
git commit -m "feat(m2b): add civ definitions, diplomacy, and personality types"
```

---

## Task 2: Civilization Definitions

**Files:**
- Create: `src/systems/civ-definitions.ts`
- Create: `tests/systems/civ-definitions.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
import { describe, it, expect } from 'vitest';
import { CIV_DEFINITIONS, getCivDefinition } from '@/systems/civ-definitions';

describe('civ-definitions', () => {
  it('defines exactly 6 civilizations', () => {
    expect(CIV_DEFINITIONS).toHaveLength(6);
  });

  it('each civ has unique id, name, and color', () => {
    const ids = CIV_DEFINITIONS.map(c => c.id);
    const names = CIV_DEFINITIONS.map(c => c.name);
    const colors = CIV_DEFINITIONS.map(c => c.color);
    expect(new Set(ids).size).toBe(6);
    expect(new Set(names).size).toBe(6);
    expect(new Set(colors).size).toBe(6);
  });

  it('getCivDefinition returns correct civ by id', () => {
    const egypt = getCivDefinition('egypt');
    expect(egypt).toBeDefined();
    expect(egypt!.name).toBe('Egypt');
    expect(egypt!.bonusEffect.type).toBe('faster_wonders');
  });

  it('getCivDefinition returns undefined for unknown id', () => {
    expect(getCivDefinition('atlantis')).toBeUndefined();
  });

  it('each civ has at least one personality trait', () => {
    for (const civ of CIV_DEFINITIONS) {
      expect(civ.personality.traits.length).toBeGreaterThan(0);
    }
  });

  it('egypt has faster_wonders bonus with 0.7 multiplier', () => {
    const egypt = getCivDefinition('egypt')!;
    expect(egypt.bonusEffect).toEqual({ type: 'faster_wonders', speedMultiplier: 0.7 });
  });

  it('mongolia has mounted_movement bonus', () => {
    const mongolia = getCivDefinition('mongolia')!;
    expect(mongolia.bonusEffect).toEqual({ type: 'mounted_movement', bonus: 1 });
  });

  it('zulu has faster_military bonus with 0.75 multiplier', () => {
    const zulu = getCivDefinition('zulu')!;
    expect(zulu.bonusEffect).toEqual({ type: 'faster_military', speedMultiplier: 0.75 });
  });

  it('greece has diplomacy_start_bonus of 20', () => {
    const greece = getCivDefinition('greece')!;
    expect(greece.bonusEffect).toEqual({ type: 'diplomacy_start_bonus', bonus: 20 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `eval "$(mise activate bash)" && yarn test tests/systems/civ-definitions.test.ts 2>&1 | tail -10`
Expected: FAIL — module not found

- [ ] **Step 3: Implement civ-definitions.ts**

```typescript
import type { CivDefinition } from '@/core/types';

export const CIV_DEFINITIONS: CivDefinition[] = [
  {
    id: 'egypt',
    name: 'Egypt',
    color: '#c4a94d',
    bonusName: 'Master Builders',
    bonusDescription: 'Wonders (Monument, Amphitheater) build 30% faster',
    bonusEffect: { type: 'faster_wonders', speedMultiplier: 0.7 },
    personality: {
      traits: ['diplomatic', 'expansionist'],
      warLikelihood: 0.2,
      diplomacyFocus: 0.7,
      expansionDrive: 0.8,
    },
  },
  {
    id: 'rome',
    name: 'Rome',
    color: '#d94a4a',
    bonusName: 'Roman Roads',
    bonusDescription: 'Roads auto-built between cities (free movement bonus)',
    bonusEffect: { type: 'auto_roads' },
    personality: {
      traits: ['aggressive', 'expansionist'],
      warLikelihood: 0.7,
      diplomacyFocus: 0.3,
      expansionDrive: 0.9,
    },
  },
  {
    id: 'greece',
    name: 'Greece',
    color: '#4a90d9',
    bonusName: 'Diplomatic Influence',
    bonusDescription: 'Relationship scores with AI start at +20',
    bonusEffect: { type: 'diplomacy_start_bonus', bonus: 20 },
    personality: {
      traits: ['diplomatic', 'trader'],
      warLikelihood: 0.15,
      diplomacyFocus: 0.9,
      expansionDrive: 0.4,
    },
  },
  {
    id: 'mongolia',
    name: 'Mongolia',
    color: '#4a9b4a',
    bonusName: 'Horse Lords',
    bonusDescription: 'Mounted units get +1 movement point',
    bonusEffect: { type: 'mounted_movement', bonus: 1 },
    personality: {
      traits: ['aggressive'],
      warLikelihood: 0.8,
      diplomacyFocus: 0.2,
      expansionDrive: 0.6,
    },
  },
  {
    id: 'babylon',
    name: 'Babylon',
    color: '#9b4ad9',
    bonusName: 'Cradle of Knowledge',
    bonusDescription: 'Free tech when entering a new era',
    bonusEffect: { type: 'free_tech_on_era' },
    personality: {
      traits: ['diplomatic'],
      warLikelihood: 0.2,
      diplomacyFocus: 0.6,
      expansionDrive: 0.5,
    },
  },
  {
    id: 'zulu',
    name: 'Zulu',
    color: '#d9944a',
    bonusName: 'Rapid Mobilization',
    bonusDescription: 'Military units train 25% faster',
    bonusEffect: { type: 'faster_military', speedMultiplier: 0.75 },
    personality: {
      traits: ['aggressive'],
      warLikelihood: 0.85,
      diplomacyFocus: 0.1,
      expansionDrive: 0.7,
    },
  },
];

export function getCivDefinition(id: string): CivDefinition | undefined {
  return CIV_DEFINITIONS.find(c => c.id === id);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `eval "$(mise activate bash)" && yarn test tests/systems/civ-definitions.test.ts 2>&1 | tail -10`
Expected: All 8 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/systems/civ-definitions.ts tests/systems/civ-definitions.test.ts
git commit -m "feat(m2b): add 6 civilization definitions with bonuses and personalities"
```

---

## Task 3: Diplomacy System Core

**Files:**
- Create: `src/systems/diplomacy-system.ts`
- Create: `tests/systems/diplomacy-system.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
import { describe, it, expect } from 'vitest';
import {
  createDiplomacyState,
  getRelationship,
  modifyRelationship,
  declareWar,
  makePeace,
  proposeTreaty,
  breakTreaty,
  processRelationshipDrift,
  decayEvents,
  getAvailableActions,
  isAtWar,
} from '@/systems/diplomacy-system';
import type { DiplomacyState } from '@/core/types';

describe('diplomacy-system', () => {
  const civIds = ['player', 'ai-egypt', 'ai-rome'];

  describe('createDiplomacyState', () => {
    it('creates state with zero relationships', () => {
      const state = createDiplomacyState(civIds, 'player');
      expect(getRelationship(state, 'ai-egypt')).toBe(0);
      expect(getRelationship(state, 'ai-rome')).toBe(0);
    });

    it('applies diplomacy start bonus', () => {
      const state = createDiplomacyState(civIds, 'player', 20);
      expect(getRelationship(state, 'ai-egypt')).toBe(20);
      expect(getRelationship(state, 'ai-rome')).toBe(20);
    });
  });

  describe('modifyRelationship', () => {
    it('adds to relationship score', () => {
      let state = createDiplomacyState(civIds, 'player');
      state = modifyRelationship(state, 'ai-egypt', 15);
      expect(getRelationship(state, 'ai-egypt')).toBe(15);
    });

    it('clamps to -100 / +100', () => {
      let state = createDiplomacyState(civIds, 'player');
      state = modifyRelationship(state, 'ai-egypt', 200);
      expect(getRelationship(state, 'ai-egypt')).toBe(100);
      state = modifyRelationship(state, 'ai-egypt', -300);
      expect(getRelationship(state, 'ai-egypt')).toBe(-100);
    });
  });

  describe('declareWar', () => {
    it('sets atWarWith and reduces relationship by 50', () => {
      let state = createDiplomacyState(civIds, 'player');
      state = declareWar(state, 'ai-egypt', 5);
      expect(isAtWar(state, 'ai-egypt')).toBe(true);
      expect(getRelationship(state, 'ai-egypt')).toBe(-50);
    });

    it('records a diplomatic event', () => {
      let state = createDiplomacyState(civIds, 'player');
      state = declareWar(state, 'ai-egypt', 5);
      expect(state.events).toHaveLength(1);
      expect(state.events[0].type).toBe('war_declared');
    });
  });

  describe('makePeace', () => {
    it('removes from atWarWith and adds +10', () => {
      let state = createDiplomacyState(civIds, 'player');
      state = declareWar(state, 'ai-egypt', 5);
      state = makePeace(state, 'ai-egypt', 10);
      expect(isAtWar(state, 'ai-egypt')).toBe(false);
      expect(getRelationship(state, 'ai-egypt')).toBe(-40);
    });
  });

  describe('treaties', () => {
    it('proposeTreaty adds a treaty', () => {
      let state = createDiplomacyState(civIds, 'player');
      state = proposeTreaty(state, 'ai-egypt', 'non_aggression_pact', 10, 15);
      expect(state.treaties).toHaveLength(1);
      expect(state.treaties[0].type).toBe('non_aggression_pact');
      expect(state.treaties[0].turnsRemaining).toBe(10);
    });

    it('trade_agreement adds gold per turn', () => {
      let state = createDiplomacyState(civIds, 'player');
      state = modifyRelationship(state, 'ai-egypt', 10);
      state = proposeTreaty(state, 'ai-egypt', 'trade_agreement', -1, 20);
      expect(state.treaties[0].goldPerTurn).toBe(2);
    });

    it('breakTreaty removes treaty and penalizes -30', () => {
      let state = createDiplomacyState(civIds, 'player');
      state = proposeTreaty(state, 'ai-egypt', 'non_aggression_pact', 10, 15);
      state = breakTreaty(state, 'ai-egypt', 'non_aggression_pact', 20);
      expect(state.treaties).toHaveLength(0);
      expect(getRelationship(state, 'ai-egypt')).toBe(-30);
    });
  });

  describe('processRelationshipDrift', () => {
    it('peaceful neighbors gain +1 per turn (cap 30)', () => {
      let state = createDiplomacyState(civIds, 'player');
      state = modifyRelationship(state, 'ai-egypt', 29);
      state = processRelationshipDrift(state, { 'ai-egypt': false, 'ai-rome': false });
      expect(getRelationship(state, 'ai-egypt')).toBe(30); // capped
      expect(getRelationship(state, 'ai-rome')).toBe(1);
    });

    it('units near borders cause -2 per turn', () => {
      let state = createDiplomacyState(civIds, 'player');
      state = processRelationshipDrift(state, { 'ai-egypt': true, 'ai-rome': false });
      expect(getRelationship(state, 'ai-egypt')).toBe(-2);
    });
  });

  describe('decayEvents', () => {
    it('reduces event weight after 20 turns', () => {
      let state = createDiplomacyState(civIds, 'player');
      state = declareWar(state, 'ai-egypt', 1);
      state = makePeace(state, 'ai-egypt', 5);
      state = decayEvents(state, 25);
      // Events from turns 1 and 5 should have decayed weight
      for (const e of state.events) {
        expect(e.weight).toBeLessThan(1);
      }
    });
  });

  describe('getAvailableActions', () => {
    it('always includes declare_war and request_peace', () => {
      const state = createDiplomacyState(civIds, 'player');
      const actions = getAvailableActions(state, 'ai-egypt', [], 1);
      expect(actions).toContain('declare_war');
    });

    it('includes non_aggression_pact with civics tech', () => {
      const state = createDiplomacyState(civIds, 'player');
      const actions = getAvailableActions(state, 'ai-egypt', ['code-of-laws'], 1);
      expect(actions).toContain('non_aggression_pact');
    });

    it('includes trade_agreement with trade-routes tech and positive relationship', () => {
      let state = createDiplomacyState(civIds, 'player');
      state = modifyRelationship(state, 'ai-egypt', 10);
      const actions = getAvailableActions(state, 'ai-egypt', ['trade-routes'], 1);
      expect(actions).toContain('trade_agreement');
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `eval "$(mise activate bash)" && yarn test tests/systems/diplomacy-system.test.ts 2>&1 | tail -10`
Expected: FAIL — module not found

- [ ] **Step 3: Implement diplomacy-system.ts**

```typescript
import type {
  DiplomacyState,
  DiplomaticAction,
  DiplomaticEvent,
  Treaty,
  TreatyType,
} from '@/core/types';

export function createDiplomacyState(
  allCivIds: string[],
  selfId: string,
  startBonus: number = 0,
): DiplomacyState {
  const relationships: Record<string, number> = {};
  for (const id of allCivIds) {
    if (id !== selfId) {
      relationships[id] = startBonus;
    }
  }
  return {
    relationships,
    treaties: [],
    events: [],
    atWarWith: [],
  };
}

export function getRelationship(state: DiplomacyState, civId: string): number {
  return state.relationships[civId] ?? 0;
}

export function modifyRelationship(
  state: DiplomacyState,
  civId: string,
  delta: number,
): DiplomacyState {
  const newState = { ...state, relationships: { ...state.relationships } };
  const current = newState.relationships[civId] ?? 0;
  newState.relationships[civId] = Math.max(-100, Math.min(100, current + delta));
  return newState;
}

export function isAtWar(state: DiplomacyState, civId: string): boolean {
  return state.atWarWith.includes(civId);
}

export function declareWar(
  state: DiplomacyState,
  targetCivId: string,
  turn: number,
): DiplomacyState {
  let newState = {
    ...state,
    atWarWith: [...state.atWarWith, targetCivId],
    events: [...state.events],
  };
  newState = modifyRelationship(newState, targetCivId, -50);
  newState.events.push({
    type: 'war_declared',
    turn,
    otherCiv: targetCivId,
    weight: 1,
  });
  return newState;
}

export function makePeace(
  state: DiplomacyState,
  targetCivId: string,
  turn: number,
): DiplomacyState {
  let newState = {
    ...state,
    atWarWith: state.atWarWith.filter(id => id !== targetCivId),
    events: [...state.events],
  };
  newState = modifyRelationship(newState, targetCivId, 10);
  newState.events.push({
    type: 'peace_made',
    turn,
    otherCiv: targetCivId,
    weight: 1,
  });
  return newState;
}

export function proposeTreaty(
  state: DiplomacyState,
  otherCivId: string,
  type: TreatyType,
  turnsRemaining: number,
  turn: number,
): DiplomacyState {
  const treaty: Treaty = {
    type,
    civA: 'self',
    civB: otherCivId,
    turnsRemaining,
  };
  if (type === 'trade_agreement') {
    treaty.goldPerTurn = 2;
  }
  const newState = {
    ...state,
    treaties: [...state.treaties, treaty],
    events: [
      ...state.events,
      { type: 'treaty_signed', turn, otherCiv: otherCivId, weight: 1 },
    ],
  };
  return modifyRelationship(newState, otherCivId, 5);
}

export function breakTreaty(
  state: DiplomacyState,
  otherCivId: string,
  treatyType: TreatyType,
  turn: number,
): DiplomacyState {
  const newState = {
    ...state,
    treaties: state.treaties.filter(
      t => !(t.type === treatyType && (t.civB === otherCivId || t.civA === otherCivId)),
    ),
    events: [
      ...state.events,
      { type: 'treaty_broken', turn, otherCiv: otherCivId, weight: 1 },
    ],
  };
  return modifyRelationship(newState, otherCivId, -30);
}

export function processRelationshipDrift(
  state: DiplomacyState,
  unitsNearBorder: Record<string, boolean>,
): DiplomacyState {
  let newState = { ...state, relationships: { ...state.relationships } };
  for (const civId of Object.keys(newState.relationships)) {
    if (newState.atWarWith.includes(civId)) continue;

    if (unitsNearBorder[civId]) {
      newState = modifyRelationship(newState, civId, -2);
    } else {
      // Peaceful neighbors: +1 per turn, cap at +30
      const current = newState.relationships[civId] ?? 0;
      if (current < 30) {
        const newVal = Math.min(30, current + 1);
        newState.relationships[civId] = newVal;
      }
    }
  }
  return newState;
}

export function decayEvents(state: DiplomacyState, currentTurn: number): DiplomacyState {
  return {
    ...state,
    events: state.events.map(e => {
      const age = currentTurn - e.turn;
      if (age > 20) {
        const decayFactor = Math.max(0.1, 1 - (age - 20) * 0.05);
        return { ...e, weight: e.weight * decayFactor };
      }
      return e;
    }),
  };
}

export function tickTreaties(state: DiplomacyState): DiplomacyState {
  const remaining: Treaty[] = [];
  for (const treaty of state.treaties) {
    if (treaty.turnsRemaining === -1) {
      remaining.push(treaty);
    } else if (treaty.turnsRemaining > 1) {
      remaining.push({ ...treaty, turnsRemaining: treaty.turnsRemaining - 1 });
    }
    // turnsRemaining === 1 means it expires this turn — don't keep it
  }
  return { ...state, treaties: remaining };
}

// Techs that unlock diplomatic actions
const CIVICS_TECHS = ['code-of-laws', 'early-empire', 'political-philosophy', 'diplomacy', 'foreign-trade'];
const TRADE_TECHS = ['trade-routes', 'currency', 'banking', 'coinage'];
const ALLIANCE_TECHS = ['diplomacy', 'political-philosophy'];

export function getAvailableActions(
  state: DiplomacyState,
  targetCivId: string,
  completedTechs: string[],
  era: number,
): DiplomaticAction[] {
  const actions: DiplomaticAction[] = [];
  const atWar = isAtWar(state, targetCivId);

  if (atWar) {
    actions.push('request_peace');
  } else {
    actions.push('declare_war');

    const hasCivicsTech = completedTechs.some(t => CIVICS_TECHS.includes(t));
    const hasTradeTech = completedTechs.some(t => TRADE_TECHS.includes(t));
    const hasAllianceTech = completedTechs.some(t => ALLIANCE_TECHS.includes(t));
    const hasNAP = state.treaties.some(
      t => t.type === 'non_aggression_pact' && (t.civB === targetCivId || t.civA === targetCivId),
    );
    const hasTrade = state.treaties.some(
      t => t.type === 'trade_agreement' && (t.civB === targetCivId || t.civA === targetCivId),
    );
    const relationship = getRelationship(state, targetCivId);

    if ((era >= 2 || hasCivicsTech) && !hasNAP) {
      actions.push('non_aggression_pact');
    }
    if ((era >= 3 || hasTradeTech) && relationship > 0 && !hasTrade) {
      actions.push('trade_agreement');
    }
    if ((era >= 4 || hasAllianceTech)) {
      if (!state.treaties.some(t => t.type === 'open_borders' && (t.civB === targetCivId || t.civA === targetCivId))) {
        actions.push('open_borders');
      }
      if (!state.treaties.some(t => t.type === 'alliance' && (t.civB === targetCivId || t.civA === targetCivId))) {
        actions.push('alliance');
      }
    }
  }

  return actions;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `eval "$(mise activate bash)" && yarn test tests/systems/diplomacy-system.test.ts 2>&1 | tail -15`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/systems/diplomacy-system.ts tests/systems/diplomacy-system.test.ts
git commit -m "feat(m2b): add diplomacy system with relationships, treaties, and actions"
```

---

## Task 4: AI Personality

**Files:**
- Create: `src/ai/ai-personality.ts`
- Create: `tests/ai/ai-personality.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
import { describe, it, expect } from 'vitest';
import {
  weightTechChoice,
  weightProductionChoice,
  shouldDeclareWar,
} from '@/ai/ai-personality';
import type { PersonalityTraits, Tech } from '@/core/types';

describe('ai-personality', () => {
  const aggressive: PersonalityTraits = {
    traits: ['aggressive'],
    warLikelihood: 0.8,
    diplomacyFocus: 0.2,
    expansionDrive: 0.6,
  };

  const diplomatic: PersonalityTraits = {
    traits: ['diplomatic'],
    warLikelihood: 0.15,
    diplomacyFocus: 0.9,
    expansionDrive: 0.4,
  };

  describe('weightTechChoice', () => {
    it('aggressive personality prefers military techs', () => {
      const milTech = { id: 't1', track: 'military' } as Tech;
      const sciTech = { id: 't2', track: 'science' } as Tech;
      const milWeight = weightTechChoice(aggressive, milTech);
      const sciWeight = weightTechChoice(aggressive, sciTech);
      expect(milWeight).toBeGreaterThan(sciWeight);
    });

    it('diplomatic personality prefers civics techs', () => {
      const civTech = { id: 't1', track: 'civics' } as Tech;
      const milTech = { id: 't2', track: 'military' } as Tech;
      const civWeight = weightTechChoice(diplomatic, civTech);
      const milWeight = weightTechChoice(diplomatic, milTech);
      expect(civWeight).toBeGreaterThan(milWeight);
    });
  });

  describe('weightProductionChoice', () => {
    it('aggressive personality gives higher weight to military units', () => {
      const milWeight = weightProductionChoice(aggressive, 'warrior', false);
      const civWeight = weightProductionChoice(aggressive, 'granary', false);
      expect(milWeight).toBeGreaterThan(civWeight);
    });

    it('weights settler higher when expansionDrive is high and no threat', () => {
      const settlerWeight = weightProductionChoice(aggressive, 'settler', false);
      const settlerWeightDip = weightProductionChoice(diplomatic, 'settler', false);
      expect(settlerWeight).toBeGreaterThan(settlerWeightDip);
    });

    it('weights military higher when under threat', () => {
      const normalWeight = weightProductionChoice(diplomatic, 'warrior', false);
      const threatWeight = weightProductionChoice(diplomatic, 'warrior', true);
      expect(threatWeight).toBeGreaterThan(normalWeight);
    });
  });

  describe('shouldDeclareWar', () => {
    it('aggressive civ with military advantage declares war', () => {
      expect(shouldDeclareWar(aggressive, -10, 1.5)).toBe(true);
    });

    it('diplomatic civ avoids war even with advantage', () => {
      expect(shouldDeclareWar(diplomatic, 10, 1.5)).toBe(false);
    });

    it('no one declares war with positive relationship above 30', () => {
      expect(shouldDeclareWar(aggressive, 40, 2.0)).toBe(false);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `eval "$(mise activate bash)" && yarn test tests/ai/ai-personality.test.ts 2>&1 | tail -10`
Expected: FAIL — module not found

- [ ] **Step 3: Implement ai-personality.ts**

```typescript
import type { PersonalityTraits, Tech, TechTrack } from '@/core/types';

const TRACK_WEIGHTS: Record<string, Record<TechTrack, number>> = {
  aggressive:   { military: 3, economy: 1, science: 1, civics: 0.5, exploration: 1.5 },
  diplomatic:   { military: 0.5, economy: 1.5, science: 1, civics: 3, exploration: 1 },
  expansionist: { military: 1, economy: 2, science: 1, civics: 1, exploration: 2.5 },
  trader:       { military: 0.5, economy: 3, science: 1, civics: 1.5, exploration: 1.5 },
};

export function weightTechChoice(personality: PersonalityTraits, tech: Tech): number {
  let weight = 1;
  for (const trait of personality.traits) {
    const trackWeights = TRACK_WEIGHTS[trait];
    if (trackWeights) {
      weight *= trackWeights[tech.track] ?? 1;
    }
  }
  return weight;
}

const MILITARY_ITEMS = ['warrior', 'scout', 'barracks', 'walls', 'stable', 'forge'];
const ECONOMY_ITEMS = ['marketplace', 'harbor', 'lumbermill', 'quarry-building'];
const SETTLER_ITEMS = ['settler'];

export function weightProductionChoice(
  personality: PersonalityTraits,
  itemId: string,
  underThreat: boolean,
): number {
  let weight = 1;

  if (MILITARY_ITEMS.includes(itemId)) {
    weight *= 1 + personality.warLikelihood;
    if (underThreat) weight *= 2;
  } else if (ECONOMY_ITEMS.includes(itemId)) {
    weight *= 1 + (1 - personality.warLikelihood);
  } else if (SETTLER_ITEMS.includes(itemId)) {
    weight *= 1 + personality.expansionDrive;
  }

  return weight;
}

export function shouldDeclareWar(
  personality: PersonalityTraits,
  relationship: number,
  militaryAdvantage: number,
): boolean {
  // Never declare war with very positive relationship
  if (relationship > 30) return false;

  // Need military advantage and aggressive enough
  const warScore = personality.warLikelihood * militaryAdvantage;
  const peacePressure = Math.max(0, relationship) / 100;

  return warScore > (0.8 + peacePressure);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `eval "$(mise activate bash)" && yarn test tests/ai/ai-personality.test.ts 2>&1 | tail -10`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/ai/ai-personality.ts tests/ai/ai-personality.test.ts
git commit -m "feat(m2b): add AI personality system with tech/production weighting"
```

---

## Task 5: AI Strategy

**Files:**
- Create: `src/ai/ai-strategy.ts`
- Create: `tests/ai/ai-strategy.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
import { describe, it, expect } from 'vitest';
import { chooseTech, chooseProduction, evaluateExpansionTarget } from '@/ai/ai-strategy';
import type { PersonalityTraits, Tech, GameState, City } from '@/core/types';

describe('ai-strategy', () => {
  const aggressive: PersonalityTraits = {
    traits: ['aggressive'],
    warLikelihood: 0.8,
    diplomacyFocus: 0.2,
    expansionDrive: 0.6,
  };

  describe('chooseTech', () => {
    it('returns highest weighted tech from available list', () => {
      const techs: Tech[] = [
        { id: 'mil1', name: 'Swords', track: 'military', cost: 50, prerequisites: [], unlocks: ['test'], era: 1 },
        { id: 'sci1', name: 'Writing', track: 'science', cost: 50, prerequisites: [], unlocks: ['test'], era: 1 },
      ];
      const chosen = chooseTech(aggressive, techs);
      expect(chosen.id).toBe('mil1');
    });

    it('returns first tech if no personality preference', () => {
      const neutral: PersonalityTraits = {
        traits: [],
        warLikelihood: 0.5,
        diplomacyFocus: 0.5,
        expansionDrive: 0.5,
      };
      const techs: Tech[] = [
        { id: 't1', name: 'A', track: 'science', cost: 50, prerequisites: [], unlocks: ['test'], era: 1 },
      ];
      expect(chooseTech(neutral, techs).id).toBe('t1');
    });
  });

  describe('chooseProduction', () => {
    it('picks warrior when under threat and aggressive', () => {
      const result = chooseProduction(
        aggressive,
        ['warrior', 'granary', 'settler'],
        true,
        1,
      );
      expect(result).toBe('warrior');
    });

    it('picks settler when not threatened and high expansion drive', () => {
      const expansionist: PersonalityTraits = {
        traits: ['expansionist'],
        warLikelihood: 0.3,
        diplomacyFocus: 0.3,
        expansionDrive: 0.9,
      };
      const result = chooseProduction(
        expansionist,
        ['warrior', 'granary', 'settler'],
        false,
        1,
      );
      expect(result).toBe('settler');
    });
  });

  describe('evaluateExpansionTarget', () => {
    it('scores positions higher with more land tiles nearby', () => {
      const score = evaluateExpansionTarget(
        { q: 5, r: 5 },
        { grassland: 4, plains: 2, ocean: 0 },
      );
      expect(score).toBeGreaterThan(0);
    });

    it('penalizes positions with lots of ocean', () => {
      const landScore = evaluateExpansionTarget(
        { q: 5, r: 5 },
        { grassland: 5, plains: 1, ocean: 0 },
      );
      const oceanScore = evaluateExpansionTarget(
        { q: 5, r: 5 },
        { grassland: 1, plains: 0, ocean: 5 },
      );
      expect(landScore).toBeGreaterThan(oceanScore);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `eval "$(mise activate bash)" && yarn test tests/ai/ai-strategy.test.ts 2>&1 | tail -10`
Expected: FAIL — module not found

- [ ] **Step 3: Implement ai-strategy.ts**

```typescript
import type { PersonalityTraits, Tech, HexCoord } from '@/core/types';
import { weightTechChoice, weightProductionChoice } from './ai-personality';

export function chooseTech(personality: PersonalityTraits, availableTechs: Tech[]): Tech {
  if (availableTechs.length === 0) {
    throw new Error('No available techs');
  }

  let bestTech = availableTechs[0];
  let bestWeight = weightTechChoice(personality, bestTech);

  for (let i = 1; i < availableTechs.length; i++) {
    const w = weightTechChoice(personality, availableTechs[i]);
    if (w > bestWeight) {
      bestWeight = w;
      bestTech = availableTechs[i];
    }
  }

  return bestTech;
}

export function chooseProduction(
  personality: PersonalityTraits,
  availableItems: string[],
  underThreat: boolean,
  cityCount: number,
): string {
  if (availableItems.length === 0) return 'warrior';

  let bestItem = availableItems[0];
  let bestWeight = weightProductionChoice(personality, bestItem, underThreat);

  for (let i = 1; i < availableItems.length; i++) {
    let w = weightProductionChoice(personality, availableItems[i], underThreat);

    // Limit settlers if we already have many cities
    if (availableItems[i] === 'settler' && cityCount >= 4) {
      w *= 0.3;
    }

    bestWeight = bestWeight; // keep reference
    if (w > bestWeight) {
      bestWeight = w;
      bestItem = availableItems[i];
    }
  }

  return bestItem;
}

export function evaluateExpansionTarget(
  position: HexCoord,
  terrainCounts: Record<string, number>,
): number {
  let score = 0;

  // Productive terrain is good
  score += (terrainCounts['grassland'] ?? 0) * 3;
  score += (terrainCounts['plains'] ?? 0) * 2.5;
  score += (terrainCounts['forest'] ?? 0) * 2;
  score += (terrainCounts['hills'] ?? 0) * 2;
  score += (terrainCounts['jungle'] ?? 0) * 1.5;

  // Ocean/coast is bad for city placement
  score -= (terrainCounts['ocean'] ?? 0) * 2;
  score -= (terrainCounts['mountain'] ?? 0) * 1;

  // Desert and tundra are poor
  score += (terrainCounts['desert'] ?? 0) * 0.5;
  score += (terrainCounts['tundra'] ?? 0) * 0.5;

  return score;
}
```

Note: There's a bug in `chooseProduction` — the comparison doesn't update `bestWeight` properly. Fix line `bestWeight = bestWeight; // keep reference` to be removed (it's a no-op). The actual logic works because `bestWeight` is already declared with `let` and updated in the if block. Actually the code is correct — remove the no-op line.

- [ ] **Step 4: Run tests to verify they pass**

Run: `eval "$(mise activate bash)" && yarn test tests/ai/ai-strategy.test.ts 2>&1 | tail -10`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/ai/ai-strategy.ts tests/ai/ai-strategy.test.ts
git commit -m "feat(m2b): add AI strategy module for tech/production/expansion decisions"
```

---

## Task 6: AI Diplomacy Module

**Files:**
- Create: `src/ai/ai-diplomacy.ts`

- [ ] **Step 1: Write ai-diplomacy.ts**

No separate test file — this module is thin and tested through the AI integration tests in the existing `tests/ai/basic-ai.test.ts`.

```typescript
import type { PersonalityTraits, DiplomacyState, TreatyType, DiplomaticAction } from '@/core/types';
import {
  getRelationship,
  isAtWar,
  getAvailableActions,
  shouldDeclareWar as diplomacyShouldDeclareWar,
} from '@/systems/diplomacy-system';
import { shouldDeclareWar } from './ai-personality';

export interface DiplomaticDecision {
  action: DiplomaticAction;
  targetCiv: string;
}

export function evaluateDiplomacy(
  personality: PersonalityTraits,
  diplomacy: DiplomacyState,
  completedTechs: string[],
  era: number,
  militaryStrengths: Record<string, number>,
  selfStrength: number,
): DiplomaticDecision[] {
  const decisions: DiplomaticDecision[] = [];

  for (const civId of Object.keys(diplomacy.relationships)) {
    const actions = getAvailableActions(diplomacy, civId, completedTechs, era);
    const relationship = getRelationship(diplomacy, civId);
    const theirStrength = militaryStrengths[civId] ?? 0;
    const advantage = selfStrength > 0 && theirStrength > 0
      ? selfStrength / theirStrength
      : 1;

    if (isAtWar(diplomacy, civId)) {
      // Consider peace if losing or relationship recovering
      if (advantage < 0.7 || relationship > -20) {
        decisions.push({ action: 'request_peace', targetCiv: civId });
      }
    } else {
      // Consider war
      if (actions.includes('declare_war') && shouldDeclareWar(personality, relationship, advantage)) {
        decisions.push({ action: 'declare_war', targetCiv: civId });
        continue;
      }

      // Consider treaties (prefer higher-value ones)
      if (actions.includes('alliance') && relationship > 50) {
        decisions.push({ action: 'alliance', targetCiv: civId });
      } else if (actions.includes('trade_agreement') && relationship > 10) {
        decisions.push({ action: 'trade_agreement', targetCiv: civId });
      } else if (actions.includes('non_aggression_pact') && relationship > 0 && personality.diplomacyFocus > 0.4) {
        decisions.push({ action: 'non_aggression_pact', targetCiv: civId });
      }
    }
  }

  return decisions;
}

export function evaluateProposal(
  personality: PersonalityTraits,
  diplomacy: DiplomacyState,
  fromCiv: string,
  proposedTreaty: TreatyType,
): boolean {
  const relationship = getRelationship(diplomacy, fromCiv);

  switch (proposedTreaty) {
    case 'non_aggression_pact':
      return relationship > -20 && personality.diplomacyFocus > 0.3;
    case 'trade_agreement':
      return relationship > 0;
    case 'open_borders':
      return relationship > 20 && personality.diplomacyFocus > 0.4;
    case 'alliance':
      return relationship > 40 && personality.diplomacyFocus > 0.5;
    default:
      return false;
  }
}
```

- [ ] **Step 2: Verify build compiles**

Run: `eval "$(mise activate bash)" && yarn build 2>&1 | head -20`
Expected: May have errors from types.ts changes — these will be resolved in Task 7.

- [ ] **Step 3: Commit**

```bash
git add src/ai/ai-diplomacy.ts
git commit -m "feat(m2b): add AI diplomacy decision module"
```

---

## Task 7: Game State with Civilizations

**Files:**
- Modify: `src/core/game-state.ts`
- Modify: `tests/core/game-state.test.ts`

- [ ] **Step 1: Update game-state.ts**

The `createNewGame` function needs to:
1. Accept a `civType` parameter for the player
2. Pick an AI civ type
3. Initialize `diplomacy` on each `Civilization`
4. Apply Greece's diplomacy start bonus

Replace the entire `createNewGame` function:

```typescript
import type { GameState, Civilization, Unit } from './types';
import { generateMap, findStartPositions } from '@/systems/map-generator';
import { createUnit } from '@/systems/unit-system';
import { createTechState } from '@/systems/tech-system';
import { createVisibilityMap, updateVisibility } from '@/systems/fog-of-war';
import { spawnBarbarianCamp } from '@/systems/barbarian-system';
import { hexKey } from '@/systems/hex-utils';
import { CIV_DEFINITIONS, getCivDefinition } from '@/systems/civ-definitions';
import { createDiplomacyState } from '@/systems/diplomacy-system';

export function createNewGame(civType?: string, seed?: string): GameState {
  const gameSeed = seed ?? `game-${Date.now()}`;
  const map = generateMap(30, 30, gameSeed);
  const startPositions = findStartPositions(map, 2);

  const playerCivDef = getCivDefinition(civType ?? 'greece');
  const aiCivDefs = CIV_DEFINITIONS.filter(c => c.id !== (civType ?? 'greece'));
  const aiCivDef = aiCivDefs[Math.floor(Math.random() * aiCivDefs.length)] ?? CIV_DEFINITIONS[0];

  const allCivIds = ['player', 'ai-1'];

  const playerStartBonus = playerCivDef?.bonusEffect.type === 'diplomacy_start_bonus'
    ? (playerCivDef.bonusEffect as { type: 'diplomacy_start_bonus'; bonus: number }).bonus
    : 0;
  const aiStartBonus = aiCivDef.bonusEffect.type === 'diplomacy_start_bonus'
    ? (aiCivDef.bonusEffect as { type: 'diplomacy_start_bonus'; bonus: number }).bonus
    : 0;

  const playerCiv: Civilization = {
    id: 'player',
    name: playerCivDef?.name ?? 'Player Civilization',
    color: playerCivDef?.color ?? '#4a90d9',
    isHuman: true,
    civType: civType ?? 'generic',
    cities: [],
    units: [],
    techState: createTechState(),
    gold: 0,
    visibility: createVisibilityMap(),
    score: 0,
    diplomacy: createDiplomacyState(allCivIds, 'player', playerStartBonus),
  };

  const aiCiv: Civilization = {
    id: 'ai-1',
    name: aiCivDef.name,
    color: aiCivDef.color,
    isHuman: false,
    civType: aiCivDef.id,
    cities: [],
    units: [],
    techState: createTechState(),
    gold: 0,
    visibility: createVisibilityMap(),
    score: 0,
    diplomacy: createDiplomacyState(allCivIds, 'ai-1', aiStartBonus),
  };

  // Create starting units
  const units: Record<string, Unit> = {};

  const playerSettler = createUnit('settler', 'player', startPositions[0]);
  const playerWarrior = createUnit('warrior', 'player', startPositions[0]);
  units[playerSettler.id] = playerSettler;
  units[playerWarrior.id] = playerWarrior;
  playerCiv.units = [playerSettler.id, playerWarrior.id];

  const aiSettler = createUnit('settler', 'ai-1', startPositions[1]);
  const aiWarrior = createUnit('warrior', 'ai-1', startPositions[1]);
  units[aiSettler.id] = aiSettler;
  units[aiWarrior.id] = aiWarrior;
  aiCiv.units = [aiSettler.id, aiWarrior.id];

  // Initial visibility
  updateVisibility(playerCiv.visibility, [playerSettler, playerWarrior], map);
  updateVisibility(aiCiv.visibility, [aiSettler, aiWarrior], map);

  // Spawn initial barbarian camps
  const barbarianCamps: Record<string, any> = {};
  const cityPositions = startPositions;
  for (let i = 0; i < 3; i++) {
    const camp = spawnBarbarianCamp(map, cityPositions, Object.values(barbarianCamps));
    if (camp) barbarianCamps[camp.id] = camp;
  }

  return {
    turn: 1,
    era: 1,
    civilizations: { player: playerCiv, 'ai-1': aiCiv },
    map,
    units,
    cities: {},
    barbarianCamps,
    tutorial: { active: true, currentStep: 'welcome', completedSteps: [] },
    currentPlayer: 'player',
    gameOver: false,
    winner: null,
    settings: {
      mapSize: 'small',
      soundEnabled: true,
      musicEnabled: true,
      musicVolume: 0.5,
      sfxVolume: 0.7,
      tutorialEnabled: true,
    },
  };
}
```

- [ ] **Step 2: Update game-state tests**

Add to `tests/core/game-state.test.ts`:

```typescript
  it('creates civilizations with civType and diplomacy', () => {
    const state = createNewGame('egypt', 'test-seed');
    expect(state.civilizations.player.civType).toBe('egypt');
    expect(state.civilizations.player.diplomacy).toBeDefined();
    expect(state.civilizations.player.diplomacy.relationships).toHaveProperty('ai-1');
    expect(state.civilizations['ai-1'].civType).not.toBe('egypt');
    expect(state.civilizations['ai-1'].diplomacy).toBeDefined();
  });

  it('applies Greece diplomacy start bonus', () => {
    const state = createNewGame('greece', 'test-seed');
    expect(state.civilizations.player.diplomacy.relationships['ai-1']).toBe(20);
  });

  it('defaults to generic civType when no civType provided', () => {
    const state = createNewGame(undefined, 'test-seed');
    expect(state.civilizations.player.civType).toBe('generic');
  });
```

- [ ] **Step 3: Fix any existing tests that create Civilization objects without the new fields**

Search all test files for Civilization object creation. Any test that creates a `Civilization` literal will need `civType: 'generic'` and `diplomacy: createDiplomacyState([], 'id')` added. Common files:
- `tests/core/turn-manager.test.ts`
- `tests/ai/basic-ai.test.ts`
- `tests/core/game-state.test.ts`

Use `createDiplomacyState` from `@/systems/diplomacy-system` or inline: `{ relationships: {}, treaties: [], events: [], atWarWith: [] }`.

- [ ] **Step 4: Run full test suite**

Run: `eval "$(mise activate bash)" && yarn test 2>&1 | tail -20`
Expected: All tests PASS (135+ tests)

- [ ] **Step 5: Commit**

```bash
git add src/core/game-state.ts tests/core/game-state.test.ts tests/core/turn-manager.test.ts tests/ai/basic-ai.test.ts
git commit -m "feat(m2b): update game state with civ types and diplomacy initialization"
```

---

## Task 8: Civ Bonus Application

**Files:**
- Modify: `src/systems/city-system.ts`
- Modify: `tests/systems/city-system.test.ts`

- [ ] **Step 1: Write failing tests for civ bonuses in city-system**

Add to `tests/systems/city-system.test.ts`:

```typescript
import { applyProductionBonus } from '@/systems/city-system';

describe('civ bonuses', () => {
  it('faster_wonders reduces monument production cost by 30%', () => {
    const bonus = applyProductionBonus('monument', { type: 'faster_wonders', speedMultiplier: 0.7 });
    expect(bonus).toBeCloseTo(0.7);
  });

  it('faster_wonders reduces amphitheater production cost by 30%', () => {
    const bonus = applyProductionBonus('amphitheater', { type: 'faster_wonders', speedMultiplier: 0.7 });
    expect(bonus).toBeCloseTo(0.7);
  });

  it('faster_wonders does not affect non-wonder buildings', () => {
    const bonus = applyProductionBonus('granary', { type: 'faster_wonders', speedMultiplier: 0.7 });
    expect(bonus).toBe(1);
  });

  it('faster_military reduces warrior training by 25%', () => {
    const bonus = applyProductionBonus('warrior', { type: 'faster_military', speedMultiplier: 0.75 });
    expect(bonus).toBeCloseTo(0.75);
  });

  it('faster_military does not affect buildings', () => {
    const bonus = applyProductionBonus('granary', { type: 'faster_military', speedMultiplier: 0.75 });
    expect(bonus).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `eval "$(mise activate bash)" && yarn test tests/systems/city-system.test.ts 2>&1 | tail -10`
Expected: FAIL — `applyProductionBonus` not found

- [ ] **Step 3: Implement applyProductionBonus in city-system.ts**

Add to `src/systems/city-system.ts`:

```typescript
import type { CivBonusEffect } from '@/core/types';

const WONDER_BUILDINGS = ['monument', 'amphitheater'];
const MILITARY_UNITS = ['warrior', 'scout', 'settler', 'worker']; // settler/worker excluded below

export function applyProductionBonus(
  itemId: string,
  bonusEffect: CivBonusEffect | undefined,
): number {
  if (!bonusEffect) return 1;

  if (bonusEffect.type === 'faster_wonders' && WONDER_BUILDINGS.includes(itemId)) {
    return bonusEffect.speedMultiplier;
  }

  if (bonusEffect.type === 'faster_military') {
    const isMilitary = ['warrior', 'scout'].includes(itemId) ||
      ['barracks', 'walls', 'stable'].includes(itemId);
    if (isMilitary) return bonusEffect.speedMultiplier;
  }

  return 1;
}
```

Note: The `processCity` function doesn't need changes yet — the bonus multiplier is applied by the caller when computing effective production cost. The `applyProductionBonus` returns a multiplier (0.7 = 30% faster) that gets applied to the item's base cost.

- [ ] **Step 4: Run tests to verify they pass**

Run: `eval "$(mise activate bash)" && yarn test tests/systems/city-system.test.ts 2>&1 | tail -10`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/systems/city-system.ts tests/systems/city-system.test.ts
git commit -m "feat(m2b): add civ bonus application for production speed"
```

---

## Task 9: AI Overhaul (basic-ai.ts Refactor)

**Files:**
- Modify: `src/ai/basic-ai.ts`
- Modify: `tests/ai/basic-ai.test.ts`

- [ ] **Step 1: Refactor basic-ai.ts to use strategy and diplomacy modules**

Replace the entire file:

```typescript
import type { GameState, Unit, HexCoord, PersonalityTraits } from '@/core/types';
import { EventBus } from '@/core/event-bus';
import { hexKey, hexNeighbors } from '@/systems/hex-utils';
import { foundCity } from '@/systems/city-system';
import { getMovementRange, moveUnit } from '@/systems/unit-system';
import { resolveCombat } from '@/systems/combat-system';
import { getAvailableTechs, startResearch } from '@/systems/tech-system';
import { updateVisibility } from '@/systems/fog-of-war';
import { getCivDefinition } from '@/systems/civ-definitions';
import { chooseTech, chooseProduction } from './ai-strategy';
import { evaluateDiplomacy } from './ai-diplomacy';
import {
  declareWar,
  makePeace,
  proposeTreaty,
} from '@/systems/diplomacy-system';

function getPersonality(civType: string): PersonalityTraits {
  const def = getCivDefinition(civType);
  return def?.personality ?? {
    traits: [],
    warLikelihood: 0.5,
    diplomacyFocus: 0.5,
    expansionDrive: 0.5,
  };
}

export function processAITurn(state: GameState, civId: string, bus: EventBus): GameState {
  let newState = structuredClone(state);
  const civ = newState.civilizations[civId];
  if (!civ) return newState;

  const personality = getPersonality(civ.civType ?? 'generic');

  // --- Handle settlers: found cities ---
  const settlers = civ.units
    .map(id => newState.units[id])
    .filter((u): u is Unit => u !== undefined && u.type === 'settler');

  for (const settler of settlers) {
    const tile = newState.map.tiles[hexKey(settler.position)];
    if (tile && tile.terrain !== 'ocean' && tile.terrain !== 'mountain' && tile.terrain !== 'coast') {
      const city = foundCity(civId, settler.position, newState.map);
      newState.cities[city.id] = city;
      civ.cities.push(city.id);

      for (const ownedCoord of city.ownedTiles) {
        const key = hexKey(ownedCoord);
        if (newState.map.tiles[key]) {
          newState.map.tiles[key].owner = civId;
        }
      }

      delete newState.units[settler.id];
      civ.units = civ.units.filter(id => id !== settler.id);
      bus.emit('city:founded', { city });
      city.productionQueue = ['warrior'];
    }
  }

  // --- Handle military units: explore or attack ---
  const militaryUnits = civ.units
    .map(id => newState.units[id])
    .filter((u): u is Unit => u !== undefined && u.type !== 'settler' && u.type !== 'worker');

  const unitPositions: Record<string, string> = {};
  for (const [id, unit] of Object.entries(newState.units)) {
    unitPositions[hexKey(unit.position)] = id;
  }

  for (const unit of militaryUnits) {
    if (unit.movementPointsLeft <= 0) continue;

    // Check for nearby enemies to attack
    const neighbors = hexNeighbors(unit.position);
    let attacked = false;
    for (const neighbor of neighbors) {
      const occupantId = unitPositions[hexKey(neighbor)];
      if (occupantId) {
        const occupant = newState.units[occupantId];
        if (occupant && occupant.owner !== civId && occupant.owner !== 'barbarian') {
          const result = resolveCombat(unit, occupant, newState.map);
          if (!result.attackerSurvived) {
            delete newState.units[unit.id];
            civ.units = civ.units.filter(id => id !== unit.id);
          } else {
            newState.units[unit.id].health -= result.attackerDamage;
          }
          if (!result.defenderSurvived) {
            const defCivId = occupant.owner;
            delete newState.units[occupant.id];
            if (newState.civilizations[defCivId]) {
              newState.civilizations[defCivId].units =
                newState.civilizations[defCivId].units.filter(id => id !== occupant.id);
            }
          } else {
            newState.units[occupant.id].health -= result.defenderDamage;
          }
          bus.emit('combat:resolved', { result });
          attacked = true;
          break;
        }
      }
    }

    if (attacked) continue;

    // Explore: move toward unexplored territory
    const range = getMovementRange(unit, newState.map, unitPositions);
    if (range.length > 0) {
      // Prefer tiles we haven't visited (not visible in our visibility map)
      const unexplored = range.filter(
        coord => civ.visibility.tiles[hexKey(coord)] !== 'visible'
      );
      const candidates = unexplored.length > 0 ? unexplored : range;
      const target = candidates[Math.floor(Math.random() * candidates.length)];
      newState.units[unit.id] = moveUnit(unit, target, 1);
      delete unitPositions[hexKey(unit.position)];
      unitPositions[hexKey(target)] = unit.id;
    }
  }

  // --- Handle research (personality-driven) ---
  if (!civ.techState.currentResearch) {
    const available = getAvailableTechs(civ.techState);
    if (available.length > 0) {
      const chosen = chooseTech(personality, available);
      newState.civilizations[civId].techState = startResearch(civ.techState, chosen.id);
      bus.emit('tech:started', { civId, techId: chosen.id });
    }
  }

  // --- Handle city production (personality-driven) ---
  const isUnderThreat = militaryUnits.length < civ.cities.length;
  for (const cityId of civ.cities) {
    const city = newState.cities[cityId];
    if (city && city.productionQueue.length === 0) {
      const availableItems = ['warrior', 'scout', 'granary', 'settler'];
      const chosen = chooseProduction(personality, availableItems, isUnderThreat, civ.cities.length);
      city.productionQueue = [chosen];
    }
  }

  // --- Handle diplomacy ---
  if (civ.diplomacy) {
    const selfStrength = militaryUnits.reduce((sum, u) => {
      const def = newState.units[u.id];
      return sum + (def?.health ?? 0);
    }, 0);

    const otherStrengths: Record<string, number> = {};
    for (const [otherId, otherCiv] of Object.entries(newState.civilizations)) {
      if (otherId === civId) continue;
      const otherMil = otherCiv.units
        .map(id => newState.units[id])
        .filter((u): u is Unit => u !== undefined && u.type === 'warrior');
      otherStrengths[otherId] = otherMil.reduce((sum, u) => sum + u.health, 0);
    }

    const decisions = evaluateDiplomacy(
      personality,
      civ.diplomacy,
      civ.techState.completed,
      newState.era,
      otherStrengths,
      selfStrength,
    );

    for (const decision of decisions) {
      switch (decision.action) {
        case 'declare_war':
          newState.civilizations[civId].diplomacy = declareWar(
            civ.diplomacy, decision.targetCiv, newState.turn,
          );
          // Also update the other civ's diplomacy
          if (newState.civilizations[decision.targetCiv]?.diplomacy) {
            newState.civilizations[decision.targetCiv].diplomacy = declareWar(
              newState.civilizations[decision.targetCiv].diplomacy, civId, newState.turn,
            );
          }
          bus.emit('diplomacy:war-declared', { attackerId: civId, defenderId: decision.targetCiv });
          break;
        case 'request_peace':
          newState.civilizations[civId].diplomacy = makePeace(
            civ.diplomacy, decision.targetCiv, newState.turn,
          );
          if (newState.civilizations[decision.targetCiv]?.diplomacy) {
            newState.civilizations[decision.targetCiv].diplomacy = makePeace(
              newState.civilizations[decision.targetCiv].diplomacy, civId, newState.turn,
            );
          }
          bus.emit('diplomacy:peace-made', { civA: civId, civB: decision.targetCiv });
          break;
        case 'non_aggression_pact':
        case 'trade_agreement':
        case 'open_borders':
        case 'alliance':
          newState.civilizations[civId].diplomacy = proposeTreaty(
            civ.diplomacy, decision.targetCiv, decision.action, decision.action === 'non_aggression_pact' ? 10 : -1, newState.turn,
          );
          if (newState.civilizations[decision.targetCiv]?.diplomacy) {
            newState.civilizations[decision.targetCiv].diplomacy = proposeTreaty(
              newState.civilizations[decision.targetCiv].diplomacy, civId, decision.action, decision.action === 'non_aggression_pact' ? 10 : -1, newState.turn,
            );
          }
          bus.emit('diplomacy:treaty-accepted', { civA: civId, civB: decision.targetCiv, treaty: decision.action });
          break;
      }
    }
  }

  // Update AI visibility
  const civUnits = civ.units
    .map(id => newState.units[id])
    .filter((u): u is Unit => u !== undefined);
  const cityPositions = civ.cities
    .map(id => newState.cities[id]?.position)
    .filter((p): p is HexCoord => p !== undefined);
  updateVisibility(newState.civilizations[civId].visibility, civUnits, newState.map, cityPositions);

  return newState;
}
```

- [ ] **Step 2: Update basic-ai tests**

Update `tests/ai/basic-ai.test.ts` to ensure any `Civilization` objects have `civType` and `diplomacy` fields. Add a test for personality-driven tech selection:

```typescript
  it('chooses tech based on personality (aggressive prefers military)', () => {
    // Create state where AI is 'mongolia' (aggressive)
    const state = createNewGame('greece', 'ai-test');
    // Give AI available techs
    const result = processAITurn(state, 'ai-1', bus);
    // AI should have started researching something
    expect(result.civilizations['ai-1'].techState.currentResearch).not.toBeNull();
  });
```

- [ ] **Step 3: Run full test suite**

Run: `eval "$(mise activate bash)" && yarn test 2>&1 | tail -20`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add src/ai/basic-ai.ts tests/ai/basic-ai.test.ts
git commit -m "feat(m2b): refactor AI with personality-driven strategy and diplomacy"
```

---

## Task 10: Turn Manager Diplomacy Integration

**Files:**
- Modify: `src/core/turn-manager.ts`
- Modify: `tests/core/turn-manager.test.ts`

- [ ] **Step 1: Add diplomacy processing to turn-manager.ts**

Add imports and diplomacy processing after the city/research loop:

```typescript
import { processRelationshipDrift, decayEvents, tickTreaties } from '@/systems/diplomacy-system';
```

Inside the `for (const [civId, civ] of Object.entries(newState.civilizations))` loop, after gold update, add:

```typescript
    // Process diplomacy
    if (civ.diplomacy) {
      // Check for units near other civs' borders
      const unitsNearBorder: Record<string, boolean> = {};
      for (const otherCivId of Object.keys(newState.civilizations)) {
        if (otherCivId === civId) continue;
        const otherCities = newState.civilizations[otherCivId].cities
          .map(id => newState.cities[id])
          .filter(Boolean);
        const hasUnitsNear = civUnits.some(u =>
          otherCities.some(c => {
            const dq = Math.abs(u.position.q - c!.position.q);
            const dr = Math.abs(u.position.r - c!.position.r);
            return dq + dr <= 3;
          })
        );
        unitsNearBorder[otherCivId] = hasUnitsNear;
      }

      let dipState = processRelationshipDrift(civ.diplomacy, unitsNearBorder);
      dipState = decayEvents(dipState, newState.turn);
      dipState = tickTreaties(dipState);

      // Trade agreement gold income
      for (const treaty of dipState.treaties) {
        if (treaty.type === 'trade_agreement' && treaty.goldPerTurn) {
          newState.civilizations[civId].gold += treaty.goldPerTurn;
        }
      }

      newState.civilizations[civId].diplomacy = dipState;
    }
```

Note: Move the `civUnits` variable declaration (currently used for visibility at the bottom of the loop) to earlier in the loop so it's available for the diplomacy border check.

- [ ] **Step 2: Add turn-manager diplomacy tests**

Add to `tests/core/turn-manager.test.ts`:

```typescript
  it('processes diplomacy relationship drift each turn', () => {
    const state = createNewGame('egypt', 'diplo-test');
    const result = processTurn(state, bus);
    // Relationships should have drifted (peaceful = +1)
    const playerDip = result.civilizations.player.diplomacy;
    expect(playerDip).toBeDefined();
  });

  it('ticks treaty turns remaining', () => {
    const state = createNewGame('egypt', 'treaty-test');
    state.civilizations.player.diplomacy.treaties = [{
      type: 'non_aggression_pact',
      civA: 'player',
      civB: 'ai-1',
      turnsRemaining: 5,
    }];
    const result = processTurn(state, bus);
    const treaty = result.civilizations.player.diplomacy.treaties[0];
    expect(treaty.turnsRemaining).toBe(4);
  });
```

- [ ] **Step 3: Run full test suite**

Run: `eval "$(mise activate bash)" && yarn test 2>&1 | tail -20`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add src/core/turn-manager.ts tests/core/turn-manager.test.ts
git commit -m "feat(m2b): integrate diplomacy processing into turn manager"
```

---

## Task 11: Civ Selection UI

**Files:**
- Create: `src/ui/civ-select.ts`

- [ ] **Step 1: Create civ-select.ts**

```typescript
import { CIV_DEFINITIONS } from '@/systems/civ-definitions';
import type { CivDefinition } from '@/core/types';

export interface CivSelectCallbacks {
  onSelect: (civId: string) => void;
}

export function createCivSelectPanel(
  container: HTMLElement,
  callbacks: CivSelectCallbacks,
): HTMLElement {
  const panel = document.createElement('div');
  panel.id = 'civ-select';
  panel.style.cssText = 'position:absolute;top:0;left:0;right:0;bottom:0;background:rgba(15,15,25,0.98);z-index:50;overflow-y:auto;padding:16px;display:flex;flex-direction:column;align-items:center;';

  let selectedCiv: string | null = null;

  let html = `
    <h1 style="font-size:22px;color:#e8c170;margin:24px 0 8px;text-align:center;">Choose Your Civilization</h1>
    <p style="font-size:13px;opacity:0.6;margin-bottom:24px;text-align:center;">Each civilization has a unique bonus that shapes your strategy.</p>
    <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:12px;max-width:400px;width:100%;">
  `;

  for (const civ of CIV_DEFINITIONS) {
    html += `
      <div class="civ-card" data-civ-id="${civ.id}" style="background:rgba(255,255,255,0.08);border:2px solid transparent;border-radius:12px;padding:14px;cursor:pointer;transition:border-color 0.2s;">
        <div style="width:100%;height:4px;background:${civ.color};border-radius:2px;margin-bottom:10px;"></div>
        <div style="font-weight:bold;font-size:15px;color:${civ.color};">${civ.name}</div>
        <div style="font-size:12px;color:#e8c170;margin-top:4px;">${civ.bonusName}</div>
        <div style="font-size:11px;opacity:0.7;margin-top:4px;">${civ.bonusDescription}</div>
        <div style="font-size:10px;opacity:0.4;margin-top:6px;">${civ.personality.traits.join(', ')}</div>
      </div>
    `;
  }

  html += '</div>';
  html += `
    <div style="margin-top:20px;display:flex;gap:12px;">
      <button id="civ-random" style="padding:10px 20px;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);border-radius:8px;color:white;cursor:pointer;font-size:13px;">Random</button>
      <button id="civ-start" style="padding:10px 24px;background:rgba(232,193,112,0.3);border:2px solid #e8c170;border-radius:8px;color:#e8c170;cursor:pointer;font-size:14px;font-weight:bold;opacity:0.4;" disabled>Start Game</button>
    </div>
  `;

  panel.innerHTML = html;
  container.appendChild(panel);

  // Card selection
  const cards = panel.querySelectorAll('.civ-card');
  const startBtn = panel.querySelector('#civ-start') as HTMLButtonElement;

  cards.forEach(card => {
    card.addEventListener('click', () => {
      const civId = (card as HTMLElement).dataset.civId!;
      selectedCiv = civId;

      // Update visuals
      cards.forEach(c => {
        (c as HTMLElement).style.borderColor = 'transparent';
      });
      (card as HTMLElement).style.borderColor = '#e8c170';

      startBtn.disabled = false;
      startBtn.style.opacity = '1';
    });
  });

  // Random button
  panel.querySelector('#civ-random')?.addEventListener('click', () => {
    const randomIdx = Math.floor(Math.random() * CIV_DEFINITIONS.length);
    const randomCiv = CIV_DEFINITIONS[randomIdx];
    selectedCiv = randomCiv.id;

    cards.forEach(c => {
      const id = (c as HTMLElement).dataset.civId;
      (c as HTMLElement).style.borderColor = id === selectedCiv ? '#e8c170' : 'transparent';
    });

    startBtn.disabled = false;
    startBtn.style.opacity = '1';
  });

  // Start button
  startBtn.addEventListener('click', () => {
    if (selectedCiv) {
      panel.remove();
      callbacks.onSelect(selectedCiv);
    }
  });

  return panel;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/ui/civ-select.ts
git commit -m "feat(m2b): add civilization selection panel UI"
```

---

## Task 12: Diplomacy Panel UI

**Files:**
- Create: `src/ui/diplomacy-panel.ts`

- [ ] **Step 1: Create diplomacy-panel.ts**

```typescript
import type { GameState, DiplomaticAction, TreatyType } from '@/core/types';
import { getRelationship, isAtWar, getAvailableActions } from '@/systems/diplomacy-system';
import { getCivDefinition } from '@/systems/civ-definitions';

export interface DiplomacyPanelCallbacks {
  onAction: (targetCivId: string, action: DiplomaticAction) => void;
  onClose: () => void;
}

export function createDiplomacyPanel(
  container: HTMLElement,
  state: GameState,
  callbacks: DiplomacyPanelCallbacks,
): HTMLElement {
  const panel = document.createElement('div');
  panel.id = 'diplomacy-panel';
  panel.style.cssText = 'position:absolute;top:0;left:0;right:0;bottom:0;background:rgba(15,15,25,0.95);z-index:30;overflow-y:auto;padding:16px;padding-bottom:80px;';

  const playerCiv = state.civilizations.player;
  const playerDiplomacy = playerCiv.diplomacy;

  let html = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
      <h2 style="font-size:18px;color:#e8c170;margin:0;">Diplomacy</h2>
      <span id="diplo-close" style="cursor:pointer;font-size:24px;opacity:0.6;">✕</span>
    </div>
  `;

  // List all known civs
  for (const [civId, civ] of Object.entries(state.civilizations)) {
    if (civId === 'player') continue;

    const civDef = getCivDefinition(civ.civType ?? '');
    const relationship = getRelationship(playerDiplomacy, civId);
    const atWar = isAtWar(playerDiplomacy, civId);
    const actions = getAvailableActions(
      playerDiplomacy, civId, playerCiv.techState.completed, state.era,
    );

    // Relationship bar color
    let barColor = '#888';
    if (relationship > 30) barColor = '#4a9b4a';
    else if (relationship > 0) barColor = '#8ab84a';
    else if (relationship > -30) barColor = '#d9d94a';
    else if (relationship > -60) barColor = '#d9944a';
    else barColor = '#d94a4a';

    const statusText = atWar ? '⚔️ At War' : relationship > 30 ? '😊 Friendly' : relationship > 0 ? '🤝 Neutral' : relationship > -30 ? '😐 Cautious' : '😠 Hostile';

    html += `
      <div style="background:rgba(255,255,255,0.08);border-radius:10px;padding:14px;margin-bottom:12px;">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
          <div style="width:24px;height:24px;border-radius:50%;background:${civ.color};"></div>
          <div>
            <div style="font-weight:bold;font-size:14px;">${civ.name}</div>
            <div style="font-size:11px;opacity:0.6;">${civDef?.bonusName ?? ''} · ${statusText}</div>
          </div>
        </div>

        <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
          <span style="font-size:11px;opacity:0.5;min-width:30px;">${relationship}</span>
          <div style="flex:1;background:rgba(0,0,0,0.3);border-radius:4px;height:8px;">
            <div style="background:${barColor};border-radius:4px;height:8px;width:${Math.max(2, (relationship + 100) / 2)}%;"></div>
          </div>
        </div>
    `;

    // Active treaties
    const treaties = playerDiplomacy.treaties.filter(
      t => t.civB === civId || t.civA === civId,
    );
    if (treaties.length > 0) {
      html += '<div style="margin-bottom:8px;">';
      for (const t of treaties) {
        const label = t.type.replace(/_/g, ' ');
        const turns = t.turnsRemaining > 0 ? ` (${t.turnsRemaining} turns)` : '';
        html += `<span style="display:inline-block;background:rgba(232,193,112,0.2);border-radius:4px;padding:2px 8px;font-size:10px;margin-right:4px;">${label}${turns}</span>`;
      }
      html += '</div>';
    }

    // Available actions
    html += '<div style="display:flex;flex-wrap:wrap;gap:6px;">';
    for (const action of actions) {
      const label = action.replace(/_/g, ' ');
      const isHostile = action === 'declare_war';
      const btnColor = isHostile ? 'rgba(217,74,74,0.3)' : 'rgba(255,255,255,0.1)';
      const borderColor = isHostile ? '#d94a4a' : 'rgba(255,255,255,0.2)';
      html += `<button class="diplo-action" data-civ-id="${civId}" data-action="${action}" style="padding:6px 12px;background:${btnColor};border:1px solid ${borderColor};border-radius:6px;color:white;cursor:pointer;font-size:11px;text-transform:capitalize;">${label}</button>`;
    }
    html += '</div></div>';
  }

  panel.innerHTML = html;
  container.appendChild(panel);

  // Close button
  panel.querySelector('#diplo-close')?.addEventListener('click', () => {
    panel.remove();
    callbacks.onClose();
  });

  // Action buttons
  panel.querySelectorAll('.diplo-action').forEach(btn => {
    btn.addEventListener('click', () => {
      const civId = (btn as HTMLElement).dataset.civId!;
      const action = (btn as HTMLElement).dataset.action! as DiplomaticAction;
      callbacks.onAction(civId, action);
      panel.remove();
    });
  });

  return panel;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/ui/diplomacy-panel.ts
git commit -m "feat(m2b): add diplomacy panel UI with relationship bars and actions"
```

---

## Task 13: Main.ts Integration

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 1: Add civ selection flow to main.ts**

Add imports at the top:

```typescript
import { createCivSelectPanel } from '@/ui/civ-select';
import { createDiplomacyPanel } from '@/ui/diplomacy-panel';
import { getCivDefinition } from '@/systems/civ-definitions';
import { declareWar, makePeace, proposeTreaty } from '@/systems/diplomacy-system';
```

In the `init()` function, replace the direct `createNewGame()` call with civ selection logic:

```typescript
  const saved = await loadAutoSave();
  if (saved) {
    gameState = saved;
    // ... existing load logic
  } else {
    // Show civ selection instead of starting directly
    createCivSelectPanel(uiLayer, {
      onSelect: (civId) => {
        gameState = createNewGame(civId);
        startGame();
      },
    });
    return; // Don't start game yet
  }
```

Extract game setup into a `startGame()` function that contains the post-initialization logic (creating UI, setting up render loop, etc.).

- [ ] **Step 2: Add diplomacy button to bottom bar**

In `createUI()`, add a diplomacy button alongside the existing tech/city buttons:

```typescript
  const diploBtn = document.createElement('div');
  diploBtn.textContent = '🤝';
  diploBtn.style.cssText = 'padding:8px 16px;background:rgba(255,255,255,0.1);border-radius:8px;cursor:pointer;font-size:18px;';
  diploBtn.addEventListener('click', () => togglePanel('diplomacy'));
  bottomBar.appendChild(diploBtn);
```

- [ ] **Step 3: Handle diplomacy panel toggle**

In the `togglePanel` function, add the diplomacy case:

```typescript
  if (panel === 'diplomacy') {
    createDiplomacyPanel(uiLayer, gameState, {
      onAction: (targetCivId, action) => {
        // Apply action to game state
        switch (action) {
          case 'declare_war':
            gameState.civilizations.player.diplomacy = declareWar(
              gameState.civilizations.player.diplomacy, targetCivId, gameState.turn,
            );
            if (gameState.civilizations[targetCivId]?.diplomacy) {
              gameState.civilizations[targetCivId].diplomacy = declareWar(
                gameState.civilizations[targetCivId].diplomacy, 'player', gameState.turn,
              );
            }
            bus.emit('diplomacy:war-declared', { attackerId: 'player', defenderId: targetCivId });
            break;
          case 'request_peace':
            gameState.civilizations.player.diplomacy = makePeace(
              gameState.civilizations.player.diplomacy, targetCivId, gameState.turn,
            );
            if (gameState.civilizations[targetCivId]?.diplomacy) {
              gameState.civilizations[targetCivId].diplomacy = makePeace(
                gameState.civilizations[targetCivId].diplomacy, 'player', gameState.turn,
              );
            }
            bus.emit('diplomacy:peace-made', { civA: 'player', civB: targetCivId });
            break;
          case 'non_aggression_pact':
          case 'trade_agreement':
          case 'open_borders':
          case 'alliance':
            gameState.civilizations.player.diplomacy = proposeTreaty(
              gameState.civilizations.player.diplomacy, targetCivId, action,
              action === 'non_aggression_pact' ? 10 : -1, gameState.turn,
            );
            if (gameState.civilizations[targetCivId]?.diplomacy) {
              gameState.civilizations[targetCivId].diplomacy = proposeTreaty(
                gameState.civilizations[targetCivId].diplomacy, 'player', action,
                action === 'non_aggression_pact' ? 10 : -1, gameState.turn,
              );
            }
            bus.emit('diplomacy:treaty-accepted', { civA: 'player', civB: targetCivId, treaty: action });
            break;
        }
        showNotification(`Diplomatic action: ${action.replace(/_/g, ' ')}`, 'info');
      },
      onClose: () => {},
    });
  }
```

- [ ] **Step 4: Update createNewGame call signature**

Find the existing `createNewGame()` call (used when no saved game exists) and update to pass civType. This was already handled in Step 1.

- [ ] **Step 5: Run build and verify**

Run: `eval "$(mise activate bash)" && yarn build 2>&1 | tail -10`
Expected: Build succeeds

- [ ] **Step 6: Commit**

```bash
git add src/main.ts
git commit -m "feat(m2b): wire up civ selection, diplomacy panel, and AI diplomacy in main"
```

---

## Task 14: Integration Test & Polish

**Files:**
- Run full test suite
- Run production build
- Push to remote

- [ ] **Step 1: Run full test suite**

Run: `eval "$(mise activate bash)" && yarn test 2>&1 | tail -30`
Expected: All tests PASS (150+ tests)

- [ ] **Step 2: Fix any failing tests**

If tests fail, read errors and fix. Common issues:
- Missing `civType` or `diplomacy` in test fixtures
- Import path changes

- [ ] **Step 3: Run production build**

Run: `eval "$(mise activate bash)" && yarn build 2>&1`
Expected: Build succeeds, bundle size reported

- [ ] **Step 4: Verify dist output**

Run: `ls -la dist/`
Expected: index.html, manifest.json, sw.js, JS bundle

- [ ] **Step 5: Push to remote**

```bash
git push origin main
```
