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
- city-targeted quest text staying private until the city itself is discovered
- save-panel rendering staying DOM-safe for user-controlled save names, campaign titles, and hot-seat player names
- legacy autosave retirement validating a loadable real autosave payload, not just orphaned autosave metadata
- save-panel list rendering working in the real browser DOM, not only in the current detached-node test harness
- minor-civ names staying hidden until the city-state itself is discovered, across unit panels, combat preview, notifications, and hot-seat pending events

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
11. First contact persists immediately when contact happens during live play, not only after end-turn processing or load migration.
12. Once real per-game autosaves exist, legacy singleton autosave data cannot resurface in the UI or `Continue` flow unless it is the only remaining autosave source.
13. Horizontal wrap rendering stays correct at any zoom level and viewport width supported by the game, including cases where more than one wrapped copy may be visible.
14. City-targeted quest text never reveals an undiscovered city name in diplomacy rows, notifications, or hot-seat pending events.
15. Save-panel user-controlled text is rendered through DOM nodes and `textContent`, not interpolated into `innerHTML`.
16. Orphaned autosave metadata does not suppress or delete a valid legacy autosave fallback; legacy retirement happens only after at least one loadable real autosave exists.
17. The save list renders real slot cards in both `start` and `save` modes when `createSavePanel(...)` runs in an actual DOM, even though the panel subtree is constructed before it is appended to the document.
18. Save-panel regression coverage runs in a real DOM environment and fails if detached-tree lookups or impossible mock-document behavior reappear.
19. A player who has not discovered a city-state’s city tile never learns that city-state’s proper name from unit info, combat preview, global event notifications, or hot-seat pending events; those surfaces use a generic fallback label instead.
20. Minor-civ notification behavior is covered by direct player-facing tests, not only lower-level helper tests; every event surface in `main.ts` that emits city-state text has a focused regression proving viewer gating, privacy, and hot-seat formatting.

---

## Root-Cause Summary

| Problem | Root cause on branch `338fd13` | Correct fix |
| --- | --- | --- |
| First contact regresses | `hasMetCivilization(...)` recomputes contact from current visibility/explored tiles instead of stored encounter memory | Persist `knownCivilizations` in state and update it from actual contact events / visibility scans |
| Contact reveals too much | Current discovery helper mixes “know civ exists” with “know a city” | Add separate `hasDiscoveredCity(...)` and keep city gating stricter than civ contact |
| Autosave delete is fake | UI deletes `autosave` as if it were a manual slot while real data lives under separate autosave keys | Autosaves must become first-class saved entries with real metadata and a real delete path |
| Autosave system is underspecified | Existing code stores only one autosave and synthesizes one row | Store real autosave entries keyed by `gameId`, retain last `5`, and label them with `gameTitle` |
| Wrap rendering still looks broken | Ghost rendering stops at terrain/fog/rivers | Route every render layer with map coords through the same wrap helper |
| First contact still regresses after brief scouting | Contact is only persisted in `processTurn(...)` / migration, not at the moment visibility changes during movement, combat, or setup | Persist contact from a shared post-visibility sync helper invoked anywhere visibility is recalculated |
| Deleted autosaves can come back from legacy storage | Legacy singleton autosave fallback remains readable even after real autosaves have been created and deleted | Make legacy autosave fallback one-way: migrate or retire it once real autosaves exist |
| Wrap seam can still break at low zoom or wide viewport | The ghost helper uses a fixed `EDGE_MARGIN = 3` instead of viewport-aware duplication based on what the camera can actually see | Replace edge-margin duplication with offset enumeration derived from camera viewport and world wrap span |
| Quest privacy fix is helper-only | `isQuestTargetKnownToPlayer(...)` exists, but the real UI/notification surfaces still print raw `quest.description` | Centralize player-facing quest copy in a formatter that gates city names before display |
| Save-panel hotfix breaks DOM safety | User-controlled `save.name`, `gameTitle`, and `playerNames` are interpolated into `innerHTML` | Rebuild dynamic save rows with DOM nodes and `textContent`, keeping user content out of markup strings |
| Legacy autosave retirement is too eager | Any autosave meta is treated as proof of a real autosave, even if its payload is missing | Treat only loadable autosave meta+payload pairs as real, and prune orphaned metas before retire/list/continue decisions |
| Save-panel tests hide the live rendering regression | `createSavePanel(...)` queries `document.getElementById('save-slots')` before mount, while the custom fixture globally registers ids from detached `innerHTML` as if the subtree were already in the document | Refactor the panel to keep local element references / panel-scoped queries, and move save-panel rendering tests to a file-local real DOM environment instead of a fake `document` |
| Minor-civ privacy is enforced ad hoc instead of through one viewer-aware naming layer | Some surfaces use `hasDiscoveredMinorCiv(...)`, but `main.ts` still formats `mcDef?.name` directly in unit/combat panels and several bus handlers | Centralize minor-civ naming/notification formatting in one helper layer and route every player-facing minor-civ name through it |
| Notification tests stop too low in the stack | `minor-civ-presentation` and `quest-system` tests prove building blocks, but the real player-facing event rules still live inline in `main.ts`, so helper tests can pass while a notification surface diverges | Extract minor-civ notification policy into a dedicated helper module and cover every event type with viewer-aware tests, leaving `main.ts` as thin bus wiring |

---

## Second Formal Review Follow-Up

This section supersedes any earlier “good enough” interpretation of the hotfix. The remaining work is not cosmetic. These are correctness and completeness gaps found after the first implementation pass:

1. `knownCivilizations` is only refreshed during turn processing and save migration, so transient scouting contact can disappear again before end turn.
2. The autosave system now has real per-game entries, but the legacy singleton fallback is still live and can resurrect deleted autosaves after migration.
3. Wrapped rendering works for the seam-near-column case, but the helper is still based on a hardcoded column margin instead of the actual visible camera span.

The corrective design below fixes the underlying issue in each case rather than layering more special cases.

### Corrective Design: Contact Persistence

- Introduce a shared `syncCivilizationContactsFromVisibility(state, civId)` helper in `src/systems/discovery-system.ts`.
- This helper keeps the existing contact rules, but it is called any time visibility is refreshed, not just during end-turn processing.
- Add a small wrapper in the visibility update call sites so the sequence is always:
  1. recalculate visibility
  2. persist newly discovered civilization contacts
  3. continue normal game flow
- Required call sites:
  - initial game creation in `src/core/game-state.ts`
  - end-turn visibility refresh in `src/core/turn-manager.ts`
  - live visibility refresh in `src/main.ts` after player movement / other direct updates
  - AI visibility refresh in `src/ai/basic-ai.ts` if it updates visibility directly
  - legacy save migration in `src/main.ts`
- Keep city discovery separate. Contact persistence must never reveal city identity unless `hasDiscoveredCity(...)` is independently true.

### Corrective Design: Autosave Migration

- Add a one-way legacy migration/retirement helper in `src/storage/save-manager.ts`.
- Required behavior:
  - if real autosave metas already exist, ignore and retire the legacy singleton fallback
  - if no real autosaves exist but a legacy singleton exists, surface it exactly once as a migration source
  - once a real autosave is written for any game, delete or tombstone the legacy singleton so it cannot resurface later
  - deleting the last visible real autosave must not “reveal” a stale legacy autosave that the player thought was already gone
- Keep `Continue` bound to newest autosave overall.
- Keep row-load behavior precise:
  - legacy singleton autosave row may map to `Continue`
  - real autosave rows must load the selected slot by id

### Corrective Design: Wrap Rendering

- Replace `EDGE_MARGIN` duplication in `src/renderer/wrap-rendering.ts` with a viewport-aware offset enumerator.
- The helper must answer: “for this canonical coord, which wrapped copies could be visible in the current camera viewport?”
- Implement it by computing the horizontal world-space wrap span and enumerating all integer wrap offsets whose copies intersect the visible world bounds.
- This helper becomes the only source of wrapped render coords for:
  - terrain
  - fog
  - rivers
  - movement highlights
  - minor-civ territory
  - cities
  - units
- Do not change gameplay/input coordinates. This is still render-only duplication.

---

## Additional Files For This Follow-Up

### Existing Production Files To Modify
- Modify: `src/systems/fog-of-war.ts`
  - if needed, expose a narrow helper or return value so callers can sync contact immediately after visibility changes without duplicating logic
- Modify: `src/storage/save-manager.ts`
  - add legacy migration/retirement helper and tests around fallback suppression
- Modify: `src/renderer/wrap-rendering.ts`
  - replace fixed edge-margin helper with viewport-aware copy enumeration
- Modify: `src/renderer/fog-renderer.ts`
  - adopt the new viewport-aware helper instead of any seam-local duplication assumptions

### Existing Tests To Modify
- Modify: `tests/storage/save-manager.test.ts`
  - add legacy fallback retirement coverage
- Modify: `tests/systems/discovery-system.test.ts`
  - add gameplay-path contact persistence coverage, not just direct helper calls
- Modify: `tests/renderer/fog-renderer.test.ts`
  - add wide-viewport / low-zoom wrapped-copy coverage

### New Tests To Create
- Create: `tests/renderer/wrap-rendering.test.ts`
  - direct unit tests for viewport-aware wrapped copy enumeration

---

