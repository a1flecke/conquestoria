// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createNewGame } from '@/core/game-state';
import { EventBus } from '@/core/event-bus';
import { createGameSession } from '@/app/game-session';
import { createEmptyPirateState, type PirateFactionState } from '@/core/pirate-state';
import { createEmptyAutonomyCivState } from '@/core/autonomy-state';
import { createUnit } from '@/systems/unit-system';
import { createEspionageCivState } from '@/systems/espionage-system';
import type { PirateFocusTarget } from '@/systems/pirate-presentation';
import type { NotificationMapTarget } from '@/core/notification-log';
import type { CouncilTalkLevel, GameState, HexCoord, Spy } from '@/core/types';
import {
  createPanelActionsController,
  type PanelActionsControllerDeps,
} from '@/app/controllers/panel-actions-controller';

vi.mock('@/ui/pacing-debug-panel', () => ({ createPacingDebugPanel: vi.fn() }));
vi.mock('@/ui/bestiary-panel', () => ({ createBestiaryPanel: vi.fn() }));
vi.mock('@/ui/hall-of-fame-panel', () => ({ createHallOfFamePanel: vi.fn() }));
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
vi.mock('@/ui/city-panel', () => ({ createCityPanel: vi.fn() }));
vi.mock('@/ui/strategic-launch-flow', () => ({ createStrategicLaunchFlow: vi.fn() }));
vi.mock('@/ui/espionage-panel', () => ({ createEspionagePanel: vi.fn(() => document.createElement('div')) }));

import { createPacingDebugPanel } from '@/ui/pacing-debug-panel';
import { createBestiaryPanel } from '@/ui/bestiary-panel';
import { createHallOfFamePanel } from '@/ui/hall-of-fame-panel';
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
import { createCityPanel } from '@/ui/city-panel';
import { createStrategicLaunchFlow } from '@/ui/strategic-launch-flow';
import { SFX } from '@/audio/sfx';
import { hexKey } from '@/systems/hex-utils';
import { createEspionagePanel } from '@/ui/espionage-panel';

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

function makeCity(id: string, overrides: Partial<NonNullable<GameState['cities'][string]>> = {}): NonNullable<GameState['cities'][string]> {
  return {
    id, name: `City ${id}`, owner: 'player', position: { q: 0, r: 0 },
    population: 1, food: 0, foodNeeded: 10, buildings: [], productionQueue: [], productionProgress: 0,
    ownedTiles: [], workedTiles: [], focus: 'balanced', maturity: 'outpost',
    unrestLevel: 0, unrestTurns: 0, spyUnrestBonus: 0,
    ...overrides,
  };
}

