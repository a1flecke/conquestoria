import { describe, expect, it } from 'vitest';
import type { City, GameMap } from '@/core/types';
import { foundCity } from '@/systems/city-system';
import { generateMap } from '@/systems/map-generator';
import { TECH_TREE } from '@/systems/tech-definitions';
import { getCityTechYields, getTerrainTechYieldBonus } from '@/systems/tech-yield-system';
import { getCombatModifier, type CombatModifierContext } from '@/systems/unit-modifier-system';

// #1318: Era 12-13 reference flats and unconditional combat rows, reconciled one by one.
// CHANGE: lab-grown-food. KEEP (documented, pinned here so a future change is deliberate): universal-basic-services,
// nanomaterials, tungsten-alloys, carbon-fiber.

const counters = () => ({ nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 });
const map: GameMap = generateMap(20, 20, 'era-12-13');
const start = Object.values(map.tiles).find(t => t.terrain === 'grassland' && !t.hasRiver)!.coord;
const city = (): City => ({ ...foundCity('player', start, map, counters()), population: 6 });
const text = (id: string) => TECH_TREE.find(t => t.id === id)!.unlocks.join(' ');
const ctx = (overrides: Partial<CombatModifierContext> = {}): CombatModifierContext => (
  { completedTechs: [], activeNationalProjects: [], fullHP: true, inFriendlyCity: false, opponentType: 'warrior', ...overrides }
);

describe('lab-grown-food: food that does not need farmland (#1318)', () => {
  it('pays +2 food on each worked barren tile and nothing elsewhere', () => {
    for (const terrain of ['desert', 'tundra', 'snow', 'mountain']) {
      expect(getTerrainTechYieldBonus(terrain, ['lab-grown-food']).food, terrain).toBe(2);
    }
    for (const terrain of ['grassland', 'plains', 'forest', 'hills', 'ocean', 'coast']) {
      expect(getTerrainTechYieldBonus(terrain, ['lab-grown-food']).food ?? 0, terrain).toBe(0);
    }
    expect(getTerrainTechYieldBonus('desert', []).food ?? 0).toBe(0);
  });

  it('no longer adds a flat per-city bonus', () => {
    expect(getCityTechYields(city(), map, ['lab-grown-food']).total.food).toBe(0);
  });

  it('text names the real condition', () => {
    expect(text('lab-grown-food')).toMatch(/desert|tundra|snow|mountain/);
    expect(text('lab-grown-food')).not.toMatch(/all cities/);
  });
});

describe('documented KEEP decisions (#1318)', () => {
  it('universal-basic-services stays a network-independent +1 food in every city (a deliberate Era 13 floor)', () => {
    expect(getCityTechYields(city(), map, ['universal-basic-services']).total.food).toBe(1);
    expect(getCityTechYields({ ...city(), buildings: [] }, map, ['universal-basic-services']).total.food).toBe(1);
  });

  it('nanomaterials stays +3 for every unit, attacking or defending', () => {
    for (const unit of ['warrior', 'tank'] as const) {
      expect(getCombatModifier(unit, 'attacker', ctx({ completedTechs: ['nanomaterials'] })).flat, unit).toBe(3);
      expect(getCombatModifier(unit, 'defender', ctx({ completedTechs: ['nanomaterials'] })).flat, unit).toBe(3);
    }
  });

  it('tungsten-alloys and carbon-fiber stay class identity, not army-wide', () => {
    expect(getCombatModifier('tank', 'attacker', ctx({ completedTechs: ['tungsten-alloys'] })).flat).toBe(2);
    expect(getCombatModifier('warrior', 'attacker', ctx({ completedTechs: ['tungsten-alloys'] })).flat).toBe(0);
    expect(getCombatModifier('jet_fighter', 'attacker', ctx({ completedTechs: ['carbon-fiber'] })).flat).toBe(2);
    expect(getCombatModifier('warrior', 'attacker', ctx({ completedTechs: ['carbon-fiber'] })).flat).toBe(0);
  });
});
