import type { CombatResult, GameState, HexCoord, Unit, UnitType } from '@/core/types';
import type {
  PirateFactionId,
  PirateIntentState,
  PirateRelocationPlan,
} from '@/core/pirate-state';
import { PIRATE_RELOCATION_DIRECTIONS } from '@/core/pirate-state';
import {
  OPPONENT_CHALLENGE_PROFILES,
  resolveOpponentChallenge,
} from '@/core/opponent-challenge';
import { isAlwaysHostilePair } from '@/core/owner-kind';
import {
  getWrappedHexNeighbors,
  hexDistance,
  hexKey,
  hexNeighbors,
  wrapHexCoord,
  wrappedHexDistance,
} from './hex-utils';
import { createRng } from './map-generator';
import { PIRATE_PLUNDER_CAP } from './pirate-definitions';
import { findPath, getMovementStepCost, moveUnit, UNIT_DEFINITIONS } from './unit-system';

export type PirateIntent = PirateIntentState;

export interface PirateTransportKillFact {
  factionId: PirateFactionId;
  victimCivId: string;
  unitId: string;
}

export interface PirateRoundFacts {
  movements: PirateMovementFact[];
  attacks: CombatResult[];
  transportKills: PirateTransportKillFact[];
  attackPresentations?: Array<{
    visibleToViewerIds: string[];
    attackerType: UnitType;
    defenderType: UnitType;
    attackerOwnerId: string;
    defenderOwnerId: string;
  }>;
}

export interface PirateRaid {
  factionId: PirateFactionId;
  victimCivId: string;
  amount: number;
  cityId?: string;
  transportUnitId?: string;
}

export interface PirateBlockade {
  factionId: PirateFactionId;
  cityId: string;
  victimCivId: string;
}

export interface PirateMovementFact {
  unitId: string;
  from: HexCoord;
  to: HexCoord;
  path: HexCoord[];
  presentationByViewer?: Record<string, {
    unit: Unit;
    visibleSegments: HexCoord[][];
  }>;
}

export interface PirateMutationResult {
  state: GameState;
  facts: {
    movements: PirateMovementFact[];
    relocation: {
      factionId: PirateFactionId;
      status: 'not-due' | 'moved' | 'cancelled';
      reason?: 'missing-faction' | 'not-flotilla' | 'flagship-missing' | 'attacked' | 'hostile-adjacent' | 'invalid-path' | 'placement-failed';
    };
  };
}

export const PIRATE_BEHAVIOR_SEARCH_LIMITS = {
  radius: 20,
  units: 24,
  cities: 12,
} as const;

const DIRECTION_DELTAS = [
  { name: PIRATE_RELOCATION_DIRECTIONS[0], delta: { q: 0, r: -1 } },
  { name: PIRATE_RELOCATION_DIRECTIONS[1], delta: { q: 1, r: -1 } },
  { name: PIRATE_RELOCATION_DIRECTIONS[2], delta: { q: 1, r: 0 } },
  { name: PIRATE_RELOCATION_DIRECTIONS[3], delta: { q: 0, r: 1 } },
  { name: PIRATE_RELOCATION_DIRECTIONS[4], delta: { q: -1, r: 1 } },
  { name: PIRATE_RELOCATION_DIRECTIONS[5], delta: { q: -1, r: 0 } },
] as const satisfies ReadonlyArray<{
  name: PirateRelocationPlan['direction'];
  delta: HexCoord;
}>;

function canonicalCoord(state: GameState, coord: HexCoord): HexCoord {
  return state.map.wrapsHorizontally ? wrapHexCoord(coord, state.map.width) : { ...coord };
}

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

function isNaval(unit: Unit): boolean {
  return UNIT_DEFINITIONS[unit.type]?.domain === 'naval';
}

function isCombatNaval(unit: Unit): boolean {
  return isNaval(unit) && UNIT_DEFINITIONS[unit.type].strength > 0;
}

function isTransport(unit: Unit): boolean {
  return isNaval(unit) && UNIT_DEFINITIONS[unit.type].cargoCapacity !== undefined;
}

function isProtected(state: GameState, factionId: string, civId: string): boolean {
  const tribute = state.pirates?.factions[factionId]?.tributeByCiv[civId];
  return Boolean(tribute && tribute.protectedUntilRound > state.turn);
}

function contractAllowsTarget(state: GameState, factionId: string, ownerId: string): boolean {
  const contract = state.pirates?.factions[factionId]?.contract;
  return !contract || contract.targetId === ownerId;
}

