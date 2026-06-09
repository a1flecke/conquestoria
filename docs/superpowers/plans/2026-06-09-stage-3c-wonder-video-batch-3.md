# Stage 3C Wonder Video Batch 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Do not use subagents unless the user explicitly authorizes them.

**Goal:** Add the third small wonder-video batch: exactly three natural-wonder clips and three legendary-wonder clips selected by likelihood first, then source quality, while preserving the existing silent local video architecture.

**Architecture:** Extend the existing Wonder Codex video manifest and presentation tests without creating a new media path. Add `stage-3c-batch-3` as audit metadata only; UI continues to render through existing `videoPreview` view models, ceremonies, and `wonder-video-view`. Do not change gameplay state, save format, PWA/service-worker behavior, Tauri/platform code, city rendering, map rendering, wonder rules, or audio/SFX playback.

**Tech Stack:** TypeScript, Vitest/jsdom, DOM `<video>`, existing Wonder Codex presentation helpers, existing ceremony UI hosts, local public MP4 assets, `ffmpeg`/`ffprobe`, existing source ledger.

**Target Implementer:** Sonnet 4.5-era model on medium effort. This plan provides exact files, expected failing tests, source records, asset commands, verification gates, fallback substitution rules, and review checkpoints.

---

## Spec Review Result

The design spec is `docs/superpowers/specs/2026-06-09-stage-3c-wonder-video-batch-3-design.md`.

Spec review fixes already applied before writing this plan:

- The spec now marks itself reviewed for implementation planning.
- The spec explicitly keeps `sfxCueId` future-compatible but unused.
- The spec now records the selected six Stage 3C wonders and the exact alternates.
- The spec now documents the `ancient_forest` verification gate: the source is preferred, but it must not ship unless the source page and original mypubliclands/BLM source still provide compatible reuse terms.
- The spec now states that `crystal_caverns` is the first natural alternate if `ancient_forest` source verification is not clean.
- The spec now calls out the large `world-archive` source and the attribution requirements for `ironroot-foundry`.

Do not change the selected six during implementation unless asset preparation fails under the hard rules. If a selected source fails, move only to the listed alternate within the same top-ten shortlist and update this plan, the source ledger, and the PR body before coding the alternate.

## Selected Batch

| Category | Wonder ID | Video source ID | Source URL | Creator / License | Local asset | Surfaces | Fallback |
|---|---|---|---|---|---|---|---|
| Natural | `ancient_forest` | `video-ancient-forest-headwaters-redwoods` | `https://commons.wikimedia.org/wiki/File:-TravelTuesday_with_My_Public_Lands_(23825649569).webm` | mypubliclands / CC BY 2.0 and U.S. BLM public-domain metadata, with verification gate | `/videos/wonders/ancient-forest-headwaters-redwoods.mp4` | `codex`, `natural-reveal` | `image-forest` |
| Natural | `bioluminescent_bay` | `video-bioluminescent-bay-vieques-kayak` | `https://commons.wikimedia.org/wiki/File:Kayaking_in_the_Bioluminescent_Bay_Vieques.webm` | Z22 / CC BY-SA 3.0 | `/videos/wonders/bioluminescent-bay-vieques-kayak.mp4` | `codex`, `natural-reveal` | `image-coral` |
| Natural | `singing_sands` | `video-singing-sands-mojave-sunset` | `https://commons.wikimedia.org/wiki/File:Mojave_Desert_Sunset_(40480403760).webm` | Kyle Sullivan / BLM California / public domain U.S. Bureau of Land Management material | `/videos/wonders/singing-sands-mojave-sunset.mp4` | `codex`, `natural-reveal` | `image-desert` |
| Legendary | `world-archive` | `video-world-archive-printing-press` | `https://commons.wikimedia.org/wiki/File:Demonstration_of_printing_press.webm` | Krassotkin / CC0 1.0 | `/videos/wonders/world-archive-printing-press.mp4` | `codex`, `legendary-completion` | `image-archive` |
| Legendary | `ironroot-foundry` | `video-ironroot-foundry-steel-forging` | `https://commons.wikimedia.org/wiki/File:Smithy-_steel_forging_(2).webm` | Sounds of Changes / CC BY 3.0, with source credits for Museum of Municipal Engineering and named recordists | `/videos/wonders/ironroot-foundry-steel-forging.mp4` | `codex`, `legendary-completion` | `image-foundry` |
| Legendary | `sun-spire` | `video-sun-spire-solar-glint` | `https://commons.wikimedia.org/wiki/File:Solar_panel_sun_glint_sparkles_across_Minnesota_(from_7_July_2018)_(CIRA_2018-07-11).webm` | GOES imagery: CSU/CIRA and NOAA / public domain NOAA material | `/videos/wonders/sun-spire-solar-glint.mp4` | `codex`, `legendary-completion` | `image-sun-tower` |

Existing video records remain unchanged:

- Stage 3 spike: `great_volcano`, `starvault-observatory`
- Stage 3B batch 2: `sacred_mountain`, `coral_reef`, `grand_canyon`, `oracle-of-delphi`, `grand-canal`, `moonwell-gardens`

After this plan, `getWonderCodexVideoSources()` must return exactly fourteen records: two `stage-3-spike`, six `stage-3b-batch-2`, and six `stage-3c-batch-3`.

## Player Truth Table

| Before | Player action | Immediate visible result | Must remain reachable |
|---|---|---|---|
| Supported Stage 3C natural wonder is visible in the Codex | Open its Codex page | Existing Codex page shows muted looped video with pause/play control | Source link, page text, map action, related entries, fallback image |
| Supported Stage 3C legendary wonder is safely visible in the Codex | Open its Codex page | Existing Codex page shows muted looped video with pause/play control | Source link, page text, city/status actions, related entries, fallback image |
| Stage 3C natural wonder is discovered by the active human viewer | Natural reveal ceremony opens | Existing ceremony video slot renders the new natural-reveal preview | Skip, Continue, Open Atlas |
| Stage 3C legendary wonder is completed by the active human owner | Legendary completion ceremony opens | Existing ceremony video slot renders the new legendary-completion preview | Skip, Continue, Open City, Open Journal |
| Reduced motion is active | Open any supported Stage 3C surface | Existing still fallback renders; no video playback element is presented | All normal text and actions |
| Video playback errors or autoplay is blocked | Browser fires the existing media failure path | Existing fallback image replaces video without collapsing the page/card | All normal text and actions |
| Unsupported wonder is visible | Open Codex or ceremony | No `videoPreview`; existing still/vignette surface remains | All normal text and actions |
| Rival legendary completion is known only through safe intel | Open Codex with rival intel only | No private host city, no map target, no owned-completion video preview | Safe intel summary only |

