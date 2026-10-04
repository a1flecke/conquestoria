// #1244: the one visible trace of the playtest recorder -- a small "Export playtest log" button that
// exists only while `?playtest=1` is on. It reports its own result inline (textContent) instead of
// through the game's notification pipeline, so exporting never shows up in the notification
// metrics the recorder is measuring.
import { createGameButton } from '@/ui/ui-kit';

export type PlaytestExportResult =
  | { status: 'success' }
  | { status: 'cancelled' }
  | { status: 'error'; message: string };

export interface PlaytestExportButtonCallbacks {
  onExport: () => Promise<PlaytestExportResult>;
}

export function createPlaytestExportButton(
  container: HTMLElement,
  callbacks: PlaytestExportButtonCallbacks,
): HTMLElement {
  container.querySelector('[data-role="playtest-export"]')?.remove();

  const wrapper = document.createElement('div');
  wrapper.dataset.role = 'playtest-export';
  wrapper.style.cssText = 'position:absolute;left:8px;bottom:84px;z-index:25;display:flex;flex-direction:column;gap:4px;align-items:flex-start;';

  const button = createGameButton('Export playtest log', 'secondary');
  const status = document.createElement('span');
  status.setAttribute('role', 'status');
  status.style.cssText = 'font-size:12px;color:#f4f1e8;background:rgba(15,15,25,0.85);padding:2px 6px;border-radius:4px;';
  status.hidden = true;

  button.addEventListener('click', () => {
    void callbacks.onExport().then(result => {
      status.hidden = false;
      status.textContent = result.status === 'success'
        ? 'Playtest log saved on this device.'
        : result.status === 'cancelled'
          ? 'Export cancelled.'
          : `Export failed: ${result.message}`;
    });
  });

  wrapper.appendChild(button);
  wrapper.appendChild(status);
  container.appendChild(wrapper);
  return wrapper;
}
