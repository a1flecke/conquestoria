/**
 * Homeland choice reservation at game creation (design 2026-11-25, Phase C, C2): every start-relative creation step
 * must see every option a human may choose, so any choice leaves a legal, fair world. With the picker off nothing
 * changes (the rest of the suite's pinned fixtures prove that byte for byte).
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { GameState, HexCoord } from '@/core/types';
import { createHotSeatGame, createNewGame } from '@/core/game-state';
import { mapDistance, getWrappedHexesInRange, hexKey } from '@/systems/hex-utils';
import { RESOURCE_DEFINITIONS } from '@/systems/resource-definitions';
import { createStartQualityIndex } from '@/systems/start-quality';
import { assertSaveStateInvariants } from '../helpers/save-state-invariants';
import { preloadGeoMapData } from '../helpers/geo-map-data';

const LUXURY = new Set(RESOURCE_DEFINITIONS.filter(def => def.type === 'luxury').map(def => def.id));

function soloOn(seed: string, size: 'small' | 'medium' | 'large' = 'large'): GameState {
  return createNewGame({
    civType: 'rome', seed, mapSize: size, opponentCount: 3, gameTitle: 't',
    settingsOverrides: { homelandPicker: 'on' },
  });
}

function options(state: GameState, civId: string): HexCoord[] {
  return state.civilizations[civId].homelandChoice?.options.map(option => option.coord) ?? [];
}

/** The options a check loops over, required to exist so a check can never pass because nothing was reserved. */
function reserved(state: GameState, civId: string, atLeast = 2): HexCoord[] {
  const found = options(state, civId);
  expect(found.length, `${civId} has reserved options`).toBeGreaterThanOrEqual(atLeast);
  return found;
}

describe('homeland reservation (solo)', () => {
  it('records the placed start as option 0 for the human only, selected, when the picker is on', () => {
    const state = soloOn('reserve-1');
    const choice = state.civilizations.player.homelandChoice!;
    expect(choice).toBeDefined();
    expect(choice.selected).toBe(0);
    const settler = state.civilizations.player.units.map(id => state.units[id]).find(unit => unit.type === 'settler')!;
    expect(choice.options[0].coord).toEqual(settler.position);
    expect(choice.options.length).toBeGreaterThanOrEqual(2);
    for (const [civId, civ] of Object.entries(state.civilizations)) {
      if (civId !== 'player') expect(civ.homelandChoice, `${civId} never chooses`).toBeUndefined();
    }
  });

  it('writes nothing when the picker is off or unset, so existing games play as before', () => {
    const plain = createNewGame({ civType: 'rome', seed: 'reserve-1', mapSize: 'large', opponentCount: 3, gameTitle: 't' });
    const off = createNewGame({
      civType: 'rome', seed: 'reserve-1', mapSize: 'large', opponentCount: 3, gameTitle: 't', settingsOverrides: { homelandPicker: 'off' },
    });
    for (const state of [plain, off]) {
      for (const civ of Object.values(state.civilizations)) expect(civ.homelandChoice).toBeUndefined();
    }
    expect(plain.settings.homelandPicker).toBeUndefined();
  });

  it('gives every option a luxury within five hexes, like a placed start', () => {
    const state = soloOn('reserve-2');
    for (const coord of reserved(state, 'player')) {
      const near = getWrappedHexesInRange(coord, 5, state.map.width);
      expect(near.some(hex => LUXURY.has(state.map.tiles[hexKey(hex)]?.resource as never)), `luxury near ${hexKey(coord)}`).toBe(true);
    }
  });

  it('keeps camps, villages, lairs and city-states clear of every option, as they are of a start', () => {
    for (const seed of ['reserve-3', 'reserve-4', 'reserve-5']) {
      const state = soloOn(seed);
      for (const coord of reserved(state, 'player')) {
        for (const camp of Object.values(state.barbarianCamps)) expect(mapDistance(state.map, coord, camp.position), `${seed} camp`).toBeGreaterThanOrEqual(6);
        for (const village of Object.values(state.tribalVillages)) expect(mapDistance(state.map, coord, village.position), `${seed} village`).toBeGreaterThanOrEqual(4);
        for (const lair of Object.values(state.beasts?.lairs ?? {})) expect(mapDistance(state.map, coord, lair.position), `${seed} lair`).toBeGreaterThanOrEqual(6);
        for (const minor of Object.values(state.minorCivs)) {
          expect(mapDistance(state.map, coord, state.cities[minor.cityId].position), `${seed} city-state`).toBeGreaterThanOrEqual(8);
        }
      }
    }
  });

  it('leaves every option on a site that passes the major start minimum, and the world valid', () => {
    const state = soloOn('reserve-6');
    const quality = createStartQualityIndex(state.map);
    for (const coord of reserved(state, 'player')) expect(quality.floorFailures(coord, 'major')).toEqual([]);
    assertSaveStateInvariants(state, 'after creation with reserved homelands');
  });

  it('is deterministic for a seed', () => {
    expect(reserved(soloOn('reserve-7'), 'player')).toEqual(reserved(soloOn('reserve-7'), 'player'));
  });
});

