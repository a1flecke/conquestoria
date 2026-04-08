import type { SaveSlotMeta, GameState } from '@/core/types';
import { listSaves, deleteSaveEntry, hasAutoSave, loadAutoSave } from '@/storage/save-manager';

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

  const saves = await listSaves({ includeAutoSave: mode === 'start' });
  const hasAuto = await hasAutoSave();
  const displaySaves = mode === 'save'
    ? saves.filter(save => save.kind !== 'autosave')
    : saves;

  panel.innerHTML = `
    <div style="max-width:400px;margin:0 auto;">
      <h1 style="text-align:center;color:#e8c170;font-size:22px;margin-bottom:4px;">Conquestoria</h1>
      <p style="text-align:center;font-size:11px;opacity:0.5;margin-bottom:20px;">Build your civilization</p>
      ${mode === 'start' ? renderStartButtons(hasAuto) : ''}
      <div style="margin-top:16px;">
        <div style="font-size:14px;color:#e8c170;margin-bottom:8px;">${mode === 'save' ? 'Save Game' : 'Saved Games'}</div>
        ${mode === 'save' ? renderNewSlotInput() : ''}
        ${displaySaves.length === 0 ? '<div style="font-size:12px;opacity:0.5;text-align:center;padding:16px;">No saved games yet</div>' : ''}
        <div id="save-slots" style="display:flex;flex-direction:column;gap:8px;"></div>
      </div>
      ${mode === 'start' ? renderBackupButtons() : ''}
    </div>
  `;

  const saveSlots = document.getElementById('save-slots');
  if (saveSlots) {
    saveSlots.innerHTML = '';
    for (const save of displaySaves) {
      saveSlots.appendChild(createSlotCard(save, mode));
    }
  }

  container.appendChild(panel);

  // Bind events
  document.getElementById('btn-new-game')?.addEventListener('click', () => {
    panel.remove();
    callbacks.onNewGame();
  });

  document.getElementById('btn-continue')?.addEventListener('click', () => {
    panel.remove();
    callbacks.onContinue();
  });

  // Save to new slot
  document.getElementById('btn-save-new')?.addEventListener('click', () => {
    const input = document.getElementById('new-slot-name') as HTMLInputElement;
    const name = input?.value.trim() || `Save ${Date.now()}`;
    const slotId = `slot-${Date.now()}`;
    panel.remove();
    callbacks.onSaveToSlot?.(slotId, name);
  });

  // Export save
  document.getElementById('btn-export-save')?.addEventListener('click', async () => {
    const state = await loadAutoSave();
    if (!state) { alert('No save to export'); return; }
    const blob = new Blob([JSON.stringify(state)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `conquestoria-save-turn${state.turn}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  // Import save
  document.getElementById('btn-import-save')?.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const state = JSON.parse(e.target?.result as string) as GameState;
          panel.remove();
          callbacks.onImportSave?.(state);
        } catch {
          alert('Invalid save file');
        }
      };
      reader.readAsText(file);
    });
    input.click();
  });

  // Slot buttons
  for (const save of displaySaves) {
    const saveKind = save.kind === 'autosave' ? 'autosave' : 'manual';
    document.getElementById(`load-${save.id}`)?.addEventListener('click', () => {
      panel.remove();
      if (saveKind === 'autosave' && save.id === 'autosave') {
        callbacks.onContinue();
        return;
      }
      callbacks.onLoadSlot(save.id);
    });
    document.getElementById(`save-${save.id}`)?.addEventListener('click', () => {
      panel.remove();
      callbacks.onSaveToSlot?.(save.id, save.name);
    });
    document.getElementById(`delete-${save.id}`)?.addEventListener('click', async () => {
      await deleteSaveEntry(save.id, saveKind);
      panel.remove();
      createSavePanel(container, callbacks, mode);
    });
  }
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

function createSlotCard(save: SaveSlotMeta, mode: 'start' | 'save'): HTMLElement {
  const card = document.createElement('div');
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
  primaryButton.id = `${mode === 'start' ? 'load' : 'save'}-${save.id}`;
  primaryButton.style.cssText = mode === 'start'
    ? 'padding:6px 12px;border-radius:6px;background:#4a90d9;border:none;color:white;font-size:11px;cursor:pointer;'
    : 'padding:6px 12px;border-radius:6px;background:#6b9b4b;border:none;color:white;font-size:11px;cursor:pointer;';
  primaryButton.textContent = mode === 'start' ? 'Load' : 'Overwrite';
  buttons.appendChild(primaryButton);

  const deleteButton = document.createElement('button');
  deleteButton.id = `delete-${save.id}`;
  deleteButton.style.cssText = 'padding:6px 12px;border-radius:6px;background:#d94a4a;border:none;color:white;font-size:11px;cursor:pointer;';
  deleteButton.textContent = '✕';
  buttons.appendChild(deleteButton);

  card.appendChild(buttons);
  return card;
}
