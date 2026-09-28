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
    governorCities: [],
    ...overrides,
  };
}

describe('#987 createGovernancePanel', () => {
  it('renders posture, capacity/load, and all three policies with faction attribution', () => {
    const container = document.createElement('div');
    createGovernancePanel(container, makePresentation(), vi.fn(), vi.fn(), vi.fn(), vi.fn());
    expect(container.textContent).toContain('Centralized');
    expect(container.textContent).toContain('0 / 3');
    expect(container.textContent).toContain('Conscription Levy');
    expect(container.textContent).toContain('Free Trade Charter');
    expect(container.textContent).toContain('Local Autonomy Writ');
    expect(container.textContent).toMatch(/Pleases: Military.*Angers: Commons/);
  });

  it('shows Autonomous posture when reported', () => {
    const container = document.createElement('div');
    createGovernancePanel(container, makePresentation({ posture: 'autonomous' }), vi.fn(), vi.fn(), vi.fn(), vi.fn());
    expect(container.textContent).toContain('Autonomous');
  });

  it('clicking Adopt on an inactive, toggleable policy calls onTogglePolicy(id, true)', () => {
    const container = document.createElement('div');
    const onToggle = vi.fn();
    createGovernancePanel(container, makePresentation(), onToggle, vi.fn(), vi.fn(), vi.fn());
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
    createGovernancePanel(container, presentation, onToggle, vi.fn(), vi.fn(), vi.fn());
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
    createGovernancePanel(container, presentation, vi.fn(), vi.fn(), vi.fn(), vi.fn());
    const button = Array.from(container.querySelectorAll('button')).find(b => b.textContent === 'Adopt')!;
    expect(button.disabled).toBe(true);
    expect(button.title).toMatch(/42/);
  });

  it('closes via the close button callback', () => {
    const container = document.createElement('div');
    const onClose = vi.fn();
    createGovernancePanel(container, makePresentation(), vi.fn(), vi.fn(), vi.fn(), onClose);
    (container.querySelector('[aria-label="Close"]') as HTMLElement).click();
    expect(onClose).toHaveBeenCalled();
  });
});

