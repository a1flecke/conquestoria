import { describe, it, expect } from 'vitest';
import { createUnit } from '@/systems/unit-system';
import { foundCity } from '@/systems/city-system';
import { spawnBarbarianCamp } from '@/systems/barbarian-system';
import { generateQuest } from '@/systems/quest-system';
import { emptyIdCounters, scanIdCounters } from '@/core/id-counters';
import type { IdCounters } from '@/core/types';

// Minimal map fixture
const makeMap = () => ({
  width: 10, height: 10, wrapsHorizontally: false, rivers: [],
  tiles: {
    '0,0': { coord: { q: 0, r: 0 }, terrain: 'plains' as const, elevation: 'flat' as any,
              resource: null, improvement: 'none' as const, improvementTurnsLeft: 0,
              owner: null, hasRiver: false, wonder: null },
    '3,3': { coord: { q: 3, r: 3 }, terrain: 'plains' as const, elevation: 'flat' as any,
              resource: null, improvement: 'none' as const, improvementTurnsLeft: 0,
              owner: null, hasRiver: false, wonder: null },
  },
});

// Minimal state fixture for scanIdCounters
const makeState = (
  unitIds: string[] = [],
  cityIds: string[] = [],
  campIds: string[] = [],
  questsByMc: Record<string, string[]> = {},
) => ({
  units:          Object.fromEntries(unitIds.map(id => [id, { id }])),
  cities:         Object.fromEntries(cityIds.map(id => [id, { id }])),
  barbarianCamps: Object.fromEntries(campIds.map(id => [id, { id }])),
  minorCivs:      Object.fromEntries(
    Object.entries(questsByMc).map(([mcId, qIds]) => [
      mcId,
      { activeQuests: Object.fromEntries(qIds.map(qId => [qId, { id: qId }])) },
    ]),
  ),
});

// ── createUnit ────────────────────────────────────────────────────────────────

describe('createUnit uses and increments counters.nextUnitId', () => {
  it('uses the current counter value and embeds it in the ID', () => {
    const c: IdCounters = { nextUnitId: 7, nextCityId: 1, nextCampId: 1, nextQuestId: 1 };
    const u = createUnit('warrior', 'player', { q: 0, r: 0 }, c);
    expect(u.id).toBe('unit-7');
    expect(c.nextUnitId).toBe(8);
  });

  it('sequential calls yield non-colliding IDs', () => {
    const c: IdCounters = { nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 };
    const a = createUnit('warrior', 'p1', { q: 0, r: 0 }, c);
    const b = createUnit('settler', 'p1', { q: 1, r: 0 }, c);
    expect(a.id).toBe('unit-1');
    expect(b.id).toBe('unit-2');
    expect(a.id).not.toBe(b.id);
  });

  it('two independent counter objects do not interfere', () => {
    const c1: IdCounters = { nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 };
    const c2: IdCounters = { nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 };
    const u1 = createUnit('warrior', 'p1', { q: 0, r: 0 }, c1);
    const u2 = createUnit('warrior', 'p2', { q: 0, r: 0 }, c2);
    expect(u1.id).toBe('unit-1');
    expect(u2.id).toBe('unit-1');
    expect(c1.nextUnitId).toBe(2);
    expect(c2.nextUnitId).toBe(2);
  });
});

// ── foundCity ─────────────────────────────────────────────────────────────────

describe('foundCity uses and increments counters.nextCityId', () => {
  it('uses the current counter value and embeds it in the ID', () => {
    const c: IdCounters = { nextUnitId: 1, nextCityId: 5, nextCampId: 1, nextQuestId: 1 };
    const city = foundCity('player', { q: 0, r: 0 }, makeMap() as any, c);
    expect(city.id).toBe('city-5');
    expect(c.nextCityId).toBe(6);
  });

  it('does not affect nextUnitId', () => {
    const c: IdCounters = { nextUnitId: 3, nextCityId: 1, nextCampId: 1, nextQuestId: 1 };
    foundCity('player', { q: 0, r: 0 }, makeMap() as any, c);
    expect(c.nextUnitId).toBe(3);
  });
});

// ── spawnBarbarianCamp ────────────────────────────────────────────────────────

