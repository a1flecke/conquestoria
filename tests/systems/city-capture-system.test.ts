import { describe, it, expect, vi } from 'vitest';
import { EventBus } from '@/core/event-bus';
import { createNewGame } from '@/core/game-state';
import type { CombatResult, GameEvents, GameState, GeneralCareerEvent } from '@/core/types';
import { hexKey } from '@/systems/hex-utils';
import { foundCity } from '@/systems/city-system';
import { resolveCombat } from '@/systems/combat-system';
import { applyCombatOutcomeToState } from '@/systems/combat-reward-system';
import { createUnit } from '@/systems/unit-system';
import { makeBreakawayFixture } from './helpers/breakaway-fixture';
import {
  beginMajorCityAssault,
  emitMajorCityCaptureEvents,
  recordCityCaptureCareerEvents,
  resolveMajorCityCapture,
  transferCapturedCityOwnership,
} from '@/systems/city-capture-system';

const mkC = () => ({ nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 });

describe('city-capture-system', () => {
  function makeExposedCityCaptureState({
    population,
    buildings,
  }: {
    population: number;
    buildings: string[];
  }): GameState {
    const state = createNewGame(undefined, 'capture-empty-city', 'small');
    state.civilizations.player.cities = [];
    state.civilizations['ai-1'].cities = [];
    state.civilizations.player.diplomacy.relationships['ai-1'] = 0;
    state.civilizations['ai-1'].diplomacy.relationships.player = 0;
    state.cities = {};

    state.cities.athens = {
      ...foundCity('ai-1', { q: 1, r: 0 }, state.map, mkC()),
      id: 'athens',
      name: 'Athens',
      owner: 'ai-1',
      position: { q: 1, r: 0 },
      population,
      buildings,
      ownedTiles: [{ q: 1, r: 0 }, { q: 1, r: 1 }],
    };
    state.civilizations['ai-1'].cities = ['athens'];
    state.map.tiles[hexKey({ q: 1, r: 0 })].owner = 'ai-1';
    state.map.tiles[hexKey({ q: 1, r: 1 })].owner = 'ai-1';

    return state;
  }

  function addLegendaryProject(state: GameState, ownerId: string, cityId: string, wonderId = 'oracle-of-delphi'): void {
    state.legendaryWonderProjects = {
      ...(state.legendaryWonderProjects ?? {}),
      [`${wonderId}:${ownerId}:${cityId}`]: {
        wonderId,
        ownerId,
        cityId,
        phase: 'questing',
        investedProduction: 12,
        transferableProduction: 0,
        questSteps: [],
      },
    };
  }

  function makeMajorAssaultState(): GameState {
    // population 1 (not 4): with the new intrinsic-strength mechanic (#522), a
    // swordsman (strength 25) needs a comfortable margin over intrinsic strength
    // (CITY_BASE_STRENGTH + population*CITY_STRENGTH_PER_POPULATION, city-siege-system.ts)
    // so this fixture's existing unconditional-success assertions stay reliable
    // regardless of the ±20% RNG factor. Tests that specifically exercise low-odds
    // outcomes construct their own city stats instead of using this shared fixture --
    // see the new describe block below.
    const state = makeExposedCityCaptureState({
      population: 1,
      buildings: [],
    });
    const attacker = createUnit(
      'swordsman',
      'player',
      { q: 0, r: 0 },
      state.idCounters,
    );
    attacker.id = 'attacker';
    attacker.movementPointsLeft = 2;
    state.units = { [attacker.id]: attacker };
    state.civilizations.player.units = [attacker.id];
    state.civilizations['ai-1'].units = [];
    state.civilizations.player.diplomacy.atWarWith = ['ai-1'];
    state.civilizations['ai-1'].diplomacy.atWarWith = ['player'];
    state.map.tiles['0,0'].terrain = 'grassland';
    state.map.tiles['1,0'].terrain = 'grassland';
    return state;
  }

  it('lets a human Mechanized Infantry capture and hold a major city through the shared path', () => {
    const state = makeMajorAssaultState();
    state.units.attacker = {
      ...createUnit('mechanized_infantry', 'player', { q: 0, r: 0 }, state.idCounters),
      id: 'attacker',
      movementPointsLeft: 3,
    };
    const before = structuredClone(state);
    const bus = new EventBus();
    const moved = vi.fn();
    bus.on('unit:move', moved);

    const result = beginMajorCityAssault(
      state,
      'attacker',
      'athens',
      { actor: 'player', civId: 'player', bus },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(state).toEqual(before);
    expect(result.state.units.attacker.position).toEqual({ q: 1, r: 0 });
    expect(result.state.units.attacker.movementPointsLeft).toBe(0);
    expect(result.pending.cityId).toBe('athens');
    expect(moved).toHaveBeenCalledOnce();

    const capture = resolveMajorCityCapture(
      result.state,
      'athens',
      'player',
      'occupy',
      result.state.turn,
    );
    expect(capture.state.cities.athens.owner).toBe('player');
    expect(capture.state.units.attacker.position).toEqual({ q: 1, r: 0 });
  });

  it('emits capture, territory, and elimination transitions from one shared helper', () => {
    const state = makeMajorAssaultState();
    const result = resolveMajorCityCapture(
      state,
      'athens',
      'player',
      'occupy',
      state.turn,
    );
    const bus = new EventBus();
    const captured = vi.fn();
    const flipped = vi.fn();
    const eliminated = vi.fn();
    bus.on('city:captured', captured);
    bus.on('territory:tile-flipped', flipped);
    bus.on('civ:eliminated', eliminated);

    emitMajorCityCaptureEvents(
      state,
      result,
      'athens',
      'player',
      'ai-1',
      bus,
    );

    expect(captured).toHaveBeenCalledOnce();
    expect(flipped).toHaveBeenCalled();
    expect(eliminated).toHaveBeenCalledWith({
      civId: 'ai-1',
      eliminatedBy: 'player',
    });
  });

  it('does not re-emit near-defeat when the former owner was already there', () => {
    const state = makeMajorAssaultState();
    const second = foundCity(
      'ai-1',
      { q: 4, r: 4 },
      state.map,
      state.idCounters,
    );
    second.id = 'sparta';
    state.cities[second.id] = second;
    state.civilizations['ai-1'].cities.push(second.id);
    state.civilizations['ai-1'].nearDefeat = true;
    const result = resolveMajorCityCapture(
      state,
      'athens',
      'player',
      'occupy',
      state.turn,
    );
    const bus = new EventBus();
    const nearDefeat = vi.fn();
    bus.on('civ:near-defeat', nearDefeat);

    emitMajorCityCaptureEvents(
      state,
      result,
      'athens',
      'player',
      'ai-1',
      bus,
    );

    expect(nearDefeat).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: 'peace',
      mutate: (state: GameState) => {
        state.civilizations.player.diplomacy.atWarWith = [];
        state.civilizations['ai-1'].diplomacy.atWarWith = [];
      },
      reason: 'not-at-war',
    },
    {
      name: 'exhausted movement',
      mutate: (state: GameState) => {
        state.units.attacker.movementPointsLeft = 0;
      },
      reason: 'illegal-movement',
    },
    {
      name: 'occupied destination',
      mutate: (state: GameState) => {
        const defender = createUnit(
          'warrior',
          'ai-1',
          { q: 1, r: 0 },
          state.idCounters,
        );
        defender.id = 'city-defender';
        state.units[defender.id] = defender;
        state.civilizations['ai-1'].units.push(defender.id);
      },
      reason: 'city-defended',
    },
    {
      name: 'impassable terrain',
      mutate: (state: GameState) => {
        state.map.tiles['1,0'].terrain = 'coast';
      },
      reason: 'illegal-movement',
    },
    {
      name: 'non-capturing siege unit',
      mutate: (state: GameState) => {
        state.units.attacker.type = 'catapult';
      },
      reason: 'cannot-capture',
    },
  ])('rejects a major-city assault during $name', ({ mutate, reason }) => {
    const state = makeMajorAssaultState();
    mutate(state);
    const before = structuredClone(state);

    const result = beginMajorCityAssault(
      state,
      'attacker',
      'athens',
      { actor: 'ai', civId: 'player' },
    );

    expect(result).toMatchObject({ ok: false, reason });
    expect(state).toEqual(before);
  });

  it('allows only the exact surviving attacker to advance after defeating the final city defender', () => {
    const state = makeMajorAssaultState();
    const defender = createUnit(
      'warrior',
      'ai-1',
      { q: 1, r: 0 },
      state.idCounters,
    );
    defender.id = 'city-defender';
    defender.health = 1;
    state.units[defender.id] = defender;
    state.civilizations['ai-1'].units.push(defender.id);
    const combat = resolveCombat(
      state.units.attacker,
      defender,
      state.map,
      42,
      undefined,
      state.era,
    );
    const afterCombat = applyCombatOutcomeToState(state, combat, 42).state;

    const result = beginMajorCityAssault(
      afterCombat,
      'attacker',
      'athens',
      {
        actor: 'ai',
        civId: 'player',
        precedingCombat: combat,
      },
    );

    expect(combat.attackerSurvived).toBe(true);
    expect(combat.defenderSurvived).toBe(false);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.units.attacker.position).toEqual({ q: 1, r: 0 });
    expect(result.state.units.attacker.hasActed).toBe(true);

    const wrongAttacker = beginMajorCityAssault(
      afterCombat,
      'attacker',
      'athens',
      {
        actor: 'ai',
        civId: 'player',
        precedingCombat: { ...combat, attackerId: 'somebody-else' },
      },
    );
    expect(wrongAttacker).toMatchObject({
      ok: false,
      reason: 'invalid-post-combat-advance',
    });
  });

  it('keeps instability pressure when the former owner reconquers its own breakaway city', () => {
    const { state, cityId } = makeBreakawayFixture({ breakawayStartedTurn: 12 });

    const result = transferCapturedCityOwnership(state, cityId, 'player', state.turn);

    expect(result.cities[cityId].owner).toBe('player');
    expect(result.cities[cityId].unrestLevel).toBe(1);
    expect(result.cities[cityId].conquestTurn).toBeUndefined();
  });

  it('preserves breakaway reconquest behavior in the shared occupy resolver', () => {
    const { state, cityId } = makeBreakawayFixture({ breakawayStartedTurn: 12 });

    const result = resolveMajorCityCapture(state, cityId, 'player', 'occupy', state.turn);

    expect(result.outcome).toBe('occupied');
    expect(result.state.cities[cityId].owner).toBe('player');
    expect(result.state.cities[cityId].unrestLevel).toBe(1);
    expect(result.state.cities[cityId].conquestTurn).toBeUndefined();
    expect(result.state.cities[cityId].occupation).toBeUndefined();
  });

  describe('Great General progress from city capture (#544 MR3)', () => {
    it('awards the capturing civ General progress when occupying an enemy city', () => {
      const state = makeExposedCityCaptureState({ population: 6, buildings: ['granary'] });

      const result = resolveMajorCityCapture(state, 'athens', 'player', 'occupy', state.turn);

      expect(result.state.civilizations.player.generalProgress).toEqual({ points: 30, generalsEarned: 0 });
    });

    it('awards the capturing civ General progress when razing an enemy city', () => {
      const state = makeExposedCityCaptureState({ population: 4, buildings: ['granary'] });

      const result = resolveMajorCityCapture(state, 'athens', 'player', 'raze', state.turn);

      expect(result.state.civilizations.player.generalProgress).toEqual({ points: 30, generalsEarned: 0 });
    });

    it('accumulates onto existing General progress rather than overwriting it', () => {
      const state = makeExposedCityCaptureState({ population: 6, buildings: ['granary'] });
      state.civilizations.player.generalProgress = { points: 50, generalsEarned: 1 };

      const result = resolveMajorCityCapture(state, 'athens', 'player', 'occupy', state.turn);

      expect(result.state.civilizations.player.generalProgress).toEqual({ points: 80, generalsEarned: 1 });
    });

    it('does NOT award General progress when a former owner reconquers its own breakaway city', () => {
      const { state, cityId } = makeBreakawayFixture({ breakawayStartedTurn: 12 });

      const result = resolveMajorCityCapture(state, cityId, 'player', 'occupy', state.turn);

      expect(result.state.civilizations.player.generalProgress).toBeUndefined();
    });
  });

  it('occupies a captured city by halving population and transferring all owned tiles', () => {
    const state = makeExposedCityCaptureState({ population: 6, buildings: ['granary', 'library'] });

    const result = resolveMajorCityCapture(state, 'athens', 'player', 'occupy', state.turn);

    expect(result.state.cities.athens.owner).toBe('player');
    expect(result.state.cities.athens.population).toBe(3);
    expect(result.state.cities.athens.occupation).toEqual(
      expect.objectContaining({ originalOwnerId: 'ai-1', turnsRemaining: 10 }),
    );
    for (const coord of result.state.cities.athens.ownedTiles) {
      expect(result.state.map.tiles[hexKey(coord)].owner).toBe('player');
    }
  });

  it('recalculates captured city territory when legacy owned tiles are missing', () => {
    const state = makeExposedCityCaptureState({ population: 6, buildings: [] });
    state.cities.athens = { ...state.cities.athens, ownedTiles: [] };
    state.map.tiles[hexKey({ q: 1, r: 0 })].owner = 'ai-1';

    const result = resolveMajorCityCapture(state, 'athens', 'player', 'occupy', state.turn);

    expect(result.outcome).toBe('occupied');
    expect(result.state.cities.athens.ownedTiles.map(hexKey)).toContain('1,0');
    expect(result.state.map.tiles[hexKey({ q: 1, r: 0 })].owner).toBe('player');
  });

  it('returns territory tile-flipped events when occupation transfers improved territory', () => {
    const state = makeExposedCityCaptureState({ population: 6, buildings: ['granary'] });
    const farmCoord = { q: 1, r: 1 };
    state.map.tiles[hexKey(farmCoord)] = {
      ...state.map.tiles[hexKey(farmCoord)],
      terrain: 'grassland',
      owner: 'ai-1',
      improvement: 'farm',
      improvementTurnsLeft: 0,
    };

    const result = resolveMajorCityCapture(state, 'athens', 'player', 'occupy', state.turn);

    expect(result.territoryEvents).toContainEqual<GameEvents['territory:tile-flipped']>({
      coord: farmCoord,
      previousOwner: 'ai-1',
      newOwner: 'player',
      improvement: 'farm',
      constructionCancelled: false,
    });
  });

  it('returns no territory flip event for razed tiles that become neutral', () => {
    const state = makeExposedCityCaptureState({ population: 4, buildings: ['granary'] });
    const ownedCoord = { q: 1, r: 1 };
    state.cities.athens = {
      ...state.cities.athens,
      ownedTiles: [state.cities.athens.position, ownedCoord],
    };
    state.map.tiles[hexKey(ownedCoord)] = {
      ...state.map.tiles[hexKey(ownedCoord)],
      terrain: 'grassland',
      owner: 'ai-1',
      improvement: 'farm',
      improvementTurnsLeft: 0,
    };

    const result = resolveMajorCityCapture(state, 'athens', 'player', 'raze', state.turn);

    expect(result.outcome).toBe('razed');
    expect(result.territoryEvents).toEqual([]);
  });

  it('reassigns legendary wonder projects to the new owner when a city is occupied', () => {
    const state = makeExposedCityCaptureState({ population: 6, buildings: ['granary'] });
    addLegendaryProject(state, 'ai-1', 'athens');

    const result = resolveMajorCityCapture(state, 'athens', 'player', 'occupy', state.turn);

    expect(Object.keys(result.state.legendaryWonderProjects ?? {})).toEqual(['oracle-of-delphi:player:athens']);
    expect(result.state.legendaryWonderProjects?.['oracle-of-delphi:player:athens']).toEqual(
      expect.objectContaining({ ownerId: 'player', cityId: 'athens' }),
    );
  });

  it('#591 MR4: deletes cityFaith when a city is razed', () => {
    const state = makeExposedCityCaptureState({ population: 6, buildings: ['granary'] });
    state.cityFaith = { athens: { religionId: 'religion-ai-1', isHolyCity: true } };

    const result = resolveMajorCityCapture(state, 'athens', 'player', 'raze', state.turn);

    expect(result.state.cityFaith?.athens).toBeUndefined();
  });

  it('#591 MR4: preserves cityFaith (under the new owner) when a city is captured (occupy)', () => {
    const state = makeExposedCityCaptureState({ population: 6, buildings: ['granary'] });
    state.cityFaith = { athens: { religionId: 'religion-ai-1', isHolyCity: true } };

    const result = resolveMajorCityCapture(state, 'athens', 'player', 'occupy', state.turn);

    expect(result.state.cityFaith?.athens).toEqual({ religionId: 'religion-ai-1', isHolyCity: true });
    expect(result.state.cities.athens.owner).toBe('player');
  });

  it('razes a population-1 major city when the conqueror chooses raze', () => {
    const state = makeExposedCityCaptureState({ population: 1, buildings: ['granary'] });

    const result = resolveMajorCityCapture(state, 'athens', 'player', 'raze', state.turn);

    expect(result.outcome).toBe('razed');
    expect(result.state.cities.athens).toBeUndefined();
    expect(result.goldAwarded).toBe(30);
  });

  it('occupies a population-1 major city when the conqueror chooses occupy', () => {
    const state = makeExposedCityCaptureState({ population: 1, buildings: ['granary'] });

    const result = resolveMajorCityCapture(state, 'athens', 'player', 'occupy', state.turn);

    expect(result.outcome).toBe('occupied');
    expect(result.state.cities.athens).toEqual(
      expect.objectContaining({
        owner: 'player',
        population: 1,
        occupation: expect.objectContaining({ originalOwnerId: 'ai-1', turnsRemaining: 10 }),
      }),
    );
    expect(result.goldAwarded).toBe(0);
  });

  it('awards salvage gold and applies a raze relationship penalty', () => {
    const state = makeExposedCityCaptureState({ population: 4, buildings: ['granary', 'library', 'monument'] });
    const before = state.civilizations['ai-1'].diplomacy.relationships.player;

    const result = resolveMajorCityCapture(state, 'athens', 'player', 'raze', state.turn);

    expect(result.goldAwarded).toBe(10 + Math.floor((40 + 16 + 30) / 2));
    expect(result.state.cities.athens).toBeUndefined();
    expect(result.state.civilizations['ai-1'].diplomacy.relationships.player).toBe(before - 40);
  });

  it('removes legendary wonder projects for a razed city', () => {
    const state = makeExposedCityCaptureState({ population: 4, buildings: ['granary'] });
    addLegendaryProject(state, 'ai-1', 'athens');

    const result = resolveMajorCityCapture(state, 'athens', 'player', 'raze', state.turn);

    expect(result.state.cities.athens).toBeUndefined();
    expect(result.state.legendaryWonderProjects).toEqual({});
  });

  it('preserves another current holder when razing a city with stale owned tiles', () => {
    const state = makeExposedCityCaptureState({ population: 4, buildings: [] });
    const shared = { q: 1, r: 1 };
    state.cities.rome = {
      ...foundCity('player', { q: 3, r: 1 }, state.map, mkC()),
      id: 'rome',
      name: 'Rome',
      owner: 'player',
      position: { q: 3, r: 1 },
      ownedTiles: [shared],
      workedTiles: [shared],
    };
    state.civilizations.player.cities = ['rome'];
    state.map.tiles[hexKey(shared)] = {
      ...state.map.tiles[hexKey(shared)],
      terrain: 'grassland',
      owner: 'player',
    };
    state.cities.athens = {
      ...state.cities.athens,
      ownedTiles: [state.cities.athens.position, shared],
    };

    const result = resolveMajorCityCapture(state, 'athens', 'player', 'raze', state.turn);

    expect(result.outcome).toBe('razed');
    expect(result.state.map.tiles[hexKey(shared)].owner).toBe('player');
    expect(result.state.cities.rome.workedTiles).toEqual([shared]);
  });

  it('assigns worked tiles to conquered city residents after occupation', () => {
    // foundCity starts with workedTiles: [] — the bug was that nothing assigned
    // workers after capture, so residents had no tiles to work.
    const state = makeExposedCityCaptureState({ population: 4, buildings: [] });

    // Confirm the city starts with no workers (foundCity default)
    expect(state.cities.athens.workedTiles).toEqual([]);

    const result = resolveMajorCityCapture(state, 'athens', 'player', 'occupy', 1);
    const captured = result.state.cities.athens;

    expect(captured).toBeDefined();
    // Population halves (4 → 2), workers must be assigned to valid tiles
    expect(captured!.workedTiles.length).toBeGreaterThan(0);
    // Every worked tile must be in the city's ownedTiles
    const ownedKeys = new Set((captured!.ownedTiles ?? []).map(c => `${c.q},${c.r}`));
    for (const worked of captured!.workedTiles) {
      expect(ownedKeys.has(`${worked.q},${worked.r}`)).toBe(true);
    }
    // Workers must not exceed halved population
    expect(captured!.workedTiles.length).toBeLessThanOrEqual(captured!.population);
  });

  it('sets isEliminated on the previous owner when their last city is occupied', () => {
    const state = makeExposedCityCaptureState({ population: 4, buildings: [] });
    const defeatedUnits = [...state.civilizations['ai-1'].units];
    // ai-1 starts with only 'athens'
    expect(state.civilizations['ai-1'].cities).toEqual(['athens']);

    const result = resolveMajorCityCapture(state, 'athens', 'player', 'occupy', state.turn);

    expect(result.state.civilizations['ai-1'].isEliminated).toBe(true);
    expect(result.state.civilizations['ai-1'].units).toEqual([]);
    expect(defeatedUnits.every(id => result.state.units[id] === undefined)).toBe(true);
    expect(result.elimination?.civId).toBe('ai-1');
  });

  it('sets isEliminated on the previous owner when their last city is razed', () => {
    const state = makeExposedCityCaptureState({ population: 4, buildings: [] });
    const defeatedUnits = [...state.civilizations['ai-1'].units];

    const result = resolveMajorCityCapture(state, 'athens', 'player', 'raze', state.turn);

    expect(result.state.civilizations['ai-1'].isEliminated).toBe(true);
    expect(defeatedUnits.every(id => result.state.units[id] === undefined)).toBe(true);
    expect(result.elimination?.civId).toBe('ai-1');
  });

  it('does not set isEliminated when the previous owner still has other cities', () => {
    const state = makeExposedCityCaptureState({ population: 4, buildings: [] });
    // Give ai-1 a second city so they survive this capture
    state.civilizations['ai-1'].cities = ['athens', 'sparta'];
    state.cities.sparta = {
      ...foundCity('ai-1', { q: 3, r: 0 }, state.map, mkC()),
      id: 'sparta',
      name: 'Sparta',
      owner: 'ai-1',
      position: { q: 3, r: 0 },
      population: 3,
      buildings: [],
    };

    const result = resolveMajorCityCapture(state, 'athens', 'player', 'occupy', state.turn);

    expect(result.state.civilizations['ai-1'].isEliminated).toBeFalsy();
  });

  describe('city-capture-system intrinsic defense (#522)', () => {
    function makeUndefendedWalledCityState({
      population,
      buildings,
      attackerType = 'warrior',
    }: {
      population: number;
      buildings: string[];
      attackerType?: 'warrior' | 'swordsman' | 'tank';
    }): GameState {
      const state = makeExposedCityCaptureState({ population, buildings });
      const attacker = createUnit(attackerType, 'player', { q: 0, r: 0 }, state.idCounters);
      attacker.id = 'attacker';
      attacker.movementPointsLeft = 2;
      state.units = { [attacker.id]: attacker };
      state.civilizations.player.units = [attacker.id];
      state.civilizations['ai-1'].units = [];
      state.civilizations.player.diplomacy.atWarWith = ['ai-1'];
      state.civilizations['ai-1'].diplomacy.atWarWith = ['player'];
      state.map.tiles['0,0'].terrain = 'grassland';
      state.map.tiles['1,0'].terrain = 'grassland';
      return state;
    }

    it('captures a weakly-defended (low population, unwalled) city reliably, like today', () => {
      const state = makeUndefendedWalledCityState({ population: 1, buildings: [], attackerType: 'tank' });

      const result = beginMajorCityAssault(state, 'attacker', 'athens', { actor: 'player', civId: 'player' });

      expect(result.ok).toBe(true);
    });

    it('repels a hopelessly outmatched attacker against a strongly walled, populous city', () => {
      const state = makeUndefendedWalledCityState({ population: 30, buildings: ['walls', 'star_fort'] });

      const result = beginMajorCityAssault(state, 'attacker', 'athens', { actor: 'player', civId: 'player' });

      expect(result).toMatchObject({ ok: false, reason: 'repelled-by-city-defense' });
    });

    it('on repel, the attacker stays in place, takes counter-fire damage, and the action is consumed', () => {
      const state = makeUndefendedWalledCityState({ population: 30, buildings: ['walls', 'star_fort'] });
      const before = state.units.attacker!.health;

      const result = beginMajorCityAssault(state, 'attacker', 'athens', { actor: 'player', civId: 'player' });

      expect(result.ok).toBe(false);
      expect(result.state.units.attacker!.position).toEqual({ q: 0, r: 0 });
      expect(result.state.units.attacker!.health).toBeLessThan(before);
      expect(result.state.units.attacker!.hasActed).toBe(true);
      expect(result.state.units.attacker!.movementPointsLeft).toBe(0);
      expect(result.state.cities.athens).toBeDefined(); // still owned by defender
    });

    it('on a successful assault against walls, the attacker still takes counter-fire damage', () => {
      const state = makeUndefendedWalledCityState({ population: 1, buildings: ['walls'], attackerType: 'tank' });
      const before = state.units.attacker!.health;

      const result = beginMajorCityAssault(state, 'attacker', 'athens', { actor: 'player', civId: 'player' });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.state.units.attacker!.health).toBeLessThan(before);
    });

    it('#544 MR3: awards the defending civ Great General progress when an assault is repelled', () => {
      const state = makeUndefendedWalledCityState({ population: 30, buildings: ['walls', 'star_fort'] });

      const result = beginMajorCityAssault(state, 'attacker', 'athens', { actor: 'player', civId: 'player' });

      expect(result.ok).toBe(false);
      expect(result.state.civilizations['ai-1'].generalProgress).toEqual({ points: 25, generalsEarned: 0 });
    });

    it('#544 MR3: does NOT award the attacking civ Great General progress on a repelled assault', () => {
      const state = makeUndefendedWalledCityState({ population: 30, buildings: ['walls', 'star_fort'] });

      const result = beginMajorCityAssault(state, 'attacker', 'athens', { actor: 'player', civId: 'player' });

      expect(result.ok).toBe(false);
      expect(result.state.civilizations.player.generalProgress).toBeUndefined();
    });

    it('#544 MR3: does NOT award defense progress when the assault SUCCEEDS', () => {
      const state = makeUndefendedWalledCityState({ population: 1, buildings: [], attackerType: 'tank' });

      const result = beginMajorCityAssault(state, 'attacker', 'athens', { actor: 'player', civId: 'player' });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.state.civilizations['ai-1'].generalProgress).toBeUndefined();
    });

    it('takes no counter-fire against an unwalled city even on repel (population alone can still repel)', () => {
      const state = makeUndefendedWalledCityState({ population: 30, buildings: [] }); // no walls, still very high intrinsic strength
      const before = state.units.attacker!.health;

      const result = beginMajorCityAssault(state, 'attacker', 'athens', { actor: 'player', civId: 'player' });

      // Regardless of win/lose, no walls means zero counter-fire.
      expect(result.state.units.attacker!.health).toBe(before);
    });

    it('never double-punishes the post-garrison-defeat advance (the double-punishment fix)', () => {
      // Reuses the existing "defeated the final defender, then advances" fixture pattern.
      const state = makeMajorAssaultState();
      const defender = createUnit('warrior', 'ai-1', { q: 1, r: 0 }, state.idCounters);
      defender.id = 'city-defender';
      defender.health = 1;
      state.units[defender.id] = defender;
      state.civilizations['ai-1'].units.push(defender.id);
      // Make the city extremely strong so, if the double-punishment bug existed, this
      // attacker would be repelled by the SECOND (buggy) intrinsic-strength check.
      state.cities.athens = { ...state.cities.athens, population: 50, buildings: ['walls', 'star_fort'] };
      const combat = resolveCombat(state.units.attacker!, defender, state.map, 42, undefined, state.era);
      const afterCombat = applyCombatOutcomeToState(state, combat, 42).state;

      const result = beginMajorCityAssault(afterCombat, 'attacker', 'athens', {
        actor: 'ai',
        civId: 'player',
        precedingCombat: combat,
      });

      expect(result.ok).toBe(true); // proves no second intrinsic-strength check fired
      if (!result.ok) return;
      expect(result.state.units.attacker!.position).toEqual({ q: 1, r: 0 });
    });

    it('the AI-actor capture path uses the identical resolution as the player path (#522)', () => {
      const playerState = makeUndefendedWalledCityState({ population: 30, buildings: ['walls', 'star_fort'] });
      const aiState = structuredClone(playerState);

      const playerResult = beginMajorCityAssault(playerState, 'attacker', 'athens', { actor: 'player', civId: 'player' });
      const aiResult = beginMajorCityAssault(aiState, 'attacker', 'athens', { actor: 'ai', civId: 'player' });

      // Same state, same seed inputs (turn/attackerId/cityId) -> identical outcome,
      // regardless of the 'actor' field, which is purely for event/bookkeeping purposes.
      expect(playerResult.ok).toBe(aiResult.ok);
    });

    describe('#544 MR4 — no chained city captures in one turn', () => {
      it('a unit that already captured a city this turn cannot begin a second assault', () => {
        const state = makeUndefendedWalledCityState({ population: 1, buildings: [], attackerType: 'tank' });
        state.units.attacker = { ...state.units.attacker!, hasCapturedCityThisTurn: true };

        const result = beginMajorCityAssault(state, 'attacker', 'athens', { actor: 'player', civId: 'player' });

        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.reason).toBe('already-captured-city-this-turn');
      });

      it('sets hasCapturedCityThisTurn on the attacker after a successful undefended-city occupation', () => {
        const state = makeUndefendedWalledCityState({ population: 1, buildings: [], attackerType: 'tank' });

        const result = beginMajorCityAssault(state, 'attacker', 'athens', { actor: 'player', civId: 'player' });

        expect(result.ok).toBe(true);
        if (result.ok) expect(result.state.units.attacker!.hasCapturedCityThisTurn).toBe(true);
      });

      it('sets hasCapturedCityThisTurn on the attacker after a post-combat advance into a cleared city', () => {
        const state = makeMajorAssaultState();
        const defender = createUnit('warrior', 'ai-1', { q: 1, r: 0 }, state.idCounters);
        defender.id = 'city-defender';
        defender.health = 1;
        state.units[defender.id] = defender;
        state.civilizations['ai-1'].units.push(defender.id);
        const combat = resolveCombat(state.units.attacker!, defender, state.map, 42, undefined, state.era);
        const afterCombat = applyCombatOutcomeToState(state, combat, 42).state;
        expect(combat.attackerSurvived).toBe(true);
        expect(combat.defenderSurvived).toBe(false); // sanity: precondition for advancing into the city

        const result = beginMajorCityAssault(afterCombat, 'attacker', 'athens', {
          actor: 'player',
          civId: 'player',
          precedingCombat: combat,
        });

        expect(result.ok).toBe(true);
        if (result.ok) expect(result.state.units.attacker!.hasCapturedCityThisTurn).toBe(true);
      });
    });
  });
});

