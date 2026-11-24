// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { createBreachPanel, createRallyPanel, createSeizeThePanelMoment, createLastStandPanel } from '@/ui/general-command-panel';
import type { BreachPreview, LastStandPreview, RallyPreview } from '@/systems/great-general-abilities';
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
  const checkboxesIn = (container: HTMLElement) =>
    Array.from(container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'));

  it('renders a checkbox per eligible unit', () => {
    const container = document.createElement('div');
    createSeizeThePanelMoment(container, 'gen-1', [{ unitId: 'unit-1', label: 'warrior', spendable: true }, { unitId: 'unit-2', label: 'archer', spendable: true }], 3, () => {}, () => {});
    expect(container.querySelectorAll('input[type="checkbox"]').length).toBe(2);
  });

  it('confirm passes only the checked unit ids', () => {
    const container = document.createElement('div');
    const onConfirm = vi.fn();
    createSeizeThePanelMoment(container, 'gen-1', [{ unitId: 'unit-1', label: 'warrior', spendable: true }, { unitId: 'unit-2', label: 'archer', spendable: true }], 3, onConfirm, () => {});
    const checkboxes = container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
    checkboxes[0].checked = true;
    checkboxes[0].dispatchEvent(new Event('change'));
    const confirmButton = Array.from(container.querySelectorAll('button')).find(b => /confirm/i.test(b.textContent ?? ''))!;
    confirmButton.click();
    expect(onConfirm).toHaveBeenCalledWith(['unit-1']);
  });

  it('review fix: shows an empty-state message when zero units are eligible', () => {
    const container = document.createElement('div');
    createSeizeThePanelMoment(container, 'gen-1', [], 3, () => {}, () => {});
    expect(container.textContent).toMatch(/no units|nothing eligible/i);
  });

  it('review fix: Confirm starts disabled and stays disabled until at least one checkbox is checked', () => {
    const container = document.createElement('div');
    const onConfirm = vi.fn();
    createSeizeThePanelMoment(container, 'gen-1', [{ unitId: 'unit-1', label: 'warrior', spendable: true }], 3, onConfirm, () => {});
    const confirmButton = Array.from(container.querySelectorAll('button')).find(b => /confirm/i.test(b.textContent ?? '')) as HTMLButtonElement;
    expect(confirmButton.disabled).toBe(true);
    confirmButton.click();
    expect(onConfirm).not.toHaveBeenCalled();

    const checkbox = container.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change'));
    expect(confirmButton.disabled).toBe(false);
  });

  it('never lets the player select more units than the executor will activate', () => {
    const container = document.createElement('div');
    const onConfirm = vi.fn();
    const eligible = ['u1', 'u2', 'u3', 'u4', 'u5'].map(unitId => ({ unitId, label: 'Warrior (100 HP)', spendable: true }));
    createSeizeThePanelMoment(container, 'gen-1', eligible, 3, onConfirm, () => {});
    const checkboxes = checkboxesIn(container);

    for (const id of ['u1', 'u2', 'u3']) {
      const checkbox = checkboxes.find(cb => cb.dataset.unitId === id)!;
      checkbox.checked = true;
      checkbox.dispatchEvent(new Event('change'));
    }

    // The allowance is spent: the remaining two are no longer selectable, and the
    // count says so (the executor would otherwise trim the list silently).
    expect(checkboxes.filter(cb => cb.dataset.unitId === 'u4' || cb.dataset.unitId === 'u5').every(cb => cb.disabled)).toBe(true);
    expect(container.textContent).toContain('3 of 3 selected');

    const confirmButton = Array.from(container.querySelectorAll('button')).find(b => /confirm/i.test(b.textContent ?? ''))!;
    confirmButton.click();
    expect(onConfirm).toHaveBeenCalledWith(['u1', 'u2', 'u3']);
  });

  it('#1807 — renders a unit that cannot spend the grant as a disabled row with its reason, never selectable and never counted', () => {
    const container = document.createElement('div');
    const onConfirm = vi.fn();
    createSeizeThePanelMoment(container, 'gen-1', [
      { unitId: 'boxed-in', label: 'Warrior (100 HP)', spendable: false, reason: 'No target or open tile in reach.' },
      { unitId: 'able-1', label: 'Warrior (100 HP)', spendable: true },
    ], 1, onConfirm, () => {});
    const checkboxes = checkboxesIn(container);
    const boxedIn = checkboxes.find(cb => cb.dataset.unitId === 'boxed-in')!;

    // The reason is visible on the row, and the row is permanently disabled.
    expect(container.textContent).toContain('No target or open tile in reach.');
    expect(boxedIn.disabled).toBe(true);

    // Spending the whole allowance on the able unit does not re-enable the dead row,
    // and the counter only ever counts spendable selections.
    const able = checkboxes.find(cb => cb.dataset.unitId === 'able-1')!;
    able.checked = true;
    able.dispatchEvent(new Event('change'));
    expect(boxedIn.disabled).toBe(true);
    expect(container.textContent).toContain('1 of 1 selected');

    const confirmButton = Array.from(container.querySelectorAll('button')).find(b => /confirm/i.test(b.textContent ?? ''))!;
    confirmButton.click();
    expect(onConfirm).toHaveBeenCalledWith(['able-1']);
  });

  it('re-enables the remaining units when an allowance is given back', () => {
    const container = document.createElement('div');
    const eligible = ['u1', 'u2', 'u3', 'u4'].map(unitId => ({ unitId, label: 'Warrior (100 HP)', spendable: true }));
    createSeizeThePanelMoment(container, 'gen-1', eligible, 2, () => {}, () => {});
    const checkboxes = checkboxesIn(container);
    const tick = (id: string) => {
      const checkbox = checkboxes.find(cb => cb.dataset.unitId === id)!;
      checkbox.checked = true;
      checkbox.dispatchEvent(new Event('change'));
    };

    tick('u1');
    tick('u2');
    expect(checkboxes.find(cb => cb.dataset.unitId === 'u3')!.disabled).toBe(true);
    expect(container.textContent).toContain('2 of 2 selected');

    const first = checkboxes.find(cb => cb.dataset.unitId === 'u1')!;
    first.checked = false;
    first.dispatchEvent(new Event('change'));
    expect(checkboxes.find(cb => cb.dataset.unitId === 'u3')!.disabled).toBe(false);
    expect(container.textContent).toContain('1 of 2 selected');
  });
});

