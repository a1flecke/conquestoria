# #919 Empire Unrest — Spread Fix, Wide-Empire Scaling, and Actionable Guidance — Design

**Date:** 2026-08-29
**Issue:** #919
**Base:** `d18879633c74319dab26bc7fa42d666509326829` (`origin/main`)
**Delivery:** three sequenced MRs (MR1 independent → MR2 → MR3)

## Goal

A wide empire in the mid game (issue screenshot: turn 122, Era 2, 8+ cities, nearly every one in Unrest) has no workable answer to unhappiness. Three distinct problems:

1. **Funding a plague remedy does not stop the plague spreading.** Reported directly; confirmed as a logic gap.
2. **The UI gives no actionable guidance.** It shows a pressure breakdown and two gold-sink buttons, and the advisor recommends things that may not be possible.
3. **Wide empires have no scalable counter to sprawl pressure.** Distance and overextension are supposed to be real pressures, but a pressure with no affordable, era-appropriate counter is a punishment, not a decision.

This design keeps distance and scale as genuine pressures while giving every era a deliberate, bought counter, and makes the UI tell the player exactly which lever to pull.

## Current-main audit

- **Outbreak spread** (`tickOutbreakCrisis`, `src/systems/crisis-system.ts:272-288`): the per-city spread roll `continue`s only for cities in `working.quarantinedCityIds`. It does **not** skip a city with a pending `remedyCompletionByCity` entry, even though the population-loss loop immediately above it (`:259-270`) does exactly that. So a city whose remedy is underway keeps rolling a 20%/turn chance (`+0.15` if `spreadBoostPredicate`) to infect the geographically nearest healthy same-owner city for the two turns until the cure lands.
- **Re-infection:** `applyRemedy` sets `remedyCompletionByCity[cityId] = state.turn + 2`; on completion the city is removed from `crisis.cityIds`. The spread candidate filter is `c.owner === owner && !working.cityIds.includes(c.id)` — a just-cured city is no longer in `cityIds`, so it is immediately eligible to be re-infected. In a dense cluster this is a permanent loop.
- **Famine** (`tickFamineCrisis`, `:378-394`): identical spread-loop shape, same missing remedy check. Fixed in parity.
- **No empire-wide cure exists.** `applyRemedy` and `applyQuarantine` are the only crisis-response actions, both strictly per-city.
- **Unrest onset** (`processFactionTurn`, `src/systems/faction-system.ts:353`): `clearEraOneUnrestForCity` wipes unrest only while the owner's era is ≤ 1. Unrest is fully live from Era 2 on.
- **Pressure model** (`getUnrestPressureBreakdown`, `src/systems/faction-system.ts:47-122`) is the single source of truth — `computeUnrestPressure` (AI/turn processing) and the city-panel breakdown UI both read it. Sprawl-relevant rows:
  - `Empire overextension`: `min(30, max(0, (cityCount - 5) * 3))` — one row, identical value on every city of the civ.
  - `Distance from capital`: `min(20, max(0, (dist - 5) * 2))` — per city.
  - `War weariness`: `min(24, atWarCount * 8)`.
  - `Economic strain`: era ≥ 3 only, `min(20, 12 + unpaidMaintenance * 2)`.
  - Offsets: `Luxury resources` `-ownerHappiness * 2`, `Happiness buildings` `-getCityHappinessFromBuildings(city) * 2`, `Religious serenity` `-2`.
- **`UNREST_TRIGGER_PRESSURE = 40`** (`src/systems/faction-system.ts:17`). Unrest starts when pressure exceeds it and clears when pressure drops to ≤ it (or the city is garrisoned).
- **No happiness building is available before Era 3.** `temple` requires `philosophy` (era 3); `amphitheater` requires `drama-poetry` (era 4). `monument` (`code-of-laws`, era 1) has no `happiness` field. So in Era 2 the breakdown's `Happiness buildings` offset is structurally 0, and the advisor's "build happiness improvements" line (`src/ui/advisor-system.ts:257`, `src/ui/notification-routing.ts:118`, `:462`) is a dead promise for a full era.
- **Early civics techs:** `tribal-council` (era 1, cost 4) → `code-of-laws` (era 1, cost 10, `unlocksBuildings: ['monument']`). `drama-poetry` is the next civics tech, era 4. There is a clean gap for a new Era-2 civics tech with `code-of-laws` as prerequisite.
- **No existing `courthouse` / `magistracy` / `provincial` / `bureaucracy` identifiers** anywhere in `src/systems/`.
- **Guidance surfaces:** `src/ui/city-overview-panel.ts` (the screenshot — sortable city list with Appease/Concede), `src/ui/city-panel.ts:345-362` (per-city unrest section with the `data-pressure-row` breakdown), `src/ui/advisor-system.ts` (`chancellor_unrest_warning`, `general_last_stand_crisis_hint`), `src/ui/notification-routing.ts` (unrest-started / critical-status / era-2 onset messages).

