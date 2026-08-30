# #919 Empire Unrest — Spread Fix, the Administration Ladder, and Actionable Guidance — Design

**Date:** 2026-08-29
**Issue:** #919
**Base:** `d18879633c74319dab26bc7fa42d666509326829` (`origin/main`)
**Delivery:** three sequenced MRs — MR1 (independent) → MR2 → MR3.

## Goal

A wide empire in the mid game (issue screenshot: turn 122, Era 2, 8+ cities, nearly every one in Unrest) has no workable answer to unhappiness. Three distinct problems:

1. **Funding a plague remedy does not stop the plague spreading.** Reported directly; confirmed as a logic gap.
2. **The UI gives no actionable guidance.** It shows a pressure breakdown and two gold-sink buttons, and the advisor recommends things that may not be possible.
3. **Wide empires have no scalable counter to sprawl pressure.** Distance and scale are *meant* to be real pressures, but a pressure with no affordable, era-appropriate counter is a punishment, not a decision.

This design keeps distance and scale as genuine pressures while giving every era a deliberate, bought counter (the **administration ladder**), fixes the plague bug, and makes the UI tell the player exactly which lever to pull.

## Resolved design decisions

These were settled during brainstorming and review; the rest of the doc assumes them.

| Decision | Choice |
|---|---|
| Scope | All three problems, sequenced MR1 → MR2 → MR3. |
| MR1 spread fix | Remedy halts spread **and** cured cities get brief re-infection immunity **and** a tech-gated empire-wide cure. Early game intentionally stays per-city (user-accepted: "keeps early game harder"). |
| MR2 balance shape | Reframe #3 as a **per-era administration ladder** — one stability lever per era. MR2 ships **rung 1 only** (Courthouse, Era 2) plus a **minimal** Era-2 curve nudge. The full ladder is documented as a roadmap; later rungs are follow-up MRs. The pressure curve itself barely moves. |
| Courthouse scope | Distance + overextension only. War-weariness / occupation unrest is a **separate later lever**, not part of MR2. |
| Courthouse ceiling | **Residual floor** — a courthoused city still pays at least `COURTHOUSE_SPRAWL_FLOOR` sprawl pressure if it had any. Scale always costs something. |
| MR2 new tech | New Era-2 civics tech `magistracy` unlocking `courthouse`. |
| Empire-wide cure gate | `medicine` (Era 4) for the base ability; `epidemic-control` (Era 6) additionally grants re-infection immunity to every treated city. |
| MR3 surfaces | Cities overview panel (quick one-line "top lever") + per-city panel unrest section (itemised) + advisor honesty fix. |

## Current-main audit

- **Outbreak spread** (`tickOutbreakCrisis`, `src/systems/crisis-system.ts:272-288`): the per-city spread roll `continue`s only for cities in `working.quarantinedCityIds`. It does **not** skip a city with a pending `remedyCompletionByCity` entry, even though the population-loss loop immediately above it (`:259-270`) does exactly that. A city whose remedy is underway keeps rolling a 20%/turn chance (`+0.15` if `spreadBoostPredicate`) to infect the geographically nearest healthy same-owner city for the two turns until the cure lands.
- **Per-city independent seeding:** each city's spread roll uses `seededLcg(nextState.turn * 104729 + hashString(working.id + cityId))` — a fresh seed derived from the city id, **not** a shared stream. Adding an early `continue` for a city therefore does **not** perturb any other city's roll; the change is determinism-safe.
- **Re-infection:** `applyRemedy` sets `remedyCompletionByCity[cityId] = state.turn + 2`; on completion the city is removed from `crisis.cityIds`. The spread candidate filter is `c.owner === owner && !working.cityIds.includes(c.id)` — a just-cured city is no longer in `cityIds`, so it is immediately eligible to be re-infected. In a dense cluster this is a permanent loop.
- **Famine** (`tickFamineCrisis`, `:378-394`): identical spread-loop shape, same missing remedy check. Fixed in parity.
- **`sabotage`** (`crisis.sabotage`, `src/core/types.ts:2598`): an unexpired `sabotage_relief` freezes `remedyCompletionByCity` progress entirely. Any new empire-wide cure must account for this.
- **No empire-wide crisis action exists.** `applyRemedy` and `applyQuarantine` are the only responses, both strictly per-city. There is no un-quarantine — quarantine lasts until the city leaves the crisis.
- **`ActiveCrisis` optional-field precedent** (`src/core/types.ts:2585-2601`): `quarantinedCityIds?`, `remedyCompletionByCity?`, `sabotage?`, `famineSurplusStreakByCity?` are all optional and were added without a numbered save migration. `curedUntilTurn?` follows the same pattern.
- **Unrest onset** (`processFactionTurn`, `src/systems/faction-system.ts:353`): `clearEraOneUnrestForCity` wipes unrest only while the owner's era is ≤ 1. Unrest is fully live from Era 2 on.
- **Pressure model** (`getUnrestPressureBreakdown`, `src/systems/faction-system.ts:47-122`) is the single source of truth — `computeUnrestPressure` (AI/turn processing) and the city-panel breakdown UI both read it. Rows are `{ label, amount }`; offsets (luxury, happiness buildings, serenity) are already emitted as their own negative rows. Sprawl-relevant rows:
  - `Empire overextension`: `min(30, max(0, (cityCount - 5) * 3))` — one row, identical value on every city of the civ.
  - `Distance from capital`: `min(20, max(0, (dist - 5) * 2))` — per city.
  - `War weariness`: `min(24, atWarCount * 8)`.
  - `Recent conquest`: `25`, or `13` with `constitutional-law`, for `CONQUEST_UNREST_DURATION` (15) turns.
  - `Economic strain`: era ≥ 3 only.
