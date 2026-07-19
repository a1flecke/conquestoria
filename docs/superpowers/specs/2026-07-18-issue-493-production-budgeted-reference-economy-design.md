# Issue #493: Production-budgeted representative economy design

## Status and intent

Issue #493 follows MR13's pacing recalibration. The current reference-economy fixture models two single-city extremes: a recent-era `bounded` building window and an all-eligible-building `maximal` completionist city. Neither answers the diagnostic question that matters for ordinary games: what science and production does a growing empire with cities of different ages produce after paying real construction costs?

This design adds a third, diagnostic-only `representative` view. It models a deterministic five-cohort empire, a cost-aware prerequisite-closed research route, and turn-by-turn infrastructure construction from a bounded share of actual city production. It preserves the existing `maximal` era 10-13 research target and both legacy profiles unchanged.

The result is balance instrumentation, not a player-facing mechanic. It must not alter runtime game state, AI decisions, difficulty rules, UI, sound, saves, solo play, or hot-seat play.

## Decisions

- Keep `bounded` and `maximal` unchanged for historical regression continuity.
- Add `representative` as a separate multi-city diagnostic, never as an implicit replacement for either legacy profile.
- Keep era 10-13 research pacing targeted to `maximal`, as required by issue #493's non-goal.
- Grow the representative empire from one to five cities using cohorts founded in eras 1, 3, 5, 7, and 9.
- Allocate 60% of local production to infrastructure in the canonical snapshot; run 50% and 70% sensitivity variants.
- Derive research duration and unlock timing from the live technology catalog, costs, prerequisites, pacing profiles, advancement fractions, and canonical personal-era resolver.
- Select buildings with a deterministic catalog-driven balanced scorer. Do not import AI production scoring.
- Report empire totals, per-city results, and per-city averages.
- Apply city-scoped and empire-scoped yields at their correct scopes.
- Keep all implementation under test helpers, tests, and balance documentation. Any required `src/**` change is a scope expansion that requires approval.

## Three reference views

| View | Shape | Building assumption | Policy role |
|---|---|---|---|
| `bounded` | One city | Eligible buildings gated in the recent-era window, plus forced prerequisites | Historical lower comparison |
| `representative` | Era-scaled one-to-five-city empire | Buildings completed from a production budget along a live, cost-aware research timeline | Realistic diagnostic and sensitivity analysis |
| `maximal` | One city | Every eligible ordinary building | Completionist safety target for era 10-13 research pacing |

The views answer different questions and are not ordered assertions. In particular, a multi-city representative empire total is not directly comparable to a single-city maximal output. Comparisons must name whether they use empire total or per-city average.

## Current-code compatibility

Issue #493 predates the personal-era work merged through issue #523. The legacy fixture still defines "arrival at era N" as every technology in eras strictly before N and none from era N. That behavior remains frozen for `bounded` and `maximal` so existing snapshots and the completionist research target do not drift.

The new `representative` view follows current runtime progression instead:

- `getEraAdvancementTechs`, `getEraAdvancementFraction`, `hasReachedEraThreshold`, and `resolveCivilizationEra` define advancement truth.
- Reaching a personal era may therefore include a threshold set of technologies authored in that era, matching the live resolver rather than the older MR13 fixture convention.
- Tests must state this semantic difference. The representative route must resolve to the requested personal era, while both legacy profiles retain their existing completed-tech sets.

This is an intentional compatibility boundary, not an attempt to reconcile or retune the legacy constants inside #493.

## Architecture

### `tests/systems/helpers/pacing-reference-economy.ts`

This module retains the legacy single-city functions and owns neutral city/map construction plus final yield aggregation. It adds the representative orchestration entry point without widening `ReferenceEconomyProfile`:

