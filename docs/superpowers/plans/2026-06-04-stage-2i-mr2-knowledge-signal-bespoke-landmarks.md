# Stage 2I-MR2 Knowledge And Signal Bespoke Landmark Art Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Do not use subagents unless the user explicitly authorizes them.

**Goal:** Add bespoke Canvas landmark glyphs for World Archive, Starvault Observatory, Storm Signal Spire, and Internet while preserving existing visibility, UI, SFX, and fallback behavior.

**Architecture:** Extend the existing Stage 2I `assetKey` registry and metadata catalog. `src/renderer/wonders/legendary-wonder-bespoke-assets.ts` remains the only module that knows how to draw bespoke primitives, while `src/renderer/wonders/legendary-wonder-renderer.ts` keeps the existing resolver integration unchanged. UI, Codex, Atlas, city panel, territory inspection, Stage 2J intel, and Stage 2K city render pass code remain untouched.

**Tech Stack:** TypeScript, Canvas 2D primitives, Vitest, existing legendary landmark metadata, existing city renderer pass pipeline, `./scripts/run-with-mise.sh yarn ...`.

---

## Scope Check

Implement only:

- `world-archive` -> `world-archive-bespoke`
- `starvault-observatory` -> `starvault-observatory-bespoke`
- `storm-signal-spire` -> `storm-signal-spire-bespoke`
- `internet` -> `internet-bespoke`
- renderer support for those four keys
- tests that authored keys resolve and draw through the bespoke path
- tests that fallback, construction ghosts, reduced motion, and existing first-slice bespoke keys still work

Do not implement bespoke art for:

- `moonwell-gardens`
- `ironroot-foundry`
- `tidecaller-bastion`
- `whispering-exchange`
- `hall-of-champions`
- `gate-of-the-world`
- `leviathan-drydock`
- `manhattan-project`

Do not change gameplay, saves, UI actions, map actions, Codex actions, panels, SFX/audio, mixer behavior, sprites, terrain tiles, improvement markers, PWA, Tauri, service worker, Stage 2J intel rules, or Stage 2K city renderer pass architecture.

## File Structure

- Modify: `tests/systems/legendary-wonder-landmark-catalog.test.ts`
  - Update the approved bespoke asset-key test from first-slice-only to original-three-plus-MR2.
  - Keep unsupported-key coverage against `SUPPORTED_BESPOKE_LEGENDARY_LANDMARK_ASSET_KEYS`.
- Modify: `tests/renderer/legendary-wonder-renderer.test.ts`
  - Add MR2 bespoke render-path coverage.
  - Move generic fallback coverage away from `world-archive` because MR2 will make it bespoke.
  - Add reduced-motion nonblank coverage for MR2 glyphs.
  - Add under-construction ghost coverage for MR2 glyphs.
- Modify: `src/systems/legendary-wonder-landmark-catalog.ts`
  - Add four `assetKey` arguments to the existing `landmark(...)` entries.
- Modify: `src/renderer/wonders/legendary-wonder-bespoke-assets.ts`
  - Add four supported keys and registry entries.
  - Add four deterministic Canvas primitive draw functions.

## Execution Preflight

Before Task 1, run these checks from the repo root so a medium-effort agent can verify the plan still matches the branch:

```bash
git status -sb
rg -n "authors first-slice bespoke asset keys only for approved Stage 2I wonders|SUPPORTED_BESPOKE_LEGENDARY_LANDMARK_ASSET_KEYS|world-archive|starvault-observatory|storm-signal-spire|internet" tests/systems/legendary-wonder-landmark-catalog.test.ts src/systems/legendary-wonder-landmark-catalog.ts src/renderer/wonders/legendary-wonder-bespoke-assets.ts tests/renderer/legendary-wonder-renderer.test.ts
```

Expected before implementation:

- branch is `codex/stage-2i-mr2-knowledge-signal-bespoke`
- working tree is clean unless the plan itself is being edited
- `SUPPORTED_BESPOKE_LEGENDARY_LANDMARK_ASSET_KEYS` contains only `oracle-of-delphi-bespoke`, `grand-canal-bespoke`, and `sun-spire-bespoke`
- `world-archive`, `starvault-observatory`, `storm-signal-spire`, and `internet` exist in `src/systems/legendary-wonder-landmark-catalog.ts` without an `assetKey` argument
- renderer fallback tests still use `world-archive`, which Task 2 moves to `moonwell-gardens`

