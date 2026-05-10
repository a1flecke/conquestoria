// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createWorkerTaskWarningPanel } from '@/ui/worker-task-warning-panel';

describe('worker-task-warning-panel', () => {
  beforeEach(() => {
    document.body.textContent = '';
  });

  it('warns that moving loses work in progress before confirming', () => {
    const onConfirm = vi.fn();
    createWorkerTaskWarningPanel(document.body, {
      improvementName: 'Farm',
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
    createWorkerTaskWarningPanel(document.body, { improvementName: 'Farm', onConfirm: vi.fn(), onCancel: vi.fn() });
    createWorkerTaskWarningPanel(document.body, { improvementName: 'Mine', onConfirm: vi.fn(), onCancel: vi.fn() });

    expect(document.querySelectorAll('#worker-task-warning-panel')).toHaveLength(1);
    expect(document.body.textContent).toContain('Mine');
  });
});
