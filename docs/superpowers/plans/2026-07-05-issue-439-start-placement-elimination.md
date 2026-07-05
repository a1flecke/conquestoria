# Issue #439 Start Placement and Elimination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make geographic map starts honestly selectable between balanced and historical policies, choose AI civilizations with awareness of the whole roster, and atomically eliminate defeated civilizations so hot-seat never hands them another turn.

**Architecture:** Keep map geography independent from start policy. A pure placement module selects valid separated sites and then assigns civilizations; a separate pure roster module chooses deterministic, geographically diverse AI opponents. A canonical civilization-elimination transition owns all cleanup, while state-aware turn helpers and a two-phase privacy handoff derive the next human from post-simulation state.

**Tech Stack:** TypeScript, DOM UI, seeded deterministic algorithms, Vitest, Vite.

---

## Reviewed implementation decisions

The approved design was reviewed against the current code and tightened in these ways:

1. `findStartPositions` remains a compatibility wrapper for generated-map callers, but all game creation calls a new `placeCivilizationStarts` API returning a discriminated `StartPlacementResult`. Balanced failure is data, not an implicit short result or uncaught setup exception.
2. Site selection uses bounded deterministic branch-and-bound over a candidate shortlist after farthest-point attempts. The bound is explicit and tested; it never weakens the nine-hex invariant.
3. Civilization assignment is solved by exhaustive permutation only after sites are fixed. With the supported maximum of eight civilizations, `8!` is bounded and preserves the soft historical-affinity contract.
4. AI preview and actual game creation call the same `selectAIRoster` helper. UI cannot promise one roster while creation silently chooses another.
5. Setup errors are returned through `onError` callbacks and rendered in-place. Existing selections remain intact.
6. Elimination cleanup is immutable and returns exact metadata. City capture emits `civ:eliminated` only from that metadata, avoiding a second scan of final state.
7. Hot-seat handoff has two explicit phases: anonymous privacy overlay, then identified recipient. Completed-round code cannot interpolate a provisional civilization name.
8. Domination resolution precedes `all-humans-eliminated`; a surviving major civilization remains the winner when one exists.
9. Legacy geographic saves normalize to `historical`, while all newly created geographic games default to `balanced`. No loaded unit or city moves.

## File map

- Modify `src/core/types.ts`: placement mode, terminal reason, setup fields, and typed placement failure.
- Create `src/systems/start-placement-system.ts`: candidate quality, balanced selection, historical placement, assignment, diagnostics.
- Create `tests/systems/start-placement-system.test.ts`: spacing, deterministic assignment, historical anchors, impossible-map failure.
- Create `src/systems/ai-roster-selection.ts`: shared deterministic roster-aware AI choice and preview diagnostics.
- Create `tests/systems/ai-roster-selection.test.ts`: determinism, catalog-order independence, uniqueness, partial-roster scoring.
- Modify `src/systems/map-generator.ts`: expose geographic anchors and use strict placement compatibility behavior.
- Modify `tests/systems/map-generator.test.ts`: prevent regression to silent close fallback.
- Modify `src/core/game-state.ts`: resolve placement mode, use shared roster/placement helpers, persist mode, return setup errors.
- Modify `tests/core/game-state.test.ts`: creation integration and exact requested AI roster.
- Modify `src/ui/campaign-setup.ts`: geographic placement cards, shared roster preview, historical warning and confirmation.
- Modify `tests/ui/campaign-setup.test.ts`: live solo setup click-through.
- Modify `src/ui/hotseat-setup.ts`: independent AI count, placement stage, final review, warning and confirmation.
- Modify `tests/ui/hotseat-setup.test.ts`: live staged flow and exact config.
- Modify `src/storage/save-manager.ts`: migration for placement mode and terminal reason.
- Modify `tests/storage/save-manager.test.ts`: legacy migration without relocation.
- Create `src/systems/civilization-elimination-system.ts`: canonical immutable actor cleanup.
- Create `tests/systems/civilization-elimination-system.test.ts`: complete cleanup, negative boundary, idempotence.
- Modify `src/systems/city-capture-system.ts`: compose elimination and emit from transition metadata.
- Modify `tests/systems/city-capture-system.test.ts`: occupy/raze/non-human parity and exactly-once event.
- Modify `src/core/turn-cycling.ts`: state-aware active-human helpers.
- Modify `tests/core/turn-cycling.test.ts`: pre-founding, skip, wrap, and round-completion semantics.
- Modify `src/ui/turn-handoff.ts`: anonymous preparation state and late recipient binding.
- Modify `tests/ui/turn-handoff.test.ts`: no stale identity and correct reveal.
- Create `src/core/hotseat-outcome.ts`: post-simulation recipient and terminal resolution.
- Create `tests/core/hotseat-outcome.test.ts`: domination precedence and no-human defeat.
- Modify `src/ui/victory-panel.ts`: victory/defeat outcome presentation.
- Modify `tests/ui/victory-panel.test.ts`: AI victory and all-human defeat copy.
- Modify `src/main.ts`: two-phase handoff, post-transaction recipient, state-aware round completion, setup error rendering.
- Modify `tests/main.integration.test.ts`: live handoff recomputation and terminal-save restoration.

