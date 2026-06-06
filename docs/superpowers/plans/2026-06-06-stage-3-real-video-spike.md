# Stage 3 Real Video Spike Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Do not use subagents unless the user explicitly authorizes them.

**Goal:** Add a source-led two-video wonder media spike across the Codex and natural/legendary ceremony surfaces.

**Architecture:** Keep source and eligibility data in `src/systems/wonder-codex/**`, expose safe optional `videoPreview` view models from existing presentation helpers, and render videos through one reusable DOM helper in `src/ui/wonder-video-view.ts`. Videos are silent local assets with existing still-image fallbacks; no audio mixer, gameplay, save, map, PWA, or Tauri behavior changes are intended.

**Tech Stack:** TypeScript, DOM `<video>`, Vitest/jsdom, Canvas-independent UI helpers, local public assets, `ffmpeg`/`ffprobe` for asset preparation, existing Wonder Codex source ledger.

---

## Source-Led Prototype Selection

Use these two source candidates unless asset preparation proves they cannot be shipped under the budget:

- Natural: `great_volcano`, source `Tonga Volcano Eruption 2022-01-15 0320Z to 0610Z Himawari-8 visible.webm`, Wikimedia Commons, Japan Meteorological Agency/Digital Typhoon, CC BY 4.0 compatible public data terms, source page `https://commons.wikimedia.org/wiki/File:Tonga_Volcano_Eruption_2022-01-15_0320Z_to_0610Z_Himawari-8_visible.webm`.
- Legendary: `starvault-observatory`, source `Morning observations time-lapse at Paranal.webm`, Wikimedia Commons, ESO/J. Colosimo, CC BY 4.0, source page `https://commons.wikimedia.org/wiki/File:Morning_observations_time-lapse_at_Paranal.webm`.

Local outputs:

- `public/videos/wonders/great-volcano-tonga-eruption.mp4`
- `public/videos/wonders/starvault-paranal-observatory.mp4`

Both outputs must be 3-5 seconds, silent, local, and under the 5 MB hard threshold. The plan uses MP4/H.264 for broad browser and Tauri compatibility.

## Player Truth Table

| Before | Player action | Immediate visible result | Must remain reachable |
|---|---|---|---|
| Codex page for supported natural or legendary wonder opens with motion allowed | View selected Codex page | Muted looped video appears with pause/play button and attribution link | Existing page copy, actions, related links, still-image fallback |
| Codex page is reduced-motion | View selected Codex page | Existing sourced still image appears; no video playback control is shown | Existing page copy and actions |
| Video errors in Codex | Browser fires `error` on `<video>` | Still fallback replaces the video surface | Existing page copy and actions |
| Supported natural wonder is discovered | Natural reveal ceremony opens | Video is the main visual panel inside the ceremony card | Skip, Continue, Open Atlas |
| Supported legendary wonder is completed | Legendary completion ceremony opens | Video is the main visual panel inside the ceremony card | Skip, Continue, Open City, Open Journal |
| Unsupported wonder surface opens | View Codex or ceremony | Existing image/vignette surface remains | Existing actions and text |

## Misleading UI Risks

- `videoPreview` must mean the current surface is eligible, the source record is supported, and existing presentation privacy already allows the page/ceremony.
- Reduced motion must not show a video element that only happens not to autoplay; it should render the existing still/static fallback.
- Silent video must not create or imply audio playback. `sfxCueId` is metadata only in this spike.
- Source metadata must describe the shipped derivative, including trimming, muting, and re-encoding.

## Interaction Replay Checklist

- Open a supported Codex page, click Pause, click Play, and verify the button label changes.
- Dispatch a video error and verify fallback appears without removing page actions.
- Open a supported natural reveal ceremony and click Skip.
- Open a supported legendary completion ceremony and click Continue.
- Reopen unsupported pages/ceremonies and verify old vignette/image paths still render.

## Task 1: Add Video Source Manifest Tests

**Files:**
- Modify: `tests/systems/wonder-codex/sources.test.ts`
- Create: `src/systems/wonder-codex/video-sources.ts`
- Modify: `src/systems/wonder-codex/types.ts`
- Modify: `docs/superpowers/specs/2026-05-23-wonder-codex-atlas-source-ledger.md`
- Assets: `public/videos/wonders/great-volcano-tonga-eruption.mp4`, `public/videos/wonders/starvault-paranal-observatory.mp4`

- [ ] **Step 1: Write failing source tests**

Add imports:

```ts
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  HARD_VIDEO_ASSET_REVIEW_BYTES,
  getWonderCodexVideoSources,
} from '@/systems/wonder-codex/video-sources';
```

Replace the existing `process.cwd()`-based source fixture root with:

```ts
const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
```

This is required because `./scripts/run-with-mise.sh` runs Yarn from the main worktree and passes Vitest a worktree root; `process.cwd()` may point at the main checkout during worktree test runs.

