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

function isFiniteCoord(value: unknown): value is { q: number; r: number } {
  if (!value || typeof value !== 'object') return false;
  const coord = value as { q?: unknown; r?: unknown };
  return Number.isFinite(coord.q) && Number.isFinite(coord.r);
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
  if (!value || typeof value !== 'object') return null;
  const plan = value as AIStrategicPlan;
  if (
    typeof plan.id !== 'string'
    || plan.actorId !== actorId
    || typeof plan.objective !== 'string'
    || !isTarget(plan.target)
    || !PLAN_PHASES.has(plan.phase)
  ) {
    return null;
  }

  return {
    ...plan,
    target: structuredClone(plan.target),
    reasonCodes: Array.isArray(plan.reasonCodes) ? [...plan.reasonCodes] : [],
    commitment: Math.max(0, Math.min(1, Number.isFinite(plan.commitment) ? plan.commitment : 0)),
    requiredRoles: plan.requiredRoles && typeof plan.requiredRoles === 'object'
      ? { ...plan.requiredRoles }
      : {},
    assignedUnitIds: Array.isArray(plan.assignedUnitIds)
      ? [...new Set(plan.assignedUnitIds.filter(unitId => state.units[unitId]?.owner === actorId))]
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
    if (plan) defensePlansByCityId[cityId] = plan;
  }

  const upgradeRoutesByUnitId: MajorCivPlanPortfolio['upgradeRoutesByUnitId'] = {};
  for (const [unitId, route] of Object.entries(portfolio.upgradeRoutesByUnitId ?? {})) {
    const city = state.cities[route.cityId];
    if (
      state.units[unitId]?.owner === actorId
      && city?.owner === actorId
      && Number.isFinite(route.createdTurn)
    ) {
      upgradeRoutesByUnitId[unitId] = { cityId: route.cityId, createdTurn: route.createdTurn };
    }
  }

  return {
    primaryPlan: normalizePlan(state, actorId, portfolio.primaryPlan),
    defensePlansByCityId,
    upgradeRoutesByUnitId,
    modernizationDemand: Math.max(
      0,
      Math.min(100, Number.isFinite(portfolio.modernizationDemand) ? portfolio.modernizationDemand! : 0),
    ),
    researchTargetTechId: typeof portfolio.researchTargetTechId === 'string'
      ? portfolio.researchTargetTechId
      : null,
    lastPlannedTurn: Number.isFinite(portfolio.lastPlannedTurn) ? portfolio.lastPlannedTurn! : 0,
    lastExecutedTurn: Number.isFinite(portfolio.lastExecutedTurn) ? portfolio.lastExecutedTurn! : 0,
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

export function normalizeOpponentAIState(state: GameState): GameState {
  const source = state.opponentAI;
  if (!source || source.version !== 1) {
    return { ...state, opponentAI: createEmptyOpponentAIState() };
  }

  const opponentAI = createEmptyOpponentAIState();
  opponentAI.migrationGraceRoundsRemaining = Math.max(
    0,
    Number.isFinite(source.migrationGraceRoundsRemaining)
      ? Math.floor(source.migrationGraceRoundsRemaining)
      : 0,
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

  for (const [humanId, ledger] of Object.entries(source.pressureByHuman ?? {})) {
    const civ = state.civilizations[humanId];
    if (!civ?.isHuman || !ledger || typeof ledger !== 'object') continue;
    opponentAI.pressureByHuman[humanId] = {
      activeIndependentThreatIds: Array.isArray(ledger.activeIndependentThreatIds)
        ? [...new Set(ledger.activeIndependentThreatIds.filter(id => typeof id === 'string'))]
        : [],
      recoveryUntilTurn: Number.isFinite(ledger.recoveryUntilTurn) ? ledger.recoveryUntilTurn : 0,
      lastResolvedThreatTurn: Number.isFinite(ledger.lastResolvedThreatTurn)
        ? ledger.lastResolvedThreatTurn
        : null,
      lastWarningTurnByKey: ledger.lastWarningTurnByKey && typeof ledger.lastWarningTurnByKey === 'object'
        ? { ...ledger.lastWarningTurnByKey }
        : {},
      lastStrategicAudioTurn: Number.isFinite(ledger.lastStrategicAudioTurn)
        ? ledger.lastStrategicAudioTurn
        : null,
    };
  }

  return { ...state, opponentAI };
}
