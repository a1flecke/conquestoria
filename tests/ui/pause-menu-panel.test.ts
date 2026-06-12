// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { showPauseMenu, type AudioSettingsSnapshot } from '@/ui/pause-menu-panel';

const DEFAULT_TEST_AUDIO: AudioSettingsSnapshot = {
  masterVolume: 1.0, musicVolume: 0.5, sfxVolume: 0.7,
  voiceVolume: 1.0, stingerVolume: 1.0,
  musicEnabled: true, soundEnabled: true, voiceEnabled: true, stingerEnabled: true,
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
    audioSettings: { ...DEFAULT_TEST_AUDIO },
    onAudioSettingChange: vi.fn(),
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
    await vi.waitFor(() => expect(callbacks.autoSave).toHaveBeenCalledTimes(1));
    expect(callbacks.onNewGame).toHaveBeenCalledTimes(1);
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
    it('renders 5 range sliders (Master, Music, SFX, Voice, Stinger)', () => {
      showPauseMenu(document.body, makeCallbacks());
      const sliders = document.querySelectorAll('input[type="range"]');
      expect(sliders).toHaveLength(5);
    });

    it('renders 4 checkboxes (Music, SFX, Voice, Stinger — Master has no toggle)', () => {
      showPauseMenu(document.body, makeCallbacks());
      const checkboxes = document.querySelectorAll('input[type="checkbox"]');
      expect(checkboxes).toHaveLength(4);
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

    it('Voice slider calls onAudioSettingChange with voiceVolume', () => {
      const callbacks = makeCallbacks();
      showPauseMenu(document.body, callbacks);
      const voiceSlider = document.querySelector<HTMLInputElement>('input[aria-label="Voice volume"]');
      if (!voiceSlider) throw new Error('Voice slider not found');
      voiceSlider.value = '0.7';
      voiceSlider.dispatchEvent(new Event('input'));
      expect(callbacks.onAudioSettingChange).toHaveBeenCalledWith('voiceVolume', 0.7);
    });
  });
});
