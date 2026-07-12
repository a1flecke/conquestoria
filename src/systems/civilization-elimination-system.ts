import type {
  AIStrategicPlan,
  GameState,
  MajorCivPlanPortfolio,
} from '@/core/types';
import { cancelInvalidNetworkPlans } from '@/systems/network-plan-system';

export type CivilizationEliminationResult =
  | { state: GameState; eliminated: false }
  | {
      state: GameState;
      eliminated: true;
      civId: string;
      eliminatedBy: string;
      removedUnitIds: string[];
      removedSpyIds: string[];
    };

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
  eliminatedBy: string,
): CivilizationEliminationResult {
  const civilization = state.civilizations[civId];
  if (!civilization || civilization.isEliminated || civilization.cities.length > 0) {
    return { state, eliminated: false };
  }

  const next = structuredClone(state);
  const removedUnitIds = Object.values(next.units)
    .filter(unit => unit.owner === civId)
    .map(unit => unit.id);
  const removedUnits = new Set(removedUnitIds);
  for (const unitId of removedUnitIds) {
    delete next.units[unitId];
  }
  next.civilizations[civId] = {
    ...next.civilizations[civId],
    units: [],
    isEliminated: true,
    nearDefeat: false,
  };

  for (const [otherId, other] of Object.entries(next.civilizations)) {
    if (otherId === civId) continue;
    const relationships = { ...other.diplomacy.relationships };
    delete relationships[civId];
    const satelliteSurveillanceTargets = { ...other.satelliteSurveillanceTargets };
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
          ...other.diplomacy.vassalage,
          overlord: other.diplomacy.vassalage.overlord === civId
            ? null
            : other.diplomacy.vassalage.overlord,
          vassals: other.diplomacy.vassalage.vassals.filter(id => id !== civId),
          protectionTimers: other.diplomacy.vassalage.protectionTimers
            .filter(timer => timer.attackerCivId !== civId),
        },
      },
    };
  }

  next.embargoes = next.embargoes
    .filter(embargo => embargo.targetCivId !== civId)
    .map(embargo => ({
      ...embargo,
      participants: embargo.participants.filter(id => id !== civId),
    }))
    .filter(embargo => embargo.participants.length > 0);
  next.defensiveLeagues = next.defensiveLeagues
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
    delete next.opponentAI.pressureByHuman[civId];
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
