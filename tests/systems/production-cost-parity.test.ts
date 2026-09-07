import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import type { City, GameState } from '@/core/types';
import {
  TRAINABLE_UNITS,
  foundCity,
  getProductionCostForItem,
  processCity,
} from '@/systems/city-system';
import { ECONOMY_RULES, getRushBuyQuote } from '@/systems/economy-system';
import { canUpgradeUnit, evaluateUnitUpgrade } from '@/systems/unit-upgrade-system';
import { processAIResourceMarketplace } from '@/ai/ai-resource-marketplace';
import { resolveCivilizationEra, resolveWorldAge, TECH_TREE } from '@/systems/tech-definitions';
import { buildProductionCostContext } from '@/systems/production-cost-context';
import { hexKey } from '@/systems/hex-utils';
import { createUnit } from '@/systems/unit-system';

const LAGGARD = 'player';

function techsThroughEra(era: number): string[] {
  return TECH_TREE.filter(tech => tech.era <= era).map(tech => tech.id);
}

/**
 * Four major civilizations: three advanced through era 5, one (`player`) left in era 1.
 * `resolveWorldAge` needs a majority, so a two-civ fixture collapses World Age back onto
 * the laggard's own era and hides every bug in this file (#984).
 */
function laggardWorldState(seed: string): GameState {
  const state = createNewGame({
    civType: 'rome',
    seed,
    mapSize: 'medium',
    opponentCount: 3,
    gameTitle: 'production-cost-parity',
  });
  const advanced = techsThroughEra(5);
  for (const civ of Object.values(state.civilizations)) {
    if (civ.id === LAGGARD) continue;
    civ.techState.completed = [...advanced];
  }
  state.era = resolveWorldAge(state);
  return state;
}

function laggardCity(state: GameState): City {
  const civ = state.civilizations[LAGGARD];
  const settler = civ.units.map(id => state.units[id]).find(unit => unit?.type === 'settler')!;
  const city = foundCity(civ.id, settler.position, state.map, state.idCounters);
  state.cities[city.id] = city;
  civ.cities = [city.id];
  return city;
}

describe('#984 — World Age must never price production', () => {
  it('the fixture really separates World Age from the laggard civ era', () => {
    const state = laggardWorldState('era-split');
    expect(Object.keys(state.civilizations).length).toBeGreaterThanOrEqual(3);
    expect(state.era).toBe(5);
    expect(resolveCivilizationEra(state.civilizations[LAGGARD].techState.completed)).toBe(1);
  });

  it('a settler costs the laggard civ its own era price, not the World Age price', () => {
    const state = laggardWorldState('settler-era');
    const city = laggardCity(state);
    const completedTechs = state.civilizations[LAGGARD].techState.completed;

    const civEraCost = getProductionCostForItem('settler', {
      city,
      era: resolveCivilizationEra(completedTechs),
      completedTechs,
    });
    const worldAgeCost = getProductionCostForItem('settler', { city, era: state.era, completedTechs });

    // Guards the fixture: if these ever coincide the regressions below prove nothing.
    expect(worldAgeCost).toBeGreaterThan(civEraCost);
  });
});

describe('#984 — national-project discounts reach every production consumer', () => {
  function musterGroundState(seed: string, ownsCopper: boolean): { state: GameState; city: City } {
    const state = laggardWorldState(seed);
    const city = laggardCity(state);
    city.productionQueue = ['axeman'];
    city.productionProgress = 0;
    // `stone-weapons` unlocks the axeman and reveals copper, and is few enough
    // era-1 techs to leave the civ in era 1 while World Age sits at 5.
    state.civilizations[LAGGARD].techState.completed = ['stone-weapons'];
    // Tribal Muster Ground: era-1/2 melee units train 10% cheaper empire-wide.
    state.builtNationalProjects = {
      ...(state.builtNationalProjects ?? {}),
      [`${LAGGARD}:tribal_muster_ground`]: { civId: LAGGARD, eraBuilt: 1, turn: 1 } as never,
    };
    // A resource on the city centre is granted by tech alone, no improvement.
    state.map.tiles[hexKey(city.position)].resource = ownsCopper ? 'copper' : null;
    return { state, city };
  }

  it('processCity completes an axeman at the discounted cost the city panel already displays', () => {
    const { state, city } = musterGroundState('np-processcity', true);
    const base = TRAINABLE_UNITS.find(unit => unit.type === 'axeman')!.cost;
    const discounted = Math.ceil(base * 0.9);
    expect(discounted).toBeLessThan(base);

    const result = processCity(
      { ...city, productionProgress: 0 },
      state.map,
      0,
      discounted,
      buildProductionCostContext(state, LAGGARD, city.id),
      state.civilizations[LAGGARD].civType,
    );

    expect(result.completedUnit).toBe('axeman');
  });

  function withCopperSeller(state: GameState, city: City): string {
    const seller = state.civilizations['ai-1'];
    const sellerSettler = seller.units.map(id => state.units[id]).find(unit => unit?.type === 'settler')!;
    const sellerCity = foundCity(seller.id, sellerSettler.position, state.map, state.idCounters);
    state.cities[sellerCity.id] = sellerCity;
    seller.cities = [sellerCity.id];
    const sellerTile = state.map.tiles[hexKey(sellerCity.position)];
    sellerTile.resource = 'copper';
    sellerTile.improvement = 'none';
    sellerTile.improvementTurnsLeft = 0;
    const laggard = state.civilizations[LAGGARD];
    laggard.gold = 500;
    laggard.diplomacy.relationships[seller.id] = 10;
    state.marketplace!.prices.copper = 10;
    return seller.id;
  }

  it('buys access when the discounted cost finishes inside the access window', () => {
    const { state, city } = musterGroundState('np-marketplace', false);
    withCopperSeller(state, city);
    // 1 production/turn. Undiscounted 22 leaves 11 turns of work and is refused;
    // the real discounted 20 leaves 9 and fits the 10-turn access window.
    city.productionProgress = 11;

    const result = processAIResourceMarketplace(state, LAGGARD);
    expect(result.marketplace?.purchasedResources ?? []).toContainEqual({
      civId: LAGGARD,
      resource: 'copper',
      expiresOnTurn: state.turn + 10,
    });
  });

  it('still declines when even the correct cost cannot finish inside the window', () => {
    const { state, city } = musterGroundState('np-marketplace-negative', false);
    withCopperSeller(state, city);
    // No banked progress: 20 turns of work at 1 production/turn, well past the window.
    city.productionProgress = 0;

    const result = processAIResourceMarketplace(state, LAGGARD);
    expect(result.marketplace?.purchasedResources ?? []).toEqual([]);
  });
});