## Player Truth Table

| Before | Action | Immediate visible result | Persisted result |
|---|---|---|---|
| New Earth setup | Select Earth | Balanced placement is selected and described as guaranteed separation | `startPlacementMode: 'balanced'` |
| Earth + True Start + crowded roster | Press Start | Warning names the minimum distance; first press confirms risk | No game is created yet |
| Confirmed crowded True Start | Press Start Crowded Historical Game | Game begins at exact known anchors | `startPlacementMode: 'historical'` |
| Two hot-seat humans on Large Earth | Choose one AI | Review shows exactly one roster-aware AI, not six | Config has two humans plus one AI |
| Balanced placement cannot fit roster | Press Start | Setup remains open with actionable reduce-roster/change-map error | No partial save/state |
| Human loses final city | Capture resolves | Defeated civ’s remaining active pieces disappear and elimination is logged | Civ retained as historical `isEliminated` record |
| Later human seat was eliminated | Current human ends turn | Handoff skips eliminated identity | Next active seat persisted |
| AI eliminates provisional next human during round simulation | Simulation completes | Anonymous overlay reveals the actual survivor only afterward | Post-simulation recipient persisted |
| No human survives | Simulation completes or save loads | Blocking Defeat panel appears; no handoff | `gameOverReason: 'all-humans-eliminated'` |
| One major civ survives | Turn resolves or save loads | Winner sees Victory; defeated human viewer sees Defeat | `gameOverReason: 'domination'`, winner retained |

## Misleading UI Risks

- “Balanced” is shown only when the strict placement engine will enforce all pairwise distances.
- True Start warning derives from the exact preview roster and anchor/fallback result used by creation.
- Generated maps do not expose a meaningless historical option.
- AI count is a chosen count and never inferred from map capacity.
- AI roster preview is deterministic from the same seed/config inputs as game creation.
- Anonymous handoff contains no next-player name, color, civilization icon, or accessibility label before post-simulation resolution.
- Defeat is not mislabeled Victory when the winner is an AI or another hot-seat participant.
- A civilization with zero cities before founding remains active; only `isEliminated` controls seat eligibility.

## Interaction Replay Checklist

- [ ] Start solo Earth setup; verify Balanced default and opponent count remain independently selectable.
- [ ] Switch to True Start with a crowded roster; verify one confirmation press is required and the second starts.
- [ ] Switch to a generated map; verify placement cards and historical warning disappear.
- [ ] Run hot-seat setup with two humans and one AI; verify final review and exact resulting seat count.
- [ ] Trigger a synthetic balanced placement failure; verify selections remain and no state is persisted.
- [ ] Capture a final city with remaining defender units/cargo/spy/diplomacy references; verify complete cleanup.
- [ ] End a turn with an eliminated later seat; verify the handoff skips it.
- [ ] During completed-round simulation eliminate the provisional recipient; verify no stale identity appears.
- [ ] Eliminate all humans; verify Defeat survives save/reload.
- [ ] Load a legacy geographic save; verify existing coordinates are unchanged and placement is labeled Historical.

---

### Task 1: Persisted types and legacy normalization

**Files:**
- Modify: `src/core/types.ts`
- Modify: `src/storage/save-manager.ts`
- Modify: `tests/storage/save-manager.test.ts`