describe('#887 MR1 — recordCityCaptureCareerEvents (city-captured attribution)', () => {
  const activeHold = (generalDefinitionId?: string) => ({
    formationId: 'f1', defenseBonusMultiplier: 1.15, expiresTurn: 5, generalDefinitionId,
  });
  const historyEntry = (unitId: string, generalDefinitionId: string) => ({
    unitId, generalDefinitionId, spawnedTurn: 1, careerEvents: [] as GeneralCareerEvent[],
  });
  const eventsFor = (s: GameState, civId: string, defId: string): GeneralCareerEvent[] =>
    s.civilizations[civId].generalHistory?.find(e => e.generalDefinitionId === defId)?.careerEvents ?? [];

  const baseState = (): GameState => ({
    turn: 5,
    units: {
      captor: { id: 'captor', owner: 'player', type: 'swordsman', position: { q: 1, r: 0 } },
    },
    cities: {},
    civilizations: {
      player: { id: 'player', generalHistory: [historyEntry('g-p', 'gen_sun_tzu')] },
      'ai-1': { id: 'ai-1', generalHistory: [historyEntry('g-a', 'gen_ramesses')] },
    },
  } as unknown as GameState);

  it('credits a General whose same-turn Seize grant is on the capturing unit', () => {
    const state = baseState();
    state.units.captor = { ...state.units.captor, seizeGrantedBy: { generalDefinitionId: 'gen_sun_tzu', turn: 5 } };

    const out = recordCityCaptureCareerEvents(state, 'athens', 'Athens', 'player', 'captor');

    expect(eventsFor(out, 'player', 'gen_sun_tzu')).toEqual([
      { type: 'city-captured', turn: 5, cityId: 'athens', cityName: 'Athens' },
    ]);
  });

  it('credits a General whose active Last Stand hold is on the capturing unit', () => {
    const state = baseState();
    state.units.captor = { ...state.units.captor, lastStandHold: activeHold('gen_sun_tzu') };

    const out = recordCityCaptureCareerEvents(state, 'athens', 'Athens', 'player', 'captor');

    expect(eventsFor(out, 'player', 'gen_sun_tzu')).toEqual([
      { type: 'city-captured', turn: 5, cityId: 'athens', cityName: 'Athens' },
    ]);
  });

  it('records one event, not two, for a General who both held and Seize-granted the capturing unit', () => {
    const state = baseState();
    state.units.captor = {
      ...state.units.captor,
      lastStandHold: activeHold('gen_sun_tzu'),
      seizeGrantedBy: { generalDefinitionId: 'gen_sun_tzu', turn: 5 },
    };
    const preceding: CombatResult = {
      attackerId: 'captor', defenderId: 'garrison', attackerDamage: 0, defenderDamage: 100,
      attackerSurvived: true, defenderSurvived: false, attackerStrength: 30, defenderStrength: 10,
      attackerPosition: { q: 0, r: 0 }, defenderPosition: { q: 1, r: 0 },
    };

    const out = recordCityCaptureCareerEvents(state, 'athens', 'Athens', 'player', 'captor', preceding);

    expect(eventsFor(out, 'player', 'gen_sun_tzu').filter(e => e.type === 'city-captured')).toHaveLength(1);
  });

  it('does not credit an uninvolved General of the capturing civ', () => {
    const state = baseState();
    // captor carries no hold and no seize marker at all

    const out = recordCityCaptureCareerEvents(state, 'athens', 'Athens', 'player', 'captor');

    expect(eventsFor(out, 'player', 'gen_sun_tzu')).toEqual([]);
    expect(out).toBe(state);
  });

  it('records the historical city name even for a razed city already gone from state.cities', () => {
    const state = baseState();
    state.units.captor = { ...state.units.captor, seizeGrantedBy: { generalDefinitionId: 'gen_sun_tzu', turn: 5 } };
    // state.cities has no 'carthage' entry — the caller passes the pre-raze name

    const out = recordCityCaptureCareerEvents(state, 'carthage', 'Carthage', 'player', 'captor');

    expect(eventsFor(out, 'player', 'gen_sun_tzu')).toEqual([
      { type: 'city-captured', turn: 5, cityId: 'carthage', cityName: 'Carthage' },
    ]);
  });

  it('is actor-agnostic — an AI capture credits the AI civ General identically', () => {
    const state = baseState();
    state.units.captor = {
      ...state.units.captor, owner: 'ai-1',
      lastStandHold: activeHold('gen_ramesses'),
    };

    const out = recordCityCaptureCareerEvents(state, 'athens', 'Athens', 'ai-1', 'captor');

    expect(eventsFor(out, 'ai-1', 'gen_ramesses')).toEqual([
      { type: 'city-captured', turn: 5, cityId: 'athens', cityName: 'Athens' },
    ]);
    expect(eventsFor(out, 'player', 'gen_sun_tzu')).toEqual([]);
  });

  it('does not credit a marker from a prior turn or an expired hold', () => {
    const state = baseState();
    state.units.captor = {
      ...state.units.captor,
      seizeGrantedBy: { generalDefinitionId: 'gen_sun_tzu', turn: 4 },
      lastStandHold: { formationId: 'f1', defenseBonusMultiplier: 1.15, expiresTurn: 4, generalDefinitionId: 'gen_sun_tzu' },
    };

    const out = recordCityCaptureCareerEvents(state, 'athens', 'Athens', 'player', 'captor');

    expect(eventsFor(out, 'player', 'gen_sun_tzu')).toEqual([]);
  });

  it('no-ops without throwing when the crediting civ has no matching generalHistory entry', () => {
    const state = baseState();
    state.civilizations.player.generalHistory = [];
    state.units.captor = { ...state.units.captor, seizeGrantedBy: { generalDefinitionId: 'gen_sun_tzu', turn: 5 } };

    expect(() => recordCityCaptureCareerEvents(state, 'athens', 'Athens', 'player', 'captor')).not.toThrow();
  });
});
