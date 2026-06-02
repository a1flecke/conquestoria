# Stage 2I Bespoke Legendary Landmark Art Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Do not use subagents unless the user explicitly authorizes them.

**Goal:** Add the first three bespoke legendary city landmark Canvas drawings through a typed `assetKey` registry while preserving Stage 2G fallback rendering.

**Architecture:** This MR is option A from brainstorming: create a focused bespoke renderer registry, add `assetKey` metadata for Oracle of Delphi, Grand Canal, and Sun Spire, and integrate the registry into the existing legendary landmark glyph draw path. Generic silhouettes, construction ghosts, overflow medallions, visibility gates, and UI surfaces remain unchanged.

**Tech Stack:** TypeScript, Canvas 2D renderer primitives, Vitest, existing legendary landmark metadata and city renderer paths.

---

## Scope Check

Implement only:

- `oracle-of-delphi` -> `oracle-of-delphi-bespoke`
- `grand-canal` -> `grand-canal-bespoke`
- `sun-spire` -> `sun-spire-bespoke`
- renderer support for those three keys
- tests that authored keys resolve and render through the bespoke path
- this plan's deferred Stage 2K/C renderer-layer architecture step

Do not implement Stage 2J rival landmark visibility, Stage 2K renderer-layer extraction, bitmap/SVG assets, new UI, gameplay changes, save changes, or all-legendary-wonder bespoke coverage.

## File Structure

- Modify: `src/systems/legendary-wonder-landmark-catalog.ts`
  - Add `assetKey` values for the first three wonders only.
  - Keep fallback metadata and all other authored metadata without `assetKey`.
- Create: `src/renderer/wonders/legendary-wonder-bespoke-assets.ts`
  - Own the supported bespoke asset key union, resolver, and per-key Canvas draw functions.
  - Export `SUPPORTED_BESPOKE_LEGENDARY_LANDMARK_ASSET_KEYS`.
  - Export `resolveLegendaryWonderBespokeAsset(assetKey)`.
- Modify: `src/renderer/wonders/legendary-wonder-renderer.ts`
  - Use the resolver for completed landmarks with a supported `assetKey`.
  - Keep generic silhouettes for unsupported/missing keys.
  - Keep construction ghosts before bespoke completed drawings.
- Modify: `tests/systems/legendary-wonder-landmark-catalog.test.ts`
  - Add asset key exactness and supported-key coverage.
- Modify: `tests/renderer/legendary-wonder-renderer.test.ts`
  - Add renderer path regressions for bespoke, fallback, and construction ghost behavior.
- This file: `docs/superpowers/plans/2026-06-02-stage-2i-bespoke-legendary-landmark-art.md`
  - Include the deferred Stage 2K/C step below.

## Player Truth Table

| Before | Action | Immediate visible result | Must remain reachable |
|---|---|---|---|
| Owned visible completed Oracle host city | Player views map/city area | Oracle landmark medallion shows bespoke oracle shrine glyph | City label, badges, production/overlay badges |
| Owned visible completed Grand Canal host city | Player views map/city area | Grand Canal landmark medallion shows bespoke canal/waterway glyph | Existing landmark slot rotation and `+N` overflow |
| Owned visible completed Sun Spire host city | Player views map/city area | Sun Spire landmark medallion shows bespoke radiant spire glyph | Existing reduced-motion/static rendering |
| Owned active construction for any first-slice wonder | Player views map/city panel | Existing construction ghost remains, not completed bespoke art | Existing progress-gated ghost rules |
| Owned completed non-first-slice legendary wonder | Player views map/city area | Existing Stage 2G generic family silhouette remains | All prior 2G previews and map entries |
| Rival completed intel without host/location visibility | Player views Atlas/map/inspection | No host city, map location, or landmark preview is revealed | Existing rival intel summary surfaces |

## Misleading UI Risks