## Task 6A: Persist First Contact At The Moment Visibility Changes

**Files:**
- Modify: `src/systems/discovery-system.ts`
- Modify: `src/core/game-state.ts`
- Modify: `src/core/turn-manager.ts`
- Modify: `src/main.ts`
- Modify: `src/ai/basic-ai.ts`
- Modify: `tests/systems/discovery-system.test.ts`
- Modify: `tests/ui/diplomacy-panel.test.ts`
- Modify: `tests/ai/basic-ai.test.ts`

- [ ] **Step 1: Add red tests for real gameplay-path persistence**

Extend `tests/systems/discovery-system.test.ts` with behaviors that do not manually seed contact:

```ts
it('persists contact immediately after a visibility refresh reveals a foreign unit', () => {
  updateVisibility(state.civilizations.player.visibility, [playerScout], state.map);
  syncCivilizationContactsFromVisibility(state, 'player');
  expect(hasMetCivilization(state, 'player', 'outsider')).toBe(true);
});

it('does not lose first contact when the revealing unit moves away before end turn', () => {
  updateVisibility(state.civilizations.player.visibility, [playerScout], state.map);
  syncCivilizationContactsFromVisibility(state, 'player');
  removeVisionFromOutsiderTile(state);
  expect(hasMetCivilization(state, 'player', 'outsider')).toBe(true);
});
```

Extend `tests/ui/diplomacy-panel.test.ts` with:

```ts
it('keeps a rival named in diplomacy immediately after brief scouting contact', () => {
  expect(rendered).toContain('Rome');
});
```

Extend `tests/ai/basic-ai.test.ts` with:

```ts
it('treats a civ as met after ai visibility refresh records first contact', () => {
  expect(decisions.some(d => d.targetCiv === 'player')).toBe(true);
});
```

- [ ] **Step 2: Run the focused tests and confirm failure**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/discovery-system.test.ts tests/ui/diplomacy-panel.test.ts tests/ai/basic-ai.test.ts
```

Expected: FAIL because the branch currently persists contact only in turn processing / migration.

- [ ] **Step 3: Add a shared post-visibility contact sync helper**

In `src/systems/discovery-system.ts`, add a public helper that persists contact from the viewer’s current visibility:

```ts
export function syncCivilizationContactsFromVisibility(state: GameState, viewerCivId: string): void {
  for (const otherId of Object.keys(state.civilizations)) {
    if (otherId === viewerCivId) continue;
    if (hasMetCivilizationByCurrentEvidence(state, viewerCivId, otherId)) {
      recordCivilizationContact(state, viewerCivId, otherId);
    }
  }
}
```

Keep `refreshKnownCivilizations(...)` as a compatibility alias or replace its call sites directly. Do not duplicate the evidence logic in callers.

- [ ] **Step 4: Invoke the helper from every visibility-refresh path**

Required call-site pattern:

```ts
updateVisibility(civ.visibility, civUnits, state.map, cityPositions);
syncCivilizationContactsFromVisibility(state, civId);
```

Add this immediately after visibility refresh in:
- `src/core/game-state.ts`
- `src/core/turn-manager.ts`
- `src/main.ts`
- `src/ai/basic-ai.ts`
- `src/main.ts` legacy migration path

- [ ] **Step 5: Re-run the focused tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/discovery-system.test.ts tests/ui/diplomacy-panel.test.ts tests/ai/basic-ai.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit the contact fix**

```bash
git add src/systems/discovery-system.ts src/core/game-state.ts src/core/turn-manager.ts src/main.ts src/ai/basic-ai.ts tests/systems/discovery-system.test.ts tests/ui/diplomacy-panel.test.ts tests/ai/basic-ai.test.ts
git commit -m "fix(hotfix): persist contact on visibility refresh"
```

---

## Task 6B: Make Legacy Autosave Migration One-Way

**Files:**
- Modify: `src/storage/save-manager.ts`
- Modify: `src/ui/save-panel.ts`
- Modify: `tests/storage/save-manager.test.ts`
- Modify: `tests/ui/save-panel.test.ts`

- [ ] **Step 1: Add red tests for legacy fallback retirement**

Extend `tests/storage/save-manager.test.ts` with:

```ts
it('ignores legacy autosave fallback once a real autosave exists', async () => {
  dbState.set('autosave', {
    turn: 3,
    currentPlayer: 'player',
    civilizations: { player: { civType: 'egypt' } },
    hotSeat: undefined,
  });
  await autoSave({
    turn: 9,
    currentPlayer: 'player',
    gameId: 'game-a',
    gameTitle: 'Game A',
    civilizations: { player: { civType: 'egypt' } },
    hotSeat: undefined,
  } as any);
  const saves = await listSaves({ includeAutoSave: true });
  expect(saves.find(save => save.id === 'autosave')).toBeUndefined();
});

it('does not resurrect a legacy autosave after deleting the last real autosave', async () => {
  dbState.set('autosave', {
    turn: 3,
    currentPlayer: 'player',
    civilizations: { player: { civType: 'egypt' } },
    hotSeat: undefined,
  });
  await autoSave({
    turn: 9,
    currentPlayer: 'player',
    gameId: 'game-a',
    gameTitle: 'Game A',
    civilizations: { player: { civType: 'egypt' } },
    hotSeat: undefined,
  } as any);
  await deleteSaveEntry('autosave:game-a:9', 'autosave');
  const saves = await listSaves({ includeAutoSave: true });
  expect(saves.find(save => save.id === 'autosave')).toBeUndefined();
});
```

Extend `tests/ui/save-panel.test.ts` with:

```ts
it('loads a real autosave row by slot id while keeping legacy autosave on continue semantics only', async () => {
  expect(onLoadSlot).toHaveBeenCalledWith('autosave:game-1:9');
});
```

- [ ] **Step 2: Run the focused autosave tests and confirm failure**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/storage/save-manager.test.ts tests/ui/save-panel.test.ts
```

Expected: FAIL because the legacy fallback is still globally readable after real autosaves exist.

- [ ] **Step 3: Add a legacy retirement helper**

In `src/storage/save-manager.ts`, add a helper along these lines:

```ts
async function retireLegacyAutosaveIfRealAutosavesExist(): Promise<void> {
  const metas = await listPersistedMetas();
  if (metas.some(meta => meta.kind === 'autosave')) {
    await dbDelete(LEGACY_AUTO_SAVE_KEY);
    await syncLocalStorageBackup(undefined);
  }
}
```

Call it from:
- `autoSave(...)` after writing the real autosave
- `listSaves(...)` before deciding whether to fall back to legacy
- `loadMostRecentAutoSave(...)` before deciding whether to fall back to legacy

The rule is simple:
- no real autosaves: legacy fallback allowed
- any real autosave exists: legacy fallback retired / ignored

- [ ] **Step 4: Keep row-load semantics exact**

In `src/ui/save-panel.ts`, preserve this distinction:

```ts
if (saveKind === 'autosave' && save.id === 'autosave') {
  callbacks.onContinue();
} else {
  callbacks.onLoadSlot(save.id);
}
```

This keeps the legacy singleton compatible while ensuring real autosave history rows load the selected entry.

- [ ] **Step 5: Re-run focused autosave tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/storage/save-manager.test.ts tests/ui/save-panel.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit the autosave migration fix**

```bash
git add src/storage/save-manager.ts src/ui/save-panel.ts tests/storage/save-manager.test.ts tests/ui/save-panel.test.ts
git commit -m "fix(hotfix): retire legacy autosave fallback"
```

---

## Task 6C: Replace Edge-Margin Wrapping With Viewport-Aware Copy Enumeration

**Files:**
- Modify: `src/renderer/wrap-rendering.ts`
- Modify: `src/renderer/hex-renderer.ts`
- Modify: `src/renderer/fog-renderer.ts`
- Modify: `src/renderer/city-renderer.ts`
- Modify: `src/renderer/unit-renderer.ts`
- Modify: `src/renderer/render-loop.ts`
- Create: `tests/renderer/wrap-rendering.test.ts`
- Modify: `tests/renderer/fog-renderer.test.ts`
- Modify: `tests/renderer/city-renderer.test.ts`
- Modify: `tests/renderer/unit-renderer.test.ts`
- Modify: `tests/renderer/render-loop-wrap.test.ts`

- [ ] **Step 1: Add red tests for wide-viewport / low-zoom wrap cases**

Create `tests/renderer/wrap-rendering.test.ts` with:

```ts
it('returns all visible wrapped copies for a coord when the viewport spans more than one seam copy', () => {
  const copies = getVisibleHorizontalWrapCoords({ q: 0, r: 0 }, map, camera);
  expect(copies).toEqual(
    expect.arrayContaining([{ q: 0, r: 0 }, { q: 5, r: 0 }]),
  );
});

it('can return more than one ghost copy when the viewport is wider than a single wrap span', () => {
  const copies = getVisibleHorizontalWrapCoords({ q: 0, r: 0 }, map, veryWideCamera);
  expect(copies.length).toBeGreaterThan(2);
});
```

Extend `tests/renderer/fog-renderer.test.ts` with a low-zoom case where the visible seam is wider than three columns.

Keep the existing city/unit/render-loop tests, but update them to call the new helper-backed paths.

