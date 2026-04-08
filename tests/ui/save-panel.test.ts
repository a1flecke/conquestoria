import { beforeEach, describe, expect, it, vi } from 'vitest';
import { installSavePanelDocumentMock } from './helpers/save-panel-fixture';

const mocks = vi.hoisted(() => ({
  listSaves: vi.fn(),
  hasAutoSave: vi.fn(),
  loadAutoSave: vi.fn(),
  deleteGame: vi.fn(),
  renameSave: vi.fn(),
}));

vi.mock('@/storage/save-manager', () => ({
  listSaves: mocks.listSaves,
  hasAutoSave: mocks.hasAutoSave,
  loadAutoSave: mocks.loadAutoSave,
  deleteGame: mocks.deleteGame,
  renameSave: mocks.renameSave,
}));

import { createSavePanel } from '@/ui/save-panel';

describe('save-panel', () => {
  beforeEach(() => {
    mocks.listSaves.mockReset();
    mocks.hasAutoSave.mockReset();
    mocks.loadAutoSave.mockReset();
    mocks.deleteGame.mockReset();
    mocks.renameSave.mockReset();
  });

  it('renders autosave as a visible saved-game entry in start mode', async () => {
    const container = installSavePanelDocumentMock();
    mocks.hasAutoSave.mockResolvedValue(true);
    mocks.listSaves.mockResolvedValue([
      {
        id: 'autosave',
        name: 'Autosave',
        civType: 'egypt',
        turn: 9,
        lastPlayed: '2026-04-08T12:00:00.000Z',
        kind: 'autosave',
        gameMode: 'solo',
      },
    ]);

    await createSavePanel(container, {
      onNewGame: () => {},
      onContinue: () => {},
      onLoadSlot: () => {},
    });

    const rendered = (container as unknown as { children: Array<{ innerHTML: string }> }).children[0]?.innerHTML ?? '';
    expect(rendered).toContain('Saved Games');
    expect(rendered).toContain('Autosave');
  });

  it('keeps backup and import actions below the saved-games list', async () => {
    const container = installSavePanelDocumentMock();
    mocks.hasAutoSave.mockResolvedValue(true);
    mocks.listSaves.mockResolvedValue([
      {
        id: 'autosave',
        name: 'Autosave',
        civType: 'egypt',
        turn: 9,
        lastPlayed: '2026-04-08T12:00:00.000Z',
        kind: 'autosave',
        gameMode: 'solo',
      },
    ]);

    await createSavePanel(container, {
      onNewGame: () => {},
      onContinue: () => {},
      onLoadSlot: () => {},
    });

    const rendered = (container as unknown as { children: Array<{ innerHTML: string }> }).children[0]?.innerHTML ?? '';
    expect(rendered.indexOf('Saved Games')).toBeLessThan(rendered.indexOf('Backup &amp; Restore'));
  });
});
