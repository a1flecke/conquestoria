import type {
  AIStrategicPlan,
  AITarget,
  GameState,
  MajorCivPlanPortfolio,
  OpponentAIState,
} from './types';

const PLAN_PHASES = new Set([
  'scouting',
  'mobilizing',
  'advancing',
  'attacking',
  'consolidating',
  'withdrawing',
  'complete',
  'abandoned',
]);
const PLAN_OBJECTIVES = new Set([
  'defend',
  'recover',
  'expand',
  'secure-resource',
  'raid',
  'blockade',
  'repel',
  'capture',
  'support-ally',
]);
const PLAN_REASONS = new Set([
  'urgent-defense',
  'nearby-opportunity',
  'retaliate-recent-attack',
  'continue-active-war',
  'alliance-obligation',
  'critical-resource',
  'no-local-alternative',
  'homeland-secure',
  'recover-damaged-force',
  'modernization-gap',
  'camp-defense',
  'opportunistic-raid',
]);
const STRATEGIC_ROLES = new Set([
  'capture',
  'frontline',
  'ranged',
  'siege',
  'mobile',
  'air-combat',
  'naval-combat',
  'transport',
  'escort',
  'recon',
  'detection',
  'settlement',
  'worker',
  'resource-expedition',
  'trade',
  'espionage',
]);
const MAX_PLAN_ROLE_REQUIREMENT = 32;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isFiniteCoord(value: unknown): value is { q: number; r: number } {
  if (!value || typeof value !== 'object') return false;
  const coord = value as { q?: unknown; r?: unknown };
  return Number.isFinite(coord.q) && Number.isFinite(coord.r);
}

function isIndependentThreatId(threatId: unknown): threatId is string {
  if (typeof threatId !== 'string') return false;
  return (
    threatId.startsWith('barbarian:')
    || threatId.startsWith('pirate:')
    || threatId.startsWith('beast:')
  ) && threatId.split(':')[1]!.length > 0;
}

function isTarget(value: unknown): value is AITarget {
  if (!value || typeof value !== 'object') return false;
  const target = value as Record<string, unknown>;
  if (target.kind === 'resource') {
    return typeof target.resource === 'string' && isFiniteCoord(target.position);
  }
  if (target.kind === 'region') {
    return typeof target.id === 'string' && isFiniteCoord(target.anchor);
  }
  return (
    (target.kind === 'city' || target.kind === 'unit' || target.kind === 'camp')
    && typeof target.id === 'string'
    && isFiniteCoord(target.lastKnownPosition)
  );
}

function normalizePlan(
  state: GameState,
  actorId: string,
  value: unknown,
): AIStrategicPlan | null {
  if (!isRecord(value)) return null;
  const plan = value as unknown as AIStrategicPlan;
  if (
    typeof plan.id !== 'string'
    || plan.id.length === 0
    || plan.actorId !== actorId
    || !PLAN_OBJECTIVES.has(plan.objective)
    || !isTarget(plan.target)
    || !PLAN_PHASES.has(plan.phase)
    || typeof plan.theaterId !== 'string'
    || !Number.isFinite(plan.createdTurn)
    || !Number.isFinite(plan.reconsiderAfterTurn)
    || !Number.isFinite(plan.expiresAfterTurn)
    || !Number.isFinite(plan.lastProgressTurn)
  ) {
    return null;
  }

  const requiredRoles: AIStrategicPlan['requiredRoles'] = {};
  if (isRecord(plan.requiredRoles)) {
    for (const [role, count] of Object.entries(plan.requiredRoles)) {
      if (STRATEGIC_ROLES.has(role) && Number.isFinite(count) && Number(count) > 0) {
        requiredRoles[role as keyof typeof requiredRoles] = Math.min(
          MAX_PLAN_ROLE_REQUIREMENT,
          Math.floor(Number(count)),
        );
      }
    }
  }

  return {
    id: plan.id,
    actorId,
    objective: plan.objective,
    target: structuredClone(plan.target),
    theaterId: plan.theaterId,
    phase: plan.phase,
    reasonCodes: Array.isArray(plan.reasonCodes)
      ? plan.reasonCodes.filter(reason => PLAN_REASONS.has(reason))
      : [],
    commitment: Math.max(0, Math.min(1, Number.isFinite(plan.commitment) ? plan.commitment : 0)),
    createdTurn: Math.max(0, Math.floor(plan.createdTurn)),
    reconsiderAfterTurn: Math.max(0, Math.floor(plan.reconsiderAfterTurn)),
    expiresAfterTurn: Math.max(0, Math.floor(plan.expiresAfterTurn)),
    lastProgressTurn: Math.max(0, Math.floor(plan.lastProgressTurn)),
    requiredRoles,
    assignedUnitIds: Array.isArray(plan.assignedUnitIds)
      ? [...new Set(plan.assignedUnitIds.filter(unitId =>
          typeof unitId === 'string'
          && (
            state.units[unitId]?.owner === actorId
            || state.barbarianCamps[actorId]
              && state.units[unitId]?.owner === 'barbarian'
              && state.opponentAI?.barbarianHomeCampByUnitId?.[unitId] === actorId
          )))]
      : [],
    ...(isFiniteCoord(plan.rallyPoint) ? { rallyPoint: { ...plan.rallyPoint } } : { rallyPoint: undefined }),
  };
}

