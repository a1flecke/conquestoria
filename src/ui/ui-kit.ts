export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'close';

const VARIANT_STYLES: Record<ButtonVariant, Partial<CSSStyleDeclaration>> = {
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
