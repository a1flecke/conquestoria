import { describe, expect, it } from 'vitest';
import { applyPirateAiResponse } from '@/ai/basic-ai';
import { EventBus } from '@/core/event-bus';
import { createNewGame } from '@/core/game-state';
import { createEmptyPirateState, type PirateFactionState } from '@/core/pirate-state';
import type { GameState, HexCoord, UnitType } from '@/core/types';
import { hexDistance, hexKey } from '@/systems/hex-utils';
import { createUnit } from '@/systems/unit-system';

function fixture(): GameState {
  const state = createNewGame(undefined, 'ai-pirates', 'small');
  state.turn = 20;
  state.era = 5;
  state.map = { width: 8, height: 4, wrapsHorizontally: false, rivers: [], tiles: {} };
  for (let q = 0; q < 8; q += 1) {
    for (let r = 0; r < 4; r += 1) {
      state.map.tiles[`${q},${r}`] = {
        coord: { q, r }, terrain: r === 1 ? 'plains' : 'ocean', elevation: 'lowland',
        resource: null, improvement: 'none', owner: null, improvementTurnsLeft: 0,
        hasRiver: false, wonder: null,
      };
    }
  }
  state.units = {};
  for (const civ of Object.values(state.civilizations)) {
    civ.units = [];
    civ.cities = [];
    civ.gold = 200;
    civ.visibility = { tiles: {}, lastSeen: {} };
  }
  state.pirates = createEmptyPirateState();
  return state;
}

function addUnit(state: GameState, id: string, type: UnitType, owner: string, position: HexCoord) {
  const unit = createUnit(type, owner, position, state.idCounters);
  unit.id = id;
  state.units[id] = unit;
  state.civilizations[owner]?.units.push(id);
  return unit;
}

function addFaction(state: GameState, overrides: Partial<PirateFactionState> = {}): PirateFactionState {
  const faction: PirateFactionState = {
    id: 'pirate-1', name: 'The Red Wake', spawnedRound: 2, behavior: 'blockading', maritimeStage: 4,
    notoriety: 6, shipIds: [],
    headquarters: { kind: 'coastal-enclave', position: { q: 6, r: 1 }, integrity: 100, maxIntegrity: 100 },
    tributeByCiv: {}, demandByCiv: {}, contract: null, intent: null,
    transitionGuards: { emittedEventKeys: [] },
    ...overrides,
  };
  state.pirates!.factions[faction.id] = faction;
  return faction;
}

function revealFaction(state: GameState, overrides: Record<string, unknown> = {}): void {
  state.pirates!.intelByCiv['ai-1'] = {
    'pirate-1': {
      factionId: 'pirate-1', level: 'sighted', discoveredRound: 10, lastUpdatedRound: 20,
      knownBehavior: 'blockading', knownMaritimeStage: 4, observedUnitIds: [],
      ...overrides,
    },
  };
}

