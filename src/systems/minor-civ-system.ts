import type { GameState, MinorCivArchetype, MinorCivState, HexCoord, City, Unit, UnitType } from '@/core/types';
import type { EventBus } from '@/core/event-bus';
import { MINOR_CIV_DEFINITIONS } from './minor-civ-definitions';
import { TECH_TREE } from './tech-definitions';
import { createDiplomacyState, modifyRelationship } from './diplomacy-system';
import { applyResearchBonus } from './tech-system';
import { hexDistance, hexKey, hexNeighbors, wrappedHexDistance } from './hex-utils';
import { createUnit, UNIT_DEFINITIONS } from './unit-system';
import { foundCity } from './city-system';
import { collectUsedCityNames } from './city-name-system';
import { generateQuest } from './quest-system';
import { isMinorCivAtWar } from './minor-civ-diplomacy';
import { resolveCombat } from './combat-system';
import { hasDiscoveredMinorCiv } from './discovery-system';
import { canAttackByProfileOnMap } from './attack-targeting';
import {
  type ChainTransition,
  emitMinorCivQuestTransitions,
  getMinorCivRelationshipStatus,
  isMinorCivAllianceActive,
  reconcileMinorCivQuestTurn,
} from './quest-chain-system';

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
      state.map.width,
    );
    if (!pos) continue;

    placedPositions.push(pos);

    // Create city with archetype buildings
    const city = foundCity(`mc-${def.id}`, pos, state.map, state.idCounters, {
      civType: def.id,
      namingPool: [def.name],
      civName: def.name,
      usedNames: new Set([...collectUsedCityNames(state), ...Object.values(result.cities).map(city => city.name)]),
    });
    city.population = 3;
    const archetypeBuilding = def.archetype === 'militaristic' ? 'barracks'
      : def.archetype === 'mercantile' ? 'marketplace'
      : 'library';
    if (!city.buildings.includes(archetypeBuilding)) {
      city.buildings.push(archetypeBuilding);
    }
    result.cities[city.id] = city;

    // Create garrison unit
    const garrison = createUnit('warrior', `mc-${def.id}`, pos, state.idCounters);
    result.units[garrison.id] = garrison;

    // Create minor civ state
    const mcState: MinorCivState = {
      id: `mc-${def.id}`,
      definitionId: def.id,
      cityId: city.id,
      units: [garrison.id],
      diplomacy: createDiplomacyState(majorCivIds, `mc-${def.id}`, 0),
      activeQuests: {},
      chainStatusByCiv: {},
      questCooldownUntilByCiv: {},
      lastNotifiedStatusByCiv: {},
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
  mapWidth: number,
): HexCoord | null {
  for (const pos of candidates) {
    if (startPositions.some(s => wrappedHexDistance(pos, s, mapWidth) < 8)) continue;
    if (cityPositions.some(c => wrappedHexDistance(pos, c, mapWidth) < 6)) continue;
    if (placedPositions.some(p => wrappedHexDistance(pos, p, mapWidth) < 10)) continue;
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
  let nextState = structuredClone(state);
  for (const mcId of Object.keys(nextState.minorCivs).sort()) {
    let mc = nextState.minorCivs[mcId];
    if (mc.isDestroyed) continue;

    const def = MINOR_CIV_DEFINITIONS.find(d => d.id === mc.definitionId);
    if (!def) continue;

    processMovement(nextState, mc);
    nextState = processQuests(nextState, mcId, def, bus);
    mc = nextState.minorCivs[mcId];
    nextState = applyAllyBonuses(nextState, mc, def);
    mc = nextState.minorCivs[mcId];
    nextState = processGarrison(nextState, mc);
    emitRelationshipThresholds(nextState, nextState.minorCivs[mcId], bus);
  }

  return nextState;
}

function processQuests(
  state: GameState,
  minorCivId: string,
  def: { archetype: MinorCivArchetype },
  bus: EventBus,
): GameState {
  let nextState = state;
  const majorCivIds = Object.keys(state.civilizations);
  for (const civId of majorCivIds) {
    const mc = nextState.minorCivs[minorCivId];
    if (!hasDiscoveredMinorCiv(nextState, civId, minorCivId)) continue;
    if (isMinorCivAtWar(nextState, civId, minorCivId)) continue;

    const reconciled = reconcileMinorCivQuestTurn(nextState, minorCivId, civId, nextState.turn);
    nextState = reconciled.state;
    emitMinorCivQuestTransitions(bus, reconciled.transitions, nextState);

    const current = nextState.minorCivs[minorCivId];
    if (current.activeQuests[civId] || current.chainStatusByCiv[civId]?.status === 'pending') continue;
    if (nextState.turn < (current.questCooldownUntilByCiv[civId] ?? 0)) continue;
    if (current.chainStatusByCiv[civId]?.status === 'allied') continue;

    const rng = makeRng(nextState.turn * 16807 + civId.charCodeAt(0) + minorCivId.charCodeAt(3));
    const newQuest = generateQuest(
      def.archetype,
      minorCivId,
      civId,
      nextState.turn,
      nextState,
      rng,
      nextState.idCounters,
    );
    if (newQuest) {
      current.activeQuests[civId] = newQuest;
      emitMinorCivQuestTransitions(bus, [{ type: 'issued', minorCivId, majorCivId: civId, quest: newQuest }], nextState);
    }
  }
  return nextState;
}

function applyAllyBonuses(state: GameState, mc: MinorCivState, def: { allyBonus: any }): GameState {
  for (const civId of Object.keys(mc.diplomacy.relationships)) {
    if (!isMinorCivAllianceActive(state, civId, mc.id)) continue;

    const civ = state.civilizations[civId];
    if (!civ) continue;

    switch (def.allyBonus.type) {
      case 'gold_per_turn':
        civ.gold += def.allyBonus.amount;
        break;
      case 'science_per_turn':
        if (civ.techState.currentResearch) {
          const bonusResult = applyResearchBonus(civ.techState, def.allyBonus.amount);
          civ.techState = bonusResult.state;
        }
        break;
      case 'production_per_turn': {
        const cityWithQueue = civ.cities
          .map(id => state.cities[id])
          .find(c => c && c.productionQueue.length > 0);
        if (cityWithQueue) {
          cityWithQueue.productionProgress += def.allyBonus.amount;
        }
        break;
      }
      case 'free_unit': {
        if (state.turn % def.allyBonus.everyNTurns === 0) {
          const spawnCity = civ.cities
            .map(id => state.cities[id])
            .find(c => c && !Object.values(state.units).some(u => hexKey(u.position) === hexKey(c.position)));
          if (spawnCity) {
            const freeUnit = createUnit(def.allyBonus.unitType, civId, spawnCity.position, state.idCounters);
            state = { ...state, units: { ...state.units, [freeUnit.id]: freeUnit } };
            civ.units.push(freeUnit.id);
          }
        }
        break;
      }
    }
  }
  return state;
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

function emitRelationshipThresholds(state: GameState, mc: MinorCivState, bus: EventBus): void {
  for (const civId of Object.keys(mc.diplomacy.relationships)) {
    const currentStatus = getMinorCivRelationshipStatus(state, civId, mc.id);
    const prevStatus = mc.lastNotifiedStatusByCiv[civId] ?? 'neutral';

    if (currentStatus !== prevStatus) {
      mc.lastNotifiedStatusByCiv[civId] = currentStatus;
      bus.emit('minor-civ:relationship-threshold', {
        minorCivId: mc.id,
        majorCivId: civId,
        newStatus: currentStatus,
        state,
      });
    }
  }
}

function processGarrison(state: GameState, mc: MinorCivState): GameState {
  const aliveUnits = mc.units.filter(uid => state.units[uid]);
  mc.units = aliveUnits;

  if (aliveUnits.length === 0) {
    if (mc.garrisonCooldown > 0) {
      mc.garrisonCooldown--;
    } else {
      const city = state.cities[mc.cityId];
      if (city) {
        const cityKey = hexKey(city.position);
        const occupied = Object.values(state.units).some(u => hexKey(u.position) === cityKey);
        if (!occupied) {
          const garrison = createUnit('warrior', mc.id, city.position, state.idCounters);
          state = { ...state, units: { ...state.units, [garrison.id]: garrison } };
          mc.units.push(garrison.id);
          mc.garrisonCooldown = 3;
        }
      }
    }
  }
  return state;
}

function makeRng(seed: number): () => number {
  let s = Math.abs(seed) || 1;
  return () => {
    s = (s * 48271) % 2147483647;
    return s / 2147483647;
  };
}

// === Conquest ===

export function conquestMinorCiv(
  state: GameState,
  mcId: string,
  conquerorId: string,
): { state: GameState; transitions: ChainTransition[]; conquered: boolean } {
  const existing = state.minorCivs[mcId];
  if (!existing || existing.isDestroyed) return { state, transitions: [], conquered: false };
  const nextState = structuredClone(state);
  const mc = nextState.minorCivs[mcId];
  const transitions: ChainTransition[] = [];
  for (const [majorCivId, status] of Object.entries(mc.chainStatusByCiv)) {
    if (status.status === 'allied') {
      transitions.push({ type: 'alliance-broken', majorCivId, minorCivId: mcId, chainId: status.chainId });
    }
  }

  mc.isDestroyed = true;
  mc.activeQuests = {};
  mc.chainStatusByCiv = {};
  mc.questCooldownUntilByCiv = {};
  mc.lastNotifiedStatusByCiv = {};

  const city = nextState.cities[mc.cityId];
  if (city) {
    city.owner = conquerorId;
    const civ = nextState.civilizations[conquerorId];
    if (civ && !civ.cities.includes(mc.cityId)) {
      civ.cities.push(mc.cityId);
    }
  }

  for (const uid of mc.units) {
    delete nextState.units[uid];
  }
  mc.units = [];

  for (const [otherId, otherMc] of Object.entries(nextState.minorCivs)) {
    if (otherId === mcId || otherMc.isDestroyed) continue;
    const otherDef = MINOR_CIV_DEFINITIONS.find(d => d.id === otherMc.definitionId);
    const penalty = otherDef?.archetype === 'militaristic' ? -10 : -20;
    otherMc.diplomacy = modifyRelationship(otherMc.diplomacy, conquerorId, penalty);
  }

  return { state: nextState, transitions, conquered: true };
}

// === Guerrilla & Scuffles ===

export function processGuerrilla(state: GameState, mc: MinorCivState, bus: EventBus): GameState {
  if (mc.isDestroyed) return state;
  const targetCivId = Object.keys(state.civilizations)
    .find(civId => isMinorCivAtWar(state, civId, mc.id));
  if (!targetCivId) return state;

  const guerrillaCount = mc.units.filter(uid => state.units[uid]).length - 1;
  if (guerrillaCount >= 2) return state;

  const city = state.cities[mc.cityId];
  if (!city) return state;

  const cityKey = hexKey(city.position);
  const cityOccupied = Object.values(state.units).some(u => hexKey(u.position) === cityKey);
  if (cityOccupied) return state;

  const guerrilla = createUnit('warrior', mc.id, city.position, state.idCounters);
  state = { ...state, units: { ...state.units, [guerrilla.id]: guerrilla } };
  mc.units.push(guerrilla.id);

  bus.emit('minor-civ:guerrilla', {
    minorCivId: mc.id,
    targetCivId,
    position: city.position,
  });
  return state;
}

export function processScuffles(state: GameState, bus: EventBus): void {
  const activeMcs = Object.values(state.minorCivs).filter(mc => !mc.isDestroyed);

  for (const mc of activeMcs) {
    const def = MINOR_CIV_DEFINITIONS.find(d => d.id === mc.definitionId);
    if (!def || def.archetype !== 'militaristic') continue;

    const roll = (state.turn * 16807 + mc.id.charCodeAt(3)) % 100;
    if (roll >= 10) continue;

    const mcCity = state.cities[mc.cityId];
    if (!mcCity) continue;

    for (const other of activeMcs) {
      if (other.id === mc.id) continue;
      const otherCity = state.cities[other.cityId];
      if (!otherCity) continue;

      if (hexDistance(mcCity.position, otherCity.position) <= 8) {
        const attackerUnit = mc.units.map(uid => state.units[uid]).find(u => u);
        const defenderUnit = other.units.map(uid => state.units[uid]).find(u => u);
        if (attackerUnit && defenderUnit && canAttackByProfileOnMap(attackerUnit, defenderUnit, state.map)) {
          const seed = state.turn * 16807 + attackerUnit.id.charCodeAt(0);
          const result = resolveCombat(attackerUnit, defenderUnit, state.map, seed, undefined, state.era);
          attackerUnit.health = Math.max(1, attackerUnit.health - result.attackerDamage);
          defenderUnit.health = Math.max(1, defenderUnit.health - result.defenderDamage);
          bus.emit('minor-civ:scuffle', {
            attackerId: mc.id,
            defenderId: other.id,
            position: otherCity.position,
          });
          break;
        }
      }
    }
  }
}

// === Barbarian Camp Evolution ===

interface EvolutionResult {
  newMinorCiv: MinorCivState;
  newCity: City;
  newGarrison: Unit;
  removeCampId: string;
  transferUnitIds: string[];
}

export function checkCampEvolution(
  state: GameState,
  _currentTurn: number,
): EvolutionResult | null {
  const activeMinorCivs = Object.values(state.minorCivs).filter(mc => !mc.isDestroyed);
  const usedDefs = new Set(activeMinorCivs.map(mc => mc.definitionId));
  const unusedDefs = MINOR_CIV_DEFINITIONS.filter(d => !usedDefs.has(d.id));
  if (unusedDefs.length === 0) return null;

  const allCityPositions = Object.values(state.cities).map(c => c.position);
  const startPositions = Object.values(state.units)
    .filter(u => u.type === 'settler')
    .map(u => u.position);

  for (const camp of Object.values(state.barbarianCamps)) {
    if (camp.strength < 8) continue;
    if (allCityPositions.some(c => hexDistance(camp.position, c) < 6)) continue;
    if (startPositions.some(s => hexDistance(camp.position, s) < 6)) continue;

    const def = unusedDefs[0];
    const majorCivIds = Object.keys(state.civilizations);

    const city = foundCity(`mc-${def.id}`, camp.position, state.map, state.idCounters, {
      civType: def.id,
      namingPool: [def.name],
      civName: def.name,
      usedNames: collectUsedCityNames(state),
    });
    city.population = 3;

    const garrison = createUnit('warrior', `mc-${def.id}`, camp.position, state.idCounters);

    const transferIds: string[] = [];
    for (const [uid, unit] of Object.entries(state.units)) {
      if (unit.owner === 'barbarian' && hexDistance(unit.position, camp.position) <= 3) {
        transferIds.push(uid);
      }
    }

    const mcState: MinorCivState = {
      id: `mc-${def.id}`,
      definitionId: def.id,
      cityId: city.id,
      units: [garrison.id, ...transferIds],
      diplomacy: createDiplomacyState(majorCivIds, `mc-${def.id}`, 0),
      activeQuests: {},
      chainStatusByCiv: {},
      questCooldownUntilByCiv: {},
      lastNotifiedStatusByCiv: {},
      isDestroyed: false,
      garrisonCooldown: 0,
      lastEraUpgrade: state.era,
    };

    return {
      newMinorCiv: mcState,
      newCity: city,
      newGarrison: garrison,
      removeCampId: camp.id,
      transferUnitIds: transferIds,
    };
  }

  return null;
}

// === Era Advancement ===

const ERA_UNIT_MAP: Record<number, UnitType> = {
  1: 'warrior',
  2: 'swordsman',
  3: 'pikeman',
  4: 'musketeer',
};

// Pre-built for O(1) lookup in checkEraAdvancement (called every turn)
const ERA_ADVANCEMENT_TECH_ERA = new Map<string, number>(
  TECH_TREE
    .filter(t => t.countsForEraAdvancement !== false)
    .map(t => [t.id, t.era])
);

export function checkEraAdvancement(state: GameState): number {
  let maxEra = state.era ?? 1;
  for (const civ of Object.values(state.civilizations)) {
    for (const techId of civ.techState.completed) {
      const era = ERA_ADVANCEMENT_TECH_ERA.get(techId);
      if (era !== undefined && era > maxEra) maxEra = era;
    }
  }
  return maxEra;
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

export type DiplomaticReaction = 'camp_destroyed_nearby' | 'attacked_neighbor' | 'trade_established' | 'wonder_built';

const REACTION_MODIFIERS: Record<DiplomaticReaction, Record<string, number>> = {
  camp_destroyed_nearby: { militaristic: 10, mercantile: 10, cultural: 10 },
  attacked_neighbor: { militaristic: 5, mercantile: -10, cultural: -15 },
  trade_established: { militaristic: 3, mercantile: 15, cultural: 5 },
  wonder_built: { militaristic: 0, mercantile: 5, cultural: 15 },
};

export function applyDiplomaticReaction(
  state: GameState,
  reaction: DiplomaticReaction,
  civId: string,
  mcId: string,
): void {
  const mc = state.minorCivs[mcId];
  if (!mc || mc.isDestroyed) return;

  const def = MINOR_CIV_DEFINITIONS.find(d => d.id === mc.definitionId);
  if (!def) return;

  const modifier = REACTION_MODIFIERS[reaction]?.[def.archetype] ?? 0;
  if (modifier === 0) return;

  mc.diplomacy = modifyRelationship(mc.diplomacy, civId, modifier);
}