## Misleading UI Risks

- `batchId` must never imply eligibility. It is audit metadata only.
- `videoPreview` must remain the only signal that a UI surface should render video.
- Do not keep using `ancient_forest`, `bioluminescent_bay`, `singing_sands`, `world-archive`, `ironroot-foundry`, or `sun-spire` as unsupported-video fixtures after this batch if the preferred batch ships.
- If `ancient_forest` source verification fails and `crystal_caverns` is substituted, update all tests and docs to treat `crystal_caverns` as supported and keep `ancient_forest` unsupported.
- Silent video must not imply sound. Do not add audio labels, volume controls, Web Audio nodes, `HTMLAudioElement`, mixer calls, or SFX playback.
- Reduced motion must render the sourced still fallback rather than a video element that merely does not autoplay.
- Local files must fail loudly in tests if missing, oversized, misattributed, or still containing audio streams.

## Interaction Replay Checklist

- Open the Codex page for `bioluminescent_bay`; verify video appears, Pause changes to Play, and fallback still appears after a simulated video error.
- Open the Codex page for `world-archive`; verify video appears only when existing legendary visibility allows it.
- Open a natural discovery ceremony for `singing_sands`; verify the existing video slot renders and Skip/Continue still work.
- Open a legendary completion ceremony for `ironroot-foundry`; verify the existing video slot renders and Open City/Open Journal still work.
- Re-run reduced-motion UI tests and verify supported Stage 3C previews render as still fallbacks.
- Open an unsupported visible Codex page such as `eternal_storm`; verify no broken video affordance appears.

## Task 1: Write RED Manifest And Batch Tests

**Files:**

- Modify: `tests/systems/wonder-codex/sources.test.ts`
- Modify later: `src/systems/wonder-codex/types.ts`
- Modify later: `src/systems/wonder-codex/video-sources.ts`

- [ ] **Step 1: Add Stage 3C constants in `tests/systems/wonder-codex/sources.test.ts`**

Add these constants near the existing Stage 3B constants:

```ts
const STAGE_3C_NATURAL_VIDEO_WONDERS = new Set(['ancient_forest', 'bioluminescent_bay', 'singing_sands']);
const STAGE_3C_LEGENDARY_VIDEO_WONDERS = new Set(['world-archive', 'ironroot-foundry', 'sun-spire']);
const STAGE_3C_HARD_BATCH_BYTES = 18 * 1024 * 1024;
```

If the forest verification gate fails during Task 3, replace the natural set with:

```ts
const STAGE_3C_NATURAL_VIDEO_WONDERS = new Set(['crystal_caverns', 'bioluminescent_bay', 'singing_sands']);
```

- [ ] **Step 2: Update the video source count and Stage 3C assertions**

In `it('has complete silent local video sources under the hard size threshold', ...)`, update the count and add the Stage 3C block:

```ts
const sources = getWonderCodexVideoSources();
expect(sources).toHaveLength(14);
```

Add after the existing Stage 3B assertions:

```ts
const stage3c = sources.filter(source => source.batchId === 'stage-3c-batch-3');
expect(stage3c).toHaveLength(6);
expect(new Set(stage3c.filter(source => source.surfaces.includes('natural-reveal')).map(source => source.wonderId)))
  .toEqual(STAGE_3C_NATURAL_VIDEO_WONDERS);
expect(new Set(stage3c.filter(source => source.surfaces.includes('legendary-completion')).map(source => source.wonderId)))
  .toEqual(STAGE_3C_LEGENDARY_VIDEO_WONDERS);
expect(stage3c.reduce((total, source) => total + source.sizeBytes, 0)).toBeLessThanOrEqual(STAGE_3C_HARD_BATCH_BYTES);
```

Keep the existing per-record assertions for source URL, local path, fallback source, duration, MIME type, `audio: 'silent'`, local file existence, byte-size equality, and no audio stream markers.

- [ ] **Step 3: Run the RED test**

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/wonder-codex/sources.test.ts
```

Expected result: FAIL because `stage-3c-batch-3` is not in the type union, no Stage 3C records exist, and no Stage 3C local assets exist.

Do not modify production code before seeing this failure.

## Task 2: Extend Batch Type Only

**Files:**

- Modify: `src/systems/wonder-codex/types.ts`
- Test: `tests/systems/wonder-codex/sources.test.ts`

- [ ] **Step 1: Extend `WonderCodexVideoBatchId`**

Change the type to exactly:

```ts
export type WonderCodexVideoBatchId = 'stage-3-spike' | 'stage-3b-batch-2' | 'stage-3c-batch-3';
```

- [ ] **Step 2: Re-run the RED test**

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/wonder-codex/sources.test.ts
```

Expected result: still FAIL because Stage 3C records and assets are absent.

- [ ] **Step 3: Confirm the remaining failure is expected and keep the changes uncommitted**

Do not commit this RED state. The Stage 3C type/test changes should be committed in Task 4 after records and assets make `tests/systems/wonder-codex/sources.test.ts` pass.

Expected remaining failure: no six-record `stage-3c-batch-3` group and no Stage 3C local video assets yet.

## Task 3: Verify Sources And Prepare Six Silent Local Assets

**Files and directories:**

- Create: `public/videos/wonders/ancient-forest-headwaters-redwoods.mp4`
- Create: `public/videos/wonders/bioluminescent-bay-vieques-kayak.mp4`
- Create: `public/videos/wonders/singing-sands-mojave-sunset.mp4`
- Create: `public/videos/wonders/world-archive-printing-press.mp4`
- Create: `public/videos/wonders/ironroot-foundry-steel-forging.mp4`
- Create: `public/videos/wonders/sun-spire-solar-glint.mp4`
- Temporary downloads: `/private/tmp/conquestoria-video-sources-stage3c/`

- [ ] **Step 1: Re-open and verify source pages**

Immediately before downloading, re-open the selected source pages with a browser or a network-capable command. Verify each source still has compatible reuse terms:

```text
ancient_forest:
  https://commons.wikimedia.org/wiki/File:-TravelTuesday_with_My_Public_Lands_(23825649569).webm
  Must show compatible CC BY 2.0 and/or U.S. BLM public-domain source terms.
  Because Commons still showed Flickr-review-needed metadata during planning, also inspect the linked original mypubliclands/BLM source.
  If verification is not clean, stop using this source and switch the natural selection to crystal_caverns.

bioluminescent_bay:
  https://commons.wikimedia.org/wiki/File:Kayaking_in_the_Bioluminescent_Bay_Vieques.webm
  Must show Z22 and CC BY-SA 3.0.

singing_sands:
  https://commons.wikimedia.org/wiki/File:Mojave_Desert_Sunset_(40480403760).webm
  Must show BLM California/Kyle Sullivan public-domain U.S. Bureau of Land Management material and completed review.

world-archive:
  https://commons.wikimedia.org/wiki/File:Demonstration_of_printing_press.webm
  Must show Krassotkin and CC0 1.0.

ironroot-foundry:
  https://commons.wikimedia.org/wiki/File:Smithy-_steel_forging_(2).webm
  Must show Sounds of Changes attribution, CC BY 3.0, and reviewed source metadata.

sun-spire:
  https://commons.wikimedia.org/wiki/File:Solar_panel_sun_glint_sparkles_across_Minnesota_(from_7_July_2018)_(CIRA_2018-07-11).webm
  Must show GOES imagery: CSU/CIRA and NOAA, public-domain NOAA material.
```

If shell network is blocked while verifying or downloading, request escalation for the failed network command. Do not replace the selected source with a random search result.

- [ ] **Step 2: If `ancient_forest` verification fails, update this plan before continuing**

If the forest source fails, edit this plan and all subsequent code snippets so the natural set is:

```ts
const STAGE_3C_NATURAL_VIDEO_WONDERS = new Set(['crystal_caverns', 'bioluminescent_bay', 'singing_sands']);
```

Use this asset path and record ID instead:

```text
video-crystal-caverns-carlsbad-tour
/videos/wonders/crystal-caverns-carlsbad-tour.mp4
https://commons.wikimedia.org/wiki/File:CarlsbadCaverns.ogv
Ian and Wendy Sewell / CC BY-SA 3.0 or GFDL
fallbackImageSourceId: image-cave
```

Also update the source ledger row, presentation tests, ceremony tests, and PR body to explain the substitution.

- [ ] **Step 3: Download preferred sources**

```bash
mkdir -p /private/tmp/conquestoria-video-sources-stage3c public/videos/wonders
curl -L "https://commons.wikimedia.org/wiki/Special:Redirect/file/-TravelTuesday%20with%20My%20Public%20Lands%20%2823825649569%29.webm" -o /private/tmp/conquestoria-video-sources-stage3c/ancient-forest.webm
curl -L "https://commons.wikimedia.org/wiki/Special:Redirect/file/Kayaking%20in%20the%20Bioluminescent%20Bay%20Vieques.webm" -o /private/tmp/conquestoria-video-sources-stage3c/bioluminescent-bay.webm
curl -L "https://commons.wikimedia.org/wiki/Special:Redirect/file/Mojave%20Desert%20Sunset%20%2840480403760%29.webm" -o /private/tmp/conquestoria-video-sources-stage3c/singing-sands.webm
curl -L "https://commons.wikimedia.org/wiki/Special:Redirect/file/Demonstration%20of%20printing%20press.webm" -o /private/tmp/conquestoria-video-sources-stage3c/world-archive.webm
curl -L "https://commons.wikimedia.org/wiki/Special:Redirect/file/Smithy-%20steel%20forging%20%282%29.webm" -o /private/tmp/conquestoria-video-sources-stage3c/ironroot-foundry.webm
curl -L "https://commons.wikimedia.org/wiki/Special:Redirect/file/Solar%20panel%20sun%20glint%20sparkles%20across%20Minnesota%20%28from%207%20July%202018%29%20%28CIRA%202018-07-11%29.webm" -o /private/tmp/conquestoria-video-sources-stage3c/sun-spire.webm
```

If `ancient_forest` is substituted, download the cave source instead:

```bash
curl -L "https://commons.wikimedia.org/wiki/Special:Redirect/file/CarlsbadCaverns.ogv" -o /private/tmp/conquestoria-video-sources-stage3c/crystal-caverns.ogv
```

- [ ] **Step 4: Encode preferred 4-second muted derivatives**

Start with these trims. Adjust only `-ss` if visual inspection proves a clip is confusing:

```bash
ffmpeg -y -ss 00:00:00 -i /private/tmp/conquestoria-video-sources-stage3c/ancient-forest.webm -t 4 -an -vf "scale=640:-2" -c:v libopenh264 -pix_fmt yuv420p -movflags +faststart public/videos/wonders/ancient-forest-headwaters-redwoods.mp4
ffmpeg -y -ss 00:00:05 -i /private/tmp/conquestoria-video-sources-stage3c/bioluminescent-bay.webm -t 4 -an -vf "scale=640:-2" -c:v libopenh264 -pix_fmt yuv420p -movflags +faststart public/videos/wonders/bioluminescent-bay-vieques-kayak.mp4
ffmpeg -y -ss 00:00:00 -i /private/tmp/conquestoria-video-sources-stage3c/singing-sands.webm -t 4 -an -vf "scale=640:-2" -c:v libopenh264 -pix_fmt yuv420p -movflags +faststart public/videos/wonders/singing-sands-mojave-sunset.mp4
ffmpeg -y -ss 00:00:08 -i /private/tmp/conquestoria-video-sources-stage3c/world-archive.webm -t 4 -an -vf "scale=640:-2" -c:v libopenh264 -pix_fmt yuv420p -movflags +faststart public/videos/wonders/world-archive-printing-press.mp4
ffmpeg -y -ss 00:00:04 -i /private/tmp/conquestoria-video-sources-stage3c/ironroot-foundry.webm -t 4 -an -vf "scale=640:-2" -c:v libopenh264 -pix_fmt yuv420p -movflags +faststart public/videos/wonders/ironroot-foundry-steel-forging.mp4
ffmpeg -y -ss 00:00:00 -i /private/tmp/conquestoria-video-sources-stage3c/sun-spire.webm -t 4 -an -vf "scale=640:-2" -c:v libopenh264 -pix_fmt yuv420p -movflags +faststart public/videos/wonders/sun-spire-solar-glint.mp4
```

If `libopenh264` is not available in the local FFmpeg build, use the same MP4/H.264 encoder path already used for the Stage 3 and Stage 3B assets. Do not switch to a codec that breaks browser/Tauri playback assumptions.

If `ancient_forest` is substituted, encode:

```bash
ffmpeg -y -ss 00:00:20 -i /private/tmp/conquestoria-video-sources-stage3c/crystal-caverns.ogv -t 4 -an -vf "scale=640:-2" -c:v libopenh264 -pix_fmt yuv420p -movflags +faststart public/videos/wonders/crystal-caverns-carlsbad-tour.mp4
```

