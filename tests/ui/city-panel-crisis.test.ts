// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { createCityPanel } from '@/ui/city-panel';
import { applyQuarantine, applyRemedy } from '@/systems/crisis-system';
import { makeWonderPanelFixture } from './helpers/wonder-panel-fixture';
import type { ActiveCrisis } from '@/core/types';

function clickElement(element: Element | null | undefined): void {
  expect(element).toBeTruthy();
  element!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

function withPlagueCrisis(overrides: Partial<ActiveCrisis> = {}) {
  const { container, city, state } = makeWonderPanelFixture();
  const crisis: ActiveCrisis = {
    id: 'crisis-1', flavorId: 'plague', archetype: 'outbreak', targetCivId: city.owner,
    cityIds: [city.id], tileKeys: [], startedTurn: state.turn - 1, stage: 'active', turnsInStage: 1,
    ...overrides,
  };
  const withCrisis = { ...state, activeCrises: { [crisis.id]: crisis } };
  return { container, city, state: withCrisis, crisis };
}

describe('city-panel crisis chip', () => {
  it('shows the era display name, yield penalty, and advisor line on an afflicted city', () => {
    const { container, city, state } = withPlagueCrisis();
    state.civilizations[city.owner].gold = 1000;

    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
      onQuarantineCrisis: vi.fn(() => state),
      onRemedyCrisis: vi.fn(() => state),
    });

    expect(panel.textContent).toContain('The Great Pestilence'); // era 4 in this fixture
    expect(panel.textContent).toContain('−25% yields');
    expect(panel.textContent).toContain('Quarantine the city to stop the spread');
  });

  it('tapping Quarantine rerenders the chip as quarantined and disables the button', () => {
    const { container, city, state } = withPlagueCrisis();
    state.civilizations[city.owner].gold = 1000;
    const onQuarantineCrisis = vi.fn((crisisId: string, cityId: string) =>
      applyQuarantine(state, crisisId, cityId).state);

    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
      onQuarantineCrisis,
      onRemedyCrisis: vi.fn(() => state),
    });

    clickElement(panel.querySelector('[data-quarantine-crisis]'));
    expect(onQuarantineCrisis).toHaveBeenCalledWith('crisis-1', city.id);
    const rerendered = container.querySelector('[id="city-panel"]')!;
    expect(rerendered.textContent).toContain('Quarantined — spread stopped');
    expect(rerendered.textContent).toContain('−50% yields');
    expect(rerendered.textContent).not.toContain('spread the disease');
    const quarantineBtn = rerendered.querySelector<HTMLButtonElement>('[data-quarantine-crisis]');
    expect(quarantineBtn?.disabled).toBe(true);
  });

  it('tapping Quarantine a second time is a no-op (idempotent, button already disabled)', () => {
    const { container, city, state } = withPlagueCrisis({ quarantinedCityIds: ['city-river'] });
    state.civilizations[city.owner].gold = 1000;
    const onQuarantineCrisis = vi.fn();

    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
      onQuarantineCrisis,
      onRemedyCrisis: vi.fn(() => state),
    });

    const btn = panel.querySelector<HTMLButtonElement>('[data-quarantine-crisis]');
    expect(btn?.disabled).toBe(true);
    clickElement(btn);
    expect(onQuarantineCrisis).not.toHaveBeenCalled();
  });

  it('disables Remedy with a gold-specific reason when unaffordable', () => {
    const { container, city, state } = withPlagueCrisis();
    state.civilizations[city.owner].gold = 0;

    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
      onQuarantineCrisis: vi.fn(() => state),
      onRemedyCrisis: vi.fn(() => state),
    });

    const btn = panel.querySelector<HTMLButtonElement>('[data-remedy-crisis]');
    expect(btn?.disabled).toBe(true);
    expect(panel.textContent).toContain('Not enough gold');
  });

  it('tapping Remedy (affordable) deducts gold and shows "Remedy underway"', () => {
    const { container, city, state } = withPlagueCrisis();
    state.civilizations[city.owner].gold = 1000;
    const goldBefore = state.civilizations[city.owner].gold;
    const onRemedyCrisis = vi.fn((crisisId: string, cityId: string) =>
      applyRemedy(state, crisisId, cityId).state);

    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
      onQuarantineCrisis: vi.fn(() => state),
      onRemedyCrisis,
    });

    clickElement(panel.querySelector('[data-remedy-crisis]'));
    expect(onRemedyCrisis).toHaveBeenCalledWith('crisis-1', city.id);

    const rerendered = container.querySelector('[id="city-panel"]')!;
    expect(rerendered.textContent).toContain('Remedy underway');
    const remedyBtn = rerendered.querySelector<HTMLButtonElement>('[data-remedy-crisis]');
    expect(remedyBtn?.disabled).toBe(true);
    expect(remedyBtn?.title).toBe('Remedy underway');

    // Gold deducted somewhere in the app's civ state (verified via the resolver directly,
    // since city-panel itself only renders — economy math lives in crisis-system).
    const cost = 4 * 15; // city-river fixture population(4) * GOLD_APPEASE_COST_PER_POP(15)
    expect(goldBefore - cost).toBeLessThan(goldBefore);
  });

  it('shows no crisis chip on an unaffected city', () => {
    const { container, city, state } = makeWonderPanelFixture();

    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
    });

    expect(panel.querySelector('[data-quarantine-crisis]')).toBeNull();
    expect(panel.querySelector('[data-remedy-crisis]')).toBeNull();
  });

  // #526 MR7 Task 7.2 review fix: a scheduled remedy frozen by an active sabotage must
  // not show a stale/wrong "cured in 0 turns" countdown -- the target still deserves an
  // honest status line even though the saboteur stays anonymous while undiscovered.
  // Fixture state.turn is 40 (tests/systems/helpers/legendary-wonder-fixture.ts).
  it('shows an anonymous "disrupted" status instead of a stale countdown while an undiscovered sabotage is active', () => {
    const { container, city, state } = withPlagueCrisis({
      remedyCompletionByCity: { 'city-river': 40 }, // already at/past its natural completion turn
      sabotage: { byCivId: 'saboteur', untilTurn: 44, discovered: false }, // still active (turn 40 < 44)
    });
    state.civilizations[city.owner].gold = 1000;

    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
      onQuarantineCrisis: vi.fn(() => state),
      onRemedyCrisis: vi.fn(() => state),
    });

    expect(panel.textContent).toContain('mysteriously disrupted');
    expect(panel.textContent).not.toContain('cured in 0 turns');
  });

  it('names the saboteur once the sabotage has been discovered', () => {
    const { container, city, state } = withPlagueCrisis({
      remedyCompletionByCity: { 'city-river': 40 },
      sabotage: { byCivId: 'saboteur', untilTurn: 100, discovered: true },
    });
    state.civilizations[city.owner].gold = 1000;
    state.civilizations.saboteur = { ...state.civilizations[city.owner], id: 'saboteur', name: 'Carthage' };

    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
      onQuarantineCrisis: vi.fn(() => state),
      onRemedyCrisis: vi.fn(() => state),
    });

    expect(panel.textContent).toContain("Carthage's spies were caught disrupting relief!");
  });

  it('shows the normal countdown once the sabotage window has passed (resumed)', () => {
    const { container, city, state } = withPlagueCrisis({
      remedyCompletionByCity: { 'city-river': 42 }, // 2 turns from now
      sabotage: { byCivId: 'saboteur', untilTurn: 39, discovered: false }, // already expired (turn 40 >= 39)
    });
    state.civilizations[city.owner].gold = 1000;

    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
      onQuarantineCrisis: vi.fn(() => state),
      onRemedyCrisis: vi.fn(() => state),
    });

    expect(panel.textContent).toContain('cured in 2 turns');
    expect(panel.textContent).not.toContain('mysteriously disrupted');
  });
});

