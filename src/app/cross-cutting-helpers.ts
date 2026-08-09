/**
 * Pure, explicit-parameter versions of the cross-cutting helpers that used to
 * live as `main.ts`-local `function`/`const` declarations (#787 phase 10b-f).
 *
 * These 8 (of the 12 helpers the plan doc's inventory names) were the ones
 * where extracting the real logic into an importable, testable module was a
 * clean win: each is either a one-line pure read (`getCurrentCiv`,
 * `getCurrentCivDef`, `clearUnloadState`, `prefersReducedMotion`) or a
 * function whose every dependency (`session`, `bus`, `renderLoop`,
 * `notifier`) is already explicit and passable as a plain argument
 * (`scanBeastSightings`, `focusNotificationTarget`, `focusPirateTarget`,
 * `notifyPlayer`, `applyPirateActionResult`).
 *
 * `main.ts` still owns *wiring* these into each controller's construction --
 * every controller's own `Deps` interface is intentionally untouched by this
 * phase (e.g. `focusNotificationTarget: (target) => void` stays exactly that
 * shape on `PanelActionsController`/`GameSessionController`). `main.ts` just
 * rewires the *value* it passes for that dep from a bare hoisted-function
 * reference to an inline arrow calling the pure function here, e.g.
 * `focusNotificationTarget: target => focusNotificationTarget(renderLoop,
 * notifier, session, target)`. This keeps the phase's blast radius to
 * `main.ts` + this one new file, instead of also touching every one of
 * 10b-a-10b-e's already-shipped controller files.
 *
 * Three of the twelve inventoried helpers are deliberately NOT here, with
 * reasons recorded at their remaining `main.ts` call site instead of ported
 * reflexively:
 * - `setBlockingOverlay` stays a 3-line `main.ts` wrapper around
 *   `host.setBlockingOverlay` -- it is already minimal, and extracting it
 *   would only trade a thin function for a `host` dep newly threaded into
 *   two controllers, for no net simplification.
 * - `showNotification` stays a thin `main.ts` wrapper delegating to
 *   `notifyPlayer` below -- its own consumer list is large (every controller
 *   plus most remaining `main.ts`-local functions), so keeping one hoisted
 *   name letting every consumer's `Deps` interface stay untouched was judged
 *   safer than widening ~8 call sites to take `notifier` directly for a
 *   function whose logic is otherwise already fully extracted.
 * - `maybeShowPendingHoardChoice` stays a `main.ts`-local function -- it is
 *   self-recursive (its own `onChoice` callback calls itself) and closes
 *   over `hud.update()`, `uiLayer`, `session`, and `bus` together; splitting
 *   the recursion out into an explicit-callback pure function did not read
 *   as a real simplification for its one meaningful shape.
 * - `appendToCivLog` (a `const`, not a `function`) had exactly one consumer
 *   (the `bootstrap({...})` call) and was inlined directly there instead of
 *   moved here at all.
 */
import type { GameSession, SelectionStore, Notifier } from '@/app/ports';
import type { RenderLoop } from '@/renderer/render-loop';
import type { EventBus } from '@/core/event-bus';
import type { Civilization, CivDefinition } from '@/core/types';
import type { NotificationEntry } from '@/core/notification-log';
import type { PirateFocusTarget } from '@/systems/pirate-presentation';
import type { PirateActionResult } from '@/systems/pirate-actions';
import { resolveCivDefinition } from '@/systems/civ-registry';
import { appendNotification } from '@/core/notification-log';
import { getVisibility } from '@/systems/fog-of-war';
import { formatNotificationTargetFocusMessage } from '@/ui/notification-targets';
import { isBeastConcealedFrom } from '@/systems/beast-system';
import { recordBeastSightings } from '@/systems/beast-presentation';
import { hexKey } from '@/systems/hex-utils';

export function getCurrentCiv(session: GameSession): Civilization {
  return session.getState().civilizations[session.getState().currentPlayer];
}

export function getCurrentCivDef(session: GameSession): CivDefinition | undefined {
  return resolveCivDefinition(session.getState(), getCurrentCiv(session).civType ?? '');
}

/**
 * Deliberately narrower than `selection.setPendingIntent({ kind: 'none' })`:
 * call sites fire on selection and movement changes that must not cancel a
 * pending air mission, journey, or city-capture choice.
 */
export function clearUnloadState(selection: Pick<SelectionStore, 'getPendingIntent' | 'setPendingIntent'>): void {
  if (selection.getPendingIntent().kind === 'unload') {
    selection.setPendingIntent({ kind: 'none' });
  }
}

export function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function scanBeastSightings(session: GameSession, bus: EventBus): void {
  const visTiles = getCurrentCiv(session)?.visibility?.tiles;
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

export function focusNotificationTarget(
  renderLoop: { readonly camera: Pick<RenderLoop['camera'], 'centerOn'> },
  notifier: Pick<Notifier, 'toast'>,
  session: GameSession,
  target: NotificationEntry['target'],
): void {
  if (!target) return;
  renderLoop.camera.centerOn(target.coord);
  const visibility = getCurrentCiv(session).visibility;
  const isCurrentlyVisible = visibility ? getVisibility(visibility, target.coord) === 'visible' : false;
  notifier.toast(formatNotificationTargetFocusMessage(target, isCurrentlyVisible), 'info');
}

export function focusPirateTarget(
  renderLoop: { readonly camera: Pick<RenderLoop['camera'], 'centerOn'> },
  notifier: Pick<Notifier, 'toast'>,
  target: PirateFocusTarget,
): void {
  const coord = target.kind === 'region' ? target.center : target.coord;
  renderLoop.camera.centerOn(coord);
  notifier.toast(target.label, 'info');
}

/** `showNotification`'s extracted body -- see the module docblock for why `showNotification` itself stays a thin `main.ts` wrapper around this. */
export function notifyPlayer(
  notifier: Pick<Notifier, 'toast'>,
  session: GameSession,
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

export interface ApplyPirateActionResultDeps {
  readonly session: GameSession;
  readonly bus: EventBus;
  readonly renderLoop: Pick<RenderLoop, 'setGameState'>;
  readonly updateHUD: () => void;
  readonly showNotification: (message: string, type?: NotificationEntry['type']) => void;
}

export function applyPirateActionResult(
  deps: ApplyPirateActionResultDeps,
  result: PirateActionResult,
  successMessage: string,
): void {
  if (!result.success) {
    deps.showNotification(result.reason ?? 'That pirate action is no longer available.', 'warning');
    return;
  }
  deps.session.setStateWithoutRefresh(result.state);
  for (const event of result.events) {
    if (event.type === 'tribute-paid') {
      deps.bus.emit('pirate:audio-cue', { cue: 'tribute', factionId: event.factionId, viewerIds: [event.civId] });
    } else if (event.type === 'contract-accepted') {
      deps.bus.emit('pirate:audio-cue', { cue: 'contract-accepted', factionId: event.factionId, viewerIds: [event.employerId] });
    }
  }
  deps.renderLoop.setGameState(deps.session.getState());
  deps.updateHUD();
  deps.showNotification(successMessage, 'success');
}
