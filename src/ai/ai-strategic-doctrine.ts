import type { City, GameState, Unit } from '@/core/types';
import { getCapitalCity } from '@/systems/capital-system';
import { getLegalStrategicLaunchTargets } from '@/systems/strategic-launch-system';
import { UNIT_DEFINITIONS } from '@/systems/unit-system';
import { mapDistance } from '@/systems/hex-utils';
import { isHostileOwnerTo } from '@/systems/owner-hostility';

// #545 MR5 spec §10: illustrative values made concrete during MR5 planning.
const VETERAN_FIRST_USE_CAPITAL_HP_THRESHOLD = 20;
const VETERAN_FIRST_USE_RELIEF_RADIUS = 3;

function isCombatLandUnit(unit: Unit): boolean {
  const definition = UNIT_DEFINITIONS[unit.type];
  // domain is optional; absent means land (same convention isCombatWarship
  // in basic-ai.ts relies on for the naval side).
  return (definition?.domain === undefined || definition.domain === 'land')
    && (definition?.strength ?? 0) > 0;
}

// Returns the set of civ ids that actually own a hostile land unit adjacent
// to the capital -- NOT just a boolean. Target selection below must strike
// one of THESE civs, never an arbitrary atWarWith entry: an AI could
// legitimately be at war with a second, unrelated (and possibly pacifist)
// civ at the same time its capital is besieged by a different one, and
// only the actual besieger may ever be struck by this gate. This is what
// keeps a human who never builds arsenal and never attacks anyone
// structurally un-nukeable even while at war with a veteran AI under siege
// from someone else.
function getCapitalThreateningOwnerIds(state: GameState, civId: string, capital: City): Set<string> {
  const owners = new Set<string>();
  for (const unit of Object.values(state.units)) {
    if (
      isCombatLandUnit(unit)
      && isHostileOwnerTo(state, civId, unit.owner)
      && mapDistance(state.map, unit.position, capital.position) === 1
    ) {
      owners.add(unit.owner);
    }
  }
  return owners;
}

// "Friendly" means the endangered civ's OWN units only -- no alliance-aware
// relief detection exists in this codebase (#545 MR5 design doc finding #5).
function hasFriendlyReliefNearCapital(state: GameState, civId: string, capital: City): boolean {
  return Object.values(state.units).some(unit =>
    unit.owner === civId
    && isCombatLandUnit(unit)
    && mapDistance(state.map, unit.position, capital.position) <= VETERAN_FIRST_USE_RELIEF_RADIUS,
  );
}

/**
 * Every legal strike target for civId, grouped by owner civ, excluding minor
 * civs (city-states) -- #545 MR5 design doc finding #3: the doctrine models
 * deterrence between major nuclear powers, not "may a nuke ever be used on
 * anyone I'm at war with." MR4's human-facing launch flow is intentionally
 * left unchanged; this exclusion is new AI-doctrine-only behavior.
 */
function getMajorCivLegalTargetsByOwner(state: GameState, civId: string): Map<string, City[]> {
  const byOwner = new Map<string, City[]>();
  for (const city of getLegalStrategicLaunchTargets(state, civId)) {
    if (!(city.owner in state.civilizations)) continue;
    const list = byOwner.get(city.owner) ?? [];
    list.push(city);
    byOwner.set(city.owner, list);
  }
  return byOwner;
}

// #545 MR5 design doc finding #4: prefer the opponent's capital for
// narrative weight; otherwise the first legal target. Deliberately not a
// scoring system (YAGNI).
function pickPreferredTarget(state: GameState, targets: City[], opponentCivId: string): City {
  const capital = getCapitalCity(state, opponentCivId);
  return targets.find(city => city.id === capital?.id) ?? targets[0];
}

/**
 * #545 MR5 spec §10: Veteran-only existential-threat gate. All three
 * conditions required -- own capital HP below threshold, a hostile land unit
 * adjacent to it, and no friendly (own) combat land unit within relief
 * radius. Deterministic, no RNG. Callers decide whether to invoke this based
 * on difficulty -- this function itself does not branch on OpponentChallenge.
 * The authorized target is always one of the civs actually threatening the
 * capital (see getCapitalThreateningOwnerIds) -- never an unrelated
 * atWarWith civ that happens to have a legal target.
 */
export function canAuthorizeVeteranFirstUse(state: GameState, civId: string): string | null {
  const capital = getCapitalCity(state, civId);
  if (!capital) return null;
  if ((capital.hp ?? 100) >= VETERAN_FIRST_USE_CAPITAL_HP_THRESHOLD) return null;

  const threateningOwnerIds = getCapitalThreateningOwnerIds(state, civId, capital);
  if (threateningOwnerIds.size === 0) return null;
  if (hasFriendlyReliefNearCapital(state, civId, capital)) return null;

  const civ = state.civilizations[civId];
  if (!civ) return null;
  const targetsByOwner = getMajorCivLegalTargetsByOwner(state, civId);
  for (const opponentId of civ.diplomacy.atWarWith) {
    if (!threateningOwnerIds.has(opponentId)) continue;
    const targets = targetsByOwner.get(opponentId);
    if (targets && targets.length > 0) {
      return pickPreferredTarget(state, targets, opponentId).id;
    }
  }
  return null;
}
