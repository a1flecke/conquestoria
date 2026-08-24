// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { createRallyPanel, createSeizeThePanelMoment } from '@/ui/general-command-panel';
import type { RallyPreview } from '@/systems/great-general-abilities';

describe('createRallyPanel', () => {
  function makePreview(): RallyPreview {
    return {
      eligibility: { eligible: true, chargesRemaining: 2, isFinalCharge: false, cooldownTurnsRemaining: 0 },
      targets: [{ unitId: 'unit-1', healthBefore: 40, healthAfter: 70, stageBefore: 'severe', stageAfter: 'degraded' }],
    };
  }

  it('renders each target\'s HP and stage change', () => {
    const container = document.createElement('div');
    createRallyPanel(container, makePreview(), () => {}, () => {});
    const text = container.textContent ?? '';
    expect(text).toMatch(/40/);
    expect(text).toMatch(/70/);
    expect(text).toMatch(/severe/i);
    expect(text).toMatch(/degraded/i);
  });

  it('confirm button invokes onConfirm exactly once', () => {
    const container = document.createElement('div');
    const onConfirm = vi.fn();
    createRallyPanel(container, makePreview(), onConfirm, () => {});
    const confirmButton = Array.from(container.querySelectorAll('button')).find(b => /confirm/i.test(b.textContent ?? ''))!;
    confirmButton.click();
    confirmButton.click();
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('cancel button invokes onCancel and does not invoke onConfirm', () => {
    const container = document.createElement('div');
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    createRallyPanel(container, makePreview(), onConfirm, onCancel);
    const cancelButton = Array.from(container.querySelectorAll('button')).find(b => /cancel/i.test(b.textContent ?? ''))!;
    cancelButton.click();
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('shows a Final Command warning when eligibility.isFinalCharge is true', () => {
    const container = document.createElement('div');
    const preview = { ...makePreview(), eligibility: { ...makePreview().eligibility, isFinalCharge: true } };
    createRallyPanel(container, preview, () => {}, () => {});
    expect(container.textContent).toMatch(/final command/i);
    expect(container.textContent).toMatch(/retire/i);
  });

  it('review fix: disables Confirm when there are zero targets, so a charge can never be spent on a no-op', () => {
    const container = document.createElement('div');
    const onConfirm = vi.fn();
    createRallyPanel(container, { ...makePreview(), targets: [] }, onConfirm, () => {});
    const confirmButton = Array.from(container.querySelectorAll('button')).find(b => /confirm/i.test(b.textContent ?? '')) as HTMLButtonElement;
    expect(confirmButton.disabled).toBe(true);
    confirmButton.click();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

describe('createSeizeThePanelMoment', () => {
  it('renders a checkbox per eligible unit', () => {
    const container = document.createElement('div');
    createSeizeThePanelMoment(container, 'gen-1', [{ unitId: 'unit-1', label: 'warrior' }, { unitId: 'unit-2', label: 'archer' }], () => {}, () => {});
    expect(container.querySelectorAll('input[type="checkbox"]').length).toBe(2);
  });

  it('confirm passes only the checked unit ids', () => {
    const container = document.createElement('div');
    const onConfirm = vi.fn();
    createSeizeThePanelMoment(container, 'gen-1', [{ unitId: 'unit-1', label: 'warrior' }, { unitId: 'unit-2', label: 'archer' }], onConfirm, () => {});
    const checkboxes = container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
    checkboxes[0].checked = true;
    checkboxes[0].dispatchEvent(new Event('change'));
    const confirmButton = Array.from(container.querySelectorAll('button')).find(b => /confirm/i.test(b.textContent ?? ''))!;
    confirmButton.click();
    expect(onConfirm).toHaveBeenCalledWith(['unit-1']);
  });

  it('review fix: shows an empty-state message when zero units are eligible', () => {
    const container = document.createElement('div');
    createSeizeThePanelMoment(container, 'gen-1', [], () => {}, () => {});
    expect(container.textContent).toMatch(/no units|nothing eligible/i);
  });

  it('review fix: Confirm starts disabled and stays disabled until at least one checkbox is checked', () => {
    const container = document.createElement('div');
    const onConfirm = vi.fn();
    createSeizeThePanelMoment(container, 'gen-1', [{ unitId: 'unit-1', label: 'warrior' }], onConfirm, () => {});
    const confirmButton = Array.from(container.querySelectorAll('button')).find(b => /confirm/i.test(b.textContent ?? '')) as HTMLButtonElement;
    expect(confirmButton.disabled).toBe(true);
    confirmButton.click();
    expect(onConfirm).not.toHaveBeenCalled();

    const checkbox = container.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change'));
    expect(confirmButton.disabled).toBe(false);
  });
});
