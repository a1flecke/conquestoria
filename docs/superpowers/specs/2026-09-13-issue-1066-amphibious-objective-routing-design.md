# #1066 — Amphibious objective routing for the AI strategic layer

**Status:** design, not yet implemented.
**Owner issue:** #1066 (re-scoped from "unit-count-runaway" to "expansion-frozen" / zero-plan civs — see that issue's comment thread). Also resolves the root cause documented on the now-closed #1093 (`tech-frozen`), which was a downstream symptom of this same defect.

## Problem

`objectiveCandidates()` (`src/ai/ai-prepared-turn.ts`) is the AI's strategic-plan candidate generator for every major civ, every turn. For each `capture` / `secure-resource` / `expand` candidate it computes a `travelTurns` via `resolveObjectiveTravelCandidates()`, which hardcodes `domain: 'land'` and calls `findPath(..., 'land')` (`src/ai/ai-objective-scoring.ts`). If that call returns `null`, `travelTurns` becomes `Infinity`, `scoreObjectiveCandidate` returns `-Number.MAX_VALUE`, and `choosePrimaryObjective` marks the candidate permanently ineligible.

A civ whose city sits on a landmass with no walkable connection to any known target — reachable only by crossing water — gets **every** candidate rejected this way, every turn, forever. `choosePrimaryObjective` returns `selected: null` in every single call. `primaryPlan` never gets set. This was root-caused (see #1066's comment thread) against the `lh-late-era-medium` long-horizon scenario's `ai-3`: `activePlanCount` stuck at 0 for 230+ consecutive rounds out of a 250-round campaign, terrain dump confirming a solid band of `coast` tiles between its city and every known resource/city, and both `findPath(..., 'land')` and `findPath(..., 'naval')` independently confirmed to return `null` for the same targets (naval fails too, because the destination tiles are themselves land — a ship can't dock on a hill).

This is not a data or config bug. It is a structural gap: **the strategic layer has no notion of a multi-domain (walk → embark → sail → disembark → walk) route.** No amount of exploration, turns, or personality tuning changes the outcome — the candidate set is mathematically empty for as long as the civ has no all-land route to anything.

Critically, the **execution** layer already partially handles this: `ai-tactics.ts`'s `rankCivilianAndTransportActions` computes `planNeedsTransport` by checking whether `findPath` in the unit's *own* domain fails against the plan's target, and if so, looks for any loadable transport and queues a `load` action. This logic is unreachable today only because no plan carrying such a target is ever formed. The gap is entirely upstream, in candidate generation/scoring — not in movement execution.

## Prior art

**Industry:** this is a textbook instance of **Hierarchical Pathfinding A\* (HPA\*)** (Botea, Müller & Schaeffer, 2004) — the standard game-AI technique for exactly this shape of problem: partition the map into clusters, precompute the cost of crossing between clusters once, and use that abstract graph for cheap long-range reachability/cost queries, falling back to real pathfinding only within a cluster or across one precomputed edge. 4X games in general treat cross-water movement as a distinct concern from same-landmass movement for exactly this reason: an amphibious query is fundamentally a two-level query ("can I reach that landmass, and how", then "how do I get across my own landmass to the crossing point").

**In this codebase**, the "cluster" abstraction already exists and is already load-bearing elsewhere: `landmass-tagger.ts`'s `tagLandmassRegions` flood-fills the map ONCE at generation (or on load, via `normalizeLandmassKeys`) into `tile.regionKey` (`continent-N` / `island-N`). `city-founding-system.ts` already uses `regionKey` for an O(1) same-landmass check (the colonial-charter foreign-landmass bonus), and `threat-pressure-system.ts` uses it extensively for landmass-scoped threat reasoning. This is precisely HPA*'s cluster partition — we are not introducing a new abstraction, only a new *consumer* of one that already exists.

The codebase also already has a convention for this class of computation: `road-network.ts`'s `getCitiesConnectedToCapital` is documented `Pure/memoizable per turn` — a BFS that is safe and cheap enough to recompute fresh every turn from live `GameState`, with no persistent cross-turn cache. This design follows that same convention rather than introducing new cross-turn cached state (see "Why no persistent cache" below).

## Goals

1. A civ boxed onto a landmass with no all-land route to a target, but with a viable sea crossing to it, can form a real strategic plan (`capture`, `secure-resource`, or `expand`) that requires and uses a transport.
2. No change to movement execution, transport load/unload rules, or combat — those are already correct.
3. Bounded, deterministic, cheap: no per-candidate exact pathfinding explosion; reuses existing per-turn recomputation conventions.
4. Difficulty-invariant: this is a legality/reachability fix, not a challenge-tuned behavior. Every tier gets the same reachability determination.

## Non-goals

- **Multi-hop routing** (crossing two or more separate water gaps to reach a target on a third landmass). One water gap only.
- **Fully landlocked civs** (no tile in the civ's reachable territory borders water at all). This fix cannot help them — there is no embarkation point to compute from. Tracked as a separate follow-up issue (to be filed alongside this work) rather than solved here.
- **New AI behavior beyond candidate eligibility** — no new invasion doctrine, no new production heuristics beyond the one wiring fix in Goal 1's dependency chain (see below). The AI's existing scoring (`expectedLossRatio`, distance penalty, personality weight) is untouched; this only changes whether a candidate is *reachable* at all.
- **Persistent/serialized landmass-adjacency data.** Everything this design computes is derived from already-persisted `tile.terrain` and `tile.regionKey`; nothing new is added to `GameState`, so there is no save-migration story.

## Architecture

### 1. Region-crossing reachability: a per-turn, single-source BFS (the abstract-graph layer)

New function in a new module `src/ai/ai-amphibious-routing.ts`:

```ts
export interface RegionCrossing {
  targetRegionKey: string;
  /** Tile on the origin's own landmass where the unit would embark. */
  embarkTile: HexCoord;
  /** Tile on the target's landmass where the unit would disembark. */
  disembarkTile: HexCoord;
  /** Naval-domain tile distance from embarkTile to disembarkTile. */
  navalDistance: number;
}

/**
 * From every coastal tile belonging to `originRegionKeys`, BFS outward across
 * naval-passable tiles only. Records the FIRST (shortest) crossing into each
 * OTHER region encountered. One traversal answers "how do I reach every other
 * landmass by sea from here" for every candidate this civ has this turn —
 * the same "precompute the abstract edge once, reuse for many queries"
 * principle as HPA*'s inter-cluster portals, scoped down to a single source
 * cluster since we only ever need this civ's own reachability.
 */
export function findRegionCrossings(
  map: GameMap,
  originRegionKeys: ReadonlySet<string>,
): Map<string, RegionCrossing>;
```

- Seeds: every tile in `map.tiles` whose `regionKey` is in `originRegionKeys` AND is coastal (has a naval-passable neighbor) — reusing the same coastal test `isCityCoastal` already uses (neighbor terrain is `ocean` or `coast`).
- Traversal: standard BFS (unweighted — hex-to-hex naval movement is uniform cost for this *reachability* purpose; exact turn cost is computed later by the real A* leg), stepping only onto tiles where `getMovementCostForUnit(tile.terrain, 'naval') !== Infinity`.
- Termination per branch: the moment the BFS reaches a tile whose `regionKey` differs from every key in `originRegionKeys` AND is not itself `ocean`/`coast` (i.e., it's a real landing spot on foreign land), record `{ targetRegionKey, embarkTile: <the seed this branch grew from>, disembarkTile: <this tile>, navalDistance: <BFS depth> }` for that `targetRegionKey` if not already recorded (first-reached wins — BFS guarantees shortest).
- Bounded: stops expanding a branch once every other known region has been recorded, and is naturally bounded by the map's naval-tile count (a small fraction of total tiles), not full map size.

**Why no persistent cache:** `map.tiles`' *terrain* and `regionKey` are immutable after generation, so this result is technically cacheable for the life of a game. But every existing precedent for this exact pattern (`getCitiesConnectedToCapital`, and `resolveObjectiveTravelCandidates`'s own per-call `pathLengthByKey` map) recomputes fresh per call rather than introducing cross-turn memoization, specifically to avoid cache-key/invalidation risk in a codebase with strict same-seed-same-result determinism guarantees and heavy test-suite reuse of long-lived processes. This design follows that convention: `findRegionCrossings` is called once per civ per turn (from `objectiveCandidates`), its result held in a local variable for that one call, and discarded. If a future perf pass finds this measurably hot, upgrading to a `gameId`-keyed cache is a self-contained follow-up, not a prerequisite.

### 2. Candidate resolution: try land first, fall back to composed amphibious route

`resolveObjectiveTravelCandidates` (`src/ai/ai-objective-scoring.ts`) changes to:

1. Compute candidates' `travelTurns` via the existing land-domain `findPath`, exactly as today — **unchanged for any candidate whose target shares a `regionKey` with its start** (the common case; no new cost here at all).
2. For a candidate whose land path failed (`null`) **and** whose target's `regionKey` differs from the unit's origin region: look up that `regionKey` in this turn's `findRegionCrossings` result (computed once by the caller, `objectiveCandidates`, and threaded through — see below).
   - Not found (no sea route to that landmass at all, e.g. it's beyond one hop): candidate stays unreachable, exactly as today.
   - Found: compute `travelTurns = landLeg(unit start → embarkTile) + AMPHIBIOUS_EMBARK_OVERHEAD + Math.ceil(navalDistance / navalMovementPoints) + landLeg(disembarkTile → actual target)`, where each `landLeg` is a real `findPath(..., 'land')` call — but now only for the handful of candidates that survive this far, not for all up to 24. `AMPHIBIOUS_EMBARK_OVERHEAD = 1`: verified directly against `transport-system.ts` — `loadUnitOntoTransport` unconditionally sets `movementPointsLeft: 0, hasMoved: true, hasActed: true` on the loading unit, i.e. embarking always consumes one whole turn regardless of remaining movement points, a genuine fixed cost beyond simple distance. Disembarking needs **no** separate overhead: `canUnloadUnitFromTransport`'s `canCargoSpendUnloadAction` only requires ordinary unused movement (`!hasActed && movementPointsLeft > 0`), and the unit actually moves onto the land destination as part of that action — so the final `landLeg(disembarkTile → actual target)` pathfind already counts that first step as ordinary movement, with no extra fixed cost to add.
   - If the target region has an `AIObjectiveTravelCandidate` requiring the SAME entry every time it turns out to be common (e.g., many `secure-resource` candidates on the same foreign landmass), the caller passes the SAME `findRegionCrossings` result to every candidate's resolution this turn, so this lookup is a `Map.get`, not recomputed per candidate.
3. Any candidate resolved via step 2 gets `requiredRoles: { ...candidate.requiredRoles, transport: 1 }` merged in before scoring.

`objectiveCandidates` computes `findRegionCrossings(knownMap, new Set(operationalAnchors.map(a => knownMap.tiles[hexKey(a)]?.regionKey).filter(Boolean)))` once, before building `travelInputs`, and threads the result into `resolveObjectiveTravelCandidates` as a new parameter.

### 3. Plan formation and execution: already correct, no changes

- `choosePrimaryObjective`'s `missingRoles` check already treats `requiredRoles.transport` as a normal role requirement — if the civ has no transport, this candidate demands one (`missingRoles` includes `'transport'`), exactly like the existing settler/`objective-readiness` pattern from #1064. It stays *eligible* for selection (transport is just another missing-role demand, not a hard block) — matching how a `capture` candidate with `requiredRoles: {frontline:1}` and zero frontline units is still selectable and drives production toward building one.
- Once selected, `refreshMajorCivPortfolio`'s existing force-demand pipeline turns the missing `transport` role into an `AIForceDemand` at priority 90 (`objective-readiness`), same mechanism as settlement.
- Once a transport exists and is assigned, `ai-tactics.ts`'s existing `planNeedsTransport` branch (`rankCivilianAndTransportActions`) already finds and loads onto it — this is the code that was already correct but unreachable. Confirmed unchanged.

### 4. One necessary production-wiring fix

`ai-production.ts`'s `cargoDemand` gate (line ~496) currently only unblocks transport-ship production when a demand for a role in `COMBAT_CARGO_ROLES` (`capture`/`frontline`/`ranged`/`siege`/`mobile`) is missing:

```ts
const cargoDemand = demands.some(entry =>
  entry.missing > 0 && COMBAT_CARGO_ROLES.has(entry.role));
```

A `secure-resource` (`resource-expedition`) or `expand` (`settlement`) candidate's new `transport` demand is **not** in that set, so even with a correct `requiredRoles.transport` demand seeded, a transport ship would never actually get built. Broaden the gate to also fire on an explicit `transport` demand:

```ts
const cargoDemand = demands.some(entry =>
  entry.missing > 0 && (COMBAT_CARGO_ROLES.has(entry.role) || entry.role === 'transport'));
```

This is a one-line, narrowly-scoped change — it does not touch `COMBAT_CARGO_ROLES` itself (which stays semantically "which cargo roles justify a transport for a *military* landing"), it adds a second, independent reason a transport can be justified. Without this fix, Goal 1 is only half-closed: a valid plan forms, but nothing ever gets built to execute it.

## Data flow

```
objectiveCandidates(civ, perception, ...)
  │
  ├─ compute operationalAnchors' regionKeys
  ├─ findRegionCrossings(knownMap, originRegionKeys)   [NEW — one BFS, this turn only]
  │     └─ Map<targetRegionKey, RegionCrossing>
  │
  ├─ build capture / secure-resource / expand candidates (unchanged)
  │
  └─ resolveObjectiveTravelCandidates(knownMap, candidates, crossings)  [CHANGED]
        ├─ land findPath fails? → same region? → stays unreachable (unchanged)
        └─ land findPath fails? → different region? → crossings.get(targetRegionKey)
              ├─ absent → stays unreachable (unchanged)
              └─ present → composed travelTurns + requiredRoles.transport = 1  [NEW]
                    │
                    ▼
        choosePrimaryObjective (unchanged) — transport missing → objective-readiness demand
                    │
                    ▼
        ai-production.ts cargoDemand gate  [ONE-LINE FIX] → transport gets built
                    │
                    ▼
        ai-tactics.ts planNeedsTransport branch (unchanged, already correct) → load/sail/unload
```

## Testing plan

- **Unit tests for `findRegionCrossings`** (`tests/ai/ai-amphibious-routing.test.ts`, new file): a small synthetic two-island `GameMap` fixture — same-region query returns empty map; a real one-hop sea crossing is found with the correct embark/disembark tiles and shortest naval distance; an unreachable third region (beyond one hop) is absent from the result; a region with multiple candidate crossing points picks the shortest one (BFS-guaranteed, assert against a hand-computed expectation).
- **Unit tests for `resolveObjectiveTravelCandidates`'s new fallback** (`tests/ai/ai-objective-scoring.test.ts`, extend existing): a candidate whose land path fails but a crossing exists gets a finite `travelTurns` and `requiredRoles.transport === 1`; a candidate whose land path fails with no crossing available stays `Infinity`/ineligible (regression proving the fallback doesn't over-fire); a same-region candidate is completely unaffected (byte-identical `travelTurns` to today, proving zero behavior change for the common case).
- **`ai-production.ts` cargoDemand regression**: a civ with a `transport`-only missing-role demand (no combat-cargo demand present) now produces a transport-ship candidate; the prior combat-cargo-only trigger still works unchanged (negative test: removing the new `|| entry.role === 'transport'` clause must fail this test, proving it's load-bearing).
- **Integration: the actual `lh-late-era-medium` scenario.** Re-run `yarn test:ai-long -- -t lh-late-era-medium` after the fix. Acceptance: `ai-3` (or whichever civ reproduces the isolated-landmass shape) forms a non-null `primaryPlan` within a bounded number of rounds of first having a viable crossing in its known map, and the `expansion-frozen` finding for that scenario/civ no longer reproduces. Delete the `known-campaign-gaps.ts` entry pointing `expansion-frozen`/`lh-late-era-medium` at #1066 in the same PR the ratchet requires this.
- **Determinism**: no RNG introduced (BFS and A* are both deterministic); `tests/app/simulation-determinism.test.ts`'s existing suite is the backstop, no new determinism test needed beyond what already runs.
- **Perf budget (#1007)**: `tests/perf/algorithmic-budgets.test.ts` will need `UPDATE_PERF_BASELINE=1` regeneration once `findRegionCrossings` adds new per-turn work for civs with any cross-region candidate — expected, not a regression; justify the new number in the PR body per that file's own process. Civs with no cross-region candidates (the overwhelming majority of turns, for most civs, most of the game) pay zero new cost — the BFS only runs when at least one candidate's direct land path has already failed.

## Follow-up (not this design)

File a new issue: **a fully landlocked civ (zero coastal tiles anywhere in its known/owned territory) still has zero eligible candidates forever after this fix**, since there is no embarkation point to compute a crossing from. This is a much rarer map shape than "boxed in behind one strait" and needs a different mechanism entirely (e.g., a minimal "consolidate/garrison" default plan so `primaryPlan` is never permanently `null` regardless of map shape) — deliberately out of scope here per the non-goals above.

## Open questions for review

- Whether `findRegionCrossings`'s BFS should also be exposed for the *player-facing* "reachable?" hint somewhere (e.g., a future UI affordance) — out of scope for this MR but worth flagging since the abstraction is generically useful, not AI-only.
- A tile can lack `regionKey` on an un-normalized old save (`normalizeLandmassKeys` backfills it on load, but defense-in-depth is cheap): `findRegionCrossings` and the origin-region lookup in `resolveObjectiveTravelCandidates` both treat a missing `regionKey` as "no crossing computable" (skip, stay unreachable) rather than throwing — confirm this is the desired degrade-gracefully behavior rather than a hard error during implementation.
