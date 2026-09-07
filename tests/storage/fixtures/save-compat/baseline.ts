import type { GameState } from '@/core/types';
import { createNewGame } from '@/core/game-state';
import { foundCity } from '@/systems/city-system';

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

  // Eliminated civ: ai-2 keeps no cities/units and is flagged out of diplomacy.
  const eliminatedCivId = 'ai-2';
  for (const unitId of state.civilizations[eliminatedCivId].units) delete state.units[unitId];
  state.civilizations[eliminatedCivId].units = [];
  state.civilizations[eliminatedCivId].cities = [];
  state.civilizations[eliminatedCivId].isEliminated = true;
  state.civilizations[eliminatedCivId].nearDefeat = true;
  // Scrub the eliminated civ from everyone else's live obligations.
  for (const civ of Object.values(state.civilizations)) {
    civ.diplomacy.atWarWith = civ.diplomacy.atWarWith.filter(id => id !== eliminatedCivId);
    civ.diplomacy.treaties = civ.diplomacy.treaties.filter(t => t.civA !== eliminatedCivId && t.civB !== eliminatedCivId);
  }

  return { state, playerCityId, aiCityId, eliminatedCivId };
}
