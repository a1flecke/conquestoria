import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import type { GameState, Unit, UnitType } from '@/core/types';
import { foundCity } from '@/systems/city-system';
import { createUnit } from '@/systems/unit-system';
import { resolveCityInteraction } from '@/systems/city-interaction';
import { beginMajorCityAssault } from '@/systems/city-capture-system';
import { canUnitAttackTarget } from '@/systems/attack-targeting';

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

  // Action-state gates. beginMajorCityAssault rejects both of these outright, so the
  // resolver must not offer a capture the executor will refuse. The parity matrix below
  // uses fresh units and did NOT catch this -- these are the explicit cases.
  it('denies capture to a unit that has already acted this turn', () => {
    const { state, unit } = scenario({ attackerType: 'warrior', attackerPos: { q: 2, r: 0 } });
    state.units.atk = { ...unit, hasActed: true };
    const { available, denied } = kinds(state, state.units.atk);

    expect(available).toEqual([]);
    expect(denied.capture).toBe('This unit has already acted this turn.');
    expect(beginMajorCityAssault(state, 'atk', 'target', { actor: 'player', civId: 'player' }).ok).toBe(false);
  });

  it('denies capture to a unit with no movement left', () => {
    const { state, unit } = scenario({ attackerType: 'warrior', attackerPos: { q: 2, r: 0 } });
    state.units.atk = { ...unit, movementPointsLeft: 0 };

    expect(kinds(state, state.units.atk).denied.capture).toBe('This unit has already acted this turn.');
  });

  it('denies capture to a unit that already captured a city this turn', () => {
    const { state, unit } = scenario({ attackerType: 'warrior', attackerPos: { q: 2, r: 0 } });
    state.units.atk = { ...unit, hasCapturedCityThisTurn: true };
    const { available, denied } = kinds(state, state.units.atk);

    expect(available).toEqual([]);
    expect(denied.capture).toBe('This unit has already captured a city this turn.');
    expect(beginMajorCityAssault(state, 'atk', 'target', { actor: 'player', civId: 'player' }).ok).toBe(false);
  });

  // Minor civs have no `techState` and no Civilization record at all, so the resolver must
  // handle them rather than throw -- that missing record is exactly why bombardment would
  // have silently no-opped against a city-state.
  describe('minor-civ (city-state) cities', () => {
    function minorCivScenario(attackerType: UnitType, attackerPos: { q: number; r: number }) {
      const built = scenario({ attackerType, attackerPos, cityOwner: 'mc-warriors' });
      built.state.civilizations.player.diplomacy.atWarWith = ['mc-warriors'];
      return built;
    }

    it('does not throw on a city with no Civilization record', () => {
      const { state, unit } = minorCivScenario('warrior', { q: 2, r: 0 });
      expect(() => kinds(state, unit)).not.toThrow();
    });

    // beginMajorCityAssault rejects a minor-civ city with 'not-major-city' -- city-states are
    // taken through executeMinorCivConquest. Offering capture would be a preview the executor
    // refuses, so parity requires denying it here.
    it('denies capture and points at the dedicated city-state flow', () => {
      const { state, unit } = minorCivScenario('warrior', { q: 2, r: 0 });
      const { available, denied } = kinds(state, unit);

      expect(available).not.toContain('capture');
      expect(denied.capture).toBe('Use the city-state conquest action for this city.');
      expect(beginMajorCityAssault(state, 'atk', 'target', { actor: 'player', civId: 'player' }).ok).toBe(false);
    });

    it('still allows bombarding a city-state, which has no separate executor', () => {
      const { state, unit } = minorCivScenario('catapult', { q: 1, r: 0 });
      expect(kinds(state, unit).available).toContain('bombard');
    });
  });

  it('keys legality off the acting unit\'s owner, not state.currentPlayer (hot seat)', () => {
    const { state, unit } = scenario({ attackerType: 'warrior', attackerPos: { q: 2, r: 0 } });
    const asPlayerSeat = kinds(state, unit).available;
    state.currentPlayer = 'ai-1';

    expect(kinds(state, unit).available).toEqual(asPlayerSeat);
  });

  // #974 phase 2: the bombard action. This is what #966 actually asked for -- a ranged unit
  // that can attack a city from where it stands.
  describe('bombard', () => {
    it('offers bombard to a siege unit standing off at range', () => {
      const { state, unit } = scenario({ attackerType: 'catapult', attackerPos: { q: 1, r: 0 } });
      expect(kinds(state, unit).available).toContain('bombard');
    });

    it('offers bombard to an archer -- the original #966 report', () => {
      const { state, unit } = scenario({ attackerType: 'archer', attackerPos: { q: 1, r: 0 } });
      expect(kinds(state, unit).available).toContain('bombard');
    });

    it('offers bombard THROUGH a garrison, alongside attacking the defender', () => {
      const { state, unit } = scenario({
        attackerType: 'catapult', attackerPos: { q: 1, r: 0 }, garrison: 'spearman',
      });
      expect(kinds(state, unit).available).toEqual(['attack-defender', 'bombard']);
    });

    it('labels bombard with the damage it will actually deal', () => {
      const { state, unit } = scenario({ attackerType: 'catapult', attackerPos: { q: 1, r: 0 } });
      const action = kinds(state, unit).result.available.find(a => a.kind === 'bombard');
      if (action?.kind !== 'bombard') throw new Error('expected a bombard action');

      expect(action.label).toBe(`Attack the city — −${action.hpLoss} HP`);
      expect(action.hpLoss).toBeGreaterThan(0);
    });

    it('never offers bombard to a melee unit', () => {
      const { state, unit } = scenario({ attackerType: 'warrior', attackerPos: { q: 2, r: 0 } });
      expect(kinds(state, unit).available).not.toContain('bombard');
    });

    it('says nothing about bombarding to a melee unit, rather than adding noise', () => {
      const { state, unit } = scenario({ attackerType: 'warrior', attackerPos: { q: 2, r: 0 } });
      expect(kinds(state, unit).denied.bombard).toBeUndefined();
    });

    it('tells an out-of-range siege unit to move closer', () => {
      const { state, unit } = scenario({ attackerType: 'catapult', attackerPos: { q: 0, r: 0 } });
      expect(kinds(state, unit).denied.bombard).toBe('Move closer to attack this city.');
    });

    it('names the cap as the cause when this city is already fully shelled this turn', () => {
      const { state, unit } = scenario({ attackerType: 'catapult', attackerPos: { q: 1, r: 0 } });
      state.cities.target = { ...state.cities.target, bombardment: { turn: state.turn, hpLostThisTurn: 999 } };

      expect(kinds(state, unit).available).not.toContain('bombard');
      expect(kinds(state, unit).denied.bombard).toBe('This city has taken all the bombardment it can this turn.');
    });

    it('names fortifications as the cause when they absorb the shot entirely', () => {
      const { state, unit } = scenario({ attackerType: 'archer', attackerPos: { q: 1, r: 0 } });
      state.cities.target = { ...state.cities.target, buildings: ['walls', 'star_fort'] };
      state.civilizations['ai-1'].techState.completed = ['fortification-engineering'];

      expect(kinds(state, unit).available).not.toContain('bombard');
      expect(kinds(state, unit).denied.bombard).toBe("This city's fortifications absorb your bombardment.");
    });

    it('does not offer bombard against a city you are not at war with', () => {
      const { state, unit } = scenario({ attackerType: 'catapult', attackerPos: { q: 1, r: 0 }, atWar: false });
      expect(kinds(state, unit).available).not.toContain('bombard');
    });
  });
});

