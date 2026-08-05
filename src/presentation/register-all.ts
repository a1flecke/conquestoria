/**
 * Composes every domain presentation registrar into one install/dispose pair
 * (#787 phase 7). Replaces 72 module-scope `bus.on(...)` registrations in
 * `main.ts` that ran once at import and could never unregister -- a latent
 * leak across a "new game from the pause menu" transition, since nothing
 * ever called the old handlers' individual unsubscribers.
 *
 * Populated incrementally, one registrar per commit; `registerAllPresentation`
 * itself is added once every domain registrar above it exists.
 */
import type { EventBus } from '@/core/event-bus';
import type { CombatResult } from '@/core/types';
import type { GameSession, Notifier, SelectionStore } from '@/app/ports';
import type { PanelRouter } from '@/app/panel-router';
import type { CeremonyCoordinator } from '@/app/controllers/ceremony-coordinator';

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
}

/** Returns a disposer that removes every subscription the registrar added. */
export type PresentationRegistrar = (bus: EventBus, ctx: PresentationContext) => () => void;
