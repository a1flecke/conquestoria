import type {
  AIStrategicPlan,
  BarbarianCamp,
  City,
  PirateFleet,
  GameState,
  GameMap,
  HexCoord,
  CivPressureLedger,
} from '@/core/types';
import type { EventBus } from '@/core/event-bus';
import { createEmptyOpponentAIState } from '@/core/opponent-ai-state';
import { getChallengeProfileForCiv } from '@/core/opponent-challenge';
import { BEAST_DEFINITIONS } from './beast-definitions';
import { hexKey, mapDistance, mapNeighbors } from './hex-utils';
import { createUnit } from './unit-system';
import { seededLcg } from './seeded-lcg';

export const PIRATE_OWNER = 'pirate';

const NON_VIABLE_TERRAIN = new Set(['ocean', 'coast', 'mountain', 'snow']);
const BARBARIAN_OPERATIONAL_RADIUS = 7;

export interface IndependentThreatDecision {
  allowed: boolean;
  reason: 'allowed' | 'migration-grace' | 'recovery' | 'pressure-cap';
  activeCount: number;
  cap: number;
}

export interface IndependentThreatSpawnCandidate {
  threatId: string;
  position: HexCoord;
  affectedHumanIds: string[];
}

export interface IndependentThreatSpawnPolicy {
  canStart(state: GameState, candidate: IndependentThreatSpawnCandidate): boolean;
}

function emptyPressureLedger(): CivPressureLedger {
  return {
    activeIndependentThreatIds: [],
    recoveryUntilTurn: 0,
    lastResolvedThreatTurn: null,
    lastWarningTurnByKey: {},
    lastStrategicAudioTurn: null,
  };
}

function threatDistance(state: GameState, a: HexCoord, b: HexCoord): number {
  return mapDistance(state.map, a, b);
}

function humanAssetPositions(state: GameState, humanId: string): HexCoord[] {
  return [
    ...Object.values(state.cities)
      .filter(city => city.owner === humanId)
      .map(city => city.position),
    ...Object.values(state.units)
      .filter(unit => unit.owner === humanId && !unit.transportId)
      .map(unit => unit.position),
    ...Object.values(state.map.tiles)
      .filter(tile =>
        tile.owner === humanId
        && tile.resource !== null
        && tile.improvement !== 'none'
        && tile.improvementTurnsLeft === 0)
      .map(tile => tile.coord),
  ];
}

export function deriveHumansMateriallyAffectedByPosition(
  state: GameState,
  position: HexCoord,
  radius: number,
): string[] {
  return Object.values(state.civilizations)
    .filter(civ => civ.isHuman && !civ.isEliminated)
    .filter(civ =>
      humanAssetPositions(state, civ.id)
        .some(asset => threatDistance(state, position, asset) <= radius))
    .map(civ => civ.id)
    .sort();
}

function planTargetOwner(state: GameState, plan: AIStrategicPlan): string | null {
  if (plan.target.kind === 'city') return state.cities[plan.target.id]?.owner ?? null;
  if (plan.target.kind === 'unit') return state.units[plan.target.id]?.owner ?? null;
  if (plan.target.kind === 'resource') {
    return state.map.tiles[hexKey(plan.target.position)]?.owner ?? null;
  }
  return null;
}

function barbarianMateriallyAffectsHuman(
  state: GameState,
  campId: string,
  humanId: string,
): boolean {
  const plan = state.opponentAI?.barbarianCamps[campId];
  if (plan && planTargetOwner(state, plan) === humanId) return true;
  if (!plan) return false;
  const assets = humanAssetPositions(state, humanId);
  return plan.assignedUnitIds.some(unitId => {
    const unit = state.units[unitId];
    return unit?.owner === 'barbarian'
      && assets.some(position =>
        threatDistance(state, unit.position, position) <= BARBARIAN_OPERATIONAL_RADIUS);
  });
}

function pirateMateriallyAffectsHuman(
  state: GameState,
  factionId: string,
  humanId: string,
): boolean {
  const faction = state.pirates?.factions[factionId];
  if (!faction) return false;
  if (faction.contract?.targetId === humanId) return true;
  if (faction.intent?.targetCivId === humanId) return true;
  if (
    faction.intent?.targetCityId
    && state.cities[faction.intent.targetCityId]?.owner === humanId
  ) return true;
  if (
    faction.intent?.targetUnitId
    && state.units[faction.intent.targetUnitId]?.owner === humanId
  ) return true;
  return Object.values(state.pirateFleets ?? {})
    .some(fleet => fleet.targetCivId === humanId && fleet.id === factionId);
}

