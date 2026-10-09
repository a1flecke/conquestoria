// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { createCityPanel } from '@/ui/city-panel';
import { EventBus } from '@/core/event-bus';
import type { City, GameState } from '@/core/types';
import { calculateProjectedCityYields } from '@/systems/city-work-system';
import { getProductionCostForCivItem } from '@/systems/production-cost-context';
import { removeCityProductionItem, reorderCityProduction } from '@/systems/planning-system';
import { rushBuyActiveProduction } from '@/systems/rush-buy-system';
import { collectText, makeWonderPanelFixture } from './helpers/wonder-panel-fixture';
import { describeHeadChangeLoss, describeProductionDecision, headChangeConfirmLabel } from '@/ui/production-decision-copy';
import { getProductionDecision } from '@/systems/production-decision';

const cb = () => ({ onBuild: () => {}, onOpenWonderPanel: () => {}, onClose: () => {} });

function click(element: Element | null | undefined): void {
  expect(element).toBeTruthy();
  element!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

function fixture() {
  const { container, city, state } = makeWonderPanelFixture();
  state.civilizations[state.currentPlayer].gold = 5000;
  city.productionQueue = [];
  city.productionProgress = 0;
  const production = calculateProjectedCityYields(state, city.id).production;
  return { container, city, state, production };
}

/** An item the city cannot finish in one turn at its fixture production. */
function slowItem(state: GameState, cityId: string, production: number): string {
  const id = ['workshop', 'granary', 'library', 'marketplace'].find(candidate =>
    getProductionCostForCivItem(state, state.currentPlayer, cityId, candidate) > production * 2);
  expect(id, 'fixture needs an item costing more than two turns of production').toBeTruthy();
  return id!;
}

describe('city panel: rush-buy explanation (production-decision arc)', () => {
  it('tells the player an item the city finishes next turn does not need gold, but keeps Buy available', () => {
    const { container, city, state, production } = fixture();
    city.productionQueue = ['warrior'];
    city.productionProgress = Math.max(0, getProductionCostForCivItem(state, state.currentPlayer, city.id, 'warrior') - production);
    const onRush = vi.fn(() => state);

    const panel = createCityPanel(container, city, state, { ...cb(), onRushBuyActiveProduction: onRush });

    const note = panel.querySelector('[data-rush-note]')!;
    expect(note.textContent).toBe('This city is expected to finish this item next turn without spending gold. Buying now completes it immediately.');
    const button = panel.querySelector<HTMLButtonElement>('[data-rush-buy]')!;
    expect(button.disabled).toBe(false); // legal actions stay available
    click(button);
    expect(onRush).toHaveBeenCalledWith(city.id);
    // The same decision the note came from is what the simulation then does: the city really finishes it.
    expect(getProductionDecision(state, state.currentPlayer, city.id, { productionPerTurn: production })!.finishesThisTurn).toBe(true);
  });

  it('says how many turns a purchase saves when production would take longer', () => {
    const { container, city, state, production } = fixture();
    const item = slowItem(state, city.id, production);
    city.productionQueue = [item];
    const decision = getProductionDecision(state, state.currentPlayer, city.id, { productionPerTurn: production })!;
    expect(decision.rush.turnsSaved).toBeGreaterThanOrEqual(2);

    const panel = createCityPanel(container, city, state, { ...cb(), onRushBuyActiveProduction: () => state });

    expect(panel.querySelector('[data-rush-note]')!.textContent)
      .toBe(`Buying now finishes this about ${decision.rush.turnsSaved} turns sooner than waiting.`);
  });

  it('shows no redundancy note when the purchase is disabled for treasury reasons (its own reason stands)', () => {
    const { container, city, state, production } = fixture();
    city.productionQueue = ['warrior'];
    city.productionProgress = 7;
    state.civilizations[state.currentPlayer].gold = 0;
    void production;

    const panel = createCityPanel(container, city, state, { ...cb(), onRushBuyActiveProduction: () => state });

    expect(panel.querySelector('[data-rush-note]')).toBeNull();
    expect(panel.querySelector<HTMLButtonElement>('[data-rush-buy]')!.disabled).toBe(true);
  });

  it('a purchase from the panel still completes the item through the canonical command', () => {
    const { container, city, state, production } = fixture();
    const item = slowItem(state, city.id, production);
    city.productionQueue = [item];
    let current = state;

    const panel = createCityPanel(container, city, state, {
      ...cb(),
      onRushBuyActiveProduction: cityId => {
        const result = rushBuyActiveProduction(current, current.currentPlayer, cityId, new EventBus());
        if (result.success) current = result.state;
        return current;
      },
    });
    click(panel.querySelector('[data-rush-buy]'));

    expect(current.cities[city.id]!.productionQueue).toEqual([]);
    expect(current.civilizations[current.currentPlayer].gold).toBeLessThan(5000);
  });
});

describe('city panel: queue-head change consequence', () => {
  function queued() {
    const f = fixture();
    f.city.productionQueue = ['warrior', 'workshop', 'granary'];
    f.city.productionProgress = 6;
    return f;
  }

  it('warns, with the real number, beside the item that would replace the active one', () => {
    const { container, city, state } = queued();
    const panel = createCityPanel(container, city, state, cb());

    const warning = panel.querySelector('[data-queue-index="1"] [data-head-change-warning]')!;
    expect(warning.textContent).toBe('Moving this to the front replaces the current project and loses 6 stored production.');
    expect(panel.querySelector('[data-queue-index="2"] [data-head-change-warning]')).toBeNull();
  });

  it('does not warn when nothing is stored', () => {
    const { container, city, state } = queued();
    city.productionProgress = 0;
    const panel = createCityPanel(container, city, state, cb());
    expect(panel.querySelector('[data-head-change-warning]')).toBeNull();
  });

  it('needs a second, explicit tap before erasing stored production, then performs the real reorder', () => {
    const { container, city, state } = queued();
    let current = state;
    const onMove = vi.fn((cityId: string, from: number, to: number) => {
      const target = current.cities[cityId]!;
      current = { ...current, cities: { ...current.cities, [cityId]: reorderCityProduction(target, from, to) } };
      return current;
    });
    createCityPanel(container, city, state, { ...cb(), onMoveQueueItem: onMove });

    const up = () => container.querySelector<HTMLButtonElement>('[data-queue-action="up"][data-queue-index="1"]')!;
    click(up());
    expect(onMove).not.toHaveBeenCalled(); // armed, not committed
    expect(up().textContent).toBe(headChangeConfirmLabel(6));
    expect(current.cities[city.id]!.productionProgress).toBe(6);

    click(up());
    expect(onMove).toHaveBeenCalledWith(city.id, 1, 0);
    expect(current.cities[city.id]!.productionQueue[0]).toBe('workshop');
    expect(current.cities[city.id]!.productionProgress).toBe(0); // exactly the loss the warning named
  });

  it('reordering behind the active item is a single tap and keeps progress', () => {
    const { container, city, state } = queued();
    let current = state;
    const onMove = vi.fn((cityId: string, from: number, to: number) => {
      const target = current.cities[cityId]!;
      current = { ...current, cities: { ...current.cities, [cityId]: reorderCityProduction(target, from, to) } };
      return current;
    });
    createCityPanel(container, city, state, { ...cb(), onMoveQueueItem: onMove });

    click(container.querySelector('[data-queue-action="up"][data-queue-index="2"]'));

    expect(onMove).toHaveBeenCalledWith(city.id, 2, 1);
    expect(current.cities[city.id]!.productionQueue).toEqual(['warrior', 'granary', 'workshop']);
    expect(current.cities[city.id]!.productionProgress).toBe(6);
  });

  it('removing a queued (non-active) item is a single tap and keeps progress', () => {
    const { container, city, state } = queued();
    let current = state;
    createCityPanel(container, city, state, {
      ...cb(),
      onRemoveQueueItem: (cityId, index) => {
        current = { ...current, cities: { ...current.cities, [cityId]: removeCityProductionItem(current.cities[cityId]!, index) } };
        return current;
      },
    });

    click(container.querySelector('[data-queue-action="remove"][data-queue-index="1"]'));

    expect(current.cities[city.id]!.productionQueue).toEqual(['warrior', 'granary']);
    expect(current.cities[city.id]!.productionProgress).toBe(6);
  });
});

describe('city panel: overflow, estimates and conversion honesty', () => {
  it('explains discarded surplus only when the city would actually produce more than the item needs', () => {
    const { container, city, state, production } = fixture();
    city.productionQueue = ['warrior'];
    city.productionProgress = 0;
    const cost = getProductionCostForCivItem(state, state.currentPlayer, city.id, 'warrior');
    const panel = createCityPanel(container, city, state, cb());
    const note = panel.querySelector('[data-overflow-note]');
    if (production > cost) {
      expect(note!.textContent).toContain(`about ${production - cost} production`);
      expect(note!.textContent).toContain('3d-printing');
    } else {
      expect(note).toBeNull(); // no surplus => no warning
    }
  });

  it('with surplus and no 3d-printing, states the real rule; with it and a queued item, says it carries', () => {
    const { container, city, state } = fixture();
    city.productionQueue = ['warrior', 'workshop'];
    city.productionProgress = 0;
    const cost = getProductionCostForCivItem(state, state.currentPlayer, city.id, 'warrior');
    // Force a surplus by storing almost the whole cost.
    city.productionProgress = cost - 1;

    const without = createCityPanel(container, city, state, cb());
    const withoutNote = without.querySelector('[data-overflow-note]')!.textContent!;
    expect(withoutNote).toMatch(/would be lost/);
    expect(withoutNote).toContain('3d-printing');
    expect(withoutNote).toContain('another item is queued');

    state.civilizations[state.currentPlayer].techState.completed.push('3d-printing');
    city.productionProgress = getProductionCostForCivItem(state, state.currentPlayer, city.id, 'warrior') - 1;
    const withTech = createCityPanel(container, city, state, cb());
    expect(withTech.querySelector('[data-overflow-note]')!.textContent).toMatch(/will carry over to the next queued item/);
  });

  it('labels turns remaining as an estimate and never shows an ETA for a locked city', () => {
    const { container, city, state, production } = fixture();
    city.productionQueue = [slowItem(state, city.id, production)];
    const open = createCityPanel(container, city, state, cb());
    expect(collectText(open)).toContain('(estimate from current production)');

    city.unrestLevel = 2; // production locked
    const locked = createCityPanel(container, city, state, cb());
    expect(locked.querySelector('[data-production-stalled]')!.textContent)
      .toContain('Production is paused in this city right now');
    expect(collectText(locked)).toContain('∞ turns remaining');
  });

  it('idle conversion: a selected mode is described as paused while something is queued', () => {
    const { container, city, state } = fixture();
    city.idleProduction = 'gold';
    city.productionQueue = ['warrior'];
    const queuedPanel = createCityPanel(container, city, state, cb());
    expect(queuedPanel.querySelector('[data-idle-dormant]')!.textContent).toContain('paused while something is queued');

    city.productionQueue = [];
    const emptyPanel = createCityPanel(container, city, state, cb());
    expect(emptyPanel.querySelector('[data-idle-dormant]')).toBeNull();
  });

  it('follow-up timings never say a covered item starts in 0 turns', () => {
    const { container, city, state, production } = fixture();
    city.productionQueue = ['warrior', 'workshop'];
    city.productionProgress = getProductionCostForCivItem(state, state.currentPlayer, city.id, 'warrior');
    void production;
    const panel = createCityPanel(container, city, state, cb());
    expect(collectText(panel)).not.toContain('Starts in 0 turns');
  });
});

describe('hot seat: the panel reads only its owner', () => {
  it('the decision for another civ asking about this city is empty, so nothing of it can render', () => {
    const { city, state } = fixture();
    city.productionQueue = ['warrior'];
    expect(getProductionDecision(state, 'rival', city.id)).toBeNull();
  });

  it('shows the active player\'s own city numbers regardless of who else is in the game', () => {
    const { container, city, state, production } = fixture();
    city.productionQueue = [slowItem(state, city.id, production)];
    state.civilizations.rival ??= { ...state.civilizations[state.currentPlayer], id: 'rival' };
    const before = collectText(createCityPanel(container, city, state, cb()));
    state.civilizations.rival!.gold = 99999; // a rival's treasury must not move this panel
    const after = collectText(createCityPanel(container, city, state, cb()));
    expect(after).toBe(before);
  });
});

describe('production-decision copy', () => {
  it('says nothing for an empty decision and names real numbers otherwise', () => {
    expect(describeProductionDecision(null)).toEqual({ rushNote: null, overflowNote: null, stalledNote: null });
    expect(describeHeadChangeLoss(0)).toBeNull();
    expect(describeHeadChangeLoss(42)).toBe('Moving this to the front replaces the current project and loses 42 stored production.');
    expect(headChangeConfirmLabel(42)).toBe('Lose 42?');
  });
});

// Keep the City type referenced so a fixture shape change fails loudly here rather than silently.
export type _CityShape = Pick<City, 'productionQueue' | 'productionProgress' | 'idleProduction'>;
