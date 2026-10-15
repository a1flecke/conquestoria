// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { createRallyPanel, createSeizeThePanelMoment, createLastStandPanel } from '@/ui/general-command-panel';
import type { LastStandPreview, RallyPreview } from '@/systems/great-general-abilities';
import { GENERAL_DEFINITIONS } from '@/systems/great-general-definitions';
import { getGeneralPresentation } from '@/systems/great-general-presentation';

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

describe('createLastStandPanel', () => {
  function makePreview(): LastStandPreview {
    return {
      eligibility: { eligible: true, chargesRemaining: 1, isFinalCharge: true, cooldownTurnsRemaining: 0 },
      targetHex: { q: 1, r: 0 },
      area: [{ q: 1, r: 0 }],
      targets: [{ unitId: 'unit-1' }],
      defenseBonusPercent: 15,
      durationTurns: 2,
    };
  }

  it('shows affected units, defense bonus, and duration', () => {
    const container = document.createElement('div');
    createLastStandPanel(container, makePreview(), () => {}, () => {});
    const text = container.textContent ?? '';
    expect(text).toMatch(/unit-1/);
    expect(text).toMatch(/15%/);
    expect(text).toMatch(/2/);
  });

  it('shows the Final Command notice when eligibility.isFinalCharge is true', () => {
    const container = document.createElement('div');
    createLastStandPanel(container, makePreview(), () => {}, () => {});
    expect(container.textContent).toMatch(/final command/i);
  });

  it('confirm invokes onConfirm exactly once', () => {
    const container = document.createElement('div');
    const onConfirm = vi.fn();
    createLastStandPanel(container, makePreview(), onConfirm, () => {});
    const confirmButton = Array.from(container.querySelectorAll('button')).find(b => /confirm/i.test(b.textContent ?? ''))!;
    confirmButton.click();
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('review fix: disables Confirm when there are zero targets in the area', () => {
    const container = document.createElement('div');
    const onConfirm = vi.fn();
    createLastStandPanel(container, { ...makePreview(), targets: [] }, onConfirm, () => {});
    const confirmButton = Array.from(container.querySelectorAll('button')).find(b => /confirm/i.test(b.textContent ?? '')) as HTMLButtonElement;
    expect(confirmButton.disabled).toBe(true);
    confirmButton.click();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});


describe('#889 General identity in command previews', () => {
  const identity = { name: 'Julius Caesar', presentation: getGeneralPresentation(GENERAL_DEFINITIONS.find(g => g.id === 'gen_caesar')!) };
  const finalCharge = (): RallyPreview => ({
    eligibility: { eligible: true, chargesRemaining: 1, isFinalCharge: true, cooldownTurnsRemaining: 0 },
    targets: [{ unitId: 'unit-1', healthBefore: 40, healthAfter: 70, stageBefore: 'severe', stageAfter: 'degraded' }],
  });

  it('names the acting General with their crest in every command panel', () => {
    const container = document.createElement('div');
    createRallyPanel(container, finalCharge(), () => {}, () => {}, identity);
    expect(container.querySelector('#rally-panel h2')!.textContent).toBe('Rally — Julius Caesar');
    expect(container.querySelector('#rally-panel [data-general-portrait="gen_caesar"]')).not.toBeNull();

    const seize = document.createElement('div');
    createSeizeThePanelMoment(seize, 'g1', [], () => {}, () => {}, identity);
    expect(seize.querySelector('#seize-the-moment-panel h2')!.textContent).toBe('Seize the Moment — Julius Caesar');

    const stand = document.createElement('div');
    createLastStandPanel(stand, {
      eligibility: { eligible: true, chargesRemaining: 2, isFinalCharge: false, cooldownTurnsRemaining: 0 },
      targetHex: { q: 0, r: 0 }, area: [], targets: [], defenseBonusPercent: 15, durationTurns: 2,
    }, () => {}, () => {}, identity);
    expect(stand.querySelector('#last-stand-panel h2')!.textContent).toBe('Last Stand — Julius Caesar');
  });

  it('Final Command says who retires and where their story is kept; a normal charge shows no such notice', () => {
    const container = document.createElement('div');
    createRallyPanel(container, finalCharge(), () => {}, () => {}, identity);
    const notice = container.querySelector('[data-final-command]')!;
    expect(notice.textContent).toContain("Julius Caesar's last Command Charge");
    expect(notice.textContent).toContain('Hall of Fame');

    const normal = document.createElement('div');
    createRallyPanel(normal, { ...finalCharge(), eligibility: { ...finalCharge().eligibility, isFinalCharge: false } }, () => {}, () => {}, identity);
    expect(normal.querySelector('[data-final-command]')).toBeNull();
  });

  it('still works, with the generic wording, when no identity is supplied', () => {
    const container = document.createElement('div');
    createRallyPanel(container, finalCharge(), () => {}, () => {});
    expect(container.querySelector('#rally-panel h2')!.textContent).toBe('Rally');
    expect(container.querySelector('[data-general-portrait]')).toBeNull();
    expect(container.querySelector('[data-final-command]')!.textContent).toContain("this General's last Command Charge");
  });

  it('keeps Cancel as the safe default and Confirm single-fire with identity present', () => {
    const container = document.createElement('div');
    const onConfirm = vi.fn();
    createRallyPanel(container, finalCharge(), onConfirm, () => {}, identity);
    expect(container.querySelector('[data-modal-initial-focus]')!.textContent).toBe('Cancel');
    const confirm = [...container.querySelectorAll('button')].find(b => /confirm/i.test(b.textContent ?? ''))!;
    confirm.click();
    confirm.click();
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
