import { EventBus } from '@/core/event-bus';
import type { GameEvents, GameMap, GameState, HexCoord, HexTile, TerrainType, Unit } from '@/core/types';
import { createUnit } from '@/systems/unit-system';
import { getVisibility } from '@/systems/fog-of-war';
import { hexKey } from '@/systems/hex-utils';
import { abandonWorkerTask, executeUnitMove } from '@/systems/unit-movement-system';
import { makeAutoExploreFixture } from './helpers/auto-explore-fixture';
import { makeEdgeMoveState } from './unit-movement-system.test-helpers';
import { createDiplomacyState } from '@/systems/diplomacy-system';

const mkC = () => ({ nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 });

function tile(coord: HexCoord, terrain: TerrainType = 'plains'): HexTile {
  return {
    coord,
    terrain,
    elevation: terrain === 'mountain' ? 'mountain' : 'lowland',
    resource: null,
    improvement: 'none',
    owner: null,
    improvementTurnsLeft: 0,
    hasRiver: false,
    wonder: null,
  };
}

function movementState(
  unit: Unit,
  tiles: HexTile[],
  options: {
    completedTechs?: string[];
    extraUnits?: Unit[];
  } = {},
): GameState {
  const map: GameMap = {
    width: 8,
    height: 8,
    wrapsHorizontally: false,
    rivers: [],
    tiles: Object.fromEntries(tiles.map(t => [hexKey(t.coord), t])),
  };
  const units = Object.fromEntries([unit, ...(options.extraUnits ?? [])].map(u => [u.id, u]));
  const civIds = Array.from(new Set(Object.values(units).map(u => u.owner)));
  return {
    turn: 1,
    era: 1,
    gameId: 'movement-validation',
    currentPlayer: unit.owner,
    gameOver: false,
    winner: null,
    map,
    units,
    cities: {},
    civilizations: Object.fromEntries(civIds.map(civId => [civId, {
      id: civId,
      name: civId,
      color: '#4a90d9',
      isHuman: civId === unit.owner,
      civType: 'generic',
      cities: [],
      units: Object.values(units).filter(u => u.owner === civId).map(u => u.id),
      techState: {
        completed: civId === unit.owner ? (options.completedTechs ?? []) : [],
        currentResearch: null,
        researchQueue: [],
        researchProgress: 0,
        trackPriorities: {} as any,
      },
      gold: 0,
      visibility: { tiles: Object.fromEntries(tiles.map(t => [hexKey(t.coord), 'visible'])) },
      knownCivilizations: [],
      score: 0,
      diplomacy: createDiplomacyState(civIds, civId),
    }])),
    barbarianCamps: {},
    minorCivs: {},
    tutorial: { active: false, currentStep: 'welcome', completedSteps: [] },
    settings: {
      mapSize: 'small',
      soundEnabled: true,
      musicEnabled: true,
      musicVolume: 0.5,
      sfxVolume: 0.7,
      tutorialEnabled: false,
      advisorsEnabled: {} as any,
      councilTalkLevel: 'normal',
    },
    tribalVillages: {},
    discoveredWonders: {},
    wonderDiscoverers: {},
    legendaryWonderHistory: { destroyedStrongholds: [], discoveredSites: [] },
    legendaryWonderIntel: {},
    embargoes: [],
    defensiveLeagues: [],
    idCounters: mkC(),
    pendingDiplomacyRequests: [],
  };
}

