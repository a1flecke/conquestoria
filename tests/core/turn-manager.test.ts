import { processTurn } from '@/core/turn-manager';
import { createNewGame } from '@/core/game-state';
import { EventBus } from '@/core/event-bus';
import type { CustomCivDefinition, GameState, UnitType } from '@/core/types';
import { TECH_TREE } from '@/systems/tech-definitions';
import { foundCity } from '@/systems/city-system';
import { createDiplomacyState } from '@/systems/diplomacy-system';
import { createVisibilityMap, getVisibility } from '@/systems/fog-of-war';
import { getAvailableTechs } from '@/systems/tech-system';
import { hexKey } from '@/systems/hex-utils';
import { getLegendaryWonderDefinition } from '@/systems/legendary-wonder-definitions';
import { resolveCivDefinition } from '@/systems/civ-registry';
import { calculateCityYields } from '@/systems/resource-system';
import { makeBreakawayFixture } from '../systems/helpers/breakaway-fixture';
import { makeAutoExploreFixture } from '../systems/helpers/auto-explore-fixture';
import { makeLegendaryWonderFixture } from '../systems/helpers/legendary-wonder-fixture';

const mkC = () => ({ nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 });

const customCiv: CustomCivDefinition = {
  id: 'custom-sunfolk',
  name: 'Sunfolk',
  color: '#d9a441',
  leaderName: 'Aurelia',
  cityNames: ['Solara', 'Embergate', 'Sunspire', 'Goldmere', 'Dawnwatch', 'Auric'],
  primaryTrait: 'scholarly',
  temperamentTraits: ['diplomatic', 'trader'],
};

function createWrappedGrasslandMap(width: number, height: number): GameState['map'] {
  const tiles: GameState['map']['tiles'] = {};
  for (let q = 0; q < width; q++) {
    for (let r = 0; r < height; r++) {
      tiles[hexKey({ q, r })] = {
        coord: { q, r },
        terrain: 'grassland',
        elevation: 'lowland',
        resource: null,
        improvement: 'none',
        owner: null,
        improvementTurnsLeft: 0,
        hasRiver: false,
        wonder: null,
      };
    }
  }

  return {
    width,
    height,
    wrapsHorizontally: true,
    tiles,
    rivers: [],
  };
}

