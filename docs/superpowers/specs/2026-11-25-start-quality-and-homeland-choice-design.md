# Start Quality Model and Homeland Choice — Design

Status: approved by the owner (2026-11-25) after a critical review. Approach **B, then C**.

## Why

A fresh solo game (Earth map, large, Balanced placement, 8 civilizations, Rome) started the player's settler
on a one-tile tundra island in the Arctic. The owner's reaction: "We did a lot of work so this should no longer be
possible." It was possible because that work (#1453 viability, #1692 fertility) fixed one placer at a time, and the
game has five.

The primary player loved Civ 1–5. For her, a start is the first impression of every game: it has to be **trustworthy**
(never a dead start), **different every time** (replayability), and ideally **hers** (a choice, not a dice roll).
Fairness matters, but a varied, flavourful start matters more than identical starts.

## What is true today (audit, 2026-11-25, ~1,100 generated games)

Root causes:

1. **No single definition of a good start.** Five placers, each with its own predicate:
   - `findStartPositions` (`map-generator.ts`; procedural, balanced, single-continent): ≥10 land tiles within 2,
     skips rows ≤3 / ≥h−4, viability, food floor.
   - `placeCivilizationStarts` balanced (`start-placement-system.ts`; Earth / Old World / New World): valid tile +
     viability only.
   - `placeHistorical` (same file): exact anchors accepted if the tile is not water/mountain/snow/volcanic; fallback is
     "farthest from everyone".
   - `scripts/generate-earth-maps.ts`: snaps an anchor only off `ocean`/`mountain`, so it accepts `coast` (water).
   - `placeMinorCivs` (`minor-civ-system.ts`): not impassable, spacing, food floor.
2. **The geographic "balanced" objective is wrong.** `selectBalancedSites` maximises the minimum separation and uses
   quality only as a tie-break. On a real-world map the most remote land is islands, poles and corners.
3. **Water reads as good land.** Coast is 2 food / 1 gold, the best base yield in the game. The #1692 food floor and the
   #1453 sea-route viability clause both pass a start ringed by water (the islet scored food 12, floor 9; #1692 G3's
   city-state floor was defeated the same way). Nothing measures production or expansion room on the start's own land.
4. **No outcome test.** Tests check predicates, never the distribution of start quality across modes.

Same-class bugs found:

