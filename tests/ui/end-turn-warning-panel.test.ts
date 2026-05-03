// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { createEndTurnWarningPanel } from '@/ui/end-turn-warning-panel';

function clickButtonWithText(container: ParentNode, text: string): void {
  const button = Array.from(container.querySelectorAll('button')).find(candidate => candidate.textContent === text);
  expect(button).toBeDefined();
  button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

describe('end-turn-warning-panel', () => {
  it('shows the unmoved unit count and unit list', () => {
    const panel = createEndTurnWarningPanel(document.body, {
      unmovedUnits: [
        { unitId: 'unit-1', label: 'Scout', positionLabel: '2, 3' },
        { unitId: 'unit-2', label: 'Warrior', positionLabel: '4, 1' },
      ],
      onGoToUnit: vi.fn(),
      onEndTurnAnyway: vi.fn(),
      onCancel: vi.fn(),
    });

    expect(panel.textContent).toContain('2 units still need orders');
    expect(panel.textContent).toContain('Scout at 2, 3');
    expect(panel.textContent).toContain('Warrior at 4, 1');
  });

  it('sends the first unmoved unit id when Go to Unit is clicked', () => {
    const onGoToUnit = vi.fn();

    createEndTurnWarningPanel(document.body, {
      unmovedUnits: [
        { unitId: 'unit-1', label: 'Scout', positionLabel: '2, 3' },
        { unitId: 'unit-2', label: 'Warrior', positionLabel: '4, 1' },
      ],
      onGoToUnit,
      onEndTurnAnyway: vi.fn(),
      onCancel: vi.fn(),
    });

    clickButtonWithText(document.body, 'Go to Unit');

    expect(onGoToUnit).toHaveBeenCalledWith('unit-1');
  });

  it('calls onEndTurnAnyway only when the bypass button is clicked', () => {
    const onEndTurnAnyway = vi.fn();

    createEndTurnWarningPanel(document.body, {
      unmovedUnits: [{ unitId: 'unit-1', label: 'Scout', positionLabel: '2, 3' }],
      onGoToUnit: vi.fn(),
      onEndTurnAnyway,
      onCancel: vi.fn(),
    });

    clickButtonWithText(document.body, 'End Turn Anyway');

    expect(onEndTurnAnyway).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel when Cancel is clicked', () => {
    const onCancel = vi.fn();

    createEndTurnWarningPanel(document.body, {
      unmovedUnits: [{ unitId: 'unit-1', label: 'Scout', positionLabel: '2, 3' }],
      onGoToUnit: vi.fn(),
      onEndTurnAnyway: vi.fn(),
      onCancel,
    });

    clickButtonWithText(document.body, 'Cancel');

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('replaces a stale warning panel when recreated', () => {
    createEndTurnWarningPanel(document.body, {
      unmovedUnits: [{ unitId: 'unit-1', label: 'Scout', positionLabel: '2, 3' }],
      onGoToUnit: vi.fn(),
      onEndTurnAnyway: vi.fn(),
      onCancel: vi.fn(),
    });
    createEndTurnWarningPanel(document.body, {
      unmovedUnits: [{ unitId: 'unit-2', label: 'Worker', positionLabel: '5, 5' }],
      onGoToUnit: vi.fn(),
      onEndTurnAnyway: vi.fn(),
      onCancel: vi.fn(),
    });

    expect(document.querySelectorAll('#end-turn-warning-panel')).toHaveLength(1);
    expect(document.body.textContent).toContain('Worker at 5, 5');
    expect(document.body.textContent).not.toContain('Scout at 2, 3');
  });
});
