/**
 * Replaces `main.ts`'s module-scope `window.addEventListener('keydown', ...)`
 * (#787 phase 5). Two branches, unchanged from the original listener:
 *
 * - Escape cancels an armed journey and toasts, but only when a journey is
 *   actually pending -- it must not swallow Escape for any other purpose.
 * - Backtick toggles the pacing-debug panel. `main.ts` used to track this
 *   with its own `pacingDebugOpen` module-scope `let`; `PanelRouter.toggle`
 *   makes that redundant since `isOpen` is DOM-derived.
 *
 * Uses `notifier.toast` rather than `main.ts`'s `showNotification` wrapper,
 * so the "Journey cancelled." toast is not appended to the persistent
 * notification log the way it is today -- `Notifier` (the port this phase
 * has to depend on) only exposes the pure toast, not the log-writing
 * wrapper. Deliberate, documented deviation: this is transient feedback for
 * the acting player's own keypress, not a game-consequence event, so losing
 * its log entry does not affect replayable game history.
 */
import type { Notifier, SelectionStore } from '@/app/ports';
import type { PanelRouter } from '@/app/panel-router';

export interface GlobalShortcutsDeps {
  readonly target: EventTarget;
  readonly selection: SelectionStore;
  readonly router: PanelRouter;
  readonly notifier: Notifier;
}

export function installGlobalShortcuts(deps: GlobalShortcutsDeps): () => void {
  const { target, selection, router, notifier } = deps;

  const handler = (event: Event): void => {
    const keyboardEvent = event as KeyboardEvent;
    if (keyboardEvent.key === 'Escape' && selection.getPendingIntent().kind === 'journey') {
      selection.setPendingIntent({ kind: 'none' });
      notifier.toast('Journey cancelled.', 'info');
      return;
    }
    if (keyboardEvent.key !== '`') {
      return;
    }
    router.toggle('pacing-debug');
  };

  target.addEventListener('keydown', handler);
  return () => target.removeEventListener('keydown', handler);
}
