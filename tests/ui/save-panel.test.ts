// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  listSaves: vi.fn(),
  listSaveEpics: vi.fn(),
  hasAutoSave: vi.fn(),
  loadAutoSave: vi.fn(),
  deleteSaveEntry: vi.fn(),
  renameSave: vi.fn(),
  getSaveFileAdapter: vi.fn(),
  exportMostRecentAutoSave: vi.fn(),
  importSaveFromFile: vi.fn(),
}));

vi.mock('@/storage/save-manager', () => ({
  listSaves: mocks.listSaves,
  listSaveEpics: mocks.listSaveEpics,
  hasAutoSave: mocks.hasAutoSave,
  loadAutoSave: mocks.loadAutoSave,
  deleteSaveEntry: mocks.deleteSaveEntry,
  renameSave: mocks.renameSave,
}));

vi.mock('@/platform/save-file-adapter', () => ({
  getSaveFileAdapter: mocks.getSaveFileAdapter,
}));

vi.mock('@/storage/save-file-transfer', () => ({
  exportMostRecentAutoSave: mocks.exportMostRecentAutoSave,
  importSaveFromFile: mocks.importSaveFromFile,
}));

import { createSavePanel } from '@/ui/save-panel';

describe('save-panel', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    mocks.listSaves.mockReset();
    mocks.listSaveEpics.mockReset();
    mocks.hasAutoSave.mockReset();
    mocks.loadAutoSave.mockReset();
    mocks.deleteSaveEntry.mockReset();
    mocks.renameSave.mockReset();
    mocks.getSaveFileAdapter.mockReset();
    mocks.exportMostRecentAutoSave.mockReset();
    mocks.importSaveFromFile.mockReset();
    mocks.getSaveFileAdapter.mockResolvedValue({ adapter: 'mock' });
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  function mountContainer(): HTMLElement {
    const container = document.createElement('div');
    document.body.appendChild(container);
    return container;
  }

  it('renders listed saves into the mounted save-slots container in start mode', async () => {
    const container = mountContainer();
    mocks.hasAutoSave.mockResolvedValue(true);
    mocks.listSaveEpics.mockResolvedValue([
      {
        gameId: 'game-1',
        title: 'Desert Run',
        latestTurn: 9,
        latestPlayed: '2026-04-08T12:00:00.000Z',
        gameMode: 'solo',
        saves: [
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
        ],
      },
    ]);

    await createSavePanel(container, {
      onNewGame: () => {},
      onContinue: () => {},
      onLoadSlot: () => {},
    });

    expect(document.querySelectorAll('#save-panel [data-save-epic-card="true"]')).toHaveLength(1);
    expect(document.body.textContent).not.toContain('Autosave Turn 9');
    expect(document.body.textContent).toContain('Desert Run');
  });

  it('renders only manual saves as overwrite targets in save mode', async () => {
    const container = mountContainer();
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

    expect(document.body.textContent).toContain('Manual Save');
    expect(document.body.textContent).not.toContain('Autosave Turn 9');
  });

  it('routes autosave row deletion through the autosave delete path', async () => {
    const container = mountContainer();
    mocks.hasAutoSave.mockResolvedValue(true);
    mocks.listSaveEpics.mockResolvedValue([
      {
        gameId: 'game-1',
        title: 'Desert Run',
        latestTurn: 9,
        latestPlayed: '2026-04-08T12:00:00.000Z',
        gameMode: 'solo',
        saves: [
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
        ],
      },
    ]);

    await createSavePanel(container, {
      onNewGame: () => {},
      onContinue: () => {},
      onLoadSlot: () => {},
    });

    (document.querySelector('[data-role="open-epic"]') as HTMLButtonElement).click();
    (document.querySelector('[data-role="delete-slot"]') as HTMLButtonElement).click();

    expect(mocks.deleteSaveEntry).toHaveBeenCalledWith('autosave:game-1:9', 'autosave');
  });

  it('loads the clicked autosave row instead of routing through continue', async () => {
    const container = mountContainer();
    const onContinue = vi.fn();
    const onLoadSlot = vi.fn();
    mocks.hasAutoSave.mockResolvedValue(true);
    mocks.listSaveEpics.mockResolvedValue([
      {
        gameId: 'game-1',
        title: 'Desert Run',
        latestTurn: 9,
        latestPlayed: '2026-04-08T12:00:00.000Z',
        gameMode: 'solo',
        saves: [
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
        ],
      },
    ]);

    await createSavePanel(container, {
      onNewGame: () => {},
      onContinue,
      onLoadSlot,
    });

    (document.querySelector('[data-role="open-epic"]') as HTMLButtonElement).click();
    (document.querySelector('[data-role="load-slot"]') as HTMLButtonElement).click();

    expect(onLoadSlot).toHaveBeenCalledWith('autosave:game-1:9');
    expect(onContinue).not.toHaveBeenCalled();
  });

  it('rerenders the list after deleting one row and keeps the remaining rows visible', async () => {
    const container = mountContainer();
    mocks.hasAutoSave.mockResolvedValue(false);
    mocks.listSaveEpics
      .mockResolvedValueOnce([
        {
          gameId: 'game-1',
          title: 'Desert Run',
          latestTurn: 10,
          latestPlayed: '2026-04-08T12:05:00.000Z',
          gameMode: 'solo',
          saves: [
            {
              id: 'slot-2',
              name: 'Manual Save B',
              civType: 'egypt',
              turn: 10,
              lastPlayed: '2026-04-08T12:05:00.000Z',
              kind: 'manual',
              gameMode: 'solo',
              gameTitle: 'Desert Run',
            },
            {
              id: 'slot-1',
              name: 'Manual Save A',
              civType: 'egypt',
              turn: 9,
              lastPlayed: '2026-04-08T12:00:00.000Z',
              kind: 'manual',
              gameMode: 'solo',
              gameTitle: 'Desert Run',
            },
          ],
        },
      ])
      .mockResolvedValueOnce([
        {
          gameId: 'game-1',
          title: 'Desert Run',
          latestTurn: 10,
          latestPlayed: '2026-04-08T12:05:00.000Z',
          gameMode: 'solo',
          saves: [
            {
              id: 'slot-2',
              name: 'Manual Save B',
              civType: 'egypt',
              turn: 10,
              lastPlayed: '2026-04-08T12:05:00.000Z',
              kind: 'manual',
              gameMode: 'solo',
              gameTitle: 'Desert Run',
            },
          ],
        },
      ]);

    await createSavePanel(container, {
      onNewGame: () => {},
      onContinue: () => {},
      onLoadSlot: () => {},
    });

    (document.querySelector('[data-role="open-epic"]') as HTMLButtonElement).click();
    (document.querySelector('[data-role="delete-slot"][data-slot-id="slot-1"]') as HTMLButtonElement).click();
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(mocks.deleteSaveEntry).toHaveBeenCalledWith('slot-1', 'manual');
    expect(document.querySelectorAll('#save-panel [data-save-slot-card="true"]')).toHaveLength(1);
    expect(document.body.textContent).toContain('Manual Save B');
    expect(document.body.textContent).not.toContain('Manual Save A');
  });

  it('renders user-controlled save labels as literal text', async () => {
    const container = mountContainer();
    mocks.hasAutoSave.mockResolvedValue(false);
    mocks.listSaveEpics.mockResolvedValue([
      {
        gameId: 'game-1',
        title: '<span id="evil-title">Injected</span>',
        latestTurn: 9,
        latestPlayed: '2026-04-08T12:00:00.000Z',
        gameMode: 'solo',
        saves: [
          {
            id: 'slot-1',
            name: '<span id="evil-save">Owned</span>',
            civType: 'egypt',
            turn: 9,
            lastPlayed: '2026-04-08T12:00:00.000Z',
            kind: 'manual',
            gameMode: 'solo',
            gameTitle: '<span id="evil-title">Injected</span>',
          },
        ],
      },
    ]);

    await createSavePanel(container, {
      onNewGame: () => {},
      onContinue: () => {},
      onLoadSlot: () => {},
    });

    expect(document.getElementById('evil-save')).toBeNull();
    expect(document.getElementById('evil-title')).toBeNull();
    expect(document.body.textContent).toContain('<span id="evil-title">Injected</span>');

    (document.querySelector('[data-role="open-epic"]') as HTMLButtonElement).click();

    expect(document.getElementById('evil-save')).toBeNull();
    expect(document.body.textContent).toContain('<span id="evil-save">Owned</span>');
  });

  it('renders hot-seat player names as plain text instead of markup', async () => {
    const container = mountContainer();
    mocks.hasAutoSave.mockResolvedValue(false);
    mocks.listSaveEpics.mockResolvedValue([
      {
        gameId: 'game-1',
        title: 'Hot Seat Run',
        latestTurn: 9,
        latestPlayed: '2026-04-08T12:00:00.000Z',
        gameMode: 'hotseat',
        playerNames: ['Alice', '<span id="evil-player">Bob</span>'],
        saves: [
          {
            id: 'slot-1',
            name: 'Manual Save',
            civType: 'hotseat',
            turn: 9,
            lastPlayed: '2026-04-08T12:00:00.000Z',
            kind: 'manual',
            gameMode: 'hotseat',
            playerNames: ['Alice', '<span id="evil-player">Bob</span>'],
            gameTitle: 'Hot Seat Run',
          },
        ],
      },
    ]);

    await createSavePanel(container, {
      onNewGame: () => {},
      onContinue: () => {},
      onLoadSlot: () => {},
    });

    expect(document.getElementById('evil-player')).toBeNull();
    expect(document.body.textContent).toContain('<span id="evil-player">Bob</span>');
  });

  it('shows an inline error when exporting without an available save', async () => {
    const container = mountContainer();
    mocks.hasAutoSave.mockResolvedValue(false);
    mocks.listSaveEpics.mockResolvedValue([]);
    mocks.exportMostRecentAutoSave.mockResolvedValue({ status: 'error', message: 'No save to export.' });

    await createSavePanel(container, {
      onNewGame: () => {},
      onContinue: () => {},
      onLoadSlot: () => {},
    });

    (document.querySelector('#btn-export-save') as HTMLButtonElement).click();
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(document.body.textContent).toContain('No save to export.');
    expect(document.querySelector('#save-panel')).not.toBeNull();
  });

  it('keeps the panel open without an error when import is cancelled', async () => {
    const container = mountContainer();
    mocks.hasAutoSave.mockResolvedValue(false);
    mocks.listSaveEpics.mockResolvedValue([]);
    mocks.importSaveFromFile.mockResolvedValue({ status: 'cancelled' });

    await createSavePanel(container, {
      onNewGame: () => {},
      onContinue: () => {},
      onLoadSlot: () => {},
    });

    (document.querySelector('#btn-import-save') as HTMLButtonElement).click();
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(document.querySelector('#save-panel')).not.toBeNull();
    expect(document.querySelector('#save-panel-status')?.textContent).toBe('');
  });

  it('keeps the panel open and shows an error when import data is invalid', async () => {
    const container = mountContainer();
    mocks.hasAutoSave.mockResolvedValue(false);
    mocks.listSaveEpics.mockResolvedValue([]);
    mocks.importSaveFromFile.mockResolvedValue({
      status: 'error',
      message: 'Invalid save file: missing required game state fields.',
    });

    await createSavePanel(container, {
      onNewGame: () => {},
      onContinue: () => {},
      onLoadSlot: () => {},
    });

    (document.querySelector('#btn-import-save') as HTMLButtonElement).click();
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(document.querySelector('#save-panel')).not.toBeNull();
    expect(document.body.textContent).toContain('Invalid save file: missing required game state fields.');
  });

  it('imports a valid save through the shared callback and closes the panel', async () => {
    const container = mountContainer();
    const onImportSave = vi.fn();
    const importedState = {
      turn: 30,
      currentPlayer: 'player',
      civilizations: { player: { civType: 'egypt' } },
    } as any;
    mocks.hasAutoSave.mockResolvedValue(false);
    mocks.listSaveEpics.mockResolvedValue([]);
    mocks.importSaveFromFile.mockResolvedValue({ status: 'success', state: importedState });

    await createSavePanel(container, {
      onNewGame: () => {},
      onContinue: () => {},
      onLoadSlot: () => {},
      onImportSave,
    });

    (document.querySelector('#btn-import-save') as HTMLButtonElement).click();
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(onImportSave).toHaveBeenCalledWith(importedState);
    expect(document.querySelector('#save-panel')).toBeNull();
  });

  it('shows epics first and opens a turn list for the selected epic', async () => {
    const container = mountContainer();
    mocks.hasAutoSave.mockResolvedValue(true);
    mocks.listSaveEpics.mockResolvedValue([
      {
        gameId: 'game-a',
        title: 'Daddy Alex',
        latestTurn: 9,
        latestPlayed: '2026-05-10T01:00:00Z',
        gameMode: 'solo',
        saves: [
          { id: 'autosave:game-a:9', name: 'Autosave Turn 9', civType: 'rome', turn: 9, lastPlayed: '2026-05-10T01:00:00Z', kind: 'autosave', gameMode: 'solo', gameId: 'game-a', gameTitle: 'Daddy Alex' },
          { id: 'autosave:game-a:8', name: 'Autosave Turn 8', civType: 'rome', turn: 8, lastPlayed: '2026-05-10T00:00:00Z', kind: 'autosave', gameMode: 'solo', gameId: 'game-a', gameTitle: 'Daddy Alex' },
        ],
      },
      {
        gameId: 'game-b',
        title: 'Tiny Epic',
        latestTurn: 4,
        latestPlayed: '2026-05-09T00:00:00Z',
        gameMode: 'solo',
        saves: [
          { id: 'slot-b', name: 'Manual Save', civType: 'egypt', turn: 4, lastPlayed: '2026-05-09T00:00:00Z', kind: 'manual', gameMode: 'solo', gameId: 'game-b', gameTitle: 'Tiny Epic' },
        ],
      },
    ]);
    const onLoadSlot = vi.fn();

    await createSavePanel(container, { onNewGame: vi.fn(), onContinue: vi.fn(), onLoadSlot });

    expect(document.body.textContent).toContain('Daddy Alex');
    expect(document.body.textContent).toContain('Tiny Epic');
    expect(document.body.textContent).not.toContain('Autosave Turn 8');

    (document.querySelector('[data-role="open-epic"][data-game-id="game-a"]') as HTMLButtonElement).click();

    expect(document.body.textContent).toContain('Back to campaigns');
    expect(document.body.textContent).toContain('Autosave Turn 9');
    expect(document.body.textContent).toContain('Autosave Turn 8');
  });

  it('loads an exact save id from the opened epic detail', async () => {
    const container = mountContainer();
    const onLoadSlot = vi.fn();
    mocks.hasAutoSave.mockResolvedValue(true);
    mocks.listSaveEpics.mockResolvedValue([
      {
        gameId: 'game-a',
        title: 'Daddy Alex',
        latestTurn: 9,
        latestPlayed: '2026-05-10T01:00:00Z',
        gameMode: 'solo',
        saves: [
          { id: 'autosave:game-a:9', name: 'Autosave Turn 9', civType: 'rome', turn: 9, lastPlayed: '2026-05-10T01:00:00Z', kind: 'autosave', gameMode: 'solo', gameId: 'game-a', gameTitle: 'Daddy Alex' },
        ],
      },
    ]);

    await createSavePanel(container, { onNewGame: vi.fn(), onContinue: vi.fn(), onLoadSlot });
    (document.querySelector('[data-role="open-epic"][data-game-id="game-a"]') as HTMLButtonElement).click();
    (document.querySelector('[data-role="load-slot"][data-slot-id="autosave:game-a:9"]') as HTMLButtonElement).click();

    expect(onLoadSlot).toHaveBeenCalledWith('autosave:game-a:9');
  });

  it('returns from an epic detail to the campaign list', async () => {
    const container = mountContainer();
    mocks.hasAutoSave.mockResolvedValue(true);
    mocks.listSaveEpics.mockResolvedValue([
      { gameId: 'game-a', title: 'Daddy Alex', latestTurn: 9, latestPlayed: '2026-05-10T01:00:00Z', gameMode: 'solo', saves: [
        { id: 'autosave:game-a:9', name: 'Autosave Turn 9', civType: 'rome', turn: 9, lastPlayed: '2026-05-10T01:00:00Z', kind: 'autosave', gameMode: 'solo', gameId: 'game-a', gameTitle: 'Daddy Alex' },
      ] },
      { gameId: 'game-b', title: 'Tiny Epic', latestTurn: 4, latestPlayed: '2026-05-09T00:00:00Z', gameMode: 'solo', saves: [
        { id: 'slot-b', name: 'Manual Save', civType: 'egypt', turn: 4, lastPlayed: '2026-05-09T00:00:00Z', kind: 'manual', gameMode: 'solo', gameId: 'game-b', gameTitle: 'Tiny Epic' },
      ] },
    ]);

    await createSavePanel(container, { onNewGame: vi.fn(), onContinue: vi.fn(), onLoadSlot: vi.fn() });
    (document.querySelector('[data-role="open-epic"][data-game-id="game-a"]') as HTMLButtonElement).click();
    expect(document.body.textContent).toContain('Back to campaigns');

    (document.querySelector('[data-role="back-to-epics"]') as HTMLButtonElement).click();

    expect(document.body.textContent).toContain('Daddy Alex');
    expect(document.body.textContent).toContain('Tiny Epic');
    expect(document.body.textContent).not.toContain('Autosave Turn 9');
  });

  it('refreshes the opened epic detail after deleting one turn save', async () => {
    const container = mountContainer();
    mocks.hasAutoSave.mockResolvedValue(true);
    mocks.listSaveEpics
      .mockResolvedValueOnce([
        { gameId: 'game-a', title: 'Daddy Alex', latestTurn: 9, latestPlayed: '2026-05-10T01:00:00Z', gameMode: 'solo', saves: [
          { id: 'autosave:game-a:9', name: 'Autosave Turn 9', civType: 'rome', turn: 9, lastPlayed: '2026-05-10T01:00:00Z', kind: 'autosave', gameMode: 'solo', gameId: 'game-a', gameTitle: 'Daddy Alex' },
          { id: 'autosave:game-a:8', name: 'Autosave Turn 8', civType: 'rome', turn: 8, lastPlayed: '2026-05-10T00:00:00Z', kind: 'autosave', gameMode: 'solo', gameId: 'game-a', gameTitle: 'Daddy Alex' },
        ] },
      ])
      .mockResolvedValueOnce([
        { gameId: 'game-a', title: 'Daddy Alex', latestTurn: 8, latestPlayed: '2026-05-10T00:00:00Z', gameMode: 'solo', saves: [
          { id: 'autosave:game-a:8', name: 'Autosave Turn 8', civType: 'rome', turn: 8, lastPlayed: '2026-05-10T00:00:00Z', kind: 'autosave', gameMode: 'solo', gameId: 'game-a', gameTitle: 'Daddy Alex' },
        ] },
      ]);

    await createSavePanel(container, { onNewGame: vi.fn(), onContinue: vi.fn(), onLoadSlot: vi.fn() });
    (document.querySelector('[data-role="open-epic"][data-game-id="game-a"]') as HTMLButtonElement).click();
    (document.querySelector('[data-role="delete-slot"][data-slot-id="autosave:game-a:9"]') as HTMLButtonElement).click();
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(mocks.deleteSaveEntry).toHaveBeenCalledWith('autosave:game-a:9', 'autosave');
    expect(document.body.textContent).toContain('Autosave Turn 8');
    expect(document.body.textContent).not.toContain('Autosave Turn 9');
    expect(document.body.textContent).toContain('Back to campaigns');
  });
});
