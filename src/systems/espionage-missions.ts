import type {
  AdvisorType,
  CivBonusEffect,
  EspionageCivState,
  GameState,
  HexCoord,
  SpyMission,
  SpyMissionType,
  UnitType,
} from '@/core/types';
import type { Treaty } from '@/core/types/diplomacy';
import { createRng } from './map-generator';
import { hexDistance } from './hex-utils';
import { getCapitalCityId } from './capital-system';
import { resolveWorldPressureFlags } from './world-pressure-flags';
import { getActiveCrisisForCiv } from './crisis-interaction-definitions';
import { getMissionDuration, missionRequiresPlacedSpy } from './espionage-catalog';

/**
 * Mission commands and pure result resolution (#1009).
 *
 * `startMission` returns a typed `StartMissionResult` (#1222) and never throws for a stale
 * or invalid command; it mutates nothing on refusal.
 * `resolveMissionResult` is a pure read of `GameState` returning a
 * `MissionResult` payload; applying that payload (state mutation, events,
 * diplomacy) happens in `espionage-turn.ts`. Both preserve the original RNG
 * seed strings and draw order exactly.
 */
// --- Mission lifecycle ---

/**
 * Why a mission could not be started (#1222). Every reason is about the acting civ's own spy,
 * so none of them can reveal hidden information about a foreign city or civ.
 */
export type StartMissionFailureReason =
  | 'spy-not-found'
  | 'spy-not-stationed'
  | 'spy-unavailable'
  | 'target-missing';

export const START_MISSION_FAILURE_MESSAGES: Record<StartMissionFailureReason, string> = {
  'spy-not-found': 'That spy is no longer available.',
  'spy-not-stationed': 'This spy is not stationed in a foreign city, so it cannot start that mission right now.',
  'spy-unavailable': 'This spy is busy or out of action, so it cannot start a mission right now.',
  'target-missing': 'This mission needs a target city, and none has been chosen.',
};

export type StartMissionResult =
  | { ok: true; state: EspionageCivState }
  | { ok: false; state: EspionageCivState; reason: StartMissionFailureReason };

export interface MissionStartOptions {
  /**
   * The caller will pick the target after asking (the panel offers a remote mission before it
   * prompts for the city). Skips only the target check; every spy-state check still applies.
   */
  targetToBeChosen?: boolean;
}

/**
 * The one eligibility source for starting a mission: the panel's offer list and `startMission`
 * both ask it, so "offered" cannot drift from "executable". Returns `null` when legal.
 * Tech gating stays in `getAvailableMissions` (techs are never lost, so it cannot go stale).
 */
export function getMissionStartDenial(
  state: EspionageCivState,
  spyId: string,
  missionType: SpyMissionType,
  targetCivId?: string,
  targetCityId?: string,
  options: MissionStartOptions = {},
): StartMissionFailureReason | null {
  const spy = state.spies[spyId];
  if (!spy) return 'spy-not-found';
  if (missionRequiresPlacedSpy(missionType)) {
    if (spy.status !== 'stationed') return 'spy-not-stationed';
  } else if (!['idle', 'stationed'].includes(spy.status)) {
    return 'spy-unavailable';
  }
  if (!options.targetToBeChosen) {
    if (!(targetCivId ?? spy.targetCivId) || !(targetCityId ?? spy.targetCityId)) return 'target-missing';
  }
  return null;
}

export function startMission(
  state: EspionageCivState,
  spyId: string,
  missionType: SpyMissionType,
  civBonusEffect?: CivBonusEffect,
  targetCivId?: string,
  targetCityId?: string,
): StartMissionResult {
  const denial = getMissionStartDenial(state, spyId, missionType, targetCivId, targetCityId);
  if (denial) return { ok: false, state, reason: denial };
  const spy = state.spies[spyId];
  const effectiveTargetCivId = (targetCivId ?? spy.targetCivId) as string;
  const effectiveTargetCityId = (targetCityId ?? spy.targetCityId) as string;

  let duration = getMissionDuration(missionType);
  if (civBonusEffect?.type === 'espionage_growth') {
    duration = Math.max(1, duration - 1);
  }
  const mission: SpyMission = {
    type: missionType,
    turnsRemaining: duration,
    turnsTotal: duration,
    targetCivId: effectiveTargetCivId,
    targetCityId: effectiveTargetCityId,
  };

  return {
    ok: true,
    state: {
      ...state,
      spies: {
        ...state.spies,
        [spyId]: {
          ...spy,
          targetCivId: effectiveTargetCivId,
          targetCityId: effectiveTargetCityId,
          status: 'on_mission',
          currentMission: mission,
        },
      },
    },
  };
}

