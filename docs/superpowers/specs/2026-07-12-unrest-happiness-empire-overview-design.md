# Unrest Pacing + Honest Happiness + Empire City Overview — Design (#552)

**Status:** Approved via brainstorming session 2026-07-12. Supersedes the unmerged
`2026-07-11-bug-arc-mr4-unrest-pacing-happiness.md` plan (PR #558, closed unmerged),
which predates the #354 uprising-contagion/concession MR that has since landed on
`main` and changes several of that plan's assumptions. See "Drift from the original
MR4 plan" below.

## Problem

Issue [#552](https://github.com/a1flecke/conquestoria/issues/552) reports three
original complaints plus two follow-up comments:

1. The 5-turn unrest-to-revolt window is too short.
2. No building's description says it helps happiness, and in fact **no building
   grants happiness at all** — yet the unrest warning and the era-2 primer both
   tell the player to "build happiness improvements." This is the MR12
   content-description-honesty bug class: a promised mechanic that doesn't exist.
3. It's unclear which resources help with happiness.
4. (Comment) There's no quick way to see which cities are in unrest — only by
   opening each city's panel one at a time.
5. (Comment) Concede and Appease (added by the unrelated #354 MR after the
   original issue was filed) have no explanation of what each does or when to
   pick one over the other.

## Drift from the original MR4 plan

A drift check against the current codebase (2026-07-12) found:

- **`computeUnrestPressure` now includes a contagion pressure term**
  ([faction-system.ts:81](../../src/systems/faction-system.ts)) from the #354 MR.
  The original plan's pressure-breakdown row list predates this and omits it —
  implementing it as originally written would ship an incomplete breakdown.
- **Concede/Appease buttons already exist** in `city-panel.ts` (from #354) with
  cost-only tooltips and no explanation of the trade-off — this is exactly
  complaint #5 above, unaddressed by the original plan because the buttons
  didn't exist when it was written.
- **`sacred_grove` is a national project, not a regular building** — it has
  `uniquePerEmpire: true` and `nationalProject: { homeEra: 1 }`. The original
  plan listed it as one of four buildings to receive a flat per-city
  `happiness` field, which would be wrong: national projects are empire-wide by
  contract (`.claude/rules/game-balance.md` — "No `cityYieldBonus` on national
  projects — effects must be empire-wide"), and a per-city field would only
  affect the single city that happens to host the unique project. This design
  swaps `sacred_grove` for **`monastery`** (era 5, `monastic-orders`, a regular
  per-city culture building) to keep the four-building happiness set honest and
  free of the national-project ceiling questions entirely.
- **The resource legend already exists** in `icon-legend.ts` (name + icon,
  filtered by researched tech) — it's just missing effect text. This is a
  smaller task than "build a resource reference from scratch."
- **The city panel already shows owned resources' effects** (`resourceBonusSectionHtml`,
  `city-panel.ts:147-198`) including a `"{icon} {name} → +1 happiness"` row per
  owned happiness resource. This already partly answers complaint #3 for
  resources the player has; the gap is specifically the tech-revealed-but-not-yet-owned
  list in the legend, which shows no effect text at all.

## Goals

1. `REVOLT_UNREST_TURNS`: 5 → 10.
2. Four real per-city culture buildings (temple, amphitheater, monastery,
   concert_hall) grant `+1 happiness` each, reducing unrest pressure `-2` per
   building in their own city. Descriptions state this plainly.
3. The city panel's unrest section shows an itemized pressure breakdown
   (including the contagion row) so "why is this city unhappy" is answered
   in place.
4. The existing `icon-legend.ts` resource rows gain effect text (e.g. "+1
   happiness", "+1 gold/turn"), reusing the same effect-label logic already in
   `city-panel.ts` (extracted to a shared helper — DRY).
5. Concede and Appease get honest, distinct tooltips plus one static help line
   explaining the trade-off (repeatable-and-cheaper vs. one-time-and-immune).
6. A new **empire city overview panel** replaces the bottom-bar "City" button's
   direct-to-single-city behavior: tapping "City" opens a sortable list of all
   the player's cities (name, population, per-turn yields, unrest status),
   sorted unrest-first by default, with inline Appease/Concede actions on rows
   in unrest. Tapping a row (outside its action buttons) opens that city's
   existing detail panel. All other existing entry points that already know
   which city they want (map tap, wonder panel, notification jump-to-city)
   continue to open the detail panel directly.
7. AI production scoring values the four happiness buildings so AI cities use
   the same toolkit players get.

## Non-goals

- No new persisted state — `Building.happiness` is optional, id-based lookup,
  no save migration.
- No change to Concede/Appease costs, immunity duration, or contagion math —
  those are #354's tuning, out of scope here.
- No per-difficulty scaling of the 10-turn window (flat, matching the original
  plan's reasoning: the challenge system already scales pressure severity).
- The empire overview panel ships with population + yields + unrest columns
  only for this MR; further columns (trade routes, garrison status, etc.) are
  future work, not blocked by this design.

## Architecture

**Shared pressure row-builder.** `computeUnrestPressure` is refactored so a new
`getUnrestPressureBreakdown(cityId, state, ownerHappiness)` function builds a
list of `{ label: string; amount: number }` rows (overextension, distance,
conquest, war weariness, spies, economy strain, contagion, luxury resources,
happiness buildings — each only included when nonzero) and `computeUnrestPressure`
becomes `clamp(sum(rows))`. This is the single source of truth consumed by both
turn processing (AI/economy) and the city panel UI — per the repo's
computed-data-must-render rule.

**Building happiness.** `Building.happiness?: number` (optional, `src/core/types.ts`).
`getCityHappinessFromBuildings(city)` sums it across `city.buildings`, lives in
`faction-system.ts` (unrest-domain logic, matches where `getContagionSpread`
already lives).

**Shared resource-effect label helper.** `getResourceEffectLabel(effect)` extracted
from city-panel.ts's existing inline `yieldLabel`/happiness-string logic into
`src/systems/resource-definitions.ts` (co-located with `ResourceEffect`), consumed
by both `city-panel.ts` (replacing its inline logic 1:1, no behavior change) and
the extended `icon-legend.ts`.

**Empire overview panel.** New `src/ui/city-overview-panel.ts` (named to avoid
colliding with the existing `#city-list-view` tab id inside the single city
panel). Pure render + callback-forwarding component — it reuses
`getUnrestPressureBreakdown`-derived status, the existing per-city yield calc,
and the *same* `onAppeaseFaction`/`onConcedeToMovement` callback signatures the
single city panel already uses (extracted from `main.ts`'s
`openCityPanelForCity` into two named functions `handleAppeaseFaction(cityId)` /
`handleConcedeToMovement(cityId)` so both panels call the identical code path —
no logic duplication). `main.ts`'s `togglePanel('city')` branch is changed to
open this panel; `openCityPanelForCity(city)` (the existing single-city path)
is unchanged and still used by every caller that already has a specific city.

## Testing strategy

- Pressure-delta unit tests per happiness building (temple, amphitheater,
  monastery, concert_hall), a per-city-vs-empire-wide negative test, a
  catalog-wide description⇔`happiness` field consistency test (content-honesty
  guardrail), and a breakdown-rows-sum-to-clamped-total invariant across a
  fixture matrix including the contagion row.
- `icon-legend.ts` and `city-panel.ts` resource-effect text now come from one
  shared helper — a single test on the helper covers both call sites; a
  render test on each confirms the text actually appears in `textContent`.
- Empire overview panel: render tests for 0/1/many owned cities, default
  sort-unrest-first, and — critically — a test asserting the panel's inline
  Appease/Concede button click produces the *identical* resulting `GameState`
  as the same action taken from the single city panel (proves the two panels
  share one code path, not two implementations of the same mutation).
- Hot-seat regression: two-civ fixture, assert civ A's cities never appear in
  the overview panel when civ B is `state.currentPlayer`.
- `pacing-reference-economy.test.ts` snapshots must NOT move (happiness isn't
  a yield); the plan must confirm this explicitly by running the suite.
