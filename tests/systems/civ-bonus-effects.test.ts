import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { City, CivBonusEffect, CombatResult, GameMap, GameState } from '@/core/types';
import { EventBus } from '@/core/event-bus';
import { createNewGame } from '@/core/game-state';
import { createRoundPhaseContext } from '@/core/round-phases/types';
import { eraProgressionPhase } from '@/core/round-phases/era-progression';
import { healCivUnits } from '@/core/round-phases/per-civ/unit-recovery';
import { CIV_DEFINITIONS } from '@/systems/civ-definitions';
import { CUSTOM_CIV_PRIMARY_TRAITS } from '@/systems/custom-civ-system';
import { applyAutoRoadsForNewCity, foundCityInState } from '@/systems/city-founding-system';
import { calculateCityAssaultStrengths, getCityOwnerBonus } from '@/systems/city-siege-system';
import { calculateCityPressureForTile, getTerritoryRadiusForCity } from '@/systems/city-territory-system';
import { getCityGrowthThreshold } from '@/systems/city-turn';
import { applyCombatOutcomeToState } from '@/systems/combat-reward-system';
import { calculateCombatStrengths, getHealthStrengthFactor } from '@/systems/combat-system';
import { projectCivGrossGold } from '@/systems/economy-system';
import { getCivCityVisionBonus } from '@/systems/fog-of-war';
import { hexKey, hexNeighbors } from '@/systems/hex-utils';
import { calculateCivResearchOutput } from '@/systems/research-output-system';
import { calculateCityYields } from '@/systems/resource-system';
import { grantFreeTech } from '@/systems/tech-system';
import { resolveCivilizationEra } from '@/systems/tech-definitions';
import { UNIT_DEFINITIONS } from '@/systems/unit-definitions';
import { createUnit, resetUnitTurn } from '@/systems/unit-lifecycle';
import { completeUnitProduction } from '@/systems/unit-production-completion';
import { applyWorkerAction, FOREST_FARM_PRODUCTION_BONUS } from '@/systems/worker-action-system';
import { applyProductionBonus } from '@/systems/city-system';

function makeCity(overrides?: Partial<City>): City {
  return {
    id: 'city-1', name: 'Test City', owner: 'p1',
    position: { q: 0, r: 0 }, population: 3,
    ownedTiles: [{ q: 0, r: 0 }, { q: 1, r: 0 }],
    workedTiles: [{ q: 0, r: 0 }, { q: 1, r: 0 }],
    focus: 'balanced',
    maturity: 'outpost',
    buildings: [], productionQueue: [], productionProgress: 0,
    food: 0, foodNeeded: 15,
    grid: [[null]], gridSize: 3,
    ...overrides,
  } as City;
}

function makeMap(tiles: Record<string, { terrain: string; improvement?: string; improvementTurnsLeft?: number }>): GameMap {
  // Convert to the expected tile format
  const fullTiles: Record<string, any> = {};
  for (const [key, t] of Object.entries(tiles)) {
    const [q, r] = key.split(',').map(Number);
    fullTiles[key] = {
      terrain: t.terrain,
      improvement: t.improvement ?? 'none',
      improvementTurnsLeft: t.improvementTurnsLeft ?? 0,
      coord: { q, r },
      resource: null,
      wonder: null,
    };
  }
  return { tiles: fullTiles } as unknown as GameMap;
}

describe('civ bonus effects', () => {
  describe('Russia tundra_bonus', () => {
    it('adds food and production per tundra tile', () => {
      const bonus: CivBonusEffect = { type: 'tundra_bonus', foodBonus: 1, productionBonus: 1 };
      const city = makeCity({
        position: { q: 2, r: 0 },
        ownedTiles: [{ q: 0, r: 0 }, { q: 1, r: 0 }],
        workedTiles: [{ q: 0, r: 0 }, { q: 1, r: 0 }],
      });
      const map = makeMap({
        '0,0': { terrain: 'tundra' },
        '1,0': { terrain: 'plains' },
      });
      const base = calculateCityYields(city, map);
      const boosted = calculateCityYields(city, map, bonus);
      expect(boosted.food).toBe(base.food + 1); // 1 tundra tile
      expect(boosted.production).toBe(base.production + 1);
    });
  });

  describe('Shire peaceful_growth', () => {
    it('adds flat food bonus', () => {
      const bonus: CivBonusEffect = { type: 'peaceful_growth', foodBonus: 2, militaryPenalty: 0.25 };
      const city = makeCity();
      const map = makeMap({ '0,0': { terrain: 'plains' }, '1,0': { terrain: 'plains' } });
      const base = calculateCityYields(city, map);
      const boosted = calculateCityYields(city, map, bonus);
      expect(boosted.food).toBe(base.food + 2);
    });

    it('penalizes military production cost', () => {
      const bonus: CivBonusEffect = { type: 'peaceful_growth', foodBonus: 2, militaryPenalty: 0.25 };
      const baseCost = applyProductionBonus('warrior', undefined);
      const penalizedCost = applyProductionBonus('warrior', bonus);
      expect(penalizedCost).toBeGreaterThan(baseCost);
    });
  });
});