```ts
export type ReferenceEconomyProfile = 'bounded' | 'maximal';

export interface ReferenceYieldOutput {
  science: number;
  production: number;
}

export interface RepresentativeCityOutput {
  cohortId: string;
  foundedEra: number;
  maturity: CityMaturity;
  completedBuildings: string[];
  activeBuilding: { id: string; progress: number } | null;
  actualProductionEarned: number;
  cappedProductionEarned: number;
  infrastructureProductionAllocated: number;
  infrastructureProductionSpent: number;
  discardedObsoleteProgress: number;
  unspentInfrastructureProduction: number;
  yieldsBeforeEmpireFlat: ReferenceYieldOutput;
}

export interface RepresentativeEmpireOutput {
  era: number;
  infrastructureShare: number;
  completedTechs: string[];
  cityCount: number;
  cities: RepresentativeCityOutput[];
  total: ReferenceYieldOutput;
  averagePerCity: ReferenceYieldOutput;
}

export function getRepresentativeEmpireOutput(
  era: number,
  options?: { infrastructureShare?: 0.5 | 0.6 | 0.7 },
): RepresentativeEmpireOutput;
```

### `tests/systems/helpers/pacing-production-budget.ts`

This focused helper owns:

- canonical research-route construction and technology completion turns;
- era-transition turns;
- city cohort data;
- ordinary-building eligibility and prerequisite closure;
- balanced building selection;
- turn-by-turn local production allocation;
- partial building progress and obsolescence handling;
- diagnostic accounting and invariant checks.

It consumes production and yield systems but never consumes `GameState`, player IDs, `currentPlayer`, AI personalities, challenge profiles, UI, audio, or persistence.

## Canonical research timeline

### Route construction

The representative route is deterministic and cost-aware, but it is not claimed to be a proof of globally optimal play.

Starting with an empty completed set and personal era 1, repeat for each requested transition:

1. Read the next era's qualifying technologies and advancement fraction through the canonical helpers.
2. Compute the required qualifying count with the canonical rounded-up threshold.
3. For every incomplete qualifying candidate, compute its missing recursive prerequisite closure.
4. Rank candidates by incremental closure cost, then candidate cost, then technology ID.
5. Walk the winning closure in topological prerequisite order, checking the threshold after each completed technology and stopping the closure immediately once the threshold is met.
6. Continue until `hasReachedEraThreshold` is true.
7. Assert `resolveCivilizationEra(completedTechIds)` reaches the expected contiguous era before continuing.

Non-advancement technologies enter the route only when they are prerequisites. Technologies outside the selected closure remain incomplete, and their buildings and yield effects remain unavailable. This keeps eligibility consistent with the duration model; the fixture must never grant content from technologies it did not spend research time completing.

If the candidate set cannot satisfy a threshold, a prerequisite is missing, a cycle is detected, or the canonical resolver disagrees with the derived transition, throw an error naming the era and offending technology IDs.

### Completion timing and era duration

Each newly selected technology is researched sequentially in topological route order. Its duration is:

```ts
Math.ceil(tech.cost / getResearchOutputProfileForTech(tech).outputPerTurn)
```

The completion turn is the cumulative end turn of that technology. The era duration is the sum of the selected technologies' ETAs required to reach the next personal era. This derives the production timeline from the same catalog costs and authoritative research profiles used by the pacing audit.

Technology completion applies at the start of its completion turn for fixture purposes. Its building unlocks and yield effects may affect city processing on that turn. This ordering is fixed and covered by a boundary test.

## Empire cohorts and city maturity

The canonical cohorts are data, not branches:

| Cohort | Founded | Intended role |
|---|---:|---|
| `capital` | Era 1 | Oldest and most developed city |
| `expansion-1` | Era 3 | Early established city |
| `expansion-2` | Era 5 | Mid-game city |
| `expansion-3` | Era 7 | Developing later city |
| `frontier` | Era 9 | Young frontier city |

A cohort is founded on the first turn after the empire reaches its founding era. An output snapshot taken immediately on arrival at that era includes the newly founded city in its founding state but gives it no retroactive production.

Settler production is not charged again inside the infrastructure budget. The reserved non-infrastructure share explicitly represents settlers, units, wonders, national projects, repairs, queue interruptions, and idle production.

Each city starts from the existing neutral reference-map assumptions. Population uses the legacy fixture's deterministic infrastructure proxy:

```ts
Math.min(12, 2 + Math.floor(completedBuildingCount / 4))
```

