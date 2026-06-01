# Issues 284, 297-306, 308 Trust Fixes And Transport MVP Design

## Purpose

Fix the linked issue cluster as a trust and readability pass for a 10-12 year old baseline, with one small Transport MVP so island maps are playable. The design favors concrete rules, visible feedback, and consistent execution over hidden exceptions.

Covered issues:

- #284 Improvement replacement
- #297 Foreign unit stacking after move-and-attack intent
- #298 Land units crossing water
- #299 Busy workers still in the move queue after load
- #300 Multi-step movement over costly terrain
- #301 Mines on hills without resources
- #302 Hidden-resource worker action leak
- #303 Start-turn unit auto-selection
- #304 Rest, fortify, and healing logic
- #305 Ships in landlocked cities
- #306 Ranged attacker damaged by melee defender
- #308 Missing sprites verification

## Player Promise

The game should be readable and fair:

- If the UI says a unit can do something, the execution path must enforce the same rule.
- If an action is blocked, the player gets a clear reason.
- Worker actions say what they do, never reveal hidden resources, and never offer nonsense choices such as replacing a Farm with a Farm.
- Movement respects terrain cost and unit occupancy at execution time, not only when highlights were calculated.
- Ranged combat uses attack profiles, so return damage depends on whether the defender can plausibly return fire.
- Coastal and naval production rules are consistent across the city panel and turn processing.
- Island access exists through a first playable Transport unit.

## Scope

In scope:

- Trust fixes for worker actions, movement execution, turn flow, combat/rest rules, coastal production gates, and player-visible explanations.
- A separate player-first `Transport` unit with cargo capacity 1.
- Data shape for future capacity and cargo-size growth.
- Proper Transport sprite, animation registration, SFX catalog entries, and live action sound triggers.
- Verification of #308 as a sprite-delivery check, excluding missing-sprite root cause analysis.
- Agent/repo guardrail updates that prevent this class of issue from recurring.
- A follow-up GitHub issue and plan for the larger naval transport roadmap after these bug fixes land.

Out of scope:

- Full AI island settlement, AI transport routing, and naval escort planning.
- Era-scaled transport capacity in gameplay beyond the initial data model.
- Heavy-unit cargo sizes beyond the current default of 1.
- Multi-unit cargo, rescue rules, drift rules, or cargo transfer between transports.
- Advanced naval combat roles beyond keeping existing Galley and Trireme behavior valid.
- Real curated audio if unavailable during implementation. Valid local OGG placeholders may be used only as temporary wired assets and must be called out.

## Transport MVP

Add a separate buildable `Transport` naval unit.

Architecture:

- Transport and cargo rules live in a shared system module, not in UI callbacks. The UI should ask the transport system for legal actions and call the same system to mutate state.
- Cargo state is plain serializable data: Transports store cargo unit ids, and loaded land units store the carrying transport id.
- Loaded cargo units stay in `state.units` for save compatibility, but are excluded from map occupancy, rendering, selection cycling, and unit-to-move queues while loaded.
- Loaded cargo unit positions are synchronized to the carrying Transport position for save/debug readability, but `transportId` is the source of truth for whether the unit occupies a tile.
- The cargo model uses definition metadata (`cargoCapacity` on cargo carriers and `cargoSize` on cargo units) so later eras can raise capacity and large units can consume more capacity without rewriting the core data shape.
- Transport destruction is resolved through shared destruction cleanup so combat, direct removal, and future system callers destroy cargo consistently.

Rules:

- Unlocks with `Galleys`.
- Can be built only in coastal cities.
- Has no attack strength and cannot attack.
- Has `cargoCapacity: 1`.
- Current land units have `cargoSize: 1`.
- Can enter `coast` once unlocked.
- Can enter `ocean` only when the owner has `Celestial Navigation`.
- `Load` is legal when a friendly land unit can board a friendly Transport at the shore. The land unit and Transport may be adjacent, or the land unit may board through a coastal city shortcut.
- `Load` removes or hides the land unit from map occupancy, records it as cargo, and consumes the land unit's turn. It does not consume the Transport's movement or action.
- `Unload` is legal when the Transport is adjacent to a passable unoccupied land tile, or through a valid coastal city shortcut. The player chooses the destination.
- `Unload` places the cargo unit on the chosen land tile and consumes the land unit's turn. It does not consume the Transport's movement or action.
- If the Transport is destroyed, all cargo is destroyed too.
- The MVP is player-first. AI civilizations may produce or own Transports without breaking saves or turns, but AI island settlement and escort planning are deferred.

