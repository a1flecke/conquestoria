# AI Viability → Sanity → Scalability Arc — Design

Issues: **#1064** (AI never expands / builds no units) → **#1066** (late-era unit-count
runaway) → **#1069** (AI-round work is super-linear in unit count).

Baseline: `origin/main` @ `71fc0993`.

Strict sequencing: **make the AI play credibly → make sure late-game AI stays sane →
make the credible AI scale.** #1066 and #1069 are evaluated *against post-#1064
behaviour*, because #1064 currently distorts both the long-horizon workload and the
late-game state shape. One issue per MR.

---

## 1. #1064 — exact current root cause

### 1.1 Two structural gaps, not one

**Gap A — a settler is structurally unbuildable.**

`generateWithResidual` (`src/ai/ai-production.ts:523`) drops every trainable-unit
candidate that matches no `AIForceDemand`:

```ts
const fulfilled = matchingDemand(roles, demands);
if (!fulfilled) continue;
```

`AIForceDemand`s have exactly two sources, both in
`prepareMajorCivStrategicPlan` (`src/ai/ai-prepared-turn.ts:450`):

1. `assignUnitsToPortfolio(...).forceDemands` — derived **only** from
   `plan.requiredRoles` of the plans in the portfolio
   (`src/ai/ai-unit-assignment.ts:246`).
2. `mergePreparedForceDemands`'s additional seeds — `choice.demands`
   (`objective-readiness`), the domination counterplay demand,
   `defense-overflow:<cityId>`, `observedArmorDemand`, `observedAirDefenseDemand`.

Every `requiredRoles` literal in the tree is military or expeditionary:
`{ frontline: 1, capture: 1 }` and `{ 'resource-expedition': 1 }`
(`ai-prepared-turn.ts:324,350`), `{ frontline: 1, ranged: 1 }`
(`ai-plan-portfolio.ts:208`), `{ frontline | naval-combat: 1 }`
(`ai-prepared-turn.ts:497`), plus `{ frontline: 1 }` in `barbarian-system.ts:270`
and `minor-civ-system.ts:276`. **No code path anywhere emits `settlement` or
`worker`.** Verified by `grep -rn "settlement" src`.

Consequently dead: `weightProductionRoles`'s `settlement` term
(`ai-personality.ts:75`, `expansionDrive * 24`) and `chooseProduction`'s
`settler && cityCount >= 4` de-prioritisation (`ai-strategy.ts:37`) — the latter
is reachable only from `chooseLegendaryWonderFallback`, which passes
`availableBuildings` and never a unit. `evaluateExpansionTarget`
(`ai-strategy.ts:50`) has **no production caller at all**.

A secondary amplifier: `choosePrimaryObjective`'s `missingRoles`
(`ai-objective-scoring.ts:199`) makes a candidate `baseEligible` only when the civ
**already owns** every required role. That is a catch-22 — you need the unit to get
the plan, and the plan to get the demand to build the unit. It is only *partially*
mitigated, by design: `choice.demands` collects those missing roles from **every**
analysed candidate regardless of eligibility, and they are merged back as
`objective-readiness` seeds at priority 90. That bootstrap is the mechanism this
design leans on (§2.2).

**Gap B — even a produced settler can never found a city.**

- `MIN_CITY_CENTER_DISTANCE` is `4` (`city-territory-system.ts:5`), so a settler
  trained in a city fails `canFoundCityAt` where it spawns.
- `processAIResettlement` (`ai-resettlement.ts:53`) — the only code that *moves* an
  AI settler — returns immediately unless
  `getCivilizationLiveness(state, civId).reason === 'settler'`, i.e. only for a
  **cityless** civ.
- The administrative settlement block in `basic-ai.ts:631` only calls
  `foundCityInState` where the settler already stands.
- `rankCivilianAndTransportActions` (`ai-tactics.ts:751`) offers `found-city`
  **only** at the settler's current tile and otherwise returns `[]`; and a settler
  never reaches tactics at all, because no plan declares `settlement`, so it is
  never in `assignedUnitIds`.

**Fixing A without B converts `expansion-frozen` into a settler pile** — a fresh
`unit-count-runaway`, which is the #1066 symptom. Both halves land in MR1.

### 1.2 Evidence, re-derived (not taken from the issue)

- `KNOWN_CAMPAIGN_GAPS` registers `expansion-frozen`, `gold-hoard` and
  `production-idle` against #1064 with `scenarios: 'any'` — i.e. reproducing on
  every scenario, every tier, every map size, solo and hot seat.
- The register is a **two-way ratchet** (`campaign-matrix.test.ts`): a fixed gap
  whose entry is not deleted fails the run.

### 1.3 A third structural gap, found during implementation: passive knowledge can never reach a legal site

Implementing §2 below (candidate generation, the demand fix, settler movement) and
then proving it end-to-end through the real round pipeline (`runCompletedRound`,
not an isolated unit test) surfaced a gap the original design did not anticipate,
and which the original design's own unit tests could not have caught because none
of them exercised more than a handful of hand-built rounds.