## Research summary

How comparable games and historical empires handle "too big to govern," and how each landed:

| Source | Mechanism | Outcome / lesson |
|---|---|---|
| **Civ IV** | Distance-to-palace *maintenance* (gold) + **Courthouse** (−50% upkeep) + secondary government seats (nearest-seat measurement) + late civic removing distance cost | The cited success. Every tier had an affordable, deliberate counter; wide play stayed viable but taxed; small empires stayed competitive. **This design borrows the Courthouse directly.** |
| **Civ V** | Global happiness pool: −3/city, −1/pop, empire-wide | Killed infinite sprawl but felt punitive; one bad city hurt the whole empire; luxury counters were map-RNG dependent. **Lesson: keep pressure per-city, not one pool.** |
| **Civ VI** | Per-city Loyalty, distance-weighted population pressure; counters = Governors, Amenities, policies; 0 → Free City | "Distance pressure with real counters" works; Governors' scarcity keeps it a decision. A bit fiddly. |
| **Stellaris** | Administrative cap → sprawl penalty, with the means to raise the cap removed | Cautionary tale — players revolted at "no way to even try to solve it." **Lesson: a pressure with no counter reads as a punishment.** |
| **Humankind** | Per-city + empire Stability; counters = garrison, infrastructure, civics | Good bones, defanged by handing out too many free stability bonuses. **Lesson: counters that are too cheap/automatic collapse the decision space.** |
| **Old World** | Empire-size discontent; counters are dynasty *characters* assigned as governors | Ties the counter to the game's identity so managing sprawl *is* the fun. |
| **History** | Persian satrapies / Roman provinces / Qin commanderies (delegated governance + fixed tribute); Roman & Persian roads, Mongol yam (distance-shrinking infrastructure); citizenship extension (shared identity); second capitals | Lasting empires all did some mix of these. Failure modes: over-centralization, tribute ossification, reforms arriving after provinces had already drifted. |

Design principles taken forward: (a) keep distance & scale as real pressures; (b) every era where a pressure exists needs an affordable, deliberate counter; (c) counters are choices you spend on, not auto-includes; (d) pressure stays per-city; (e) wide play should have a build identity ("administrative empire").

---

## MR1 — Outbreak spread fixes

Standalone bugfix. No balance or UI dependency. Directly resolves reported problem #1.

### 1.1 Remedy halts spread

In the spread loop of `tickOutbreakCrisis` (and `tickFamineCrisis` for parity), skip a city that has an in-progress remedy:

```ts
for (const cityId of [...working.cityIds]) {
  if (working.quarantinedCityIds?.includes(cityId)) continue;
  if (working.remedyCompletionByCity?.[cityId] !== undefined) continue; // NEW
  ...
}
```

Rationale: mirrors the population-loss loop, which already treats a remedy-underway city as no longer actively afflicted. Player expectation is that "funding the cure" does something now, not only when it completes. Quarantine remains the stronger tool (stops spread *and* is instant, at a steeper yield penalty); remedy now also stops outbound spread but still costs gold and takes two turns.

### 1.2 Post-cure re-infection immunity

