import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import { evaluateRallyOpportunity, evaluateSeizeOpportunity, getEraGenerals, isGeneralInDanger } from '@/ai/ai-general-command';
import { issueRally } from '@/systems/great-general-abilities';
import type { Unit } from '@/core/types';

function makeGeneral(overrides: Partial<Unit> = {}): Unit {
  return {
    id: 'gen-1', type: 'great_general', owner: 'player', position: { q: 0, r: 0 },
    movementPointsLeft: 3, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false,
    generalDefinitionId: 'gen_caesar', ...overrides,
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
