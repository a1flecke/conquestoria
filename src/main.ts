import { EventBus } from '@/core/event-bus';
import { RenderLoop } from '@/renderer/render-loop';
import { moveUnit, getMovementCost } from '@/systems/unit-system';
import { applyHoardChoice, getHoardChoicePreview, canUnitAttackBeast } from '@/systems/beast-system';
import { createBeastHoardPanel } from '@/ui/beast-hoard-panel';
import { loadSettings } from '@/storage/save-manager';
import { AudioSystem } from '@/audio/audio-system';
import { AdvisorSystem } from '@/ui/advisor-system';
import { makePeace } from '@/systems/diplomacy-system';
import { visitVillage } from '@/systems/village-system';
import { clearStaleSoloPendingEvents } from '@/core/hotseat-events';
import { refreshKnownCivilizations } from '@/systems/discovery-system';
import { getMinorCivNotification } from '@/ui/minor-civ-notifications';
import { registerMinorCivNotificationListeners } from '@/ui/minor-civ-notification-listeners';
import { isSpyUnitType } from '@/systems/espionage-system';
import { isWorkerBusy } from '@/systems/unit-movement-system';
import { createSelectionStore } from '@/app/selection-store';
import type { GameState } from '@/core/types';
import type { NotificationCityAction, NotificationEntry } from '@/core/notification-log';
import { createUserSettingsStore } from '@/app/user-settings-store';
import type { Notifier } from '@/app/ports';
import { reconstructLastSeenFromMap } from '@/systems/last-seen-presentation';
import { bootstrap, createAppComposition, type AppComposition } from '@/app/bootstrap';
import { registerAllPresentation } from '@/presentation/register-all';
import { createMarketplaceState } from '@/systems/trade-system';
import { RoundPresentationGate } from '@/presentation/round-presentation-gate';
import type { GameSession } from '@/app/ports';
import { createGameSession } from '@/app/game-session';
import { installGlobalShortcuts } from '@/app/global-shortcuts';
import { notifyPlayer } from '@/app/cross-cutting-helpers';

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
 * needs, then published back here via `setNotifier` (#787 phase 10),
 * threaded through `createAppComposition`'s `setNotifier` dep (#787 phase
 * 10b-g, since `GameSessionController` now lives in `bootstrap.ts`). Every
 * function below that reads `notifier` is only ever invoked during real
 * gameplay, well after `init()` completes -- the same deferred-but-eager
 * pattern `session` and `selection` already use for their own module-scope
 * bindings.
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

// --- Notifications ---
// The toast queue, the choice modal, and the delivery contract below all live
// in notifier (created in init(), see src/ui/notification-center.ts) (#787
// phase 4). `notifier.toast` is the pure DOM enqueue (no log side effect) --
// exactly today's enqueueToast, which is why the extracted `focusNotificationTarget`/
// `focusPirateTarget` helpers (#787 phase 10b-f, src/app/cross-cutting-helpers.ts)
// call it directly instead of going through `showNotification` below.

// Thin wrapper (not extracted, see cross-cutting-helpers.ts's module docblock
// for why): delegates to the pure `notifyPlayer`, but stays a hoisted
// `main.ts` function so its controller consumers' `showNotification` dep
// keeps working as a bare reference, unchanged by this phase.
function showNotification(
  message: string,
  type: NotificationEntry['type'] = 'info',
  target?: NotificationEntry['target'],
): void {
  notifyPlayer(notifier, session, message, type, target);
}

/**
 * Stays `main.ts`-local (#787 phase 13 left this one behind, see
 * `PlayerActionControllerDeps`'s docblock in `player-action-controller.ts`
 * for why): it is `executeAttack`'s post-kill beast-hoard hook, not "the
 * mutation that runs after a preview/dialog confirm" the way the five
 * functions phase 13 did move are, and it has other, unrelated callers
 * (`turnFlow`, `gameSession`) beyond `playerActions`.
 */
function maybeShowPendingHoardChoice(): void {
  const pending = (session.getState().beasts?.pendingHoardChoices ?? [])
    .find(p => p.civId === session.getState().currentPlayer);
  if (!pending) return;
  const preview = getHoardChoicePreview(session.getState(), pending.lairId);
  const lair = session.getState().beasts!.lairs[pending.lairId];
  createBeastHoardPanel(uiLayer, preview, choice => {
    session.setStateWithoutRefresh(applyHoardChoice(session.getState(), pending.lairId, pending.civId, choice));
    bus.emit('beast:hoard-claimed', { lairId: pending.lairId, beastId: lair.beastId, civId: pending.civId, choice });
    composition.hud.update();
    maybeShowPendingHoardChoice();
  });
}

/**
 * Constructs every controller `main.ts` used to build at module scope --
 * `host`, `ceremonies`, `diplomacyActions`, `panelActions`,
 * `selectionController`, `turnFlow`, `playerActions`, `mapInteraction`,
 * `hud`, `campaignEntry`, `gameSession`, `presentationContext`,
 * `panelRegistry`, and `router` -- moved into `bootstrap.ts` as the
 * composition root (#787 phase 10b-g). `showNotification` and
 * `maybeShowPendingHoardChoice` above are hoisted `function` declarations,
 * so passing them here bare is safe -- they aren't invoked until real
 * gameplay, well after this call returns and `composition` is assigned.
 * `foundCityAction`/`executeUpgrade`/`executeAttack`/`executeMinorCivConquest`/
 * `beginPlayerCityAssault` are no longer threaded through here at all (#787
 * phase 13): they moved into `PlayerActionController` itself, which now
 * imports everything it needs directly instead of receiving it as a dep
 * from this file.
 */
const composition: AppComposition = createAppComposition({
  canvas,
  uiLayer,
  renderLoop,
  audio,
  bus,
  roundPresentationGate,
  advisorSystem,
  session,
  selection,
  userSettingsStore,
  getNotifier: () => notifier,
  setNotifier: n => { notifier = n; },
  maybeShowPendingHoardChoice,
  showNotification,
});

// --- Bootstrap ---
// registerAllPresentation/registerMinorCivNotificationListeners used to run
// as bare module-scope statements here, immediately followed by a bare
// init() call. bootstrap() (#787 phase 10) sequences the same three steps
// explicitly instead of as an import side effect -- see src/app/bootstrap.ts,
// which now also constructs session/selection/host/ceremonies/router/
// panelRegistry via createAppComposition above (#787 phase 10b-g finished
// the composition-root move Phase 10's own docblock had deferred).
void bootstrap({
  bus,
  presentationContext: composition.presentationContext,
  getState: () => session.getState(),
  // Thunked, not `notifier.deliver` directly -- `notifier` is not assigned
  // until init() runs, after this module-scope call (#787 phase 10b-f,
  // formerly the separate `appendToCivLog` const, inlined at its one
  // consumer).
  appendToCivLog: (...args) => notifier.deliver(...args),
  gameSession: composition.gameSession,
});
