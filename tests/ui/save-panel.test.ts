import { beforeEach, describe, expect, it, vi } from 'vitest';
import { installSavePanelDocumentMock } from './helpers/save-panel-fixture';

const mocks = vi.hoisted(() => ({
  listSaves: vi.fn(),
  hasAutoSave: vi.fn(),
  loadAutoSave: vi.fn(),
  deleteSaveEntry: vi.fn(),
  renameSave: vi.fn(),
}));

vi.mock('@/storage/save-manager', () => ({
  listSaves: mocks.listSaves,
  hasAutoSave: mocks.hasAutoSave,
  loadAutoSave: mocks.loadAutoSave,
  deleteSaveEntry: mocks.deleteSaveEntry,
  renameSave: mocks.renameSave,
}));

import { createSavePanel } from '@/ui/save-panel';

describe('save-panel', () => {
  beforeEach(() => {
    mocks.listSaves.mockReset();
    mocks.hasAutoSave.mockReset();
    mocks.loadAutoSave.mockReset();
    mocks.deleteSaveEntry.mockReset();
    mocks.renameSave.mockReset();
  });

  it('renders autosave as a visible saved-game entry in start mode', async () => {
    const container = installSavePanelDocumentMock();
    mocks.hasAutoSave.mockResolvedValue(true);
    mocks.listSaves.mockResolvedValue([
      {
        id: 'autosave',
        name: 'Autosave Turn 9',
        civType: 'egypt',
        turn: 9,
        lastPlayed: '2026-04-08T12:00:00.000Z',
        kind: 'autosave',
        gameMode: 'solo',
        gameTitle: 'Desert Run',
      },
    ]);

    await createSavePanel(container, {
      onNewGame: () => {},
      onContinue: () => {},
      onLoadSlot: () => {},
    });

    const rendered = (container as unknown as { children: Array<{ innerHTML: string }> }).children[0]?.innerHTML ?? '';
    expect(rendered).toContain('Saved Games');
    expect(rendered).toContain('Autosave Turn 9');
    expect(rendered).toContain('Desert Run');
  });

  it('keeps backup and import actions below the saved-games list', async () => {
    const container = installSavePanelDocumentMock();
    mocks.hasAutoSave.mockResolvedValue(true);
    mocks.listSaves.mockResolvedValue([
      {
        id: 'autosave',
        name: 'Autosave Turn 9',
        civType: 'egypt',
        turn: 9,
        lastPlayed: '2026-04-08T12:00:00.000Z',
        kind: 'autosave',
        gameMode: 'solo',
        gameTitle: 'Desert Run',
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

  it('routes autosave row deletion through the autosave delete path', async () => {
    const container = installSavePanelDocumentMock();
    mocks.hasAutoSave.mockResolvedValue(true);
    mocks.listSaves.mockResolvedValue([
      {
        id: 'autosave:game-1:9',
        name: 'Autosave Turn 9',
        civType: 'egypt',
        turn: 9,
        lastPlayed: '2026-04-08T12:00:00.000Z',
        kind: 'autosave',
        gameMode: 'solo',
        gameTitle: 'Desert Run',
      },
    ]);

    await createSavePanel(container, {
      onNewGame: () => {},
      onContinue: () => {},
      onLoadSlot: () => {},
    });

    const deleteButton = document.getElementById('delete-autosave:game-1:9') as { click: () => void };
    deleteButton.click();

    expect(mocks.deleteSaveEntry).toHaveBeenCalledWith('autosave:game-1:9', 'autosave');
  });

  it('loads the selected autosave row instead of routing through continue', async () => {
    const container = installSavePanelDocumentMock();
    const onContinue = vi.fn();
    const onLoadSlot = vi.fn();
    mocks.hasAutoSave.mockResolvedValue(true);
    mocks.listSaves.mockResolvedValue([
      {
        id: 'autosave:game-1:9',
        name: 'Autosave Turn 9',
        civType: 'egypt',
        turn: 9,
        lastPlayed: '2026-04-08T12:00:00.000Z',
        kind: 'autosave',
        gameMode: 'solo',
        gameTitle: 'Desert Run',
      },
    ]);

    await createSavePanel(container, {
      onNewGame: () => {},
      onContinue,
      onLoadSlot,
    });

    const loadButton = document.getElementById('load-autosave:game-1:9') as { click: () => void };
    loadButton.click();

    expect(onLoadSlot).toHaveBeenCalledWith('autosave:game-1:9');
    expect(onContinue).not.toHaveBeenCalled();
  });

  it('does not include autosaves as overwrite targets in save mode', async () => {
    const container = installSavePanelDocumentMock();
    mocks.hasAutoSave.mockResolvedValue(true);
    mocks.listSaves.mockResolvedValue([
      {
        id: 'autosave:game-1:9',
        name: 'Autosave Turn 9',
        civType: 'egypt',
        turn: 9,
        lastPlayed: '2026-04-08T12:00:00.000Z',
        kind: 'autosave',
        gameMode: 'solo',
        gameTitle: 'Desert Run',
      },
      {
        id: 'slot-1',
        name: 'Manual Save',
        civType: 'egypt',
        turn: 9,
        lastPlayed: '2026-04-08T12:00:00.000Z',
        kind: 'manual',
        gameMode: 'solo',
        gameTitle: 'Desert Run',
      },
    ]);

    await createSavePanel(container, {
      onNewGame: () => {},
      onContinue: () => {},
      onLoadSlot: () => {},
      onSaveToSlot: () => {},
    }, 'save');

    const rendered = (container as unknown as { children: Array<{ innerHTML: string }> }).children[0]?.innerHTML ?? '';
    expect(rendered).toContain('Manual Save');
    expect(rendered).not.toContain('Autosave Turn 9');
  });
});