describe('processTurn', () => {
  it('increments the turn counter', () => {
    const state = createNewGame(undefined, 'turn-test');
    const bus = new EventBus();
    const newState = processTurn(state, bus);
    expect(newState.turn).toBe(2);
  });

  it('resets unit movement points', () => {
    const state = createNewGame(undefined, 'turn-test');
    const bus = new EventBus();
    const unitId = Object.keys(state.units)[0];
    state.units[unitId].movementPointsLeft = 0;
    state.units[unitId].hasMoved = true;

    const newState = processTurn(state, bus);
    const unit = newState.units[unitId];
    if (unit) {
      expect(unit.hasMoved).toBe(false);
      expect(unit.movementPointsLeft).toBeGreaterThan(0);
    }
  });

  it('emits turn:start and turn:end events', () => {
    const state = createNewGame(undefined, 'turn-test');
    const bus = new EventBus();
    const startListener = vi.fn();
    const endListener = vi.fn();
    bus.on('turn:start', startListener);
    bus.on('turn:end', endListener);

    processTurn(state, bus);
    expect(endListener).toHaveBeenCalled();
    expect(startListener).toHaveBeenCalled();
  });

  it('processes city production', () => {
    const state = createNewGame(undefined, 'turn-test');
    const bus = new EventBus();

    const playerCiv = Object.values(state.civilizations).find(c => c.isHuman)!;
    if (playerCiv.cities.length === 0) {
      return;
    }

    const newState = processTurn(state, bus);
    expect(newState).toBeDefined();
  });

  it('applies occupied-city penalties and decrements the occupation timer during turn processing', () => {
    const state = createNewGame(undefined, 'occupied-turn', 'small');
    const bus = new EventBus();
    const city = foundCity('player', { q: 1, r: 0 }, state.map, mkC());
    city.id = 'athens';
    city.population = 4;
    city.buildings = ['granary'];
    city.productionQueue = ['library'];
    city.productionProgress = 0;
    city.occupation = { originalOwnerId: 'ai-1', turnsRemaining: 8 };
    state.cities[city.id] = city;
    state.civilizations.player.cities = [city.id];

    const baseProduction = calculateCityYields(city, state.map).production;
    const result = processTurn(state, bus);

    expect(result.cities.athens.occupation?.turnsRemaining).toBe(7);
    expect(result.cities.athens.productionProgress).toBe(Math.floor(baseProduction * 0.5));
  });

  it('processes minor civ turn phase', () => {
    const state = createNewGame(undefined, 'turn-mc', 'small');
    const bus = new EventBus();
    expect(Object.keys(state.minorCivs).length).toBeGreaterThan(0);

    const result = processTurn(state, bus);
    expect(Object.keys(result.minorCivs).length).toBeGreaterThan(0);
  });

  it('emits territory tile-flipped events during turn territory recalculation', () => {
    const state = createNewGame(undefined, 'turn-territory-flip-event', 'small');
    state.cities = {};
    state.units = {};
    state.barbarianCamps = {};
    state.minorCivs = {};
    state.civilizations.player.cities = [];
    state.civilizations.player.units = [];
    state.civilizations['ai-1'].cities = [];
    state.civilizations['ai-1'].units = [];
    const holder = foundCity('player', { q: 6, r: 6 }, state.map, mkC());
    const challenger = foundCity('ai-1', { q: 9, r: 6 }, state.map, mkC());
    holder.id = 'holder-city';
    challenger.id = 'challenger-city';
    const overlap = { q: 8, r: 6 };
    state.cities[holder.id] = { ...holder, population: 2, maturity: 'outpost', ownedTiles: [overlap] };
    state.cities[challenger.id] = { ...challenger, population: 6, maturity: 'town', buildings: ['shrine'], ownedTiles: [] };
    state.civilizations.player.cities = [holder.id];
    state.civilizations['ai-1'].cities = [challenger.id];
    state.map.tiles[hexKey(overlap)] = {
      ...state.map.tiles[hexKey(overlap)],
      terrain: 'grassland',
      owner: 'player',
      improvement: 'farm',
      improvementTurnsLeft: 0,
    };
    const bus = new EventBus();
    const tileFlipped = vi.fn();
    bus.on('territory:tile-flipped', tileFlipped);

    processTurn(state, bus);

    expect(tileFlipped).toHaveBeenCalledWith(expect.objectContaining({
      coord: overlap,
      previousOwner: 'player',
      newOwner: 'ai-1',
      improvement: 'farm',
      constructionCancelled: false,
    }));
  });

  it('advances cultural frontier pressure during turn processing before a tile flips', () => {
    const state = createNewGame(undefined, 'turn-territory-frontier-progress', 'small');
    state.cities = {};
    state.units = {};
    state.barbarianCamps = {};
    state.minorCivs = {};
    state.civilizations.player.cities = [];
    state.civilizations.player.units = [];
    state.civilizations['ai-1'].cities = [];
    state.civilizations['ai-1'].units = [];
    const holder = foundCity('player', { q: 6, r: 6 }, state.map, mkC());
    const challenger = foundCity('ai-1', { q: 9, r: 6 }, state.map, mkC());
    holder.id = 'frontier-holder';
    challenger.id = 'frontier-challenger';
    const overlap = { q: 8, r: 6 };
    state.cities[holder.id] = { ...holder, population: 2, maturity: 'outpost', ownedTiles: [overlap] };
    state.cities[challenger.id] = { ...challenger, population: 3, maturity: 'outpost', ownedTiles: [] };
    state.civilizations.player.cities = [holder.id];
    state.civilizations['ai-1'].cities = [challenger.id];
    state.map.tiles[hexKey(overlap)] = { ...state.map.tiles[hexKey(overlap)], terrain: 'grassland', owner: 'player' };

    const result = processTurn(state, new EventBus());

    expect(result.territoryFrontiers?.[hexKey(overlap)]).toEqual(expect.objectContaining({
      holderCivId: 'player',
      challengerCivId: 'ai-1',
      holderCityId: holder.id,
      challengerCityId: challenger.id,
    }));
  });

  it('emits a territory event when frontier progress reaches a tile flip', () => {
    const state = createNewGame(undefined, 'turn-territory-frontier-flip-event', 'small');
    state.cities = {};
    state.units = {};
    state.barbarianCamps = {};
    state.minorCivs = {};
    state.civilizations.player.cities = [];
    state.civilizations.player.units = [];
    state.civilizations['ai-1'].cities = [];
    state.civilizations['ai-1'].units = [];
    const holder = foundCity('player', { q: 6, r: 6 }, state.map, mkC());
    const challenger = foundCity('ai-1', { q: 9, r: 6 }, state.map, mkC());
    holder.id = 'frontier-event-holder';
    challenger.id = 'frontier-event-challenger';
    const overlap = { q: 8, r: 6 };
    state.cities[holder.id] = { ...holder, population: 2, maturity: 'outpost', ownedTiles: [overlap] };
    state.cities[challenger.id] = { ...challenger, population: 3, maturity: 'outpost', ownedTiles: [] };
    state.civilizations.player.cities = [holder.id];
    state.civilizations['ai-1'].cities = [challenger.id];
    state.map.tiles[hexKey(overlap)] = {
      ...state.map.tiles[hexKey(overlap)],
      terrain: 'grassland',
      owner: 'player',
      improvement: 'farm',
      improvementTurnsLeft: 0,
    };
    state.territoryFrontiers = {
      [hexKey(overlap)]: {
        coord: overlap,
        holderCivId: 'player',
        challengerCivId: 'ai-1',
        holderCityId: holder.id,
        challengerCityId: challenger.id,
        progress: 9,
        trend: 'likely-to-flip',
        reason: 'ai-1 cultural pressure is challenging player.',
      },
    };
    const bus = new EventBus();
    const tileFlipped = vi.fn();
    bus.on('territory:tile-flipped', tileFlipped);

    const result = processTurn(state, bus);

    expect(result.map.tiles[hexKey(overlap)].owner).toBe('ai-1');
    expect(tileFlipped).toHaveBeenCalledWith(expect.objectContaining({
      coord: overlap,
      previousOwner: 'player',
      newOwner: 'ai-1',
      improvement: 'farm',
      constructionCancelled: false,
    }));
  });

  it('awards barbarian units experience when they defeat a player unit during turn processing', () => {
    const state = createNewGame(undefined, 'barbarian-reward', 'small');
    state.turn = 5;
    state.units = {
      'barb-1': {
        id: 'barb-1',
        type: 'warrior',
        owner: 'barbarian',
        position: { q: 1, r: 0 },
        movementPointsLeft: 2,
        health: 60,
        experience: 0,
        hasMoved: false,
        hasActed: false,
        isResting: false,
      },
      'player-1': {
        id: 'player-1',
        type: 'warrior',
        owner: 'player',
        position: { q: 0, r: 0 },
        movementPointsLeft: 0,
        health: 1,
        experience: 0,
        hasMoved: true,
        hasActed: false,
        isResting: false,
      },
    };
    state.civilizations.player.units = ['player-1'];
    state.barbarianCamps = {
      camp: { id: 'camp', position: { q: 2, r: 0 }, strength: 5, spawnCooldown: 99 },
    };

    const result = processTurn(state, new EventBus());

    expect(result.units['player-1']).toBeUndefined();
    expect(result.units['barb-1'].experience).toBeGreaterThan(0);
    expect(result.civilizations.player.units).not.toContain('player-1');
  });

  it('persists wrapped minor-civ proximity reveal on the returned turn state', () => {
    const state = createNewGame(undefined, 'minor-civ-wrap-visibility', 'small');
    state.map = createWrappedGrasslandMap(5, 4);
    state.units = {};
    state.cities = {};
    state.minorCivs = {};

    for (const civ of Object.values(state.civilizations)) {
      civ.units = [];
      civ.cities = [];
      civ.visibility = createVisibilityMap();
    }

    state.civilizations.player.visibility.tiles['4,1'] = 'fog';

    const minorCity = foundCity('mc-geneva', { q: 0, r: 1 }, state.map, mkC());
    minorCity.id = 'city-geneva';
    minorCity.name = 'Geneva';
    minorCity.owner = 'mc-geneva';
    state.cities[minorCity.id] = minorCity;
    state.minorCivs['mc-geneva'] = {
      id: 'mc-geneva',
      definitionId: 'geneva',
      cityId: minorCity.id,
      units: [],
      diplomacy: createDiplomacyState(['player', 'mc-geneva'], 'mc-geneva'),
      activeQuests: {},
      isDestroyed: false,
      garrisonCooldown: 0,
      lastEraUpgrade: 0,
    };

    const result = processTurn(state, new EventBus());

    expect(getVisibility(result.civilizations.player.visibility, { q: 0, r: 1 })).toBe('visible');
  });

  it('advances research progress when a city exists and tech is selected', () => {
    const state = createNewGame(undefined, 'turn-research', 'small');
    const bus = new EventBus();

    // Found a city for the player so they produce science
    const playerCiv = state.civilizations.player;
    const startPos = state.units[playerCiv.units[0]].position;
    const city = foundCity('player', startPos, state.map, mkC());
    state.cities[city.id] = city;
    playerCiv.cities.push(city.id);

    // Select the first available tech
    const available = getAvailableTechs(playerCiv.techState);
    playerCiv.techState.currentResearch = available[0].id;
    playerCiv.techState.researchProgress = 0;

    const newState = processTurn(state, bus);
    expect(newState.civilizations.player.techState.researchProgress).toBeGreaterThan(0);
  });

  it('updates city maturity and grid size from population plus qualifying techs during turn processing', () => {
    const state = createNewGame(undefined, 'turn-city-maturity', 'small');
    const bus = new EventBus();
    const playerCiv = state.civilizations.player;
    const startPos = state.units[playerCiv.units[0]].position;
    const city = foundCity('player', startPos, state.map, mkC());
    state.cities[city.id] = {
      ...city,
      population: 5,
      food: 0,
      maturity: 'outpost',
      gridSize: 3,
      workedTiles: [],
      focus: 'balanced',
    };
    playerCiv.cities.push(city.id);
    playerCiv.techState.completed = ['early-empire', 'engineering'];

    const result = processTurn(state, bus);

    expect(result.cities[city.id].maturity).toBe('town');
    expect(result.cities[city.id].gridSize).toBe(5);
  });

  it('assigns focused worked tiles before calculating city yields', () => {
    const state = createNewGame(undefined, 'focused-work-before-yields', 'small');
    const bus = new EventBus();
    const playerCiv = state.civilizations.player;
    const startPos = state.units[playerCiv.units[0]].position;
    const city = foundCity('player', startPos, state.map, mkC());
    const hills = { q: startPos.q + 1, r: startPos.r };

    state.map.tiles[hexKey(city.position)].owner = 'player';
    state.map.tiles[hexKey(hills)] = {
      ...state.map.tiles[hexKey(hills)],
      coord: hills,
      terrain: 'hills',
      elevation: 'highland',
      owner: 'player',
      improvement: 'none',
      improvementTurnsLeft: 0,
      hasRiver: false,
      wonder: null,
      resource: null,
    };

    state.cities[city.id] = {
      ...city,
      population: 1,
      focus: 'production',
      workedTiles: [],
      ownedTiles: [city.position, hills],
      productionQueue: ['warrior'],
    };
    playerCiv.cities.push(city.id);

    const result = processTurn(state, bus);
    const updated = result.cities[city.id];

    expect(updated.workedTiles).toContainEqual(hills);
    expect(updated.productionProgress).toBe(3);
  });

  it('recalculates cultural territory before marketplace supply counts city territory', () => {
    const state = createNewGame(undefined, 'turn-territory-growth', 'small');
    const playerCiv = state.civilizations.player;
    const startPos = state.units[playerCiv.units[0]].position;
    const city = foundCity('player', startPos, state.map, mkC());
    const radius3 = state.map.wrapsHorizontally
      ? { q: (city.position.q + 3) % state.map.width, r: city.position.r }
      : { q: city.position.q + 3, r: city.position.r };
    const key = hexKey(radius3);
    state.map.tiles[key] = {
      ...state.map.tiles[key],
      coord: radius3,
      terrain: 'grassland',
      elevation: 'lowland',
      owner: null,
      improvement: 'none',
      improvementTurnsLeft: 0,
      hasRiver: false,
      wonder: null,
      resource: 'horses',
    };
    state.cities[city.id] = { ...city, population: 4, ownedTiles: [city.position] };
    playerCiv.cities = [city.id];

    const next = processTurn(state, new EventBus());

    expect(next.cities[city.id].ownedTiles.map(hexKey)).toContain(key);
    expect(next.map.tiles[key].owner).toBe('player');
  });

  it('reassigns focused city worked tiles after growth without working the city center', () => {
    const state = createNewGame(undefined, 'focused-growth-worked-tiles', 'small');
    const bus = new EventBus();
    const playerCiv = state.civilizations.player;
    const startPos = state.units[playerCiv.units[0]].position;
    const city = foundCity('player', startPos, state.map, mkC());
    const workable = [
      { q: startPos.q + 1, r: startPos.r },
      { q: startPos.q, r: startPos.r + 1 },
      { q: startPos.q + 1, r: startPos.r - 1 },
    ];

    state.map.tiles[hexKey(city.position)].owner = 'player';
    for (const coord of workable) {
      state.map.tiles[hexKey(coord)] = {
        ...state.map.tiles[hexKey(coord)],
        coord,
        terrain: 'grassland',
        elevation: 'lowland',
        owner: 'player',
        improvement: 'none',
        improvementTurnsLeft: 0,
        hasRiver: false,
        wonder: null,
        resource: null,
      };
    }

    state.cities[city.id] = {
      ...city,
      population: 1,
      food: city.foodNeeded,
      focus: 'food',
      workedTiles: [],
      ownedTiles: [city.position, ...workable],
    };
    playerCiv.cities.push(city.id);

    const result = processTurn(state, bus);
    const updated = result.cities[city.id];

    expect(updated.population).toBe(2);
    expect(updated.focus).toBe('food');
    expect(updated.workedTiles.length).toBeGreaterThan(0);
    expect(updated.workedTiles.length).toBeLessThanOrEqual(updated.population);
    expect(updated.workedTiles.map(hexKey)).not.toContain(hexKey(updated.position));
  });

  it('spawns a unit when city completes unit training', () => {
    const state = createNewGame(undefined, 'unit-spawn-test', 'small');
    const bus = new EventBus();

    // Found a city for player
    const startPos = state.units[state.civilizations.player.units[0]].position;
    const city = foundCity('player', startPos, state.map, mkC());
    state.cities[city.id] = city;
    state.civilizations.player.cities.push(city.id);

    // Queue a warrior and set progress to nearly complete
    city.productionQueue = ['warrior'];
    city.productionProgress = 24; // warrior costs 25, +1 production from city center will complete it

    const unitCountBefore = Object.values(state.units).filter(u => u.owner === 'player').length;
    const newState = processTurn(state, bus);
    const unitCountAfter = Object.values(newState.units).filter(u => u.owner === 'player').length;

    expect(unitCountAfter).toBe(unitCountBefore + 1);
    expect(newState.civilizations.player.units.length).toBe(unitCountBefore + 1);
  });

  it('checks era advancement after processing', () => {
    const state = createNewGame(undefined, 'turn-era', 'small');
    const bus = new EventBus();
    state.era = 1;

    const era2Techs = TECH_TREE.filter(t => t.era === 2);
    const needed = Math.ceil(era2Techs.length * 0.6);
    state.civilizations.player.techState.completed = era2Techs.slice(0, needed).map(t => t.id);

    const result = processTurn(state, bus);
    expect(result.era).toBe(2);
  });

  it('matures breakaway secessions during normal turn processing', () => {
    const { state, breakawayId } = makeBreakawayFixture({ breakawayStartedTurn: 12, turn: 62 });
    const bus = new EventBus();

    const result = processTurn(state, bus);

    expect(result.civilizations[breakawayId].breakaway?.status).toBe('established');
  });

  it('applies auto-explore orders during turn processing', () => {
    const { state, unitId } = makeAutoExploreFixture({ safeFogNorth: true });
    const bus = new EventBus();

    const result = processTurn(state, bus);

    expect(result.units[unitId].position).toEqual({ q: 1, r: 0 });
    expect((result.units[unitId] as any).automation).toBeDefined();
  });

  it('auto-explore processes village and wonder side effects during turn processing', () => {
    const { state, unitId } = makeAutoExploreFixture({ villageNorth: true, wonderNorth: 'grand_canyon', safeFogNorth: true });
    const bus = new EventBus();

    const result = processTurn(state, bus);

    expect(result.units[unitId].position).toEqual({ q: 1, r: 0 });
    expect(Object.keys(result.discoveredWonders)).toContain('grand_canyon');
    expect(Object.keys(result.tribalVillages)).toHaveLength(0);
  });

  it('moves a legendary wonder project from questing to ready_to_build once all steps complete', () => {
    const state = makeLegendaryWonderFixture();
    const bus = new EventBus();

    state.legendaryWonderProjects!['oracle-of-delphi'].questSteps.forEach(step => {
      step.completed = true;
    });

    const result = processTurn(state, bus);

    expect(result.legendaryWonderProjects!['oracle-of-delphi'].phase).toBe('ready_to_build');
  });

  it('completes a legendary wonder and clears the city queue once enough production is invested', () => {
    const state = makeLegendaryWonderFixture({ oracleStepsCompleted: 2 });
    const bus = new EventBus();
    const oracle = getLegendaryWonderDefinition('oracle-of-delphi');

    state.legendaryWonderProjects!['oracle-of-delphi'].phase = 'building';
    state.cities['city-river'].productionQueue = ['legendary:oracle-of-delphi'];
    state.cities['city-river'].productionProgress = (oracle?.productionCost ?? 0) - 1;

    const result = processTurn(state, bus);

    expect(result.legendaryWonderProjects!['oracle-of-delphi'].phase).toBe('completed');
    expect(result.cities['city-river'].productionQueue).toEqual([]);
    expect(result.cities['city-river'].productionProgress).toBe(0);
  });

  it('emits a legendary-completed event when a wonder finishes during turn processing', () => {
    const state = makeLegendaryWonderFixture({ oracleStepsCompleted: 2 });
    const bus = new EventBus();
    const completedEvents: Array<{ civId: string; cityId: string; wonderId: string }> = [];
    const oracle = getLegendaryWonderDefinition('oracle-of-delphi');

    bus.on('wonder:legendary-completed', event => completedEvents.push(event));
    state.legendaryWonderProjects!['oracle-of-delphi'].phase = 'building';
    state.cities['city-river'].productionQueue = ['legendary:oracle-of-delphi'];
    state.cities['city-river'].productionProgress = (oracle?.productionCost ?? 0) - 1;

    processTurn(state, bus);

    expect(completedEvents).toEqual([
      { civId: 'player', cityId: 'city-river', wonderId: 'oracle-of-delphi' },
    ]);
  });

  it('persists completed legendary wonder ownership through turn processing', () => {
    const state = makeLegendaryWonderFixture({ oracleStepsCompleted: 2 });
    const bus = new EventBus();
    const oracle = getLegendaryWonderDefinition('oracle-of-delphi');

    state.legendaryWonderProjects!['oracle-of-delphi'].phase = 'building';
    state.cities['city-river'].productionQueue = ['legendary:oracle-of-delphi'];
    state.cities['city-river'].productionProgress = oracle!.productionCost;

    const result = processTurn(state, bus);

    expect(result.completedLegendaryWonders?.['oracle-of-delphi']).toEqual({
      ownerId: 'player',
      cityId: 'city-river',
      turnCompleted: 40,
    });
  });

  it('shuts down city production for exactly 3 turns after a cyber attack', () => {
    const state = createNewGame(undefined, 'cyber-turn-test', 'small');
    const bus = new EventBus();
    const playerCiv = state.civilizations.player;
    const startPos = state.units[playerCiv.units[0]].position;
    const city = foundCity('player', startPos, state.map, mkC());
    city.buildings = ['workshop'];
    city.productionQueue = ['worker'];
    city.productionProgress = 4;
    state.cities[city.id] = city;
    playerCiv.cities.push(city.id);
    state.cities[city.id].productionDisabledTurns = 3;

    const turn1 = processTurn(state, bus);
    expect(turn1.cities[city.id].productionProgress).toBe(4);
    expect(turn1.cities[city.id].productionDisabledTurns).toBe(2);

    const turn2 = processTurn(turn1, bus);
    expect(turn2.cities[city.id].productionProgress).toBe(4);
    expect(turn2.cities[city.id].productionDisabledTurns).toBe(1);

    const turn3 = processTurn(turn2, bus);
    expect(turn3.cities[city.id].productionDisabledTurns).toBe(0);
    expect(turn3.cities[city.id].productionProgress).toBe(4);

    const turn4 = processTurn(turn3, bus);
    expect(turn4.cities[city.id].productionProgress).toBeGreaterThan(4);
  });

  it('applies misinformation research penalties for exactly 10 turns', () => {
    const state = createNewGame(undefined, 'misinfo-turn-test', 'small');
    const bus = new EventBus();
    const playerCiv = state.civilizations.player;
    const startPos = state.units[playerCiv.units[0]].position;
    const city = foundCity('player', startPos, state.map, mkC());
    city.buildings = ['library'];
    state.cities[city.id] = city;
    playerCiv.cities.push(city.id);

    playerCiv.techState.currentResearch = 'cyber-warfare';
    playerCiv.techState.researchProgress = 0;
    playerCiv.researchPenaltyTurns = 10;
    playerCiv.researchPenaltyMultiplier = 0.2;

    const controlState = structuredClone(state);
    controlState.civilizations.player.researchPenaltyTurns = 0;
    controlState.civilizations.player.researchPenaltyMultiplier = 0;

    let next = processTurn(state, bus);
    const control = processTurn(controlState, new EventBus());
    expect(next.civilizations.player.techState.researchProgress).toBeGreaterThan(0);
    expect(control.civilizations.player.techState.researchProgress).toBeGreaterThan(
      next.civilizations.player.techState.researchProgress,
    );
    expect(next.civilizations.player.researchPenaltyTurns).toBe(9);

    for (let i = 0; i < 8; i++) {
      next = processTurn(next, bus);
    }

    expect(next.civilizations.player.researchPenaltyTurns).toBe(1);

    next = processTurn(next, bus);
    expect(next.civilizations.player.researchPenaltyTurns).toBe(0);
    expect(next.civilizations.player.researchPenaltyMultiplier).toBe(0);
  });

  it('grants Narnia alliance yield bonuses during turn processing', () => {
    const state = createNewGame(undefined, 'narnia-alliance-test', 'small');
    const bus = new EventBus();
    const playerCiv = state.civilizations.player;
    playerCiv.civType = 'narnia';
    playerCiv.gold = 0;
    playerCiv.techState.currentResearch = 'cyber-warfare';
    playerCiv.techState.researchProgress = 0;
    playerCiv.diplomacy.treaties.push({
      type: 'alliance',
      civA: 'player',
      civB: 'ai-1',
      turnsRemaining: -1,
    });

    const controlState = structuredClone(state);
    controlState.civilizations.player.civType = 'egypt';
    controlState.civilizations.player.diplomacy.treaties = [];

    const result = processTurn(state, bus);
    const control = processTurn(controlState, new EventBus());

    expect(result.civilizations.player.gold).toBeGreaterThan(control.civilizations.player.gold);
    expect(result.civilizations.player.techState.researchProgress).toBeGreaterThan(
      control.civilizations.player.techState.researchProgress,
    );
  });

  it('processTurn can still resolve a saved custom civ definition after JSON round-trip', () => {
    const state = createNewGame({
      civType: 'custom-sunfolk',
      mapSize: 'small',
      opponentCount: 1,
      gameTitle: 'Runtime Custom Civ',
      customCivilizations: [customCiv],
    });

    const roundTrip = JSON.parse(JSON.stringify(state)) as GameState;
    expect(resolveCivDefinition(roundTrip, 'custom-sunfolk')?.name).toBe('Sunfolk');
    expect(() => processTurn(roundTrip, new EventBus())).not.toThrow();
  });

  it('per-turn CI accumulates for an embedded spy each turn', () => {
    const state = createNewGame(undefined, 'ci-embed-test', 'small');
    const bus = new EventBus();

    // Player starts with a settler, not a city — found one so targetCityId is valid
    const city = foundCity('player', { q: 1, r: 0 }, state.map, mkC());
    state.cities[city.id] = city;
    state.civilizations.player.cities = [city.id];

    const cityId = city.id;
    const startCi = 10;
    state.espionage!['player'] = {
      ...state.espionage!['player']!,
      counterIntelligence: { [cityId]: startCi },
      spies: {
        'test-spy-embed': {
          id: 'test-spy-embed',
          owner: 'player',
          name: 'Test Spy',
          targetCivId: null,
          targetCityId: cityId,
          position: null,
          status: 'embedded',
          experience: 0,
          currentMission: null,
          cooldownTurns: 0,
          promotionAvailable: false,
          unitType: 'spy_scout' as UnitType,
          stolenTechFrom: {},
        },
      },
    };

    const result = processTurn(state, bus);

    const afterCi = result.espionage!['player']!.counterIntelligence[cityId] ?? 0;
    expect(afterCi).toBe(startCi + 2); // perTurnBonus = 2 + floor(0 * 0.1) = 2
  });
});