If any expectation is already different because `origin/main` moved, pause and update this plan before implementation instead of guessing.

## Player Truth Table

| Before | Player action | Immediate visible result | Must remain reachable |
|---|---|---|---|
| Player owns completed World Archive and views host city on map | View map | Archive medallion uses layered shelves/tablets bespoke glyph | City label, badges, overflow `+N`, generic fallback for other wonders |
| Player owns completed Starvault Observatory and views host city on map | View map | Observatory medallion uses dome/lens/star bespoke glyph | Reduced-motion static rendering, city pass order |
| Player owns completed Storm Signal Spire and views host city on map | View map | Signal medallion uses mast and arcs bespoke glyph | Status and production badges remain visually separate |
| Player owns completed Internet and views host city on map | View map | Network medallion uses abstract linked nodes | No browser/company/wireless logo implication |
| Player is building any MR2 wonder | View map/city panel | Existing construction ghost renders, not completed bespoke glyph | Existing progress gates and panel previews |
| Rival has completed intel only | View map/Atlas/Codex/inspection | No new host, map marker, preview, or action appears | Existing safe rival intel text |

## Misleading UI Risks

- Signal arcs and network nodes are decorative identity marks only. They must not resemble warning badges, selected-tile pings, notification indicators, production badges, or audio indicators.
- `internet-bespoke` must be an abstract graph, not a browser logo, company logo, Wi-Fi trademark-style symbol, or product branding.
- Adding `assetKey` must not imply that all remaining legendary wonders are bespoke. Tests must enforce the exact keyed set.
- Construction ghosts must not switch to completed bespoke art while a project is still under construction.
- MR2 art uses Canvas primitives inside the existing landmark medallion. Do not add sprite-catalog entries, generated SVG sprites, terrain tiles, improvement markers, or external asset attribution.
- MR2 glyphs are static identity art. Do not add new animation timing, `nowMs`-dependent meaning, pulsing alerts, or motion-only state communication.

## Interaction Replay Checklist

This MR adds no player interactions. Existing replay surfaces to preserve:

- repeated map rendering across frames
- reduced-motion rendering
- low-zoom landmark rendering
- multi-wonder slot rotation and overflow
- active construction ghost rendering
- hot-seat viewer-safe known-rival rendering from existing Stage 2J helpers
- city render pass ordering from existing Stage 2K tests

## Task 1: Update Catalog Asset-Key Tests

**Files:**

- Modify: `tests/systems/legendary-wonder-landmark-catalog.test.ts`
- Test: `tests/systems/legendary-wonder-landmark-catalog.test.ts`

- [ ] **Step 1: Replace the first-slice-only asset-key test**

In `tests/systems/legendary-wonder-landmark-catalog.test.ts`, replace the entire test named `authors first-slice bespoke asset keys only for approved Stage 2I wonders` with:

```ts
  it('authors approved bespoke asset keys only for completed Stage 2I slices', () => {
    expect(getLegendaryWonderLandmarkMetadata('oracle-of-delphi').assetKey).toBe('oracle-of-delphi-bespoke');
    expect(getLegendaryWonderLandmarkMetadata('grand-canal').assetKey).toBe('grand-canal-bespoke');
    expect(getLegendaryWonderLandmarkMetadata('sun-spire').assetKey).toBe('sun-spire-bespoke');
    expect(getLegendaryWonderLandmarkMetadata('world-archive').assetKey).toBe('world-archive-bespoke');
    expect(getLegendaryWonderLandmarkMetadata('starvault-observatory').assetKey).toBe('starvault-observatory-bespoke');
    expect(getLegendaryWonderLandmarkMetadata('storm-signal-spire').assetKey).toBe('storm-signal-spire-bespoke');
    expect(getLegendaryWonderLandmarkMetadata('internet').assetKey).toBe('internet-bespoke');

    const keyed = getLegendaryWonderLandmarkMetadataCatalog()
      .filter(entry => entry.assetKey)
      .map(entry => [entry.wonderId, entry.assetKey] as const);

    expect(keyed).toEqual([
      ['oracle-of-delphi', 'oracle-of-delphi-bespoke'],
      ['grand-canal', 'grand-canal-bespoke'],
      ['sun-spire', 'sun-spire-bespoke'],
      ['world-archive', 'world-archive-bespoke'],
      ['starvault-observatory', 'starvault-observatory-bespoke'],
      ['storm-signal-spire', 'storm-signal-spire-bespoke'],
      ['internet', 'internet-bespoke'],
    ]);
  });
```

