// #992: static data for the world-race framework. One exemplar ships
// ('first-satellite') per the issue's own non-goal against multiple races at
// once; a future race adds a row here, not a new engine.
import type { ResourceType, WorldRaceKind } from '@/core/types';

export interface WorldRaceDefinition {
  kind: WorldRaceKind;
  displayName: string;
  /** Tech that makes the race enter the "unlocked" public milestone once any living civ completes it. */
  unlockTechId: string;
  /**
   * The "component" stage — an existing national project a civ must already
   * have built to be eligible for the launch stage. Deliberately reuses an
   * existing building rather than inventing a parallel one; see
   * `first_satellite_launch`'s own comment in `city-system.ts`.
   */
  componentBuildingId: string;
  /** The "launch" stage — a milestone national project. First civ to complete it wins. */
  launchBuildingId: string;
  /** The strategic resource `first_satellite_launch`'s `resourceRequired` names — read here so
   * presentation/AI can reference it without re-deriving it from the building catalog. */
  launchResource: ResourceType;
  /** One-time reward applied directly to the winner at completion — never an ongoing yield
   * (milestone national projects carry no civYieldBonus/cityYieldBonus, see game-balance.md). */
  winnerReward: { summary: string; goldBonus: number };
}

export const WORLD_RACE_DEFINITIONS: Record<WorldRaceKind, WorldRaceDefinition> = {
  'first-satellite': {
    kind: 'first-satellite',
    displayName: 'First Satellite',
    unlockTechId: 'space-exploration',
    componentBuildingId: 'space_program_initiative',
    launchBuildingId: 'first_satellite_launch',
    launchResource: 'aluminum',
    winnerReward: {
      summary: 'National prestige and a wave of new trade contracts follow the launch.',
      goldBonus: 200,
    },
  },
};

export function getWorldRaceDefinition(kind: WorldRaceKind): WorldRaceDefinition {
  return WORLD_RACE_DEFINITIONS[kind];
}

export function getAllWorldRaceKinds(): WorldRaceKind[] {
  return Object.keys(WORLD_RACE_DEFINITIONS) as WorldRaceKind[];
}
