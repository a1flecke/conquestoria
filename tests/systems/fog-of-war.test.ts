import { createVisibilityMap, updateVisibility, isVisible, isFog, isUnexplored, getTerrainVisionBonus, revealMinorCivCities, applySharedVision, applySatelliteSurveillance, isForestConcealedUnit } from '@/systems/fog-of-war';
import type { VisibilityMap, GameMap, Unit, GameState } from '@/core/types';
import { generateMap } from '@/systems/map-generator';
import { hexKey } from '@/systems/hex-utils';

describe('fog-of-war', () => {
  let map: GameMap;
  let vis: VisibilityMap;

  beforeEach(() => {
    map = generateMap(30, 30, 'fog-test');
    vis = createVisibilityMap();
  });

  it('starts fully unexplored', () => {
    expect(isUnexplored(vis, { q: 10, r: 10 })).toBe(true);
    expect(isVisible(vis, { q: 10, r: 10 })).toBe(false);
  });

  it('reveals tiles around a unit', () => {
    const unit: Unit = {
      id: 'u1', type: 'scout', owner: 'p1',
      position: { q: 15, r: 15 }, movementPointsLeft: 3,
      health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false,
    };

    const revealed = updateVisibility(vis, [unit], map);
    expect(isVisible(vis, { q: 15, r: 15 })).toBe(true);
    expect(revealed.length).toBeGreaterThan(0);
  });

  it('scout has larger vision than warrior', () => {
    const scout: Unit = {
      id: 'u1', type: 'scout', owner: 'p1',
      position: { q: 15, r: 15 }, movementPointsLeft: 3,
      health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false,
    };
    const warrior: Unit = {
      id: 'u2', type: 'warrior', owner: 'p1',
      position: { q: 15, r: 15 }, movementPointsLeft: 2,
      health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false,
    };

    const visScout = createVisibilityMap();
    const visWarrior = createVisibilityMap();

    const scoutRevealed = updateVisibility(visScout, [scout], map);
    const warriorRevealed = updateVisibility(visWarrior, [warrior], map);

    expect(scoutRevealed.length).toBeGreaterThan(warriorRevealed.length);
  });

  it('previously visible tiles become fog when unit moves away', () => {
    const unit: Unit = {
      id: 'u1', type: 'scout', owner: 'p1',
      position: { q: 15, r: 15 }, movementPointsLeft: 3,
      health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false,
    };

    updateVisibility(vis, [unit], map);
    expect(isVisible(vis, { q: 15, r: 15 })).toBe(true);

    // Move unit far away
    unit.position = { q: 1, r: 1 };
    updateVisibility(vis, [unit], map);

    // Old position should be fog (seen before but no longer visible)
    expect(isFog(vis, { q: 15, r: 15 })).toBe(true);
    expect(isVisible(vis, { q: 15, r: 15 })).toBe(false);
  });
});

describe('new terrain vision', () => {
  it('jungle has -1 vision penalty', () => {
    expect(getTerrainVisionBonus('jungle')).toBe(-1);
  });

  it('swamp has no vision bonus', () => {
    expect(getTerrainVisionBonus('swamp')).toBe(0);
  });
});

describe('minor civ visibility', () => {
  it('reveals minor civ city when nearby tile explored', () => {
    const vis = createVisibilityMap();
    const mcCityPos = { q: 10, r: 10 };
    // Explore a tile within 2 hexes
    vis.tiles['11,10'] = 'fog';

    revealMinorCivCities(vis, [mcCityPos]);
    expect(vis.tiles[hexKey(mcCityPos)]).toBe('visible');
  });

  it('does not reveal distant minor civ city', () => {
    const vis = createVisibilityMap();
    const mcCityPos = { q: 10, r: 10 };
    // Explore tile far away
    vis.tiles['20,20'] = 'fog';

    revealMinorCivCities(vis, [mcCityPos]);
    expect(vis.tiles[hexKey(mcCityPos)]).toBeUndefined();
  });

  it('adds shared vision for friendly minor civ', () => {
    const vis = createVisibilityMap();
    const friendlyUnitPositions = [{ q: 15, r: 15 }];
    const map = { tiles: {}, width: 30, height: 30 } as any;
    for (let q = 13; q <= 17; q++) {
      for (let r = 13; r <= 17; r++) {
        map.tiles[`${q},${r}`] = { coord: { q, r }, terrain: 'grassland' };
      }
    }

    applySharedVision(vis, friendlyUnitPositions, map);
    expect(vis.tiles['15,15']).toBe('visible');
  });
});

