/**
 * The composition root (#787 phase 10b-g, extended in phases 13 and 11).
 * `createAppComposition` constructs every controller `main.ts` used to build
 * at module scope -- `host`, `ceremonies`, `diplomacyActions`,
 * `panelActions`, `selectionController`, `turnFlow`, `playerActions`,
 * `mapInteraction`, `hud`, `campaignEntry`, `gameSession`,
 * `presentationContext`, `panelRegistry`, and `router` -- plus, as of phase
 * 11, `showNotification` and `maybeShowPendingHoardChoice` themselves (both
 * were the last two `main.ts`-local functions; neither needed to live
 * outside this file, they just predated the composition split). Returns the
 * handful of controllers `main.ts` still needs a direct reference to
 * (`gameSession` and `presentationContext` for the final `bootstrap()` call
 * below; the rest are exposed for testability, not because `main.ts` itself
 * still reaches for them). `bootstrap()` itself is unchanged: it still
 * sequences presentation registration, minor-civ notification listeners, and
 * `gameSession.init()`, against the `presentationContext`/`gameSession` this
 * file constructs.
 *
 * `main.ts` keeps only the true externally-supplied primitives (`canvas`,
 * `uiLayer`, `renderLoop`, `audio`, `bus`, `session`, `selection`,
 * `userSettingsStore`, `roundPresentationGate`, `advisorSystem`) and the
 * `notifier` binding itself -- as of phase 11 a `{ current }` box, not a
 * bare `let` (the `architecture-boundaries.test.ts` boundary test bans
 * module-scope `let` outright; the deferred-assignment semantics
 * `GameSessionController.init()`'s `setNotifier` callback relies on are
 * unchanged, only the container shape is). `getNotifier`/`setNotifier`
 * still cross the file boundary exactly as before -- `main.ts` owns the box,
 * this file only ever reads/writes it through the accessor pair.
 */
import type { RenderLoop } from '@/renderer/render-loop';
import type { AudioSystem } from '@/audio/audio-system';
import type { EventBus } from '@/core/event-bus';
import type { AdvisorSystem } from '@/ui/advisor-system';
import type { RoundPresentationGate } from '@/presentation/round-presentation-gate';
import type { GameSession, Notifier, SelectionStore } from '@/app/ports';
import type { UserSettingsStore } from '@/app/user-settings-store';
import type { NotificationEntry } from '@/core/notification-log';
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
import { registerAllPresentation, type PresentationContext } from '@/presentation/register-all';
import { registerMinorCivNotificationListeners } from '@/ui/minor-civ-notification-listeners';
import { createPanelHost, type PanelHost } from '@/app/panel-host';
import { createPanelRouter, type PanelRouter } from '@/app/panel-router';
import type { PanelContext, PanelRegistry } from '@/app/panel-registry';
import {
  getCurrentCiv,
  getCurrentCivDef,
  clearUnloadState,
  prefersReducedMotion,
  scanBeastSightings,
  scanSubmarineSightings,
  focusNotificationTarget,
  focusPirateTarget,
  applyPirateActionResult,
  notifyPlayer,
} from '@/app/cross-cutting-helpers';
import { applyHoardChoice, getHoardChoicePreview } from '@/systems/beast-system';
import { createBeastHoardPanel } from '@/ui/beast-hoard-panel';
import { resolveGeneralDefinition, type GeneralDefinition } from '@/systems/great-general-definitions';
import { getPendingGeneralChoiceForViewer, spawnGeneralForCiv } from '@/systems/great-general-system';
import { createGeneralCandidatePanel } from '@/ui/general-candidate-panel';

export interface AppServices {
  readonly bus: EventBus;
  readonly presentationContext: PresentationContext;
  readonly getState: () => import('@/core/types').GameState;
  readonly appendToCivLog: NotificationSink;
  readonly gameSession: Pick<GameSessionController, 'init'>;
}

type NotificationSink = (...args: Parameters<Notifier['deliver']>) => void;

export async function bootstrap(services: AppServices): Promise<void> {
  registerAllPresentation(services.bus, services.presentationContext);
  registerMinorCivNotificationListeners(services.bus, services.getState, {
    appendToCivLog: services.appendToCivLog,
  });
  await services.gameSession.init();
}

export interface AppCompositionDeps {
  readonly canvas: HTMLCanvasElement;
  readonly uiLayer: HTMLDivElement;
  readonly renderLoop: RenderLoop;
  readonly audio: AudioSystem;
  readonly bus: EventBus;
  readonly roundPresentationGate: RoundPresentationGate;
  readonly advisorSystem: AdvisorSystem;
  readonly session: GameSession;
  readonly selection: SelectionStore;
  readonly userSettingsStore: UserSettingsStore;
  readonly getNotifier: () => Notifier;
  readonly setNotifier: (notifier: Notifier) => void;
}

