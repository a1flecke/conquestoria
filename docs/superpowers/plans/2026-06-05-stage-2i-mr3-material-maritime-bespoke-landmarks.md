# Stage 2I-MR3 Material And Maritime Bespoke Landmark Art Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Do not use subagents unless the user explicitly authorizes them.

**Goal:** Add bespoke Canvas landmark glyphs for Moonwell Gardens, Ironroot Foundry, Tidecaller Bastion, and Leviathan Drydock while preserving existing visibility, UI, SFX, sprites, renderer layers, and fallback behavior.

**Architecture:** Extend the existing Stage 2I `assetKey` registry and metadata catalog. `src/renderer/wonders/legendary-wonder-bespoke-assets.ts` remains the only module that knows how to draw bespoke primitives, while `src/renderer/wonders/legendary-wonder-renderer.ts` keeps the existing resolver integration unchanged. UI, Codex, Atlas, city panel, territory inspection, Stage 2J intel, audio, sprites, PWA/Tauri, and Stage 2K city render pass code remain untouched.

**Tech Stack:** TypeScript, Canvas 2D primitives, Vitest, existing legendary landmark metadata, existing city renderer pass pipeline, `./scripts/run-with-mise.sh yarn ...`.

---

## Scope Check

Implement only:

- `moonwell-gardens` -> `moonwell-gardens-bespoke`
- `ironroot-foundry` -> `ironroot-foundry-bespoke`
- `tidecaller-bastion` -> `tidecaller-bastion-bespoke`
- `leviathan-drydock` -> `leviathan-drydock-bespoke`
- renderer support for those four keys
- tests that authored keys resolve and draw through the bespoke path
- tests that fallback, construction ghosts, reduced motion, and existing MR1/MR2 bespoke keys still work

Do not implement bespoke art for:

- `whispering-exchange`
- `hall-of-champions`
- `gate-of-the-world`
- `manhattan-project`

Do not change gameplay, saves, UI actions, map actions, Codex actions, panels, SFX/audio, mixer behavior, sprites, terrain tiles, improvement markers, PWA, Tauri, service worker, Stage 2J intel rules, or Stage 2K city renderer pass architecture.

## File Structure

- Modify: `tests/systems/legendary-wonder-landmark-catalog.test.ts`
  - Update the approved bespoke asset-key test from MR1+MR2 to MR1+MR2+MR3.
  - Keep unsupported-key coverage against `SUPPORTED_BESPOKE_LEGENDARY_LANDMARK_ASSET_KEYS`.
- Modify: `tests/renderer/legendary-wonder-renderer.test.ts`
  - Add MR3 bespoke render-path coverage.
  - Move generic fallback coverage away from `moonwell-gardens` to `whispering-exchange`.
  - Add reduced-motion nonblank coverage for MR3 glyphs.
  - Add under-construction ghost coverage for MR3 glyphs.
  - Add geometry distinctness coverage for MR3 glyphs.
- Modify: `src/systems/legendary-wonder-landmark-catalog.ts`
  - Add four `assetKey` arguments to the existing `landmark(...)` entries.
- Modify: `src/renderer/wonders/legendary-wonder-bespoke-assets.ts`
  - Add four supported keys and registry entries.
  - Add four deterministic Canvas primitive draw functions.

## Execution Preflight

Run:

```bash
git status -sb
rg -n "moonwell-gardens|ironroot-foundry|tidecaller-bastion|leviathan-drydock|whispering-exchange|SUPPORTED_BESPOKE_LEGENDARY_LANDMARK_ASSET_KEYS" tests/systems/legendary-wonder-landmark-catalog.test.ts tests/renderer/legendary-wonder-renderer.test.ts src/systems/legendary-wonder-landmark-catalog.ts src/renderer/wonders/legendary-wonder-bespoke-assets.ts
```

Expected before implementation:

- branch is `codex/stage-2i-mr3-material-maritime-bespoke`
- working tree is clean unless the plan itself is being edited
- `SUPPORTED_BESPOKE_LEGENDARY_LANDMARK_ASSET_KEYS` contains MR1 and MR2 keys only
- `moonwell-gardens`, `ironroot-foundry`, `tidecaller-bastion`, and `leviathan-drydock` exist in `src/systems/legendary-wonder-landmark-catalog.ts` without an `assetKey` argument
- renderer fallback tests still use `moonwell-gardens`, which this plan moves to `whispering-exchange`

