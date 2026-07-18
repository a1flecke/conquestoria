import { describe, it, expect } from 'vitest';
import { placeMinorCivs, processMinorCivTurn, planPurposefulMinorCivTurn, checkEraAdvancement, processMinorCivEraUpgrade, conquestMinorCiv, processGuerrilla, processScuffles, applyDiplomaticReaction } from '@/systems/minor-civ-system';
import { createNewGame } from '@/core/game-state';
import { hexDistance, hexKey } from '@/systems/hex-utils';
import { EventBus } from '@/core/event-bus';
import { TECH_TREE, getEraAdvancementTechs } from '@/systems/tech-definitions';
import { MINOR_CIV_DEFINITIONS } from '@/systems/minor-civ-definitions';
import { createUnit, UNIT_DEFINITIONS } from '@/systems/unit-system';
import { processMinorCivRegionalGrievanceTurn } from '@/systems/minor-civ-coalition-system';

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

function setTargetCivEra(state: ReturnType<typeof createNewGame>, era: number): void {
  state.civilizations.player.techState.completed = Array.from({ length: era - 1 }, (_, index) => index + 2)
    .flatMap(candidate => getEraAdvancementTechs(candidate)
      .slice(0, Math.ceil(getEraAdvancementTechs(candidate).length * (candidate <= 3 ? 0.5 : candidate <= 8 ? 0.6 : 0.55)))
      .map(tech => tech.id));
}

