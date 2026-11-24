import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import { EventBus } from '@/core/event-bus';
import {
  chooseGeneralCommandAction,
  evaluateLastStandOpportunity,
  evaluateRallyOpportunity,
  evaluateSeizeOpportunity,
  getEraGenerals,
  isGeneralInDanger,
  processAIGeneralCommand,
} from '@/ai/ai-general-command';
import { chooseBestGeneralCandidate } from '@/ai/ai-general-command';
import { issueRally } from '@/systems/great-general-abilities';
import { GENERAL_DEFINITIONS } from '@/systems/great-general-definitions';
import type { Unit } from '@/core/types';
import type { GeneralAbilityMoment } from '@/core/types/general-presentation';

function makeGeneral(overrides: Partial<Unit> = {}): Unit {
  return {
    id: 'gen-1', type: 'great_general', owner: 'player', position: { q: 0, r: 0 },
    movementPointsLeft: 3, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false,
    generalDefinitionId: 'gen_hannibal', ...overrides, // #885: default to a generalist so baseline behaviour holds
  } as Unit;
}

describe('#544 MR5 — ai-general-command scaffolding', () => {
  it('getEraGenerals returns only great_general units with a resolvable definition, owned by the given civ', () => {
    const state = createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed: 'scaffold-1' });
    state.units['gen-1'] = makeGeneral();
    state.units['warrior-1'] = {
      id: 'warrior-1', type: 'warrior', owner: 'player', position: { q: 1, r: 0 },
      movementPointsLeft: 1, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false,
    } as Unit;
    state.civilizations.player!.units = ['gen-1', 'warrior-1'];

    const generals = getEraGenerals(state, 'player');
    expect(generals.map(g => g.id)).toEqual(['gen-1']);
  });

  it('getEraGenerals returns an empty array for a civ that does not exist', () => {
    const state = createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed: 'scaffold-1b' });
    expect(getEraGenerals(state, 'nonexistent-civ')).toEqual([]);
  });

  it('#888 — getEraGenerals includes a General backed by a generated (registry) identity', () => {
    const state = createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed: 'scaffold-1c' });
    const genId = 'generated:rome:3:feedface';
    state.generatedGenerals = {
      [genId]: {
        id: genId, name: 'Titus Aurelius', civTypeEligibility: ['rome'], era: 3,
        descriptor: 'Tribune. A Roman field commander, risen through the ranks of the host.',
        portraitIcon: '🦅', origin: 'generated', commandRange: 2, commandCapacity: 3,
        abilityIds: ['rally', 'seize_the_moment', 'last_stand'], maxCommandCharges: 3, cooldownTurns: 10,
      },
    };
    state.units['gen-gen'] = makeGeneral({ id: 'gen-gen', generalDefinitionId: genId });
    state.units['gen-unknown'] = makeGeneral({ id: 'gen-unknown', generalDefinitionId: 'generated:rome:3:00000000' });
    state.civilizations.player!.units = ['gen-gen', 'gen-unknown'];

    // the generated-backed General is returned; the one with no registry record is excluded (defensive filter)
    expect(getEraGenerals(state, 'player').map(g => g.id)).toEqual(['gen-gen']);
  });

  it('isGeneralInDanger is false when no hostile unit is visible nearby', () => {
    const state = createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed: 'scaffold-2' });
    const aiId = Object.keys(state.civilizations).find(id => id !== 'player')!;
    const general = makeGeneral({ owner: aiId, position: { q: 5, r: 5 } });
    state.units['gen-1'] = general;
    state.civilizations[aiId]!.units = ['gen-1'];
    expect(isGeneralInDanger(state, general)).toBe(false);
  });

  it('isGeneralInDanger is true when a visible hostile unit is adjacent', () => {
    const state = createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed: 'scaffold-3' });
    const aiId = Object.keys(state.civilizations).find(id => id !== 'player')!;
    const general = makeGeneral({ owner: aiId, position: { q: 5, r: 5 } });
    state.units['gen-1'] = general;
    state.civilizations[aiId]!.units = ['gen-1'];
    state.civilizations[aiId]!.diplomacy.atWarWith = ['player'];
    state.civilizations.player!.diplomacy.atWarWith = [aiId];

    state.units['enemy-1'] = {
      id: 'enemy-1', type: 'warrior', owner: 'player', position: { q: 6, r: 5 },
      movementPointsLeft: 1, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false,
    } as Unit;
    state.civilizations.player!.units = [...state.civilizations.player!.units, 'enemy-1'];
    state.civilizations[aiId]!.visibility.tiles = Object.fromEntries(
      Object.keys(state.map.tiles).map(key => [key, 'visible' as const]),
    );

    expect(isGeneralInDanger(state, general)).toBe(true);
  });

  it('#544 MR5 review: isGeneralInDanger ignores an adjacent hostile non-combat unit (a worker cannot threaten the General)', () => {
    const state = createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed: 'scaffold-4' });
    const aiId = Object.keys(state.civilizations).find(id => id !== 'player')!;
    const general = makeGeneral({ owner: aiId, position: { q: 5, r: 5 } });
    state.units['gen-1'] = general;
    state.civilizations[aiId]!.units = ['gen-1'];
    state.civilizations[aiId]!.diplomacy.atWarWith = ['player'];
    state.civilizations.player!.diplomacy.atWarWith = [aiId];

    state.units['enemy-worker'] = {
      id: 'enemy-worker', type: 'worker', owner: 'player', position: { q: 6, r: 5 },
      movementPointsLeft: 1, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false,
    } as Unit;
    state.civilizations.player!.units = [...state.civilizations.player!.units, 'enemy-worker'];
    state.civilizations[aiId]!.visibility.tiles = Object.fromEntries(
      Object.keys(state.map.tiles).map(key => [key, 'visible' as const]),
    );

    expect(isGeneralInDanger(state, general)).toBe(false);
  });
});