## Player Truth Table

| Before | Player action | Immediate visible result | Must remain reachable |
|---|---|---|---|
| Player owns completed Moonwell Gardens and views host city on map | View map | Moonwell medallion uses crescent/well/garden bespoke glyph | City label, badges, overflow `+N`, generic fallback for other wonders |
| Player owns completed Ironroot Foundry and views host city on map | View map | Foundry medallion uses root-forge/hearth bespoke glyph | Production badges remain visually separate |
| Player owns completed Tidecaller Bastion and views host city on map | View map | Bastion medallion uses coastal fort and wave bespoke glyph | Selected-tile and warning indicators remain visually separate |
| Player owns completed Leviathan Drydock and views host city on map | View map | Drydock medallion uses hull ribs/cradle bespoke glyph | Grand Canal and Tidecaller Bastion remain distinguishable |
| Player is building any MR3 wonder | View map/city panel | Existing construction ghost renders, not completed bespoke glyph | Existing progress gates and panel previews |
| Rival has completed intel only | View map/Atlas/Codex/inspection | No new host, map marker, preview, or action appears | Existing safe rival intel text |

## Misleading UI Risks

- Tidecaller waves are decorative identity marks only. They must not resemble warning badges, selected-tile pings, notification indicators, production badges, or audio indicators.
- Ironroot glow is decorative identity only. It must not imply active production, fire damage, unrest, or resource alerts.
- Adding `assetKey` must not imply that the final civic/endgame batch is bespoke. Tests must enforce the exact keyed set.
- Construction ghosts must not switch to completed bespoke art while a project is still under construction.
- MR3 art uses Canvas primitives inside the existing landmark medallion. Do not add sprite-catalog entries, generated SVG sprites, terrain tiles, improvement markers, or external asset attribution.
- MR3 glyphs are static identity art. Do not add new animation timing, `nowMs`-dependent meaning, pulsing alerts, or motion-only state communication.

## Task 1: Update Catalog Asset-Key Tests

**Files:**

- Modify: `tests/systems/legendary-wonder-landmark-catalog.test.ts`
- Test: `tests/systems/legendary-wonder-landmark-catalog.test.ts`

- [ ] **Step 1: Extend the approved bespoke asset-key test**

In `tests/systems/legendary-wonder-landmark-catalog.test.ts`, extend the test named `authors approved bespoke asset keys only for completed Stage 2I slices` so it includes these assertions after the existing MR2 assertions:

```ts
    expect(getLegendaryWonderLandmarkMetadata('moonwell-gardens').assetKey).toBe('moonwell-gardens-bespoke');
    expect(getLegendaryWonderLandmarkMetadata('ironroot-foundry').assetKey).toBe('ironroot-foundry-bespoke');
    expect(getLegendaryWonderLandmarkMetadata('tidecaller-bastion').assetKey).toBe('tidecaller-bastion-bespoke');
    expect(getLegendaryWonderLandmarkMetadata('leviathan-drydock').assetKey).toBe('leviathan-drydock-bespoke');
```

Also extend the expected `keyed` array in the same order returned by `getLegendaryWonderLandmarkMetadataCatalog()`. The four new rows should be interleaved with the existing entries according to the authored metadata order:

```ts
      ['moonwell-gardens', 'moonwell-gardens-bespoke'],
      ['ironroot-foundry', 'ironroot-foundry-bespoke'],
      ['tidecaller-bastion', 'tidecaller-bastion-bespoke'],
      ['starvault-observatory', 'starvault-observatory-bespoke'],
      ['leviathan-drydock', 'leviathan-drydock-bespoke'],
      ['storm-signal-spire', 'storm-signal-spire-bespoke'],
      ['internet', 'internet-bespoke'],
```

