/**
 * Named, reusable scenarios (#846). Both Vitest tests and the DEV-only
 * `?scenario=` browser loader (game-session-controller.ts) build from this
 * exact registry via buildScenario -- no duplicate construction path.
 */
import type { ScenarioDefinition } from '@/testing/scenario-types';

export const SCENARIOS: Record<string, ScenarioDefinition> = {
  'undefended-enemy-city': {
    name: 'undefended-enemy-city',
    description:
      'Player scout 2 hexes from an undefended AI city while at war -- validates #843 '
      + '(the city blocks movement/is assault-reachable only from direct adjacency, '
      + 'never walked through or treated as reachable from further away).',
    seed: 'scenario-undefended-enemy-city',
    base: {
      kind: 'solo',
      config: { civType: 'generic', mapSize: 'small', opponentCount: 1, gameTitle: 'Undefended Enemy City' },
    },
    steps: [
      { kind: 'terrain', position: { q: 0, r: 0 }, terrain: 'plains' },
      { kind: 'terrain', position: { q: 1, r: 0 }, terrain: 'plains' },
      { kind: 'terrain', position: { q: 2, r: 0 }, terrain: 'plains' },
      { kind: 'terrain', position: { q: 3, r: 0 }, terrain: 'plains' },
      { kind: 'diplomacy', civA: 'player', civB: 'ai-1', status: 'war' },
      { kind: 'unit', civId: 'player', type: 'scout', position: { q: 0, r: 0 } },
      { kind: 'city', civId: 'ai-1', position: { q: 2, r: 0 } },
    ],
  },
  'undefended-barbarian-camp': {
    name: 'undefended-barbarian-camp',
    description:
      'Player unit directly adjacent to an undefended barbarian camp -- validates #845 '
      + '(one-step camp assault; barbarians need no war check per game-systems.md).',
    seed: 'scenario-undefended-barbarian-camp',
    base: {
      kind: 'solo',
      config: { civType: 'generic', mapSize: 'small', opponentCount: 1, gameTitle: 'Undefended Barbarian Camp' },
    },
    steps: [
      { kind: 'terrain', position: { q: 5, r: 5 }, terrain: 'plains' },
      { kind: 'terrain', position: { q: 6, r: 5 }, terrain: 'plains' },
      { kind: 'unit', civId: 'player', type: 'warrior', position: { q: 5, r: 5 } },
      { kind: 'camp', position: { q: 6, r: 5 } },
    ],
  },
  'submarine-undetected': {
    name: 'submarine-undetected',
    description:
      'Enemy submarine sits offshore with no player detector nearby -- validates #542 '
      + '(concealed submarines are neither rendered, selectable, nor targetable).',
    seed: 'scenario-submarine-undetected',
    base: {
      kind: 'solo',
      config: { civType: 'generic', mapSize: 'small', opponentCount: 1, gameTitle: 'Submarine Undetected' },
    },
    steps: [
      { kind: 'terrain', position: { q: 0, r: 0 }, terrain: 'ocean' },
      { kind: 'terrain', position: { q: 5, r: 5 }, terrain: 'plains' },
      { kind: 'diplomacy', civA: 'player', civB: 'ai-1', status: 'war' },
      { kind: 'unit', civId: 'player', type: 'warrior', position: { q: 5, r: 5 } },
      { kind: 'unit', civId: 'ai-1', type: 'submarine', position: { q: 0, r: 0 } },
    ],
  },
  'helicopter-air-assault-basic': {
    name: 'helicopter-air-assault-basic',
    description:
      'Player Infantry standing in a Helicopter Base city with an available Attack '
      + 'Helicopter, plus a legal in-range landing tile -- opens directly into a state '
      + 'where the Air Assault action can be exercised manually (#543 Phase 2).',
    seed: 'scenario-helicopter-air-assault-basic',
    base: {
      kind: 'solo',
      config: { civType: 'generic', mapSize: 'small', opponentCount: 1, gameTitle: 'Helicopter Air Assault' },
    },
    steps: [
      { kind: 'terrain', position: { q: 0, r: 0 }, terrain: 'plains' },
      { kind: 'terrain', position: { q: 1, r: 1 }, terrain: 'plains' },
      { kind: 'tech', civId: 'player', techIds: ['helicopter-warfare'] },
      { kind: 'city', civId: 'player', position: { q: 0, r: 0 }, overrides: { id: 'heli-city', buildings: ['helicopter_base'] } },
      { kind: 'unit', civId: 'player', type: 'attack_helicopter', position: { q: 0, r: 0 }, overrides: { airBase: { kind: 'city', cityId: 'heli-city' } } },
      // Based air units don't occupy ground stacking slots in the real game
      // (unit-occupancy.ts skips isBasedAirUnit units) -- this scenario
      // builder's plain per-tile occupancy guard doesn't know that
      // exemption, so the second unit on this tile needs `unsafe: true`.
      { kind: 'unit', civId: 'player', type: 'infantry', position: { q: 0, r: 0 }, unsafe: true },
    ],
  },
  'destroyer-sonar-detection': {
    name: 'destroyer-sonar-detection',
    description:
      'Same geometry as submarine-undetected, but with a player Destroyer 2 hexes from '
      + 'the enemy submarine -- validates #542\'s destroyer ASW specialization (range-2 '
      + 'detection reveals a submarine that ordinary adjacency would miss).',
    seed: 'scenario-destroyer-sonar-detection',
    base: {
      kind: 'solo',
      config: { civType: 'generic', mapSize: 'small', opponentCount: 1, gameTitle: 'Destroyer Sonar Detection' },
    },
    steps: [
      { kind: 'terrain', position: { q: 0, r: 0 }, terrain: 'ocean' },
      { kind: 'terrain', position: { q: 1, r: 0 }, terrain: 'ocean' },
      { kind: 'terrain', position: { q: 2, r: 0 }, terrain: 'ocean' },
      { kind: 'diplomacy', civA: 'player', civB: 'ai-1', status: 'war' },
      { kind: 'unit', civId: 'player', type: 'destroyer', position: { q: 2, r: 0 } },
      { kind: 'unit', civId: 'ai-1', type: 'submarine', position: { q: 0, r: 0 } },
    ],
  },
};
