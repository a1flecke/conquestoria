# Issue 725 Legendary-Wonder Landmarks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Terracotta Army, Crac des Chevaliers, and NORAD generic map glyphs with distinct, accessible bespoke Canvas landmarks.

**Architecture:** Existing metadata maps each wonder to a stable asset key, and the Canvas asset registry maps that key to one draw function. The generic landmark renderer continues to own construction, fog, known-rival, low-zoom, slotting, and reduced-motion behavior; no new rendering path, save data, or gameplay behavior is added.

**Tech Stack:** TypeScript, Canvas 2D, Vitest, existing legendary-wonder presentation and renderer systems.

---

## File structure

- Modify: `docs/claude-design-sprites-prompt.md` — append the Issue 725 Canvas-landmark reference brief.
- Modify: `src/systems/legendary-wonder-landmark-catalog.ts` — attach three stable bespoke asset keys.
- Modify: `src/renderer/wonders/legendary-wonder-bespoke-assets.ts` — add keys, registry entries, and draw functions.
- Modify: `tests/systems/legendary-wonder-landmark-catalog.test.ts` — replace deferred fallback coverage.
- Modify: `tests/renderer/legendary-wonder-renderer.test.ts` — prove routing, unique geometry, static reduced motion, and retained construction fallback.
- Modify: `tests/systems/legendary-wonder-map-presentation.test.ts` — prove no lost-race map landmark.
- Modify: `tests/systems/wonder-codex/presentation.test.ts` — prove all three cards remain Codex-readable after a lost race.

### Task 1: Record the sprite-design-system reference brief

**Files:**
- Modify: `docs/claude-design-sprites-prompt.md`

- [ ] **Step 1: Append the dated Issue 725 reference brief**

Append a `2026-08-30 — Issue 725 legendary-wonder map-landmarks reference brief` section. Identify the output as three **stationary Canvas landmarks**, not unit sprites; cite the raw sprite-system/design-system URLs; require flat layered geometry, warm material palette, dark outlines, no gradients, blur, text, logos, or faction-specific colors.

```text
Terracotta Army: low earthen mausoleum wall + staggered clay soldier ranks and spear tips.
Crac des Chevaliers: stepped curtain walls + twin gate towers + central keep.
NORAD: compact command base + dish/dome + antenna mast + bounded radar arcs.
```

Its animation clause must say: `No attack, recoil, walk, thrust, locomotion, or generic unit motion. Only optional ambient glint/radar sweep; reduced motion must draw the same information without time variance.`

- [ ] **Step 2: Check the brief against the approved design**

Run:

```bash
rg -n 'Terracotta Army|Crac des Chevaliers|NORAD|locomotion|reduced motion' docs/claude-design-sprites-prompt.md
```

Expected: one Issue 725 section names all three landmarks and explicitly forbids unit animation.

- [ ] **Step 3: Commit the reference brief**

```bash
git add docs/claude-design-sprites-prompt.md
git commit -m "docs(725): add wonder landmark art brief"
```

### Task 2: Write the failing catalog and renderer tests

**Files:**
- Modify: `tests/systems/legendary-wonder-landmark-catalog.test.ts`
- Modify: `tests/renderer/legendary-wonder-renderer.test.ts`

- [ ] **Step 1: Replace the deferred-asset assertions with the desired catalog contract**

In the existing catalog test, replace the three `toBeUndefined()` assertions with:

```ts
expect(getLegendaryWonderLandmarkMetadata('terracotta-army').assetKey).toBe('terracotta-army-bespoke');
expect(getLegendaryWonderLandmarkMetadata('crac-des-chevaliers').assetKey).toBe('crac-des-chevaliers-bespoke');
expect(getLegendaryWonderLandmarkMetadata('norad').assetKey).toBe('norad-bespoke');
```

Extend `keyedWonderIds` to equal every definition ID, and insert the three ordered tuples in the expected `keyed` list at their era positions.

- [ ] **Step 2: Replace the three generic-fallback tests with target-asset tests**

Add one table-driven test:

```ts
const expected = [
  ['terracotta-army', 'terracotta-army-bespoke'],
  ['crac-des-chevaliers', 'crac-des-chevaliers-bespoke'],
  ['norad', 'norad-bespoke'],
] as const;

for (const [wonderId, assetKey] of expected) {
  const ctx = drawCompletedGlyphForWonder(wonderId);
  expect(ctx.operations).toContain(`bespoke:${assetKey}`);
  expectNonblankCanvasGlyph(ctx, wonderId);
}
```

