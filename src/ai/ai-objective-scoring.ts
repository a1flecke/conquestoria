import type {
  AIPlanReason,
  AIStrategicObjective,
  AIStrategicRole,
  AITarget,
  GameMap,
  HexCoord,
} from '@/core/types';
import { hexDistance, hexKey, wrappedHexDistance } from '@/systems/hex-utils';
import { findPath } from '@/systems/unit-system';
import { createAIDecisionTrace, type AIDecisionTrace } from './ai-decision-trace';
import type { RegionCrossing } from './ai-amphibious-routing';

export interface AIObjectiveCandidate {
  objective: AIStrategicObjective;
  target: AITarget;
  theaterId: string;
  travelTurns: number;
  strategicValue: number;
  expectedLossRatio: number;
  supplyDistance: number;
  explicitDistantReasons: AIPlanReason[];
  /** Informational reasons that never change locality eligibility or score. */
  reasonCodes?: AIPlanReason[];
  requiredRoles: Partial<Record<AIStrategicRole, number>>;
  supportRoles?: Partial<Record<AIStrategicRole, number>>;
}

export interface AIObjectiveTravelCandidate extends Omit<AIObjectiveCandidate, 'travelTurns'> {
  start: { q: number; r: number };
  domain: 'land' | 'naval' | 'air';
  movementPoints: number;
  completedMovementTechHash: string;
}

export interface AIObjectiveChoiceContext {
  actorId: string;
  turn: number;
  candidates: readonly AIObjectiveCandidate[];
  availableRoles: Partial<Record<AIStrategicRole, number>>;
}

export interface AIObjectiveChoice {
  plan: {
    objective: AIStrategicObjective;
    target: AITarget;
    theaterId: string;
    reasonCodes: AIPlanReason[];
    requiredRoles: Partial<Record<AIStrategicRole, number>>;
    supportRoles?: Partial<Record<AIStrategicRole, number>>;
    score: number;
  } | null;
  /** Desired capability cardinality for readiness production. */
  demands: Partial<Record<AIStrategicRole, number>>;
  eligibleCandidateIds: string[];
  trace: AIDecisionTrace;
}

const DISTANT_ELIGIBILITY_REASONS = new Set<AIPlanReason>([
  'retaliate-recent-attack',
  'continue-active-war',
  'alliance-obligation',
  'critical-resource',
  'no-local-alternative',
]);

const OFFENSIVE_OBJECTIVES = new Set<AIStrategicObjective>([
  'raid',
  'blockade',
  'repel',
  'capture',
  'support-ally',
]);

function finiteClamped(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) return minimum;
  return Math.max(minimum, Math.min(maximum, value));
}

export function targetStableKey(target: AITarget): string {
  switch (target.kind) {
    case 'city':
    case 'unit':
    case 'camp':
      return `${target.kind}:${target.id}`;
    case 'resource':
      return `resource:${target.resource}:${hexKey(target.position)}`;
    case 'region':
      return `region:${target.id}`;
  }
}

function candidateId(candidate: AIObjectiveCandidate): string {
  return `${candidate.objective}:${targetStableKey(candidate.target)}`;
}

export function scoreObjectiveCandidate(candidate: AIObjectiveCandidate): number {
  if (!Number.isFinite(candidate.travelTurns) || candidate.travelTurns < 0) {
    return -Number.MAX_VALUE;
  }
  const travelTurns = finiteClamped(candidate.travelTurns, 0, Number.MAX_SAFE_INTEGER);
  const strategicValue = finiteClamped(candidate.strategicValue, 0, 100);
  const expectedLossRatio = finiteClamped(candidate.expectedLossRatio, 0, 2);
  const supplyDistance = finiteClamped(candidate.supplyDistance, 0, Number.MAX_SAFE_INTEGER);
  const distancePenalty = 4 * travelTurns + 0.75 * travelTurns * travelTurns;
  const lossPenalty = 35 * expectedLossRatio;
  const supplyPenalty = 2 * supplyDistance;
  const distantReasonBonus = candidate.explicitDistantReasons.length > 0 ? 35 : 0;
  return strategicValue
    + distantReasonBonus
    - distancePenalty
    - lossPenalty
    - supplyPenalty;
}

export function getObjectiveApproximateDistance(
  map: Pick<GameMap, 'width' | 'wrapsHorizontally'>,
  start: { q: number; r: number },
  target: { q: number; r: number },
): number {
  return map.wrapsHorizontally
    ? wrappedHexDistance(start, target, map.width)
    : hexDistance(start, target);
}

function targetPosition(target: AITarget): { q: number; r: number } {
  switch (target.kind) {
    case 'city':
    case 'unit':
    case 'camp':
      return target.lastKnownPosition;
    case 'resource':
      return target.position;
    case 'region':
      return target.anchor;
  }
}

