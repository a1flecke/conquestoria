import { EventBus } from '@/core/event-bus';
import { RenderLoop } from '@/renderer/render-loop';
import { loadSettings } from '@/storage/save-manager';
import { AudioSystem } from '@/audio/audio-system';
import { AdvisorSystem } from '@/ui/advisor-system';
import { createSelectionStore } from '@/app/selection-store';
import type { GameState } from '@/core/types';
import { createUserSettingsStore } from '@/app/user-settings-store';
import type { Notifier } from '@/app/ports';
import { bootstrap, createAppComposition, type AppComposition } from '@/app/bootstrap';
import { RoundPresentationGate } from '@/presentation/round-presentation-gate';
import type { GameSession } from '@/app/ports';
import { createGameSession } from '@/app/game-session';

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
 * 10b-g, since `GameSessionController` now lives in `bootstrap.ts`).
 *
 * A `{ current }` box, not a bare `let` (#787 phase 11): the
 * `architecture-boundaries.test.ts` boundary test bans module-scope `let`
 * outright, but the deferred-assignment semantics below are unchanged --
 * `getNotifier`/`setNotifier` still cross the `main.ts`/`bootstrap.ts`
 * boundary exactly as before, just reading/writing a field instead of a
 * bare binding. The non-null assertion in `getNotifier` reproduces the same
 * "trust it's assigned by call time" contract the old `let notifier: Notifier`
 * (implicitly `undefined` pre-assignment) already had -- nothing in
 * `bootstrap.ts` calls `getNotifier()` until real gameplay, well after
 * `init()` completes.
 */
const notifierBox: { current: Notifier | undefined } = { current: undefined };

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
 * Constructs every controller `main.ts` used to build at module scope --
 * `host`, `ceremonies`, `diplomacyActions`, `panelActions`,
 * `selectionController`, `turnFlow`, `playerActions`, `mapInteraction`,
 * `hud`, `campaignEntry`, `gameSession`, `presentationContext`,
 * `panelRegistry`, `router`, and (#787 phase 11) `showNotification`/
 * `maybeShowPendingHoardChoice` themselves -- both were the last two
 * `main.ts`-local functions, and neither needed to live outside
 * `bootstrap.ts`; they only did because they predated the composition split.
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
  getNotifier: () => notifierBox.current!,
  setNotifier: n => { notifierBox.current = n; },
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
  // Thunked, not `notifierBox.current!.deliver` directly -- the box isn't
  // populated until init() runs, after this module-scope call (#787 phase
  // 10b-f, formerly the separate `appendToCivLog` const, inlined at its one
  // consumer; box-wrapped in #787 phase 11).
  appendToCivLog: (...args) => notifierBox.current!.deliver(...args),
  gameSession: composition.gameSession,
});
