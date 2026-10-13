/**
 * Caption for the keyboard map cursor (#1459). One polite live region that is
 * also visible text, so a sighted keyboard user and a screen-reader user get the
 * same description plus the same hint for what the keys do. It never takes
 * pointer events, so it cannot cover a map tap.
 */
export interface KeyboardCursorStatus {
  announce(text: string): void;
  hide(): void;
}

const HINT = 'Arrows move, Shift+Up/Down turn the other way, Enter selects or acts, Esc stops.';

export function createKeyboardCursorStatus(layer: HTMLElement): KeyboardCursorStatus {
  const region = document.createElement('div');
  region.id = 'keyboard-cursor-status';
  region.setAttribute('role', 'status');
  region.setAttribute('aria-live', 'polite');
  region.hidden = true;
  region.style.cssText = 'position:absolute;left:50%;transform:translateX(-50%);bottom:104px;max-width:min(92vw,520px);padding:6px 12px;border-radius:8px;background:rgba(10,10,20,0.92);border:1px solid #e8c170;color:#fff;font-size:13px;line-height:1.35;text-align:center;pointer-events:none;z-index:11;';

  const description = document.createElement('div');
  const hint = document.createElement('div');
  hint.textContent = HINT;
  hint.style.cssText = 'font-size:11px;opacity:0.75;margin-top:2px;';
  region.append(description, hint);
  layer.appendChild(region);

  return {
    announce(text: string): void {
      description.textContent = text;
      region.hidden = false;
    },
    hide(): void {
      region.hidden = true;
      description.textContent = '';
    },
  };
}