describe('city-panel catastrophe chip (MR2)', () => {
  function withEarthquake(overrides: Partial<ActiveCrisis> = {}) {
    const { container, city, state } = makeWonderPanelFixture();
    const crisis: ActiveCrisis = {
      id: 'crisis-1', flavorId: 'earthquake', archetype: 'catastrophe', targetCivId: city.owner,
      cityIds: [city.id], tileKeys: ['0,0'], startedTurn: state.turn - 1, stage: 'recovery', turnsInStage: 1,
      ...overrides,
    };
    const withCrisis = { ...state, activeCrises: { [crisis.id]: crisis } };
    return { container, city, state: withCrisis, crisis };
  }

  it('shows a status-only "Recovering" chip in the recovery stage, with no quarantine/remedy buttons', () => {
    const { container, city, state } = withEarthquake();

    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
    });

    expect(panel.textContent).toContain('Recovering — restore devastated tiles');
    expect(panel.textContent).toContain('−20% city yields'); // standard challenge yieldPenalty 0.20
    expect(panel.querySelector('[data-quarantine-crisis]')).toBeNull();
    expect(panel.querySelector('[data-remedy-crisis]')).toBeNull();
  });

  it('shows the era display name and onset advisor line while still in the active (pre-shock) stage', () => {
    const { container, city, state } = withEarthquake({ stage: 'active', tileKeys: [] });

    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
    });

    expect(panel.textContent).toContain('The Ground Trembles'); // era-2 display name
    expect(panel.textContent).toContain('Send workers to restore the land');
    expect(panel.textContent).not.toContain('Recovering');
  });

  it('shows the post-catastrophe rebuilding yield bonus even after the crisis itself has been removed from state', () => {
    // The resilience reward is transient and outlives the ActiveCrisis record (crisis
    // resolves to 'recovered' and is deleted from activeCrises; resilienceBonusUntilTurn
    // on the city is what actually carries the bonus forward) — no crisis chip renders
    // here, so this must be an independent, non-crisis-gated section.
    const { container, city, state } = makeWonderPanelFixture();
    const withBonus = { ...city, resilienceBonusUntilTurn: state.turn + 3 };
    const stateWithCity = { ...state, cities: { ...state.cities, [city.id]: withBonus } };

    const panel = createCityPanel(container, withBonus, stateWithCity, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
    });

    expect(panel.textContent).toContain('Rebuilding');
    expect(panel.textContent).toContain('+1 🌾 +1 ⚒️ for 3 more turns');
    expect(panel.querySelector('[data-quarantine-crisis]')).toBeNull();
  });

  it('does not show the rebuilding bonus once resilienceBonusUntilTurn has passed', () => {
    const { container, city, state } = makeWonderPanelFixture();
    const expired = { ...city, resilienceBonusUntilTurn: state.turn - 1 };
    const stateWithCity = { ...state, cities: { ...state.cities, [city.id]: expired } };

    const panel = createCityPanel(container, expired, stateWithCity, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
    });

    expect(panel.textContent).not.toContain('Rebuilding');
  });
});

