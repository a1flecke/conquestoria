import type { GameState, SaveSlotMeta } from '@/core/types';
import { drawNextCityName } from '@/systems/city-name-system';
import { resolveCivDefinition } from '@/systems/civ-registry';
import { MINOR_CIV_DEFINITIONS } from '@/systems/minor-civ-definitions';
import { dbGet, dbPut, dbDelete, dbGetAllKeys } from './db';

const SAVE_PREFIX = 'save:';
const META_PREFIX = 'meta:';
const LEGACY_AUTO_SAVE_KEY = 'autosave';
const AUTO_SAVE_PREFIX = 'autosave:';
const SETTINGS_KEY = 'settings';
const LOCALSTORAGE_AUTOSAVE_KEY = 'conquestoria-autosave';

function ensureGameIdentity(state: GameState): GameState {
  if (!state.gameId) {
    state.gameId = `game-${Date.now()}`;
  }
  if (!state.gameTitle) {
    const civType = state.hotSeat ? 'Hot Seat' : (state.civilizations[state.currentPlayer]?.civType ?? 'Unknown');
    state.gameTitle = `Recovered ${civType} Campaign`;
  }
  return state;
}

function migrateLegacyPlanningState(state: GameState): GameState {
  for (const city of Object.values(state.cities ?? {})) {
    city.productionQueue ??= [];
    if (city.productionQueue.length > 3) {
      city.productionQueue = city.productionQueue.slice(0, 3);
    }
  }

  for (const civ of Object.values(state.civilizations ?? {})) {
    civ.techState ??= {
      completed: [],
      currentResearch: null,
      researchQueue: [],
      researchProgress: 0,
      trackPriorities: {} as GameState['civilizations'][string]['techState']['trackPriorities'],
    };
    civ.techState.researchQueue ??= [];
  }

  return state;
}

function normalizeLoadedState(state: GameState): GameState {
  return migrateLegacyPlanningState(migrateLegacyNamingState(ensureGameIdentity(state)));
}

function getCityNamingInfo(state: GameState, ownerId: string): { civType: string; civName: string; namingPool?: string[] } {
  const majorCiv = state.civilizations[ownerId];
  if (majorCiv) {
    const definition = resolveCivDefinition(state, majorCiv.civType ?? '');
    return {
      civType: majorCiv.civType ?? ownerId,
      civName: definition?.name ?? majorCiv.name,
      namingPool: definition?.cityNames,
    };
  }

  if (ownerId.startsWith('mc-')) {
    const minorDefinitionId = ownerId.slice(3);
    const minorDefinition = MINOR_CIV_DEFINITIONS.find(def => def.id === minorDefinitionId);
    if (minorDefinition) {
      return {
        civType: minorDefinition.id,
        civName: minorDefinition.name,
        namingPool: [minorDefinition.name],
      };
    }
  }

  return { civType: ownerId, civName: 'City' };
}

function getLegacyCitySequence(cityId: string): number | null {
  const match = /^city-(\d+)$/.exec(cityId);
  return match ? Number(match[1]) : null;
}

function compareLegacyCityIds(leftId: string, rightId: string): number {
  const leftSequence = getLegacyCitySequence(leftId);
  const rightSequence = getLegacyCitySequence(rightId);
  if (leftSequence !== null && rightSequence !== null && leftSequence !== rightSequence) {
    return leftSequence - rightSequence;
  }
  return leftId.localeCompare(rightId);
}

export function migrateLegacyNamingState(state: GameState): GameState {
  if (!state.cities || !state.civilizations) {
    return state;
  }

  const sortedCities = Object.entries(state.cities).sort(([leftId], [rightId]) => compareLegacyCityIds(leftId, rightId));
  const usedNames = new Set<string>();

  for (const [, city] of sortedCities) {
    const namingInfo = getCityNamingInfo(state, city.owner);
    const pool = namingInfo.namingPool ?? [];
    const nameIsAllowed = pool.length === 0 || pool.includes(city.name);
    const nameIsUnique = !usedNames.has(city.name);

    if (nameIsAllowed && nameIsUnique) {
      usedNames.add(city.name);
      continue;
    }

    city.name = drawNextCityName(namingInfo.civType, usedNames, {
      namingPool: namingInfo.namingPool,
      civName: namingInfo.civName,
    });
    usedNames.add(city.name);
  }

  return state;
}

