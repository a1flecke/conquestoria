# AI worker development evidence (#1427)

The ordinary administrative worker path now develops useful destinations through
`src/ai/ai-worker-development.ts`. The player continues to use the existing
worker controls and canonical improvement, construction, movement and save rules.

## Confirmed causes

Actual AI turns on baseline `6a305713245a0eb7049821dffdb03b22f64654a3`
selected a farm on owned, revealed plains containing cattle, horses, oil or wine,
despite the required pasture, oil well or plantation also being legal. Six to
eight subsequent AI turns completed the farm but never acquired the resource.
Catalog order was being used as economic preference.

A worker on its city center stayed there for eight AI turns with useful reachable
unimproved worked land nearby. Ordinary tasking inspected only its current tile.
Two workers similarly left separated useful sites undeveloped.

An active road worker was selected again after the construction tick. It restarted
the road, spent another charge and was consumed. The road action remains a legal
human command; the AI now excludes active construction and already-building road
targets. Loaded workers could also reserve catastrophe restoration work and prevent
a free worker from taking it. Restoration targeting now excludes cargo.

## Bounded decision model

One inventory per civilization visits canonical available city workable tiles.
Only currently visible, legitimately owned, non-devastated sites enter ordinary
improvement planning. Known-resource lookup retains the canonical reveal-tech gate.
Active improvements and roads are excluded. The existing catastrophe dispatcher
retains first access to workers; active construction is never interrupted.

Each job exposes its category, acquisition value, productivity value and canonical
construction duration. A first unavailable resource is worth 12 weighted yield
points; a happiness luxury serving an unrested city is worth 18. Access already
available or being built has no repeated acquisition value. Canonical resource
access is a set, not a spendable quantity. Generic improvements do not overwrite a
known resource's intended improvement; incorrect completed generic improvements
can be replaced through the existing canonical replacement option.

Productivity is the completed tile yield minus its current worked yield, or the
larger of its current yield and the marginal occupied citizen slot. Ordinary
weights are food/production 3 and gold/science 2; focus doubles the relevant weight
to 6. Low worked food doubles food's weight. Gold's scarcity weight is
`2 + 4 / (1 + max(0, treasury))`, bounded above by 6 and approaching the ordinary
weight 2 as reserves grow; explicit gold focus remains 6. Zero marginal value
creates no productivity job. A city-connection road
has operational value 8, with its duration coming from the canonical road rules.
Road and improvement alternatives remain separately reachable on the same site.

Known hostile units exclude both nearby destinations and routes within two hexes.
The existing observer-bounded path map supplies visible tiles and trusted fog
snapshots. One shared pass labels reachable components using canonical worker
terrain passability and known blockers. Every passable known tile is visited at
most once, avoiding repeated exact searches toward disconnected resource sites.

Workers are ordered by their best cheap value/travel estimate, then stable ID.
Each worker shortlists at most 12 unreserved jobs and precisely routes at most four
distinct sites, sharing the route for road/improvement alternatives. Finalists use
actual remaining path length plus build duration. The winner is reserved before
the next worker shortlists; this keeps co-located workers from repeatedly selecting
the same four jobs. Coordinate/action ties are stable. Commands still revalidate
through `resolveUnitMoveIntent`, `executeUnitMove` and `applyWorkerAction`.

## Gameplay continuity and related-path audit

The development criteria include coherent project completion, recovery of damaged
communities, useful city connections, and fair opportunities to interrupt work.
These are observable gameplay contracts, not a claim that automated tests establish
subjective fun or affection for a civilization. Existing improvements, construction
events, road rendering and city yields expose completed work through the live game;
no new UI or visual assets are necessary.

The treasury competition scenario initially stalled after one move because its
manually visible corridor lacked observed last-seen snapshots. Movement downgraded
two corridor tiles to fog; `buildKnownPathMap` correctly omitted them as untrusted.
Canonical snapshot initialization repaired the fixture without weakening privacy.
The game-creation, per-round vision, movement and atomic vision-refresh paths all
capture observations after revealing tiles; the inspected production callers did
not share this fixture omission.

With trustworthy observations, pre-hardening commit
`7eede49253a497480b1fa994317c7782d55d752a` exposed a real deterministic failure:
alternating treasury 0/1 changed the gold weight abruptly from 6 to 2, sending a
worker between positions 3 and 4 for twelve turns without completing either job.
The bounded gradual scarcity premium removes this discontinuity. Both starting
phases now reach the mine in six travel turns, finish it within twelve AI turns,
spend one charge, emit one completion, and raise the worked city's production by
2 and gold by 1 per turn. No persistent intent or balance-rule changes were added.

The similar-path audit found two independent problems:

* The remembered path map dropped the observed `hasRoad` field. A
  city-connection planner therefore selected an already-built fogged link, while
  the ordinary job filter correctly refused work on that nonvisible target. The
  new regression now completes the visible missing link. Paired controls retain
  observed road presence/absence despite opposite unseen live changes, update on
  visibility, and refuse missing, legacy-reconstructed or unexplored observations.
  Rail appearance remains presentation-only snapshot data; `HexTile` has no rail
  flag, and no new gameplay or save field was introduced.
* Catastrophe assignment accepted a terrain-only route whose first step canonical
  movement rejected. That reservation permanently starved reachable ordinary
  work. Assignment now supplies worker/technology context and validates the first
  command before reserving. The blocked worker completes a reachable farm, then
  resumes urgent recovery when the blocker is removed, using its final charge.

This audit does not claim that gradual valuation guarantees stability under every
possible changing food pressure, city focus or emergency. Significant changes can
legitimately alter the preferred job. The explicit regression establishes progress
under the demonstrated minor treasury fluctuation, rather than hiding wasted
travel behind activity counts.

## Deterministic before/after outcomes

The exact same fixture and real AI-turn/construction loop were run in an isolated
unchanged-main checkout and the implementation checkout. The worked-land scenario
uses explicit canonical custom worked tiles, so extra activity must improve an
occupied citizen slot rather than merely add an unused farm.

| Eight-turn worked-land scenario | Baseline | New behavior |
| --- | ---: | ---: |
| Productive travel turns | 0 | 2 |
| Useful improvements completed | 0 | 1 |
| Worker charges spent | 0 | 1 |
| Food per turn | 7 | 9 |
| Production / gold / science per turn | 1 / 1 / 1 | 1 / 1 / 1 |

All four resource scenarios spend one charge. Baseline completes four incorrect
farms and activates zero resources. New behavior completes the four matching
improvements and activates cattle, horses, oil and wine after their timers finish.
The competing-worker resource scenario emits one start and one completion, with
one total charge spent. Separate-site workers both finish their own improvements.

The existing two-city integration still runs the completed-round orchestrator,
major AI scheduler and world turn, and completes a road. The catastrophe integration
still restores land through real AI/world rounds. Development-specific scenarios
use real AI turns with canonical construction ticks and turn-start movement resets
to isolate worker decisions from unrelated growth and combat.

## Safety and lifecycle coverage

`tests/ai/basic-ai-worker-roads.test.ts` covers known resources; hidden-resource
equivalence; unseen owned sites; newly researched resources and incorrect-farm
repair; new/lost territory; death during travel; completion by another worker;
cityless/resettled civilizations; occupied and disconnected routes; civilian
closed-border exemption and foreign-city blocking; urgent restoration competing
with roads/resources; cargo exclusion; no useful jobs; human ownership; input
immutability; concealed-unit equivalence; last-charge consumption; busy road and improvement continuity;
construction events; nearby economic need beating a distant resource; deterministic
detour selection; and whole-state save/reload equivalence during travel and building.
No save fields, migration or cross-turn cache were added.

Architecture verification retains zero runtime import cycles. The existing busy
worker query now lives in movement validation and remains re-exported from the
executor, allowing road selection to read it without an executor dependency.
Worker/improvement action types live in the existing resource contract leaf;
the compatibility barrel retains its 577-importer ceiling and shrinks from 203
to 200 local declarations. The generated import inventory records the planner's
15 intended planner AI-to-system edges plus one crisis-to-canonical-validation
edge; no runtime cycle or source-rule allowance was added.

## Planning effort

Fixed medium and large generated maps, one founded city and six workers produced:

| Map | Map tiles | Candidate jobs | Exact path calls including validation | Unique assignments |
| --- | ---: | ---: | ---: | ---: |
| Medium | 2,500 | 18 | 48 | 6 |
| Large | 6,400 | 16 | 48 | 6 |

The regression bounds assignment-time routing to eight calls per worker: four
finalist searches plus their first-step validation. Movement execution adds one
validated command per traveling worker. City road-target selection has its existing
separate connection search. Local observed planning time was approximately 9 ms
and 30 ms respectively on the shared host; these timings are diagnostics, never
test thresholds. The shortest-path-only intermediate version assigned only four
of six co-located workers; reserving before the next shortlist repaired that failure.

Optional machine-local measurements are reproducible with
`WORKER_DEVELOPMENT_REPORT=1 ./scripts/dev.sh test tests/ai/basic-ai-worker-roads.test.ts`;
JSON artifacts live under `.verification/worker-development/`.

## Limits

This is bounded deterministic greedy assignment, not global optimization. It models
known local threat proximity, not probabilistic enemy intent or future troop
production. It retains one-step-per-AI-turn travel and the existing catastrophe
response delay. It does not plan speculative forts, destructive swamp draining,
hidden resources or improvements outside city workable claims. Weights are
transparent AI preferences, not changes to yields, charges, technology or balance.
No long-horizon matrix was run; optional campaign diagnostics remain a separate
workstream and are not evidence for this bounded comparison.
