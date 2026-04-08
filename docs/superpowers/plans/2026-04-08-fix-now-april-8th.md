# Fix-Now-April-8th Follow-Up Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the April 8 hotfix milestone by correcting the review regressions in PR `#67`: persistent first-contact memory, a real per-campaign autosave system with last-5 history, and complete horizontal-wrap rendering across the full visible scene.

**Architecture:** Treat this as a follow-up patch set on top of the existing hotfix branch, not a restart. Preserve the already-landed fixes, but replace the weak seams they exposed: add explicit civilization contact memory in game state, split civilization contact from city discovery, replace the singleton autosave path with real autosave entries keyed by `gameId`, and route every renderer layer that paints map coordinates through the same horizontal-wrap ghost enumeration helper.

**Tech Stack:** TypeScript, Vitest, Canvas 2D, IndexedDB/localStorage persistence, GitHub PR review workflow

---

## Current Branch Baseline

This plan assumes work starts from branch `feature/fix-now-april-8th` at commit `338fd13`, which already contains:

- `b89858b` discovery-based diplomacy masking
- `ae49351` undiscovered city-state quest gating
- `79272e1` quest target validation
- `f8591e3` autosave list surfacing
- `4e18d69` AI early-war sanity gates
- `338fd13` wrap movement/fog/terrain consistency

This follow-up plan replaces the parts of that implementation that were shown incorrect in review and extends the hotfix to satisfy the clarified product requirements from April 8.

---

## Milestone Contract

**PR being repaired:** `#67`

**Issues still targeted by this milestone**
- `#47` Initial diplomacy still shows civilizations not met
- `#49` Saved games do not appear in the list
- `#50` Computer declared war after first turn
- `#55` Weird starting map state / visible wrap seams
- `#57` Receiving requests from city-states not met
- `#58` Diplomacy shows many cities/civs not met
- `#63` Cannot move onto wrapped desert-edge tiles
- `#66` Quest generation produces invalid or unsupported requests

**Additional review findings now explicitly in scope**
- persistent first-contact memory for major civs
- city discovery remaining separate from civilization contact
- autosave deletion working on real autosave entries
- per-game autosave history, retaining the last `5` autosaves by turn
- user-supplied game title for new campaigns
- full wrap rendering parity for cities, units, highlights, and minor-civ territory

**Out of scope**
- broad campaign browser redesign
- multi-column save management UI
- new quest types beyond current hotfix needs
- renderer/input refactors unrelated to wrap parity

---

## Success Criteria

The milestone is complete only when all of the following are true:

1. Meeting another major civ by unit sight, border sight, war, treaty, or breakaway-origin relationship persists as civilization knowledge even after those tiles are no longer visible.
2. Civilization contact does not reveal foreign city names, city locations, or city-targeted quest data unless the specific city tile has been discovered.
3. The diplomacy panel uses persistent contact memory, not transient visibility, for identity masking and AI contact checks.
4. Autosaves are real save entries tied to `gameId` and `gameTitle`, not a singleton synthetic row.
5. Each campaign keeps only the newest `5` autosaves by turn, and deleting an autosave removes the real stored entry instead of it reappearing on refresh.
6. The start-screen list and `Continue` button both work with the new autosave model:
   - `Continue` loads the newest autosave overall
   - the save list shows titled campaigns and their autosave rows
   - save mode still excludes autosaves from overwrite rows
7. Horizontal wrapping is visually complete for terrain, fog, rivers, movement highlights, minor-civ territory, cities, and units.
8. Edge-to-edge wrapped movement/pathfinding continues to work on the same tiles and overlays the player sees.
9. Every changed rule has focused regression tests, and the full suite plus build pass.
10. GitHub issues are commented with final behavior before merge, but are not closed until the PR actually merges.

---

## Root-Cause Summary

