# Stage 3B Wonder Video Batch 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Do not use subagents unless the user explicitly authorizes them.

**Goal:** Add the second small wonder-video batch: exactly three natural-wonder clips and three legendary-wonder clips selected by likelihood first, then source quality, while preserving the existing silent local video architecture.

**Architecture:** Extend `src/systems/wonder-codex/video-sources.ts` and the existing `videoPreview` presentation path. Add batch metadata to typed video sources for auditability only. Do not branch UI behavior by batch id, do not add audio/SFX playback, do not change gameplay state, save format, PWA registration, Tauri/platform code, map rendering, city rendering, or wonder rules.

**Tech Stack:** TypeScript, Vitest/jsdom, DOM `<video>`, existing Wonder Codex presentation helpers, existing ceremony UI hosts, local public MP4 assets, `ffmpeg`/`ffprobe`, existing source ledger.

**Target Implementer:** Sonnet 4.5-era model on medium effort. This plan provides exact files, expected failing tests, source records, asset commands, verification commands, and review checkpoints.

---

## Spec Review Result

The design spec is `docs/superpowers/specs/2026-06-07-stage-3b-wonder-video-batch-2-design.md`.

Review fixes already applied before writing this plan:

- The spec now names the final six Stage 3B wonders instead of leaving selection to implementation.
- The spec now records source-quality ordering and skipped-candidate reasons for every top-ten likelihood candidate.
- The spec keeps `sfxCueId` reserved as metadata only and explicitly forbids audio/SFX playback in this slice.
- The spec keeps the architecture data-driven through existing Wonder Codex video helpers and forbids UI branching by `batchId`.
- The spec requires tests for batch counts, source metadata, local files, silence, size thresholds, viewer-safe presentation, reduced motion, playback fallback, and existing Stage 3 spike regressions.

Do not change the selected six during implementation unless asset preparation fails under the hard rules. If a selected source fails, move only to the listed alternate within the same top-ten shortlist and update the spec and this plan before coding the alternate.

## Selected Batch

| Category | Wonder ID | Video source ID | Source URL | Creator / License | Local asset | Surfaces | Fallback |
|---|---|---|---|---|---|---|---|
| Natural | `sacred_mountain` | `video-sacred-mountain-everest-flyover` | `https://commons.wikimedia.org/wiki/File:EVEREST.webm` | Sgascoin / CC BY-SA 4.0 | `/videos/wonders/sacred-mountain-everest-flyover.mp4` | `codex`, `natural-reveal` | `image-mountain` |
| Natural | `coral_reef` | `video-coral-reef-art-park` | `https://commons.wikimedia.org/wiki/File:Coral_Reef_Art.webm` | VOA Africa / public domain VOA material | `/videos/wonders/coral-reef-art-park.mp4` | `codex`, `natural-reveal` | `image-coral` |
| Natural | `grand_canyon` | `video-grand-canyon-cira-night-fires` | `https://commons.wikimedia.org/wiki/File:Grand_Canyon_Wildfires_at_Night_(CIRA_2025-07-14_-_nolabels).webm` | CSU/CIRA and NOAA/NESDIS / public domain NOAA material | `/videos/wonders/grand-canyon-cira-night-fires.mp4` | `codex`, `natural-reveal` | `image-grand-canyon` |
| Legendary | `oracle-of-delphi` | `video-oracle-of-delphi-melies` | `https://commons.wikimedia.org/wiki/File:L%27Oracle_de_Delphes_(1903).webm` | Georges Melies / public domain | `/videos/wonders/oracle-of-delphi-melies.mp4` | `codex`, `legendary-completion` | `image-delphi` |
| Legendary | `grand-canal` | `video-grand-canal-gongchen-hangzhou` | `https://commons.wikimedia.org/wiki/File:Grand_Canal_Gongchen_Hangzhou.webm` | Charlie fong / CC BY-SA 4.0 | `/videos/wonders/grand-canal-gongchen-hangzhou.mp4` | `codex`, `legendary-completion` | `image-canal` |
| Legendary | `moonwell-gardens` | `video-moonwell-gardens-flower-bloom` | `https://commons.wikimedia.org/wiki/File:Time-lapse_of_a_flower_blooming.webm` | Ajith Samuel / CC BY 3.0 | `/videos/wonders/moonwell-gardens-flower-bloom.mp4` | `codex`, `legendary-completion` | `image-garden` |

