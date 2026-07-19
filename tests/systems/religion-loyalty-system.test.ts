import { describe, it, expect } from 'vitest';
import { EventBus } from '@/core/event-bus';
import type { CityFaith, GameEvents } from '@/core/types';
import {
  getForeignFaithPressure, isLoyaltyTrackEligible, getLoyaltyThreshold, getLoyaltyTickAmount,
  executeLoyaltyDefection, setLoyaltyPoints, clearLoyaltyProgress, processLoyaltyTurn,
} from '@/systems/religion-loyalty-system';
import { getUnrestPressureBreakdown } from '@/systems/faction-system';
import { getLoyaltyPressurePresentationForViewer } from '@/systems/loyalty-pressure-presentation';
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

function withFaith(civId: string, targetCityId: string, state: any, boon?: 'fervor') {
  return {
    ...state,
    cityFaith: { [targetCityId]: { religionId: `religion-${civId}` } },
    religions: { [`religion-${civId}`]: { id: `religion-${civId}`, name: 'Test', ownerCivId: civId, foundedTurn: 1, ...(boon ? { boon } : {}) } },
  };
}

describe('#593 MR6 — processLoyaltyTurn', () => {
  it('advances loyaltyProgress.points by the tick amount each turn', () => {
    const { state, p1, p2City } = makeLoyaltyFixture();
    const seeded = withFaith(p1, p2City, state);
    const bus = new EventBus();
    const next = processLoyaltyTurn(seeded, bus);
    expect(next.cityFaith![p2City].loyaltyProgress).toEqual({ toCivId: p1, points: 10 });
  });

  it('never advances a human-owned city -- points stay undefined, unrest row is the only signal', () => {
    const { state, p2, p1City } = makeLoyaltyFixture();
    const seeded = withFaith(p2, p1City, state);
    const bus = new EventBus();
    const next = processLoyaltyTurn(seeded, bus);
    expect(next.cityFaith![p1City].loyaltyProgress).toBeUndefined();
  });

  it('deterministically flips at the threshold turn for the standard challenge (180 / 10 = 18 turns)', () => {
    const { state, p1, p2, p2City } = makeLoyaltyFixture();
    let current = withFaith(p1, p2City, state);
    const bus = new EventBus();
    for (let turn = 0; turn < 17; turn++) {
      current = processLoyaltyTurn(current, bus);
      expect(current.cities[p2City].owner).toBe(p2);
    }
    current = processLoyaltyTurn(current, bus);
    expect(current.cities[p2City].owner).toBe(p1);
  });

  it('deterministically flips at the veteran threshold (220 / 10 = 22 turns)', () => {
    const { state, p1, p2, p2City } = makeLoyaltyFixture();
    let current = { ...withFaith(p1, p2City, state), opponentChallenge: 'veteran' as const };
    const bus = new EventBus();
    for (let turn = 0; turn < 21; turn++) {
      current = processLoyaltyTurn(current, bus);
      expect(current.cities[p2City].owner).toBe(p2);
    }
    current = processLoyaltyTurn(current, bus);
    expect(current.cities[p2City].owner).toBe(p1);
  });

  it('fires religion:loyalty-warning at start, midpoint, and one-turn-out', () => {
    const { state, p1, p2City } = makeLoyaltyFixture();
    let current = withFaith(p1, p2City, state);
    const bus = new EventBus();
    const stages: string[] = [];
    bus.on('religion:loyalty-warning', e => stages.push(e.stage));
    for (let turn = 0; turn < 18; turn++) {
      current = processLoyaltyTurn(current, bus);
    }
    expect(stages).toContain('start');
    expect(stages).toContain('midpoint');
    expect(stages).toContain('final');
  });

  it('garrisoning pauses the tick entirely', () => {
    const { state, p1, p2, p2City } = makeLoyaltyFixture();
    const garrison = {
      id: 'g1', type: 'warrior', owner: p2, position: state.cities[p2City].position,
      movementPointsLeft: 2, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false,
    } as any;
    const seeded = { ...withFaith(p1, p2City, state), units: { [garrison.id]: garrison } };
    const bus = new EventBus();
    const next = processLoyaltyTurn(seeded, bus);
    expect(next.cityFaith![p2City].loyaltyProgress).toBeUndefined();
  });

  it('re-conversion (religionId change) resets progress to zero on the next tick', () => {
    const { state, p1, p2, p2City } = makeLoyaltyFixture();
    let current = withFaith(p1, p2City, state);
    const bus = new EventBus();
    current = processLoyaltyTurn(current, bus);
    current = processLoyaltyTurn(current, bus);
    expect(current.cityFaith![p2City].loyaltyProgress!.points).toBe(20);
    // City re-converts back to its own civ's faith -- own-faith means not eligible at all.
    current = {
      ...current,
      cityFaith: { [p2City]: { religionId: `religion-${p2}` } },
      religions: { ...current.religions, [`religion-${p2}`]: { id: `religion-${p2}`, name: 'Own', ownerCivId: p2, foundedTurn: 1 } },
    };
    current = processLoyaltyTurn(current, bus);
    expect(current.cityFaith![p2City].loyaltyProgress).toBeUndefined();
  });

  it('ambient drift: minor civs following a civ faith gain +1 relationship/turn toward that civ, capped at 60', () => {
    const { state, p2, mcId, mcCity } = makeLoyaltyFixture();
    let current = withFaith(p2, mcCity, state);
    current = { ...current, minorCivs: { ...current.minorCivs, [mcId]: { ...current.minorCivs[mcId], diplomacy: { relationships: { [p2]: 59 } } } } };
    const bus = new EventBus();
    current = processLoyaltyTurn(current, bus);
    expect(current.minorCivs[mcId].diplomacy.relationships[p2]).toBe(60);
    current = processLoyaltyTurn(current, bus);
    expect(current.minorCivs[mcId].diplomacy.relationships[p2]).toBe(60);
  });
});

