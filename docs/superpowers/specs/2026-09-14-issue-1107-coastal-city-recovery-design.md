# #1107 — AI recovery from having strategic sea access but no coastal production city

**Status:** design, not yet implemented.
**Owner issue:** #1107.
**Related:** #1066 (amphibious objective routing, merged as #1109 — the strategic-reachability half of this problem), #1108 (fully-landlocked civs — a different, out-of-scope case), #386 (the historical bug this design must not regress).

## Demonstrated current-main failure

Confirmed directly against current `main` (post-#1109) at round 200–250 of the real `lh-late-era-medium` campaign:

- `ai-3`'s strategic layer works correctly: `findRegionCrossings` finds two one-hop sea crossings, `prepareMajorCivStrategicPlan`'s `forceDemands` correctly includes `{ role: 'transport', missing: 1, priority: 90 }`.
- `isCityCoastal(city, state.map)` returns `false` for `ai-3`'s one city. Every transport-family unit (`transport`/`carrack`/`galleon`/`steamship`/`troop_transport`) requires `coastalRequired: true`; `troop_transport` (fully tech-unlocked, not obsolete) is excluded on that gate alone.
- `ai-3`'s `primaryPlan` stays `null` for the whole 250-round campaign as a result — `expansion-frozen` and downstream `tech-frozen` both fire.

## The historical #386 constraint

`docs/superpowers/specs/2026-06-15-bug-fixes-design.md`'s Bug #386 fix is exact and load-bearing: `isCityCoastal` was changed from `city.ownedTiles.some(coastal)` (any tile the city's *culture* has claimed, however distant) to `[city.position, ...hexNeighbors(city.position)].some(coastal)` (city center + its 6 immediate neighbors only), specifically because a landlocked city that culturally expanded to a distant coast tile was incorrectly gaining ship production, coastal buildings, and other coastal-only effects. The regression test locks this down explicitly: *"`isCityCoastal` returns `false` for a city whose `ownedTiles` contains a distant coast tile but whose 6 immediate neighbors and own tile are all inland."* This design must not touch that behavior.

## Caller audit

Every real caller of `isCityCoastal` (`src/systems/city-system.ts` — unit/building production eligibility, live per-turn dequeue guard; `src/storage/save-manager.ts` — save migration cleanup; `src/systems/trade-system.ts` — trade-route gold bonus, route capacity bonus; `src/systems/tech-yield-system.ts` — `requiresCoastal` tech-yield effects; `src/systems/combat-context.ts` — amphibious assault multiplier, coastal-defender combat modifier; `src/ai/ai-research.ts` — `coastalEmpire` naval-tech research bias) shares the same strict, single-ring semantics. **None of them should be widened.** Widening `isCityCoastal` anywhere would reintroduce #386 simultaneously across combat balance, trade income, and tech yields — not just AI ship production.

**Side finding, explicitly out of scope for this issue:** `src/systems/trade-route-classification.ts` defines its own *separate*, un-fixed `isCityCoastal(state, cityId)` using `city.ownedTiles.some(...)` — the exact pre-#386 definition, still live today, disconnected from the canonical one in `city-system.ts`. This is a genuine, currently-reproducible #386-class bug in trade-route classification. Not fixed here (different subsystem, different blast radius, needs its own review) — filing as a separate follow-up (see Follow-ups section).

## Chosen semantics: Option A — AI recovery, not a definition change

Per the caller audit and the #386 constraint, the correct rule is: **ships may only be produced by a genuinely coastal city.** This is unambiguous and consistently applied everywhere already. #1107 is therefore an *AI competence* problem — the AI must learn to prioritize obtaining a genuinely coastal production city when its strategic plans need naval capability and it doesn't have one — not a predicate-widening problem.

### Rejected alternatives