export interface AppComposition {
  readonly selectionController: SelectionController;
  readonly playerActions: PlayerActionController;
  readonly turnFlow: TurnFlowController;
  readonly hud: HudController;
  readonly gameSession: GameSessionController;
  readonly presentationContext: PresentationContext;
}

export function createAppComposition(deps: AppCompositionDeps): AppComposition {
  const {
    canvas, uiLayer, renderLoop, audio, bus, roundPresentationGate, advisorSystem,
    session, selection, userSettingsStore, getNotifier, setNotifier,
  } = deps;

  // Thin wrapper (not extracted, see cross-cutting-helpers.ts's module docblock
  // for why): delegates to the pure `notifyPlayer`, but stays a sibling
  // function here so its many controller consumers' `showNotification` dep
  // keeps working as a bare reference (#787 phase 11 -- moved from `main.ts`,
  // which owned it only because it needed the `notifier` closure; resolved
  // via `getNotifier()` here like every other notifier-dependent callback in
  // this file).
  function showNotification(
    message: string,
    type: NotificationEntry['type'] = 'info',
    target?: NotificationEntry['target'],
  ): void {
    notifyPlayer(getNotifier(), session, message, type, target);
  }

  /**
   * `executeAttack`'s post-kill beast-hoard hook (#787 phase 11 -- moved
   * from `main.ts`, which owned it only because it predated the composition
   * split, not because it needed to live outside this file). References
   * `hud`, a `const` declared later in this function -- safe because this
   * function is never invoked until real gameplay, well after
   * `createAppComposition` returns, the same deferred-but-eager pattern
   * every other forward reference in this file already uses.
   */
  function maybeShowPendingHoardChoice(): void {
    const pending = (session.getState().beasts?.pendingHoardChoices ?? [])
      .find(p => p.civId === session.getState().currentPlayer);
    if (!pending) return;
    const preview = getHoardChoicePreview(session.getState(), pending.lairId);
    const lair = session.getState().beasts!.lairs[pending.lairId];
    createBeastHoardPanel(uiLayer, preview, choice => {
      // #787 phase 14: audited -- setStateWithoutRefresh here is correct, not
      // a bug. hex-renderer.ts's lair glyph treats 'slain' and 'claimed'
      // identically (both draw 🏆), so the 'trophy' choice has no canvas
      // effect; the 'gold'/'lore' choices' effects (civ.gold, tech name/rate)
      // are already covered by the explicit hud.update() below. No renderer-
      // or HUD-visible field goes stale here.
      session.setStateWithoutRefresh(applyHoardChoice(session.getState(), pending.lairId, pending.civId, choice));
      bus.emit('beast:hoard-claimed', { lairId: pending.lairId, beastId: lair.beastId, civId: pending.civId, choice });
      hud.update();
      maybeShowPendingHoardChoice();
    });
  }

  /**
   * #544 MR3: mirrors maybeShowPendingHoardChoice's shape exactly -- see that
   * function's docblock for why this lives here rather than in a dedicated
   * controller. spawnGeneralForCiv's own state update also needs a hud.update()
   * (the new General's XP/history bookkeeping doesn't affect any HUD-visible
   * field today, but session.commit already triggers a full refresh via the
   * normal render path, so no explicit hud.update() call is needed here the
   * way the hoard-choice panel needs one for its gold/tech-name side effects).
   */
  function maybeShowPendingGeneralChoice(): void {
    const pending = getPendingGeneralChoiceForViewer(session.getState(), session.getState().currentPlayer);
    if (!pending) return;
    const candidates = pending.candidateDefinitionIds
      .map(id => resolveGeneralDefinition(session.getState(), id))
      .filter((g): g is GeneralDefinition => g !== undefined);
    if (candidates.length === 0) return;
    createGeneralCandidatePanel(uiLayer, candidates, generalDefinitionId => {
      session.commit(spawnGeneralForCiv(session.getState(), pending.civId, generalDefinitionId));
      maybeShowPendingGeneralChoice();
    });
  }

  /**
   * Owns the panel DOM layer and the interaction-blocking overlay flag,
   * replacing `createUiInteractionState()` (#787 phase 5).
   */
  const host: PanelHost = createPanelHost(uiLayer);

  /**
   * `router` and `panelContext` are circular by construction (a panel's
   * `open(ctx)` reads `ctx.router` to potentially chain-open another panel),
   * so `panelContext` is built first with `notifier`/`router` behind getters
   * that resolve to the live bindings once they exist -- the same
   * deferred-but-eager pattern `notifier` itself already uses in `main.ts`.
   */
  let router: PanelRouter;
  const panelContext: PanelContext = {
    session,
    get notifier() { return getNotifier(); },
    host,
    selection,
    get router() { return router; },
  };

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
   * Owns the diplomacy, minor-civ, and crisis-interaction handlers (#787 phase
   * 10b-a). `hud` and `selectionController` are wrapped in thin lazily-evaluating
   * objects, not passed directly -- both are `const`s not assigned until later
   * in this function (`selectionController` right below this, `hud` further
   * down), so a direct reference here would capture `undefined` at construction
   * time. Same deferred-but-eager closure pattern `selectionController` itself
   * already uses for `updateHUD: () => hud.update()` below. `openDiplomacyPanel`
   * is `PanelActionsController`'s own function (phase 10b-c), but `panelActions`
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
   * at this point). `diplomacyActions` needs no such wrapper here since it is
   * constructed just above. `router` DOES need the wrapper -- it is a `let`
   * not assigned until `createPanelRouter(...)` further down (after
   * `panelRegistry`, which itself needs this controller's methods) -- same
   * pattern `turnFlow`'s own `router` dep below already uses. `executeUpgrade`
   * is a lazy wrapper around `playerActions.executeUpgrade` (#787 phase 13),
   * since `playerActions` isn't constructed until later in this function --
   * same deferred-but-eager reason as `router` just above.
   * `focusNotificationTarget`/`focusPirateTarget`/`applyPirateActionResult`/
   * `currentCiv`/`currentCivDef` are inline arrows calling the pure functions
   * in `src/app/cross-cutting-helpers.ts` (#787 phase 10b-f) --
   * `getNotifier()` inside those arrows resolves through `main.ts`'s
   * `notifier` box, not assigned until `init()`, same deferred-but-eager
   * pattern as `router` just below.
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
    focusNotificationTarget: target => focusNotificationTarget(renderLoop, getNotifier(), session, target),
    focusPirateTarget: target => focusPirateTarget(renderLoop, getNotifier(), target),
    applyPirateActionResult: (result, successMessage) => applyPirateActionResult(
      { session, bus, renderLoop, updateHUD: () => hud.update(), showNotification },
      result,
      successMessage,
    ),
    currentCiv: () => getCurrentCiv(session),
    currentCivDef: () => getCurrentCivDef(session),
    diplomacyActions,
    // Lazy wrapper: `playerActions` (10b-e, extended in phase 13) is
    // constructed after `panelActions`, same deferred-but-eager pattern
    // `router`/`hud`/`selectionController` below already use.
    executeUpgrade: (unitId, targetType) => playerActions.executeUpgrade(unitId, targetType),
    router: { open: panel => router.open(panel) },
    hud: { closeDrawer: () => hud.closeDrawer(), update: () => hud.update() },
    selectionController: {
      selectUnit: (unitId, opts) => selectionController.selectUnit(unitId, opts),
      deselectUnit: () => selectionController.deselectUnit(),
    },
  });

  /**
   * Owns unit selection: `selectUnit`, `deselectUnit`, `selectNextUnit`, and the
   * animated-move / auto-explore / journey lifecycle around a selected unit
   * (#787 phase 8c). `foundCityAction`/`performWorkerAction`/`getUnitTurnFlow`/
   * `restAction`/`ensurePlayerWarState`/`executeUpgrade` are all lazy wrappers
   * around `playerActions` (phase 10b-e, extended in phase 13), constructed
   * after this controller further down.
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
    foundCityAction: () => playerActions.foundCityAction(),
    performWorkerAction: action => playerActions.performWorkerAction(action),
    performPreach: (unitId, cityId) => playerActions.performPreach(unitId, cityId),
    restAction: () => playerActions.restAction(),
    openNetworkIntentPanel: panelActions.openNetworkIntentPanel,
    openUnitStackPicker: panelActions.openUnitStackPicker,
    openPirateHeadquartersAssault: panelActions.openPirateHeadquartersAssault,
    handleEstablishRoute: diplomacyActions.handleEstablishRoute,
    executeUpgrade: (unitId, targetType) => playerActions.executeUpgrade(unitId, targetType),
    ensurePlayerWarState: targetCivId => playerActions.ensurePlayerWarState(targetCivId),
    scanBeastSightings: () => scanBeastSightings(session, bus),
    scanSubmarineSightings: () => scanSubmarineSightings(session, bus),
    currentCiv: () => getCurrentCiv(session),
    advisorSystem,
  });

  /**
   * Owns turn advancement: `endTurn`, the hot-seat handoff lifecycle, AI-move
   * replay, difficulty application at handoff, and "entering a viewer's turn"
   * (#787 phase 9). `router`/`notifier` are wrapped in thin lazily-evaluating
   * objects, not passed directly -- `router` is a `let` not assigned until
   * `createPanelRouter(...)` below, and `getNotifier()` resolves through
   * `main.ts`'s `notifier` box, not assigned until `init()` runs. Same
   * deferred-but-eager pattern as `presentationContext`'s
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
      withHappenedTurn: (turn, fn) => getNotifier().withHappenedTurn(turn, fn),
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
    scanSubmarineSightings: () => scanSubmarineSightings(session, bus),
    maybeShowPendingHoardChoice,
    maybeShowPendingGeneralChoice,
    checkAdvisors: () => advisorSystem.check(session.getState()),
    // `campaignEntry` is declared after `turnFlow` (it needs `turnFlow` itself
    // as a dep) -- same deferred-but-eager forward reference `router`/`notifier`
    // already use elsewhere in this function; safe because this closure is not
    // invoked until real gameplay.
    showGameModeSelection: () => campaignEntry.showGameModeSelection(),
    reloadPage: () => window.location.reload(),
    openCityPanelForCity: panelActions.openCityPanelForCity,
  });

  /**
   * Owns the player-unit-action functions `getUnitTurnFlow`, `performWorkerAction`,
   * `performPreach`, `ensurePlayerWarState`, `restAction`,
   * `showEspionageCaptureChoice` (#787 phase 10b-e), and `executeAttack`,
   * `foundCityAction`, `executeUpgrade`, `beginPlayerCityAssault`,
   * `executeMinorCivConquest` (#787 phase 13 -- see this controller's own
   * module docblock for the plan-staleness deviations). Constructed after
   * both `selectionController` and `turnFlow` so it can take direct
   * references to both -- see the lazy wrappers those two use above for the
   * reverse direction of this same three-way forward reference.
   * `advisorSystem` is passed directly (a real, already-constructed object,
   * not a lazy binding). `maybeShowPendingHoardChoice` is now a sibling
   * function in this same file (#787 phase 11), passed bare like every
   * other hoisted-function dep. `getNotifier()` still resolves through
   * `main.ts`'s `notifier` box, not assigned until `init()` runs.
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
    notifier: { choice: (message, actions) => getNotifier().choice(message, actions) },
    advisorSystem,
    maybeShowPendingHoardChoice,
  });

  /**
   * Owns the two map-input entry points, `handleHexTap` and
   * `handleHexLongPress` (#787 phase 8d). `executeAttack`/
   * `executeMinorCivConquest`/`beginPlayerCityAssault` are now
   * `playerActions` methods (#787 phase 13) rather than `main.ts`-local
   * hoisted functions; `mapInteraction` is constructed after `playerActions`
   * so direct references work with no wrapper needed -- same as
   * `openCityPanelForCity` (a `panelActions` method, 10b-d) already does.
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
    executeAttack: playerActions.executeAttack,
    executeMinorCivConquest: playerActions.executeMinorCivConquest,
    beginPlayerCityAssault: playerActions.beginPlayerCityAssault,
    beginPlayerCampAssault: playerActions.beginPlayerCampAssault,
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

  // The two refreshes `session.commit()` performs on every state publication.
  // Registered once, here, rather than repeated as a three-statement discipline
  // at each write site. Renderer first, matching the order the manual pairs used.
  // Moved here from module scope alongside `hud`'s own construction (#787
  // phase 10b-g) -- `hud` didn't exist yet at `main.ts`'s old subscribe site.
  session.subscribe(next => renderLoop.setGameState(next));
  session.subscribe(() => hud.update());

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
    foundCityAction: playerActions.foundCityAction,
    maybeShowPendingHoardChoice,
    maybeShowPendingGeneralChoice,
    setNotifier,
    focusNotificationTarget: target => focusNotificationTarget(renderLoop, getNotifier(), session, target),
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
    get notifier() { return getNotifier(); },
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
    'strategic-arsenal': { domId: 'strategic-arsenal-panel', group: 'transient', open: () => panelActions.openStrategicArsenalPanel() },
  } satisfies PanelRegistry;

  router = createPanelRouter({ host, registry: panelRegistry, context: panelContext });

  return { selectionController, playerActions, turnFlow, hud, gameSession, presentationContext };
}
