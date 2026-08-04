import type { GameState } from '@/core/types';
import { createDefaultSettings } from '@/core/game-state';

type Settings = GameState['settings'];

export interface UserSettingsStore {
  getPersisted(): Settings | undefined;
  refresh(): Promise<Settings>;
  getOverrides(): Partial<Settings>;
  getMasterVolume(): number;
  setMasterVolume(value: number): void;
  setCustomCivilizations(civs: Settings['customCivilizations']): void;
}

export interface UserSettingsStoreDeps {
  load: () => Promise<Settings | undefined>;
}

/**
 * Owns `persistedSettings` (main.ts:322) and `currentMasterVolume` (main.ts:360),
 * moved out of module scope (#787 phase 4). `currentMasterVolume` is
 * deliberately not part of `GameSettings` — it is never saved, only tracked
 * in memory so the pause menu slider shows the right value across reopens.
 */
export function createUserSettingsStore(deps: UserSettingsStoreDeps): UserSettingsStore {
  let persisted: Settings | undefined;
  let masterVolume = 1.0;

  function merge(loadedSettings?: Settings): Settings {
    const baseSettings = loadedSettings ?? persisted ?? createDefaultSettings('small');
    const customCivilizations = loadedSettings?.customCivilizations ?? persisted?.customCivilizations ?? [];
    return {
      ...createDefaultSettings('small', baseSettings),
      ...baseSettings,
      customCivilizations: [...customCivilizations],
    };
  }

  return {
    getPersisted: () => persisted,

    async refresh(): Promise<Settings> {
      const loadedSettings = (await deps.load()) ?? persisted;
      persisted = merge(loadedSettings);
      return persisted;
    },

    getOverrides(): Partial<Settings> {
      if (!persisted) return {};
      return {
        soundEnabled: persisted.soundEnabled,
        musicEnabled: persisted.musicEnabled,
        musicVolume: persisted.musicVolume,
        sfxVolume: persisted.sfxVolume,
        stingerVolume: persisted.stingerVolume ?? 1.0,
        stingerEnabled: persisted.stingerEnabled ?? true,
        tutorialEnabled: persisted.tutorialEnabled,
        advisorsEnabled: persisted.advisorsEnabled,
        councilTalkLevel: persisted.councilTalkLevel,
      };
    },

    getMasterVolume: () => masterVolume,
    setMasterVolume(value: number): void {
      masterVolume = value;
    },

    setCustomCivilizations(civs: Settings['customCivilizations'] = []): void {
      persisted = {
        ...merge(persisted),
        customCivilizations: [...civs],
      };
    },
  };
}
