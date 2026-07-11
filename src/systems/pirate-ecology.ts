import type { EventBus } from '@/core/event-bus';
import type { GameState, HexCoord, Unit } from '@/core/types';
import {
  createEmptyPirateState,
  type PirateFactionId,
  type PirateFactionState,
  type PirateMaritimeStage,
} from '@/core/pirate-state';
import { isValidStartTile } from './map-validation';
import {
  getWrappedHexesInRange,
  getWrappedHexNeighbors,
  hexDistance,
  hexKey,
  hexNeighbors,
  hexesInRange,
  parseHexKey,
  wrapHexCoord,
  wrappedHexDistance,
} from './hex-utils';
import {
  deriveHumansMateriallyAffectedByPosition,
  reserveIndependentThreatForHumans,
  type IndependentThreatSpawnPolicy,
} from './threat-pressure-system';
import { calculateProjectedCityYields } from './city-work-system';
import { resolveCivDefinition } from './civ-registry';
import { createRng } from './map-generator';
import { createUnit, UNIT_DEFINITIONS } from './unit-system';
import {
  PIRATE_FACTION_CAP_BY_MAP_SIZE,
  PIRATE_HULL_TYPES,
  PIRATE_MAX_FLOTILLA_FACTIONS,
  PIRATE_PRESSURE,
  composePirateFleet,
  type PirateHullType,
} from './pirate-definitions';

export type PirateHabitat = 'coastal-enclave' | 'deep-sea-flotilla';

export interface PirateHabitatCandidate {
  kind: PirateHabitat;
  position: HexCoord;
  score: number;
  covertOwnerId?: string;
}

export interface PirateSpawnPlan {
  habitat: PirateHabitat;
  position: HexCoord;
  stage: PirateMaritimeStage;
  fleet: PirateHullType[];
  unitPositions: HexCoord[];
  covertOwnerId?: string;
}

const PIRATE_NAMES = [
  'The Red Wake',
  'The Black Current',
  'The Salt Knives',
  'The Broken Compass',
  'The Ashen Fleet',
  'The Last Horizon',
  'The Iron Tide',
  'The Freewater Company',
] as const;

function distance(state: GameState, a: HexCoord, b: HexCoord): number {
  return state.map.wrapsHorizontally
    ? wrappedHexDistance(a, b, state.map.width)
    : hexDistance(a, b);
}

function neighbors(state: GameState, coord: HexCoord): HexCoord[] {
  return state.map.wrapsHorizontally
    ? getWrappedHexNeighbors(coord, state.map.width)
    : hexNeighbors(coord);
}

function range(state: GameState, coord: HexCoord, radius: number): HexCoord[] {
  return state.map.wrapsHorizontally
    ? getWrappedHexesInRange(coord, radius, state.map.width)
    : hexesInRange(coord, radius);
}

function canonicalCoord(state: GameState, coord: HexCoord): HexCoord {
  return state.map.wrapsHorizontally ? wrapHexCoord(coord, state.map.width) : coord;
}

function isWaterTerrain(terrain: string): boolean {
  return terrain === 'coast' || terrain === 'ocean';
}

function isCoastalPosition(state: GameState, position: HexCoord): boolean {
  return neighbors(state, position).some(coord => {
    const tile = state.map.tiles[hexKey(coord)];
    return tile ? isWaterTerrain(tile.terrain) : false;
  });
}

function isMajorCombatUnit(state: GameState, unit: Unit): boolean {
  return Boolean(state.civilizations[unit.owner]) && UNIT_DEFINITIONS[unit.type].strength > 0;
}

function hasMajorCombatUnitWithin(state: GameState, position: HexCoord, radius: number): boolean {
  return Object.values(state.units).some(unit =>
    !unit.transportId && isMajorCombatUnit(state, unit) && distance(state, unit.position, position) <= radius,
  );
}

function hasMajorCombatUnitNearby(state: GameState, position: HexCoord): boolean {
  return hasMajorCombatUnitWithin(state, position, 4);
}

function getHeadquartersPositions(state: GameState): HexCoord[] {
  return Object.values(state.pirates?.factions ?? {}).flatMap(faction => {
    if (faction.headquarters.kind === 'coastal-enclave') return [faction.headquarters.position];
    const flagship = state.units[faction.headquarters.flagshipUnitId];
    return flagship ? [flagship.position] : [];
  });
}

function nearestDistance(state: GameState, position: HexCoord, positions: HexCoord[], fallback = 12): number {
  if (positions.length === 0) return fallback;
  return Math.min(...positions.map(other => distance(state, position, other)));
}