- **Widen `isCityCoastal` to territory-wide.** Rejected: reintroduces #386 by definition, and would ripple into trade, combat, and tech-yield balance simultaneously.
- **A separate, looser "harbor access" concept reusing `ownedTiles`.** Investigated (question C from the assignment) — no existing "harbor access" or naval-infrastructure concept exists anywhere in the codebase distinct from `isCityCoastal` itself (no such building, tech effect, or state field). Inventing one is a much larger feature (a new building/mechanic, its own balance pass, its own UI) than this issue's scope justifies, and doesn't obviously solve the problem better than reusing the existing expansion architecture below.
- **Relax `MIN_CITY_CENTER_DISTANCE` for AI recovery specifically.** Rejected: that's a real gameplay-legality rule, not an AI-only knob, and the assignment's own non-goals explicitly warn against changing legality to make a detector pass. A relaxed-distance city would also be legal for a *human* to found identically, silently changing city-spacing rules for everyone.

## Empirical finding that reframes scope: `ai-3`'s specific landmass has no solution

Before designing the recovery mechanism, I checked the question the assignment explicitly asks: *"Can a settler from the affected civ reach a legal genuinely coastal founding site by LAND on the same landmass?"*

Instrumented the real campaign with full (non-fog-bounded) map access: `ai-3`'s entire landmass — including its own city tile — is **10 land tiles total**. Exhaustively checking every one of them for `hexDistance >= MIN_CITY_CENTER_DISTANCE(4)` from the existing city AND `isCityCoastal`-if-founded-there: **zero candidates**. The landmass is smaller than the minimum legal city-spacing distance — no second city, coastal or not, can *ever* legally stand anywhere on it. Conquest isn't a live escape either: every other known city is confirmed (via #1109's own `findRegionCrossings`) reachable only by sea, so capturing one requires the exact capability being sought. `ai-3` is in a genuine, permanent circular deadlock that no AI-competence fix can solve — it is behaviorally identical to #1108's "fully landlocked" case, just reached via a different literal mechanism (has *some* coastal territory, but a landmass too small to ever grow).

**This was not representative.** I checked map generation (not full campaigns — landmass shape is fixed at generation time, so this is cheap) across 15 other seeds with the same map size/challenge/personality parameters. Every one of them that produced a non-coastal-city AI civ had a landmass of at least 43 tiles with double-digit-to-hundreds of legal recoverable coastal sites. `ai-3`'s 10-tile island is an extreme outlier, not the representative shape of this bug class.

**Decision (this is a call Terra must not silently revisit):** replace `lh-late-era-medium`'s map seed with one that reproduces the same class of problem (an AI civ with coastal territory but a non-coastal city) on a non-degenerate, genuinely recoverable landmass, so the long-horizon acceptance test actually exercises and validates the fix. This is not "shortening the scenario," "weakening the detector," or "special-casing the fixture" — the turn count, map size, challenge tier, and personality set are all unchanged; only the RNG seed value changes, replacing an anomalous degenerate map with a representative one. Candidate verified: seed `lh-1107-search-0` (found via the search above) produces `ai-1` (the 'aggressive' personality civ, `mongolia`) with a 43-tile landmass and 11 legal recoverable coastal sites — small enough to preserve the scenario's "compact, resource-constrained" flavor, large enough to be genuinely solvable.

To keep the scenario's stable identity (`lh-late-era-medium` is referenced by name in `known-campaign-gaps.ts`, artifact filenames, and this design doc's own history) decoupled from the literal RNG seed string, add an optional `mapSeed?: string` field to `LongHorizonScenario`: when present, `toCampaignOptions` passes `mapSeed` to `createNewGame` instead of `scenario.seed`, while `scenario.seed` remains the stable label used everywhere else (artifact filename, known-gap registry, matrix test name). `lh-late-era-medium`'s row keeps `seed: 'lh-late-era-medium'` and gains `mapSeed: 'lh-1107-search-0'`.

`ai-3`'s original 10-tile-island shape is a real, separate, legitimate map-generation finding — filed as a follow-up (see Follow-ups), not solved here and not silently dropped.