Add this test after `has complete source metadata and existing local image files`:

```ts
  it('has exactly two complete silent local video spike sources under the hard size threshold', () => {
    const sources = getWonderCodexVideoSources();
    expect(sources).toHaveLength(2);
    expect(new Set(sources.map(source => source.wonderId))).toEqual(new Set(['great_volcano', 'starvault-observatory']));

    for (const source of sources) {
      assertCleanText(source.id);
      assertCleanText(source.wonderId);
      assertCleanText(source.title);
      assertCleanText(source.sourceUrl);
      assertCleanText(source.creator);
      assertCleanText(source.license);
      assertCleanText(source.attribution);
      assertCleanText(source.localPath);
      assertCleanText(source.mimeType);
      assertCleanText(source.format);
      assertCleanText(source.loopNote);
      expect(source.localPath).toMatch(/^\/videos\/wonders\/.+\.mp4$/);
      expect(source.sourceUrl).toMatch(/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/);
      expect(source.audio).toBe('silent');
      expect(source.durationSeconds).toBeGreaterThanOrEqual(3);
      expect(source.durationSeconds).toBeLessThanOrEqual(5);
      expect(source.sizeBytes).toBeGreaterThan(0);
      expect(source.sizeBytes).toBeLessThanOrEqual(HARD_VIDEO_ASSET_REVIEW_BYTES);
      expect(source.mimeType).toBe('video/mp4');
      expect(source.fallbackImageSourceId).toMatch(/^image-/);
      expect(getImageSource(source.fallbackImageSourceId)).toBeTruthy();
      expect(existsSync(resolve(repoRoot, 'public', source.localPath.replace(/^\/+/, '')))).toBe(true);
    }
  });
```

Extend the ledger sync test loop:

```ts
    for (const source of getWonderCodexVideoSources()) {
      expect(ledger).toContain(source.id);
      expect(ledger).toContain(source.sourceUrl);
      expect(ledger).toContain(source.localPath);
      expect(ledger).toContain(source.attribution);
    }
```

- [ ] **Step 2: Run source tests RED**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/wonder-codex/sources.test.ts
```

Expected: FAIL because `video-sources.ts` and video types do not exist.

- [ ] **Step 3: Add video source types**

In `src/systems/wonder-codex/types.ts`, append:

```ts
export type WonderCodexVideoSurface = 'codex' | 'natural-reveal' | 'legendary-completion';

export interface WonderCodexVideoSource {
  id: string;
  wonderId: string;
  title: string;
  surfaces: WonderCodexVideoSurface[];
  sourceUrl: string;
  creator: string;
  license: string;
  attribution: string;
  localPath: string;
  fallbackImageSourceId: string;
  durationSeconds: number;
  sizeBytes: number;
  format: string;
  mimeType: string;
  loopNote: string;
  audio: 'silent';
  sfxCueId?: string;
}
```

- [ ] **Step 4: Add provisional manifest records with final paths and intentionally failing size values**

This is the RED state for the local asset checks: `sizeBytes: 0` is temporary and must be replaced with exact `stat -f "%z"` output in Step 6 after the MP4 derivatives exist. Do not commit this step until Step 7 is green.

Create `src/systems/wonder-codex/video-sources.ts`:

```ts
import type { WonderCodexVideoSource, WonderCodexVideoSurface } from '@/systems/wonder-codex/types';

export const HARD_VIDEO_ASSET_REVIEW_BYTES = 5 * 1024 * 1024;
export const TARGET_VIDEO_ASSET_BYTES = 2 * 1024 * 1024;

export const WONDER_CODEX_VIDEO_SOURCES = [
  {
    id: 'video-great-volcano-tonga-eruption',
    wonderId: 'great_volcano',
    title: 'Tonga volcano eruption satellite sequence',
    surfaces: ['codex', 'natural-reveal'],
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Tonga_Volcano_Eruption_2022-01-15_0320Z_to_0610Z_Himawari-8_visible.webm',
    creator: 'Japan Meteorological Agency / Digital Typhoon',
    license: 'CC BY 4.0 compatible public data terms',
    attribution: 'Japan Meteorological Agency / Digital Typhoon - CC BY 4.0 compatible public data terms',
    localPath: '/videos/wonders/great-volcano-tonga-eruption.mp4',
    fallbackImageSourceId: 'image-volcano',
    durationSeconds: 4,
    sizeBytes: 0,
    format: 'MP4/H.264 derivative from WebM source using OpenH264',
    mimeType: 'video/mp4',
    loopNote: 'Satellite eruption sequence trimmed to a short loop for spike evaluation.',
    audio: 'silent',
  },
  {
    id: 'video-starvault-paranal-observatory',
    wonderId: 'starvault-observatory',
    title: 'Morning observations time-lapse at Paranal',
    surfaces: ['codex', 'legendary-completion'],
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Morning_observations_time-lapse_at_Paranal.webm',
    creator: 'ESO/J. Colosimo',
    license: 'CC BY 4.0',
    attribution: 'ESO/J. Colosimo - CC BY 4.0',
    localPath: '/videos/wonders/starvault-paranal-observatory.mp4',
    fallbackImageSourceId: 'image-observatory',
    durationSeconds: 4,
    sizeBytes: 0,
    format: 'MP4/H.264 derivative from WebM source using OpenH264',
    mimeType: 'video/mp4',
    loopNote: 'Observatory time-lapse trimmed to a short loop for spike evaluation.',
    audio: 'silent',
  },
] satisfies WonderCodexVideoSource[];

