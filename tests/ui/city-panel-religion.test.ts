// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { createCityPanel } from '@/ui/city-panel';
import { makeWonderPanelFixture } from './helpers/wonder-panel-fixture';
import type { GameState } from '@/core/types';

function withFaith(overrides: Partial<GameState> = {}) {
  const { container, city, state } = makeWonderPanelFixture();
  const withReligionState: GameState = {
    ...state,
    religions: { 'religion-owner': { id: 'religion-owner', name: 'Order of Test', ownerCivId: city.owner, foundedTurn: 1 } },
    ...overrides,
  };
  return { container, city, state: withReligionState };
}

describe('#591 MR4 — city panel Faith row', () => {
  it('shows "Holy City of {name}" for the founding city', () => {
    const { container, city, state } = withFaith();
    const withCityFaith = { ...state, cityFaith: { [city.id]: { religionId: 'religion-owner', isHolyCity: true as const } } };
    const panel = createCityPanel(container, city, withCityFaith, { onBuild: () => {}, onOpenWonderPanel: () => {}, onClose: () => {} });
    expect(panel.textContent).toContain('Holy City of Order of Test');
  });

  it('shows "Follows {name}" for a settled follower (no conversionProgress)', () => {
    const { container, city, state } = withFaith();
    const withCityFaith = { ...state, cityFaith: { [city.id]: { religionId: 'religion-owner' } } };
    const panel = createCityPanel(container, city, withCityFaith, { onBuild: () => {}, onOpenWonderPanel: () => {}, onClose: () => {} });
    expect(panel.textContent).toContain('Follows Order of Test');
  });

  it('shows in-progress conversion with a derived turns-remaining figure', () => {
    const { container, city, state } = withFaith();
    const withCityFaith: GameState = {
      ...state,
      cityFaith: { [city.id]: { religionId: 'religion-owner', conversionProgress: { 'religion-owner': 85 } } },
    };
    const panel = createCityPanel(container, city, withCityFaith, { onBuild: () => {}, onOpenWonderPanel: () => {}, onClose: () => {} });
    expect(panel.textContent).toContain('Converting to Order of Test');
    expect(panel.textContent).toContain('turn');
  });

  it('renders no Faith row when the city has no faith', () => {
    const { container, city, state } = withFaith();
    const panel = createCityPanel(container, city, state, { onBuild: () => {}, onOpenWonderPanel: () => {}, onClose: () => {} });
    expect(panel.textContent).not.toContain('Faith');
  });
});
