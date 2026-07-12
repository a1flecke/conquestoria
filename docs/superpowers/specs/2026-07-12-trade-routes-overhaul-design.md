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
Road wonder: +3 trips) — e.g. +1 trip per tier above tier 1. This keeps upgrading
meaningful without touching the gold-per-trip formula, which stays owned entirely by
`calculateTradeRouteGold`/tech modifiers as today.

### 3. Standard end-to-end unit wiring (per `end-to-end-wiring.md`)

For each of the 7 new unit types:

1. `UNIT_DEFINITIONS` + `UNIT_DESCRIPTIONS` entries in `src/systems/unit-system.ts`,
   with correct `domain` (`'land'` / `'naval'` / `'air'`).
2. Unit-renderer icon in `src/renderer/unit-renderer.ts`.
3. `TRAINABLE_UNITS` entry in `src/systems/city-system.ts` with `techRequired`,
   `obsoletedByTech`, `upgradesTo` forming the chains above. `coastalRequired: true` for
   naval tiers (matching existing naval unit convention).
4. `PRODUCTION_ICONS` entry (icon-coverage test enforces this).
5. Tech `unlocksUnits` array entries in the corresponding
   `tech-definitions-erasN.ts` file for each anchor tech.
6. Sprites: flagged as a follow-up step using the `generate-sprite-prompt` skill
   (`.claude/rules/sprites.md`) — not improvised here.

No production-completion side-effect wiring or death-cleanup is needed (trade units don't
have matching system-state records the way spies/settlers do) beyond what
`establishRoute`/`removeRouteForUnit` already do generically via `committedToRouteId`.

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
