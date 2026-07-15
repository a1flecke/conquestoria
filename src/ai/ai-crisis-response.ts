import type { ActiveCrisis, City, GameState, Unit } from '@/core/types';
import { getChallengeProfileForCiv, resolveChallengeForCiv } from '@/core/opponent-challenge';
import { getPirateFleetLeader } from '@/systems/pirate-behavior';
import { isVisible } from '@/systems/fog-of-war';
import { applyQuarantine, applyRemedy } from '@/systems/crisis-system';
import { getCityAppeaseCost } from '@/systems/faction-system';
import { canRestoreLand } from '@/systems/improvement-system';
import { getWorkerChargesRemaining } from '@/systems/worker-action-system';
import { findPath } from '@/systems/unit-system';
import { hexKey } from '@/systems/hex-utils';

export interface CrisisDispatchCandidate {
  kind: 'pirate-fleet' | 'hunt-foe';
  sourceId: string;        // fleetId or crisisId — used for expiry checks
  targetUnitId: string;    // the pirate ship / hunt foe unit
  score: number;           // base score × profile.crisisDispatchWeight
}

// 100 matches the ceiling of AICityThreat.captureRisk (ai-plan-portfolio.ts), the
// existing defend-city candidate magnitude this competes against for primaryPlan.
const PIRATE_FLEET_DISPATCH_BASE_SCORE = 100;

export function getCrisisDispatchCandidates(state: GameState, civId: string): CrisisDispatchCandidate[] {
  const civ = state.civilizations[civId];
  const profile = getChallengeProfileForCiv(state, civId);
  const candidates: CrisisDispatchCandidate[] = [];
  for (const factionId of Object.keys(state.pirates?.factions ?? {}).sort()) {
    const faction = state.pirates!.factions[factionId];
    if (faction.intent?.targetCivId !== civId) continue;
    const leader = getPirateFleetLeader(state, factionId);
    if (!leader) continue;
    // Fog-of-war legitimacy: a dispatch candidate is an "exact target" plan
    // (ai-playability-fixture.ts's targetWasPerceived invariant) -- the civ
    // must actually currently see the fleet leader's tile, not just know its
    // faction is targeting them.
    if (!civ?.visibility || !isVisible(civ.visibility, leader.position)) continue;
    candidates.push({
      kind: 'pirate-fleet',
      sourceId: factionId,
      targetUnitId: leader.id,
      score: PIRATE_FLEET_DISPATCH_BASE_SCORE * profile.crisisDispatchWeight,
    });
  }
  return candidates;
}

// ── Crisis response policy (#529 MR3 Task 3.2) ──────────────────────────────
// AI civs quarantine and fund remedies for their own outbreak crises through
// the same applyQuarantine/applyRemedy helpers the human UI calls — humans
// are never processed here; their crisis choices stay theirs.

export type CrisisResponseAction =
  | { kind: 'quarantine'; crisisId: string; cityId: string }
  | { kind: 'fund-remedy'; crisisId: string; cityId: string }
  | { kind: 'restore'; crisisId: string; tileKey: string; workerUnitId: string };

// ── Catastrophe restoration tasking (#526 MR4) ──────────────────────────────
// Pairs idle owned workers with the nearest canRestoreLand-eligible tile in a
// catastrophe crisis's tileKeys, once age >= crisisResponseDelayTurns. This is
// a pure targeting decision — the actual movement + restore_land execution
// happens in the AI tactical worker-assignment layer (ai-tactics.ts), which
// consults this same function so both stay in lockstep turn to turn.
export function getCrisisRestoreAssignments(
  state: GameState,
  civId: string,
): Extract<CrisisResponseAction, { kind: 'restore' }>[] {
  const civ = state.civilizations[civId];
  if (!civ || civ.isHuman) return [];
  const profile = getChallengeProfileForCiv(state, civId);

  const crises = Object.values(state.activeCrises ?? {})
    .filter((c): c is ActiveCrisis =>
      c.targetCivId === civId && c.archetype === 'catastrophe' && c.stage === 'recovery')
    .sort((a, b) => a.id.localeCompare(b.id));
  if (crises.length === 0) return [];

  const cityCenterKeys = new Set(Object.values(state.cities).map(city => hexKey(city.position)));

  const tileCandidates: { crisisId: string; tileKey: string; coord: Unit['position'] }[] = [];
  for (const crisis of crises) {
    const age = state.turn - crisis.startedTurn;
    if (age < profile.crisisResponseDelayTurns) continue;
    for (const tileKey of crisis.tileKeys) {
      const tile = state.map.tiles[tileKey];
      if (!tile) continue;
      if (!canRestoreLand(tile, civId, { isCityTile: cityCenterKeys.has(tileKey), currentTurn: state.turn })) continue;
      tileCandidates.push({ crisisId: crisis.id, tileKey, coord: tile.coord });
    }
  }
  if (tileCandidates.length === 0) return [];
  tileCandidates.sort((a, b) => a.tileKey.localeCompare(b.tileKey));

  const idleWorkers = Object.values(state.units)
    .filter((unit): unit is Unit =>
      unit.owner === civId && unit.type === 'worker' && !unit.hasActed
      && getWorkerChargesRemaining(unit) > 0 && !unit.workerTask && !unit.committedToRouteId)
    .sort((a, b) => a.id.localeCompare(b.id));

  const assignedWorkerIds = new Set<string>();
  const results: Extract<CrisisResponseAction, { kind: 'restore' }>[] = [];
  for (const candidate of tileCandidates) {
    let best: { worker: Unit; length: number } | null = null;
    for (const worker of idleWorkers) {
      if (assignedWorkerIds.has(worker.id)) continue;
      const path = findPath(worker.position, candidate.coord, state.map, 'land');
      const length = path ? path.length : Infinity;
      if (!Number.isFinite(length)) continue;
      if (!best || length < best.length || (length === best.length && worker.id < best.worker.id)) {
        best = { worker, length };
      }
    }
    if (best) {
      assignedWorkerIds.add(best.worker.id);
      results.push({ kind: 'restore', crisisId: candidate.crisisId, tileKey: candidate.tileKey, workerUnitId: best.worker.id });
    }
  }
  return results;
}