- [ ] **Step 2: Run the catalog test to verify RED**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/legendary-wonder-landmark-catalog.test.ts
```

Expected: FAIL. The failure should report `moonwell-gardens`, `ironroot-foundry`, `tidecaller-bastion`, or `leviathan-drydock` `assetKey` values as `undefined`, because metadata and registry keys have not been added yet.

- [ ] **Step 3: Commit the failing catalog test**

Run:

```bash
git add tests/systems/legendary-wonder-landmark-catalog.test.ts
git commit -m "test(wonders): require material maritime bespoke asset keys"
```

## Task 2: Add Renderer Tests For MR3 Bespoke Glyphs

**Files:**

- Modify: `tests/renderer/legendary-wonder-renderer.test.ts`
- Test: `tests/renderer/legendary-wonder-renderer.test.ts`

- [ ] **Step 1: Add MR3 bespoke render-path test**

Add this test after `draws knowledge-and-signal completed landmarks through bespoke asset renderers`:

```ts
  it('draws material-and-maritime completed landmarks through bespoke asset renderers', () => {
    const expected = [
      ['moonwell-gardens', 'moonwell-gardens-bespoke'],
      ['ironroot-foundry', 'ironroot-foundry-bespoke'],
      ['tidecaller-bastion', 'tidecaller-bastion-bespoke'],
      ['leviathan-drydock', 'leviathan-drydock-bespoke'],
    ] as const;

    for (const [wonderId, assetKey] of expected) {
      const ctx = drawCompletedGlyphForWonder(wonderId);

      expect(ctx.operations, wonderId).toContain(`bespoke:${assetKey}`);
      expectNonblankCanvasGlyph(ctx, wonderId);
    }
  });
