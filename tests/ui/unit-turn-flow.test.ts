// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GameState, HexCoord } from '@/core/types';
import { createUnit } from '@/systems/unit-system';
import { createUnitTurnFlow, type UnitTurnFlowDeps } from '@/ui/unit-turn-flow';

const mkC = () => ({ nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 });

function clickButtonWithText(container: ParentNode, text: string): void {
  const button = Array.from(container.querySelectorAll('button')).find(candidate => candidate.textContent === text);
  expect(button).toBeDefined();
  button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

function makeState(): GameState {
  const scout = { ...createUnit('scout', 'player', { q: 2, r: 3 }, mkC()), id: 'unit-scout', health: 50 };
  const warrior = { ...createUnit('warrior', 'player', { q: 4, r: 3 }, mkC()), id: 'unit-warrior' };
  const enemy = { ...createUnit('warrior', 'ai-1', { q: 7, r: 7 }, mkC()), id: 'unit-enemy' };
  return {
    turn: 1,
    era: 1,
    currentPlayer: 'player',
    gameOver: false,
    winner: null,
    map: { width: 10, height: 10, wrapsHorizontally: false, rivers: [], tiles: {} },
    units: {
      [scout.id]: scout,
      [warrior.id]: warrior,
      [enemy.id]: enemy,
    },
    cities: {},
    civilizations: {
      player: {
        id: 'player',
        name: 'Player',
        civType: 'rome',
        color: '#fff',
        cities: [],
        units: [scout.id, warrior.id],
        gold: 0,
        score: 0,
        techState: { completed: [], currentResearch: null, researchProgress: 0, researchQueue: [] },
        visibility: { tiles: {} },
        diplomacy: { relationships: {}, atWarWith: [], treaties: [], tradeRoutes: [], diplomaticCapital: 0 },
      },
      'ai-1': {
        id: 'ai-1',
        name: 'AI',
        civType: 'greece',
        color: '#f00',
        cities: [],
        units: [enemy.id],
        gold: 0,
        score: 0,
        techState: { completed: [], currentResearch: null, researchProgress: 0, researchQueue: [] },
        visibility: { tiles: {} },
        diplomacy: { relationships: {}, atWarWith: [], treaties: [], tradeRoutes: [], diplomaticCapital: 0 },
      },
    },
    minorCivs: {},
    barbarianCamps: {},
    tribalVillages: {},
    discoveredWonders: {},
    wonderDiscoverers: {},
    embargoes: [],
    defensiveLeagues: [],
    pendingEvents: undefined,
    settings: {
      mapSize: 'small',
      soundEnabled: false,
      musicEnabled: false,
      musicVolume: 0,
      sfxVolume: 0,
      tutorialEnabled: false,
      advisorsEnabled: {},
      councilTalkLevel: 'minimal',
    },
  } as unknown as GameState;
}

function makeFlow(initialState: GameState) {
  let state = initialState;
  let selectedUnitId: string | null = 'unit-scout';
  const overlayStates: Array<string | null> = [];
  const calls = {
    selectUnit: vi.fn((unitId: string) => { selectedUnitId = unitId; }),
    deselectUnit: vi.fn(() => { selectedUnitId = null; }),
    selectNextUnit: vi.fn(),
    centerOn: vi.fn(),
    refreshVisibility: vi.fn(),
    setRenderState: vi.fn(),
    updateHUD: vi.fn(),
    showNotification: vi.fn(),
    endTurn: vi.fn(),
  };
  const deps: UnitTurnFlowDeps = {
    uiLayer: document.body,
    getState: () => state,
    setState: next => { state = next; },
    getSelectedUnitId: () => selectedUnitId,
    selectUnit: calls.selectUnit,
    deselectUnit: calls.deselectUnit,
    selectNextUnit: calls.selectNextUnit,
    centerOn: calls.centerOn,
    refreshVisibility: calls.refreshVisibility,
    setRenderState: calls.setRenderState,
    updateHUD: calls.updateHUD,
    showNotification: calls.showNotification,
    setBlockingOverlay: id => { overlayStates.push(id); },
    endTurn: calls.endTurn,
  };

  return {
    flow: createUnitTurnFlow(deps),
    getState: () => state,
    calls,
    overlayStates,
  };
}

describe('unit-turn-flow', () => {
  afterEach(() => {
    document.body.textContent = '';
  });

  it('skips the selected unit, updates render/HUD, and advances unit cycling', () => {
    const { flow, getState, calls } = makeFlow(makeState());

    flow.skipUnitAction('unit-scout');

    expect(getState().units['unit-scout'].skippedTurn).toBe(true);
    expect(getState().units['unit-scout'].hasMoved).toBe(false);
    expect(getState().units['unit-scout'].hasActed).toBe(false);
    expect(calls.setRenderState).toHaveBeenCalledWith(getState());
    expect(calls.updateHUD).toHaveBeenCalledTimes(1);
    expect(calls.selectNextUnit).toHaveBeenCalledTimes(1);
  });

  it('opens delete confirmation without mutating state and clears overlay on cancel', () => {
    const { flow, getState, overlayStates } = makeFlow(makeState());

    flow.showDeleteUnitConfirmation('unit-scout');

    expect(document.querySelector('#unit-delete-confirmation-panel')).toBeTruthy();
    expect(getState().units['unit-scout']).toBeDefined();
    expect(overlayStates).toEqual(['unit-delete-confirmation']);

    clickButtonWithText(document.body, 'Cancel');

    expect(getState().units['unit-scout']).toBeDefined();
    expect(document.querySelector('#unit-delete-confirmation-panel')).toBeNull();
    expect(overlayStates).toEqual(['unit-delete-confirmation', null]);
  });

  it('confirms deletion, refreshes visibility, clears overlay, and advances unit cycling', () => {
    const { flow, getState, calls, overlayStates } = makeFlow(makeState());

    flow.showDeleteUnitConfirmation('unit-scout');
    clickButtonWithText(document.body, 'Delete Unit');

    expect(getState().units['unit-scout']).toBeUndefined();
    expect(getState().civilizations.player.units).not.toContain('unit-scout');
    expect(calls.refreshVisibility).toHaveBeenCalledTimes(1);
    expect(calls.setRenderState).toHaveBeenCalledWith(getState());
    expect(calls.updateHUD).toHaveBeenCalledTimes(1);
    expect(calls.deselectUnit).toHaveBeenCalledTimes(1);
    expect(calls.selectNextUnit).toHaveBeenCalledTimes(1);
    expect(overlayStates).toEqual(['unit-delete-confirmation', null]);
  });

  it('opens an end-turn warning and routes Go to Unit through selection and camera centering', () => {
    const { flow, calls, overlayStates } = makeFlow(makeState());

    const blocked = flow.showEndTurnUnitWarningIfNeeded();

    expect(blocked).toBe(true);
    expect(document.body.textContent).toContain('units still need orders');
    expect(overlayStates).toEqual(['end-turn-warning']);

    clickButtonWithText(document.body, 'Go to Unit');

    expect(document.querySelector('#end-turn-warning-panel')).toBeNull();
    expect(calls.selectUnit).toHaveBeenCalledWith('unit-scout');
    expect(calls.centerOn).toHaveBeenCalledWith({ q: 2, r: 3 });
    expect(overlayStates).toEqual(['end-turn-warning', null]);
  });

  it('bypasses only the unit warning when End Turn Anyway is clicked', () => {
    const { flow, calls, overlayStates } = makeFlow(makeState());

    flow.showEndTurnUnitWarningIfNeeded();
    clickButtonWithText(document.body, 'End Turn Anyway');

    expect(document.querySelector('#end-turn-warning-panel')).toBeNull();
    expect(calls.endTurn).toHaveBeenCalledWith({ allowUnmovedUnits: true });
    expect(overlayStates).toEqual(['end-turn-warning', null]);
  });

  it('does not show an end-turn warning when all current-player units are moved, acted, or skipped', () => {
    const state = makeState();
    state.units['unit-scout'] = { ...state.units['unit-scout'], skippedTurn: true, movementPointsLeft: 0 };
    state.units['unit-warrior'] = { ...state.units['unit-warrior'], hasMoved: true, movementPointsLeft: 0 };
    const { flow, overlayStates } = makeFlow(state);

    const blocked = flow.showEndTurnUnitWarningIfNeeded();

    expect(blocked).toBe(false);
    expect(document.querySelector('#end-turn-warning-panel')).toBeNull();
    expect(overlayStates).toEqual([]);
  });
});