Existing Stage 3 spike records remain:

- `video-great-volcano-tonga-eruption` for `great_volcano`
- `video-starvault-paranal-observatory` for `starvault-observatory`

After this plan, `getWonderCodexVideoSources()` must return exactly eight records: two `stage-3-spike` records and six `stage-3b-batch-2` records.

## Player Truth Table

| Before | Player action | Immediate visible result | Must remain reachable |
|---|---|---|---|
| Supported Stage 3B natural wonder is visible in the Codex | Open its Codex page | Existing Codex page shows muted looped video with pause/play control | Source link, page text, map action, related entries, fallback image |
| Supported Stage 3B legendary wonder is visible in the Codex | Open its Codex page | Existing Codex page shows muted looped video with pause/play control | Source link, page text, city/status actions, related entries, fallback image |
| Stage 3B natural wonder is discovered by the active human viewer | Natural reveal ceremony opens | Existing ceremony video slot renders the new natural-reveal preview | Skip, Continue, Open Atlas |
| Stage 3B legendary wonder is completed by the active human owner | Legendary completion ceremony opens | Existing ceremony video slot renders the new legendary-completion preview | Skip, Continue, Open City, Open Journal |
| Reduced motion is active | Open any supported Stage 3B surface | Existing still fallback renders; no video playback element is presented | All normal text and actions |
| Video playback errors or autoplay is blocked | Browser fires the existing media failure path | Existing fallback image replaces video without collapsing the page/card | All normal text and actions |
| Unsupported wonder is visible | Open Codex or ceremony | No `videoPreview`; existing still/vignette surface remains | All normal text and actions |
| Rival legendary project/completion is not viewer-safe | Open Codex with rival intel only | No video preview and no private host-city/map data leaks | Safe intel summary only |

## Misleading UI Risks

- `batchId` must never imply eligibility. It is audit metadata only.
- `videoPreview` must remain the only signal that a UI surface should render video.
- Do not use `coral_reef` or `oracle-of-delphi` as unsupported-video fixtures after this batch; both become supported.
- Silent video must not imply sound. Do not add audio labels, volume controls, Web Audio nodes, `HTMLAudioElement`, mixer calls, or SFX playback.
- Reduced motion must render the sourced still fallback rather than a video element that merely does not autoplay.
- The Grand Canyon clip is an institutional satellite-motion derivative; the existing still image remains the primary scenic fallback identity if video cannot play.
- Local files must fail loudly in tests if missing, oversized, misattributed, or still containing audio streams.

## Interaction Replay Checklist

- Open the Codex page for `sacred_mountain`; verify video appears, Pause changes to Play, and fallback still appears after a simulated video error.
- Open the Codex page for `oracle-of-delphi`; verify video appears only when existing legendary visibility allows it.
- Open a natural discovery ceremony for `coral_reef`; verify the existing video slot renders and Skip/Continue still work.
- Open a legendary completion ceremony for `grand-canal`; verify the existing video slot renders and Open City/Open Journal still work.
- Re-run reduced-motion UI tests and verify every supported Stage 3B preview renders as a still fallback.
- Open an unsupported visible Codex page such as `crystal_caverns`; verify no broken video affordance appears.

## Task 1: Write RED Manifest And Batch Tests

**Files:**

- Modify `tests/systems/wonder-codex/sources.test.ts`
- Modify `src/systems/wonder-codex/types.ts`
- Modify `src/systems/wonder-codex/video-sources.ts`

- [ ] Add the new batch type in `src/systems/wonder-codex/types.ts`:

```ts
export type WonderCodexVideoBatchId = 'stage-3-spike' | 'stage-3b-batch-2';
```

- [ ] Add `batchId: WonderCodexVideoBatchId;` to `WonderCodexVideoSource`.

- [ ] In `tests/systems/wonder-codex/sources.test.ts`, replace the current video-source test name and fixed length assertions with Stage 3B expectations:

```ts
const STAGE_3_SPIKE_WONDERS = new Set(['great_volcano', 'starvault-observatory']);
const STAGE_3B_NATURAL_VIDEO_WONDERS = new Set(['sacred_mountain', 'coral_reef', 'grand_canyon']);
const STAGE_3B_LEGENDARY_VIDEO_WONDERS = new Set(['oracle-of-delphi', 'grand-canal', 'moonwell-gardens']);
const STAGE_3B_HARD_BATCH_BYTES = 18 * 1024 * 1024;
```

