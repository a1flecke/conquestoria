# Trade Routes Overhaul — Design

Issue: [#553](https://github.com/a1flecke/conquestoria/issues/553) ("Bug: Trade Routes")

## Problem

Issue #553 reports four complaints:

1. Unclear how to start a trade route.
2. Unclear how to see your trade routes.
3. Feels like missing trade units — each era (or every couple eras) should have its own.
4. Land, air, and sea should each have their own trade unit.

Investigation shows this is not purely a UX bug:

- **Naval trade is actually broken, not just missing UX.** `canEstablishRoute` in
  `src/systems/trade-system.ts` rejects any route requiring a water crossing with the
  message `"Requires a Naval Trader to cross water"` — but no `Naval Trader` unit exists
  anywhere in the codebase. Worse, the `steam-navigation` tech (era 7) already ships with
  the unlock text *"Naval trade routes yield +2 gold"* — the tech tree assumes naval trade
  routes work today. They don't.
- **The root cause is a hardcoded pathfinding domain**, not a missing unit per se.
  `resolveFromCity` and `canEstablishRoute` both call
  `findPath(fromCity.position, toCity.position, state.map, 'land')` unconditionally, even
  though `findPath` already supports `'naval'` and `'air'` domains and `UnitDefinition`
  already has a `domain` field used by galleys, biplanes, etc. Caravan-only trade was
  encoded as a literal string, not derived from the acting unit's own movement domain.
- **Only one trade unit exists, ever**: `caravan` (land, era 4 `trade-routes`, cost 60). No
  upgrade line — every other unit family in the game (settlers, warriors, naval combat)
  has a 4-6 tier `obsoletedByTech`/`upgradesTo` chain; trade units have none.
- **Discoverability is genuinely weak.** The only way to learn trade routes exist is to
  already have a Caravan selected on the map (`selected-unit-info.ts` shows "Establish
  Route" only when `unit.type === 'caravan'`). The route list that *does* exist lives
  inside the Marketplace panel (`marketplace-panel.ts`), gated behind the `trade-routes`
  tech being researched, and isn't surfaced anywhere a player would naturally look (e.g.
  the city panel).
- **AI is caravan-specific.** `basic-ai.ts` has a `u.type === 'caravan'` branch for idle
  trade-unit handling. Adding new trade unit types without generalizing this means the AI
  never uses them — a direct violation of the codebase's "no per-unit-ID AI branch" rule
  (`end-to-end-wiring.md`).

## Goals

- Make naval and air trade routes actually function (fix the hardcoded `'land'` domain).
- Give each trade mode (land/sea/air) a historically-grounded, era-spanning unit upgrade
  line, so trade units don't go stale for the entire game the way `caravan` does today.
- Surface trade routes (existing + startable) in the city panel so players don't need to
  already have a caravan selected or already know the Marketplace panel exists.
- Keep all wiring generic (unit-role-driven, domain-driven) rather than per-unit-ID
  branches, per this codebase's established conventions.

## Non-goals

- No changes to the trade income formula (`calculateTradeRouteGold`,
  `getTradeRouteTechGold`) — new unit tiers exist so the roster and mechanic aren't stale/
  broken, not to re-tune trade gold balance.
- No changes to the Marketplace panel's existing route list — it stays as a secondary
  view; the city panel becomes the primary discoverable one.
- No new resource/diplomacy mechanics tied to trade routes.

## Design Review — Cross-Dimension Pass (2026-07-12)

Reviewed against balance/fun, new-mechanics soundness, player ages 7-43, play styles,
difficulty modes, AI usage, UI/UX, architecture/extensibility, data, SFX, save
compatibility, and solo/hot-seat regressions. Findings and the fixes folded into the
sections below:

- **SFX (gap, fixed in §3):** `sfx-catalog.ts` keys death sounds and a movement-class
  (`caravan: 'humanoid'`) per unit type. The original draft never mentioned this catalog —
  all 7 new units would have shipped silent. Added as a required wiring step.
- **Naming leaks a caravan-only assumption (gap, fixed in §2):** `getCaravanTripBonus` in
  `trade-system.ts` is already generic in behavior (checks buildings/wonder ownership, not
  `unit.type`) but its name implies caravan-only, inviting a future caravan-specific bug.
  Renamed to `getTradeUnitTripBonus` as part of this change.
- **Trip-bonus stacking had no ceiling documented (gap, fixed in §2):** four naval tiers ×
  +1 trip each, plus Caravanserai (+2) at both ends, plus Silk Road (+3), could stack to
  +11 trips over base 8 with no written ceiling — the same class of unbounded-stacking risk
  `game-balance.md` calls out for movement bonuses. Added an explicit inventory table and
  a per-unit cap.
- **Content-description honesty (gap, fixed in §3):** `UNIT_DESCRIPTIONS` for the 7 new
  units must follow `.claude/rules/content-description-honesty.md` — no invented mechanics
  (e.g. don't claim a specific gold% a unit doesn't actually grant). Added as an explicit
  checklist item since this class of bug (MR12) is exactly the failure mode here.
- **Ages 7-43 / self-explanatory UI (gap, fixed in §5):** the original Trade Routes panel
  description didn't specify plain-language help text. A 7-year-old and a 43-year-old both
  need "why does this button matter" spelled out per CLAUDE.md's "all UI elements must be
  self-explanatory" rule, not just a route list. Added explicit copy requirement.
- **Hot seat currentPlayer scoping (gap, fixed in §5):** the Trade Routes section must
  reuse the city panel's existing `state.currentPlayer`-scoped city context rather than
  recomputing ownership, and needs an explicit two-human regression (Player A's outgoing
  route must not render as Player B's route when B takes their turn). Added to Testing.
- **Difficulty modes (checked, no gap):** this game's "difficulty" is per-player
  `OpponentChallenge` (crisis/unrest pressure), not an AI economic multiplier — there is no
  AI-gold-bonus system for trade routes to interact with. No special per-difficulty logic
  needed; noted explicitly so this isn't silently unaddressed.
- **AI candidate generation (checked, no gap):** `ai-production.ts` already builds
  candidates generically from `TRAINABLE_UNITS` filtered by role
  (`entry => roles.includes(entry.role)`), so new trade-role unit types flow into AI
  production scoring automatically once catalog entries + `ai-unit-roles.ts` roles exist —
  confirmed by reading `ai-production.ts`, no `caravan`-specific branch exists there (the
  only caravan-specific branch is the idle-unit route-establishment logic in `basic-ai.ts`,
  already covered by §4).
- **Save compatibility (checked, fixed by explicit note in §3):** new unit types are purely
  additive `TRAINABLE_UNITS`/`UNIT_DEFINITIONS` catalog entries — no `GameState` shape
  changes, no `SAVE_MIGRATIONS` entry needed. An old save's existing `caravan` units keep
  working unchanged and become upgrade-eligible the moment the owning civ completes the
  relevant tech, identical to how any other pre-existing unit picks up a newly-added
  `upgradesTo` target. Added as an explicit non-migration confirmation plus a regression
  test loading a pre-change save fixture.
- **Architecture — `TradeRoute` doesn't record which unit/domain established it (considered,
  rejected):** would let UI show a per-route "via Container Ship" icon, but nothing in the
  goals needs it and it's not free (new field threaded through save schema). Explicitly
  rejected as scope creep (YAGNI) rather than left ambiguous.
- **Fun/balance — upgrade cadence (checked, no gap):** land line spans eras 4→6→10 (a
  6-era gap between tiers 2 and 3), which is intentionally sparser than the sea/air lines
  (2-era gaps) because `highway-network` is the first land-logistics tech after
  `mercantilism` in the existing tech tree — not an oversight, a tech-tree constraint noted
  explicitly so a future reader doesn't "fix" it into an invented intermediate tech.

## Design

### 1. Domain-generic route pathfinding (the core fix)

`resolveFromCity` and `canEstablishRoute` in `src/systems/trade-system.ts` currently
hardcode `findPath(..., 'land')`. Change both call sites to read
`UNIT_DEFINITIONS[caravanUnit.type].domain` (defaulting to `'land'` for unit types that
don't set it, matching existing convention) and pass that as the pathfinding domain. This
one change is what makes naval and air trade physically possible — no unit-type branching
required in the pathfinding logic itself.

The `"Requires a Naval Trader to cross water"` reason string in `canEstablishRoute`
becomes accurate once a real Naval Trader unit exists — a land-domain caravan still can't
path across water, and now the message is true instead of aspirational.

### 2. Three trade unit lines, historically anchored to existing eras/techs

Each line follows the codebase's standard `obsoletedByTech`/`upgradesTo` chain pattern
(same shape as `warrior → spearman → pikeman → ...`). `ERA_NAMES` (from
`src/ui/tech-panel.ts`) is the era-to-theme mapping used below.

**Land — Caravan line** (extends the existing `caravan`, does not replace it)

| Tier | Unit | Era | Tech | Historical anchor |
|---|---|---|---|---|
| 1 | Caravan (existing) | 4 Renaissance | `trade-routes` | pack caravans |
| 2 | Merchant Wagon | 6 Industrial | `mercantilism` | wagon trains, chartered trading companies |
| 3 | Freight Convoy | 10 Cold War | `highway-network` | trucking, interstate logistics |

**Sea — Naval Trader line** (new; this is what fixes the broken mechanic)

| Tier | Unit | Era | Tech | Historical anchor |
|---|---|---|---|---|
| 1 | Naval Trader | 5 Early Modern | `colonial-trade` | age-of-sail merchantmen, colonial trade |
| 2 | Steamship Trader | 7 Modern | `steam-navigation` | steam cargo ships (tech already says "naval trade routes yield +2 gold") |
| 3 | Cargo Freighter | 9 Progressive | `convoy-system` | WWII-era merchant marine/convoys |
| 4 | Container Ship | 11 Space Race | `container-shipping` | 1956+ containerization |

**Air — Air Freighter line** (new)

| Tier | Unit | Era | Tech | Historical anchor |
|---|---|---|---|---|
| 1 | Air Freighter | 9 Progressive | `air-superiority` | early cargo/airmail aircraft |
| 2 | Jet Freighter | 10 Cold War | `jet-aviation` | jet-age air cargo (707/747F) |
| 3 | Global Air Cargo | 12 Information Age | `digital-economy` | globalized/express air logistics |

All 10 units (7 new + existing `caravan`) get `productionCost` scaled roughly with era
progression (comparable to how naval/military unit costs scale per tier — see
`TRAINABLE_UNITS` for reference points at each era), and `movementPoints` consistent with
non-trade units of the same domain/era (e.g. Naval Trader ≈ contemporary naval combat
unit's movement, Air Freighter ≈ contemporary air unit's movement).

**Trip-count bonus on upgrade, not new gold formulas.** Each tier upgrade grants a modest
`tripsRemaining` bonus consistent with the existing scale (Caravanserai: +2 trips, Silk
Road wonder: +3 trips) — +1 trip per tier above tier 1, **capped at +3 total from tier
bonuses regardless of line length** (so the 4-tier Naval line caps at +3, not +3 from its
own tiers stacked further with the 3-tier lines' +2). This keeps upgrading meaningful
without touching the gold-per-trip formula, which stays owned entirely by
`calculateTradeRouteGold`/tech modifiers as today. `getCaravanTripBonus` is renamed to
`getTradeUnitTripBonus` as part of this change — its logic was already generic (keys off
city buildings and Silk Road ownership, not `unit.type`), only the name implied
caravan-only, which invites a future accidental caravan-specific regression.

**Trip bonus source inventory** (mirrors the format `game-balance.md` uses for movement
bonuses, so future trip-bonus sources stay legible):

| Source | Scope | Amount | Notes |
|---|---|---|---|
| Base | per route | 8 trips | existing, unchanged |
| Caravanserai (from-city) | per route | +2 trips | existing, unchanged |
| Caravanserai (to-city) | per route | +2 trips | existing, unchanged |
| Silk Road wonder | per route (owner) | +3 trips | existing, unchanged |
| Trade unit tier bonus | per route | +1/tier, capped +3 | new — this change |

Maximum realistic stack: 8 + 2 + 2 + 3 + 3 = 18 trips on a single route between two
Caravanserai cities owned by the Silk Road holder, using a top-tier trade unit. This is a
real economy input (more trips = more total gold over the unit's life), so the implementer
should sanity-check it against `tests/systems/pacing-audit.test.ts`'s outlier gate per
`game-balance.md`'s "Pacing Regression Prevention" rule before merging MR1.

### 3. Standard end-to-end unit wiring (per `end-to-end-wiring.md`)

For each of the 7 new unit types:

1. `UNIT_DEFINITIONS` + `UNIT_DESCRIPTIONS` entries in `src/systems/unit-system.ts`,
   with correct `domain` (`'land'` / `'naval'` / `'air'`). `UNIT_DESCRIPTIONS` text must
   pass `.claude/rules/content-description-honesty.md`'s checklist — describe only real,
   implemented effects (e.g. "upgrades from Naval Trader," "trade unit — establish a route
   to generate gold each turn"), never an invented bonus number. Grep
   `tests/systems/description-honesty.test.ts`'s denylist before finalizing text.
2. Unit-renderer icon in `src/renderer/unit-renderer.ts`.
3. `TRAINABLE_UNITS` entry in `src/systems/city-system.ts` with `techRequired`,
   `obsoletedByTech`, `upgradesTo` forming the chains above. `coastalRequired: true` for
   naval tiers (matching existing naval unit convention).
4. `PRODUCTION_ICONS` entry (icon-coverage test enforces this).
5. Tech `unlocksUnits` array entries in the corresponding
   `tech-definitions-erasN.ts` file for each anchor tech.
6. **SFX catalog** (`src/audio/sfx-catalog.ts`) — every unit type needs a death-sound entry
   and a movement-class entry (`caravan: 'humanoid'` is the existing pattern; naval/air
   trade units should use the same movement class as their domain's existing combat units,
   e.g. Naval Trader ≈ `galley`'s class, Air Freighter ≈ `biplane`'s class). Missing this
   was the review's most concrete gap — all 7 new units would otherwise ship silent.
7. Sprites: flagged as a follow-up step using the `generate-sprite-prompt` skill
   (`.claude/rules/sprites.md`) — not improvised here.

No production-completion side-effect wiring or death-cleanup is needed (trade units don't
have matching system-state records the way spies/settlers do) beyond what
`establishRoute`/`removeRouteForUnit` already do generically via `committedToRouteId`.

**Save compatibility:** all of the above are additive catalog entries — no `GameState`
shape change, no new field on `Unit`/`TradeRoute`, no `SAVE_MIGRATIONS` entry required. A
save from before this change loads unchanged; its existing `caravan` units become
upgrade-eligible the instant the owning civ completes the relevant new tech, exactly like
any other unit picking up a newly-added `upgradesTo` target. Add a regression test that
loads a pre-change save fixture and confirms it still loads and its caravans function.

### 4. Generalize trade-unit role instead of `type === 'caravan'` branches

- `ai-unit-roles.ts`: add all 7 new unit types to the `'trade'` role
  (currently `caravan: ['trade']`).
- `basic-ai.ts`: replace the `u.type === 'caravan'` filter in the idle-trade-unit handling
  block with a check against the shared trade-role set (derived from `ai-unit-roles.ts`,
  not a new hardcoded list), so AI automatically manages Naval Trader/Air Freighter units.
- `selected-unit-info.ts`: replace `unit.type === 'caravan'` (line ~440) with the same
  trade-role check, so "Establish Route" / "Committed to route" UI appears for all trade
  unit types, not just `caravan`.

This mirrors the existing pattern other unit-role generalizations already use in this
codebase (`end-to-end-wiring.md`'s "AI content catalogs must stay generic" rule).

### 5. City panel — Trade Routes section (discoverability fix)

Add a "Trade Routes" section to the city panel (`src/ui/city-panel.ts`), visible once the
civ has completed `trade-routes` (mirrors the existing gate in
`marketplace-panel.ts`'s route section). Contents:

- Active routes originating from *this* city — reusing the existing route-row rendering
  logic from `marketplace-panel.ts`'s `buildRouteListSection`, extracted into a shared
  helper (e.g. `src/ui/trade-route-presentation.ts`) so both panels render identically
  instead of duplicating DOM-building code.
- Remaining route capacity for the city (`getRouteCapacity` already computes this).
- If the city has spare capacity and the player owns no idle trade unit: an inline prompt
  naming the currently-trainable trade unit and its cost (derived from `TRAINABLE_UNITS`
  + tech state, not hardcoded to "Caravan").
- One line of plain-language help text at the top of the section, always visible (not a
  tooltip-only hover), e.g. "Trade routes earn gold every turn. Train a trade unit, then
  use Establish Route to start one." — this is the concrete fix for issue #1's "unclear
  how to start," aimed to read clearly for both a 7-year-old and an adult player per
  CLAUDE.md's "all UI elements must be self-explanatory" rule.

**Hot seat:** this section must render from the city panel's existing
`state.currentPlayer`-scoped city list — it must not independently recompute "which cities
belong to me," to avoid the classic hardcoded-`'player'` bug class this codebase's hot-seat
rules call out. A route where `fromCityId` belongs to Player A and `toCityId` belongs to
Player B must render as an outgoing route only in Player A's city panel and must not be
mistaken for Player B's own route when hot-seat turns switch.

This targets complaints #1 and #2 by putting both "can I start one" and "do I have one"
in the panel players already check per-city.

## Testing

- Regression: `canEstablishRoute`/`resolveFromCity` succeed for a naval-domain trade unit
  crossing water when a valid sea path exists, and still fail with the water-crossing
  reason for a land-domain unit.
- Regression: each new unit's `obsoletedByTech`/`upgradesTo` chain resolves correctly
  (existing `unit-upgrade-system.test.ts` pattern), including that a tier-1 unit
  auto-upgrades once its obsoleting tech completes.
- Icon-coverage and tech-unlocks-consistency generic tests (already exist) will fail loudly
  if any of the 7 new units skip a wiring step — no new test authoring needed there beyond
  adding the catalog entries.
- AI parity: an idle Naval Trader/Air Freighter gets a route proposed by `basic-ai.ts`,
  matching existing Caravan AI test coverage but parameterized over trade-role unit types
  instead of hardcoded to `caravan`.
- City panel: render test asserting the Trade Routes section shows active routes for the
  city and the correct trainable-trade-unit prompt when idle capacity exists.
- Pacing: re-run `tests/systems/pacing-audit.test.ts`'s outlier gate and
  `tests/systems/pacing-reference-economy.test.ts` after the trip-bonus change lands
  (MR1), per `game-balance.md`'s "Pacing Regression Prevention" rule — trip count is an
  economy-affecting input even though it isn't a `civYieldBonus`.
- Save compatibility: load a pre-change save fixture (or a synthetic `GameState` built to
  the pre-change shape) and confirm it loads without migration and its `caravan` units
  remain functional and become upgrade-eligible once the relevant tech completes.

**Regression matrix (solo vs. hot seat):**

| Scenario | Solo | Hot seat |
|---|---|---|
| Establish domestic land route | existing coverage | existing coverage |
| Establish domestic **naval** route (new) | new test | new test — Player A's naval route must not appear as Player B's |
| Establish foreign route to AI civ | existing coverage | n/a |
| Establish foreign route to **other human civ** (new surface via naval fix) | n/a | new test — diplomacy/war/embargo scrub (`scrubStaleForeignRoutes`, `scrubEmbargoedRoutes`) still fires correctly between two human-owned civs |
| City panel Trade Routes section | new test | new test — section scoped to `state.currentPlayer` only |
| AI idle trade-unit route establishment | existing coverage, extended to new unit types | n/a (AI-only behavior) |

## Suggested MR decomposition

Given the size (7 new units × full wiring + a system-level pathfinding fix + AI
generalization + a new UI section), this should ship as multiple MRs rather than one:

1. **MR1 — Fix the core mechanic**: domain-generic pathfinding fix (`trade-system.ts`),
   plus the Naval Trader line (tiers 1-4) fully wired. This alone fixes the broken/
   misleading naval trade behavior and is independently mergeable.
2. **MR2 — Land line extension**: Merchant Wagon, Freight Convoy tiers + upgrade chain
   wiring for the existing Caravan.
3. **MR3 — Air line**: Air Freighter, Jet Freighter, Global Air Cargo tiers.
4. **MR4 — AI generalization + City panel Trade Routes section**: the discoverability fix,
   done last so it can surface all unit types added in MR1-3 at once rather than being
   re-touched three times.

Each MR is independently useful and testable in isolation; MR1 alone directly resolves
the "broken mechanic" root cause even before the other two lines/UI ship.
