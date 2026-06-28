import type { GameState } from '@/core/types';
import { loadAutoSave } from '@/storage/save-manager';
import type { SaveFileAdapter, SaveFileReadResult, SaveFileWriteResult } from '@/platform/save-file-adapter';

export type SaveFileParseResult =
  | { status: 'success'; state: GameState }
  | { status: 'error'; message: string };

export type SaveFileImportResult =
  | { status: 'success'; state: GameState }
  | { status: 'cancelled' }
  | { status: 'error'; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isGameStateShape(value: unknown): value is GameState {
  if (
    !isRecord(value)
    || !Number.isFinite(value.turn)
    || typeof value.currentPlayer !== 'string'
    || !isRecord(value.civilizations)
    || !isRecord(value.cities)
    || !isRecord(value.units)
    || !isRecord(value.map)
  ) {
    return false;
  }
  if (
    !Number.isFinite(value.map.width)
    || !Number.isFinite(value.map.height)
    || typeof value.map.wrapsHorizontally !== 'boolean'
    || !isRecord(value.map.tiles)
  ) {
    return false;
  }
  return isRecord(value.civilizations[value.currentPlayer]);
}

export function serializeSaveFile(state: GameState): string {
  return `${JSON.stringify(state, null, 2)}\n`;
}

export function parseSaveFile(raw: string): SaveFileParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { status: 'error', message: 'Invalid save file: JSON could not be parsed.' };
  }

  if (!isGameStateShape(parsed)) {
    return { status: 'error', message: 'Invalid save file: missing required game state fields.' };
  }

  return { status: 'success', state: parsed };
}

export async function exportMostRecentAutoSave(adapter: SaveFileAdapter): Promise<SaveFileWriteResult> {
  const state = await loadAutoSave();
  if (!state) {
    return { status: 'error', message: 'No save to export.' };
  }

  return adapter.exportText(`conquestoria-save-turn${state.turn}.json`, serializeSaveFile(state));
}

export async function importSaveFromFile(adapter: SaveFileAdapter): Promise<SaveFileImportResult> {
  const imported: SaveFileReadResult = await adapter.importText();
  if (imported.status !== 'success') {
    return imported;
  }

  return parseSaveFile(imported.text);
}
