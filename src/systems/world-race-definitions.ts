// #992: static data for the world-race framework. One exemplar shipped at launch
// ('first-satellite'); #986 adds a second row ('interstellar-colony') that also
// terminates the game -- see that entry's own `endsGameAs` field -- rather than a
// new engine or a parallel victory subsystem.
import type { ResourceType, WorldRaceKind, GameOverReason } from '@/core/types';

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
  /**
   * #986: when set, winning this race is ALSO a victory condition -- read only by
   * `finalizeScienceVictory` (victory-system.ts), which is the single place a race
   * outcome turns into `state.gameOver`. `world-race-system.ts` itself stays completely
   * unaware of this field; it always just picks a winner and refunds the rest, whether
   * or not that winner also ends the game. Kept off the base `WorldRaceDefinition` shape
   * as optional so a purely-cosmetic race (first-satellite) needs no victory wiring at all.
   */
  endsGameAs?: GameOverReason;
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
  'interstellar-colony': {
    kind: 'interstellar-colony',
    displayName: 'Interstellar Colony',
    unlockTechId: 'mars-mission-architecture',
    componentBuildingId: 'mars_robotics_initiative',
    launchBuildingId: 'interstellar_launch_program',
    launchResource: 'uranium',
    winnerReward: {
      // goldBonus is 0 -- the game ends immediately for every civ, so a gold grant would
      // be a dead artifact (see finalizeScienceVictory).
      summary: 'Humanity\'s first permanent extraterrestrial colony marks the dawn of a new era.',
      goldBonus: 0,
    },
    endsGameAs: 'science',
  },
};

export function getWorldRaceDefinition(kind: WorldRaceKind): WorldRaceDefinition {
  return WORLD_RACE_DEFINITIONS[kind];
}

export function getAllWorldRaceKinds(): WorldRaceKind[] {
  return Object.keys(WORLD_RACE_DEFINITIONS) as WorldRaceKind[];
}