- [ ] **Step 2: Run the focused renderer tests and confirm failure**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/renderer/wrap-rendering.test.ts tests/renderer/fog-renderer.test.ts tests/renderer/city-renderer.test.ts tests/renderer/unit-renderer.test.ts tests/renderer/render-loop-wrap.test.ts
```

Expected: FAIL because the current helper is fixed to `EDGE_MARGIN = 3`.

- [ ] **Step 3: Replace the wrap helper with viewport-aware enumeration**

In `src/renderer/wrap-rendering.ts`, replace the fixed-margin helper with a camera-aware function:

```ts
export function getVisibleHorizontalWrapCoords(
  coord: HexCoord,
  mapWidth: number,
  camera: Camera,
): HexCoord[] {
  const wrapOrigin = hexToPixel({ q: coord.q, r: coord.r }, camera.hexSize).x;
  const wrapSpan = hexToPixel({ q: coord.q + mapWidth, r: coord.r }, camera.hexSize).x - wrapOrigin;
  const visibleWorldLeft = camera.x - camera.hexSize * 2;
  const visibleWorldRight = camera.x + (camera.width / camera.zoom) + camera.hexSize * 2;

  const minOffset = Math.floor((visibleWorldLeft - wrapOrigin) / wrapSpan);
  const maxOffset = Math.ceil((visibleWorldRight - wrapOrigin) / wrapSpan);

  const coords: HexCoord[] = [];
  for (let offset = minOffset; offset <= maxOffset; offset++) {
    coords.push({ q: coord.q + offset * mapWidth, r: coord.r });
  }
  return coords;
}
```

Use the repo’s actual `hexToPixel(...)` signature. The important part is viewport-derived offset bounds, not a hardcoded edge margin.

- [ ] **Step 4: Thread the new helper through every wrapped render layer**

Replace all `getHorizontalWrapRenderCoords(...)` call sites with the new camera-aware helper in:
- `src/renderer/hex-renderer.ts`
- `src/renderer/fog-renderer.ts`
- `src/renderer/city-renderer.ts`
- `src/renderer/unit-renderer.ts`
- `src/renderer/render-loop.ts`

Do not leave any layer on old “near edge only” logic.

- [ ] **Step 5: Re-run focused renderer tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/renderer/wrap-rendering.test.ts tests/renderer/fog-renderer.test.ts tests/renderer/city-renderer.test.ts tests/renderer/unit-renderer.test.ts tests/renderer/render-loop-wrap.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit the wrap fix**

```bash
git add src/renderer/wrap-rendering.ts src/renderer/hex-renderer.ts src/renderer/fog-renderer.ts src/renderer/city-renderer.ts src/renderer/unit-renderer.ts src/renderer/render-loop.ts tests/renderer/wrap-rendering.test.ts tests/renderer/fog-renderer.test.ts tests/renderer/city-renderer.test.ts tests/renderer/unit-renderer.test.ts tests/renderer/render-loop-wrap.test.ts
git commit -m "fix(hotfix): make wrap rendering viewport aware"
```

---

## Release Gate Addendum

Before the PR is considered ready again, run these exact checks:

1. Focused contact checks:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/discovery-system.test.ts tests/ui/diplomacy-panel.test.ts tests/ai/basic-ai.test.ts
```

2. Focused autosave checks:

```bash
./scripts/run-with-mise.sh yarn test --run tests/storage/save-manager.test.ts tests/ui/save-panel.test.ts
```

3. Focused wrap-render checks:

```bash
./scripts/run-with-mise.sh yarn test --run tests/renderer/wrap-rendering.test.ts tests/renderer/fog-renderer.test.ts tests/renderer/city-renderer.test.ts tests/renderer/unit-renderer.test.ts tests/renderer/render-loop-wrap.test.ts
```

4. Full regression:

```bash
./scripts/run-with-mise.sh yarn test --run
./scripts/run-with-mise.sh yarn build
```

5. Final branch review checklist:
- confirm first-contact persistence without manual helper seeding
- confirm legacy autosave cannot resurface after real autosave migration
- confirm wrapped copies render correctly at low zoom and wide viewport, not only at seam-adjacent columns
- confirm save-panel row load/delete semantics still match the real autosave model

---

## Follow-Up Plan Self-Review

### Coverage Check

- `P1 contact persistence` is covered by Task `6A`.
- `P2 legacy autosave fallback resurrection` is covered by Task `6B`.
- `P2 viewport-incomplete wrap rendering` is covered by Task `6C`.

### Hole Check

- The plan now covers gameplay call sites, not just helpers, for first contact.
- The plan now covers migration-path retirement, not just visible-row deletion, for autosaves.
- The plan now covers low-zoom / wide-viewport scenarios, not just seam-adjacent coordinates, for wrapping.

### Quality Check

- Each remaining review finding has a red-test step, focused verification, implementation step, and commit boundary.
- The plan preserves repository patterns:
  - TypeScript
  - Vitest
  - event-driven state flow
  - `state.currentPlayer` discipline
  - render-only wrap duplication
- No placeholder “handle edge cases” steps remain for these three findings.

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

## Third Formal Review Follow-Up

This section supersedes the earlier assumption that the hotfix branch was functionally complete after the viewport-wrap work. The latest formal review found three remaining correctness/design gaps:

1. Quest privacy is only implemented as a helper and is not wired through the real diplomacy and notification surfaces.
2. The save panel now works better functionally, but it still violates the repository DOM safety rule by interpolating user-controlled text into `innerHTML`.
3. Legacy autosave retirement is still driven by autosave metadata alone, so an orphaned meta row can hide or delete the only loadable fallback autosave.

The tasks below fix those root causes instead of layering more special cases on top of the current branch.

### Corrective Design: Player-Facing Quest Copy

- Add one canonical formatter in `src/systems/quest-system.ts` for player-facing quest copy:

```ts
export function getQuestDescriptionForPlayer(
  state: Pick<GameState, 'cities' | 'civilizations' | 'minorCivs'>,
  playerId: string,
  quest: Quest,
): string
```

- This formatter must never trust raw `quest.description` when the target can leak a city identity.
- Required behavior:
  - `destroy_camp`: generic safe text, no city leakage risk
  - `gift_gold`: generic safe text
  - `defeat_units` with `cityId` and discovered city: include the real city name
  - `defeat_units` with `cityId` and undiscovered city: replace the city name with a generic phrase such as `a foreign city`
  - `trade_route` targeting an undiscovered city-state: generic phrase such as `a discovered city-state`
  - unknown/legacy quest shapes: fall back to a generic safe sentence, not the raw stored description
- Every player-facing quest surface must call this formatter:
  - city-state quest line in `src/ui/diplomacy-panel.ts`
  - `minor-civ:quest-issued` notification text in `src/main.ts`
  - any hot-seat pending-event message assembled from the same notification path
- Prefer adding a second helper for notification copy so `main.ts` does not rebuild strings ad hoc:

```ts
export function getQuestIssuedMessageForPlayer(
  state: Pick<GameState, 'cities' | 'civilizations' | 'minorCivs'>,
  playerId: string,
  minorCivName: string,
  quest: Quest,
): string
```

### Corrective Design: DOM-Safe Save Panel

- Replace save row HTML string interpolation with DOM node creation.
- Static shell/layout markup may stay string-based only if it contains no user-derived content. Prefer DOM creation for the whole panel to keep the implementation consistent with repository standards.
- The following values must only flow through `textContent`:
  - `save.name`
  - `save.gameTitle`
  - `save.playerNames`
- Button ids may keep using internal slot ids, but user-controlled labels must never become part of markup strings.
- Update the save-panel test fixture so it can verify DOM-built rows without relying on `innerHTML` parsing as the primary source of truth.

### Corrective Design: Loadable Autosave Validation

- Introduce an internal helper in `src/storage/save-manager.ts` that enumerates only loadable autosaves:

```ts
async function listLoadableAutosaveMetas(pruneInvalid: boolean = true): Promise<SaveSlotMeta[]>
```

- Required behavior:
  - read autosave metas
  - confirm the autosave payload exists for each meta
  - prune orphaned autosave metas when `pruneInvalid` is `true`
  - sort the returned metas using the same newest-first semantics as the current list/continue flow
- All autosave decisions must then use loadable autosaves, not raw metadata:
  - `getMostRecentAutosaveMeta()`
  - `loadMostRecentPersistedAutosave()`
  - `listSaves({ includeAutoSave: true })`
  - `retireLegacyAutosaveIfRealAutosavesExist()`
- Legacy autosave retirement becomes:
  - retire only if at least one loadable real autosave exists
  - otherwise preserve the legacy fallback
  - if orphaned autosave metas exist, clean them up instead of treating them as real saves

### Task 7: Wire Quest Privacy Through Real UI And Notification Surfaces

**Files:**
- Modify: `src/systems/quest-system.ts`
- Modify: `src/ui/diplomacy-panel.ts`
- Modify: `src/main.ts`
- Modify: `tests/systems/quest-system.test.ts`
- Modify: `tests/ui/diplomacy-panel.test.ts`

- [ ] **Step 1: Add red tests for discovered and undiscovered quest copy**

Extend `tests/systems/quest-system.test.ts` with player-facing copy coverage:

```ts
it('returns a generic city-targeted description when the target city is undiscovered', () => {
  expect(getQuestDescriptionForPlayer(state, 'player', quest)).toBe('Clear 2 units near a foreign city');
});

it('returns the named city-targeted description once the city is discovered', () => {
  state.civilizations.player.visibility.tiles['6,0'] = 'fog';
  expect(getQuestDescriptionForPlayer(state, 'player', quest)).toBe('Clear 2 units from Rome');
});

it('builds a quest-issued notification without leaking an undiscovered city name', () => {
  expect(getQuestIssuedMessageForPlayer(state, 'player', 'Sparta', quest)).toBe('Sparta asks: Clear 2 units near a foreign city');
});
```

Extend `tests/ui/diplomacy-panel.test.ts` with:

```ts
it('does not leak an undiscovered city name through a city-state quest row', () => {
  expect(rendered).toContain('foreign city');
  expect(rendered).not.toContain('Rome');
});
```

- [ ] **Step 2: Run the focused quest privacy tests and confirm failure**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/quest-system.test.ts tests/ui/diplomacy-panel.test.ts
```

Expected: FAIL because the branch still renders raw `quest.description`.

- [ ] **Step 3: Centralize player-facing quest copy**

In `src/systems/quest-system.ts`, add:

```ts
export function getQuestDescriptionForPlayer(
  state: Pick<GameState, 'cities' | 'civilizations' | 'minorCivs'>,
  playerId: string,
  quest: Quest,
): string {
  switch (quest.target.type) {
    case 'destroy_camp':
      return 'Destroy a nearby barbarian camp';
    case 'gift_gold':
      return `Gift ${quest.target.amount} gold`;
    case 'defeat_units':
      if ('cityId' in quest.target && quest.target.cityId && hasDiscoveredCity(state as GameState, playerId, quest.target.cityId)) {
        const city = (state as GameState).cities[quest.target.cityId];
        return `Clear ${quest.target.count} units from ${city?.name ?? 'the target city'}`;
      }
      return `Clear ${quest.target.count} units near a foreign city`;
    case 'trade_route':
      return hasDiscoveredMinorCiv(state as GameState, playerId, quest.target.minorCivId)
        ? quest.description
        : 'Establish a trade route to a discovered city-state';
    default:
      return 'Complete the assigned task';
  }
}

export function getQuestIssuedMessageForPlayer(
  state: Pick<GameState, 'cities' | 'civilizations' | 'minorCivs'>,
  playerId: string,
  minorCivName: string,
  quest: Quest,
): string {
  return `${minorCivName} asks: ${getQuestDescriptionForPlayer(state, playerId, quest)}`;
}
```

`quest.description` is no longer the default UI source for city-bearing quests. Use structural formatting by quest type/target so legacy or imported quest descriptions cannot leak city names accidentally.

- [ ] **Step 4: Route every quest-copy surface through the helper**

Required rewires:

```ts
const questDescription = quest ? getQuestDescriptionForPlayer(state, state.currentPlayer, quest) : null;
```

in `src/ui/diplomacy-panel.ts`, and:

```ts
const msg = getQuestIssuedMessageForPlayer(
  gameState,
  data.majorCivId,
  def?.name ?? 'City-state',
  data.quest,
);
```

in `src/main.ts`.

Do not leave any direct `quest.description` interpolation on player-facing quest surfaces after this task.

- [ ] **Step 5: Re-run the focused quest tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/quest-system.test.ts tests/ui/diplomacy-panel.test.ts tests/systems/discovery-system.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/systems/quest-system.ts src/ui/diplomacy-panel.ts src/main.ts tests/systems/quest-system.test.ts tests/ui/diplomacy-panel.test.ts
git commit -m "fix(hotfix): gate quest city names by discovery"
```

---

### Task 8: Rebuild The Save Panel With DOM-Safe User Text Handling

**Files:**
- Modify: `src/ui/save-panel.ts`
- Modify: `tests/ui/helpers/save-panel-fixture.ts`
- Modify: `tests/ui/save-panel.test.ts`

- [ ] **Step 1: Add red tests for save-name/title markup injection**

Extend `tests/ui/save-panel.test.ts` with:

```ts
it('does not register ids embedded inside a save name', async () => {
  mocks.listSaves.mockResolvedValue([
    {
      id: 'slot-1',
      name: '<span id=\"evil-save\">Owned</span>',
      gameTitle: '<span id=\"evil-title\">Injected</span>',
      civType: 'egypt',
      turn: 9,
      lastPlayed: '2026-04-08T12:00:00.000Z',
      kind: 'manual',
      gameMode: 'solo',
    },
  ]);

  await createSavePanel(container, callbacks);

  expect(document.getElementById('evil-save')).toBeNull();
  expect(document.getElementById('evil-title')).toBeNull();
});
```

Also add a hot-seat label test:

```ts
it('renders hot-seat player names as plain text instead of markup', async () => {
  expect(document.getElementById('evil-player')).toBeNull();
});
```

- [ ] **Step 2: Run the save-panel tests and confirm failure**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/save-panel.test.ts
```

Expected: FAIL because the current implementation injects user-controlled values into `innerHTML`.

- [ ] **Step 3: Replace dynamic row interpolation with DOM builders**

In `src/ui/save-panel.ts`, build the panel with DOM APIs:

```ts
function createSlotCard(save: SaveSlotMeta, mode: 'start' | 'save'): HTMLElement {
  const card = document.createElement('div');
  const name = document.createElement('div');
  name.textContent = save.name;
  const title = document.createElement('div');
  title.textContent = save.gameTitle ?? '';
  const meta = document.createElement('div');
  meta.textContent = `Turn ${save.turn} · ${save.gameMode === 'hotseat' ? `Hot Seat (${save.playerNames?.join(', ') ?? ''})` : save.civType}`;
  // Append buttons and return card
  return card;
}
```

The finished implementation must keep all user-derived strings out of markup templates.

- [ ] **Step 4: Strengthen the save-panel test fixture for DOM-built rows**

Update `tests/ui/helpers/save-panel-fixture.ts` so it can:
- track created children via `appendChild(...)`
- return created elements by id
- preserve `textContent`
- still support button clicks on dynamically created elements

If needed, add a small text-tree serializer for assertions:

```ts
export function collectRenderedText(root: MockElement): string {
  return [root.textContent, ...root.children.map(collectRenderedText)].join(' ');
}
```

- [ ] **Step 5: Re-run the save-panel tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/save-panel.test.ts tests/storage/save-manager.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/ui/save-panel.ts tests/ui/helpers/save-panel-fixture.ts tests/ui/save-panel.test.ts
git commit -m "fix(hotfix): render save rows with safe dom text"
```

---

### Task 9: Validate Loadable Autosaves Before Retiring The Legacy Fallback

**Files:**
- Modify: `src/storage/save-manager.ts`
- Modify: `tests/storage/save-manager.test.ts`

- [ ] **Step 1: Add red tests for orphaned autosave metadata**

Extend `tests/storage/save-manager.test.ts` with:

```ts
it('keeps the legacy autosave visible when autosave metadata exists without a real payload', async () => {
  dbState.set('meta:autosave:game-a:9', {
    id: 'autosave:game-a:9',
    kind: 'autosave',
    gameId: 'game-a',
    gameTitle: 'Game A',
    turn: 9,
    lastPlayed: '2026-04-08T12:00:00.000Z',
  });
  dbState.set('autosave', legacyState);

  const saves = await listSaves({ includeAutoSave: true });
  const continued = await loadMostRecentAutoSave();

  expect(saves.find(save => save.id === 'autosave')).toBeDefined();
  expect(continued?.turn).toBe(legacyState.turn);
});

it('retires the legacy autosave only after a loadable real autosave exists', async () => {
  // store both meta and payload for a real autosave, plus legacy
  expect(await loadMostRecentAutoSave()).toMatchObject({ gameId: 'game-a', turn: 9 });
  expect(dbState.has('autosave')).toBe(false);
});
```

Also assert that orphaned autosave metas are removed during validation:

```ts
expect(dbState.has('meta:autosave:game-a:9')).toBe(false);
```

- [ ] **Step 2: Run the save-manager tests and confirm failure**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/storage/save-manager.test.ts
```

Expected: FAIL because the branch currently treats orphaned autosave metadata as proof of a real autosave.

- [ ] **Step 3: Introduce loadable-autosave enumeration**

In `src/storage/save-manager.ts`, add:

```ts
async function listLoadableAutosaveMetas(pruneInvalid: boolean = true): Promise<SaveSlotMeta[]> {
  const metas = (await listPersistedMetas()).filter(meta => meta.kind === 'autosave');
  const valid: SaveSlotMeta[] = [];

  for (const meta of metas) {
    const payload = await dbGet<GameState>(getSaveStorageKey(meta.id, 'autosave'));
    if (payload) {
      valid.push(meta);
      continue;
    }
    if (pruneInvalid) {
      await dbDelete(getMetaStorageKey(meta.id));
    }
  }

  return valid.sort((a, b) => b.turn - a.turn || compareSaveMeta(a, b));
}
```

- [ ] **Step 4: Rewire every autosave decision to use loadable autosaves**

Update:
- `getMostRecentAutosaveMeta()`
- `loadMostRecentPersistedAutosave()`
- `retireLegacyAutosaveIfRealAutosavesExist()`
- `listSaves({ includeAutoSave: true })`

The required rule is:

```ts
const loadableAutosaves = await listLoadableAutosaveMetas();
if (loadableAutosaves.length > 0) {
  await dbDelete(LEGACY_AUTO_SAVE_KEY);
  await syncLocalStorageBackup(undefined);
}
```

Do not retire legacy state when only orphaned metadata exists.

- [ ] **Step 5: Re-run the autosave tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/storage/save-manager.test.ts tests/ui/save-panel.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/storage/save-manager.ts tests/storage/save-manager.test.ts tests/ui/save-panel.test.ts
git commit -m "fix(hotfix): validate autosave payloads before legacy retirement"
```

