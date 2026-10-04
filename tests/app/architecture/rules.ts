/**
 * The repository's declarative import-direction rules (#1241). Add a rule here — not a hand-written
 * regex test — for any constraint of the form "A must not import B", "A takes exactly this from B",
 * "this group has no cycles" or "only these modules import X". See `rule-engine.ts` for semantics and
 * `.claude/rules/caller-discipline.md` for when to use it.
 *
 * Migrated so far: #1012 (crisis-system decomposition). New since: #1246 (faction-system decomposition), #1249 (trade-system decomposition), #1250 (notification-routing decomposition), #1248 (runtime SCC reduction seams). Other `architecture-boundaries.test.ts`
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

/**
 * The #1246 faction family. Layering, leaf to root:
 *   unrest-model (types, thresholds, tiny predicates; imports no faction module)
 *   federalism   (policy constants + the one toggle command)
 *   relief       (administration ladder; reads model + federalism constants)
 *   pressure     (the pressure row model; reads relief)
 *   commands     (Appease / Concede; self-contained)
 *   system       (the faction turn: composes pressure + model; imported by one round-phase)
 */
const FACTION_MODULES = [
  `${S}/faction-unrest-model`,
  `${S}/faction-federalism`,
  `${S}/faction-relief`,
  `${S}/faction-pressure`,
  `${S}/faction-commands`,
  `${S}/faction-system`,
] as const;
const FACTION_ABOVE = (...names: string[]): string[] => names.map(name => `${S}/faction-${name}`);

/**
 * The #1249 trade family (trade-system.ts was split and deleted; there is no barrel). Layering:
 *   resource-definitions (the catalog + its derived lookup tables; imports no system module)
 *   marketplace-system | trade-route-economy | trade-route-lifecycle   (independent siblings)
 *   trade-caravan-system (establishes a route; reads the other three)
 */
const TRADE_MODULES = [
  `${S}/marketplace-system`,
  `${S}/trade-route-economy`,
  `${S}/trade-route-lifecycle`,
  `${S}/trade-caravan-system`,
] as const;

/**
 * The #1250 notification routers (src/ui/notification-routing.ts was split and deleted; no barrel).
 * Two leaves below eight independent domain routers:
 *   notification-sink     (the NotificationSink type)
 *   notification-audience (getNotificationTargetsForEvent — the audience authority)
 */
