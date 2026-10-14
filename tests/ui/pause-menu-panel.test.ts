// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
const saveMocks = vi.hoisted(() => ({
  listSaves: vi.fn(async () => []),
  hasAutoSave: vi.fn(async () => false),
}));

vi.mock('@/storage/save-manager', () => ({
  listSaves: saveMocks.listSaves,
  listSaveEpics: vi.fn(async () => []),
  hasAutoSave: saveMocks.hasAutoSave,
  deleteSaveEntry: vi.fn(),
}));

import { showPauseMenu, type AudioSettingsSnapshot } from '@/ui/pause-menu-panel';
import { MODAL_ATTR, MODAL_CANCEL_ATTR, MODAL_INITIAL_FOCUS_ATTR } from '@/ui/modal-contract';

const DEFAULT_TEST_AUDIO: AudioSettingsSnapshot = {
  masterVolume: 1.0, musicVolume: 0.5, sfxVolume: 0.7, stingerVolume: 1.0,
  musicEnabled: true, soundEnabled: true, stingerEnabled: true,
};

function makeCallbacks(overrides: Partial<Parameters<typeof showPauseMenu>[1]> = {}): Parameters<typeof showPauseMenu>[1] {
  return {
    turn: 14,
    civName: 'Inca Empire',
    onResume: vi.fn(),
    onSave: vi.fn(async () => {}),
    onNewGame: vi.fn(),
    autoSave: vi.fn(async () => {}),
    onOpenBestiary: vi.fn(),
    opponentChallenge: 'standard',
    pendingOpponentChallenge: undefined,
    onOpponentChallengeChange: vi.fn(),
    personalChallenge: 'standard',
    pendingPersonalChallenge: undefined,
    onPersonalChallengeChange: vi.fn(),
    audioSettings: { ...DEFAULT_TEST_AUDIO },
    onAudioSettingChange: vi.fn(),
    supplyWarningPreference: 'all',
    onChangeSupplyWarningPreference: vi.fn(),
    superweaponsPreference: 'on',
    onChangeSuperweaponsPreference: vi.fn(),
    ...overrides,
  };
}

