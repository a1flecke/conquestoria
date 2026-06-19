import type { BarbarianCamp, City, PirateFleet, GameState, GameMap, HexCoord } from '@/core/types';
import type { EventBus } from '@/core/event-bus';
import { hexKey, hexNeighbors, hexDistance } from './hex-utils';
import { createUnit } from './unit-system';

export const PIRATE_OWNER = 'pirate';

const NON_VIABLE_TERRAIN = new Set(['ocean', 'coast', 'mountain', 'snow']);

// ── Pure helpers ─────────────────────────────────────────────────────────────

export function empireShare(state: GameState, civId: string, landmassId: string): number {
  const tiles = Object.values(state.map.tiles).filter(t => t.regionKey === landmassId);
  const viable = tiles.filter(t => !NON_VIABLE_TERRAIN.has(t.terrain));
  if (viable.length === 0) return 0;
  const owned = viable.filter(t => t.owner === civId).length;
  return Math.min(owned / viable.length, 1.0);
}

export function nearestLandmassId(position: HexCoord, map: GameMap): string | null {
  const visited = new Set<string>([hexKey(position)]);
  let frontier: HexCoord[] = [position];

  for (let depth = 0; depth < 10 && frontier.length > 0; depth++) {
    const nextFrontier: HexCoord[] = [];
    for (const coord of frontier) {
      for (const nb of hexNeighbors(coord)) {
        const key = hexKey(nb);
        if (visited.has(key)) continue;
        visited.add(key);
        const tile = map.tiles[key];
        if (!tile) continue;
        if (tile.regionKey) return tile.regionKey;
        nextFrontier.push(nb);
      }
    }
    frontier = nextFrontier;
  }
  return null;
}

export function computeThreatScore(state: GameState, civId: string, landmassId: string): number {
  const civ = state.civilizations[civId];
  if (!civ || !civ.isHuman) return 0;

  // Only evaluate landmasses where civ has at least one city
  const hasCityOnLandmass = civ.cities.some(cityId => {
    const city = state.cities[cityId];
    if (!city) return false;
    const tile = state.map.tiles[hexKey(city.position)];
    return tile?.regionKey === landmassId;
  });
  if (!hasCityOnLandmass) return 0;

  const share = empireShare(state, civId, landmassId);
  const idleTurns = state.turn - (civ.lastCombatTurnByLandmass?.[landmassId] ?? state.turn);
  const idleFactor = Math.min(idleTurns / 10, 1.5);

  return state.era * (1.0 + share + idleFactor);
}

// ── Seeded LCG — no Math.random() per project rules ─────────────────────────
function lcg(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = Math.imul(1664525, s) + 1013904223;
    return (s >>> 0) / 0xffffffff;
  };
}

// ── Bandit lord name pool ────────────────────────────────────────────────────
const BANDIT_LORD_NAMES: Record<string, string[]> = {
  generic: ['The Iron Fist', 'Greymantle', 'The Scarred One', 'Black Hand', 'The Reaver'],
  egypt: ['Amenhotep the Black', 'Kha-em-waset', 'Neferkare', 'Paneb', 'Userhat'],
  rome: ['Spartacus', 'Catilina', 'Viriathus', 'Bulla Felix', 'Salvian the Red', 'Maternus', 'Aelianus'],
  aztec: ['Montezuma II', 'Cuauhtémoc', 'Itzcoatl', 'Ahuitzotl', 'Tlacaelel'],
  japan: ['Nobunaga', 'Hideyoshi', 'Ieyasu', 'Takeda Shingen', 'Uesugi Kenshin', 'Miyamoto Musashi'],
  india: ['Chandragupta', 'Ashoka', 'Prithviraj Chauhan', 'Shivaji', 'Tipu Sultan', 'Akbar'],
  france: ['Charlemagne', 'Charles Martel', 'Robespierre', 'Du Guesclin', 'Napoleon'],
  germany: ['Arminius', 'Frederick Barbarossa', 'Otto the Great', 'Odoacer', 'Alaric'],
  russia: ['Ivan the Terrible', 'Peter the Great', 'Alexander Nevsky', 'Pugachev', 'Stenka Razin'],
  ottoman: ['Suleiman', 'Mehmed II', 'Selim I', 'Osman I', 'Murad I'],
  spain: ['El Cid', 'Cortés', 'Pizarro', 'Gonzalo de Córdoba', 'Ferdinand I'],
  viking: ['Ragnar Lothbrok', 'Eric Bloodaxe', 'Ivar the Boneless', 'Harald Hardrada', 'Björn Ironside', 'Leif Erikson'],
  gondor: ['Aragorn', 'Boromir', 'Faramir', 'Denethor', 'Isildur', 'Anárion'],
  rohan: ['Théoden', 'Éomer', 'Helm Hammerhand', 'Erkenbrand', 'Grimbold'],
  isengard: ['Saruman', 'Grima Wormtongue', 'Uglúk', 'Grishnákh', 'Mauhúr'],
};

