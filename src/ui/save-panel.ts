import type { SaveSlotMeta, GameState } from '@/core/types';
import {
  listSaves,
  listSaveEpics,
  deleteSaveEntry,
  hasAutoSave,
  type SaveEntrySource,
  type SaveEpic,
} from '@/storage/save-manager';
import { getSaveFileAdapter } from '@/platform/save-file-adapter';
import { exportMostRecentAutoSave, importSaveFromFile } from '@/storage/save-file-transfer';
import { createGameButton } from '@/ui/ui-kit';
import { createGuardedAsyncAction } from '@/ui/guarded-async-action';

export interface SavePanelCallbacks {
  onNewGame: () => void;
  onContinue: (invoker: HTMLButtonElement) => Promise<void> | void;
  onLoadEntry: (source: SaveEntrySource, invoker: HTMLButtonElement) => Promise<void> | void;
  /**
   * Persists the save. The panel stays open while this is pending, shows a
   * retryable error if it rejects, and is closed by the panel itself (the one
   * owner) when it fulfils. Callers must NOT dismiss the panel.
   */
  onSaveToSlot?: (slotId: string, name: string) => Promise<void> | void;
  onImportSave?: (state: GameState, invoker: HTMLButtonElement) => Promise<void> | void;
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
        ${mode === 'save' ? renderSaveStatusRegions() : ''}
        <div id="save-slots" style="display:flex;flex-direction:column;gap:8px;"></div>
      </div>
      ${mode === 'start' ? renderBackupButtons() : ''}
    </div>
  `;
  if (mode === 'save') {
    const cancel = createGameButton('Cancel', 'ghost');
    cancel.dataset.role = 'cancel-save';
    cancel.style.width = '100%';
    cancel.style.marginTop = '16px';
    panel.querySelector('div')?.appendChild(cancel);
  }

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
  const runStartAction = async (
    invoker: HTMLButtonElement,
    action: () => Promise<void> | void,
  ): Promise<void> => {
    if (invoker.disabled) return;
    invoker.disabled = true;
    invoker.setAttribute('aria-busy', 'true');
    setStatus('');
    try {
      await action();
    } catch {
      if (panel.isConnected) {
        setStatus('Could not load this campaign. Please try again.');
      }
    } finally {
      if (invoker.isConnected) {
        invoker.disabled = false;
        invoker.removeAttribute('aria-busy');
      }
    }
  };

  // Bind events
  panel.querySelector('#btn-new-game')?.addEventListener('click', () => {
    panel.remove();
    callbacks.onNewGame();
  });

  panel.querySelector<HTMLButtonElement>('#btn-continue')?.addEventListener('click', event => {
    const invoker = event.currentTarget as HTMLButtonElement;
    void runStartAction(invoker, () => callbacks.onContinue(invoker));
  });

  let deletePending = false;

  // Guarded save (#1451): the panel stays up until the write fulfils, a
  // rejection keeps it (with the name, target and an alert) for retry/cancel,
  // and a second click while pending is ignored.
  let lastSaveInvoker: HTMLElement | null = null;
  const saveStatus = panel.querySelector<HTMLElement>('[data-role="save-status"]');
  const saveError = panel.querySelector<HTMLElement>('[data-role="save-error"]');
  const saveAction = mode === 'save' && saveStatus && saveError
    ? createGuardedAsyncAction({
        controls: () => Array.from(panel.querySelectorAll<HTMLButtonElement>('button')),
        busyTarget: panel,
        status: saveStatus,
        error: saveError,
        pendingMessage: 'Saving…',
        failureMessage: 'Could not save your game. Your campaign is unchanged. Please try again or cancel.',
        focusOnError: () => lastSaveInvoker,
      })
    : null;
  // The new-save target is fixed on the first attempt so a retry rewrites the
  // same slot instead of minting a second one.
  let newSlotTarget: { id: string; fallbackName: string } | null = null;

  const runSave = async (invoker: HTMLButtonElement, slotId: string, name: string): Promise<void> => {
    if (!saveAction || saveAction.isPending() || deletePending) return;
    lastSaveInvoker = invoker;
    const saved = await saveAction.run(() => callbacks.onSaveToSlot?.(slotId, name));
    if (saved && panel.isConnected) panel.remove();
  };

  panel.querySelector<HTMLButtonElement>('#btn-save-new')?.addEventListener('click', event => {
    const invoker = event.currentTarget as HTMLButtonElement;
    const input = panel.querySelector<HTMLInputElement>('#new-slot-name');
    newSlotTarget ??= { id: `slot-${Date.now()}`, fallbackName: `Save ${Date.now()}` };
    const name = input?.value.trim() || newSlotTarget.fallbackName;
    void runSave(invoker, newSlotTarget.id, name);
  });

  panel.querySelector<HTMLButtonElement>('[data-role="cancel-save"]')?.addEventListener('click', () => {
    if (saveAction?.isPending()) return;
    panel.remove();
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
  panel.querySelector<HTMLButtonElement>('#btn-import-save')?.addEventListener('click', event => {
    const invoker = event.currentTarget as HTMLButtonElement;
    void runStartAction(invoker, async () => {
      const adapter = await getSaveFileAdapter();
      const result = await importSaveFromFile(adapter);
      if (result.status === 'cancelled') {
        return;
      }
      if (result.status === 'error') {
        setStatus(result.message);
        return;
      }
      await callbacks.onImportSave?.(result.state, invoker);
    });
  });

  // Destructive confirmation (#1458): a save is only removed after a second,
  // deliberate confirmation tied to the exact selected row.
  const cancelDeleteConfirmation = (region: HTMLElement): void => {
    const card = region.closest<HTMLElement>('[data-save-slot-card="true"]');
    region.remove();
    card?.querySelector<HTMLButtonElement>('[data-role="delete-slot"]')?.focus();
  };

  const openDeleteConfirmation = (card: HTMLElement, deletion: PendingDeletion): void => {
    panel.querySelectorAll<HTMLElement>('[data-role="delete-confirm"]').forEach(node => node.remove());
    const region = createDeleteConfirmation(deletion);
    card.appendChild(region);
    region.querySelector<HTMLButtonElement>('[data-role="cancel-delete-slot"]')?.focus();
  };

  const performDelete = async (
    confirmButton: HTMLButtonElement,
    deletion: { id: string; kind: 'manual' | 'autosave' },
  ): Promise<void> => {
    if (deletePending || saveAction?.isPending()) return;
    const region = confirmButton.closest<HTMLElement>('[data-role="delete-confirm"]');
    if (!region) return;

    deletePending = true;
    const cancelButton = region.querySelector<HTMLButtonElement>('[data-role="cancel-delete-slot"]');
    const progress = region.querySelector<HTMLElement>('[data-role="delete-progress"]');
    const error = region.querySelector<HTMLElement>('[data-role="delete-error"]');
    confirmButton.disabled = true;
    confirmButton.setAttribute('aria-busy', 'true');
    if (cancelButton) cancelButton.disabled = true;
    if (progress) progress.hidden = false;
    if (error) {
      error.hidden = true;
      error.textContent = '';
    }
    region.setAttribute('aria-busy', 'true');

    try {
      await deleteSaveEntry(deletion.id, deletion.kind);
    } catch {
      // Keep the row, surface a retryable error, and never imply success.
      if (panel.isConnected) {
        if (error) {
          error.textContent = 'Could not delete this save. Please try again.';
          error.hidden = false;
        }
        confirmButton.disabled = false;
        confirmButton.removeAttribute('aria-busy');
        if (cancelButton) cancelButton.disabled = false;
        if (progress) progress.hidden = true;
        region.setAttribute('aria-busy', 'false');
      }
      deletePending = false;
      return;
    }

    deletePending = false;

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
  };

  panel.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    const region = panel.querySelector<HTMLElement>('[data-role="delete-confirm"]');
    if (!region) return;
    event.preventDefault();
    cancelDeleteConfirmation(region);
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
      await runStartAction(
        target,
        () => callbacks.onLoadEntry({ id: slotId, kind: slotKind }, target),
      );
      return;
    }

    if (role === 'overwrite-slot' && slotId) {
      await runSave(target, slotId, target.dataset.slotName ?? '');
      return;
    }

    if (role === 'delete-slot' && slotId && slotKind) {
      const card = target.closest<HTMLElement>('[data-save-slot-card="true"]');
      if (!card) return;
      openDeleteConfirmation(card, {
        id: slotId,
        kind: slotKind,
        name: target.dataset.slotName ?? '',
        turn: target.dataset.slotTurn ?? '',
        gameTitle: target.dataset.slotGameTitle,
      });
      return;
    }

    if (role === 'cancel-delete-slot') {
      const region = target.closest<HTMLElement>('[data-role="delete-confirm"]');
      if (region) cancelDeleteConfirmation(region);
      return;
    }

    if (role === 'confirm-delete-slot' && slotId && slotKind) {
      await performDelete(target, { id: slotId, kind: slotKind });
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

function renderSaveStatusRegions(): string {
  return `
    <div id="save-panel-status" data-role="save-status" role="status" aria-live="polite" style="min-height:16px;margin-bottom:8px;font-size:12px;color:#e8c170;"></div>
    <div data-role="save-error" role="alert" hidden style="margin-bottom:8px;font-size:12px;color:#f0a060;"></div>
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
  card.style.cssText = 'background:rgba(255,255,255,0.06);border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:8px;';