Use these assertions inside the test:

```ts
const sources = getWonderCodexVideoSources();
expect(sources).toHaveLength(8);

const stage3Spike = sources.filter(source => source.batchId === 'stage-3-spike');
expect(new Set(stage3Spike.map(source => source.wonderId))).toEqual(STAGE_3_SPIKE_WONDERS);

const stage3b = sources.filter(source => source.batchId === 'stage-3b-batch-2');
expect(stage3b).toHaveLength(6);
expect(new Set(stage3b.filter(source => source.surfaces.includes('natural-reveal')).map(source => source.wonderId)))
  .toEqual(STAGE_3B_NATURAL_VIDEO_WONDERS);
expect(new Set(stage3b.filter(source => source.surfaces.includes('legendary-completion')).map(source => source.wonderId)))
  .toEqual(STAGE_3B_LEGENDARY_VIDEO_WONDERS);
expect(stage3b.reduce((total, source) => total + source.sizeBytes, 0)).toBeLessThanOrEqual(STAGE_3B_HARD_BATCH_BYTES);
```

Keep the existing per-record checks for source URL, local path, fallback source, duration, MIME type, `audio: 'silent'`, and per-file hard threshold. Add `assertCleanText(source.batchId);`.

- [ ] Add a new source test that rejects accidental UI/source coupling:

```ts
it('keeps video batch ids as audit metadata only', () => {
  for (const source of getWonderCodexVideoSources()) {
    expect(source.batchId).toMatch(/^stage-3/);
    expect(source.sfxCueId).toBeUndefined();
  }
});
```

