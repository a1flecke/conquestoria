import type { GameState } from './types';
import { EventBus } from './event-bus';
import { resetUnitTurn, createUnit } from '@/systems/unit-system';
import { processCity } from '@/systems/city-system';
import { processResearch } from '@/systems/tech-system';
import { processBarbarians } from '@/systems/barbarian-system';
import { calculateCityYields } from '@/systems/resource-system';
import { updateVisibility } from '@/systems/fog-of-war';

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

      const yields = calculateCityYields(city, newState.map);
      totalScience += yields.science;
      totalGold += yields.gold;

      const result = processCity(city, newState.map, yields.food, yields.production);
      newState.cities[cityId] = result.city;

      if (result.grew) {
        bus.emit('city:grew', { cityId, newPopulation: result.city.population });
      }
      if (result.completedBuilding) {
        bus.emit('city:building-complete', { cityId, buildingId: result.completedBuilding });
      }
      if (result.completedUnit) {
        bus.emit('city:unit-trained', { cityId, unitType: result.completedUnit });
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

    // Update visibility
    const civUnits = civ.units
      .map(id => newState.units[id])
      .filter((u): u is NonNullable<typeof u> => u !== undefined);
    const cityPositions = civ.cities
      .map(id => newState.cities[id]?.position)
      .filter((p): p is NonNullable<typeof p> => p !== undefined);
    updateVisibility(newState.civilizations[civId].visibility, civUnits, newState.map, cityPositions);
  }

  // --- Process barbarians ---
  const playerUnits = Object.values(newState.units).filter(u => u.owner !== 'barbarian');
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

  // --- Advance turn ---
  newState.turn += 1;

  bus.emit('turn:start', { turn: newState.turn, playerId: newState.currentPlayer });

  return newState;
}
