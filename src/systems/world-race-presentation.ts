// #992: the single viewer-safe read path for every world-race UI surface —
// never read state.worldRaces, civ.builtNationalProjects, or a foreign city's
// productionQueue directly from a render path. Three information classes,
// per the issue's own privacy model:
//
//   own progress         — full detail, read directly (no privacy concern for your own state).
//   public milestone     — a race-level fact declared by a game rule (see the two below),
//                           names no civ.
//   known-with-intel     — a rival the viewer has fresh gather_intel on. Bounded to exactly
//                           what that report captured, "as of turn N"; a report older than
//                           RACE_INTEL_STALENESS_TURNS is treated as no intel at all.
//
// A civ the viewer has merely MET (but has no fresh intel on) contributes
// NOTHING to this projection — being met already lets a player see that civ
// exist elsewhere in the game (diplomacy, contact), but does not by itself
// reveal whether they are racing. Only intel earns that.
import type { GameEvents, GameState } from '@/core/types';
import type { WorldRaceKind } from '@/core/types/world';
import { hasMetCivilization } from '@/systems/discovery-system';
import { getWorldRaceDefinition } from '@/systems/world-race-definitions';
import { hasCompletedWorldRaceComponent, getWorldRaceLaunchStatus, isWorldRaceUnlocked } from '@/systems/world-race-system';

/** A gather_intel report is race-relevant for RACE_INTEL_STALENESS_TURNS turns after it was
 * gathered — after that it is presented exactly as "no intel", not as a labeled-old number.
 * Mirrors the espionage snapshot convention (signalsIntelligence etc.): one-shot intel that
 * stops being useful once stale, never an ongoing grant. */
export const RACE_INTEL_STALENESS_TURNS = 10;

export interface WorldRaceOwnStatus {
  componentBuilt: boolean;
  launchQueued: boolean;
  hostCityName?: string;
  launchProgress: number;
  launchCost: number;
}

export interface WorldRaceKnownRival {
  civId: string;
  civName: string;
  asOfTurn: number;
  componentBuilt: boolean;
  launchQueued: boolean;
  launchProgress: number;
  launchCost: number;
}

export interface WorldRaceCompletion {
  turn: number;
  /** null when the viewer has not met the winning civ — never a placeholder like "Unknown Civilization". */
  winnerName: string | null;
}

export interface WorldRacePresentationForViewer {
  kind: WorldRaceKind;
  displayName: string;
  unlocked: boolean;
  launchBegunPublicly: boolean;
  own: WorldRaceOwnStatus;
  knownRivals: WorldRaceKnownRival[];
  completion?: WorldRaceCompletion;
}

export function getWorldRacePresentationForViewer(
  state: GameState,
  viewerId: string,
  kind: WorldRaceKind,
): WorldRacePresentationForViewer {
  const definition = getWorldRaceDefinition(kind);
  const race = state.worldRaces?.[kind];
  const launch = getWorldRaceLaunchStatus(state, viewerId, kind);

  const own: WorldRaceOwnStatus = {
    componentBuilt: hasCompletedWorldRaceComponent(state, viewerId, kind),
    launchQueued: launch.queued,
    ...(launch.hostCityName ? { hostCityName: launch.hostCityName } : {}),
    launchProgress: launch.progress,
    launchCost: launch.cost,
  };

  const knownRivals: WorldRaceKnownRival[] = [];
  const viewerEspionage = state.espionage?.[viewerId];
  for (const [targetCivId, report] of Object.entries(viewerEspionage?.intelReports ?? {})) {
    if (targetCivId === viewerId) continue;
    const raceIntel = report.worldRaceProgress?.[kind];
    if (!raceIntel) continue;
    if (state.turn - report.turn > RACE_INTEL_STALENESS_TURNS) continue;
    const targetCiv = state.civilizations[targetCivId];
    if (!targetCiv) continue;
    knownRivals.push({
      civId: targetCivId,
      civName: targetCiv.name,
      asOfTurn: report.turn,
      componentBuilt: raceIntel.componentBuilt,
      launchQueued: raceIntel.launchQueued,
      launchProgress: raceIntel.launchProgress,
      launchCost: raceIntel.launchCost,
    });
  }
  knownRivals.sort((a, b) => a.civId.localeCompare(b.civId));

  const completion: WorldRaceCompletion | undefined = race?.winnerCivId && race.completedTurn !== undefined
    ? {
      turn: race.completedTurn,
      winnerName: hasMetCivilization(state, viewerId, race.winnerCivId)
        ? state.civilizations[race.winnerCivId]?.name ?? null
        : null,
    }
    : undefined;

  return {
    kind,
    displayName: definition.displayName,
    unlocked: race?.announcedUnlocked === true || isWorldRaceUnlocked(state, kind),
    launchBegunPublicly: race?.announcedLaunchBegun === true,
    own,
    knownRivals,
    ...(completion ? { completion } : {}),
  };
}

// #992 big-moment integration (see .claude/rules/ui-panels.md's requirement to reuse
// #993's framework rather than a new ceremony queue). A race completion is a genuinely
// public world event -- every viewer gets the ceremony (unlike a legendary completion or
// event chain, which are scoped to a single civ's own screen) -- so this builder is
// unconditional for whichever civ is state.currentPlayer at the moment the event fires;
// winnerName is redacted exactly like routeWorldRaceCompleted's own notification.
export interface WorldRaceConclusionMomentItem {
  kind: WorldRaceKind;
  displayName: string;
  turn: number;
  won: boolean;
  winnerName: string | null;
  rewardSummary: string;
}

export function buildWorldRaceConclusionMomentItem(
  state: GameState,
  event: GameEvents['worldrace:completed'],
): WorldRaceConclusionMomentItem {
  const definition = getWorldRaceDefinition(event.kind);
  const viewerId = state.currentPlayer;
  const won = viewerId === event.winnerCivId;
  return {
    kind: event.kind,
    displayName: definition.displayName,
    turn: event.turn,
    won,
    winnerName: won || hasMetCivilization(state, viewerId, event.winnerCivId)
      ? state.civilizations[event.winnerCivId]?.name ?? null
      : null,
    rewardSummary: definition.winnerReward.summary,
  };
}