// --- Mission result resolution ---

export interface MissionResult {
  // gather_intel
  techProgress?: { completed: string[]; currentResearch: string | null; researchProgress: number };
  treasury?: number;
  treaties?: Treaty[];
  // identify_resources
  resources?: string[];
  // monitor_diplomacy
  relationships?: Record<string, number>;
  tradePartners?: string[];
  // scout_area
  tilesToReveal?: HexCoord[];
  // monitor_troops
  nearbyUnits?: Array<{ type: UnitType; position: HexCoord; health: number }>;
  // steal_tech
  stolenTechId?: string;
  // sabotage_production
  productionLost?: number;       // production progress points destroyed
  productionDisabledTurns?: number;
  // incite_unrest / fund_rebels
  unrestInjected?: number;       // spyUnrestBonus amount added
  stabilityPenaltyTurns?: number;
  // assassinate_advisor
  assassinatedAdvisor?: AdvisorType;
  disabledUntilTurn?: number;
  // forge_documents
  forgeCivA?: string;
  forgeCivB?: string;
  forgeRelationshipPenalty?: number;
  // arms_smuggling
  spawnPosition?: HexCoord;
  researchPenaltyTurns?: number;
  researchPenaltyMultiplier?: number;
  grantTerritoryVision?: boolean;
  // sabotage_relief (#526 MR7): the outbreak crisis to pause, if the target civ has one
  // eligible (active, no existing sabotage already in place).
  sabotageCrisisId?: string;
  // flip_loyalty (#524 MR2a): the city and its former owner, if the flip is eligible
  // (non-capital, still owned by targetCivId).
  flippedCityId?: string;
  flippedFromCivId?: string;
  // intercept_courier (#442 MR1): the trade route to sever, if the target city has one.
  // processEspionageTurn owns the removal through trade-system's removeRouteById (#1201).
  interceptedRouteId?: string;
  interceptedFromCityId?: string;
  interceptedToCityId?: string;
  // bribe_official (#442 MR1): capped gold transfer from the target's treasury.
  bribedGoldAmount?: number;
  // expose_scandal (#442 MR2): every other civ whose relationship with the target sours,
  // already capped/deduped.
  exposedPartnerCivIds?: string[];
  // signals_intercept (#442 MR2) reuses the nearbyUnits shape from monitor_troops above
  // (same field, generalized from one city's radius to the whole target civ).
}

const SCOUT_VISION_RADIUS = 3;
const TROOP_MONITOR_RADIUS = 4;
// #442 MR1 bribe_official: capped both as a fraction and an absolute amount so a single
// mission can't cripple a civ's treasury in one hit (game-balance.md "never permanently
// cripple a city/civ from one successful spy action").
const BRIBE_GOLD_FRACTION = 0.15;
const BRIBE_GOLD_CAP = 200;
// #442 MR2 expose_scandal: bounded per-partner penalty and a cap on affected partners so
// a maximally-connected civ can't be devastated in one mission (game-balance.md "never
// permanently cripple a city/civ from one successful spy action").
export const EXPOSE_SCANDAL_PENALTY = -10;
const EXPOSE_SCANDAL_MAX_PARTNERS = 4;

