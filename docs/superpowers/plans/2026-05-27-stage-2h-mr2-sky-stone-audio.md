# Stage 2H-MR2 Sky And Stone Natural Wonder Audio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Do not use subagents unless the user explicitly authorizes them.

**Goal:** Add complete, credited natural-wonder audio packages for Sacred Mountain, Crystal Caverns, and Aurora Fields while preserving MR1 playback architecture.

**Architecture:** This is a data, asset, and validation slice on top of the existing Stage 2H audio architecture. The existing `NaturalWonderAudioDirector`, `AudioMixer`, UI hooks, and viewer-safe focus helper stay unchanged unless a test exposes a real MR1 defect. Catalog and source metadata become MR1+MR2 aware through durable complete-coverage constants and source records that include credit text and local output paths.

**Tech Stack:** TypeScript, Web Audio API metadata, Vitest, Soundimage.org source audio, OGG Vorbis assets under `public/audio/wonders/`, `ffmpeg`/`ffprobe` for local conversion and duration checks.

---

## Scope Check

The design spec is focused enough for one implementation plan:

- Complete `sacred_mountain`, `crystal_caverns`, and `aurora_fields`.
- Keep MR1 complete entries working.
- Keep all MR3-MR5 wonders explicit pending entries.
- Keep `FINAL_NATURAL_WONDER_AUDIO_COVERAGE = false`.
- Do not change service worker, platform, UI, renderer, gameplay, saves, AI, or visibility logic.

If listening review rejects one of the selected Soundimage sources, stop implementation, record the rejected source and reason in this plan, and get a replacement source approved before changing code. Do not land a weak clip just to keep the mechanical plan moving.

## Source Selection

Use these exact Soundimage-first sources for the first implementation pass:

| Wonder | Output | Source title | Source URL | License category | Fit rationale |
|---|---|---|---|---|---|
| `sacred_mountain` | `audio/wonders/sacred-mountain-stinger.ogg` | `Reaching Altitude` | `https://soundimage.org/wp-content/uploads/2017/04/Reaching-Altitude.mp3` | Soundimage.org free use with attribution | Aerial lift and altitude language fit a mountain reveal; trim to a short discovery accent. |
| `sacred_mountain` | `audio/wonders/sacred-mountain-ambient.ogg` | `Our Mountain_v003` | `https://soundimage.org/wp-content/uploads/2024/01/Our-Mountain_v003.wav` | Soundimage.org free use with attribution | Explicit mountain identity and earthy calm fit Codex/map ambience. |
| `crystal_caverns` | `audio/wonders/crystal-caverns-stinger.ogg` | `Chamber of Jewels` | `http://soundimage.org/wp-content/uploads/2015/03/Chamber-of-Jewels.mp3` | Soundimage.org free use with attribution | Jewel/cavern association gives a short crystalline reveal candidate. |
| `crystal_caverns` | `audio/wonders/crystal-caverns-ambient.ogg` | `Crystal Caverns` | `http://soundimage.org/wp-content/uploads/2016/04/Crystal-Caverns.mp3` | Soundimage.org free use with attribution | Direct title match and short loop-friendly duration. |
| `aurora_fields` | `audio/wonders/aurora-fields-stinger.ogg` | `Updraft` | `https://soundimage.org/wp-content/uploads/2024/01/Updraft.wav` | Soundimage.org free use with attribution | Upward sweep fits a luminous sky reveal. |
| `aurora_fields` | `audio/wonders/aurora-fields-ambient.ogg` | `Strange Phenomenon` | `https://soundimage.org/wp-content/uploads/2024/01/Strange-Phenomenon.wav` | Soundimage.org free use with attribution | Mysterious, skylike phenomenon language fits aurora ambience without implying combat. |

All six sources are by Eric Matyas / Soundimage.org and use the Soundimage free-use-with-attribution policy. Credits must point to the exact source URLs above and include the local output path. The source-page evidence is:

- `Reaching Altitude` appears on Soundimage's Aerial / Drone and Events / Travel pages.
- `Our Mountain_v003`, `Updraft`, and `Strange Phenomenon` appear on Soundimage's Fantasy 1 / Fantasy 1 Ogg pages.
- `Chamber of Jewels` and `Crystal Caverns` appear on Soundimage's Misc Looping Music page.

## File Structure

Modify:

- `tests/audio/natural-wonder-audio-catalog.test.ts`
  - Owns coverage tests for complete vs pending natural-wonder audio, asset existence, OGG magic bytes, source metadata, and credits.
- `tests/audio/natural-wonder-audio-director.test.ts`
  - Keeps pending entries fail-closed and proves at least one MR2 complete entry works through director playback.
- `src/audio/natural-wonder-audio-sources.ts`
  - Structured source manifest for all complete natural-wonder audio sources. Add `creditText` and `localFiles` to every complete source record.
- `src/audio/natural-wonder-audio-catalog.ts`
  - Complete/pending catalog. Add complete MR2 entries and durable complete-coverage constants.
- `AUDIO-CREDITS.md`
  - Human-facing credit ledger for the six MR2 clips.

Create:

- `public/audio/wonders/sacred-mountain-stinger.ogg`
- `public/audio/wonders/sacred-mountain-ambient.ogg`
- `public/audio/wonders/crystal-caverns-stinger.ogg`
- `public/audio/wonders/crystal-caverns-ambient.ogg`
- `public/audio/wonders/aurora-fields-stinger.ogg`
- `public/audio/wonders/aurora-fields-ambient.ogg`

