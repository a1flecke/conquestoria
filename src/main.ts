import { EventBus } from '@/core/event-bus';
import { RenderLoop } from '@/renderer/render-loop';
import { hexKey, parseHexKey } from '@/systems/hex-utils';
import { moveUnit, getMovementCost, UNIT_DEFINITIONS, restUnit, canHeal, createUnit } from '@/systems/unit-system';
import { isMajorCivOwner } from '@/core/owner-kind';
import { foundCityInState } from '@/systems/city-founding-system';
import { formatCityFoundingBlockerMessage, getCityFoundingBlockers } from '@/systems/city-territory-system';
import { createCityCapturePanel } from '@/ui/city-capture-panel';
import { deterministicCombatSeed, resolveCombat } from '@/systems/combat-system';
import { buildCombatContextForDefender, getAmphibiousAssaultMultiplier } from '@/systems/combat-context';
import { canUnitAttackTarget } from '@/systems/attack-targeting';
import { applyCombatOutcomeToState, getCaptureNotificationLabel } from '@/systems/combat-reward-system';
import { recordCombatForCiv } from '@/systems/threat-pressure-system';
import { applyWorkerAction } from '@/systems/worker-action-system';
import { resolveCombatEra } from '@/systems/era-resolution';
import { preach } from '@/systems/religion-system';
import { createUnitDeleteConfirmationPanel } from '@/ui/unit-delete-confirmation-panel';
import { getVisibility } from '@/systems/fog-of-war';
import { applyCampDestructionAtTarget } from '@/systems/barbarian-system';
import { recordBeastSlain, isBeastConcealedFrom, applyHoardChoice, getHoardChoicePreview, canUnitAttackBeast } from '@/systems/beast-system';
import { createBeastHoardPanel } from '@/ui/beast-hoard-panel';
import { BEAST_DEFINITIONS } from '@/systems/beast-definitions';
import { recordBeastSightings } from '@/systems/beast-presentation';
import { loadSettings } from '@/storage/save-manager';
import { AudioSystem } from '@/audio/audio-system';
import { SFX } from '@/audio/sfx';
import { AdvisorSystem } from '@/ui/advisor-system';
import type { PirateFocusTarget } from '@/systems/pirate-presentation';
import type { PirateActionResult } from '@/systems/pirate-actions';
import { formatNotificationTargetFocusMessage } from '@/ui/notification-targets';
import { createUnitTurnFlow } from '@/ui/unit-turn-flow';
import { resolveCivDefinition } from '@/systems/civ-registry';
import { declareWar, makePeace, modifyRelationship, resolveOpponentKind } from '@/systems/diplomacy-system';
import { visitVillage } from '@/systems/village-system';
import { clearStaleSoloPendingEvents } from '@/core/hotseat-events';
import { refreshKnownCivilizations, syncCivilizationContactsFromVisibility } from '@/systems/discovery-system';
import { getMinorCivNotification } from '@/ui/minor-civ-notifications';
import { registerMinorCivNotificationListeners } from '@/ui/minor-civ-notification-listeners';
import { conquestMinorCiv, applyDiplomaticReaction } from '@/systems/minor-civ-system';
import { buildUnitOccupancy, hasHostileUnitAtCoord } from '@/systems/unit-occupancy';
import { beginPlayerCityAssaultChoice, shouldPromptForPlayerCityCapture } from '@/input/city-assault-flow';
import { canUnitOccupyCity } from '@/systems/city-capture-system';
import { buildCombatPresentation } from '@/systems/viewer-event-presentation';
import { getSpyCaptureRelationshipPenalty, expelSpy, executeSpy, startInterrogation, isSpyUnitType } from '@/systems/espionage-system';
import { applyUnitUpgradeToState } from '@/systems/unit-upgrade-system';
import { executeUnitMove, isWorkerBusy } from '@/systems/unit-movement-system';
import { getEmbarkedAssaultTarget, detachCargoForEmbarkedAssault } from '@/systems/transport-system';
import { createSelectionStore } from '@/app/selection-store';
import { getCapitalCity } from '@/systems/capital-system';
import type { CombatResult, GameState, HexCoord, UnitType, CivBonusEffect, WorkerActionType } from '@/core/types';
import { appendNotification, type NotificationCityAction, type NotificationEntry } from '@/core/notification-log';
import type { NotificationSink } from '@/ui/notification-routing';
import { createUserSettingsStore } from '@/app/user-settings-store';
import type { Notifier } from '@/app/ports';
import { updateAndRefreshVisibility, reconstructLastSeenFromMap } from '@/systems/last-seen-presentation';
import { createCeremonyCoordinator, type CeremonyCoordinator } from '@/app/controllers/ceremony-coordinator';
import { createSelectionController, type SelectionController } from '@/app/controllers/selection-controller';
import { createDiplomacyActionsController, type DiplomacyActionsController } from '@/app/controllers/diplomacy-actions-controller';
import { createPanelActionsController, type PanelActionsController } from '@/app/controllers/panel-actions-controller';
import { createMapInteractionController, type MapInteractionController } from '@/app/controllers/map-interaction-controller';
import { createTurnFlowController, type TurnFlowController } from '@/app/controllers/turn-flow-controller';
import { createHudController, type HudController } from '@/app/controllers/hud-controller';
import { createCampaignEntryController, type CampaignEntryController } from '@/app/controllers/campaign-entry-controller';
import { createGameSessionController, type GameSessionController } from '@/app/controllers/game-session-controller';
import { bootstrap } from '@/app/bootstrap';
import { registerAllPresentation, type PresentationContext } from '@/presentation/register-all';
import { removeRouteForUnit, createMarketplaceState } from '@/systems/trade-system';
import { emitMinorCivQuestTransitions } from '@/systems/quest-chain-system';
import { applyOpportunisticWarPenaltyIfCrisisStruck } from '@/systems/crisis-interaction-system';
import { RoundPresentationGate } from '@/presentation/round-presentation-gate';
import type { GameSession } from '@/app/ports';
import { createGameSession } from '@/app/game-session';
import { createPanelHost, type PanelHost } from '@/app/panel-host';
import { createPanelRouter, type PanelRouter } from '@/app/panel-router';
import type { PanelContext, PanelRegistry } from '@/app/panel-registry';
import { installGlobalShortcuts } from '@/app/global-shortcuts';

// --- App State ---
/**
 * The single owner of game state (#787 phase 2).
 *
 * Constructed unset: `enterCampaign` commits the first real state, exactly
 * where `let gameState: GameState` used to receive its first assignment. The
 * cast reproduces that binding's pre-assignment `undefined` so the existing
 * `if (session.getState())` guards keep their current meaning.
 */