describe('#544 MR5 — evaluateRallyOpportunity', () => {
  it('returns null when no unit is eligible for Rally (nothing to heal nearby)', () => {
    const state = createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed: 'rally-1' });
    state.units['gen-1'] = makeGeneral();
    state.civilizations.player!.units = ['gen-1'];
    expect(evaluateRallyOpportunity(state, 'gen-1')).toBeNull();
  });

  it('returns a positive-score opportunity that, when executed, matches issueRally directly', () => {
    const state = createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed: 'rally-2' });
    state.units['gen-1'] = makeGeneral();
    state.units['unit-1'] = {
      id: 'unit-1', type: 'warrior', owner: 'player', position: { q: 1, r: 0 },
      movementPointsLeft: 1, health: 40, experience: 0, hasMoved: false, hasActed: false, isResting: false,
      landSupply: { state: 'severe', hostileUnsupportedTurns: 5, suppliedTurnsSinceRecovery: 0 },
    } as Unit;
    state.civilizations.player!.units = ['gen-1', 'unit-1'];

    const opportunity = evaluateRallyOpportunity(state, 'gen-1');
    expect(opportunity).not.toBeNull();
    expect(opportunity!.ability).toBe('rally');
    expect(opportunity!.score).toBeGreaterThan(0);
    const executed = opportunity!.execute(state);
    const direct = issueRally(state, 'gen-1');
    expect(executed.units['unit-1']!.health).toBe(direct.units['unit-1']!.health);
  });

  it('returns null when the General is not eligible (already used all charges)', () => {
    const state = createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed: 'rally-3' });
    state.units['gen-1'] = makeGeneral({ generalCommandChargesUsed: 3 });
    state.units['unit-1'] = {
      id: 'unit-1', type: 'warrior', owner: 'player', position: { q: 1, r: 0 },
      movementPointsLeft: 1, health: 40, experience: 0, hasMoved: false, hasActed: false, isResting: false,
      landSupply: { state: 'severe', hostileUnsupportedTurns: 5, suppliedTurnsSinceRecovery: 0 },
    } as Unit;
    state.civilizations.player!.units = ['gen-1', 'unit-1'];
    expect(evaluateRallyOpportunity(state, 'gen-1')).toBeNull();
  });
});

describe('#544 MR5 — evaluateSeizeOpportunity', () => {
  it('returns null when no unit has already acted nearby', () => {
    const state = createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed: 'seize-1' });
    state.units['gen-1'] = makeGeneral();
    state.civilizations.player!.units = ['gen-1'];
    expect(evaluateSeizeOpportunity(state, 'gen-1')).toBeNull();
  });

  it('scores higher when a combat-capable acted unit is in range than when only a civilian is', () => {
    const state = createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed: 'seize-2' });
    state.units['gen-1'] = makeGeneral();
    state.units['warrior-1'] = {
      id: 'warrior-1', type: 'warrior', owner: 'player', position: { q: 1, r: 0 },
      movementPointsLeft: 0, health: 100, experience: 0, hasMoved: true, hasActed: true, isResting: false,
    } as Unit;
    state.civilizations.player!.units = ['gen-1', 'warrior-1'];
    const combatOpportunity = evaluateSeizeOpportunity(state, 'gen-1');
    expect(combatOpportunity).not.toBeNull();
    expect(combatOpportunity!.score).toBeGreaterThan(0);

    const workerState = structuredClone(state);
    workerState.units['warrior-1'] = { ...workerState.units['warrior-1']!, type: 'worker' };
    const workerOpportunity = evaluateSeizeOpportunity(workerState, 'gen-1');
    // A non-combat unit cannot spend Seize's grant (movement is never refreshed), so the
    // evaluator must not offer the charge at all.
    expect(workerOpportunity).toBeNull();
  });

  it('selects the combat-capable units even when civilians sort first in the eligible pool', () => {
    const state = createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed: 'seize-mixed' });
    state.units['gen-1'] = makeGeneral();
    state.units['a-worker'] = {
      id: 'a-worker', type: 'worker', owner: 'player', position: { q: 1, r: 0 },
      movementPointsLeft: 0, health: 100, experience: 0, hasMoved: true, hasActed: true, isResting: false,
    } as Unit;
    state.units['z-warrior'] = {
      id: 'z-warrior', type: 'warrior', owner: 'player', position: { q: 2, r: 0 },
      movementPointsLeft: 0, health: 100, experience: 0, hasMoved: true, hasActed: true, isResting: false,
    } as Unit;
    state.civilizations.player!.units = ['gen-1', 'a-worker', 'z-warrior'];

    const opportunity = evaluateSeizeOpportunity(state, 'gen-1');
    expect(opportunity?.score).toBe(40);
    const after = opportunity!.execute(state);
    // The id-sorted pool would have activated the worker first and wasted the grant.
    expect(after.units['z-warrior']!.seizeGrantedBy).toMatchObject({ turn: after.turn });
    expect(after.units['a-worker']!.seizeGrantedBy).toBeUndefined();
  });

  it('scores only the units one charge can activate, not the whole in-range pool', () => {
    const state = createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed: 'seize-cap' });
    state.units['gen-1'] = makeGeneral(); // commandCapacity 3
    const positions = [{ q: 1, r: 0 }, { q: 0, r: 1 }, { q: -1, r: 0 }, { q: 0, r: -1 }, { q: 1, r: -1 }];
    const ids = ['gen-1'];
    positions.forEach((position, index) => {
      const id = `warrior-${index}`;
      state.units[id] = {
        id, type: 'warrior', owner: 'player', position,
        movementPointsLeft: 0, health: 100, experience: 0, hasMoved: true, hasActed: true, isResting: false,
      } as Unit;
      ids.push(id);
    });
    state.civilizations.player!.units = ids;

    // Only three of the five are activated, so the extra two must not inflate the value the
    // shared spend layer compares against Rally/Last Stand.
    expect(evaluateSeizeOpportunity(state, 'gen-1')!.score).toBe(3 * 40);
  });

  it('execute matches issueSeizeTheMoment directly', () => {
    const state = createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed: 'seize-3' });
    state.units['gen-1'] = makeGeneral();
    state.units['warrior-1'] = {
      id: 'warrior-1', type: 'warrior', owner: 'player', position: { q: 1, r: 0 },
      movementPointsLeft: 0, health: 100, experience: 0, hasMoved: true, hasActed: true, isResting: false,
    } as Unit;
    // #1807: a spendable target keeps the fixture deterministic.
    state.units['enemy-1'] = {
      id: 'enemy-1', type: 'warrior', owner: 'ai-1', position: { q: 2, r: 0 },
      movementPointsLeft: 1, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false,
    } as Unit;
    state.civilizations['ai-1']!.diplomacy.atWarWith = ['player'];
    state.civilizations.player!.diplomacy.atWarWith = ['ai-1'];
    state.civilizations.player!.units = ['gen-1', 'warrior-1', 'enemy-1'];
    state.civilizations['ai-1']!.units = ['enemy-1'];
    const opportunity = evaluateSeizeOpportunity(state, 'gen-1');
    const executed = opportunity!.execute(structuredClone(state));
    // #1807: the executor is issueSeizeTheMoment itself — the grant is the typed marker.
    expect(executed.units['warrior-1']!.seizeGrantedBy).toMatchObject({ turn: executed.turn });
    expect(executed.units['warrior-1']!.hasActed).toBe(true);
  });
});