```

- [ ] **Step 2: Add MR3 visual distinctness test**

Add this test after the MR3 bespoke render-path test:

```ts
  it('draws distinct material-and-maritime bespoke glyph geometry', () => {
    const wonderIds = ['moonwell-gardens', 'ironroot-foundry', 'tidecaller-bastion', 'leviathan-drydock'];
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

- [ ] **Step 3: Add MR3 lookalike distinctness test**

Add this test after the MR3 visual distinctness test:

```ts
  it('keeps material-and-maritime glyph geometry distinct from close existing bespoke landmarks', () => {
    const comparedWonderIds = [
      'grand-canal',
      'sun-spire',
      'world-archive',
      'starvault-observatory',
      'storm-signal-spire',
      'internet',
      'moonwell-gardens',
      'ironroot-foundry',
      'tidecaller-bastion',
      'leviathan-drydock',
    ];
    const profiles = new Set<string>();

    for (const wonderId of comparedWonderIds) {
      const ctx = drawCompletedGlyphForWonder(wonderId);
      const profile = getGlyphGeometryProfile(ctx);

      expect(profile.length, wonderId).toBeGreaterThan(0);
      profiles.add(profile);
    }

    expect(profiles.size).toBe(comparedWonderIds.length);
  });
```

- [ ] **Step 4: Update generic fallback tests to use a non-MR3 generic wonder**

In both generic fallback tests, change `moonwell-gardens` to `whispering-exchange`.

- [ ] **Step 5: Add MR3 construction ghost test**

Add this test after the knowledge-and-signal construction ghost test:

```ts
  it('keeps construction ghosts instead of completed bespoke art for material-and-maritime builds', () => {
    const wonderIds = ['moonwell-gardens', 'ironroot-foundry', 'tidecaller-bastion', 'leviathan-drydock'];

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

- [ ] **Step 6: Add reduced-motion MR3 nonblank test**

Add this test after the MR3 construction ghost test:

```ts
  it('draws nonblank material-and-maritime bespoke glyphs with reduced motion', () => {
    const wonderIds = ['moonwell-gardens', 'ironroot-foundry', 'tidecaller-bastion', 'leviathan-drydock'];

    for (const wonderId of wonderIds) {
      const ctx = drawCompletedGlyphForWonder(wonderId, { reducedMotion: true });

      expect(ctx.operations.some(operation => operation.startsWith('bespoke:')), wonderId).toBe(true);
      expectNonblankCanvasGlyph(ctx, wonderId);
    }
  });
```

- [ ] **Step 7: Run renderer tests to verify RED**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/renderer/legendary-wonder-renderer.test.ts
```

Expected: FAIL. The MR3 bespoke render-path test should fail because the new metadata keys and bespoke registry entries do not exist yet.

- [ ] **Step 8: Commit the failing renderer tests**

Run:

```bash
git add tests/renderer/legendary-wonder-renderer.test.ts
git commit -m "test(wonders): require material maritime bespoke renderers"
```

## Task 3: Add MR3 Asset Keys And Bespoke Draw Functions

**Files:**

- Modify: `src/systems/legendary-wonder-landmark-catalog.ts`
- Modify: `src/renderer/wonders/legendary-wonder-bespoke-assets.ts`
- Test: `tests/systems/legendary-wonder-landmark-catalog.test.ts`
- Test: `tests/renderer/legendary-wonder-renderer.test.ts`

- [ ] **Step 1: Add MR3 keys to supported key list**

In `src/renderer/wonders/legendary-wonder-bespoke-assets.ts`, add these keys after `internet-bespoke`:

```ts
  'moonwell-gardens-bespoke',
  'ironroot-foundry-bespoke',
  'tidecaller-bastion-bespoke',
  'leviathan-drydock-bespoke',
```

- [ ] **Step 2: Add MR3 registry entries**

In the `BESPOKE_ASSETS` object, add these entries after `internet-bespoke`:

```ts
  'moonwell-gardens-bespoke': { key: 'moonwell-gardens-bespoke', draw: drawMoonwellGardens },
  'ironroot-foundry-bespoke': { key: 'ironroot-foundry-bespoke', draw: drawIronrootFoundry },
  'tidecaller-bastion-bespoke': { key: 'tidecaller-bastion-bespoke', draw: drawTidecallerBastion },
  'leviathan-drydock-bespoke': { key: 'leviathan-drydock-bespoke', draw: drawLeviathanDrydock },
```

- [ ] **Step 3: Add `drawMoonwellGardens`**

Add this function after `drawInternet`:

```ts
function drawMoonwellGardens(options: LegendaryWonderBespokeDrawOptions): void {
  const { ctx, cx, cy, radius, metadata } = options;
  markBespoke(ctx, 'moonwell-gardens-bespoke');
  ctx.fillStyle = metadata.palette.accent;
  ctx.strokeStyle = metadata.palette.glow;
  ctx.lineWidth = Math.max(1, radius * 0.07);

  ctx.beginPath();
  ctx.arc(cx, cy + radius * 0.2, radius * 0.52, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx - radius * 0.08, cy - radius * 0.42, radius * 0.28, Math.PI * 0.2, Math.PI * 1.6);
  ctx.arc(cx + radius * 0.04, cy - radius * 0.42, radius * 0.22, Math.PI * 1.55, Math.PI * 0.25, true);
  ctx.fillStyle = metadata.palette.glow;
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(cx - radius * 0.56, cy + radius * 0.36);
  ctx.lineTo(cx - radius * 0.24, cy + radius * 0.18);
  ctx.lineTo(cx - radius * 0.08, cy + radius * 0.44);
  ctx.moveTo(cx + radius * 0.56, cy + radius * 0.36);
  ctx.lineTo(cx + radius * 0.24, cy + radius * 0.18);
  ctx.lineTo(cx + radius * 0.08, cy + radius * 0.44);
  ctx.strokeStyle = metadata.palette.glow;
  ctx.stroke();
}
```

- [ ] **Step 4: Add `drawIronrootFoundry`**

Add this function after `drawMoonwellGardens`:

```ts
function drawIronrootFoundry(options: LegendaryWonderBespokeDrawOptions): void {
  const { ctx, cx, cy, radius, metadata } = options;
  markBespoke(ctx, 'ironroot-foundry-bespoke');
  ctx.fillStyle = metadata.palette.accent;
  ctx.strokeStyle = metadata.palette.glow;
  ctx.lineWidth = Math.max(1, radius * 0.07);

  ctx.beginPath();
  ctx.moveTo(cx - radius * 0.36, cy + radius * 0.58);
  ctx.lineTo(cx - radius * 0.22, cy - radius * 0.48);
  ctx.lineTo(cx + radius * 0.22, cy - radius * 0.48);
  ctx.lineTo(cx + radius * 0.36, cy + radius * 0.58);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.rect(cx - radius * 0.14, cy - radius * 0.18, radius * 0.28, radius * 0.42);
  ctx.fillStyle = metadata.palette.glow;
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(cx - radius * 0.56, cy + radius * 0.58);
  ctx.lineTo(cx - radius * 0.24, cy + radius * 0.34);
  ctx.lineTo(cx - radius * 0.5, cy + radius * 0.08);
  ctx.moveTo(cx + radius * 0.56, cy + radius * 0.58);
  ctx.lineTo(cx + radius * 0.24, cy + radius * 0.34);
  ctx.lineTo(cx + radius * 0.5, cy + radius * 0.08);
  ctx.moveTo(cx - radius * 0.28, cy - radius * 0.02);
  ctx.lineTo(cx + radius * 0.28, cy - radius * 0.02);
  ctx.strokeStyle = metadata.palette.glow;
  ctx.stroke();
}
```

- [ ] **Step 5: Add `drawTidecallerBastion`**

Add this function after `drawIronrootFoundry`:

```ts
function drawTidecallerBastion(options: LegendaryWonderBespokeDrawOptions): void {
  const { ctx, cx, cy, radius, metadata } = options;
  markBespoke(ctx, 'tidecaller-bastion-bespoke');
  ctx.fillStyle = metadata.palette.accent;
  ctx.strokeStyle = metadata.palette.glow;
  ctx.lineWidth = Math.max(1, radius * 0.07);

  ctx.beginPath();
  ctx.moveTo(cx - radius * 0.58, cy + radius * 0.32);
  ctx.lineTo(cx - radius * 0.58, cy - radius * 0.28);
  ctx.lineTo(cx - radius * 0.38, cy - radius * 0.28);
  ctx.lineTo(cx - radius * 0.38, cy - radius * 0.48);
  ctx.lineTo(cx - radius * 0.16, cy - radius * 0.48);
  ctx.lineTo(cx - radius * 0.16, cy - radius * 0.28);
  ctx.lineTo(cx + radius * 0.16, cy - radius * 0.28);
  ctx.lineTo(cx + radius * 0.16, cy - radius * 0.48);
  ctx.lineTo(cx + radius * 0.38, cy - radius * 0.48);
  ctx.lineTo(cx + radius * 0.38, cy - radius * 0.28);
  ctx.lineTo(cx + radius * 0.58, cy - radius * 0.28);
  ctx.lineTo(cx + radius * 0.58, cy + radius * 0.32);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, cy + radius * 0.42, radius * 0.52, Math.PI, Math.PI * 2);
  ctx.strokeStyle = metadata.palette.glow;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(cx - radius * 0.52, cy + radius * 0.52);
  ctx.lineTo(cx - radius * 0.18, cy + radius * 0.42);
  ctx.lineTo(cx + radius * 0.18, cy + radius * 0.52);
  ctx.lineTo(cx + radius * 0.52, cy + radius * 0.42);
  ctx.stroke();
}
```

- [ ] **Step 6: Add `drawLeviathanDrydock`**

Add this function after `drawTidecallerBastion`:

```ts
function drawLeviathanDrydock(options: LegendaryWonderBespokeDrawOptions): void {
  const { ctx, cx, cy, radius, metadata } = options;
  markBespoke(ctx, 'leviathan-drydock-bespoke');
  ctx.fillStyle = metadata.palette.accent;
  ctx.strokeStyle = metadata.palette.glow;
  ctx.lineWidth = Math.max(1, radius * 0.07);

  ctx.beginPath();
  ctx.moveTo(cx - radius * 0.62, cy + radius * 0.24);
  ctx.lineTo(cx - radius * 0.36, cy + radius * 0.52);
  ctx.lineTo(cx + radius * 0.36, cy + radius * 0.52);
  ctx.lineTo(cx + radius * 0.62, cy + radius * 0.24);
  ctx.lineTo(cx + radius * 0.34, cy - radius * 0.12);
  ctx.lineTo(cx - radius * 0.34, cy - radius * 0.12);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  for (let index = 0; index < 4; index += 1) {
    const x = cx - radius * 0.36 + index * radius * 0.24;
    ctx.moveTo(x, cy + radius * 0.5);
    ctx.lineTo(cx, cy - radius * 0.44 + index * radius * 0.05);
  }
  ctx.moveTo(cx - radius * 0.46, cy + radius * 0.04);
  ctx.lineTo(cx + radius * 0.46, cy + radius * 0.04);
  ctx.strokeStyle = metadata.palette.glow;
  ctx.stroke();

  ctx.beginPath();
  ctx.rect(cx - radius * 0.5, cy - radius * 0.58, radius * 0.16, radius * 0.36);
  ctx.rect(cx + radius * 0.34, cy - radius * 0.58, radius * 0.16, radius * 0.36);
  ctx.fillStyle = metadata.palette.glow;
  ctx.fill();
}
```

- [ ] **Step 7: Add MR3 metadata asset keys**

In `src/systems/legendary-wonder-landmark-catalog.ts`, update these entries:

```ts
  'moonwell-gardens': landmark('moonwell-gardens', 'garden', 'wide', 'moon', '#203b34', '#9fd7a0', '#def7bf', 1, 'civicAura', 'spark', 'foundation', 'moonwell-gardens-bespoke'),
  'ironroot-foundry': landmark('ironroot-foundry', 'foundry', 'compact', 'forge', '#3a2b26', '#e08b52', '#ffd2a0', 1.04, 'foundationPulse', 'pulse', 'scaffold', 'ironroot-foundry-bespoke'),
  'tidecaller-bastion': landmark('tidecaller-bastion', 'bastion', 'wide', 'tide', '#18364b', '#7ec7e8', '#cff5ff', 1.03, 'civicAura', 'glint', 'outline', 'tidecaller-bastion-bespoke'),
  'leviathan-drydock': landmark('leviathan-drydock', 'drydock', 'wide', 'shipwright', '#23384d', '#80bfe2', '#c8eeff', 1.06, 'foundationPulse', 'pulse', 'foundation', 'leviathan-drydock-bespoke'),
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
git commit -m "feat(wonders): add material maritime bespoke landmarks"
```

## Task 4: Final Review And Verification

**Files:**

- Review: `docs/superpowers/specs/2026-06-05-stage-2i-mr3-material-maritime-bespoke-landmarks-design.md`
- Review: `docs/superpowers/plans/2026-06-05-stage-2i-mr3-material-maritime-bespoke-landmarks.md`
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
- no UI, audio, gameplay, save, platform, PWA, sprite, or city-render-pass files changed

- [ ] **Step 2: Review visual, UI, UX, SFX, sprite, and animation scope**

Run:

```bash
sed -n '1,360p' src/renderer/wonders/legendary-wonder-bespoke-assets.ts
git diff --name-only origin/main...HEAD
```

Expected:

- only `src/renderer/wonders/legendary-wonder-bespoke-assets.ts` changes renderer drawing behavior
- no files under `src/ui/`, `src/audio/`, `public/audio/`, `src/platform/`, `src-tauri/`, or service-worker/PWA config changed
- no files under `src/renderer/sprites/`, `src/renderer/terrain/`, or `src/renderer/improvements/` changed
- no `src/renderer/city-render-passes.ts` or `src/renderer/city-renderer.ts` changes
- each MR3 draw function sets its own Canvas fill/stroke/line-width state before drawing
- each MR3 draw function uses `cx`, `cy`, and `radius`, not fixed screen coordinates
- each MR3 draw function is static identity art and does not add `nowMs`-dependent animation, alert pulses, or motion-only meaning
- `tidecaller-bastion-bespoke` waves read as landmark identity, not warning badges, selected-tile pings, production icons, or audio indicators
- `ironroot-foundry-bespoke` glow reads as landmark identity, not active production, fire damage, unrest, or a resource alert

- [ ] **Step 3: Run targeted tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/legendary-wonder-landmark-catalog.test.ts tests/renderer/legendary-wonder-renderer.test.ts
```

Expected: PASS.

- [ ] **Step 4: Run source rule check**

Run:

```bash
scripts/check-src-rule-violations.sh src/systems/legendary-wonder-landmark-catalog.ts src/renderer/wonders/legendary-wonder-bespoke-assets.ts
```

Expected: exits 0.

- [ ] **Step 5: Run wonder regressions**

Run:

```bash
./scripts/run-wonder-regressions.sh
```

Expected: PASS. If it emits the known sandbox-only mise cache warning but exits 0, record the warning in the verification notes.

- [ ] **Step 6: Run build**

Run:

```bash
./scripts/run-with-mise.sh yarn build
```

Expected: PASS. If it emits the existing Vite chunk-size warning but exits 0, record the warning in the verification notes.

- [ ] **Step 7: Run full tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test
```

Expected: PASS.

## Plan Self-Review Notes

- Spec coverage: Tasks cover the four MR3 asset keys, registry support, bespoke render path, fallback preservation, construction ghost preservation, reduced-motion nonblank drawing, close-lookalike distinctness, UI/SFX/sprite non-scope, and final verification.
- Placeholder scan: no open-ended implementation placeholders are present.
- Type consistency: `assetKey`, `SUPPORTED_BESPOKE_LEGENDARY_LANDMARK_ASSET_KEYS`, `resolveLegendaryWonderBespokeAsset`, `LegendaryWonderBespokeAssetKey`, and `LegendaryWonderBespokeDrawOptions` match the existing source API.
- Regression focus: The plan intentionally leaves `src/renderer/wonders/legendary-wonder-renderer.ts`, Stage 2J intel helpers, Stage 2K city render passes, UI, audio, and sprites untouched unless tests reveal an integration break.
