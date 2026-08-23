import type { GameState, OpponentChallenge, RogueElephantHostOutcome, RogueElephantHostState, RogueHostTarget, UnitType } from '@/core/types';
import { CRISIS_FORCE_OWNER } from '@/core/owner-kind';
import { registerCrisisForce } from '@/systems/crisis-force-system';
import { hexKey, mapNeighbors } from '@/systems/hex-utils';
import { resolveCivilizationEra } from '@/systems/tech-definitions';
import { createUnit, UNIT_DEFINITIONS } from '@/systems/unit-system';
import { hexDistance } from '@/systems/hex-utils';
import { findPath } from '@/systems/unit-system';
import { executeUnitMove } from '@/systems/unit-movement-system';
import { resolvePressureSeverityForCiv } from '@/core/opponent-challenge';
import { getCivAvailableResources } from '@/systems/resource-acquisition-system';
import { getTrainableUnitsForCiv } from '@/systems/city-system';

export interface RogueElephantHostProfile {
  elephantCount: number;
}

export type RogueElephantHostLifecycleTransition =
  | { kind: 'command-broken'; targetCivId: string; dispersalTurnsRemaining: number }
  | { kind: 'resolved'; targetCivId: string; outcome: RogueElephantHostOutcome; rewardGranted: boolean };

/** Derives presentation strictly from this turn's before/after Host record. */
export function getRogueElephantHostLifecycleTransition(
  before: RogueElephantHostState | undefined,
  after: RogueElephantHostState | undefined,
): RogueElephantHostLifecycleTransition | undefined {
  if (!after) return undefined;
  if (before?.phase !== 'dispersing' && after.phase === 'dispersing') {
    return { kind: 'command-broken', targetCivId: after.targetCivId, dispersalTurnsRemaining: after.dispersalTurnsRemaining ?? 3 };
  }
  if (before?.phase !== 'resolved' && after.phase === 'resolved' && after.outcome) {
    return { kind: 'resolved', targetCivId: after.targetCivId, outcome: after.outcome, rewardGranted: after.rewardGranted === true };
  }
  return undefined;
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
  const approaches = Object.values(state.cities)
    .filter(city => city.owner === targetCivId)
    .flatMap(city => mapNeighbors(state.map, city.position)
      .map(position => ({ city, position, tile: state.map.tiles[hexKey(position)] }))
      .filter((candidate): candidate is { city: typeof city; position: typeof city.position; tile: NonNullable<typeof candidate.tile> } => Boolean(candidate.tile))
      .filter(candidate => candidate.tile.terrain !== 'ocean' && candidate.tile.terrain !== 'coast' && candidate.tile.terrain !== 'mountain'))
    .map(candidate => ({
      ...candidate,
      defense: Object.values(state.units)
        .filter(unit => unit.owner === targetCivId && unit.health > 0 && hexDistance(unit.position, candidate.position) === 0)
        .reduce((total, unit) => total + (unit.combatStrengthOverride ?? UNIT_DEFINITIONS[unit.type].strength) * unit.health / 100, 0),
    }))
    .sort((left, right) => left.defense - right.defense
      || left.city.id.localeCompare(right.city.id)
      || hexKey(left.position).localeCompare(hexKey(right.position)));
  const approach = approaches[0];
  return approach ? { kind: 'city-approach', cityId: approach.city.id, tileKey: hexKey(approach.position) } : undefined;
}