describe('#544 MR5 — evaluateLastStandOpportunity', () => {
  it('returns null when no own combat unit is within command range', () => {
    const state = createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed: 'ls-1' });
    state.units['gen-1'] = makeGeneral();
    state.civilizations.player!.units = ['gen-1'];
    expect(evaluateLastStandOpportunity(state, 'gen-1')).toBeNull();
  });

  it('returns a positive-score opportunity when an own unit is in range, even with zero visible threat', () => {
    const state = createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed: 'ls-2' });
    const aiId = Object.keys(state.civilizations).find(id => id !== 'player')!;
    state.units['gen-1'] = makeGeneral({ owner: aiId, position: { q: 0, r: 0 } });
    state.units['defender-1'] = {
      id: 'defender-1', type: 'warrior', owner: aiId, position: { q: 1, r: 0 },
      movementPointsLeft: 1, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false,
    } as Unit;
    state.civilizations[aiId]!.units = ['gen-1', 'defender-1'];

    const opportunity = evaluateLastStandOpportunity(state, 'gen-1');
    expect(opportunity).not.toBeNull();
    expect(opportunity!.ability).toBe('last_stand');
    expect(opportunity!.score).toBeGreaterThan(0);
  });

  it('scores a hex with more nearby visible hostile threat higher than one with none', () => {
    const state = createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed: 'ls-3' });
    const aiId = Object.keys(state.civilizations).find(id => id !== 'player')!;
    state.units['gen-1'] = makeGeneral({ owner: aiId, position: { q: 0, r: 0 } });
    state.units['defender-1'] = {
      id: 'defender-1', type: 'warrior', owner: aiId, position: { q: 1, r: 0 },
      movementPointsLeft: 1, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false,
    } as Unit;
    state.civilizations[aiId]!.units = ['gen-1', 'defender-1'];
    const noThreat = evaluateLastStandOpportunity(state, 'gen-1');

    const withThreat = structuredClone(state);
    withThreat.civilizations[aiId]!.diplomacy.atWarWith = ['player'];
    withThreat.civilizations.player!.diplomacy.atWarWith = [aiId];
    withThreat.units['enemy-1'] = {
      id: 'enemy-1', type: 'warrior', owner: 'player', position: { q: 2, r: 0 },
      movementPointsLeft: 1, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false,
    } as Unit;
    withThreat.civilizations.player!.units = [...withThreat.civilizations.player!.units, 'enemy-1'];
    withThreat.civilizations[aiId]!.visibility.tiles = Object.fromEntries(
      Object.keys(withThreat.map.tiles).map(key => [key, 'visible' as const]),
    );
    const threatOpportunity = evaluateLastStandOpportunity(withThreat, 'gen-1');

    expect(threatOpportunity).not.toBeNull();
    expect(threatOpportunity!.score).toBeGreaterThan(noThreat!.score);
  });

  it('execute matches issueLastStand directly for the chosen hex', () => {
    const state = createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed: 'ls-4' });
    const aiId = Object.keys(state.civilizations).find(id => id !== 'player')!;
    state.units['gen-1'] = makeGeneral({ owner: aiId, position: { q: 0, r: 0 } });
    state.units['defender-1'] = {
      id: 'defender-1', type: 'warrior', owner: aiId, position: { q: 1, r: 0 },
      movementPointsLeft: 1, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false,
    } as Unit;
    state.civilizations[aiId]!.units = ['gen-1', 'defender-1'];
    const opportunity = evaluateLastStandOpportunity(state, 'gen-1');
    const executed = opportunity!.execute(state);
    expect(executed.units['defender-1']!.lastStandHold).toBeDefined();
  });
});