/**
 * #1692 A: every civilization bonus the picker advertises must change the game. Half of them never did, because
 * nothing compared a bonus type against its consumers. The first block is that comparison; the rest prove each
 * newly wired bonus against the same state played by a civilization without it.
 */

const SRC = join(__dirname, '..', '..', 'src');
const DECLARATION_FILES = new Set([
  join(SRC, 'core', 'types.ts'),
  join(SRC, 'systems', 'civ-definitions.ts'),
  join(SRC, 'systems', 'custom-civ-system.ts'),
]);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return path.endsWith('.ts') && !DECLARATION_FILES.has(path) ? [path] : [];
  });
}

/** A real game with the human civilization's capital founded. */
function gameWithCapital(civType: string): { state: GameState; cityId: string } {
  const created = createNewGame(civType, `bonus-${civType}`, 'small');
  const settlerId = created.civilizations.player.units.find(id => created.units[id]?.type === 'settler')!;
  const founded = foundCityInState(created, settlerId, new EventBus());
  return { state: founded.state, cityId: founded.cityId };
}

/** The same state played by a civilization with a different bonus: the control for every comparison. */
function asCiv(state: GameState, civType: string): GameState {
  return {
    ...state,
    civilizations: { ...state.civilizations, player: { ...state.civilizations.player, civType } },
  };
}

const CONTROL_CIV = 'egypt';

describe('every civilization bonus has a consumer (#1692)', () => {
  it('each bonus type used by a built-in civilization or custom trait is read somewhere outside its declaration', () => {
    const source = sourceFiles(SRC).map(path => readFileSync(path, 'utf8')).join('\n');
    const used = new Set<string>([
      ...CIV_DEFINITIONS.map(def => def.bonusEffect.type),
      ...CUSTOM_CIV_PRIMARY_TRAITS.map(trait => trait.bonusEffect.type),
    ]);
    const unconsumed = [...used].filter(type => !source.includes(`'${type}'`)).sort();
    expect(unconsumed).toEqual([]);
  });

  it('the control civilization really has none of the bonuses under test', () => {
    expect(CIV_DEFINITIONS.find(def => def.id === CONTROL_CIV)?.bonusEffect.type).toBe('faster_wonders');
  });
});

