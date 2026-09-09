import type {
  AIStrategicPlan,
  GameState,
  MajorCivPlanPortfolio,
} from '@/core/types';
import type { EventBus } from '@/core/event-bus';
import { cancelInvalidNetworkPlans } from '@/systems/network-plan-system';
import { getCivilizationLiveness } from './civilization-liveness';
import { recordDominationDefeat } from './domination-intel';

export type CivilizationEliminationResult =
  | { state: GameState; eliminated: false }
  | {
      state: GameState;
      eliminated: true;
      civId: string;
      eliminatedBy: string | null;
      removedUnitIds: string[];
      removedSpyIds: string[];
    };

export type CivilizationLivenessTransition =
  | { kind: 'cityless'; civId: string }
  | { kind: 'resettled'; civId: string }
  | {
      kind: 'eliminated';
      civId: string;
      eliminatedBy: string | null;
      removedUnitIds: string[];
      removedSpyIds: string[];
      releasedVassalIds: string[];
    };

export interface CivilizationLivenessReconciliation {
  state: GameState;
  transitions: CivilizationLivenessTransition[];
}

function removeAssignedUnits(
  plan: AIStrategicPlan | null,
  removed: Set<string>,
): AIStrategicPlan | null {
  return plan
    ? { ...plan, assignedUnitIds: plan.assignedUnitIds.filter(id => !removed.has(id)) }
    : null;
}

function scrubPortfolio(
  portfolio: MajorCivPlanPortfolio,
  removed: Set<string>,
): MajorCivPlanPortfolio {
  return {
    ...portfolio,
    primaryPlan: removeAssignedUnits(portfolio.primaryPlan, removed),
    defensePlansByCityId: Object.fromEntries(
      Object.entries(portfolio.defensePlansByCityId).map(([id, plan]) => [
        id,
        removeAssignedUnits(plan, removed)!,
      ]),
    ),
    upgradeRoutesByUnitId: Object.fromEntries(
      Object.entries(portfolio.upgradeRoutesByUnitId)
        .filter(([unitId]) => !removed.has(unitId)),
    ),
  };
}

export function eliminateCivilization(
  state: GameState,
  civId: string,
  eliminatedBy: string | null,
): CivilizationEliminationResult {
  const civilization = state.civilizations[civId];
  if (!civilization || getCivilizationLiveness(state, civId).reason !== 'no-survival-assets') {
    return { state, eliminated: false };
  }

  const next = structuredClone(state);
  const defaultVassalage = {
    overlord: null,
    vassals: [],
    protectionScore: 100,
    protectionTimers: [],
    peakCities: 0,
    peakMilitary: 0,
  };
  const removedUnitIds = Object.values(next.units)
    .filter(unit => unit.owner === civId)
    .map(unit => unit.id);
  const removedUnits = new Set(removedUnitIds);
  for (const unitId of removedUnitIds) {
    delete next.units[unitId];
  }
  next.civilizations[civId] = {
    ...next.civilizations[civId],
    cities: [],
    units: [],
    isEliminated: true,
    nearDefeat: false,
    diplomacy: { ...next.civilizations[civId].diplomacy,
      relationships: {},
      atWarWith: [],
      treaties: [],
      events: [],
      vassalage: { ...defaultVassalage, ...(next.civilizations[civId].diplomacy.vassalage ?? {}), overlord: null, vassals: [], protectionScore: 100, protectionTimers: [] },
    },
  };

  for (const [otherId, other] of Object.entries(next.civilizations)) {
    if (otherId === civId) continue;
    const relationships = { ...other.diplomacy.relationships };
    delete relationships[civId];
    const satelliteSurveillanceTargets = { ...other.satelliteSurveillanceTargets };
    const otherVassalage = { ...defaultVassalage, ...(other.diplomacy.vassalage ?? {}) };
    delete satelliteSurveillanceTargets[civId];
    next.civilizations[otherId] = {
      ...other,
      satelliteSurveillanceTargets,
      diplomacy: {
        ...other.diplomacy,
        relationships,
        atWarWith: other.diplomacy.atWarWith.filter(id => id !== civId),
        treaties: other.diplomacy.treaties.filter(
          treaty => treaty.civA !== civId && treaty.civB !== civId,
        ),
        events: other.diplomacy.events.filter(event => event.otherCiv !== civId),
        vassalage: {
          ...otherVassalage,
          overlord: otherVassalage.overlord === civId
            ? null
            : otherVassalage.overlord,
          vassals: otherVassalage.vassals.filter(id => id !== civId),
          protectionScore: otherVassalage.overlord === civId ? 100 : otherVassalage.protectionScore,
          protectionTimers: otherVassalage.overlord === civId ? [] : otherVassalage.protectionTimers
            .filter(timer => timer.attackerCivId !== civId),
        },
      },
    };
  }

  next.embargoes = (next.embargoes ?? [])
    .filter(embargo => embargo.targetCivId !== civId)
    .map(embargo => ({
      ...embargo,
      participants: embargo.participants.filter(id => id !== civId),
    }))
    .filter(embargo => embargo.participants.length > 0);
  next.defensiveLeagues = (next.defensiveLeagues ?? [])
    .map(league => ({ ...league, members: league.members.filter(id => id !== civId) }))
    .filter(league => league.members.length >= 2);
  next.pendingDiplomacyRequests = (next.pendingDiplomacyRequests ?? [])
    .filter(request => request.fromCivId !== civId && request.toCivId !== civId);
  if (next.pendingEvents) {
    delete next.pendingEvents[civId];
  }

  const removedSpyIds = Object.keys(next.espionage?.[civId]?.spies ?? {});
  if (next.espionage) {
    delete next.espionage[civId];
    for (const espionage of Object.values(next.espionage)) {
      for (const [spyId, spy] of Object.entries(espionage.spies)) {
        if (spy.targetCivId !== civId) continue;
        espionage.spies[spyId] = {
          ...spy,
          targetCivId: null,
          targetCityId: null,
          infiltrationCityId: null,
          currentMission: null,
          status: 'idle',
          position: null,
        };
      }
      espionage.detectedThreats = Object.fromEntries(
        Object.entries(espionage.detectedThreats ?? {})
          .filter(([, threat]) => threat.foreignCivId !== civId),
      );
      espionage.activeInterrogations = Object.fromEntries(
        Object.entries(espionage.activeInterrogations ?? {})
          .filter(([, interrogation]) => interrogation.spyOwner !== civId),
      );
    }
  }

  if (next.opponentAI) {
    delete next.opponentAI.majorCivs[civId];
    delete next.opponentAI.pressureByCiv[civId];
    for (const [otherId, portfolio] of Object.entries(next.opponentAI.majorCivs)) {
      next.opponentAI.majorCivs[otherId] = scrubPortfolio(portfolio, removedUnits);
    }
    next.opponentAI.barbarianHomeCampByUnitId = Object.fromEntries(
      Object.entries(next.opponentAI.barbarianHomeCampByUnitId)
        .filter(([unitId]) => !removedUnits.has(unitId)),
    );
  }

  if (next.marketplace) {
    next.marketplace.tradeRoutes = next.marketplace.tradeRoutes
      .filter(route => route.foreignCivId !== civId);
    next.marketplace.purchasedResources = (next.marketplace.purchasedResources ?? [])
      .filter(entry => entry.civId !== civId);
  }

  return {
    state: cancelInvalidNetworkPlans(next).state,
    eliminated: true,
    civId,
    eliminatedBy,
    removedUnitIds,
    removedSpyIds,
  };
}

