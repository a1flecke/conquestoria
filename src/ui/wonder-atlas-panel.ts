import type { GameState, HexCoord } from '@/core/types';
import { getWonderAtlasEntries, type NaturalWonderAtlasEntry, type WonderAtlasEntry } from '@/systems/wonder-atlas-presentation';
import { createWonderVignette } from '@/ui/wonder-vignette';

export interface WonderAtlasCallbacks {
  onViewOnMap: (coord: HexCoord, wonderId: string) => void;
  onClose: () => void;
  initialWonderId?: string;
  reducedMotion?: boolean;
}

type AtlasTab = 'natural' | 'legendary';

function appendText(parent: HTMLElement, tag: keyof HTMLElementTagNameMap, text: string, style?: string): HTMLElement {
  const el = document.createElement(tag);
  el.textContent = text;
  if (style) el.style.cssText = style;
  parent.appendChild(el);
  return el;
}

function createButton(text: string, style: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = text;
  button.style.cssText = `min-height:44px;background:rgba(232,193,112,0.16);color:#f5e4b3;border:1px solid rgba(232,193,112,0.42);border-radius:8px;padding:8px 12px;cursor:pointer;${style}`;
  return button;
}

function createEntryButton(entry: WonderAtlasEntry, selected: boolean): HTMLButtonElement {
  const button = createButton('', selected ? 'background:rgba(232,193,112,0.28);' : 'background:rgba(255,255,255,0.06);color:#f7f1df;');
  button.dataset.wonderEntry = entry.wonderId;
  button.dataset.wonderKind = entry.kind;
  button.style.display = 'grid';
  button.style.gridTemplateColumns = '34px 1fr';
  button.style.gap = '8px';
  button.style.alignItems = 'center';
  button.style.width = '100%';
  button.style.textAlign = 'left';

  const medallion = document.createElement('span');
  medallion.textContent = entry.visual.medallionGlyph;
  medallion.style.cssText = `width:34px;height:34px;border-radius:50%;display:grid;place-items:center;background:${entry.visual.palette.base};color:#fff;box-shadow:0 0 10px ${entry.visual.palette.glow};`;
  button.appendChild(medallion);

  const copy = document.createElement('span');
  const title = document.createElement('strong');
  title.textContent = entry.kind === 'legendary' ? entry.maskedLabel : entry.name;
  title.style.cssText = 'display:block;font-size:13px;';
  copy.appendChild(title);

  const subtitle = document.createElement('span');
  subtitle.textContent = entry.kind === 'legendary' ? entry.name : entry.locationLabel;
  subtitle.style.cssText = 'display:block;font-size:11px;opacity:0.72;margin-top:2px;';
  copy.appendChild(subtitle);
  button.appendChild(copy);

  return button;
}

function naturalEntries(entries: WonderAtlasEntry[]): NaturalWonderAtlasEntry[] {
  return entries.filter((entry): entry is NaturalWonderAtlasEntry => entry.kind === 'natural');
}

function clearElement(el: HTMLElement): void {
  el.textContent = '';
}

