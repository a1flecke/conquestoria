// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { createGameButton, setButtonDisabled, type ButtonVariant } from '@/ui/ui-kit';

const ALL_VARIANTS: ButtonVariant[] = ['primary', 'secondary', 'ghost', 'danger', 'close'];

describe('createGameButton', () => {
  it.each(ALL_VARIANTS)('%s variant has non-empty background and color', (variant) => {
    const btn = createGameButton('Test', variant);
    expect(btn.style.background).not.toBe('');
    expect(btn.style.color).not.toBe('');
  });

  it.each(ALL_VARIANTS)('%s variant enforces 44px touch target', (variant) => {
    const btn = createGameButton('Test', variant);
    expect(btn.style.minHeight).toBe('44px');
    expect(btn.style.minWidth).toBe('44px');
  });

  it('creates a button element with the given label', () => {
    const btn = createGameButton('Start Campaign', 'primary');
    expect(btn.tagName).toBe('BUTTON');
    expect(btn.textContent).toBe('Start Campaign');
  });

  it('defaults to type=button to prevent accidental form submission', () => {
    const btn = createGameButton('OK', 'primary');
    expect(btn.type).toBe('button');
  });

  it('respects type override', () => {
    const btn = createGameButton('Submit', 'primary', { type: 'submit' });
    expect(btn.type).toBe('submit');
  });

  it('disabled option applies disabled visual state', () => {
    const btn = createGameButton('Start', 'primary', { disabled: true });
    expect(btn.disabled).toBe(true);
    expect(btn.style.opacity).toBe('0.45');
    expect(btn.style.cursor).toBe('not-allowed');
  });

  it('enabled by default', () => {
    const btn = createGameButton('Start', 'primary');
    expect(btn.disabled).toBe(false);
    expect(btn.style.opacity).toBe('1');
  });
});

describe('setButtonDisabled', () => {
  it('disabling sets opacity 0.45, cursor not-allowed, pointer-events none', () => {
    const btn = createGameButton('OK', 'primary');
    setButtonDisabled(btn, true);
    expect(btn.disabled).toBe(true);
    expect(btn.style.opacity).toBe('0.45');
    expect(btn.style.cursor).toBe('not-allowed');
    expect(btn.style.pointerEvents).toBe('none');
  });

  it('re-enabling restores opacity 1, cursor pointer', () => {
    const btn = createGameButton('OK', 'primary', { disabled: true });
    setButtonDisabled(btn, false);
    expect(btn.disabled).toBe(false);
    expect(btn.style.opacity).toBe('1');
    expect(btn.style.cursor).toBe('pointer');
  });
});
