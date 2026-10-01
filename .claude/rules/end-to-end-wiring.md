---
paths:
  - "src/**"
---

# End-to-End Feature Wiring

## Never compute without rendering
- If you calculate data (e.g., movement range, attack targets, fog of war), it MUST be passed to the renderer and visually displayed
- If you create a utility function, it MUST be called from at least one code path — dead code is a bug
- **Espionage informational missions** are a recurring instance of this bug class: `resolveMissionResult` in `espionage-missions.ts` computing a real `MissionResult` payload that is only ever attached to the generic `espionage:mission-succeeded` bus event — which has **no listener anywhere**. A mission "succeeding" in game logic is not the same as the player receiving the intel it claims to gather. When adding a new informational `SpyMissionType` (one whose payoff is "the player learns X," not a state-mutating disruption): (1) persist a small, bounded, snapshot-only report on the *acting* civ's own `EspionageCivState` in the `case 'mission_succeeded'` block of `espionage-turn.ts` (never on the target's), following the `signalsIntelligence`/`troopObservations`/`intelReports`/`resourceReports`/`diplomacyReports` field convention there; (2) emit a dedicated notification (or extend `espionage:intel-report-acquired`) so the player gets immediate feedback; (3) render it in `espionage-panel.ts`. See `tests/systems/espionage-system.test.ts`'s "informational mission report persistence" describe block for the regression pattern this must satisfy.
- After implementing any system logic, trace the data flow: **state → compute → UI/renderer → user sees it**
- If you extract or add a replacement UI helper for an existing player-visible flow, wire the real entry path to that helper in the same change. Shipping the old inline flow while the new module sits unused is still a broken feature.
- For extracted entry flows, tests must cover real interaction behavior, not just isolated render shape. A passing test that never exercises the live path or callback contract is insufficient.
- If an extraction exposes an existing bug in the inherited flow, do not freeze that bug in place under the banner of parity. Either fix it in the same change or stop and get a user decision on whether to defer it into a documented follow-up issue with reproduction details and the intended fix.

## Every user action needs visible feedback
- Combat must show what will happen BEFORE it happens (preview panel with Attack/Cancel)
- Movement must show where the unit CAN move (highlighted hexes)
- Building must show what it does (yields, description) at the point of selection
- Errors and state changes must be communicated visually, not just logged to console
- Movement failures returned by shared movement helpers must show a player-facing warning and must not trigger movement animation.
- Cargo state changes such as load/unload must visibly refresh the selected-unit panel and play/use the same feedback path as other unit actions.

## Coordinate transforms must be end-to-end
- If the map wraps horizontally, wrapping must be applied in BOTH rendering (ghost tiles) AND input (coordinate normalization)
- If a coordinate system conversion exists (hex ↔ pixel ↔ screen), verify all three directions work

## Shared State Mutations must be actor-complete
- If a gameplay consequence can be triggered by both the human player and AI or turn processing, the mutation must live in a shared system helper rather than only in `main.ts`
- History/progression rules such as kills, captures, quest progress, and wonder race updates must be wired through every real execution path, not just the UI interaction path
- Add at least one parity regression covering the human path and one non-human path for any new shared consequence

## Transition Events must be transition-owned
- If a feature emits events on state transition, add a regression proving the event fires exactly once across repeated turns/renders and does not recur from steady-state scans.
- Prefer returning explicit transition payloads from the mutating helper over re-deriving one-time events by re-reading final state.

## Trainable units must be wired end-to-end

