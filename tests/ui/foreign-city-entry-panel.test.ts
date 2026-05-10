// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createForeignCityEntryPanel } from '@/ui/foreign-city-entry-panel';

describe('foreign-city-entry-panel', () => {
  beforeEach(() => {
    document.body.textContent = '';
  });

  it('warns that entering a neutral city declares war and waits for confirmation', () => {
    const onConfirm = vi.fn();
    createForeignCityEntryPanel(document.body, {
      cityName: 'Athens',
      defenderName: 'Greece',
      onConfirm,
      onCancel: vi.fn(),
    });

    expect(document.body.textContent).toContain('declares war');
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('replaces stale prompts when reopened', () => {
    createForeignCityEntryPanel(document.body, { cityName: 'Athens', defenderName: 'Greece', onConfirm: vi.fn(), onCancel: vi.fn() });
    createForeignCityEntryPanel(document.body, { cityName: 'Thebes', defenderName: 'Egypt', onConfirm: vi.fn(), onCancel: vi.fn() });

    expect(document.querySelectorAll('#foreign-city-entry-panel')).toHaveLength(1);
    expect(document.body.textContent).toContain('Thebes');
  });

  it('calls confirm at most once even if stale button references are clicked again', () => {
    const onConfirm = vi.fn();
    const panel = createForeignCityEntryPanel(document.body, {
      cityName: 'Athens',
      defenderName: 'Greece',
      onConfirm,
      onCancel: vi.fn(),
    });
    const continueButton = Array.from(panel.querySelectorAll('button'))
      .find(button => button.textContent === 'Continue')!;

    continueButton.click();
    continueButton.click();

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(document.querySelector('#foreign-city-entry-panel')).toBeNull();
  });

  it('calls cancel at most once even if stale button references are clicked again', () => {
    const onCancel = vi.fn();
    const panel = createForeignCityEntryPanel(document.body, {
      cityName: 'Athens',
      defenderName: 'Greece',
      onConfirm: vi.fn(),
      onCancel,
    });
    const cancelButton = Array.from(panel.querySelectorAll('button'))
      .find(button => button.textContent === 'Cancel')!;

    cancelButton.click();
    cancelButton.click();

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(document.querySelector('#foreign-city-entry-panel')).toBeNull();
  });
});
