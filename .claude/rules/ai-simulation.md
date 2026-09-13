---
paths:
  - "src/ai/**"
  - "src/core/**"
  - "tests/simulation/**"
---

# AI Simulation Rules

## The long-horizon campaign suite (`yarn test:ai-long`, #1005)

`tests/simulation/ai-playability.test.ts` verifies the AI over 30 turns by
default (60 with `AI_SIM_EXTENDED=1`). Whole classes of failure — expansion
stalls, economic death spirals, unwinnable stalemates, a plan that wedges for
100 turns — only appear well past turn 60. `yarn test:ai-long` runs 250–500 turn
deterministic campaigns across every challenge tier, every AI personality,
small/medium/large maps, solo and hot seat, and an early- and a late-era start,
with the full per-round invariant battery on.

It is **explicit-run only**. `tests/simulation/long-horizon/**` is excluded from
`vite.config.ts` unconditionally; only `vitest.long-horizon.config.ts` (driven by
`scripts/run-ai-long-horizon.sh`) re-includes it. It is **not** in `yarn test`,
`test:regular`, `test:intensive-simulations`, `verify:push`, the pre-push hooks, the production
build, or CI, and must never be — `tests/scripts/ai-long-horizon-isolation.test.ts`
fails in the ordinary suite if that ever changes. Do not "fix" that guard by
loosening it.

### When to run it

**Run `yarn test:ai-long` before declaring complete** a change that materially
affects:

- AI strategic planning, production, diplomacy, or movement
- pathfinding or the movement-cost model
- combat decision-making
- the economy (yields, maintenance, unrest, growth)
- victory pursuit / turn orchestration
- any large simulation system whose behaviour compounds over a campaign

**Do not run it** for docs-only changes, asset-only changes, isolated CSS,
trivial copy, or test-only refactors unrelated to the simulation. It costs
~20 minutes; it is a deliberate pre-merge check for substantial AI/gameplay
work, not a universal gate.

### Reading the output

Each scenario writes two files under the gitignored `.verification/` tree:

- `.verification/ai-long-horizon/<seed>.json` — **deterministic**: scenario
  config, the analysis report (`summary`, `perCiv`, `findings`, `observations`),
  and a decimated sample series. Sorted keys, no wall-clock value, no date, no
  path. Same seed ⇒ byte-identical file, so a real behaviour change shows up as a
  diff. Commit-to-commit comparison of this file is the point.
- `.verification/ai-long-horizon/<seed>.timings.json` — machine-specific
  (`roundDurationsMs`, `elapsedMs`, node version, cpu count). **Never asserted
  on.** For local human investigation only; #1007 owns real performance budgets.

`findings` are liveness / progress / envelope violations from
`campaign-analysis.ts` — a living AI that never expands, a city idle 12+ rounds,
gold hoarded without spend, a unit count running away while the empire never
grows, a wedged plan, a stagnant war, an eliminated civ regaining entities.
Thresholds are in `DEFAULT_CAMPAIGN_ANALYSIS_CONFIG`, each measured against
`main` and given headroom; a detector that would need a different threshold per
challenge tier is a wrong detector — fix the detector.

### The known-gap ratchet

`tests/simulation/long-horizon/known-campaign-gaps.ts` is a **two-way ratchet**,
enforced by `campaign-matrix.test.ts`:

1. A finding with **no** `KNOWN_CAMPAIGN_GAPS` entry fails the run. A new stall
   can never land silently — either fix it, or add an entry citing a focused
   follow-up issue.
2. A declared gap that **no longer reproduces** in any of its scenarios also
   fails the run, telling you to delete the entry. The register can never go
   stale.

When you fix an AI bug the suite was tracking, delete its register entry in the
same change. When the suite finds something new, do **not** loosen a detector or
widen a threshold to hide it — add a register entry and file the follow-up.

## AI expansion (#1064)

Expansion is a real strategic-plan objective, not an administrative side-channel.

- `objectiveCandidates()` (`src/ai/ai-prepared-turn.ts`) emits an `expand` candidate with
  `requiredRoles: { settlement: 1 }` and a `region` target. With no settler the candidate
  is ineligible but still reports `settlement` via `missingRoles`, which becomes an
  `objective-readiness` demand and makes the settler buildable. With a settler it becomes
  a plan, the settler is assigned to it, and `ai-tactics.ts` walks it to the anchor.
- **Exactly one** expand candidate is emitted per turn. `assertLegalChoices` in
  `tests/simulation/ai-playability-fixture.ts` hard-throws above 12 trace candidates, so
  this bound is structural, not a tuning choice. The shortlist inside
  `getKnownExpansionSites` exists only so an unreachable best site falls back to a
  reachable one.
- **Belief vs legality.** `src/ai/ai-expansion-sites.ts` answers "as far as this civ
  knows, could a city stand here?" and must never import `GameState` — it receives an
  already-fog-bounded map, so information safety is structural rather than a convention.
  Legality is validated at execution time by `canFoundCityAt` and `foundCityInState`. The
  belief layer imports `isCityCenterTerrain`, `MIN_CITY_CENTER_DISTANCE` and the
  wrap-aware `cityDistance` from `city-territory-system.ts` so the two can differ only in
  which cities the civ knows about. `knownCityPositions` in `ai-prepared-turn.ts` MUST
  include **both** `perception.ownCities` and `perception.knownCities` — the latter is
  built only from *other* civs' cities, never the actor's own, and omitting the former
  let a site win one tile from the civ's own capital, permanently freezing the settler.
