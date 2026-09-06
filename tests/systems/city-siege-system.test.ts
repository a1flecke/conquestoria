import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import { foundCity } from '@/systems/city-system';
import { createUnit } from '@/systems/unit-system';
import type { City, Civilization, GameState } from '@/core/types';
import { applyCityHpRegeneration, applyCitySiegeOutcome, calculateCityAssaultStrengths, CITY_BOMBARDMENT_MAX_HP_LOSS_PER_TURN, CITY_HP_DEFENSE_FLOOR, getRemainingBombardmentCap, recordBombardment, cityHpDefenseScale, getCityCounterFireDamage, getCityIntrinsicStrength, getEffectiveCityAssaultDefense, isCityHpRegenerating, resolveCityAssault, resolveCitySiegeDamage } from '@/systems/city-siege-system';

const mkC = () => ({ nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 });

function makeGameStateWithCity(): { state: GameState; cityId: string } {
  const state = createNewGame(undefined, 'city-siege-test', 'small');
  const city = { ...foundCity('player', { q: 2, r: 2 }, state.map, mkC()), id: 'town', hp: 100 };
  state.cities = { town: city };
  state.civilizations.player.cities = ['town'];
  return { state, cityId: 'town' };
}

function makeCityAndCiv(overrides: Partial<City> = {}, civOverrides: Partial<Civilization> = {}) {
  const { state, cityId } = makeGameStateWithCity();
  const city: City = { ...state.cities[cityId], hp: 100, buildings: [], ...overrides };
  const ownerCiv: Civilization = { ...state.civilizations.player, gold: 200, ...civOverrides };
  return { city, ownerCiv };
}

function withTechs(ownerCiv: Civilization, completed: string[]): Civilization {
  return { ...ownerCiv, techState: { ...ownerCiv.techState, completed } };
}

