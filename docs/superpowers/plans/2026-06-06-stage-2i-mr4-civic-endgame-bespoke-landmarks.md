# Stage 2I-MR4 Civic And Endgame Bespoke Landmark Art Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Do not use subagents unless the user explicitly authorizes them.

**Goal:** Add bespoke Canvas landmark glyphs for Whispering Exchange, Hall of Champions, Gate of the World, and Manhattan Project while preserving existing visibility, UI, SFX, sprites, renderer layers, fallback behavior, and gameplay.

**Architecture:** Extend the existing Stage 2I `assetKey` registry and metadata catalog. `src/renderer/wonders/legendary-wonder-bespoke-assets.ts` remains the only module that knows how to draw bespoke primitives, while `src/renderer/wonders/legendary-wonder-renderer.ts` keeps the existing resolver integration unchanged. UI, Codex, Atlas, city panel, territory inspection, Stage 2J intel, audio, sprites, PWA/Tauri, and Stage 2K city render pass code remain untouched.

**Tech Stack:** TypeScript, Canvas 2D primitives, Vitest, existing legendary landmark metadata, existing city renderer pass pipeline, `./scripts/run-with-mise.sh yarn ...`.

---

## Scope Check

Implement only:

- `whispering-exchange` -> `whispering-exchange-bespoke`
- `hall-of-champions` -> `hall-of-champions-bespoke`
- `gate-of-the-world` -> `gate-of-the-world-bespoke`
- `manhattan-project` -> `manhattan-project-bespoke`
- renderer support for those four keys
- tests that every current legendary wonder now has a supported bespoke key
- tests that MR4 completed landmarks draw through the bespoke path
- tests that fallback, construction ghosts, reduced motion, and existing MR1/MR2/MR3 bespoke keys still work

Do not change gameplay, saves, UI actions, map actions, Codex actions, panels, SFX/audio, mixer behavior, sprites, terrain tiles, improvement markers, PWA, Tauri, service worker, Stage 2J intel rules, or Stage 2K city renderer pass architecture.

## File Structure

- Modify: `tests/systems/legendary-wonder-landmark-catalog.test.ts`
  - Update the approved bespoke asset-key test from MR1+MR2+MR3 to all current legendary wonders.
  - Add an assertion that every current legendary wonder definition has an authored `assetKey`.
  - Keep unsupported-key coverage against `SUPPORTED_BESPOKE_LEGENDARY_LANDMARK_ASSET_KEYS`.
- Modify: `tests/renderer/legendary-wonder-renderer.test.ts`
  - Add MR4 bespoke render-path coverage.
  - Move generic fallback coverage from `whispering-exchange` to an unknown/future wonder ID.
  - Add reduced-motion nonblank coverage for MR4 glyphs.
  - Add under-construction ghost coverage for MR4 glyphs.
  - Add geometry distinctness coverage for MR4 glyphs.
- Modify: `src/systems/legendary-wonder-landmark-catalog.ts`
  - Add four `assetKey` arguments to the existing `landmark(...)` entries.
- Modify: `src/renderer/wonders/legendary-wonder-bespoke-assets.ts`
  - Add four supported keys and registry entries.
  - Add four deterministic Canvas primitive draw functions.

## Execution Preflight

Run:

```bash
git status -sb
rg -n "whispering-exchange|hall-of-champions|gate-of-the-world|manhattan-project|SUPPORTED_BESPOKE_LEGENDARY_LANDMARK_ASSET_KEYS" tests/systems/legendary-wonder-landmark-catalog.test.ts tests/renderer/legendary-wonder-renderer.test.ts src/systems/legendary-wonder-landmark-catalog.ts src/renderer/wonders/legendary-wonder-bespoke-assets.ts
```

Expected before implementation:

- branch is `codex/stage-2i-mr4-civic-endgame-bespoke`
- working tree is clean unless this plan itself is being edited
- `SUPPORTED_BESPOKE_LEGENDARY_LANDMARK_ASSET_KEYS` contains MR1, MR2, and MR3 keys only
- `whispering-exchange`, `hall-of-champions`, `gate-of-the-world`, and `manhattan-project` exist in `src/systems/legendary-wonder-landmark-catalog.ts` without an `assetKey` argument
- renderer fallback tests still use `whispering-exchange`, which this plan moves to an unknown/future ID

