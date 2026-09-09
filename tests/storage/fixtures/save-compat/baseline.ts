import type { GameState, HotSeatConfig } from '@/core/types';
import { createNewGame, createHotSeatGame } from '@/core/game-state';
import { foundCity } from '@/systems/city-system';
import { reconcileCivilizationLiveness } from '@/systems/civilization-elimination-system';

/**
 * #1006 — the compact current-schema `GameState` every save-compat-matrix case
 * is derived from. NOT a 500-turn save: a small map, three major civs, two
 * founded cities, a live bilateral war, a trade route, and an eliminated civ —
 * enough cross-system state that `migrate → process a turn → save → reload`
 * has something real to corrupt, while staying deterministic and fast.
 *
 * Per-version legacy shape is produced by `downgradeToVersion` (manifest.ts),
 * which strips the optional containers a save written at that version would not
 * have carried, so each migration has genuine re-hydration work to do.
 */

/** Fresh counters per call so `buildBaselineSave` produces the same ids in isolation. */
const freshIds = () => ({ nextUnitId: 4000, nextCityId: 4000, nextCampId: 4000, nextQuestId: 4000 });

export interface BaselineSave {
  state: GameState;
  playerCityId: string;
  aiCityId: string;
  eliminatedCivId: string;
}

export function buildBaselineSave(seed = 'save-compat-baseline'): BaselineSave {
  const state = createNewGame({
    civType: 'generic',
    mapSize: 'small',
    opponentCount: 2,
    seed,
    gameTitle: 'save compat baseline',
  });

  const ids = freshIds();
  const foundFor = (civId: string): string => {
    const settler = Object.values(state.units).find(u => u.owner === civId && u.type === 'settler');
    if (!settler) throw new Error(`baseline: no settler for ${civId}`);
    const city = foundCity(civId, settler.position, state.map, ids, { civType: state.civilizations[civId].civType });
    state.cities[city.id] = city;
    state.civilizations[civId].cities.push(city.id);
    // The settler is consumed by founding; drop it from state + roster.
    delete state.units[settler.id];
    state.civilizations[civId].units = state.civilizations[civId].units.filter(id => id !== settler.id);
    return city.id;
  };

  const playerCityId = foundFor('player');
  const aiCityId = foundFor('ai-1');

  // Live bilateral war: player <-> ai-1.
  state.civilizations.player.diplomacy.atWarWith = ['ai-1'];
  state.civilizations['ai-1'].diplomacy.atWarWith = ['player'];
  state.civilizations.player.diplomacy.relationships['ai-1'] = -80;
  state.civilizations['ai-1'].diplomacy.relationships.player = -80;

  // A trade route between the two founded cities (ai-1 is foreign to player).
  state.marketplace!.tradeRoutes = [{
    id: 'route-4000',
    fromCityId: playerCityId,
    toCityId: aiCityId,
    goldPerTrip: 6,
    turnsPerTrip: 3,
    foreignCivId: 'ai-1',
  }];

  // Eliminated civ: strip ai-2's assets and run the REAL elimination path
  // (`reconcileCivilizationLiveness` -> `eliminateCivilization`), so the fixture
  // carries a properly torn-down eliminated civ — every subsystem, not just
  // diplomacy — and the `no-eliminated-civ-entities` invariant holds on it (#1001).
  const eliminatedCivId = 'ai-2';
  const before = state;
  for (const unitId of [...state.civilizations[eliminatedCivId].units]) delete state.units[unitId];
  state.civilizations[eliminatedCivId].units = [];
  state.civilizations[eliminatedCivId].cities = [];
  const eliminated = reconcileCivilizationLiveness(before, state).state;

  return { state: eliminated, playerCityId, aiCityId, eliminatedCivId };
}

const HOT_SEAT_CONFIG: HotSeatConfig = {
  playerCount: 2,
  mapSize: 'small',
  players: [
    { slotId: 'player-1', name: 'A', civType: 'generic', isHuman: true },
    { slotId: 'player-2', name: 'B', civType: 'generic', isHuman: true },
  ],
};

/**
 * Hot-seat variant — carries the persisted state a solo save does not: the
 * `hotSeat` slot config and per-viewer `pendingEvents` queues. Two founded
 * cities (one per human), a queued council interrupt for the non-active
 * viewer, and a live bilateral war.
 */
export function buildHotSeatBaselineSave(seed = 'save-compat-hotseat'): BaselineSave {
  const state = createHotSeatGame(HOT_SEAT_CONFIG, seed, 'save compat hot seat', 'standard');
  const ids = freshIds();

  const civIds = Object.keys(state.civilizations).filter(id => state.civilizations[id].isHuman);
  const foundFor = (civId: string): string => {
    const settler = Object.values(state.units).find(u => u.owner === civId && u.type === 'settler');
    if (!settler) throw new Error(`hot-seat baseline: no settler for ${civId}`);
    const city = foundCity(civId, settler.position, state.map, ids, { civType: state.civilizations[civId].civType });
    state.cities[city.id] = city;
    state.civilizations[civId].cities.push(city.id);
    delete state.units[settler.id];
    state.civilizations[civId].units = state.civilizations[civId].units.filter(id => id !== settler.id);
    return city.id;
  };

  const playerCityId = foundFor(civIds[0]);
  const aiCityId = foundFor(civIds[1]);

  state.civilizations[civIds[0]].diplomacy.atWarWith = [civIds[1]];
  state.civilizations[civIds[1]].diplomacy.atWarWith = [civIds[0]];

  // A pending event queued for the non-active viewer — hot-seat-only state.
  state.pendingEvents = {
    [civIds[1]]: [{ type: 'council:interrupt', message: 'Your advisors have concerns.', turn: state.turn }],
  };

  return { state, playerCityId, aiCityId, eliminatedCivId: 'none' };
}
