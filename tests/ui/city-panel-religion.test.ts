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

describe('#593 MR6 — city panel loyalty row', () => {
  // Loyalty progress is only ever real on a NON-human-owned city (isLoyaltyTrackEligible
  // excludes human owners unconditionally -- "Humans NEVER flip"). makeWonderPanelFixture's
  // primary city ('city-river') is human-owned, so these tests target its non-human
  // 'city-rival' city instead, with an added bordering tile so the live eligibility
  // re-check (inline review fix) actually passes.
  function withRivalFaith(overrides: Partial<GameState> = {}) {
    const { container, city, state } = makeWonderPanelFixture();
    const rivalCity = state.cities['city-rival'];
    const borderTile = { q: 4, r: 5 };
    const withReligionState: GameState = {
      ...state,
      opponentChallenge: 'standard',
      religions: { 'religion-player': { id: 'religion-player', name: 'Order of Player', ownerCivId: city.owner, foundedTurn: 1 } },
      map: {
        ...state.map,
        tiles: {
          ...state.map.tiles,
          '4,5': { coord: borderTile, terrain: 'plains', elevation: 'lowland', resource: null, improvement: 'none', owner: city.owner, improvementTurnsLeft: 0, hasRiver: false, wonder: null },
        },
      },
      ...overrides,
    };
    return { container, city: rivalCity, playerCivId: city.owner, state: withReligionState };
  }

  it('shows the pressuring civ name, current tick, and threshold when loyaltyProgress is active', () => {
    const { container, city, playerCivId, state } = withRivalFaith();
    const withCityFaith: GameState = {
      ...state,
      cityFaith: { [city.id]: { religionId: 'religion-player', loyaltyProgress: { toCivId: playerCivId, points: 90, sinceOwnerId: city.owner } } },
    };
    const panel = createCityPanel(container, city, withCityFaith, { onBuild: () => {}, onOpenWonderPanel: () => {}, onClose: () => {} });
    expect(panel.textContent).toContain('Loyalty to Player');
    expect(panel.textContent).toContain('90');
    expect(panel.textContent).toContain('180');
  });

  it('shows a garrisoned-paused suffix when a friendly unit occupies the city', () => {
    const { container, city, playerCivId, state } = withRivalFaith();
    const withCityFaith: GameState = {
      ...state,
      cityFaith: { [city.id]: { religionId: 'religion-player', loyaltyProgress: { toCivId: playerCivId, points: 90, sinceOwnerId: city.owner } } },
      units: {
        garrison1: {
          id: 'garrison1', type: 'warrior', owner: city.owner, position: city.position,
          movementPointsLeft: 2, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false,
        } as any,
      },
    };
    const panel = createCityPanel(container, city, withCityFaith, { onBuild: () => {}, onOpenWonderPanel: () => {}, onClose: () => {} });
    expect(panel.textContent).toContain('garrisoned');
  });

  it('shows a temple-halved suffix when the city has a temple', () => {
    const { container, city, playerCivId, state } = withRivalFaith();
    const templeCity = { ...city, buildings: ['temple'] };
    const withCityFaith: GameState = {
      ...state,
      cities: { ...state.cities, [city.id]: templeCity },
      cityFaith: { [city.id]: { religionId: 'religion-player', loyaltyProgress: { toCivId: playerCivId, points: 90, sinceOwnerId: city.owner } } },
    };
    const panel = createCityPanel(container, templeCity, withCityFaith, { onBuild: () => {}, onOpenWonderPanel: () => {}, onClose: () => {} });
    expect(panel.textContent).toContain('temple');
  });

  it('renders no loyalty row for a city with no active loyaltyProgress', () => {
    const { container, city, state } = withRivalFaith();
    const withCityFaith: GameState = {
      ...state,
      cityFaith: { [city.id]: { religionId: 'religion-player' } },
    };
    const panel = createCityPanel(container, city, withCityFaith, { onBuild: () => {}, onOpenWonderPanel: () => {}, onClose: () => {} });
    expect(panel.textContent).not.toContain('Loyalty to');
  });

  it('renders no loyalty row when loyaltyProgress is stale (city changed owner since it was recorded)', () => {
    const { container, city, playerCivId, state } = withRivalFaith();
    const withCityFaith: GameState = {
      ...state,
      cityFaith: { [city.id]: { religionId: 'religion-player', loyaltyProgress: { toCivId: playerCivId, points: 90, sinceOwnerId: 'some-other-former-owner' } } },
    };
    const panel = createCityPanel(container, city, withCityFaith, { onBuild: () => {}, onOpenWonderPanel: () => {}, onClose: () => {} });
    expect(panel.textContent).not.toContain('Loyalty to');
  });
});
