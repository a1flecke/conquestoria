import type { GameState, OpponentChallenge, RogueElephantHostState, RogueHostTarget } from '@/core/types';
import { CRISIS_FORCE_OWNER } from '@/core/owner-kind';
import { registerCrisisForce } from '@/systems/crisis-force-system';
import { hexKey, mapNeighbors } from '@/systems/hex-utils';
import { resolveCivilizationEra } from '@/systems/tech-definitions';
import { createUnit } from '@/systems/unit-system';
import { hexDistance } from '@/systems/hex-utils';
import { findPath } from '@/systems/unit-system';
import { executeUnitMove } from '@/systems/unit-movement-system';
import { resolvePressureSeverityForCiv } from '@/core/opponent-challenge';

export interface RogueElephantHostProfile {
  elephantCount: number;
}

const HUMAN_HOST_PROFILES: Record<OpponentChallenge, RogueElephantHostProfile> = {
  explorer: { elephantCount: 1 },
  standard: { elephantCount: 2 },
  veteran: { elephantCount: 3 },
};

const STANDARD_HOST_PROFILE: RogueElephantHostProfile = HUMAN_HOST_PROFILES.standard;

/** Computer targets use the contract's Standard world-pressure severity. */
export function getRogueElephantHostProfile(
  severity: OpponentChallenge,
  targetIsHuman: boolean,
): RogueElephantHostProfile {
  return targetIsHuman ? HUMAN_HOST_PROFILES[severity] : STANDARD_HOST_PROFILE;
}

export function getRogueHandlerStrength(era: number): number {
  return 22 + 3 * (Math.max(4, Math.min(9, era)) - 4);
}

export function getRogueElephantStrength(era: number): number {
  return 40 + 4 * (Math.max(4, Math.min(9, era)) - 4);
}

function hasActiveTargetedWorldPressure(state: GameState, targetCivId: string): boolean {
  return Object.values(state.crisisForces ?? {}).some(force => force.targetCivId === targetCivId)
    || state.stampedes?.[targetCivId]?.phase === 'warning'
    || state.stampedes?.[targetCivId]?.phase === 'active';
}

function findHostSpawnPositions(state: GameState, targetCivId: string, unitCount: number) {
  const occupied = new Set(Object.values(state.units).filter(unit => !unit.transportId).map(unit => hexKey(unit.position)));
  return Object.values(state.cities)
    .filter(city => city.owner === targetCivId)
    .sort((left, right) => left.id.localeCompare(right.id))
    .map(city => mapNeighbors(state.map, city.position)
      .filter(position => {
        const tile = state.map.tiles[hexKey(position)];
        return tile && tile.terrain !== 'ocean' && tile.terrain !== 'coast' && tile.terrain !== 'mountain';
      })
      .filter(position => !occupied.has(hexKey(position)))
      .sort((left, right) => hexKey(left).localeCompare(hexKey(right))))
    .find(positions => positions.length >= unitCount);
}

/** Creates visible, inactive actors; the next target-civ boundary activates the Host. */
export function startRogueElephantHostWarning(
  state: GameState,
  targetCivId: string,
  severity: OpponentChallenge,
): GameState {
  const target = state.civilizations[targetCivId];
  if (!target || target.isEliminated || state.rogueElephantHosts?.[targetCivId]?.completed || hasActiveTargetedWorldPressure(state, targetCivId)) return state;
  const era = resolveCivilizationEra(target.techState.completed);
  if (era < 4 || era > 9) return state;
  const profile = getRogueElephantHostProfile(severity, target.isHuman);
  const positions = findHostSpawnPositions(state, targetCivId, profile.elephantCount + 1);
  if (!positions) return state;
  const forceId = `rogue-elephant-host-${targetCivId}-${state.turn}`;
  let next: GameState = { ...state, units: { ...state.units } };
  const handler = createUnit('rogue_handler', CRISIS_FORCE_OWNER, positions[0]!, next.idCounters);
  handler.combatStrengthOverride = getRogueHandlerStrength(era);
  next.units[handler.id] = handler;
  const unitIds = [handler.id];
  for (const position of positions.slice(1, profile.elephantCount + 1)) {
    const elephant = createUnit('rogue_elephant', CRISIS_FORCE_OWNER, position, next.idCounters);
    elephant.combatStrengthOverride = getRogueElephantStrength(era);
    next.units[elephant.id] = elephant;
    unitIds.push(elephant.id);
  }
  next = registerCrisisForce(next, { id: forceId, targetCivId, severity: target.isHuman ? severity : 'standard', createdTurn: state.turn, unitIds });
  return {
    ...next,
    rogueElephantHosts: {
      ...(next.rogueElephantHosts ?? {}),
      [targetCivId]: { targetCivId, forceId, phase: 'warning', createdTurn: state.turn, target: getRogueElephantHostTarget(next, targetCivId) },
    },
  };
}