  const row = document.createElement('div');
  row.style.cssText = 'display:flex;align-items:center;gap:10px;';

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
  row.appendChild(content);

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
  deleteButton.dataset.slotName = save.name;
  deleteButton.dataset.slotTurn = String(save.turn);
  if (save.gameTitle) deleteButton.dataset.slotGameTitle = save.gameTitle;
  deleteButton.style.cssText = 'padding:6px 12px;border-radius:6px;background:#d94a4a;border:none;color:white;font-size:11px;cursor:pointer;';
  deleteButton.textContent = '✕';
  buttons.appendChild(deleteButton);

  row.appendChild(buttons);
  card.appendChild(row);
  return card;
}

interface PendingDeletion {
  id: string;
  kind: 'manual' | 'autosave';
  name: string;
  turn: string;
  gameTitle?: string;
}

/**
 * Inline, per-row destructive confirmation (#1458). The player must make a
 * second, deliberate choice before a save is removed; the copy names the exact
 * campaign, save, kind and turn so a same-named sibling can never be hit by
 * accident. Focus, aria labels, an alert region and a retry path keep the flow
 * usable with keyboard, screen reader and touch.
 */
function createDeleteConfirmation(deletion: PendingDeletion): HTMLElement {
  const region = document.createElement('div');
  region.dataset.role = 'delete-confirm';
  region.setAttribute('role', 'group');
  region.setAttribute('tabindex', '-1');
  region.setAttribute(
    'aria-label',
    `Confirm deletion of ${deletion.name}, turn ${deletion.turn}`,
  );
  region.style.cssText = 'display:flex;flex-direction:column;gap:8px;border:1px solid rgba(217,74,74,0.6);border-radius:8px;padding:8px;background:rgba(217,74,74,0.12);';

  const kindLabel = deletion.kind === 'autosave' ? 'autosave' : 'manual save';
  const message = document.createElement('div');
  message.dataset.role = 'delete-confirm-message';
  message.style.cssText = 'font-size:12px;line-height:1.4;';
  const fromTitle = deletion.gameTitle ? ` from "${deletion.gameTitle}"` : '';
  message.textContent = `Delete "${deletion.name}"${fromTitle} (${kindLabel}, turn ${deletion.turn})? This cannot be undone.`;
  region.appendChild(message);

  const actions = document.createElement('div');
  actions.style.cssText = 'display:flex;gap:6px;';

  const cancelButton = createGameButton('Cancel', 'ghost');
  cancelButton.dataset.role = 'cancel-delete-slot';

  const confirmButton = createGameButton('Delete this save', 'danger');
  confirmButton.dataset.role = 'confirm-delete-slot';
  confirmButton.dataset.slotId = deletion.id;
  confirmButton.dataset.slotKind = deletion.kind;
  confirmButton.setAttribute(
    'aria-label',
    `Delete this save: ${deletion.name}, turn ${deletion.turn}`,
  );

  actions.appendChild(cancelButton);
  actions.appendChild(confirmButton);
  region.appendChild(actions);

  const progress = document.createElement('div');
  progress.dataset.role = 'delete-progress';
  progress.setAttribute('role', 'status');
  progress.style.cssText = 'font-size:12px;color:#e8c170;';
  progress.hidden = true;
  progress.textContent = 'Deleting…';
  region.appendChild(progress);

  const error = document.createElement('div');
  error.dataset.role = 'delete-error';
  error.setAttribute('role', 'alert');
  error.style.cssText = 'font-size:12px;color:#f0a060;';
  error.hidden = true;
  region.appendChild(error);

  return region;
}
