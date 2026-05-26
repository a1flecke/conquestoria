import type { GameState, HexCoord } from '@/core/types';
import {
  getWonderCodexViewModel,
  type WonderCodexAction,
  type WonderCodexCatalogEntry,
  type WonderCodexPageViewModel,
  type WonderCodexResponsiveMode,
} from '@/systems/wonder-codex/presentation';
import { createGameButton } from '@/ui/ui-kit';
import { createWonderCodexPage } from '@/ui/wonder-codex-page';

export interface WonderCodexPanelCallbacks {
  onViewOnMap: (coord: HexCoord, wonderId: string) => void;
  onOpenCity: (cityId: string) => void;
  onClose: () => void;
  initialWonderId?: string;
  mode?: WonderCodexResponsiveMode;
  reducedMotion?: boolean;
}

function defaultMode(): WonderCodexResponsiveMode {
  return typeof window !== 'undefined' && window.innerWidth < 680 ? 'mobile' : 'desktop';
}

function appendText(parent: HTMLElement, tag: keyof HTMLElementTagNameMap, text: string, style?: string): HTMLElement {
  const element = document.createElement(tag);
  element.textContent = text;
  if (style) element.style.cssText = style;
  parent.appendChild(element);
  return element;
}

function styleCatalogButton(button: HTMLButtonElement, selected: boolean): void {
  button.style.width = '100%';
  button.style.textAlign = 'left';
  button.style.display = 'grid';
  button.style.gridTemplateColumns = '34px 1fr';
  button.style.gap = '8px';
  button.style.alignItems = 'center';
  if (selected) {
    button.style.boxShadow = '0 0 0 2px rgba(232,193,112,0.34) inset';
  }
}

export function createWonderCodexPanel(
  container: HTMLElement,
  state: GameState,
  callbacks: WonderCodexPanelCallbacks,
): HTMLElement {
  container.querySelector('#wonder-codex-panel')?.remove();
  container.querySelector('#wonder-atlas-panel')?.remove();

  const mode = callbacks.mode ?? defaultMode();
  let selectedWonderId = callbacks.initialWonderId;
  let mobileShowingCatalog = mode === 'mobile' && !callbacks.initialWonderId;

  const panel = document.createElement('section');
  panel.id = 'wonder-codex-panel';
  panel.style.cssText = 'position:absolute;inset:56px 12px 80px;z-index:42;background:rgba(10,13,18,0.97);border:1px solid rgba(232,193,112,0.42);border-radius:8px;color:#f8f1df;box-shadow:0 20px 70px rgba(0,0,0,0.55);display:flex;flex-direction:column;overflow:hidden;';

  const header = document.createElement('header');
  header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:12px;padding:12px 14px;border-bottom:1px solid rgba(255,255,255,0.10);';
  const titleBlock = document.createElement('div');
  appendText(titleBlock, 'h2', 'Wonder Codex', 'margin:0;font-size:19px;letter-spacing:0;');
  appendText(titleBlock, 'p', 'Stories, real-world context, and safe records for discovered marvels.', 'margin:2px 0 0;font-size:12px;opacity:0.72;');
  header.appendChild(titleBlock);
  const close = createGameButton('Close', 'ghost');
  close.dataset.codexClose = 'true';
  close.addEventListener('click', () => {
    panel.remove();
    callbacks.onClose();
  });
  header.appendChild(close);
  panel.appendChild(header);

  const body = document.createElement('div');
  body.style.cssText = 'min-height:0;flex:1;display:grid;overflow:hidden;';
  panel.appendChild(body);

  function handleAction(action: WonderCodexAction): void {
    if (action.type === 'view-map' && action.coord) callbacks.onViewOnMap(action.coord, action.wonderId);
    if (action.type === 'open-city' && action.cityId) callbacks.onOpenCity(action.cityId);
  }

  function renderCatalog(entries: WonderCodexCatalogEntry[]): HTMLElement {
    const catalog = document.createElement('nav');
    catalog.dataset.codexCatalog = 'true';
    catalog.style.cssText = 'min-width:0;overflow:auto;padding:12px;display:flex;flex-direction:column;gap:8px;border-right:1px solid rgba(255,255,255,0.08);';
    if (entries.length === 0) {
      appendText(catalog, 'p', 'No wonders recorded yet.', 'margin:0;font-size:13px;opacity:0.74;');
      return catalog;
    }
    for (const entry of entries) {
      const button = createGameButton('', 'secondary');
      button.dataset.codexEntryId = entry.id;
      styleCatalogButton(button, entry.id === selectedWonderId);
      const medallion = document.createElement('span');
      medallion.textContent = entry.visual.medallionGlyph;
      medallion.style.cssText = `width:34px;height:34px;border-radius:50%;display:grid;place-items:center;background:${entry.visual.palette.base};color:#fff;box-shadow:0 0 10px ${entry.visual.palette.glow};`;
      button.appendChild(medallion);
      const copy = document.createElement('span');
      appendText(copy, 'strong', entry.title, 'display:block;font-size:13px;');
      appendText(copy, 'span', entry.stateLabel, 'display:block;font-size:11px;opacity:0.72;margin-top:2px;');
      if (entry.rivalIntelCount && entry.rivalIntelBadgeLabel) {
        const badge = appendText(copy, 'span', entry.rivalIntelBadgeLabel, 'display:inline-block;margin-top:5px;padding:2px 6px;border:1px solid rgba(232,193,112,0.36);border-radius:999px;font-size:10px;color:#f4d188;background:rgba(232,193,112,0.10);');
        badge.dataset.rivalIntelBadge = 'true';
      }
      button.appendChild(copy);
      button.addEventListener('click', () => {
        selectedWonderId = entry.id;
        mobileShowingCatalog = false;
        render();
      });
      catalog.appendChild(button);
    }
    return catalog;
  }

  function renderReader(page: WonderCodexPageViewModel | null): HTMLElement {
    const reader = document.createElement('main');
    reader.dataset.codexReader = 'true';
    reader.style.cssText = 'min-width:0;overflow:auto;padding:16px;';
    if (mode === 'mobile') {
      const back = createGameButton('Back to Catalog', 'ghost');
      back.dataset.codexCatalogBack = 'true';
      back.style.marginBottom = '12px';
      back.addEventListener('click', () => {
        mobileShowingCatalog = true;
        render();
      });
      reader.appendChild(back);
    }
    if (!page) {
      appendText(reader, 'p', 'No wonders recorded yet.', 'margin:0;opacity:0.74;');
      return reader;
    }
    reader.appendChild(createWonderCodexPage(page, {
      mode,
      reducedMotion: callbacks.reducedMotion,
      onAction: handleAction,
      onSelectRelated: wonderId => {
        selectedWonderId = wonderId;
        mobileShowingCatalog = false;
        render();
      },
    }));
    return reader;
  }

  function render(): void {
    body.textContent = '';
    const model = getWonderCodexViewModel(state, state.currentPlayer, { mode, initialWonderId: selectedWonderId });
    selectedWonderId = model.selectedPage?.id ?? selectedWonderId;
    if (mode === 'mobile') {
      body.style.gridTemplateColumns = '1fr';
      body.appendChild(mobileShowingCatalog ? renderCatalog(model.catalogEntries) : renderReader(model.selectedPage));
      return;
    }
    body.style.gridTemplateColumns = 'minmax(220px,300px) 1fr';
    body.append(renderCatalog(model.catalogEntries), renderReader(model.selectedPage));
  }

  render();
  container.appendChild(panel);
  return panel;
}
