# #1122 — Capture Force Demand and Assembly Design

**Status:** implementation evidence updated after real-pipeline reproduction.

**Base:** `be6d23228519c1be1455d3dafe8ad153ab9165eb` (`origin/main`, refreshed 2026-09-19). #1122 is open with no comments or open-PR collision. Re-run the refresh/collision gate before Terra and Sol.

## Root cause

The flat capture shape is a symptom. `requiredRoles` has three incompatible meanings:

| Consumer | Current rule | One Warrior (`frontline`, `capture`) |
| --- | --- | --- |
| objective eligibility | independent tag count | satisfies both roles |
| assignment | a unit is consumed per slot | fills frontline, leaves capture missing |
| readiness | independently filters assigned ids per role | satisfies both roles again and advances |

Production runs after tactical execution. Thus the missing assignment slot cannot repair the force before departure; this failure occurs without `deadlineReached`, so #1124 is not its first cause.

The initial `{ frontline: 2, capture: 1 }` draft also cannot work: objective choice collapses missing counts to a role `Set`, while `incrementalDemandSeed()` caps readiness demand at one. One frontline against a two-frontline candidate yields no second-unit demand and no plan. Finally, capture candidates use whole-rival strength, while city perception has no HP/defense facts and candidate generation does not inspect local garrison. Fogged `GameState` city reads would violate the information boundary.

The real fortified-city pipeline then exposed a second causal seam: after an incomplete capture became a real plan, its assignment-derived shortage and the older generic `objective-readiness` shortage were merged. The same one-frontline gap therefore appeared twice to production. This is not an economy or queue-scoring bug; it is two authorities describing one capability deficit.

Deep follow-up exposed a third causal boundary: `getTrainableUnitsForCiv()` establishes
catalog legality (tech/resources), not physical production capacity. A cityless civ with
one surviving Warrior could retain a fortified capture plan short one frontline unit because
the catalog still contains Warrior, even though no owned city can queue it. The plan must
not turn catalog metadata into an imaginary replenishment source.

**First causal root:** there is no canonical, consumptive force-capacity contract shared by selection, demand, assignment, and readiness.

## Chosen contract

`requiredRoles` is a **capability cardinality** contract.

- A unit may satisfy different roles when it genuinely has both capabilities. One Warrior intentionally satisfies `frontline: 1, capture: 1`.
- A count within one role requires distinct units: `frontline: 2` requires two frontline-capable units.
- One typed helper, based on `canUnitFulfillAIStrategicRole`, returns available/missing/satisfied role counts. Objective selection, pre-plan demand, assignment demand, and `hasRequiredRoles()` all use it.
- Assignment selects a deterministic minimal union of units: bounded greedy coverage of unmet capabilities, then existing role-fit/travel/health/id ties. A selected unit is credited for all genuine capabilities once; no duplicate assignment, permutations, or tactical simulation.
- Once a primary capture plan exists, its assignment-derived critical-role deficit is the only production authority for those roles. Generic `objective-readiness` remains pre-plan scaffolding and must not duplicate plan-owned capture requirements.

The exposed-city control is deliberately one capture-capable unit: `{ capture: 1 }`. This preserves opportunistic conquest. Observed resistance is bounded:

| Observed class | Critical roles | Optional support |
| --- | --- | --- |
| exposed: no observed local defender or fortification | `{ capture: 1 }` | none |
| contested: observed local garrison/defender | `{ frontline: 2, capture: 1 }` | none |
| hardened: contested plus observed fortification/intact defense | `{ frontline: 2, capture: 1 }` | `{ siege: 1 }`, else `{ ranged: 1 }`, only if legal |

`supportRoles` is persisted optional assignment/production demand, never readiness. It is capped at one and omitted when neither live nor trainable support can fulfill it. This establishes usable support without changing #1123 action order or #1124 deadline semantics.

## Observer-safe target facts

