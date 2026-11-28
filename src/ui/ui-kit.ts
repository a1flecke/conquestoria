export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'close';

/** Exported so callers that need to repaint a button's variant after
 * creation (e.g. a self-repainting selection control) can reuse the exact
 * same style values instead of duplicating them. */
export const VARIANT_STYLES: Record<ButtonVariant, Partial<CSSStyleDeclaration>> = {
  primary: {
    background: '#e8c170',
    color: '#1f1a12',
    fontWeight: 'bold',
    border: 'none',
  },
  secondary: {
    background: 'rgba(255,255,255,0.08)',
    color: '#f4f1e8',
    border: '1px solid rgba(232,193,112,0.45)',
  },
  ghost: {
    background: 'transparent',
    color: 'rgba(244,241,232,0.7)',
    border: '1px solid rgba(255,255,255,0.2)',
  },
  danger: {
    background: '#b91c1c',
    color: 'white',
    fontWeight: 'bold',
    border: 'none',
  },
  close: {
    background: 'transparent',
    color: 'rgba(255,255,255,0.6)',
    border: 'none',
  },
};

export function createGameButton(
  label: string,
  variant: ButtonVariant,
  options?: { disabled?: boolean; type?: 'button' | 'submit' },
): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.textContent = label;
  btn.type = options?.type ?? 'button';

  const variantStyle = VARIANT_STYLES[variant];
  Object.assign(btn.style, {
    minHeight: '44px',
    minWidth: '44px',
    padding: '10px 16px',
    borderRadius: '8px',
    cursor: 'pointer',
    font: 'inherit',
    opacity: '1',
    ...variantStyle,
  });

  if (options?.disabled) {
    setButtonDisabled(btn, true);
  }

  return btn;
}

export function setButtonDisabled(btn: HTMLButtonElement, disabled: boolean): void {
  btn.disabled = disabled;
  if (disabled) {
    btn.style.opacity = '0.45';
    btn.style.cursor = 'not-allowed';
    btn.style.pointerEvents = 'none';
  } else {
    btn.style.opacity = '1';
    btn.style.cursor = 'pointer';
    btn.style.pointerEvents = '';
  }
}

export function createFloatingButton(id: string, text: string, title: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.id = id;
  button.type = 'button';
  button.textContent = text;
  button.title = title;
  // An icon-only button is announced by its glyph's emoji name ("scroll") unless it is given a name. A button whose
  // visible text is a word keeps that word as its name (label in name), with the title as its description.
  if (!/\p{L}/u.test(text)) button.setAttribute('aria-label', title);
  button.style.cssText = 'min-height:44px;min-width:40px;background:rgba(0,0,0,0.6);border:1px solid rgba(255,255,255,0.2);border-radius:8px;color:white;font-size:14px;padding:4px 8px;cursor:pointer;';
  button.addEventListener('click', () => onClick());
  return button;
}
