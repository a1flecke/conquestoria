import { describe, it, expect } from 'vitest';
import { placeMinorCivs, processMinorCivTurn, planPurposefulMinorCivTurn, checkEraAdvancement, processMinorCivEraUpgrade, conquestMinorCiv, peacefullyAbsorbMinorCiv, processGuerrilla, processScuffles, applyDiplomaticReaction } from '@/systems/minor-civ-system';
import { createHotSeatGame, createNewGame } from '@/core/game-state';
import { hexDistance, hexKey, mapNeighbors } from '@/systems/hex-utils';
import { foundCity } from '@/systems/city-system';
import { EventBus } from '@/core/event-bus';
import { parseSaveFile, serializeSaveFile } from '@/storage/save-file-transfer';
import { normalizeLoadedStateForTest } from '@/storage/save-manager';
import { getEraAdvancementTechs, TECH_TREE } from '@/systems/tech-definitions';
import { getEffectiveTechCost } from '@/systems/tech-system';
import { MINOR_CIV_DEFINITIONS } from '@/systems/minor-civ-definitions';
import { UNIT_DEFINITIONS } from '@/systems/unit-definitions';
import { createUnit } from '@/systems/unit-lifecycle';
import { processMinorCivRegionalGrievanceTurn } from '@/systems/minor-civ-coalition-system';
import { advancePlayerCivToEra as setTargetCivEra } from './helpers/minor-civ-scenario-fixtures';
import { createStartQualityIndex } from '@/systems/start-quality';
import { getPolarRowBand } from '@/systems/geo-latitude';
import { preloadGeoMapData } from '../helpers/geo-map-data';
import type { GameState, TerrainType } from '@/core/types';

const mkC = () => ({ nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 });

const bus = new EventBus();

function setNearbyPressureEra(state: ReturnType<typeof createNewGame>, minorCivId: string, era: number): void {
  const city = state.cities[state.minorCivs[minorCivId]!.cityId];
  setTargetCivEra(state, era);
  state.cities['pressure-source'] = {
    id: 'pressure-source', owner: 'player', position: { q: city.position.q + 1, r: city.position.r },
  } as never;
  state.civilizations.player.cities = ['pressure-source'];
}

// #1724: an allied free-unit gift uses the same city-placement rule as every other
// city-generated map unit, so it cannot stack on another owner's unit.
describe('allied free-unit city placement', () => {
  function alliedState(seed: string, blockNeighbours: boolean) {
    const base = createNewGame(undefined, seed, 'small');
    const placed = placeMinorCivs(base, 'small');
    const state = {
      ...base,
      minorCivs: placed.minorCivs,
      cities: { ...base.cities, ...placed.cities },
      units: { ...base.units, ...placed.units },
    };
    const def = MINOR_CIV_DEFINITIONS.find(candidate => candidate.allyBonus.type === 'free_unit');
    if (!def || def.allyBonus.type !== 'free_unit') throw new Error('no free-unit city-state definition');
    const allyBonus = def.allyBonus;
    const mc = Object.values(state.minorCivs).find(candidate => !candidate.isDestroyed);
    if (!mc) throw new Error('fixture has no free-unit city-state');
    // Use a known free-unit ally bonus while keeping the placed city-state identity/city.
    mc.definitionId = def.id;
    const civId = state.currentPlayer;
    const land = Object.values(state.map.tiles).find(tile =>
      tile.terrain !== 'ocean' && tile.terrain !== 'coast');
    if (!land) throw new Error('fixture map has no land');
    const city = foundCity(civId, { ...land.coord }, state.map, state.idCounters);
    state.cities[city.id] = city;
    state.civilizations[civId].cities = [city.id];
    mc.chainStatusByCiv[civId] = { status: 'allied' } as never;
    mc.diplomacy.relationships[civId] = 100;
    state.turn = allyBonus.everyNTurns;
    const foreignCivId = Object.keys(state.civilizations).find(id => id !== civId)!;
    const blocker = { ...createUnit('warrior', foreignCivId, city.position, state.idCounters), id: 'city-blocker' };
    state.units[blocker.id] = blocker;
    state.civilizations[foreignCivId].units.push(blocker.id);
    const occupied = new Set(Object.values(state.units).map(unit => hexKey(unit.position)));
    const exit = mapNeighbors(state.map, city.position).find(coord =>
      Boolean(state.map.tiles[hexKey(coord)]) && !occupied.has(hexKey(coord)));
    for (const coord of mapNeighbors(state.map, city.position)) {
      const key = hexKey(coord);
      if (!state.map.tiles[key]) continue;
      state.map.tiles[key] = blockNeighbours
        ? { ...state.map.tiles[key], terrain: 'ocean', elevation: 'lowland' }
        : coord === exit
          ? { ...state.map.tiles[key], terrain: 'grassland', elevation: 'lowland' }
          : state.map.tiles[key];
    }
    return { state, civId, allyBonus, city, exit };
  }

  it('grants the free unit on a legal neighbour when the city centre is blocked', () => {
    const { state, civId, allyBonus, city, exit } = alliedState('free-unit-fallback', false);
    const before = new Set(state.civilizations[civId].units);

    const after = processMinorCivTurn(state, new EventBus());

    const newUnits = after.civilizations[civId].units
      .filter(id => !before.has(id))
      .map(id => after.units[id]);
    expect(newUnits).toHaveLength(1);
    expect(newUnits[0]!.type).toBe(allyBonus.unitType);
    expect(newUnits[0]!.position).toEqual(exit);
    expect(newUnits[0]!.position).not.toEqual(city.position);
  });

  it('grants nothing this cadence when no legal city tile exists', () => {
    const { state, civId, allyBonus } = alliedState('free-unit-no-tile', true);
    const before = new Set(state.civilizations[civId].units);

    const after = processMinorCivTurn(state, new EventBus());

    const granted = after.civilizations[civId].units
      .filter(id => !before.has(id))
      .map(id => after.units[id])
      .filter(unit => unit?.type === allyBonus.unitType);
    expect(granted).toHaveLength(0);
  });
});

describe('minor-civ relationship notification history', () => {
  it('emits the first status notice for a non-viewing hot-seat civ after save/reload', () => {
    const state = createHotSeatGame({
      playerCount: 2,
      mapSize: 'small',
      players: [
        { name: 'Alice', slotId: 'player-1', civType: 'egypt', isHuman: true },
        { name: 'Bob', slotId: 'player-2', civType: 'rome', isHuman: true },
      ],
    }, 'minor-civ-history-hot-seat');
    const minorCiv = Object.values(state.minorCivs)[0]!;
    minorCiv.lastNotifiedStatusByCiv = { 'player-1': 'neutral' };
    minorCiv.diplomacy.relationships['player-2'] = 35;

    const parsed = parseSaveFile(serializeSaveFile(state));
    if (parsed.status !== 'success') throw new Error(parsed.message);
    const loaded = normalizeLoadedStateForTest(parsed.state);
    const events: Array<{ majorCivId: string; minorCivId: string; newStatus: string }> = [];
    const eventBus = new EventBus();
    eventBus.on('minor-civ:relationship-threshold', event => events.push(event));

    const next = processMinorCivTurn(loaded, eventBus);

    expect(next.minorCivs[minorCiv.id]!.lastNotifiedStatusByCiv).toMatchObject({
      'player-1': 'neutral',
      'player-2': 'friendly',
    });
    const playerTwoEvents = events.filter(
      event => event.majorCivId === 'player-2',
    );
    expect(playerTwoEvents).toHaveLength(1);
    expect(playerTwoEvents[0]).toMatchObject({
      majorCivId: 'player-2',
      minorCivId: minorCiv.id,
      newStatus: 'friendly',
    });
  });
});

const PATCH_TERRAIN: TerrainType[] = ['grassland', 'forest', 'hills', 'plains'];

