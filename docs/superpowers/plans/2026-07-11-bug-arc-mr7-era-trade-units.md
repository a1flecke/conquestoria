# MR7 — Era/Domain Trade Units (#553, content tier) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task inline (this repo forbids subagents — see CLAUDE.md Agent Policy). Steps use checkbox (`- [ ]`) syntax for tracking. **Depends on MR6 (discoverability groundwork).**

**Goal:** Trade grows with the game: a land upgrade line (Caravan → Merchant Convoy), a naval line (Merchant Ship → Steam Freighter), and a late-game Air Freighter — each with its own route domain, trip count, and gold multiplier, fully wired per the six trainable-unit rules.

**Architecture:** A `TRADE_UNIT_TIERS` data table in `src/systems/trade-route-classification.ts` drives everything: route domain (land/sea/air), trip count, and gold multiplier. `canEstablishRoute`/`establishRoute` generalize from "caravan" to "any unit in the tiers table." Units follow the standard definition/wiring recipe; AI reuse comes free via the existing `trade` role.

**Tech Stack:** TypeScript, vitest.

## Global Constraints

- All commands via `bash scripts/run-with-mise.sh yarn <cmd>`; green build+test before push.
- **All six trainable-unit wirings** per `.claude/rules/end-to-end-wiring.md`: UNIT_DEFINITIONS+UNIT_DESCRIPTIONS, renderer icon, production side-effects (none needed — no companion state), death cleanup (none — routes detach via existing `committedToRouteId` handling; verify), AI classification, tech-gated dequeue. Plus `unlocksUnits` arrays and `PRODUCTION_ICONS` (completeness tests enforce).
- Trade units are civilian (`strength: 0`) — no movement-bonus-stacking implications, but update no tables claiming otherwise.
- Content honesty: descriptions state only implemented behavior; positive tests for each claimed multiplier/trip count.
- Coastal-gated units: production chooser AND dequeue path consult the same city-aware helper (existing rule; `troop_transport` at `src/systems/city-system.ts:1093` is the precedent — copy its gating exactly).

## Background for the implementer (zero-context)

- Routes: `TradeRoute { id, fromCityId, toCityId, goldPerTrip, turnsPerTrip, foreignCivId? }` created in `establishRoute` (`src/systems/trade-system.ts:289+`); trips live on the unit (`tripsRemaining = 8 + inn bonus`, line 319); gold = `calculateTradeRouteGold(hexDist, resourceDiversity) * turnsPerTrip`. Pathing: `findPath(from, to, state.map, 'land')` (line ~258) — check `findPath`'s domain parameter values (grep its signature) before writing the sea variant.
- Eligibility: `canEstablishRoute(state, caravanUnit, toCityId)` (line 240) — reasons include the MR6-fixed `'No land path to this city'`.
- The only trade unit: `caravan` (`src/systems/unit-system.ts:372`, `src/systems/city-system.ts:1141`, role `trade` in `src/ai/ai-unit-roles.ts:7`, class `civilian` in `src/systems/unit-modifier-definitions.ts:55`).
- Upgrade idiom: `TRAINABLE_UNITS` entries carry `obsoletedByTech` + `upgradesTo` (see `warrior` at city-system.ts:1079).
- Verified tech gates: `trade-routes` (era 4), `guilds` (`tech-definitions-eras5-7.ts:23` — confirm its `era` field when wiring), `steam-navigation` (`tech-definitions-eras5-7.ts:341`), `aviation` (`tech-definitions-eras9.ts:34`, era 9).

**The tier table (single source of truth):**

| unit | tech (era) | domain | cost | moves | trips | gold multiplier |
|---|---|---|---|---|---|---|
| caravan | trade-routes (4) | land | 60 | 3 | 8 | 1.0 |
| merchant_ship | trade-routes (4), coastal | sea | 70 | 4 | 8 | 1.25 |
| merchant_convoy | guilds (5–7: verify) | land | 90 | 4 | 10 | 1.25 |
| steam_freighter | steam-navigation (5–7: verify) | sea | 140 | 6 | 12 | 1.5 |
| air_freighter | aviation (9) | air | 220 | 10 | 10 | 2.0 |

