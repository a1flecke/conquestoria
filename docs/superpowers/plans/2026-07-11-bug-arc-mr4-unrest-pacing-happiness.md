# MR4 — Unrest Pacing + Honest Happiness (#552) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task inline (this repo forbids subagents — see CLAUDE.md Agent Policy). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unrest gives 10 turns before revolt instead of 5; a small set of culture buildings genuinely grant happiness (making the existing "build happiness improvements" advice true); the city panel shows where happiness/pressure comes from; and a resource reference lists every revealed resource's effect.

**Architecture:** Add an optional `happiness` field to `Building`, feed it into `computeUnrestPressure` as a per-city reduction alongside the existing empire-wide luxury happiness, and expose one shared breakdown helper that both the pressure math and the city panel render from. Reference UI extends the existing icon-legend panel.

**Tech Stack:** TypeScript, vitest.

## Global Constraints

- All commands via `bash scripts/run-with-mise.sh yarn <cmd>`; green build+test before push.
- Content honesty (`.claude/rules/content-description-honesty.md`): every description naming a mechanic needs a positive test asserting the mechanic.
- Building yields must display in the city panel build queue (existing rule) — the new happiness value must display wherever yields display.
- No `cities[0]` shortcuts; `textContent` for dynamic strings.
- Any economy-affecting bonus must re-run `tests/systems/pacing-audit.test.ts`'s outlier gate (happiness is not a yield, so `pacing-reference-economy` snapshots should NOT move — verify they don't).

## Background for the implementer (zero-context)

- Unrest lives in `src/systems/faction-system.ts`. `computeUnrestPressure(cityId, state, ownerHappiness)` (line 37) sums pressures (overcrowding, distance, conquest, war weariness, spies, economy strain, contagion) minus `ownerHappiness * 2`; a city above `UNREST_TRIGGER_PRESSURE = 40` enters unrest; after `REVOLT_UNREST_TURNS = 5` (line 16) it revolts.
- `ownerHappiness` is computed once per civ in `processFactionTurn` (line ~297): `getCivHappinessFromResources` (luxury resources, `src/systems/resource-acquisition-system.ts:160`) + beast-feast (+2). **No building contributes.**
- Yet `src/ui/notification-routing.ts:89` ("…or build happiness improvements") and the era-2 primer (line ~399) both promise happiness buildings. This MR makes the promise true rather than deleting it.
- `BUILDINGS` lives in `src/systems/city-system.ts` (`Building` interface near the top; check `src/core/types.ts` if the interface lives there — grep `interface Building`).
- The city panel (`src/ui/city-panel.ts`) already lists owned happiness *resources* (line ~147-186) and has an unrest section (line ~269+).
- The icon legend (`src/ui/icon-legend.ts`) is the existing reference panel pattern.

Design decisions (approved via arc spec):
- `REVOLT_UNREST_TURNS`: 5 → 10, flat (no per-challenge scaling — the challenge system already scales crisis pressure; two knobs on one dial invites confusion).
- Building happiness: **+1 each** on `temple` (era 3, philosophy), `amphitheater` (era 4, drama-poetry), `sacred_grove` (check its tech/era in city-system.ts:219 before writing the description), `concert_hall` (city-system.ts:458, same check). Per-city cap: none needed — a city with all four spends four build slots for −8 pressure, similar to a garrison (which zeroes escalation) in opportunity cost.
- Building happiness is **per-city** (the building is in one city), unlike luxury happiness which is empire-wide. Pressure formula: `pressure -= (ownerHappiness + cityBuildingHappiness) * 2`.

---

### Task 1: 10-turn unrest window

**Files:**
- Modify: `src/systems/faction-system.ts:16`
- Test: existing tests referencing the 5-turn window (`grep -rn "REVOLT_UNREST_TURNS\|unrestTurns" tests/ | grep -v node_modules`)

- [ ] **Step 1:** Change `export const REVOLT_UNREST_TURNS = 5;` to `= 10;` (comment stays accurate). The unrest notification interpolates this constant (`src/ui/notification-routing.ts:89`) so its text self-updates.
- [ ] **Step 2:** Run `bash scripts/run-with-mise.sh yarn test`. Update any test that hardcodes 5 turns-to-revolt to derive from the exported constant instead of a literal (that is the durable fix, not changing 5→10 in the test).
- [ ] **Step 3:** Commit: `balance(unrest): 10 turns before revolt escalation (#552)`