Worked tiles are rebuilt deterministically when population changes. City maturity is always resolved through `resolveCityMaturity(population, completedTechIds)`; it is never assigned from the cohort label. Later-founded cities receive fewer production turns and therefore naturally remain less mature.

Tests pin the cohort count at every founding boundary and the expected mixed-maturity composition at representative later eras. They must not require every city to occupy a different maturity tier.

## Production-time-bounded construction

### Local production per turn

Every active city is processed once per global research-timeline turn:

1. Construct its current city snapshot, population, worked tiles, buildings, and completed technology set.
2. Call the real `calculateCityYields` pipeline.
3. Apply empire technology percentage modifiers to the city result.
4. Do not add empire-flat yields to a local city queue.
5. Cap local production at `getProductionOutputProfileForEra(currentPersonalEra)` so a fixture city cannot exceed the authored production anchor.
6. Multiply the capped production by the selected infrastructure share.
7. Apply the resulting fractional production to the active building. If it completes, select the next candidate and spend any same-turn overflow; continue until the allocation is exhausted or no candidate remains.

Using actual city production below the authored cap makes frontier cities genuinely weaker than mature capitals without inventing maturity multipliers. The cap preserves issue #493's requirement that cumulative capacity be grounded in `PRODUCTION_OUTPUT_BY_ERA`/the authored production profile.

Neutral reference-map production must be positive. A non-positive value or missing authored era profile is an error rather than an infinite or silently skipped build.

### Budget accounting

Each city records uncapped actual production, capped production, infrastructure production allocated, completed-building cost, discarded obsolete progress, unspent infrastructure production, and active partial progress. The accounting invariant is an equality within epsilon:

```text
completed cost + active progress + discarded obsolete progress
  + unspent infrastructure production
  == cumulative infrastructure production allocated
```

`infrastructureProductionSpent` equals completed cost plus active progress plus discarded obsolete progress. Floating-point comparisons use a small explicit epsilon. Production cannot be banked for a not-yet-unlocked building. When no candidate exists, the current turn's remaining allocation is recorded as unspent. A city always advances its current building until completion, obsolescence, or the end of the timeline, and it ends a turn with at most one partial building.

### Infrastructure shares

- 50%: infrastructure-light sensitivity case.
- 60%: canonical representative snapshot.
- 70%: infrastructure-heavy sensitivity case.

The remaining share is deliberately unmodeled production work. Difficulty modes do not change these percentages because Explorer, Standard, and Veteran change decision quality and pressure rather than the local production income of an identical city.

## Building eligibility and balanced selection

### Candidate boundary

The representative candidate set contains catalog buildings that are:

- unlocked by the route's currently completed technologies;
- ordinary, non-national-project, non-`uniquePerEmpire` buildings;
- not coastal-only;
- not resource-gated;
- not already completed in that city;
- not obsolete under a completed `obsoletedByTech` technology;
- reachable through a valid `requiresBuildings` closure.

Trade routes, legendary wonders, national projects, resources, civilization bonuses, and special map conditions remain outside the neutral fixture. Their exclusion is documented because adding invented counts would make the diagnostic less trustworthy.

If a completed building later becomes obsolete, it remains in the historical city building set and follows the real yield pipeline's behavior. If the active incomplete building becomes obsolete, cancel it, record its progress as discarded, and select again. Do not transfer that progress to another item.

### Scoring

The fixture owns stable economic weights:

```text
food       1.00
production 1.25
gold       1.50
science    1.25
happiness  1.50
```

For each reachable terminal building, form its missing prerequisite closure. Score the closure as total weighted direct value divided by total missing production cost. This lets a low-yield prerequisite inherit the value of the building it unlocks without hard-coding building IDs.

Selection uses two phases:

1. **Coverage phase:** if the city lacks a building category for which a positive-value reachable closure exists, select the most efficient missing category. Category ties use the stable order `food`, `production`, `science`, `economy`, `culture`, `military`, `espionage`. A building with no category skips coverage ranking but remains eligible for the efficiency phase.
2. **Efficiency phase:** after useful available categories are represented, select the highest closure efficiency globally.

