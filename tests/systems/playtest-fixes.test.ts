import { describe, it, expect, beforeEach } from 'vitest';
import {
  createUnit, resetUnitId, resetUnitTurn, healUnit, restUnit, canHeal,
  getUnmovedUnits, HEAL_PASSIVE, HEAL_RESTING, HEAL_IN_CITY, HEAL_IN_TERRITORY,
} from '@/systems/unit-system';
import { resolveCombat } from '@/systems/combat-system';
import { buildCouncilAgenda } from '@/systems/council-system';
import { createNewGame } from '@/core/game-state';
import { foundCity } from '@/systems/city-system';
import type { NotificationEntry, GameMap, HexTile } from '@/core/types';

// --- Combat balance helpers ---
const makePlainsTile = (q: number, r: number): HexTile => ({
  coord: { q, r }, terrain: 'plains', elevation: 'flat' as any,
  resource: null, improvement: 'none', improvementTurnsLeft: 0,
  owner: null, hasRiver: false, wonder: null,
});

const makeMap = (): GameMap => ({
  width: 10, height: 10, wrapsHorizontally: false, rivers: [],
  tiles: { '1,0': makePlainsTile(1, 0) },
});

// --- Healing tests (#15) ---

describe('unit healing (#15)', () => {
  beforeEach(() => resetUnitId());

  it('canHeal returns false at full health', () => {
    const u = createUnit('warrior', 'player', { q: 0, r: 0 });
    expect(u.health).toBe(100);
    expect(canHeal(u)).toBe(false);
  });

  it('canHeal returns true when damaged', () => {
    const u = { ...createUnit('warrior', 'player', { q: 0, r: 0 }), health: 70 };
    expect(canHeal(u)).toBe(true);
  });

  it('passive heal when idle (no move, no act)', () => {
    const u = { ...createUnit('warrior', 'player', { q: 0, r: 0 }), health: 60 };
    const healed = healUnit(u, false, false);
    expect(healed.health).toBe(60 + HEAL_PASSIVE);
  });

  it('resting heal is higher than passive', () => {
    const u = { ...createUnit('warrior', 'player', { q: 0, r: 0 }), health: 50, isResting: true };
    const healed = healUnit(u, false, false);
    expect(healed.health).toBe(50 + HEAL_RESTING);
    expect(HEAL_RESTING).toBeGreaterThan(HEAL_PASSIVE);
  });

  it('city heal is highest', () => {
    const u = { ...createUnit('warrior', 'player', { q: 0, r: 0 }), health: 50 };
    const healed = healUnit(u, true, false);
    expect(healed.health).toBe(50 + HEAL_IN_CITY);
    expect(HEAL_IN_CITY).toBeGreaterThan(HEAL_RESTING);
  });

  it('territory heal when in friendly territory but not city', () => {
    const u = { ...createUnit('warrior', 'player', { q: 0, r: 0 }), health: 60 };
    const healed = healUnit(u, false, true);
    expect(healed.health).toBe(60 + HEAL_IN_TERRITORY);
  });

  it('no heal when moved and not resting', () => {
    const u = { ...createUnit('warrior', 'player', { q: 0, r: 0 }), health: 60, hasMoved: true };
    const healed = healUnit(u, false, false);
    expect(healed.health).toBe(60); // no change
  });

  it('heal caps at 100', () => {
    const u = { ...createUnit('warrior', 'player', { q: 0, r: 0 }), health: 98 };
    const healed = healUnit(u, true, false);
    expect(healed.health).toBe(100);
  });

  it('restUnit sets isResting and blocks movement', () => {
    const u = createUnit('warrior', 'player', { q: 0, r: 0 });
    const resting = restUnit(u);
    expect(resting.isResting).toBe(true);
    expect(resting.hasActed).toBe(true);
    expect(resting.movementPointsLeft).toBe(0);
  });

  it('resetUnitTurn clears isResting', () => {
    const u = { ...createUnit('warrior', 'player', { q: 0, r: 0 }), isResting: true };
    const reset = resetUnitTurn(u);
    expect(reset.isResting).toBe(false);
  });

  it('worker can also rest (gets hurt by illness)', () => {
    const u = { ...createUnit('worker', 'player', { q: 0, r: 0 }), health: 60 };
    const resting = restUnit(u);
    expect(resting.isResting).toBe(true);
  });
});

// --- Stone Age combat balance tests (#14) ---

