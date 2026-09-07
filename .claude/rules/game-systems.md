---
paths:
  - "src/systems/**"
  - "src/core/**"
  - "src/ai/**"
  - "src/storage/**"
---

# Game Systems Rules

## Deterministic Simulation RNG (#1021)
- NEVER use `Math.random()` in simulation code — the only exception is `src/audio/sfx.ts`, which is UI/audio randomness, not simulation state.
- NEVER hand-roll a new LCG (`s = s * <constant> % 2147483647`, or any similar recurrence) or seed one from `turn` plus a `charCodeAt(0)`/`charCodeAt(N)` truncation of an id. Every normal unit id in this codebase starts with `unit-`, so `unit.id.charCodeAt(0)` is `117` for **every** unit in the game — that exact collision is what shipped as #983.
- **Use `createSimulationRng(state, key)`** (`src/systems/simulation-rng.ts`) for any new deterministic simulation draw. It reads `state.gameId` and `state.turn` itself — a caller never supplies either — and takes a `SimulationDomainKey`: `{ domain: string, actorId?, targetId?, eventId?, ordinal? }`, requiring at least one of `actorId`/`targetId`/`eventId`/`ordinal` (a bare `{ domain }` is a compile error). Use **full entity ids** (`unit.id`, `civId`, `mc.id`) — never a substring or character code of one. Add an explicit `ordinal` whenever the same domain can draw more than once for the same actor/target/event in a single turn; otherwise those draws alias onto the same stream.
- A source rule (`scripts/check-src-rule-violations.sh`, mirrored in `.claude/hooks/check-src-edit.sh`) rejects any **new** hand-written LCG constant (`16807`, `48271`, `1664525`, `104729`, `92821`, `99991`, `73937`, `65599`, `7919`, `31337`) or literal-index `charCodeAt(N)` under `src/systems`, `src/ai`, `src/core`. Pre-#1021 occurrences are tracked by exact `path:line` in `.claude/rng-legacy-baseline.txt` (see that file's header for what a baseline entry does and does not mean — some are genuine debt for #982 to convert, some are already-correct code kept out of the rule's way); the two exceptions to the rule entirely are `src/systems/map-generator.ts` and `src/systems/river-system.ts` (map generation, seeded once from the campaign seed string before `gameId` exists — keying it to `gameId` would be circular, not stronger) plus `src/systems/seeded-lcg.ts` and `src/systems/simulation-rng.ts` themselves (the canonical implementation).
- Distinct from simulation RNG, and never conflated with it: **`createPlaythroughId`** (`src/core/game-state.ts`) is deliberately `Date.now()`-salted per-playthrough identity (save-slot bookkeeping), not simulation state — conflating the two was itself a fixed bug (see that file's doc comment). **Audio/UI randomness** (`src/audio/sfx.ts`) is out of simulation determinism entirely.
- Combat, AI decisions, and map generation must all be reproducible from a seed. Two campaigns created with the same explicit seed must reach the same `gameId` and produce identical outcomes for every converted stream; two different seeds must diverge.

## Deterministic Simulation Contract (#1004)

"Deterministic" in this codebase means four things, each with a permanent regression in the slow tier (`tests/app/simulation-determinism.test.ts`, plus `determinism-guard.test.ts` and `simulation-rng*.test.ts`):

1. **Same seed + same commands ⇒ equivalent whole state.** Two games from one seed driven through the same command sequence land in the same simulation state; two different seeds diverge meaningfully.
2. **Save/reload continuity.** Run N rounds → save → load → continue M rounds ⇒ the same state as an uninterrupted N+M run. Loading a save mid-game must not move the trajectory.
3. **Deterministic AI.** Given the same seed and state, the AI makes the same decision (same `traces`) and reaches the same resulting state — in-process and across a save/reload boundary (`opponentAI` is persisted and must reconstruct identically).
4. **Domain-stream independence.** Adding or draining randomness in one `createSimulationRng` domain must not shift any other domain's output. This is why keyed streams (above) are structurally required, not merely tidy.

- **Compare simulation states only through the canonical helper** `assertSimulationEquivalent` / `firstSimulationDivergence` (`tests/helpers/deterministic-state.ts`). It strips exactly `playthroughId` (deliberately `Date.now()`-salted) and `saveSchemaVersion` (persistence metadata) and deep-compares everything else, reporting the first divergent path. Do **not** hand-roll a `JSON.stringify(a) === JSON.stringify(b)` comparison with its own ad-hoc field carve-out, and do **not** add an exclusion to that helper to make a test green — a divergence on any other field is a real determinism or save-normalization bug to investigate. It rejects `Map`/`Set`/`Date` outright rather than comparing them: those have no own enumerable keys, so a record walk would report two different values as equal, and simulation state must be plain and JSON-serializable anyway.
- Heavy whole-simulation determinism tests belong in `SLOW_TEST_FILES` (`scripts/run-tests-by-tier.sh`) with a headroom-sized timeout, never in the fast push gate.

### Game creation must produce load-canonical state

Auto-save fires on game creation, and `normalizeLoadedState` runs on both the save and the load side. So anything the load path derives or defaults that `createNewGame` / `createHotSeatGame` does **not** is a field where **the game plays differently before its first reload than after it** — a bug the player experiences as "my save changed my game". #1004 found three:

- **`saveSchemaVersion`** was unstamped, so a fresh game read as schema 0 and its first autosave replayed the entire historical migration chain over it (re-rolling late resources under a different RNG key, retiming in-flight research). Both creation functions now stamp `CURRENT_SAVE_SCHEMA_VERSION` (`src/storage/save-schema-version.ts`).
- **`regionKey`** was only tagged by the balanced/single-continent generators, so a `'procedural'` map (the default) had none until `normalizeLandmassKeys` added them on load — which silently disabled `colonial-charter`'s foreign-landmass founding bonus and the entire land-resurgence threat system for a never-reloaded session. Now tagged at creation.
- **`opponentAI.pressureByCiv`** was left empty by `createEmptyOpponentAIState` and backfilled per living human on load. Now normalized at creation.

**Rule:** when you add a field that a load-path normalizer derives or defaults, set it at creation too — or prove in a test that leaving it absent is behaviourally identical. `tests/storage/new-game-completeness.test.ts` holds the ratchet (the exact set of fields load still adds to a fresh game) plus the per-field default contract; a new entry there needs a written justification. Note that `normalizeLandmassKeys` only re-tags when a key is **missing**, so a creation-time tag that is wrong is never repaired — tag only from data that cannot change afterwards (terrain is immutable after generation).

### Save schema version and the migration registry move together

`CURRENT_SAVE_SCHEMA_VERSION` lives in the dependency-free leaf module `src/storage/save-schema-version.ts` (so `src/core/game-state.ts` can stamp it without importing the migration graph) and is re-exported from `save-migrations.ts`. Adding `SAVE_MIGRATIONS[N]` **must** bump it in the same change: otherwise `migrateSaveToCurrent` never runs the new migration *and* every new game is stamped below it. `tests/storage/save-migrations.test.ts` → "save migration registry integrity (#1004)" enforces the coupling, no-gap coverage of `1..CURRENT`, and that both modules export the same value.

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
- **Exception — beast units:** `UnitType` values prefixed `beast_` are legendary-beast units spawned exclusively by `beast-system.ts`. They are intentionally NOT in `TRAINABLE_UNITS`, have `productionCost: 0`, and are owned by the `'beasts'` owner constant. Do not add them to city production, AI training, or tech `unlocksUnits`.

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

## Movement Validation
- Unit movement execution must validate the destination in the shared movement system before mutating state. UI highlights are advisory and cannot be the only blocker.
- Movement failures should return a structured reason/message so UI, AI, and automation callers can avoid animating or treating the move as successful.
- Transported cargo is not an occupying map unit and must not contribute visibility, unmoved-unit prompts, or order-selection prompts while aboard.

## Transport Cargo
- Load/unload rules, cargo capacity, cargo position sync, and transport destruction cascades must live in shared system helpers, not in UI-only branches.
- Loading and unloading consume the land unit/cargo action state, not the ship action state.
- If a transport is removed by combat or another actor-agnostic lifecycle path, all cargo must be removed from `state.units` and owner unit rosters in the same mutation.