## The mechanism

`objectiveCandidates()` (`ai-prepared-turn.ts`) already emits exactly one `expand` candidate per turn via `getKnownExpansionSites` (`ai-expansion-sites.ts`), itself already bounded by `EXPANSION_SITE_SHORTLIST` (3) and `EXPANSION_SEARCH_RADIUS` (8), already bootstrapped by #1064's `objective-readiness` incremental-demand pattern when no settler exists yet, and already capped by `getExpansionCitySoftCap`/`expansionDrive`. Every piece of machinery this needs already exists. The gap is narrow: `evaluateExpansionTarget` (`ai-strategy.ts`) scores a candidate site's terrain mix and explicitly **penalizes** ocean tiles in the neighborhood (`score -= oceanCount * 2`) — a sound rule for ordinary expansion (fewer workable land tiles nearby), but it means a genuinely coastal site is systematically scored *worse* than an equally-good inland one, so the AI never naturally reaches for it even when a coastal site exists.

**Fix:** when the civ currently has zero coastal cities, give any candidate site that would *itself* pass `isCityCoastal` if founded there a bounded score bonus, applied **before** `getKnownExpansionSites`'s shortlist sort/slice (not after) — a bonus applied only at final candidate scoring would arrive too late if a middling-terrain coastal site never made the top-3 shortlist in the first place.

### Exact insertion point

`getKnownExpansionSites` (`ai-expansion-sites.ts`), in its per-candidate loop:

```ts
sites.push({ anchor: { ...coord }, score: scoreNeighbourhood(knownMap, coord) });
```

becomes (new `needsCoastalAccess: boolean` parameter, applied before the existing `.sort().slice(0, limit)`):

```ts
const baseScore = scoreNeighbourhood(knownMap, coord);
const score = needsCoastalAccess && isPositionCoastal(coord, knownMap)
  ? baseScore + COASTAL_ACCESS_RECOVERY_BONUS
  : baseScore;
sites.push({ anchor: { ...coord }, score });
```

`COASTAL_ACCESS_RECOVERY_BONUS` needs to be large enough to reliably overcome `evaluateExpansionTarget`'s ocean penalty and typical terrain-score spread (observed scores for a radius-2, 19-tile neighborhood range roughly -40 to +57; a bonus of **+40** is proposed, sized to move a realistically-coastal site into the top of typical rankings without being effectively infinite — Terra should confirm this empirically against the new seed's actual candidate sites during TDD, and adjust with a measured justification if 40 proves insufficient or excessive, following this codebase's usual "measured value, headroom multiplier, comment" convention).

### The `isPositionCoastal` extraction

`isCityCoastal` becomes a one-line wrapper over a new, shared primitive, both kept in `city-system.ts` (not `city-territory-system.ts` — see Canonical architecture owner below for why) so the exact same #386-safe definition is reused rather than duplicated:

```ts
// city-system.ts (immediately above the existing isCityCoastal; hexNeighbors/hexKey/
// wrapHexCoord are already imported at the top of this file)
export function isPositionCoastal(position: HexCoord, map: GameMap): boolean {
  const coordsToCheck = [position, ...hexNeighbors(position)];
  return coordsToCheck.some(coord => {
    const wrapped = map.wrapsHorizontally ? wrapHexCoord(coord, map.width) : coord;
    const t = map.tiles[hexKey(wrapped)];
    return t?.terrain === 'ocean' || t?.terrain === 'coast';
  });
}

export function isCityCoastal(city: City, map: GameMap): boolean {
  return isPositionCoastal(city.position, map);
}
```

Zero behavior change for any existing caller — this is a pure refactor extraction, verified by the existing `isCityCoastal` test suite passing unmodified.

### Capability detection: `civHasCoastalCity`

`ai-research.ts` already computes this exact concept inline (`coastalEmpire = civ.cities.some(cityId => isCityCoastal(...))`, `src/ai/ai-research.ts:368-370`). Extract it into `city-system.ts` alongside `isCityCoastal` (it already imports `isCityCoastal` from there) and have both `ai-research.ts` and the new expansion-site logic call it:

```ts
// city-system.ts
export function civHasCoastalCity(state: GameState, civId: string): boolean {
  const civ = state.civilizations[civId];
  if (!civ) return false;
  return civ.cities.some(cityId => {
    const city = state.cities[cityId];
    return city ? isCityCoastal(city, state.map) : false;
  });
}
```

This reads the civ's own city roster — always fully known to itself, no fog-of-war concern — so it's computed once per civ per turn in `ai-prepared-turn.ts` (which already has `GameState`) and threaded down as a plain boolean into `getKnownExpansionSites`, keeping `ai-expansion-sites.ts` `GameState`-free exactly as #1064's design requires ("deliberately `GameState`-free... receives a map that has ALREADY been fog-bounded").

### Wiring

In `objectiveCandidates` (`ai-prepared-turn.ts`), where `getKnownExpansionSites` is currently called:

```ts
for (const site of getKnownExpansionSites(
  knownMap,
  knownCityPositions,
  operationalAnchors,
  EXPANSION_SITE_SHORTLIST,
)) {
```

add `!civHasCoastalCity(state, civId)` as a new final argument, threaded into the function signature change described above.

## Answering the assignment's specific questions

- **Should a human inland city with a coast tile two hexes away train a troop transport, build a Harbor/Dock, get coastal tech-yield bonuses, or count as coastal for naval trade/amphibious combat?** No, on all counts — unchanged, exactly as #386 already established. This design changes nothing about `isCityCoastal`'s answer for any caller, human or AI.
- **Is there an existing harbor/naval-access concept distinct from city coastal status?** No — investigated and confirmed absent (see Rejected alternatives).
- **Can a settler from the affected civ reach a legal coastal site by land?** Sometimes — depends entirely on landmass size relative to `MIN_CITY_CENTER_DISTANCE`. For the representative case (new seed), yes. For `ai-3`'s original 10-tile island, no — see the empirical finding above; this design does not and cannot solve that specific case (correctly — nothing should "solve" a mathematically impossible situation by cheating).
- **Does the AI already know such a site, and why doesn't expand logic solve this today?** `getKnownExpansionSites` already finds and would propose a genuinely coastal site if it scores well — it doesn't today purely because `evaluateExpansionTarget`'s ocean-tile penalty makes coastal sites score worse than inland ones on ordinary merit. This design's entire job is closing that one gap.
- **Does it already own a settler? Can it produce one without an active transport-dependent plan?** #1064's existing `objective-readiness` demand for the `settlement` role already handles "no settler yet" identically regardless of *why* expand was chosen — no new logic needed here.
- **Would a recovery plan deadlock on the same force-demand mechanism?** No — `settlement` and `transport` are different roles, seeded independently; a recovery expand-plan only ever demands a settler, never a transport (transport only becomes relevant *after* a coastal city exists and a *different* objective needs to cross water).
- **Can conquering/acquiring a coastal city solve the gap?** In principle yes (any owned coastal city satisfies `civHasCoastalCity`), but this design does not add new conquest-prioritization logic — the existing `capture` objective type is untouched; if a civ's personality/circumstances already lead it to capture a coastal city, `civHasCoastalCity` picks that up for free on the next turn's re-evaluation, with no extra plumbing needed.
- **Can the civ's personality/difficulty legally choose recovery?** Every personality and difficulty tier sees the identical legal candidate set; only the score bonus (identical magnitude, not difficulty-scaled) changes which site wins. `expansionDrive` continues to modulate the soft cap and overall site-score weighting exactly as before — untouched.
- **Is this failure possible for human players, or AI-only?** Purely an AI strategic-planning gap — a human simply looks at the map and clicks a coastal tile. No player-facing change of any kind.
- **What happens if a coastal city is captured/lost after transports exist?** Already handled, unrelated to this issue: `processCity`'s existing live dequeue guard drops any coastal-required queue item the instant `isCityCoastal` flips false for a city (territory/ownership change). Not touched or extended here.
- **Hot seat?** AI civs are processed identically regardless of which human is `currentPlayer`; this logic never reads `currentPlayer`. No hot-seat-specific behavior.
- **Save/reload?** No new persisted state at all — `civHasCoastalCity` and the score bonus are both derived fresh from existing `GameState` fields every turn, exactly like the `coastalEmpire` pattern this design extends. No migration, no `SAVE_VERSION` bump.

