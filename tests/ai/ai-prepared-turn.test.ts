import { describe, expect, it } from 'vitest';
import {
  getPreparedAssignmentProfile,
  mergePreparedForceDemands,
  prepareMajorCivStrategicPlan,
} from '@/ai/ai-prepared-turn';
import { createNewGame } from '@/core/game-state';
import { getWrappedHexNeighbors, hexDistance, hexKey } from '@/systems/hex-utils';
import { foundCity } from '@/systems/city-system';
import { createUnit, findPath } from '@/systems/unit-system';

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

    expect(prepared.portfolio.primaryPlan).toBeNull();
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

    expect(prepared.portfolio.primaryPlan).toBeNull();
  });
});
