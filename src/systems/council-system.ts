import type { AdvisorType, CouncilAgenda, CouncilCard, CouncilCardAction, CouncilInterrupt, CouncilTalkLevel, GameState } from '@/core/types';
import { getMinorCivQuestPresentationForPlayer } from '@/systems/quest-presentation';
import { getMinorCivPresentationForPlayer } from '@/systems/minor-civ-presentation';
import { hasExploredCoord } from '@/systems/discovery-system';
import { mapNeighbors } from '@/systems/hex-utils';
import { findReadyScoutUnitId } from '@/systems/scout-readiness';
import {
  buildStrategicAssessment,
  type StrategicAssessment,
  type StrategicConstraint,
  type StrategicConstraintKind,
} from '@/systems/strategic-assessment';
import { getLegendaryWonderDefinition } from '@/systems/legendary-wonder-definitions';
import {
  getReachableLegendaryWonderProjects,
  initializeLegendaryWonderProjectsForAllCities,
} from '@/systems/legendary-wonder-system';
import { EVENT_CHAIN_CARD_ID_PREFIX, getEventChainDramaCards } from '@/systems/event-chain-presentation';
import { getAllWorldRaceKinds } from '@/systems/world-race-definitions';
import { getWorldRacePresentationForViewer } from '@/systems/world-race-presentation';

export { EVENT_CHAIN_CARD_ID_PREFIX };

function getFoodRecommendation(city: GameState['cities'][string]): string {
  if (!city.buildings.includes('herbalist')) {
    return 'Queue a Herbalist for a quick food boost.';
  }
  if (!city.buildings.includes('granary')) {
    return 'Queue a Granary next to steady food growth.';
  }
  return 'Work better farmland or build another food source before growth stalls.';
}

function getWonderRecommendationCards(state: GameState, civId: string): CouncilCard[] {
  const seededState = initializeLegendaryWonderProjectsForAllCities(state);
  const cityNames = seededState.civilizations[civId]?.cities.reduce<Record<string, string>>((acc, cityId) => {
    const city = seededState.cities[cityId];
    if (city) {
      acc[cityId] = city.name;
    }
    return acc;
  }, {}) ?? {};
  const reachableProjects = seededState.civilizations[civId]?.cities.flatMap(cityId =>
    getReachableLegendaryWonderProjects(seededState, civId, cityId),
  ) ?? [];
  const bestProjectByWonder = new Map<string, typeof reachableProjects[number]>();

  for (const project of reachableProjects) {
    const definition = getLegendaryWonderDefinition(project.wonderId);
    const completedSteps = project.questSteps.filter(step => step.completed).length;
    const totalSteps = project.questSteps.length;
    const phaseBonus = project.phase === 'ready_to_build' ? 100 : 45;
    const progressBonus = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 30) : 20;
    const costPenalty = Math.floor((definition?.productionCost ?? 300) / 40);
    const priority = phaseBonus + progressBonus - costPenalty;
    const existing = bestProjectByWonder.get(project.wonderId);

    if (!existing) {
      bestProjectByWonder.set(project.wonderId, project);
      continue;
    }

    const existingDefinition = getLegendaryWonderDefinition(existing.wonderId);
    const existingCompleted = existing.questSteps.filter(step => step.completed).length;
    const existingTotal = existing.questSteps.length;
    const existingPhaseBonus = existing.phase === 'ready_to_build' ? 100 : 45;
    const existingProgressBonus = existingTotal > 0 ? Math.round((existingCompleted / existingTotal) * 30) : 20;
    const existingCostPenalty = Math.floor((existingDefinition?.productionCost ?? 300) / 40);
    const existingPriority = existingPhaseBonus + existingProgressBonus - existingCostPenalty;

    if (priority > existingPriority) {
      bestProjectByWonder.set(project.wonderId, project);
    }
  }

  return [...bestProjectByWonder.values()]
    .map(project => {
      const definition = getLegendaryWonderDefinition(project.wonderId);
      const completedSteps = project.questSteps.filter(step => step.completed).length;
      const totalSteps = project.questSteps.length;
      const phaseBonus = project.phase === 'ready_to_build' ? 100 : 45;
      const progressBonus = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 30) : 20;
      const costPenalty = Math.floor((definition?.productionCost ?? 300) / 40);
      const priority = phaseBonus + progressBonus - costPenalty;
      const cityName = cityNames[project.cityId] ?? project.cityId;
      const isReady = project.phase === 'ready_to_build';

      return {
        id: `wonder-${project.cityId}-${project.wonderId}`,
        advisor: 'artisan' as const,
        bucket: 'to-win' as const,
        cardType: 'wonder' as const,
        title: `Legendary Wonder: ${definition?.name ?? project.wonderId}`,
        summary: isReady
          ? `${cityName} can begin it now. A glorious vanity project with actual upside.`
          : `${cityName} is ${completedSteps}/${totalSteps} steps in. Close enough to feel tantalizing, not overwhelming.`,
        why: `${definition?.reward.summary ?? 'A major empire bonus.'} Keep the Council pointed at one grand story at a time.`,
        priority,
        actionLabel: isReady ? 'Build wonder' : 'Track quest',
        action: { kind: 'open-wonder' as const, cityId: project.cityId, wonderId: project.wonderId },
      };
    })
    .sort((left, right) => right.priority - left.priority)
    .slice(0, 3);
}

