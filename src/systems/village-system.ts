import type { GameMap, HexCoord, GameState, Unit, TribalVillage, VillageOutcomeType } from '@/core/types';
import { hexKey, hexDistance, hexNeighbors } from './hex-utils';
import { createUnit } from './unit-system';
import { TECH_TREE, applyResearchBonus } from './tech-system';
import { createRng } from './map-generator';

const VILLAGE_COUNTS = { small: 8, medium: 12, large: 20 } as const;

const IMPASSABLE_TERRAIN = new Set(['ocean', 'coast', 'mountain']);

export function placeVillages(
  map: GameMap,
  startPositions: HexCoord[],
  mapSize: 'small' | 'medium' | 'large',
  seed: string,
): Record<string, TribalVillage> {
  const rng = createRng(seed + '-villages');
  const targetCount = VILLAGE_COUNTS[mapSize];
  const villages: Record<string, TribalVillage> = {};
  const placedPositions: HexCoord[] = [];

  // Collect passable land tiles
  const candidates: HexCoord[] = [];
  for (const tile of Object.values(map.tiles)) {
    if (IMPASSABLE_TERRAIN.has(tile.terrain)) continue;
    if (tile.wonder !== null) continue;
    candidates.push(tile.coord);
  }

  // Shuffle candidates
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }

  for (const coord of candidates) {
    if (placedPositions.length >= targetCount) break;

    // Distance from starts
    if (!startPositions.every(sp => hexDistance(coord, sp) >= 4)) continue;

    // Distance from other villages
    if (!placedPositions.every(vp => hexDistance(coord, vp) >= 3)) continue;

    const id = `village-${placedPositions.length}`;
    villages[id] = { id, position: coord };
    placedPositions.push(coord);
  }

  return villages;
}

export function rollVillageOutcome(roll: number): VillageOutcomeType {
  if (roll < 0.25) return 'gold';
  if (roll < 0.45) return 'food';
  if (roll < 0.60) return 'science';
  if (roll < 0.75) return 'free_unit';
  if (roll < 0.85) return 'free_tech';
  if (roll < 0.95) return 'ambush';
  return 'illness';
}

export function visitVillage(
  state: GameState,
  villageId: string,
  unit: Unit,
  rng: () => number,
): { outcome: VillageOutcomeType; message: string } {
  const village = state.tribalVillages[villageId];
  if (!village) return { outcome: 'gold', message: '' };

  // Remove village
  delete state.tribalVillages[villageId];

  const outcome = rollVillageOutcome(rng());
  const civ = state.civilizations[unit.owner];
  const rewardMultiplier = civ?.civType === 'spain' ? 1.25 : 1;
  let message = '';

  switch (outcome) {
    case 'gold': {
      const amount = Math.round((25 + Math.floor(rng() * 26)) * rewardMultiplier); // 25-50
      if (civ) civ.gold += amount;
      message = `The villagers share their wealth! +${amount} gold.`;
      break;
    }
    case 'food': {
      const amount = Math.round((15 + Math.floor(rng() * 16)) * rewardMultiplier); // 15-30
      const citiesOwned = civ?.cities ?? [];
      let nearestCity = citiesOwned.length > 0 ? state.cities[citiesOwned[0]] : null;
      let nearestDist = Infinity;
      for (const cityId of citiesOwned) {
        const city = state.cities[cityId];
        if (city) {
          const d = hexDistance(village.position, city.position);
          if (d < nearestDist) {
            nearestDist = d;
            nearestCity = city;
          }
        }
      }
      if (nearestCity) {
        nearestCity.food += amount;
        message = `The villagers share food with ${nearestCity.name}! +${amount} food.`;
      } else {
        // Fallback: gold
        const goldAmount = Math.round((25 + Math.floor(rng() * 26)) * rewardMultiplier);
        if (civ) civ.gold += goldAmount;
        message = `The villagers share their wealth! +${goldAmount} gold.`;
      }
      break;
    }
    case 'science': {
      const amount = Math.round((10 + Math.floor(rng() * 16)) * rewardMultiplier); // 10-25
      if (civ?.techState.currentResearch) {
        const bonusResult = applyResearchBonus(civ.techState, amount);
        civ.techState = bonusResult.state;
        message = `The villagers share ancient knowledge! +${amount} research.`;
      } else {
        // Fallback: gold
        const fallbackGold = Math.round(25 * rewardMultiplier);
        if (civ) civ.gold += fallbackGold;
        message = `The villagers share their wealth! +${fallbackGold} gold.`;
      }
      break;
    }
    case 'free_unit': {
      const unitType: 'scout' | 'warrior' = rng() < 0.5 ? 'scout' : 'warrior';
      const newUnit = createUnit(unitType, unit.owner, village.position);
      state.units[newUnit.id] = newUnit;
      if (civ) civ.units.push(newUnit.id);
      message = `A ${unitType} joins your cause!`;
      break;
    }
    case 'free_tech': {
      if (!civ) break;
      const availableTechs = TECH_TREE.filter(t =>
        !civ.techState.completed.includes(t.id) &&
        t.prerequisites.every(p => civ.techState.completed.includes(p)),
      );
      if (availableTechs.length > 0) {
        const tech = availableTechs[Math.floor(rng() * availableTechs.length)];
        civ.techState.completed.push(tech.id);
        if (civ.techState.currentResearch === tech.id) {
          civ.techState.currentResearch = null;
          civ.techState.researchProgress = 0;
        }
        message = `The villagers taught us ${tech.name}!`;
      } else {
        // Fallback: gold
        const fallbackGold = Math.round(50 * rewardMultiplier);
        civ.gold += fallbackGold;
        message = `The villagers share their wealth! +${fallbackGold} gold.`;
      }
      break;
    }
    case 'ambush': {
      const neighbors = hexNeighbors(village.position);
      const passable = neighbors.filter(n => {
        const t = state.map.tiles[hexKey(n)];
        return t && !IMPASSABLE_TERRAIN.has(t.terrain);
      });
      const spawnCount = Math.min(1 + Math.floor(rng() * 2), passable.length); // 1-2
      for (let i = 0; i < spawnCount; i++) {
        const barbarian = createUnit('warrior', 'barbarian', passable[i]);
        state.units[barbarian.id] = barbarian;
      }
      message = spawnCount > 0
        ? 'It was a trap! Barbarian warriors ambush you!'
        : 'The village was abandoned... an eerie silence lingers.';
      break;
    }
    case 'illness': {
      const damage = 20 + Math.floor(rng() * 21); // 20-40
      unit.health = Math.max(1, unit.health - damage);
      message = `Your unit contracts an illness! -${damage} HP.`;
      break;
    }
  }

  return { outcome, message };
}