| Problem | Root cause on branch `338fd13` | Correct fix |
| --- | --- | --- |
| First contact regresses | `hasMetCivilization(...)` recomputes contact from current visibility/explored tiles instead of stored encounter memory | Persist `knownCivilizations` in state and update it from actual contact events / visibility scans |
| Contact reveals too much | Current discovery helper mixes “know civ exists” with “know a city” | Add separate `hasDiscoveredCity(...)` and keep city gating stricter than civ contact |
| Autosave delete is fake | UI deletes `autosave` as if it were a manual slot while real data lives under separate autosave keys | Autosaves must become first-class saved entries with real metadata and a real delete path |
| Autosave system is underspecified | Existing code stores only one autosave and synthesizes one row | Store real autosave entries keyed by `gameId`, retain last `5`, and label them with `gameTitle` |
| Wrap rendering still looks broken | Ghost rendering stops at terrain/fog/rivers | Route every render layer with map coords through the same wrap helper |

---

## File Structure

### Existing Production Files To Modify
- Modify: `src/core/types.ts`
  - add `knownCivilizations` to `Civilization`
  - add `gameId` and `gameTitle` to `GameState`
  - add `gameId` and `gameTitle` to `SaveSlotMeta`
- Modify: `src/core/game-state.ts`
  - initialize `knownCivilizations`, `gameId`, `gameTitle`
  - require title input in new game creation entry points
- Modify: `src/core/turn-manager.ts`
  - update persistent contact memory after visibility refresh for every civ
- Modify: `src/main.ts`
  - thread title from new-game flow
  - keep `Continue` bound to newest autosave overall
  - migrate legacy saves to new state shape
  - mirror highlight rendering through wrap helper
- Modify: `src/systems/discovery-system.ts`
  - replace transient-only met logic with persistent contact helpers
  - add city discovery helper
- Modify: `src/systems/minor-civ-system.ts`
  - keep city-state quest gating based on city discovery, not mere civ contact
- Modify: `src/systems/quest-system.ts`
  - add a guard/helper for any city-targeted quest description or generation path
- Modify: `src/storage/save-manager.ts`
  - replace singleton autosave model with per-game autosave entries
  - add last-5 retention by `gameId`
  - add newest-autosave lookup
  - add real autosave delete path
- Modify: `src/ui/save-panel.ts`
  - show titled autosave rows
  - delete real autosave entries
  - keep autosaves out of save-mode overwrite rows
- Modify: `src/ui/hotseat-setup.ts`
  - accept and carry a game title through the hot-seat setup flow
- Modify: `src/renderer/wrap-rendering.ts`
  - become the shared ghost-coordinate source for all render layers
- Modify: `src/renderer/hex-renderer.ts`
  - mirror minor-civ territory through wrap helper
- Modify: `src/renderer/city-renderer.ts`
  - mirror cities through wrap helper
- Modify: `src/renderer/unit-renderer.ts`
  - mirror units through wrap helper
- Modify: `src/renderer/render-loop.ts`
  - mirror movement highlights through wrap helper

### Existing Tests To Modify
- Modify: `tests/systems/discovery-system.test.ts`
- Modify: `tests/ui/diplomacy-panel.test.ts`
- Modify: `tests/ai/basic-ai.test.ts`
- Modify: `tests/systems/minor-civ-system.test.ts`
- Modify: `tests/systems/quest-system.test.ts`
- Modify: `tests/storage/save-manager.test.ts`
- Modify: `tests/storage/save-persistence.test.ts`
- Modify: `tests/ui/save-panel.test.ts`
- Modify: `tests/renderer/city-renderer.test.ts`

### New Tests To Create
- Create: `tests/renderer/unit-renderer.test.ts`
- Create: `tests/renderer/render-loop-wrap.test.ts`

---

## Design Decisions Locked In

### Contact And Discovery

- Add `knownCivilizations: string[]` to each civilization and persist it in saves.
- A civ becomes known when any of these happen:
  - one of its units is visible
  - one of its owned tiles or city tiles is visible or fogged
  - the two civs are at war
  - the two civs have any treaty
  - the civ is a breakaway whose origin owner is the viewer, or vice versa
- Once known, the civ stays known.
- Knowing a civilization exists does **not** reveal its cities.
- Add `hasDiscoveredCity(state, viewerCivId, cityId)` and use it anywhere the UI or quest text wants to name a specific city.
- City-state discovery remains city-tile based.