Upgrade chains: caravan → merchant_convoy (caravan `obsoletedByTech: 'guilds'`);
merchant_ship → steam_freighter (`obsoletedByTech: 'steam-navigation'`).
Air is a new line, no predecessor.

Route domain rules:
- **land**: land path must exist (existing behavior).
- **sea**: both cities coastal (reuse the coastal check `hasCityRequirement`-style helper — grep `coastal` in city-system for the existing city-coastal predicate) + water path exists between them (findPath sea domain).
- **air**: no path requirement; both cities within 30 hexes (wrap-aware distance); destination rules (foreign/at-war/relations) identical to land.

---

### Task 1: Tier table + generalized eligibility (TDD core)

**Files:**
- Modify: `src/systems/trade-route-classification.ts` (add table + helpers)
- Modify: `src/systems/trade-system.ts` (`canEstablishRoute`, `establishRoute`)
- Test: `tests/systems/trade-system.test.ts` (extend)

**Interfaces:**
- Produces:

```ts
// trade-route-classification.ts
export interface TradeUnitTier {
  unitType: UnitType;
  routeDomain: 'land' | 'sea' | 'air';
  tripCount: number;
  goldMultiplier: number;
}
export const TRADE_UNIT_TIERS: Record<string, TradeUnitTier>; // keyed by unit type
export function getTradeUnitTier(unitType: UnitType): TradeUnitTier | undefined;
export function isTradeUnit(unitType: UnitType): boolean;
```

- [ ] **Step 1: Failing tests**

```ts
describe('trade unit tiers (#553)', () => {
  it('caravan keeps existing behavior through the table (8 trips, 1.0x gold)', () => {
    const next = establishRoute(stateWithCaravanRoute, caravanId, toCityId);
    expect(next.units[caravanId].tripsRemaining).toBe(8); // + inn bonus fixtures excluded
    // goldPerTrip identical to pre-table snapshot value from the existing test
  });

  it('merchant ship requires both cities coastal', () => {
    const inland = canEstablishRoute(state, merchantShipUnit, inlandCityId);
    expect(inland).toMatchObject({ ok: false, reason: expect.stringContaining('coastal') });
    expect(canEstablishRoute(state, merchantShipUnit, coastalCityId).ok).toBe(true);
  });

  it('sea routes apply the 1.25x gold multiplier', () => {
    const next = establishRoute(state, merchantShipId, coastalCityId);
    const route = next.marketplace!.tradeRoutes.at(-1)!;
    expect(route.goldPerTrip).toBe(Math.floor(landEquivalentGold * 1.25));
  });

  it('air freighter ignores paths but respects the 30-hex range', () => {
    expect(canEstablishRoute(state, airFreighterUnit, cityAcrossOceanId).ok).toBe(true);
    expect(canEstablishRoute(state, airFreighterUnit, cityBeyondRangeId))
      .toMatchObject({ ok: false, reason: expect.stringContaining('range') });
  });

  it('air routes still refuse at-war destinations', () => {
    expect(canEstablishRoute(stateAtWar, airFreighterUnit, enemyCityId).ok).toBe(false);
  });

  it('non-trade units are rejected outright', () => {
    expect(canEstablishRoute(state, warriorUnit, toCityId).ok).toBe(false);
  });
});
```

(Fixtures: extend this file's existing route fixtures; unit type entries for
the new units land in Task 2 — for Task 1's tests, register the three new
types in `TRADE_UNIT_TIERS` and add bare `UNIT_DEFINITIONS` entries in the
same commit so the fixtures construct; the full catalog wiring is Task 2.
If that ordering fights the completeness tests, do Tasks 1+2 as one commit —
the task boundary is for review, not for CI-green-between.)

- [ ] **Step 2: Implement**

Table (with the exact numbers from the design table above), then in
`canEstablishRoute`: first line `const tier = getTradeUnitTier(caravanUnit.type); if (!tier) return { ok: false, reason: 'Not a trade unit' };`
Replace the hardcoded land `findPath` block with a domain switch:

```ts
  if (tier.routeDomain === 'land') {
    const path = findPath(fromCity.position, toCity.position, state.map, 'land');
    if (!path) return { ok: false, reason: 'No land path to this city' };
  } else if (tier.routeDomain === 'sea') {
    if (!isCoastalCity(state, fromCity.id) || !isCoastalCity(state, toCity.id)) {
      return { ok: false, reason: 'Sea routes need both cities coastal' };
    }
    const path = findPath(fromCity.position, toCity.position, state.map, /* sea domain — verify findPath's water value */ 'naval');
    if (!path) return { ok: false, reason: 'No sea path to this city' };
  } else {
    const dist = state.map.wrapsHorizontally
      ? wrappedHexDistance(fromCity.position, toCity.position, state.map.width)
      : hexDistance(fromCity.position, toCity.position);
    if (dist > 30) return { ok: false, reason: 'Beyond air freight range (30 hexes)' };
  }
```

(`isCoastalCity`: grep for the existing coastal-city predicate used by
`coastalRequired` production gating in city-system.ts and reuse it — do not
write a second one. Verify `findPath`'s domain union; if it has no sea value,
check how naval unit movement paths water — reuse that mechanism, and if
none is reusable as-is, document the chosen approach in the PR body.)

In `establishRoute`: `tripsRemaining = tier.tripCount + tripBonus;`
`goldPerTrip = Math.floor(calculateTradeRouteGold(hexDist, resourceDiversity) * turnsPerTrip * tier.goldMultiplier);`

- [ ] **Step 3:** Suite green; commit: `feat(trade): tier-driven trade units with land/sea/air route domains (#553)`

### Task 2: Full unit wiring (definitions, catalog, icons, unlocks)

