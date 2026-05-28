import { createNewGame, createHotSeatGame, MAP_DIMENSIONS } from '@/core/game-state';
import type { CustomCivDefinition, GameState, HexCoord, HotSeatConfig, MapScript, ResourceType } from '@/core/types';
import { getMinimumStartDistance, getStartPositionDistance } from '@/systems/map-generator';
import { RESOURCE_DEFINITIONS } from '@/systems/trade-system';
import { getWrappedHexesInRange, hexKey } from '@/systems/hex-utils';

const customCiv: CustomCivDefinition = {
  id: 'custom-sunfolk',
  name: 'Sunfolk',
  color: '#d9a441',
  leaderName: 'Aurelia',
  cityNames: ['Solara', 'Embergate', 'Sunspire', 'Goldmere', 'Dawnwatch', 'Auric'],
  primaryTrait: 'scholarly',
  temperamentTraits: ['diplomatic', 'trader'],
};

function getMajorSettlerStarts(state: GameState): HexCoord[] {
  return Object.values(state.units)
    .filter(unit => unit.type === 'settler' && !unit.owner.startsWith('mc-'))
    .map(unit => unit.position);
}

function expectMajorStartsToRespectSpacing(state: GameState): void {
  const starts = getMajorSettlerStarts(state);
  const minimumDistance = getMinimumStartDistance(state.map);

  for (let i = 0; i < starts.length; i++) {
    for (let j = i + 1; j < starts.length; j++) {
      expect(getStartPositionDistance(state.map, starts[i], starts[j])).toBeGreaterThanOrEqual(minimumDistance);
    }
  }
}

const LUXURY_IDS = new Set<ResourceType>(
  RESOURCE_DEFINITIONS.filter(def => def.type === 'luxury').map(def => def.id),
);
const STRATEGIC_IDS = new Set<ResourceType>(
  RESOURCE_DEFINITIONS.filter(def => def.type === 'strategic').map(def => def.id),
);

function getStartingSettlerByOwner(state: GameState, owner: string): HexCoord {
  const settler = Object.values(state.units).find(unit => unit.owner === owner && unit.type === 'settler');
  expect(settler, `expected starting Settler for ${owner}`).toBeDefined();
  return settler!.position;
}

function expectResourceTypeNearStart(
  state: GameState,
  start: HexCoord,
  resourceIds: Set<ResourceType>,
): void {
  const hasResource = getWrappedHexesInRange(start, 5, state.map.width).some(coord => {
    const resource = state.map.tiles[hexKey(coord)]?.resource;
    return resource !== null && resource !== undefined && resourceIds.has(resource as ResourceType);
  });
  expect(hasResource, `expected resource within radius 5 of ${hexKey(start)}`).toBe(true);
}

function expectAllMajorStartsHaveGuaranteedResources(state: GameState): void {
  for (const civId of Object.keys(state.civilizations)) {
    const start = getStartingSettlerByOwner(state, civId);
    expectResourceTypeNearStart(state, start, LUXURY_IDS);
    expectResourceTypeNearStart(state, start, STRATEGIC_IDS);
  }
}

