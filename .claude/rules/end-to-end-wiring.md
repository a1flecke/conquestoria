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
  5. **AI usage.** `src/ai/basic-ai.ts` MUST queue the new unit type when its conditions hold; otherwise AI civs become asymmetric with the player.
  6. **Tech-gated dequeue.** `processCity` MUST consult `getTrainableUnitsForCiv(civ.techState.completed)` — or an equivalent — so an obsolete queued unit silently dequeues instead of producing forever.
- Adding a `UnitType` to `TRAINABLE_UNITS` without all six wirings is "dead computed data" and is a bug.
