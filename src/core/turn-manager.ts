import type { AdvisorType, GameState } from './types';
import { EventBus } from './event-bus';
import { checkDominationVictory } from '@/systems/victory-system';
import { resetUnitTurn, createUnit, healUnit, findPath, UNIT_DEFINITIONS } from '@/systems/unit-system';
import { processCity, TRAINABLE_UNITS, BUILDINGS } from '@/systems/city-system';
import { baseNewAirUnit, canCompleteAirUnitProduction } from '@/systems/air-operations-system';
import { getCivAvailableResources } from '@/systems/resource-acquisition-system';
import { applyCityMaturity } from '@/systems/city-maturity-system';
import { assignCityFocus, normalizeWorkedTilesForCity } from '@/systems/city-work-system';
import { processResearch, getTechById, getEffectiveTechCost } from '@/systems/tech-system';
import {
  processPurposefulBarbarians,
} from '@/systems/barbarian-system';
import {
  processBeasts, placeBeastLairs, recordBeastSlain, BEAST_OWNER,
  LAIR_GROWTH_INTERVAL_TURNS, LAIR_GROWTH_CAP, LAIR_GROWTH_EXPERIENCE,
  applyHoardChoice, getClaimedTrophyGoldPerTurn,
} from '@/systems/beast-system';
import { BEAST_DEFINITIONS } from '@/systems/beast-definitions';
import { deterministicCombatSeed, resolveCombat } from '@/systems/combat-system';
import { buildCombatContextForDefender } from '@/systems/combat-context';
import { canUnitAttackTarget } from '@/systems/attack-targeting';
import { applyCombatOutcomeToState } from '@/systems/combat-reward-system';
import {
  PIRATE_OWNER,
  processIndependentThreatPressure,
  recordCombatForCiv,
} from '@/systems/threat-pressure-system';
import { emitMinorCivQuestTransitions } from '@/systems/quest-chain-system';
import { applyAutoExploreOrder } from '@/systems/auto-explore-system';
import { hexKey } from '@/systems/hex-utils';
import { executeUnitMove } from '@/systems/unit-movement-system';
import { buildCombatPresentation } from '@/systems/viewer-event-presentation';
import { calculateCityYields } from '@/systems/resource-system';
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
import { getActiveNationalProjectsForCiv } from '@/systems/national-project-system';
import { UNIT_CLASS_BY_TYPE } from '@/systems/unit-modifier-definitions';
import { getHealingBonus, getVisionBonus, isWithinRangeOfTelemedicineHub } from '@/systems/unit-modifier-system';
import { syncCivilizationContactsFromVisibility } from '@/systems/discovery-system';
import { refreshLastSeenPresentationsForCiv } from '@/systems/last-seen-presentation';
import {
  processRelationshipDrift,
  decayEvents,
  tickTreaties,
  processVassalageTribute,
  processProtectionTimers,
  checkIndependenceThreshold,
  petitionIndependence,
  endVassalage,
  endVassalageUnilateral,
  declareWar,
  isAtWar,
  decayTreachery,
  joinEmbargo,
  cleanupEmbargoes,
  checkLeagueDissolution,
  triggerLeagueDefense,
  getLeagueForCiv,
  pruneExpiredDiplomaticRequests,
} from '@/systems/diplomacy-system';
import { processTradeRouteIncome, processFashionCycle, updatePrices, removeRouteForUnit, scrubStaleForeignRoutes, scrubEmbargoedRoutes } from '@/systems/trade-system';
import { advanceRouteRunners } from '@/systems/unit-movement-system';
import { processWonderEffects } from '@/systems/wonder-system';
import { createRng } from '@/systems/map-generator';
import { processMinorCivTurn, checkEraAdvancement, processMinorCivEraUpgrade, checkCampEvolution } from '@/systems/minor-civ-system';
import { resolveCivDefinition } from '@/systems/civ-registry';
import { applyProductionBonus } from '@/systems/city-system';
import { chargeUnitsOnGeneTherapyResearch, applyGeneTherapyRecharge } from '@/systems/gene-therapy-system';
import { processCyberDrain } from '@/systems/cyber-warfare-system';
import {
  beginNetworkPlansForVictimTurn,
  isAutonomyActivated,
  resolveNetworkPlansForVictimTurnEnd,
} from '@/systems/network-plan-system';
import { processEspionageTurn, isSpyUnitType, createSpyFromUnit, processInterrogation, applyBuildingCI } from '@/systems/espionage-system';
import { processDetection } from '@/systems/detection-system';
import { applyPendingOpponentChallenge, resolveChallengeForCiv } from '@/core/opponent-challenge';
import { applyCityHpRegeneration, applyCitySiegeOutcome, getCityCounterFireDamage, getCityGarrisonUnit, resolveCitySiegeDamage } from '@/systems/city-siege-system';
import { normalizeOpponentAIState } from '@/core/opponent-ai-state';
import { processFactionTurn, getUnrestYieldMultiplier, isCityProductionLocked } from '@/systems/faction-system';
import { getOccupiedCityYieldMultiplier, tickOccupiedCities } from '@/systems/city-occupation-system';
import { processBreakawayTurn } from '@/systems/breakaway-system';
import { processCrisisTurn, processCrisisScheduler, getCrisisYieldMultiplier } from '@/systems/crisis-system';
import { processReligionTurn } from '@/systems/religion-system';
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
import { applyEconomyTurn, emitEconomyStrainIfNeeded } from '@/systems/economy-system';
import {
  getNationalProjectCivYieldBonus,
  expireNationalProjects,
} from '@/systems/national-project-system';
import type { PirateEconomyModifiers } from '@/systems/economy-system';
import { processPiratesForCompletedRound } from '@/systems/pirate-system';
import { classifyOwner } from './owner-kind';

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

