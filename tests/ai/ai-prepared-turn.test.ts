import { describe, expect, it } from 'vitest';
import {
  getPreparedAssignmentProfile,
  incrementalDemandSeed,
  mergePreparedForceDemands,
  prepareMajorCivStrategicPlan,
  WORKER_SOFT_CAP,
} from '@/ai/ai-prepared-turn';
import { EXPANSION_SEARCH_RADIUS } from '@/ai/ai-expansion-sites';
import { createEmptyMajorCivPortfolio } from '@/ai/ai-plan-portfolio';
import { refreshMajorCivIntel } from '@/ai/ai-perception';
import { applyAIProduction } from '@/ai/ai-production';
import { createNewGame } from '@/core/game-state';
import { getWrappedHexNeighbors, hexDistance, hexKey, mapHexesInRange } from '@/systems/hex-utils';
import { foundCity } from '@/systems/city-system';
import {
  cityDistance,
  isCityCenterTerrain,
  MIN_CITY_CENTER_DISTANCE,
} from '@/systems/city-territory-system';
import { createUnit, findPath, UNIT_DEFINITIONS } from '@/systems/unit-system';
import type { GameState, HexCoord, TerrainType } from '@/core/types';

/** Found `count` extra cities for `civId` on real, legally spaced land tiles. */
function addSpacedCities(state: GameState, civId: string, count: number): void {
  const civ = state.civilizations[civId]!;
  const taken = Object.values(state.cities).map(city => city.position);
  for (const tile of Object.values(state.map.tiles)) {
    if (civ.cities.length >= count + 1) break;
    if (!isCityCenterTerrain(tile.terrain)) continue;
    if (taken.some(position => cityDistance(tile.coord, position, state.map) < MIN_CITY_CENTER_DISTANCE)) continue;
    const city = foundCity(civId, tile.coord, state.map, state.idCounters);
    state.cities[city.id] = city;
    civ.cities.push(city.id);
    taken.push(tile.coord);
    // The real game founds cities through foundCityInState, which updates visibility
    // around the new city. This raw `foundCity` helper does not -- without revealing a
    // radius here, `buildKnownPathMap`'s fog-bounded map would have no known tiles
    // anywhere near a city founded far from the civ's original starting position, and
    // any expand-candidate site search anchored on it would legitimately find nothing.
    for (const coord of mapHexesInRange(state.map, city.position, EXPANSION_SEARCH_RADIUS)) {
      civ.visibility.tiles[hexKey(coord)] = 'visible';
    }
  }
}

function setupVisibleDefendedCapture(
  seed: string,
  options: { archery?: boolean; garrison?: boolean } = {},
) {
  const state = createNewGame(undefined, seed, 'small');
  const civ = state.civilizations['ai-1'];
  const anchor = civ.units.map(id => state.units[id]).find(Boolean)!.position;
  const targetTile = Object.values(state.map.tiles)
    .filter(tile =>
      hexDistance(anchor, tile.coord) === 1
      && findPath(anchor, tile.coord, state.map, 'land') !== null)
    .sort((left, right) => hexKey(left.coord).localeCompare(hexKey(right.coord)))[0]!;
  const ownCity = foundCity(civ.id, anchor, state.map, state.idCounters);
  const targetCity = foundCity('player', targetTile.coord, state.map, state.idCounters);
  targetCity.buildings.push('walls');
  state.cities[ownCity.id] = ownCity;
  state.cities[targetCity.id] = targetCity;
  civ.cities = [ownCity.id];
  state.civilizations.player.cities = [targetCity.id];
  for (const unitId of [...civ.units]) {
    if (UNIT_DEFINITIONS[state.units[unitId]!.type].strength > 0) {
      delete state.units[unitId];
      civ.units = civ.units.filter(id => id !== unitId);
    }
  }
  const attacker = createUnit('warrior', civ.id, anchor, state.idCounters);
  state.units[attacker.id] = attacker;
  civ.units.push(attacker.id);
  if (options.garrison !== false) {
    const garrison = createUnit('warrior', 'player', targetCity.position, state.idCounters);
    state.units[garrison.id] = garrison;
    state.civilizations.player.units.push(garrison.id);
  }
  civ.knownCivilizations = ['player'];
  civ.diplomacy.atWarWith = ['player'];
  if (options.archery) civ.techState.completed = ['archery'];
  civ.visibility.tiles = {
    [hexKey(anchor)]: 'visible',
    [hexKey(targetCity.position)]: 'visible',
  };
  return { state, civ, ownCity, targetCity };
}