describe('createBreachPanel (#939)', () => {
  const eligibility = { eligible: true, chargesRemaining: 3, isFinalCharge: false, cooldownTurnsRemaining: 0 };
  const preview = (cityId: string, cityName: string, hasGarrison = false): BreachPreview =>
    ({ eligibility, available: true, cityId, cityName, durationTurns: 2, hasGarrison });
  const confirmButton = (container: HTMLElement) =>
    Array.from(container.querySelectorAll('button')).find(b => /^confirm$/i.test(b.textContent ?? '')) as HTMLButtonElement;

  it('says what Breach does and names the duration, and lists each city with its garrison', () => {
    const container = document.createElement('div');
    createBreachPanel(container, [preview('c1', 'Fort Hesse', true), preview('c2', 'Brandt')], () => {}, () => {});
    const text = container.textContent ?? '';
    expect(text).toMatch(/2 turns/);
    expect(text).toMatch(/through the garrison/i);
    expect(text).toMatch(/Fort Hesse \(garrisoned\)/);
    expect(text).toMatch(/Brandt/);
    expect(text).not.toMatch(/Brandt \(garrisoned\)/);
    expect(container.querySelectorAll('input[type="radio"]')).toHaveLength(2);
  });

  it('Confirm starts disabled, enables when a city is chosen, and passes exactly that city once', () => {
    const container = document.createElement('div');
    const onConfirm = vi.fn();
    createBreachPanel(container, [preview('c1', 'Fort Hesse'), preview('c2', 'Brandt')], onConfirm, () => {});
    const confirm = confirmButton(container);
    expect(confirm.disabled).toBe(true);
    confirm.click();
    expect(onConfirm).not.toHaveBeenCalled();

    const radios = container.querySelectorAll<HTMLInputElement>('input[type="radio"]');
    radios[1]!.checked = true;
    radios[1]!.dispatchEvent(new Event('change'));
    expect(confirm.disabled).toBe(false);
    confirm.click();
    confirm.click();
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith('c2');
    expect(container.querySelector('#breach-panel')).toBeNull();
  });

  it('with no breachable city it explains why and offers nothing to confirm', () => {
    const container = document.createElement('div');
    createBreachPanel(container, [], () => {}, () => {});
    expect(container.textContent).toMatch(/No visible hostile city/i);
    expect(confirmButton(container).disabled).toBe(true);
  });

  it('Cancel closes the panel and confirms nothing', () => {
    const container = document.createElement('div');
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    createBreachPanel(container, [preview('c1', 'Fort Hesse')], onConfirm, onCancel);
    Array.from(container.querySelectorAll('button')).find(b => /cancel/i.test(b.textContent ?? ''))!.click();
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
    expect(container.querySelector('#breach-panel')).toBeNull();
  });

  it('warns that it is a Final Command when it spends the last charge', () => {
    const container = document.createElement('div');
    createBreachPanel(container, [{ ...preview('c1', 'Fort Hesse'), eligibility: { ...eligibility, isFinalCharge: true } }], () => {}, () => {});
    expect(container.querySelector('[data-final-command="true"]')).not.toBeNull();
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
    createSeizeThePanelMoment(seize, 'g1', [], 3, () => {}, () => {}, identity);
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
