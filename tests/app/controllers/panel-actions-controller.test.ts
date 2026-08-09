// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createNewGame } from '@/core/game-state';
import { EventBus } from '@/core/event-bus';
import { createGameSession } from '@/app/game-session';
import { createEmptyPirateState, type PirateFactionState } from '@/core/pirate-state';
import { createUnit } from '@/systems/unit-system';
import type { PirateFocusTarget } from '@/systems/pirate-presentation';
import type { NotificationMapTarget } from '@/core/notification-log';
import type { GameState, HexCoord } from '@/core/types';
import {
  createPanelActionsController,
  type PanelActionsControllerDeps,
} from '@/app/controllers/panel-actions-controller';

vi.mock('@/ui/pacing-debug-panel', () => ({ createPacingDebugPanel: vi.fn() }));
vi.mock('@/ui/bestiary-panel', () => ({ createBestiaryPanel: vi.fn() }));
vi.mock('@/ui/wonder-atlas-panel', () => ({ createWonderAtlasPanel: vi.fn() }));
vi.mock('@/ui/pirate-waters-panel', () => ({ createPirateWatersPanel: vi.fn() }));
vi.mock('@/ui/pirate-headquarters-assault-panel', () => ({ createPirateHeadquartersAssaultPanel: vi.fn() }));
vi.mock('@/ui/notification-log-panel', () => ({ createNotificationLogPanel: vi.fn() }));

import { createPacingDebugPanel } from '@/ui/pacing-debug-panel';
import { createBestiaryPanel } from '@/ui/bestiary-panel';
import { createWonderAtlasPanel } from '@/ui/wonder-atlas-panel';
import { createPirateWatersPanel } from '@/ui/pirate-waters-panel';
import { createPirateHeadquartersAssaultPanel } from '@/ui/pirate-headquarters-assault-panel';
import { createNotificationLogPanel } from '@/ui/notification-log-panel';

function mockedCallArg<T = unknown>(mockFn: unknown, callIndex: number, argIndex: number): T {
  return (mockFn as ReturnType<typeof vi.fn>).mock.calls[callIndex][argIndex] as T;
}

function makeFixture(seed = 'panel-actions-controller'): { state: GameState; aiCivId: string } {
  const state = createNewGame(undefined, seed, 'small');
  state.currentPlayer = 'player';
  const aiCivId = Object.keys(state.civilizations).find(id => id !== 'player')!;
  return { state, aiCivId };
}

/** A coastal-enclave pirate faction adjacent to a real player unit, with intel already gathered. */
function addPirateFixture(state: GameState, hqPosition: HexCoord, unitPosition: HexCoord, unitId: string): void {
  state.map.tiles[`${hqPosition.q},${hqPosition.r}`] = {
    coord: hqPosition, terrain: 'plains', elevation: 'lowland', resource: null,
    improvement: 'none', owner: null, improvementTurnsLeft: 0, hasRiver: false, wonder: null,
  };
  state.map.tiles[`${unitPosition.q},${unitPosition.r}`] = {
    coord: unitPosition, terrain: 'coast', elevation: 'lowland', resource: null,
    improvement: 'none', owner: null, improvementTurnsLeft: 0, hasRiver: false, wonder: null,
  };
  const idCounters = { nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 };
  state.units[unitId] = { ...createUnit('trireme', 'player', unitPosition, idCounters), id: unitId };
  state.civilizations.player.units.push(unitId);
  state.pirates = createEmptyPirateState();
  state.pirates.factions['pirate-1'] = {
    id: 'pirate-1', name: 'The Red Wake', spawnedRound: 1, behavior: 'raiding',
    maritimeStage: 3, notoriety: 2, shipIds: [],
    headquarters: { kind: 'coastal-enclave', position: hqPosition, integrity: 100, maxIntegrity: 100 },
    tributeByCiv: {}, demandByCiv: {}, contract: null, intent: null,
    transitionGuards: { emittedEventKeys: [] },
  } satisfies PirateFactionState;
  state.civilizations.player.visibility.tiles[`${hqPosition.q},${hqPosition.r}`] = 'visible';
  state.pirates.intelByCiv.player = {
    'pirate-1': {
      factionId: 'pirate-1', level: 'sighted', discoveredRound: 1, lastUpdatedRound: 1,
      lastKnownHeadquarters: { kind: 'coastal-enclave', position: hqPosition, observedRound: 1, integrityBand: 'healthy' },
      knownBehavior: 'raiding', knownMaritimeStage: 3, observedUnitIds: [],
    },
  };
}

