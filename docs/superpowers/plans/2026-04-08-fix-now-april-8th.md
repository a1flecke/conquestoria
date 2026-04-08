# Fix-Now-April-8th Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the April 8 gameplay blockers that leak hidden information, generate impossible quests, hide valid saves from players, allow nonsensical first-turn wars, and make horizontal wrap presentation disagree with movement rules.

**Architecture:** Keep this milestone tightly scoped to correctness and UX repair, not redesign. Introduce one shared discovery/privacy helper layer, one synthesized autosave metadata path, one explicit AI early-war gate, and one shared horizontal-wrap helper path so the fixes land in stable seams instead of scattered special cases. Preserve the repository’s event-driven pattern, serializable state objects, and hot-seat rule that all player-facing logic must key off `state.currentPlayer`.

**Tech Stack:** TypeScript, Vitest, Canvas 2D, IndexedDB/localStorage persistence, GitHub issue triage

---

## Milestone Contract

**Milestone name:** `fix-now-april-8th`

**Issues fixed in this milestone**
- `#47` Initial diplomacy still shows civilizations not met
- `#49` Saved games do not appear in the list
- `#50` Computer declared war after first turn
- `#55` Weird starting map state / visible wrap seams
- `#57` Receiving requests from city-states not met
- `#58` Diplomacy shows many cities/civs not met
- `#63` Cannot move onto wrapped desert-edge tiles
- `#66` Quest generation produces invalid or unsupported requests

**Issues explicitly out of scope**
- `#48`, `#56`, `#59`, `#60`, `#61`, `#64`, `#65`

**Already resolved on `main`**
- `#45`
- `#46`

---

## Success Criteria

The milestone is complete only when all of the following are true:

1. The diplomacy panel no longer leaks unmet major-civ names or undiscovered city-states, including in hot-seat.
2. City-state quests cannot be issued, displayed, or expire for a player who has not discovered that city-state.
3. Generated quests are grounded in real current-world targets. No unsupported `trade_route` quests appear, and combat/camp quests require actual nearby targets.
4. The start-screen save list visibly includes a loadable autosave entry when one exists, without turning autosave into an invalid overwrite/delete target in save mode.
5. AI civs cannot declare war on turn 1 unless a deliberately narrow “extreme hostility and direct contact” exception is satisfied, and aggressive AIs still become dangerous later.
6. Wrapped maps render fog consistently at ghost edges, and wrapped edge-to-edge movement/pathfinding works on the same tiles the player can click.
7. Every issue above has at least one regression test for the exact failure mode, and hot-seat-sensitive behavior uses `state.currentPlayer`.

---

## Root-Cause Summary

| Issue(s) | Root cause | Fix shape |
| --- | --- | --- |
| `#47`, `#57`, `#58` | No shared notion of “discovered/met”; UI and quest code read raw global state | Add shared discovery helpers and route panel/quest/notification decisions through them |
| `#66` | Quest generator emits fallback or placeholder targets that are not backed by the live world | Validate target generation against actual nearby camps/units and disable unsupported quest types |
| `#49` | Autosave exists on a separate code path from the save-slot list | Synthesize autosave metadata into the load list used by the start screen |
| `#50` | AI war logic only looks at relationship and military advantage | Add early-turn/contact sanity gates while preserving post-grace aggression |
| `#55`, `#63` | Terrain renderer supports horizontal ghost tiles, but fog and movement/pathing do not share the same wrap semantics | Add shared wrap helpers for ghost rendering and canonical wrapped neighbors/pathing |

---

## File Structure

### New Files
- Create: `src/systems/discovery-system.ts`
  - Shared “has discovered / has met” helpers derived from existing visibility and live contact state.
- Create: `tests/systems/discovery-system.test.ts`
  - Unit coverage for major-civ contact and minor-civ discovery.
- Create: `tests/ui/save-panel.test.ts`
  - UI regression tests for autosave visibility and ordering.
- Create: `tests/ui/helpers/save-panel-fixture.ts`
  - Small DOM/storage test harness for the save panel.
