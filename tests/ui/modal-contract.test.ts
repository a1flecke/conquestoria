// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MODAL_ATTR, MODAL_CANCEL_ATTR, MODAL_INITIAL_FOCUS_ATTR, markModal } from '@/ui/modal-contract';
import { createEndTurnWarningPanel } from '@/ui/end-turn-warning-panel';
import { createUnitDeleteConfirmationPanel } from '@/ui/unit-delete-confirmation-panel';
import { createRequiredChoicePanel } from '@/ui/required-choice-panel';
import { createReligionBoonModal } from '@/ui/religion-boon-modal';
import { createWorkerReplacementConfirmPanel, createWorkerTaskWarningPanel } from '@/ui/worker-task-warning-panel';

// #1459: each blocking decision dialog declares what is safe about it; the focus manager
// (tests/app/panel-focus-manager.test.ts) turns that into focus entry, a Tab trap and Escape.

function cancelOf(root: HTMLElement): HTMLElement | null {
  return root.querySelector<HTMLElement>(`[${MODAL_CANCEL_ATTR}]`);
}
function initialFocusOf(root: HTMLElement): HTMLElement | null {
  return root.querySelector<HTMLElement>(`[${MODAL_INITIAL_FOCUS_ATTR}]`);
}

describe('markModal', () => {
  it('flags the root and the chosen controls', () => {
    const root = document.createElement('div');
    const cancel = document.createElement('button');
    root.appendChild(cancel);
    markModal(root, { cancel, initialFocus: cancel });
    expect(root.hasAttribute(MODAL_ATTR)).toBe(true);
    expect(cancelOf(root)).toBe(cancel);
    expect(initialFocusOf(root)).toBe(cancel);
  });
});

describe('blocking decision dialogs declare their modal contract (#1459)', () => {
  beforeEach(() => {
    document.body.textContent = '';
  });

  it('end-turn warning: Escape cancels, focus starts on Go to Unit', () => {
    const onCancel = vi.fn();
    const panel = createEndTurnWarningPanel(document.body, {
      unmovedUnits: [{ unitId: 'u1', label: 'Scout', positionLabel: '1, 1' }],
      onGoToUnit: vi.fn(), onEndTurnAnyway: vi.fn(), onCancel,
    });
    expect(panel.hasAttribute(MODAL_ATTR)).toBe(true);
    expect(cancelOf(panel)?.textContent).toBe('Cancel');
    expect(initialFocusOf(panel)?.textContent).toBe('Go to Unit');
    cancelOf(panel)!.click();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('delete confirmation: the safe Cancel button takes focus and answers Escape', () => {
    const panel = createUnitDeleteConfirmationPanel(document.body, {
      unitName: 'Scout', onConfirm: vi.fn(), onCancel: vi.fn(),
    });
    expect(cancelOf(panel)?.textContent).toBe('Cancel');
    expect(initialFocusOf(panel)).toBe(cancelOf(panel));
  });

  it('delete confirmation without a Cancel focuses the only choice and has no Escape target', () => {
    const panel = createUnitDeleteConfirmationPanel(document.body, {
      unitName: 'Missionary', confirmLabel: 'OK', hideCancel: true, onConfirm: vi.fn(), onCancel: vi.fn(),
    });
    expect(cancelOf(panel)).toBeNull();
    expect(initialFocusOf(panel)?.textContent).toBe('OK');
  });

  it('worker warnings: the keep-working choice is the safe default and the Escape target', () => {
    const task = createWorkerTaskWarningPanel(document.body, {
      improvementName: 'Farm', turnsLeft: 2, onConfirm: vi.fn(), onCancel: vi.fn(),
    });
    expect(cancelOf(task)?.textContent).toBe('Keep working');
    expect(initialFocusOf(task)).toBe(cancelOf(task));

    const replace = createWorkerReplacementConfirmPanel(document.body, {
      existingName: 'Farm', newName: 'Mine', onConfirm: vi.fn(), onCancel: vi.fn(),
    } as Parameters<typeof createWorkerReplacementConfirmPanel>[1]);
    expect(cancelOf(replace)?.textContent).toBe('Keep');
    expect(initialFocusOf(replace)).toBe(cancelOf(replace));
  });

  it('required choices are modal but cannot be dismissed with Escape', () => {
    const panel = createRequiredChoicePanel(document.body, {
      researchChoices: [{ techId: 'fire', label: 'Fire', turns: 4 }],
      cityChoices: [],
      onChooseResearch: vi.fn(), onChooseCityBuild: vi.fn(), onOpenTech: vi.fn(), onOpenCity: vi.fn(),
    });
    expect(panel.hasAttribute(MODAL_ATTR)).toBe(true);
    expect(cancelOf(panel)).toBeNull();
  });

  it('the religion boon choice is modal but cannot be dismissed with Escape', () => {
    createReligionBoonModal(document.body, { religionName: 'Order of Test', onChooseBoon: vi.fn() });
    const modal = document.getElementById('religion-boon-modal')!;
    expect(modal.hasAttribute(MODAL_ATTR)).toBe(true);
    expect(cancelOf(modal)).toBeNull();
  });
});