describe('#928 createGovernancePanel — governors', () => {
  it('renders every owned city with its pressure and governed status', () => {
    const container = document.createElement('div');
    const presentation = makePresentation({
      governorCities: [
        { cityId: 'city-1', cityName: 'Capital', pressure: 45, governed: false, canToggle: true, lockedUntilTurn: null },
        { cityId: 'city-2', cityName: 'Outpost', pressure: 12, governed: true, canToggle: true, lockedUntilTurn: null },
      ],
    });
    createGovernancePanel(container, presentation, vi.fn(), vi.fn(), vi.fn(), vi.fn());
    expect(container.textContent).toContain('Capital — pressure 45');
    expect(container.textContent).toContain('Outpost — pressure 12 (governed)');
  });

  it('shows a "no cities to govern" message when the civ owns none', () => {
    const container = document.createElement('div');
    createGovernancePanel(container, makePresentation({ governorCities: [] }), vi.fn(), vi.fn(), vi.fn(), vi.fn());
    expect(container.textContent).toContain('No cities to govern.');
  });

  it('clicking Assign on an ungoverned, toggleable city calls onToggleGovernor(cityId, true)', () => {
    const container = document.createElement('div');
    const onToggleGovernor = vi.fn();
    const presentation = makePresentation({
      governorCities: [
        { cityId: 'city-1', cityName: 'Capital', pressure: 45, governed: false, canToggle: true, lockedUntilTurn: null },
      ],
    });
    createGovernancePanel(container, presentation, vi.fn(), onToggleGovernor, vi.fn(), vi.fn());
    const assignButton = Array.from(container.querySelectorAll('button')).find(b => b.textContent === 'Assign')!;
    assignButton.click();
    expect(onToggleGovernor).toHaveBeenCalledWith('city-1', true);
  });

  it('clicking Remove on a governed city calls onToggleGovernor(cityId, false)', () => {
    const container = document.createElement('div');
    const onToggleGovernor = vi.fn();
    const presentation = makePresentation({
      governorCities: [
        { cityId: 'city-1', cityName: 'Capital', pressure: 5, governed: true, canToggle: true, lockedUntilTurn: null },
      ],
    });
    createGovernancePanel(container, presentation, vi.fn(), onToggleGovernor, vi.fn(), vi.fn());
    const removeButton = Array.from(container.querySelectorAll('button')).find(b => b.textContent === 'Remove')!;
    removeButton.click();
    expect(onToggleGovernor).toHaveBeenCalledWith('city-1', false);
  });

  it('disables the toggle button for a city that cannot currently be toggled', () => {
    const container = document.createElement('div');
    const presentation = makePresentation({
      governorCities: [
        { cityId: 'city-1', cityName: 'Capital', pressure: 45, governed: false, canToggle: false, lockedUntilTurn: 50 },
      ],
    });
    createGovernancePanel(container, presentation, vi.fn(), vi.fn(), vi.fn(), vi.fn());
    const button = Array.from(container.querySelectorAll('button')).find(b => b.textContent === 'Assign')!;
    expect(button.disabled).toBe(true);
    expect(button.title).toMatch(/50/);
  });

  it('#928: a governed city with an eligible destination shows a Move control that calls onMoveGovernor(from, to)', () => {
    const container = document.createElement('div');
    const onMoveGovernor = vi.fn();
    const presentation = makePresentation({
      governorCities: [
        { cityId: 'city-1', cityName: 'Capital', pressure: 45, governed: true, canToggle: true, lockedUntilTurn: null },
        { cityId: 'city-2', cityName: 'Outpost', pressure: 5, governed: false, canToggle: true, lockedUntilTurn: null },
      ],
    });
    createGovernancePanel(container, presentation, vi.fn(), vi.fn(), onMoveGovernor, vi.fn());
    const select = container.querySelector('select') as HTMLSelectElement;
    expect(select).toBeTruthy();
    expect(Array.from(select.options).map(o => o.value)).toEqual(['city-2']);
    select.value = 'city-2';
    const moveButton = Array.from(container.querySelectorAll('button')).find(b => b.textContent === 'Move')!;
    moveButton.click();
    expect(onMoveGovernor).toHaveBeenCalledWith('city-1', 'city-2');
  });

  it('#928: no Move control appears when there is no eligible destination city', () => {
    const container = document.createElement('div');
    const presentation = makePresentation({
      governorCities: [
        { cityId: 'city-1', cityName: 'Capital', pressure: 45, governed: true, canToggle: true, lockedUntilTurn: null },
        { cityId: 'city-2', cityName: 'Outpost', pressure: 5, governed: false, canToggle: false, lockedUntilTurn: 50 },
      ],
    });
    createGovernancePanel(container, presentation, vi.fn(), vi.fn(), vi.fn(), vi.fn());
    expect(container.querySelector('select')).toBeNull();
    expect(Array.from(container.querySelectorAll('button')).some(b => b.textContent === 'Move')).toBe(false);
  });

  it('#928: the Move button is disabled when the source city itself cannot currently be toggled', () => {
    const container = document.createElement('div');
    const presentation = makePresentation({
      governorCities: [
        { cityId: 'city-1', cityName: 'Capital', pressure: 45, governed: true, canToggle: false, lockedUntilTurn: 60 },
        { cityId: 'city-2', cityName: 'Outpost', pressure: 5, governed: false, canToggle: true, lockedUntilTurn: null },
      ],
    });
    createGovernancePanel(container, presentation, vi.fn(), vi.fn(), vi.fn(), vi.fn());
    const moveButton = Array.from(container.querySelectorAll('button')).find(b => b.textContent === 'Move')!;
    expect(moveButton.disabled).toBe(true);
    expect(moveButton.title).toMatch(/60/);
  });

  it('#928: an ungoverned city never shows a Move control, even alongside a governed one', () => {
    const container = document.createElement('div');
    const presentation = makePresentation({
      governorCities: [
        { cityId: 'city-1', cityName: 'Capital', pressure: 45, governed: true, canToggle: true, lockedUntilTurn: null },
        { cityId: 'city-2', cityName: 'Outpost', pressure: 5, governed: false, canToggle: true, lockedUntilTurn: null },
      ],
    });
    createGovernancePanel(container, presentation, vi.fn(), vi.fn(), vi.fn(), vi.fn());
    expect(Array.from(container.querySelectorAll('select'))).toHaveLength(1);
  });
});