const NR = 'src/ui/notification-routes';
const NOTIFICATION_DOMAIN_ROUTERS = `${NR}/*-routes`;

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

  {
    id: 'faction-model-is-a-leaf',
    kind: 'forbidden-import',
    from: `${S}/faction-unrest-model`,
    to: [...FACTION_ABOVE('federalism', 'relief', 'pressure', 'commands', 'system'), `${S}/religion-loyalty-system`, `${S}/economy-system`, `${S}/city-system`],
    edges: 'all',
    why: 'The unrest model is the import-light leaf religion-loyalty and the faction layers all read (canGarrisonCity breaks the old faction-system <-> religion-loyalty cycle); reaching up or into the economy/city graph reintroduces it.',
  },
  {
    id: 'faction-federalism-is-a-leaf',
    kind: 'forbidden-import',
    from: `${S}/faction-federalism`,
    to: FACTION_ABOVE('unrest-model', 'relief', 'pressure', 'commands', 'system'),
    edges: 'all',
    why: 'The federalism policy (constants, lock, toggle) must not depend on the pressure model it reduces; relief imports it, never the reverse.',
  },
  {
    id: 'faction-relief-below-pressure',
    kind: 'forbidden-import',
    from: `${S}/faction-relief`,
    to: FACTION_ABOVE('pressure', 'commands', 'system'),
    edges: 'all',
    why: 'The relief ladder is read by the pressure breakdown, the AI production valuation and the AI research pull; it must stay beneath all of them.',
  },
  {
    id: 'faction-pressure-is-queries-only',
    kind: 'forbidden-import',
    from: `${S}/faction-pressure`,
    to: FACTION_ABOVE('commands', 'system'),
    edges: 'all',
    why: 'Pressure is a pure query model consumed by panels and the AI; it must not import the commands that spend gold or the turn orchestration that mutates cities.',
  },
  {
    id: 'faction-commands-self-contained',
    kind: 'forbidden-import',
    from: `${S}/faction-commands`,
    to: FACTION_ABOVE('unrest-model', 'federalism', 'relief', 'pressure', 'system'),
    edges: 'all',
    why: 'Appease and Concede are priced from a city and a tech list alone; coupling them to the pressure model would make a cost depend on a live unrest evaluation.',
  },
  {
    id: 'faction-modules-not-in-presentation-layers',
    kind: 'forbidden-import',
    from: FACTION_MODULES,
    to: ['src/ui/**', 'src/app/**', 'src/renderer/**', 'src/presentation/**', 'src/input/**'],
    edges: 'all',
    why: 'Faction rules are simulation: presentation layers depend on them, never the other way round.',
  },
  {
    id: 'faction-modules-acyclic',
    kind: 'acyclic-group',
    members: FACTION_MODULES,
    edges: 'all',
    why: 'The leaf-to-root layering above is only real if no cycle lets a lower module reach a higher one.',
  },
  {
    id: 'faction-turn-has-one-importer',
    kind: 'only-imported-by',
    target: `${S}/faction-system`,
    importers: ['src/core/round-phases/instability', 'tests/**'],
    edges: 'all',
    why: 'faction-system is the orchestration (processFactionTurn) and was split from the model so callers import the focused module; a new src importer is the old kitchen-sink barrel growing back.',
  },
  {
    id: 'religion-loyalty-reads-only-the-faction-model',
    kind: 'forbidden-import',
    from: `${S}/religion-loyalty-system`,
    to: FACTION_ABOVE('federalism', 'relief', 'pressure', 'commands', 'system'),
    edges: 'all',
    why: 'faction-pressure imports religion-loyalty (foreign-faith pressure); religion-loyalty may only read the faction model leaf, or the #1246 cycle break is undone.',
  },

  {
    id: 'resource-catalog-is-a-leaf',
    kind: 'forbidden-import',
    from: `${S}/resource-definitions`,
    to: ['src/systems/**', 'src/ui/**', 'src/app/**', 'src/renderer/**'],
    edges: 'all',
    why: 'The resource catalog and its derived tables (BASE_PRICES, RESOURCE_ICONS, RESOURCE_TECH) are data every layer reads; a system or UI dependency would make renderers and map generation depend on trade logic again.',
  },
  {
    id: 'trade-siblings-are-independent',
    kind: 'forbidden-import',
    from: [`${S}/marketplace-system`, `${S}/trade-route-economy`, `${S}/trade-route-lifecycle`],
    to: TRADE_MODULES,
    edges: 'all',
    why: 'Pricing, route value and route lifecycle are three separate questions; only the caravan module composes them, so none may reach a sibling (or the caravan module above them).',
  },
  {
    id: 'trade-modules-not-in-presentation-layers',
    kind: 'forbidden-import',
    from: TRADE_MODULES,
    to: ['src/ui/**', 'src/app/**', 'src/renderer/**', 'src/presentation/**', 'src/input/**'],
    edges: 'all',
    why: 'Trade rules are simulation: presentation depends on them, never the reverse.',
  },
  {
    id: 'renderer-reads-resources-from-the-catalog',
    kind: 'forbidden-import',
    from: 'src/renderer/**',
    to: [...TRADE_MODULES, `${S}/trade-route-classification`, `${S}/quest-aware-trade-system`],
    edges: 'all',
    why: 'The map renderer needs resource icons and reveal techs, which are catalog data; it must not depend on any trade logic module to get them (the pre-#1249 system barrel did exactly that).',
  },
  {
    id: 'trade-modules-acyclic',
    kind: 'acyclic-group',
    members: TRADE_MODULES,
    edges: 'all',
    why: 'The sibling-then-caravan layering is only real if no cycle lets a lower trade module reach a higher one.',
  },

  {
    id: 'notification-sink-is-a-type-leaf',
    kind: 'forbidden-import',
    from: `${NR}/notification-sink`,
    to: ['src/systems/**', 'src/ui/**', 'src/app/**', 'src/renderer/**', 'src/presentation/**'],
    edges: 'all',
    why: 'Every router writes through NotificationSink; the type must stay a leaf (only the notification-log shapes) so it can never pull a domain into the others.',
  },
  {
    id: 'notification-audience-is-a-leaf',
    kind: 'forbidden-import',
    from: `${NR}/notification-audience`,
    to: ['src/ui/**', 'src/app/**', 'src/renderer/**', 'src/presentation/**'],
    edges: 'all',
    why: 'getNotificationTargetsForEvent is the one audience authority; it sits below every router and must not depend on the routers or any UI that consumes it.',
  },
  {
    id: 'notification-audience-has-one-asker',
    kind: 'only-imported-by',
    target: `${NR}/notification-audience`,
    importers: [`${NR}/map-routes`, 'tests/**'],
    edges: 'all',
    why: 'Audience derivation is centralised; a router that imports the authority is a router deriving its audience from state, which must be a deliberate, reviewed addition (extend this list), never an incidental one.',
  },
  {
    id: 'notification-domain-routers-are-independent',
    kind: 'forbidden-import',
    from: NOTIFICATION_DOMAIN_ROUTERS,
    to: NOTIFICATION_DOMAIN_ROUTERS,
    edges: 'all',
    why: 'A domain router owns the copy and recipients for its own event family; importing a sibling means sharing audience or wording logic, which belongs in a shared leaf (the sink or the audience authority) instead.',
  },
  {
    id: 'notification-routers-below-presentation-and-app',
    kind: 'forbidden-import',
    from: `${NR}/**`,
    to: ['src/app/**', 'src/renderer/**', 'src/input/**', 'src/presentation/**'],
    edges: 'all',
    why: 'Routers decide who is told what; presentation registrars and controllers call them. A router reaching up would let delivery wiring leak into recipient rules.',
  },
  {
    id: 'systems-do-not-import-notification-routers',
    kind: 'forbidden-import',
    from: 'src/systems/**',
    to: `${NR}/**`,
    edges: 'all',
    why: 'Simulation emits events; presentation routes them. A system importing a router couples game rules to player-facing copy.',
  },
  {
    id: 'notification-routers-acyclic',
    kind: 'acyclic-group',
    members: `${NR}/**`,
    edges: 'all',
    why: 'The two leaves below eight independent routers is only real if no cycle lets a leaf reach a router.',
  },

  {
    id: 'production-completion-reads-the-spy-leaf',
    kind: 'forbidden-import',
    from: `${S}/unit-production-completion`,
    to: [`${S}/espionage-system`, `${S}/espionage-turn`],
    edges: 'all',
    why: 'Completing a unit needs only the spy record builder (espionage-spy-lifecycle). The espionage barrel re-exports the whole turn (city capture, world races), so importing it pulled espionage-turn into the combat/economy/movement import cycle (#1248, same bug class as #1201).',
  },
  {
    id: 'air-base-state-is-a-leaf',
    kind: 'forbidden-import',
    from: `${S}/air-base-state`,
    to: ['src/systems/**', 'src/ui/**', 'src/app/**', 'src/ai/**'],
    edges: 'all',
    why: 'isBasedAirUnit is asked by occupancy, targeting and the air system itself; it must stay a one-field leaf so none of them has to import the air-operations system (strikes, interception) to ask it.',
  },
  {
    id: 'occupancy-and-targeting-do-not-import-the-air-system',
    kind: 'forbidden-import',
    from: [`${S}/unit-occupancy`, `${S}/attack-targeting`],
    to: `${S}/air-operations-system`,
    edges: 'all',
    why: 'unit-occupancy is read by movement, capture, threat pressure and crisis code; reaching up into air-operations (which imports combat and city-siege) closed a 28-module runtime cycle (#1248). Ask air-base-state instead.',
  },
];