describe('createNewGame', () => {
  it('creates a valid initial game state', () => {
    const state = createNewGame(undefined, 'test-seed');

    expect(state.turn).toBe(1);
    expect(state.era).toBe(1);
    expect(state.gameOver).toBe(false);

    // Should have player civ and AI civ
    const civs = Object.values(state.civilizations);
    expect(civs.length).toBe(2);
    expect(civs.filter(c => c.isHuman).length).toBe(1);
    expect(civs.filter(c => !c.isHuman).length).toBe(1);
  });

  it('gives each civ starting units', () => {
    const state = createNewGame(undefined, 'test-seed');
    const units = Object.values(state.units);
    expect(units.length).toBeGreaterThanOrEqual(4);
  });

  it('generates a map', () => {
    const state = createNewGame(undefined, 'test-seed');
    expect(state.map.width).toBe(30);
    expect(state.map.height).toBe(30);
    expect(Object.keys(state.map.tiles).length).toBe(900);
  });

  it('places barbarian camps', () => {
    const state = createNewGame(undefined, 'test-seed');
    expect(Object.keys(state.barbarianCamps).length).toBeGreaterThanOrEqual(1);
  });

  it('initializes idCounters and they reflect the number of entities created', () => {
    const state = createNewGame(undefined, 'test-seed');
    // counters must be present
    expect(state.idCounters).toBeDefined();

    // Each nextX counter must be strictly greater than the highest entity id of that type
    const maxUnitId = Math.max(
      0,
      ...Object.keys(state.units)
        .map(id => { const m = /^unit-(\d+)$/.exec(id); return m ? +m[1] : 0; }),
    );
    const maxCityId = Math.max(
      0,
      ...Object.keys(state.cities)
        .map(id => { const m = /^city-(\d+)$/.exec(id); return m ? +m[1] : 0; }),
    );
    const maxCampId = Math.max(
      0,
      ...Object.keys(state.barbarianCamps)
        .map(id => { const m = /^camp-(\d+)$/.exec(id); return m ? +m[1] : 0; }),
    );
    expect(state.idCounters.nextUnitId).toBeGreaterThan(maxUnitId);
    expect(state.idCounters.nextCityId).toBeGreaterThan(maxCityId);
    expect(state.idCounters.nextCampId).toBeGreaterThan(maxCampId);
  });

  it('initializes tutorial state', () => {
    const state = createNewGame(undefined, 'test-seed');
    expect(state.tutorial.active).toBe(true);
    expect(state.tutorial.currentStep).toBe('welcome');
  });

  it('creates civilizations with civType and diplomacy', () => {
    const state = createNewGame('egypt', 'test-seed');
    expect(state.civilizations.player.civType).toBe('egypt');
    expect(state.civilizations.player.diplomacy).toBeDefined();
    expect(state.civilizations.player.diplomacy.relationships).toHaveProperty('ai-1');
    expect(state.civilizations['ai-1'].civType).not.toBe('egypt');
    expect(state.civilizations['ai-1'].diplomacy).toBeDefined();
  });

  it('applies Greece diplomacy start bonus', () => {
    const state = createNewGame('greece', 'test-seed');
    expect(state.civilizations.player.diplomacy.relationships['ai-1']).toBe(20);
  });

  it('defaults to generic civType when no civType provided', () => {
    const state = createNewGame(undefined, 'test-seed');
    expect(state.civilizations.player.civType).toBe('generic');
  });

  it('createNewGame accepts mapSize parameter', () => {
    const state = createNewGame(undefined, 'test-seed', 'medium');
    expect(state.map.width).toBe(50);
    expect(state.map.height).toBe(50);
    expect(state.settings.mapSize).toBe('medium');
  });

  it('stores a caller-supplied campaign title and game id for solo games', () => {
    const state = createNewGame('egypt', 'title-seed', 'small', 'Rise of the Nile');
    expect(state.gameTitle).toBe('Rise of the Nile');
    expect(state.gameId).toMatch(/^game-/);
  });

  it('passes the chosen title into object-based createNewGame config', () => {
    const state = createNewGame({
      civType: 'rome',
      seed: 'seed-1',
      mapSize: 'medium',
      opponentCount: 3,
      gameTitle: 'Wife Test Campaign',
    });

    expect(state.gameTitle).toBe('Wife Test Campaign');
    expect(state.settings.mapSize).toBe('medium');
    expect(Object.keys(state.civilizations)).toHaveLength(4);
  });

  it('can seed a new campaign from persisted app settings without re-listing defaults', () => {
    const state = createNewGame({
      civType: 'rome',
      mapSize: 'small',
      opponentCount: 1,
      gameTitle: 'Quiet Council',
      settingsOverrides: {
        councilTalkLevel: 'quiet',
      },
    });

    expect(state.settings.councilTalkLevel).toBe('quiet');
  });

  it('initializes pending diplomacy requests for new solo games', () => {
    const state = createNewGame(undefined, 'pending-diplomacy-seed');

    expect(state.pendingDiplomacyRequests).toEqual([]);
  });

  it('createNewGame can start from a saved custom civ registry', () => {
    const state = createNewGame({
      civType: 'custom-sunfolk',
      mapSize: 'small',
      opponentCount: 1,
      gameTitle: 'Custom Civ Test',
      customCivilizations: [customCiv],
    });

    expect(state.civilizations.player.civType).toBe('custom-sunfolk');
    expect(state.civilizations.player.name).toBe('Sunfolk');
  });

  it('AI opponents can be assigned Wakanda or Avalon from the playable civ pool', () => {
    const aiCivTypes = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const state = createNewGame({
        civType: 'rome',
        mapSize: 'small',
        opponentCount: 3,
        gameTitle: `AI Pool Test ${i}`,
        seed: `ai-pool-${i}`,
      });
      for (const [civId, civ] of Object.entries(state.civilizations)) {
        if (civId !== 'player') aiCivTypes.add(civ.civType);
      }
    }
    expect(aiCivTypes.has('wakanda') || aiCivTypes.has('avalon')).toBe(true);
  });

  it('spaces solo major civilizations by wrapped distance so rivals cannot start next door', () => {
    const state = createNewGame({
      civType: 'germany',
      seed: 'issue-172-germany-greece-wrap',
      mapSize: 'small',
      opponentCount: 2,
      gameTitle: 'Issue 172 Regression',
    });

    expectMajorStartsToRespectSpacing(state);
  });

  it('guarantees luxury and strategic resources near each major civ start', () => {
    const state = createNewGame({
      civType: 'egypt',
      seed: 'resource-red-solo-4',
      mapSize: 'small',
      opponentCount: 2,
      mapScript: 'procedural',
      gameTitle: 'Resource Guarantee Solo',
    });

    expectAllMajorStartsHaveGuaranteedResources(state);
  });
});