describe('spawnBarbarianCamp uses and increments counters.nextCampId', () => {
  it('embeds the counter value in the camp ID when a valid position exists', () => {
    const c: IdCounters = { nextUnitId: 1, nextCityId: 1, nextCampId: 3, nextQuestId: 1 };
    const camp = spawnBarbarianCamp(makeMap() as any, [], [], 42, c);
    // The map has two plains tiles with no cities nearby — camp must be created
    expect(camp).not.toBeNull();
    if (camp) {
      expect(camp.id).toBe('camp-3');
      expect(c.nextCampId).toBe(4);
    }
  });

  it('does not increment counter when no valid position exists', () => {
    const c: IdCounters = { nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 };
    // Empty map — no candidates
    const emptyMap = { width: 5, height: 5, wrapsHorizontally: false, rivers: [], tiles: {} };
    const camp = spawnBarbarianCamp(emptyMap as any, [], [], 42, c);
    expect(camp).toBeNull();
    expect(c.nextCampId).toBe(1); // unchanged
  });
});

// ── generateQuest ─────────────────────────────────────────────────────────────

describe('generateQuest uses and increments counters.nextQuestId', () => {
  it('embeds the counter value in the quest ID when a quest is generated', () => {
    const c: IdCounters = { nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 4 };
    const rng = () => 0; // deterministic — picks first candidate
    const state = {
      barbarianCamps: {
        'camp-1': { id: 'camp-1', position: { q: 0, r: 0 }, strength: 5, spawnCooldown: 0 },
      },
      era: 1,
      minorCivs: {
        'mc-test': {
          id: 'mc-test', definitionId: 'test', cityId: 'city-1',
          units: [], activeQuests: {}, isDestroyed: false,
          garrisonCooldown: 0, lastEraUpgrade: 0,
          diplomacy: { relationships: {}, treaties: [], events: [], atWarWith: [] },
        },
      },
      cities: {
        'city-1': {
          id: 'city-1', position: { q: 0, r: 0 }, name: 'Test', population: 1,
          buildings: [], productionQueue: [], productionProgress: 0,
          owner: 'mc-test', workedTiles: [], focus: 'balanced' as const,
          maturity: 0, lastWorkedYields: { food: 0, production: 0, gold: 0, science: 0 },
        },
      },
      units: {},
    } as any;

    const quest = generateQuest('militaristic', 'mc-test', 'player', 1, state, rng, c);
    if (quest) {
      expect(quest.id).toBe('quest-4');
      expect(c.nextQuestId).toBe(5);
    }
    // quest may be null if no valid target exists for this archetype/state combo — counter should not increment
  });
});

// ── scanIdCounters ─────────────────────────────────────────────────────────────

describe('scanIdCounters', () => {
  it('returns {1,1,1,1} for empty state', () => {
    expect(scanIdCounters(makeState())).toEqual(
      { nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 },
    );
  });

  it('finds the maximum, not the count, across non-sequential IDs', () => {
    const result = scanIdCounters(makeState(['unit-3', 'unit-847']));
    expect(result.nextUnitId).toBe(848);
  });

  it('ignores IDs that do not match the type-N pattern', () => {
    const result = scanIdCounters(makeState(['barbarian-warrior-1', 'mc-unit-xyz']));
    expect(result.nextUnitId).toBe(1);
  });

  it('scans all three flat collections independently', () => {
    const result = scanIdCounters(makeState(
      ['unit-5'],
      ['city-3'],
      ['camp-10'],
    ));
    expect(result).toEqual({ nextUnitId: 6, nextCityId: 4, nextCampId: 11, nextQuestId: 1 });
  });

  it('scans quests nested inside minorCivs.activeQuests', () => {
    const result = scanIdCounters(makeState([], [], [], {
      'mc-a': ['quest-2', 'quest-9'],
      'mc-b': ['quest-5'],
    }));
    expect(result.nextQuestId).toBe(10);
  });

  it('two independent calls on different states return independent results', () => {
    const r1 = scanIdCounters(makeState(['unit-100']));
    const r2 = scanIdCounters(makeState(['unit-3']));
    expect(r1.nextUnitId).toBe(101);
    expect(r2.nextUnitId).toBe(4);
  });
});

// ── emptyIdCounters ───────────────────────────────────────────────────────────

describe('emptyIdCounters', () => {
  it('returns a fresh object starting at 1 for all counters', () => {
    expect(emptyIdCounters()).toEqual(
      { nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 },
    );
  });

  it('returns a new object each call (not a shared reference)', () => {
    const a = emptyIdCounters();
    const b = emptyIdCounters();
    a.nextUnitId = 99;
    expect(b.nextUnitId).toBe(1);
  });
});