describe('resolveCitySiegeDamage (#522)', () => {
  it('fully blocks damage when the city has a garrison', () => {
    const { city, ownerCiv } = makeCityAndCiv({ hp: 40 });

    const result = resolveCitySiegeDamage({
      city, ownerCiv, rawDamage: 10, attackerDomain: 'land', hasGarrison: true, era: 1, challenge: 'standard',
    });

    expect(result.outcome).toBe('blocked');
    expect(result.hpLost).toBe(0);
    expect(result.newHp).toBe(40);
  });

  // #974 phase 2: a unit deliberately spending its action to bombard fires THROUGH a
  // garrison; only the ambient barbarian/pirate siege tick is still blocked by one. Keeping
  // that split is what preserves "station a defender" as counterplay against those threats
  // while still letting a player shell a defended city.
  describe('#974 unit-initiated bombardment options', () => {
    it('still blocks a garrisoned city by default, for ambient siege ticks', () => {
      const { city, ownerCiv } = makeCityAndCiv({ hp: 40 });

      const result = resolveCitySiegeDamage({
        city, ownerCiv, rawDamage: 10, attackerDomain: 'land', hasGarrison: true, era: 1, challenge: 'standard',
      });

      expect(result.outcome).toBe('blocked');
      expect(result.hpLost).toBe(0);
    });

    it('fires through a garrison when ignoreGarrison is set, at reduced effect', () => {
      const { city, ownerCiv } = makeCityAndCiv({ hp: 50, buildings: [] });

      const result = resolveCitySiegeDamage({
        city, ownerCiv, rawDamage: 10, attackerDomain: 'land', hasGarrison: true,
        ignoreGarrison: true, garrisonMitigation: 0.5,
        era: 1, challenge: 'standard',
      });

      expect(result.outcome).toBe('damaged');
      expect(result.hpLost).toBe(5); // floor(10 * 0.5)
    });

    it('leaves an ungarrisoned city unaffected by the mitigation factor', () => {
      const { city, ownerCiv } = makeCityAndCiv({ hp: 50, buildings: [] });

      const result = resolveCitySiegeDamage({
        city, ownerCiv, rawDamage: 10, attackerDomain: 'land', hasGarrison: false,
        ignoreGarrison: true, garrisonMitigation: 0.5,
        era: 1, challenge: 'standard',
      });

      expect(result.hpLost).toBe(10);
    });

    it('clamps damage to maxHpLoss, which is how the per-city per-turn cap is enforced', () => {
      const { city, ownerCiv } = makeCityAndCiv({ hp: 90, buildings: [] });

      const result = resolveCitySiegeDamage({
        city, ownerCiv, rawDamage: 40, attackerDomain: 'land', hasGarrison: false,
        maxHpLoss: 7, era: 1, challenge: 'standard',
      });

      expect(result.hpLost).toBe(7);
      expect(result.newHp).toBe(83);
    });

    it('a spent cap (maxHpLoss 0) deals nothing rather than throwing or going negative', () => {
      const { city, ownerCiv } = makeCityAndCiv({ hp: 90, buildings: [] });

      const result = resolveCitySiegeDamage({
        city, ownerCiv, rawDamage: 40, attackerDomain: 'land', hasGarrison: false,
        maxHpLoss: 0, era: 1, challenge: 'standard',
      });

      expect(result.hpLost).toBe(0);
      expect(result.newHp).toBe(90);
    });

    it('applies garrison mitigation before the cap, not after', () => {
      const { city, ownerCiv } = makeCityAndCiv({ hp: 90, buildings: [] });

      // raw 40 -> garrison halves to 20 -> cap 30 does not bite.
      const result = resolveCitySiegeDamage({
        city, ownerCiv, rawDamage: 40, attackerDomain: 'land', hasGarrison: true,
        ignoreGarrison: true, garrisonMitigation: 0.5, maxHpLoss: 30,
        era: 1, challenge: 'standard',
      });

      expect(result.hpLost).toBe(20);
    });
  });

  it('applies raw damage to an undefended city with no walls', () => {
    const { city, ownerCiv } = makeCityAndCiv({ hp: 50, buildings: [] });

    const result = resolveCitySiegeDamage({
      city, ownerCiv, rawDamage: 10, attackerDomain: 'land', hasGarrison: false, era: 1, challenge: 'standard',
    });

    expect(result.outcome).toBe('damaged');
    expect(result.hpLost).toBe(10);
    expect(result.newHp).toBe(40);
  });

  it('mitigates damage via the walls defense multiplier', () => {
    const { city, ownerCiv } = makeCityAndCiv({ hp: 50, buildings: ['walls'] });

    const result = resolveCitySiegeDamage({
      city, ownerCiv, rawDamage: 10, attackerDomain: 'land', hasGarrison: false, era: 1, challenge: 'standard',
    });

    // walls -> x1.25 multiplier -> 10 / 1.25 = 8 mitigated damage
    expect(result.hpLost).toBe(8);
    expect(result.newHp).toBe(42);
  });

  it('applies flat defense bonuses (Star Fort) on top of the walls multiplier to reduce siege damage', () => {
    const { city: wallsOnly, ownerCiv: civA } = makeCityAndCiv({ hp: 50, buildings: ['walls'] });
    const { city: fortified, ownerCiv: civB } = makeCityAndCiv({ hp: 50, buildings: ['walls', 'star_fort'] });

    const baseResult = resolveCitySiegeDamage({
      city: wallsOnly, ownerCiv: civA, rawDamage: 30, attackerDomain: 'land', hasGarrison: false, era: 1, challenge: 'standard',
    });
    const fortifiedResult = resolveCitySiegeDamage({
      city: fortified, ownerCiv: civB, rawDamage: 30, attackerDomain: 'land', hasGarrison: false, era: 1, challenge: 'standard',
    });

    // walls -> 30 / 1.25 = 24; star_fort flat +5 -> 24 - 5 = 19
    expect(fortifiedResult.hpLost).toBe(19);
    expect(fortifiedResult.hpLost).toBeLessThan(baseResult.hpLost);
  });

  it('Bunker replaces Star Fort defense and mitigates naval and air bombardment, not land assaults', () => {
    const makeBunkerCity = () => makeCityAndCiv({
      hp: 50, buildings: ['walls', 'star_fort', 'bunker'],
    });
    const { city: navalCity, ownerCiv: navalCiv } = makeBunkerCity();
    const { city: airCity, ownerCiv: airCiv } = makeBunkerCity();
    const { city: landCity, ownerCiv: landCiv } = makeBunkerCity();

    const naval = resolveCitySiegeDamage({
      city: navalCity, ownerCiv: navalCiv, rawDamage: 30, attackerDomain: 'naval', hasGarrison: false, era: 1, challenge: 'standard',
    });
    const air = resolveCitySiegeDamage({
      city: airCity, ownerCiv: airCiv, rawDamage: 30, attackerDomain: 'air', hasGarrison: false, era: 1, challenge: 'standard',
    });
    const land = resolveCitySiegeDamage({
      city: landCity, ownerCiv: landCiv, rawDamage: 30, attackerDomain: 'land', hasGarrison: false, era: 1, challenge: 'standard',
    });

    // +8: round(30 / 1.25) - 8 = 16. Bombardment also receives 15% mitigation:
    // round((30 * 0.85) / 1.25) - 8 = 12. Star Fort must not stack to +13.
    expect(naval.hpLost).toBe(12);
    expect(air.hpLost).toBe(12);
    expect(land.hpLost).toBe(16);
  });

  it('applies Torpedo Warfare\'s flat bonus only against a naval attacker, not a land attacker', () => {
    const { city: navalCity, ownerCiv: navalCivBase } = makeCityAndCiv({ hp: 50, buildings: ['walls'] });
    const { city: navalCityNoTech, ownerCiv: navalCivNoTech } = makeCityAndCiv({ hp: 50, buildings: ['walls'] });
    const { city: landCity, ownerCiv: landCivBase } = makeCityAndCiv({ hp: 50, buildings: ['walls'] });
    const { city: landCityNoTech, ownerCiv: landCivNoTech } = makeCityAndCiv({ hp: 50, buildings: ['walls'] });
    const navalCiv = withTechs(navalCivBase, ['torpedo-warfare']);
    const landCiv = withTechs(landCivBase, ['torpedo-warfare']);

    const naval = resolveCitySiegeDamage({
      city: navalCity, ownerCiv: navalCiv, rawDamage: 30, attackerDomain: 'naval', hasGarrison: false, era: 1, challenge: 'standard',
    });
    const navalNoTech = resolveCitySiegeDamage({
      city: navalCityNoTech, ownerCiv: navalCivNoTech, rawDamage: 30, attackerDomain: 'naval', hasGarrison: false, era: 1, challenge: 'standard',
    });
    const land = resolveCitySiegeDamage({
      city: landCity, ownerCiv: landCiv, rawDamage: 30, attackerDomain: 'land', hasGarrison: false, era: 1, challenge: 'standard',
    });
    const landNoTech = resolveCitySiegeDamage({
      city: landCityNoTech, ownerCiv: landCivNoTech, rawDamage: 30, attackerDomain: 'land', hasGarrison: false, era: 1, challenge: 'standard',
    });

    expect(naval.hpLost).toBeLessThan(navalNoTech.hpLost);
    expect(land.hpLost).toBe(landNoTech.hpLost);
  });

  it('floors mitigated damage at 0 rather than going negative when flat bonuses exceed the raw damage', () => {
    const { city, ownerCiv: ownerCivBase } = makeCityAndCiv({ hp: 50, buildings: ['walls', 'star_fort'] });
    const ownerCiv = withTechs(ownerCivBase, ['fortification-engineering']);

    const result = resolveCitySiegeDamage({
      city, ownerCiv, rawDamage: 5, attackerDomain: 'land', hasGarrison: false, era: 1, challenge: 'standard',
    });

    expect(result.hpLost).toBe(0);
    expect(result.outcome).toBe('damaged');
  });

  it('sacks (survives at 1 HP, loses gold) instead of destroying below the difficulty era threshold', () => {
    const { city, ownerCiv } = makeCityAndCiv({ hp: 5, buildings: [] }, { gold: 200 });

    const result = resolveCitySiegeDamage({
      city, ownerCiv, rawDamage: 10, attackerDomain: 'land', hasGarrison: false, era: 2, challenge: 'standard',
    });

    expect(result.outcome).toBe('sacked');
    expect(result.newHp).toBe(1);
    expect(result.goldLost).toBe(30);
  });

  it('destroys the city once era exceeds the difficulty threshold', () => {
    const { city, ownerCiv } = makeCityAndCiv({ hp: 5, buildings: [] });

    const result = resolveCitySiegeDamage({
      city, ownerCiv, rawDamage: 10, attackerDomain: 'land', hasGarrison: false, era: 3, challenge: 'standard',
    });

    expect(result.outcome).toBe('destroyed');
    expect(result.newHp).toBe(0);
    expect(result.goldLost).toBe(0);
  });

  it('sacks (never destroys) a civ\'s last remaining city even past the destruction era', () => {
    const { city, ownerCiv } = makeCityAndCiv({ hp: 5, buildings: [] }, { gold: 200 });

    const result = resolveCitySiegeDamage({
      city, ownerCiv, rawDamage: 100, attackerDomain: 'land', hasGarrison: false, isOwnersLastCity: true, era: 12, challenge: 'veteran',
    });

    expect(result.outcome).toBe('sacked');
    expect(result.newHp).toBe(1);
  });

  it('still destroys a non-last city past the destruction era (regression: the last-city guard is scoped)', () => {
    const { city, ownerCiv } = makeCityAndCiv({ hp: 5, buildings: [] });

    const result = resolveCitySiegeDamage({
      city, ownerCiv, rawDamage: 100, attackerDomain: 'land', hasGarrison: false, isOwnersLastCity: false, era: 12, challenge: 'veteran',
    });

    expect(result.outcome).toBe('destroyed');
  });

  it('defaults isOwnersLastCity to false when omitted, preserving existing destroy behavior', () => {
    const { city, ownerCiv } = makeCityAndCiv({ hp: 5, buildings: [] });

    const result = resolveCitySiegeDamage({
      city, ownerCiv, rawDamage: 10, attackerDomain: 'land', hasGarrison: false, era: 3, challenge: 'standard',
    });

    expect(result.outcome).toBe('destroyed');
  });

  it('uses a harsher destruction threshold on veteran than explorer (negative test: same era, different outcome)', () => {
    const { city: cityA, ownerCiv: civA } = makeCityAndCiv({ hp: 5, buildings: [] });
    const { city: cityB, ownerCiv: civB } = makeCityAndCiv({ hp: 5, buildings: [] });

    const explorerResult = resolveCitySiegeDamage({
      city: cityA, ownerCiv: civA, rawDamage: 10, attackerDomain: 'land', hasGarrison: false, era: 2, challenge: 'explorer',
    });
    const veteranResult = resolveCitySiegeDamage({
      city: cityB, ownerCiv: civB, rawDamage: 10, attackerDomain: 'land', hasGarrison: false, era: 2, challenge: 'veteran',
    });

    expect(explorerResult.outcome).toBe('sacked');
    expect(veteranResult.outcome).toBe('destroyed');
  });
});

