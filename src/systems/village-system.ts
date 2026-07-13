import type { GameMap, HexCoord, GameState, TechState, Unit, TribalVillage, VillageOutcomeType } from '@/core/types';
import { hexKey, mapDistance, mapNeighbors } from './hex-utils';
import { createUnit } from './unit-system';
import { TECH_TREE, applyResearchBonus, getEffectiveTechCost } from './tech-system';
import { createRng } from './map-generator';
import { recordLegendaryWonderDiscoverySite } from './legendary-wonder-history';

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
    if (!startPositions.every(sp => mapDistance(map, coord, sp) >= 4)) continue;

    // Distance from other villages
    if (!placedPositions.every(vp => mapDistance(map, coord, vp) >= 3)) continue;

    const id = `village-${placedPositions.length}`;
    villages[id] = { id, position: coord };
    placedPositions.push(coord);
  }

  return villages;
}

export function rollVillageOutcome(roll: number): VillageOutcomeType {
  if (roll < 0.25) return 'gold';
  if (roll < 0.45) return 'food';
  if (roll < 0.69) return 'science';
  if (roll < 0.84) return 'free_unit';
  if (roll < 0.85) return 'free_tech';
  if (roll < 0.95) return 'ambush';
  return 'illness';
}

function getCurrentResearchTech(techState: TechState) {
  return techState.currentResearch
    ? TECH_TREE.find(tech => tech.id === techState.currentResearch)
    : undefined;
}

function capVillageResearchBonus(techState: TechState, amount: number): number {
  const tech = getCurrentResearchTech(techState);
  if (!tech) return amount;

  const remaining = getEffectiveTechCost(tech, techState.completed) - techState.researchProgress;
  if (remaining <= 1) return amount;
  return Math.min(amount, remaining - 1);
}

export function visitVillage(
  state: GameState,
  villageId: string,
  unit: Unit,
  rng: () => number,
): { outcome: VillageOutcomeType; message: string } {
  const village = state.tribalVillages[villageId];
  if (!village) return { outcome: 'gold', message: '' };

  recordLegendaryWonderDiscoverySite(state, unit.owner, villageId, 'tribal-village', village.position);

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
          const d = mapDistance(state.map, village.position, city.position);
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
      const amount = Math.round((4 + Math.floor(rng() * 5)) * rewardMultiplier); // 4-8
      if (civ?.techState.currentResearch) {
        const tech = getCurrentResearchTech(civ.techState);
        const cappedAmount = capVillageResearchBonus(civ.techState, amount);
        const bonusResult = applyResearchBonus(civ.techState, cappedAmount);
        civ.techState = bonusResult.state;
        if (bonusResult.completedTech && tech) {
          message = `The villagers helped us finish ${tech.name}! +${cappedAmount} research.`;
        } else if (tech) {
          message = `The villagers taught us a little bit about ${tech.name}. `
            + `We are getting closer to understanding ${tech.name}. +${cappedAmount} research.`;
        } else {
          message = `The villagers share ancient knowledge! +${cappedAmount} research.`;
        }
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
      const newUnit = createUnit(unitType, unit.owner, village.position, state.idCounters);
      state.units = { ...state.units, [newUnit.id]: newUnit };
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
        if (civ.techState.currentResearch === tech.id) {
          const remainingCost = Math.max(0, getEffectiveTechCost(tech, civ.techState.completed) - civ.techState.researchProgress);
          civ.techState = applyResearchBonus(civ.techState, remainingCost).state;
        } else {
          civ.techState = {
            ...civ.techState,
            completed: [...civ.techState.completed, tech.id],
            researchQueue: civ.techState.researchQueue.filter(techId => techId !== tech.id),
          };
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
      const neighbors = mapNeighbors(state.map, village.position);
      const passable = neighbors.filter(n => {
        const t = state.map.tiles[hexKey(n)];
        return t && !IMPASSABLE_TERRAIN.has(t.terrain);
      });
      const spawnCount = Math.min(1 + Math.floor(rng() * 2), passable.length); // 1-2
      for (let i = 0; i < spawnCount; i++) {
        const barbarian = createUnit('warrior', 'barbarian', passable[i], state.idCounters);
        state.units = { ...state.units, [barbarian.id]: barbarian };
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
