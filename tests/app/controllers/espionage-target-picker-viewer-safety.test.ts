// @vitest-environment jsdom
import { describe, it, vi, afterEach } from 'vitest';
import { createNewGame } from '@/core/game-state';
import { EventBus } from '@/core/event-bus';
import { createGameSession } from '@/app/game-session';
import { createEspionageCivState } from '@/systems/espionage-system';
import { recordCivilizationContact } from '@/systems/discovery-system';
import { hexKey } from '@/systems/hex-utils';
import type { GameState, Spy } from '@/core/types';
import { createPanelActionsController, type PanelActionsControllerDeps } from '@/app/controllers/panel-actions-controller';
import {
  domProjection,
  expectHotSeatDifferential,
  expectViewerSafety,
  type ViewerSurface,
  type WorldMutation,
} from '../../helpers/viewer-safety';

vi.mock('@/ui/espionage-panel', async () => {
  const actual = await vi.importActual<typeof import('@/ui/espionage-panel')>('@/ui/espionage-panel');
  return { ...actual, createEspionagePanel: vi.fn(() => document.createElement('div')) };
});

import { createEspionagePanel } from '@/ui/espionage-panel';

/**
 * #1002 differential cover for the remote-mission target picker (#1780).
 *
 * `panel-actions-controller.test.ts` guards the picker with hand-picked `not.toContain('Strangeport')` checks. The
 * picker is a window onto what a seat has earned: a rival it has met and a city of it that it has found. The
 * projection for a seat is the picker the real controller builds when that seat starts a remote mission: every
 * attribute and word in it. A rival the seat has not met, or a city it has not found, must leave it untouched; meeting
 * the rival and finding its city must move it.
 */

const AI = 'ai-1';
const STRANGER = 'ai-stranger';
const QUIET = 'ai-quiet';

function makeCity(id: string, owner: string, name: string, position: { q: number; r: number }): GameState['cities'][string] {
  return {
    id, name, owner, position,
    population: 1, food: 0, foodNeeded: 10, buildings: [], productionQueue: [], productionProgress: 0,
    ownedTiles: [], workedTiles: [], focus: 'balanced', maturity: 'outpost',
    unrestLevel: 0, unrestTurns: 0, spyUnrestBonus: 0,
  };
}

function addCity(state: GameState, city: GameState['cities'][string]): void {
  state.cities[city.id] = city;
  state.civilizations[city.owner]!.cities = [city.id, ...state.civilizations[city.owner]!.cities];
}

function discover(state: GameState, viewer: string, cityId: string): void {
  state.civilizations[viewer]!.visibility.tiles[hexKey(state.cities[cityId]!.position)] = 'fog';
}

function buildWorld(): GameState {
  const state = createNewGame(undefined, 'espionage-picker-viewer-safety', 'small');
  state.currentPlayer = 'player';
  state.civilizations[STRANGER] = {
    ...structuredClone(state.civilizations[AI]!), id: STRANGER, name: 'Strangers', cities: [], units: [],
  };
  for (const civ of Object.values(state.civilizations)) {
    civ.knownCivilizations = [];
    civ.techState.completed = ['satellite-surveillance', 'cyber-intelligence'];
    for (const key of Object.keys(civ.visibility.tiles)) civ.visibility.tiles[key] = 'unexplored';
  }
  addCity(state, makeCity('known-city', AI, 'Knownville', { q: 2, r: 2 }));
  addCity(state, makeCity('unfound-city', AI, 'Hiddenburg', { q: 5, r: 5 }));
  addCity(state, makeCity('stranger-city', STRANGER, 'Strangeport', { q: 8, r: 8 }));
  // A rival the seat has met but not one of whose cities it has found.
  state.civilizations[QUIET] = {
    ...structuredClone(state.civilizations[AI]!), id: QUIET, name: 'Quiet Folk', cities: [], units: [],
  };
  addCity(state, makeCity('quiet-city', QUIET, 'Quietville', { q: 3, r: 8 }));
  // The seat's own found city: a mission is never aimed at oneself, and renaming it must change nothing.
  addCity(state, makeCity('home-city', 'player', 'Homestead', { q: 1, r: 8 }));
  discover(state, 'player', 'home-city');
  discover(state, 'player', 'known-city');
  recordCivilizationContact(state, 'player', AI);
  recordCivilizationContact(state, 'player', QUIET);
  return state;
}

/** Every seat that can start a mission gets the same idle spy, so what differs between seats is only what it knows. */
function giveSpy(state: GameState, seat: string): void {
  const spy: Spy = {
    id: 'spy-1', owner: seat, name: 'Agent spy-1', unitType: 'spy_scout',
    targetCivId: null, targetCityId: null, position: null,
    status: 'idle', experience: 0, currentMission: null,
    cooldownTurns: 0, promotion: undefined, promotionAvailable: false,
    feedsFalseIntel: false,
  };
  const existing = state.espionage?.[seat] ?? createEspionageCivState();
  state.espionage = { ...state.espionage, [seat]: { ...existing, spies: { ...existing.spies, [spy.id]: spy } } };
}

