// tests/systems/espionage-stealth.test.ts
import { describe, it, expect } from 'vitest';
import type { GameState } from '@/core/types';
import { getVisibleUnitsForPlayer } from '@/systems/espionage-stealth';
import { createEspionageCivState, createSpyFromUnit, setDisguise } from '@/systems/espionage-system';

function makeStealthState(disguise?: string): GameState {
  let civEsp = { ...createEspionageCivState(), maxSpies: 1 };
  const { state: esp } = createSpyFromUnit(civEsp, 'unit-1', 'player', 'spy_scout', 'stealth-seed');
  civEsp = disguise
    ? setDisguise(esp, 'unit-1', disguise as any)
    : esp;
  return {
    espionage: { player: civEsp, 'ai-egypt': createEspionageCivState() },
    units: {
      'unit-1': {
        id: 'unit-1', type: 'spy_scout', owner: 'player',
        position: { q: 5, r: 3 },
        health: 100, maxHealth: 100,
        movementPointsLeft: 2, movement: 2,
        hasActed: false,
        status: 'idle',
      } as any,
    },
    civilizations: {
      player: { techState: { completed: ['espionage-scouting', 'disguise'] } },
      'ai-egypt': { techState: { completed: [] } },
    },
  } as unknown as GameState;
}

describe('getVisibleUnitsForPlayer', () => {
  it('spy without disguise is visible to enemy as spy unit', () => {
    const state = makeStealthState();
    const visible = getVisibleUnitsForPlayer(state.units, state, 'ai-egypt');
    expect(visible['unit-1']).toBeDefined();
    expect(visible['unit-1'].type).toBe('spy_scout');
    expect(visible['unit-1'].owner).toBe('player');
  });

  it('spy disguised as barbarian appears as barbarian warrior to enemy', () => {
    const state = makeStealthState('barbarian');
    const visible = getVisibleUnitsForPlayer(state.units, state, 'ai-egypt');
    expect(visible['unit-1'].type).toBe('warrior');
    expect(visible['unit-1'].owner).toBe('barbarian');
  });

  it('spy disguised as barbarian appears as true self to owner', () => {
    const state = makeStealthState('barbarian');
    const visible = getVisibleUnitsForPlayer(state.units, state, 'player');
    expect(visible['unit-1'].type).toBe('spy_scout');
    expect(visible['unit-1'].owner).toBe('player');
  });

  it('enemy scout_hound unit sees through barbarian disguise', () => {
    const state = makeStealthState('barbarian');
    (state.units as any)['hound-1'] = {
      id: 'hound-1', type: 'scout_hound', owner: 'ai-egypt',
      position: { q: 5, r: 3 },
      health: 100, maxHealth: 100,
      movementPointsLeft: 3, movement: 3,
      hasActed: false, status: 'idle',
    };
    const visible = getVisibleUnitsForPlayer(state.units, state, 'ai-egypt');
    expect(visible['unit-1'].type).toBe('spy_scout');
    expect(visible['unit-1'].owner).toBe('player');
  });

  it('spy disguised as archer appears as archer', () => {
    const state = makeStealthState('archer');
    const visible = getVisibleUnitsForPlayer(state.units, state, 'ai-egypt');
    expect(visible['unit-1'].type).toBe('archer');
    expect(visible['unit-1'].owner).toBe('player');
  });

  it('stationed spy is not affected by disguise filter (not idle)', () => {
    const state = makeStealthState('barbarian');
    state.espionage!['player'].spies['unit-1'].status = 'stationed';
    const visible = getVisibleUnitsForPlayer(state.units, state, 'ai-egypt');
    // stationed spy has no physical unit on map but if it were, it would show as-is
    expect(visible['unit-1'].type).toBe('spy_scout');
  });

  it('on_mission spy is not filtered — disguise only applies when idle', () => {
    const state = makeStealthState('barbarian');
    state.espionage!['player'].spies['unit-1'].status = 'on_mission' as any;
    const visible = getVisibleUnitsForPlayer(state.units, state, 'ai-egypt');
    expect(visible['unit-1'].type).toBe('spy_scout');
  });

  it('friendly detector owned by owner does not help a third-party viewer see through disguise', () => {
    const state = makeStealthState('barbarian');
    (state.units as any)['hound-owner'] = {
      id: 'hound-owner', type: 'scout_hound', owner: 'player',
      position: { q: 5, r: 3 },
      health: 100, maxHealth: 100,
      movementPointsLeft: 3, movement: 3,
      hasActed: false, status: 'idle',
    };
    // ai-egypt is the viewer — the player-owned hound is irrelevant to their detection
    const visible = getVisibleUnitsForPlayer(state.units, state, 'ai-egypt');
    expect(visible['unit-1'].type).toBe('warrior');
    expect(visible['unit-1'].owner).toBe('barbarian');
  });

  it('does not return loaded cargo as a visible map unit', () => {
    const state = makeStealthState();
    state.units = {
      transport: {
        id: 'transport',
        type: 'transport',
        owner: 'player',
        position: { q: 5, r: 3 },
        health: 100,
        maxHealth: 100,
        movementPointsLeft: 3,
        hasActed: false,
        cargoUnitIds: ['cargo'],
      } as any,
      cargo: {
        id: 'cargo',
        type: 'warrior',
        owner: 'player',
        position: { q: 5, r: 3 },
        health: 100,
        maxHealth: 100,
        movementPointsLeft: 2,
        hasActed: true,
        transportId: 'transport',
      } as any,
    };

    const visible = getVisibleUnitsForPlayer(state.units, state, 'player');

    expect(visible.transport).toBeDefined();
    expect(visible.cargo).toBeUndefined();
  });

  it('hides a concealed basilisk from a viewer civ with no adjacent units', () => {
    const jungleTile = { coord: { q: 5, r: 3 }, terrain: 'jungle', elevation: 'flat', resource: null, improvement: 'none', owner: null, improvementTurnsLeft: 0, hasRiver: false, wonder: null };
    const grassTile  = { coord: { q: 7, r: 3 }, terrain: 'grassland', elevation: 'flat', resource: null, improvement: 'none', owner: null, improvementTurnsLeft: 0, hasRiver: false, wonder: null };
    const map = { width: 40, height: 30, tiles: { '5,3': jungleTile, '7,3': grassTile }, wrapsHorizontally: false } as any;

    const basilisk = { id: 'basilisk', type: 'beast_basilisk', owner: 'beasts', position: { q: 5, r: 3 }, health: 100, movementPointsLeft: 2, hasActed: false } as any;
    const farViewer = { id: 'viewer',  type: 'warrior',        owner: 'player',  position: { q: 7, r: 3 }, health: 100, movementPointsLeft: 2, hasActed: false } as any;
    const state = { map, units: { basilisk, viewer: farViewer }, espionage: {} } as any;

    const visible = getVisibleUnitsForPlayer(state.units, state, 'player');
    expect(visible['basilisk']).toBeUndefined();
    expect(visible['viewer']).toBeDefined();
  });

  it('reveals a concealed basilisk when the viewer has an adjacent unit', () => {
    const jungleTile = { coord: { q: 5, r: 3 }, terrain: 'jungle', elevation: 'flat', resource: null, improvement: 'none', owner: null, improvementTurnsLeft: 0, hasRiver: false, wonder: null };
    const adjTile    = { coord: { q: 6, r: 3 }, terrain: 'grassland', elevation: 'flat', resource: null, improvement: 'none', owner: null, improvementTurnsLeft: 0, hasRiver: false, wonder: null };
    const map = { width: 40, height: 30, tiles: { '5,3': jungleTile, '6,3': adjTile }, wrapsHorizontally: false } as any;

    const basilisk    = { id: 'basilisk', type: 'beast_basilisk', owner: 'beasts', position: { q: 5, r: 3 }, health: 100, movementPointsLeft: 2, hasActed: false } as any;
    const adjViewer   = { id: 'viewer',  type: 'warrior',        owner: 'player',  position: { q: 6, r: 3 }, health: 100, movementPointsLeft: 2, hasActed: false } as any;
    const state = { map, units: { basilisk, viewer: adjViewer }, espionage: {} } as any;

    const visible = getVisibleUnitsForPlayer(state.units, state, 'player');
    expect(visible['basilisk']).toBeDefined();
  });

  it('does not count transported cargo as an adjacent revealer (only the ship itself counts)', () => {
    // Cargo is adjacent to the basilisk but its transportId marks it as below-deck.
    // The ship is far away; only the cargo position is adjacent.
    // Expectation: basilisk remains concealed because the cargo unit should be excluded.
    const jungleTile = { coord: { q: 5, r: 3 }, terrain: 'jungle', elevation: 'flat', resource: null, improvement: 'none', owner: null, improvementTurnsLeft: 0, hasRiver: false, wonder: null };
    const adjTile    = { coord: { q: 6, r: 3 }, terrain: 'coast',  elevation: 'flat', resource: null, improvement: 'none', owner: null, improvementTurnsLeft: 0, hasRiver: false, wonder: null };
    const farTile    = { coord: { q: 9, r: 3 }, terrain: 'ocean',  elevation: 'flat', resource: null, improvement: 'none', owner: null, improvementTurnsLeft: 0, hasRiver: false, wonder: null };
    const map = { width: 40, height: 30, tiles: { '5,3': jungleTile, '6,3': adjTile, '9,3': farTile }, wrapsHorizontally: false } as any;

    const basilisk = { id: 'basilisk', type: 'beast_basilisk', owner: 'beasts',  position: { q: 5, r: 3 }, health: 100, movementPointsLeft: 2, hasActed: false } as any;
    // Ship is far away (q:9,r:3); cargo position matches ship position in normal gameplay but
    // we set it adjacent (q:6,r:3) to simulate the transported-position-without-ship scenario
    // and verify that cargo with transportId is excluded from the revealer list.
    const ship  = { id: 'ship',  type: 'galley',  owner: 'player', position: { q: 9, r: 3 }, health: 100, movementPointsLeft: 2, hasActed: false } as any;
    const cargo = { id: 'cargo', type: 'warrior', owner: 'player', position: { q: 6, r: 3 }, health: 100, movementPointsLeft: 2, hasActed: false, transportId: 'ship' } as any;
    const state = { map, units: { basilisk, ship, cargo }, espionage: {} } as any;

    const visible = getVisibleUnitsForPlayer(state.units, state, 'player');
    expect(visible['basilisk']).toBeUndefined();
  });
});

