# Game Balance Rules

Living reference for yield ceilings, movement stacking policy, and national project invariants. Tests in `tests/systems/national-project-balance.test.ts` and `tests/systems/wonder-definitions.test.ts` enforce these mechanically.

## Wonder Reward Ceilings

- `civYieldBonus` (empire-wide): any single yield key ≤ +6. No single key may exceed +6 at any era.
- `cityYieldBonus` (host city only): any single yield key ≤ +4.
- At most **2 keys** per yield bonus object.
- **No per-city or per-route scaling** (e.g., "+2 gold per coastal city" or "+1 gold per trade route") unless the wonder is in the allowlist below with a documented justification.

**Per-city/per-route wonder allowlist:** *(empty — add entries here with justification if a future wonder requires scaling)*

## National Project Reward Ceilings

National projects have stricter rules than wonders because every civ can build them (not first-come-first-served globally).

- Prefer a **single yield type** in `civYieldBonus`.
- If two yield types are used, **neither key may exceed +3**.
- `civYieldBonus` total (sum of all keys) must not exceed the era-scaled ceiling:
  - Era 1–2: ≤ 2
  - Era 3–4: ≤ 5
  - Era 5–6: ≤ 7
  - Era 7+: ≤ 9
- **No `cityYieldBonus`** on national projects — effects must be empire-wide.
- **No per-city or per-route scaling** unless in the allowlist below.
- National projects must have `uniquePerEmpire: true`.
- `nationalProject.homeEra` must be in range 1–12.

**Per-city/per-route national project allowlist:**
- `grand_bazaar` (era 2): "+1 gold per city" — justified because empire size is naturally ≤ 4 cities at era 2, capping actual gain at +4 gold.
- `colonial_administration` (era 6): "+2 gold per city beyond your 4th" — thematically rewards colonial expansion; self-limiting because additional cities require production investment; maximum ~+12 gold (10 cities × 2) but duration limited to 3 eras with fade.

## Movement Bonus Stacking Policy

Movement bonuses are the most easily broken stat — small integers stack to produce scout-speed armies. Before adding any movement bonus (to a tech, building, wonder, or national project):

1. List every currently active source of movement bonus for the same unit class.
2. Confirm the total stacked bonus for any unit in any single era does not exceed +2 movement from empire-wide sources.
3. Document the stacking analysis in a comment on the definition.

**Current movement bonus inventory** (update this table when adding new bonuses):

| Source | Type | Applies to | Bonus | Era active |
|---|---|---|---|---|
| `trade-winds` tech | tech | naval units | +1 move | era 6+ |
| Navigator's Compass wonder | wonder (special) | naval units | +1 move | era 5+ (permanent) |
| Road Corps national project | national project | — | (road construction speed, no movement) | era 3–5 |
| National Railway national project | national project | — | (trade route gold, no movement) | era 7–9 |
| `military-logistics` tech | tech | all land units | road entry cost 1 → 0.5 (not additive +N) | era 4+ |
| `railway-expansion` tech | tech | all land units | road entry cost 1 → 0.5 (not additive +N; does not stack with Military Logistics) | era 7+ |
| `gps-navigation` tech | tech | land units in own territory | ignores hills/forest extra cost (terrain cost 1) | era 12+ |

**Roads discount, they don't stack:** entering a `hasRoad` tile always costs 1 movement, or 0.5 if the moving unit's owner has `military-logistics` **or** `railway-expansion` — never both at once (0.5 is the floor, not 0.25). See `tests/systems/road-system.test.ts` for the explicit no-stack regression.

**Why Road Corps and National Railway don't grant movement:** early drafts gave both +1 road movement, which stacked to +2 on roads for an era 3–8 overlap window. Both were revised to non-movement effects to respect this policy.

## Happiness Inventory

Happiness reduces unrest pressure at 2 pressure per point
(`computeUnrestPressure` / `getUnrestPressureBreakdown` in
`faction-system.ts`). Unlike yields, happiness has no MR12-style ceiling rule
of its own yet — this table exists so future additions stay legible and
proportionate to what's already here.

| Source | Scope | Amount | Era active |
|---|---|---|---|
| Temple building | city | +1 | era 3+ (`philosophy`) |
| Amphitheater building | city | +1 | era 4+ (`drama-poetry`) |
| Monastery building | city | +1 | era 5+ (`monastic-orders`) |
| Concert Hall building | city | +1 | era 6+ (`baroque-music`) |
| Luxury resources (each type owned) | empire | +1 each | varies by resource |
| Beast-slayer's feast (Hunt crisis reward) | empire | +2 | temporary, 5 turns |
| Religious serenity (Serenity boon) | city (own-faith followers only) | +1 | era 3+ (Sacred Council + serenity boon chosen) |

**Rule:** any new happiness source (building, wonder, tech, resource) must add
a row here and stay at +1 per single source unless a documented gameplay
reason requires more (matching the spirit of the wonder/national-project yield
ceilings above, applied to happiness).

## Unrest Relief Inventory