### Task 2: Buildings that actually grant happiness

**Files:**
- Modify: `Building` interface (grep `interface Building` — src/systems/city-system.ts or src/core/types.ts) — add `happiness?: number;`
- Modify: `src/systems/city-system.ts` — the four building definitions + descriptions
- Create: `getCityHappinessFromBuildings(city: City): number` in `src/systems/faction-system.ts` (it is unrest-domain logic)
- Modify: `computeUnrestPressure` + `processFactionTurn` in faction-system.ts
- Test: `tests/systems/faction-system.test.ts` (extend)

**Interfaces:**
- Produces: `getCityHappinessFromBuildings(city: City): number` — sums `BUILDINGS[id].happiness ?? 0` over `city.buildings`.
- `computeUnrestPressure(cityId, state, ownerHappiness)` — signature unchanged; internally adds the city-building term.

- [ ] **Step 1: Failing tests**

```ts
describe('building happiness (#552)', () => {
  it('a temple reduces its own city\'s pressure by 2', () => {
    const base = computeUnrestPressure(cityId, state, 0);
    const withTemple = computeUnrestPressure(cityId, addBuilding(state, cityId, 'temple'), 0);
    expect(base - withTemple).toBe(2);
  });

  it('building happiness is per-city, not empire-wide', () => {
    const next = addBuilding(state, cityA, 'temple');
    expect(computeUnrestPressure(cityB, next, 0)).toBe(computeUnrestPressure(cityB, state, 0));
  });

  it('every building that claims happiness in its description has a happiness value, and vice versa', () => {
    for (const b of Object.values(BUILDINGS)) {
      const claims = /happiness/i.test(b.description);
      const has = (b.happiness ?? 0) > 0;
      expect(claims).toBe(has);
    }
  });

  it('all four designated culture buildings grant +1', () => {
    for (const id of ['temple', 'amphitheater', 'sacred_grove', 'concert_hall']) {
      expect(BUILDINGS[id].happiness).toBe(1);
    }
  });
});
```

(`addBuilding` = clone state pushing the id into `state.cities[cityId].buildings`;
reuse this test file's existing fixture helpers — read its top first. Use a
fixture city with nonzero baseline pressure, e.g. population high enough for
overcrowding, so the −2 delta is observable above the 0-floor clamp.)

- [ ] **Step 2: Implement**

Definitions (descriptions must state the mechanic plainly):

```ts
  temple: { …existing…, happiness: 1, description: 'Spiritual center. +1 happiness in this city (reduces unrest pressure).' },
  amphitheater: { …existing…, happiness: 1, description: 'Entertainment and culture. +1 happiness in this city (reduces unrest pressure).' },
  // sacred_grove, concert_hall: same pattern appended to their existing descriptions.
```

faction-system.ts:

```ts
export function getCityHappinessFromBuildings(city: City): number {
  let total = 0;
  for (const id of city.buildings) total += BUILDINGS[id]?.happiness ?? 0;
  return total;
}
```

In `computeUnrestPressure`, replace `pressure -= ownerHappiness * 2;` with:

```ts
  // Empire-wide luxury happiness plus this city's own happiness buildings
  // (#552 — the "build happiness improvements" advice is now real).
  pressure -= (ownerHappiness + getCityHappinessFromBuildings(city)) * 2;
```

Import direction check: faction-system already imports from city-system?
`grep -n "from './city-system'" src/systems/faction-system.ts` — if importing
`BUILDINGS` creates a cycle (city-system importing faction-system), put
`getCityHappinessFromBuildings` in city-system.ts instead and import it from
faction-system; keep the function's tests where the function lands.

- [ ] **Step 3:** Run suite — also confirm `pacing-reference-economy.test.ts`
  snapshots did NOT change (happiness is not a yield; if they moved, you wired
  it into yields by mistake).
- [ ] **Step 4:** Commit: `feat(unrest): culture buildings grant real happiness (#552)`

### Task 3: Happiness/pressure breakdown in the city panel