describe('#984 — unit upgrades use the owning civilization production context', () => {
  it('a ballista → cannon upgrade honours the cannon-casting tech discount', () => {
    const state = laggardWorldState('upgrade-tech-discount');
    const city = laggardCity(state);
    const civ = state.civilizations[LAGGARD];
    civ.techState.completed = [...techsThroughEra(5)];
    civ.gold = 5000;

    const ballista = createUnit('ballista', LAGGARD, city.position, state.idCounters);
    state.units[ballista.id] = ballista;
    civ.units = [...civ.units, ballista.id];

    const completedTechs = civ.techState.completed;
    const discountedCannon = getProductionCostForItem('cannon', { city, completedTechs, era: resolveCivilizationEra(completedTechs) });
    const plainCannon = getProductionCostForItem('cannon', { city });
    expect(discountedCannon).toBeLessThan(plainCannon);

    const evaluation = evaluateUnitUpgrade(state, ballista.id, 'cannon');
    expect(evaluation.cost).toBe(Math.ceil(discountedCannon * 0.5));
  });
  it('the city panel quotes exactly what the upgrade executor charges', () => {
    const state = laggardWorldState('upgrade-evaluator-parity');
    const city = laggardCity(state);
    const civ = state.civilizations[LAGGARD];
    civ.techState.completed = [...techsThroughEra(5)];
    civ.gold = 5000;
    const ballista = createUnit('ballista', LAGGARD, city.position, state.idCounters);
    state.units[ballista.id] = ballista;
    civ.units = [...civ.units, ballista.id];

    const panelQuote = canUpgradeUnit(
      ballista,
      city.id,
      state.cities,
      buildProductionCostContext(state, LAGGARD, city.id),
      civ.gold,
    );
    const charged = evaluateUnitUpgrade(state, ballista.id, 'cannon');

    expect(panelQuote.targetType).toBe('cannon');
    expect(panelQuote.cost).toBe(charged.cost);
    // Both are below half the bare catalog price, so this is a parity assertion
    // with teeth: the Cannon Casting discount reaches the panel quote and the
    // charged price alike, rather than the two agreeing on an undiscounted cost.
    expect(panelQuote.cost).toBeLessThan(Math.ceil(getProductionCostForItem('cannon') * 0.5));
  });
});

describe('#984 — rush buy prices what the city actually has to produce', () => {
  it('quotes the Herding Insight discount processCity already completes at', () => {
    const state = laggardWorldState('rush-buy-parity');
    const city = laggardCity(state);
    const civ = state.civilizations[LAGGARD];
    civ.techState.completed = ['stone-weapons', 'horseback-riding'];
    civ.gold = 5000;
    city.productionQueue = ['beast_handler'];
    city.productionProgress = 0;
    state.stampedes = {
      ...(state.stampedes ?? {}),
      [LAGGARD]: {
        phase: 'resolved',
        outcome: 'contained',
        rewardGranted: true,
        herdingInsight: { expiresTurn: state.turn + 10 },
      } as never,
    };

    const base = TRAINABLE_UNITS.find(unit => unit.type === 'beast_handler')!.cost;
    const discounted = Math.ceil(base * 0.8);
    expect(discounted).toBeLessThan(base);

    // The authoritative completion threshold already honours the charge.
    const processed = processCity(
      { ...city, productionProgress: 0 },
      state.map,
      0,
      discounted,
      buildProductionCostContext(state, LAGGARD, city.id),
      civ.civType,
    );
    expect(processed.completedUnit).toBe('beast_handler');

    const quote = getRushBuyQuote(state, LAGGARD, city.id);
    expect(quote.available).toBe(true);
    expect(quote.cost).toBe(Math.ceil(discounted * ECONOMY_RULES.rushBuyMultiplier));
  });
});