// The whole point of a single resolver: anything it offers must actually execute. A
// divergence between what the UI shows and what the executor accepts is the defect class
// behind both #965 and #966, so this walks a matrix rather than a single fixture.
describe('#966 preview/execution parity', () => {
  const matrix: Array<{
    attackerType: UnitType;
    attackerPos: { q: number; r: number };
    garrison?: UnitType;
    exhausted?: boolean;
    alreadyCaptured?: boolean;
  }> = [
    { attackerType: 'warrior', attackerPos: { q: 2, r: 0 } },
    { attackerType: 'archer', attackerPos: { q: 2, r: 0 } },
    { attackerType: 'catapult', attackerPos: { q: 2, r: 0 } },
    { attackerType: 'archer', attackerPos: { q: 1, r: 0 } },
    { attackerType: 'catapult', attackerPos: { q: 1, r: 0 } },
    { attackerType: 'settler', attackerPos: { q: 2, r: 0 } },
    { attackerType: 'frigate', attackerPos: { q: 2, r: 0 } },
    { attackerType: 'warrior', attackerPos: { q: 2, r: 0 }, garrison: 'spearman' },
    { attackerType: 'archer', attackerPos: { q: 1, r: 0 }, garrison: 'spearman' },
    { attackerType: 'warrior', attackerPos: { q: 2, r: 0 }, exhausted: true },
    { attackerType: 'warrior', attackerPos: { q: 2, r: 0 }, alreadyCaptured: true },
  ];

  for (const entry of matrix) {
    const label = `${entry.attackerType}@${entry.attackerPos.q},${entry.attackerPos.r}`
      + `${entry.garrison ? ' vs garrison' : ''}${entry.exhausted ? ' exhausted' : ''}`
      + `${entry.alreadyCaptured ? ' already-captured' : ''}`;

    const build = () => {
      const built = scenario(entry);
      if (entry.exhausted) built.state.units.atk = { ...built.unit, hasActed: true };
      if (entry.alreadyCaptured) built.state.units.atk = { ...built.unit, hasCapturedCityThisTurn: true };
      return { state: built.state, unit: built.state.units.atk };
    };

    it(`every offered action executes: ${label}`, () => {
      const { state, unit } = build();
      const interaction = resolveCityInteraction(state, unit, state.cities.target);

      for (const action of interaction.available) {
        if (action.kind === 'capture') {
          const result = beginMajorCityAssault(
            structuredClone(state), 'atk', 'target', { actor: 'player', civId: 'player' },
          );
          expect(result.ok, `capture offered for ${label} but executor said ${result.ok ? '' : result.reason}`).toBe(true);
        }
        if (action.kind === 'attack-defender') {
          const legality = canUnitAttackTarget(state, unit, state.cities.target.position, { viewerId: 'player' });
          expect(legality.ok, `attack-defender offered for ${label} but targeting refused it`).toBe(true);
        }
      }
    });

    it(`never withholds an executable capture: ${label}`, () => {
      const { state, unit } = build();
      const interaction = resolveCityInteraction(state, unit, state.cities.target);
      const offered = interaction.available.some(a => a.kind === 'capture');
      const executorAccepts = beginMajorCityAssault(
        structuredClone(state), 'atk', 'target', { actor: 'player', civId: 'player' },
      ).ok;

      expect(offered, `resolver/executor disagree for ${label}`).toBe(executorAccepts);
    });
  }
});