function pickBanditName(civType: string, seed: number): string {
  const pool = BANDIT_LORD_NAMES[civType] ?? BANDIT_LORD_NAMES['generic'];
  const rng = lcg(seed);
  return pool[Math.floor(rng() * pool.length)];
}

// ── Resurgent camp strength by era ───────────────────────────────────────────
const ERA_STRENGTH: Record<number, [number, number]> = {
  1: [3, 6], 2: [6, 10], 3: [10, 14], 4: [14, 18],
};

function resurgenceCampStrength(era: number, rng: () => number): number {
  const [low, high] = ERA_STRENGTH[era] ?? ERA_STRENGTH[4];
  return low + Math.floor(rng() * (high - low));
}

// ── Land resurgence ──────────────────────────────────────────────────────────

const RESURGENCE_CAP = 2;
const RESURGENCE_COOLDOWN_TURNS = 8;
const LAND_RESURGENCE_THRESHOLD = 2.5;
const BANDIT_LORD_THRESHOLD = 7.0;

export function processLandResurgence(
  state: GameState,
  civId: string,
  landmassId: string,
  bus: EventBus,
): GameState {
  const cooldownKey = `${civId}:${landmassId}`;
  const cooldownUntil = state.resurgentCampCooldownByCivLandmass?.[cooldownKey] ?? 0;
  if (state.turn < cooldownUntil) return state;

  const score = computeThreatScore(state, civId, landmassId);
  if (score < LAND_RESURGENCE_THRESHOLD) return state;

  // Count active resurgent camps on landmass
  const resurgentCount = Object.values(state.barbarianCamps).filter(c => {
    if (!c.resurgent) return false;
    const tile = state.map.tiles[hexKey(c.position)];
    return tile?.regionKey === landmassId;
  }).length;
  if (resurgentCount >= RESURGENCE_CAP) return state;

  const landmassTiles = Object.values(state.map.tiles).filter(t => t.regionKey === landmassId);
  const allCamps = Object.values(state.barbarianCamps);
  const cityPositions = Object.values(state.cities).map(c => c.position);
  const spawnSeed = state.turn * 99991 + landmassId.charCodeAt(0) * 7 + civId.charCodeAt(0) * 3;
  const rng = lcg(spawnSeed);

  const candidates = landmassTiles.filter(tile => {
    if (NON_VIABLE_TERRAIN.has(tile.terrain)) return false;
    if (state.barbarianCamps[hexKey(tile.coord)]) return false;
    // Must be far from cities and existing camps
    for (const pos of cityPositions) {
      if (hexDistance(tile.coord, pos) < 4) return false;
    }
    for (const camp of allCamps) {
      if (hexDistance(tile.coord, camp.position) < 3) return false;
    }
    return true;
  });

  if (candidates.length === 0) return state;

  const chosen = candidates[Math.floor(rng() * candidates.length)];
  const isBanditLord = score >= BANDIT_LORD_THRESHOLD;
  const strength = resurgenceCampStrength(state.era, rng);
  const civ = state.civilizations[civId];

  const campId = `camp-${state.idCounters.nextCampId++}`;
  const camp: BarbarianCamp = {
    id: campId,
    position: { ...chosen.coord },
    strength,
    spawnCooldown: 5,
    resurgent: true,
    ...(isBanditLord ? { banditLordName: pickBanditName(civ?.civType ?? 'generic', spawnSeed + 1) } : {}),
  };

  const updatedState: GameState = {
    ...state,
    barbarianCamps: { ...state.barbarianCamps, [campId]: camp },
    resurgentCampCooldownByCivLandmass: {
      ...(state.resurgentCampCooldownByCivLandmass ?? {}),
      [cooldownKey]: state.turn + RESURGENCE_COOLDOWN_TURNS,
    },
  };

  bus.emit('threat:barbarian-resurgence', {
    civId,
    landmassId,
    campId,
    position: chosen.coord,
    isBanditLord,
    banditLordName: camp.banditLordName,
  });

  return updatedState;
}