function beastMateriallyAffectsHuman(
  state: GameState,
  lairId: string,
  humanId: string,
): boolean {
  const lair = state.beasts?.lairs[lairId];
  if (!lair || lair.status !== 'awake') return false;
  const radius = BEAST_DEFINITIONS[lair.beastId].leashRadius;
  const origins = [
    lair.position,
    ...lair.unitIds.flatMap(unitId => {
      const unit = state.units[unitId];
      return unit ? [unit.position] : [];
    }),
  ];
  return humanAssetPositions(state, humanId)
    .some(asset => origins.some(origin => threatDistance(state, origin, asset) <= radius));
}

function isIndependentThreatLive(state: GameState, threatId: string): boolean {
  if (threatId.startsWith('barbarian:')) {
    return Boolean(state.barbarianCamps[threatId.slice('barbarian:'.length)]);
  }
  if (threatId.startsWith('pirate:')) {
    return Boolean(state.pirates?.factions[threatId.slice('pirate:'.length)]);
  }
  if (threatId.startsWith('beast:')) {
    return state.beasts?.lairs[threatId.slice('beast:'.length)]?.status === 'awake';
  }
  return false;
}

export function deriveActiveIndependentThreatIds(
  state: GameState,
  humanId: string,
): string[] {
  const human = state.civilizations[humanId];
  if (!human?.isHuman || human.isEliminated) return [];
  const active = new Set<string>();
  for (const campId of Object.keys(state.barbarianCamps).sort()) {
    if (barbarianMateriallyAffectsHuman(state, campId, humanId)) {
      active.add(`barbarian:${campId}`);
    }
  }
  for (const factionId of Object.keys(state.pirates?.factions ?? {}).sort()) {
    if (pirateMateriallyAffectsHuman(state, factionId, humanId)) {
      active.add(`pirate:${factionId}`);
    }
  }
  for (const lairId of Object.keys(state.beasts?.lairs ?? {}).sort()) {
    if (beastMateriallyAffectsHuman(state, lairId, humanId)) {
      active.add(`beast:${lairId}`);
    }
  }
  for (
    const threatId of state.opponentAI?.pressureByCiv[humanId]
      ?.activeIndependentThreatIds ?? []
  ) {
    if (isIndependentThreatLive(state, threatId)) active.add(threatId);
  }
  return [...active].sort();
}

export function canStartIndependentThreat(
  state: GameState,
  humanId: string,
  threatId: string,
): IndependentThreatDecision {
  const profile = getChallengeProfileForCiv(state, humanId);
  const ledger = state.opponentAI?.pressureByCiv[humanId] ?? emptyPressureLedger();
  const activeCount = ledger.activeIndependentThreatIds.length;
  const base = { activeCount, cap: profile.maxIndependentCrisesPerHuman };
  if (ledger.activeIndependentThreatIds.includes(threatId)) {
    return { ...base, allowed: true, reason: 'allowed' };
  }
  if ((state.opponentAI?.migrationGraceRoundsRemaining ?? 0) > 0) {
    return { ...base, allowed: false, reason: 'migration-grace' };
  }
  if (state.turn < ledger.recoveryUntilTurn) {
    return { ...base, allowed: false, reason: 'recovery' };
  }
  if (activeCount >= profile.maxIndependentCrisesPerHuman) {
    return { ...base, allowed: false, reason: 'pressure-cap' };
  }
  return { ...base, allowed: true, reason: 'allowed' };
}

export function reserveIndependentThreatForHumans(
  state: GameState,
  threatId: string,
  humanIds: string[],
): GameState {
  if (!state.opponentAI) return state;
  const pressureByCiv = { ...state.opponentAI.pressureByCiv };
  let changed = false;
  for (const humanId of [...new Set(humanIds)].sort()) {
    const civ = state.civilizations[humanId];
    if (!civ?.isHuman || civ.isEliminated) continue;
    const ledger = pressureByCiv[humanId] ?? emptyPressureLedger();
    if (ledger.activeIndependentThreatIds.includes(threatId)) continue;
    changed = true;
    pressureByCiv[humanId] = {
      ...ledger,
      activeIndependentThreatIds: [
        ...ledger.activeIndependentThreatIds,
        threatId,
      ].sort(),
    };
  }
  return changed ? {
    ...state,
    opponentAI: { ...state.opponentAI, pressureByCiv },
  } : state;
}