- [ ] **Step 2: Run the catalog test to verify RED**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/legendary-wonder-landmark-catalog.test.ts
```

Expected: FAIL. The failure should report `world-archive`, `starvault-observatory`, `storm-signal-spire`, or `internet` `assetKey` values as `undefined`, because metadata and registry keys have not been added yet.

- [ ] **Step 3: Commit the failing catalog test**

Run:

```bash
git add tests/systems/legendary-wonder-landmark-catalog.test.ts
git commit -m "test(wonders): require knowledge signal bespoke asset keys"
```

## Task 2: Add Renderer Tests For MR2 Bespoke Glyphs

**Files:**

- Modify: `tests/renderer/legendary-wonder-renderer.test.ts`
- Test: `tests/renderer/legendary-wonder-renderer.test.ts`

- [ ] **Step 1: Make mock path operations record geometry**

In `tests/renderer/legendary-wonder-renderer.test.ts`, update these `MockCanvasContext` methods so tests can distinguish glyph geometry, not just operation count:

```ts
  arc(x = 0, y = 0, radius = 0): void { this.operations.push(`arc:${x.toFixed(2)}:${y.toFixed(2)}:${radius.toFixed(2)}`); }
  rect(x = 0, y = 0, width = 0, height = 0): void { this.operations.push(`rect:${x.toFixed(2)}:${y.toFixed(2)}:${width.toFixed(2)}:${height.toFixed(2)}`); }
  moveTo(x = 0, y = 0): void { this.operations.push(`moveTo:${x.toFixed(2)}:${y.toFixed(2)}`); }
  lineTo(x = 0, y = 0): void { this.operations.push(`lineTo:${x.toFixed(2)}:${y.toFixed(2)}`); }
```

- [ ] **Step 2: Add operation helpers after `MockCanvasContext`**

Add these helpers after the `MockCanvasContext` class:

```ts
function drawCompletedGlyphForWonder(wonderId: string, options: { reducedMotion?: boolean } = {}): MockCanvasContext {
  const ctx = new MockCanvasContext();
  drawLegendaryWonderLandmarkGlyph({
    ctx: ctx as unknown as CanvasRenderingContext2D,
    cx: 80,
    cy: 80,
    radius: 12,
    metadata: getLegendaryWonderLandmarkMetadata(wonderId),
    state: 'completed',
    reducedMotion: options.reducedMotion === true,
    nowMs: 1000,
  });
  return ctx;
}

function expectNonblankCanvasGlyph(ctx: MockCanvasContext, label: string): void {
  expect(ctx.operations.length, label).toBeGreaterThan(4);
  expect(
    ctx.operations.some(operation =>
      operation.startsWith('fill:')
      || operation.startsWith('stroke:')
      || operation.startsWith('arc:')
      || operation.startsWith('rect:')
      || operation.startsWith('lineTo:'),
    ),
    label,
  ).toBe(true);
}

function getGlyphGeometryProfile(ctx: MockCanvasContext): string {
  return ctx.operations
    .filter(operation =>
      operation.startsWith('arc:')
      || operation.startsWith('rect:')
      || operation.startsWith('moveTo:')
      || operation.startsWith('lineTo:'),
    )
    .join('|');
}
```

- [ ] **Step 3: Add MR2 bespoke render-path test**

Add this test after `draws first-slice completed landmarks through bespoke asset renderers`:

```ts
  it('draws knowledge-and-signal completed landmarks through bespoke asset renderers', () => {
    const expected = [
      ['world-archive', 'world-archive-bespoke'],
      ['starvault-observatory', 'starvault-observatory-bespoke'],
      ['storm-signal-spire', 'storm-signal-spire-bespoke'],
      ['internet', 'internet-bespoke'],
    ] as const;

    for (const [wonderId, assetKey] of expected) {
      const ctx = drawCompletedGlyphForWonder(wonderId);

      expect(ctx.operations, wonderId).toContain(`bespoke:${assetKey}`);
      expectNonblankCanvasGlyph(ctx, wonderId);
    }
  });