describe('applyCitySiegeOutcome (#522)', () => {
  it('applies HP damage without touching the roster on a "damaged" outcome', () => {
    const { state, cityId } = makeGameStateWithCity();
    state.cities[cityId] = { ...state.cities[cityId]!, hp: 50 };

    const next = applyCitySiegeOutcome(state, cityId, {
      hpLost: 10, newHp: 40, outcome: 'damaged', goldLost: 0,
    });

    expect(next.cities[cityId]!.hp).toBe(40);
    expect(next.civilizations.player.cities).toContain(cityId);
  });

  it('floors HP at 1 and deducts gold on a "sacked" outcome, keeps the city', () => {
    const { state, cityId } = makeGameStateWithCity();
    state.cities[cityId] = { ...state.cities[cityId]!, hp: 5 };
    state.civilizations.player.gold = 100;

    const next = applyCitySiegeOutcome(state, cityId, {
      hpLost: 4, newHp: 1, outcome: 'sacked', goldLost: 15,
    });

    expect(next.cities[cityId]!.hp).toBe(1);
    expect(next.civilizations.player.gold).toBe(85);
    expect(next.civilizations.player.cities).toContain(cityId);
  });

  it('removes the city from state and the owner roster on a "destroyed" outcome', () => {
    const { state, cityId } = makeGameStateWithCity();

    const next = applyCitySiegeOutcome(state, cityId, {
      hpLost: 5, newHp: 0, outcome: 'destroyed', goldLost: 0,
    });

    expect(next.cities[cityId]).toBeUndefined();
    expect(next.civilizations.player.cities).not.toContain(cityId);
  });

  it('is a no-op on a "blocked" outcome', () => {
    const { state, cityId } = makeGameStateWithCity();
    const before = state.cities[cityId]!.hp;

    const next: GameState = applyCitySiegeOutcome(state, cityId, {
      hpLost: 0, newHp: before ?? 100, outcome: 'blocked', goldLost: 0,
    });

    expect(next).toBe(state);
  });
});

