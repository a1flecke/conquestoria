// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
    document.body.innerHTML = '';
    mocks.listSaves.mockReset();
    mocks.hasAutoSave.mockReset();
    mocks.loadAutoSave.mockReset();
    mocks.deleteSaveEntry.mockReset();
    mocks.renameSave.mockReset();
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

    expect(document.querySelectorAll('#save-panel [data-save-slot-card="true"]')).toHaveLength(1);
    expect(document.body.textContent).toContain('Autosave Turn 9');
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

    (document.querySelector('[data-role="delete-slot"]') as HTMLButtonElement).click();

    expect(mocks.deleteSaveEntry).toHaveBeenCalledWith('autosave:game-1:9', 'autosave');
  });

  it('loads the clicked autosave row instead of routing through continue', async () => {
    const container = mountContainer();
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

    (document.querySelector('[data-role="load-slot"]') as HTMLButtonElement).click();

    expect(onLoadSlot).toHaveBeenCalledWith('autosave:game-1:9');
    expect(onContinue).not.toHaveBeenCalled();
  });

  it('rerenders the list after deleting one row and keeps the remaining rows visible', async () => {
    const container = mountContainer();
    mocks.hasAutoSave.mockResolvedValue(false);
    mocks.listSaves
      .mockResolvedValueOnce([
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
      ])
      .mockResolvedValueOnce([
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
      ]);

    await createSavePanel(container, {
      onNewGame: () => {},
      onContinue: () => {},
      onLoadSlot: () => {},
    });

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
    mocks.listSaves.mockResolvedValue([
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
    ]);

    await createSavePanel(container, {
      onNewGame: () => {},
      onContinue: () => {},
      onLoadSlot: () => {},
    });

    expect(document.getElementById('evil-save')).toBeNull();
    expect(document.getElementById('evil-title')).toBeNull();
    expect(document.body.textContent).toContain('<span id="evil-save">Owned</span>');
  });

  it('renders hot-seat player names as plain text instead of markup', async () => {
    const container = mountContainer();
    mocks.hasAutoSave.mockResolvedValue(false);
    mocks.listSaves.mockResolvedValue([
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
    ]);

    await createSavePanel(container, {
      onNewGame: () => {},
      onContinue: () => {},
      onLoadSlot: () => {},
    });

    expect(document.getElementById('evil-player')).toBeNull();
    expect(document.body.textContent).toContain('<span id="evil-player">Bob</span>');
  });
});
