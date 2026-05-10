import type { SaveSlotMeta, GameState } from '@/core/types';
import { listSaves, listSaveEpics, deleteSaveEntry, hasAutoSave, type SaveEpic } from '@/storage/save-manager';
import { getSaveFileAdapter } from '@/platform/save-file-adapter';
import { exportMostRecentAutoSave, importSaveFromFile } from '@/storage/save-file-transfer';

interface SavePanelCallbacks {
  onNewGame: () => void;
  onContinue: () => void;
  onLoadSlot: (slotId: string) => void;
  onSaveToSlot?: (slotId: string, name: string) => void;
  onImportSave?: (state: GameState) => void;
}

export async function createSavePanel(
  container: HTMLElement,
  callbacks: SavePanelCallbacks,
  mode: 'start' | 'save' = 'start',
): Promise<void> {
  const existing = document.getElementById('save-panel');
  if (existing) existing.remove();

  const panel = document.createElement('div');
  panel.id = 'save-panel';
  panel.style.cssText = 'position:absolute;top:0;left:0;right:0;bottom:0;background:rgba(10,10,30,0.97);z-index:60;overflow-y:auto;padding:16px;';

  const epics = mode === 'start' ? await listSaveEpics() : [];
  const saves = mode === 'save'
    ? (await listSaves({ includeAutoSave: false })).filter(save => save.kind !== 'autosave')
    : [];
  const hasAuto = await hasAutoSave();
  let activeGameId: string | null = null;

  panel.innerHTML = `
    <div style="max-width:400px;margin:0 auto;">
      <h1 style="text-align:center;color:#e8c170;font-size:22px;margin-bottom:4px;">Conquestoria</h1>
      <p style="text-align:center;font-size:11px;opacity:0.5;margin-bottom:20px;">Build your civilization</p>
      ${mode === 'start' ? renderStartButtons(hasAuto) : ''}
      <div style="margin-top:16px;">
        <div id="save-panel-heading" style="font-size:14px;color:#e8c170;margin-bottom:8px;">${mode === 'save' ? 'Save Game' : 'Saved Games'}</div>
        ${mode === 'save' ? renderNewSlotInput() : ''}
        <div id="save-slots" style="display:flex;flex-direction:column;gap:8px;"></div>
      </div>
      ${mode === 'start' ? renderBackupButtons() : ''}
    </div>
  `;

  const saveSlots = panel.querySelector('#save-slots');
  const heading = panel.querySelector('#save-panel-heading');
  const renderEmpty = (message: string): void => {
    if (!saveSlots) return;
    const empty = document.createElement('div');
    empty.style.cssText = 'font-size:12px;opacity:0.5;text-align:center;padding:16px;';
    empty.textContent = message;
    saveSlots.appendChild(empty);
  };
  const renderSaveMode = (): void => {
    if (!saveSlots) return;
    saveSlots.textContent = '';
    if (saves.length === 0) {
      renderEmpty('No saved games yet');
      return;
    }
    for (const save of saves) {
      saveSlots.appendChild(createSlotCard(save, 'save'));
    }
  };
  const renderEpicList = (items: SaveEpic[]): void => {
    if (!saveSlots) return;
    activeGameId = null;
    if (heading) heading.textContent = 'Saved Games';
    saveSlots.textContent = '';
    if (items.length === 0) {
      renderEmpty('No saved games yet');
      return;
    }
    for (const epic of items) {
      saveSlots.appendChild(createEpicCard(epic));
    }
  };
  const renderEpicDetail = (epic: SaveEpic): void => {
    if (!saveSlots) return;
    activeGameId = epic.gameId;
    if (heading) heading.textContent = epic.title;
    saveSlots.textContent = '';
    const back = document.createElement('button');
    back.type = 'button';
    back.dataset.role = 'back-to-epics';
    back.style.cssText = 'align-self:flex-start;padding:6px 10px;border-radius:6px;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);color:white;font-size:11px;cursor:pointer;';
    back.textContent = 'Back to campaigns';
    saveSlots.appendChild(back);

    if (epic.saves.length === 0) {
      renderEmpty('No saved games yet');
      return;
    }
    for (const save of epic.saves) {
      saveSlots.appendChild(createSlotCard(save, 'start'));
    }
  };

  if (mode === 'save') renderSaveMode();
  else renderEpicList(epics);

  container.appendChild(panel);
  const status = panel.querySelector('#save-panel-status');
  const setStatus = (message: string): void => {
    if (status) {
      status.textContent = message;
    }
  };

  // Bind events
  panel.querySelector('#btn-new-game')?.addEventListener('click', () => {
    panel.remove();
    callbacks.onNewGame();
  });

  panel.querySelector('#btn-continue')?.addEventListener('click', () => {
    panel.remove();
    callbacks.onContinue();
  });

  // Save to new slot
  panel.querySelector('#btn-save-new')?.addEventListener('click', () => {
    const input = panel.querySelector('#new-slot-name') as HTMLInputElement | null;
    const name = input?.value.trim() || `Save ${Date.now()}`;
    const slotId = `slot-${Date.now()}`;
    panel.remove();
    callbacks.onSaveToSlot?.(slotId, name);
  });

  // Export save
  panel.querySelector('#btn-export-save')?.addEventListener('click', async () => {
    setStatus('');
    const adapter = await getSaveFileAdapter();
    const result = await exportMostRecentAutoSave(adapter);
    if (result.status === 'error') {
      setStatus(result.message);
    }
  });

  // Import save
  panel.querySelector('#btn-import-save')?.addEventListener('click', async () => {
    setStatus('');
    const adapter = await getSaveFileAdapter();
    const result = await importSaveFromFile(adapter);
    if (result.status === 'cancelled') {
      return;
    }
    if (result.status === 'error') {
      setStatus(result.message);
      return;
    }
    panel.remove();
    callbacks.onImportSave?.(result.state);
  });

  panel.addEventListener('click', async event => {
    const target = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>('button[data-role]');
    if (!target) return;

    const slotId = target.dataset.slotId;
    const slotKind = target.dataset.slotKind as 'manual' | 'autosave' | undefined;
    const gameId = target.dataset.gameId;
    const role = target.dataset.role;

    if (role === 'open-epic' && gameId) {
      const epic = epics.find(candidate => candidate.gameId === gameId);
      if (epic) renderEpicDetail(epic);
      return;
    }

    if (role === 'back-to-epics') {
      renderEpicList(epics);
      return;
    }

    if (role === 'load-slot' && slotId && slotKind) {
      panel.remove();
      if (slotKind === 'autosave' && slotId === 'autosave') {
        callbacks.onContinue();
        return;
      }
      callbacks.onLoadSlot(slotId);
      return;
    }

    if (role === 'overwrite-slot' && slotId) {
      panel.remove();
      callbacks.onSaveToSlot?.(slotId, target.dataset.slotName ?? '');
      return;
    }

    if (role === 'delete-slot' && slotId && slotKind) {
      await deleteSaveEntry(slotId, slotKind);
      if (mode === 'start') {
        const refreshedEpics = await listSaveEpics();
        epics.splice(0, epics.length, ...refreshedEpics);
        const refreshedActive = activeGameId ? epics.find(epic => epic.gameId === activeGameId) : null;
        if (refreshedActive) renderEpicDetail(refreshedActive);
        else renderEpicList(epics);
        return;
      }
      panel.remove();
      await createSavePanel(container, callbacks, mode);
    }
  });
}