/** #992: the council's "progress surface, position indicator" for world races -- reads
 * only the viewer-safe presentation, never state.worldRaces/civ.builtNationalProjects
 * directly. A race with no tech access yet contributes nothing (nothing to recommend);
 * a race that already resolved (won, lost, or someone else won) also contributes nothing --
 * that moment already had its own ceremony via #993's framework.
 *
 * #1237: these cards are explicitly INFORMATIONAL -- no `actionLabel`, no `action`. The only
 * progress panel that exists (`victory-progress`) covers Domination, not world races, so a
 * "Prepare" or "Track launch" button would have nowhere honest to go. A card gets a button
 * only when a real destination exists. */
function getWorldRaceRecommendationCards(state: GameState, civId: string, assessment: StrategicAssessment): CouncilCard[] {
  const cards: CouncilCard[] = [];

  for (const kind of getAllWorldRaceKinds()) {
    const presentation = getWorldRacePresentationForViewer(state, civId, kind);
    if (!presentation.unlocked || presentation.completion) continue;

    const { own, knownRivals, displayName } = presentation;
    const progressPercent = own.launchCost > 0 ? Math.round((own.launchProgress / own.launchCost) * 100) : 0;

    let summary: string;
    let priority: number;
    if (!own.componentBuilt) {
      summary = `Lay the groundwork for the ${displayName} race before committing to the launch attempt itself.`;
      priority = 35;
    } else if (!own.launchQueued) {
      summary = `${displayName}: the groundwork is complete. Queue the launch attempt to enter the race.`;
      priority = 55;
    } else {
      summary = `${own.hostCityName ?? 'A city'} is ${progressPercent}% toward the ${displayName} launch.`;
      priority = 65;
    }
    if (knownRivals.length > 0) {
      summary += ` ${knownRivals.length} known rival${knownRivals.length === 1 ? '' : 's'} ${knownRivals.length === 1 ? 'is' : 'are'} also pursuing it.`;
      priority += 10;
    }
    if (assessment.victory.some(lane => lane.raceKind === kind && lane.stage === 'at-risk')) {
      summary += ' A known rival is ahead of you.';
      priority += 15;
    }

    cards.push({
      id: `worldrace-${kind}`,
      advisor: 'scholar',
      bucket: 'to-win',
      title: `World Race: ${displayName}`,
      summary,
      why: 'Whoever completes the launch first claims a one-time empire reward; everyone else is refunded half their invested production.',
      priority,
    });
  }

  return cards;
}

