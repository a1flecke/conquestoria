import type { AdvisorType, GameState } from './types';
import { EventBus } from './event-bus';
import { resetUnitTurn, createUnit, healUnit } from '@/systems/unit-system';
import { processCity } from '@/systems/city-system';
import { processResearch } from '@/systems/tech-system';
import { processBarbarians } from '@/systems/barbarian-system';
import { resolveCombat } from '@/systems/combat-system';
import { moveUnit } from '@/systems/unit-system';
import { calculateCityYields } from '@/systems/resource-system';
import type { HexCoord } from './types';
import { updateVisibility, revealMinorCivCities, applySharedVision } from '@/systems/fog-of-war';
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
import { getCivDefinition } from '@/systems/civ-definitions';
import { applyProductionBonus } from '@/systems/city-system';
import { processEspionageTurn } from '@/systems/espionage-system';
import { processFactionTurn, getUnrestYieldMultiplier, isCityProductionLocked } from '@/systems/faction-system';

export function processTurn(state: GameState, bus: EventBus): GameState {
  let newState = structuredClone(state);

  bus.emit('turn:end', { turn: newState.turn, playerId: newState.currentPlayer });

  // Resolve unrest and revolts before city yields so instability impacts the current turn.
  newState = processFactionTurn(newState, bus);

  // --- Process each civilization ---
  for (const [civId, civ] of Object.entries(newState.civilizations)) {
    // Process cities: food, growth, production
    let totalScience = 0;
    let totalGold = 0;

    for (const cityId of civ.cities) {
      const city = newState.cities[cityId];
      if (!city) continue;

      const civDef = getCivDefinition(civ.civType ?? '');
      const baseYields = calculateCityYields(city, newState.map, civDef?.bonusEffect);
      const unrestMultiplier = getUnrestYieldMultiplier(city);
      const yields = {
        food: Math.floor(baseYields.food * unrestMultiplier),
        production: Math.floor(baseYields.production * unrestMultiplier),
        gold: Math.floor(baseYields.gold * unrestMultiplier),
        science: Math.floor(baseYields.science * unrestMultiplier),
      };
      totalScience += yields.science;
      totalGold += yields.gold;
      const effectiveProduction = isCityProductionLocked(city) ? 0 : yields.production;
      const result = processCity(city, newState.map, yields.food, effectiveProduction, civDef?.bonusEffect);
      newState.cities[cityId] = result.city;

      if (result.grew) {
        bus.emit('city:grew', { cityId, newPopulation: result.city.population });
      }
      if (result.completedBuilding) {
        bus.emit('city:building-complete', { cityId, buildingId: result.completedBuilding });
      }
      if (result.completedUnit) {
        bus.emit('city:unit-trained', { cityId, unitType: result.completedUnit });
        const newUnit = createUnit(result.completedUnit, civId, city.position, civDef?.bonusEffect);
        newState.units[newUnit.id] = newUnit;
        newState.civilizations[civId].units.push(newUnit.id);
      }
    }

    // Process research
    const researchResult = processResearch(civ.techState, totalScience);
    newState.civilizations[civId].techState = researchResult.state;
    if (researchResult.completedTech) {
      bus.emit('tech:completed', { civId, techId: researchResult.completedTech });
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
    const currentCivState = newState.civilizations[civId];
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
  }

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
      const overlordDef = getCivDefinition(overlord.civType ?? '');
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