function clickButton(label: string): void {
  const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent === label) as HTMLButtonElement | undefined;
  if (!btn) throw new Error(`No button found with text "${label}"`);
  btn.click();
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('pause-menu-panel', () => {
  it('always exposes opponent challenge controls after launch', () => {
    showPauseMenu(document.body, makeCallbacks());

    expect(document.querySelector('[data-opponent-challenge-selector]')).not.toBeNull();
  });

  it('shows active and pending challenge without claiming pending is active', () => {
    const panel = showPauseMenu(
      document.body,
      makeCallbacks({
        opponentChallenge: 'standard',
        pendingOpponentChallenge: 'explorer',
      }),
    );

    expect(panel.textContent).toContain('Standard active');
    expect(panel.textContent).toContain('Explorer next round');
    expect(panel.textContent).not.toContain('Explorer active');
  });

  it('rerenders pending challenge immediately, announces it, and restores card focus', () => {
    const onOpponentChallengeChange = vi.fn();
    showPauseMenu(
      document.body,
      makeCallbacks({
        opponentChallenge: 'standard',
        onOpponentChallengeChange,
      }),
    );

    document.querySelector<HTMLButtonElement>('[data-challenge="explorer"]')!.click();

    expect(onOpponentChallengeChange).toHaveBeenCalledWith('explorer');
    expect(document.body.textContent).toContain('Standard active');
    expect(document.body.textContent).toContain('Explorer next round');
    expect(document.querySelector('[role="status"]')?.textContent)
      .toContain('Explorer will apply next round');
    expect(document.activeElement)
      .toBe(document.querySelector('[data-challenge="explorer"]'));
  });

  it('shows the personal difficulty selector scoped to the current player only', () => {
    const panel = showPauseMenu(document.body, makeCallbacks({ personalChallenge: 'standard' }));
    const section = panel.querySelector('[data-personal-challenge-settings]');
    expect(section).not.toBeNull();
    expect(section?.textContent).toContain('Standard active');
    expect(section?.textContent).toContain('Your Personal Difficulty');
  });

  it('rerenders pending personal challenge immediately as "applies next turn", separate from opponent challenge', () => {
    const onPersonalChallengeChange = vi.fn();
    showPauseMenu(
      document.body,
      makeCallbacks({
        personalChallenge: 'standard',
        onPersonalChallengeChange,
      }),
    );

    const personalSection = document.querySelector('[data-personal-challenge-settings]')!;
    personalSection.querySelector<HTMLButtonElement>('[data-challenge="veteran"]')!.click();

    expect(onPersonalChallengeChange).toHaveBeenCalledWith('veteran');
    const updatedPersonalSection = document.querySelector('[data-personal-challenge-settings]')!;
    expect(updatedPersonalSection.textContent).toContain('Standard active');
    expect(updatedPersonalSection.textContent).toContain('Veteran (applies next turn)');
    // Opponent (AI) challenge section must be unaffected by the personal change
    const opponentSection = document.querySelector('[data-opponent-challenge-settings]')!;
    expect(opponentSection.textContent).toContain('Standard active');
    expect(opponentSection.textContent).not.toContain('Veteran active');
    expect(opponentSection.textContent).not.toContain('applies next turn');
  });

  it('renders with correct turn number and civ name in header', () => {
    showPauseMenu(document.body, makeCallbacks());
    expect(document.body.textContent).toContain('Turn 14');
    expect(document.body.textContent).toContain('Inca Empire');
  });

  it('"Return to Game" calls onResume and removes panel', () => {
    const callbacks = makeCallbacks();
    showPauseMenu(document.body, callbacks);
    clickButton('Return to Game');
    expect(callbacks.onResume).toHaveBeenCalledTimes(1);
    expect(document.getElementById('pause-menu')).toBeNull();
  });

  it('"New Game…" swaps to the confirmation sub-view', () => {
    showPauseMenu(document.body, makeCallbacks());
    clickButton('New Game…');
    expect(document.body.textContent).toContain('Save before leaving?');
    expect(document.body.textContent).toContain('Turn 14');
  });

  it('"Save & Start New Game" calls autoSave then onNewGame', async () => {
    const callbacks = makeCallbacks();
    showPauseMenu(document.body, callbacks);
    clickButton('New Game…');
    clickButton('Save & Start New Game');
    await vi.waitFor(() => expect(callbacks.onNewGame).toHaveBeenCalledTimes(1));
    expect(callbacks.autoSave).toHaveBeenCalledTimes(1);
    expect(document.getElementById('pause-menu')).toBeNull();
  });

  it('"Discard & Start New Game" calls onNewGame without autoSave', () => {
    const callbacks = makeCallbacks();
    showPauseMenu(document.body, callbacks);
    clickButton('New Game…');
    clickButton('Discard & Start New Game');
    expect(callbacks.autoSave).not.toHaveBeenCalled();
    expect(callbacks.onNewGame).toHaveBeenCalledTimes(1);
    expect(document.getElementById('pause-menu')).toBeNull();
  });

  it('"Cancel" in sub-view returns to main pause view without calling onNewGame', () => {
    const callbacks = makeCallbacks();
    showPauseMenu(document.body, callbacks);
    clickButton('New Game…');
    clickButton('Cancel');
    expect(callbacks.onNewGame).not.toHaveBeenCalled();
    expect(document.getElementById('pause-menu')).not.toBeNull();
    expect(document.body.textContent).toContain('Return to Game');
    expect(document.body.textContent).not.toContain('Save before leaving?');
  });

  it('"Bestiary" button closes the menu and calls onOpenBestiary', () => {
    const callbacks = makeCallbacks();
    showPauseMenu(document.body, callbacks);
    clickButton('Bestiary');
    expect(callbacks.onOpenBestiary).toHaveBeenCalledOnce();
    expect(document.getElementById('pause-menu')).toBeNull();
  });

  it('replaces stale pause panels when reopened', () => {
    showPauseMenu(document.body, makeCallbacks({ turn: 5, civName: 'Rome' }));
    showPauseMenu(document.body, makeCallbacks({ turn: 8, civName: 'Egypt' }));
    expect(document.querySelectorAll('#pause-menu')).toHaveLength(1);
    expect(document.body.textContent).toContain('Turn 8');
    expect(document.body.textContent).toContain('Egypt');
  });

  it('all buttons have styled background and color (no browser-default chrome)', () => {
    showPauseMenu(document.body, makeCallbacks());
    const buttons = Array.from(document.querySelectorAll('#pause-menu button')) as HTMLButtonElement[];
    expect(buttons.length).toBeGreaterThan(0);
    for (const btn of buttons) {
      expect(btn.style.background, `${btn.textContent} background`).not.toBe('');
      expect(btn.style.color, `${btn.textContent} color`).not.toBe('');
    }
  });

  describe('audio settings section (Spec 3)', () => {
    it('renders 4 range sliders (Master, Music, SFX, Stinger)', () => {
      showPauseMenu(document.body, makeCallbacks());
      const sliders = document.querySelectorAll('input[type="range"]');
      expect(sliders).toHaveLength(4);
    });

    it('renders 3 checkboxes (Music, SFX, Stinger — Master has no toggle)', () => {
      showPauseMenu(document.body, makeCallbacks());
      const checkboxes = document.querySelectorAll('input[type="checkbox"]');
      expect(checkboxes).toHaveLength(3);
    });

    it('sliders are initialised with audioSettings values', () => {
      showPauseMenu(document.body, makeCallbacks({
        audioSettings: { ...DEFAULT_TEST_AUDIO, musicVolume: 0.3 },
      }));
      const sliders = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="range"]'));
      const musicSlider = sliders.find(s => s.getAttribute('aria-label') === 'Music volume');
      expect(musicSlider?.value).toBe('0.3');
    });

    it('moving Music slider calls onAudioSettingChange with musicVolume', () => {
      const callbacks = makeCallbacks();
      showPauseMenu(document.body, callbacks);
      const musicSlider = document.querySelector<HTMLInputElement>('input[aria-label="Music volume"]');
      if (!musicSlider) throw new Error('Music slider not found');
      musicSlider.value = '0.4';
      musicSlider.dispatchEvent(new Event('input'));
      expect(callbacks.onAudioSettingChange).toHaveBeenCalledWith('musicVolume', 0.4);
    });

    it('toggling Music checkbox calls onAudioSettingChange with musicEnabled', () => {
      const callbacks = makeCallbacks();
      showPauseMenu(document.body, callbacks);
      const toggle = document.querySelector<HTMLInputElement>('input[aria-label="Music enabled"]');
      if (!toggle) throw new Error('Music toggle not found');
      toggle.checked = false;
      toggle.dispatchEvent(new Event('change'));
      expect(callbacks.onAudioSettingChange).toHaveBeenCalledWith('musicEnabled', false);
    });

    it('Master slider has no toggle checkbox', () => {
      showPauseMenu(document.body, makeCallbacks());
      const masterSlider = document.querySelector<HTMLInputElement>('input[aria-label="Master volume"]');
      expect(masterSlider).not.toBeNull();
      // Master row has no aria-label="Master enabled" checkbox
      expect(document.querySelector('input[aria-label="Master enabled"]')).toBeNull();
    });

    it('renders no Voice row (voice packs removed)', () => {
      showPauseMenu(document.body, makeCallbacks());
      expect(document.querySelector('input[aria-label="Voice volume"]')).toBeNull();
      expect(document.querySelector('input[aria-label="Voice enabled"]')).toBeNull();
    });
  });

  describe('#544 MR2 — supply warning preference', () => {
    it('renders the All/Critical only/Off control and calls onChangeSupplyWarningPreference on selection', () => {
      const callbacks = makeCallbacks({ supplyWarningPreference: 'all' });
      showPauseMenu(document.body, callbacks);
      const criticalOption = document.querySelector<HTMLElement>('[data-supply-warning-option="critical"]');
      if (!criticalOption) throw new Error('Critical only option not found');
      criticalOption.click();
      expect(callbacks.onChangeSupplyWarningPreference).toHaveBeenCalledWith('critical');
    });

    it('repaints the pressed option immediately after a click, without waiting for the panel to re-render (#544 MR2 fix)', () => {
      const callbacks = makeCallbacks({ supplyWarningPreference: 'all' });
      showPauseMenu(document.body, callbacks);
      const allOption = document.querySelector<HTMLElement>('[data-supply-warning-option="all"]');
      const criticalOption = document.querySelector<HTMLElement>('[data-supply-warning-option="critical"]');
      if (!allOption || !criticalOption) throw new Error('Supply warning options not found');
      expect(allOption.getAttribute('aria-pressed')).toBe('true');

      criticalOption.click();

      expect(criticalOption.getAttribute('aria-pressed')).toBe('true');
      expect(allOption.getAttribute('aria-pressed')).toBe('false');
    });

    it('marks the currently active preference option', () => {
      showPauseMenu(document.body, makeCallbacks({ supplyWarningPreference: 'off' }));
      const offOption = document.querySelector<HTMLElement>('[data-supply-warning-option="off"]');
      const allOption = document.querySelector<HTMLElement>('[data-supply-warning-option="all"]');
      expect(offOption?.getAttribute('aria-pressed')).toBe('true');
      expect(allOption?.getAttribute('aria-pressed')).toBe('false');
    });
  });

  describe('superweapons setting (#545 MR7)', () => {
    it('renders the On/Off control and calls onChangeSuperweaponsPreference on selection', () => {
      const callbacks = makeCallbacks({ superweaponsPreference: 'on' });
      showPauseMenu(document.body, callbacks);
      const offOption = document.querySelector<HTMLElement>('[data-superweapons-option="off"]');
      if (!offOption) throw new Error('Off option not found');
      offOption.click();
      expect(callbacks.onChangeSuperweaponsPreference).toHaveBeenCalledWith('off');
    });

    it('marks the currently active preference option', () => {
      showPauseMenu(document.body, makeCallbacks({ superweaponsPreference: 'off' }));
      const offOption = document.querySelector<HTMLElement>('[data-superweapons-option="off"]');
      const onOption = document.querySelector<HTMLElement>('[data-superweapons-option="on"]');
      expect(offOption?.getAttribute('aria-pressed')).toBe('true');
      expect(onOption?.getAttribute('aria-pressed')).toBe('false');
    });

    it('shows help text describing the current selection and updates it on click', () => {
      showPauseMenu(document.body, makeCallbacks({ superweaponsPreference: 'on' }));
      expect(document.body.textContent).toContain('research, arsenals, and launches are available');
      const offOption = document.querySelector<HTMLElement>('[data-superweapons-option="off"]');
      offOption?.click();
      expect(document.body.textContent).toContain('No nuclear weapons this game');
    });
  });
});


