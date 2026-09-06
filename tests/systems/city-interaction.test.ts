import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import type { GameState, Unit, UnitType } from '@/core/types';
import { foundCity } from '@/systems/city-system';
import { createUnit } from '@/systems/unit-system';
import { resolveCityInteraction } from '@/systems/city-interaction';

const mkC = () => ({ nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 });

/**
 * Player unit at `attackerPos`; an `ai-1` city at (3,0). The two civs are at war unless
 * `atWar: false`. A garrison is added on the city tile when `garrison` is set.
 */
function scenario(options: {
  attackerType: UnitType;
  attackerPos: { q: number; r: number };
  garrison?: UnitType;
  atWar?: boolean;
  cityHp?: number;
  cityOwner?: string;
}): { state: GameState; unit: Unit } {
  const state = createNewGame(undefined, `city-interaction-${options.attackerType}`, 'small');
  state.currentPlayer = 'player';
  for (const key of ['0,0', '1,0', '2,0', '3,0', '4,0']) {
    state.map.tiles[key] = { ...state.map.tiles[key]!, terrain: 'plains' };
  }
  state.units = {
    atk: { ...createUnit(options.attackerType, 'player', options.attackerPos, mkC()), id: 'atk', movementPointsLeft: 3 },
  };
  state.civilizations.player.units = ['atk'];
  state.civilizations.player.visibility.tiles = {
    '0,0': 'visible', '1,0': 'visible', '2,0': 'visible', '3,0': 'visible', '4,0': 'visible',
  };

  const owner = options.cityOwner ?? 'ai-1';
  if (options.atWar !== false) {
    state.civilizations.player.diplomacy.atWarWith = [owner];
    if (state.civilizations[owner]) state.civilizations[owner].diplomacy.atWarWith = ['player'];
  }

  state.cities = {};
  const city = { ...foundCity(owner, { q: 3, r: 0 }, state.map, state.idCounters), id: 'target', owner };
  if (options.cityHp !== undefined) city.hp = options.cityHp;
  state.cities = { target: city };
  if (state.civilizations[owner]) state.civilizations[owner].cities = ['target'];

  if (options.garrison) {
    state.units.def = { ...createUnit(options.garrison, owner, { q: 3, r: 0 }, mkC()), id: 'def' };
    if (state.civilizations[owner]) state.civilizations[owner].units = ['def'];
  }
  return { state, unit: state.units.atk };
}

function kinds(state: GameState, unit: Unit) {
  const result = resolveCityInteraction(state, unit, state.cities.target);
  return {
    available: result.available.map(a => a.kind).sort(),
    denied: Object.fromEntries(result.denied.map(d => [d.kind, d.reason])),
    result,
  };
}