const session: GameSession = createGameSession(undefined as unknown as GameState);
/**
 * Owns the selected unit, its highlight ranges, the pirate-panel focus, and the
 * pending-map-intent union that replaced four independent nullable flags.
 */
const selection = createSelectionStore();
/** Owns persisted A/V settings + master volume, moved out of module scope (#787 phase 4). */
const userSettingsStore = createUserSettingsStore({ load: loadSettings });
/**
 * The single source of player-facing notifications (#787 phase 4).
 *
 * Constructed in `GameSessionController.init()`, once `createUI()` has
 * created the `#notifications` element `NotificationCenterDeps.layer`
 * needs, then published back here via `setNotifier` (#787 phase 10).
 * Every function below that reads `notifier` is only ever invoked during
 * real gameplay, well after `init()` completes -- the same
 * deferred-but-eager pattern `session` and `selection` already use for
 * their own module-scope bindings.
 */
let notifier: Notifier;

/**
 * Cancels a pending unload, and only a pending unload.
 *
 * Deliberately narrower than `selection.setPendingIntent({ kind: 'none' })`:
 * the call sites below fire on selection and movement changes that must not
 * cancel a pending air mission, journey, or city-capture choice.
 */
function clearUnloadState(): void {
  if (selection.getPendingIntent().kind === 'unload') {
    selection.setPendingIntent({ kind: 'none' });
  }
}

function currentCivDef() {
  return resolveCivDefinition(session.getState(), currentCiv().civType ?? '');
}
const bus = new EventBus();
const audioCtx = new AudioContext();
const audio = new AudioSystem(audioCtx);
const roundPresentationGate = new RoundPresentationGate();
const advisorSystem = new AdvisorSystem(bus);

// --- Canvas Setup ---
const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const uiLayer = document.getElementById('ui-layer') as HTMLDivElement;
const renderLoop = new RenderLoop(canvas);

/**
 * Owns the panel DOM layer and the interaction-blocking overlay flag,
 * replacing `createUiInteractionState()` (#787 phase 5).
 */
const host: PanelHost = createPanelHost(uiLayer);

/**
 * `router` and `panelContext` are circular by construction (a panel's
 * `open(ctx)` reads `ctx.router` to potentially chain-open another panel),
 * so `panelContext` is built first with `notifier`/`router` behind getters
 * that resolve to the live module-scope bindings once they exist -- the
 * same deferred-but-eager pattern `notifier` itself already uses.
 */
let router: PanelRouter;
const panelContext: PanelContext = {
  session,
  get notifier() { return notifier; },
  host,
  selection,
  get router() { return router; },
};

// The two refreshes `session.commit()` performs on every state publication.
// Registered once, here, rather than repeated as a three-statement discipline
// at each write site. Renderer first, matching the order the manual pairs used.
session.subscribe(next => renderLoop.setGameState(next));
session.subscribe(() => hud.update());