Temporary local source downloads live outside git:

- `/private/tmp/conquestoria-2h-mr2-audio-src/`

## Player Truth Table

| Before | Action | Immediate visible/audio result | Must remain reachable |
|---|---|---|---|
| Current human player's discovery reveal starts for `sacred_mountain` | Reveal queue starts the ceremony | Sacred Mountain stinger plays once through existing ducking; reveal visuals continue | Open Atlas and map highlight behavior |
| Codex reader opens discovered `crystal_caverns` | Player selects Crystal Caverns | Crystal Caverns ambient starts through existing Codex ambience path | Full Codex catalog |
| Codex reader shows `aurora_fields` | Player clicks `Replay animation` | Existing replay animation runs, Aurora stinger plays, Aurora ambient starts or refreshes | Reduced-motion disabled behavior |
| Map has a currently visible discovered MR2 wonder tile | Player taps/focuses/inspects the tile | Existing map-focus ambience path starts the matching loop and times out | Tap SFX, territory inspection close |
| Codex reader opens a pending MR3-MR5 natural wonder | Existing discovery/Codex rules allow the page | No stinger, no ambient loop, no fallback audio | Static Codex content |

## Misleading UI Risks

- Do not add UI labels, buttons, or hints that imply all natural wonders have audio before MR5.
- Do not rename pending entries as partial or generic audio; pending means no playable paths and no fallback playback.
- Do not make map focus ambience less private than MR1; MR2 audio must still require current live visibility plus discovered status.

## Interaction Replay Checklist

MR2 should not change UI code. Existing MR1 tests already cover replay click, Codex selection, discovery queue, and map focus lifecycle. If implementation touches UI anyway, update the relevant UI tests in the same change and prove repeated replay/map focus does not stack ambient loops.

## Task 1: Make Catalog Tests Demand MR1+MR2 Coverage And Strong Source Metadata

**Files:**

- Modify: `tests/audio/natural-wonder-audio-catalog.test.ts`
- Test: `tests/audio/natural-wonder-audio-catalog.test.ts`

- [ ] **Step 1: Replace the catalog test with the MR1+MR2 contract**

Replace `tests/audio/natural-wonder-audio-catalog.test.ts` with:

```ts
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import {
  COMPLETE_NATURAL_WONDER_AUDIO_IDS,
  FINAL_NATURAL_WONDER_AUDIO_COVERAGE,
  getCompleteNaturalWonderAudioEntry,
  getNaturalWonderAudioCatalog,
  MR2_NATURAL_WONDER_AUDIO_IDS,
} from '../../src/audio/natural-wonder-audio-catalog';
import { getNaturalWonderAudioSource } from '../../src/audio/natural-wonder-audio-sources';
import { WONDER_DEFINITIONS } from '../../src/systems/wonder-definitions';
import { getWonderSpectacleRecipe } from '../../src/systems/wonder-spectacle/presentation';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

function publicAssetPath(file: string): string {
  return resolve(repoRoot, 'public', file);
}

describe('natural wonder audio catalog', () => {
  it('has exactly one catalog entry for every natural wonder definition', () => {
    const catalog = getNaturalWonderAudioCatalog();

    expect(catalog.map(entry => entry.wonderId).sort()).toEqual(
      WONDER_DEFINITIONS.map(definition => definition.id).sort(),
    );
  });

  it('keeps MR1 and MR2 wonders complete and all remaining wonders explicit pending entries', () => {
    const catalog = getNaturalWonderAudioCatalog();
    const completeIds = new Set<string>(COMPLETE_NATURAL_WONDER_AUDIO_IDS);

    expect(MR2_NATURAL_WONDER_AUDIO_IDS).toEqual([
      'sacred_mountain',
      'crystal_caverns',
      'aurora_fields',
    ]);

    for (const entry of catalog) {
      if (completeIds.has(entry.wonderId)) {
        expect(entry.status).toBe('complete');
      } else {
        expect(entry.status).toBe('pending');
      }
    }
    expect(FINAL_NATURAL_WONDER_AUDIO_COVERAGE).toBe(false);
  });

  it('aligns complete entry sound moods with spectacle recipes', () => {
    for (const wonderId of COMPLETE_NATURAL_WONDER_AUDIO_IDS) {
      const entry = getCompleteNaturalWonderAudioEntry(wonderId);
      const recipe = getWonderSpectacleRecipe(wonderId);

      expect(entry?.soundMood).toBe(recipe?.soundMood);
    }
  });

  it('references source metadata and existing OGG files for complete entries', () => {
    for (const wonderId of COMPLETE_NATURAL_WONDER_AUDIO_IDS) {
      const entry = getCompleteNaturalWonderAudioEntry(wonderId);
      expect(entry).not.toBeNull();
      if (!entry) throw new Error(`Missing complete audio entry for ${wonderId}`);

      for (const clip of [entry.stinger, entry.ambientLoop]) {
        const source = getNaturalWonderAudioSource(clip.sourceId);
        expect(source).toBeDefined();
        expect(source?.localFiles).toContain(clip.file);
        expect(existsSync(publicAssetPath(clip.file))).toBe(true);
        expect(readFileSync(publicAssetPath(clip.file)).subarray(0, 4).toString('utf8')).toBe('OggS');
      }
    }
  });

  it('keeps credits synchronized with source titles, credit text, and local output paths', () => {
    const credits = readFileSync(resolve(repoRoot, 'AUDIO-CREDITS.md'), 'utf8');

    for (const wonderId of COMPLETE_NATURAL_WONDER_AUDIO_IDS) {
      const entry = getCompleteNaturalWonderAudioEntry(wonderId);
      if (!entry) throw new Error(`Missing complete audio entry for ${wonderId}`);

      for (const clip of [entry.stinger, entry.ambientLoop]) {
        const source = getNaturalWonderAudioSource(clip.sourceId);
        expect(source).toBeDefined();
        expect(source?.title).not.toBe('');
        expect(source?.creator).toBe('Eric Matyas');
        expect(source?.site).toBe('Soundimage.org');
        expect(source?.sourceUrl).toContain('soundimage.org');
        expect(source?.license).toBe('Soundimage.org free use with attribution');
        expect(source?.creditText).toContain(source!.title);
        expect(source?.creditText).toContain('Eric Matyas');
        expect(source?.localFiles).toContain(clip.file);
        expect(credits).toContain(source!.creditText);
        expect(credits).toContain(source!.sourceUrl);
        expect(credits).toContain(clip.file);
      }
    }
  });
});
```

