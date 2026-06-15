import type { BarbarianCamp, GameState, GameMap, HexCoord } from '@/core/types';
import type { EventBus } from '@/core/event-bus';
import { hexKey, hexNeighbors, hexDistance } from './hex-utils';

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
  rome: ['Spartacus II', 'The Conqueror', 'Henry II', 'Richard III', 'Cromwell', 'Edward I', 'Robin Hood'],
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
    banditLordName: (camp as any).banditLordName,
  });

  return updatedState;
}

// ── Spawn-phase dispatcher ────────────────────────────────────────────────────

const PIRATE_FLEET_THRESHOLD = 4.0;

export function processThreatPressure(state: GameState, civId: string, bus: EventBus): GameState {
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