function makeDeps(state: GameState, overrides: Partial<PanelActionsControllerDeps> = {}) {
  return {
    session: createGameSession(state),
    bus: new EventBus(),
    uiLayer: document.createElement('div'),
    getElementById: vi.fn((id: string) => document.getElementById(id)),
    selection: {
      setPirateSelection: vi.fn(),
      getPirateSelection: vi.fn(() => ({ factionId: null, historyId: null })),
      getSelectedUnitId: vi.fn(() => null),
    },
    selectionController: { selectUnit: vi.fn(), deselectUnit: vi.fn() },
    hud: { closeDrawer: vi.fn(), update: vi.fn() },
    audio: {
      stopNaturalWonderAmbient: vi.fn(), startNaturalWonderCodexAmbient: vi.fn(), playNaturalWonderReplay: vi.fn(),
      stopPirateAmbience: vi.fn(), startPirateHeadquartersAmbience: vi.fn(),
    },
    renderLoop: {
      camera: { centerOn: vi.fn() }, setSelectedPirateFactionId: vi.fn(),
      applyPirateHeadquartersAssaultVisual: vi.fn(), setGameState: vi.fn(),
    },
    showNotification: vi.fn(),
    focusNotificationTarget: vi.fn(),
    focusPirateTarget: vi.fn(),
    applyPirateActionResult: vi.fn(),
    openCityPanelForCity: vi.fn(),
    openWonderPanelForCityId: vi.fn(),
    ...overrides,
  };
}

function build(state: GameState, overrides: Partial<PanelActionsControllerDeps> = {}) {
  const deps = makeDeps(state, overrides);
  const controller = createPanelActionsController(deps);
  return { deps, controller };
}

