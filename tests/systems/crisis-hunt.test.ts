import { describe, it, expect } from 'vitest';
import { EventBus } from '@/core/event-bus';
import { processCrisisTurn } from '@/systems/crisis-system';
import { createDiplomacyState } from '@/systems/diplomacy-system';
import { hexesInRange, hexKey, hexDistance } from '@/systems/hex-utils';
import { BEAST_OWNER } from '@/systems/beast-system';
import type { ActiveCrisis, City, GameState, HexCoord, HexTile, OpponentChallenge } from '@/core/types';

const CITY_POS: HexCoord = { q: 0, r: 0 };
const LANDMASS = 'landmass-1';

function makeTile(coord: HexCoord, overrides: Partial<HexTile> = {}): HexTile {
  return {
    coord,
    terrain: 'grassland',
    elevation: 'lowland',
    resource: null,
    improvement: 'none',
    owner: null,
    improvementTurnsLeft: 0,
    hasRiver: false,
    wonder: null,
    regionKey: LANDMASS,
    ...overrides,
  };
}

function makeHuntFixture({
  turn = 40,
  era = 4,
  challenge = 'standard' as OpponentChallenge,
  flavorId = 'beast-awakening',
  stage = 'active' as ActiveCrisis['stage'],
  turnsInStage = 0,
  huntEntityId,
  foeName,
  lastHuntKillerCivId,
  includeBarbarianCamp = false,
  includePirateFleet = false,
}: {
  turn?: number;
  era?: number;
  challenge?: OpponentChallenge;
  flavorId?: string;
  stage?: ActiveCrisis['stage'];
  turnsInStage?: number;
  huntEntityId?: string;
  foeName?: string;
  lastHuntKillerCivId?: string;
  includeBarbarianCamp?: boolean;
  includePirateFleet?: boolean;
} = {}): { state: GameState; crisisId: string } {
  const civId = 'p1';
  const city: City = {
    id: 'c1', name: 'c1', owner: civId, position: CITY_POS,
    population: 5, food: 0, foodNeeded: 20, buildings: [], productionQueue: [],
    productionProgress: 0, ownedTiles: [CITY_POS], workedTiles: [],
    focus: 'balanced', maturity: 'outpost', unrestLevel: 0, unrestTurns: 0, spyUnrestBonus: 0,
  };

  const tiles: Record<string, HexTile> = {};
  // Territory: owned out to distance 2. Distance 3-5 west (forest, unowned) is the
  // beast-awakening spawn ring. Distance 6+ east is ocean (with a coastal fringe at 5-6)
  // for the corsair-armada spawn ring, far enough from the city to satisfy the pirate
  // spawner's own >=5-tiles-from-any-city rule.
  for (const coord of hexesInRange(CITY_POS, 12)) {
    const key = hexKey(coord);
    const dist = hexDistance(coord, CITY_POS);
    if (dist === 0) {
      tiles[key] = makeTile(coord, { owner: civId });
    } else if (dist <= 2) {
      tiles[key] = makeTile(coord, { owner: civId });
    } else if (coord.q < 0 && dist <= 6) {
      tiles[key] = makeTile(coord, { terrain: 'forest' });
    } else if (coord.q >= 0 && dist >= 6) {
      tiles[key] = makeTile(coord, { terrain: 'ocean', regionKey: undefined });
    } else {
      tiles[key] = makeTile(coord);
    }
  }

  const crisisId = 'crisis-1';
  const crisis: ActiveCrisis = {
    id: crisisId, flavorId, archetype: 'hunt', targetCivId: civId,
    cityIds: ['c1'], tileKeys: [], startedTurn: turn - turnsInStage, stage, turnsInStage,
    ...(huntEntityId ? { huntEntityId } : {}),
    ...(foeName ? { foeName } : {}),
    ...(lastHuntKillerCivId ? { lastHuntKillerCivId } : {}),
  };

  const state: GameState = {
    turn, era, currentPlayer: civId, gameOver: false, winner: null,
    map: { width: 40, height: 40, tiles, wrapsHorizontally: false, rivers: [] },
    units: {},
    cities: { c1: city },
    civilizations: {
      [civId]: {
        id: civId, name: 'Player', color: '#4a90d9', isHuman: true, civType: 'egypt',
        cities: ['c1'], units: [],
        techState: { completed: [], currentResearch: null, researchProgress: 0, researchQueue: [], trackPriorities: {} as any },
        gold: 500, visibility: { tiles: {} }, score: 0,
        diplomacy: createDiplomacyState([civId, 'killer'], civId),
        challenge,
      },
      killer: {
        id: 'killer', name: 'Killer', color: '#c2410c', isHuman: false, civType: 'rome',
        cities: [], units: [],
        techState: { completed: [], currentResearch: null, researchProgress: 0, researchQueue: [], trackPriorities: {} as any },
        gold: 0, visibility: { tiles: {} }, score: 0,
        diplomacy: createDiplomacyState([civId, 'killer'], 'killer'),
      },
    },
    barbarianCamps: includeBarbarianCamp
      ? { 'camp-1': { id: 'camp-1', position: { q: -8, r: 8 }, strength: 5, spawnCooldown: 0, banditLordName: 'Old Lord' } }
      : {},
    minorCivs: {},
    tutorial: { active: false, currentStep: 'complete', completedSteps: [] },
    settings: {
      mapSize: 'small', soundEnabled: false, musicEnabled: false, musicVolume: 0, sfxVolume: 0,
      tutorialEnabled: false, advisorsEnabled: {} as any, councilTalkLevel: 'normal',
    },
    tribalVillages: {}, discoveredWonders: {}, wonderDiscoverers: {},
    embargoes: [], defensiveLeagues: [],
    idCounters: { nextUnitId: 1, nextCityId: 1, nextCampId: 2, nextQuestId: 1 },
    beasts: { mode: 'wild', lairs: {}, sightingsByCiv: {} },
    activeCrises: { [crisisId]: crisis },
    ...(includePirateFleet ? { pirateFleets: {} } : {}),
  } as GameState;

  return { state, crisisId };
}

