import type { GameState, OpponentChallenge, StampedeState } from '@/core/types';

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
  return {
    targetCivId,
    eligibleTurns: Math.max(0, candidate.eligibleTurns),
    activeTurns: Math.max(0, candidate.activeTurns),
    cityDamage: Math.max(0, candidate.cityDamage),
    civilianDeaths: Math.max(0, candidate.civilianDeaths),
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