function suppressionPenalty(state: GameState, position: HexCoord): number {
  return (state.pirates?.pressure.suppression ?? [])
    .filter(record => record.expiresAfterRound > state.turn)
    .filter(record => distance(state, position, parseHexKey(record.regionKey)) <= 8)
    .reduce((sum, record) => sum + record.amount, 0);
}

function sortCandidates(candidates: PirateHabitatCandidate[]): PirateHabitatCandidate[] {
  return candidates.sort((a, b) =>
    b.score - a.score || a.position.q - b.position.q || a.position.r - b.position.r,
  );
}

export function getPirateMaritimeStage(state: GameState): PirateMaritimeStage {
  const completed = new Set(Object.values(state.civilizations).flatMap(civ => civ.techState.completed));
  if (completed.has('amphibious-warfare')) return 5;
  if (completed.has('caravels')) return 4;
  if (completed.has('triremes')) return 3;
  if (completed.has('navigation')) return 2;
  return 1;
}

export function calculatePiratePressureGain(state: GameState, stage: PirateMaritimeStage): number {
  const coastalCityIds = new Set(
    Object.values(state.cities)
      .filter(city => Boolean(state.civilizations[city.owner]) && isCoastalPosition(state, city.position))
      .map(city => city.id),
  );
  const coastalRouteCount = (state.marketplace?.tradeRoutes ?? []).filter(route =>
    coastalCityIds.has(route.fromCityId) || coastalCityIds.has(route.toCityId),
  ).length;
  const wealthyCoastalCityCount = [...coastalCityIds].filter(cityId => {
    const city = state.cities[cityId];
    const civ = city ? state.civilizations[city.owner] : undefined;
    if (!city || !civ) return false;
    const civDefinition = resolveCivDefinition(state, civ.civType ?? '');
    return calculateProjectedCityYields(state, cityId, civDefinition?.bonusEffect).gold
      >= PIRATE_PRESSURE.wealthyGrossGold;
  }).length;
  return PIRATE_PRESSURE.baseGain
    + (stage - 1)
    + Math.min(PIRATE_PRESSURE.tradeRouteGainCap, coastalRouteCount)
    + Math.min(PIRATE_PRESSURE.wealthyCityGainCap, wealthyCoastalCityCount);
}

export function getCoastalEnclaveCandidates(state: GameState): PirateHabitatCandidate[] {
  const cityPositions = Object.values(state.cities).map(city => city.position);
  const headquartersPositions = getHeadquartersPositions(state);
  const headquartersKeys = new Set(headquartersPositions.map(position => hexKey(canonicalCoord(state, position))));
  const occupied = new Set(Object.values(state.units).filter(unit => !unit.transportId).map(unit => hexKey(canonicalCoord(state, unit.position))));
  const candidates: PirateHabitatCandidate[] = [];

  for (const tile of Object.values(state.map.tiles)) {
    if (
      !isValidStartTile(tile)
      || occupied.has(hexKey(tile.coord))
      || headquartersKeys.has(hexKey(tile.coord))
      || !isCoastalPosition(state, tile.coord)
    ) continue;
    const cityDistance = nearestDistance(state, tile.coord, cityPositions);
    if (cityDistance <= 4) continue;

    let covertOwnerId: string | undefined;
    if (tile.owner !== null) {
      const owner = state.civilizations[tile.owner];
      if (!owner || owner.visibility.tiles[hexKey(tile.coord)] === 'visible') continue;
      if (hasMajorCombatUnitWithin(state, tile.coord, 3)) continue;
      covertOwnerId = tile.owner;
    }

    const headquartersDistance = nearestDistance(state, tile.coord, headquartersPositions);
    const score = Math.max(1,
      10
      + Math.min(12, cityDistance)
      + Math.min(12, headquartersDistance)
      + (tile.owner === null ? 5 : 0)
      + (hasMajorCombatUnitNearby(state, tile.coord) ? 0 : 4)
      - suppressionPenalty(state, tile.coord),
    );
    candidates.push({
      kind: 'coastal-enclave',
      position: { ...tile.coord },
      score,
      ...(covertOwnerId ? { covertOwnerId } : {}),
    });
  }
  return sortCandidates(candidates);
}

