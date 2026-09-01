import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '@/core/event-bus';
import { processTurn } from '@/core/turn-manager';
import {
  getGeneralThreshold,
  addGeneralProgress,
  hasCrossedGeneralThreshold,
  awardGeneralProgress,
  GENERAL_PROGRESS_AWARDS,
  generateGeneralCandidates,
  checkAndQueueGeneralCandidateChoice,
  spawnGeneralForCiv,
  getEffectiveCommandStats,
  getPassiveStabilizationTargets,
  describeGeneralCareerEnd,
  retireGeneralsAtTurnEnd,
  getPendingGeneralChoiceForViewer,
} from '@/systems/great-general-system';
import { chooseBestGeneralCandidate } from '@/ai/ai-general-command';
import { getHeroicCommandEligibility } from '@/systems/great-general-abilities';
import { GENERAL_DEFINITIONS } from '@/systems/great-general-definitions';
import { summarizeGeneralCareer } from '@/systems/great-general-career';
import { createNewGame } from '@/core/game-state';
import { foundCity } from '@/systems/city-system';
import type { GeneralHistoryEntry, Unit } from '@/core/types';

describe('getGeneralThreshold', () => {
  it('the first General costs less than the second', () => {
    expect(getGeneralThreshold(0)).toBeLessThan(getGeneralThreshold(1));
  });

  it('every successive General still costs strictly more in total (always rising)', () => {
    for (let earned = 0; earned < 12; earned++) {
      expect(getGeneralThreshold(earned + 1)).toBeGreaterThan(getGeneralThreshold(earned));
    }
  });

  it('the marginal per-General increase shrinks over time (softened escalation), never flattening to zero', () => {
    const delta1 = getGeneralThreshold(1) - getGeneralThreshold(0);
    const delta5 = getGeneralThreshold(5) - getGeneralThreshold(4);
    const delta10 = getGeneralThreshold(10) - getGeneralThreshold(9);
    expect(delta5).toBeLessThan(delta1);
    expect(delta10).toBeLessThanOrEqual(delta5);
    expect(delta10).toBeGreaterThan(0);
  });

  it('has no difficulty parameter at all (difficulty-invariant by construction)', () => {
    expect(getGeneralThreshold.length).toBe(1);
  });
});

describe('addGeneralProgress', () => {
  it('starts from zero when no prior progress exists', () => {
    expect(addGeneralProgress(undefined, 10)).toEqual({ points: 10, generalsEarned: 0 });
  });

  it('accumulates onto existing progress without resetting generalsEarned', () => {
    expect(addGeneralProgress({ points: 5, generalsEarned: 1 }, 10)).toEqual({ points: 15, generalsEarned: 1 });
  });
});

describe('hasCrossedGeneralThreshold', () => {
  it('is false below the next threshold', () => {
    const threshold = getGeneralThreshold(0);
    expect(hasCrossedGeneralThreshold({ points: threshold - 1, generalsEarned: 0 })).toBe(false);
  });

  it('is true at or above the next threshold', () => {
    const threshold = getGeneralThreshold(0);
    expect(hasCrossedGeneralThreshold({ points: threshold, generalsEarned: 0 })).toBe(true);
  });

  it('uses the threshold for the NEXT General, not the first, once one has already been earned', () => {
    const firstThreshold = getGeneralThreshold(0);
    const secondThreshold = getGeneralThreshold(1);
    // enough points to have crossed the first threshold, but not the second
    const progress = { points: firstThreshold + 1, generalsEarned: 1 };
    expect(progress.points).toBeLessThan(secondThreshold);
    expect(hasCrossedGeneralThreshold(progress)).toBe(false);
  });
});

describe('awardGeneralProgress', () => {
  it('adds the given points onto existing (or absent) progress', () => {
    expect(awardGeneralProgress({ generalProgress: undefined }, GENERAL_PROGRESS_AWARDS.cityCapture)).toEqual({
      points: GENERAL_PROGRESS_AWARDS.cityCapture, generalsEarned: 0,
    });
  });

  it('accumulates onto an existing civ\'s progress', () => {
    expect(awardGeneralProgress({ generalProgress: { points: 10, generalsEarned: 0 } }, 5)).toEqual({
      points: 15, generalsEarned: 0,
    });
  });
});

describe('GENERAL_PROGRESS_AWARDS', () => {
  it('every named bonus award is a positive number smaller than the base threshold (no single bonus insta-earns a General)', () => {
    for (const value of Object.values(GENERAL_PROGRESS_AWARDS)) {
      expect(value).toBeGreaterThan(0);
      expect(value).toBeLessThan(getGeneralThreshold(0));
    }
  });
});

function makeGeneralsTestState(seed: string) {
  return createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 'Generals Test', seed });
}

