import type { GameState, Unit, HexCoord } from '@/core/types';
import { EventBus } from '@/core/event-bus';
import { hexKey, hexNeighbors } from '@/systems/hex-utils';
import { foundCity } from '@/systems/city-system';
import { getMovementRange, moveUnit } from '@/systems/unit-system';
import { resolveCombat } from '@/systems/combat-system';
import { getAvailableTechs, startResearch } from '@/systems/tech-system';
import { updateVisibility } from '@/systems/fog-of-war';

export function processAITurn(state: GameState, civId: string, bus: EventBus): GameState {
  let newState = structuredClone(state);
  const civ = newState.civilizations[civId];
  if (!civ) return newState;

  // --- Handle settlers: found cities ---
  const settlers = civ.units
    .map(id => newState.units[id])
    .filter((u): u is Unit => u !== undefined && u.type === 'settler');

  for (const settler of settlers) {
    // Found city at current position
    const tile = newState.map.tiles[hexKey(settler.position)];
    if (tile && tile.terrain !== 'ocean' && tile.terrain !== 'mountain' && tile.terrain !== 'coast') {
      const city = foundCity(civId, settler.position, newState.map);
      newState.cities[city.id] = city;
      civ.cities.push(city.id);

      // Mark tiles as owned
      for (const ownedCoord of city.ownedTiles) {
        const key = hexKey(ownedCoord);
        if (newState.map.tiles[key]) {
          newState.map.tiles[key].owner = civId;
        }
      }

      // Remove settler
      delete newState.units[settler.id];
      civ.units = civ.units.filter(id => id !== settler.id);

      bus.emit('city:founded', { city });

      // Start building a warrior
      city.productionQueue = ['warrior'];
    }
  }

  // --- Handle military units: explore or attack ---
  const militaryUnits = civ.units
    .map(id => newState.units[id])
    .filter((u): u is Unit => u !== undefined && u.type !== 'settler' && u.type !== 'worker');

  const unitPositions: Record<string, string> = {};
  for (const [id, unit] of Object.entries(newState.units)) {
    unitPositions[hexKey(unit.position)] = id;
  }

  for (const unit of militaryUnits) {
    if (unit.movementPointsLeft <= 0) continue;

    // Check for nearby enemies to attack
    const neighbors = hexNeighbors(unit.position);
    let attacked = false;
    for (const neighbor of neighbors) {
      const occupantId = unitPositions[hexKey(neighbor)];
      if (occupantId) {
        const occupant = newState.units[occupantId];
        if (occupant && occupant.owner !== civId && occupant.owner !== 'barbarian') {
          // Attack!
          const result = resolveCombat(unit, occupant, newState.map);
          if (!result.attackerSurvived) {
            delete newState.units[unit.id];
            civ.units = civ.units.filter(id => id !== unit.id);
          } else {
            newState.units[unit.id].health -= result.attackerDamage;
          }
          if (!result.defenderSurvived) {
            const defCivId = occupant.owner;
            delete newState.units[occupant.id];
            if (newState.civilizations[defCivId]) {
              newState.civilizations[defCivId].units =
                newState.civilizations[defCivId].units.filter(id => id !== occupant.id);
            }
          } else {
            newState.units[occupant.id].health -= result.defenderDamage;
          }
          bus.emit('combat:resolved', { result });
          attacked = true;
          break;
        }
      }
    }

    if (attacked) continue;

    // Explore: move toward unexplored territory
    const range = getMovementRange(unit, newState.map, unitPositions);
    if (range.length > 0) {
      const target = range[Math.floor(Math.random() * range.length)];
      newState.units[unit.id] = moveUnit(unit, target, 1);
      // Update unit positions
      delete unitPositions[hexKey(unit.position)];
      unitPositions[hexKey(target)] = unit.id;
    }
  }

  // --- Handle research ---
  if (!civ.techState.currentResearch) {
    const available = getAvailableTechs(civ.techState);
    if (available.length > 0) {
      const chosen = available[Math.floor(Math.random() * available.length)];
      newState.civilizations[civId].techState = startResearch(civ.techState, chosen.id);
      bus.emit('tech:started', { civId, techId: chosen.id });
    }
  }

  // --- Handle city production ---
  for (const cityId of civ.cities) {
    const city = newState.cities[cityId];
    if (city && city.productionQueue.length === 0) {
      city.productionQueue = ['warrior'];
    }
  }

  // Update AI visibility
  const civUnits = civ.units
    .map(id => newState.units[id])
    .filter((u): u is Unit => u !== undefined);
  const cityPositions = civ.cities
    .map(id => newState.cities[id]?.position)
    .filter((p): p is HexCoord => p !== undefined);
  updateVisibility(newState.civilizations[civId].visibility, civUnits, newState.map, cityPositions);

  return newState;
}
