/**
 * The repository's declarative import-direction rules (#1241). Add a rule here — not a hand-written
 * regex test — for any constraint of the form "A must not import B", "A takes exactly this from B",
 * "this group has no cycles" or "only these modules import X". See `rule-engine.ts` for semantics and
 * `.claude/rules/caller-discipline.md` for when to use it.
 *
 * Migrated so far: #1012 (crisis-system decomposition). Other `architecture-boundaries.test.ts`
 * blocks still hold their own checks and move here one block at a time.
 */
import type { ArchitectureRule } from './rule-engine';

const S = 'src/systems';

/** The #1012 crisis decomposition. `crisis-system` (the barrel) and the *-definitions/-force/-interaction modules are outside it. */
const CRISIS_MODULES = [
  `${S}/crisis-scheduling`,
  `${S}/crisis-effects`,
  `${S}/crisis-progression`,
  `${S}/crisis-lifecycle`,
  `${S}/crisis-interventions`,
] as const;

export const ARCHITECTURE_RULES: readonly ArchitectureRule[] = [
  {
    id: 'crisis-effects-is-a-leaf',
    kind: 'forbidden-import',
    from: `${S}/crisis-effects`,
    to: CRISIS_MODULES,
    edges: 'all',
    why: 'crisis-effects holds severity/yield queries that every other crisis module reads; importing a sibling would make the query layer depend on the machinery that consumes it.',
  },
  {
    id: 'crisis-scheduling-below-turn-orchestration',
    kind: 'forbidden-import',
    from: `${S}/crisis-scheduling`,
    to: [`${S}/crisis-progression`, `${S}/crisis-lifecycle`, `${S}/crisis-interventions`],
    edges: 'all',
    why: 'Eligibility/onset policy is decided before any crisis is ticked; depending on the tick loop or player commands inverts that order.',
  },
  {
    id: 'crisis-lifecycle-generic-loop',
    kind: 'forbidden-import',
    from: `${S}/crisis-lifecycle`,
    to: [`${S}/crisis-scheduling`, `${S}/crisis-interventions`, `${S}/crisis-effects`],
    edges: 'all',
    why: 'The staged lifecycle loop is generic ("tick this instance, keep or drop the result"); its only crisis-specific coupling is the single dispatch seam, which #990 generalised.',
  },
  {
    id: 'crisis-lifecycle-single-dispatch-seam',
    kind: 'import-seam',
    from: `${S}/crisis-lifecycle`,
    to: `${S}/crisis-progression`,
    names: ['tickCrisisByArchetype'],
    edges: 'all',
    why: 'The lifecycle reaches archetype policy only through the one dispatch function, never an individual archetype tick body — the exact seam the event-chain engine (#990) mirrors.',
  },
  {
    id: 'crisis-interventions-not-tick-or-schedule',
    kind: 'forbidden-import',
    from: `${S}/crisis-interventions`,
    to: [`${S}/crisis-lifecycle`, `${S}/crisis-scheduling`, `${S}/crisis-progression`],
    edges: 'all',
    why: 'Player commands act on a crisis that already exists; they must not pull in the turn-tick loop or the scheduler that creates crises.',
  },
  {
    id: 'crisis-modules-acyclic',
    kind: 'acyclic-group',
    members: CRISIS_MODULES,
    edges: 'all',
    why: 'A cycle among the crisis modules leaves constants undefined at import time and makes the split meaningless.',
  },
  {
    id: 'crisis-internals-not-in-ui-or-renderer',
    kind: 'forbidden-import',
    from: ['src/ui/**', 'src/renderer/**'],
    to: CRISIS_MODULES,
    edges: 'all',
    why: 'UI and renderer reach crisis behaviour through the crisis-system barrel or a controller, so the implementation modules stay free to be re-split.',
  },
];