- [ ] Run the RED test:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/wonder-codex/sources.test.ts
```

Expected failure: missing `batchId` fields and missing six Stage 3B records/assets.

## Task 2: Add Batch Metadata To Existing Records

**Files:**

- Modify `src/systems/wonder-codex/video-sources.ts`

- [ ] Add `batchId: 'stage-3-spike'` to the two existing records.

Do not change existing IDs, source URLs, file paths, durations, file sizes, surfaces, or attribution for the spike records.

- [ ] Re-run the source test. It should still fail because Stage 3B records/assets are not present.

## Task 3: Prepare Six Silent Local Assets

**Files and directories:**

- Create files under `public/videos/wonders/`
- Use temporary downloads under `/private/tmp/conquestoria-video-sources-stage3b/`

- [ ] Re-open each selected source page in a browser or with a network-capable command immediately before downloading. Confirm the source URL, creator, license/public-domain status, and source file availability still match the spec.

- [ ] Download sources to `/private/tmp/conquestoria-video-sources-stage3b/`:

```bash
mkdir -p /private/tmp/conquestoria-video-sources-stage3b public/videos/wonders
curl -L "https://commons.wikimedia.org/wiki/Special:Redirect/file/EVEREST.webm" -o /private/tmp/conquestoria-video-sources-stage3b/everest.webm
curl -L "https://commons.wikimedia.org/wiki/Special:Redirect/file/Coral%20Reef%20Art.webm" -o /private/tmp/conquestoria-video-sources-stage3b/coral-reef-art.webm
curl -L "https://commons.wikimedia.org/wiki/Special:Redirect/file/Grand%20Canyon%20Wildfires%20at%20Night%20%28CIRA%202025-07-14%20-%20nolabels%29.webm" -o /private/tmp/conquestoria-video-sources-stage3b/grand-canyon-cira.webm
curl -L "https://commons.wikimedia.org/wiki/Special:Redirect/file/L%27Oracle%20de%20Delphes%20%281903%29.webm" -o /private/tmp/conquestoria-video-sources-stage3b/oracle-delphi.webm
curl -L "https://commons.wikimedia.org/wiki/Special:Redirect/file/Grand%20Canal%20Gongchen%20Hangzhou.webm" -o /private/tmp/conquestoria-video-sources-stage3b/grand-canal.webm
curl -L "https://commons.wikimedia.org/wiki/Special:Redirect/file/Time-lapse%20of%20a%20flower%20blooming.webm" -o /private/tmp/conquestoria-video-sources-stage3b/flower-blooming.webm
```

If shell network is blocked, request approval for the failed command rather than inventing a different source.

- [ ] Encode 4-second muted derivatives. Start with these trims:

```bash
ffmpeg -y -ss 00:00:04 -i /private/tmp/conquestoria-video-sources-stage3b/everest.webm -t 4 -an -vf "scale=640:-2" -c:v libopenh264 -pix_fmt yuv420p -movflags +faststart public/videos/wonders/sacred-mountain-everest-flyover.mp4
ffmpeg -y -ss 00:00:25 -i /private/tmp/conquestoria-video-sources-stage3b/coral-reef-art.webm -t 4 -an -vf "crop=720:360:0:0,scale=640:-2" -c:v libopenh264 -pix_fmt yuv420p -movflags +faststart public/videos/wonders/coral-reef-art-park.mp4
ffmpeg -y -ss 00:00:01 -i /private/tmp/conquestoria-video-sources-stage3b/grand-canyon-cira.webm -t 4 -an -vf "scale=640:-2" -c:v libopenh264 -pix_fmt yuv420p -movflags +faststart public/videos/wonders/grand-canyon-cira-night-fires.mp4
ffmpeg -y -ss 00:00:20 -i /private/tmp/conquestoria-video-sources-stage3b/oracle-delphi.webm -t 4 -an -vf "scale=640:-2" -c:v libopenh264 -pix_fmt yuv420p -movflags +faststart public/videos/wonders/oracle-of-delphi-melies.mp4
ffmpeg -y -ss 00:00:05 -i /private/tmp/conquestoria-video-sources-stage3b/grand-canal.webm -t 4 -an -vf "scale=640:-2" -c:v libopenh264 -pix_fmt yuv420p -movflags +faststart public/videos/wonders/grand-canal-gongchen-hangzhou.mp4
ffmpeg -y -ss 00:00:00 -i /private/tmp/conquestoria-video-sources-stage3b/flower-blooming.webm -t 4 -an -vf "scale=640:-2" -c:v libopenh264 -pix_fmt yuv420p -movflags +faststart public/videos/wonders/moonwell-gardens-flower-bloom.mp4
```

If `libopenh264` is not available in the local FFmpeg build, use the same encoder/fallback path already used for the Stage 3 spike assets and keep the output MP4/H.264. Do not switch to a codec that fails the existing browser/Tauri playback assumptions.

- [ ] Verify each output has no audio stream:

```bash
ffprobe -v error -show_entries stream=codec_type -of csv=p=0 public/videos/wonders/sacred-mountain-everest-flyover.mp4
ffprobe -v error -show_entries stream=codec_type -of csv=p=0 public/videos/wonders/coral-reef-art-park.mp4
ffprobe -v error -show_entries stream=codec_type -of csv=p=0 public/videos/wonders/grand-canyon-cira-night-fires.mp4
ffprobe -v error -show_entries stream=codec_type -of csv=p=0 public/videos/wonders/oracle-of-delphi-melies.mp4
ffprobe -v error -show_entries stream=codec_type -of csv=p=0 public/videos/wonders/grand-canal-gongchen-hangzhou.mp4
ffprobe -v error -show_entries stream=codec_type -of csv=p=0 public/videos/wonders/moonwell-gardens-flower-bloom.mp4
```

Expected output for each command: only `video`. Any `audio` line means the asset is invalid.

- [ ] Record exact byte sizes:

```bash
stat -f "%z %N" public/videos/wonders/sacred-mountain-everest-flyover.mp4 public/videos/wonders/coral-reef-art-park.mp4 public/videos/wonders/grand-canyon-cira-night-fires.mp4 public/videos/wonders/oracle-of-delphi-melies.mp4 public/videos/wonders/grand-canal-gongchen-hangzhou.mp4 public/videos/wonders/moonwell-gardens-flower-bloom.mp4
```

Every file must be `<= 5242880` bytes. The six-file total must be `<= 18874368` bytes.

- [ ] Visually inspect the six clips locally. Confirm:

  - `oracle-of-delphi` does not spend the whole clip on an Egyptian-looking set that would confuse the Delphi theme.
  - `grand_canyon` has legible motion and does not look like a blank/dark still at Codex size.
  - every clip reads acceptably in a 3-5 second loop.

If a trim is confusing, change only the `-ss` start time, regenerate that derivative, and re-run `ffprobe`/`stat`.

## Task 4: Add Stage 3B Source Records

**Files:**

- Modify `src/systems/wonder-codex/video-sources.ts`

- [ ] Add these six records to `WONDER_CODEX_VIDEO_SOURCES`. Replace each `sizeBytes` with exact `stat` output from Task 3.

```ts
  {
    id: 'video-sacred-mountain-everest-flyover',
    wonderId: 'sacred_mountain',
    title: 'Everest flyover',
    surfaces: ['codex', 'natural-reveal'],
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:EVEREST.webm',
    creator: 'Sgascoin',
    license: 'CC BY-SA 4.0',
    attribution: 'Sgascoin - CC BY-SA 4.0',
    localPath: '/videos/wonders/sacred-mountain-everest-flyover.mp4',
    fallbackImageSourceId: 'image-mountain',
    durationSeconds: 4,
    sizeBytes: 988173,
    format: 'MP4/H.264 derivative from WebM source using OpenH264',
    mimeType: 'video/mp4',
    loopNote: 'Everest source trimmed to a short silent mountain flyover loop for Stage 3B.',
    audio: 'silent',
    batchId: 'stage-3b-batch-2',
  },
  {
    id: 'video-coral-reef-art-park',
    wonderId: 'coral_reef',
    title: 'Coral reef art park',
    surfaces: ['codex', 'natural-reveal'],
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Coral_Reef_Art.webm',
    creator: 'VOA Africa',
    license: 'public domain VOA material',
    attribution: 'VOA Africa - public domain VOA material',
    localPath: '/videos/wonders/coral-reef-art-park.mp4',
    fallbackImageSourceId: 'image-coral',
    durationSeconds: 4,
    sizeBytes: 947759,
    format: 'MP4/H.264 derivative from cropped WebM source using OpenH264',
    mimeType: 'video/mp4',
    loopNote: 'Coral conservation footage trimmed and cropped to a short silent underwater loop for Stage 3B.',
    audio: 'silent',
    batchId: 'stage-3b-batch-2',
  },
  {
    id: 'video-grand-canyon-cira-night-fires',
    wonderId: 'grand_canyon',
    title: 'Grand Canyon wildfire satellite sequence',
    surfaces: ['codex', 'natural-reveal'],
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Grand_Canyon_Wildfires_at_Night_(CIRA_2025-07-14_-_nolabels).webm',
    creator: 'CSU/CIRA and NOAA/NESDIS',
    license: 'public domain NOAA material',
    attribution: 'CSU/CIRA and NOAA/NESDIS - public domain NOAA material',
    localPath: '/videos/wonders/grand-canyon-cira-night-fires.mp4',
    fallbackImageSourceId: 'image-grand-canyon',
    durationSeconds: 4,
    sizeBytes: 393653,
    format: 'MP4/H.264 derivative from WebM source using OpenH264',
    mimeType: 'video/mp4',
    loopNote: 'Institutional Grand Canyon-region satellite motion trimmed to a short silent loop for Stage 3B.',
    audio: 'silent',
    batchId: 'stage-3b-batch-2',
  },
  {
    id: 'video-oracle-of-delphi-melies',
    wonderId: 'oracle-of-delphi',
    title: "L'Oracle de Delphes temple sequence",
    surfaces: ['codex', 'legendary-completion'],
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:L%27Oracle_de_Delphes_(1903).webm',
    creator: 'Georges Melies',
    license: 'public domain',
    attribution: 'Georges Melies - public domain',
    localPath: '/videos/wonders/oracle-of-delphi-melies.mp4',
    fallbackImageSourceId: 'image-delphi',
    durationSeconds: 4,
    sizeBytes: 999022,
    format: 'MP4/H.264 derivative from WebM source using OpenH264',
    mimeType: 'video/mp4',
    loopNote: 'Public-domain oracle film trimmed to a short silent temple/oracle loop for Stage 3B.',
    audio: 'silent',
    batchId: 'stage-3b-batch-2',
  },
  {
    id: 'video-grand-canal-gongchen-hangzhou',
    wonderId: 'grand-canal',
    title: 'Grand Canal Gongchen Hangzhou',
    surfaces: ['codex', 'legendary-completion'],
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Grand_Canal_Gongchen_Hangzhou.webm',
    creator: 'Charlie fong',
    license: 'CC BY-SA 4.0',
    attribution: 'Charlie fong - CC BY-SA 4.0',
    localPath: '/videos/wonders/grand-canal-gongchen-hangzhou.mp4',
    fallbackImageSourceId: 'image-canal',
    durationSeconds: 4,
    sizeBytes: 968180,
    format: 'MP4/H.264 derivative from WebM source using OpenH264',
    mimeType: 'video/mp4',
    loopNote: 'Grand Canal footage trimmed to a short silent waterway loop for Stage 3B.',
    audio: 'silent',
    batchId: 'stage-3b-batch-2',
  },
  {
    id: 'video-moonwell-gardens-flower-bloom',
    wonderId: 'moonwell-gardens',
    title: 'Flower blooming time-lapse',
    surfaces: ['codex', 'legendary-completion'],
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Time-lapse_of_a_flower_blooming.webm',
    creator: 'Ajith Samuel',
    license: 'CC BY 3.0',
    attribution: 'Ajith Samuel - CC BY 3.0',
    localPath: '/videos/wonders/moonwell-gardens-flower-bloom.mp4',
    fallbackImageSourceId: 'image-garden',
    durationSeconds: 4,
    sizeBytes: 539730,
    format: 'MP4/H.264 derivative from WebM source using OpenH264',
    mimeType: 'video/mp4',
    loopNote: 'Flower time-lapse trimmed to a short silent garden-growth loop for Stage 3B.',
    audio: 'silent',
    batchId: 'stage-3b-batch-2',
  },
