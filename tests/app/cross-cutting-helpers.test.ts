// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createNewGame } from '@/core/game-state';
import { EventBus } from '@/core/event-bus';
import { createGameSession } from '@/app/game-session';
import { hexKey } from '@/systems/hex-utils';
import type { GameState, Unit } from '@/core/types';
import {
  getCurrentCiv,
  getCurrentCivDef,
  clearUnloadState,
  prefersReducedMotion,
  scanBeastSightings,
  scanSubmarineSightings,
  focusNotificationTarget,
  focusPirateTarget,
  notifyPlayer,
  applyPirateActionResult,
} from '@/app/cross-cutting-helpers';
import { createUnit } from '@/systems/unit-system';

function makeFixture(seed = 'cross-cutting-helpers'): GameState {
  const state = createNewGame(undefined, seed, 'small');
  state.currentPlayer = 'player';
  return state;
}

function stateWithLair(): GameState {
  const state = createNewGame('rome', 'cross-cutting-beast-seed', 'small');
  state.currentPlayer = 'player';
  state.beasts = {
    mode: 'wild',
    lairs: {
      'lair-giant_boar': {
        id: 'lair-giant_boar', beastId: 'giant_boar', position: { q: 10, r: 10 },
        status: 'awake', strength: 0, unitIds: ['beast-1'],
      },
    },
    sightingsByCiv: {},
  };
  state.units['beast-1'] = {
    id: 'beast-1', type: 'beast_boar', owner: 'beasts', position: { q: 10, r: 10 },
    movementPointsLeft: 2, health: 100, experience: 0,
    hasMoved: false, hasActed: false, isResting: false,
  } as Unit;
  return state;
}

describe('getCurrentCiv', () => {
  it('reads the civ for state.currentPlayer, not a hardcoded id', () => {
    const state = makeFixture();
    const aiCivId = Object.keys(state.civilizations).find(id => id !== 'player')!;
    state.currentPlayer = aiCivId;
    const session = createGameSession(state);

    expect(getCurrentCiv(session)).toBe(state.civilizations[aiCivId]);
  });
});

describe('getCurrentCivDef', () => {
  it('returns undefined for a civType with no matching definition', () => {
    const state = makeFixture();
    state.civilizations.player.civType = 'generic';
    const session = createGameSession(state);

    expect(getCurrentCivDef(session)).toBeUndefined();
  });

  it('resolves a real civ definition (with bonusEffect) for a known civType', () => {
    const state = makeFixture();
    state.civilizations.player.civType = 'egypt';
    const session = createGameSession(state);

    const def = getCurrentCivDef(session);
    expect(def?.id).toBe('egypt');
    expect(def?.bonusEffect).toBeDefined();
  });
});

describe('clearUnloadState', () => {
  it('clears a pending unload intent', () => {
    const setPendingIntent = vi.fn();
    const selection = {
      getPendingIntent: vi.fn(() => ({
        kind: 'unload' as const, transportId: 'transport-1', cargoUnitId: 'cargo-1', range: [],
      })),
      setPendingIntent,
    };

    clearUnloadState(selection);

    expect(setPendingIntent).toHaveBeenCalledWith({ kind: 'none' });
  });

  it('leaves a non-unload pending intent untouched (e.g. air mission, journey, city-capture choice)', () => {
    const setPendingIntent = vi.fn();
    const selection = {
      getPendingIntent: vi.fn(() => ({ kind: 'air-mission' as const, unitId: 'unit-1', mission: 'strike' as const })),
      setPendingIntent,
    };

    clearUnloadState(selection);

    expect(setPendingIntent).not.toHaveBeenCalled();
  });
});

describe('prefersReducedMotion', () => {
  it('returns true when matchMedia reports the reduced-motion query matches', () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockReturnValue({ matches: true }),
    });

    expect(prefersReducedMotion()).toBe(true);
  });

  it('returns false when matchMedia reports no match', () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockReturnValue({ matches: false }),
    });

    expect(prefersReducedMotion()).toBe(false);
  });
});

