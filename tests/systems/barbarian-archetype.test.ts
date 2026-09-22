import { describe, expect, it } from 'vitest';
import {
  BARBARIAN_ARCHETYPES,
  BARBARIAN_ARCHETYPE_DEFINITIONS,
  findPredatorHuntTarget,
  getBarbarianArchetypeDefinition,
  isMobilizedForAssault,
  resolveBarbarianArchetype,
  type BarbarianArchetype,
} from '@/systems/barbarian-archetype';
import type { GameMap, Unit } from '@/core/types';
import { createUnit } from '@/systems/unit-system';
import { generateMap } from '@/systems/map-generator';

function unit(id: string, owner: string, position: { q: number; r: number }, overrides: Partial<Unit> = {}): Unit {
  return { ...createUnit('warrior', owner, position, { nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 }), id, ...overrides };
}

describe('#1089 resolveBarbarianArchetype', () => {
  it('is deterministic and turn-independent: same gameId + camp id always resolves identically', () => {
    const early = resolveBarbarianArchetype({ gameId: 'game-1' }, 'camp-1');
    const late = resolveBarbarianArchetype({ gameId: 'game-1' }, 'camp-1');
    expect(early).toBe(late);
    expect(BARBARIAN_ARCHETYPES).toContain(early);
  });

  it('survives a save/reload boundary: an equivalent rebuilt state object resolves the same archetype', () => {
    const state = { gameId: 'game-reload-test' };
    const before = resolveBarbarianArchetype(state, 'camp-42');
    const reloaded = JSON.parse(JSON.stringify(state));
    const after = resolveBarbarianArchetype(reloaded, 'camp-42');
    expect(after).toBe(before);
  });

  it('different camp ids in the same campaign distribute across all 3 archetypes, not collapsing to one', () => {
    const seen = new Set<BarbarianArchetype>();
    for (let i = 0; i < 60; i++) {
      seen.add(resolveBarbarianArchetype({ gameId: 'distribution-game' }, `camp-${i}`));
    }
    expect(seen.size).toBe(3);
  });

  it('different campaigns (gameId) can resolve the same camp id to different archetypes', () => {
    const a = resolveBarbarianArchetype({ gameId: 'game-a' }, 'camp-1');
    const b = resolveBarbarianArchetype({ gameId: 'game-b' }, 'camp-1');
    // Not asserting they always differ (3 archetypes, could coincide) -- asserting the
    // derivation genuinely depends on gameId by finding at least one gameId that flips it.
    let foundDivergence = a !== b;
    for (let i = 0; i < 20 && !foundDivergence; i++) {
      if (resolveBarbarianArchetype({ gameId: `game-c-${i}` }, 'camp-1') !== a) foundDivergence = true;
    }
    expect(foundDivergence).toBe(true);
  });
});

describe('#1089 BARBARIAN_ARCHETYPE_DEFINITIONS', () => {
  it('every archetype has a distinct role-weight bias from neutral on at least one role', () => {
    for (const archetype of BARBARIAN_ARCHETYPES) {
      const weights = getBarbarianArchetypeDefinition(archetype).roleWeightMultipliers;
      expect(Object.values(weights).some(w => w !== 1)).toBe(true);
    }
  });

  it('warlord has the highest siege weight and predator the lowest', () => {
    expect(BARBARIAN_ARCHETYPE_DEFINITIONS.warlord.roleWeightMultipliers.siege)
      .toBeGreaterThan(BARBARIAN_ARCHETYPE_DEFINITIONS.raider.roleWeightMultipliers.siege);
    expect(BARBARIAN_ARCHETYPE_DEFINITIONS.predator.roleWeightMultipliers.siege)
      .toBeLessThan(BARBARIAN_ARCHETYPE_DEFINITIONS.raider.roleWeightMultipliers.siege);
  });

  it('only predator hunts isolated/wounded targets and avoids cities', () => {
    expect(BARBARIAN_ARCHETYPE_DEFINITIONS.predator.huntsIsolatedWounded).toBe(true);
    expect(BARBARIAN_ARCHETYPE_DEFINITIONS.predator.avoidsCities).toBe(true);
    expect(BARBARIAN_ARCHETYPE_DEFINITIONS.raider.huntsIsolatedWounded).toBe(false);
    expect(BARBARIAN_ARCHETYPE_DEFINITIONS.raider.avoidsCities).toBe(false);
    expect(BARBARIAN_ARCHETYPE_DEFINITIONS.warlord.huntsIsolatedWounded).toBe(false);
    expect(BARBARIAN_ARCHETYPE_DEFINITIONS.warlord.avoidsCities).toBe(false);
  });

  it('only warlord has a nonzero mobilization threshold', () => {
    expect(BARBARIAN_ARCHETYPE_DEFINITIONS.warlord.mobilizationThreshold).toBeGreaterThan(0);
    expect(BARBARIAN_ARCHETYPE_DEFINITIONS.raider.mobilizationThreshold).toBe(0);
    expect(BARBARIAN_ARCHETYPE_DEFINITIONS.predator.mobilizationThreshold).toBe(0);
  });

  it('only raider has a recovery cooldown', () => {
    expect(BARBARIAN_ARCHETYPE_DEFINITIONS.raider.recoveryCooldownTurns).toBeGreaterThan(0);
    expect(BARBARIAN_ARCHETYPE_DEFINITIONS.predator.recoveryCooldownTurns).toBe(0);
    expect(BARBARIAN_ARCHETYPE_DEFINITIONS.warlord.recoveryCooldownTurns).toBe(0);
  });
});