export function getFlotillaCandidates(state: GameState): PirateHabitatCandidate[] {
  const cityPositions = Object.values(state.cities).map(city => city.position);
  const headquartersPositions = getHeadquartersPositions(state);
  const occupied = new Set(Object.values(state.units).filter(unit => !unit.transportId).map(unit => hexKey(canonicalCoord(state, unit.position))));
  const candidates: PirateHabitatCandidate[] = [];

  for (const tile of Object.values(state.map.tiles)) {
    if (tile.terrain !== 'ocean' || occupied.has(hexKey(tile.coord))) continue;
    const cityDistance = nearestDistance(state, tile.coord, cityPositions);
    const headquartersDistance = nearestDistance(state, tile.coord, headquartersPositions);
    if (cityDistance < 5 || headquartersDistance < 8) continue;
    if (hasMajorCombatUnitWithin(state, tile.coord, 4)) continue;
    candidates.push({
      kind: 'deep-sea-flotilla',
      position: { ...tile.coord },
      score: Math.max(1,
        10
        + Math.min(12, cityDistance)
        + Math.min(12, headquartersDistance)
        - suppressionPenalty(state, tile.coord),
      ),
    });
  }
  return sortCandidates(candidates);
}

function getSpawnWaterPositions(
  state: GameState,
  candidate: PirateHabitatCandidate,
  count: number,
): HexCoord[] {
  const occupied = new Set(Object.values(state.units).filter(unit => !unit.transportId).map(unit => hexKey(canonicalCoord(state, unit.position))));
  const positions: HexCoord[] = [];
  if (candidate.kind === 'deep-sea-flotilla') positions.push(candidate.position);
  const available = range(state, candidate.position, 2)
    .filter(coord => hexKey(coord) !== hexKey(candidate.position))
    .filter(coord => {
      const tile = state.map.tiles[hexKey(coord)];
      if (!tile || occupied.has(hexKey(coord))) return false;
      return candidate.kind === 'deep-sea-flotilla' ? tile.terrain === 'ocean' : isWaterTerrain(tile.terrain);
    })
    .sort((a, b) => distance(state, a, candidate.position) - distance(state, b, candidate.position)
      || a.q - b.q || a.r - b.r);
  for (const position of available) {
    if (positions.length >= count) break;
    positions.push(position);
  }
  return positions;
}

function chooseWeightedCandidate(candidates: PirateHabitatCandidate[], rng: () => number): PirateHabitatCandidate {
  const total = candidates.reduce((sum, candidate) => sum + candidate.score, 0);
  let draw = rng() * total;
  for (const candidate of candidates) {
    draw -= candidate.score;
    if (draw < 0) return candidate;
  }
  return candidates[candidates.length - 1];
}

export function choosePirateSpawn(state: GameState, seed: string): PirateSpawnPlan | null {
  const factions = Object.values(state.pirates?.factions ?? {});
  if (factions.length >= PIRATE_FACTION_CAP_BY_MAP_SIZE[state.settings.mapSize]) return null;
  const stage = getPirateMaritimeStage(state);
  const fleet = composePirateFleet(stage, 'patrolling', `${seed}:fleet`);
  const enclaves = getCoastalEnclaveCandidates(state)
    .filter(candidate => getSpawnWaterPositions(state, candidate, fleet.length).length === fleet.length);
  const flotillaCount = factions.filter(faction => faction.headquarters.kind === 'deep-sea-flotilla').length;
  const flotillas = stage >= 2 && flotillaCount < PIRATE_MAX_FLOTILLA_FACTIONS
    ? getFlotillaCandidates(state).filter(candidate => getSpawnWaterPositions(state, candidate, fleet.length).length === fleet.length)
    : [];
  if (enclaves.length === 0 && flotillas.length === 0) return null;

  const rng = createRng(`pirate-habitat:${seed}`);
  const enclaveWeight = enclaves.length > 0 ? 3 : 0;
  const flotillaWeight = flotillas.length > 0 ? 2 : 0;
  const chooseEnclave = rng() * (enclaveWeight + flotillaWeight) < enclaveWeight;
  const pool = chooseEnclave ? enclaves : flotillas;
  const candidate = chooseWeightedCandidate(pool, rng);
  return {
    habitat: candidate.kind,
    position: candidate.position,
    stage,
    fleet,
    unitPositions: getSpawnWaterPositions(state, candidate, fleet.length),
    ...(candidate.covertOwnerId ? { covertOwnerId: candidate.covertOwnerId } : {}),
  };
}

export function applyRegionalSuppression(
  state: GameState,
  center: HexCoord,
  destroyedTurn: number,
): GameState {
  const pirates = state.pirates ?? createEmptyPirateState();
  const canonical = canonicalCoord(state, center);
  const regionKey = hexKey(canonical);
  const record = { regionKey, amount: 8, expiresAfterRound: destroyedTurn + 8 };
  return {
    ...state,
    pirates: {
      ...pirates,
      pressure: {
        ...pirates.pressure,
        suppression: [
          ...pirates.pressure.suppression.filter(existing => existing.regionKey !== regionKey && existing.expiresAfterRound > state.turn),
          record,
        ],
      },
    },
  };
}