export function reconcileCivilizationLiveness(
  before: GameState,
  after: GameState,
  eliminatedBy: string | null | Readonly<Record<string, string | null>> = null,
): CivilizationLivenessReconciliation {
  let working = after;
  const transitions: CivilizationLivenessTransition[] = [];

  for (const civId of Object.keys(after.civilizations).sort()) {
    const verdict = getCivilizationLiveness(working, civId);
    if (verdict.reason === 'no-survival-assets') {
      const releasedVassalIds = Object.entries(working.civilizations)
        .filter(([, civ]) => civ.diplomacy?.vassalage?.overlord === civId)
        .map(([id]) => id)
        .sort();
      const victor = eliminatedBy !== null && typeof eliminatedBy === 'object'
        ? eliminatedBy[civId] ?? null
        : eliminatedBy;
      const result = eliminateCivilization(working, civId, victor);
      working = result.state;
      if (result.eliminated) {
        working = recordDominationDefeat(before, working, {
          civId: result.civId,
          eliminatedBy: result.eliminatedBy,
        });
        transitions.push({
          kind: 'eliminated',
          civId,
          eliminatedBy: result.eliminatedBy,
          removedUnitIds: result.removedUnitIds,
          removedSpyIds: result.removedSpyIds,
          releasedVassalIds,
        });
      }
      continue;
    }

    const previous = getCivilizationLiveness(before, civId);
    if (previous.reason === 'city' && verdict.reason === 'settler') {
      transitions.push({ kind: 'cityless', civId });
    } else if (previous.reason === 'settler' && verdict.reason === 'city') {
      transitions.push({ kind: 'resettled', civId });
    }
  }

  return { state: working, transitions };
}

export function emitCivilizationLivenessTransitions(
  result: CivilizationLivenessReconciliation,
  bus: EventBus,
): void {
  for (const transition of result.transitions) {
    if (transition.kind === 'cityless') {
      bus.emit('civ:resettlement-needed', { civId: transition.civId });
      continue;
    }
    if (transition.kind === 'resettled') {
      bus.emit('civ:resettled', { civId: transition.civId });
      continue;
    }
    for (const vassalId of transition.releasedVassalIds) {
      bus.emit('diplomacy:vassalage-ended', {
        vassalId,
        overlordId: transition.civId,
        reason: 'overlord_eliminated',
      });
    }
    bus.emit('civ:eliminated', {
      civId: transition.civId,
      eliminatedBy: transition.eliminatedBy,
    });
  }
}
