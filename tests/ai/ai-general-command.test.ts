import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import { getEraGenerals, isGeneralInDanger } from '@/ai/ai-general-command';
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