describe('#966 resolveCityInteraction', () => {
  it('offers capture to an adjacent melee unit against an ungarrisoned city', () => {
    const { state, unit } = scenario({ attackerType: 'warrior', attackerPos: { q: 2, r: 0 } });
    expect(kinds(state, unit).available).toEqual(['capture']);
  });

  it('offers only attack-defender against a garrisoned city, and says why capture is denied', () => {
    const { state, unit } = scenario({ attackerType: 'warrior', attackerPos: { q: 2, r: 0 }, garrison: 'spearman' });
    const { available, denied } = kinds(state, unit);

    expect(available).toEqual(['attack-defender']);
    expect(denied.capture).toBe('Defeat the defenders first.');
  });

  it('names the actual defender in the attack label, never a generic verb', () => {
    const { state, unit } = scenario({ attackerType: 'warrior', attackerPos: { q: 2, r: 0 }, garrison: 'spearman' });
    const action = kinds(state, unit).result.available.find(a => a.kind === 'attack-defender');

    expect(action?.label).toBe('Attack the Spearman');
  });

  it('denies capture to a non-adjacent unit with a truthful reason', () => {
    const { state, unit } = scenario({ attackerType: 'warrior', attackerPos: { q: 1, r: 0 } });
    const { available, denied } = kinds(state, unit);

    expect(available).toEqual([]);
    expect(denied.capture).toBe('Move next to the city to capture it.');
  });

  it('denies capture to a strength-0 non-combatant', () => {
    const { state, unit } = scenario({ attackerType: 'settler', attackerPos: { q: 2, r: 0 } });
    const { available, denied } = kinds(state, unit);

    expect(available).toEqual([]);
    expect(denied.capture).toBe('This unit cannot capture a city.');
  });

  it('denies capture to a naval unit, which cannot occupy a land tile', () => {
    const { state, unit } = scenario({ attackerType: 'frigate', attackerPos: { q: 2, r: 0 } });
    expect(kinds(state, unit).denied.capture).toBe('This unit cannot capture a city.');
  });

  it('offers nothing against a city you are not at war with', () => {
    const { state, unit } = scenario({ attackerType: 'warrior', attackerPos: { q: 2, r: 0 }, atWar: false });
    const { available, denied } = kinds(state, unit);

    expect(available).toEqual([]);
    expect(denied.capture).toBe('You are not at war with this city.');
  });

  // The payoff of #966's HP coupling has to be visible, or the mechanic is invisible.
  it('reports the damaged and undamaged defense so the UI can show the payoff', () => {
    const full = scenario({ attackerType: 'warrior', attackerPos: { q: 2, r: 0 }, cityHp: 100 });
    const wrecked = scenario({ attackerType: 'warrior', attackerPos: { q: 2, r: 0 }, cityHp: 20 });

    const atFull = kinds(full.state, full.unit).result.available.find(a => a.kind === 'capture');
    const atLow = kinds(wrecked.state, wrecked.unit).result.available.find(a => a.kind === 'capture');

    expect(atFull).toMatchObject({ kind: 'capture' });
    if (atFull?.kind !== 'capture' || atLow?.kind !== 'capture') throw new Error('expected capture actions');

    // Undamaged city: before === after, so the UI shows no arrow.
    expect(atFull.defenseAfter).toBeCloseTo(atFull.defenseBefore, 5);
    // Damaged city: defense is lower and the odds are better.
    expect(atLow.defenseAfter).toBeLessThan(atLow.defenseBefore);
    expect(atLow.winProbability).toBeGreaterThan(atFull.winProbability);
  });

  it('labels capture with its real odds', () => {
    const { state, unit } = scenario({ attackerType: 'warrior', attackerPos: { q: 2, r: 0 } });
    const action = kinds(state, unit).result.available.find(a => a.kind === 'capture');
    if (action?.kind !== 'capture') throw new Error('expected a capture action');

    expect(action.label).toBe(`Capture the city — ${Math.round(action.winProbability * 100)}%`);
  });

  // Minor civs have no `techState`; the resolver must handle them rather than throw or
  // silently return nothing, which is exactly how bombardment would have no-opped.
  it('handles a minor-civ city without a Civilization record', () => {
    const { state, unit } = scenario({
      attackerType: 'warrior', attackerPos: { q: 2, r: 0 }, cityOwner: 'mc-warriors',
    });
    state.civilizations.player.diplomacy.atWarWith = ['mc-warriors'];

    expect(() => kinds(state, unit)).not.toThrow();
    expect(kinds(state, unit).available).toEqual(['capture']);
  });

  it('keys legality off the acting unit\'s owner, not state.currentPlayer (hot seat)', () => {
    const { state, unit } = scenario({ attackerType: 'warrior', attackerPos: { q: 2, r: 0 } });
    const asPlayerSeat = kinds(state, unit).available;
    state.currentPlayer = 'ai-1';

    expect(kinds(state, unit).available).toEqual(asPlayerSeat);
  });

  // Phase 1 ships no bombard action; Phase 2 adds it. Guards against a dead affordance
  // appearing early now that ranged units carry 'city' in attackProfile.targets.
  it('never offers a bombard action in phase 1', () => {
    const { state, unit } = scenario({ attackerType: 'catapult', attackerPos: { q: 1, r: 0 } });
    expect(kinds(state, unit).available).not.toContain('bombard');
  });
});
