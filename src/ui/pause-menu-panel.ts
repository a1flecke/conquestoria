import { createSavePanel } from '@/ui/save-panel';
import { createGameButton } from '@/ui/ui-kit';

export interface PauseMenuCallbacks {
  turn: number;
  civName: string;
  onResume: () => void;
  onSave: (slotId: string, name: string) => Promise<void>;
  onNewGame: () => void;
  autoSave: () => Promise<void>;
}

function buildHeader(turn: number, civName: string): HTMLElement {
  const header = document.createElement('div');
  Object.assign(header.style, {
    borderBottom: '1px solid rgba(255,255,255,0.15)',
    paddingBottom: '12px',
    marginBottom: '16px',
  });

  const title = document.createElement('h2');
  title.textContent = '⏸ Paused';
  Object.assign(title.style, { margin: '0 0 4px', fontSize: '18px', color: '#e8c170' });
  header.appendChild(title);

  const subtitle = document.createElement('p');
  subtitle.textContent = `Turn ${turn} · ${civName}`;
  Object.assign(subtitle.style, { margin: '0', fontSize: '13px', opacity: '0.7' });
  header.appendChild(subtitle);

  return header;
}

function buildMainView(
  panel: HTMLElement,
  body: HTMLElement,
  container: HTMLElement,
  callbacks: PauseMenuCallbacks,
): void {
  body.textContent = '';

  const resumeBtn = createGameButton('Return to Game', 'secondary');
  resumeBtn.style.width = '100%';
  resumeBtn.style.marginBottom = '8px';
  resumeBtn.addEventListener('click', () => {
    panel.remove();
    callbacks.onResume();
  });
  body.appendChild(resumeBtn);

  const saveBtn = createGameButton('Save Game', 'secondary');
  saveBtn.style.width = '100%';
  saveBtn.style.marginBottom = '8px';
  saveBtn.addEventListener('click', () => {
    void createSavePanel(container, {
      onNewGame: () => {},
      onContinue: () => {},
      onLoadSlot: () => {},
      onSaveToSlot: async (slotId, name) => {
        await callbacks.onSave(slotId, name);
        document.getElementById('save-panel')?.remove();
      },
    }, 'save');
  });
  body.appendChild(saveBtn);

  const newGameBtn = createGameButton('New Game…', 'secondary');
  newGameBtn.style.width = '100%';
  newGameBtn.addEventListener('click', () => buildConfirmView(panel, body, container, callbacks));
  body.appendChild(newGameBtn);
}

function buildConfirmView(
  panel: HTMLElement,
  body: HTMLElement,
  container: HTMLElement,
  callbacks: PauseMenuCallbacks,
): void {
  body.textContent = '';

  const question = document.createElement('p');
  question.textContent = 'Start a new game?';
  Object.assign(question.style, { margin: '0 0 6px', fontWeight: 'bold', fontSize: '15px' });
  body.appendChild(question);

  const detail = document.createElement('p');
  detail.textContent = `You have unsaved progress on turn ${callbacks.turn}. Save before leaving?`;
  Object.assign(detail.style, { margin: '0 0 16px', fontSize: '13px', opacity: '0.75' });
  body.appendChild(detail);

  const saveAndStart = createGameButton('Save & Start New Game', 'primary');
  saveAndStart.style.width = '100%';
  saveAndStart.style.marginBottom = '8px';
  saveAndStart.addEventListener('click', async () => {
    saveAndStart.disabled = true;
    await callbacks.autoSave();
    panel.remove();
    callbacks.onNewGame();
  });
  body.appendChild(saveAndStart);

  const discardAndStart = createGameButton('Discard & Start New Game', 'danger');
  discardAndStart.style.width = '100%';
  discardAndStart.style.marginBottom = '8px';
  discardAndStart.addEventListener('click', () => {
    panel.remove();
    callbacks.onNewGame();
  });
  body.appendChild(discardAndStart);

  const cancelBtn = createGameButton('Cancel', 'ghost');
  cancelBtn.style.width = '100%';
  cancelBtn.addEventListener('click', () => buildMainView(panel, body, container, callbacks));
  body.appendChild(cancelBtn);
}

export function showPauseMenu(container: HTMLElement, callbacks: PauseMenuCallbacks): HTMLElement {
  document.getElementById('pause-menu')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'pause-menu';
  Object.assign(overlay.style, {
    position: 'absolute',
    inset: '0',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: '55',
    background: 'rgba(0,0,0,0.5)',
  });

  const panel = document.createElement('div');
  Object.assign(panel.style, {
    background: 'rgba(18,18,30,0.97)',
    border: '1px solid rgba(255,255,255,0.2)',
    borderRadius: '12px',
    padding: '20px',
    width: '280px',
    color: '#f4f1e8',
  });

  panel.appendChild(buildHeader(callbacks.turn, callbacks.civName));

  const body = document.createElement('div');
  panel.appendChild(body);
  overlay.appendChild(panel);
  container.appendChild(overlay);

  buildMainView(overlay, body, container, callbacks);

  return overlay;
}
