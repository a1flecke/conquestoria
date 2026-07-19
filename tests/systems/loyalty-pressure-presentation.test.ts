import { describe, it, expect } from 'vitest';
import { getLoyaltyPressurePresentationForViewer } from '@/systems/loyalty-pressure-presentation';
import { makeLoyaltyFixture } from './helpers/religion-loyalty-fixture';

describe('#593 MR6 — getLoyaltyPressurePresentationForViewer', () => {
  it('shows a badge on the pressured city to the pressuring civ', () => {
    const { state, p1, p2, p2City } = makeLoyaltyFixture();
    const seeded = {
      ...state,
      cityFaith: { [p2City]: { religionId: `religion-${p1}`, loyaltyProgress: { toCivId: p1, points: 50, sinceOwnerId: p2 } } },
      religions: { [`religion-${p1}`]: { id: `religion-${p1}`, name: 'Test', ownerCivId: p1, foundedTurn: 1 } },
    };
    const presentation = getLoyaltyPressurePresentationForViewer(seeded, p1);
    expect(presentation.cityBadges.map(b => b.cityId)).toContain(p2City);
  });

  it('shows a badge on the pressured city to the current (pressured) owner too', () => {
    const { state, p1, p2, p2City } = makeLoyaltyFixture();
    const seeded = {
      ...state,
      cityFaith: { [p2City]: { religionId: `religion-${p1}`, loyaltyProgress: { toCivId: p1, points: 50, sinceOwnerId: p2 } } },
      religions: { [`religion-${p1}`]: { id: `religion-${p1}`, name: 'Test', ownerCivId: p1, foundedTurn: 1 } },
    };
    const presentation = getLoyaltyPressurePresentationForViewer(seeded, p2);
    expect(presentation.cityBadges.map(b => b.cityId)).toContain(p2City);
  });

  it('shows no badge to an unrelated third civ', () => {
    const { state, p1, p2, p2City } = makeLoyaltyFixture();
    const seeded = {
      ...state,
      cityFaith: { [p2City]: { religionId: `religion-${p1}`, loyaltyProgress: { toCivId: p1, points: 50, sinceOwnerId: p2 } } },
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

  it('inline review fix: hides the badge for a human-owned city with stale loyaltyProgress from before it was captured', () => {
    const { state, p1, p2City } = makeLoyaltyFixture();
    // p1 (the fixture's human civ) somehow ended up owning p2City this same turn (e.g. a
    // combat capture) while the stale record still says it was mid-flip toward p1 itself
    // under the PREVIOUS (p2) owner -- isLoyaltyTrackEligible must reject this for a
    // human-owned city regardless of what the stored record says.
    const seeded = {
      ...state,
      cities: { ...state.cities, [p2City]: { ...state.cities[p2City], owner: p1 } },
      cityFaith: { [p2City]: { religionId: `religion-${p1}`, loyaltyProgress: { toCivId: p1, points: 170, sinceOwnerId: 'p2' } } },
      religions: { [`religion-${p1}`]: { id: `religion-${p1}`, name: 'Test', ownerCivId: p1, foundedTurn: 1 } },
    };
    const presentation = getLoyaltyPressurePresentationForViewer(seeded, p1);
    expect(presentation.cityBadges.find(b => b.cityId === p2City)).toBeUndefined();
  });
});