- Create: `tests/storage/save-manager.test.ts`
  - Focused save-manager coverage for synthesized autosave metadata and list ordering.
- Create: `src/renderer/wrap-rendering.ts`
  - Shared helper that enumerates horizontal ghost coordinates for renderers.
- Create: `tests/renderer/fog-renderer.test.ts`
  - Focused canvas-free regression coverage for wrap ghost fog overlays.

### Existing Files To Modify
- Modify: `src/ui/diplomacy-panel.ts`
- Modify: `src/ui/advisor-system.ts`
- Modify: `src/main.ts`
- Modify: `src/systems/minor-civ-system.ts`
- Modify: `src/systems/quest-system.ts`
- Modify: `src/storage/save-manager.ts`
- Modify: `src/ui/save-panel.ts`
- Modify: `src/core/types.ts`
- Modify: `src/ai/ai-diplomacy.ts`
- Modify: `src/ai/ai-personality.ts`
- Modify: `src/ai/basic-ai.ts`
- Modify: `src/renderer/fog-renderer.ts`
- Modify: `src/renderer/hex-renderer.ts`
- Modify: `src/systems/hex-utils.ts`
- Modify: `src/systems/unit-system.ts`

### Existing Tests To Modify
- Modify: `tests/ui/diplomacy-panel.test.ts`
- Modify: `tests/systems/minor-civ-system.test.ts`
- Modify: `tests/systems/quest-system.test.ts`
- Modify: `tests/storage/save-persistence.test.ts`
- Modify: `tests/ai/ai-diplomacy.test.ts`
- Modify: `tests/ai/ai-personality.test.ts`
- Modify: `tests/ai/basic-ai.test.ts`
- Modify: `tests/ui/fog-leak.test.ts`
- Modify: `tests/systems/hex-utils.test.ts`
- Modify: `tests/systems/unit-system.test.ts`

---

## Design Decisions Locked In

### Discovery / Privacy Model

- Do **not** add a brand-new persistent diplomacy-contact save structure for this hotfix milestone.
- Major-civ “met” state is derived from legitimate in-world evidence:
  - the viewer has ever explored one of the target civ’s city/owned tiles, or
  - the viewer can currently see one of the target civ’s units, or
  - the viewer is already in a real treaty/war relationship with that civ.
- Minor-civ discovery is derived from whether the viewer has explored the city-state’s city tile.
- Unknown major civs remain present in diplomacy as masked placeholders (`Unknown Civilization N`) so the player can see there are rivals without learning who they are.
- Undiscovered minor civs are omitted entirely from player-facing diplomacy and quest messaging.

### Quest Validity

- `trade_route` stays in the type union for backward compatibility, but quest generation must stop emitting it until a real player trade-route gameplay loop exists.
- Quest generation becomes “skip invalid targets, do not fallback to a nonsense target”.
- If no supported valid quest exists for the current minor civ and player, no quest is issued that turn.
- “Nearby” is anchored on the minor civ’s city position, not `{ q: 0, r: 0 }`.

### Autosave UX

- Autosave becomes a first-class entry in the **start-mode load list**.
- Autosave does **not** become an overwrite/delete row in save mode.
- Keep the existing `Continue` button for fast resume, but the “Saved Games” list must also visibly contain the autosave row so the player does not think no saves exist.

### AI War Gate

- The AI may not declare opportunistic war in the opening turns based solely on raw strength.
- The gate must consider:
  - current turn
  - whether the target is actually met/known
  - whether there is border/direct contact pressure
  - relationship level
- Aggressive personalities must still be able to declare war later; this is a gate, not a pacification rewrite.

### Wrap Consistency

- Canonical map state remains stored at wrapped coordinates inside map bounds.
- Renderers may draw ghost copies at `q +/- map.width`, but fog overlays must use the same ghost-coordinate enumeration.
- Movement/pathfinding must use wrapped neighbor generation and wrapped distance heuristics when `map.wrapsHorizontally` is true.

---

## Task 1: Add Shared Discovery Helpers And Use Them In Diplomacy Privacy