function isEligibleVictim(state: GameState, factionId: string, ownerId: string): boolean {
  return Boolean(state.civilizations[ownerId])
    && !isProtected(state, factionId, ownerId)
    && contractAllowsTarget(state, factionId, ownerId);
}

function isCoastalCity(state: GameState, cityId: string): boolean {
  const city = state.cities[cityId];
  if (!city) return false;
  return neighbors(state, city.position).some(position => {
    const terrain = state.map.tiles[hexKey(position)]?.terrain;
    return terrain === 'coast' || terrain === 'ocean';
  });
}

function nearestByPosition<T extends { id: string; position: HexCoord }>(
  state: GameState,
  from: HexCoord,
  values: T[],
): T | undefined {
  return [...values].sort((a, b) =>
    distance(state, from, a.position) - distance(state, from, b.position) || a.id.localeCompare(b.id),
  )[0];
}

function factionReferencePosition(state: GameState, factionId: string): HexCoord | null {
  const faction = state.pirates?.factions[factionId];
  if (!faction) return null;
  const units = faction.shipIds.map(id => state.units[id]).filter((unit): unit is Unit => Boolean(unit));
  if (units.length > 0) return [...units].sort((a, b) => a.id.localeCompare(b.id))[0].position;
  return faction.headquarters.kind === 'coastal-enclave' ? faction.headquarters.position : null;
}

function isTransportEscortedBy(state: GameState, transport: Unit, units: readonly Unit[]): boolean {
  if (!isTransport(transport)) return false;
  return units.some(candidate =>
    candidate.id !== transport.id
    && !candidate.transportId
    && candidate.owner === transport.owner
    && isCombatNaval(candidate)
    && distance(state, candidate.position, transport.position) <= 1,
  );
}

export function isTransportEscorted(state: GameState, transport: Unit): boolean {
  return isTransportEscortedBy(state, transport, Object.values(state.units));
}

export function choosePirateIntent(state: GameState, factionId: string): PirateIntent | null {
  const faction = state.pirates?.factions[factionId];
  const from = factionReferencePosition(state, factionId);
  if (!faction || !from) return null;

  const allUnits = Object.values(state.units);
  const transports: Unit[] = [];
  const combatNaval: Unit[] = [];
  for (const unit of allUnits) {
    const definition = UNIT_DEFINITIONS[unit.type];
    if (definition?.domain !== 'naval') continue;
    if (definition.cargoCapacity !== undefined) transports.push(unit);
    if (definition.strength > 0) combatNaval.push(unit);
  }
  const escortedTransportIds = new Set(transports.filter(transport => combatNaval.some(escort =>
    escort.owner === transport.owner
    && distance(state, escort.position, transport.position) <= 1,
  )).map(transport => transport.id));
  const activeEscortIds = new Set(combatNaval.filter(escort => transports.some(transport =>
    transport.owner === escort.owner
    && distance(state, transport.position, escort.position) <= 1,
  )).map(escort => escort.id));
  const victimUnits = allUnits.filter(unit =>
    !unit.transportId
    && distance(state, from, unit.position) <= PIRATE_BEHAVIOR_SEARCH_LIMITS.radius
    && isEligibleVictim(state, factionId, unit.owner)
    && isAlwaysHostilePair(factionId, unit.owner),
  ).sort((a, b) => distance(state, from, a.position) - distance(state, from, b.position)
    || a.id.localeCompare(b.id))
    .slice(0, PIRATE_BEHAVIOR_SEARCH_LIMITS.units);
  const unescortedTransport = nearestByPosition(state, from,
    victimUnits.filter(unit => transports.includes(unit) && !escortedTransportIds.has(unit.id)));
  if (unescortedTransport) {
    return { kind: 'raid', targetCivId: unescortedTransport.owner, targetUnitId: unescortedTransport.id, plannedRound: state.turn };
  }

  const eligibleCities = Object.values(state.cities).filter(city =>
    distance(state, from, city.position) <= PIRATE_BEHAVIOR_SEARCH_LIMITS.radius
    && isEligibleVictim(state, factionId, city.owner)
    && isCoastalCity(state, city.id),
  ).sort((a, b) => distance(state, from, a.position) - distance(state, from, b.position)
    || a.id.localeCompare(b.id))
    .slice(0, PIRATE_BEHAVIOR_SEARCH_LIMITS.cities);
  const targetCity = nearestByPosition(state, from, eligibleCities);
  if (targetCity) {
    return {
      kind: faction.behavior === 'blockading' ? 'blockade' : 'raid',
      targetCivId: targetCity.owner,
      targetCityId: targetCity.id,
      plannedRound: state.turn,
    };
  }

  const hostileNaval = nearestByPosition(state, from,
    victimUnits.filter(unit => combatNaval.includes(unit) && !transports.includes(unit) && !activeEscortIds.has(unit.id)));
  if (hostileNaval) {
    return { kind: 'raid', targetCivId: hostileNaval.owner, targetUnitId: hostileNaval.id, plannedRound: state.turn };
  }

  if (faction.behavior === 'blockading') {
    const escortedTransport = nearestByPosition(state, from,
      victimUnits.filter(unit => transports.includes(unit) && escortedTransportIds.has(unit.id)));
    if (escortedTransport) {
      return { kind: 'raid', targetCivId: escortedTransport.owner, targetUnitId: escortedTransport.id, plannedRound: state.turn };
    }
  }
  return null;
}