export function getRogueElephantHostStatusForViewer(state: GameState, viewerId: string): { text: string } | undefined {
  const host = state.rogueElephantHosts?.[viewerId];
  if (!host || host.targetCivId !== viewerId) return undefined;
  const chargeTurns = host.recoveredHarnesses && !host.recoveredHarnesses.consumed
    ? Math.max(0, host.recoveredHarnesses.expiresTurn - state.turn)
    : 0;
  const charge = chargeTurns > 0 ? ` Recovered Harnesses: next War Elephant −25% (${chargeTurns} turns).` : '';
  if (host.phase === 'warning') return { text: 'Rogue Elephant Host is approaching; prepare defenses before it attacks.' };
  if (host.phase === 'active') return { text: 'Rogue Elephant Host is active. Defeat the nearby Handler to break its coordination.' };
  if (host.phase === 'dispersing') return { text: `Handler defeated: the scattered herds disperse in ${host.dispersalTurnsRemaining ?? 0} turns.${charge}` };
  if (host.phase === 'resolved') return { text: `Rogue Elephant Host ${host.outcome ?? 'resolved'}.${charge}` };
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

/** Converts a broken Host into a three-turn dispersal state without invoking Stampede recurrence or rewards. */
export function breakRogueElephantHostCommand(state: GameState, handlerUnitId: string): GameState {
  const host = Object.values(state.rogueElephantHosts ?? {}).find(candidate => candidate.phase === 'active'
    && candidate.forceId && state.crisisForces?.[candidate.forceId]?.unitIds.includes(handlerUnitId));
  const force = host?.forceId ? state.crisisForces?.[host.forceId] : undefined;
  if (!host || !force) return state;
  const herdIds = force.unitIds.filter(unitId => unitId !== handlerUnitId && state.units[unitId]?.type === 'rogue_elephant');
  const units = Object.fromEntries(Object.entries(state.units).flatMap(([unitId, unit]) => {
    if (unitId === handlerUnitId) return [];
    return [[unitId, unit.type === 'rogue_elephant' ? { ...unit, type: 'beast_stampede_herd' as const } : unit]];
  }));
  const crisisForces = { ...state.crisisForces, [force.id]: { ...force, unitIds: herdIds } };
  return {
    ...state,
    units,
    crisisForces,
    rogueElephantHosts: {
      ...state.rogueElephantHosts,
      [host.targetCivId]: { ...host, phase: 'dispersing', dispersalTurnsRemaining: 3 },
    },
  };
}

/**
 * Combat passes the exact units it removed at the mutation boundary. This avoids
 * reconstructing a historical death from final state and correctly handles splash
 * damage that kills more than one Handler in the same combat resolution.
 */
export function resolveRogueElephantHostHandlerDeaths(state: GameState, defeatedUnitIds: ReadonlySet<string>): GameState {
  let next = state;
  for (const handlerUnitId of [...defeatedUnitIds].sort()) next = breakRogueElephantHostCommand(next, handlerUnitId);
  return next;
}

function removeHostForce(state: GameState, forceId: string): GameState {
  const force = state.crisisForces?.[forceId];
  if (!force) return state;
  return {
    ...state,
    units: Object.fromEntries(Object.entries(state.units).filter(([unitId]) => !force.unitIds.includes(unitId))),
    crisisForces: Object.fromEntries(Object.entries(state.crisisForces ?? {}).filter(([candidateId]) => candidateId !== forceId)),
  };
}

/** Applies the one bounded Host reward; only terminal Host outcomes may call this. */
export function resolveRogueElephantHostOutcome(
  state: GameState,
  targetCivId: string,
  outcome: RogueElephantHostOutcome,
): GameState {
  const host = state.rogueElephantHosts?.[targetCivId];
  const civ = state.civilizations[targetCivId];
  if (!host || !civ || host.completed) return state;
  const rewardGranted = outcome !== 'escaped';
  const gold = rewardGranted ? Math.min(12 * resolveCivilizationEra(civ.techState.completed), 100) : 0;
  return {
    ...state,
    civilizations: gold > 0 ? { ...state.civilizations, [targetCivId]: { ...civ, gold: civ.gold + gold } } : state.civilizations,
    rogueElephantHosts: {
      ...state.rogueElephantHosts,
      [targetCivId]: {
        ...host, phase: 'resolved', completed: true, outcome, resolvedTurn: state.turn, rewardGranted,
        ...(rewardGranted ? { recoveredHarnesses: { expiresTurn: state.turn + 10 } } : {}),
      },
    },
  };
}

export function hasActiveRecoveredHarnesses(state: GameState, targetCivId: string): boolean {
  const charge = state.rogueElephantHosts?.[targetCivId]?.recoveredHarnesses;
  return Boolean(charge && !charge.consumed && state.turn < charge.expiresTurn);
}

export function consumeRecoveredHarnesses(state: GameState, targetCivId: string, unitType: UnitType): GameState {
  if (unitType !== 'war_elephant' || !hasActiveRecoveredHarnesses(state, targetCivId)) return state;
  const host = state.rogueElephantHosts![targetCivId]!;
  return {
    ...state,
    rogueElephantHosts: { ...state.rogueElephantHosts, [targetCivId]: { ...host, recoveredHarnesses: { ...host.recoveredHarnesses!, consumed: true } } },
  };
}

/** Expiry pays 25 gold only if the discounted War Elephant was never trainable. */
export function processRecoveredHarnesses(state: GameState, targetCivId: string): GameState {
  const host = state.rogueElephantHosts?.[targetCivId];
  const civ = state.civilizations[targetCivId];
  const charge = host?.recoveredHarnesses;
  if (!host || !civ || !charge || charge.consumed) return state;
  if (state.turn < charge.expiresTurn) {
    const eligible = getTrainableUnitsForCiv(civ.techState.completed, civ.civType, getCivAvailableResources(state, targetCivId))
      .some(unit => unit.type === 'war_elephant');
    if (!eligible || host.recoveredHarnessesEligibleUnitSeen) return state;
    return { ...state, rogueElephantHosts: { ...state.rogueElephantHosts, [targetCivId]: { ...host, recoveredHarnessesEligibleUnitSeen: true } } };
  }
  const gold = host.recoveredHarnessesEligibleUnitSeen ? 0 : 25;
  return {
    ...state,
    civilizations: gold > 0 ? { ...state.civilizations, [targetCivId]: { ...civ, gold: civ.gold + gold } } : state.civilizations,
    rogueElephantHosts: { ...state.rogueElephantHosts, [targetCivId]: { ...host, recoveredHarnesses: { ...charge, consumed: true } } },
  };
}

/** Ends the warning boundary. #706 will add command-break conversion and terminal resolution. */
export function processRogueElephantHostTurn(state: GameState, targetCivId: string): GameState {
  let next = processRecoveredHarnesses(state, targetCivId);
  const host = next.rogueElephantHosts?.[targetCivId];
  if (!host) return state;
  const force = host.forceId ? next.crisisForces?.[host.forceId] : undefined;
  if ((host.phase === 'active' || host.phase === 'dispersing') && (!force || !force.unitIds.some(unitId => next.units[unitId]))) {
    return resolveRogueElephantHostOutcome(next, targetCivId, 'defeated');
  }
  if (host.phase === 'dispersing') {
    const remaining = Math.max(0, (host.dispersalTurnsRemaining ?? 0) - 1);
    if (remaining > 0) return { ...next, rogueElephantHosts: { ...next.rogueElephantHosts, [targetCivId]: { ...host, dispersalTurnsRemaining: remaining } } };
    return resolveRogueElephantHostOutcome(removeHostForce(next, host.forceId!), targetCivId, 'dispersed');
  }
  if (host.phase === 'active') return processActiveRogueElephantHost(next, targetCivId);
  if (host.phase !== 'warning' || host.createdTurn === next.turn) return next;
  const activated: GameState = {
    ...next,
    rogueElephantHosts: { ...next.rogueElephantHosts, [targetCivId]: { ...host, phase: 'active' } },
  };
  // Activation consumes the warning boundary; the Host's first movement happens on its next turn.
  return activated;
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
    const phase = candidate.phase === 'warning' || candidate.phase === 'active' || candidate.phase === 'dispersing' || candidate.phase === 'resolved'
      ? candidate.phase : undefined;
    if ((phase === 'warning' || phase === 'active' || phase === 'dispersing') && (!force || force.targetCivId !== targetCivId)) return [];
    const normalized: RogueElephantHostState = {
      targetCivId,
      ...(force ? { forceId: force.id } : {}),
      ...(phase ? { phase } : {}),
      ...(Number.isInteger(candidate.createdTurn) ? { createdTurn: Number(candidate.createdTurn) } : {}),
      ...(candidate.completed === true ? { completed: true } : {}),
      ...(normalizeTarget(candidate.target) ? { target: normalizeTarget(candidate.target)! } : {}),
      ...(Number.isInteger(candidate.dispersalTurnsRemaining) ? { dispersalTurnsRemaining: Math.max(0, Number(candidate.dispersalTurnsRemaining)) } : {}),
      ...(candidate.outcome === 'defeated' || candidate.outcome === 'dispersed' || candidate.outcome === 'escaped' ? { outcome: candidate.outcome } : {}),
      ...(Number.isInteger(candidate.resolvedTurn) ? { resolvedTurn: Number(candidate.resolvedTurn) } : {}),
      ...(typeof candidate.rewardGranted === 'boolean' ? { rewardGranted: candidate.rewardGranted } : {}),
      ...(candidate.recoveredHarnesses && Number.isInteger(candidate.recoveredHarnesses.expiresTurn)
        ? { recoveredHarnesses: { expiresTurn: Number(candidate.recoveredHarnesses.expiresTurn), ...(typeof candidate.recoveredHarnesses.consumed === 'boolean' ? { consumed: candidate.recoveredHarnesses.consumed } : {}) } }
        : {}),
      ...(typeof candidate.recoveredHarnessesEligibleUnitSeen === 'boolean' ? { recoveredHarnessesEligibleUnitSeen: candidate.recoveredHarnessesEligibleUnitSeen } : {}),
    };
    return [[targetCivId, normalized]];
  }));
  return { ...state, rogueElephantHosts: hosts };
}