## Player Truth Table

| Before | Player action | Immediate visible result | Must remain reachable |
|---|---|---|---|
| Player owns completed Whispering Exchange and views host city on map | View map | Exchange medallion uses trade/ledger/whisper bespoke glyph | City label, badges, overflow `+N`, generic fallback for future unknown wonders |
| Player owns completed Hall of Champions and views host city on map | View map | Hall medallion uses hall/laurel/champion bespoke glyph | Victory UI remains separate; no new action appears |
| Player owns completed Gate of the World and views host city on map | View map | Gate medallion uses gateway/horizon bespoke glyph | Movement, route, and map-edge behaviors remain unchanged |
| Player owns completed Manhattan Project and views host city on map | View map | Manhattan medallion uses abstract atom/lab bespoke glyph | Research, warning, damage, and combat indicators remain separate |
| Player is building any MR4 wonder | View map/city panel | Existing construction ghost renders, not completed bespoke glyph | Existing progress gates and panel previews |
| Rival has completed intel only | View map/Atlas/Codex/inspection | No new host, map marker, preview, or action appears | Existing safe rival intel text |

## Misleading UI Risks

- Whisper arcs are decorative identity marks only. They must not look like sound meters, notification pings, espionage actions, or audio indicators.
- Hall laurels are decorative identity only. They must not imply victory progress, achievement claim buttons, or selectable awards.
- Gate horizon marks are decorative identity only. They must not imply movement portals, route overlays, map-edge wrapping, or clickable travel actions.
- Manhattan atom/lab marks are decorative identity only. They must not look like warning icons, explosions, damage markers, active research controls, mushroom clouds, bombs, skulls, or fallout symbols.
- Adding the final four `assetKey` values must not remove renderer fallback safety for unknown/future wonders or unsupported ad hoc keys.
- Construction ghosts must not switch to completed bespoke art while a project is still under construction.
- MR4 art uses Canvas primitives inside the existing landmark medallion. Do not add sprite-catalog entries, generated SVG sprites, terrain tiles, improvement markers, external assets, or attribution changes.
- MR4 glyphs are static identity art. Do not add new animation timing, `nowMs`-dependent meaning, pulsing alerts, or motion-only state communication.

## Task 1: Update Catalog Asset-Key Tests

**Files:**

- Modify: `tests/systems/legendary-wonder-landmark-catalog.test.ts`
- Test: `tests/systems/legendary-wonder-landmark-catalog.test.ts`

- [ ] **Step 1: Extend the approved bespoke asset-key test**

In `tests/systems/legendary-wonder-landmark-catalog.test.ts`, rename the test `authors approved bespoke asset keys only for completed Stage 2I slices` to:

```ts
  it('authors supported bespoke asset keys for every current legendary wonder', () => {
```

Inside that test, add these assertions after the existing `leviathan-drydock` assertion:

```ts
    expect(getLegendaryWonderLandmarkMetadata('whispering-exchange').assetKey).toBe('whispering-exchange-bespoke');
    expect(getLegendaryWonderLandmarkMetadata('hall-of-champions').assetKey).toBe('hall-of-champions-bespoke');
    expect(getLegendaryWonderLandmarkMetadata('gate-of-the-world').assetKey).toBe('gate-of-the-world-bespoke');
    expect(getLegendaryWonderLandmarkMetadata('manhattan-project').assetKey).toBe('manhattan-project-bespoke');
```

Add this definition coverage block after those individual assertions:

```ts
    const definitionIds = getLegendaryWonderDefinitions().map(definition => definition.id).sort();
    const keyedWonderIds = getLegendaryWonderLandmarkMetadataCatalog()
      .filter(entry => entry.assetKey)
      .map(entry => entry.wonderId)
      .sort();

    expect(keyedWonderIds).toEqual(definitionIds);
```

Replace the expected `keyed` array with the full current catalog order:

```ts
    expect(keyed).toEqual([
      ['oracle-of-delphi', 'oracle-of-delphi-bespoke'],
      ['grand-canal', 'grand-canal-bespoke'],
      ['sun-spire', 'sun-spire-bespoke'],
      ['world-archive', 'world-archive-bespoke'],
      ['moonwell-gardens', 'moonwell-gardens-bespoke'],
      ['ironroot-foundry', 'ironroot-foundry-bespoke'],
      ['tidecaller-bastion', 'tidecaller-bastion-bespoke'],
      ['starvault-observatory', 'starvault-observatory-bespoke'],
      ['whispering-exchange', 'whispering-exchange-bespoke'],
      ['hall-of-champions', 'hall-of-champions-bespoke'],
      ['gate-of-the-world', 'gate-of-the-world-bespoke'],
      ['leviathan-drydock', 'leviathan-drydock-bespoke'],
      ['storm-signal-spire', 'storm-signal-spire-bespoke'],
      ['manhattan-project', 'manhattan-project-bespoke'],
      ['internet', 'internet-bespoke'],
    ]);
```

- [ ] **Step 2: Run the catalog test to verify RED**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/legendary-wonder-landmark-catalog.test.ts
```

Expected: FAIL. The failure should report `whispering-exchange`, `hall-of-champions`, `gate-of-the-world`, or `manhattan-project` `assetKey` values as `undefined`, because metadata and registry keys have not been added yet.

- [ ] **Step 3: Commit the failing catalog test**

Run:

```bash
git add tests/systems/legendary-wonder-landmark-catalog.test.ts
git commit -m "test(wonders): require civic endgame bespoke asset keys"
```

## Task 2: Add Renderer Tests For MR4 Bespoke Glyphs

**Files:**

- Modify: `tests/renderer/legendary-wonder-renderer.test.ts`
- Test: `tests/renderer/legendary-wonder-renderer.test.ts`

- [ ] **Step 1: Add MR4 bespoke render-path test**

Add this test after `draws material-and-maritime completed landmarks through bespoke asset renderers`:

```ts
  it('draws civic-and-endgame completed landmarks through bespoke asset renderers', () => {
    const expected = [
      ['whispering-exchange', 'whispering-exchange-bespoke'],
      ['hall-of-champions', 'hall-of-champions-bespoke'],
      ['gate-of-the-world', 'gate-of-the-world-bespoke'],
      ['manhattan-project', 'manhattan-project-bespoke'],
    ] as const;

    for (const [wonderId, assetKey] of expected) {
      const ctx = drawCompletedGlyphForWonder(wonderId);

      expect(ctx.operations, wonderId).toContain(`bespoke:${assetKey}`);
      expectNonblankCanvasGlyph(ctx, wonderId);
    }
  });