describe('satellite surveillance', () => {
  function makeSatelliteVisionFixture(): GameState {
    return {
      turn: 20,
      era: 5,
      currentPlayer: 'player',
      gameOver: false,
      winner: null,
      map: {
        width: 12,
        height: 12,
        wrapsHorizontally: false,
        rivers: [],
        tiles: {
          '5,5': { coord: { q: 5, r: 5 }, terrain: 'grassland', elevation: 'lowland', resource: null, improvement: 'none', owner: 'ai-1', improvementTurnsLeft: 0, hasRiver: false, wonder: null },
          '5,6': { coord: { q: 5, r: 6 }, terrain: 'grassland', elevation: 'lowland', resource: null, improvement: 'none', owner: 'ai-1', improvementTurnsLeft: 0, hasRiver: false, wonder: null },
          '0,0': { coord: { q: 0, r: 0 }, terrain: 'grassland', elevation: 'lowland', resource: null, improvement: 'none', owner: 'player', improvementTurnsLeft: 0, hasRiver: false, wonder: null },
        },
      },
      units: {},
      cities: {},
      civilizations: {
        player: {
          id: 'player',
          name: 'Player',
          color: '#4a90d9',
          isHuman: true,
          civType: 'generic',
          cities: [],
          units: [],
          techState: { completed: [], currentResearch: null, researchProgress: 0, trackPriorities: {} as any },
          gold: 0,
          visibility: createVisibilityMap(),
          score: 0,
          diplomacy: {} as any,
        },
        'ai-1': {
          id: 'ai-1',
          name: 'AI',
          color: '#c4a94d',
          isHuman: false,
          civType: 'generic',
          cities: [],
          units: [],
          techState: { completed: [], currentResearch: null, researchProgress: 0, trackPriorities: {} as any },
          gold: 0,
          visibility: createVisibilityMap(),
          score: 0,
          diplomacy: {} as any,
        },
      },
      barbarianCamps: {},
      minorCivs: {},
      tutorial: { active: false, currentStep: 'complete', completedSteps: [] },
      settings: { mapSize: 'small', soundEnabled: false, musicEnabled: false, musicVolume: 0, sfxVolume: 0, tutorialEnabled: false, advisorsEnabled: {} as any, councilTalkLevel: 'normal' },
      tribalVillages: {},
      discoveredWonders: {},
      wonderDiscoverers: {},
      embargoes: [],
      defensiveLeagues: [],
    } as GameState;
  }

  it('satellite surveillance grants territory vision without permanently mutating base visibility rules', () => {
    const state = makeSatelliteVisionFixture();
    const result = applySatelliteSurveillance(state, 'player', 'ai-1');
    expect(result.civilizations.player.visibility.tiles['5,5']).toBe('visible');
    expect(result.civilizations.player.visibility.tiles['5,6']).toBe('visible');

    const freshVisibility = createVisibilityMap();
    expect(freshVisibility.tiles['5,5']).toBeUndefined();
  });
});

describe('forest concealment', () => {
  it('conceals Lothlorien units in forest unless the viewer has adjacent contact', () => {
    const state = {
      turn: 1,
      era: 1,
      currentPlayer: 'player',
      gameOver: false,
      winner: null,
      map: {
        width: 10,
        height: 10,
        wrapsHorizontally: false,
        rivers: [],
        tiles: {
          '4,4': { coord: { q: 4, r: 4 }, terrain: 'forest', elevation: 'lowland', resource: null, improvement: 'none', owner: 'ai-1', improvementTurnsLeft: 0, hasRiver: false, wonder: null },
          '2,2': { coord: { q: 2, r: 2 }, terrain: 'grassland', elevation: 'lowland', resource: null, improvement: 'none', owner: 'player', improvementTurnsLeft: 0, hasRiver: false, wonder: null },
          '4,5': { coord: { q: 4, r: 5 }, terrain: 'grassland', elevation: 'lowland', resource: null, improvement: 'none', owner: 'player', improvementTurnsLeft: 0, hasRiver: false, wonder: null },
        },
      },
      units: {
        hidden: { id: 'hidden', type: 'warrior', owner: 'ai-1', position: { q: 4, r: 4 }, movementPointsLeft: 2, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false },
        scout: { id: 'scout', type: 'scout', owner: 'player', position: { q: 2, r: 2 }, movementPointsLeft: 3, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false },
      },
      cities: {},
      civilizations: {
        player: { id: 'player', civType: 'egypt', units: ['scout'], cities: [], visibility: createVisibilityMap(), techState: { completed: [], currentResearch: null, researchProgress: 0, trackPriorities: {} as any }, gold: 0, score: 0, isHuman: true, name: 'Player', color: '#4a90d9', diplomacy: {} as any },
        'ai-1': { id: 'ai-1', civType: 'lothlorien', units: ['hidden'], cities: [], visibility: createVisibilityMap(), techState: { completed: [], currentResearch: null, researchProgress: 0, trackPriorities: {} as any }, gold: 0, score: 0, isHuman: false, name: 'Lothlorien', color: '#4d7c0f', diplomacy: {} as any },
      },
      barbarianCamps: {},
      minorCivs: {},
      tutorial: { active: false, currentStep: 'complete', completedSteps: [] },
      settings: { mapSize: 'small', soundEnabled: false, musicEnabled: false, musicVolume: 0, sfxVolume: 0, tutorialEnabled: false, advisorsEnabled: {} as any, councilTalkLevel: 'normal' },
      tribalVillages: {},
      discoveredWonders: {},
      wonderDiscoverers: {},
      embargoes: [],
      defensiveLeagues: [],
    } as GameState;

    expect(isForestConcealedUnit(state, 'player', state.units.hidden)).toBe(true);

    state.units.scout.position = { q: 4, r: 5 };
    expect(isForestConcealedUnit(state, 'player', state.units.hidden)).toBe(false);
  });
});