describe('scanBeastSightings', () => {
  it('does nothing when the current civ has no visibility tiles yet', () => {
    const state = stateWithLair();
    const session = createGameSession(state);
    const bus = new EventBus();
    const emit = vi.spyOn(bus, 'emit');

    scanBeastSightings(session, bus);

    expect(session.getState().beasts!.sightingsByCiv.player ?? []).toEqual([]);
    expect(emit).not.toHaveBeenCalled();
  });

  it('records a real new sighting and emits beast:sighted when the beast tile is visible', () => {
    const state = stateWithLair();
    state.civilizations.player.visibility = { tiles: { [hexKey({ q: 10, r: 10 })]: 'visible' } };
    const session = createGameSession(state);
    const bus = new EventBus();
    const emit = vi.spyOn(bus, 'emit');

    scanBeastSightings(session, bus);

    expect(session.getState().beasts!.sightingsByCiv.player).toEqual(['giant_boar']);
    expect(emit).toHaveBeenCalledWith('beast:sighted', { beastId: 'giant_boar', civId: 'player' });
  });

  it('does not re-emit for a beast already recorded as sighted (steady-state scan)', () => {
    const state = stateWithLair();
    state.civilizations.player.visibility = { tiles: { [hexKey({ q: 10, r: 10 })]: 'visible' } };
    state.beasts!.sightingsByCiv.player = ['giant_boar'];
    const session = createGameSession(state);
    const bus = new EventBus();
    const emit = vi.spyOn(bus, 'emit');

    scanBeastSightings(session, bus);

    expect(emit).not.toHaveBeenCalled();
  });
});

describe('scanSubmarineSightings', () => {
  function stateWithSubmarine(gameId: string): GameState {
    const state = createNewGame(undefined, `cross-cutting-submarine-${gameId}`, 'small');
    // scanSubmarineSightings keys its cross-test-persistent cache off
    // playthroughId (not gameId, which is now a pure seed hash) -- see the
    // GameState field docs in core/types.ts.
    state.playthroughId = gameId;
    state.currentPlayer = 'player';
    const aiCivId = Object.keys(state.civilizations).find(id => id !== 'player')!;
    const sub = { ...createUnit('submarine', aiCivId, { q: 0, r: 0 }, state.idCounters), id: 'sub-1' };
    state.map.tiles[hexKey({ q: 0, r: 0 })].terrain = 'ocean';
    state.map.tiles[hexKey({ q: 1, r: 0 })].terrain = 'ocean';
    state.units = { [sub.id]: sub };
    state.civilizations[aiCivId].units = [sub.id];
    return state;
  }

  it('emits submarine:sighted the first time an enemy submarine is detected', () => {
    const state = stateWithSubmarine('scan-1');
    const galley = { ...createUnit('galley', 'player', { q: 1, r: 0 }, state.idCounters), id: 'galley' };
    state.units.galley = galley;
    state.civilizations.player.units.push('galley');
    const session = createGameSession(state);
    const bus = new EventBus();
    const emit = vi.spyOn(bus, 'emit');

    scanSubmarineSightings(session, bus);

    expect(emit).toHaveBeenCalledWith('submarine:sighted', { unitId: 'sub-1', civId: 'player' });
  });

  it('does not re-emit for a submarine already notified this game (steady-state scan)', () => {
    const state = stateWithSubmarine('scan-2');
    const galley = { ...createUnit('galley', 'player', { q: 1, r: 0 }, state.idCounters), id: 'galley' };
    state.units.galley = galley;
    state.civilizations.player.units.push('galley');
    const session = createGameSession(state);
    const bus = new EventBus();

    scanSubmarineSightings(session, bus); // first scan: notifies
    const emit = vi.spyOn(bus, 'emit');
    scanSubmarineSightings(session, bus); // second scan: same game, same sighting

    expect(emit).not.toHaveBeenCalled();
  });

  it('does not emit for a submarine with no detector nearby', () => {
    const state = stateWithSubmarine('scan-3');
    const session = createGameSession(state);
    const bus = new EventBus();
    const emit = vi.spyOn(bus, 'emit');

    scanSubmarineSightings(session, bus);

    expect(emit).not.toHaveBeenCalled();
  });

  it('does not emit for a reveal-on-fire submarine (combat notification already covers it)', () => {
    const state = stateWithSubmarine('scan-4');
    state.units['sub-1'].revealedThisTurn = true;
    const session = createGameSession(state);
    const bus = new EventBus();
    const emit = vi.spyOn(bus, 'emit');

    scanSubmarineSightings(session, bus);

    expect(emit).not.toHaveBeenCalled();
  });

  it('re-emits after the submarine conceals again and is later re-detected', () => {
    const state = stateWithSubmarine('scan-5');
    const galley = { ...createUnit('galley', 'player', { q: 1, r: 0 }, state.idCounters), id: 'galley' };
    state.units.galley = galley;
    state.civilizations.player.units.push('galley');
    const session = createGameSession(state);
    const bus = new EventBus();

    scanSubmarineSightings(session, bus); // detected, notifies

    // detector leaves -- submarine conceals again
    session.getState().units.galley.position = { q: 5, r: 5 };
    scanSubmarineSightings(session, bus); // concealed: clears the "already notified" entry

    // detector returns
    session.getState().units.galley.position = { q: 1, r: 0 };
    const emit = vi.spyOn(bus, 'emit');
    scanSubmarineSightings(session, bus);

    expect(emit).toHaveBeenCalledWith('submarine:sighted', { unitId: 'sub-1', civId: 'player' });
  });
});