describe('#593 MR6 — deterministic flip timing at the explorer threshold', () => {
  it('flips at exactly turn 15 for explorer (150 / 10 = 15 turns) -- completes the three-tier sweep alongside standard (18) and veteran (22)', () => {
    const { state, p1, p2, p2City } = makeLoyaltyFixture();
    let current = { ...withFaith(p1, p2City, state), opponentChallenge: 'explorer' as const };
    const bus = new EventBus();
    for (let turn = 0; turn < 14; turn++) {
      current = processLoyaltyTurn(current, bus);
      expect(current.cities[p2City].owner).toBe(p2);
    }
    current = processLoyaltyTurn(current, bus);
    expect(current.cities[p2City].owner).toBe(p1);
  });
});

describe('#593 MR6 — human-immunity regression (run to completion)', () => {
  it('a human city under max foreign-faith pressure never flips even after 100 turns, and the unrest row is present every turn', () => {
    const { state, p1, p2, p1City } = makeLoyaltyFixture();
    let current = withFaith(p2, p1City, state, 'fervor');
    const bus = new EventBus();
    for (let turn = 0; turn < 100; turn++) {
      current = processLoyaltyTurn(current, bus);
      expect(current.cities[p1City].owner).toBe(p1);
      expect(current.cityFaith![p1City].loyaltyProgress).toBeUndefined();
      const rows = getUnrestPressureBreakdown(p1City, current);
      expect(rows).toContainEqual({ label: 'Foreign faith pressure', amount: 2 });
    }
  });
});

describe('#593 MR6 — currentPlayer correctness for badge/row visibility', () => {
  it('map badge presentation only shows the pressuring civ\'s or pressured owner\'s own badges, never a bystander\'s, regardless of state.currentPlayer', () => {
    const { state, p1, p2, p2City } = makeLoyaltyFixture();
    const seeded = {
      ...state,
      currentPlayer: p2, // hot-seat: it's p2's turn to view, not p1's
      cityFaith: { [p2City]: { religionId: `religion-${p1}`, loyaltyProgress: { toCivId: p1, points: 50 } } },
      religions: { [`religion-${p1}`]: { id: `religion-${p1}`, name: 'Test', ownerCivId: p1, foundedTurn: 1 } },
    };
    // p2 is the pressured owner -- sees it regardless of currentPlayer being p2 or p1.
    expect(getLoyaltyPressurePresentationForViewer(seeded, p2).cityBadges.map(b => b.cityId)).toContain(p2City);
    expect(getLoyaltyPressurePresentationForViewer({ ...seeded, currentPlayer: p1 }, p2).cityBadges.map(b => b.cityId)).toContain(p2City);
  });
});