describe('prepared major-civilization planning', () => {
  it.each([
    ['explorer', 4],
    ['standard', 6],
    ['veteran', 8],
  ] as const)('uses the %s challenge profile force cap', (challenge, expectedCap) => {
    const state = createNewGame(undefined, `prepared-${challenge}-cap`, 'small');
    state.opponentChallenge = challenge;
    expect(getPreparedAssignmentProfile(state).maxPrimaryForce).toBe(expectedCap);
  });


  it.each([
    ['explorer', 1],
    ['standard', 2],
    ['veteran', 2],
  ] as const)('caps visible armor response at %s profile capacity', (challenge, expected) => {
    const state = createNewGame(undefined, `prepared-anti-armor-${challenge}`, 'small');
    const civ = state.civilizations['ai-1'];
    state.opponentChallenge = challenge;
    civ.knownCivilizations = ['player'];
    civ.diplomacy.atWarWith = ['player'];
    const tiles = Object.values(state.map.tiles)
      .filter(tile => tile.terrain !== 'mountain')
      .slice(0, 3);
    for (const [index, tile] of tiles.entries()) {
      const tank = createUnit('tank', 'player', tile.coord, state.idCounters);
      tank.id = `observed-tank-${index}`;
      state.units[tank.id] = tank;
      state.civilizations.player.units.push(tank.id);
      civ.visibility.tiles[hexKey(tile.coord)] = 'visible';
    }

    const demand = prepareMajorCivStrategicPlan(state, civ.id).forceDemands
      .find(entry => entry.role === 'anti-armor');

    expect(demand).toMatchObject({
      desired: expected,
      assigned: 0,
      missing: expected,
      priority: 180,
      sourcePlanIds: ['observed-armor'],
    });
  });

  it('does not create anti-armor demand from a peaceful civilization\'s visible Tank', () => {
    const state = createNewGame(undefined, 'prepared-peaceful-armor', 'small');
    const civ = state.civilizations['ai-1'];
    const tile = Object.values(state.map.tiles).find(tile => tile.terrain !== 'mountain')!;
    const tank = createUnit('tank', 'player', tile.coord, state.idCounters);
    tank.id = 'peaceful-observed-tank';
    state.units[tank.id] = tank;
    state.civilizations.player.units.push(tank.id);
    civ.knownCivilizations = ['player'];
    civ.diplomacy.atWarWith = [];
    civ.visibility.tiles[hexKey(tile.coord)] = 'visible';

    const demand = prepareMajorCivStrategicPlan(state, civ.id).forceDemands
      .find(entry => entry.role === 'anti-armor');

    expect(demand).toBeUndefined();
  });

  it('creates Mobile AA demand only for observed hostile strike aircraft, not reconnaissance', () => {
    const state = createNewGame(undefined, 'prepared-air-defense', 'small');
    const civ = state.civilizations['ai-1'];
    civ.knownCivilizations = ['player'];
    civ.diplomacy.atWarWith = ['player'];
    const [strikeTile, reconTile] = Object.values(state.map.tiles).filter(tile => tile.terrain !== 'mountain').slice(0, 2);
    const fighter = createUnit('biplane', 'player', strikeTile!.coord, state.idCounters);
    const balloon = createUnit('observation_balloon', 'player', reconTile!.coord, state.idCounters);
    state.units[fighter.id] = fighter; state.units[balloon.id] = balloon;
    state.civilizations.player.units.push(fighter.id, balloon.id);
    civ.visibility.tiles[hexKey(strikeTile!.coord)] = 'visible';
    civ.visibility.tiles[hexKey(reconTile!.coord)] = 'visible';

    expect(prepareMajorCivStrategicPlan(state, civ.id).forceDemands).toContainEqual(expect.objectContaining({
      role: 'air-defense', desired: 1, missing: 1, sourcePlanIds: ['observed-air'],
    }));

    delete state.units[fighter.id];
    state.civilizations.player.units = state.civilizations.player.units.filter(id => id !== fighter.id);
    expect(prepareMajorCivStrategicPlan(state, civ.id).forceDemands.some(entry => entry.role === 'air-defense')).toBe(false);
  });

  it('does not seed an unselected resource operation while a viable expansion plan exists', () => {
    const state = createNewGame(undefined, 'prepared-objective-demand', 'small');
    const civ = state.civilizations['ai-1'];
    const anchor = civ.units.map(id => state.units[id]).find(Boolean)!.position;
    const resourceTile = Object.values(state.map.tiles)
      .filter(tile => hexDistance(anchor, tile.coord) === 1)
      .sort((left, right) => hexKey(left.coord).localeCompare(hexKey(right.coord)))[0];
    resourceTile.resource = 'iron';
    resourceTile.owner = null;
    civ.visibility.tiles[hexKey(resourceTile.coord)] = 'visible';

    const prepared = prepareMajorCivStrategicPlan(state, 'ai-1');

    expect(prepared.portfolio.primaryPlan?.objective).toBe('expand');
    expect(prepared.forceDemands.find(demand =>
      demand.role === 'resource-expedition' && demand.sourcePlanIds.includes('objective-readiness')),
    ).toBeUndefined();
  });

  it('does not draft conquest against a peaceful neighbor', () => {
    const state = createNewGame(undefined, 'prepared-peaceful-neighbor', 'small');
    const civ = state.civilizations['ai-1'];
    const anchor = civ.units.map(id => state.units[id]).find(Boolean)!.position;
    const cityTile = Object.values(state.map.tiles)
      .filter(tile =>
        hexDistance(anchor, tile.coord) === 1
        && findPath(anchor, tile.coord, state.map, 'land') !== null)
      .sort((left, right) => hexKey(left.coord).localeCompare(hexKey(right.coord)))[0];
    const city = foundCity('player', cityTile.coord, state.map, state.idCounters);
    state.cities[city.id] = city;
    state.civilizations.player.cities.push(city.id);
    civ.knownCivilizations = ['player'];
    civ.visibility.tiles[hexKey(city.position)] = 'visible';

    const prepared = prepareMajorCivStrategicPlan(state, 'ai-1');

    expect(prepared.portfolio.primaryPlan).not.toMatchObject({
      objective: 'capture',
      target: { kind: 'city', id: city.id },
    });
  });

  it('does not target a peacefully owned resource for acquisition', () => {
    const state = createNewGame(undefined, 'prepared-owned-resource', 'small');
    const civ = state.civilizations['ai-1'];
    const anchor = civ.units.map(id => state.units[id]).find(Boolean)!.position;
    const resourceTile = Object.values(state.map.tiles)
      .filter(tile =>
        hexDistance(anchor, tile.coord) === 1
        && findPath(anchor, tile.coord, state.map, 'land') !== null)
      .sort((left, right) => hexKey(left.coord).localeCompare(hexKey(right.coord)))[0];
    resourceTile.resource = 'iron';
    resourceTile.owner = 'player';
    civ.knownCivilizations = ['player'];
    civ.visibility.tiles = {
      [hexKey(anchor)]: 'visible',
      [hexKey(resourceTile.coord)]: 'visible',
    };

    const prepared = prepareMajorCivStrategicPlan(state, 'ai-1');

    expect(prepared.portfolio.primaryPlan).not.toMatchObject({
      objective: 'secure-resource',
      target: { kind: 'resource', position: resourceTile.coord },
    });
    expect(prepared.forceDemands.find(demand => demand.role === 'resource-expedition'))
      .toBeUndefined();
  });

  it('creates city defense against a visible always-hostile raider', () => {
    const state = createNewGame(undefined, 'prepared-world-threat', 'small');
    const civ = state.civilizations['ai-1'];
    const settler = civ.units
      .map(id => state.units[id])
      .find(unit => unit?.type === 'settler')!;
    const city = foundCity(civ.id, settler.position, state.map, state.idCounters);
    state.cities[city.id] = city;
    civ.cities.push(city.id);
    const threatTile = Object.values(state.map.tiles)
      .filter(tile => hexDistance(city.position, tile.coord) === 1)
      .sort((left, right) => hexKey(left.coord).localeCompare(hexKey(right.coord)))[0];
    const raider = createUnit('warrior', 'barbarian', threatTile.coord, state.idCounters);
    raider.id = 'visible-raider';
    state.units[raider.id] = raider;
    civ.visibility.tiles[hexKey(city.position)] = 'visible';
    civ.visibility.tiles[hexKey(raider.position)] = 'visible';

    const prepared = prepareMajorCivStrategicPlan(state, civ.id);

    expect(prepared.portfolio.defensePlansByCityId[city.id]).toMatchObject({
      objective: 'defend',
      target: { kind: 'city', id: city.id },
    });
  });

  it('merges overflow defense and objective readiness into actionable demand', () => {
    const demands = mergePreparedForceDemands([], [
      { role: 'resource-expedition', sourceId: 'objective-readiness', priority: 90 },
      { role: 'frontline', sourceId: 'defense-overflow:city-4', priority: 600 },
      { role: 'frontline', sourceId: 'defense-overflow:city-5', priority: 600 },
    ]);

    expect(demands).toContainEqual(expect.objectContaining({
      role: 'resource-expedition',
      desired: 1,
      missing: 1,
      sourcePlanIds: ['objective-readiness'],
    }));
    expect(demands).toContainEqual(expect.objectContaining({
      role: 'frontline',
      desired: 2,
      missing: 2,
      priority: 600,
      sourcePlanIds: ['defense-overflow:city-4', 'defense-overflow:city-5'],
    }));
  });

  it('ignores malformed observed tile snapshots when building its known path map', () => {
    const state = createNewGame(undefined, 'prepared-malformed-intel', 'small');
    const civ = state.civilizations['ai-1'];
    const key = Object.keys(state.map.tiles)[0];
    civ.visibility.tiles[key] = 'fog';
    civ.visibility.lastSeen ??= {};
    civ.visibility.lastSeen[key] = {
      source: 'observed',
      observedTurn: state.turn,
      coord: null,
    } as unknown as NonNullable<typeof civ.visibility.lastSeen>[string];

    expect(() => prepareMajorCivStrategicPlan(state, 'ai-1')).not.toThrow();
  });

  it('penalizes an offensive objective more when the perceived defender is stronger', () => {
    function captureScore(defenderType: 'warrior' | 'tank'): number {
      const state = createNewGame(undefined, `prepared-strength-${defenderType}`, 'small');
      const civ = state.civilizations['ai-1'];
      const anchor = civ.units.map(id => state.units[id]).find(Boolean)!.position;
      const cityTile = Object.values(state.map.tiles)
        .filter(tile =>
          hexDistance(anchor, tile.coord) === 1
          && findPath(anchor, tile.coord, state.map, 'land') !== null)
        .sort((left, right) => hexKey(left.coord).localeCompare(hexKey(right.coord)))[0];
      const city = foundCity('player', cityTile.coord, state.map, state.idCounters);
      state.cities[city.id] = city;
      state.civilizations.player.cities.push(city.id);
      const defender = createUnit(defenderType, 'player', city.position, state.idCounters);
      defender.id = `visible-${defenderType}`;
      state.units[defender.id] = defender;
      state.civilizations.player.units.push(defender.id);
      civ.knownCivilizations = ['player'];
      civ.diplomacy.atWarWith = ['player'];
      civ.visibility.tiles = {
        [hexKey(anchor)]: 'visible',
        [hexKey(city.position)]: 'visible',
      };

      const trace = prepareMajorCivStrategicPlan(state, 'ai-1').traces[0];
      return trace.candidates.find(entry => entry.id.includes(city.id))!.score;
    }

    expect(captureScore('tank')).toBeLessThan(captureScore('warrior'));
  });

  it('does not inflate unseen rival reserves from another civilization advancing the global era', () => {
    function captureScore(globalEra: number): number {
      const state = createNewGame(undefined, 'prepared-actor-era', 'small');
      state.era = globalEra;
      const civ = state.civilizations['ai-1'];
      const anchor = civ.units.map(id => state.units[id]).find(Boolean)!.position;
      const cityTile = Object.values(state.map.tiles)
        .filter(tile =>
          hexDistance(anchor, tile.coord) === 1
          && findPath(anchor, tile.coord, state.map, 'land') !== null)
        .sort((left, right) => hexKey(left.coord).localeCompare(hexKey(right.coord)))[0];
      const city = foundCity('player', cityTile.coord, state.map, state.idCounters);
      state.cities[city.id] = city;
      state.civilizations.player.cities.push(city.id);
      civ.knownCivilizations = ['player'];
      civ.diplomacy.atWarWith = ['player'];
      civ.visibility.tiles = {
        [hexKey(anchor)]: 'visible',
        [hexKey(city.position)]: 'visible',
      };

      return prepareMajorCivStrategicPlan(state, 'ai-1').traces[0]
        .candidates.find(entry => entry.id.includes(city.id))!.score;
    }

    expect(captureScore(10)).toBeCloseTo(captureScore(1));
  });

  it('scores from the nearest friendly city regardless of roster order', { timeout: 15000 }, () => {
    function captureScore(nearFirst: boolean): number {
      const state = createNewGame(undefined, 'prepared-nearest-city', 'medium');
      const civ = state.civilizations['ai-1'];
      const landTiles = Object.values(state.map.tiles)
        .filter(tile => findPath(tile.coord, tile.coord, state.map, 'land') !== null);
      const targetTile = landTiles.find(tile =>
        landTiles.some(candidate =>
          hexDistance(tile.coord, candidate.coord) === 1
          && findPath(candidate.coord, tile.coord, state.map, 'land') !== null)
        && landTiles.some(candidate =>
          hexDistance(tile.coord, candidate.coord) >= 7
          && findPath(candidate.coord, tile.coord, state.map, 'land') !== null))!;
      const nearTile = landTiles
        .filter(tile =>
          hexDistance(targetTile.coord, tile.coord) === 1
          && findPath(tile.coord, targetTile.coord, state.map, 'land') !== null)
        .sort((left, right) => hexKey(left.coord).localeCompare(hexKey(right.coord)))[0];
      const farTile = landTiles
        .filter(tile =>
          hexDistance(targetTile.coord, tile.coord) >= 7
          && findPath(tile.coord, targetTile.coord, state.map, 'land') !== null)
        .sort((left, right) => hexKey(left.coord).localeCompare(hexKey(right.coord)))[0];
      const nearCity = foundCity(civ.id, nearTile.coord, state.map, state.idCounters);
      const farCity = foundCity(civ.id, farTile.coord, state.map, state.idCounters);
      state.cities[nearCity.id] = nearCity;
      state.cities[farCity.id] = farCity;
      civ.cities = nearFirst
        ? [nearCity.id, farCity.id]
        : [farCity.id, nearCity.id];
      const targetCity = foundCity('player', targetTile.coord, state.map, state.idCounters);
      state.cities[targetCity.id] = targetCity;
      state.civilizations.player.cities.push(targetCity.id);
      civ.knownCivilizations = ['player'];
      civ.diplomacy.atWarWith = ['player'];
      civ.visibility.tiles = Object.fromEntries(
        Object.keys(state.map.tiles).map(key => [key, 'visible' as const]),
      );

      return prepareMajorCivStrategicPlan(state, civ.id).traces[0]
        .candidates.find(entry => entry.id.includes(targetCity.id))!.score;
    }

    expect(captureScore(false)).toBeCloseTo(captureScore(true));
  });

  it('does not assign a land unit with no known legal path to the plan', () => {
    const state = createNewGame(undefined, 'prepared-unit-path', 'medium');
    const civ = state.civilizations['ai-1'];
    for (const tile of Object.values(state.map.tiles)) tile.resource = null;
    for (const unitId of state.civilizations.player.units) delete state.units[unitId];
    state.civilizations.player.units = [];
    const warrior = civ.units
      .map(id => state.units[id])
      .find(unit => unit?.type === 'warrior')!;
    const candidateTiles = Object.values(state.map.tiles)
      .filter(tile =>
        hexDistance(tile.coord, warrior.position) >= 5
        && findPath(tile.coord, tile.coord, state.map, 'land') !== null);
    const targetTile = candidateTiles.find(tile =>
      candidateTiles.some(neighbor =>
        hexDistance(tile.coord, neighbor.coord) === 1
        && findPath(neighbor.coord, tile.coord, state.map, 'land') !== null))!;
    const homeTile = candidateTiles
      .filter(tile =>
        hexDistance(tile.coord, targetTile.coord) === 1
        && findPath(tile.coord, targetTile.coord, state.map, 'land') !== null)
      .sort((left, right) => hexKey(left.coord).localeCompare(hexKey(right.coord)))[0];
    const homeCity = foundCity(civ.id, homeTile.coord, state.map, state.idCounters);
    state.cities[homeCity.id] = homeCity;
    civ.cities = [homeCity.id];
    const targetCity = foundCity('player', targetTile.coord, state.map, state.idCounters);
    state.cities[targetCity.id] = targetCity;
    state.civilizations.player.cities.push(targetCity.id);
    for (const neighbor of getWrappedHexNeighbors(warrior.position, state.map.width)) {
      const tile = state.map.tiles[hexKey(neighbor)];
      if (tile) tile.terrain = 'ocean';
    }
    civ.knownCivilizations = ['player'];
    civ.diplomacy.atWarWith = ['player'];
    civ.visibility.tiles = Object.fromEntries(
      Object.keys(state.map.tiles).map(key => [key, 'visible' as const]),
    );

    const prepared = prepareMajorCivStrategicPlan(state, civ.id);

    expect(prepared.portfolio.primaryPlan?.target).toMatchObject({
      kind: 'city',
      id: targetCity.id,
    });
    expect(prepared.assignments.assignmentsByPlanId[prepared.portfolio.primaryPlan!.id])
      .not.toContain(warrior.id);
  });

  it('drafts a repel plan against a pirate fleet sieging the civ when aiPressure is "pirates" (#528 MR2)', () => {
    const state = createNewGame(undefined, 'prepared-pirate-dispatch', 'small');
    state.settings = { ...state.settings, aiPressure: 'pirates' };
    const civ = state.civilizations['ai-1'];
    const anchor = civ.units.map(id => state.units[id]).find(Boolean)!.position;
    const shipPosition = { q: anchor.q + 2, r: anchor.r };
    state.units['pirate-ship'] = {
      id: 'pirate-ship', type: 'pirate_frigate', owner: 'pirate-1', position: shipPosition,
      movementPointsLeft: 4, health: 100, experience: 0,
      hasMoved: false, hasActed: false, isResting: false,
    };
    state.pirates = {
      ...state.pirates!,
      factions: {
        'pirate-1': {
          id: 'pirate-1', name: 'The Red Wake', spawnedRound: 1, behavior: 'blockading',
          maritimeStage: 3, notoriety: 5, shipIds: ['pirate-ship'],
          headquarters: { kind: 'coastal-enclave', position: shipPosition, integrity: 100, maxIntegrity: 100 },
          tributeByCiv: {}, demandByCiv: {}, contract: null,
          intent: { kind: 'blockade', targetCivId: 'ai-1', targetCityId: civ.cities[0], plannedRound: state.turn },
          transitionGuards: { emittedEventKeys: [] },
        },
      },
    };

    const prepared = prepareMajorCivStrategicPlan(state, 'ai-1');

    expect(prepared.portfolio.primaryPlan).toMatchObject({
      objective: 'repel',
      target: { kind: 'unit', id: 'pirate-ship' },
    });
  });

  it('pirate dispatch competes on score, not automatic priority: a strong nearby at-war capture beats it at explorer difficulty (#528 MR2)', () => {
    const state = createNewGame(undefined, 'prepared-pirate-dispatch-compete-lose', 'small');
    state.opponentChallenge = 'explorer'; // crisisDispatchWeight 0.5 -> pirate score 50
    state.settings = { ...state.settings, aiPressure: 'pirates' };
    const civ = state.civilizations['ai-1'];
    const anchor = civ.units.map(id => state.units[id]).find(Boolean)!.position;

    // Strong, nearby, at-war capture opportunity: strategicValue 75 + distantReasonBonus 35,
    // minimal distance/loss/supply penalty at travelTurns 1 -- scores well over 50.
    const cityTile = Object.values(state.map.tiles)
      .filter(tile =>
        hexDistance(anchor, tile.coord) === 1
        && findPath(anchor, tile.coord, state.map, 'land') !== null)
      .sort((left, right) => hexKey(left.coord).localeCompare(hexKey(right.coord)))[0];
    const city = foundCity('player', cityTile.coord, state.map, state.idCounters);
    state.cities[city.id] = city;
    state.civilizations.player.cities.push(city.id);
    civ.knownCivilizations = ['player'];
    civ.diplomacy.atWarWith = ['player'];
    civ.visibility.tiles[hexKey(anchor)] = 'visible';
    civ.visibility.tiles[hexKey(city.position)] = 'visible';

    // Visible pirate fleet also targeting this civ.
    const shipPosition = { q: anchor.q + 2, r: anchor.r };
    state.units['pirate-ship'] = {
      id: 'pirate-ship', type: 'pirate_frigate', owner: 'pirate-1', position: shipPosition,
      movementPointsLeft: 4, health: 100, experience: 0,
      hasMoved: false, hasActed: false, isResting: false,
    };
    civ.visibility.tiles[hexKey(shipPosition)] = 'visible';
    state.pirates = {
      ...state.pirates!,
      factions: {
        'pirate-1': {
          id: 'pirate-1', name: 'The Red Wake', spawnedRound: 1, behavior: 'blockading',
          maritimeStage: 3, notoriety: 5, shipIds: ['pirate-ship'],
          headquarters: { kind: 'coastal-enclave', position: shipPosition, integrity: 100, maxIntegrity: 100 },
          tributeByCiv: {}, demandByCiv: {}, contract: null,
          intent: { kind: 'blockade', targetCivId: 'ai-1', targetCityId: civ.cities[0], plannedRound: state.turn },
          transitionGuards: { emittedEventKeys: [] },
        },
      },
    };

    const prepared = prepareMajorCivStrategicPlan(state, 'ai-1');

    expect(prepared.portfolio.primaryPlan).toMatchObject({
      objective: 'capture',
      target: { kind: 'city', id: city.id },
    });
  });

  it('pirate dispatch competes on score, not automatic priority: it beats a weak distant peaceful-neighbor resource opportunity at veteran difficulty (#528 MR2)', () => {
    const state = createNewGame(undefined, 'prepared-pirate-dispatch-compete-win', 'small');
    state.opponentChallenge = 'veteran'; // crisisDispatchWeight 1.5 -> pirate score 150
    state.settings = { ...state.settings, aiPressure: 'pirates' };
    const civ = state.civilizations['ai-1'];
    const anchor = civ.units.map(id => state.units[id]).find(Boolean)!.position;

    // Weak, distant resource opportunity: strategicValue capped at 55, no distant-reason
    // bonus, and a real distance penalty -- scores well under 150.
    const resourceTile = Object.values(state.map.tiles)
      .filter(tile => hexDistance(anchor, tile.coord) === 5)
      .sort((left, right) => hexKey(left.coord).localeCompare(hexKey(right.coord)))[0];
    resourceTile.resource = 'iron';
    resourceTile.owner = null;
    civ.visibility.tiles[hexKey(resourceTile.coord)] = 'visible';
    civ.visibility.tiles[hexKey(anchor)] = 'visible';

    const shipPosition = { q: anchor.q + 2, r: anchor.r };
    state.units['pirate-ship'] = {
      id: 'pirate-ship', type: 'pirate_frigate', owner: 'pirate-1', position: shipPosition,
      movementPointsLeft: 4, health: 100, experience: 0,
      hasMoved: false, hasActed: false, isResting: false,
    };
    civ.visibility.tiles[hexKey(shipPosition)] = 'visible';
    state.pirates = {
      ...state.pirates!,
      factions: {
        'pirate-1': {
          id: 'pirate-1', name: 'The Red Wake', spawnedRound: 1, behavior: 'blockading',
          maritimeStage: 3, notoriety: 5, shipIds: ['pirate-ship'],
          headquarters: { kind: 'coastal-enclave', position: shipPosition, integrity: 100, maxIntegrity: 100 },
          tributeByCiv: {}, demandByCiv: {}, contract: null,
          intent: { kind: 'blockade', targetCivId: 'ai-1', targetCityId: civ.cities[0], plannedRound: state.turn },
          transitionGuards: { emittedEventKeys: [] },
        },
      },
    };

    const prepared = prepareMajorCivStrategicPlan(state, 'ai-1');

    expect(prepared.portfolio.primaryPlan).toMatchObject({
      objective: 'repel',
      target: { kind: 'unit', id: 'pirate-ship' },
    });
  });

  it('does not draft a repel plan against pirates when aiPressure is explicitly off', () => {
    const state = createNewGame(undefined, 'prepared-pirate-dispatch-off', 'small');
    state.settings = { ...state.settings, aiPressure: 'off' };
    const civ = state.civilizations['ai-1'];
    const anchor = civ.units.map(id => state.units[id]).find(Boolean)!.position;
    const shipPosition = { q: anchor.q + 2, r: anchor.r };
    state.units['pirate-ship'] = {
      id: 'pirate-ship', type: 'pirate_frigate', owner: 'pirate-1', position: shipPosition,
      movementPointsLeft: 4, health: 100, experience: 0,
      hasMoved: false, hasActed: false, isResting: false,
    };
    state.pirates = {
      ...state.pirates!,
      factions: {
        'pirate-1': {
          id: 'pirate-1', name: 'The Red Wake', spawnedRound: 1, behavior: 'blockading',
          maritimeStage: 3, notoriety: 5, shipIds: ['pirate-ship'],
          headquarters: { kind: 'coastal-enclave', position: shipPosition, integrity: 100, maxIntegrity: 100 },
          tributeByCiv: {}, demandByCiv: {}, contract: null,
          intent: { kind: 'blockade', targetCivId: 'ai-1', targetCityId: civ.cities[0], plannedRound: state.turn },
          transitionGuards: { emittedEventKeys: [] },
        },
      },
    };

    const prepared = prepareMajorCivStrategicPlan(state, 'ai-1');

    // #1064: primaryPlan is no longer guaranteed null -- an eligible `expand` candidate
    // can now legitimately win by default when nothing else competes. This test's actual
    // claim, per its title, is narrower: no repel plan against the pirate was drafted.
    expect(prepared.portfolio.primaryPlan?.objective).not.toBe('repel');
  });

  it.each(['explorer', 'standard', 'veteran'] as const)('admits a legal, reachable reported independent city for aggressive Domination pursuit on %s', challenge => {
    const state = createNewGame(undefined, 'prepared-domination-pursuit', 'small');
    state.turn = 10;
    state.opponentChallenge = challenge;
    const civ = state.civilizations['ai-1'];
    civ.civType = 'rome';
    const anchor = civ.units.map(id => state.units[id]).find(Boolean)!.position;
    const targetTile = Object.values(state.map.tiles)
      .filter(tile =>
        hexDistance(anchor, tile.coord) === 1
        && findPath(anchor, tile.coord, state.map, 'land') !== null)
      .sort((left, right) => hexKey(left.coord).localeCompare(hexKey(right.coord)))[0]!;
    const ownCity = foundCity(civ.id, anchor, state.map, state.idCounters);
    const targetCity = foundCity('player', targetTile.coord, state.map, state.idCounters);
    state.cities[ownCity.id] = ownCity;
    state.cities[targetCity.id] = targetCity;
    civ.cities = [ownCity.id];
    state.civilizations.player.cities = [targetCity.id];
    const warrior = createUnit('warrior', civ.id, anchor, state.idCounters);
    warrior.id = 'domination-warrior';
    state.units[warrior.id] = warrior;
    civ.units.push(warrior.id);
    civ.knownCivilizations = ['player'];
    civ.visibility.tiles = {
      [hexKey(anchor)]: 'visible',
      [hexKey(targetCity.position)]: 'visible',
    };
    state.dominationIntel = {
      [civ.id]: {
        defeatsByCivId: {},
        reportsByContenderId: {
          player: {
            contenderId: 'player', observedTurn: state.turn, contenderRole: 'independent',
            directVassalIds: [], defeatedCivIds: [],
          },
        },
      },
    };

    const prepared = prepareMajorCivStrategicPlan(state, civ.id);

    expect(prepared.portfolio.primaryPlan).toMatchObject({
      objective: 'capture',
      target: { kind: 'city', id: targetCity.id },
      reasonCodes: ['domination-pursuit'],
    });
  });

  it('assembles a counted critical force for a visibly fortified and garrisoned capture target', () => {
    const { state, civ, targetCity } = setupVisibleDefendedCapture('prepared-defended-capture-force');

    const prepared = prepareMajorCivStrategicPlan(state, civ.id);

    expect(prepared.portfolio.primaryPlan).toMatchObject({
      objective: 'capture',
      target: { kind: 'city', id: targetCity.id },
      requiredRoles: { frontline: 2, capture: 1 },
    });
    const capturePlanId = prepared.portfolio.primaryPlan!.id;
    const frontlineDemand = prepared.forceDemands.find(demand => demand.role === 'frontline');
    const captureDemand = prepared.forceDemands.find(demand => demand.role === 'capture');
    // The visible garrison also creates an urgent home-defense plan. That plan may
    // legitimately take the only warrior first, but the capture operation must still
    // retain its counted shortage in the shared production demand.
    expect(frontlineDemand).toMatchObject({ role: 'frontline' });
    expect(frontlineDemand!.desired).toBeGreaterThanOrEqual(2);
    expect(frontlineDemand!.missing).toBeGreaterThanOrEqual(1);
    expect(frontlineDemand!.sourcePlanIds).toContain(capturePlanId);
    expect(captureDemand?.sourcePlanIds).toContain(capturePlanId);
    expect(prepared.portfolio.primaryPlan?.supportRoles).toBeUndefined();
  });

  it.each(['explorer', 'standard', 'veteran'] as const)(
    'keeps observed capture-force requirements equally competent on %s',
    challenge => {
      const { state, civ, targetCity } = setupVisibleDefendedCapture(
        `prepared-defended-capture-${challenge}`,
      );
      state.opponentChallenge = challenge;

      const prepared = prepareMajorCivStrategicPlan(state, civ.id);

      expect(prepared.portfolio.primaryPlan).toMatchObject({
        objective: 'capture',
        target: { kind: 'city', id: targetCity.id },
        requiredRoles: { frontline: 2, capture: 1 },
      });
    },
  );

  it('requests optional ranged support only when a hardened capture target is visibly observed and legal to train', () => {
    const { state, civ } = setupVisibleDefendedCapture('prepared-defended-capture-support', {
      archery: true,
    });

    const prepared = prepareMajorCivStrategicPlan(state, civ.id);

    expect(prepared.portfolio.primaryPlan?.supportRoles).toEqual({ ranged: 1 });
    const rangedDemand = prepared.forceDemands.find(demand => demand.role === 'ranged');
    expect(rangedDemand).toBeDefined();
    expect(rangedDemand!.desired).toBeGreaterThanOrEqual(1);
    expect(rangedDemand!.missing).toBeGreaterThanOrEqual(1);
    expect(rangedDemand!.sourcePlanIds).toContain(prepared.portfolio.primaryPlan!.id);
  });

  it('carries a fortified capture shortage into the real production queue', () => {
    const { state, civ, ownCity, targetCity } = setupVisibleDefendedCapture(
      'prepared-defended-capture-production',
      { garrison: false },
    );
    const prepared = prepareMajorCivStrategicPlan(state, civ.id);

    expect(prepared.portfolio.primaryPlan).toMatchObject({
      objective: 'capture',
      target: { kind: 'city', id: targetCity.id },
      requiredRoles: { frontline: 2, capture: 1 },
    });
    expect(prepared.forceDemands.find(demand => demand.role === 'frontline')).toMatchObject({
      desired: 2, assigned: 1, missing: 1,
    });

    const next = applyAIProduction(state, civ.id, prepared.forceDemands, {
      traits: [], warLikelihood: 0.5, diplomacyFocus: 0.5, expansionDrive: 0.5,
    });

    expect(next.cities[ownCity.id]!.productionQueue[0]).toBe('warrior');
  });

  it('does not size a remembered capture force from a defender first placed while hidden', () => {
    let state = createNewGame(undefined, 'prepared-hidden-capture-defender', 'small');
    const civ = state.civilizations['ai-1'];
    const anchor = civ.units.map(id => state.units[id]).find(Boolean)!.position;
    const targetTile = Object.values(state.map.tiles)
      .filter(tile =>
        hexDistance(anchor, tile.coord) === 1
        && findPath(anchor, tile.coord, state.map, 'land') !== null)
      .sort((left, right) => hexKey(left.coord).localeCompare(hexKey(right.coord)))[0]!;
    const ownCity = foundCity(civ.id, anchor, state.map, state.idCounters);
    const targetCity = foundCity('player', targetTile.coord, state.map, state.idCounters);
    state.cities[ownCity.id] = ownCity;
    state.cities[targetCity.id] = targetCity;
    civ.cities = [ownCity.id];
    state.civilizations.player.cities = [targetCity.id];
    civ.knownCivilizations = ['player'];
    civ.diplomacy.atWarWith = ['player'];
    civ.visibility.tiles = {
      [hexKey(anchor)]: 'visible',
      [hexKey(targetCity.position)]: 'visible',
    };
    state = refreshMajorCivIntel(state, civ.id);
    state.civilizations[civ.id]!.visibility.tiles[hexKey(targetCity.position)] = 'fog';
    const hiddenGarrison = createUnit('warrior', 'player', targetCity.position, state.idCounters);
    state.units[hiddenGarrison.id] = hiddenGarrison;
    state.civilizations.player.units.push(hiddenGarrison.id);

    const prepared = prepareMajorCivStrategicPlan(state, civ.id);

    expect(prepared.portfolio.primaryPlan).toMatchObject({
      objective: 'capture',
      target: { kind: 'city', id: targetCity.id },
      requiredRoles: { capture: 1 },
    });
    expect(prepared.portfolio.primaryPlan?.supportRoles).toBeUndefined();
  });

  it('feeds one frontline demand from an earned Domination threat', () => {
    const state = createNewGame({
      civType: 'rome', mapSize: 'small', opponentCount: 4, gameTitle: 'Counterplay', seed: 'prepared-domination-counterplay',
    });
    const civ = state.civilizations['ai-1'];
    const anchor = civ.units.map(id => state.units[id]).find(Boolean)!.position;
    const ownCity = foundCity(civ.id, anchor, state.map, state.idCounters);
    state.cities[ownCity.id] = ownCity;
    civ.cities = [ownCity.id];
    state.dominationIntel = {
      [civ.id]: {
        defeatsByCivId: {},
        reportsByContenderId: {
          'ai-2': {
            contenderId: 'ai-2', observedTurn: state.turn, contenderRole: 'independent',
            directVassalIds: ['ai-3', 'ai-4'], defeatedCivIds: ['player'],
          },
        },
      },
    };

    const demand = prepareMajorCivStrategicPlan(state, civ.id).forceDemands
      .find(candidate => candidate.sourcePlanIds.includes('domination-threat:ai-2'));

    expect(demand).toMatchObject({
      role: 'frontline', desired: 1, priority: 220,
      sourcePlanIds: ['domination-threat:ai-2'],
    });
  });
});

