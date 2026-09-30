import { describe, expect, it } from 'vitest';
import { EventBus } from '@/core/event-bus';
import { createNewGame } from '@/core/game-state';
import type { CombatResult, GameState, HexCoord, Unit } from '@/core/types';
import { applyCombatOutcomeToState } from '@/systems/combat-reward-system';
import { createUnit } from '@/systems/unit-lifecycle';
import { getOwnedUnitCount, getOwnedUnits } from '@/systems/unit-ownership';
import { removePlayerUnitFromState } from '@/systems/unit-lifecycle-system';
import { eliminateCivilization } from '@/systems/civilization-elimination-system';
import {
  conquestMinorCiv,
  peacefullyAbsorbMinorCiv,
  processMinorCivTurn,
} from '@/systems/minor-civ-system';
import { applyUnitUpgradeToState } from '@/systems/unit-upgrade-system';
import { spawnGeneralForCiv } from '@/systems/great-general-system';
import { GENERAL_DEFINITIONS } from '@/systems/great-general-definitions';
import { loadUnitOntoTransport, unloadUnitFromTransport } from '@/systems/transport-system';
import { visitVillage } from '@/systems/village-system';
import { foundCity } from '@/systems/city-system';
import { hexKey } from '@/systems/hex-utils';
import { assertUnitRosters } from '../helpers/save-state-invariants';

/**
 * #996 — every unit-lifecycle transition must leave `unit.owner` and the
 * owner's roster (major `civ.units` or minor `minorCiv.units`) in agreement.
 *
 * The invariant itself is owned by `assertUnitRosters`
 * (`tests/helpers/save-state-invariants.ts`), which already runs in the
 * save-compat matrix, the cargo-lifecycle integration test and the liveness
 * continuity test (and now also per round in the AI-playability fixture). This
 * file proves each real production transition preserves it -- valid state in,
 * transition, still-valid state out -- and, per #1020, that the *semantic*
 * owned-unit query stays truthful about the authoritative `unit.owner` even
 * when the roster index is what rusts.
 */

const mkCounters = () => ({ nextUnitId: 9000, nextCityId: 9000, nextCampId: 9000, nextQuestId: 9000 });

function baseState(seed: string): GameState {
  const state = createNewGame({ civType: 'generic', mapSize: 'small', opponentCount: 1, seed, gameTitle: seed });
  state.civilizations.player.diplomacy.relationships['ai-1'] = 0;
  state.civilizations['ai-1'].diplomacy.relationships.player = 0;
  return state;
}

/** The owner's denormalized roster, or `undefined` for a rosterless world actor. */
function ownerRoster(state: GameState, owner: string): string[] | undefined {
  return state.civilizations[owner]?.units ?? state.minorCivs[owner]?.units;
}

/**
 * Create a real unit through `createUnit` and perform the same two writes every
 * production/spawn path performs: add to authoritative `state.units`, then
 * index it in the owner's roster (no roster for a rosterless actor).
 */
function addUnit(
  state: GameState,
  id: string,
  type: Unit['type'],
  owner: string,
  position: HexCoord,
  extra: Partial<Unit> = {},
): Unit {
  const unit: Unit = { ...createUnit(type, owner, position, { ...state.idCounters }), id, ...extra };
  state.units[id] = unit;
  ownerRoster(state, owner)?.push(id);
  return unit;
}

/** Structural integrity (`assertUnitRosters`) and semantic truth (#1020) agree for `owner`. */
function expectOwnershipAgrees(state: GameState, owner: string): void {
  assertUnitRosters(state);
  const owned = getOwnedUnits(state, owner).map(unit => unit.id).sort();
  const roster = ownerRoster(state, owner);
  if (roster) expect([...roster].sort()).toEqual(owned);
}