// --- #1451: guarded async saving -------------------------------------------

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

const flush = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

function buttonByLabel(label: string): HTMLButtonElement {
  const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent === label);
  if (!btn) throw new Error(`No button found with text "${label}"`);
  return btn as HTMLButtonElement;
}

describe('pause-menu-panel Save & Start New Game (#1451)', () => {
  it('keeps the confirmation open and locked while the autosave is pending, then starts once', async () => {
    const write = deferred();
    const callbacks = makeCallbacks({ autoSave: vi.fn(() => write.promise) });
    showPauseMenu(document.body, callbacks);
    clickButton('New Game…');

    const save = buttonByLabel('Save & Start New Game');
    save.click();
    save.click(); // rapid duplicate
    await flush();

    expect(callbacks.autoSave).toHaveBeenCalledTimes(1);
    expect(callbacks.onNewGame).not.toHaveBeenCalled();
    expect(document.getElementById('pause-menu')).not.toBeNull();
    expect(document.querySelector('[data-role="autosave-status"]')?.textContent).toContain('Saving');
    expect(buttonByLabel('Save & Start New Game').disabled).toBe(true);
    expect(buttonByLabel('Discard & Start New Game').disabled).toBe(true);
    expect(buttonByLabel('Cancel').disabled).toBe(true);

    write.resolve();
    await vi.waitFor(() => expect(callbacks.onNewGame).toHaveBeenCalledTimes(1));
    expect(document.getElementById('pause-menu')).toBeNull();
    expect(callbacks.autoSave).toHaveBeenCalledTimes(1);
  });

  it('keeps the campaign and offers retry when the autosave rejects, with no unhandled rejection', async () => {
    const first = deferred();
    const callbacks = makeCallbacks({
      autoSave: vi.fn()
        .mockImplementationOnce(() => first.promise)
        .mockImplementationOnce(async () => {}),
    });
    showPauseMenu(document.body, callbacks);
    clickButton('New Game…');
    clickButton('Save & Start New Game');
    first.reject(new Error('QuotaExceededError: secret internals'));
    await flush();

    expect(callbacks.onNewGame).not.toHaveBeenCalled();
    expect(document.getElementById('pause-menu')).not.toBeNull();
    const alert = document.querySelector<HTMLElement>('[data-role="autosave-error"]')!;
    expect(alert.getAttribute('role')).toBe('alert');
    expect(alert.hidden).toBe(false);
    expect(alert.textContent).toContain('Could not save');
    expect(alert.textContent).not.toContain('QuotaExceededError');
    expect(document.querySelector('[data-role="autosave-status"]')?.textContent).toBe('');
    // Controls are usable again and focus returned to the retry.
    expect(buttonByLabel('Save & Start New Game').disabled).toBe(false);
    expect(buttonByLabel('Discard & Start New Game').disabled).toBe(false);
    expect(buttonByLabel('Cancel').disabled).toBe(false);
    expect(document.activeElement).toBe(buttonByLabel('Save & Start New Game'));

    clickButton('Save & Start New Game');
    await vi.waitFor(() => expect(callbacks.onNewGame).toHaveBeenCalledTimes(1));
    expect(callbacks.autoSave).toHaveBeenCalledTimes(2);
    expect(document.getElementById('pause-menu')).toBeNull();
  });

  it('treats a synchronously throwing autosave as a failure, not an escaped error', async () => {
    const callbacks = makeCallbacks({ autoSave: vi.fn(() => { throw new Error('boom'); }) });
    showPauseMenu(document.body, callbacks);
    clickButton('New Game…');
    clickButton('Save & Start New Game');
    await flush();
    expect(callbacks.onNewGame).not.toHaveBeenCalled();
    expect(document.querySelector<HTMLElement>('[data-role="autosave-error"]')?.hidden).toBe(false);
  });

  it('still lets the player Discard or Cancel after a failed save', async () => {
    const callbacks = makeCallbacks({ autoSave: vi.fn(async () => { throw new Error('x'); }) });
    showPauseMenu(document.body, callbacks);
    clickButton('New Game…');
    clickButton('Save & Start New Game');
    await flush();
    clickButton('Cancel');
    expect(document.body.textContent).toContain('Save Game');
    clickButton('New Game…');
    clickButton('Discard & Start New Game');
    expect(callbacks.onNewGame).toHaveBeenCalledTimes(1);
  });
});