function deterministicPercent(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) hash = Math.imul(hash ^ seed.charCodeAt(index), 16777619);
  return (hash >>> 0) % 100;
}

/** Schedules a bounded once-per-target Host without competing with an active Stampede. */
export function processRogueElephantHostScheduling(state: GameState): GameState {
  let next = state;
  for (const targetCivId of Object.keys(state.civilizations).sort()) {
    const civ = next.civilizations[targetCivId];
    if (!civ || civ.isEliminated || next.rogueElephantHosts?.[targetCivId]?.completed || next.rogueElephantHosts?.[targetCivId]?.phase) continue;
    const era = resolveCivilizationEra(civ.techState.completed);
    if (era < 4 || era > 9 || hasActiveTargetedWorldPressure(next, targetCivId)) continue;
    // Stable 4% per eligible completed round: visible warning prevents surprise attacks.
    if (deterministicPercent(`${next.gameId}:rogue-host:${targetCivId}:${next.turn}`) >= 4) continue;
    next = startRogueElephantHostWarning(next, targetCivId, resolvePressureSeverityForCiv(next, targetCivId));
  }
  return next;
}

/** Stable, player-legible priority: improved land, Fort/Citadel, then city approach. */
export function getRogueElephantHostTarget(state: GameState, targetCivId: string): RogueHostTarget | undefined {
  const ownedTiles = Object.entries(state.map.tiles)
    .filter(([, tile]) => tile.owner === targetCivId)
    .sort(([left], [right]) => left.localeCompare(right));
  const valuable = ownedTiles.find(([, tile]) => tile.improvement !== 'none' && tile.improvement !== 'fort' && tile.improvementTurnsLeft === 0);
  if (valuable) return { kind: 'valuable-improvement', tileKey: valuable[0] };
  const fort = ownedTiles.find(([, tile]) => tile.improvement === 'fort' && tile.improvementTurnsLeft === 0);
  if (fort) return { kind: 'fort', tileKey: fort[0] };
  const city = Object.values(state.cities).filter(candidate => candidate.owner === targetCivId)
    .sort((left, right) => left.id.localeCompare(right.id))[0];
  if (!city) return undefined;
  const approach = mapNeighbors(state.map, city.position)
    .map(position => ({ position, tile: state.map.tiles[hexKey(position)] }))
    .filter((candidate): candidate is { position: typeof city.position; tile: NonNullable<typeof candidate.tile> } => Boolean(candidate.tile))
    .filter(candidate => candidate.tile.terrain !== 'ocean' && candidate.tile.terrain !== 'coast' && candidate.tile.terrain !== 'mountain')
    .sort((left, right) => hexKey(left.position).localeCompare(hexKey(right.position)))[0];
  return approach ? { kind: 'city-approach', cityId: city.id, tileKey: hexKey(approach.position) } : undefined;
}

export function getRogueElephantHostStatusForViewer(state: GameState, viewerId: string): { text: string } | undefined {
  const host = state.rogueElephantHosts?.[viewerId];
  if (!host || host.targetCivId !== viewerId) return undefined;
  if (host.phase === 'warning') return { text: 'Rogue Elephant Host is approaching; prepare defenses before it attacks.' };
  if (host.phase === 'active') return { text: 'Rogue Elephant Host is active. Defeat the nearby Handler to break its coordination.' };
  return undefined;
}