export function getWonderCodexVideoSources(): WonderCodexVideoSource[] {
  return WONDER_CODEX_VIDEO_SOURCES.map(source => ({
    ...source,
    surfaces: [...source.surfaces],
  }));
}

export function getWonderCodexVideoSource(id: string): WonderCodexVideoSource | undefined {
  return WONDER_CODEX_VIDEO_SOURCES.find(source => source.id === id);
}

export function getWonderCodexVideoSourceForWonder(
  wonderId: string,
  surface: WonderCodexVideoSurface,
): WonderCodexVideoSource | undefined {
  return WONDER_CODEX_VIDEO_SOURCES.find(source =>
    source.wonderId === wonderId && (source.surfaces as readonly WonderCodexVideoSurface[]).includes(surface),
  );
}
```

- [ ] **Step 5: Prepare local video assets**

Download the two original files into `/private/tmp/conquestoria-video-sources/` and create local MP4 derivatives:

```bash
mkdir -p /private/tmp/conquestoria-video-sources public/videos/wonders
curl -L "https://commons.wikimedia.org/wiki/Special:Redirect/file/Tonga%20Volcano%20Eruption%202022-01-15%200320Z%20to%200610Z%20Himawari-8%20visible.webm" -o /private/tmp/conquestoria-video-sources/tonga.webm
curl -L "https://commons.wikimedia.org/wiki/Special:Redirect/file/Morning%20observations%20time-lapse%20at%20Paranal.webm" -o /private/tmp/conquestoria-video-sources/paranal.webm
ffmpeg -y -i /private/tmp/conquestoria-video-sources/tonga.webm -t 4 -an -vf "scale=640:-2" -c:v libopenh264 -pix_fmt yuv420p -movflags +faststart public/videos/wonders/great-volcano-tonga-eruption.mp4
ffmpeg -y -i /private/tmp/conquestoria-video-sources/paranal.webm -t 4 -an -vf "scale=640:-2" -c:v libopenh264 -pix_fmt yuv420p -movflags +faststart public/videos/wonders/starvault-paranal-observatory.mp4
ffprobe -v error -show_entries stream=codec_type -of csv=p=0 public/videos/wonders/great-volcano-tonga-eruption.mp4
ffprobe -v error -show_entries stream=codec_type -of csv=p=0 public/videos/wonders/starvault-paranal-observatory.mp4
stat -f "%z %N" public/videos/wonders/*.mp4
```

Expected:
- each `ffprobe` output is `video` only.
- each size is below `5242880`.
- the `format` fields and ledger notes say `MP4/H.264 derivative from WebM source using OpenH264`.

- [ ] **Step 6: Update manifest sizes and ledger rows**

Replace each `sizeBytes: 0` with the exact `stat -f "%z"` byte count.

In `docs/superpowers/specs/2026-05-23-wonder-codex-atlas-source-ledger.md`, add a `## Stage 3 Video Sources` section with rows:

```md
| Video source ID | Wonder | Source URL | Creator | License | Local asset | Notes |
|---|---|---|---|---|---|---|
| `video-great-volcano-tonga-eruption` | `great_volcano` | https://commons.wikimedia.org/wiki/File:Tonga_Volcano_Eruption_2022-01-15_0320Z_to_0610Z_Himawari-8_visible.webm | Japan Meteorological Agency / Digital Typhoon | CC BY 4.0 compatible public data terms | `/videos/wonders/great-volcano-tonga-eruption.mp4` | Trimmed to 4 seconds, scaled to 640px width, muted, and re-encoded as MP4/H.264 with OpenH264. Attribution: Japan Meteorological Agency / Digital Typhoon - CC BY 4.0 compatible public data terms. |
| `video-starvault-paranal-observatory` | `starvault-observatory` | https://commons.wikimedia.org/wiki/File:Morning_observations_time-lapse_at_Paranal.webm | ESO/J. Colosimo | CC BY 4.0 | `/videos/wonders/starvault-paranal-observatory.mp4` | Trimmed to 4 seconds, scaled to 640px width, muted, and re-encoded as MP4/H.264 with OpenH264. Attribution: ESO/J. Colosimo - CC BY 4.0. |
```

- [ ] **Step 7: Run source tests GREEN and commit**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/wonder-codex/sources.test.ts
```

Expected: PASS.

Commit:

```bash
git add src/systems/wonder-codex/types.ts src/systems/wonder-codex/video-sources.ts tests/systems/wonder-codex/sources.test.ts docs/superpowers/specs/2026-05-23-wonder-codex-atlas-source-ledger.md public/videos/wonders/great-volcano-tonga-eruption.mp4 public/videos/wonders/starvault-paranal-observatory.mp4
git commit -m "feat(wonders): add sourced video spike manifest"
```

## Task 2: Add Safe Video Presentation Models

**Files:**
- Create: `src/systems/wonder-codex/video-presentation.ts`
- Modify: `src/systems/wonder-codex/presentation.ts`
- Modify: `src/systems/wonder-discovery-reveal.ts`
- Modify: `src/systems/legendary-wonder-completion-presentation.ts`
- Test: `tests/systems/wonder-codex/presentation.test.ts`
- Test: `tests/systems/wonder-discovery-reveal.test.ts`
- Test: `tests/systems/legendary-wonder-completion-presentation.test.ts`

- [ ] **Step 1: Write failing presentation tests**

In `tests/systems/wonder-codex/presentation.test.ts`, add tests proving `videoPreview` appears only for visible supported pages and not for hidden/unsupported pages. Use the existing state/page helpers in that file; if the helper currently defaults to an unsupported page, pass `wonderId: 'great_volcano'` or `wonderId: 'starvault-observatory'` into the existing page builder:

```ts
  it('includes a safe silent video preview for supported Codex pages', () => {
    const view = buildWonderCodexPageViewModel(state(), {
      viewerId: 'player',
      pageId: 'great_volcano',
    });

    expect(view?.videoPreview).toMatchObject({
      id: 'video-great-volcano-tonga-eruption',
      wonderId: 'great_volcano',
      surface: 'codex',
      mimeType: 'video/mp4',
      audio: 'silent',
    });
    expect(view?.videoPreview?.src).toContain('/videos/wonders/great-volcano-tonga-eruption.mp4');
    expect(view?.videoPreview?.sourceUrl).toContain('commons.wikimedia.org/wiki/File:');
    expect(view?.videoPreview?.fallbackImage.src).toContain('/images/');
  });

  it('does not invent video previews for unsupported Codex pages', () => {
    const view = buildWonderCodexPageViewModel(state(), {
      viewerId: 'player',
      pageId: 'great_barrier_reef',
    });

    expect(view?.videoPreview).toBeUndefined();
  });
```

If the local helper is named `buildPage`, `state`, `codexState`, or similar, keep the assertions exactly the same and adapt only the helper call shape to existing test-file conventions.

Add natural reveal test:

```ts
  it('includes the supported natural reveal video preview for the active viewer', () => {
    const item = buildWonderDiscoveryRevealItem(state, 'player', {
      type: 'wonder-discovered',
      viewerId: 'player',
      wonderId: 'great_volcano',
      turn: 12,
    });

    expect(item?.videoPreview).toMatchObject({
      id: 'video-great-volcano-tonga-eruption',
      wonderId: 'great_volcano',
      surface: 'natural-reveal',
      audio: 'silent',
    });
  });

  it('does not include natural reveal video previews for another viewer', () => {
    const item = buildWonderDiscoveryRevealItem(state, 'rival', {
      type: 'wonder-discovered',
      viewerId: 'player',
      wonderId: 'great_volcano',
      turn: 12,
    });

    expect(item).toBeNull();
  });
```

Add legendary completion test with `starvault-observatory` completed by the player:

```ts
  it('includes the supported legendary completion video preview for the owner', () => {
    const item = buildLegendaryWonderCompletionCeremonyItem(state, 'player', {
      type: 'legendary-wonder-completed',
      playerId: 'player',
      wonderId: 'starvault-observatory',
      cityId: 'capital',
      turn: 20,
    });

    expect(item?.videoPreview).toMatchObject({
      id: 'video-starvault-paranal-observatory',
      wonderId: 'starvault-observatory',
      surface: 'legendary-completion',
      audio: 'silent',
    });
  });

  it('does not include rival legendary completion video previews', () => {
    const item = buildLegendaryWonderCompletionCeremonyItem(state, 'player', {
      type: 'legendary-wonder-completed',
      playerId: 'rival',
      wonderId: 'starvault-observatory',
      cityId: 'rival-city',
      turn: 20,
    });

    expect(item).toBeNull();
  });
```

- [ ] **Step 2: Run presentation tests RED**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/wonder-codex/presentation.test.ts tests/systems/wonder-discovery-reveal.test.ts tests/systems/legendary-wonder-completion-presentation.test.ts
```

Expected: FAIL because `videoPreview` is not defined.

- [ ] **Step 3: Add video presentation helper**

Create `src/systems/wonder-codex/video-presentation.ts`:

```ts
import { getImageSource } from '@/systems/wonder-codex/sources';
import { getWonderCodexVideoSourceForWonder } from '@/systems/wonder-codex/video-sources';
import type { WonderCodexVideoSurface } from '@/systems/wonder-codex/types';

export interface WonderVideoPreviewView {
  id: string;
  wonderId: string;
  surface: WonderCodexVideoSurface;
  src: string;
  mimeType: string;
  label: string;
  attribution: string;
  sourceUrl: string;
  license: string;
  audio: 'silent';
  fallbackImage: {
    src: string;
    alt: string;
    attribution: string;
    sourceUrl: string;
    license: string;
  };
}

function publicAssetUrl(localPath: string): string {
  const base = import.meta.env?.BASE_URL ?? '/';
  const normalizedBase = base.endsWith('/') ? base : `${base}/`;
  return `${normalizedBase}${localPath.replace(/^\/+/, '')}`;
}

export function getWonderVideoPreviewForSurface(
  wonderId: string,
  surface: WonderCodexVideoSurface,
  label: string,
): WonderVideoPreviewView | null {
  const source = getWonderCodexVideoSourceForWonder(wonderId, surface);
  if (!source) return null;
  const fallback = getImageSource(source.fallbackImageSourceId);
  if (!fallback) return null;
  return {
    id: source.id,
    wonderId: source.wonderId,
    surface,
    src: publicAssetUrl(source.localPath),
    mimeType: source.mimeType,
    label,
    attribution: source.attribution,
    sourceUrl: source.sourceUrl,
    license: source.license,
    audio: source.audio,
    fallbackImage: {
      src: publicAssetUrl(fallback.localPath),
      alt: `${label} source image`,
      attribution: fallback.attribution,
      sourceUrl: fallback.sourceUrl,
      license: fallback.license,
    },
  };
}
```

- [ ] **Step 4: Wire safe view models**

In `WonderCodexPageViewModel`, add:

```ts
videoPreview?: WonderVideoPreviewView;
```

In `buildPage`, resolve:

```ts
const videoPreview = getWonderVideoPreviewForSurface(entry.id, 'codex', entry.title);
```

and spread:

```ts
...(videoPreview ? { videoPreview } : {}),
```

In `WonderDiscoveryRevealItem` and `LegendaryWonderCompletionCeremonyItem`, add optional `videoPreview?: WonderVideoPreviewView`.

In their builders, add:

```ts
videoPreview: getWonderVideoPreviewForSurface(event.wonderId, 'natural-reveal', definition.name) ?? undefined,
```

and

```ts
videoPreview: getWonderVideoPreviewForSurface(event.wonderId, 'legendary-completion', definition.name) ?? undefined,
```

- [ ] **Step 5: Run presentation tests GREEN and commit**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/wonder-codex/presentation.test.ts tests/systems/wonder-discovery-reveal.test.ts tests/systems/legendary-wonder-completion-presentation.test.ts
```

Expected: PASS.

Commit:

```bash
git add src/systems/wonder-codex/video-presentation.ts src/systems/wonder-codex/presentation.ts src/systems/wonder-discovery-reveal.ts src/systems/legendary-wonder-completion-presentation.ts tests/systems/wonder-codex/presentation.test.ts tests/systems/wonder-discovery-reveal.test.ts tests/systems/legendary-wonder-completion-presentation.test.ts
git commit -m "feat(wonders): expose safe video previews"
```

## Task 3: Add Reusable Wonder Video View

**Files:**
- Create: `src/ui/wonder-video-view.ts`
- Create: `tests/ui/wonder-video-view.test.ts`

- [ ] **Step 1: Write failing UI helper tests**

Create `tests/ui/wonder-video-view.test.ts` with this structure, using a local `preview()` helper:

```ts
import { describe, expect, it, vi } from 'vitest';
import { createWonderVideoView } from '@/ui/wonder-video-view';
import type { WonderVideoPreviewView } from '@/systems/wonder-codex/video-presentation';

function preview(): WonderVideoPreviewView {
  return {
    id: 'video-great-volcano-tonga-eruption',
    wonderId: 'great_volcano',
    surface: 'codex',
    src: '/conquestoria/videos/wonders/great-volcano-tonga-eruption.mp4',
    mimeType: 'video/mp4',
    label: 'Great Volcano',
    attribution: 'Japan Meteorological Agency / Digital Typhoon - CC BY 4.0 compatible public data terms',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Tonga_Volcano_Eruption_2022-01-15_0320Z_to_0610Z_Himawari-8_visible.webm',
    license: 'CC BY 4.0 compatible public data terms',
    audio: 'silent',
    fallbackImage: {
      src: '/conquestoria/images/wonders/volcano.jpg',
      alt: 'Great Volcano source image',
      attribution: 'Fallback source',
      sourceUrl: 'https://example.test/fallback',
      license: 'CC BY 4.0',
    },
  };
}

describe('createWonderVideoView', () => {
  it('renders a silent looped video with visible controls when motion is allowed', () => {
    const element = createWonderVideoView({ preview: preview(), autoplay: 'in-view' });
    const video = element.querySelector('video');
    const source = element.querySelector('source');

    expect(element.dataset.wonderVideoView).toBe('video-great-volcano-tonga-eruption');
    expect(element.dataset.wonderVideoSurface).toBe('codex');
    expect(video?.muted).toBe(true);
    expect(video?.loop).toBe(true);
    expect(video?.playsInline).toBe(true);
    expect(source?.getAttribute('src')).toContain('/videos/wonders/great-volcano-tonga-eruption.mp4');
    expect(source?.getAttribute('type')).toBe('video/mp4');
    expect(element.querySelector('[data-wonder-video-toggle]')?.textContent).toBe('Pause');
  });

  it('toggles between pause and play without creating audio behavior', () => {
    const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    const element = createWonderVideoView({ preview: preview(), autoplay: 'in-view' });
    const button = element.querySelector<HTMLButtonElement>('[data-wonder-video-toggle]');

    button?.click();
    expect(pause).toHaveBeenCalled();
    expect(button?.textContent).toBe('Play');

    button?.click();
    expect(play).toHaveBeenCalled();
    expect(button?.textContent).toBe('Pause');

    pause.mockRestore();
    play.mockRestore();
  });

  it('renders the sourced fallback image and no video when reduced motion is enabled', () => {
    const element = createWonderVideoView({ preview: preview(), reducedMotion: true });

    expect(element.dataset.wonderVideoState).toBe('fallback');
    expect(element.querySelector('video')).toBeNull();
    expect(element.querySelector('img')?.getAttribute('src')).toContain('/images/wonders/volcano.jpg');
    expect(element.querySelector('a')?.getAttribute('href')).toBe('https://example.test/fallback');
  });

  it('replaces video with the fallback image on media error', () => {
    const element = createWonderVideoView({ preview: preview(), autoplay: 'in-view' });
    element.querySelector('video')?.dispatchEvent(new Event('error'));

    expect(element.dataset.wonderVideoState).toBe('fallback');
    expect(element.querySelector('video')).toBeNull();
    expect(element.querySelector('img')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run helper tests RED**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/wonder-video-view.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement `createWonderVideoView`**

Create a helper that accepts:

```ts
export interface WonderVideoViewOptions {
  preview: WonderVideoPreviewView;
  reducedMotion?: boolean;
  autoplay?: 'in-view' | 'immediate';
}
```

The returned element must:

- use `createGameButton()` for the pause/play button.
- set `video.muted = true`, `video.loop = true`, `video.playsInline = true`.
- append a `<source>` with `preview.src` and `preview.mimeType`.
- set `data-wonder-video-view`, `data-wonder-video-surface`, and `data-wonder-video-state`.
- render fallback `<img>` with attribution link on reduced motion or video error.
- use `IntersectionObserver` for `autoplay: 'in-view'` only when available.
- never create audio nodes or read game state.

- [ ] **Step 4: Run helper tests GREEN and commit**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/wonder-video-view.test.ts
```

Expected: PASS.

Commit:

```bash
git add src/ui/wonder-video-view.ts tests/ui/wonder-video-view.test.ts
git commit -m "feat(wonders): add reusable video view"
```

## Task 4: Wire Codex And Ceremony UI

**Files:**
- Modify: `src/ui/wonder-codex-page.ts`
- Modify: `src/ui/wonder-discovery-ceremony.ts`
- Modify: `src/ui/legendary-wonder-completion-ceremony.ts`
- Test: `tests/ui/wonder-codex-page.test.ts`
- Test: `tests/ui/wonder-discovery-ceremony.test.ts`
- Test: `tests/ui/legendary-wonder-completion-ceremony.test.ts`

- [ ] **Step 1: Write failing integration UI tests**

Add concrete UI integration tests with local `videoPreview` fixtures:

In `tests/ui/wonder-codex-page.test.ts`, extend the existing page fixture so it can include `videoPreview`, then add:

```ts
  it('renders supported Codex video previews without hiding actions', () => {
    const element = createWonderCodexPage(page({
      videoPreview: videoPreview('codex'),
      actions: [{ id: 'replay', label: 'Replay discovery', disabled: false }],
    }));

    expect(element.querySelector('[data-wonder-video-view]')).toBeTruthy();
    expect(element.querySelector('video')).toBeTruthy();
    expect(element.querySelector('button')?.textContent).toContain('Replay discovery');
  });

  it('renders a still fallback instead of video on reduced-motion Codex pages', () => {
    const element = createWonderCodexPage(page({
      videoPreview: videoPreview('codex'),
      reducedMotion: true,
    }));

    expect(element.querySelector('[data-wonder-video-view]')).toBeTruthy();
    expect(element.querySelector('video')).toBeNull();
    expect(element.querySelector('img')?.getAttribute('src')).toContain('/images/');
  });

  it('keeps Codex actions reachable after video fallback', () => {
    const element = createWonderCodexPage(page({
      videoPreview: videoPreview('codex'),
      actions: [{ id: 'open', label: 'Open Atlas', disabled: false }],
    }));

    element.querySelector('video')?.dispatchEvent(new Event('error'));

    expect(element.querySelector('video')).toBeNull();
    expect(element.querySelector('button')?.textContent).toContain('Open Atlas');
  });
```

In `tests/ui/wonder-discovery-ceremony.test.ts`, add:

```ts
  it('uses the video view for supported natural discoveries while keeping actions clickable', () => {
    const onSkip = vi.fn();
    const element = createWonderDiscoveryCeremony(item({ videoPreview: videoPreview('natural-reveal') }), { onSkip });

    expect(element.querySelector('[data-wonder-video-view]')).toBeTruthy();
    element.querySelector<HTMLButtonElement>('[data-action="skip"]')?.click();
    expect(onSkip).toHaveBeenCalled();
  });

  it('keeps the static ceremony visual in reduced motion', () => {
    const element = createWonderDiscoveryCeremony(item({ videoPreview: videoPreview('natural-reveal') }), {
      reducedMotion: true,
    });

    expect(element.querySelector('[data-wonder-video-view]')).toBeNull();
    expect(element.querySelector('[data-wonder-spectacle-vignette]')).toBeTruthy();
  });
```

In `tests/ui/legendary-wonder-completion-ceremony.test.ts`, add:

```ts
  it('uses the video view for supported legendary completions while keeping actions clickable', () => {
    const onContinue = vi.fn();
    const element = createLegendaryWonderCompletionCeremony(
      item({ videoPreview: videoPreview('legendary-completion') }),
      { onContinue },
    );

    expect(element.querySelector('[data-wonder-video-view]')).toBeTruthy();
    element.querySelector<HTMLButtonElement>('[data-action="continue"]')?.click();
    expect(onContinue).toHaveBeenCalled();
  });

  it('keeps the static legendary ceremony visual in reduced motion', () => {
    const element = createLegendaryWonderCompletionCeremony(
      item({ videoPreview: videoPreview('legendary-completion') }),
      { reducedMotion: true },
    );

    expect(element.querySelector('[data-wonder-video-view]')).toBeNull();
    expect(element.querySelector('[data-legendary-wonder-visual]')).toBeTruthy();
  });
```

If existing test helpers use different names than `page`, `item`, or `videoPreview`, keep the assertions and adapt only the fixture wrapper names.

- [ ] **Step 2: Run integration UI tests RED**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/wonder-codex-page.test.ts tests/ui/wonder-discovery-ceremony.test.ts tests/ui/legendary-wonder-completion-ceremony.test.ts
```

Expected: FAIL because the live UI does not consume `videoPreview`.

- [ ] **Step 3: Wire Codex page**

In `src/ui/wonder-codex-page.ts`, import `createWonderVideoView`.

Replace the top figure behavior so:

- if `page.videoPreview` exists, append `createWonderVideoView({ preview: page.videoPreview, reducedMotion, autoplay: 'in-view' })` before normal hero copy.
- if no video preview exists, keep the existing sourced image figure.
- if reduced motion is true, the video view renders the still fallback.

Do not remove page sections, actions, related links, rival intel, or landmark previews.

- [ ] **Step 4: Wire ceremonies**

In natural discovery ceremony, use reduced motion to keep the established static ceremony visual:

```ts
const visual = item.videoPreview
  ? reducedMotion
    ? createWonderSpectacleVignette(...)
    : createWonderVideoView({ preview: item.videoPreview, autoplay: 'immediate' })
  : createWonderSpectacleVignette(...);
```

In legendary completion ceremony, use reduced motion to keep the established static ceremony visual:

```ts
const visual = item.videoPreview
  ? reducedMotion
    ? createWonderVisualVignette(...)
    : createWonderVideoView({ preview: item.videoPreview, autoplay: 'immediate' })
  : createWonderVisualVignette(...);
```

Set the visual width/height to the existing `148px` ceremony visual dimensions so copy and buttons remain readable.

- [ ] **Step 5: Run integration UI tests GREEN and commit**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/wonder-video-view.test.ts tests/ui/wonder-codex-page.test.ts tests/ui/wonder-discovery-ceremony.test.ts tests/ui/legendary-wonder-completion-ceremony.test.ts
```

Expected: PASS.

Commit:

```bash
git add src/ui/wonder-codex-page.ts src/ui/wonder-discovery-ceremony.ts src/ui/legendary-wonder-completion-ceremony.ts tests/ui/wonder-codex-page.test.ts tests/ui/wonder-discovery-ceremony.test.ts tests/ui/legendary-wonder-completion-ceremony.test.ts
git commit -m "feat(wonders): show video spike in codex and ceremonies"
```

## Task 5: Review And Verification

**Files:** all changed files.

- [ ] **Step 1: Run targeted test set**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/wonder-codex/sources.test.ts tests/systems/wonder-codex/presentation.test.ts tests/systems/wonder-discovery-reveal.test.ts tests/systems/legendary-wonder-completion-presentation.test.ts tests/ui/wonder-video-view.test.ts tests/ui/wonder-codex-page.test.ts tests/ui/wonder-discovery-ceremony.test.ts tests/ui/legendary-wonder-completion-ceremony.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run source rule checks**

Run:

```bash
scripts/check-src-rule-violations.sh src/systems/wonder-codex/types.ts src/systems/wonder-codex/video-sources.ts src/systems/wonder-codex/video-presentation.ts src/systems/wonder-codex/presentation.ts src/systems/wonder-discovery-reveal.ts src/systems/legendary-wonder-completion-presentation.ts src/ui/wonder-video-view.ts src/ui/wonder-codex-page.ts src/ui/wonder-discovery-ceremony.ts src/ui/legendary-wonder-completion-ceremony.ts
```

Expected: PASS.

- [ ] **Step 3: Verify assets are silent and under budget**

Run:

```bash
ffprobe -v error -show_entries stream=codec_type -of csv=p=0 public/videos/wonders/great-volcano-tonga-eruption.mp4
ffprobe -v error -show_entries stream=codec_type -of csv=p=0 public/videos/wonders/starvault-paranal-observatory.mp4
stat -f "%z %N" public/videos/wonders/*.mp4
```

Expected: `video` only for both files; each size <= `5242880`.

- [ ] **Step 4: Run wonder regressions, build, and full tests**

Run:

```bash
./scripts/run-wonder-regressions.sh
./scripts/run-with-mise.sh yarn build
./scripts/run-with-mise.sh yarn test
```

Expected: all exit 0. Known sandbox-only mise cache warnings and existing Vite chunk-size warnings are acceptable only when commands exit 0.

- [ ] **Step 5: Inspect diffs for spec conformance**

Run:

```bash
git diff --stat origin/main...HEAD
git diff --stat
git diff origin/main...HEAD
git diff
```

Expected:
- Only Stage 3 spec, plan, video source manifest, video assets, Codex/ceremony presentation/UI, source ledger, and tests changed.
- No `src/audio/**`, natural-wonder audio catalog, service worker, platform, Tauri, gameplay, save, AI, or map-renderer files changed.
- No SFX cue is consumed.
- No runtime remote video URL is used.

- [ ] **Step 6: Commit review fixes if needed**

If review finds a defect, add a focused failing test, fix it, rerun the relevant command, and commit:

```bash
git add docs/superpowers/plans/2026-06-06-stage-3-real-video-spike.md src/systems/wonder-codex/types.ts src/systems/wonder-codex/video-sources.ts src/systems/wonder-codex/video-presentation.ts src/systems/wonder-codex/presentation.ts src/systems/wonder-discovery-reveal.ts src/systems/legendary-wonder-completion-presentation.ts src/ui/wonder-video-view.ts src/ui/wonder-codex-page.ts src/ui/wonder-discovery-ceremony.ts src/ui/legendary-wonder-completion-ceremony.ts tests/systems/wonder-codex/sources.test.ts tests/systems/wonder-codex/presentation.test.ts tests/systems/wonder-discovery-reveal.test.ts tests/systems/legendary-wonder-completion-presentation.test.ts tests/ui/wonder-video-view.test.ts tests/ui/wonder-codex-page.test.ts tests/ui/wonder-discovery-ceremony.test.ts tests/ui/legendary-wonder-completion-ceremony.test.ts docs/superpowers/specs/2026-05-23-wonder-codex-atlas-source-ledger.md public/videos/wonders/great-volcano-tonga-eruption.mp4 public/videos/wonders/starvault-paranal-observatory.mp4
git commit -m "fix(wonders): harden video spike"
```

## Plan Self-Review

- Spec coverage: Tasks cover two real sourced clips, source-led manifest, Codex playback, natural reveal ceremony playback, legendary completion ceremony playback, silent video, future SFX metadata, still fallback, attribution, asset-size checks, and verification.
- Architecture: Source/eligibility stays in `src/systems/wonder-codex/**`; UI receives safe `videoPreview` view models and renders through one reusable helper.
- Testing: Every behavior starts with failing tests; negative coverage includes unsupported pages, reduced motion, video error fallback, and hidden/unsafe presentation paths.
- UI/UX: Controls remain visible and action callbacks remain reachable; Codex pause/play is tested by visible button text.
- Audio/SFX: No audio files, mixer code, SFX triggers, or playback hooks are changed.
- Data quality: Manifest, ledger, local files, byte sizes, MIME type, fallback image IDs, and source metadata are all tested.