describe('hunt crisis — spawn orchestration (MR3)', () => {
  it('beast-awakening: spawns a beast unit 3-5 tiles from the city, outside its territory, and transitions to menacing', () => {
    const { state, crisisId } = makeHuntFixture({ flavorId: 'beast-awakening' });
    const next = processCrisisTurn(state, new EventBus());
    const crisis = next.activeCrises![crisisId];
    expect(crisis.stage).toBe('menacing');
    expect(crisis.huntEntityId).toBeDefined();
    expect(crisis.foeName).toBeTruthy();

    const beast = next.units[crisis.huntEntityId!];
    expect(beast).toBeDefined();
    expect(beast.owner).toBe(BEAST_OWNER);
    const dist = hexDistance(beast.position, CITY_POS);
    expect(dist).toBeGreaterThanOrEqual(3);
    expect(dist).toBeLessThanOrEqual(5);
    expect(next.map.tiles[hexKey(beast.position)].owner).not.toBe('p1');
  });

  it('beast-awakening: never spawns on a tile occupied by another unit', () => {
    const { state, crisisId } = makeHuntFixture({ flavorId: 'beast-awakening' });
    // Occupy every tile in the legal ring except one, forcing a specific deterministic pick.
    let occupied = 0;
    const units: GameState['units'] = {};
    for (const coord of hexesInRange(CITY_POS, 5)) {
      const dist = hexDistance(coord, CITY_POS);
      if (dist < 3 || dist > 5) continue;
      const tile = state.map.tiles[hexKey(coord)];
      if (tile?.terrain !== 'forest') continue;
      occupied += 1;
      if (occupied <= 5) {
        const id = `blocker-${occupied}`;
        units[id] = {
          id, type: 'warrior', owner: 'killer', position: coord, health: 100,
          movementPointsLeft: 1, experience: 0,
        } as GameState['units'][string];
      }
    }
    const blockedState: GameState = { ...state, units };
    const next = processCrisisTurn(blockedState, new EventBus());
    const crisis = next.activeCrises![crisisId];
    expect(crisis.huntEntityId).toBeDefined();
    const beast = next.units[crisis.huntEntityId!];
    for (const blocker of Object.values(units)) {
      expect(hexKey(blocker.position)).not.toBe(hexKey(beast.position));
    }
  });

  it('beast-awakening: never spawns inside a rival civ\'s territory (would otherwise let the rival kill it before the target player gets a turn)', () => {
    const { state, crisisId } = makeHuntFixture({ flavorId: 'beast-awakening' });
    // Claim every tile in the entire 3-5 spawn ring for a rival civ — with the old
    // "only exclude the target's own territory" rule this would all still be legal
    // (it's not the target's land), but a hunt should never spawn on ANY claimed land.
    const rivalClaimed: GameState['map']['tiles'] = { ...state.map.tiles };
    for (const coord of hexesInRange(CITY_POS, 5)) {
      const dist = hexDistance(coord, CITY_POS);
      if (dist < 3 || dist > 5) continue;
      const key = hexKey(coord);
      const tile = rivalClaimed[key];
      if (tile && tile.terrain !== 'ocean') {
        rivalClaimed[key] = { ...tile, owner: 'rival' };
      }
    }
    const rivalState: GameState = { ...state, map: { ...state.map, tiles: rivalClaimed } };
    const next = processCrisisTurn(rivalState, new EventBus());
    // No unowned land left in the ring -> abandoned, not spawned onto rival territory.
    expect(next.activeCrises?.[crisisId]).toBeUndefined();
  });

  it('is deterministic for a fixed seed: same turn/state produces the same spawn position and beast', () => {
    const { state } = makeHuntFixture({ flavorId: 'beast-awakening' });
    const a = processCrisisTurn(state, new EventBus());
    const b = processCrisisTurn(state, new EventBus());
    const crisisA = a.activeCrises!['crisis-1'];
    const crisisB = b.activeCrises!['crisis-1'];
    expect(crisisA.foeName).toBe(crisisB.foeName);
    expect(a.units[crisisA.huntEntityId!].position).toEqual(b.units[crisisB.huntEntityId!].position);
  });

  it('bandit-uprising: spawns a barbarian camp with a named lord and transitions to menacing', () => {
    const { state, crisisId } = makeHuntFixture({ flavorId: 'bandit-uprising' });
    const next = processCrisisTurn(state, new EventBus());
    const crisis = next.activeCrises![crisisId];
    expect(crisis.stage).toBe('menacing');
    expect(crisis.huntEntityId).toBeDefined();
    expect(crisis.foeName).toBeTruthy();
    expect(next.barbarianCamps[crisis.huntEntityId!]).toBeDefined();
    expect(next.barbarianCamps[crisis.huntEntityId!].banditLordName).toBe(crisis.foeName);
  });

  it('corsair-armada: spawns a pirate fleet with a named captain and transitions to menacing', () => {
    const { state, crisisId } = makeHuntFixture({ flavorId: 'corsair-armada', includePirateFleet: true });
    const next = processCrisisTurn(state, new EventBus());
    const crisis = next.activeCrises![crisisId];
    expect(crisis.stage).toBe('menacing');
    expect(crisis.huntEntityId).toBeDefined();
    expect(crisis.foeName).toBeTruthy();
    const fleet = next.pirateFleets![crisis.huntEntityId!];
    expect(fleet).toBeDefined();
    expect(next.units[fleet.unitId]).toBeDefined();
  });

  it('abandons the hunt when the target city no longer exists', () => {
    const { state, crisisId } = makeHuntFixture({ flavorId: 'beast-awakening' });
    const { c1: _removed, ...rest } = state.cities;
    const cityless: GameState = { ...state, cities: rest };
    const next = processCrisisTurn(cityless, new EventBus());
    expect(next.activeCrises?.[crisisId]).toBeUndefined();
  });
});