```

- [ ] **Step 4: Add MR2 visual distinctness test**

Add this test after the MR2 bespoke render-path test:

```ts
  it('draws distinct knowledge-and-signal bespoke glyph geometry', () => {
    const wonderIds = ['world-archive', 'starvault-observatory', 'storm-signal-spire', 'internet'];
    const profiles = new Set<string>();

    for (const wonderId of wonderIds) {
      const ctx = drawCompletedGlyphForWonder(wonderId);
      const profile = getGlyphGeometryProfile(ctx);

      expect(profile.length, wonderId).toBeGreaterThan(0);
      profiles.add(profile);
    }

    expect(profiles.size).toBe(wonderIds.length);
  });
```

- [ ] **Step 5: Update generic fallback test to use a non-MR2 generic wonder**

In `keeps generic silhouette fallback for completed landmarks without bespoke assets`, change:

```ts
      metadata: getLegendaryWonderLandmarkMetadata('world-archive'),
```

to:

```ts
      metadata: getLegendaryWonderLandmarkMetadata('moonwell-gardens'),
```

- [ ] **Step 6: Update unsupported-key fallback test to use a non-MR2 generic base**

In `keeps generic silhouette fallback for completed landmarks with unsupported bespoke asset keys`, change:

```ts
      ...getLegendaryWonderLandmarkMetadata('world-archive'),
```

to:

```ts
      ...getLegendaryWonderLandmarkMetadata('moonwell-gardens'),
```

- [ ] **Step 7: Add MR2 construction ghost test**

Add this test after the first-slice construction ghost test:

```ts
  it('keeps construction ghosts instead of completed bespoke art for knowledge-and-signal builds', () => {
    const wonderIds = ['world-archive', 'starvault-observatory', 'storm-signal-spire', 'internet'];

    for (const wonderId of wonderIds) {
      const ctx = new MockCanvasContext();

      drawLegendaryWonderLandmarkGlyph({
        ctx: ctx as unknown as CanvasRenderingContext2D,
        cx: 80,
        cy: 80,
        radius: 12,
        metadata: getLegendaryWonderLandmarkMetadata(wonderId),
        state: 'under-construction',
        reducedMotion: false,
        nowMs: 1000,
      });

      expect(ctx.operations.some(operation => operation.startsWith('bespoke:')), wonderId).toBe(false);
      expect(ctx.operations.some(operation => operation.startsWith('stroke:')), wonderId).toBe(true);
    }
  });
```

- [ ] **Step 8: Add reduced-motion MR2 nonblank test**

Add this test after the MR2 construction ghost test:

```ts
  it('draws nonblank knowledge-and-signal bespoke glyphs with reduced motion', () => {
    const wonderIds = ['world-archive', 'starvault-observatory', 'storm-signal-spire', 'internet'];

    for (const wonderId of wonderIds) {
      const ctx = drawCompletedGlyphForWonder(wonderId, { reducedMotion: true });

      expect(ctx.operations.some(operation => operation.startsWith('bespoke:')), wonderId).toBe(true);
      expectNonblankCanvasGlyph(ctx, wonderId);
    }
  });
```

- [ ] **Step 9: Run renderer tests to verify RED**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/renderer/legendary-wonder-renderer.test.ts
```

Expected: FAIL. The MR2 bespoke render-path test should fail because the new metadata keys and bespoke registry entries do not exist yet.

- [ ] **Step 10: Commit the failing renderer tests**

Run:

```bash
git add tests/renderer/legendary-wonder-renderer.test.ts
git commit -m "test(wonders): require knowledge signal bespoke renderers"
```

## Task 3: Add MR2 Asset Keys And Bespoke Draw Functions

**Files:**

- Modify: `src/systems/legendary-wonder-landmark-catalog.ts`
- Modify: `src/renderer/wonders/legendary-wonder-bespoke-assets.ts`
- Test: `tests/systems/legendary-wonder-landmark-catalog.test.ts`
- Test: `tests/renderer/legendary-wonder-renderer.test.ts`

- [ ] **Step 1: Add MR2 keys to supported key list**

In `src/renderer/wonders/legendary-wonder-bespoke-assets.ts`, replace `SUPPORTED_BESPOKE_LEGENDARY_LANDMARK_ASSET_KEYS` with:

```ts
export const SUPPORTED_BESPOKE_LEGENDARY_LANDMARK_ASSET_KEYS = [
  'oracle-of-delphi-bespoke',
  'grand-canal-bespoke',
  'sun-spire-bespoke',
  'world-archive-bespoke',
  'starvault-observatory-bespoke',
  'storm-signal-spire-bespoke',
  'internet-bespoke',
] as const;
```