function combatResult(
  attackerId: string,
  defenderId: string,
  overrides: Partial<CombatResult> = {},
): CombatResult {
  return {
    attackerId,
    defenderId,
    attackerDamage: 0,
    defenderDamage: 100,
    attackerSurvived: true,
    defenderSurvived: false,
    attackerStrength: 20,
    defenderStrength: 20,
    attackerPosition: { q: 3, r: 3 },
    defenderPosition: { q: 4, r: 3 },
    ...overrides,
  };
}

describe('#996 creation keeps owner and roster in agreement', () => {
  it('createNewGame rosters every starting unit under its owner exactly once', () => {
    const state = baseState('996-create');

    for (const civId of Object.keys(state.civilizations)) {
      const ids = state.civilizations[civId].units;
      expect(new Set(ids).size).toBe(ids.length);
      for (const id of ids) expect(state.units[id]?.owner).toBe(civId);
      expectOwnershipAgrees(state, civId);
    }
  });

  it('a village free_unit reward rosters the gifted unit under its recipient', () => {
    const state = baseState('996-village');
    const recipient = Object.values(state.units).find(u => u.owner === 'player')!;
    // roll 0.7 lands in the `free_unit` band [0.69, 0.84); 0.1 picks the scout.
    const rolls = [0.7, 0.1];
    let index = 0;
    const rng = () => rolls[Math.min(index++, rolls.length - 1)];
    state.tribalVillages['village-996'] = {
      id: 'village-996',
      position: { ...recipient.position },
    } as GameState['tribalVillages'][string];

    const before = new Set(Object.keys(state.units));
    visitVillage(state, 'village-996', state.units[recipient.id], rng);

    const giftedId = Object.keys(state.units).find(id => !before.has(id))!;
    expect(giftedId).toBeDefined();
    expect(state.units[giftedId].owner).toBe('player');
    expect(state.civilizations.player.units.filter(id => id === giftedId)).toHaveLength(1);
    expectOwnershipAgrees(state, 'player');
  });

  it('spawnGeneralForCiv rosters the generated officer exactly once', () => {
    const state = baseState('996-general');
    const settler = Object.values(state.units).find(u => u.owner === 'player' && u.type === 'settler')!;
    const city = foundCity('player', { ...settler.position }, state.map, mkCounters());
    state.cities[city.id] = city;
    state.civilizations.player.cities.push(city.id);
    state.map.tiles[hexKey(city.position)]!.owner = 'player';

    const next = spawnGeneralForCiv(state, 'player', GENERAL_DEFINITIONS[0].id);
    const generalId: string = next.civilizations.player.generalHistory!.at(-1)!.unitId;

    expect(next.units[generalId].type).toBe('great_general');
    expect(next.units[generalId].owner).toBe('player');
    expect(next.civilizations.player.units.filter(id => id === generalId)).toHaveLength(1);
    expectOwnershipAgrees(next, 'player');
  });
});