Within either phase, ties resolve by lower total closure cost and then terminal building ID. Build the first missing prerequisite in topological order. Buildings and closures with zero weighted value are left to the reserved non-infrastructure share rather than forced into the economic reference model.

The fixture does not import `economyValue`, `generateAIProductionCandidates`, personalities, military demand, maintenance reserves, or difficulty-specific suboptimal-choice logic. Computer players still benefit from the diagnostic because both systems consume the same building catalog, prerequisites, costs, and yields. A generic test proves every eligible positive-value ordinary building can enter a candidate closure.

## Yield aggregation

At the requested personal-era arrival snapshot:

1. Calculate every city's base yield with its completed buildings and the route's completed technologies.
2. Apply empire technology percentage modifiers to each city independently.
3. Sum city science and production without intermediate rounding.
4. Add `getEmpireFlatTechYields(completedTechIds)` exactly once to the empire total.
5. Round final empire totals with `Math.round`, matching the legacy output contract.
6. Compute `averagePerCity` from the unrounded total divided by city count and round it to two decimals with `Number(value.toFixed(2))`.
7. Round per-city diagnostic values to two decimals only after empire aggregation has consumed their unrounded values.

Per-city diagnostic outputs remain pre-empire-flat so the flat bonus is never presented as though every city earned it. Tests prove totals, averages, and scope independently.

The representative output excludes city-to-city route bonuses and other geometry-dependent empire effects. The fixture reuses a neutral map for isolated city calculation; it does not pretend the cities occupy a real shared map.

## Player, mode, and platform impact

### Gameplay, fun, ages, and play styles

No new mechanic or player-facing rule is introduced. The value is indirect: balance changes gain a more realistic signal before research becomes automatic for wide/infrastructure-heavy empires or excessively slow for lighter builders.

The three views and 50/60/70 sensitivity cases acknowledge different play styles without declaring one mandatory. Younger, relaxed, experienced, competitive, tall, wide, and completionist players receive no new cognitive burden, controls, or terminology.

### Difficulty and AI

The fixture has no difficulty branch. It describes economic capacity, not how often Explorer AI makes a suboptimal choice or Veteran AI chooses the best candidate. AI runtime code does not read the fixture, so the model cannot create hidden AI bonuses or behavior changes.

### UI, UX, SFX, solo, and hot seat

No panel, tooltip, setting, notification, animation, music transition, or sound effect is added. No `currentPlayer` or viewer-scoped data enters the model. Solo and hot-seat execution paths are unchanged; full-suite verification is the appropriate regression coverage rather than artificial runtime tests for a helper that runtime never imports.

### Saves

No `GameState` field, schema, serializer, save version, or migration changes. The new helpers must remain test-only and must not be imported by `src/**`.

## Error handling and determinism

The representative fixture throws actionable errors for:

- unsupported or non-integer requested eras;
- infrastructure shares other than 0.5, 0.6, or 0.7;
- missing authored pacing profiles;
- empty or unsatisfiable advancement sets;
- missing technology or building prerequisites;
- prerequisite cycles;
- canonical resolver disagreement;
- non-positive research or neutral city production;
- negative, non-finite, or over-spent production accounting;
- applying empire-flat yields more than once.

All ordering uses explicit numeric keys and ID tie-breakers. The model uses no RNG, current date, object insertion order, locale-dependent sorting, or map-generation seed.

## Test contract

### `tests/systems/pacing-production-budget.test.ts`

- Route closure includes all prerequisites and excludes unrelated technologies.
- Threshold boundary uses the canonical rounded-up advancement fraction.
- The route reaches each requested era contiguously under `resolveCivilizationEra`.
- Candidate selection is deterministic when costs tie.
- Completion turns and era durations equal the sum of pacing-profile ETAs.
- A technology unlock is unavailable one turn before completion and available on its documented completion turn.
- Cohort counts change exactly on eras 1, 3, 5, 7, and 9; no cohort receives pre-founding production.
- Frontier production is lower than or equal to the authored cap and does not inherit capital history.
- Completed cost, partial progress, discarded obsolete progress, and unspent allocation reconcile exactly to cumulative allocated production within epsilon.
- Same-turn overflow completes additional affordable buildings without creating more than one partial building; lack of a candidate records the overflow as unspent.
- Only one active partial building exists per city.
- Prerequisites complete before their dependents.
- Useful category coverage occurs before second buildings in already-covered categories.
- Zero-value, coastal, resource-gated, national-project, unique, and obsolete candidates remain excluded.
- Every eligible positive-value ordinary catalog building can enter a candidate closure.
- Repeated runs return byte-for-byte equivalent diagnostic data.
- Invalid eras, shares, cycles, and missing prerequisites fail with contextual messages.