- New constant `OUTBREAK_CURE_IMMUNITY_TURNS = 3` in `crisis-system.ts`.
- New optional field on `ActiveCrisis`: `curedUntilTurn?: Record<string, number>` (city id → turn through which that city cannot be re-infected by *this* crisis). Optional, so no save migration; a pre-existing save simply has it undefined.
- When a remedy completes and a city leaves `cityIds` (both resolvers' "Remedy completion" block), set `curedUntilTurn[cityId] = state.turn + OUTBREAK_CURE_IMMUNITY_TURNS`.
- Spread candidate filter gains: `&& !(working.curedUntilTurn?.[c.id] !== undefined && working.curedUntilTurn[c.id] >= state.turn)`.
- Immunity is per-crisis, not global: a *different* later outbreak can still strike the city. Prune stale entries (`curedUntilTurn[id] < state.turn`) when the resolver rebuilds `working` so the map stays bounded.

### 1.3 Tech-gated empire-wide cure ("Nationwide Remedy")

- New export `applyEmpireContainment(state, crisisId): { success, state, message }` in `crisis-system.ts`.
- **Gate:** the target civ's `techState.completed` includes `medicine` (era 4). With `epidemic-control` (era 6) also completed, the cure additionally writes `curedUntilTurn` for every treated city (so a re-seed can't immediately undo it).
- **Effect:** for every city currently in `crisis.cityIds` without a pending remedy, set `remedyCompletionByCity[cityId] = state.turn + 2` in one action (it starts the standard 2-turn remedy everywhere at once; it does not instantly clear the crisis).
- **Cost:** `Σ getCityAppeaseCost(city)` over those cities, × `0.75` bulk factor, rounded. Fails with a message if the civ can't afford it.
- **UI:** one button in the outbreak crisis section of `city-panel.ts`, rendered only when the acting civ has `medicine` and the crisis spans ≥ 2 cities. New callback `onEmpireContainment?(crisisId)` threaded the same way as `onRemedyCrisis`. New notification routed through `notification-routing.ts`.
- **AI:** AI civs invoke `applyEmpireContainment` from their crisis-handling path when they have the tech, ≥ 2 of their cities are infected, and they can afford it — same actor-completeness rule as remedy/quarantine (`.claude/rules/end-to-end-wiring.md`).

Early game (Era 2, the screenshot case) is unaffected by 1.3 and is addressed entirely by 1.1 + 1.2: funding remedies across "many cities" now actually halts the spread from those cities.

### MR1 tests

- `tests/systems/crisis-outbreak.test.ts`:
  - remedy-underway city does **not** appear as a spread source (deterministic seed that would otherwise spread).
  - a just-cured city is **not** re-infected while `state.turn <= curedUntilTurn`, and **is** eligible again after it lapses.
  - `applyEmpireContainment` negative test: no `medicine` → `success: false`, no state change.
  - positive: with `medicine`, starts a remedy in every infected city, charges `Σcost × 0.75`, fails on insufficient gold.
  - with `epidemic-control`, treated cities also get `curedUntilTurn`.
  - AI parity: an AI civ with the tech and budget auto-contains a ≥2-city outbreak.
- `tests/systems/crisis-famine.test.ts`: remedy-underway city does not spread famine (parity with 1.1).
- `tests/systems/crisis-system.test.ts`: `curedUntilTurn` map is pruned of stale entries each tick.

---

## MR2 — Large-empire balance layer

