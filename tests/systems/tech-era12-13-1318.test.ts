import { describe, expect, it } from 'vitest';
import type { City, GameMap } from '@/core/types';
import { foundCity } from '@/systems/city-system';
import { generateMap } from '@/systems/map-generator';
import { getCityTechYields } from '@/systems/tech-yield-system';
import { getCombatModifier, type CombatModifierContext } from '@/systems/unit-modifier-system';

// #1318: Era 12-13 reference flats and unconditional combat rows, reviewed one by one. Every one is a documented KEEP,
// pinned here so a future change is deliberate. See the decision table in the PR and the audit data notes.
//
// lab-grown-food was trialled as "+2 food on worked desert/tundra/snow/mountain tiles". Measured evidence against it:
// with that row, tests/simulation/domination-ai-campaign.test.ts went from ~12 s to ~37 s locally (54 s -> 118-152 s on
// CI, past its 90 s ceiling), i.e. late-game food for a typical empire fell enough to change the whole campaign
// trajectory. A conditional that is not amount-preserving for typical cities is a balance change, not a strategic
// improvement, so the flat bonus stays.

const counters = () => ({ nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 });
const map: GameMap = generateMap(20, 20, 'era-12-13');
const start = Object.values(map.tiles).find(t => t.terrain === 'grassland' && !t.hasRiver)!.coord;
const city = (overrides: Partial<City> = {}): City => ({ ...foundCity('player', start, map, counters()), population: 6, ...overrides });
const ctx = (overrides: Partial<CombatModifierContext> = {}): CombatModifierContext => (
  { completedTechs: [], activeNationalProjects: [], fullHP: true, inFriendlyCity: false, opponentType: 'warrior', ...overrides }
);

describe('documented KEEP decisions (#1318)', () => {
  it('lab-grown-food stays +2 food in every city, with or without barren land', () => {
    expect(getCityTechYields(city(), map, ['lab-grown-food']).total.food).toBe(2);
    expect(getCityTechYields(city({ buildings: [] }), map, ['lab-grown-food']).total.food).toBe(2);
    expect(getCityTechYields(city(), map, []).total.food).toBe(0);
  });

  it('universal-basic-services stays a network-independent +1 food in every city (a deliberate Era 13 floor)', () => {
    expect(getCityTechYields(city(), map, ['universal-basic-services']).total.food).toBe(1);
    expect(getCityTechYields(city({ buildings: [] }), map, ['universal-basic-services']).total.food).toBe(1);
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