// ── Pirate fleet spawn ────────────────────────────────────────────────────────

const PIRATE_FLEET_THRESHOLD = 4.0;
const PIRATE_FLEET_CAP = 2;
const PIRATE_FLEET_COOLDOWN = 10;

function pirateUnitType(era: number): 'galley' | 'trireme' {
  return era >= 3 ? 'trireme' : 'galley';
}

export function processPirateSpawn(
  state: GameState,
  civId: string,
  landmassId: string,
  bus: EventBus,
): GameState {
  const cooldownKey = `${civId}:${landmassId}`;
  const cooldownUntil = state.pirateFleetCooldownByCivLandmass?.[cooldownKey] ?? 0;
  if (state.turn < cooldownUntil) return state;

  const score = computeThreatScore(state, civId, landmassId);
  if (score < PIRATE_FLEET_THRESHOLD) return state;

  // Check fleet cap for this civ+landmass
  const activeFleets = Object.values(state.pirateFleets ?? {}).filter(
    f => f.targetCivId === civId && f.landmassId === landmassId
  );
  if (activeFleets.length >= PIRATE_FLEET_CAP) return state;

  const civ = state.civilizations[civId];
  if (!civ) return state;

  // Find coastal cities on landmass
  const coastalCities = civ.cities.flatMap(cityId => {
    const city = state.cities[cityId];
    if (!city) return [];
    const tile = state.map.tiles[hexKey(city.position)];
    const isCoastal = tile?.terrain === 'coast'
      || hexNeighbors(city.position).some(nb => {
        const t = state.map.tiles[hexKey(nb)];
        return t?.terrain === 'ocean' || t?.terrain === 'coast';
      });
    const onLandmass = tile?.regionKey === landmassId;
    return isCoastal && onLandmass ? [city] : [];
  });
  if (coastalCities.length === 0) return state;

  // Find spawn tile: ocean tile adjacent to landmass coastline, ≥ 5 tiles from any city
  const cityPositions = Object.values(state.cities).map(c => c.position);
  const spawnSeed = state.turn * 73937 + civId.charCodeAt(0) * 13 + landmassId.charCodeAt(0) * 5;
  const rng = lcg(spawnSeed);

  const spawnCandidates = Object.values(state.map.tiles).filter(tile => {
    if (tile.terrain !== 'ocean') return false;
    // Must be adjacent to a land tile on the target landmass
    const nearLandmass = hexNeighbors(tile.coord).some(nb => {
      const t = state.map.tiles[hexKey(nb)];
      return t?.regionKey === landmassId;
    });
    if (!nearLandmass) return false;
    // Must be ≥ 5 tiles from any city
    for (const pos of cityPositions) {
      if (hexDistance(tile.coord, pos) < 5) return false;
    }
    return true;
  });

  if (spawnCandidates.length === 0) return state;

  const spawnTile = spawnCandidates[Math.floor(rng() * spawnCandidates.length)];

  // Pick nearest coastal city as target
  const targetCity = coastalCities.reduce((nearest, city) => {
    const d1 = hexDistance(city.position, spawnTile.coord);
    const d2 = hexDistance(nearest.position, spawnTile.coord);
    return d1 < d2 ? city : nearest;
  });

  const unitType = pirateUnitType(state.era);
  const pirateUnit = createUnit(unitType, PIRATE_OWNER, spawnTile.coord, state.idCounters);
  const fleetId = `fleet-${pirateUnit.id}`;
  const fleet: PirateFleet = {
    id: fleetId,
    unitId: pirateUnit.id,
    targetCivId: civId,
    targetCityId: targetCity.id,
    landmassId,
    era: state.era,
    plunderCooldown: 0,
  };

  const updatedState: GameState = {
    ...state,
    units: { ...state.units, [pirateUnit.id]: pirateUnit },
    pirateFleets: { ...(state.pirateFleets ?? {}), [fleetId]: fleet },
  };

  bus.emit('threat:pirate-fleet-spawned', {
    fleetId, civId, landmassId, position: spawnTile.coord,
  });

  return updatedState;
}