describe('minor civ integration', () => {
  it('createNewGame places minor civs on medium map', () => {
    const state = createNewGame(undefined, 'mc-integration', 'medium');
    expect(Object.keys(state.minorCivs).length).toBeGreaterThanOrEqual(4);
    for (const mc of Object.values(state.minorCivs)) {
      expect(state.cities[mc.cityId]).toBeDefined();
      expect(state.cities[mc.cityId].owner).toMatch(/^mc-/);
    }
  });

  it('createHotSeatGame places minor civs', () => {
    const config: HotSeatConfig = {
      playerCount: 2,
      mapSize: 'medium' as const,
      players: [
        { name: 'Alice', slotId: 'slot-0', civType: 'egypt' as any, isHuman: true },
        { name: 'Bob', slotId: 'slot-1', civType: 'rome' as any, isHuman: true },
      ],
    };
    const state = createHotSeatGame(config, 'mc-hotseat');
    expect(Object.keys(state.minorCivs).length).toBeGreaterThanOrEqual(2);
  });
});

describe('createHotSeatGame', () => {
  const config: HotSeatConfig = {
    playerCount: 3,
    mapSize: 'medium',
    players: [
      { name: 'Alice', slotId: 'player-1', civType: 'egypt', isHuman: true },
      { name: 'Bob', slotId: 'player-2', civType: 'rome', isHuman: true },
      { name: 'AI Greece', slotId: 'ai-1', civType: 'greece', isHuman: false },
    ],
  };

  it('creates correct number of civs', () => {
    const state = createHotSeatGame(config, 'hs-test');
    expect(Object.keys(state.civilizations)).toHaveLength(3);
    expect(state.hotSeat).toBeDefined();
    expect(state.hotSeat!.playerCount).toBe(3);
    expect(state.currentPlayer).toBe('player-1');
    expect(state.civilizations['player-1'].civType).toBe('egypt');
    expect(state.civilizations['ai-1'].isHuman).toBe(false);
    expect(state.map.width).toBe(50);
  });

  it('disables tutorial for hot seat games', () => {
    const state = createHotSeatGame(config, 'hs-test');
    expect(state.tutorial.active).toBe(false);
    expect(state.settings.tutorialEnabled).toBe(false);
  });

  it('initializes pending events', () => {
    const state = createHotSeatGame(config, 'hs-test');
    expect(state.pendingEvents).toEqual({});
  });

  it('initializes idCounters reflecting entities created during hot seat setup', () => {
    const state = createHotSeatGame(config, 'hs-idcounters');
    expect(state.idCounters).toBeDefined();

    const maxUnitId = Math.max(
      0,
      ...Object.keys(state.units)
        .map(id => { const m = /^unit-(\d+)$/.exec(id); return m ? +m[1] : 0; }),
    );
    const maxCityId = Math.max(
      0,
      ...Object.keys(state.cities)
        .map(id => { const m = /^city-(\d+)$/.exec(id); return m ? +m[1] : 0; }),
    );
    expect(state.idCounters.nextUnitId).toBeGreaterThan(maxUnitId);
    expect(state.idCounters.nextCityId).toBeGreaterThan(maxCityId);
  });

  it('stores a caller-supplied campaign title and game id for hot seat games', () => {
    const state = createHotSeatGame(config, 'hs-title', 'Friends Campaign');
    expect(state.gameTitle).toBe('Friends Campaign');
    expect(state.gameId).toMatch(/^game-/);
  });

  it('initializes pending diplomacy requests for hot seat games', () => {
    const state = createHotSeatGame(config, 'hs-pending-diplomacy');

    expect(state.pendingDiplomacyRequests).toEqual([]);
  });

  it('spaces hot-seat major civilizations by wrapped distance at the selected map limit', () => {
    const state = createHotSeatGame({
      playerCount: 3,
      mapSize: 'small',
      players: [
        { name: 'Germany', slotId: 'player-1', civType: 'germany', isHuman: true },
        { name: 'Greece', slotId: 'player-2', civType: 'greece', isHuman: true },
        { name: 'Rome', slotId: 'ai-1', civType: 'rome', isHuman: false },
      ],
    }, 'issue-172-hotseat-wrap');

    expectMajorStartsToRespectSpacing(state);
  });

  it('guarantees luxury and strategic resources near each hot-seat civ start', () => {
    const state = createHotSeatGame({
      playerCount: 3,
      mapSize: 'small',
      players: [
        { name: 'Alice', slotId: 'player-1', civType: 'egypt', isHuman: true },
        { name: 'Bob', slotId: 'player-2', civType: 'rome', isHuman: true },
        { name: 'AI Greece', slotId: 'ai-1', civType: 'greece', isHuman: false },
      ],
      mapScript: 'procedural',
    }, 'resource-red-hotseat-2');

    expectAllMajorStartsHaveGuaranteedResources(state);
  });
});