export function processTurn(
  state: GameState,
  bus: EventBus,
): GameState {
  let newState = initializeLegendaryWonderProjectsForAllCities(structuredClone(state));
  newState = normalizeOpponentAIState(newState);

  bus.emit('turn:end', { turn: newState.turn, playerId: newState.currentPlayer });

  // Resolve unrest and revolts before city yields so instability impacts the current turn.
  newState = processFactionTurn(newState, bus);
  newState = processBreakawayTurn(newState, bus);
  newState = processCrisisTurn(newState, bus);
  newState = processReligionTurn(newState, bus);
  // AI civ turns run later via the AI round scheduler, so responses recorded
  // here (quarantine/fund-remedy) shape the same round's plans (#529 MR3 Task 3.2).
  if (resolveWorldPressureFlags(newState.settings).aiPressure === 'full') {
    newState = applyCrisisResponses(newState);
  }
  newState = tickOccupiedCities(newState);
  const grossGoldByCiv: Record<string, number> = {};
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
    let totalScience = 0;
    let totalGold = 0;
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
        production: Math.floor((baseYields.production + (wonderCityBonuses.production ?? 0) + resourceYieldBonus.production + (npCivBonuses.production ?? 0) + empireFlatProductionForCity + resilienceBonus) * unrestMultiplier.production * (1 + (empireTechPercents.production ?? 0) / 100)),
        gold:       Math.floor((baseYields.gold       + (wonderCityBonuses.gold       ?? 0) + resourceYieldBonus.gold)       * unrestMultiplier.gold * (1 + (empireTechPercents.gold ?? 0) / 100)),
        science:    Math.floor((baseYields.science    + (wonderCityBonuses.science    ?? 0) + resourceYieldBonus.science + networkGovernanceScienceForCity) * unrestMultiplier.science * (1 + (empireTechPercents.science ?? 0) / 100)),
      };
      totalScience += yields.science;
      totalGold += yields.gold;
      baseGoldByCityId[cityId] = yields.gold;
      const effectiveProduction = isCityProductionLocked(city) ? 0 : yields.production;
      const availableResources = getCivAvailableResources(newState, civId);
      const npKeysForCiv = new Set(
        Object.keys(newState.builtNationalProjects ?? {}).filter(k => k.startsWith(`${civId}:`))
      );
      const result = processCity(
        city,
        newState.map,
        yields.food,
        effectiveProduction,
        civDef?.bonusEffect,
        civ.techState.completed,
        civ.civType,
        newState.era,
        availableResources,
        npKeysForCiv,
        type => {
          if (!UNIT_DEFINITIONS[type].airOperation) return null;
          return canCompleteAirUnitProduction(newState, cityId, type).ok ? null : 'air-base-unavailable';
        },
      );
      totalGold += result.idleGoldBonus;
      totalScience += result.idleScienceBonus;

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
              [npKey]: { civId, cityId, eraBuilt: newState.era },
            },
          };
          bus.emit('city:national-project-built', {
            civId,
            cityId,
            buildingId: result.completedBuilding,
            eraBuilt: newState.era,
          });
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
        bus.emit('city:unit-trained', { cityId, unitType: result.completedUnit });
        const newUnit = createUnit(result.completedUnit, civId, city.position, newState.idCounters, civDef?.bonusEffect);
        const unitDef = UNIT_DEFINITIONS[result.completedUnit];
        if (unitDef?.domain === 'naval') {
          let navalMoveBonus = 0;
          if (newState.completedLegendaryWonders?.['navigators-compass']?.ownerId === civId) navalMoveBonus += 1;
          if (civ.techState.completed.includes('trade-winds')) navalMoveBonus += 1;
          if (navalMoveBonus > 0) {
            newUnit.movementPointsLeft += navalMoveBonus;
            newUnit.movementBonus = (newUnit.movementBonus ?? 0) + navalMoveBonus;
          }
        }
        if (unitDef?.domain === 'air' && civ.techState.completed.includes('private-spaceflight')) {
          newUnit.movementPointsLeft += 1;
          newUnit.movementBonus = (newUnit.movementBonus ?? 0) + 1;
        }
        if (civ.techState.completed.includes('gene-therapy')) {
          newUnit.geneTherapyReady = newState.cities[cityId]?.buildings.includes('gene_therapy_clinic') ?? false;
        }
        const isLandCombatUnit = (unitDef?.domain ?? 'land') === 'land'
          && !isSpyUnitType(result.completedUnit)
          && !(UNIT_CLASS_BY_TYPE[result.completedUnit] ?? []).includes('civilian');
        if (isLandCombatUnit && city.buildings.includes('barracks')) {
          newUnit.experience += 10;
        }
        if (unitDef?.airOperation) {
          const based = baseNewAirUnit(newState, cityId, newUnit);
          if (!based.ok) {
            throw new Error(`Air production for ${newUnit.type} completed without a legal base: ${based.reason}`);
          }
          newState = based.state;
        } else {
          newState.units[newUnit.id] = newUnit;
        }
        newState.civilizations[civId].units.push(newUnit.id);

        if (isSpyUnitType(result.completedUnit) && newState.espionage?.[civId]) {
          const { state: updatedEsp, spy } = createSpyFromUnit(
            newState.espionage[civId],
            newUnit.id,
            civId,
            result.completedUnit,
            `spy-unit-${newUnit.id}-${newState.turn}`,
          );
          newState.espionage[civId] = updatedEsp;
          bus.emit('espionage:spy-recruited', { civId, spy });
        }
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
    totalScience += wonderCivBonuses.science ?? 0;
    totalGold += wonderCivBonuses.gold ?? 0;
    totalScience += npCivBonuses.science ?? 0;
    // NP food/production applied per-city above; NP gold handled in economy-system.ts to avoid double-counting
    totalGold += getCivLuxuryTechGold(civ.techState.completed, getCivHappinessFromResources(newState, civId));
    totalGold += empireFlatTechYields.gold;
    totalScience += empireFlatTechYields.science;

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
      totalScience += allianceCount * civDef.bonusEffect.allianceYieldBonus;
      totalGold += allianceCount * civDef.bonusEffect.allianceYieldBonus;
    }

    const researchPenaltyMultiplier = currentCivState.researchPenaltyTurns && currentCivState.researchPenaltyTurns > 0
      ? currentCivState.researchPenaltyMultiplier ?? 0
      : 0;
    const effectiveScience = Math.max(0, Math.floor(totalScience * (1 - researchPenaltyMultiplier)));
    const researchResult = processResearch(civ.techState, effectiveScience);
    newState.civilizations[civId].techState = researchResult.state;
    if (researchResult.completedTech) {
      const techId = researchResult.completedTech;
      bus.emit('tech:completed', { civId, techId });

      if (techId === 'gene-therapy') {
        newState = chargeUnitsOnGeneTherapyResearch(newState, civId);
      }

      // Inline obsolescence scan — runs once synchronously per completed tech
      const obsoletedTypes = TRAINABLE_UNITS
        .filter(u => u.obsoletedByTech === techId)
        .map(u => u.type);

      if (obsoletedTypes.length > 0) {
        for (const [unitId, unit] of Object.entries(newState.units)) {
          if (unit.owner !== civId) continue;
          if (!obsoletedTypes.includes(unit.type)) continue;
          bus.emit('unit:obsolete', { civId, unitId, unitType: unit.type });
        }

        const civEsp = newState.espionage?.[civId];
        if (civEsp) {
          for (const [spyId, spy] of Object.entries(civEsp.spies)) {
            if (!obsoletedTypes.includes(spy.unitType)) continue;
            if (spy.status !== 'embedded' && spy.status !== 'stationed' && spy.status !== 'on_mission') continue;
            const { [spyId]: _removed, ...remainingSpies } = newState.espionage![civId].spies;
            newState.espionage![civId] = { ...newState.espionage![civId], spies: remainingSpies };
            bus.emit('espionage:spy-expired', { civId, spyId, spyName: spy.name, unitType: spy.unitType });
          }
        }
      }
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
    grossGoldByCiv[civId] = (grossGoldByCiv[civId] ?? 0) + totalGold;

    // Update peak counts (read from newState to pick up earlier mutations in this loop)
    if (currentCivState.diplomacy) {
      const cityCount = currentCivState.cities.length;
      const milCount = currentCivState.units
        .map(id => newState.units[id])
        .filter(u => u && u.type !== 'settler' && u.type !== 'worker').length;
      if (cityCount > currentCivState.diplomacy.vassalage.peakCities) {
        newState.civilizations[civId].diplomacy.vassalage.peakCities = cityCount;
      }
      if (milCount > currentCivState.diplomacy.vassalage.peakMilitary) {
        newState.civilizations[civId].diplomacy.vassalage.peakMilitary = milCount;
      }
    }

    // Heal units BEFORE resetting hasMoved/hasActed (healing checks those flags)
    const cityPositionsSet = new Set(
      civ.cities.map(id => newState.cities[id]).filter(Boolean).map(c => `${c!.position.q},${c!.position.r}`),
    );
    const healCompletedTechs = civ.techState.completed;
    const healActiveNPs = getActiveNationalProjectsForCiv(newState, civId);
    for (const unitId of civ.units) {
      const unit = newState.units[unitId];
      if (!unit || unit.health >= 100) continue;
      if (unit.committedToRouteId) continue; // committed caravans do not heal
      const posKey = `${unit.position.q},${unit.position.r}`;
      const tile = newState.map.tiles[posKey];
      const inFriendlyCity = cityPositionsSet.has(posKey) && (tile?.owner === civId);
      const inFriendlyTerritory = !inFriendlyCity && (tile?.owner === civId);
      const withinRangeOfFriendlyCity3 = isWithinRangeOfTelemedicineHub(newState, civId, unit.position, 3);
      const healingBonus = getHealingBonus({
        completedTechs: healCompletedTechs,
        activeNationalProjects: healActiveNPs,
        inFriendlyCity,
        inFriendlyTerritory,
        withinRangeOfFriendlyCity3,
      });
      newState.units[unitId] = healUnit(unit, inFriendlyCity, inFriendlyTerritory, healingBonus);
    }

    // Reset geneTherapyReady cooldown for units that rested a full turn in a friendly city
    newState = applyGeneTherapyRecharge(newState, civId, unitIdsAtTurnStart);

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
        applyAutoExploreOrder(newState, unitId, { bus });
      } else if (unit?.automation?.mode === 'journey') {
        const destination = unit.automation.destination;
        const domain = UNIT_DEFINITIONS[unit.type]?.domain ?? 'land';
        const path = findPath(unit.position, destination, newState.map, domain);
        if (!path || path.length < 2) {
          newState.units[unitId] = { ...unit, automation: undefined };
          bus.emit('unit:journey-blocked', { unitId, position: { ...unit.position } });
        } else {
          const nextStep = path[1];
          executeUnitMove(newState, unitId, nextStep, { actor: 'automation', civId, bus });
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
      updateVisibility(
        newState.civilizations[civId].visibility,
        civUnits,
        newState.map,
        cityPositions,
        unit => getVisionBonus(unit.type, visionCompletedTechs, visionActiveNPs),
      );
      applyReconReveals(newState, civId);
    }
    for (const contact of syncCivilizationContactsFromVisibility(newState, civId)) {
      bus.emit('civilization:first-contact', contact);
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
    refreshLastSeenPresentationsForCiv(newState, civId);

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
    // Simple fashion cycle with seeded rng
    let rngState = newState.turn * 16807;
    const simpleRng = () => {
      rngState = (rngState * 48271) % 2147483647;
      return rngState / 2147483647;
    };
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
  const barbSeed = newState.turn * 31337 + Object.keys(newState.barbarianCamps).length;
  const barbResult = processPurposefulBarbarians(newState);
  newState.opponentAI = barbResult.opponentAI;
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

  // Move barbarian units
  for (const order of barbResult.moveOrders) {
    const unit = newState.units[order.unitId];
    if (unit) {
      executeUnitMove(newState, order.unitId, order.toCoord, { actor: 'world', bus });
    }
  }

  // Barbarian attacks
  for (const attack of barbResult.attackOrders) {
    const attacker = newState.units[attack.attackerUnitId];
    const defender = newState.units[attack.defenderUnitId];
    if (!attacker || !defender) continue;
    const legality = canUnitAttackTarget(newState, attacker, defender.position, { requireVisibility: false });
    if (!legality.ok || legality.targetType !== 'unit' || legality.targetUnitId !== defender.id) continue;
    const combatSeed = deterministicCombatSeed(newState.gameId, newState.turn, attacker.id, defender.id);
    // Capture route IDs before combat (units may be removed from state after)
    const attackerRouteId = attacker.committedToRouteId;
    const defenderRouteId = defender.committedToRouteId;
    const defenderPosBarbarian = { ...defender.position };
    const result = resolveCombat(
      attacker,
      defender,
      newState.map,
      combatSeed,
      buildCombatContextForDefender(newState, attacker, defender),
      newState.era,
    );
    const combatPresentation = buildCombatPresentation(newState, result, attacker, defender);
    const applied = applyCombatOutcomeToState(newState, result, combatSeed);
    newState = applied.state;
    if (newState.civilizations[defender.owner]?.isHuman) {
      newState = recordCombatForCiv(newState, defender.owner, defenderPosBarbarian);
    }
    emitMinorCivQuestTransitions(bus, applied.questTransitions, newState);
    // Clean up trade routes for any committed caravans that died
    if (applied.attackerDefeated && attackerRouteId) {
      newState = removeRouteForUnit(newState, result.attackerId, bus, 'unit-died', attackerRouteId);
    }
    if (applied.defenderDefeated && defenderRouteId) {
      newState = removeRouteForUnit(newState, result.defenderId, bus, 'unit-died', defenderRouteId);
    }
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
      era: newState.era,
      challenge: resolveChallengeForCiv(newState, city.owner),
    });
    newState = applyCitySiegeOutcome(newState, order.cityId, result);
    if (result.outcome === 'blocked') continue;

    // Counter-fire (#522): a walled, ungarrisoned city fights back against the raider
    // that's damaging it. Reuses barbSeed the same way real barbarian combat above does.
    const attackerUnit = newState.units[order.attackerUnitId];
    if (attackerUnit) {
      const attackerStrength = UNIT_DEFINITIONS[attackerUnit.type].strength * (attackerUnit.health / 100);
      const counterFireSeed = barbSeed ^ order.attackerUnitId.charCodeAt(0) ^ 0x5a5a;
      const counterFireDamage = getCityCounterFireDamage(
        city, ownerCiv, 'land', attackerStrength, false, counterFireSeed,
      );
      if (counterFireDamage > 0) {
        const healthAfter = attackerUnit.health - counterFireDamage;
        const attackerDied = healthAfter <= 0;
        if (attackerDied) {
          const units = { ...newState.units };
          delete units[order.attackerUnitId];
          const civilizations = { ...newState.civilizations };
          const raiderOwner = civilizations[attackerUnit.owner];
          if (raiderOwner) {
            civilizations[attackerUnit.owner] = {
              ...raiderOwner,
              units: raiderOwner.units.filter(id => id !== order.attackerUnitId),
            };
          }
          newState = { ...newState, units, civilizations };
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
    const beastSeed = newState.turn * 7919 + 13;
    const beastResult = processBeasts(
      Object.values(newState.beasts!.lairs),
      newState.map,
      intruders,
      beastUnits,
      newState.era,
      newState.beasts!.mode,
      beastSeed,
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
      const defenderPosBeast = { ...defender.position };
      const result = resolveCombat(
        attacker,
        defender,
        newState.map,
        combatSeed,
        buildCombatContextForDefender(newState, attacker, defender),
        newState.era,
      );
      const combatPresentation = buildCombatPresentation(newState, result, attacker, defender);
      const applied = applyCombatOutcomeToState(newState, result, combatSeed);
      newState = applied.state;
      if (newState.civilizations[defender.owner]?.isHuman) {
        newState = recordCombatForCiv(newState, defender.owner, defenderPosBeast);
      }
      emitMinorCivQuestTransitions(bus, applied.questTransitions, newState);
      // If the beast died on counterattack, record the slay
      if (applied.attackerDefeated) {
        const { state: afterSlay, slain } = recordBeastSlain(newState, attacker, defender);
        newState = afterSlay as typeof newState;
        if (slain) bus.emit('beast:slain', slain);
      }
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

  // --- Process espionage ---
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
            newState = {
              ...newState,
              civilizations: {
                ...newState.civilizations,
                [captorId]: {
                  ...cap,
                  techState: {
                    ...cap.techState,
                    researchProgress: (cap.techState.researchProgress ?? 0) + progressGain,
                  },
                },
              },
            };
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
    refreshLastSeenPresentationsForCiv(newState, civId);
  }

  // --- Vassalage protection & independence ---
  for (const [civId, civ] of Object.entries(newState.civilizations)) {
    if (!civ.diplomacy?.vassalage.overlord) continue;

    // Process protection timers
    newState.civilizations[civId].diplomacy = processProtectionTimers(civ.diplomacy);

    // Check auto-breakaway
    const vassalDip = newState.civilizations[civId].diplomacy;
    const overlordId = vassalDip.vassalage.overlord!;
    const overlord = newState.civilizations[overlordId];

    if (!overlord) {
      // Overlord eliminated — free vassal unilaterally
      newState.civilizations[civId].diplomacy = endVassalageUnilateral(vassalDip, civId, overlordId);
      bus.emit('diplomacy:vassalage-ended', { vassalId: civId, overlordId, reason: 'overlord_eliminated' });
      continue;
    }

    if (vassalDip.vassalage.protectionScore <= 20) {
      const { vassalState, overlordState } = endVassalage(vassalDip, overlord.diplomacy, civId, overlordId);
      newState.civilizations[civId].diplomacy = vassalState;
      newState.civilizations[overlordId].diplomacy = overlordState;
      bus.emit('diplomacy:vassalage-ended', { vassalId: civId, overlordId, reason: 'auto_breakaway' });
      continue;
    }

    // Independence petition: check if vassal has grown strong enough
    const vassalCiv = newState.civilizations[civId];
    const vassalMilitary = vassalCiv.units
      .map(id => newState.units[id])
      .filter(u => u && u.type !== 'settler' && u.type !== 'worker').length;
    const overlordMilitary = overlord.units
      .map(id => newState.units[id])
      .filter(u => u && u.type !== 'settler' && u.type !== 'worker').length;
    if (checkIndependenceThreshold(vassalMilitary, overlordMilitary, vassalDip.vassalage.protectionScore)) {
      const overlordDef = resolveCivDefinition(newState, overlord.civType ?? '');
      const accepts = (overlordDef?.personality.diplomacyFocus ?? 0.5) > 0.5;
      const { vassalState, overlordState } = petitionIndependence(
        vassalDip, overlord.diplomacy, civId, overlordId, accepts,
      );
      newState.civilizations[civId].diplomacy = vassalState;
      newState.civilizations[overlordId].diplomacy = overlordState;
      bus.emit('diplomacy:independence-petition', { vassalId: civId, overlordId, accepted: accepts });
      bus.emit('diplomacy:vassalage-ended', { vassalId: civId, overlordId, reason: accepts ? 'independence' : 'war' });
    }
  }

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

    const { state: afterExpiry, expired } = expireNationalProjects(newState, newEra);
    newState = afterExpiry;
    for (const item of expired) {
      bus.emit('city:national-project-expired', item);
    }

    // Dequeue NPs now outside their build window (homeEra to homeEra+1)
    for (const cityId of Object.keys(newState.cities)) {
      const city = newState.cities[cityId];
      if (!city) continue;
      const staleNPs = city.productionQueue.filter((item: string) => {
        const bldg = BUILDINGS[item];
        return bldg?.nationalProject && newState.era > bldg.nationalProject.homeEra + 1;
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
              return !(bldg?.nationalProject && newState.era > bldg.nationalProject.homeEra + 1);
            }),
          },
        },
      };
      for (const buildingId of staleNPs) {
        bus.emit('city:national-project-dequeued', { civId: city.owner, cityId, buildingId });
      }
    }

    bus.emit('era:advanced', { era: newEra });
    for (const mc of Object.values(newState.minorCivs)) {
      processMinorCivEraUpgrade(newState, mc);
    }
  }

  if (newState.beasts) {
    for (const pending of [...(newState.beasts.pendingHoardChoices ?? [])]) {
      if (pending.civId === newState.currentPlayer) continue;
      newState = applyHoardChoice(newState, pending.lairId, pending.civId, 'gold');
    }
    for (const civId of Object.keys(newState.civilizations)) {
      const trophyGold = getClaimedTrophyGoldPerTurn(newState, civId);
      if (trophyGold > 0) grossGoldByCiv[civId] = (grossGoldByCiv[civId] ?? 0) + trophyGold;
    }
  }

  for (const civId of Object.keys(newState.civilizations)) {
    newState = applyEconomyTurn(newState, civId, grossGoldByCiv[civId] ?? 0, pirateEconomyModifiers);
    emitEconomyStrainIfNeeded(previousEconomyStatusByCiv[civId], newState.economyStatusByCiv![civId], bus, civId);
  }

  newState = finalizeOpponentRoundState(newState);

  // --- Advance turn ---
  newState.turn += 1;

  bus.emit('turn:start', { turn: newState.turn, playerId: newState.currentPlayer });

  // --- Domination victory check ---
  if (!newState.gameOver) {
    const victorId = checkDominationVictory(newState);
    if (victorId !== null) {
      newState.gameOver = true;
      newState.winner = victorId;
      newState.gameOverReason = 'domination';
    }
  }

  return newState;
}