---

### Task 10: Final Verification And Re-Review For The Remaining Hotfix Gaps

**Files:**
- Modify: this plan only if implementation deviates from the locked design

- [ ] **Step 1: Run focused quest privacy verification**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/quest-system.test.ts tests/ui/diplomacy-panel.test.ts tests/systems/discovery-system.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run focused save-panel and autosave verification**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/save-panel.test.ts tests/storage/save-manager.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run full regression and build**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run
./scripts/run-with-mise.sh yarn build
```

Expected: PASS.

- [ ] **Step 4: Perform a new formal review on `origin/main...HEAD`**

Review:

```bash
git diff origin/main...HEAD
git diff
```

Look specifically for:
- undiscovered city names still leaking through quest UI or notifications
- any user-controlled text still interpolated into `innerHTML`
- any autosave decision path that still assumes metadata implies a real payload
- hot-seat regressions from the quest-copy or save-panel rewires

- [ ] **Step 5: Comment on PR `#67` with the resolved findings**

Comment on the PR with:
- the three findings that were fixed
- the focused tests added
- the full-suite/build evidence

Do not close issues here. The issues stay open until the PR merges.

- [ ] **Step 6: Commit any final plan-only edits if needed**

```bash
git add docs/superpowers/plans/2026-04-08-fix-now-april-8th.md
git commit -m "docs(hotfix): extend april 8 review follow-up plan"
```

---

### Task 11: Fix Save-Panel Detached-DOM Rendering And Replace The Unrealistic Fixture

**Files:**
- Modify: `package.json`
- Modify: `yarn.lock`
- Modify: `src/ui/save-panel.ts`
- Modify: `tests/ui/save-panel.test.ts`
- Delete or reduce: `tests/ui/helpers/save-panel-fixture.ts`

**Root cause being fixed**

The remaining save-panel failure is a combined production-code and test-harness bug:

1. `createSavePanel(...)` builds a detached subtree, then asks the global `document` for `#save-slots` before the subtree is mounted.
2. In a real DOM, that lookup returns `null`, so no save cards are appended.
3. The current save-panel fixture masks the problem by globally registering ids from `innerHTML` even on detached nodes, which is not browser behavior.

The correct repair is to make the component own its subtree and to test it in a real DOM environment instead of extending the fake document further.

- [ ] **Step 1: Add a file-local real DOM environment for save-panel tests**

Add `jsdom` as a dev dependency without changing the repo-wide Vitest environment:

```bash
./scripts/run-with-mise.sh yarn add -D jsdom
```

Then rewrite `tests/ui/save-panel.test.ts` to start with:

```ts
// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
```

The repo should stay globally on `environment: 'node'`. Only the save-panel suite should opt into a real DOM.

- [ ] **Step 2: Replace the fake document fixture with real DOM setup**

Remove `installSavePanelDocumentMock()` from `tests/ui/save-panel.test.ts` and use `document.body` directly:

```ts
beforeEach(() => {
  document.body.innerHTML = '';
  mocks.listSaves.mockReset();
  mocks.hasAutoSave.mockReset();
  mocks.loadAutoSave.mockReset();
  mocks.deleteSaveEntry.mockReset();
  mocks.renameSave.mockReset();
});

afterEach(() => {
  document.body.innerHTML = '';
});

function mountContainer(): HTMLElement {
  const container = document.createElement('div');
  document.body.appendChild(container);
  return container;
}
```

Delete `tests/ui/helpers/save-panel-fixture.ts`. Do not replace it with another fake `document`. If any helper is still needed after the rewrite, it must only inspect real DOM nodes.

- [ ] **Step 3: Add red tests that reproduce the live bug and lock the correct behavior**

Add these real-DOM regressions to `tests/ui/save-panel.test.ts`:

```ts
it('renders listed saves into the mounted save-slots container in start mode', async () => {
  const container = mountContainer();
  mocks.hasAutoSave.mockResolvedValue(true);
  mocks.listSaves.mockResolvedValue([
    {
      id: 'autosave:game-1:9',
      name: 'Autosave Turn 9',
      civType: 'egypt',
      turn: 9,
      lastPlayed: '2026-04-08T12:00:00.000Z',
      kind: 'autosave',
      gameMode: 'solo',
      gameTitle: 'Desert Run',
    },
  ]);

  await createSavePanel(container, {
    onNewGame: () => {},
    onContinue: () => {},
    onLoadSlot: () => {},
  });

  expect(document.querySelectorAll('#save-panel [data-save-slot-card=\"true\"]')).toHaveLength(1);
  expect(document.body.textContent).toContain('Autosave Turn 9');
  expect(document.body.textContent).toContain('Desert Run');
});

it('renders only manual saves as overwrite targets in save mode', async () => {
  const container = mountContainer();
  mocks.hasAutoSave.mockResolvedValue(true);
  mocks.listSaves.mockResolvedValue([
    {
      id: 'autosave:game-1:9',
      name: 'Autosave Turn 9',
      civType: 'egypt',
      turn: 9,
      lastPlayed: '2026-04-08T12:00:00.000Z',
      kind: 'autosave',
      gameMode: 'solo',
      gameTitle: 'Desert Run',
    },
    {
      id: 'slot-1',
      name: 'Manual Save',
      civType: 'egypt',
      turn: 9,
      lastPlayed: '2026-04-08T12:00:00.000Z',
      kind: 'manual',
      gameMode: 'solo',
      gameTitle: 'Desert Run',
    },
  ]);

  await createSavePanel(container, {
    onNewGame: () => {},
    onContinue: () => {},
    onLoadSlot: () => {},
    onSaveToSlot: () => {},
  }, 'save');

  expect(document.body.textContent).toContain('Manual Save');
  expect(document.body.textContent).not.toContain('Autosave Turn 9');
});
```

Keep the interaction and injection coverage in the same real DOM:

```ts
it('loads the clicked autosave row instead of routing through continue', async () => {
  const container = mountContainer();
  const onContinue = vi.fn();
  const onLoadSlot = vi.fn();
  mocks.hasAutoSave.mockResolvedValue(true);
  mocks.listSaves.mockResolvedValue([
    {
      id: 'autosave:game-1:9',
      name: 'Autosave Turn 9',
      civType: 'egypt',
      turn: 9,
      lastPlayed: '2026-04-08T12:00:00.000Z',
      kind: 'autosave',
      gameMode: 'solo',
      gameTitle: 'Desert Run',
    },
  ]);

  await createSavePanel(container, {
    onNewGame: () => {},
    onContinue,
    onLoadSlot,
  });

  (document.querySelector('[data-role=\"load-slot\"]') as HTMLButtonElement).click();

  expect(onLoadSlot).toHaveBeenCalledWith('autosave:game-1:9');
  expect(onContinue).not.toHaveBeenCalled();
});

it('renders user-controlled save labels as literal text', async () => {
  const container = mountContainer();
  mocks.hasAutoSave.mockResolvedValue(false);
  mocks.listSaves.mockResolvedValue([
    {
      id: 'slot-1',
      name: '<span id=\"evil-save\">Owned</span>',
      civType: 'egypt',
      turn: 9,
      lastPlayed: '2026-04-08T12:00:00.000Z',
      kind: 'manual',
      gameMode: 'solo',
      gameTitle: '<span id=\"evil-title\">Injected</span>',
    },
  ]);

  await createSavePanel(container, {
    onNewGame: () => {},
    onContinue: () => {},
    onLoadSlot: () => {},
  });

  expect(document.getElementById('evil-save')).toBeNull();
  expect(document.getElementById('evil-title')).toBeNull();
  expect(document.body.textContent).toContain('<span id=\"evil-save\">Owned</span>');
});
```

Also add an explicit rerender regression:

```ts
it('rerenders the list after deleting one row and keeps the remaining rows visible', async () => {
  const container = mountContainer();
  mocks.hasAutoSave.mockResolvedValue(false);
  mocks.listSaves
    .mockResolvedValueOnce([
      {
        id: 'slot-1',
        name: 'Manual Save A',
        civType: 'egypt',
        turn: 9,
        lastPlayed: '2026-04-08T12:00:00.000Z',
        kind: 'manual',
        gameMode: 'solo',
        gameTitle: 'Desert Run',
      },
      {
        id: 'slot-2',
        name: 'Manual Save B',
        civType: 'egypt',
        turn: 10,
        lastPlayed: '2026-04-08T12:05:00.000Z',
        kind: 'manual',
        gameMode: 'solo',
        gameTitle: 'Desert Run',
      },
    ])
    .mockResolvedValueOnce([
      {
        id: 'slot-2',
        name: 'Manual Save B',
        civType: 'egypt',
        turn: 10,
        lastPlayed: '2026-04-08T12:05:00.000Z',
        kind: 'manual',
        gameMode: 'solo',
        gameTitle: 'Desert Run',
      },
    ]);

  await createSavePanel(container, {
    onNewGame: () => {},
    onContinue: () => {},
    onLoadSlot: () => {},
  });

  (document.querySelector('[data-role=\"delete-slot\"][data-slot-id=\"slot-1\"]') as HTMLButtonElement).click();
  await Promise.resolve();

  expect(mocks.deleteSaveEntry).toHaveBeenCalledWith('slot-1', 'manual');
  expect(document.querySelectorAll('#save-panel [data-save-slot-card=\"true\"]')).toHaveLength(1);
  expect(document.body.textContent).toContain('Manual Save B');
  expect(document.body.textContent).not.toContain('Manual Save A');
});
```

