# Road & Post Network Administration Design

**Date:** 2026-09-03
**Issue:** #927, administration-ladder rung 2 only
**Base:** `21f6f9c40a3c459e2d03470017deed8be59a6af7` (`origin/main`)

## Goal

Make a distant province easier to govern when its civilization controls a continuous road connection from that city to its capital. The effect is a visible, bounded negative unrest row; it does not alter the canonical positive `Distance from capital` formula.

## Verified current behavior

- The distance row is axial `hexDistance`, not path distance: `min(20, max(0, (distance - 5) * 2))`. The capital has no distance row.
- `UNREST_RELIEF_SOURCES` already emits dedicated negative rows after positive rows. Courthouse relieves distance plus overextension with a combined residual floor of 2; Military Administration relieves only war weariness and recent conquest.
- `road-building` is Era 3. `military-logistics` is Era 4 (cost 235; requires `road-building` and `tactics`) and currently halves road movement cost.
- Roads are an optional `HexTile.hasRoad` overlay. Water cannot receive them. Pillage removes `hasRoad` immediately. Rail is a presentation state derived from road, tile owner, and `railway-expansion`, not separate persistent infrastructure.
- `getCitiesConnectedToCapital` is a deterministic, wrap-aware BFS over road tiles and same-owner city centers, bounded by map tiles. Its current callers accept any road tile rather than requiring its owner.
- A temporary `roadOwner` is cleared when construction completes; tile ownership is the only durable ownership fact. Roads can be built on neutral tiles, which remain `owner: null`.
- Existing deterministic AI logic routes at most one idle worker per civ per turn to the first missing link between capital and nearest disconnected city. AI research only recognizes building-keyed relief sources today.
- Roads and completed techs are persisted already. This effect can remain wholly derived, with no schema field or migration.

## Selected contract

### Connectivity

Reuse a parameterized form of the existing capital-road BFS, rather than create another route model. For administration only, a traversed road tile must have `hasRoad === true` and `tile.owner === city.owner`; own city centers are traversable nodes. The path starts at the owner’s capital and must reach the target city center. Adjacent own city centers may connect directly because roads cannot occupy city-center tiles; an intermediate own city center can join two qualifying road segments.

- The capital gets no relief.
- Foreign, allied, enemy, city-state, and neutral roads do not count.
- No treaty, Open Borders, or foreign-territory policy is introduced.
- A gap, pillage, ownership loss, ocean/coast gap, or disconnected island breaks the route immediately. Conversely, a road that changes territorial owner counts for its new owner: this is a current-territorial-control rule, not unavailable builder-history data.
- Wrapping uses the existing wrapped-neighbor helper. Neighbor order stays deterministic; no RNG, viewer state, DOM state, or persisted cache participates.

The existing default helper behavior remains unchanged for economy and current AI callers. The strict predicate is specific to administration, avoiding an accidental connected-city-gold change.

### Unlock and relief

`military-logistics` is the sole unlock. No technology, building, project, overlay, sound, or save field is added; its effect text will truthfully mention connected provincial administration.

For an unlocked, connected, non-capital city, emit `Road & Post Network` only when relief is positive:

```text
Distance from capital       +D       // unchanged canonical formula
Road & Post Network         -R
```

```text
candidate = round(0.35 * D)
roadOnlyCap = min(6, max(0, D - 4))
courthouseReserve = the existing Courthouse relief for the same positive rows, or 0
combinedSprawlReserve = max(0, (D + overextension) - 2 - courthouseReserve)
R = min(candidate, roadOnlyCap, combinedSprawlReserve)
```

`D` is the already-emitted positive distance amount. Relief never exceeds that row, leaves at least 4 distance pressure from roads alone, is capped at 6, and leaves at least 2 total distance-plus-overextension pressure when stacked with a Courthouse. It does not affect war, conquest, faith, espionage, contagion, or economy rows.

| Distance row | Road relief alone | Courthouse relief | Road relief with Courthouse | Combined relief | Remaining sprawl |
|---:|---:|---:|---:|---:|---:|
| 2 | 0 | 0 | 0 | 0 | 2 |
| 8 | 3 | 4 | 2 | 6 | 2 |
| 14 | 5 | 7 | 5 | 12 | 2 |
| 20 | 6 | 10 | 6 | 16 | 4 |

Roads represent reachability; Courthouses represent local administration. A connected wide empire still pays meaningful scale cost.

### Guidance and AI

The sprawl resolver uses only the city owner’s state:

1. A meaningfully distant city without the tech gets a research-first Military Logistics recommendation only when `road-building` and `tactics` are complete, so it is currently available research.
2. A city with the tech but no qualifying route gets a now-available instruction to connect it to the capital with roads.
3. A connected city does not repeat that advice, allowing Courthouse or another real lever to surface.

Copy remains in `unrest-guidance-copy.ts`; systems return typed recommendations only. The recommendation must not imply connection over water or foreign land.

`UnrestReliefSource` gains minimal generic metadata for a tech-gated, infrastructure-derived source: an optional `buildingId` identifies production-scored sources and an optional `researchUnlockTechId` identifies a direct tech unlock. Source `id` stays an identity key, never an implicit building id. Building-only consumers (AI production and reference-economy exclusions) use `buildingId`; generic AI research recognizes either a candidate tech's `unlocksBuildings` containing `buildingId` or an exact `researchUnlockTechId` match. AI research scores the declared tech only when the AI has sufficiently pressured, distant, disconnected own cities. There is no `military-logistics` ID branch, `currentPlayer` use, AI-only relief, or difficulty exception. Existing road-building gives the AI the same legal path to benefit; its existing target selection remains unchanged unless a focused parity test proves it cannot complete an owned-territory chain.

