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
  'carrier-air-wing-basic': {
    name: 'carrier-air-wing-basic',
    description:
      'Player Carrier hosting a mixed air wing (a ready Maritime Patrol Aircraft and an '
      + 'already-acted Naval Strike Aircraft), plus a hostile submarine within Patrol '
      + 'range but not adjacent -- opens directly into a state where the Air Wing roster '
      + 'panel, the Patrol button, and a live patrol reveal can all be exercised manually '
      + '(#582).',
    seed: 'scenario-carrier-air-wing-basic',
    base: {
      kind: 'solo',
      config: { civType: 'generic', mapSize: 'small', opponentCount: 1, gameTitle: 'Carrier Air Wing' },
    },
    steps: [
      { kind: 'terrain', position: { q: 0, r: 0 }, terrain: 'ocean' },
      { kind: 'terrain', position: { q: 4, r: 0 }, terrain: 'ocean' },
      { kind: 'tech', civId: 'player', techIds: ['carrier-warfare', 'radar-systems'] },
      { kind: 'diplomacy', civA: 'player', civB: 'ai-1', status: 'war' },
      { kind: 'unit', civId: 'player', type: 'carrier', position: { q: 0, r: 0 }, overrides: { id: 'carrier-1' } },
      // Based air units don't occupy ground stacking slots in the real game
      // (unit-occupancy.ts skips isBasedAirUnit units) -- same exemption as
      // helicopter-air-assault-basic's own comment; this builder's plain
      // per-tile occupancy guard needs unsafe: true for both.
      { kind: 'unit', civId: 'player', type: 'maritime_patrol_aircraft', position: { q: 0, r: 0 }, unsafe: true, overrides: { id: 'patrol-1', airBase: { kind: 'carrier', unitId: 'carrier-1' } } },
      { kind: 'unit', civId: 'player', type: 'naval_strike_aircraft', position: { q: 0, r: 0 }, unsafe: true, overrides: { id: 'strike-1', airBase: { kind: 'carrier', unitId: 'carrier-1' }, hasActed: true } },
      { kind: 'unit', civId: 'ai-1', type: 'submarine', position: { q: 4, r: 0 } },
    ],
  },
  'great-general-abilities-basic': {
    name: 'great-general-abilities-basic',
    description:
      'Player Great General with full command charges, a battered escort warrior within '
      + 'command range (degraded supply, low HP -- eligible for Rally, and already acted so '
      + 'eligible for Seize the Moment) -- opens directly into a state where the command '
      + 'panel, Rally, Seize the Moment, and Last Stand can all be exercised manually (#544 MR4).',
    seed: 'scenario-great-general-abilities-basic',
    base: {
      kind: 'solo',
      config: { civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 'Great General Abilities' },
    },
    steps: [
      { kind: 'terrain', position: { q: 0, r: 0 }, terrain: 'plains' },
      { kind: 'terrain', position: { q: 1, r: 0 }, terrain: 'plains' },
      {
        kind: 'unit', civId: 'player', type: 'great_general', position: { q: 0, r: 0 },
        overrides: { id: 'demo-general', generalDefinitionId: 'gen_caesar' },
      },
      {
        kind: 'unit', civId: 'player', type: 'warrior', position: { q: 1, r: 0 },
        overrides: {
          id: 'demo-escort', health: 45, hasActed: true, hasMoved: true, movementPointsLeft: 0,
          landSupply: { state: 'degraded', hostileUnsupportedTurns: 3, suppliedTurnsSinceRecovery: 0 },
        },
      },
    ],
  },
  'great-general-ai-command': {
    name: 'great-general-ai-command',
    description:
      'AI civ (ai-1) owns a Great General with a battered, out-of-supply ally within command '
      + 'range -- ending the human turn should show the AI Rally that ally during its own round '
      + '(#544 MR5). Manual verification: end turn, then inspect ally-1 via the unit panel or '
      + 'decision-trace UI for a health/supply-stage improvement. Includes a player capital so '
      + 'ending the turn does not trigger an immediate domination win/loss for either side '
      + '(checkDominationVictory: the civ founds nothing until its settler acts, so a scenario '
      + 'with only one founded city hands the other civ an instant, unrelated win).',
    seed: 'scenario-great-general-ai-command',
    base: {
      kind: 'solo',
      config: { civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 'Great General AI Command' },
    },
    steps: [
      { kind: 'city', civId: 'player', position: { q: 0, r: 0 } },
      { kind: 'terrain', position: { q: 10, r: 10 }, terrain: 'plains' },
      { kind: 'terrain', position: { q: 11, r: 10 }, terrain: 'plains' },
      {
        kind: 'unit', civId: 'ai-1', type: 'great_general', position: { q: 10, r: 10 },
        overrides: { id: 'ai-demo-general', generalDefinitionId: 'gen_ramesses' },
      },
      {
        kind: 'unit', civId: 'ai-1', type: 'warrior', position: { q: 11, r: 10 },
        overrides: {
          id: 'ai-demo-ally', health: 40,
          landSupply: { state: 'severe', hostileUnsupportedTurns: 5, suppliedTurnsSinceRecovery: 0 },
        },
      },
    ],
  },

  'fort-citadel-visuals-712': {
    name: 'fort-citadel-visuals-712',
    description:
      'Visual-review harness for #712: a player coastal city that already holds Walls, a '
      + 'Coastal Battery and a Bunker (open the city panel to see both bespoke building '
      + 'sprites), plus two Workers on guaranteed land beside it and the Fortresses + '
      + 'Fortification Engineering techs pre-granted. Manual steps: select each Worker, choose '
      + '"Build Fort", then end the turn ~5 times — the finished markers render as Citadels '
      + '(Fortification Engineering is granted; the plain Fort silhouette is on the contact '
      + 'sheet at docs/reviews/assets/issue-712/sprite-preview.html). 4000 gold is provided so '
      + 'the buildings can also be rush-bought in a second, settler-founded city. Includes a '
      + 'player capital + war target so ending the turn does not trigger an instant '
      + 'domination result.',
    seed: 'scenario-fort-citadel-visuals-712',
    base: {
      kind: 'solo',
      config: { civType: 'generic', mapSize: 'small', opponentCount: 1, gameTitle: 'Fort / Citadel Visuals 712' },
    },
    steps: [
      { kind: 'terrain', position: { q: 0, r: 0 }, terrain: 'grassland' },
      { kind: 'terrain', position: { q: 2, r: 2 }, terrain: 'grassland' },
      { kind: 'terrain', position: { q: 1, r: 2 }, terrain: 'plains' },
      { kind: 'terrain', position: { q: 3, r: 2 }, terrain: 'plains' },
      { kind: 'terrain', position: { q: 2, r: 3 }, terrain: 'ocean' },
      { kind: 'terrain', position: { q: 3, r: 3 }, terrain: 'coast' },
      { kind: 'tech', civId: 'player', techIds: ['fortresses', 'fortification-engineering', 'naval-armor', 'reinforced-concrete'] },
      { kind: 'gold', civId: 'player', amount: 4000 },
      { kind: 'city', civId: 'player', position: { q: 0, r: 0 } },
      {
        kind: 'city', civId: 'player', position: { q: 2, r: 2 },
        overrides: { buildings: ['walls', 'coastal_battery', 'bunker'] },
      },
      { kind: 'unit', civId: 'player', type: 'worker', position: { q: 1, r: 2 } },
      { kind: 'unit', civId: 'player', type: 'worker', position: { q: 3, r: 2 } },
      { kind: 'diplomacy', civA: 'player', civB: 'ai-1', status: 'war' },
    ],
  },
};