function buildSaveMeta(slotId: string, name: string, state: GameState, kind: 'manual' | 'autosave'): SaveSlotMeta {
  const resolved = ensureGameIdentity(state);
  return {
    id: slotId,
    name,
    civType: resolved.hotSeat ? 'hotseat' : (resolved.civilizations[resolved.currentPlayer]?.civType ?? 'generic'),
    turn: resolved.turn,
    lastPlayed: new Date().toISOString(),
    kind,
    gameMode: resolved.hotSeat ? 'hotseat' : 'solo',
    playerCount: resolved.hotSeat?.playerCount,
    playerNames: resolved.hotSeat?.players.filter(p => p.isHuman).map(p => p.name),
    gameId: resolved.gameId,
    gameTitle: resolved.gameTitle,
  };
}

function compareSaveMeta(a: SaveSlotMeta, b: SaveSlotMeta): number {
  const turnDelta = b.turn - a.turn;
  if (turnDelta !== 0) {
    return turnDelta;
  }

  const timeDelta = Date.parse(b.lastPlayed) - Date.parse(a.lastPlayed);
  if (!Number.isNaN(timeDelta) && timeDelta !== 0) {
    return timeDelta;
  }

  return a.name.localeCompare(b.name);
}

function getSaveStorageKey(id: string, kind: 'manual' | 'autosave'): string {
  return kind === 'autosave' ? id : `${SAVE_PREFIX}${id}`;
}

function getMetaStorageKey(id: string): string {
  return `${META_PREFIX}${id}`;
}

function isAutoSaveId(id: string): boolean {
  return id.startsWith(AUTO_SAVE_PREFIX) || id === LEGACY_AUTO_SAVE_KEY;
}

async function listPersistedMetas(): Promise<SaveSlotMeta[]> {
  const allKeys = await dbGetAllKeys();
  const metaKeys = allKeys.filter(key => key.startsWith(META_PREFIX));
  const metas: SaveSlotMeta[] = [];
  for (const key of metaKeys) {
    const meta = await dbGet<SaveSlotMeta>(key);
    if (meta) {
      metas.push(meta);
    }
  }
  return metas.sort(compareSaveMeta);
}

async function loadLegacyAutoSave(): Promise<GameState | undefined> {
  const idbSave = await dbGet<GameState>(LEGACY_AUTO_SAVE_KEY);
  if (idbSave) {
    return normalizeLoadedState(idbSave);
  }

  try {
    const raw = localStorage.getItem(LOCALSTORAGE_AUTOSAVE_KEY);
    if (raw) {
      return normalizeLoadedState(JSON.parse(raw) as GameState);
    }
  } catch {
    console.warn('[save] localStorage fallback parse failed');
  }

  return undefined;
}

async function syncLocalStorageBackup(state: GameState | undefined): Promise<void> {
  try {
    if (!state) {
      localStorage.removeItem(LOCALSTORAGE_AUTOSAVE_KEY);
      return;
    }
    localStorage.setItem(LOCALSTORAGE_AUTOSAVE_KEY, JSON.stringify(state));
  } catch {
    console.warn('[save] localStorage backup failed (quota exceeded?)');
  }
}

async function pruneAutosavesForGame(gameId: string): Promise<void> {
  const metas = (await listPersistedMetas())
    .filter(meta => meta.kind === 'autosave' && meta.gameId === gameId)
    .sort((a, b) => b.turn - a.turn || compareSaveMeta(a, b));

  for (const stale of metas.slice(5)) {
    await dbDelete(getSaveStorageKey(stale.id, 'autosave'));
    await dbDelete(getMetaStorageKey(stale.id));
  }
}

async function listLoadableAutosaveMetas(pruneInvalid: boolean = true): Promise<SaveSlotMeta[]> {
  const metas = (await listPersistedMetas()).filter(meta => meta.kind === 'autosave');
  const valid: SaveSlotMeta[] = [];

  for (const meta of metas) {
    const payload = await dbGet<GameState>(getSaveStorageKey(meta.id, 'autosave'));
    if (payload) {
      valid.push(meta);
      continue;
    }

    if (pruneInvalid) {
      await dbDelete(getMetaStorageKey(meta.id));
    }
  }

  return valid.sort((a, b) => b.turn - a.turn || compareSaveMeta(a, b));
}

async function getMostRecentAutosaveMeta(): Promise<SaveSlotMeta | undefined> {
  return (await listLoadableAutosaveMetas())[0];
}

async function loadMostRecentPersistedAutosave(): Promise<GameState | undefined> {
  const newestMeta = await getMostRecentAutosaveMeta();
  if (!newestMeta) {
    return undefined;
  }

  const state = await dbGet<GameState>(getSaveStorageKey(newestMeta.id, 'autosave'));
  return state ? normalizeLoadedState(state) : undefined;
}

async function retireLegacyAutosaveIfRealAutosavesExist(): Promise<boolean> {
  const loadableAutosaves = await listLoadableAutosaveMetas();
  if (loadableAutosaves.length === 0) {
    return false;
  }

  await dbDelete(LEGACY_AUTO_SAVE_KEY);
  await syncLocalStorageBackup(undefined);
  return true;
}