describe('applyCityHpRegeneration (#522)', () => {
  it('regenerates 5 HP/turn when no hostile unit is adjacent', () => {
    const { state, cityId } = makeGameStateWithCity();
    state.cities[cityId] = { ...state.cities[cityId]!, hp: 50 };

    const next = applyCityHpRegeneration(state);

    expect(next.cities[cityId]!.hp).toBe(55);
  });

  it('caps regeneration at 100 HP', () => {
    const { state, cityId } = makeGameStateWithCity();
    state.cities[cityId] = { ...state.cities[cityId]!, hp: 98 };

    const next = applyCityHpRegeneration(state);

    expect(next.cities[cityId]!.hp).toBe(100);
  });

  it('does not regenerate while a hostile (barbarian) unit is adjacent', () => {
    const { state, cityId } = makeGameStateWithCity();
    state.cities[cityId] = { ...state.cities[cityId]!, hp: 50 };
    const raider = createUnit('warrior', 'barbarian', state.cities[cityId]!.position, state.idCounters);
    state.units[raider.id] = raider;

    const next = applyCityHpRegeneration(state);

    expect(next.cities[cityId]!.hp).toBe(50);
  });

  it('does not regenerate a destroyed/0-HP city', () => {
    const { state, cityId } = makeGameStateWithCity();
    state.cities[cityId] = { ...state.cities[cityId]!, hp: 0 };

    const next = applyCityHpRegeneration(state);

    expect(next.cities[cityId]!.hp).toBe(0);
  });

  it('is a no-op (same state reference) when every city is at full HP', () => {
    const { state, cityId } = makeGameStateWithCity();
    state.cities[cityId] = { ...state.cities[cityId]!, hp: 100 };

    const next = applyCityHpRegeneration(state);

    expect(next).toBe(state);
  });
});

describe('isCityHpRegenerating (#522)', () => {
  it('is true for a below-max-HP city with no hostile unit nearby', () => {
    const { state, cityId } = makeGameStateWithCity();
    state.cities[cityId] = { ...state.cities[cityId]!, hp: 50 };

    expect(isCityHpRegenerating(state, state.cities[cityId]!)).toBe(true);
  });

  it('is false when a hostile unit is adjacent', () => {
    const { state, cityId } = makeGameStateWithCity();
    state.cities[cityId] = { ...state.cities[cityId]!, hp: 50 };
    const raider = createUnit('warrior', 'barbarian', state.cities[cityId]!.position, state.idCounters);
    state.units[raider.id] = raider;

    expect(isCityHpRegenerating(state, state.cities[cityId]!)).toBe(false);
  });

  it('is false at full HP (negative test)', () => {
    const { state, cityId } = makeGameStateWithCity();
    state.cities[cityId] = { ...state.cities[cityId]!, hp: 100 };

    expect(isCityHpRegenerating(state, state.cities[cityId]!)).toBe(false);
  });
});