describe('createHotSeatGame — mapScript', () => {
  const baseConfig: HotSeatConfig = {
    playerCount: 2,
    mapSize: 'small',
    players: [
      { name: 'Alice', slotId: 'player-1', civType: 'egypt', isHuman: true },
      { name: 'Bob',   slotId: 'player-2', civType: 'rome',  isHuman: true },
    ],
  };

  it('defaults to procedural when mapScript is omitted', () => {
    const state = createHotSeatGame(baseConfig, 'seed-proc');
    expect(state.mapScript).toBe('procedural');
  });

  it('stores the mapScript from config on the returned state — regression guard', () => {
    // If HotSeatConfig ever loses mapScript this test will stop compiling or fail at runtime.
    const scripts: MapScript[] = [
      'procedural', 'earth', 'old-world', 'new-world', 'balanced', 'single-continent',
    ];
    for (const script of scripts) {
      const state = createHotSeatGame({ ...baseConfig, mapScript: script }, 'seed-' + script);
      expect(state.mapScript).toBe(script);
    }
  });

  it('generates a small map for the balanced script', () => {
    const state = createHotSeatGame({ ...baseConfig, mapScript: 'balanced' }, 'seed-bal');
    expect(state.map.width).toBe(30);
    expect(state.map.height).toBe(30);
    expect(state.mapScript).toBe('balanced');
  });

  it('generates a small map for the single-continent script', () => {
    const state = createHotSeatGame({ ...baseConfig, mapScript: 'single-continent' }, 'seed-sc');
    expect(state.map.width).toBe(30);
    expect(state.mapScript).toBe('single-continent');
  });

  it('generates a small map for the earth script', () => {
    const state = createHotSeatGame({ ...baseConfig, mapScript: 'earth' }, 'seed-earth');
    expect(state.map.width).toBe(30);
    expect(state.mapScript).toBe('earth');
  });
});
