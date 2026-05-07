// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import type { GameState, Unit } from '@/core/types';
import { renderUnitStackPanel } from '@/ui/unit-stack-panel';

function unit(id: string, type: Unit['type'], overrides: Partial<Unit> = {}): Unit {
  return {
    id,
    type,
    owner: 'player',
    position: { q: 2, r: 1 },
    movementPointsLeft: 2,
    health: 100,
    experience: 0,
    hasMoved: false,
    hasActed: false,
    isResting: false,
    ...overrides,
  };
}

function stateWithStack(): GameState {
  return {
    currentPlayer: 'player',
    turn: 3,
    era: 1,
    map: { width: 10, height: 10, wrapsHorizontally: false, tiles: {}, rivers: [] },
    units: {
      warrior: unit('warrior', 'warrior'),
      worker: unit('worker', 'worker', { movementPointsLeft: 0 }),
      scout: unit('scout', 'scout', { movementPointsLeft: 3 }),
    },
    cities: {
      city: {
        id: 'city',
        name: 'Roma',
        owner: 'player',
        position: { q: 2, r: 1 },
        population: 2,
        food: 0,
        foodNeeded: 10,
        buildings: [],
        productionQueue: [],
        productionProgress: 0,
        ownedTiles: [{ q: 2, r: 1 }],
        grid: [],
        gridSize: 3,
        unrestLevel: 0,
        unrestTurns: 0,
        spyUnrestBonus: 0,
      },
    },
    civilizations: {
      player: { id: 'player', name: 'Player', color: '#4a90d9', units: ['warrior', 'worker', 'scout'], cities: ['city'] },
    },
  } as unknown as GameState;
}

describe('unit stack panel', () => {
  it('renders every stacked unit and keeps spent units reachable', () => {
    const container = document.createElement('div');

    renderUnitStackPanel(container, stateWithStack(), { q: 2, r: 1 }, ['warrior', 'worker', 'scout'], {
      onSelectUnit: () => {},
    }, { selectedUnitId: 'warrior' });

    const rows = Array.from(container.querySelectorAll('[data-unit-stack-item]'));
    expect(rows.map(row => row.getAttribute('data-unit-id'))).toEqual(['warrior', 'scout', 'worker']);
    expect(container.textContent).toContain('3 units at Roma');
    expect(container.textContent).toContain('Warrior');
    expect(container.textContent).toContain('Scout');
    expect(container.textContent).toContain('Worker');
    expect(container.textContent).toContain('Spent');
  });

  it('fires onSelectUnit with the clicked unit id', () => {
    const container = document.createElement('div');
    let selected: string | null = null;

    renderUnitStackPanel(container, stateWithStack(), { q: 2, r: 1 }, ['warrior', 'worker', 'scout'], {
      onSelectUnit: unitId => { selected = unitId; },
    });

    (container.querySelector('[data-unit-id="worker"]') as HTMLButtonElement).click();

    expect(selected).toBe('worker');
  });

  it('renders a friendly city action for city stacks', () => {
    const container = document.createElement('div');
    let openedCity: string | null = null;

    renderUnitStackPanel(container, stateWithStack(), { q: 2, r: 1 }, ['warrior', 'worker'], {
      onSelectUnit: () => {},
      onOpenCity: cityId => { openedCity = cityId; },
    });

    const cityButton = container.querySelector('[data-stack-action="open-city"]') as HTMLButtonElement;
    expect(cityButton.textContent).toContain('Open Roma');
    cityButton.click();
    expect(openedCity).toBe('city');
  });

  it('shows XP and veterancy for each stacked unit', () => {
    const state = stateWithStack();
    state.units.warrior = { ...state.units.warrior, experience: 25 };
    const container = document.createElement('div');

    renderUnitStackPanel(container, state, { q: 2, r: 1 }, ['warrior'], {
      onSelectUnit: () => {},
    });

    expect(container.textContent).toContain('Veteran');
    expect(container.textContent).toContain('XP 25');
  });
});