**Files:**
- Create: `getUnrestPressureBreakdown(cityId: string, state: GameState): Array<{ label: string; amount: number }>` in `src/systems/faction-system.ts` — refactor `computeUnrestPressure` so both build from the same row list (compute rows, sum them; `computeUnrestPressure` returns the clamped sum). Rows include negative entries: `'Luxury resources'`, `'Happiness buildings'`, `'Beast-slayer feast'`.
- Modify: `src/ui/city-panel.ts` unrest section (~line 269): render the rows.
- Test: `tests/systems/faction-system.test.ts` (breakdown sums to the clamped total across a matrix of fixture cities) + `tests/ui/city-panel.test.ts` (rows visible).

**Player truth table:**

| Before | Action | Immediate visible result |
|---|---|---|
| City panel, city at pressure 46 | Open unrest section | Itemized rows e.g. "Overcrowding +18", "War weariness +8", … "Happiness buildings −4", total matching the pressure bar |
| Player builds a temple there | Reopen panel next turn | "Happiness buildings −2" row appears / grows; total drops by 2 |

- [ ] **Step 1: Failing tests** — breakdown invariant:

```ts
  it('breakdown rows sum to the pressure total (pre-clamp) for varied cities', () => {
    for (const cityId of Object.keys(state.cities)) {
      const rows = getUnrestPressureBreakdown(cityId, state);
      const sum = rows.reduce((a, r) => a + r.amount, 0);
      expect(Math.min(100, Math.max(0, sum))).toBe(
        computeUnrestPressure(cityId, state, ownerHappinessFor(state, cityId)),
      );
    }
  });
```

UI test: render city panel for a city with a temple; assert
`textContent` contains `Happiness buildings` and the signed amount.

- [ ] **Step 2: Implement** — refactor so there is exactly ONE place listing
  pressure sources (the row builder); `computeUnrestPressure` becomes
  `clamp(sumRows(...))`. `ownerHappiness` becomes a row computed inside the
  builder (call `getCivHappinessFromResources` there; update
  `processFactionTurn`'s precomputed-map usage accordingly — keep the per-civ
  precompute by letting the builder accept an optional precomputed
  `ownerHappiness` to avoid O(cities²) scans, matching the existing comment at
  faction-system.ts:297).
- [ ] **Step 3:** Render rows via `textContent` loops (follow the tech-yield
  breakdown idiom at city-panel.ts:784). Run suite; commit:
  `feat(city-panel): itemized unrest pressure + happiness breakdown (#552)`

### Task 4: Resource effects reference

**Files:**
- Modify: `src/ui/icon-legend.ts` — new "Resources" section
- Test: `tests/ui/icon-legend.test.ts` (extend or create following existing UI-test idiom)

- [ ] **Step 1: Failing test**

```ts
  it('lists every tech-revealed resource with icon, name, and effect', () => {
    // fixture civ has researched techs revealing silk + iron only
    renderIconLegend(container, state);
    expect(container.textContent).toContain('Silk');
    expect(container.textContent).toContain('+1 happiness');
    expect(container.textContent).toContain('Iron');
    expect(container.textContent).not.toContain('Aluminum'); // tech not researched
    expect(container.textContent).toContain('More resources are revealed by future technologies');
  });
```

- [ ] **Step 2: Implement** — iterate `RESOURCE_DEFINITIONS`
  (`src/systems/resource-definitions.ts`), filter to entries whose `tech` is in
  the viewer civ's `techState.completed` (or `tech` undefined), render
  `{icon} {name} — {effectText} (improvement: {requiredImprovement})` per row
  via `textContent`. Effect text helper: `'happiness'` → `+N happiness
  (reduces unrest in all your cities)`; yield types → `+N {type} on the worked
  tile` — check `ResourceDefinition.effect`'s exact shape in
  resource-definitions.ts:4 first and cover every `effect.type` in the union
  (a `switch` with exhaustiveness `never` check). Trailing static line:
  `More resources are revealed by future technologies.`
- [ ] **Step 3:** Run suite + build; commit: `feat(ui): resource effects reference in icon legend (#552)`

### Task 5: AI + save-compat + docs

