// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { GameState } from '@/core/types';
import { createCityPanel, createCityPanelView } from '@/ui/city-panel';
import { beginCityMaterialOccurrence } from '@/systems/city-production-materials';
import { hexKey } from '@/systems/hex-utils';
import { resourceGoodId } from '@/systems/trade-good-definitions';
import { makeLegendaryWonderFixture } from '../systems/helpers/legendary-wonder-fixture';

/**
 * #1506 MR09 task 9 — material truth in the city panel.
 *
 * A waiting head shows the exact missing recipe and no completion estimate; a funded head keeps
 * its estimate; a tail is visibly "planned, not reserved" and shows no timed suffix while the
 * head is waiting. The remove control still re-renders from the returned committed state.
 */

const iron = resourceGoodId('iron');

function materialState(ironStock: number, queue: string[]): GameState {
  const state = makeLegendaryWonderFixture({ completedTechs: ['bronze-working', 'philosophy', 'sacred-sites'] });
  const city = state.cities['city-river'];
  city.productionQueue = [...queue];
  city.productionProgress = 0;
  city.productionMaterials = { queueRevision: 0, activeOccurrence: 0, commitment: null };
  const center = state.map.tiles[hexKey(city.position)];
  if (center) center.resource = 'iron';
  state.materialReservesByCiv = {
    player: {
      balances: { [iron]: { native: ironStock, imported: 0 } },
      reservations: [],
      incoming: [],
      lastAccruedTurn: -1,
    },
  };
  return state;
}

function render(state: GameState, callbacks: Partial<Parameters<typeof createCityPanel>[3]> = {}) {
  const container = document.getElementById('panel-root')!;
  createCityPanel(container, state.cities['city-river'], state, {
    onBuild: () => {},
    onOpenWonderPanel: () => {},
    onClose: () => {},
    onRemoveQueueItem: () => {},
    ...callbacks,
  });
  return document.getElementById('city-panel') as HTMLElement;
}

beforeEach(() => {
  document.body.innerHTML = '<div id="panel-root"></div>';
});
afterEach(() => {
  document.body.innerHTML = '';
});

describe('#1506 MR09 task 9 — city material truth', () => {
  it('shows waiting materials with the exact deficit and no completion estimate', () => {
    const state = materialState(9, ['swordsman']);
    const panel = render(state);
    const text = panel.textContent ?? '';

    expect(panel.querySelector('[data-active-materials]')?.textContent).toContain('Waiting for materials');
    expect(panel.querySelector('[data-active-materials]')?.textContent).toContain('Iron');
    expect(panel.querySelector('[data-active-materials]')?.textContent).toContain('missing 1');
    expect(text).not.toContain('turns remaining');
    expect(text).toContain('Production-only effort');
  });

  it('keeps the ordinary estimate when the recipe is funded', () => {
    const state = materialState(10, ['swordsman']);
    const panel = render(state);
    const text = panel.textContent ?? '';

    expect(panel.querySelector('[data-active-materials]')?.textContent).toContain('Funded');
    expect(panel.querySelector('[data-active-materials]')?.textContent).toContain('10/10');
    expect(text).toContain('turns remaining');
    expect(text).not.toContain('Waiting for materials');
  });

  it('marks a tail entry planned, not reserved, and withholds its timed suffix while waiting', () => {
    const state = materialState(9, ['swordsman', 'granary']);
    const panel = render(state);
    const tail = panel.querySelector<HTMLElement>('[data-queue-index="1"]');
    expect(tail).not.toBeNull();
    const text = tail!.textContent ?? '';

    expect(text).toContain('Planned, not reserved');
    expect(text).not.toContain('Starts in');
    expect(text).not.toContain('Done in');
  });

  it('re-renders the queue from the state returned by the remove callback', () => {
    const state = materialState(9, ['swordsman', 'granary']);
    const onRemoveQueueItem = vi.fn((cityId: string, index: number) => {
      const next = structuredClone(state);
      next.cities[cityId].productionQueue.splice(index, 1);
      return next;
    });
    const panel = render(state, { onRemoveQueueItem });

    panel.querySelector<HTMLButtonElement>('[data-queue-action="remove"][data-queue-index="1"]')!.click();

    expect(onRemoveQueueItem).toHaveBeenCalledWith('city-river', 1);
    expect(document.querySelector('[data-queue-index="1"]')).toBeNull();
    expect(document.getElementById('city-panel')?.textContent).not.toContain('Granary');
  });

  it('shows the frozen soft-material term and its reserved allotment', () => {
    const state = makeLegendaryWonderFixture({ completedTechs: ['steam-power', 'steel-production', 'philosophy', 'sacred-sites'] });
    const city = state.cities['city-river'];
    city.productionQueue = ['factory'];
    city.productionMaterials = { queueRevision: 0, activeOccurrence: 0, commitment: null, softTerms: null };
    state.marketplace = {
      ...(state.marketplace ?? { prices: {}, priceHistory: {}, tradeRoutes: [] }),
      purchasedResources: [{ civId: 'player', resource: 'coal', expiresOnTurn: state.turn + 5 }],
    } as NonNullable<GameState['marketplace']>;
    state.materialReservesByCiv = {
      player: { balances: { [resourceGoodId('coal')]: { native: 5, imported: 0 } }, reservations: [], incoming: [] },
    };
    const activated = beginCityMaterialOccurrence(state, city.id);
    const panel = render(activated);

    const soft = panel.querySelector('[data-active-soft-terms]');
    expect(soft?.textContent).toContain('20% cheaper');
    expect(soft?.textContent).toContain('5 Coal reserved');
  });

  it('does not expose a foreign city’s reserve model to the viewer', () => {
    const state = materialState(9, ['swordsman']);
    state.currentPlayer = 'rival';
    const panel = render(state);
    expect(panel.querySelector('[data-active-materials]')).toBeNull();
    expect(panel.textContent).not.toContain('Waiting for materials');
  });

  it('preserves the open tab when a committed-state refresh rerenders the panel', () => {
    const state = materialState(10, ['swordsman']);
    const container = document.getElementById('panel-root')!;
    const view = createCityPanelView(container, state.cities['city-river'], state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
    });
    document.getElementById('tab-districts')!.click();
    expect(document.getElementById('city-districts-view')!.style.display).toBe('block');

    view.update({ ...state, turn: state.turn + 1 });
    expect(document.getElementById('city-districts-view')!.style.display).toBe('block');
  });
});