- Do not imply all legendary wonders have bespoke art; only three get `assetKey` in this MR.
- Do not render completed bespoke art for under-construction projects.
- Do not turn unsupported `assetKey` into a silent catalog convention; tests must catch any authored unsupported key.
- Do not change rival visibility. This is art rendering for landmarks already visible by existing rules.

## Interaction Replay Checklist

This MR does not add player interactions. Existing replayable surfaces must still behave:

- map render of completed owned city landmarks
- city-panel/codex landmark previews
- multi-wonder slot rotation and overflow
- active construction ghosts
- reduced-motion static drawing

## Task 1: Add Failing Asset-Key Coverage Tests

**Files:**

- Modify: `tests/systems/legendary-wonder-landmark-catalog.test.ts`
- Test: `tests/systems/legendary-wonder-landmark-catalog.test.ts`

- [ ] **Step 1: Update imports**

Add this import:

```ts
import {
  SUPPORTED_BESPOKE_LEGENDARY_LANDMARK_ASSET_KEYS,
} from '@/renderer/wonders/legendary-wonder-bespoke-assets';
```

- [ ] **Step 2: Add exact first-slice asset key test**

Add this test inside the existing `describe` block:

```ts
  it('authors first-slice bespoke asset keys only for approved Stage 2I wonders', () => {
    expect(getLegendaryWonderLandmarkMetadata('oracle-of-delphi').assetKey).toBe('oracle-of-delphi-bespoke');
    expect(getLegendaryWonderLandmarkMetadata('grand-canal').assetKey).toBe('grand-canal-bespoke');
    expect(getLegendaryWonderLandmarkMetadata('sun-spire').assetKey).toBe('sun-spire-bespoke');

    const keyed = getLegendaryWonderLandmarkMetadataCatalog()
      .filter(entry => entry.assetKey)
      .map(entry => [entry.wonderId, entry.assetKey] as const);

    expect(keyed).toEqual([
      ['oracle-of-delphi', 'oracle-of-delphi-bespoke'],
      ['grand-canal', 'grand-canal-bespoke'],
      ['sun-spire', 'sun-spire-bespoke'],
    ]);
  });
```

- [ ] **Step 3: Add supported-key catalog test**

Add this test:

```ts
  it('does not author unsupported bespoke landmark asset keys', () => {
    const supported = new Set<string>(SUPPORTED_BESPOKE_LEGENDARY_LANDMARK_ASSET_KEYS);
    const unsupported = getLegendaryWonderLandmarkMetadataCatalog()
      .filter(entry => entry.assetKey && !supported.has(entry.assetKey))
      .map(entry => `${entry.wonderId}:${entry.assetKey}`);

    expect(unsupported).toEqual([]);
  });
```

- [ ] **Step 4: Run the test and verify RED**

Run:

```bash
./scripts/run-with-mise.sh yarn vitest run tests/systems/legendary-wonder-landmark-catalog.test.ts
```

Expected: FAIL because `legendary-wonder-bespoke-assets.ts` does not exist and no `assetKey` values are authored.

- [ ] **Step 5: Commit failing tests**

Run:

```bash
git add tests/systems/legendary-wonder-landmark-catalog.test.ts
git commit -m "test(wonders): require first bespoke landmark asset keys"
```

## Task 2: Add Bespoke Registry And Metadata

**Files:**

- Create: `src/renderer/wonders/legendary-wonder-bespoke-assets.ts`
- Modify: `src/systems/legendary-wonder-landmark-catalog.ts`
- Test: `tests/systems/legendary-wonder-landmark-catalog.test.ts`

- [ ] **Step 1: Create the registry module**

Create `src/renderer/wonders/legendary-wonder-bespoke-assets.ts`:

```ts
import type { LegendaryWonderLandmarkMetadata } from '@/systems/legendary-wonder-landmark-types';

export const SUPPORTED_BESPOKE_LEGENDARY_LANDMARK_ASSET_KEYS = [
  'oracle-of-delphi-bespoke',
  'grand-canal-bespoke',
  'sun-spire-bespoke',
] as const;

export type LegendaryWonderBespokeAssetKey = typeof SUPPORTED_BESPOKE_LEGENDARY_LANDMARK_ASSET_KEYS[number];

export interface LegendaryWonderBespokeDrawOptions {
  ctx: CanvasRenderingContext2D;
  cx: number;
  cy: number;
  radius: number;
  metadata: LegendaryWonderLandmarkMetadata;
  reducedMotion: boolean;
  nowMs: number;
}

export interface LegendaryWonderBespokeAsset {
  key: LegendaryWonderBespokeAssetKey;
  draw: (options: LegendaryWonderBespokeDrawOptions) => void;
}

const BESPOKE_ASSETS: Record<LegendaryWonderBespokeAssetKey, LegendaryWonderBespokeAsset> = {
  'oracle-of-delphi-bespoke': { key: 'oracle-of-delphi-bespoke', draw: drawOracleOfDelphi },
  'grand-canal-bespoke': { key: 'grand-canal-bespoke', draw: drawGrandCanal },
  'sun-spire-bespoke': { key: 'sun-spire-bespoke', draw: drawSunSpire },
};

export function resolveLegendaryWonderBespokeAsset(assetKey: string | undefined): LegendaryWonderBespokeAsset | null {
  if (!assetKey) return null;
  return BESPOKE_ASSETS[assetKey as LegendaryWonderBespokeAssetKey] ?? null;
}

function markBespoke(ctx: CanvasRenderingContext2D, key: LegendaryWonderBespokeAssetKey): void {
  (ctx as unknown as { operations?: string[] }).operations?.push(`bespoke:${key}`);
}

function drawOracleOfDelphi(options: LegendaryWonderBespokeDrawOptions): void {
  const { ctx, cx, cy, radius, metadata } = options;
  markBespoke(ctx, 'oracle-of-delphi-bespoke');
  ctx.fillStyle = metadata.palette.accent;
  ctx.strokeStyle = metadata.palette.glow;
  ctx.lineWidth = Math.max(1, radius * 0.07);

  ctx.beginPath();
  ctx.moveTo(cx, cy - radius * 0.72);
  ctx.lineTo(cx + radius * 0.24, cy - radius * 0.1);
  ctx.lineTo(cx - radius * 0.24, cy - radius * 0.1);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, cy - radius * 0.18, radius * 0.16, 0, Math.PI * 2);
  ctx.fillStyle = metadata.palette.glow;
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(cx - radius * 0.46, cy + radius * 0.58);
  ctx.lineTo(cx - radius * 0.18, cy - radius * 0.05);
  ctx.moveTo(cx + radius * 0.46, cy + radius * 0.58);
  ctx.lineTo(cx + radius * 0.18, cy - radius * 0.05);
  ctx.moveTo(cx - radius * 0.34, cy + radius * 0.2);
  ctx.lineTo(cx + radius * 0.34, cy + radius * 0.2);
  ctx.stroke();
}

function drawGrandCanal(options: LegendaryWonderBespokeDrawOptions): void {
  const { ctx, cx, cy, radius, metadata } = options;
  markBespoke(ctx, 'grand-canal-bespoke');
  ctx.fillStyle = metadata.palette.accent;
  ctx.strokeStyle = metadata.palette.glow;
  ctx.lineWidth = Math.max(1, radius * 0.07);

  ctx.beginPath();
  ctx.rect(cx - radius * 0.68, cy - radius * 0.44, radius * 1.36, radius * 0.88);
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(cx - radius * 0.56, cy - radius * 0.18);
  ctx.lineTo(cx + radius * 0.56, cy - radius * 0.18);
  ctx.moveTo(cx - radius * 0.56, cy + radius * 0.12);
  ctx.lineTo(cx + radius * 0.56, cy + radius * 0.12);
  ctx.strokeStyle = metadata.palette.base;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, cy + radius * 0.44, radius * 0.44, Math.PI, Math.PI * 2);
  ctx.strokeStyle = metadata.palette.glow;
  ctx.stroke();
}

function drawSunSpire(options: LegendaryWonderBespokeDrawOptions): void {
  const { ctx, cx, cy, radius, metadata } = options;
  markBespoke(ctx, 'sun-spire-bespoke');
  ctx.fillStyle = metadata.palette.accent;
  ctx.strokeStyle = metadata.palette.glow;
  ctx.lineWidth = Math.max(1, radius * 0.07);

  ctx.beginPath();
  ctx.arc(cx, cy - radius * 0.48, radius * 0.24, 0, Math.PI * 2);
  ctx.fillStyle = metadata.palette.glow;
  ctx.fill();

  ctx.beginPath();
  for (let index = 0; index < 8; index += 1) {
    const angle = (Math.PI * 2 * index) / 8;
    ctx.moveTo(cx + Math.cos(angle) * radius * 0.34, cy - radius * 0.48 + Math.sin(angle) * radius * 0.34);
    ctx.lineTo(cx + Math.cos(angle) * radius * 0.52, cy - radius * 0.48 + Math.sin(angle) * radius * 0.52);
  }
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(cx, cy - radius * 0.28);
  ctx.lineTo(cx + radius * 0.3, cy + radius * 0.64);
  ctx.lineTo(cx, cy + radius * 0.42);
  ctx.lineTo(cx - radius * 0.3, cy + radius * 0.64);
  ctx.closePath();
  ctx.fillStyle = metadata.palette.accent;
  ctx.fill();
  ctx.stroke();
}
```

