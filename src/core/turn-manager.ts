import { lehmerFoldByCodePoint } from '@/systems/deterministic-hash';
import type { AdvisorType, GameState } from './types';
import { EventBus } from './event-bus';
import { finalizeDominationVictory, finalizeScienceVictory } from '@/systems/victory-system';
import { UNIT_DEFINITIONS } from '@/systems/unit-definitions';
import { healUnit } from '@/systems/unit-healing';
import { resetUnitTurn, createUnit } from '@/systems/unit-lifecycle';
import { getBlockingMapEntityKeysForOwner } from '@/systems/unit-movement-legality';
import { findPath } from '@/systems/unit-pathfinding';
import { getLocalCityHealingBonus, processCity, TRAINABLE_UNITS, BUILDINGS } from '@/systems/city-system';
import { canCompleteAirUnitProduction } from '@/systems/air-operations-system';
import { applyCityMaturity } from '@/systems/city-maturity-system';
import { assignCityFocus, normalizeWorkedTilesForCity } from '@/systems/city-work-system';
import { applyResearchBonus, processResearch, getTechById, getEffectiveTechCost } from '@/systems/tech-system';
import { calculateCivResearchOutput } from '@/systems/research-output-system';
import { appendLegendaryWonderNetworkPlanResolutions } from '@/systems/legendary-wonder-history';
import {
  processPurposefulBarbarians,
} from '@/systems/barbarian-system';
import {
  processBeasts, placeBeastLairs, BEAST_OWNER,
  LAIR_GROWTH_INTERVAL_TURNS, LAIR_GROWTH_CAP, LAIR_GROWTH_EXPERIENCE,
  applyHoardChoice, getClaimedTrophyGoldPerTurn,
} from '@/systems/beast-system';
import { BEAST_DEFINITIONS } from '@/systems/beast-definitions';
import { deterministicCombatSeed, getUnitCombatStrength, resolveCombat } from '@/systems/combat-system';
import { buildCombatContextForDefender } from '@/systems/combat-context';
import { resolveUnitVsUnitAttack } from '@/systems/attack-targeting';
import { applyCombatOutcomeToState } from '@/systems/combat-reward-system';
import { resolveLandSupplyForCiv } from '@/systems/supply-system';
import { resolveNavalOperationsForCiv } from '@/systems/naval-operations';
import { resolveAirReadinessForCiv } from '@/systems/air-readiness';
import { getRestAvailability } from '@/systems/supply-combat';
import { applyPillageToState } from '@/systems/pillage-system';
import {
  PIRATE_OWNER,
  processIndependentThreatPressure,
  } from '@/systems/threat-pressure-system';
import { emitMinorCivQuestTransitions } from '@/systems/quest-chain-system';
import { applyAutoExploreOrder } from '@/systems/auto-explore-system';
import { computeAdministrativeExploreLeash } from '@/ai/ai-exploration';
import { hexKey } from '@/systems/hex-utils';
import { executeUnitMove } from '@/systems/unit-movement-system';
import { resolveUnitCityBombardment } from '@/systems/city-bombardment-system';
import { resolveCityInteraction } from '@/systems/city-interaction';
import { buildCombatPresentation } from '@/systems/viewer-event-presentation';
import { calculateCityYields } from '@/systems/resource-system';
import { getNetworkCityYieldBonus, getNetworkUnitVisionBonus } from '@/systems/network-infrastructure-plans';
import { advanceAutonomySurge, applyPendingAutonomyPosture } from '@/systems/autonomy-postures';
import { getCivResourceYieldBonus, getCivHappinessFromResources } from '@/systems/resource-acquisition-system';
import {
  getEmpireTechPercents,
  getCivLuxuryTechGold,
  getEmpireFlatTechYields,
  getLowestCityScienceBonus,
  getCivWonderTechGold,
  getCivRoutePartnerTechGold,
} from '@/systems/tech-yield-system';
import type { HexCoord } from './types';
import { applyReconReveals, updateVisibility, revealMinorCivCities, applySharedVision, applySatelliteSurveillance, applyMassSurveillanceReveal } from '@/systems/fog-of-war';
import { chooseCircularManufacturingMaterial, getActiveNationalProjectsForCiv } from '@/systems/national-project-system';
import { buildProductionCostContext } from '@/systems/production-cost-context';
import { getHealingBonus, getVisionBonus, isWithinRangeOfNeuralRehabilitationCenter, isWithinRangeOfTelemedicineHub } from '@/systems/unit-modifier-system';
import { syncCivilizationContactsFromVisibility } from '@/systems/discovery-system';
import { refreshLastSeenPresentationsForCiv } from '@/systems/last-seen-presentation';
import { joinEmbargo, cleanupEmbargoes } from '@/systems/diplomacy-embargoes';
import { checkLeagueDissolution, triggerLeagueDefense, getLeagueForCiv } from '@/systems/diplomacy-leagues';
import { isAtWar } from '@/systems/diplomacy-queries';
import { pruneExpiredDiplomaticRequests } from '@/systems/diplomacy-requests';
import { processRelationshipDrift, decayEvents } from '@/systems/diplomacy-state';
import { decayTreachery } from '@/systems/diplomacy-treachery';
import { tickTreaties } from '@/systems/diplomacy-treaties';
import { processVassalageTribute, getVassalageMilitaryCount } from '@/systems/diplomacy-vassal-rules';
import { processVassalageTurn } from '@/systems/diplomacy-vassalage';
import { processTradeRouteIncome, processFashionCycle, updatePrices, scrubStaleForeignRoutes, scrubEmbargoedRoutes } from '@/systems/trade-system';
import { advanceRouteRunners } from '@/systems/unit-movement-system';
import { processWonderEffects } from '@/systems/wonder-system';
import { createRng } from '@/systems/map-generator';
import { processMinorCivTurn, checkEraAdvancement, processMinorCivEraUpgrade, checkCampEvolution } from '@/systems/minor-civ-system';
import { resolveCivilizationEra } from '@/systems/tech-definitions';
import { createSimulationRng } from '@/systems/simulation-rng';
import { resolveCombatEra, resolveNeutralPressureEra } from '@/systems/era-resolution';
import { resolveCivDefinition } from '@/systems/civ-registry';
import { applyProductionBonus } from '@/systems/city-system';
import { applyGeneTherapyRecharge } from '@/systems/gene-therapy-system';
import { applyResearchCompletionConsequences } from '@/systems/tech-completion-system';
import { processCyberDrain } from '@/systems/cyber-warfare-system';
import {
  beginNetworkPlansForVictimTurn,
  isAutonomyActivated,
  resolveNetworkPlansForVictimTurnEnd,
  resolveStableNetworkPlansForOwnerTurn,
} from '@/systems/network-plan-system';
import { processEspionageTurn, processInterrogation, applyBuildingCI } from '@/systems/espionage-system';
import { processDetection } from '@/systems/detection-system';
import { applyPendingOpponentChallenge, resolveChallengeForCiv } from '@/core/opponent-challenge';
import { applyCityHpRegeneration, applyCitySiegeOutcome, getCityCounterFireDamage, getCityGarrisonUnit, resolveCitySiegeDamage } from '@/systems/city-siege-system';
import { normalizeOpponentAIState } from '@/core/opponent-ai-state';
import {
  emitCivilizationLivenessTransitions,
  reconcileCivilizationLiveness,
} from '@/systems/civilization-elimination-system';
import { processFactionTurn, getUnrestYieldMultiplier, isCityProductionLocked, getFederalismRemittanceLoss } from '@/systems/faction-system';
import { getOccupiedCityYieldMultiplier, tickOccupiedCities } from '@/systems/city-occupation-system';
import { processBreakawayTurn } from '@/systems/breakaway-system';
import { processCrisisTurn, processCrisisScheduler, getCrisisYieldMultiplier } from '@/systems/crisis-system';
import { processEventChainTurn } from '@/systems/event-chain-lifecycle';
import { processEventChainScheduler } from '@/systems/event-chain-scheduling';
import { processWorldRacesTurn } from '@/systems/world-race-system';
import { processReligionTurn, foundReligion } from '@/systems/religion-system';
import { addWarheadToArsenal } from '@/systems/strategic-arsenal-system';
import { processLoyaltyTurn } from '@/systems/religion-loyalty-system';
import { applyCrisisResponses } from '@/ai/ai-crisis-response';
import { resolveWorldPressureFlags } from '@/systems/world-pressure-flags';
import {
  applyTerritoryFrontierProgressWithEvents,
  buildTerritoryTileFlippedEvents,
  recalculateTerritory,
} from '@/systems/city-territory-system';
import {
  getLegendaryWonderCityYieldBonus,
  getLegendaryWonderCivYieldBonus,
  initializeLegendaryWonderProjectsForAllCities,
  reconcileLegendaryWonderAvailability,
  tickLegendaryWonderProjects,
} from '@/systems/legendary-wonder-system';
import { getTacticalFortOccupantHealingBonus } from '@/systems/legendary-wonder-tactical-effects';
import { announceUnitProduction, completeUnitProduction } from '@/systems/unit-production-completion';
import { applyEconomyTurn, emitEconomyStrainIfNeeded } from '@/systems/economy-system';
import {
  getNationalProjectCivYieldBonus,
  expireNationalProjects,
} from '@/systems/national-project-system';
import type { PirateEconomyModifiers } from '@/systems/economy-system';
import { processPiratesForCompletedRound } from '@/systems/pirate-system';
import { classifyOwner } from './owner-kind';
import { getStampedeLifecycleTransition, processStampedeScheduling, processStampedeTurn } from '@/systems/stampede-system';
import { getRogueElephantHostLifecycleTransition, processRogueElephantHostScheduling, processRogueElephantHostTurn } from '@/systems/rogue-elephant-host-system';
import { checkAndQueueGeneralCandidateChoice, retireGeneralsAtTurnEnd, spawnGeneralForCiv } from '@/systems/great-general-system';
import { chooseBestGeneralCandidate } from '@/ai/ai-general-command';
import { resolveGeneralDefinition, type GeneralDefinition } from '@/systems/great-general-definitions';
import { getCivilizationLiveness } from '@/systems/civilization-liveness';
import { getDeniedTerritoryOwners } from '@/systems/territorial-access';
import { removeUnits } from '@/systems/unit-removal-system';
import { createRoundPhaseContext } from './round-phases/types';