describe('hunt crisis — resolution, feast, escalation (MR3)', () => {
  it('resolves "hunted" once the spawned entity is gone, crediting the recorded killer with a feast', () => {
    const { state, crisisId } = makeHuntFixture({
      flavorId: 'beast-awakening', stage: 'menacing', turnsInStage: 1,
      huntEntityId: 'unit-99', foeName: 'Test Beast', lastHuntKillerCivId: 'killer',
    });
    // Entity already absent from state.units — simulates it having been slain this turn.
    const next = processCrisisTurn(state, new EventBus());
    expect(next.activeCrises?.[crisisId]).toBeUndefined();
    expect(next.civilizations.killer.feastUntilTurn).toBe(state.turn + 5);
  });

  it('removes the ephemeral beast lair once the hunt resolves, so map trophy markers do not accumulate forever across many hunts', () => {
    const { state, crisisId } = makeHuntFixture({ flavorId: 'beast-awakening' });
    const spawned = processCrisisTurn(state, new EventBus());
    const crisis = spawned.activeCrises![crisisId];
    const lairId = `hunt-lair-${crisisId}`;
    expect(spawned.beasts!.lairs[lairId]).toBeDefined();

    // Simulate the beast being slain: remove its unit (as recordBeastSlain's caller
    // would after combat), leaving the lair's bookkeeping otherwise untouched.
    const { [crisis.huntEntityId!]: _removedUnit, ...remainingUnits } = spawned.units;
    const slainState: GameState = { ...spawned, units: remainingUnits };
    const resolved = processCrisisTurn(slainState, new EventBus());

    expect(resolved.activeCrises?.[crisisId]).toBeUndefined();
    expect(resolved.beasts!.lairs[lairId]).toBeUndefined();
  });

});