describe('#996 ownership transfer keeps owner and roster in agreement', () => {
  it('civilian capture moves the unit across rosters and the canonical query follows the new owner', () => {
    const state = baseState('996-capture-civilian');
    addUnit(state, 'unit-captor', 'warrior', 'player', { q: 3, r: 3 });
    addUnit(state, 'unit-victim', 'worker', 'ai-1', { q: 4, r: 3 });

    const applied = applyCombatOutcomeToState(state, combatResult('unit-captor', 'unit-victim'), 64);

    expect(applied.defenderCaptured).toBe(true);
    expect(applied.state.units['unit-victim'].owner).toBe('player');
    expect(getOwnedUnits(applied.state, 'player').some(u => u.id === 'unit-victim')).toBe(true);
    expect(getOwnedUnits(applied.state, 'ai-1').some(u => u.id === 'unit-victim')).toBe(false);
    expect(applied.state.civilizations['ai-1'].units).not.toContain('unit-victim');
    expect(applied.state.civilizations.player.units.filter(id => id === 'unit-victim')).toHaveLength(1);
    expectOwnershipAgrees(applied.state, 'player');
    expectOwnershipAgrees(applied.state, 'ai-1');
  });

  it('prize-crew capture of a decisively-defeated naval military unit keeps rosters exactly-once', () => {
    const state = baseState('996-capture-prize');
    addUnit(state, 'unit-frigate', 'frigate', 'player', { q: 3, r: 3 });
    addUnit(state, 'unit-galley', 'galley', 'ai-1', { q: 4, r: 3 });

    const applied = applyCombatOutcomeToState(
      state,
      combatResult('unit-frigate', 'unit-galley', { defenderStrength: 8 }),
      64,
    );

    expect(applied.defenderCaptured).toBe(true);
    expect(applied.state.units['unit-galley'].owner).toBe('player');
    expect(applied.state.civilizations.player.units.filter(id => id === 'unit-galley')).toHaveLength(1);
    expect(applied.state.civilizations['ai-1'].units).not.toContain('unit-galley');
    expectOwnershipAgrees(applied.state, 'player');
    expectOwnershipAgrees(applied.state, 'ai-1');
  });

  it('a peaceful minor-civ absorption transfers the city-state units into the new owner roster', () => {
    const state = baseState('996-minor-absorb');
    const mcId = Object.keys(state.minorCivs).find(id => !state.minorCivs[id].isDestroyed)!;
    addUnit(state, 'unit-mc-guard', 'warrior', mcId, { q: 5, r: 5 });

    const { state: next, absorbed } = peacefullyAbsorbMinorCiv(state, mcId, 'player');

    expect(absorbed).toBe(true);
    expect(next.units['unit-mc-guard'].owner).toBe('player');
    expect(next.civilizations.player.units.filter(id => id === 'unit-mc-guard')).toHaveLength(1);
    expect(next.minorCivs[mcId].units).toEqual([]);
    assertUnitRosters(next);
  });

  it('a minor-civ conquest removes the city-state units and empties its roster', () => {
    const state = baseState('996-minor-conquest');
    const mcId = Object.keys(state.minorCivs).find(id => !state.minorCivs[id].isDestroyed)!;
    addUnit(state, 'unit-mc-guard', 'warrior', mcId, { q: 5, r: 5 });
    state.minorCivs[mcId].diplomacy.atWarWith = ['player'];

    const { state: next, conquered } = conquestMinorCiv(state, mcId, 'player');

    expect(conquered).toBe(true);
    expect(next.units['unit-mc-guard']).toBeUndefined();
    expect(next.minorCivs[mcId].units).toEqual([]);
    assertUnitRosters(next);
  });
});

describe('#996 upgrade leaves ownership and roster identity unchanged', () => {
  it('upgrading a unit keeps the same id, owner, and exactly-once roster entry', () => {
    const state = baseState('996-upgrade');
    const settler = Object.values(state.units).find(u => u.owner === 'player' && u.type === 'settler')!;
    const position = { ...settler.position };
    const city = foundCity('player', position, state.map, mkCounters());
    state.cities[city.id] = city;
    state.civilizations.player.cities.push(city.id);
    state.map.tiles[hexKey(position)]!.owner = 'player';
    state.civilizations.player.gold = 10000;
    state.civilizations.player.techState.completed = [
      'espionage-scouting',
      'espionage-informants',
      ...state.civilizations.player.techState.completed,
    ];
    addUnit(state, 'unit-spy-scout', 'spy_scout', 'player', position);

    const rosterBefore = state.civilizations.player.units.length;
    const result = applyUnitUpgradeToState(state, 'unit-spy-scout', 'spy_informant');

    expect(result.upgraded).toBe(true);
    expect(result.state.units['unit-spy-scout'].type).toBe('spy_informant');
    expect(result.state.units['unit-spy-scout'].owner).toBe('player');
    expect(result.state.civilizations.player.units).toHaveLength(rosterBefore);
    expect(result.state.civilizations.player.units.filter(id => id === 'unit-spy-scout')).toHaveLength(1);
    expectOwnershipAgrees(result.state, 'player');
  });
});