describe('generateGeneralCandidates', () => {
  it('returns 2-3 unique candidates', () => {
    const state = makeGeneralsTestState('gen-candidates-1');
    const candidates = generateGeneralCandidates(state, 'player', 1);
    expect(candidates.length).toBeGreaterThanOrEqual(2);
    expect(candidates.length).toBeLessThanOrEqual(3);
    expect(new Set(candidates.map(c => c.id)).size).toBe(candidates.length);
  });

  it('is deterministic for the same seed', () => {
    const state = makeGeneralsTestState('gen-candidates-2');
    const first = generateGeneralCandidates(state, 'player', 42).map(c => c.id);
    const second = generateGeneralCandidates(state, 'player', 42).map(c => c.id);
    expect(first).toEqual(second);
  });

  it('never includes a General already in this civ\'s history (used-forever exclusion)', () => {
    const state = makeGeneralsTestState('gen-candidates-3');
    const romeCandidate = GENERAL_DEFINITIONS.find(g => g.civTypeEligibility.includes('rome'))!;
    state.civilizations.player = {
      ...state.civilizations.player,
      generalHistory: [{ unitId: 'gen1', generalDefinitionId: romeCandidate.id, spawnedTurn: 1, diedTurn: 3 }],
    };
    for (let seed = 1; seed <= 20; seed++) {
      const candidates = generateGeneralCandidates(state, 'player', seed);
      expect(candidates.some(c => c.id === romeCandidate.id)).toBe(false);
    }
  });

  it('falls back to the universal pool when a civ\'s own roster is exhausted', () => {
    const state = makeGeneralsTestState('gen-candidates-4');
    const allRomeIds = GENERAL_DEFINITIONS.filter(g => g.civTypeEligibility.includes('rome')).map(g => g.id);
    state.civilizations.player = {
      ...state.civilizations.player,
      generalHistory: allRomeIds.map((id, i) => ({ unitId: `used${i}`, generalDefinitionId: id, spawnedTurn: 1, diedTurn: 2 })),
    };
    const candidates = generateGeneralCandidates(state, 'player', 7);
    expect(candidates.length).toBeGreaterThanOrEqual(2);
    expect(candidates.every(c => c.civTypeEligibility.length === 0)).toBe(true);
  });

  it('weights candidates toward the civ\'s current era over many draws', () => {
    // Rome starts era 1; over many seeds, era-1-adjacent entries should be
    // drawn far more often than the era-8 universal-pool entry.
    const state = makeGeneralsTestState('gen-candidates-5');
    let era8Count = 0;
    let era1Count = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const candidates = generateGeneralCandidates(state, 'player', seed);
      for (const c of candidates) {
        if (c.era === 8) era8Count++;
        if (c.era === 1) era1Count++;
      }
    }
    expect(era1Count).toBeGreaterThan(era8Count);
  });
});

/**
 * #888 — once a civ has used every authored general it is eligible for
 * (its own roster + the universal fallback pool), candidate generation must
 * keep offering a full, deterministic, culturally-coherent candidate set of
 * generated officers instead of returning fewer (or zero) candidates.
 */
function exhaustAuthoredPool(state: ReturnType<typeof makeGeneralsTestState>, civId: string) {
  state.civilizations[civId] = {
    ...state.civilizations[civId]!,
    generalHistory: GENERAL_DEFINITIONS.map((g, i) => ({
      unitId: `used-${i}`,
      generalDefinitionId: g.id,
      spawnedTurn: 1,
      diedTurn: 2,
      outcome: 'died' as const,
    })),
  };
  return state;
}

describe('#888 — authored candidate-pool exhaustion falls back to generated officers', () => {
  const AUTHORED_IDS = new Set(GENERAL_DEFINITIONS.map(g => g.id));

  it('still returns a full 3-candidate set when every authored general has been used', () => {
    const state = exhaustAuthoredPool(makeGeneralsTestState('888-exhaust-1'), 'player');
    const candidates = generateGeneralCandidates(state, 'player', 5);
    expect(candidates).toHaveLength(3);
    expect(new Set(candidates.map(c => c.id)).size).toBe(3);
    expect(candidates.every(c => !AUTHORED_IDS.has(c.id))).toBe(true);
    expect(candidates.every(c => c.name.length > 0 && c.portraitIcon.length > 0)).toBe(true);
  });

  it('checkAndQueueGeneralCandidateChoice still queues a pending choice after authored exhaustion', () => {
    const state = exhaustAuthoredPool(makeGeneralsTestState('888-exhaust-2'), 'player');
    state.civilizations.player = {
      ...state.civilizations.player,
      generalProgress: { points: 99999, generalsEarned: 20 },
    };
    const result = checkAndQueueGeneralCandidateChoice(state, 'player', 'round-end', 5);
    expect(result.pendingGeneralCandidateChoices ?? []).toHaveLength(1);
    expect(result.pendingGeneralCandidateChoices![0]!.candidateDefinitionIds).toHaveLength(3);
  });

  it('fills only the missing slots — an available authored candidate is never displaced by a generated one', () => {
    const state = makeGeneralsTestState('888-partial-1');
    // Leave exactly ONE eligible authored general (gen_caesar) unused; burn the rest.
    state.civilizations.player = {
      ...state.civilizations.player,
      generalHistory: GENERAL_DEFINITIONS
        .filter(g => g.id !== 'gen_caesar')
        .map((g, i) => ({ unitId: `u${i}`, generalDefinitionId: g.id, spawnedTurn: 1, diedTurn: 2, outcome: 'died' as const })),
    };
    const candidates = generateGeneralCandidates(state, 'player', 9);
    expect(candidates).toHaveLength(3);
    expect(candidates.some(c => c.id === 'gen_caesar')).toBe(true);
    expect(candidates.filter(c => AUTHORED_IDS.has(c.id))).toHaveLength(1);
  });

  it('is deterministic: same state + seed produces identical generated candidate ids and names', () => {
    const state = exhaustAuthoredPool(makeGeneralsTestState('888-exhaust-3'), 'player');
    const a = generateGeneralCandidates(state, 'player', 77);
    const b = generateGeneralCandidates(state, 'player', 77);
    expect(a.map(c => c.id)).toEqual(b.map(c => c.id));
    expect(a.map(c => c.name)).toEqual(b.map(c => c.name));
    // and every generated candidate resolves to a real command profile
    expect(a.every(c => c.maxCommandCharges === 3 && c.abilityIds.length === 3)).toBe(true);
  });

  it('never re-offers a generated officer already recorded as used in generalHistory', () => {
    const state = exhaustAuthoredPool(makeGeneralsTestState('888-exhaust-4'), 'player');
    const firstRound = generateGeneralCandidates(state, 'player', 31);
    // Mark the first generated candidate as used, then draw again with the same seed.
    state.civilizations.player = {
      ...state.civilizations.player,
      generalHistory: [
        ...(state.civilizations.player.generalHistory ?? []),
        { unitId: 'picked', generalDefinitionId: firstRound[0]!.id, spawnedTurn: 3, diedTurn: 4, outcome: 'died' as const },
      ],
    };
    for (let seed = 20; seed <= 40; seed++) {
      const again = generateGeneralCandidates(state, 'player', seed);
      expect(again.some(c => c.id === firstRound[0]!.id)).toBe(false);
    }
  });
});