**Issues:** `#47`, `#57`, `#58`

**Files:**
- Create: `src/systems/discovery-system.ts`
- Create: `tests/systems/discovery-system.test.ts`
- Modify: `src/ui/diplomacy-panel.ts`
- Modify: `src/ui/advisor-system.ts`
- Modify: `tests/ui/diplomacy-panel.test.ts`

- [ ] **Step 1: Write the failing discovery helper tests**

Add `tests/systems/discovery-system.test.ts` with cases for:

```ts
it('treats a civ as met after one of its city tiles has been explored', () => {
  expect(hasMetCivilization(state, 'player', 'ai-1')).toBe(true);
});

it('does not treat an unseen rival as met when relationship data exists but no contact exists', () => {
  expect(hasMetCivilization(state, 'player', 'ai-1')).toBe(false);
});

it('treats a minor civ as discovered only after its city tile is visible or fogged', () => {
  expect(hasDiscoveredMinorCiv(state, 'player', 'mc-sparta')).toBe(false);
});
```

- [ ] **Step 2: Run the new discovery tests and confirm failure**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/discovery-system.test.ts
```

Expected: FAIL because the helper module does not exist yet.

- [ ] **Step 3: Implement the shared discovery helper module**

Create `src/systems/discovery-system.ts` with small focused helpers:

```ts
export function hasExploredCoord(state: GameState, viewerCivId: string, coord: HexCoord): boolean;
export function hasDiscoveredMinorCiv(state: GameState, viewerCivId: string, minorCivId: string): boolean;
export function hasMetCivilization(state: GameState, viewerCivId: string, targetCivId: string): boolean;
```

Rules:
- use `visible` or `fog` as explored
- scan target cities / owned tiles / currently visible units
- allow existing treaty or war state to count as contact
- never hardcode `player`; always accept `viewerCivId`

- [ ] **Step 4: Add failing diplomacy-panel tests for unmet majors and undiscovered minor civs**

Extend `tests/ui/diplomacy-panel.test.ts` with cases like:

```ts
it('renders unmet major civs as Unknown Civilization placeholders', () => {
  expect(rendered).toContain('Unknown Civilization 1');
  expect(rendered).not.toContain('Rome');
});

it('omits undiscovered city-states from the panel', () => {
  expect(rendered).not.toContain('Sparta');
});
```

- [ ] **Step 5: Update the diplomacy panel to use the shared helper**

In `src/ui/diplomacy-panel.ts`:
- import the shared helper
- mask unmet major names and bonus text
- keep relationship/treaty actions hidden for unknown rivals except the placeholder row shell
- skip undiscovered minor civ rows entirely
- preserve the existing breakaway row behavior for a breakaway the player already knows

Use placeholder copy shaped like:

```ts
const displayName = hasMetCivilization(state, state.currentPlayer, civId)
  ? civ.name
  : `Unknown Civilization ${unknownIndex}`;
```

- [ ] **Step 6: Replace the local advisor minor-civ discovery logic with the shared helper**

Update `src/ui/advisor-system.ts` so its local `isMinorCivDiscovered` check is removed and replaced by the shared helper. This prevents discovery logic from diverging across systems.

- [ ] **Step 7: Re-run focused discovery and diplomacy tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/discovery-system.test.ts tests/ui/diplomacy-panel.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/systems/discovery-system.ts src/ui/diplomacy-panel.ts src/ui/advisor-system.ts tests/systems/discovery-system.test.ts tests/ui/diplomacy-panel.test.ts
git commit -m "fix(hotfix): gate diplomacy by discovery state"
```

---

## Task 2: Gate Minor-Civ Quest Issuance And Notifications By Discovery

**Issues:** `#57`, partial support for `#58`

**Files:**
- Modify: `src/systems/minor-civ-system.ts`
- Modify: `src/main.ts`
- Modify: `tests/systems/minor-civ-system.test.ts`

- [ ] **Step 1: Add failing minor-civ tests for undiscovered quest issuance**

Add tests such as:

```ts
it('does not issue a quest to a player who has not discovered the minor civ', () => {
  expect(mc.activeQuests.player).toBeUndefined();
});

it('issues a quest after the player has discovered the city-state', () => {
  expect(mc.activeQuests.player).toBeDefined();
});
```

- [ ] **Step 2: Run the minor-civ regression tests and confirm failure**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/minor-civ-system.test.ts
```

Expected: FAIL on the new undiscovered-quest assertions.

- [ ] **Step 3: Change quest issuance to skip undiscovered players entirely**

In `src/systems/minor-civ-system.ts`, before generating or expiring quests for a civ:

```ts
if (!hasDiscoveredMinorCiv(state, civId, mc.id)) {
  continue;
}
```

Important:
- do not create hidden background quests that can expire unseen
- do not penalize undiscovered players for unseen quest expiry
- leave already-existing discovered-player quest behavior unchanged

- [ ] **Step 4: Harden player-facing notifications against discovery leaks**

Update the `minor-civ:*` event handlers in `src/main.ts` so they only show/collect quest-related notifications when the target player has discovered the relevant minor civ. This is a second-line guard against future leakage even if an emitter regresses later.

- [ ] **Step 5: Re-run focused minor-civ tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/minor-civ-system.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/systems/minor-civ-system.ts src/main.ts tests/systems/minor-civ-system.test.ts
git commit -m "fix(hotfix): prevent undiscovered city-state quest leaks"
```

---

## Task 3: Rebuild Quest Targeting So It Only Emits Supported Real-World Quests

**Issues:** `#57`, `#66`

**Files:**
- Modify: `src/systems/quest-system.ts`
- Modify: `src/systems/minor-civ-system.ts`
- Modify: `tests/systems/quest-system.test.ts`
- Modify: `tests/systems/minor-civ-system.test.ts`

- [ ] **Step 1: Add failing quest-generation tests for invalid targets**

Extend `tests/systems/quest-system.test.ts` with:

```ts
it('does not emit trade_route quests while the trade-route gameplay loop is unsupported', () => {
  expect(quest?.type).not.toBe('trade_route');
});

it('returns null when no nearby hostile units exist for a defeat_units quest', () => {
  expect(buildQuestTarget('defeat_units', minorCivId, state)).toBeNull();
});

it('only targets barbarian camps within radius of the issuing city-state', () => {
  expect((quest!.target as any).campId).toBe('camp-nearby');
});
```

- [ ] **Step 2: Run the quest tests and confirm failure**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/quest-system.test.ts tests/systems/minor-civ-system.test.ts
```

Expected: FAIL because `trade_route` and placeholder coordinates are still possible.

- [ ] **Step 3: Expand quest target generation to use live game state**

Update `generateQuest(...)` and its helper input so target building has enough context:

```ts
type QuestGenerationState = Pick<GameState, 'barbarianCamps' | 'era' | 'cities' | 'minorCivs' | 'units' | 'civilizations' | 'map'>;
```

Inside `quest-system.ts`:
- locate the minor civ city position from `minorCivId`
- only emit `destroy_camp` when a real camp exists within the configured radius
- only emit `defeat_units` when real hostile units exist near that city
- remove `trade_route` from active generation weights for now by setting its runtime weight to `0`
- if no valid quest type has a real target, return `null`

- [ ] **Step 4: Make quest descriptions reflect the validated target**

Update descriptions so they remain truthful after validation, for example:

```ts
'Destroy a nearby barbarian camp'
'Defeat 2 enemy units near our territory'
```

Do not add fake coordinates or unsupported route wording.

- [ ] **Step 5: Re-run focused quest tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/quest-system.test.ts tests/systems/minor-civ-system.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/systems/quest-system.ts src/systems/minor-civ-system.ts tests/systems/quest-system.test.ts tests/systems/minor-civ-system.test.ts
git commit -m "fix(hotfix): validate city-state quest targets"
```

---

## Task 4: Surface Autosave As A Real Load Entry Without Polluting Save Mode

**Issue:** `#49`

