import { describe, expect, it } from 'vitest';
import type { GameState, UnitType } from '@/core/types';
import { resolveUnitCityBombardment } from '@/systems/city-bombardment-system';
import { CITY_BOMBARDMENT_MAX_HP_LOSS_PER_TURN } from '@/systems/city-siege-system';

function makeState(options: {
  attackerType?: UnitType;
  attackerPos?: { q: number; r: number };
  cityBuildings?: string[];
  cityHp?: number;
  garrison?: boolean;
} = {}): GameState {
  const state = {
    turn: 30,
    map: { width: 8, height: 8, wrapsHorizontally: false, tiles: {} },
    cities: {
      port: {
        id: 'port', name: 'Port', owner: 'player', position: { q: 0, r: 0 },
        population: 4, food: 0, foodNeeded: 15, buildings: options.cityBuildings ?? ['coastal_battery'],
        productionQueue: [], productionProgress: 0, ownedTiles: [], workedTiles: [], focus: 'balanced',
        maturity: 'city', unrestLevel: 0, unrestTurns: 0, spyUnrestBonus: 0, hp: options.cityHp ?? 100,
      },
    },
    units: {
      cruiser: {
        id: 'cruiser', type: options.attackerType ?? 'missile_cruiser', owner: 'ai-1',
        position: options.attackerPos ?? { q: 1, r: 0 },
        movementPointsLeft: 4, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false,
      },
    },
    civilizations: {
      player: { id: 'player', cities: ['port'], units: [], gold: 100, techState: { completed: [] } },
      'ai-1': {
        id: 'ai-1', cities: [], units: ['cruiser'], gold: 100, techState: { completed: [] },
        diplomacy: { atWarWith: ['player'] },
      },
    },
  } as unknown as GameState;

  if (options.garrison) {
    (state.units as Record<string, unknown>).guard = {
      id: 'guard', type: 'spearman', owner: 'player', position: { q: 0, r: 0 },
      movementPointsLeft: 2, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false,
    };
    state.civilizations.player.units = ['guard'];
  }
  return state;
}

