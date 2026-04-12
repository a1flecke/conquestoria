---
paths:
  - "src/systems/**"
  - "src/core/**"
  - "src/ai/**"
---

# Game Systems Rules

## Deterministic RNG
- NEVER use `Math.random()` — use seeded RNG (e.g., mulberry32 or LCG)
- Combat, AI decisions, and map generation must all be reproducible from a seed
- Pass `seed` parameter through function signatures; derive from `state.turn` + entity IDs

## State Mutations Must Match Events
- If you emit an event (e.g., `city:unit-trained`), the state mutation (creating the unit, adding to arrays) MUST happen in the same block
- Events are notifications for UI/logging — they do NOT trigger state changes

## Bilateral Diplomacy
- `declareWar()` and `makePeace()` must be called for BOTH parties
- `atWarWith` arrays must never contain duplicates — deduplicate on insert

## AI Combat
- AI must check `isAtWar(civDiplomacy, targetOwner)` before attacking non-barbarian units
- Barbarians are always valid targets without a war check

## Unit Types
- Every `UnitType` in `types.ts` must have a corresponding entry in `TRAINABLE_UNITS`
- Gate advanced units behind `techRequired` field matching actual tech IDs from `tech-definitions.ts`

## Production Bonuses
- `applyProductionBonus()` must be called when processing city production
- Civ-specific bonuses come from `getCivDefinition(civ.civType).bonusEffect`

## Immutable Turn Processing
- Systems that process a turn (faction, minor-civ, diplomacy, wonder tick, etc.) MUST return a new `GameState`; never mutate `state.cities[id] = ...`, `state.units[id] = ...`, `state.civilizations[id] = ...`, or nested fields on those objects.
- Use spread-copy: `{ ...state, cities: { ...state.cities, [id]: { ...city, field: newValue } } }`.
- If you need to chain updates, thread a `let nextState = state;` through the loop and reassign; do not reach into the input state.
- Helpers that spawn entities (rebels, free units, barbarians) must return the new `units` map; never write through `state.units[...] = ...`.

## Diplomacy Lifecycle
- When a new civ is introduced mid-game (breakaway, rebellion statehood), every existing civ's `diplomacy.relationships` must get an entry for the new civ id, and the new civ's `relationships` must get an entry for every existing civ id.
- When a civ is removed (reabsorbed, eliminated), every other civ's `diplomacy.relationships` AND `diplomacy.atWarWith` AND active treaties involving that id must be scrubbed in the same operation. Dangling ids cause silent lookup failures downstream.

## No Dead Return Fields
- If a function's return type declares a field, populate it with real data.
- Do not return a placeholder (`0`, `null`, `''`) with a `// computed elsewhere` comment. Either compute it, or remove the field from the return type.

## Spawn Occupancy
- Any code that adds a unit to the map (rebel spawns, free unit rewards, barbarian raids, scenario seeding) MUST check `state.map.tiles[key]` exists AND no existing unit occupies that tile. If no free adjacent tile is found, skip the spawn — never stack.
