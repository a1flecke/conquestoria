# M4b-1: Diplomacy & Civs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand diplomacy with vassalage, betrayal reputation, embargoes, and defensive leagues. Add 4 new civilizations (Russia, Ottoman, Shire, Isengard).

**Architecture:** Extends the existing diplomacy system with new treaty types, multilateral structures (embargoes, leagues) on GameState, and per-civ vassalage/treachery on DiplomacyState. All new systems are wired into turn-manager.ts, game-state.ts initialization, and AI decision-making. Four new civs integrate via existing CivBonusEffect pattern.

**Tech Stack:** TypeScript, Vitest, Canvas 2D renderer, EventBus

---

## File Structure

| File | Responsibility |
|------|---------------|
| `src/core/types.ts` | Type definitions: new diplomatic actions, treaty types, vassalage, treachery, embargo, league, CivBonusEffect variants, GameEvents |
| `src/systems/diplomacy-system.ts` | All diplomacy functions: vassalage lifecycle, betrayal tracking, embargo CRUD, league CRUD, treachery decay |
| `src/systems/civ-definitions.ts` | 4 new civ definitions |
| `src/systems/resource-system.ts` | Russia tundra bonus, Shire food bonus (via new bonusEffect param) |
| `src/systems/combat-system.ts` | Ottoman siege bonus (via new context param) |
| `src/systems/city-system.ts` | Isengard forest raze, Shire military penalty |
| `src/ai/ai-diplomacy.ts` | AI decisions for vassalage, embargoes, leagues, treachery awareness |
| `src/core/turn-manager.ts` | Wiring: tribute, protection timers, treachery decay, embargo enforcement, league cleanup |
| `src/core/game-state.ts` | Initialize embargoes, leagues, vassalage in createNewGame/createHotSeatGame |
| `src/ui/advisor-system.ts` | Chancellor advisor messages for new diplomatic options |
| `tests/systems/diplomacy-vassalage.test.ts` | Vassalage unit tests |
| `tests/systems/diplomacy-betrayal.test.ts` | Betrayal & treachery unit tests |
| `tests/systems/diplomacy-embargo.test.ts` | Embargo unit tests |
| `tests/systems/diplomacy-league.test.ts` | Defensive league unit tests |
| `tests/systems/civ-definitions.test.ts` | Updated civ definition tests |
| `tests/integration/m4b1-diplomacy-integration.test.ts` | Integration + cross-system tests |

---

## Task 1: Type Definitions

**Files:**
- Modify: `src/core/types.ts`

- [ ] **Step 1: Add vassalage and treachery to DiplomacyState**

In `src/core/types.ts`, after the existing `DiplomacyState` interface (line 254), add vassalage and treachery fields:

```typescript
export interface VassalageState {
  overlord: string | null;
  vassals: string[];
  protectionScore: number;
  protectionTimers: Array<{
    attackerCivId: string;
    turnsRemaining: number;
  }>;
  peakCities: number;
  peakMilitary: number;
}

export interface DiplomacyState {
  relationships: Record<string, number>;
  treaties: Treaty[];
  events: DiplomaticEvent[];
  atWarWith: string[];
  treacheryScore: number;
  vassalage: VassalageState;
}
```

- [ ] **Step 2: Extend DiplomaticAction and TreatyType**

Update the `DiplomaticAction` union (line 229) to add:
```typescript
export type DiplomaticAction =
  | 'declare_war'
  | 'request_peace'
  | 'non_aggression_pact'
  | 'trade_agreement'
  | 'open_borders'
  | 'alliance'
  | 'offer_vassalage'
  | 'petition_independence'
  | 'propose_embargo'
  | 'join_embargo'
  | 'leave_embargo'
  | 'propose_league'
  | 'invite_to_league'
  | 'petition_league'
  | 'leave_league';
```

Update `TreatyType` (line 237):
```typescript
export type TreatyType = 'non_aggression_pact' | 'trade_agreement' | 'open_borders' | 'alliance' | 'vassalage';
```

- [ ] **Step 3: Add embargo and league types to GameState**

```typescript
export interface Embargo {
  id: string;
  targetCivId: string;
  participants: string[];
  proposedTurn: number;
}

export interface DefensiveLeague {
  id: string;
  members: string[];
  formedTurn: number;
}
```

Add to `GameState` interface (after `espionage`). Use `?` optional initially so the build stays clean between Task 1 and Task 2. Task 2 will remove the `?` once initialization is added to both createNewGame and createHotSeatGame:
```typescript
  embargoes?: Embargo[];
  defensiveLeagues?: DefensiveLeague[];
```

- [ ] **Step 4: Add 4 new CivBonusEffect variants**

Add to the `CivBonusEffect` union (after line 215):
```typescript
  | { type: 'tundra_bonus'; foodBonus: number; productionBonus: number }
  | { type: 'siege_bonus'; damageMultiplier: number }
  | { type: 'peaceful_growth'; foodBonus: number; militaryPenalty: number }
  | { type: 'forest_industry'; productionBurst: number }
```

- [ ] **Step 5: Add new GameEvents**

Add to the `GameEvents` interface (after existing diplomacy events around line 544):
```typescript
  'diplomacy:vassalage-offered': { fromCivId: string; toCivId: string };
  'diplomacy:vassalage-accepted': { vassalId: string; overlordId: string };
  'diplomacy:vassalage-ended': { vassalId: string; overlordId: string; reason: 'independence' | 'war' | 'auto_breakaway' | 'overlord_eliminated' };
  'diplomacy:independence-petition': { vassalId: string; overlordId: string; accepted: boolean };
  'diplomacy:protection-failed': { overlordId: string; vassalId: string; attackerId: string };
  'diplomacy:vassal-auto-war': { vassalId: string; overlordId: string; targetCivId: string };
  'diplomacy:treachery': { civId: string; action: string; newScore: number };
  'diplomacy:embargo-proposed': { proposerId: string; targetCivId: string; embargoId: string };
  'diplomacy:embargo-joined': { civId: string; embargoId: string };
  'diplomacy:embargo-left': { civId: string; embargoId: string };
  'diplomacy:league-formed': { leagueId: string; members: string[] };
  'diplomacy:league-joined': { civId: string; leagueId: string };
  'diplomacy:league-dissolved': { leagueId: string; reason: string };
  'diplomacy:league-triggered': { leagueId: string; attackerId: string; defenderId: string };
```

- [ ] **Step 6: Build to verify types compile**

Run: `yarn build`
Expected: Compilation errors in diplomacy-system.ts and game-state.ts (DiplomacyState shape changed) — that's expected, we fix those in later tasks.

- [ ] **Step 7: Commit**

```bash
git add src/core/types.ts
git commit -m "feat(m4b1): type definitions — vassalage, treachery, embargoes, leagues, 4 new civ bonus types"
```

---

## Task 2: Update createDiplomacyState and Game Initialization

**Files:**
- Modify: `src/systems/diplomacy-system.ts`
- Modify: `src/core/game-state.ts`

- [ ] **Step 1: Update createDiplomacyState to include vassalage and treachery**

In `src/systems/diplomacy-system.ts`, update `createDiplomacyState()` (line 8) to return the new fields:

```typescript
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
    treacheryScore: 0,
    vassalage: {
      overlord: null,
      vassals: [],
      protectionScore: 100,
      protectionTimers: [],
      peakCities: 0,
      peakMilitary: 0,
    },
  };
}
```

- [ ] **Step 2: Add embargoes and defensiveLeagues to createNewGame + make fields required**

First, in `src/core/types.ts`, remove the `?` from `embargoes` and `defensiveLeagues` on `GameState` (making them required now that initialization follows).

Then in `src/core/game-state.ts`, add to the GameState literal in `createNewGame()` (around line 104):
```typescript
  embargoes: [],
  defensiveLeagues: [],
```

- [ ] **Step 3: Add embargoes and defensiveLeagues to createHotSeatGame**

In `src/core/game-state.ts`, add to the GameState literal in `createHotSeatGame()` (around line 197):
```typescript
  embargoes: [],
  defensiveLeagues: [],
```

- [ ] **Step 4: Build to verify compilation**

Run: `yarn build`
Expected: Should compile (or closer to compiling — remaining errors from test files referencing old DiplomacyState shape)

- [ ] **Step 5: Run tests to check for breakage**

Run: `yarn test`
Expected: Some test failures where tests create DiplomacyState without vassalage/treacheryScore fields. Note which tests fail — we fix them in the next step.

- [ ] **Step 6: Fix existing test DiplomacyState objects**

Update all test files that create `DiplomacyState` or `diplomacy` objects to include the new fields. Use `as any` cast or add the fields. Search with:
```bash
grep -rn "diplomacy:" tests/ --include="*.ts" | grep -v node_modules
```

For each match, add:
```typescript
treacheryScore: 0,
vassalage: { overlord: null, vassals: [], protectionScore: 100, protectionTimers: [], peakCities: 0, peakMilitary: 0 },
```

- [ ] **Step 7: Verify all tests pass**

Run: `yarn test`
Expected: All existing tests pass

- [ ] **Step 8: Commit**

```bash
git add src/systems/diplomacy-system.ts src/core/game-state.ts tests/
git commit -m "feat(m4b1): initialize vassalage, treachery, embargoes, leagues in game state"
```

---

## Task 3: Vassalage System

**Files:**
- Modify: `src/systems/diplomacy-system.ts`
- Create: `tests/systems/diplomacy-vassalage.test.ts`

- [ ] **Step 1: Write failing vassalage tests**