### Autosave System

- Add `gameId` and `gameTitle` to every game state.
- New solo and hot-seat campaigns require a user-supplied title before the game starts.
- Autosaves are stored as real save entries, not a special synthesized row.
- Autosave entry IDs use a stable per-campaign key, e.g. `autosave:<gameId>:<turn>`.
- `SaveSlotMeta.name` remains the row label (`Autosave Turn 24`, `Manual Save`, etc.).
- `SaveSlotMeta.gameTitle` is the campaign label shown in the save list.
- Keep only the newest `5` autosaves per `gameId`, based on turn and then timestamp.
- `Continue` loads the newest autosave overall.
- Keep a single localStorage fallback only for the newest autosave overall, not all `5`, to avoid bloating localStorage.
- Legacy singleton autosave support stays as a migration path until the old key is no longer present.

### Wrap Rendering

- The canonical map state remains wrapped into in-bounds `q` coordinates.
- Every visual layer that paints world coordinates must be able to mirror at `q +/- map.width` when near an edge.
- This includes:
  - terrain and tile contents
  - fog
  - rivers
  - movement highlights
  - minor-civ territory outlines
  - cities
  - units
- Input stays canonical and continues to wrap through `wrapHexCoord(...)` in `main.ts`; this task is render parity, not input redesign.

---

## Task 1: Persist Major-Civ Contact Memory And Split It From City Discovery

**Files:**
- Modify: `src/core/types.ts`
- Modify: `src/core/game-state.ts`
- Modify: `src/core/turn-manager.ts`
- Modify: `src/systems/discovery-system.ts`
- Modify: `src/main.ts`
- Modify: `tests/systems/discovery-system.test.ts`
- Modify: `tests/ui/diplomacy-panel.test.ts`
- Modify: `tests/ai/basic-ai.test.ts`

- [ ] **Step 1: Add red tests for persistent contact and separate city discovery**

Add or extend `tests/systems/discovery-system.test.ts` with these behaviors:

```ts
it('keeps a civilization known after first visible unit contact even after visibility is lost', () => {
  expect(hasMetCivilization(state, 'player', 'ai-1')).toBe(true);
});

it('does not treat city discovery as implied by civilization contact', () => {
  expect(hasDiscoveredCity(state, 'player', romeCityId)).toBe(false);
});

it('treaties and wars count as persistent contact even without current visibility', () => {
  expect(hasMetCivilization(state, 'player', 'ai-1')).toBe(true);
});
```

Extend `tests/ui/diplomacy-panel.test.ts` with:

```ts
it('keeps a known rival named in diplomacy after scouts lose sight of them', () => {
  expect(rendered).toContain('Rome');
});

it('uses state.currentPlayer contact memory in hot-seat instead of leaking another players contacts', () => {
  expect(rendered).not.toContain('Known only to the other human');
});
```

Extend `tests/ai/basic-ai.test.ts` with:

```ts
it('still considers a civ met for diplomacy after first contact has been recorded', () => {
  expect(decisionContext['ai-1'].hasMet).toBe(true);
});
```

- [ ] **Step 2: Run the focused contact tests and confirm failure**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/discovery-system.test.ts tests/ui/diplomacy-panel.test.ts tests/ai/basic-ai.test.ts
```

Expected: FAIL because contact is currently recomputed from transient visibility and no city discovery helper exists.

- [ ] **Step 3: Add the persistent state fields**

Update `src/core/types.ts`:

```ts
export interface Civilization {
  // existing fields...
  knownCivilizations: string[];
}

