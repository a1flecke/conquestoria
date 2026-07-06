import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  isTauriDistribution: vi.fn(),
  createBrowserSaveFileAdapter: vi.fn(),
  createTauriSaveFileAdapter: vi.fn(),
}));

vi.mock('@/platform/distribution', () => ({
  isTauriDistribution: mocks.isTauriDistribution,
}));

vi.mock('@/platform/browser-save-file-adapter', () => ({
  createBrowserSaveFileAdapter: mocks.createBrowserSaveFileAdapter,
}));

vi.mock('@/platform/tauri-save-file-adapter', () => ({
  createTauriSaveFileAdapter: mocks.createTauriSaveFileAdapter,
}));

import { getSaveFileAdapter } from '@/platform/save-file-adapter';

describe('getSaveFileAdapter', () => {
  const browserAdapter = {
    exportText: vi.fn(),
    importText: vi.fn(),
  };
  const tauriAdapter = {
    exportText: vi.fn(),
    importText: vi.fn(),
  };

  beforeEach(() => {
    mocks.isTauriDistribution.mockReset();
    mocks.createBrowserSaveFileAdapter.mockReset();
    mocks.createTauriSaveFileAdapter.mockReset();
    mocks.createBrowserSaveFileAdapter.mockReturnValue(browserAdapter);
    mocks.createTauriSaveFileAdapter.mockReturnValue(tauriAdapter);
  });

  it('uses the browser adapter for web builds', async () => {
    mocks.isTauriDistribution.mockReturnValue(false);

    await expect(getSaveFileAdapter()).resolves.toBe(browserAdapter);
    expect(mocks.createBrowserSaveFileAdapter).toHaveBeenCalledOnce();
    expect(mocks.createTauriSaveFileAdapter).not.toHaveBeenCalled();
  });

  it('uses the native adapter for Tauri builds', async () => {
    mocks.isTauriDistribution.mockReturnValue(true);

    await expect(getSaveFileAdapter()).resolves.toBe(tauriAdapter);
    expect(mocks.createTauriSaveFileAdapter).toHaveBeenCalledOnce();
    expect(mocks.createBrowserSaveFileAdapter).not.toHaveBeenCalled();
  });
});