describe('PanelActionsController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('openPacingDebugPanel', () => {
    it('builds the panel from the current session state', () => {
      const { state } = makeFixture('pacing-debug');
      const { deps, controller } = build(state);

      controller.openPacingDebugPanel();

      expect(createPacingDebugPanel).toHaveBeenCalledWith(deps.uiLayer, deps.session.getState());
    });
  });

  describe('openBestiary', () => {
    it('resolves slayer names against the live session civ roster', () => {
      const { state, aiCivId } = makeFixture('bestiary');
      const { controller } = build(state);

      controller.openBestiary();

      const options = mockedCallArg<{ slayerNameFor: (id: string) => string }>(createBestiaryPanel, 0, 2);
      expect(options.slayerNameFor(aiCivId)).toBe(state.civilizations[aiCivId].name);
      expect(options.slayerNameFor('no-such-civ')).toBe('no-such-civ');
    });
  });

  describe('openWonderAtlas', () => {
    it('closes the drawer, stops ambient audio, and wires the atlas callbacks', () => {
      const { state } = makeFixture('wonder-atlas');
      const { deps, controller } = build(state);

      controller.openWonderAtlas('great-lighthouse');

      expect(deps.hud.closeDrawer).toHaveBeenCalledTimes(1);
      expect(deps.audio.stopNaturalWonderAmbient).toHaveBeenCalledWith('codex-page-hidden');
      const options = mockedCallArg<{
        onViewOnMap: (coord: HexCoord) => void;
        onOpenCity: (cityId: string) => void;
        onNaturalWonderPageShown: (id: string) => void;
        onNaturalWonderPageHidden: () => void;
        onNaturalWonderReplay: (id: string) => void;
      }>(createWonderAtlasPanel, 0, 2);

      options.onViewOnMap({ q: 3, r: 3 });
      expect(deps.renderLoop.camera.centerOn).toHaveBeenCalledWith({ q: 3, r: 3 });

      options.onOpenCity('nonexistent-city');
      expect(deps.openCityPanelForCity).not.toHaveBeenCalled();

      options.onNaturalWonderPageShown('great-lighthouse');
      expect(deps.audio.startNaturalWonderCodexAmbient).toHaveBeenCalledWith('great-lighthouse');

      options.onNaturalWonderPageHidden();
      expect(deps.audio.stopNaturalWonderAmbient).toHaveBeenCalledTimes(2);

      options.onNaturalWonderReplay('great-lighthouse');
      expect(deps.audio.playNaturalWonderReplay).toHaveBeenCalledWith('great-lighthouse');
    });

    it('opens the founded city via the injected dep when one exists', () => {
      const { state } = makeFixture('wonder-atlas-city');
      state.cities['test-city'] = {
        id: 'test-city', name: 'Testopolis', owner: 'player', position: { q: 0, r: 0 },
        population: 1, food: 0, foodNeeded: 10, buildings: [], productionQueue: [], productionProgress: 0,
        ownedTiles: [], workedTiles: [], focus: 'balanced', maturity: 'outpost',
        unrestLevel: 0, unrestTurns: 0, spyUnrestBonus: 0,
      };
      const { deps, controller } = build(state);

      controller.openWonderAtlas();
      const options = mockedCallArg<{ onOpenCity: (cityId: string) => void }>(createWonderAtlasPanel, 0, 2);
      options.onOpenCity('test-city');

      expect(deps.openCityPanelForCity).toHaveBeenCalledWith(state.cities['test-city']);
    });
  });

  describe('openPirateWaters', () => {
    it('does not build a panel when no pirate intel or history is available', () => {
      const { state } = makeFixture('pirate-waters-unavailable');
      const { controller } = build(state);
      controller.openPirateWaters();
      expect(createPirateWatersPanel).not.toHaveBeenCalled();
    });

    it('renders with real presentation data and wires tribute/flotilla/focus callbacks', () => {
      const { state } = makeFixture('pirate-waters-available');
      addPirateFixture(state, { q: 5, r: 5 }, { q: 5, r: 4 }, 'attacker');
      state.civilizations.player.gold = 99999;
      const { deps, controller } = build(state);

      controller.openPirateWaters();

      expect(createPirateWatersPanel).toHaveBeenCalledTimes(1);
      const options = mockedCallArg<{
        onFocus: (target: PirateFocusTarget) => void;
        onPayTribute: (factionId: string) => void;
        onSelectFaction: (factionId: string) => void;
      }>(createPirateWatersPanel, 0, 2);
      const presentation = mockedCallArg<{ factions: Array<{ factionId: string }> }>(createPirateWatersPanel, 0, 1);
      expect(presentation.factions.map(f => f.factionId)).toContain('pirate-1');

      options.onFocus({ kind: 'region', center: { q: 5, r: 5 }, radius: 1, label: 'x' });
      expect(deps.focusPirateTarget).toHaveBeenCalledTimes(1);

      options.onPayTribute('pirate-1');
      expect(deps.applyPirateActionResult).toHaveBeenCalledWith(expect.anything(), 'Pirate tribute paid.');
      // onPayTribute re-renders the panel -- a second createPirateWatersPanel call
      expect(createPirateWatersPanel).toHaveBeenCalledTimes(2);
    });
  });

  describe('openPirateHeadquartersAssault', () => {
    it('shows a warning and never builds a panel when the assault is unavailable', () => {
      const { state } = makeFixture('assault-unavailable');
      const { deps, controller } = build(state);

      controller.openPirateHeadquartersAssault('no-such-faction', 'no-such-unit');

      expect(createPirateHeadquartersAssaultPanel).not.toHaveBeenCalled();
      expect(deps.showNotification).toHaveBeenCalledWith(expect.any(String), 'warning');
    });

    it('confirms a real assault: damages the target, refreshes, notifies, and reselects the unit', () => {
      const { state } = makeFixture('assault-ok');
      addPirateFixture(state, { q: 5, r: 5 }, { q: 5, r: 4 }, 'attacker');
      const fakePanel = { remove: vi.fn() };
      (createPirateHeadquartersAssaultPanel as ReturnType<typeof vi.fn>).mockReturnValue(fakePanel);
      const { deps, controller } = build(state);

      controller.openPirateHeadquartersAssault('pirate-1', 'attacker');

      expect(createPirateHeadquartersAssaultPanel).toHaveBeenCalledTimes(1);
      const options = mockedCallArg<{ onConfirm: () => void; onCancel: () => void }>(createPirateHeadquartersAssaultPanel, 0, 2);

      options.onConfirm();

      expect(fakePanel.remove).toHaveBeenCalledTimes(1);
      expect(deps.renderLoop.applyPirateHeadquartersAssaultVisual).toHaveBeenCalledTimes(1);
      expect(deps.renderLoop.setGameState).toHaveBeenCalled();
      expect(deps.hud.update).toHaveBeenCalled();
      expect(deps.showNotification).toHaveBeenCalledWith(expect.stringContaining('Pirate enclave'), expect.any(String));
      expect(deps.selectionController.selectUnit).toHaveBeenCalledWith('attacker');
      // onConfirm always reopens the waters panel for the assaulted faction afterward
      expect(createPirateWatersPanel).toHaveBeenCalledTimes(1);
    });
  });

  describe('openNotificationLog', () => {
    it('appends the panel and wires city/wonder/read/close callbacks against real state', () => {
      const { state } = makeFixture('notification-log');
      state.cities['test-city'] = {
        id: 'test-city', name: 'Testopolis', owner: 'player', position: { q: 0, r: 0 },
        population: 1, food: 0, foodNeeded: 10, buildings: [], productionQueue: [], productionProgress: 0,
        ownedTiles: [], workedTiles: [], focus: 'balanced', maturity: 'outpost',
        unrestLevel: 0, unrestTurns: 0, spyUnrestBonus: 0,
      };
      state.notificationLog = { player: [{ id: 'notification-1', message: 'Test', type: 'info', turn: state.turn, read: false }] };
      const fakePanel = document.createElement('div');
      const removeSpy = vi.spyOn(fakePanel, 'remove');
      (createNotificationLogPanel as ReturnType<typeof vi.fn>).mockReturnValue(fakePanel);
      const { deps, controller } = build(state);

      controller.openNotificationLog();

      expect(deps.uiLayer.contains(fakePanel)).toBe(true);
      const options = mockedCallArg<{
        onClose: () => void;
        onFocusTarget: (target: NotificationMapTarget) => void;
        onOpenCity: (cityId: string) => void;
        onMarkRead: (id: string) => void;
      }>(createNotificationLogPanel, 0, 1);

      options.onOpenCity('test-city');
      expect(deps.openCityPanelForCity).toHaveBeenCalledWith(state.cities['test-city']);
      expect(removeSpy).toHaveBeenCalledTimes(1);

      options.onClose();
      expect(removeSpy).toHaveBeenCalledTimes(2);

      options.onFocusTarget({ kind: 'map', coord: { q: 1, r: 1 }, label: 'x' });
      expect(deps.focusNotificationTarget).toHaveBeenCalledTimes(1);

      options.onMarkRead('notification-1');
      expect(deps.session.getState().notificationLog?.player?.[0].read).toBe(true);
    });

    it('shows a warning instead of opening a wonder panel for an unbuildable city', () => {
      const { state } = makeFixture('notification-log-wonder-fail');
      const { deps, controller } = build(state);

      controller.openNotificationLog();
      const options = mockedCallArg<{ onOpenWonderCity: (action: { cityId: string; wonderId: string }) => void }>(createNotificationLogPanel, 0, 1);

      options.onOpenWonderCity({ cityId: 'no-such-city', wonderId: 'great-lighthouse' });

      expect(deps.openWonderPanelForCityId).not.toHaveBeenCalled();
      expect(deps.showNotification).toHaveBeenCalledWith(expect.any(String), 'warning');
    });
  });
});
