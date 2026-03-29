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
