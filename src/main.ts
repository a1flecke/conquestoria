import { EventBus } from '@/core/event-bus';
import { RenderLoop } from '@/renderer/render-loop';
import { hexKey, parseHexKey } from '@/systems/hex-utils';
import { moveUnit, getMovementCost } from '@/systems/unit-system';
import { foundCityInState } from '@/systems/city-founding-system';
import { formatCityFoundingBlockerMessage, getCityFoundingBlockers } from '@/systems/city-territory-system';
import { createCityCapturePanel } from '@/ui/city-capture-panel';
import { deterministicCombatSeed, resolveCombat } from '@/systems/combat-system';
import { buildCombatContextForDefender, getAmphibiousAssaultMultiplier } from '@/systems/combat-context';
import { canUnitAttackTarget } from '@/systems/attack-targeting';
import { applyCombatOutcomeToState, getCaptureNotificationLabel } from '@/systems/combat-reward-system';
import { recordCombatForCiv } from '@/systems/threat-pressure-system';
import { resolveCombatEra } from '@/systems/era-resolution';
import { applyCampDestructionAtTarget } from '@/systems/barbarian-system';
import { recordBeastSlain, applyHoardChoice, getHoardChoicePreview, canUnitAttackBeast } from '@/systems/beast-system';
import { createBeastHoardPanel } from '@/ui/beast-hoard-panel';
import { BEAST_DEFINITIONS } from '@/systems/beast-definitions';
import { loadSettings } from '@/storage/save-manager';
import { AudioSystem } from '@/audio/audio-system';
import { SFX } from '@/audio/sfx';
import { AdvisorSystem } from '@/ui/advisor-system';
import { makePeace } from '@/systems/diplomacy-system';
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
import { isSpyUnitType } from '@/systems/espionage-system';
import { applyUnitUpgradeToState } from '@/systems/unit-upgrade-system';
import { executeUnitMove, isWorkerBusy } from '@/systems/unit-movement-system';
import { getEmbarkedAssaultTarget, detachCargoForEmbarkedAssault } from '@/systems/transport-system';
import { createSelectionStore } from '@/app/selection-store';
import type { CombatResult, GameState, HexCoord, UnitType, CivBonusEffect } from '@/core/types';
import type { NotificationCityAction, NotificationEntry } from '@/core/notification-log';
import { createUserSettingsStore } from '@/app/user-settings-store';
import type { Notifier } from '@/app/ports';
import { updateAndRefreshVisibility, reconstructLastSeenFromMap } from '@/systems/last-seen-presentation';
import { createCeremonyCoordinator, type CeremonyCoordinator } from '@/app/controllers/ceremony-coordinator';
import { createSelectionController, type SelectionController } from '@/app/controllers/selection-controller';
import { createDiplomacyActionsController, type DiplomacyActionsController } from '@/app/controllers/diplomacy-actions-controller';
import { createPanelActionsController, type PanelActionsController } from '@/app/controllers/panel-actions-controller';
import { createPlayerActionController, type PlayerActionController } from '@/app/controllers/player-action-controller';
import { createMapInteractionController, type MapInteractionController } from '@/app/controllers/map-interaction-controller';
import { createTurnFlowController, type TurnFlowController } from '@/app/controllers/turn-flow-controller';
import { createHudController, type HudController } from '@/app/controllers/hud-controller';
import { createCampaignEntryController, type CampaignEntryController } from '@/app/controllers/campaign-entry-controller';
import { createGameSessionController, type GameSessionController } from '@/app/controllers/game-session-controller';
import { bootstrap } from '@/app/bootstrap';
import { registerAllPresentation, type PresentationContext } from '@/presentation/register-all';
import { removeRouteForUnit, createMarketplaceState } from '@/systems/trade-system';
import { emitMinorCivQuestTransitions } from '@/systems/quest-chain-system';
import { RoundPresentationGate } from '@/presentation/round-presentation-gate';
import type { GameSession } from '@/app/ports';
import { createGameSession } from '@/app/game-session';
import { createPanelHost, type PanelHost } from '@/app/panel-host';
import { createPanelRouter, type PanelRouter } from '@/app/panel-router';
import type { PanelContext, PanelRegistry } from '@/app/panel-registry';
import { installGlobalShortcuts } from '@/app/global-shortcuts';
import {
  getCurrentCiv,
  getCurrentCivDef,
  clearUnloadState,
  prefersReducedMotion,
  scanBeastSightings,
  focusNotificationTarget,
  focusPirateTarget,
  notifyPlayer,
  applyPirateActionResult,
} from '@/app/cross-cutting-helpers';

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
 * (#787 phase 8c). References `foundCityAction`, a function defined later in
 * this file -- safe because it's a hoisted function declaration that doesn't
 * run until real gameplay, well after module evaluation finishes. The same
 * deferred-but-eager pattern `notifier` and `router` already use.
 * `performWorkerAction`/`getUnitTurnFlow`/`restAction`/`ensurePlayerWarState`
 * moved into `PlayerActionController` (phase 10b-e) and are threaded through
 * as lazy wrappers instead, per that controller's own construction comment
 * further down.
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
 * already uses. `executeUpgrade` is a plain hoisted function declaration, so
 * no wrapper needed for it. `focusNotificationTarget`/`focusPirateTarget`/
 * `applyPirateActionResult`/`currentCiv`/`currentCivDef` are inline arrows
 * calling the pure functions in `src/app/cross-cutting-helpers.ts` (#787
 * phase 10b-f) -- `notifier` inside those arrows is a `let` not assigned
 * until `init()`, same deferred-but-eager pattern as `router` just below.
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
  focusNotificationTarget: target => focusNotificationTarget(renderLoop, notifier, session, target),
  focusPirateTarget: target => focusPirateTarget(renderLoop, notifier, target),
  applyPirateActionResult: (result, successMessage) => applyPirateActionResult(
    { session, bus, renderLoop, updateHUD: () => hud.update(), showNotification },
    result,
    successMessage,
  ),
  currentCiv: () => getCurrentCiv(session),
  currentCivDef: () => getCurrentCivDef(session),
  diplomacyActions,
  executeUpgrade,
  router: { open: panel => router.open(panel) },
  hud: { closeDrawer: () => hud.closeDrawer(), update: () => hud.update() },
  selectionController: {
    selectUnit: (unitId, opts) => selectionController.selectUnit(unitId, opts),
    deselectUnit: () => selectionController.deselectUnit(),
  },
});

