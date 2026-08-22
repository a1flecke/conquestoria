import { CRISIS_FORCE_OWNER, isMajorCivOwner } from '@/core/owner-kind';
import type { CrisisForce, GameState, OpponentChallenge } from '@/core/types';
import { resolvePressureSeverityForCiv } from '@/core/opponent-challenge';
import type { HerdRoute } from '@/core/types';

export { CRISIS_FORCE_OWNER } from '@/core/owner-kind';

export const CRISIS_FORCE_PRESENTATION = {
  label: 'Crisis Force',
  color: '#b84a3a',
} as const;

function isValidSeverity(value: unknown): value is OpponentChallenge {
  return value === 'explorer' || value === 'standard' || value === 'veteran';
}

function normalizeForce(
  state: GameState,
  recordId: string,
  candidate: unknown,
  claimedUnitIds: ReadonlySet<string>,
): CrisisForce | null {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return null;
  const record = candidate as Partial<CrisisForce>;
  const createdTurn = Number(record.createdTurn);
  if (
    record.id !== recordId
    || !recordId
    || typeof record.targetCivId !== 'string'
    || !isMajorCivOwner(record.targetCivId)
    || !state.civilizations[record.targetCivId]
    || state.civilizations[record.targetCivId].isEliminated
    || !isValidSeverity(record.severity)
    || !Number.isInteger(createdTurn)
    || !Array.isArray(record.unitIds)
  ) return null;

  const unitIds = [...new Set(record.unitIds)]
    .filter((unitId): unitId is string => typeof unitId === 'string')
    .filter(unitId => !claimedUnitIds.has(unitId) && state.units[unitId]?.owner === CRISIS_FORCE_OWNER)
    .sort();
  if (unitIds.length === 0) return null;

  const herdRoutes = Object.fromEntries(Object.entries(record.herdRoutes ?? {}).flatMap(([unitId, route]) => {
    if (!unitIds.includes(unitId) || !route || typeof route !== 'object') return [];
    const candidate = route as Partial<HerdRoute>;
    if (candidate.unitId !== unitId || !Number.isInteger(candidate.committedTurn) || !Array.isArray(candidate.steps) || candidate.steps.length > 2) return [];
    const steps = candidate.steps.filter(step => Number.isInteger(step?.q) && Number.isInteger(step?.r));
    return steps.length === candidate.steps.length ? [[unitId, { unitId, committedTurn: Number(candidate.committedTurn), steps }]] : [];
  }));
  return {
    id: recordId,
    targetCivId: record.targetCivId,
    unitIds,
    createdTurn,
    severity: record.severity,
    ...(Object.keys(herdRoutes).length > 0 ? { herdRoutes } : {}),
  };
}

export function normalizeCrisisForces(state: GameState): GameState {
  if (
    Object.keys(state.crisisForces ?? {}).length === 0
    && !Object.values(state.units).some(unit => unit.owner === CRISIS_FORCE_OWNER)
  ) return state;
  const claimedUnitIds = new Set<string>();
  const crisisForces: Record<string, CrisisForce> = {};
  const records = state.crisisForces && typeof state.crisisForces === 'object'
    ? Object.entries(state.crisisForces as Record<string, unknown>)
    : [];

  for (const [recordId, candidate] of records.sort(([left], [right]) => left.localeCompare(right))) {
    const normalized = normalizeForce(state, recordId, candidate, claimedUnitIds);
    if (!normalized) continue;
    normalized.unitIds.forEach(unitId => claimedUnitIds.add(unitId));
    crisisForces[recordId] = normalized;
  }

  const units = Object.fromEntries(Object.entries(state.units).filter(([unitId, unit]) =>
    unit.owner !== CRISIS_FORCE_OWNER || claimedUnitIds.has(unitId),
  ));
  return { ...state, crisisForces, units };
}

export function resolveCrisisForceSeverity(
  state: Pick<GameState, 'opponentChallenge' | 'civilizations'>,
  targetCivId: string,
): OpponentChallenge {
  return resolvePressureSeverityForCiv(state, targetCivId);
}

export function registerCrisisForce(state: GameState, force: CrisisForce): GameState {
  return normalizeCrisisForces({
    ...state,
    crisisForces: {
      ...(state.crisisForces ?? {}),
      [force.id]: { ...force, unitIds: [...force.unitIds] },
    },
  });
}
