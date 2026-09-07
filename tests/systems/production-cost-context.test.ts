import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createNewGame } from '@/core/game-state';
import type { City, GameState, OpponentChallenge, PersonalityTraits } from '@/core/types';
import {
  TRAINABLE_UNITS,
  createProductionCostContext,
  foundCity,
  getProductionCostForItem,
  processCity,
} from '@/systems/city-system';
import {
  buildProductionCostContext,
  getContextualProductionCost,
  getProductionCostForCivItem,
} from '@/systems/production-cost-context';
import { ECONOMY_RULES, getRushBuyQuote } from '@/systems/economy-system';
import { getRecommendedIdleCityChoice } from '@/systems/planning-system';
import { estimateCaravanReadyTurns } from '@/systems/quest-objective-system';
import { generateAIProductionCandidates } from '@/ai/ai-production';
import type { AIForceDemand } from '@/ai/ai-unit-assignment';
import { getAIStrategicRoles } from '@/ai/ai-unit-roles';
import { calculateProjectedCityYields } from '@/systems/city-work-system';
import { resolveCivilizationEra, resolveWorldAge, TECH_TREE } from '@/systems/tech-definitions';
import { getActiveNationalProjectsForCiv } from '@/systems/national-project-system';
import { hexKey } from '@/systems/hex-utils';

const LAGGARD = 'player';
const SRC = resolve(__dirname, '../../src');

const aggressive: PersonalityTraits = {
  traits: ['aggressive'],
  warLikelihood: 1,
  diplomacyFocus: 0,
  expansionDrive: 0,
};

function techsThroughEra(era: number): string[] {
  return TECH_TREE.filter(tech => tech.era <= era).map(tech => tech.id);
}

/**
 * Four major civilizations, three of them advanced through era 5 and one left
 * behind in era 1. `resolveWorldAge` needs a majority, so a two-civ fixture
 * collapses World Age onto the laggard's own era and proves nothing (#984).
 */
function laggardWorldState(
  seed: string,
  opponentChallenge: OpponentChallenge = 'standard',
): { state: GameState; city: City } {
  const state = createNewGame({
    civType: 'rome',
    seed,
    mapSize: 'medium',
    opponentCount: 3,
    gameTitle: 'production-cost-context',
    opponentChallenge,
  });
  const advanced = techsThroughEra(5);
  for (const civ of Object.values(state.civilizations)) {
    if (civ.id === LAGGARD) continue;
    civ.techState.completed = [...advanced];
  }
  state.era = resolveWorldAge(state);

  const laggard = state.civilizations[LAGGARD];
  const settler = laggard.units.map(id => state.units[id]).find(unit => unit?.type === 'settler')!;
  const city = foundCity(laggard.id, settler.position, state.map, state.idCounters);
  state.cities[city.id] = city;
  laggard.cities = [city.id];
  laggard.gold = 5000;
  // Few enough era-1 techs to stay in era 1; enough to unlock the axeman and
  // reveal the copper on the city centre that a resource advantage needs.
  laggard.techState.completed = ['stone-weapons'];
  state.map.tiles[hexKey(city.position)].resource = 'copper';
  // Tribal Muster Ground: era-1/2 melee units train 10% cheaper empire-wide.
  state.builtNationalProjects = {
    ...(state.builtNationalProjects ?? {}),
    [`${LAGGARD}:tribal_muster_ground`]: { civId: LAGGARD, eraBuilt: 1, turn: 1 } as never,
  };
  return { state, city };
}

function eachSourceFile(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) return eachSourceFile(full);
    return entry.name.endsWith('.ts') ? [full] : [];
  });
}

describe('#984 A — every production cost uses the owning civilization era', () => {
  it('the context reports the civ era, never World Age', () => {
    const { state, city } = laggardWorldState('context-era');
    const context = buildProductionCostContext(state, LAGGARD, city.id);

    expect(state.era).toBe(5);
    expect(context.era).toBe(1);
    expect(context.era).toBe(resolveCivilizationEra(state.civilizations[LAGGARD].techState.completed));
    expect(context.era).not.toBe(state.era);
  });

  it('prices a settler from the civ era, so World Age cannot inflate it', () => {
    const { state, city } = laggardWorldState('context-settler');
    const civEraCost = getProductionCostForCivItem(state, LAGGARD, city.id, 'settler');
    const worldAgeCost = getProductionCostForItem('settler', {
      ...buildProductionCostContext(state, LAGGARD, city.id),
      era: state.era,
    });

    expect(worldAgeCost).toBeGreaterThan(civEraCost);
    expect(civEraCost).toBe(getProductionCostForItem('settler', { era: 1 }));
  });
});

