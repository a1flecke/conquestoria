import { describe, expect, it } from 'vitest';
import {
  getPreparedAssignmentProfile,
  incrementalDemandSeed,
  mergePreparedForceDemands,
  prepareMajorCivStrategicPlan,
  WORKER_SOFT_CAP,
} from '@/ai/ai-prepared-turn';
import { EXPANSION_SEARCH_RADIUS } from '@/ai/ai-expansion-sites';
import { createNewGame } from '@/core/game-state';
import { getWrappedHexNeighbors, hexDistance, hexKey, mapHexesInRange } from '@/systems/hex-utils';
import { foundCity } from '@/systems/city-system';
import {
  cityDistance,
  isCityCenterTerrain,
  MIN_CITY_CENTER_DISTANCE,
} from '@/systems/city-territory-system';
import { createUnit, findPath, UNIT_DEFINITIONS } from '@/systems/unit-system';
import type { GameState } from '@/core/types';

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

  it('preserves objective-readiness demand when no current unit can fill the role', () => {
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

    // #1064: primaryPlan is no longer guaranteed null here -- an eligible `expand`
    // candidate can now legitimately win by default when nothing else competes (that
    // IS the fix). The actual claim this test makes is narrower: no resource-expedition
    // (secure-resource) plan was drafted, while the readiness demand is still preserved.
    expect(prepared.portfolio.primaryPlan?.objective).not.toBe('secure-resource');
    expect(prepared.forceDemands).toContainEqual(expect.objectContaining({
      role: 'resource-expedition',
      desired: 1,
      assigned: 0,
      missing: 1,
      sourcePlanIds: ['objective-readiness'],
    }));
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

  it('re-opens a readiness demand only while the civilization owns no unit of that role', () => {
    // This MUST be built so a readiness demand is guaranteed to exist. A peaceful
    // fresh civ often produces no objective candidates at all, in which case
    // `choice.demands` is empty and a filter-then-assert test passes vacuously
    // while proving nothing.
    const state = createNewGame(undefined, 'demand-readiness-frontline', 'small');
    const civ = state.civilizations['ai-1'];
    addSpacedCities(state, civ.id, 0);           // ai-1 needs a city to place the warrior in
    addSpacedCities(state, 'player', 0);         // player needs a city to be a capture target
    civ.knownCivilizations = ['player'];
    civ.diplomacy.atWarWith = ['player'];
    // Reveal the enemy capital so a capture candidate (frontline + capture) exists.
    const enemyCity = state.cities[state.civilizations.player.cities[0]!]!;
    for (const coord of mapHexesInRange(state.map, enemyCity.position, 2)) {
      civ.visibility.tiles[hexKey(coord)] = 'visible';
    }
    // Strip every combat unit so `frontline` is genuinely unowned.
    for (const unitId of [...civ.units]) {
      if (UNIT_DEFINITIONS[state.units[unitId]!.type].strength > 0) {
        delete state.units[unitId];
        civ.units = civ.units.filter(id => id !== unitId);
      }
    }

    const readiness = (demands: ReturnType<typeof prepareMajorCivStrategicPlan>['forceDemands']) =>
      demands.find(entry =>
        entry.role === 'frontline' && entry.sourcePlanIds.includes('objective-readiness'));

    const before = readiness(prepareMajorCivStrategicPlan(state, civ.id).forceDemands);
    // Fails loudly rather than vacuously if the fixture produced no candidate.
    expect(before?.missing).toBe(1);

    const warrior = createUnit(
      'warrior', civ.id, state.cities[civ.cities[0]!]!.position, state.idCounters,
    );
    state.units[warrior.id] = warrior;
    civ.units.push(warrior.id);

    const after = readiness(prepareMajorCivStrategicPlan(state, civ.id).forceDemands);
    expect(after?.missing ?? 0).toBe(0);
  });
});

describe('#1064 expand objective candidates', () => {
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