- [ ] **Step 5: Verify no output contains audio**

Run:

```bash
ffprobe -v error -show_entries stream=codec_type -of csv=p=0 public/videos/wonders/ancient-forest-headwaters-redwoods.mp4
ffprobe -v error -show_entries stream=codec_type -of csv=p=0 public/videos/wonders/bioluminescent-bay-vieques-kayak.mp4
ffprobe -v error -show_entries stream=codec_type -of csv=p=0 public/videos/wonders/singing-sands-mojave-sunset.mp4
ffprobe -v error -show_entries stream=codec_type -of csv=p=0 public/videos/wonders/world-archive-printing-press.mp4
ffprobe -v error -show_entries stream=codec_type -of csv=p=0 public/videos/wonders/ironroot-foundry-steel-forging.mp4
ffprobe -v error -show_entries stream=codec_type -of csv=p=0 public/videos/wonders/sun-spire-solar-glint.mp4
```

Expected output for each command: only `video`. Any `audio` line means the asset is invalid.

If `ancient_forest` is substituted, verify `public/videos/wonders/crystal-caverns-carlsbad-tour.mp4` instead of the forest asset.

- [ ] **Step 6: Record exact byte sizes**

```bash
stat -f "%z %N" public/videos/wonders/ancient-forest-headwaters-redwoods.mp4 public/videos/wonders/bioluminescent-bay-vieques-kayak.mp4 public/videos/wonders/singing-sands-mojave-sunset.mp4 public/videos/wonders/world-archive-printing-press.mp4 public/videos/wonders/ironroot-foundry-steel-forging.mp4 public/videos/wonders/sun-spire-solar-glint.mp4
```

Every file must be `<= 5242880` bytes. The six-file Stage 3C total must be `<= 18874368` bytes.

- [ ] **Step 7: Visually inspect the six clips**

Confirm:

- `bioluminescent_bay` shows visible glow and not a mostly black loop.
- `singing_sands` reads as desert/sand even without sound.
- `world-archive` shows press/print action and not a static room shot.
- `ironroot-foundry` shows glowing metal or unmistakable forging action.
- `sun-spire` shows clear solar glint motion.
- `ancient_forest`, if used, reads as forest/redwood/coastal public lands; `crystal_caverns`, if substituted, reads as cave/cavern despite low source resolution.

If a trim is confusing, change only the `-ss` start time, regenerate that derivative, and re-run `ffprobe` and `stat`.

## Task 4: Add Stage 3C Source Records

**Files:**

- Modify: `src/systems/wonder-codex/video-sources.ts`
- Test: `tests/systems/wonder-codex/sources.test.ts`

- [ ] **Step 1: Add these six records to `WONDER_CODEX_VIDEO_SOURCES`**

Place them after the Stage 3B records. Replace every `sizeBytes` value with the exact byte count from Task 3.

```ts
  {
    id: 'video-ancient-forest-headwaters-redwoods',
    wonderId: 'ancient_forest',
    title: 'Headwaters redwood forest',
    surfaces: ['codex', 'natural-reveal'],
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:-TravelTuesday_with_My_Public_Lands_(23825649569).webm',
    creator: 'mypubliclands',
    license: 'CC BY 2.0 and U.S. Bureau of Land Management public-domain metadata',
    attribution: 'mypubliclands - CC BY 2.0 / U.S. Bureau of Land Management public-domain metadata',
    localPath: '/videos/wonders/ancient-forest-headwaters-redwoods.mp4',
    fallbackImageSourceId: 'image-forest',
    durationSeconds: 4,
    sizeBytes: 0,
    format: 'MP4/H.264 derivative from WebM source using OpenH264',
    mimeType: 'video/mp4',
    loopNote: 'Headwaters forest source trimmed to a short silent forest loop for Stage 3C after source-term verification.',
    audio: 'silent',
    batchId: 'stage-3c-batch-3',
  },
  {
    id: 'video-bioluminescent-bay-vieques-kayak',
    wonderId: 'bioluminescent_bay',
    title: 'Vieques bioluminescent bay kayaking',
    surfaces: ['codex', 'natural-reveal'],
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Kayaking_in_the_Bioluminescent_Bay_Vieques.webm',
    creator: 'Z22',
    license: 'CC BY-SA 3.0',
    attribution: 'Z22 - CC BY-SA 3.0',
    localPath: '/videos/wonders/bioluminescent-bay-vieques-kayak.mp4',
    fallbackImageSourceId: 'image-coral',
    durationSeconds: 4,
    sizeBytes: 0,
    format: 'MP4/H.264 derivative from WebM source using OpenH264',
    mimeType: 'video/mp4',
    loopNote: 'Bioluminescent bay source trimmed to a short silent glow/kayak loop for Stage 3C.',
    audio: 'silent',
    batchId: 'stage-3c-batch-3',
  },
  {
    id: 'video-singing-sands-mojave-sunset',
    wonderId: 'singing_sands',
    title: 'Mojave desert sunset',
    surfaces: ['codex', 'natural-reveal'],
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Mojave_Desert_Sunset_(40480403760).webm',
    creator: 'Kyle Sullivan / BLM California',
    license: 'public domain U.S. Bureau of Land Management material',
    attribution: 'Kyle Sullivan / BLM California - public domain U.S. Bureau of Land Management material',
    localPath: '/videos/wonders/singing-sands-mojave-sunset.mp4',
    fallbackImageSourceId: 'image-desert',
    durationSeconds: 4,
    sizeBytes: 0,
    format: 'MP4/H.264 derivative from WebM source using OpenH264',
    mimeType: 'video/mp4',
    loopNote: 'Mojave desert source trimmed to a short silent sand/desert loop for Stage 3C.',
    audio: 'silent',
    batchId: 'stage-3c-batch-3',
  },
  {
    id: 'video-world-archive-printing-press',
    wonderId: 'world-archive',
    title: 'Printing press demonstration',
    surfaces: ['codex', 'legendary-completion'],
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Demonstration_of_printing_press.webm',
    creator: 'Krassotkin',
    license: 'CC0 1.0',
    attribution: 'Krassotkin - CC0 1.0',
    localPath: '/videos/wonders/world-archive-printing-press.mp4',
    fallbackImageSourceId: 'image-archive',
    durationSeconds: 4,
    sizeBytes: 0,
    format: 'MP4/H.264 derivative from WebM source using OpenH264',
    mimeType: 'video/mp4',
    loopNote: 'Printing press source trimmed to a short silent knowledge/archive loop for Stage 3C.',
    audio: 'silent',
    batchId: 'stage-3c-batch-3',
  },
  {
    id: 'video-ironroot-foundry-steel-forging',
    wonderId: 'ironroot-foundry',
    title: 'Steel forging',
    surfaces: ['codex', 'legendary-completion'],
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Smithy-_steel_forging_(2).webm',
    creator: 'Sounds of Changes',
    license: 'CC BY 3.0',
    attribution: 'Sounds of Changes - CC BY 3.0',
    localPath: '/videos/wonders/ironroot-foundry-steel-forging.mp4',
    fallbackImageSourceId: 'image-foundry',
    durationSeconds: 4,
    sizeBytes: 0,
    format: 'MP4/H.264 derivative from WebM source using OpenH264',
    mimeType: 'video/mp4',
    loopNote: 'Steel forging source trimmed to a short silent foundry loop for Stage 3C; source credits Museum of Municipal Engineering and named recordists.',
    audio: 'silent',
    batchId: 'stage-3c-batch-3',
  },
  {
    id: 'video-sun-spire-solar-glint',
    wonderId: 'sun-spire',
    title: 'Solar panel sun glint',
    surfaces: ['codex', 'legendary-completion'],
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Solar_panel_sun_glint_sparkles_across_Minnesota_(from_7_July_2018)_(CIRA_2018-07-11).webm',
    creator: 'GOES imagery: CSU/CIRA and NOAA',
    license: 'public domain NOAA material',
    attribution: 'GOES imagery: CSU/CIRA and NOAA - public domain NOAA material',
    localPath: '/videos/wonders/sun-spire-solar-glint.mp4',
    fallbackImageSourceId: 'image-sun-tower',
    durationSeconds: 4,
    sizeBytes: 0,
    format: 'MP4/H.264 derivative from WebM source using OpenH264',
    mimeType: 'video/mp4',
    loopNote: 'Solar-panel sun-glint source trimmed to a short silent solar-energy loop for Stage 3C.',
    audio: 'silent',
    batchId: 'stage-3c-batch-3',
  },
```