// ── Pirate fleet movement + plunder/siege ─────────────────────────────────────

const PLUNDER_COOLDOWN_TURNS = 3;
const ADJACENT_HEX_DIST = 2;

function movePirateTowardCity(
  state: GameState,
  unitId: string,
  targetCityId: string,
): GameState {
  const unit = state.units[unitId];
  const city = state.cities[targetCityId];
  if (!unit || !city) return state;
  if (hexDistance(unit.position, city.position) <= ADJACENT_HEX_DIST) return state;

  // BFS to find next step on ocean/coast path
  const start = hexKey(unit.position);
  const visited = new Set<string>([start]);
  const queue: Array<{ key: string; path: HexCoord[] }> = [{ key: start, path: [] }];

  while (queue.length > 0) {
    const { key, path } = queue.shift()!;
    const [q, r] = key.split(',').map(Number);
    const coord = { q, r };
    for (const nb of hexNeighbors(coord)) {
      const nbKey = hexKey(nb);
      if (visited.has(nbKey)) continue;
      visited.add(nbKey);
      const tile = state.map.tiles[nbKey];
      if (!tile) continue;
      const newPath = [...path, nb];
      if (tile.terrain === 'ocean' || tile.terrain === 'coast') {
        if (hexKey(nb) === hexKey(city.position) || hexDistance(nb, city.position) <= ADJACENT_HEX_DIST) {
          // First step is our move
          const nextPos = newPath[0] ?? nb;
          return {
            ...state,
            units: { ...state.units, [unitId]: { ...unit, position: { ...nextPos } } },
          };
        }
        queue.push({ key: nbKey, path: newPath });
      }
    }
  }
  return state;
}