```

- [ ] **Step 2: Add MR4 visual distinctness test**

Add this test after the MR4 bespoke render-path test:

```ts
  it('draws distinct civic-and-endgame bespoke glyph geometry', () => {
    const wonderIds = ['whispering-exchange', 'hall-of-champions', 'gate-of-the-world', 'manhattan-project'];
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

- [ ] **Step 3: Add MR4 lookalike distinctness test**

Add this test after the MR4 visual distinctness test:

```ts
  it('keeps civic-and-endgame glyph geometry distinct from close existing bespoke landmarks', () => {
    const comparedWonderIds = [
      'oracle-of-delphi',
      'grand-canal',
      'world-archive',
      'starvault-observatory',
      'internet',
      'tidecaller-bastion',
      'whispering-exchange',
      'hall-of-champions',
      'gate-of-the-world',
      'manhattan-project',
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

- [ ] **Step 4: Update generic fallback tests to use an unknown/future wonder**

In `keeps generic silhouette fallback for completed landmarks without bespoke assets`, change:

```ts
      metadata: getLegendaryWonderLandmarkMetadata('whispering-exchange'),
```

to:

```ts
      metadata: getLegendaryWonderLandmarkMetadata('future-bespoke-fallback-test'),
```

In `keeps generic silhouette fallback for completed landmarks with unsupported bespoke asset keys`, change:

```ts
      ...getLegendaryWonderLandmarkMetadata('whispering-exchange'),
```

to:

```ts
      ...getLegendaryWonderLandmarkMetadata('future-bespoke-fallback-test'),
```

- [ ] **Step 5: Add MR4 construction ghost test**

Add this test after `keeps construction ghosts instead of completed bespoke art for material-and-maritime builds`:

```ts
  it('keeps construction ghosts instead of completed bespoke art for civic-and-endgame builds', () => {
    const wonderIds = ['whispering-exchange', 'hall-of-champions', 'gate-of-the-world', 'manhattan-project'];

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

- [ ] **Step 6: Add reduced-motion MR4 nonblank test**

Add this test after the MR4 construction ghost test:

```ts
  it('draws nonblank civic-and-endgame bespoke glyphs with reduced motion', () => {
    const wonderIds = ['whispering-exchange', 'hall-of-champions', 'gate-of-the-world', 'manhattan-project'];

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

Expected: FAIL. The MR4 bespoke render-path test should fail because the new metadata keys and bespoke registry entries do not exist yet.

- [ ] **Step 8: Commit the failing renderer tests**

Run:

```bash
git add tests/renderer/legendary-wonder-renderer.test.ts
git commit -m "test(wonders): require civic endgame bespoke renderers"
```

## Task 3: Add MR4 Asset Keys And Bespoke Draw Functions

**Files:**

- Modify: `src/systems/legendary-wonder-landmark-catalog.ts`
- Modify: `src/renderer/wonders/legendary-wonder-bespoke-assets.ts`
- Test: `tests/systems/legendary-wonder-landmark-catalog.test.ts`
- Test: `tests/renderer/legendary-wonder-renderer.test.ts`

- [ ] **Step 1: Add MR4 keys to supported key list**

In `src/renderer/wonders/legendary-wonder-bespoke-assets.ts`, add these keys after `leviathan-drydock-bespoke`:

```ts
  'whispering-exchange-bespoke',
  'hall-of-champions-bespoke',
  'gate-of-the-world-bespoke',
  'manhattan-project-bespoke',
```

- [ ] **Step 2: Add MR4 registry entries**

In the `BESPOKE_ASSETS` object, add these entries after `leviathan-drydock-bespoke`:

```ts
  'whispering-exchange-bespoke': { key: 'whispering-exchange-bespoke', draw: drawWhisperingExchange },
  'hall-of-champions-bespoke': { key: 'hall-of-champions-bespoke', draw: drawHallOfChampions },
  'gate-of-the-world-bespoke': { key: 'gate-of-the-world-bespoke', draw: drawGateOfTheWorld },
  'manhattan-project-bespoke': { key: 'manhattan-project-bespoke', draw: drawManhattanProject },
```

- [ ] **Step 3: Add `drawWhisperingExchange`**

Add this function after `drawLeviathanDrydock`:

```ts
function drawWhisperingExchange(options: LegendaryWonderBespokeDrawOptions): void {
  const { ctx, cx, cy, radius, metadata } = options;
  markBespoke(ctx, 'whispering-exchange-bespoke');
  ctx.fillStyle = metadata.palette.accent;
  ctx.strokeStyle = metadata.palette.glow;
  ctx.lineWidth = Math.max(1, radius * 0.07);

  ctx.beginPath();
  ctx.rect(cx - radius * 0.52, cy - radius * 0.28, radius * 1.04, radius * 0.56);
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx - radius * 0.22, cy + radius * 0.08, radius * 0.14, 0, Math.PI * 2);
  ctx.arc(cx + radius * 0.22, cy + radius * 0.08, radius * 0.14, 0, Math.PI * 2);
  ctx.fillStyle = metadata.palette.glow;
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(cx - radius * 0.64, cy - radius * 0.48);
  ctx.lineTo(cx - radius * 0.28, cy - radius * 0.62);
  ctx.lineTo(cx + radius * 0.08, cy - radius * 0.48);
  ctx.moveTo(cx + radius * 0.64, cy - radius * 0.48);
  ctx.lineTo(cx + radius * 0.28, cy - radius * 0.62);
  ctx.lineTo(cx - radius * 0.08, cy - radius * 0.48);
  ctx.moveTo(cx - radius * 0.38, cy + radius * 0.38);
  ctx.lineTo(cx + radius * 0.38, cy + radius * 0.38);
  ctx.strokeStyle = metadata.palette.glow;
  ctx.stroke();
}
```

- [ ] **Step 4: Add `drawHallOfChampions`**

Add this function after `drawWhisperingExchange`:

```ts
function drawHallOfChampions(options: LegendaryWonderBespokeDrawOptions): void {
  const { ctx, cx, cy, radius, metadata } = options;
  markBespoke(ctx, 'hall-of-champions-bespoke');
  ctx.fillStyle = metadata.palette.accent;
  ctx.strokeStyle = metadata.palette.glow;
  ctx.lineWidth = Math.max(1, radius * 0.07);

  ctx.beginPath();
  ctx.moveTo(cx - radius * 0.58, cy - radius * 0.22);
  ctx.lineTo(cx, cy - radius * 0.58);
  ctx.lineTo(cx + radius * 0.58, cy - radius * 0.22);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  for (let index = 0; index < 3; index += 1) {
    const x = cx - radius * 0.32 + index * radius * 0.32;
    ctx.rect(x - radius * 0.06, cy - radius * 0.18, radius * 0.12, radius * 0.58);
  }
  ctx.fillStyle = metadata.palette.accent;
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx - radius * 0.18, cy + radius * 0.04, radius * 0.28, Math.PI * 0.55, Math.PI * 1.35);
  ctx.arc(cx + radius * 0.18, cy + radius * 0.04, radius * 0.28, Math.PI * 1.65, Math.PI * 0.45, true);
  ctx.moveTo(cx - radius * 0.48, cy + radius * 0.5);
  ctx.lineTo(cx + radius * 0.48, cy + radius * 0.5);
  ctx.strokeStyle = metadata.palette.glow;
  ctx.stroke();
}
```

- [ ] **Step 5: Add `drawGateOfTheWorld`**

Add this function after `drawHallOfChampions`:

```ts
function drawGateOfTheWorld(options: LegendaryWonderBespokeDrawOptions): void {
  const { ctx, cx, cy, radius, metadata } = options;
  markBespoke(ctx, 'gate-of-the-world-bespoke');
  ctx.fillStyle = metadata.palette.accent;
  ctx.strokeStyle = metadata.palette.glow;
  ctx.lineWidth = Math.max(1, radius * 0.07);

  ctx.beginPath();
  ctx.moveTo(cx - radius * 0.54, cy + radius * 0.56);
  ctx.lineTo(cx - radius * 0.54, cy - radius * 0.08);
  ctx.arc(cx, cy - radius * 0.08, radius * 0.54, Math.PI, Math.PI * 2);
  ctx.lineTo(cx + radius * 0.54, cy + radius * 0.56);
  ctx.lineTo(cx + radius * 0.28, cy + radius * 0.56);
  ctx.lineTo(cx + radius * 0.28, cy - radius * 0.02);
  ctx.arc(cx, cy - radius * 0.02, radius * 0.28, 0, Math.PI, true);
  ctx.lineTo(cx - radius * 0.28, cy + radius * 0.56);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(cx - radius * 0.66, cy + radius * 0.2);
  ctx.lineTo(cx - radius * 0.26, cy + radius * 0.08);
  ctx.lineTo(cx + radius * 0.1, cy + radius * 0.2);
  ctx.lineTo(cx + radius * 0.66, cy + radius * 0.04);
  ctx.strokeStyle = metadata.palette.glow;
  ctx.stroke();
}
```

- [ ] **Step 6: Add `drawManhattanProject`**

Add this function after `drawGateOfTheWorld`:

```ts
function drawManhattanProject(options: LegendaryWonderBespokeDrawOptions): void {
  const { ctx, cx, cy, radius, metadata } = options;
  markBespoke(ctx, 'manhattan-project-bespoke');
  ctx.strokeStyle = metadata.palette.glow;
  ctx.lineWidth = Math.max(1, radius * 0.06);

  ctx.beginPath();
  ctx.arc(cx, cy, radius * 0.5, 0, Math.PI * 2);
  ctx.moveTo(cx - radius * 0.62, cy);
  ctx.lineTo(cx + radius * 0.62, cy);
  ctx.moveTo(cx - radius * 0.34, cy - radius * 0.5);
  ctx.lineTo(cx + radius * 0.34, cy + radius * 0.5);
  ctx.moveTo(cx + radius * 0.34, cy - radius * 0.5);
  ctx.lineTo(cx - radius * 0.34, cy + radius * 0.5);
  ctx.stroke();

  ctx.beginPath();
  ctx.rect(cx - radius * 0.16, cy - radius * 0.16, radius * 0.32, radius * 0.32);
  ctx.fillStyle = metadata.palette.accent;
  ctx.fill();
  ctx.strokeStyle = metadata.palette.glow;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, cy, radius * 0.1, 0, Math.PI * 2);
  ctx.fillStyle = metadata.palette.glow;
  ctx.fill();
}
```

- [ ] **Step 7: Add MR4 metadata asset keys**

In `src/systems/legendary-wonder-landmark-catalog.ts`, update these entries:

```ts
  'whispering-exchange': landmark('whispering-exchange', 'exchange', 'wide', 'trade', '#342c3f', '#e0bc72', '#fff0c4', 0.98, 'civicAura', 'glint', 'foundation', 'whispering-exchange-bespoke'),
  'hall-of-champions': landmark('hall-of-champions', 'hall', 'wide', 'victory', '#3a2931', '#e4aa62', '#ffe0a8', 1.03, 'dedicationGlow', 'pulse', 'outline', 'hall-of-champions-bespoke'),
  'gate-of-the-world': landmark('gate-of-the-world', 'gateway', 'wide', 'horizon', '#24364a', '#9fd3e8', '#e0f8ff', 1.06, 'civicAura', 'glint', 'scaffold', 'gate-of-the-world-bespoke'),
  'manhattan-project': landmark('manhattan-project', 'laboratory', 'compact', 'atom', '#31313c', '#d2d8e8', '#ffffff', 1, 'foundationPulse', 'pulse', 'outline', 'manhattan-project-bespoke'),
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
git commit -m "feat(wonders): complete bespoke legendary landmarks"
```

## Task 4: Final Review And Verification

**Files:**

- Review: `docs/superpowers/specs/2026-06-06-stage-2i-mr4-civic-endgame-bespoke-landmarks-design.md`
- Review: `docs/superpowers/plans/2026-06-06-stage-2i-mr4-civic-endgame-bespoke-landmarks.md`
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
sed -n '1,520p' src/renderer/wonders/legendary-wonder-bespoke-assets.ts
git diff --name-only origin/main...HEAD
```

Expected:

- only `src/renderer/wonders/legendary-wonder-bespoke-assets.ts` changes renderer drawing behavior
- no files under `src/ui/`, `src/audio/`, `public/audio/`, `src/platform/`, `src-tauri/`, or service-worker/PWA config changed
- no files under `src/renderer/sprites/`, `src/renderer/terrain/`, or `src/renderer/improvements/` changed
- no `src/renderer/city-render-passes.ts` or `src/renderer/city-renderer.ts` changes
- each MR4 draw function sets its own Canvas fill/stroke/line-width state before drawing
- each MR4 draw function uses `cx`, `cy`, and `radius`, not fixed screen coordinates
- each MR4 draw function is static identity art and does not add `nowMs`-dependent animation, alert pulses, or motion-only meaning
- `whispering-exchange-bespoke` whisper arcs read as landmark identity, not sound meters, notification pings, espionage-action prompts, or audio indicators
- `hall-of-champions-bespoke` laurels and columns read as landmark identity, not victory-progress meters or selectable award buttons
- `gate-of-the-world-bespoke` horizon marks read as landmark identity, not movement portals, route overlays, or map-edge actions
- `manhattan-project-bespoke` atom/lab geometry reads as landmark identity, not warning icons, explosions, damage markers, active research controls, mushroom clouds, bombs, skulls, or fallout symbols

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

- Spec coverage: Tasks cover the four MR4 asset keys, all-current-wonder key coverage, registry support, bespoke render path, fallback preservation for unknown/future IDs, construction ghost preservation, reduced-motion nonblank drawing, close-lookalike distinctness, UI/SFX/sprite non-scope, Manhattan Project sensitivity, and final verification.
- Placeholder scan: no open-ended implementation placeholders are present.
- Type consistency: `assetKey`, `SUPPORTED_BESPOKE_LEGENDARY_LANDMARK_ASSET_KEYS`, `resolveLegendaryWonderBespokeAsset`, `LegendaryWonderBespokeAssetKey`, and `LegendaryWonderBespokeDrawOptions` match the existing source API.
- Regression focus: The plan intentionally leaves `src/renderer/wonders/legendary-wonder-renderer.ts`, Stage 2J intel helpers, Stage 2K city render passes, UI, audio, sprites, gameplay, and saves untouched unless tests reveal an integration break.