- [ ] **Step 4: Run the focused save-panel suite and confirm failure**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/save-panel.test.ts
```

Expected: FAIL because the current implementation still uses a global `document.getElementById('save-slots')` before mount.

- [ ] **Step 5: Refactor `createSavePanel(...)` so the component owns its subtree**

In `src/ui/save-panel.ts`, remove the mount-order-sensitive pattern:

```ts
panel.innerHTML = `...<div id="save-slots"></div>...`;
const saveSlots = document.getElementById('save-slots');
```

Replace it with component-local references. Either:

1. create `saveSlots` with `document.createElement('div')` and keep the reference, or
2. if the shell stays string-based, use `panel.querySelector('#save-slots')`.

Preferred shape:

```ts
const saveSlots = document.createElement('div');
saveSlots.id = 'save-slots';
saveSlots.style.cssText = 'display:flex;flex-direction:column;gap:8px;';

for (const save of displaySaves) {
  saveSlots.appendChild(createSlotCard(save, mode));
}
```

Do the same for event wiring: stop binding row buttons through `document.getElementById(...)` loops. Use panel-local event delegation or retained button references instead:

```ts
panel.addEventListener('click', async event => {
  const target = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-role]');
  if (!target) return;

  const slotId = target.dataset.slotId!;
  const slotKind = target.dataset.slotKind as 'manual' | 'autosave';
  const role = target.dataset.role;

  if (role === 'load-slot') {
    panel.remove();
    if (slotKind === 'autosave' && slotId === 'autosave') {
      callbacks.onContinue();
      return;
    }
    callbacks.onLoadSlot(slotId);
    return;
  }

  if (role === 'overwrite-slot') {
    panel.remove();
    callbacks.onSaveToSlot?.(slotId, target.dataset.slotName ?? '');
    return;
  }

  if (role === 'delete-slot') {
    await deleteSaveEntry(slotId, slotKind);
    panel.remove();
    await createSavePanel(container, callbacks, mode);
  }
});
```

Update `createSlotCard(...)` accordingly:

```ts
card.dataset.saveSlotCard = 'true';
primaryButton.dataset.role = mode === 'start' ? 'load-slot' : 'overwrite-slot';
primaryButton.dataset.slotId = save.id;
primaryButton.dataset.slotKind = save.kind === 'autosave' ? 'autosave' : 'manual';
primaryButton.dataset.slotName = save.name;
deleteButton.dataset.role = 'delete-slot';
deleteButton.dataset.slotId = save.id;
deleteButton.dataset.slotKind = save.kind === 'autosave' ? 'autosave' : 'manual';
```

This fixes the immediate rendering regression and removes the broader class of detached-tree/global-id bugs.

Apply the same rule to the panel’s static controls (`New Game`, `Continue`, `Save`, `Export`, `Import`): bind them from retained references or `panel.querySelector(...)`, not `document.getElementById(...)`. The component should be internally scoped everywhere except the initial `document.getElementById('save-panel')` removal of any pre-existing panel.

- [ ] **Step 6: Re-run the focused save-panel and autosave suites**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/save-panel.test.ts tests/storage/save-manager.test.ts
```

Expected: PASS.

- [ ] **Step 7: Run the full suite and build**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run
./scripts/run-with-mise.sh yarn build
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add package.json yarn.lock src/ui/save-panel.ts tests/ui/save-panel.test.ts
git add -u tests/ui/helpers/save-panel-fixture.ts
git commit -m "fix(hotfix): render save slots in real dom"
```

---

### Task 12: Centralize Minor-Civ Naming Privacy Across All Player-Facing Surfaces

**Files:**
- Create: `src/systems/minor-civ-presentation.ts`
- Modify: `src/main.ts`
- Modify: `src/ui/diplomacy-panel.ts`
- Create: `tests/systems/minor-civ-presentation.test.ts`
- Modify: `tests/ui/diplomacy-panel.test.ts`

**Root cause being fixed**

The remaining city-state leak is not limited to two lines in `handleHexTap(...)`. The actual problem is architectural:

1. Some city-state surfaces already gate on `hasDiscoveredMinorCiv(...)`.
2. Other surfaces still format `MINOR_CIV_DEFINITIONS.find(...).name` directly.
3. Several bus handlers prebuild one notification string and then fan it out to multiple players, which makes per-viewer privacy impossible.

As long as each panel or event handler invents its own city-state label, the privacy rule will drift again. The fix must centralize viewer-aware naming and force all player-facing minor-civ labels through it.

**Areas that need to change**

- `src/main.ts`
  - enemy-unit info panel owner label
  - combat preview owner label
  - `minor-civ:evolved`
  - `minor-civ:destroyed`
  - `minor-civ:guerrilla`
- `src/ui/diplomacy-panel.ts`
  - switch discovered city-state names to the shared helper for consistency, even though undiscovered rows are already omitted

**Areas audited and intentionally left unchanged**

- `src/renderer/city-renderer.ts`
  - safe because city names are drawn only when the city tile is currently visible
- `src/renderer/render-loop.ts`
  - territory overlay is still hidden by fog; this task is about name leaks, not fog parity
- quest rows / quest-issued notifications
  - already use the new quest privacy helpers and are covered by earlier tasks

- [ ] **Step 1: Add a pure presentation helper layer**

Create `src/systems/minor-civ-presentation.ts` with a narrow, testable API:

```ts
import type { GameState } from '@/core/types';
import { MINOR_CIV_DEFINITIONS } from './minor-civ-definitions';
import { hasDiscoveredMinorCiv } from './discovery-system';

export interface MinorCivPresentation {
  known: boolean;
  name: string;
  color: string;
}

export function getMinorCivPresentationForPlayer(
  state: Pick<GameState, 'minorCivs' | 'cities' | 'civilizations'>,
  viewerCivId: string,
  minorCivId: string,
  unknownName: string = 'City-State',
): MinorCivPresentation {
  const mc = (state as GameState).minorCivs?.[minorCivId];
  const def = mc ? MINOR_CIV_DEFINITIONS.find(d => d.id === mc.definitionId) : undefined;
  const known = mc ? hasDiscoveredMinorCiv(state as GameState, viewerCivId, minorCivId) : false;
  return {
    known,
    name: known ? (def?.name ?? unknownName) : unknownName,
    color: def?.color ?? '#888',
  };
}

export function formatMinorCivEventMessageForPlayer(
  state: Pick<GameState, 'minorCivs' | 'cities' | 'civilizations'>,
  viewerCivId: string,
  minorCivId: string,
  kind: 'evolved' | 'destroyed' | 'guerrilla',
): string {
  const presentation = getMinorCivPresentationForPlayer(state, viewerCivId, minorCivId);

  switch (kind) {
    case 'evolved':
      return presentation.known
        ? `A barbarian tribe formed the city-state of ${presentation.name}!`
        : 'A barbarian tribe formed a new city-state!';
    case 'destroyed':
      return presentation.known
        ? `${presentation.name} has fallen!`
        : 'A city-state has fallen!';
    case 'guerrilla':
      return presentation.known
        ? `${presentation.name} guerrilla fighters attack!`
        : 'City-state guerrilla fighters attack!';
  }
}
```

Do not add quest formatting here. Keep the file focused on city-state identity presentation.

- [ ] **Step 2: Add red tests for the helper and the audited leak paths**

Create `tests/systems/minor-civ-presentation.test.ts` with:

```ts
import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import { hexKey } from '@/systems/hex-utils';
import {
  getMinorCivPresentationForPlayer,
  formatMinorCivEventMessageForPlayer,
} from '@/systems/minor-civ-presentation';

