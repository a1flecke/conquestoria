// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { createStrategicArsenalPanel } from '@/ui/strategic-arsenal-panel';

describe('createStrategicArsenalPanel (#545 MR4)', () => {
  it('renders arsenal count/capacity and closes via callback', () => {
    const container = document.createElement('div');
    const onClose = vi.fn();
    createStrategicArsenalPanel(container, { arsenalCount: 1, arsenalCapacity: 3, platforms: [], strikesReceivedFromCivIds: [] }, onClose);
    expect(container.textContent).toContain('1');
    expect(container.textContent).toContain('3');
    (container.querySelector('[aria-label="Close"]') as HTMLElement).click();
    expect(onClose).toHaveBeenCalled();
  });

  it('shows how many civs have struck this civ when non-zero', () => {
    const container = document.createElement('div');
    createStrategicArsenalPanel(container, { arsenalCount: 1, arsenalCapacity: 3, platforms: [], strikesReceivedFromCivIds: ['p2'] }, vi.fn());
    expect(container.textContent).toContain('1 civilization');
  });

  it('never fabricates an arms-control-cap or retaliation-risk line (MR5/MR6 not built yet)', () => {
    const container = document.createElement('div');
    createStrategicArsenalPanel(container, { arsenalCount: 1, arsenalCapacity: 3, platforms: [], strikesReceivedFromCivIds: [] }, vi.fn());
    expect(container.textContent).not.toMatch(/arms.control/i);
    expect(container.textContent).not.toMatch(/retaliation.risk/i);
  });
});