describe('#544 MR5 — shared spend layer', () => {
  it('chooses the highest-scoring eligible opportunity across all three abilities', () => {
    const state = createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed: 'spend-1' });
    state.units['gen-1'] = makeGeneral();
    state.units['unit-1'] = {
      id: 'unit-1', type: 'warrior', owner: 'player', position: { q: 1, r: 0 },
      movementPointsLeft: 0, health: 100, experience: 0, hasMoved: true, hasActed: true, isResting: false,
    } as Unit;
    state.civilizations.player!.units = ['gen-1', 'unit-1'];
    // Only Seize is eligible here: unit-1 has already acted at full health
    // with no landSupply set (no Rally target), and Last Stand also has a
    // target (unit-1 is in range) -- Seize's flat combat-unit value (40)
    // outscores Last Stand's formation-size-of-1-times-zero-threat score (1),
    // so this also exercises the comparison, not just eligibility.
    const chosen = chooseGeneralCommandAction(state, 'gen-1');
    expect(chosen?.ability).toBe('seize_the_moment');
  });

  it('returns null when nothing is eligible', () => {
    const state = createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed: 'spend-2' });
    state.units['gen-1'] = makeGeneral();
    state.civilizations.player!.units = ['gen-1'];
    expect(chooseGeneralCommandAction(state, 'gen-1')).toBeNull();
  });

  it('#544 MR5 review: a marginal opportunity is skipped at low difficulty eagerness but taken at high (MINIMUM_OPPORTUNITY_VALUE floor scales with heroicCommandEagernessWeight)', () => {
    const state = createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed: 'spend-5' });
    const aiId = Object.keys(state.civilizations).find(id => id !== 'player')!;
    state.units['gen-1'] = makeGeneral({ owner: aiId, position: { q: 0, r: 0 } });
    state.units['defender-1'] = {
      id: 'defender-1', type: 'warrior', owner: aiId, position: { q: 1, r: 0 },
      movementPointsLeft: 1, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false,
    } as Unit;
    state.units['defender-2'] = {
      id: 'defender-2', type: 'archer', owner: aiId, position: { q: 1, r: 0 },
      movementPointsLeft: 1, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false,
    } as Unit;
    state.civilizations[aiId]!.diplomacy.atWarWith = ['player'];
    state.civilizations.player!.diplomacy.atWarWith = [aiId];
    state.units['attacker-1'] = {
      id: 'attacker-1', type: 'warrior', owner: 'player', position: { q: 3, r: 0 },
      movementPointsLeft: 1, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false,
    } as Unit;
    state.civilizations.player!.units = [...state.civilizations.player!.units, 'attacker-1'];
    state.civilizations[aiId]!.units = ['gen-1', 'defender-1', 'defender-2'];
    state.civilizations[aiId]!.visibility.tiles = Object.fromEntries(
      Object.keys(state.map.tiles).map(key => [key, 'visible' as const]),
    );
    // 2-unit formation, 1 nearby visible threat -> raw score 4 (2 * (1+1)).
    expect(evaluateLastStandOpportunity(state, 'gen-1')!.score).toBe(4);

    const explorerState = { ...state, opponentChallenge: 'explorer' as const };
    expect(chooseGeneralCommandAction(explorerState, 'gen-1')).toBeNull();

    const veteranState = { ...state, opponentChallenge: 'veteran' as const };
    expect(chooseGeneralCommandAction(veteranState, 'gen-1')?.ability).toBe('last_stand');
  });

  it('processAIGeneralCommand("pre-tactical") issues Rally but not Seize (Seize needs hasActed units, which only exist post-tactical)', () => {
    const state = createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed: 'spend-3' });
    const aiId = Object.keys(state.civilizations).find(id => id !== 'player')!;
    state.units['gen-1'] = makeGeneral({ owner: aiId });
    state.units['unit-1'] = {
      id: 'unit-1', type: 'warrior', owner: aiId, position: { q: 1, r: 0 },
      movementPointsLeft: 1, health: 40, experience: 0, hasMoved: false, hasActed: false, isResting: false,
      landSupply: { state: 'severe', hostileUnsupportedTurns: 5, suppliedTurnsSinceRecovery: 0 },
    } as Unit;
    state.civilizations[aiId]!.units = ['gen-1', 'unit-1'];

    const result = processAIGeneralCommand(state, aiId, 'pre-tactical');
    expect(result.units['unit-1']!.health).toBeGreaterThan(40);
  });

  it('processAIGeneralCommand("post-tactical") issues Seize but not Rally', () => {
    const state = createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed: 'spend-4' });
    const aiId = Object.keys(state.civilizations).find(id => id !== 'player')!;
    state.units['gen-1'] = makeGeneral({ owner: aiId });
    state.units['unit-1'] = {
      id: 'unit-1', type: 'warrior', owner: aiId, position: { q: 1, r: 0 },
      movementPointsLeft: 0, health: 100, experience: 0, hasMoved: true, hasActed: true, isResting: false,
    } as Unit;
    // #1807: a target in spendable range keeps the fixture deterministic (the grant
    // model's probe must find something this unit can spend on any generated map).
    state.units['enemy-1'] = {
      id: 'enemy-1', type: 'warrior', owner: 'player', position: { q: 2, r: 0 },
      movementPointsLeft: 1, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false,
    } as Unit;
    state.civilizations.player!.diplomacy.atWarWith = [aiId];
    state.civilizations[aiId]!.diplomacy.atWarWith = ['player'];
    state.civilizations[aiId]!.units = ['gen-1', 'unit-1'];
    state.civilizations.player!.units = [...state.civilizations.player!.units, 'enemy-1'];

    const result = processAIGeneralCommand(state, aiId, 'post-tactical');
    // #1807: the grant is a typed marker plus a bounded budget; hasActed stays set.
    expect(result.units['unit-1']!.hasActed).toBe(true);
    expect(result.units['unit-1']!.seizeGrantedBy).toMatchObject({ turn: result.turn });
    expect(result.units['unit-1']!.movementPointsLeft).toBe(1);
  });

  it('#1807 — a granted AI unit attacks in the same round through the canonical executor', () => {
    const state = createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed: 'spend-grant-1' });
    const aiId = Object.keys(state.civilizations).find(id => id !== 'player')!;
    state.units['gen-1'] = makeGeneral({ owner: aiId });
    state.units['unit-1'] = {
      id: 'unit-1', type: 'warrior', owner: aiId, position: { q: 1, r: 0 },
      movementPointsLeft: 0, health: 100, experience: 0, hasMoved: true, hasActed: true, isResting: false,
    } as Unit;
    state.units['enemy-1'] = {
      id: 'enemy-1', type: 'warrior', owner: 'player', position: { q: 2, r: 0 },
      movementPointsLeft: 1, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false,
    } as Unit;
    state.civilizations.player!.diplomacy.atWarWith = [aiId];
    state.civilizations[aiId]!.diplomacy.atWarWith = ['player'];
    state.civilizations[aiId]!.units = ['gen-1', 'unit-1'];
    state.civilizations.player!.units = [...state.civilizations.player!.units, 'enemy-1'];
    // The enemy tile must be visible to the AI for the target to be offered.
    state.civilizations[aiId]!.visibility.tiles['2,0'] = 'visible';

    const result = processAIGeneralCommand(state, aiId, 'post-tactical');

    // The granted attack resolved: the pair's untouched pre-combat snapshot is gone
    // (who won is the seed's business, not this test's).
    const snapshot = JSON.stringify({
      attacker: result.units['unit-1']?.health ?? 'dead',
      defender: result.units['enemy-1']?.health ?? 'dead',
    });
    expect(snapshot).not.toEqual(JSON.stringify({ attacker: 100, defender: 100 }));
    // And the granted budget was consumed by the attack itself.
    expect(result.units['unit-1']?.movementPointsLeft ?? 0).toBe(0);
  });

  it('#1807 — the Seize valuation is null when no candidate can spend the grant', () => {
    const state = createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed: 'spend-grant-2' });
    const aiId = Object.keys(state.civilizations).find(id => id !== 'player')!;
    state.units['gen-1'] = makeGeneral({ owner: aiId });
    // Acted cargo with no target in reach: the grant would buy nothing.
    state.units['ship-1'] = {
      id: 'ship-1', type: 'transport', owner: aiId, position: { q: 1, r: 0 },
      movementPointsLeft: 0, health: 100, experience: 0, hasMoved: true, hasActed: true, isResting: false,
      cargoUnitIds: ['cargo-1'],
    } as Unit;
    state.units['cargo-1'] = {
      id: 'cargo-1', type: 'warrior', owner: aiId, position: { q: 1, r: 0 }, transportId: 'ship-1',
      movementPointsLeft: 0, health: 100, experience: 0, hasMoved: true, hasActed: true, isResting: false,
    } as Unit;
    state.civilizations[aiId]!.units = ['gen-1', 'ship-1', 'cargo-1'];

    expect(evaluateSeizeOpportunity(state, 'gen-1')).toBeNull();
    expect(chooseGeneralCommandAction(state, 'gen-1')).toBeNull();
  });

  it('#1807 — the Seize valuation counts only candidates that can spend the grant', () => {
    const state = createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed: 'spend-grant-3' });
    const aiId = Object.keys(state.civilizations).find(id => id !== 'player')!;
    state.units['gen-1'] = makeGeneral({ owner: aiId });
    state.units['unit-1'] = {
      id: 'unit-1', type: 'warrior', owner: aiId, position: { q: 1, r: 0 },
      movementPointsLeft: 0, health: 100, experience: 0, hasMoved: true, hasActed: true, isResting: false,
    } as Unit;
    state.units['enemy-1'] = {
      id: 'enemy-1', type: 'warrior', owner: 'player', position: { q: 2, r: 0 },
      movementPointsLeft: 1, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false,
    } as Unit;
    state.units['ship-1'] = {
      id: 'ship-1', type: 'transport', owner: aiId, position: { q: 1, r: 0 },
      movementPointsLeft: 0, health: 100, experience: 0, hasMoved: true, hasActed: true, isResting: false,
      cargoUnitIds: ['cargo-1'],
    } as Unit;
    // #1807: a strength-0 cargo unit cannot spend a grant even through the granted
    // embarked assault — a warrior aboard could attack the adjacent enemy, which is
    // correct behavior, so the boxed-in candidate must be a non-combatant.
    state.units['cargo-1'] = {
      id: 'cargo-1', type: 'settler', owner: aiId, position: { q: 1, r: 0 }, transportId: 'ship-1',
      movementPointsLeft: 0, health: 100, experience: 0, hasMoved: true, hasActed: true, isResting: false,
    } as Unit;
    state.civilizations.player!.diplomacy.atWarWith = [aiId];
    state.civilizations[aiId]!.diplomacy.atWarWith = ['player'];
    state.civilizations[aiId]!.units = ['gen-1', 'unit-1', 'ship-1', 'cargo-1'];
    state.civilizations.player!.units = [...state.civilizations.player!.units, 'enemy-1'];
    state.civilizations[aiId]!.visibility.tiles['2,0'] = 'visible';

    const opportunity = evaluateSeizeOpportunity(state, 'gen-1');
    expect(opportunity).not.toBeNull();
    // Only the spendable warrior scores (SEIZE_COMBAT_UNIT_VALUE), not the boxed-in settler.
    expect(opportunity!.score).toBe(40);
    const executed = opportunity!.execute(structuredClone(state));
    expect(executed.units['unit-1']!.seizeGrantedBy).toMatchObject({ turn: executed.turn });
    expect(executed.units['cargo-1']!.seizeGrantedBy).toBeUndefined();
  });
});