describe('getCityIntrinsicStrength (#522)', () => {
  it('scales with population even without walls', () => {
    const { city, ownerCiv } = makeCityAndCiv({ population: 1, buildings: [] });
    const low = getCityIntrinsicStrength(city, ownerCiv.techState.completed ?? [], 'land');
    const { city: cityB, ownerCiv: ownerCivB } = makeCityAndCiv({ population: 10, buildings: [] });
    const high = getCityIntrinsicStrength(cityB, ownerCivB.techState.completed ?? [], 'land');

    expect(low).toBe(2 + 1 * 2); // 4
    expect(high).toBe(2 + 10 * 2); // 22
    expect(high).toBeGreaterThan(low);
  });

  it('applies the walls multiplier on top of the population base, matching getCityDefenseBreakdown', () => {
    const { city, ownerCiv } = makeCityAndCiv({ population: 4, buildings: ['walls'] });
    // base = 2 + 4*2 = 10; walls -> x1.25 -> 12.5 -> rounds per implementation
    expect(getCityIntrinsicStrength(city, ownerCiv.techState.completed ?? [], 'land')).toBeCloseTo(10 * 1.25, 5);
  });

  it('applies Star Fort and Fortification Engineering flat bonuses, same as a garrisoned defender', () => {
    const { city, ownerCiv } = makeCityAndCiv({ population: 4, buildings: ['walls', 'star_fort'] });
    const withEngineering = withTechs(ownerCiv, ['fortification-engineering']);
    const strength = getCityIntrinsicStrength(
      { ...city, buildings: ['walls', 'star_fort'] },
      withEngineering.techState.completed ?? [],
      'land',
    );
    // base = 10; walls -> 12.5; +star_fort(5) +fortification-engineering(5) = 22.5
    expect(strength).toBeCloseTo(10 * 1.25 + 5 + 5, 5);
  });

  it('applies Torpedo Warfare only against a naval attacker, matching getCityDefenseBreakdown', () => {
    const { city, ownerCiv } = makeCityAndCiv({ population: 4, buildings: ['walls'] });
    const withTorpedo = withTechs(ownerCiv, ['torpedo-warfare']);
    const naval = getCityIntrinsicStrength(city, withTorpedo.techState.completed ?? [], 'naval');
    const land = getCityIntrinsicStrength(city, withTorpedo.techState.completed ?? [], 'land');
    expect(naval).toBeCloseTo(10 * 1.25 + 5, 5);
    expect(land).toBeCloseTo(10 * 1.25, 5);
  });

  it('handles zero population without throwing (a just-founded or fully-unrested city)', () => {
    const { city } = makeCityAndCiv({ population: 0, buildings: [] });
    expect(getCityIntrinsicStrength(city, [], 'land')).toBe(2);
  });

  // #966: minor civs have no `techState` (MinorCivState carries none), so they can never be
  // passed as a Civilization -- which is why city bombardment would silently no-op against a
  // city-state. Completed techs are the ONLY thing this helper ever read off the record, so
  // taking them directly is both smaller and minor-civ-safe.
  it('#966 takes completed techs directly, with an empty list standing in for a minor civ', () => {
    const { city } = makeCityAndCiv({ population: 4, buildings: ['walls', 'star_fort'] });

    // A city-state: buildings count, techs contribute nothing.
    expect(getCityIntrinsicStrength(city, [], 'land')).toBeCloseTo(10 * 1.25 + 5, 5);
    // The same city under a major civ that researched Fortification Engineering.
    expect(getCityIntrinsicStrength(city, ['fortification-engineering'], 'land'))
      .toBeCloseTo(10 * 1.25 + 5 + 5, 5);
  });
});

// #966: remaining city HP now scales the defense a land assault fights through, which is
// the entire reason bombarding a city is worth doing. Deliberately surgical -- only
// calculateCityAssaultStrengths consumes it, so counter-fire and the city panel's displayed
// defense keep their exact pre-#966 behaviour.
// #974 phase 2: bombarding from range only makes progress if the city stops repairing.
// Regen was suppressed solely by a hostile unit within 1 hex, so a unit shelling from
// range 2 would chip 6 while the city healed 5 -- roughly 100 turns to take it down.
describe('#974 bombardment suppresses city HP regeneration', () => {
  function stateWithDamagedCity(bombardment?: { turn: number; hpLostThisTurn: number }) {
    const state = createNewGame(undefined, 'bombard-regen', 'small');
    const city = {
      ...foundCity('ai-1', { q: 5, r: 5 }, state.map, mkC()),
      id: 'town', owner: 'ai-1', hp: 60,
      ...(bombardment ? { bombardment } : {}),
    };
    state.cities = { town: city };
    state.civilizations['ai-1'].cities = ['town'];
    state.units = {};
    state.turn = 10;
    return state;
  }

  it('regenerates normally when the city has never been bombarded', () => {
    const state = stateWithDamagedCity();
    expect(isCityHpRegenerating(state, state.cities.town)).toBe(true);
    expect(applyCityHpRegeneration(state).cities.town.hp).toBe(65);
  });

  it('does not regenerate on the turn it was bombarded', () => {
    const state = stateWithDamagedCity({ turn: 10, hpLostThisTurn: 12 });
    expect(isCityHpRegenerating(state, state.cities.town)).toBe(false);
    expect(applyCityHpRegeneration(state).cities.town.hp).toBe(60);
  });

  it('still does not regenerate the turn after', () => {
    const state = stateWithDamagedCity({ turn: 9, hpLostThisTurn: 12 });
    expect(isCityHpRegenerating(state, state.cities.town)).toBe(false);
  });

  it('resumes regenerating two turns after the last hit', () => {
    const state = stateWithDamagedCity({ turn: 8, hpLostThisTurn: 12 });
    expect(isCityHpRegenerating(state, state.cities.town)).toBe(true);
    expect(applyCityHpRegeneration(state).cities.town.hp).toBe(65);
  });
});