export interface GameState {
  // existing fields...
  gameId: string;
  gameTitle: string;
}
```

Initialize `knownCivilizations: []` in `src/core/game-state.ts` for every civ.

- [ ] **Step 4: Implement persistent contact helpers**

In `src/systems/discovery-system.ts`, define and use these seams:

```ts
export function recordCivilizationContact(state: GameState, civA: string, civB: string): void;
export function refreshKnownCivilizations(state: GameState, civId: string): void;
export function hasMetCivilization(state: GameState, viewerCivId: string, targetCivId: string): boolean;
export function hasDiscoveredCity(state: GameState, viewerCivId: string, cityId: string): boolean;
```

Rules:
- `recordCivilizationContact(...)` updates both civs
- `refreshKnownCivilizations(...)` scans current visibility plus war/treaty/breakaway-origin states
- `hasMetCivilization(...)` first checks persistent memory, then any guaranteed relationship shortcuts
- `hasDiscoveredCity(...)` only checks the city tile visibility history (`visible` or `fog`)

- [ ] **Step 5: Call the contact refresh from real gameplay flow**

After every civ visibility refresh in `src/core/turn-manager.ts`, call:

```ts
refreshKnownCivilizations(newState, civId);
```

Also call it during initial game setup / migration in `src/main.ts` so loaded legacy saves gain a valid `knownCivilizations` baseline.

- [ ] **Step 6: Rewire UI and AI to the corrected semantics**

- `src/ui/diplomacy-panel.ts` should use `hasMetCivilization(...)` for civilization identity
- it must not assume `hasMetCivilization(...)` means any city is known
- `src/ai/basic-ai.ts` keeps using `hasMetCivilization(...)`, but now that helper is persistent

- [ ] **Step 7: Re-run focused tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/discovery-system.test.ts tests/ui/diplomacy-panel.test.ts tests/ai/basic-ai.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/core/types.ts src/core/game-state.ts src/core/turn-manager.ts src/systems/discovery-system.ts src/main.ts src/ui/diplomacy-panel.ts src/ai/basic-ai.ts tests/systems/discovery-system.test.ts tests/ui/diplomacy-panel.test.ts tests/ai/basic-ai.test.ts
git commit -m "fix(hotfix): persist major civ contact"
```

---

## Task 2: Keep Quest And City-State Gating Based On City Discovery, Not Mere Contact

**Files:**
- Modify: `src/systems/minor-civ-system.ts`
- Modify: `src/systems/quest-system.ts`
- Modify: `tests/systems/minor-civ-system.test.ts`
- Modify: `tests/systems/quest-system.test.ts`

- [ ] **Step 1: Add red tests for city-discovery-sensitive quest behavior**

Add tests like:

```ts
it('does not issue a city-state quest when the city-state city has not been discovered even if its civilization is known', () => {
  expect(mc.activeQuests.player).toBeUndefined();
});

it('does not format or emit a city-targeted quest against an undiscovered foreign city', () => {
  expect(isQuestTargetKnownToPlayer(state, 'player', quest)).toBe(false);
});
```

If `quest-system.ts` has no generic target-knowledge helper yet, add one as part of this task so the rule is explicit instead of implicit.

- [ ] **Step 2: Run the focused quest tests and confirm failure**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/minor-civ-system.test.ts tests/systems/quest-system.test.ts
```

Expected: FAIL on the new “known civ but unknown city” cases.

- [ ] **Step 3: Add a quest-target knowledge guard**

In `src/systems/quest-system.ts`, add:

```ts
export function isQuestTargetKnownToPlayer(state: GameState, playerId: string, quest: Quest): boolean;
```

Rules:
- `gift_gold` is always known if the city-state itself is discovered
- `destroy_camp` requires the camp target to exist and be near the minor civ city
- `defeat_units` requires real nearby units and must not mention an undiscovered foreign city
- any current or future quest variant that carries `cityId` must call `hasDiscoveredCity(...)`

- [ ] **Step 4: Keep city-state quest issuance gated by city discovery**

In `src/systems/minor-civ-system.ts`, keep quest issuance, expiry, and player-targeted display logic tied to `hasDiscoveredMinorCiv(...)`, not `hasMetCivilization(...)`.

- [ ] **Step 5: Re-run the focused quest tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/minor-civ-system.test.ts tests/systems/quest-system.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/systems/minor-civ-system.ts src/systems/quest-system.ts tests/systems/minor-civ-system.test.ts tests/systems/quest-system.test.ts
git commit -m "fix(hotfix): keep quest city gating strict"
```

---

## Task 3: Replace Singleton Autosave With Real Per-Game Autosave History