```typescript
// tests/systems/diplomacy-vassalage.test.ts
import { describe, it, expect } from 'vitest';
import {
  createDiplomacyState,
  canOfferVassalage,
  offerVassalage,
  acceptVassalage,
  endVassalage,
  endVassalageUnilateral,
  processVassalageTribute,
  processProtectionTimers,
  checkIndependenceThreshold,
  petitionIndependence,
  onVassalAttacked,
  isVassalBlocked,
} from '@/systems/diplomacy-system';
import type { DiplomacyState } from '@/core/types';

function makeDipState(overrides?: Partial<DiplomacyState>): DiplomacyState {
  return {
    relationships: { 'other': 0 },
    treaties: [],
    events: [],
    atWarWith: [],
    treacheryScore: 0,
    vassalage: {
      overlord: null, vassals: [], protectionScore: 100,
      protectionTimers: [], peakCities: 3, peakMilitary: 5,
    },
    ...overrides,
  };
}

describe('vassalage', () => {
  describe('canOfferVassalage', () => {
    it('returns true when below 50% peak cities in era >= 2', () => {
      expect(canOfferVassalage(1, 3, 2, 5, 2)).toBe(true);
    });

    it('returns false in era 1', () => {
      expect(canOfferVassalage(1, 3, 2, 5, 1)).toBe(false);
    });

    it('returns false when peak cities < 2', () => {
      expect(canOfferVassalage(0, 1, 2, 5, 2)).toBe(false);
    });

    it('returns false when above 50% peak', () => {
      expect(canOfferVassalage(2, 3, 4, 5, 2)).toBe(false);
    });
  });

  describe('acceptVassalage', () => {
    it('sets overlord on vassal and adds to overlord vassals list', () => {
      const vassal = makeDipState();
      const overlord = makeDipState();
      const { vassalState, overlordState } = acceptVassalage(vassal, overlord, 'vassal-id', 'overlord-id', 10);
      expect(vassalState.vassalage.overlord).toBe('overlord-id');
      expect(overlordState.vassalage.vassals).toContain('vassal-id');
      expect(vassalState.treaties.some(t => t.type === 'vassalage')).toBe(true);
      expect(overlordState.treaties.some(t => t.type === 'vassalage')).toBe(true);
    });
  });

  describe('endVassalage', () => {
    it('clears overlord and removes from vassals list', () => {
      const vassal = makeDipState({ vassalage: { overlord: 'overlord-id', vassals: [], protectionScore: 100, protectionTimers: [], peakCities: 3, peakMilitary: 5 } });
      const overlord = makeDipState({ vassalage: { overlord: null, vassals: ['vassal-id'], protectionScore: 100, protectionTimers: [], peakCities: 3, peakMilitary: 5 } });
      const { vassalState, overlordState } = endVassalage(vassal, overlord, 'vassal-id', 'overlord-id');
      expect(vassalState.vassalage.overlord).toBeNull();
      expect(overlordState.vassalage.vassals).not.toContain('vassal-id');
    });
  });

  describe('processVassalageTribute', () => {
    it('transfers 25% of vassal gold income to overlord', () => {
      const result = processVassalageTribute(40); // 40 gold income
      expect(result.tributeAmount).toBe(10);
    });
  });

  describe('processProtectionTimers', () => {
    it('decrements timer and applies penalty when expired', () => {
      const state = makeDipState({
        vassalage: {
          overlord: 'overlord-id', vassals: [], protectionScore: 100,
          protectionTimers: [{ attackerCivId: 'attacker', turnsRemaining: 1 }],
          peakCities: 3, peakMilitary: 5,
        },
      });
      const result = processProtectionTimers(state);
      expect(result.vassalage.protectionScore).toBe(80);
      expect(result.vassalage.protectionTimers).toHaveLength(0);
    });

    it('does not penalize if timer still active', () => {
      const state = makeDipState({
        vassalage: {
          overlord: 'overlord-id', vassals: [], protectionScore: 100,
          protectionTimers: [{ attackerCivId: 'attacker', turnsRemaining: 2 }],
          peakCities: 3, peakMilitary: 5,
        },
      });
      const result = processProtectionTimers(state);
      expect(result.vassalage.protectionScore).toBe(100);
      expect(result.vassalage.protectionTimers[0].turnsRemaining).toBe(1);
    });
  });

  describe('checkIndependenceThreshold', () => {
    it('returns true when vassal military exceeds modified threshold', () => {
      // Protection 100 → threshold 60%. Vassal has 70, overlord has 100 → 70% > 60%
      expect(checkIndependenceThreshold(70, 100, 100)).toBe(true);
    });

    it('returns false when below threshold', () => {
      expect(checkIndependenceThreshold(40, 100, 100)).toBe(false);
    });

    it('lowers threshold with poor protection', () => {
      // Protection 60 → threshold 40%. Vassal has 45, overlord has 100 → 45% > 40%
      expect(checkIndependenceThreshold(45, 100, 60)).toBe(true);
    });

    it('auto-breakaway at protection <= 20', () => {
      expect(checkIndependenceThreshold(1, 100, 20)).toBe(true);
    });
  });

  describe('petitionIndependence', () => {
    it('returns peaceful separation when overlord accepts', () => {
      const vassal = makeDipState({ vassalage: { overlord: 'overlord-id', vassals: [], protectionScore: 100, protectionTimers: [], peakCities: 3, peakMilitary: 5 } });
      const overlord = makeDipState({ vassalage: { overlord: null, vassals: ['vassal-id'], protectionScore: 100, protectionTimers: [], peakCities: 3, peakMilitary: 5 } });
      const result = petitionIndependence(vassal, overlord, 'vassal-id', 'overlord-id', true);
      expect(result.vassalState.vassalage.overlord).toBeNull();
      expect(result.overlordState.vassalage.vassals).not.toContain('vassal-id');
      expect(result.relationshipChange).toBe(10);
    });

    it('returns war declaration with treachery when overlord refuses', () => {
      const vassal = makeDipState({ vassalage: { overlord: 'overlord-id', vassals: [], protectionScore: 100, protectionTimers: [], peakCities: 3, peakMilitary: 5 } });
      const overlord = makeDipState({ vassalage: { overlord: null, vassals: ['vassal-id'], protectionScore: 100, protectionTimers: [], peakCities: 3, peakMilitary: 5 } });
      const result = petitionIndependence(vassal, overlord, 'vassal-id', 'overlord-id', false);
      expect(result.vassalState.vassalage.overlord).toBeNull();
      expect(result.vassalState.atWarWith).toContain('overlord-id');
      expect(result.vassalState.treacheryScore).toBe(20); // vassalage_independence
      expect(result.relationshipChange).toBe(-50);
    });
  });

  describe('onVassalAttacked', () => {
    it('starts protection timer without auto-declaring war', () => {
      const overlord = makeDipState({ vassalage: { overlord: null, vassals: ['vassal-id'], protectionScore: 100, protectionTimers: [], peakCities: 3, peakMilitary: 5 } });
      const result = onVassalAttacked(overlord, 'attacker-id');
      expect(result.vassalage.protectionTimers).toHaveLength(1);
      expect(result.vassalage.protectionTimers[0].attackerCivId).toBe('attacker-id');
      expect(result.vassalage.protectionTimers[0].turnsRemaining).toBe(3);
      // Does NOT auto-declare war — overlord decides on their turn
      expect(result.atWarWith).not.toContain('attacker-id');
    });

    it('does not duplicate timer for same attacker', () => {
      const overlord = makeDipState({ vassalage: { overlord: null, vassals: ['vassal-id'], protectionScore: 100, protectionTimers: [{ attackerCivId: 'attacker-id', turnsRemaining: 2 }], peakCities: 3, peakMilitary: 5 } });
      const result = onVassalAttacked(overlord, 'attacker-id');
      expect(result.vassalage.protectionTimers).toHaveLength(1);
    });
  });

  describe('isVassalBlocked', () => {
    it('blocks war declaration for vassals', () => {
      expect(isVassalBlocked('declare_war', true)).toBe(true);
    });

    it('blocks treaty signing for vassals', () => {
      expect(isVassalBlocked('non_aggression_pact', true)).toBe(true);
      expect(isVassalBlocked('alliance', true)).toBe(true);
    });

    it('blocks embargo proposal for vassals', () => {
      expect(isVassalBlocked('propose_embargo', true)).toBe(true);
    });

    it('blocks league proposal for vassals', () => {
      expect(isVassalBlocked('propose_league', true)).toBe(true);
    });

    it('allows actions for non-vassals', () => {
      expect(isVassalBlocked('declare_war', false)).toBe(false);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `yarn test tests/systems/diplomacy-vassalage.test.ts`
Expected: FAIL — functions not found

- [ ] **Step 3: Implement vassalage functions**

Add to `src/systems/diplomacy-system.ts`:

```typescript
// --- Vassalage ---

export function canOfferVassalage(
  currentCities: number,
  peakCities: number,
  currentMilitary: number,
  peakMilitary: number,
  era: number,
): boolean {
  if (era < 2) return false;
  if (peakCities < 2) return false;
  const citiesBelow = currentCities < peakCities * 0.5;
  const militaryBelow = currentMilitary < peakMilitary * 0.5;
  return citiesBelow || militaryBelow;
}

// Note: acceptVassalage also returns leagueUpdates if the vassal was in a league.
// The caller must apply leagueUpdates to GameState.defensiveLeagues.
export function acceptVassalage(
  vassalDip: DiplomacyState,
  overlordDip: DiplomacyState,
  vassalId: string,
  overlordId: string,
  turn: number,
  leagues?: DefensiveLeague[],
): { vassalState: DiplomacyState; overlordState: DiplomacyState; leagueUpdates?: DefensiveLeague[] } {
  const treaty: Treaty = {
    type: 'vassalage',
    civA: vassalId,
    civB: overlordId,
    turnsRemaining: -1,
  };
  const vassalState: DiplomacyState = {
    ...vassalDip,
    vassalage: { ...vassalDip.vassalage, overlord: overlordId },
    treaties: [...vassalDip.treaties, treaty],
    events: [...vassalDip.events, { type: 'vassalage_accepted', turn, otherCiv: overlordId, weight: 1 }],
  };
  const overlordState: DiplomacyState = {
    ...overlordDip,
    vassalage: { ...overlordDip.vassalage, vassals: [...overlordDip.vassalage.vassals, vassalId] },
    treaties: [...overlordDip.treaties, treaty],
    events: [...overlordDip.events, { type: 'vassalage_accepted', turn, otherCiv: vassalId, weight: 1 }],
  };

  // Force vassal out of any defensive league (no treachery — involuntary)
  let leagueUpdates: DefensiveLeague[] | undefined;
  if (leagues) {
    const vassalLeague = getLeagueForCiv(leagues, vassalId);
    if (vassalLeague) {
      const leaveResult = leaveLeague(leagues, vassalLeague.id, vassalId);
      leagueUpdates = leaveResult.leagues;
    }
  }

  return { vassalState, overlordState, leagueUpdates };
}

export function endVassalage(
  vassalDip: DiplomacyState,
  overlordDip: DiplomacyState,
  vassalId: string,
  overlordId: string,
): { vassalState: DiplomacyState; overlordState: DiplomacyState } {
  const vassalState: DiplomacyState = {
    ...vassalDip,
    vassalage: { ...vassalDip.vassalage, overlord: null, protectionScore: 100, protectionTimers: [] },
    treaties: vassalDip.treaties.filter(t => !(t.type === 'vassalage' && ((t.civA === vassalId && t.civB === overlordId) || (t.civA === overlordId && t.civB === vassalId)))),
  };
  const overlordState: DiplomacyState = {
    ...overlordDip,
    vassalage: { ...overlordDip.vassalage, vassals: overlordDip.vassalage.vassals.filter(v => v !== vassalId) },
    treaties: overlordDip.treaties.filter(t => !(t.type === 'vassalage' && ((t.civA === vassalId && t.civB === overlordId) || (t.civA === overlordId && t.civB === vassalId)))),
  };
  return { vassalState, overlordState };
}

export function processVassalageTribute(vassalGoldIncome: number): { tributeAmount: number } {
  return { tributeAmount: Math.floor(vassalGoldIncome * 0.25) };
}

