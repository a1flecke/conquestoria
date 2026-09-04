import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import {
  chooseMinorCivQueueItem,
  evaluateMinorCivEconomyPosture,
  getMinorCivAvailableResources,
  getMinorCivBuildCandidates,
  getMinorCivCompletedTechBand,
  getMinorCivPopulationCeiling,
  getMinorCivUnitCap,
  normalizeMinorCivEconomyState,
  processMinorCivEconomyTurn,
  SAFE_MINOR_CIV_UNIT_TYPES,
} from '@/systems/minor-civ-economy-system';
import { getCivAvailableResources } from '@/systems/resource-acquisition-system';
import { getWrappedHexNeighbors, hexKey, hexNeighbors } from '@/systems/hex-utils';
import { createUnit } from '@/systems/unit-system';
import { getEraAdvancementTechs } from '@/systems/tech-definitions';

// Mirrors setTargetCivEra in tests/systems/minor-civ-system.test.ts: to actually reach personal
// era N (not just complete some era-N techs), a civ needs partial completion of every era from 2
// through N. resolveNeutralPressureEra reads the nearby major civ's real resolved era, so a
// population-ceiling test that wants to cross an era band boundary must fully walk the chain.
function setPlayerCivEra(state: ReturnType<typeof createNewGame>, era: number): void {
  state.civilizations.player.techState.completed = Array.from({ length: Math.max(0, era - 1) }, (_, index) => index + 2)
    .flatMap(candidate => getEraAdvancementTechs(candidate)
      .slice(0, Math.ceil(getEraAdvancementTechs(candidate).length * (candidate <= 3 ? 0.5 : candidate <= 8 ? 0.6 : 0.55)))
      .map(tech => tech.id));
}

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
    state.map.tiles[key] = { ...state.map.tiles[key], terrain: 'grassland', resource: undefined, owner: cityOwner };
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