describe('minor-civ-presentation', () => {
  it('uses a generic name for an undiscovered city-state', () => {
    const state = createNewGame(undefined, 'mc-present-undiscovered', 'small');
    const mcId = Object.keys(state.minorCivs)[0]!;

    expect(getMinorCivPresentationForPlayer(state, 'player', mcId)).toMatchObject({
      known: false,
      name: 'City-State',
    });
  });

  it('uses the real name after the city tile is discovered', () => {
    const state = createNewGame(undefined, 'mc-present-discovered', 'small');
    const mcId = Object.keys(state.minorCivs)[0]!;
    const city = state.cities[state.minorCivs[mcId].cityId];
    state.civilizations.player.visibility.tiles[hexKey(city.position)] = 'fog';

    expect(getMinorCivPresentationForPlayer(state, 'player', mcId).known).toBe(true);
    expect(getMinorCivPresentationForPlayer(state, 'player', mcId).name).not.toBe('City-State');
  });

  it('formats evolved notifications generically for undiscovered viewers', () => {
    const state = createNewGame(undefined, 'mc-present-evolved', 'small');
    const mcId = Object.keys(state.minorCivs)[0]!;

    expect(formatMinorCivEventMessageForPlayer(state, 'player', mcId, 'evolved'))
      .toBe('A barbarian tribe formed a new city-state!');
  });

  it('formats destroyed notifications generically for undiscovered viewers', () => {
    const state = createNewGame(undefined, 'mc-present-destroyed', 'small');
    const mcId = Object.keys(state.minorCivs)[0]!;

    expect(formatMinorCivEventMessageForPlayer(state, 'player', mcId, 'destroyed'))
      .toBe('A city-state has fallen!');
  });

  it('formats guerrilla notifications generically for undiscovered viewers', () => {
    const state = createNewGame(undefined, 'mc-present-guerrilla', 'small');
    const mcId = Object.keys(state.minorCivs)[0]!;

    expect(formatMinorCivEventMessageForPlayer(state, 'player', mcId, 'guerrilla'))
      .toBe('City-state guerrilla fighters attack!');
  });
});
```

Extend `tests/ui/diplomacy-panel.test.ts` with a consistency test:

```ts
it('uses the shared presentation helper for discovered city-state names', () => {
  // Set discovered visibility and assert the rendered city-state name matches the helper output.
});
```

The purpose of this extra test is not because diplomacy is currently broken; it is to prevent future divergence.

- [ ] **Step 3: Run the focused tests and verify they fail**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/minor-civ-presentation.test.ts tests/ui/diplomacy-panel.test.ts
```

Expected: FAIL because the helper file does not exist yet and the current code still hardcodes minor-civ names in `main.ts`.

- [ ] **Step 4: Route unit/combat labels through the shared helper**

In `src/main.ts`, replace both direct owner-name lookups:

```ts
const mc = Object.values(gameState.minorCivs ?? {}).find(m => m.id === enemyUnit.owner);
const mcDef = mc ? MINOR_CIV_DEFINITIONS.find(d => d.id === mc.definitionId) : undefined;
ownerName = mcDef?.name ?? 'City-State';
ownerColor = mcDef?.color ?? '#888';
```

with:

```ts
const presentation = getMinorCivPresentationForPlayer(gameState, gameState.currentPlayer, enemyUnit.owner, 'City-State');
ownerName = presentation.name;
ownerColor = presentation.color;
```

Do the same in the combat preview path for `defender.owner`.

- [ ] **Step 5: Fix the event handlers so they format per viewer instead of once globally**

In `src/main.ts`:

- `minor-civ:evolved`
  - stop building one `msg` before the hot-seat loop
  - for each `civId`, call `formatMinorCivEventMessageForPlayer(gameState, civId, data.minorCivId, 'evolved')`
  - for the on-screen notification, use `gameState.currentPlayer`

- `minor-civ:destroyed`
  - same per-viewer formatting using `kind: 'destroyed'`

- `minor-civ:guerrilla`
  - same per-viewer formatting using `kind: 'guerrilla'`
  - do **not** early-return just because the player has not discovered the city-state; the player still needs the warning, but the label must stay generic

Implementation shape:

```ts
bus.on('minor-civ:destroyed', (data: any) => {
  if (gameState.hotSeat && gameState.pendingEvents) {
    for (const civId of Object.keys(gameState.civilizations)) {
      const msg = formatMinorCivEventMessageForPlayer(gameState, civId, data.minorCivId, 'destroyed');
      collectEvent(gameState.pendingEvents, civId, { type: 'minor-civ:destroyed', message: msg, turn: gameState.turn });
    }
  }

  const currentMsg = formatMinorCivEventMessageForPlayer(gameState, gameState.currentPlayer, data.minorCivId, 'destroyed');
  showNotification(currentMsg, 'warning');
});
```

This is the key underlying fix. Per-viewer formatting has to happen before the message is materialized.

- [ ] **Step 6: Route diplomacy rows through the shared helper for consistency**

In `src/ui/diplomacy-panel.ts`, replace direct `def.name` usage in discovered city-state rows with:

```ts
const presentation = getMinorCivPresentationForPlayer(state, state.currentPlayer, mcId, 'City-State');
defName: presentation.name,
defColor: presentation.color,
```

This does not change current behavior for undiscovered rows because those rows are already filtered out. It prevents future helper drift.

- [ ] **Step 7: Add regression coverage for the actual leak paths**

Extend or create tests that prove the fix at the state/presentation layer:

```ts
it('does not reveal an undiscovered city-state name through the unit owner label helper', () => {
  const state = createNewGame(undefined, 'mc-owner-label', 'small');
  const mcId = Object.keys(state.minorCivs)[0]!;

  const presentation = getMinorCivPresentationForPlayer(state, 'player', mcId);

  expect(presentation.name).toBe('City-State');
});

it('formats guerrilla messages per viewer when one hot-seat player discovered the city-state and another did not', () => {
  const state = createHotSeatGame({
    playerCount: 2,
    mapSize: 'small',
    players: [
      { name: 'Alice', slotId: 'player-1', civType: 'egypt', isHuman: true },
      { name: 'Bob', slotId: 'player-2', civType: 'rome', isHuman: true },
    ],
  }, 'mc-hotseat-privacy');
  const mcId = Object.keys(state.minorCivs)[0]!;
  const city = state.cities[state.minorCivs[mcId].cityId];
  state.civilizations['player-1'].visibility.tiles[hexKey(city.position)] = 'fog';

  const discoveredMsg = formatMinorCivEventMessageForPlayer(state, 'player-1', mcId, 'guerrilla');
  const hiddenMsg = formatMinorCivEventMessageForPlayer(state, 'player-2', mcId, 'guerrilla');

  expect(discoveredMsg).not.toBe('City-state guerrilla fighters attack!');
  expect(hiddenMsg).toBe('City-state guerrilla fighters attack!');
});
```

- [ ] **Step 8: Run focused verification**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/minor-civ-presentation.test.ts tests/ui/diplomacy-panel.test.ts tests/systems/minor-civ-system.test.ts
```

Expected: PASS.

- [ ] **Step 9: Run full regression and build**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run
./scripts/run-with-mise.sh yarn build
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add src/systems/minor-civ-presentation.ts src/main.ts src/ui/diplomacy-panel.ts tests/systems/minor-civ-presentation.test.ts tests/ui/diplomacy-panel.test.ts
git commit -m "fix(hotfix): centralize minor civ privacy labels"
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
- Player-facing quest city privacy on real surfaces: `Task 7`
- DOM-safe save-panel rendering for user-controlled text: `Task 8`
- Loadable autosave validation before legacy retirement: `Task 9`
- Final re-review of the remaining hotfix gaps: `Task 10`
- Real-DOM save-panel rendering and test-harness correction: `Task 11`
- Minor-civ name privacy across all player-facing surfaces: `Task 12`
- Minor-civ notification-flow testability and coverage: `Task 13`

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
  - orphaned autosave metadata
  - retirement only after a loadable real autosave exists
  - save-mode exclusion
- Quest privacy scenarios covered:
  - discovered city keeps its real name
  - undiscovered city stays generic in the diplomacy panel
  - undiscovered city stays generic in quest-issued notifications
  - legacy/unsupported quest shapes still fall back to safe copy
- DOM safety scenarios covered:
  - save names rendered as text
  - campaign titles rendered as text
  - hot-seat player names rendered as text
  - regression tests detect injected ids in user-controlled labels
- Save-panel DOM realism scenarios covered:
  - detached subtree construction before mount
  - real slot cards rendered after mount in `start` mode
  - autosaves excluded from overwrite rows in `save` mode
  - clicked autosave row loads the selected slot instead of `Continue`
  - delete/rerender flow stays in sync with visible cards
  - tests use a real DOM environment instead of a fake global-id registry
- Minor-civ privacy scenarios covered:
  - unit info panel uses a generic city-state label before discovery
  - combat preview uses a generic city-state label before discovery
  - evolved notification is generic for undiscovered viewers
  - destroyed notification is generic for undiscovered viewers
  - guerrilla notification is generic for undiscovered viewers
  - hot-seat pending events are formatted per viewer instead of once globally
  - discovered viewers still receive the proper city-state name
- Notification test-shape scenarios covered:
  - helper-level privacy tests remain in place for focused naming logic
  - player-facing event tests cover `quest-issued`, `quest-completed`, `evolved`, `destroyed`, `allied`, `relationship-threshold`, `guerrilla`, and `quest-expired`
  - `main.ts` no longer owns city-state notification policy inline
  - hot-seat notification formatting is asserted through per-viewer helper outputs
  - current-player gating is asserted separately from name/privacy gating
- Wrapping scenarios covered:
  - terrain
  - fog
  - rivers
  - movement highlights
  - minor-civ territory
  - cities
  - units
- wrapped movement/pathfinding staying aligned with rendering

---

## Task 13: Extract And Exhaustively Test Minor-Civ Notification Flow

**Files:**
- Create: `src/ui/minor-civ-notifications.ts`
- Create: `tests/ui/minor-civ-notifications.test.ts`
- Modify: `src/main.ts`
- Audit only: `tests/systems/minor-civ-presentation.test.ts`
- Audit only: `tests/ui/diplomacy-panel.test.ts`

- [ ] **Step 1: Write the failing notification-flow tests**

Create `tests/ui/minor-civ-notifications.test.ts` with direct player-facing cases:

```ts
import { describe, expect, it } from 'vitest';
import { createHotSeatGame, createNewGame } from '@/core/game-state';
import type { GameState, Quest } from '@/core/types';
import { hexKey } from '@/systems/hex-utils';
import { getMinorCivNotification } from '@/ui/minor-civ-notifications';

