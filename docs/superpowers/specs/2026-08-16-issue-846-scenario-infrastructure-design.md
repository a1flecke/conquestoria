# Issue #846 — Scenario Infrastructure Design

## Problem

Recent gameplay debugging (`e0ecc7dc`, fixing #843/#845) hit a wall its own plan docs
name explicitly: *"the app exposes no debug hook or save-injection path... manual
verification isn't feasible without unbounded manual play."* Automated tests could
construct the precise starting condition; a developer in the running app could not.

Separately, every Vitest fixture that needs a non-trivial `GameState`
(`tests/systems/helpers/crisis-fixture.ts`, the `undefendedCityRangeState` helper added
by `e0ecc7dc` itself) hand-builds the state object field-by-field, per test file. There
is no shared, typed, reusable way to say "give me a game state where X" — for a test, or
for a developer.

## Goal

A small, durable scenario infrastructure: a developer or test describes a game
situation and reliably gets that `GameState`, without playing dozens of turns and
without a second hand-rolled fixture per consumer.

## Non-goals

- No cheat console, no arbitrary JS eval, no runtime mutation API.
- No new mutable state store — scenarios only ever produce a `GameState` that enters
  the game through the existing `GameSession`/`campaignEntry.enterCampaign` publication
  path, exactly like a loaded save.
- No Playwright integration in this PR (see Phase 3 below — deferred, not needed by any
  current spec).
- No changes to combat/barbarian/crisis system *logic* — those systems are scenario
  *consumers* only, per the parallel-work constraint with the #547 agent.

## Existing infrastructure this reuses

| Piece | File | Role |
|---|---|---|
| Canonical state constructors | `src/core/game-state.ts` (`createNewGame`, `createHotSeatGame`) | The only legitimate way to derive a fully-formed base state (map, civs, visibility, minor civs, espionage, idCounters). |
| Legitimate publication path | `src/app/controllers/campaign-entry-controller.ts` (`enterCampaign`) | The only correct way to hand a constructed `GameState` to `GameSession`. |
| Existing dev-mode-shaped entry gate | `src/app/controllers/game-session-controller.ts:349-379` | Already reads `import.meta.env.MODE`/`window.location.search` and dynamic-imports a narrow runtime (`e2e-mode.ts`/`e2e-runtime.ts`) that calls `enterCampaignForE2E`. The scenario loader is an extension of this exact pattern, not a new one. |
| Save-injection precedent | `tests/e2e/helpers/save-fixture.ts` (`installAutosave`) | Already used by one Playwright-adjacent Vitest test; the pattern Phase 3 would extend, not invent. |
| Save normalization | `src/storage/save-manager.ts` (`normalizeLoadedState`) | Anything entering through the save path still goes through this — scenarios don't bypass it. |
| Bilateral diplomacy helper | `src/systems/diplomacy-system.ts` (`declareWar`) | Every real call site (`player-action-controller.ts`, `basic-ai.ts`, `minor-civ-actions.ts`) calls it once per side. The scenario builder's war step does the same — no new diplomacy logic. |

## Design

### 1. Canonical scenario representation

```ts
// src/testing/scenario-types.ts
export interface ScenarioDefinition {
  readonly name: string;
  readonly description: string;
  readonly seed: string;
  readonly base:
    | { readonly kind: 'solo'; readonly config: SoloSetupConfig }
    | { readonly kind: 'hotSeat'; readonly config: HotSeatConfig };
  readonly steps: readonly ScenarioStep[];
}

export type ScenarioStep =
  | { readonly kind: 'unit'; readonly civId: string; readonly type: UnitType;
      readonly position: HexCoord; readonly overrides?: Partial<Unit>; readonly unsafe?: boolean }
  | { readonly kind: 'city'; readonly civId: string; readonly position: HexCoord;
      readonly overrides?: Partial<City>; readonly unsafe?: boolean }
  | { readonly kind: 'tech'; readonly civId: string; readonly techIds: readonly string[] }
  | { readonly kind: 'diplomacy'; readonly civA: string; readonly civB: string;
      readonly status: 'war' | 'peace' | 'alliance' }
  | { readonly kind: 'gold'; readonly civId: string; readonly amount: number };
```

A step is never a raw partial `GameState`. It is a small, closed union whose `kind`s
map 1:1 to a canonical system call. This directly satisfies the "canonical
construction" requirement: `scenario.units.push({ type: 'tank', strength: 80, ... })` is
structurally impossible — a `unit` step can only carry a `UnitType` plus narrow
`overrides`, and the builder is what calls `createUnit(type, civId, position,
idCounters, bonusEffect)` and *then* applies `overrides` on top of the canonically
constructed unit, not instead of it.

### 2. How much of `GameState` callers specify vs. derive

Everything not named in `base`/`steps` is derived, never specified:

- Map, terrain, wonders, villages, beast lairs, minor civs, starting units for every
  civ, initial visibility, espionage state, idCounters — all come from
  `createNewGame`/`createHotSeatGame`, called once at the start of `buildScenario`.
- Each step only adds/overrides the specific delta a scenario cares about (one enemy
  city with no garrison; one unit at war with the player), through the same helper
  gameplay uses to create that entity.
- After any `unit`/`city` step, the builder re-runs `updateVisibility` +
  `refreshLastSeenPresentationsForCiv` + `syncCivilizationContactsFromVisibility` for
  every affected civ — the same three calls `createNewGame` already makes — so
  fog-of-war/hot-seat privacy is never hand-set and never stale.

### 3. Stable IDs

No new ID scheme. `buildScenario` threads the base state's own `idCounters` object
through every step exactly as `createUnit`/`foundCity` already expect (they mutate it in
place). IDs stay monotonic and collision-free by construction — the same mechanism
`createNewGame` itself relies on.

### 4. RNG / seed determinism

One `seed: string` on the definition, passed straight into `createNewGame`/
`createHotSeatGame` (which already thread it into `createRng`, map generation, and
barbarian placement). No step introduces a second RNG surface. Two calls to
`buildScenario` with the same definition must produce structurally identical output
(mod `gameId`, which embeds `Date.now()` — the determinism test compares state with
`gameId` excluded, not the seed's actual entropy).

### 5. Map coordinate validation

Any step naming a `HexCoord` is checked against `state.map.tiles[hexKey(coord)]`
before use. A missing tile throws `ScenarioError` naming the scenario, step index, and
coordinate — never a silent no-op, never a deep renderer/system crash with no context.

### 6. Opting into unusual/inconsistent states

Default behavior validates and throws. A step-level `unsafe: true` flag (see the
`unit`/`city` step shapes above) skips the specific check that would otherwise reject
it — e.g., placing a unit on a tile that already has an occupant, for a scenario that
deliberately reproduces a corrupt save. This mirrors `save-manager.ts`'s own honest
posture (it warns and drops invalid data rather than crashing) but is opt-in per step so
"unsafe" is always a visible, deliberate marker in the scenario definition, never an
accident.

### 7. Schema migrations / save normalization

`buildScenario` output is already current-shape — built from the current
`createNewGame`, it needs no migration. The dev-mode loader (below) publishes it
directly via `enterCampaign`, bypassing the save path entirely (same as
`enterCampaignForE2E` does today for autosaves). If a *future* consumer routes a
scenario through the save system (Phase 3's Playwright `installAutosave`), it goes
through `normalizeLoadedState` like any other save — never a shortcut around it.

### 8. Hot seat

`base.kind: 'hotSeat'` uses `createHotSeatGame(config)`; every step's `civId` accepts a
hot-seat slot id exactly as it accepts a solo civ id (`'player'`/`'ai-1'`) — there is no
separate hot-seat scenario type, matching the codebase's existing pattern of treating
solo as "hot seat with one human slot" everywhere else.

### 9. Current-viewer visibility

Covered under (2): visibility is always recomputed by the real system helpers after any
entity-creating step, never hand-set. `currentPlayer` on the built state follows
whatever `base.config` specifies (defaults to the first slot), same as
`createNewGame`/`createHotSeatGame` today.

### 10. Developer launch mechanism

Extend the existing gate in `game-session-controller.ts`'s `init()` (currently
`if (import.meta.env.MODE === 'e2e') { ... }`) with a sibling `DEV`-gated branch:

```ts
if (import.meta.env.DEV) {
  const scenarioName = new URLSearchParams(window.location.search).get('scenario');
  if (scenarioName) {
    const { SCENARIOS } = await import('@/testing/scenarios');
    const { buildScenario } = await import('@/testing/scenario-builder');
    const definition = SCENARIOS[scenarioName];
    if (!definition) throw new Error(`Unknown scenario "${scenarioName}". Known: ${Object.keys(SCENARIOS).join(', ')}`);
    await deps.campaignEntry.enterCampaign(buildScenario(definition), `Scenario: ${definition.name}`);
    return;
  }
}
```

`import.meta.env.DEV` is Vite's own dev/prod flag (`true` under `vite`/`yarn dev`,
`false` under `vite build`) — distinct from the existing `MODE === 'e2e'` check, so
`?scenario=` works under plain `yarn dev`, not only the Playwright test build. The
dynamic `import()` keeps the scenario registry and builder out of the production
bundle's static import graph, the same tree-shaking precedent `e2e-mode.ts`/
`e2e-runtime.ts` already establish for the e2e branch right above it — verified in
Testing/Validation below by inspecting the built `dist/` output.

Usage: `bash scripts/run-with-mise.sh yarn dev`, then open
`http://localhost:5173/?scenario=undefended-enemy-city`.

### 11. Same infrastructure for regression tests

Vitest tests call `buildScenario(SCENARIOS['undefended-enemy-city'])` directly — the
identical function and identical named definition the dev loader uses. No parallel
construction path.

### 12. Preventing a parallel gameplay API

`buildScenario` is a pure function (`ScenarioDefinition → GameState`) invoked once,
before a game session starts. It has no live handle into a running `GameSession`, no
subscribe/mutate surface, and is never called after `enterCampaign` publishes the
result. The only thing touching `GameSession` is the existing, already-reviewed
`enterCampaign` call — identical to how a loaded save or a fresh `createNewGame` reaches
the player today. There is no new way to mutate a game in progress.

## Scenarios shipped in this PR

Two scenarios reproducing the starting conditions `e0ecc7dc` needed and could not get
outside of Vitest, demonstrating this infrastructure would have closed that exact gap:

- **`undefended-enemy-city`** — mirrors `tests/systems/unit-system.test.ts`'s
  `undefendedCityRangeState`: player scout near an AI city with no garrison unit, at
  war, on flat terrain. Validates #843's fix (city blocks movement/is reachable only
  from direct adjacency).