- [ ] **Step 1: Write failing migration tests**

Add cases that load stripped legacy fixtures:

```ts
it('labels legacy geographic games historical without moving state', () => {
  const legacy = makeSave({ mapScript: 'earth' });
  delete legacy.state.startPlacementMode;
  const beforeUnits = structuredClone(legacy.state.units);
  const beforeCities = structuredClone(legacy.state.cities);

  const loaded = normalizeLoadedState(legacy.state);

  expect(loaded.startPlacementMode).toBe('historical');
  expect(loaded.units).toEqual(beforeUnits);
  expect(loaded.cities).toEqual(beforeCities);
});

it('infers domination for legacy terminal saves with a winner', () => {
  const legacy = makeState({ gameOver: true, winner: 'rome' });
  delete legacy.gameOverReason;
  expect(normalizeLoadedState(legacy).gameOverReason).toBe('domination');
});
```

- [ ] **Step 2: Run RED**

```bash
./scripts/run-with-mise.sh yarn test --run tests/storage/save-manager.test.ts
```

- [ ] **Step 3: Add the model**

Add:

```ts
export type StartPlacementMode = 'balanced' | 'historical';
export type GameOverReason = 'domination' | 'all-humans-eliminated';
```

Add optional `startPlacementMode` to setup configs, persisted optional `startPlacementMode` and `gameOverReason` to `GameState`, and preserve fields in config normalization.

- [ ] **Step 4: Normalize only missing legacy fields**

```ts
const geographic = state.mapScript === 'earth'
  || state.mapScript === 'old-world'
  || state.mapScript === 'new-world';
state.startPlacementMode ??= geographic ? 'historical' : 'balanced';
if (state.gameOver && state.winner && !state.gameOverReason) {
  state.gameOverReason = 'domination';
}
```

- [ ] **Step 5: Run GREEN and commit**

```bash
./scripts/run-with-mise.sh yarn test --run tests/storage/save-manager.test.ts
git add src/core/types.ts src/storage/save-manager.ts tests/storage/save-manager.test.ts
git commit -m "feat(setup): persist start placement policy"
```

### Task 2: Strict start-placement engine

**Files:**
- Create: `src/systems/start-placement-system.ts`
- Create: `tests/systems/start-placement-system.test.ts`
- Modify: `src/systems/map-generator.ts`
- Modify: `tests/systems/map-generator.test.ts`

- [ ] **Step 1: Write exact regression and semantic-boundary tests**

Tests must cover:

```ts
const result = placeCivilizationStarts({
  map: largeEarth,
  civilizationTypeIds: ['england', 'germany', 'rome'],
  mapScript: 'earth',
  mapSize: 'large',
  mode: 'balanced',
  seed: 'issue-439',
});
expect(result.ok).toBe(true);
if (result.ok) {
  expect(allPairwiseDistances(result.positions, largeEarth.width)).toSatisfy(
    distances => distances.every(distance => distance >= MIN_MAJOR_CIV_START_DISTANCE),
  );
}
```

Also prove exact historical anchors, anchorless fallback validity, determinism, unchanged selected site set under civilization order, and a synthetic map with no nine-hex solution returning:

```ts
{ ok: false, reason: 'insufficient-separated-sites', requested: 3, available: 2 }
```

- [ ] **Step 2: Run RED**

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/start-placement-system.test.ts tests/systems/map-generator.test.ts
```

- [ ] **Step 3: Expose anchor lookup without exposing mutable tables**

In `map-generator.ts`:

```ts
export function getGeographicStartAnchor(
  script: GeographicMapScript,
  size: MapSize,
  civilizationTypeId: string,
): HexCoord | null {
  const coord = GEO_START_TABLES[script]?.[size]?.[civilizationTypeId];
  return coord ? { ...coord } : null;
}
```

- [ ] **Step 4: Implement pure candidates and quality**

Export:

```ts
interface StartCandidate {
  coord: HexCoord;
  quality: number;
  tieRank: number;
}

export type StartPlacementResult =
  | { ok: true; positions: HexCoord[]; assignments: StartAssignment[]; minimumDistance: number | null; fallbackCivilizationIds: string[] }
  | { ok: false; reason: 'insufficient-separated-sites'; requested: number; available: number };