- [ ] **Step 2: Add MR2 registry entries**

In the `BESPOKE_ASSETS` object in `src/renderer/wonders/legendary-wonder-bespoke-assets.ts`, add these entries after `sun-spire-bespoke`:

```ts
  'world-archive-bespoke': { key: 'world-archive-bespoke', draw: drawWorldArchive },
  'starvault-observatory-bespoke': { key: 'starvault-observatory-bespoke', draw: drawStarvaultObservatory },
  'storm-signal-spire-bespoke': { key: 'storm-signal-spire-bespoke', draw: drawStormSignalSpire },
  'internet-bespoke': { key: 'internet-bespoke', draw: drawInternet },
```

- [ ] **Step 3: Add `drawWorldArchive`**

In `src/renderer/wonders/legendary-wonder-bespoke-assets.ts`, add this function after `drawSunSpire`:

```ts
function drawWorldArchive(options: LegendaryWonderBespokeDrawOptions): void {
  const { ctx, cx, cy, radius, metadata } = options;
  markBespoke(ctx, 'world-archive-bespoke');
  ctx.fillStyle = metadata.palette.accent;
  ctx.strokeStyle = metadata.palette.glow;
  ctx.lineWidth = Math.max(1, radius * 0.07);

  ctx.beginPath();
  ctx.rect(cx - radius * 0.64, cy - radius * 0.56, radius * 1.28, radius * 1.08);
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  for (let index = 0; index < 4; index += 1) {
    const x = cx - radius * 0.48 + index * radius * 0.32;
    ctx.moveTo(x, cy - radius * 0.46);
    ctx.lineTo(x, cy + radius * 0.46);
  }
  ctx.moveTo(cx - radius * 0.52, cy - radius * 0.12);
  ctx.lineTo(cx + radius * 0.52, cy - radius * 0.12);
  ctx.moveTo(cx - radius * 0.52, cy + radius * 0.2);
  ctx.lineTo(cx + radius * 0.52, cy + radius * 0.2);
  ctx.strokeStyle = metadata.palette.base;
  ctx.stroke();

  ctx.beginPath();
  ctx.rect(cx - radius * 0.16, cy - radius * 0.24, radius * 0.32, radius * 0.48);
  ctx.fillStyle = metadata.palette.glow;
  ctx.fill();
}
```

- [ ] **Step 4: Add `drawStarvaultObservatory`**

Add this function after `drawWorldArchive`:

```ts
function drawStarvaultObservatory(options: LegendaryWonderBespokeDrawOptions): void {
  const { ctx, cx, cy, radius, metadata } = options;
  markBespoke(ctx, 'starvault-observatory-bespoke');
  ctx.fillStyle = metadata.palette.accent;
  ctx.strokeStyle = metadata.palette.glow;
  ctx.lineWidth = Math.max(1, radius * 0.07);

  ctx.beginPath();
  ctx.arc(cx, cy + radius * 0.28, radius * 0.62, Math.PI, Math.PI * 2);
  ctx.lineTo(cx + radius * 0.62, cy + radius * 0.48);
  ctx.lineTo(cx - radius * 0.62, cy + radius * 0.48);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, cy - radius * 0.08, radius * 0.22, 0, Math.PI * 2);
  ctx.fillStyle = metadata.palette.glow;
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(cx - radius * 0.42, cy - radius * 0.58);
  ctx.lineTo(cx - radius * 0.32, cy - radius * 0.46);
  ctx.moveTo(cx + radius * 0.42, cy - radius * 0.54);
  ctx.lineTo(cx + radius * 0.52, cy - radius * 0.42);
  ctx.moveTo(cx, cy - radius * 0.74);
  ctx.lineTo(cx, cy - radius * 0.56);
  ctx.strokeStyle = metadata.palette.glow;
  ctx.stroke();
}
```

- [ ] **Step 5: Add `drawStormSignalSpire`**

Add this function after `drawStarvaultObservatory`:

```ts
function drawStormSignalSpire(options: LegendaryWonderBespokeDrawOptions): void {
  const { ctx, cx, cy, radius, metadata } = options;
  markBespoke(ctx, 'storm-signal-spire-bespoke');
  ctx.fillStyle = metadata.palette.accent;
  ctx.strokeStyle = metadata.palette.glow;
  ctx.lineWidth = Math.max(1, radius * 0.07);

  ctx.beginPath();
  ctx.moveTo(cx, cy - radius * 0.72);
  ctx.lineTo(cx + radius * 0.24, cy + radius * 0.62);
  ctx.lineTo(cx, cy + radius * 0.42);
  ctx.lineTo(cx - radius * 0.24, cy + radius * 0.62);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(cx - radius * 0.5, cy - radius * 0.36);
  ctx.lineTo(cx - radius * 0.28, cy - radius * 0.24);
  ctx.lineTo(cx - radius * 0.5, cy - radius * 0.12);
  ctx.moveTo(cx + radius * 0.5, cy - radius * 0.36);
  ctx.lineTo(cx + radius * 0.28, cy - radius * 0.24);
  ctx.lineTo(cx + radius * 0.5, cy - radius * 0.12);
  ctx.moveTo(cx - radius * 0.68, cy + radius * 0.06);
  ctx.lineTo(cx - radius * 0.36, cy + radius * 0.18);
  ctx.moveTo(cx + radius * 0.68, cy + radius * 0.06);
  ctx.lineTo(cx + radius * 0.36, cy + radius * 0.18);
  ctx.strokeStyle = metadata.palette.glow;
  ctx.stroke();
}
```

- [ ] **Step 6: Add `drawInternet`**

Add this function after `drawStormSignalSpire`:

```ts
function drawInternet(options: LegendaryWonderBespokeDrawOptions): void {
  const { ctx, cx, cy, radius, metadata } = options;
  markBespoke(ctx, 'internet-bespoke');
  ctx.strokeStyle = metadata.palette.glow;
  ctx.lineWidth = Math.max(1, radius * 0.06);

  const nodes = [
    { x: cx, y: cy - radius * 0.5 },
    { x: cx + radius * 0.52, y: cy - radius * 0.16 },
    { x: cx + radius * 0.32, y: cy + radius * 0.48 },
    { x: cx - radius * 0.32, y: cy + radius * 0.48 },
    { x: cx - radius * 0.52, y: cy - radius * 0.16 },
    { x: cx, y: cy },
  ];

  ctx.beginPath();
  for (let index = 0; index < nodes.length - 1; index += 1) {
    const node = nodes[index];
    const next = nodes[(index + 1) % (nodes.length - 1)];
    ctx.moveTo(node.x, node.y);
    ctx.lineTo(next.x, next.y);
    ctx.moveTo(node.x, node.y);
    ctx.lineTo(nodes[5].x, nodes[5].y);
  }
  ctx.stroke();

  for (const node of nodes) {
    ctx.beginPath();
    ctx.arc(node.x, node.y, radius * 0.13, 0, Math.PI * 2);
    ctx.fillStyle = node === nodes[5] ? metadata.palette.glow : metadata.palette.accent;
    ctx.fill();
    ctx.strokeStyle = metadata.palette.glow;
    ctx.stroke();
  }
}
```

- [ ] **Step 7: Add MR2 metadata asset keys**

In `src/systems/legendary-wonder-landmark-catalog.ts`, update these entries:

```ts
  'world-archive': landmark('world-archive', 'archive', 'wide', 'knowledge', '#263044', '#b9c7ff', '#edf0ff', 1, 'civicAura', 'pulse', 'outline', 'world-archive-bespoke'),
  'starvault-observatory': landmark('starvault-observatory', 'observatory', 'tall', 'stars', '#252d4d', '#a8b9ff', '#f1f4ff', 1.06, 'dedicationGlow', 'spark', 'scaffold', 'starvault-observatory-bespoke'),
  'storm-signal-spire': landmark('storm-signal-spire', 'signal', 'tall', 'signal', '#202943', '#b7c7ff', '#f1f5ff', 1.08, 'dedicationGlow', 'spark', 'scaffold', 'storm-signal-spire-bespoke'),
  internet: landmark('internet', 'network', 'wide', 'network', '#202c3d', '#80d8ff', '#d9f8ff', 0.98, 'civicAura', 'spark', 'foundation', 'internet-bespoke'),
```

