import type { HomelandBand, HomelandChoice } from '@/core/types/homeland';
import { createGameButton } from '@/ui/ui-kit';

/**
 * The turn-1 homeland choice (#1837, phase C): the homelands a player may settle, each a card with what the land is
 * like. Choosing one moves the starting units straight away and the camera follows, so the map itself is the preview;
 * the player can change their mind until the first city is founded. A card sits at the bottom of the screen rather than
 * covering the map. All text is set with textContent.
 */

export interface HomelandPanelHandlers {
  /** The player picked a homeland other than the current one. */
  onChoose: (index: number) => void;
  onClose: () => void;
}

const BAND_LABEL: Record<HomelandBand, string> = { lean: 'Lean', fair: 'Fair', rich: 'Rich' };

export function createHomelandPanel(
  container: HTMLElement,
  choice: HomelandChoice,
  handlers: HomelandPanelHandlers,
): HTMLElement {
  document.getElementById('homeland-panel')?.remove();

  const panel = document.createElement('div');
  panel.id = 'homeland-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Choose your homeland');
  panel.style.cssText = 'position:absolute;left:50%;bottom:96px;transform:translateX(-50%);z-index:60;width:min(94vw,760px);max-height:60vh;overflow-y:auto;background:rgba(24,22,16,0.97);border:1px solid rgba(232,193,112,0.45);border-radius:16px;padding:14px;color:#f4f1e8;box-sizing:border-box;';

  const title = document.createElement('h2');
  title.textContent = 'Choose your homeland';
  title.style.cssText = 'margin:0 0 4px;font-size:18px;color:#e8c170;';
  panel.appendChild(title);

  const hint = document.createElement('p');
  hint.textContent = 'Each is a good place to begin. Pick one and your settler moves there; you can change your mind until you found your first city.';
  hint.style.cssText = 'margin:0 0 10px;font-size:13px;opacity:0.85;';
  panel.appendChild(hint);

  const list = document.createElement('div');
  list.style.cssText = 'display:flex;flex-wrap:wrap;gap:10px;';
  panel.appendChild(list);

  choice.options.forEach((option, index) => {
    const current = index === choice.selected;
    const card = document.createElement('div');
    card.dataset.homelandOption = String(index);
    card.style.cssText = `flex:1 1 200px;min-width:180px;padding:10px;border-radius:12px;border:1px solid ${current ? 'rgba(232,193,112,0.9)' : 'rgba(255,255,255,0.14)'};background:${current ? 'rgba(232,193,112,0.1)' : 'rgba(255,255,255,0.03)'};display:flex;flex-direction:column;gap:6px;`;

    const name = document.createElement('div');
    name.textContent = option.character;
    name.style.cssText = 'font-weight:bold;font-size:15px;';
    card.appendChild(name);

    const summary = document.createElement('div');
    summary.textContent = option.summary;
    summary.style.cssText = 'font-size:12px;opacity:0.85;flex:1;';
    card.appendChild(summary);

    const yields = document.createElement('div');
    yields.textContent = `Food: ${BAND_LABEL[option.food]} · Production: ${BAND_LABEL[option.production]}`;
    yields.style.cssText = 'font-size:12px;color:#e8c170;';
    card.appendChild(yields);

    const button = createGameButton(current ? 'Your homeland' : 'Settle here', current ? 'secondary' : 'primary');
    button.setAttribute('aria-pressed', String(current));
    button.style.touchAction = 'manipulation';
    button.addEventListener('click', () => {
      if (!current) handlers.onChoose(index);
    });
    card.appendChild(button);

    list.appendChild(card);
  });

  const done = createGameButton('Done', 'ghost');
  done.style.cssText += 'margin-top:10px;';
  done.addEventListener('click', () => {
    handlers.onClose();
    panel.remove();
  });
  panel.appendChild(done);

  container.appendChild(panel);
  return panel;
}