**Files:**
- Modify: `src/core/types.ts`
- Modify: `src/core/game-state.ts`
- Modify: `src/storage/save-manager.ts`
- Modify: `tests/storage/save-manager.test.ts`

- [ ] **Step 1: Add red tests for autosave history semantics**

Extend `tests/storage/save-manager.test.ts` with:

```ts
it('keeps only the latest five autosaves for one game id', async () => {
  expect(autosavesForGame.map(s => s.turn)).toEqual([12, 11, 10, 9, 8]);
});

it('retains autosaves separately per game id', async () => {
  expect(gameA.every(s => s.gameId === 'game-a')).toBe(true);
  expect(gameB.every(s => s.gameId === 'game-b')).toBe(true);
});

it('deletes a single autosave entry by id without leaving it in the list', async () => {
  expect(saves.find(s => s.id === deletedId)).toBeUndefined();
});

it('loads the newest autosave overall for continue', async () => {
  expect(save?.turn).toBe(42);
});
```

- [ ] **Step 2: Run the autosave manager tests and confirm failure**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/storage/save-manager.test.ts
```

Expected: FAIL because the current code still uses one autosave key.

- [ ] **Step 3: Expand save metadata and state shape**

In `src/core/types.ts`, add:

```ts
export interface SaveSlotMeta {
  // existing fields...
  gameId: string;
  gameTitle: string;
}
```

In `src/core/game-state.ts`, ensure every new game gets:

```ts
gameId: `game-${Date.now()}`,
gameTitle: userSuppliedTitle,
```

- [ ] **Step 4: Rewrite autosave storage around real entries**

In `src/storage/save-manager.ts`, replace the singleton path with functions shaped like:

```ts
export async function autoSave(state: GameState): Promise<void>;
export async function loadMostRecentAutoSave(): Promise<GameState | undefined>;
export async function listSaves(options?: { includeAutoSaves?: boolean }): Promise<SaveSlotMeta[]>;
export async function deleteSaveEntry(entryId: string, kind: 'manual' | 'autosave'): Promise<void>;
```

Implementation rules:
- autosave IDs use `autosave:${state.gameId}:${state.turn}`
- autosave meta uses `name: Autosave Turn ${state.turn}`
- after writing an autosave, prune older autosaves for the same `gameId` down to the latest `5`
- keep a single localStorage backup for the newest autosave overall
- preserve manual saves as separate slot entries

- [ ] **Step 5: Handle legacy data explicitly**

Add a migration helper in `save-manager.ts` or `main.ts` that:
- still loads the old singleton `AUTO_SAVE_KEY` if present
- wraps it with generated `gameId` / fallback `gameTitle`
- writes it into the new autosave model the first time it is loaded or surfaced

Fallback title rules:
- manual save with existing slot name: use that slot name
- loaded legacy autosave without a title: use `Recovered ${civType} Campaign`

- [ ] **Step 6: Re-run save-manager tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/storage/save-manager.test.ts tests/storage/save-persistence.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/core/types.ts src/core/game-state.ts src/storage/save-manager.ts tests/storage/save-manager.test.ts tests/storage/save-persistence.test.ts
git commit -m "fix(hotfix): add per-game autosave history"
```

---

## Task 4: Capture User-Supplied Game Titles And Fix Save Panel Autosave UX

**Files:**
- Modify: `src/main.ts`
- Modify: `src/ui/hotseat-setup.ts`
- Modify: `src/ui/save-panel.ts`
- Modify: `tests/ui/save-panel.test.ts`

- [ ] **Step 1: Add red UI tests for titles, continue, and autosave deletion**

Extend `tests/ui/save-panel.test.ts` with:

```ts
it('renders the game title on autosave rows', async () => {
  expect(rendered).toContain('Rise of Egypt');
});

it('routes autosave row deletion through the autosave delete path', async () => {
  expect(mocks.deleteSaveEntry).toHaveBeenCalledWith('autosave:game-1:12', 'autosave');
});

it('keeps autosaves out of save mode overwrite rows', async () => {
  expect(rendered).not.toContain('Overwrite');
});
```