export function processIndependentThreatPressureForHumans(
  state: GameState,
  bus: EventBus,
): GameState {
  const initialOpponentAI = structuredClone(state.opponentAI ?? createEmptyOpponentAIState());
  const humanIds = Object.values(state.civilizations)
    .filter(civ => civ.isHuman && !civ.isEliminated)
    .map(civ => civ.id)
    .sort();
  initialOpponentAI.pressureByCiv = Object.fromEntries(humanIds.map(humanId => [
    humanId,
    initialOpponentAI.pressureByCiv[humanId] ?? emptyPressureLedger(),
  ]));
  const pressureByCiv: Record<string, CivPressureLedger> = {};
  for (const humanId of humanIds) {
    const profile = getChallengeProfileForCiv(state, humanId);
    const previous = initialOpponentAI.pressureByCiv[humanId] ?? emptyPressureLedger();
    const activeIndependentThreatIds = deriveActiveIndependentThreatIds(state, humanId);
    const resolved = previous.activeIndependentThreatIds
      .filter(threatId => !activeIndependentThreatIds.includes(threatId));
    pressureByCiv[humanId] = {
      ...previous,
      activeIndependentThreatIds,
      ...(resolved.length > 0 ? {
        recoveryUntilTurn: state.turn + profile.recoveryRounds,
        lastResolvedThreatTurn: state.turn,
      } : {}),
    };
  }
  initialOpponentAI.pressureByCiv = pressureByCiv;
  let nextState: GameState = { ...state, opponentAI: initialOpponentAI };
  const spawnPolicy: IndependentThreatSpawnPolicy = {
    canStart: (candidateState, candidate) =>
      candidate.affectedHumanIds.every(humanId =>
        canStartIndependentThreat(candidateState, humanId, candidate.threatId).allowed),
  };
  for (const humanId of humanIds) {
    const landmassIds = [...new Set(
      nextState.civilizations[humanId].cities.flatMap(cityId => {
        const city = nextState.cities[cityId];
        const regionKey = city
          ? nextState.map.tiles[hexKey(city.position)]?.regionKey
          : undefined;
        return regionKey ? [regionKey] : [];
      }),
    )].sort();
    for (const landmassId of landmassIds) {
      let candidate: IndependentThreatSpawnCandidate | null = null;
      const previousCounter = nextState.idCounters.nextCampId;
      const spawned = processLandResurgence(nextState, humanId, landmassId, bus, {
        spawnPolicy: {
          canStart: (candidateState, nextCandidate) => {
            candidate = nextCandidate;
            return spawnPolicy.canStart(candidateState, nextCandidate);
          },
        },
      });
      if (spawned.idCounters.nextCampId === previousCounter || !candidate) continue;
      const accepted = candidate as IndependentThreatSpawnCandidate;
      nextState = reserveIndependentThreatForHumans(
        spawned,
        accepted.threatId,
        accepted.affectedHumanIds,
      );
    }
  }

  return nextState;
}

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
      for (const nb of mapNeighbors(map, coord)) {
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

export function pickBanditName(civType: string, seed: number): string {
  const pool = BANDIT_LORD_NAMES[civType] ?? BANDIT_LORD_NAMES['generic'];
  const rng = seededLcg(seed);
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
  options: { spawnPolicy?: IndependentThreatSpawnPolicy } = {},
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
  const rng = seededLcg(spawnSeed);

  const candidates = landmassTiles.filter(tile => {
    if (NON_VIABLE_TERRAIN.has(tile.terrain)) return false;
    if (state.barbarianCamps[hexKey(tile.coord)]) return false;
    // Must be far from cities and existing camps
    for (const pos of cityPositions) {
      if (mapDistance(state.map, tile.coord, pos) < 4) return false;
    }
    for (const camp of allCamps) {
      if (mapDistance(state.map, tile.coord, camp.position) < 3) return false;
    }
    return true;
  });

  if (candidates.length === 0) return state;

  const chosen = candidates[Math.floor(rng() * candidates.length)];
  const isBanditLord = score >= BANDIT_LORD_THRESHOLD;
  const strength = resurgenceCampStrength(state.era, rng);
  const civ = state.civilizations[civId];

  const campId = `camp-${state.idCounters.nextCampId}`;
  const affectedHumanIds = [...new Set([
    civId,
    ...deriveHumansMateriallyAffectedByPosition(
      state,
      chosen.coord,
      BARBARIAN_OPERATIONAL_RADIUS,
    ),
  ])].sort();
  if (options.spawnPolicy && !options.spawnPolicy.canStart(state, {
    threatId: `barbarian:${campId}`,
    position: { ...chosen.coord },
    affectedHumanIds,
  })) {
    return state;
  }
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
    idCounters: { ...state.idCounters, nextCampId: state.idCounters.nextCampId + 1 },
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

function findPirateSpawnTile(state: GameState, landmassId: string): HexCoord | null {
  const cityPositions = Object.values(state.cities).map(c => c.position);
  const candidates = Object.values(state.map.tiles).filter(tile => {
    if (tile.terrain !== 'ocean') return false;
    // Must be adjacent to a land tile on the target landmass
    const nearLandmass = mapNeighbors(state.map, tile.coord).some(nb => {
      const t = state.map.tiles[hexKey(nb)];
      return t?.regionKey === landmassId;
    });
    if (!nearLandmass) return false;
    // Must be ≥ 5 tiles from any city
    for (const pos of cityPositions) {
      if (mapDistance(state.map, tile.coord, pos) < 5) return false;
    }
    return true;
  });
  return candidates.length > 0 ? candidates[0].coord : null;
}

// Core fleet-creation shared by the organic (threshold-gated) spawn below and any
// forced spawn (e.g. a Hunt crisis's corsair-armada flavor) — no threshold/cooldown
// checks here; callers are responsible for those. `targetCity` is whichever coastal
// city the caller has already chosen as the fleet's raid target.
export function createPirateFleetNear(
  state: GameState,
  civId: string,
  landmassId: string,
  targetCity: City,
  seed: number,
): { state: GameState; fleetId: string | null } {
  const cityPositions = Object.values(state.cities).map(c => c.position);
  const rng = seededLcg(seed);

  const spawnCandidates = Object.values(state.map.tiles).filter(tile => {
    if (tile.terrain !== 'ocean') return false;
    const nearLandmass = mapNeighbors(state.map, tile.coord).some(nb => {
      const t = state.map.tiles[hexKey(nb)];
      return t?.regionKey === landmassId;
    });
    if (!nearLandmass) return false;
    for (const pos of cityPositions) {
      if (mapDistance(state.map, tile.coord, pos) < 5) return false;
    }
    return true;
  });

  if (spawnCandidates.length === 0) return { state, fleetId: null };

  const spawnTile = spawnCandidates[Math.floor(rng() * spawnCandidates.length)];

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

  return { state: updatedState, fleetId };
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
      || mapNeighbors(state.map, city.position).some(nb => {
        const t = state.map.tiles[hexKey(nb)];
        return t?.terrain === 'ocean' || t?.terrain === 'coast';
      });
    const onLandmass = tile?.regionKey === landmassId;
    return isCoastal && onLandmass ? [city] : [];
  });
  if (coastalCities.length === 0) return state;

  // Find spawn tile: ocean tile adjacent to landmass coastline, ≥ 5 tiles from any city.
  // Target-city selection depends on it (nearest coastal city to the spawn point), so
  // probe with a lightweight lookup before delegating fleet creation to the shared helper.
  const spawnTile = findPirateSpawnTile(state, landmassId);
  if (!spawnTile) return state;

  const targetCity = coastalCities.reduce((nearest, city) => {
    const d1 = mapDistance(state.map, city.position, spawnTile);
    const d2 = mapDistance(state.map, nearest.position, spawnTile);
    return d1 < d2 ? city : nearest;
  });

  const spawnSeed = state.turn * 73937 + civId.charCodeAt(0) * 13 + landmassId.charCodeAt(0) * 5;
  const { state: updatedState, fleetId } = createPirateFleetNear(state, civId, landmassId, targetCity, spawnSeed);
  if (!fleetId) return state;

  bus.emit('threat:pirate-fleet-spawned', {
    fleetId, civId, landmassId, position: spawnTile,
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
  if (mapDistance(state.map, unit.position, city.position) <= ADJACENT_HEX_DIST) return state;

  // BFS to find next step on ocean/coast path
  const start = hexKey(unit.position);
  const visited = new Set<string>([start]);
  const queue: Array<{ key: string; path: HexCoord[] }> = [{ key: start, path: [] }];

  while (queue.length > 0) {
    const { key, path } = queue.shift()!;
    const [q, r] = key.split(',').map(Number);
    const coord = { q, r };
    for (const nb of mapNeighbors(state.map, coord)) {
      const nbKey = hexKey(nb);
      if (visited.has(nbKey)) continue;
      visited.add(nbKey);
      const tile = state.map.tiles[nbKey];
      if (!tile) continue;
      const newPath = [...path, nb];
      if (tile.terrain === 'ocean' || tile.terrain === 'coast') {
        if (hexKey(nb) === hexKey(city.position) || mapDistance(state.map, nb, city.position) <= ADJACENT_HEX_DIST) {
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
        const d1 = mapDistance(nextState.map, city.position, unit.position);
        const d2 = mapDistance(nextState.map, nearest.position, unit.position);
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

    const isAdjacent = mapDistance(nextState.map, updatedUnit.position, targetCity.position) <= ADJACENT_HEX_DIST;

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
