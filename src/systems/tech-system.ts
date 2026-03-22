import type { Tech, TechState, TechTrack } from '@/core/types';

export const TECH_TREE: Tech[] = [
  // === MILITARY TRACK (8 techs) ===
  { id: 'stone-weapons', name: 'Stone Weapons', track: 'military', cost: 20, prerequisites: [], unlocks: ['Warriors deal +2 damage'], era: 1 },
  { id: 'archery', name: 'Archery', track: 'military', cost: 35, prerequisites: ['stone-weapons'], unlocks: ['Unlock Archer unit'], era: 1 },
  { id: 'bronze-working', name: 'Bronze Working', track: 'military', cost: 50, prerequisites: ['stone-weapons'], unlocks: ['Unlock Barracks building'], era: 2 },
  { id: 'horseback-riding', name: 'Horseback Riding', track: 'military', cost: 55, prerequisites: ['animal-husbandry'], unlocks: ['Unlock Stable, mounted units'], era: 2 },
  { id: 'fortification', name: 'Fortification', track: 'military', cost: 60, prerequisites: ['bronze-working'], unlocks: ['Unlock Walls building'], era: 3 },
  { id: 'iron-forging', name: 'Iron Forging', track: 'military', cost: 80, prerequisites: ['bronze-working', 'mining-tech'], unlocks: ['Stronger melee units'], era: 3 },
  { id: 'siege-warfare', name: 'Siege Warfare', track: 'military', cost: 90, prerequisites: ['iron-forging', 'engineering'], unlocks: ['Unlock Catapult unit'], era: 4 },
  { id: 'tactics', name: 'Tactics', track: 'military', cost: 100, prerequisites: ['iron-forging'], unlocks: ['Units get +10% combat bonus'], era: 4 },

  // === ECONOMY TRACK (8 techs) ===
  { id: 'gathering', name: 'Gathering', track: 'economy', cost: 15, prerequisites: [], unlocks: ['Unlock Granary building'], era: 1 },
  { id: 'pottery', name: 'Pottery', track: 'economy', cost: 25, prerequisites: ['gathering'], unlocks: ['Unlock Herbalist building'], era: 1 },
  { id: 'animal-husbandry', name: 'Animal Husbandry', track: 'economy', cost: 30, prerequisites: ['gathering'], unlocks: ['Reveal Horses resource'], era: 1 },
  { id: 'irrigation', name: 'Irrigation', track: 'economy', cost: 45, prerequisites: ['pottery'], unlocks: ['Farms yield +1 food'], era: 2 },
  { id: 'currency', name: 'Currency', track: 'economy', cost: 55, prerequisites: ['pottery'], unlocks: ['Unlock Marketplace building'], era: 2 },
  { id: 'mining-tech', name: 'Advanced Mining', track: 'economy', cost: 65, prerequisites: ['animal-husbandry'], unlocks: ['Mines yield +1 production'], era: 3 },
  { id: 'trade-routes', name: 'Trade Routes', track: 'economy', cost: 75, prerequisites: ['currency'], unlocks: ['Enable trade routes between cities'], era: 3 },
  { id: 'banking', name: 'Banking', track: 'economy', cost: 95, prerequisites: ['trade-routes', 'mathematics'], unlocks: ['+20% gold in all cities'], era: 4 },

  // === SCIENCE TRACK (8 techs) ===
  { id: 'fire', name: 'Fire', track: 'science', cost: 15, prerequisites: [], unlocks: ['Unlock basic research'], era: 1 },
  { id: 'writing', name: 'Writing', track: 'science', cost: 30, prerequisites: ['fire'], unlocks: ['Unlock Library building'], era: 1 },
  { id: 'wheel', name: 'The Wheel', track: 'science', cost: 40, prerequisites: ['fire'], unlocks: ['Unlock Workshop building'], era: 2 },
  { id: 'mathematics', name: 'Mathematics', track: 'science', cost: 60, prerequisites: ['writing'], unlocks: ['Unlock Archive building'], era: 2 },
  { id: 'engineering', name: 'Engineering', track: 'science', cost: 80, prerequisites: ['mathematics', 'wheel'], unlocks: ['Unlock Aqueduct, Forge'], era: 3 },
  { id: 'philosophy', name: 'Philosophy', track: 'science', cost: 70, prerequisites: ['writing'], unlocks: ['Unlock Temple building'], era: 3 },
  { id: 'astronomy', name: 'Astronomy', track: 'science', cost: 90, prerequisites: ['mathematics'], unlocks: ['Unlock Observatory building'], era: 4 },
  { id: 'medicine', name: 'Medicine', track: 'science', cost: 85, prerequisites: ['philosophy', 'pottery'], unlocks: ['City population grows faster'], era: 4 },

  // === CIVICS TRACK (8 techs) ===
  { id: 'tribal-council', name: 'Tribal Council', track: 'civics', cost: 15, prerequisites: [], unlocks: ['Basic governance'], era: 1 },
  { id: 'code-of-laws', name: 'Code of Laws', track: 'civics', cost: 30, prerequisites: ['tribal-council'], unlocks: ['Unlock Monument building'], era: 1 },
  { id: 'early-empire', name: 'Early Empire', track: 'civics', cost: 45, prerequisites: ['code-of-laws'], unlocks: ['Cities claim +1 tile radius'], era: 2 },
  { id: 'state-workforce', name: 'State Workforce', track: 'civics', cost: 55, prerequisites: ['early-empire'], unlocks: ['Unlock Lumbermill, Quarry'], era: 2 },
  { id: 'diplomacy-tech', name: 'Diplomacy', track: 'civics', cost: 65, prerequisites: ['early-empire', 'writing'], unlocks: ['Unlock Non-Aggression Pacts'], era: 3 },
  { id: 'civil-service', name: 'Civil Service', track: 'civics', cost: 75, prerequisites: ['state-workforce'], unlocks: ['Unlock Forum building'], era: 3 },
  { id: 'drama-poetry', name: 'Drama & Poetry', track: 'civics', cost: 80, prerequisites: ['philosophy', 'code-of-laws'], unlocks: ['Unlock Amphitheater building'], era: 4 },
  { id: 'political-philosophy', name: 'Political Philosophy', track: 'civics', cost: 100, prerequisites: ['civil-service', 'philosophy'], unlocks: ['Unlock alliances'], era: 5 },

  // === EXPLORATION TRACK (8 techs) ===
  { id: 'pathfinding', name: 'Pathfinding', track: 'exploration', cost: 15, prerequisites: [], unlocks: ['Scouts get +1 vision'], era: 1 },
  { id: 'cartography', name: 'Cartography', track: 'exploration', cost: 30, prerequisites: ['pathfinding'], unlocks: ['Reveal map edges'], era: 1 },
  { id: 'sailing', name: 'Sailing', track: 'exploration', cost: 45, prerequisites: ['pathfinding'], unlocks: ['Units can embark on coast'], era: 2 },
  { id: 'celestial-navigation', name: 'Celestial Navigation', track: 'exploration', cost: 55, prerequisites: ['sailing', 'fire'], unlocks: ['Units can cross ocean'], era: 2 },
  { id: 'road-building', name: 'Road Building', track: 'exploration', cost: 50, prerequisites: ['wheel', 'pathfinding'], unlocks: ['Workers can build roads'], era: 3 },
  { id: 'harbor-tech', name: 'Harbors', track: 'exploration', cost: 70, prerequisites: ['sailing', 'currency'], unlocks: ['Unlock Harbor building'], era: 3 },
  { id: 'exploration-tech', name: 'Exploration', track: 'exploration', cost: 85, prerequisites: ['celestial-navigation'], unlocks: ['All units +1 vision range'], era: 4 },
  { id: 'military-logistics', name: 'Military Logistics', track: 'exploration', cost: 100, prerequisites: ['road-building', 'tactics'], unlocks: ['Units move +1 on roads'], era: 5 },
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
      civics: 'medium',
      exploration: 'medium',
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