describe('#984 B — every consumer agrees on the cost of the same item', () => {
  it('panel, rush buy, completion threshold, AI and planning all resolve one number', () => {
    const { state, city } = laggardWorldState('cross-consumer');
    const context = buildProductionCostContext(state, LAGGARD, city.id);
    const canonical = getContextualProductionCost('axeman', context);

    // The city panel's displayed cost is `getContextualProductionCost` over
    // this same context, so assert the context it would build.
    expect(getProductionCostForCivItem(state, LAGGARD, city.id, 'axeman')).toBe(canonical);

    // Rush buy: quoted gold is the multiplier applied to the same base cost.
    state.cities[city.id] = { ...city, productionQueue: ['axeman'], productionProgress: 0 };
    const quote = getRushBuyQuote(state, LAGGARD, city.id);
    expect(quote.available).toBe(true);
    expect(quote.cost).toBe(Math.ceil(canonical * ECONOMY_RULES.rushBuyMultiplier));

    // Completion threshold: exactly `canonical` production finishes the unit,
    // one less does not.
    const queued = { ...state.cities[city.id], productionProgress: 0 };
    expect(processCity(queued, state.map, 0, canonical, context, 'rome').completedUnit).toBe('axeman');
    expect(processCity(queued, state.map, 0, canonical - 1, context, 'rome').completedUnit).toBeNull();

    // AI candidate scoring: production turns derive from the same cost.
    state.cities[city.id] = { ...city, productionQueue: [], productionProgress: 0 };
    const output = Math.max(1, calculateProjectedCityYields(state, city.id, context.bonusEffect).production);
    const axemanRole = getAIStrategicRoles('axeman')[0];
    const demands: AIForceDemand[] = [{
      role: axemanRole,
      desired: 1,
      assigned: 0,
      missing: 1,
      priority: 100,
      sourcePlanIds: ['primary'],
    }];
    const candidates = generateAIProductionCandidates(state, LAGGARD, city.id, demands, aggressive);
    const axeman = candidates.find(candidate => candidate.itemId === 'axeman');
    expect(axeman, 'axeman is an AI production candidate').toBeDefined();
    expect(axeman!.productionTurns).toBe(Math.max(1, Math.ceil(canonical / output)));

    // Planning recommendation: same cost, same turns.
    const recommendation = getRecommendedIdleCityChoice(state, LAGGARD, city.id);
    expect(recommendation).not.toBeNull();
    expect(recommendation!.cost).toBe(
      getContextualProductionCost(recommendation!.itemId, buildProductionCostContext(state, LAGGARD, city.id)),
    );

    // Quest projection: caravan ETA is the same cost over the same output.
    state.cities[city.id] = { ...city, productionQueue: ['caravan'], productionProgress: 0 };
    const caravanCost = getProductionCostForCivItem(state, LAGGARD, city.id, 'caravan');
    expect(estimateCaravanReadyTurns(state, LAGGARD, city.id)).toBe(Math.ceil(caravanCost / output));
  });
});