```

- [ ] Confirm every `sizeBytes` value matches exact byte counts before running GREEN tests.

- [ ] Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/wonder-codex/sources.test.ts
```

Expected before Task 5: all manifest and asset assertions pass, but the existing ledger sync assertion may still fail. If the only failure is missing ledger text, proceed to Task 5 and re-run.

## Task 5: Update Human-Readable Source Ledger

**Files:**

- Modify `docs/superpowers/specs/2026-05-23-wonder-codex-atlas-source-ledger.md`

- [ ] Add six rows under `## Stage 3 Video Sources`, keeping the table sorted with existing Stage 3 rows or grouped as "Stage 3B" in the notes.

Use this row shape:

```md
| `video-sacred-mountain-everest-flyover` | `sacred_mountain` | https://commons.wikimedia.org/wiki/File:EVEREST.webm | Sgascoin | CC BY-SA 4.0 | `/videos/wonders/sacred-mountain-everest-flyover.mp4` | Stage 3B. Trimmed to 4 seconds, scaled to 640px width, muted, and re-encoded as MP4/H.264 with OpenH264. Attribution: Sgascoin - CC BY-SA 4.0. |
```

Add equivalent rows for the other five Stage 3B records using the exact manifest attribution strings.

- [ ] Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/wonder-codex/sources.test.ts
```

Expected: GREEN.

## Task 6: Add Presentation Regression Tests

**Files:**

- Modify `tests/systems/wonder-codex/presentation.test.ts`
- Modify `tests/systems/wonder-discovery-reveal.test.ts`
- Modify `tests/systems/legendary-wonder-completion-presentation.test.ts`

- [ ] In `tests/systems/wonder-codex/presentation.test.ts`, change the unsupported natural fixture from `coral_reef` to `crystal_caverns`, because `coral_reef` becomes supported.

- [ ] Add a discovered natural Codex test for a Stage 3B source:

```ts
state.map.tiles[hexKey({ q: 1, r: 0 })].wonder = 'coral_reef';
state.discoveredWonders.coral_reef = 'player';
state.wonderDiscoverers.coral_reef = ['player'];
const model = getWonderCodexViewModel(state, 'player', { initialWonderId: 'coral_reef' });
expect(model.selectedPage?.videoPreview).toMatchObject({
  id: 'video-coral-reef-art-park',
  wonderId: 'coral_reef',
  surface: 'codex',
  audio: 'silent',
});
```

- [ ] Add or update a legendary Codex test using an owned/completed `grand-canal` or `oracle-of-delphi` fixture. Use the existing safe-city setup pattern already present in this file:

```ts
const state = makeState();
const baseCity = state.cities[Object.keys(state.cities)[0]];
state.cities['safe-city'] = { ...baseCity, id: 'safe-city', owner: 'player' };
state.completedLegendaryWonders = {
  'grand-canal': { ownerId: 'player', cityId: 'safe-city', turnCompleted: 58 },
};

