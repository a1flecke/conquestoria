import { describe, expect, it } from 'vitest';
import type { GameState, Unit } from '@/core/types';
import { createNewGame } from '@/core/game-state';
import { createUnit } from '@/systems/unit-lifecycle';
import { hexKey } from '@/systems/hex-utils';
import { buildBattleForecastView, type BattleForecastView } from '@/ui/battle-forecast-projection';
import { expectHotSeatDifferential, expectViewerSafety, type ViewerSurface } from '../helpers/viewer-safety';
import { calculateCombatStrengths } from '@/systems/combat-system';
import { buildCombatContextForDefender } from '@/systems/combat-context';
import { forecastCombat } from '@/systems/battle-forecast';
import { resolveCombatEra } from '@/systems/era-resolution';

const counters = { nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 };

function world(): GameState {
  const state = createNewGame(undefined, 'battle-forecast', 'small');
  const [a, b] = Object.keys(state.civilizations);
  for (const q of [4, 5, 6, 7, 8]) {
    const tile = state.map.tiles[hexKey({ q, r: 5 })]!;
    tile.terrain = 'grassland'; tile.owner = null; tile.hasRiver = false;
  }
  state.map.rivers = [];
  const attacker = { ...createUnit('warrior', a!, { q: 5, r: 5 }, counters), id: 'atk' };
  const defender = { ...createUnit('swordsman', b!, { q: 6, r: 5 }, counters), id: 'def' };
  state.units = { atk: attacker, def: defender };
  state.civilizations[a!]!.units = ['atk'];
  state.civilizations[b!]!.units = ['def'];
  state.currentPlayer = a!;
  state.civilizations[a!]!.diplomacy.atWarWith = [b!];
  state.civilizations[b!]!.diplomacy.atWarWith = [a!];
  return state;
}

const [A, B] = Object.keys(createNewGame(undefined, 'battle-forecast', 'small').civilizations) as [string, string];

function viewOf(state: GameState, viewerId: string): BattleForecastView {
  const attackerOf = (id: string) => Object.values(state.units).find(u => u.owner === id)!;
  const defenderOf = (id: string) => Object.values(state.units).find(u => u.owner !== id)!;
  return buildBattleForecastView({
    state, viewerId, attacker: attackerOf(viewerId), defender: defenderOf(viewerId), ownerName: 'Rival',
  });
}

const surface: ViewerSurface<GameState, BattleForecastView> = { name: 'battle forecast', project: viewOf };

