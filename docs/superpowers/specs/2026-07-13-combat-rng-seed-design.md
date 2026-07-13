# Combat RNG Seed Design

**Issue:** [#521](https://github.com/a1flecke/conquestoria/issues/521)
**Date:** 2026-07-13
**Status:** Approved design

## Purpose

Ensure separate combat encounters receive separate deterministic random seeds. Combat outcomes must remain reproducible for a given saved game and turn, including games created before `gameId` was introduced.

## Problem

Several combat paths derive seeds from the first character or length of `unit-N` IDs. Those values collide for most unit pairs, so multiple attacks in a turn can use the same random factor and base-damage roll.

## Design

Export `deterministicCombatSeed` from `src/systems/combat-system.ts`, beside `resolveCombat`. It accepts the game state identity inputs needed by every caller:

```ts
deterministicCombatSeed(
  gameId: string | undefined,
  turn: number,
  attackerId: string,
  defenderId: string,
): number
```

The helper hashes the colon-separated tuple `gameId ?? 'legacy'`, `turn`, `attackerId`, and `defenderId` with FNV-1a. It returns a positive unsigned 32-bit integer, replacing a zero result with `1`.

The same inputs always produce the same seed. Changing either combatant, the turn, or the game ID produces a distinct hash for the covered regression inputs. This is deterministic rather than random allocation: save/replay behavior remains reproducible.

## Integration

Every `resolveCombat` entry point must call the shared helper:

- player attacks in `src/main.ts`;
- barbarian and beast attacks in `src/core/turn-manager.ts`;
- major-civilization AI attacks in `src/ai/ai-major-turn.ts`;
- major-civilization AI tactical previews and predicted action simulations in `src/ai/ai-tactics.ts`;
- AI warship attacks on pirates in `src/ai/basic-ai.ts`;
- pirate attacks in `src/systems/pirate-system.ts`;
- purposeful minor-civilization attacks and minor-civilization scuffles in `src/systems/minor-civ-system.ts`.

The old local `deterministicCombatSeed` implementation in `ai-major-turn.ts` is removed after callers import the shared helper. AI tactical previews and predicted action simulations use the same pair seed as major-AI execution, so strategic choices evaluate the combat roll that will actually resolve. Barbarian and beast planning seeds remain responsible for deciding world actions, but are not used as combat-resolution seeds; combat resolution is keyed to the game, turn, and participating unit pair.

## Compatibility And Error Handling

Older saves without `gameId` use the literal `legacy` component when the helper is called before normalization. Normal save loading already assigns those saves a stable `legacy-*` game ID, so this change requires neither a schema bump nor a new migration. The helper has no failure mode and does not mutate game state. It must not use `Math.random()` or time-based values.

The seed deliberately excludes `currentPlayer`, difficulty settings, and viewer data. A combat's outcome therefore cannot change when a hot-seat handoff changes the active player, and seeded variance remains independent of difficulty selection.

## Verification

Add regression coverage proving:

- distinct attacker/defender pairs on the same turn receive different seeds;
- identical inputs reproduce the same seed;
- a missing game ID uses the documented legacy fallback;
- normalizing a legacy save without `gameId` produces a stable seed for subsequent combat;
- changing `currentPlayer` in a hot-seat state does not change a unit pair's combat seed;
- AI tactical preview/simulation and major-AI execution derive the same seed for the same pair.

Seed uniqueness is the regression invariant. Tests must not assert that different seeds always produce different rounded combat damage, because distinct random draws can legitimately round to the same damage value. A representative combat integration test may use known distinct seeds, but it must assert deterministic application rather than probabilistic damage inequality.

Run the mirrored combat, AI, turn-manager, minor-civilization, and pirate tests, plus the source-rule check for every changed `src/` file.
