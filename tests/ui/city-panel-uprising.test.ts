// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { createCityPanel } from '@/ui/city-panel';
import { concedeToMovement, getCityAppeaseCost, getConcessionCost } from '@/systems/faction-system';
import { makeWonderPanelFixture } from './helpers/wonder-panel-fixture';
import type { City, GameState } from '@/core/types';

function clickElement(element: Element | null | undefined): void {
  expect(element).toBeTruthy();
  element!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

// city-river sits at {q:2,r:2}; adds a same-owner neighbor at {q:4,r:2} (hex distance 2,
// within contagion range) already in open revolt, so city-river is the spread receiver.
function withRevoltingNeighbor(state: GameState, city: City) {
  const neighbor: City = {
    ...city,
    id: 'city-neighbor',
    name: 'Neighborton',
    position: { q: 4, r: 2 },
    unrestLevel: 2,
    unrestTurns: 5,
  };
  return {
    ...state,
    cities: { ...state.cities, [neighbor.id]: neighbor },
    civilizations: {
      ...state.civilizations,
      [city.owner]: {
        ...state.civilizations[city.owner],
        cities: [...state.civilizations[city.owner].cities, neighbor.id],
      },
    },
  };
}

describe('city-panel uprising contagion + concession (MR4)', () => {
  it('shows a spread warning naming the revolting neighbor when this city is stable and ungarrisoned', () => {
    const { container, city, state } = makeWonderPanelFixture();
    const withNeighbor = withRevoltingNeighbor(state, city);

    const panel = createCityPanel(container, city, withNeighbor, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
    });

    expect(panel.textContent).toContain('Unrest is spreading from Neighborton');
    expect(panel.textContent).toContain('garrison a unit to block it');
  });

  it('does not show a spread warning when this city is garrisoned (negative test)', () => {
    const { container, city, state } = makeWonderPanelFixture();
    const withNeighbor = withRevoltingNeighbor(state, city);
    const garrisoned = {
      ...withNeighbor,
      units: {
        ...withNeighbor.units,
        'unit-garrison': {
          id: 'unit-garrison', type: 'warrior' as const, owner: city.owner, position: city.position,
          movementPointsLeft: 2, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false,
        },
      },
    };

    const panel = createCityPanel(container, city, garrisoned, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
    });

    expect(panel.textContent).not.toContain('Unrest is spreading');
  });

  it('does not show a spread warning when this city is under concession immunity (negative test)', () => {
    const { container, city, state } = makeWonderPanelFixture();
    const withNeighbor = withRevoltingNeighbor(state, city);
    const immuneCity = { ...city, concessionImmunityUntilTurn: withNeighbor.turn + 5 };
    const withImmunity = { ...withNeighbor, cities: { ...withNeighbor.cities, [city.id]: immuneCity } };

    const panel = createCityPanel(container, immuneCity, withImmunity, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
    });

    expect(panel.textContent).not.toContain('Unrest is spreading');
  });

  it('shows both Appease and Concede buttons on a revolting city, with cost labels', () => {
    const { container, city, state } = makeWonderPanelFixture();
    const revolting = { ...city, unrestLevel: 2 as const, unrestTurns: 6 };
    const withCity = { ...state, cities: { ...state.cities, [city.id]: revolting } };
    withCity.civilizations[city.owner].gold = 1000;

    const panel = createCityPanel(container, revolting, withCity, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
      onAppeaseFaction: vi.fn(() => withCity),
      onConcedeToMovement: vi.fn(() => withCity),
    });

    const appeaseCost = getCityAppeaseCost(revolting);
    const concedeCost = getConcessionCost(withCity, revolting);
    expect(panel.textContent).toContain(`Appease (${appeaseCost} gold)`);
    expect(panel.textContent).toContain(`Concede (${concedeCost} gold)`);
  });

  it('disables Concede with a gold-specific reason when unaffordable', () => {
    const { container, city, state } = makeWonderPanelFixture();
    const revolting = { ...city, unrestLevel: 2 as const, unrestTurns: 6 };
    const withCity = { ...state, cities: { ...state.cities, [city.id]: revolting } };
    withCity.civilizations[city.owner].gold = 0;

    const panel = createCityPanel(container, revolting, withCity, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
      onConcedeToMovement: vi.fn(() => withCity),
    });

    const btn = panel.querySelector<HTMLButtonElement>('[data-concede]');
    expect(btn?.disabled).toBe(true);
    expect(panel.textContent).toContain('Not enough gold');
  });

  it('tapping Concede clears the unrest chip, deducts gold, and shows the immunity note', () => {
    const { container, city, state } = makeWonderPanelFixture();
    const revolting = { ...city, unrestLevel: 2 as const, unrestTurns: 6 };
    let withCity = { ...state, cities: { ...state.cities, [city.id]: revolting } };
    withCity.civilizations[city.owner].gold = 1000;
    const onConcedeToMovement = vi.fn((cityId: string) => {
      const result = concedeToMovement(withCity, cityId, city.owner);
      withCity = result.state;
      return result.state;
    });

    const panel = createCityPanel(container, revolting, withCity, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
      onConcedeToMovement,
    });

    clickElement(panel.querySelector('[data-concede]'));
    expect(onConcedeToMovement).toHaveBeenCalledWith(city.id);

    const rerendered = container.querySelector('[id="city-panel"]')!;
    expect(rerendered.textContent).toContain('Immune to unrest for 15 more turns');
    expect(rerendered.querySelector('[data-appease]')).toBeNull();
    expect(rerendered.querySelector('[data-concede]')).toBeNull();
    expect(withCity.civilizations[city.owner].gold).toBeLessThan(1000);
  });

  it('hides both Appease and Concede, and shows the immunity note, while under concession immunity', () => {
    const { container, city, state } = makeWonderPanelFixture();
    const immuneCity = { ...city, unrestLevel: 0 as const, concessionImmunityUntilTurn: state.turn + 10 };
    const withCity = { ...state, cities: { ...state.cities, [city.id]: immuneCity } };

    const panel = createCityPanel(container, immuneCity, withCity, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
      onAppeaseFaction: vi.fn(() => withCity),
      onConcedeToMovement: vi.fn(() => withCity),
    });

    expect(panel.textContent).toContain('Immune to unrest for 10 more turns');
    expect(panel.querySelector('[data-appease]')).toBeNull();
    expect(panel.querySelector('[data-concede]')).toBeNull();
  });
});