UI and UX:

- Transport panel shows cargo state, either `Empty` or `Carrying: <Unit Name>`.
- Land unit panel shows `Load onto Transport` only when legal.
- Transport panel shows `Unload` only when cargo exists and at least one legal destination exists.
- The UI gives concrete blocked reasons such as `No room on this Transport`, `Unload next to land`, and `Need Celestial Navigation to cross ocean`.
- After load or unload, the open panel rerenders immediately so cargo state, unit availability, and action buttons are accurate.

Sprite and animation:

- Add a proper `TransportSprite` matching the existing v2 unit style.
- Register it in `UNIT_SPRITE_CATALOG`.
- Use the existing faction palette flow. Do not hardcode civilization identity colors.
- Use naval animation hooks: idle ship rock and sail movement.
- Add catalog coverage so the new unit cannot ship without sprite registration.

SFX:

- Transport uses the existing naval movement SFX locomotion class.
- Transport has a death or sink SFX catalog entry.
- Load and unload have short action sounds wired to the live UI actions.
- SFX catalog tests cover Transport entries and local OGG integrity.

## Existing Bug Fix Contracts

### Worker Improvements

- Same-improvement replacement is absent from the UI and rejected by the system.
- Build and replace buttons include yield benefits, for example `Build Mine (+1 Production)` or `Replace Farm with Watermill (+1 Food, +1 Prod)`.
- Mines can be built on hills without visible resources.
- Hidden-resource tiles must not leak information. Player-facing eligibility evaluates against resources known to that player, not raw hidden tile resources.
- Resource-specific improvements appear only when the resource is visible or known to the player and the improvement matches that resource.

### Movement And Occupancy

- Movement execution revalidates destination, terrain cost, visibility, and occupancy before mutating state.
- A unit cannot move onto a foreign, hostile, or neutral occupied tile unless the action is a legal attack or city assault.
- Multi-step movement cannot overrun movement points through costly terrain.
- Direct one-tile forced march remains an intentional rule: a unit with at least one movement point can enter one adjacent passable costly tile and end with zero movement.

### Turn Flow

- Workers actively building improvements are excluded from unit-to-move queues after loading a save and at turn start.
- At the start of a player turn, if a unit needs orders, the game auto-selects it and keeps camera focus predictable.

### Combat, Rest, And Healing

- Ranged combat uses attack profiles.
- A ranged attacker attacking a melee-only defender from range takes no counter-damage.
- A ranged attacker attacking a ranged or bombard-capable defender that can return fire at that distance can take damage.
- Melee-vs-melee exchange remains normal.
- Adjacent combat follows attack-profile rules instead of hardcoded unit lists.
- Rest and Fortify appear only before the unit moves or acts.
- Healing is stronger in owned cities than in the field, and the text shown to the player communicates the difference.

### Production

- Existing ships and the new Transport require coastal cities.
- City panel availability and `processCity` use the same coastal eligibility rule.
- If an invalid queued ship or Transport is encountered, it is dropped with visible feedback instead of silently completing.
- Trainable unit metadata includes coastal requirements, and production validation uses that metadata for both newly selected and already queued items.

### Architecture And State Consistency

- Movement legality must have one state-aware helper used by range previews, blocker reasons, pathfinding, and movement execution. The helper receives owner tech context so Transport ocean movement cannot diverge between UI and execution.
- Movement execution returns a typed success/failure result and performs no mutation on failure. Callers must show or log the failure reason instead of assuming highlights were authoritative.
- Unit occupancy helpers must ignore loaded cargo units and still reject foreign/neutral stacking for active map units.
- Unit-to-move selection must use one helper for "needs orders" so start-turn auto-selection, next-unit cycling, save-load restoration, busy workers, loaded cargo, fortified units, and route-committed units agree.
- Worker action eligibility has a viewer-safe mode. Player-facing UI cannot inspect raw hidden resources; execution may inspect raw map state only after using the same visible eligibility contract for player-issued actions.
- Generic terrain improvements and resource-enhancing improvements are distinct concepts. A Mine on an empty hill is a legal generic terrain improvement; a Mine prompted by Gems, Gold, Silver, Salt, Copper, or Iron requires that resource to be known before it appears as a resource-specific recommendation. Improvements that only make sense for resources, such as Plantations, Pastures, and Camps, stay hidden until the matching resource is known.