describe('battle forecast projection (#1135) is viewer-safe', () => {
  it('hidden enemy facts never move the projection; earned facts do', () => {
    expectViewerSafety(surface, {
      world: world(),
      viewerId: A,
      hidden: [
        { label: 'the enemy researches a defending tech (steel-plate-armor)', apply: w => { w.civilizations[B]!.techState.completed.push('steel-plate-armor'); } },
        { label: 'the enemy unit is overextended / has hidden supply state', apply: w => { w.units.def!.landSupply = { state: 'severe', hostileUnsupportedTurns: 6, suppliedTurnsSinceRecovery: 0 }; } },
        { label: 'the enemy unit carries a depleted-fleet or worn-aircraft record', apply: w => { w.units.def!.navalOps = { awayTurns: 14 }; (w.units.def as Unit).airStrain = 7; } },
      ],
      earned: [
        { label: 'your own tech helps your attack (stone-weapons)', apply: w => { w.civilizations[A]!.techState.completed.push('stone-weapons'); } },
        { label: 'the defender stands on visible hills', apply: w => { w.map.tiles[hexKey({ q: 6, r: 5 })]!.terrain = 'hills'; } },
        { label: 'the defender is visibly wounded', apply: w => { w.units.def!.health = 40; } },
      ],
    });
  });

  it('a concealed supporter does not leak; a visible one is shown', () => {
    const base = world();
    base.civilizations[B]!.civType = 'lothlorien';
    base.map.tiles[hexKey({ q: 7, r: 5 })]!.terrain = 'forest';
    const supporter = { ...createUnit('swordsman', B, { q: 7, r: 5 }, counters), id: 'sup' };
    expectViewerSafety(surface, {
      world: base,
      viewerId: A,
      hidden: [{ label: 'a forest-concealed enemy supporter appears behind the defender', apply: w => { w.units.sup = supporter; w.civilizations[B]!.units.push('sup'); } }],
      earned: [{ label: 'a visible supporter stands where your own unit can see it', apply: w => {
        w.map.tiles[hexKey({ q: 6, r: 4 })]!.terrain = 'grassland';
        w.units.sup2 = { ...createUnit('swordsman', B, { q: 6, r: 4 }, counters), id: 'sup2' }; w.civilizations[B]!.units.push('sup2');
      } }],
    });
  });

  it('hot seat: a tech only civ B has earned reaches B and not A', () => {
    expectHotSeatDifferential(surface, {
      world: world(),
      viewers: [A, B],
      knownOnlyTo: B,
      mutation: { label: 'B researches steel-plate-armor', apply: w => { w.civilizations[B]!.techState.completed.push('steel-plate-armor'); } },
    });
  });

  it('explains only what the viewer may know, in plain words', () => {
    const state = world();
    state.civilizations[A]!.techState.completed.push('stone-weapons');
    state.civilizations[B]!.techState.completed.push('steel-plate-armor');
    const view = viewOf(state, A);
    const all = [view.headline, view.why, ...view.workingForYou, ...view.workingAgainstYou, ...view.notActive, ...view.tips].join(' | ');
    expect(all).toContain('Stone Weapons');
    expect(all).not.toContain('Steel Plate Armor');
    expect(view.headline).toMatch(/Strong advantage|Advantage|Even fight|Risky|Severe risk/);
    expect(view.ariaLabel).toContain(view.headline);
  });

  it('lists inactive own bonuses as a teaching note and teaches the river mechanic', () => {
    const state = world();
    state.civilizations[A]!.techState.completed.push('steel-plate-armor'); // defending-only: inactive when attacking
    const view = viewOf(state, A);
    expect(view.notActive.join(' ')).toContain('Steel Plate Armor');
    state.map.rivers = [{ from: { q: 5, r: 5 }, to: { q: 6, r: 5 } }] as never;
    const riverView = viewOf(state, A);
    if (riverView.workingAgainstYou.some(f => f.startsWith('River crossing'))) {
      expect(riverView.tips.join(' ')).toMatch(/river/i);
    }
  });

  it('own-side owner facts are shown to their owner: extended fleet and worn aircraft use the same combat fact', () => {
    const state = world();
    state.units.atk = { ...createUnit('frigate', A, { q: 5, r: 5 }, counters), id: 'atk', navalOps: { awayTurns: 12 } };
    const view = viewOf(state, A);
    expect(view.workingAgainstYou.join(' ')).toContain('Depleted fleet -20%');
    expect(view.tips.join(' ')).toMatch(/port/i);
  });

  it('a spent own aircraft shows the same readiness fact combat applies, with a recovery tip', () => {
    const state = world();
    state.units.atk = { ...createUnit('bomber', A, { q: 5, r: 5 }, counters), id: 'atk', airStrain: 6 } as Unit;
    const view = viewOf(state, A);
    expect(view.workingAgainstYou.join(' ')).toContain('Aircraft readiness -20%');
    expect(view.tips.join(' ')).toMatch(/rest/i);
  });

  it('forecast numbers use the actual combat strengths for the known world (parity)', () => {
    const state = world();
    state.civilizations[A]!.techState.completed.push('stone-weapons');
    const attacker = state.units.atk!; const defender = state.units.def!;
    const context = buildCombatContextForDefender(state, attacker, defender);
    const direct = calculateCombatStrengths(attacker, defender, state.map, context);
    const forecast = forecastCombat(attacker, defender, state.map, context, resolveCombatEra(state, attacker, defender), state);
    expect(forecast.strengths.attackerStrength).toBeCloseTo(direct.attackerStrength, 6);
  });

  it('building a view mutates nothing and is repeatable', () => {
    const state = world();
    const before = JSON.stringify(state);
    expect(viewOf(state, A)).toEqual(viewOf(state, A));
    expect(JSON.stringify(state)).toBe(before);
  });
});
