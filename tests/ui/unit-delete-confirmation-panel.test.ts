// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { createUnitDeleteConfirmationPanel } from '@/ui/unit-delete-confirmation-panel';

function clickButtonWithText(container: ParentNode, text: string): void {
  const button = Array.from(container.querySelectorAll('button')).find(candidate => candidate.textContent === text);
  expect(button).toBeDefined();
  button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

describe('unit-delete-confirmation-panel', () => {
  it('shows the target unit and waits for explicit confirmation', () => {
    const onConfirm = vi.fn();

    const panel = createUnitDeleteConfirmationPanel(document.body, {
      unitName: 'Scout',
      onConfirm,
      onCancel: vi.fn(),
    });

    expect(panel.textContent).toContain('Delete Scout?');
    expect(panel.textContent).toContain('This removes the unit permanently.');
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('calls onConfirm only when the confirmation delete button is clicked', () => {
    const onConfirm = vi.fn();

    createUnitDeleteConfirmationPanel(document.body, {
      unitName: 'Warrior',
      onConfirm,
      onCancel: vi.fn(),
    });

    clickButtonWithText(document.body, 'Delete Unit');

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel when Cancel is clicked', () => {
    const onCancel = vi.fn();

    createUnitDeleteConfirmationPanel(document.body, {
      unitName: 'Worker',
      onConfirm: vi.fn(),
      onCancel,
    });

    clickButtonWithText(document.body, 'Cancel');

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('replaces a stale confirmation panel when reopened', () => {
    createUnitDeleteConfirmationPanel(document.body, {
      unitName: 'Scout',
      onConfirm: vi.fn(),
      onCancel: vi.fn(),
    });
    createUnitDeleteConfirmationPanel(document.body, {
      unitName: 'Warrior',
      onConfirm: vi.fn(),
      onCancel: vi.fn(),
    });

    expect(document.querySelectorAll('#unit-delete-confirmation-panel')).toHaveLength(1);
    expect(document.body.textContent).toContain('Delete Warrior?');
    expect(document.body.textContent).not.toContain('Delete Scout?');
  });
});