**Files:**
- Modify: `src/core/types.ts` (`UnitType` union: `'merchant_ship' | 'merchant_convoy' | 'steam_freighter' | 'air_freighter'`)
- Modify: `src/systems/unit-system.ts` (UNIT_DEFINITIONS + UNIT_DESCRIPTIONS ×4)
- Modify: `src/systems/city-system.ts` (TRAINABLE_UNITS ×4 with costs/gates from the design table, `coastalRequired: true` on both ships copying troop_transport's idiom, PRODUCTION_ICONS: 🚢 merchant_ship, 🚚 merchant_convoy, 🛳️ steam_freighter, ✈️ air_freighter)
- Modify: `src/systems/unit-modifier-definitions.ts` (`civilian` class ×4)
- Modify: `src/ai/ai-unit-roles.ts` (role `['trade']` ×4)
- Modify: tech definitions: add each unit to its gating tech's `unlocksUnits` (trade-routes gains merchant_ship; guilds gains merchant_convoy; steam-navigation gains steam_freighter; aviation gains air_freighter)
- Modify: `src/renderer/unit-renderer.ts` (emoji icons matching PRODUCTION_ICONS)
- Test: existing completeness suites (`tests/systems/tech-unlocks-consistency.test.ts`, icon coverage in `tests/systems/city-system.test.ts`, AI catalog tests) enforce most of this — run them to find anything missed.

- [ ] **Step 1:** UNIT_DEFINITIONS entries (caravan idiom, unit-system.ts:372):

```ts
  merchant_ship: {
    type: 'merchant_ship', name: 'Merchant Ship', movementPoints: 4,
    visionRange: 2, strength: 0, canFoundCity: false,
    canBuildImprovements: false, productionCost: 70,
    domain: 'sea',
  },
  merchant_convoy: {
    type: 'merchant_convoy', name: 'Merchant Convoy', movementPoints: 4,
    visionRange: 2, strength: 0, canFoundCity: false,
    canBuildImprovements: false, productionCost: 90,
    domain: 'land',
  },
  steam_freighter: {
    type: 'steam_freighter', name: 'Steam Freighter', movementPoints: 6,
    visionRange: 2, strength: 0, canFoundCity: false,
    canBuildImprovements: false, productionCost: 140,
    domain: 'sea',
  },
  air_freighter: {
    type: 'air_freighter', name: 'Air Freighter', movementPoints: 10,
    visionRange: 3, strength: 0, canFoundCity: false,
    canBuildImprovements: false, productionCost: 220,
    domain: 'air',
  },
```

(Verify `domain` union values by reading the caravan/`troop_transport`/air-unit
entries — use whatever values existing sea/air units use.)

UNIT_DESCRIPTIONS (honesty — numbers must match the tier table):
- merchant_ship: `'Naval trade unit. Establishes sea routes between coastal cities — 25% more gold than land routes.'`
- merchant_convoy: `'Upgraded land trade unit. 10 trips per route and 25% more gold than a Caravan.'`
- steam_freighter: `'Industrial sea trader. 12 trips per route and 50% more gold than land routes.'`
- air_freighter: `'Air cargo. Routes to any known city within 30 hexes, double gold, no path needed.'`

- [ ] **Step 2:** Run the full suite; the completeness tests will list every
  missed wiring (icons, unlocks arrays, AI catalogs) — fix until green.
  Confirm the trainable-dequeue rule: obsoleted queued caravans dequeue when
  `guilds` completes (existing `getTrainableUnitsForCiv` machinery; add
  `obsoletedByTech: 'guilds', upgradesTo: 'merchant_convoy'` on caravan's
  TRAINABLE_UNITS row and the ship equivalent; positive test that an
  upgrade-eligible caravan upgrades via the existing unit-upgrade path —
  see `src/systems/unit-upgrade-system.ts` tests for the idiom).
- [ ] **Step 3:** Commit: `feat(units): merchant ship, merchant convoy, steam freighter, air freighter (#553)`

### Task 3: Committed-route lifecycle + death cleanup audit

**Files:**
- Test: `tests/systems/trade-system.test.ts` (extend)

- [ ] Verify (and pin with tests) that the existing route-teardown paths work
  for the new types — they key on `committedToRouteId`, not unit type, so they
  should: unit killed mid-route → route removed (grep `removeRouteById`
  callers); war declared → `'war-declared'` teardown fires for sea/air routes
  too (add one sea-route war teardown test).
- [ ] Air/sea units and upgrades: a caravan upgraded to merchant_convoy while
  `committedToRouteId` is set must either be blocked from upgrading or carry
  the commitment — read `unit-upgrade-system.ts` eligibility; blocked-until-
  route-ends is the simpler correct behavior; implement + test whichever the
  existing system does for other stateful units (grep how `committedToRouteId`
  interacts with upgrades today; if unhandled, add the block with reason
  `'Cannot upgrade while committed to a trade route'`).
- [ ] Commit: `test(trade): route lifecycle regressions for new trade units (#553)`

### Task 4: UI touch-points inherit the new units

**Files:**
- Modify: `src/ui/establish-route-panel.ts` (title/copy says "caravan" — generalize to the selected unit's name), `src/ui/selected-unit-info.ts` (Establish Route button shows for all `isTradeUnit` types), MR6's treasury-drawer empty state (add "or a Merchant Ship for sea routes" step once tech is present), `src/ui/advisor-system.ts` (MR6's `send-idle-caravan` trigger generalizes to `isTradeUnit`)
- Test: extend MR6's tests for one naval case (idle merchant ship triggers advisor; establish panel lists coastal destinations with sea reasons).

- [ ] Implement + test; commit: `feat(ui): trade UI generalizes across trade unit tiers (#553)`

### Task 5: Sprites, SFX, docs, save-compat

- [ ] **Sprites:** emoji renderer icons shipped in Task 2 satisfy the catalog
  tests. Register the four units in the placeholder list in
  `docs/sprite-design-system.md`, then invoke the project skill
  `generate-sprite-prompt` to produce Claude Design prompts for the four units
  and attach them to the PR body (the sprite art itself is a separate
  visual-asset workflow — do not block this MR on it).
- [ ] **SFX:** trade route creation already emits `trade:route-created`; check
  `grep -rn "route-created" src/audio` — if a cue exists it fires for all
  tiers automatically; if none, note in PR (no new SFX in this MR).
- [ ] **Docs:** update `.claude/rules/game-balance.md`: add a "Trade tier
  table" mirror with the rule "new trade units append a row to
  `TRADE_UNIT_TIERS`; gold multiplier ≤ 2.0; never add per-unit branches to
  trade-system." Update `docs/sprite-design-system.md` inventory.
- [ ] **Save compat:** old saves have caravans mid-route: tier lookup for
  `'caravan'` exists → unchanged behavior (Task 1's first test pins it). Old
  saves with queued caravans that already have guilds researched: the dequeue
  rule handles it (Task 2 test). No migration code needed — state shape untouched.
- [ ] **Pacing:** gold multipliers change route income (an economy bonus):
  run `tests/systems/pacing-audit.test.ts` full gate; if reference-economy
  snapshots move, include updated numbers + one-line justification in the PR
  per `.claude/rules/game-balance.md`.
- [ ] Manual: dev server — found two coastal cities, train merchant ship,
  establish a sea route, confirm gold ≈ 1.25× an equal-length land route in
  the treasury drawer; upgrade a caravan at guilds; air freighter at aviation
  routes across ocean.
- [ ] Full suite + build; commit: `docs(trade)+balance: tier table inventory, sprite prompts (#553)`

---

## Inline Dimension Review

- **Gameplay balance:** Multipliers capped at 2.0× and codified in game-balance.md; sea/air premiums are paid for in tech depth, production cost, and (sea) coastal-city commitment. Trips scale gently (8→12). Pacing gate runs because route gold touches the economy; snapshot deltas must be justified in-PR. No movement-stacking exposure (civilians).
- **Fun:** Each era refresh gives trade players a new toy and a visible income jump; sea routes make coastal empires feel different from land empires; the air freighter is a satisfying late-game "geography stops mattering" beat.
- **New mechanics:** Route domains (sea path/coastal gate, air range) — the one genuinely new rule set, kept to three table-driven branches; everything else rides existing route machinery.
- **Ages 7–43:** Upgrade chains are self-teaching (the game dequeues obsolete units and offers upgrades); descriptions carry concrete numbers for the minmaxer; a child can just build "the newer trader" and benefit.
- **Play styles:** Economists get a full progression line; naval players finally get a civilian navy; warmongers interact via route teardown on war declaration (tested for new domains).
- **Difficulty modes:** Not challenge-coupled; AI tiers up equally on all difficulties via the catalog path — acceptable since trade is not a difficulty lever today.
- **AI usage:** Role `trade` ×4 + generic candidate catalogs mean the AI trains and uses tiers as techs arrive; the catalog-comparison tests fail loudly if a unit is skipped. Explicitly no bespoke basic-ai branches.
- **UI:** All surfaces generalize from MR6's groundwork (roster, reasons, advisor); panel copy stops saying "caravan" where it means "trade unit."
- **UX:** The MR6 guided empty-state gains the sea step only when relevant; ineligible destinations explain domain-specific reasons ("both cities coastal", "beyond air freight range").
- **Architecture:** One data table drives eligibility, trips, and gold — adding tier 6 later is a row, not a branch (the NP_PRODUCTION_DISCOUNTS lesson applied to trade).
- **Extensibility:** Rule-book entry forbids per-unit branches; sprite pipeline hooks documented; upgrade chains use the standard fields so future tiers slot in.
- **Data:** `UnitType` union widened (compile-checked everywhere); no save-schema change; old committed caravans behave identically (pinned test).
- **SFX:** Existing route-created cue (if any) covers all tiers; explicitly audited, not assumed.
- **Saved games:** No migration; obsolete queued caravans dequeue by existing rule; upgrade-while-committed resolved and tested.
- **Testing:** Tier matrix tests (domain gates, multipliers, range, war refusal, non-trade rejection), completeness suites for all six wirings, lifecycle teardown for new domains, upgrade-commitment edge, pacing gate.
- **Solo regressions:** Caravan-parity test pins pre-MR behavior bit-for-bit; existing trade suite re-runs.
- **Hot-seat regressions:** Route creation/teardown is owner-scoped already; advisor and drawer changes stay `currentPlayer`-scoped (MR6 tests extended, not replaced).
- **Implementation correctness:** The two verify-before-writing points (findPath sea domain value; `domain` union values) are called out precisely because guessing them is the likeliest failure; everything else is enforced by existing completeness tests.
