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

// ───────────────────────── #1213 — air-strike forecast ─────────────────────────
import { buildAirStrikeForecastView, airForecastSignature } from '@/ui/air-strike-forecast-projection';
import { resolveAirStrike } from '@/systems/air-operations-system';

function airWorld(opts: { target?: 'unit' | 'city'; visibleInterceptor?: boolean; garrison?: boolean; fighter?: boolean } = {}): GameState {
  const { target = 'unit', visibleInterceptor = false, garrison = false, fighter = true } = opts;
  const air = (id: string, type: Unit['type'], owner: string, pos: { q: number; r: number }, extra: Partial<Unit> = {}): Unit => ({
    id, type, owner, position: pos, movementPointsLeft: 4, health: 100, experience: 0,
    hasMoved: false, hasActed: false, isResting: false, ...extra,
  });
  const units: Record<string, Unit> = {
    striker: air('striker', 'bomber', 'player', { q: 2, r: 2 }, { airBase: { kind: 'city', cityId: 'city-1' } }),
  };
  if (target === 'unit') units.target = air('target', 'warrior', 'enemy', { q: 5, r: 2 });
  if (garrison) units.garrison = air('garrison', 'warrior', 'enemy', { q: 5, r: 2 });
  // an enemy fighter on an intercept stance, based at an enemy airfield within range of the target
  if (fighter) units.fighter = air('fighter', 'jet_fighter', 'enemy', { q: 4, r: 2 }, { airBase: { kind: 'city', cityId: 'enemy-base' }, airMission: 'intercept' });
  const tiles: Record<string, 'visible'> = { '5,2': 'visible', '2,2': 'visible' };
  if (visibleInterceptor) tiles['4,2'] = 'visible';
  return {
    gameId: 'air-forecast', turn: 9, currentPlayer: 'player',
    map: { width: 10, height: 10, wrapsHorizontally: false, tiles: {}, rivers: [] },
    units,
    cities: {
      'city-1': { id: 'city-1', name: 'Home', owner: 'player', position: { q: 2, r: 2 }, buildings: ['airfield'], hp: 100 },
      'enemy-base': { id: 'enemy-base', name: 'Base', owner: 'enemy', position: { q: 4, r: 2 }, buildings: ['airfield'], hp: 100 },
      ...(target === 'city' ? { 'enemy-city': { id: 'enemy-city', name: 'Rome', owner: 'enemy', position: { q: 5, r: 2 }, buildings: [], hp: 100 } } : {}),
    },
    civilizations: {
      player: { id: 'player', name: 'Player', units: ['striker'], cities: ['city-1'], techState: { completed: [] }, visibility: { tiles, lastSeen: {} }, diplomacy: { atWarWith: ['enemy'], events: [] } },
      enemy: { id: 'enemy', name: 'Enemy', units: Object.keys(units).filter(id => id !== 'striker'), cities: ['enemy-base', ...(target === 'city' ? ['enemy-city'] : [])], techState: { completed: [] }, diplomacy: { atWarWith: ['player'], events: [] } },
    },
    minorCivs: {},
  } as unknown as GameState;
}

function airView(state: GameState, viewerId = 'player'): BattleForecastView {
  const result = buildAirStrikeForecastView({ state, viewerId, unitId: 'striker', target: { q: 5, r: 2 }, ownerName: 'Enemy' });
  if (!result.ok) throw new Error(result.message);
  return result.view;
}

const airSurface: ViewerSurface<GameState, BattleForecastView> = { name: 'air strike forecast', project: airView };

