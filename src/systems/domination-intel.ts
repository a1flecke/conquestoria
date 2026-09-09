import type { GameState } from '@/core/types';
import { isMajorCivOwner } from '@/core/owner-kind';
import { getCivilizationLiveness } from './civilization-liveness';
import { isUnitConcealedFrom } from './concealment';
import { getDominationActorFact } from './domination-sovereignty';
import type { DominationObserverIntel, DominationPoliticalReport } from './domination-types';
import { isVisible } from './fog-of-war';
import { shouldListMajorCivForViewer } from './viewer-intel';

export function recordDominationPoliticalReport(
  state: GameState,
  observerId: string,
  contenderId: string,
): GameState {
  if (!state.civilizations[observerId] || !state.civilizations[contenderId]
    || !isMajorCivOwner(observerId) || !isMajorCivOwner(contenderId)
    || !shouldListMajorCivForViewer(state, observerId, contenderId)) return state;

  const contender = getDominationActorFact(state, contenderId);
  if (!contender || contender.disposition === 'eliminated') return state;

  const known = (civId: string): boolean => isMajorCivOwner(civId)
    && shouldListMajorCivForViewer(state, observerId, civId);
  const directVassalIds = state.civilizations[contenderId].diplomacy.vassalage.vassals
    .filter(known)
    .filter(civId => getDominationActorFact(state, civId)?.overlordId === contenderId)
    .sort(compareIds);
  const defeatedCivIds = Object.keys(state.dominationIntel?.[contenderId]?.defeatsByCivId ?? {})
    .filter(known)
    .sort(compareIds);
  const report: DominationPoliticalReport = {
    contenderId,
    observedTurn: state.turn,
    contenderRole: contender.disposition,
    directVassalIds,
    defeatedCivIds,
  };
  const observerIntel: DominationObserverIntel = state.dominationIntel?.[observerId] ?? {
    defeatsByCivId: {},
    reportsByContenderId: {},
  };

  return {
    ...state,
    dominationIntel: {
      ...(state.dominationIntel ?? {}),
      [observerId]: {
        ...observerIntel,
        defeatsByCivId: { ...observerIntel.defeatsByCivId },
        reportsByContenderId: {
          ...observerIntel.reportsByContenderId,
          [contenderId]: report,
        },
      },
    },
  };
}

export function recordDominationDefeat(
  before: GameState | null,
  after: GameState,
  event: { civId: string; eliminatedBy: string | null },
): GameState {
  const victim = before?.civilizations[event.civId];
  if (!victim || !before || !isMajorCivOwner(event.civId)
    || !getCivilizationLiveness(before, event.civId).living
    || getCivilizationLiveness(after, event.civId).living) return after;

  const observerSources = new Map<string, 'participant' | 'witness'>();
  for (const civId of [event.civId, event.eliminatedBy]) {
    if (civId && isMajorCivOwner(civId) && after.civilizations[civId]) {
      observerSources.set(civId, 'participant');
    }
  }
  for (const observerId of Object.keys(before.civilizations).sort(compareIds)) {
    if (observerSources.has(observerId)
      || !isMajorCivOwner(observerId)
      || !after.civilizations[observerId]
      || !shouldListMajorCivForViewer(before, observerId, event.civId)
      || !witnessedDecisiveSurvivalLoss(before, after, observerId, event.civId)) continue;
    observerSources.set(observerId, 'witness');
  }
  if (observerSources.size === 0) return after;

  const intel = { ...(after.dominationIntel ?? {}) };
  for (const [observerId, source] of observerSources) {
    const observerIntel = intel[observerId] ?? { defeatsByCivId: {}, reportsByContenderId: {} };
    const knowsConqueror = event.eliminatedBy !== null
      && (observerId === event.eliminatedBy
        || observerId === event.civId
        || shouldListMajorCivForViewer(before, observerId, event.eliminatedBy));
    intel[observerId] = {
      ...observerIntel,
      defeatsByCivId: {
        ...observerIntel.defeatsByCivId,
        [event.civId]: {
          civId: event.civId,
          civName: victim.name,
          observedTurn: before.turn,
          defeatedById: event.eliminatedBy && isMajorCivOwner(event.eliminatedBy) && knowsConqueror
            ? event.eliminatedBy
            : null,
          source,
        },
      },
      reportsByContenderId: { ...observerIntel.reportsByContenderId },
    };
  }
  return { ...after, dominationIntel: intel };
}

function witnessedDecisiveSurvivalLoss(
  before: GameState,
  after: GameState,
  observerId: string,
  victimId: string,
): boolean {
  const visibility = before.civilizations[observerId]?.visibility;
  if (!visibility) return false;

  const sawLostCity = Object.values(before.cities).some(city => city.owner === victimId
    && (!after.cities[city.id] || after.cities[city.id].owner !== victimId)
    && isVisible(visibility, city.position));
  if (sawLostCity) return true;

  if (getCivilizationLiveness(before, victimId).reason !== 'settler') return false;
  return Object.values(before.units).some(unit => {
    if (unit.owner !== victimId || unit.type !== 'settler') return false;
    const host = unit.transportId ? before.units[unit.transportId] : undefined;
    const visibleSettler = isVisible(visibility, unit.position)
      && !isUnitConcealedFrom(before, unit, observerId);
    const visibleHost = host !== undefined
      && isVisible(visibility, host.position)
      && !isUnitConcealedFrom(before, host, observerId);
    return visibleSettler || visibleHost;
  });
}

function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