export function processPirateFleets(state: GameState, bus: EventBus): GameState {
  if (!state.pirateFleets || Object.keys(state.pirateFleets).length === 0) return state;

  let nextState = state;

  for (const [fleetId, fleet] of Object.entries(nextState.pirateFleets ?? {})) {
    const unit = nextState.units[fleet.unitId];

    // Fleet unit was destroyed — clean up and set cooldown
    if (!unit) {
      const cooldownKey = `${fleet.targetCivId}:${fleet.landmassId}`;
      nextState = {
        ...nextState,
        pirateFleets: Object.fromEntries(
          Object.entries(nextState.pirateFleets ?? {}).filter(([id]) => id !== fleetId)
        ),
        pirateFleetCooldownByCivLandmass: {
          ...(nextState.pirateFleetCooldownByCivLandmass ?? {}),
          [cooldownKey]: nextState.turn + PIRATE_FLEET_COOLDOWN,
        },
      };
      bus.emit('threat:pirate-fleet-destroyed', {
        fleetId, civId: fleet.targetCivId, landmassId: fleet.landmassId,
      });
      continue;
    }

    // Retarget if city no longer valid
    let targetCity = nextState.cities[fleet.targetCityId];
    let updatedFleet = fleet;
    if (!targetCity || targetCity.owner !== fleet.targetCivId) {
      const civ = nextState.civilizations[fleet.targetCivId];
      const civCities = (civ?.cities ?? []).map(id => nextState.cities[id]).filter((c): c is City => !!c);
      const newTarget: City | undefined = civCities.reduce<City | undefined>((nearest, city) => {
        if (!nearest) return city;
        const d1 = hexDistance(city.position, unit.position);
        const d2 = hexDistance(nearest.position, unit.position);
        return d1 < d2 ? city : nearest;
      }, undefined);
      if (!newTarget) continue;
      targetCity = newTarget;
      updatedFleet = { ...updatedFleet, targetCityId: newTarget.id };
    }

    // Move toward target
    nextState = movePirateTowardCity(nextState, fleet.unitId, updatedFleet.targetCityId);
    const updatedUnit = nextState.units[fleet.unitId];
    if (!updatedUnit) continue;

    const isAdjacent = hexDistance(updatedUnit.position, targetCity.position) <= ADJACENT_HEX_DIST;

    // Plunder: once adjacent, steal gold on cooldown
    if (isAdjacent && updatedFleet.plunderCooldown === 0) {
      const targetCiv = nextState.civilizations[fleet.targetCivId];
      if (targetCiv) {
        const goldStolen = Math.floor((1 + (nextState.era - 1) * 0.5) * 5);
        nextState = {
          ...nextState,
          civilizations: {
            ...nextState.civilizations,
            [fleet.targetCivId]: { ...targetCiv, gold: Math.max(0, targetCiv.gold - goldStolen) },
          },
        };
        bus.emit('threat:pirate-plunder', { fleetId, cityId: targetCity.id, goldStolen });
        updatedFleet = { ...updatedFleet, plunderCooldown: PLUNDER_COOLDOWN_TURNS };
      }
    } else {
      updatedFleet = { ...updatedFleet, plunderCooldown: Math.max(0, updatedFleet.plunderCooldown - 1) };
    }

    // Siege (era 2+): damage city hp every turn when adjacent
    if (isAdjacent && fleet.era >= 2) {
      const hpLost = fleet.era >= 3 ? 20 : 10;
      const city = nextState.cities[fleet.targetCityId];
      if (city) {
        nextState = {
          ...nextState,
          cities: {
            ...nextState.cities,
            [fleet.targetCityId]: { ...city, hp: Math.max(0, (city.hp ?? 100) - hpLost) },
          },
        };
      }
      bus.emit('threat:pirate-siege', { fleetId, cityId: fleet.targetCityId, hpLost });
    }

    nextState = {
      ...nextState,
      pirateFleets: { ...(nextState.pirateFleets ?? {}), [fleetId]: updatedFleet },
    };
  }

  return nextState;
}

// ── Spawn-phase dispatcher ────────────────────────────────────────────────────

export function processThreatPressure(
  state: GameState,
  civId: string,
  bus: EventBus,
  options: { includeLegacyPirates?: boolean } = {},
): GameState {
  const civ = state.civilizations[civId];
  if (!civ || !civ.isHuman) return state;

  // Collect unique landmass IDs where civ has cities
  const landmassIds = new Set<string>();
  for (const cityId of civ.cities) {
    const city = state.cities[cityId];
    if (!city) continue;
    const tile = state.map.tiles[hexKey(city.position)];
    if (tile?.regionKey) landmassIds.add(tile.regionKey);
  }

  let nextState = state;
  for (const landmassId of landmassIds) {
    const score = computeThreatScore(nextState, civId, landmassId);
    if (score >= LAND_RESURGENCE_THRESHOLD) {
      nextState = processLandResurgence(nextState, civId, landmassId, bus);
    }
    if (options.includeLegacyPirates !== false && score >= PIRATE_FLEET_THRESHOLD) {
      nextState = processPirateSpawn(nextState, civId, landmassId, bus);
    }
  }

  return nextState;
}

export function recordCombatForCiv(state: GameState, civId: string, position: HexCoord): GameState {
  const civ = state.civilizations[civId];
  if (!civ) return state;

  const tile = state.map.tiles[hexKey(position)];
  let landmassId: string | null = tile?.regionKey ?? null;
  if (!landmassId) {
    landmassId = nearestLandmassId(position, state.map);
  }
  if (!landmassId) return state;

  return {
    ...state,
    civilizations: {
      ...state.civilizations,
      [civId]: {
        ...civ,
        lastCombatTurnByLandmass: {
          ...(civ.lastCombatTurnByLandmass ?? {}),
          [landmassId]: state.turn,
        },
      },
    },
  };
}