If `ancient_forest` is substituted, use this record instead of the forest record:

```ts
  {
    id: 'video-crystal-caverns-carlsbad-tour',
    wonderId: 'crystal_caverns',
    title: 'Carlsbad Caverns tour',
    surfaces: ['codex', 'natural-reveal'],
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:CarlsbadCaverns.ogv',
    creator: 'Ian and Wendy Sewell',
    license: 'CC BY-SA 3.0 or GFDL',
    attribution: 'Ian and Wendy Sewell - CC BY-SA 3.0 or GFDL',
    localPath: '/videos/wonders/crystal-caverns-carlsbad-tour.mp4',
    fallbackImageSourceId: 'image-cave',
    durationSeconds: 4,
    sizeBytes: 0,
    format: 'MP4/H.264 derivative from Ogg Theora source using OpenH264',
    mimeType: 'video/mp4',
    loopNote: 'Carlsbad Caverns source trimmed to a short silent cave loop for Stage 3C after the preferred forest source failed verification.',
    audio: 'silent',
    batchId: 'stage-3c-batch-3',
  },
```

- [ ] **Step 2: Run the source tests**

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/wonder-codex/sources.test.ts
```

Expected result: PASS after exact `sizeBytes` values match the generated local files.

- [ ] **Step 3: Commit manifest, type, assets, and source tests**

```bash
git add src/systems/wonder-codex/types.ts src/systems/wonder-codex/video-sources.ts tests/systems/wonder-codex/sources.test.ts public/videos/wonders/ancient-forest-headwaters-redwoods.mp4 public/videos/wonders/bioluminescent-bay-vieques-kayak.mp4 public/videos/wonders/singing-sands-mojave-sunset.mp4 public/videos/wonders/world-archive-printing-press.mp4 public/videos/wonders/ironroot-foundry-steel-forging.mp4 public/videos/wonders/sun-spire-solar-glint.mp4
git commit -m "feat(wonders): add stage 3c video sources"
```

If `ancient_forest` is substituted, stage `public/videos/wonders/crystal-caverns-carlsbad-tour.mp4` instead of the forest file.

## Task 5: Update Source Ledger

**Files:**

- Modify: `docs/superpowers/specs/2026-05-23-wonder-codex-atlas-source-ledger.md`
- Test: `tests/systems/wonder-codex/sources.test.ts`

- [ ] **Step 1: Add Stage 3C rows to the Stage 3 Video Sources table**

Add these rows after the Stage 3B rows. Replace each `sizeBytes` reference in prose only if you choose to mention bytes; the ledger does not need numeric byte values.

```md
| `video-ancient-forest-headwaters-redwoods` | `ancient_forest` | https://commons.wikimedia.org/wiki/File:-TravelTuesday_with_My_Public_Lands_(23825649569).webm | mypubliclands | CC BY 2.0 and U.S. Bureau of Land Management public-domain metadata | `/videos/wonders/ancient-forest-headwaters-redwoods.mp4` | Stage 3C. Source terms verified during implementation despite Commons review-needed metadata at planning time. Trimmed to 4 seconds, scaled to 640px width, muted, and re-encoded as MP4/H.264 with OpenH264. Attribution: mypubliclands - CC BY 2.0 / U.S. Bureau of Land Management public-domain metadata. |
| `video-bioluminescent-bay-vieques-kayak` | `bioluminescent_bay` | https://commons.wikimedia.org/wiki/File:Kayaking_in_the_Bioluminescent_Bay_Vieques.webm | Z22 | CC BY-SA 3.0 | `/videos/wonders/bioluminescent-bay-vieques-kayak.mp4` | Stage 3C. Trimmed to 4 seconds from a visible glow moment, scaled to 640px width, muted, and re-encoded as MP4/H.264 with OpenH264. Attribution: Z22 - CC BY-SA 3.0. |
| `video-singing-sands-mojave-sunset` | `singing_sands` | https://commons.wikimedia.org/wiki/File:Mojave_Desert_Sunset_(40480403760).webm | Kyle Sullivan / BLM California | public domain U.S. Bureau of Land Management material | `/videos/wonders/singing-sands-mojave-sunset.mp4` | Stage 3C. Trimmed to 4 seconds, scaled to 640px width, muted, and re-encoded as MP4/H.264 with OpenH264. Attribution: Kyle Sullivan / BLM California - public domain U.S. Bureau of Land Management material. |
| `video-world-archive-printing-press` | `world-archive` | https://commons.wikimedia.org/wiki/File:Demonstration_of_printing_press.webm | Krassotkin | CC0 1.0 | `/videos/wonders/world-archive-printing-press.mp4` | Stage 3C. Trimmed to 4 seconds from a printing-press action moment, scaled to 640px width, muted, and re-encoded as MP4/H.264 with OpenH264. Attribution: Krassotkin - CC0 1.0. |
| `video-ironroot-foundry-steel-forging` | `ironroot-foundry` | https://commons.wikimedia.org/wiki/File:Smithy-_steel_forging_(2).webm | Sounds of Changes | CC BY 3.0 | `/videos/wonders/ironroot-foundry-steel-forging.mp4` | Stage 3C. Source credits Museum of Municipal Engineering; sound recordist Monika Widzicka; photographer and video recordist Piotr Leszczynski. Trimmed to 4 seconds, scaled to 640px width, muted, and re-encoded as MP4/H.264 with OpenH264. Attribution: Sounds of Changes - CC BY 3.0. |
| `video-sun-spire-solar-glint` | `sun-spire` | https://commons.wikimedia.org/wiki/File:Solar_panel_sun_glint_sparkles_across_Minnesota_(from_7_July_2018)_(CIRA_2018-07-11).webm | GOES imagery: CSU/CIRA and NOAA | public domain NOAA material | `/videos/wonders/sun-spire-solar-glint.mp4` | Stage 3C. Trimmed to 4 seconds, scaled to 640px width, muted, and re-encoded as MP4/H.264 with OpenH264. Attribution: GOES imagery: CSU/CIRA and NOAA - public domain NOAA material. |
```

Use ASCII in the source ledger. The row above intentionally spells `Piotr Leszczynski` without the accent to match repo editing constraints.

If `ancient_forest` is substituted, use this row instead of the forest row:

```md
| `video-crystal-caverns-carlsbad-tour` | `crystal_caverns` | https://commons.wikimedia.org/wiki/File:CarlsbadCaverns.ogv | Ian and Wendy Sewell | CC BY-SA 3.0 or GFDL | `/videos/wonders/crystal-caverns-carlsbad-tour.mp4` | Stage 3C. Preferred forest source failed verification, so this first natural alternate was used. Trimmed to 4 seconds, scaled to 640px width, muted, and re-encoded as MP4/H.264 with OpenH264. Attribution: Ian and Wendy Sewell - CC BY-SA 3.0 or GFDL. |
```

- [ ] **Step 2: Run the source ledger sync test**

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/wonder-codex/sources.test.ts
```