describe('homeland reservation: a human boxed in on New World trades starts for room (assignHomelandRoom)', () => {
  beforeAll(async () => { await preloadGeoMapData(); });

  function newWorld(seed: string, opponentCount: number, picker: boolean, mode: 'balanced' | 'historical' = 'balanced'): GameState {
    return createNewGame({
      civType: 'rome', seed, mapSize: 'large', opponentCount, mapScript: 'new-world', startPlacementMode: mode,
      gameTitle: 't', ...(picker ? { settingsOverrides: { homelandPicker: 'on' as const } } : {}),
    });
  }
  const settlerAt = (state: GameState, civId: string): string => hexKey(
    state.civilizations[civId].units.map(id => state.units[id]).find(unit => unit.type === 'settler')!.position,
  );
  const startSet = (state: GameState): string[] => Object.keys(state.civilizations).map(civId => settlerAt(state, civId)).sort();

  // Seeds that left the player squeezed between the sea and a neighbour, with no alternate (found on main, 2026-11-27).
  for (const [seed, opponents] of [['matrix-4', 7], ['matrix-5', 3], ['matrix-6', 3]] as const) {
    it(`${seed} with ${opponents} opponents: a full choice, on one of the same starts the placer chose`, () => {
      const on = newWorld(seed, opponents, true);
      const off = newWorld(seed, opponents, false);
      expect(options(on, 'player')).toHaveLength(3);
      // No start moved: the human only traded places with an AI civilization.
      expect(startSet(on)).toEqual(startSet(off));
      expect(settlerAt(on, 'player')).not.toBe(settlerAt(off, 'player'));
      assertSaveStateInvariants(on);
    });
  }

  it('never trades a True Start homeland', () => {
    const on = newWorld('matrix-5', 3, true, 'historical');
    const off = newWorld('matrix-5', 3, false, 'historical');
    for (const civId of Object.keys(off.civilizations)) expect(settlerAt(on, civId), civId).toBe(settlerAt(off, civId));
  });
});

describe('homeland reservation (hot seat)', () => {
  function hotSeat(seed: string): GameState {
    return createHotSeatGame({
      playerCount: 4,
      mapSize: 'large',
      settingsOverrides: { homelandPicker: 'on' },
      players: [
        { name: 'A', slotId: 'player-1', civType: 'rome', isHuman: true },
        { name: 'B', slotId: 'player-2', civType: 'egypt', isHuman: true },
        { name: 'C', slotId: 'ai-1', civType: 'greece', isHuman: false },
        { name: 'D', slotId: 'ai-2', civType: 'china', isHuman: false },
      ],
    }, seed, 'hot');
  }

  it('reserves options for each human, never sharing or crowding another human\'s, and none for the AI', () => {
    const state = hotSeat('reserve-hot');
    const a = reserved(state, 'player-1');
    const b = reserved(state, 'player-2');
    expect(options(state, 'ai-1')).toEqual([]);
    expect(options(state, 'ai-2')).toEqual([]);
    for (const x of a) for (const y of b) expect(mapDistance(state.map, x, y)).toBeGreaterThanOrEqual(9);
    assertSaveStateInvariants(state, 'hot seat after creation with reserved homelands');
  });

  it('keeps hot-seat camps and city-states clear of every human\'s options', () => {
    const state = hotSeat('reserve-hot-2');
    for (const coord of [...reserved(state, 'player-1'), ...reserved(state, 'player-2')]) {
      for (const camp of Object.values(state.barbarianCamps)) expect(mapDistance(state.map, coord, camp.position)).toBeGreaterThanOrEqual(6);
      for (const minor of Object.values(state.minorCivs)) {
        expect(mapDistance(state.map, coord, state.cities[minor.cityId].position)).toBeGreaterThanOrEqual(8);
      }
    }
  });
});