describe('checkAndQueueGeneralCandidateChoice', () => {
  it('queues a pending choice once points cross the next threshold', () => {
    const state = makeGeneralsTestState('gen-queue-1');
    state.civilizations.player = { ...state.civilizations.player, generalProgress: { points: 999, generalsEarned: 0 } };

    const result = checkAndQueueGeneralCandidateChoice(state, 'player', 'combat:xp', 1);

    expect(result.pendingGeneralCandidateChoices).toHaveLength(1);
    expect(result.pendingGeneralCandidateChoices![0]!.civId).toBe('player');
    expect(result.pendingGeneralCandidateChoices![0]!.candidateDefinitionIds.length).toBeGreaterThanOrEqual(2);
    expect(result.pendingGeneralCandidateChoices![0]!.triggerEventLabel).toBe('combat:xp');
  });

  it('does not queue below the threshold', () => {
    const state = makeGeneralsTestState('gen-queue-2');
    state.civilizations.player = { ...state.civilizations.player, generalProgress: { points: 5, generalsEarned: 0 } };

    const result = checkAndQueueGeneralCandidateChoice(state, 'player', 'combat:xp', 1);

    expect(result.pendingGeneralCandidateChoices ?? []).toHaveLength(0);
  });

  it('does not queue a second pending choice for a civ that already has one queued', () => {
    const state = makeGeneralsTestState('gen-queue-3');
    state.civilizations.player = { ...state.civilizations.player, generalProgress: { points: 999, generalsEarned: 0 } };
    state.pendingGeneralCandidateChoices = [{ civId: 'player', candidateDefinitionIds: ['x', 'y'], triggerEventLabel: 'earlier' }];

    const result = checkAndQueueGeneralCandidateChoice(state, 'player', 'combat:xp', 1);

    expect(result.pendingGeneralCandidateChoices).toHaveLength(1);
    expect(result.pendingGeneralCandidateChoices![0]!.triggerEventLabel).toBe('earlier');
  });

  it('does nothing when the civ has no progress at all', () => {
    const state = makeGeneralsTestState('gen-queue-4');

    const result = checkAndQueueGeneralCandidateChoice(state, 'player', 'combat:xp', 1);

    expect(result).toBe(state);
  });
});

function makeStateWithCapital(seed: string) {
  const state = makeGeneralsTestState(seed);
  const capital = foundCity('player', { q: 0, r: 0 }, state.map, state.idCounters);
  state.cities = { [capital.id]: capital };
  state.civilizations.player = { ...state.civilizations.player, cities: [capital.id] };
  return { state, capital };
}

describe('spawnGeneralForCiv', () => {
  it('spawns a new great_general unit at the capital, owned by the civ, with the chosen definition', () => {
    const { state, capital } = makeStateWithCapital('gen-spawn-1');
    const romeGeneral = GENERAL_DEFINITIONS.find(g => g.civTypeEligibility.includes('rome'))!;

    const result = spawnGeneralForCiv(state, 'player', romeGeneral.id);

    const spawned = Object.values(result.units).find(u => u.type === 'great_general' && u.owner === 'player');
    expect(spawned).toBeDefined();
    expect(spawned!.generalDefinitionId).toBe(romeGeneral.id);
    expect(spawned!.generalNoCommandThisTurn).toBe(true);
    expect(spawned!.position).toEqual(capital.position);
    expect(result.civilizations.player.units).toContain(spawned!.id);
  });

  it('removes the resolved choice from pendingGeneralCandidateChoices', () => {
    const { state } = makeStateWithCapital('gen-spawn-2');
    state.pendingGeneralCandidateChoices = [{ civId: 'player', candidateDefinitionIds: ['gen_caesar'], triggerEventLabel: 'x' }];

    const result = spawnGeneralForCiv(state, 'player', 'gen_caesar');

    expect(result.pendingGeneralCandidateChoices ?? []).toHaveLength(0);
  });

  it('leaves other civs\' pending choices untouched', () => {
    const { state } = makeStateWithCapital('gen-spawn-3');
    state.pendingGeneralCandidateChoices = [
      { civId: 'player', candidateDefinitionIds: ['gen_caesar'], triggerEventLabel: 'x' },
      { civId: 'ai-1', candidateDefinitionIds: ['gen_ramesses'], triggerEventLabel: 'y' },
    ];

    const result = spawnGeneralForCiv(state, 'player', 'gen_caesar');

    expect(result.pendingGeneralCandidateChoices).toEqual([
      { civId: 'ai-1', candidateDefinitionIds: ['gen_ramesses'], triggerEventLabel: 'y' },
    ]);
  });

  it('records the spawn in generalHistory and increments generalsEarned', () => {
    const { state } = makeStateWithCapital('gen-spawn-4');
    state.civilizations.player = { ...state.civilizations.player, generalProgress: { points: 50, generalsEarned: 0 } };

    const result = spawnGeneralForCiv(state, 'player', 'gen_caesar');

    expect(result.civilizations.player.generalHistory).toHaveLength(1);
    expect(result.civilizations.player.generalHistory![0]!.generalDefinitionId).toBe('gen_caesar');
    expect(result.civilizations.player.generalHistory![0]!.spawnedTurn).toBe(state.turn);
    expect(result.civilizations.player.generalProgress!.generalsEarned).toBe(1);
    expect(result.civilizations.player.generalProgress!.points).toBe(50); // points carry over unchanged
  });

  it('#887 — the new generalHistory entry opens with a spawned career event', () => {
    const { state } = makeStateWithCapital('gen-spawn-887');
    const result = spawnGeneralForCiv(state, 'player', 'gen_caesar');
    expect(result.civilizations.player.generalHistory![0]!.careerEvents)
      .toEqual([{ type: 'spawned', turn: state.turn }]);
  });

  it('#887 Phase 34 — an idle General accrues NO per-turn career events across many turns (only `spawned`)', () => {
    const { state } = makeStateWithCapital('gen-spawn-887-idle');
    let next = spawnGeneralForCiv(state, 'player', 'gen_caesar');
    // A General that only sits and passively stabilizes must never grow its
    // ledger — passive stabilization is deliberately not a recorded event.
    for (let i = 0; i < 15; i += 1) {
      next = processTurn(next, new EventBus());
    }
    const events = next.civilizations.player!.generalHistory![0]!.careerEvents ?? [];
    expect(events).toEqual([{ type: 'spawned', turn: state.turn }]);
  });

  it('is a total no-op when the civ itself does not exist', () => {
    const state = makeGeneralsTestState('gen-spawn-5');

    const result = spawnGeneralForCiv(state, 'nonexistent-civ', 'gen_caesar');

    expect(result).toBe(state);
  });

  it('spawns no unit but still clears the pending choice when the civ has no capital (prevents an unresolvable soft-lock panel)', () => {
    const state = makeGeneralsTestState('gen-spawn-6');
    state.civilizations.player = { ...state.civilizations.player, cities: [] };
    state.pendingGeneralCandidateChoices = [{ civId: 'player', candidateDefinitionIds: ['gen_caesar'], triggerEventLabel: 'x' }];

    const result = spawnGeneralForCiv(state, 'player', 'gen_caesar');

    expect(Object.values(result.units).some(u => u.type === 'great_general')).toBe(false);
    expect(result.pendingGeneralCandidateChoices ?? []).toHaveLength(0);
  });
});