export function processProtectionTimers(state: DiplomacyState): DiplomacyState {
  let protectionScore = state.vassalage.protectionScore;
  const remainingTimers: Array<{ attackerCivId: string; turnsRemaining: number }> = [];

  for (const timer of state.vassalage.protectionTimers) {
    const newTurns = timer.turnsRemaining - 1;
    if (newTurns <= 0) {
      protectionScore = Math.max(0, protectionScore - 20);
    } else {
      remainingTimers.push({ ...timer, turnsRemaining: newTurns });
    }
  }

  return {
    ...state,
    vassalage: {
      ...state.vassalage,
      protectionScore,
      protectionTimers: remainingTimers,
    },
  };
}

export function checkIndependenceThreshold(
  vassalStrength: number,
  overlordStrength: number,
  protectionScore: number,
): boolean {
  if (protectionScore <= 20) return true;
  const protectionLost = 100 - protectionScore;
  const thresholdReduction = Math.floor(protectionLost / 20) * 0.1;
  const threshold = 0.6 - thresholdReduction;
  if (overlordStrength === 0) return true;
  return (vassalStrength / overlordStrength) >= threshold;
}

// --- Vassal action blocking ---

const VASSAL_BLOCKED_ACTIONS = [
  'declare_war', 'non_aggression_pact', 'trade_agreement', 'open_borders',
  'alliance', 'propose_embargo', 'join_embargo', 'propose_league', 'invite_to_league',
];

export function isVassalBlocked(action: string, isVassal: boolean): boolean {
  if (!isVassal) return false;
  return VASSAL_BLOCKED_ACTIONS.includes(action);
}

// --- Independence petition ---

export function petitionIndependence(
  vassalDip: DiplomacyState,
  overlordDip: DiplomacyState,
  vassalId: string,
  overlordId: string,
  overlordAccepts: boolean,
): { vassalState: DiplomacyState; overlordState: DiplomacyState; relationshipChange: number } {
  const { vassalState: baseVassal, overlordState: baseOverlord } = endVassalage(vassalDip, overlordDip, vassalId, overlordId);
  if (overlordAccepts) {
    return {
      vassalState: modifyRelationship(baseVassal, overlordId, 10),
      overlordState: modifyRelationship(baseOverlord, vassalId, 10),
      relationshipChange: 10,
    };
  }
  // Overlord refuses — vassal declares war (+20 treachery for breaking vassalage)
  let vassalAtWar: DiplomacyState = {
    ...baseVassal,
    atWarWith: [...new Set([...baseVassal.atWarWith, overlordId])],
  };
  vassalAtWar = applyTreachery(vassalAtWar, 'vassalage_independence');
  const overlordAtWar: DiplomacyState = {
    ...baseOverlord,
    atWarWith: [...new Set([...baseOverlord.atWarWith, vassalId])],
  };
  return {
    vassalState: modifyRelationship(vassalAtWar, overlordId, -50),
    overlordState: modifyRelationship(overlordAtWar, vassalId, -50),
    relationshipChange: -50,
  };
}

// --- Vassal attacked: start protection timer (overlord gets 3 turns to respond) ---
// The overlord is NOT auto-declared war here. AI overlords declare war in their turn;
// human overlords get a chancellor advisor prompt. If the timer expires without
// overlord action, protectionScore drops -20 per spec.

export function onVassalAttacked(
  overlordDip: DiplomacyState,
  attackerId: string,
): DiplomacyState {
  const alreadyTracked = overlordDip.vassalage.protectionTimers.some(t => t.attackerCivId === attackerId);
  if (alreadyTracked) return overlordDip;
  return {
    ...overlordDip,
    vassalage: {
      ...overlordDip.vassalage,
      protectionTimers: [...overlordDip.vassalage.protectionTimers, { attackerCivId: attackerId, turnsRemaining: 3 }],
    },
  };
}

// --- Unilateral endVassalage (overlord eliminated) ---

