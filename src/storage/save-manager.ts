import type { GameState, SaveSlotMeta } from '@/core/types';
import { dbGet, dbPut, dbDelete, dbGetAllKeys } from './db';

const SAVE_PREFIX = 'save:';
const META_PREFIX = 'meta:';
const AUTO_SAVE_KEY = 'autosave';
const SETTINGS_KEY = 'settings';
const LOCALSTORAGE_AUTOSAVE_KEY = 'conquestoria-autosave';

// --- Auto-save (backward compatible) ---

export async function autoSave(state: GameState): Promise<void> {
  await dbPut(AUTO_SAVE_KEY, state);
  // Backup to localStorage (survives IndexedDB eviction on iOS Safari)
  try {
    localStorage.setItem(LOCALSTORAGE_AUTOSAVE_KEY, JSON.stringify(state));
  } catch {
    console.warn('[save] localStorage backup failed (quota exceeded?)');
  }
}

export async function loadAutoSave(): Promise<GameState | undefined> {
  const idbSave = await dbGet<GameState>(AUTO_SAVE_KEY);
  if (idbSave) return idbSave;
  // Fall back to localStorage if IndexedDB was evicted
  try {
    const raw = localStorage.getItem(LOCALSTORAGE_AUTOSAVE_KEY);
    if (raw) return JSON.parse(raw) as GameState;
  } catch {
    console.warn('[save] localStorage fallback parse failed');
  }
  return undefined;
}

export async function hasAutoSave(): Promise<boolean> {
  const idbSave = await dbGet(AUTO_SAVE_KEY);
  if (idbSave !== undefined) return true;
  return localStorage.getItem(LOCALSTORAGE_AUTOSAVE_KEY) !== null;
}

export async function deleteAutoSave(): Promise<void> {
  await dbDelete(AUTO_SAVE_KEY);
  localStorage.removeItem(LOCALSTORAGE_AUTOSAVE_KEY);
}

// --- Settings ---

export async function saveSettings(settings: GameState['settings']): Promise<void> {
  await dbPut(SETTINGS_KEY, settings);
}

export async function loadSettings(): Promise<GameState['settings'] | undefined> {
  return dbGet<GameState['settings']>(SETTINGS_KEY);
}

// --- Multi-slot saves ---

export async function saveGame(slotId: string, name: string, state: GameState): Promise<void> {
  const meta: SaveSlotMeta = {
    id: slotId,
    name,
    civType: state.hotSeat ? 'hotseat' : (state.civilizations[state.currentPlayer]?.civType ?? 'generic'),
    turn: state.turn,
    lastPlayed: new Date().toISOString(),
    gameMode: state.hotSeat ? 'hotseat' : 'solo',
    playerCount: state.hotSeat?.playerCount,
    playerNames: state.hotSeat?.players.filter(p => p.isHuman).map(p => p.name),
  };
  await dbPut(SAVE_PREFIX + slotId, state);
  await dbPut(META_PREFIX + slotId, meta);
}

export async function loadGame(slotId: string): Promise<GameState | undefined> {
  return dbGet<GameState>(SAVE_PREFIX + slotId);
}

export async function deleteGame(slotId: string): Promise<void> {
  await dbDelete(SAVE_PREFIX + slotId);
  await dbDelete(META_PREFIX + slotId);
}

export async function listSaves(): Promise<SaveSlotMeta[]> {
  const allKeys = await dbGetAllKeys();
  const metaKeys = allKeys.filter(k => k.startsWith(META_PREFIX));
  const metas: SaveSlotMeta[] = [];
  for (const key of metaKeys) {
    const meta = await dbGet<SaveSlotMeta>(key);
    if (meta) metas.push(meta);
  }
  metas.sort((a, b) => b.lastPlayed.localeCompare(a.lastPlayed));
  return metas;
}

export async function renameSave(slotId: string, newName: string): Promise<void> {
  const meta = await dbGet<SaveSlotMeta>(META_PREFIX + slotId);
  if (meta) {
    meta.name = newName;
    await dbPut(META_PREFIX + slotId, meta);
  }
}