const model = getWonderCodexViewModel(state, 'player', { initialWonderId: 'grand-canal' });

expect(model.selectedPage?.videoPreview).toMatchObject({
  id: 'video-grand-canal-gongchen-hangzhou',
  wonderId: 'grand-canal',
  surface: 'codex',
  audio: 'silent',
});
expect(model.selectedPage?.videoPreview?.src).toBe('/videos/wonders/grand-canal-gongchen-hangzhou.mp4');
```

Keep the existing rival-intel test asserting no private rival page data leaks.

- [ ] In `tests/systems/wonder-discovery-reveal.test.ts`, change the unsupported natural reveal fixture from `coral_reef` to `crystal_caverns`.

- [ ] Add a Stage 3B natural reveal test for `coral_reef`:

```ts
state.map.tiles[hexKey({ q: 1, r: 0 })].wonder = 'coral_reef';
state.wonderDiscoverers.coral_reef = ['player'];
const item = buildWonderDiscoveryRevealItem(
  state,
  'player',
  event({ wonderId: 'coral_reef', position: { q: 1, r: 0 } }),
);
expect(item?.videoPreview).toMatchObject({
  id: 'video-coral-reef-art-park',
  wonderId: 'coral_reef',
  surface: 'natural-reveal',
  audio: 'silent',
});
```

- [ ] In `tests/systems/legendary-wonder-completion-presentation.test.ts`, change the unsupported legendary fixture from `oracle-of-delphi` to a still-unsupported legendary such as `world-archive`.

- [ ] Add a Stage 3B legendary completion test for `oracle-of-delphi`:

```ts
const item = buildLegendaryWonderCompletionCeremonyItem(state, {
  civId: 'player',
  cityId: 'city-river',
  wonderId: 'oracle-of-delphi',
  turnCompleted: 42,
});
expect(item?.videoPreview).toMatchObject({
  id: 'video-oracle-of-delphi-melies',
  wonderId: 'oracle-of-delphi',
  surface: 'legendary-completion',
  audio: 'silent',
});
```

- [ ] Run the RED/GREEN presentation tests:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/wonder-codex/presentation.test.ts tests/systems/wonder-discovery-reveal.test.ts tests/systems/legendary-wonder-completion-presentation.test.ts
```