// ===========================================================================
// #1522 — observed AI General activations
// ===========================================================================

function collectObservedActivations(bus: EventBus): GeneralAbilityMoment[] {
  const moments: GeneralAbilityMoment[] = [];
  bus.on('general:ai-command-used', ({ moment }) => moments.push(moment));
  return moments;
}

function generalPresentationState(seed: string) {
  const state = createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed });
  const aiId = Object.keys(state.civilizations).find(id => id !== 'player')!;
  state.units['gen-1'] = makeGeneral({ owner: aiId, position: { q: 0, r: 0 } });
  return { state, aiId };
}

describe('#1522 — observed AI General activations', () => {
  it('emits one Rally activation derived from the before/after state difference', () => {
    const { state, aiId } = generalPresentationState('ai-present-rally');
    state.units['unit-1'] = {
      id: 'unit-1', type: 'warrior', owner: aiId, position: { q: 1, r: 0 },
      movementPointsLeft: 1, health: 40, experience: 0, hasMoved: false, hasActed: false, isResting: false,
      landSupply: { state: 'severe', hostileUnsupportedTurns: 5, suppliedTurnsSinceRecovery: 0 },
    } as Unit;
    state.civilizations[aiId]!.units = ['gen-1', 'unit-1'];
    const bus = new EventBus();
    const moments = collectObservedActivations(bus);

    const result = processAIGeneralCommand(state, aiId, 'pre-tactical', bus);

    expect(result.units['unit-1']!.health).toBeGreaterThan(40);
    expect(moments).toHaveLength(1);
    expect(moments[0]).toMatchObject({
      kind: 'rally',
      civId: aiId,
      generalUnitId: 'gen-1',
      generalCoord: { q: 0, r: 0 },
      isFinalCommand: false,
    });
    expect(moments[0]!.affectedCoords).toContainEqual({ q: 1, r: 0 });
    // Observed activations are feedback only: no owner-only result text or General name on the AI round bus.
    expect(moments[0]!.summary).toBe('');
    expect(moments[0]!.generalName).toBe('');
  });

  it('emits one Seize the Moment activation for the units it actually granted another action', () => {
    const { state, aiId } = generalPresentationState('ai-present-seize');
    state.units['unit-1'] = {
      id: 'unit-1', type: 'warrior', owner: aiId, position: { q: 1, r: 0 },
      movementPointsLeft: 0, health: 100, experience: 0, hasMoved: true, hasActed: true, isResting: false,
    } as Unit;
    // #1807: a spendable target keeps the grant deterministic on any generated map.
    state.units['enemy-1'] = {
      id: 'enemy-1', type: 'warrior', owner: 'player', position: { q: 2, r: 0 },
      movementPointsLeft: 1, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false,
    } as Unit;
    state.civilizations.player!.diplomacy.atWarWith = [aiId];
    state.civilizations[aiId]!.diplomacy.atWarWith = ['player'];
    state.civilizations.player!.units = [...state.civilizations.player!.units, 'enemy-1'];
    state.civilizations[aiId]!.visibility.tiles['2,0'] = 'visible';
    state.civilizations[aiId]!.units = ['gen-1', 'unit-1'];
    const bus = new EventBus();
    const moments = collectObservedActivations(bus);

    const result = processAIGeneralCommand(state, aiId, 'post-tactical', bus);

    // #1807: the grant is the typed marker; hasActed stays set. The same round also
    // spends the grant on the visible enemy (see the #1807 spending-pass tests), so the
    // moment's affected coordinate is what the ISSUANCE touched.
    expect(result.units['unit-1']!.hasActed).toBe(true);
    expect(result.units['unit-1']!.seizeGrantedBy).toMatchObject({ turn: result.turn });
    expect(moments).toHaveLength(1);
    expect(moments[0]).toMatchObject({
      kind: 'seize',
      civId: aiId,
      generalUnitId: 'gen-1',
      generalCoord: { q: 0, r: 0 },
    });
    expect(moments[0]!.affectedCoords).toContainEqual({ q: 1, r: 0 });
  });

  it('emits one Last Stand activation for the formation it braced', () => {
    const { state, aiId } = generalPresentationState('ai-present-last-stand');
    state.opponentChallenge = 'veteran';
    for (const id of ['defender-1', 'defender-2']) {
      state.units[id] = {
        id, type: id === 'defender-1' ? 'warrior' : 'archer', owner: aiId, position: { q: 1, r: 0 },
        movementPointsLeft: 1, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false,
      } as Unit;
    }
    state.units['attacker-1'] = {
      id: 'attacker-1', type: 'warrior', owner: 'player', position: { q: 3, r: 0 },
      movementPointsLeft: 1, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false,
    } as Unit;
    state.civilizations[aiId]!.units = ['gen-1', 'defender-1', 'defender-2'];
    state.civilizations.player!.units = [...state.civilizations.player!.units, 'attacker-1'];
    state.civilizations[aiId]!.diplomacy.atWarWith = ['player'];
    state.civilizations.player!.diplomacy.atWarWith = [aiId];
    state.civilizations[aiId]!.visibility.tiles = Object.fromEntries(
      Object.keys(state.map.tiles).map(key => [key, 'visible' as const]),
    );
    const bus = new EventBus();
    const moments = collectObservedActivations(bus);

    const result = processAIGeneralCommand(state, aiId, 'pre-tactical', bus);

    expect(result.units['defender-1']!.lastStandHold).toBeDefined();
    expect(moments).toHaveLength(1);
    expect(moments[0]).toMatchObject({
      kind: 'last-stand',
      civId: aiId,
      generalUnitId: 'gen-1',
      generalCoord: { q: 0, r: 0 },
    });
    expect(moments[0]!.affectedCoords).toContainEqual({ q: 1, r: 0 });
  });

  it('emits nothing when the AI issues no command', () => {
    const { state, aiId } = generalPresentationState('ai-present-none');
    state.civilizations[aiId]!.units = ['gen-1'];
    const bus = new EventBus();
    const moments = collectObservedActivations(bus);

    processAIGeneralCommand(state, aiId, 'pre-tactical', bus);

    expect(moments).toEqual([]);
  });

  it('emits nothing for an ineffective command (a General with no charges left)', () => {
    const { state, aiId } = generalPresentationState('ai-present-no-charges');
    state.units['gen-1'] = makeGeneral({ owner: aiId, position: { q: 0, r: 0 }, generalCommandChargesUsed: 3 });
    state.units['unit-1'] = {
      id: 'unit-1', type: 'warrior', owner: aiId, position: { q: 1, r: 0 },
      movementPointsLeft: 1, health: 40, experience: 0, hasMoved: false, hasActed: false, isResting: false,
      landSupply: { state: 'severe', hostileUnsupportedTurns: 5, suppliedTurnsSinceRecovery: 0 },
    } as Unit;
    state.civilizations[aiId]!.units = ['gen-1', 'unit-1'];
    const bus = new EventBus();
    const moments = collectObservedActivations(bus);

    processAIGeneralCommand(state, aiId, 'pre-tactical', bus);

    expect(moments).toEqual([]);
  });

  it('leaves the AI mechanical outcome identical with and without a presentation bus', () => {
    const { state, aiId } = generalPresentationState('ai-present-parity');
    state.units['unit-1'] = {
      id: 'unit-1', type: 'warrior', owner: aiId, position: { q: 1, r: 0 },
      movementPointsLeft: 1, health: 40, experience: 0, hasMoved: false, hasActed: false, isResting: false,
      landSupply: { state: 'severe', hostileUnsupportedTurns: 5, suppliedTurnsSinceRecovery: 0 },
    } as Unit;
    state.civilizations[aiId]!.units = ['gen-1', 'unit-1'];
    const bus = new EventBus();
    const moments = collectObservedActivations(bus);

    const withoutBus = processAIGeneralCommand(structuredClone(state), aiId, 'pre-tactical');
    const withBus = processAIGeneralCommand(structuredClone(state), aiId, 'pre-tactical', bus);

    expect(withBus).toEqual(withoutBus);
    expect(moments).toHaveLength(1);
  });
});

