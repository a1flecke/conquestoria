import type { Tech, TechState, TechTrack } from '@/core/types';
import { estimateTurnsToComplete } from '@/systems/pacing-model';
import { TECH_TREE, getEffectiveTechCost } from '@/systems/tech-system';

export type TechNodeState = 'completed' | 'current' | 'queued' | 'available' | 'next-layer' | 'locked';
export type TechEdgeState = 'satisfied' | 'planned' | 'open' | 'blocked';
export type TechTreeZoom = 'focus' | 'known' | 'all';

export interface TechProgressionNode {
  tech: Tech;
  state: TechNodeState;
  track: TechTrack;
  era: number;
  visibleByDefault: boolean;
  prerequisiteIds: string[];
  satisfiedPrerequisiteIds: string[];
  missingPrerequisiteIds: string[];
  turnsToResearch: number | null;
  revealed: boolean;
  visibleInFocus: boolean;
  visibleInKnown: boolean;
}

export interface TechProgressionEdge {
  fromId: string;
  toId: string;
  state: TechEdgeState;
  visibleByDefault: boolean;
}

export interface TechProgressionView {
  tracks: TechTrack[];
  nodes: TechProgressionNode[];
  nodesById: Map<string, TechProgressionNode>;
  edges: TechProgressionEdge[];
  defaultVisibleIds: Set<string>;
  visibleIds: Set<string>;
  knownVisibleIds: Set<string>;
  queueableIds: Set<string>;
  focusTechId: string | null;
  zoom: TechTreeZoom;
  selectedTechId: string | null;
  selectedPathIds: Set<string>;
  nextStepId: string | null;
}

export function getDerivedTechTracks(techs: Tech[] = TECH_TREE): TechTrack[] {
  const tracks: TechTrack[] = [];
  for (const tech of techs) {
    if (!tracks.includes(tech.track)) {
      tracks.push(tech.track);
    }
  }
  return tracks;
}

function buildPlannedCompletionSet(state: TechState): Set<string> {
  return new Set([
    ...state.completed,
    ...(state.currentResearch ? [state.currentResearch] : []),
    ...state.researchQueue,
  ]);
}

function hasAllPrerequisites(tech: Tech, ids: Set<string>): boolean {
  return tech.prerequisites.every(prereq => ids.has(prereq));
}

function moveQueuedId<T>(items: T[], fromIndex: number, toIndex: number): T[] {
  if (
    fromIndex < 0
    || toIndex < 0
    || fromIndex >= items.length
    || toIndex >= items.length
    || fromIndex === toIndex
  ) {
    return [...items];
  }

  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  if (moved === undefined) {
    return [...items];
  }
  next.splice(toIndex, 0, moved);
  return next;
}

function isQueueOrderValid(state: TechState, queue: string[]): boolean {
  const satisfied = new Set([
    ...state.completed,
    ...(state.currentResearch ? [state.currentResearch] : []),
  ]);

  for (const techId of queue) {
    const tech = TECH_TREE.find(candidate => candidate.id === techId);
    if (!tech || !hasAllPrerequisites(tech, satisfied)) {
      return false;
    }
    satisfied.add(tech.id);
  }

  return true;
}

function getLastCompletedTechId(state: TechState): string | null {
  return state.completed.length > 0 ? state.completed[state.completed.length - 1] : null;
}

function collectPrerequisitePath(techId: string, path: Set<string>): void {
  const tech = TECH_TREE.find(candidate => candidate.id === techId);
  if (!tech || path.has(tech.id)) return;

  for (const prereq of tech.prerequisites) {
    path.add(prereq);
  }
  path.add(tech.id);
}

export function getQueueableResearchIds(state: TechState, techs: Tech[] = TECH_TREE): Set<string> {
  const queueable = new Set<string>();
  const planned = buildPlannedCompletionSet(state);

  for (const tech of techs) {
    if (state.completed.includes(tech.id)) continue;
    if (state.currentResearch === tech.id) continue;
    if (state.researchQueue.includes(tech.id)) continue;
    if (hasAllPrerequisites(tech, planned)) {
      queueable.add(tech.id);
    }
  }

  return queueable;
}

export function hasReachedResearchFrontier(state: TechState, techs: readonly Tech[] = TECH_TREE): boolean {
  return state.currentResearch === null
    && state.researchQueue.length === 0
    && techs.every(tech => state.completed.includes(tech.id));
}

export function canMoveQueuedResearch(state: TechState, fromIndex: number, toIndex: number): boolean {
  return isQueueOrderValid(state, moveQueuedId(state.researchQueue, fromIndex, toIndex));
}