**The proximate bug, found first and already fixed on its own merits:**
`expandCandidates()`'s `knownCityPositions` was built only from
`perception.knownCities` — which is populated **only from other civs' cities the
actor has observed** (`ai-perception.ts`'s `rememberedCities` / `contacted` loop).
The actor's own city lives separately in `perception.ownCities`, and was never
added to the exclusion set. A belief-layer site one tile from the civ's own capital
could therefore win as "best" (nothing else competes inside a fresh city's tiny
known bubble), which is always illegal under `MIN_CITY_CENTER_DISTANCE`. Because
scoring never re-checks legality, the *same* illegal site regenerated as "best"
every round, permanently freezing the assigned settler: `found-city` was refused at
the illegal site, and a move toward it — already the settler's own position — is a
zero-length path, so no legal action existed at all. Fixed by including
`perception.ownCities` in the exclusion set.

**Fixing that bug was necessary but not sufficient.** Re-running the actual
acceptance scenario afterward —

```
yarn test:ai-long -- -t lh-standard-small
```

— produced, unchanged, from `.verification/ai-long-horizon/lh-standard-small.json`
after 300 rounds:

```
ai-1: expansion-frozen  — city count never rose above 1 across 300 living rounds
ai-2: expansion-frozen  — city count never rose above 1 across 300 living rounds
ai-1: gold-hoard        — gold never fell across 155 rounds, rose by 2724
ai-2: gold-hoard        — gold never fell across 114 rounds, rose by 1391
ai-1: production-idle   — every city idle for 66 consecutive rounds
ai-2: production-idle   — every city idle for 116 consecutive rounds
```

All three of #1064's target findings still fired. A minimal isolated debug trace
(one civ, no war, no contact) showed why: `visibleTiles` sat at **exactly 19** —
the tile count of a fixed radius-2 bubble — for the entire length of a 300-round
run. Neither the settler nor the warrior ever moved, because nothing ever gave
either of them a reason to.

**The gap is mathematically permanent, not merely slow, and it is a property of
the vision system, not of any one civ's luck:**

| Passive knowledge source | Radius | Code |
|---|---:|---|
| City vision | **2**, fixed, never grows with population, culture, or turns | `updateVisibility` in `fog-of-war.ts`: `getVisibilityRange(cityPos, 2, map)` |
| Territory (culture-matured city, the maximum attainable) | **3** | `getCulturalTerritoryRadius`, `city-territory-system.ts` — caps at 3 regardless of population/maturity/culture buildings |
| A unit's own vision, stationary | 2 (warrior) or 3 (scout) | `unit-definitions.ts` `visionRange` |
| `MIN_CITY_CENTER_DISTANCE` | **4** | `city-territory-system.ts:5` |

Every passive source tops out at 2 or 3. The legal floor is 4. **No amount of
population growth, culture, or turns passing can ever close that one-tile gap on
its own** — a tile at hex-distance exactly 4 sits one step past even a stationary
scout's own sight radius. Only actual unit *movement* reveals it.

**No such movement exists for an AI-controlled unit today.** Confirmed by
inspection, not inference: `chooseAutoExploreMove` / `applyAutoExploreOrder`
(`auto-explore-system.ts`) implement exploration, but they are wired only to the
**player-facing** `unit.automation.mode === 'auto-explore'` toggle
(`selection-controller.ts`, `turn-manager.ts`). `basic-ai.ts` never sets that field
and never calls either function. Separately, the entire tactical-dispatch system
(`ai-major-turn.ts`'s executor loop) is **plan-scoped**: it iterates over the
civ's active plans and only ever touches units in a plan's `assignedUnitIds`. A
unit that no plan currently wants — the common case for a peaceful, unthreatened
civ's starting warrior — receives **no dispatch call of any kind**, every round,
forever.

**This is not new to #1064.** The vision system, the plan-scoped executor, and the
missing AI wiring for auto-explore all predate this arc. What #1064 changes is
that expansion is now the *first* AI behaviour whose success depends on this gap
being closed — every prior AI behaviour (defense, capture, secure-resource,
diplomacy) only activates once a target is *already* known by some other route
(a visible threat, a tech-revealed resource, a met civilization), so none of them
were ever blocked by it, and nothing forced anyone to notice it before.

**A related symptom, worth naming but not solving here:** civ-to-civ contact
(`hasMetCivilizationByCurrentEvidence`, `discovery-system.ts`) requires the same
kind of visibility overlap — seeing the other civ's city, owned tile, or unit — or
a pre-existing war/treaty (which itself requires prior contact). Two peaceful,
geographically separated AI civs that never explore may never meet at all for an
entire campaign. This is the *same* root gap manifesting in diplomacy rather than
expansion. Fixing exploration plausibly improves contact rates as a side effect;
this design does not claim or test that explicitly, and no diplomacy behaviour
changes as a result — it is named here only because "look for similar causes" is
exactly what surfaced it, and a future session tracing a contact/diplomacy report
should not have to rediscover this.

**Chosen fix, and why this shape:** reuse the existing, tested, player-facing
auto-explore mechanism from a new *administrative* loop in `basic-ai.ts` — the
same seam already used for workers (`#526`), settler founding, and missionary
dispatch, each with the identical justification already written in that file:
*"no `AIStrategicPlan` [...] role covers this... administrative for the same
reason as the [...] loop[s] above."* This is not a new design decision so much as
applying an established, working pattern to the one unit category (idle
combat-capable units) it had not yet been applied to. See §2.6.

---

## 2. Chosen behaviour contract

### 2.1 Shape decision: a real `expand` plan objective

The plan objective route was chosen over an administrative settler loop. Tracing it
showed the type surface **already anticipates it** — nothing new enters the type
system:

| Piece | Already exists |
|---|---|
| `AIStrategicObjective` `'expand'` | `core/types.ts:1920`; used today by `executionPlan` (`ai-major-turn.ts:795`) as a rally-movement rewrite |
| `AITarget` `{ kind: 'region'; id; anchor }` | `core/types.ts:1959` |
| `settlement` in role assignment order | `ai-unit-assignment.ts:64` |
| `found-city` tactical action + executor | `ai-tactics.ts:95`, `ai-major-turn.ts:472` |
| `region` handled in `targetStillValid`, `hasSufficientTargetConfidence` | `ai-major-turn.ts:611,678` |
| `region` accepted by the fixture's `targetWasPerceived` | `ai-playability-fixture.ts:205` |
| `expand` is **not** in `OFFENSIVE_OBJECTIVES` | `ai-objective-scoring.ts:62` — so `exactTargetKnown` is true for a region target, and `preparingOffense` is false, so a settle plan dispatches in every phase |

So the core change is **one missing candidate generator**, not a planner rewrite.
This satisfies #1064's stated non-goal ("not a rework of the strategic planner or
the `AIForceDemand` model beyond what is needed to let expansion happen").

### 2.2 The bootstrap, end to end

```
turn N   : expandCandidates() emits an `expand` candidate, requiredRoles {settlement:1}
           civ owns 0 settlers  -> missingRoles -> baseEligible=false -> NOT a plan
           but choice.demands gains 'settlement'
           -> mergePreparedForceDemands seeds {role:'settlement', priority:90}
           -> generateWithResidual: matchingDemand() now returns for 'settler'
           -> applyAIProduction enqueues a settler in an idle city
turn N+k : settler completes; availableRoleCounts has settlement:1
           -> the expand candidate is baseEligible
           -> selectPrimaryPlan may adopt it as primaryPlan
           -> assignUnitsToPortfolio fills the settlement slot with the settler
           -> processMajorCivStrategicTurn dispatches it tactically
           -> rankCivilianAndTransportActions moves it toward the region anchor
           -> on arrival, `found-city`
```

`ai-production.ts` is **not modified** for the expansion path. The settler becomes
buildable because it legitimately matches a demand — the existing contract, not a
bypass.

Workers follow the same contract through a different entry point: they need no
candidate (no objective requires one), so they get one explicit incremental seed
(§2.6, §2.13). Both roles reach `generateWithResidual` as ordinary demand matches; both
are maintenance-free, so both pass `reserveAllows` at normal strain and are correctly
refused at `high`/`critical` strain.

### 2.3 Belief vs legality — the two-layer rule

Two different questions must not be conflated:

| Layer | Question | Owner |
|---|---|---|
| **Legality** | "Is founding here actually legal?" | `getCityFoundingBlockers` / `canFoundCityAt` (`city-territory-system.ts:495,521`) — reads the real, omniscient city list |
| **Belief** | "As far as this civ knows, is founding here legal?" | the new `ai-expansion-sites.ts` — reads only fog-bounded knowledge |

The AI **plans on belief** and the **executor validates legality**. This is the exact
precedent `processAIResettlement` already documents ("canonical founding, unloading,
and movement helpers still validate the real state when the action executes") and it is
already enforced twice on the settle path: `rankCivilianAndTransportActions` gates
`found-city` on `canFoundCityAt(context.state, …)`, and `foundCityInState` throws on an
illegal found, which `executeAction` catches into `succeeded: false`
(`ai-major-turn.ts:472`). A belief that turns out wrong costs a wasted walk, never an
illegal city.

**The belief layer must differ from the real rule in exactly one dimension — which
cities it knows about — and in no other.** Achieving that by re-implementing the rule
would guarantee drift, so it is achieved by sharing code:

- `MIN_CITY_CENTER_DISTANCE` and `cityDistance(a, b, map)` (wrap-aware, already
  exported, `city-territory-system.ts:5,74`) are **imported**, never re-derived. A
  hand-written `hexDistance` here would silently break on a wrapping map.
- `canonicalizeCityCoord` (`city-territory-system.ts:70`) is applied exactly as
  `getCityFoundingBlockers` applies it.
- The "legal city-centre terrain" predicate is **extracted** into a new pure export
  `isCityCenterTerrain(terrain: TerrainType): boolean` in `city-territory-system.ts`,
  and the existing private `isValidCityCenterTerrain` is rewritten to call it.

That last point is not tidiness. The predicate `terrain !== 'ocean' && terrain !==
'coast' && terrain !== 'mountain'` was duplicated in five places before Task 0 of the
implementation ran: `city-territory-system.ts`'s own private
`isValidCityCenterTerrain`, `ai-resettlement.ts`, `barbarian-system.ts:222`, and
`rogue-elephant-host-system.ts:81,158`. A sixth copy in the new module would have been
a guaranteed drift point the first time a terrain type is added. Task 0 collapsed the
two that genuinely mean *"a city centre may stand here"* — the private copy in
`city-territory-system.ts` and the one in `ai-resettlement.ts` — onto the new export
(now live at `city-territory-system.ts:483`) and left the barbarian/elephant copies
alone, since those mean *"a land actor may spawn here"*, a different concept that
merely coincides today.

### 2.4 Expansion rules

Site selection is **fog-bounded**. Candidate sites are drawn from
`buildKnownPathMap(state, civId)` (`ai-prepared-turn.ts:220`) — visible tiles plus
`isTrustedObservedLastSeenTile` snapshots — the same map the objective travel resolver
already uses. Known cities come from `perception.knownCities` **and**
`perception.ownCities`, never `state.cities` (the omniscient list). Both are required:
`perception.knownCities` is built only from *other* civs' cities the actor has
observed — the actor's own city lives separately in `perception.ownCities`, and a
first implementation that forgot it let a site win one tile from the civ's own
capital, always illegal and permanently fatal to the assigned settler (§1.3).

A site qualifies when:

- `isCityCenterTerrain(tile.terrain)` (§2.3);
- no **known** city centre — the civ's own or another civ's — lies within
  `MIN_CITY_CENTER_DISTANCE`, measured with `cityDistance`;
- it lies within `EXPANSION_SEARCH_RADIUS` of an operational anchor; and
- the civ is below its expansion soft cap (below).

**The search radius is a cost bound, not a flavour knob.** Without it, enumeration is
`O(known tiles × known cities)` per civ per round — on a large late-game map that is a
new super-linear cost introduced by the very arc that exists to remove super-linear
cost. Bounded to a radius around each anchor, the work is `O(anchors × radius²)` with a
small constant. `EXPANSION_SEARCH_RADIUS = 8` — a settler moves 2/turn, so this is
roughly a four-turn walk, and it is measured in MR3 like everything else.

Scoring reuses the currently-unused `evaluateExpansionTarget` (`ai-strategy.ts:50`) over
the site's known neighbourhood, fed into `AIObjectiveCandidate.strategicValue`, with the
existing `scoreObjectiveCandidate` distance/supply penalties doing the rest. Ties break
on `hexKey` ascending. Deliberately **not** in scope: resource, river, coastal or
strategic-chokepoint weighting. Terrain-count scoring is a credible first opponent, and
gold-plating it here would make the diff unreviewable. A follow-up issue owns richer
site valuation.

**Bounded by two independent limits, neither of which is the candidate cap.**

1. *Width* — no expand candidate is produced once
   `ownCityCount >= EXPANSION_CITY_SOFT_CAP_BASE + Math.round(expansionDrive * 4)`.
   With `EXPANSION_CITY_SOFT_CAP_BASE = 2` and `expansionDrive` in `[0, 1]`, that is a
   2-to-6 city soft cap. This is the **only** place `expansionDrive` gates *whether*
   the AI expands; everywhere else it only weights *how much*. It caps new *settling*,
   not empire size — conquest is unaffected.
2. *Rate* — the `settlement` demand is incremental (§2.6), so `missing` is never more
   than 1. `applyAIProduction` additionally decrements `residual` after each
   enqueue, so **at most one settler is queued per empire per round** even when several
   cities are idle — verified in code, not assumed
   (`ai-production.ts:786`: `fulfilled.missing = Math.max(0, fulfilled.missing - 1)`).

Economic safety needs no new gate: `reserveAllows` (`ai-production.ts:263`) already
rejects a zero-`economyScore` unit candidate outright at `high` or `critical` strain,
and settlers and workers are in `freeUnitTypes` (`economy-system.ts:47`) so they add no
maintenance. A strained civ therefore stops expanding on its own, and a gold-hoarding
civ (`strainLevel: 'none'`) does not.

### 2.5 Idle-unit exploration — closing the discovery gap

§1.3 proved this is mandatory, not optional: no passive knowledge source ever
reaches `MIN_CITY_CENTER_DISTANCE`, so without active exploration the expand
candidate generator in §2.4 has nothing to find, for the entire game, for any
civ that starts at peace with no immediately visible rival.

**Shape decision: an administrative loop in `basic-ai.ts`, not a new production
role, not a new plan objective.** Three shapes were considered:

1. **A new `recon` production demand** (a scout, built like the settler/worker
   demands in §2.6). Rejected as insufficient on its own: `'recon'` already has an
   existing readiness path (`ai-objective-scoring.ts:221`,
   `if (!exactTargetKnown) demands.add('recon')`), and it does not fire for a
   peaceful civ with no offensive-region candidate — building a scout would not by
   itself make anything explore. It would also need its own new tactical dispatch
   to actually move the scout, duplicating work the next option gets for free.
2. **A new plan objective** (`'explore'`), matching #1064's own `expand` shape.
   Rejected: exploration has no target, no completion condition, and no
   `requiredRoles` — forcing it into the plan/objective/candidate machinery
   (`AITarget`, `AIObjectiveCandidate`, trace entries, the 12-candidate ceiling)
   would strain a data model built for *targeted* activity onto something
   fundamentally open-ended, for no benefit over option 3.
3. **An administrative loop, reusing the existing player-facing auto-explore
   mechanism.** Chosen. `basic-ai.ts` already has this *exact* pattern, for the
   *exact* same reason, three times over — its own comments say so verbatim:
   settler founding, catastrophe-restoration workers (`#526`), and worker
   road-building all run administratively because *"no `AIStrategicPlan` [...]
   role covers this... [it] never reaches `processMajorCivStrategicTurn`'s
   tactical dispatch."* Idle combat-capable units are the one remaining category
   that sentence was never applied to. And the mechanism to move them already
   exists, fully built and tested: `chooseAutoExploreMove` /
   `applyAutoExploreOrder` (`auto-explore-system.ts`) are the mechanism a human
   player uses to set a unit to auto-explore. They are gated only by
   `unit.automation.mode === 'auto-explore'` — nothing about them requires a
   human-controlled unit — and no other code branches specifically on that
   field's *origin*, only its value.

**What gets reused, verified line by line, not assumed:**

- Path/destination choice: `getMovementRange` (existing, tested) plus
  `rankCandidate`'s scoring — favours unexplored tiles, then frontier tiles,
  breaks ties deterministically (`(coord.r * 100) + coord.q`), penalises recently
  visited tiles so a unit does not thrash.
- Safety: `isThreatenedByVisibleHostiles` refuses a candidate destination
  outright; `canAutoExploreEnter` refuses a hostile-occupied tile. Neither is
  reimplemented — both are called exactly as the player's own flow calls them.
- Legality: the move still goes through the canonical
  `executeUnitMove` (`unit-movement-system.ts`), inside `applyAutoExploreOrder`.
  `actor: 'automation'` is grouped with `'ai'` in
  `unit-movement-validation.ts`'s `isPlayerControlledMove` check — both are
  already treated as non-player-controlled by that check, so nothing behaves
  differently for an AI-owned unit than it would for the existing "set a unit to
  auto-explore" player feature.
- Termination: `applyAutoExploreOrder` clears `unit.automation` itself once
  `chooseAutoExploreMove` returns null (nothing left worth exploring) — no new
  stop condition to invent or get wrong.
- Persistence: `automation` is an existing, already-optional `Unit` field
  (`core/types.ts:756`). Setting it on an AI unit adds no new persisted shape —
  **no `SAVE_VERSION` bump**.

**Eligibility — deliberately conservative, three exclusions beyond "combat-capable
and idle":**

A unit is offered to the loop only if `!unit.hasActed`, `movementPointsLeft > 0`,
and `UNIT_DEFINITIONS[unit.type].strength > 0` (excludes settlers, workers,
missionaries, expeditions — every civilian type already has its own dedicated
administrative or plan-driven dispatch elsewhere in this same file, and must never
be diverted into wandering). Even among combat-capable units, three further
exclusions are required, each found by re-deriving what "genuinely idle" means
against the real assignment output rather than assuming it:

1. **Claimed by any plan this round** —
   `preparedForTurn.assignments.assignmentsByPlanId` flattened to a set. Without
   this, a defense plan's own assigned defender could be sent exploring before
   the tactical executor ever runs, since the administrative loops in this file
   all execute *before* `processMajorCivStrategicTurn` — leaving a threatened
   city undefended by the civ's own hand.
2. **Retreating to heal** —
   `preparedForTurn.assignments.recoveryUnitIds`. This is a *different* field
   from the file's own local `recoveryUnitIds` (settler-elimination handling,
   declared earlier in the same function) — a naming collision to watch for, not
   reuse.
3. **Mid-upgrade-route** — `preparedForTurn.portfolio.upgradeRoutesByUnitId`, the
   same field `ai-prepared-turn.ts`'s own `activeOtherDuty` computation already
   checks for exactly this reason.

**Placement**: after every other administrative loop in `processAITurnInternal`
(settler founding, worker roads, pillage, missionary dispatch, transport
loading), immediately before `processMajorCivStrategicTurn`. This is the most
conservative ordering available — a unit is only offered to exploration once
every other administrative system in the file has had first refusal, and once
the round's plan assignments (computed earlier via `prepareMajorCivStrategicPlan`)
are already known, so exclusion 1 above can check against them directly.

**Difficulty and personality: invariant, matching the settler/worker precedent.**
No challenge-profile branch, no `expansionDrive` weighting. Base competence — "an
idle unit looks around" — is not a tuned behaviour in this codebase any more than
settler founding or worker road-building are; those are both personality- and
difficulty-invariant too, for the identical reason.

**Non-goal:** this is not a scouting *strategy*. It does not prioritise exploring
toward rivals, toward resources, or away from danger beyond the existing
`isThreatenedByVisibleHostiles` destination check. It does not build or demand a
dedicated scout. It is the minimum administrative wiring that makes §2.4's belief
layer *possible* to feed, nothing more — a richer exploration policy is a
follow-up, not this MR's job.

### 2.6 Demand accounting: the incremental-demand rule (required, not optional)

Before this fix, `choice.demands` seeds were merged with `desired: 1, assigned: 0`
**every turn**, unlike `observedArmorDemand` / `observedAirDefenseDemand`, which both
already passed a real `assigned`. `residualDemands` only discounts units **already
queued**, never units that **exist** — so a persistent readiness role would have produced
one unit per turn, forever, precisely #1064's "do not create arbitrary unit spam"
prohibition and precisely the #1066 signature. The fixed seed now lives at
`ai-prepared-turn.ts:688`, inside `incrementalDemandSeed`.

The fix is not a local patch to one call site. Three demand sources want the same
shape, and writing the arithmetic three times is how they would have drifted apart:

**The incremental-demand rule.** A demand that expresses *"I would like one more of R,
up to a cap"* is always built as:

```
desired  = min(owned + 1, cap)
assigned = owned
missing  = max(0, desired - assigned)   // therefore always 0 or 1
```

`missing` is structurally in `{0, 1}` — a standing force can never be requested in one
round, and a demand can never outrun the units that satisfy it. One helper in
`ai-prepared-turn.ts` builds these seeds; every incremental demand goes through it:

| Demand | `owned` | `cap` | Priority | Emitted by |
|---|---|---|---|---|
| `objective-readiness` (any role, incl. `settlement`) | `min(availableRoles[role] ?? 0, 1)` | `1` | 90 (existing) | `choice.demands`, unchanged path |
| `worker` | live worker count | `min(ownCityCount, WORKER_SOFT_CAP)` | 40 | new explicit seed (§2.13) |

`settlement` needs **no dedicated seed**: it rides the existing readiness path, because
the `expand` candidate declares `requiredRoles: { settlement: 1 }` and `missingRoles`
already reports it. That is the design working as intended rather than a special case
bolted on.

Readiness keeps `cap = 1` because its meaning is *"I own zero units of role R, so I
cannot even consider this objective"* — it is a bootstrap, not a force-size policy.
Force size stays owned by plan-derived demands, which already count `assigned` per plan
slot.

**Priority ordering is load-bearing and must be pinned by test.** `roleDemandScore =
missing * 40 + priority / 5`, multiplied by 4 in the unit score, so priority determines
what an idle city builds first:

| Source | Priority | `roleDemandScore` at `missing = 1` |
|---|---:|---:|
| elimination defense plan | 1000 | 240 |
| `defense-overflow:<cityId>` | 600 | 160 |
| defense plan | 500+ | 140+ |
| observed armor / air (visible) | 180 | 76 |
| objective-readiness (incl. `settlement`) | 90 | 58 |
| `worker` | 40 | 48 |

Defense outranks expansion; expansion outranks infrastructure. `WORKER_SOFT_CAP` exists
partly so `missing * 40` can never invert that ordering — with `missing` capped at 1 by
the incremental rule, it structurally cannot.

**This is the highest-regression-risk edit in the arc.** It also damps standing
`frontline` / `capture` / `resource-expedition` readiness demands. Plan-derived demands
remain the primary military driver, but `tests/ai/ai-prepared-turn.test.ts`, the
Domination AI tests and `tests/simulation/ai-playability.test.ts` must be re-run
deliberately and **read**, not merely observed to pass. If military output measurably
drops, that is a finding to investigate — not a number to accept. The fallback, if the
damping proves too aggressive, is to scope `cap = 1` to `settlement` and `worker` only
and leave combat readiness unbounded — but that knowingly leaves #1066's most likely
cause in place, so it is a decision to escalate, not to take quietly.

### 2.7 Plan-phase behaviour

`nextPlanPhase` (`ai-major-turn.ts:720`) gates `mobilizing → advancing` on
`hasCaptureOrFrontline(assignedUnitIds)`. A settler is neither, so a settle plan
would sit in `mobilizing` for its whole life.

Not fatal — `preparingOffense` is false for `expand`, so the settler is still
dispatched every turn — but it permanently distorts `plan-stuck` and
`maxNoProgressRounds`, which are exactly the long-horizon signals this arc is judged
on. The gate becomes objective-aware: a non-offensive plan advances on
`hasRequiredRoles` (which already exists, `ai-major-turn.ts:586`) or the mobilization
deadline, without the capture/frontline requirement.

A settle plan that keeps moving stays alive: a `move` action satisfies
`actionAdvancesPlan` (`ai-major-turn.ts:781`), so `lastProgressTurn` advances
(`ai-major-turn.ts:979`) and `currentPlanIsValid`'s stall check
(`ai-plan-portfolio.ts:146`) does not fire. `expiresAfterTurn` is `createdTurn + 12`;
a walk longer than that simply re-plans, which is correct.

### 2.8 Settler tactics

`rankCivilianAndTransportActions` gains a move branch: when a settler cannot found
where it stands, step one tile along `findPath(unit.position, targetPosition(plan), …)`
and emit a `move` action ranked just below `found-city`. Founding on arrival is the
existing `found-city` branch. No new action kind, no new executor.

**Plan stability while walking.** The expand candidate is re-derived every round, so two
near-equal sites could in principle swap rank and make the settler oscillate. Three
existing mechanisms already prevent that, and the design relies on them rather than
adding a fourth:

1. `selectPrimaryPlan`'s `switchingBonus = 10 + 20 × commitment` (`ai-plan-portfolio.ts:168`)
   — the incumbent plan must be beaten by a real margin, not a rounding difference.
2. The `hexKey`-ascending tie-break makes equal scores a total, stable order.
3. Anchors are the civ's own **cities**, not its units, so a walking settler does not
   move the scoring frame under itself.

A regression pins this directly: a settle plan is not abandoned for a marginally better
site while its settler is en route.

**Self-healing when the site goes bad.** If someone founds nearby, the site stops
qualifying, so no matching candidate is produced, `planMatchesCandidate` finds nothing,
`currentPlanIsValid(current, undefined, turn)` is false (`ai-plan-portfolio.ts:143`) and
the portfolio re-plans on the spot. Note that `targetStillValid` alone would **not**
catch this — for a `region` target it only checks that the tile exists
(`ai-major-turn.ts:611`) — so the candidate-driven path is the one doing the work here.

### 2.9 The 12-candidate trace ceiling — a structural bound, not a hope

`assertLegalChoices` throws at `trace.candidates.length > 12`
(`ai-playability-fixture.ts:266`). The trace carries **every** analysed candidate, i.e.
the whole `objectiveCandidates()` result. `resolveObjectiveTravelCandidates` slices to 8
per objective and 24 overall (`ai-objective-scoring.ts:156,166`), so today's two classes
can reach 16 in principle; they stay under 12 in practice, which is the only reason the
ceiling holds. A third class emitting "the top 3 sites" would make the margin a matter
of luck, and "measure it on the matrix and hope" is not a design.

**`objectiveCandidates()` emits exactly one `expand` candidate — the best reachable
site — so the trace grows by at most 1, unconditionally.**

Mechanically: `getKnownExpansionSites` returns up to `EXPANSION_SITE_SHORTLIST` (3)
scored sites, all three go through the shared `resolveObjectiveTravelCandidates` call so
reachability is computed by the existing resolver rather than a second pathfinder, and
`objectiveCandidates()` then keeps only the best-scoring candidate with a finite
`travelTurns` before returning. The shortlist exists purely so an unreachable best site
falls back to a reachable second — it never reaches the trace.

One candidate is also the semantically correct number: a civ has one `primaryPlan` and,
by §2.4's rate bound, at most one settler. A shortlist of alternatives in the portfolio
would be state the AI cannot act on.

If **no** shortlisted site is reachable, no expand candidate is emitted and therefore no
`settlement` demand exists. That is correct: a civ that cannot reach anywhere to settle
should not build a settler.

### 2.10 Negative-score production selection

`applyAIProduction` takes `candidates[0]` regardless of sign. **This stays.** The
score is a *ranking*, not a *veto*: a one-city AI with low production legitimately has
all-negative candidates (every term is dominated by `- productionTurns * 1.5`), and
idling is strictly worse than the least-bad build — idling is the `production-idle`
finding this arc exists to remove. `reserveAllows` (`ai-production.ts:263`) is the
real affordability gate and already runs per candidate.

The actual defect in that function is different and is fixed: `idleCities.sort()`'s
comparator calls `generateWithResidual` **twice per comparison**, i.e.
`O(n log n)` full candidate generations per civ per round, each of which calls
`calculateProjectedCityYields`. Hoisting to a map computed once per city is
**provably order-identical** — the comparator already reads `state`, never
`nextState`. MR1 does this because MR1 adds a candidate class and would otherwise
multiply the cost; MR3 owns measuring it.

### 2.11 Challenge-profile behaviour

Explorer / Standard / Veteran **do not change core legality**. No challenge input
gates whether an expand candidate exists, whether a site is legal, whether a settler
is trainable, or what anything costs. Existing tuning is untouched:
`maxPrimaryForce` still caps assignment slots, `mobilizationRounds` still paces the
phase deadline, `retreatHealthPercent` still drives recovery. This follows the
established `.claude/rules/game-balance.md` difficulty split (tune scores and
timing, never legality).

### 2.12 Personality behaviour

`expansionDrive` shapes **how wide**, never **whether**. It enters through
`weightProductionRoles`'s existing `settlement` term (`expansionDrive * 24`), which
this design finally makes reachable, and through the expand candidate's
`strategicValue`. Personalities must not converge: `expansionist` and `trader` should
settle meaningfully more than `aggressive` and `diplomatic` over a campaign, and a
test pins the ordering rather than an absolute count.

### 2.13 Worker behaviour — in scope, and why the original deferral was wrong

The first draft of this design deferred workers to a follow-up. Reviewing the
acceptance criteria against the mechanism shows that deferral would have made MR1 fail
its own gate.

`production-idle` fires when **every** city of a living AI civ holds an empty queue for
12+ consecutive rounds, and `gold-hoard` when gold rises monotonically without spend.
Expansion alone does not clear either for a *developed* civ: once it reaches its
expansion soft cap and has built every available building, it has no demand of any kind,
and `applyAIProduction` finds no candidates — the identical idle state, reached later.
Shipping expansion alone would very likely leave both findings reproducing and the
ratchet red, with the cause misattributed to expansion.

Workers are the right resolution, and they are cheap here because they have **Gap A
only**:

- Gap A (unbuildable) — `worker`'s AI role is `['worker']`
  (`combat-role-definitions.ts:30`) and no demand emits it. Same root cause as settlers.
- Gap B (unusable) — **already solved.** `basic-ai.ts:700` runs a full administrative
  worker loop (road building, fortification, improvements) that predates this arc and is
  documented in-file as deliberately administrative.

So a bounded `worker` demand is one seed, with execution already working, and it is
**structurally safe by construction**: `assigned` is the live worker count, so unlike
the readiness bug it can never outrun its own supply. Under §2.6's incremental rule:

```
owned = live worker count
cap   = min(ownCityCount, WORKER_SOFT_CAP)     // WORKER_SOFT_CAP = 4
```

`missing` is 0 or 1; priority 40 keeps workers below expansion and far below defense.
Workers are maintenance-free (`freeUnitTypes`), so they cannot bankrupt a civ, and
`reserveAllows` still blocks them at `high`/`critical` strain.

This also makes the AI genuinely better rather than merely busier: improved tiles raise
yields, which is the economic basis the `gold-hoard` detector is really asking about.

**Still out of scope:** any change to worker *task selection*. The existing
administrative loop decides what workers do; MR1 only makes them exist.

### 2.14 Determinism

- No new randomness. No `Math.random()`, no new `createSimulationRng` stream — site
  selection is a pure function of known tiles with a total order (`hexKey` ascending).
- Iteration order over `Object.values(map.tiles)` is insertion order and already
  relied on elsewhere; every consumer re-sorts explicitly.
- `traces` ordering is unchanged: expand candidates enter the same `ranked` array
  through the same `candidateId` scheme.
- Contract clauses 1–4 of `.claude/rules/game-systems.md` all apply; clause 3
  (deterministic AI, in-process **and** across a save/reload boundary) is the binding one.

### 2.15 Save / reload continuity

**No `SAVE_VERSION` bump and no migration.** `AIStrategicPlan`, `AITarget` and
`MajorCivPlanPortfolio` are unchanged; `'expand'` and `kind: 'region'` are already
legal persisted values and already normalized (`core/opponent-ai-state.ts:24`,
`:124`). A pre-arc save simply has no expand plan and acquires one on its next
planning round.

Note that `#1065` (an unrelated open bug) makes `save/reload continuity` diverge on
`minorCivs.*.lastNotifiedStatusByCiv`; `isKnownSaveReloadDivergence` tolerates exactly
that path. This arc must not add a second tolerated path.

### 2.16 Hot seat

No behaviour may key off `state.currentPlayer`. Expansion is authoritative simulation:
it reads `civId`-scoped perception, `civId`-scoped visibility, and `civId`-scoped
portfolio state only. `lh-hotseat-medium` is in the acceptance matrix.

### 2.17 Viewer-information boundaries

The AI must not use hidden global facts to decide expansion. Enforced by construction:
sites come from `buildKnownPathMap`, which deletes every tile that is neither
`visible` nor a trusted `lastSeen` snapshot; known cities come from
`perception.knownCities`. A negative test proves an unexplored but objectively
excellent site is never targeted.

### 2.18 AI trace expectations

`decision: 'objective'` traces gain expand candidate ids of the form
`expand:region:settle:<q>,<r>`. Trace **shape** is unchanged. The ≤12 ceiling (§2.9)
is the binding constraint.

### 2.19 Long-horizon acceptance for #1064

- `expansion-frozen`, `gold-hoard`, `production-idle` stop reproducing across the
  matrix, and their three `KNOWN_CAMPAIGN_GAPS` entries are **deleted in the same PR**
  (the ratchet fails until they are).
- No detector is weakened and no threshold widened to get there.
- Any **new** finding the suite surfaces is either fixed or registered against a new
  follow-up issue — never hidden.

### 2.20 Residual idle — the named contingency

`production-idle` and `gold-hoard` are **symptoms with more than one sufficient cause**.
This design removes three of them (nothing to build because no unit demand exists;
nothing to build because the civ cannot *discover* a site to expand into, per §2.5's
fix; nothing to build because the civ cannot expand once a site is known) and adds
workers to remove a fourth (§2.13). It cannot prove in advance that none remains: a
civ at its expansion soft cap, at its worker cap, with every available building
constructed and no military demand, has nothing to produce and will idle — and a
sufficiently crowded map could in principle leave a civ with no legal site anywhere
within reach even after full exploration, though that is a materially different
failure (map crowding) from the one this arc found and fixed (no exploration at all).

That is a real possibility, not a hypothetical, and it is the single most likely way MR1
fails its own acceptance gate. The contingency is decided **now**, so it is not
improvised under pressure at the end of the MR:

- **Do not raise the expansion soft cap to paper over it.** Wider empires are a balance
  change dressed as a bug fix, and §2.4's cap is what keeps settlers from spamming.
- **Do not weaken `productionIdleRounds`** or any other detector threshold. That is
  explicitly forbidden by `.claude/rules/ai-simulation.md`.
- **Do** capture which civs idle, at what city count, in what era, with what remaining
  build options — the analysis artifact already carries enough to answer this.
- If the residual cause is "every building is built", the correct next step is a
  follow-up issue on late-game production sinks (wonders, national projects, a
  maintenance-bounded standing force), **registered as a known gap against that issue**,
  with the `production-idle` entry retained and re-pointed from #1064 to it — not
  deleted. The ratchet then stays honest: #1064's expansion claim is proven, and the
  remaining idle cause is tracked where it belongs.

Deleting a gap entry the evidence does not support is the one outcome this section
exists to prevent.

### 2.21 Module boundaries

| Module | Single responsibility | Depends on |
|---|---|---|
| `ai-expansion-sites.ts` *(new)* | Where, in this civ's belief, could a city stand and how good is it? | `GameMap`, `HexCoord`, and the shared founding predicates from `city-territory-system.ts`. **Never `GameState`.** |
| `ai-prepared-turn.ts` | Turn belief into objective candidates and force demands | the above, plus perception and the portfolio |
| `ai-unit-assignment.ts` | Match owned units to plan role slots | unchanged |
| `ai-tactics.ts` | Rank this unit's legal actions for this plan | unchanged shape |
| `ai-major-turn.ts` | Execute ranked actions and advance plan phase | unchanged shape |
| `city-territory-system.ts` | The canonical founding rule | gains one pure export, loses one private duplicate |

The `GameState` exclusion is the load-bearing one. A pure function over a
**pre-fog-bounded** map cannot leak hidden information even if a future author is
careless, because the omniscient state is not in scope to read. That is information
safety by construction rather than by review vigilance, and it is why site enumeration
is a separate module instead of another block inside `ai-prepared-turn.ts`.

`objectiveCandidates()` gains a third candidate class. Extracting the existing capture
and resource blocks into sibling functions alongside `expandCandidates()` is the natural
open/closed seam for the next objective, and is **permitted but optional** in MR1 — if
done, it must be a provably behaviour-neutral move (unchanged `candidates` /
`startByCandidate` population), because the risk of a silent reordering is not worth
paying inside the MR that also changes behaviour.

---

## 3. Post-#1064 re-evaluation plan for #1066

**#1066's root cause is explicitly not triaged. No fix is pre-committed.**

One prediction is recorded **to be falsified, not assumed**: the unbounded
`objective-readiness` accounting in §2.6 produces exactly the reported signature —
`+1 unit/civ/round`, one city, gold still rising (gold rises because production, not
gold, buys the unit). If §2.6 removes it, that is Outcome A below, and #1066 closes
with evidence and **no second code change**.

MR2 begins by re-running `lh-late-era-medium` on refreshed post-#1064 `main`:

**A — symptom disappears.** Prove it with repeated deterministic runs (byte-identical
artifact). Determine *why* #1064 removed it. Keep `unit-count-runaway` as a live
guard, delete only the `KNOWN_CAMPAIGN_GAPS` registration, document why no further
production fix is warranted, close #1066 with evidence.

**B — shape changes materially.** Re-derive from current evidence. Instrument
*before* touching production logic.

**C — persists substantially unchanged.** Instrument the ramp, identify the real
creation path, write a regression reproducing that exact path, only then design.

For B and C, instrument rounds around the ramp and capture, per created unit: type,
owner, creation function/path, triggering system, gold/production cost, source
city/base, and which mechanism created it (production queue, spawn, carrier/air,
crisis/world actor, fixture setup, special mechanic). Candidate suspects — Era-9
fixture posture (`ai-playability-fixture.ts:413`: `gold = 1000`, warrior→`tank`, one
injected `wwii_fighter`), late-game economy/mobilization, carrier/air basing, a
mis-attributed world-threat force — **none may be called root cause until traced.**

Instrumentation must obey `tests/scripts/perf-isolation.test.ts`: no vitest import,
no `vi.*`, no `tests/perf` reference under `src/**`. Use spies from the test side.

Acceptance: spawn source identified and documented; a one-city late-era AI no longer
gains 25+ units over the campaign without a justified economic cause; the gap entry
deleted only once the detector stops reproducing; the detector retained as a guard;
determinism preserved; no regression to #1064's expansion fix; no save/reload
divergence; no solo or hot-seat regression.

---

## 4. Post-#1064 re-evaluation plan for #1069

**Re-baseline first.** The checked-in `aiRound` numbers
(`tests/perf/baselines/algorithmic-baseline.json`: `pathQueries` 118→408,
`heapPops` 114774→387872, `auditedCommit: 96fb08e9`) were measured against an AI that
**does not expand and barely builds units**. They are not a valid optimization target.
Post-#1064/#1066 `main` gets fresh e1/e2 measurements before any optimization.

Named hotspots, from tracing:

| Hotspot | Location | Shape |
|---|---|---|
| `applyAIProduction` sort comparator | `ai-production.ts:754` (already hoisted in MR1 §2.10 -- kept here for reference) | `O(n log n)` full candidate generations per civ per round, now precomputed |
| `movementRange()` rebuilds occupancy | `ai-tactics.ts:232` | `buildUnitOccupancy(state.units)` on **every** call, and called repeatedly per unit per ranking pass |
| `calculateProjectedCityYields` per candidate | `ai-production.ts:492` | once per `generateWithResidual`, multiplied by the comparator above |
| `getMovementRangeDetails` blocker scan | `unit-movement-queries.ts` | **owned by #1068** — consume it, do not duplicate it |

Design target: share round-scoped derived data where behaviour is provably identical —
blocking-entity key sets, unit occupancy, per-civ reachable-tile maps, a city-yield
cache keyed by every input that affects the result.

Rules: transient and rebuilt from state; **never persisted**; never crossing a
mutation boundary with stale derived data; keys encode every result-affecting input;
no hidden-information widening; no changed tie-breaking, iteration order, or
`Map`/`Set` dependence that affects results.

A new `cityYieldCalls` metric is added to the `aiRound` perf area — the baseline
currently records it only for `turn`, which is why #1069 had to quote
`yarn perf:report` numbers instead.

Acceptance: materially lower AI-round work counts; tightened budgets justified by the
measured new baselines per `.claude/rules/performance-budgets.md`'s re-baseline rule;
identical AI decisions/traces/resulting state for equivalent inputs; `yarn test:ai-long`
shows no quality regression; `ai-playability.test.ts` green; save/reload continuity
preserved; solo and hot seat preserved; no new persistence.

**Falsification is mandatory.** Prove the new guard *would* fail if repeated
recomputation were reintroduced, and prove a deliberately dumbed-down AI is **not**
accepted merely because its work counts fell. A lower count is not automatically good.

---

## 5. MR boundaries

| MR | Issue | Scope | Explicitly out |
|---|---|---|---|
| 1 | #1064 | shared founding predicate extraction; `ai-expansion-sites.ts`; expand candidate generator (exactly 1 emitted); the incremental-demand rule (readiness + worker); objective-aware phase gate; settler tactical move; **idle-unit auto-explore administrative loop (§2.5, discovered mandatory during implementation)**; production-sort hoist; 3 ratchet entries deleted or re-pointed per §2.20 | any #1066 production cap; any #1069 caching layer; worker *task* selection; richer site valuation; a dedicated scout/recon production path; any exploration *strategy* beyond the existing safety check |
| 2 | #1066 | instrument → trace → (fix or close-with-evidence); `unit-count-runaway` entry deleted | any perf optimization; any change to #1064's expansion behaviour |
| 3 | #1069 | fresh baselines; round-scoped shared derived data; tightened budgets | any AI behaviour change; any new persistence |

MR3 is optional within this arc. If the session is long, stop after MR2 and hand
#1069 to a fresh design session.

---

## 6. Non-goals for the whole arc

- Not a strategic-planner rewrite. Not a redesign of the `AIForceDemand` model.
- Not an observability change — #1005 already added the detection.
- No `SAVE_VERSION` bump unless a real persisted-shape change becomes unavoidable.
  None is expected. §2.5's exploration reuses the existing optional `automation`
  field — no new persisted shape.
- No new player-facing UI. Players aged 7–43 should meet a **more credible** opponent,
  not a more complex interface.
- No detector weakening, threshold widening, or gap-entry retention to make a run green.
- Not a fix for civ-to-civ contact/diplomacy rates, even though §1.3 documents that
  the same root gap plausibly affects them. No diplomacy behaviour is asserted on or
  changed by this arc.