**Files:**
- Create: `tests/ui/helpers/save-panel-fixture.ts`
- Create: `tests/ui/save-panel.test.ts`
- Create: `tests/storage/save-manager.test.ts`
- Modify: `src/core/types.ts`
- Modify: `src/storage/save-manager.ts`
- Modify: `src/ui/save-panel.ts`
- Modify: `tests/storage/save-persistence.test.ts`

- [ ] **Step 1: Add failing save-manager and save-panel tests**

Create `tests/ui/save-panel.test.ts` and `tests/storage/save-manager.test.ts` with cases:

```ts
it('lists autosave as the first loadable saved-game entry in start mode', async () => {
  expect(rendered).toContain('Autosave');
});

it('does not show autosave as an overwrite/delete row in save mode', async () => {
  expect(rendered).not.toContain('Overwrite Autosave');
});

it('keeps backup and import actions below the load list', async () => {
  expect(exportIndex).toBeGreaterThan(savedGamesIndex);
});
```

Also add a persistence-level test to confirm autosave metadata can be synthesized from the stored autosave state.

- [ ] **Step 2: Run the new save tests and confirm failure**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/storage/save-manager.test.ts tests/storage/save-persistence.test.ts tests/ui/save-panel.test.ts
```

Expected: FAIL because autosave is not part of the list contract yet.

- [ ] **Step 3: Extend the save metadata contract to distinguish autosave**

Modify `src/core/types.ts`:

```ts
export interface SaveSlotMeta {
  id: string;
  name: string;
  civType: string;
  turn: number;
  lastPlayed: string;
  kind?: 'manual' | 'autosave';
  gameMode?: GameMode;
  playerCount?: number;
  playerNames?: string[];
}
```

This is a minimal type extension, not a persistence rewrite.

- [ ] **Step 4: Synthesize autosave metadata in the save manager**

In `src/storage/save-manager.ts`:
- add a small helper like `getAutoSaveMeta()`
- modify `listSaves()` to accept an option shape:

```ts
export async function listSaves(options?: { includeAutoSave?: boolean }): Promise<SaveSlotMeta[]>
```

Rules:
- when `includeAutoSave` is true and autosave exists, prepend a synthesized row with `kind: 'autosave'`
- do not persist a separate autosave metadata record
- preserve existing manual-slot sort order after the autosave row

- [ ] **Step 5: Update the save panel UI and actions**

In `src/ui/save-panel.ts`:
- call `listSaves({ includeAutoSave: mode === 'start' })`
- render autosave with a clear label, for example `Autosave`
- keep `Continue` as a shortcut if desired, but the list itself must visibly include the autosave row
- in save mode, filter out `kind === 'autosave'` rows from overwrite/delete controls
- visually demote backup/import below the list, not alongside the primary load surface

- [ ] **Step 6: Re-run focused save tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/storage/save-manager.test.ts tests/storage/save-persistence.test.ts tests/ui/save-panel.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/core/types.ts src/storage/save-manager.ts src/ui/save-panel.ts tests/storage/save-manager.test.ts tests/storage/save-persistence.test.ts tests/ui/helpers/save-panel-fixture.ts tests/ui/save-panel.test.ts
git commit -m "fix(hotfix): surface autosave in save list"
```

---

## Task 5: Add AI Early-War Sanity Gates Without Flattening Aggressive Personalities

**Issue:** `#50`

**Files:**
- Modify: `src/ai/ai-diplomacy.ts`
- Modify: `src/ai/ai-personality.ts`
- Modify: `src/ai/basic-ai.ts`
- Modify: `tests/ai/ai-diplomacy.test.ts`
- Modify: `tests/ai/ai-personality.test.ts`
- Modify: `tests/ai/basic-ai.test.ts`

- [ ] **Step 1: Add failing AI unit and integration tests**

Add/extend tests such as:

```ts
it('does not declare war on turn 1 against an unmet or low-pressure rival', () => {
  expect(decisions.find(d => d.action === 'declare_war')).toBeUndefined();
});

it('aggressive civ can still declare war after the grace period when hostile and stronger', () => {
  expect(shouldDeclareWar(aggressive, -60, 1.6, 12, true, true)).toBe(true);
});

it('basic AI leaves diplomacy peaceful on the opening turn in the default start state', () => {
  expect(result.civilizations['ai-1'].diplomacy.atWarWith).toHaveLength(0);
});
```

- [ ] **Step 2: Run the AI tests and confirm failure**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/ai/ai-personality.test.ts tests/ai/ai-diplomacy.test.ts tests/ai/basic-ai.test.ts
```

Expected: FAIL on the new early-war assertions.

- [ ] **Step 3: Expand the war-declaration heuristic signature**

Change `shouldDeclareWar(...)` in `src/ai/ai-personality.ts` to accept:

```ts
shouldDeclareWar(
  personality,
  relationship,
  militaryAdvantage,
  currentTurn,
  hasMetTarget,
  hasBorderPressure,
)
```

Rules:
- immediately return `false` if `hasMetTarget` is `false`
- before the grace turn, require an extreme exception path only if hostility is severe and border pressure is present
- after the grace turn, allow aggressive personalities to resume normal hostile behavior

- [ ] **Step 4: Thread the extra context through AI decision evaluation**

In `src/ai/ai-diplomacy.ts`, extend `evaluateDiplomacy(...)` to receive `currentTurn` and `pressureByCiv`.

In `src/ai/basic-ai.ts`, compute `pressureByCiv` for each target using:
- shared discovery/contact state
- current border or visible military pressure near the rival

Then pass the richer context to `evaluateDiplomacy(...)`.

- [ ] **Step 5: Re-run focused AI tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/ai/ai-personality.test.ts tests/ai/ai-diplomacy.test.ts tests/ai/basic-ai.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/ai/ai-diplomacy.ts src/ai/ai-personality.ts src/ai/basic-ai.ts tests/ai/ai-diplomacy.test.ts tests/ai/ai-personality.test.ts tests/ai/basic-ai.test.ts
git commit -m "fix(hotfix): add ai early-war sanity gates"
```

---

## Task 6: Unify Horizontal Wrap Rendering And Movement Rules

**Issues:** `#55`, `#63`

**Files:**
- Create: `src/renderer/wrap-rendering.ts`
- Create: `tests/renderer/fog-renderer.test.ts`
- Modify: `src/renderer/fog-renderer.ts`
- Modify: `src/renderer/hex-renderer.ts`
- Modify: `src/systems/hex-utils.ts`
- Modify: `src/systems/unit-system.ts`
- Modify: `tests/ui/fog-leak.test.ts`
- Modify: `tests/systems/hex-utils.test.ts`
- Modify: `tests/systems/unit-system.test.ts`

- [ ] **Step 1: Add failing wrap helper, fog, and movement tests**

Add tests such as:

```ts
it('returns wrapped neighbors across the left/right boundary when the map wraps', () => {
  expect(getWrappedHexNeighbors({ q: 0, r: 5 }, 30, true)).toContainEqual({ q: 29, r: 5 });
});

it('draws fog overlays for ghost wrap tiles using the same source visibility as the base tile', () => {
  expect(drawCalls).toContain('ghost-right-edge');
});

it('finds a path across a wrapped horizontal edge', () => {
  expect(path).toEqual([{ q: 29, r: 5 }, { q: 0, r: 5 }]);
});
```