/**
 * `getUnitTurnFlow`/`performWorkerAction`/`performPreach`/`restAction`/
 * `ensurePlayerWarState` are wrapped in thin lazily-evaluating closures, not
 * passed directly -- `playerActions` (#787 phase 10b-e) is constructed after
 * `selectionController` (it needs `selectionController` itself as a direct
 * dep, resolving the reverse forward-reference), so a direct reference here
 * would capture `undefined` at construction time. Same deferred-but-eager
 * pattern this file already uses for `router`/`notifier`/`campaignEntry`.
 */
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
  clearUnloadState: () => clearUnloadState(selection),
  getUnitTurnFlow: () => playerActions.getUnitTurnFlow(),
  foundCityAction,
  performWorkerAction: action => playerActions.performWorkerAction(action),
  performPreach: (unitId, cityId) => playerActions.performPreach(unitId, cityId),
  restAction: () => playerActions.restAction(),
  openNetworkIntentPanel: panelActions.openNetworkIntentPanel,
  openUnitStackPicker: panelActions.openUnitStackPicker,
  openPirateHeadquartersAssault: panelActions.openPirateHeadquartersAssault,
  handleEstablishRoute: diplomacyActions.handleEstablishRoute,
  executeUpgrade,
  ensurePlayerWarState: targetCivId => playerActions.ensurePlayerWarState(targetCivId),
  scanBeastSightings: () => scanBeastSightings(session, bus),
  currentCiv: () => getCurrentCiv(session),
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
  currentCiv: () => getCurrentCiv(session),
  // Lazy wrapper: `playerActions` (10b-e) is constructed after `turnFlow`
  // (it needs `turnFlow.endTurn` as a direct dep), same deferred-but-eager
  // reverse forward-reference as `selectionController`'s dep above.
  getUnitTurnFlow: () => playerActions.getUnitTurnFlow(),
  deselectUnit: selectionController.deselectUnit,
  selectNextUnit: selectionController.selectNextUnit,
  scanBeastSightings: () => scanBeastSightings(session, bus),
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
 * Owns the player-unit-action functions `getUnitTurnFlow`, `performWorkerAction`,
 * `performPreach`, `ensurePlayerWarState`, `restAction`, and
 * `showEspionageCaptureChoice` (#787 phase 10b-e -- a partial `PlayerActionController`;
 * Phase 13, not yet merged, will extend this same file with a different
 * function group in the same domain). Constructed after both `selectionController`
 * and `turnFlow` so it can take direct references to both -- see the lazy
 * wrappers those two use above for the reverse direction of this same
 * three-way forward reference. `notifier` still needs its own lazy wrapper
 * here since it is a `let` not assigned until `init()` runs.
 */
const playerActions: PlayerActionController = createPlayerActionController({
  session,
  bus,
  uiLayer,
  selection,
  selectionController,
  turnFlow,
  hud: { update: () => hud.update() },
  renderLoop,
  showNotification,
  setBlockingOverlay,
  currentCiv: () => getCurrentCiv(session),
  notifier: { choice: (message, actions) => notifier.choice(message, actions) },
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
  clearUnloadState: () => clearUnloadState(selection),
  currentCiv: () => getCurrentCiv(session),
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
  focusNotificationTarget: target => focusNotificationTarget(renderLoop, notifier, session, target),
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
  showEspionageCaptureChoice: (spyId, spyOwner) => playerActions.showEspionageCaptureChoice(spyId, spyOwner),
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

// --- Notifications ---
// The toast queue, the choice modal, and the delivery contract below all live
// in notifier (created in init(), see src/ui/notification-center.ts) (#787
// phase 4). `notifier.toast` is the pure DOM enqueue (no log side effect) --
// exactly today's enqueueToast, which is why the extracted `focusNotificationTarget`/
// `focusPirateTarget` helpers (#787 phase 10b-f, src/app/cross-cutting-helpers.ts)
// call it directly instead of going through `showNotification` below.

// Thin wrapper (not extracted, see cross-cutting-helpers.ts's module docblock
// for why): delegates to the pure `notifyPlayer`, but stays a hoisted
// `main.ts` function so its ~8 controller consumers' `showNotification` dep
// keeps working as a bare reference, unchanged by this phase.
function showNotification(
  message: string,
  type: NotificationEntry['type'] = 'info',
  target?: NotificationEntry['target'],
): void {
  notifyPlayer(notifier, session, message, type, target);
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

  playerActions.ensurePlayerWarState(city.owner);
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

  playerActions.ensurePlayerWarState(defender.owner);

  const seed = deterministicCombatSeed(session.getState().gameId, session.getState().turn, attacker.id, defender.id);
  const attackerBonus = getCurrentCivDef(session)?.bonusEffect;
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
  // Thunked, not `notifier.deliver` directly -- `notifier` is not assigned
  // until init() runs, after this module-scope call (#787 phase 10b-f,
  // formerly the separate `appendToCivLog` const, inlined at its one
  // consumer).
  appendToCivLog: (...args) => notifier.deliver(...args),
  gameSession,
});
