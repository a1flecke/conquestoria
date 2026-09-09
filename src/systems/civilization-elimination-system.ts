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

  // #1001 — world threats aimed at the dead civ dissipate: the crisis / stampede
  // / rogue-host records and the units their forces spawned go with the target.
  // `removedUnits` (used below for AI-portfolio scrubbing + unit deletion) is the
  // superset; `removedUnitIds` (returned + reported) stays the dead civ's own.
  const removedUnits = new Set(removedUnitIds);
  for (const [forceId, force] of Object.entries(next.crisisForces ?? {})) {
    if (force.targetCivId !== civId) continue;
    for (const unitId of force.unitIds) removedUnits.add(unitId);
    delete next.crisisForces![forceId];
  }
  for (const [crisisId, crisis] of Object.entries(next.activeCrises ?? {})) {
    if (crisis.targetCivId === civId) delete next.activeCrises![crisisId];
  }
  for (const [stampedeId, stampede] of Object.entries(next.stampedes ?? {})) {
    if (stampede.targetCivId === civId) delete next.stampedes![stampedeId];
  }
  for (const [hostId, host] of Object.entries(next.rogueElephantHosts ?? {})) {
    if (host.targetCivId === civId) delete next.rogueElephantHosts![hostId];
  }
  for (const [frontierKey, frontier] of Object.entries(next.territoryFrontiers ?? {})) {
    if (frontier.holderCivId === civId || frontier.challengerCivId === civId) delete next.territoryFrontiers![frontierKey];
  }

  for (const unitId of removedUnits) {
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

  // #1001 — every remaining per-civ subsystem record. A dead civ runs no
  // economy, autonomy network, advisory council or intel; makes no
  // national-project choice; and holds no in-flight legendary-wonder project or
  // combat grant. (Completed wonders, discovery credit and career ledgers are
  // historical records and are deliberately kept — see
  // tests/helpers/eliminated-civ-areas.ts.)
  delete next.economyStatusByCiv?.[civId];
  delete next.nationalProjectChoices?.[civId];
  delete next.legendaryWonderIntel?.[civId];
  if (next.councilMemory) delete (next.councilMemory as Record<string, unknown>)[civId];
  if (next.legendaryWonderTacticalEffects) {
    delete next.legendaryWonderTacticalEffects.trainingGrantsByCiv?.[civId];
    delete next.legendaryWonderTacticalEffects.interceptionClaimTurnByCiv?.[civId];
  }
  for (const [projectId, project] of Object.entries(next.legendaryWonderProjects ?? {})) {
    if (project.ownerId === civId) delete next.legendaryWonderProjects![projectId];
  }
  for (const [key, record] of Object.entries(next.builtNationalProjects ?? {})) {
    if (record.civId === civId || key.startsWith(`${civId}:`)) delete next.builtNationalProjects![key];
  }
  next.pendingGeneralCandidateChoices = (next.pendingGeneralCandidateChoices ?? [])
    .filter(choice => (choice as { civId?: string }).civId !== civId);

  // Minor civs: no city-state stays at war with, aggrieved at, offering a quest
  // to, or tracking a quest chain for a dead major civ. Sub-maps are guarded —
  // this runs on load and a legacy save may predate some of them.
  for (const minorCiv of Object.values(next.minorCivs ?? {})) {
    const d = minorCiv.diplomacy;
    if (d) {
      if (d.relationships) delete d.relationships[civId];
      d.atWarWith = (d.atWarWith ?? []).filter(id => id !== civId);
      d.treaties = (d.treaties ?? []).filter(t => t.civA !== civId && t.civB !== civId);
      d.events = (d.events ?? []).filter(e => e.otherCiv !== civId);
    }
    if (minorCiv.activeQuests) delete minorCiv.activeQuests[civId];
    if (minorCiv.regionalGrievanceByCiv) delete minorCiv.regionalGrievanceByCiv[civId];
    if (minorCiv.chainStatusByCiv) delete minorCiv.chainStatusByCiv[civId];
    if (minorCiv.questCooldownUntilByCiv) delete minorCiv.questCooldownUntilByCiv[civId];
    if (minorCiv.lastNotifiedStatusByCiv) delete minorCiv.lastNotifiedStatusByCiv[civId];
  }
  for (const [coalitionId, coalition] of Object.entries(next.minorCivCoalitions ?? {})) {
    if ((coalition as { targetCivId?: string }).targetCivId === civId) delete next.minorCivCoalitions![coalitionId];
  }
  for (const [cooldownId, cooldown] of Object.entries(next.minorCivRegionalCooldowns ?? {})) {
    if ((cooldown as { targetCivId?: string }).targetCivId === civId) delete next.minorCivRegionalCooldowns![cooldownId];
  }

  // Pirates: intel, tribute/demand ledgers and any active contract naming the
  // dead civ are void; the raid history chronicle is kept.
  if (next.pirates) {
    delete next.pirates.intelByCiv[civId];
    delete next.pirates.activationWarningDeliveredByCiv[civId];
    for (const faction of Object.values(next.pirates.factions)) {
      delete faction.tributeByCiv[civId];
      delete faction.demandByCiv[civId];
      if (faction.contract && (faction.contract.employerId === civId || faction.contract.targetId === civId)) {
        faction.contract = null;
      }
      const intentTarget = (faction.intent as { targetCivId?: string } | null)?.targetCivId;
      if (intentTarget === civId) faction.intent = null;
    }
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