/** Paints a radius-2 patch of mixed, workable land (non-wrapping offsets clipped to the map). */
function paintLandPatch(state: GameState, centre: { q: number; r: number }): void {
  for (const tile of Object.values(state.map.tiles)) {
    const dq = tile.coord.q - centre.q;
    const dr = tile.coord.r - centre.r;
    if ((Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2 <= 2) {
      tile.terrain = PATCH_TERRAIN[(tile.coord.q * 7 + tile.coord.r * 13) % PATCH_TERRAIN.length];
    }
  }
}

function oceanWorld(seed: string): GameState {
  const state = createNewGame(undefined, seed, 'small');
  state.map.wrapsHorizontally = false;
  state.units = { settler: createUnit('settler', 'player', { q: 0, r: 5 }, state.idCounters) };
  state.cities = {};
  state.civilizations.player.cities = [];
  state.barbarianCamps = {};
  for (const tile of Object.values(state.map.tiles)) {
    tile.terrain = 'ocean';
    tile.wonder = null;
    tile.resource = null;
  }
  return state;
}

describe('minor civ placement: start-quality floor (design 2026-11-25, B5)', () => {
  it('places a city-state on livable land, never on a one-tile island', () => {
    const state = oceanWorld('mc-floor-islet');
    paintLandPatch(state, { q: 15, r: 15 });
    state.map.tiles['25,25'].terrain = 'plains';
    const result = placeMinorCivs(state, 'small');
    const index = createStartQualityIndex(state.map);
    const cities = Object.values(result.minorCivs).map(mc => result.cities[mc.cityId]);
    expect(cities.length).toBeGreaterThan(0);
    for (const city of cities) {
      expect(hexKey(city.position)).not.toBe('25,25');
      expect(index.floorFailures(city.position, 'city-state')).toEqual([]);
    }
  });

  it('places no city-state rather than a stranded one when only islets exist', () => {
    const state = oceanWorld('mc-floor-none');
    state.map.tiles['15,15'].terrain = 'plains';
    state.map.tiles['25,25'].terrain = 'grassland';
    const result = placeMinorCivs(state, 'small');
    expect(Object.keys(result.minorCivs)).toEqual([]);
  });

  it('keeps Earth small True Start city-states off tiny landmasses', async () => {
    await preloadGeoMapData();
    const state = createNewGame({
      civType: 'rome', seed: 'matrix-0', mapSize: 'small', opponentCount: 2,
      mapScript: 'earth', startPlacementMode: 'historical', gameTitle: 't',
    });
    const index = createStartQualityIndex(state.map, { polarRows: getPolarRowBand('earth', state.map.height) });
    for (const city of Object.values(state.cities)) {
      expect(index.assess(city.position).landmassTiles).toBeGreaterThan(4);
      expect(index.floorFailures(city.position, 'city-state')).toEqual([]);
    }
  });
});

describe('minor civ placement', () => {
  it('stamps foundedTurn with the creation turn on every placed city-state (#497)', () => {
    const state = createNewGame(undefined, 'mc-founded-turn', 'small');
    const result = placeMinorCivs(state, 'small');
    const placed = Object.values(result.minorCivs);
    expect(placed.length).toBeGreaterThan(0);
    for (const minorCiv of placed) expect(minorCiv.foundedTurn).toBe(state.turn);
  });

  it('places correct number for small map', () => {
    const state = createNewGame(undefined, 'mc-place-test', 'small');
    const result = placeMinorCivs(state, 'small');
    expect(Object.keys(result.minorCivs).length).toBeGreaterThanOrEqual(2);
    expect(Object.keys(result.minorCivs).length).toBeLessThanOrEqual(4);
  });

  it('places correct number for medium map', () => {
    const state = createNewGame(undefined, 'mc-place-med', 'medium');
    const result = placeMinorCivs(state, 'medium');
    expect(Object.keys(result.minorCivs).length).toBeGreaterThanOrEqual(4);
    expect(Object.keys(result.minorCivs).length).toBeLessThanOrEqual(6);
  });

  it('respects distance from start positions', () => {
    const state = createNewGame(undefined, 'mc-dist-test', 'medium');
    const result = placeMinorCivs(state, 'medium');
    const startPositions = Object.values(state.units)
      .filter(u => u.type === 'settler')
      .map(u => u.position);
    for (const mc of Object.values(result.minorCivs)) {
      const city = result.cities[mc.cityId];
      for (const start of startPositions) {
        expect(hexDistance(city.position, start)).toBeGreaterThanOrEqual(8);
      }
    }
  });

  it('does not reject a far-edge candidate on a non-wrapping map (issue #520 regression: findValidPosition previously called wrappedHexDistance unconditionally)', () => {
    const state = createNewGame(undefined, 'mc-nonwrap-edge', 'small');
    state.map.wrapsHorizontally = false;
    const width = state.map.width;
    state.units = { settler: createUnit('settler', 'player', { q: 0, r: 5 }, state.idCounters) };
    state.cities = {};
    state.civilizations.player.cities = [];
    for (const tile of Object.values(state.map.tiles)) {
      tile.terrain = 'ocean';
      tile.wonder = null;
    }
    // A livable patch (the city-state floor, design 2026-11-25) around q=width-1, r=5.
    paintLandPatch(state, { q: width - 1, r: 5 });

    const result = placeMinorCivs(state, 'small');

    // The only passable candidate is at q=width-1, r=5 — raw distance from the
    // start at q=0 is width-1 (far), but the pre-fix code treated it as
    // wrapped-distance 1 (adjacent) regardless of wrapsHorizontally, rejecting
    // it and leaving 0 minor civs placed on a map that doesn't actually wrap.
    expect(Object.keys(result.minorCivs).length).toBeGreaterThan(0);
  });

  it('respects distance between minor civs', () => {
    const state = createNewGame(undefined, 'mc-inter-test', 'medium');
    const result = placeMinorCivs(state, 'medium');
    const mcCities = Object.values(result.minorCivs).map(mc => result.cities[mc.cityId]);
    for (let i = 0; i < mcCities.length; i++) {
      for (let j = i + 1; j < mcCities.length; j++) {
        expect(hexDistance(mcCities[i].position, mcCities[j].position)).toBeGreaterThanOrEqual(10);
      }
    }
  });

  it('creates city and garrison for each minor civ', () => {
    const state = createNewGame(undefined, 'mc-city-test', 'small');
    const result = placeMinorCivs(state, 'small');
    for (const mc of Object.values(result.minorCivs)) {
      expect(result.cities[mc.cityId]).toBeDefined();
      expect(result.cities[mc.cityId].owner).toBe(`mc-${mc.definitionId}`);
      expect(result.cities[mc.cityId].population).toBe(3);
      expect(mc.units.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('keeps minor-civ city labels globally unique during placement', () => {
    const state = createNewGame(undefined, 'mc-unique-test', 'medium');
    const result = placeMinorCivs(state, 'medium');
    const names = Object.values(result.minorCivs).map(mc => result.cities[mc.cityId].name);

    expect(new Set(names).size).toBe(names.length);
  });

  it('does not place on impassable terrain', () => {
    const state = createNewGame(undefined, 'mc-terrain-test', 'small');
    const result = placeMinorCivs(state, 'small');
    const impassable = ['ocean', 'coast', 'mountain'];
    for (const mc of Object.values(result.minorCivs)) {
      const city = result.cities[mc.cityId];
      const tile = state.map.tiles[hexKey(city.position)];
      expect(impassable).not.toContain(tile.terrain);
    }
  });

  it('initializes diplomacy with major civs only', () => {
    const state = createNewGame(undefined, 'mc-diplo-test', 'small');
    const result = placeMinorCivs(state, 'small');
    for (const mc of Object.values(result.minorCivs)) {
      const relKeys = Object.keys(mc.diplomacy.relationships);
      expect(relKeys).toContain('player');
      expect(relKeys).toContain('ai-1');
      // Should NOT contain other minor civ IDs
      for (const key of relKeys) {
        expect(key.startsWith('mc-')).toBe(false);
      }
    }
  });
});

describe('minor civ turn processing', () => {
  it('a tech finished by an allied city-state\'s science is announced and its consequences applied, as research is', () => {
    const state = createNewGame(undefined, 'minor-ally-science-completes', 'small');
    const mcId = Object.keys(state.minorCivs)[0]!;
    const mc = state.minorCivs[mcId];
    mc.definitionId = 'alexandria'; // +3 science per turn to an ally
    mc.chainStatusByCiv = { ...mc.chainStatusByCiv, player: { ...(mc.chainStatusByCiv.player ?? {}), status: 'allied' } as never };
    const techState = state.civilizations.player.techState;
    const tech = TECH_TREE.find(candidate => candidate.id === 'gathering')!;
    techState.currentResearch = tech.id;
    techState.researchProgress = getEffectiveTechCost(tech, techState.completed) - 1;
    const bus = new EventBus();
    const completed: string[] = [];
    bus.on('tech:completed', ({ civId, techId }) => { if (civId === 'player') completed.push(techId); });

    const result = processMinorCivTurn(state, bus);

    expect(result.civilizations.player.techState.completed).toContain('gathering');
    expect(completed).toEqual(['gathering']);
  });

  it('runs hidden economy before minor-civ planning so completed units cannot act same turn', () => {
    const state = createNewGame(undefined, 'minor-economy-turn-order', 'small');
    const mcId = Object.keys(state.minorCivs)[0]!;
    const mc = state.minorCivs[mcId];
    setTargetCivEra(state, 2);
    const city = state.cities[mc.cityId];
    city.productionQueue = ['warrior'];
    city.productionProgress = 999;
    mc.economy = { policy: 'defense', posture: 'mobilizing', lastProcessedTurn: 0 };
    const beforeIds = new Set(Object.keys(state.units));

    const result = processMinorCivTurn(state, new EventBus());
    const created = Object.values(result.units).find(unit => !beforeIds.has(unit.id))!;

    expect(created.owner).toBe(mcId);
    expect(created.hasActed).toBe(true);
    expect(result.opponentAI?.minorCivs[mcId]?.assignedUnitIds).toContain(created.id);
  });

  it('does not spawn both a production defender and an emergency levy in one minor-civ turn (#951)', () => {
    const state = createNewGame(undefined, 'minor-economy-no-double-spawn', 'small');
    state.era = 2;
    const mcId = Object.keys(state.minorCivs)[0]!;
    setTargetCivEra(state, 2);
    const mc = state.minorCivs[mcId];
    const city = state.cities[mc.cityId];
    city.population = 4;
    city.productionQueue = ['warrior'];
    city.productionProgress = 999;
    mc.regionalGrievanceByCiv = {
      player: {
        targetCivId: 'player',
        pressure: 90,
        status: 'coalition-talks',
        lastUpdatedTurn: state.turn,
        causes: [],
      },
    };
    const beforeMinorUnits = mc.units.filter(unitId => state.units[unitId]).length;

    const result = processMinorCivTurn(state, new EventBus());
    const afterMinorUnits = result.minorCivs[mcId].units.filter(unitId => result.units[unitId]).length;

    expect(afterMinorUnits - beforeMinorUnits).toBe(1);
  });

  it('production-backed defenders stay within local force projection', () => {
    const state = createNewGame(undefined, 'minor-economy-local-defense', 'small');
    const mcId = Object.keys(state.minorCivs)[0]!;
    const mc = state.minorCivs[mcId];
    const city = state.cities[mc.cityId];
    const distant = createUnit('warrior', 'barbarian', { q: city.position.q + 9, r: city.position.r }, state.idCounters);
    distant.id = 'distant-raider';
    state.units[distant.id] = distant;
    city.productionQueue = ['warrior'];
    city.productionProgress = 999;
    mc.economy = { policy: 'defense', posture: 'mobilizing', lastProcessedTurn: 0 };

    const result = processMinorCivTurn(state, new EventBus());

    expect(JSON.stringify(result.opponentAI?.minorCivs[mcId])).not.toContain('distant-raider');
  });

  it('purposefully intercepts always-hostile units inside its territory', () => {
    const state = createNewGame(undefined, 'mc-purposeful-defense', 'small');
    const mcId = Object.keys(state.minorCivs)[0]!;
    const mc = state.minorCivs[mcId];
    const city = state.cities[mc.cityId];
    const garrison = state.units[mc.units[0]];
    const targetPosition = Object.values(state.map.tiles)
      .map(tile => tile.coord)
      .find(coord =>
        hexDistance(coord, city.position) === 1
        && !['ocean', 'coast', 'mountain'].includes(state.map.tiles[hexKey(coord)].terrain))!;
    garrison.position = { ...city.position };
    const raider = createUnit('warrior', 'barbarian', targetPosition, state.idCounters);
    raider.id = 'local-raider';
    state.units[raider.id] = raider;
    const before = structuredClone(state);

    const result = processMinorCivTurn(
      state,
      new EventBus(),
    );

    expect(state).toEqual(before);
    expect(result.opponentAI?.minorCivs[mcId]).toMatchObject({
      objective: 'defend',
      target: { kind: 'unit', id: raider.id },
    });
    expect(result.units[garrison.id]?.hasActed).toBe(true);
  });

  it('does not attack a peaceful major or target anything outside radius six', () => {
    const state = createNewGame(undefined, 'mc-purposeful-bounds', 'small');
    const mcId = Object.keys(state.minorCivs)[0]!;
    const mc = state.minorCivs[mcId];
    const city = state.cities[mc.cityId];
    const peaceful = state.units[state.civilizations.player.units[0]];
    peaceful.position = { q: city.position.q + 1, r: city.position.r };
    const distant = createUnit(
      'warrior',
      'barbarian',
      { q: city.position.q + 8, r: city.position.r },
      state.idCounters,
    );
    distant.id = 'distant-raider';
    state.units[distant.id] = distant;

    const result = processMinorCivTurn(
      state,
      new EventBus(),
    );

    expect(result.opponentAI?.minorCivs[mcId].target).toMatchObject({
      kind: 'region',
    });
    expect(result.units[peaceful.id].health).toBe(peaceful.health);
    expect(JSON.stringify(result.opponentAI?.minorCivs[mcId])).not.toContain(distant.id);
  });

  it('returns a badly damaged unit toward its city without changing combat stats', () => {
    const state = createNewGame(undefined, 'mc-purposeful-retreat', 'small');
    const mcId = Object.keys(state.minorCivs)[0]!;
    const mc = state.minorCivs[mcId];
    const city = state.cities[mc.cityId];
    const garrison = state.units[mc.units[0]];
    const start = Object.values(state.map.tiles)
      .map(tile => tile.coord)
      .find(coord =>
        hexDistance(coord, city.position) === 4
        && !['ocean', 'coast', 'mountain'].includes(state.map.tiles[hexKey(coord)].terrain))!;
    garrison.position = start;
    garrison.health = 10;
    const strengthBefore = UNIT_DEFINITIONS[garrison.type].strength;

    const result = processMinorCivTurn(
      state,
      new EventBus(),
    );

    expect(hexDistance(result.units[garrison.id].position, city.position))
      .toBeLessThan(hexDistance(start, city.position));
    expect(UNIT_DEFINITIONS[result.units[garrison.id].type].strength).toBe(strengthBefore);
  });

  it('never steps onto a tile a structure blocks, such as a camp or pirate stronghold (#1704)', () => {
    const state = createNewGame(undefined, 'mc-purposeful-retreat', 'small');
    const mcId = Object.keys(state.minorCivs)[0]!;
    const mc = state.minorCivs[mcId];
    const city = state.cities[mc.cityId];
    const garrison = state.units[mc.units[0]];
    garrison.position = Object.values(state.map.tiles)
      .map(tile => tile.coord)
      .find(coord =>
        hexDistance(coord, city.position) === 4
        && !['ocean', 'coast', 'mountain'].includes(state.map.tiles[hexKey(coord)].terrain))!;
    garrison.health = 10;

    // Block every step it would choose, one at a time, until it has nowhere legal to go.
    const blocked: string[] = [];
    for (let guard = 0; guard < 6; guard++) {
      const order = planPurposefulMinorCivTurn(state, mcId).moveOrders.find(entry => entry.unitId === garrison.id);
      if (!order) break;
      expect(blocked).not.toContain(hexKey(order.to));
      blocked.push(hexKey(order.to));
      state.barbarianCamps[`blocker-${guard}`] = {
        id: `blocker-${guard}`, position: order.to, strength: 10, spawnCooldown: 3,
      } as (typeof state.barbarianCamps)[string];
    }
    expect(blocked.length).toBeGreaterThan(0);
  });

  it('abandons a persisted retaliation target after peace', () => {
    const state = createNewGame(undefined, 'mc-purposeful-peace', 'small');
    const mcId = Object.keys(state.minorCivs)[0]!;
    const mc = state.minorCivs[mcId];
    const city = state.cities[mc.cityId];
    const playerUnit = state.units[state.civilizations.player.units[0]];
    playerUnit.position = { q: city.position.q + 3, r: city.position.r };
    mc.diplomacy.atWarWith.push('player');
    state.civilizations.player.diplomacy.atWarWith.push(mcId);
    const wartime = planPurposefulMinorCivTurn(state, mcId);
    state.opponentAI!.minorCivs[mcId] = wartime.plan!;

    mc.diplomacy.atWarWith = [];
    state.civilizations.player.diplomacy.atWarWith = [];
    const peacetime = planPurposefulMinorCivTurn(state, mcId);

    expect(peacetime.plan?.target).toMatchObject({ kind: 'region' });
    expect(peacetime.attackOrders).toEqual([]);
  });

  it('does not free-replace a lost garrison once the hidden economy manages the city-state', () => {
    const state = createNewGame(undefined, 'mc-garrison', 'small');
    const mcId = Object.keys(state.minorCivs)[0];
    if (!mcId) return;
    const mc = state.minorCivs[mcId];
    // Remove garrison unit
    for (const uid of mc.units) {
      delete state.units[uid];
    }
    mc.units = [];
    mc.garrisonCooldown = 1;

    const result = processMinorCivTurn(state, bus);
    expect(result.minorCivs[mcId].garrisonCooldown).toBe(1);
    expect(result.minorCivs[mcId].units).toHaveLength(0);

    const result2 = processMinorCivTurn(result, bus);
    expect(result2.minorCivs[mcId].units).toHaveLength(0);
    expect(result2.minorCivs[mcId].economy).toBeDefined();
  });

  it('skips garrison respawn when city hex is occupied by another unit', () => {
    const state = createNewGame(undefined, 'mc-garrison-blocked', 'small');
    const mcId = Object.keys(state.minorCivs)[0];
    if (!mcId) return;
    const mc = state.minorCivs[mcId];
    const city = state.cities[mc.cityId];
    if (!city) return;

    // Kill the garrison
    for (const uid of mc.units) {
      delete state.units[uid];
    }
    mc.units = [];
    mc.garrisonCooldown = 0;

    // Place a player unit on the city hex
    const occupier = createUnit('warrior', 'player', city.position, mkC());
    state.units[occupier.id] = occupier;

    const result = processMinorCivTurn(state, bus);

    // Garrison must NOT have been spawned — hex is blocked
    expect(result.minorCivs[mcId].units.length).toBe(0);
  });

  it('does not free-respawn a garrison on an economy-managed city-state even when city hex is free', () => {
    const state = createNewGame(undefined, 'mc-garrison-free', 'small');
    const mcId = Object.keys(state.minorCivs)[0];
    if (!mcId) return;
    const mc = state.minorCivs[mcId];

    // Kill the garrison
    for (const uid of mc.units) {
      delete state.units[uid];
    }
    mc.units = [];
    mc.garrisonCooldown = 0;

    const result = processMinorCivTurn(state, bus);

    expect(result.minorCivs[mcId].units).toHaveLength(0);
    expect(result.minorCivs[mcId].economy).toBeDefined();
  });

  it('applies ally bonus to allied major civ', () => {
    const state = createNewGame(undefined, 'mc-ally', 'small');
    const mcId = Object.keys(state.minorCivs)[0];
    if (!mcId) return;
    const mc = state.minorCivs[mcId];
    mc.definitionId = 'carthage';
    mc.diplomacy.relationships.player = 65;
    mc.chainStatusByCiv.player = {
      chainId: 'trade-partnership', status: 'allied', statusTurn: state.turn, earnedTurn: state.turn,
    };
    const goldBefore = state.civilizations.player.gold;

    const result = processMinorCivTurn(state, bus);
    expect(result.civilizations.player.gold).toBe(goldBefore + 5);
  });

  it('does not apply an ally bonus from relationship score alone', () => {
    const state = createNewGame(undefined, 'mc-score-not-alliance', 'small');
    const mcId = Object.keys(state.minorCivs)[0];
    const mc = state.minorCivs[mcId];
    mc.definitionId = 'carthage';
    mc.diplomacy.relationships.player = 65;
    const goldBefore = state.civilizations.player.gold;

    const result = processMinorCivTurn(state, bus);

    expect(result.civilizations.player.gold).toBe(goldBefore);
  });

  it('does not mutate the input state while processing quests and garrisons', () => {
    const state = createNewGame(undefined, 'mc-turn-immutable', 'small');
    const mcId = Object.keys(state.minorCivs)[0];
    const city = state.cities[state.minorCivs[mcId].cityId];
    state.civilizations.player.visibility.tiles[hexKey(city.position)] = 'fog';
    const before = structuredClone(state);

    const result = processMinorCivTurn(state, new EventBus());

    expect(state).toEqual(before);
    expect(result).not.toBe(state);
  });

  it('skips destroyed minor civs', () => {
    const state = createNewGame(undefined, 'mc-destroyed', 'small');
    const mcId = Object.keys(state.minorCivs)[0];
    if (!mcId) return;
    state.minorCivs[mcId].isDestroyed = true;

    const result = processMinorCivTurn(state, bus);
    expect(result.minorCivs[mcId].isDestroyed).toBe(true);
  });

  it('does not issue a quest to a player who has not discovered the minor civ', () => {
    const state = createNewGame(undefined, 'mc-undiscovered-quest', 'small');
    const mcId = Object.keys(state.minorCivs)[0];
    if (!mcId) return;

    let questIssued = false;
    const localBus = new EventBus();
    localBus.on('minor-civ:quest-issued', ({ majorCivId }: { majorCivId: string }) => {
      if (majorCivId === 'player') {
        questIssued = true;
      }
    });

    processMinorCivTurn(state, localBus);

    expect(state.minorCivs[mcId].activeQuests.player).toBeUndefined();
    expect(questIssued).toBe(false);
  });

  it('issues a quest after the player has discovered the city-state', () => {
    const state = createNewGame(undefined, 'mc-discovered-quest', 'small');
    const mcId = Object.keys(state.minorCivs)[0];
    if (!mcId) return;
    state.minorCivs[mcId].definitionId = 'carthage';
    state.civilizations.player.gold = 500;
    const city = state.cities[state.minorCivs[mcId].cityId];
    state.civilizations.player.visibility.tiles[hexKey(city.position)] = 'fog';

    let questIssued = false;
    const localBus = new EventBus();
    localBus.on('minor-civ:quest-issued', ({ minorCivId, majorCivId }: { minorCivId: string; majorCivId: string }) => {
      if (minorCivId === mcId && majorCivId === 'player') {
        questIssued = true;
      }
    });

    const result = processMinorCivTurn(state, localBus);

    expect(result.minorCivs[mcId].activeQuests.player).toBeDefined();
    expect(state.minorCivs[mcId].activeQuests.player).toBeUndefined();
    expect(questIssued).toBe(true);
  });
});

describe('era advancement', () => {
  function advanceMajorityToEra(state: ReturnType<typeof createNewGame>, era: number): void {
    const activeCivIds = Object.values(state.civilizations)
      .filter(civ => !civ.isEliminated)
      .map(civ => civ.id)
      .sort();
    const required = Math.floor(activeCivIds.length / 2) + 1;
    const completed = Array.from({ length: Math.max(0, era - 1) }, (_, index) => index + 2)
      .flatMap(candidate => {
        const techs = getEraAdvancementTechs(candidate);
        return techs.slice(0, Math.ceil(techs.length * (candidate <= 3 ? 0.5 : candidate <= 8 ? 0.6 : 0.55))).map(tech => tech.id);
      });
    for (const civId of activeCivIds.slice(0, required)) {
      state.civilizations[civId].techState.completed = [...completed];
    }
  }

  it('advances World Age when a strict majority reaches the next personal era', () => {
    const state = createNewGame(undefined, 'era-test', 'small');
    state.era = 1;
    advanceMajorityToEra(state, 2);
    const newEra = checkEraAdvancement(state);
    expect(newEra).toBe(2);
  });

  it('does not advance World Age when only one civilization reaches an era', () => {
    const state = createNewGame(undefined, 'era-single-tech', 'small');
    state.era = 1;
    const era2Techs = getEraAdvancementTechs(2);
    state.civilizations.player.techState.completed = era2Techs.slice(0, Math.ceil(era2Techs.length * 0.5)).map(tech => tech.id);
    const newEra = checkEraAdvancement(state);
    expect(newEra).toBe(1);
  });

  it('requires contiguous personal progress before a majority can advance World Age', () => {
    const state = createNewGame(undefined, 'era-five-advance', 'small');
    state.era = 1;
    advanceMajorityToEra(state, 5);
    const newEra = checkEraAdvancement(state);
    expect(newEra).toBe(5);
  });
});

describe('minor civ era upgrades', () => {
  it('does not rewrite the garrison unit type when local pressure era advances', () => {
    const state = createNewGame(undefined, 'mc-era-up', 'small');
    state.era = 2;
    const mcId = Object.keys(state.minorCivs)[0];
    if (!mcId) return;
    const mc = state.minorCivs[mcId];
    mc.lastEraUpgrade = 1;
    setNearbyPressureEra(state, mcId, 2);

    processMinorCivEraUpgrade(state, mc);
    const garrison = state.units[mc.units[0]];
    expect(garrison.type).toBe('warrior');
    expect(mc.lastEraUpgrade).toBe(2);
  });

  it('grants no free population when local pressure era advances', () => {
    const state = createNewGame(undefined, 'mc-era-pop', 'small');
    state.era = 2;
    const mcId = Object.keys(state.minorCivs)[0];
    if (!mcId) return;
    const mc = state.minorCivs[mcId];
    mc.lastEraUpgrade = 1;
    setNearbyPressureEra(state, mcId, 2);
    const popBefore = state.cities[mc.cityId].population;

    processMinorCivEraUpgrade(state, mc);
    expect(state.cities[mc.cityId].population).toBe(popBefore);
  });

  it('does not rewrite the garrison even after many eras of world progression', () => {
    const state = createNewGame(undefined, 'mc-era-twelve', 'small');
    state.era = 12;
    const mcId = Object.keys(state.minorCivs)[0]!;
    const mc = state.minorCivs[mcId];
    mc.lastEraUpgrade = 4;
    setNearbyPressureEra(state, mcId, 12);

    processMinorCivEraUpgrade(state, mc);

    expect(state.units[mc.units[0]].type).toBe('warrior');
    expect(mc.lastEraUpgrade).toBe(12);
  });

  it('does not advance lastEraUpgrade beyond the nearby civilization pressure era', () => {
    const state = createNewGame(undefined, 'mc-local-era-cap', 'small');
    state.era = 12;
    const mcId = Object.keys(state.minorCivs)[0]!;
    const mc = state.minorCivs[mcId];
    mc.lastEraUpgrade = 1;

    processMinorCivEraUpgrade(state, mc);

    expect(state.units[mc.units[0]].type).toBe('warrior');
    expect(mc.lastEraUpgrade).toBe(1);
  });

  it('does not rewrite a production-backed unit the economy just trained', () => {
    const state = createNewGame(undefined, 'mc-era-no-duplicate-upgrade', 'small');
    state.era = 2;
    const mcId = Object.keys(state.minorCivs)[0]!;
    const mc = state.minorCivs[mcId];
    const trainedUnit = createUnit('swordsman', mcId, state.cities[mc.cityId].position, state.idCounters);
    state.units[trainedUnit.id] = trainedUnit;
    mc.units = [...mc.units, trainedUnit.id];
    mc.lastEraUpgrade = 1;
    setNearbyPressureEra(state, mcId, 2);

    processMinorCivEraUpgrade(state, mc);

    expect(state.units[trainedUnit.id].type).toBe('swordsman');
    expect(state.units[mc.units[0]].type).toBe('warrior');
  });

  it('does not batch-rewrite multiple existing units at once', () => {
    const state = createNewGame(undefined, 'mc-era-no-batch-rewrite', 'small');
    state.era = 2;
    const mcId = Object.keys(state.minorCivs)[0]!;
    const mc = state.minorCivs[mcId];
    const city = state.cities[mc.cityId];
    const second = createUnit('scout', mcId, city.position, state.idCounters);
    state.units[second.id] = second;
    mc.units = [...mc.units, second.id];
    const typesBefore = mc.units.map(id => state.units[id].type);
    mc.lastEraUpgrade = 1;
    setNearbyPressureEra(state, mcId, 2);

    processMinorCivEraUpgrade(state, mc);

    const typesAfter = mc.units.map(id => state.units[id].type);
    expect(typesAfter).toEqual(typesBefore);
  });
});

describe('conquest mechanics', () => {
  // #999: every real caller of conquestMinorCiv (AI, both player UI paths) independently
  // verifies war status BEFORE calling it -- `conquestMinorCiv` itself has never checked this.
  // That is caller-discipline-only enforcement of a canonical rule, the exact shape #843/#845/
  // #965/#970 already showed is fragile for movement. This pins the executor itself refusing,
  // so a future caller cannot reintroduce the bypass by forgetting the check.
  it('refuses to conquer a minor civ the conqueror is not at war with', () => {
    const state = createNewGame(undefined, 'mc-conquer-no-war', 'small');
    const mcId = Object.keys(state.minorCivs)[0];
    if (!mcId) return;
    expect(state.civilizations.player.diplomacy.atWarWith).not.toContain(mcId);

    const result = conquestMinorCiv(state, mcId, 'player');

    expect(result.conquered).toBe(false);
    expect(result.state.minorCivs[mcId].isDestroyed).toBe(false);
    expect(result.state.cities[state.minorCivs[mcId].cityId].owner).toBe(mcId);
  });

  it('marks minor civ as destroyed on conquest', () => {
    const state = createNewGame(undefined, 'mc-conquer', 'small');
    const mcId = Object.keys(state.minorCivs)[0];
    if (!mcId) return;
    state.civilizations.player.diplomacy.atWarWith = [mcId];

    const result = conquestMinorCiv(state, mcId, 'player');
    expect(result.state.minorCivs[mcId].isDestroyed).toBe(true);
    expect(state.minorCivs[mcId].isDestroyed).toBe(false);
  });

  it('transfers city to conqueror', () => {
    const state = createNewGame(undefined, 'mc-transfer', 'small');
    const mcId = Object.keys(state.minorCivs)[0];
    if (!mcId) return;
    const mc = state.minorCivs[mcId];
    state.civilizations.player.diplomacy.atWarWith = [mcId];

    const result = conquestMinorCiv(state, mcId, 'player');
    expect(result.state.cities[mc.cityId].owner).toBe('player');
    expect(result.state.civilizations.player.cities).toContain(mc.cityId);
  });

  it('ends the destroyed city-state’s wars for every opponent', () => {
    const state = createNewGame(undefined, 'mc-conquest-wars', 'small');
    const [mcId, otherMinorId] = Object.keys(state.minorCivs);
    state.civilizations.player.diplomacy.atWarWith = [mcId, otherMinorId];
    state.civilizations['ai-1'].diplomacy.atWarWith = [mcId];
    state.minorCivs[mcId].diplomacy.atWarWith = ['player', 'ai-1'];
    state.minorCivs[otherMinorId].diplomacy.atWarWith = ['player'];

    const result = conquestMinorCiv(state, mcId, 'player');

    expect(result.conquered).toBe(true);
    expect(result.state.civilizations.player.diplomacy.atWarWith).toEqual([otherMinorId]);
    expect(result.state.civilizations['ai-1'].diplomacy.atWarWith).toEqual([]);
    expect(result.state.minorCivs[mcId].diplomacy.atWarWith).toEqual([]);
    expect(result.state.minorCivs[otherMinorId].diplomacy.atWarWith).toEqual(['player']);
    expect(state.civilizations['ai-1'].diplomacy.atWarWith).toEqual([mcId]);
  });

  it('clears stale wars with city-states destroyed in older saves', () => {
    const state = createNewGame(undefined, 'mc-destroyed-war', 'small');
    const mc = Object.values(state.minorCivs)[0];
    mc.isDestroyed = true;
    mc.diplomacy.atWarWith = ['player'];
    state.civilizations.player.diplomacy.atWarWith = [mc.id];

    const next = processMinorCivTurn(state, bus);

    expect(next.civilizations.player.diplomacy.atWarWith).not.toContain(mc.id);
    expect(next.minorCivs[mc.id].diplomacy.atWarWith).toEqual([]);
  });

  it('records local regional grievance instead of penalizing every minor civ', () => {
    const state = createNewGame(undefined, 'mc-regional-grievance', 'medium');
    state.era = 2;
    const mcIds = Object.keys(state.minorCivs);
    const conquered = state.minorCivs[mcIds[0]];
    const nearby = state.minorCivs[mcIds[1]];
    const distant = state.minorCivs[mcIds[2]];
    state.cities[nearby.cityId].position = { ...state.cities[conquered.cityId].position, q: state.cities[conquered.cityId].position.q + 11 };
    state.cities[distant.cityId].position = { ...state.cities[conquered.cityId].position, q: state.cities[conquered.cityId].position.q + 20 };
    state.civilizations.player.diplomacy.atWarWith = [conquered.id];

    const result = conquestMinorCiv(state, conquered.id, 'player');

    expect(result.state.minorCivs[nearby.id].regionalGrievanceByCiv?.player).toMatchObject({
      targetCivId: 'player',
      pressure: expect.any(Number),
      status: expect.stringMatching(/wary|mobilizing|coalition-talks/),
    });
    expect(result.state.minorCivs[nearby.id].diplomacy.relationships.player).toBeLessThan(0);
    expect(result.state.minorCivs[distant.id].regionalGrievanceByCiv?.player).toBeUndefined();
    expect(result.state.minorCivs[distant.id].diplomacy.relationships.player).toBe(0);
  });

  it('keeps Era 1 city-states wary without creating a formal coalition', () => {
    const state = createNewGame(undefined, 'mc-era-one-grievance', 'medium');
    state.era = 1;
    const mcIds = Object.keys(state.minorCivs);
    const conquered = state.minorCivs[mcIds[0]];
    const nearby = state.minorCivs[mcIds[1]];
    state.cities[nearby.cityId].position = { ...state.cities[conquered.cityId].position, q: state.cities[conquered.cityId].position.q + 11 };
    state.civilizations.player.diplomacy.atWarWith = [conquered.id];

    const result = conquestMinorCiv(state, conquered.id, 'player');

    expect(result.state.minorCivs[nearby.id].regionalGrievanceByCiv?.player?.status).toBe('wary');
    expect(result.state.minorCivCoalitions).toEqual({});
  });

  it('records regional grievance for AI conquest through the shared helper', () => {
    const state = createNewGame(undefined, 'mc-ai-regional-grievance', 'medium');
    state.era = 2;
    const aiId = Object.keys(state.civilizations).find(civId => civId.startsWith('ai-'))!;
    const mcIds = Object.keys(state.minorCivs);
    const conquered = state.minorCivs[mcIds[0]];
    const nearby = state.minorCivs[mcIds[1]];
    state.cities[nearby.cityId].position = { ...state.cities[conquered.cityId].position, q: state.cities[conquered.cityId].position.q + 11 };
    state.civilizations[aiId].diplomacy.atWarWith = [conquered.id];

    const result = conquestMinorCiv(state, conquered.id, aiId);

    expect(result.state.minorCivs[nearby.id].regionalGrievanceByCiv?.[aiId]?.pressure).toBeGreaterThan(0);
    expect(result.state.minorCivs[nearby.id].diplomacy.relationships[aiId]).toBeLessThan(0);
  });
});

describe('#593 MR6 — peacefullyAbsorbMinorCiv', () => {
  it('marks the minor civ destroyed, transfers the city, and TRANSFERS (does not delete) garrison units', () => {
    const state = createNewGame(undefined, 'mc-peaceful-absorb', 'small');
    const mcId = Object.keys(state.minorCivs)[0];
    if (!mcId) return;
    const mc = state.minorCivs[mcId];
    const garrisonUnitIds = [...mc.units];
    expect(garrisonUnitIds.length).toBeGreaterThan(0);

    const result = peacefullyAbsorbMinorCiv(state, mcId, 'player');

    expect(result.absorbed).toBe(true);
    expect(result.state.minorCivs[mcId].isDestroyed).toBe(true);
    expect(result.state.cities[mc.cityId].owner).toBe('player');
    expect(result.state.civilizations.player.cities).toContain(mc.cityId);
    for (const unitId of garrisonUnitIds) {
      expect(result.state.units[unitId]).toBeDefined();
      expect(result.state.units[unitId].owner).toBe('player');
      expect(result.state.civilizations.player.units).toContain(unitId);
    }
    // Original state is untouched (immutable turn processing).
    expect(state.minorCivs[mcId].isDestroyed).toBe(false);
  });

  it('gives a transferred mounted garrison unit the new owner\'s movement bonus', () => {
    const state = createNewGame(undefined, 'mc-peaceful-absorb-bonus', 'small');
    const mcId = Object.keys(state.minorCivs)[0]!;
    state.civilizations.player.civType = 'mongolia';
    const horseman = createUnit('horseman', mcId, state.cities[state.minorCivs[mcId].cityId].position, state.idCounters);
    state.units[horseman.id] = horseman;
    state.minorCivs[mcId].units.push(horseman.id);

    const result = peacefullyAbsorbMinorCiv(state, mcId, 'player');

    expect(result.state.units[horseman.id]).toMatchObject({ owner: 'player', movementBonus: 1 });
  });

  it('reports an alliance-broken transition for any allied major civ', () => {
    const state = createNewGame(undefined, 'mc-peaceful-absorb-alliance', 'small');
    const mcId = Object.keys(state.minorCivs)[0];
    if (!mcId) return;
    state.minorCivs[mcId].chainStatusByCiv = {
      player: { status: 'allied', chainId: 'chain-1' } as any,
    };

    const result = peacefullyAbsorbMinorCiv(state, mcId, 'player');

    expect(result.transitions).toContainEqual({ type: 'alliance-broken', majorCivId: 'player', minorCivId: mcId, chainId: 'chain-1' });
  });

  it('does NOT apply a regional grievance to nearby minor civs (peaceful, not a conquest)', () => {
    const state = createNewGame(undefined, 'mc-peaceful-absorb-no-grievance', 'medium');
    state.era = 2;
    const mcIds = Object.keys(state.minorCivs);
    const absorbed = state.minorCivs[mcIds[0]];
    const nearby = state.minorCivs[mcIds[1]];
    state.cities[nearby.cityId].position = { ...state.cities[absorbed.cityId].position, q: state.cities[absorbed.cityId].position.q + 11 };

    const result = peacefullyAbsorbMinorCiv(state, absorbed.id, 'player');

    expect(result.state.minorCivs[nearby.id].regionalGrievanceByCiv?.player).toBeUndefined();
    expect(result.state.minorCivs[nearby.id].diplomacy.relationships.player).toBe(0);
  });

  it('is a no-op for an already-destroyed minor civ', () => {
    const state = createNewGame(undefined, 'mc-peaceful-absorb-destroyed', 'small');
    const mcId = Object.keys(state.minorCivs)[0];
    if (!mcId) return;
    state.minorCivs[mcId].isDestroyed = true;

    const result = peacefullyAbsorbMinorCiv(state, mcId, 'player');

    expect(result.absorbed).toBe(false);
    expect(result.state).toBe(state);
  });
});

describe('emergency levy (#951)', () => {
  it('never spawns a defender from regional grievance processing alone, even under severe pressure', () => {
    const state = createNewGame(undefined, 'mc-grievance-never-spawns', 'small');
    state.era = 4;
    const mcId = Object.keys(state.minorCivs)[0]!;
    const mc = state.minorCivs[mcId];
    setTargetCivEra(state, 4);
    state.cities[mc.cityId].population = 4;
    mc.regionalGrievanceByCiv = {
      player: {
        targetCivId: 'player',
        pressure: 95,
        status: 'coalition-talks',
        lastUpdatedTurn: state.turn,
        causes: [],
      },
    };
    const beforeUnitCount = mc.units.length;
    const beforePopulation = state.cities[mc.cityId].population;

    const result = processMinorCivRegionalGrievanceTurn(state, mcId);

    expect(result.minorCivs[mcId].units).toHaveLength(beforeUnitCount);
    expect(result.cities[mc.cityId].population).toBe(beforePopulation);
  });

  it('levies a weak defender through the live turn path under severe pressure', () => {
    const state = createNewGame(undefined, 'mc-levy-live', 'small');
    state.era = 4;
    const mcId = Object.keys(state.minorCivs)[0]!;
    const mc = state.minorCivs[mcId];
    setTargetCivEra(state, 4);
    const city = state.cities[mc.cityId];
    city.population = 3;
    mc.regionalGrievanceByCiv = {
      player: {
        targetCivId: 'player',
        pressure: 85,
        status: 'coalition-talks',
        lastUpdatedTurn: state.turn,
        causes: [],
      },
    };
    const beforeUnitIds = new Set(mc.units);

    const result = processMinorCivTurn(state, bus);
    const current = result.minorCivs[mcId];
    const newUnitId = current.units.find(unitId => !beforeUnitIds.has(unitId));

    expect(result.cities[mc.cityId].population).toBe(2);
    expect(newUnitId).toBeDefined();
    const newUnit = result.units[newUnitId!];
    expect(newUnit.owner).toBe(mcId);
    expect(newUnit.health).toBe(65);
    expect(newUnit.hasActed).toBe(true);
    expect(newUnit.hasMoved).toBe(true);
    expect(UNIT_DEFINITIONS[newUnit.type].domain ?? 'land').toBe('land');
    expect(current.economy?.levyCooldownUntilTurn).toBeGreaterThan(state.turn);
    expect(current.economy?.localRecoveryUntilTurn).toBeGreaterThan(state.turn);
  });

  it('does not levy from city-states at or below the population floor', () => {
    const state = createNewGame(undefined, 'mc-levy-pop-floor', 'small');
    state.era = 3;
    const mcId = Object.keys(state.minorCivs)[0]!;
    const mc = state.minorCivs[mcId];
    setTargetCivEra(state, 3);
    state.cities[mc.cityId].population = 2;
    mc.regionalGrievanceByCiv = {
      player: {
        targetCivId: 'player',
        pressure: 85,
        status: 'coalition-talks',
        lastUpdatedTurn: state.turn,
        causes: [],
      },
    };

    const result = processMinorCivTurn(state, bus);

    expect(result.cities[mc.cityId].population).toBe(2);
    expect(result.minorCivs[mcId].units).toHaveLength(mc.units.length);
    expect(result.minorCivs[mcId].economy?.levyCooldownUntilTurn).toBeUndefined();
  });

  it('does not levy against a merely nearby peaceful unit (early-game safety)', () => {
    const state = createNewGame(undefined, 'mc-levy-peaceful-nearby', 'small');
    const mcId = Object.keys(state.minorCivs)[0]!;
    const mc = state.minorCivs[mcId];
    const city = state.cities[mc.cityId];
    const peaceful = state.units[state.civilizations.player.units[0]];
    peaceful.position = { q: city.position.q + 1, r: city.position.r };
    const beforePopulation = city.population;
    const beforeUnitCount = mc.units.length;

    const result = processMinorCivTurn(state, bus);

    expect(result.cities[mc.cityId].population).toBe(beforePopulation);
    expect(result.minorCivs[mcId].units).toHaveLength(beforeUnitCount);
    expect(result.minorCivs[mcId].economy?.levyCooldownUntilTurn).toBeUndefined();
  });

  it('does not levy a second time before the cooldown elapses', () => {
    const state = createNewGame(undefined, 'mc-levy-cooldown', 'small');
    state.era = 4;
    const mcId = Object.keys(state.minorCivs)[0]!;
    const mc = state.minorCivs[mcId];
    setTargetCivEra(state, 4);
    state.cities[mc.cityId].population = 4;
    mc.regionalGrievanceByCiv = {
      player: {
        targetCivId: 'player',
        pressure: 85,
        status: 'coalition-talks',
        lastUpdatedTurn: state.turn,
        causes: [],
      },
    };

    const afterFirstLevy = processMinorCivTurn(state, bus);
    const populationAfterFirstLevy = afterFirstLevy.cities[mc.cityId].population;
    expect(populationAfterFirstLevy).toBe(3);

    const afterSecondTurn = processMinorCivTurn(afterFirstLevy, bus);

    expect(afterSecondTurn.cities[mc.cityId].population).toBe(populationAfterFirstLevy);
  });

  it('does not levy once the city-state already fields enough standing force', () => {
    const state = createNewGame(undefined, 'mc-levy-sufficient-force', 'small');
    state.era = 4;
    const mcId = Object.keys(state.minorCivs)[0]!;
    const mc = state.minorCivs[mcId];
    setTargetCivEra(state, 4);
    const city = state.cities[mc.cityId];
    city.population = 4;
    const extraGarrison = createUnit('warrior', mcId, city.position, mkC());
    extraGarrison.id = 'extra-garrison';
    state.units[extraGarrison.id] = extraGarrison;
    mc.units = [...mc.units, extraGarrison.id];
    mc.regionalGrievanceByCiv = {
      player: {
        targetCivId: 'player',
        pressure: 85,
        status: 'coalition-talks',
        lastUpdatedTurn: state.turn,
        causes: [],
      },
    };
    const beforeUnitCount = mc.units.length;

    const result = processMinorCivTurn(state, bus);

    expect(result.cities[mc.cityId].population).toBe(4);
    expect(result.minorCivs[mcId].units).toHaveLength(beforeUnitCount);
  });

  it('lets regional pressure heal over time after the decay block expires', () => {
    const state = createNewGame(undefined, 'mc-pressure-decay', 'small');
    state.era = 2;
    state.turn = 20;
    const mcId = Object.keys(state.minorCivs)[0]!;
    setTargetCivEra(state, 2);
    state.minorCivs[mcId].regionalGrievanceByCiv = {
      player: {
        targetCivId: 'player',
        pressure: 44,
        status: 'mobilizing',
        lastUpdatedTurn: 18,
        decayBlockedUntilTurn: 19,
        causes: [],
      } as any,
    };

    const result = processMinorCivTurn(state, bus);

    expect(result.minorCivs[mcId].regionalGrievanceByCiv?.player.pressure).toBe(42);
    expect(result.minorCivs[mcId].regionalGrievanceByCiv?.player.status).toBe('wary');
  });

  it('does not decay pressure during the post-aggression lockout', () => {
    const state = createNewGame(undefined, 'mc-pressure-lockout', 'small');
    state.era = 2;
    state.turn = 20;
    const mcId = Object.keys(state.minorCivs)[0]!;
    setTargetCivEra(state, 2);
    state.minorCivs[mcId].regionalGrievanceByCiv = {
      player: {
        targetCivId: 'player',
        pressure: 44,
        status: 'mobilizing',
        lastUpdatedTurn: 18,
        decayBlockedUntilTurn: 22,
        causes: [],
      } as any,
    };

    const result = processMinorCivTurn(state, bus);

    expect(result.minorCivs[mcId].regionalGrievanceByCiv?.player.pressure).toBe(44);
    expect(result.minorCivs[mcId].regionalGrievanceByCiv?.player.status).toBe('wary');
  });

  it('starts coalition talks without declaring war immediately', () => {
    const state = createNewGame(undefined, 'mc-coalition-talks', 'medium');
    state.era = 2;
    const [a, b] = Object.keys(state.minorCivs);
    setTargetCivEra(state, 2);
    for (const id of [a, b]) {
      state.cities[state.minorCivs[id].cityId].population = 3;
      state.minorCivs[id].regionalGrievanceByCiv = {
        player: {
          targetCivId: 'player',
          pressure: 75,
          status: 'coalition-talks',
          lastUpdatedTurn: state.turn,
          decayBlockedUntilTurn: state.turn + 5,
          causes: [],
        } as any,
      };
    }

    const result = processMinorCivTurn(state, bus);
    const coalition = Object.values(result.minorCivCoalitions ?? {})[0];

    // memberIds is always alphabetically sorted (minor-civ-coalition-system.ts),
    // independent of state.minorCivs' insertion order -- assert against that
    // sorted order rather than [a, b]'s incidental placement order.
    expect(coalition).toMatchObject({ targetCivId: 'player', memberIds: [a, b].sort(), status: 'forming' });
    expect(result.civilizations.player.diplomacy.atWarWith).not.toContain(a);
    expect(result.civilizations.player.diplomacy.atWarWith).not.toContain(b);
  });

  it('declares coalition war after the talks countdown through both diplomacy records', () => {
    const state = createNewGame(undefined, 'mc-coalition-war', 'medium');
    state.era = 2;
    state.turn = 10;
    const [a, b] = Object.keys(state.minorCivs);
    for (const id of [a, b]) {
      state.cities[state.minorCivs[id].cityId].population = 3;
      state.minorCivs[id].regionalGrievanceByCiv = {
        player: {
          targetCivId: 'player',
          pressure: 75,
          status: 'coalition-talks',
          lastUpdatedTurn: state.turn - 4,
          decayBlockedUntilTurn: state.turn + 1,
          causes: [],
        } as any,
      };
    }
    state.minorCivCoalitions = {
      'coalition-player-6': {
        id: 'coalition-player-6',
        targetCivId: 'player',
        memberIds: [a, b],
        status: 'forming',
        createdTurn: 6,
        updatedTurn: 6,
        cooldownUntilTurn: 10,
      },
    };

    const result = processMinorCivTurn(state, bus);

    expect(result.minorCivCoalitions?.['coalition-player-6'].status).toBe('active');
    expect(result.civilizations.player.diplomacy.atWarWith).toEqual(expect.arrayContaining([a, b]));
    expect(result.minorCivs[a].diplomacy.atWarWith).toContain('player');
    expect(result.minorCivs[b].diplomacy.atWarWith).toContain('player');
  });

  it('requires regional maturity before coalition talks can start', () => {
    const state = createNewGame(undefined, 'mc-coalition-immature', 'medium');
    state.era = 2;
    const [a, b] = Object.keys(state.minorCivs);
    for (const id of [a, b]) {
      state.cities[state.minorCivs[id].cityId].population = 2;
      for (const unitId of state.minorCivs[id].units) delete state.units[unitId];
      state.minorCivs[id].units = [];
      state.minorCivs[id].garrisonCooldown = 5;
      state.minorCivs[id].regionalGrievanceByCiv = {
        player: {
          targetCivId: 'player',
          pressure: 75,
          status: 'coalition-talks',
          lastUpdatedTurn: state.turn,
          decayBlockedUntilTurn: state.turn + 5,
          causes: [],
        } as any,
      };
    }

    const result = processMinorCivTurn(state, bus);

    expect(result.minorCivCoalitions).toEqual({});
  });
});

describe('guerrilla behavior', () => {
  it('spawns guerrilla units when at war (max 2)', () => {
    let state = createNewGame(undefined, 'mc-guerrilla', 'small');
    const mcId = Object.keys(state.minorCivs)[0];
    if (!mcId) return;
    const mc = state.minorCivs[mcId];
    mc.diplomacy.atWarWith.push('player');

    state = processGuerrilla(state, mc, bus);
    expect(mc.units.length).toBeLessThanOrEqual(3);
  });

  it('does not spawn guerrilla when not at war', () => {
    let state = createNewGame(undefined, 'mc-no-guerrilla', 'small');
    const mcId = Object.keys(state.minorCivs)[0];
    if (!mcId) return;
    const mc = state.minorCivs[mcId];
    const unitsBefore = mc.units.length;

    state = processGuerrilla(state, mc, bus);
    expect(mc.units.length).toBe(unitsBefore);
  });
});

describe('scuffles between minor civs', () => {
  it('does not crash on scuffle processing', () => {
    const state = createNewGame(undefined, 'mc-scuffle', 'medium');
    processScuffles(state, bus);
    expect(state).toBeDefined();
  });

  it('does not resolve scuffle combat when minor-civ melee units are not adjacent', () => {
    const state = createNewGame(undefined, 'mc-scuffle-range', 'small');
    // #982: the trigger roll is now gameId-rooted, so a turn that clears the
    // 10% threshold for one fixture's gameId is not guaranteed to for
    // another's -- unlike the old turn-only formula, which was gameId-blind
    // and let every fixture in this file share turn 13. Without a turn that
    // actually clears the gate, this test would pass vacuously (0 scuffles
    // because the roll failed, never reaching the adjacency check its name
    // claims to cover). Turn 15 is the first hit for this fixture's own
    // 'mc-scuffle-range' gameId.
    state.turn = 15;
    state.minorCivs = {
      'mc-sparta': {
        id: 'mc-sparta',
        definitionId: 'sparta',
        cityId: 'city-sparta',
        units: ['sparta-warrior'],
        diplomacy: {} as any,
        activeQuests: {},
        chainStatusByCiv: {},
        questCooldownUntilByCiv: {},
        lastNotifiedStatusByCiv: {},
        isDestroyed: false,
        garrisonCooldown: 0,
        lastEraUpgrade: 1,
      },
      'mc-carthage': {
        id: 'mc-carthage',
        definitionId: 'carthage',
        cityId: 'city-carthage',
        units: ['carthage-warrior'],
        diplomacy: {} as any,
        activeQuests: {},
        chainStatusByCiv: {},
        questCooldownUntilByCiv: {},
        lastNotifiedStatusByCiv: {},
        isDestroyed: false,
        garrisonCooldown: 0,
        lastEraUpgrade: 1,
      },
    };
    state.cities = {
      'city-sparta': { id: 'city-sparta', name: 'Sparta', owner: 'mc-sparta', position: { q: 0, r: 0 }, population: 3, buildings: [], productionQueue: [], productionProgress: 0, food: 0, foodNeeded: 10, ownedTiles: [], workedTiles: [], focus: 'balanced', maturity: 'outpost',  unrestLevel: 0, unrestTurns: 0, spyUnrestBonus: 0 },
      'city-carthage': { id: 'city-carthage', name: 'Carthage', owner: 'mc-carthage', position: { q: 1, r: 0 }, population: 3, buildings: [], productionQueue: [], productionProgress: 0, food: 0, foodNeeded: 10, ownedTiles: [], workedTiles: [], focus: 'balanced', maturity: 'outpost',  unrestLevel: 0, unrestTurns: 0, spyUnrestBonus: 0 },
    };
    const attacker = createUnit('warrior', 'mc-sparta', { q: 0, r: 0 }, mkC());
    attacker.id = 'sparta-warrior';
    const defender = createUnit('warrior', 'mc-carthage', { q: 2, r: 0 }, mkC());
    defender.id = 'carthage-warrior';
    state.units = { [attacker.id]: attacker, [defender.id]: defender };
    const scuffles: unknown[] = [];
    const localBus = new EventBus();
    localBus.on('minor-civ:scuffle', payload => scuffles.push(payload));

    processScuffles(state, localBus);

    expect(scuffles).toHaveLength(0);
    expect(state.units['sparta-warrior'].health).toBe(100);
    expect(state.units['carthage-warrior'].health).toBe(100);
  });

  it('resolves scuffle combat between cities that are only far apart by raw distance, adjacent across the wrap seam (issue #520)', () => {
    const state = createNewGame(undefined, 'mc-scuffle-wrap', 'small');
    state.map.wrapsHorizontally = true;
    const width = state.map.width;
    // #982: minor-civ-scuffle-trigger's roll is now gameId-rooted (was
    // `turn*16807 + mc.id.charCodeAt(3)`, ignoring gameId entirely -- which is
    // why turn 13 previously worked for every gameId used in this file's
    // fixtures). Turn 18 is the first turn where mc-sparta's roll clears the
    // 10% trigger threshold for this fixture's own 'mc-scuffle-wrap' gameId.
    state.turn = 18;
    state.minorCivs = {
      'mc-sparta': {
        id: 'mc-sparta',
        definitionId: 'sparta',
        cityId: 'city-sparta',
        units: ['sparta-warrior'],
        diplomacy: {} as any,
        activeQuests: {},
        chainStatusByCiv: {},
        questCooldownUntilByCiv: {},
        lastNotifiedStatusByCiv: {},
        isDestroyed: false,
        garrisonCooldown: 0,
        lastEraUpgrade: 1,
      },
      'mc-carthage': {
        id: 'mc-carthage',
        definitionId: 'carthage',
        cityId: 'city-carthage',
        units: ['carthage-warrior'],
        diplomacy: {} as any,
        activeQuests: {},
        chainStatusByCiv: {},
        questCooldownUntilByCiv: {},
        lastNotifiedStatusByCiv: {},
        isDestroyed: false,
        garrisonCooldown: 0,
        lastEraUpgrade: 1,
      },
    };
    state.cities = {
      'city-sparta': { id: 'city-sparta', name: 'Sparta', owner: 'mc-sparta', position: { q: 0, r: 0 }, population: 3, buildings: [], productionQueue: [], productionProgress: 0, food: 0, foodNeeded: 10, ownedTiles: [], workedTiles: [], focus: 'balanced', maturity: 'outpost', unrestLevel: 0, unrestTurns: 0, spyUnrestBonus: 0 },
      'city-carthage': { id: 'city-carthage', name: 'Carthage', owner: 'mc-carthage', position: { q: width - 1, r: 0 }, population: 3, buildings: [], productionQueue: [], productionProgress: 0, food: 0, foodNeeded: 10, ownedTiles: [], workedTiles: [], focus: 'balanced', maturity: 'outpost', unrestLevel: 0, unrestTurns: 0, spyUnrestBonus: 0 },
    };
    const attacker = createUnit('warrior', 'mc-sparta', { q: 0, r: 0 }, mkC());
    attacker.id = 'sparta-warrior';
    const defender = createUnit('warrior', 'mc-carthage', { q: width - 1, r: 0 }, mkC());
    defender.id = 'carthage-warrior';
    state.units = { [attacker.id]: attacker, [defender.id]: defender };
    const scuffles: unknown[] = [];
    const localBus = new EventBus();
    localBus.on('minor-civ:scuffle', payload => scuffles.push(payload));

    processScuffles(state, localBus);

    expect(scuffles).toHaveLength(1);
  });
});

describe('diplomatic agency', () => {
  it('improves relationship when nearby barbarian camp destroyed', () => {
    const state = createNewGame(undefined, 'mc-diplo-react', 'small');
    const mcId = Object.keys(state.minorCivs)[0];
    if (!mcId) return;
    const mc = state.minorCivs[mcId];
    const relBefore = mc.diplomacy.relationships.player ?? 0;

    applyDiplomaticReaction(state, 'camp_destroyed_nearby', 'player', mcId);
    expect(mc.diplomacy.relationships.player).toBe(relBefore + 10);
  });

  it('militaristic minor civ respects strength on attacked_neighbor', () => {
    const state = createNewGame(undefined, 'mc-diplo-mil', 'medium');

    const milEntry = Object.entries(state.minorCivs).find(([, mc]) => {
      const def = MINOR_CIV_DEFINITIONS.find(d => d.id === mc.definitionId);
      return def?.archetype === 'militaristic';
    });
    if (!milEntry) return;
    const [milMcId, milMc] = milEntry;
    const relBefore = milMc.diplomacy.relationships.player ?? 0;

    applyDiplomaticReaction(state, 'attacked_neighbor', 'player', milMcId);
    expect(milMc.diplomacy.relationships.player).toBe(relBefore + 5);
  });

  it('cultural minor civ condemns attacked_neighbor', () => {
    const state = createNewGame(undefined, 'mc-diplo-cult', 'medium');

    const cultEntry = Object.entries(state.minorCivs).find(([, mc]) => {
      const def = MINOR_CIV_DEFINITIONS.find(d => d.id === mc.definitionId);
      return def?.archetype === 'cultural';
    });
    if (!cultEntry) return;
    const [cultMcId, cultMc] = cultEntry;
    const relBefore = cultMc.diplomacy.relationships.player ?? 0;

    applyDiplomaticReaction(state, 'attacked_neighbor', 'player', cultMcId);
    expect(cultMc.diplomacy.relationships.player).toBe(relBefore - 15);
  });
});
