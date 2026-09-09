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

### A persistent `GameState` shape change needs a migration or a proof it does not (#1006)

"Persistent `GameState` shape" = any field that is serialized into a save (everything on `GameState` except the few deliberately-transient bits). Adding, removing, renaming, retyping, or changing the required/optional-ness of one is a **save-compatibility change**, and every one of them must ship with **one of**:

1. **An ordered migration + a migration test.** A numbered `SAVE_MIGRATIONS[N]` entry (bump `CURRENT_SAVE_SCHEMA_VERSION`, per the section above) *plus* a well-formed matrix case in `tests/storage/fixtures/save-compat/manifest.ts` for source version `N-1`, and — if the migration only exists to scrub hand-edited corruption — a `malformed-repair` case too. `tests/storage/save-compat-coverage.test.ts` (fast tier) fails if the version bump lands without the manifest entry.
2. **A written proof + test that the change is safely additive.** The field is optional, every reader already tolerates its absence (`?? default` / optional chaining), and a test demonstrates a save that predates the field loads and processes a turn unchanged. `tests/storage/new-game-completeness.test.ts` (the load-canonicalisation ratchet) and the matrix's own "strip the field for pre-CURRENT source versions" coverage are where that lives — extend them rather than asserting it ad hoc in a comment.

### Save compatibility is three registries, not one pile (#1023)

`src/storage/save-migrations.ts` is **composition only**. The mechanisms live in `src/storage/migrations/`, each with a written admission criterion, and each entry states its own reason:

| Registry | Admission criterion | When it runs |
|---|---|---|
| `ordered.ts` → `ORDERED_MIGRATIONS` | The persisted shape changed at schema N, and a save below N cannot be read correctly without this transformation. | Once each, in ascending order, only for saves below current. |
| `compatibility.ts` → `COMPATIBILITY_NORMALIZERS` | A safe default or idempotent shape conversion for an optional/additive field that is legal to be absent at every version, and every reader tolerates its absence. | Unconditionally, every load. |
| `repair.ts` → `CORRUPTION_REPAIRS` | Drops or repairs structurally impossible data the game itself never writes — hand-edited, truncated, externally-produced. | Unconditionally, every load. |

- **Do not let these substitute for one another.** Adding a default to `COMPATIBILITY_NORMALIZERS` instead of writing an ordered migration is cheaper, works, and hides the fact that a version step was never written — that is the exact failure #1023 exists to prevent. `tests/storage/save-persisted-shape-ratchet.test.ts` fails when a persisted field appears with no version bump and no written exemption.
- **A corruption repair that fires on a save the game wrote is a bug in the writer**, not a reason to keep the repair.
- A pass may be in two registries, but only with `alsoOrderedMigration: { version, why }`. `save-migration-registries.test.ts` detects undeclared dual registration by **function identity**, not by id.
- The unconditional pass order lives in `migrations/pipeline.ts` and is the pre-#1023 tail order **verbatim** — several passes read fields an earlier pass defaults, so regrouping by registry would be a behaviour change dressed as a refactor. Add a new pass to the order deliberately.
- `docs/save-compatibility.md` is **generated** from the registries (`UPDATE_SAVE_COMPAT_DOC=1 yarn vitest run tests/storage/save-migration-registries.test.ts`) and test-enforced, so the list cannot drift from the code. Never hand-edit it.
- Behaviour changes to this seam are gated by `tests/storage/save-migration-equivalence.test.ts` — per-top-level-key golden digests of `migrateSaveToCurrent` for every compatibility-matrix fixture. A refactor must never need `UPDATE_MIGRATION_GOLDEN=1`; a deliberate change must justify every moved digest in the PR.

