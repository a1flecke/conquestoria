import { EventBus } from '@/core/event-bus';
import type { GameEvents, GameMap, GameState, HexCoord, HexTile, TerrainType, Unit } from '@/core/types';
import { createUnit } from '@/systems/unit-system';
import { foundCity } from '@/systems/city-system';
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
  it('ends movement after a legal zone-of-control entry', () => {
    const mover = { ...createUnit('warrior', 'player', { q: 0, r: 0 }, mkC()), id: 'mover', movementPointsLeft: 2 };
    const enemy = { ...createUnit('warrior', 'ai-1', { q: 2, r: -1 }, mkC()), id: 'enemy' };
    const state = movementState(mover, [tile({ q: 0, r: 0 }), tile({ q: 1, r: 0 }), tile({ q: 2, r: -1 })], { extraUnits: [enemy] });
    state.civilizations.player.diplomacy.atWarWith = ['ai-1'];

    expect(executeUnitMove(state, mover.id, { q: 1, r: 0 }, { actor: 'player', civId: 'player' })).toMatchObject({
      ok: true,
      stopReason: 'zone-of-control',
    });
    expect(state.units[mover.id].movementPointsLeft).toBe(0);
  });

  it('stops a multi-step move at the first zone-of-control entry', () => {
    const mover = { ...createUnit('warrior', 'player', { q: 0, r: 0 }, mkC()), id: 'mover', movementPointsLeft: 2 };
    const enemy = { ...createUnit('warrior', 'ai-1', { q: 2, r: -1 }, mkC()), id: 'enemy' };
    const state = movementState(mover, [
      tile({ q: 0, r: 0 }), tile({ q: 1, r: 0 }), tile({ q: 2, r: 0 }), tile({ q: 2, r: -1 }),
    ], { extraUnits: [enemy] });
    state.civilizations.player.diplomacy.atWarWith = ['ai-1'];

    const result = executeUnitMove(state, mover.id, { q: 2, r: 0 }, { actor: 'player', civId: 'player' });

    expect(result).toMatchObject({ ok: true, to: { q: 1, r: 0 }, stopReason: 'zone-of-control' });
    expect(state.units[mover.id].position).toEqual({ q: 1, r: 0 });
  });

  it('moves world actors without civilization discovery consequences', () => {
    const mover = createUnit('warrior', 'barbarian', { q: 0, r: 0 }, mkC());
    mover.id = 'world-mover';
    const state = movementState(mover, [
      tile({ q: 0, r: 0 }),
      { ...tile({ q: 1, r: 0 }), wonder: 'grand_canyon' },
    ]);
    delete state.civilizations.barbarian;
    const villageId = 'village-world';
    state.tribalVillages[villageId] = {
      id: villageId,
      position: { q: 1, r: 0 },
    } as never;
    const beforeWonders = structuredClone(state.discoveredWonders);
    const moves: Array<GameEvents['unit:move']> = [];
    const contacts: Array<GameEvents['civilization:first-contact']> = [];
    const bus = new EventBus();
    bus.on('unit:move', event => moves.push(event));
    bus.on('civilization:first-contact', event => contacts.push(event));

    const result = executeUnitMove(
      state,
      mover.id,
      { q: 1, r: 0 },
      { actor: 'world', bus },
    );

    expect(result).toMatchObject({
      ok: true,
      revealedTiles: [],
      discoveredWonders: [],
    });
    expect(state.units[mover.id].position).toEqual({ q: 1, r: 0 });
    expect(state.tribalVillages[villageId]).toBeDefined();
    expect(state.discoveredWonders).toEqual(beforeWonders);
    expect(contacts).toEqual([]);
    expect(moves).toHaveLength(1);
  });

  it('cancels a Cyber Exploit when live movement breaks its range', () => {
    const cyber = createUnit('cyber_unit', 'player', { q: 1, r: 0 }, mkC());
    cyber.id = 'unit-cyber';
    const state = movementState(cyber, [tile({ q: 0, r: 0 }), tile({ q: 1, r: 0 }), tile({ q: 2, r: 0 })], {
      completedTechs: ['quantum-computing'],
    });
    const target = foundCity('ai-1', { q: 0, r: 0 }, state.map, state.idCounters);
    target.id = 'city-ai';
    state.cities[target.id] = target;
    state.civilizations['ai-1'] = {
      ...state.civilizations.player,
      id: 'ai-1',
      name: 'ai-1',
      isHuman: false,
      cities: [target.id],
      units: [],
      diplomacy: createDiplomacyState(['player', 'ai-1'], 'ai-1'),
    };
    state.civilizations.player.diplomacy = createDiplomacyState(['player', 'ai-1'], 'player');
    state.civilizations.player.diplomacy.atWarWith = ['ai-1'];
    state.civilizations['ai-1'].diplomacy.atWarWith = ['player'];
    state.autonomyByCiv = {
      player: {
        plans: {
          'network-plan-1': {
            id: 'network-plan-1', ownerCivId: 'player', definitionId: 'exploit', sourceUnitId: cyber.id,
            target: { kind: 'city', cityId: target.id }, status: 'preparing', createdTurn: 1, nextResolutionTurn: 2, warnedTurn: null,
          },
        },
        detections: {},
      },
      'ai-1': { plans: {}, detections: {} },
    };

    expect(executeUnitMove(state, cyber.id, { q: 2, r: 0 }, { actor: 'player', civId: 'player' })).toMatchObject({ ok: true });
    expect(state.autonomyByCiv.player.plans).toEqual({});
  });

  it('does not let world actors bypass occupancy', () => {
    const mover = createUnit('warrior', 'barbarian', { q: 0, r: 0 }, mkC());
    mover.id = 'world-mover';
    const blocker = createUnit('worker', 'player', { q: 1, r: 0 }, mkC());
    blocker.id = 'blocker';
    const state = movementState(mover, [
      tile({ q: 0, r: 0 }),
      tile({ q: 1, r: 0 }),
    ], { extraUnits: [blocker] });
    delete state.civilizations.barbarian;

    expect(executeUnitMove(
      state,
      mover.id,
      blocker.position,
      { actor: 'world' },
    )).toMatchObject({ ok: false, reason: 'occupied' });
    expect(state.units[mover.id].position).toEqual({ q: 0, r: 0 });
  });

  it('does not let world actors path through an occupied intermediate tile', () => {
    const mover = createUnit('warrior', 'barbarian', { q: 0, r: 0 }, mkC());
    mover.id = 'world-mover';
    mover.movementPointsLeft = 3;
    const blocker = createUnit('worker', 'player', { q: 1, r: 0 }, mkC());
    blocker.id = 'blocker';
    const state = movementState(mover, [
      tile({ q: 0, r: 0 }),
      tile({ q: 1, r: 0 }),
      tile({ q: 2, r: 0 }),
    ], { extraUnits: [blocker] });
    delete state.civilizations.barbarian;

    expect(executeUnitMove(
      state,
      mover.id,
      { q: 2, r: 0 },
      { actor: 'world' },
    )).toMatchObject({ ok: false, reason: 'occupied' });
  });

  it('reserves foreign-city entry for an explicit canonical capture flow', () => {
    const mover = createUnit('warrior', 'player', { q: 0, r: 0 }, mkC());
    mover.id = 'mover';
    const foreign = createUnit('worker', 'ai-1', { q: 7, r: 7 }, mkC());
    foreign.id = 'foreign';
    const state = movementState(mover, [
      tile({ q: 0, r: 0 }),
      tile({ q: 1, r: 0 }),
    ], { extraUnits: [foreign] });
    const city = foundCity(
      'ai-1',
      { q: 1, r: 0 },
      state.map,
      state.idCounters,
    );
    city.id = 'foreign-city';
    state.cities[city.id] = city;
    state.civilizations['ai-1'].cities = [city.id];

    const ordinaryMove = executeUnitMove(
      state,
      'mover',
      city.position,
      { actor: 'player', civId: 'player' },
    );

    expect(ordinaryMove).toMatchObject({
      ok: false,
      reason: 'foreign-city',
    });
    expect(state.units.mover.position).toEqual({ q: 0, r: 0 });

    const captureMove = executeUnitMove(
      state,
      'mover',
      city.position,
      {
        actor: 'player',
        civId: 'player',
        foreignCityEntryId: city.id,
      },
    );
    expect(captureMove.ok).toBe(true);
    expect(state.units.mover.position).toEqual(city.position);
  });

  it('does not path through a foreign city without an alliance', () => {
    const mover = createUnit('warrior', 'player', { q: 0, r: 0 }, mkC());
    mover.id = 'mover';
    const foreign = createUnit('worker', 'ai-1', { q: 7, r: 7 }, mkC());
    foreign.id = 'foreign';
    const state = movementState(mover, [
      tile({ q: 0, r: 0 }),
      tile({ q: 1, r: 0 }),
      tile({ q: 2, r: 0 }),
    ], { extraUnits: [foreign] });
    const city = foundCity(
      'ai-1',
      { q: 1, r: 0 },
      state.map,
      state.idCounters,
    );
    city.id = 'foreign-city';
    state.cities[city.id] = city;
    state.civilizations['ai-1'].cities = [city.id];

    const result = executeUnitMove(
      state,
      'mover',
      { q: 2, r: 0 },
      { actor: 'player', civId: 'player' },
    );

    expect(result).toMatchObject({ ok: false, reason: 'foreign-city' });
    expect(state.units.mover.position).toEqual({ q: 0, r: 0 });
  });

  it('preserves peaceful allied city entry', () => {
    const mover = createUnit('warrior', 'player', { q: 0, r: 0 }, mkC());
    mover.id = 'mover';
    const foreign = createUnit('worker', 'ai-1', { q: 7, r: 7 }, mkC());
    foreign.id = 'foreign';
    const state = movementState(mover, [
      tile({ q: 0, r: 0 }),
      tile({ q: 1, r: 0 }),
    ], { extraUnits: [foreign] });
    const city = foundCity(
      'ai-1',
      { q: 1, r: 0 },
      state.map,
      state.idCounters,
    );
    city.id = 'allied-city';
    state.cities[city.id] = city;
    state.civilizations['ai-1'].cities = [city.id];
    state.civilizations.player.diplomacy.treaties.push({
      type: 'alliance',
      civA: 'player',
      civB: 'ai-1',
      turnsRemaining: 5,
    });

    const result = executeUnitMove(
      state,
      'mover',
      city.position,
      { actor: 'player', civId: 'player' },
    );

    expect(result.ok).toBe(true);
    expect(state.units.mover.position).toEqual(city.position);
  });

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

  it('syncs based aircraft positions after a Carrier move', () => {
    const carrier = createUnit('carrier', 'player', { q: 0, r: 0 }, mkC());
    carrier.id = 'carrier';
    const aircraft = createUnit('biplane', 'player', { q: 0, r: 0 }, mkC());
    aircraft.id = 'aircraft';
    aircraft.airBase = { kind: 'carrier', unitId: 'carrier' };
    const state = movementState(carrier, [
      tile({ q: 0, r: 0 }, 'coast'),
      tile({ q: 1, r: 0 }, 'coast'),
    ], { completedTechs: ['galleys'], extraUnits: [aircraft] });

    expect(executeUnitMove(state, 'carrier', { q: 1, r: 0 }, { actor: 'player', civId: 'player' })).toMatchObject({ ok: true });
    expect(state.units.aircraft.position).toEqual({ q: 1, r: 0 });
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

describe('river crossing movement cost', () => {
  it('charges +1 MP when crossing a river without bridge-building', () => {
    const mover = createUnit('warrior', 'player', { q: 0, r: 0 }, mkC());
    mover.id = 'mover';
    // warrior has 2 MP by default; plains costs 1 + river costs 1 = 2 total → 0 remaining
    const state = movementState(mover, [
      tile({ q: 0, r: 0 }, 'plains'),
      tile({ q: 1, r: 0 }, 'plains'),
    ]);
    state.map.rivers = [{ from: { q: 0, r: 0 }, to: { q: 1, r: 0 } }];

    const result = executeUnitMove(state, 'mover', { q: 1, r: 0 }, { actor: 'player', civId: 'player' });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected move to succeed');
    expect(state.units.mover.movementPointsLeft).toBe(0);
  });

  it('bridge-building saves 1 MP — warrior ends with 1 MP instead of 0 after crossing', () => {
    // Without bridge-building: plains(1) + river(1) = 2 MP used, 0 remaining
    // With bridge-building: plains(1) only = 1 MP used, 1 remaining
    const mover = createUnit('warrior', 'player', { q: 0, r: 0 }, mkC());
    mover.id = 'mover';
    const state = movementState(mover, [
      tile({ q: 0, r: 0 }, 'plains'),
      tile({ q: 1, r: 0 }, 'plains'),
    ], { completedTechs: ['bridge-building'] });
    state.map.rivers = [{ from: { q: 0, r: 0 }, to: { q: 1, r: 0 } }];

    const result = executeUnitMove(state, 'mover', { q: 1, r: 0 }, { actor: 'player', civId: 'player' });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected bridge-building to allow crossing');
    expect(state.units.mover.movementPointsLeft).toBe(1);
  });

  it('forced march applies: warrior with 1 MP can still cross a river (adjacent, single step)', () => {
    // Forced march rule: distance === 1 && movementPointsLeft >= 1 && cost > movementPointsLeft
    const mover = createUnit('warrior', 'player', { q: 0, r: 0 }, mkC());
    mover.id = 'mover';
    mover.movementPointsLeft = 1;
    const state = movementState(mover, [
      tile({ q: 0, r: 0 }, 'plains'),
      tile({ q: 1, r: 0 }, 'plains'),
    ]);
    state.map.rivers = [{ from: { q: 0, r: 0 }, to: { q: 1, r: 0 } }];

    const result = executeUnitMove(state, 'mover', { q: 1, r: 0 }, { actor: 'player', civId: 'player' });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected forced march to allow 1-MP river crossing');
    expect(state.units.mover.movementPointsLeft).toBe(0);
  });

  it('naval units pay no river crossing penalty', () => {
    const galley = createUnit('galley', 'player', { q: 0, r: 0 }, mkC());
    galley.id = 'galley';
    // galley has 3 MP; coast costs 1; river edge present but domain === 'naval' → exempt
    const state = movementState(galley, [
      tile({ q: 0, r: 0 }, 'coast'),
      tile({ q: 1, r: 0 }, 'coast'),
    ]);
    state.map.rivers = [{ from: { q: 0, r: 0 }, to: { q: 1, r: 0 } }];

    const result = executeUnitMove(state, 'galley', { q: 1, r: 0 }, { actor: 'player', civId: 'player' });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected naval unit to cross without river penalty');
    expect(state.units.galley.movementPointsLeft).toBe(2); // 3 MP - 1 coast step = 2 remaining
  });

  it('no crossing cost when no river segment exists between the two tiles', () => {
    const mover = createUnit('warrior', 'player', { q: 0, r: 0 }, mkC());
    mover.id = 'mover';
    mover.movementPointsLeft = 1;
    const state = movementState(mover, [
      tile({ q: 0, r: 0 }, 'plains'),
      tile({ q: 1, r: 0 }, 'plains'),
    ]);
    // state.map.rivers defaults to [] — no segment added

    const result = executeUnitMove(state, 'mover', { q: 1, r: 0 }, { actor: 'player', civId: 'player' });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected 1-MP plains move to succeed without river');
    expect(state.units.mover.movementPointsLeft).toBe(0);
  });
});

describe('validateUnitMove — friendly stacking', () => {
  function stackState(unitOwner: string, occupantOwner: string): GameState {
    const counters = mkC();
    const unit = createUnit('warrior', unitOwner, { q: 0, r: 0 }, counters);
    const occupant = createUnit('warrior', occupantOwner, { q: 1, r: 0 }, counters);
    const tiles = [
      tile({ q: 0, r: 0 }),
      tile({ q: 1, r: 0 }),
      tile({ q: 2, r: 0 }),
    ];
    return movementState(unit, tiles, { extraUnits: [occupant] });
  }

  it('allows moving to a hex occupied by a same-owner unit', () => {
    const state = stackState('civ-1', 'civ-1');
    const unitId = Object.values(state.units).find(u => u.position.q === 0)!.id;
    const result = executeUnitMove(state, unitId, { q: 1, r: 0 }, { actor: 'player', civId: 'civ-1' });
    expect(result.ok).toBe(true);
  });

  it('blocks moving to a hex occupied by a different-owner unit', () => {
    const state = stackState('civ-1', 'civ-2');
    const unitId = Object.values(state.units).find(u => u.position.q === 0)!.id;
    const result = executeUnitMove(state, unitId, { q: 1, r: 0 }, { actor: 'player', civId: 'civ-1' });
    expect(result.ok).toBe(false);
    expect((result as any).reason).toBe('occupied');
  });

  it('blocks moving to a hex occupied by a barbarian unit', () => {
    const state = stackState('civ-1', 'barbarian');
    const unitId = Object.values(state.units).find(u => u.position.q === 0)!.id;
    const result = executeUnitMove(state, unitId, { q: 1, r: 0 }, { actor: 'player', civId: 'civ-1' });
    expect(result.ok).toBe(false);
    expect((result as any).reason).toBe('occupied');
  });
});