- [ ] **Step 2: Add optional asset keys to metadata helper**

In `src/systems/legendary-wonder-landmark-catalog.ts`, change `landmark(...)` to accept an optional final `assetKey?: string` parameter and include it only when provided:

```ts
function landmark(
  wonderId: string,
  family: LegendaryWonderLandmarkMetadata['family'],
  variant: LegendaryWonderLandmarkMetadata['variant'],
  motif: LegendaryWonderLandmarkMetadata['motif'],
  base: string,
  accent: string,
  glow: string,
  scale: number,
  aura: LegendaryWonderLandmarkMetadata['aura'],
  motion: LegendaryWonderLandmarkMetadata['motion'],
  constructionGhost: LegendaryWonderLandmarkMetadata['constructionGhost'],
  assetKey?: string,
): LegendaryWonderLandmarkMetadata {
  return {
    wonderId,
    family,
    variant,
    motif,
    palette: { base, accent, glow },
    scale,
    aura,
    motion,
    constructionGhost,
    ...(assetKey ? { assetKey } : {}),
  };
}
```

- [ ] **Step 3: Author first-slice metadata keys**

Update only the first three entries:

```ts
  'oracle-of-delphi': landmark('oracle-of-delphi', 'oracle', 'tall', 'prophecy', '#2f2943', '#d8c47a', '#fff0b8', 1.02, 'dedicationGlow', 'glint', 'outline', 'oracle-of-delphi-bespoke'),
  'grand-canal': landmark('grand-canal', 'waterworks', 'wide', 'canal', '#173c52', '#74d0ff', '#c8f3ff', 1.05, 'civicAura', 'pulse', 'foundation', 'grand-canal-bespoke'),
  'sun-spire': landmark('sun-spire', 'spire', 'tall', 'sun', '#46311f', '#f2c45d', '#fff1a6', 1.08, 'dedicationGlow', 'glint', 'scaffold', 'sun-spire-bespoke'),
```

- [ ] **Step 4: Run catalog tests and verify GREEN**

Run:

```bash
./scripts/run-with-mise.sh yarn vitest run tests/systems/legendary-wonder-landmark-catalog.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit registry and metadata**

Run:

```bash
git add src/renderer/wonders/legendary-wonder-bespoke-assets.ts src/systems/legendary-wonder-landmark-catalog.ts
git commit -m "feat(wonders): add first bespoke landmark asset registry"
```

## Task 3: Add Failing Renderer Path Tests

**Files:**

- Modify: `tests/renderer/legendary-wonder-renderer.test.ts`
- Test: `tests/renderer/legendary-wonder-renderer.test.ts`

- [ ] **Step 1: Add bespoke draw path test**

Add this test:

```ts
  it('draws first-slice completed landmarks through bespoke asset renderers', () => {
    for (const wonderId of ['oracle-of-delphi', 'grand-canal', 'sun-spire']) {
      const ctx = new MockCanvasContext();
      const metadata = getLegendaryWonderLandmarkMetadata(wonderId);

      drawLegendaryWonderLandmarkGlyph({
        ctx: ctx as unknown as CanvasRenderingContext2D,
        cx: 80,
        cy: 80,
        radius: 12,
        metadata,
        state: 'completed',
        reducedMotion: false,
        nowMs: 1000,
      });

      expect(ctx.operations).toContain(`bespoke:${metadata.assetKey}`);
    }
  });
```

- [ ] **Step 2: Add generic fallback test**

Add this test:

```ts
  it('keeps generic silhouette fallback for completed landmarks without bespoke assets', () => {
    const ctx = new MockCanvasContext();
    const metadata = getLegendaryWonderLandmarkMetadata('world-archive');

    drawLegendaryWonderLandmarkGlyph({
      ctx: ctx as unknown as CanvasRenderingContext2D,
      cx: 80,
      cy: 80,
      radius: 12,
      metadata,
      state: 'completed',
      reducedMotion: false,
      nowMs: 1000,
    });

    expect(metadata.assetKey).toBeUndefined();
    expect(ctx.operations.some(operation => operation.startsWith('bespoke:'))).toBe(false);
    expect(ctx.operations.some(operation => operation.startsWith('fill:') || operation.startsWith('stroke:'))).toBe(true);
  });
```

- [ ] **Step 3: Add construction ghost test**

Add this test:

```ts
  it('keeps construction ghosts instead of completed bespoke art for first-slice builds', () => {
    const ctx = new MockCanvasContext();

    drawLegendaryWonderLandmarkGlyph({
      ctx: ctx as unknown as CanvasRenderingContext2D,
      cx: 80,
      cy: 80,
      radius: 12,
      metadata: getLegendaryWonderLandmarkMetadata('oracle-of-delphi'),
      state: 'under-construction',
      reducedMotion: false,
      nowMs: 1000,
    });

    expect(ctx.operations.some(operation => operation.startsWith('bespoke:'))).toBe(false);
    expect(ctx.operations.some(operation => operation.startsWith('stroke:'))).toBe(true);
  });
```

- [ ] **Step 4: Run renderer tests and verify RED**

Run:

```bash
./scripts/run-with-mise.sh yarn vitest run tests/renderer/legendary-wonder-renderer.test.ts
```

Expected: FAIL because completed glyph drawing still uses the generic silhouette path and does not call the bespoke registry.

- [ ] **Step 5: Commit failing renderer tests**

Run:

```bash
git add tests/renderer/legendary-wonder-renderer.test.ts
git commit -m "test(wonders): require bespoke landmark render path"
```

## Task 4: Integrate Bespoke Drawings Into Legendary Landmark Renderer

**Files:**

- Modify: `src/renderer/wonders/legendary-wonder-renderer.ts`
- Test: `tests/renderer/legendary-wonder-renderer.test.ts`
- Test: `tests/systems/legendary-wonder-landmark-catalog.test.ts`

- [ ] **Step 1: Import the resolver**

Add:

```ts
import { resolveLegendaryWonderBespokeAsset } from '@/renderer/wonders/legendary-wonder-bespoke-assets';
```

- [ ] **Step 2: Call bespoke renderer for completed supported assets**

In `drawLegendaryWonderLandmarkGlyph`, after the under-construction block and before `drawSilhouette(...)`, add:

```ts
  const bespokeAsset = resolveLegendaryWonderBespokeAsset(metadata.assetKey);
  if (bespokeAsset) {
    bespokeAsset.draw({ ctx, cx, cy, radius: radius * (options.reducedMotion ? 0.68 : 0.72) * metadata.scale, metadata, reducedMotion, nowMs });
    return;
  }