function allocatePirateName(state: GameState, factionId: PirateFactionId, seed: string): string {
  const number = Number(factionId.slice('pirate-'.length));
  const rng = createRng(`pirate-name:${seed}`);
  const start = (number - 1 + Math.floor(rng() * PIRATE_NAMES.length)) % PIRATE_NAMES.length;
  const activeNames = new Set(Object.values(state.pirates?.factions ?? {}).map(faction => faction.name));
  for (let offset = 0; offset < PIRATE_NAMES.length; offset++) {
    const name = PIRATE_NAMES[(start + offset) % PIRATE_NAMES.length];
    if (!activeNames.has(name)) return name;
  }
  return `${PIRATE_NAMES[start]} ${number}`;
}

function isSpawnPlanStillLegal(state: GameState, plan: PirateSpawnPlan): boolean {
  const factions = Object.values(state.pirates?.factions ?? {});
  if (factions.length >= PIRATE_FACTION_CAP_BY_MAP_SIZE[state.settings.mapSize]) return false;
  if (
    plan.stage !== getPirateMaritimeStage(state)
    || plan.fleet.length === 0
    || plan.unitPositions.length !== plan.fleet.length
    || plan.fleet.some(type => !PIRATE_HULL_TYPES.includes(type))
  ) return false;
  if (new Set(plan.unitPositions.map(position => hexKey(canonicalCoord(state, position)))).size !== plan.unitPositions.length) {
    return false;
  }
  if (
    plan.habitat === 'deep-sea-flotilla'
    && factions.filter(faction => faction.headquarters.kind === 'deep-sea-flotilla').length >= PIRATE_MAX_FLOTILLA_FACTIONS
  ) return false;

  const candidates = plan.habitat === 'coastal-enclave'
    ? getCoastalEnclaveCandidates(state)
    : getFlotillaCandidates(state);
  const headquartersPosition = canonicalCoord(state, plan.position);
  if (!candidates.some(candidate => hexKey(candidate.position) === hexKey(headquartersPosition))) return false;

  const occupied = new Set(Object.values(state.units)
    .filter(unit => !unit.transportId)
    .map(unit => hexKey(canonicalCoord(state, unit.position))));
  return plan.unitPositions.every(position => {
    const canonical = canonicalCoord(state, position);
    const tile = state.map.tiles[hexKey(canonical)];
    if (!tile || occupied.has(hexKey(canonical))) return false;
    return plan.habitat === 'deep-sea-flotilla' ? tile.terrain === 'ocean' : isWaterTerrain(tile.terrain);
  });
}