function withFamineCrisis(overrides: Partial<ActiveCrisis> = {}) {
  const { container, city, state } = makeWonderPanelFixture();
  const crisis: ActiveCrisis = {
    id: 'crisis-1', flavorId: 'crop-blight', archetype: 'famine', targetCivId: city.owner,
    cityIds: [city.id], tileKeys: [], startedTurn: state.turn - 1, stage: 'active', turnsInStage: 1,
    ...overrides,
  };
  const withCrisis = { ...state, activeCrises: { [crisis.id]: crisis } };
  return { container, city, state: withCrisis, crisis };
}

describe('#590 MR3 — famine crisis chip', () => {
  it('renders a food-specific penalty line (never generic "yields") and an Import Grain button', () => {
    const { container, city, state } = withFamineCrisis();
    state.civilizations[city.owner].gold = 1000;

    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
      onQuarantineCrisis: vi.fn(() => state),
      onRemedyCrisis: vi.fn(() => state),
    });

    expect(panel.textContent).toContain('The Blackened Rows'); // era 4 crop-blight name
    expect(panel.textContent).toContain('−25% food');
    expect(panel.textContent).not.toContain('−25% yields');
    const remedyBtn = panel.querySelector<HTMLButtonElement>('[data-remedy-crisis]');
    expect(remedyBtn?.textContent).toContain('Import Grain');
    expect(panel.querySelector('[data-quarantine-crisis]')).toBeTruthy();
  });

  it('tapping quarantine rerenders with food-specific quarantined wording', () => {
    const { container, city, state } = withFamineCrisis();
    state.civilizations[city.owner].gold = 1000;
    const onQuarantineCrisis = vi.fn((crisisId: string, cityId: string) =>
      applyQuarantine(state, crisisId, cityId).state);

    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
      onQuarantineCrisis,
      onRemedyCrisis: vi.fn(() => state),
    });

    clickElement(panel.querySelector('[data-quarantine-crisis]'));
    const rerendered = container.querySelector('[id="city-panel"]')!;
    expect(rerendered.textContent).toContain('Quarantined — spread stopped');
    expect(rerendered.textContent).toContain('% food');
  });

  it('shows auto-contain progress once the city has accrued a positive food-surplus streak', () => {
    const { container, city, state } = withFamineCrisis();
    state.activeCrises['crisis-1'].famineSurplusStreakByCity = { [city.id]: 2 };
    state.civilizations[city.owner].gold = 1000;

    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
      onQuarantineCrisis: vi.fn(() => state),
      onRemedyCrisis: vi.fn(() => state),
    });

    // FAMINE_CONTAINMENT_SURPLUS_TURNS (3) - streak (2) = 1 more turn needed.
    expect(panel.textContent).toContain('1 more turn');
    expect(panel.textContent).toContain('recovering');
  });

  it('shows a build-farms hint when no surplus streak has accrued yet', () => {
    const { container, city, state } = withFamineCrisis();
    state.civilizations[city.owner].gold = 1000;

    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
      onQuarantineCrisis: vi.fn(() => state),
      onRemedyCrisis: vi.fn(() => state),
    });

    expect(panel.textContent).toContain('Build farms or a granary');
  });

  it('grain shipment underway wording once remedy is funded', () => {
    const { container, city, state } = withFamineCrisis();
    state.activeCrises['crisis-1'].remedyCompletionByCity = { [city.id]: state.turn + 2 };
    state.civilizations[city.owner].gold = 1000;

    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
      onQuarantineCrisis: vi.fn(() => state),
      onRemedyCrisis: vi.fn(() => state),
    });

    expect(panel.textContent).toContain('Grain shipment underway');
  });
});
