import type { AdvisorType, GameState } from './types';
import { EventBus } from './event-bus';
import { checkDominationVictory } from '@/systems/victory-system';
import { resetUnitTurn, createUnit, healUnit, moveUnit, findPath, UNIT_DEFINITIONS } from '@/systems/unit-system';
import { processCity, TRAINABLE_UNITS } from '@/systems/city-system';
import { getCivAvailableResources } from '@/systems/resource-acquisition-system';
import { applyCityMaturity } from '@/systems/city-maturity-system';
import { assignCityFocus, normalizeWorkedTilesForCity } from '@/systems/city-work-system';
import { processResearch, getTechById } from '@/systems/tech-system';
import { processBarbarians } from '@/systems/barbarian-system';
import {
  processBeasts, recordBeastSlain, BEAST_OWNER,
  LAIR_GROWTH_INTERVAL_TURNS, LAIR_GROWTH_CAP, LAIR_GROWTH_EXPERIENCE,
  applyHoardChoice, getClaimedTrophyGoldPerTurn,
} from '@/systems/beast-system';
import { BEAST_DEFINITIONS } from '@/systems/beast-definitions';
import { resolveCombat } from '@/systems/combat-system';
import { canUnitAttackTarget } from '@/systems/attack-targeting';
import { applyCombatOutcomeToState } from '@/systems/combat-reward-system';
import { emitMinorCivQuestTransitions } from '@/systems/quest-chain-system';
import { applyAutoExploreOrder } from '@/systems/auto-explore-system';
import { hexKey } from '@/systems/hex-utils';
import { executeUnitMove } from '@/systems/unit-movement-system';
import { calculateCityYields } from '@/systems/resource-system';
import { getCivResourceYieldBonus } from '@/systems/resource-acquisition-system';
import type { HexCoord } from './types';
import { updateVisibility, revealMinorCivCities, applySharedVision, applySatelliteSurveillance } from '@/systems/fog-of-war';
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
  decayTreachery,
  joinEmbargo,
  cleanupEmbargoes,
  checkLeagueDissolution,
  triggerLeagueDefense,
  getLeagueForCiv,
} from '@/systems/diplomacy-system';
import { processTradeRouteIncome, processFashionCycle, updatePrices, removeRouteForUnit, scrubStaleForeignRoutes, scrubEmbargoedRoutes } from '@/systems/trade-system';
import { advanceRouteRunners } from '@/systems/unit-movement-system';
import { processWonderEffects } from '@/systems/wonder-system';
import { createRng } from '@/systems/map-generator';
import { processMinorCivTurn, checkEraAdvancement, processMinorCivEraUpgrade, checkCampEvolution } from '@/systems/minor-civ-system';
import { resolveCivDefinition } from '@/systems/civ-registry';
import { applyProductionBonus } from '@/systems/city-system';
import { processEspionageTurn, isSpyUnitType, createSpyFromUnit, processInterrogation, applyBuildingCI } from '@/systems/espionage-system';
import { processDetection } from '@/systems/detection-system';
import { processFactionTurn, getUnrestYieldMultiplier, isCityProductionLocked } from '@/systems/faction-system';
import { getOccupiedCityYieldMultiplier, tickOccupiedCities } from '@/systems/city-occupation-system';
import { processBreakawayTurn } from '@/systems/breakaway-system';
import {
  applyTerritoryFrontierProgressWithEvents,
  buildTerritoryTileFlippedEvents,
  recalculateTerritory,
} from '@/systems/city-territory-system';
import {
  getLegendaryWonderCityYieldBonus,
  getLegendaryWonderCivYieldBonus,
  initializeLegendaryWonderProjectsForAllCities,
  tickLegendaryWonderProjects,
} from '@/systems/legendary-wonder-system';
import { applyEconomyTurn, emitEconomyStrainIfNeeded } from '@/systems/economy-system';

