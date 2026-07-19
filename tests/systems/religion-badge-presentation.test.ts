import { describe, it, expect } from 'vitest';
import { getReligionBadgePresentationForViewer } from '@/systems/religion-badge-presentation';
import { makeLoyaltyFixture } from './helpers/religion-loyalty-fixture';

describe('#594 MR7 — getReligionBadgePresentationForViewer', () => {
  it('shows a badge for a city that follows a religion, flagged isOwnFaith when the viewer owns that religion', () => {
    const { state, p1, p1City } = makeLoyaltyFixture();
    const seeded = {
      ...state,
      cityFaith: { [p1City]: { religionId: `religion-${p1}` } },
      religions: { [`religion-${p1}`]: { id: `religion-${p1}`, name: 'Order of Test', ownerCivId: p1, foundedTurn: 1 } },
    };
    const presentation = getReligionBadgePresentationForViewer(seeded, p1);
    expect(presentation.cityBadges).toEqual([{ cityId: p1City, coord: state.cities[p1City].position, isOwnFaith: true }]);
  });

  it('flags isOwnFaith false for a city following a religion owned by a different civ', () => {
    const { state, p1, p2, p2City } = makeLoyaltyFixture();
    const seeded = {
      ...state,
      cityFaith: { [p2City]: { religionId: `religion-${p1}` } },
      religions: { [`religion-${p1}`]: { id: `religion-${p1}`, name: 'Order of Test', ownerCivId: p1, foundedTurn: 1 } },
    };
    const presentation = getReligionBadgePresentationForViewer(seeded, p2);
    expect(presentation.cityBadges).toEqual([{ cityId: p2City, coord: state.cities[p2City].position, isOwnFaith: false }]);
  });

  it('omits a city with no cityFaith entry (no religion yet)', () => {
    const { state, p1 } = makeLoyaltyFixture();
    const presentation = getReligionBadgePresentationForViewer(state, p1);
    expect(presentation.cityBadges).toEqual([]);
  });

  it('omits a cityFaith entry whose religionId no longer resolves to a real religion', () => {
    const { state, p1, p1City } = makeLoyaltyFixture();
    const seeded = {
      ...state,
      cityFaith: { [p1City]: { religionId: 'religion-deleted' } },
      religions: {},
    };
    const presentation = getReligionBadgePresentationForViewer(seeded, p1);
    expect(presentation.cityBadges).toEqual([]);
  });
});
