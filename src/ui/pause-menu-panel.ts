import { createSavePanel } from '@/ui/save-panel';
import { createGameButton } from '@/ui/ui-kit';

export interface AudioSettingsSnapshot {
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  voiceVolume: number;
  stingerVolume: number;
  musicEnabled: boolean;
  soundEnabled: boolean;
  voiceEnabled: boolean;
  stingerEnabled: boolean;
}

export interface PauseMenuCallbacks {
  turn: number;
  civName: string;
  onResume: () => void;
  onSave: (slotId: string, name: string) => Promise<void>;
  onNewGame: () => void;
  autoSave: () => Promise<void>;
  onOpenBestiary: () => void;
  // Spec 3: per-channel audio settings
  audioSettings: AudioSettingsSnapshot;
  onAudioSettingChange: (key: keyof AudioSettingsSnapshot, value: number | boolean) => void;
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

/**
 * Build the 5-channel audio settings section.
 * Uses <input type="range"> and <input type="checkbox"> — no bare <button> elements.
 */
const DEFAULT_AUDIO_SETTINGS: AudioSettingsSnapshot = {
  masterVolume: 1.0, musicVolume: 0.5, sfxVolume: 0.7,
  voiceVolume: 1.0, stingerVolume: 1.0,
  musicEnabled: true, soundEnabled: true, voiceEnabled: true, stingerEnabled: true,
};

function buildAudioSettings(callbacks: PauseMenuCallbacks): HTMLElement {
  const s = callbacks.audioSettings;

  const section = document.createElement('div');
  Object.assign(section.style, {
    borderTop: '1px solid rgba(255,255,255,0.1)',
    paddingTop: '12px',
    marginTop: '12px',
  });

  const heading = document.createElement('p');
  heading.textContent = 'Audio';
  Object.assign(heading.style, {
    margin: '0 0 8px',
    fontSize: '11px',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    opacity: '0.5',
    color: '#fff',
  });
  section.appendChild(heading);

  type AudioRow = {
    label: string;
    volumeKey: keyof AudioSettingsSnapshot & string;
    enabledKey: (keyof AudioSettingsSnapshot & string) | '';
  };

  const rows: AudioRow[] = [
    { label: 'Master',  volumeKey: 'masterVolume',  enabledKey: '' },
    { label: 'Music',   volumeKey: 'musicVolume',   enabledKey: 'musicEnabled' },
    { label: 'SFX',     volumeKey: 'sfxVolume',     enabledKey: 'soundEnabled' },
    { label: 'Voice',   volumeKey: 'voiceVolume',   enabledKey: 'voiceEnabled' },
    { label: 'Stinger', volumeKey: 'stingerVolume', enabledKey: 'stingerEnabled' },
  ];

  for (const row of rows) {
    const rowEl = document.createElement('div');
    Object.assign(rowEl.style, {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      marginBottom: '6px',
    });

    const label = document.createElement('span');
    label.textContent = row.label;
    Object.assign(label.style, {
      fontSize: '13px',
      color: '#ccc',
      width: '52px',
      flexShrink: '0',
    });
    rowEl.appendChild(label);

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = '1';
    slider.step = '0.05';
    slider.value = String(s[row.volumeKey] as number ?? 1);
    Object.assign(slider.style, {
      flex: '1',
      minHeight: '44px',
      cursor: 'pointer',
      accentColor: '#e8c170',
    });
    slider.setAttribute('aria-label', `${row.label} volume`);
    slider.addEventListener('input', () => {
      callbacks.onAudioSettingChange(row.volumeKey, Number(slider.value));
    });
    rowEl.appendChild(slider);

    if (row.enabledKey) {
      const enabledKey = row.enabledKey;
      const toggle = document.createElement('input');
      toggle.type = 'checkbox';
      toggle.checked = Boolean(s[enabledKey] ?? true);
      toggle.setAttribute('aria-label', `${row.label} enabled`);
      Object.assign(toggle.style, {
        width: '20px',
        minHeight: '44px',   // height intentionally omitted — minHeight ensures tap target
        cursor: 'pointer',
        accentColor: '#e8c170',
      });
      toggle.addEventListener('change', () => {
        callbacks.onAudioSettingChange(enabledKey, toggle.checked);
      });
      rowEl.appendChild(toggle);
    }

    section.appendChild(rowEl);
  }

  return section;
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

  const bestiaryBtn = createGameButton('Bestiary', 'secondary');
  bestiaryBtn.style.width = '100%';
  bestiaryBtn.style.marginBottom = '8px';
  bestiaryBtn.addEventListener('click', () => {
    panel.remove();
    callbacks.onOpenBestiary();
  });
  body.appendChild(bestiaryBtn);

  const newGameBtn = createGameButton('New Game…', 'secondary');
  newGameBtn.style.width = '100%';
  newGameBtn.addEventListener('click', () => buildConfirmView(panel, body, container, callbacks));
  body.appendChild(newGameBtn);

  // Spec 3: per-channel audio settings at bottom of pause menu
  body.appendChild(buildAudioSettings(callbacks));
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