describe('pause menu -> save panel callback boundary (#1451)', () => {
  async function openSavePanel(callbacks: ReturnType<typeof makeCallbacks>): Promise<void> {
    showPauseMenu(document.body, callbacks);
    clickButton('Save Game');
    await vi.waitFor(() => expect(document.getElementById('save-panel')).not.toBeNull());
  }
  const saveButton = (): HTMLButtonElement => document.querySelector<HTMLButtonElement>('#btn-save-new')!;

  it('keeps the save panel open until onSave resolves, then closes it exactly once and leaves the pause menu', async () => {
    const write = deferred();
    const callbacks = makeCallbacks({ onSave: vi.fn(() => write.promise) });
    await openSavePanel(callbacks);
    (document.getElementById('new-slot-name') as HTMLInputElement).value = 'Before the siege';

    saveButton().click();
    saveButton().click();
    await flush();
    expect(callbacks.onSave).toHaveBeenCalledTimes(1);
    expect(callbacks.onSave).toHaveBeenCalledWith(expect.stringMatching(/^slot-/), 'Before the siege');
    expect(document.getElementById('save-panel')).not.toBeNull();
    expect(document.getElementById('pause-menu')).not.toBeNull();

    write.resolve();
    await vi.waitFor(() => expect(document.getElementById('save-panel')).toBeNull());
    expect(document.getElementById('pause-menu')).not.toBeNull();
    expect(callbacks.onSave).toHaveBeenCalledTimes(1);
  });

  it('keeps the save panel with its name and slot when onSave rejects, and retries the same slot', async () => {
    const callbacks = makeCallbacks({
      onSave: vi.fn()
        .mockRejectedValueOnce(new Error('QuotaExceededError'))
        .mockResolvedValueOnce(undefined),
    });
    await openSavePanel(callbacks);
    (document.getElementById('new-slot-name') as HTMLInputElement).value = 'Keep me';

    saveButton().click();
    await flush();
    expect(document.getElementById('save-panel')).not.toBeNull();
    expect((document.getElementById('new-slot-name') as HTMLInputElement).value).toBe('Keep me');
    expect(document.querySelector('#save-panel [role="alert"]')?.textContent).toContain('Could not save');

    saveButton().click();
    await vi.waitFor(() => expect(document.getElementById('save-panel')).toBeNull());
    const [first, second] = vi.mocked(callbacks.onSave).mock.calls;
    expect(second).toEqual(first);
  });
});