export function getPirateFleetLeader(state: GameState, factionId: string): Unit | null {
  const faction = state.pirates?.factions[factionId];
  if (!faction) return null;
  if (faction.headquarters.kind === 'deep-sea-flotilla') {
    const flagship = state.units[faction.headquarters.flagshipUnitId];
    if (flagship && faction.shipIds.includes(flagship.id)) return flagship;
  }
  return faction.shipIds
    .map(unitId => state.units[unitId])
    .filter((unit): unit is Unit => Boolean(unit))
    .sort((a, b) =>
      UNIT_DEFINITIONS[b.type].strength - UNIT_DEFINITIONS[a.type].strength
      || a.id.localeCompare(b.id))[0] ?? null;
}

function pirateIntentTargetPosition(
  state: GameState,
  intent: PirateIntentState,
): HexCoord | null {
  if (intent.targetUnitId) return state.units[intent.targetUnitId]?.position ?? null;
  if (intent.targetCityId) return state.cities[intent.targetCityId]?.position ?? null;
  return null;
}

function pirateApproachPositions(
  state: GameState,
  target: HexCoord,
): HexCoord[] {
  const targetTerrain = state.map.tiles[hexKey(target)]?.terrain;
  if (targetTerrain === 'coast' || targetTerrain === 'ocean') return [target];
  return neighbors(state, target)
    .filter(coord => {
      const terrain = state.map.tiles[hexKey(coord)]?.terrain;
      return terrain === 'coast' || terrain === 'ocean';
    })
    .sort((a, b) => a.q - b.q || a.r - b.r);
}

function hasPiratePathToIntent(
  state: GameState,
  factionId: string,
  intent: PirateIntentState,
): boolean {
  const leader = getPirateFleetLeader(state, factionId);
  const target = pirateIntentTargetPosition(state, intent);
  if (!leader || !target) return false;
  return pirateApproachPositions(state, target).some(position =>
    Boolean(findPath(leader.position, position, state.map, 'naval', { unit: leader })));
}

function headquartersDefenseIntent(
  state: GameState,
  factionId: string,
): PirateIntentState | null {
  const faction = state.pirates?.factions[factionId];
  const leader = getPirateFleetLeader(state, factionId);
  if (!faction || !leader) return null;
  const headquartersPosition = faction.headquarters.kind === 'coastal-enclave'
    ? faction.headquarters.position
    : leader.position;
  const threat = Object.values(state.units)
    .filter(unit =>
      !unit.transportId
      && isCombatNaval(unit)
      && isEligibleVictim(state, factionId, unit.owner)
      && isAlwaysHostilePair(factionId, unit.owner)
      && distance(state, headquartersPosition, unit.position) <= 2)
    .sort((a, b) =>
      distance(state, headquartersPosition, a.position) - distance(state, headquartersPosition, b.position)
      || a.id.localeCompare(b.id))[0];
  return threat ? {
    kind: 'raid',
    targetCivId: threat.owner,
    targetUnitId: threat.id,
    plannedRound: state.turn,
    lastProgressRound: state.turn,
    lastTargetDistance: distance(state, leader.position, threat.position),
    mode: 'engage',
    leaderUnitId: leader.id,
  } : null;
}