Expected: GREEN after records are wired.

## Task 7: Add UI Regression Tests Only Where Needed

**Files:**

- Review `tests/ui/wonder-codex-page.test.ts`
- Review `tests/ui/wonder-discovery-ceremony.test.ts`
- Review `tests/ui/legendary-wonder-completion-ceremony.test.ts`
- Review `tests/ui/wonder-video-view.test.ts`

The production UI should not need code changes. Existing UI tests use synthetic `WonderVideoPreviewView` fixtures, so they already prove reduced-motion, pause/play, playback error fallback, and ceremony actions at the view level.

- [ ] If any UI test hardcodes only Stage 3 spike source IDs in a way that would reject Stage 3B IDs, update the fixture to use a Stage 3B ID and keep the behavior assertion unchanged.

- [ ] If no UI fixture rejects Stage 3B IDs, do not add duplicate DOM tests. The system presentation tests in Task 6 cover the new source records reaching the existing UI hosts.

- [ ] Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/wonder-codex-page.test.ts tests/ui/wonder-discovery-ceremony.test.ts tests/ui/legendary-wonder-completion-ceremony.test.ts tests/ui/wonder-video-view.test.ts
```

Expected: GREEN.

## Task 8: Source Rule Checks And Targeted Wonder Regression

**Files:**

- Changed source files are expected to be:
  - `src/systems/wonder-codex/types.ts`
  - `src/systems/wonder-codex/video-sources.ts`

- [ ] Run source rule checks:

```bash
scripts/check-src-rule-violations.sh src/systems/wonder-codex/types.ts src/systems/wonder-codex/video-sources.ts
```

- [ ] Run all targeted tests for changed behavior:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/wonder-codex/sources.test.ts tests/systems/wonder-codex/presentation.test.ts tests/systems/wonder-discovery-reveal.test.ts tests/systems/legendary-wonder-completion-presentation.test.ts tests/ui/wonder-codex-page.test.ts tests/ui/wonder-discovery-ceremony.test.ts tests/ui/legendary-wonder-completion-ceremony.test.ts tests/ui/wonder-video-view.test.ts
```