Add a coarse city observation to perception and last-seen presentation: `defense: 'open' | 'fortified'` and `hpBand: 'healthy' | 'damaged' | 'critical'`, captured only while that city is visible. Do not retain building lists, exact HP, techs, queues, or raw city references. Build one bounded local index of perceived hostile units around candidate cities. Visible strengthening escalates immediately; visible weakening lowers the tier. Fog cannot manufacture escalation or a false de-escalation; a retained plan keeps its legally earned tier until direct reobservation. This avoids hidden-information use and demand oscillation.

## Data flow

1. Compute legal trainable roles before candidate selection.
2. Derive each capture shape from coarse city observation plus local perceived units.
3. Objective choice preserves its existing aggregate pre-plan readiness contract, using counted deficits rather than a role-set union. A possible but incomplete capture candidate creates/retains a `mobilizing` plan, allowing target-specific assignment demand before full assembly. Once retained, that plan suppresses generic readiness for its own critical roles so production sees each capture shortage exactly once without starving independent expansion or resource operations.
4. Retain an incomplete capture only when every missing critical role is trainable in a
   currently owned city, using the same city-specific legality (coast, required building,
   faith) as production. Catalog-level legality and optional support never qualify as a
   critical replenishment source. Target-scoped readiness demand is revalidated against
   ownership so it cannot survive capture/retarget.
5. Loss or emergency detach recomputes the canonical deficit next turn. Critical deficit remains readiness-critical; support loss is optional. Portfolio refresh copies role maps/tier from a matching candidate.

Difficulty and personality do not alter basic competence: identical observed facts create the same force shape for Explorer, Standard, and Veteran. Existing caps/timing remain downstream. New data is optional normalized JSON with legacy-empty defaults, so reload must match uninterrupted play. No full enemy scan, per-candidate path, combat preview, or generic army planner is permitted.

## Proof and boundaries

Terra must add a real-pipeline RED case tracing perception → candidate → counted deficit → production → assignment → mobilization → tactical result/loss → replacement demand. Controls: exposed, contested, hardened, unavailable/later support, visible strengthen/weaken, hidden defender, loss/detach, retained refresh, ownership change, all challenges, determinism, reload, solo/hot-seat, and performance.

Non-goals: no combat rewrite, new content, personality hack, deadline change (#1124), tactical sequencing change (#1123), or long-horizon policy edit.

## Mandatory revised design review

**perform an INLINE review across these dimensions about balancing gameplay, fun, new mechanics, different player ages (7-43), different play styles, the built in difficulty modes, how computer players will use it, ui, ux, architecture, extensibility, data, sfx, updating saved games, proper testing, regressions solo play, and hot seat plays, and proper implementation.**

- **Balance/fun/ages/styles/difficulty:** exposed targets remain quick; only observed resistance earns a finite second fighter and possible support. Every tier retains minimum capability without cheats.
- **AI/architecture:** review found the prior role-slot contradiction, boolean count loss, and duplicate pre-plan/plan demand authority. One canonical helper, incomplete mobilizing plan, and a single plan-owned production deficit correct these at the earliest causal seams.
- **AI/architecture follow-up:** a cityless-civ RED test found that catalog trainability
  was being mistaken for a production source. The plan-retention seam now asks the actual
  owned-city trainability helper, leaving queue selection unchanged and preventing an
  impossible critical replenishment request.
- **UI/UX/SFX:** no control, renderer, or sound change. Coarse observed facts are viewer-safe state, not a new hidden overlay.
- **Data/saves/hot-seat:** review found raw city inspection unsafe. Coarse snapshots, normalization, legacy defaults, target-scoped demand, and actor-scoped perception correct that defect.
- **Testing/performance:** review found the old draft lacked a valid pipeline proof. RED-first, three-consumer consistency, save/determinism, seat privacy, and bounded matching/indexing are required.
- **Implementation:** #1124/#1123 remain explicitly downstream; the no-deadline readiness contradiction is fixed here.

The review materially changed the design: it removed the false distinct-slot assumption, replaced role-set demand with counted deficits, required observer-safe city facts, preserved incomplete plans for assembly, and made retained plans the sole authority for their own production shortage. If the RED trace disproves this path, emit `DESIGN ESCALATION REQUIRED`.