export function shouldPirateFleetWithdraw(state: GameState, factionId: string): boolean {
  const faction = state.pirates?.factions[factionId];
  const leader = getPirateFleetLeader(state, factionId);
  if (!faction || !leader) return false;
  const ships = faction.shipIds
    .map(unitId => state.units[unitId])
    .filter((unit): unit is Unit => Boolean(unit));
  if (ships.length === 0) return false;
  const averageHealth = ships.reduce((total, unit) => total + unit.health, 0) / ships.length;
  const profile = OPPONENT_CHALLENGE_PROFILES[resolveOpponentChallenge(state)];
  const healthThreshold = Math.max(0, profile.retreatHealthPercent - (faction.contract ? 10 : 0));
  if (averageHealth < healthThreshold) return true;

  const fleetStrength = ships.reduce(
    (total, unit) => total + UNIT_DEFINITIONS[unit.type].strength,
    0,
  );
  const hostileStrength = Object.values(state.units)
    .filter(unit =>
      !unit.transportId
      && isCombatNaval(unit)
      && isEligibleVictim(state, factionId, unit.owner)
      && isAlwaysHostilePair(factionId, unit.owner)
      && distance(state, leader.position, unit.position) <= PIRATE_LOCAL_RISK_RADIUS)
    .reduce((total, unit) => total + UNIT_DEFINITIONS[unit.type].strength, 0);
  const minimumRatio = faction.contract ? 0.45 : 0.7;
  return hostileStrength > 0 && fleetStrength < hostileStrength * minimumRatio;
}

const PIRATE_LOCAL_RISK_RADIUS = 7;

function isPersistentPirateIntentValid(
  state: GameState,
  factionId: string,
  intent: PirateIntentState,
): boolean {
  const faction = state.pirates?.factions[factionId];
  if (!faction || intent.mode === 'withdraw') return false;
  if (state.turn - (intent.lastProgressRound ?? intent.plannedRound) >= 3) return false;
  if (intent.targetCivId && !isEligibleVictim(state, factionId, intent.targetCivId)) return false;
  if (faction.contract && intent.targetCivId !== faction.contract.targetId) return false;
  if (!pirateIntentTargetPosition(state, intent)) return false;
  return hasPiratePathToIntent(state, factionId, intent);
}

export function choosePersistentPirateIntent(
  state: GameState,
  factionId: string,
): PirateIntentState | null {
  const faction = state.pirates?.factions[factionId];
  const leader = getPirateFleetLeader(state, factionId);
  if (!faction || !leader) return null;

  if (shouldPirateFleetWithdraw(state, factionId)) {
    return {
      kind: 'patrol',
      plannedRound: state.turn,
      lastProgressRound: state.turn,
      mode: 'withdraw',
      leaderUnitId: leader.id,
    };
  }
  const defense = headquartersDefenseIntent(state, factionId);
  if (defense) return defense;
  if (faction.intent && isPersistentPirateIntentValid(state, factionId, faction.intent)) {
    return { ...faction.intent, leaderUnitId: leader.id, mode: 'engage' };
  }
  const chosen = choosePirateIntent(state, factionId);
  const target = chosen ? pirateIntentTargetPosition(state, chosen) : null;
  return chosen ? {
    ...chosen,
    lastProgressRound: state.turn,
    lastTargetDistance: target ? distance(state, leader.position, target) : undefined,
    mode: 'engage',
    leaderUnitId: leader.id,
  } : null;
}

function relocationAnchorRound(faction: NonNullable<GameState['pirates']>['factions'][string]): number {
  if (faction.headquarters.kind !== 'deep-sea-flotilla') return faction.spawnedRound;
  return faction.headquarters.relocation.lastRelocatedRound ?? faction.spawnedRound;
}

function stepCoord(state: GameState, coord: HexCoord, delta: HexCoord): HexCoord {
  return canonicalCoord(state, { q: coord.q + delta.q, r: coord.r + delta.r });
}

export function planFlotillaRelocation(state: GameState, factionId: string): PirateRelocationPlan | null {
  const faction = state.pirates?.factions[factionId];
  if (!faction || faction.headquarters.kind !== 'deep-sea-flotilla') return null;
  if (faction.headquarters.relocation.planned) return null;
  if (state.turn - relocationAnchorRound(faction) !== 3) return null;
  const flagship = state.units[faction.headquarters.flagshipUnitId];
  if (!flagship) return null;

  const candidates: PirateRelocationPlan[] = [];
  for (const direction of DIRECTION_DELTAS) {
    const path: HexCoord[] = [];
    let current = flagship.position;
    for (let step = 0; step < 4; step++) {
      current = stepCoord(state, current, direction.delta);
      if (state.map.tiles[hexKey(current)]?.terrain !== 'ocean') break;
      path.push(current);
    }
    if (path.length < 2) continue;
    candidates.push({
      plannedRound: state.turn,
      resolvesOnRound: state.turn + 1,
      direction: direction.name,
      path,
    });
  }
  if (candidates.length === 0) return null;
  const rng = createRng(`pirate-relocation:${state.gameId ?? 'game'}:${state.turn}:${factionId}`);
  const candidate = candidates[Math.floor(rng() * candidates.length)];
  const length = 2 + Math.floor(rng() * Math.min(3, candidate.path.length - 1));
  return { ...candidate, path: candidate.path.slice(0, length) };
}

