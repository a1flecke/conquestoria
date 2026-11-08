import { describe, expect, it } from 'vitest';
import type { GameState, Unit } from '@/core/types';
import { createNewGame } from '@/core/game-state';
import { EventBus } from '@/core/event-bus';
import { processTurn } from '@/core/turn-manager';
import {
  CITY_BREACH_ASSAULT_MULTIPLIER,
  createCityBreach,
  isCityBreachedBy,
} from '@/systems/city-breach';
import {
  calculateCityAssaultStrengths,
  expireCityBreaches,
} from '@/systems/city-siege-system';
import { previewUnitCityBombardment, resolveUnitCityBombardment } from '@/systems/city-bombardment-system';
import {
  getBreachPreview,
  getBreachTargetCityIds,
  getHeroicCommandEligibility,
  issueBreach,
} from '@/systems/great-general-abilities';
import { describeGeneralAbilityMoment } from '@/systems/great-general-ability-presentation';
import { evaluateBreachOpportunity, chooseGeneralCommandAction } from '@/ai/ai-general-command';

const CITY = { q: 0, r: 0 };

function unit(id: string, type: string, owner: string, position: { q: number; r: number }, extra: Partial<Unit> = {}): Unit {
  return {
    id, type, owner, position, movementPointsLeft: 2, health: 100, experience: 0,
    hasMoved: false, hasActed: false, isResting: false, ...extra,
  } as Unit;
}

/**
 * `player` (a Siegemaster, Mehmed, two hexes from the city, with a cannon beside it) besieges `ai-1`'s walled city at
 * (0,0), at war and with the city currently visible. Hand-built so every rule under test is isolated.
 */
function makeSiege(options: { garrison?: boolean; general?: string; visible?: boolean; atWar?: boolean; walls?: boolean } = {}): GameState {
  const state = {
    turn: 30,
    map: { width: 12, height: 12, wrapsHorizontally: false, tiles: {} },
    cities: {
      fort: {
        id: 'fort', name: 'Fort Hesse', owner: 'ai-1', position: CITY,
        population: 4, food: 0, foodNeeded: 15, buildings: options.walls === false ? [] : ['walls'],
        productionQueue: [], productionProgress: 0, ownedTiles: [], workedTiles: [], focus: 'balanced',
        maturity: 'city', unrestLevel: 0, unrestTurns: 0, spyUnrestBonus: 0, hp: 100,
      },
    },
    units: {
      cannon: unit('cannon', 'cannon', 'player', { q: 1, r: 0 }),
      gen: unit('gen', 'great_general', 'player', { q: 2, r: 0 }, { generalDefinitionId: options.general ?? 'gen_mehmed' }),
      ...(options.garrison ? { guard: unit('guard', 'spearman', 'ai-1', CITY) } : {}),
    },
    civilizations: {
      player: {
        id: 'player', cities: [], units: ['cannon', 'gen'], gold: 100, techState: { completed: [] },
        visibility: { tiles: options.visible === false ? {} : { '0,0': 'visible' } },
        diplomacy: { atWarWith: options.atWar === false ? [] : ['ai-1'], relationships: {}, treaties: [] },
      },
      'ai-1': {
        id: 'ai-1', cities: ['fort'], units: options.garrison ? ['guard'] : [], gold: 100, techState: { completed: [] },
        diplomacy: { atWarWith: options.atWar === false ? [] : ['player'], relationships: {}, treaties: [] },
      },
    },
  } as unknown as GameState;
  return state;
}