Adding a `UnitType` to `TRAINABLE_UNITS` (`src/systems/city-unit-catalog.ts`) no longer means remembering six places. Each wiring is owned by a mechanism and a test that fails when it is missing (#1202):

| # | Wiring | Owner | Fails when missing |
|---|---|---|---|
| 1 | `UNIT_DEFINITIONS` + `UNIT_DESCRIPTIONS` | `unit-definitions.ts`, `unit-descriptions.ts` | per-unit catalog tests (`trade-system.test.ts`, `city-system.test.ts`) |
| 2 | Renderer icon | `resolveUnitVisual().fallbackIcon` (`src/renderer/unit-visual-resolver.ts`) | `unit-visual-resolver.test.ts` "provides a concrete fallback icon for every defined unit type" (loops **all** `UNIT_DEFINITIONS`, a superset of the catalog). Bespoke sprite art is a separate, optional layer (`.claude/rules/sprites.md`). |
| 3 | Production-completion side effects (missionary charges, naval/air bonuses, gene therapy, barracks/wonder XP, air basing, **the spy's `state.espionage` record**) | `completeUnitProduction` (`src/systems/unit-production-completion.ts`) — the **only** completion, used by the turn path (`turn-manager.ts`) and the gold rush-buy (`economy-system.ts`); the buy path used to be a partial second copy | `unit-production-completion.test.ts`: every `TRAINABLE_UNITS` entry is produced, rosters/cargo/air-base invariants hold, its lifecycle category's companion contract holds, and a **footprint guard** fails if production writes any `GameState` key its category has not declared. `architecture-boundaries.test.ts` "#1202" pins the single owner. |
| 4 | Death cleanup | `removeUnits` (`src/systems/unit-removal-system.ts`, #1198) — the only way a unit leaves `GameState`; a hand-rolled delete is a source-rule violation | `unit-production-completion.test.ts` removal matrix (one representative per lifecycle category: ordinary, settler, missionary, spy, air-based, carrier, transport, trade) plus the #1198 architecture sweep |
| 5 | AI usage | catalog-driven candidates in `src/ai/ai-production.ts`, `ai-unit-roles.ts` | catalog-vs-candidate comparison tests |
| 6 | Tech-gated dequeue | `processCity` consults `getTrainableUnitsForCiv` | `processCity` tests |

- **A new kind of unit with companion state** (a unit that needs its own record, like the spy's) is added in one place: `completeUnitProduction` creates it, `removeUnits` scrubs it, and `categoryOf` + `FOOTPRINT` in `unit-production-completion.test.ts` gain a category with its companion contract. Until then the footprint guard fails the new unit — it cannot ship uncategorised.
- Categories are **derived from typed definition metadata** (`isSpyUnitType`, `airOperation`, `carrierDeckCapacity`, `isNavalTransportUnit`, `hasAITradeRole`, `canFoundCity`), never a hand-kept list of unit names.
- Out of scope by design: units that are not produced by a civilization's city queue (beasts, barbarians, pirates, crisis forces, rebels, village/quest rewards) and **minor-civ production**, which has no `Civilization`/tech/espionage record and its own land-only rules (`minor-civ-economy-system.ts`, `.claude/rules/game-balance.md` #950).
- If the unit is terrain- or city-location-gated (for example a naval unit requiring a coastal city), both the production chooser and city processing/dequeue path must consult the same city-aware eligibility helper.
- If the unit replaces another unit, add `obsoletedByTech` to the source and an explicit `upgradesTo` target. Upgrade targets must never be inferred only from two units sharing a technology ID.

## AI content catalogs must stay generic
- New trainable units and buildings must flow into AI candidates from `TRAINABLE_UNITS`, `BUILDINGS`, and the shared eligibility helpers. Tests must compare the currently eligible catalogs to generated AI candidates so future additions fail loudly if they are skipped.
- Unit role tests must derive air, transport, spy, and other semantic classes from typed definition metadata or shared predicates. Do not maintain duplicate hardcoded test lists that silently become stale.
- National-project availability must use `getReservedNationalProjectKeys`, which includes both completed projects and projects queued in any city. The AI and player must not self-compete for `uniquePerEmpire` content.
- Legendary-wonder AI must enumerate typed wonder definitions through shared eligibility/presentation helpers, cap simultaneous investment, and preserve global uniqueness. New wonders should not require a wonder-ID branch in AI code.

## Tech unlock arrays must be wired end-to-end
- When you add a `TRAINABLE_UNIT` with `techRequired`, add its `type` to that tech's `unlocksUnits` array in `src/systems/tech-definitions.ts`.
- When you add a `BUILDING` with `techRequired`, add its `id` to that tech's `unlocksBuildings` array in `src/systems/tech-definitions.ts`.
- The completeness tests in `tests/systems/tech-unlocks-consistency.test.ts` will fail if either is omitted — treat a failing completeness test as a required fix, not a warning.
- Civ-specific unit replacements (`civTypeRequired` set) are excluded from `unlocksUnits` and from the completeness test.
- `Tech.unlocks` must contain **effect text only** (e.g. `'Farms yield +1 food'`, `'Reveal Copper resource'`) — never a bare building or unit name. Entity names belong exclusively in `unlocksUnits`/`unlocksBuildings`. A test in `tech-unlocks-consistency.test.ts` enforces this: any string in `unlocks` that exactly matches a building or unit name will fail the suite.

## Production icons must be wired end-to-end
- When you add an entry to `BUILDINGS` in `src/systems/city-building-catalog.ts` or to `TRAINABLE_UNITS` in `src/systems/city-unit-catalog.ts`, you MUST also add a matching entry to `PRODUCTION_ICONS` in `src/systems/city-production-presentation.ts` (#1008).
- The icon-coverage regression tests in `tests/systems/city-system.test.ts` will fail if a building or unit lacks an icon, but the rule catches it before the failed test cycle.
- Legendary wonders intentionally fall through to `PRODUCTION_ICON_FALLBACK` (`'🏗️'`); they are not required to have entries in this map until a follow-up issue adds wonder-specific icons.