export function getCrisisResponseActions(state: GameState, civId: string): CrisisResponseAction[] {
  const civ = state.civilizations[civId];
  if (!civ || civ.isHuman) return [];
  const profile = getChallengeProfileForCiv(state, civId);
  // Tougher-difficulty AI escalates to quarantine on a smaller outbreak (2 infected
  // cities) rather than waiting for 3 — same competence axis as crisisResponseDelayTurns.
  const spreadThreshold = 2 + (resolveChallengeForCiv(state, civId) === 'veteran' ? 0 : 1);

  const crises = Object.values(state.activeCrises ?? {})
    .filter((c): c is ActiveCrisis => c.targetCivId === civId && c.archetype === 'outbreak')
    .sort((a, b) => a.id.localeCompare(b.id));

  const actions: CrisisResponseAction[] = [];

  for (const crisis of crises) {
    const age = state.turn - crisis.startedTurn;
    if (age < profile.crisisResponseDelayTurns && crisis.cityIds.length < spreadThreshold) continue;
    const candidate = crisis.cityIds
      .filter(id => !crisis.quarantinedCityIds?.includes(id))
      .map(id => state.cities[id])
      .filter((c): c is City => !!c)
      .sort((a, b) => a.population - b.population || a.id.localeCompare(b.id))[0];
    if (candidate) actions.push({ kind: 'quarantine', crisisId: crisis.id, cityId: candidate.id });
  }

  // One remedy per civ per turn: the most-populous infected city across ALL of
  // this civ's outbreak crises that doesn't already have a remedy underway.
  let bestRemedy: { crisisId: string; city: City } | null = null;
  for (const crisis of crises) {
    for (const cityId of crisis.cityIds) {
      if (crisis.remedyCompletionByCity?.[cityId] !== undefined) continue;
      const city = state.cities[cityId];
      if (!city) continue;
      if (!bestRemedy || city.population > bestRemedy.city.population ||
          (city.population === bestRemedy.city.population && city.id < bestRemedy.city.id)) {
        bestRemedy = { crisisId: crisis.id, city };
      }
    }
  }
  if (bestRemedy) {
    const cost = getCityAppeaseCost(bestRemedy.city);
    if (civ.gold >= cost * profile.crisisRemedyGoldMultiplier) {
      actions.push({ kind: 'fund-remedy', crisisId: bestRemedy.crisisId, cityId: bestRemedy.city.id });
    }
  }

  actions.push(...getCrisisRestoreAssignments(state, civId));

  return actions;
}

export function applyCrisisResponses(state: GameState): GameState {
  let next = state;
  for (const civId of Object.keys(next.civilizations).sort()) {
    for (const action of getCrisisResponseActions(next, civId)) {
      // 'restore' requires unit movement to reach the tile — it's executed via
      // the AI tactical worker-assignment layer (ai-tactics.ts), not here.
      if (action.kind === 'quarantine') next = applyQuarantine(next, action.crisisId, action.cityId).state;
      else if (action.kind === 'fund-remedy') next = applyRemedy(next, action.crisisId, action.cityId).state;
    }
  }
  return next;
}