describe('#974 per-city per-turn bombardment cap accounting', () => {
  it('reports the full cap for a city not yet bombarded this turn', () => {
    const city = { hp: 100 } as never;
    expect(getRemainingBombardmentCap(city, 10)).toBe(CITY_BOMBARDMENT_MAX_HP_LOSS_PER_TURN);
  });

  it('subtracts damage already dealt this turn', () => {
    const city = { hp: 100, bombardment: { turn: 10, hpLostThisTurn: 12 } } as never;
    expect(getRemainingBombardmentCap(city, 10)).toBe(CITY_BOMBARDMENT_MAX_HP_LOSS_PER_TURN - 12);
  });

  it('resets on a new turn rather than carrying the tally forward', () => {
    const city = { hp: 100, bombardment: { turn: 9, hpLostThisTurn: 20 } } as never;
    expect(getRemainingBombardmentCap(city, 10)).toBe(CITY_BOMBARDMENT_MAX_HP_LOSS_PER_TURN);
  });

  it('never reports a negative remainder', () => {
    const city = { hp: 100, bombardment: { turn: 10, hpLostThisTurn: 999 } } as never;
    expect(getRemainingBombardmentCap(city, 10)).toBe(0);
  });

  it('accumulates within a turn and starts fresh on the next', () => {
    const first = recordBombardment({ hp: 100 } as never, 10, 8);
    expect(first).toEqual({ turn: 10, hpLostThisTurn: 8 });

    const second = recordBombardment({ hp: 92, bombardment: first } as never, 10, 5);
    expect(second).toEqual({ turn: 10, hpLostThisTurn: 13 });

    const nextTurn = recordBombardment({ hp: 87, bombardment: second } as never, 11, 4);
    expect(nextTurn).toEqual({ turn: 11, hpLostThisTurn: 4 });
  });
});

describe('#966 cityHpDefenseScale / getEffectiveCityAssaultDefense', () => {
  it('is a no-op at full HP (the prime directive: no currently-tuned number moves)', () => {
    const { city, ownerCiv } = makeCityAndCiv({ population: 4, buildings: ['walls'], hp: 100 });
    const techs = ownerCiv.techState.completed ?? [];

    expect(cityHpDefenseScale(city)).toBe(1);
    expect(getEffectiveCityAssaultDefense(city, techs))
      .toBe(getCityIntrinsicStrength(city, techs, 'land'));
  });

  it('treats a missing hp as full HP, so legacy saves are unaffected', () => {
    const { city } = makeCityAndCiv({ population: 4, buildings: ['walls'] });
    const { hp: _dropped, ...withoutHp } = city;

    expect(cityHpDefenseScale(withoutHp as typeof city)).toBe(1);
  });

  it('scales defense down toward the floor as HP falls, never below it', () => {
    const { city } = makeCityAndCiv({ population: 4, buildings: ['walls'] });

    expect(cityHpDefenseScale({ ...city, hp: 50 })).toBeCloseTo(0.7, 5);
    expect(cityHpDefenseScale({ ...city, hp: 1 })).toBeCloseTo(0.406, 5);
    // HP can never reach 0 for a surviving city (preventDestruction floors at 1), but the
    // formula must still not dip under the floor if it ever did.
    expect(cityHpDefenseScale({ ...city, hp: 0 })).toBe(CITY_HP_DEFENSE_FLOOR);
  });

  it('makes a bombarded city meaningfully easier to storm without trivializing it', () => {
    // pop 15 + walls + star fort + fortification engineering + professional army:
    // base 32 -> x1.25 walls -> x1.10 professional army = 44, +5 star fort +5 fort-eng = 54
    const { city, ownerCiv } = makeCityAndCiv({
      population: 15, buildings: ['walls', 'star_fort'], hp: 100,
    });
    const techs = ['fortification-engineering', 'professional-army'];
    const full = getEffectiveCityAssaultDefense(city, techs);
    const wrecked = getEffectiveCityAssaultDefense({ ...city, hp: 1 }, techs);

    expect(Math.round(full)).toBe(54);
    expect(wrecked).toBeLessThan(full);
    // A strong attacker gains a lot; a weak one still loses more often than not.
    const tankOdds = 62 / (62 + wrecked);
    const archerOdds = 15 / (15 + wrecked);
    expect(tankOdds).toBeGreaterThan(0.65);
    expect(archerOdds).toBeLessThan(0.5);
    expect(ownerCiv).toBeDefined();
  });

  it('leaves counter-fire keyed to undamaged intrinsic strength (surgical scope)', () => {
    const { city, ownerCiv } = makeCityAndCiv({ population: 4, buildings: ['walls'], hp: 100 });
    const damaged = { ...city, hp: 1 };

    expect(getCityCounterFireDamage(damaged, ownerCiv, 'land', 20, false, 12345))
      .toBe(getCityCounterFireDamage(city, ownerCiv, 'land', 20, false, 12345));
  });
});