- [ ] **Step 2: Run the wrap-related tests and confirm failure**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/hex-utils.test.ts tests/systems/unit-system.test.ts tests/renderer/fog-renderer.test.ts tests/ui/fog-leak.test.ts
```

Expected: FAIL because neighbor/path/fog wrap behavior is inconsistent.

- [ ] **Step 3: Add shared wrap helpers**

In `src/systems/hex-utils.ts`, add:

```ts
export function getWrappedHexNeighbors(coord: HexCoord, mapWidth: number, wrapsHorizontally: boolean): HexCoord[];
export function wrappedHexDistance(a: HexCoord, b: HexCoord, mapWidth: number, wrapsHorizontally: boolean): number;
```

In `src/renderer/wrap-rendering.ts`, add a small helper that yields render coordinates for base tiles plus left/right ghost copies near the edge.

- [ ] **Step 4: Update fog rendering to reuse the same ghost-coordinate enumeration as terrain**

Refactor `src/renderer/hex-renderer.ts` to use the new shared helper, then update `src/renderer/fog-renderer.ts` to iterate the same ghost positions and draw overlays based on the canonical tile’s visibility state.

This step fixes the seam without changing map data.

- [ ] **Step 5: Update movement range and pathfinding to use wrapped neighbors**

In `src/systems/unit-system.ts`:
- canonicalize neighbor lookups when the map wraps
- use wrapped neighbors in `getMovementRange(...)`
- use `wrappedHexDistance(...)` as the A* heuristic in `findPath(...)`
- keep non-wrapping maps on the current behavior

- [ ] **Step 6: Re-run focused wrap tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/hex-utils.test.ts tests/systems/unit-system.test.ts tests/renderer/fog-renderer.test.ts tests/ui/fog-leak.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/wrap-rendering.ts src/renderer/fog-renderer.ts src/renderer/hex-renderer.ts src/systems/hex-utils.ts src/systems/unit-system.ts tests/renderer/fog-renderer.test.ts tests/ui/fog-leak.test.ts tests/systems/hex-utils.test.ts tests/systems/unit-system.test.ts
git commit -m "fix(hotfix): unify wrapped map fog and movement"
```

---

## Task 7: Full Regression Sweep, Issue Verification, And Release Gate

**Files:**
- Modify: this plan only if implementation deviated from the approved design

- [ ] **Step 1: Run the full test suite**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run
```

Expected: PASS across the full suite.

- [ ] **Step 2: Run the production build**

Run:

```bash
./scripts/run-with-mise.sh yarn build
```

Expected: PASS.

- [ ] **Step 3: Do a spec-to-implementation issue audit**

Before closing anything, verify:
- `#47` / `#58`: unmet civ masking works in solo and hot-seat
- `#57`: undiscovered city-states cannot issue quests or notifications
- `#66`: no unsupported/placeholder quests are generated
- `#49`: autosave is visible in the list and still quick-resumable
- `#50`: AI no longer opens with irrational war
- `#55` / `#63`: wrapped edges match render + movement behavior

- [ ] **Step 4: Update GitHub issue comments with shipped fix details and close fixed issues**

Comment on the fix-now issues with:
- commit or PR reference
- short note on the final behavior
- any remaining non-blocking caveat, if present

Then close:
- `#47`, `#49`, `#50`, `#55`, `#57`, `#58`, `#63`, `#66`

- [ ] **Step 5: Commit any doc-only release-gate adjustments**

```bash
git add docs/superpowers/plans/2026-04-08-fix-now-april-8th.md
git commit -m "docs(hotfix): finalize april 8 implementation plan"
```

---

## Spec Coverage Checklist

- Discovery/privacy is covered by `Task 1` and `Task 2`.
- Quest validity is covered by `Task 3`.
- Save discoverability and start-screen UX are covered by `Task 4`.
- AI first-turn war sanity is covered by `Task 5`.
- Wrapped-edge render and movement consistency are covered by `Task 6`.
- Final correctness, issue closeout, and verification are covered by `Task 7`.

No issue in the `fix-now-april-8th` milestone is left without an explicit task.

---

## Placeholder Scan

- No `TODO`, `TBD`, or “implement later” placeholders remain in this plan.
- Unsupported `trade_route` quests are explicitly disabled for this milestone instead of hand-waved.
- Autosave behavior is explicitly split between start mode and save mode.
- The discovery/privacy model is explicitly defined instead of deferred to implementation taste.

---

## Execution Notes

- Prefer one branch for the whole `fix-now-april-8th` milestone, but keep commits task-scoped.
- Do not broaden this milestone into the deferred `M4e` or `M5` items.
- If any task uncovers a missing dependency outside this scope, stop and update this plan before coding around it.