function renderStartButtons(hasAuto: boolean): string {
  return `
    <div style="display:flex;gap:8px;justify-content:center;margin-bottom:12px;">
      <button id="btn-new-game" style="padding:12px 24px;border-radius:10px;background:#e8c170;border:none;color:#1a1a2e;font-weight:bold;font-size:14px;cursor:pointer;">New Game</button>
      ${hasAuto ? '<button id="btn-continue" style="padding:12px 24px;border-radius:10px;background:#4a90d9;border:none;color:white;font-weight:bold;font-size:14px;cursor:pointer;">Continue</button>' : ''}
    </div>
  `;
}

function renderBackupButtons(): string {
  return `
    <div style="margin-top:24px;border-top:1px solid rgba(255,255,255,0.08);padding-top:16px;">
      <div style="font-size:11px;color:rgba(255,255,255,0.4);text-align:center;margin-bottom:8px;">Backup &amp; Restore</div>
      <div style="display:flex;gap:8px;justify-content:center;">
        <button id="btn-export-save" style="padding:8px 16px;border-radius:8px;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);color:white;font-size:12px;cursor:pointer;">Export Save</button>
        <button id="btn-import-save" style="padding:8px 16px;border-radius:8px;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);color:white;font-size:12px;cursor:pointer;">Import Save</button>
      </div>
      <div id="save-panel-status" style="min-height:16px;margin-top:8px;text-align:center;font-size:11px;color:#f0a060;"></div>
    </div>
  `;
}

