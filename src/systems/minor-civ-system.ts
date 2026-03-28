import type { GameState, MinorCivState, HexCoord, City, Unit, UnitType } from '@/core/types';
import type { EventBus } from '@/core/event-bus';
import { MINOR_CIV_DEFINITIONS } from './minor-civ-definitions';
import { TECH_TREE } from './tech-definitions';
import { createDiplomacyState, modifyRelationship } from './diplomacy-system';
import { hexDistance, hexKey, hexNeighbors } from './hex-utils';
import { createUnit, UNIT_DEFINITIONS } from './unit-system';
import { foundCity } from './city-system';
import { generateQuest, checkQuestCompletion, processQuestExpiry, awardQuestReward } from './quest-system';

const PLACEMENT_COUNTS: Record<string, [number, number]> = {
  small: [2, 4],
  medium: [4, 6],
  large: [6, 8],
};

const IMPASSABLE: Set<string> = new Set(['ocean', 'coast', 'mountain']);

export interface PlacementResult {
  minorCivs: Record<string, MinorCivState>;
  cities: Record<string, City>;
  units: Record<string, Unit>;
}

export function placeMinorCivs(
  state: GameState,
  mapSize: 'small' | 'medium' | 'large',
  seed: string,
): PlacementResult {
  const [min, max] = PLACEMENT_COUNTS[mapSize] ?? [2, 4];

  // Seeded RNG
  let rngState = hashSeed(seed + '-mc');
  const rng = () => {
    rngState = (rngState * 48271) % 2147483647;
    return rngState / 2147483647;
  };

  const count = min + Math.floor(rng() * (max - min + 1));

  // Shuffle definitions
  const shuffled = [...MINOR_CIV_DEFINITIONS].sort(() => rng() - 0.5);
  const selected = shuffled.slice(0, count);

  // Get positions to avoid
  const startPositions = Object.values(state.units)
    .filter(u => u.type === 'settler')
    .map(u => u.position);
  const cityPositions = Object.values(state.cities).map(c => c.position);

  // Get passable tiles
  const candidates = Object.values(state.map.tiles)
    .filter(t => !IMPASSABLE.has(t.terrain) && !t.wonder)
    .map(t => t.coord)
    .sort(() => rng() - 0.5);

  const majorCivIds = Object.keys(state.civilizations);
  const placedPositions: HexCoord[] = [];
  const result: PlacementResult = {
    minorCivs: {},
    cities: { ...state.cities },
    units: { ...state.units },
  };

  for (const def of selected) {
    const pos = findValidPosition(
      candidates,
      startPositions,
      cityPositions,
      placedPositions,
    );
    if (!pos) continue;

    placedPositions.push(pos);

    // Create city with archetype buildings
    const city = foundCity(`mc-${def.id}`, pos, state.map);
    city.population = 3;
    const archetypeBuilding = def.archetype === 'militaristic' ? 'barracks'
      : def.archetype === 'mercantile' ? 'marketplace'
      : 'library';
    if (!city.buildings.includes(archetypeBuilding)) {
      city.buildings.push(archetypeBuilding);
    }
    result.cities[city.id] = city;

    // Create garrison unit
    const garrison = createUnit('warrior', `mc-${def.id}`, pos);
    result.units[garrison.id] = garrison;

    // Create minor civ state
    const mcState: MinorCivState = {
      id: `mc-${def.id}`,
      definitionId: def.id,
      cityId: city.id,
      units: [garrison.id],
      diplomacy: createDiplomacyState(majorCivIds, `mc-${def.id}`, 0),
      activeQuests: {},
      isDestroyed: false,
      garrisonCooldown: 0,
      lastEraUpgrade: 1,
    };

    result.minorCivs[mcState.id] = mcState;
  }

  return result;
}

function findValidPosition(
  candidates: HexCoord[],
  startPositions: HexCoord[],
  cityPositions: HexCoord[],
  placedPositions: HexCoord[],
): HexCoord | null {
  for (const pos of candidates) {
    if (startPositions.some(s => hexDistance(pos, s) < 8)) continue;
    if (cityPositions.some(c => hexDistance(pos, c) < 6)) continue;
    if (placedPositions.some(p => hexDistance(pos, p) < 10)) continue;
    return pos;
  }
  return null;
}

