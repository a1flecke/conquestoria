// @vitest-environment jsdom

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { installKeyboardShortcuts, type KeyboardShortcutCallbacks } from '@/input/keyboard-shortcuts';

function fire(key: string) {
  document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
}

function makeCallbacks(overrides: Partial<KeyboardShortcutCallbacks> = {}): KeyboardShortcutCallbacks {
  return {
    onOpenCouncil: vi.fn(),
    onOpenTech: vi.fn(),
    onEndTurn: vi.fn(),
    onCenterUnit: vi.fn(),
    onFortify: vi.fn(),
    onSettle: vi.fn(),
    onNextUnit: vi.fn(),
    onStartJourney: vi.fn(),
    getSelectedUnitId: vi.fn(() => null),
    ...overrides,
  };
}

describe('existing shortcuts', () => {
  beforeEach(() => {
    // Remove all keydown listeners by replacing document with a fresh one isn't possible in jsdom.
    // Instead each test installs its own handler.
  });

  it('t opens tech panel', () => {
    const cb = makeCallbacks();
    installKeyboardShortcuts(document, cb);
    fire('t');
    expect(cb.onOpenTech).toHaveBeenCalledOnce();
  });

  it('e calls onEndTurn', () => {
    const cb = makeCallbacks();
    installKeyboardShortcuts(document, cb);
    fire('e');
    expect(cb.onEndTurn).toHaveBeenCalledOnce();
  });
});

describe('new unit hotkeys', () => {
  it('n calls onNextUnit regardless of selected unit', () => {
    const cb = makeCallbacks({ getSelectedUnitId: vi.fn(() => null) });
    installKeyboardShortcuts(document, cb);
    fire('n');
    expect(cb.onNextUnit).toHaveBeenCalledOnce();
  });

  it('c calls onCenterUnit when a unit is selected', () => {
    const cb = makeCallbacks({ getSelectedUnitId: vi.fn(() => 'unit-1') });
    installKeyboardShortcuts(document, cb);
    fire('c');
    expect(cb.onCenterUnit).toHaveBeenCalledOnce();
    expect(cb.onOpenCouncil).not.toHaveBeenCalled();
  });

  it('c opens council when no unit is selected', () => {
    const cb = makeCallbacks({ getSelectedUnitId: vi.fn(() => null) });
    installKeyboardShortcuts(document, cb);
    fire('c');
    expect(cb.onOpenCouncil).toHaveBeenCalledOnce();
    expect(cb.onCenterUnit).not.toHaveBeenCalled();
  });

  it('f calls onFortify when a unit is selected', () => {
    const cb = makeCallbacks({ getSelectedUnitId: vi.fn(() => 'unit-1') });
    installKeyboardShortcuts(document, cb);
    fire('f');
    expect(cb.onFortify).toHaveBeenCalledOnce();
  });

  it('f does nothing when no unit is selected', () => {
    const cb = makeCallbacks({ getSelectedUnitId: vi.fn(() => null) });
    installKeyboardShortcuts(document, cb);
    fire('f');
    expect(cb.onFortify).not.toHaveBeenCalled();
  });

  it('b calls onSettle when a unit is selected', () => {
    const cb = makeCallbacks({ getSelectedUnitId: vi.fn(() => 'settler-1') });
    installKeyboardShortcuts(document, cb);
    fire('b');
    expect(cb.onSettle).toHaveBeenCalledOnce();
  });

  it('b does nothing when no unit is selected', () => {
    const cb = makeCallbacks({ getSelectedUnitId: vi.fn(() => null) });
    installKeyboardShortcuts(document, cb);
    fire('b');
    expect(cb.onSettle).not.toHaveBeenCalled();
  });

  it('g calls onStartJourney when a unit is selected', () => {
    const cb = makeCallbacks({ getSelectedUnitId: vi.fn(() => 'unit-1') });
    installKeyboardShortcuts(document, cb);
    fire('g');
    expect(cb.onStartJourney).toHaveBeenCalledOnce();
  });

  it('g does nothing when no unit is selected', () => {
    const cb = makeCallbacks({ getSelectedUnitId: vi.fn(() => null) });
    installKeyboardShortcuts(document, cb);
    fire('g');
    expect(cb.onStartJourney).not.toHaveBeenCalled();
  });

  it('does not fire when typing in an input field', () => {
    const cb = makeCallbacks({ getSelectedUnitId: vi.fn(() => 'unit-1') });
    installKeyboardShortcuts(document, cb);
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', bubbles: true }));
    expect(cb.onNextUnit).not.toHaveBeenCalled();
    input.remove();
  });
});