/** #1066: a land-domain candidate embarks for one whole turn regardless of
 * remaining movement points -- verified against `loadUnitOntoTransport`
 * (`transport-system.ts`), which unconditionally sets `movementPointsLeft: 0,
 * hasMoved: true, hasActed: true` on the loading unit. Disembarking needs no
 * matching overhead: `canUnloadUnitFromTransport` only requires ordinary
 * unused movement, and the unit's step onto the destination land tile is
 * already counted by the final land leg's own pathfind. */
const AMPHIBIOUS_EMBARK_OVERHEAD_TURNS = 1;

export function resolveObjectiveTravelCandidates(
  map: GameMap,
  candidates: readonly AIObjectiveTravelCandidate[],
  crossings: ReadonlyMap<string, RegionCrossing> = new Map(),
  pathfinder: typeof findPath = findPath,
): AIObjectiveCandidate[] {
  const perObjective = new Map<AIStrategicObjective, AIObjectiveTravelCandidate[]>();
  for (const candidate of candidates) {
    const group = perObjective.get(candidate.objective) ?? [];
    group.push(candidate);
    perObjective.set(candidate.objective, group);
  }

  const approximate = [...perObjective.values()]
    .flatMap(group => group
      .sort((left, right) => {
        const distanceDelta = getObjectiveApproximateDistance(
          map,
          left.start,
          targetPosition(left.target),
        ) - getObjectiveApproximateDistance(map, right.start, targetPosition(right.target));
        return distanceDelta || targetStableKey(left.target).localeCompare(targetStableKey(right.target));
      })
      .slice(0, 8))
    .sort((left, right) => {
      const distanceDelta = getObjectiveApproximateDistance(
        map,
        left.start,
        targetPosition(left.target),
      ) - getObjectiveApproximateDistance(map, right.start, targetPosition(right.target));
      return distanceDelta || candidateId({ ...left, travelTurns: 0 })
        .localeCompare(candidateId({ ...right, travelTurns: 0 }));
    })
    .slice(0, 24);

  const pathLengthByKey = new Map<string, number | null>();
  const pathLength = (
    from: HexCoord,
    to: HexCoord,
    domain: 'land' | 'naval' | 'air',
    techHash: string,
  ): number | null => {
    const cacheKey = [domain, hexKey(from), hexKey(to), techHash].join(':');
    if (!pathLengthByKey.has(cacheKey)) {
      const path = pathfinder(from, to, map, domain);
      pathLengthByKey.set(cacheKey, path ? Math.max(0, path.length - 1) : null);
    }
    return pathLengthByKey.get(cacheKey)!;
  };

  return approximate.map(candidate => {
    const destination = targetPosition(candidate.target);
    const movementPoints = Math.max(1, Math.floor(candidate.movementPoints));
    const directLength = pathLength(
      candidate.start,
      destination,
      candidate.domain,
      candidate.completedMovementTechHash,
    );

    const {
      start: _start,
      domain: _domain,
      movementPoints: _movementPoints,
      completedMovementTechHash: _completedMovementTechHash,
      ...objective
    } = candidate;

    if (directLength !== null) {
      return {
        ...objective,
        travelTurns: Math.ceil(directLength / movementPoints),
      };
    }

    // #1066: a land-domain candidate with no direct path may still be
    // reachable by sea. `crossings` is empty for a same-region failure
    // (findRegionCrossings never records a crossing back into an origin
    // region), so this only ever fires for a genuine water gap.
    if (candidate.domain === 'land') {
      const targetRegionKey = map.tiles[hexKey(destination)]?.regionKey;
      const crossing = targetRegionKey ? crossings.get(targetRegionKey) : undefined;
      if (crossing) {
        const toEmbark = pathLength(candidate.start, crossing.embarkTile, 'land', candidate.completedMovementTechHash);
        const fromDisembark = pathLength(crossing.disembarkTile, destination, 'land', candidate.completedMovementTechHash);
        if (toEmbark !== null && fromDisembark !== null) {
          const landTurns = Math.ceil(toEmbark / movementPoints) + Math.ceil(fromDisembark / movementPoints);
          const navalTurns = Math.ceil(crossing.navalDistance / movementPoints);
          return {
            ...objective,
            travelTurns: landTurns + AMPHIBIOUS_EMBARK_OVERHEAD_TURNS + navalTurns,
          requiredRoles: { ...objective.requiredRoles, transport: 1 },
          supportRoles: objective.supportRoles ? { ...objective.supportRoles } : undefined,
          };
        }
      }
    }

    return {
      ...objective,
      travelTurns: Number.POSITIVE_INFINITY,
    };
  });
}