function hashSeed(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) || 1;
}

// === Turn Processing ===

export function processMinorCivTurn(state: GameState, bus: EventBus): GameState {
  const newState = structuredClone(state);

  for (const [_mcId, mc] of Object.entries(newState.minorCivs)) {
    if (mc.isDestroyed) continue;

    const def = MINOR_CIV_DEFINITIONS.find(d => d.id === mc.definitionId);
    if (!def) continue;

    processMovement(newState, mc);
    processQuests(newState, mc, def, bus);
    applyAllyBonuses(newState, mc, def, bus);
    processGarrison(newState, mc);
    emitRelationshipThresholds(newState, mc, bus);
  }

  return newState;
}

function processQuests(state: GameState, mc: MinorCivState, def: { archetype: any }, bus: EventBus): void {
  const majorCivIds = Object.keys(state.civilizations);
  for (const civId of majorCivIds) {
    const quest = mc.activeQuests[civId];
    if (quest) {
      const expiredQuest = processQuestExpiry(quest, state.turn);
      if (expiredQuest.status === 'expired') {
        delete mc.activeQuests[civId];
        mc.diplomacy = modifyRelationship(mc.diplomacy, civId, -5);
        continue;
      }

      if (checkQuestCompletion(quest, state)) {
        quest.status = 'completed';
        const reward = awardQuestReward(quest.reward);
        mc.diplomacy = modifyRelationship(mc.diplomacy, civId, reward.relationshipBonus);
        if (reward.gold && state.civilizations[civId]) {
          state.civilizations[civId].gold += reward.gold;
        }
        if (reward.science && state.civilizations[civId]?.techState.currentResearch) {
          state.civilizations[civId].techState.researchProgress += reward.science;
        }
        bus.emit('minor-civ:quest-completed', { minorCivId: mc.id, majorCivId: civId, quest, reward });
        delete mc.activeQuests[civId];
        (mc as any)[`_cooldown_${civId}`] = state.turn + 3;
      }
    } else {
      const cooldownUntil = (mc as any)[`_cooldown_${civId}`] ?? 0;
      if (state.turn >= cooldownUntil) {
        const rng = makeRng(state.turn * 16807 + civId.charCodeAt(0) + mc.id.charCodeAt(3));
        const newQuest = generateQuest(def.archetype, mc.id, civId, state.turn, state, rng);
        if (newQuest) {
          mc.activeQuests[civId] = newQuest;
          bus.emit('minor-civ:quest-issued', { minorCivId: mc.id, majorCivId: civId, quest: newQuest });
        }
      }
    }
  }
}

function applyAllyBonuses(state: GameState, mc: MinorCivState, def: { allyBonus: any }, bus: EventBus): void {
  for (const [civId, rel] of Object.entries(mc.diplomacy.relationships)) {
    if (rel < 60) continue;

    const civ = state.civilizations[civId];
    if (!civ) continue;

    switch (def.allyBonus.type) {
      case 'gold_per_turn':
        civ.gold += def.allyBonus.amount;
        break;
      case 'science_per_turn':
        if (civ.techState.currentResearch) {
          civ.techState.researchProgress += def.allyBonus.amount;
        }
        break;
      case 'production_per_turn': {
        const firstCityId = civ.cities[0];
        const firstCity = firstCityId ? state.cities[firstCityId] : null;
        if (firstCity?.productionQueue?.length > 0) {
          firstCity.productionQueue[0].progress = (firstCity.productionQueue[0].progress ?? 0) + def.allyBonus.amount;
        }
        break;
      }
      case 'free_unit': {
        if (state.turn % def.allyBonus.everyNTurns === 0) {
          const city = civ.cities[0] ? state.cities[civ.cities[0]] : null;
          if (city) {
            const freeUnit = createUnit(def.allyBonus.unitType, civId, city.position);
            state.units[freeUnit.id] = freeUnit;
            civ.units.push(freeUnit.id);
          }
        }
        break;
      }
    }
  }
}