- [ ] **Step 2: Run the catalog test and verify it fails for missing constants**

Run:

```bash
./scripts/run-with-mise.sh yarn vitest run tests/audio/natural-wonder-audio-catalog.test.ts
```

Expected: FAIL during transform or import because `COMPLETE_NATURAL_WONDER_AUDIO_IDS` and `MR2_NATURAL_WONDER_AUDIO_IDS` do not exist yet.

- [ ] **Step 3: Commit the failing test**

```bash
git add tests/audio/natural-wonder-audio-catalog.test.ts
git commit -m "test(audio): require stage 2h mr2 audio coverage"
```

## Task 2: Harden Natural Wonder Audio Source Metadata

**Files:**

- Modify: `src/audio/natural-wonder-audio-sources.ts`
- Test: `tests/audio/natural-wonder-audio-catalog.test.ts`

- [ ] **Step 1: Replace the source manifest with hardened metadata**

Replace `src/audio/natural-wonder-audio-sources.ts` with:

```ts
export interface NaturalWonderAudioSource {
  id: string;
  title: string;
  creator: 'Eric Matyas';
  site: 'Soundimage.org';
  sourceUrl: string;
  license: 'Soundimage.org free use with attribution';
  creditText: string;
  localFiles: readonly string[];
}

export const NATURAL_WONDER_AUDIO_SOURCES: readonly NaturalWonderAudioSource[] = [
  {
    id: 'soundimage-underwater-rumble',
    title: 'Underwater Rumble',
    creator: 'Eric Matyas',
    site: 'Soundimage.org',
    sourceUrl: 'https://soundimage.org/wp-content/uploads/2019/11/Underwater-Rumble.mp3',
    license: 'Soundimage.org free use with attribution',
    creditText: '"Underwater Rumble" by Eric Matyas, Soundimage.org.',
    localFiles: ['audio/wonders/great-volcano-stinger.ogg'],
  },
  {
    id: 'soundimage-quiet-tension-looping',
    title: 'Quiet Tension_Looping',
    creator: 'Eric Matyas',
    site: 'Soundimage.org',
    sourceUrl: 'https://soundimage.org/wp-content/uploads/2018/10/Quiet-Tension_Looping.mp3',
    license: 'Soundimage.org free use with attribution',
    creditText: '"Quiet Tension_Looping" by Eric Matyas, Soundimage.org.',
    localFiles: ['audio/wonders/great-volcano-ambient.ogg'],
  },
  {
    id: 'soundimage-morning-dew',
    title: 'Morning Dew',
    creator: 'Eric Matyas',
    site: 'Soundimage.org',
    sourceUrl: 'https://soundimage.org/wp-content/uploads/2014/02/Morning-Dew.mp3',
    license: 'Soundimage.org free use with attribution',
    creditText: '"Morning Dew" by Eric Matyas, Soundimage.org.',
    localFiles: ['audio/wonders/ancient-forest-stinger.ogg'],
  },
  {
    id: 'soundimage-sunrise-looping',
    title: 'Sunrise_Looping',
    creator: 'Eric Matyas',
    site: 'Soundimage.org',
    sourceUrl: 'https://soundimage.org/wp-content/uploads/2018/10/Sunrise_Looping.mp3',
    license: 'Soundimage.org free use with attribution',
    creditText: '"Sunrise_Looping" by Eric Matyas, Soundimage.org.',
    localFiles: ['audio/wonders/ancient-forest-ambient.ogg'],
  },
  {
    id: 'soundimage-life-in-a-drop',
    title: 'Life in a Drop',
    creator: 'Eric Matyas',
    site: 'Soundimage.org',
    sourceUrl: 'https://soundimage.org/wp-content/uploads/2014/02/Life-in-a-Drop.mp3',
    license: 'Soundimage.org free use with attribution',
    creditText: '"Life in a Drop" by Eric Matyas, Soundimage.org.',
    localFiles: ['audio/wonders/coral-reef-stinger.ogg'],
  },
  {
    id: 'soundimage-underwater-world-looping',
    title: 'Underwater World_Looping',
    creator: 'Eric Matyas',
    site: 'Soundimage.org',
    sourceUrl: 'https://soundimage.org/wp-content/uploads/2016/11/Underwater-World_Looping.mp3',
    license: 'Soundimage.org free use with attribution',
    creditText: '"Underwater World_Looping" by Eric Matyas, Soundimage.org.',
    localFiles: ['audio/wonders/coral-reef-ambient.ogg'],
  },
  {
    id: 'soundimage-reaching-altitude',
    title: 'Reaching Altitude',
    creator: 'Eric Matyas',
    site: 'Soundimage.org',
    sourceUrl: 'https://soundimage.org/wp-content/uploads/2017/04/Reaching-Altitude.mp3',
    license: 'Soundimage.org free use with attribution',
    creditText: '"Reaching Altitude" by Eric Matyas, Soundimage.org.',
    localFiles: ['audio/wonders/sacred-mountain-stinger.ogg'],
  },
  {
    id: 'soundimage-our-mountain-v003',
    title: 'Our Mountain_v003',
    creator: 'Eric Matyas',
    site: 'Soundimage.org',
    sourceUrl: 'https://soundimage.org/wp-content/uploads/2024/01/Our-Mountain_v003.wav',
    license: 'Soundimage.org free use with attribution',
    creditText: '"Our Mountain_v003" by Eric Matyas, Soundimage.org.',
    localFiles: ['audio/wonders/sacred-mountain-ambient.ogg'],
  },
  {
    id: 'soundimage-chamber-of-jewels',
    title: 'Chamber of Jewels',
    creator: 'Eric Matyas',
    site: 'Soundimage.org',
    sourceUrl: 'http://soundimage.org/wp-content/uploads/2015/03/Chamber-of-Jewels.mp3',
    license: 'Soundimage.org free use with attribution',
    creditText: '"Chamber of Jewels" by Eric Matyas, Soundimage.org.',
    localFiles: ['audio/wonders/crystal-caverns-stinger.ogg'],
  },
  {
    id: 'soundimage-crystal-caverns',
    title: 'Crystal Caverns',
    creator: 'Eric Matyas',
    site: 'Soundimage.org',
    sourceUrl: 'http://soundimage.org/wp-content/uploads/2016/04/Crystal-Caverns.mp3',
    license: 'Soundimage.org free use with attribution',
    creditText: '"Crystal Caverns" by Eric Matyas, Soundimage.org.',
    localFiles: ['audio/wonders/crystal-caverns-ambient.ogg'],
  },
  {
    id: 'soundimage-updraft',
    title: 'Updraft',
    creator: 'Eric Matyas',
    site: 'Soundimage.org',
    sourceUrl: 'https://soundimage.org/wp-content/uploads/2024/01/Updraft.wav',
    license: 'Soundimage.org free use with attribution',
    creditText: '"Updraft" by Eric Matyas, Soundimage.org.',
    localFiles: ['audio/wonders/aurora-fields-stinger.ogg'],
  },
  {
    id: 'soundimage-strange-phenomenon',
    title: 'Strange Phenomenon',
    creator: 'Eric Matyas',
    site: 'Soundimage.org',
    sourceUrl: 'https://soundimage.org/wp-content/uploads/2024/01/Strange-Phenomenon.wav',
    license: 'Soundimage.org free use with attribution',
    creditText: '"Strange Phenomenon" by Eric Matyas, Soundimage.org.',
    localFiles: ['audio/wonders/aurora-fields-ambient.ogg'],
  },
] as const;

export function getNaturalWonderAudioSource(sourceId: string): NaturalWonderAudioSource | undefined {
  return NATURAL_WONDER_AUDIO_SOURCES.find(source => source.id === sourceId);
}
```