function normalizePortfolio(
  state: GameState,
  actorId: string,
  value: unknown,
): MajorCivPlanPortfolio {
  const portfolio = value && typeof value === 'object'
    ? value as Partial<MajorCivPlanPortfolio>
    : {};
  const defensePlansByCityId: Record<string, AIStrategicPlan> = {};
  for (const [cityId, planValue] of Object.entries(portfolio.defensePlansByCityId ?? {})) {
    if (state.cities[cityId]?.owner !== actorId) continue;
    const plan = normalizePlan(state, actorId, planValue);
    if (
      plan?.objective === 'defend'
      && plan.target.kind === 'city'
      && plan.target.id === cityId
    ) {
      defensePlansByCityId[cityId] = plan;
    }
  }
  const normalizedPrimary = normalizePlan(state, actorId, portfolio.primaryPlan);

  const upgradeRoutesByUnitId: MajorCivPlanPortfolio['upgradeRoutesByUnitId'] = {};
  for (const [unitId, route] of Object.entries(portfolio.upgradeRoutesByUnitId ?? {})) {
    if (!isRecord(route) || typeof route.cityId !== 'string') continue;
    const city = state.cities[route.cityId];
    if (
      state.units[unitId]?.owner === actorId
      && city?.owner === actorId
      && Number.isFinite(route.createdTurn)
    ) {
      upgradeRoutesByUnitId[unitId] = {
        cityId: String(route.cityId),
        createdTurn: Math.max(0, Math.floor(Number(route.createdTurn))),
      };
    }
  }

  return {
    primaryPlan: normalizedPrimary?.objective === 'defend' ? null : normalizedPrimary,
    defensePlansByCityId,
    upgradeRoutesByUnitId,
    modernizationDemand: Math.max(
      0,
      Math.min(100, Number.isFinite(portfolio.modernizationDemand) ? portfolio.modernizationDemand! : 0),
    ),
    researchTargetTechId: typeof portfolio.researchTargetTechId === 'string'
      ? portfolio.researchTargetTechId
      : null,
    lastPlannedTurn: Number.isFinite(portfolio.lastPlannedTurn)
      ? Math.max(-1, Math.floor(portfolio.lastPlannedTurn!))
      : -1,
    lastExecutedTurn: Number.isFinite(portfolio.lastExecutedTurn)
      ? Math.max(-1, Math.floor(portfolio.lastExecutedTurn!))
      : -1,
  };
}

export function createEmptyOpponentAIState(): OpponentAIState {
  return {
    version: 1,
    migrationGraceRoundsRemaining: 0,
    majorCivs: {},
    barbarianCamps: {},
    barbarianHomeCampByUnitId: {},
    minorCivs: {},
    pressureByHuman: {},
    lastPlannedRound: null,
    lastProcessedRound: null,
    lastFinalizedRound: null,
  };
}