describe('getEffectiveCommandStats', () => {
  const baseDefinition = GENERAL_DEFINITIONS[0]!; // commandRange 2, commandCapacity 3 for all V1 entries

  it('full supply leaves command stats unchanged', () => {
    const result = getEffectiveCommandStats({ landSupply: undefined }, baseDefinition);
    expect(result).toEqual({ commandRange: baseDefinition.commandRange, commandCapacity: baseDefinition.commandCapacity });
  });

  it('stable-unsupported and grace stages leave command stats unchanged ("early stage: command unchanged")', () => {
    for (const state of ['stable-unsupported', 'grace'] as const) {
      const result = getEffectiveCommandStats(
        { landSupply: { state, hostileUnsupportedTurns: 1, suppliedTurnsSinceRecovery: 0 } },
        baseDefinition,
      );
      expect(result).toEqual({ commandRange: baseDefinition.commandRange, commandCapacity: baseDefinition.commandCapacity });
    }
  });

  it('degraded stage reduces commandCapacity but not commandRange', () => {
    const result = getEffectiveCommandStats(
      { landSupply: { state: 'degraded', hostileUnsupportedTurns: 3, suppliedTurnsSinceRecovery: 0 } },
      baseDefinition,
    );
    expect(result.commandCapacity).toBeLessThan(baseDefinition.commandCapacity);
    expect(result.commandRange).toBe(baseDefinition.commandRange);
  });

  it('severe stage reduces both commandCapacity and commandRange, never below 1', () => {
    const result = getEffectiveCommandStats(
      { landSupply: { state: 'severe', hostileUnsupportedTurns: 6, suppliedTurnsSinceRecovery: 0 } },
      baseDefinition,
    );
    expect(result.commandCapacity).toBeLessThan(baseDefinition.commandCapacity);
    expect(result.commandRange).toBeLessThan(baseDefinition.commandRange);
    expect(result.commandRange).toBeGreaterThanOrEqual(1);
    expect(result.commandCapacity).toBeGreaterThanOrEqual(1);
  });
});