- [ ] **Step 2: Run the catalog test and verify it still fails for catalog constants**

Run:

```bash
./scripts/run-with-mise.sh yarn vitest run tests/audio/natural-wonder-audio-catalog.test.ts
```

Expected: FAIL because `COMPLETE_NATURAL_WONDER_AUDIO_IDS` and `MR2_NATURAL_WONDER_AUDIO_IDS` still do not exist in `src/audio/natural-wonder-audio-catalog.ts`.

- [ ] **Step 3: Commit the source metadata hardening**

```bash
git add src/audio/natural-wonder-audio-sources.ts
git commit -m "feat(audio): harden natural wonder source metadata"
```

## Task 3: Add MR2 Catalog Entries And Complete-Coverage Constants

**Files:**

- Modify: `src/audio/natural-wonder-audio-catalog.ts`
- Test: `tests/audio/natural-wonder-audio-catalog.test.ts`

- [ ] **Step 1: Replace the complete-ID constants and `COMPLETE_ENTRIES` typing**

In `src/audio/natural-wonder-audio-catalog.ts`, replace:

```ts
export const FINAL_NATURAL_WONDER_AUDIO_COVERAGE = false;
export const MR1_NATURAL_WONDER_AUDIO_IDS = ['great_volcano', 'ancient_forest', 'coral_reef'] as const;

const COMPLETE_ENTRIES: Record<(typeof MR1_NATURAL_WONDER_AUDIO_IDS)[number], CompleteNaturalWonderAudioEntry> = {
```