describe('the breach marker (#939)', () => {
  it('opens the walls to one civ only, and lasts its duration including the turn it was opened', () => {
    const breach = createCityBreach('player', 'gen_mehmed', 30, 2);
    expect(breach).toEqual({ byCivId: 'player', generalDefinitionId: 'gen_mehmed', expiresTurn: 31 });
    const city = { breach };
    expect(isCityBreachedBy(city, 'player')).toBe(true);
    expect(isCityBreachedBy(city, 'ai-1')).toBe(false);
    expect(isCityBreachedBy({}, 'player')).toBe(false);
  });

  it('is swept at the end of the round whose turn is its last, and not before', () => {
    const state = makeSiege();
    const breached: GameState = {
      ...state,
      cities: { fort: { ...state.cities.fort!, breach: createCityBreach('player', 'gen_mehmed', 30, 2) } },
    };
    expect(expireCityBreaches({ ...breached, turn: 30 }).cities.fort!.breach).toBeDefined();
    expect(expireCityBreaches({ ...breached, turn: 31 }).cities.fort!.breach).toBeUndefined();
  });

  it('returns the very same state when nothing expired, so an idle round moves no digest', () => {
    const state = makeSiege();
    expect(expireCityBreaches(state)).toBe(state);
  });

  it('ends inside a real round: a breach expiring this turn is gone from the processed state', () => {
    const base = createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed: 'breach-round' });
    const cityId = Object.keys(base.cities)[0]!;
    const owner = base.cities[cityId]!.owner;
    const other = Object.keys(base.civilizations).find(id => id !== owner)!;
    const state: GameState = {
      ...base,
      cities: { ...base.cities, [cityId]: { ...base.cities[cityId]!, breach: createCityBreach(other, 'gen_mehmed', base.turn, 1) } },
    };
    expect(state.cities[cityId]!.breach).toBeDefined();
    const processed = processTurn(state, new EventBus());
    expect(processed.cities[cityId]?.breach).toBeUndefined();
  });

  it('a save from before the field existed processes a round unchanged (additive, no migration)', () => {
    const base = createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed: 'breach-legacy' });
    for (const city of Object.values(base.cities)) expect(city.breach).toBeUndefined();
    const processed = processTurn(base, new EventBus());
    for (const city of Object.values(processed.cities)) expect(city.breach).toBeUndefined();
  });
});

describe('what a breach changes in the siege (#939)', () => {
  function breached(state: GameState, civId = 'player'): GameState {
    return { ...state, cities: { fort: { ...state.cities.fort!, breach: createCityBreach(civId, 'gen_mehmed', state.turn, 2) } } };
  }

  it('lets a deliberate bombardment fire through a garrison at full strength instead of half', () => {
    const closed = makeSiege({ garrison: true });
    const open = breached(closed);
    const closedPreview = previewUnitCityBombardment(closed, closed.units.cannon!, closed.cities.fort!);
    const openPreview = previewUnitCityBombardment(open, open.units.cannon!, open.cities.fort!);
    expect(closedPreview.hasGarrison).toBe(true);
    expect(openPreview.hpLoss).toBeGreaterThan(closedPreview.hpLoss);
  });

  it('stops the walls answering the breaching civ, in the preview and in the resolved shot', () => {
    const closed = makeSiege();
    const open = breached(closed);
    const closedPreview = previewUnitCityBombardment(closed, closed.units.cannon!, closed.cities.fort!);
    const openPreview = previewUnitCityBombardment(open, open.units.cannon!, open.cities.fort!);
    expect(closedPreview.counterFire).toBeGreaterThan(0); // control: the walls do shoot back
    expect(openPreview.counterFire).toBe(0);

    const closedShot = resolveUnitCityBombardment(closed, { attackerUnitId: 'cannon', cityId: 'fort', source: 'player' });
    const openShot = resolveUnitCityBombardment(open, { attackerUnitId: 'cannon', cityId: 'fort', source: 'player' });
    expect(closedShot.ok && closedShot.counterFireDamage).toBeGreaterThan(0);
    expect(openShot.ok && openShot.counterFireDamage).toBe(0);
  });

  it('does not change the #974 per-turn cap: a breach cannot floor a city in one turn', () => {
    const open = breached(makeSiege({ garrison: true }));
    const preview = previewUnitCityBombardment(open, open.units.cannon!, open.cities.fort!);
    expect(preview.hpLoss).toBeLessThanOrEqual(20);
    expect(preview.capRemaining).toBe(20);
  });

  it('strengthens only the breaching civ\'s land assault', () => {
    const closed = makeSiege();
    const open = breached(closed);
    const attacker = unit('rifle', 'swordsman', 'player', { q: 1, r: 0 });
    const outsider = unit('rival', 'swordsman', 'ai-2', { q: 1, r: 0 });
    const techs: string[] = [];
    const base = calculateCityAssaultStrengths(attacker, closed.cities.fort!, techs, closed.map).attackerStrength;
    const boosted = calculateCityAssaultStrengths(attacker, open.cities.fort!, techs, open.map).attackerStrength;
    const otherCiv = calculateCityAssaultStrengths(outsider, open.cities.fort!, techs, open.map).attackerStrength;
    expect(boosted).toBeCloseTo(base * CITY_BREACH_ASSAULT_MULTIPLIER, 6);
    expect(otherCiv).toBeCloseTo(base, 6);
  });
});