/** Severity at which a constraint is a "do now" card (the assessment's "serious" band, see
 * `strategic-assessment.ts`). Below it a constraint is "soon". */
const DO_NOW_MIN_SEVERITY = 40;
const MAX_DO_NOW_CONSTRAINTS = 3;
const MAX_SOON_CONSTRAINTS = 2;
export const SURVEY_FRONTIER_CARD_ID = 'survey-frontier';

const CONSTRAINT_ADVISOR: Record<StrategicConstraintKind, AdvisorType> = {
  food: 'treasurer',
  gold: 'treasurer',
  production: 'builder',
  science: 'scholar',
  unrest: 'chancellor',
  supply: 'warchief',
};

/** Why the player should care, per constraint kind. Each line states only what the game really does. */
const CONSTRAINT_WHY: Record<StrategicConstraintKind, string> = {
  food: 'Food keeps growth alive. A city that cannot grow stops adding output.',
  production: 'A stalled queue wastes turns the empire could spend building.',
  science: 'Research unlocks every new unit, building and wonder.',
  gold: 'Unpaid upkeep keeps draining the treasury until income catches up.',
  unrest: 'Unrest cuts a city\'s output and can spread to its neighbours.',
  supply: 'Units without supply grow weaker until they return to friendly ground.',
};

/** Button copy states what happens. Exhaustive over the action union, so a new kind cannot ship unlabelled. */
const ACTION_LABEL: Record<CouncilCardAction['kind'], string> = {
  scout: 'Scout',
  'open-city': 'Open city',
  'open-quest': 'Review quest',
  'open-wonder': 'Open wonder',
  'open-tech': 'Choose research',
  'open-victory-progress': 'View progress',
};

function constraintCard(
  state: GameState,
  constraint: StrategicConstraint,
  bucket: CouncilCard['bucket'],
): CouncilCard {
  const focusCity = constraint.focusCityId ? state.cities[constraint.focusCityId] : undefined;
  const hint = constraint.kind === 'food' && focusCity ? ` ${getFoodRecommendation(focusCity)}` : '';
  return {
    id: `constraint-${constraint.kind}`,
    advisor: CONSTRAINT_ADVISOR[constraint.kind],
    bucket,
    title: constraint.title,
    summary: `${constraint.why}${hint}`,
    why: CONSTRAINT_WHY[constraint.kind],
    priority: constraint.severity,
    ...(constraint.destination
      ? { actionLabel: ACTION_LABEL[constraint.destination.kind], action: constraint.destination }
      : {}),
  };
}

/** "Unexplored frontier": an explored tile with an unexplored neighbour. Reads only the viewer's own visibility. */
function hasUnexploredFrontier(state: GameState, civId: string): boolean {
  for (const tile of Object.values(state.map.tiles)) {
    if (!hasExploredCoord(state, civId, tile.coord)) continue;
    for (const neighbor of mapNeighbors(state.map, tile.coord)) {
      if (state.map.tiles[`${neighbor.q},${neighbor.r}`] && !hasExploredCoord(state, civId, neighbor)) return true;
    }
  }
  return false;
}

function getVictoryLaneCards(assessment: StrategicAssessment): CouncilCard[] {
  // World-race lanes already have their own cards (`getWorldRaceRecommendationCards`), which read the
  // same assessment stage; only the Domination lane gets a card here, so a lane never appears twice.
  // A "not started" lane is not a recommendation, so it contributes nothing.
  const domination = assessment.victory.find(lane => lane.lane === 'domination');
  if (!domination || domination.stage === 'not-started') return [];
  return [{
    id: 'victory-domination',
    advisor: 'scholar',
    bucket: 'to-win',
    title: 'Domination',
    summary: domination.summary,
    why: 'Domination is won by being the last independent empire.',
    priority: domination.stage === 'at-risk' ? 70 : 50,
    actionLabel: ACTION_LABEL['open-victory-progress'],
    action: { kind: 'open-victory-progress' },
  }];
}