describe('newly wired civilization bonuses (#1692)', () => {
  it('Mongolia: mounted units are built with the movement bonus; foot units and other civilizations are not', () => {
    const { state, cityId } = gameWithCapital('mongolia');
    const build = (base: GameState, unitType: 'horseman' | 'warrior') => {
      const done = completeUnitProduction(base, { civId: 'player', cityId, unitType });
      if (!done.ok) throw new Error(`production refused: ${done.reason}`);
      return done.unit;
    };
    const horseman = build(state, 'horseman');
    expect(horseman.movementPointsLeft).toBe(UNIT_DEFINITIONS.horseman.movementPoints + 1);
    expect(horseman.movementBonus).toBe(1);
    // Kept across turns: the per-turn reset re-applies the stored bonus.
    expect(resetUnitTurn(horseman).movementPointsLeft).toBe(UNIT_DEFINITIONS.horseman.movementPoints + 1);
    expect(build(state, 'warrior').movementPointsLeft).toBe(UNIT_DEFINITIONS.warrior.movementPoints);
    expect(build(asCiv(state, CONTROL_CIV), 'horseman').movementPointsLeft).toBe(UNIT_DEFINITIONS.horseman.movementPoints);
  });

  it('Germany: city production is 15% higher, and nothing else moves', () => {
    const { state, cityId } = gameWithCapital('germany');
    const city = { ...state.cities[cityId]!, buildings: ['workshop', 'workshop', 'workshop'] };
    const base = calculateCityYields(city, state.map, undefined);
    const boosted = calculateCityYields(city, state.map, { type: 'industrial_efficiency', productionBonus: 0.15 });
    expect(base.production).toBeGreaterThanOrEqual(7);
    expect(boosted.production).toBe(Math.round(base.production * 1.15));
    expect(boosted.production).toBeGreaterThan(base.production);
    expect({ ...boosted, production: 0 }).toEqual({ ...base, production: 0 });
  });

  it('China: research output is 20% higher than the same empire without the bonus', () => {
    const { state, cityId } = gameWithCapital('china');
    const options = { authoritativeCityScience: { [cityId]: 20 } };
    const china = calculateCivResearchOutput(state, 'player', options);
    const control = calculateCivResearchOutput(asCiv(state, CONTROL_CIV), 'player', options);
    expect(control.finalScience).toBeGreaterThan(0);
    expect(china.finalScience).toBe(control.finalScience + Math.floor(control.finalScience * 0.2));
    // The breakdown still adds up to the final figure.
    expect(china.rows.filter(row => row.kind !== 'final').reduce((sum, row) => sum + row.science, 0)).toBe(china.finalScience);
  });

  it('Persia: each earning trade route pays the flat bonus', () => {
    const { state, cityId } = gameWithCapital('persia');
    const withRoute: GameState = {
      ...state,
      marketplace: {
        ...state.marketplace!,
        tradeRoutes: [{ id: 'route-1', fromCityId: cityId, toCityId: cityId, goldPerTrip: 4, turnsPerTrip: 2 }],
      },
    };
    const persia = projectCivGrossGold(withRoute, 'player');
    const control = projectCivGrossGold(asCiv(withRoute, CONTROL_CIV), 'player');
    expect(persia - control).toBe(3);
    expect(projectCivGrossGold(state, 'player')).toBe(projectCivGrossGold(asCiv(state, CONTROL_CIV), 'player'));
  });

  it('England: coastal cities see one tile farther; inland cities and other civilizations do not', () => {
    const { state } = gameWithCapital('england');
    const coords = Object.values(state.map.tiles);
    const isWater = (terrain: string | undefined) => terrain === 'ocean' || terrain === 'coast';
    const coastal = coords.find(tile => !isWater(tile.terrain)
      && hexNeighbors(tile.coord).some(n => isWater(state.map.tiles[hexKey(n)]?.terrain)))!;
    const inland = coords.find(tile => !isWater(tile.terrain)
      && hexNeighbors(tile.coord).every(n => state.map.tiles[hexKey(n)] && !isWater(state.map.tiles[hexKey(n)]!.terrain)))!;
    const bonus = getCivCityVisionBonus(state, 'player');
    expect(bonus?.(coastal.coord)).toBe(1);
    expect(bonus?.(inland.coord)).toBe(0);
    expect(getCivCityVisionBonus(asCiv(state, CONTROL_CIV), 'player')).toBeUndefined();
  });

  it('England: warships are stronger attacking and defending; land units are not', () => {
    const { state } = gameWithCapital('england');
    const bonus: CivBonusEffect = { type: 'naval_bonus', visionBonus: 1, navalCombatBonus: 0.15 };
    const counters = { nextUnitId: 900 } as GameState['idCounters'];
    const galley = createUnit('galley', 'player', { q: 0, r: 0 }, counters);
    const enemyGalley = createUnit('galley', 'ai-1', { q: 1, r: 0 }, counters);
    const warrior = createUnit('warrior', 'player', { q: 0, r: 0 }, counters);
    const plain = calculateCombatStrengths(galley, enemyGalley, state.map, {});
    const attacking = calculateCombatStrengths(galley, enemyGalley, state.map, { attackerBonus: bonus });
    const defending = calculateCombatStrengths(enemyGalley, galley, state.map, { defenderBonus: bonus });
    const plainDefending = calculateCombatStrengths(enemyGalley, galley, state.map, {});
    expect(attacking.attackerStrength).toBeCloseTo(plain.attackerStrength * 1.15);
    expect(attacking.defenderStrength).toBeCloseTo(plain.defenderStrength);
    expect(defending.defenderStrength).toBeCloseTo(plainDefending.defenderStrength * 1.15);
    const land = calculateCombatStrengths(warrior, enemyGalley, state.map, { attackerBonus: bonus });
    const landPlain = calculateCombatStrengths(warrior, enemyGalley, state.map, {});
    expect(land.attackerStrength).toBeCloseTo(landPlain.attackerStrength);
  });

  it('Japan: below half health a unit fights at full strength; at or above it, health still counts', () => {
    const bushido: CivBonusEffect = { type: 'bushido' };
    expect(getHealthStrengthFactor({ health: 49 }, bushido)).toBe(1);
    expect(getHealthStrengthFactor({ health: 10 }, bushido)).toBe(1);
    expect(getHealthStrengthFactor({ health: 50 }, bushido)).toBe(0.5);
    expect(getHealthStrengthFactor({ health: 80 }, bushido)).toBe(0.8);
    expect(getHealthStrengthFactor({ health: 49 }, undefined)).toBe(0.49);

    const { state } = gameWithCapital('japan');
    const counters = { nextUnitId: 900 } as GameState['idCounters'];
    const wounded = { ...createUnit('warrior', 'player', { q: 0, r: 0 }, counters), health: 30 };
    const enemy = createUnit('warrior', 'ai-1', { q: 1, r: 0 }, counters);
    const plain = calculateCombatStrengths(wounded, enemy, state.map, {});
    const withBushido = calculateCombatStrengths(wounded, enemy, state.map, { attackerBonus: bushido });
    expect(withBushido.attackerStrength).toBeCloseTo(plain.attackerStrength / 0.3);
  });

  it('India: cities need 15% less food to grow; the stored base is untouched', () => {
    expect(getCityGrowthThreshold({ foodNeeded: 15 }, { type: 'faster_growth', foodReduction: 0.85 })).toBe(12);
    expect(getCityGrowthThreshold({ foodNeeded: 100 }, { type: 'faster_growth', foodReduction: 0.85 })).toBe(85);
    expect(getCityGrowthThreshold({ foodNeeded: 15 }, undefined)).toBe(15);
    expect(getCityGrowthThreshold({ foodNeeded: 15 }, { type: 'bushido' })).toBe(15);
  });

  it('France: a two-citizen city already claims the wide border and presses harder on every tile', () => {
    const { state, cityId } = gameWithCapital('france');
    const small = { ...state.cities[cityId]!, population: 1, buildings: [], maturity: 'outpost' as const };
    const grown = { ...small, population: 2 };
    const control = asCiv(state, CONTROL_CIV);
    expect(getTerritoryRadiusForCity(state, small)).toBe(2);
    expect(getTerritoryRadiusForCity(state, grown)).toBe(3);
    expect(getTerritoryRadiusForCity(control, grown)).toBe(2);
    const tile = { q: small.position.q + 1, r: small.position.r };
    expect(calculateCityPressureForTile(state, small, tile) - calculateCityPressureForTile(control, small, tile)).toBe(2);
  });

  it('Gondor: a walled city is 25% harder to storm; an unwalled one is not, and nobody else gets it', () => {
    const { state, cityId } = gameWithCapital('gondor');
    const city = state.cities[cityId]!;
    const walled = { ...city, buildings: [...city.buildings, 'walls'] };
    const counters = { nextUnitId: 900 } as GameState['idCounters'];
    const neighbour = hexNeighbors(city.position)[0]!;
    const attacker = createUnit('warrior', 'ai-1', neighbour, counters);
    const bonus = getCityOwnerBonus(state, city);
    expect(bonus?.type).toBe('fortified_defense');
    const strengths = (target: typeof city, defenderBonus: CivBonusEffect | undefined) =>
      calculateCityAssaultStrengths(attacker, target, [], state.map, { defenderBonus });
    expect(strengths(walled, bonus).intrinsicStrength).toBeCloseTo(strengths(walled, undefined).intrinsicStrength * 1.25);
    expect(strengths(walled, bonus).winProbability).toBeLessThan(strengths(walled, undefined).winProbability);
    expect(strengths(city, bonus).intrinsicStrength).toBeCloseTo(strengths(city, undefined).intrinsicStrength);
    expect(getCityOwnerBonus(asCiv(state, CONTROL_CIV), city)?.type).not.toBe('fortified_defense');
  });

  it('Rohan: wounded cavalry on grassland recover 10 more than the same unit would otherwise', () => {
    const { state } = gameWithCapital('rohan');
    const grass = Object.values(state.map.tiles).find(tile => tile.terrain === 'grassland' && tile.owner == null
      && !Object.values(state.units).some(unit => hexKey(unit.position) === hexKey(tile.coord)));
    expect(grass, 'the fixture map needs an unowned grassland tile').toBeDefined();
    const counters = { ...state.idCounters };
    const horse = { ...createUnit('horseman', 'player', grass!.coord, counters), health: 40 };
    const foot = { ...createUnit('warrior', 'player', grass!.coord, counters), health: 40 };
    const withUnits = (base: GameState): GameState => {
      const next = structuredClone(base);
      next.units[horse.id] = { ...horse };
      next.units[foot.id] = { ...foot };
      next.civilizations.player.units.push(horse.id, foot.id);
      return next;
    };
    const heal = (base: GameState) => {
      const working = withUnits(base);
      const civ = working.civilizations.player;
      healCivUnits(working, { civId: 'player', civ } as Parameters<typeof healCivUnits>[1], civ.techState.completed);
      return { horse: working.units[horse.id]!.health, foot: working.units[foot.id]!.health };
    };
    const rohan = heal(state);
    const control = heal(asCiv(state, CONTROL_CIV));
    expect(rohan.horse - control.horse).toBe(10);
    expect(rohan.foot).toBe(control.foot);
  });

  it('Aztec: a combat victory adds 5 production to the nearest own city; other civilizations get nothing', () => {
    const { state, cityId } = gameWithCapital('aztec');
    const warriorId = state.civilizations.player.units.find(id => state.units[id]?.type === 'warrior')!;
    const warrior = state.units[warriorId]!;
    const counters = { ...state.idCounters };
    const victim = createUnit('warrior', 'barbarian', hexNeighbors(warrior.position)[0]!, counters);
    const arena: GameState = { ...state, idCounters: counters, units: { ...state.units, [victim.id]: victim } };
    const result: CombatResult = {
      attackerId: warrior.id, defenderId: victim.id, attackerDamage: 0, defenderDamage: 100,
      attackerSurvived: true, defenderSurvived: false, attackerStrength: 20, defenderStrength: 20,
      attackerPosition: warrior.position, defenderPosition: victim.position,
    };
    const before = arena.cities[cityId]!.productionProgress;
    expect(applyCombatOutcomeToState(arena, result, 64).state.cities[cityId]!.productionProgress).toBe(before + 5);
    expect(applyCombatOutcomeToState(asCiv(arena, CONTROL_CIV), result, 64).state.cities[cityId]!.productionProgress).toBe(before);
  });

  it('Babylon: entering a new era completes one technology, without touching current research', () => {
    const { state } = gameWithCapital('babylon');
    const techState = { ...state.civilizations.player.techState, currentResearch: 'fire', researchProgress: 7 };
    const grant = grantFreeTech(techState);
    expect(grant.grantedTech).not.toBeNull();
    expect(grant.grantedTech).not.toBe('fire');
    expect(grant.state.completed).toContain(grant.grantedTech);
    expect(grant.state.currentResearch).toBe('fire');
    expect(grant.state.researchProgress).toBe(7);

    // The round phase: only a civilization whose own era rose this round, and only Babylon.
    const run = (base: GameState, previousEra: number) => {
      const bus = new EventBus();
      const completed: string[] = [];
      bus.on('tech:completed', ({ civId, techId }) => { if (civId === 'player') completed.push(techId); });
      const context = createRoundPhaseContext(base, bus);
      const era = resolveCivilizationEra(base.civilizations.player.techState.completed);
      const after = eraProgressionPhase.run(structuredClone(base), {
        ...context,
        previousEraByCiv: { ...context.previousEraByCiv, player: (era - previousEra) as typeof era },
      });
      return { completed, count: after.civilizations.player.techState.completed.length };
    };
    const techCount = state.civilizations.player.techState.completed.length;
    expect(run(state, 1)).toEqual({ completed: [expect.any(String)], count: techCount + 1 });
    expect(run(state, 0)).toEqual({ completed: [], count: techCount });
    expect(run(asCiv(state, CONTROL_CIV), 1)).toEqual({ completed: [], count: techCount });
  });

  it('Rome: founding a second city lays a road to the first, skipping city centres and foreign land', () => {
    const { state, cityId } = gameWithCapital('rome');
    const capital = state.cities[cityId]!;
    // A second Roman city four tiles along a row of plain land the test lays down itself.
    const tiles = { ...state.map.tiles };
    const route = [1, 2, 3, 4].map(step => ({ q: capital.position.q + step, r: capital.position.r }));
    for (const coord of route) {
      const existing = tiles[hexKey(coord)];
      expect(existing, 'the fixture map must be wide enough for the route').toBeDefined();
      tiles[hexKey(coord)] = { ...existing!, terrain: 'plains', owner: null, hasRoad: false };
    }
    const second = { ...capital, id: 'city-second', position: route[3]!, ownedTiles: [route[3]!], workedTiles: [] };
    const twoCities: GameState = {
      ...state,
      map: { ...state.map, tiles },
      cities: { ...state.cities, [second.id]: second },
      civilizations: {
        ...state.civilizations,
        player: { ...state.civilizations.player, cities: [...state.civilizations.player.cities, second.id] },
      },
    };
    const built = applyAutoRoadsForNewCity(twoCities, second.id);
    expect(built.roadTiles.length).toBeGreaterThan(0);
    for (const coord of built.roadTiles) {
      expect(built.state.map.tiles[hexKey(coord)]!.hasRoad).toBe(true);
      expect(hexKey(coord)).not.toBe(hexKey(capital.position));
      expect(hexKey(coord)).not.toBe(hexKey(second.position));
    }
    expect(twoCities.map.tiles[hexKey(route[0]!)]!.hasRoad).toBe(false); // input not mutated

    // Foreign land on the route is left alone.
    const foreignKey = hexKey(built.roadTiles[0]!);
    const withForeign: GameState = {
      ...twoCities,
      map: { ...twoCities.map, tiles: { ...tiles, [foreignKey]: { ...tiles[foreignKey]!, owner: 'ai-1' } } },
    };
    expect(applyAutoRoadsForNewCity(withForeign, second.id).state.map.tiles[foreignKey]!.hasRoad).toBeFalsy();

    // Nobody else gets free roads.
    expect(applyAutoRoadsForNewCity(asCiv(twoCities, CONTROL_CIV), second.id).roadTiles).toEqual([]);
  });

  it('Isengard: clearing a forest for a farm pays the burst on top of the ordinary yield', () => {
    const { state, cityId } = gameWithCapital('isengard');
    const city = state.cities[cityId]!;
    const spot = city.ownedTiles.find(coord => hexKey(coord) !== hexKey(city.position))!;
    const counters = { ...state.idCounters };
    const worker = createUnit('worker', 'player', spot, counters);
    const tile = state.map.tiles[hexKey(spot)]!;
    const forested: GameState = {
      ...state,
      idCounters: counters,
      map: {
        ...state.map,
        tiles: { ...state.map.tiles, [hexKey(spot)]: { ...tile, terrain: 'forest', improvement: 'none', improvementTurnsLeft: 0, resource: null, owner: 'player' } },
      },
      units: { ...state.units, [worker.id]: worker },
      civilizations: {
        ...state.civilizations,
        player: {
          ...state.civilizations.player,
          units: [...state.civilizations.player.units, worker.id],
          techState: { ...state.civilizations.player.techState, completed: [...state.civilizations.player.techState.completed, 'gathering', 'irrigation', 'agriculture'] },
        },
      },
    };
    const isengard = applyWorkerAction(forested, worker.id, 'farm');
    const control = applyWorkerAction(asCiv(forested, CONTROL_CIV), worker.id, 'farm');
    expect(control.ok && control.forestProductionBonus).toBe(FOREST_FARM_PRODUCTION_BONUS);
    expect(isengard.ok && isengard.forestProductionBonus).toBe(FOREST_FARM_PRODUCTION_BONUS + 30);
    expect(isengard.ok && isengard.state.cities[cityId]!.productionProgress)
      .toBe(city.productionProgress + FOREST_FARM_PRODUCTION_BONUS + 30);
  });
});
