import { CIV_DEFINITIONS } from '@/systems/civ-definitions';
import { createRng } from '@/systems/map-generator';

export interface CivSelectCallbacks {
  onSelect: (civId: string) => void;
}

export interface CivSelectOptions {
  disabledCivs?: string[];
  headerText?: string;
}

export function createCivSelectPanel(
  container: HTMLElement,
  callbacks: CivSelectCallbacks,
  options?: CivSelectOptions,
): HTMLElement {
  const disabledCivs = options?.disabledCivs ?? [];
  const headerText = options?.headerText ?? 'Choose Your Civilization';
  const panel = document.createElement('div');
  panel.id = 'civ-select';
  panel.style.cssText = 'position:absolute;top:0;left:0;right:0;bottom:0;background:rgba(15,15,25,0.98);z-index:50;overflow-y:auto;padding:16px;display:flex;flex-direction:column;align-items:center;';

  let selectedCiv: string | null = null;

  let html = `
    <h1 style="font-size:22px;color:#e8c170;margin:24px 0 8px;text-align:center;">${headerText}</h1>
    <p style="font-size:13px;opacity:0.6;margin-bottom:24px;text-align:center;">Each civilization has a unique bonus that shapes your strategy.</p>
    <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:12px;max-width:400px;width:100%;">
  `;

  for (const civ of CIV_DEFINITIONS) {
    const isDisabled = disabledCivs.includes(civ.id);
    const disabledStyle = isDisabled ? 'opacity:0.3;pointer-events:none;' : '';
    html += `
      <div class="civ-card" data-civ-id="${civ.id}" style="background:rgba(255,255,255,0.08);border:2px solid transparent;border-radius:12px;padding:14px;cursor:pointer;transition:border-color 0.2s;${disabledStyle}">
        <div style="width:100%;height:4px;background:${civ.color};border-radius:2px;margin-bottom:10px;"></div>
        <div style="font-weight:bold;font-size:15px;color:${civ.color};">${civ.name}</div>
        <div style="font-size:12px;color:#e8c170;margin-top:4px;">${civ.bonusName}</div>
        <div style="font-size:11px;opacity:0.7;margin-top:4px;">${civ.bonusDescription}</div>
        <div style="font-size:10px;opacity:0.4;margin-top:6px;">${civ.personality.traits.join(', ')}</div>
      </div>
    `;
  }

  html += '</div>';
  html += `
    <div style="margin-top:20px;display:flex;gap:12px;">
      <button id="civ-random" style="padding:10px 20px;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);border-radius:8px;color:white;cursor:pointer;font-size:13px;">Random</button>
      <button id="civ-start" style="padding:10px 24px;background:rgba(232,193,112,0.3);border:2px solid #e8c170;border-radius:8px;color:#e8c170;cursor:pointer;font-size:14px;font-weight:bold;opacity:0.4;" disabled>Start Game</button>
    </div>
  `;

  panel.innerHTML = html;
  container.appendChild(panel);

  const cards = panel.querySelectorAll('.civ-card');
  const startBtn = panel.querySelector('#civ-start') as HTMLButtonElement;

  cards.forEach(card => {
    card.addEventListener('click', () => {
      const civId = (card as HTMLElement).dataset.civId!;
      selectedCiv = civId;

      cards.forEach(c => {
        (c as HTMLElement).style.borderColor = 'transparent';
      });
      (card as HTMLElement).style.borderColor = '#e8c170';

      startBtn.disabled = false;
      startBtn.style.opacity = '1';
    });
  });

  panel.querySelector('#civ-random')?.addEventListener('click', () => {
    const available = CIV_DEFINITIONS.filter(c => !disabledCivs.includes(c.id));
    if (available.length === 0) return;
    const pickRng = createRng(`civ-pick-${Date.now()}`);
    const randomIdx = Math.floor(pickRng() * available.length);
    selectedCiv = available[randomIdx].id;

    cards.forEach(c => {
      const id = (c as HTMLElement).dataset.civId;
      (c as HTMLElement).style.borderColor = id === selectedCiv ? '#e8c170' : 'transparent';
    });

    startBtn.disabled = false;
    startBtn.style.opacity = '1';
  });

  startBtn.addEventListener('click', () => {
    if (selectedCiv) {
      panel.remove();
      callbacks.onSelect(selectedCiv);
    }
  });

  return panel;
}