describe('setDisguise', () => {
  it('sets disguiseAs on the spy record', () => {
    let civEsp = { ...createEspionageCivState(), maxSpies: 1 };
    const { state: esp } = createSpyFromUnit(civEsp, 'spy-x', 'player', 'spy_scout', 'seed-x');
    civEsp = setDisguise(esp, 'spy-x', 'warrior');
    expect(civEsp.spies['spy-x'].disguiseAs).toBe('warrior');
  });

  it('clears disguise when passed null', () => {
    let civEsp = { ...createEspionageCivState(), maxSpies: 1 };
    const { state: esp } = createSpyFromUnit(civEsp, 'spy-x', 'player', 'spy_scout', 'seed-x');
    civEsp = setDisguise(esp, 'spy-x', 'warrior');
    civEsp = setDisguise(civEsp, 'spy-x', null);
    expect(civEsp.spies['spy-x'].disguiseAs).toBeNull();
  });

  it('throws if spy not found', () => {
    const civEsp = createEspionageCivState();
    expect(() => setDisguise(civEsp, 'nonexistent', 'warrior')).toThrow();
  });

  it('throws if spy is not idle', () => {
    let civEsp = { ...createEspionageCivState(), maxSpies: 1 };
    const { state: esp } = createSpyFromUnit(civEsp, 'spy-x', 'player', 'spy_scout', 'seed-x');
    civEsp = { ...esp, spies: { ...esp.spies, 'spy-x': { ...esp.spies['spy-x'], status: 'stationed' as any } } };
    expect(() => setDisguise(civEsp, 'spy-x', 'warrior')).toThrow();
  });
});