describe('pause menu keyboard and focus contract (#1459)', () => {
  it('is a modal: Return to Game is the safe place for focus to start and answers Escape', () => {
    const overlay = showPauseMenu(document.body, makeCallbacks());
    const resume = Array.from(overlay.querySelectorAll('button')).find(b => b.textContent === 'Return to Game')!;
    expect(overlay.hasAttribute(MODAL_ATTR)).toBe(true);
    expect(resume.hasAttribute(MODAL_CANCEL_ATTR)).toBe(true);
    expect(resume.hasAttribute(MODAL_INITIAL_FOCUS_ATTR)).toBe(true);
    expect(document.activeElement).toBe(resume);
  });

  it('the new-game confirmation starts on Cancel (never a destructive choice) and Cancel answers Escape', () => {
    const overlay = showPauseMenu(document.body, makeCallbacks());
    clickButton('New Game…');
    const cancel = Array.from(overlay.querySelectorAll('button')).find(b => b.textContent === 'Cancel')!;
    expect(cancel.hasAttribute(MODAL_CANCEL_ATTR)).toBe(true);
    expect(cancel.hasAttribute(MODAL_INITIAL_FOCUS_ATTR)).toBe(true);
    expect(document.activeElement).toBe(cancel);
    // Backing out lands focus on a control again, not on the page body.
    cancel.click();
    expect(document.activeElement).toBe(Array.from(overlay.querySelectorAll('button')).find(b => b.textContent === 'Return to Game'));
  });

  it('names every settings block so the On/Off and All/Critical buttons are not anonymous', () => {
    const overlay = showPauseMenu(document.body, makeCallbacks());
    const groups = Array.from(overlay.querySelectorAll('[role="group"]')).map(group => {
      const labelledBy = group.getAttribute('aria-labelledby');
      return labelledBy ? document.getElementById(labelledBy)?.textContent : group.getAttribute('aria-label');
    });
    expect(groups).toEqual(expect.arrayContaining([
      'Audio', 'Supply Warnings', 'Superweapons', 'Opponent challenge', 'Your personal difficulty',
    ]));
  });
});
