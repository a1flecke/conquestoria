import { describe, it, expect } from 'vitest';
import { EventBus } from '@/core/event-bus';
import type { CityFaith, GameEvents } from '@/core/types';
import {
  getForeignFaithPressure, isLoyaltyTrackEligible, getLoyaltyThreshold, getLoyaltyTickAmount,
  executeLoyaltyDefection, setLoyaltyPoints, clearLoyaltyProgress,
} from '@/systems/religion-loyalty-system';
import { makeLoyaltyFixture } from './helpers/religion-loyalty-fixture';

describe('#593 MR6 — CityFaith.loyaltyProgress type', () => {
  it('accepts a loyaltyProgress record shape', () => {
    const faith: CityFaith = { religionId: 'religion-p1', loyaltyProgress: { toCivId: 'p2', points: 30 } };
    expect(faith.loyaltyProgress).toEqual({ toCivId: 'p2', points: 30 });
  });

  it('emits religion:loyalty-warning and religion:city-defected with the expected payload shape', () => {
    const bus = new EventBus();
    const warnings: GameEvents['religion:loyalty-warning'][] = [];
    const defections: GameEvents['religion:city-defected'][] = [];
    bus.on('religion:loyalty-warning', e => warnings.push(e));
    bus.on('religion:city-defected', e => defections.push(e));
    bus.emit('religion:loyalty-warning', { cityId: 'c1', pressuringCivId: 'p2', stage: 'start', turnsRemaining: 18 });
    bus.emit('religion:city-defected', { cityId: 'c1', fromCivId: 'p1', toCivId: 'p2' });
    expect(warnings).toHaveLength(1);
    expect(defections).toHaveLength(1);
  });
});

describe('#593 MR6 — getForeignFaithPressure / isLoyaltyTrackEligible', () => {
  it('is eligible when a non-human AI city follows a foreign faith bordering that faith owner territory', () => {
    const { state, p1, p2City } = makeLoyaltyFixture();
    const withFaith = {
      ...state,
      cityFaith: { [p2City]: { religionId: `religion-${p1}` } },
      religions: { [`religion-${p1}`]: { id: `religion-${p1}`, name: 'Test', ownerCivId: p1, foundedTurn: 1 } },
    };
    const result = isLoyaltyTrackEligible(withFaith, p2City);
    expect(result).not.toBeNull();
    expect(result!.pressuringCivId).toBe(p1);
  });

  it('is NEVER eligible for a human-owned city -- gets foreign faith pressure info but not loyalty-track eligibility', () => {
    const { state, p1, p2, p1City } = makeLoyaltyFixture();
    const withFaith = {
      ...state,
      cityFaith: { [p1City]: { religionId: `religion-${p2}` } },
      religions: { [`religion-${p2}`]: { id: `religion-${p2}`, name: 'Rival', ownerCivId: p2, foundedTurn: 1 } },
    };
    expect(isLoyaltyTrackEligible(withFaith, p1City)).toBeNull();
    expect(getForeignFaithPressure(withFaith, p1City)).not.toBeNull();
  });

  it('is not eligible when the city follows its own civ faith', () => {
    const { state, p2, p2City } = makeLoyaltyFixture();
    const withFaith = {
      ...state,
      cityFaith: { [p2City]: { religionId: `religion-${p2}` } },
      religions: { [`religion-${p2}`]: { id: `religion-${p2}`, name: 'Own', ownerCivId: p2, foundedTurn: 1 } },
    };
    expect(isLoyaltyTrackEligible(withFaith, p2City)).toBeNull();
  });

  it('is not eligible when territory does not border the faith owner', () => {
    const { state, p1, mcCity } = makeLoyaltyFixture();
    // mc-city (q6) does NOT border p1's territory (q0/q2) -- only p2's (q3/q5).
    const withFaith = {
      ...state,
      cityFaith: { [mcCity]: { religionId: `religion-${p1}` } },
      religions: { [`religion-${p1}`]: { id: `religion-${p1}`, name: 'Test', ownerCivId: p1, foundedTurn: 1 } },
    };
    expect(isLoyaltyTrackEligible(withFaith, mcCity)).toBeNull();
  });

  it('IS eligible for a minor civ bordering the faith owner', () => {
    const { state, p2, mcCity } = makeLoyaltyFixture();
    const withFaith = {
      ...state,
      cityFaith: { [mcCity]: { religionId: `religion-${p2}` } },
      religions: { [`religion-${p2}`]: { id: `religion-${p2}`, name: 'Test', ownerCivId: p2, foundedTurn: 1 } },
    };
    const result = isLoyaltyTrackEligible(withFaith, mcCity);
    expect(result).not.toBeNull();
    expect(result!.pressuringCivId).toBe(p2);
  });
});

describe('#593 MR6 — getLoyaltyThreshold', () => {
  it('reads the game-wide opponentChallenge, not per-civ', () => {
    const { state } = makeLoyaltyFixture();
    expect(getLoyaltyThreshold({ ...state, opponentChallenge: 'explorer' })).toBe(150);
    expect(getLoyaltyThreshold({ ...state, opponentChallenge: 'standard' })).toBe(180);
    expect(getLoyaltyThreshold({ ...state, opponentChallenge: 'veteran' })).toBe(220);
  });
});