export function createEmptyMajorCivPlanPortfolio(): MajorCivPlanPortfolio {
  return {
    primaryPlan: null,
    defensePlansByCityId: {},
    upgradeRoutesByUnitId: {},
    modernizationDemand: 0,
    researchTargetTechId: null,
    lastPlannedTurn: -1,
    lastExecutedTurn: -1,
  };
}

export function normalizeOpponentAIState(state: GameState): GameState {
  const source = state.opponentAI;
  if (!source || source.version !== 1) {
    return { ...state, opponentAI: createEmptyOpponentAIState() };
  }

  const opponentAI = createEmptyOpponentAIState();
  opponentAI.migrationGraceRoundsRemaining = Math.min(
    2,
    Math.max(
      0,
      Number.isFinite(source.migrationGraceRoundsRemaining)
        ? Math.floor(source.migrationGraceRoundsRemaining)
        : 0,
    ),
  );
  opponentAI.lastPlannedRound = Number.isFinite(source.lastPlannedRound)
    ? source.lastPlannedRound
    : null;
  opponentAI.lastProcessedRound = Number.isFinite(source.lastProcessedRound)
    ? source.lastProcessedRound
    : null;
  opponentAI.lastFinalizedRound = Number.isFinite(source.lastFinalizedRound)
    ? source.lastFinalizedRound
    : null;

  for (const [actorId, value] of Object.entries(source.majorCivs ?? {})) {
    const civ = state.civilizations[actorId];
    if (!civ || civ.isHuman || civ.isEliminated) continue;
    opponentAI.majorCivs[actorId] = normalizePortfolio(state, actorId, value);
  }

  for (const [campId, value] of Object.entries(source.barbarianCamps ?? {})) {
    if (!state.barbarianCamps[campId]) continue;
    const plan = normalizePlan(state, campId, value);
    if (plan) opponentAI.barbarianCamps[campId] = plan;
  }

  for (const [unitId, campId] of Object.entries(source.barbarianHomeCampByUnitId ?? {})) {
    if (state.units[unitId]?.owner === 'barbarian' && state.barbarianCamps[campId]) {
      opponentAI.barbarianHomeCampByUnitId[unitId] = campId;
    }
  }

  for (const [minorId, value] of Object.entries(source.minorCivs ?? {})) {
    if (!state.minorCivs[minorId] || state.minorCivs[minorId].isDestroyed) continue;
    const plan = normalizePlan(state, minorId, value);
    if (plan) opponentAI.minorCivs[minorId] = plan;
  }

  const livingHumanIds = Object.values(state.civilizations)
    .filter(civ => civ.isHuman && !civ.isEliminated)
    .map(civ => civ.id)
    .sort();
  for (const humanId of livingHumanIds) {
    const ledger = source.pressureByHuman?.[humanId];
    opponentAI.pressureByHuman[humanId] = {
      activeIndependentThreatIds: Array.isArray(ledger?.activeIndependentThreatIds)
        ? [...new Set(ledger.activeIndependentThreatIds
            .filter(id => isIndependentThreatId(id)))]
            .sort()
        : [],
      recoveryUntilTurn: Number.isFinite(ledger?.recoveryUntilTurn)
        ? Math.max(0, Math.floor(ledger!.recoveryUntilTurn))
        : 0,
      lastResolvedThreatTurn: Number.isFinite(ledger?.lastResolvedThreatTurn)
        ? Math.max(0, Math.floor(ledger!.lastResolvedThreatTurn!))
        : null,
      lastWarningTurnByKey: Object.fromEntries(
        Object.entries(ledger?.lastWarningTurnByKey ?? {})
          .filter((entry): entry is [string, number] => Number.isFinite(entry[1]))
          .map(([key, turn]) => [key, Math.max(0, Math.floor(turn))]),
      ),
      lastStrategicAudioTurn: Number.isFinite(ledger?.lastStrategicAudioTurn)
        ? Math.max(0, Math.floor(ledger!.lastStrategicAudioTurn!))
        : null,
    };
  }

  return { ...state, opponentAI };
}
