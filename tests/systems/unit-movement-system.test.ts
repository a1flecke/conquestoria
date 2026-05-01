import { EventBus } from '@/core/event-bus';
import type { GameMap, GameState, Unit } from '@/core/types';
import { createDiplomacyState } from '@/systems/diplomacy-system';
import { getVisibility } from '@/systems/fog-of-war';
import { hexKey } from '@/systems/hex-utils';
import { executeUnitMove } from '@/systems/unit-movement-system';
import { makeAutoExploreFixture } from './helpers/auto-explore-fixture';

function createWrappedGrasslandMap(width: number, height: number): GameMap {
  const tiles: GameMap['tiles'] = {};
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

function makeEdgeMoveState(): { state: GameState; unitId: string } {
  const map = createWrappedGrasslandMap(5, 4);
  const unit: Unit = {
    id: 'edge-warrior',
    type: 'warrior',
    owner: 'player',
    position: { q: 0, r: 1 },
    movementPointsLeft: 2,
    health: 100,
    experience: 0,
    hasMoved: false,
    hasActed: false,
    isResting: false,
  };

  const state = {
    turn: 1,
    era: 1,
    currentPlayer: 'player',
    gameOver: false,
    winner: null,
    map,
    units: { [unit.id]: unit },
    cities: {},
    civilizations: {
      player: {
        id: 'player',
        name: 'Player',
        color: '#4a90d9',
        isHuman: true,
        civType: 'generic',
        cities: [],
        units: [unit.id],
        techState: { completed: [], currentResearch: null, researchProgress: 0, researchQueue: [], trackPriorities: {} },
        gold: 0,
        visibility: { tiles: { '4,1': 'visible' } },
        knownCivilizations: [],
        score: 0,
        diplomacy: createDiplomacyState(['player'], 'player'),
      },
    },
    barbarianCamps: {},
    minorCivs: {},
    tutorial: { active: false, currentStep: 'complete', completedSteps: [] },
    settings: { mapSize: 'small', soundEnabled: false, musicEnabled: false, musicVolume: 0, sfxVolume: 0, tutorialEnabled: false, advisorsEnabled: {}, councilTalkLevel: 'normal' },
    tribalVillages: {},
    discoveredWonders: {},
    wonderDiscoverers: {},
    embargoes: [],
    defensiveLeagues: [],
  } as unknown as GameState;

  return { state, unitId: unit.id };
}

describe('unit-movement-system', () => {
  it('applies village rewards and removes the village when automation enters it', () => {
    const { state, unitId, villageId } = makeAutoExploreFixture({ villageNorth: true, safeFogNorth: true });

    const result = executeUnitMove(state, unitId, { q: 1, r: 0 }, {
      actor: 'automation',
      civId: 'player',
      bus: new EventBus(),
    });

    expect(result.villageOutcome?.outcome).toBeDefined();
    expect(villageId).toBeDefined();
    expect(state.tribalVillages[villageId!]).toBeUndefined();
  });

  it('refreshes visibility and civilization contacts after an automated move', () => {
    const { state, unitId, hiddenCivId } = makeAutoExploreFixture({ foreignBorderNorth: true, safeFogNorth: true });

    const result = executeUnitMove(state, unitId, { q: 1, r: 0 }, {
      actor: 'automation',
      civId: 'player',
      bus: new EventBus(),
    });

    expect(result.revealedTiles.length).toBeGreaterThan(0);
    expect(state.civilizations.player.knownCivilizations).toContain(hiddenCivId);
  });

  it('emits wonder discovery metadata when automation reveals a wonder tile', () => {
    const { state, unitId } = makeAutoExploreFixture({ wonderNorth: 'grand_canyon', safeFogNorth: true });

    const result = executeUnitMove(state, unitId, { q: 1, r: 0 }, {
      actor: 'automation',
      civId: 'player',
      bus: new EventBus(),
    });

    expect(result.discoveredWonders).toEqual([
      expect.objectContaining({ wonderId: 'grand_canyon' }),
    ]);
  });

  it('returns canonical wrapped revealed tiles after moving through the seam', () => {
    const { state, unitId } = makeEdgeMoveState();
    const bus = new EventBus();
    const fogRevealed = vi.fn();
    bus.on('fog:revealed', fogRevealed);

    const result = executeUnitMove(state, unitId, { q: 4, r: 1 }, {
      actor: 'player',
      civId: 'player',
      bus,
    });
    const revealedKeys = result.revealedTiles.map(hexKey);

    expect(result.to).toEqual({ q: 4, r: 1 });
    expect(revealedKeys).toContain('0,1');
    expect(revealedKeys.some(key => Number(key.split(',')[0]) < 0 || Number(key.split(',')[0]) >= state.map.width)).toBe(false);
    expect(getVisibility(state.civilizations.player.visibility, { q: 0, r: 1 })).toBe('visible');
    expect(fogRevealed).toHaveBeenCalledWith(expect.objectContaining({
      tiles: expect.arrayContaining([{ q: 0, r: 1 }]),
    }));
  });
});
