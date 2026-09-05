import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import {
  chooseMinorCivQueueItem,
  evaluateMinorCivEconomyPosture,
  evaluateMinorCivEmergencyLevy,
  getMinorCivAvailableResources,
  getMinorCivBuildCandidates,
  getMinorCivCompletedTechBand,
  getMinorCivPopulationCeiling,
  getMinorCivUnitCap,
  MINOR_CIV_LEVY_COOLDOWN_TURNS,
  MINOR_CIV_LEVY_MIN_DEFENSIVE_FORCE,
  MINOR_CIV_LEVY_MIN_POPULATION,
  normalizeMinorCivEconomyState,
  processMinorCivEconomyTurn,
  SAFE_MINOR_CIV_UNIT_TYPES,
} from '@/systems/minor-civ-economy-system';
import { getCivAvailableResources } from '@/systems/resource-acquisition-system';
import { getWrappedHexNeighbors, hexKey, hexNeighbors } from '@/systems/hex-utils';
import { createUnit } from '@/systems/unit-system';
import { getEraAdvancementTechs } from '@/systems/tech-definitions';
import { advancePlayerCivToEra as setPlayerCivEra } from './helpers/minor-civ-scenario-fixtures';

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
  it('derives minor-civ tech bands from nearby civilization pressure without needing a Civilization record', () => {
    const state = createNewGame(undefined, 'minor-economy-tech-band', 'small');
    const minorCiv = Object.values(state.minorCivs)[0];
    state.era = 2;
    state.civilizations.player.techState.completed = getEraAdvancementTechs(2)
      .slice(0, Math.ceil(getEraAdvancementTechs(2).length * 0.5))
      .map(tech => tech.id);
    const city = state.cities[minorCiv.cityId];
    state.cities['pressure-source'] = {
      id: 'pressure-source', owner: 'player', position: { q: city.position.q + 1, r: city.position.r },
    } as never;
    state.civilizations.player.cities = ['pressure-source'];

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

  it('maps regional grievance pressure into a mobilizing posture', () => {
    const state = createNewGame(undefined, 'minor-economy-posture', 'small');
    const minorCiv = Object.values(state.minorCivs)[0];
    minorCiv.regionalGrievanceByCiv = {
      player: {
        targetCivId: 'player',
        pressure: 50,
        status: 'mobilizing',
        lastUpdatedTurn: state.turn,
        causes: [],
      },
    };

    expect(evaluateMinorCivEconomyPosture(state, minorCiv.id)).toBe('mobilizing');
  });

  it('maps an active localRecoveryUntilTurn window into a recovering posture (#951)', () => {
    const state = createNewGame(undefined, 'minor-economy-posture-recovery', 'small');
    const minorCiv = Object.values(state.minorCivs)[0];
    minorCiv.economy = {
      policy: 'recovery',
      posture: 'recovering',
      lastProcessedTurn: state.turn - 1,
      localRecoveryUntilTurn: state.turn + 3,
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

  it('uses live mobilizing posture over stale settled economy when choosing defenders', () => {
    const state = createNewGame(undefined, 'minor-economy-live-war-choice', 'small');
    const minorCiv = Object.values(state.minorCivs)[0];
    minorCiv.economy = { policy: 'balanced', posture: 'settled', lastProcessedTurn: state.turn - 1 };
    minorCiv.diplomacy.atWarWith = ['player'];
    state.civilizations.player.diplomacy.atWarWith = [minorCiv.id];

    const chosen = chooseMinorCivQueueItem(state, minorCiv.id);
    const candidates = getMinorCivBuildCandidates(state, minorCiv.id);

    expect(candidates.units.map(unit => unit.type)).toContain(chosen);
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

describe('minor-civ hidden production', () => {
  it('processes real city production and completes a minor-civ building', () => {
    const state = createNewGame(undefined, 'minor-economy-building', 'small');
    const minorCiv = Object.values(state.minorCivs)[0];
    const city = state.cities[minorCiv.cityId];
    const legalBuilding = getMinorCivBuildCandidates(state, minorCiv.id).buildings[0]!.id;
    city.productionQueue = [legalBuilding];
    city.productionProgress = 999;
    minorCiv.economy = { policy: 'defense', posture: 'fortifying', lastProcessedTurn: 0 };

    const result = processMinorCivEconomyTurn(state, minorCiv.id);

    expect(result.state.cities[city.id].buildings).toContain(legalBuilding);
    expect(result.state.minorCivs[minorCiv.id].economy?.recentProductionSummary).toMatchObject({
      itemId: legalBuilding,
      itemClass: 'building',
      completedTurn: state.turn,
    });
  });

  it('completes a minor-civ unit into state.units and mc.units with no same-turn action', () => {
    const state = createNewGame(undefined, 'minor-economy-unit', 'small');
    const minorCiv = Object.values(state.minorCivs)[0];
    const city = state.cities[minorCiv.cityId];
    city.productionQueue = ['warrior'];
    city.productionProgress = 999;
    minorCiv.economy = { policy: 'defense', posture: 'mobilizing', lastProcessedTurn: 0 };
    const beforeUnitIds = new Set(Object.keys(state.units));

    const result = processMinorCivEconomyTurn(state, minorCiv.id);
    const newUnit = Object.values(result.state.units).find(unit => !beforeUnitIds.has(unit.id))!;

    expect(newUnit.owner).toBe(minorCiv.id);
    expect(result.state.minorCivs[minorCiv.id].units).toContain(newUnit.id);
    expect(newUnit.movementPointsLeft).toBe(0);
    expect(newUnit.hasMoved).toBe(true);
    expect(newUnit.hasActed).toBe(true);
  });

  it('stores pending unit spawn when city and adjacent tiles are occupied', () => {
    const state = createNewGame(undefined, 'minor-economy-pending-spawn', 'small');
    const minorCiv = Object.values(state.minorCivs)[0];
    const city = state.cities[minorCiv.cityId];
    city.productionQueue = ['warrior'];
    city.productionProgress = 999;
    minorCiv.economy = { policy: 'defense', posture: 'mobilizing', lastProcessedTurn: 0 };
    const adjacent = state.map.wrapsHorizontally
      ? getWrappedHexNeighbors(city.position, state.map.width)
      : hexNeighbors(city.position);
    const occupied = [city.position, ...adjacent];
    occupied.forEach((coord, index) => {
      const blocker = createUnit('warrior', 'player', coord, state.idCounters);
      blocker.id = `spawn-blocker-${index}`;
      state.units[blocker.id] = blocker;
    });

    const result = processMinorCivEconomyTurn(state, minorCiv.id);

    expect(result.state.minorCivs[minorCiv.id].economy?.pendingUnitSpawn).toMatchObject({
      unitType: 'warrior',
      completedTurn: state.turn,
      attempts: 1,
    });
    expect(Object.values(result.state.units).filter(unit => unit.owner === minorCiv.id && unit.type === 'warrior')).toHaveLength(1);
  });

  it('retries pending spawns before adding more production progress and clears after creation', () => {
    const state = createNewGame(undefined, 'minor-economy-pending-retry', 'small');
    const minorCiv = Object.values(state.minorCivs)[0];
    const city = state.cities[minorCiv.cityId];
    city.productionQueue = ['walls'];
    city.productionProgress = 0;
    minorCiv.economy = {
      policy: 'defense',
      posture: 'mobilizing',
      lastProcessedTurn: 0,
      pendingUnitSpawn: { unitType: 'warrior', completedTurn: state.turn - 1, attempts: 1 },
    };
    const beforeProgress = city.productionProgress;
    const beforeUnitIds = new Set(Object.keys(state.units));

    const result = processMinorCivEconomyTurn(state, minorCiv.id);
    const newUnit = Object.values(result.state.units).find(unit => !beforeUnitIds.has(unit.id))!;

    expect(newUnit.owner).toBe(minorCiv.id);
    expect(result.state.minorCivs[minorCiv.id].economy?.pendingUnitSpawn).toBeUndefined();
    expect(result.state.cities[city.id].productionProgress).toBe(beforeProgress);
  });

  it('does not process destroyed or captured city-states', () => {
    const state = createNewGame(undefined, 'minor-economy-captured-skip', 'small');
    const minorCiv = Object.values(state.minorCivs)[0];
    const city = state.cities[minorCiv.cityId];
    const legalBuilding = getMinorCivBuildCandidates(state, minorCiv.id).buildings[0]!.id;
    city.owner = 'player';
    city.productionQueue = [legalBuilding];
    city.productionProgress = 999;

    const result = processMinorCivEconomyTurn(state, minorCiv.id);

    expect(result.state.cities[city.id].buildings).not.toContain(legalBuilding);
  });

  it('does not replace an active legal hidden queue item just because the decision interval elapsed', () => {
    const state = createNewGame(undefined, 'minor-economy-preserve-queue', 'small');
    const minorCiv = Object.values(state.minorCivs)[0];
    const city = state.cities[minorCiv.cityId];
    const legalBuilding = getMinorCivBuildCandidates(state, minorCiv.id).buildings[0]!.id;
    city.productionQueue = [legalBuilding];
    city.productionProgress = 1;
    minorCiv.economy = {
      policy: 'balanced',
      posture: 'settled',
      lastProcessedTurn: 0,
      lastQueueDecisionTurn: 0,
    };
    state.turn = 20;

    const result = processMinorCivEconomyTurn(state, minorCiv.id);

    expect(result.state.cities[city.id].productionQueue[0]).toBe(legalBuilding);
    expect(result.state.cities[city.id].productionProgress).toBeGreaterThan(1);
  });
});

describe('#855 — spy unit exclusion from minor-civ defense catalog', () => {
  it('never treats either new spy tier as a safe minor-civ defensive unit', () => {
    expect(SAFE_MINOR_CIV_UNIT_TYPES.has('spy_intelligence_officer')).toBe(false);
    expect(SAFE_MINOR_CIV_UNIT_TYPES.has('spy_station_chief')).toBe(false);
  });
});

// city.ownedTiles is only the geometric founding claim radius — tile.owner is a separate map
// field that a freshly placed minor civ never claims (getWorkableTilesForCity requires
// tile.owner === city.owner), so a realistic high-yield growth fixture must set both.
function boostCityToGrassland(state: ReturnType<typeof createNewGame>, cityOwner: string, ownedTiles: { q: number; r: number }[]): void {
  for (const coord of ownedTiles) {
    const key = hexKey(coord);
    state.map.tiles[key] = { ...state.map.tiles[key], terrain: 'grassland', resource: null, owner: cityOwner };
  }
}

describe('#948 — minor-civ population ceiling', () => {
  it('returns the era-1/2 ceiling for a freshly placed city-state', () => {
    const state = createNewGame(undefined, 'minor-pop-ceiling-era1', 'small');
    const minorCiv = Object.values(state.minorCivs)[0];

    expect(getMinorCivPopulationCeiling(state, minorCiv.id)).toBe(6);
  });

  it('raises the ceiling as nearby pressure era advances', () => {
    const state = createNewGame(undefined, 'minor-pop-ceiling-era-scale', 'small');
    const minorCiv = Object.values(state.minorCivs)[0];
    const city = state.cities[minorCiv.cityId];
    state.cities['pressure-source'] = {
      id: 'pressure-source', owner: 'player', position: { q: city.position.q + 1, r: city.position.r },
    } as never;
    state.civilizations.player.cities = ['pressure-source'];
    setPlayerCivEra(state, 3);

    expect(getMinorCivPopulationCeiling(state, minorCiv.id)).toBe(10);
  });

  it('is deterministic for identical input state', () => {
    const state = createNewGame(undefined, 'minor-pop-ceiling-deterministic', 'small');
    const minorCiv = Object.values(state.minorCivs)[0];

    expect(getMinorCivPopulationCeiling(state, minorCiv.id))
      .toBe(getMinorCivPopulationCeiling(state, minorCiv.id));
  });

  it('does not vary the ceiling by opponent challenge tier', () => {
    const state = createNewGame(undefined, 'minor-pop-ceiling-difficulty', 'small');
    const minorCiv = Object.values(state.minorCivs)[0];
    state.opponentChallenge = 'explorer';
    const explorerCeiling = getMinorCivPopulationCeiling(state, minorCiv.id);
    state.opponentChallenge = 'veteran';
    const veteranCeiling = getMinorCivPopulationCeiling(state, minorCiv.id);

    expect(explorerCeiling).toBe(veteranCeiling);
  });

  it('grows normally below the ceiling', () => {
    const state = createNewGame(undefined, 'minor-pop-grow-below-cap', 'small');
    const minorCiv = Object.values(state.minorCivs)[0];
    const city = state.cities[minorCiv.cityId];
    city.population = 4;
    city.food = city.foodNeeded - 1;
    boostCityToGrassland(state, minorCiv.id, city.ownedTiles);

    const result = processMinorCivEconomyTurn(state, minorCiv.id);

    expect(result.state.cities[city.id].population).toBe(5);
  });

  it('stops growth exactly at the ceiling and does not exceed it', () => {
    const state = createNewGame(undefined, 'minor-pop-stop-at-cap', 'small');
    const minorCiv = Object.values(state.minorCivs)[0];
    const city = state.cities[minorCiv.cityId];
    boostCityToGrassland(state, minorCiv.id, city.ownedTiles);
    city.population = 6; // era-1/2 ceiling
    city.food = city.foodNeeded - 1;

    const result = processMinorCivEconomyTurn(state, minorCiv.id);

    expect(result.state.cities[city.id].population).toBe(6);
  });

  it('does not bank food beyond the growth threshold while capped', () => {
    const state = createNewGame(undefined, 'minor-pop-no-food-banking', 'small');
    const minorCiv = Object.values(state.minorCivs)[0];
    const city = state.cities[minorCiv.cityId];
    boostCityToGrassland(state, minorCiv.id, city.ownedTiles);
    city.population = 6;
    city.food = 0;

    let nextState = state;
    for (let turn = 0; turn < 20; turn++) {
      nextState = { ...nextState, turn: nextState.turn + 1 };
      const result = processMinorCivEconomyTurn(nextState, minorCiv.id);
      nextState = result.state;
    }

    const finalCity = nextState.cities[city.id];
    expect(finalCity.population).toBe(6);
    expect(finalCity.food).toBeLessThan(finalCity.foodNeeded);
  });

  it('preserves an over-cap legacy population without shrinking it, and blocks further growth', () => {
    const state = createNewGame(undefined, 'minor-pop-over-cap-legacy', 'small');
    const minorCiv = Object.values(state.minorCivs)[0];
    const city = state.cities[minorCiv.cityId];
    boostCityToGrassland(state, minorCiv.id, city.ownedTiles);
    city.population = 9; // above the era-1/2 ceiling of 6, simulating a pre-patch save
    city.food = city.foodNeeded - 1;

    const result = processMinorCivEconomyTurn(state, minorCiv.id);

    expect(result.state.cities[city.id].population).toBe(9);
  });

  it('resumes growth once the era-scaled ceiling rises above the current population', () => {
    const state = createNewGame(undefined, 'minor-pop-resume-after-era', 'small');
    const minorCiv = Object.values(state.minorCivs)[0];
    const city = state.cities[minorCiv.cityId];
    boostCityToGrassland(state, minorCiv.id, city.ownedTiles);
    city.population = 6;
    city.food = city.foodNeeded - 1;
    const capped = processMinorCivEconomyTurn(state, minorCiv.id);
    expect(capped.state.cities[city.id].population).toBe(6);

    const nextState = capped.state;
    nextState.cities[city.id].food = nextState.cities[city.id].foodNeeded - 1;
    nextState.cities['pressure-source'] = {
      id: 'pressure-source', owner: 'player', position: { q: city.position.q + 1, r: city.position.r },
    } as never;
    nextState.civilizations.player.cities = ['pressure-source'];
    setPlayerCivEra(nextState, 3);

    const resumed = processMinorCivEconomyTurn(nextState, minorCiv.id);

    expect(resumed.state.cities[city.id].population).toBe(7);
  });

  it('produces a deterministic result from identical starting state', () => {
    const state = createNewGame(undefined, 'minor-pop-deterministic-turn', 'small');
    const minorCiv = Object.values(state.minorCivs)[0];
    const city = state.cities[minorCiv.cityId];
    boostCityToGrassland(state, minorCiv.id, city.ownedTiles);
    city.population = 5;
    city.food = 3;

    const resultA = processMinorCivEconomyTurn(structuredClone(state), minorCiv.id);
    const resultB = processMinorCivEconomyTurn(structuredClone(state), minorCiv.id);

    expect(resultA.state.cities[city.id].population).toBe(resultB.state.cities[city.id].population);
    expect(resultA.state.cities[city.id].food).toBe(resultB.state.cities[city.id].food);
  });
});

describe('#948 — production-backed modernization remains authoritative', () => {
  it('makes a newer era-appropriate defender selectable through production once pressure era advances, with no rewrite involved', () => {
    const state = createNewGame(undefined, 'minor-modernization-era1', 'small');
    const minorCiv = Object.values(state.minorCivs)[0];
    const eraOneCandidates = getMinorCivBuildCandidates(state, minorCiv.id);
    expect(eraOneCandidates.units.map(unit => unit.type)).not.toContain('pikeman');

    const city = state.cities[minorCiv.cityId];
    state.cities['pressure-source'] = {
      id: 'pressure-source', owner: 'player', position: { q: city.position.q + 1, r: city.position.r },
    } as never;
    state.civilizations.player.cities = ['pressure-source'];
    setPlayerCivEra(state, 3);

    const eraThreeCandidates = getMinorCivBuildCandidates(state, minorCiv.id);
    expect(eraThreeCandidates.units.map(unit => unit.type)).toContain('pikeman');

    // Prove the newer defender is reachable through the real selection path (not just present in
    // the raw candidate list) by forcing mobilizing posture, where scoreUnit never returns a
    // negative score for any legal candidate under the unit cap: the queue choice must land on
    // some real unit type, and that unit type must exist in the era-appropriate candidate set —
    // i.e. modernization flows through production, exactly like every other minor-civ unit choice,
    // with nothing special-cased for "newer than what this city already has".
    minorCiv.diplomacy.atWarWith = ['player'];
    state.civilizations.player.diplomacy.atWarWith = [minorCiv.id];
    const chosen = chooseMinorCivQueueItem(state, minorCiv.id);
    expect(eraThreeCandidates.units.map(unit => unit.type)).toContain(chosen);
  });
});

describe('#948 — long-run city-state population bound', () => {
  it('keeps population within the era-scaled ceiling and units non-rewritten over 120 peaceful turns', () => {
    const state = createNewGame(undefined, 'minor-pop-long-run-948', 'small');
    const minorCiv = Object.values(state.minorCivs)[0];
    const city = state.cities[minorCiv.cityId];
    boostCityToGrassland(state, minorCiv.id, city.ownedTiles);
    const trackedUnitId = minorCiv.units[0];
    const startingType = state.units[trackedUnitId].type;
    const startingPopulation = city.population;

    let nextState = state;
    const populationHistory: number[] = [];
    for (let turn = 0; turn < 120; turn++) {
      nextState = { ...nextState, turn: nextState.turn + 1 };
      if (turn === 60) {
        // Mid-run era advance: nearby major civ reaches era 3, raising the ceiling from 6 to 10.
        nextState = {
          ...nextState,
          cities: {
            ...nextState.cities,
            'pressure-source': {
              id: 'pressure-source', owner: 'player', position: { q: city.position.q + 1, r: city.position.r },
            } as never,
          },
          civilizations: {
            ...nextState.civilizations,
            player: {
              ...nextState.civilizations.player,
              cities: ['pressure-source'],
              techState: {
                ...nextState.civilizations.player.techState,
                completed: Array.from({ length: 2 }, (_, index) => index + 2)
                  .flatMap(candidate => getEraAdvancementTechs(candidate)
                    .slice(0, Math.ceil(getEraAdvancementTechs(candidate).length * 0.5))
                    .map(tech => tech.id)),
              },
            },
          },
        };
      }
      const result = processMinorCivEconomyTurn(nextState, minorCiv.id);
      nextState = result.state;
      const ceiling = getMinorCivPopulationCeiling(nextState, minorCiv.id);
      const pop = nextState.cities[city.id].population;
      populationHistory.push(pop);
      expect(pop).toBeLessThanOrEqual(ceiling);
    }

    const finalCity = nextState.cities[city.id];
    expect(finalCity.population).toBeGreaterThan(startingPopulation);
    expect(finalCity.population).toBeLessThanOrEqual(10);
    expect(state.units[trackedUnitId].type).toBe(startingType);
    expect(populationHistory.every(pop => Number.isFinite(pop) && pop >= 0)).toBe(true);

    const replay = processMinorCivEconomyTurn(structuredClone(nextState), minorCiv.id);
    const replayAgain = processMinorCivEconomyTurn(structuredClone(nextState), minorCiv.id);
    expect(replay.state.cities[city.id].population).toBe(replayAgain.state.cities[city.id].population);
  });
});

describe('#951 — emergency levy eligibility', () => {
  function makeSeverelyThreatenedMinorCiv(seed: string, era = 4) {
    const state = createNewGame(undefined, seed, 'small');
    state.era = era;
    const minorCiv = Object.values(state.minorCivs)[0];
    setPlayerCivEra(state, era);
    const city = state.cities[minorCiv.cityId];
    city.population = 4;
    minorCiv.regionalGrievanceByCiv = {
      player: {
        targetCivId: 'player',
        pressure: 85,
        status: 'coalition-talks',
        lastUpdatedTurn: state.turn,
        causes: [],
      },
    };
    return { state, minorCiv, city };
  }

  it('is eligible when severely threatened with room below the population floor, force floor, and unit cap', () => {
    const { state, minorCiv } = makeSeverelyThreatenedMinorCiv('mc-levy-eligible');

    const result = evaluateMinorCivEmergencyLevy(state, minorCiv.id);

    expect(result).toMatchObject({ eligible: true });
  });

  it('is not eligible with no war, no nearby hostile unit, and no severe grievance pressure', () => {
    const state = createNewGame(undefined, 'mc-levy-no-threat', 'small');
    const minorCiv = Object.values(state.minorCivs)[0];

    expect(evaluateMinorCivEmergencyLevy(state, minorCiv.id)).toEqual({ eligible: false, reason: 'no-threat' });
  });

  it('is not eligible in an era-1 region even under severe pressure (early-game safety)', () => {
    const state = createNewGame(undefined, 'mc-levy-era-one-embargo', 'small');
    const minorCiv = Object.values(state.minorCivs)[0];
    state.cities[minorCiv.cityId].population = 4;
    // No era advancement at all — pressureEra resolves to 1. Pressure itself (unlike grievance
    // *status*) is not era-gated, so a high-pressure record is the way to reach severeThreat=true
    // while still exercising the era-1 embargo specifically, rather than falling through to the
    // unrelated 'no-threat' reason.
    minorCiv.regionalGrievanceByCiv = {
      player: {
        targetCivId: 'player',
        pressure: 85,
        status: 'wary',
        lastUpdatedTurn: state.turn,
        causes: [],
      },
    };

    expect(evaluateMinorCivEmergencyLevy(state, minorCiv.id)).toEqual({ eligible: false, reason: 'region-immature' });
  });

  it('is not eligible while the levy cooldown is still active', () => {
    const { state, minorCiv } = makeSeverelyThreatenedMinorCiv('mc-levy-cooldown-gate');
    minorCiv.economy = {
      policy: 'defense',
      posture: 'mobilizing',
      lastProcessedTurn: state.turn,
      levyCooldownUntilTurn: state.turn + MINOR_CIV_LEVY_COOLDOWN_TURNS,
    };

    expect(evaluateMinorCivEmergencyLevy(state, minorCiv.id)).toEqual({ eligible: false, reason: 'cooldown' });
  });

  it(`is not eligible at or below the population floor (${MINOR_CIV_LEVY_MIN_POPULATION})`, () => {
    const { state, minorCiv, city } = makeSeverelyThreatenedMinorCiv('mc-levy-population-gate');
    city.population = MINOR_CIV_LEVY_MIN_POPULATION;

    expect(evaluateMinorCivEmergencyLevy(state, minorCiv.id)).toEqual({ eligible: false, reason: 'population-floor' });
  });

  it(`is not eligible once already fielding ${MINOR_CIV_LEVY_MIN_DEFENSIVE_FORCE} or more living units`, () => {
    const { state, minorCiv, city } = makeSeverelyThreatenedMinorCiv('mc-levy-force-gate');
    for (let i = minorCiv.units.length; i < MINOR_CIV_LEVY_MIN_DEFENSIVE_FORCE; i++) {
      const extra = createUnit('warrior', minorCiv.id, city.position, state.idCounters);
      state.units[extra.id] = extra;
      minorCiv.units.push(extra.id);
    }

    expect(evaluateMinorCivEmergencyLevy(state, minorCiv.id)).toEqual({ eligible: false, reason: 'sufficient-force' });
  });

  it('is not eligible when the live unit cap would be exceeded', () => {
    const { state, minorCiv, city } = makeSeverelyThreatenedMinorCiv('mc-levy-cap-gate');
    const cap = getMinorCivUnitCap(state, minorCiv.id, 'mobilizing');
    for (let i = minorCiv.units.length; i < cap; i++) {
      const extra = createUnit('worker', minorCiv.id, city.position, state.idCounters);
      state.units[extra.id] = extra;
      minorCiv.units.push(extra.id);
    }

    expect(evaluateMinorCivEmergencyLevy(state, minorCiv.id)).toEqual({ eligible: false, reason: 'unit-cap' });
  });

  it('is not eligible when every legal spawn tile around the city is blocked', () => {
    const { state, minorCiv, city } = makeSeverelyThreatenedMinorCiv('mc-levy-spawn-gate');
    const blockerPositions = [city.position, ...getWrappedHexNeighbors(city.position, state.map.width)];
    for (const [index, coord] of blockerPositions.entries()) {
      const blocker = createUnit('warrior', 'barbarian', coord, state.idCounters);
      blocker.id = `levy-spawn-blocker-${index}`;
      state.units[blocker.id] = blocker;
    }

    expect(evaluateMinorCivEmergencyLevy(state, minorCiv.id)).toEqual({ eligible: false, reason: 'no-spawn' });
  });

  it('never selects a naval or air unit even when the build catalog includes one', () => {
    const { state, minorCiv } = makeSeverelyThreatenedMinorCiv('mc-levy-land-only', 6);

    const result = evaluateMinorCivEmergencyLevy(state, minorCiv.id);

    expect(result.eligible).toBe(true);
    if (result.eligible) {
      expect(['warrior', 'archer', 'swordsman', 'pikeman', 'musketeer', 'rifleman']).toContain(result.unitType);
    }
  });
});

describe('#951 — long-run emergency-levy conflict scenario', () => {
  it('keeps levies rare and bounded over 120 turns of sustained war, and replays deterministically', () => {
    function runScenario() {
      const state = createNewGame(undefined, 'mc-951-long-run-conflict', 'small');
      const minorCiv = Object.values(state.minorCivs)[0];
      const city = state.cities[minorCiv.cityId];
      setPlayerCivEra(state, 4);
      state.era = 4;
      minorCiv.diplomacy.atWarWith = ['player'];
      state.civilizations.player.diplomacy.atWarWith = [minorCiv.id];
      // A standing hostile unit within hasImmediateCityThreat's radius keeps genuine pressure on
      // every turn without needing to hand-simulate AI movement in this scoped test.
      const raider = createUnit('warrior', 'player', { q: city.position.q + 1, r: city.position.r }, state.idCounters);
      raider.id = 'long-run-raider';
      state.units[raider.id] = raider;

      let nextState = state;
      let levyCount = 0;
      let recoveringTurns = 0;
      const populationHistory: number[] = [];
      const unitCountHistory: number[] = [];

      for (let turn = 0; turn < 120; turn++) {
        nextState = { ...nextState, turn: nextState.turn + 1 };
        const before = nextState.minorCivs[minorCiv.id].economy?.levyCooldownUntilTurn;
        const result = processMinorCivEconomyTurn(nextState, minorCiv.id);
        nextState = result.state;
        const after = nextState.minorCivs[minorCiv.id].economy;
        if (after?.levyCooldownUntilTurn && after.levyCooldownUntilTurn !== before) {
          levyCount++;
        }
        if (after?.posture === 'recovering') {
          recoveringTurns++;
        }
        const liveUnits = nextState.minorCivs[minorCiv.id].units.filter(unitId => Boolean(nextState.units[unitId]));
        populationHistory.push(nextState.cities[city.id].population);
        unitCountHistory.push(liveUnits.length);
        const cap = getMinorCivUnitCap(nextState, minorCiv.id, 'mobilizing');
        expect(liveUnits.length).toBeLessThanOrEqual(cap);
      }

      return { nextState, levyCount, recoveringTurns, populationHistory, unitCountHistory, city };
    }

    const first = runScenario();
    const second = runScenario();

    // Levies are gated by a 10-turn cooldown plus a real population cost; over 120 turns of
    // constant war this must stay rare, never "every attacked city-state levies routinely" (#951).
    expect(first.levyCount).toBeGreaterThan(0);
    expect(first.levyCount).toBeLessThanOrEqual(12);
    expect(first.recoveringTurns).toBeGreaterThan(0);
    expect(first.populationHistory.every(pop => pop >= MINOR_CIV_LEVY_MIN_POPULATION)).toBe(true);
    expect(Math.min(...first.populationHistory)).toBeGreaterThan(0);

    // No dead mobilizationProgress accumulation: the field no longer exists on the type at all,
    // so nothing in this 120-turn run could have written it — economy state is the full story.
    expect(first.nextState.minorCivs[first.city.owner]?.economy).not.toHaveProperty('mobilizationProgress');

    expect(second.levyCount).toBe(first.levyCount);
    expect(second.populationHistory).toEqual(first.populationHistory);
    expect(second.unitCountHistory).toEqual(first.unitCountHistory);
  });
});