describe('resolveUnitCityBombardment', () => {
  it('uses the naval defense result for Battery counterfire, consumes the ship, and leaves the city capturable', () => {
    const result = resolveUnitCityBombardment(makeState(), {
      attackerUnitId: 'cruiser', cityId: 'port', source: 'ai',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.cities.port.hp).toBe(80);
    expect(result.state.units.cruiser.health).toBe(96);
    expect(result.state.units.cruiser.hasActed).toBe(true);
    expect(result.state.units.cruiser.movementPointsLeft).toBe(0);
    expect(result.batteryEvent).toMatchObject({ recipientCivId: 'player', damage: 4, source: 'ai' });
    // #974: the event carries the firing domain -- 'city:naval-bombarded' became a lie once
    // land and air units could bombard.
    expect(result.cityEvent).toEqual({
      cityId: 'port', recipientCivId: 'player', source: 'ai', hpLost: 20, domain: 'naval',
    });
  });

  // #974: a city already floored at 1 HP cannot be damaged further. Returning `no-damage`
  // rather than succeeding-for-zero is what stops the action burning the unit's turn; the
  // caller surfaces the reason instead.
  it('refuses rather than burning a turn when the city is already at its 1 HP floor', () => {
    const result = resolveUnitCityBombardment(makeState({ cityHp: 1 }), {
      attackerUnitId: 'cruiser', cityId: 'port', source: 'player',
    });

    expect(result).toMatchObject({ ok: false, reason: 'no-damage' });
    expect(result.state.units.cruiser.hasActed).toBe(false);
  });

  it('never destroys a city, flooring it at 1 HP instead', () => {
    const result = resolveUnitCityBombardment(makeState({ cityHp: 3 }), {
      attackerUnitId: 'cruiser', cityId: 'port', source: 'player',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.cities.port.hp).toBe(1);
  });

  // The per-turn cap exists because friendly stacking is uncapped: without it a stack of
  // cheap units would floor any city in one turn. It applies to every domain, so a fleet
  // is bounded exactly like a siege line.
  describe('#974 per-city per-turn cap', () => {
    it('records damage dealt so a second attacker the same turn is capped', () => {
      const first = resolveUnitCityBombardment(makeState(), {
        attackerUnitId: 'cruiser', cityId: 'port', source: 'player',
      });
      expect(first.ok).toBe(true);
      if (!first.ok) return;
      expect(first.state.cities.port.bombardment).toEqual({ turn: 30, hpLostThisTurn: 20 });
      expect(first.hpLost).toBe(CITY_BOMBARDMENT_MAX_HP_LOSS_PER_TURN);

      const second = resolveUnitCityBombardment(
        {
          ...first.state,
          units: {
            ...first.state.units,
            cruiser: { ...first.state.units.cruiser, hasActed: false, movementPointsLeft: 4 },
          },
        },
        { attackerUnitId: 'cruiser', cityId: 'port', source: 'player' },
      );

      expect(second).toMatchObject({ ok: false, reason: 'no-damage' });
    });

    it('resets the tally on a new turn', () => {
      const first = resolveUnitCityBombardment(makeState(), {
        attackerUnitId: 'cruiser', cityId: 'port', source: 'player',
      });
      expect(first.ok).toBe(true);
      if (!first.ok) return;

      const nextTurn = {
        ...first.state,
        turn: 31,
        units: {
          ...first.state.units,
          cruiser: { ...first.state.units.cruiser, hasActed: false, movementPointsLeft: 4 },
        },
      };
      const again = resolveUnitCityBombardment(nextTurn, {
        attackerUnitId: 'cruiser', cityId: 'port', source: 'player',
      });

      expect(again.ok).toBe(true);
      if (!again.ok) return;
      // The tally starts fresh rather than carrying turn 30's 20 forward. The shot itself is
      // slightly weaker than turn 30's because the ship took Battery counter-fire and damage
      // scales with health -- so this asserts the reset, not a hardcoded number.
      expect(again.state.cities.port.bombardment).toEqual({ turn: 31, hpLostThisTurn: again.hpLost });
      expect(again.hpLost).toBeGreaterThan(0);
    });
  });

  describe('#974 land bombardment', () => {
    it('lets a land siege unit bombard a city it could never previously touch from range', () => {
      const result = resolveUnitCityBombardment(
        makeState({ attackerType: 'catapult', attackerPos: { q: 2, r: 0 }, cityBuildings: [] }),
        { attackerUnitId: 'cruiser', cityId: 'port', source: 'player' },
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.hpLost).toBe(8); // strength 20 * 0.4 = 8, unwalled
      expect(result.cityEvent?.domain).toBe('land');
    });

    it('fires through a garrison at half effect, rather than being blocked outright', () => {
      const undefended = resolveUnitCityBombardment(
        makeState({ attackerType: 'catapult', attackerPos: { q: 2, r: 0 }, cityBuildings: [] }),
        { attackerUnitId: 'cruiser', cityId: 'port', source: 'player' },
      );
      const defended = resolveUnitCityBombardment(
        makeState({ attackerType: 'catapult', attackerPos: { q: 2, r: 0 }, cityBuildings: [], garrison: true }),
        { attackerUnitId: 'cruiser', cityId: 'port', source: 'player' },
      );

      expect(undefended.ok && defended.ok).toBe(true);
      if (!undefended.ok || !defended.ok) return;
      expect(defended.hpLost).toBe(Math.floor(undefended.hpLost * 0.5));
    });
  });

  // Standing off at range is safe; standing next to a walled city is not. That asymmetry is
  // what makes a slow, longer-ranged siege unit worth its cost.
  describe('#974 counter-fire is adjacency-only', () => {
    it('returns fire on a bombardier standing next to a walled city', () => {
      const result = resolveUnitCityBombardment(
        makeState({ attackerType: 'catapult', attackerPos: { q: 1, r: 0 }, cityBuildings: ['walls'] }),
        { attackerUnitId: 'cruiser', cityId: 'port', source: 'player' },
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.counterFireDamage).toBeGreaterThan(0);
    });

    it('does not reach a bombardier standing off at range', () => {
      const result = resolveUnitCityBombardment(
        makeState({ attackerType: 'catapult', attackerPos: { q: 2, r: 0 }, cityBuildings: ['walls'] }),
        { attackerUnitId: 'cruiser', cityId: 'port', source: 'player' },
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.counterFireDamage).toBe(0);
    });

    it('does not return fire from an unwalled city at any range', () => {
      const result = resolveUnitCityBombardment(
        makeState({ attackerType: 'catapult', attackerPos: { q: 1, r: 0 }, cityBuildings: [] }),
        { attackerUnitId: 'cruiser', cityId: 'port', source: 'player' },
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.counterFireDamage).toBe(0);
    });
  });

  // Ranged units must not be able to farm veterancy safely by shelling a city.
  it('awards no experience for bombardment', () => {
    const result = resolveUnitCityBombardment(makeState(), {
      attackerUnitId: 'cruiser', cityId: 'port', source: 'player',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.units.cruiser.experience).toBe(0);
  });
});