Add geometry coverage over those IDs plus `hall-of-champions`, `tidecaller-bastion`, and `storm-signal-spire`, requiring unique `getGlyphGeometryProfile` values. Add a reduced-motion test that draws every target at two times and requires equal geometry with `reducedMotion: true`. Retain an `under-construction` test that asserts no `bespoke:` operation.

- [ ] **Step 3: Run the test to verify it fails**

Run:

```bash
bash scripts/run-with-mise.sh yarn test --run tests/systems/legendary-wonder-landmark-catalog.test.ts tests/renderer/legendary-wonder-renderer.test.ts
```

Expected: failure for the three missing asset keys or missing bespoke operations; construction behavior stays green.

- [ ] **Step 4: Commit the failing regression tests**

```bash
git add tests/systems/legendary-wonder-landmark-catalog.test.ts tests/renderer/legendary-wonder-renderer.test.ts
git commit -m "test(725): define bespoke wonder landmark contract"
```

### Task 3: Register and draw the three stationary landmarks

**Files:**
- Modify: `src/systems/legendary-wonder-landmark-catalog.ts`
- Modify: `src/renderer/wonders/legendary-wonder-bespoke-assets.ts`

- [ ] **Step 1: Add stable keys to existing metadata**

Change only the three existing `landmark(...)` calls by supplying their final argument:

```ts
'terracotta-army': landmark(/* existing values */, 'terracotta-army-bespoke'),
'crac-des-chevaliers': landmark(/* existing values */, 'crac-des-chevaliers-bespoke'),
norad: landmark(/* existing values */, 'norad-bespoke'),
```

Do not change family, palette, reward, quest, Codex, save, or game-rule data.

- [ ] **Step 2: Extend the asset-key union and registry**

Add these literal keys to `SUPPORTED_BESPOKE_LEGENDARY_LANDMARK_ASSET_KEYS` and registrations to `BESPOKE_ASSETS`:

```ts
'terracotta-army-bespoke': { key: 'terracotta-army-bespoke', draw: drawTerracottaArmy },
'crac-des-chevaliers-bespoke': { key: 'crac-des-chevaliers-bespoke', draw: drawCracDesChevaliers },
'norad-bespoke': { key: 'norad-bespoke', draw: drawNorad },
```

- [ ] **Step 3: Implement Canvas functions with the approved static-first composition**

```ts
function drawTerracottaArmy(options: LegendaryWonderBespokeDrawOptions): void {
  const { ctx, cx, cy, radius, metadata, reducedMotion, nowMs } = options;
  markBespoke(ctx, 'terracotta-army-bespoke');
  // wide wall, three staggered clay ranks, upright spear lines
  // optional glint uses nowMs only when !reducedMotion
}

function drawCracDesChevaliers(options: LegendaryWonderBespokeDrawOptions): void {
  const { ctx, cx, cy, radius, metadata, reducedMotion, nowMs } = options;
  markBespoke(ctx, 'crac-des-chevaliers-bespoke');
  // curtain wall, two towers, central keep, restrained banner/torch detail
  // optional glint uses nowMs only when !reducedMotion
}

function drawNorad(options: LegendaryWonderBespokeDrawOptions): void {
  const { ctx, cx, cy, radius, metadata, reducedMotion, nowMs } = options;
  markBespoke(ctx, 'norad-bespoke');
  // command base, dish/dome, mast, and three bounded coverage arcs
  // optional sweep uses nowMs only when !reducedMotion
}
```

Derive every dimension from `radius` and all supplied colors from `metadata.palette`. Do not call `translate`, `rotate`, `setTransform`, or unit-animation helpers. The static pose contains all semantic features; animation only changes a small highlight or sweep endpoint.

- [ ] **Step 4: Run focused verification**

```bash
scripts/check-src-rule-violations.sh src/systems/legendary-wonder-landmark-catalog.ts src/renderer/wonders/legendary-wonder-bespoke-assets.ts
bash scripts/run-with-mise.sh yarn test --run tests/systems/legendary-wonder-landmark-catalog.test.ts tests/renderer/legendary-wonder-renderer.test.ts
```

Expected: both commands exit 0; each target emits its unique `bespoke:` operation and reduced-motion geometry is static.

