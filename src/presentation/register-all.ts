/**
 * Composes every domain presentation registrar into one install/dispose pair
 * (#787 phase 7). Replaces 72 module-scope `bus.on(...)` registrations in
 * `main.ts` that ran once at import and could never unregister -- a latent
 * leak across a "new game from the pause menu" transition, since nothing
 * ever called the old handlers' individual unsubscribers.
 */
import type { EventBus } from '@/core/event-bus';
import type { CombatResult } from '@/core/types';
import type { NotificationEntry } from '@/core/notification-log';
import type { GameSession, Notifier, SelectionStore } from '@/app/ports';
import type { PanelRouter } from '@/app/panel-router';
import type { CeremonyCoordinator } from '@/app/controllers/ceremony-coordinator';
import { registerDiplomacyPresentation } from '@/presentation/register-diplomacy-presentation';
import { registerEraPresentation } from '@/presentation/register-era-presentation';
import { registerTradePresentation } from '@/presentation/register-trade-presentation';
import { registerReligionPresentation } from '@/presentation/register-religion-presentation';
import { registerNetworkPresentation } from '@/presentation/register-network-presentation';
import { registerWonderPresentation } from '@/presentation/register-wonder-presentation';
import { registerCityPresentation } from '@/presentation/register-city-presentation';
import { registerFactionCrisisPresentation } from '@/presentation/register-faction-crisis-presentation';
import { registerEspionagePresentation } from '@/presentation/register-espionage-presentation';
import { registerBeastPresentation } from '@/presentation/register-beast-presentation';
import { registerStampedePresentation } from '@/presentation/register-stampede-presentation';
import { registerRogueElephantHostPresentation } from '@/presentation/register-rogue-elephant-host-presentation';
import { registerRaiderPresentation } from '@/presentation/register-raider-presentation';
import { registerCombatPresentation } from '@/presentation/register-combat-presentation';
import { registerGeneralPresentation } from '@/presentation/register-general-presentation';
import { registerSupplyPresentation } from '@/presentation/register-supply-presentation';

export interface PresentationContext {
  readonly session: GameSession;
  readonly notifier: Notifier;
  readonly router: PanelRouter;
  readonly ceremonies: CeremonyCoordinator;
  readonly selection: SelectionStore;
  /**
   * Narrow renderer-visual callbacks, not a `RenderLoop` import -- only
   * `trade` (delivery) and `combat` (combat) registrars use these; every
   * other registrar ignores them, the same way most registrars already
   * ignore `ceremonies`/`selection`.
   */
  readonly requestDeliveryVisual: (unitId: string) => void;
  readonly applyCombatVisual: (result: CombatResult) => void;
  /**
   * Opens the (multi-step, stateful) espionage capture verdict dialog. Kept
   * as a callback into `main.ts` rather than moved here -- it mutates state
   * directly via `session.setStateWithoutRefresh` and touches `renderLoop`,
   * `bus.emit`, and `showNotification`, none of which belong in a
   * subscription-wiring registrar. A candidate for its own extraction in a
   * later phase, not this one.
   */
  readonly showEspionageCaptureChoice: (spyId: string, spyOwner: string) => void;
  /**
   * The panel DOM layer, for `src/ui/*` ceremony/banner builders that take a
   * container element directly (`showBeastSlayCeremony`,
   * `showBeastSightingBanner`) -- not a concrete service like `RenderLoop`,
   * the same class of dependency `PanelHost.layer` already exposes.
   */
  readonly uiLayer: HTMLElement;
  /**
   * Opens the queued beast-hoard-choice panel for the active viewer, if one
   * is pending. Kept as a callback -- it mutates state via
   * `session.setStateWithoutRefresh`, emits `beast:hoard-claimed`, and calls
   * `updateHUD()`, none of which belong in a subscription-wiring registrar.
   */
  readonly maybeShowPendingHoardChoice: () => void;
  /**
   * Whether `RoundPresentationGate` is currently suppressing presentation
   * (e.g. during a hot-seat handoff replay). A narrow callback rather than
   * the gate instance itself, matching the same DIP boundary as the other
   * concrete-service callbacks above.
   */
  readonly isPresentationSuppressed: () => boolean;
  /**
   * `AdvisorSystem`'s two entry points as narrow callbacks rather than the
   * class instance -- the same DIP boundary as every other concrete-service
   * field above. `checkAdvisors` reads current state internally (via
   * `session`), so it takes no arguments.
   */
  readonly resetAdvisorMessage: (id: string) => void;
  readonly checkAdvisors: () => void;
  /**
   * The active-viewer's-own-input toast+log path (`main.ts`'s `showNotification`,
   * a thin wrapper combining `notifier.toast` with a raw log append for the
   * current player) -- distinct from `notifier.deliver`'s full hot-seat-aware
   * delivery contract. Reserved for feedback about the active player's own
   * action, per `.claude/rules/ui-panels.md`'s Notifications section.
   */
  readonly showNotification: (message: string, type?: NotificationEntry['type'], target?: NotificationEntry['target']) => void;
}

/** Returns a disposer that removes every subscription the registrar added. */
export type PresentationRegistrar = (bus: EventBus, ctx: PresentationContext) => () => void;

const ALL_REGISTRARS: readonly PresentationRegistrar[] = [
  registerDiplomacyPresentation,
  registerEraPresentation,
  registerTradePresentation,
  registerReligionPresentation,
  registerNetworkPresentation,
  registerWonderPresentation,
  registerCityPresentation,
  registerFactionCrisisPresentation,
  registerEspionagePresentation,
  registerBeastPresentation,
  registerStampedePresentation,
  registerRogueElephantHostPresentation,
  registerRaiderPresentation,
  registerCombatPresentation,
  registerGeneralPresentation,
  registerSupplyPresentation,
];

/**
 * Installs all fourteen domain registrars and returns one disposer that
 * removes every subscription all of them added. The guard against
 * double-registration matters concretely: it is what stops AI move replay
 * and the notification log from firing twice if this were ever installed
 * more than once (e.g. a future "new game from the pause menu" transition
 * that doesn't first dispose the previous installation).
 */
export const registerAllPresentation: PresentationRegistrar = (bus, ctx) => {
  const disposers = ALL_REGISTRARS.map(register => register(bus, ctx));
  return () => {
    for (const dispose of disposers) dispose();
  };
};