describe('#984 D — the AI special-unit path shares the ordinary context', () => {
  it('missionary scoring reads the same context object as units and buildings', () => {
    // `missionary` is not era-scaled today, so a numeric comparison would pass
    // even with the old `era: state.era`. Assert the structure instead: the file
    // holds exactly one production-cost context and every branch prices from it.
    const source = readFileSync(resolve(SRC, 'ai/ai-production.ts'), 'utf8');
    expect(source.match(/buildProductionCostContext\(/g) ?? []).toHaveLength(1);
    expect(source.match(/getContextualProductionCost\(/g) ?? []).toHaveLength(3);
    expect(source).not.toMatch(/era:\s*state\.era/);
  });
});

describe('#984 F — the builder discards no existing modifier', () => {
  it('keeps the national-project discount, resource advantage and civ bonus', () => {
    const { state, city } = laggardWorldState('modifiers');
    const context = buildProductionCostContext(state, LAGGARD, city.id);

    expect(context.activeNationalProjects).toContainEqual({ id: 'tribal_muster_ground', fadeMultiplier: 1 });
    expect(context.activeNationalProjects).toEqual(getActiveNationalProjectsForCiv(state, LAGGARD));
    expect(context.availableResources?.has('copper')).toBe(true);
    expect(context.completedTechs).toEqual(state.civilizations[LAGGARD].techState.completed);
    expect(context.city).toEqual({ buildings: city.buildings });

    const base = TRAINABLE_UNITS.find(unit => unit.type === 'axeman')!.cost;
    const withProject = getContextualProductionCost('axeman', context);
    const withoutProject = getProductionCostForItem('axeman', { ...context, activeNationalProjects: [] });
    expect(withProject).toBeLessThan(withoutProject);
    expect(withoutProject).toBe(base);
  });

  it('carries the reward charges the completion threshold already spends', () => {
    const { state, city } = laggardWorldState('reward-charges');
    state.civilizations[LAGGARD].techState.completed = ['stone-weapons', 'horseback-riding'];
    state.stampedes = {
      ...(state.stampedes ?? {}),
      [LAGGARD]: {
        phase: 'resolved',
        outcome: 'contained',
        rewardGranted: true,
        herdingInsight: { expiresTurn: state.turn + 10 },
      } as never,
    };

    const context = buildProductionCostContext(state, LAGGARD, city.id);
    expect(context.herdingInsight).toBe(true);
    const base = TRAINABLE_UNITS.find(unit => unit.type === 'beast_handler')!.cost;
    expect(getContextualProductionCost('beast_handler', context)).toBe(Math.ceil(base * 0.8));
  });

  it('never lends one civilization another civilization city buildings', () => {
    const { state, city } = laggardWorldState('ownership');
    const rival = state.civilizations['ai-1'];
    const rivalSettler = rival.units.map(id => state.units[id]).find(unit => unit?.type === 'settler')!;
    const rivalCity = foundCity(rival.id, rivalSettler.position, state.map, state.idCounters);
    state.cities[rivalCity.id] = rivalCity;
    rival.cities = [rivalCity.id];

    expect(buildProductionCostContext(state, LAGGARD, rivalCity.id).city).toBeNull();
    expect(buildProductionCostContext(state, LAGGARD, city.id).city).not.toBeNull();
    expect(buildProductionCostContext(state, 'no-such-civ', city.id))
      .toEqual(createProductionCostContext({ city: null }));
  });

  it('is side-effect free', () => {
    const { state, city } = laggardWorldState('purity');
    const before = JSON.stringify(state);
    buildProductionCostContext(state, LAGGARD, city.id);
    getProductionCostForCivItem(state, LAGGARD, city.id, 'axeman');
    expect(JSON.stringify(state)).toBe(before);
  });
});

describe('#984 G — production cost does not vary by difficulty', () => {
  it('prices an axeman and a settler identically on every challenge tier', () => {
    const costs = (['explorer', 'standard', 'veteran'] as const).map(challenge => {
      const { state, city } = laggardWorldState('difficulty', challenge);
      return {
        challenge,
        era: buildProductionCostContext(state, LAGGARD, city.id).era,
        axeman: getProductionCostForCivItem(state, LAGGARD, city.id, 'axeman'),
        settler: getProductionCostForCivItem(state, LAGGARD, city.id, 'settler'),
      };
    });
    for (const entry of costs) {
      expect(entry, entry.challenge).toEqual({ ...costs[0], challenge: entry.challenge });
    }
  });
});

describe('#984 — the canonical path stays canonical', () => {
  const files = eachSourceFile(SRC);

  it('only city-system and the context module import the raw cost formula', () => {
    const offenders = files.filter(file =>
      /\bgetProductionCostForItem\b/.test(readFileSync(file, 'utf8'))
      && !file.endsWith('/city-system.ts')
      && !file.endsWith('/production-cost-context.ts'));
    expect(offenders.map(file => file.slice(SRC.length + 1))).toEqual([]);
  });

  it('only the minor-civ economy builds a context by hand', () => {
    const offenders = files.filter(file =>
      /\bcreateProductionCostContext\b/.test(readFileSync(file, 'utf8'))
      && !file.endsWith('/city-system.ts')
      && !file.endsWith('/production-cost-context.ts')
      && !file.endsWith('/minor-civ-economy-system.ts'));
    expect(offenders.map(file => file.slice(SRC.length + 1))).toEqual([]);
  });

  it('no production-cost call site fills era from World Age', () => {
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      if (!/ProductionCostContext|ProductionCost\b/.test(source)) continue;
      expect(source, file.slice(SRC.length + 1)).not.toMatch(/era:\s*(state|working|newState|next[A-Za-z0-9_]*)\.era/);
    }
  });
});

describe('#984 — a single-use reward charge is projected once, not per item', () => {
  it('does not discount two queued Beast Handlers with one Herding Insight charge', () => {
    const { state, city } = laggardWorldState('one-shot-charge');
    state.civilizations[LAGGARD].techState.completed = ['stone-weapons', 'horseback-riding'];
    state.stampedes = {
      ...(state.stampedes ?? {}),
      [LAGGARD]: {
        phase: 'resolved',
        outcome: 'contained',
        rewardGranted: true,
        herdingInsight: { expiresTurn: state.turn + 10 },
      } as never,
    };
    state.cities[city.id] = {
      ...city,
      productionQueue: ['beast_handler', 'beast_handler', 'caravan'],
      productionProgress: 0,
    };

    const context = buildProductionCostContext(state, LAGGARD, city.id);
    const full = getProductionCostForItem('beast_handler', { ...context, herdingInsight: false });
    const discounted = getContextualProductionCost('beast_handler', context);
    const caravan = getContextualProductionCost('caravan', context);
    expect(discounted).toBeLessThan(full);

    const output = Math.max(1, calculateProjectedCityYields(state, city.id, context.bonusEffect).production);
    // `processCity` spends the charge on the first Beast Handler only, so the
    // second is projected at full price.
    expect(estimateCaravanReadyTurns(state, LAGGARD, city.id))
      .toBe(Math.ceil((discounted + full + caravan) / output));
  });
});