describe('minor-civ-notifications', () => {
  it('hides quest-issued notifications from players who have not discovered the city-state', () => {
    const state = createNewGame(undefined, 'mc-quest-issued-hidden', 'small');
    const minorCivId = Object.keys(state.minorCivs)[0]!;
    const quest: Quest = {
      id: 'quest-gold',
      type: 'gift_gold',
      description: 'Gift 25 gold',
      target: { type: 'gift_gold', amount: 25 },
      reward: { relationshipBonus: 20 },
      progress: 0,
      status: 'active',
      turnIssued: 1,
      expiresOnTurn: 21,
    };

    const notification = getMinorCivNotification(state, 'player', {
      type: 'minor-civ:quest-issued',
      majorCivId: 'player',
      minorCivId,
      quest,
    });

    expect(notification).toBeNull();
  });

  it('keeps undiscovered city targets generic in quest-issued notifications', () => {
    const state = createNewGame(undefined, 'mc-quest-issued-generic-city', 'small');
    const minorCivId = Object.keys(state.minorCivs)[0]!;
    const city = state.cities[state.minorCivs[minorCivId].cityId];
    state.civilizations.player.visibility.tiles[hexKey(city.position)] = 'fog';

    const notification = getMinorCivNotification(state, 'player', {
      type: 'minor-civ:quest-issued',
      majorCivId: 'player',
      minorCivId,
      quest: {
        id: 'quest-city',
        type: 'defeat_units',
        description: 'Clear 2 units from Rome',
        target: { type: 'defeat_units', count: 2, nearPosition: { q: 7, r: 0 }, radius: 8, cityId: 'rome' },
        reward: { relationshipBonus: 20 },
        progress: 0,
        status: 'active',
        turnIssued: 1,
        expiresOnTurn: 21,
      },
    });

    expect(notification?.message).toContain('foreign city');
    expect(notification?.message).not.toContain('Rome');
  });

  it('formats evolved notifications generically for undiscovered viewers in hot-seat', () => {
    const state = createHotSeatGame({
      playerCount: 2,
      mapSize: 'small',
      players: [
        { name: 'Alice', slotId: 'player-1', civType: 'egypt', isHuman: true },
        { name: 'Bob', slotId: 'player-2', civType: 'rome', isHuman: true },
      ],
    }, 'mc-evolved-hotseat');
    const minorCivId = Object.keys(state.minorCivs)[0]!;
    const city = state.cities[state.minorCivs[minorCivId].cityId];
    state.civilizations['player-1'].visibility.tiles[hexKey(city.position)] = 'fog';

    const visible = getMinorCivNotification(state, 'player-1', { type: 'minor-civ:evolved', minorCivId });
    const hidden = getMinorCivNotification(state, 'player-2', { type: 'minor-civ:evolved', minorCivId });

    expect(visible?.message).not.toBe('A barbarian tribe formed a new city-state!');
    expect(hidden?.message).toBe('A barbarian tribe formed a new city-state!');
  });

  it('only returns allied notifications for the affected major civ', () => {
    const state = createNewGame(undefined, 'mc-ally-targeted', 'small');
    const minorCivId = Object.keys(state.minorCivs)[0]!;
    const city = state.cities[state.minorCivs[minorCivId].cityId];
    state.civilizations.player.visibility.tiles[hexKey(city.position)] = 'fog';

    const owner = getMinorCivNotification(state, 'player', {
      type: 'minor-civ:allied',
      majorCivId: 'player',
      minorCivId,
    });
    const other = getMinorCivNotification(state, 'ai-1', {
      type: 'minor-civ:allied',
      majorCivId: 'player',
      minorCivId,
    });

    expect(owner?.message).toMatch(/ally/i);
    expect(other).toBeNull();
  });

  it('keeps guerrilla warnings generic for undiscovered targets', () => {
    const state = createNewGame(undefined, 'mc-guerrilla-generic', 'small');
    const minorCivId = Object.keys(state.minorCivs)[0]!;

    const notification = getMinorCivNotification(state, 'player', {
      type: 'minor-civ:guerrilla',
      targetCivId: 'player',
      minorCivId,
    });

    expect(notification?.message).toBe('City-state guerrilla fighters attack!');
  });
});
```

- [ ] **Step 2: Run the new tests and verify they fail**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/minor-civ-notifications.test.ts
```

Expected: FAIL because `src/ui/minor-civ-notifications.ts` does not exist and `main.ts` still owns the notification policy inline.

- [ ] **Step 3: Extract the notification policy into a dedicated helper**

Create `src/ui/minor-civ-notifications.ts` alongside the existing legendary-wonder notification helper:

```ts
import type { GameState, NotificationEntry, Quest } from '@/core/types';
import { getQuestIssuedMessageForPlayer } from '@/systems/quest-system';
import {
  formatMinorCivEventMessageForPlayer,
  getMinorCivPresentationForPlayer,
} from '@/systems/minor-civ-presentation';

type MinorCivNotificationEvent =
  | { type: 'minor-civ:quest-issued'; majorCivId: string; minorCivId: string; quest: Quest }
  | { type: 'minor-civ:quest-completed'; majorCivId: string; minorCivId: string; reward: { gold?: number; science?: number } }
  | { type: 'minor-civ:evolved'; minorCivId: string }
  | { type: 'minor-civ:destroyed'; minorCivId: string }
  | { type: 'minor-civ:allied'; majorCivId: string; minorCivId: string }
  | { type: 'minor-civ:relationship-threshold'; majorCivId: string; minorCivId: string; newStatus: string }
  | { type: 'minor-civ:guerrilla'; targetCivId: string; minorCivId: string }
  | { type: 'minor-civ:quest-expired'; majorCivId: string; minorCivId: string };
```

Implement `getMinorCivNotification(state, viewerCivId, event): NotificationEntry | null` with these rules:
- `quest-issued`, `quest-completed`, `allied`, `relationship-threshold`, and `quest-expired` are targeted at one major civ only; return `null` for other viewers.
- `quest-issued`, `quest-completed`, `allied`, `relationship-threshold`, and `quest-expired` require the city-state to be discovered by the targeted viewer.
- `quest-issued` must call `getQuestIssuedMessageForPlayer(...)` so undiscovered foreign city targets stay generic.
- `evolved` and `destroyed` always produce a message, but their names are viewer-aware through `formatMinorCivEventMessageForPlayer(...)`.
- `guerrilla` only targets `targetCivId`, but still returns a generic warning if the city-state is undiscovered.

- [ ] **Step 4: Move `main.ts` bus handlers to the helper**

Replace the inline message construction in `src/main.ts` for:
- `minor-civ:quest-issued`
- `minor-civ:quest-completed`
- `minor-civ:evolved`
- `minor-civ:destroyed`
- `minor-civ:allied`
- `minor-civ:relationship-threshold`
- `minor-civ:guerrilla`
- `minor-civ:quest-expired`

with calls to `getMinorCivNotification(...)`.

Implementation shape:

```ts
const notification = getMinorCivNotification(gameState, data.majorCivId, {
  type: 'minor-civ:quest-completed',
  majorCivId: data.majorCivId,
  minorCivId: data.minorCivId,
  reward: data.reward,
});
if (gameState.hotSeat && gameState.pendingEvents && notification) {
  collectEvent(gameState.pendingEvents, data.majorCivId, { type: 'minor-civ:quest-done', message: notification.message, turn: gameState.turn });
}
if (data.majorCivId === gameState.currentPlayer && notification) {
  showNotification(notification.message, notification.type);
}
```

For hot-seat loops like `evolved`/`destroyed`, call `getMinorCivNotification(...)` inside the loop for each viewer.

- [ ] **Step 5: Audit the existing focused tests so they stay aligned**

Confirm `tests/systems/minor-civ-presentation.test.ts` remains narrowly about naming/presentation, not full notification policy.

Confirm `tests/ui/diplomacy-panel.test.ts` stays focused on panel rendering and continues to rely on the shared presentation helper instead of duplicating event-message policy.

Do **not** duplicate the new notification assertions there; keep the event-policy coverage in `tests/ui/minor-civ-notifications.test.ts`.

- [ ] **Step 6: Run focused verification**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/minor-civ-notifications.test.ts tests/systems/minor-civ-presentation.test.ts tests/ui/diplomacy-panel.test.ts
```

Expected: PASS.

- [ ] **Step 7: Run full regression and build**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run
./scripts/run-with-mise.sh yarn build
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add docs/superpowers/plans/2026-04-08-fix-now-april-8th.md src/ui/minor-civ-notifications.ts src/main.ts tests/ui/minor-civ-notifications.test.ts
git commit -m "test(hotfix): cover minor civ notification flow"
```
