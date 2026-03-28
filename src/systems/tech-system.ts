import type { Tech, TechState, TechTrack } from '@/core/types';
import { TECH_TREE } from './tech-definitions';

export { TECH_TREE };

export function createTechState(): TechState {
  return {
    completed: [],
    currentResearch: null,
    researchProgress: 0,
    trackPriorities: {
      military: 'medium', economy: 'medium', science: 'medium',
      civics: 'medium', exploration: 'medium',
      agriculture: 'medium', medicine: 'medium', philosophy: 'medium',
      arts: 'medium', maritime: 'medium', metallurgy: 'medium',
      construction: 'medium', communication: 'medium', espionage: 'medium',
      spirituality: 'medium',
    },
  };
}

export function getAvailableTechs(state: TechState): Tech[] {
  return TECH_TREE.filter(tech => {
    if (state.completed.includes(tech.id)) return false;
    if (state.currentResearch === tech.id) return false;
    return tech.prerequisites.every(prereq => state.completed.includes(prereq));
  });
}

export function startResearch(state: TechState, techId: string): TechState {
  return {
    ...state,
    currentResearch: techId,
    researchProgress: 0,
  };
}

export interface ResearchResult {
  state: TechState;
  completedTech: string | null;
}

export function processResearch(state: TechState, sciencePoints: number): ResearchResult {
  if (!state.currentResearch) {
    return { state, completedTech: null };
  }

  const tech = TECH_TREE.find(t => t.id === state.currentResearch);
  if (!tech) {
    return { state, completedTech: null };
  }

  const newProgress = state.researchProgress + sciencePoints;

  if (newProgress >= tech.cost) {
    return {
      state: {
        ...state,
        completed: [...state.completed, tech.id],
        currentResearch: null,
        researchProgress: 0,
      },
      completedTech: tech.id,
    };
  }

  return {
    state: {
      ...state,
      researchProgress: newProgress,
    },
    completedTech: null,
  };
}

export function isTechCompleted(state: TechState, techId: string): boolean {
  return state.completed.includes(techId);
}

export function getTechById(id: string): Tech | undefined {
  return TECH_TREE.find(t => t.id === id);
}