```

Candidate validity must reuse map passability/terrain rules, exclude polar rows, require local workable terrain, and sort by `tieRank` then coordinate to remove object-order dependence.

- [ ] **Step 5: Implement strict balanced site selection**

For each seeded candidate as first site, repeatedly choose the candidate maximizing:

```ts
[minimumDistanceToSelected, minimumQualityAfterAdd, totalQualityAfterAdd, tieRank]
```

Discard candidates with distance below nine. Keep the best complete solution. If greedy cannot complete, search a quality-limited deterministic conflict graph with a visited-node cap of 100,000. Return failure at the cap or exhausted graph; never append a close fallback.

- [ ] **Step 6: Assign sites after selection**

Enumerate site permutations and minimize total wrapped distance from known geographic anchors. Anchorless civilizations contribute neutral cost plus tie rank. The position array must remain aligned with input civilization IDs.

- [ ] **Step 7: Implement historical mode**

Reserve valid exact anchors first. Select valid unoccupied fallback sites for missing anchors deterministically, maximizing distance from all reserved sites. Exact anchors may be under nine; fallback cannot collide. Return `minimumDistance` and `fallbackCivilizationIds`.

- [ ] **Step 8: Keep compatibility wrapper strict**

Make `findStartPositions` delegate to balanced placement and throw a diagnostic error only for its legacy array-returning API. New creation code in Task 4 consumes the discriminated result directly.

- [ ] **Step 9: Run GREEN, seed sweep, and commit**

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/start-placement-system.test.ts tests/systems/map-generator.test.ts
git add src/systems/start-placement-system.ts src/systems/map-generator.ts tests/systems/start-placement-system.test.ts tests/systems/map-generator.test.ts
git commit -m "feat(map): enforce strict balanced start placement"
```

### Task 3: Roster-aware AI selection

**Files:**
- Create: `src/systems/ai-roster-selection.ts`
- Create: `tests/systems/ai-roster-selection.test.ts`

- [ ] **Step 1: Write failing roster tests**

Cover uniqueness, exact count, same seed determinism, shuffled-catalog invariance, humans plus previously chosen AIs in every scoring step, and the issue-439 roster:

```ts
const oldRoster = ['germany', 'rome'];
const selected = selectAIRoster({
  definitions: shuffledDefinitions,
  humanCivilizationIds: ['england'],
  count: 2,
  mapScript: 'earth',
  mapSize: 'large',
  placementMode: 'historical',
  seed: 'issue-439',
});
expect(minimumAnchorDistance(['england', ...selected.ids])).toBeGreaterThan(
  minimumAnchorDistance(['england', ...oldRoster]),
);
```

- [ ] **Step 2: Run RED**

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/ai-roster-selection.test.ts
```

- [ ] **Step 3: Implement one shared selector**

```ts
export interface AIRosterSelection {
  civilizationTypeIds: string[];
  minimumHistoricalDistance: number | null;
  fallbackCivilizationTypeIds: string[];
}
```

Sort definitions by ID before scoring. At each step maximize minimum anchor distance, then total distance, then seeded rank. Use deterministic virtual fallback coordinates for anchorless definitions so they are neither infinitely attractive nor treated as colocated.

- [ ] **Step 4: Run GREEN and commit**

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/ai-roster-selection.test.ts
git add src/systems/ai-roster-selection.ts tests/systems/ai-roster-selection.test.ts
git commit -m "feat(ai): select opponents with roster awareness"
```

### Task 4: Wire roster and placement into game creation

**Files:**
- Modify: `src/core/game-state.ts`
- Modify: `tests/core/game-state.test.ts`

- [ ] **Step 1: Write failing creation tests**

Prove new Earth games persist Balanced by default, supplied Historical preserves anchors, requested AI count is exact, and impossible placement returns an actionable `GameCreationError` without partial state.

- [ ] **Step 2: Run RED**

```bash
./scripts/run-with-mise.sh yarn test --run tests/core/game-state.test.ts
```

- [ ] **Step 3: Centralize map generation and placement**

Extract a private helper returning:

```ts
type PreparedMap = {
  map: GameMap;
  starts: HexCoord[];
  placementMode: StartPlacementMode;
};
```

Resolve geographic default to Balanced for new games. Generated scripts force Balanced. Call `guaranteeStartResources` only after final assigned starts.

- [ ] **Step 4: Use shared AI roster selection**

Solo creation selects the exact requested count through `selectAIRoster`. Hot-seat creation accepts configured seats from the reviewed setup and validates duplicates/capacity.

- [ ] **Step 5: Surface typed setup failure**

Introduce:

```ts
export class GameCreationError extends Error {
  readonly code = 'start-placement-failed';
}
```

UI callbacks catch only this expected error and remain open; unexpected errors continue to propagate/log.

- [ ] **Step 6: Run GREEN and commit**

```bash
./scripts/run-with-mise.sh yarn test --run tests/core/game-state.test.ts tests/systems/start-placement-system.test.ts tests/systems/ai-roster-selection.test.ts
git add src/core/game-state.ts tests/core/game-state.test.ts
git commit -m "feat(game): create campaigns from reviewed starts"
```

### Task 5: Solo setup policy and truthful warning

**Files:**
- Modify: `src/ui/campaign-setup.ts`
- Modify: `tests/ui/campaign-setup.test.ts`

- [ ] **Step 1: Write click-through tests**

Prove Earth defaults Balanced, generated maps hide placement controls, True Start preview uses shared roster data, a crowded preview requires two explicit actions, and callback config contains the placement mode.

- [ ] **Step 2: Run RED**

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/campaign-setup.test.ts
```

- [ ] **Step 3: Add placement cards with the UI kit**

Use `createGameButton` for every new action. Do not use raw buttons. Render:

- `Balanced (Recommended)` — “Separated viable starts; historical regions are soft preferences.”
- `True Start` — “Exact known homelands; nearby civilizations may begin close together.”

Hide the block for generated maps and reset the mode to Balanced.

- [ ] **Step 4: Bind preview and confirmation**

Recompute `selectAIRoster` when civ, map, size, count, or mode changes. In crowded Historical mode, first Start click changes CTA to `Start Crowded Historical Game`; the next click with unchanged inputs starts. Any input change clears confirmation.

- [ ] **Step 5: Run GREEN and commit**

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/campaign-setup.test.ts
git add src/ui/campaign-setup.ts tests/ui/campaign-setup.test.ts
git commit -m "feat(ui): expose balanced and true starts"
```

### Task 6: Hot-seat AI count and final review

**Files:**
- Modify: `src/ui/hotseat-setup.ts`
- Modify: `tests/ui/hotseat-setup.test.ts`

- [ ] **Step 1: Write full-flow failing tests**

Click through every stage and prove:

- geographic placement stage defaults Balanced;
- AI count defaults one and is bounded by `capacity - humans`;
- two humans plus one AI yields exactly three seats;
- review names selected humans and shared AI preview;
- True Start warning/confirmation appears only below nine;
- Back preserves choices.

- [ ] **Step 2: Run RED**

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/hotseat-setup.test.ts
```

- [ ] **Step 3: Add state and stages**

Track `selectedPlacementMode` and `aiCount`. Stage order is:

```text
size -> geography -> placement (geographic only) -> challenge
-> humans -> AI count -> names -> civilization picks -> review
```

The challenge stage remains because it controls AI behavior and is orthogonal to AI count.

- [ ] **Step 4: Replace silent fill with reviewed roster**

Delete `aiCount = max - playerCount`. In review, call `selectAIRoster` with chosen humans and append exactly the selected count to the config passed to `onComplete`.

- [ ] **Step 5: Render review and historical confirmation**

Show map, mode, humans, AI roster, fallback list, and historical minimum distance. Require the same two-step confirmation contract as solo setup when below nine.

- [ ] **Step 6: Run GREEN and commit**

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/hotseat-setup.test.ts
git add src/ui/hotseat-setup.ts tests/ui/hotseat-setup.test.ts
git commit -m "feat(hotseat): review explicit AI roster"
```

### Task 7: Canonical civilization elimination

**Files:**
- Create: `src/systems/civilization-elimination-system.ts`
- Create: `tests/systems/civilization-elimination-system.test.ts`

