import type { GameMap, HexCoord, GameState, ResourceYield } from '@/core/types';
import { WONDER_DEFINITIONS, getWonderDefinition } from './wonder-definitions';
import { hexKey, hexDistance, hexNeighbors } from './hex-utils';
import { createRng } from './map-generator';
import { applyResearchBonus } from './tech-system';
import { recordLegendaryWonderDiscoverySite } from './legendary-wonder-history';

const WONDER_COUNTS = { small: 5, medium: 8, large: 15 } as const;

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function placeWonders(
  map: GameMap,
  startPositions: HexCoord[],
  mapSize: 'small' | 'medium' | 'large',
  seed: string,
): HexCoord[] {
  const rng = createRng(seed + '-wonders');
  const targetCount = WONDER_COUNTS[mapSize];
  const shuffled = shuffle(WONDER_DEFINITIONS, rng);

  const placedPositions: HexCoord[] = [];

  for (const wonder of shuffled) {
    if (placedPositions.length >= targetCount) break;

    // Find candidate tiles matching this wonder's valid terrain
    const candidates: HexCoord[] = [];
    for (const tile of Object.values(map.tiles)) {
      if (!wonder.validTerrain.includes(tile.terrain)) continue;
      if (tile.wonder !== null) continue;

      // Distance from start positions
      const farEnoughFromStarts = startPositions.every(
        sp => hexDistance(tile.coord, sp) >= 6,
      );
      if (!farEnoughFromStarts) continue;

      // Distance from other wonders
      const farEnoughFromWonders = placedPositions.every(
        wp => hexDistance(tile.coord, wp) >= 8,
      );
      if (!farEnoughFromWonders) continue;

      candidates.push(tile.coord);
    }

    if (candidates.length === 0) continue;

    // Pick a random candidate
    const chosen = candidates[Math.floor(rng() * candidates.length)];
    const tile = map.tiles[hexKey(chosen)];
    tile.wonder = wonder.id;
    tile.resource = null; // Wonder replaces resource
    placedPositions.push(chosen);
  }

  return placedPositions;
}

export function processWonderDiscovery(
  state: GameState,
  civId: string,
  wonderId: string,
): boolean {
  const wonder = getWonderDefinition(wonderId);
  if (!wonder) return false;

  // Track all discoverers
  if (!state.wonderDiscoverers[wonderId]) {
    state.wonderDiscoverers[wonderId] = [];
  }
  if (state.wonderDiscoverers[wonderId].includes(civId)) return false;
  state.wonderDiscoverers[wonderId].push(civId);

  const wonderPosition = Object.values(state.map.tiles).find(tile => tile.wonder === wonderId)?.coord ?? { q: 0, r: 0 };
  recordLegendaryWonderDiscoverySite(state, civId, wonderId, 'natural-wonder', wonderPosition);

  const isFirst = !(wonderId in state.discoveredWonders);

  if (isFirst) {
    state.discoveredWonders[wonderId] = civId;

    // Grant discovery bonus
    const civ = state.civilizations[civId];
    if (civ) {
      const rewardMultiplier = civ.civType === 'spain' ? 1.25 : 1;
      const scaledAmount = Math.round(wonder.discoveryBonus.amount * rewardMultiplier);
      switch (wonder.discoveryBonus.type) {
        case 'gold':
          civ.gold += scaledAmount;
          break;
        case 'science':
          if (civ.techState.currentResearch) {
            const bonusResult = applyResearchBonus(civ.techState, scaledAmount);
            civ.techState = bonusResult.state;
          } else {
            // Fallback: convert to gold if no active research
            civ.gold += scaledAmount;
          }
          break;
        case 'production': {
          // Find the wonder's position on the map
          // Find nearest city to the wonder
          let nearestCity = null;
          let nearestDist = Infinity;
          for (const cityId of civ.cities) {
            const city = state.cities[cityId];
            if (!city) continue;
            const dist = hexDistance(wonderPosition, city.position);
            if (dist < nearestDist) {
              nearestDist = dist;
              nearestCity = city;
            }
          }

          if (nearestCity) {
            nearestCity.productionProgress += scaledAmount;
          }
          break;
        }
      }
    }
  }

  return isFirst;
}

export function getWonderYieldBonus(wonderId: string): ResourceYield {
  const wonder = getWonderDefinition(wonderId);
  if (!wonder) return { food: 0, production: 0, gold: 0, science: 0 };
  return { ...wonder.yields };
}

interface EruptionResult {
  wonderId: string;
  position: HexCoord;
  tilesAffected: HexCoord[];
}

export function processWonderEffects(state: GameState, rng: () => number): EruptionResult[] {
  const eruptions: EruptionResult[] = [];
  const effectRng = rng;

  for (const tile of Object.values(state.map.tiles)) {
    if (!tile.wonder) continue;
    const wonder = getWonderDefinition(tile.wonder);
    if (!wonder) continue;

    switch (wonder.effect.type) {
      case 'healing': {
        for (const unit of Object.values(state.units)) {
          if (hexKey(unit.position) === hexKey(tile.coord) && unit.health < 100) {
            unit.health = Math.min(100, unit.health + wonder.effect.hpPerTurn);
          }
        }
        break;
      }
      case 'eruption': {
        if (effectRng() < wonder.effect.chance) {
          const affected: HexCoord[] = [];
          const neighbors = hexNeighbors(tile.coord);
          for (const n of neighbors) {
            const nTile = state.map.tiles[hexKey(n)];
            if (nTile && nTile.improvement !== 'none') {
              nTile.improvement = 'none';
              nTile.improvementTurnsLeft = 0;
              affected.push(n);
            }
          }
          if (affected.length > 0) {
            eruptions.push({ wonderId: tile.wonder, position: tile.coord, tilesAffected: affected });
          }
        }
        break;
      }
      // vision and combat_bonus are read-only — handled at call sites
    }
  }

  return eruptions;
}

export function getWonderVisionBonus(wonderId: string | null): number {
  if (!wonderId) return 0;
  const wonder = getWonderDefinition(wonderId);
  if (!wonder || wonder.effect.type !== 'vision') return 0;
  return wonder.effect.bonus;
}

export function getWonderCombatBonus(wonderId: string | null): number {
  if (!wonderId) return 0;
  const wonder = getWonderDefinition(wonderId);
  if (!wonder || wonder.effect.type !== 'combat_bonus') return 0;
  return wonder.effect.defenseBonus;
}