| Bug | Evidence |
|---|---|
| Old/New World True Start anchors are water | 32/42 anchors are `coast`; no tests for those tables; True Start silently falls back to remote corners |
| One/two-tile island major starts | Earth small (Atlantis every game), Earth large, New World small (12/36) and large (24/96) |
| Earth anchors on barren desert | 14/29 small, 9/29 medium score 0–3 land food+production; the existing test asks for 2 workable neighbours |
| City-states on islets | Earth small True Start 17/17; single-continent small 13/54. City-states build land units only (#952) |
| Barren geographic starts | Earth large: a food-2 desert start; fairness spread 11.4 (generated maps ≈2) |
| No variety on geographic maps | Same 8 sites every game; Zulu on 45,55 in 60/60 seeds |
| "Balanced" names both a map type and a placement mode | Misled the owner when reporting this bug |

## How other 4X games handle it (and how it went)

- **Civ V** divides land into regions of equal fertility, places one civ per region, then normalises weak starts
  (adds food/strategic resources). Civ start biases (coast, river, tundra) are soft weights. Modders still report the
  fallback accepting starts that fail its own checks.
- **Civ VI** base starts were unfair enough that competitive players built Better Balanced Starts, which generates
  several maps and keeps the fairest. Its True Start Earth drew complaints about forced tundra and European crowding.
- **Civ VII** explicitly adjusts real-world homelands so shared True Start regions still get a reasonable antiquity
  start.
- **Humankind / Old World** (from memory, not verified here) let the player see the land and choose where to found;
  players responded better to agency than to any fairness algorithm.

Lesson: **a hard floor that is never broken, then fairness, then variety, then let the player react.** Pure
separation-maximising and pure exact-history were the worst received.

## Goals

- One start-quality model, used by **every** major-civ and city-state placer, every map script and placement mode,
  solo and hot seat.
- A hard floor no start ever breaks.
- Separation is a constraint, not the objective.
- Real variety from the seed, controlled by a player-facing **Start style** setting.
- True Start keeps its historical flavour while landing on livable land.
- A permanent outcome test across every mode, so a new placer cannot drift.
- Phase C: the player chooses their homeland from a few good options.

## Non-goals

- Rebalancing terrain yields (coast being 2F/1G is a balance question; the model simply does not count water as land).
- Changing city-founding legality (`canFoundCityAt`) or the minimum city distance.
- Re-rolling or editing existing saves. Placement runs only at creation; saves need no migration.
- AI choosing among homelands (AI keeps the placer's pick).

## Anti-goals (would be failure even if it "works")

- Identical, sterile starts. "Fair" must not become "the same every game".
- Any start, major or city-state, on a landmass too small to grow, at a pole, or with no land production.
- A True Start that is true to history but unplayable.
- Silent fallbacks: if the floor cannot be met, the existing typed failure / map retry fires, never an invalid start.
- Phase C leaking hidden information (rival positions, unexplored map) through the choice UI.

## Constraints

- Determinism (`game-systems.md`): same seed ⇒ same map and starts. Map generation stays seeded from the campaign seed
  string (it runs before `gameId` exists). New draws use their own derived stream (`createRng(seed + '-start-placement')`)
  so no other generation stream moves.
- Both game creators place starts: `createNewGame` and `createHotSeatGame` (`game-state.ts`). Every change applies to
  both; the outcome matrix covers both.
- Every placement change moves every seed's starts. Fixtures and goldens built from `createNewGame` /
  `createHotSeatGame` (round-phase digests, determinism fixtures, long-horizon seeds, scenario fixtures, perf goldens)
  are regenerated deliberately, with a written justification in the PR, per each fixture's own rules.
- Saves: placement runs only at creation, so existing saves never change. Every new persisted field is optional with a
  default reader (`ADDITIVE_WITHOUT_MIGRATION`), proven by a load-and-process test, and classified in
  `ELIMINATED_CIV_AREAS`, the new-game completeness ratchet and the persisted-shape ratchet.
- Game creation time: placement on a large map stays within a measured budget (target under 1 s added on the dev
  host); the selection routine is bounded (fixed number of sampled solutions, candidate pools capped).
- Geographic data regeneration goes through `yarn generate-maps` only.

## Approaches considered

- **A. Patch the gaps** — copy the generated-map filters into the geographic and city-state placers, fix the anchor
  snap. Cheap, but keeps five definitions and adds no variety. Rejected: the next placer drifts again.
- **B. One start-quality model used everywhere** (chosen first) — a scored assessment, a hard floor, separation as a
  constraint, sampled near-best solutions for variety, Start style setting, fixed anchors, outcome tests.
- **C. B plus player agency** (chosen second) — homeland choice on turn 1, from sites reserved at creation. Depends on
  B's scoring and selection.

A "re-roll my start" button was considered for C and rejected: it regenerates the whole world (or breaks every
start-relative placement), only replaces one random start with another, and in hot seat changes everyone's game.

## Phase B design

### B1. `start-quality.ts` — the one assessment

A pure leaf module (no `GameState`; structural map input like `start-fertility.ts`), built once per map with flat
arrays like `start-viability.ts`, reusing the viability index for landmass labels and legal city sites.
`assessStartSite(coord)` returns a typed record:

- `landmassTiles`, `expansionSites` (legal second-city sites at ≥ `MIN_CITY_CENTER_DISTANCE` on the *same* landmass)
- `landTilesR2` (non-water tiles within 2)
- `landFood6`, `landProduction6` — best six *land* tiles within 2 by base terrain yield (`TERRAIN_YIELDS`); water is
  excluded, so a ring of coast no longer scores as farmland
- `frozenShare` — share of land within 2 that is tundra or snow
- `polarBand` — only on geographic maps: the tile lies beyond the script's latitude cut-off (derived from the
  generator's bounds, e.g. |lat| > 62°). Generated maps keep their existing row exclusion and rely on `frozenShare`,
  because their rows are not latitudes and a row band would delete good temperate land (the audit flagged ~35% of
  generated medium/large starts in the outer rows, nearly all on plains/grassland)
- `freshWater` (river on or adjacent), `coastal`, `resourceCount` within 3
- `score` — one number from a single documented weight table
- `floorFailures` — typed reasons the site fails its floor (empty = passes)

**Floors** (one table, two rows; numbers provisional — see acceptance below):

| Floor | Major-civ start | City-state |
|---|---|---|
| Land within 2 | ≥ 8 | ≥ 6 |
| Land food (best 6) | ≥ 6 | ≥ 5 |
| Land production (best 6) | ≥ 3 | ≥ 2 |
| Frozen share | < 50% | < 50% |
| Geographic polar band | not allowed | not allowed |
| Same-landmass expansion sites | ≥ 2 | — (city-states do not expand) |

The #1453 sea-route clause no longer makes a *start* acceptable (an islet passed it); viability remains the in-game
definition used elsewhere. `isFertileStart` is superseded as a start gate by the floor.

**Acceptance for the numbers:** with the floor in place, the outcome matrix must show (a) zero violations, (b) a
generated-map creation failure rate of 0 across its seeds after `generateMapWithStarts`' retries, and (c) geographic
capacity (B2) no lower than today's supported opponent counts on medium/large Earth and Old World. If a number breaks
(b) or (c), tune it in the table and record why; never special-case a map.

### B2. Placement: floor, then constraints, then sampled near-best

One selection routine (`start-site-selection.ts`) used by `findStartPositions` and `placeCivilizationStarts`
(balanced/"Anywhere" mode and True Start fallbacks):

1. Candidates = tiles passing the major-civ floor (and, for single-continent, the continent set), capped to the top
   M by score with seeded tie-noise.
2. Hard constraints: separation `≥ MIN_MAJOR_CIV_START_DISTANCE` between free-placed starts; **any two starts in any
   mode ≥ `MIN_CITY_CENTER_DISTANCE`** so every civ can found its capital (True Start may be close, never illegal).
3. Objective: maximise the **weakest start's score**, then the total; separation beyond the minimum is a small bonus,
   never the main term.
4. Run K seeded randomised greedy passes (first pick drawn from the top candidates, each next pick the best
   candidate under the constraints with seeded noise), keep the solutions inside the Start style's quality band of the
   best, and draw one with the placement stream.
5. If no solution exists: generated scripts throw the typed `StartPlacementError` so `generateMapWithStarts` tries the
   next derived map; geographic scripts return `insufficient-separated-sites`. The floor is never relaxed silently.

**Assignment** of civs to the chosen sites stays a separate step (`assignBalancedSites` today): historical anchor
distance on geographic maps, plus civ preference bonuses (B3). Preferences never affect the floor.

**Geographic capacity (my call).** A real-world map at a given size holds a fixed number of floor-passing, separated
sites (terrain is fixed, so this is seed-independent). The setup screens cap the opponent count for each geographic
script × size in "Anywhere" mode at that capacity, with a one-line note ("New World (small) fits up to N
civilizations"). The capacity table is generated by a script, committed, and pinned by a test that recomputes it.
True Start is capped the same way when its fallbacks need free sites.

### B3. Start style setting

`GameSettings.startStyle?: 'fair' | 'varied' | 'wild'`. Absent reads as `'varied'` (old saves and solo default).
Hot seat setup defaults to **Fair** (family members competing on one device). Chosen at creation only.

| Style | Which solutions qualify | Civ preferences | Normalisation |
|---|---|---|---|
| Fair | weakest-start score within ~5% of the best solution | weak | weakest starts topped up toward the median score with a bonus food/production resource, through the existing `guaranteePlaceResource` path and its own seeded stream |
| Varied | within ~15% | normal | today's luxury/strategic guarantee |
| Wild | any solution meeting the floor and constraints, drawn uniformly | strong | today's guarantee only |

The floor and constraints are identical in every style. Difficulty never changes placement. "Wild" is honest about
what it is: wider variance and stronger flavour above a guaranteed floor, not a promise of spectacular starts.

**Civ preferences:** optional data on civ definitions (`startPreferences?: Array<'coastal' | 'river' | 'hills' |
'forest' | 'frozen-tolerant' | 'desert-tolerant'>`), applied as assignment bonuses scaled by style. Start with obvious
ones (Vikings coastal, Egypt river, Russia frozen-tolerant); tolerant tags only reduce the score penalty, they never
lift a site over the floor.

### B4. True Start (historical) and the anchor tables

- `generate-earth-maps.ts` snaps each homeland to the best-scoring floor-passing land tile within radius 3 of its
  lat/lon point (same assessment, imported from the leaf), keeps anchors distinct and ≥ `MIN_CITY_CENTER_DISTANCE`
  apart, and fails generation loudly when a homeland has no passing tile (no silent skip, no coast tiles). Regenerate
  all three scripts.
- Runtime `placeHistorical` re-checks each anchor against the floor; a failing or missing anchor is placed by B2
  relative to the placed anchors (not "farthest from everyone").
- Fantasy civs without a real homeland (e.g. Atlantis) get no anchor unless one passes the floor; B2 places them.
- Tests for all three tables: floor, distinctness, capital-founding distance (replacing the Earth-only weak test).

### B5. City-states

`placeMinorCivs` uses the same assessment with the city-state floor; spacing rules unchanged. With Phase C, it also
keeps clear of every reserved homeland (C2).

### B6. Naming

The geographic placement modes become **"Anywhere"** and **"Homelands (True Start)"** in setup copy, removing the clash
with the "Balanced" map type. The internal `'balanced'` enum value stays (no save change).

### B7. Tests

- `start-quality.test.ts`: each floor reason with an earned control (the reported islet, a polar-band site, a frozen
  site, a barren desert, a coast-ringed site that the old food floor accepted).
- **Outcome matrix**: every map script × size × placement mode × start style, solo and hot seat, fixed seeds. Asserts
  zero floor violations for majors and city-states, the capital-founding distance, a fairness-spread ceiling per style,
  and a variety floor (distinct site sets across seeds on geographic maps). It starts as a two-way ratchet (known
  violations listed, each must still reproduce until fixed) so PR 1 can land before the placers change, and ends empty.
  Expected runtime ~2–3 min, so it belongs to the intensive local selection and one CI shard.
- Regression pins: seed `game-160716449`, Earth/large/balanced/8 civs, Rome; Zulu no longer fixed on 45,55.
- Capacity table test (B2).

### B8. Rules and docs

Update `game-systems.md` ("Minimum viable start", "Start fertility and placement retry") to name `start-quality.ts`
as the single definition and the outcome matrix as its enforcer; correct the line saying the geographic placer is
unchanged. Add an architecture rule: only the placers (and the map generator script) import the selection routine and
floor.

## Phase C design: choose your homeland

### C1. What the player sees

On a human's first turn, before their first city exists, a **Homeland** panel offers up to **three** starts: the
placer's own pick (preselected, so ignoring the panel costs nothing) plus up to two alternates. Each option shows only
settler-level knowledge: a character label ("River valley", "Coastal plain", "Forest hills"), a short line of what is
near (fresh water, coast, hills), and a yields band. Selecting an option previews its radius-2 patch on the map.
Confirming moves the settler and warrior there; founding a city or ending the turn confirms the current selection.

### C2. Homelands are reserved at creation

Several creation steps are start-relative (`guaranteeStartResources`, `placeWonders`, `placeLateResources`,
`placeVillages`, `placeBeastLairs`, barbarian camps, `placeMinorCivs`). Moving a settler afterwards would break all of
them. So:

- B2 selects each human's alternates at creation, as extra sites that satisfy every constraint against every other
  start and every other reserved site (all combinations of choices stay legal).
- Every start-relative step receives the full reserved list (all humans' options plus AI starts): each option gets its
  guaranteed luxury/strategic, and camps, lairs, villages and city-states keep their distances from every option.
- When the map cannot hold alternates without breaking a constraint or the floor, a human gets fewer options (down to
  just the placer's pick). AI starts are never weakened to make room.
- Alternates differ in character, not just location (picked to cover distinct labels where possible).

### C3. State, privacy, hot seat

- Persisted: `Civilization.homelandChoice?: { options: HexCoord[]; selected: number }`, written at creation for each
  human with more than one option, cleared on confirmation. Optional and additive (see Constraints); a save/reload
  mid-choice shows the same options.
- Only the owning seat sees its options (`state.currentPlayer`); the panel is a `PANEL_REGISTRY` entry so the hot-seat
  handoff teardown removes it; the viewer-safety harness covers it.
- Preview patches stay explored after the choice (deterministic and harmless: every option is ≥ the major-civ
  separation from other starts, so a radius-2 patch cannot reveal a rival start).
- The tutorial's first prompt ("Select a Settler and choose Found City") waits until the homeland is confirmed.
- AI never chooses; its starts are the placer's pick.
- Setting: "Choose homeland on turn 1" (`GameSettings.homelandPicker?: 'on' | 'off'`, absent = on), at creation.

## Calls made in this document (owner to check)

- Default start style: **Varied** for solo, **Fair** for hot seat; **Wild** is opt-in.
- One floor for every civ and mode, including True Start (homelands snap to livable land within 3 tiles).
- Geographic maps cap the opponent count at measured capacity instead of failing at Start.
- Phase C offers up to **three** homelands, on by default, solo and hot seat, reserved at creation; AI does not choose.
- Placement modes renamed "Anywhere" / "Homelands (True Start)".

## Left to the builder

- Exact floor numbers and score weights, within the acceptance rules in B1.
- K, M and the band widths, within the creation-time budget.
- Latitude cut-off per geographic script.
- Preference tags per civ (data only).
- Homeland panel layout (`ui-panels.md`, `createGameButton()`), character-label rules.
- How fixture/golden regeneration is split across PRs.

## Delivery order (incremental, each PR playable)

1. `start-quality.ts`, floors, outcome matrix as a ratchet; city-state floor.
2. Shared selection routine for generated and geographic placers; capital-distance constraint; the reported seed
   fixed; capacity table and setup caps.
3. Anchor generator fix, regenerated tables, anchor tests, runtime anchor re-check.
4. Start style setting, normalisation, civ preferences, placement-mode rename.
5. Phase C: reserved homelands through every start-relative step, then the Homeland panel.

## Review log

Critical review on 2026-11-25 changed the first draft:

- Phase C originally moved the settler after start-relative placement (resources, wonders, camps, lairs, villages,
  city-states), which would have broken their guarantees. Homelands are now reserved at creation (C2).
- A row-based polar band would have removed ~35% of good temperate generated starts; polar is now latitude-based on
  geographic maps and terrain-based (`frozenShare`) everywhere.
- Added the capital-founding distance as a hard constraint for every mode, including True Start snapping.
- One expansion site was too weak (a 5-tile island passes); raised to two. City-states got their own floor row
  without an expansion requirement.
- Floor numbers were bare guesses; added acceptance rules (no creation failures, no capacity regression).
- Named `createHotSeatGame` explicitly; added persisted-field obligations (eliminated-civ areas, ratchets).
- Added a creation-time budget and bounded the selection routine.
- Hot seat now defaults to Fair; "Wild" defined honestly.
- Recorded why a re-roll button was rejected for Phase C.