- [ ] **Step 1: Build a dense failing fixture**

The defeated actor must own a city-free civilization, normal unit, transport and cargo, spy records, relationships, wars, treaties, embargo membership, defensive-league membership, pending request, and opponent-AI records. Assert:

- all owned units are absent from `state.units`;
- `civilization.units` is empty and `isEliminated` true;
- references from every other actor/global collection are scrubbed;
- input state remains unchanged;
- repeated call returns `{ eliminated: false }`;
- a civ with another city is untouched.

- [ ] **Step 2: Run RED**

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/civilization-elimination-system.test.ts
```

- [ ] **Step 3: Implement immutable transition**

Return:

```ts
export type CivilizationEliminationResult =
  | { state: GameState; eliminated: false }
  | {
      state: GameState;
      eliminated: true;
      civId: string;
      eliminatedBy: string;
      removedUnitIds: string[];
      removedSpyIds: string[];
    };
```

Validate actor existence, `!isEliminated`, and `cities.length === 0`. Clone only modified branches. Remove all owned units in one set-based pass so transports and cargo disappear atomically. Scrub diplomacy, espionage, embargo, league, requests, and opponent-AI collections using their typed fields.

- [ ] **Step 4: Run GREEN and commit**

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/civilization-elimination-system.test.ts
git add src/systems/civilization-elimination-system.ts tests/systems/civilization-elimination-system.test.ts
git commit -m "feat(civ): centralize elimination cleanup"
```

### Task 8: Compose elimination with all city-capture paths

**Files:**
- Modify: `src/systems/city-capture-system.ts`
- Modify: `tests/systems/city-capture-system.test.ts`

- [ ] **Step 1: Write failing integration tests**

Cover final-city Occupy and Raze, another-city negative case, human and non-human capturers, remaining-unit cleanup, and exactly one `civ:eliminated` event from the returned transition.

- [ ] **Step 2: Run RED**

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/city-capture-system.test.ts
```

- [ ] **Step 3: Compose transition after ownership mutation**

Extend `MajorCityCaptureResult` with optional elimination metadata. Occupy and raze call `eliminateCivilization` after removing the city from the previous owner. `emitMajorCityCaptureEvents` emits only when metadata exists; remove final-state rescanning and direct `isEliminated` assignments.

- [ ] **Step 4: Run GREEN and commit**

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/city-capture-system.test.ts tests/systems/civilization-elimination-system.test.ts
git add src/systems/city-capture-system.ts tests/systems/city-capture-system.test.ts
git commit -m "fix(capture): atomically eliminate defeated civilizations"
```

### Task 9: State-aware hot-seat cycling and terminal outcome

**Files:**
- Modify: `src/core/turn-cycling.ts`
- Create: `src/core/hotseat-outcome.ts`
- Modify: `tests/core/turn-cycling.test.ts`
- Create: `tests/core/hotseat-outcome.test.ts`

- [ ] **Step 1: Write failing active-seat tests**

Prove zero-city non-eliminated seats remain active, eliminated seats are skipped in configured order, wrap is deterministic, and eliminating a later seat makes the current seat round-complete.

- [ ] **Step 2: Write failing outcome tests**

Prove normal domination wins before no-human defeat, no active humans with multiple AI survivors produces `winner: null`, and a surviving next human is selected from post-simulation state.

- [ ] **Step 3: Run RED**

```bash
./scripts/run-with-mise.sh yarn test --run tests/core/turn-cycling.test.ts tests/core/hotseat-outcome.test.ts
```

- [ ] **Step 4: Implement pure state-aware helpers**

```ts
getActiveHumanPlayers(state: GameState): HotSeatPlayer[];
getNextActiveHumanPlayerId(state: GameState, currentSlotId: string): string | null;
isActiveHumanRoundComplete(state: GameState, currentSlotId: string): boolean;
```

Filter only by configured human seat plus existing non-eliminated civilization. Preserve original configured indexes for “later this round” semantics.

- [ ] **Step 5: Implement post-round resolution**

```ts
resolveHotSeatPostSimulation(
  state: GameState,
  previousHumanId: string,
): { state: GameState; nextHumanId: string | null };
```