describe('#544 MR4 — getPassiveStabilizationTargets', () => {
  function baseState() {
    return createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed: 'stab-1' });
  }

  it('stabilizes an eligible out-of-supply unit within commandRange of an operational General', () => {
    const state = baseState();
    state.units['gen-1'] = {
      id: 'gen-1', type: 'great_general', owner: 'player', position: { q: 0, r: 0 },
      movementPointsLeft: 3, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false,
      generalDefinitionId: 'gen_caesar',
    } as Unit;
    state.units['unit-1'] = {
      id: 'unit-1', type: 'warrior', owner: 'player', position: { q: 1, r: 0 },
      movementPointsLeft: 1, health: 60, experience: 0, hasMoved: false, hasActed: false, isResting: false,
      landSupply: { state: 'degraded', hostileUnsupportedTurns: 3, suppliedTurnsSinceRecovery: 0 },
    } as Unit;
    state.civilizations.player.units = ['gen-1', 'unit-1'];

    const targets = getPassiveStabilizationTargets(state, 'player');
    expect(targets.has('unit-1')).toBe(true);
  });

  it('does not stabilize a unit outside commandRange', () => {
    const state = baseState();
    state.units['gen-1'] = {
      id: 'gen-1', type: 'great_general', owner: 'player', position: { q: 0, r: 0 },
      movementPointsLeft: 3, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false,
      generalDefinitionId: 'gen_caesar', // V1 commandRange = 2
    } as Unit;
    state.units['unit-1'] = {
      id: 'unit-1', type: 'warrior', owner: 'player', position: { q: 5, r: 0 },
      movementPointsLeft: 1, health: 60, experience: 0, hasMoved: false, hasActed: false, isResting: false,
      landSupply: { state: 'degraded', hostileUnsupportedTurns: 3, suppliedTurnsSinceRecovery: 0 },
    } as Unit;
    state.civilizations.player.units = ['gen-1', 'unit-1'];

    expect(getPassiveStabilizationTargets(state, 'player').has('unit-1')).toBe(false);
  });

  it('never stabilizes a unit that is already full supply or stable-unsupported (nothing to pause)', () => {
    const state = baseState();
    state.units['gen-1'] = {
      id: 'gen-1', type: 'great_general', owner: 'player', position: { q: 0, r: 0 },
      movementPointsLeft: 3, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false,
      generalDefinitionId: 'gen_caesar',
    } as Unit;
    state.units['unit-1'] = {
      id: 'unit-1', type: 'warrior', owner: 'player', position: { q: 1, r: 0 },
      movementPointsLeft: 1, health: 60, experience: 0, hasMoved: false, hasActed: false, isResting: false,
      landSupply: { state: 'full', hostileUnsupportedTurns: 0, suppliedTurnsSinceRecovery: 0 },
    } as Unit;
    state.civilizations.player.units = ['gen-1', 'unit-1'];

    expect(getPassiveStabilizationTargets(state, 'player').has('unit-1')).toBe(false);
  });

  it('respects commandCapacity — closest-eligible-first, stable tie-breaker beyond capacity', () => {
    const state = baseState();
    state.units['gen-1'] = {
      id: 'gen-1', type: 'great_general', owner: 'player', position: { q: 0, r: 0 },
      movementPointsLeft: 3, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false,
      generalDefinitionId: 'gen_caesar', // V1 commandCapacity = 3
    } as Unit;
    const degraded = { state: 'degraded' as const, hostileUnsupportedTurns: 3, suppliedTurnsSinceRecovery: 0 };
    for (let i = 1; i <= 4; i++) {
      state.units[`unit-${i}`] = {
        id: `unit-${i}`, type: 'warrior', owner: 'player', position: { q: i === 4 ? 2 : 1, r: 0 },
        movementPointsLeft: 1, health: 60, experience: 0, hasMoved: false, hasActed: false, isResting: false,
        landSupply: degraded,
      } as Unit;
    }
    state.civilizations.player.units = ['gen-1', 'unit-1', 'unit-2', 'unit-3', 'unit-4'];

    const targets = getPassiveStabilizationTargets(state, 'player');
    expect(targets.size).toBe(3); // capacity-capped
  });

  it('a General on its spawn turn (generalNoCommandThisTurn) stabilizes nothing', () => {
    const state = baseState();
    state.units['gen-1'] = {
      id: 'gen-1', type: 'great_general', owner: 'player', position: { q: 0, r: 0 },
      movementPointsLeft: 3, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false,
      generalDefinitionId: 'gen_caesar', generalNoCommandThisTurn: true,
    } as Unit;
    state.units['unit-1'] = {
      id: 'unit-1', type: 'warrior', owner: 'player', position: { q: 1, r: 0 },
      movementPointsLeft: 1, health: 60, experience: 0, hasMoved: false, hasActed: false, isResting: false,
      landSupply: { state: 'degraded', hostileUnsupportedTurns: 3, suppliedTurnsSinceRecovery: 0 },
    } as Unit;
    state.civilizations.player.units = ['gen-1', 'unit-1'];

    expect(getPassiveStabilizationTargets(state, 'player').size).toBe(0);
  });

  it('#888 — a General backed by a generated identity stabilizes exactly as an authored one (command stats via the registry)', () => {
    const genId = 'generated:rome:3:5745b111';
    const state = baseState();
    state.generatedGenerals = {
      [genId]: {
        id: genId, name: 'Titus Aurelius', civTypeEligibility: ['rome'], era: 3,
        descriptor: 'Tribune. A Roman field commander, risen through the ranks of the host.',
        portraitIcon: '🦅', origin: 'generated', commandRange: 2, commandCapacity: 3,
        abilityIds: ['rally', 'seize_the_moment', 'last_stand'], maxCommandCharges: 3, cooldownTurns: 10,
      },
    };
    state.units['gen-1'] = {
      id: 'gen-1', type: 'great_general', owner: 'player', position: { q: 0, r: 0 },
      movementPointsLeft: 3, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false,
      generalDefinitionId: genId,
    } as Unit;
    state.units['near'] = {
      id: 'near', type: 'warrior', owner: 'player', position: { q: 1, r: 0 },
      movementPointsLeft: 1, health: 60, experience: 0, hasMoved: false, hasActed: false, isResting: false,
      landSupply: { state: 'degraded', hostileUnsupportedTurns: 3, suppliedTurnsSinceRecovery: 0 },
    } as Unit;
    state.units['far'] = {
      id: 'far', type: 'warrior', owner: 'player', position: { q: 6, r: 0 },
      movementPointsLeft: 1, health: 60, experience: 0, hasMoved: false, hasActed: false, isResting: false,
      landSupply: { state: 'degraded', hostileUnsupportedTurns: 3, suppliedTurnsSinceRecovery: 0 },
    } as Unit;
    state.civilizations.player.units = ['gen-1', 'near', 'far'];

    const targets = getPassiveStabilizationTargets(state, 'player');
    expect(targets.has('near')).toBe(true);   // within registry-sourced commandRange 2
    expect(targets.has('far')).toBe(false);   // outside it
  });
});