Expected result: PASS.

- [ ] **Step 3: Commit the ledger update**

```bash
git add docs/superpowers/specs/2026-05-23-wonder-codex-atlas-source-ledger.md
git commit -m "docs(wonders): record stage 3c video sources"
```

## Task 6: Add Presentation And Ceremony Regression Tests

**Files:**

- Modify: `tests/systems/wonder-codex/presentation.test.ts`
- Modify: `tests/systems/wonder-discovery-reveal.test.ts`
- Modify: `tests/systems/legendary-wonder-completion-presentation.test.ts`
- Modify: `tests/ui/wonder-codex-page.test.ts`
- Modify: `tests/ui/wonder-discovery-ceremony.test.ts`
- Modify: `tests/ui/legendary-wonder-completion-ceremony.test.ts`
- Modify only if existing reduced-motion coverage needs fixture updates: `tests/ui/wonder-video-view.test.ts`

- [ ] **Step 1: Update unsupported-video fixtures**

Search for old unsupported fixtures that are now selected:

```bash
rg -n "ancient_forest|bioluminescent_bay|singing_sands|world-archive|ironroot-foundry|sun-spire|crystal_caverns" tests/systems tests/ui
```

If a test expects a selected Stage 3C wonder to have no video, switch that unsupported fixture to `eternal_storm` for natural or `internet` for legendary. If `crystal_caverns` is substituted, do not use `crystal_caverns` as an unsupported fixture; use `eternal_storm`.

- [ ] **Step 2: Add a Stage 3C natural Codex presentation test**

In `tests/systems/wonder-codex/presentation.test.ts`, add:

```ts
it('shows Stage 3C natural videos on discovered Codex pages', () => {
  const state = makeState();
  state.map.tiles[hexKey({ q: 1, r: 0 })].wonder = 'bioluminescent_bay';
  state.discoveredWonders.bioluminescent_bay = 'player';
  state.wonderDiscoverers.bioluminescent_bay = ['player'];

  const model = getWonderCodexViewModel(state, 'player', { initialWonderId: 'bioluminescent_bay' });

  expect(model.selectedPage?.videoPreview).toMatchObject({
    id: 'video-bioluminescent-bay-vieques-kayak',
    wonderId: 'bioluminescent_bay',
    surface: 'codex',
    audio: 'silent',
  });
  expect(model.selectedPage?.videoPreview?.src).toBe('/videos/wonders/bioluminescent-bay-vieques-kayak.mp4');
  expect(model.selectedPage?.videoPreview?.fallbackImage.src).toBe('/images/wonders/codex/coral.jpg');
});
```

- [ ] **Step 3: Add a Stage 3C legendary Codex presentation test**

In the same file, add:

```ts
it('shows Stage 3C legendary videos on safe owned completed Codex pages', () => {
  const state = makeState();
  const baseCity = state.cities[Object.keys(state.cities)[0]];
  state.cities['archive-city'] = { ...baseCity, id: 'archive-city', owner: 'player' };
  state.completedLegendaryWonders = {
    'world-archive': { ownerId: 'player', cityId: 'archive-city', turnCompleted: 72 },
  };

  const model = getWonderCodexViewModel(state, 'player', { initialWonderId: 'world-archive' });

  expect(model.selectedPage?.videoPreview).toMatchObject({
    id: 'video-world-archive-printing-press',
    wonderId: 'world-archive',
    surface: 'codex',
    audio: 'silent',
  });
  expect(model.selectedPage?.videoPreview?.src).toBe('/videos/wonders/world-archive-printing-press.mp4');
  expect(model.selectedPage?.videoPreview?.fallbackImage.src).toBe('/images/wonders/codex/archive.jpg');
});
```

- [ ] **Step 4: Add or update ceremony presentation tests**

In `tests/systems/wonder-discovery-reveal.test.ts`, add a Stage 3C natural assertion using `singing_sands`:

```ts
it('includes a Stage 3C silent natural reveal video preview', () => {
  const state = makeState();
  state.map.tiles[hexKey({ q: 1, r: 0 })].wonder = 'singing_sands';
  state.wonderDiscoverers.singing_sands = ['player'];

  const item = buildWonderDiscoveryRevealItem(
    state,
    'player',
    event({ wonderId: 'singing_sands', position: { q: 1, r: 0 } }),
  );

  expect(item?.videoPreview).toMatchObject({
    id: 'video-singing-sands-mojave-sunset',
    wonderId: 'singing_sands',
    surface: 'natural-reveal',
    audio: 'silent',
  });
});
```

