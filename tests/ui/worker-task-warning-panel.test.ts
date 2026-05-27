// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createWorkerTaskWarningPanel, createWorkerReplacementConfirmPanel } from '@/ui/worker-task-warning-panel';

describe('worker-task-warning-panel', () => {
  beforeEach(() => {
    document.body.textContent = '';
  });

  it('warns that moving loses work in progress before confirming', () => {
    const onConfirm = vi.fn();
    createWorkerTaskWarningPanel(document.body, {
      improvementName: 'Farm',
      turnsLeft: 2,
      onConfirm,
      onCancel: vi.fn(),
    });

    expect(document.body.textContent).toContain('work in progress will be lost');
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('calls confirm at most once', () => {
    const onConfirm = vi.fn();
    const panel = createWorkerTaskWarningPanel(document.body, {
      improvementName: 'Farm',
      turnsLeft: 2,
      onConfirm,
      onCancel: vi.fn(),
    });
    const moveButton = Array.from(panel.querySelectorAll('button'))
      .find(button => button.textContent === 'Move anyway')!;

    moveButton.click();
    moveButton.click();

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(document.querySelector('#worker-task-warning-panel')).toBeNull();
  });

  it('calls cancel at most once', () => {
    const onCancel = vi.fn();
    const panel = createWorkerTaskWarningPanel(document.body, {
      improvementName: 'Farm',
      turnsLeft: 2,
      onConfirm: vi.fn(),
      onCancel,
    });
    const keepWorkingButton = Array.from(panel.querySelectorAll('button'))
      .find(button => button.textContent === 'Keep working')!;

    keepWorkingButton.click();
    keepWorkingButton.click();

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(document.querySelector('#worker-task-warning-panel')).toBeNull();
  });

  it('replaces stale warning panels when reopened', () => {
    createWorkerTaskWarningPanel(document.body, { improvementName: 'Farm', turnsLeft: 2, onConfirm: vi.fn(), onCancel: vi.fn() });
    createWorkerTaskWarningPanel(document.body, { improvementName: 'Mine', turnsLeft: 2, onConfirm: vi.fn(), onCancel: vi.fn() });

    expect(document.querySelectorAll('#worker-task-warning-panel')).toHaveLength(1);
    expect(document.body.textContent).toContain('Mine');
  });

  it('shows turns remaining in the title', () => {
    createWorkerTaskWarningPanel(document.body, {
      improvementName: 'Farm',
      turnsLeft: 3,
      onConfirm: vi.fn(),
      onCancel: vi.fn(),
    });

    expect(document.body.textContent).toContain('3 turns remaining');
  });

  it('uses singular "turn" when only 1 turn remains', () => {
    createWorkerTaskWarningPanel(document.body, {
      improvementName: 'Mine',
      turnsLeft: 1,
      onConfirm: vi.fn(),
      onCancel: vi.fn(),
    });

    expect(document.body.textContent).toContain('1 turn remaining');
    expect(document.body.textContent).not.toContain('1 turns remaining');
  });

  it('cancel and confirm buttons have styled background and color', () => {
    const panel = createWorkerTaskWarningPanel(document.body, {
      improvementName: 'Farm', turnsLeft: 2, onConfirm: vi.fn(), onCancel: vi.fn(),
    });
    const buttons = Array.from(panel.querySelectorAll('button')) as HTMLButtonElement[];
    for (const btn of buttons) {
      expect(btn.style.background, `${btn.textContent} background`).not.toBe('');
      expect(btn.style.color, `${btn.textContent} color`).not.toBe('');
    }
  });
});

describe('createWorkerReplacementConfirmPanel', () => {
  beforeEach(() => {
    document.body.textContent = '';
  });

  it('shows existing and new improvement names in the body', () => {
    createWorkerReplacementConfirmPanel(document.body, {
      existingName: 'Farm',
      newName: 'Pasture',
      onConfirm: vi.fn(),
      onCancel: vi.fn(),
    });
    expect(document.body.textContent).toContain('Farm');
    expect(document.body.textContent).toContain('Pasture');
  });

  it('calls onConfirm when Replace is clicked', () => {
    const onConfirm = vi.fn();
    const panel = createWorkerReplacementConfirmPanel(document.body, {
      existingName: 'Farm',
      newName: 'Pasture',
      onConfirm,
      onCancel: vi.fn(),
    });
    const replaceButton = Array.from(panel.querySelectorAll('button'))
      .find(btn => btn.textContent === 'Replace')!;
    replaceButton.click();
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel when Keep is clicked', () => {
    const onCancel = vi.fn();
    const panel = createWorkerReplacementConfirmPanel(document.body, {
      existingName: 'Farm',
      newName: 'Pasture',
      onConfirm: vi.fn(),
      onCancel,
    });
    const keepButton = Array.from(panel.querySelectorAll('button'))
      .find(btn => btn.textContent === 'Keep')!;
    keepButton.click();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('calls onConfirm at most once', () => {
    const onConfirm = vi.fn();
    const panel = createWorkerReplacementConfirmPanel(document.body, {
      existingName: 'Farm',
      newName: 'Pasture',
      onConfirm,
      onCancel: vi.fn(),
    });
    const replaceButton = Array.from(panel.querySelectorAll('button'))
      .find(btn => btn.textContent === 'Replace')!;
    replaceButton.click();
    replaceButton.click();
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('shows yield strings in the body when provided', () => {
    createWorkerReplacementConfirmPanel(document.body, {
      existingName: 'Farm',
      newName: 'Mine',
      existingYield: '(+2 Food)',
      newYield: '(+2 Prod, +1 Gold)',
      onConfirm: vi.fn(),
      onCancel: vi.fn(),
    });
    expect(document.body.textContent).toContain('(+2 Prod, +1 Gold)');
    expect(document.body.textContent).toContain('(+2 Food)');
  });

  it('shows plain names without yield when not provided', () => {
    createWorkerReplacementConfirmPanel(document.body, {
      existingName: 'Farm',
      newName: 'Mine',
      onConfirm: vi.fn(),
      onCancel: vi.fn(),
    });
    expect(document.body.textContent).toContain('Mine');
    expect(document.body.textContent).toContain('Farm');
    expect(document.body.textContent).not.toContain('(+');
  });
});
