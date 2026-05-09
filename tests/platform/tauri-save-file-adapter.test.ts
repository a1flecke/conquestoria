import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  open: vi.fn(),
  writeTextFile: vi.fn(),
  readTextFile: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({
  save: mocks.save,
  open: mocks.open,
}));

vi.mock('@tauri-apps/plugin-fs', () => ({
  writeTextFile: mocks.writeTextFile,
  readTextFile: mocks.readTextFile,
}));

import { createTauriSaveFileAdapter } from '@/platform/tauri-save-file-adapter';

describe('createTauriSaveFileAdapter', () => {
  beforeEach(() => {
    mocks.save.mockReset();
    mocks.open.mockReset();
    mocks.writeTextFile.mockReset();
    mocks.readTextFile.mockReset();
  });

  it('writes exported text to the path chosen by the native save dialog', async () => {
    mocks.save.mockResolvedValue('/Users/me/Desktop/save.json');
    const adapter = createTauriSaveFileAdapter();

    await expect(adapter.exportText('save.json', '{"turn":1}')).resolves.toEqual({ status: 'success' });

    expect(mocks.save).toHaveBeenCalledWith({
      defaultPath: 'save.json',
      filters: [{ name: 'Conquestoria Save', extensions: ['json'] }],
    });
    expect(mocks.writeTextFile).toHaveBeenCalledWith('/Users/me/Desktop/save.json', '{"turn":1}');
  });

  it('reports export cancellation without writing a file', async () => {
    mocks.save.mockResolvedValue(null);
    const adapter = createTauriSaveFileAdapter();

    await expect(adapter.exportText('save.json', '{}')).resolves.toEqual({ status: 'cancelled' });
    expect(mocks.writeTextFile).not.toHaveBeenCalled();
  });

  it('reads imported text from the path chosen by the native open dialog', async () => {
    mocks.open.mockResolvedValue('/Users/me/Desktop/save.json');
    mocks.readTextFile.mockResolvedValue('{"turn":2}');
    const adapter = createTauriSaveFileAdapter();

    await expect(adapter.importText()).resolves.toEqual({ status: 'success', text: '{"turn":2}' });

    expect(mocks.open).toHaveBeenCalledWith({
      multiple: false,
      directory: false,
      filters: [{ name: 'Conquestoria Save', extensions: ['json'] }],
    });
    expect(mocks.readTextFile).toHaveBeenCalledWith('/Users/me/Desktop/save.json');
  });

  it('reports import cancellation without reading a file', async () => {
    mocks.open.mockResolvedValue(null);
    const adapter = createTauriSaveFileAdapter();

    await expect(adapter.importText()).resolves.toEqual({ status: 'cancelled' });
    expect(mocks.readTextFile).not.toHaveBeenCalled();
  });
});