function missingRoles(
  candidate: AIObjectiveCandidate,
  availableRoles: AIObjectiveChoiceContext['availableRoles'],
): AIStrategicRole[] {
  return (Object.entries(candidate.requiredRoles) as Array<[AIStrategicRole, number]>)
    .filter(([role, count]) => (availableRoles[role] ?? 0) < count)
    .map(([role]) => role);
}

export function choosePrimaryObjective(
  context: AIObjectiveChoiceContext,
): AIObjectiveChoice {
  const analyzed = context.candidates.map(candidate => {
    const reasons = candidate.explicitDistantReasons
      .filter(reason => DISTANT_ELIGIBILITY_REASONS.has(reason));
    const missing = missingRoles(candidate, context.availableRoles);
    const exactTargetKnown = !(
      candidate.target.kind === 'region'
      && OFFENSIVE_OBJECTIVES.has(candidate.objective)
    );
    const pathReachable = Number.isFinite(candidate.travelTurns) && candidate.travelTurns >= 0;
    const informationalReasons = candidate.reasonCodes ?? [];
    return {
      candidate: { ...candidate, explicitDistantReasons: reasons },
      id: candidateId(candidate),
      reasons: [...informationalReasons, ...reasons],
      distantReasons: reasons,
      missing,
      exactTargetKnown,
      pathReachable,
      baseEligible: missing.length === 0 && exactTargetKnown && pathReachable,
    };
  });

  const pathCandidates = analyzed.filter(entry => entry.baseEligible);
  const nearestTurns = pathCandidates.length > 0
    ? Math.min(...pathCandidates.map(entry => entry.candidate.travelTurns))
    : Number.POSITIVE_INFINITY;
  const localityLimit = Number.isFinite(nearestTurns)
    ? Math.max(nearestTurns + 3, Math.ceil(nearestTurns * 1.5))
    : Number.NEGATIVE_INFINITY;

  const ranked = analyzed.map(entry => {
    const local = entry.candidate.travelTurns <= localityLimit;
    const eligible = entry.baseEligible && (local || entry.distantReasons.length > 0);
    return {
      ...entry,
      eligible,
      score: scoreObjectiveCandidate(entry.candidate),
    };
  });

  const selected = ranked
    .filter(entry => entry.eligible)
    .sort((left, right) =>
      right.score - left.score || left.id.localeCompare(right.id))[0];

  // A pre-plan readiness demand is scaffolding, not a request to build every
  // role for every analyzed opportunity. Once an objective is viable it needs
  // no scaffolding; when none is viable, choose one reachable local (or
  // explicitly justified distant) target deterministically. A retained capture
  // plan later owns its own deficit in ai-prepared-turn.
  const readinessReachable = ranked.filter(entry => entry.pathReachable);
  const readinessNearestTurns = readinessReachable.length > 0
    ? Math.min(...readinessReachable.map(entry => entry.candidate.travelTurns))
    : Number.POSITIVE_INFINITY;
  const readinessLocalityLimit = Number.isFinite(readinessNearestTurns)
    ? Math.max(readinessNearestTurns + 3, Math.ceil(readinessNearestTurns * 1.5))
    : Number.NEGATIVE_INFINITY;
  const readiness = selected
    ? undefined
    : readinessReachable
      .filter(entry =>
        entry.candidate.travelTurns <= readinessLocalityLimit
        || entry.distantReasons.length > 0)
      .sort((left, right) =>
        right.score - left.score || left.id.localeCompare(right.id))[0];
  const demands: Partial<Record<AIStrategicRole, number>> = {};
  if (readiness) {
    for (const role of readiness.missing) {
      demands[role] = readiness.candidate.requiredRoles[role] ?? 0;
    }
    if (!readiness.exactTargetKnown) demands.recon = 1;
  }

  const selectedReasons = selected ? [...selected.reasons] : [];
  if (
    selected
    && selectedReasons.length === 0
    && selected.candidate.travelTurns > 6
    && selected.candidate.travelTurns === nearestTurns
  ) {
    selectedReasons.push('no-local-alternative');
  }

  const trace = createAIDecisionTrace({
    actorId: context.actorId,
    turn: context.turn,
    decision: 'objective',
    selectedId: selected?.id ?? null,
    candidates: ranked.map(entry => ({
      id: entry.id,
      score: entry.score,
      eligible: entry.eligible,
      reasonCodes: entry.reasons,
    })),
  });

  return {
    plan: selected
      ? {
          objective: selected.candidate.objective,
          target: selected.candidate.target,
          theaterId: selected.candidate.theaterId,
          reasonCodes: selectedReasons,
          requiredRoles: { ...selected.candidate.requiredRoles },
          supportRoles: selected.candidate.supportRoles ? { ...selected.candidate.supportRoles } : undefined,
          score: selected.score,
        }
      : null,
    demands,
    eligibleCandidateIds: ranked
      .filter(entry => entry.eligible)
      .map(entry => entry.id),
    trace,
  };
}