## Canonical architecture owner

No new module. Two existing files, already the canonical owners of the concepts they touch, each gain functions:

- `src/systems/city-system.ts` — already `isCityCoastal`'s sole owner — gains `isPositionCoastal` (the extracted primitive `isCityCoastal` now wraps) and `civHasCoastalCity`, placed immediately next to the existing `isCityCoastal`. **Deliberately not `city-territory-system.ts`**, despite that file owning `MIN_CITY_CENTER_DISTANCE`/`isCityCenterTerrain` (the other primitives `ai-expansion-sites.ts` reuses): `city-territory-system.ts` already imports `BUILDINGS` from `city-system.ts`, so putting `isPositionCoastal` there and having `city-system.ts` import it back would create a fresh circular import between the two files. Keeping both new functions in `city-system.ts` avoids that — confirmed via import-graph check that `city-system.ts` has zero existing imports from `src/ai/*`, so `ai-expansion-sites.ts` importing from `city-system.ts` (a direction `ai-research.ts` and `ai-prepared-turn.ts` already use) introduces no cycle either.
- `src/ai/ai-expansion-sites.ts` gains the `needsCoastalAccess: boolean` parameter and the bonus branch, inside the existing `getKnownExpansionSites`/scoring loop it already owns, plus a new import of `isPositionCoastal` from `@/systems/city-system`.
- `src/ai/ai-prepared-turn.ts` gains one `civHasCoastalCity(state, civId)` call (added to its existing `city-system.ts` import) and threads its result through the existing `getKnownExpansionSites` call site.
- `src/ai/ai-research.ts` swaps its inline `coastalEmpire` computation for a call to the new `civHasCoastalCity` (added to its existing `isCityCoastal` import line from `city-system.ts`) — pure refactor, same result.

No new file, no new AI objective type, no new system.

## Perception boundary

Two different boundaries are in play, deliberately:

- **`civHasCoastalCity(state, civId)`** reads the civ's own `civ.cities` roster and `state.cities[...]`/`state.map` — its own cities and terrain around them are always fully known to itself (never fogged from its own perspective), so this is ground truth, not a fog-bounded estimate. This mirrors the existing `coastalEmpire` check in `ai-research.ts`, which reads the same data the same way today.
- **The site-scoring bonus inside `getKnownExpansionSites`** operates entirely within that function's existing fog-bounded `knownMap` parameter — `isPositionCoastal(coord, knownMap)` only ever sees terrain the civ has actually discovered, exactly like every other terrain check `scoreNeighbourhood`/`evaluateExpansionTarget` already perform there. No new map-wide or omniscient lookup is introduced; a coastal site the civ hasn't explored yet simply isn't in `considered` and can't be scored, same as today.

## Failure modes