with:

```ts
export const FINAL_NATURAL_WONDER_AUDIO_COVERAGE = false;
export const MR1_NATURAL_WONDER_AUDIO_IDS = ['great_volcano', 'ancient_forest', 'coral_reef'] as const;
export const MR2_NATURAL_WONDER_AUDIO_IDS = [
  'sacred_mountain',
  'crystal_caverns',
  'aurora_fields',
] as const;
export const COMPLETE_NATURAL_WONDER_AUDIO_IDS = [
  ...MR1_NATURAL_WONDER_AUDIO_IDS,
  ...MR2_NATURAL_WONDER_AUDIO_IDS,
] as const;

const COMPLETE_ENTRIES: Record<(typeof COMPLETE_NATURAL_WONDER_AUDIO_IDS)[number], CompleteNaturalWonderAudioEntry> = {
```

- [ ] **Step 2: Add the three MR2 complete entries after the `coral_reef` entry**

Add these entries inside `COMPLETE_ENTRIES`:

```ts
  sacred_mountain: {
    wonderId: 'sacred_mountain',
    status: 'complete',
    soundMood: 'high-wind-chime',
    stinger: {
      id: 'sacred-mountain-stinger',
      file: 'audio/wonders/sacred-mountain-stinger.ogg',
      sourceId: 'soundimage-reaching-altitude',
      gain: 0.70,
    },
    ambientLoop: {
      id: 'sacred-mountain-ambient',
      file: 'audio/wonders/sacred-mountain-ambient.ogg',
      sourceId: 'soundimage-our-mountain-v003',
      gain: 0.26,
      loop: { loopStart: 0, loopEnd: 79.0 },
      fadeInMs: 700,
      fadeOutMs: 550,
      mapFocusTimeoutMs: 12000,
    },
  },
  crystal_caverns: {
    wonderId: 'crystal_caverns',
    status: 'complete',
    soundMood: 'crystal-hum',
    stinger: {
      id: 'crystal-caverns-stinger',
      file: 'audio/wonders/crystal-caverns-stinger.ogg',
      sourceId: 'soundimage-chamber-of-jewels',
      gain: 0.68,
    },
    ambientLoop: {
      id: 'crystal-caverns-ambient',
      file: 'audio/wonders/crystal-caverns-ambient.ogg',
      sourceId: 'soundimage-crystal-caverns',
      gain: 0.25,
      loop: { loopStart: 0, loopEnd: 39.0 },
      fadeInMs: 700,
      fadeOutMs: 550,
      mapFocusTimeoutMs: 12000,
    },
  },
  aurora_fields: {
    wonderId: 'aurora_fields',
    status: 'complete',
    soundMood: 'aurora-shimmer',
    stinger: {
      id: 'aurora-fields-stinger',
      file: 'audio/wonders/aurora-fields-stinger.ogg',
      sourceId: 'soundimage-updraft',
      gain: 0.70,
    },
    ambientLoop: {
      id: 'aurora-fields-ambient',
      file: 'audio/wonders/aurora-fields-ambient.ogg',
      sourceId: 'soundimage-strange-phenomenon',
      gain: 0.25,
      loop: { loopStart: 0, loopEnd: 77.0 },
      fadeInMs: 700,
      fadeOutMs: 550,
      mapFocusTimeoutMs: 12000,
    },
  },
```

- [ ] **Step 3: Verify sound mood strings before running tests**

Run:

```bash
rg -n "high-wind-chime|crystal-hum|aurora-shimmer" src/systems/wonder-spectacle
```

Expected: all three strings appear in `src/systems/wonder-spectacle/recipes.ts`. If any string does not exist, read the actual recipe and use that exact `soundMood`; do not invent a new sound mood.

- [ ] **Step 4: Run the catalog test and verify it now fails only for missing assets/credits**

Run:

```bash
./scripts/run-with-mise.sh yarn vitest run tests/audio/natural-wonder-audio-catalog.test.ts
```

Expected: FAIL because the six MR2 `public/audio/wonders/*.ogg` files do not exist yet and `AUDIO-CREDITS.md` does not contain the MR2 credits.

- [ ] **Step 5: Commit the catalog entries**

```bash
git add src/audio/natural-wonder-audio-catalog.ts
git commit -m "feat(audio): add stage 2h mr2 catalog entries"
```

## Task 4: Add MR2 Audio Assets

**Files:**

- Create: `public/audio/wonders/sacred-mountain-stinger.ogg`
- Create: `public/audio/wonders/sacred-mountain-ambient.ogg`
- Create: `public/audio/wonders/crystal-caverns-stinger.ogg`
- Create: `public/audio/wonders/crystal-caverns-ambient.ogg`
- Create: `public/audio/wonders/aurora-fields-stinger.ogg`
- Create: `public/audio/wonders/aurora-fields-ambient.ogg`
- Test: `tests/audio/natural-wonder-audio-catalog.test.ts`

- [ ] **Step 1: Confirm audio tooling is available**

Run:

```bash
ffmpeg -version
ffprobe -version
```

Expected: both commands print version information. If `ffprobe` is missing but `ffmpeg` exists, use `ffmpeg -i public/audio/wonders/<file>.ogg` to inspect duration from stderr.

- [ ] **Step 2: Download the exact source files**