function processMovement(state: GameState, mc: MinorCivState): void {
  const city = state.cities[mc.cityId];
  if (!city) return;

  for (const uid of mc.units) {
    const unit = state.units[uid];
    if (!unit) continue;

    const dist = hexDistance(unit.position, city.position);
    if (dist > 3) {
      const neighbors = hexNeighbors(unit.position);
      const closer = neighbors
        .filter(n => hexDistance(n, city.position) < dist)
        .filter(n => {
          const tile = state.map.tiles[hexKey(n)];
          return tile && tile.terrain !== 'ocean' && tile.terrain !== 'mountain';
        })[0];
      if (closer) {
        unit.position = closer;
      }
    }

    unit.movementPointsLeft = UNIT_DEFINITIONS[unit.type]?.movementPoints ?? 2;
    unit.hasActed = false;
  }
}

function getRelationshipStatus(rel: number): 'hostile' | 'neutral' | 'friendly' | 'allied' {
  if (rel <= -60) return 'hostile';
  if (rel >= 60) return 'allied';
  if (rel >= 30) return 'friendly';
  return 'neutral';
}

function emitRelationshipThresholds(state: GameState, mc: MinorCivState, bus: EventBus): void {
  if (!(mc as any)._prevStatus) (mc as any)._prevStatus = {} as Record<string, string>;

  for (const [civId, rel] of Object.entries(mc.diplomacy.relationships)) {
    const currentStatus = getRelationshipStatus(rel);
    const prevStatus = (mc as any)._prevStatus[civId] ?? 'neutral';

    if (currentStatus !== prevStatus) {
      (mc as any)._prevStatus[civId] = currentStatus;
      bus.emit('minor-civ:relationship-threshold', {
        minorCivId: mc.id,
        majorCivId: civId,
        newStatus: currentStatus,
      });
      if (currentStatus === 'allied') {
        bus.emit('minor-civ:allied', { minorCivId: mc.id, majorCivId: civId });
      }
    }
  }
}

function processGarrison(state: GameState, mc: MinorCivState): void {
  const aliveUnits = mc.units.filter(uid => state.units[uid]);
  mc.units = aliveUnits;

  if (aliveUnits.length === 0) {
    if (mc.garrisonCooldown > 0) {
      mc.garrisonCooldown--;
    } else {
      const city = state.cities[mc.cityId];
      if (city) {
        const garrison = createUnit('warrior', mc.id, city.position);
        state.units[garrison.id] = garrison;
        mc.units.push(garrison.id);
        mc.garrisonCooldown = 3;
      }
    }
  }
}

function makeRng(seed: number): () => number {
  let s = Math.abs(seed) || 1;
  return () => {
    s = (s * 48271) % 2147483647;
    return s / 2147483647;
  };
}

// === Era Advancement ===

const ERA_UNIT_MAP: Record<number, UnitType> = {
  1: 'warrior',
  2: 'swordsman',
  3: 'pikeman',
  4: 'musketeer',
};

export function checkEraAdvancement(state: GameState): number {
  const nextEra = state.era + 1;
  const nextEraTechs = TECH_TREE.filter(t => t.era === nextEra);
  if (nextEraTechs.length === 0) return state.era;

  const anyAdvanced = Object.values(state.civilizations).some(civ => {
    const completed = nextEraTechs.filter(t => civ.techState.completed.includes(t.id));
    return completed.length >= nextEraTechs.length * 0.6;
  });

  return anyAdvanced ? nextEra : state.era;
}

export function processMinorCivEraUpgrade(state: GameState, mc: MinorCivState): void {
  if (mc.isDestroyed) return;
  if (state.era <= mc.lastEraUpgrade) return;

  const newType = ERA_UNIT_MAP[state.era] ?? 'warrior';
  for (const uid of mc.units) {
    const unit = state.units[uid];
    if (unit && unit.type !== 'settler' && unit.type !== 'worker') {
      (unit as any).type = newType;
    }
  }

  const city = state.cities[mc.cityId];
  if (city) {
    city.population += 1;
  }

  mc.lastEraUpgrade = state.era;
}
