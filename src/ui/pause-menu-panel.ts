import { createSavePanel } from '@/ui/save-panel';
import { createGameButton } from '@/ui/ui-kit';
import type { OpponentChallenge } from '@/core/types';
import {
  OPPONENT_CHALLENGE_COPY,
  createOpponentChallengeSelector,
} from '@/ui/opponent-challenge-selector';

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
  opponentChallenge: OpponentChallenge;
  pendingOpponentChallenge?: OpponentChallenge;
  onOpponentChallengeChange: (challenge: OpponentChallenge) => void;
}

interface PauseMenuViewState {
  announcement?: string;
  focusChallenge?: OpponentChallenge;
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

function buildOpponentChallengeSettings(
  callbacks: PauseMenuCallbacks,
  announcement: string,
  onSelect: (challenge: OpponentChallenge) => void,
): HTMLElement {
  const section = document.createElement('section');
  section.dataset.opponentChallengeSettings = '';
  section.style.cssText = [
    'border-top:1px solid rgba(255,255,255,0.1)',
    'padding-top:12px',
    'margin-top:12px',
  ].join(';');

  const heading = document.createElement('p');
  heading.textContent = 'Opponent Challenge';
  heading.style.cssText = [
    'margin:0 0 8px',
    'font-size:11px',
    'text-transform:uppercase',
    'letter-spacing:0.08em',
    'opacity:0.65',
  ].join(';');
  section.appendChild(heading);

  const active = document.createElement('p');
  active.dataset.challengeActive = callbacks.opponentChallenge;
  active.textContent = `${OPPONENT_CHALLENGE_COPY[callbacks.opponentChallenge].label} active`;
  active.style.cssText = 'margin:0 0 4px;font-size:13px;font-weight:700;color:#e8c170;';
  section.appendChild(active);

  if (callbacks.pendingOpponentChallenge) {
    const pending = document.createElement('p');
    pending.dataset.challengePending = callbacks.pendingOpponentChallenge;
    pending.textContent = `${OPPONENT_CHALLENGE_COPY[callbacks.pendingOpponentChallenge].label} next round`;
    pending.style.cssText = 'margin:0 0 10px;font-size:12px;color:rgba(244,241,232,0.78);';
    section.appendChild(pending);
  }

  section.appendChild(createOpponentChallengeSelector({
    selected: callbacks.pendingOpponentChallenge ?? callbacks.opponentChallenge,
    mode: 'settings',
    onSelect,
  }));

  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.textContent = announcement;
  status.style.cssText = 'min-height:1.3em;margin:8px 0 0;font-size:12px;color:#d9c58b;';
  section.appendChild(status);
  return section;
}

interface PauseMenuMainViewOptions {
  announcement: string;
  onOpponentChallengeSelect: (challenge: OpponentChallenge) => void;
}

function buildMainView(
  panel: HTMLElement,
  body: HTMLElement,
  container: HTMLElement,
  callbacks: PauseMenuCallbacks,
  options: PauseMenuMainViewOptions,
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
      onLoadEntry: () => {},
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
  newGameBtn.addEventListener('click', () => buildConfirmView(panel, body, container, callbacks, options));
  body.appendChild(newGameBtn);

  body.appendChild(buildOpponentChallengeSettings(
    callbacks,
    options.announcement,
    options.onOpponentChallengeSelect,
  ));

  // Spec 3: per-channel audio settings at bottom of pause menu
  body.appendChild(buildAudioSettings(callbacks));
}

function buildConfirmView(
  panel: HTMLElement,
  body: HTMLElement,
  container: HTMLElement,
  callbacks: PauseMenuCallbacks,
  options: PauseMenuMainViewOptions,
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
  cancelBtn.addEventListener('click', () => buildMainView(panel, body, container, callbacks, options));
  body.appendChild(cancelBtn);
}

function renderPauseMenu(
  container: HTMLElement,
  callbacks: PauseMenuCallbacks,
  viewState: PauseMenuViewState,
): HTMLElement {
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
    width: 'min(760px, calc(100vw - 32px))',
    maxHeight: 'min(90dvh, 760px)',
    overflowY: 'auto',
    color: '#f4f1e8',
  });

  panel.appendChild(buildHeader(callbacks.turn, callbacks.civName));

  const body = document.createElement('div');
  panel.appendChild(body);
  overlay.appendChild(panel);
  container.appendChild(overlay);

  buildMainView(overlay, body, container, callbacks, {
    announcement: viewState.announcement ?? '',
    onOpponentChallengeSelect: challenge => {
      callbacks.onOpponentChallengeChange(challenge);
      const pendingOpponentChallenge = challenge === callbacks.opponentChallenge
        ? undefined
        : challenge;
      renderPauseMenu(
        container,
        { ...callbacks, pendingOpponentChallenge },
        {
          announcement: pendingOpponentChallenge
            ? `${OPPONENT_CHALLENGE_COPY[challenge].label} will apply next round`
            : `${OPPONENT_CHALLENGE_COPY[challenge].label} remains active`,
          focusChallenge: challenge,
        },
      );
    },
  });

  if (viewState.focusChallenge) {
    overlay.querySelector<HTMLButtonElement>(
      `[data-challenge="${viewState.focusChallenge}"]`,
    )?.focus();
  }

  return overlay;
}

export function showPauseMenu(
  container: HTMLElement,
  callbacks: PauseMenuCallbacks,
): HTMLElement {
  return renderPauseMenu(container, callbacks, {});
}
