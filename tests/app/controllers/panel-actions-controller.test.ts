// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createNewGame } from '@/core/game-state';
import { EventBus } from '@/core/event-bus';
import { createGameSession } from '@/app/game-session';
import { createEmptyPirateState, type PirateFactionState } from '@/core/pirate-state';
import { createEmptyAutonomyCivState } from '@/core/autonomy-state';
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
vi.mock('@/ui/diplomacy-panel', () => ({ createDiplomacyPanel: vi.fn() }));
vi.mock('@/ui/marketplace-panel', () => ({ createMarketplacePanel: vi.fn() }));
vi.mock('@/ui/wonder-panel', () => ({ createWonderPanel: vi.fn() }));
vi.mock('@/ui/city-overview-panel', () => ({ createCityOverviewPanel: vi.fn() }));
vi.mock('@/ui/council-panel', () => ({ createCouncilPanel: vi.fn() }));
vi.mock('@/ui/tech-panel', () => ({ createTechPanel: vi.fn() }));
vi.mock('@/ui/unit-stack-panel', () => ({ renderUnitStackPanel: vi.fn() }));
vi.mock('@/ui/network-intent-panel', () => ({ createNetworkIntentPanel: vi.fn(() => document.createElement('div')) }));
vi.mock('@/ui/network-panel', async () => {
  const actual = await vi.importActual<typeof import('@/ui/network-panel')>('@/ui/network-panel');
  return { createNetworkPanel: vi.fn(() => document.createElement('div')), getNetworkPanelModel: actual.getNetworkPanelModel };
});
vi.mock('@/storage/save-manager', () => ({ saveSettings: vi.fn(() => Promise.resolve()) }));

import { createPacingDebugPanel } from '@/ui/pacing-debug-panel';
import { createBestiaryPanel } from '@/ui/bestiary-panel';
import { createWonderAtlasPanel } from '@/ui/wonder-atlas-panel';
import { createPirateWatersPanel } from '@/ui/pirate-waters-panel';
import { createPirateHeadquartersAssaultPanel } from '@/ui/pirate-headquarters-assault-panel';
import { createNotificationLogPanel } from '@/ui/notification-log-panel';
import { createDiplomacyPanel } from '@/ui/diplomacy-panel';
import { createMarketplacePanel } from '@/ui/marketplace-panel';
import { createWonderPanel } from '@/ui/wonder-panel';
import { createCityOverviewPanel } from '@/ui/city-overview-panel';
import { createCouncilPanel } from '@/ui/council-panel';
import { createTechPanel } from '@/ui/tech-panel';
import { renderUnitStackPanel } from '@/ui/unit-stack-panel';
import { createNetworkIntentPanel } from '@/ui/network-intent-panel';
import { createNetworkPanel } from '@/ui/network-panel';
import { saveSettings } from '@/storage/save-manager';

function mockedCallArg<T = unknown>(mockFn: unknown, callIndex: number, argIndex: number): T {
  return (mockFn as ReturnType<typeof vi.fn>).mock.calls[callIndex][argIndex] as T;
}

function makeFixture(seed = 'panel-actions-controller'): { state: GameState; aiCivId: string } {
  const state = createNewGame(undefined, seed, 'small');
  state.currentPlayer = 'player';
  const aiCivId = Object.keys(state.civilizations).find(id => id !== 'player')!;
  return { state, aiCivId };
}