describe('#593 MR6 — getLoyaltyTickAmount', () => {
  it('base tick is 10', () => {
    const { state, p2City } = makeLoyaltyFixture();
    const city = state.cities[p2City];
    const religion = { id: 'r', name: 'Test', ownerCivId: 'p1', foundedTurn: 1 } as const;
    expect(getLoyaltyTickAmount(state, city, religion)).toBe(10);
  });

  it('Fervor multiplies tick by 1.25, floored to 12', () => {
    const { state, p2City } = makeLoyaltyFixture();
    const city = state.cities[p2City];
    const religion = { id: 'r', name: 'Test', ownerCivId: 'p1', foundedTurn: 1, boon: 'fervor' as const };
    expect(getLoyaltyTickAmount(state, city, religion)).toBe(12);
  });

  it('a temple in the city halves the tick, floored', () => {
    const { state, p2City } = makeLoyaltyFixture();
    const city = { ...state.cities[p2City], buildings: ['temple'] };
    const withCity = { ...state, cities: { ...state.cities, [p2City]: city } };
    const religion = { id: 'r', name: 'Test', ownerCivId: 'p1', foundedTurn: 1 } as const;
    expect(getLoyaltyTickAmount(withCity, city, religion)).toBe(5);
  });

  it('temple + Fervor combine: 12 halved to 6', () => {
    const { state, p2City } = makeLoyaltyFixture();
    const city = { ...state.cities[p2City], buildings: ['temple'] };
    const withCity = { ...state, cities: { ...state.cities, [p2City]: city } };
    const religion = { id: 'r', name: 'Test', ownerCivId: 'p1', foundedTurn: 1, boon: 'fervor' as const };
    expect(getLoyaltyTickAmount(withCity, city, religion)).toBe(6);
  });

  it('a garrisoned city has zero tick (paused)', () => {
    const { state, p2, p2City } = makeLoyaltyFixture();
    const garrison = {
      id: 'garrison-1', type: 'warrior', owner: p2, position: state.cities[p2City].position,
      movementPointsLeft: 2, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false,
    } as any;
    const withGarrison = { ...state, units: { [garrison.id]: garrison } };
    const religion = { id: 'r', name: 'Test', ownerCivId: 'p1', foundedTurn: 1 } as const;
    expect(getLoyaltyTickAmount(withGarrison, state.cities[p2City], religion)).toBe(0);
  });
});

describe('#593 MR6 — executeLoyaltyDefection (major civ to major civ)', () => {
  it('transfers the city, applies a bilateral relationship penalty, clears loyaltyProgress, and emits religion:city-defected', () => {
    const { state, p1, p2, p2City } = makeLoyaltyFixture();
    const withProgress = {
      ...state,
      cityFaith: { [p2City]: { religionId: `religion-${p1}`, loyaltyProgress: { toCivId: p1, points: 180 } } },
      religions: { [`religion-${p1}`]: { id: `religion-${p1}`, name: 'Test', ownerCivId: p1, foundedTurn: 1 } },
    };
    const bus = new EventBus();
    const defections: any[] = [];
    bus.on('religion:city-defected', e => defections.push(e));

    const next = executeLoyaltyDefection(withProgress, bus, p2City, p1);

    expect(next.cities[p2City].owner).toBe(p1);
    expect(next.civilizations[p1].diplomacy.relationships[p2]).toBeLessThan(0);
    expect(next.civilizations[p2]?.diplomacy.relationships[p1]).toBeLessThan(0);
    expect(next.cityFaith![p2City].loyaltyProgress).toBeUndefined();
    expect(defections).toEqual([{ cityId: p2City, fromCivId: p2, toCivId: p1 }]);
  });
});

describe('#593 MR6 — executeLoyaltyDefection (minor civ absorption)', () => {
  it('absorbs the minor civ into the pressuring civ and clears loyaltyProgress', () => {
    const { state, p2, mcId, mcCity } = makeLoyaltyFixture();
    const withProgress = {
      ...state,
      cityFaith: { [mcCity]: { religionId: `religion-${p2}`, loyaltyProgress: { toCivId: p2, points: 180 } } },
      religions: { [`religion-${p2}`]: { id: `religion-${p2}`, name: 'Test', ownerCivId: p2, foundedTurn: 1 } },
    };
    const bus = new EventBus();
    const destroyed: any[] = [];
    bus.on('minor-civ:destroyed', e => destroyed.push(e));

    const next = executeLoyaltyDefection(withProgress, bus, mcCity, p2);

    expect(next.cities[mcCity].owner).toBe(p2);
    expect(next.minorCivs[mcId].isDestroyed).toBe(true);
    expect(next.cityFaith![mcCity].loyaltyProgress).toBeUndefined();
    expect(destroyed).toEqual([{ minorCivId: mcId, conquerorId: p2 }]);
  });
});

describe('#593 MR6 — setLoyaltyPoints / clearLoyaltyProgress', () => {
  it('setLoyaltyPoints writes points for the given civ', () => {
    const { state, p1, p2City } = makeLoyaltyFixture();
    const withFaith = { ...state, cityFaith: { [p2City]: { religionId: `religion-${p1}` } } };
    const next = setLoyaltyPoints(withFaith, p2City, p1, 40);
    expect(next.cityFaith![p2City].loyaltyProgress).toEqual({ toCivId: p1, points: 40 });
  });

  it('clearLoyaltyProgress removes the field without touching religionId', () => {
    const { state, p1, p2City } = makeLoyaltyFixture();
    const withProgress = { ...state, cityFaith: { [p2City]: { religionId: `religion-${p1}`, loyaltyProgress: { toCivId: p1, points: 40 } } } };
    const next = clearLoyaltyProgress(withProgress, p2City);
    expect(next.cityFaith![p2City].loyaltyProgress).toBeUndefined();
    expect(next.cityFaith![p2City].religionId).toBe(`religion-${p1}`);
  });
});