### Evaluation lifetime and performance

Add a nonserialized `UnrestEvaluationContext` created at the start of one render, faction-turn, or AI-planning pass. It lazily stores one strict connected-city set per civ for that exact pass. `getUnrestPressureBreakdown`, `computeUnrestPressure`, and guidance helpers accept the optional context; callers that evaluate several cities create and pass one context. The city overview shares it across sorting and top-lever rows, faction turn shares it across its city loop, and AI research shares it across its pressure scan. A single standalone call may create its own short-lived context.

The context contains only a derived `Map<civId, Set<cityId>>`; it is never serialized or reused after a state transition. The relief calculation remains read-only. Courthouse relief is extracted into one shared helper used by both the Courthouse source and the road source, so their combined-floor calculation cannot copy and drift from the existing Courthouse formula.

## Inline design review

| Dimension | Review outcome and guardrail |
|---|---|
| Gameplay balance | 35%, cap 6, a 4-point road-only floor, and a 2-point combined-sprawl floor make relief visible without deleting distance or replacing Courthouses. |
| Fun / new mechanics | Roads gain an obvious second purpose: connect remote cities. Players see both pressure and relief rather than a hidden discounted distance. |
| Ages 7–43 | “Road & Post Network” and “connect this city to your capital with roads” are plain-language explanations. |
| Play styles | Builders invest worker turns in a wide-empire plan; tall empires gain no blanket bonus; conquerors must secure and connect new land. |
| Difficulty modes | Eligibility and formula do not read challenge profile: Explorer, Standard, and Veteran are identical. |
| Computer players | Existing deterministic road planning is shared and owner-scoped. Research valuation uses typed generic metadata, not a cheat or one-off strategy; focused parity tests decide whether its existing owned-territory behavior needs a narrow adjustment. |
| UI / UX | Existing breakdown and guidance surfaces suffice. Zero relief is hidden; advice stops after connection. No new management UI is needed. |
| Architecture / extensibility | Parameterizing the existing BFS prevents parallel routing. Later rail/telegraph rungs can add metadata/formulas without rewriting distance pressure. |
| Data / saves | Derived from existing city ownership, techs, and tiles. No schema version change, cache, or stale state. Legacy missing roads are disconnected. |
| SFX | Existing road-completion feedback remains accurate; a passive calculation needs no new sound. |
| Solo / hot seat | The owner is always `city.owner`; rival roads and techs cannot grant relief or leak through guidance. |
| Performance | BFS is O(map tiles), deterministic, and bounded. A fresh, nonserialized pass context shares one derived connectivity result per civ, preventing city×BFS work without a stale global cache. |
| Scope | No second capital, threshold change, rail/telegraph relief, federalism, governors, naval/air logistics, Open Borders, or diplomacy policy. |

## Required tests

- Preserve the base formula. Prove no tech/no connection means no row; connected owned route gives one distance-only negative row; cap, floors, and no duplicate row hold.
- Cover complete chain, missing link, fragments, foreign/neutral/enemy roads, water gap, island, wrap edge, repeated determinism, pillage, and ownership loss.
- Prove Courthouse stacking keeps residual sprawl and Military Administration remains independent.
- Cover currently-available pre-unlock research guidance, locked-prerequisite non-recommendation, post-unlock connection guidance, connected non-repetition, and Courthouse fallback.
- Prove AI receives relief only from own connected roads, wide pressure values the unlock more than compact state, and difficulty legality is invariant.
- Prove hot-seat isolation and handoff guidance; save round-trip and legacy absent-road state derive correctly without a schema change.
- Add bounded traversal/call-sharing coverage for multi-city pressure evaluation, plus metadata coverage proving infrastructure sources never enter building-only production or pacing paths.

## Adversarial review findings and resolutions

1. **Low-distance calculation:** an earlier table incorrectly gave a Courthouse one point of relief at a distance row of 2 with no overextension. The existing residual-floor formula correctly yields zero. The table is corrected above.
2. **Source identity versus building identity:** using a tech-only source id as though it were a building id would make production and reference-economy consumers semantically wrong. Optional typed `buildingId` and `researchUnlockTechId` metadata resolve this without an ID-specific AI branch.
3. **Recommendation truthfulness:** “plausible” research was not a testable boundary. The design now recommends Military Logistics only when both prerequisites are complete and it is available now; otherwise existing actionable levers remain available.
4. **Render/AI cost:** a bare BFS in each breakdown would make overview sorting, guidance, faction turns, and AI research multiply map traversal by city count. A pass-scoped derived context gives deterministic, immediate recomputation after state changes without persisting or globally caching mutable state.
5. **Courthouse formula drift:** computing the same formula twice would silently invalidate the combined floor after later balance work. A single shared Courthouse-relief helper is required.
6. **Territory capture semantics:** road-builder ownership is not persisted. The selected rule therefore deliberately follows current tile ownership, including after territorial transfer; tests will make that visible rather than inventing save data.

## Balance inventory

Update `.claude/rules/game-balance.md` with the unlock, target row, exact formula, cap, both floors, Courthouse behavior, owned-territory road policy, AI parity, difficulty invariance, and the requirement to emit a negative row rather than rewrite distance pressure.
