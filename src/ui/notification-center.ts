import type { GameState } from '@/core/types';
import { appendNotification, type NotificationEntry } from '@/core/notification-log';
import { createNotificationDelivery } from '@/ui/notification-delivery';
import type { ChoiceAction, Notifier } from '@/app/ports';

export interface NotificationCenterDeps {
  readonly layer: HTMLElement;
  readonly getState: () => GameState;
  readonly isSuppressed: () => boolean;
  /** REQUIRED. An optional cue callback would silently mute game audio on a wiring mistake. */
  readonly playCue: (cue: string) => void;
  /**
   * REQUIRED. Clicking a toast recenters the camera on its target — the same
   * callback shape `createNotificationLogPanel` already takes as `onFocusTarget`.
   * An optional callback here would silently drop that behavior on a wiring mistake.
   */
  readonly onFocusTarget: (target: NotificationEntry['target']) => void;
}

type QueuedToast = Pick<NotificationEntry, 'message' | 'type' | 'target'> & { sfxCue?: string };

const TOAST_COLORS: Record<NotificationEntry['type'], string> = {
  info: '#e8c170',
  success: '#6b9b4b',
  warning: '#d94a4a',
};

/** Moved verbatim from main.ts's module-scope notification queue (#787 phase 4). */
export function createNotificationCenter(deps: NotificationCenterDeps): Notifier {
  const queue: QueuedToast[] = [];
  let isShowingNotification = false;
  let currentDismissTimer: ReturnType<typeof setTimeout> | null = null;

  function displayNext(): void {
    const next = queue.shift();
    if (!next) {
      isShowingNotification = false;
      return;
    }

    isShowingNotification = true;
    const notif = document.createElement('div');
    notif.style.cssText = `background:${TOAST_COLORS[next.type]}ee;color:#1a1a2e;padding:10px 14px;border-radius:10px;font-size:12px;cursor:pointer;transition:opacity 0.3s;max-width:90%;`;
    notif.textContent = next.message;

    if (queue.length > 0) {
      const badge = document.createElement('span');
      badge.style.cssText = 'margin-left:8px;font-size:10px;opacity:0.7;';
      badge.textContent = `(${queue.length} more)`;
      notif.appendChild(badge);
    }

    const dismiss = (): void => {
      if (currentDismissTimer) clearTimeout(currentDismissTimer);
      currentDismissTimer = null;
      notif.style.opacity = '0';
      setTimeout(() => {
        notif.remove();
        displayNext();
      }, 200);
    };

    notif.addEventListener('click', () => {
      deps.onFocusTarget(next.target);
      dismiss();
    });
    deps.layer.innerHTML = '';
    deps.layer.appendChild(notif);

    currentDismissTimer = setTimeout(() => {
      if (notif.parentNode) dismiss();
    }, 6000);

    deps.playCue(next.sfxCue ?? 'notification');
  }

  function toast(
    message: string,
    type: NotificationEntry['type'] = 'info',
    target?: NotificationEntry['target'],
    sfxCue?: string,
  ): void {
    if (deps.isSuppressed()) return;
    queue.push({ message, type, target, sfxCue });
    if (!isShowingNotification) displayNext();
  }

  const delivery = createNotificationDelivery({
    getState: deps.getState,
    toast,
    isSuppressed: deps.isSuppressed,
  });

  function choice(message: string, actions: readonly ChoiceAction[]): void {
    const existing = document.getElementById('capture-verdict-modal');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'capture-verdict-modal';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:999;';

    const inner = document.createElement('div');
    inner.style.cssText = 'background:#1a1e2e;border-radius:14px;padding:20px;max-width:380px;width:90%;display:flex;flex-direction:column;gap:12px;color:#f5f7fb;';

    const msg = document.createElement('p');
    msg.textContent = message;
    msg.style.cssText = 'margin:0;font-size:13px;line-height:1.5;';
    inner.appendChild(msg);

    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;';

    for (const action of actions) {
      const btn = document.createElement('button');
      btn.textContent = action.label;
      btn.style.cssText = action.danger
        ? 'padding:8px 14px;border-radius:8px;background:rgba(220,60,60,0.25);border:1px solid rgba(220,60,60,0.5);color:#ff9999;font-size:12px;cursor:pointer;'
        : 'padding:8px 14px;border-radius:8px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.2);color:#f5f7fb;font-size:12px;cursor:pointer;';
      btn.addEventListener('click', () => {
        overlay.remove();
        action.onClick();
      });
      btnRow.appendChild(btn);
    }

    inner.appendChild(btnRow);
    overlay.appendChild(inner);
    document.body.appendChild(overlay);
  }

  return {
    toast,
    deliver: delivery.deliver,
    choice,
    withHappenedTurn: delivery.withHappenedTurn,
  };
}