- [ ] **Step 2: Run the save panel tests and confirm failure**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/save-panel.test.ts
```

Expected: FAIL because titles and autosave delete routing do not exist yet.

- [ ] **Step 3: Add title capture to the new-game flow**

Update `src/main.ts` and `src/ui/hotseat-setup.ts` so:
- the “New Game” flow prompts for a non-empty title before campaign creation
- solo creation calls `createNewGame(civId, seed, mapSize, gameTitle)`
- hot-seat completion calls `createHotSeatGame(config, seed, gameTitle)`

For this hotfix, keep the UX lightweight:
- title input on the “New Game” mode screen
- default suggestion allowed (`${selected civ or mode} Campaign`) but editable
- empty submission is not allowed

- [ ] **Step 4: Update save panel rendering and delete routing**

In `src/ui/save-panel.ts`:
- replace `deleteGame(save.id)` with `deleteSaveEntry(save.id, save.kind ?? 'manual')`
- show `save.gameTitle` on every autosave row
- keep `Continue` bound to `loadMostRecentAutoSave()`
- keep start-mode rows flat and chronological; do not add grouping in this hotfix

Row copy should follow this shape:

```ts
${save.gameTitle} · ${save.name}
Turn ${save.turn} · ${save.gameMode === 'hotseat' ? 'Hot Seat' : save.civType}
```

- [ ] **Step 5: Re-run save panel and save-manager tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/storage/save-manager.test.ts tests/ui/save-panel.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/main.ts src/ui/hotseat-setup.ts src/ui/save-panel.ts tests/ui/save-panel.test.ts tests/storage/save-manager.test.ts
git commit -m "fix(hotfix): title campaigns and delete autosaves correctly"
```

---

## Task 5: Complete Horizontal-Wrap Rendering For The Full Scene

**Files:**
- Modify: `src/renderer/wrap-rendering.ts`
- Modify: `src/renderer/hex-renderer.ts`
- Modify: `src/renderer/city-renderer.ts`
- Modify: `src/renderer/unit-renderer.ts`
- Modify: `src/renderer/render-loop.ts`
- Modify: `tests/renderer/city-renderer.test.ts`
- Create: `tests/renderer/unit-renderer.test.ts`
- Create: `tests/renderer/render-loop-wrap.test.ts`

- [ ] **Step 1: Add red tests for the missing mirrored layers**

Extend `tests/renderer/city-renderer.test.ts` with:

```ts
it('renders a wrapped ghost copy of a city near the horizontal seam', () => {
  expect(ctx.fillTextCalls.filter(call => call.text.includes(city.name)).length).toBeGreaterThan(1);
});
```

Create `tests/renderer/unit-renderer.test.ts` with:

```ts
it('renders a wrapped ghost copy of a visible unit near the horizontal seam', () => {
  expect(iconCalls.length).toBe(2);
});
```

Create `tests/renderer/render-loop-wrap.test.ts` with:

```ts
it('draws wrapped movement highlights near the seam', () => {
  expect(highlightCalls).toContainEqual({ q: map.width, r: 0 });
});

it('draws wrapped minor-civ territory outlines near the seam', () => {
  expect(strokeCalls).toBeGreaterThan(canonicalOnlyCount);
});
```