```

Use the in-scope `reducedMotion` variable rather than `options.reducedMotion` if the function destructuring has already extracted it.

- [ ] **Step 3: Run renderer and catalog tests**

Run:

```bash
./scripts/run-with-mise.sh yarn vitest run tests/renderer/legendary-wonder-renderer.test.ts tests/systems/legendary-wonder-landmark-catalog.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit renderer integration**

Run:

```bash
git add src/renderer/wonders/legendary-wonder-renderer.ts
git commit -m "feat(wonders): render first bespoke legendary landmarks"
```

## Task 5: Deferred Stage 2K/C Renderer Layer Architecture Step

**Files:**

- This plan file only: `docs/superpowers/plans/2026-06-02-stage-2i-bespoke-legendary-landmark-art.md`

This task is a deliberate plan addition, not implementation. It satisfies the user request that option C be added as a discrete step with necessary details.

- [ ] **Step 1: Preserve the deferred 2K/C section below**

Keep the `Deferred Stage 2K/C Renderer Layer Architecture Step` section in this plan. Do not delete it while implementing 2I option A.

- [ ] **Step 2: Confirm no 2K files are implemented in this MR**

Before final verification, run:

```bash
git diff --name-only origin/main...HEAD | rg "city-render-pass|city-render-layer|city-renderer-layer|city-renderer-pass" || true
```

Expected: no output. If output appears, either remove accidental 2K implementation or explicitly stop and redesign the MR scope.

- [ ] **Step 3: Commit plan if not already committed**

Run:

```bash
git add docs/superpowers/plans/2026-06-02-stage-2i-bespoke-legendary-landmark-art.md
git commit -m "docs: plan stage 2i bespoke landmark art"
```

## Deferred Stage 2K/C Renderer Layer Architecture Step

This is the discrete future step for option C from brainstorming. It is recorded here so a later MR can execute it without ambiguity. It is not implemented by Stage 2I option A.

### Future Goal

Split the current city renderer layering into composable render passes so legendary landmark sublayers, labels, badges, overlays, selection, occupation/unrest/breakaway indicators, and production badges have explicit order and independent tests.

### Likely Target Files

- Modify: `src/renderer/city-renderer.ts`
  - Keep as the public orchestration entry point.
  - Delegate sublayers to focused pass helpers.
- Create: `src/renderer/city-render-passes.ts`
  - Export pass functions for base city icon, landmark sublayer, label layer, status badge layer, production badge layer, selection/hover overlays, and unrest/occupation/breakaway indicators.
- Modify: `src/renderer/render-loop.ts`
  - Keep existing call shape unless the pass split requires explicit render context fields.
- Modify tests:
  - `tests/renderer/city-renderer.test.ts`
  - add `tests/renderer/city-render-passes.test.ts` if helper boundaries are extracted.

### Required Render Pass Boundaries

1. Base city icon and ownership ring.
2. Legendary landmark sublayer around the city, below labels and badges.
3. City label/name/population text.
4. Production and queue badges.
5. Occupation, unrest, breakaway, capital, or warning indicators.
6. Selection, hover, and debug overlays.

### Ordering Invariants

