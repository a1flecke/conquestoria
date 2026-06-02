# Audio: Era Advance Stinger Wiring Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire `STINGER.eraAdvance[era]` into `MusicDirector.handleEraAdvanced()` so the full "big reveal" stinger plays after the era-transition cue on each era advance.

**Architecture:** `handleEraAdvanced` (music-director.ts:50-55) already calls `playStingerWithDuck` for the short transition cue. A second sequential call with the full era-advance stinger completes the pair. The stinger OGGs and catalog entries already exist at `audio/stinger/era{1-5}-advance.ogg` — this is code-only.

**Tech Stack:** TypeScript, vitest

---

## Files

- Modify: `src/audio/music-director.ts` (lines 50–55)
- Modify: `tests/audio/music-director.test.ts` (add two stinger assertions)

---

## Background

`STINGER.eraAdvance` (audio-catalog.ts:72-83) has 5 era-keyed entries:

| era | stinger file | duration |
|-----|-------------|---------|
| 1 | `audio/stinger/era1-advance.ogg` | 4.963s |
| 2 | `audio/stinger/era2-advance.ogg` | 4.336s |
| 3 | `audio/stinger/era3-advance.ogg` | 5.000s |
| 4 | `audio/stinger/era4-advance.ogg` | 5.000s |
| 5 | `audio/stinger/era5-advance.ogg` | 5.000s |

`handleEraAdvanced` currently plays only `STINGER.eraTransitionCue[era]` (the short 1.5–2s cue).
The `eraAdvance` stinger is the full 5-second "big reveal" fanfare that was deferred pending design sign-off.

---

## Task 1: Wire eraAdvance Stinger

**Files:**
- Modify: `src/audio/music-director.ts:50-55`
- Modify: `tests/audio/music-director.test.ts`

- [ ] **Step 1: Read the existing test harness**

Before writing the test, read `tests/audio/music-director.test.ts` to understand the mock helpers
(`createMockMusicDirector`, `loader`, `mixer`, etc.) used by existing stinger tests.

Look for the existing test: `'handleCityFounded plays city-founded stinger'` — it shows the
pattern for asserting a stinger plays. Use the same pattern.

- [ ] **Step 2: Write failing test**

Add to `tests/audio/music-director.test.ts` inside the `describe('MusicDirector')` block:

```typescript
it('handleEraAdvanced plays the eraAdvance stinger for the resolved era', async () => {
  director.start({}, busHelper.bus);
  busHelper.emit('music:era-advanced', { era: 3 });
  await tick();

  const stingerPath = STINGER.eraAdvance[3].file;
  expect(loader.get).toHaveBeenCalledWith(stingerPath);
  expect(mixer.playOneShot).toHaveBeenCalledWith('stinger', loader.bufferFor(stingerPath));
});

it('handleEraAdvanced plays eraAdvance stinger exactly once per era-advance event', async () => {
  director.start({}, busHelper.bus);
  busHelper.emit('music:era-advanced', { era: 2 });
  await tick();

  const stingerPath = STINGER.eraAdvance[2].file;
  const stingerCalls = (mixer.playOneShot as ReturnType<typeof vi.fn>).mock.calls
    .filter(([bus, buf]) => buf === loader.bufferFor(stingerPath));
  expect(stingerCalls).toHaveLength(1);
});
```

Note: import `STINGER` from `'../../src/audio/audio-catalog'` if not already imported.

- [ ] **Step 3: Run test to verify it fails**

```bash
bash scripts/run-with-mise.sh yarn test tests/audio/music-director.test.ts
```

Expected: FAIL — `loader.get` not called with the eraAdvance path.

- [ ] **Step 4: Add eraAdvance stinger call to handleEraAdvanced**

In `src/audio/music-director.ts`, update `handleEraAdvanced` from:

```typescript
handleEraAdvanced(p: EraAdvancedPayload): void {
  const target: SnapshotId = this.intendedSnapshot === 'at-war' ? 'at-war' : 'peace';
  this.intendedSnapshot = target;
  this.mixer.setSnapshot(target, CROSSFADE_MS);
  void this.playStingerWithDuck(STINGER.eraTransitionCue[resolveEra(p.era)].file);
}
```

to:

```typescript
handleEraAdvanced(p: EraAdvancedPayload): void {
  const target: SnapshotId = this.intendedSnapshot === 'at-war' ? 'at-war' : 'peace';
  this.intendedSnapshot = target;
  this.mixer.setSnapshot(target, CROSSFADE_MS);
  void this.playStingerWithDuck(STINGER.eraTransitionCue[resolveEra(p.era)].file);
  void this.playStingerWithDuck(STINGER.eraAdvance[resolveEra(p.era)].file);
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
bash scripts/run-with-mise.sh yarn test tests/audio/music-director.test.ts
```

Expected: PASS.

- [ ] **Step 6: Run full suite + build**

```bash
bash scripts/run-with-mise.sh yarn test && bash scripts/run-with-mise.sh yarn build
```

Expected: both exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/audio/music-director.ts tests/audio/music-director.test.ts
git commit -m "feat(audio): wire eraAdvance stinger into MusicDirector.handleEraAdvanced"
```
