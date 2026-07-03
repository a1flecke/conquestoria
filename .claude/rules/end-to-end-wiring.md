---
paths:
  - "src/**"
---

# End-to-End Feature Wiring

## Never compute without rendering
- If you calculate data (e.g., movement range, attack targets, fog of war), it MUST be passed to the renderer and visually displayed
- If you create a utility function, it MUST be called from at least one code path — dead code is a bug
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
- When you add a `UnitType` to `TRAINABLE_UNITS` in `src/systems/city-system.ts`, the same change MUST also wire:
  1. **`UNIT_DEFINITIONS` + `UNIT_DESCRIPTIONS`** entries in `src/systems/unit-system.ts`.
  2. **Unit-renderer icon** in `src/renderer/unit-renderer.ts`.
  3. **Production-completion side-effects.** If the unit type has matching system state (e.g. spies → `state.espionage[civId].spies`, settlers → `state.cities` foundation), `src/core/turn-manager.ts` MUST create that state record at the same moment the `Unit` is added to `state.units`.
  4. **Death cleanup.** If the unit type has matching system state, `src/main.ts` death branches MUST clean it up to avoid zombie records.
  5. **AI usage.** The catalog-driven candidate and role paths in `src/ai/ai-production.ts` and `src/ai/ai-unit-roles.ts` MUST classify and consider the new unit. Add a narrow role override only for genuinely special behavior; do not add a one-off production branch to `src/ai/basic-ai.ts`.
  6. **Tech-gated dequeue.** `processCity` MUST consult `getTrainableUnitsForCiv(civ.techState.completed)` — or an equivalent — so an obsolete queued unit silently dequeues instead of producing forever.
- If the unit is terrain- or city-location-gated (for example a naval unit requiring a coastal city), both the production chooser and city processing/dequeue path must consult the same city-aware eligibility helper.
- If the unit replaces another unit, add `obsoletedByTech` to the source and an explicit `upgradesTo` target. Upgrade targets must never be inferred only from two units sharing a technology ID.
- Adding a `UnitType` to `TRAINABLE_UNITS` without all six wirings is "dead computed data" and is a bug.

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
- When you add an entry to `BUILDINGS` or `TRAINABLE_UNITS` in `src/systems/city-system.ts`, you MUST also add a matching entry to `PRODUCTION_ICONS` in the same file.
- The icon-coverage regression tests in `tests/systems/city-system.test.ts` will fail if a building or unit lacks an icon, but the rule catches it before the failed test cycle.
- Legendary wonders intentionally fall through to `PRODUCTION_ICON_FALLBACK` (`'🏗️'`); they are not required to have entries in this map until a follow-up issue adds wonder-specific icons.