export function processTurn(state: GameState, bus: EventBus): GameState {
  let newState = initializeLegendaryWonderProjectsForAllCities(structuredClone(state));

  bus.emit('turn:end', { turn: newState.turn, playerId: newState.currentPlayer });

  // Resolve unrest and revolts before city yields so instability impacts the current turn.
  newState = processFactionTurn(newState, bus);
  newState = processBreakawayTurn(newState, bus);
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

  // --- Process each civilization ---
  for (const [civId, civ] of Object.entries(newState.civilizations)) {
    const currentCivState = newState.civilizations[civId];
    const civDef = resolveCivDefinition(newState, civ.civType ?? '');
    // Process cities: food, growth, production
    let totalScience = 0;
    let totalGold = 0;

    const resourceYieldBonus = getCivResourceYieldBonus(newState, civId);

    for (const cityId of civ.cities) {
      let city = newState.cities[cityId];
      if (!city) continue;

      const preYieldWorkResult = city.focus === 'custom'
        ? normalizeWorkedTilesForCity(newState, cityId)
        : assignCityFocus(newState, cityId, city.focus);
      newState = preYieldWorkResult.state;
      city = newState.cities[cityId];
      if (!city) continue;

      const baseYields = calculateCityYields(city, newState.map, civDef?.bonusEffect);
      const wonderCityBonuses = getLegendaryWonderCityYieldBonus(newState, civId, cityId);
      const unrestMultiplier = Math.min(getUnrestYieldMultiplier(city), getOccupiedCityYieldMultiplier(city));
      const yields = {
        food:       Math.floor((baseYields.food       + (wonderCityBonuses.food       ?? 0) + resourceYieldBonus.food)       * unrestMultiplier),
        production: Math.floor((baseYields.production + (wonderCityBonuses.production ?? 0) + resourceYieldBonus.production) * unrestMultiplier),
        gold:       Math.floor((baseYields.gold       + (wonderCityBonuses.gold       ?? 0) + resourceYieldBonus.gold)       * unrestMultiplier),
        science:    Math.floor((baseYields.science    + (wonderCityBonuses.science    ?? 0))                                 * unrestMultiplier),
      };
      totalScience += yields.science;
      totalGold += yields.gold;
      const effectiveProduction = isCityProductionLocked(city) ? 0 : yields.production;
      const availableResources = getCivAvailableResources(newState, civId);
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
      );
      totalGold += result.idleGoldBonus;
      totalScience += result.idleScienceBonus;
      const maturityResult = applyCityMaturity(result.city, civ.techState.completed);
      newState.cities[cityId] = maturityResult.city;
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
      }
      if (result.droppedBuilding) {
        bus.emit('city:building-dropped', { cityId, buildingId: result.droppedBuilding });
      }
      if (result.droppedUnit) {
        bus.emit('notification:show', {
          message: `${city.name} needs a coast to build ${result.droppedUnit}.`,
          type: 'warning',
        });
      }
      if (result.completedUnit) {
        bus.emit('city:unit-trained', { cityId, unitType: result.completedUnit });
        const newUnit = createUnit(result.completedUnit, civId, city.position, newState.idCounters, civDef?.bonusEffect);
        newState.units[newUnit.id] = newUnit;
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

    // Process research
    const wonderCivBonuses = getLegendaryWonderCivYieldBonus(newState, civId);
    totalScience += wonderCivBonuses.science ?? 0;
    totalGold += wonderCivBonuses.gold ?? 0;
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
    for (const unitId of civ.units) {
      const unit = newState.units[unitId];
      if (!unit || unit.health >= 100) continue;
      if (unit.committedToRouteId) continue; // committed caravans do not heal
      const posKey = `${unit.position.q},${unit.position.r}`;
      const tile = newState.map.tiles[posKey];
      const inFriendlyCity = cityPositionsSet.has(posKey) && (tile?.owner === civId);
      const inFriendlyTerritory = !inFriendlyCity && (tile?.owner === civId);
      newState.units[unitId] = healUnit(unit, inFriendlyCity, inFriendlyTerritory);
    }

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
    updateVisibility(newState.civilizations[civId].visibility, civUnits, newState.map, cityPositions);
    for (const contact of syncCivilizationContactsFromVisibility(newState, civId)) {
      bus.emit('civilization:first-contact', contact);
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
  const playerUnits = Object.values(newState.units).filter(u => u.owner !== 'barbarian' && u.owner !== BEAST_OWNER && !u.owner.startsWith('mc-'));
  const barbarianUnits = Object.values(newState.units).filter(u => u.owner === 'barbarian');
  const barbSeed = newState.turn * 31337 + Object.keys(newState.barbarianCamps).length;
  const barbResult = processBarbarians(
    Object.values(newState.barbarianCamps),
    newState.map,
    playerUnits,
    barbSeed,
    barbarianUnits,
  );
  newState.barbarianCamps = {};
  for (const camp of barbResult.updatedCamps) {
    newState.barbarianCamps[camp.id] = camp;
  }

  // Spawn barbarian raiders
  for (const spawn of barbResult.spawnedUnits) {
    const raider = createUnit('warrior', 'barbarian', spawn.position, newState.idCounters);
    newState.units[raider.id] = raider;
    bus.emit('barbarian:spawned', { campId: spawn.campId, unitId: raider.id });
  }

  // Move barbarian units
  for (const order of barbResult.moveOrders) {
    const unit = newState.units[order.unitId];
    if (unit) {
      const tile = newState.map.tiles[`${order.toCoord.q},${order.toCoord.r}`];
      const cost = tile?.terrain === 'hills' || tile?.terrain === 'forest' ? 2 : 1;
      newState.units[order.unitId] = moveUnit(unit, order.toCoord, cost);
    }
  }

  // Barbarian attacks
  for (const attack of barbResult.attackOrders) {
    const attacker = newState.units[attack.attackerUnitId];
    const defender = newState.units[attack.defenderUnitId];
    if (!attacker || !defender) continue;
    const legality = canUnitAttackTarget(newState, attacker, defender.position, { requireVisibility: false });
    if (!legality.ok || legality.targetType !== 'unit' || legality.targetUnitId !== defender.id) continue;
    const combatSeed = barbSeed ^ attack.attackerUnitId.charCodeAt(0);
    // Capture route IDs before combat (units may be removed from state after)
    const attackerRouteId = attacker.committedToRouteId;
    const defenderRouteId = defender.committedToRouteId;
    const result = resolveCombat(attacker, defender, newState.map, combatSeed, undefined, newState.era);
    const applied = applyCombatOutcomeToState(newState, result, combatSeed);
    newState = applied.state;
    emitMinorCivQuestTransitions(bus, applied.questTransitions, newState);
    // Clean up trade routes for any committed caravans that died
    if (applied.attackerDefeated && attackerRouteId) {
      newState = removeRouteForUnit(newState, result.attackerId, bus, 'unit-died', attackerRouteId);
    }
    if (applied.defenderDefeated && defenderRouteId) {
      newState = removeRouteForUnit(newState, result.defenderId, bus, 'unit-died', defenderRouteId);
    }
    bus.emit('combat:resolved', { result });
    for (const reward of applied.rewards) {
      bus.emit('combat:reward-earned', { reward });
    }
  }

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
    for (const [unitId, unit] of Object.entries(newState.units)) {
      if (unit.owner === BEAST_OWNER) {
        newState.units[unitId] = { ...unit, movementPointsLeft: UNIT_DEFINITIONS[unit.type].movementPoints, hasMoved: false };
      }
    }
    const beastUnits = Object.values(newState.units).filter(u => u.owner === BEAST_OWNER);
    const intruders = Object.values(newState.units).filter(u => u.owner !== BEAST_OWNER && u.owner !== 'barbarian');
    const beastSeed = newState.turn * 7919 + 13;
    const beastResult = processBeasts(
      Object.values(newState.beasts.lairs),
      newState.map,
      intruders,
      beastUnits,
      newState.era,
      newState.beasts.mode,
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
      const combatSeed = beastSeed ^ order.attackerUnitId.charCodeAt(0);
      const result = resolveCombat(attacker, defender, newState.map, combatSeed, undefined, newState.era);
      const applied = applyCombatOutcomeToState(newState, result, combatSeed);
      newState = applied.state;
      emitMinorCivQuestTransitions(bus, applied.questTransitions, newState);
      // If the beast died on counterattack, record the slay
      if (applied.attackerDefeated) {
        const { state: afterSlay, slain } = recordBeastSlain(newState, attacker, defender);
        newState = afterSlay as typeof newState;
        if (slain) bus.emit('beast:slain', slain);
      }
      // If the intruder died, no hoard — the beast attacked, not the player
      bus.emit('combat:resolved', { result });
      for (const reward of applied.rewards) {
        bus.emit('combat:reward-earned', { reward });
      }
    }
  }

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
          const techCost = currentTechId ? (getTechById(currentTechId)?.cost ?? 0) : 0;
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

  if (newState.marketplace) {
    for (const civId of Object.keys(newState.civilizations)) {
      const civRouteIncome = processTradeRouteIncome(
        newState.marketplace.tradeRoutes.filter(route => {
          const city = newState.cities[route.fromCityId];
          return city?.owner === civId;
        }),
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
    newState = applyEconomyTurn(newState, civId, grossGoldByCiv[civId] ?? 0);
    emitEconomyStrainIfNeeded(previousEconomyStatusByCiv[civId], newState.economyStatusByCiv![civId], bus, civId);
  }

  // --- Advance turn ---
  newState.turn += 1;

  bus.emit('turn:start', { turn: newState.turn, playerId: newState.currentPlayer });

  // --- Domination victory check ---
  if (!newState.gameOver) {
    const victorId = checkDominationVictory(newState);
    if (victorId !== null) {
      newState.gameOver = true;
      newState.winner = victorId;
    }
  }

  return newState;
}