First preserve existing domination if `gameOver/winner` is already set. Then detect a single major survivor for domination. Only afterward apply `all-humans-eliminated`. Otherwise select the next active human and persist `currentPlayer`.

- [ ] **Step 6: Run GREEN and commit**

```bash
./scripts/run-with-mise.sh yarn test --run tests/core/turn-cycling.test.ts tests/core/hotseat-outcome.test.ts
git add src/core/turn-cycling.ts src/core/hotseat-outcome.ts tests/core/turn-cycling.test.ts tests/core/hotseat-outcome.test.ts
git commit -m "fix(hotseat): derive turns from surviving humans"
```

### Task 10: Two-phase handoff and correct terminal panel

**Files:**
- Modify: `src/ui/turn-handoff.ts`
- Modify: `tests/ui/turn-handoff.test.ts`
- Modify: `src/ui/victory-panel.ts`
- Modify: `tests/ui/victory-panel.test.ts`
- Modify: `src/main.ts`
- Modify: `tests/main.integration.test.ts`

- [ ] **Step 1: Write handoff and outcome UI tests**

Prove an anonymous controller contains no civ/player identity, `setRecipient` reveals only the authoritative recipient, Defeat renders for AI domination/all-human loss, and default victory behavior stays compatible.

- [ ] **Step 2: Write live integration regressions**

Stub the completed-round transaction so it eliminates the provisional next human. Assert `main.ts` binds the actual survivor after the transaction. Add no-active-human and terminal-save load assertions.

- [ ] **Step 3: Run RED**

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/turn-handoff.test.ts tests/ui/victory-panel.test.ts tests/main.integration.test.ts
```

- [ ] **Step 4: Add anonymous-to-recipient controller**

Allow:

```ts
showTurnHandoff(state, { recipient: null, onReady }): TurnHandoffController
controller.setRecipient(authoritativeState, nextHumanId, playerName)
```

Before binding, visible and accessibility text says only `Preparing next turn…`; the Ready action is disabled. After binding, render the existing pass-to identity and enable Ready.

- [ ] **Step 5: Generalize terminal presentation**

Keep `showVictoryPanel` as the compatibility export but accept:

```ts
{ outcome: 'victory' | 'defeat'; reason: GameOverReason; winnerName?: string }
```

Defeat copy must distinguish domination by another civ from all humans eliminated.

- [ ] **Step 6: Rewire `main.ts`**

Intermediate handoff uses current state-aware helpers. Completed-round handoff opens anonymous, runs the transaction, calls `resolveHotSeatPostSimulation`, persists that state, then either binds the authoritative recipient or closes the overlay and shows Defeat. Replace config-only `isRoundComplete`. Catch `GameCreationError` in setup launchers and route it to setup’s in-place error surface.

- [ ] **Step 7: Run GREEN and commit**

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/turn-handoff.test.ts tests/ui/victory-panel.test.ts tests/main.integration.test.ts tests/core/hotseat-outcome.test.ts
git add src/ui/turn-handoff.ts src/ui/victory-panel.ts src/main.ts tests/ui/turn-handoff.test.ts tests/ui/victory-panel.test.ts tests/main.integration.test.ts
git commit -m "fix(hotseat): reveal recipients after simulation"
```

### Task 11: Policy checks, browser replay, and inline code review

- [ ] **Step 1: Run source-policy checks**

```bash
scripts/check-src-rule-violations.sh \
  src/core/types.ts src/core/game-state.ts src/core/turn-cycling.ts src/core/hotseat-outcome.ts \
  src/storage/save-manager.ts src/systems/map-generator.ts src/systems/start-placement-system.ts \
  src/systems/ai-roster-selection.ts src/systems/civilization-elimination-system.ts \
  src/systems/city-capture-system.ts src/ui/campaign-setup.ts src/ui/hotseat-setup.ts \
  src/ui/turn-handoff.ts src/ui/victory-panel.ts src/main.ts
```

- [ ] **Step 2: Run all targeted tests together**