describe('unit-movement-system', () => {
  it('refuses to execute movement onto an occupied foreign unit tile', () => {
    const mover = createUnit('warrior', 'player', { q: 0, r: 0 }, mkC());
    mover.id = 'mover';
    const foreign = createUnit('worker', 'ai-1', { q: 1, r: 0 }, mkC());
    foreign.id = 'foreign';
    const state = movementState(mover, [
      tile({ q: 0, r: 0 }),
      tile({ q: 1, r: 0 }),
    ], { extraUnits: [foreign] });

    const result = executeUnitMove(state, 'mover', { q: 1, r: 0 }, { actor: 'player', civId: 'player' });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected occupied move to fail');
    expect(result.reason).toBe('occupied');
    expect(state.units.mover.position).toEqual({ q: 0, r: 0 });
  });

  it('refuses multi-step movement when total terrain cost exceeds movement left', () => {
    const mover = createUnit('warrior', 'player', { q: 0, r: 0 }, mkC());
    mover.id = 'mover';
    const state = movementState(mover, [
      tile({ q: 0, r: 0 }, 'plains'),
      tile({ q: 1, r: 0 }, 'hills'),
      tile({ q: 2, r: 0 }, 'hills'),
    ]);

    const result = executeUnitMove(state, 'mover', { q: 2, r: 0 }, { actor: 'player', civId: 'player' });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected costly move to fail');
    expect(result.reason).toBe('insufficient-movement');
    expect(state.units.mover.position).toEqual({ q: 0, r: 0 });
  });

  it('allows one adjacent forced march into costly passable terrain', () => {
    const mover = createUnit('warrior', 'player', { q: 0, r: 0 }, mkC());
    mover.id = 'mover';
    mover.movementPointsLeft = 1;
    const state = movementState(mover, [
      tile({ q: 0, r: 0 }, 'plains'),
      tile({ q: 1, r: 0 }, 'mountain'),
    ]);

    const result = executeUnitMove(state, 'mover', { q: 1, r: 0 }, { actor: 'player', civId: 'player' });

    expect(result.ok).toBe(true);
    expect(state.units.mover.position).toEqual({ q: 1, r: 0 });
    expect(state.units.mover.movementPointsLeft).toBe(0);
  });

  it('refuses land-unit movement into water at execution time', () => {
    const mover = createUnit('warrior', 'player', { q: 0, r: 0 }, mkC());
    mover.id = 'mover';
    const state = movementState(mover, [
      tile({ q: 0, r: 0 }, 'plains'),
      tile({ q: 1, r: 0 }, 'coast'),
    ]);

    const result = executeUnitMove(state, 'mover', { q: 1, r: 0 }, { actor: 'player', civId: 'player' });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected water move to fail');
    expect(result.reason).toBe('impassable-water');
    expect(state.units.mover.position).toEqual({ q: 0, r: 0 });
  });

  it('refuses player movement that paths through unexplored tiles at execution time', () => {
    const mover = createUnit('warrior', 'player', { q: 0, r: 0 }, mkC());
    mover.id = 'mover';
    const state = movementState(mover, [
      tile({ q: 0, r: 0 }, 'plains'),
      tile({ q: 1, r: 0 }, 'plains'),
      tile({ q: 2, r: 0 }, 'plains'),
    ]);
    state.civilizations.player.visibility.tiles['1,0'] = 'unexplored';
    state.civilizations.player.visibility.tiles['2,0'] = 'unexplored';

    const result = executeUnitMove(state, 'mover', { q: 2, r: 0 }, { actor: 'player', civId: 'player' });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected unexplored path move to fail');
    expect(result.reason).toBe('unexplored');
    expect(state.units.mover.position).toEqual({ q: 0, r: 0 });
  });

  it('gates Transport coast and ocean movement by owner tech', () => {
    const transport = createUnit('transport', 'player', { q: 0, r: 0 }, mkC());
    transport.id = 'transport';
    const tiles = [
      tile({ q: 0, r: 0 }, 'coast'),
      tile({ q: 1, r: 0 }, 'coast'),
      tile({ q: 2, r: 0 }, 'ocean'),
    ];

    const noGalleys = movementState({ ...transport }, tiles);
    expect(executeUnitMove(noGalleys, 'transport', { q: 1, r: 0 }, { actor: 'player', civId: 'player' })).toMatchObject({
      ok: false,
      reason: 'requires-galleys',
    });

    const withGalleys = movementState({ ...transport }, tiles, { completedTechs: ['galleys'] });
    expect(executeUnitMove(withGalleys, 'transport', { q: 1, r: 0 }, { actor: 'player', civId: 'player' })).toMatchObject({
      ok: true,
    });
    expect(executeUnitMove(withGalleys, 'transport', { q: 2, r: 0 }, { actor: 'player', civId: 'player' })).toMatchObject({
      ok: false,
      reason: 'requires-celestial-navigation',
    });

    const withOceanTech = movementState({ ...transport }, tiles, { completedTechs: ['galleys', 'celestial-navigation'] });
    expect(executeUnitMove(withOceanTech, 'transport', { q: 2, r: 0 }, { actor: 'player', civId: 'player' })).toMatchObject({
      ok: true,
    });
  });

  it('syncs loaded cargo positions after a Transport move', () => {
    const transport = createUnit('transport', 'player', { q: 0, r: 0 }, mkC());
    transport.id = 'transport';
    transport.cargoUnitIds = ['cargo'];
    const cargo = createUnit('warrior', 'player', { q: 0, r: 0 }, mkC());
    cargo.id = 'cargo';
    cargo.transportId = 'transport';
    const state = movementState(transport, [
      tile({ q: 0, r: 0 }, 'coast'),
      tile({ q: 1, r: 0 }, 'coast'),
    ], { completedTechs: ['galleys'], extraUnits: [cargo] });

    const result = executeUnitMove(state, 'transport', { q: 1, r: 0 }, { actor: 'player', civId: 'player' });

    expect(result.ok).toBe(true);
    expect(state.units.transport.position).toEqual({ q: 1, r: 0 });
    expect(state.units.cargo.position).toEqual({ q: 1, r: 0 });
  });

  it('applies village rewards and removes the village when automation enters it', () => {
    const { state, unitId, villageId } = makeAutoExploreFixture({ villageNorth: true, safeFogNorth: true });

    const result = executeUnitMove(state, unitId, { q: 1, r: 0 }, {
      actor: 'automation',
      civId: 'player',
      bus: new EventBus(),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected village move to succeed');
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

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected contact move to succeed');
    expect(result.revealedTiles.length).toBeGreaterThan(0);
    expect(state.civilizations.player.knownCivilizations).toContain(hiddenCivId);
  });

  it('emits first-contact when movement reveals a new civilization', () => {
    const { state, unitId, hiddenCivId } = makeAutoExploreFixture({ foreignBorderNorth: true, safeFogNorth: true });
    state.civilizations.traders.knownCivilizations = [];
    const bus = new EventBus();
    const contacts: Array<{ civA: string; civB: string }> = [];
    bus.on('civilization:first-contact', event => contacts.push(event));

    executeUnitMove(state, unitId, { q: 1, r: 0 }, {
      actor: 'player',
      civId: 'player',
      bus,
    });

    expect(contacts).toEqual([{ civA: 'player', civB: hiddenCivId }]);
  });

  it('emits wonder discovery metadata when automation reveals a wonder tile', () => {
    const { state, unitId } = makeAutoExploreFixture({ wonderNorth: 'grand_canyon', safeFogNorth: true });

    const result = executeUnitMove(state, unitId, { q: 1, r: 0 }, {
      actor: 'automation',
      civId: 'player',
      bus: new EventBus(),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected wonder move to succeed');
    expect(result.discoveredWonders).toEqual([
      expect.objectContaining({ wonderId: 'grand_canyon' }),
    ]);
  });

  it('emits wonder discovery with the revealed event coordinate for presentation wiring', () => {
    const { state, unitId } = makeAutoExploreFixture({ wonderNorth: 'grand_canyon', safeFogNorth: true });
    const target = { q: 1, r: 0 };
    const bus = new EventBus();
    const events: Array<GameEvents['wonder:discovered']> = [];
    bus.on('wonder:discovered', event => events.push(event));

    executeUnitMove(state, unitId, target, {
      actor: 'player',
      civId: 'player',
      bus,
    });

    expect(events).toContainEqual(expect.objectContaining({
      civId: 'player',
      wonderId: 'grand_canyon',
      position: target,
    }));
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
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected wrapped move to succeed');
    const revealedKeys = result.revealedTiles.map(hexKey);

    expect(result.to).toEqual({ q: 4, r: 1 });
    expect(revealedKeys).toContain('0,1');
    expect(revealedKeys.some(key => Number(key.split(',')[0]) < 0 || Number(key.split(',')[0]) >= state.map.width)).toBe(false);
    expect(getVisibility(state.civilizations.player.visibility, { q: 0, r: 1 })).toBe('visible');
    expect(fogRevealed).toHaveBeenCalledWith(expect.objectContaining({
      tiles: expect.arrayContaining([{ q: 0, r: 1 }]),
    }));
  });

  it('can abandon a busy worker task before moving', () => {
    const { state, unitId } = makeEdgeMoveState();
    state.units[unitId] = {
      ...state.units[unitId],
      type: 'worker',
      workerTask: { action: 'farm', coord: { q: 0, r: 1 } },
    };
    state.map.tiles['0,1'].improvement = 'farm';
    state.map.tiles['0,1'].improvementTurnsLeft = 3;

    abandonWorkerTask(state, unitId);

    expect(state.units[unitId].workerTask).toBeUndefined();
    expect(state.map.tiles['0,1']).toMatchObject({ improvement: 'none', improvementTurnsLeft: 0 });
  });
});
