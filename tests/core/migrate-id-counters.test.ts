import { describe, expect, it } from 'vitest';
import { emptyIdCounters, scanIdCounters } from '@/core/id-counters';

describe('emptyIdCounters', () => {
  it('returns all counters starting at 1', () => {
    const counters = emptyIdCounters();
    expect(counters).toEqual({ nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 });
  });

  it('each call returns a fresh independent object', () => {
    const a = emptyIdCounters();
    const b = emptyIdCounters();
    a.nextUnitId = 99;
    expect(b.nextUnitId).toBe(1);
  });
});

describe('scanIdCounters', () => {
  it('returns 1 for all counters when state has no entities', () => {
    const counters = scanIdCounters({ units: {}, cities: {}, barbarianCamps: {}, minorCivs: {} });
    expect(counters).toEqual({ nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 });
  });

  it('is safe on legacy saves missing barbarianCamps or minorCivs fields', () => {
    // simulates a very old save that predates these fields
    const counters = scanIdCounters({ units: { 'unit-3': { id: 'unit-3' } } });
    expect(counters.nextUnitId).toBe(4);
    expect(counters.nextCityId).toBe(1);
    expect(counters.nextCampId).toBe(1);
    expect(counters.nextQuestId).toBe(1);
  });

  it('scans unit IDs and sets nextUnitId to max+1', () => {
    const counters = scanIdCounters({
      units: { 'unit-3': { id: 'unit-3' }, 'unit-7': { id: 'unit-7' } },
      cities: {},
      barbarianCamps: {},
      minorCivs: {},
    });
    expect(counters.nextUnitId).toBe(8);
  });

  it('scans city IDs and sets nextCityId to max+1', () => {
    const counters = scanIdCounters({
      units: {},
      cities: { 'city-5': { id: 'city-5' } },
      barbarianCamps: {},
      minorCivs: {},
    });
    expect(counters.nextCityId).toBe(6);
  });

  it('scans barbarian camp IDs and sets nextCampId to max+1', () => {
    const counters = scanIdCounters({
      units: {},
      cities: {},
      barbarianCamps: { 'camp-2': { id: 'camp-2' }, 'camp-10': { id: 'camp-10' } },
      minorCivs: {},
    });
    expect(counters.nextCampId).toBe(11);
  });

  it('scans quest IDs from minorCivs and sets nextQuestId to max+1', () => {
    const counters = scanIdCounters({
      units: {},
      cities: {},
      barbarianCamps: {},
      minorCivs: {
        'mc-1': { activeQuests: { player: { id: 'quest-9' } } },
        'mc-2': { activeQuests: { 'ai-1': { id: 'quest-2' } } },
      },
    });
    expect(counters.nextQuestId).toBe(10);
  });

  it('ignores IDs that do not match the expected format', () => {
    const counters = scanIdCounters({
      units: { 'warrior-p1': { id: 'warrior-p1' } },
      cities: { athens: { id: 'athens' } },
      barbarianCamps: {},
      minorCivs: {},
    });
    // Non-standard IDs → no match → stays at 1
    expect(counters.nextUnitId).toBe(1);
    expect(counters.nextCityId).toBe(1);
  });

  it('migrateLegacySave pattern: injects idCounters into a save that lacks it', () => {
    const gameState: any = {
      units: { 'unit-5': { id: 'unit-5' } },
      cities: { 'city-3': { id: 'city-3' } },
      barbarianCamps: {},
      minorCivs: {},
    };

    if (!gameState.idCounters) {
      gameState.idCounters = scanIdCounters(gameState);
    }

    expect(gameState.idCounters.nextUnitId).toBe(6);
    expect(gameState.idCounters.nextCityId).toBe(4);
    expect(gameState.idCounters.nextCampId).toBe(1);
    expect(gameState.idCounters.nextQuestId).toBe(1);
  });
});