describe('stone age combat balance (#14)', () => {
  beforeEach(() => resetUnitId());

  it('stone age warrior vs warrior resolves in 2-4 hits on average', () => {
    let totalHitsToKill = 0;
    const trials = 30;

    for (let i = 0; i < trials; i++) {
      const attacker = createUnit('warrior', 'player', { q: 0, r: 0 });
      const defender = createUnit('warrior', 'ai-1', { q: 1, r: 0 });
      let hp = 100;
      let hits = 0;
      while (hp > 0 && hits < 10) {
        const result = resolveCombat(
          { ...attacker, health: 100 },
          { ...defender, health: hp },
          makeMap(),
          i * 1000 + hits,
          undefined,
          0, // Stone Age era
        );
        hp -= result.defenderDamage;
        hits++;
      }
      totalHitsToKill += hits;
    }

    const avgHits = totalHitsToKill / trials;
    expect(avgHits).toBeGreaterThanOrEqual(2);
    expect(avgHits).toBeLessThanOrEqual(4);
  });

  it('stone age combat deals more damage than later eras (same seed)', () => {
    const attacker = createUnit('warrior', 'player', { q: 0, r: 0 });
    const defender = createUnit('warrior', 'ai-1', { q: 1, r: 0 });
    const stoneResult = resolveCombat(attacker, defender, makeMap(), 42, undefined, 0);
    const ironResult = resolveCombat(attacker, defender, makeMap(), 42, undefined, 3);
    expect(stoneResult.defenderDamage).toBeGreaterThan(ironResult.defenderDamage);
  });

  it('default era (undefined) uses normal scale', () => {
    const attacker = createUnit('warrior', 'player', { q: 0, r: 0 });
    const defender = createUnit('warrior', 'ai-1', { q: 1, r: 0 });
    const defaultResult = resolveCombat(attacker, defender, makeMap(), 42);
    const era3Result = resolveCombat(attacker, defender, makeMap(), 42, undefined, 3);
    expect(defaultResult.defenderDamage).toBe(era3Result.defenderDamage);
  });
});

// --- Unit cycling tests (#25) ---

describe('unit cycling (#25)', () => {
  beforeEach(() => resetUnitId());

  it('getUnmovedUnits returns units that have not moved or acted', () => {
    const u1 = createUnit('warrior', 'player', { q: 0, r: 0 });
    const u2 = { ...createUnit('archer', 'player', { q: 1, r: 0 }), hasMoved: true };
    const u3 = { ...createUnit('scout', 'player', { q: 2, r: 0 }), hasActed: true };
    const units = { [u1.id]: u1, [u2.id]: u2, [u3.id]: u3 };
    const unmoved = getUnmovedUnits(units, 'player');
    expect(unmoved).toHaveLength(1);
    expect(unmoved[0].id).toBe(u1.id);
  });

  it('getUnmovedUnits excludes other players', () => {
    const u1 = createUnit('warrior', 'player', { q: 0, r: 0 });
    const u2 = createUnit('warrior', 'ai-1', { q: 1, r: 0 });
    const units = { [u1.id]: u1, [u2.id]: u2 };
    const unmoved = getUnmovedUnits(units, 'player');
    expect(unmoved).toHaveLength(1);
    expect(unmoved[0].owner).toBe('player');
  });

  it('getUnmovedUnits returns empty when all have moved', () => {
    const u1 = { ...createUnit('warrior', 'player', { q: 0, r: 0 }), hasMoved: true };
    const u2 = { ...createUnit('archer', 'player', { q: 1, r: 0 }), hasActed: true };
    const units = { [u1.id]: u1, [u2.id]: u2 };
    expect(getUnmovedUnits(units, 'player')).toHaveLength(0);
  });
});

// --- Notification type tests (#20) ---

describe('notification queue (#20)', () => {
  it('NotificationEntry type has required fields', () => {
    const entry: NotificationEntry = { message: 'test', type: 'info', turn: 1 };
    expect(entry.message).toBe('test');
    expect(entry.type).toBe('info');
    expect(entry.turn).toBe(1);
  });

  it('NotificationEntry accepts all type values', () => {
    const info: NotificationEntry = { message: 'a', type: 'info', turn: 1 };
    const success: NotificationEntry = { message: 'b', type: 'success', turn: 2 };
    const warning: NotificationEntry = { message: 'c', type: 'warning', turn: 3 };
    expect(info.type).toBe('info');
    expect(success.type).toBe('success');
    expect(warning.type).toBe('warning');
  });
});

describe('slice 2 council guidance', () => {
  it('does not strand a starving city without an obvious food recommendation', () => {
    const state = createNewGame({
      civType: 'generic',
      mapSize: 'small',
      opponentCount: 1,
      gameTitle: 'Hungry City',
      seed: 'hungry-city',
    });
    const settlerId = state.civilizations.player.units.find(id => state.units[id]?.type === 'settler');
    const settler = settlerId ? state.units[settlerId] : undefined;
    if (!settler) {
      return;
    }

    const city = foundCity('player', settler.position, state.map);
    state.cities[city.id] = city;
    state.civilizations.player.cities.push(city.id);

    state.cities[city.id].food = 0;
    state.cities[city.id].population = 4;
    state.cities[city.id].buildings = [];
    for (const coord of state.cities[city.id].ownedTiles) {
      const key = `${coord.q},${coord.r}`;
      if (state.map.tiles[key]) {
        state.map.tiles[key].terrain = 'desert';
        state.map.tiles[key].improvement = 'none';
        state.map.tiles[key].improvementTurnsLeft = 0;
      }
    }

    const council = buildCouncilAgenda(state, 'player');
    const serialized = JSON.stringify(council).toLowerCase();

    expect(serialized).toContain('food');
  });
});