function makeDeps(state: GameState): PanelActionsControllerDeps {
  const session = createGameSession(state);
  return {
    session,
    bus: new EventBus(),
    uiLayer: document.createElement('div'),
    getElementById: (id: string) => document.getElementById(id),
    hud: { closeDrawer: vi.fn(), update: vi.fn() },
    showNotification: vi.fn(),
    showEspionageCaptureChoice: vi.fn(),
    currentCiv: () => session.getState().civilizations[session.getState().currentPlayer],
    currentCivDef: () => undefined,
    router: { open: vi.fn() },
  } as unknown as PanelActionsControllerDeps;
}

type PickerWorld = GameState;

const surfaceFor = (mission: string): ViewerSurface<PickerWorld, unknown> => ({
  name: `espionage target picker (${mission})`,
  project(world, viewerId) {
    const state = structuredClone(world);
    state.currentPlayer = viewerId;
    giveSpy(state, viewerId);
    vi.mocked(createEspionagePanel).mockClear();
    vi.spyOn(window, 'prompt').mockReturnValue(mission);
    const deps = makeDeps(state);
    const controller = createPanelActionsController(deps);
    controller.openEspionagePanel();
    const options = vi.mocked(createEspionagePanel).mock.calls.at(-1)![1] as { onStartMission: (spyId: string) => void };
    options.onStartMission('spy-1');
    const picker = deps.uiLayer.querySelector('#espionage-target-picker');
    return picker ? domProjection(picker) : 'no picker';
  },
});

const edit = (label: string, apply: (world: PickerWorld) => void): WorldMutation<PickerWorld> => ({ label, apply });

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the espionage target picker is viewer-safe (differential)', () => {
  it('an empire mission lists only met empires with a found city', () => {
    expectViewerSafety(surfaceFor('satellite_surveillance'), {
      world: buildWorld(),
      viewerId: 'player',
      hidden: [
        edit('an unmet empire grows another city', w => addCity(w, makeCity('stranger-two', STRANGER, 'Strangetown', { q: 9, r: 9 }))),
        edit('an unmet empire is renamed', w => { w.civilizations[STRANGER]!.name = 'Outsiders'; }),
        edit('a met empire founds a city the seat has not found', w => addCity(w, makeCity('late-city', AI, 'Aaa Latecity', { q: 6, r: 6 }))),
        edit('a met empire\'s unfound city is renamed', w => { w.cities['unfound-city']!.name = 'Zzz Renamed'; }),
        edit('an unmet empire\'s city is seen by someone else', w => discover(w, AI, 'stranger-city')),
        edit('the seat sees an unmet empire\'s city without having met it', w => discover(w, 'player', 'stranger-city')),
        edit('a met empire that has no found city is renamed', w => { w.civilizations[QUIET]!.name = 'Silent Folk'; }),
        edit('the seat\'s own city is renamed', w => { w.cities['home-city']!.name = 'Zzz Homestead'; }),
      ],
      earned: [
        edit('the seat finds a city of a met empire that had none found', w => discover(w, 'player', 'quiet-city')),
        edit('the seat meets the empire and finds its city', w => {
          recordCivilizationContact(w, 'player', STRANGER);
          discover(w, 'player', 'stranger-city');
        }),
      ],
    });
  });

  it('a city mission lists only found cities of met empires', () => {
    expectViewerSafety(surfaceFor('cyber_attack'), {
      world: buildWorld(),
      viewerId: 'player',
      hidden: [
        edit('an unmet empire grows another city', w => addCity(w, makeCity('stranger-two', STRANGER, 'Strangetown', { q: 9, r: 9 }))),
        edit('an unmet empire\'s city is found by no one the seat knows', w => discover(w, AI, 'stranger-city')),
        edit('a met empire\'s unfound city is renamed', w => { w.cities['unfound-city']!.name = 'Zzz Renamed'; }),
        edit('a met empire founds a city the seat has not found', w => addCity(w, makeCity('late-city', AI, 'Aaa Latecity', { q: 6, r: 6 }))),
        edit('the seat\'s own city is renamed', w => { w.cities['home-city']!.name = 'Zzz Homestead'; }),
        edit('the seat sees an unmet empire\'s city without having met it', w => discover(w, 'player', 'stranger-city')),
      ],
      earned: [
        edit('the seat finds another city of the met empire', w => discover(w, 'player', 'unfound-city')),
      ],
    });
  });

  it('hot seat: a rival only one seat has met is offered only to that seat', () => {
    const world = buildWorld();
    // The second seat has met the first and nobody else.
    recordCivilizationContact(world, AI, 'player');
    expectHotSeatDifferential(surfaceFor('satellite_surveillance'), {
      world,
      viewers: ['player', AI],
      knownOnlyTo: 'player',
      mutation: edit('the first seat meets the strangers and finds their city', w => {
        recordCivilizationContact(w, 'player', STRANGER);
        discover(w, 'player', 'stranger-city');
      }),
    });
  });
});