- **No genuinely-coastal site is currently known/reachable.** The bonus never fires (nothing in `considered` passes `isPositionCoastal`); `getKnownExpansionSites` falls back to its ordinary best-inland-site behavior, identical to today. The civ is not stuck worse than before — this is the existing #1064 expand-toward-fog-frontier behavior, which naturally explores toward unscouted coastline over subsequent turns as `EXPANSION_SEARCH_RADIUS`'s window slides with the civ's known map.
- **A coastal site exists but is outside `MIN_CITY_CENTER_DISTANCE` legality.** Already excluded upstream — `getKnownExpansionSites`'s `considered` set is built from `isCityCenterTerrain`-legal candidates only (see caller chain in `ai-expansion-sites.ts`); the bonus cannot promote an illegal site because illegal sites never reach the scoring loop.
- **The bonus is miscalibrated (too small to matter, or so large it produces degenerate all-coastal expansion for every civ).** Bounded blast radius by design: the bonus only ever applies when `needsCoastalAccess` is true (civ has zero coastal cities today), so a civ that already has coastal access is entirely unaffected — this cannot produce empire-wide degenerate coastal-only expansion. Terra must empirically confirm the exact `+40` magnitude promotes a real coastal candidate into the top-3 shortlist for the new seed's actual site set (see Mechanism section) before finalizing it; if wrong, adjust with a measured comment, not a guess.
- **Civ acquires a coastal city some other way (conquest) before its own expand-plan resolves.** `civHasCoastalCity` is recomputed fresh every turn from live state, so the bonus stops applying automatically the next turn — no stale-state risk, no separate cleanup needed.

## Migration

None. No new persisted field, no `SAVE_VERSION` bump, no save-migration entry — every value used (`civHasCoastalCity`, the bonus) is derived fresh from existing `GameState` on every turn, identically to the pre-existing `coastalEmpire` pattern this design extends.

## UI/UX/SFX

