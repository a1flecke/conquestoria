// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { createStrategicArsenalPanel } from '@/ui/strategic-arsenal-panel';

describe('createStrategicArsenalPanel (#545 MR4)', () => {
  it('renders arsenal count/capacity and closes via callback', () => {
    const container = document.createElement('div');
    const onClose = vi.fn();
    createStrategicArsenalPanel(container, { arsenalCount: 1, arsenalCapacity: 3, platforms: [], strikesReceivedFromCivIds: [], activeArmsControlCap: null }, onClose);
    expect(container.textContent).toContain('1');
    expect(container.textContent).toContain('3');
    (container.querySelector('[aria-label="Close"]') as HTMLElement).click();
    expect(onClose).toHaveBeenCalled();
  });

  it('shows how many civs have struck this civ when non-zero', () => {
    const container = document.createElement('div');
    createStrategicArsenalPanel(container, { arsenalCount: 1, arsenalCapacity: 3, platforms: [], strikesReceivedFromCivIds: ['p2'], activeArmsControlCap: null }, vi.fn());
    expect(container.textContent).toContain('1 civilization');
  });

  it('omits the arms-control-cap and retaliation-risk lines when there is no active cap (#545 MR6: cap line now exists, gated correctly)', () => {
    const container = document.createElement('div');
    createStrategicArsenalPanel(container, { arsenalCount: 1, arsenalCapacity: 3, platforms: [], strikesReceivedFromCivIds: [], activeArmsControlCap: null }, vi.fn());
    expect(container.textContent).not.toMatch(/arms.control/i);
    expect(container.textContent).not.toMatch(/retaliation.risk/i);
  });

  it('shows the active arms-control cap when present (#545 MR6)', () => {
    const container = document.createElement('div');
    createStrategicArsenalPanel(container, { arsenalCount: 2, arsenalCapacity: 5, platforms: [], strikesReceivedFromCivIds: [], activeArmsControlCap: 3 }, vi.fn());
    expect(container.textContent).toMatch(/arms.control.*cap.*3/i);
  });
});
