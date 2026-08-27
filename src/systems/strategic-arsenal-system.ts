import type { Civilization, GameState } from '@/core/types';
import { hasMetCivilization } from '@/systems/discovery-system';

const MANHATTAN_PROJECT_ID = 'manhattan_project';

/**
 * Manhattan Project is a milestone national project (#545 -- see this
 * building's definition in city-system.ts) -- once built it never expires,
 * so "has it" is a thin, permanent query against builtNationalProjects, not
 * a separate persisted flag that could drift out of sync.
 */
export function hasManhattanProject(state: GameState, civId: string): boolean {
  return state.builtNationalProjects?.[`${civId}:${MANHATTAN_PROJECT_ID}`] !== undefined;
}

/**
 * #545 MR5 spec §9: one source of truth for "does viewerCivId know ownerCivId
 * has nuclear capability" -- shared verbatim by AI war-scoring
 * (shouldDeclareWar), the diplomacy panel's caution note, and the launch-
 * preview's retaliation-risk note. Never exposes the exact arsenal count --
 * only this boolean.
 */
export function hasKnownStrategicCapability(
  state: GameState,
  viewerCivId: string,
  ownerCivId: string,
): boolean {
  return hasMetCivilization(state, viewerCivId, ownerCivId)
    && hasManhattanProject(state, ownerCivId);
}

const MANHATTAN_PROJECT_BASE_CAPACITY = 1;

/**
 * Every building that contributes to the shared arsenal capacity ceiling.
 * Add a new capacity source by appending a row here -- never by adding
 * another `if (city.buildings.includes(...))` branch to the resolver below.
 */
const ARSENAL_CAPACITY_SOURCES: ReadonlyArray<{ buildingId: string; capacity: number }> = [
  { buildingId: 'nuclear_arsenal', capacity: 2 },
  { buildingId: 'missile_silo', capacity: 1 },
];

/**
 * Shared empire-wide warhead capacity ceiling (#545 spec §1). Zero until
 * Manhattan Project is complete -- capacity-granting buildings are inert
 * without it, proven by the "0 with buildings present but no Manhattan
 * Project" test above. Computed live from current buildings every call;
 * never stored on GameState, so there is nothing to invalidate when a
 * building is lost or the superweapons setting (MR7) is toggled.
 */
export function getStrategicArsenalCapacity(state: GameState, civId: string): number {
  if (!hasManhattanProject(state, civId)) return 0;

  const civ = state.civilizations[civId];
  if (!civ) return 0;

  let capacity = MANHATTAN_PROJECT_BASE_CAPACITY;
  for (const cityId of civ.cities) {
    const city = state.cities[cityId];
    if (!city) continue;
    for (const source of ARSENAL_CAPACITY_SOURCES) {
      if (city.buildings.includes(source.buildingId)) capacity += source.capacity;
    }
  }
  return capacity;
}

/**
 * The one canonical read of a civ's warhead count. Legacy saves (and any
 * civ that has never produced a warhead) have no strategicArsenal field --
 * absent means zero, never undefined-propagates to a caller.
 */
export function getStrategicArsenal(civ: Civilization): number {
  return civ.strategicArsenal ?? 0;
}

/**
 * Completion side-effect for the `warhead` production item (turn-manager.ts calls
 * this when result.completedBuilding === 'warhead', mirroring the existing
 * sacred_council/circular_manufacturing_network completion-hook precedent at that
 * same call site). Immutable per .claude/rules/game-systems.md; a no-op for an
 * unknown civ id rather than throwing, matching this file's other defensive reads.
 */
export function addWarheadToArsenal(state: GameState, civId: string): GameState {
  const civ = state.civilizations[civId];
  if (!civ) return state;
  return {
    ...state,
    civilizations: {
      ...state.civilizations,
      [civId]: { ...civ, strategicArsenal: getStrategicArsenal(civ) + 1 },
    },
  };
}

/**
 * Spend one warhead on a successful strategic strike (#545 MR3, strategic-strike-system.ts
 * calls this only after getStrategicLaunchLegality confirms strategicArsenal >= 1).
 * Floors at 0 defensively -- callers are expected to have already checked legality,
 * but this must never go negative, matching getStrategicArsenal's "absent means zero"
 * convention. Immutable, no-op for an unknown civ, same shape as addWarheadToArsenal.
 */
export function spendStrategicArsenal(state: GameState, civId: string): GameState {
  const civ = state.civilizations[civId];
  if (!civ) return state;
  return {
    ...state,
    civilizations: {
      ...state.civilizations,
      [civId]: { ...civ, strategicArsenal: Math.max(0, getStrategicArsenal(civ) - 1) },
    },
  };
}

/**
 * #545 MR6 spec §12: both signatories are capped at the higher of their two
 * current arsenals, floored at 1 -- never 0. A floor of exactly 0
 * (legitimately reachable: hasKnownStrategicCapability only requires
 * Manhattan Project, not any built warhead) would permanently ban either
 * signatory from ever building one without first breaking the pact, and
 * would leave a Veteran AI with zero possible existential-threat response
 * (ai-strategic-doctrine.ts's gate requires strategicArsenal >= 1).
 */
export function computeArmsControlCap(state: GameState, civAId: string, civBId: string): number {
  const civA = state.civilizations[civAId];
  const civB = state.civilizations[civBId];
  return Math.max(
    civA ? getStrategicArsenal(civA) : 0,
    civB ? getStrategicArsenal(civB) : 0,
    1,
  );
}

/**
 * Most-restrictive (minimum) cap across every active arms_control_pact this
 * civ is a party to -- a civ can sign multiple pacts with different
 * partners at different caps; each is independently binding.
 *
 * `civ.diplomacy.treaties` is defensively defaulted to `[]` -- this is now
 * called unconditionally from getArsenalStatus, which itself is threaded
 * through getAvailableBuildings' many call sites (production candidates,
 * planning, city panel). Numerous pre-existing test fixtures across the
 * codebase construct partial Civilization/DiplomacyState objects that omit
 * `treaties` entirely; without this guard every one of them throws here.
 */
export function getActiveArmsControlCap(state: GameState, civId: string): number | null {
  const civ = state.civilizations[civId];
  if (!civ) return null;
  const caps = (civ.diplomacy.treaties ?? [])
    .filter(t => t.type === 'arms_control_pact' && (t.civA === civId || t.civB === civId))
    .map(t => t.arsenalCap)
    .filter((cap): cap is number => cap !== undefined);
  return caps.length > 0 ? Math.min(...caps) : null;
}

/**
 * #545 MR6: single shared computation, replacing four previously-duplicated
 * inline { hasManhattanProject, atCapacity } object literals (city-panel.ts,
 * ai-production.ts, planning-system.ts x2). Folds the arms-control treaty
 * cap into the same atCapacity boolean getAvailableBuildings already uses to
 * gate warhead production -- no separate enforcement pass needed.
 */
export function getArsenalStatus(state: GameState, civId: string): { hasManhattanProject: boolean; atCapacity: boolean } {
  const civ = state.civilizations[civId];
  const current = civ ? getStrategicArsenal(civ) : 0;
  const physicalCap = getStrategicArsenalCapacity(state, civId);
  const treatyCap = getActiveArmsControlCap(state, civId);
  const effectiveCap = treatyCap !== null ? Math.min(physicalCap, treatyCap) : physicalCap;
  return {
    hasManhattanProject: hasManhattanProject(state, civId),
    atCapacity: current >= effectiveCap,
  };
}