describe('#1089 findPredatorHuntTarget', () => {
  const map: GameMap = generateMap(20, 20, 'predator-hunt-test');
  for (const tile of Object.values(map.tiles)) tile.terrain = 'grassland';
  const isCombatCapable = () => true;

  it('picks a wounded unit over a healthy escorted one', () => {
    const wounded = unit('u-wounded', 'player', { q: 5, r: 5 }, { health: 30 });
    const escort = unit('u-escort', 'player', { q: 6, r: 5 }, { health: 100 });
    const healthy = unit('u-healthy', 'player', { q: 10, r: 10 }, { health: 100 });
    const target = findPredatorHuntTarget(
      { map },
      { q: 5, r: 6 },
      [wounded, escort, healthy],
      isCombatCapable,
    );
    expect(target?.id).toBe('u-wounded');
  });

  it('picks an isolated healthy unit when nothing is wounded', () => {
    const isolated = unit('u-isolated', 'player', { q: 8, r: 8 }, { health: 100 });
    const escortedA = unit('u-escorted-a', 'player', { q: 2, r: 2 }, { health: 100 });
    const escortedB = unit('u-escorted-b', 'player', { q: 3, r: 2 }, { health: 100 });
    const target = findPredatorHuntTarget(
      { map },
      { q: 5, r: 5 },
      [isolated, escortedA, escortedB],
      isCombatCapable,
    );
    expect(target?.id).toBe('u-isolated');
  });

  it('returns undefined when every sensed unit is healthy and escorted', () => {
    const escortedA = unit('u-a', 'player', { q: 2, r: 2 }, { health: 100 });
    const escortedB = unit('u-b', 'player', { q: 3, r: 2 }, { health: 100 });
    const target = findPredatorHuntTarget({ map }, { q: 5, r: 5 }, [escortedA, escortedB], isCombatCapable);
    expect(target).toBeUndefined();
  });

  it('an escort of a DIFFERENT owner does not count as protection (isolation is per-owner)', () => {
    const target1 = unit('u-target', 'ownerA', { q: 5, r: 5 }, { health: 100 });
    const otherOwnerNearby = unit('u-other', 'ownerB', { q: 5, r: 6 }, { health: 100 });
    const result = findPredatorHuntTarget({ map }, { q: 0, r: 0 }, [target1, otherOwnerNearby], isCombatCapable);
    expect(result?.id).toBe('u-target');
  });

  it('respects the isCombatCapable predicate (never hunts a non-combat unit)', () => {
    const worker = unit('u-worker', 'player', { q: 5, r: 5 }, { health: 20 });
    const target = findPredatorHuntTarget({ map }, { q: 0, r: 0 }, [worker], () => false);
    expect(target).toBeUndefined();
  });
});

describe('#1089 isMobilizedForAssault', () => {
  it('warlord requires the archetype-defined threshold', () => {
    const threshold = BARBARIAN_ARCHETYPE_DEFINITIONS.warlord.mobilizationThreshold;
    expect(isMobilizedForAssault(threshold - 1, 'warlord')).toBe(false);
    expect(isMobilizedForAssault(threshold, 'warlord')).toBe(true);
  });

  it('raider and predator have no gate (always mobilized)', () => {
    expect(isMobilizedForAssault(0, 'raider')).toBe(true);
    expect(isMobilizedForAssault(0, 'predator')).toBe(true);
  });
});