describe('issueBreach (#939)', () => {
  it('opens the walls, spends one charge and starts the Siegemaster\'s 12-turn cooldown', () => {
    const state = makeSiege();
    const after = issueBreach(state, 'gen', 'fort');
    expect(after.cities.fort!.breach).toEqual({ byCivId: 'player', generalDefinitionId: 'gen_mehmed', expiresTurn: 31 });
    expect(after.units.gen!.generalCommandChargesUsed).toBe(1);
    expect(after.units.gen!.generalCommandCooldownUntilTurn).toBe(42);
    expect(state.cities.fort!.breach).toBeUndefined(); // the input is never mutated
  });

  it('is a Siegemaster-only command: any other General is refused and keeps its charge', () => {
    for (const general of ['gen_hannibal', 'gen_wellington', 'gen_genghis', 'gen_napoleon']) {
      const state = makeSiege({ general });
      const preview = getBreachPreview(state, 'gen', 'fort');
      expect(preview.available, general).toBe(false);
      expect(issueBreach(state, 'gen', 'fort'), general).toBe(state);
    }
  });

  it.each([
    ['not at war', { atWar: false }],
    ['not currently visible', { visible: false }],
  ])('refuses a city that is %s, spends nothing and says why', (_label, options) => {
    const state = makeSiege(options);
    expect(getBreachTargetCityIds(state, 'gen')).toEqual([]);
    expect(getBreachPreview(state, 'gen', 'fort').denial).toBeTruthy();
    expect(issueBreach(state, 'gen', 'fort')).toBe(state);
  });

  it('refuses a city beyond command range', () => {
    const state = makeSiege();
    const far: GameState = { ...state, units: { ...state.units, gen: { ...state.units.gen!, position: { q: 5, r: 0 } } } };
    expect(getBreachTargetCityIds(far, 'gen')).toEqual([]);
    expect(issueBreach(far, 'gen', 'fort')).toBe(far);
  });

  it('refuses one civ\'s own city and a city already open to this civ', () => {
    const state = makeSiege();
    const own: GameState = { ...state, cities: { fort: { ...state.cities.fort!, owner: 'player' } } };
    expect(getBreachTargetCityIds(own, 'gen')).toEqual([]);
    const once = issueBreach(state, 'gen', 'fort');
    expect(getBreachTargetCityIds(once, 'gen')).toEqual([]);
    expect(issueBreach(once, 'gen', 'fort')).toBe(once);
  });

  it('respects the shared charge and cooldown gate', () => {
    const state = makeSiege();
    const cooling: GameState = { ...state, units: { ...state.units, gen: { ...state.units.gen!, generalCommandCooldownUntilTurn: 35 } } };
    expect(getHeroicCommandEligibility(cooling, cooling.units.gen!).eligible).toBe(false);
    expect(issueBreach(cooling, 'gen', 'fort')).toBe(cooling);
  });
});

describe('the Breach moment the player sees (#939)', () => {
  it('names the city, its hex and the duration, from the state difference', () => {
    const before = makeSiege();
    const after = issueBreach(before, 'gen', 'fort');
    const moment = describeGeneralAbilityMoment('breach', before, after, 'gen');
    expect(moment).not.toBeNull();
    expect(moment!.kind).toBe('breach');
    expect(moment!.affectedCoords).toEqual([CITY]);
    expect(moment!.summary).toContain('Fort Hesse');
    expect(moment!.summary).toContain('2 turns');
  });

  it('is null when the command changed nothing, so a refused Breach is never celebrated', () => {
    const state = makeSiege({ atWar: false });
    expect(describeGeneralAbilityMoment('breach', state, issueBreach(state, 'gen', 'fort'), 'gen')).toBeNull();
  });
});

describe('the AI uses Breach (#939)', () => {
  it('breaches a visible hostile city when its own siege army is in position', () => {
    const state = makeSiege({ garrison: true });
    const chosen = evaluateBreachOpportunity(state, 'gen');
    expect(chosen?.ability).toBe('breach');
    expect(chosen!.execute(state).cities.fort!.breach?.byCivId).toBe('player');
  });

  it('does nothing without an army near the city, in the fog, or in peace', () => {
    const noArmy = makeSiege();
    const empty: GameState = { ...noArmy, units: { gen: noArmy.units.gen! }, civilizations: { ...noArmy.civilizations, player: { ...noArmy.civilizations.player!, units: ['gen'] } } };
    expect(evaluateBreachOpportunity(empty, 'gen')).toBeNull();
    expect(evaluateBreachOpportunity(makeSiege({ visible: false }), 'gen')).toBeNull();
    expect(evaluateBreachOpportunity(makeSiege({ atWar: false }), 'gen')).toBeNull();
  });

  it('is offered through the shared command chooser and never to a General without the specialty', () => {
    expect(chooseGeneralCommandAction(makeSiege({ garrison: true }), 'gen')?.ability).toBe('breach');
    expect(evaluateBreachOpportunity(makeSiege({ garrison: true, general: 'gen_hannibal' }), 'gen')).toBeNull();
  });
});
