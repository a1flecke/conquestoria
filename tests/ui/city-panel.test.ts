import { describe, it, expect, vi } from 'vitest';
import { createCityPanel } from '@/ui/city-panel';
import { makeWonderPanelFixture } from './helpers/wonder-panel-fixture';
import type { City } from '@/core/types';

describe('city-panel legendary wonders', () => {
  it('renders a Legendary Wonders entry point and shows carryover in the active city', () => {
    const { container, city, state } = makeWonderPanelFixture();

    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
    });

    const rendered = (panel as unknown as { innerHTML?: string; textContent?: string }).innerHTML ?? panel.textContent ?? '';
    expect(rendered).toContain('Legendary Wonders');
    expect(rendered).toContain('Wonder carryover');
  });
});

describe('city-panel navigation', () => {
  function makeMultiCityFixture() {
    const { container, city, state } = makeWonderPanelFixture();
    const city2: City = {
      ...city,
      id: 'city-2',
      name: 'SecondCity',
    };
    state.cities['city-2'] = city2;
    state.civilizations[state.currentPlayer].cities = [city.id, 'city-2'];
    return { container, city, city2, state };
  }

  it('renders prev and next buttons when onPrevCity and onNextCity callbacks are provided', () => {
    const { container, city, state } = makeMultiCityFixture();
    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
      onPrevCity: () => {},
      onNextCity: () => {},
    });
    const html = (panel as unknown as { innerHTML?: string }).innerHTML ?? '';
    expect(html).toContain('city-prev');
    expect(html).toContain('city-next');
  });

  it('does not render nav buttons when no onPrevCity/onNextCity callbacks are provided', () => {
    const { container, city, state } = makeMultiCityFixture();
    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
    });
    const html = (panel as unknown as { innerHTML?: string }).innerHTML ?? '';
    expect(html).not.toContain('city-prev');
    expect(html).not.toContain('city-next');
  });

  it('calls onPrevCity when prev button is clicked', () => {
    const { container, city, state } = makeMultiCityFixture();
    const onPrev = vi.fn();
    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
      onPrevCity: onPrev,
      onNextCity: () => {},
    });
    const prevBtn = (panel as unknown as { querySelector: (s: string) => { click?: () => void } | null }).querySelector('#city-prev');
    prevBtn?.click?.();
    expect(onPrev).toHaveBeenCalledOnce();
  });

  it('calls onNextCity when next button is clicked', () => {
    const { container, city, state } = makeMultiCityFixture();
    const onNext = vi.fn();
    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
      onPrevCity: () => {},
      onNextCity: onNext,
    });
    const nextBtn = (panel as unknown as { querySelector: (s: string) => { click?: () => void } | null }).querySelector('#city-next');
    nextBtn?.click?.();
    expect(onNext).toHaveBeenCalledOnce();
  });

  it('shows ETA text for buildable units and buildings', () => {
    const { container, city, state } = makeMultiCityFixture();
    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
    });

    const rendered = (panel as unknown as { innerHTML?: string; textContent?: string }).innerHTML ?? panel.textContent ?? '';
    expect(rendered).toContain('turns');
  });

  it('shows occupied-city integration countdown', () => {
    const { container, city, state } = makeMultiCityFixture();
    city.occupation = { originalOwnerId: 'ai-1', turnsRemaining: 7 };

    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
    });
    const rendered = (panel as unknown as { innerHTML?: string; textContent?: string }).innerHTML ?? panel.textContent ?? '';

    expect(rendered).toContain('Occupied');
    expect(rendered).toContain('7 turns');
  });

  it('shows occupation-reduced yields and build eta', () => {
    const { container, city, state } = makeMultiCityFixture();
    city.population = 4;
    city.buildings = ['granary'];
    city.productionQueue = ['library'];
    city.productionProgress = 0;
    city.occupation = { originalOwnerId: 'ai-1', turnsRemaining: 8 };

    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
    });
    const rendered = (panel as unknown as { innerHTML?: string; textContent?: string }).innerHTML ?? panel.textContent ?? '';

    expect(rendered).toContain('Very Unhappy');
    expect(rendered).toContain('turns remaining');
  });

  it('renders production queue rows with move and remove controls', () => {
    const { container, city, state } = makeMultiCityFixture();
    city.productionQueue = ['warrior', 'shrine', 'worker'];

    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onMoveQueueItem: () => {},
      onRemoveQueueItem: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
    } as any);

    const rendered = (panel as unknown as { innerHTML?: string; textContent?: string }).innerHTML ?? panel.textContent ?? '';
    expect(rendered).toContain('Queue');
    expect(rendered).toContain('data-queue-action="remove"');
  });
});