describe('AI pirate response', () => {
  it('escorts a loaded transport with an available combat warship', () => {
    const state = fixture();
    addFaction(state);
    revealFaction(state);
    const escort = addUnit(state, 'escort', 'galley', 'ai-1', { q: 0, r: 0 });
    const transport = addUnit(state, 'transport', 'transport', 'ai-1', { q: 3, r: 0 });
    const cargo = addUnit(state, 'cargo', 'warrior', 'ai-1', { q: 3, r: 0 });
    transport.cargoUnitIds = [cargo.id];
    cargo.transportId = transport.id;

    const result = applyPirateAiResponse(state, 'ai-1', new EventBus());

    expect(hexDistance(result.units[escort.id].position, transport.position)).toBeLessThan(3);
  });

  it('hunts only an earned headquarters location and never a hidden live coordinate', () => {
    const hidden = fixture();
    addFaction(hidden);
    const ship = addUnit(hidden, 'hunter', 'galley', 'ai-1', { q: 0, r: 0 });

    const hiddenResult = applyPirateAiResponse(hidden, 'ai-1', new EventBus());
    expect(hiddenResult.units[ship.id].position).toEqual({ q: 0, r: 0 });

    const known = fixture();
    addFaction(known);
    const knownShip = addUnit(known, 'hunter', 'galley', 'ai-1', { q: 0, r: 0 });
    known.civilizations['ai-1'].visibility.tiles['6,1'] = 'visible';
    revealFaction(known, {
      lastKnownHeadquarters: { kind: 'coastal-enclave', position: { q: 6, r: 1 }, observedRound: 20, integrityBand: 'healthy' },
    });

    const knownResult = applyPirateAiResponse(known, 'ai-1', new EventBus());
    expect(hexDistance(knownResult.units[knownShip.id].position, { q: 6, r: 1 })).toBeLessThan(6);
  });

  it('dispatches a warship toward an observed besieging faction\'s ship, same as a blockading one (#522)', () => {
    const state = fixture();
    const faction = addFaction(state, { behavior: 'besieging', maritimeStage: 3, notoriety: 9 });
    const pirateShip = addUnit(state, 'pirate-a', 'pirate_frigate', faction.id, { q: 3, r: 0 });
    faction.shipIds = [pirateShip.id];
    const warship = addUnit(state, 'ai-warship', 'trireme', 'ai-1', { q: 0, r: 0 });
    state.civilizations['ai-1'].visibility.tiles[hexKey(pirateShip.position)] = 'visible';
    // No lastKnownHeadquarters -> the higher-priority headquarters-assault goal doesn't
    // apply, isolating the blockading/besieging-ship targeting tier this fix touches.
    revealFaction(state, { knownBehavior: 'besieging', observedUnitIds: [pirateShip.id] });

    const result = applyPirateAiResponse(state, 'ai-1', new EventBus());

    expect(hexDistance(result.units[warship.id].position, pirateShip.position)).toBeLessThan(
      hexDistance(warship.position, pirateShip.position),
    );
  });

  it('pays affordable tribute for an active blockade but refuses debt', () => {
    const state = fixture();
    const faction = addFaction(state);
    faction.demandByCiv['ai-1'] = { demandedRound: 20, lastReminderRound: 20, quotedCost: 50 };
    const cityId = 'ai-port';
    state.cities[cityId] = {
      id: cityId, name: 'AI Port', owner: 'ai-1', position: { q: 3, r: 1 }, population: 3,
      food: 0, foodNeeded: 15, buildings: [], productionQueue: [], productionProgress: 0,
      ownedTiles: [{ q: 3, r: 1 }], workedTiles: [], focus: 'balanced', maturity: 'town',
      unrestLevel: 0, unrestTurns: 0, spyUnrestBonus: 0, idleProduction: null,
    };
    state.civilizations['ai-1'].cities = [cityId];
    const first = addUnit(state, 'pirate-a', 'pirate_ironclad', faction.id, { q: 3, r: 0 });
    const second = addUnit(state, 'pirate-b', 'pirate_frigate', faction.id, { q: 2, r: 0 });
    addUnit(state, 'ai-warship', 'trireme', 'ai-1', { q: 4, r: 0 });
    faction.shipIds = [first.id, second.id];
    state.civilizations['ai-1'].visibility.tiles[hexKey(first.position)] = 'visible';
    state.civilizations['ai-1'].visibility.tiles[hexKey(second.position)] = 'visible';
    revealFaction(state, { observedUnitIds: [first.id, second.id] });

    const paid = applyPirateAiResponse(state, 'ai-1', new EventBus());
    expect(paid.pirates!.factions[faction.id].tributeByCiv['ai-1']).toBeDefined();
    expect(paid.civilizations['ai-1'].gold).toBeLessThan(200);
    expect(paid.units[first.id].health).toBe(100);

    state.civilizations['ai-1'].gold = 1;
    const refused = applyPirateAiResponse(state, 'ai-1', new EventBus());
    expect(refused.pirates!.factions[faction.id].tributeByCiv['ai-1']).toBeUndefined();
    expect(refused.civilizations['ai-1'].gold).toBe(1);
  });

  it('hires only a known eligible final-era flotilla against a strategic rival', () => {
    const state = fixture();
    state.civilizations['ai-1'].gold = 500;
    const flagship = addUnit(state, 'flagship', 'pirate_mothership', 'pirate-1', { q: 5, r: 0 });
    const faction = addFaction(state, {
      maritimeStage: 5, shipIds: [flagship.id],
      headquarters: { kind: 'deep-sea-flotilla', flagshipUnitId: flagship.id, relocation: { planned: null, lastRelocatedRound: null } },
    });
    state.civilizations['ai-1'].diplomacy.relationships.player = -50;
    state.civilizations['ai-1'].diplomacy.atWarWith = ['player'];
    state.civilizations.player.diplomacy.atWarWith = ['ai-1'];
    state.civilizations.player.cities = ['player-port'];
    state.cities['player-port'] = {
      id: 'player-port', name: 'Player Port', owner: 'player', position: { q: 4, r: 1 }, population: 3,
      food: 0, foodNeeded: 15, buildings: [], productionQueue: [], productionProgress: 0,
      ownedTiles: [{ q: 4, r: 1 }], workedTiles: [], focus: 'balanced', maturity: 'town',
      unrestLevel: 0, unrestTurns: 0, spyUnrestBonus: 0, idleProduction: null,
    };
    state.civilizations['ai-1'].visibility.tiles['4,1'] = 'fog';
    revealFaction(state, {
      knownMaritimeStage: 5,
      lastKnownHeadquarters: { kind: 'deep-sea-flotilla', position: { q: 5, r: 0 }, observedRound: 20 },
      observedUnitIds: [flagship.id],
    });

    const result = applyPirateAiResponse(state, 'ai-1', new EventBus());

    expect(result.pirates!.factions[faction.id].contract).toMatchObject({ employerId: 'ai-1', targetId: 'player' });
  });

  it('uses favorable combat and canonical destruction for a known flagship', () => {
    const state = fixture();
    const hunter = addUnit(state, 'hunter', 'trireme', 'ai-1', { q: 1, r: 0 });
    const flagship = addUnit(state, 'flagship', 'pirate_galley', 'pirate-1', { q: 2, r: 0 });
    flagship.health = 1;
    addFaction(state, {
      maritimeStage: 2, shipIds: [flagship.id],
      headquarters: { kind: 'deep-sea-flotilla', flagshipUnitId: flagship.id, relocation: { planned: null, lastRelocatedRound: null } },
    });
    state.civilizations['ai-1'].visibility.tiles['2,0'] = 'visible';
    revealFaction(state, { observedUnitIds: [flagship.id] });

    const result = applyPirateAiResponse(state, 'ai-1', new EventBus());

    expect(result.pirates!.factions['pirate-1']).toBeUndefined();
    expect(result.pirates!.history.some(entry => entry.kind === 'destroyed' && entry.destroyedByOwnerId === 'ai-1')).toBe(true);
    expect(result.units[hunter.id]).toBeDefined();
  });

  it('declines a materially unfavorable known pirate fight', () => {
    const state = fixture();
    const hunter = addUnit(state, 'hunter', 'galley', 'ai-1', { q: 1, r: 0 });
    hunter.health = 20;
    const flagship = addUnit(state, 'flagship', 'pirate_mothership', 'pirate-1', { q: 2, r: 0 });
    const faction = addFaction(state, {
      maritimeStage: 5, shipIds: [flagship.id],
      headquarters: { kind: 'deep-sea-flotilla', flagshipUnitId: flagship.id, relocation: { planned: null, lastRelocatedRound: null } },
    });
    state.civilizations['ai-1'].visibility.tiles['2,0'] = 'visible';
    revealFaction(state, { knownMaritimeStage: 5, observedUnitIds: [flagship.id] });

    const result = applyPirateAiResponse(state, 'ai-1', new EventBus());

    expect(result.pirates!.factions[faction.id]).toBeDefined();
    expect(result.units[flagship.id].health).toBe(100);
  });

  it('destroys an exposed enclave through the canonical assault path', () => {
    const state = fixture();
    addUnit(state, 'hunter', 'trireme', 'ai-1', { q: 6, r: 0 });
    addFaction(state, {
      shipIds: [],
      headquarters: { kind: 'coastal-enclave', position: { q: 6, r: 1 }, integrity: 1, maxIntegrity: 100 },
    });
    state.civilizations['ai-1'].visibility.tiles['6,1'] = 'visible';
    revealFaction(state, {
      lastKnownHeadquarters: { kind: 'coastal-enclave', position: { q: 6, r: 1 }, observedRound: 20, integrityBand: 'critical' },
    });

    const result = applyPirateAiResponse(state, 'ai-1', new EventBus());

    expect(result.pirates!.factions['pirate-1']).toBeUndefined();
    expect(result.pirates!.history).toContainEqual(expect.objectContaining({
      kind: 'destroyed', factionId: 'pirate-1', destroyedByOwnerId: 'ai-1', reason: 'enclave-assault',
    }));
  });
});