/** Places a real player-owned unit of the given type at a position, for network-panel tests. */
function placeUnit(state: GameState, type: Parameters<typeof createUnit>[0], unitId: string, position: HexCoord): void {
  const idCounters = { nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 };
  state.units[unitId] = { ...createUnit(type, 'player', position, idCounters), id: unitId };
  state.civilizations.player.units.push(unitId);
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
    currentCiv: vi.fn(() => state.civilizations[state.currentPlayer]),
    diplomacyActions: {
      handleDiplomaticAction: vi.fn(),
      handleAcceptPeaceRequest: vi.fn(),
      handleRejectPeaceRequest: vi.fn(),
      handleAcceptTreatyProposal: vi.fn(),
      handleDeclineTreatyProposal: vi.fn(),
      handleBreakTreaty: vi.fn(),
      handleGiftGold: vi.fn(),
      handleSponsorFestival: vi.fn(),
      handleMinorCivReparations: vi.fn(),
      handleSendAid: vi.fn(),
      handleMinorCivWarPeace: vi.fn(),
      handleAppeaseFaction: vi.fn(() => state),
      handleConcedeToMovement: vi.fn(() => state),
    },
    openCityPanelForCity: vi.fn(),
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

      // openWonderPanelForCityId is now a real sibling function (phase 10b-c), not an
      // injected mock -- assert its visible effect (no wonder panel built) instead.
      expect(createWonderPanel).not.toHaveBeenCalled();
      expect(deps.showNotification).toHaveBeenCalledWith(expect.any(String), 'warning');
    });
  });

  describe('openDiplomacyPanel', () => {
    it('closes the drawer, removes any prior panel, and wires the action callback to diplomacyActions', () => {
      const { state } = makeFixture('diplomacy-panel');
      const { deps, controller } = build(state);

      controller.openDiplomacyPanel();

      expect(deps.hud.closeDrawer).toHaveBeenCalledTimes(1);
      expect(createDiplomacyPanel).toHaveBeenCalledTimes(1);
      const options = mockedCallArg<{ onAction: (civId: string, action: string) => void }>(createDiplomacyPanel, 0, 2);
      options.onAction('ai-1', 'declare_war');
      expect(deps.diplomacyActions.handleDiplomaticAction).toHaveBeenCalledWith('ai-1', 'declare_war');
    });
  });

  describe('openMarketplacePanel', () => {
    it('closes the drawer and selects/centers on a unit chosen from the panel', () => {
      const { state } = makeFixture('marketplace-panel');
      addPirateFixture(state, { q: 5, r: 5 }, { q: 5, r: 4 }, 'attacker');
      const { deps, controller } = build(state);

      controller.openMarketplacePanel();

      expect(deps.hud.closeDrawer).toHaveBeenCalledTimes(1);
      const options = mockedCallArg<{ onSelectUnit: (unitId: string) => void }>(createMarketplacePanel, 0, 2);
      options.onSelectUnit('attacker');

      expect(deps.selectionController.selectUnit).toHaveBeenCalledWith('attacker');
      expect(deps.renderLoop.camera.centerOn).toHaveBeenCalledWith(state.units.attacker.position);
    });

    it('does not re-render (real canBuyResourceAccess guard blocks it) for an uncontacted civ', () => {
      // Real system call, not mocked: `canBuyResourceAccess` returns false for a civ the
      // player hasn't met (no entry in `diplomacy.relationships`), so the early return
      // must prevent both the purchase and the panel re-render.
      const { state, aiCivId } = makeFixture('marketplace-buy-blocked');
      const { controller } = build(state);

      controller.openMarketplacePanel();
      const options = mockedCallArg<{ onBuyResourceAccess: (sellerCivId: string, resource: string) => void }>(createMarketplacePanel, 0, 2);
      options.onBuyResourceAccess(aiCivId, 'iron');

      expect(createMarketplacePanel).toHaveBeenCalledTimes(1);
    });
  });

  describe('openWonderPanelForCityId', () => {
    it('does nothing when the city does not exist', () => {
      const { state } = makeFixture('wonder-panel-missing-city');
      const { controller } = build(state);

      controller.openWonderPanelForCityId('no-such-city');

      expect(createWonderPanel).not.toHaveBeenCalled();
    });

    it('builds the panel for a real owned city and removes it on close', () => {
      const { state } = makeFixture('wonder-panel-real-city');
      state.cities['test-city'] = {
        id: 'test-city', name: 'Testopolis', owner: 'player', position: { q: 0, r: 0 },
        population: 1, food: 0, foodNeeded: 10, buildings: [], productionQueue: [], productionProgress: 0,
        ownedTiles: [], workedTiles: [], focus: 'balanced', maturity: 'outpost',
        unrestLevel: 0, unrestTurns: 0, spyUnrestBonus: 0,
      };
      const { deps, controller } = build(state);

      controller.openWonderPanelForCityId('test-city');

      expect(createWonderPanel).toHaveBeenCalledTimes(1);
      expect(mockedCallArg<string>(createWonderPanel, 0, 2)).toBe('test-city');

      const options = mockedCallArg<{ onClose: () => void }>(createWonderPanel, 0, 3);
      options.onClose();
      expect(deps.getElementById).toHaveBeenCalledWith('wonder-panel');
    });
  });

  describe('openCityOverviewPanel', () => {
    function makeOverviewCity(): NonNullable<GameState['cities'][string]> {
      return {
        id: 'test-city', name: 'Testopolis', owner: 'player', position: { q: 0, r: 0 },
        population: 1, food: 0, foodNeeded: 10, buildings: [], productionQueue: [], productionProgress: 0,
        ownedTiles: [], workedTiles: [], focus: 'balanced', maturity: 'outpost',
        unrestLevel: 0, unrestTurns: 0, spyUnrestBonus: 0,
      };
    }

    it('closes the drawer, removes any prior panel, and opens the injected city panel dep', () => {
      const { state } = makeFixture('city-overview');
      state.cities['test-city'] = makeOverviewCity();
      const { deps, controller } = build(state);

      controller.openCityOverviewPanel();

      expect(deps.hud.closeDrawer).toHaveBeenCalledTimes(1);
      const options = mockedCallArg<{ onOpenCity: (cityId: string) => void }>(createCityOverviewPanel, 0, 2);
      options.onOpenCity('test-city');
      expect(deps.openCityPanelForCity).toHaveBeenCalledWith(state.cities['test-city']);
    });

    it('appeases a faction via diplomacyActions and re-renders the panel', () => {
      const { state } = makeFixture('city-overview-appease');
      state.cities['test-city'] = makeOverviewCity();
      const { deps, controller } = build(state);

      controller.openCityOverviewPanel();
      const options = mockedCallArg<{ onAppeaseFaction: (cityId: string) => void }>(createCityOverviewPanel, 0, 2);
      options.onAppeaseFaction('test-city');

      expect(deps.diplomacyActions.handleAppeaseFaction).toHaveBeenCalledWith('test-city');
      expect(createCityOverviewPanel).toHaveBeenCalledTimes(2);
    });
  });

  describe('openCouncilPanel', () => {
    it('closes the drawer and persists a talk-level change to live session settings', () => {
      const { state } = makeFixture('council-panel');
      const { deps, controller } = build(state);

      controller.openCouncilPanel();

      expect(deps.hud.closeDrawer).toHaveBeenCalledTimes(1);
      const options = mockedCallArg<{ onTalkLevelChange: (level: string) => void }>(createCouncilPanel, 0, 2);
      options.onTalkLevelChange('detailed');

      expect(deps.session.getState().settings.councilTalkLevel).toBe('detailed');
      expect(saveSettings).toHaveBeenCalledWith(expect.objectContaining({ councilTalkLevel: 'detailed' }));
    });
  });

  describe('openTechPanel', () => {
    it('queues real research via the live civ tech state and refreshes the renderer/HUD', () => {
      const { state } = makeFixture('tech-panel-queue');
      const { deps, controller } = build(state);

      controller.openTechPanel();

      const options = mockedCallArg<{ onQueueResearch: (techId: string) => void }>(createTechPanel, 0, 2);
      options.onQueueResearch('fire');

      expect(state.civilizations.player.techState.currentResearch).toBe('fire');
      expect(deps.renderLoop.setGameState).toHaveBeenCalled();
      expect(deps.hud.update).toHaveBeenCalled();
      expect(deps.showNotification).toHaveBeenCalledWith(expect.stringContaining('fire'), 'info');
    });

    it('reorders and removes queued research via the real planning-system helpers', () => {
      const { state } = makeFixture('tech-panel-reorder');
      state.civilizations.player.techState.currentResearch = 'fire';
      state.civilizations.player.techState.researchQueue = ['writing', 'wheel'];
      const { controller } = build(state);

      controller.openTechPanel();
      const options = mockedCallArg<{
        onMoveQueuedResearch: (fromIndex: number, toIndex: number) => void;
        onRemoveQueuedResearch: (index: number) => void;
      }>(createTechPanel, 0, 2);

      options.onMoveQueuedResearch(0, 1);
      expect(state.civilizations.player.techState.researchQueue).toEqual(['wheel', 'writing']);

      options.onRemoveQueuedResearch(0);
      expect(state.civilizations.player.techState.researchQueue).toEqual(['writing']);
    });
  });

  describe('openUnitStackPicker', () => {
    it('does nothing when the info panel is not present', () => {
      const { state } = makeFixture('unit-stack-missing-panel');
      const { deps, controller } = build(state, { getElementById: vi.fn(() => null) });

      controller.openUnitStackPicker({ q: 0, r: 0 }, ['attacker']);

      expect(renderUnitStackPanel).not.toHaveBeenCalled();
      expect(deps.getElementById).toHaveBeenCalledWith('info-panel');
    });

    it('opens the injected city panel dep and deselects when a stacked unit opens its city', () => {
      const { state } = makeFixture('unit-stack-open-city');
      state.cities['test-city'] = {
        id: 'test-city', name: 'Testopolis', owner: 'player', position: { q: 0, r: 0 },
        population: 1, food: 0, foodNeeded: 10, buildings: [], productionQueue: [], productionProgress: 0,
        ownedTiles: [], workedTiles: [], focus: 'balanced', maturity: 'outpost',
        unrestLevel: 0, unrestTurns: 0, spyUnrestBonus: 0,
      };
      const infoPanel = document.createElement('div');
      const { deps, controller } = build(state, { getElementById: vi.fn(() => infoPanel) });

      controller.openUnitStackPicker({ q: 0, r: 0 }, ['attacker']);

      expect(renderUnitStackPanel).toHaveBeenCalledTimes(1);
      const options = mockedCallArg<{ onOpenCity: (cityId: string) => void }>(renderUnitStackPanel, 0, 4);
      options.onOpenCity('test-city');

      expect(deps.selectionController.deselectUnit).toHaveBeenCalledTimes(1);
      expect(deps.openCityPanelForCity).toHaveBeenCalledWith(state.cities['test-city']);
    });
  });

  describe('openNetworkIntentPanel', () => {
    it('shows a warning and builds no panel when autonomy is not activated', () => {
      const { state } = makeFixture('network-intent-inactive');
      placeUnit(state, 'cyber_unit', 'cyber-1', { q: 5, r: 4 });
      const { deps, controller } = build(state);

      controller.openNetworkIntentPanel('cyber-1');

      expect(createNetworkIntentPanel).not.toHaveBeenCalled();
      expect(deps.showNotification).toHaveBeenCalledWith(expect.any(String), 'warning');
    });

    it('opens the Network panel directly for a drone controller source once autonomy is activated', () => {
      const { state } = makeFixture('network-intent-drone');
      state.civilizations.player.techState.completed = ['quantum-computing'];
      placeUnit(state, 'drone_controller', 'drone-1', { q: 5, r: 4 });
      const { controller } = build(state);

      controller.openNetworkIntentPanel('drone-1');

      expect(createNetworkIntentPanel).not.toHaveBeenCalled();
      expect(createNetworkPanel).toHaveBeenCalledTimes(1);
    });

    it('opens the intent panel for a real cyber unit source once autonomy is activated', () => {
      const { state } = makeFixture('network-intent-cyber');
      state.civilizations.player.techState.completed = ['quantum-computing'];
      placeUnit(state, 'cyber_unit', 'cyber-1', { q: 5, r: 4 });
      const { deps, controller } = build(state);

      controller.openNetworkIntentPanel('cyber-1');

      expect(createNetworkIntentPanel).toHaveBeenCalledTimes(1);
      expect(deps.uiLayer.children.length).toBeGreaterThan(0);
    });
  });

  describe('openNetworkPanel', () => {
    it('builds no panel when autonomy is not activated', () => {
      const { state } = makeFixture('network-panel-inactive');
      const { controller } = build(state);

      controller.openNetworkPanel();

      expect(createNetworkPanel).not.toHaveBeenCalled();
    });

    it('builds the panel from real network state once autonomy is activated and commits posture changes', () => {
      const { state } = makeFixture('network-panel-active');
      state.civilizations.player.techState.completed = ['quantum-computing'];
      state.autonomyByCiv = { player: createEmptyAutonomyCivState() };
      const { deps, controller } = build(state);

      controller.openNetworkPanel();

      expect(createNetworkPanel).toHaveBeenCalledTimes(1);
      const options = mockedCallArg<{ onPosture: (posture: string) => void }>(createNetworkPanel, 0, 1);
      options.onPosture('defensive');

      expect(createNetworkPanel).toHaveBeenCalledTimes(2);
      // requestAutonomyPosture stages the change as `pendingPosture`, applied on a later turn --
      // not an immediate `posture` mutation.
      expect(deps.session.getState().autonomyByCiv?.player?.pendingPosture).toEqual({ id: 'defensive', appliesOnTurn: state.turn + 1 });
    });
  });
});