describe('#996 removal keeps owner and roster in agreement', () => {
  it('disbanding a transport with cargo aboard scrubs every affected roster entry', () => {
    const state = baseState('996-disband');
    addUnit(state, 'unit-ship', 'transport', 'player', { q: 3, r: 3 });
    addUnit(state, 'unit-rider', 'warrior', 'player', { q: 3, r: 3 }, { transportId: 'unit-ship' });
    state.units['unit-ship'] = { ...state.units['unit-ship'], cargoUnitIds: ['unit-rider'] };

    const next = removePlayerUnitFromState(state, 'player', 'unit-ship', new EventBus());

    expect(next.units['unit-ship']).toBeUndefined();
    expect(next.units['unit-rider']).toBeUndefined();
    expect(next.civilizations.player.units).not.toContain('unit-ship');
    expect(next.civilizations.player.units).not.toContain('unit-rider');
    expectOwnershipAgrees(next, 'player');
  });

  it('a lethal combat result destroys the unit and scrubs its roster entry', () => {
    const state = baseState('996-death');
    addUnit(state, 'unit-killer', 'warrior', 'player', { q: 3, r: 3 }, { health: 100 });
    addUnit(state, 'unit-doomed', 'warrior', 'ai-1', { q: 4, r: 3 }, { health: 1 });

    const applied = applyCombatOutcomeToState(state, combatResult('unit-killer', 'unit-doomed'), 64);

    expect(applied.defenderDefeated).toBe(true);
    expect(applied.state.units['unit-doomed']).toBeUndefined();
    expect(applied.state.civilizations['ai-1'].units).not.toContain('unit-doomed');
    expectOwnershipAgrees(applied.state, 'ai-1');
  });

  it('a minor-civ unit destroyed in combat is scrubbed from its owner roster', () => {
    const state = baseState('996-minor-death');
    const mcId = Object.keys(state.minorCivs).find(id => !state.minorCivs[id].isDestroyed)!;
    addUnit(state, 'unit-killer', 'warrior', 'player', { q: 3, r: 3 }, { health: 100 });
    addUnit(state, 'unit-mc-doomed', 'warrior', mcId, { q: 4, r: 3 }, { health: 1 });

    const applied = applyCombatOutcomeToState(state, combatResult('unit-killer', 'unit-mc-doomed'), 64);

    expect(applied.defenderDefeated).toBe(true);
    expect(applied.state.units['unit-mc-doomed']).toBeUndefined();
    expect(applied.state.minorCivs[mcId].units).not.toContain('unit-mc-doomed');
    assertUnitRosters(applied.state);
  });

  it('eliminateCivilization empties the dead civ roster and removes its units', () => {
    const state = baseState('996-eliminate');
    for (const unitId of [...state.civilizations['ai-1'].units]) delete state.units[unitId];
    state.civilizations['ai-1'].units = [];

    const result = eliminateCivilization(state, 'ai-1', 'player');

    expect(result.eliminated).toBe(true);
    if (result.eliminated) {
      expect(result.state.civilizations['ai-1'].units).toEqual([]);
      expect(getOwnedUnits(result.state, 'ai-1')).toEqual([]);
      assertUnitRosters(result.state);
    }
  });
});