- Landmarks must remain below city labels.
- Landmarks must remain below production, warning, occupation, unrest, and breakaway badges.
- Selection/hover overlays must remain visually readable when a city has multiple landmarks.
- Overflow `+N` medallions must not obscure city labels or production badges.
- Existing non-landmark city rendering must be visually unchanged unless the later 2K spec explicitly changes it.

### Required Future Tests

- A renderer operation-order test proving landmark operations occur before label and badge operations.
- A city with completed landmarks plus production badge still renders the production badge after landmarks.
- A city with completed landmarks plus unrest/occupation/breakaway indicators still renders those indicators after landmarks.
- Multi-wonder overflow still renders and does not replace city labels.
- Reduced-motion and low-zoom paths still render nonblank city landmarks.
- Existing city renderer tests remain green with no privacy or ownership regressions.

### Explicit Non-Blocking Statement

Stage 2I option A does not partially ship 2K. The bespoke asset registry is intentionally small and can be called from the current Stage 2G landmark sublayer. A later 2K MR may move that call behind a city render-pass helper without changing the bespoke registry API.

## Task 6: Final Verification, Rebase, Push, PR

**Files:**

- All changed files

- [ ] **Step 1: Run source rule check**

Run:

```bash
scripts/check-src-rule-violations.sh src/systems/legendary-wonder-landmark-catalog.ts src/renderer/wonders/legendary-wonder-bespoke-assets.ts src/renderer/wonders/legendary-wonder-renderer.ts
```

Expected: exit 0.

- [ ] **Step 2: Run targeted tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/legendary-wonder-landmark-catalog.test.ts tests/renderer/legendary-wonder-renderer.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run wonder regressions**

Run:

```bash
./scripts/run-wonder-regressions.sh
```

Expected: PASS. If the sandbox-only mise cache warning appears, note it only if exit code is 0.

- [ ] **Step 4: Run build and full tests**

Run:

```bash
./scripts/run-with-mise.sh yarn build
./scripts/run-with-mise.sh yarn test
```

Expected: both exit 0. Note the existing Vite large-chunk warning if it appears.

- [ ] **Step 5: Review diffs**

Run:

```bash
git diff --stat origin/main...HEAD
git diff --stat
git diff --check origin/main...HEAD
git status -sb
```

Expected:

- branch diff includes spec, plan, catalog, bespoke registry, renderer, and tests
- no uncommitted diff
- no whitespace errors

- [ ] **Step 6: Rebase and verify fast-forward eligibility**

Run:

```bash
git fetch origin main
git rebase origin/main
git merge-base --is-ancestor origin/main HEAD
```

Expected: rebase succeeds, merge-base exits 0.

- [ ] **Step 7: Push branch and create PR**

Run:

```bash
git push -u origin codex/stage-2i-bespoke-landmark-art
gh pr create --draft --base main --head codex/stage-2i-bespoke-landmark-art --title "Stage 2I first bespoke legendary landmarks" --body-file /private/tmp/conquestoria-stage-2i-pr-body.md
```

PR body must include:

- Summary
- Out of scope: all non-first-slice bespoke art, Stage 2J, Stage 2K implementation, Stage 3 video
- Why safe partial: no new UI/action, fallback remains generic, construction ghosts unchanged
- Verification
- Note that deferred 2K/C is recorded in this plan but intentionally not implemented

## Plan Self-Review

- Spec coverage: Tasks cover first three asset keys, renderer registry, completed bespoke draw path, generic fallback, construction ghost preservation, supported-key tests, and the requested deferred 2K/C step.
- Placeholder scan: No task uses TBD/TODO or "similar to"; code snippets and commands are explicit.
- Type consistency: `assetKey`, `SUPPORTED_BESPOKE_LEGENDARY_LANDMARK_ASSET_KEYS`, and `resolveLegendaryWonderBespokeAsset` are used consistently across tests, registry, and renderer integration.
- Scope: Stage 2J and 2K are explicitly deferred. Option A is shippable independently because unsupported/missing keys fall back to Stage 2G rendering.