describe('air-strike forecast (#1213)', () => {
  it('forecasts a unit-target strike with no interception block when no capable aircraft is visible', () => {
    const view = airView(airWorld());
    expect(view.ariaLabel).toContain('Air strike preview');
    expect(view.interception).toBeUndefined();
    expect(view.them.name).toBe('Warrior');
  });

  it('shows a truthful two-stage conditional when a capable hostile fighter is visible in range', () => {
    const view = airView(airWorld({ visibleInterceptor: true }));
    expect(view.interception).toBeDefined();
    expect(view.interception!.headline).toContain('Jet Fighter');
    const text = view.interception!.lines.join(' ');
    expect(text).toMatch(/shot down before it reaches the target: \d+%/);
    expect(text).toMatch(/after interception, against \d+ HP if nothing intercepts/);
  });

  it('a hidden fighter, hidden base, hidden stance/readiness/tech or hidden air defence never moves the forecast', () => {
    for (const visibleInterceptor of [false, true]) {
      expectViewerSafety(airSurface, {
        world: airWorld({ visibleInterceptor }),
        viewerId: 'player',
        hidden: [
          { label: 'the enemy researches a tech', apply: w => { w.civilizations.enemy!.techState.completed.push('radar'); } },
          { label: 'an unseen enemy SAM-style building appears at the enemy base', apply: w => { w.cities['enemy-base']!.buildings.push('sam_site'); } },
          { label: 'the enemy fighter\'s intercept stance, strain and spent-this-turn marker change', apply: w => {
            const f = w.units.fighter as Unit; f.airStrain = 7; f.interceptedTurn = w.turn; f.airMission = undefined;
          } },
          { label: 'a second unseen enemy fighter on stance at another unseen base', apply: w => {
            w.units.fighter2 = { ...(w.units.fighter as Unit), id: 'fighter2', position: { q: 5, r: 3 } };
            w.civilizations.enemy!.units.push('fighter2');
          } },
        ],
        earned: visibleInterceptor
          ? [{ label: 'the visible fighter is visibly wounded', apply: w => { w.units.fighter!.health = 30; } }]
          : [{ label: 'the enemy fighter comes into view', apply: w => { (w.civilizations.player!.visibility!.tiles as Record<string, string>)['4,2'] = 'visible'; } }],
      });
    }
  });

  it('own readiness is shown to its owner, and a spent aircraft gets the typed denial instead of a forecast', () => {
    const worn = airWorld(); (worn.units.striker as Unit).airStrain = 4;
    const wornView = airView(worn);
    expect([...wornView.workingAgainstYou, ...wornView.workingForYou].join(' ')).toMatch(/[Rr]eadiness|[Ww]orn/);
    const spent = airWorld(); (spent.units.striker as Unit).airStrain = 7;
    const denied = buildAirStrikeForecastView({ state: spent, viewerId: 'player', unitId: 'striker', target: { q: 5, r: 2 }, ownerName: 'Enemy' });
    expect(denied.ok).toBe(false);
    expect(!denied.ok && denied.message.length).toBeGreaterThan(5);
  });

  it('is pure: nothing mutates, repeated builds agree, no interceptor/readiness marker moves', () => {
    const state = airWorld({ visibleInterceptor: true });
    const before = JSON.stringify(state);
    const first = airView(state);
    const second = airView(state);
    expect(JSON.stringify(state)).toBe(before);
    expect(second).toEqual(first);
    expect((state.units.fighter as Unit).interceptedTurn).toBeUndefined();
    expect((state.units.striker as Unit).airStrain).toBeUndefined();
    expect(state.units.striker!.hasActed).toBe(false);
  });

  it('refuses a target that is not a legal strike target, and a foreign viewer', () => {
    const state = airWorld();
    expect(buildAirStrikeForecastView({ state, viewerId: 'player', unitId: 'striker', target: { q: 9, r: 9 }, ownerName: 'x' }).ok).toBe(false);
    expect(buildAirStrikeForecastView({ state, viewerId: 'enemy', unitId: 'striker', target: { q: 5, r: 2 }, ownerName: 'x' }).ok).toBe(false);
  });

  it('city target: the forecast loss matches the real strike (parity) and is hedged about destruction', () => {
    const state = airWorld({ target: 'city', fighter: false });
    const view = airView(state);
    const real = resolveAirStrike(state, 'striker', { q: 5, r: 2 });
    expect(real.ok).toBe(true);
    const realLoss = 100 - real.state.cities['enemy-city']!.hp!;
    expect(view.them.damage.expected).toBe(realLoss);
    expect(view.them.name).toBe('Rome');
    expect(view.headline).toContain('never captures');
  });

  it('city target: a visible garrison blocks the strike and the card says so; an unseen owner tech changes nothing', () => {
    const view = airView(airWorld({ target: 'city', garrison: true }));
    expect(view.them.damage.expected).toBe(0);
    expect(view.headline).toContain('garrison');
    expectViewerSafety(airSurface, {
      world: airWorld({ target: 'city' }),
      viewerId: 'player',
      hidden: [{ label: 'the city owner researches a defensive tech', apply: w => { w.civilizations.enemy!.techState.completed.push('steel-plate-armor'); w.civilizations.enemy!.techState.completed.push('gunpowder'); } }],
      earned: [{ label: 'the city is visibly wounded', apply: w => { w.cities['enemy-city']!.hp = 40; } }],
    });
  });

  it('hot seat: each seat forecasts its own strike; a fact only one seat has earned reaches that seat alone', () => {
    const shared = airWorld({ fighter: false });
    shared.units.estriker = {
      id: 'estriker', type: 'bomber', owner: 'enemy', position: { q: 4, r: 2 }, movementPointsLeft: 4, health: 100, experience: 0,
      hasMoved: false, hasActed: false, isResting: false, airBase: { kind: 'city', cityId: 'enemy-base' },
    } as Unit;
    shared.units.ptarget = { ...(shared.units.target as Unit), id: 'ptarget', owner: 'player', position: { q: 1, r: 2 } };
    shared.civilizations.enemy!.units.push('estriker');
    shared.civilizations.player!.units.push('ptarget');
    (shared.civilizations.player!.visibility!.tiles as Record<string, string>)['1,2'] = 'visible';
    shared.civilizations.enemy!.visibility = { tiles: { '1,2': 'visible', '4,2': 'visible' }, lastSeen: {} } as never;
    const seatSurface: ViewerSurface<GameState, BattleForecastView> = {
      name: 'air strike forecast (seat)',
      project: (state, viewer) => {
        const mine = viewer === 'player'
          ? { unitId: 'striker', target: { q: 5, r: 2 } }
          : { unitId: 'estriker', target: { q: 1, r: 2 } };
        const result = buildAirStrikeForecastView({ state, viewerId: viewer, ...mine, ownerName: 'Rival' });
        if (!result.ok) throw new Error(result.message);
        return result.view;
      },
    };
    expectHotSeatDifferential(seatSurface, {
      world: shared,
      viewers: ['enemy', 'player'] as const,
      knownOnlyTo: 'player',
      mutation: { label: 'the player\'s own striker is worn (only its owner reads its readiness)', apply: w => { (w.units.striker as Unit).airStrain = 4; } },
    });
  });

  it('the signature changes when the live forecast changes (stale-confirm guard) and not otherwise', () => {
    const a = airWorld({ visibleInterceptor: true });
    const b = airWorld({ visibleInterceptor: true });
    expect(airForecastSignature(airView(a))).toBe(airForecastSignature(airView(b)));
    (b.units.fighter as Unit).health = 20;
    expect(airForecastSignature(airView(b))).not.toBe(airForecastSignature(airView(a)));
  });
});