// #544 MR3: same char-folding convention combat-reward-system.ts's seededRoll and
// city-capture-system.ts's assault seed already use -- turns a (gameId, turn, civId)
// tuple into a deterministic numeric seed without a shared cross-file seed-hashing
// utility (several systems in this codebase each keep their own small local variant).
// #932: `gameId` (the canonical determinism base for combat, barbarians, pirates,
// crises, minor civs, city-capture assaults) is now folded in so two different
// playthroughs no longer draw the identical authored candidate set at the same
// turn. `state.gameId` is always populated for any state reaching turn processing
// -- `createNewGame` sets it, and `save-migrations` backfills a per-save
// `stableLegacyGameId` for pre-field saves -- so old saves get their own distinct
// draw sequence too, not a shared collision. The `?? 'legacy'` is belt-and-braces
// parity with `deterministicCombatSeed`'s own guard, not a real code path. The
// `${gameId}:${civId}` separator prevents ("ab","c") aliasing to ("a","bc").
export function deriveGeneralCandidateSeed(gameId: string | undefined, turn: number, civId: string): number {
  return lehmerFoldByCodePoint(Math.abs(turn * 7919), `${gameId ?? 'legacy'}:${civId}`);
}

export function finalizeOpponentRoundState(state: GameState): GameState {
  const normalized = normalizeOpponentAIState(state);
  if (normalized.opponentAI!.lastFinalizedRound === normalized.turn) return state;
  const withChallenge = applyPendingOpponentChallenge(normalized);
  return {
    ...withChallenge,
    opponentAI: {
      ...withChallenge.opponentAI!,
      migrationGraceRoundsRemaining: Math.max(
        0,
        withChallenge.opponentAI!.migrationGraceRoundsRemaining - 1,
      ),
      lastFinalizedRound: state.turn,
    },
  };
}

/**
 * One completed round of world processing. The ORDER below is load-bearing and is pinned by
 * `tests/core/round-phase-order.test.ts` (#1239): which system seams are entered in which order, how civilizations
 * are visited, what is emitted, and a digest of the resulting state. Reordering a phase is a behaviour change, not
 * a cleanup; if one is intended, change that test's literals in the same PR and say why.
 *
 * Phases, in the order they run (ids are the test's, and #1240's decomposition uses the same ones):
 *   prelude                 clone, seed wonder projects, reconcile liveness, normalise the AI container, `turn:end`
 *   instability             unrest/revolts, breakaway, crises, event chains, world races, religion, loyalty
 *   pre-civ-reconciliation  liveness again, crisis responses, occupation, wonder availability, marketplace expiry
 *   per-civ                 for each living civ in roster order: supply/naval/air, world-pressure turns, autonomy,
 *                           network plans, city production and yields, gold, research, upkeep, healing, movement
 *                           reset, standing orders, diplomacy drift, vision and contacts, advisors, general candidates
 *   post-civ-housekeeping   expire diplomatic requests, tick production-disabled timers
 *   territory-frontier      recalculate ownership, advance frontier contests
 *   wonders-market          legendary-wonder projects and availability, fashion cycle and prices, wonder effects
 *   barbarians              reset, plan, spawn, pillage, move, attack units and cities, city HP regeneration
 *   minor-civs              city-state turn, camp evolution
 *   beasts                  lairs, spawns, growth, moves, attacks
 *   threat-scheduling       independent threats, crisis/event-chain/stampede/rogue-host scheduling and lifecycle events
 *   espionage               missions, detection, interrogations, spy vision, counter-intelligence, last-seen re-snapshot
 *   diplomacy-trade         vassalage turn, embargo auto-join, stale/embargoed route scrub, caravan runners
 *   pirates                 pirate round
 *   trade-income            route income credited to each civ
 *   leagues                 defensive-league dissolution
 *   era-progression         era advancement, national-project expiry and dequeue, civ and minor-civ era events
 *   beast-rewards           auto-resolve AI hoard choices, trophy gold
 *   economy                 `applyEconomyTurn` per civ (last: every phase above credits gold to it)
 *   finalization            liveness, opponent-AI round state, `turn + 1`, victories, `turn:start`
 */
