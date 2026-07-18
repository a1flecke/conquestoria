import { describe, it, expect } from 'vitest';
import type { GameState } from '@/core/types';
import { routeReligionFounded, routeReligionCityConverted } from '@/ui/notification-routing';

// Deliberately a separate file from notification-routing.test.ts: that file mocks
// @/systems/discovery-system at module scope with a narrow hardcoded stub built for an
// older test, which would silently constrain (and, when we tried, broke) any test here
// needing real hasMetCivilization behavior across more than one specific civ pair.
function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    turn: 5,
    currentPlayer: 'p1',
    civilizations: {
      p1: { id: 'p1', name: 'Alice', diplomacy: { relationships: {}, atWarWith: [], treaties: [] }, visibility: { tiles: {} }, knownCivilizations: ['p2'], cities: ['c1'], units: [] },
      p2: { id: 'p2', name: 'Bob', diplomacy: { relationships: {}, atWarWith: [], treaties: [] }, visibility: { tiles: {} }, cities: [], units: [] },
      p3: { id: 'p3', name: 'Carol', diplomacy: { relationships: {}, atWarWith: [], treaties: [] }, visibility: { tiles: {} }, cities: [], units: [] }, // never met p1
    },
    units: {},
    cities: { c1: { id: 'c1', name: 'Thebes', owner: 'p1', position: { q: 0, r: 0 }, ownedTiles: [] } },
    map: { width: 1, height: 1, wrapsHorizontally: false, rivers: [], tiles: {} },
    ...overrides,
  } as GameState;
}

function makeSink() {
  const calls: Array<{ civId: string; message: string; type: string }> = [];
  const sink = (civId: string, message: string, type: string) => calls.push({ civId, message, type });
  return { sink, calls };
}

describe('#591 MR4 — religion:founded routing', () => {
  it('notifies the founder and any civ that has met them, never a stranger civ', () => {
    const state = makeState();
    const { sink, calls } = makeSink();
    routeReligionFounded(state, { religionId: 'religion-p1', civId: 'p1', cityId: 'c1', name: 'Order of Test' }, sink as never);

    const civIds = calls.map(c => c.civId);
    expect(civIds).toContain('p1');
    expect(civIds).toContain('p2');
    expect(civIds).not.toContain('p3');
  });

  it('the founder sees a first-person message naming their own city; others see a third-person message', () => {
    const state = makeState();
    const { sink, calls } = makeSink();
    routeReligionFounded(state, { religionId: 'religion-p1', civId: 'p1', cityId: 'c1', name: 'Order of Test' }, sink as never);

    const founderCall = calls.find(c => c.civId === 'p1')!;
    const observerCall = calls.find(c => c.civId === 'p2')!;
    expect(founderCall.message).toContain('Thebes');
    expect(observerCall.message).toContain('Alice');
    expect(observerCall.message).toContain('Order of Test');
  });

  it('notifies nobody beyond the founder when no one else has met them', () => {
    const state = makeState({
      civilizations: {
        p1: { id: 'p1', name: 'Alice', diplomacy: { relationships: {}, atWarWith: [], treaties: [] }, visibility: { tiles: {} }, cities: ['c1'], units: [] },
        p2: { id: 'p2', name: 'Bob', diplomacy: { relationships: {}, atWarWith: [], treaties: [] }, visibility: { tiles: {} }, cities: [], units: [] },
      } as unknown as GameState['civilizations'],
    });
    const { sink, calls } = makeSink();
    routeReligionFounded(state, { religionId: 'religion-p1', civId: 'p1', cityId: 'c1', name: 'Order of Test' }, sink as never);

    expect(calls.map(c => c.civId)).toEqual(['p1']);
  });
});

describe('#591 MR4 — religion:city-converted routing', () => {
  it('notifies the city\'s own owner, and the new religion\'s owner if a different civ who has met them', () => {
    const state = makeState({
      religions: { 'religion-p2': { id: 'religion-p2', name: 'Order of Rivals', ownerCivId: 'p2', foundedTurn: 1 } },
    });
    const { sink, calls } = makeSink();
    routeReligionCityConverted(state, { cityId: 'c1', toReligionId: 'religion-p2' }, sink as never);

    const civIds = calls.map(c => c.civId);
    expect(civIds).toContain('p1'); // c1's own owner
    expect(civIds).toContain('p2'); // religion-p2's owner, gained a follower
  });

  it('does not double-notify when the city owner and the new religion\'s owner are the same civ', () => {
    const state = makeState({
      religions: { 'religion-p1': { id: 'religion-p1', name: 'Order of Test', ownerCivId: 'p1', foundedTurn: 1 } },
    });
    const { sink, calls } = makeSink();
    routeReligionCityConverted(state, { cityId: 'c1', toReligionId: 'religion-p1' }, sink as never);

    expect(calls.map(c => c.civId)).toEqual(['p1']);
  });

  it('does not notify the new religion\'s owner if they have never met the city\'s owner', () => {
    const state = makeState({
      civilizations: {
        p1: { id: 'p1', name: 'Alice', diplomacy: { relationships: {}, atWarWith: [], treaties: [] }, visibility: { tiles: {} }, cities: ['c1'], units: [] },
        p3: { id: 'p3', name: 'Carol', diplomacy: { relationships: {}, atWarWith: [], treaties: [] }, visibility: { tiles: {} }, cities: [], units: [] },
      } as unknown as GameState['civilizations'],
      religions: { 'religion-p3': { id: 'religion-p3', name: 'Order of Strangers', ownerCivId: 'p3', foundedTurn: 1 } },
    });
    const { sink, calls } = makeSink();
    routeReligionCityConverted(state, { cityId: 'c1', toReligionId: 'religion-p3' }, sink as never);

    expect(calls.map(c => c.civId)).toEqual(['p1']);
  });
});
