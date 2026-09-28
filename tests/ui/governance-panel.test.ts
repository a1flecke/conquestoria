// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { createGovernancePanel } from '@/ui/governance-panel';
import type { GovernancePresentation } from '@/systems/governance-presentation';

function makePresentation(overrides: Partial<GovernancePresentation> = {}): GovernancePresentation {
  return {
    posture: 'centralized',
    capacityTotal: 3,
    loadTotal: 0,
    policies: [
      {
        id: 'conscription-levy', name: 'Conscription Levy', description: 'desc',
        loadCost: 1, pleases: ['military'], angers: ['commons'],
        active: false, canToggle: true, lockedUntilTurn: null,
      },
      {
        id: 'free-trade-charter', name: 'Free Trade Charter', description: 'desc',
        loadCost: 1, pleases: ['merchants'], angers: ['clergy'],
        active: false, canToggle: true, lockedUntilTurn: null,
      },
      {
        id: 'local-autonomy-writ', name: 'Local Autonomy Writ', description: 'desc',
        loadCost: 1, pleases: ['commons'], angers: ['military'],
        active: false, canToggle: true, lockedUntilTurn: null,
      },
    ],
    ...overrides,
  };
}

describe('#987 createGovernancePanel', () => {
  it('renders posture, capacity/load, and all three policies with faction attribution', () => {
    const container = document.createElement('div');
    createGovernancePanel(container, makePresentation(), vi.fn(), vi.fn());
    expect(container.textContent).toContain('Centralized');
    expect(container.textContent).toContain('0 / 3');
    expect(container.textContent).toContain('Conscription Levy');
    expect(container.textContent).toContain('Free Trade Charter');
    expect(container.textContent).toContain('Local Autonomy Writ');
    expect(container.textContent).toMatch(/Pleases: Military.*Angers: Commons/);
  });

  it('shows Autonomous posture when reported', () => {
    const container = document.createElement('div');
    createGovernancePanel(container, makePresentation({ posture: 'autonomous' }), vi.fn(), vi.fn());
    expect(container.textContent).toContain('Autonomous');
  });

  it('clicking Adopt on an inactive, toggleable policy calls onTogglePolicy(id, true)', () => {
    const container = document.createElement('div');
    const onToggle = vi.fn();
    createGovernancePanel(container, makePresentation(), onToggle, vi.fn());
    const buttons = Array.from(container.querySelectorAll('button')).filter(b => b.textContent === 'Adopt');
    expect(buttons).toHaveLength(3);
    buttons[0]!.click();
    expect(onToggle).toHaveBeenCalledWith('conscription-levy', true);
  });

  it('clicking Repeal on an active policy calls onTogglePolicy(id, false)', () => {
    const container = document.createElement('div');
    const onToggle = vi.fn();
    const presentation = makePresentation({
      loadTotal: 1,
      policies: [
        { ...makePresentation().policies[0]!, active: true, canToggle: true },
        makePresentation().policies[1]!,
        makePresentation().policies[2]!,
      ],
    });
    createGovernancePanel(container, presentation, onToggle, vi.fn());
    const repealButton = Array.from(container.querySelectorAll('button')).find(b => b.textContent === 'Repeal')!;
    repealButton.click();
    expect(onToggle).toHaveBeenCalledWith('conscription-levy', false);
  });

  it('disables the toggle button for a policy that cannot currently be toggled', () => {
    const container = document.createElement('div');
    const presentation = makePresentation({
      policies: [
        { ...makePresentation().policies[0]!, canToggle: false, lockedUntilTurn: 42 },
        makePresentation().policies[1]!,
        makePresentation().policies[2]!,
      ],
    });
    createGovernancePanel(container, presentation, vi.fn(), vi.fn());
    const button = Array.from(container.querySelectorAll('button')).find(b => b.textContent === 'Adopt')!;
    expect(button.disabled).toBe(true);
    expect(button.title).toMatch(/42/);
  });

  it('closes via the close button callback', () => {
    const container = document.createElement('div');
    const onClose = vi.fn();
    createGovernancePanel(container, makePresentation(), vi.fn(), onClose);
    (container.querySelector('[aria-label="Close"]') as HTMLElement).click();
    expect(onClose).toHaveBeenCalled();
  });
});
