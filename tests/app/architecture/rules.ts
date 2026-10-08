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
    kind: 'allowed-imports',
    from: `${S}/air-base-state`,
    allowed: ['src/core/types', `${S}/unit-definitions`],
    edges: 'all',
    why: 'isBasedAirUnit is asked by occupancy, targeting and the air system itself; it must stay a leaf (unit fields + the unit catalog, nothing else) so none of them has to import the air-operations system (strikes, interception) to ask it.',
  },
  {
    id: 'occupancy-and-targeting-do-not-import-the-air-system',
    kind: 'forbidden-import',
    from: [`${S}/unit-occupancy`, `${S}/attack-targeting`],
    to: `${S}/air-operations-system`,
    edges: 'all',
    why: 'unit-occupancy is read by movement, capture, threat pressure and crisis code; reaching up into air-operations (which imports combat and city-siege) closed a 28-module runtime cycle (#1248). Ask air-base-state instead.',
  },

  {
    id: 'stampede-reads-the-crisis-scheduling-leaf',
    kind: 'forbidden-import',
    from: `${S}/stampede-system`,
    to: `${S}/crisis-system`,
    edges: 'all',
    why: 'countActiveCrisesForCiv is defined in crisis-scheduling; the crisis-system barrel re-exports the whole crisis turn, so importing it for a count tied the stampede world-actor into the crisis/combat import cycle (#1248).',
  },
  {
    id: 'crisis-progression-does-not-import-the-barbarian-turn',
    kind: 'forbidden-import',
    from: `${S}/crisis-progression`,
    to: `${S}/barbarian-system`,
    edges: 'all',
    why: 'A crisis-driven hunt only needs to place a camp (barbarian-camp-placement), not the barbarian turn (combat selection, quest transitions, pressure); importing the turn closed the crisis family into the combat import cycle (#1248).',
  },
  {
    id: 'camp-placement-is-a-leaf',
    kind: 'allowed-imports',
    from: `${S}/barbarian-camp-placement`,
    allowed: ['src/core/types', 'src/core/types/ids', `${S}/hex-utils`],
    edges: 'all',
    why: 'Camp placement is a pure function of the map, cities, camps and a seed; game creation and the crisis hunt both call it, so it must depend on nothing but map geometry.',
  },
  {
    id: 'attack-targeting-does-not-import-the-combat-resolver',
    kind: 'forbidden-import',
    from: `${S}/attack-targeting`,
    to: `${S}/combat-system`,
    edges: 'all',
    why: 'Targeting needs only "who defends this tile" (combat-defense-strength), not the resolver with its modifier facts, exchanges and rewards; importing the resolver tied targeting, transport and movement into the combat import cycle (#1248).',
  },
  {
    id: 'defense-strength-is-a-closed-leaf',
    kind: 'allowed-imports',
    from: `${S}/combat-defense-strength`,
    allowed: ['src/core/types', `${S}/hex-utils`, `${S}/unit-definitions`, `${S}/wonder-system`],
    edges: 'all',
    why: 'Defender strength and defender selection are read by targeting, the renderer, input and the barbarian turn; the leaf may know units, tiles and wonders but never the resolver, rewards or any executor.',
  },

  {
    id: 'veterancy-tiers-is-a-types-leaf',
    kind: 'allowed-imports',
    from: `${S}/veterancy-tiers`,
    allowed: ['src/core/types'],
    edges: 'all',
    why: 'The veterancy ladder and the pure functions over it are read by combat resolution, city siege, beast slaying and the unit panels; the leaf may know the Unit type and nothing else, so none of them has to import the rewards executor to read a unit\'s tier.',
  },
  {
    id: 'world-actor-queries-is-a-closed-leaf',
    kind: 'allowed-imports',
    from: `${S}/world-actor-queries`,
    allowed: ['src/core/types', `${S}/hex-utils`],
    edges: 'all',
    why: 'Read-only facts about the Rogue Elephant host and the Stampede (command bonus, discount eligibility) are asked by combat and production pricing; the leaf stays a function of GameState so neither has to import the world-actor turns.',
  },
  {
    id: 'combat-resolver-below-rewards-and-world-actors',
    kind: 'forbidden-import',
    from: `${S}/combat-system`,
    to: [`${S}/combat-reward-system`, `${S}/rogue-elephant-host-system`, `${S}/stampede-system`],
    edges: 'all',
    why: 'The resolver computes a fight; rewards, world-actor turns and every executor sit above it. Importing them closed a 14-module combat/crisis import cycle (#1248) — read veterancy-tiers and world-actor-queries instead.',
  },
  {
    id: 'city-siege-below-rewards',
    kind: 'forbidden-import',
    from: `${S}/city-siege-system`,
    to: `${S}/combat-reward-system`,
    edges: 'all',
    why: 'City siege only needs a unit\'s veterancy modifier (veterancy-tiers); the rewards executor applies siege outcomes, so siege importing it is a cycle waiting to close (#1248).',
  },
  {
    id: 'production-pricing-does-not-import-world-actor-turns',
    kind: 'forbidden-import',
    from: `${S}/production-cost-context`,
    to: [`${S}/rogue-elephant-host-system`, `${S}/stampede-system`],
    edges: 'all',
    why: 'Pricing needs only whether a discount charge is active (world-actor-queries); the actors\' turns import movement, pathfinding and combat, so importing them tied every price quote into the combat import cycle (#1248).',
  },

  {
    id: 'economy-model-does-not-import-unit-completion',
    kind: 'forbidden-import',
    from: `${S}/economy-system`,
    to: `${S}/unit-production-completion`,
    edges: 'all',
    why: 'The treasury model (quotes, maintenance, projections) is read by pirates, quests, pricing and the AI treasury; the gold rush-buy *command* that completes a unit lives in rush-buy-system, so the model never imports the air, espionage and world-actor systems that completion pulls in (#1248).',
  },
  {
    id: 'unit-movement-does-not-import-the-air-system',
    kind: 'forbidden-import',
    from: `${S}/unit-movement-system`,
    to: `${S}/air-operations-system`,
    edges: 'all',
    why: 'Moving a unit only needs to keep a carrier\'s based aircraft on its tile (air-base-state); importing the strike/interception system from the movement executor closed the last ring of the systems import cycle (#1248).',
  },
  {
    id: 'ai-posture-table-is-a-types-leaf',
    kind: 'allowed-imports',
    from: 'src/ai/ai-national-intent-posture',
    allowed: ['src/core/types/ai'],
    edges: 'all',
    why: 'The per-intent bias table is pure data read by research, production, diplomacy, war goals, expansion and the turn; it may know only the NationalIntent type, never the resolver that picks an intent.',
  },
  {
    id: 'core-type-leaves-do-not-import-the-barrel',
    kind: 'forbidden-import',
    from: ['src/core/types/**', 'src/core/notification-log', 'src/core/autonomy-state', 'src/core/pirate-state'],
    to: 'src/core/types',
    edges: 'all',
    why: 'Bounded-context type leaves and the persisted core-state modules sit below the compatibility barrel (#1361); importing it back closed the autonomy-state/notification-log/pirate-state/types type cycle. Take HexCoord from types/hex, facts from types/combat, ids from types/ids.',
  },
  {
    id: 'ai-strategy-does-not-import-the-intent-resolver',
    kind: 'forbidden-import',
    from: 'src/ai/ai-strategy',
    to: 'src/ai/ai-national-intent',
    edges: 'all',
    why: 'ai-strategy needs only the posture table; importing the resolver closed an ai-strategy -> ai-national-intent -> ai-expansion-sites -> ai-strategy import cycle (#1248).',
  },
  {
    id: 'playtest-recorder-has-one-importer',
    kind: 'only-imported-by',
    target: 'src/app/playtest-recorder',
    importers: ['src/app/bootstrap', 'tests/**'],
    edges: 'all',
    why: 'The #1244 playtest recorder is an observer built only behind ?playtest=1 at the composition root. No system, AI, core, UI or renderer module may import it: a simulation that depends on the recorder (or a second construction site) is exactly the analytics-in-the-game coupling the recorder is designed to avoid.',
  },
  {
    id: 'playtest-export-button-has-one-importer',
    kind: 'only-imported-by',
    target: 'src/ui/playtest-export-button',
    importers: ['src/app/bootstrap', 'tests/**'],
    edges: 'all',
    why: 'The export button is the recorder\'s only visible trace and must exist only when the composition root builds the recorder; any other importer could show it with the flag off.',
  },
  {
    id: 'src-has-no-runtime-import-cycles',
    kind: 'acyclic-group',
    members: 'src/**',
    edges: 'runtime',
    why: 'After #1248 the production code has no runtime import cycle at all (type-only edges excluded, like the #1013 baseline). This is the declarative form of that fact: a new runtime cycle anywhere in src/ fails here with the cycle path, independently of the baseline file.',
  },
];