- [ ] **Step 8: Run targeted tests to verify GREEN**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/legendary-wonder-landmark-catalog.test.ts tests/renderer/legendary-wonder-renderer.test.ts
```

Expected: PASS for all tests in those files.

- [ ] **Step 9: Run source rule check for changed source files**

Run:

```bash
scripts/check-src-rule-violations.sh src/systems/legendary-wonder-landmark-catalog.ts src/renderer/wonders/legendary-wonder-bespoke-assets.ts
```

Expected: exits 0.

- [ ] **Step 10: Commit implementation**

Run:

```bash
git add src/systems/legendary-wonder-landmark-catalog.ts src/renderer/wonders/legendary-wonder-bespoke-assets.ts
git commit -m "feat(wonders): add knowledge signal bespoke landmarks"
```

## Task 4: Final Review And Verification

**Files:**

- Review: `docs/superpowers/specs/2026-06-04-stage-2i-mr2-knowledge-signal-bespoke-landmarks-design.md`
- Review: `docs/superpowers/plans/2026-06-04-stage-2i-mr2-knowledge-signal-bespoke-landmarks.md`
- Review: `src/systems/legendary-wonder-landmark-catalog.ts`
- Review: `src/renderer/wonders/legendary-wonder-bespoke-assets.ts`
- Review: `tests/systems/legendary-wonder-landmark-catalog.test.ts`
- Review: `tests/renderer/legendary-wonder-renderer.test.ts`

- [ ] **Step 1: Inspect branch and local diffs**

Run:

```bash
git status -sb
git diff --stat origin/main...HEAD
git diff --stat
git diff --name-only origin/main...HEAD
git diff origin/main...HEAD
git diff
```

Expected:

- branch contains the design spec, this plan, tests, metadata, and registry changes
- local working tree is clean after commits
- no UI, audio, gameplay, save, platform, PWA, or city-render-pass files changed

- [ ] **Step 2: Review visual, UI, UX, SFX, and animation scope**

Run:

```bash
sed -n '1,260p' src/renderer/wonders/legendary-wonder-bespoke-assets.ts
git diff --name-only origin/main...HEAD
```

Expected:

- only `src/renderer/wonders/legendary-wonder-bespoke-assets.ts` changes renderer drawing behavior
- no files under `src/ui/`, `src/audio/`, `public/audio/`, `src/platform/`, `src-tauri/`, or service-worker/PWA config changed
- no files under `src/renderer/sprites/`, `src/renderer/terrain/`, or `src/renderer/improvements/` changed
- no `src/renderer/city-render-passes.ts` or `src/renderer/city-renderer.ts` changes
- each MR2 draw function sets its own Canvas fill/stroke/line-width state before drawing
- each MR2 draw function uses `cx`, `cy`, and `radius`, not fixed screen coordinates
- each MR2 draw function is static identity art and does not add `nowMs`-dependent animation, alert pulses, or motion-only meaning
- `internet-bespoke` is abstract linked nodes and lines only, with no browser, company, Wi-Fi, or product-logo shape
- `storm-signal-spire-bespoke` signal arcs read as landmark identity, not warning badges, selected-tile pings, production icons, or audio indicators
- the four glyphs are visually distinct at medallion scale: archive shelves, observatory dome/lens, signal mast/arcs, and network nodes

- [ ] **Step 3: Review implementation against the spec**

Run:

```bash
sed -n '1,260p' docs/superpowers/specs/2026-06-04-stage-2i-mr2-knowledge-signal-bespoke-landmarks-design.md
sed -n '1,760p' docs/superpowers/plans/2026-06-04-stage-2i-mr2-knowledge-signal-bespoke-landmarks.md
git diff origin/main...HEAD -- tests/systems/legendary-wonder-landmark-catalog.test.ts tests/renderer/legendary-wonder-renderer.test.ts src/systems/legendary-wonder-landmark-catalog.ts src/renderer/wonders/legendary-wonder-bespoke-assets.ts
```

Expected:

- exact MR2 key set is original three Stage 2I keys plus `world-archive-bespoke`, `starvault-observatory-bespoke`, `storm-signal-spire-bespoke`, and `internet-bespoke`
- no remaining MR2 wonder falls through to generic after completion
- `moonwell-gardens` still proves the no-asset generic fallback
- unsupported asset key fallback still proves renderer safety
- construction tests prove under-construction MR2 landmarks do not call `bespoke:*`
- reduced-motion tests prove MR2 completed glyphs remain nonblank without motion
- geometry-profile tests prove the four MR2 glyphs are not copy-paste duplicates

- [ ] **Step 4: Run targeted tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/legendary-wonder-landmark-catalog.test.ts tests/renderer/legendary-wonder-renderer.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run source rule check**

Run:

```bash
scripts/check-src-rule-violations.sh src/systems/legendary-wonder-landmark-catalog.ts src/renderer/wonders/legendary-wonder-bespoke-assets.ts
```

Expected: exits 0.

- [ ] **Step 6: Run wonder regressions**

Run:

```bash
./scripts/run-wonder-regressions.sh
```

Expected: PASS. If it emits the known sandbox-only mise cache warning but exits 0, record the warning in the PR verification notes.

- [ ] **Step 7: Run build**

Run:

```bash
./scripts/run-with-mise.sh yarn build
```

Expected: PASS. If it emits the existing Vite chunk-size warning but exits 0, record the warning in the PR verification notes.

- [ ] **Step 8: Run full tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test
```