describe('calculateCityAssaultStrengths / resolveCityAssault (#522)', () => {
  it('applies Trebuchet’s 25% city-assault bonus through the shared city assault calculation', () => {
    const { city, ownerCiv } = makeCityAndCiv({ population: 1, buildings: [] });
    const trebuchet = createUnit('trebuchet', 'ai-1', { q: 3, r: 2 }, mkC());

    expect(calculateCityAssaultStrengths(trebuchet, city, ownerCiv.techState.completed ?? [], { width: 10, height: 10, wrapsHorizontally: false, rivers: [], tiles: {} }).attackerStrength)
      .toBeCloseTo(33.75, 5);
  });
  it('computes attacker strength the same way calculateCombatStrengths does (health, veterancy, river)', () => {
    const { state, cityId } = makeGameStateWithCity();
    const city = { ...state.cities[cityId]!, population: 1, buildings: [] };
    const ownerCiv = state.civilizations.player;
    const attacker = createUnit('swordsman', 'ai-1', { q: 3, r: 2 }, state.idCounters);

    const breakdown = calculateCityAssaultStrengths(attacker, city, ownerCiv.techState.completed ?? [], state.map);

    // swordsman strength 25, full health, no veterancy, no river between (2,2)-(3,2) here
    expect(breakdown.attackerStrength).toBeCloseTo(25, 5);
    expect(breakdown.intrinsicStrength).toBe(4); // 2 + 1*2, no walls
    expect(breakdown.winProbability).toBeGreaterThan(0.5);
  });

  it('gives a weak attacker a low but nonzero win probability against a strong city', () => {
    const { state, cityId } = makeGameStateWithCity();
    const city = { ...state.cities[cityId]!, population: 30, buildings: ['walls', 'star_fort'] };
    const ownerCiv = withTechs(state.civilizations.player, ['fortification-engineering']);
    const attacker = createUnit('warrior', 'ai-1', { q: 3, r: 2 }, state.idCounters);

    const breakdown = calculateCityAssaultStrengths(attacker, city, ownerCiv.techState.completed ?? [], state.map);

    expect(breakdown.winProbability).toBeLessThan(0.5);
    expect(breakdown.winProbability).toBeGreaterThan(0);
  });

  it('resolveCityAssault is deterministic for a fixed seed', () => {
    const first = resolveCityAssault(50, 10, 12345);
    const second = resolveCityAssault(50, 10, 12345);
    expect(first).toEqual(second);
  });

  it('an overwhelming attacker wins reliably across seeds', () => {
    // Rate-based, not `.every(...)`: the ±20% randomFactor is clamped to
    // [0.05, 0.95] before the RNG draw, so even a 10:1 strength ratio caps out at a
    // 95% per-trial win chance -- `.every()` across 20 seeds would fail ~1 run in 3
    // by construction, regardless of implementation correctness. Mirrors the rate-based
    // philosophy Task 11's balance-sampling tests already use for the same reason.
    const results = Array.from({ length: 20 }, (_, i) => resolveCityAssault(100, 10, i).attackerWins);
    const winRate = results.filter(Boolean).length / results.length;
    expect(winRate).toBeGreaterThan(0.75);
  });

  it('an overwhelmed attacker loses reliably across seeds', () => {
    const results = Array.from({ length: 20 }, (_, i) => resolveCityAssault(10, 100, i).attackerWins);
    const winRate = results.filter(Boolean).length / results.length;
    expect(winRate).toBeLessThan(0.25);
  });
});

describe('getCityCounterFireDamage (#522)', () => {
  it('is zero without walls', () => {
    const { city, ownerCiv } = makeCityAndCiv({ population: 10, buildings: [] });
    expect(getCityCounterFireDamage(city, ownerCiv, 'land', 20, false, 1)).toBe(0);
  });

  it('is zero when the city has a garrison', () => {
    const { city, ownerCiv } = makeCityAndCiv({ population: 10, buildings: ['walls'] });
    expect(getCityCounterFireDamage(city, ownerCiv, 'land', 20, true, 1)).toBe(0);
  });

  it('is nonzero and walls/tech-scaled otherwise', () => {
    // population: 1 (not 10, as the plan's draft used) -- at population 10 the base vs.
    // fortified damage figures both round to the identical integer at seed 1 (23.75 vs
    // 24.33, a real but sub-1-HP difference the plan's own rounding step erases), making
    // `toBeGreaterThan` fail regardless of implementation correctness. Population 1
    // widens star_fort's flat +5 bonus relative to the smaller population-scaled base,
    // producing a clean, non-colliding separation (15 vs 17) while testing the exact
    // same thing: fortification increases counter-fire damage.
    const { city, ownerCiv } = makeCityAndCiv({ population: 1, buildings: ['walls'] });
    const { city: fortifiedCity, ownerCiv: fortifiedCiv } = makeCityAndCiv({ population: 1, buildings: ['walls', 'star_fort'] });
    const base = getCityCounterFireDamage(city, ownerCiv, 'land', 20, false, 1);
    const fortified = getCityCounterFireDamage(fortifiedCity, fortifiedCiv, 'land', 20, false, 1);
    expect(base).toBeGreaterThan(0);
    expect(fortified).toBeGreaterThan(base);
  });

  it('scales inversely with attacker strength -- an overwhelming attacker takes measurably less', () => {
    const { city, ownerCiv } = makeCityAndCiv({ population: 10, buildings: ['walls'] });
    const weakAttacker = getCityCounterFireDamage(city, ownerCiv, 'land', 15, false, 1);
    const strongAttacker = getCityCounterFireDamage(city, ownerCiv, 'land', 200, false, 1);
    expect(strongAttacker).toBeLessThan(weakAttacker);
  });
});

