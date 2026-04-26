import type { AdvisorType, GameState } from './types';
import { EventBus } from './event-bus';
import { resetUnitTurn, createUnit, healUnit, moveUnit } from '@/systems/unit-system';
import { processCity, TRAINABLE_UNITS } from '@/systems/city-system';
import { applyCityMaturity } from '@/systems/city-maturity-system';
import { assignCityFocus, normalizeWorkedTilesForCity } from '@/systems/city-work-system';
import { processResearch, getTechById } from '@/systems/tech-system';
import { processBarbarians } from '@/systems/barbarian-system';
import { resolveCombat } from '@/systems/combat-system';
import { applyAutoExploreOrder } from '@/systems/auto-explore-system';
import { calculateCityYields } from '@/systems/resource-system';
import type { HexCoord } from './types';
import { updateVisibility, revealMinorCivCities, applySharedVision, applySatelliteSurveillance } from '@/systems/fog-of-war';
import { syncCivilizationContactsFromVisibility } from '@/systems/discovery-system';
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
  enforceEmbargoes,
  joinEmbargo,
  cleanupEmbargoes,
  checkLeagueDissolution,
  triggerLeagueDefense,
  getLeagueForCiv,
} from '@/systems/diplomacy-system';
import { processTradeRouteIncome, processFashionCycle, updatePrices } from '@/systems/trade-system';
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
  getLegendaryWonderCityYieldBonus,
  getLegendaryWonderCivYieldBonus,
  initializeLegendaryWonderProjectsForAllCities,
  tickLegendaryWonderProjects,
} from '@/systems/legendary-wonder-system';

export function processTurn(state: GameState, bus: EventBus): GameState {
  let newState = initializeLegendaryWonderProjectsForAllCities(structuredClone(state));

  bus.emit('turn:end', { turn: newState.turn, playerId: newState.currentPlayer });

  // Resolve unrest and revolts before city yields so instability impacts the current turn.
  newState = processFactionTurn(newState, bus);
  newState = processBreakawayTurn(newState, bus);
  newState = tickOccupiedCities(newState);

  // --- Process each civilization ---
  for (const [civId, civ] of Object.entries(newState.civilizations)) {
    const currentCivState = newState.civilizations[civId];
    const civDef = resolveCivDefinition(newState, civ.civType ?? '');
    // Process cities: food, growth, production
    let totalScience = 0;
    let totalGold = 0;

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
        food: Math.floor((baseYields.food + (wonderCityBonuses.food ?? 0)) * unrestMultiplier),
        production: Math.floor((baseYields.production + (wonderCityBonuses.production ?? 0)) * unrestMultiplier),
        gold: Math.floor((baseYields.gold + (wonderCityBonuses.gold ?? 0)) * unrestMultiplier),
        science: Math.floor((baseYields.science + (wonderCityBonuses.science ?? 0)) * unrestMultiplier),
      };
      totalScience += yields.science;
      totalGold += yields.gold;
      const effectiveProduction = isCityProductionLocked(city) ? 0 : yields.production;
      const result = processCity(city, newState.map, yields.food, effectiveProduction, civDef?.bonusEffect, civ.techState.completed, civ.civType);
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
      if (result.completedUnit) {
        bus.emit('city:unit-trained', { cityId, unitType: result.completedUnit });
        const newUnit = createUnit(result.completedUnit, civId, city.position, civDef?.bonusEffect);
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

    // Update gold
    newState.civilizations[civId].gold += totalGold;

    // Vassalage tribute (25% of gold income flows to overlord)
    if (civ.diplomacy?.vassalage.overlord) {
      const tribute = processVassalageTribute(totalGold);
      newState.civilizations[civId].gold -= tribute.tributeAmount;
      const overlordId = civ.diplomacy.vassalage.overlord;
      if (newState.civilizations[overlordId]) {
        newState.civilizations[overlordId].gold += tribute.tributeAmount;
      }
    }

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
        newState.units[unitId] = resetUnitTurn(unit);
      }
    }

    for (const unitId of civ.units) {
      const unit = newState.units[unitId];
      if (unit?.automation?.mode === 'auto-explore') {
        applyAutoExploreOrder(newState, unitId, { bus });
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
          newState.civilizations[civId].gold += treaty.goldPerTurn;
        }
      }

      newState.civilizations[civId].diplomacy = dipState;
    }

    // Update visibility
    updateVisibility(newState.civilizations[civId].visibility, civUnits, newState.map, cityPositions);
    syncCivilizationContactsFromVisibility(newState, civId);

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
    revealMinorCivCities(civ.visibility, mcCityPositions);

    // Shared vision for friendly minor civs
    for (const mc of Object.values(newState.minorCivs)) {
      if (mc.isDestroyed) continue;
      const rel = mc.diplomacy.relationships[civId] ?? 0;
      if (rel >= 30) {
        const mcPositions = [
          newState.cities[mc.cityId]?.position,
          ...mc.units.map(uid => newState.units[uid]?.position),
        ].filter(Boolean) as HexCoord[];
        applySharedVision(civ.visibility, mcPositions, newState.map);
      }
    }

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

  newState = tickLegendaryWonderProjects(newState, bus);

  // --- Process marketplace ---
  if (newState.marketplace) {
    // Trade route income for each civ
    for (const [civId, civ] of Object.entries(newState.civilizations)) {
      const civRouteIncome = processTradeRouteIncome(
        newState.marketplace.tradeRoutes.filter(r => {
          const city = newState.cities[r.fromCityId];
          return city?.owner === civId;
        }),
      );
      newState.civilizations[civId].gold += civRouteIncome;
    }

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
  const playerUnits = Object.values(newState.units).filter(u => u.owner !== 'barbarian' && !u.owner.startsWith('mc-'));
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
    const raider = createUnit('warrior', 'barbarian', spawn.position);
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
    const combatSeed = barbSeed ^ attack.attackerUnitId.charCodeAt(0);
    const result = resolveCombat(attacker, defender, newState.map, combatSeed, undefined, newState.era);
    bus.emit('combat:resolved', { result });
    if (!result.attackerSurvived) {
      delete newState.units[attacker.id];
    } else {
      newState.units[attacker.id] = { ...attacker, health: attacker.health - result.attackerDamage, movementPointsLeft: 0 };
    }
    if (!result.defenderSurvived) {
      delete newState.units[defender.id];
      // Remove from owning civ's unit list
      for (const civ of Object.values(newState.civilizations)) {
        civ.units = civ.units.filter(id => id !== defender.id);
      }
    } else {
      newState.units[defender.id] = { ...defender, health: defender.health - result.defenderDamage };
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

  // --- Enforce embargoes ---
  if (newState.embargoes && newState.marketplace) {
    const cityOwners: Record<string, string> = {};
    for (const [cityId, city] of Object.entries(newState.cities)) {
      cityOwners[cityId] = city.owner;
    }
    newState.marketplace.tradeRoutes = enforceEmbargoes(
      newState.embargoes, newState.marketplace.tradeRoutes, cityOwners,
    );
    newState.embargoes = cleanupEmbargoes(newState.embargoes);
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
    for (const mc of Object.values(newState.minorCivs)) {
      processMinorCivEraUpgrade(newState, mc);
    }
  }

  // --- Advance turn ---
  newState.turn += 1;

  bus.emit('turn:start', { turn: newState.turn, playerId: newState.currentPlayer });

  return newState;
}
