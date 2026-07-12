import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import { foundCity } from '@/systems/city-system';
import { createUnit } from '@/systems/unit-system';
import type { City, Civilization, GameState } from '@/core/types';
import { applyCityHpRegeneration, applyCitySiegeOutcome, calculateCityAssaultStrengths, getCityIntrinsicStrength, isCityHpRegenerating, resolveCityAssault, resolveCitySiegeDamage } from '@/systems/city-siege-system';

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
    const low = getCityIntrinsicStrength(city, ownerCiv, 'land');
    const { city: cityB, ownerCiv: ownerCivB } = makeCityAndCiv({ population: 10, buildings: [] });
    const high = getCityIntrinsicStrength(cityB, ownerCivB, 'land');

    expect(low).toBe(5 + 1 * 3); // 8
    expect(high).toBe(5 + 10 * 3); // 35
    expect(high).toBeGreaterThan(low);
  });

  it('applies the walls multiplier on top of the population base, matching getCityDefenseBreakdown', () => {
    const { city, ownerCiv } = makeCityAndCiv({ population: 4, buildings: ['walls'] });
    // base = 5 + 4*3 = 17; walls -> x1.25 -> 21.25 -> rounds per implementation
    expect(getCityIntrinsicStrength(city, ownerCiv, 'land')).toBeCloseTo(17 * 1.25, 5);
  });

  it('applies Star Fort and Fortification Engineering flat bonuses, same as a garrisoned defender', () => {
    const { city, ownerCiv } = makeCityAndCiv({ population: 4, buildings: ['walls', 'star_fort'] });
    const withEngineering = withTechs(ownerCiv, ['fortification-engineering']);
    const strength = getCityIntrinsicStrength(
      { ...city, buildings: ['walls', 'star_fort'] },
      withEngineering,
      'land',
    );
    // base = 17; walls -> 21.25; +star_fort(5) +fortification-engineering(5) = 31.25
    expect(strength).toBeCloseTo(17 * 1.25 + 5 + 5, 5);
  });

  it('applies Torpedo Warfare only against a naval attacker, matching getCityDefenseBreakdown', () => {
    const { city, ownerCiv } = makeCityAndCiv({ population: 4, buildings: ['walls'] });
    const withTorpedo = withTechs(ownerCiv, ['torpedo-warfare']);
    const naval = getCityIntrinsicStrength(city, withTorpedo, 'naval');
    const land = getCityIntrinsicStrength(city, withTorpedo, 'land');
    expect(naval).toBeCloseTo(17 * 1.25 + 5, 5);
    expect(land).toBeCloseTo(17 * 1.25, 5);
  });

  it('handles zero population without throwing (a just-founded or fully-unrested city)', () => {
    const { city, ownerCiv } = makeCityAndCiv({ population: 0, buildings: [] });
    expect(getCityIntrinsicStrength(city, ownerCiv, 'land')).toBe(5);
  });
});

describe('calculateCityAssaultStrengths / resolveCityAssault (#522)', () => {
  it('computes attacker strength the same way calculateCombatStrengths does (health, veterancy, river)', () => {
    const { state, cityId } = makeGameStateWithCity();
    const city = { ...state.cities[cityId]!, population: 1, buildings: [] };
    const ownerCiv = state.civilizations.player;
    const attacker = createUnit('swordsman', 'ai-1', { q: 3, r: 2 }, state.idCounters);

    const breakdown = calculateCityAssaultStrengths(attacker, city, ownerCiv, state.map);

    // swordsman strength 25, full health, no veterancy, no river between (2,2)-(3,2) here
    expect(breakdown.attackerStrength).toBeCloseTo(25, 5);
    expect(breakdown.intrinsicStrength).toBe(8); // 5 + 1*3, no walls
    expect(breakdown.winProbability).toBeGreaterThan(0.5);
  });

  it('gives a weak attacker a low but nonzero win probability against a strong city', () => {
    const { state, cityId } = makeGameStateWithCity();
    const city = { ...state.cities[cityId]!, population: 30, buildings: ['walls', 'star_fort'] };
    const ownerCiv = withTechs(state.civilizations.player, ['fortification-engineering']);
    const attacker = createUnit('warrior', 'ai-1', { q: 3, r: 2 }, state.idCounters);

    const breakdown = calculateCityAssaultStrengths(attacker, city, ownerCiv, state.map);

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
