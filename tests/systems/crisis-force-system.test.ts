import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import { CRISIS_FORCE_OWNER } from '@/core/owner-kind';
import {
  normalizeCrisisForces,
  registerCrisisForce,
  resolveCrisisForceSeverity,
} from '@/systems/crisis-force-system';

function makeCrisisUnit(id: string, owner = CRISIS_FORCE_OWNER) {
  return {
    id,
    type: 'warrior' as const,
    owner,
    position: { q: 1, r: 1 },
    movementPointsLeft: 2,
    health: 100,
    experience: 0,
    hasMoved: false,
    hasActed: false,
    isResting: false,
  };
}

describe('crisis-force-system', () => {
  it('registers a force with the target personal challenge snapshot', () => {
    const state = createNewGame('rome', 'crisis-force-register', 'small');
    state.civilizations.player.challenge = 'explorer';
    state.units['crisis-1'] = makeCrisisUnit('crisis-1');

    const next = registerCrisisForce(state, {
      id: 'stampede-1',
      targetCivId: 'player',
      severity: resolveCrisisForceSeverity(state, 'player'),
      createdTurn: state.turn,
      unitIds: ['crisis-1'],
    });

    expect(next.crisisForces?.['stampede-1']).toEqual({
      id: 'stampede-1',
      targetCivId: 'player',
      severity: 'explorer',
      createdTurn: state.turn,
      unitIds: ['crisis-1'],
    });
    expect(next.civilizations.player.units).not.toContain('crisis-1');
  });

  it('uses standard severity for an AI target', () => {
    const state = createNewGame('rome', 'crisis-force-ai-severity', 'small');
    const ai = { ...state.civilizations.player, id: 'ai-1', isHuman: false, challenge: 'veteran' as const };
    state.civilizations['ai-1'] = ai;

    expect(resolveCrisisForceSeverity(state, 'ai-1')).toBe('standard');
  });

  it('normalizes malformed records deterministically without changing ordinary units', () => {
    const state = createNewGame('rome', 'crisis-force-normalize', 'small');
    state.units['a-crisis'] = makeCrisisUnit('a-crisis');
    state.units['b-crisis'] = makeCrisisUnit('b-crisis');
    state.units['wrong-owner'] = makeCrisisUnit('wrong-owner', 'player');
    state.units['orphan-crisis'] = makeCrisisUnit('orphan-crisis');
    const ordinaryBefore = structuredClone(state.units['wrong-owner']);
    state.crisisForces = {
      'z-force': {
        id: 'z-force', targetCivId: 'player', severity: 'veteran', createdTurn: 2,
        unitIds: ['a-crisis', 'b-crisis', 'wrong-owner', 'a-crisis'],
      },
      'a-force': {
        id: 'a-force', targetCivId: 'player', severity: 'explorer', createdTurn: 1,
        unitIds: ['a-crisis'],
      },
      'invalid-target': {
        id: 'invalid-target', targetCivId: 'missing', severity: 'standard', createdTurn: 1,
        unitIds: ['b-crisis'],
      },
    };

    const normalized = normalizeCrisisForces(state);

    expect(normalized.crisisForces).toEqual({
      'a-force': {
        id: 'a-force', targetCivId: 'player', severity: 'explorer', createdTurn: 1,
        unitIds: ['a-crisis'],
      },
      'z-force': {
        id: 'z-force', targetCivId: 'player', severity: 'veteran', createdTurn: 2,
        unitIds: ['b-crisis'],
      },
    });
    expect(normalized.units['orphan-crisis']).toBeUndefined();
    expect(normalized.units['wrong-owner']).toEqual(ordinaryBefore);
    expect(normalizeCrisisForces(normalized)).toEqual(normalized);
  });
});