describe('#996 cargo keeps ownership and roster membership', () => {
  it('loading and unloading cargo never removes it from its owner roster', () => {
    const state = baseState('996-cargo');
    const anchor = Object.values(state.units).find(u => u.owner === 'player')!;
    const coast = { q: anchor.position.q + 1, r: anchor.position.r };
    const pad = { q: anchor.position.q + 1, r: anchor.position.r + 1 };
    state.map.tiles[hexKey(coast)] = {
      coord: coast, terrain: 'coast', elevation: 'lowland', resource: null, improvement: 'none',
      owner: null, improvementTurnsLeft: 0, hasRiver: false, wonder: null,
    };
    state.map.tiles[hexKey(pad)] = {
      coord: pad, terrain: 'grassland', elevation: 'lowland', resource: null, improvement: 'none',
      owner: 'player', improvementTurnsLeft: 0, hasRiver: false, wonder: null,
    };
    addUnit(state, 'unit-ship', 'transport', 'player', coast);
    addUnit(state, 'unit-cargo', 'warrior', 'player', { ...anchor.position }, { movementPointsLeft: 3 });

    const loaded = loadUnitOntoTransport(state, 'unit-cargo', 'unit-ship');
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.state.units['unit-cargo'].owner).toBe('player');
    expect(loaded.state.civilizations.player.units.filter(id => id === 'unit-cargo')).toHaveLength(1);
    expect(getOwnedUnitCount(loaded.state, 'player')).toBe(
      getOwnedUnits(loaded.state, 'player').length,
    );
    expectOwnershipAgrees(loaded.state, 'player');

    const readyToDisembark = {
      ...loaded.state,
      units: {
        ...loaded.state.units,
        'unit-cargo': {
          ...loaded.state.units['unit-cargo'],
          movementPointsLeft: 2,
          hasMoved: false,
          hasActed: false,
        },
      },
    };
    const unloaded = unloadUnitFromTransport(readyToDisembark, 'unit-ship', 'unit-cargo', pad);
    expect(unloaded.ok).toBe(true);
    if (!unloaded.ok) return;
    expect(unloaded.state.units['unit-cargo'].owner).toBe('player');
    expect(unloaded.state.civilizations.player.units.filter(id => id === 'unit-cargo')).toHaveLength(1);
    expectOwnershipAgrees(unloaded.state, 'player');
  });
});

describe('#996 rosterless owners are never forced into a roster', () => {
  it('barbarian / pirate / beast units pass the invariant and resolve canonically without a civ record', () => {
    const state = baseState('996-rosterless');
    addUnit(state, 'unit-barb', 'warrior', 'barbarian', { q: 5, r: 5 });
    addUnit(state, 'unit-pirate', 'galley', 'pirate-1', { q: 6, r: 6 });
    addUnit(state, 'unit-beast', 'warrior', 'beasts', { q: 7, r: 7 });

    expect(() => assertUnitRosters(state)).not.toThrow();
    for (const owner of ['barbarian', 'pirate-1', 'beasts']) {
      expect(getOwnedUnitCount(state, owner)).toBe(1);
    }
    // No civilization or minor-civ record was manufactured for them.
    expect(state.civilizations.barbarian).toBeUndefined();
    expect(state.civilizations['pirate-1']).toBeUndefined();
    expect(state.minorCivs.beasts).toBeUndefined();
  });
});

describe('#996 minor-civ turn keeps every minor roster in agreement', () => {
  it('a full minor-civ turn leaves each minor civ owner and roster in agreement', () => {
    const state = baseState('996-minor-turn');
    const next = processMinorCivTurn(state, new EventBus());

    assertUnitRosters(next);
    for (const mcId of Object.keys(next.minorCivs)) {
      expectOwnershipAgrees(next, mcId);
    }
  });
});

describe('#996 semantic query stays truthful when the index is broken', () => {
  it('a unit missing from its owner roster is still owned canonically but fails the structural invariant', () => {
    const state = baseState('996-semantic');
    const unitId = state.civilizations.player.units[0];
    state.civilizations.player.units = state.civilizations.player.units.filter(id => id !== unitId);

    // The semantic question answers from authoritative ownership...
    expect(getOwnedUnits(state, 'player').some(u => u.id === unitId)).toBe(true);
    expect(getOwnedUnitCount(state, 'player')).toBeGreaterThan(0);
    // ...while the structural invariant detects that the index is stale.
    expect(() => assertUnitRosters(state)).toThrow(/not in .* roster/s);
  });
});