Depends on nothing but must land before MR3 (MR3's guidance points at the Courthouse and the `magistracy` tech).

### 2.1 Curve retune ("F-lite")

Adjust constants / formulas in `getUnrestPressureBreakdown` and `faction-system.ts` so the wall arrives later and gentler, without removing the pressure. **Proposed values — final numbers are whatever keeps `pacing-*` snapshots inside their gates (see 2.4):**

| Row | Current | Proposed |
|---|---|---|
| Empire overextension | `min(30, max(0, (cityCount - 5) * 3))` | `min(24, max(0, (cityCount - 7) * 2))` |
| Distance from capital | `min(20, max(0, (dist - 5) * 2))` | `min(20, max(0, (dist - 6) * 2))` |

`UNREST_TRIGGER_PRESSURE` stays 40. Era-2 unrest onset stays (see 2.2 for why that's safe now). No other rows change.

Net effect on the screenshot civ (8 cities): overextension row `9 → 2`; distant cities shed 2 from the distance row. Combined with 2.2 this turns "every city in unrest" into "the few genuinely remote / overgrown cities need attention."

### 2.2 New Era-2 civics tech: `magistracy`

- `src/systems/tech-definitions-eras1-4.ts`: `{ id: 'magistracy', name: 'Magistracy', track: 'civics', cost: 50, prerequisites: ['code-of-laws'], unlocks: ['Provincial courts reduce unrest from distance and overextension'], unlocksBuildings: ['courthouse'], era: 2, pacing: { ... } }`.
- `unlocks` text is effect-only (no bare building name), per `.claude/rules/end-to-end-wiring.md` / `tech-unlocks-consistency.test.ts`.
- Pacing metadata: `band: 'infrastructure'`, `role: 'stability-civics'`, conservative multipliers (~1.0–1.05) since it gates infrastructure, not a yield engine.

### 2.3 New building: `courthouse`

- `src/systems/city-system.ts` `BUILDINGS`: `{ id: 'courthouse', name: 'Courthouse', category: 'civics', yields: { food: 0, production: 0, gold: 1, science: 0 }, productionCost: 55, description: 'Seat of provincial law. Halves this city\'s unrest pressure from distance to the capital and reduces its share of empire overextension.', techRequired: 'magistracy', pacing: { ... } }`.
  - `category`: use whichever existing category `monument` uses (`'culture'`) unless a `'civics'`/`'government'` category already exists — confirm at implementation time and match precedent; do not invent a category.
  - Small `gold: 1` yield so the building isn't a pure tax the AI undervalues; not a happiness building (its effect is targeted, not a general `happiness` field).
- `PRODUCTION_ICONS['courthouse'] = '⚖️'` in the same file.
- `src/systems/tech-definitions-eras1-4.ts`: `magistracy.unlocksBuildings` already lists `courthouse` (2.2).

### 2.4 Courthouse effect — in `getUnrestPressureBreakdown`

The effect lives in the single source of truth, keyed off `city.buildings.includes('courthouse')`:

- **Distance from capital row:** if the city has a courthouse, take the raw `(dist - 6) * 2` value, multiply by `0.5`, then apply the `MAX_PRESSURE_DISTANCE` clamp — so the halving happens on the pre-clamp value.
- **Empire overextension row:** if the city has a courthouse, subtract a flat `COURTHOUSE_OVEREXTENSION_RELIEF = 4` from that row's amount for this city, floored at 0. (The row is computed per city already — it just currently produces an identical number for every city. Applying per-city relief is a localized change, not a reshape.)
- Both reductions are reflected in the row `amount` the UI renders, so the city panel automatically shows the reduced pressure and MR3's guidance can see "this row is already mitigated here."

Fully built out (every city courthoused): the screenshot civ's overextension contribution goes to 0 and distance contributions halve — "wide is viable *if you invest in administration*," matching the Civ IV lesson and avoiding the Stellaris "no counter" and Humankind "free counter" failure modes (it costs 55 production per city and a tech).

### 2.5 `game-balance.md`

Add a new "Unrest Relief Inventory" table (parallel to the existing Happiness Inventory), seeded with:

| Source | Scope | Effect | Era active |
|---|---|---|---|
| Courthouse building | city | Distance-from-capital pressure ×0.5; empire-overextension share −4 | era 2+ (`magistracy`) |

with the rule that any future distance/overextension/unrest-relief source adds a row here.

### 2.6 Deferred to later MRs (documented, not built here)

- **Roads reduce distance pressure** — a road-connected city counts as N hexes closer to the capital. Reuses the road system + `military-logistics`. Most historically-grounded distance answer.
- **Second seat of government** — wonder or national project adding a second distance origin (nearest-seat measurement), for empires that outgrow courthouses.
- **Governors / appointed administrators** — a capped number of assignable officials granting per-city pressure relief; Civ VI + satrapy flavor.
- **Autonomy / confederation stance** — opt a city into self-rule for large unrest relief in exchange for reduced gold/production remitted to the treasury (the satrapy-tribute tradeoff, and a pressure-release valve).

### MR2 tests

- `tests/systems/faction-system.test.ts`:
  - retuned overextension/distance formulas produce the new expected values at representative `cityCount` / `dist`.
  - courthouse present → distance row halved, overextension row −4 (floored); **negative test**: same city without courthouse → full pressure (`.claude/rules/spec-fidelity.md` — a gated effect needs a proof the gate matters).
  - a civ below the new overextension threshold (≤ 7 cities) gets no overextension row at all.
- `tests/systems/faction-happiness.test.ts`: courthouse relief composes correctly with luxury/serenity offsets (rows are additive; no double counting).
- `tests/systems/city-system.test.ts`: `courthouse` has a `PRODUCTION_ICONS` entry and a well-formed `BUILDINGS` entry (existing coverage regressions catch this).
- `tests/systems/tech-unlocks-consistency.test.ts`: `magistracy.unlocksBuildings` contains `courthouse`; `magistracy.unlocks` contains no bare entity name.
- AI: a test comparing the currently-eligible building catalog to generated AI production candidates includes `courthouse` (`.claude/rules/end-to-end-wiring.md` — new buildings must flow into AI candidates generically).
- `tests/systems/pacing-audit.test.ts` + `tests/systems/pacing-reference-economy.test.ts`: re-run the full-catalog outlier gate; if a reference-economy era snapshot shifts, the PR includes the updated numbers plus a one-line justification (`.claude/rules/game-balance.md` "Pacing Regression Prevention"). The Courthouse's `+1 gold` and the new tech's cost are the only economy-touching additions; expected drift is small.

---

## MR3 — Actionable unrest guidance

Depends on MR2 (recommends the Courthouse / `magistracy`).

### 3.1 Shared helper: `src/systems/unrest-guidance.ts`

Single source of truth for "given this city's pressure breakdown, what should the player do?" Consumed by both UI surfaces so they can't drift.

```ts
export interface UnrestRecommendation {
  rowLabel: string;            // which pressure row this addresses ('' for a general suggestion)
  amount: number;              // that row's current pressure contribution
  action: string;              // imperative, player-facing ("Build a Courthouse")
  detail: string;              // one line of "why / how"
  availability: 'now' | 'research-first' | 'blocked'; // is it actionable this turn?
}

export function getUnrestRecommendations(cityId: string, state: GameState): UnrestRecommendation[];
export function getTopUnrestLever(cityId: string, state: GameState): UnrestRecommendation | null;
```

Row → counter mapping (every recommendation is checked for real availability before it is emitted — never suggests something impossible now):

| Pressure row | Recommended action | Availability logic |
|---|---|---|
| `Empire overextension` / `Distance from capital` | "Build a Courthouse (⚖️)" | `now` if `magistracy` done and city lacks `courthouse`; else "Research Magistracy" `research-first` if `code-of-laws` done; else "Garrison a military unit" `now` |
| `War weariness` | "Make peace — you are at war with N civ(s)" | `now` (links to diplomacy); `detail` names the wars |
| `Recent conquest` | "Hold on — settles in X turns; garrison to speed it" | `now` |
| `Economic strain` | "Fix your budget — N gold/turn of unpaid upkeep" | `now`; `detail` points at rush-buy lockout |
| `Enemy espionage` | "Station a unit / counter-intel" | `now` |
| `Uprising contagion` | "Stabilise the revolting city N hexes away, or garrison here" | `now`; names the source city |
| `Foreign faith pressure` | "Build/keep a Temple; spread your faith here" | `now` if `philosophy` done; else `blocked` with era note |
| No `Luxury resources` offset and none owned | "Acquire a luxury resource (trade or claim one)" | `now` |
| No `Happiness buildings` offset, building available | "Build a happiness building (Temple/Amphitheater)" | `now` if the era's happiness building tech is done; **never emitted if no happiness building is unlockable yet** |

`getTopUnrestLever` returns the recommendation addressing the single largest positive row (ties broken by the ordering above).

### 3.2 Cities overview panel (`src/ui/city-overview-panel.ts`)

For each city currently in unrest (`unrestLevel > 0`), render one extra line under the yields: the `getTopUnrestLever` action + a compact availability marker (e.g. `⚖️ Build a Courthouse` / `🔬 Research Magistracy first` / `⚔️ Garrison a unit`). This is the screenshot surface — the player should be able to scan the list and know the one thing to do per city without opening each panel.

### 3.3 Per-city panel unrest section (`src/ui/city-panel.ts:345-362`)

Under the existing `data-pressure-row` breakdown, render `getUnrestRecommendations` in full: each positive row gets a matched "→ {action}: {detail}" sub-line, greyed when `availability !== 'now'`. The Appease/Concede buttons stay as the immediate-but-temporary option; the recommendations are the durable fixes.

### 3.4 Advisor honesty fix

- `src/ui/advisor-system.ts` `chancellor_unrest_warning` and `src/ui/notification-routing.ts` unrest-started / era-2-onset messages: replace the unconditional "build happiness improvements" with era-aware text. Before Era 3 (no happiness building unlockable): advise garrisoning, appeasing, acquiring luxuries, and — once `magistracy` exists — building a Courthouse. From Era 3: include happiness buildings.
- This is also a `.claude/rules/content-description-honesty.md` item (a standing message that promises a mechanic the player can't use).

### MR3 tests

- `tests/systems/unrest-guidance.test.ts` (new):
  - each row maps to its expected recommendation;
  - **negative:** `Empire overextension` does **not** recommend "Build a Courthouse" before `magistracy` is researched (it recommends researching it, or garrisoning);
  - **negative:** no recommendation to "build a happiness building" for an Era-2 civ;
  - `getTopUnrestLever` picks the largest positive row;
  - a courthoused city with its distance row already halved surfaces a *different* top lever than the same city without.
- `tests/ui/city-overview-panel.test.ts`: an unrest city renders exactly one top-lever line with the expected text; a calm city renders none (`.claude/rules/spec-fidelity.md` — "surface" is a real requirement, and a negative test proves non-members aren't surfaced).
- `tests/ui/city-panel.test.ts`: the unrest section renders a recommendation sub-line per positive pressure row; greyed styling when `availability !== 'now'`.
- Advisor: era-2 civ never receives "build happiness improvements"; era-3 civ does.

---

## Save, determinism, privacy

- **MR1:** `ActiveCrisis.curedUntilTurn?` is a new optional field inside the already-persisted `activeCrises` map — backward-safe, no numbered migration. All spread/immunity logic remains seeded (`seededLcg`) and reads only `state.turn` + crisis/city ids. `applyEmpireContainment` is a player/AI action, not turn processing, and returns a new state (no mutation).
- **MR2:** tech and building definitions are static code. The Courthouse effect is a pure function of `city.buildings` inside `getUnrestPressureBreakdown` — deterministic, no new state. No per-viewer data; the breakdown is already computed identically for AI and player.
- **MR3:** `unrest-guidance.ts` is a pure read over `state` for a given `cityId`; it surfaces only the acting player's own cities in UI (hot-seat privacy — same as the existing breakdown, which is already gated to `unrestLevel > 0` cities the panel is showing). No new persisted state.

## Verification contract

- TDD: failing focused tests first for each MR's rules and negative cases before implementation.
- Per MR, before PR: source-rule checks on changed files, focused mirrored tests, `git diff --check`, `yarn build`, `yarn test` (both exit 0), durable-suite status.
- MR2 additionally: full pacing outlier gate (`pacing-audit`, `pacing-reference-economy`) with any snapshot delta justified in the PR body.
- Each PR body follows `.claude/rules/incremental-mr-completion.md`: title names the MR, "Out of scope" lists the deferred arcs, "Why this is safe to merge partial" names every player-visible surface introduced.

## Open questions for review

1. **Retune magnitude (2.1).** Proposed overextension `(cityCount - 7) * 2` cap 24, distance onset `dist > 6`. Too soft / too aggressive? These are the numbers most likely to need a second pass against pacing snapshots.
2. **Courthouse cost & yield (2.3).** 55 production, `+1 gold`. Cheaper (so wide players actually build it in every city) or costlier (so it's a real opportunity cost)?
3. **Overextension relief shape (2.4).** Flat `-4` per courthoused city vs. a fraction of the row (e.g. ×0.5 like the distance row). Flat is simpler to reason about and to explain in the UI; fraction scales with empire size.
4. **`magistracy` name/cost (2.2).** "Magistracy" vs. "Provincial Administration" vs. "Civil Service"; cost 50 (≈ `philosophy` at 70, `drama-poetry` at 80).
5. **Empire-wide cure tech (1.3).** Gating on `medicine` (era 4). Correct tech, or should it be `epidemic-control` (era 6) for the base ability with `medicine` doing something weaker?