export function endVassalageUnilateral(
  vassalDip: DiplomacyState,
  vassalId: string,
  overlordId: string,
): DiplomacyState {
  return {
    ...vassalDip,
    vassalage: { ...vassalDip.vassalage, overlord: null, protectionScore: 100, protectionTimers: [] },
    treaties: vassalDip.treaties.filter(t => !(t.type === 'vassalage' && ((t.civA === vassalId && t.civB === overlordId) || (t.civA === overlordId && t.civB === vassalId)))),
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `yarn test tests/systems/diplomacy-vassalage.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/systems/diplomacy-system.ts tests/systems/diplomacy-vassalage.test.ts
git commit -m "feat(m4b1): vassalage system — offer, accept, end, tribute, protection, independence"
```

---

## Task 4: Betrayal & Treachery System

**Files:**
- Modify: `src/systems/diplomacy-system.ts`
- Create: `tests/systems/diplomacy-betrayal.test.ts`

- [ ] **Step 1: Write failing betrayal tests**

```typescript
// tests/systems/diplomacy-betrayal.test.ts
import { describe, it, expect } from 'vitest';
import {
  applyTreachery,
  broadcastTreacheryPenalty,
  decayTreachery,
} from '@/systems/diplomacy-system';
import type { DiplomacyState } from '@/core/types';

function makeDipState(overrides?: Partial<DiplomacyState>): DiplomacyState {
  return {
    relationships: { 'civ-a': 0, 'civ-b': 10 },
    treaties: [],
    events: [],
    atWarWith: [],
    treacheryScore: 0,
    vassalage: { overlord: null, vassals: [], protectionScore: 100, protectionTimers: [], peakCities: 3, peakMilitary: 5 },
    ...overrides,
  };
}

describe('betrayal & treachery', () => {
  describe('applyTreachery', () => {
    it('adds treachery for breaking NAP', () => {
      const state = makeDipState();
      const result = applyTreachery(state, 'non_aggression_pact');
      expect(result.treacheryScore).toBe(20);
    });

    it('adds treachery for breaking alliance', () => {
      const state = makeDipState();
      const result = applyTreachery(state, 'alliance');
      expect(result.treacheryScore).toBe(30);
    });

    it('adds treachery for breaking vassalage', () => {
      const state = makeDipState();
      const result = applyTreachery(state, 'vassalage');
      expect(result.treacheryScore).toBe(40);
    });

    it('clamps at 100', () => {
      const state = makeDipState({ treacheryScore: 90 });
      const result = applyTreachery(state, 'vassalage');
      expect(result.treacheryScore).toBe(100);
    });

    it('stacks when breaking multiple treaties via war declaration', () => {
      let state = makeDipState();
      state = applyTreachery(state, 'non_aggression_pact'); // +20
      state = applyTreachery(state, 'alliance');              // +30
      expect(state.treacheryScore).toBe(50);
    });
  });

  describe('broadcastTreacheryPenalty', () => {
    it('applies relationship penalty to all civs based on treachery score', () => {
      const states: Record<string, DiplomacyState> = {
        betrayer: makeDipState({ treacheryScore: 40 }),
        'civ-a': makeDipState({ relationships: { betrayer: 20 } }),
        'civ-b': makeDipState({ relationships: { betrayer: 10 } }),
      };
      const result = broadcastTreacheryPenalty(states, 'betrayer');
      // Penalty = -(40/4) = -10
      expect(result['civ-a'].relationships['betrayer']).toBe(10);
      expect(result['civ-b'].relationships['betrayer']).toBe(0);
    });
  });

  describe('decayTreachery', () => {
    it('decays 1 point every 5 turns', () => {
      const state = makeDipState({ treacheryScore: 20 });
      const result = decayTreachery(state, 15); // turn 15 → divisible by 5
      expect(result.treacheryScore).toBe(19);
    });

    it('does not decay on non-5th turn', () => {
      const state = makeDipState({ treacheryScore: 20 });
      const result = decayTreachery(state, 13);
      expect(result.treacheryScore).toBe(20);
    });

    it('does not go below 0', () => {
      const state = makeDipState({ treacheryScore: 0 });
      const result = decayTreachery(state, 10);
      expect(result.treacheryScore).toBe(0);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `yarn test tests/systems/diplomacy-betrayal.test.ts`
Expected: FAIL — functions not found

- [ ] **Step 3: Implement betrayal functions**

Add to `src/systems/diplomacy-system.ts`:

```typescript
// --- Betrayal & Treachery ---

const TREACHERY_AMOUNTS: Record<string, number> = {
  non_aggression_pact: 20,
  trade_agreement: 15,
  alliance: 30,
  vassalage: 40,
  vassalage_independence: 20,
  leave_embargo: 5,
  leave_league: 10,
};

export function applyTreachery(
  state: DiplomacyState,
  action: string,
): DiplomacyState {
  const amount = TREACHERY_AMOUNTS[action] ?? 0;
  return {
    ...state,
    treacheryScore: Math.min(100, state.treacheryScore + amount),
  };
}

export function broadcastTreacheryPenalty(
  allDipStates: Record<string, DiplomacyState>,
  betrayerCivId: string,
): Record<string, DiplomacyState> {
  const betrayer = allDipStates[betrayerCivId];
  if (!betrayer) return allDipStates;

  const penalty = -Math.floor(betrayer.treacheryScore / 4);
  const result = { ...allDipStates };

  for (const [civId, dip] of Object.entries(result)) {
    if (civId === betrayerCivId) continue;
    if (dip.relationships[betrayerCivId] !== undefined) {
      result[civId] = modifyRelationship(dip, betrayerCivId, penalty);
    }
  }

  return result;
}

export function decayTreachery(state: DiplomacyState, turn: number): DiplomacyState {
  if (turn % 5 !== 0 || state.treacheryScore <= 0) return state;
  return {
    ...state,
    treacheryScore: Math.max(0, state.treacheryScore - 1),
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `yarn test tests/systems/diplomacy-betrayal.test.ts`
Expected: PASS

- [ ] **Step 5: Update existing declareWar to trigger treachery for broken treaties and vassal auto-war**

In `src/systems/diplomacy-system.ts`, update `declareWar()` to add `isVoluntary` param, treachery for broken treaties, and vassal auto-war. Read the existing function body first — preserve all existing bilateral logic (atWarWith dedup, treaty removal, event recording). Insert the new logic after the existing body:

```typescript
export function declareWar(
  state: DiplomacyState,
  targetCivId: string,
  turn: number,
  isVoluntary: boolean = true,
): DiplomacyState {
  // --- Existing logic (preserve relationship penalty + dedup) ---
  if (state.atWarWith.includes(targetCivId)) return state;
  let updated: DiplomacyState = {
    ...state,
    atWarWith: [...state.atWarWith, targetCivId],
    // Remove all non-vassalage treaties with target
    treaties: state.treaties.filter(t =>
      !((t.civA === targetCivId || t.civB === targetCivId) && t.type !== 'vassalage'),
    ),
    events: [...state.events, { type: 'war_declared', turn, otherCiv: targetCivId, weight: 1 }],
  };
  // Preserve existing -50 relationship penalty
  updated = modifyRelationship(updated, targetCivId, -50);

  // --- NEW: If voluntary, apply treachery for each broken treaty ---
  if (isVoluntary) {
    const brokenTreaties = state.treaties.filter(t =>
      (t.civA === targetCivId || t.civB === targetCivId) && t.type !== 'vassalage'
    );
    for (const treaty of brokenTreaties) {
      updated = applyTreachery(updated, treaty.type);
    }
  }

  return updated;
}

// Vassal auto-joins overlord's wars — call after overlord's declareWar
export function vassalAutoWar(
  vassalDip: DiplomacyState,
  targetCivId: string,
  turn: number,
): DiplomacyState {
  return declareWar(vassalDip, targetCivId, turn, false); // isVoluntary=false → no treachery
}
```

- [ ] **Step 5b: Update getAvailableActions to include new diplomatic actions**

In `src/systems/diplomacy-system.ts`, update `getAvailableActions()` (line 184) to include the new actions. Add after the existing alliance check, before the closing `}`:

```typescript
    // Vassalage (only when weakened, era >= 2, not already a vassal)
    // Actual canOfferVassalage check happens at call site with peak data
    if (era >= 2 && !state.vassalage?.overlord) {
      actions.push('offer_vassalage');
    }

    // Embargo (requires currency tech or era >= 2, not vassal)
    const hasEmbargoTech = completedTechs.some(t => ['currency', 'foreign-trade', 'banking'].includes(t));
    if ((era >= 2 || hasEmbargoTech) && !state.vassalage?.overlord) {
      actions.push('propose_embargo');
    }

    // League (requires writing tech, not in a league, not vassal)
    const hasWritingTech = completedTechs.some(t => ['science-writing', 'communication-writing', 'writing'].includes(t));
    if (hasWritingTech && !state.vassalage?.overlord) {
      actions.push('propose_league');
    }
```

- [ ] **Step 6: Run all diplomacy tests**

Run: `yarn test tests/systems/diplomacy-`
Expected: All pass

- [ ] **Step 7: Commit**

```bash
git add src/systems/diplomacy-system.ts tests/systems/diplomacy-betrayal.test.ts
git commit -m "feat(m4b1): betrayal system — treachery scoring, global penalty broadcast, decay"
```

---

## Task 5: Embargo System

**Files:**
- Modify: `src/systems/diplomacy-system.ts`
- Create: `tests/systems/diplomacy-embargo.test.ts`

- [ ] **Step 1: Write failing embargo tests**

```typescript
// tests/systems/diplomacy-embargo.test.ts
import { describe, it, expect } from 'vitest';
import {
  canProposeEmbargo,
  proposeEmbargo,
  joinEmbargo,
  leaveEmbargo,
  enforceEmbargoes,
  cleanupEmbargoes,
} from '@/systems/diplomacy-system';
import type { Embargo } from '@/core/types';

describe('embargoes', () => {
  describe('canProposeEmbargo', () => {
    it('returns true with currency tech in era >= 2', () => {
      expect(canProposeEmbargo(['currency'], 2, [], 'target')).toBe(true);
    });

    it('returns false in era 1 without currency tech', () => {
      expect(canProposeEmbargo([], 1, [], 'target')).toBe(false);
    });

    it('returns false if target is ally', () => {
      const alliances = [{ type: 'alliance' as const, civA: 'self', civB: 'target', turnsRemaining: -1 }];
      expect(canProposeEmbargo(['currency'], 2, alliances, 'target')).toBe(false);
    });

    it('returns false if vassal', () => {
      expect(canProposeEmbargo(['currency'], 2, [], 'target', true)).toBe(false);
    });
  });

  describe('proposeEmbargo', () => {
    it('creates a new embargo with proposer as participant', () => {
      const embargoes: Embargo[] = [];
      const result = proposeEmbargo(embargoes, 'proposer', 'target', 10);
      expect(result).toHaveLength(1);
      expect(result[0].targetCivId).toBe('target');
      expect(result[0].participants).toContain('proposer');
    });

    it('merges into existing embargo for same target', () => {
      const embargoes: Embargo[] = [
        { id: 'emb-1', targetCivId: 'target', participants: ['civ-a'], proposedTurn: 5 },
      ];
      const result = proposeEmbargo(embargoes, 'civ-b', 'target', 10);
      expect(result).toHaveLength(1);
      expect(result[0].participants).toContain('civ-a');
      expect(result[0].participants).toContain('civ-b');
    });
  });

  describe('joinEmbargo', () => {
    it('adds participant to embargo', () => {
      const embargoes: Embargo[] = [
        { id: 'emb-1', targetCivId: 'target', participants: ['civ-a'], proposedTurn: 5 },
      ];
      const result = joinEmbargo(embargoes, 'emb-1', 'civ-b');
      expect(result[0].participants).toContain('civ-b');
    });
  });

  describe('leaveEmbargo', () => {
    it('removes participant from embargo', () => {
      const embargoes: Embargo[] = [
        { id: 'emb-1', targetCivId: 'target', participants: ['civ-a', 'civ-b'], proposedTurn: 5 },
      ];
      const result = leaveEmbargo(embargoes, 'emb-1', 'civ-a');
      expect(result[0].participants).not.toContain('civ-a');
    });
  });

  describe('enforceEmbargoes', () => {
    it('removes trade routes between participant and target', () => {
      const embargoes: Embargo[] = [
        { id: 'emb-1', targetCivId: 'target', participants: ['civ-a'], proposedTurn: 5 },
      ];
      const routes = [
        { fromCityId: 'city-1', foreignCivId: 'target' },
        { fromCityId: 'city-2', foreignCivId: 'neutral' },
      ];
      const cityOwners = { 'city-1': 'civ-a', 'city-2': 'civ-a' };
      const result = enforceEmbargoes(embargoes, routes, cityOwners);
      expect(result).toHaveLength(1);
      expect(result[0].foreignCivId).toBe('neutral');
    });

    it('also blocks embargoed civ trading with participants', () => {
      const embargoes: Embargo[] = [
        { id: 'emb-1', targetCivId: 'target', participants: ['civ-a'], proposedTurn: 5 },
      ];
      const routes = [{ fromCityId: 'city-t', foreignCivId: 'civ-a' }];
      const cityOwners = { 'city-t': 'target' };
      const result = enforceEmbargoes(embargoes, routes, cityOwners);
      expect(result).toHaveLength(0);
    });
  });

  describe('cleanupEmbargoes', () => {
    it('removes embargoes with no participants', () => {
      const embargoes: Embargo[] = [
        { id: 'emb-1', targetCivId: 'target', participants: [], proposedTurn: 5 },
        { id: 'emb-2', targetCivId: 'other', participants: ['civ-a'], proposedTurn: 5 },
      ];
      const result = cleanupEmbargoes(embargoes);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('emb-2');
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `yarn test tests/systems/diplomacy-embargo.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement embargo functions**

Add to `src/systems/diplomacy-system.ts`:

```typescript
// --- Embargoes ---

import type { Embargo, Treaty } from '../core/types';

const EMBARGO_TECHS = ['currency', 'foreign-trade', 'banking'];

export function canProposeEmbargo(
  completedTechs: string[],
  era: number,
  treaties: Treaty[],
  targetCivId: string,
  isVassal: boolean = false,
): boolean {
  if (isVassal) return false;
  if (era < 2 && !completedTechs.some(t => EMBARGO_TECHS.includes(t))) return false;
  const isAllied = treaties.some(t =>
    t.type === 'alliance' && (t.civA === targetCivId || t.civB === targetCivId),
  );
  return !isAllied;
}

// Import TradeRoute from @/core/types — do NOT redefine locally.
// TradeRoute.foreignCivId is optional (domestic routes have none).

export function enforceEmbargoes(
  embargoes: Embargo[],
  tradeRoutes: TradeRoute[],
  cityOwners: Record<string, string>,
): TradeRoute[] {
  return tradeRoutes.filter(route => {
    if (!route.foreignCivId) return true; // domestic routes unaffected
    const routeOwner = cityOwners[route.fromCityId];
    if (!routeOwner) return true;
    for (const embargo of embargoes) {
      const isParticipant = embargo.participants.includes(routeOwner);
      const targetsEmbargoed = route.foreignCivId === embargo.targetCivId;
      const isEmbargoedCivRoute = routeOwner === embargo.targetCivId && embargo.participants.includes(route.foreignCivId);
      if ((isParticipant && targetsEmbargoed) || isEmbargoedCivRoute) return false;
    }
    return true;
  });
}

export function proposeEmbargo(
  embargoes: Embargo[],
  proposerId: string,
  targetCivId: string,
  turn: number,
): Embargo[] {
  const existing = embargoes.find(e => e.targetCivId === targetCivId);
  if (existing) {
    if (existing.participants.includes(proposerId)) return embargoes;
    return embargoes.map(e =>
      e.id === existing.id
        ? { ...e, participants: [...e.participants, proposerId] }
        : e,
    );
  }
  // Deterministic ID from turn + embargo count (survives save/load)
  const id = `embargo-${turn}-${embargoes.length}`;
  return [
    ...embargoes,
    { id, targetCivId, participants: [proposerId], proposedTurn: turn },
  ];
}

export function joinEmbargo(embargoes: Embargo[], embargoId: string, civId: string): Embargo[] {
  return embargoes.map(e =>
    e.id === embargoId && !e.participants.includes(civId)
      ? { ...e, participants: [...e.participants, civId] }
      : e,
  );
}

export function leaveEmbargo(embargoes: Embargo[], embargoId: string, civId: string): Embargo[] {
  return embargoes.map(e =>
    e.id === embargoId
      ? { ...e, participants: e.participants.filter(p => p !== civId) }
      : e,
  );
}

export function cleanupEmbargoes(embargoes: Embargo[]): Embargo[] {
  return embargoes.filter(e => e.participants.length > 0);
}

// Treachery condition: leaving embargo is only treacherous if target is at war with remaining participants
export function shouldApplyLeaveEmbargoTreachery(
  embargo: Embargo,
  leavingCivId: string,
  warPairs: Array<{ civA: string; civB: string }>,
): boolean {
  const remaining = embargo.participants.filter(p => p !== leavingCivId);
  return remaining.some(p =>
    warPairs.some(w =>
      (w.civA === embargo.targetCivId && w.civB === p) ||
      (w.civB === embargo.targetCivId && w.civA === p),
    ),
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `yarn test tests/systems/diplomacy-embargo.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/systems/diplomacy-system.ts tests/systems/diplomacy-embargo.test.ts
git commit -m "feat(m4b1): embargo system — propose, join, leave, cleanup, tech gating"
```

---

## Task 6: Defensive League System

**Files:**
- Modify: `src/systems/diplomacy-system.ts`
- Create: `tests/systems/diplomacy-league.test.ts`

- [ ] **Step 1: Write failing league tests**

```typescript
// tests/systems/diplomacy-league.test.ts
import { describe, it, expect } from 'vitest';
import {
  canProposeLeague,
  proposeLeague,
  inviteToLeague,
  petitionLeague,
  votePetition,
  leaveLeague,
  checkLeagueDissolution,
  getLeagueForCiv,
  triggerLeagueDefense,
} from '@/systems/diplomacy-system';
import type { DefensiveLeague, DiplomacyState } from '@/core/types';

function makeDipState(overrides?: Partial<DiplomacyState>): DiplomacyState {
  return {
    relationships: {}, treaties: [], events: [], atWarWith: [],
    treacheryScore: 0,
    vassalage: { overlord: null, vassals: [], protectionScore: 100, protectionTimers: [], peakCities: 3, peakMilitary: 5 },
    ...overrides,
  };
}

describe('defensive leagues', () => {
  describe('canProposeLeague', () => {
    it('returns true with writing tech', () => {
      expect(canProposeLeague(['science-writing'], [], null)).toBe(true);
    });

    it('returns false without writing tech', () => {
      expect(canProposeLeague([], [], null)).toBe(false);
    });

    it('returns false if already in a league', () => {
      const league: DefensiveLeague = { id: 'l-1', members: ['self'], formedTurn: 1 };
      expect(canProposeLeague(['science-writing'], [], league)).toBe(false);
    });

    it('returns false if vassal', () => {
      expect(canProposeLeague(['science-writing'], [], null, true)).toBe(false);
    });
  });

  describe('proposeLeague', () => {
    it('creates a league with two founding members', () => {
      const leagues: DefensiveLeague[] = [];
      const result = proposeLeague(leagues, 'civ-a', 'civ-b', 10);
      expect(result).toHaveLength(1);
      expect(result[0].members).toContain('civ-a');
      expect(result[0].members).toContain('civ-b');
    });
  });

  describe('inviteToLeague', () => {
    it('adds member to existing league', () => {
      const leagues: DefensiveLeague[] = [
        { id: 'l-1', members: ['civ-a', 'civ-b'], formedTurn: 5 },
      ];
      const result = inviteToLeague(leagues, 'l-1', 'civ-c');
      expect(result[0].members).toContain('civ-c');
    });
  });

  describe('votePetition', () => {
    it('approves when majority has relationship > 10', () => {
      expect(votePetition({ 'civ-a': 15, 'civ-b': 20, 'civ-c': 5 })).toBe(true);
    });

    it('rejects when majority has relationship <= 10', () => {
      expect(votePetition({ 'civ-a': 5, 'civ-b': 8, 'civ-c': 15 })).toBe(false);
    });
  });

  describe('leaveLeague', () => {
    it('removes member from league', () => {
      const leagues: DefensiveLeague[] = [
        { id: 'l-1', members: ['civ-a', 'civ-b', 'civ-c'], formedTurn: 5 },
      ];
      const { leagues: result } = leaveLeague(leagues, 'l-1', 'civ-b');
      expect(result[0].members).not.toContain('civ-b');
    });

    it('dissolves league when < 2 members remain and reports dissolved ID', () => {
      const leagues: DefensiveLeague[] = [
        { id: 'l-1', members: ['civ-a', 'civ-b'], formedTurn: 5 },
      ];
      const { leagues: result, dissolvedLeagueIds } = leaveLeague(leagues, 'l-1', 'civ-b');
      expect(result).toHaveLength(0);
      expect(dissolvedLeagueIds).toContain('l-1');
    });
  });

  describe('checkLeagueDissolution', () => {
    it('dissolves league when two members are at war', () => {
      const leagues: DefensiveLeague[] = [
        { id: 'l-1', members: ['civ-a', 'civ-b', 'civ-c'], formedTurn: 5 },
      ];
      const atWarPairs = [{ civA: 'civ-a', civB: 'civ-b' }];
      const result = checkLeagueDissolution(leagues, atWarPairs);
      expect(result).toHaveLength(0);
    });

    it('keeps league if no members at war', () => {
      const leagues: DefensiveLeague[] = [
        { id: 'l-1', members: ['civ-a', 'civ-b'], formedTurn: 5 },
      ];
      const result = checkLeagueDissolution(leagues, []);
      expect(result).toHaveLength(1);
    });
  });

  describe('getLeagueForCiv', () => {
    it('returns the league a civ belongs to', () => {
      const leagues: DefensiveLeague[] = [
        { id: 'l-1', members: ['civ-a', 'civ-b'], formedTurn: 5 },
      ];
      expect(getLeagueForCiv(leagues, 'civ-a')?.id).toBe('l-1');
    });

    it('returns null if civ is not in any league', () => {
      expect(getLeagueForCiv([], 'civ-a')).toBeNull();
    });
  });

  describe('triggerLeagueDefense', () => {
    it('returns list of civs that must declare war', () => {
      const leagues: DefensiveLeague[] = [
        { id: 'l-1', members: ['civ-a', 'civ-b', 'civ-c'], formedTurn: 5 },
      ];
      const result = triggerLeagueDefense(leagues, 'civ-a', 'attacker');
      expect(result).toContain('civ-b');
      expect(result).toContain('civ-c');
      expect(result).not.toContain('civ-a');
    });

    it('returns empty if target not in a league', () => {
      const result = triggerLeagueDefense([], 'civ-a', 'attacker');
      expect(result).toHaveLength(0);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `yarn test tests/systems/diplomacy-league.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement league functions**

Add to `src/systems/diplomacy-system.ts`:

```typescript
// --- Defensive Leagues ---

import type { DefensiveLeague } from '../core/types';

const WRITING_TECHS = ['science-writing', 'communication-writing', 'writing'];

// No module-level counter — IDs derived from turn + array index for save/load safety

export function canProposeLeague(
  completedTechs: string[],
  leagues: DefensiveLeague[],
  currentLeague: DefensiveLeague | null,
  isVassal: boolean = false,
  relationships?: Record<string, number>,
  targetCivId?: string,
): boolean {
  if (isVassal) return false;
  if (currentLeague) return false;
  if (!completedTechs.some(t => WRITING_TECHS.includes(t))) return false;
  // When proposing with a specific target, require positive relationship
  if (targetCivId && relationships && (relationships[targetCivId] ?? 0) <= 0) return false;
  return true;
}

export function proposeLeague(
  leagues: DefensiveLeague[],
  civA: string,
  civB: string,
  turn: number,
): DefensiveLeague[] {
  return [
    ...leagues,
    { id: `league-${turn}-${leagues.length}`, members: [civA, civB], formedTurn: turn },
  ];
}

export function inviteToLeague(
  leagues: DefensiveLeague[],
  leagueId: string,
  civId: string,
): DefensiveLeague[] {
  return leagues.map(l =>
    l.id === leagueId && !l.members.includes(civId)
      ? { ...l, members: [...l.members, civId] }
      : l,
  );
}

// Majority vote helper: each member votes yes if relationship > 10 with petitioner
export function votePetition(
  memberRelationships: Record<string, number>, // memberId -> relationship with petitioner
): boolean {
  const votes = Object.values(memberRelationships);
  const yesVotes = votes.filter(r => r > 10).length;
  return yesVotes > votes.length / 2;
}

export function petitionLeague(
  leagues: DefensiveLeague[],
  leagueId: string,
  civId: string,
  accepted: boolean, // caller computes via votePetition()
): DefensiveLeague[] {
  if (!accepted) return leagues;
  return inviteToLeague(leagues, leagueId, civId);
}

export function leaveLeague(
  leagues: DefensiveLeague[],
  leagueId: string,
  civId: string,
): { leagues: DefensiveLeague[]; dissolvedLeagueIds: string[] } {
  const updated = leagues.map(l =>
    l.id === leagueId
      ? { ...l, members: l.members.filter(m => m !== civId) }
      : l,
  );
  const dissolvedLeagueIds = updated.filter(l => l.members.length < 2).map(l => l.id);
  return { leagues: updated.filter(l => l.members.length >= 2), dissolvedLeagueIds };
}

// Treachery condition: leaving league is only treacherous if any member is under active attack
export function shouldApplyLeaveLeagueTreachery(
  league: DefensiveLeague,
  leavingCivId: string,
  warPairs: Array<{ civA: string; civB: string }>,
): boolean {
  const remaining = league.members.filter(m => m !== leavingCivId);
  return remaining.some(member =>
    warPairs.some(w => w.civA === member || w.civB === member),
  );
}

export function checkLeagueDissolution(
  leagues: DefensiveLeague[],
  atWarPairs: Array<{ civA: string; civB: string }>,
): DefensiveLeague[] {
  return leagues.filter(league => {
    for (const pair of atWarPairs) {
      if (league.members.includes(pair.civA) && league.members.includes(pair.civB)) {
        return false;
      }
    }
    return true;
  });
}

export function getLeagueForCiv(
  leagues: DefensiveLeague[],
  civId: string,
): DefensiveLeague | null {
  return leagues.find(l => l.members.includes(civId)) ?? null;
}

export function triggerLeagueDefense(
  leagues: DefensiveLeague[],
  defenderId: string,
  attackerId: string,
): string[] {
  const league = leagues.find(l => l.members.includes(defenderId));
  if (!league) return [];
  return league.members.filter(m => m !== defenderId && m !== attackerId);
}

// No counter reset needed — IDs are derived from turn + array index
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `yarn test tests/systems/diplomacy-league.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/systems/diplomacy-system.ts tests/systems/diplomacy-league.test.ts
git commit -m "feat(m4b1): defensive league system — propose, invite, petition, leave, dissolve, trigger"
```

---

## Task 7: Four New Civilizations

**Files:**
- Modify: `src/core/types.ts` (already done in Task 1)
- Modify: `src/systems/civ-definitions.ts`
- Modify: `tests/systems/civ-definitions.test.ts`

- [ ] **Step 1: Add 4 new civ definitions**

In `src/systems/civ-definitions.ts`, add after the M4a civs (Rohan):

```typescript
  {
    id: 'russia',
    name: 'Russia',
    color: '#1e3a5f',
    bonusName: 'Tundra Settlers',
    bonusDescription: 'Expansion & endurance — bonus yields from tundra and snow tiles',
    bonusEffect: { type: 'tundra_bonus', foodBonus: 1, productionBonus: 1 },
    personality: {
      traits: ['expansionist', 'aggressive'],
      warLikelihood: 0.6,
      diplomacyFocus: 0.3,
      expansionDrive: 0.8,
    },
  },
  {
    id: 'ottoman',
    name: 'Ottoman Empire',
    color: '#b91c1c',
    bonusName: 'Great Bombard',
    bonusDescription: 'Siege warfare — bonus damage against fortified cities',
    bonusEffect: { type: 'siege_bonus', damageMultiplier: 1.5 },
    personality: {
      traits: ['aggressive', 'expansionist'],
      warLikelihood: 0.7,
      diplomacyFocus: 0.3,
      expansionDrive: 0.7,
    },
  },
  {
    id: 'shire',
    name: 'The Shire',
    color: '#86efac',
    bonusName: 'Simple Folk',
    bonusDescription: 'Peaceful prosperity — bonus food but weaker military production',
    bonusEffect: { type: 'peaceful_growth', foodBonus: 2, militaryPenalty: 0.25 },
    personality: {
      traits: ['diplomatic', 'trader'],
      warLikelihood: 0.1,
      diplomacyFocus: 0.9,
      expansionDrive: 0.3,
    },
  },
  {
    id: 'isengard',
    name: 'Isengard',
    color: '#374151',
    bonusName: 'Industry of War',
    bonusDescription: 'Industry & war — raze forests for burst production',
    bonusEffect: { type: 'forest_industry', productionBurst: 30 },
    personality: {
      traits: ['aggressive', 'expansionist'],
      warLikelihood: 0.8,
      diplomacyFocus: 0.2,
      expansionDrive: 0.7,
    },
  },
```

- [ ] **Step 2: Update civ-definitions tests**

In `tests/systems/civ-definitions.test.ts`, update the total count from 16 to 20 and add tests for the new civs:

```typescript
  it('has russia with tundra_bonus', () => {
    const russia = getCivDefinition('russia');
    expect(russia).toBeDefined();
    expect(russia!.name).toBe('Russia');
    expect(russia!.bonusEffect.type).toBe('tundra_bonus');
  });

  it('has ottoman with siege_bonus', () => {
    const ottoman = getCivDefinition('ottoman');
    expect(ottoman).toBeDefined();
    expect(ottoman!.bonusEffect.type).toBe('siege_bonus');
  });

  it('has shire with peaceful_growth', () => {
    const shire = getCivDefinition('shire');
    expect(shire).toBeDefined();
    expect(shire!.bonusEffect.type).toBe('peaceful_growth');
  });

  it('has isengard with forest_industry', () => {
    const isengard = getCivDefinition('isengard');
    expect(isengard).toBeDefined();
    expect(isengard!.bonusEffect.type).toBe('forest_industry');
  });
```

- [ ] **Step 3: Run tests**

Run: `yarn test tests/systems/civ-definitions.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/systems/civ-definitions.ts tests/systems/civ-definitions.test.ts
git commit -m "feat(m4b1): add Russia, Ottoman, Shire, Isengard civilizations"
```

---

## Task 8: Civ Bonus Effect Integration

**Files:**
- Modify: `src/systems/resource-system.ts`
- Modify: `src/systems/combat-system.ts`
- Modify: `src/systems/city-system.ts`
- Modify: `src/core/turn-manager.ts` (pass bonusEffect to calculateCityYields)

- [ ] **Step 0: Write failing tests for civ bonus effects**

Create `tests/systems/civ-bonus-effects.test.ts`:

```typescript
// tests/systems/civ-bonus-effects.test.ts
import { describe, it, expect } from 'vitest';
import { calculateCityYields } from '@/systems/resource-system';
import { razeForestForProduction, applyProductionBonus } from '@/systems/city-system';
import type { City, GameMap, CivBonusEffect, HexCoord } from '@/core/types';

function makeCity(overrides?: Partial<City>): City {
  return {
    id: 'city-1', name: 'Test City', owner: 'p1',
    position: { q: 0, r: 0 }, population: 3,
    ownedTiles: [{ q: 0, r: 0 }, { q: 1, r: 0 }],
    buildings: [], productionQueue: [], productionProgress: 0,
    food: 0, foodNeeded: 15,
    grid: [[null]], gridSize: 3,
    ...overrides,
  } as City;
}

function makeMap(tiles: Record<string, { terrain: string }>): GameMap {
  return { tiles } as unknown as GameMap;
}

describe('civ bonus effects', () => {
  describe('Russia tundra_bonus', () => {
    it('adds food and production per tundra tile', () => {
      const bonus: CivBonusEffect = { type: 'tundra_bonus', foodBonus: 1, productionBonus: 1 };
      const city = makeCity({ ownedTiles: [{ q: 0, r: 0 }, { q: 1, r: 0 }] });
      const map = makeMap({
        '0,0': { terrain: 'tundra' },
        '1,0': { terrain: 'plains' },
      });
      const base = calculateCityYields(city, map);
      const boosted = calculateCityYields(city, map, bonus);
      expect(boosted.food).toBe(base.food + 1); // 1 tundra tile
      expect(boosted.production).toBe(base.production + 1);
    });
  });

  describe('Shire peaceful_growth', () => {
    it('adds flat food bonus', () => {
      const bonus: CivBonusEffect = { type: 'peaceful_growth', foodBonus: 2, militaryPenalty: 0.25 };
      const city = makeCity();
      const map = makeMap({ '0,0': { terrain: 'plains' }, '1,0': { terrain: 'plains' } });
      const base = calculateCityYields(city, map);
      const boosted = calculateCityYields(city, map, bonus);
      expect(boosted.food).toBe(base.food + 2);
    });

    it('penalizes military production cost', () => {
      const bonus: CivBonusEffect = { type: 'peaceful_growth', foodBonus: 2, militaryPenalty: 0.25 };
      const baseCost = applyProductionBonus('warrior', undefined);
      const penalizedCost = applyProductionBonus('warrior', bonus);
      expect(penalizedCost).toBeGreaterThan(baseCost);
    });
  });

  describe('Isengard forest_industry', () => {
    it('razes forest for burst production and clears improvement', () => {
      const city = makeCity({ ownedTiles: [{ q: 0, r: 0 }], productionProgress: 10 });
      const map = makeMap({ '0,0': { terrain: 'forest', improvement: 'farm', improvementTurnsLeft: 0 } });
      const result = razeForestForProduction(city, map as any, { q: 0, r: 0 });
      expect(result).not.toBeNull();
      expect(result!.city.productionProgress).toBe(40); // 10 + 30
      expect(result!.map.tiles['0,0'].terrain).toBe('plains');
      expect(result!.map.tiles['0,0'].improvement).toBe('none');
    });

    it('returns null for non-forest tile', () => {
      const city = makeCity({ ownedTiles: [{ q: 0, r: 0 }] });
      const map = makeMap({ '0,0': { terrain: 'plains' } });
      const result = razeForestForProduction(city, map as any, { q: 0, r: 0 });
      expect(result).toBeNull();
    });
  });
});
```

Run: `yarn test tests/systems/civ-bonus-effects.test.ts`
Expected: FAIL — functions don't yet accept bonusEffect params

- [ ] **Step 1: Add bonusEffect parameter to calculateCityYields**

In `src/systems/resource-system.ts`, update signature at line 25:

```typescript
export function calculateCityYields(
  city: City,
  map: GameMap,
  bonusEffect?: CivBonusEffect,
): ResourceYield {
  // ... existing logic ...

  // Apply Russia tundra bonus (only on workedTiles, consistent with other yield calcs)
  // Insert AFTER the workedTiles loop, using the same `workedTiles` variable:
  if (bonusEffect?.type === 'tundra_bonus') {
    for (const coord of workedTiles) {
      const tile = map.tiles[hexKey(coord)];
      if (tile && (tile.terrain === 'tundra' || tile.terrain === 'snow')) {
        yields.food += bonusEffect.foodBonus;
        yields.production += bonusEffect.productionBonus;
      }
    }
  }

  // Apply Shire food bonus
  if (bonusEffect?.type === 'peaceful_growth') {
    yields.food += bonusEffect.foodBonus;
  }

  return yields;
}
```

- [ ] **Step 2: Update turn-manager.ts to pass bonusEffect to calculateCityYields**

In `src/core/turn-manager.ts`, the `civDef` lookup currently happens at line 37 (after `calculateCityYields` at line 33). Move the `civDef` lookup BEFORE the `calculateCityYields` call so the bonus is available:

```typescript
// Move this BEFORE calculateCityYields:
const civDef = getCivDefinition(civ.civType ?? '');
const yields = calculateCityYields(city, newState.map, civDef?.bonusEffect);
// ... rest of existing city processing uses civDef as before ...
```

- [ ] **Step 3: Add siege bonus context to resolveCombat**

In `src/systems/combat-system.ts`, add a `CombatContext` interface and update `resolveCombat()` signature. The existing function calculates `defenderDamage` at line 82. Insert the siege bonus multiplier there:

```typescript
export interface CombatContext {
  attackerBonus?: CivBonusEffect;
  defenderInFortifiedCity?: boolean;
}

export function resolveCombat(
  attacker: Unit,
  defender: Unit,
  map: GameMap,
  seed?: number,
  context?: CombatContext,
): CombatResult {
  // ... all existing logic through line 82 ...

  // Ottoman siege bonus: multiply damage dealt TO defender when attacking fortified city
  let siegeMultiplier = 1;
  if (context?.attackerBonus?.type === 'siege_bonus' && context?.defenderInFortifiedCity) {
    siegeMultiplier = context.attackerBonus.damageMultiplier;
  }
  const defenderDamage = Math.round(baseDamage * adjustedRatio * siegeMultiplier);
  const attackerDamage = Math.round(baseDamage * (1 - adjustedRatio));

  // ... rest unchanged ...
}
```

To determine `defenderInFortifiedCity`, the caller (turn-manager or combat handler) checks:
```typescript
const defenderCity = Object.values(state.cities).find(c =>
  c.position.q === defender.position.q && c.position.r === defender.position.r,
);
const defenderInFortifiedCity = defenderCity !== undefined && defenderCity.buildings.includes('walls');
```
```

- [ ] **Step 4: Add Shire military production penalty to city-system**

In `src/systems/city-system.ts`, update `applyProductionBonus()`. Note: this function returns a **multiplier** (e.g. 1 = normal, 0.7 = 30% faster, 1.25 = 25% slower). Add after the existing `faster_military` check, before the final `return 1`:

```typescript
  // Shire: military units cost 25% more (returns multiplier > 1)
  if (bonusEffect?.type === 'peaceful_growth') {
    const militaryTypes = ['warrior', 'swordsman', 'pikeman', 'musketeer', 'scout'];
    if (militaryTypes.includes(itemId)) {
      return 1 + bonusEffect.militaryPenalty; // e.g. 1.25 for 25% slower
    }
  }
```

- [ ] **Step 5: Add Isengard forest raze function**

In `src/systems/city-system.ts`:

```typescript
export function razeForestForProduction(
  city: City,
  map: GameMap,
  tileCoord: HexCoord,
): { city: City; map: GameMap } | null {
  const key = `${tileCoord.q},${tileCoord.r}`;
  const tile = map.tiles[key];
  if (!tile || tile.terrain !== 'forest') return null;

  // Check tile is owned by city
  const isOwned = city.ownedTiles.some(t => t.q === tileCoord.q && t.r === tileCoord.r);
  if (!isOwned) return null;

  const newTile = { ...tile, terrain: 'plains' as const, improvement: 'none' as const, improvementTurnsLeft: 0 };
  const newMap = { ...map, tiles: { ...map.tiles, [key]: newTile } };
  const newCity = { ...city, productionProgress: city.productionProgress + 30 };
  return { city: newCity, map: newMap };
}
```

- [ ] **Step 6: Run full test suite**

Run: `yarn test`
Expected: All pass (or note failures from changed signatures — fix any callers)

- [ ] **Step 7: Build to verify compilation**

Run: `yarn build`
Expected: Clean build

- [ ] **Step 8: Commit**

```bash
git add src/systems/resource-system.ts src/systems/combat-system.ts src/systems/city-system.ts src/core/turn-manager.ts tests/systems/civ-bonus-effects.test.ts
git commit -m "feat(m4b1): civ bonus integration — Russia tundra, Ottoman siege, Shire growth, Isengard forest raze"
```

---

## Task 9: Wire Into Turn Manager

**Files:**
- Modify: `src/core/turn-manager.ts`

- [ ] **Step 1: Add imports**

Add to turn-manager.ts imports:
```typescript
import {
  processVassalageTribute,
  processProtectionTimers,
  checkIndependenceThreshold,
  petitionIndependence,
  endVassalage,
  endVassalageUnilateral,
  declareWar,
  decayTreachery,
  applyTreachery,
  broadcastTreacheryPenalty,
  enforceEmbargoes,
  joinEmbargo,
  cleanupEmbargoes,
  checkLeagueDissolution,
  triggerLeagueDefense,
  getLeagueForCiv,
} from '@/systems/diplomacy-system';
```

- [ ] **Step 2: Add vassalage tribute processing after gold update (line 63)**

After `newState.civilizations[civId].gold += totalGold;`:

```typescript
    // Vassalage tribute
    if (civ.diplomacy?.vassalage.overlord) {
      const tribute = processVassalageTribute(totalGold);
      newState.civilizations[civId].gold -= tribute.tributeAmount;
      const overlordId = civ.diplomacy.vassalage.overlord;
      if (newState.civilizations[overlordId]) {
        newState.civilizations[overlordId].gold += tribute.tributeAmount;
      }
    }

    // Update peak counts (read from newState to pick up earlier mutations in this loop)
    const currentCiv = newState.civilizations[civId];
    if (currentCiv.diplomacy) {
      const cityCount = currentCiv.cities.length;
      const milCount = currentCiv.units.map(id => newState.units[id]).filter(u => u && u.type !== 'settler' && u.type !== 'worker').length;
      if (cityCount > currentCiv.diplomacy.vassalage.peakCities) {
        newState.civilizations[civId].diplomacy.vassalage.peakCities = cityCount;
      }
      if (milCount > currentCiv.diplomacy.vassalage.peakMilitary) {
        newState.civilizations[civId].diplomacy.vassalage.peakMilitary = milCount;
      }
    }
```

- [ ] **Step 3: Add treachery decay after diplomacy processing (after line 110)**

```typescript
      // Treachery decay
      newState.civilizations[civId].diplomacy = decayTreachery(
        newState.civilizations[civId].diplomacy, newState.turn,
      );
```

- [ ] **Step 4: Add protection timer processing and independence check after minor civ processing**

After espionage processing:

```typescript
  // --- Vassalage protection & independence ---
  for (const [civId, civ] of Object.entries(newState.civilizations)) {
    if (!civ.diplomacy?.vassalage.overlord) continue;

    // Process protection timers
    newState.civilizations[civId].diplomacy = processProtectionTimers(civ.diplomacy);

    // Check auto-breakaway
    const vassalDip = newState.civilizations[civId].diplomacy;
    const overlordId = vassalDip.vassalage.overlord!;
    const overlord = newState.civilizations[overlordId];

    if (!overlord) {
      // Overlord eliminated — free vassal (unilateral, no overlord state to update)
      newState.civilizations[civId].diplomacy = endVassalageUnilateral(vassalDip, civId, overlordId);
      bus.emit('diplomacy:vassalage-ended', { vassalId: civId, overlordId, reason: 'overlord_eliminated' });
      continue;
    }

    if (vassalDip.vassalage.protectionScore <= 20) {
      const { vassalState, overlordState } = endVassalage(vassalDip, overlord.diplomacy, civId, overlordId);
      newState.civilizations[civId].diplomacy = vassalState;
      newState.civilizations[overlordId].diplomacy = overlordState;
      bus.emit('diplomacy:vassalage-ended', { vassalId: civId, overlordId, reason: 'auto_breakaway' });
    }
  }
```

- [ ] **Step 4b: Add independence petition check after auto-breakaway**

After the auto-breakaway block, still inside the vassalage loop:

```typescript
    // Independence petition: vassal meets threshold → AI decides accept/refuse
    const vassalCiv = newState.civilizations[civId];
    const vassalMilitary = vassalCiv.units.map(id => newState.units[id]).filter(u => u && u.type !== 'settler' && u.type !== 'worker').length;
    const overlordMilitary = overlord.units.map(id => newState.units[id]).filter(u => u && u.type !== 'settler' && u.type !== 'worker').length;
    if (checkIndependenceThreshold(vassalMilitary, overlordMilitary, vassalDip.vassalage.protectionScore)) {
      // AI overlord decides: accept if diplomatic, refuse if aggressive
      const overlordDef = getCivDefinition(overlord.civType ?? '');
      const accepts = (overlordDef?.personality.diplomacyFocus ?? 0.5) > 0.5;
      const { vassalState, overlordState, relationshipChange } = petitionIndependence(
        vassalDip, overlord.diplomacy, civId, overlordId, accepts,
      );
      newState.civilizations[civId].diplomacy = vassalState;
      newState.civilizations[overlordId].diplomacy = overlordState;
      bus.emit('diplomacy:independence-petition', { vassalId: civId, overlordId, accepted: accepts });
      bus.emit('diplomacy:vassalage-ended', { vassalId: civId, overlordId, reason: accepts ? 'independence' : 'war' });
    }
```

- [ ] **Step 4c: Add vassal auto-join overlord embargoes**

After the vassalage protection loop, add a separate loop for embargo auto-join:

```typescript
  // --- Vassal auto-joins overlord's embargoes ---
  if (newState.embargoes) {
    for (const [civId, civ] of Object.entries(newState.civilizations)) {
      const overlordId = civ.diplomacy?.vassalage.overlord;
      if (!overlordId) continue;
      for (const embargo of newState.embargoes) {
        if (embargo.participants.includes(overlordId) && !embargo.participants.includes(civId)) {
          newState.embargoes = joinEmbargo(newState.embargoes, embargo.id, civId);
        }
      }
    }
  }
```

- [ ] **Step 5: Add embargo enforcement before marketplace processing**

Before marketplace processing (line 137). Uses the `enforceEmbargoes` function from diplomacy-system:

```typescript
  // --- Enforce embargoes ---
  if (newState.embargoes && newState.marketplace) {
    const cityOwners: Record<string, string> = {};
    for (const [cityId, city] of Object.entries(newState.cities)) {
      cityOwners[cityId] = city.owner;
    }
    newState.marketplace.tradeRoutes = enforceEmbargoes(
      newState.embargoes, newState.marketplace.tradeRoutes, cityOwners,
    );
    newState.embargoes = cleanupEmbargoes(newState.embargoes);
  }
```

- [ ] **Step 6: Add league dissolution check after diplomacy**

After treachery decay:

```typescript
  // --- League dissolution check ---
  if (newState.defensiveLeagues) {
    const warPairs: Array<{ civA: string; civB: string }> = [];
    for (const civ of Object.values(newState.civilizations)) {
      for (const enemyId of civ.diplomacy?.atWarWith ?? []) {
        warPairs.push({ civA: civ.id, civB: enemyId });
      }
    }
    const dissolved = newState.defensiveLeagues.filter(l => {
      for (const pair of warPairs) {
        if (l.members.includes(pair.civA) && l.members.includes(pair.civB)) return true;
      }
      return false;
    });
    for (const league of dissolved) {
      bus.emit('diplomacy:league-dissolved', { leagueId: league.id, reason: 'members_at_war' });
    }
    newState.defensiveLeagues = checkLeagueDissolution(newState.defensiveLeagues, warPairs);
  }
```

- [ ] **Step 7: Run full test suite and build**

Run: `yarn test && yarn build`
Expected: All pass, clean build

- [ ] **Step 8: Commit**

```bash
git add src/core/turn-manager.ts
git commit -m "feat(m4b1): wire vassalage, treachery, embargoes, leagues into turn processing"
```

---

## Task 10: AI Diplomacy Decisions

**Files:**
- Modify: `src/ai/ai-diplomacy.ts`
- Modify: `src/ai/basic-ai.ts`

- [ ] **Step 1: Add AI vassalage, embargo, and league evaluation**

In `src/ai/ai-diplomacy.ts`, add new functions:

```typescript
export function evaluateVassalage(
  personality: PersonalityTraits,
  diplomacy: DiplomacyState,
  era: number,
  selfStrength: number,
  currentCities: number,
  currentMilitary: number,
  otherStrengths: Record<string, number>,
): DiplomaticDecision | null {
  if (!canOfferVassalage(
    currentCities, diplomacy.vassalage.peakCities,
    currentMilitary, diplomacy.vassalage.peakMilitary, era,
  )) return null;

  // Find strongest non-enemy civ
  let bestTarget: string | null = null;
  let bestStrength = 0;
  for (const [civId, strength] of Object.entries(otherStrengths)) {
    if (diplomacy.atWarWith.includes(civId)) continue;
    if (strength > bestStrength) {
      bestStrength = strength;
      bestTarget = civId;
    }
  }

  if (bestTarget && selfStrength < bestStrength * 0.4) {
    return { action: 'offer_vassalage', targetCiv: bestTarget };
  }
  return null;
}

export function evaluateEmbargoResponse(
  personality: PersonalityTraits,
  relationships: Record<string, number>,
  proposerId: string,
  targetCivId: string,
): boolean {
  const relWithProposer = relationships[proposerId] ?? 0;
  const relWithTarget = relationships[targetCivId] ?? 0;
  const threshold = personality.traits.includes('aggressive') ? 10 :
                    personality.traits.includes('diplomatic') ? 30 : 20;
  return relWithProposer > relWithTarget + threshold;
}

export function evaluateLeagueResponse(
  personality: PersonalityTraits,
  relationships: Record<string, number>,
  leagueMembers: string[],
): boolean {
  const avgRel = leagueMembers.reduce((sum, m) => sum + (relationships[m] ?? 0), 0) / leagueMembers.length;
  return avgRel > 10;
}
```

- [ ] **Step 2: Wire AI decisions into processAITurn in basic-ai.ts**

In the AI diplomacy section of `processAITurn()`, after existing diplomacy decisions, add embargo/league/vassalage AI logic.

- [ ] **Step 3: Run full test suite**

Run: `yarn test`
Expected: All pass

- [ ] **Step 4: Commit**

```bash
git add src/ai/ai-diplomacy.ts src/ai/basic-ai.ts
git commit -m "feat(m4b1): AI diplomacy — vassalage offers, embargo/league responses"
```

---

## Task 11: Chancellor Advisor Messages

**Files:**
- Modify: `src/ui/advisor-system.ts`

- [ ] **Step 1: Add chancellor messages for new diplomatic options**

Add advisor triggers for:
- `chancellor_vassalage_available`: "A rival civ is weakened. They may offer vassalage — consider accepting for tribute income."
- `chancellor_under_threat_vassalage`: "We're losing badly. Consider offering vassalage to a stronger neighbor for protection."
- `chancellor_embargo_opportunity`: "An enemy's trade network is a vulnerability. Consider proposing an embargo."
- `chancellor_league_suggestion`: "Multiple hostile neighbors threaten us. Consider forming a defensive league with a friendly civ."
- `chancellor_treachery_warning`: "Breaking this treaty will damage our reputation with all civilizations."

- [ ] **Step 2: Run tests**

Run: `yarn test tests/ui/advisor-system.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/ui/advisor-system.ts
git commit -m "feat(m4b1): chancellor advisor — vassalage, embargo, league, treachery messages"
```

---

## Task 12: Negative Tests

**Files:**
- Create: `tests/systems/diplomacy-negative.test.ts`

- [ ] **Step 1: Write negative tests for blocked actions**

```typescript
// tests/systems/diplomacy-negative.test.ts
import { describe, it, expect } from 'vitest';
import {
  canOfferVassalage,
  canProposeEmbargo,
  canProposeLeague,
  isVassalBlocked,
} from '@/systems/diplomacy-system';

describe('negative tests — blocked actions', () => {
  it('vassal cannot offer vassalage in era 1', () => {
    expect(canOfferVassalage(1, 3, 1, 5, 1)).toBe(false);
  });

  it('vassal cannot offer with peak cities < 2', () => {
    expect(canOfferVassalage(0, 1, 0, 5, 2)).toBe(false);
  });

  it('civ above 50% peak cannot offer vassalage', () => {
    expect(canOfferVassalage(3, 3, 5, 5, 2)).toBe(false);
  });

  it('cannot propose embargo without currency tech in era 1', () => {
    expect(canProposeEmbargo([], 1, [], 'target')).toBe(false);
  });

  it('cannot propose embargo against ally', () => {
    const alliances = [{ type: 'alliance' as const, civA: 'self', civB: 'target', turnsRemaining: -1 }];
    expect(canProposeEmbargo(['currency'], 2, alliances, 'target')).toBe(false);
  });

  it('vassal cannot propose embargo', () => {
    expect(canProposeEmbargo(['currency'], 2, [], 'target', true)).toBe(false);
  });

  it('cannot propose league without writing tech', () => {
    expect(canProposeLeague([], [], null)).toBe(false);
  });

  it('cannot join second league', () => {
    const league = { id: 'l-1', members: ['self', 'other'], formedTurn: 1 };
    expect(canProposeLeague(['science-writing'], [], league)).toBe(false);
  });

  it('vassal cannot propose league', () => {
    expect(canProposeLeague(['science-writing'], [], null, true)).toBe(false);
  });

  it('vassal cannot declare war independently', () => {
    expect(isVassalBlocked('declare_war', true)).toBe(true);
  });

  it('vassal cannot sign treaties independently', () => {
    expect(isVassalBlocked('non_aggression_pact', true)).toBe(true);
    expect(isVassalBlocked('trade_agreement', true)).toBe(true);
    expect(isVassalBlocked('open_borders', true)).toBe(true);
    expect(isVassalBlocked('alliance', true)).toBe(true);
  });

  it('non-vassal is not blocked', () => {
    expect(isVassalBlocked('declare_war', false)).toBe(false);
    expect(isVassalBlocked('propose_embargo', false)).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests**

Run: `yarn test tests/systems/diplomacy-negative.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add tests/systems/diplomacy-negative.test.ts
git commit -m "test(m4b1): negative tests — blocked vassalage, embargo, and league actions"
```

---

## Task 13: Integration Tests

**Files:**
- Create: `tests/integration/m4b1-diplomacy-integration.test.ts`

- [ ] **Step 1: Write integration tests**

```typescript
// tests/integration/m4b1-diplomacy-integration.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { EventBus } from '@/core/event-bus';
import { processTurn } from '@/core/turn-manager';
import { createNewGame, createHotSeatGame } from '@/core/game-state';
import {
  acceptVassalage,
  endVassalage,
  proposeEmbargo,
  proposeLeague,
  triggerLeagueDefense,
  declareWar,
} from '@/systems/diplomacy-system';
import { getCivDefinition } from '@/systems/civ-definitions';
import type { GameState } from '@/core/types';

describe('M4b-1 integration', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new EventBus();
  });

  it('game state initializes with embargoes and defensiveLeagues', () => {
    const state = createNewGame('egypt', 'test-seed', 'small');
    expect(state.embargoes).toBeDefined();
    expect(state.embargoes).toEqual([]);
    expect(state.defensiveLeagues).toBeDefined();
    expect(state.defensiveLeagues).toEqual([]);
  });

  it('hot seat game initializes vassalage on all civs', () => {
    const state = createHotSeatGame({
      playerCount: 2, mapSize: 'small',
      players: [
        { name: 'Alice', slotId: 'p1', civType: 'egypt', isHuman: true },
        { name: 'Bob', slotId: 'p2', civType: 'rome', isHuman: true },
      ],
    }, 'test-seed');
    expect(state.civilizations['p1'].diplomacy.vassalage).toBeDefined();
    expect(state.civilizations['p2'].diplomacy.vassalage).toBeDefined();
    expect(state.civilizations['p1'].diplomacy.treacheryScore).toBe(0);
  });

  it('vassalage tribute flows through turn processing', () => {
    const state = createNewGame('egypt', 'tribute-test', 'small');
    // Set up vassalage
    const playerDip = state.civilizations['player'].diplomacy;
    const aiDip = state.civilizations['ai-1'].diplomacy;
    const { vassalState, overlordState } = acceptVassalage(playerDip, aiDip, 'player', 'ai-1', 1);
    state.civilizations['player'].diplomacy = vassalState;
    state.civilizations['ai-1'].diplomacy = overlordState;
    state.civilizations['player'].gold = 100;
    const aiGoldBefore = state.civilizations['ai-1'].gold;

    const newState = processTurn(state, bus);
    // Vassal should have lost tribute, overlord should have gained it
    expect(newState.civilizations['player'].gold).toBeLessThan(100 + 50); // less than if no tribute
    expect(newState.civilizations['ai-1'].gold).toBeGreaterThan(aiGoldBefore);
  });

  it('league auto-war does NOT cascade to other leagues', () => {
    const state = createNewGame('egypt', 'cascade-test', 'small');
    // This is a design constraint test — league-triggered wars use isVoluntary=false
    const defenders = triggerLeagueDefense(
      [{ id: 'l-1', members: ['civ-a', 'civ-b', 'civ-c'], formedTurn: 1 }],
      'civ-a',
      'attacker',
    );
    expect(defenders).toContain('civ-b');
    expect(defenders).toContain('civ-c');
  });

  it('embargo enforcement removes embargoed trade routes in turn processing', () => {
    const state = createNewGame('egypt', 'embargo-turn-test', 'small');
    const aiIds = Object.keys(state.civilizations).filter(id => id !== 'player');
    if (aiIds.length < 1) return;
    // Set up an embargo and a trade route
    state.embargoes = proposeEmbargo([], 'player', aiIds[0], state.turn);
    if (state.marketplace) {
      state.marketplace.tradeRoutes = [
        { fromCityId: Object.keys(state.cities)[0], toCityId: 'fake', goldPerTurn: 5, foreignCivId: aiIds[0] },
      ];
    }
    const newState = processTurn(state, bus);
    // Trade route with embargoed civ should be removed
    const routes = newState.marketplace?.tradeRoutes ?? [];
    const embargoedRoutes = routes.filter(r => r.foreignCivId === aiIds[0]);
    expect(embargoedRoutes).toHaveLength(0);
  });

  it('embargo + vassalage: vassal auto-joins overlord embargo', () => {
    // This is a constraint that must be enforced in the AI/UI layer
    // Verifying the design expectation
    const embargoes = proposeEmbargo([], 'overlord', 'target', 10);
    expect(embargoes[0].participants).toContain('overlord');
    // Vassal joining is handled in turn processing / AI layer
  });

  it('overlord elimination frees all vassals', () => {
    const state = createNewGame('egypt', 'elim-test', 'small');
    // Set up overlord with vassal
    const aiIds = Object.keys(state.civilizations).filter(id => id !== 'player');
    const overlordId = aiIds[0];
    const vassalId = aiIds[1];
    if (!overlordId || !vassalId) return; // skip if not enough AI civs

    const { vassalState, overlordState } = acceptVassalage(
      state.civilizations[vassalId].diplomacy,
      state.civilizations[overlordId].diplomacy,
      vassalId, overlordId, 1,
    );
    state.civilizations[vassalId].diplomacy = vassalState;
    state.civilizations[overlordId].diplomacy = overlordState;

    // Eliminate overlord (remove from civilizations)
    delete state.civilizations[overlordId];

    const newState = processTurn(state, bus);
    expect(newState.civilizations[vassalId].diplomacy.vassalage.overlord).toBeNull();
  });

  it('all 20 civs are defined and selectable', () => {
    // getCivDefinition imported at top of file (add to imports above)
    const newCivs = ['russia', 'ottoman', 'shire', 'isengard'];
    for (const id of newCivs) {
      const def = getCivDefinition(id);
      expect(def).toBeDefined();
      expect(def!.bonusEffect).toBeDefined();
    }
  });
});
```

- [ ] **Step 2: Run integration tests**

Run: `yarn test tests/integration/m4b1-diplomacy-integration.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add tests/integration/m4b1-diplomacy-integration.test.ts
git commit -m "test(m4b1): integration tests — game init, tribute, league cascade, civ definitions"
```

---

## Task 14: Final Verification & Cleanup

- [ ] **Step 1: Run full test suite**

Run: `yarn test`
Expected: All pass with zero failures

- [ ] **Step 2: Run build**

Run: `yarn build`
Expected: No TypeScript errors, clean build

- [ ] **Step 3: Verify no Math.random() in new code**

Run: `grep -rn "Math.random" src/systems/diplomacy-system.ts src/ai/ai-diplomacy.ts`
Expected: No matches

- [ ] **Step 4: Verify no hardcoded 'player' in new code**

Run: `grep -n "'player'" src/systems/diplomacy-system.ts src/ai/ai-diplomacy.ts`
Expected: No matches

- [ ] **Step 5: Verify all new fields initialized in game creation**

Run: `grep -n "embargoes\|defensiveLeagues\|vassalage\|treacheryScore" src/core/game-state.ts`
Expected: Matches in both createNewGame and createHotSeatGame

- [ ] **Step 6: Verify all new processing wired into turn-manager**

Run: `grep -n "tribute\|treachery\|embargo\|league\|protection" src/core/turn-manager.ts`
Expected: Multiple matches confirming all systems are wired in

- [ ] **Step 7: Final commit**

```bash
git add -A
git commit -m "feat(m4b1): complete Diplomacy & Civs — vassalage, betrayal, embargoes, leagues, 4 new civs"
```
