import type { GameState } from './types';
import { EventBus } from './event-bus';
import { resetUnitTurn, createUnit } from '@/systems/unit-system';
import { processCity } from '@/systems/city-system';
import { processResearch } from '@/systems/tech-system';
import { processBarbarians } from '@/systems/barbarian-system';
import { calculateCityYields } from '@/systems/resource-system';
import type { HexCoord } from './types';
import { updateVisibility, revealMinorCivCities, applySharedVision } from '@/systems/fog-of-war';
import { processRelationshipDrift, decayEvents, tickTreaties } from '@/systems/diplomacy-system';
import { processTradeRouteIncome, processFashionCycle, updatePrices } from '@/systems/trade-system';
import { processWonderEffects } from '@/systems/wonder-system';
import { processMinorCivTurn, checkEraAdvancement, processMinorCivEraUpgrade, checkCampEvolution } from '@/systems/minor-civ-system';
import { getCivDefinition } from '@/systems/civ-definitions';
import { applyProductionBonus } from '@/systems/city-system';
import { processEspionageTurn } from '@/systems/espionage-system';

export function processTurn(state: GameState, bus: EventBus): GameState {
  let newState = structuredClone(state);

  bus.emit('turn:end', { turn: newState.turn, playerId: newState.currentPlayer });

  // --- Process each civilization ---
  for (const [civId, civ] of Object.entries(newState.civilizations)) {
    // Process cities: food, growth, production
    let totalScience = 0;
    let totalGold = 0;

    for (const cityId of civ.cities) {
      const city = newState.cities[cityId];
      if (!city) continue;

      const civDef = getCivDefinition(civ.civType ?? '');
      const yields = calculateCityYields(city, newState.map, civDef?.bonusEffect);
      totalScience += yields.science;
      totalGold += yields.gold;
      const result = processCity(city, newState.map, yields.food, yields.production, civDef?.bonusEffect);
      newState.cities[cityId] = result.city;

      if (result.grew) {
        bus.emit('city:grew', { cityId, newPopulation: result.city.population });
      }
      if (result.completedBuilding) {
        bus.emit('city:building-complete', { cityId, buildingId: result.completedBuilding });
      }
      if (result.completedUnit) {
        bus.emit('city:unit-trained', { cityId, unitType: result.completedUnit });
        const newUnit = createUnit(result.completedUnit, civId, city.position);
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
    newState.marketplace = updatePrices(newState.marketplace, {}, {});
  }

  // --- Process wonder effects (after city processing) ---
  const eruptions = processWonderEffects(newState);
  for (const eruption of eruptions) {
    bus.emit('wonder:eruption', {
      wonderId: eruption.wonderId,
      position: eruption.position,
      tilesAffected: eruption.tilesAffected,
    });
  }

  // --- Process barbarians ---
  const playerUnits = Object.values(newState.units).filter(u => u.owner !== 'barbarian' && !u.owner.startsWith('mc-'));
  const barbResult = processBarbarians(
    Object.values(newState.barbarianCamps),
    newState.map,
    playerUnits,
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