Run:

```bash
mkdir -p /private/tmp/conquestoria-2h-mr2-audio-src public/audio/wonders
curl -L "https://soundimage.org/wp-content/uploads/2017/04/Reaching-Altitude.mp3" -o /private/tmp/conquestoria-2h-mr2-audio-src/sacred-mountain-stinger.mp3
curl -L "https://soundimage.org/wp-content/uploads/2024/01/Our-Mountain_v003.wav" -o /private/tmp/conquestoria-2h-mr2-audio-src/sacred-mountain-ambient.wav
curl -L "http://soundimage.org/wp-content/uploads/2015/03/Chamber-of-Jewels.mp3" -o /private/tmp/conquestoria-2h-mr2-audio-src/crystal-caverns-stinger.mp3
curl -L "http://soundimage.org/wp-content/uploads/2016/04/Crystal-Caverns.mp3" -o /private/tmp/conquestoria-2h-mr2-audio-src/crystal-caverns-ambient.mp3
curl -L "https://soundimage.org/wp-content/uploads/2024/01/Updraft.wav" -o /private/tmp/conquestoria-2h-mr2-audio-src/aurora-fields-stinger.wav
curl -L "https://soundimage.org/wp-content/uploads/2024/01/Strange-Phenomenon.wav" -o /private/tmp/conquestoria-2h-mr2-audio-src/aurora-fields-ambient.wav
```

Expected: six non-empty files exist under `/private/tmp/conquestoria-2h-mr2-audio-src`.

- [ ] **Step 3: Convert the source files to OGG Vorbis**

Run:

```bash
ffmpeg -y -i /private/tmp/conquestoria-2h-mr2-audio-src/sacred-mountain-stinger.mp3 -t 5 -af "afade=t=out:st=4.5:d=0.5" -ac 2 -ar 44100 -c:a libvorbis -q:a 4 public/audio/wonders/sacred-mountain-stinger.ogg
ffmpeg -y -i /private/tmp/conquestoria-2h-mr2-audio-src/sacred-mountain-ambient.wav -ac 2 -ar 44100 -c:a libvorbis -q:a 4 public/audio/wonders/sacred-mountain-ambient.ogg
ffmpeg -y -i /private/tmp/conquestoria-2h-mr2-audio-src/crystal-caverns-stinger.mp3 -t 5 -af "afade=t=out:st=4.5:d=0.5" -ac 2 -ar 44100 -c:a libvorbis -q:a 4 public/audio/wonders/crystal-caverns-stinger.ogg
ffmpeg -y -i /private/tmp/conquestoria-2h-mr2-audio-src/crystal-caverns-ambient.mp3 -ac 2 -ar 44100 -c:a libvorbis -q:a 4 public/audio/wonders/crystal-caverns-ambient.ogg
ffmpeg -y -i /private/tmp/conquestoria-2h-mr2-audio-src/aurora-fields-stinger.wav -t 5 -af "afade=t=out:st=4.5:d=0.5" -ac 2 -ar 44100 -c:a libvorbis -q:a 4 public/audio/wonders/aurora-fields-stinger.ogg
ffmpeg -y -i /private/tmp/conquestoria-2h-mr2-audio-src/aurora-fields-ambient.wav -ac 2 -ar 44100 -c:a libvorbis -q:a 4 public/audio/wonders/aurora-fields-ambient.ogg
```

Expected: six OGG files exist under `public/audio/wonders`.

- [ ] **Step 4: Verify OGG magic bytes and durations**

Run:

```bash
file public/audio/wonders/sacred-mountain-stinger.ogg public/audio/wonders/sacred-mountain-ambient.ogg public/audio/wonders/crystal-caverns-stinger.ogg public/audio/wonders/crystal-caverns-ambient.ogg public/audio/wonders/aurora-fields-stinger.ogg public/audio/wonders/aurora-fields-ambient.ogg
ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 public/audio/wonders/sacred-mountain-ambient.ogg public/audio/wonders/crystal-caverns-ambient.ogg public/audio/wonders/aurora-fields-ambient.ogg
```

Expected:

- `file` reports Ogg data for all six outputs.
- Ambient durations are close to the catalog loop ends: Sacred Mountain about `79`, Crystal Caverns about `39`, Aurora Fields about `77`.

If `ffprobe` returns a duration at least `0.2` seconds lower than the catalog `loopEnd`, update that catalog `loopEnd` to the duration rounded down to one decimal place.

- [ ] **Step 5: Perform listening review**

Listen to each generated file locally. Confirm:

- `sacred-mountain-stinger.ogg` feels like a restrained height/mountain reveal and does not start with silence.
- `sacred-mountain-ambient.ogg` is calm enough to read over and does not feel like a civilization theme replacement.
- `crystal-caverns-stinger.ogg` has a jewel/cavern reveal character and is not comic.
- `crystal-caverns-ambient.ogg` loops without an obvious click at the loop point.
- `aurora-fields-stinger.ogg` has an upward/luminous reveal character and is not harsh.
- `aurora-fields-ambient.ogg` feels like mysterious sky ambience and does not compete with music.

If one file fails this review, do not continue. Replace the source selection in this plan and redo Tasks 2-4 for that clip.

- [ ] **Step 6: Run the catalog test and verify it now fails only for missing credits**

Run:

```bash
./scripts/run-with-mise.sh yarn vitest run tests/audio/natural-wonder-audio-catalog.test.ts
```

Expected: FAIL because the MR2 source credits are not yet in `AUDIO-CREDITS.md`.

- [ ] **Step 7: Commit the audio assets**

```bash
git add public/audio/wonders/sacred-mountain-stinger.ogg public/audio/wonders/sacred-mountain-ambient.ogg public/audio/wonders/crystal-caverns-stinger.ogg public/audio/wonders/crystal-caverns-ambient.ogg public/audio/wonders/aurora-fields-stinger.ogg public/audio/wonders/aurora-fields-ambient.ogg src/audio/natural-wonder-audio-catalog.ts
git commit -m "feat(audio): add stage 2h mr2 natural wonder assets"
```

## Task 5: Add MR2 Audio Credits

**Files:**

- Modify: `AUDIO-CREDITS.md`
- Test: `tests/audio/natural-wonder-audio-catalog.test.ts`

- [ ] **Step 1: Add the MR2 credit entries after the MR1 natural-wonder credits**

In `AUDIO-CREDITS.md`, under `## Natural Wonder Audio`, change the intro line to:

```md
All Stage 2H natural wonder audio is by Eric Matyas / Soundimage.org and converted to OGG Vorbis for in-game use.
```

Then append these entries after `coral-reef-ambient.ogg`:

```md
- `audio/wonders/sacred-mountain-stinger.ogg` — "Reaching Altitude" by Eric Matyas, Soundimage.org.
  Source: https://soundimage.org/wp-content/uploads/2017/04/Reaching-Altitude.mp3
  Used as: Sacred Mountain discovery and replay stinger
  Modified: trimmed to 5 s, faded out, converted to OGG Vorbis

- `audio/wonders/sacred-mountain-ambient.ogg` — "Our Mountain_v003" by Eric Matyas, Soundimage.org.
  Source: https://soundimage.org/wp-content/uploads/2024/01/Our-Mountain_v003.wav
  Used as: Sacred Mountain Codex and map-focus ambience
  Modified: converted to OGG Vorbis

- `audio/wonders/crystal-caverns-stinger.ogg` — "Chamber of Jewels" by Eric Matyas, Soundimage.org.
  Source: http://soundimage.org/wp-content/uploads/2015/03/Chamber-of-Jewels.mp3
  Used as: Crystal Caverns discovery and replay stinger
  Modified: trimmed to 5 s, faded out, converted to OGG Vorbis

- `audio/wonders/crystal-caverns-ambient.ogg` — "Crystal Caverns" by Eric Matyas, Soundimage.org.
  Source: http://soundimage.org/wp-content/uploads/2016/04/Crystal-Caverns.mp3
  Used as: Crystal Caverns Codex and map-focus ambience
  Modified: converted to OGG Vorbis

- `audio/wonders/aurora-fields-stinger.ogg` — "Updraft" by Eric Matyas, Soundimage.org.
  Source: https://soundimage.org/wp-content/uploads/2024/01/Updraft.wav
  Used as: Aurora Fields discovery and replay stinger
  Modified: trimmed to 5 s, faded out, converted to OGG Vorbis

- `audio/wonders/aurora-fields-ambient.ogg` — "Strange Phenomenon" by Eric Matyas, Soundimage.org.
  Source: https://soundimage.org/wp-content/uploads/2024/01/Strange-Phenomenon.wav
  Used as: Aurora Fields Codex and map-focus ambience
  Modified: converted to OGG Vorbis
```

- [ ] **Step 2: Run the catalog test and verify it passes**

Run:

```bash
./scripts/run-with-mise.sh yarn vitest run tests/audio/natural-wonder-audio-catalog.test.ts
```

Expected: PASS.

- [ ] **Step 3: Commit the credits**

```bash
git add AUDIO-CREDITS.md
git commit -m "docs(audio): credit stage 2h mr2 wonder audio"
```

## Task 6: Update Director Tests For MR2 Complete And Pending Behavior

**Files:**

- Modify: `tests/audio/natural-wonder-audio-director.test.ts`
- Test: `tests/audio/natural-wonder-audio-director.test.ts`

- [ ] **Step 1: Update the pending-entry test to use a still-pending wonder**

In `tests/audio/natural-wonder-audio-director.test.ts`, replace:

```ts
    await expect(director.playDiscoveryStinger('sacred_mountain')).resolves.toBe(false);
    await expect(director.startCodexAmbient('sacred_mountain')).resolves.toBe(false);
```

with:

```ts
    await expect(director.playDiscoveryStinger('singing_sands')).resolves.toBe(false);
    await expect(director.startCodexAmbient('singing_sands')).resolves.toBe(false);
```

- [ ] **Step 2: Add an MR2 replay/ambient regression**

After the existing `replay plays a stinger and restarts ambient for complete entries` test, add:

```ts
  it('replay works for MR2 complete entries without new UI wiring', async () => {
    const director = new NaturalWonderAudioDirector(
      mixer as never,
      loader as never,
      playStingerWithDuck,
      timers,
    );

    await expect(director.playCodexReplay('aurora_fields')).resolves.toBe(true);

    expect(playStingerWithDuck).toHaveBeenCalledWith('audio/wonders/aurora-fields-stinger.ogg');
    expect(loader.get).toHaveBeenCalledWith('audio/wonders/aurora-fields-ambient.ogg');
  });
```