export function spawnPirateFaction(
  state: GameState,
  plan: PirateSpawnPlan,
  bus: EventBus,
  seed = `${state.gameId}:${state.turn}`,
): GameState {
  if (!isSpawnPlanStillLegal(state, plan)) return state;
  const headquartersPosition = canonicalCoord(state, plan.position);
  const unitPositions = plan.unitPositions.map(position => canonicalCoord(state, position));
  const idCounters = { ...state.idCounters };
  const factionNumber = idCounters.nextPirateFactionId ?? 1;
  idCounters.nextPirateFactionId = factionNumber + 1;
  const factionId = `pirate-${factionNumber}` as PirateFactionId;
  const units = { ...state.units };
  const createdUnits = plan.fleet.map((type, index) => {
    const unit = createUnit(type, factionId, unitPositions[index], idCounters);
    units[unit.id] = unit;
    return unit;
  });
  const factionName = allocatePirateName(state, factionId, seed);
  const faction: PirateFactionState = {
    id: factionId,
    name: factionName,
    spawnedRound: state.turn,
    behavior: 'patrolling',
    maritimeStage: plan.stage,
    notoriety: 0,
    shipIds: createdUnits.map(unit => unit.id),
    headquarters: plan.habitat === 'coastal-enclave'
      ? { kind: 'coastal-enclave', position: headquartersPosition, integrity: 100, maxIntegrity: 100 }
      : {
          kind: 'deep-sea-flotilla',
          flagshipUnitId: createdUnits[0].id,
          relocation: { planned: null, lastRelocatedRound: null },
        },
    tributeByCiv: {},
    demandByCiv: {},
    contract: null,
    intent: null,
    transitionGuards: { emittedEventKeys: [] },
    blockadeStreakByCity: {},
  };
  const pirates = state.pirates ?? createEmptyPirateState();
  const covertOwnerId = plan.habitat === 'coastal-enclave'
    ? getCoastalEnclaveCandidates(state).find(candidate =>
        hexKey(canonicalCoord(state, candidate.position)) === hexKey(headquartersPosition))?.covertOwnerId
    : undefined;
  let intelByCiv = pirates.intelByCiv;
  if (covertOwnerId && state.civilizations[covertOwnerId]) {
    const possibleCenters = neighbors(state, headquartersPosition)
      .map(position => canonicalCoord(state, position))
      .filter(position => Boolean(state.map.tiles[hexKey(position)]));
    const rng = createRng(`pirate-rumor:${seed}:${covertOwnerId}:${factionId}`);
    const center = possibleCenters[Math.floor(rng() * possibleCenters.length)] ?? headquartersPosition;
    intelByCiv = {
      ...pirates.intelByCiv,
      [covertOwnerId]: {
        ...(pirates.intelByCiv[covertOwnerId] ?? {}),
        [factionId]: {
          factionId,
          level: 'rumor',
          discoveredRound: state.turn,
          lastUpdatedRound: state.turn,
          approximateRegion: { center, radius: 4 },
        },
      },
    };
  }
  const nextState: GameState = {
    ...state,
    units,
    idCounters,
    pirates: { ...pirates, factions: { ...pirates.factions, [factionId]: faction }, intelByCiv },
  };
  for (const unit of createdUnits) bus.emit('unit:created', { unit });
  bus.emit('pirate:faction-spawned', {
    factionId,
    factionName,
    headquartersKind: faction.headquarters.kind,
    position: headquartersPosition,
    maritimeStage: plan.stage,
  });
  return nextState;
}

function hasPirateActivationTech(state: GameState): boolean {
  return Object.values(state.civilizations).some(civ => civ.techState.completed.includes('galleys'));
}

export function processPirateEcology(
  state: GameState,
  bus: EventBus,
  seed: string,
  options: { spawnPolicy?: IndependentThreatSpawnPolicy } = {},
): GameState {
  if (!hasPirateActivationTech(state)) return state;
  const pirates = state.pirates ?? createEmptyPirateState();
  if (pirates.activatedTurn === null) {
    return {
      ...state,
      pirates: {
        ...pirates,
        activatedTurn: state.turn,
        nextSpawnCheckTurn: state.turn + PIRATE_PRESSURE.checkInterval,
        pressure: { ...pirates.pressure, value: PIRATE_PRESSURE.activationSeed },
      },
    };
  }
  if (state.turn < pirates.nextSpawnCheckTurn) return state;

  const stage = getPirateMaritimeStage(state);
  const pressureValue = Math.min(
    PIRATE_PRESSURE.cap,
    pirates.pressure.value + calculatePiratePressureGain(state, stage),
  );
  let nextState: GameState = {
    ...state,
    pirates: {
      ...pirates,
      nextSpawnCheckTurn: state.turn + PIRATE_PRESSURE.checkInterval,
      pressure: {
        value: pressureValue,
        suppression: pirates.pressure.suppression.filter(record => record.expiresAfterRound > state.turn),
      },
    },
  };
  if (pressureValue < PIRATE_PRESSURE.threshold) return nextState;
  const plan = choosePirateSpawn(nextState, `${seed}:${state.turn}`);
  if (!plan) return nextState;
  const pendingFactionId = `pirate-${nextState.idCounters.nextPirateFactionId ?? 1}`;
  const affectedHumanIds = deriveHumansMateriallyAffectedByPosition(
    nextState,
    plan.position,
    20,
  );
  if (
    affectedHumanIds.length > 0
    && options.spawnPolicy
    && !options.spawnPolicy.canStart(nextState, {
      threatId: `pirate:${pendingFactionId}`,
      position: { ...plan.position },
      affectedHumanIds,
    })
  ) {
    return nextState;
  }
  nextState = spawnPirateFaction(nextState, plan, bus, `${seed}:${state.turn}`);
  if (options.spawnPolicy && affectedHumanIds.length > 0) {
    nextState = reserveIndependentThreatForHumans(
      nextState,
      `pirate:${pendingFactionId}`,
      affectedHumanIds,
    );
  }
  return {
    ...nextState,
    pirates: {
      ...nextState.pirates!,
      pressure: {
        ...nextState.pirates!.pressure,
        value: pressureValue - PIRATE_PRESSURE.threshold,
      },
    },
  };
}