- [ ] **Step 5: Commit the implementation**

```bash
git add src/systems/legendary-wonder-landmark-catalog.ts src/renderer/wonders/legendary-wonder-bespoke-assets.ts
git commit -m "feat(725): add bespoke military wonder landmarks"
```

### Task 4: Prove visibility, lost-race, and Codex boundaries

**Files:**
- Modify: `tests/systems/legendary-wonder-map-presentation.test.ts`
- Modify: `tests/systems/wonder-codex/presentation.test.ts`

- [ ] **Step 1: Add the lost-race map negative regression**

Create an owned visible city whose queue begins with `legendary:terracotta-army`, whose project is `phase: 'lost_race'`, and whose production progress meets the construction threshold. Assert:

```ts
expect(getLegendaryWonderMapEntries(state, 'player')
  .some(entry => entry.wonderId === 'terracotta-army')).toBe(false);
```

This proves stale queue/progress data cannot turn a lost race into a fictional map landmark.

- [ ] **Step 2: Extend the existing Codex lost-race test to all targets**

Use a table of `terracotta-army`, `crac-des-chevaliers`, and `norad`; set one owned project per case to `lost_race`; assert:

```ts
expect(isLegendaryWonderVisibleToPlayer(state, 'player', wonderId)).toBe(true);
```

Do not add a map-art dependency to the Codex view model.

- [ ] **Step 3: Run presentation tests**

```bash
bash scripts/run-with-mise.sh yarn test --run tests/systems/legendary-wonder-map-presentation.test.ts tests/systems/wonder-codex/presentation.test.ts
```

Expected: tests pass; unexplored/hidden behavior stays in shared presentation and lost targets stay Codex-readable without map landmarks.

- [ ] **Step 4: Commit the information-boundary coverage**

```bash
git add tests/systems/legendary-wonder-map-presentation.test.ts tests/systems/wonder-codex/presentation.test.ts
git commit -m "test(725): cover landmark visibility boundaries"
```

### Task 5: Full verification and delivery review

**Files:**
- Review only: all changed files

- [ ] **Step 1: Run required targeted verification**

```bash
scripts/check-src-rule-violations.sh src/systems/legendary-wonder-landmark-catalog.ts src/renderer/wonders/legendary-wonder-bespoke-assets.ts
bash scripts/run-with-mise.sh yarn test --run tests/systems/legendary-wonder-landmark-catalog.test.ts tests/renderer/legendary-wonder-renderer.test.ts tests/systems/legendary-wonder-map-presentation.test.ts tests/systems/wonder-codex/presentation.test.ts
scripts/run-wonder-regressions.sh
```

Expected: every command exits 0.

- [ ] **Step 2: Run production verification separately**

```bash
bash scripts/run-with-mise.sh yarn build
bash scripts/run-with-mise.sh yarn test:durable
bash scripts/run-with-mise.sh yarn test:durable:status
```

Expected: build succeeds and durable status confirms a passing suite for current HEAD and working tree.

- [ ] **Step 3: Inspect the committed and working-tree diffs**

```bash
git diff --check
git diff --stat origin/main...HEAD
git diff --stat
git diff origin/main...HEAD -- docs/claude-design-sprites-prompt.md src/systems/legendary-wonder-landmark-catalog.ts src/renderer/wonders/legendary-wonder-bespoke-assets.ts tests/systems/legendary-wonder-landmark-catalog.test.ts tests/renderer/legendary-wonder-renderer.test.ts tests/systems/legendary-wonder-map-presentation.test.ts tests/systems/wonder-codex/presentation.test.ts
git status --short
```

Expected: only Issue 725 art brief, catalog, Canvas assets, and regressions are present; no gameplay/save/schema drift exists.

## Plan self-review

- **Spec coverage:** Tasks 2–3 cover stable keys, three distinct landmarks, layered realism/fantasy, and reduced motion. Task 4 covers fog and lost-race boundaries. Task 1 uses the repository’s required prompt process. Task 5 covers required validation.
- **Placeholders:** No production task relies on a future helper, loader, or undefined type; all named production functions and tests already exist or are defined here.
- **Type consistency:** Asset keys, function names, metadata fields, and test files use the existing `LegendaryWonderBespokeAssetKey`, `LegendaryWonderBespokeDrawOptions`, `assetKey`, and `LegendaryWonderLandmarkState` contracts.