In `tests/systems/legendary-wonder-completion-presentation.test.ts`, add a Stage 3C legendary assertion using `ironroot-foundry`:

```ts
it('includes a Stage 3C silent legendary completion video preview for the owner', () => {
  const state = makeLegendaryWonderFixture({ completedTechs: [], resources: [] });
  state.currentPlayer = 'player';

  const item = buildLegendaryWonderCompletionCeremonyItem(state, {
    civId: 'player',
    cityId: 'city-river',
    wonderId: 'ironroot-foundry',
    turnCompleted: 72,
  });

  expect(item?.videoPreview).toMatchObject({
    id: 'video-ironroot-foundry-steel-forging',
    wonderId: 'ironroot-foundry',
    surface: 'legendary-completion',
    audio: 'silent',
  });
});
```

Update the existing unsupported legendary completion test from `world-archive` to `internet`, because `world-archive` becomes supported:

```ts
const item = buildLegendaryWonderCompletionCeremonyItem(state, {
  civId: 'player',
  cityId: 'city-river',
  wonderId: 'internet',
  turnCompleted: 42,
});

expect(item?.videoPreview).toBeUndefined();
```

- [ ] **Step 5: Add or update UI tests for the live surfaces**

In `tests/ui/wonder-codex-page.test.ts`, add a Stage 3C-specific Codex rendering test:

```ts
it('renders Stage 3C Codex video previews with attribution and actions', () => {
  const preview: WonderVideoPreviewView = {
    ...videoPreview('codex'),
    id: 'video-bioluminescent-bay-vieques-kayak',
    wonderId: 'bioluminescent_bay',
    src: '/videos/wonders/bioluminescent-bay-vieques-kayak.mp4',
    label: 'Bioluminescent Bay',
    attribution: 'Z22 - CC BY-SA 3.0',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Kayaking_in_the_Bioluminescent_Bay_Vieques.webm',
    license: 'CC BY-SA 3.0',
    fallbackImage: {
      src: '/images/wonders/codex/coral.jpg',
      alt: 'Bioluminescent Bay source image',
      attribution: 'NOAA / public domain',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:Coral_Reef.jpg',
      license: 'public domain',
    },
  };
  const root = createWonderCodexPage(page({
    id: 'bioluminescent_bay',
    title: 'Bioluminescent Bay',
    visual: getWonderVisualDefinition('bioluminescent_bay'),
    videoPreview: preview,
  }), {
    mode: 'desktop',
    onAction: vi.fn(),
    onSelectRelated: vi.fn(),
  });

  expect(root.querySelector('[data-wonder-video-view]')).toBeTruthy();
  expect(root.querySelector('source')?.getAttribute('src')).toBe('/videos/wonders/bioluminescent-bay-vieques-kayak.mp4');
  expect(root.textContent).toContain('Z22 - CC BY-SA 3.0');
  expect(root.querySelector('[data-codex-action="view-map"]')).toBeTruthy();
});
```

In `tests/ui/wonder-discovery-ceremony.test.ts`, add:

```ts
it('renders Stage 3C natural discovery videos while keeping actions clickable', () => {
  const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  const onResolve = vi.fn();
  const preview: WonderVideoPreviewView = {
    ...videoPreview('natural-reveal'),
    id: 'video-singing-sands-mojave-sunset',
    wonderId: 'singing_sands',
    src: '/videos/wonders/singing-sands-mojave-sunset.mp4',
    label: 'Singing Sands',
  };
  createWonderDiscoveryCeremony(
    document.body,
    item({ wonderId: 'singing_sands', name: 'Singing Sands', videoPreview: preview }),
    { onResolve },
    { reducedMotion: false },
  );

  expect(document.querySelector('source')?.getAttribute('src')).toBe('/videos/wonders/singing-sands-mojave-sunset.mp4');
  click('[data-wonder-discovery-action="continue"]');
  expect(onResolve).toHaveBeenCalledWith('continue');

  play.mockRestore();
});
```

In `tests/ui/legendary-wonder-completion-ceremony.test.ts`, add:

```ts
it('renders Stage 3C legendary completion videos while keeping actions clickable', () => {
  const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  const onResolve = vi.fn();
  const preview: WonderVideoPreviewView = {
    ...videoPreview('legendary-completion'),
    id: 'video-ironroot-foundry-steel-forging',
    wonderId: 'ironroot-foundry',
    src: '/videos/wonders/ironroot-foundry-steel-forging.mp4',
    label: 'Ironroot Foundry',
  };
  createLegendaryWonderCompletionCeremony(
    document.body,
    item({ wonderId: 'ironroot-foundry', name: 'Ironroot Foundry', videoPreview: preview }),
    { onResolve },
    { reducedMotion: false },
  );

  expect(document.querySelector('source')?.getAttribute('src')).toBe('/videos/wonders/ironroot-foundry-steel-forging.mp4');
  document.querySelector<HTMLButtonElement>('[data-legendary-completion-action="open-journal"]')?.click();
  expect(onResolve).toHaveBeenCalledWith('open-journal');

  play.mockRestore();
});
```

Do not add new controls or UI text. These tests should prove the existing video slot consumes the new manifest rows.

- [ ] **Step 6: Run the targeted presentation/UI tests**

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/wonder-codex/presentation.test.ts tests/systems/wonder-discovery-reveal.test.ts tests/systems/legendary-wonder-completion-presentation.test.ts tests/ui/wonder-codex-page.test.ts tests/ui/wonder-discovery-ceremony.test.ts tests/ui/legendary-wonder-completion-ceremony.test.ts tests/ui/wonder-video-view.test.ts
```

Expected result: PASS.

- [ ] **Step 7: Commit presentation and UI coverage**

```bash
git add tests/systems/wonder-codex/presentation.test.ts tests/systems/wonder-discovery-reveal.test.ts tests/systems/legendary-wonder-completion-presentation.test.ts tests/ui/wonder-codex-page.test.ts tests/ui/wonder-discovery-ceremony.test.ts tests/ui/legendary-wonder-completion-ceremony.test.ts tests/ui/wonder-video-view.test.ts
git commit -m "test(wonders): cover stage 3c video presentation"
```

Only stage `tests/ui/wonder-video-view.test.ts` if it actually changed.

## Task 7: Run Rule Checks And Full Verification

**Files:**

- No edits expected unless checks reveal issues.

- [ ] **Step 1: Run source-rule checks for changed source files**

```bash
scripts/check-src-rule-violations.sh src/systems/wonder-codex/types.ts src/systems/wonder-codex/video-sources.ts
```

Expected result: no violations.

- [ ] **Step 2: Run the targeted Stage 3C test set**

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/wonder-codex/sources.test.ts tests/systems/wonder-codex/presentation.test.ts tests/systems/wonder-discovery-reveal.test.ts tests/systems/legendary-wonder-completion-presentation.test.ts tests/ui/wonder-codex-page.test.ts tests/ui/wonder-discovery-ceremony.test.ts tests/ui/legendary-wonder-completion-ceremony.test.ts tests/ui/wonder-video-view.test.ts
```