None. This is a pure AI strategic-planning change; no player-facing UI, text, or audio is added, changed, or gated by it. A human player's expansion UI, city panel, and production queue are completely unaffected — `isCityCoastal`'s answer for any human city is bit-for-bit unchanged (see #386 constraint above).

## Non-goals (unchanged from the assignment)

Does not widen `isCityCoastal`; does not reintroduce #386; does not solve #1108; does not touch #1069/#1086/#1087/#1088/#1089/#1090/#1094; does not add hidden-world knowledge; does not alter naval-unit legality by difficulty; does not weaken any long-horizon detector or shorten the scenario's turn count/map size/challenge tier (only its RNG seed changes, for the documented reason above); does not special-case `ai-3` or any specific civ ID anywhere in production code.

## Performance

No new full-map BFS. The bonus check reuses `getKnownExpansionSites`'s *existing* per-candidate loop (already bounded by `EXPANSION_SEARCH_RADIUS`) — `isPositionCoastal` is a 7-tile check, called once per already-enumerated candidate, not a new search. `civHasCoastalCity` is an `O(cities)` scan of the civ's own (small) city roster, computed once per civ per turn, identical cost to the existing `coastalEmpire` pattern it replaces in `ai-research.ts`. No new perf-budget baseline change expected; Terra should still run the budget test and report the (expected-empty) diff, not skip it.

## Long-horizon acceptance

After the seed swap and mechanism land: `expansion-frozen` for the affected civ (`ai-1` under the new seed) must stop reproducing. `tech-frozen` must be reassessed — if the civ's economy recovers (population/science grow once it has 2 cities and eventually a transport), the entry should be deleted under the two-way ratchet; if some other stall appears, file a new focused issue rather than claiming #1107 incomplete for an unrelated reason. Run the full matrix (not just `lh-late-era-medium`) since `civHasCoastalCity`/the scoring bonus touches every scenario's expand logic generically — confirm no regression in scenarios where civs already have a coastal city (bonus never applies there, `needsCoastalAccess` is false) and no new stall in small-map/Explorer-tier scenarios.

## Mandatory design review

- **Balance:** No yield/cost/combat numbers change. The only new magnitude is the site-selection bonus, which is bounded to civs with zero coastal cities and cannot leak into ordinary expansion scoring for anyone else. Not subject to `.claude/rules/game-balance.md`'s wonder/national-project ceilings (this isn't a reward, it's an AI decision-scoring weight) — no finding.
- **Fun:** Fixes a real, player-visible-in-spectation AI incompetence (a civ visibly failing to ever build ships despite adjacent water) without removing any challenge — the civ still has to actually found/hold a legal coastal city. No finding.
- **Ages/play-styles:** No age-specific or archetype-specific behavior added; bonus magnitude is flat across personalities exactly as the non-goals require. No finding.
- **Difficulty:** Confirmed no difficulty-tier input anywhere in the new code path (`civHasCoastalCity`, the bonus, the wiring) — legality and magnitude are identical Explorer/Standard/Veteran, matching the assignment's "urgency may vary by difficulty, legality may not" instruction as "neither varies here." No finding.
- **AI usage:** Reuses #1064's existing expand/force-demand pattern with no new candidate type, no new plan-priority tier, no risk of exceeding `assertLegalChoices`' 12-candidate trace cap (still exactly one `expand` candidate per turn). No finding.
- **UI/UX:** None added; confirmed no player-facing surface touched. No finding.
- **Architecture/extensibility:** Two single-function additions to already-canonical owning files, one new parameter threaded through one existing call site — no new module, no new event, no new system boundary. Matches this codebase's `.claude/rules/game-balance.md`-style precedent of "extend the existing table/function, don't add a parallel path." No finding.
- **Data:** No new data files, no new catalog entries. The scenario-seed change adds one optional field (`mapSeed`) to `LongHorizonScenario` — additive, not breaking, and only the one row (`lh-late-era-medium`) sets it. No finding.
- **SFX:** None applicable. No finding.
- **Save/updates:** Confirmed no migration needed (see Migration section) — no finding.
- **Testing:** Plan (next section) requires positive coverage for the bonus, the extraction (zero behavior change for `isCityCoastal`'s existing test suite), `civHasCoastalCity`, the `mapSeed` field, and a long-horizon acceptance check against the new seed. Deferred to the implementation plan rather than finalized here, per this repo's TDD convention — no finding at the design stage.
- **Regressions:** The `isPositionCoastal` extraction is a pure refactor (identical logic, same order of checks, same wrap handling) — existing `isCityCoastal` tests must pass unmodified, which is itself the regression gate for #386. The `coastalEmpire`→`civHasCoastalCity` extraction in `ai-research.ts` is likewise pure (same civ/city iteration, same coastal check) — existing `ai-research.ts` tests must pass unmodified. No finding requiring a design change; Terra must still run both suites unmodified as verification, not just trust this claim.
- **Solo/hot-seat:** Confirmed the new code path never reads `currentPlayer` (see "Hot seat?" in the Q&A section above). No finding.
- **Implementation correctness (read-through of the plan below before finalizing):** The insertion point (before `.sort().slice(0, limit)`) is correct — verified by re-reading `getKnownExpansionSites`'s current structure, where `sites` is scored, then sorted, then sliced; a bonus added after slicing could never promote an item that didn't already make the cut. One thing to flag for Terra: `scoreNeighbourhood`'s return magnitude was read from `evaluateExpansionTarget`'s per-tile formula times a radius-2 (19-tile) neighborhood, but the *actual* range across real candidate sites should be measured directly (e.g. via a debug log over the new seed's real `ai-1` candidates) rather than assumed from the formula's theoretical bounds, since real terrain mixes rarely hit the formula's extremes. This is called out explicitly in the Failure modes section above as something Terra must confirm empirically, not a silent design gap.

No findings required a design change. The one action item (confirm `+40` empirically against real data before treating it as final) is carried into the implementation plan below as an explicit verification step, not left as a TODO.

## Follow-ups (filed, not solved here)

1. `trade-route-classification.ts`'s own un-fixed, `ownedTiles`-based `isCityCoastal` duplicate — a live #386-class bug in trade classification, unrelated to AI strategic planning.
2. `ai-3`'s original 10-tile-island shape in the pre-fix `lh-late-era-medium` seed — a landmass smaller than `MIN_CITY_CENTER_DISTANCE` can never grow a second city at all, coastal or not. Behaviorally identical to #1108; either fold into #1108's scope or file separately once #1108 is scoped.