- **`UNREST_TRIGGER_PRESSURE = 40`** (`src/systems/faction-system.ts:17`). Unrest starts when pressure exceeds it and clears at ≤ it (or on garrison). `computeUnrestPressure` clamps the sum to `[0, 100]`.
- **No happiness building before Era 3.** `temple` requires `philosophy` (era 3); `amphitheater` requires `drama-poetry` (era 4). `monument` (`code-of-laws`, era 1) has no `happiness` field. In Era 2 the `Happiness buildings` offset is structurally 0, and the advisor's "build happiness improvements" line (`src/ui/advisor-system.ts:257`, `src/ui/notification-routing.ts:118`, `:462`) is a dead promise for a full era. This is also a `.claude/rules/content-description-honesty.md` violation.
- **Early civics track:** `tribal-council` (era 1, cost 4) → `code-of-laws` (era 1, cost 10) → `early-empire` (era 2, cost 25) → `state-workforce` (era 2, cost 25). Every Era-2 civics tech costs **25**. A new `magistracy` at cost 25 with prereq `code-of-laws` slots cleanly alongside `early-empire`.
- **`BuildingCategory`** (`src/core/types.ts:799`) = `'production' | 'food' | 'science' | 'economy' | 'military' | 'culture' | 'espionage'`. **No `'civics'`/`'government'` category.** `monument`, `temple`, `amphitheater` — the civic/social buildings — all use `'culture'`. Courthouse uses `'culture'` too; adding a category would ripple through every `switch` on `BuildingCategory` for no benefit.
- **AI building valuation** (`src/ai/ai-production.ts:219-225`): `buildingScore = yieldScore + (building.happiness ?? 0) * 1.5`, with a comment that it deliberately does **not** condition on current unrest pressure. **A building with no `happiness` field and a `+1 gold` yield scores ≈ 1 — near the bottom.** Without a fix, the AI will essentially never build a Courthouse (see MR2 §AI).
- **No existing `courthouse` / `magistracy` / `provincial` / `bureaucracy` identifiers** in `src/`.
- **Guidance surfaces:** `src/ui/city-overview-panel.ts` (the screenshot — sortable city list with Appease/Concede), `src/ui/city-panel.ts:345-362` (per-city unrest section with the `data-pressure-row` breakdown, text set via `data-*` + `textContent` — XSS-safe pattern per `.claude/rules/ui-panels.md`), `src/ui/advisor-system.ts`, `src/ui/notification-routing.ts`.

## Research summary

How comparable games and historical empires handle "too big to govern," and how each landed:

| Source | Mechanism | Outcome / lesson |
|---|---|---|
| **Civ IV** | Distance-to-palace *maintenance* (gold) + **Courthouse** (−50% upkeep) + secondary government seats (nearest-seat measurement) + late civic removing distance cost | The cited success. Every tier had an affordable, deliberate counter; wide play stayed viable but taxed; small empires stayed competitive. **This design borrows the Courthouse and the per-era progression directly.** |
| **Civ V** | Global happiness pool: −3/city, −1/pop, empire-wide | Killed infinite sprawl but felt punitive; one bad city hurt the whole empire; luxury counters were map-RNG dependent. **Lesson: keep pressure per-city.** |
| **Civ VI** | Per-city Loyalty, distance-weighted population pressure; counters = Governors, Amenities, policies; 0 → Free City | "Distance pressure with real counters" works; Governor scarcity keeps it a decision. A bit fiddly. |
| **Stellaris** | Administrative cap → sprawl penalty, with the means to raise the cap removed | Cautionary tale — players revolted at "no way to even try to solve it." **Lesson: a pressure with no counter reads as a punishment.** |
| **Humankind** | Per-city + empire Stability; counters = garrison, infrastructure, civics | Good bones, defanged by handing out too many free stability bonuses. **Lesson: counters that are too cheap/automatic collapse the decision space** — hence the Courthouse's production cost, tech gate, and residual floor. |
| **Old World** | Empire-size discontent; counters are dynasty *characters* assigned as governors | Ties the counter to the game's identity so managing sprawl *is* the fun. Informs the deferred Governors rung. |
| **History** | Persian satrapies / Roman provinces / Qin commanderies (delegated governance + fixed tribute); Roman & Persian roads, Mongol yam (distance-shrinking infrastructure); citizenship extension (shared identity); second capitals | Lasting empires used a *sequence* of administrative innovations as they grew — exactly the ladder. Failure modes: over-centralization, tribute ossification, reforms arriving after provinces had already drifted. |

Design principles taken forward: (a) keep distance & scale as real pressures; (b) **every era where a pressure exists needs an affordable, deliberate counter** — the ladder; (c) counters are choices you spend on, not auto-includes; (d) pressure stays per-city; (e) wide play should have a build identity ("administrative empire").

---

## Design spine — the administration ladder

Problem #3, reframed: **each era has its own scale problem, and each era should have a stability lever that answers it.** The player who wants to play wide is opting into a build — an "administrative empire" — the same way a tall player opts into a science or wonder build.