Distance-from-capital and empire-overextension unrest pressure
(`getUnrestPressureBreakdown` in `faction-system.ts`) are deliberate,
permanent pressures — a wide empire is *meant* to feel scale. Every era where
they bite gets a **bought, deliberate** counter: the administration ladder
(#919). Each counter emits its own negative breakdown row via an entry in
`UNREST_RELIEF_SOURCES`; it never edits the positive-row formulas in place.

| Source | Building id | Rows it relieves | Formula (per city) | Era active |
|---|---|---|---|---|
| Courthouse | `courthouse` | Distance from capital, Empire overextension | `relief = min( round(0.5·distRow) + min(3, overextRow),  max(0, (distRow + overextRow) − 2) )` | era 2+ (`magistracy`) |
| Military Administration | `military-administration` | War weariness, Recent conquest | `relief = min(8, max(0, warRow − 4)) + min(10, max(0, conquestRow − 8))`; combined relief is at most `18` | era 3+ (`civil-service`) |
| Road & Post Network | — | Distance from capital | For an owned-road connection to the capital: `min(round(0.35·D), 6, max(0, D−4), max(0, D+O−2−courthouseRelief))` | era 4+ (`military-logistics`) |
| Regional Capital | `regional_capital` | Distance from capital | For one completed owner-held non-capital seat: `min(D−nearestSeatPressure, 10, max(0, D+O−2−courthouseRelief−roadPostRelief))` | era 4+ (`political-philosophy`) |
| Bureaucracy | — | Empire overextension | Recompute overextension with `OVEREXTENSION_FREE_CITIES + 3`: `raw = O − hypotheticalO`; `relief = min(raw, 9, max(0, D+O−2−courthouseRelief−roadPostRelief−regionalCapitalRelief))` | era 5–6+ (`separation-of-powers`) |
| Railway Administration | — | Distance from capital | Requires Road & Post Network already active (`military-logistics` + owned-road connection) plus `railway-expansion`: `relief = min(round(0.2·D), 4, max(0, D+O−2−courthouseRelief−roadPostRelief−regionalCapitalRelief−bureaucracyRelief))` | era 7+ (`railway-expansion`) |

**Rule:** any new distance / overextension / unrest-relief source — a future
ladder rung (roads-cut-distance, second seat of government, civil-service
bureaucracy, federalism, governors) or anything else — MUST:

1. add a row to this table, and
2. register an `UnrestReliefSource` entry in `UNREST_RELIEF_SOURCES`
   (`src/systems/faction-system.ts`), keyed to `buildingId` or
   `researchUnlockTechId` so AI production/research score it generically.

It must keep a **residual floor** (the `COURTHOUSE_SPRAWL_FLOOR` pattern —
scale always costs something) and must **never relieve more sprawl than the
city actually has**. The AI production valuation
(`unrestReliefScore` in `src/ai/ai-production.ts`) and the AI research pull
(`unrestReliefTechBonus` in `src/ai/ai-research.ts`) both key off this table,
so a new entry is valued automatically.

Road & Post Network accepts only continuous completed road tiles currently
owned by the city owner (plus own city centers); foreign, allied, neutral, and
water gaps never count. It is difficulty-invariant, owner-scoped for hot seat,
derived from existing roads/techs without a save migration, and emits its own
negative row rather than altering the base distance formula. `D` is the
positive distance row and `O` the positive overextension row; the final terms
keep at least 4 distance pressure from roads alone and at least 2 total sprawl
pressure when stacked with a Courthouse.

Regional Capital uses the same direct axial distance as the base row, not roads or
pathfinding. It is one permanent milestone national project per empire and cannot
be placed in the true capital. Courthouse, Road & Post, then Regional Capital are
evaluated in that order, preserving at least two total sprawl pressure. Capturing
or razing its host removes the former owner's project record and building; a captor
does not inherit it and the former owner can rebuild if normally eligible. The
formula is owner-scoped, difficulty-invariant, and has no save migration.

## Unrest Instant-Action Costs (Appease vs Concede)

Two gold-only instant actions clear/suppress a city's unrest
(`src/systems/faction-system.ts`). They must stay a **real choice** — neither
strictly dominates:

| Action | Cost | Immediate effect | Persistent effect | Repeat limit |
|---|---|---|---|---|
| Appease (`appeaseFaction`) | `getCityAppeaseCost` = `population × 15` | partial: `-2` unrest turns, revolt→unrest, clears spy pressure — does **not** clear unrest | none | once per city per turn |
| Concede (`concedeToMovement`) | `getConcessionCost` = `population × 15 × CONCESSION_COST_MULTIPLIER` (2), or `× CONCESSION_COST_MULTIPLIER_CIVICS` (1.5) with a current-era civics-track tech | full clear | `CONCESSION_IMMUNITY_TURNS` (15) of no new unrest, incl. contagion spread | none |

**Invariant (#918):** `getConcessionCost(state, city) > getCityAppeaseCost(city)`
for every city size, discounted or not. `CONCESSION_COST_MULTIPLIER_CIVICS` MUST
stay `> 1` — collapsing the civics discount to `1` (exact parity with Appease)
makes Concede strictly dominate and removes the decision. Enforced by
`tests/systems/faction-system.test.ts` → "never costs the same as or less than
Appease for any city size, discounted or not (#918)".

**Difficulty / AI:** both costs and both effects are identical across Explorer /
Standard / Veteran — no challenge-profile input to either cost helper (the
challenge profile scales unrest *pressure* only, not action cost). The AI uses
`appeaseFaction` via the shared helper and does not concede; that is intentional
(a bot cannot value the 15-turn immunity payoff) and stays rational as long as
the invariant above holds.

## Minor-Civ Economy (#950)

Every minor-civ (city-state) economy balance knob lived only in code until now —
`MINOR_CIV_ECONOMY_TUNING` and its siblings in `src/systems/minor-civ-economy-system.ts` and
`src/systems/minor-civ-coalition-system.ts`, predating this file's wonder/national-project/
unrest-relief documentation convention. This section is the umbrella for all of it; the three
sections immediately below it (Population Ceiling #948, Era Advancement #948, Emergency Levy #951)
cover their own topics in full detail and are cross-referenced here rather than duplicated.

**Rule:** any new minor-civ economy knob (a cap, multiplier, interval, cost, cooldown, or
threshold) must add a row to one of the tables in this section or one of the three sections below
it, the same convention as the wonder/national-project/unrest-relief inventories elsewhere in this
file.

### Production multiplier, queue interval, retry limits (`MINOR_CIV_ECONOMY_TUNING`)

| Challenge | Production multiplier | Queue decision interval (turns) | Recovery turns | Pending-spawn max attempts |
|---|---:|---:|---:|---:|
| Explorer | 0.75 | 5 | 8 | 3 |
| Standard | 1.00 | 4 | 6 | 3 |
| Veteran | 1.15 | 3 | 5 | 4 |

`recoveryTurns` is consumed by the Emergency Levy section below. `pendingSpawnMaxAttempts` bounds
`MinorCivEconomyState.pendingUnitSpawn` retries when a completed production unit has no legal
spawn tile the turn it finishes — after the max, the pending spawn is dropped rather than retried
forever (`processMinorCivEconomyTurn`).

### Per-posture unit cap (`getMinorCivUnitCap`)

| Challenge | settled | fortifying | mobilizing | recovering |
|---|---:|---:|---:|---:|
| Explorer | 1 | 2 | 3 | 1 |
| Standard | 2 | 3 | 4 | 2 |
| Veteran | 2 | 4 | 5 | 2 |

**Militaristic archetype bonus:** `+1` to the cap while `fortifying` or `mobilizing` only (no
bonus while `settled` or `recovering`). This is the one deliberate archetype-driven asymmetry in
the whole economy — see "Difficulty policy" below for why nothing else varies by archetype or
difficulty beyond this and the multiplier/interval/timing knobs above.

**Cap-drop mid-production (#954):** the live cap is checked at the moment a unit is about to be
created — both ordinary production completion and the emergency levy — but there is still no
disbanding mechanic: an already-existing unit built while the cap was higher is never retroactively
removed once posture reverts (e.g. `mobilizing` → `settled`) and drops the cap below the current
count. What #954 *does* fix is the queue: `processMinorCivEconomyTurn` checks the live cap against
the live unit count for the queue head's posture immediately before `processCity` runs, every
turn — if a unit already sitting at the queue head (accumulating progress across several turns)
would push the count over the cap that's in effect *this* turn, it is dequeued instead of
completing, mirroring `processCity`'s own "drop an illegal queue head" convention: only the head is
checked (nothing further back is "in production" yet), and any accumulated progress carries into
the next queue item rather than resetting — it resets to 0 only if the resulting queue is empty.
This closes the gap where a unit could keep completing indefinitely once queued, uncapped, purely
because the cap dropped after it was already queued; it intentionally does not touch units that
already exist by the time posture drops.

### Unit domain restriction (#952)

Minor-civ production is **land-only for v1**, catalog-wide: `SAFE_MINOR_CIV_UNIT_TYPES` and
`getMinorCivBuildCandidates` both filter to `(UNIT_DEFINITIONS[unitType]?.domain ?? 'land') ===
'land'`, on top of the existing `UNSAFE_UNIT_TYPES` exclusions (settlers, workers, spies, caravans,
transports). Before this, a coastal minor civ's `getTrainableUnitsForCity` call (itself
coastal-gated) could surface naval units, and `isLegalSpawnTerrain`'s naval branch would place
them — but `planPurposefulMinorCivTurn`'s movement never issues naval/air orders, so a spawned
galley would sit permanently inert, having wasted the production spent on it. `#883` (naval
logistics) and `#884` (air logistics) own any future minor-civ design in this space; until one of
those ships, do not reintroduce naval/air candidates here. This does not retroactively remove an
already-existing naval unit from a save that predates this restriction — only future production is
affected — and it does not touch `processCity`/`getTrainableUnitsForCiv`, which stay domain-agnostic
for every other civ.

### Posture evaluation and production-switching policy

`evaluateMinorCivEconomyPosture` resolves one of `settled` / `fortifying` / `mobilizing` /
`recovering` from (checked in this order): an active `localRecoveryUntilTurn` window → `recovering`;
formal war (`atWarWith.length > 0`) or `hasImmediateCityThreat` (any non-owned, non-transported
unit within hex distance **2** of the city) → `mobilizing`; a regional grievance at `mobilizing` or
`coalition-talks` status → `mobilizing`; membership in a `forming` or `active`
`minorCivCoalitions` entry → `mobilizing`; a `wary` grievance at pressure ≥ 20, or zero live units
→ `fortifying`; otherwise → `settled`.

The production queue is **not** re-evaluated every turn — `chooseMinorCivQueueItem` only runs
when the queue is empty and at least `queueDecisionInterval` turns have passed since the last
decision, **or** the current queue head is no longer a legal candidate (tech/era/resource
obsoleted it since it was queued). This is deliberate: it prevents the queue from thrashing every
turn as posture flickers, while still guaranteeing an obsolete queued item never produces forever.
`getMinorCivMobilizationBudget.wantsDefender` (grievance `mobilizing`/`coalition-talks` status)
biases `chooseMinorCivQueueItem`'s scoring toward defense even when the base posture is
`recovering` — recovery affects the *default* (no-active-grievance) production weighting only, it
never means "ignore an ongoing invasion" (see Emergency Levy section).

### Era-band policy

Every era-gated minor-civ decision (tech/resource/building eligibility, the population ceiling,
the emergency levy's region-immaturity embargo) reads `resolveNeutralPressureEra` — the single
canonical era/maturity source, keyed off nearby major-civ tech state. There is no second,
minor-civ-specific era resolver anywhere in this system; if a new minor-civ mechanic needs to know
"how mature is this region," it must call this same function rather than reintroduce one.

### Difficulty policy

Explorer/Standard/Veteran tune **caps, timing, and production quantity only** — the production
multiplier, queue decision interval, per-posture unit cap, recovery duration, and pending-spawn
retry budget above. They never change: which units/buildings are in the candidate catalog, what
anything costs (population, production), unit quality (HP, readiness), spawn legality rules, or
what a minor civ is allowed to observe. The Emergency Levy section's own "Difficulty parity" note
is the concrete instance of this rule already enforced in tests; this is the general policy that
any *future* difficulty-varying knob must follow the same split.

### AI-information restrictions

A minor civ's economy and mobilization decisions may only read information a locally-aware actor
would plausibly have:

- its own city, units, and economy/grievance/coalition state;
- its own formal war state (`diplomacy.atWarWith`);
- other units within a small local radius of its own city — hex distance **2** for
  `hasImmediateCityThreat` (posture/levy "is there an immediate threat" check), hex distance
  **14** for `MINOR_CIV_REGIONAL_GRIEVANCE_RADIUS` (how far a minor-civ conquest elsewhere raises
  this civ's grievance pressure against the conqueror);
- pressure/status of its own tracked grievances and any coalition it belongs to.

It may **not** read: another civ's full unit roster or military strength anywhere off that local
radius, another civ's hidden production queue, or anything behind normal fog-of-war/discovery
rules that a player wouldn't otherwise see. Difficulty does not widen or narrow this — see
"Difficulty policy" above.

### Regional grievance and coalition thresholds (`minor-civ-coalition-system.ts`)

| Constant | Value | Meaning |
|---|---:|---|
| `CONQUEST_PRESSURE` | 35 | Pressure added to every minor civ within the regional radius when a neighboring minor civ is conquered |
| `REPEATED_CONQUEST_PRESSURE` | +15 | Extra pressure if the same conqueror struck another minor civ within `REPEATED_CONQUEST_WINDOW` (12 turns) |
| `WARY_PRESSURE` | 20 | Threshold used by `evaluateMinorCivEconomyPosture` for `wary` pressure to imply `fortifying` |
| `MOBILIZING_PRESSURE` | 45 | Grievance status becomes `mobilizing` at or above this pressure |
| `COALITION_TALKS_PRESSURE` | 70 | Grievance status becomes `coalition-talks`; also the threshold for a minor civ to become a coalition-formation candidate |
| `EMERGENCY_LEVY_PRESSURE_THRESHOLD` | 80 | Feeds `getMinorCivMobilizationBudget.allowsEmergencyLevy` — see Emergency Levy section |
| Pressure decay/turn | 3 (Explorer) / 2 (Standard) / 1 (Veteran) | `pressureDecayPerTurn`, blocked for 4 turns after a conquest event (`decayBlockedUntilTurn`) |
| Coalition-talks countdown | 6 (Explorer) / 4 (Standard) / 3 (Veteran) | `coalitionTalksCountdown` — turns a `forming` coalition waits before declaring war |

A region needs population ≥ 6 total or ≥ 2 living combat units among candidate coalition members
(`isRegionMatureForCoalition`) before a coalition can form at all — this is why a coalition
member's own long-run trace (see envelope below) reliably resolves out of `forming` well inside
90 turns rather than stalling indefinitely.

### Expected long-run envelope (from `tests/systems/minor-civ-economy-longrun.test.ts`, #949)

These are the actual bounds the long-run test suite enforces, not aspirational targets — a future
change that needs to widen any of them must update both the test and this table in the same PR:

| Signal | Bound | Source |
|---|---|---|
| Population | Never exceeds the era-banded ceiling (see #948 section below); never negative | `assertNoRunaway`, per-turn `populationCeiling` (the separate, narrower `#951`-scoped test in `minor-civ-economy-system.test.ts` additionally checks population never drops below the emergency-levy floor over a 120-turn war) |
| Live unit count | Never exceeds the **max cap across all four postures** (not just the current posture's cap — see "Cap-drop mid-production (#954)" above: #954 stops a queued unit from completing over the current cap, but never disbands an already-existing unit built during an earlier higher-cap posture) | `assertNoRunaway`, per-turn `unitCap` |
| Pending-spawn attempts | Never exceeds `pendingSpawnMaxAttempts` for the active challenge tier | `assertNoRunaway` |
| Posture changes | At most 1 per 4 turns on average over the run (`ceil(turns / 4)`) — catches thrashing, not legitimate scenario arcs | `assertNoRunaway`, `postureChangeCount` |
| Emergency levies | Rare: > 0 but ≤ 1 per 10 turns over a 120-turn sustained-war simulation | flagship "100+ turn conflict" test |
| Recovery duration | Longest unbroken streak of `recovering=true` samples never exceeds `MAX_RECOVERY_TURNS` (8, the Explorer-tier `recoveryTurns` — the largest across all three tiers) | flagship "100+ turn conflict" test, `longestConsecutiveRun` |
| Determinism | Same seed + starting state → byte-identical multi-turn trace; save → reload → process-one-turn matches the uninterrupted path | `#949 — determinism` tests |

## Minor-Civ Population Ceiling (#948)

A one-city minor civ (city-state) has no housing/population cap in the generic
`processCity` growth system (that system grows any civ's city by at most +1
population/turn whenever accumulated food crosses `foodNeeded`, with no upper
bound). Left alone across a long peaceful game, a city-state can become an
implausible megacity. `getMinorCivPopulationCeiling` in
`src/systems/minor-civ-economy-system.ts` bounds this, enforced only inside
`processMinorCivEconomyTurn` — the generic city-growth system used by every
other civ is untouched.

**Ceiling table** (`MINOR_CIV_POPULATION_CEILING_BY_ERA_BAND`), keyed off
`resolveNeutralPressureEra` — the same canonical era/maturity source already
used for minor-civ production eligibility, not a second era resolver:

| Pressure era | Population ceiling |
|---|---:|
| 1-2 | 6 |
| 3-5 | 10 |
| 6-8 | 14 |
| 9+ | 18 |

Every band stays at or below the reference-economy single-city max-development
proxy (population 12, `tests/systems/helpers/pacing-reference-economy.ts`) or
close to it, and well below what an unbounded multi-city major civ can reach.
**Difficulty-invariant**: `MINOR_CIV_ECONOMY_TUNING` varies production
multiplier and unit caps by challenge tier, but food yield has no existing
difficulty tuning, so the ceiling does not vary by challenge either.

**At-cap food behavior:** while `city.population >= ceiling`,
`processMinorCivEconomyTurn` (1) clamps any already-banked `city.food` below
`foodNeeded` (so a legacy over-cap save's stale banked food can never
re-trigger growth the instant it's next processed) and (2) feeds `processCity`
a synthetic food yield equal to `population` (zero net surplus), so `food`
stays flat instead of banking toward a multi-level jump. This never happens to
a city below the ceiling — normal growth is untouched there.

**Over-cap legacy saves:** population is never shrunk on load or on the first
post-patch turn. The cap only blocks *further* growth
(`population >= ceiling` suppresses growth for `population` strictly greater
than `ceiling` exactly the same way it does for `population === ceiling`).
Once the era-scaled ceiling rises above an already-over-cap population,
growth resumes normally.

**Rule:** any future minor-civ economy change that can increase food yield
(a new building, a new archetype bonus, a new resource effect) does not need
its own cap-awareness — the suppression is computed fresh every turn from the
live `population` vs. live `getMinorCivPopulationCeiling` result, not from a
one-time check.

## Minor-Civ Era Advancement Grants No Free Content (#948)

`processMinorCivEraUpgrade` in `src/systems/minor-civ-system.ts` no longer
rewrites existing unit types or grants free population when local pressure
era advances (it did both, unconditionally, prior to #948 — the H2 finding
from the #490 audit). It is bookkeeping-only: it advances
`mc.lastEraUpgrade` to the new pressure era and does nothing else.
Era-appropriate defenders come exclusively from production
(`getMinorCivBuildCandidates` / `chooseMinorCivQueueItem`, both already
era-gated via `getMinorCivCompletedTechBand`); population growth comes
exclusively from the ceiling-bounded economy turn above. **Never** reintroduce
`unit.type = <newer type>` or `city.population += N` keyed off world/pressure
era advancement for an economy-enabled minor civ — that is exactly the "magic
spawn" pattern this rule exists to prevent. No `!mc.economy` legacy backstop
is retained: `economy` is normalized for every minor civ on every turn
(`processMinorCivEconomyTurn`) and on every save load (`save-manager.ts`), and
`lastEraUpgrade` starts at the placement-time pressure era, so the upgrade
condition cannot fire before an economy-normalizing pass has already run.

## City-State Emergency Levy (#951)

`#490`'s original design intended one shared mobilization budget deciding what a city-state does
under pressure. What actually shipped diverged into three overlapping mechanisms: ordinary
production bias (`getMinorCivMobilizationBudget.wantsDefender`, live), a grievance-layer
"conscription" defender spawn (live but reachable), and a grievance-layer "trained defender"
mobilization-progress spawn (its own accumulation, never actually reachable because the only real
caller passed `allowDefenderSpawns: false`). `#951` consolidated these into one owner:

- **Economy owns all emergency defender creation.** `performMinorCivEmergencyLevy` in
  `src/systems/minor-civ-economy-system.ts`, called only from `processMinorCivEconomyTurn`, is the
  sole mutation path that can materialize a unit outside ordinary paid production.
  `processMinorCivRegionalGrievanceTurn` (`minor-civ-coalition-system.ts`) is bookkeeping-only —
  pressure decay and status resolution, never a spawn.
- **Grievance/coalition owns the "why."** `getMinorCivMobilizationBudget` stays a deterministic,
  read-only signal (`wantsDefender`, `allowsEmergencyLevy`); it does not mutate state and is not
  itself where a levy decision is made.
- **One budget, one response per turn.** Ordinary paid production is tried first
  (`processCity`/`chooseMinorCivQueueItem`, already biased toward defense by `wantsDefender`). An
  emergency levy is only evaluated when no *unit* completed production that same turn — a
  completed building does not suppress it, since it doesn't address a military emergency.
- **Emergency levy gates** (`evaluateMinorCivEmergencyLevy`, all required, in this order): a severe
  threat exists (`allowsEmergencyLevy`, or `hasImmediateCityThreat`'s local-radius war/barbarian
  scan) → local pressure era >= 2 (the exact era>=2 embargo the pre-#951 conscription branch had —
  a brand-new era-1 city-state cannot levy no matter how severe the threat looks, so a young player
  cannot trigger an emergency army in the first few turns) → live cap not exceeded (`currentUnits + 1 <= getMinorCivUnitCap(..., 'mobilizing')`) →
  city not already fielding `MINOR_CIV_LEVY_MIN_DEFENSIVE_FORCE` (2) or more living units → levy
  cooldown elapsed (`levyCooldownUntilTurn`, `MINOR_CIV_LEVY_COOLDOWN_TURNS` = 10 turns,
  difficulty-invariant) → population above `MINOR_CIV_LEVY_MIN_POPULATION` (2, i.e. population
  must be > 2) → a land-domain defensive-class candidate exists in the same tech/era/resource-gated
  catalog ordinary production already draws from (`getMinorCivBuildCandidates`, filtered to
  `melee`/`ranged`/`gunpowder` classes, cheapest wins — no hardcoded era→unit table) → a legal spawn
  tile exists (`legalSpawnPositions`, the same helper production completion uses). A failed spawn
  charges no population and sets no cooldown/recovery.
- **Population cost:** flat `MINOR_CIV_LEVY_POPULATION_COST` (1), charged only on a successful
  spawn. Not scaled by the `#948` population ceiling — the ceiling describes safe maximums, not
  spendable credit, so a high-cap late-game city gets no cheaper levy than an early one.
- **Levy unit quality:** `MINOR_CIV_LEVY_UNIT_HEALTH` = 65 (65% of the 100 max HP every unit spawns
  at). Every minor-civ-created unit (ordinary production included) already spawns with
  `hasActed`/`hasMoved` set and zero movement left, so a levied unit categorically cannot act,
  move, or attack the turn it appears — no separate readiness system was needed.
- **Recovery vs. cooldown are two different durations, not duplicate state.** A successful levy
  sets both `localRecoveryUntilTurn` (`MINOR_CIV_ECONOMY_TUNING[challenge].recoveryTurns`: 8/6/5 by
  difficulty — an already-difficulty-tuned knob this PR finally wires up) and `levyCooldownUntilTurn`
  (`turn + 10`, flat). Recovery is a **posture-only** signal (`evaluateMinorCivEconomyPosture`
  returns `'recovering'`, biasing production toward `food`) and does not by itself block another
  levy attempt; the cooldown is the actual hard gate. Because `recoveryTurns` (max 8) is always
  <= the cooldown (10), an active recovery window always implies the cooldown is also still active
  — the two never contradict each other, and recovery ending early does not reopen the levy.
  `wantsDefender`-driven queue biasing (`chooseMinorCivQueueItem`) already overrides a `'recovering'`
  posture back toward defense scoring when a real grievance is still active, so recovery does not
  mean "ignore an ongoing invasion" — it only affects the default (no-active-grievance) production
  weighting.
- **Land-defense only, always.** The levy candidate filter excludes naval/air/siege/mounted/armor
  regardless of the host city being coastal. See "Unit domain restriction (#952)" above — that
  restriction now also excludes naval/air from `getMinorCivBuildCandidates` catalog-wide, so the
  levy's own domain check is redundant with its upstream candidate source, but is kept anyway as
  an explicit, cheap, defense-in-depth guarantee of the levy's own "always land" contract — do not
  remove it on the assumption the upstream filter alone is sufficient.
- **Difficulty parity.** Every gate above (legality, population cost, unit choice, HP, spawn rules,
  visibility) is identical across Explorer/Standard/Veteran. The only difficulty-varying input is
  `recoveryTurns` — a posture-only signal, not a legality or cost difference — and it was already
  difficulty-tuned in `MINOR_CIV_ECONOMY_TUNING` before `#951`.
- **Removed as dead:** the grievance-layer `ERA_DEFENDER_UNIT` era→unit table, its "conscription"
  and "trained defender" spawn branches, `MinorCivRegionalGrievance.mobilizationProgress`,
  `.lastMobilizedTurn`, `.conscriptCooldownUntilTurn`, and `.recoveryStrainedUntilTurn`. Old saves
  carrying any of these are tolerated (fields silently dropped on normalize) with no schema bump.

## National Project Lifecycle Contract

- **Build window:** available during `homeEra` and `homeEra + 1` only. Hidden from production queue when `currentEra > homeEra + 1`.
- **Yield multiplier** based on `currentEra - eraBuilt`:
  - 0 or 1: 1.0 (full)
  - 2: 0.5 (fading)
  - ≥ 3: 0.0 (expired — building removed, `city:national-project-expired` event fired)
- A civ may not queue a national project it has already built or already queued in another city (`uniquePerEmpire: true`). All production and recommendation paths must use `getReservedNationalProjectKeys`.
- National-project `yields` are display/balance metadata only; `calculateCityYields` must not apply them to the host city. Active effects enter the economy exactly once through `getNationalProjectCivYieldBonus`.
- UI must show `(fading)` label when multiplier is 0.5.
- Build UI must label national-project yield numbers as empire-wide so they cannot be mistaken for host-city yields.

## Milestone National Projects (#591 MR4)

`NationalProject.milestone?: true` marks a one-time permanent-trigger project (e.g. Sacred Council):
- Buildable from `homeEra` onward — **no upper build-window bound** (`getAvailableBuildings` and the
  belt-and-suspenders dequeue guard in `processCity` both skip the `homeEra + 1` upper check for
  milestone NPs).
- **Never expires** — `expireNationalProjects` skips milestone NPs unconditionally, regardless of
  era delta. The building stays in `city.buildings` and `builtNationalProjects` forever.
- **No `civYieldBonus`/`cityYieldBonus`** — its effect is a one-time state-mutating side effect
  (e.g. founding a religion), not an ongoing yield. Enforced by `national-project-balance.test.ts`.
- Still `uniquePerEmpire: true` — one per civ, same as every other national project.

## National Project Production Discounts

MR12 added a second class of national-project effect distinct from `civYieldBonus`: empire-wide *production cost discounts* (e.g. Tribal Muster Ground: era-1/2 melee units train 10% cheaper). These are cost multipliers, not yields, so the yield ceilings above do not apply to them — but they have their own rules:

- Defined in `NP_PRODUCTION_DISCOUNTS` in `src/systems/city-system.ts`, a data table (`{ nationalProjectId, appliesTo, discount }`) consumed generically by `getNationalProjectDiscountMultiplier`. **Add a new discount by appending a row — never add another `if (project.id === '...')` branch to that function.** The whole point of the table is that a new discount NP requires zero changes to the resolver.
- `appliesTo` is either a `UnitClass` (checked via `UNIT_CLASS_BY_TYPE`, e.g. `'gunpowder'`, `'siege'`) or an explicit `UnitType[]` for discounts that don't map to one class (e.g. `ERA_1_2_MELEE_UNIT_TYPES`). Prefer the class form — it stays correct if new units are added to that class later; only use an explicit list when the discount's boundary is genuinely not a `UnitClass` (era-scoped melee is the only current example).
- Discounts are fade-scaled by the project's `fadeMultiplier` (same 1.0 / 0.5 / 0.0 curve as yields) and are **multiplicative** with building discounts and tech discounts — not `Math.min`'d like same-class building discounts are. See `tests/systems/city-system.test.ts` "MR12 — national-project production discounts" for the exact-value regression.
- `getProductionCostForItem` only computes this when callers pass `activeNationalProjects: ActiveNationalProjectRef[]` (from `getActiveNationalProjectsForCiv`). As of MR12 this is threaded through: `economy-system.ts` (rush-buy), `planning-system.ts` (idle-city recommendation), `quest-objective-system.ts` (caravan-queue-cost estimate), `ai-production.ts` (AI candidate scoring), and `city-panel.ts` (displayed cost). **Any new call site of `getProductionCostForItem` that can see a real city/civ must also pass `activeNationalProjects`, or a discount NP will silently not apply there** — there is no compiler or test error for a caller that simply omits the option, since it defaults to `[]`. When adding a new caller, check this list and add it, and prefer verifying the new caller's discounted cost in a test rather than assuming the default-`[]` path is fine.

## Great General Specialty Bounds (#885)

`src/systems/great-general-specialties.ts` gives authored Generals a bounded
mechanical identity via a reusable typed specialty catalog.
`resolveGeneralMechanics(def)` is the ONLY place divergence is applied; every
ability / AI / UI consumer reads it (never a raw `GeneralDefinition` field or a
magnitude constant). Enforced by `tests/systems/great-general-specialties.test.ts`
and `tests/systems/great-general-specialty-balance.test.ts`.

| Dimension | Baseline | Min | Max |
|---|---|---:|---:|
| commandRange | 2 | 1 | 3 |
| commandCapacity | 3 | 2 | 4 |
| maxCommandCharges | 3 | 2 | 4 |
| cooldownTurns | 10 | 7 | 13 |
| rally.healAmount | 30 | 20 | 50 |
| lastStand.defenseMultiplier | 1.15 | 1.10 | 1.30 |
| lastStand.durationTurns | 2 | 2 | 3 |
| seize.extraTargets | 0 | 0 | 1 |

**Rules for a new specialty or a change to an existing one:**

- Every non-`generalist` specialty MUST have >= 1 dimension better AND >= 1 worse
  than baseline (no strict upgrade), and MUST NOT Pareto-dominate another
  specialty or `generalist`. `great-general-specialties.test.ts` enforces both.
- Last Stand **radius** and passive-stabilization magnitude are NOT specialty
  dimensions (radius 2 is too swingy; passive stabilization has no magnitude and
  is a *supply* mechanic, unrelated to #919's unrest-relief ceilings).
- `cooldownTurns` documented floor is 7; the resolver also hard-clamps every
  field (range/capacity/charges/cooldown >= 1, heal >= 0). Never `cooldown 0`.
- Generated officers (#888) and the universal fallback commanders
  (`gen_universal_*`, `gen_hannibal`, `gen_thessaly`) stay `generalist`.
- Adding a specialty = one `GENERAL_SPECIALTIES` entry + `GENERAL_SPECIALTY_ASSIGNMENTS`
  edits + (optionally) one situational term in `chooseBestGeneralCandidate`
  (`ai-general-command.ts`). NEVER a change to an ability consumer, NEVER a
  General-ID branch.
- Re-run `great-general-specialty-balance.test.ts` — each specialist must still
  win its intended scenario and no specialty may win all six.

## Special Building Rules

Special buildings (those with `requiresBuildings` chain prereqs or `coastalRequired`) may have **two yield types** — the condition is the balancing constraint. No ceiling applies beyond common sense (compare to similar-era wonders for reference).

## Adding New Content — Checklist

When adding a new wonder, national project, or special building in any future era:

- [ ] Wonder: `civYieldBonus` no single key > 6; ≤ 2 keys; no per-city scaling (or add to allowlist)
- [ ] National project: single yield type preferred; total ≤ era ceiling; no `cityYieldBonus`; no per-city scaling (or add to allowlist)
- [ ] National project: AI/player availability uses the shared reserved-project set; UI labels its yields as empire-wide
- [ ] Wonder/project: definition-driven AI eligibility and global/self-competition tests cover the new entry without ID-specific AI branches
- [ ] Any movement bonus: update the stacking inventory table above; confirm total ≤ +2 empire-wide for affected unit class
- [ ] National project production discount (new class, see above): append a row to `NP_PRODUCTION_DISCOUNTS`, don't branch; confirm every `getProductionCostForItem` caller in the list above still passes `activeNationalProjects`
- [ ] Run `yarn test` — `national-project-balance.test.ts` and `wonder-definitions.test.ts` will fail if ceilings are exceeded

## Pacing Regression Prevention

- Any MR that adds or activates a new economy-affecting bonus (tech yield, building
  yield, wonder yield, national-project yield) MUST re-run
  `tests/systems/pacing-audit.test.ts`'s full-catalog outlier gate before merging.
- If the change shifts a reference-economy era snapshot's output (see
  `tests/systems/pacing-reference-economy.test.ts`), the PR must include the updated
  snapshot numbers and a one-line justification, not just a passing test — this is the
  seam future MRs go through instead of silently drifting pacing the way MR4–6 did
  (see issue #481 for the incident this rule prevents).
- The reference-economy fixture has three views. `'bounded'` and `'maximal'` retain their legacy
  single-city, strictly-prior-era arrival convention: bounded admits only recently gated
  buildings, while maximal admits every eligible building (a completionist playstyle, not a
  corner case). `'representative'` is a diagnostic-only, mixed-age 1/3/5/7/9-city cohort that
  follows the live personal-era resolver and spends a bounded production share on neutral
  infrastructure. It reports aggregate and average outputs; it never supplies runtime AI,
  difficulty, UI, save, or player behavior.
- `RESEARCH_OUTPUT_BY_ERA` targets **`'maximal'`**, never bounded or representative: tuning
  against the lower bounded output would let a completionist empire blow through late-game tech
  far faster than the target window, which is exactly the "feels automatic" failure the pacing
  design doc warns about. The legacy and canonical representative snapshots are pinned by
  `tests/systems/pacing-reference-economy.test.ts`. Do not quietly change which profile
  `RESEARCH_OUTPUT_BY_ERA` targets without updating that file's comments and re-running the
  full outlier gate (era 10-12 tech costs will shift; that cascade is expected, not a sign
  something broke).
- Any representative route-selection, cohort, infrastructure-share, scoring-weight, or
  aggregation-scope change must update the canonical 60% snapshot with a concise justification,
  retain the 50/70% sensitivity invariants, and re-run the full-catalog outlier gate. Do not use
  a representative snapshot change to justify a pacing retune without explicit approval.
- That same test file also gates the era-over-era output growth ratio (currently capped at 3x)
  for both profiles. This is a guardrail against a repeat of the MR13 review finding: a bug in
  building-eligibility logic can silently produce runaway output that only becomes visible once
  it cascades into hundreds of tech-cost changes. If you touch `eligibleBuildingIds` or either
  profile's derivation, this test should be the first thing you check.

### Future-era research pacing checklist (#917)

Before adding an authored technology era, the change must add all of the following in the same
delivery:

- explicit tall, standard, and wide city-count plus infrastructure-share scenario data;
- deterministic aggregate-output pins, including the research-arrival feedback path;
- a complete all-era cost audit and continuity row from `yarn research:pacing-report`;
- useful-lifetime coverage based only on explicit `upgradesTo` edges, with a typed terminal or
  domain-transition reason for every deliberate exception; and
- migration analysis whenever an existing persisted `Tech.cost` changes. A new era alone needs
  no migration, but an old active technology whose cost changes must preserve its percentage
  progress through a new schema migration.

`requireResearchPacingScenario` must fail loudly for an authored era missing this data. Do not
borrow the final known era's profile for a cost recommendation, audit, or report.