The full `migrate → normalize → run a few rounds → save → reload → shared invariant validators` sweep across every representable version is `tests/storage/save-compat-matrix.test.ts` (slow tier). The shared validators it asserts (`tests/helpers/save-state-invariants.ts`: bilateral war, city + unit rosters, cargo reciprocity, eliminated-civ entities) are the minimal structural contract a migrated save must still satisfy; the dedicated invariant issues (#995 / #997 / #1000 / #1001) own making each exhaustive. Do **not** assert `migrated.saveSchemaVersion === CURRENT` and stop — that proves the migration *ran*, not that the result is playable.

## State Mutations Must Match Events
- If you emit an event (e.g., `city:unit-trained`), the state mutation (creating the unit, adding to arrays) MUST happen in the same block
- Events are notifications for UI/logging — they do NOT trigger state changes

## Bilateral Diplomacy

## Domination authority

- `domination-sovereignty.ts` and `victory-system.ts` are authoritative world
  queries. UI and AI code must consume observer-safe presentation/knowledge
  DTOs or doctrine instead; they must not import either module directly.
- `victory-system.ts` must use canonical sovereignty facts and must never
  infer survival from civilization `cities` or `units` rosters. The adapter
  owns only the final formula and completed-round resolution.

### Catalog/runtime dependency boundary

`city-system.ts` owns the static building and trainable-unit catalogs. It must
not import `espionage-system.ts`: the runtime espionage module may gain
Domination, visibility, or mission dependencies that return to city production
before those catalogs initialize. Shared static facts belong in a dependency-light
leaf instead. The spy classifier is `spy-unit-types.ts`; both city production and
espionage import it there. `scripts/check-src-rule-violations.sh` and the
`check-src-edit.sh` hook enforce this boundary.

### Major-war state is bilateral by construction (#995)

- **Never hand-roll both sides.** Major↔major war/peace goes through the bilateral
  transitions in `diplomacy-system.ts`: `declareMajorWar(state, a, b, bus?)` and
  `makeMajorPeace(state, a, b, bus?)` (each writes/clears BOTH `atWarWith` arrays
  and dedupes on insert; `makeMajorPeace` also reconciles vassals — see #1054
  below). The single-side `declareWar()` / `makePeace()` are
  module-internal building blocks — `scripts/check-src-rule-violations.sh` (mirrored
  in `.claude/hooks/check-src-edit.sh`) blocks a new caller of them outside
  `diplomacy-system.ts`. The minor-civ war paths (`minor-civ-actions.ts`,
  `minor-civ-coalition-system.ts`) are the only sanctioned external callers and
  update both sides themselves; `addWarPair` already handles a minor-civ defender.
- **Test-time validator:** `assertBilateralWar(state)` (`tests/helpers/save-state-invariants.ts`)
  — for every ordered pair of majors `A.atWarWith ∋ B ⟺ B.atWarWith ∋ A`, no
  duplicates, no self-war, no dangling major id. Runs in the AI-playability
  fixture and the save-compat matrix; call it at the end of any test that drives
  diplomacy transitions.
- **Malformed persisted state:** `normalizeBilateralWar` (a `CORRUPTION_REPAIRS`
  entry, `src/storage/migrations/steps/bilateral-war.ts`) scrubs one-sided /
  duplicated / self / dangling-major war entries on every load. It is a repair,
  not a migration — no `SAVE_VERSION` bump — and must stay a no-op on any save the
  game itself wrote.

### An overlord controls its vassals' war *and* peace (#1054)

A vassal is blocked from `declare_war`, `request_peace` **and**
`setMinorCivWarState` — its overlord's foreign policy is its own, and it can
never end a war itself. So **every path that ends a war on an overlord's behalf
must free that overlord's vassals from the same war, or they are stranded
forever.** `getActiveVassalIds(state, overlordId)` (`diplomacy-system.ts`) is the
single definition of "who this civ's peace speaks for"; the vassalage graph is a
depth-1 star (`getVassalageEligibility` refuses a vassal-of-a-vassal), so it is
never recursive.

- **join:** `applyVassalageWarConsequences` drags each active vassal into every
  war its overlord holds (`addWarPair`, no treachery). When both sides hold
  vassals this builds the **full bloc × bloc cross product** — overlord↔overlord,
  overlord↔vassal, *and* vassal↔vassal.
- **exit (major↔major):** `makeMajorPeace(state, a, b, bus?)` clears that same
  cross product — `warBlocMembers(a) × warBlocMembers(b)` — not just the
  principal pair. Clearing only each principal's own vassals leaves the two
  sides' vassals permanently at war with each other; that was the #1054 review
  finding, and it is what the cross product exists to prevent.
- **exit (major↔minor):** `setMinorCivWarState(..., atWar: false)` frees the
  major's active vassals from the same city-state war. Its `atWar: true` branch
  runs `applyVassalageWarConsequences`, so vassals *are* dragged into city-state
  wars — the peace branch has to undo it symmetrically.
- Bloc-wide peace, **no persisted provenance**: an inherited *or* a
  pre-existing-independent vassal war with the other peace party ends when the
  overlord makes peace with them. A vassal war with a **third** party the
  overlord is not making peace with is untouched (reconciliation is scoped to the
  peace pair). Every freed vassal gets `diplomacy:vassal-auto-peace` naming its
  own overlord (recipient-safe via `routeVassalAutoPeace`, which never resolves a
  discovery-gated city-state name).
- A **released / independent** ex-vassal keeps its inherited wars — that is not a
  stranding, because `vassalage.overlord` is `null` and it can immediately make
  its own peace. Pinned by a regression so it is not "fixed" into a bloc rule.
- The exit is **event-triggered on the peace transition**, not a per-turn
  invariant sweep. A pre-#1054 save whose overlord already made peace while a
  vassal stayed stuck is not retroactively reconciled (benign, bilateral, and
  not admissible to any save registry — the writer bug it came from is fixed
  forward). No save-shape change, no migration.
- **Adding a new way to end a war?** Free the overlord's vassals from it in the
  same transition, or it is a new stranding.

### `atWarWith` also carries minor-civ war ids

- `diplomacy.atWarWith` on a **major** civ also holds **minor-civ (city-state)** war ids: `setMinorCivWarState` and minor-civ coalitions (`activateCoalitionWar`) call `declareWar` with an `mc-…` target. Barbarians / pirates / rebels never belong there. So any surface that means "how many **major** wars / **empires** am I at war with" — war-weariness unrest, the "at war with N empires" guidance, the hot-seat handoff enemy list, AI war-count scoring — MUST read `majorCivWarOpponentIds(atWarWith)` (`src/core/owner-kind.ts`), never raw `atWarWith.length` / `[...atWarWith]` (#1041). A concrete `atWarWith.includes(specificId)` pair check is fine as-is: a minor-civ war is still a real war with *that* city-state. `assertBilateralWar` and `normalizeBilateralWar` both scope their reciprocity/roster checks to `classifyOwner === 'major'` ids for the same reason.

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
- The movement subsystem: `unit-movement-validation.ts` owns `validateUnitMove` / `resolveUnitMoveIntent` (the omniscient legality+cost check — the #1025 contract), `unit-movement-system.ts` owns `executeValidatedUnitMove` / `executeUnitMove` and re-exports the validation API, and both sit on `unit-movement-cost.ts`, `unit-movement-legality.ts`, `unit-pathfinding.ts` and `unit-movement-queries.ts` (#1010). `getMovementBlockerReason` (in `unit-movement-explainer.ts`, imported directly by `src/input`, **not** via the `unit-system` barrel — that would cycle) is the viewer-scoped projection of the resolver: resolve, then redact, never a second legality implementation. `unit-system.ts` re-exports the rest and otherwise owns only unit lifecycle, healing and `UNIT_DESCRIPTIONS`; the static catalog is `unit-definitions.ts`. See `.claude/rules/movement-actions.md`.

## Transport Cargo
- Load/unload rules, cargo capacity, cargo position sync, and transport destruction cascades must live in shared system helpers, not in UI-only branches.
- Loading and unloading consume the land unit/cargo action state, not the ship action state.
- If a transport is removed by combat or another actor-agnostic lifecycle path, all cargo must be removed from `state.units` and owner unit rosters in the same mutation.

### Two carriage models, kept separate on purpose (#1000)

There are **two** unrelated "unit A carries unit B" systems. They are shaped
differently, and #1000 deliberately did **not** unify them.

| | Naval transport ↔ land cargo | Carrier / city ↔ based aircraft |
|---|---|---|
| Representation | **Dual reference**: `transport.cargoUnitIds: string[]` on the hull ⇔ `cargo.transportId: string` on the rider | **Single reference**: `aircraft.airBase: AirBaseRef` only; the roster is *derived* by `getAirBaseRoster` scanning every unit for a matching `airBase` |
| "Is this a carrier" | `isNavalTransportUnit(unit)` (`transport-system.ts`) — naval domain + `cargoCapacity` defined. The one definition, shared by the load/unload helpers, the `assertCargoReciprocity` invariant, and the `normalizeCargoReciprocity` repair | `UNIT_DEFINITIONS[type].carrierDeckCapacity != null` (any carrier-family hull, #582) |
| Capacity | `getTransportCapacity` (`cargoCapacity`), used against `getUnitCargoSize` sums | `getAirBaseCapacity` — `carrierDeckCapacity` for a carrier; the host city's buildings/projects for a city base |
| Legal transitions | `loadUnitOntoTransport` / `unloadUnitFromTransport` (+ `syncTransportCargoPositions` on hull move) | `baseNewAirUnit` / `rebaseAircraft` / `resolveAirBaseLoss` (+ `syncCarrierBasedAircraft` on hull move) |

**Why dual for naval cargo:** ~80 map-scan sites ask "is this unit an occupying
map entity?" and must exclude cargo with a cheap `!unit.transportId` check;
capacity, the cargo UI panel, combat rewards, the pirate prize and the
lifecycle cascade all read `cargoUnitIds` directly. A single derived model would
turn every one of those ~80 checks into a scan of all units. **Why single for
aircraft:** there is no equivalent hot path — air units are few, and a derived
`getAirBaseRoster` scan is affordable; a reciprocal list on the hull would be
one more thing for `rebaseAircraft` / carrier-loss to keep in sync for no
performance gain. Collapsing either onto the other was evaluated and rejected on
these grounds — see the #1000 MR description for the full write-up.

### The reciprocity contract both must satisfy

- **`assertCargoReciprocity` + `assertAirBaseIntegrity`** (`tests/helpers/save-state-invariants.ts`, both in `SAVE_STATE_INVARIANTS`) are the shared structural validators — run by the save-compat matrix, the AI-playability fixture, and `assertSaveStateInvariants`. Call them at the end of any test that loads/unloads cargo, moves a loaded hull, or rebases/destroys a carrier.
- Naval: `cargoUnitIds[i]` ⇔ `transportId`, both endpoints live, same owner, cargo is a land unit that is not itself a transport, one unit aboard at most one ship, total `getUnitCargoSize` ≤ capacity, and **cargo sits on the hull's tile** (it is not an occupying map unit — it tracks the hull).
- Air: the `airBase` host resolves (live city, or live carrier-capable hull), shares the aircraft's owner, the aircraft sits on the host's tile, and the derived roster never exceeds `getAirBaseCapacity`.
- **`normalizeCargoReciprocity`** (`src/storage/migrations/steps/cargo-reciprocity.ts`, a `CORRUPTION_REPAIRS` entry — no version bump) scrubs hand-edited saves the helpers never write: a dangling/one-sided/duplicated `transportId` or manifest entry, an over-capacity or wrong-owner manifest, a transport listed as cargo, position drift. A trimmed **land** rider becomes a free unit at its tile (always valid). A based **aircraft** whose base is gone is **removed** (units + owner roster) — matching `resolveAirBaseLoss` ("cannot evacuate ⇒ destroyed"); a grounded based-aircraft is a state the game has no other way to produce, so it is not left lying around.
- **Adding a third way a unit can carry another** (a land mech-carrier, a submarine pen, …)? Pick dual-reference only if a hot path needs the back-pointer; add its rules to the matching `assert*`/`normalize*`; never fold it into `resolveUnitMoveIntent` (carriage is not a walk).