| Era | The era's scale pain | Planned rung | Status |
|---|---|---|---|
| 2 | Distance + raw city count with zero infrastructure | **Courthouse** (this spec, MR2) | **In this spec** |
| 3–4 | Far provinces are unreachable / disconnected | Road & post network reduces *effective* distance to the capital (reuses the road system + `military-logistics`) | Roadmap |
| 4–5 | Sheer number of cities regardless of distance | Second seat of government — wonder or national project; distance measured to the *nearest* seat | Roadmap |
| 5–6 | Bureaucratic load; the "free city" allowance is too low for the era | Civil Service / bureaucracy building or civic that raises the overextension threshold | Roadmap |
| 7–8 | Industrial-era empire spanning continents | Telegraph / railway administration — a further effective-distance cut | Roadmap |
| 9+ | Modern federation | Federalism civic / autonomy (confederation) stance — large relief for reduced treasury remittance | Roadmap |

Orthogonal to the ladder (separate arcs, not rungs):

- **War-weariness & occupation relief** — martial-law stance / garrison policy / `constitutional-law` tuning. Answers the `War weariness` and `Recent conquest` rows, which the ladder deliberately does not touch (per resolved decisions). The issue screenshot's civ is a conqueror, so this arc matters, but it is out of scope here.
- **Governors** — a capped set of assignable administrators giving per-city relief; Civ VI + satrapy flavour; a cross-era layer.

Everything below the Courthouse in that table is **roadmap only** — no code, no definitions, no tests in these three MRs. It is documented so future MRs slot in as new *data-table entries* (see MR2 §Extensibility), not new branches.

---

## Constants (all proposed; final values ride the pacing gate — MR2 §Testing)

| Constant | File | Proposed | Rationale |
|---|---|---|---|
| `OUTBREAK_CURE_IMMUNITY_TURNS` | `crisis-system.ts` | `3` | Shorter than plague `autoExpireTurns` (5); long enough to break the whack-a-mole. |
| `OVEREXTENSION_FREE_CITIES` (was literal `5`) | `faction-system.ts` | `6` | The *minimal* Era-2 nudge — one extra free city. Courthouse does the real work. |
| `COURTHOUSE_DISTANCE_RELIEF_FRACTION` | `faction-system.ts` | `0.5` | Halves the distance row, Civ IV Courthouse. |
| `COURTHOUSE_OVEREXTENSION_RELIEF` | `faction-system.ts` | `3` | One courthouse ≈ offsets one "extra city" at the pre-nudge slope. |
| `COURTHOUSE_SPRAWL_FLOOR` | `faction-system.ts` | `2` | A courthoused city that *had* sprawl pressure still pays ≥ 2. "Scale always costs something." |
| `courthouse.productionCost` | `city-system.ts` | `55` | Between `monument` (30) and `library`-tier; a real opportunity cost per city. |
| `magistracy.cost` | `tech-definitions-eras1-4.ts` | `25` | Matches every Era-2 civics peer. |
| `UNREST_RELIEF_AI_WEIGHT` | `ai-production.ts` | `0.75` | 2 pressure ≈ 1 happiness (`faction-system.ts` unrest maths); happiness scalar is `1.5`; `1.5 / 2 = 0.75`. |
| `UNREST_RELIEF_AI_URGENCY_MULT` | `ai-production.ts` | `2` | Applied when the city's pressure ≥ `0.6 * UNREST_TRIGGER_PRESSURE`. |

---

## MR1 — Outbreak spread fixes

Standalone bugfix. No balance or UI dependency. Resolves reported problem #1.

### 1.1 Remedy halts spread

In the spread loop of `tickOutbreakCrisis` **and** `tickFamineCrisis` (parity), skip a city that has an in-progress remedy — mirroring the population-loss loop that already does this:

```ts
for (const cityId of [...working.cityIds]) {
  if (working.quarantinedCityIds?.includes(cityId)) continue;
  if (working.remedyCompletionByCity?.[cityId] !== undefined) continue; // NEW
  ...
}
```

Rationale and rebalance note: quarantine (free, instant, stops spread, doubled yield penalty, does not cure) and remedy (gold, 2 turns, mild penalty, cures) stay distinct — after this change remedy *also* stops outbound spread, so it strictly dominates quarantine **only when you can afford it and can wait two turns**. Quarantine remains the "broke / need it stopped this turn" tool. This does not make plague trivial for a rich empire — the cure cost is unchanged and pop-loss on `veteran` (where `autoExpireTurns` is null) still bites uncured cities.

### 1.2 Post-cure re-infection immunity