- **Site enumeration is radius-bounded** (`EXPANSION_SEARCH_RADIUS`). An unbounded scan is
  `O(known tiles x known cities)` per civ per round.
- **No passive knowledge source ever reaches `MIN_CITY_CENTER_DISTANCE`.** City vision is
  a fixed radius 2 (`updateVisibility`, `fog-of-war.ts`); culture-matured territory caps
  at radius 3 (`getCulturalTerritoryRadius`); both are permanently short of the legal
  floor of 4. An idle-unit administrative auto-explore loop in `basic-ai.ts`
  (`getIdleExplorerUnitIds` in `ai-exploration.ts`, reusing the player-facing
  `chooseAutoExploreMove`/`applyAutoExploreOrder`) is therefore load-bearing, not
  optional — without it, no civ that starts at peace with no visible rival can ever
  discover a legal expand site, for the entire game.
- **`getIdleExplorerUnitIds` must exclude a unit already auto-exploring.**
  `turn-manager.ts`'s per-civ turn-start loop (the same generic mechanism the player's own
  auto-explore button drives) already re-issues that unit's move every round with
  freshly-reset movement, *before* the AI round scheduler ever calls into `basic-ai.ts`.
  Since that move often does not consume the unit's full movement budget, a still-idle
  already-exploring unit picked up again here gets moved a second time in the same round —
  this administrative loop only ever *initiates* exploration for a unit that isn't
  auto-exploring yet.
- **The incremental-demand rule.** Any demand meaning "one more of role R, up to a cap"
  goes through `incrementalDemandSeed`: `desired = min(owned + 1, cap)`,
  `assigned = owned`, so `missing` is structurally 0 or 1. Never hand-roll this — the bug
  it replaces (`desired: 1, assigned: 0` re-seeded every turn) produced one unit per turn
  forever. Priorities: defense 500-1000 > observed threats 180 > objective-readiness and
  settlement 90 > worker infrastructure 40.
- `expansionDrive` gates *whether* a civ expands in exactly one place —
  `getExpansionCitySoftCap`, a 2-to-6 city soft cap on new settling (not on empire size;
  conquest is unaffected). Everywhere else it only weights *how much*.
- `weightProductionRoles`'s `settlement` term is live as of #1064. It was dead before.
- **Difficulty invariance.** Challenge profiles tune scores and timing
  (`maxPrimaryForce`, `mobilizationRounds`), never expansion legality or site selection.

**#1064 fixes expansion for every civ that forms a plan, not universally.** Before this
MR every AI civ was permanently stuck at one city, so no AI civ ever reached a multi-city
economy or a high tech count within a fixed-round campaign, and no scenario ever ran long
enough post-expansion to exercise a save/reload boundary against a contested border. Once
expansion actually works, several *pre-existing* gaps become reachable for the first time
— none caused by, or fixable within, #1064 — see `known-campaign-gaps.ts`'s file header
for the full detail on each:

- **`expansion-frozen` still reproduces in `lh-late-era-medium`** for civs that form zero
  strategic plans across the whole 250-round campaign — believed to share
  `unit-count-runaway`'s already-tracked, not-yet-triaged root cause (#1066): #1064's
  exploration loop feeds the belief layer once a plan exists, it cannot make
  `prepareMajorCivStrategicPlan` itself produce one.
- **`production-idle`/`gold-hoard` reproduce on every medium/large-map scenario** (never
  on the three small-map scenarios) — the "residual idle" contingency #1064's own design
  doc anticipated (§2.20): a civ that expansion now genuinely works for eventually reaches
  its soft cap or exhausts buildable content on a bigger map. See #1094.
- **#1092 (fixed)** — a load-time territory recompute bug that froze contested border
  tiles to their previous owner across a save/reload instead of matching live play, only
  reachable once AI civs have contested, closely-packed borders. See
  `.claude/rules/game-systems.md`'s "Load-time territory recompute must match live
  attrition" for the fix.
- **#1093** (`tech-frozen`, registered in `known-campaign-gaps.ts`) — a civ with techs
  objectively available completes none for 135+ rounds in `lh-late-era-medium`, once
  expansion lets it reach a far higher tech count within the scenario's fixed round budget
  than was ever reachable before. A separate, pre-existing stall in `ai-research.ts`
  untouched by any #1064 change.

### Adding a scenario

Append a row to `LONG_HORIZON_SCENARIOS` in `campaign-scenarios.ts` (fixed seed,
challenge, map size, human/AI counts, turn cap, personality set). Keep the whole
matrix under ~25 minutes; put the measured wall-clock in the row comment and
size `SCENARIO_TIMEOUT_MS` off the slowest row × 3, per
`.claude/rules/hooks-and-tooling.md`.

### Determinism

Every scenario must be reproducible from its seed and its deterministic artifact
byte-identical across two runs on the same commit — `campaign-continuity.test.ts`
asserts exactly that, plus save/reload continuity. The observer callback receives
**plain data only, never `GameState`**, so the analysis layer is structurally
unable to perturb the simulation and the artifact cannot pick up a live object
reference. Keep it that way: never pass `state` into `observe`.