describe('focusNotificationTarget', () => {
  it('does nothing when there is no target', () => {
    const state = makeFixture();
    const session = createGameSession(state);
    const renderLoop = { camera: { centerOn: vi.fn() } };
    const notifier = { toast: vi.fn() };

    focusNotificationTarget(renderLoop, notifier, session, undefined);

    expect(renderLoop.camera.centerOn).not.toHaveBeenCalled();
    expect(notifier.toast).not.toHaveBeenCalled();
  });

  it('centers the camera and reports a currently-visible target as focused', () => {
    const state = makeFixture();
    const coord = { q: 3, r: 4 };
    state.civilizations.player.visibility = { tiles: { [hexKey(coord)]: 'visible' } };
    const session = createGameSession(state);
    const renderLoop = { camera: { centerOn: vi.fn() } };
    const notifier = { toast: vi.fn() };
    const target = { kind: 'map' as const, coord, label: 'Ancient Ruins' };

    focusNotificationTarget(renderLoop, notifier, session, target);

    expect(renderLoop.camera.centerOn).toHaveBeenCalledWith(coord);
    expect(notifier.toast).toHaveBeenCalledWith('Focused Ancient Ruins.', 'info');
  });

  it('reports a no-longer-visible target as last spotted here', () => {
    const state = makeFixture();
    const coord = { q: 3, r: 4 };
    const session = createGameSession(state);
    const renderLoop = { camera: { centerOn: vi.fn() } };
    const notifier = { toast: vi.fn() };
    const target = { kind: 'map' as const, coord, label: 'Ancient Ruins' };

    focusNotificationTarget(renderLoop, notifier, session, target);

    expect(notifier.toast).toHaveBeenCalledWith('Ancient Ruins was last spotted here.', 'info');
  });
});

describe('focusPirateTarget', () => {
  it('centers on a headquarters target coord', () => {
    const renderLoop = { camera: { centerOn: vi.fn() } };
    const notifier = { toast: vi.fn() };
    const coord = { q: 5, r: 5 };

    focusPirateTarget(renderLoop, notifier, { kind: 'headquarters', coord, current: true, label: 'Pirate Cove' });

    expect(renderLoop.camera.centerOn).toHaveBeenCalledWith(coord);
    expect(notifier.toast).toHaveBeenCalledWith('Pirate Cove', 'info');
  });

  it('centers on a region target center, not a coord field', () => {
    const renderLoop = { camera: { centerOn: vi.fn() } };
    const notifier = { toast: vi.fn() };
    const center = { q: 7, r: 8 };

    focusPirateTarget(renderLoop, notifier, { kind: 'region', center, radius: 2, label: 'Contested Waters' });

    expect(renderLoop.camera.centerOn).toHaveBeenCalledWith(center);
    expect(notifier.toast).toHaveBeenCalledWith('Contested Waters', 'info');
  });
});

