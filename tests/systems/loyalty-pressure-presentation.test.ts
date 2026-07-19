import { describe, it, expect } from 'vitest';
import { getLoyaltyPressurePresentationForViewer } from '@/systems/loyalty-pressure-presentation';
import { makeLoyaltyFixture } from './helpers/religion-loyalty-fixture';

describe('#593 MR6 — getLoyaltyPressurePresentationForViewer', () => {
  it('shows a badge on the pressured city to the pressuring civ', () => {
    const { state, p1, p2City } = makeLoyaltyFixture();
    const seeded = {
      ...state,
      cityFaith: { [p2City]: { religionId: `religion-${p1}`, loyaltyProgress: { toCivId: p1, points: 50 } } },
      religions: { [`religion-${p1}`]: { id: `religion-${p1}`, name: 'Test', ownerCivId: p1, foundedTurn: 1 } },
    };
    const presentation = getLoyaltyPressurePresentationForViewer(seeded, p1);
    expect(presentation.cityBadges.map(b => b.cityId)).toContain(p2City);
  });

  it('shows a badge on the pressured city to the current (pressured) owner too', () => {
    const { state, p1, p2, p2City } = makeLoyaltyFixture();
    const seeded = {
      ...state,
      cityFaith: { [p2City]: { religionId: `religion-${p1}`, loyaltyProgress: { toCivId: p1, points: 50 } } },
      religions: { [`religion-${p1}`]: { id: `religion-${p1}`, name: 'Test', ownerCivId: p1, foundedTurn: 1 } },
    };
    const presentation = getLoyaltyPressurePresentationForViewer(seeded, p2);
    expect(presentation.cityBadges.map(b => b.cityId)).toContain(p2City);
  });

  it('shows no badge to an unrelated third civ', () => {
    const { state, p1, p2City } = makeLoyaltyFixture();
    const seeded = {
      ...state,
      cityFaith: { [p2City]: { religionId: `religion-${p1}`, loyaltyProgress: { toCivId: p1, points: 50 } } },
      religions: { [`religion-${p1}`]: { id: `religion-${p1}`, name: 'Test', ownerCivId: p1, foundedTurn: 1 } },
      civilizations: { ...state.civilizations, p3: { ...state.civilizations[p1], id: 'p3' } },
    };
    const presentation = getLoyaltyPressurePresentationForViewer(seeded, 'p3');
    expect(presentation.cityBadges).toHaveLength(0);
  });

  it('shows no badge once loyaltyProgress is not yet tracked (no active pressure)', () => {
    const { state, p1, p2City } = makeLoyaltyFixture();
    const presentation = getLoyaltyPressurePresentationForViewer(state, p1);
    expect(presentation.cityBadges.find(b => b.cityId === p2City)).toBeUndefined();
  });
});