- [ ] Run wonder regressions because this changes wonder surfaces:

```bash
./scripts/run-wonder-regressions.sh
```

## Task 9: Full Verification

- [ ] Run build:

```bash
./scripts/run-with-mise.sh yarn build
```

The existing Vite chunk-size warning may still appear. Do not change chunking in this MR unless the build fails or the warning changes into a functional regression.

- [ ] Run full tests:

```bash
./scripts/run-with-mise.sh yarn test
```

- [ ] Run web smoke because this adds local media payload:

```bash
./scripts/run-with-mise.sh yarn test:web-smoke
```

- [ ] Inspect diffs:

```bash
git diff --stat origin/main...HEAD
git diff --stat
git diff
```

Review for:

- exactly six new Stage 3B MP4 files
- no service worker, Vite, Tauri, platform, gameplay, save, AI, map, city renderer, or audio-system changes
- no UI branching on `batchId`
- no `sfxCueId` consumption
- no `sizeBytes: 0`
- no missing ledger rows
- no `coral_reef` or `oracle-of-delphi` tests still treating those IDs as unsupported

## Task 10: Commit

- [ ] Stage only intended files:

```bash
git add docs/superpowers/specs/2026-06-07-stage-3b-wonder-video-batch-2-design.md docs/superpowers/plans/2026-06-07-stage-3b-wonder-video-batch-2.md docs/superpowers/specs/2026-05-23-wonder-codex-atlas-source-ledger.md src/systems/wonder-codex/types.ts src/systems/wonder-codex/video-sources.ts tests/systems/wonder-codex/sources.test.ts tests/systems/wonder-codex/presentation.test.ts tests/systems/wonder-discovery-reveal.test.ts tests/systems/legendary-wonder-completion-presentation.test.ts tests/ui/wonder-codex-page.test.ts tests/ui/wonder-discovery-ceremony.test.ts tests/ui/legendary-wonder-completion-ceremony.test.ts tests/ui/wonder-video-view.test.ts public/videos/wonders/sacred-mountain-everest-flyover.mp4 public/videos/wonders/coral-reef-art-park.mp4 public/videos/wonders/grand-canyon-cira-night-fires.mp4 public/videos/wonders/oracle-of-delphi-melies.mp4 public/videos/wonders/grand-canal-gongchen-hangzhou.mp4 public/videos/wonders/moonwell-gardens-flower-bloom.mp4
```

If any listed UI test file was not modified in Task 7, omit it from `git add`.

- [ ] Commit:

```bash
git commit -m "feat(wonders): add stage 3b video batch"
```

## Task 11: Rebase And PR Readiness

- [ ] Fetch and rebase:

```bash
git fetch origin main
git rebase origin/main
```

- [ ] Re-run after rebase:

```bash
scripts/check-src-rule-violations.sh src/systems/wonder-codex/types.ts src/systems/wonder-codex/video-sources.ts
./scripts/run-with-mise.sh yarn test --run tests/systems/wonder-codex/sources.test.ts tests/systems/wonder-codex/presentation.test.ts tests/systems/wonder-discovery-reveal.test.ts tests/systems/legendary-wonder-completion-presentation.test.ts tests/ui/wonder-codex-page.test.ts tests/ui/wonder-discovery-ceremony.test.ts tests/ui/legendary-wonder-completion-ceremony.test.ts tests/ui/wonder-video-view.test.ts
./scripts/run-wonder-regressions.sh
./scripts/run-with-mise.sh yarn build
./scripts/run-with-mise.sh yarn test
./scripts/run-with-mise.sh yarn test:web-smoke
```

- [ ] Verify fast-forward eligibility:

```bash
git merge-base --is-ancestor origin/main HEAD
```

Expected: exit code `0`.

- [ ] Push and open a draft PR. PR body must include:

  - Final six selected wonders.
  - Ranked candidate table or a link to the spec section.
  - Source URLs, creator/license attribution, local output paths, and derivative notes.
  - `ffprobe` silence verification summary.
  - Total Stage 3B added bytes and largest per-file byte count.
  - Verification commands and results.
  - Explicit note that no runtime audio/SFX, service worker, PWA, Tauri, gameplay, save, map, or renderer behavior changed.
