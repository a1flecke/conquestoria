import type { BestiaryEntry } from '@/systems/beast-presentation';
import type { FactionPalette } from '@/renderer/sprites/sprite-system';
import { createGameButton } from '@/ui/ui-kit';
import { UNIT_SPRITE_CATALOG } from '@/renderer/sprites/sprite-catalog';

export interface BestiaryPanelCallbacks {
  onClose: () => void;
  slayerNameFor: (civId: string) => string;
}

const NEUTRAL_PALETTE: FactionPalette = { dark: '#555', mid: '#888', bright: '#bbb', trim: '#999' };

const TIER_LABELS: Record<number, string> = {
  1: 'Dangerous', 2: 'Fearsome', 3: 'Terrifying', 4: 'Legendary',
};

export function createBestiaryPanel(
  container: HTMLElement,
  entries: BestiaryEntry[],
  callbacks: BestiaryPanelCallbacks,
): HTMLElement {
  container.querySelector('#bestiary-panel')?.remove();

  const panel = document.createElement('div');
  panel.id = 'bestiary-panel';
  panel.style.cssText = 'position:absolute;inset:0;background:rgba(12,12,24,0.96);z-index:40;padding:16px;overflow:auto;';

  const header = document.createElement('div');
  header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;';
  const title = document.createElement('h2');
  title.textContent = 'Bestiary';
  title.style.cssText = 'font-size:20px;color:#e8c170;margin:0;';
  header.appendChild(title);
  const closeButton = createGameButton('✕', 'close');
  closeButton.dataset.action = 'close';
  closeButton.setAttribute('aria-label', 'Close panel');
  closeButton.addEventListener('click', () => { panel.remove(); callbacks.onClose(); });
  header.appendChild(closeButton);
  panel.appendChild(header);

  const intro = document.createElement('p');
  intro.textContent = 'Legendary beasts of this land. Sight them to learn their nature; slay them to claim their hoards.';
  intro.style.cssText = 'font-size:13px;opacity:0.8;margin:0 0 16px;';
  panel.appendChild(intro);

  for (const entry of entries) {
    const card = document.createElement('section');
    card.dataset.bestiaryEntry = entry.lairId;
    card.style.cssText = 'display:flex;gap:12px;align-items:center;margin-bottom:12px;background:rgba(255,255,255,0.06);border-radius:10px;padding:12px;';

    const art = document.createElement('div');
    art.style.cssText = 'width:72px;height:72px;flex:none;display:flex;align-items:center;justify-content:center;';
    if (entry.status === 'unknown') {
      art.textContent = '❓';
      art.style.fontSize = '40px';
    } else if (entry.unitType) {
      const sprite = UNIT_SPRITE_CATALOG[entry.unitType];
      const holder = document.createElement('div');
      holder.style.cssText = 'width:72px;height:72px;';
      // Sprite SVGs are module-authored strings, never game/user input — safe for innerHTML.
      holder.innerHTML = sprite({ palette: NEUTRAL_PALETTE, svgOnly: true });
      art.appendChild(holder);
    }
    card.appendChild(art);

    const body = document.createElement('div');
    if (entry.status === 'unknown') {
      const label = document.createElement('div');
      label.textContent = 'Unknown Beast';
      label.style.cssText = 'font-size:15px;color:#e8c170;';
      body.appendChild(label);
      const hint = document.createElement('div');
      hint.textContent = entry.hint;
      hint.style.cssText = 'font-size:12px;opacity:0.75;font-style:italic;';
      body.appendChild(hint);
    } else {
      const label = document.createElement('div');
      label.textContent = entry.name ?? '';
      label.style.cssText = 'font-size:15px;color:#e8c170;';
      body.appendChild(label);
      const statusLine = document.createElement('div');
      if (entry.status === 'slain') {
        const slayer = entry.slainBy ? callbacks.slayerNameFor(entry.slainBy) : '';
        statusLine.textContent = `Slain — by ${slayer || 'an unknown power'}, turn ${entry.slainTurn ?? '?'}`;
        statusLine.style.cssText = 'font-size:12px;color:#9ad17b;';
      } else {
        statusLine.textContent = `Sighted · ${TIER_LABELS[entry.tier ?? 1]}`;
        statusLine.style.cssText = 'font-size:12px;color:#d1a35a;';
      }
      body.appendChild(statusLine);
      const hint = document.createElement('div');
      hint.textContent = entry.hint;
      hint.style.cssText = 'font-size:12px;opacity:0.75;font-style:italic;';
      body.appendChild(hint);
    }
    card.appendChild(body);
    panel.appendChild(card);
  }

  if (entries.length === 0) {
    const empty = document.createElement('p');
    empty.textContent = 'No legendary beasts dwell in this land.';
    empty.style.cssText = 'font-size:13px;opacity:0.7;';
    panel.appendChild(empty);
  }

  container.appendChild(panel);
  return panel;
}