describe('city assault balance sampling (#522)', () => {
  // Seeds spread by a large odd multiplier, not raw consecutive integers 0..49: the
  // resolveCityAssault LCG's FIRST draw from a small seed s is (s*48271) mod M, which
  // for s in 0..49 is a tiny fraction of the modulus -- randomFactor barely moves off
  // 0.8 for the entire sample, capping the achievable win rate at ~76% for ANY attacker
  // strength (verified empirically: even an attacker 1000x the city's strength only
  // reaches ~90% with consecutive seeds, vs. the RNG model's true asymptotic ceiling of
  // ~92% with well-spread seeds). This is a small-seed correlation artifact of the LCG,
  // not a signal about the combat model -- spreading seeds avoids it without touching
  // production code (which never seeds with tiny sequential integers in practice).
  const sampleSeed = (i: number) => i * 104729 + 17;

  it('an unwalled, low-population outpost favors an era-appropriate attacker far more often than not', () => {
    // Today this capture is 100% guaranteed; the new mechanic must not turn routine
    // early expansion into a frequent failure. NOTE: >0.9 (the plan's original bound)
    // is unreachable here -- the RNG model's asymptotic ceiling (~92%, only approached
    // with a near-infinitely strong attacker per the randomFactor/clamp math) means no
    // realistic era-1 unit can hit >90% against even the weakest possible city.
    //
    // Uses 'warrior' (strength 10, cost 8) -- the cheapest and most common unit
    // available for early-expansion capture, not a stronger/pricier alternative -- since
    // that's the actual "era-appropriate attacker" a player reaches for against a
    // population-1 outpost. This caught a real balance bug pre-merge: with the design
    // doc's original CITY_BASE_STRENGTH=5/CITY_STRENGTH_PER_POPULATION=3, a warrior's
    // win rate against this exact scenario was only ~55-57% -- a near coin-flip for the
    // single most common early-game action, not "reliably favors" as the spec required.
    // Retuned to 2/2 (see city-siege-system.ts) to fix this; 0.6 leaves margin below the
    // ~0.66-0.74 range observed across seed offsets while still proving it's well above
    // a 50/50 coin-flip.
    const { city, ownerCiv } = makeCityAndCiv({ population: 1, buildings: [] });
    const attacker = createUnit('warrior', 'ai-1', { q: 3, r: 2 }, { nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 });
    const strengths = calculateCityAssaultStrengths(attacker, city, ownerCiv.techState.completed ?? [], {
      width: 10, height: 10, wrapsHorizontally: false, rivers: [], tiles: {},
    });
    const wins = Array.from({ length: 50 }, (_, i) => resolveCityAssault(
      strengths.attackerStrength, strengths.intrinsicStrength, sampleSeed(i),
    ).attackerWins);
    const winRate = wins.filter(Boolean).length / wins.length;
    expect(winRate).toBeGreaterThan(0.6);
  });

  it('a walled, high-population, fully-teched city meaningfully raises attacker losses without being unbeatable', () => {
    const { city, ownerCiv: baseCiv } = makeCityAndCiv({ population: 20, buildings: ['walls', 'star_fort'] });
    const ownerCiv = withTechs(baseCiv, ['fortification-engineering', 'professional-army']);
    const attacker = createUnit('tank', 'ai-1', { q: 3, r: 2 }, { nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 });
    const strengths = calculateCityAssaultStrengths(attacker, city, ownerCiv.techState.completed ?? [], {
      width: 10, height: 10, wrapsHorizontally: false, rivers: [], tiles: {},
    });
    const wins = Array.from({ length: 50 }, (_, i) => resolveCityAssault(
      strengths.attackerStrength, strengths.intrinsicStrength, sampleSeed(i),
    ).attackerWins);
    const winRate = wins.filter(Boolean).length / wins.length;
    // An era-appropriate strong attacker (tank) should still be capable of winning,
    // just not trivially -- not >0.95 (city offers zero real resistance) and not <0.05
    // (city becomes practically uncapturable even to a strong, teched attacker).
    expect(winRate).toBeLessThan(0.95);
    expect(winRate).toBeGreaterThan(0.05);
  });
});