function renderNewSlotInput(): string {
  return `
    <div style="display:flex;gap:8px;margin-bottom:12px;">
      <input id="new-slot-name" type="text" placeholder="Save name..." style="flex:1;padding:8px 12px;border-radius:8px;border:1px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.1);color:white;font-size:13px;" />
      <button id="btn-save-new" style="padding:8px 16px;border-radius:8px;background:#6b9b4b;border:none;color:white;font-weight:bold;cursor:pointer;">Save</button>
    </div>
  `;
}

function createEpicCard(epic: SaveEpic): HTMLElement {
  const card = document.createElement('div');
  card.dataset.saveEpicCard = 'true';
  card.style.cssText = 'background:rgba(255,255,255,0.06);border-radius:10px;padding:12px;display:flex;align-items:center;gap:10px;';

  const content = document.createElement('div');
  content.style.cssText = 'flex:1;';

  const title = document.createElement('div');
  title.style.cssText = 'font-size:13px;font-weight:bold;';
  title.textContent = epic.title;
  content.appendChild(title);

  const date = new Date(epic.latestPlayed);
  const dateStr = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const meta = document.createElement('div');
  meta.style.cssText = 'font-size:11px;opacity:0.5;';
  const modeText = epic.gameMode === 'hotseat' ? `Hot Seat (${epic.playerNames?.join(', ') ?? ''})` : 'Solo';
  meta.textContent = `Latest turn ${epic.latestTurn} · ${epic.saves.length} save${epic.saves.length === 1 ? '' : 's'} · ${modeText} · ${dateStr}`;
  content.appendChild(meta);
  card.appendChild(content);

  const open = document.createElement('button');
  open.type = 'button';
  open.dataset.role = 'open-epic';
  open.dataset.gameId = epic.gameId;
  open.style.cssText = 'padding:6px 12px;border-radius:6px;background:#4a90d9;border:none;color:white;font-size:11px;cursor:pointer;';
  open.textContent = 'Open';
  card.appendChild(open);

  return card;
}

function createSlotCard(save: SaveSlotMeta, mode: 'start' | 'save'): HTMLElement {
  const card = document.createElement('div');
  card.dataset.saveSlotCard = 'true';
  card.style.cssText = 'background:rgba(255,255,255,0.06);border-radius:10px;padding:12px;display:flex;align-items:center;gap:10px;';

  const content = document.createElement('div');
  content.style.cssText = 'flex:1;';

  const name = document.createElement('div');
  name.style.cssText = 'font-size:13px;font-weight:bold;';
  name.textContent = save.name;
  content.appendChild(name);

  if (save.gameTitle) {
    const title = document.createElement('div');
    title.style.cssText = 'font-size:11px;color:#e8c170;opacity:0.9;';
    title.textContent = save.gameTitle;
    content.appendChild(title);
  }

  const date = new Date(save.lastPlayed);
  const dateStr = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const meta = document.createElement('div');
  meta.style.cssText = 'font-size:11px;opacity:0.5;';
  meta.textContent = `Turn ${save.turn} · ${save.gameMode === 'hotseat' ? `Hot Seat (${save.playerNames?.join(', ') ?? ''})` : save.civType} · ${dateStr}`;
  content.appendChild(meta);
  card.appendChild(content);

  const buttons = document.createElement('div');
  buttons.style.cssText = 'display:flex;gap:6px;';

  const primaryButton = document.createElement('button');
  primaryButton.dataset.role = mode === 'start' ? 'load-slot' : 'overwrite-slot';
  primaryButton.dataset.slotId = save.id;
  primaryButton.dataset.slotKind = save.kind === 'autosave' ? 'autosave' : 'manual';
  primaryButton.dataset.slotName = save.name;
  primaryButton.style.cssText = mode === 'start'
    ? 'padding:6px 12px;border-radius:6px;background:#4a90d9;border:none;color:white;font-size:11px;cursor:pointer;'
    : 'padding:6px 12px;border-radius:6px;background:#6b9b4b;border:none;color:white;font-size:11px;cursor:pointer;';
  primaryButton.textContent = mode === 'start' ? 'Load' : 'Overwrite';
  buttons.appendChild(primaryButton);

  const deleteButton = document.createElement('button');
  deleteButton.dataset.role = 'delete-slot';
  deleteButton.dataset.slotId = save.id;
  deleteButton.dataset.slotKind = save.kind === 'autosave' ? 'autosave' : 'manual';
  deleteButton.style.cssText = 'padding:6px 12px;border-radius:6px;background:#d94a4a;border:none;color:white;font-size:11px;cursor:pointer;';
  deleteButton.textContent = '✕';
  buttons.appendChild(deleteButton);

  card.appendChild(buttons);
  return card;
}