Expected: PASS.

- [ ] **Step 9: Rebase and verify fast-forward eligibility before PR**

Run:

```bash
git fetch origin main
git rebase origin/main
git merge-base --is-ancestor origin/main HEAD
```

Expected:

- rebase succeeds or conflicts are resolved with tests rerun
- `git merge-base --is-ancestor origin/main HEAD` exits 0

- [ ] **Step 10: Create PR body file**

Create `/private/tmp/conquestoria-stage-2i-mr2-pr-body.md` with this exact content:

```md
## Summary
- add Stage 2I-MR2 bespoke landmark asset keys for World Archive, Starvault Observatory, Storm Signal Spire, and Internet
- extend the existing Canvas bespoke landmark registry with four knowledge-and-signal glyphs
- keep generic fallback, construction ghosts, visibility rules, UI, SFX, sprites, animation timing, and city renderer pass architecture unchanged

## Out of scope
- bespoke art for Moonwell Gardens, Ironroot Foundry, Tidecaller Bastion, Whispering Exchange, Hall of Champions, Gate of the World, Leviathan Drydock, and Manhattan Project
- UI, gameplay, save, SFX/audio, sprites, animation, external asset attribution, PWA, Tauri, rival-intel, and city-render-pass changes

## Why this is safe to merge partial
This MR only changes authored Canvas glyphs inside already-visible legendary landmark medallions. It adds no player actions, buttons, panels, queues, audio triggers, external assets, sprites, animations, or new visibility paths, so it cannot create a dead-end UX. Generic silhouettes remain the fallback for all non-bespoke and unsupported asset keys.

## Verification
- `./scripts/run-with-mise.sh yarn test --run tests/systems/legendary-wonder-landmark-catalog.test.ts tests/renderer/legendary-wonder-renderer.test.ts`
- `scripts/check-src-rule-violations.sh src/systems/legendary-wonder-landmark-catalog.ts src/renderer/wonders/legendary-wonder-bespoke-assets.ts`
- `./scripts/run-wonder-regressions.sh`
- `./scripts/run-with-mise.sh yarn build`
- `./scripts/run-with-mise.sh yarn test`
```

- [ ] **Step 11: Push and create PR**

Run:

```bash
git push -u origin codex/stage-2i-mr2-knowledge-signal-bespoke
gh pr create --base main --head codex/stage-2i-mr2-knowledge-signal-bespoke --title "Stage 2I MR2 knowledge signal bespoke landmarks" --body-file /private/tmp/conquestoria-stage-2i-mr2-pr-body.md
```

## Plan Self-Review Notes

- Spec coverage: Tasks cover the four MR2 asset keys, registry support, bespoke render path, fallback preservation, construction ghost preservation, reduced-motion nonblank drawing, no-logo Internet constraint through design guardrails, UI/SFX non-scope, and final verification.
- Placeholder scan: no open-ended implementation placeholders are present.
- Type consistency: `assetKey`, `SUPPORTED_BESPOKE_LEGENDARY_LANDMARK_ASSET_KEYS`, `resolveLegendaryWonderBespokeAsset`, `LegendaryWonderBespokeAssetKey`, and `LegendaryWonderBespokeDrawOptions` match the existing source API.
- Regression focus: The plan intentionally leaves `src/renderer/wonders/legendary-wonder-renderer.ts`, Stage 2J intel helpers, Stage 2K city render passes, UI, and audio untouched unless tests reveal an integration break.