export function buildTechProgressionView(
  state: TechState,
  options: { sciencePerTurn?: number; zoom?: TechTreeZoom; initialFocusTechId?: string; selectedTechId?: string | null } = {},
): TechProgressionView {
  const completed = new Set(state.completed);
  const planned = buildPlannedCompletionSet(state);
  const queueableIds = getQueueableResearchIds(state);
  const zoom = options.zoom ?? 'focus';
  const focusTechId = options.initialFocusTechId
    ?? state.currentResearch
    ?? state.researchQueue[0]
    ?? getLastCompletedTechId(state);
  const nodes: TechProgressionNode[] = [];
  const nodesById = new Map<string, TechProgressionNode>();
  const defaultVisibleIds = new Set<string>();
  const knownVisibleIds = new Set<string>();
  const visibleIds = new Set<string>();
  const sciencePerTurn = Math.max(1, options.sciencePerTurn ?? 1);
  const completedOrPlannedOrAvailable = new Set([
    ...planned,
    ...queueableIds,
  ]);
  const focusTech = focusTechId ? TECH_TREE.find(tech => tech.id === focusTechId) : undefined;
  const selectedTechId = options.selectedTechId ?? focusTechId;
  const selectedPathIds = new Set<string>();
  if (selectedTechId) {
    collectPrerequisitePath(selectedTechId, selectedPathIds);
  }

  const currentPlayerEra = Math.max(
    1,
    ...state.completed.map(id => TECH_TREE.find(t => t.id === id)?.era ?? 1),
    state.currentResearch ? (TECH_TREE.find(t => t.id === state.currentResearch)?.era ?? 1) : 1,
  );

  for (const tech of TECH_TREE) {
    const satisfiedPrerequisiteIds = tech.prerequisites.filter(prereq => planned.has(prereq));
    const missingPrerequisiteIds = tech.prerequisites.filter(prereq => !planned.has(prereq));
    const everyPrereqPlanned = missingPrerequisiteIds.length === 0;
    const isAvailable = !completed.has(tech.id)
      && state.currentResearch !== tech.id
      && !state.researchQueue.includes(tech.id)
      && tech.prerequisites.every(prereq => completed.has(prereq));
    const isNextLayer = !isAvailable
      && !completed.has(tech.id)
      && state.currentResearch !== tech.id
      && !state.researchQueue.includes(tech.id)
      && everyPrereqPlanned;

    const nodeState: TechNodeState = completed.has(tech.id)
      ? 'completed'
      : state.currentResearch === tech.id
        ? 'current'
        : state.researchQueue.includes(tech.id)
          ? 'queued'
          : isAvailable
            ? 'available'
            : isNextLayer
              ? 'next-layer'
              : 'locked';

    const revealed = nodeState !== 'locked'
      || tech.prerequisites.every(prereq => completedOrPlannedOrAvailable.has(prereq));
    const isFocusTech = focusTechId === tech.id;
    const isFocusParent = Boolean(focusTech?.prerequisites.includes(tech.id));
    const isFocusChild = tech.prerequisites.includes(focusTechId ?? '') && revealed;
    const isFocusNeighbor = isFocusTech || isFocusChild || isFocusParent;
    const visibleInKnown = revealed;
    const visibleInFocus = (
      nodeState !== 'locked'
      || isFocusNeighbor
      || (revealed && tech.era <= currentPlayerEra + 1)
    );
    const visibleByDefault = visibleInFocus;
    const queuedIndex = state.researchQueue.indexOf(tech.id);
    const effectiveCost = getEffectiveTechCost(tech, state.completed);
    const turnsToResearch = state.currentResearch === tech.id
      ? estimateTurnsToComplete({
        cost: Math.max(0, effectiveCost - state.researchProgress),
        outputPerTurn: sciencePerTurn,
      })
      : queuedIndex >= 0 || queueableIds.has(tech.id)
        ? estimateTurnsToComplete({ cost: effectiveCost, outputPerTurn: sciencePerTurn })
        : null;

    if (visibleByDefault) defaultVisibleIds.add(tech.id);
    if (visibleInKnown) knownVisibleIds.add(tech.id);
    if (zoom === 'all' || (zoom === 'known' && visibleInKnown) || (zoom === 'focus' && visibleInFocus)) {
      visibleIds.add(tech.id);
    }

    const node: TechProgressionNode = {
      tech,
      state: nodeState,
      track: tech.track,
      era: tech.era,
      visibleByDefault,
      prerequisiteIds: tech.prerequisites,
      satisfiedPrerequisiteIds,
      missingPrerequisiteIds,
      turnsToResearch,
      revealed,
      visibleInFocus,
      visibleInKnown,
    };

    nodes.push(node);
    nodesById.set(tech.id, node);
  }

  const edges: TechProgressionEdge[] = [];
  for (const tech of TECH_TREE) {
    for (const prereq of tech.prerequisites) {
      const prereqNode = nodesById.get(prereq);
      const targetNode = nodesById.get(tech.id);
      if (!prereqNode || !targetNode) continue;

      const stateForEdge: TechEdgeState = completed.has(prereq)
        ? 'satisfied'
        : planned.has(prereq)
          ? 'planned'
          : queueableIds.has(prereq)
            ? 'open'
            : 'blocked';

      edges.push({
        fromId: prereq,
        toId: tech.id,
        state: stateForEdge,
        visibleByDefault: prereqNode.visibleByDefault && targetNode.visibleByDefault,
      });
    }
  }

  return {
    tracks: getDerivedTechTracks(),
    nodes,
    nodesById,
    edges,
    defaultVisibleIds,
    visibleIds,
    knownVisibleIds,
    queueableIds,
    focusTechId,
    zoom,
    selectedTechId,
    selectedPathIds,
    nextStepId: [...selectedPathIds].find(techId =>
      !completed.has(techId)
      && state.currentResearch !== techId
      && !state.researchQueue.includes(techId)
      && queueableIds.has(techId)) ?? null,
  };
}
