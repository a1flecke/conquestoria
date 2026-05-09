import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SaveFileAdapter } from '@/platform/save-file-adapter';
import {
  exportMostRecentAutoSave,
  importSaveFromFile,
  parseSaveFile,
  serializeSaveFile,
} from '@/storage/save-file-transfer';

const mocks = vi.hoisted(() => ({
  loadAutoSave: vi.fn(),
}));

vi.mock('@/storage/save-manager', () => ({
  loadAutoSave: mocks.loadAutoSave,
}));

function makeState(turn: number = 7): any {
  return {
    turn,
    currentPlayer: 'player',
    civilizations: {
      player: { civType: 'egypt' },
    },
    cities: {},
    units: {},
    map: { width: 1, height: 1, tiles: [], wrapsHorizontally: false },
  };
}

function makeAdapter(overrides: Partial<SaveFileAdapter> = {}): SaveFileAdapter {
  return {
    exportText: vi.fn(async () => ({ status: 'success' as const })),
    importText: vi.fn(async () => ({ status: 'success' as const, text: serializeSaveFile(makeState(11)) })),
    ...overrides,
  };
}

describe('save-file-transfer', () => {
  beforeEach(() => {
    mocks.loadAutoSave.mockReset();
  });

  it('serializes saves as stable JSON text', () => {
    const text = serializeSaveFile(makeState(9));
    expect(JSON.parse(text).turn).toBe(9);
    expect(text.endsWith('\n')).toBe(true);
  });

  it('parses valid save JSON', () => {
    const parsed = parseSaveFile(serializeSaveFile(makeState(12)));
    expect(parsed.status).toBe('success');
    if (parsed.status === 'success') {
      expect(parsed.state.turn).toBe(12);
    }
  });

  it('rejects invalid JSON with a clear error', () => {
    expect(parseSaveFile('{not-json')).toEqual({
      status: 'error',
      message: 'Invalid save file: JSON could not be parsed.',
    });
  });

  it('rejects JSON that is not a game save shape', () => {
    expect(parseSaveFile(JSON.stringify({ hello: 'world' }))).toEqual({
      status: 'error',
      message: 'Invalid save file: missing required game state fields.',
    });
  });

  it('rejects partial game-like JSON that cannot start a game', () => {
    expect(parseSaveFile(JSON.stringify({
      turn: 1,
      currentPlayer: 'player',
      civilizations: {},
    }))).toEqual({
      status: 'error',
      message: 'Invalid save file: missing required game state fields.',
    });
  });

  it('exports the most recent autosave through the injected adapter', async () => {
    const adapter = makeAdapter();
    mocks.loadAutoSave.mockResolvedValue(makeState(14));

    const result = await exportMostRecentAutoSave(adapter);

    expect(result).toEqual({ status: 'success' });
    expect(adapter.exportText).toHaveBeenCalledWith(
      'conquestoria-save-turn14.json',
      serializeSaveFile(makeState(14)),
    );
  });

  it('returns an error when there is no autosave to export', async () => {
    mocks.loadAutoSave.mockResolvedValue(undefined);

    await expect(exportMostRecentAutoSave(makeAdapter())).resolves.toEqual({
      status: 'error',
      message: 'No save to export.',
    });
  });

  it('imports valid save text through the injected adapter', async () => {
    const adapter = makeAdapter({
      importText: vi.fn(async () => ({ status: 'success' as const, text: serializeSaveFile(makeState(21)) })),
    });

    const result = await importSaveFromFile(adapter);

    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.state.turn).toBe(21);
    }
  });

  it('passes canceled import through without an error', async () => {
    const adapter = makeAdapter({
      importText: vi.fn(async () => ({ status: 'cancelled' as const })),
    });

    await expect(importSaveFromFile(adapter)).resolves.toEqual({ status: 'cancelled' });
  });
});
