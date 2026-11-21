# Scenario Infrastructure

Deterministically reproduce a specific game state for debugging or regression testing,
without playing dozens of turns. See the design rationale in
`docs/superpowers/specs/2026-08-16-issue-846-scenario-infrastructure-design.md`.

## How it works

A `ScenarioDefinition` (`src/testing/scenario-types.ts`) names a `base` config
(everything `createNewGame`/`createHotSeatGame` needs: civ, map size, seed) plus a list
of typed `steps` (`terrain`, `unit`, `city`, `camp`, `tech`, `diplomacy`, `gold`).
`buildScenario()` (`src/testing/scenario-builder.ts`) folds a definition into a real
`GameState` by calling the same canonical system helpers gameplay itself uses
(`createUnit`, `foundCity`, `declareWar`, ...) -- never a hand-built partial state.

## Creating a scenario

Add an entry to `SCENARIOS` in `src/testing/scenarios.ts`:

```ts
'my-new-scenario': {
  name: 'my-new-scenario',
  description: 'One sentence: what condition this reproduces and why.',
  seed: 'scenario-my-new-scenario',
  base: { kind: 'solo', config: { civType: 'generic', mapSize: 'small', opponentCount: 1, gameTitle: 'My New Scenario' } },
  steps: [
    { kind: 'terrain', position: { q: 0, r: 0 }, terrain: 'plains' },
    { kind: 'unit', civId: 'player', type: 'scout', position: { q: 0, r: 0 } },
  ],
},
```

Available step kinds: `terrain` (guarantee a tile's terrain, e.g. so a hand-picked
coordinate is land regardless of what the seed's procedural generation produced there),
`unit` (via `createUnit` + optional `overrides`), `city` (via `foundCity` + territory
recalculation), `camp` (a barbarian camp at an exact position), `tech` (mark techs
completed for a civ), `diplomacy` (war/peace/alliance, applied bilaterally), and `gold`.

## Running one manually

```bash
bash scripts/run-with-mise.sh yarn dev
```

Then open `http://localhost:5173/conquestoria/?scenario=my-new-scenario`. This only
works in dev mode (`import.meta.env.DEV`) -- see "Production isolation" below. An
unknown scenario name throws a clear error naming the known scenarios, instead of
silently doing nothing.

## Using one in a test

```ts
import { SCENARIOS } from '@/testing/scenarios';
import { buildScenario } from '@/testing/scenario-builder';

const state = buildScenario(SCENARIOS['undefended-enemy-city']);
// state is a real GameState -- pass it directly to whatever system you're testing.
```

This is the same function and the same named definition the dev-mode browser loader
uses -- there is no separate test-only construction path.

## What NOT to represent directly

Do not add a step `kind` that lets a caller push a raw partial `Unit`/`City`/other
entity -- every step must map to a canonical constructor (`createUnit`, `foundCity`,
...) plus narrow `overrides`. If you find yourself hand-writing gameplay fields
(strength, movement, yields) in a step, that is a sign the step should call a real
system helper instead.

By default, a step rejects placing something on an already-occupied tile. Pass
`unsafe: true` on a `unit`/`city`/`camp` step only when you are deliberately
reproducing a corrupt or edge-case state -- it is an explicit, visible marker, never a
silent default.

## How canonical state is derived

Everything not named in `base`/`steps` -- map, starting units for every civ, initial
visibility, minor civs, espionage state, idCounters -- comes from
`createNewGame`/`createHotSeatGame`, called once at the start of `buildScenario`. Steps
only add the specific delta a scenario needs. After all steps run, `buildScenario`
recomputes current visibility and contacts for every civ through the game systems.
An authored mid-campaign scenario can seed prior survey knowledge before this refresh.
IDs for regular units and cities come from the built state's own `idCounters`.

## Production/debug isolation guarantees

- The browser loader is gated on `import.meta.env.DEV`, a Vite compile-time constant --
  `false` for `vite build` (production), so the branch and its dynamic imports are
  eliminated from the production bundle, not merely hidden behind a runtime check.
- The loader only accepts a name that must match a key in the closed `SCENARIOS`
  registry -- an unknown name throws, it never falls through to arbitrary behavior.
- Building a scenario never mutates a live `GameSession` -- `buildScenario` is a pure
  function; the only thing that touches `GameSession` is the same
  `campaignEntry.enterCampaign(...)` call every other game-entry path already uses.

## Example

The two scenarios shipped in `src/testing/scenarios.ts` reproduce the exact starting
conditions two real, previously-hard-to-reproduce bugs needed:

- `undefended-enemy-city` (#843): a player scout 2 hexes from an undefended, at-war AI
  city, proving the city blocks movement/assault only from direct adjacency.
- `undefended-barbarian-camp` (#845): a player unit directly adjacent to an undefended
  barbarian camp, for the one-step assault path.

Both are asserted against in `tests/testing/scenarios.test.ts`, and both can be opened
directly with `?scenario=undefended-enemy-city` / `?scenario=undefended-barbarian-camp`
under `yarn dev` -- no manual play required to reach either state.

## Freight investment playtest (#1125)

Run `./scripts/dev-server.sh start` in the worktree. Use its dev URL with
`?scenario=freight-strait-a&playtest=1` or `?scenario=freight-strait-b&playtest=1` in
a fresh browser profile for each session that should begin on round 10. These links
enter the campaign directly. Each map resumes its own latest autosave, including
after playing the other map.

Both maps start in round 10 with Westport's Factory, an active Expedition, and
80 gold. The Freight investment control compares the two commitments and lets
the player defer. The capital comparison and freight procurement both preserve
30 gold. Each purchase costs 45 gold on entry, leaving five available. Ordinary
income then finances the purchases at the supplier.

In the automated full-round replay, the passage brings home three coal in round
14 and the Factory uses it in round 15. Via the long detour, the first five coal
arrive in round 18. Via the short detour they arrive in round 15. The detour's
Factory uses the coal in the round following delivery. When the Expedition
establishes the outpost in round 11, it supplies ivory by round 13 across both
maps and all three choices.

For an uncoached session, use a neutral objective such as “keep your ports
productive and decide where to spend your available gold.” Vary the order of
the two maps across sessions and observe desktop and touch. Ask the player to
explain their choice, what they expect to happen next, and which place they
remember. Record the first control they use, unused turns, repeated actions,
and any confusion between the quote, a shipment in transit, fuel in reserve,
and the Factory's use of it. The optional recorder exports local turn and
interaction data. Use facilitator notes to capture the reasoning and choices.