export function buildCouncilAgenda(state: GameState, civId: string): CouncilAgenda {
  // One assessment per agenda, built from the viewer's own projection on every call: nothing is cached
  // across hot-seat seats (#1237).
  const assessment = buildStrategicAssessment(state, civId);
  const urgent = assessment.constraints
    .filter(constraint => constraint.severity >= DO_NOW_MIN_SEVERITY)
    .slice(0, MAX_DO_NOW_CONSTRAINTS);
  const doNowKinds = new Set(urgent.map(constraint => constraint.kind));
  const doNow: CouncilCard[] = urgent.map(constraint => constraintCard(state, constraint, 'do-now'));

  if (doNow.length === 0 && findReadyScoutUnitId(state, civId) && hasUnexploredFrontier(state, civId)) {
    doNow.push({
      id: SURVEY_FRONTIER_CARD_ID,
      advisor: 'explorer',
      bucket: 'do-now',
      title: 'Survey the frontier',
      summary: 'Unexplored land borders your territory, and a unit is ready to scout it.',
      why: 'Fresh information helps the Council give better advice.',
      priority: 30,
      actionLabel: ACTION_LABEL.scout,
      action: { kind: 'scout' },
    });
  }

  for (const minorCiv of Object.values(state.minorCivs ?? {})) {
    const quest = minorCiv.activeQuests[civId];
    const presentation = getMinorCivQuestPresentationForPlayer(state, civId, minorCiv.id);
    if (!quest || !presentation) continue;
    const issuer = getMinorCivPresentationForPlayer(state, civId, minorCiv.id, 'City-state');
    doNow.push({
      id: `quest-${quest.id}`,
      advisor: 'chancellor',
      bucket: 'do-now',
      title: `Aid ${issuer.name}`,
      summary: presentation.description,
      why: 'Helping friendly powers gives the Council concrete momentum, rewards, and a sense of purpose.',
      priority: 55,
      actionLabel: ACTION_LABEL['open-quest'],
      action: { kind: 'open-quest', minorCivId: minorCiv.id },
    });
    break;
  }

  const soon = assessment.constraints
    .filter(constraint => !doNowKinds.has(constraint.kind))
    .slice(0, MAX_SOON_CONSTRAINTS)
    .map(constraint => constraintCard(state, constraint, 'soon'));

  const drama = getEventChainDramaCards(state, civId);
  if (drama.length === 0) {
    drama.push({
      id: 'council-murmur',
      advisor: 'chancellor',
      bucket: 'drama',
      title: 'The Council is watching',
      summary: 'No scandal yet. They are saving their opinions for later.',
      why: 'A calm court is still a court.',
      priority: 10,
    });
  }

  return {
    doNow: doNow.sort((a, b) => b.priority - a.priority),
    soon,
    toWin: [
      ...getWonderRecommendationCards(state, civId),
      ...getWorldRaceRecommendationCards(state, civId, assessment),
      ...getVictoryLaneCards(assessment),
    ].sort((a, b) => b.priority - a.priority),
    drama,
  };
}

export function getCouncilInterrupt(
  state: GameState,
  civId: string,
  talkLevel: CouncilTalkLevel,
): CouncilInterrupt | null {
  const candidate = buildCouncilAgenda(state, civId).doNow.find(card => card.id !== SURVEY_FRONTIER_CARD_ID);
  if (!candidate) {
    return null;
  }

  const minimumPriority = {
    quiet: 80,
    normal: 60,
    chatty: 40,
    chaos: 0,
  }[talkLevel];

  if (candidate.priority < minimumPriority) {
    return null;
  }

  return {
    civId,
    advisor: candidate.advisor,
    summary: candidate.summary,
    sourceCardId: candidate.id,
  };
}