- [ ] **Step 3: Run the director test and verify it passes**

Run:

```bash
./scripts/run-with-mise.sh yarn vitest run tests/audio/natural-wonder-audio-director.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit the director test updates**

```bash
git add tests/audio/natural-wonder-audio-director.test.ts
git commit -m "test(audio): cover stage 2h mr2 director playback"
```

## Task 7: Run Targeted Verification And Source Rules

**Files:**

- Verify: `src/audio/natural-wonder-audio-sources.ts`
- Verify: `src/audio/natural-wonder-audio-catalog.ts`
- Verify: `tests/audio/natural-wonder-audio-catalog.test.ts`
- Verify: `tests/audio/natural-wonder-audio-director.test.ts`

- [ ] **Step 1: Run source rule checks**

Run:

```bash
scripts/check-src-rule-violations.sh src/audio/natural-wonder-audio-sources.ts src/audio/natural-wonder-audio-catalog.ts
```

Expected: exit 0 with no output.

- [ ] **Step 2: Run targeted tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/audio/natural-wonder-audio-catalog.test.ts tests/audio/natural-wonder-audio-director.test.ts
```

Expected: PASS. In this repo wrapper, this may also run the full Vitest suite and hook smoke tests; that is acceptable and stronger.

- [ ] **Step 3: Run wonder regressions**

Run:

```bash
./scripts/run-wonder-regressions.sh
```

Expected: PASS. A sandbox-only mise cache warning is acceptable only if the command exits 0.

- [ ] **Step 4: Commit any verification-only fixes**

If a verification command forced a code or test fix, commit the fix:

```bash
git add src/audio/natural-wonder-audio-sources.ts src/audio/natural-wonder-audio-catalog.ts tests/audio/natural-wonder-audio-catalog.test.ts tests/audio/natural-wonder-audio-director.test.ts
git commit -m "fix(audio): align stage 2h mr2 validation"
```

Expected: If no files changed, do not create an empty commit.

## Task 8: Final Build, Full Tests, Diff Review, And PR Notes

**Files:**

- Review: all changed files

- [ ] **Step 1: Run production build**

Run:

```bash
./scripts/run-with-mise.sh yarn build
```

Expected: exit 0. The existing Vite large-chunk warning is acceptable.

- [ ] **Step 2: Run full tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test
```

Expected: PASS.

- [ ] **Step 3: Review committed and uncommitted diffs**

Run:

```bash
git diff --stat origin/main...HEAD
git diff --stat
git diff --check origin/main...HEAD
git status -sb
```

Expected:

- committed diff includes the MR2 spec, plan, two audio source/catalog files, two audio tests, `AUDIO-CREDITS.md`, and six `public/audio/wonders/*.ogg` files
- uncommitted diff is empty
- `git diff --check` exits 0
- branch is ahead of `origin/main`

- [ ] **Step 4: Prepare PR body notes**

Use this PR note structure:

```md
## Summary

- Adds complete Stage 2H-MR2 natural-wonder audio packages for Sacred Mountain, Crystal Caverns, and Aurora Fields.
- Hardens natural-wonder source metadata with credit text and local output paths for MR1+MR2 complete entries.
- Keeps MR3-MR5 wonders explicit pending entries and leaves playback architecture/UI wiring unchanged.

## Audio Sources And Listening Notes

- Sacred Mountain stinger: "Reaching Altitude" by Eric Matyas / Soundimage.org. Trimmed to a short height-reveal accent.
- Sacred Mountain ambient: "Our Mountain_v003" by Eric Matyas / Soundimage.org. Calm mountain ambience for Codex/map focus.
- Crystal Caverns stinger: "Chamber of Jewels" by Eric Matyas / Soundimage.org. Jewel/cavern reveal accent.
- Crystal Caverns ambient: "Crystal Caverns" by Eric Matyas / Soundimage.org. Short loop-friendly crystalline ambience.
- Aurora Fields stinger: "Updraft" by Eric Matyas / Soundimage.org. Upward sky reveal accent.
- Aurora Fields ambient: "Strange Phenomenon" by Eric Matyas / Soundimage.org. Mysterious luminous-sky ambience.

## Bundle Note

- Adds six on-demand OGG files under `public/audio/wonders/`.
- Does not add the files to service-worker precache.

## Verification

- `scripts/check-src-rule-violations.sh src/audio/natural-wonder-audio-sources.ts src/audio/natural-wonder-audio-catalog.ts`
- `./scripts/run-with-mise.sh yarn test --run tests/audio/natural-wonder-audio-catalog.test.ts tests/audio/natural-wonder-audio-director.test.ts`
- `./scripts/run-wonder-regressions.sh`
- `./scripts/run-with-mise.sh yarn build`
- `./scripts/run-with-mise.sh yarn test`
- `git diff --check origin/main...HEAD`
```

- [ ] **Step 5: Commit final plan checkbox updates only if you tracked progress in the plan**

If you checked boxes in this file during execution, commit the progress state:

```bash
git add docs/superpowers/plans/2026-05-27-stage-2h-mr2-sky-stone-audio.md
git commit -m "docs: track stage 2h mr2 implementation progress"
```

Expected: Skip this commit if the plan was not modified during execution.
