import { describe, it, expect, vi } from 'vitest';
import { createUserSettingsStore } from '@/app/user-settings-store';
import { createDefaultSettings } from '@/core/game-state';
import type { CustomCivDefinition, GameState } from '@/core/types';

type Settings = GameState['settings'];

const customCiv = (id: string): CustomCivDefinition => ({
  id,
  name: id,
  color: '#000000',
  leaderName: id,
  cityNames: [],
  primaryTrait: 'expansionist',
  temperamentTraits: [],
});

describe('user settings store', () => {
  it('has no persisted settings before the first refresh', () => {
    const store = createUserSettingsStore({ load: async () => undefined });

    expect(store.getPersisted()).toBeUndefined();
    expect(store.getOverrides()).toEqual({});
  });

  it('refresh loads and merges settings with defaults, filling in missing fields', async () => {
    const loaded = { musicVolume: 0.2 } as Settings;
    const store = createUserSettingsStore({ load: async () => loaded });

    const result = await store.refresh();

    expect(result.musicVolume).toBe(0.2);
    expect(result.soundEnabled).toBe(true);
    expect(result.customCivilizations).toEqual([]);
    expect(store.getPersisted()).toEqual(result);
  });

  it('refresh falls back to the previously persisted settings when load resolves undefined', async () => {
    const first = createDefaultSettings('small', { musicVolume: 0.9 });
    const store = createUserSettingsStore({ load: async () => first });
    await store.refresh();

    const store2ndLoad = createUserSettingsStore({ load: async () => undefined });
    // simulate a store that already had persisted settings before a second refresh with no data
    const secondStore = createUserSettingsStore({ load: async () => first });
    await secondStore.refresh();
    const secondResult = await store2ndLoad.refresh();

    expect(secondResult.soundEnabled).toBe(true);
    expect(secondStore.getPersisted()?.musicVolume).toBe(0.9);
  });

  it('getOverrides exposes only the audio/UX preference fields, never mapSize or beastsMode', async () => {
    const loaded = createDefaultSettings('large', { musicVolume: 0.3, beastsMode: 'off' });
    const store = createUserSettingsStore({ load: async () => loaded });
    await store.refresh();

    const overrides = store.getOverrides();

    expect(overrides).toEqual({
      soundEnabled: true,
      musicEnabled: true,
      musicVolume: 0.3,
      sfxVolume: 0.7,
      stingerVolume: 1.0,
      stingerEnabled: true,
      tutorialEnabled: true,
      advisorsEnabled: loaded.advisorsEnabled,
      councilTalkLevel: 'normal',
    });
    expect(overrides).not.toHaveProperty('mapSize');
    expect(overrides).not.toHaveProperty('beastsMode');
  });

  it('master volume defaults to 1.0 and is not persisted via save', () => {
    const load = vi.fn(async () => undefined);
    const store = createUserSettingsStore({ load });

    expect(store.getMasterVolume()).toBe(1.0);
    store.setMasterVolume(0.4);
    expect(store.getMasterVolume()).toBe(0.4);
  });

  it('setCustomCivilizations merges into persisted settings without discarding other fields', async () => {
    const loaded = createDefaultSettings('small', { musicVolume: 0.6 });
    const store = createUserSettingsStore({ load: async () => loaded });
    await store.refresh();

    store.setCustomCivilizations([customCiv('c1')]);

    expect(store.getPersisted()?.customCivilizations).toEqual([customCiv('c1')]);
    expect(store.getPersisted()?.musicVolume).toBe(0.6);
  });

  it('setCustomCivilizations works even before any refresh has happened', () => {
    const store = createUserSettingsStore({ load: async () => undefined });

    store.setCustomCivilizations([customCiv('c1')]);

    expect(store.getPersisted()?.customCivilizations).toEqual([customCiv('c1')]);
  });
});