describe('hunt crisis — ally reward (#526 MR6 Task 6.2)', () => {
  it('third-civ kill: moves both relationship sides by +15 and emits crisis:foe-hunted-by-ally once', () => {
    const { state, crisisId } = makeHuntFixture({
      flavorId: 'beast-awakening', stage: 'menacing', turnsInStage: 1,
      huntEntityId: 'unit-99', foeName: 'Test Beast', lastHuntKillerCivId: 'killer',
    });
    state.settings.aiCrisisInteractions = 'benign';
    const bus = new EventBus();
    const events: unknown[] = [];
    bus.on('crisis:foe-hunted-by-ally', event => events.push(event));

    const next = processCrisisTurn(state, bus);

    expect(next.civilizations.p1.diplomacy.relationships.killer).toBe(15);
    expect(next.civilizations.killer.diplomacy.relationships.p1).toBe(15);
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ crisisId, killerCivId: 'killer', targetCivId: 'p1', foeName: 'Test Beast' });
  });

  it('grants +4 to a witness civ that has met both the killer and the target', () => {
    const { state, crisisId } = makeHuntFixture({
      flavorId: 'beast-awakening', stage: 'menacing', turnsInStage: 1,
      huntEntityId: 'unit-99', foeName: 'Test Beast', lastHuntKillerCivId: 'killer',
    });
    state.settings.aiCrisisInteractions = 'benign';
    state.civilizations.witness = {
      id: 'witness', name: 'Witness', color: '#888888', isHuman: false, civType: 'generic',
      cities: [], units: [],
      techState: { completed: [], currentResearch: null, researchProgress: 0, researchQueue: [], trackPriorities: {} as any },
      gold: 0, visibility: { tiles: {} }, score: 0,
      diplomacy: createDiplomacyState(['p1', 'killer', 'witness'], 'witness'),
      knownCivilizations: ['p1', 'killer'],
    } as GameState['civilizations'][string];
    void crisisId;

    const next = processCrisisTurn(state, new EventBus());

    expect(next.civilizations.killer.diplomacy.relationships.witness).toBe(4);
    expect(next.civilizations.witness.diplomacy.relationships.killer).toBe(4);
  });

  it('self-kill (target civ kills its own foe): no reputation change, no event', () => {
    const { state, crisisId } = makeHuntFixture({
      flavorId: 'beast-awakening', stage: 'menacing', turnsInStage: 1,
      huntEntityId: 'unit-99', foeName: 'Test Beast', lastHuntKillerCivId: 'p1',
    });
    state.settings.aiCrisisInteractions = 'benign';
    const bus = new EventBus();
    const events: unknown[] = [];
    bus.on('crisis:foe-hunted-by-ally', event => events.push(event));
    void crisisId;

    const next = processCrisisTurn(state, bus);

    expect(next.civilizations.p1.diplomacy.relationships.killer ?? 0).toBe(0);
    expect(events).toHaveLength(0);
  });

  it('AI killer of an AI target: same deltas apply (no humanity special-casing)', () => {
    const { state } = makeHuntFixture({
      flavorId: 'beast-awakening', stage: 'menacing', turnsInStage: 1,
      huntEntityId: 'unit-99', foeName: 'Test Beast', lastHuntKillerCivId: 'killer',
    });
    state.civilizations.p1.isHuman = false;
    state.settings.aiCrisisInteractions = 'benign';

    const next = processCrisisTurn(state, new EventBus());

    expect(next.civilizations.p1.diplomacy.relationships.killer).toBe(15);
    expect(next.civilizations.killer.diplomacy.relationships.p1).toBe(15);
  });

  it('produces no reputation change or event when aiCrisisInteractions is explicitly off', () => {
    const { state } = makeHuntFixture({
      flavorId: 'beast-awakening', stage: 'menacing', turnsInStage: 1,
      huntEntityId: 'unit-99', foeName: 'Test Beast', lastHuntKillerCivId: 'killer',
    });
    state.settings.aiCrisisInteractions = 'off';
    const bus = new EventBus();
    const events: unknown[] = [];
    bus.on('crisis:foe-hunted-by-ally', event => events.push(event));

    const next = processCrisisTurn(state, bus);

    expect(next.civilizations.p1.diplomacy.relationships.killer ?? 0).toBe(0);
    expect(events).toHaveLength(0);
  });

  it('applies the reputation reward by default now that aiCrisisInteractions defaults to "benign" (#526 MR6 Task 6.4 rollout)', () => {
    const { state } = makeHuntFixture({
      flavorId: 'beast-awakening', stage: 'menacing', turnsInStage: 1,
      huntEntityId: 'unit-99', foeName: 'Test Beast', lastHuntKillerCivId: 'killer',
    });
    const next = processCrisisTurn(state, new EventBus());
    expect(next.civilizations.p1.diplomacy.relationships.killer).toBe(15);
  });
});