- **`undefended-barbarian-camp`** — mirrors `tests/systems/attack-targeting.test.ts`'s
  camp-adjacency setup from #845 finding 2: player unit adjacent to an undefended
  barbarian camp, for the one-step assault path.

A third, `naval-domain-attack` (galley vs. galley, at war, adjacent, #845 finding 3 /
#826), is included if it fits the PR's test budget; otherwise it is the first item in
the deferred scenario-library backlog, not a blocker for this PR.

## Alternatives considered

1. **Raw partial-`GameState` scenario objects** (caller writes `{ units: {...} }`
   directly). Rejected: this is exactly the "BAD" pattern from the issue — no
   canonical-construction guarantee, and every field becomes a place fixture drift can
   hide.
2. **A full debug console / command palette** (type commands into a dev overlay to
   mutate a running game). Rejected: explicitly out of scope per the issue ("Do not
   build a giant cheat console"); also the highest-risk option for accidentally shipping
   a second mutation surface into `GameSession`.
3. **Save-file-only injection** (developer pastes/imports a JSON save). Considered for
   Phase 3 (Playwright `installAutosave` already does this for one test). Rejected as
   the *primary* mechanism because it doesn't help someone who doesn't already have a
   captured save for the exact bug — the typed builder is strictly more useful and
   composable, and this is still available as a secondary path since scenarios stay
   installable as autosaves.

## Production-security implications

- No arbitrary JS evaluation surface — the loader only accepts a `scenario` name that
  must match a key in the closed `SCENARIOS` registry; unknown names throw rather than
  doing anything.
- Gated on `import.meta.env.DEV`, a compile-time constant Vite replaces at build time —
  the `if` branch and its dynamic imports are dead code in a production build, not a
  runtime check that could be bypassed by URL manipulation in prod.
- No new persistent/standing state — nothing is written to IndexedDB/localStorage by
  the loader itself (it calls `enterCampaign` directly, same as e2e mode; `enterCampaign`'s
  own autosave-on-start behavior is unchanged, existing behavior).
- Verified by inspecting `dist/` after `yarn build` (see Testing/Validation) to confirm
  `SCENARIOS`/`buildScenario` do not appear in the shipped bundle.

## Implementation phases

- **Phase 1 (this PR):** `src/testing/scenario-types.ts`, `scenario-builder.ts`,
  `scenarios/index.ts` (2-3 definitions) + Vitest coverage + the `?scenario=` DEV-gated
  branch in `game-session-controller.ts` + docs (`docs/scenario-infrastructure.md` or a
  section in an existing doc). New files only, plus one small additive branch in a file
  not touched by the #547 agent's barbarian/beast work.
- **Phase 2 (deferred, separate issue):** Playwright helper
  (`tests/e2e/helpers/scenario.ts`) wrapping `installAutosave(page,
  buildScenario(SCENARIOS[name]))`, added only once a Playwright spec actually needs a
  named scenario — avoids pre-building fixtures nothing consumes yet.
- **Phase 3 (deferred, separate issue):** grow the scenario library as new
  hard-to-reproduce bugs are found; each addition is a new `ScenarioDefinition` entry,
  no builder changes required unless a genuinely new step `kind` is needed.

## Testing expectations for Phase 1

- Deterministic construction: same definition twice → structurally equal (excluding
  `gameId`).
- Canonical definition use: a scenario's unit/city matches `UNIT_DEFINITIONS`/
  `BUILDINGS`-derived shape, not a hand literal (spot-check via the same definitions the
  builder itself imports).
- Invalid coordinate → `ScenarioError` with a clear message.
- Invalid/missing civ id reference → `ScenarioError`.
- Human vs. AI ownership: scenario steps work identically for `'player'` and an AI civ
  id.
- Hot-seat variant: a scenario built with `base.kind: 'hotSeat'` produces a state with
  `state.hotSeat` populated and per-slot visibility correct.
- `unsafe: true` escape hatch: proves the default path rejects an invalid placement and
  the `unsafe` path accepts it.
- Production/debug isolation: `dist/` inspection after `yarn build` confirms the
  scenario module graph is absent.
- The two representative bug scenarios reproduce the exact conditions the #843/#845
  Vitest tests independently hand-built, proven by asserting the same predicates those
  tests assert (city blocks BFS at the same hex, etc.) against the scenario-built state.