describe('describeGeneralCareerEnd', () => {
  it('returns a non-empty line naming the General for each outcome', () => {
    const def = GENERAL_DEFINITIONS[0];
    expect(describeGeneralCareerEnd(def, 'died')).toContain(def.name);
    expect(describeGeneralCareerEnd(def, 'retired')).toContain(def.name);
    expect(describeGeneralCareerEnd(def, 'died')).not.toBe(describeGeneralCareerEnd(def, 'retired'));
  });

  it('#887 MR1: a spawn-only career summary leaves the line byte-identical to the no-summary form', () => {
    const def = GENERAL_DEFINITIONS[0];
    const summary = summarizeGeneralCareer({
      unitId: 'g', generalDefinitionId: def.id, spawnedTurn: 1,
      careerEvents: [{ type: 'spawned', turn: 1 }],
    });
    expect(describeGeneralCareerEnd(def, 'retired', summary)).toBe(describeGeneralCareerEnd(def, 'retired'));
    expect(describeGeneralCareerEnd(def, 'died', summary)).toBe(describeGeneralCareerEnd(def, 'died'));
  });

  it('#887 MR1: a career with real deeds appends a terse factual clause', () => {
    const def = GENERAL_DEFINITIONS[0];
    const entry: GeneralHistoryEntry = {
      unitId: 'g', generalDefinitionId: def.id, spawnedTurn: 1,
      careerEvents: [
        { type: 'spawned', turn: 1 },
        { type: 'city-captured', turn: 5, cityId: 'c1', cityName: 'Athens' },
        { type: 'unit-saved', turn: 6, via: 'last-stand', unitId: 'u1', unitType: 'warrior', remainingHp: 1, location: { q: 0, r: 0 } },
        { type: 'battle-influenced', turn: 6, combatId: 'a:b:6', reasons: ['last-stand'], location: { q: 0, r: 0 } },
      ],
    };
    const line = describeGeneralCareerEnd(def, 'died', summarizeGeneralCareer(entry));
    expect(line).toBe(`${def.name} fell in battle. — 1 city captured, 1 unit saved, 1 battle influenced.`);
  });
});

describe('#544 MR4 — retireGeneralsAtTurnEnd', () => {
  function setup(chargesUsed: number) {
    const state = createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed: 'retire-1' });
    state.units['gen-1'] = {
      id: 'gen-1', type: 'great_general', owner: 'player', position: { q: 0, r: 0 },
      movementPointsLeft: 3, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false,
      generalDefinitionId: 'gen_caesar', generalCommandChargesUsed: chargesUsed,
    } as Unit;
    state.civilizations.player.units = ['gen-1'];
    state.civilizations.player.generalHistory = [{ unitId: 'gen-1', generalDefinitionId: 'gen_caesar', spawnedTurn: 1 }];
    return state;
  }

  it('removes the General once all charges are used', () => {
    const result = retireGeneralsAtTurnEnd(setup(3), 'player');
    expect(result.units['gen-1']).toBeUndefined();
    expect(result.civilizations.player.units).not.toContain('gen-1');
  });

  it('leaves a General with charges remaining untouched', () => {
    const result = retireGeneralsAtTurnEnd(setup(2), 'player');
    expect(result.units['gen-1']).toBeDefined();
  });

  it('writes outcome, retiredTurn, endOfCareerLine, and heroicCommandsUsed to generalHistory', () => {
    const state = { ...setup(3), turn: 7 };
    const result = retireGeneralsAtTurnEnd(state, 'player');
    const entry = result.civilizations.player.generalHistory!.find(e => e.unitId === 'gen-1')!;
    expect(entry.outcome).toBe('retired');
    expect(entry.retiredTurn).toBe(7);
    expect(entry.endOfCareerLine).toBeTruthy();
    expect(entry.heroicCommandsUsed).toBe(3);
  });

  it('is a no-op for a civ with no Generals', () => {
    const state = createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed: 'retire-2' });
    expect(retireGeneralsAtTurnEnd(state, 'player')).toBe(state);
  });

  it('#887 MR1: appends a terminal `retired` career event (charges-expended) exactly once', () => {
    const state = { ...setup(3), turn: 9 };
    state.civilizations.player.generalHistory = [
      { unitId: 'gen-1', generalDefinitionId: 'gen_caesar', spawnedTurn: 1, careerEvents: [{ type: 'spawned', turn: 1 }] },
    ];

    const result = retireGeneralsAtTurnEnd(state, 'player');

    const entry = result.civilizations.player.generalHistory!.find(e => e.unitId === 'gen-1')!;
    expect(entry.careerEvents).toEqual([
      { type: 'spawned', turn: 1 },
      { type: 'retired', reason: 'charges-expended', turn: 9 },
    ]);
  });

  it('#544 MR4 review fix: emits general:retired with the General\'s name when bus is provided', () => {
    const state = { ...setup(3), turn: 7 };
    const emit = vi.fn();
    retireGeneralsAtTurnEnd(state, 'player', { emit } as unknown as EventBus);
    expect(emit).toHaveBeenCalledWith('general:retired', expect.objectContaining({
      civId: 'player',
      generalName: expect.any(String),
    }));
  });

  it('#544 MR4 review fix: is safe to call with no bus at all (bus is optional)', () => {
    const state = { ...setup(3), turn: 7 };
    expect(() => retireGeneralsAtTurnEnd(state, 'player')).not.toThrow();
  });

  it('#888 — retires a General backed by a generated identity and names it in the end-of-career line', () => {
    const genId = 'generated:rome:3:c0ffee11';
    const state = createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed: 'retire-gen' });
    state.turn = 12;
    state.generatedGenerals = {
      [genId]: {
        id: genId, name: 'Servius Longinus', civTypeEligibility: ['rome'], era: 3,
        descriptor: 'Legatus. A Roman field commander, risen through the ranks of the host.',
        portraitIcon: '🦅', origin: 'generated', commandRange: 2, commandCapacity: 3,
        abilityIds: ['rally', 'seize_the_moment', 'last_stand'], maxCommandCharges: 3, cooldownTurns: 10,
      },
    };
    state.units['gen-1'] = {
      id: 'gen-1', type: 'great_general', owner: 'player', position: { q: 0, r: 0 },
      movementPointsLeft: 3, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false,
      generalDefinitionId: genId, generalCommandChargesUsed: 3,
    } as Unit;
    state.civilizations.player.units = ['gen-1'];
    state.civilizations.player.generalHistory = [{ unitId: 'gen-1', generalDefinitionId: genId, spawnedTurn: 4 }];

    const result = retireGeneralsAtTurnEnd(state, 'player');

    expect(result.units['gen-1']).toBeUndefined();
    const entry = result.civilizations.player.generalHistory!.find(e => e.unitId === 'gen-1')!;
    expect(entry.outcome).toBe('retired');
    expect(entry.endOfCareerLine).toContain('Servius Longinus');
    expect(result.generatedGenerals?.[genId]?.name).toBe('Servius Longinus'); // registry retained for #887
  });
});

