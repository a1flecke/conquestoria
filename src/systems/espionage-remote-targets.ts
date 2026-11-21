/**
 * Who a remote-capable espionage mission may be aimed at (#1780).
 *
 * A remote mission (`missionRequiresPlacedSpy` is false: cyber attack, misinformation,
 * satellite surveillance, signals intercept) needs no spy in the target city, so nothing
 * physical limits its reach. The rule is earned knowledge, one gate for all four:
 *
 * - the target is a living major civilization the actor has **met** (`hasMetCivilization`), and
 * - the actor has **discovered** at least one of its cities (`hasDiscoveredCity`), the same
 *   "known, located city" bar the AI's own target choice uses.
 *
 * Three of the four missions act on the whole empire, so the player picks an empire; only
 * `cyber_attack` hits one city, so it lists discovered cities. An empire pick is anchored to
 * the civ's capital when the actor has discovered it, otherwise to the first discovered city
 * by name, so the mission record still names a city the actor knows.
 *
 * `getRemoteMissionTargetsForViewer` is what the panel shows; `startMissionForCiv` re-runs
 * the same check before a mission starts, for the player and the AI alike.
 */
import type { CivBonusEffect, GameState, SpyMissionType } from '@/core/types';
import { getCapitalCityId } from './capital-system';
import { hasDiscoveredCity, hasMetCivilization } from './discovery-system';
import { missionRequiresPlacedSpy } from './espionage-catalog';
import { startMission, type StartMissionResult } from './espionage-missions';
import { createEspionageCivState } from './espionage-state';

export type RemoteMissionTargetMode = 'empire' | 'city';

export interface RemoteMissionTarget {
  civId: string;
  civName: string;
  /** For an empire target, the anchor city; for a city target, the city itself. */
  cityId: string;
  cityName: string;
}

const CITY_TARGETED_REMOTE_MISSIONS: ReadonlySet<SpyMissionType> = new Set<SpyMissionType>(['cyber_attack']);

export function getRemoteMissionTargetMode(mission: SpyMissionType): RemoteMissionTargetMode {
  return CITY_TARGETED_REMOTE_MISSIONS.has(mission) ? 'city' : 'empire';
}

function isTargetableCiv(state: GameState, actorCivId: string, civId: string): boolean {
  if (civId === actorCivId) return false;
  const civ = state.civilizations[civId];
  if (!civ || civ.isEliminated) return false;
  return hasMetCivilization(state, actorCivId, civId);
}

function discoveredCitiesOf(state: GameState, actorCivId: string, civId: string) {
  return (state.civilizations[civId]?.cities ?? [])
    .map(cityId => state.cities[cityId])
    .filter((city): city is NonNullable<typeof city> =>
      city !== undefined && city.owner === civId && hasDiscoveredCity(state, actorCivId, city.id))
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

function anchorCity(state: GameState, actorCivId: string, civId: string) {
  const cities = discoveredCitiesOf(state, actorCivId, civId);
  const capitalId = getCapitalCityId(state, civId);
  return cities.find(city => city.id === capitalId) ?? cities[0] ?? null;
}

/** The targets the viewer has earned for this remote mission, sorted for display. */
export function getRemoteMissionTargetsForViewer(
  state: GameState,
  viewerCivId: string,
  mission: SpyMissionType,
): RemoteMissionTarget[] {
  if (missionRequiresPlacedSpy(mission)) return [];
  const mode = getRemoteMissionTargetMode(mission);
  const targets: RemoteMissionTarget[] = [];
  for (const civId of Object.keys(state.civilizations).sort()) {
    if (!isTargetableCiv(state, viewerCivId, civId)) continue;
    const civName = state.civilizations[civId]!.name;
    if (mode === 'empire') {
      const city = anchorCity(state, viewerCivId, civId);
      if (city) targets.push({ civId, civName, cityId: city.id, cityName: city.name });
    } else {
      for (const city of discoveredCitiesOf(state, viewerCivId, civId)) {
        targets.push({ civId, civName, cityId: city.id, cityName: city.name });
      }
    }
  }
  return targets.sort((a, b) =>
    a.civName.localeCompare(b.civName) || a.cityName.localeCompare(b.cityName) || a.cityId.localeCompare(b.cityId));
}

/**
 * `'target-unknown'` when the actor may not aim this remote mission at this target. It is the
 * same answer for a target that does not exist and one the actor has not found, so the denial
 * reveals nothing. Always `null` for a placed-spy mission: its target is the city the spy is in.
 */
export function getRemoteMissionTargetDenial(
  state: GameState,
  actorCivId: string,
  mission: SpyMissionType,
  targetCivId: string | undefined,
  targetCityId: string | undefined,
): 'target-unknown' | null {
  if (missionRequiresPlacedSpy(mission)) return null;
  if (!targetCivId || !targetCityId) return null; // `startMission` reports the missing target
  if (!isTargetableCiv(state, actorCivId, targetCivId)) return 'target-unknown';
  const city = state.cities[targetCityId];
  if (!city || city.owner !== targetCivId || !hasDiscoveredCity(state, actorCivId, targetCityId)) return 'target-unknown';
  return null;
}

/**
 * Start a mission for `actorCivId` against the live game state: the remote-target check above,
 * then every spy-state check in `startMission`. The player's panel and the AI both start
 * missions through here.
 */
export function startMissionForCiv(
  state: GameState,
  actorCivId: string,
  spyId: string,
  mission: SpyMissionType,
  civBonusEffect?: CivBonusEffect,
  targetCivId?: string,
  targetCityId?: string,
): StartMissionResult {
  const esp = state.espionage?.[actorCivId];
  if (!esp) return { ok: false, state: createEspionageCivState(), reason: 'spy-not-found' };
  const spy = esp.spies[spyId];
  const denial = getRemoteMissionTargetDenial(
    state, actorCivId, mission, targetCivId ?? spy?.targetCivId ?? undefined, targetCityId ?? spy?.targetCityId ?? undefined,
  );
  if (denial) return { ok: false, state: esp, reason: denial };
  return startMission(esp, spyId, mission, civBonusEffect, targetCivId, targetCityId);
}