// --- Auto-save ---

export async function autoSave(state: GameState): Promise<void> {
  const resolved = ensureGameIdentity(state);
  const entryId = `${AUTO_SAVE_PREFIX}${resolved.gameId}:${resolved.turn}`;
  const meta = buildSaveMeta(entryId, `Autosave Turn ${resolved.turn}`, resolved, 'autosave');

  await dbPut(getSaveStorageKey(entryId, 'autosave'), resolved);
  await dbPut(getMetaStorageKey(entryId), meta);
  await pruneAutosavesForGame(resolved.gameId!);
  await retireLegacyAutosaveIfRealAutosavesExist();
  await syncLocalStorageBackup(resolved);
}

export async function loadMostRecentAutoSave(): Promise<GameState | undefined> {
  const retiredLegacy = await retireLegacyAutosaveIfRealAutosavesExist();
  const persistedAutoSave = await loadMostRecentPersistedAutosave();
  if (persistedAutoSave) {
    return persistedAutoSave;
  }

  if (retiredLegacy) {
    return undefined;
  }

  return loadLegacyAutoSave();
}

export async function loadAutoSave(): Promise<GameState | undefined> {
  return loadMostRecentAutoSave();
}

export async function hasAutoSave(): Promise<boolean> {
  return (await loadMostRecentAutoSave()) !== undefined;
}

export async function deleteAutoSave(): Promise<void> {
  const newestMeta = await getMostRecentAutosaveMeta();
  if (newestMeta) {
    await deleteSaveEntry(newestMeta.id, 'autosave');
    return;
  }
  await dbDelete(LEGACY_AUTO_SAVE_KEY);
  await syncLocalStorageBackup(undefined);
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
  const resolved = normalizeLoadedState(state);
  const meta = buildSaveMeta(slotId, name, resolved, 'manual');
  await dbPut(getSaveStorageKey(slotId, 'manual'), resolved);
  await dbPut(getMetaStorageKey(slotId), meta);
}

export async function loadGame(slotId: string): Promise<GameState | undefined> {
  if (isAutoSaveId(slotId)) {
    if (slotId === LEGACY_AUTO_SAVE_KEY) {
      return loadLegacyAutoSave();
    }
    const save = await dbGet<GameState>(getSaveStorageKey(slotId, 'autosave'));
    return save ? normalizeLoadedState(save) : undefined;
  }

  const save = await dbGet<GameState>(getSaveStorageKey(slotId, 'manual'));
  return save ? normalizeLoadedState(save) : undefined;
}

export async function deleteSaveEntry(entryId: string, kind: 'manual' | 'autosave'): Promise<void> {
  if (kind === 'autosave' && entryId === LEGACY_AUTO_SAVE_KEY) {
    await dbDelete(LEGACY_AUTO_SAVE_KEY);
    await syncLocalStorageBackup(undefined);
    return;
  }

  await dbDelete(getSaveStorageKey(entryId, kind));
  await dbDelete(getMetaStorageKey(entryId));

  if (kind === 'autosave') {
    await syncLocalStorageBackup(await loadMostRecentPersistedAutosave());
  }
}

export async function deleteGame(slotId: string): Promise<void> {
  await deleteSaveEntry(slotId, 'manual');
}

export async function listSaves(options: { includeAutoSave?: boolean } = {}): Promise<SaveSlotMeta[]> {
  const metas = await listPersistedMetas();
  const visible = options.includeAutoSave
    ? metas
    : metas.filter(meta => meta.kind !== 'autosave');

  if (!options.includeAutoSave) {
    return visible;
  }

  const loadableAutosaves = await listLoadableAutosaveMetas();
  const visibleManualSaves = visible.filter(meta => meta.kind !== 'autosave');
  if (loadableAutosaves.length > 0) {
    await retireLegacyAutosaveIfRealAutosavesExist();
    return [...loadableAutosaves, ...visibleManualSaves].sort(compareSaveMeta);
  }

  const legacyAuto = await loadLegacyAutoSave();
  if (!legacyAuto) {
    return visibleManualSaves;
  }

  return [
    buildSaveMeta(LEGACY_AUTO_SAVE_KEY, `Autosave Turn ${legacyAuto.turn}`, legacyAuto, 'autosave'),
    ...visibleManualSaves,
  ].sort(compareSaveMeta);
}

export async function renameSave(slotId: string, newName: string): Promise<void> {
  const meta = await dbGet<SaveSlotMeta>(getMetaStorageKey(slotId));
  if (meta) {
    meta.name = newName;
    await dbPut(getMetaStorageKey(slotId), meta);
  }
}