export function processTurn(
  state: GameState,
  bus: EventBus,
): GameState {
  const context = createRoundPhaseContext(state, bus);
  const { previousEraByCiv } = context;
  let newState = initializeLegendaryWonderProjectsForAllCities(structuredClone(state));
  let liveness = reconcileCivilizationLiveness(newState, newState);
  emitCivilizationLivenessTransitions(liveness, bus);
  newState = liveness.state;
  newState = normalizeOpponentAIState(newState);

  bus.emit('turn:end', { turn: newState.turn, playerId: newState.currentPlayer });

  // Resolve unrest and revolts before city yields so instability impacts the current turn.
  newState = processFactionTurn(newState, bus);
  newState = processBreakawayTurn(newState, bus);
  newState = processCrisisTurn(newState, bus);
  newState = processEventChainTurn(newState, bus);
  newState = processWorldRacesTurn(newState, bus);
  newState = processReligionTurn(newState, bus);
  newState = processLoyaltyTurn(newState, bus);
  liveness = reconcileCivilizationLiveness(newState, newState);
  emitCivilizationLivenessTransitions(liveness, bus);
  newState = liveness.state;
  // AI civ turns run later via the AI round scheduler, so responses recorded
  // here (quarantine/fund-remedy) shape the same round's plans (#529 MR3 Task 3.2).
  if (resolveWorldPressureFlags(newState.settings).aiPressure === 'full') {
    newState = applyCrisisResponses(newState, bus);
  }
  newState = tickOccupiedCities(newState);
  const { grossGoldByCiv } = context;
  const previousEconomyStatusByCiv = newState.economyStatusByCiv ?? {};

  // Clean up expired purchased-resource entries (Diplomatic Marketplace / S9)
  if (newState.marketplace?.purchasedResources?.length) {
    newState.marketplace = {
      ...newState.marketplace,
      purchasedResources: newState.marketplace.purchasedResources.filter(
        e => e.expiresOnTurn > newState.turn,
      ),
    };
  }

  newState = reconcileLegendaryWonderAvailability(newState, bus);

  // --- Process each civilization ---
  for (const [civId, civ] of Object.entries(newState.civilizations)) {
    if (!getCivilizationLiveness(newState, civId).living) continue;
    newState = resolveLandSupplyForCiv(newState, civId);
    newState = resolveNavalOperationsForCiv(newState, civId);
    newState = resolveAirReadinessForCiv(newState, civId);
    const stampedeBefore = newState.stampedes?.[civId];
    newState = processStampedeTurn(newState, civId);
    const hostBefore = newState.rogueElephantHosts?.[civId];
    newState = processRogueElephantHostTurn(newState, civId);
    const stampedeTransition = getStampedeLifecycleTransition(
      stampedeBefore,
      newState.stampedes?.[civId],
    );
    if (stampedeTransition) bus.emit('stampede:lifecycle', stampedeTransition);
    const hostTransition = getRogueElephantHostLifecycleTransition(hostBefore, newState.rogueElephantHosts?.[civId]);
    if (hostTransition) bus.emit('rogue-elephant-host:lifecycle', hostTransition);
    const recoveringBeforeAdvance = newState.autonomyByCiv?.[civId]?.surgeRecoveryUntilTurn;
    newState = applyPendingAutonomyPosture(newState, civId);
    newState = advanceAutonomySurge(newState, civId);
    if (recoveringBeforeAdvance !== null && recoveringBeforeAdvance !== undefined
      && newState.autonomyByCiv?.[civId]?.surgeRecoveryUntilTurn === null) {
      bus.emit('network:audio-cue', { cue: 'recovery', viewerIds: [civId] });
    }
    const resolutionCountBefore = (newState.legendaryWonderHistory?.networkPlanResolutions ?? [])
      .filter(record => record.civId === civId).length;
    const ownerTurnResolution = resolveStableNetworkPlansForOwnerTurn(newState, civId);
    newState = appendLegendaryWonderNetworkPlanResolutions(ownerTurnResolution.state, ownerTurnResolution.resolutions);
    const resolutionCountAfter = (newState.legendaryWonderHistory?.networkPlanResolutions ?? [])
      .filter(record => record.civId === civId).length;
    if (resolutionCountBefore < 3 && resolutionCountAfter >= 3) {
      bus.emit('network:audio-cue', { cue: 'constructive-resolution', viewerIds: [civId] });
    }
    if (!civ.isHuman) {
      const warningResult = beginNetworkPlansForVictimTurn(newState, civId);
      newState = warningResult.state;
      for (const warning of warningResult.warnings) {
        const plan = Object.values(newState.autonomyByCiv ?? {})
          .map(autonomy => autonomy.plans[warning.planId])
          .find(Boolean);
        if (plan?.target.kind === 'city') {
          bus.emit('network:exploit-warning', {
            planId: warning.planId,
            victimCivId: civId,
            cityId: plan.target.cityId,
          });
        }
      }
    }
    const currentCivState = newState.civilizations[civId];
    const civDef = resolveCivDefinition(newState, civ.civType ?? '');
    // Snapshot before production creates new units this turn — geneTherapyReady recharge
    // must only consider units that already existed at turn start (see gene-therapy-system.ts).
    const unitIdsAtTurnStart = [...civ.units];
    // Process cities: food, growth, production
    let totalGold = 0;
    const authoritativeCityScience: Record<string, number> = {};
    const baseGoldByCityId: Record<string, number> = {};

    const resourceYieldBonus = getCivResourceYieldBonus(newState, civId);
    const npCivBonuses = getNationalProjectCivYieldBonus(newState, civId);
    const empireTechPercents = getEmpireTechPercents(civ.techState.completed);

    // MR6 "empire-wide" texts without a per-city/all-cities qualifier resolve to a single flat
    // civ-total bonus. Gold/science have real civ-wide pools (totalGold/totalScience below);
    // food/production don't, so they're credited once to a single deterministic city — the
    // civ's cities sorted by id, first entry — rather than fabricating a new civ-wide stockpile.
    const empireFlatTechYields = getEmpireFlatTechYields(civ.techState.completed);
    const empireFlatTargetCityId = civ.cities.length > 0 ? [...civ.cities].sort()[0] : undefined;

    // network-governance: lowest-science city determined from this turn's un-reassigned base
    // yields, before empire percents — deterministic tiebreak by sorted city id.
    const networkGovernanceBonus = getLowestCityScienceBonus(civ.techState.completed);
    let lowestScienceCityId: string | undefined;
    if (networkGovernanceBonus > 0) {
      let lowestScience = Infinity;
      for (const cid of [...civ.cities].sort()) {
        const candidateCity = newState.cities[cid];
        if (!candidateCity) continue;
        const candidateScience = calculateCityYields(candidateCity, newState.map, civDef?.bonusEffect, civ.techState.completed, {}, newState.turn).science;
        if (candidateScience < lowestScience) {
          lowestScience = candidateScience;
          lowestScienceCityId = cid;
        }
      }
    }

    for (const cityId of civ.cities) {
      let city = newState.cities[cityId];
      if (!city) continue;
      const civEra = resolveCivilizationEra(civ.techState.completed);

      const preYieldWorkResult = city.focus === 'custom'
        ? normalizeWorkedTilesForCity(newState, cityId)
        : assignCityFocus(newState, cityId, city.focus);
      newState = preYieldWorkResult.state;
      city = newState.cities[cityId];
      if (!city) continue;

      const activeRouteCount = (newState.marketplace?.tradeRoutes ?? [])
        .filter(route => route.fromCityId === cityId || route.toCityId === cityId).length;
      const hostsCompletedLegendaryWonder = Object.values(newState.completedLegendaryWonders ?? {})
        .some(w => w.cityId === cityId);
      const baseYields = calculateCityYields(city, newState.map, civDef?.bonusEffect, civ.techState.completed, { activeRouteCount, hostsCompletedLegendaryWonder }, newState.turn);
      const networkCityBonus = getNetworkCityYieldBonus(newState, cityId, baseYields);
      const wonderCityBonuses = getLegendaryWonderCityYieldBonus(newState, civId, cityId);
      const baseYieldMultiplier = Math.min(getUnrestYieldMultiplier(city), getOccupiedCityYieldMultiplier(city));
      const crisisMultiplier = getCrisisYieldMultiplier(newState, cityId);
      const unrestMultiplier = {
        food: baseYieldMultiplier * crisisMultiplier.food,
        production: baseYieldMultiplier * crisisMultiplier.production,
        gold: baseYieldMultiplier * crisisMultiplier.gold,
        science: baseYieldMultiplier * crisisMultiplier.science,
      };
      const empireFlatFoodForCity = cityId === empireFlatTargetCityId ? empireFlatTechYields.food : 0;
      const empireFlatProductionForCity = cityId === empireFlatTargetCityId ? empireFlatTechYields.production : 0;
      const networkGovernanceScienceForCity = cityId === lowestScienceCityId ? networkGovernanceBonus : 0;
      // Catastrophe-crisis recovery reward: +1 food +1 production while active, transient by design.
      const resilienceBonus = (city.resilienceBonusUntilTurn ?? 0) > newState.turn ? 1 : 0;
      const yields = {
        food:       Math.floor((baseYields.food       + (wonderCityBonuses.food       ?? 0) + resourceYieldBonus.food       + (npCivBonuses.food       ?? 0) + empireFlatFoodForCity + resilienceBonus) * unrestMultiplier.food),
        production: Math.floor((baseYields.production + networkCityBonus.production + (wonderCityBonuses.production ?? 0) + resourceYieldBonus.production + (npCivBonuses.production ?? 0) + empireFlatProductionForCity + resilienceBonus) * unrestMultiplier.production * (1 + (empireTechPercents.production ?? 0) / 100)),
        gold:       Math.floor((baseYields.gold       + (wonderCityBonuses.gold       ?? 0) + resourceYieldBonus.gold)       * unrestMultiplier.gold * (1 + (empireTechPercents.gold ?? 0) / 100)),
        science:    Math.floor((baseYields.science    + networkCityBonus.science + (wonderCityBonuses.science    ?? 0) + resourceYieldBonus.science + networkGovernanceScienceForCity) * unrestMultiplier.science * (1 + (empireTechPercents.science ?? 0) / 100)),
      };
      totalGold += yields.gold;
      baseGoldByCityId[cityId] = yields.gold;
      const effectiveProduction = isCityProductionLocked(city) ? 0 : yields.production;
      const npKeysForCiv = new Set(
        Object.keys(newState.builtNationalProjects ?? {}).filter(k => k.startsWith(`${civId}:`))
      );
      const result = processCity(
        city,
        newState.map,
        yields.food,
        effectiveProduction,
        buildProductionCostContext(newState, civId, cityId),
        civ.civType,
        npKeysForCiv,
        type => {
          if (!UNIT_DEFINITIONS[type].airOperation) return null;
          return canCompleteAirUnitProduction(newState, cityId, type).ok ? null : 'air-base-unavailable';
        },
      );
      totalGold += result.idleGoldBonus;
      authoritativeCityScience[cityId] = yields.science + result.idleScienceBonus;

      const maturityResult = applyCityMaturity(result.city, civ.techState.completed);
      newState.cities[cityId] = maturityResult.city;

      // cyberMarketDisruption tick: 1 gold penalty per turn remaining, then expire
      {
        const disruptedCity = newState.cities[cityId];
        if (disruptedCity?.cyberMarketDisruption && disruptedCity.cyberMarketDisruption.turnsRemaining > 0) {
          totalGold = Math.max(0, totalGold - 1);
          const remaining = disruptedCity.cyberMarketDisruption.turnsRemaining - 1;
          newState.cities[cityId] = {
            ...disruptedCity,
            cyberMarketDisruption: remaining > 0 ? { turnsRemaining: remaining } : undefined,
          };
        }
      }
      if (maturityResult.changed && maturityResult.previous !== maturityResult.current) {
        bus.emit('city:maturity-upgraded', {
          cityId,
          previous: maturityResult.previous,
          current: maturityResult.current,
        });
      }

      if (result.grew) {
        const grownCity = newState.cities[cityId];
        const focusResult = grownCity.focus === 'custom'
          ? normalizeWorkedTilesForCity(newState, cityId)
          : assignCityFocus(newState, cityId, grownCity.focus);
        newState = focusResult.state;
        bus.emit('city:grew', { cityId, newPopulation: newState.cities[cityId].population });
      }
      if (result.completedBuilding) {
        bus.emit('city:building-complete', { cityId, buildingId: result.completedBuilding });
        const completedBldg = BUILDINGS[result.completedBuilding];
        if (completedBldg?.nationalProject && completedBldg.uniquePerEmpire) {
          const npKey = `${civId}:${result.completedBuilding}`;
          newState = {
            ...newState,
            builtNationalProjects: {
              ...(newState.builtNationalProjects ?? {}),
              [npKey]: { civId, cityId, eraBuilt: civEra },
            },
          };
          bus.emit('city:national-project-built', {
            civId,
            cityId,
            buildingId: result.completedBuilding,
            eraBuilt: civEra,
          });
          // A human chooses from the city panel and can carry that decision across
          // a hot-seat handoff. AI uses the same canonical choice mutation, with
          // rare-earth elements as the broadest Era-13 soft-material coverage.
          if (!civ.isHuman && result.completedBuilding === 'circular_manufacturing_network') {
            newState = chooseCircularManufacturingMaterial(newState, civId, 'rare-earth-elements');
          }
          if (result.completedBuilding === 'sacred_council') {
            newState = foundReligion(newState, civId, cityId, bus);
          }
        }
        if (result.completedBuilding === 'warhead') {
          newState = addWarheadToArsenal(newState, civId);
        }
      }
      for (const item of result.droppedProductionItems) {
        bus.emit('city:production-item-dropped', {
          cityId,
          itemId: item.itemId,
          itemKind: item.itemKind,
          reason: item.reason,
        });
      }
      if (result.completedUnit) {
        // #1202: one completion for the turn path and the rush-buy (`unit-production-completion.ts`).
        const completion = completeUnitProduction(newState, { civId, cityId, unitType: result.completedUnit });
        if (!completion.ok) {
          throw new Error(`Production of ${result.completedUnit} completed without a legal place for it: ${completion.reason}`);
        }
        newState = completion.state;
        announceUnitProduction(bus, cityId, civId, completion);
      }
    }

    // Cyber drain: enemy cyber_units adjacent to this civ's cities steal 2 gold/turn each
    // (blocked by Cyber Defense Center / Signals Hub); stolen gold is credited to the attacker.
    if (!isAutonomyActivated(newState, civId)) {
      const cyberDrainResult = processCyberDrain(newState, civId, totalGold);
      totalGold = cyberDrainResult.remainingGold;
      for (const [ownerCivId, amount] of Object.entries(cyberDrainResult.creditsByOwner)) {
        grossGoldByCiv[ownerCivId] = (grossGoldByCiv[ownerCivId] ?? 0) + amount;
      }
      for (const event of cyberDrainResult.events) {
        bus.emit('city:cyber-drained', { ...event, victimCivId: civId });
      }
    }
    const networkResult = resolveNetworkPlansForVictimTurnEnd(newState, civId, baseGoldByCityId);
    newState = networkResult.state;
    const transferred = Object.values(networkResult.creditsByOwner)
      .reduce((sum, amount) => sum + amount, 0);
    totalGold = Math.max(0, totalGold - transferred);
    for (const [ownerCivId, amount] of Object.entries(networkResult.creditsByOwner)) {
      grossGoldByCiv[ownerCivId] = (grossGoldByCiv[ownerCivId] ?? 0) + amount;
    }
    for (const event of networkResult.events) {
      const plan = Object.values(newState.autonomyByCiv ?? {})
        .map(autonomy => autonomy.plans[event.planId])
        .find(Boolean);
      if (!plan) continue;
      bus.emit('network:exploit-resolved', {
        planId: event.planId,
        cityId: event.cityId,
        ownerCivId: plan.ownerCivId,
        goldTransferred: event.goldTransferred,
        delayed: event.kind === 'exploit-delayed',
      });
    }

    // Process research
    const wonderCivBonuses = getLegendaryWonderCivYieldBonus(newState, civId);
    totalGold += wonderCivBonuses.gold ?? 0;
    // NP food/production applied per-city above; NP gold handled in economy-system.ts to avoid double-counting
    totalGold += getCivLuxuryTechGold(civ.techState.completed, getCivHappinessFromResources(newState, civId));
    totalGold += empireFlatTechYields.gold;

    // digital-art: +gold per completed legendary wonder this civ owns.
    const completedWonderCount = Object.values(newState.completedLegendaryWonders ?? {})
      .filter(wonder => wonder.ownerId === civId).length;
    totalGold += getCivWonderTechGold(civ.techState.completed, completedWonderCount);

    // globalization: +gold per distinct peacetime foreign trade-route partner civ.
    const routePartnerCivIds = new Set<string>();
    for (const route of newState.marketplace?.tradeRoutes ?? []) {
      const fromCity = newState.cities[route.fromCityId];
      const toCity = newState.cities[route.toCityId];
      let partnerCivId: string | undefined;
      if (fromCity?.owner === civId && route.foreignCivId) {
        partnerCivId = route.foreignCivId;
      } else if (toCity?.owner === civId && fromCity && fromCity.owner !== civId) {
        partnerCivId = fromCity.owner;
      }
      if (!partnerCivId) continue;
      if (!newState.civilizations[partnerCivId]) continue;
      if (isAtWar(civ.diplomacy, partnerCivId)) continue;
      routePartnerCivIds.add(partnerCivId);
    }
    totalGold += getCivRoutePartnerTechGold(civ.techState.completed, routePartnerCivIds.size);
    if (civDef?.bonusEffect.type === 'allied_kingdoms') {
      const allianceCount = civ.diplomacy.treaties.filter(t => t.type === 'alliance').length;
      totalGold += allianceCount * civDef.bonusEffect.allianceYieldBonus;
    }

    const researchOutput = calculateCivResearchOutput(newState, civId, { authoritativeCityScience });
    const researchResult = processResearch(civ.techState, researchOutput.finalScience);
    newState.civilizations[civId].techState = researchResult.state;
    if (researchResult.completedTech) {
      const techId = researchResult.completedTech;
      bus.emit('tech:completed', {
        civId,
        techId,
        carriedProgress: researchResult.carriedProgress,
        carriedIntoTechId: researchResult.carriedProgress > 0 ? researchResult.state.currentResearch : null,
      });
      newState = applyResearchCompletionConsequences(newState, civId, techId, bus);
    }

    // Resource outpost upkeep: 2 gold/turn per completed outpost owned by this civ
    const outpostUpkeep = Object.values(newState.map.tiles).filter(
      tile =>
        tile.improvement === 'resource_outpost' &&
        tile.improvementTurnsLeft === 0 &&
        tile.owner === civId,
    ).length * 2;
    totalGold -= outpostUpkeep;

    // Vassalage tribute (25% of gold income flows to overlord)
    if (civ.diplomacy?.vassalage.overlord) {
      const tribute = processVassalageTribute(totalGold);
      totalGold -= tribute.tributeAmount;
      const overlordId = civ.diplomacy.vassalage.overlord;
      if (newState.civilizations[overlordId]) {
        grossGoldByCiv[overlordId] = (grossGoldByCiv[overlordId] ?? 0) + tribute.tributeAmount;
      }
    }

    // #927 Rung 6: Federal Autonomy remittance loss — applied at this
    // canonical revenue-aggregation point, once per civ per turn.
    if (civ.federalismEnabled) {
      totalGold -= getFederalismRemittanceLoss(totalGold);
    }
    grossGoldByCiv[civId] = (grossGoldByCiv[civId] ?? 0) + totalGold;

    // Update peak counts (read from newState to pick up earlier mutations in this loop)
    if (currentCivState.diplomacy) {
      const cityCount = currentCivState.cities.length;
      const milCount = getVassalageMilitaryCount(newState, civId);
      if (cityCount > currentCivState.diplomacy.vassalage.peakCities) {
        newState.civilizations[civId].diplomacy.vassalage.peakCities = cityCount;
      }
      if (milCount > currentCivState.diplomacy.vassalage.peakMilitary) {
        newState.civilizations[civId].diplomacy.vassalage.peakMilitary = milCount;
      }
    }

    // Heal units BEFORE resetting hasMoved/hasActed (healing checks those flags)
    const friendlyCitiesByPosition = new Map(
      civ.cities.map(id => newState.cities[id]).filter(Boolean).map(city => [`${city!.position.q},${city!.position.r}`, city!] as const),
    );
    const healCompletedTechs = civ.techState.completed;
    const healActiveNPs = getActiveNationalProjectsForCiv(newState, civId);
    for (const unitId of civ.units) {
      const unit = newState.units[unitId];
      if (!unit || unit.health >= 100) continue;
      if (unit.committedToRouteId) continue; // committed caravans do not heal
      const posKey = `${unit.position.q},${unit.position.r}`;
      const tile = newState.map.tiles[posKey];
      const friendlyCity = friendlyCitiesByPosition.get(posKey as `${number},${number}`);
      const inFriendlyCity = Boolean(friendlyCity) && (tile?.owner === civId);
      const inFriendlyTerritory = !inFriendlyCity && (tile?.owner === civId);
      const withinRangeOfFriendlyCity3 = isWithinRangeOfTelemedicineHub(newState, civId, unit.position, 3);
      const nearNeuralRehabilitationCenter = isWithinRangeOfNeuralRehabilitationCenter(newState, civId, unit.position, 1);
      const healingBonus = getHealingBonus({
        completedTechs: healCompletedTechs,
        activeNationalProjects: healActiveNPs,
        inFriendlyCity,
        inFriendlyTerritory,
        withinRangeOfFriendlyCity3,
        withinRangeOfNeuralRehabilitationCenter: nearNeuralRehabilitationCenter,
        localCityHealingBonus: inFriendlyCity && friendlyCity
          ? getLocalCityHealingBonus(unit.type, friendlyCity.buildings)
          : 0,
        tacticalFortHealingBonus: getTacticalFortOccupantHealingBonus(newState, unit),
      });
      if (getRestAvailability(unit.landSupply).canRest) {
        newState.units[unitId] = healUnit(unit, inFriendlyCity, inFriendlyTerritory, healingBonus);
      }
    }

    // Reset geneTherapyReady cooldown for units that rested a full turn in a friendly city
    newState = applyGeneTherapyRecharge(newState, civId, unitIdsAtTurnStart);

    // #544 MR4 contract §21: retire any General who has spent all 3
    // Command Charges, before resetting movement for this civ's remaining
    // units -- the General "remains for rest of owner turn" (already true,
    // nothing removed it earlier this round) and "retires at end of turn"
    // (this is that end-of-turn point). bus is passed through so the
    // retirement notification actually reaches the player.
    newState = retireGeneralsAtTurnEnd(newState, civId, bus);

    // Reset unit movement
    for (const unitId of civ.units) {
      const unit = newState.units[unitId];
      if (unit) {
        let reset = resetUnitTurn(unit);
        // Committed caravans cannot move — zero restored movement so they don't appear in unmoved cycling
        if (reset.committedToRouteId) {
          reset = { ...reset, movementPointsLeft: 0, hasActed: true };
        }
        newState.units[unitId] = reset;
      }
    }

    for (const unitId of civ.units) {
      const unit = newState.units[unitId];
      if (unit?.automation?.mode === 'auto-explore') {
        const explored = applyAutoExploreOrder(newState, unitId, { bus, leash: computeAdministrativeExploreLeash(newState, unitId) ?? undefined });
        if (explored?.ok) newState = explored.state;
      } else if (unit?.automation?.mode === 'hold-siege') {
        newState = applyHoldSiegeOrder(newState, unitId, unit.automation.cityId, bus);
      } else if (unit?.automation?.mode === 'journey') {
        const destination = unit.automation.destination;
        const domain = UNIT_DEFINITIONS[unit.type]?.domain ?? 'land';
        const path = findPath(unit.position, destination, newState.map, domain, { unit, completedTechs: healCompletedTechs, deniedOwnerIds: getDeniedTerritoryOwners(newState, unit) });
        if (!path || path.length < 2) {
          newState.units[unitId] = { ...unit, automation: undefined };
          bus.emit('unit:journey-blocked', { unitId, position: { ...unit.position } });
        } else {
          const nextStep = path[1];
          const movement = executeUnitMove(newState, unitId, nextStep, { actor: 'automation', civId, bus });
          if (movement.ok) newState = movement.state;
          if (hexKey(nextStep) === hexKey(destination)) {
            const movedUnit = newState.units[unitId];
            if (movedUnit) {
              newState.units[unitId] = { ...movedUnit, automation: undefined };
            }
          }
        }
      }
    }

    // Get civ units for visibility and diplomacy
    const civUnits = civ.units
      .map(id => newState.units[id])
      .filter((u): u is NonNullable<typeof u> => u !== undefined);
    const cityPositions = civ.cities
      .map(id => newState.cities[id]?.position)
      .filter((p): p is NonNullable<typeof p> => p !== undefined);

    // Process diplomacy
    if (civ.diplomacy) {
      const unitsNearBorder: Record<string, boolean> = {};
      for (const otherCivId of Object.keys(newState.civilizations)) {
        if (otherCivId === civId) continue;
        const otherCities = newState.civilizations[otherCivId].cities
          .map(id => newState.cities[id])
          .filter(Boolean);
        const hasUnitsNear = civUnits.some(u =>
          otherCities.some(c => {
            const dq = Math.abs(u.position.q - c!.position.q);
            const dr = Math.abs(u.position.r - c!.position.r);
            return dq + dr <= 3;
          }),
        );
        unitsNearBorder[otherCivId] = hasUnitsNear;
      }

      let dipState = processRelationshipDrift(civ.diplomacy, unitsNearBorder);
      dipState = decayEvents(dipState, newState.turn);
      dipState = tickTreaties(dipState);

      // Treachery decay
      dipState = decayTreachery(dipState, newState.turn);

      // Trade agreement gold income
      for (const treaty of dipState.treaties) {
        if (treaty.type === 'trade_agreement' && treaty.goldPerTurn) {
          grossGoldByCiv[civId] = (grossGoldByCiv[civId] ?? 0) + treaty.goldPerTurn;
        }
      }

      newState.civilizations[civId].diplomacy = dipState;
    }

    // Update visibility
    {
      const visionCompletedTechs = newState.civilizations[civId].techState.completed;
      const visionActiveNPs = getActiveNationalProjectsForCiv(newState, civId);
      const { visibility: visionAfterUpdate } = updateVisibility(
        newState.civilizations[civId].visibility,
        civUnits,
        newState.map,
        cityPositions,
        unit => getVisionBonus(unit.type, visionCompletedTechs, visionActiveNPs) + getNetworkUnitVisionBonus(newState, unit.id),
      );
      newState.civilizations[civId].visibility = visionAfterUpdate;
      newState = applyReconReveals(newState, civId);
    }

    if (civ.techState.completed.includes('mass-surveillance')) {
      newState = applyMassSurveillanceReveal(newState, civId);
    }

    for (const [targetCivId, turnsRemaining] of Object.entries(currentCivState.satelliteSurveillanceTargets ?? {})) {
      if (turnsRemaining > 0) {
        newState = applySatelliteSurveillance(newState, civId, targetCivId);
      }
    }

    // Reveal minor civ cities near explored tiles
    const mcCityPositions = Object.values(newState.minorCivs)
      .filter(mc => !mc.isDestroyed)
      .map(mc => newState.cities[mc.cityId]?.position)
      .filter(Boolean) as HexCoord[];
    revealMinorCivCities(newState.civilizations[civId].visibility, mcCityPositions, newState.map);

    // Shared vision for friendly minor civs
    for (const mc of Object.values(newState.minorCivs)) {
      if (mc.isDestroyed) continue;
      const rel = mc.diplomacy.relationships[civId] ?? 0;
      if (rel >= 30) {
        const mcPositions = [
          newState.cities[mc.cityId]?.position,
          ...mc.units.map(uid => newState.units[uid]?.position),
        ].filter(Boolean) as HexCoord[];
        applySharedVision(newState.civilizations[civId].visibility, mcPositions, newState.map);
      }
    }

    // #524 MR1: electric-telegraph — allied major civs share vision around their cities.
    // One-directional per tech holder: your telegraph, your intel; the ally needs their own
    // tech to see yours.
    if (newState.civilizations[civId].techState.completed.includes('electric-telegraph')) {
      const allies = newState.civilizations[civId].diplomacy.treaties
        .filter(t => t.type === 'alliance')
        .map(t => (t.civA === civId ? t.civB : t.civA));
      for (const allyId of allies) {
        const allyCityPositions = (newState.civilizations[allyId]?.cities ?? [])
          .map(cid => newState.cities[cid]?.position)
          .filter(Boolean) as HexCoord[];
        applySharedVision(newState.civilizations[civId].visibility, allyCityPositions, newState.map);
      }
    }

    // Contact discovery must run AFTER every vision-granting source for this civ's
    // round has applied -- mass surveillance / satellite surveillance / minor-civ
    // shared vision / ally telegraph vision all run above and can be the ONLY
    // reason a foreign civ becomes visible this round. Running the sync earlier
    // (as this used to, immediately after the base updateVisibility call) meant a
    // contact only ever revealed through one of those later sources could never be
    // caught live: the next round's updateVisibility recomputes fog-of-war from
    // scratch, degrading that tile back to 'fog' before this same sync point runs
    // again, and the later sources re-promote it to 'visible' only after sync has
    // already passed -- forever missing it, every round, regardless of how many
    // rounds pass. Found via tests/simulation/long-horizon/campaign-continuity.test.ts's
    // save/reload determinism check: `normalizeLoadedState`'s unconditional
    // `refreshKnownCivilizations` sweep on every load has no such ordering problem,
    // so a save/reload could "discover" a contact live play could never reach.
    for (const contact of syncCivilizationContactsFromVisibility(newState, civId)) {
      bus.emit('civilization:first-contact', contact);
    }
    newState = refreshLastSeenPresentationsForCiv(newState, civId);

    // Clear expired advisor disable timers after all start-of-turn effects are processed.
    if (currentCivState.advisorDisabledUntil) {
      const stillDisabled: Partial<Record<AdvisorType, number>> = {};
      for (const [advisor, untilTurn] of Object.entries(currentCivState.advisorDisabledUntil)) {
        if ((untilTurn as number) > newState.turn) {
          stillDisabled[advisor as AdvisorType] = untilTurn as number;
        }
      }
      newState.civilizations[civId].advisorDisabledUntil =
        Object.keys(stillDisabled).length > 0 ? stillDisabled : undefined;
    }

    if ((currentCivState.researchPenaltyTurns ?? 0) > 0) {
      newState.civilizations[civId].researchPenaltyTurns = Math.max(0, (currentCivState.researchPenaltyTurns ?? 0) - 1);
      if ((newState.civilizations[civId].researchPenaltyTurns ?? 0) === 0) {
        newState.civilizations[civId].researchPenaltyMultiplier = 0;
      }
    }

    const updatedTargets: Record<string, number> = {};
    for (const [targetCivId, turnsRemaining] of Object.entries(currentCivState.satelliteSurveillanceTargets ?? {})) {
      const nextTurns = Math.max(0, turnsRemaining - 1);
      if (nextTurns > 0) {
        updatedTargets[targetCivId] = nextTurns;
      }
    }
    newState.civilizations[civId].satelliteSurveillanceTargets =
      Object.keys(updatedTargets).length > 0 ? updatedTargets : undefined;

    // #544 MR3/MR5: queue a Great General candidate choice once this civ has
    // crossed its next threshold -- now for every civ, human or AI (MR3
    // originally gated this to humans only; MR5 is the AI-parity follow-up
    // that comment named). Human choices are resolved by the player via
    // maybeShowPendingGeneralChoice (bootstrap.ts); AI choices are resolved
    // immediately below via a deterministic best-stat pick -- no RNG, no
    // difficulty scaling (Global Constraints).
    newState = checkAndQueueGeneralCandidateChoice(
      newState,
      civId,
      'round-end',
      deriveGeneralCandidateSeed(newState.gameId, newState.turn, civId),
    );
    if (!civ.isHuman) {
      const pending = (newState.pendingGeneralCandidateChoices ?? [])
        .find(choice => choice.civId === civId);
      if (pending) {
        const candidates = pending.candidateDefinitionIds
          .map(id => resolveGeneralDefinition(newState, id))
          .filter((g): g is GeneralDefinition => g !== undefined);
        if (candidates.length > 0) {
          newState = spawnGeneralForCiv(newState, civId, chooseBestGeneralCandidate(newState, civId, candidates).id);
        }
      }
    }
  }

  // #554: expire stale peace requests / treaty proposals once per turn (not
  // once per civ) -- a proposal the recipient never opens the diplomacy panel
  // to act on should not persist forever.
  newState = pruneExpiredDiplomaticRequests(newState);

  for (const city of Object.values(newState.cities)) {
    if ((city.productionDisabledTurns ?? 0) > 0) {
      city.productionDisabledTurns = Math.max(0, (city.productionDisabledTurns ?? 0) - 1);
    }
  }

  const territoryBefore = newState;
  const territoryResult = recalculateTerritory(territoryBefore, {
    reason: 'turn',
    preserveCurrentHolderOnTie: true,
  });
  for (const event of buildTerritoryTileFlippedEvents(territoryBefore, territoryResult.state, territoryResult.resolutions)) {
    bus.emit('territory:tile-flipped', event);
  }
  const frontierResult = applyTerritoryFrontierProgressWithEvents(territoryResult);
  for (const event of buildTerritoryTileFlippedEvents(
    territoryResult.state,
    frontierResult.state,
    frontierResult.flippedResolutions,
  )) {
    bus.emit('territory:tile-flipped', event);
  }
  newState = frontierResult.state;

  newState = tickLegendaryWonderProjects(newState, bus);
  newState = reconcileLegendaryWonderAvailability(newState, bus);

  // --- Process marketplace ---
  if (newState.marketplace) {
    // #982: one global fashion-cycle roll per turn. Was `turn*16807` alone --
    // no gameId, so two campaigns at the same turn shared one fashion cycle.
    const simpleRng = createSimulationRng(newState, { domain: 'marketplace-fashion-cycle', eventId: 'fashion-cycle' });
    newState.marketplace = processFashionCycle(newState.marketplace, simpleRng);

    // Compute supply (resource tiles in city territory) and demand (population)
    const supply: Record<string, number> = {};
    const demand: Record<string, number> = {};
    for (const city of Object.values(newState.cities)) {
      // Count resource-bearing tiles in the city's territory for supply
      for (const coord of city.ownedTiles) {
        const tile = newState.map.tiles[`${coord.q},${coord.r}`];
        if (tile?.resource) {
          supply[tile.resource] = (supply[tile.resource] ?? 0) + 1;
        }
      }
      // Population drives demand for all resources
      const pop = city.population;
      for (const r of Object.keys(newState.marketplace.prices)) {
        demand[r] = (demand[r] ?? 0) + pop;
      }
    }
    newState.marketplace = updatePrices(newState.marketplace, supply, demand);
  }

  // --- Process wonder effects (after city processing) ---
  const wonderRng = createRng(`wonder-${newState.turn}`);
  const eruptions = processWonderEffects(newState, wonderRng);
  for (const eruption of eruptions) {
    bus.emit('wonder:eruption', {
      wonderId: eruption.wonderId,
      position: eruption.position,
      tilesAffected: eruption.tilesAffected,
    });
  }

  // --- Process barbarians ---
  // Reset barbarian unit movement each turn (they are not in any civ's units array)
  for (const [unitId, unit] of Object.entries(newState.units)) {
    if (unit.owner === 'barbarian') {
      newState.units[unitId] = resetUnitTurn(unit);
    }
  }
  const barbResult = processPurposefulBarbarians(newState);
  newState.opponentAI = barbResult.opponentAI;
  newState.barbarianCampPressure = barbResult.barbarianCampPressure;
  newState.barbarianCamps = {};
  for (const camp of barbResult.updatedCamps) {
    newState.barbarianCamps[camp.id] = camp;
  }

  // Spawn barbarian raiders
  for (const spawn of barbResult.spawnedUnits) {
    const raider = createUnit(spawn.unitType ?? 'warrior', 'barbarian', spawn.position, newState.idCounters);
    newState.units[raider.id] = raider;
    if (newState.opponentAI) {
      newState.opponentAI.barbarianHomeCampByUnitId[raider.id] = spawn.campId;
    }
    bus.emit('barbarian:spawned', { campId: spawn.campId, unitId: raider.id });
  }

  // Barbarian pillage-on-arrival. Must run BEFORE moves: an arriving raider's plan
  // transitions to 'withdrawing' in the same processPurposefulBarbarians call that
  // queues its pillageOrder, which also queues a withdrawal moveOrder for that same
  // unit this turn (#541 second-pass review — the original order had moves first,
  // so the raider stepped away from the resource tile before applyPillageToState
  // re-derived the tile from the unit's now-stale position, silently pillaging
  // nothing). Pillaging first sets movementPointsLeft to 0, so the queued
  // withdrawal move correctly fails validation and simply doesn't fire this turn —
  // the raider retreats next turn instead.
  for (const order of barbResult.pillageOrders) {
    const result = applyPillageToState(newState, order.unitId);
    if (result.ok) newState = result.state;
  }

  // Move barbarian units
  for (const order of barbResult.moveOrders) {
    const unit = newState.units[order.unitId];
    if (unit) {
      const movement = executeUnitMove(newState, order.unitId, order.toCoord, { actor: 'world', bus });
      if (movement.ok) newState = movement.state;
    }
  }

  // Barbarian attacks
  for (const attack of barbResult.attackOrders) {
    const attacker = newState.units[attack.attackerUnitId];
    const defender = newState.units[attack.defenderUnitId];
    if (!attacker || !defender) continue;
    if (!resolveUnitVsUnitAttack(newState, attacker, defender, { requireVisibility: false }).ok) continue;
    const combatSeed = deterministicCombatSeed(newState.gameId, newState.turn, attacker.id, defender.id);
    const result = resolveCombat(
      attacker,
      defender,
      newState.map,
      combatSeed,
      buildCombatContextForDefender(newState, attacker, defender),
      resolveCombatEra(newState, attacker, defender),
    );
    const combatPresentation = buildCombatPresentation(newState, result, attacker, defender);
    const applied = applyCombatOutcomeToState(newState, result, combatSeed, bus);
    newState = applied.state;
    emitMinorCivQuestTransitions(bus, applied.questTransitions, newState);
    bus.emit('combat:resolved', { result, ...combatPresentation });
    for (const reward of applied.rewards) {
      bus.emit('combat:reward-earned', { reward });
    }
  }

  // Barbarian city attacks — routed through the shared siege helper (#522): a
  // garrisoned city fully blocks damage, walls/techs mitigate it, and the 0-HP
  // outcome is sack-vs-destroy gated by era + the owner's resolved difficulty.
  for (const order of barbResult.cityAttackOrders) {
    const city = newState.cities[order.cityId];
    if (!city) continue;
    const currentHp = city.hp ?? 100;
    if (currentHp <= 0) continue; // already at zero (shouldn't persist, but guard against legacy saves)
    const ownerCiv = newState.civilizations[city.owner];
    if (!ownerCiv) continue;

    const result = resolveCitySiegeDamage({
      city,
      ownerCiv,
      rawDamage: order.damage,
      attackerDomain: 'land',
      hasGarrison: getCityGarrisonUnit(newState.units, city) !== undefined,
      isOwnersLastCity: ownerCiv.cities.length <= 1,
      era: resolveCivilizationEra(ownerCiv.techState.completed),
      challenge: resolveChallengeForCiv(newState, city.owner),
    });
    newState = applyCitySiegeOutcome(newState, order.cityId, result);
    if (result.outcome === 'blocked') continue;

    // Counter-fire (#522): a walled, ungarrisoned city fights back against the raider
    // that's damaging it. #982: same 'city-counter-fire' domain tag as
    // city-bombardment-system.ts/pirate-system.ts's own counter-fire rolls.
    // Was `barbSeed ^ attackerUnitId.charCodeAt(0)`, where barbSeed itself
    // (`turn*31337 + camp count`) had no gameId and no per-attack identity,
    // shared by every barbarian counter-fire event in the game this turn.
    const attackerUnit = newState.units[order.attackerUnitId];
    if (attackerUnit) {
      const attackerStrength = getUnitCombatStrength(attackerUnit) * (attackerUnit.health / 100);
      const counterFireSeed = Math.floor(createSimulationRng(newState, { domain: 'city-counter-fire', actorId: order.attackerUnitId, targetId: order.cityId })() * 2147483647);
      const counterFireDamage = getCityCounterFireDamage(
        city, ownerCiv, 'land', attackerStrength, false, counterFireSeed,
      );
      if (counterFireDamage > 0) {
        const healthAfter = attackerUnit.health - counterFireDamage;
        const attackerDied = healthAfter <= 0;
        if (attackerDied) {
          newState = removeUnits(newState, [order.attackerUnitId], { reason: 'destroyed', bus }).state;
          // barbarianHomeCampByUnitId self-prunes stale entries for dead units on the
          // next processing pass (barbarian-system.ts) -- no further cleanup needed here.
        } else {
          newState = {
            ...newState,
            units: { ...newState.units, [order.attackerUnitId]: { ...attackerUnit, health: healthAfter } },
          };
        }
        bus.emit('city:counter-fire', {
          cityId: order.cityId,
          attackerUnitId: order.attackerUnitId,
          source: 'barbarian',
          damage: counterFireDamage,
          attackerDied,
        });
      }
    }

    bus.emit('barbarian:city-attacked', { attackerUnitId: order.attackerUnitId, cityId: order.cityId, hpLost: result.hpLost });
    if (newState.opponentAI) {
      const campId = newState.opponentAI.barbarianHomeCampByUnitId[order.attackerUnitId];
      const plan = campId ? newState.opponentAI.barbarianCamps[campId] : undefined;
      if (plan?.target.kind === 'city' && plan.target.id === order.cityId) {
        newState.opponentAI.barbarianCamps[campId] = {
          ...plan,
          phase: 'withdrawing',
          lastProgressTurn: newState.turn,
        };
      }
    }

    if (result.outcome === 'sacked') {
      bus.emit('city:sacked', { cityId: order.cityId, source: 'barbarian', goldLost: result.goldLost });
    } else if (result.outcome === 'destroyed') {
      bus.emit('barbarian:city-destroyed', { attackerUnitId: order.attackerUnitId, cityId: order.cityId, ownerId: city.owner });
    }
  }

  // City HP regeneration (#522) — +5/turn for any city below max HP with no hostile
  // unit adjacent, so damage from a raid that didn't destroy the city doesn't linger
  // forever.
  newState = applyCityHpRegeneration(newState);

  // --- Minor civ turn phase ---
  newState = processMinorCivTurn(newState, bus);

  // --- Barbarian evolution check ---
  const evolution = checkCampEvolution(newState, newState.turn);
  if (evolution) {
    delete newState.barbarianCamps[evolution.removeCampId];
    newState.cities[evolution.newCity.id] = evolution.newCity;
    newState.units[evolution.newGarrison.id] = evolution.newGarrison;
    for (const uid of evolution.transferUnitIds) {
      if (newState.units[uid]) {
        newState.units[uid].owner = evolution.newMinorCiv.id;
      }
    }
    newState.minorCivs[evolution.newMinorCiv.id] = evolution.newMinorCiv;
    bus.emit('minor-civ:evolved', {
      campId: evolution.removeCampId,
      minorCivId: evolution.newMinorCiv.id,
      position: evolution.newCity.position,
    });
  }

  // --- Process legendary beasts ---
  if (newState.beasts && newState.beasts.mode !== 'off') {
    // Legacy save migration: place lairs on the first turn after the flag is set by migrateLegacySave.
    // Deferred from load time so 🐾 markers don't appear until the player takes their first action.
    if (newState.beasts.migrationPending) {
      const mapSize = newState.settings.mapSize ?? 'medium';
      const cityPositions = Object.values(newState.cities).map(c => c.position);
      const migrationSeed = (newState.gameId ?? 'legacy') + '-beasts-migration';
      const lairs = placeBeastLairs(newState.map, cityPositions, mapSize, migrationSeed);
      newState = { ...newState, beasts: { ...newState.beasts, lairs, migrationPending: undefined } };
      if (!newState.pendingEvents) newState = { ...newState, pendingEvents: {} };
      for (const civId of Object.keys(newState.civilizations)) {
        if (!newState.pendingEvents![civId]) newState.pendingEvents![civId] = [];
        newState.pendingEvents![civId]!.push({
          type: 'info',
          message: 'Ancient legends are stirring in the wilderness. Legendary beasts now roam forgotten lairs across the land.',
          turn: newState.turn,
        });
      }
    }

    for (const [unitId, unit] of Object.entries(newState.units)) {
      if (unit.owner === BEAST_OWNER) {
        newState.units[unitId] = { ...unit, movementPointsLeft: UNIT_DEFINITIONS[unit.type].movementPoints, hasMoved: false };
      }
    }
    const beastUnits = Object.values(newState.units).filter(u => u.owner === BEAST_OWNER);
    const intruders = Object.values(newState.units).filter(unit => {
      const kind = classifyOwner(unit.owner);
      return kind !== 'beast' && kind !== 'barbarian' && unit.owner !== PIRATE_OWNER;
    });
    // #982: one shared stream drives every lair/beast this turn (processBeasts'
    // own internal lcg() advances sequentially per lair) -- was `turn*7919 + 13`,
    // no gameId. The +13 offset existed only to decorrelate from other
    // turn*7919-seeded sites (city-bombardment-system.ts, crisis-system.ts),
    // which is now handled by the 'beast-tick' domain tag instead.
    const beastSeed = Math.floor(createSimulationRng(newState, { domain: 'beast-tick', eventId: 'beast-tick' })() * 2147483647);
    // #994: beasts have no live Unit until a lair actually spawns one, so this is keyed by the
    // fixed BEAST_OWNER constant rather than a specific beast instance — every beast/lair shares
    // the same blocking rules regardless.
    const beastBlockedHexKeys = getBlockingMapEntityKeysForOwner(newState, BEAST_OWNER);
    const beastResult = processBeasts(
      Object.values(newState.beasts!.lairs),
      newState.map,
      intruders,
      beastUnits,
      lair => resolveNeutralPressureEra(newState, lair.position) ?? 1,
      newState.beasts!.mode,
      beastSeed,
      beastBlockedHexKeys,
    );
    // Rebuild lairs map from updated results (immutable)
    let updatedLairs: Record<string, import('./types').BeastLair> = {};
    for (const lair of beastResult.updatedLairs) updatedLairs[lair.id] = lair;

    // Apply spawn orders — create beast units and wire them into lairs
    for (const spawn of beastResult.spawnOrders) {
      const def = BEAST_DEFINITIONS[spawn.beastId];
      const beast = createUnit(def.unitType, BEAST_OWNER, spawn.position, newState.idCounters);
      newState = { ...newState, units: { ...newState.units, [beast.id]: beast } };
      bus.emit('unit:created', { unit: beast }); // register with SfxDirector's unitTypeCache
      const lair = updatedLairs[spawn.lairId];
      if (lair) updatedLairs = { ...updatedLairs, [spawn.lairId]: { ...lair, unitIds: [...lair.unitIds, beast.id] } };
    }

    // Stamp awakenedTurn onto awoken lairs
    for (const awakening of beastResult.awakenings) {
      const lair = updatedLairs[awakening.lairId];
      if (lair) updatedLairs = { ...updatedLairs, [awakening.lairId]: { ...lair, awakenedTurn: newState.turn } };
      bus.emit('beast:awakened', awakening);
    }

    // Growth while ignored: every N turns an awake lair hardens and its beasts gain veterancy
    if (newState.turn % LAIR_GROWTH_INTERVAL_TURNS === 0) {
      for (const lair of Object.values(updatedLairs)) {
        if (lair.status !== 'awake' || lair.strength >= LAIR_GROWTH_CAP) continue;
        updatedLairs = { ...updatedLairs, [lair.id]: { ...lair, strength: lair.strength + 1 } };
        let nextUnits = newState.units;
        for (const unitId of lair.unitIds) {
          const beast = nextUnits[unitId];
          if (beast) nextUnits = { ...nextUnits, [unitId]: { ...beast, experience: beast.experience + LAIR_GROWTH_EXPERIENCE } };
        }
        newState = { ...newState, units: nextUnits };
      }
    }

    // Commit final lairs into state
    newState = { ...newState, beasts: { ...newState.beasts!, lairs: updatedLairs } };

    // #994: a raw position write, not moveUnitWithZoneOfControl/executeUnitMove — safe only
    // because processBeasts already filtered every candidate step against beastBlockedHexKeys
    // above (see .claude/rules/movement-actions.md's "World-actor step/spawn placement" section).
    for (const move of beastResult.moveOrders) {
      const beast = newState.units[move.unitId];
      if (beast) {
        newState = { ...newState, units: { ...newState.units, [move.unitId]: { ...beast, position: { ...move.toCoord }, movementPointsLeft: beast.movementPointsLeft - 1 } } };
      }
    }
    for (const regen of beastResult.regenOrders) {
      const beast = newState.units[regen.unitId];
      if (beast) {
        newState = { ...newState, units: { ...newState.units, [regen.unitId]: { ...beast, health: Math.min(100, beast.health + regen.amount) } } };
      }
    }

    for (const order of beastResult.attackOrders) {
      const attacker = newState.units[order.attackerUnitId];
      const defender = newState.units[order.defenderUnitId];
      if (!attacker || !defender) continue;
      const combatSeed = deterministicCombatSeed(newState.gameId, newState.turn, attacker.id, defender.id);
      // attack-contract-exempt: world-actor: legendary beasts pick their own targets in beast-system (processBeasts); not a civ's attack order
      const result = resolveCombat(
        attacker,
        defender,
        newState.map,
        combatSeed,
        buildCombatContextForDefender(newState, attacker, defender),
        resolveCombatEra(newState, attacker, defender),
      );
      const combatPresentation = buildCombatPresentation(newState, result, attacker, defender);
      const applied = applyCombatOutcomeToState(newState, result, combatSeed, bus);
      newState = applied.state;
      emitMinorCivQuestTransitions(bus, applied.questTransitions, newState);
      // A beast that died on its own counterattack is slain inside applyCombatOutcomeToState (#1014).
      // If the intruder died, no hoard — the beast attacked, not the player
      bus.emit('combat:resolved', { result, ...combatPresentation });
      for (const reward of applied.rewards) {
        bus.emit('combat:reward-earned', { reward });
      }
    }
  }

  // --- Threat pressure (spawn phase: land resurgence + pirate spawn) ---
  newState = processIndependentThreatPressure(newState, bus);
  newState = processCrisisScheduler(newState, bus);
  newState = processEventChainScheduler(newState, bus);
  const stampedesBeforeScheduling = newState.stampedes;
  const hostsBeforeScheduling = newState.rogueElephantHosts;
  newState = processStampedeScheduling(newState);
  newState = processRogueElephantHostScheduling(newState);
  for (const civId of Object.keys(newState.stampedes ?? {}).sort()) {
    const transition = getStampedeLifecycleTransition(
      stampedesBeforeScheduling?.[civId],
      newState.stampedes?.[civId],
    );
    if (transition) bus.emit('stampede:lifecycle', transition);
  }
  for (const civId of Object.keys(newState.rogueElephantHosts ?? {}).sort()) {
    const transition = getRogueElephantHostLifecycleTransition(
      hostsBeforeScheduling?.[civId],
      newState.rogueElephantHosts?.[civId],
    );
    if (transition) bus.emit('rogue-elephant-host:lifecycle', transition);
  }

  // --- Process espionage ---
  // #1201: processEspionageTurn owns flip_loyalty's city transfer and
  // intercept_courier's route removal (through the canonical city/trade transitions),
  // so no caller-side event glue is required here.
  newState = processEspionageTurn(newState, bus);
  newState = processDetection(newState, bus);

  // Process active interrogations and apply extracted intel to game state
  for (const [captorId, captorEsp] of Object.entries(newState.espionage ?? {})) {
    if (!captorEsp.activeInterrogations || Object.keys(captorEsp.activeInterrogations).length === 0) continue;
    const seed = `interro-${captorId}-${newState.turn}`;
    const { state: updatedEsp, newIntel } = processInterrogation(captorEsp, seed, newState);
    newState = { ...newState, espionage: { ...newState.espionage!, [captorId]: updatedEsp } };

    for (const intel of newIntel) {
      if (intel.type === 'map_area') {
        const tiles = intel.data.tiles as Array<{ q: number; r: number }>;
        if (newState.civilizations[captorId]?.visibility?.tiles) {
          for (const t of tiles) {
            newState.civilizations[captorId].visibility.tiles[`${t.q},${t.r}`] = 'fog';
          }
        }
      }
      if (intel.type === 'tech_hint') {
        const bonus = intel.data.researchBonus as number;
        const cap = newState.civilizations[captorId];
        if (cap) {
          const currentTechId = cap.techState.currentResearch;
          const currentTech = currentTechId ? getTechById(currentTechId) : undefined;
          const techCost = currentTech ? getEffectiveTechCost(currentTech, cap.techState.completed) : 0;
          const progressGain = techCost > 0 ? Math.floor(bonus * techCost) : 0;
          if (progressGain > 0) {
            const researchResult = applyResearchBonus(cap.techState, progressGain);
            newState = {
              ...newState,
              civilizations: {
                ...newState.civilizations,
                [captorId]: {
                  ...cap,
                  techState: researchResult.state,
                },
              },
            };
            if (researchResult.completedTech) {
              bus.emit('tech:completed', {
                civId: captorId,
                techId: researchResult.completedTech,
                carriedProgress: researchResult.carriedProgress,
                carriedIntoTechId: researchResult.carriedProgress > 0 ? researchResult.state.currentResearch : null,
              });
              newState = applyResearchCompletionConsequences(newState, captorId, researchResult.completedTech, bus);
            }
          }
        }
      }
    }

    if (newIntel.length > 0) {
      bus.emit('espionage:intel-extracted', { captorId, intel: newIntel });
    }
  }

  // Decrement city vision from infiltrated spies and keep tile visible while active
  {
    let espionage = newState.espionage ?? {};
    let civilizations = newState.civilizations;
    for (const [civId, civEsp] of Object.entries(espionage)) {
      let updatedSpies = civEsp.spies;
      let updatedVisibility = civilizations[civId]?.visibility;
      for (const [spyId, spy] of Object.entries(civEsp.spies)) {
        if (!spy.cityVisionTurnsLeft || spy.cityVisionTurnsLeft <= 0) continue;
        const newLeft = spy.cityVisionTurnsLeft - 1;
        updatedSpies = { ...updatedSpies, [spyId]: { ...spy, cityVisionTurnsLeft: newLeft } };
        if (spy.infiltrationCityId && updatedVisibility?.tiles) {
          const city = newState.cities[spy.infiltrationCityId];
          if (city) {
            updatedVisibility = {
              ...updatedVisibility,
              tiles: { ...updatedVisibility.tiles, [`${city.position.q},${city.position.r}`]: 'visible' },
            };
          }
        }
      }
      if (updatedSpies !== civEsp.spies) {
        espionage = { ...espionage, [civId]: { ...civEsp, spies: updatedSpies } };
      }
      if (updatedVisibility !== civilizations[civId]?.visibility) {
        civilizations = { ...civilizations, [civId]: { ...civilizations[civId], visibility: updatedVisibility! } };
      }
    }
    newState = { ...newState, espionage, civilizations };
  }

  // Embedded spy per-turn CI contribution
  {
    let espionage = newState.espionage ?? {};
    for (const [civId, civEsp] of Object.entries(espionage)) {
      let ci = civEsp.counterIntelligence;
      let changed = false;
      for (const spy of Object.values(civEsp.spies)) {
        if (spy.status !== 'embedded' || !spy.targetCityId) continue;
        const perTurnBonus = 2 + Math.floor(spy.experience * 0.1);
        ci = { ...ci, [spy.targetCityId]: Math.min(100, (ci[spy.targetCityId] ?? 0) + perTurnBonus) };
        changed = true;
      }
      if (changed) {
        espionage = { ...espionage, [civId]: { ...civEsp, counterIntelligence: ci } };
      }
    }
    newState = { ...newState, espionage };
  }

  // Building CI bonuses per turn (Intelligence Agency + Security Bureau)
  {
    let espionage = newState.espionage ?? {};
    for (const [civId, civ] of Object.entries(newState.civilizations)) {
      if (!espionage[civId]) continue;
      for (const cityId of civ.cities) {
        const city = newState.cities[cityId];
        if (!city) continue;
        const updated = applyBuildingCI(cityId, city, espionage[civId], civ.techState.completed);
        if (updated !== espionage[civId]) {
          espionage = { ...espionage, [civId]: updated };
        }
      }
    }
    newState = { ...newState, espionage };
  }

  // Re-snapshot all civs after espionage so spy-revealed tiles get lastSeen entries
  // before they transition back to fog. This must run after all visibility.tiles mutations
  // in the espionage block (processEspionageTurn, processDetection, spy city vision).
  for (const civId of Object.keys(newState.civilizations)) {
    newState = refreshLastSeenPresentationsForCiv(newState, civId);
  }

  // #910: human decisions remain recipient-owned; this only advances obligations.
  newState = processVassalageTurn(newState, bus);

  // --- Vassal auto-joins overlord's embargoes ---
  if (newState.embargoes) {
    for (const [civId, civ] of Object.entries(newState.civilizations)) {
      const overlordId = civ.diplomacy?.vassalage.overlord;
      if (!overlordId) continue;
      for (const embargo of newState.embargoes) {
        if (embargo.participants.includes(overlordId) && !embargo.participants.includes(civId)) {
          newState.embargoes = joinEmbargo(newState.embargoes, embargo.id, civId);
        }
      }
    }
  }

  // --- S6a: terminate stale foreign routes (war / hostile relations) ---
  if (newState.marketplace) {
    newState = scrubStaleForeignRoutes(newState, bus);
  }

  // --- S6a: terminate routes to embargoed civs ---
  if (newState.embargoes && newState.marketplace) {
    newState = scrubEmbargoedRoutes(newState, bus);
    newState = { ...newState, embargoes: cleanupEmbargoes(newState.embargoes) };
  }

  // --- S6b: advance caravan route-runners ---
  if (newState.marketplace) {
    newState = advanceRouteRunners(newState, bus);
  }

  let pirateEconomyModifiers: PirateEconomyModifiers | undefined;
  const pirateRound = processPiratesForCompletedRound(newState, bus);
  newState = pirateRound.state;
  pirateEconomyModifiers = pirateRound.economyModifiers;

  if (newState.marketplace) {
    for (const civId of Object.keys(newState.civilizations)) {
      if (!getCivilizationLiveness(newState, civId).living) continue;
      const civRouteIncome = processTradeRouteIncome(
        newState.marketplace.tradeRoutes.filter(route => {
          const city = newState.cities[route.fromCityId];
          return city?.owner === civId;
        }),
        newState,
      );
      grossGoldByCiv[civId] = (grossGoldByCiv[civId] ?? 0) + civRouteIncome;
    }
  }

  // --- League dissolution check ---
  if (newState.defensiveLeagues) {
    const warPairs: Array<{ civA: string; civB: string }> = [];
    for (const civ of Object.values(newState.civilizations)) {
      for (const enemyId of civ.diplomacy?.atWarWith ?? []) {
        warPairs.push({ civA: civ.id, civB: enemyId });
      }
    }
    const dissolved = newState.defensiveLeagues.filter(l => {
      for (const pair of warPairs) {
        if (l.members.includes(pair.civA) && l.members.includes(pair.civB)) return true;
      }
      return false;
    });
    for (const league of dissolved) {
      bus.emit('diplomacy:league-dissolved', { leagueId: league.id, reason: 'members_at_war' });
    }
    newState.defensiveLeagues = checkLeagueDissolution(newState.defensiveLeagues, warPairs);
  }

  // --- Era advancement check ---
  const newEra = checkEraAdvancement(newState);
  if (newEra > newState.era) {
    newState.era = newEra;
    bus.emit('era:advanced', { era: newEra });
  }

  const { state: afterExpiry, expired } = expireNationalProjects(newState);
  newState = afterExpiry;
  for (const item of expired) bus.emit('city:national-project-expired', item);
  for (const cityId of Object.keys(newState.cities)) {
      const city = newState.cities[cityId];
      if (!city) continue;
      const staleNPs = city.productionQueue.filter((item: string) => {
        const bldg = BUILDINGS[item];
        const owner = newState.civilizations[city.owner];
        return bldg?.nationalProject && owner && resolveCivilizationEra(owner.techState.completed) > bldg.nationalProject.homeEra + 1;
      });
      if (staleNPs.length === 0) continue;
      newState = {
        ...newState,
        cities: {
          ...newState.cities,
          [cityId]: {
            ...city,
            productionQueue: city.productionQueue.filter((item: string) => {
              const bldg = BUILDINGS[item];
              const owner = newState.civilizations[city.owner];
              return !(bldg?.nationalProject && owner && resolveCivilizationEra(owner.techState.completed) > bldg.nationalProject.homeEra + 1);
            }),
          },
        },
      };
      for (const buildingId of staleNPs) {
        bus.emit('city:national-project-dequeued', { civId: city.owner, cityId, buildingId });
      }
    }

  for (const [civId, civ] of Object.entries(newState.civilizations)) {
    const era = resolveCivilizationEra(civ.techState.completed);
    if (era > (previousEraByCiv[civId] ?? era)) bus.emit('civilization:era-advanced', { civId, previousEra: previousEraByCiv[civId]!, era });
  }
  // Local minor-civ pressure is derived from nearby/target civilizations, so it
  // must be checked every round rather than only when aggregate World Age moves.
  for (const mc of Object.values(newState.minorCivs)) {
    processMinorCivEraUpgrade(newState, mc);
  }

  if (newState.beasts) {
    for (const pending of [...(newState.beasts.pendingHoardChoices ?? [])]) {
      if (pending.civId === newState.currentPlayer) continue;
      newState = applyHoardChoice(newState, pending.lairId, pending.civId, 'gold');
    }
    for (const civId of Object.keys(newState.civilizations)) {
      if (!getCivilizationLiveness(newState, civId).living) continue;
      const trophyGold = getClaimedTrophyGoldPerTurn(newState, civId);
      if (trophyGold > 0) grossGoldByCiv[civId] = (grossGoldByCiv[civId] ?? 0) + trophyGold;
    }
  }

  for (const civId of Object.keys(newState.civilizations)) {
    if (!getCivilizationLiveness(newState, civId).living) continue;
    newState = applyEconomyTurn(newState, civId, grossGoldByCiv[civId] ?? 0, pirateEconomyModifiers);
    emitEconomyStrainIfNeeded(previousEconomyStatusByCiv[civId], newState.economyStatusByCiv![civId], bus, civId);
  }

  liveness = reconcileCivilizationLiveness(newState, newState);
  emitCivilizationLivenessTransitions(liveness, bus);
  newState = finalizeOpponentRoundState(liveness.state);

  // --- Advance turn ---
  newState.turn += 1;
  newState = finalizeDominationVictory(newState, bus);
  newState = finalizeScienceVictory(newState, bus);
  bus.emit('turn:start', { turn: newState.turn, playerId: newState.currentPlayer });

  return newState;
}