describe('minor civ placement', () => {
  it('places correct number for small map', () => {
    const state = createNewGame(undefined, 'mc-place-test', 'small');
    const result = placeMinorCivs(state, 'small', 'mc-place-test');
    expect(Object.keys(result.minorCivs).length).toBeGreaterThanOrEqual(2);
    expect(Object.keys(result.minorCivs).length).toBeLessThanOrEqual(4);
  });

  it('places correct number for medium map', () => {
    const state = createNewGame(undefined, 'mc-place-med', 'medium');
    const result = placeMinorCivs(state, 'medium', 'mc-place-med');
    expect(Object.keys(result.minorCivs).length).toBeGreaterThanOrEqual(4);
    expect(Object.keys(result.minorCivs).length).toBeLessThanOrEqual(6);
  });

  it('respects distance from start positions', () => {
    const state = createNewGame(undefined, 'mc-dist-test', 'medium');
    const result = placeMinorCivs(state, 'medium', 'mc-dist-test');
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
    state.map.tiles[`${width - 1},5`].terrain = 'plains';

    const result = placeMinorCivs(state, 'small', 'mc-nonwrap-edge-seed');

    // The only passable candidate is at q=width-1, r=5 — raw distance from the
    // start at q=0 is width-1 (far), but the pre-fix code treated it as
    // wrapped-distance 1 (adjacent) regardless of wrapsHorizontally, rejecting
    // it and leaving 0 minor civs placed on a map that doesn't actually wrap.
    expect(Object.keys(result.minorCivs).length).toBeGreaterThan(0);
  });

  it('respects distance between minor civs', () => {
    const state = createNewGame(undefined, 'mc-inter-test', 'medium');
    const result = placeMinorCivs(state, 'medium', 'mc-inter-test');
    const mcCities = Object.values(result.minorCivs).map(mc => result.cities[mc.cityId]);
    for (let i = 0; i < mcCities.length; i++) {
      for (let j = i + 1; j < mcCities.length; j++) {
        expect(hexDistance(mcCities[i].position, mcCities[j].position)).toBeGreaterThanOrEqual(10);
      }
    }
  });

  it('creates city and garrison for each minor civ', () => {
    const state = createNewGame(undefined, 'mc-city-test', 'small');
    const result = placeMinorCivs(state, 'small', 'mc-city-test');
    for (const mc of Object.values(result.minorCivs)) {
      expect(result.cities[mc.cityId]).toBeDefined();
      expect(result.cities[mc.cityId].owner).toBe(`mc-${mc.definitionId}`);
      expect(result.cities[mc.cityId].population).toBe(3);
      expect(mc.units.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('keeps minor-civ city labels globally unique during placement', () => {
    const state = createNewGame(undefined, 'mc-unique-test', 'medium');
    const result = placeMinorCivs(state, 'medium', 'mc-unique-test');
    const names = Object.values(result.minorCivs).map(mc => result.cities[mc.cityId].name);

    expect(new Set(names).size).toBe(names.length);
  });

  it('does not place on impassable terrain', () => {
    const state = createNewGame(undefined, 'mc-terrain-test', 'small');
    const result = placeMinorCivs(state, 'small', 'mc-terrain-test');
    const impassable = ['ocean', 'coast', 'mountain'];
    for (const mc of Object.values(result.minorCivs)) {
      const city = result.cities[mc.cityId];
      const tile = state.map.tiles[hexKey(city.position)];
      expect(impassable).not.toContain(tile.terrain);
    }
  });

  it('initializes diplomacy with major civs only', () => {
    const state = createNewGame(undefined, 'mc-diplo-test', 'small');
    const result = placeMinorCivs(state, 'small', 'mc-diplo-test');
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

  it('does not spawn both economy defender and regional grievance defender in one minor-civ turn', () => {
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
        mobilizationProgress: 24,
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
  it('upgrades garrison from warrior to swordsman at era 2', () => {
    const state = createNewGame(undefined, 'mc-era-up', 'small');
    state.era = 2;
    const mcId = Object.keys(state.minorCivs)[0];
    if (!mcId) return;
    const mc = state.minorCivs[mcId];
    mc.lastEraUpgrade = 1;
    setNearbyPressureEra(state, mcId, 2);

    processMinorCivEraUpgrade(state, mc);
    const garrison = state.units[mc.units[0]];
    expect(garrison.type).toBe('swordsman');
    expect(mc.lastEraUpgrade).toBe(2);
  });

  it('adds population on era upgrade', () => {
    const state = createNewGame(undefined, 'mc-era-pop', 'small');
    state.era = 2;
    const mcId = Object.keys(state.minorCivs)[0];
    if (!mcId) return;
    const mc = state.minorCivs[mcId];
    mc.lastEraUpgrade = 1;
    setNearbyPressureEra(state, mcId, 2);
    const popBefore = state.cities[mc.cityId].population;

    processMinorCivEraUpgrade(state, mc);
    expect(state.cities[mc.cityId].population).toBe(popBefore + 1);
  });

  it('keeps the garrison modern at the current maximum era', () => {
    const state = createNewGame(undefined, 'mc-era-twelve', 'small');
    state.era = 12;
    const mcId = Object.keys(state.minorCivs)[0]!;
    const mc = state.minorCivs[mcId];
    mc.lastEraUpgrade = 4;
    setNearbyPressureEra(state, mcId, 12);

    processMinorCivEraUpgrade(state, mc);

    expect(state.units[mc.units[0]].type).toBe('tank');
    expect(mc.lastEraUpgrade).toBe(12);
  });

  it('does not upgrade a minor-civ garrison beyond the nearby civilization pressure era', () => {
    const state = createNewGame(undefined, 'mc-local-era-cap', 'small');
    state.era = 12;
    const mcId = Object.keys(state.minorCivs)[0]!;
    const mc = state.minorCivs[mcId];
    mc.lastEraUpgrade = 1;

    processMinorCivEraUpgrade(state, mc);

    expect(state.units[mc.units[0]].type).toBe('warrior');
    expect(mc.lastEraUpgrade).toBe(1);
  });
});

describe('conquest mechanics', () => {
  it('marks minor civ as destroyed on conquest', () => {
    const state = createNewGame(undefined, 'mc-conquer', 'small');
    const mcId = Object.keys(state.minorCivs)[0];
    if (!mcId) return;

    const result = conquestMinorCiv(state, mcId, 'player');
    expect(result.state.minorCivs[mcId].isDestroyed).toBe(true);
    expect(state.minorCivs[mcId].isDestroyed).toBe(false);
  });

  it('transfers city to conqueror', () => {
    const state = createNewGame(undefined, 'mc-transfer', 'small');
    const mcId = Object.keys(state.minorCivs)[0];
    if (!mcId) return;
    const mc = state.minorCivs[mcId];

    const result = conquestMinorCiv(state, mcId, 'player');
    expect(result.state.cities[mc.cityId].owner).toBe('player');
    expect(result.state.civilizations.player.cities).toContain(mc.cityId);
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

    const result = conquestMinorCiv(state, conquered.id, aiId);

    expect(result.state.minorCivs[nearby.id].regionalGrievanceByCiv?.[aiId]?.pressure).toBeGreaterThan(0);
    expect(result.state.minorCivs[nearby.id].diplomacy.relationships[aiId]).toBeLessThan(0);
  });
});

describe('regional grievance mobilization', () => {
  it('turns mobilization progress into a trained defender over time', () => {
    const state = createNewGame(undefined, 'mc-mobilize-defender', 'small');
    state.era = 2;
    const mcId = Object.keys(state.minorCivs)[0]!;
    setTargetCivEra(state, 2);
    const mc = state.minorCivs[mcId];
    mc.regionalGrievanceByCiv = {
      player: {
        targetCivId: 'player',
        pressure: 55,
        status: 'mobilizing',
        lastUpdatedTurn: state.turn,
        causes: [],
        mobilizationProgress: 16,
      } as any,
    };
    const beforeUnits = mc.units.length;

    const result = processMinorCivRegionalGrievanceTurn(state, mcId);
    const current = result.minorCivs[mcId];
    const newUnitId = current.units.find(unitId => !mc.units.includes(unitId));

    expect(current.units).toHaveLength(beforeUnits + 1);
    expect(newUnitId).toBeDefined();
    expect(result.units[newUnitId!].type).toBe('swordsman');
    expect(result.units[newUnitId!].position).not.toEqual(state.cities[mc.cityId].position);
    expect(current.regionalGrievanceByCiv?.player.mobilizationProgress).toBe(0);
  });

  it('uses difficulty to pace mobilization progress', () => {
    const explorer = createNewGame({
      civType: 'rome',
      mapSize: 'small',
      opponentCount: 1,
      gameTitle: 'Explorer Mobilization',
      opponentChallenge: 'explorer',
      seed: 'mc-mobilize-explorer',
    });
    const veteran = createNewGame({
      civType: 'rome',
      mapSize: 'small',
      opponentCount: 1,
      gameTitle: 'Veteran Mobilization',
      opponentChallenge: 'veteran',
      seed: 'mc-mobilize-veteran',
    });
    for (const state of [explorer, veteran]) {
      state.era = 2;
      setTargetCivEra(state, 2);
      const mc = Object.values(state.minorCivs)[0];
      mc.regionalGrievanceByCiv = {
        player: {
          targetCivId: 'player',
          pressure: 55,
          status: 'mobilizing',
          lastUpdatedTurn: state.turn,
          causes: [],
          mobilizationProgress: 0,
        } as any,
      };
    }

    const explorerResult = processMinorCivTurn(explorer, bus);
    const veteranResult = processMinorCivTurn(veteran, bus);
    const explorerMinor = Object.values(explorerResult.minorCivs)[0];
    const veteranMinor = Object.values(veteranResult.minorCivs)[0];

    expect(explorerMinor.regionalGrievanceByCiv?.player.mobilizationProgress).toBe(6);
    expect(veteranMinor.regionalGrievanceByCiv?.player.mobilizationProgress).toBe(10);
  });

  it('conscripts a weaker defender by spending population under severe pressure', () => {
    const state = createNewGame(undefined, 'mc-conscript-defender', 'small');
    state.era = 4;
    const mcId = Object.keys(state.minorCivs)[0]!;
    const mc = state.minorCivs[mcId];
    setTargetCivEra(state, 4);
    const city = state.cities[mc.cityId];
    city.population = 3;
    const garrison = state.units[mc.units[0]];
    const fallbackPosition = Object.values(state.map.tiles)
      .map(tile => tile.coord)
      .find(coord =>
        hexDistance(coord, city.position) > 2
        && !['ocean', 'coast', 'mountain'].includes(state.map.tiles[hexKey(coord)].terrain))!;
    garrison.position = fallbackPosition;
    mc.regionalGrievanceByCiv = {
      player: {
        targetCivId: 'player',
        pressure: 85,
        status: 'coalition-talks',
        lastUpdatedTurn: state.turn,
        causes: [],
        mobilizationProgress: 0,
      } as any,
    };

    const result = processMinorCivRegionalGrievanceTurn(state, mcId);
    const current = result.minorCivs[mcId];
    const newUnitId = current.units.find(unitId => !mc.units.includes(unitId));

    expect(result.cities[mc.cityId].population).toBe(2);
    expect(newUnitId).toBeDefined();
    expect(result.units[newUnitId!]).toMatchObject({ type: 'musketeer', health: 65 });
    expect(result.units[newUnitId!].position).toEqual(state.cities[mc.cityId].position);
    expect(current.regionalGrievanceByCiv?.player.conscriptCooldownUntilTurn).toBeGreaterThan(state.turn);
    expect(current.regionalGrievanceByCiv?.player.recoveryStrainedUntilTurn).toBeGreaterThan(state.turn);
  });

  it('does not conscript from city-states below the population floor', () => {
    const state = createNewGame(undefined, 'mc-conscript-pop-floor', 'small');
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
        mobilizationProgress: 0,
      } as any,
    };

    const result = processMinorCivTurn(state, bus);

    expect(result.cities[mc.cityId].population).toBe(2);
    expect(result.minorCivs[mcId].units).toHaveLength(mc.units.length);
    expect(result.minorCivs[mcId].regionalGrievanceByCiv?.player.conscriptCooldownUntilTurn).toBeUndefined();
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
        mobilizationProgress: 0,
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
        mobilizationProgress: 0,
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

    expect(coalition).toMatchObject({ targetCivId: 'player', memberIds: [a, b], status: 'forming' });
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
    state.turn = 13;
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
    state.turn = 13; // yields roll 6 (< 10) for mc-sparta, matching the existing roll-gated test above
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