- [ ] **AI production:** `src/ai/ai-production.ts` scores building candidates —
  grep how it weights `yields`; add a modest happiness weight so the AI values
  the four buildings when its cities run hot: find the city-need signals it
  already reads (it consumes candidate metadata generically — follow the
  existing pattern; if no need-signal exists, weight `happiness` at the same
  scalar as +1 gold, flat). Add a test in `tests/ai/ai-production.test.ts`
  asserting a temple's candidate score exceeds an otherwise-identical
  zero-happiness building for a city in unrest (or flat-weight variant if
  need-signals don't exist — assert score strictly greater than without the
  happiness field).
- [ ] **Save compat:** `happiness` is optional — old saves' building id lists
  gain the effect automatically on load (id-based lookup; no migration).
  Confirm: load-shaped test constructing a pre-MR4 city with `'temple'` in
  `buildings` and asserting the pressure reduction applies.
- [ ] **Docs:** append to `.claude/rules/game-balance.md` a new "Happiness
  inventory" table (source | scope | amount | era): four buildings (+1 each,
  city), luxuries (+1 each, empire), feast (+2, empire, temporary) — with the
  rule "new happiness sources must update this table and stay ≤ +2 per single
  source."
- [ ] Full suite + build; commit: `feat(ai)+docs: AI values happiness; balance inventory (#552)`

---

## Inline Dimension Review

- **Gameplay balance:** −2 pressure per building (vs trigger 40, sources 8–25 each) is a mitigation tool, not immunity — four buildings + a luxury ≈ one garrison's worth of relief. The doubled revolt window (10) mainly helps era-2/3 players who lack tools; veteran-challenge contagion math is untouched. Happiness inventory table caps future creep.
- **Fun:** Unrest changes from a fire alarm ("5 turns!") to a project ("stabilize within 10"); building your way out of unhappiness is a classic, satisfying builder loop the game claimed to have but didn't.
- **New mechanics:** One small field (`Building.happiness`) riding an existing lever (pressure), not a parallel system. Deliberately no per-city cap or scaling curves (YAGNI).
- **Ages 7–43:** The 7-year-old gets double the reaction time and a concrete "build a temple" answer; the breakdown rows teach cause-and-effect; the adult minmaxer gets exact numbers.
- **Play styles:** Builders gain a real happiness toolkit; warmongers still counter war-weariness via garrisons (unchanged); wide players value luxuries (empire-wide) over buildings (per-city) — a genuine strategic distinction the breakdown makes legible.
- **Difficulty modes:** Flat 10-turn window across challenges by design (documented); challenge still differentiates via crisis severity/contagion. Revisit only if veteran players report unrest is now toothless.
- **AI usage:** Task 5 wires candidate scoring so AI cities build the same tools players do — without it the AI would ignore the new mechanic entirely (the classic dead-mechanic failure).
- **UI:** Breakdown rows follow the existing tech-yield-breakdown idiom; legend section follows the existing reference-panel idiom; no new panels.
- **UX:** Every complaint in #552 maps to a surface: "too short" → constant; "which buildings" → descriptions + breakdown row + build-queue display; "which resources" → legend + existing city-panel resource rows.
- **Architecture:** One shared row-builder feeds both the pressure number and the UI (computed-data-must-render, single source of truth); import-cycle check called out explicitly.
- **Extensibility:** Any future building adds `happiness: N` and appears in pressure, panel, AI scoring, and the honesty test automatically; the description↔field consistency test is generic over the whole catalog.
- **Data:** One optional field; no save migration needed (id-based lookup) — verified by a load-shaped test.
- **SFX:** None — no new events. Unrest start/resolve sounds unchanged.
- **Saved games:** Old saves gain building happiness on load automatically; in-flight unrest cities get the longer window retroactively (favorable to the player, acceptable).
- **Testing:** Pressure-delta tests, per-city-vs-empire negative test, catalog-wide description↔mechanic consistency test, breakdown-sums invariant, UI text assertions, AI scoring test, pacing-snapshot non-movement check.
- **Solo regressions:** Faction-system suite re-run; the constant-derived test fix prevents future literal drift.
- **Hot-seat regressions:** Happiness/breakdown all read per-civ/per-city state via the viewer's city panel (already `currentPlayer`-scoped); legend filters by viewer tech — no leak of unrevealed resources.
- **Implementation correctness:** The honesty test (claims ⇔ field) makes it impossible for this MR to ship the MR12 bug class it fixes; the breakdown invariant test keeps UI and math in lockstep permanently.