/** One viewer-independent combat fact; callers may present it only after visibility checks. */
export function getRogueElephantCommandFact(
  state: GameState,
  elephantUnitId: string,
): { percent: 20; handlerUnitId: string } | undefined {
  const elephant = state.units[elephantUnitId];
  if (!elephant || elephant.type !== 'rogue_elephant') return undefined;
  for (const host of Object.values(state.rogueElephantHosts ?? {})) {
    if (host.phase !== 'active' || !host.forceId) continue;
    const force = state.crisisForces?.[host.forceId];
    if (!force?.unitIds.includes(elephantUnitId)) continue;
    const handler = force.unitIds.map(unitId => state.units[unitId])
      .find((unit): unit is NonNullable<typeof unit> => unit?.type === 'rogue_handler' && unit.health > 0);
    if (handler && hexDistance(handler.position, elephant.position) <= 2) return { percent: 20, handlerUnitId: handler.id };
  }
  return undefined;
}

/** Ends the warning boundary. #706 will add command-break conversion and terminal resolution. */
export function processRogueElephantHostTurn(state: GameState, targetCivId: string): GameState {
  const host = state.rogueElephantHosts?.[targetCivId];
  if (!host) return state;
  if (host.phase === 'active') return processActiveRogueElephantHost(state, targetCivId);
  if (host.phase !== 'warning' || host.createdTurn === state.turn) return state;
  const activated: GameState = {
    ...state,
    rogueElephantHosts: { ...state.rogueElephantHosts, [targetCivId]: { ...host, phase: 'active' } },
  };
  return processActiveRogueElephantHost(activated, targetCivId);
}

/** Moves each active Host actor one legal step toward the persisted shared target. */
export function processActiveRogueElephantHost(state: GameState, targetCivId: string): GameState {
  const host = state.rogueElephantHosts?.[targetCivId];
  const force = host?.phase === 'active' && host.forceId ? state.crisisForces?.[host.forceId] : undefined;
  const target = host?.target?.tileKey ? state.map.tiles[host.target.tileKey]?.coord : undefined;
  if (!force || !target) return state;
  const next: GameState = { ...state, units: { ...state.units } };
  for (const unitId of [...force.unitIds].sort()) {
    const unit = next.units[unitId];
    if (!unit || unit.health <= 0) continue;
    const path = findPath(unit.position, target, next.map, 'land', { unit });
    const step = path?.[1];
    if (step) executeUnitMove(next, unit.id, step, { actor: 'world' });
  }
  return next;
}

function normalizeTarget(value: unknown): RogueHostTarget | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const candidate = value as Partial<RogueHostTarget>;
  if (typeof candidate.tileKey !== 'string') return undefined;
  if (candidate.kind === 'valuable-improvement' || candidate.kind === 'fort') return { kind: candidate.kind, tileKey: candidate.tileKey };
  if (candidate.kind === 'city-approach' && typeof candidate.cityId === 'string') {
    return { kind: candidate.kind, cityId: candidate.cityId, tileKey: candidate.tileKey };
  }
  return undefined;
}

/** Drops malformed or orphaned Host state without touching #706 terminal semantics. */
export function normalizeRogueElephantHosts(state: GameState): GameState {
  const hosts = Object.fromEntries(Object.entries(state.rogueElephantHosts ?? {}).flatMap(([targetCivId, value]) => {
    if (!value || typeof value !== 'object' || Array.isArray(value) || !state.civilizations[targetCivId]) return [];
    const candidate = value as Partial<RogueElephantHostState>;
    if (candidate.targetCivId !== targetCivId) return [];
    const force = typeof candidate.forceId === 'string' ? state.crisisForces?.[candidate.forceId] : undefined;
    const phase = candidate.phase === 'warning' || candidate.phase === 'active' || candidate.phase === 'resolved'
      ? candidate.phase : undefined;
    if ((phase === 'warning' || phase === 'active') && (!force || force.targetCivId !== targetCivId)) return [];
    const normalized: RogueElephantHostState = {
      targetCivId,
      ...(force ? { forceId: force.id } : {}),
      ...(phase ? { phase } : {}),
      ...(Number.isInteger(candidate.createdTurn) ? { createdTurn: Number(candidate.createdTurn) } : {}),
      ...(candidate.completed === true ? { completed: true } : {}),
      ...(normalizeTarget(candidate.target) ? { target: normalizeTarget(candidate.target)! } : {}),
    };
    return [[targetCivId, normalized]];
  }));
  return { ...state, rogueElephantHosts: hosts };
}
