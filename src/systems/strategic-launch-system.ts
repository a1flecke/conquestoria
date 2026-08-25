import type { City, GameState, HexCoord, UnitType } from '@/core/types';
import { BUILDINGS } from '@/systems/city-system';
import { UNIT_DEFINITIONS } from '@/systems/unit-system';
import { getStrategicArsenal } from '@/systems/strategic-arsenal-system';
import { hasDiscoveredCity } from '@/systems/discovery-system';
import { isAtWar } from '@/systems/diplomacy-system';
import { mapDistance } from '@/systems/hex-utils';

export type StrategicLaunchPlatform =
  | { kind: 'building'; cityId: string; buildingId: string; position: HexCoord; range: number | 'unlimited' }
  | { kind: 'unit'; unitId: string; unitType: UnitType; position: HexCoord; range: number | 'unlimited' };

/**
 * Every strategic-launch platform civId currently owns, driven entirely by the
 * typed strategicLaunchPlatform capability (#545 spec Goal 3) -- never a
 * unit-type/building-id switch. A hypothetical future platform (a different
 * building or unit gaining the same capability field) needs zero changes here.
 */
export function getEligibleStrategicLaunchPlatforms(state: GameState, civId: string): StrategicLaunchPlatform[] {
  const platforms: StrategicLaunchPlatform[] = [];

  for (const city of Object.values(state.cities)) {
    if (city.owner !== civId) continue;
    for (const buildingId of city.buildings) {
      const capability = BUILDINGS[buildingId]?.strategicLaunchPlatform;
      if (capability) {
        platforms.push({ kind: 'building', cityId: city.id, buildingId, position: city.position, range: capability.range });
      }
    }
  }

  for (const unit of Object.values(state.units)) {
    if (unit.owner !== civId) continue;
    const capability = UNIT_DEFINITIONS[unit.type]?.strategicLaunchPlatform;
    if (capability) {
      platforms.push({ kind: 'unit', unitId: unit.id, unitType: unit.type, position: unit.position, range: capability.range });
    }
  }

  return platforms;
}

export type StrategicLaunchLegalityFailure =
  | 'unknown-target-city'
  | 'no-arsenal'
  | 'target-not-discovered'
  | 'not-at-war'
  | 'no-eligible-platform';

export type StrategicLaunchLegalityResult =
  | { ok: true; platform: StrategicLaunchPlatform }
  | { ok: false; reason: StrategicLaunchLegalityFailure };

/**
 * #545 spec §6: a strike is legal iff the actor has strategicArsenal >= 1, has an
 * eligible platform in range, the target city has already been discovered by the
 * actor (closes the targeting-omniscience loophole), and the target civ is in the
 * actor's atWarWith list (the primary hot-seat-accident guardrail -- an at-peace
 * sibling literally cannot appear as a valid target). No strike effect is computed
 * here -- this MR is legality/dry-run only; MR3 wires actual resolution.
 */
export function getStrategicLaunchLegality(
  state: GameState,
  actorCivId: string,
  targetCityId: string,
): StrategicLaunchLegalityResult {
  const targetCity = state.cities[targetCityId];
  if (!targetCity) return { ok: false, reason: 'unknown-target-city' };

  const actorCiv = state.civilizations[actorCivId];
  if (!actorCiv || getStrategicArsenal(actorCiv) < 1) return { ok: false, reason: 'no-arsenal' };

  if (!hasDiscoveredCity(state, actorCivId, targetCityId)) return { ok: false, reason: 'target-not-discovered' };

  if (!isAtWar(actorCiv.diplomacy, targetCity.owner)) return { ok: false, reason: 'not-at-war' };

  const platform = getEligibleStrategicLaunchPlatforms(state, actorCivId).find(p =>
    p.range === 'unlimited' || mapDistance(state.map, p.position, targetCity.position) <= p.range,
  );
  if (!platform) return { ok: false, reason: 'no-eligible-platform' };

  return { ok: true, platform };
}

/**
 * #545 MR4 spec §11: classifies a strike by actorCivId against targetCivId as
 * retaliation iff targetCivId has struck actorCivId at least once before.
 * Pure read of DiplomacyState.strategicStrikesReceivedFrom (MR4, optional --
 * absent means never struck) -- safe to call with either pre- or post-strike
 * state, since resolveStrategicStrike (MR3) never touches this field itself.
 */
export function isStrategicStrikeRetaliation(
  state: GameState,
  actorCivId: string,
  targetCivId: string,
): boolean {
  const actorCiv = state.civilizations[actorCivId];
  if (!actorCiv) return false;
  return (actorCiv.diplomacy.strategicStrikesReceivedFrom ?? []).includes(targetCivId);
}

/**
 * #545 MR4 spec §14 stage 2: every city that is currently a legal strike
 * target for actorCivId, reusing getStrategicLaunchLegality per-candidate --
 * never a separate reimplementation of any of its four conditions.
 */
export function getLegalStrategicLaunchTargets(state: GameState, actorCivId: string): City[] {
  return Object.values(state.cities).filter(
    city => getStrategicLaunchLegality(state, actorCivId, city.id).ok,
  );
}