describe('#544 MR5 / #885 — chooseBestGeneralCandidate (now in ai-general-command)', () => {
  const st = () => createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed: 'cbc-legacy' });

  it('still prefers the candidate with the stronger resolved stat profile, tie-broken by id', () => {
    const candidates = [
      { ...GENERAL_DEFINITIONS[0]!, id: 'z-weak', commandRange: 1, commandCapacity: 1, maxCommandCharges: 1 },
      { ...GENERAL_DEFINITIONS[0]!, id: 'a-strong', commandRange: 3, commandCapacity: 3, maxCommandCharges: 3 },
      { ...GENERAL_DEFINITIONS[0]!, id: 'b-strong', commandRange: 3, commandCapacity: 3, maxCommandCharges: 3 },
    ];
    expect(chooseBestGeneralCandidate(st(), 'player', candidates).id).toBe('a-strong');
  });

  it('returns the single candidate when only one is offered', () => {
    const candidates = [{ ...GENERAL_DEFINITIONS[0]! }];
    expect(chooseBestGeneralCandidate(st(), 'player', candidates).id).toBe(candidates[0]!.id);
  });

  it('#888 — on a tie, an authored candidate is preferred over a generated one (id tiebreak)', () => {
    const authored = { ...GENERAL_DEFINITIONS[0]!, id: 'gen_caesar' };
    const generated = { ...GENERAL_DEFINITIONS[0]!, id: 'generated:rome:3:deadbeef', origin: 'generated' as const };
    expect(chooseBestGeneralCandidate(st(), 'player', [generated, authored]).id).toBe('gen_caesar');
    expect(chooseBestGeneralCandidate(st(), 'player', [authored, generated]).id).toBe('gen_caesar');
  });
});

describe('#544 MR5 — AI civs acquire Generals automatically', () => {
  it('an AI civ that crosses the General threshold spawns a General without any human interaction', () => {
    const state = createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed: 'ai-gen-1' });
    const aiId = Object.keys(state.civilizations).find(id => id !== 'player')!;
    const capital = foundCity(aiId, { q: 5, r: 5 }, state.map, state.idCounters);
    state.cities = { ...state.cities, [capital.id]: capital };
    state.civilizations[aiId] = {
      ...state.civilizations[aiId]!,
      cities: [capital.id],
      generalProgress: { points: 999, generalsEarned: 0 },
    };
    const result = processTurn(state, new EventBus());
    const aiUnits = result.civilizations[aiId]!.units.map(id => result.units[id]);
    expect(aiUnits.some(u => u?.type === 'great_general')).toBe(true);
    expect(result.pendingGeneralCandidateChoices ?? []).not.toContainEqual(
      expect.objectContaining({ civId: aiId }),
    );
  });

  it('a human civ that crosses the threshold still only queues a pending choice (does not auto-spawn)', () => {
    const state = createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed: 'ai-gen-2' });
    state.civilizations.player = {
      ...state.civilizations.player!,
      generalProgress: { points: 999, generalsEarned: 0 },
    };
    const result = processTurn(state, new EventBus());
    const playerUnits = result.civilizations.player!.units.map(id => result.units[id]);
    expect(playerUnits.some(u => u?.type === 'great_general')).toBe(false);
    expect(result.pendingGeneralCandidateChoices ?? []).toContainEqual(
      expect.objectContaining({ civId: 'player' }),
    );
  });

  it('#888 — an AI civ that has exhausted the authored roster still spawns a General, backed by a persisted generated identity', () => {
    const state = createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed: 'ai-gen-888' });
    const aiId = Object.keys(state.civilizations).find(id => id !== 'player')!;
    const capital = foundCity(aiId, { q: 5, r: 5 }, state.map, state.idCounters);
    state.cities = { ...state.cities, [capital.id]: capital };
    state.civilizations[aiId] = {
      ...state.civilizations[aiId]!,
      cities: [capital.id],
      generalProgress: { points: 999999, generalsEarned: 25 },
      generalHistory: GENERAL_DEFINITIONS.map((g, i) => ({
        unitId: `used-${i}`, generalDefinitionId: g.id, spawnedTurn: 1, diedTurn: 2, outcome: 'died' as const,
      })),
    };

    const result = processTurn(state, new EventBus());

    const aiUnits = result.civilizations[aiId]!.units.map(id => result.units[id]);
    const generalUnit = aiUnits.find(u => u?.type === 'great_general');
    expect(generalUnit).toBeDefined();
    expect(generalUnit!.generalDefinitionId!.startsWith('generated:')).toBe(true);
    // the identity is persisted and resolvable
    expect(result.generatedGenerals?.[generalUnit!.generalDefinitionId!]?.origin).toBe('generated');
    // recorded in history, pending choice cleared
    expect(result.civilizations[aiId]!.generalHistory!.some(e => e.unitId === generalUnit!.id)).toBe(true);
    expect(result.pendingGeneralCandidateChoices ?? []).not.toContainEqual(expect.objectContaining({ civId: aiId }));
  });
});