- New optional field on `ActiveCrisis` (`src/core/types.ts`): `curedUntilTurn?: Record<string, number>` (city id → turn through which that city cannot be re-infected **by this crisis**). Optional → no save migration (matches `remedyCompletionByCity?` etc.).
- When a remedy completes and a city leaves `cityIds` (both resolvers' "Remedy completion" block), set `curedUntilTurn[cityId] = state.turn + OUTBREAK_CURE_IMMUNITY_TURNS`.
- Spread candidate filter gains: a city with `curedUntilTurn[c.id] !== undefined && curedUntilTurn[c.id] >= state.turn` is not a candidate.
- Per-crisis only: a *different* later outbreak can still strike the city. Prune stale entries (`< state.turn`) each tick so the map stays bounded.

### 1.3 Tech-gated empire-wide cure ("Nationwide Remedy")

- New export `applyEmpireContainment(state, crisisId): { success, state, message }` in `crisis-system.ts`.
- **Gate:** target civ's `techState.completed` includes `medicine`. With `epidemic-control` also completed, every treated city additionally gets `curedUntilTurn` set (so a re-seed can't instantly undo the effort).
- **Refuse when sabotaged:** if `crisis.sabotage` is unexpired, return `success: false` with a message ("Relief efforts are being sabotaged — resolve that first"). Buying a cure that silently won't progress is a UX trap.
- **Effect:** for every city in `crisis.cityIds` **without** a pending remedy, set `remedyCompletionByCity[cityId] = state.turn + 2` in one action. It starts the standard 2-turn remedy everywhere at once; it does not instantly clear the crisis.
- **Cost:** exactly `Σ getCityAppeaseCost(city)` over those cities — **no bulk discount** (a discount would reward letting the plague spread before acting). Fails with a message on insufficient gold. No-ops safely (`success: false`, no charge) if no city qualifies.
- **UI:** one button in the outbreak crisis section of `city-panel.ts`, rendered only when the acting civ has `medicine` and the crisis spans ≥ 2 cities. New callback `onEmpireContainment?(crisisId)` threaded exactly like `onRemedyCrisis` (returns `GameState | void`; the harness re-renders the panel). Built with `createGameButton` / 44px target (`.claude/skills/button-styling.md`); if the surrounding legacy crisis buttons are bare inline-styled, match their pattern and note the debt rather than migrating them here.
- **Notification:** new `crisis:*` event fired **once** by `applyEmpireContainment` (not re-derived from a steady-state scan — `.claude/rules/end-to-end-wiring.md` "Transition Events must be transition-owned"), routed through `notification-routing.ts` and mapped to the existing crisis-action sound.
- **AI:** AI civs invoke `applyEmpireContainment` from their crisis-handling path when they have `medicine`, ≥ 2 owned cities are infected, and they can afford it — same actor-completeness rule as remedy/quarantine.

### MR1 does not, alone, rescue a broke wide Era-2 empire