## Root Causes

The likely root causes are:

- UI eligibility and system execution use related but separate checks.
- Some player-facing labels describe future or intended mechanics rather than implemented mechanics.
- Movement highlights are treated as permission, but execution can still mutate state without full revalidation.
- Hidden map data is consulted by player-facing action eligibility.
- Unit production gates are not centralized enough for buildings, ships, and future unit metadata.
- Unit additions can miss sprite, SFX, AI, production icon, and catalog wiring unless the checklist is explicit.

Missing sprite delivery itself is excluded from root-cause analysis because missing sprites are expected while content is expanding. New unit additions still must require sprite and SFX registration.

## Guardrail Updates

Add or update repo or agent guardrails so future work follows these rules:

- Player-visible action availability and action execution must share an eligibility helper where practical. This applies to worker actions, transport cargo, movement, and production.
- Player-facing eligibility cannot inspect undiscovered resources unless the action is explicitly about discovery.
- Movement highlights are advisory. Execution must revalidate terrain, occupancy, visibility, and cost.
- Trainable unit additions must include a checklist for `domain`, coastal requirement, sprite catalog, SFX catalog, production icon, AI behavior decision, save compatibility, and UI tests.
- Transport and cargo plans must include cargo contents, capacity, load/unload legality, post-action visible state, and destruction cleanup.

## Test Design

Tests must prove visible behavior where the defect was visible to the player.

Targeted coverage:

- `tests/systems/worker-action-system.test.ts`
  - mine on empty hill succeeds
  - hidden-resource tile does not unlock resource-specific worker actions
  - same replacement is rejected
- `tests/ui/selected-unit-info.test.ts`
  - worker buttons include yield text
  - same replacement is absent
  - load and unload buttons appear only when legal and rerender after action
- `tests/systems/unit-movement-system.test.ts` or mirrored movement tests
  - execution refuses occupied foreign tile movement
  - movement cost cannot be overrun through multi-step costly terrain
  - one-tile forced march remains intentional
  - Transport ocean gate depends on `Celestial Navigation`
- `tests/systems/transport-system.test.ts` or equivalent new file
  - load and unload data integrity
  - capacity and cargo size
  - cargo destroyed with Transport
- `tests/systems/combat-system.test.ts`
  - ranged attacker versus melee defender at range takes no counter-damage
  - ranged attacker versus ranged defender can take damage
  - melee versus melee remains a normal exchange
- `tests/systems/city-system.test.ts` and `tests/ui/city-panel.test.ts`
  - ships and Transport require coastal city
  - invalid queued ship or Transport is dropped with visible feedback
- `tests/renderer/sprites/sprite-catalog.test.ts`
  - Transport has a registered sprite
- `tests/audio/sfx-catalog.test.ts`
  - Transport has SFX coverage and valid local OGG files

## Verification

Before completion:

- Run `scripts/check-src-rule-violations.sh` for changed `src` files.
- Run mirrored or targeted tests for changed areas.
- Run `./scripts/run-with-mise.sh yarn build`.
- Run `./scripts/run-with-mise.sh yarn test`.
- Inspect `git diff --stat origin/main...HEAD`.
- Inspect `git diff --stat`.
- If either diff contains source changes, inspect the full source diff before claiming review coverage.

## Follow-Up GitHub Issue And Plan

After these bug fixes land, create a GitHub issue and implementation plan for the fuller naval transport roadmap. The issue must cover:

- era-scaled transport capacity
- larger or heavier unit cargo sizes
- transport upgrades or later transport classes
- AI island settlement
- AI naval escort planning
- naval danger scoring
- transport UI polish
- balance and tech pacing
- real sound and sprite curation follow-up if placeholders remain
- save migration concerns for richer cargo state

The follow-up issue should explicitly state that the MVP shipped only one capacity-1 Transport and player-first cargo behavior.