/** Places a real player-owned spy in `state.espionage`, for espionage-panel tests. */
function placeSpy(state: GameState, spyId: string, overrides: Partial<Spy> = {}): void {
  const spy: Spy = {
    id: spyId, owner: 'player', name: `Agent ${spyId}`, unitType: 'spy_scout',
    targetCivId: null, targetCityId: null, position: null,
    status: 'idle', experience: 0, currentMission: null,
    cooldownTurns: 0, promotion: undefined, promotionAvailable: false,
    feedsFalseIntel: false,
    ...overrides,
  };
  const existing = state.espionage?.player ?? createEspionageCivState();
  state.espionage = { ...state.espionage, player: { ...existing, spies: { ...existing.spies, [spyId]: spy } } };
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
  const session = createGameSession(state);
  return {
    session,
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
      applyPirateHeadquartersAssaultVisual: vi.fn(), setGameState: vi.fn(), setHighlights: vi.fn(),
      setStrategicLaunchPreview: vi.fn(),
    },
    showNotification: vi.fn(),
    focusNotificationTarget: vi.fn(),
    focusPirateTarget: vi.fn(),
    applyPirateActionResult: vi.fn(),
    currentCiv: vi.fn(() => session.getState().civilizations[session.getState().currentPlayer]),
    currentCivDef: vi.fn(() => undefined),
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
      handleEstablishRoute: vi.fn(),
    },
    executeUpgrade: vi.fn(() => false),
    router: { open: vi.fn() },
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

  describe('openHallOfFame', () => {
    it('builds the Hall of Fame for the current player and renders it', () => {
      const { state } = makeFixture('hall-of-fame');
      state.civilizations.player.generalHistory = [
        { unitId: 'u1', generalDefinitionId: 'gen_caesar', spawnedTurn: 3,
          careerEvents: [{ type: 'spawned', turn: 3 }, { type: 'city-captured', turn: 6, cityId: 'c', cityName: 'Thebes' }] },
      ];
      const { deps, controller } = build(state);

      controller.openHallOfFame();

      expect(createHallOfFamePanel).toHaveBeenCalledTimes(1);
      expect(mockedCallArg(createHallOfFamePanel, 0, 0)).toBe(deps.uiLayer);
      const entries = mockedCallArg<Array<{ moments: Array<{ text: string }> }>>(createHallOfFamePanel, 0, 1);
      expect(entries).toHaveLength(1);
      expect(entries[0].moments.map(m => m.text)).toEqual(['captured Thebes']);
      const options = mockedCallArg<{ onClose: unknown }>(createHallOfFamePanel, 0, 2);
      expect(typeof options.onClose).toBe('function');
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
      expect(createCityPanel).not.toHaveBeenCalled();

      options.onNaturalWonderPageShown('great-lighthouse');
      expect(deps.audio.startNaturalWonderCodexAmbient).toHaveBeenCalledWith('great-lighthouse');

      options.onNaturalWonderPageHidden();
      expect(deps.audio.stopNaturalWonderAmbient).toHaveBeenCalledTimes(2);

      options.onNaturalWonderReplay('great-lighthouse');
      expect(deps.audio.playNaturalWonderReplay).toHaveBeenCalledWith('great-lighthouse');
    });

    it('opens the founded city via the real openCityPanelForCity when one exists', () => {
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

      expect(createCityPanel).toHaveBeenCalledWith(deps.uiLayer, state.cities['test-city'], deps.session.getState(), expect.anything());
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
      expect(createCityPanel).toHaveBeenCalledWith(deps.uiLayer, state.cities['test-city'], deps.session.getState(), expect.anything());
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

    it('closes the drawer, removes any prior panel, and opens the real city panel', () => {
      const { state } = makeFixture('city-overview');
      state.cities['test-city'] = makeOverviewCity();
      const { deps, controller } = build(state);

      controller.openCityOverviewPanel();

      expect(deps.hud.closeDrawer).toHaveBeenCalledTimes(1);
      const options = mockedCallArg<{ onOpenCity: (cityId: string) => void }>(createCityOverviewPanel, 0, 2);
      options.onOpenCity('test-city');
      expect(createCityPanel).toHaveBeenCalledWith(deps.uiLayer, state.cities['test-city'], deps.session.getState(), expect.anything());
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

    it('onTalkLevelChange publishes the new council talk level through session subscribers', () => {
      const { state } = makeFixture('council-talk-level');
      const { deps, controller } = build(state);
      const listener = vi.fn();
      deps.session.subscribe(listener);

      controller.openCouncilPanel();
      const options = mockedCallArg<{ onTalkLevelChange: (level: CouncilTalkLevel) => void }>(createCouncilPanel, 0, 2);
      options.onTalkLevelChange('chatty');

      expect(deps.session.getState().settings.councilTalkLevel).toBe('chatty');
      expect(listener).toHaveBeenCalled();
    });
  });

  describe('openTechPanel', () => {
    it('queues real research via the live civ tech state and refreshes the renderer/HUD', () => {
      const { state } = makeFixture('tech-panel-queue');
      const { deps, controller } = build(state);

      controller.openTechPanel();

      const options = mockedCallArg<{ onQueueResearch: (techId: string) => void }>(createTechPanel, 0, 2);
      options.onQueueResearch('fire');

      expect(deps.session.getState().civilizations.player.techState.currentResearch).toBe('fire');
      expect(deps.renderLoop.setGameState).toHaveBeenCalled();
      expect(deps.hud.update).toHaveBeenCalled();
      expect(deps.showNotification).toHaveBeenCalledWith(expect.stringContaining('fire'), 'info');
    });

    it('onQueueResearch publishes the queued tech through session subscribers', () => {
      const { state } = makeFixture('tech-panel-queue-publish');
      state.civilizations.player.techState.currentResearch = 'fire';
      const { deps, controller } = build(state);
      const listener = vi.fn();
      deps.session.subscribe(listener);

      controller.openTechPanel();
      const options = mockedCallArg<{ onQueueResearch: (techId: string) => void }>(createTechPanel, 0, 2);
      options.onQueueResearch('writing');

      expect(deps.session.getState().civilizations.player.techState.researchQueue).toContain('writing');
      expect(listener).toHaveBeenCalled();
    });

    it('reorders and removes queued research via the real planning-system helpers', () => {
      const { state } = makeFixture('tech-panel-reorder');
      state.civilizations.player.techState.currentResearch = 'fire';
      state.civilizations.player.techState.researchQueue = ['writing', 'wheel'];
      const { deps, controller } = build(state);

      controller.openTechPanel();
      const options = mockedCallArg<{
        onMoveQueuedResearch: (fromIndex: number, toIndex: number) => void;
        onRemoveQueuedResearch: (index: number) => void;
      }>(createTechPanel, 0, 2);

      options.onMoveQueuedResearch(0, 1);
      expect(deps.session.getState().civilizations.player.techState.researchQueue).toEqual(['wheel', 'writing']);

      options.onRemoveQueuedResearch(0);
      expect(deps.session.getState().civilizations.player.techState.researchQueue).toEqual(['writing']);
    });

    it('#915: queue handlers return the freshly committed state for the panel to re-render', () => {
      const { state } = makeFixture('tech-panel-fresh-state');
      state.civilizations.player.techState.currentResearch = 'fire';
      state.civilizations.player.techState.researchQueue = ['writing', 'wheel'];
      const { deps, controller } = build(state);

      controller.openTechPanel();
      const options = mockedCallArg<{
        onQueueResearch: (techId: string) => unknown;
        onMoveQueuedResearch: (fromIndex: number, toIndex: number) => unknown;
        onRemoveQueuedResearch: (index: number) => unknown;
      }>(createTechPanel, 0, 2);

      // Each handler must hand back the exact object session.commit() installed,
      // never void — the panel reopens from it instead of its captured reference.
      expect(options.onMoveQueuedResearch(0, 1)).toBe(deps.session.getState());
      expect(options.onRemoveQueuedResearch(0)).toBe(deps.session.getState());
      expect(options.onQueueResearch('pottery')).toBe(deps.session.getState());
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

    it('opens the real city panel and deselects when a stacked unit opens its city', () => {
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
      expect(createCityPanel).toHaveBeenCalledWith(deps.uiLayer, state.cities['test-city'], deps.session.getState(), expect.anything());
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

  describe('openCityPanelForCity', () => {
    it('closes the drawer but builds no panel for a city the player does not own', () => {
      const { state, aiCivId } = makeFixture('city-panel-foreign');
      state.cities['foreign-city'] = makeCity('foreign-city', { owner: aiCivId });
      const { deps, controller } = build(state);

      controller.openCityPanelForCity(state.cities['foreign-city']);

      expect(deps.hud.closeDrawer).toHaveBeenCalledTimes(1);
      expect(createCityPanel).not.toHaveBeenCalled();
    });

    it('builds the panel for an owned city with the live session state', () => {
      const { state } = makeFixture('city-panel-owned');
      state.cities['test-city'] = makeCity('test-city');
      const { deps, controller } = build(state);

      controller.openCityPanelForCity(state.cities['test-city']);

      expect(createCityPanel).toHaveBeenCalledWith(deps.uiLayer, state.cities['test-city'], deps.session.getState(), expect.anything());
    });

    it('Prepare Strategic Launch (#545 MR4/MR5): opens the flow, and a confirmed launch commits a real strike without calling SFX directly', () => {
      const { state, aiCivId } = makeFixture('city-panel-strategic-launch');
      const targetPos = { q: 1, r: 1 };
      state.cities['silo'] = makeCity('silo', { buildings: ['missile_silo'] });
      state.cities['target'] = makeCity('target', { owner: aiCivId, position: targetPos });
      state.civilizations[aiCivId].cities = ['target'];
      state.civilizations.player.strategicArsenal = 1;
      state.civilizations.player.diplomacy.atWarWith = [aiCivId];
      state.civilizations.player.visibility = { tiles: { [hexKey(targetPos)]: 'visible' }, lastSeen: {} };
      const { deps, controller } = build(state);
      const strategicStrikeSpy = vi.spyOn(SFX, 'strategicStrike').mockImplementation(() => {});
      const emitted: unknown[] = [];
      deps.bus.on('city:strategic-strike', payload => emitted.push(payload));

      controller.openCityPanelForCity(state.cities['silo']);
      const cityPanelOptions = mockedCallArg<{ onPrepareStrategicLaunch: (cityId: string) => void }>(createCityPanel, 0, 3);
      cityPanelOptions.onPrepareStrategicLaunch('silo');

      expect(createStrategicLaunchFlow).toHaveBeenCalledWith(deps.uiLayer, deps.session.getState(), 'player', expect.anything());
      const flowOptions = mockedCallArg<{ onConfirmLaunch: (targetCityId: string) => void }>(createStrategicLaunchFlow, 0, 3);

      flowOptions.onConfirmLaunch('target');

      expect(deps.session.getState().cities.target.hp).toBe(1);
      expect(deps.session.getState().civilizations.player.strategicArsenal).toBe(0);
      expect(deps.session.getState().civilizations.player.diplomacy.relationships[aiCivId]).toBe(-60);
      expect(deps.showNotification).toHaveBeenCalledWith('Strategic strike launched.', 'warning');
      // #545 MR5: SFX now fires from the registrar, never directly from the controller.
      expect(strategicStrikeSpy).not.toHaveBeenCalled();
      expect(emitted).toEqual([{ cityId: 'target', recipientCivId: aiCivId, actorCivId: 'player', goldLost: expect.any(Number) }]);
      strategicStrikeSpy.mockRestore();
    });

    it('queues real production via session.commit, publishes to subscribers, and returns the fresh state for the panel to re-render', () => {
      const { state } = makeFixture('city-panel-build');
      state.cities['test-city'] = makeCity('test-city');
      const { deps, controller } = build(state);
      const listener = vi.fn();
      deps.session.subscribe(listener);

      controller.openCityPanelForCity(state.cities['test-city']);
      const options = mockedCallArg<{ onBuild: (cityId: string, itemId: string) => GameState | void }>(createCityPanel, 0, 3);
      const returned = options.onBuild('test-city', 'warrior');

      expect(deps.session.getState().cities['test-city'].productionQueue).toContain('warrior');
      expect(returned).toBe(deps.session.getState());
      expect(deps.renderLoop.setGameState).toHaveBeenCalled();
      expect(listener).toHaveBeenCalled();
      expect(deps.showNotification).toHaveBeenCalledWith(expect.stringContaining('Warrior'), 'info');
    });

    it('cycles to the next and previous city among the civ\'s real roster, recursively calling itself', () => {
      const { state } = makeFixture('city-panel-cycle');
      state.cities['city-a'] = makeCity('city-a');
      state.cities['city-b'] = makeCity('city-b');
      state.civilizations.player.cities = ['city-a', 'city-b'];
      const { controller } = build(state);

      controller.openCityPanelForCity(state.cities['city-a']);
      const firstOptions = mockedCallArg<{ onNextCity: () => void }>(createCityPanel, 0, 3);
      firstOptions.onNextCity();

      // The recursive self-call re-invokes createCityPanel for city-b.
      expect(createCityPanel).toHaveBeenCalledTimes(2);
      expect(mockedCallArg<{ id: string }>(createCityPanel, 1, 1).id).toBe('city-b');

      const secondOptions = mockedCallArg<{ onPrevCity: () => void }>(createCityPanel, 1, 3);
      secondOptions.onPrevCity();

      expect(createCityPanel).toHaveBeenCalledTimes(3);
      expect(mockedCallArg<{ id: string }>(createCityPanel, 2, 1).id).toBe('city-a');
    });

    it('wires onEstablishRoute, onAppeaseFaction, and onConcedeToMovement to diplomacyActions', () => {
      const { state } = makeFixture('city-panel-diplomacy');
      state.cities['test-city'] = makeCity('test-city');
      const { deps, controller } = build(state);

      controller.openCityPanelForCity(state.cities['test-city']);
      const options = mockedCallArg<{
        onEstablishRoute: (caravanId: string) => void;
        onAppeaseFaction: (cityId: string) => void;
        onConcedeToMovement: (cityId: string) => void;
      }>(createCityPanel, 0, 3);

      options.onEstablishRoute('caravan-1');
      expect(deps.diplomacyActions.handleEstablishRoute).toHaveBeenCalledWith('caravan-1');

      options.onAppeaseFaction('test-city');
      expect(deps.diplomacyActions.handleAppeaseFaction).toHaveBeenCalledWith('test-city');

      options.onConcedeToMovement('test-city');
      expect(deps.diplomacyActions.handleConcedeToMovement).toHaveBeenCalledWith('test-city');
    });

    it('does nothing when the selected unit has no real upgrade path available', () => {
      const { state } = makeFixture('city-panel-no-upgrade');
      state.cities['test-city'] = makeCity('test-city');
      placeUnit(state, 'settler', 'settler-1', { q: 0, r: 0 });
      const { deps, controller } = build(state);

      controller.openCityPanelForCity(state.cities['test-city']);
      const options = mockedCallArg<{ onUpgradeUnit: (unitId: string) => void }>(createCityPanel, 0, 3);
      options.onUpgradeUnit('settler-1');

      // `settler` has no `upgradesTo` in TRAINABLE_UNITS, so the real guard returns
      // before ever reaching the injected `executeUpgrade` dep.
      expect(deps.executeUpgrade).not.toHaveBeenCalled();
    });

    it('reassigns city focus via the real city-work-system call', () => {
      const { state } = makeFixture('city-panel-focus');
      state.cities['test-city'] = makeCity('test-city');
      const { deps, controller } = build(state);

      controller.openCityPanelForCity(state.cities['test-city']);
      const options = mockedCallArg<{ onSetCityFocus: (cityId: string, focus: string) => unknown }>(createCityPanel, 0, 3);
      options.onSetCityFocus('test-city', 'production');

      expect(deps.session.getState().cities['test-city'].focus).toBe('production');
      expect(deps.showNotification).toHaveBeenCalledWith(expect.stringContaining('production'), 'info');
    });

    it('shows a warning instead of committing when the real rush-buy quote is unavailable', () => {
      const { state } = makeFixture('city-panel-rushbuy');
      state.cities['test-city'] = makeCity('test-city');
      const { deps, controller } = build(state);

      controller.openCityPanelForCity(state.cities['test-city']);
      const options = mockedCallArg<{ onRushBuyActiveProduction: (cityId: string) => unknown }>(createCityPanel, 0, 3);
      options.onRushBuyActiveProduction('test-city');

      // Empty production queue -> real getRushBuyQuote reports unavailable.
      expect(deps.showNotification).toHaveBeenCalledWith(expect.any(String), 'warning');
    });

    it('highlights real worker-buildable tiles and surfaces every toast from onFindResources', () => {
      const { state } = makeFixture('city-panel-find-resources');
      state.cities['test-city'] = makeCity('test-city');
      const { deps, controller } = build(state);

      controller.openCityPanelForCity(state.cities['test-city']);
      const options = mockedCallArg<{
        onFindResources: (highlights: HexCoord[], toasts: Array<{ message: string; type: 'info' | 'warning' | 'success' }>) => void;
      }>(createCityPanel, 0, 3);
      options.onFindResources([{ q: 1, r: 1 }, { q: 2, r: 2 }], [{ message: 'Found 2 resources', type: 'info' }]);

      expect(deps.renderLoop.setHighlights).toHaveBeenCalledWith([
        { coord: { q: 1, r: 1 }, type: 'worker-buildable' },
        { coord: { q: 2, r: 2 }, type: 'worker-buildable' },
      ]);
      expect(deps.showNotification).toHaveBeenCalledWith('Found 2 resources', 'info');
    });
  });

  describe('openEspionagePanel', () => {
    it('closes the drawer and builds the panel from real session state', () => {
      const { state } = makeFixture('espionage-panel-open');
      const { deps, controller } = build(state);

      controller.openEspionagePanel();

      expect(deps.hud.closeDrawer).toHaveBeenCalledTimes(1);
      expect(createEspionagePanel).toHaveBeenCalledWith(deps.session.getState(), expect.anything());
      expect(deps.uiLayer.children.length).toBeGreaterThan(0);
    });

    it('onAssignDefensive embeds the spy, removes the unit, and publishes through session subscribers', () => {
      const { state } = makeFixture('espionage-assign-defensive');
      state.cities['home-city'] = makeCity('home-city', { owner: 'player' });
      state.civilizations.player.cities = ['home-city'];
      placeUnit(state, 'spy_scout', 'spy-1', { q: 0, r: 0 });
      placeSpy(state, 'spy-1');
      const { deps, controller } = build(state);
      const listener = vi.fn();
      deps.session.subscribe(listener);
      vi.spyOn(window, 'prompt').mockImplementation((_msg, defaultValue) => defaultValue ?? null);

      controller.openEspionagePanel();
      const options = mockedCallArg<{ onAssignDefensive: (spyId: string) => void }>(createEspionagePanel, 0, 1);
      options.onAssignDefensive('spy-1');

      const updated = deps.session.getState();
      expect(updated.units['spy-1']).toBeUndefined();
      expect(updated.espionage!.player.spies['spy-1'].status).toBe('embedded');
      expect(deps.hud.update).toHaveBeenCalled();
      expect(listener).toHaveBeenCalled();
    });

    it('recalls a stationed spy via the real system call and reopens the panel through router', () => {
      const { state } = makeFixture('espionage-recall');
      placeSpy(state, 'spy-1', { status: 'stationed', targetCivId: 'ai-1', targetCityId: 'foreign-city' });
      const { deps, controller } = build(state);

      controller.openEspionagePanel();
      const options = mockedCallArg<{ onRecall: (spyId: string) => void }>(createEspionagePanel, 0, 1);
      options.onRecall('spy-1');

      expect(deps.session.getState().espionage!.player.spies['spy-1'].status).not.toBe('stationed');
      expect(deps.renderLoop.setGameState).toHaveBeenCalled();
      expect(deps.router.open).toHaveBeenCalledWith('espionage');
      expect(deps.showNotification).toHaveBeenCalledWith(expect.stringContaining('recalled'), 'info');
    });

    it('onStartMission commits the started mission and publishes through session subscribers', () => {
      const { state } = makeFixture('espionage-start-mission-publish');
      state.civilizations.player.techState.completed = ['espionage-scouting'];
      placeSpy(state, 'spy-1', { status: 'stationed', targetCivId: 'ai-1', targetCityId: 'foreign-city' });
      const { deps, controller } = build(state);
      const listener = vi.fn();
      deps.session.subscribe(listener);
      vi.spyOn(window, 'prompt').mockImplementation((_msg, defaultValue) => defaultValue ?? null);

      controller.openEspionagePanel();
      const options = mockedCallArg<{ onStartMission: (spyId: string) => void }>(createEspionagePanel, 0, 1);
      options.onStartMission('spy-1');

      expect(deps.session.getState().espionage!.player.spies['spy-1'].status).not.toBe('stationed');
      expect(listener).toHaveBeenCalled();
    });

    it('onRecall commits the recalled spy and publishes through session subscribers', () => {
      const { state } = makeFixture('espionage-recall-publish');
      placeSpy(state, 'spy-1', { status: 'on_mission' });
      const { deps, controller } = build(state);
      const listener = vi.fn();
      deps.session.subscribe(listener);

      controller.openEspionagePanel();
      const options = mockedCallArg<{ onRecall: (spyId: string) => void }>(createEspionagePanel, 0, 1);
      options.onRecall('spy-1');

      expect(listener).toHaveBeenCalled();
    });

    it('onVerifyAgent commits the cleared agent and publishes through session subscribers', () => {
      const { state } = makeFixture('espionage-verify-publish');
      placeSpy(state, 'spy-1', { status: 'embedded', turnedBy: 'ai-1' });
      const { deps, controller } = build(state);
      const listener = vi.fn();
      deps.session.subscribe(listener);

      controller.openEspionagePanel();
      const options = mockedCallArg<{ onVerifyAgent: (spyId: string) => void }>(createEspionagePanel, 0, 1);
      options.onVerifyAgent('spy-1');

      expect(deps.session.getState().espionage!.player.spies['spy-1'].turnedBy).toBeUndefined();
      expect(listener).toHaveBeenCalled();
    });

    it('verifies a captured-then-cleared agent via the real system call', () => {
      const { state } = makeFixture('espionage-verify');
      placeSpy(state, 'spy-1', { status: 'stationed' });
      const { deps, controller } = build(state);

      controller.openEspionagePanel();
      const options = mockedCallArg<{ onVerifyAgent: (spyId: string) => void }>(createEspionagePanel, 0, 1);
      options.onVerifyAgent('spy-1');

      expect(deps.renderLoop.setGameState).toHaveBeenCalled();
      expect(deps.router.open).toHaveBeenCalledWith('espionage');
      expect(deps.showNotification).toHaveBeenCalledWith('Agent verified and cleared.', 'success');
    });

    it('sweeps with a real seed and reports no enemy spies detected', () => {
      const { state } = makeFixture('espionage-sweep');
      placeSpy(state, 'spy-1', { status: 'embedded', targetCityId: 'test-city' });
      const { deps, controller } = build(state);

      controller.openEspionagePanel();
      const options = mockedCallArg<{ onSweep: (spyId: string) => void }>(createEspionagePanel, 0, 1);
      options.onSweep('spy-1');

      expect(deps.showNotification).toHaveBeenCalledWith(expect.stringContaining('no enemy spies detected'), 'info');
      expect(deps.router.open).toHaveBeenCalledWith('espionage');
    });

    it('onSweep commits the sweep result, publishes through session subscribers, and still refreshes the panel', () => {
      const { state } = makeFixture('espionage-sweep-publish');
      placeSpy(state, 'sweeper-1', { status: 'embedded' });
      const { deps, controller } = build(state);
      const listener = vi.fn();
      deps.session.subscribe(listener);

      controller.openEspionagePanel();
      const options = mockedCallArg<{ onSweep: (spyId: string) => void }>(createEspionagePanel, 0, 1);
      options.onSweep('sweeper-1');

      expect(deps.showNotification).toHaveBeenCalled();
      expect(listener).toHaveBeenCalled();
      expect(deps.getElementById).toHaveBeenCalledWith('espionage-panel');
      expect(deps.router.open).toHaveBeenCalledWith('espionage');
    });

    it('toggles cooldown mode for a real spy on cooldown', () => {
      const { state } = makeFixture('espionage-cooldown');
      placeSpy(state, 'spy-1', { status: 'cooldown', cooldownMode: 'stay_low' });
      const { deps, controller } = build(state);

      controller.openEspionagePanel();
      const options = mockedCallArg<{ onToggleCooldownMode: (spyId: string) => void }>(createEspionagePanel, 0, 1);
      options.onToggleCooldownMode('spy-1');

      expect(deps.session.getState().espionage!.player.spies['spy-1'].cooldownMode).toBe('passive_observe');
      expect(deps.router.open).toHaveBeenCalledWith('espionage');
    });

    it('does nothing when toggling cooldown mode for a spy that is not on cooldown', () => {
      const { state } = makeFixture('espionage-cooldown-guard');
      placeSpy(state, 'spy-1', { status: 'idle' });
      const { deps, controller } = build(state);

      controller.openEspionagePanel();
      const options = mockedCallArg<{ onToggleCooldownMode: (spyId: string) => void }>(createEspionagePanel, 0, 1);
      options.onToggleCooldownMode('spy-1');

      expect(deps.session.getState().espionage!.player.spies['spy-1'].status).toBe('idle');
      expect(deps.router.open).not.toHaveBeenCalled();
    });

    it('starts a real placed-spy mission chosen via window.prompt without prompting for a target', () => {
      const { state } = makeFixture('espionage-start-mission');
      state.civilizations.player.techState.completed = ['espionage-scouting'];
      placeSpy(state, 'spy-1', { status: 'stationed', targetCivId: 'ai-1', targetCityId: 'foreign-city' });
      const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('scout_area');
      const { deps, controller } = build(state);

      controller.openEspionagePanel();
      const options = mockedCallArg<{ onStartMission: (spyId: string) => void }>(createEspionagePanel, 0, 1);
      options.onStartMission('spy-1');

      // `scout_area` requires a placed spy, so the mission-choice prompt fires once
      // but the foreign-city-target prompt never does -- the spy's existing target is reused.
      expect(promptSpy).toHaveBeenCalledTimes(1);
      expect(deps.session.getState().espionage!.player.spies['spy-1'].currentMission?.type).toBe('scout_area');
      expect(deps.router.open).toHaveBeenCalledWith('espionage');
      expect(deps.showNotification).toHaveBeenCalledWith(expect.stringContaining('scout_area'), 'info');
      promptSpy.mockRestore();
    });

    it('exfiltrates a stationed spy to a real capital with a free tile', () => {
      const { state } = makeFixture('espionage-exfiltrate');
      state.cities['capital-city'] = makeCity('capital-city');
      state.civilizations.player.cities = ['capital-city'];
      placeSpy(state, 'spy-1', { status: 'stationed', unitType: 'spy_scout', targetCivId: 'ai-1', targetCityId: 'foreign-city' });
      const { deps, controller } = build(state);

      controller.openEspionagePanel();
      const options = mockedCallArg<{ onExfiltrate: (spyId: string) => void }>(createEspionagePanel, 0, 1);
      options.onExfiltrate('spy-1');

      const spies = deps.session.getState().espionage!.player.spies;
      expect(spies['spy-1']).toBeUndefined();
      const exfiltrated = Object.values(spies).find(spy => spy.status === 'cooldown');
      expect(exfiltrated).toMatchObject({ cooldownTurns: 8, targetCivId: null });
      expect(deps.session.getState().units[exfiltrated!.id].position).toEqual(state.cities['capital-city'].position);
      expect(deps.showNotification).toHaveBeenCalledWith(expect.stringContaining('exfiltrated'), 'info');
    });

    it('onExfiltrate spawns a fresh unit at the capital, updates espionage state, and publishes', () => {
      const { state } = makeFixture('espionage-exfiltrate-publish');
      state.cities['capital'] = makeCity('capital', { owner: 'player', position: { q: 5, r: 5 } });
      state.civilizations.player.cities = ['capital'];
      placeSpy(state, 'spy-1', { status: 'stationed' });
      const { deps, controller } = build(state);
      const listener = vi.fn();
      deps.session.subscribe(listener);

      controller.openEspionagePanel();
      const options = mockedCallArg<{ onExfiltrate: (spyId: string) => void }>(createEspionagePanel, 0, 1);
      options.onExfiltrate('spy-1');

      const updated = deps.session.getState();
      expect(Object.values(updated.units).some(u => u.type === 'spy_scout')).toBe(true);
      expect(updated.espionage!.player.spies['spy-1']).toBeUndefined();
      expect(listener).toHaveBeenCalled();
    });

    it('onUnembed spawns a fresh unit at the target city, updates espionage state, and publishes', () => {
      const { state } = makeFixture('espionage-unembed');
      state.cities['target-city'] = makeCity('target-city', { owner: 'ai-1', position: { q: 3, r: 3 } });
      placeSpy(state, 'spy-1', { status: 'embedded', targetCityId: 'target-city' });
      const { deps, controller } = build(state);
      const listener = vi.fn();
      deps.session.subscribe(listener);

      controller.openEspionagePanel();
      const options = mockedCallArg<{ onUnembed: (spyId: string) => void }>(createEspionagePanel, 0, 1);
      options.onUnembed('spy-1');

      const updated = deps.session.getState();
      expect(Object.values(updated.units).some(u => u.type === 'spy_scout')).toBe(true);
      expect(listener).toHaveBeenCalled();
    });
  });
});