By explicit decision the empire cure is Era-4-gated, so the screenshot player (Era 2, ~400 gold, 8 infected pop-9 cities ≈ 1000 gold to remedy individually) still cannot cure everything at once. What MR1 *does* give them: their existing per-city remedy spending finally halts spread from the cities they treat (1.1), and cured cities stop bouncing back (1.2). Full relief for that player comes from **MR1 + MR2 together** — MR2 pulls most of their cities out of unrest, freeing gold and attention for per-city plague management, with the existing free per-city Quarantine as the last-resort backstop. *(A free "Quarantine all infected cities" batch action is deliberately not included — it was not among the sanctioned MR1 changes and mass-quarantine's doubled yield penalty is a footgun. It can be added on request.)*

### MR1 tests (`tests/systems/crisis-outbreak.test.ts`, `crisis-famine.test.ts`, `crisis-system.test.ts`)

- Remedy-underway city does **not** appear as a spread source under a seed that would otherwise spread; famine parity.
- Determinism: the spread outcome for cities *other than* the skipped one is byte-identical before/after the change (per-city independent seeding).
- A just-cured city is **not** re-infected while `state.turn <= curedUntilTurn`, and **is** eligible again after it lapses.
- `curedUntilTurn` stale-entry pruning keeps the map bounded across many turns.
- `applyEmpireContainment`: negative (no `medicine` → `success:false`, no state change); negative (crisis sabotaged → `success:false`); positive (starts a remedy in every infected city, charges exact `Σcost`, fails on insufficient gold); with `epidemic-control`, treated cities also get `curedUntilTurn`; emits its transition event exactly once across repeated ticks.
- AI parity: an AI civ with the tech and budget auto-contains a ≥ 2-city outbreak; an AI civ without `medicine` does not.
- Hot-seat: the Nationwide Remedy button is shown only for a crisis whose `targetCivId === state.currentPlayer`, and the action charges the correct civ.

---

## MR2 — Administration ladder, rung 1: Courthouse

Depends on nothing; must land before MR3 (MR3 recommends the Courthouse and `magistracy`).

### 2.1 Minimal Era-2 curve nudge

Replace the literal `5` in the overextension formula with `OVEREXTENSION_FREE_CITIES = 6`. **Nothing else changes** — slope stays `3`, cap stays `30`, distance formula untouched, `UNREST_TRIGGER_PRESSURE` stays `40`. This is the whole "retune": one extra free city so a modest early empire that hasn't teched `magistracy` yet is not instantly in revolt. The Courthouse is the actual answer.

At 8 cities the overextension row goes `9 → 6`. Existing `faction-system.test.ts` assertions that pin the old number are expected to change and will be updated in the PR with the new values listed.

### 2.2 New Era-2 civics tech: `magistracy`

`src/systems/tech-definitions-eras1-4.ts`:

```ts
{ id: 'magistracy', name: 'Magistracy', track: 'civics', cost: 25,
  prerequisites: ['code-of-laws'], era: 2,
  unlocks: ['Provincial courts reduce unrest from distance and overextension'],
  unlocksBuildings: ['courthouse'],
  pacing: { band: 'infrastructure', role: 'stability-civics', impact: 1.05,
            scope: 'empire', snowball: 1.0, urgency: 1.1, situationality: 1.2, unlockBreadth: 1 } }
```

- `unlocks` is effect-text only, no bare entity name (`tech-unlocks-consistency.test.ts`).
- Name "Magistracy" chosen over "Provincial Administration" / "Civil Service" (shorter, era-appropriate, and leaves "Civil Service" free for a later ladder rung).
- Pacing block mirrors `monument`/infrastructure-band conventions; must pass `pacing-model.test.ts` band validation.

### 2.3 New building: `courthouse`

`src/systems/city-system.ts` `BUILDINGS`:

```ts
courthouse: { id: 'courthouse', name: 'Courthouse', category: 'culture',
  yields: { food: 0, production: 0, gold: 1, science: 0 }, productionCost: 55,
  techRequired: 'magistracy',
  description: 'Seat of provincial law. Cuts this city’s unrest pressure from distance to the capital and from empire overextension (a courthoused city still carries a little).',
  pacing: { band: 'infrastructure', role: 'stability', impact: 1.05, scope: 'city',
            snowball: 1.05, urgency: 1.1, situationality: 1.3, unlockBreadth: 1 } }
```

- `category: 'culture'` — the civic/social bucket (`monument`, `temple`, `amphitheater`). No new category.
- `+1 gold` so the AI yield term isn't zero and a tall player gets a crumb of value; it is **not** a `happiness` building (its effect is targeted row-relief).
- `PRODUCTION_ICONS['courthouse'] = '⚖️'` in the same file.
- `magistracy.unlocksBuildings` lists `courthouse` (2.2) — `tech-unlocks-consistency.test.ts` enforces the pairing.
- One per city (standard build-system behaviour); the effect keys off `city.buildings.includes('courthouse')` so it is boolean-safe regardless.

### 2.4 Courthouse effect — a dedicated relief row, table-driven

The effect is emitted as **its own negative breakdown row**, exactly like `Happiness buildings` — never by editing the distance/overextension formulas in place. Transparent to the player (they see `Courthouse −5` appear when they build it), additive, and independently testable.

New helper in `faction-system.ts`, consumed by `getUnrestPressureBreakdown` after it builds the positive rows:

```ts
interface UnrestReliefSource {
  id: string;
  isActive(city: City, state: GameState): boolean;
  // returns zero or more negative rows given the positive rows already computed
  reliefRows(city: City, state: GameState, positiveRows: UnrestPressureRow[]): UnrestPressureRow[];
}

const UNREST_RELIEF_SOURCES: UnrestReliefSource[] = [COURTHOUSE_RELIEF];
// future ladder rungs (roads, second seat, civil service, governors) append here — no new branches.

export function getUnrestReliefRows(city, state, positiveRows): UnrestPressureRow[] {
  return UNREST_RELIEF_SOURCES.flatMap(s => s.isActive(city, state) ? s.reliefRows(city, state, positiveRows) : []);
}
```

`COURTHOUSE_RELIEF.reliefRows` computes, from the already-built positive rows:

```
distanceRow      = amount of the 'Distance from capital' row (0 if absent)
overextensionRow = amount of the 'Empire overextension' row (0 if absent)
rawSprawl        = distanceRow + overextensionRow
uncapped         = round(COURTHOUSE_DISTANCE_RELIEF_FRACTION * distanceRow)
                 + min(COURTHOUSE_OVEREXTENSION_RELIEF, overextensionRow)
relief           = min(uncapped, max(0, rawSprawl - COURTHOUSE_SPRAWL_FLOOR))
=> row: { label: 'Courthouse', amount: -relief }   // omitted entirely if relief === 0
```

This guarantees `rawSprawl - relief >= COURTHOUSE_SPRAWL_FLOOR` whenever `rawSprawl` was above the floor (residual floor — resolved decision), never relieves more sprawl than exists, and composes cleanly with the existing `[0,100]` clamp in `computeUnrestPressure`.

Worked examples, post-2.1 nudge (`overext row = min(30, max(0, (cities - 6) * 3))`; `dist row = min(20, max(0, (hexDist - 5) * 2))`):

| Scenario | dist row | overext row | rawSprawl | Courthouse relief | net sprawl |
|---|---|---|---|---|---|
| 8 cities, city 9 hexes out | 8 | 6 | 14 | `round(.5·8) + min(3,6) = 7` | 7 |
| 12 cities, city 6 hexes out | 2 | 18 | 20 | `round(.5·2) + min(3,18) = 4` | 16 |
| 20 cities, city 12 hexes out | 14 | 30 (cap) | 44 | `round(.5·14) + min(3,30) = 10` | 34 |
| 7 cities, city ≤5 hexes out | 0 | 3 | 3 | `min(1+3, 3−2) = 1` | 2 (floor) |

A big empire still carries real sprawl pressure; a modest one that over-settled by a city or two can courthouse its way back to the floor. (These are per-city figures for one courthoused city; the overextension row is the same on every city of the civ, so each city needs its own Courthouse to shed its own share.)

### 2.5 AI valuation (fixes review defect B1)

`buildingScore` in `src/ai/ai-production.ts` currently cannot see unrest relief. Extend it **generically** — no `courthouse` ID branch:

```ts
// after the existing yield + happiness terms
let reliefScore = 0;
for (const s of UNREST_RELIEF_SOURCES) {
  if (s.id !== buildingId) continue; // relief sources are keyed to a building id
  const before = computeUnrestPressure(cityId, state, ownerHappiness);
  const after  = computeUnrestPressure(cityId, withBuilding(state, cityId, buildingId), ownerHappiness);
  const drop = Math.max(0, before - after);
  const urgent = before >= 0.6 * UNREST_TRIGGER_PRESSURE;
  reliefScore = drop * UNREST_RELIEF_AI_WEIGHT * (urgent ? UNREST_RELIEF_AI_URGENCY_MULT : 1);
}
return yieldScore + happinessScore + reliefScore;
```

- Conditioning on actual pressure (unlike the flat happiness term) is defensible here: a Courthouse in a 3-city tall empire genuinely *is* worthless, and the AI should not waste production on it.
- `withBuilding` is a shallow helper that returns a state with the building appended to that city's `buildings` — pure, no mutation.
- **AI tech valuation:** confirm the AI's tech chooser already weights `unlocksBuildings` value (so a now-valued Courthouse pulls `magistracy` in for a pressured wide AI). If it does not, add `magistracy` to whatever "priority when unrest is high" civics hook exists — again generically where possible. Covered by a test: an AI with a wide, high-pressure empire researches `magistracy` within N turns and queues Courthouses; a tall low-pressure AI does neither.

### 2.6 `game-balance.md`

Add an **"Unrest Relief Inventory"** table (parallel to the Happiness Inventory), seeded with the Courthouse row, plus the rule that any future distance/overextension/unrest-relief source (ladder rung or otherwise) must add a row and register in `UNREST_RELIEF_SOURCES`.

### MR2 tests

- `tests/systems/faction-system.test.ts`:
  - `OVEREXTENSION_FREE_CITIES = 6` produces the new expected values at representative city counts; updated assertions listed in the PR body.
  - Courthouse emits a `Courthouse` negative row equal to the formula above at each worked-example point; **negative test** — same city without a courthouse gets no such row and full sprawl pressure (`.claude/rules/spec-fidelity.md`: a gated effect needs a proof the gate matters).
  - Residual floor: a courthoused city that had sprawl pressure never nets below `COURTHOUSE_SPRAWL_FLOOR`.
  - `computeUnrestPressure` stays within `[0,100]` when the Courthouse row would otherwise drive a city negative.
  - A civ at ≤ `OVEREXTENSION_FREE_CITIES` cities gets no overextension row at all (so no Courthouse row either).
- `tests/systems/faction-happiness.test.ts`: Courthouse row composes additively with luxury / serenity / happiness-building rows; no double counting.
- `tests/systems/city-system.test.ts`: `courthouse` has a `PRODUCTION_ICONS` entry and a well-formed `BUILDINGS` entry (existing coverage regressions).
- `tests/systems/tech-unlocks-consistency.test.ts`: `magistracy.unlocksBuildings` contains `courthouse`; `magistracy.unlocks` has no bare entity name.
- `tests/systems/pacing-model.test.ts`: the new `magistracy` and `courthouse` pacing blocks validate.
- AI: the eligible-building-catalog → AI-candidate comparison test includes `courthouse`; a new test asserts a wide high-pressure AI actually queues it and a tall AI does not; the `magistracy` research test above.
- `tests/systems/pacing-audit.test.ts` + `tests/systems/pacing-reference-economy.test.ts`: full-catalog outlier gate re-run. If a reference-economy era snapshot shifts, the PR includes the new numbers + a one-line justification (`.claude/rules/game-balance.md` "Pacing Regression Prevention"). Only the `+1 gold` Courthouse yield and the `magistracy` cost touch the economy; expected drift is small.
- **Save regression:** load a fixture save with a city currently at `unrestLevel > 0`; after the retune + (optionally) a Courthouse in `city.buildings`, the next `processFactionTurn` recomputes and the city de-escalates as expected — no migration, no crash.

---

## MR3 — Actionable unrest guidance — ✅ implemented (PR #925)

Depends on MR2 (recommends the Courthouse / `magistracy`).

> **Implementation note (PR #925):** `Recent conquest` resolves to `await-conquest-settle`
> (actionable now) as the primary lever, not `research-constitutional-law` — that tech is
> Era 5-7, so it is a secondary `params.suggestConstitutionalLaw` note in the copy layer, not
> the top recommendation. The advisor `chancellor_unrest_warning` message was already free of
> the "build happiness improvements" dead promise; the two real offenders were
> `notification-routing.ts` lines 118 and 462, both fixed.

### 3.1 Shared helper: `src/systems/unrest-guidance.ts` — typed, string-free

Single source of truth for "given this city's pressure breakdown, what should the player do?" It returns **structured recommendation data with no display strings** — the UI layer owns text, icons, and panel links (review defect B3 / `.claude/rules/ui-panels.md` layering).

```ts
export type UnrestRecommendationKind =
  | 'build-courthouse' | 'research-magistracy'
  | 'garrison-unit' | 'train-garrison-unit'
  | 'make-peace' | 'await-conquest-settle' | 'research-constitutional-law'
  | 'fix-economy' | 'counter-espionage' | 'stabilise-contagion-source'
  | 'build-faith-building' | 'acquire-luxury' | 'build-happiness-building'
  | 'appease-or-concede'; // fallback

export interface UnrestRecommendation {
  kind: UnrestRecommendationKind;
  rowLabel: string;                 // which pressure row it addresses ('' for the fallback)
  amount: number;                   // that row's current contribution
  availability: 'now' | 'research-first' | 'blocked';
  params?: Record<string, unknown>; // e.g. { warCivIds }, { sourceCityId }, { techId }, { luxuryIds }
}

export function getUnrestRecommendations(cityId: string, state: GameState): UnrestRecommendation[];
export function getTopUnrestLever(cityId: string, state: GameState): UnrestRecommendation | null;
```

**Table-driven resolver** (open/closed — a future pressure row or ladder rung is a new entry, not a new `if`; mirrors `NP_PRODUCTION_DISCOUNTS`):

```ts
interface GuidanceResolver {
  matchesRow(label: string): boolean;
  resolve(ctx: { city: City; state: GameState; row: UnrestPressureRow }): UnrestRecommendation | null;
}
const UNREST_GUIDANCE_RESOLVERS: GuidanceResolver[] = [ /* one per row family */ ];
```

Resolvers reuse existing availability helpers — no reimplementation: tech checks against `civ.techState.completed`, `getAvailableBuildings` / `getTrainableUnitsForCiv` for buildability, `canGarrisonCity` and a units-near/for-city check for garrison vs. train, `civ.diplomacy.atWarWith` for peace, `getEconomyStatusForCiv` for strain, resource helpers for luxuries.

Row → recommendation:

| Pressure row | `kind` (availability logic) |
|---|---|
| `Empire overextension` / `Distance from capital` | `build-courthouse` (`now` if `magistracy` done & city lacks it) → else `research-magistracy` (`research-first`, if `code-of-laws` done) → else `garrison-unit` (`now` if a spare military unit exists) → else `train-garrison-unit` (`now`, notes production cost) |
| `War weariness` | `make-peace` (`now`; `params.warCivIds`) |
| `Recent conquest` | `await-conquest-settle` (`now`; `params.turnsLeft`, `params.canGarrison`) + `research-constitutional-law` if not yet researched and it would halve the row |
| `Economic strain` | `fix-economy` (`now`; `params.unpaidMaintenance`) |
| `Enemy espionage` | `counter-espionage` (`now`) |
| `Uprising contagion` | `stabilise-contagion-source` (`now`; `params.sourceCityId`) |
| `Foreign faith pressure` | `build-faith-building` (`now` if `philosophy` done, else `blocked` with an era note) |
| no `Luxury resources` row and none owned | `acquire-luxury` (`now`; `params.luxuryIds` reachable if cheap to compute) |
| no `Happiness buildings` row **and** a happiness building's tech is done | `build-happiness-building` (`now`) — **never emitted before that tech exists** (kills the Era-2 dead promise) |
| none of the above / all blocked | `appease-or-concede` (`now`) |

`getTopUnrestLever`: iterate positive rows by `amount` descending; return the first whose recommendation is `availability === 'now'`; if none are `now`, return the highest row's recommendation as-is; if there are no positive rows, return `appease-or-concede`. Deterministic; the row-scan order and the resolver order are both fixed.

### 3.2 Cities overview panel (`src/ui/city-overview-panel.ts`)

For each city with `unrestLevel > 0`, render one line under the yields (above the Appease/Concede buttons): the icon + plain-language text for `getTopUnrestLever`, with a compact availability marker. All text via `textContent` / `createTextNode` — never `innerHTML` (game-generated content). Examples of the UI-layer mapping (`kind` → copy), written for a 7-year-old as much as a 43-year-old, jargon-free, and naming where to go:

- `build-courthouse` → "⚖️ Build a Courthouse here (City screen)"
- `research-magistracy` → "🔬 Research Magistracy first (Tech screen)"
- `make-peace` → "🕊️ Make peace — you're at war with 2 empires (Diplomacy)"
- `garrison-unit` → "⚔️ Move a soldier into this city"
- `await-conquest-settle` → "⏳ New conquest — calms down in 6 turns"

### 3.3 Per-city panel unrest section (`src/ui/city-panel.ts:345-362`)

Under the existing `data-pressure-row` breakdown, render every `getUnrestRecommendations` entry as a "→ {text}" sub-line beneath its matching row, greyed when `availability !== 'now'`. Same `textContent` discipline. Appease/Concede stay as the immediate-but-temporary option; the recommendations are the durable fixes. Panel re-renders after any recommendation-driven action via the existing callback-returns-`GameState` pattern.

### 3.4 Advisor honesty fix

`src/ui/advisor-system.ts` `chancellor_unrest_warning` and the `src/ui/notification-routing.ts` unrest-started / Era-2-onset messages: replace the unconditional "build happiness improvements" with era-aware text derived from the same availability logic as 3.1. Before any happiness-building tech: advise garrison / appease / luxuries / — once `magistracy` exists — Courthouse. From Era 3: include happiness buildings. (`.claude/rules/content-description-honesty.md`.)

### MR3 tests

- `tests/systems/unrest-guidance.test.ts` (new):
  - each row maps to its expected `kind`;
  - **negative:** `Empire overextension` does **not** yield `build-courthouse` before `magistracy` (it yields `research-magistracy`, or a garrison kind);
  - **negative:** no `build-happiness-building` for an Era-2 civ; **positive:** it appears for an Era-3 civ with `philosophy`;
  - `garrison-unit` vs `train-garrison-unit` flips on whether a spare unit exists;
  - `getTopUnrestLever` picks the largest row that is `now`-actionable; falls through to the largest row when none are; falls back to `appease-or-concede` with no positive rows;
  - a courthoused city (distance row already reduced) surfaces a different top lever than the same city un-courthoused.
- `tests/ui/city-overview-panel.test.ts`: an unrest city renders exactly one top-lever line with the expected copy for its `kind`; a calm city renders none; the line is computed for `state.currentPlayer` (hot-seat: correct when player 2 is active), not player 0 (`.claude/rules/ui-panels.md`).
- `tests/ui/city-panel.test.ts`: the unrest section renders a recommendation sub-line per positive row; greyed style when `availability !== 'now'`; no `innerHTML` with generated strings.
- Advisor: an Era-2 civ never receives "build happiness improvements"; an Era-3 civ does.

---

## AI & difficulty (cross-cutting)

- **B1 fixed in MR2 §2.5** — the AI values Courthouse by simulated pressure drop, scaled up when the city is actually pressured; researches `magistracy` when wide and pressured. Without this, higher difficulty (stronger AI) would *invert* as AI wide empires broke apart while humans thrived.
- **MR1:** AI uses `applyEmpireContainment` on the same conditions a reasonable player would. Parity tests cover the human path and the AI path for every new shared consequence (`.claude/rules/end-to-end-wiring.md`).
- **Difficulty scaling:** base unrest pressure is **not** challenge-scaled today (`computeUnrestPressure` has no challenge multiplier except contagion). The 2.1 nudge and the Courthouse row are likewise uniform across difficulties — deliberate; wide play should cost the same to stabilise regardless of AI strength. `autoExpireTurns` / pop-loss *are* challenge-scaled, so MR1's "remedy halts spread" is proportionally more valuable on `veteran` (plague never self-ends there) — the tests include a `veteran` case.
- **MR3** is UI-only and AI-agnostic, but `unrest-guidance.ts` is a pure helper the AI *could* later reuse to pick stability actions — noted, not wired.

## UI / UX (cross-cutting)

- All new/changed dynamic text: `textContent` / `createTextNode`, never `innerHTML` with game strings.
- New buttons: `createGameButton` per `.claude/skills/button-styling.md`, `min-height: 44px`; match the surrounding crisis-section style if those are legacy bare buttons, and record the debt rather than migrating in-scope.
- Every action re-renders its panel through the existing `callback → GameState` path.
- Recommendation copy is plain-language, icon-led, and names the destination screen — legible to the 7-year-old end of the audience; no new jargon ("Empire overextension" the row label stays, but the *advice* says "your empire is large and spread out").
- The three guidance surfaces are layered, not redundant: the advisor fires once on the unrest-start *event*; the panels are pull-only (shown when the player opens them). No new toasts.
- No new animation; nothing gated on motion settings.

## Audio

No new SFX assets. The Nationwide Remedy action reuses the existing crisis-action sound; Courthouse completion uses the generic building-complete sound. Add the new `crisis:*` notification type to `notification-routing.ts`'s sound mapping so it is not silent. (Test-run hygiene: `preview_stop` after any browser smoke test — game audio plays through real speakers.)

## Save compatibility

- **MR1:** `ActiveCrisis.curedUntilTurn?` is optional, inside the already-persisted `activeCrises` map — backward-safe, no numbered migration, matching the `remedyCompletionByCity?` / `sabotage?` precedent. Confirm at implementation time whether the repo's "new persisted field = one numbered migration" convention wants a no-op entry in `save-migrations` for discoverability; if so, add a default-preserving one.
- **MR2:** no new persisted fields. `'courthouse'` is a new possible entry in the existing `city.buildings: string[]`; `'magistracy'` a new possible entry in `techState.completed` — neither needs a migration. An existing save benefits on load: the next `processFactionTurn` recomputes pressure with `OVEREXTENSION_FREE_CITIES = 6` and any Courthouse rows, and over-pressured cities de-escalate automatically. Covered by the MR2 save-regression test.
- **MR3:** no save changes.

## Determinism, privacy, hot-seat

- All crisis logic stays seeded (`seededLcg`) and reads only `state.turn` + entity ids; per-city spread seeding means MR1's skip does not shift any other city's RNG.
- Turn processing stays immutable — the crisis resolvers already thread `working`/`nextState`; new code follows suit; `applyEmpireContainment` / `withBuilding` return new state.
- The Courthouse relief is a pure function of `city.buildings`; `unrest-guidance.ts` is a pure read. Both are computed identically for AI and player.
- Hot-seat: every guidance surface is computed for `state.currentPlayer`; the Nationwide Remedy button only appears for a crisis the current player owns; the overview panel already lists only the current player's cities. Tests assert player-2-active correctness (`.claude/rules/ui-panels.md` "cities[0] is never the answer").

## Does this solve #919?

- **#1 (plague keeps spreading despite remedies):** yes — `1.1` makes funded remedies actually halt spread from treated cities; `1.2` stops cured cities bouncing back; `1.3` gives large empires a decisive Era-4+ option. Early-game per-city play stays hard by explicit decision, mitigated by MR2 freeing up the player's resources.
- **#2 (no actionable guidance):** yes — MR3 turns the pressure breakdown into specific, availability-checked "do this" steps in both the overview and per-city panels, and stops the advisor promising impossible actions.
- **#3 (wide empires have no scalable counter):** partially, by design and by decision — the **administration ladder** gives Era 2 its rung now (Courthouse) with a documented roadmap for later eras; the minimal curve nudge removes the Era-2 dead-zone. **War-weariness and recent-conquest pressure are deliberately not addressed here** (resolved decision — separate later arc), so a conquest-heavy empire like the screenshot civ will still see unrest driven by those rows and MR3 will (honestly) tell it to make peace, garrison, or wait. If play-testing shows that residual is unacceptable, the war/occupation arc is the next thing to schedule.

Numeric check on the screenshot (Era 2, 8 cities): overextension `9 → 6` (nudge); a Courthouse in a distant city adds `Courthouse −7`, taking that city's sprawl contribution from ~14 to 7; combined with peace / garrisons on the war and conquest rows, cities drop back under the 40 trigger. The sprawl half is solved; the war/conquest half is surfaced, not solved.

## Verification contract

- TDD: failing focused tests first for each MR's rules and negative cases before implementation.
- Per MR before PR: source-rule checks on changed files, focused mirrored tests, `git diff --check`, `yarn build` and `yarn test` (both exit 0), durable-suite status.
- MR2 additionally: the full pacing outlier gate (`pacing-audit`, `pacing-reference-economy`, `pacing-model`) with any snapshot delta justified in the PR body.
- Each PR body per `.claude/rules/incremental-mr-completion.md`: title names the MR; "Out of scope" lists the deferred ladder rungs and the war/occupation arc; "Why this is safe to merge partial" names every player-visible surface the MR introduces and confirms no dead-end UX (e.g. MR2's Courthouse is a complete, usable building on its own; MR3's recommendations only ever point at actions that exist).