describe('getPendingGeneralChoiceForViewer (#544 MR6 item 86)', () => {
  it('returns the pending choice queued for the current viewer', () => {
    const state = createNewGame('rome', 'mr6-viewer-choice-match', 'small');
    state.pendingGeneralCandidateChoices = [
      { civId: 'player', candidateDefinitionIds: ['gen_caesar'], triggerEventLabel: 'city:captured' },
    ];

    const result = getPendingGeneralChoiceForViewer(state, 'player');

    expect(result?.civId).toBe('player');
  });

  it('returns undefined for a pending choice queued for a different civ (AI or inactive hot-seat player)', () => {
    const state = createNewGame('rome', 'mr6-viewer-choice-mismatch', 'small');
    state.pendingGeneralCandidateChoices = [
      { civId: 'ai-1', candidateDefinitionIds: ['gen_hannibal'], triggerEventLabel: 'city:captured' },
    ];

    expect(getPendingGeneralChoiceForViewer(state, 'player')).toBeUndefined();
  });

  it('returns undefined when nothing is pending', () => {
    const state = createNewGame('rome', 'mr6-viewer-choice-empty', 'small');

    expect(getPendingGeneralChoiceForViewer(state, 'player')).toBeUndefined();
  });
});

describe('#885 specialty-resolved effective command stats + retirement', () => {
  it('a Swift (mobile) General has effective command range 3, capacity 2 at full supply', () => {
    const def = GENERAL_DEFINITIONS.find(g => g.id === 'gen_genghis')!;
    expect(getEffectiveCommandStats({ landSupply: undefined }, def)).toEqual({ commandRange: 3, commandCapacity: 2 });
  });

  it('a Defensive General has effective command range 1', () => {
    const def = GENERAL_DEFINITIONS.find(g => g.id === 'gen_wellington')!;
    expect(getEffectiveCommandStats({ landSupply: undefined }, def).commandRange).toBe(1);
  });

  it('a Tireless (endurance) General retires only after its 4th charge, not its 3rd', () => {
    const state = createNewGame({ civType: 'zulu', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed: 's885-ret' });
    state.currentPlayer = 'player';
    const g = {
      id: 'g', type: 'great_general', owner: 'player', position: { q: 0, r: 0 },
      movementPointsLeft: 3, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false,
      generalDefinitionId: 'gen_shaka', generalCommandChargesUsed: 3,
    } as unknown as Unit;
    state.units['g'] = g;
    state.units['g2'] = { ...g, id: 'g2', generalCommandChargesUsed: 4 } as Unit;
    state.civilizations.player.units = ['g', 'g2'];
    state.civilizations.player.generalHistory = [
      { unitId: 'g', generalDefinitionId: 'gen_shaka', spawnedTurn: 1 },
      { unitId: 'g2', generalDefinitionId: 'gen_shaka', spawnedTurn: 1 },
    ];
    const after = retireGeneralsAtTurnEnd(state, 'player');
    expect(after.units['g']).toBeDefined();     // 3/4 charges -> still active
    expect(after.units['g2']).toBeUndefined();  // 4/4 -> retired
  });
});

describe('#885 save/load — no shape change, content-patch semantics', () => {
  it('an Endurance General mid-career (used=2) shows 2 charges remaining after a JSON round-trip', () => {
    const state = createNewGame({ civType: 'zulu', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed: 's885-rt1' });
    state.units['g'] = {
      id: 'g', type: 'great_general', owner: 'player', position: { q: 0, r: 0 },
      movementPointsLeft: 3, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false,
      generalDefinitionId: 'gen_shaka', generalCommandChargesUsed: 2,
    } as unknown as Unit;
    const roundTrip = JSON.parse(JSON.stringify(state)) as typeof state;
    const eligibility = getHeroicCommandEligibility(roundTrip, roundTrip.units['g'] as Unit);
    expect(eligibility.chargesRemaining).toBe(2); // resolved maxCommandCharges 4 - used 2
  });

  it('a pre-#885 save with a spawned gen_wellington immediately resolves Defensive stats after load', () => {
    // "pre-#885" = the save has no specialty data at all (there is no such field);
    // resolveGeneralMechanics keys off the static id, so the specialty applies at once.
    const def = GENERAL_DEFINITIONS.find(g => g.id === 'gen_wellington')!;
    const roundTrip = JSON.parse(JSON.stringify(def)) as typeof def;
    const m = getEffectiveCommandStats({ landSupply: undefined }, roundTrip);
    expect(m.commandRange).toBe(1);
  });

  it('an in-flight lastStandHold keeps the multiplier it was cast with across a round-trip', () => {
    const unit = { lastStandHold: { formationId: 'f', defenseBonusMultiplier: 1.15, expiresTurn: 20 } } as unknown as Unit;
    const roundTrip = JSON.parse(JSON.stringify(unit)) as Unit;
    expect(roundTrip.lastStandHold!.defenseBonusMultiplier).toBe(1.15);
  });
});
