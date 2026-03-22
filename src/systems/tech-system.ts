import type { Tech, TechState, TechTrack } from '@/core/types';

export const TECH_TREE: Tech[] = [
  // Military Track (5 techs)
  {
    id: 'stone-weapons', name: 'Stone Weapons', track: 'military',
    cost: 20, prerequisites: [], unlocks: ['Warrior units deal +2 damage'], era: 1,
  },
  {
    id: 'archery', name: 'Archery', track: 'military',
    cost: 35, prerequisites: ['stone-weapons'], unlocks: ['Unlock Archer unit (future)'], era: 1,
  },
  {
    id: 'bronze-working', name: 'Bronze Working', track: 'military',
    cost: 50, prerequisites: ['stone-weapons'], unlocks: ['Unlock Spearman unit (future)', 'Reveal Iron'], era: 2,
  },
  {
    id: 'fortification', name: 'Fortification', track: 'military',
    cost: 60, prerequisites: ['bronze-working'], unlocks: ['Cities get +25% defense'], era: 2,
  },
  {
    id: 'iron-forging', name: 'Iron Forging', track: 'military',
    cost: 80, prerequisites: ['bronze-working'], unlocks: ['Unlock Swordsman unit (future)'], era: 3,
  },

  // Economy Track (5 techs)
  {
    id: 'gathering', name: 'Gathering', track: 'economy',
    cost: 15, prerequisites: [], unlocks: ['Farms yield +1 food'], era: 1,
  },
  {
    id: 'pottery', name: 'Pottery', track: 'economy',
    cost: 25, prerequisites: ['gathering'], unlocks: ['Unlock Granary building'], era: 1,
  },
  {
    id: 'animal-husbandry', name: 'Animal Husbandry', track: 'economy',
    cost: 30, prerequisites: ['gathering'], unlocks: ['Pasture improvement (future)'], era: 1,
  },
  {
    id: 'currency', name: 'Currency', track: 'economy',
    cost: 55, prerequisites: ['pottery'], unlocks: ['Unlock Marketplace building', '+1 gold per trade route (future)'], era: 2,
  },
  {
    id: 'mining-tech', name: 'Advanced Mining', track: 'economy',
    cost: 65, prerequisites: ['animal-husbandry'], unlocks: ['Mines yield +1 production'], era: 2,
  },

  // Science Track (5 techs)
  {
    id: 'fire', name: 'Fire', track: 'science',
    cost: 15, prerequisites: [], unlocks: ['+1 science per city'], era: 1,
  },
  {
    id: 'writing', name: 'Writing', track: 'science',
    cost: 30, prerequisites: ['fire'], unlocks: ['Unlock Library building'], era: 1,
  },
  {
    id: 'wheel', name: 'The Wheel', track: 'science',
    cost: 40, prerequisites: ['fire'], unlocks: ['Units get +1 movement on roads (future)'], era: 2,
  },
  {
    id: 'mathematics', name: 'Mathematics', track: 'science',
    cost: 60, prerequisites: ['writing'], unlocks: ['Research speed +10%'], era: 2,
  },
  {
    id: 'engineering', name: 'Engineering', track: 'science',
    cost: 80, prerequisites: ['mathematics', 'wheel'], unlocks: ['Unlock Workshop building', 'Improvements build faster'], era: 3,
  },
];

export function createTechState(): TechState {
  return {
    completed: [],
    currentResearch: null,
    researchProgress: 0,
    trackPriorities: {
      military: 'medium',
      economy: 'medium',
      science: 'medium',
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