function setBlockingOverlay(id: string | null): void {
  host.setBlockingOverlay(id);
}

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Owns the wonder-discovery and legendary-completion ceremony queues plus
 * the move-settle defer flag, replacing three module-scope bindings
 * (#787 phase 6). Subscribes to `host.onInteractionUnblocked` for the pump
 * that used to live inside `setBlockingOverlay` above.
 */
const ceremonies: CeremonyCoordinator = createCeremonyCoordinator({
  host,
  reducedMotion: prefersReducedMotion,
  requestMapHighlight: (item, reducedMotion) => {
    renderLoop.requestWonderDiscoveryHighlight(item.coord, item.visual, { reducedMotion });
  },
  playDiscoveryAudio: wonderId => {
    void audio.playNaturalWonderDiscovery(wonderId);
  },
  openAtlas: wonderId => panelActions.openWonderAtlas(wonderId),
  openCity: cityId => {
    const city = session.getState().cities[cityId];
    if (city) panelActions.openCityPanelForCity(city);
  },
  openJournal: cityId => {
    if (session.getState().cities[cityId]) panelActions.openWonderPanelForCityId(cityId);
  },
});

/**
 * Owns unit selection: `selectUnit`, `deselectUnit`, `selectNextUnit`, and the
 * animated-move / auto-explore / journey lifecycle around a selected unit
 * (#787 phase 8c). References several functions defined later in this file
 * (`foundCityAction`, `performWorkerAction`, `getUnitTurnFlow`, etc.) --
 * safe because they are hoisted function declarations and none of them run
 * until real gameplay, well after module evaluation finishes. The same
 * deferred-but-eager pattern `notifier` and `router` already use.
 */
/**
 * Owns the diplomacy, minor-civ, and crisis-interaction handlers (#787 phase
 * 10b-a). `hud` and `selectionController` are wrapped in thin lazily-evaluating
 * objects, not passed directly -- both are `const`s not assigned until later
 * in module evaluation (`selectionController` right below this, `hud` further
 * down), so a direct reference here would capture `undefined` at construction
 * time. Same deferred-but-eager closure pattern `selectionController` itself
 * already uses for `updateHUD: () => hud.update()` below. `openDiplomacyPanel`
 * is now `PanelActionsController`'s own function (phase 10b-c), but `panelActions`
 * is constructed just below `diplomacyActions`, so the same lazy-wrapper
 * treatment applies here too, not a direct reference.
 */
const diplomacyActions: DiplomacyActionsController = createDiplomacyActionsController({
  session,
  bus,
  renderLoop,
  uiLayer,
  showNotification,
  openDiplomacyPanel: () => panelActions.openDiplomacyPanel(),
  hud: { update: () => hud.update() },
  selectionController: { selectUnit: (unitId, opts) => selectionController.selectUnit(unitId, opts) },
});

/**
 * Owns every panel opener extracted across #787 phases 10b-b (utility/world-event
 * panels), 10b-c (unit/network/civ-management panels), and 10b-d (the two
 * largest panels: `openCityPanelForCity`, `openEspionagePanel`). `hud` and
 * `selectionController` use the same deferred-but-eager lazy-wrapper pattern
 * as `diplomacyActions` above, for the same reason (neither is assigned yet
 * at this point in module evaluation). `diplomacyActions` needs no such
 * wrapper here since it is constructed just above. `router` DOES need the
 * wrapper -- it is a `let` not assigned until `createPanelRouter(...)` much
 * later in module evaluation (after `panelRegistry`, which itself needs this
 * controller's methods) -- same pattern `turnFlow`'s own `router` dep below
 * already uses. `executeUpgrade` and `currentCivDef` are plain hoisted
 * function declarations (like `currentCiv`), so no wrapper needed for them.
 */
const panelActions: PanelActionsController = createPanelActionsController({
  session,
  bus,
  uiLayer,
  getElementById: id => document.getElementById(id),
  selection,
  audio,
  renderLoop,
  showNotification,
  focusNotificationTarget,
  focusPirateTarget,
  applyPirateActionResult,
  currentCiv,
  currentCivDef,
  diplomacyActions,
  executeUpgrade,
  router: { open: panel => router.open(panel) },
  hud: { closeDrawer: () => hud.closeDrawer(), update: () => hud.update() },
  selectionController: {
    selectUnit: (unitId, opts) => selectionController.selectUnit(unitId, opts),
    deselectUnit: () => selectionController.deselectUnit(),
  },
});

const selectionController: SelectionController = createSelectionController({
  session,
  selection,
  renderLoop,
  bus,
  uiLayer,
  host,
  ceremonies,
  getInfoPanel: () => document.getElementById('info-panel'),
  showNotification,
  updateHUD: () => hud.update(),
  clearUnloadState,
  getUnitTurnFlow,
  foundCityAction,
  performWorkerAction,
  performPreach,
  restAction,
  openNetworkIntentPanel: panelActions.openNetworkIntentPanel,
  openUnitStackPicker: panelActions.openUnitStackPicker,
  openPirateHeadquartersAssault: panelActions.openPirateHeadquartersAssault,
  handleEstablishRoute: diplomacyActions.handleEstablishRoute,
  executeUpgrade,
  ensurePlayerWarState,
  scanBeastSightings,
  currentCiv,
});

/**
 * Owns turn advancement: `endTurn`, the hot-seat handoff lifecycle, AI-move
 * replay, difficulty application at handoff, and "entering a viewer's turn"
 * (#787 phase 9). `router`/`notifier` are wrapped in thin lazily-evaluating
 * objects, not passed directly -- both are `let`s not assigned until later
 * in module evaluation (`router` at `createPanelRouter(...)` below,
 * `notifier` inside `init()`), so a direct reference here would capture
 * `undefined`. Same deferred-but-eager pattern as `presentationContext`'s
 * `get notifier()`/`get router()` getters further down.
 */
const turnFlow: TurnFlowController = createTurnFlowController({
  session,
  selection,
  renderLoop,
  bus,
  uiLayer,
  audio,
  router: {
    close: panel => router.close(panel),
    open: panel => router.open(panel),
  },
  roundPresentationGate,
  ceremonies,
  notifier: {
    withHappenedTurn: (turn, fn) => notifier.withHappenedTurn(turn, fn),
  },
  userSettingsStore,
  getElementById: id => document.getElementById(id),
  getNetworkIntentPanel: () => document.querySelector('[aria-label="Network intent"]'),
  showNotification,
  updateHUD: () => hud.update(),
  setBlockingOverlay,
  currentCiv,
  getUnitTurnFlow,
  deselectUnit: selectionController.deselectUnit,
  selectNextUnit: selectionController.selectNextUnit,
  scanBeastSightings,
  maybeShowPendingHoardChoice,
  checkAdvisors: () => advisorSystem.check(session.getState()),
  // `campaignEntry` is declared after `turnFlow` (it needs `turnFlow` itself
  // as a dep) -- same deferred-but-eager forward reference `router`/`notifier`
  // already use elsewhere in this file; safe because this closure is not
  // invoked until real gameplay.
  showGameModeSelection: () => campaignEntry.showGameModeSelection(),
  reloadPage: () => window.location.reload(),
  openCityPanelForCity: panelActions.openCityPanelForCity,
});

/**
 * Owns the two map-input entry points, `handleHexTap` and
 * `handleHexLongPress` (#787 phase 8d). References several functions
 * defined later in this file (`executeAttack`, `executeMinorCivConquest`,
 * etc.) -- safe because they are hoisted function declarations and none of
 * them run until real gameplay, well after module evaluation finishes. The
 * same deferred-but-eager pattern `selectionController` above already uses.
 * `openCityPanelForCity` is a `panelActions` method now (10b-d), not a
 * hoisted function, but `mapInteraction` is constructed after `panelActions`
 * so a direct reference still works with no wrapper needed.
 */
const mapInteraction: MapInteractionController = createMapInteractionController({
  session,
  selection,
  selectionController,
  renderLoop,
  audio,
  bus,
  uiLayer,
  getElementById: id => document.getElementById(id),
  showNotification,
  updateHUD: () => hud.update(),
  clearUnloadState,
  currentCiv,
  openPirateWaters: panelActions.openPirateWaters,
  openUnitStackPicker: panelActions.openUnitStackPicker,
  openCityPanelForCity: panelActions.openCityPanelForCity,
  openWonderAtlas: panelActions.openWonderAtlas,
  executeAttack,
  executeMinorCivConquest,
  beginPlayerCityAssault,
  finalizePendingCityCaptureChoice: turnFlow.finalizePendingCityCaptureChoice,
});

/**
 * Owns the HUD readout, the treasury drawer, the anti-aircraft-overlay
 * toggle button, and the map viewport bottom inset (#787 phase 10).
 */
const hud: HudController = createHudController({
  session,
  renderLoop,
  canvas,
  router: { open: panel => router.open(panel) },
  getElementById: id => document.getElementById(id),
  getDrawerMountRoot: () => document.getElementById('game-shell') ?? document.body,
});

/**
 * Owns campaign entry: the start/save panel, mode selection, and
 * `enterCampaign` (#787 phase 10). `startGame` is a forward reference to
 * `gameSession` (declared `let` just below and assigned immediately after)
 * -- the same deferred-but-eager pattern `router`/`notifier` already use,
 * needed because `gameSession` itself depends on `campaignEntry`.
 */
let gameSession: GameSessionController;
const campaignEntry: CampaignEntryController = createCampaignEntryController({
  session,
  uiLayer,
  audio,
  bus,
  roundPresentationGate,
  host,
  turnFlow,
  userSettingsStore,
  getElementById: id => document.getElementById(id),
  showNotification,
  startGame: () => gameSession.startGame(),
  reloadPage: () => window.location.reload(),
});

/**
 * Owns app startup: `init`, `createUI`, `startGame`, and the
 * `inputInitialized` construct-once guard (#787 phase 10).
 */
gameSession = createGameSessionController({
  session,
  selection,
  renderLoop,
  audio,
  bus,
  canvas,
  uiLayer,
  documentRef: document,
  host,
  router: {
    toggle: panel => router.toggle(panel),
    open: panel => router.open(panel),
    close: panel => router.close(panel),
    closeGroup: group => router.closeGroup(group),
    isOpen: panel => router.isOpen(panel),
  },
  roundPresentationGate,
  advisorSystem,
  userSettingsStore,
  turnFlow,
  mapInteraction,
  selectionController,
  hud,
  campaignEntry,
  getElementById: id => document.getElementById(id),
  showNotification,
  foundCityAction,
  maybeShowPendingHoardChoice,
  setNotifier: n => { notifier = n; },
  focusNotificationTarget,
});

/**
 * Shared deps for the domain presentation registrars replacing 72
 * module-scope `bus.on(...)` registrations (#787 phase 7). `notifier`/`router`
 * resolve through getters -- the same deferred-but-eager pattern
 * `panelContext` above already uses -- since both are only assigned once
 * `init()` runs.
 */
const presentationContext: PresentationContext = {
  session,
  get notifier() { return notifier; },
  get router() { return router; },
  ceremonies,
  selection,
  requestDeliveryVisual: unitId => renderLoop.applyDeliveryVisual(unitId),
  applyCombatVisual: result => renderLoop.applyCombatVisual(result),
  showEspionageCaptureChoice: (spyId, spyOwner) => showEspionageCaptureChoice(spyId, spyOwner),
  uiLayer,
  maybeShowPendingHoardChoice: () => maybeShowPendingHoardChoice(),
  isPresentationSuppressed: () => roundPresentationGate.isSuppressed(),
  resetAdvisorMessage: id => advisorSystem.resetMessage(id),
  checkAdvisors: () => advisorSystem.check(session.getState()),
  showNotification: (message, type, target) => showNotification(message, type, target),
};

// Escape-cancels-journey and backtick-toggles-pacing-debug used to live in a
// module-scope `window.addEventListener('keydown', ...)` here. Moved to
// `installGlobalShortcuts` (called from `init()`, once `notifier` exists) so
// it can depend on the real `Notifier`/`PanelRouter` ports instead of
// reaching into module-scope closures directly (#787 phase 5).

function scanBeastSightings(): void {
  const visTiles = currentCiv()?.visibility?.tiles;
  if (!visTiles) return;
  const viewerUnits = Object.values(session.getState().units).filter(
    u => u.owner === session.getState().currentPlayer && !u.transportId,
  );
  const visibleKeys = new Set(
    Object.entries(visTiles).filter(([, v]) => v === 'visible').map(([k]) => k),
  );
  // A beast concealed in its habitat cannot be sighted even if the tile is visible
  for (const unit of Object.values(session.getState().units)) {
    if (isBeastConcealedFrom(unit, session.getState().map, viewerUnits)) {
      visibleKeys.delete(hexKey(unit.position));
    }
  }
  const sightingResult = recordBeastSightings(session.getState(), session.getState().currentPlayer, visibleKeys);
  session.setStateWithoutRefresh(sightingResult.state);
  for (const beastId of sightingResult.newSightings) {
    bus.emit('beast:sighted', { beastId, civId: session.getState().currentPlayer });
  }
}

function maybeShowPendingHoardChoice(): void {
  const pending = (session.getState().beasts?.pendingHoardChoices ?? [])
    .find(p => p.civId === session.getState().currentPlayer);
  if (!pending) return;
  const preview = getHoardChoicePreview(session.getState(), pending.lairId);
  const lair = session.getState().beasts!.lairs[pending.lairId];
  createBeastHoardPanel(uiLayer, preview, choice => {
    session.setStateWithoutRefresh(applyHoardChoice(session.getState(), pending.lairId, pending.civId, choice));
    bus.emit('beast:hoard-claimed', { lairId: pending.lairId, beastId: lair.beastId, civId: pending.civId, choice });
    hud.update();
    maybeShowPendingHoardChoice();
  });
}

// --- Game Logic ---
function currentCiv() {
  return session.getState().civilizations[session.getState().currentPlayer];
}


// --- Notifications ---
// The toast queue, the choice modal, and the delivery contract below all live
// in notifier (created in init(), see src/ui/notification-center.ts) (#787
// phase 4). `notifier.toast` is the pure DOM enqueue (no log side effect) --
// exactly today's enqueueToast, which is why focusNotificationTarget and
// focusPirateTarget call it directly instead of showNotification below.

function showNotification(
  message: string,
  type: NotificationEntry['type'] = 'info',
  target?: NotificationEntry['target'],
): void {
  notifier.toast(message, type, target);
  if (session.getState()) {
    appendNotification(session.getState(), session.getState().currentPlayer, {
      message,
      type,
      turn: session.getState().turn,
      target,
    });
  }
}

// The single delivery contract for game-consequence notifications (#551):
// logs to the recipient civ always, toasts only when that civ is the active
// unsuppressed viewer, and queues to pendingEvents (hot seat only) otherwise
// -- the turn-handoff summary drains that queue. All existing router call
// sites keep using this name unchanged. Thunked (not `= notifier.deliver`)
// because `notifier` is not assigned until init() runs, after every one of
// these module-scope const/function declarations.
const appendToCivLog: NotificationSink = (...args) => notifier.deliver(...args);

function focusNotificationTarget(target: NotificationEntry['target']): void {
  if (!target) return;
  renderLoop.camera.centerOn(target.coord);
  const visibility = currentCiv().visibility;
  const isCurrentlyVisible = visibility ? getVisibility(visibility, target.coord) === 'visible' : false;
  notifier.toast(formatNotificationTargetFocusMessage(target, isCurrentlyVisible), 'info');
}

function focusPirateTarget(target: PirateFocusTarget): void {
  const coord = target.kind === 'region' ? target.center : target.coord;
  renderLoop.camera.centerOn(coord);
  notifier.toast(target.label, 'info');
}

function applyPirateActionResult(result: PirateActionResult, successMessage: string): void {
  if (!result.success) {
    showNotification(result.reason ?? 'That pirate action is no longer available.', 'warning');
    return;
  }
  session.setStateWithoutRefresh(result.state);
  for (const event of result.events) {
    if (event.type === 'tribute-paid') {
      bus.emit('pirate:audio-cue', { cue: 'tribute', factionId: event.factionId, viewerIds: [event.civId] });
    } else if (event.type === 'contract-accepted') {
      bus.emit('pirate:audio-cue', { cue: 'contract-accepted', factionId: event.factionId, viewerIds: [event.employerId] });
    }
  }
  renderLoop.setGameState(session.getState());
  hud.update();
  showNotification(successMessage, 'success');
}

function executeMinorCivConquest(unitId: string, target: HexCoord, minorCivId: string, cityId: string): void {
  const cityName = session.getState().cities[cityId]?.name ?? 'City-State';
  const movement = selectionController.executeAnimatedUnitMove(unitId, () => executeUnitMove(session.getState(), unitId, target, {
    actor: 'player',
    civId: session.getState().currentPlayer,
    bus,
    foreignCityEntryId: cityId,
  }));
  if (!movement.ok) return;
  const movedUnit = session.getState().units[unitId];
  if (movedUnit) session.getState().units[unitId] = { ...movedUnit, movementPointsLeft: 0 };
  const conquered = conquestMinorCiv(session.getState(), minorCivId, session.getState().currentPlayer);
  session.setStateWithoutRefresh(conquered.state);
  emitMinorCivQuestTransitions(bus, conquered.transitions, session.getState());
  if (conquered.conquered) bus.emit('minor-civ:destroyed', { minorCivId, conquerorId: session.getState().currentPlayer });
  showNotification(`${cityName} has been conquered!`, 'success');
  SFX.tap();
  renderLoop.setGameState(session.getState());
  hud.update();
}

function executeUpgrade(
  unitId: string,
  targetType: import('@/core/types').UnitType,
): boolean {
  const result = applyUnitUpgradeToState(session.getState(), unitId, targetType);
  if (!result.upgraded) return false;
  session.commit(result.state);
  return true;
}

/**
 * Replaces `togglePanel`'s 288-line `else if` chain (#787 phase 5). Panels
 * that require a specific target -- a city id, a hex coord -- have no
 * parameterless "open the current one" call, so their `open` throws; they
 * still need a registry entry so `closeGroup`/`isOpen`/`close` (all
 * DOM-derived off `domId`) behave correctly when a 'main' or 'transient'
 * sweep runs. `openCityPanelForCity`'s and `openWonderPanelForCityId`'s real
 * entry points both now live in `PanelActionsController` (10b-c, 10b-d).
 * The territory-inspection panel has no such entry point of
 * its own -- it opens only as a side effect of `mapInteraction.handleHexLongPress`
 * (#787 phase 8d), which is not itself in this registry.
 */
const panelRegistry = {
  council: { domId: 'council-panel', group: 'main', open: () => panelActions.openCouncilPanel() },
  tech: { domId: 'tech-panel', group: 'main', open: () => panelActions.openTechPanel() },
  city: {
    domId: 'city-panel',
    group: 'main',
    open: () => {
      throw new Error("'city' is parameterized -- call panelActions.openCityPanelForCity(city) directly, not router.open('city').");
    },
  },
  espionage: { domId: 'espionage-panel', group: 'main', open: () => panelActions.openEspionagePanel() },
  diplomacy: { domId: 'diplomacy-panel', group: 'main', open: () => panelActions.openDiplomacyPanel() },
  marketplace: { domId: 'marketplace-panel', group: 'main', open: () => panelActions.openMarketplacePanel() },
  network: { domId: 'network-panel', group: 'transient', open: () => panelActions.openNetworkPanel() },
  wonder: {
    domId: 'wonder-panel',
    group: 'transient',
    open: () => {
      throw new Error("'wonder' is parameterized -- call panelActions.openWonderPanelForCityId(cityId) directly, not router.open('wonder').");
    },
  },
  'wonder-atlas': { domId: 'wonder-codex-panel', group: 'transient', open: () => panelActions.openWonderAtlas() },
  bestiary: { domId: 'bestiary-panel', group: 'transient', open: () => panelActions.openBestiary() },
  'pirate-waters': { domId: 'pirate-waters-panel', group: 'transient', open: () => panelActions.openPirateWaters() },
  'notification-log': { domId: 'notification-log', group: 'transient', open: () => panelActions.openNotificationLog() },
  'city-overview': { domId: 'city-overview-panel', group: 'main', open: () => panelActions.openCityOverviewPanel() },
  'territory-inspection': {
    domId: 'territory-inspection-panel',
    group: 'transient',
    open: () => {
      throw new Error(
        "'territory-inspection' opens only via mapInteraction.handleHexLongPress(coord) (#787 phase 8d) -- not router.open('territory-inspection').",
      );
    },
  },
  'pacing-debug': { domId: 'pacing-debug-panel', group: 'transient', open: () => panelActions.openPacingDebugPanel() },
} satisfies PanelRegistry;

router = createPanelRouter({ host, registry: panelRegistry, context: panelContext });

function getUnitTurnFlow() {
  return createUnitTurnFlow({
    uiLayer,
    getState: () => session.getState(),
    setState: nextState => { session.setStateWithoutRefresh(nextState); },
    getSelectedUnitId: () => selection.getSelectedUnitId(),
    selectUnit: selectionController.selectUnit,
    deselectUnit: selectionController.deselectUnit,
    selectNextUnit: selectionController.selectNextUnit,
    centerOn: coord => renderLoop.camera.centerOn(coord),
    refreshVisibility: selectionController.refreshCurrentPlayerVisibility,
    setRenderState: state => renderLoop.setGameState(state),
    updateHUD: () => hud.update(),
    showNotification,
    setBlockingOverlay,
    endTurn: options => { void turnFlow.endTurn(options); },
    onUnitDisbanded: (state, unitId, routeId) =>
      removeRouteForUnit(state, unitId, bus, 'unit-disbanded', routeId),
  });
}

function foundCityAction(): void {
  const selectedUnitId = selection.getSelectedUnitId();
  if (!selectedUnitId) return;
  const unit = session.getState().units[selectedUnitId];
  if (!unit || unit.type !== 'settler') return;

  const blockers = getCityFoundingBlockers(session.getState(), unit.position);
  if (blockers.length > 0) {
    showNotification(formatCityFoundingBlockerMessage(blockers), 'warning');
    return;
  }

  let result;
  try {
    result = foundCityInState(session.getState(), selectedUnitId, bus);
  } catch (error) {
    showNotification(
      error instanceof Error ? error.message : 'City cannot be founded here.',
      'warning',
    );
    return;
  }
  session.setStateWithoutRefresh(result.state);

  selectionController.deselectUnit();
  const foundedCity = session.getState().cities[result.cityId];
  showNotification(`${foundedCity.name} has been founded!`, 'success');
  SFX.foundCity();

  // Update visibility
  updateAndRefreshVisibility(session.getState(), session.getState().currentPlayer);
  for (const contact of syncCivilizationContactsFromVisibility(session.getState(), session.getState().currentPlayer)) {
    bus.emit('civilization:first-contact', contact);
  }

  renderLoop.setGameState(session.getState());
  hud.update();
}

function performWorkerAction(action: WorkerActionType): void {
  const selectedUnitId = selection.getSelectedUnitId();
  if (!selectedUnitId) return;

  const result = applyWorkerAction(session.getState(), selectedUnitId, action);
  if (!result.ok) return;

  session.setStateWithoutRefresh(result.state);
  for (const event of result.events) {
    if (event.type === 'improvement:started') {
      bus.emit('improvement:started', event.payload);
    } else if (event.type === 'road:started') {
      bus.emit('road:started', event.payload);
    } else {
      bus.emit('unit:destroyed', event.payload);
    }
  }

  renderLoop.setGameState(session.getState());
  hud.update();

  if (result.workerConsumed || result.workerLost || !session.getState().units[selectedUnitId]) {
    selectionController.deselectUnit();
  } else {
    selectionController.selectUnit(selectedUnitId);
  }

  showNotification(result.message, result.workerLost ? 'warning' : 'info');
}

// #592 MR5: preach action. Mirrors performWorkerAction's state-apply + rerender pattern,
// but adds a non-destructive confirmation dialog when the missionary is consumed on its
// last charge — the deletion has already happened inside preach() by this point, so the
// dialog is an acknowledgment, not a gate (hideCancel: true, no undo possible).
function performPreach(unitId: string, cityId: string): void {
  const unit = session.getState().units[unitId];
  const cityName = session.getState().cities[cityId]?.name ?? cityId;
  const result = preach(session.getState(), unitId, cityId, bus);
  if (!result.ok) return;

  session.commit(result.state);

  const message = result.converted
    ? `${cityName} has converted to your faith!`
    : `You preached in ${cityName}.`;

  if (result.unitConsumed) {
    selectionController.deselectUnit();
    setBlockingOverlay('unit-delete-confirmation');
    createUnitDeleteConfirmationPanel(uiLayer, {
      unitName: unit ? UNIT_DEFINITIONS[unit.type].name : 'Missionary',
      title: 'Missionary Used Up',
      bodyText: `${message} That was its last charge, so the missionary is gone.`,
      confirmLabel: 'OK',
      hideCancel: true,
      tone: 'neutral',
      onConfirm: () => {
        uiLayer.querySelector('#unit-delete-confirmation-panel')?.remove();
        setBlockingOverlay(null);
      },
      onCancel: () => {
        uiLayer.querySelector('#unit-delete-confirmation-panel')?.remove();
        setBlockingOverlay(null);
      },
    });
  } else {
    selectionController.selectUnit(unitId);
    showNotification(message, result.converted ? 'success' : 'info');
  }
}

function ensurePlayerWarState(targetCivId: string): void {
  const targetCiv = session.getState().civilizations[targetCivId];
  if (!targetCiv || !isMajorCivOwner(targetCivId)) return;

  const cp = session.getState().currentPlayer;
  const alreadyAtWar = currentCiv().diplomacy?.atWarWith.includes(targetCivId) ?? false;
  if (alreadyAtWar) return;

  currentCiv().diplomacy = declareWar(currentCiv().diplomacy, targetCivId, session.getState().turn);
  targetCiv.diplomacy = declareWar(targetCiv.diplomacy, cp, session.getState().turn);
  bus.emit('diplomacy:war-declared', { attackerId: cp, defenderId: targetCivId, opponentKind: resolveOpponentKind(targetCivId) });
  session.setStateWithoutRefresh(applyOpportunisticWarPenaltyIfCrisisStruck(session.getState(), cp, targetCivId, bus));
}

function beginPlayerCityAssault(
  attackerId: string,
  cityId: string,
  attackerBonus?: CivBonusEffect,
  precedingCombat?: CombatResult,
  embarkedAssault = false,
): 'pending' | 'resolved' {
  const city = session.getState().cities[cityId];
  if (!city) return 'resolved';
  const attacker = session.getState().units[attackerId];
  if (!attacker || !canUnitOccupyCity(attacker)) return 'resolved';

  ensurePlayerWarState(city.owner);
  let attackerMultiplier: number | undefined;
  if (embarkedAssault) {
    const legality = getEmbarkedAssaultTarget(session.getState(), attackerId, city.position, { viewerId: session.getState().currentPlayer });
    if (!legality.ok || legality.targetType !== 'city') {
      showNotification('That coastal assault is no longer possible.', 'warning');
      return 'resolved';
    }
    attackerMultiplier = getAmphibiousAssaultMultiplier(session.getState(), attacker, city.position);
    const detached = detachCargoForEmbarkedAssault(session.getState(), attackerId);
    if (!detached.ok) return 'resolved';
    session.setStateWithoutRefresh(detached.state);
  }
  const begun = beginPlayerCityAssaultChoice(
    session.getState(),
    attackerId,
    cityId,
    bus,
    precedingCombat,
    attackerMultiplier,
  );
  session.setStateWithoutRefresh(begun.state);

  if (!begun.ok) {
    showNotification(
      begun.reason === 'repelled-by-city-defense'
        ? "Your attack was repelled by the city's defenses!"
        : 'The attack could not proceed.',
      'warning',
    );
    renderLoop.setGameState(session.getState());
    hud.update();
    return 'resolved';
  }

  selection.setPendingIntent({ kind: 'city-capture', choice: begun.pending });
  if (!shouldPromptForPlayerCityCapture(city)) {
    turnFlow.finalizePendingCityCaptureChoice('raze', attackerBonus);
    return 'resolved';
  }

  createCityCapturePanel(uiLayer, {
    cityName: city.name,
    occupiedPopulation: begun.pending.occupiedPopulation,
    razeGold: begun.pending.razeGold,
    onOccupy: () => turnFlow.finalizePendingCityCaptureChoice('occupy', attackerBonus),
    onRaze: () => turnFlow.finalizePendingCityCaptureChoice('raze', attackerBonus),
  });
  return 'pending';
}

function executeAttack(attackerId: string, targetKey: string): void {
  const initialAttacker = session.getState().units[attackerId];
  const targetCoord = parseHexKey(targetKey);
  const amphibiousAssault = Boolean(initialAttacker?.transportId);
  const legality = amphibiousAssault
    ? getEmbarkedAssaultTarget(session.getState(), attackerId, targetCoord, { viewerId: session.getState().currentPlayer })
    : canUnitAttackTarget(session.getState(), initialAttacker, targetCoord, { viewerId: session.getState().currentPlayer });
  // hasActed guard: enforce "no action remaining" at the execution layer, not just
  // the highlight layer (getAttackTargets). Prevents double-action if executeAttack
  // is ever called outside the normal tap → highlight → confirm flow.
  if (!initialAttacker || initialAttacker.hasActed || !legality.ok || legality.targetType !== 'unit') {
    showNotification('That target is no longer attackable.', 'warning');
    const currentlySelected = selection.getSelectedUnitId();
    if (currentlySelected) selectionController.selectUnit(currentlySelected);
    return;
  }

  const defenderId = legality.targetUnitId;
  const defender = session.getState().units[defenderId];
  if (!defender) return;

  let attacker = initialAttacker;
  if (amphibiousAssault) {
    const detached = detachCargoForEmbarkedAssault(session.getState(), attackerId);
    if (!detached.ok) {
      showNotification('That coastal assault is no longer possible.', 'warning');
      return;
    }
    session.setStateWithoutRefresh(detached.state);
    attacker = detached.attacker;
  }

  ensurePlayerWarState(defender.owner);

  const seed = deterministicCombatSeed(session.getState().gameId, session.getState().turn, attacker.id, defender.id);
  const attackerBonus = currentCivDef()?.bonusEffect;
  // Capture defender position before combat (defender may be removed from state after)
  const defenderPosition = { ...defender.position };
  // Capture route IDs before combat (units may be removed from state after)
  const attackerRouteId = attacker.committedToRouteId;
  const defenderRouteId = defender.committedToRouteId;
  const result = resolveCombat(
    attacker,
    session.getState().units[defenderId] ?? defender,
    session.getState().map,
    seed,
    buildCombatContextForDefender(session.getState(), attacker, defender, { amphibiousAssault }),
    resolveCombatEra(session.getState(), attacker, defender),
    session.getState(),
  );
  bus.emit('combat:resolved', {
    result,
    ...buildCombatPresentation(session.getState(), result, attacker, defender),
  });

  const applied = applyCombatOutcomeToState(session.getState(), result, seed);
  session.setStateWithoutRefresh(applied.state);
  session.setStateWithoutRefresh(recordCombatForCiv(session.getState(), session.getState().currentPlayer, defenderPosition));
  emitMinorCivQuestTransitions(bus, applied.questTransitions, session.getState());
  // Clean up trade routes for any committed caravans that died or were captured
  if (applied.attackerDefeated && attackerRouteId) {
    session.setStateWithoutRefresh(removeRouteForUnit(session.getState(), result.attackerId, bus, 'unit-died', attackerRouteId));
  } else if (applied.attackerCaptured && attackerRouteId) {
    session.setStateWithoutRefresh(removeRouteForUnit(session.getState(), result.attackerId, bus, 'unit-captured', attackerRouteId));
  }
  if (applied.defenderDefeated && defenderRouteId) {
    session.setStateWithoutRefresh(removeRouteForUnit(session.getState(), result.defenderId, bus, 'unit-died', defenderRouteId));
  } else if (applied.defenderCaptured && defenderRouteId) {
    session.setStateWithoutRefresh(removeRouteForUnit(session.getState(), result.defenderId, bus, 'unit-captured', defenderRouteId));
  }

  if (applied.attackerDefeated) {
    showNotification('Our unit was destroyed!', 'warning');
  } else if (applied.attackerCaptured) {
    showNotification(`Our ${getCaptureNotificationLabel(attacker.type)}`, 'warning');
  }

  for (const reward of applied.rewards) {
    bus.emit('combat:reward-earned', { reward });
  }

  if (applied.defenderDefeated) {
    showNotification('Enemy unit destroyed!', 'success');

    const slayResult = recordBeastSlain(session.getState(), defender, attacker);
    session.setStateWithoutRefresh(slayResult.state);
    if (slayResult.slain) {
      bus.emit('beast:slain', slayResult.slain);
    }
    // Tier 3+ beasts use the slay ceremony (beast:slain listener); ceremony calls
    // maybeShowPendingHoardChoice via onContinue so the choice panel appears after
    // the ceremony is dismissed rather than racing with it.
    if (!slayResult.slain || BEAST_DEFINITIONS[slayResult.slain.beastId].tier < 3) {
      maybeShowPendingHoardChoice();
    }

    const destroyedCamp = applyCampDestructionAtTarget(session.getState(), session.getState().currentPlayer, defender.position, session.getState().turn);
    if (destroyedCamp.campId) {
      session.setStateWithoutRefresh(destroyedCamp.state);
      emitMinorCivQuestTransitions(bus, destroyedCamp.questTransitions, session.getState());
      showNotification(`Barbarian camp destroyed! +${destroyedCamp.reward} gold`, 'success');
      advisorSystem.resetMessage('treasurer_camp_reward');
      advisorSystem.check(session.getState());
      for (const mcId of Object.keys(session.getState().minorCivs)) {
        applyDiplomaticReaction(session.getState(), 'camp_destroyed_nearby', session.getState().currentPlayer, mcId);
      }
    }

    const cityAtTarget = Object.values(session.getState().cities).find(c => hexKey(c.position) === targetKey);
    if (cityAtTarget) {
      const occupancy = buildUnitOccupancy(session.getState().units);
      const remainingHostileDefenders = hasHostileUnitAtCoord(occupancy, cityAtTarget.position, session.getState().currentPlayer);
      if (!remainingHostileDefenders) {
        if (cityAtTarget.owner.startsWith('mc-')) {
          const conqueredCityName = cityAtTarget.name;
          const conquered = conquestMinorCiv(session.getState(), cityAtTarget.owner, session.getState().currentPlayer);
          session.setStateWithoutRefresh(conquered.state);
          emitMinorCivQuestTransitions(bus, conquered.transitions, session.getState());
          if (conquered.conquered) {
            bus.emit('minor-civ:destroyed', { minorCivId: cityAtTarget.owner, conquerorId: session.getState().currentPlayer });
          }
          showNotification(`${conqueredCityName} has been conquered!`, 'success');
        }
        if (!cityAtTarget.owner.startsWith('mc-') && cityAtTarget.owner !== session.getState().currentPlayer) {
          const assaultStatus = beginPlayerCityAssault(
            attackerId,
            cityAtTarget.id,
            attackerBonus,
            result,
            amphibiousAssault,
          );
          SFX.combat();
          renderLoop.setGameState(session.getState());
          hud.update();
          selectionController.refreshSelectedUnitAfterCombat();
          if (assaultStatus === 'resolved') {
            setTimeout(() => selectionController.selectNextUnit(), 400);
          }
          return;
        }
      }
    }
  } else if (applied.defenderCaptured) {
    showNotification(getCaptureNotificationLabel(defender.type), 'success');
  }

  // `attacker` was captured before applyCombatOutcomeToState — safe even if attacker was destroyed
  SFX.combat();
  renderLoop.setGameState(session.getState());
  hud.update();
  selectionController.refreshSelectedUnitAfterCombat();
  renderLoop.animations.add('combat-flash', 400, { coord: attacker.position }, () => selectionController.selectNextUnit());
}

function restAction(): void {
  const selectedUnitId = selection.getSelectedUnitId();
  if (!selectedUnitId) return;
  const unit = session.getState().units[selectedUnitId];
  if (!unit || !canHeal(unit)) return;

  session.getState().units[selectedUnitId] = restUnit(unit);
  showNotification(`${UNIT_DEFINITIONS[unit.type].name} is resting and will heal +15 HP next turn`, 'info');
  selectionController.deselectUnit();
  renderLoop.setGameState(session.getState());
}

function showEspionageCaptureChoice(spyId: string, spyOwner: string): void {
  const captorEsp = session.getState().espionage?.[session.getState().currentPlayer];
  const spy = session.getState().espionage?.[spyOwner]?.spies[spyId];
  if (!captorEsp || !spy) return;
  const spyOwnerName = session.getState().civilizations[spyOwner]?.name ?? spyOwner;

  // D1: always reveal true identity to captor regardless of disguise
  const captureMessage = `You have captured ${spy.name}, a ${spy.unitType} belonging to ${spyOwnerName}.`;

  // infiltrated spies are inside the city (distance 0); otherwise use boundary penalty
  const distanceToCity = spy.infiltrationCityId ? 0 : 1;
  const relPenalty = getSpyCaptureRelationshipPenalty(distanceToCity);

  notifier.choice(captureMessage, [
    {
      label: `Expel (${relPenalty} relations)`,
      onClick: () => {
        const updatedOwnerEsp = expelSpy(session.getState().espionage![spyOwner], spyId, 15);
        const capital = getCapitalCity(session.getState(), spyOwner);
        if (capital) {
          const newUnit = createUnit(spy.unitType, spyOwner, capital.position, session.getState().idCounters);
          session.setStateWithoutRefresh({
            ...session.getState(),
            units: { ...session.getState().units, [newUnit.id]: newUnit },
            civilizations: {
              ...session.getState().civilizations,
              [spyOwner]: {
                ...session.getState().civilizations[spyOwner],
                units: [...session.getState().civilizations[spyOwner].units, newUnit.id],
              },
            },
          });
          const { [spyId]: _old, ...rest } = updatedOwnerEsp.spies;
          session.setStateWithoutRefresh({
            ...session.getState(),
            espionage: {
              ...session.getState().espionage,
              [spyOwner]: {
                ...updatedOwnerEsp,
                spies: { ...rest, [newUnit.id]: { ...updatedOwnerEsp.spies[spyId]!, id: newUnit.id } },
              },
            },
          });
        } else {
          session.setStateWithoutRefresh({ ...session.getState(), espionage: { ...session.getState().espionage, [spyOwner]: updatedOwnerEsp } });
        }
        // Bilateral: captor's view of spy owner AND spy owner's view of captor
        const captorId = session.getState().currentPlayer;
        session.setStateWithoutRefresh({
          ...session.getState(),
          civilizations: {
            ...session.getState().civilizations,
            [captorId]: {
              ...session.getState().civilizations[captorId],
              diplomacy: modifyRelationship(
                session.getState().civilizations[captorId].diplomacy, spyOwner, relPenalty,
              ),
            },
            [spyOwner]: {
              ...session.getState().civilizations[spyOwner],
              diplomacy: modifyRelationship(
                session.getState().civilizations[spyOwner].diplomacy, captorId, relPenalty,
              ),
            },
          },
        });
        showNotification(`${spy.name} expelled. Will return to their capital after 15 turns.`, 'info');
        renderLoop.setGameState(session.getState());
      },
    },
    {
      label: 'Execute',
      danger: true,
      onClick: () => {
        // Second in-panel confirmation — no window.confirm on mobile
        notifier.choice(
          `Execute ${spy.name}? This cannot be undone and will severely damage relations with ${spyOwnerName}.`,
          [
            {
              label: 'Cancel',
              onClick: () => showEspionageCaptureChoice(spyId, spyOwner),
            },
            {
              label: 'Confirm Execute',
              danger: true,
              onClick: () => {
                const captorId = session.getState().currentPlayer;
                session.setStateWithoutRefresh({
                  ...session.getState(),
                  espionage: {
                    ...session.getState().espionage,
                    [spyOwner]: executeSpy(session.getState().espionage![spyOwner], spyId),
                  },
                  // Bilateral: captor's view AND spy owner's view
                  civilizations: {
                    ...session.getState().civilizations,
                    [captorId]: {
                      ...session.getState().civilizations[captorId],
                      diplomacy: modifyRelationship(
                        session.getState().civilizations[captorId].diplomacy, spyOwner, relPenalty * 2,
                      ),
                    },
                    [spyOwner]: {
                      ...session.getState().civilizations[spyOwner],
                      diplomacy: modifyRelationship(
                        session.getState().civilizations[spyOwner].diplomacy, captorId, relPenalty * 2,
                      ),
                    },
                  },
                });
                bus.emit('espionage:spy-executed', {
                  executingCivId: captorId, spyOwner, spyId, spyName: spy.name,
                });
                showNotification(`${spy.name} has been executed.`, 'warning');
                renderLoop.setGameState(session.getState());
              },
            },
          ],
        );
      },
    },
    {
      label: 'Interrogate (4 turns)',
      onClick: () => {
        const ownerEsp = session.getState().espionage![spyOwner];
        session.setStateWithoutRefresh({
          ...session.getState(),
          espionage: {
            ...session.getState().espionage,
            [session.getState().currentPlayer]: startInterrogation(captorEsp, spyId, spyOwner),
            // Set spy status to 'interrogated' on the spy owner's record
            [spyOwner]: {
              ...ownerEsp,
              spies: {
                ...ownerEsp.spies,
                [spyId]: { ...ownerEsp.spies[spyId]!, status: 'interrogated' as const },
              },
            },
          },
        });
        showNotification(`${spy.name} is being interrogated. Check the Intel panel for results.`, 'info');
        renderLoop.setGameState(session.getState());
      },
    },
  ]);
}

// --- Bootstrap ---
// registerAllPresentation/registerMinorCivNotificationListeners used to run
// as bare module-scope statements here, immediately followed by a bare
// init() call. bootstrap() (#787 phase 10) sequences the same three steps
// explicitly instead of as an import side effect -- see src/app/bootstrap.ts
// for why it does not yet also construct session/selection/host/ceremonies/
// router/panelRegistry (Phase 10b).
void bootstrap({
  bus,
  presentationContext,
  getState: () => session.getState(),
  appendToCivLog,
  gameSession,
});