- [ ] **Step 2: Run the renderer wrap tests and confirm failure**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/renderer/city-renderer.test.ts tests/renderer/unit-renderer.test.ts tests/renderer/render-loop-wrap.test.ts
```

Expected: FAIL because those layers still render only canonical coordinates.

- [ ] **Step 3: Generalize the wrap helper for all render layers**

In `src/renderer/wrap-rendering.ts`, expose a single helper shaped like:

```ts
export function getRenderCoordsForHex(coord: HexCoord, wrapsHorizontally: boolean, mapWidth: number): HexCoord[];
```

This must return:
- canonical coord always
- left ghost when near the left seam
- right ghost when near the right seam

No renderer should manually recompute seam offsets after this change.

- [ ] **Step 4: Apply the helper to every remaining visible layer**

Update:
- `src/renderer/city-renderer.ts`
- `src/renderer/unit-renderer.ts`
- `src/renderer/hex-renderer.ts` for `drawMinorCivTerritory(...)`
- `src/renderer/render-loop.ts` for movement highlights

Important:
- visibility checks still use canonical coordinates
- mirrored draw calls only duplicate rendering, not state
- concealed-forest unit rules still evaluate on the canonical unit position

- [ ] **Step 5: Re-run focused renderer tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/renderer/city-renderer.test.ts tests/renderer/unit-renderer.test.ts tests/renderer/render-loop-wrap.test.ts tests/renderer/fog-renderer.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/wrap-rendering.ts src/renderer/hex-renderer.ts src/renderer/city-renderer.ts src/renderer/unit-renderer.ts src/renderer/render-loop.ts tests/renderer/city-renderer.test.ts tests/renderer/unit-renderer.test.ts tests/renderer/render-loop-wrap.test.ts tests/renderer/fog-renderer.test.ts
git commit -m "fix(hotfix): finish wrapped scene rendering"
```

---

## Task 6: Full Verification, PR Review Pass, And GitHub Closeout Discipline

**Files:**
- Modify: this plan only if the implementation deviates from the locked design

- [ ] **Step 1: Run the full suite**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run
```

Expected: PASS.

- [ ] **Step 2: Run the production build**

Run:

```bash
./scripts/run-with-mise.sh yarn build
```

Expected: PASS.

- [ ] **Step 3: Perform the final issue audit against real behavior**

Verify explicitly:
- `#47` / `#58`: known civs stay known after first contact; unknown civs remain masked
- `#57`: undiscovered city-states still cannot issue quests or notifications
- `#66`: no invalid targets and no undiscovered city leaks in quest text
- `#49`: autosave rows are real, titled, deletable, and capped at `5` per game
- `#50`: AI no longer declares irrational turn-1 wars
- `#55` / `#63`: seam visuals and wrapped movement/pathing now match for all visible layers

- [ ] **Step 4: Review PR `#67` again after the fix commits land**

Review against:

```bash
git diff origin/main...HEAD
git diff
```

Focus on:
- contact persistence
- city discovery separation
- autosave migration/backward compatibility
- autosave delete path
- full wrap-layer parity
- hot-seat correctness via `state.currentPlayer`

- [ ] **Step 5: Comment on GitHub issues, but do not close them yet**

Update the issue threads with:
- PR reference `#67`
- final shipped behavior
- key regression tests added

Do **not** close the issues in this task. They stay open until the PR is merged into `main`.

- [ ] **Step 6: Commit any plan-only follow-up edits if needed**

```bash
git add docs/superpowers/plans/2026-04-08-fix-now-april-8th.md
git commit -m "docs(hotfix): update april 8 follow-up plan"
```

---

## Spec Coverage Checklist

- Persistent contact memory: `Task 1`
- Separation of civilization contact from city discovery: `Task 1` and `Task 2`
- Strict city-state and quest discovery gating: `Task 2`
- Proper per-game autosave history with title: `Task 3` and `Task 4`
- Correct autosave deletion and continue behavior: `Task 3` and `Task 4`
- Full wrap-render parity for all visible layers: `Task 5`
- Release-gate discipline and “do not close before merge”: `Task 6`

No review finding or April 8 clarification is left without an explicit task.

---

## Plan Self-Review

- Placeholder scan: no `TODO`, `TBD`, or “implement later” placeholders remain.
- Contact scenarios covered:
  - visible unit contact
  - explored owned tile contact
  - explored city tile contact
  - war/treaty contact
  - breakaway-origin contact
  - persistence after visibility loss
  - city knowledge staying separate
- Autosave scenarios covered:
  - solo titles
  - hot-seat titles
  - newest-overall continue
  - per-game retention at `5`
  - autosave deletion
  - legacy singleton migration
  - save-mode exclusion
- Wrapping scenarios covered:
  - terrain
  - fog
  - rivers
  - movement highlights
  - minor-civ territory
  - cities
  - units
  - wrapped movement/pathfinding staying aligned with rendering