```bash
./scripts/run-with-mise.sh yarn test --run \
  tests/storage/save-manager.test.ts tests/systems/map-generator.test.ts \
  tests/systems/start-placement-system.test.ts tests/systems/ai-roster-selection.test.ts \
  tests/core/game-state.test.ts tests/ui/campaign-setup.test.ts tests/ui/hotseat-setup.test.ts \
  tests/systems/civilization-elimination-system.test.ts tests/systems/city-capture-system.test.ts \
  tests/core/turn-cycling.test.ts tests/core/hotseat-outcome.test.ts \
  tests/ui/turn-handoff.test.ts tests/ui/victory-panel.test.ts tests/main.integration.test.ts
```

- [ ] **Step 3: Run build and full suite**

```bash
./scripts/run-with-mise.sh yarn build
./scripts/run-with-mise.sh yarn test
```

- [ ] **Step 4: Replay both setup modes and terminal paths in the browser**

Run `./scripts/run-with-mise.sh yarn dev`, use the in-app browser, follow the Interaction Replay Checklist, and capture screenshots of Hot-seat final review and a crowded True Start warning.

- [ ] **Step 5: Inspect committed and uncommitted changes**

```bash
git diff --stat origin/main...HEAD
git diff --stat
git diff origin/main...HEAD
git diff
```

- [ ] **Step 6: Inline review checklist**

Review every changed path for:

- strict distance invariant with no hidden fallback;
- deterministic ordering independent of object/catalog order;
- preview/creation data consistency;
- immutable and complete actor cleanup;
- no stale handoff identity or privacy leak;
- domination precedence and correct defeat labeling;
- legacy-save non-mutation;
- test assertions through production/live paths, not helper-only coverage;
- UI-kit button compliance and 44px touch targets;
- no direct player-specific hardcoding in hot-seat paths.

Fix every finding, rerun affected targeted tests, build, and full suite.

- [ ] **Step 7: Final review commit if required**

```bash
git add <reviewed-files>
git commit -m "fix(issue-439): address inline review findings"
```

### Task 12: Publish the pull request

- [ ] **Step 1: Verify branch state**

```bash
git status --short --branch
git log --oneline origin/main..HEAD
```

- [ ] **Step 2: Push**

```bash
git push -u origin codex/issue-439-root-causes
```

- [ ] **Step 3: Create ready PR**

The PR body must:

- link and close issue #439;
- explain balanced versus True Start behavior;
- explain explicit roster-aware AI count;
- describe canonical elimination and post-simulation handoff;
- list targeted tests, build, full suite, policy checks, and browser replay;
- include setup screenshots.

```bash
gh pr create --base main --head codex/issue-439-root-causes \
  --title "fix: balance starts and skip eliminated hot-seat players" \
  --body-file /tmp/issue-439-pr.md
```

## Plan self-review

### Specification coverage

| Approved contract | Implemented by |
|---|---|
| Geography independent from placement | Tasks 1, 2, 4, 5, 6 |
| Strict nine-hex balanced spacing | Task 2 |
| Exact historical opt-in and warning | Tasks 2, 5, 6 |
| Roster-aware AI and explicit count | Tasks 3, 4, 6 |
| No partial state on placement failure | Tasks 2, 4, 5, 6 |
| Complete canonical elimination | Tasks 7, 8 |
| State-aware human cycling | Task 9 |
| Post-simulation authoritative recipient | Tasks 9, 10 |
| Persistent defeat and correct panel | Tasks 1, 9, 10 |
| Legacy saves preserve coordinates | Task 1 |
| Full policy/targeted/build/suite/browser verification | Task 11 |

### Test quality review

- Exact reported England/Germany/Rome failure has a regression.
- Every conjunctive rule has negative coverage: another city prevents elimination; only a historical map does not imply Historical mode; only one close pair triggers warning; zero cities alone does not skip a seat.
- UI tests click the live controls and assert callback/presentation, not just helper return values.
- Human and non-human capture paths share integration coverage.
- Determinism tests shuffle catalog order and repeat seeds.
- Save tests assert both new metadata and unchanged coordinates.
- Handoff tests inspect visible and accessibility text for privacy.

### Implementation completeness review

- No placeholder function or pseudocode remains in the production task list.
- Every new source file has a mirrored test.
- Every UI state mutation has an immediate visible assertion.
- Preview and creation share helpers rather than duplicate algorithms.
- Exact failure and terminal-state precedence are specified.
- Commands cover TypeScript (`build`) and runtime behavior (`test`).

