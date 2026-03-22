import type { GameState } from '@/core/types';
import { dbGet, dbPut, dbDelete } from './db';

const AUTO_SAVE_KEY = 'autosave';
const SETTINGS_KEY = 'settings';

export async function autoSave(state: GameState): Promise<void> {
  await dbPut(AUTO_SAVE_KEY, state);
}

export async function loadAutoSave(): Promise<GameState | undefined> {
  return dbGet<GameState>(AUTO_SAVE_KEY);
}

export async function hasAutoSave(): Promise<boolean> {
  const save = await dbGet(AUTO_SAVE_KEY);
  return save !== undefined;
}

export async function deleteAutoSave(): Promise<void> {
  await dbDelete(AUTO_SAVE_KEY);
}

export async function saveSettings(settings: GameState['settings']): Promise<void> {
  await dbPut(SETTINGS_KEY, settings);
}

export async function loadSettings(): Promise<GameState['settings'] | undefined> {
  return dbGet<GameState['settings']>(SETTINGS_KEY);
}