describe('incrementalDemandSeed', () => {
  it('asks for one when the civilization owns none', () => {
    expect(incrementalDemandSeed('worker', 'worker-infrastructure', 40, 0, 4))
      .toEqual([{
        role: 'worker',
        sourceId: 'worker-infrastructure',
        priority: 40,
        desired: 1,
        assigned: 0,
      }]);
  });

  it('asks for exactly one MORE, never the whole gap', () => {
    expect(incrementalDemandSeed('worker', 'worker-infrastructure', 40, 1, 4))
      .toEqual([{
        role: 'worker',
        sourceId: 'worker-infrastructure',
        priority: 40,
        desired: 2,
        assigned: 1,
      }]);
  });

  it('is satisfied at the cap', () => {
    const [seed] = incrementalDemandSeed('settlement', 'objective-readiness', 90, 1, 1);
    expect(seed).toMatchObject({ desired: 1, assigned: 1 });
  });

  it('returns nothing when already over cap, never a negative shortfall', () => {
    expect(incrementalDemandSeed('worker', 'worker-infrastructure', 40, 3, 2)).toEqual([]);
  });

  it('always merges to a missing of 0 or 1, for every owned/cap pair', () => {
    for (let owned = 0; owned <= 6; owned++) {
      for (let cap = 0; cap <= 6; cap++) {
        const merged = mergePreparedForceDemands(
          [],
          incrementalDemandSeed('worker', 'worker-infrastructure', 40, owned, cap),
        );
        const missing = merged.find(entry => entry.role === 'worker')?.missing ?? 0;
        expect(missing, `owned=${owned} cap=${cap}`).toBeGreaterThanOrEqual(0);
        expect(missing, `owned=${owned} cap=${cap}`).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('#1064 bounded force demands', () => {
  it('demands one worker when a civilization owns none', () => {
    const state = createNewGame(undefined, 'demand-worker-none', 'small');
    const civ = state.civilizations['ai-1'];
    addSpacedCities(state, civ.id, 0);   // found exactly one city; a cityless civ has no worker cap
    for (const unitId of [...civ.units]) {
      if (state.units[unitId]?.type === 'worker') {
        delete state.units[unitId];
        civ.units = civ.units.filter(id => id !== unitId);
      }
    }

    const demand = prepareMajorCivStrategicPlan(state, civ.id).forceDemands
      .find(entry => entry.role === 'worker');

    expect(demand).toMatchObject({ missing: 1, priority: 40 });
  });

  it('stops demanding workers once the city-count cap is met', () => {
    const state = createNewGame(undefined, 'demand-worker-capped', 'small');
    const civ = state.civilizations['ai-1'];
    addSpacedCities(state, civ.id, 0);   // found exactly one city -> cap 1
    const home = state.cities[civ.cities[0]!]!;
    // One city -> cap 1. Give it one worker.
    const existing = civ.units.filter(id => state.units[id]?.type === 'worker');
    for (const extra of existing.slice(1)) {
      delete state.units[extra];
      civ.units = civ.units.filter(id => id !== extra);
    }
    if (existing.length === 0) {
      const worker = createUnit('worker', civ.id, home.position, state.idCounters);
      state.units[worker.id] = worker;
      civ.units.push(worker.id);
    }

    const demand = prepareMajorCivStrategicPlan(state, civ.id).forceDemands
      .find(entry => entry.role === 'worker');

    expect(demand?.missing ?? 0).toBe(0);
  });

  it('never demands more workers than WORKER_SOFT_CAP however many cities it holds', () => {
    const state = createNewGame(undefined, 'demand-worker-softcap', 'small');
    const civ = state.civilizations['ai-1'];
    addSpacedCities(state, civ.id, WORKER_SOFT_CAP + 3);

    const demand = prepareMajorCivStrategicPlan(state, civ.id).forceDemands
      .find(entry => entry.role === 'worker');

    expect(civ.cities.length).toBeGreaterThan(WORKER_SOFT_CAP);
    expect(demand?.desired ?? 0).toBeLessThanOrEqual(WORKER_SOFT_CAP);
  });

  it('seeds only the strongest reachable incomplete objective, not every analyzed one', () => {
    // This MUST include more than one incomplete objective. The distant capture
    // is deliberately lower-scored than visible resources, so a role-set union
    // would wrongly demand both while the single-target contract demands one.
    const state = createNewGame(undefined, 'demand-readiness-frontline', 'small');
    const civ = state.civilizations['ai-1'];
    // Suppress expansion so this test reaches the no-viable-plan readiness path,
    // rather than correctly selecting an unrelated expansion objective.
    addSpacedCities(state, civ.id, 6);
    addSpacedCities(state, 'player', 0);         // player needs a city to be a capture target
    civ.knownCivilizations = ['player'];
    civ.diplomacy.atWarWith = ['player'];
    // Reveal the enemy capital so a capture candidate (frontline + capture) exists.
    const enemyCity = state.cities[state.civilizations.player.cities[0]!]!;
    for (const coord of mapHexesInRange(state.map, enemyCity.position, 2)) {
      civ.visibility.tiles[hexKey(coord)] = 'visible';
    }
    // Strip every combat unit so `capture` is genuinely unowned.
    for (const unitId of [...civ.units]) {
      if (UNIT_DEFINITIONS[state.units[unitId]!.type].strength > 0) {
        delete state.units[unitId];
        civ.units = civ.units.filter(id => id !== unitId);
      }
    }

    const beforePrepared = prepareMajorCivStrategicPlan(state, civ.id);
    const readiness = beforePrepared.forceDemands.filter(entry =>
      entry.sourcePlanIds.includes('objective-readiness'));

    expect(readiness).toContainEqual(expect.objectContaining({
      role: 'resource-expedition', missing: 1,
    }));
    expect(readiness.some(entry => entry.role === 'capture')).toBe(false);
  });
});

describe('#1064 expand objective candidates', () => {
  it('never targets a site within MIN_CITY_CENTER_DISTANCE of the civilization\'s OWN city', () => {
    // Regression: perception.knownCities is built ONLY from OTHER civs' cities the
    // actor has observed -- the actor's own city lives separately in
    // perception.ownCities. Omitting it from the belief layer's exclusion set let a
    // site one tile from the civ's own capital win as "best" (nothing else competed
    // in the small fog bubble around a fresh city), which is always illegal and
    // permanently froze the assigned settler once it arrived.
    //
    // This test deliberately does NOT use addSpacedCities' broad radius-8 visibility
    // reveal (added for Task 3/4's tests, which need a wide known area) -- with that
    // much visible, many legitimate distant sites compete and the highest-scoring one
    // can incidentally already clear MIN_CITY_CENTER_DISTANCE regardless of whether the
    // own-city exclusion is applied, silently failing to catch this exact bug. Real
    // city vision is a fixed radius 2 (`fog-of-war.ts`'s updateVisibility), which is
    // entirely inside MIN_CITY_CENTER_DISTANCE=4 -- so a fresh city's own immediate
    // neighbourhood is the ONLY area visible, forcing the belief layer to consider (and,
    // pre-fix, wrongly accept) a site adjacent to its own capital.
    const state = createNewGame(undefined, 'expand-excludes-own-city', 'small');
    const civ = state.civilizations['ai-1'];
    const startingPosition = civ.units.map(id => state.units[id]).find(Boolean)!.position;
    const home = foundCity(civ.id, startingPosition, state.map, state.idCounters);
    state.cities[home.id] = home;
    civ.cities.push(home.id);
    civ.visibility.tiles = {};
    for (const coord of mapHexesInRange(state.map, home.position, 2)) {
      civ.visibility.tiles[hexKey(coord)] = 'visible';
    }

    const prepared = prepareMajorCivStrategicPlan(state, civ.id);
    const expandCandidate = prepared.traces
      .find(entry => entry.decision === 'objective')
      ?.candidates.find(entry => entry.id.startsWith('expand:'));
    // With only a radius-2 bubble visible around the capital, a legal site (>= distance
    // 4 away) genuinely cannot exist -- so the correct, fixed behaviour is NO expand
    // candidate at all. This assertion IS the regression pin: pre-fix, the adjacent
    // (illegal) tile was wrongly accepted as a candidate here.
    expect(expandCandidate).toBeUndefined();
  });

  it('demands a settler when a cityless civilization has nowhere to put one yet', () => {
    // createNewGame starts every civ cityless (settler + warrior only) -- this IS
    // the real turn-1 state, not a contrived one. Anchors fall back to unit positions.
    const state = createNewGame(undefined, 'expand-demand-settler', 'small');
    const civ = state.civilizations['ai-1'];
    for (const unitId of [...civ.units]) {
      if (state.units[unitId]?.type === 'settler') {
        delete state.units[unitId];
        civ.units = civ.units.filter(id => id !== unitId);
      }
    }

    const demand = prepareMajorCivStrategicPlan(state, civ.id).forceDemands
      .find(entry => entry.role === 'settlement');

    expect(demand).toMatchObject({ missing: 1, priority: 90 });
    expect(demand?.sourcePlanIds).toContain('objective-readiness');
  });

  it('stops demanding a settler once one is alive', () => {
    const state = createNewGame(undefined, 'expand-settler-alive', 'small');
    const civ = state.civilizations['ai-1'];
    addSpacedCities(state, civ.id, 0);
    const home = state.cities[civ.cities[0]!]!;
    const settler = createUnit('settler', civ.id, home.position, state.idCounters);
    state.units[settler.id] = settler;
    civ.units.push(settler.id);

    const demand = prepareMajorCivStrategicPlan(state, civ.id).forceDemands
      .find(entry => entry.role === 'settlement');

    expect(demand?.missing ?? 0).toBe(0);
  });

  it('makes the expand candidate eligible once a settler exists', () => {
    // Asserted on ELIGIBILITY, not on winning primaryPlan. Whether expand outranks a
    // resource candidate depends on map scoring, so asserting `primaryPlan.objective
    // === 'expand'` would be flaky, and wrapping the assertion in an `if` would make
    // it pass vacuously -- which proves nothing.
    const state = createNewGame(undefined, 'expand-assigns-settler', 'small');
    const civ = state.civilizations['ai-1'];
    addSpacedCities(state, civ.id, 0);
    const home = state.cities[civ.cities[0]!]!;
    // createNewGame starts every civ WITH a settler already -- strip it so
    // "withoutSettler" is genuinely enforced rather than assumed.
    for (const unitId of [...civ.units]) {
      if (state.units[unitId]?.type === 'settler') {
        delete state.units[unitId];
        civ.units = civ.units.filter(id => id !== unitId);
      }
    }

    const withoutSettler = prepareMajorCivStrategicPlan(state, civ.id).traces
      .find(entry => entry.decision === 'objective')
      ?.candidates.find(entry => entry.id.startsWith('expand:'));
    expect(withoutSettler?.eligible).toBe(false);

    const settler = createUnit('settler', civ.id, home.position, state.idCounters);
    state.units[settler.id] = settler;
    civ.units.push(settler.id);

    const withSettler = prepareMajorCivStrategicPlan(state, civ.id).traces
      .find(entry => entry.decision === 'objective')
      ?.candidates.find(entry => entry.id.startsWith('expand:'));
    expect(withSettler?.eligible).toBe(true);
  });

  it('emits exactly one expand candidate however many sites qualify', () => {
    const state = createNewGame(undefined, 'expand-single-candidate', 'small');
    const civ = state.civilizations['ai-1'];

    const prepared = prepareMajorCivStrategicPlan(state, civ.id);
    const expandIds = (prepared.traces.find(entry => entry.decision === 'objective')
      ?.candidates ?? []).filter(candidate => candidate.id.startsWith('expand:'));

    // `toBe(1)`, never `toBeLessThanOrEqual(1)` -- the latter passes at zero and would
    // hide a generator that emits nothing at all.
    //
    // If this fails with 0, this seed's map has no legal site within
    // EXPANSION_SEARCH_RADIUS of the capital. Pick a different seed; do NOT relax the
    // assertion to `<= 1`.
    expect(expandIds).toHaveLength(1);
  });

  it('keeps the objective trace inside the 12-candidate ceiling under load', () => {
    // assertLegalChoices in the long-horizon fixture HARD THROWS above 12, and the
    // trace carries EVERY analysed candidate. At peace there are no capture
    // candidates at all, so a peaceful fixture would pass this trivially -- the civ
    // must be at war with everyone, with the whole map revealed, to create real load.
    const state = createNewGame(undefined, 'expand-trace-ceiling', 'small');
    const allCivIds = Object.keys(state.civilizations);
    for (const civ of Object.values(state.civilizations)) {
      civ.knownCivilizations = allCivIds.filter(id => id !== civ.id);
      civ.diplomacy.atWarWith = allCivIds.filter(id => id !== civ.id);
      for (const key of Object.keys(state.map.tiles)) civ.visibility.tiles[key] = 'visible';
    }

    for (const civId of allCivIds) {
      if (state.civilizations[civId]!.isHuman) continue;
      const trace = prepareMajorCivStrategicPlan(state, civId).traces
        .find(entry => entry.decision === 'objective');
      expect(trace?.candidates.length ?? 0, civId).toBeLessThanOrEqual(12);
    }
  });

  it('produces no expand candidate at the expansion soft cap', () => {
    const state = createNewGame(undefined, 'expand-soft-cap', 'small');
    const civ = state.civilizations['ai-1'];
    // Past any soft cap (the maximum is 6), on real, legally spaced tiles. Founded
    // FIRST so civ.cities[0] exists below -- `addSpacedCities` is the helper added to
    // this same file in Task 3 Step 1.
    addSpacedCities(state, civ.id, 8);
    const settler = createUnit(
      'settler', civ.id, state.cities[civ.cities[0]!]!.position, state.idCounters,
    );
    state.units[settler.id] = settler;
    civ.units.push(settler.id);

    const trace = prepareMajorCivStrategicPlan(state, civ.id).traces
      .find(entry => entry.decision === 'objective');

    expect((trace?.candidates ?? []).some(c => c.id.startsWith('expand:'))).toBe(false);
  });

  it('makes an otherwise-unreachable expand candidate eligible once a sea crossing exists (#1066)', () => {
    function setTerrain(coord: HexCoord, terrain: TerrainType, regionKey: string | undefined) {
      const key = hexKey(coord);
      const existing = state.map.tiles[key];
      state.map.tiles[key] = {
        coord,
        terrain,
        elevation: existing?.elevation ?? 'lowland',
        resource: existing?.resource ?? null,
        improvement: existing?.improvement ?? null,
        owner: existing?.owner ?? null,
        improvementTurnsLeft: existing?.improvementTurnsLeft ?? 0,
        hasRiver: existing?.hasRiver ?? false,
        wonder: existing?.wonder ?? null,
        regionKey,
      };
    }

    const state = createNewGame(undefined, 'amphibious-expand-eligible', 'small');
    const civ = state.civilizations['ai-1'];
    const home = foundCity(civ.id, { q: 15, r: 15 }, state.map, state.idCounters);
    state.cities[home.id] = home;
    civ.cities.push(home.id);

    // Give the city's own tile a regionKey that exists NOWHERE else on the
    // real generated map. Without this, `findRegionCrossings` -- correctly,
    // by design -- also treats every other real tile still tagged with the
    // map's original regionKey (e.g. 'continent-0', likely most of the map)
    // as a valid seed, including ones the moat below has physically cut off
    // from the city. `regionKey` is meant to be a static, precomputed fact
    // about real connectivity; hand-editing terrain around one city without
    // relabeling it is what breaks that invariant, not a bug in the BFS.
    const homeTerrain = state.map.tiles[hexKey(home.position)]?.terrain ?? 'grassland';
    setTerrain(home.position, homeTerrain, 'test-origin-region');

    // Seal the city off with a full disc of open water out to radius 3 --
    // topologically, any path from inside to outside this disc must cross
    // it, so whatever terrain the real generated map happens to have
    // elsewhere cannot accidentally provide a land route around it. (A thin
    // one-tile ring is NOT enough: real land immediately past the ring
    // would share the city's own regionKey too widely -- see above.)
    for (const coord of mapHexesInRange(state.map, home.position, 3)) {
      if (hexKey(coord) === hexKey(home.position)) continue;
      setTerrain(coord, 'coast', undefined);
    }

    // A legal, positively-scored expansion site on a distinct landmass,
    // hexDistance 6 away (within EXPANSION_SEARCH_RADIUS=8, past
    // MIN_CITY_CENTER_DISTANCE=4), reachable only by sea.
    const targetCenter = { q: home.position.q + 6, r: home.position.r };
    for (const coord of mapHexesInRange(state.map, targetCenter, 2)) {
      setTerrain(coord, 'grassland', 'test-target-region');
    }

    civ.visibility.tiles = {};
    for (const coord of mapHexesInRange(state.map, home.position, EXPANSION_SEARCH_RADIUS)) {
      civ.visibility.tiles[hexKey(coord)] = 'visible';
    }

    const withoutTransport = prepareMajorCivStrategicPlan(state, civ.id);
    const expandCandidate = withoutTransport.traces
      .find(entry => entry.decision === 'objective')
      ?.candidates.find(entry => entry.id.startsWith('expand:'));

    // Pre-#1066: this candidate never even appears in the trace -- the
    // land-only travel resolver marks it Infinity/unreachable and
    // `bestExpand` in `objectiveCandidates` filters it out entirely before
    // it's ever added to the candidate list. Post-#1066: it's present (with
    // a real, finite composed travel time), but not yet ELIGIBLE -- it now
    // demands a transport the civ doesn't own yet, exactly like #1064's own
    // settlement-demand pattern above.
    expect(expandCandidate).toBeDefined();
    expect(expandCandidate?.eligible).toBe(false);
    const transportDemand = withoutTransport.forceDemands.find(entry => entry.role === 'transport');
    expect(transportDemand).toMatchObject({ missing: 1, priority: 90 });

    // Once the civ actually has a transport, the same candidate becomes
    // eligible -- the whole loop (reachability -> demand -> eligibility)
    // closes, mirroring "makes the expand candidate eligible once a settler
    // exists" above.
    const transport = createUnit('transport', civ.id, home.position, state.idCounters);
    state.units[transport.id] = transport;
    civ.units.push(transport.id);

    const withTransport = prepareMajorCivStrategicPlan(state, civ.id);
    const eligibleExpandCandidate = withTransport.traces
      .find(entry => entry.decision === 'objective')
      ?.candidates.find(entry => entry.id.startsWith('expand:'));
    expect(eligibleExpandCandidate?.eligible).toBe(true);
  });

  describe('#1107 — coastal-access recovery bias', () => {
    function setTerrain(state: GameState, coord: HexCoord, terrain: TerrainType) {
      const key = hexKey(coord);
      const existing = state.map.tiles[key];
      state.map.tiles[key] = {
        coord,
        terrain,
        elevation: existing?.elevation ?? 'lowland',
        resource: existing?.resource ?? null,
        improvement: existing?.improvement ?? null,
        owner: existing?.owner ?? null,
        improvementTurnsLeft: existing?.improvementTurnsLeft ?? 0,
        hasRiver: existing?.hasRiver ?? false,
        wonder: existing?.wonder ?? null,
      };
    }

    // Shared geometry for both tests below: a home city at a fixed absolute
    // position (avoids any real-map-generation wrap/edge risk, same
    // convention as the #1066 test above), an inland site with strictly
    // better raw terrain (all grassland) and a coastal site with strictly
    // worse raw terrain (plains, plus one ocean neighbour making it
    // isPositionCoastal) -- both hexDistance 6 from home (legal, within
    // EXPANSION_SEARCH_RADIUS).
    function buildGeometry(state: GameState, civId: string) {
      const home = foundCity(civId, { q: 15, r: 15 }, state.map, state.idCounters);
      state.cities[home.id] = home;
      state.civilizations[civId]!.cities.push(home.id);

      // Blanket the ENTIRE search+scoring area with a neutral, non-coastal
      // terrain first -- otherwise real map-generated ocean/coast elsewhere
      // in this radius could itself pass isPositionCoastal and win the bias
      // instead of the deliberately-constructed coastalAnchor site below.
      for (const coord of mapHexesInRange(state.map, home.position, EXPANSION_SEARCH_RADIUS + 2)) {
        setTerrain(state, coord, 'desert');
      }
      // #1107 -- a real generated map can place a minor civ (city-state)
      // anywhere, including inside this test's controlled area. Since
      // getKnownExpansionSites' legality filter now correctly excludes sites
      // too close to a visible minor-civ city (the exact bug this describe
      // block's later "drops a committed target" test covers), a coincidental
      // real minor civ here would silently disqualify a deliberately-placed
      // site and make this fixture's own geometry assumptions wrong. Remove
      // any minor civ inside the controlled radius so only the terrain this
      // test actually sets up determines the outcome.
      for (const [minorCivId, minorCiv] of Object.entries(state.minorCivs)) {
        const city = state.cities[minorCiv.cityId];
        if (city && mapHexesInRange(state.map, home.position, EXPANSION_SEARCH_RADIUS + 2)
          .some(coord => hexKey(coord) === hexKey(city.position))) {
          delete state.cities[minorCiv.cityId];
          delete state.minorCivs[minorCivId];
        }
      }

      const inlandAnchor: HexCoord = { q: home.position.q + 6, r: home.position.r };
      for (const coord of mapHexesInRange(state.map, inlandAnchor, 2)) {
        setTerrain(state, coord, 'grassland');
      }

      const coastalAnchor: HexCoord = { q: home.position.q - 6, r: home.position.r };
      for (const coord of mapHexesInRange(state.map, coastalAnchor, 2)) {
        setTerrain(state, coord, 'plains');
      }
      setTerrain(state, { q: coastalAnchor.q, r: coastalAnchor.r - 1 }, 'ocean');

      const civ = state.civilizations[civId]!;
      civ.visibility.tiles = {};
      for (const coord of mapHexesInRange(state.map, home.position, EXPANSION_SEARCH_RADIUS)) {
        civ.visibility.tiles[hexKey(coord)] = 'visible';
      }

      return { home, inlandAnchor, coastalAnchor };
    }

    it('promotes the coastal site over a better-terrain inland one when the civ has no coastal city', () => {
      const state = createNewGame(undefined, 'coastal-recovery-bias-on', 'small');
      const civ = state.civilizations['ai-1']!;
      const { home, coastalAnchor } = buildGeometry(state, civ.id);
      // Guarantee the home city itself is NOT coastal -- its own tile and
      // every immediate neighbour are grassland.
      setTerrain(state, home.position, 'grassland');
      for (const neighbor of getWrappedHexNeighbors(home.position, state.map.width)) {
        setTerrain(state, neighbor, 'grassland');
      }

      const expandCandidate = prepareMajorCivStrategicPlan(state, civ.id).traces
        .find(entry => entry.decision === 'objective')
        ?.candidates.find(entry => entry.id.startsWith('expand:'));

      expect(expandCandidate?.id).toBe(`expand:region:settle:${hexKey(coastalAnchor)}`);
    });

    it('does not bias site selection when the civ already has a coastal city', () => {
      const state = createNewGame(undefined, 'coastal-recovery-bias-off', 'small');
      const civ = state.civilizations['ai-1']!;
      const { home, inlandAnchor } = buildGeometry(state, civ.id);
      // Make the home city ITSELF coastal (one neighbour is ocean) rather than
      // adding a second owned city -- adding a second city would push
      // ownCities.length to 2, which can trip the expansion soft cap and
      // suppress the expand candidate entirely for reasons unrelated to this
      // test.
      setTerrain(state, home.position, 'grassland');
      const homeNeighbors = getWrappedHexNeighbors(home.position, state.map.width);
      setTerrain(state, homeNeighbors[0]!, 'ocean');
      for (const neighbor of homeNeighbors.slice(1)) {
        setTerrain(state, neighbor, 'grassland');
      }

      const expandCandidate = prepareMajorCivStrategicPlan(state, civ.id).traces
        .find(entry => entry.decision === 'objective')
        ?.candidates.find(entry => entry.id.startsWith('expand:'));

      expect(expandCandidate?.id).toBe(`expand:region:settle:${hexKey(inlandAnchor)}`);
    });

    it('end-to-end: ai-1 under the swapped lh-late-era-medium seed targets a genuinely coastal site', async () => {
      // Exercises Tasks 1-5 together against the REAL generated map (not a
      // synthetic fixture) -- the exact scenario/civ the #1107 design doc's
      // seed swap (lh-1107-search-0) was chosen to make genuinely solvable.
      const { scenarioBySeed, runScenario } = await import('../simulation/long-horizon/campaign-scenarios');
      const { civHasCoastalCity: civHasCoastalCityFn, isPositionCoastal: isPositionCoastalFn } =
        await import('@/systems/city-system');

      const scenario = scenarioBySeed('lh-late-era-medium');
      expect(scenario.mapSeed).toBe('lh-1107-search-0');
      const run = runScenario(scenario, { turns: 1 });
      const state = run.finalState;

      expect(state.civilizations['ai-1']).toBeDefined();
      expect(civHasCoastalCityFn(state, 'ai-1')).toBe(false);

      const expandCandidate = prepareMajorCivStrategicPlan(state, 'ai-1').traces
        .find(entry => entry.decision === 'objective')
        ?.candidates.find(entry => entry.id.startsWith('expand:region:settle:'));

      expect(expandCandidate).toBeDefined();
      const [q, r] = expandCandidate!.id.replace('expand:region:settle:', '').split(',').map(Number);
      expect(isPositionCoastalFn({ q, r }, state.map)).toBe(true);
    }, 30000);

    it('excludes a site too close to a visible minor civ (city-state), not just visible major-civ cities', () => {
      // Found investigating #1107's own Task 7 verification against the real
      // long-horizon campaign: MajorCivPerception.knownCities is built ONLY
      // from contacted MAJOR civs (buildMajorCivPerception's remembered-city
      // and contacted-civ loops never touch minor-civ cities at all), so
      // knownCityPositions could never correctly avoid a real, currently
      // visible city-state -- the belief layer kept re-proposing a site 2
      // tiles from a real minor civ forever, because it structurally had no
      // way to ever learn the site was illegal.
      const state = createNewGame(undefined, 'coastal-recovery-minor-civ-legality', 'small');
      const civ = state.civilizations['ai-1']!;
      const { home, inlandAnchor, coastalAnchor } = buildGeometry(state, civ.id);
      setTerrain(state, home.position, 'grassland');
      for (const neighbor of getWrappedHexNeighbors(home.position, state.map.width)) {
        setTerrain(state, neighbor, 'grassland');
      }

      // inlandAnchor (all-grassland, no bonus) outscores coastalAnchor
      // (plains+ocean) on raw terrain when needsCoastalAccess is false -- but
      // this civ needs coastal access, so coastalAnchor would normally win
      // (per the "promotes the coastal site" test above). Place a real minor
      // civ's city 2 tiles from coastalAnchor -- inside MIN_CITY_CENTER_
      // DISTANCE(4) -- and mark it visible, so coastalAnchor becomes
      // canonically illegal despite still passing the belief layer's own
      // terrain/coastal checks in isolation.
      const [minorCivId, minorCiv] = Object.entries(state.minorCivs)[0]!;
      const minorCivCity = state.cities[minorCiv.cityId]!;
      const relocated: HexCoord = { q: coastalAnchor.q + 2, r: coastalAnchor.r };
      setTerrain(state, relocated, 'grassland');
      state.map.tiles[hexKey(minorCivCity.position)]!.owner = null;
      minorCivCity.position = { ...relocated };
      state.map.tiles[hexKey(relocated)]!.owner = minorCivId;
      civ.visibility.tiles[hexKey(relocated)] = 'visible';

      const expandCandidate = prepareMajorCivStrategicPlan(state, civ.id).traces
        .find(entry => entry.decision === 'objective')
        ?.candidates.find(entry => entry.id.startsWith('expand:'));

      expect(expandCandidate?.id).not.toBe(`expand:region:settle:${hexKey(coastalAnchor)}`);
      expect(expandCandidate?.id).toBe(`expand:region:settle:${hexKey(inlandAnchor)}`);
    });

    it('stays committed to the currently-assigned expand site even when a marginally-higher-scoring one exists (oscillation fix)', () => {
      // Found investigating #1107's own Task 7 verification: ai-1 under the
      // real swapped seed never actually founded its second city despite
      // consistently proposing a coastal target -- its settler kept getting
      // redirected to a DIFFERENT coastal site every few rounds as fog
      // revealed more terrain and shifted which of several close-scoring
      // coastal candidates currently ranked #1. bestExpand (ai-prepared-turn.ts)
      // recomputed "the single best reachable site" fresh every round with no
      // memory of the currently in-progress target, so the settler's travel
      // progress toward the OLD target was discarded every time a new one
      // edged ahead -- it never completed a single journey. Two coastal sites
      // are built here with A scoring marginally higher than B; a plan already
      // committed to B (with an assigned settler) must stay on B, not switch
      // to A just because A nominally scores a little higher this round.
      const state = createNewGame(undefined, 'coastal-recovery-sticky-target', 'small');
      const civ = state.civilizations['ai-1']!;
      const home = foundCity(civ.id, { q: 15, r: 15 }, state.map, state.idCounters);
      state.cities[home.id] = home;
      civ.cities.push(home.id);

      for (const coord of mapHexesInRange(state.map, home.position, EXPANSION_SEARCH_RADIUS + 2)) {
        setTerrain(state, coord, 'desert');
      }
      // #1107 -- clear any real minor civ inside the controlled radius; see
      // the identical comment in buildGeometry above for why.
      for (const [minorCivId, minorCiv] of Object.entries(state.minorCivs)) {
        const mcCity = state.cities[minorCiv.cityId];
        if (mcCity && mapHexesInRange(state.map, home.position, EXPANSION_SEARCH_RADIUS + 2)
          .some(coord => hexKey(coord) === hexKey(mcCity.position))) {
          delete state.cities[minorCiv.cityId];
          delete state.minorCivs[minorCivId];
        }
      }
      setTerrain(state, home.position, 'grassland');
      for (const neighbor of getWrappedHexNeighbors(home.position, state.map.width)) {
        setTerrain(state, neighbor, 'grassland');
      }

      // Site A (home + (6,0)): plains + ocean neighbour, PLUS one extra
      // grassland tile in its neighbourhood -- scores marginally higher than B.
      const siteA: HexCoord = { q: home.position.q + 6, r: home.position.r };
      for (const coord of mapHexesInRange(state.map, siteA, 2)) {
        setTerrain(state, coord, 'plains');
      }
      setTerrain(state, { q: siteA.q, r: siteA.r - 1 }, 'ocean');
      setTerrain(state, { q: siteA.q + 2, r: siteA.r }, 'grassland');

      // Site B (home + (-6,0)): identical plains + ocean neighbour, no bonus tile.
      const siteB: HexCoord = { q: home.position.q - 6, r: home.position.r };
      for (const coord of mapHexesInRange(state.map, siteB, 2)) {
        setTerrain(state, coord, 'plains');
      }
      setTerrain(state, { q: siteB.q, r: siteB.r - 1 }, 'ocean');

      civ.visibility.tiles = {};
      for (const coord of mapHexesInRange(state.map, home.position, EXPANSION_SEARCH_RADIUS)) {
        civ.visibility.tiles[hexKey(coord)] = 'visible';
      }

      const settler = createUnit('settler', civ.id, home.position, state.idCounters);
      state.units[settler.id] = settler;
      civ.units.push(settler.id);

      // Confirm the fixture actually produces the intended A > B raw score
      // gap before asserting anything about stickiness -- otherwise this test
      // would pass vacuously if the terrain tweak had no effect.
      const freshPlan = prepareMajorCivStrategicPlan(state, civ.id).traces
        .find(entry => entry.decision === 'objective')
        ?.candidates.find(entry => entry.id.startsWith('expand:'));
      expect(freshPlan?.id).toBe(`expand:region:settle:${hexKey(siteA)}`);

      // Now seed a pre-existing plan already committed to site B, as if the
      // settler had been walking there for several rounds.
      state.opponentAI!.majorCivs[civ.id] = {
        ...createEmptyMajorCivPortfolio(),
        primaryPlan: {
          id: `ai-plan:${civ.id}:expand:region:settle:${hexKey(siteB)}:1`,
          actorId: civ.id,
          objective: 'expand',
          target: { kind: 'region', id: `settle:${hexKey(siteB)}`, anchor: { ...siteB } },
          theaterId: `local:${siteB.q},${siteB.r}`,
          phase: 'mobilizing',
          reasonCodes: [],
          commitment: 0.25,
          createdTurn: 1,
          reconsiderAfterTurn: 4,
          expiresAfterTurn: 13,
          lastProgressTurn: 1,
          requiredRoles: { settlement: 1 },
          assignedUnitIds: [settler.id],
        },
      };

      const stickyPlan = prepareMajorCivStrategicPlan(state, civ.id).traces
        .find(entry => entry.decision === 'objective')
        ?.candidates.find(entry => entry.id.startsWith('expand:'));
      expect(stickyPlan?.id).toBe(`expand:region:settle:${hexKey(siteB)}`);
    });

    it('switches away from a committed target once a dramatically better candidate is available, instead of staying sticky forever', () => {
      // Found investigating the same "dig into both" follow-up as the
      // distance-bound test above: after that fix landed, ai-1 in the real
      // campaign STAYED on its committed target (score 46.75) even though it
      // genuinely qualified as "in reach" (a real wraparound route across the
      // map, not a stale/unreachable pin -- see the distance-bound test's own
      // comment) -- because "still findable in rankedExpand" was the ONLY
      // criterion for staying committed, with no comparison against how much
      // better the alternatives were. Three local candidates scoring 71-73
      // sat completely untried the whole time. The switching-margin fix
      // mirrors selectPrimaryPlan's own switchingBonus hysteresis: a SMALL
      // score gap (the "stays committed" test above) must not evict the
      // current target, but a LARGE one must.
      const state = createNewGame(undefined, 'coastal-recovery-switch-large-gap', 'small');
      const civ = state.civilizations['ai-1']!;
      const home = foundCity(civ.id, { q: 15, r: 15 }, state.map, state.idCounters);
      state.cities[home.id] = home;
      civ.cities.push(home.id);

      for (const coord of mapHexesInRange(state.map, home.position, EXPANSION_SEARCH_RADIUS + 2)) {
        setTerrain(state, coord, 'desert');
      }
      setTerrain(state, home.position, 'grassland');
      for (const neighbor of getWrappedHexNeighbors(home.position, state.map.width)) {
        setTerrain(state, neighbor, 'grassland');
      }

      // Site A: all-grassland neighbourhood -- dramatically outscores the
      // desert committed site below (neither is coastal, so #1107's bias
      // plays no role in this test).
      const siteA: HexCoord = { q: home.position.q + 6, r: home.position.r };
      for (const coord of mapHexesInRange(state.map, siteA, 2)) {
        setTerrain(state, coord, 'grassland');
      }

      // The committed site: left as desert (the blanket fill above), a real,
      // legal, in-reach, but dramatically worse site.
      const weakCommittedSite: HexCoord = { q: home.position.q - 6, r: home.position.r };

      civ.visibility.tiles = {};
      for (const coord of mapHexesInRange(state.map, home.position, EXPANSION_SEARCH_RADIUS)) {
        civ.visibility.tiles[hexKey(coord)] = 'visible';
      }

      const settler = createUnit('settler', civ.id, home.position, state.idCounters);
      state.units[settler.id] = settler;
      civ.units.push(settler.id);

      state.opponentAI!.majorCivs[civ.id] = {
        ...createEmptyMajorCivPortfolio(),
        primaryPlan: {
          id: `ai-plan:${civ.id}:expand:region:settle:${hexKey(weakCommittedSite)}:1`,
          actorId: civ.id,
          objective: 'expand',
          target: { kind: 'region', id: `settle:${hexKey(weakCommittedSite)}`, anchor: { ...weakCommittedSite } },
          theaterId: `local:${weakCommittedSite.q},${weakCommittedSite.r}`,
          phase: 'advancing',
          reasonCodes: [],
          commitment: 0.25,
          createdTurn: 1,
          reconsiderAfterTurn: 4,
          expiresAfterTurn: 13,
          lastProgressTurn: 1,
          requiredRoles: { settlement: 1 },
          assignedUnitIds: [settler.id],
        },
      };

      const result = prepareMajorCivStrategicPlan(state, civ.id).traces
        .find(entry => entry.decision === 'objective')
        ?.candidates.find(entry => entry.id.startsWith('expand:'));

      expect(result?.id).not.toBe(`expand:region:settle:${hexKey(weakCommittedSite)}`);
      expect(result?.id).toBe(`expand:region:settle:${hexKey(siteA)}`);
    });

    it('drops a committed target once it falls outside EXPANSION_SEARCH_RADIUS of every current anchor, instead of pinning it forever', () => {
      // Found investigating a further "dig into both" request after the four
      // Task-7 fixes above landed: ai-1 in the real campaign stayed pinned to
      // an expand target 42+ tiles from either of its cities (score 46.75)
      // for 150+ rounds, while THREE genuinely local, legal candidates
      // scoring 71-73 sat completely untried -- confirmed directly via
      // getKnownExpansionSites called without the pin. The sticky/pinned
      // preference above has no distance bound at all: once a target becomes
      // "current" it stays preferred forever, even long after it drifts out
      // of the EXPANSION_SEARCH_RADIUS the belief layer's own normal search
      // respects (e.g. after the civ founds a second city elsewhere, shifting
      // its operational anchors). A committed target must stay bounded by
      // that same radius, or it isn't a "settler en route," it's a
      // permanently stuck plan pointed at an unreachable-in-practice site.
      const state = createNewGame(undefined, 'coastal-recovery-drop-distant-target', 'small');
      const civ = state.civilizations['ai-1']!;
      const home = foundCity(civ.id, { q: 15, r: 15 }, state.map, state.idCounters);
      state.cities[home.id] = home;
      civ.cities.push(home.id);

      for (const coord of mapHexesInRange(state.map, home.position, EXPANSION_SEARCH_RADIUS + 2)) {
        setTerrain(state, coord, 'desert');
      }
      setTerrain(state, home.position, 'grassland');
      for (const neighbor of getWrappedHexNeighbors(home.position, state.map.width)) {
        setTerrain(state, neighbor, 'grassland');
      }

      // A single legal, local, genuinely coastal site within reach.
      const siteA: HexCoord = { q: home.position.q + 6, r: home.position.r };
      for (const coord of mapHexesInRange(state.map, siteA, 2)) {
        setTerrain(state, coord, 'plains');
      }
      setTerrain(state, { q: siteA.q, r: siteA.r - 1 }, 'ocean');

      // The committed target: legal (own terrain patch, no rival city), but
      // 30 tiles away -- well beyond EXPANSION_SEARCH_RADIUS(8) of home.
      // r-offset, not q-offset: the map wraps horizontally (small = width 30),
      // so a q+30 offset wraps back to almost exactly home's own position --
      // r is never wrapped, so this stays genuinely far regardless of width.
      const farSite: HexCoord = { q: home.position.q, r: home.position.r + 30 };
      setTerrain(state, farSite, 'plains');
      for (const neighbor of getWrappedHexNeighbors(farSite, state.map.width)) {
        setTerrain(state, neighbor, 'plains');
      }
      // Clear a walkable land corridor all the way from home to farSite --
      // otherwise real (uncontrolled) generated terrain between the two could
      // block findPath entirely, making farSite unreachable (travelTurns:
      // Infinity) for a reason unrelated to this test's actual point (that a
      // reachable-but-far target must still be dropped once out of range).
      for (let r = home.position.r; r <= farSite.r; r++) {
        setTerrain(state, { q: home.position.q, r }, 'grassland');
      }

      civ.visibility.tiles = {};
      for (const coord of mapHexesInRange(state.map, home.position, EXPANSION_SEARCH_RADIUS)) {
        civ.visibility.tiles[hexKey(coord)] = 'visible';
      }
      // findPath (via resolveObjectiveTravelCandidates) is called with the
      // FOG-BOUNDED knownMap, not the full real map -- a civ cannot path
      // through territory it hasn't observed. Reveal the whole corridor, not
      // just farSite's own tile, or travelTurns comes back Infinity for a
      // reason unrelated to this test's actual point.
      for (let r = home.position.r; r <= farSite.r; r++) {
        civ.visibility.tiles[hexKey({ q: home.position.q, r })] = 'visible';
      }

      const settler = createUnit('settler', civ.id, home.position, state.idCounters);
      state.units[settler.id] = settler;
      civ.units.push(settler.id);

      state.opponentAI!.majorCivs[civ.id] = {
        ...createEmptyMajorCivPortfolio(),
        primaryPlan: {
          id: `ai-plan:${civ.id}:expand:region:settle:${hexKey(farSite)}:1`,
          actorId: civ.id,
          objective: 'expand',
          target: { kind: 'region', id: `settle:${hexKey(farSite)}`, anchor: { ...farSite } },
          theaterId: `local:${farSite.q},${farSite.r}`,
          phase: 'advancing',
          reasonCodes: [],
          commitment: 0.25,
          createdTurn: 1,
          reconsiderAfterTurn: 4,
          expiresAfterTurn: 13,
          lastProgressTurn: 1,
          requiredRoles: { settlement: 1 },
          assignedUnitIds: [settler.id],
        },
      };

      const result = prepareMajorCivStrategicPlan(state, civ.id).traces
        .find(entry => entry.decision === 'objective')
        ?.candidates.find(entry => entry.id.startsWith('expand:'));

      expect(result?.id).not.toBe(`expand:region:settle:${hexKey(farSite)}`);
      expect(result?.id).toBe(`expand:region:settle:${hexKey(siteA)}`);
    });

    it('drops a committed target once it is proven canonically illegal, instead of pinning it forever', () => {
      // Found investigating #1107's own Task 7 verification: the sticky-target
      // fix above (stays committed to an in-progress site) had a real gap --
      // if the belief layer's site turns out to be actually illegal by the
      // time the settler arrives (e.g. another civ founded a real city
      // nearby in the meantime, unseen due to fog), canFoundCityAt correctly
      // refuses to found there, but the settler had nothing else to do and
      // the OLD stickiness kept re-proposing the same illegal anchor every
      // round forever -- confirmed against the real long-horizon campaign,
      // where ai-1's settler sat on an illegal site for 120+ rounds. Once a
      // committed target is canonically illegal, it must stop being
      // pinned/preferred so the civ can pick a genuinely different site.
      const state = createNewGame(undefined, 'coastal-recovery-drop-illegal-target', 'small');
      const civ = state.civilizations['ai-1']!;
      const home = foundCity(civ.id, { q: 15, r: 15 }, state.map, state.idCounters);
      state.cities[home.id] = home;
      civ.cities.push(home.id);

      for (const coord of mapHexesInRange(state.map, home.position, EXPANSION_SEARCH_RADIUS + 2)) {
        setTerrain(state, coord, 'desert');
      }
      setTerrain(state, home.position, 'grassland');
      for (const neighbor of getWrappedHexNeighbors(home.position, state.map.width)) {
        setTerrain(state, neighbor, 'grassland');
      }

      // A single legal, genuinely coastal site -- the only real candidate.
      const siteA: HexCoord = { q: home.position.q + 6, r: home.position.r };
      for (const coord of mapHexesInRange(state.map, siteA, 2)) {
        setTerrain(state, coord, 'plains');
      }
      setTerrain(state, { q: siteA.q, r: siteA.r - 1 }, 'ocean');

      // The site the plan is ALREADY committed to -- but a real, OTHER civ's
      // city now sits 1 tile away (well inside MIN_CITY_CENTER_DISTANCE),
      // making it canonically illegal. canFoundCityAt reads every real city
      // unconditionally, not just known ones, so this is legal-check-real
      // even though ai-1 never "discovered" the rival city via fog.
      const illegalSite: HexCoord = { q: home.position.q - 6, r: home.position.r };
      for (const coord of mapHexesInRange(state.map, illegalSite, 2)) {
        setTerrain(state, coord, 'plains');
      }
      setTerrain(state, { q: illegalSite.q, r: illegalSite.r - 1 }, 'ocean');
      const rivalCity = foundCity('player', { q: illegalSite.q + 1, r: illegalSite.r }, state.map, state.idCounters);
      state.cities[rivalCity.id] = rivalCity;
      state.civilizations.player!.cities.push(rivalCity.id);

      civ.visibility.tiles = {};
      for (const coord of mapHexesInRange(state.map, home.position, EXPANSION_SEARCH_RADIUS)) {
        civ.visibility.tiles[hexKey(coord)] = 'visible';
      }

      const settler = createUnit('settler', civ.id, illegalSite, state.idCounters);
      state.units[settler.id] = settler;
      civ.units.push(settler.id);

      state.opponentAI!.majorCivs[civ.id] = {
        ...createEmptyMajorCivPortfolio(),
        primaryPlan: {
          id: `ai-plan:${civ.id}:expand:region:settle:${hexKey(illegalSite)}:1`,
          actorId: civ.id,
          objective: 'expand',
          target: { kind: 'region', id: `settle:${hexKey(illegalSite)}`, anchor: { ...illegalSite } },
          theaterId: `local:${illegalSite.q},${illegalSite.r}`,
          phase: 'advancing',
          reasonCodes: [],
          commitment: 0.25,
          createdTurn: 1,
          reconsiderAfterTurn: 4,
          expiresAfterTurn: 13,
          lastProgressTurn: 1,
          requiredRoles: { settlement: 1 },
          assignedUnitIds: [settler.id],
        },
      };

      const result = prepareMajorCivStrategicPlan(state, civ.id).traces
        .find(entry => entry.decision === 'objective')
        ?.candidates.find(entry => entry.id.startsWith('expand:'));

      expect(result?.id).not.toBe(`expand:region:settle:${hexKey(illegalSite)}`);
      expect(result?.id).toBe(`expand:region:settle:${hexKey(siteA)}`);
    });
  });
});

describe('#1064 difficulty invariance', () => {
  it.each(['explorer', 'standard', 'veteran'] as const)(
    'produces the same expand legality on %s',
    challenge => {
      const state = createNewGame(undefined, 'expand-difficulty-invariant', 'small');
      state.opponentChallenge = challenge;
      const civ = state.civilizations['ai-1'];

      const trace = prepareMajorCivStrategicPlan(state, civ.id).traces
        .find(entry => entry.decision === 'objective');
      const expandIds = (trace?.candidates ?? [])
        .filter(candidate => candidate.id.startsWith('expand:'))
        .map(candidate => candidate.id);

      // Core legality is difficulty-invariant. Challenge profiles tune scores and
      // timing (maxPrimaryForce, mobilizationRounds), never what is legal.
      expect(expandIds).toEqual(
        (prepareMajorCivStrategicPlan(
          { ...state, opponentChallenge: 'standard' },
          civ.id,
        ).traces.find(entry => entry.decision === 'objective')?.candidates ?? [])
          .filter(candidate => candidate.id.startsWith('expand:'))
          .map(candidate => candidate.id),
      );
    },
  );
});