### `tests/systems/pacing-reference-economy.test.ts`

- Existing exact `bounded` and `maximal` science snapshots remain unchanged.
- Existing `maximal >= bounded` and growth-ratio guardrails remain unchanged.
- Era 10-13 research profiles remain tightly derived from `maximal`, never `representative`.
- The 60% representative total and average science/production values are pinned for every authored era.
- Per-city outputs sum to the empire total after adding the empire-flat yield once.
- Percentage modifiers apply per city; flat modifiers apply once per empire.
- Average is derived from the unrounded empire total and follows the documented two-decimal rounding rule rather than dividing the rounded total.
- Representative completed technologies resolve to the requested personal era, while legacy profiles retain the strictly-prior-era tech convention.
- Representative later-era snapshots contain the expected cohort IDs and a documented mixed-maturity composition.
- For identical era/cohort inputs, 50%, 60%, and 70% allocated infrastructure production are ordered and remain within their budgets.
- Sensitivity checks assert relationships and invariants; only the canonical 60% case receives exact output pins.

### Pacing and repository regressions

Run, in order:

1. `./scripts/run-with-mise.sh yarn test --run tests/systems/pacing-production-budget.test.ts tests/systems/pacing-reference-economy.test.ts`
2. `./scripts/run-with-mise.sh yarn test --run tests/systems/pacing-model.test.ts tests/systems/pacing-audit.test.ts`
3. `./scripts/run-with-mise.sh yarn build`
4. `./scripts/run-with-mise.sh yarn test`

The full-catalog outlier gate must remain empty. Because the authoritative `maximal` target does not change, no technology-cost retune is expected. If a pacing constant or `src/**` file appears necessary, stop and request scope approval rather than updating snapshots or costs opportunistically.

## Documentation changes

Update `.claude/rules/game-balance.md` so Pacing Regression Prevention describes all three views and states:

- `bounded` and `maximal` retain the legacy single-city arrival convention;
- `representative` follows the live personal-era resolver and is production-budgeted across mixed-age cities;
- representative totals and averages are diagnostic only;
- `maximal` remains the era 10-13 target;
- changes to route selection, cohort data, infrastructure shares, scoring weights, or aggregation scope require explicit snapshot justification and the full-catalog outlier gate.

## Delivery boundary and acceptance

This is one cohesive tooling MR. It may change only:

- `tests/systems/helpers/pacing-reference-economy.ts`;
- new `tests/systems/helpers/pacing-production-budget.ts`;
- `tests/systems/pacing-reference-economy.test.ts`;
- new `tests/systems/pacing-production-budget.test.ts`;
- `.claude/rules/game-balance.md`;
- the approved design and implementation-plan documents.

The issue is complete when:

- a multi-city aggregate fixture reports documented total, average, and per-city results;
- mixed maturity follows the documented 1/3/5/7/9 cohort method;
- production-time-bounded accumulation uses real costs, live yield production below the authored cap, and a 60% infrastructure allocation with 50/70 sensitivity checks;
- research eligibility and duration use one consistent prerequisite-closed live-era route;
- `bounded`, `maximal`, and the maximal research target remain unchanged;
- all targeted, build, and full-suite verification passes;
- the final committed and uncommitted diffs contain no unapproved runtime changes.

Out of scope: retuning technology costs, changing advancement fractions, changing difficulty profiles, adding telemetry, importing AI behavior, simulating military/wonder/settler queues in detail, adding UI diagnostics, changing sound, or migrating saves.