Expected result: PASS.

- [ ] **Step 3: Run wonder regressions**

```bash
./scripts/run-wonder-regressions.sh
```

Expected result: exit 0. If a sandbox-only mise cache warning appears but the script exits 0, note it in the final verification.

- [ ] **Step 4: Run build**

```bash
./scripts/run-with-mise.sh yarn build
```

Expected result: exit 0. If the existing Vite chunk-size warning appears, note it; do not treat it as a Stage 3C failure unless a new error appears.

- [ ] **Step 5: Run full tests**

```bash
./scripts/run-with-mise.sh yarn test
```

Expected result: PASS.

- [ ] **Step 6: Inspect branch and working-tree diffs**

```bash
git diff --stat origin/main...HEAD
git diff --stat
git diff origin/main...HEAD -- docs/superpowers/specs/2026-06-09-stage-3c-wonder-video-batch-3-design.md docs/superpowers/plans/2026-06-09-stage-3c-wonder-video-batch-3.md docs/superpowers/specs/2026-05-23-wonder-codex-atlas-source-ledger.md src/systems/wonder-codex/types.ts src/systems/wonder-codex/video-sources.ts tests/systems/wonder-codex/sources.test.ts tests/systems/wonder-codex/presentation.test.ts tests/systems/wonder-discovery-reveal.test.ts tests/systems/legendary-wonder-completion-presentation.test.ts tests/ui/wonder-codex-page.test.ts tests/ui/wonder-discovery-ceremony.test.ts tests/ui/legendary-wonder-completion-ceremony.test.ts tests/ui/wonder-video-view.test.ts
```

Expected result: only Stage 3C docs, manifest/source changes, tests, and six local video assets are included. `git diff --stat` should be empty after commits.

## Task 8: Rebase, Push, And Open PR

**Files:**

- No edits expected unless rebase conflicts occur.

- [ ] **Step 1: Fetch latest main**

```bash
git fetch origin main
```

- [ ] **Step 2: Rebase onto latest `origin/main`**

```bash
git rebase origin/main
```

If conflicts occur, resolve them without dropping Stage 3C source records, tests, or ledger rows. Re-run the targeted tests after resolving.

- [ ] **Step 3: Verify fast-forward eligibility**

```bash
git merge-base --is-ancestor origin/main HEAD
```

Expected result: exit 0.

- [ ] **Step 4: Re-run required pre-push checks after rebase**

```bash
./scripts/run-with-mise.sh yarn build
./scripts/run-with-mise.sh yarn test
```

Expected result: both exit 0.

- [ ] **Step 5: Push branch**

```bash
git push -u origin codex/stage-3c-wonder-video-batch-3
```

- [ ] **Step 6: Open a draft PR**

```bash
gh pr create --draft --base main --head codex/stage-3c-wonder-video-batch-3 --title "Stage 3C wonder video batch" --body-file /private/tmp/stage-3c-wonder-video-batch-3-pr.md
```

Before running `gh pr create`, write `/private/tmp/stage-3c-wonder-video-batch-3-pr.md` with:

```md
## Summary
- adds Stage 3C wonder video batch metadata and six new silent local clips
- updates Wonder Codex source ledger and video source tests
- covers Stage 3C Codex, natural reveal, and legendary completion presentation paths

## Selected Batch
- Natural: ancient_forest, bioluminescent_bay, singing_sands
- Legendary: world-archive, ironroot-foundry, sun-spire

## Source Notes
- ancient_forest source terms were re-verified before asset preparation; if this PR substituted crystal_caverns, explain the failed forest verification here
- all shipped derivatives are local MP4/H.264, muted, and below the hard asset-size threshold

## Out of scope
- full-roster video coverage
- audio/SFX playback
- generated video
- gameplay, save, PWA, Tauri, city-renderer, or map-renderer changes

## Why this is safe to merge partial
This MR only extends existing video-capable surfaces. The Wonder Codex, natural discovery ceremony, and legendary completion ceremony already have fallback behavior for unsupported, reduced-motion, missing, and failed video playback, and unsupported wonders remain fully reachable through existing still-image surfaces.

## Verification
- [ ] scripts/check-src-rule-violations.sh src/systems/wonder-codex/types.ts src/systems/wonder-codex/video-sources.ts
- [ ] ./scripts/run-with-mise.sh yarn test --run tests/systems/wonder-codex/sources.test.ts tests/systems/wonder-codex/presentation.test.ts tests/systems/wonder-discovery-reveal.test.ts tests/systems/legendary-wonder-completion-presentation.test.ts tests/ui/wonder-codex-page.test.ts tests/ui/wonder-discovery-ceremony.test.ts tests/ui/legendary-wonder-completion-ceremony.test.ts tests/ui/wonder-video-view.test.ts
- [ ] ./scripts/run-wonder-regressions.sh
- [ ] ./scripts/run-with-mise.sh yarn build
- [ ] ./scripts/run-with-mise.sh yarn test
```

Fill the verification checkboxes with actual results before creating the PR.

## Final Review Checklist

- [ ] The preferred `ancient_forest` source passed verification, or the implementation substituted `crystal_caverns` and documented why.
- [ ] Every Stage 3C record has `audio: 'silent'` and no `sfxCueId`.
- [ ] Every Stage 3C local MP4 has no audio stream.
- [ ] Every Stage 3C `sizeBytes` matches the actual file byte length.
- [ ] The source ledger contains every Stage 3C video id, source URL, local path, and attribution string.
- [ ] No UI code branches on `batchId`.
- [ ] Reduced-motion and playback-failure coverage remains passing.
- [ ] Unsupported wonders still have no `videoPreview`.
- [ ] `git diff --stat` is empty after commits.
- [ ] `git merge-base --is-ancestor origin/main HEAD` exits 0 after rebase.