/**
 * #974 Hold Siege: one turn's worth of a standing bombardment order.
 *
 * Re-resolves legality every turn through the same resolver the player's own tap uses, so a
 * standing order can never do something a manual click could not. Clears itself and tells
 * the player why the moment bombarding stops being possible -- an automation that silently
 * stops is worse than no automation.
 */
export function applyHoldSiegeOrder(
  state: GameState,
  unitId: string,
  cityId: string,
  bus: EventBus,
): GameState {
  let nextState = state;
  const clear = (reason: string) => {
    const current = nextState.units[unitId];
    if (current) {
      nextState = {
        ...nextState,
        units: { ...nextState.units, [unitId]: { ...current, automation: undefined } },
      };
    }
    bus.emit('unit:hold-siege-ended', { unitId, cityId, reason });
  };

  const unit = nextState.units[unitId];
  const city = nextState.cities[cityId];
  if (!unit) return nextState;
  if (!city) {
    clear('The city is gone.');
    return nextState;
  }
  if (city.owner === unit.owner) {
    clear(`${city.name} is yours now.`);
    return nextState;
  }

  const bombard = resolveCityInteraction(nextState, unit, city).available
    .find(action => action.kind === 'bombard');
  if (!bombard) {
    const denial = resolveCityInteraction(nextState, unit, city).denied
      .find(entry => entry.kind === 'bombard');
    clear(denial?.reason ?? `Your unit can no longer bombard ${city.name}.`);
    return nextState;
  }

  const result = resolveUnitCityBombardment(nextState, { attackerUnitId: unitId, cityId, source: 'player' });
  if (!result.ok) {
    clear(`Your unit can no longer bombard ${city.name}.`);
    return nextState;
  }

  nextState = result.state;
  if (result.cityEvent) bus.emit('city:bombarded', result.cityEvent);
  if (result.batteryEvent) bus.emit('city:coastal-battery-fired', result.batteryEvent);

  // Taking return fire ends the order: a standing order must not quietly grind a unit to
  // death while the player is looking elsewhere.
  if (result.counterFireDamage > 0 && nextState.units[unitId]) {
    clear(`Your unit is under fire at ${city.name}.`);
  }
  return nextState;
}
