import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
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
    expect(workerOpportunity?.score ?? 0).toBeLessThan(combatOpportunity!.score);
  });

  it('execute matches issueSeizeTheMoment directly', () => {
    const state = createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed: 'seize-3' });
    state.units['gen-1'] = makeGeneral();
    state.units['warrior-1'] = {
      id: 'warrior-1', type: 'warrior', owner: 'player', position: { q: 1, r: 0 },
      movementPointsLeft: 0, health: 100, experience: 0, hasMoved: true, hasActed: true, isResting: false,
    } as Unit;
    state.civilizations.player!.units = ['gen-1', 'warrior-1'];
    const opportunity = evaluateSeizeOpportunity(state, 'gen-1');
    const executed = opportunity!.execute(state);
    expect(executed.units['warrior-1']!.hasActed).toBe(false);
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
    state.civilizations[aiId]!.units = ['gen-1', 'unit-1'];

    const result = processAIGeneralCommand(state, aiId, 'post-tactical');
    expect(result.units['unit-1']!.hasActed).toBe(false);
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