describe('notifyPlayer', () => {
  it('toasts and appends a persistent log entry for the current player', () => {
    const state = makeFixture();
    const session = createGameSession(state);
    const notifier = { toast: vi.fn() };

    notifyPlayer(notifier, session, 'Something happened', 'warning');

    expect(notifier.toast).toHaveBeenCalledWith('Something happened', 'warning', undefined);
    const log = session.getState().notificationLog!.player;
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ message: 'Something happened', type: 'warning', turn: state.turn });
  });

  it('defaults to type info and threads a target through to both the toast and the log', () => {
    const state = makeFixture();
    const session = createGameSession(state);
    const notifier = { toast: vi.fn() };
    const target = { kind: 'map' as const, coord: { q: 1, r: 1 }, label: 'Somewhere' };

    notifyPlayer(notifier, session, 'Default type', undefined, target);

    expect(notifier.toast).toHaveBeenCalledWith('Default type', 'info', target);
    expect(session.getState().notificationLog!.player[0]).toMatchObject({ type: 'info', target });
  });
});

describe('applyPirateActionResult', () => {
  function makeDeps(state: GameState) {
    return {
      session: createGameSession(state),
      bus: new EventBus(),
      renderLoop: { setGameState: vi.fn() },
      updateHUD: vi.fn(),
      showNotification: vi.fn(),
    };
  }

  it('shows the failure reason and does not touch state on failure', () => {
    const state = makeFixture();
    const deps = makeDeps(state);

    applyPirateActionResult(deps, { success: false, state, reason: 'Not enough gold.', events: [] }, 'Should not show');

    expect(deps.showNotification).toHaveBeenCalledWith('Not enough gold.', 'warning');
    expect(deps.renderLoop.setGameState).not.toHaveBeenCalled();
    expect(deps.updateHUD).not.toHaveBeenCalled();
  });

  it('falls back to a generic failure message when reason is null', () => {
    const state = makeFixture();
    const deps = makeDeps(state);

    applyPirateActionResult(deps, { success: false, state, reason: null, events: [] }, 'Should not show');

    expect(deps.showNotification).toHaveBeenCalledWith('That pirate action is no longer available.', 'warning');
  });

  it('commits the new state, refreshes renderer/HUD, and emits a tribute audio cue on success', () => {
    const state = makeFixture();
    const deps = makeDeps(state);
    const nextState = { ...state, turn: state.turn + 1 };
    const emit = vi.spyOn(deps.bus, 'emit');

    applyPirateActionResult(deps, {
      success: true,
      state: nextState,
      reason: null,
      events: [{ type: 'tribute-paid', factionId: 'faction-1', civId: 'player', cost: 50 }],
    }, 'Pirate tribute paid.');

    expect(deps.session.getState()).toBe(nextState);
    expect(deps.renderLoop.setGameState).toHaveBeenCalledWith(nextState);
    expect(deps.updateHUD).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith('pirate:audio-cue', { cue: 'tribute', factionId: 'faction-1', viewerIds: ['player'] });
    expect(deps.showNotification).toHaveBeenCalledWith('Pirate tribute paid.', 'success');
  });

  it('emits a contract-accepted audio cue for the employer, not the target', () => {
    const state = makeFixture();
    const deps = makeDeps(state);
    const emit = vi.spyOn(deps.bus, 'emit');

    applyPirateActionResult(deps, {
      success: true,
      state,
      reason: null,
      events: [{ type: 'contract-accepted', factionId: 'faction-1', employerId: 'player', targetId: 'ai-1', cost: 100 }],
    }, 'Pirate flotilla hired.');

    expect(emit).toHaveBeenCalledWith('pirate:audio-cue', { cue: 'contract-accepted', factionId: 'faction-1', viewerIds: ['player'] });
  });
});
