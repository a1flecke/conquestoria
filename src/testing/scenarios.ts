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
};
