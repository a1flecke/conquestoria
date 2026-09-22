import { describe, it, expect } from 'vitest';
import { createUnit } from '@/systems/unit-system';
import { foundCity } from '@/systems/city-system';
import { spawnBarbarianCamp } from '@/systems/barbarian-system';
import { generateQuest } from '@/systems/quest-system';
import { emptyIdCounters, scanIdCounters, ID_COUNTER_SPECS } from '@/core/id-counters';
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
    expect(scanIdCounters(makeState())).toMatchObject(
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
    expect(result).toMatchObject({ nextUnitId: 6, nextCityId: 4, nextCampId: 11, nextQuestId: 1 });
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
    expect(emptyIdCounters()).toEqual({
      nextUnitId: 1,
      nextCityId: 1,
      nextCampId: 1,
      nextQuestId: 1,
      nextRouteId: 1,
      nextPirateFactionId: 1,
      nextNotificationId: 1,
      nextNetworkPlanId: 1,
    });
  });

  it('returns a new object each call (not a shared reference)', () => {
    const a = emptyIdCounters();
    const b = emptyIdCounters();
    a.nextUnitId = 99;
    expect(b.nextUnitId).toBe(1);
  });

  it('covers every IdCounters key with the spec initial value (#1082)', () => {
    const specKeys = Object.keys(ID_COUNTER_SPECS).sort();
    const emptyKeys = Object.keys(emptyIdCounters()).sort();
    expect(emptyKeys).toEqual(specKeys);
    const empty = emptyIdCounters();
    for (const key of specKeys as (keyof IdCounters)[]) {
      expect(empty[key]).toBe(ID_COUNTER_SPECS[key].initial);
    }
  });
});

// ── scanIdCounters: full-catalog behavioral coverage (#1082) ───────────────

describe('scanIdCounters full catalog (#1082)', () => {
  it('scan result covers every spec key', () => {
    const scanned = scanIdCounters({});
    expect(Object.keys(scanned).sort()).toEqual(Object.keys(ID_COUNTER_SPECS).sort());
  });

  it('reconstructs trade route IDs from marketplace.tradeRoutes', () => {
    const result = scanIdCounters({
      marketplace: { tradeRoutes: [{ id: 'route-3' }, { id: 'route-11' }] },
    });
    expect(result.nextRouteId).toBe(12);
  });

  it('uses maximum numeric suffix for routes, ignoring malformed IDs', () => {
    const result = scanIdCounters({
      marketplace: { tradeRoutes: [{ id: 'route-2' }, { id: 'route-847' }, { id: 'caravan-5' }, {}] },
    });
    expect(result.nextRouteId).toBe(848);
  });

  it('returns the initial route value when marketplace is missing', () => {
    expect(scanIdCounters({}).nextRouteId).toBe(ID_COUNTER_SPECS.nextRouteId.initial);
  });

  it('merges pirate faction IDs from factions and history', () => {
    const result = scanIdCounters({
      pirates: {
        factions: { 'pirate-7': { id: 'pirate-7' } },
        history: [{ factionId: 'pirate-4' }, { factionId: 'pirate-19' }],
      },
    });
    expect(result.nextPirateFactionId).toBe(20);
  });

  it('ignores malformed pirate IDs and missing pirate state', () => {
    const malformed = scanIdCounters({
      pirates: { factions: { corsairs: { id: 'corsairs' } }, history: [{ factionId: 'rogue' }] },
    });
    expect(malformed.nextPirateFactionId).toBe(ID_COUNTER_SPECS.nextPirateFactionId.initial);
    expect(scanIdCounters({}).nextPirateFactionId).toBe(ID_COUNTER_SPECS.nextPirateFactionId.initial);
  });

  it('reconstructs notification IDs across per-recipient logs', () => {
    const result = scanIdCounters({
      notificationLog: {
        player: [{ id: 'notification-2' }, { id: 'notification-12' }],
        ai1: [{ id: 'notification-5' }],
      },
    });
    expect(result.nextNotificationId).toBe(13);
  });

  it('ignores malformed notification IDs and missing log', () => {
    const result = scanIdCounters({ notificationLog: { player: [{ id: 'toast-9' }, {}] } });
    expect(result.nextNotificationId).toBe(ID_COUNTER_SPECS.nextNotificationId.initial);
    expect(scanIdCounters({}).nextNotificationId).toBe(ID_COUNTER_SPECS.nextNotificationId.initial);
  });

  it('reconstructs network plan IDs from autonomy plans', () => {
    const result = scanIdCounters({
      autonomyByCiv: {
        player: { plans: { 'network-plan-3': {}, 'network-plan-11': {} }, detections: {} },
      },
    });
    expect(result.nextNetworkPlanId).toBe(12);
  });

  it('returns the initial network-plan value when autonomy state is missing', () => {
    expect(scanIdCounters({}).nextNetworkPlanId).toBe(ID_COUNTER_SPECS.nextNetworkPlanId.initial);
  });

  it('reconstructs every counter independently in one pass', () => {
    const result = scanIdCounters({
      units: { 'unit-5': { id: 'unit-5' } },
      cities: { 'city-3': { id: 'city-3' } },
      barbarianCamps: { 'camp-10': { id: 'camp-10' } },
      minorCivs: { 'mc-a': { activeQuests: { player: { id: 'quest-9' } } } },
      marketplace: { tradeRoutes: [{ id: 'route-4' }] },
      pirates: { factions: { 'pirate-6': { id: 'pirate-6' } }, history: [] },
      notificationLog: { player: [{ id: 'notification-8' }] },
      autonomyByCiv: { player: { plans: { 'network-plan-2': {} }, detections: {} } },
    });
    expect(result).toMatchObject({
      nextUnitId: 6,
      nextCityId: 4,
      nextCampId: 11,
      nextQuestId: 10,
      nextRouteId: 5,
      nextPirateFactionId: 7,
      nextNotificationId: 9,
      nextNetworkPlanId: 3,
    });
  });
});
