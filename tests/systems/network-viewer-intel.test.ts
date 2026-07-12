import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import type { City, Unit } from '@/core/types';
import { assignNetworkPlan } from '@/systems/network-plan-system';
import { getNetworkWarningForViewer } from '@/systems/network-viewer-intel';

function makeState() {
  const state = createNewGame('rome', 'network-viewer-intel', 'small');
  const city: City = {
    id: 'city-ai', name: 'Target', owner: 'ai-1', position: { q: 0, r: 0 }, population: 1,
    food: 0, foodNeeded: 10, buildings: [], productionQueue: [], productionProgress: 0,
    ownedTiles: [], workedTiles: [], focus: 'balanced', maturity: 'village', unrestLevel: 0,
    unrestTurns: 0, spyUnrestBonus: 0, idleProduction: null,
  };
  const cyber: Unit = {
    id: 'unit-cyber', type: 'cyber_unit', owner: 'player', position: { q: 1, r: 0 },
    movementPointsLeft: 3, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false,
  };
  state.cities = { [city.id]: city };
  state.units = { [cyber.id]: cyber };
  state.civilizations.player = {
    ...state.civilizations.player,
    units: [cyber.id],
    techState: { ...state.civilizations.player.techState, completed: ['quantum-computing'] },
    diplomacy: { ...state.civilizations.player.diplomacy, atWarWith: ['ai-1'] },
  };
  state.civilizations['ai-1'] = {
    ...state.civilizations['ai-1'],
    cities: [city.id],
    diplomacy: { ...state.civilizations['ai-1'].diplomacy, atWarWith: ['player'] },
  };
  return assignNetworkPlan(state, {
    ownerCivId: 'player', sourceUnitId: cyber.id, definitionId: 'exploit', target: { kind: 'city', cityId: city.id },
  }).state;
}

describe('network viewer intel', () => {
  it('shows an Exploit victim the effect and counter without leaking its source', () => {
    const warning = getNetworkWarningForViewer(makeState(), 'ai-1', 'network-plan-1');

    expect(warning).toEqual({
      planId: 'network-plan-1',
      targetCityId: 'city-ai',
      effectLabel: 'Exploit',
      counterLabel: 'Cyber Defense Center or Harden',
    });
  });

  it('discloses source identity and coordinates only from the viewer detection record', () => {
    const state = makeState();
    state.autonomyByCiv!['ai-1'].detections['network-plan-1'] = {
      planId: 'network-plan-1', detectedTurn: state.turn, sourceIdentityKnown: true, sourcePositionKnown: true,
    };

    expect(getNetworkWarningForViewer(state, 'ai-1', 'network-plan-1')).toMatchObject({
      source: { unitId: 'unit-cyber', position: { q: 1, r: 0 } },
    });
  });
});
