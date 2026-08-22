import type { GameState, OpponentChallenge, StampedeState } from '@/core/types';
import { countActiveCrisesForCiv } from '@/systems/crisis-system';
import { CRISIS_FORCE_OWNER } from '@/core/owner-kind';
import { registerCrisisForce } from '@/systems/crisis-force-system';
import { createUnit } from '@/systems/unit-system';
import { hexKey, mapNeighbors } from '@/systems/hex-utils';

export interface StampedeProfile {
  cooldownTurns: number;
  initialChancePercent: number;
  growthPercent: number;
  capPercent: number;
  herdCount: number;
}

const STAMPEDE_PROFILES: Record<OpponentChallenge, StampedeProfile> = {
  explorer: { cooldownTurns: 12, initialChancePercent: 3, growthPercent: 1, capPercent: 12, herdCount: 2 },
  standard: { cooldownTurns: 8, initialChancePercent: 4, growthPercent: 2, capPercent: 18, herdCount: 3 },
  veteran: { cooldownTurns: 5, initialChancePercent: 5, growthPercent: 3, capPercent: 25, herdCount: 4 },
};

export function getStampedeProfile(challenge: OpponentChallenge): StampedeProfile {
  return STAMPEDE_PROFILES[challenge];
}

function normalizeStampede(targetCivId: string, value: unknown, state: GameState): StampedeState | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !state.civilizations[targetCivId]) return undefined;
  const candidate = value as Partial<StampedeState>;
  if (candidate.targetCivId !== targetCivId) return undefined;
  if (!Number.isInteger(candidate.eligibleTurns) || !Number.isInteger(candidate.activeTurns)
    || !Number.isInteger(candidate.cityDamage) || !Number.isInteger(candidate.civilianDeaths)
    || !Array.isArray(candidate.pillagedTileKeys)) return undefined;
  const eligibleTurns = Number(candidate.eligibleTurns);
  const activeTurns = Number(candidate.activeTurns);
  const cityDamage = Number(candidate.cityDamage);
  const civilianDeaths = Number(candidate.civilianDeaths);
  return {
    targetCivId,
    eligibleTurns: Math.max(0, eligibleTurns),
    activeTurns: Math.max(0, activeTurns),
    cityDamage: Math.max(0, cityDamage),
    civilianDeaths: Math.max(0, civilianDeaths),
    pillagedTileKeys: [...new Set(candidate.pillagedTileKeys.filter((key): key is string => typeof key === 'string'))].sort(),
    ...(candidate.forceId && state.crisisForces?.[candidate.forceId]?.targetCivId === targetCivId ? { forceId: candidate.forceId } : {}),
    ...(candidate.phase === 'warning' || candidate.phase === 'active' || candidate.phase === 'resolved' ? { phase: candidate.phase } : {}),
    ...(candidate.outcome === 'defeated' || candidate.outcome === 'contained' || candidate.outcome === 'survived' ? { outcome: candidate.outcome } : {}),
    ...(Number.isInteger(candidate.createdTurn) ? { createdTurn: candidate.createdTurn } : {}),
    ...(Number.isInteger(candidate.resolvedTurn) ? { resolvedTurn: candidate.resolvedTurn } : {}),
    ...(Number.isInteger(candidate.lastResolvedTurn) ? { lastResolvedTurn: candidate.lastResolvedTurn } : {}),
    ...(typeof candidate.rewardGranted === 'boolean' ? { rewardGranted: candidate.rewardGranted } : {}),
    ...(candidate.herdingInsight && Number.isInteger(candidate.herdingInsight.expiresTurn)
      ? { herdingInsight: { expiresTurn: candidate.herdingInsight.expiresTurn, ...(typeof candidate.herdingInsight.consumed === 'boolean' ? { consumed: candidate.herdingInsight.consumed } : {}) } }
      : {}),
  };
}

export function normalizeStampedes(state: GameState): GameState {
  const stampedes = Object.fromEntries(Object.entries(state.stampedes ?? {}).flatMap(([targetCivId, value]) => {
    const normalized = normalizeStampede(targetCivId, value, state);
    return normalized ? [[targetCivId, normalized]] : [];
  }));
  return { ...state, stampedes };
}

/** Advances only the persisted uncertainty clock; spawning remains a later lifecycle step. */
export function advanceStampedePressure(state: GameState, targetCivId: string): GameState {
  if (!state.civilizations[targetCivId]) return state;
  const hasForcePressure = Object.values(state.crisisForces ?? {}).some(force => force.targetCivId === targetCivId);
  if (countActiveCrisesForCiv(state, targetCivId) > 0 || hasForcePressure) return state;
  const previous = state.stampedes?.[targetCivId];
  const next: StampedeState = previous
    ? { ...previous, eligibleTurns: previous.eligibleTurns + 1 }
    : { targetCivId, eligibleTurns: 1, activeTurns: 0, cityDamage: 0, civilianDeaths: 0, pillagedTileKeys: [] };
  return { ...state, stampedes: { ...(state.stampedes ?? {}), [targetCivId]: next } };
}

export function startStampedeWarning(state: GameState, targetCivId: string, severity: OpponentChallenge): GameState {
  const city = Object.values(state.cities).filter(candidate => candidate.owner === targetCivId).sort((a, b) => a.id.localeCompare(b.id))[0];
  if (!city || state.stampedes?.[targetCivId]?.phase === 'warning' || state.stampedes?.[targetCivId]?.phase === 'active') return state;
  const occupied = new Set(Object.values(state.units).filter(unit => !unit.transportId).map(unit => hexKey(unit.position)));
  const positions = mapNeighbors(state.map, city.position)
    .filter(position => state.map.tiles[hexKey(position)]?.terrain === 'plains' || state.map.tiles[hexKey(position)]?.terrain === 'grassland')
    .filter(position => !occupied.has(hexKey(position)))
    .sort((a, b) => hexKey(a).localeCompare(hexKey(b)));
  const profile = getStampedeProfile(severity);
  if (positions.length < profile.herdCount) return state;
  let next = { ...state, units: { ...state.units } };
  const forceId = `stampede-${targetCivId}-${state.turn}`;
  const unitIds = positions.slice(0, profile.herdCount).map(position => {
    const herd = createUnit('beast_stampede_herd', CRISIS_FORCE_OWNER, position, next.idCounters);
    next.units[herd.id] = herd;
    return herd.id;
  });
  next = registerCrisisForce(next, { id: forceId, targetCivId, severity, createdTurn: state.turn, unitIds });
  return {
    ...next,
    stampedes: {
      ...(next.stampedes ?? {}),
      [targetCivId]: {
        targetCivId, forceId, phase: 'warning', createdTurn: state.turn,
        eligibleTurns: 0, activeTurns: 0, cityDamage: 0, civilianDeaths: 0, pillagedTileKeys: [],
      },
    },
  };
}