// ===========================================================================
// #885 — AI candidate valuation over resolved specialties
// ===========================================================================

const def = (id: string) => GENERAL_DEFINITIONS.find(g => g.id === id)!;

function gameAtWar(seed: string) {
  const s = createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed });
  s.civilizations.player!.diplomacy.atWarWith = ['ai-1'];
  s.civilizations['ai-1']!.diplomacy.atWarWith = ['player'];
  return s;
}

describe('#885 chooseBestGeneralCandidate — bounded, non-omniscient, difficulty-invariant', () => {
  it('is deterministic for a fixed state + candidate set (id tiebreak)', () => {
    const s = gameAtWar('cbc-det');
    const cands = [def('gen_hannibal'), def('gen_wellington'), def('gen_genghis')];
    expect(chooseBestGeneralCandidate(s, 'player', cands).id).toBe(chooseBestGeneralCandidate(s, 'player', cands).id);
  });

  it('#1807 — the initiative (Seize) need counts only units a grant could serve, never air units or commissioned traders', () => {
    const candidates = [def('gen_caesar'), def('gen_alexander')];
    // Both specialists share the V1 base term and neither has another situational term
    // in these fixtures (no bombard-capable units), so the pick isolates the initiative
    // need exactly: with a spendable acted combat unit near a visible enemy, Caesar's
    // initiative term wins; with only air/trader acted units, the need is 0 and the
    // id tiebreak decides.
    const hot = gameAtWar('cbc-init-hot');
    hot.units['enemy-1'] = { id: 'enemy-1', type: 'warrior', owner: 'ai-1', position: { q: 3, r: 3 },
      movementPointsLeft: 1, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false } as Unit;
    hot.units['acted-1'] = { id: 'acted-1', type: 'warrior', owner: 'player', position: { q: 3, r: 4 },
      movementPointsLeft: 0, health: 100, experience: 0, hasMoved: true, hasActed: true, isResting: false } as Unit;
    hot.civilizations.player!.units = [...hot.civilizations.player!.units, 'enemy-1', 'acted-1'];
    hot.civilizations.player!.visibility.tiles['3,3'] = 'visible';
    expect(chooseBestGeneralCandidate(hot, 'player', candidates).id).toBe('gen_caesar');

    const cold = gameAtWar('cbc-init-cold');
    cold.units['enemy-1'] = { id: 'enemy-1', type: 'warrior', owner: 'ai-1', position: { q: 3, r: 3 },
      movementPointsLeft: 1, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false } as Unit;
    // Air units never spend a grant (no walking, missions keep their own gates) and a
    // commissioned trader's allowance belongs to its route runner — neither may inflate
    // the Seize need (#1807, matching getSeizeTheMomentEligibleUnits' own filters).
    cold.units['acted-air'] = { id: 'acted-air', type: 'biplane', owner: 'player', position: { q: 3, r: 4 },
      movementPointsLeft: 0, health: 100, experience: 0, hasMoved: true, hasActed: true, isResting: false } as Unit;
    cold.units['acted-trader'] = { id: 'acted-trader', type: 'warrior', owner: 'player', position: { q: 4, r: 3 },
      movementPointsLeft: 1, health: 100, experience: 0, hasMoved: true, hasActed: true, isResting: false,
      committedToRouteId: 'route-1' } as Unit;
    cold.civilizations.player!.units = [...cold.civilizations.player!.units, 'enemy-1', 'acted-air', 'acted-trader'];
    cold.civilizations.player!.visibility.tiles['3,3'] = 'visible';
    expect(chooseBestGeneralCandidate(cold, 'player', candidates).id).toBe('gen_alexander');
  });

  it('picks the Defensive specialist when own field units are badly hurt', () => {
    const s = gameAtWar('cbc-def');
    s.units['h1'] = { id: 'h1', type: 'swordsman', owner: 'player', position: { q: 3, r: 3 },
      movementPointsLeft: 1, health: 25, experience: 0, hasMoved: false, hasActed: false, isResting: false } as Unit;
    s.units['h2'] = { ...(s.units['h1'] as Unit), id: 'h2', position: { q: 4, r: 3 } } as Unit;
    s.units['h3'] = { ...(s.units['h1'] as Unit), id: 'h3', position: { q: 3, r: 4 } } as Unit;
    s.civilizations.player!.units = [...s.civilizations.player!.units, 'h1', 'h2', 'h3'];
    const cands = [def('gen_wellington'), def('gen_caesar'), def('gen_hannibal')];
    expect(chooseBestGeneralCandidate(s, 'player', cands).id).toBe('gen_wellington');
  });

  it('picks the Supply Master when own units are in bad supply', () => {
    const s = gameAtWar('cbc-log');
    s.units['h1'] = { id: 'h1', type: 'swordsman', owner: 'player', position: { q: 3, r: 3 },
      movementPointsLeft: 1, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false,
      landSupply: { state: 'severe', hostileUnsupportedTurns: 5, suppliedTurnsSinceRecovery: 0 } } as Unit;
    s.units['h2'] = { ...(s.units['h1'] as Unit), id: 'h2', position: { q: 4, r: 3 } } as Unit;
    s.units['h3'] = { ...(s.units['h1'] as Unit), id: 'h3', position: { q: 3, r: 4 } } as Unit;
    s.civilizations.player!.units = [...s.civilizations.player!.units, 'h1', 'h2', 'h3'];
    const cands = [def('gen_yuefei'), def('gen_wellington'), def('gen_hannibal')];
    expect(chooseBestGeneralCandidate(s, 'player', cands).id).toBe('gen_yuefei');
  });

  describe('Siegemaster (#939)', () => {
    function withSiegeArmy(seed: string, siegeCount: number, atWar = true) {
      const s = gameAtWar(seed);
      s.civilizations.player!.units = s.civilizations.player!.units.filter(id => s.units[id]?.type === 'settler');
      const added: string[] = [];
      for (let i = 0; i < siegeCount; i++) {
        const id = `siege-${i}`;
        s.units[id] = { id, type: 'catapult', owner: 'player', position: { q: 3 + i, r: 3 },
          movementPointsLeft: 1, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false } as Unit;
        added.push(id);
      }
      s.civilizations.player!.units = [...s.civilizations.player!.units, ...added];
      if (!atWar) {
        s.civilizations.player!.diplomacy.atWarWith = [];
        s.civilizations['ai-1']!.diplomacy.atWarWith = [];
      }
      return s;
    }
    // Hannibal ties the Siegemaster on base stats, so only the situational term can move the pick.
    const cands = [def('gen_hannibal'), def('gen_mehmed'), def('gen_genghis')];

    it('picks the Siegemaster when at war with an army that can hurt a city', () => {
      expect(chooseBestGeneralCandidate(withSiegeArmy('cbc-siege', 4), 'player', cands).id).toBe('gen_mehmed');
    });

    it('does not seek the Siegemaster out without siege units', () => {
      expect(chooseBestGeneralCandidate(withSiegeArmy('cbc-siege-none', 0), 'player', cands).id).not.toBe('gen_mehmed');
    });

    it('does not seek the Siegemaster out in peacetime', () => {
      expect(chooseBestGeneralCandidate(withSiegeArmy('cbc-siege-peace', 4, false), 'player', cands).id).not.toBe('gen_mehmed');
    });

    it('counts only own units, never a rival\'s', () => {
      const s = withSiegeArmy('cbc-siege-foreign', 0);
      for (let i = 0; i < 4; i++) {
        const id = `foe-${i}`;
        s.units[id] = { id, type: 'catapult', owner: 'ai-1', position: { q: 3 + i, r: 5 },
          movementPointsLeft: 1, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false } as Unit;
        s.civilizations['ai-1']!.units = [...s.civilizations['ai-1']!.units, id];
      }
      expect(chooseBestGeneralCandidate(s, 'player', cands).id).not.toBe('gen_mehmed');
    });
  });

  it('never reads difficulty — same pick on Explorer and Veteran', () => {
    const cands = [def('gen_wellington'), def('gen_genghis'), def('gen_hannibal')];
    const explorer = { ...gameAtWar('cbc-diff'), opponentChallenge: 'explorer' as const };
    const veteran = { ...gameAtWar('cbc-diff'), opponentChallenge: 'veteran' as const };
    expect(chooseBestGeneralCandidate(explorer, 'player', cands).id)
      .toBe(chooseBestGeneralCandidate(veteran, 'player', cands).id);
  });

  it('with no situational signal, still returns a candidate from the offered set', () => {
    const s = createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed: 'cbc-quiet' });
    const cands = [def('gen_hannibal'), def('gen_shaka'), def('gen_genghis')];
    expect(cands.map(c => c.id)).toContain(chooseBestGeneralCandidate(s, 'player', cands).id);
  });
});