function relocationResult(
  state: GameState,
  factionId: PirateFactionId,
  status: PirateMutationResult['facts']['relocation']['status'],
  reason?: PirateMutationResult['facts']['relocation']['reason'],
  movements: PirateMovementFact[] = [],
): PirateMutationResult {
  return { state, facts: { movements, relocation: { factionId, status, ...(reason ? { reason } : {}) } } };
}

function clearRelocationPlan(state: GameState, factionId: PirateFactionId): GameState {
  const faction = state.pirates!.factions[factionId];
  if (faction.headquarters.kind !== 'deep-sea-flotilla') return state;
  return {
    ...state,
    pirates: {
      ...state.pirates!,
      factions: {
        ...state.pirates!.factions,
        [factionId]: {
          ...faction,
          headquarters: {
            ...faction.headquarters,
            relocation: { ...faction.headquarters.relocation, planned: null },
          },
        },
      },
    },
  };
}

export function applyPlannedRelocation(state: GameState, factionId: string): PirateMutationResult {
  const typedFactionId = factionId as PirateFactionId;
  const faction = state.pirates?.factions[factionId];
  if (!faction) return relocationResult(state, typedFactionId, 'cancelled', 'missing-faction');
  if (faction.headquarters.kind !== 'deep-sea-flotilla') {
    return relocationResult(state, typedFactionId, 'cancelled', 'not-flotilla');
  }
  const plan = faction.headquarters.relocation.planned;
  if (!plan || state.turn < plan.resolvesOnRound) return relocationResult(state, typedFactionId, 'not-due');
  const cancel = (reason: NonNullable<PirateMutationResult['facts']['relocation']['reason']>) =>
    relocationResult(clearRelocationPlan(state, typedFactionId), typedFactionId, 'cancelled', reason);
  const flagship = state.units[faction.headquarters.flagshipUnitId];
  if (!flagship) return cancel('flagship-missing');
  if ((faction.transitionGuards.lastFlagshipAttackedRound ?? -1) >= plan.plannedRound) return cancel('attacked');
  if (Object.values(state.units).some(unit =>
    !unit.transportId
    && isCombatNaval(unit)
    && isAlwaysHostilePair(factionId, unit.owner)
    && distance(state, flagship.position, unit.position) === 1,
  )) return cancel('hostile-adjacent');

  const direction = DIRECTION_DELTAS.find(candidate => candidate.name === plan.direction);
  if (!direction || plan.path.length < 2 || plan.path.length > 4) return cancel('invalid-path');
  let expected = flagship.position;
  for (const pathCoord of plan.path) {
    expected = stepCoord(state, expected, direction.delta);
    if (hexKey(expected) !== hexKey(canonicalCoord(state, pathCoord)) || state.map.tiles[hexKey(expected)]?.terrain !== 'ocean') {
      return cancel('invalid-path');
    }
  }

  const movingUnits = faction.shipIds
    .map(id => state.units[id])
    .filter((unit): unit is Unit => Boolean(unit) && distance(state, flagship.position, unit.position) <= 2);
  if (!movingUnits.some(unit => unit.id === flagship.id)) return cancel('flagship-missing');
  const movingIds = new Set(movingUnits.map(unit => unit.id));
  const stationary = new Set(Object.values(state.units)
    .filter(unit => !unit.transportId && !movingIds.has(unit.id))
    .map(unit => hexKey(canonicalCoord(state, unit.position))));
  const paths = new Map<string, HexCoord[]>();
  const relocatedUnits = new Map<string, Unit>();
  const finalKeys = new Set<string>();
  for (const unit of movingUnits) {
    let moved = unit;
    const path: HexCoord[] = [];
    for (let step = 0; step < plan.path.length; step++) {
      const next = stepCoord(state, moved.position, direction.delta);
      const cost = getMovementStepCost(moved, state.map, moved.position, next);
      if (
        state.map.tiles[hexKey(next)]?.terrain !== 'ocean'
        || stationary.has(hexKey(next))
        || !Number.isFinite(cost)
        || moved.movementPointsLeft < cost
      ) {
        return cancel('placement-failed');
      }
      moved = moveUnit(moved, next, cost);
      path.push(next);
    }
    const finalKey = hexKey(moved.position);
    if (stationary.has(finalKey) || finalKeys.has(finalKey)) return cancel('placement-failed');
    finalKeys.add(finalKey);
    paths.set(unit.id, path);
    relocatedUnits.set(unit.id, moved);
  }

  const units = { ...state.units };
  const movements: PirateMovementFact[] = [];
  for (const unit of movingUnits) {
    const path = paths.get(unit.id)!;
    const relocated = relocatedUnits.get(unit.id)!;
    const to = relocated.position;
    units[unit.id] = { ...relocated, movementPointsLeft: 0, hasActed: true };
    movements.push({ unitId: unit.id, from: unit.position, to, path });
  }
  const nextFaction = {
    ...faction,
    headquarters: {
      ...faction.headquarters,
      relocation: { planned: null, lastRelocatedRound: state.turn },
    },
  };
  const nextState: GameState = {
    ...state,
    units,
    pirates: {
      ...state.pirates!,
      factions: { ...state.pirates!.factions, [factionId]: nextFaction },
    },
  };
  return relocationResult(nextState, typedFactionId, 'moved', undefined, movements);
}

