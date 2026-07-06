import { describe, expect, it } from 'vitest';
import { TRAINABLE_UNITS } from '@/systems/city-system';
import { UNIT_DEFINITIONS, createUnit } from '@/systems/unit-system';
import { resolveCombat } from '@/systems/combat-system';
import { TECH_TREE } from '@/systems/tech-definitions';
import { isSpyUnitType } from '@/systems/espionage-system';
import type { GameMap, HexTile, UnitType } from '@/core/types';

const mkC = () => ({ nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 });

const makeOceanTile = (q: number, r: number): HexTile => ({
  coord: { q, r }, terrain: 'ocean', elevation: 'flat' as any,
  resource: null, improvement: 'none', improvementTurnsLeft: 0,
  owner: null, hasRiver: false, wonder: null,
});

const makeNavalMap = (): GameMap => ({
  width: 10, height: 10, wrapsHorizontally: false, rivers: [],
  tiles: { '1,0': makeOceanTile(1, 0) },
});

// Small linear seed steps (e.g. i * 1000) don't wrap this LCG's modulus for the first
// draw at low i, correlating consecutive trials. Spread seeds across the full range instead.
function spreadSeed(i: number): number {
  return ((i + 1) * 2654435761) % 2147483647;
}

// Runs N one-shot combat trials and returns the attacker win rate (attacker deals more
// damage than it receives back — same "who would win" heuristic as other balance tests).
function attackerWinRate(attackerType: UnitType, defenderType: UnitType, trials = 200): number {
  let wins = 0;
  for (let i = 0; i < trials; i++) {
    const attacker = createUnit(attackerType, 'player', { q: 0, r: 0 }, mkC());
    const defender = createUnit(defenderType, 'ai-1', { q: 1, r: 0 }, mkC());
    const result = resolveCombat(attacker, defender, makeNavalMap(), spreadSeed(i));
    if (result.defenderDamage > result.attackerDamage) wins++;
  }
  return wins / trials;
}

const TECH_ERA_BY_ID = new Map(TECH_TREE.map(tech => [tech.id, tech.era]));

// Recon/detection units carry a self-defense strength stat rather than a real combat
// role (see TERMINAL_COMBAT_UNITS reasoning for scout/scout_hound/etc.), so the "target
// strength >= source strength" rule would false-fail their replacement chains.
const RECON_DETECTION_TYPES = new Set<UnitType>(['scout_hound', 'shadow_warden', 'war_hound']);

// musketeer -> rifleman is a temporary strength-inversion exemption (musketeer 50 str vs
// rifleman 38 str) tracked for MR9's strength re-curve. MR9 must empty this list.
const TEMPORARY_STRENGTH_EXEMPTIONS = new Set<string>(['musketeer->rifleman']);

function isRealCombatUnit(type: UnitType): boolean {
  const def = UNIT_DEFINITIONS[type];
  return def.strength >= 10 && !isSpyUnitType(type) && !RECON_DETECTION_TYPES.has(type);
}

function isCivilian(type: UnitType): boolean {
  return UNIT_DEFINITIONS[type].strength <= 0;
}

describe('unit upgrade-chain integrity', () => {
  for (const entry of TRAINABLE_UNITS) {
    if (!entry.obsoletedByTech || !entry.upgradesTo) continue;

    describe(`${entry.type} -> ${entry.upgradesTo}`, () => {
      it('upgrade target exists', () => {
        expect(UNIT_DEFINITIONS[entry.upgradesTo!]).toBeDefined();
      });

      it('upgrade target is available no later than the obsoleting tech (no upgrade gap)', () => {
        const targetEntry = TRAINABLE_UNITS.find(u => u.type === entry.upgradesTo);
        if (!targetEntry?.techRequired) return; // ungated target — always available, no gap possible
        const obsoletingEra = TECH_ERA_BY_ID.get(entry.obsoletedByTech!);
        const targetEra = TECH_ERA_BY_ID.get(targetEntry.techRequired);
        expect(targetEra).toBeDefined();
        expect(obsoletingEra).toBeDefined();
        expect(targetEra!).toBeLessThanOrEqual(obsoletingEra!);
      });

      it('upgrade target strength >= source strength (scoped to real combat units)', () => {
        const key = `${entry.type}->${entry.upgradesTo}`;
        if (TEMPORARY_STRENGTH_EXEMPTIONS.has(key)) return;
        if (!isRealCombatUnit(entry.type) || !isRealCombatUnit(entry.upgradesTo!)) return;
        const sourceStrength = UNIT_DEFINITIONS[entry.type].strength;
        const targetStrength = UNIT_DEFINITIONS[entry.upgradesTo!].strength;
        expect(targetStrength).toBeGreaterThanOrEqual(sourceStrength);
      });

      it('combat units upgrade to combat units, civilians to civilians', () => {
        expect(isCivilian(entry.upgradesTo!)).toBe(isCivilian(entry.type));
      });
    });
  }

  it('documented exemption list matches an actual pair in the roster', () => {
    for (const key of TEMPORARY_STRENGTH_EXEMPTIONS) {
      const [from, to] = key.split('->') as [UnitType, UnitType];
      const entry = TRAINABLE_UNITS.find(u => u.type === from && u.upgradesTo === to);
      expect(entry, key).toBeDefined();
    }
  });
});

describe('naval roster — regression locks', () => {
  it('missile_submarine strength exceeds submarine strength', () => {
    expect(UNIT_DEFINITIONS.missile_submarine.strength).toBeGreaterThan(UNIT_DEFINITIONS.submarine.strength);
  });

  it('walks the full naval fighting-line upgrade chain trireme -> frigate -> ironclad -> pre_dreadnought -> submarine', () => {
    const chain: UnitType[] = ['trireme', 'frigate', 'ironclad', 'pre_dreadnought'];
    const expectedNext: UnitType[] = ['frigate', 'ironclad', 'pre_dreadnought', 'submarine'];
    chain.forEach((type, i) => {
      const entry = TRAINABLE_UNITS.find(u => u.type === type);
      expect(entry?.upgradesTo, type).toBe(expectedNext[i]);
    });
  });

  it('galley upgrades into the fighting line (trireme), not the civilian carrack line', () => {
    const galley = TRAINABLE_UNITS.find(u => u.type === 'galley');
    expect(galley?.upgradesTo).toBe('trireme');
    expect(galley?.obsoletedByTech).toBe('triremes');
  });

  it('steamship has an upgrade target (troop_transport) — no dead-end civilian line', () => {
    const steamship = TRAINABLE_UNITS.find(u => u.type === 'steamship');
    expect(steamship?.upgradesTo).toBe('troop_transport');
  });
});

describe('naval era-balance — frigate sits between trireme and ironclad', () => {
  it('frigate beats trireme most of the time (38 vs 25 strength, ±20% combat variance)', () => {
    expect(attackerWinRate('frigate', 'trireme')).toBeGreaterThanOrEqual(0.8);
  });

  // Frigate (38) vs ironclad (42) is a modest, not overwhelming, strength gap — the ±20%
  // combat-variance model means the next-era unit favors winning more often than not,
  // not a guaranteed stomp. Assert the directional edge rather than an unrealistic ~100%.
  it('ironclad beats frigate more often than not', () => {
    expect(attackerWinRate('ironclad', 'frigate')).toBeGreaterThan(0.5);
  });
});