export function createWonderAtlasPanel(
  container: HTMLElement,
  state: GameState,
  callbacks: WonderAtlasCallbacks,
): HTMLElement {
  container.querySelector('#wonder-atlas-panel')?.remove();

  const entries = getWonderAtlasEntries(state, state.currentPlayer);
  let activeTab: AtlasTab = callbacks.initialWonderId
    && entries.some(entry => entry.kind === 'legendary' && entry.wonderId === callbacks.initialWonderId)
    ? 'legendary'
    : 'natural';
  let selectedWonderId = callbacks.initialWonderId
    ?? naturalEntries(entries)[0]?.wonderId
    ?? entries.find(entry => entry.kind === 'legendary')?.wonderId
    ?? null;

  const panel = document.createElement('section');
  panel.id = 'wonder-atlas-panel';
  panel.style.cssText = 'position:absolute;top:72px;right:12px;bottom:92px;width:min(720px,calc(100vw - 24px));z-index:35;background:rgba(17,20,28,0.96);border:1px solid rgba(232,193,112,0.36);border-radius:10px;color:#f8f1df;box-shadow:0 18px 42px rgba(0,0,0,0.42);display:flex;flex-direction:column;overflow:hidden;';

  const header = document.createElement('header');
  header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;border-bottom:1px solid rgba(255,255,255,0.10);';
  const titleBlock = document.createElement('div');
  appendText(titleBlock, 'h2', 'Wonder Atlas', 'margin:0;font-size:18px;');
  appendText(titleBlock, 'p', 'Discovered marvels and masked legendary ambitions.', 'margin:2px 0 0;font-size:12px;opacity:0.72;');
  header.appendChild(titleBlock);
  const close = createButton('Close', 'background:rgba(255,255,255,0.08);color:#fff;border-color:rgba(255,255,255,0.24);');
  close.dataset.wonderAtlasClose = 'true';
  close.addEventListener('click', () => {
    panel.remove();
    callbacks.onClose();
  });
  header.appendChild(close);
  panel.appendChild(header);

  const tabs = document.createElement('div');
  tabs.style.cssText = 'display:flex;gap:8px;padding:10px 14px;border-bottom:1px solid rgba(255,255,255,0.08);';
  panel.appendChild(tabs);

  const body = document.createElement('div');
  body.style.cssText = 'display:grid;grid-template-columns:minmax(210px,280px) 1fr;min-height:0;flex:1;';
  panel.appendChild(body);

  const list = document.createElement('div');
  list.style.cssText = 'padding:12px;overflow:auto;border-right:1px solid rgba(255,255,255,0.08);display:flex;flex-direction:column;gap:8px;';
  body.appendChild(list);

  const detail = document.createElement('div');
  detail.dataset.wonderDetail = 'true';
  detail.style.cssText = 'padding:16px;overflow:auto;display:flex;gap:16px;align-items:flex-start;';
  body.appendChild(detail);

  function visibleEntries(): WonderAtlasEntry[] {
    return entries.filter(entry => activeTab === 'natural' ? entry.kind === 'natural' : entry.kind === 'legendary');
  }

  function selectedEntry(): WonderAtlasEntry | null {
    return entries.find(entry => entry.wonderId === selectedWonderId) ?? visibleEntries()[0] ?? null;
  }

  function renderTabs(): void {
    clearElement(tabs);
    for (const [tab, label] of [['natural', 'Known Natural'], ['legendary', 'Legendary']] as const) {
      const button = createButton(label, activeTab === tab ? 'background:rgba(232,193,112,0.28);' : 'background:rgba(255,255,255,0.05);color:#f8f1df;border-color:rgba(255,255,255,0.18);');
      button.dataset.atlasTab = tab;
      button.addEventListener('click', () => {
        activeTab = tab;
        selectedWonderId = visibleEntries()[0]?.wonderId ?? null;
        render();
      });
      tabs.appendChild(button);
    }
  }

  function renderList(): void {
    clearElement(list);
    const visible = visibleEntries();
    if (visible.length === 0 && activeTab === 'natural') {
      appendText(list, 'p', 'No natural wonders discovered yet.', 'font-size:13px;opacity:0.74;margin:0;');
      return;
    }

    for (const entry of visible) {
      const button = createEntryButton(entry, entry.wonderId === selectedWonderId);
      button.addEventListener('click', () => {
        selectedWonderId = entry.wonderId;
        render();
      });
      list.appendChild(button);
    }
  }

  function renderDetail(): void {
    clearElement(detail);
    const entry = selectedEntry();
    if (!entry) {
      appendText(detail, 'p', activeTab === 'natural' ? 'No natural wonders discovered yet.' : 'No legendary wonders recorded.', 'margin:0;opacity:0.72;');
      return;
    }

    detail.appendChild(createWonderVignette(entry, { reducedMotion: callbacks.reducedMotion }));
    const copy = document.createElement('div');
    copy.style.cssText = 'min-width:0;display:flex;flex-direction:column;gap:8px;';
    appendText(copy, 'h3', entry.name, 'margin:0;font-size:20px;');

    if (entry.kind === 'natural') {
      appendText(copy, 'p', entry.locationLabel, 'margin:0;font-size:12px;color:#e8c170;');
      appendText(copy, 'p', entry.effectSummary, 'margin:0;font-size:13px;line-height:1.45;');
      if (entry.coord) {
        const view = createButton('View on map', 'align-self:flex-start;margin-top:6px;');
        view.dataset.viewWonderOnMap = entry.wonderId;
        view.addEventListener('click', () => callbacks.onViewOnMap(entry.coord!, entry.wonderId));
        copy.appendChild(view);
      }
    } else {
      appendText(copy, 'p', entry.maskedLabel, 'margin:0;font-size:12px;color:#e8c170;');
      appendText(copy, 'p', 'A legendary ambition recorded for future construction and completion presence.', 'margin:0;font-size:13px;line-height:1.45;opacity:0.78;');
    }

    detail.appendChild(copy);
  }

  function render(): void {
    renderTabs();
    renderList();
    renderDetail();
  }

  render();
  container.appendChild(panel);
  return panel;
}