export function resolveMissionResult(
  missionType: SpyMissionType,
  targetCivId: string,
  targetCityId: string,
  gameState: GameState,
  spyingCivId: string,
  spyId: string,
): MissionResult {
  const targetCiv = gameState.civilizations[targetCivId];
  const targetCity = gameState.cities[targetCityId];

  switch (missionType) {
    case 'gather_intel': {
      return {
        techProgress: targetCiv ? {
          completed: [...targetCiv.techState.completed],
          currentResearch: targetCiv.techState.currentResearch,
          researchProgress: targetCiv.techState.researchProgress,
        } : undefined,
        treasury: targetCiv?.gold,
        treaties: targetCiv?.diplomacy.treaties
          ? [...targetCiv.diplomacy.treaties]
          : [],
      };
    }

    case 'identify_resources': {
      if (!targetCity) return {};
      const resources: string[] = [];
      for (const tileCoord of targetCity.ownedTiles) {
        const key = `${tileCoord.q},${tileCoord.r}`;
        const tile = gameState.map.tiles[key];
        if (tile?.resource && !resources.includes(tile.resource)) {
          resources.push(tile.resource);
        }
      }
      return { resources };
    }

    case 'monitor_diplomacy': {
      if (!targetCiv) return {};
      const relationships = { ...targetCiv.diplomacy.relationships };
      const tradePartners = targetCiv.diplomacy.treaties
        .filter(t => t.type === 'trade_agreement')
        .map(t => t.civA === targetCivId ? t.civB : t.civA);
      return { relationships, tradePartners };
    }

    case 'scout_area': {
      if (!targetCity) return {};
      const tilesToReveal: HexCoord[] = [];
      for (const key of Object.keys(gameState.map.tiles)) {
        const [q, r] = key.split(',').map(Number);
        if (hexDistance({ q, r }, targetCity.position) <= SCOUT_VISION_RADIUS) {
          tilesToReveal.push({ q, r });
        }
      }
      return { tilesToReveal };
    }

    case 'monitor_troops': {
      if (!targetCity) return {};
      const nearbyUnits: Array<{ type: UnitType; position: HexCoord; health: number }> = [];
      for (const unit of Object.values(gameState.units)) {
        if (unit.owner === targetCivId &&
            hexDistance(unit.position, targetCity.position) <= TROOP_MONITOR_RADIUS) {
          nearbyUnits.push({
            type: unit.type,
            position: { ...unit.position },
            health: unit.health,
          });
        }
      }
      return { nearbyUnits };
    }

    case 'steal_tech': {
      const targetCiv = gameState.civilizations[targetCivId];
      const myCiv = gameState.civilizations[spyingCivId];
      if (!targetCiv || !myCiv) return {};
      const theyHave = targetCiv.techState.completed;
      const iHave = new Set(myCiv.techState.completed);
      const spy = gameState.espionage?.[spyingCivId]?.spies[spyId];
      const alreadyStolen = new Set(spy?.stolenTechFrom?.[targetCivId] ?? []);
      const stealable = theyHave.filter(t => !iHave.has(t) && !alreadyStolen.has(t));
      if (stealable.length === 0) return {};
      const rng = createRng(`steal-${spyId}-${targetCivId}-${targetCityId}-${gameState.turn}`);
      const idx = Math.floor(rng() * stealable.length);
      return { stolenTechId: stealable[idx] };
    }

    case 'sabotage_production': {
      const targetCity = gameState.cities[targetCityId];
      if (!targetCity || targetCity.productionQueue.length === 0) return {};
      const rng = createRng(`sab-${spyId}-${targetCityId}-${gameState.turn}`);
      const lostTurns = 3 + Math.floor(rng() * 3); // 3-5 turns
      const lostProgress = lostTurns * 5; // ~5 production/turn
      return { productionLost: lostProgress };
    }

    // sabotage_relief (#526 MR7): only eligible against an active OUTBREAK crisis with
    // no sabotage already in place ("one active sabotage per crisis, across all
    // actors") -- catastrophe crises have no remedy timer to pause. Flag-gated the same
    // way canSendAid gates send_aid: 'off'/'benign' keep this hook dark.
    case 'sabotage_relief': {
      if (resolveWorldPressureFlags(gameState.settings).aiCrisisInteractions !== 'full') return {};
      const crisis = getActiveCrisisForCiv(gameState, targetCivId, 'outbreak');
      if (!crisis || crisis.sabotage) return {};
      return { sabotageCrisisId: crisis.id };
    }

    case 'incite_unrest': {
      return { unrestInjected: 25 };
    }

    case 'fund_rebels': {
      const targetCity = gameState.cities[targetCityId];
      if (!targetCity || targetCity.unrestLevel === 0) return {};
      return { unrestInjected: 35 };
    }

    // flip_loyalty (#524 MR2a): capitals never flip -- mirrors the targetIsCapital guard
    // already used elsewhere in this file (see getEspionageModifierBreakdown).
    //
    // Review fix: only real civs (state.civilizations entries) are eligible. Minor civs
    // (state.minorCivs, keyed separately, with exactly one city and no `civilizations`
    // entry) and any other non-civilizations owner (e.g. 'rebels') must never be flip
    // targets -- transferCapturedCityOwnership and eliminateCivilization only know how
    // to update civilizations records, so annexing a minor civ's city this way would
    // leave its MinorCivState dangling (stale cityId, isDestroyed still false) and its
    // garrison units stranded inside a city it no longer owns. getCapitalCityId already
    // silently returns null for a minor civ id (it only checks civilizations), which is
    // exactly why the capital guard above was not sufficient by itself.
    case 'flip_loyalty': {
      const targetCity = gameState.cities[targetCityId];
      if (!targetCity) return {};
      if (!gameState.civilizations[targetCivId]) return {};
      if (getCapitalCityId(gameState, targetCivId) === targetCityId) return {};
      if (targetCity.owner !== targetCivId) return {}; // already changed hands this turn
      return { flippedCityId: targetCityId, flippedFromCivId: targetCivId };
    }

    // Review finding: this comment previously read "handled by assignSpyDefensive" — no
    // function by that name exists in this file. The actual player-facing defensive
    // posture is embedSpy (raises counterIntelligence[cityId] directly, sets spy.status
    // to 'embedded', never touches currentMission or this SpyMissionType at all). This
    // case, resolveMissionResult itself being called for 'counter_espionage', and
    // startMission accepting it are all currently unreachable: getAvailableMissions()'s
    // STAGE_3_MISSIONS omits it from every catalog/AI-selection path (see
    // MISSION_BASE_SUCCESS's comment). Left in place rather than removed as dead code —
    // that cleanup is unrelated to this fix's scope.
    case 'counter_espionage': {
      return {};
    }

    // intercept_courier (#442 MR1): pick the highest-value route touching the target
    // city (either endpoint) — deterministic so the UI's advertised effect ("severs a
    // trade route") is predictable rather than random among several. No eligible route
    // (city has no active trade) means no effect, same "not always optimal" shape as
    // fund_rebels' unrestLevel guard above.
    case 'intercept_courier': {
      const targetCity = gameState.cities[targetCityId];
      if (!targetCity || targetCity.owner !== targetCivId) return {};
      const routes = (gameState.marketplace?.tradeRoutes ?? []).filter(
        r => r.fromCityId === targetCityId || r.toCityId === targetCityId,
      );
      if (routes.length === 0) return {};
      const route = [...routes].sort(
        (a, b) => b.goldPerTrip - a.goldPerTrip || a.id.localeCompare(b.id),
      )[0];
      return {
        interceptedRouteId: route.id,
        interceptedFromCityId: route.fromCityId,
        interceptedToCityId: route.toCityId,
      };
    }

    // bribe_official (#442 MR1): a target with no gold has nothing to steal — no effect,
    // matching fund_rebels' eligibility-guard shape.
    case 'bribe_official': {
      const targetCiv = gameState.civilizations[targetCivId];
      if (!targetCiv || targetCiv.gold <= 0) return {};
      const amount = Math.min(Math.round(targetCiv.gold * BRIBE_GOLD_FRACTION), BRIBE_GOLD_CAP);
      if (amount <= 0) return {};
      return { bribedGoldAmount: amount };
    }

    // expose_scandal (#442 MR2): the first multilateral (non-bilateral) relationship
    // mission — every existing one touches exactly two civs. A target with no treaties
    // (with civs other than the spying civ itself) is not a valid/valuable target, same
    // "not always optimal" shape as fund_rebels' unrestLevel guard. Deterministic partner
    // selection (sorted, capped) keeps the advertised "up to 4 partners" bound honest.
    case 'expose_scandal': {
      const targetCiv = gameState.civilizations[targetCivId];
      if (!targetCiv) return {};
      const partners = new Set<string>();
      for (const treaty of targetCiv.diplomacy.treaties) {
        const partner = treaty.civA === targetCivId ? treaty.civB : treaty.civA;
        if (partner === targetCivId || partner === spyingCivId) continue;
        if (!gameState.civilizations[partner]) continue; // major civs only
        partners.add(partner);
      }
      if (partners.size === 0) return {};
      const exposedPartnerCivIds = [...partners].sort().slice(0, EXPOSE_SCANDAL_MAX_PARTNERS);
      return { exposedPartnerCivIds };
    }

    // signals_intercept (#442 MR2): generalizes monitor_troops from a single city's
    // radius to the whole target civ — reuses its nearbyUnits shape. Remote-capable (see
    // missionRequiresPlacedSpy), so targetCityId is unused here (same as
    // satellite_surveillance ignoring it).
    case 'signals_intercept': {
      const targetCiv = gameState.civilizations[targetCivId];
      if (!targetCiv) return {};
      const nearbyUnits: Array<{ type: UnitType; position: HexCoord; health: number }> = [];
      for (const unit of Object.values(gameState.units)) {
        if (unit.owner === targetCivId) {
          nearbyUnits.push({ type: unit.type, position: { ...unit.position }, health: unit.health });
        }
      }
      return { nearbyUnits };
    }

    case 'assassinate_advisor': {
      const advisorTypes: AdvisorType[] = ['builder', 'explorer', 'chancellor', 'warchief', 'treasurer', 'scholar', 'spymaster'];
      const rng = createRng(`assassin-${spyId}-${targetCivId}-${gameState.turn}`);
      const idx = Math.floor(rng() * advisorTypes.length);
      const assassinatedAdvisor = advisorTypes[idx];
      const disabledUntilTurn = gameState.turn + 10;
      return { assassinatedAdvisor, disabledUntilTurn };
    }

    case 'forge_documents': {
      const allCivIds = Object.keys(gameState.civilizations).filter(
        id => id !== targetCivId && id !== spyingCivId,
      );
      if (allCivIds.length < 1) return {};
      const rng = createRng(`forge-${spyId}-${targetCivId}-${gameState.turn}`);
      const idx = Math.floor(rng() * allCivIds.length);
      return { forgeCivA: targetCivId, forgeCivB: allCivIds[idx], forgeRelationshipPenalty: -25 };
    }

    case 'arms_smuggling': {
      const targetCity = gameState.cities[targetCityId];
      if (!targetCity) return {};
      const rng = createRng(`arms-${spyId}-${targetCityId}-${gameState.turn}`);
      const offsets = [
        { q: 1, r: 0 }, { q: -1, r: 0 }, { q: 0, r: 1 },
        { q: 0, r: -1 }, { q: 1, r: -1 }, { q: -1, r: 1 },
      ];
      const offset = offsets[Math.floor(rng() * offsets.length)];
      const spawnPosition: HexCoord = {
        q: targetCity.position.q + offset.q,
        r: targetCity.position.r + offset.r,
      };
      return { spawnPosition };
    }

    case 'cyber_attack': {
      return { productionDisabledTurns: 3 };
    }

    case 'misinformation_campaign': {
      return { researchPenaltyTurns: 10, researchPenaltyMultiplier: 0.2 };
    }

    case 'election_interference': {
      return { stabilityPenaltyTurns: 15, unrestInjected: 20 };
    }

    case 'satellite_surveillance': {
      return { grantTerritoryVision: true };
    }

    default:
      return {};
  }
}