describe('hunt crisis — resolution, feast, escalation (MR3, continued)', () => {
  it('falls back to the target civ for the feast when no killer was ever attributed', () => {
    const { state, crisisId } = makeHuntFixture({
      flavorId: 'beast-awakening', stage: 'menacing', turnsInStage: 1,
      huntEntityId: 'unit-99', foeName: 'Test Beast',
    });
    const next = processCrisisTurn(state, new EventBus());
    expect(next.activeCrises?.[crisisId]).toBeUndefined();
    expect(next.civilizations.p1.feastUntilTurn).toBe(state.turn + 5);
  });

  it('stays menacing (not resolved) while the spawned beast is still alive', () => {
    const { state, crisisId } = makeHuntFixture({
      flavorId: 'beast-awakening', stage: 'menacing', turnsInStage: 1, huntEntityId: 'unit-alive',
    });
    const alive: GameState = {
      ...state,
      units: {
        'unit-alive': {
          id: 'unit-alive', type: 'beast_boar', owner: BEAST_OWNER, position: { q: -4, r: 0 },
          health: 100, movementPointsLeft: 1, experience: 0,
        } as GameState['units'][string],
      },
    };
    const next = processCrisisTurn(alive, new EventBus());
    expect(next.activeCrises?.[crisisId]).toBeDefined();
    expect(next.activeCrises![crisisId].stage).toBe('menacing');
  });

  it('escalates menacing -> assaulting only on veteran, after 5 turns', () => {
    const aliveUnits = (): GameState['units'] => ({
      'unit-alive': {
        id: 'unit-alive', type: 'beast_boar', owner: BEAST_OWNER, position: { q: -4, r: 0 },
        health: 100, movementPointsLeft: 1, experience: 0,
      } as GameState['units'][string],
    });

    const veteran = makeHuntFixture({
      flavorId: 'beast-awakening', challenge: 'veteran', stage: 'menacing', turnsInStage: 5, huntEntityId: 'unit-alive',
    });
    const veteranState: GameState = { ...veteran.state, units: aliveUnits() };
    const veteranNext = processCrisisTurn(veteranState, new EventBus());
    expect(veteranNext.activeCrises![veteran.crisisId].stage).toBe('assaulting');

    const standard = makeHuntFixture({
      flavorId: 'beast-awakening', challenge: 'standard', stage: 'menacing', turnsInStage: 5, huntEntityId: 'unit-alive',
    });
    const standardState: GameState = { ...standard.state, units: aliveUnits() };
    const standardNext = processCrisisTurn(standardState, new EventBus());
    expect(standardNext.activeCrises![standard.crisisId].stage).toBe('menacing');
  });
});
