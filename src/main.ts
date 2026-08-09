import { EventBus } from '@/core/event-bus';
import { RenderLoop } from '@/renderer/render-loop';
import { hexKey, hexesInRange, parseHexKey } from '@/systems/hex-utils';
import { moveUnit, getMovementCost, UNIT_DEFINITIONS, restUnit, canHeal, createUnit } from '@/systems/unit-system';
import { isMajorCivOwner } from '@/core/owner-kind';
import { getProductionDisplayName, TRAINABLE_UNITS } from '@/systems/city-system';
import { chooseCircularManufacturingMaterial } from '@/systems/national-project-system';
import { foundCityInState } from '@/systems/city-founding-system';
import { assignCityFocus, setCityWorkedTile } from '@/systems/city-work-system';
import { formatCityFoundingBlockerMessage, getCityFoundingBlockers } from '@/systems/city-territory-system';
import { enqueueCityProduction, enqueueResearch, moveQueuedId, removeQueuedId, reorderCityProduction, setIdleProduction } from '@/systems/planning-system';
import { createTechPanel } from '@/ui/tech-panel';
import { createCityPanel } from '@/ui/city-panel';
import { createCityCapturePanel } from '@/ui/city-capture-panel';
import { createWonderPanel } from '@/ui/wonder-panel';
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
import { loadSettings, saveSettings } from '@/storage/save-manager';
import { AudioSystem } from '@/audio/audio-system';
import { SFX } from '@/audio/sfx';
import { createDiplomacyPanel } from '@/ui/diplomacy-panel';
import { createMarketplacePanel } from '@/ui/marketplace-panel';
import { createEspionagePanel } from '@/ui/espionage-panel';
import { AdvisorSystem } from '@/ui/advisor-system';
import { createCouncilPanel } from '@/ui/council-panel';
import type { PirateFocusTarget } from '@/systems/pirate-presentation';
import type { PirateActionResult } from '@/systems/pirate-actions';
import { formatNotificationTargetFocusMessage } from '@/ui/notification-targets';
import { createNetworkIntentPanel } from '@/ui/network-intent-panel';
import { createNetworkPanel, getNetworkPanelModel } from '@/ui/network-panel';
import { renderUnitStackPanel } from '@/ui/unit-stack-panel';
import { createUnitTurnFlow } from '@/ui/unit-turn-flow';
import { resolveCivDefinition } from '@/systems/civ-registry';
import { declareWar, makePeace, modifyRelationship, resolveOpponentKind } from '@/systems/diplomacy-system';
import { visitVillage } from '@/systems/village-system';
import { assignNetworkPlan, cancelNetworkPlan, holdNetworkPlan, isAutonomyActivated, retargetNetworkPlan } from '@/systems/network-plan-system';
import { beginAutonomySurge, requestAutonomyPosture } from '@/systems/autonomy-postures';
import { clearStaleSoloPendingEvents } from '@/core/hotseat-events';
import { refreshKnownCivilizations, syncCivilizationContactsFromVisibility } from '@/systems/discovery-system';
import { getMinorCivNotification } from '@/ui/minor-civ-notifications';
import { registerMinorCivNotificationListeners } from '@/ui/minor-civ-notification-listeners';
import { conquestMinorCiv, applyDiplomaticReaction } from '@/systems/minor-civ-system';
import { buildUnitOccupancy, hasHostileUnitAtCoord } from '@/systems/unit-occupancy';
import { beginPlayerCityAssaultChoice, shouldPromptForPlayerCityCapture } from '@/input/city-assault-flow';
import { canUnitOccupyCity } from '@/systems/city-capture-system';
import { buildCombatPresentation } from '@/systems/viewer-event-presentation';
import { initializeLegendaryWonderProjectsForCity, startLegendaryWonderBuild } from '@/systems/legendary-wonder-system';
import { embedSpy, unembedSpy, attemptSweep, getAvailableMissions, getSpyCaptureRelationshipPenalty, expelSpy, executeSpy, startInterrogation, isSpyUnitType, missionRequiresPlacedSpy, recallSpy, resolveMissionResult, startMission, verifyAgent } from '@/systems/espionage-system';
import { applyUnitUpgradeToState, evaluateUnitUpgrade } from '@/systems/unit-upgrade-system';
import { executeUnitMove, isWorkerBusy } from '@/systems/unit-movement-system';
import { getEmbarkedAssaultTarget, detachCargoForEmbarkedAssault } from '@/systems/transport-system';
import { createSelectionStore } from '@/app/selection-store';
import { getCapitalCity, getCapitalCityId } from '@/systems/capital-system';
import type { CombatResult, GameState, HexCoord, Unit, UnitType, CivBonusEffect, WorkerActionType } from '@/core/types';
import { appendNotification, type NotificationCityAction, type NotificationEntry } from '@/core/notification-log';
import type { NotificationSink } from '@/ui/notification-routing';
import { createUserSettingsStore } from '@/app/user-settings-store';
import type { Notifier } from '@/app/ports';
import { updateAndRefreshVisibility, reconstructLastSeenFromMap } from '@/systems/last-seen-presentation';
import { rushBuyActiveProduction } from '@/systems/economy-system';
import { applyQuarantine, applyRemedy } from '@/systems/crisis-system';
import { canBuyResourceAccess, performBuyResourceAccess } from '@/systems/resource-acquisition-system';
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
import { createCityOverviewPanel } from '@/ui/city-overview-panel';
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
    if (city) openCityPanelForCity(city);
  },
  openJournal: cityId => {
    if (session.getState().cities[cityId]) openWonderPanelForCityId(cityId);
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
 * already uses for `updateHUD: () => hud.update()` below.
 */
const diplomacyActions: DiplomacyActionsController = createDiplomacyActionsController({
  session,
  bus,
  renderLoop,
  uiLayer,
  showNotification,
  openDiplomacyPanel,
  hud: { update: () => hud.update() },
  selectionController: { selectUnit: (unitId, opts) => selectionController.selectUnit(unitId, opts) },
});

/**
 * Owns the utility and world-event panel openers (#787 phase 10b-b -- part 1
 * of 3 for `PanelActionsController`, see 10b-c/10b-d for the rest). `hud` and
 * `selectionController` use the same deferred-but-eager lazy-wrapper pattern
 * as `diplomacyActions` above, for the same reason (neither is assigned yet
 * at this point in module evaluation).
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
  openCityPanelForCity,
  openWonderPanelForCityId,
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
  openNetworkIntentPanel,
  openUnitStackPicker,
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
  openCityPanelForCity,
});

/**
 * Owns the two map-input entry points, `handleHexTap` and
 * `handleHexLongPress` (#787 phase 8d). References several functions
 * defined later in this file (`openCityPanelForCity`, `executeAttack`,
 * etc.) -- safe because they are hoisted function declarations and none of
 * them run until real gameplay, well after module evaluation finishes. The
 * same deferred-but-eager pattern `selectionController` above already uses.
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
  openUnitStackPicker,
  openCityPanelForCity,
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

function openDiplomacyPanel(): void {
  hud.closeDrawer();
  document.getElementById('diplomacy-panel')?.remove();
  createDiplomacyPanel(uiLayer, session.getState(), {
    onAction: diplomacyActions.handleDiplomaticAction,
    onAcceptPeaceRequest: diplomacyActions.handleAcceptPeaceRequest,
    onRejectPeaceRequest: diplomacyActions.handleRejectPeaceRequest,
    onAcceptTreatyProposal: diplomacyActions.handleAcceptTreatyProposal,
    onDeclineTreatyProposal: diplomacyActions.handleDeclineTreatyProposal,
    onBreakTreaty: diplomacyActions.handleBreakTreaty,
    onGiftGold: diplomacyActions.handleGiftGold,
    onSponsorFestival: diplomacyActions.handleSponsorFestival,
    onMinorCivReparations: diplomacyActions.handleMinorCivReparations,
    onMinorCivWarPeace: diplomacyActions.handleMinorCivWarPeace,
    onSendAid: diplomacyActions.handleSendAid,
    onClose: () => {},
  });
}

function openMarketplacePanel(): void {
  hud.closeDrawer();
  document.getElementById('marketplace-panel')?.remove();
  createMarketplacePanel(uiLayer, session.getState(), {
    onClose: () => {},
    onSelectUnit: (unitId) => {
      document.getElementById('marketplace-panel')?.remove();
      selectionController.selectUnit(unitId);
      const unit = session.getState().units[unitId];
      if (unit) renderLoop.camera.centerOn(unit.position);
    },
    onBuyResourceAccess: (sellerCivId, resource) => {
      if (!canBuyResourceAccess(session.getState(), session.getState().currentPlayer, sellerCivId, resource)) return;
      session.commit(performBuyResourceAccess(session.getState(), session.getState().currentPlayer, sellerCivId, resource));
      showNotification(`Purchased ${resource} access for 10 turns.`, 'success');
      openMarketplacePanel(); // re-render panel with updated state
    },
  });
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

function openWonderPanelForCityId(selectedCityId: string): void {
  if (!session.getState().cities[selectedCityId]) return;

  const openWonderPanel = () => {
    document.getElementById('wonder-panel')?.remove();
    createWonderPanel(uiLayer, session.getState(), selectedCityId, {
      onStartBuild: (buildCityId, wonderId) => {
        session.setStateWithoutRefresh(startLegendaryWonderBuild(session.getState(), session.getState().currentPlayer, buildCityId, wonderId, bus));
        const targetCity = session.getState().cities[buildCityId];
        if (targetCity) {
          renderLoop.setGameState(session.getState());
          hud.update();
          const productionItemId = `legendary:${wonderId}`;
          if (targetCity.productionQueue[0] === productionItemId) {
            showNotification(`${targetCity.name}: preparing ${getProductionDisplayName(productionItemId)}`, 'info');
          } else {
            showNotification(`${targetCity.name}: ${getProductionDisplayName(productionItemId)} is not ready to start.`, 'warning');
          }
          openWonderPanel();
        }
      },
      onClose: () => {
        document.getElementById('wonder-panel')?.remove();
      },
    });
  };
  session.setStateWithoutRefresh(initializeLegendaryWonderProjectsForCity(session.getState(), session.getState().currentPlayer, selectedCityId));
  openWonderPanel();
}

function openCityOverviewPanel(): void {
  hud.closeDrawer();
  const existing = document.getElementById('city-overview-panel');
  if (existing) existing.remove();
  createCityOverviewPanel(uiLayer, session.getState(), {
    onOpenCity: (cityId) => {
      const overview = document.getElementById('city-overview-panel');
      overview?.remove();
      const city = session.getState().cities[cityId];
      if (city) openCityPanelForCity(city);
    },
    onAppeaseFaction: (cityId) => {
      diplomacyActions.handleAppeaseFaction(cityId);
      openCityOverviewPanel(); // re-render with updated unrest/gold state
    },
    onConcedeToMovement: (cityId) => {
      diplomacyActions.handleConcedeToMovement(cityId);
      openCityOverviewPanel(); // re-render with updated unrest/gold state
    },
    onClose: () => {
      document.getElementById('city-overview-panel')?.remove();
    },
  });
}

function openCityPanelForCity(city: import('@/core/types').City): void {
  hud.closeDrawer();
  if (city.owner !== session.getState().currentPlayer) return;

  createCityPanel(uiLayer, city, session.getState(), {
    onBuild: (cityId, itemId) => {
      const targetCity = session.getState().cities[cityId];
      if (targetCity) {
        try {
          session.getState().cities[cityId] = enqueueCityProduction(targetCity, itemId);
          renderLoop.setGameState(session.getState());
          showNotification(`${targetCity.name}: queued ${getProductionDisplayName(itemId)}`, 'info');
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Queue limit reached';
          showNotification(`${targetCity.name}: ${message}`, 'warning');
        }
      }
    },
    onMoveQueueItem: (cityId, fromIndex, toIndex) => {
      const targetCity = session.getState().cities[cityId];
      if (!targetCity) return;
      session.getState().cities[cityId] = reorderCityProduction(targetCity, fromIndex, toIndex);
      renderLoop.setGameState(session.getState());
    },
    onRemoveQueueItem: (cityId, index) => {
      const targetCity = session.getState().cities[cityId];
      if (!targetCity) return;
      session.getState().cities[cityId] = {
        ...targetCity,
        productionQueue: removeQueuedId(targetCity.productionQueue, index),
        productionProgress: index === 0 ? 0 : targetCity.productionProgress,
      };
      renderLoop.setGameState(session.getState());
    },
    onOpenWonderPanel: (selectedCityId) => {
      openWonderPanelForCityId(selectedCityId);
    },
    onSetCityFocus: (cityId, focus) => {
      const result = assignCityFocus(session.getState(), cityId, focus);
      session.commit(result.state);
      showNotification(`${session.getState().cities[cityId].name} reassigned citizens for ${focus} focus.`, 'info');
      return session.getState();
    },
    onToggleWorkedTile: (cityId, coord, worked) => {
      const result = setCityWorkedTile(session.getState(), cityId, coord, worked);
      session.commit(result.state);
      if (!result.changed && result.reason === 'claimed') {
        showNotification('That tile is already worked by another city.', 'warning');
      }
      return session.getState();
    },
    onClose: () => {},
    onTip: (message) => { showNotification(message, 'info'); },
    onSelectUnit: (unitId) => selectionController.selectUnit(unitId),
    onEstablishRoute: diplomacyActions.handleEstablishRoute,
    onPrevCity: () => {
      const cities = currentCiv().cities;
      if (cities.length <= 1) return;
      const currentIdx = cities.indexOf(city.id);
      const prevIdx = (currentIdx - 1 + cities.length) % cities.length;
      const prevCity = session.getState().cities[cities[prevIdx]];
      if (prevCity) openCityPanelForCity(prevCity);
    },
    onNextCity: () => {
      const cities = currentCiv().cities;
      if (cities.length <= 1) return;
      const currentIdx = cities.indexOf(city.id);
      const nextIdx = (currentIdx + 1) % cities.length;
      const nextCity = session.getState().cities[cities[nextIdx]];
      if (nextCity) openCityPanelForCity(nextCity);
    },
    onUpgradeUnit: (unitId) => {
      const unit = session.getState().units[unitId];
      if (!unit || unit.owner !== session.getState().currentPlayer) return;
      const targetType = TRAINABLE_UNITS.find(entry => entry.type === unit.type)?.upgradesTo;
      if (!targetType) return;
      const upgrade = evaluateUnitUpgrade(session.getState(), unitId, targetType);
      if (!upgrade.canUpgrade || !upgrade.targetType) return;
      if (executeUpgrade(unitId, upgrade.targetType)) {
        showNotification(`Upgraded to ${UNIT_DEFINITIONS[upgrade.targetType].name}!`, 'success');
      }
    },
    onSetIdleProduction: (cityId, mode) => {
      const targetCity = session.getState().cities[cityId];
      if (!targetCity) return;
      session.getState().cities[cityId] = setIdleProduction(targetCity, mode);
      renderLoop.setGameState(session.getState());
    },
    onRushBuyActiveProduction: (cityId) => {
      const targetCity = session.getState().cities[cityId];
      if (!targetCity) return session.getState();
      const result = rushBuyActiveProduction(session.getState(), session.getState().currentPlayer, cityId, bus);
      if (!result.success) {
        showNotification(result.message, 'warning');
        return session.getState();
      }
      session.commit(result.state);
      showNotification(`${targetCity.name}: rush bought ${result.label} for ${result.cost} gold.`, 'success');
      return session.getState();
    },
    onAppeaseFaction: (cityId) => diplomacyActions.handleAppeaseFaction(cityId),
    onConcedeToMovement: (cityId) => diplomacyActions.handleConcedeToMovement(cityId),
    onQuarantineCrisis: (crisisId, cityId) => {
      const result = applyQuarantine(session.getState(), crisisId, cityId);
      if (!result.success) {
        showNotification(result.message, 'warning');
        return session.getState();
      }
      session.commit(result.state);
      showNotification(result.message, 'success');
      return session.getState();
    },
    onRemedyCrisis: (crisisId, cityId) => {
      const result = applyRemedy(session.getState(), crisisId, cityId);
      if (!result.success) {
        showNotification(result.message, 'warning');
        return session.getState();
      }
      session.commit(result.state);
      showNotification(result.message, 'success');
      return session.getState();
    },
    onFindResources: (highlights, toasts) => {
      renderLoop.setHighlights(highlights.map(coord => ({ coord, type: 'worker-buildable' as const })));
      for (const t of toasts) showNotification(t.message, t.type);
    },
    onChooseCircularManufacturingMaterial: (material) => {
      try {
        session.setStateWithoutRefresh(chooseCircularManufacturingMaterial(session.getState(), session.getState().currentPlayer, material));
      } catch (error) {
        showNotification(error instanceof Error ? error.message : 'That material choice is unavailable.', 'warning');
        return;
      }
      renderLoop.setGameState(session.getState());
      showNotification(`Circular Manufacturing Network will substitute ${material.replaceAll('-', ' ')} when it helps.`, 'success');
      const refreshedCity = session.getState().cities[city.id];
      if (refreshedCity) openCityPanelForCity(refreshedCity);
    },
  });
}

function openCouncilPanel(): void {
  hud.closeDrawer();
  createCouncilPanel(uiLayer, session.getState(), {
    onClose: () => {
      document.getElementById('council-panel')?.remove();
    },
    onTalkLevelChange: (level) => {
      session.getState().settings.councilTalkLevel = level;
      void saveSettings(session.getState().settings);
    },
  });
}

function openTechPanel(): void {
  hud.closeDrawer();
  createTechPanel(uiLayer, session.getState(), {
    onQueueResearch: (techId) => {
      try {
        currentCiv().techState = enqueueResearch(currentCiv().techState, techId);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Queue limit reached';
        showNotification(message, 'warning');
        return;
      }
      renderLoop.setGameState(session.getState());
      hud.update();
      showNotification(`Queued research: ${techId}`, 'info');
    },
    onMoveQueuedResearch: (fromIndex, toIndex) => {
      currentCiv().techState = {
        ...currentCiv().techState,
        researchQueue: moveQueuedId(currentCiv().techState.researchQueue, fromIndex, toIndex),
      };
      renderLoop.setGameState(session.getState());
      hud.update();
    },
    onRemoveQueuedResearch: (index) => {
      currentCiv().techState = {
        ...currentCiv().techState,
        researchQueue: removeQueuedId(currentCiv().techState.researchQueue, index),
      };
      renderLoop.setGameState(session.getState());
      hud.update();
    },
    onClose: () => {},
  });
}

function openEspionagePanel(): void {
  hud.closeDrawer();
  const chooseForeignCityTarget = (): { civId: string; cityId: string; position: HexCoord } | null => {
      const choices = Object.values(session.getState().cities)
        .filter(city => city.owner !== session.getState().currentPlayer)
        .sort((a, b) => a.name.localeCompare(b.name));
      if (choices.length === 0) {
        showNotification('No foreign cities available for espionage.', 'info');
        return null;
      }
      const selection = window.prompt(
        `Choose target city by id:\n${choices.map(city => `${city.id} (${city.owner})`).join('\n')}`,
        choices[0].id,
      );
      if (!selection) return null;
      const city = session.getState().cities[selection];
      if (!city || city.owner === session.getState().currentPlayer) {
        showNotification('Invalid espionage target.', 'warning');
        return null;
      }
      return { civId: city.owner, cityId: city.id, position: city.position };
    };

    const chooseFriendlyCityTarget = (): { cityId: string; position: HexCoord } | null => {
      const choices = currentCiv().cities
        .map(cityId => session.getState().cities[cityId])
        .filter((city): city is NonNullable<GameState['cities'][string]> => city !== undefined);
      if (choices.length === 0) {
        showNotification('No cities available for defensive espionage.', 'info');
        return null;
      }
      const selection = window.prompt(
        `Choose friendly city by id:\n${choices.map(city => city.id).join('\n')}`,
        choices[0].id,
      );
      if (!selection) return null;
      const city = session.getState().cities[selection];
      if (!city || city.owner !== session.getState().currentPlayer) {
        showNotification('Invalid defensive target.', 'warning');
        return null;
      }
      return { cityId: city.id, position: city.position };
    };

    const chooseMission = (spyId: string): string | null => {
      const spy = session.getState().espionage?.[session.getState().currentPlayer]?.spies[spyId];
      const completedTechs = currentCiv().techState.completed ?? [];
      // #524 MR2a review fix: flip_loyalty can never succeed against a capital (see
      // resolveMissionResult's guard in espionage-system.ts) -- don't offer it as a
      // choice when the spy's current target already is one. Without this, a spy
      // stationed in an enemy capital could "succeed" an 8-turn flip_loyalty mission
      // that silently does nothing, with no explanation.
      const spyTargetsCapital = Boolean(
        spy?.targetCivId && spy.targetCityId
          && getCapitalCityId(session.getState(), spy.targetCivId) === spy.targetCityId,
      );
      const missions = getAvailableMissions(completedTechs)
        .filter(mission => !missionRequiresPlacedSpy(mission) || Boolean(spy?.targetCivId))
        .filter(mission => mission !== 'flip_loyalty' || !spyTargetsCapital);
      if (missions.length === 0) {
        showNotification('No missions available for this spy.', 'info');
        return null;
      }
      return window.prompt(`Choose mission:\n${missions.join('\n')}`, missions[0]);
    };

    uiLayer.appendChild(createEspionagePanel(session.getState(), {
      onClose: () => document.getElementById('espionage-panel')?.remove(),
      onAssignDefensive: (spyId) => {
        const target = chooseFriendlyCityTarget();
        if (!target) return;
        session.getState().espionage![session.getState().currentPlayer] = embedSpy(
          session.getState().espionage![session.getState().currentPlayer],
          spyId,
          target.cityId,
          target.position,
        );
        const unit = session.getState().units[spyId];
        if (unit) {
          delete session.getState().units[spyId];
          session.getState().civilizations[session.getState().currentPlayer].units =
            session.getState().civilizations[session.getState().currentPlayer].units.filter(id => id !== spyId);
        }
        renderLoop.setGameState(session.getState());
        router.open('espionage');
        const cityName = session.getState().cities[target.cityId]?.name ?? target.cityId;
        showNotification(`Spy embedded in ${cityName}. Counter-intelligence boosted.`, 'info');
      },
      onStartMission: (spyId) => {
        const spy = session.getState().espionage?.[session.getState().currentPlayer]?.spies[spyId];
        if (!spy) return;
        const mission = chooseMission(spyId);
        if (!mission) return;
        let targetCivId = spy.targetCivId ?? undefined;
        let targetCityId = spy.targetCityId ?? undefined;
        if (!missionRequiresPlacedSpy(mission as any)) {
          const target = chooseForeignCityTarget();
          if (!target) return;
          targetCivId = target.civId;
          targetCityId = target.cityId;
        }
        session.getState().espionage![session.getState().currentPlayer] = startMission(
          session.getState().espionage![session.getState().currentPlayer],
          spyId,
          mission as any,
          currentCivDef()?.bonusEffect,
          targetCivId,
          targetCityId,
        );
        renderLoop.setGameState(session.getState());
        router.open('espionage');
        showNotification(`Mission ${mission} started.`, 'info');
      },
      onRecall: (spyId) => {
        session.getState().espionage![session.getState().currentPlayer] = recallSpy(
          session.getState().espionage![session.getState().currentPlayer],
          spyId,
        );
        renderLoop.setGameState(session.getState());
        router.open('espionage');
        showNotification('Spy recalled.', 'info');
      },
      onVerifyAgent: (spyId) => {
        session.getState().espionage![session.getState().currentPlayer] = verifyAgent(
          session.getState().espionage![session.getState().currentPlayer],
          spyId,
        );
        renderLoop.setGameState(session.getState());
        router.open('espionage');
        showNotification('Agent verified and cleared.', 'success');
      },
      onExfiltrate: (spyId) => {
        const ownerEsp = session.getState().espionage?.[session.getState().currentPlayer];
        const spy = ownerEsp?.spies[spyId];
        if (!spy || spy.status !== 'stationed') return;
        const capital = getCapitalCity(session.getState(), session.getState().currentPlayer);
        if (!capital) { showNotification('Cannot exfiltrate — no capital found.', 'warning'); return; }

        // Spawn occupancy: find a free tile at/near the capital
        const existingPositions = new Set(
          Object.values(session.getState().units).map(u => `${u.position.q},${u.position.r}`),
        );
        let spawnPos = capital.position;
        if (existingPositions.has(`${spawnPos.q},${spawnPos.r}`)) {
          const adjacent = hexesInRange(capital.position, 1).filter(
            c => !(c.q === capital.position.q && c.r === capital.position.r) &&
                 !existingPositions.has(`${c.q},${c.r}`) &&
                 session.getState().map.tiles[hexKey(c)],
          );
          if (adjacent.length === 0) {
            showNotification('Cannot exfiltrate — no free tile near capital.', 'warning');
            return;
          }
          spawnPos = adjacent[0];
        }

        const newUnit = createUnit(spy.unitType, session.getState().currentPlayer, spawnPos, session.getState().idCounters);
        session.getState().units[newUnit.id] = newUnit;
        session.getState().civilizations[session.getState().currentPlayer].units =
          [...(session.getState().civilizations[session.getState().currentPlayer].units ?? []), newUnit.id];
        const updatedSpy = {
          ...spy, id: newUnit.id, status: 'cooldown' as const,
          cooldownTurns: 8, infiltrationCityId: null, cityVisionTurnsLeft: 0, targetCivId: null, cooldownMode: undefined,
        };
        const { [spyId]: _old, ...rest } = ownerEsp!.spies;
        session.getState().espionage![session.getState().currentPlayer] = { ...ownerEsp!, spies: { ...rest, [newUnit.id]: updatedSpy } };
        renderLoop.setGameState(session.getState());
        // Refresh panel in place
        document.getElementById('espionage-panel')?.remove();
        router.open('espionage');
        showNotification('Spy exfiltrated. Available again in 8 turns.', 'info');
      },
      onToggleCooldownMode: (spyId) => {
        const civEsp = session.getState().espionage?.[session.getState().currentPlayer];
        const spy = civEsp?.spies[spyId];
        if (!spy || spy.status !== 'cooldown') return;
        const next: 'stay_low' | 'passive_observe' =
          (spy.cooldownMode ?? 'stay_low') === 'passive_observe' ? 'stay_low' : 'passive_observe';
        session.commit({
          ...session.getState(),
          espionage: {
            ...session.getState().espionage!,
            [session.getState().currentPlayer]: {
              ...civEsp!,
              spies: { ...civEsp!.spies, [spyId]: { ...spy, cooldownMode: next } },
            },
          },
        });
        document.getElementById('espionage-panel')?.remove();
        router.open('espionage');
      },
      onUnembed: (spyId) => {
        const ownerEsp = session.getState().espionage?.[session.getState().currentPlayer];
        const spy = ownerEsp?.spies[spyId];
        if (!spy || spy.status !== 'embedded' || !spy.targetCityId) return;
        const city = session.getState().cities[spy.targetCityId];
        if (!city) return;
        const newUnit = createUnit(spy.unitType, session.getState().currentPlayer, city.position, session.getState().idCounters);
        session.getState().units[newUnit.id] = newUnit;
        session.getState().civilizations[session.getState().currentPlayer].units.push(newUnit.id);
        const unembedded = unembedSpy(ownerEsp!, spyId);
        const rekeyed = { ...unembedded.spies[spyId], id: newUnit.id };
        const { [spyId]: _old, ...rest } = unembedded.spies;
        session.getState().espionage![session.getState().currentPlayer] = { ...unembedded, spies: { ...rest, [newUnit.id]: rekeyed } };
        renderLoop.setGameState(session.getState());
        document.getElementById('espionage-panel')?.remove();
        router.open('espionage');
        showNotification(`Spy recalled from ${city.name}. Available in 5 turns.`, 'info');
      },
      onSweep: (spyId) => {
        const ownerEsp = session.getState().espionage?.[session.getState().currentPlayer];
        if (!ownerEsp) return;
        const seed = `sweep-${spyId}-${session.getState().turn}`;
        const { detectedSpyIds, state: updatedEsp } = attemptSweep(ownerEsp, spyId, seed, session.getState());
        session.getState().espionage![session.getState().currentPlayer] = updatedEsp;
        if (detectedSpyIds.length > 0) {
          showNotification(`Sweep detected ${detectedSpyIds.length} enemy spy(ies) in the city!`, 'warning');
        } else {
          showNotification('Sweep complete — no enemy spies detected.', 'info');
        }
        renderLoop.setGameState(session.getState());
        document.getElementById('espionage-panel')?.remove();
        router.open('espionage');
      },
    }));
}

/**
 * Replaces `togglePanel`'s 288-line `else if` chain (#787 phase 5). Panels
 * that require a specific target -- a city id, a hex coord -- have no
 * parameterless "open the current one" call, so their `open` throws; they
 * still need a registry entry so `closeGroup`/`isOpen`/`close` (all
 * DOM-derived off `domId`) behave correctly when a 'main' or 'transient'
 * sweep runs. Their real entry points (`openCityPanelForCity`,
 * `openWonderPanelForCityId`) stay directly-callable functions, untouched
 * by this phase. The territory-inspection panel has no such entry point of
 * its own -- it opens only as a side effect of `mapInteraction.handleHexLongPress`
 * (#787 phase 8d), which is not itself in this registry.
 */
const panelRegistry = {
  council: { domId: 'council-panel', group: 'main', open: () => openCouncilPanel() },
  tech: { domId: 'tech-panel', group: 'main', open: () => openTechPanel() },
  city: {
    domId: 'city-panel',
    group: 'main',
    open: () => {
      throw new Error("'city' is parameterized -- call openCityPanelForCity(city) directly, not router.open('city').");
    },
  },
  espionage: { domId: 'espionage-panel', group: 'main', open: () => openEspionagePanel() },
  diplomacy: { domId: 'diplomacy-panel', group: 'main', open: () => openDiplomacyPanel() },
  marketplace: { domId: 'marketplace-panel', group: 'main', open: () => openMarketplacePanel() },
  network: { domId: 'network-panel', group: 'transient', open: () => openNetworkPanel() },
  wonder: {
    domId: 'wonder-panel',
    group: 'transient',
    open: () => {
      throw new Error("'wonder' is parameterized -- call openWonderPanelForCityId(cityId) directly, not router.open('wonder').");
    },
  },
  'wonder-atlas': { domId: 'wonder-codex-panel', group: 'transient', open: () => panelActions.openWonderAtlas() },
  bestiary: { domId: 'bestiary-panel', group: 'transient', open: () => panelActions.openBestiary() },
  'pirate-waters': { domId: 'pirate-waters-panel', group: 'transient', open: () => panelActions.openPirateWaters() },
  'notification-log': { domId: 'notification-log', group: 'transient', open: () => panelActions.openNotificationLog() },
  'city-overview': { domId: 'city-overview-panel', group: 'main', open: () => openCityOverviewPanel() },
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

function openUnitStackPicker(coord: HexCoord, unitIds: string[]): void {
  const panel = document.getElementById('info-panel');
  if (!panel) return;

  renderUnitStackPanel(panel, session.getState(), coord, unitIds, {
    onSelectUnit: (unitId) => selectionController.selectUnit(unitId),
    onOpenCity: (cityId) => {
      const city = session.getState().cities[cityId];
      if (!city) return;
      document.getElementById('tech-panel')?.remove();
      document.getElementById('city-panel')?.remove();
      document.getElementById('espionage-panel')?.remove();
      document.getElementById('diplomacy-panel')?.remove();
      document.getElementById('marketplace-panel')?.remove();
      document.getElementById('council-panel')?.remove();
      selectionController.deselectUnit();
      openCityPanelForCity(city);
    },
    onClose: () => selectionController.deselectUnit(),
  }, { selectedUnitId: selection.getSelectedUnitId() });
}

function openNetworkIntentPanel(sourceUnitId: string): void {
  const source = session.getState().units[sourceUnitId];
  const ownerCivId = session.getState().currentPlayer;
  if (!source || source.owner !== ownerCivId || !isAutonomyActivated(session.getState(), ownerCivId)) {
    showNotification('This unit cannot coordinate the network right now.', 'warning');
    return;
  }
  if (source.type === 'drone_controller') {
    // Formation targets are generated and previewed by the same full Network
    // panel used for city plans, so the controller never receives a UI-only
    // legality shortcut.
    openNetworkPanel();
    return;
  }
  if (source.type !== 'cyber_unit') {
    showNotification('Only a Cyber Unit or Drone Controller can coordinate the network.', 'warning');
    return;
  }

  let panel: HTMLElement | undefined;
  const close = () => panel?.remove();
  panel = createNetworkIntentPanel(session.getState(), ownerCivId, sourceUnitId, {
    onAssign: (definitionId, cityId) => {
      const current = Object.values(session.getState().autonomyByCiv?.[ownerCivId]?.plans ?? {})
        .find(plan => plan.sourceUnitId === sourceUnitId);
      const stateForAssignment = current && current.definitionId !== definitionId
        ? holdNetworkPlan(session.getState(), ownerCivId, sourceUnitId).state
        : session.getState();
      const result = current && current.definitionId === definitionId
        ? retargetNetworkPlan(session.getState(), ownerCivId, current.id, { kind: 'city', cityId })
        : assignNetworkPlan(stateForAssignment, {
          ownerCivId,
          sourceUnitId,
          definitionId,
          target: { kind: 'city', cityId },
        });
      if (!result.validation.ok) {
        showNotification('That network intent is no longer available. Choose another target.', 'warning');
        close();
        openNetworkIntentPanel(sourceUnitId);
        return;
      }
      session.commit(result.state);
      close();
      selectionController.selectUnit(sourceUnitId);
      const cityName = session.getState().cities[cityId]?.name ?? 'the city';
      showNotification(`${definitionId === 'harden' ? 'Harden' : 'Exploit'} assigned to ${cityName}.`, 'success');
    },
    onHold: () => {
      const result = holdNetworkPlan(session.getState(), ownerCivId, sourceUnitId);
      session.commit(result.state);
      close();
      selectionController.selectUnit(sourceUnitId);
      showNotification('Cyber Unit is holding.', 'info');
    },
    onClose: close,
  });
  uiLayer.appendChild(panel);
}

function openNetworkPanel(): void {
  const civId = session.getState().currentPlayer;
  if (!isAutonomyActivated(session.getState(), civId)) return;
  let panel: HTMLElement | undefined;
  const rerender = () => {
    panel?.remove();
    panel = createNetworkPanel(getNetworkPanelModel(session.getState(), civId), {
      onAssign: request => {
        const result = assignNetworkPlan(session.getState(), request);
        if (!result.validation.ok) {
          showNotification('That plan is no longer available.', 'warning');
          rerender();
          return;
        }
        session.commit(result.state);
        showNotification('Network plan assigned.', 'success');
        rerender();
      },
      onCancel: planId => {
        session.commit(cancelNetworkPlan(session.getState(), civId, planId).state);
        rerender();
      },
      onSurge: planId => {
        const result = beginAutonomySurge(session.getState(), civId, planId);
        if (!result.validation.ok) showNotification('Surge is unavailable while the network recovers or cools down.', 'warning');
        else {
          session.commit(result.state);
          bus.emit('network:audio-cue', { cue: 'surge', viewerIds: [civId] });
          showNotification('Network Surge confirmed.', 'success');
        }
        rerender();
      },
      onPosture: posture => {
        session.commit(requestAutonomyPosture(session.getState(), civId, posture));
        rerender();
      },
      onClose: () => panel?.remove(),
    });
    uiLayer.appendChild(panel);
  };
  rerender();
}

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