export function derivePirateRaids(
  state: GameState,
  facts: PirateRoundFacts = { movements: [], attacks: [], transportKills: [] },
): PirateRaid[] {
  const raids: PirateRaid[] = [];
  const remainingTreasury = new Map(Object.entries(state.civilizations).map(([id, civ]) => [id, Math.max(0, civ.gold)]));
  for (const faction of Object.values(state.pirates?.factions ?? {}).sort((a, b) => a.id.localeCompare(b.id))) {
    const kill = facts.transportKills.find(entry =>
      entry.factionId === faction.id && isEligibleVictim(state, faction.id, entry.victimCivId));
    const adjacentCity = Object.values(state.cities)
      .filter(candidate => isEligibleVictim(state, faction.id, candidate.owner) && isCoastalCity(state, candidate.id))
      .filter(candidate => faction.shipIds.some(id => {
        const ship = state.units[id];
        return ship && distance(state, ship.position, candidate.position) === 1;
      }))
      .sort((a, b) => a.id.localeCompare(b.id))[0];
    const victimCivId = kill?.victimCivId ?? adjacentCity?.owner;
    if (!victimCivId) continue;
    const available = remainingTreasury.get(victimCivId) ?? 0;
    const amount = Math.min(PIRATE_PLUNDER_CAP[faction.maritimeStage], available);
    if (amount <= 0) continue;
    remainingTreasury.set(victimCivId, available - amount);
    raids.push({
      factionId: faction.id,
      victimCivId,
      amount,
      ...(kill ? { transportUnitId: kill.unitId } : { cityId: adjacentCity!.id }),
    });
  }
  return raids;
}

export function derivePirateBlockades(state: GameState): PirateBlockade[] {
  const blockades: PirateBlockade[] = [];
  for (const faction of Object.values(state.pirates?.factions ?? {}).sort((a, b) => a.id.localeCompare(b.id))) {
    // A besieging faction keeps producing the blockade its siege depends on (#522):
    // siege is derived FROM active blockades, so besieging must remain blockade-eligible.
    if ((faction.behavior !== 'blockading' && faction.behavior !== 'besieging') || faction.maritimeStage < 2) continue;
    const ships = faction.shipIds.map(id => state.units[id]).filter((unit): unit is Unit => Boolean(unit));
    for (const candidate of Object.values(state.cities).sort((a, b) => a.id.localeCompare(b.id))) {
      if (!isEligibleVictim(state, faction.id, candidate.owner) || !isCoastalCity(state, candidate.id)) continue;
      const nearby = ships.filter(ship => distance(state, ship.position, candidate.position) <= 2);
      if (nearby.length < 2 || !nearby.some(ship => distance(state, ship.position, candidate.position) === 1)) continue;
      blockades.push({ factionId: faction.id, cityId: candidate.id, victimCivId: candidate.owner });
    }
  }
  return blockades;
}

export function getRelocationDirectionForViewer(
  state: GameState,
  viewerCivId: string,
  factionId: string,
): PirateRelocationPlan['direction'] | null {
  const intel = state.pirates?.intelByCiv[viewerCivId]?.[factionId];
  return intel?.level === 'tracked' ? intel.plannedRelocationDirection ?? null : null;
}
