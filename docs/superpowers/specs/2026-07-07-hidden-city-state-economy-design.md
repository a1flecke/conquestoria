# Hidden City-State Economy Design

**Issue:** [#490](https://github.com/a1flecke/conquestoria/issues/490)
**Related future designs:** [#496 city-state leagues](https://github.com/a1flecke/conquestoria/issues/496), [#497 minor-civ graduation](https://github.com/a1flecke/conquestoria/issues/497)
**Status:** Approved design
**Date:** 2026-07-07

## Summary

City-states should feel like small living polities rather than static quest dispensers. This design adds a hidden, production-backed economy for minor civilizations. A city-state quietly grows, produces buildings and units, changes posture, mobilizes under threat, recovers from emergency levies, and exposes only viewer-safe summaries to the player.

The chosen approach is a hybrid model: reuse real `City` yield, food, production, queue, building, and unit-completion mechanics, but place a city-state-specific policy layer and hard caps on top. City-states remain bounded one-city actors for this design. They do not become hidden full major civilizations.

## Goals

- Make city-states feel alive through real production-backed growth and defenses.
- Replace or reduce unexplained magic behavior, especially free garrison replacement and era upgrades, where production-backed alternatives exist.
- Keep minor-civ behavior deterministic, serializable, and testable.
- Reuse existing city and production helpers instead of duplicating a second economy.
- Keep city-states bounded so they remain interesting neighbors rather than hidden major powers.
- Preserve hot-seat privacy and discovery rules through viewer-scoped presentation helpers.
- Leave explicit extension points for future city-state leagues and rare minor-to-major graduation.
- Integrate with the existing regional grievance, coalition, and reparations systems instead of creating a parallel mobilization model.

## Non-Goals

- City-state settlers, expansion, or multi-city empires.
- City-state workers or autonomous tile improvement logic.
- Full city-state research trees.
- National projects, legendary wonders, or other unique race content.
- A full management UI for city-state internals.
- City-state leagues. Those are split to #496.
- Probabilistic graduation into major civilizations. That is split to #497.
- New major-civ diplomacy mechanics beyond what is needed to surface city-state posture and warnings.

## Current Code Context

Current minor civilizations already own real `City` records and real units:

- `placeMinorCivs` creates a `City` with population, buildings, queue fields, and one garrison unit.
- `MinorCivState` tracks the owning city, units, diplomacy, quests, chain status, garrison cooldown, and last era upgrade.
- `processMinorCivTurn` currently resets minor-civ units, plans movement/combat, processes quests, applies ally bonuses, processes garrison replacement, and emits relationship threshold events.
- `minor-civ-coalition-system.ts` already tracks `regionalGrievanceByCiv`, pressure, grievance status, mobilization progress, conscription cooldowns, recovery strain, coalition records, coalition cooldowns, and reparations effects.
- `processCity` already advances food, growth, production queue progress, building completion, unit completion, idle production, and invalid queued item removal for major-civ cities.
- The main turn manager only runs the city production loop for `state.civilizations[*].cities`. Minor-civ cities whose owner is `mc-*` do not currently flow through that loop.
- Presentation and notification paths already use viewer-scoped helpers such as `getMinorCivPresentationForPlayer` and hide undiscovered city-state identities.
- The diplomacy panel already surfaces regional grievance and reparations for discovered city-states. Economy posture must compose with that surface rather than duplicate or contradict it.

This design adds a minor-civ economy turn inside the minor-civ system rather than treating city-states as entries in `state.civilizations`.

## Core Invariants

1. A city-state economy is authoritative only while the minor civilization is active and owns its city.
2. The actual production queue, production progress, food, population, and buildings remain on the existing `City` object.
3. `MinorCivState.economy` stores policy, posture, cooldowns, and summaries, not a duplicate city simulation.
4. Minor-civ economy processing is deterministic. It must not use `Math.random()`.
5. Events notify presentation layers; listeners do not mutate city-state economy state.
6. Completed minor-civ units are added to `state.units` and `MinorCivState.units`, not to any major-civ roster.
7. Unit creation must respect map occupancy. If no valid spawn tile exists, the spawn is delayed or skipped according to explicit rules.
8. City-state UI reads through `*ForPlayer` presentation helpers and never directly exposes raw hidden economy state.
9. Undiscovered city-states do not leak names, colors, locations, postures, queue classes, or economic hints.
10. Difficulty affects caps, mobilization timing, cooldowns, and policy efficiency, not hidden rule exceptions.
11. Economy state must not duplicate `regionalGrievanceByCiv`, `minorCivCoalitions`, or `minorCivRegionalCooldowns`. It may read those states and update them only through their existing helpers.
12. Newly trained or conscripted minor-civ units do not move or attack on the same turn they are created.

## Data Model

Add a small economy state to `MinorCivState`:

```ts
export type MinorCivPosture =
  | 'settled'
  | 'fortifying'
  | 'mobilizing'
  | 'recovering';

export type MinorCivPolicy =
  | 'balanced'
  | 'defense'
  | 'economy'
  | 'knowledge'
  | 'recovery';

export interface MinorCivEconomyState {
  policy: MinorCivPolicy;
  posture: MinorCivPosture;
  lastProcessedTurn: number;
  lastPostureChangeTurn?: number;
  localRecoveryUntilTurn?: number;
  lastQueueDecisionTurn?: number;
  pendingUnitSpawn?: {
    unitType: UnitType;
    completedTurn: number;
    attempts: number;
  };
  recentProductionSummary?: {
    itemId: string;
    itemClass: 'building' | 'unit' | 'idle';
    completedTurn: number;
  };
}
```

`economy` is optional for save compatibility:

```ts
export interface MinorCivState {
  // existing fields
  economy?: MinorCivEconomyState;
}
```

Loaded saves normalize missing economy state into a stable default:

```ts
{
  policy: 'balanced',
  posture: 'settled',
  lastProcessedTurn: Math.max(0, state.turn - 1),
}
```

`lastProcessedTurn` is an audit/idempotence marker, not a reason to skip the next legitimate minor-civ economy turn after loading. Normalization must not change city queues, production progress, units, regional grievance, coalitions, or diplomacy except to add missing default economy metadata.

## Architecture

### 1. Economy module

Add a focused economy module, preferably `src/systems/minor-civ-economy-system.ts`, to keep `minor-civ-system.ts` from growing into a catch-all.

The module owns:

- economy normalization
- posture evaluation
- build-policy selection
- queue maintenance
- minor-civ production processing
- minor-civ-specific completion handling

Viewer-safe presentation can live in the same module for the first slice, but it should remain a separate helper boundary. If the implementation grows, split presentation into a small `minor-civ-economy-presentation.ts` rather than letting UI code read raw economy state.

`processMinorCivTurn` remains the orchestrator. It calls the economy helper before planning/movement/combat so the plan sees newly completed units.

### 2. Turn flow

For each active minor civilization:

1. Normalize economy defaults.
2. Skip processing if the minor civ is destroyed or no longer owns its city.
3. Reconcile regional grievance pressure for the minor civ, preserving existing pressure/cooldown semantics.
4. Recalculate posture from current state, including war, local threats, regional grievance, and recovery strain.
5. Maintain or choose the city production queue when empty or invalid.
6. Calculate city yields using existing city work/yield helpers plus minor-civ-safe resource and tech-band helpers.
7. Call `processCity` for food, growth, production, building completion, and unit completion.
8. Apply city maturity if appropriate for city-states.
9. Handle completed minor-civ buildings, units, and pending unit spawns.
10. Update `recentProductionSummary`.
11. Emit typed economy or mobilization events only from actual state transitions.
12. Continue existing quest, ally, plan, movement, combat, relationship, coalition, and notification logic. Coalition activation that depends on all member pressure should still run after member-level processing.

Newly created units are included in strength/cap accounting immediately but are marked unable to act until the next minor-civ turn. This keeps production meaningful without producing instant hidden attacks.

### 3. Completion handling

Building completion can use the normal `City.buildings` result from `processCity`. Unit completion needs city-state-specific handling because minor civs are not stored in `state.civilizations`.

When `processCity` reports `completedUnit`:

- choose the city tile or a valid adjacent tile using deterministic ordered coordinates
- store `economy.pendingUnitSpawn` if every legal tile is occupied or invalid
- create the unit with owner `mc.id`
- set the new unit's movement/action state so it cannot move or attack until the next minor-civ turn
- add it to `state.units`
- append the unit id to `mc.units`
- emit a minor-civ economy event if the event is player-relevant through presentation routing
- clear `economy.pendingUnitSpawn` only after the unit is actually created

The implementation must not emit a major-civ `city:unit-trained` event unless that event is made semantically safe for non-major owners. A dedicated event is clearer:

```ts
'minor-civ:production-completed': {
  minorCivId: string;
  cityId: string;
  itemId: string;
  itemClass: 'building' | 'unit';
  state?: GameState;
}
```

The event listener should expand this raw economy event into viewer-specific notifications through the same eligibility checks used by `getMinorCivPresentationForPlayer`; the economy system itself should not decide visibility from `state.currentPlayer` alone.

When `economy.pendingUnitSpawn` exists at the start of a later turn, retry that spawn before adding more production progress to the same queue item. Pending spawns should be capped by attempts or age so a permanently blocked city does not accumulate invisible completed units.

### 4. Existing garrison behavior

Current garrison replacement and regional grievance defender spawning must converge into one production/mobilization budget. During migration, the legacy garrison replacement can remain as a temporary backstop only when a city-state has no functioning economy state or no legal production path. The target behavior is production-backed defense:

- a city-state with no units switches to `mobilizing` or `recovering`
- it queues a defender if it can legally build one
- emergency conscription uses the existing regional grievance cooldown/strain fields when the trigger is regional aggression
- free garrison respawn should not silently produce professional units indefinitely
- production-backed defenders, regional mobilization defenders, and emergency conscription must not all fire independently in the same turn for the same city-state

## Regional Grievance And Coalition Integration

The current regional grievance system is not a future hook; it is live state. The hidden economy must treat it as an input and gradually move its unit generation into the economy path.

### Source of truth

Keep these fields authoritative for regional aggression:

- `MinorCivState.regionalGrievanceByCiv`
- `GameState.minorCivCoalitions`
- `GameState.minorCivRegionalCooldowns`

Do not add separate economy fields for regional pressure, coalition membership, reparations, conscription cooldown, or regional recovery strain. The economy may derive posture and queue scores from those fields.

### Mobilization budget

For each minor civ and turn, compute one mobilization budget from:

- active war with a major civ
- immediate city threat
- regional grievance status and pressure
- coalition status
- existing living units and unit cap
- recent conscription or recovery strain

That budget decides whether the city-state:

- queues a defender through normal production
- stores production priority for future turns
- performs emergency conscription
- does nothing because caps, cooldowns, or recovery block action

Tests must prove a city-state cannot receive a trained defender from production and a regional grievance defender from the existing helper in the same turn unless the design explicitly budgets both and the cap permits both.

### Reparations and cooling

Reparations lower regional pressure and should also influence economy posture:

- `coalition-talks` or `mobilizing` can drop to `fortifying` or `settled` only through the shared grievance state.
- Economy presentation must not show a city-state as `Mobilizing` after reparations if the grievance helper has already cooled the pressure below the mobilization threshold.
- The diplomacy panel should render regional grievance and economy posture as one coherent block, not two unrelated warnings.

## Posture

Posture is the high-level state shown to players through presentation helpers.

### `settled`

Default peaceful state. The city-state favors economic, archetype, and modest defense investments.

### `fortifying`

Used when the city-state is not at war but has plausible local danger: nearby hostile units, recent conquest pressure, a weak garrison, or a negative relationship trend. It favors walls, barracks-style buildings, and defenders.

Regional grievance status `wary` generally maps to `fortifying` unless the pressure is low and no local threat exists.

### `mobilizing`

Used during war, imminent city threat, severe recent aggression, `regionalGrievanceByCiv` status `mobilizing`/`coalition-talks`, or active/forming minor-civ coalitions. It prioritizes defenders and can consider emergency conscription through the shared mobilization budget.

### `recovering`

Used after conscription, heavy unit losses, siege pressure, city damage, or population loss. It favors food, basic economy, and cooldown. It blocks repeated emergency levies until recovery ends.

Posture transitions should be transition-owned. Tests must prove a warning event fires once on a transition such as `settled -> mobilizing`, not every turn that the state remains `mobilizing`.

## Build Policy

Build policy is definition-driven by archetype plus posture. It should use existing catalogs and eligibility helpers, then filter down to city-state-safe items.

### Shared restrictions

City-states cannot queue:

- settlers
- workers
- spies unless a later design explicitly adds city-state espionage
- caravans or trade-route units unless a later implementation gives city-states explicit route ownership and AI use
- national projects
- legendary wonders
- unique-per-empire projects
- items whose tech/resource/building/location requirements are not met

City-states should not queue an item they already have unless the catalog allows repeat production, such as units.

### Archetype bias

Militaristic:

- favors defenders and military buildings
- reaches higher unit caps
- changes to `fortifying` and `mobilizing` earlier
- recovers faster from defense losses

Mercantile:

- favors marketplace and economy buildings
- has modest defenses unless threatened
- may later feed league or graduation wealth signals
- values trade-route relationships as an economy hint

Cultural:

- favors library, temple, science, culture, and prestige buildings
- has lower peaceful unit caps
- gets resilient institutional growth rather than large armies

### Queue selection

When a city-state needs a queue item:

1. Determine posture.
2. Build a list of legal city-state-safe buildings and units.
3. Score each candidate by archetype, posture, current era, existing buildings, unit cap, and difficulty.
4. Break ties deterministically by score, priority, then stable id.
5. Queue only the selected item, or maintain a short queue if tests prove order/ETA remains visible through presentation.

Avoid long hidden queues in the first implementation. A single active item is simpler, easier to reason about, and enough to make the economy real.

### Tech and resource eligibility

City-states are not entries in `state.civilizations`, so major-civ helpers that assume a `Civilization` record are unsafe. In particular, `getCivAvailableResources(state, mc.id)` returns an empty set today because minor civs are not major civ records.

Add minor-civ-safe helpers instead:

- `getMinorCivCompletedTechBand(state, minorCivId)` returns a deterministic era-band tech set for production eligibility only.
- `getMinorCivAvailableResources(state, minorCivId)` reads the city-state city, owned tiles, resource definitions, improvements, and the era-band reveal set without requiring `state.civilizations[minorCivId]`.
- `getMinorCivBuildCandidates(state, minorCivId)` wraps `getAvailableBuildings` and `getTrainableUnitsForCity`, then applies the city-state-safe restrictions.

These helpers must have negative tests proving they do not call major-civ-only resource paths and do not unlock resources/buildings before the city-state's era band allows them.

## Units And Mobilization

### Unit caps

Unit caps depend on era, posture, archetype, and difficulty. Early peaceful city-states should not flood the map.

Example target shape:

- Explorer: peaceful 1-2, mobilizing 2-3
- Standard: peaceful 1-2, mobilizing 3-4
- Veteran: peaceful 2-3, mobilizing 4-5 for militaristic city-states

The exact values should live in a small table and have era coverage tests.

### Unit eligibility

City-states do not use full research. They use `state.era` plus curated unlock bands. The unit set should be derived from existing unit definitions where possible, but the allowed list must be explicitly city-state-safe.

The current `ERA_UNIT_MAP` can seed the first version, but production should eventually train the chosen era-appropriate defender rather than mutating existing units into a new type during era advancement.

### Emergency conscription

Conscription is allowed only through the shared mobilization budget. It is valid only when all of these are true:

1. Posture is `mobilizing`.
2. The city is under immediate threat, at war with a nearby active target, or has severe regional grievance pressure.
3. The city-state is below its minimum emergency defender count.
4. The relevant regional grievance `conscriptCooldownUntilTurn` is absent or has passed, or the non-regional conscription source has an equivalent tested cooldown.
5. The city has enough population or economy capacity to pay the cost.
6. A legal spawn tile exists.

Conscription costs one or more of:

- population loss
- existing regional recovery strain, such as `recoveryStrainedUntilTurn`, when the cause is regional aggression
- `localRecoveryUntilTurn` for non-regional emergency recovery
- production progress reset or penalty
- longer recovery posture

If a militia unit type is introduced later, conscription should create weaker militia. Until then, use the weakest era-appropriate defender with reduced health, no same-turn action, and no bonus experience. Deferring conscription entirely is acceptable only if regional grievance emergency spawning remains in place for that implementation slice and is explicitly marked as temporary.

### Map clutter and force projection

City-state units should mostly defend their home region. Production caps are not enough by themselves; the plan/movement layer must also avoid far-away harassment.

- Peaceful or `fortifying` city-states patrol within the existing minor operational radius.
- `mobilizing` city-states can pursue direct attackers, local threats, and active war targets but should not chase across the world.
- Explorer difficulty should bias strongly toward defensive positioning.
- Tests must cover that production increases local defense without creating distant offensive pressure in early eras.

## Buildings And Era Progression

City-states can build ordinary non-unique buildings that match their archetype and current era band. They do not need the major-civ tech tree, but they must not bypass location, resource, or prerequisite-building rules.

Era advancement should not silently mutate every existing city-state unit into a new unit type as the long-term design. Instead:

- new production unlocks stronger defenders by era band
- old units remain old unless a future explicit upgrade helper is added
- city-state population/building growth comes from the economy path

If the legacy era upgrade remains during an incremental implementation, the spec must call it temporary and add tests proving it does not duplicate production-backed upgrades.

## Visibility And UI

Raw economy state is hidden. Player-facing surfaces use viewer-scoped presentation helpers.

### Visibility layers

Undiscovered:

- no diplomacy row
- no named warnings
- no color, posture, queue, or economy hints

Discovered:

- city-state name, archetype, relationship, and broad posture
- possible labels: `Quiet`, `Fortifying`, `Mobilizing`, `Recovering`, `Prosperous`

Friendly, allied, or trade-connected:

- coarse economy hints, such as `building defenses`, `training militia`, `investing in trade`, or `recovering from levy`
- no exact queue item or ETA unless the design adds an earned intel source

Future spy or earned-intel layer:

- can reveal queue class and rough ETA band
- is out of scope for #490 unless the implementation plan explicitly adds a narrow earned-intel presentation helper without new espionage mechanics

### Diplomacy panel

The diplomacy panel should show broad posture for discovered city-states. If it shows any derived label such as `Mobilizing`, the label must come from one shared presentation helper and include negative tests proving hidden or non-qualifying states are not surfaced.

Panel actions that can change relationship, war state, or posture must refresh the open panel immediately. Updating only state or HUD is not enough.

### Notifications

Notifications must route per eligible viewer:

- a known target can receive mobilization or conscription warnings
- undiscovered city-states use generic text or remain hidden, depending on event type
- hot-seat events are queued only for eligible civs
- hidden identities, colors, and locations do not leak

## Client And Mode Behavior

The economy is shared gameplay state. It must run identically in the web/PWA build and the Tauri build.

- New economy code belongs under shared `src/` systems, UI, renderer, or storage boundaries.
- Shared modules must not import Tauri APIs, browser-only globals, or asset-path assumptions.
- Save/load shape must be identical across web, PWA, and Tauri clients.
- Any client-specific behavior must enter through existing platform capability boundaries, not through economy-specific branches.

### Solo

Solo play can show eligible notifications immediately through the normal notification/log path for the current player. It must still use viewer-scoped presentation helpers, because the solo player may not have discovered every city-state.

Solo tests should prove undiscovered city-state economy events remain hidden even though there is no hot-seat handoff.

### Hot-seat

Hot-seat must treat economy events the same way as other viewer-scoped state:

- queue eligible notifications through the existing pending-event handoff path
- do not show another civilization's city-state intelligence during the active player's turn
- derive viewer eligibility from the event target, discovered city-state state, and current player context
- never rely on a global human/player assumption when deciding whether to reveal posture, name, location, or queue hints

Hot-seat tests should cover both eligible and ineligible viewers for the same economy transition.

## Difficulty And Balance

Use `resolveOpponentChallenge(state)` and a small minor-civ tuning table.

Explorer:

- lower unit caps
- slower mobilization
- longer conscription cooldowns
- clearer warning thresholds
- stronger early-game guardrails

Standard:

- balanced production-backed defense
- occasional emergency levy when clearly threatened
- moderate recovery time

Veteran:

- faster posture changes
- better queue scoring
- higher defensive caps
- shorter recovery
- still respects global caps and early-game guardrails

The design should avoid severe early pressure. Before a defined early-game turn or era threshold, city-states can defend themselves but should not project force far from home except against always-hostile actors or direct attackers.

Fun comes from readable consequences, not surprise punishment. City-states should feel tougher because their cities invest, warn, recover, and remember pressure. They should not become frequent chores, hidden raiders, or a second class of full AI empires. Warnings, posture labels, and caps should make escalation understandable before it becomes dangerous.

## Future Extension Points

### City-state leagues (#496)

The hidden economy should expose enough non-UI state for future league coordination:

- posture
- recent production class
- threat/recovery state
- conscription cooldown
- broad economy strength

Leagues may later bias member production or shared posture, but #490 does not implement league membership or coordination.

### Minor-civ graduation (#497)

The hidden economy should expose enough history for a future 50-turn probabilistic graduation check:

- survival age
- population and maturity
- buildings and production output
- defensive success
- trade wealth or relationships
- regional security or opportunity

#490 does not convert city-states into major civilizations. It only makes the future eligibility check grounded in real state.

## Save Migration

Loaded saves must normalize safely:

- add missing `economy` defaults to active city-states after minor-civ quest and coalition state are normalized
- leave destroyed city-states alone except for shape safety
- do not modify existing city queues or production progress
- do not create units during load
- do not emit events during load
- round-trip economy state through save/load

If a loaded save has impossible economy data, normalization should fall back to `settled`/`balanced` and preserve the city-state rather than crashing. Invalid `pendingUnitSpawn` records should be dropped unless they name a legal city-state-safe unit type and a sane completion turn. Normalization must not clear `regionalGrievanceByCiv`, `minorCivCoalitions`, or `minorCivRegionalCooldowns`.

## Testing Strategy

### System tests

- Legacy save normalization adds default economy state to active city-states.
- Destroyed city-states do not process economy.
- Captured city-state cities stop processing as minor-civ economies.
- A city-state with an empty queue chooses an archetype-appropriate item deterministically.
- Queue selection never chooses settlers, workers, national projects, legendary wonders, or unavailable items.
- Production advances through `processCity` and completes a building.
- Production advances through `processCity` and completes a unit.
- Completed units are added to `state.units` and `mc.units`, not a major-civ roster.
- Unit spawn respects occupancy and delays or skips when no legal tile exists.
- Pending unit spawns retry when a tile opens, clear only after real creation, and cannot accumulate unlimited hidden completions.
- Newly trained and conscripted units cannot move or attack on the same turn they are created.
- Peaceful city-states obey unit caps.
- Threatened city-states switch to `mobilizing` and prioritize defense.
- `settled -> mobilizing` warnings fire once per transition, not every steady-state turn.
- Conscription requires all gating conditions and has negative tests for missing threat, cooldown, insufficient population, and blocked spawn.
- Regional grievance, reparations, and coalition pressure drive posture through the existing grievance fields.
- Production-backed defenders and regional grievance defenders cannot both spawn independently in the same turn outside the shared mobilization budget.
- Reparations that cool grievance also cool economy posture/presentation.
- Minor-civ resource and tech helpers do not call major-civ-only resource paths and do not reveal locked resources.
- Early-era production increases local defense without creating distant offensive pressure.
- Explorer, Standard, and Veteran profiles produce distinct caps or mobilization timing.
- Existing quest and durable-alliance state keeps working while economy turns run.
- Human and AI conquest/combat paths interact with the same minor-civ state.

### UI and presentation tests

- Undiscovered city-states do not leak economy, posture, names, colors, or queue hints.
- Discovered city-states show only broad posture.
- Friendly/allied/trade-connected city-states show coarse economy hints and no raw queue details.
- Solo notifications still hide undiscovered city-state economy events.
- Hot-seat notifications route only to eligible viewers and do not leak during handoff.
- Diplomacy panel rerenders after actions that change posture or relationship.
- Derived posture labels come from a shared helper and include negative tests.
- Web/PWA and Tauri builds share the same economy presentation data without platform-specific branches.

### Save tests

- Missing `economy` state normalizes.
- Malformed economy state normalizes without changing city queues or units.
- Existing regional grievance, coalition, and cooldown state survives economy normalization.
- Malformed `pendingUnitSpawn` is normalized or dropped without creating a unit during load.
- Economy state round-trips through save/load.

## Implementation Notes

- Prefer adding `minor-civ-economy-system.ts` rather than expanding `minor-civ-system.ts` further.
- Keep helper boundaries small: posture evaluation, candidate scoring, queue application, production processing, and presentation should be separately testable.
- Use immutable turn processing patterns where touched code currently mutates nested state.
- Reuse `processCity`, `calculateCityYields`, `assignCityFocus`, `normalizeWorkedTilesForCity`, and production eligibility helpers where they fit.
- Do not call major-civ-only helpers that assume `state.civilizations[ownerId]` exists unless they are first made owner-kind safe.
- If a queue or production event is player-visible, wire the live UI path and tests in the same implementation slice.

## Acceptance Criteria

- Hidden city-state economy state is defined, normalized, saved, and loaded.
- Active city-states process real food, growth, production, building completion, and unit completion through the hybrid economy.
- City-state build policy is deterministic, archetype-aware, posture-aware, difficulty-aware, and capped.
- City-states do not build settlers, workers, national projects, legendary wonders, or unavailable items.
- Emergency conscription, if included in the first implementation, has explicit costs, cooldowns, and negative gate tests.
- Player-facing posture and economy hints are viewer-safe and hot-seat safe.
- The diplomacy panel surfaces discovered broad posture and refreshes after relevant actions.
- Existing quest, alliance, combat, conquest, and notification behavior remains intact.
- Future leagues (#496) and graduation (#497) have explicit extension points but no first-implementation behavior in #490.
