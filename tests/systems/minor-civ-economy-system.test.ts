import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import {
  chooseMinorCivQueueItem,
  evaluateMinorCivEconomyPosture,
  getMinorCivAvailableResources,
  getMinorCivBuildCandidates,
  getMinorCivCompletedTechBand,
  getMinorCivUnitCap,
  normalizeMinorCivEconomyState,
} from '@/systems/minor-civ-economy-system';
import { getCivAvailableResources } from '@/systems/resource-acquisition-system';
import { hexKey } from '@/systems/hex-utils';

describe('minor-civ economy normalization', () => {
  it('does not change city queue, production progress, units, or regional grievance', () => {
    const state = createNewGame(undefined, 'minor-economy-normalize-system', 'small');
    const minorCiv = Object.values(state.minorCivs)[0];
    const city = state.cities[minorCiv.cityId];
    city.productionQueue = ['walls'];
    city.productionProgress = 7;
    minorCiv.regionalGrievanceByCiv = {
      player: {
        targetCivId: 'player',
        pressure: 45,
        status: 'mobilizing',
        lastUpdatedTurn: state.turn,
        causes: [],
      },
    };
    const beforeUnits = structuredClone(state.units);

    const result = normalizeMinorCivEconomyState(state);

    expect(result.cities[city.id].productionQueue).toEqual(['walls']);
    expect(result.cities[city.id].productionProgress).toBe(7);
    expect(result.units).toEqual(beforeUnits);
    expect(result.minorCivs[minorCiv.id].regionalGrievanceByCiv).toEqual(minorCiv.regionalGrievanceByCiv);
    expect(result.minorCivs[minorCiv.id].economy).toMatchObject({ policy: 'balanced', posture: 'settled' });
  });
});

describe('minor-civ economy helpers', () => {
  it('derives minor-civ tech bands by era without needing a Civilization record', () => {
    const state = createNewGame(undefined, 'minor-economy-tech-band', 'small');
    const minorCiv = Object.values(state.minorCivs)[0];
    state.era = 2;

    const techs = getMinorCivCompletedTechBand(state, minorCiv.id);

    expect(state.civilizations[minorCiv.id]).toBeUndefined();
    expect(techs).toContain('bronze-working');
    expect(techs.every(techId => typeof techId === 'string')).toBe(true);
  });

  it('reads city-state resources from owned improved tiles and does not use major-civ resource lookup', () => {
    const state = createNewGame(undefined, 'minor-economy-resource-band', 'small');
    const minorCiv = Object.values(state.minorCivs)[0];
    const city = state.cities[minorCiv.cityId];
    const resourceTile = city.ownedTiles.find(coord => hexKey(coord) !== hexKey(city.position)) ?? city.position;
    const key = hexKey(resourceTile);
    state.map.tiles[key] = {
      ...state.map.tiles[key],
      owner: minorCiv.id,
      resource: 'copper',
      improvement: 'mine',
      improvementTurnsLeft: 0,
    };
    state.era = 1;

    expect(getCivAvailableResources(state, minorCiv.id).has('copper')).toBe(false);
    expect(getMinorCivAvailableResources(state, minorCiv.id).has('copper')).toBe(true);
  });

  it('does not reveal resource-gated candidates before the era band reveals their resource', () => {
    const state = createNewGame(undefined, 'minor-economy-resource-negative', 'small');
    const minorCiv = Object.values(state.minorCivs)[0];
    const city = state.cities[minorCiv.cityId];
    state.era = 1;
    state.map.tiles[hexKey(city.position)] = {
      ...state.map.tiles[hexKey(city.position)],
      owner: minorCiv.id,
      resource: 'iron',
    };

    const candidates = getMinorCivBuildCandidates(state, minorCiv.id);

    expect(candidates.units.map(unit => unit.type)).not.toContain('swordsman');
  });

  it('filters city-state unsafe candidates', () => {
    const state = createNewGame(undefined, 'minor-economy-safe-candidates', 'small');
    const minorCiv = Object.values(state.minorCivs)[0];

    const candidates = getMinorCivBuildCandidates(state, minorCiv.id);
    const ids = [...candidates.buildings.map(building => building.id), ...candidates.units.map(unit => unit.type)];

    expect(ids).not.toContain('settler');
    expect(ids).not.toContain('worker');
    expect(ids).not.toContain('spy_scout');
    expect(ids).not.toContain('caravan');
    expect(candidates.buildings.every(building => !building.nationalProject && !building.uniquePerEmpire)).toBe(true);
  });

  it('maps regional grievance and recovery strain into economy posture', () => {
    const state = createNewGame(undefined, 'minor-economy-posture', 'small');
    const minorCiv = Object.values(state.minorCivs)[0];
    minorCiv.regionalGrievanceByCiv = {
      player: {
        targetCivId: 'player',
        pressure: 50,
        status: 'mobilizing',
        lastUpdatedTurn: state.turn,
        recoveryStrainedUntilTurn: state.turn + 3,
        causes: [],
      },
    };

    expect(evaluateMinorCivEconomyPosture(state, minorCiv.id)).toBe('recovering');
  });

  it('uses challenge, posture, and archetype for unit caps', () => {
    const state = createNewGame(undefined, 'minor-economy-caps', 'small');
    const minorCiv = Object.values(state.minorCivs)[0];
    minorCiv.definitionId = 'sparta';
    state.opponentChallenge = 'veteran';

    expect(getMinorCivUnitCap(state, minorCiv.id, 'mobilizing')).toBe(6);
  });

  it('chooses a deterministic single queue item', () => {
    const state = createNewGame(undefined, 'minor-economy-queue-choice', 'small');
    const minorCiv = Object.values(state.minorCivs)[0];
    state.minorCivs[minorCiv.id].economy = { policy: 'defense', posture: 'fortifying', lastProcessedTurn: 0 };

    expect(chooseMinorCivQueueItem(state, minorCiv.id)).toEqual(chooseMinorCivQueueItem(state, minorCiv.id));
  });

  it('treats low cooled wary pressure as settled when no local threat exists', () => {
    const state = createNewGame(undefined, 'minor-economy-cooled-wary', 'small');
    const minorCiv = Object.values(state.minorCivs)[0];
    minorCiv.regionalGrievanceByCiv = {
      player: {
        targetCivId: 'player',
        pressure: 5,
        status: 'wary',
        lastUpdatedTurn: state.turn,
        causes: [],
      },
    };

    expect(evaluateMinorCivEconomyPosture(state, minorCiv.id)).toBe('settled');
  });
});
