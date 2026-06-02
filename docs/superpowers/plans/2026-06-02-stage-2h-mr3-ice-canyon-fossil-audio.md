# Stage 2H-MR3 Ice, Canyon, And Fossil Natural Wonder Audio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Do not use subagents unless the user explicitly authorizes them.

**Goal:** Add complete, credited natural-wonder audio packages for Frozen Falls, Grand Canyon, and Dragon Bones while preserving the existing Stage 2H playback architecture.

**Architecture:** This is a data, asset, and validation slice. The existing `NaturalWonderAudioDirector`, `AudioMixer`, `AudioSystem`, UI callbacks, and viewer-safe map-focus helper stay unchanged. MR3 extends typed source metadata, complete-coverage constants, catalog entries, local OGG assets, credits, and focused tests.

**Tech Stack:** TypeScript, Vitest, Soundimage.org source audio, OGG Vorbis assets under `public/audio/wonders/`, `ffmpeg`/`ffprobe` for conversion and duration checks.

---

## Scope Check

This plan implements only Stage 2H MR3:

- Complete:
  - `frozen_falls`
  - `grand_canyon`
  - `dragon_bones`
- Preserve MR1 and MR2 complete entries.
- Keep MR4 and MR5 wonders explicit pending entries.
- Keep `FINAL_NATURAL_WONDER_AUDIO_COVERAGE = false`.
- Do not change service worker, platform code, UI, renderer, gameplay, saves, AI, or visibility logic.

## Source Selection

Use these exact Soundimage sources first:

| Wonder | Output | Source title | Source URL |
|---|---|---|---|
| `frozen_falls` | `frozen-falls-stinger.ogg` | `Arctic Sunrise` | `http://soundimage.org/wp-content/uploads/2014/02/Arctic-Sunrise.mp3` |
| `frozen_falls` | `frozen-falls-ambient.ogg` | `Icicles_Looping` | `http://soundimage.org/wp-content/uploads/2014/02/Icicles_Looping.mp3` |
| `grand_canyon` | `grand-canyon-stinger.ogg` | `Distant Mountains` | `http://soundimage.org/wp-content/uploads/2014/07/Distant-Mountains.mp3` |
| `grand_canyon` | `grand-canyon-ambient.ogg` | `River in Trouble_Looping` | `http://soundimage.org/wp-content/uploads/2014/10/River-in-Trouble_Looping.mp3` |
| `dragon_bones` | `dragon-bones-stinger.ogg` | `The Ancients` | `https://soundimage.org/wp-content/uploads/2025/05/The-Ancients.mp3` |
| `dragon_bones` | `dragon-bones-ambient.ogg` | `Secret Catacombs` | `http://soundimage.org/wp-content/uploads/2015/04/Secret-Catacombs.mp3` |

If `Icicles_Looping.mp3` or `River-in-Trouble_Looping.mp3` returns a non-2xx response during download, replace only that source with the non-looping URL from the same Soundimage page:

- `http://soundimage.org/wp-content/uploads/2014/02/Icicles.mp3`
- `http://soundimage.org/wp-content/uploads/2014/10/River-in-Trouble.mp3`

When a fallback URL is used, update the source title in code and credits by removing `_Looping`.

## File Structure

Modify:

- `tests/audio/natural-wonder-audio-catalog.test.ts`
  - Require MR1+MR2+MR3 complete coverage and MR4/MR5 explicit pending coverage.
- `tests/audio/natural-wonder-audio-director.test.ts`
  - Add one MR3 replay regression while keeping pending no-op coverage.
- `src/audio/natural-wonder-audio-sources.ts`
  - Add six MR3 source records with exact credit text and local output paths.
- `src/audio/natural-wonder-audio-catalog.ts`
  - Add `MR3_NATURAL_WONDER_AUDIO_IDS`, extend `COMPLETE_NATURAL_WONDER_AUDIO_IDS`, and add three complete entries.
- `AUDIO-CREDITS.md`
  - Add six MR3 credit entries.

Create:

- `public/audio/wonders/frozen-falls-stinger.ogg`
- `public/audio/wonders/frozen-falls-ambient.ogg`
- `public/audio/wonders/grand-canyon-stinger.ogg`
- `public/audio/wonders/grand-canyon-ambient.ogg`
- `public/audio/wonders/dragon-bones-stinger.ogg`
- `public/audio/wonders/dragon-bones-ambient.ogg`

Temporary source downloads:

- `/private/tmp/conquestoria-2h-mr3-audio-src/`

## Player Truth Table

| Before | Action | Immediate visible/audio result | Must remain reachable |
|---|---|---|---|
| Current human player's discovery reveal starts for `frozen_falls` | Reveal queue starts ceremony | Frozen Falls stinger plays once through existing ducking; reveal visuals continue | Open Atlas and map highlight behavior |
| Codex reader opens discovered `grand_canyon` | Player selects Grand Canyon | Grand Canyon ambient starts through existing Codex ambience path | Full Codex catalog |
| Codex reader shows `dragon_bones` | Player clicks `Replay animation` | Existing replay animation runs; Dragon Bones stinger plays; Dragon Bones ambient starts or refreshes | Reduced-motion disabled behavior |
| Map has a currently visible discovered MR3 wonder tile | Player taps/focuses/inspects tile | Existing map-focus ambience path starts matching loop and times out | Tap SFX and territory inspection close |
| Codex reader opens a pending MR4/MR5 natural wonder | Existing discovery/Codex rules allow page | No stinger, no ambient loop, no fallback audio | Static Codex content |

## Misleading UI Risks

- Do not add labels or UI hints implying all natural wonders have audio before MR5.
- Do not give pending entries generic fallback audio.
- Do not touch map-focus privacy; MR3 must inherit current live-visibility and discovered-status gates from MR1.

## Interaction Replay Checklist

MR3 should not touch UI. Existing MR1 tests cover replay click, Codex selection, discovery queue, map-focus lifecycle, and no-stacking behavior. If implementation unexpectedly touches UI, add matching UI tests before changing UI code.

## Task 1: Make Catalog And Director Tests Demand MR3 Coverage

**Files:**

- Modify: `tests/audio/natural-wonder-audio-catalog.test.ts`
- Modify: `tests/audio/natural-wonder-audio-director.test.ts`
- Test: `tests/audio/natural-wonder-audio-catalog.test.ts`
- Test: `tests/audio/natural-wonder-audio-director.test.ts`

- [ ] **Step 1: Update the catalog test imports**

In `tests/audio/natural-wonder-audio-catalog.test.ts`, replace the import from `../../src/audio/natural-wonder-audio-catalog` with:

```ts
import {
  COMPLETE_NATURAL_WONDER_AUDIO_IDS,
  FINAL_NATURAL_WONDER_AUDIO_COVERAGE,
  getCompleteNaturalWonderAudioEntry,
  getNaturalWonderAudioCatalog,
  MR3_NATURAL_WONDER_AUDIO_IDS,
} from '../../src/audio/natural-wonder-audio-catalog';
```

- [ ] **Step 2: Replace the complete/pending test body**

Replace the test named `keeps MR1 and MR2 wonders complete and all remaining wonders explicit pending entries` with:

```ts
  it('keeps MR1, MR2, and MR3 wonders complete and all remaining wonders explicit pending entries', () => {
    const catalog = getNaturalWonderAudioCatalog();
    const completeIds = new Set<string>(COMPLETE_NATURAL_WONDER_AUDIO_IDS);

    expect(MR3_NATURAL_WONDER_AUDIO_IDS).toEqual([
      'frozen_falls',
      'grand_canyon',
      'dragon_bones',
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
```

- [ ] **Step 3: Add the MR3 director replay regression**

In `tests/audio/natural-wonder-audio-director.test.ts`, after the MR2 replay test, add:

```ts
  it('replay works for MR3 complete entries without new UI wiring', async () => {
    const director = new NaturalWonderAudioDirector(
      mixer as never,
      loader as never,
      playStingerWithDuck,
      timers,
    );

    await expect(director.playCodexReplay('dragon_bones')).resolves.toBe(true);

    expect(playStingerWithDuck).toHaveBeenCalledWith('audio/wonders/dragon-bones-stinger.ogg');
    expect(loader.get).toHaveBeenCalledWith('audio/wonders/dragon-bones-ambient.ogg');
  });
```

- [ ] **Step 4: Run tests and verify expected failures**

Run:

```bash
./scripts/run-with-mise.sh yarn vitest run tests/audio/natural-wonder-audio-catalog.test.ts tests/audio/natural-wonder-audio-director.test.ts
```

Expected: FAIL during import/behavior because `MR3_NATURAL_WONDER_AUDIO_IDS` and the `dragon_bones` complete catalog entry do not exist.

- [ ] **Step 5: Commit failing tests**

Run:

```bash
git add tests/audio/natural-wonder-audio-catalog.test.ts tests/audio/natural-wonder-audio-director.test.ts
git commit -m "test(audio): require stage 2h mr3 audio coverage"
```

## Task 2: Add MR3 Source Metadata

**Files:**

- Modify: `src/audio/natural-wonder-audio-sources.ts`
- Test: `tests/audio/natural-wonder-audio-catalog.test.ts`

- [ ] **Step 1: Add source records before the closing array**

Append these entries before `] as const;` in `src/audio/natural-wonder-audio-sources.ts`:

```ts
  {
    id: 'soundimage-arctic-sunrise',
    title: 'Arctic Sunrise',
    creator: 'Eric Matyas',
    site: 'Soundimage.org',
    sourceUrl: 'http://soundimage.org/wp-content/uploads/2014/02/Arctic-Sunrise.mp3',
    license: 'Soundimage.org free use with attribution',
    creditText: '"Arctic Sunrise" by Eric Matyas, Soundimage.org.',
    localFiles: ['audio/wonders/frozen-falls-stinger.ogg'],
  },
  {
    id: 'soundimage-icicles-looping',
    title: 'Icicles_Looping',
    creator: 'Eric Matyas',
    site: 'Soundimage.org',
    sourceUrl: 'http://soundimage.org/wp-content/uploads/2014/02/Icicles_Looping.mp3',
    license: 'Soundimage.org free use with attribution',
    creditText: '"Icicles_Looping" by Eric Matyas, Soundimage.org.',
    localFiles: ['audio/wonders/frozen-falls-ambient.ogg'],
  },
  {
    id: 'soundimage-distant-mountains',
    title: 'Distant Mountains',
    creator: 'Eric Matyas',
    site: 'Soundimage.org',
    sourceUrl: 'http://soundimage.org/wp-content/uploads/2014/07/Distant-Mountains.mp3',
    license: 'Soundimage.org free use with attribution',
    creditText: '"Distant Mountains" by Eric Matyas, Soundimage.org.',
    localFiles: ['audio/wonders/grand-canyon-stinger.ogg'],
  },
  {
    id: 'soundimage-river-in-trouble-looping',
    title: 'River in Trouble_Looping',
    creator: 'Eric Matyas',
    site: 'Soundimage.org',
    sourceUrl: 'http://soundimage.org/wp-content/uploads/2014/10/River-in-Trouble_Looping.mp3',
    license: 'Soundimage.org free use with attribution',
    creditText: '"River in Trouble_Looping" by Eric Matyas, Soundimage.org.',
    localFiles: ['audio/wonders/grand-canyon-ambient.ogg'],
  },
  {
    id: 'soundimage-the-ancients',
    title: 'The Ancients',
    creator: 'Eric Matyas',
    site: 'Soundimage.org',
    sourceUrl: 'https://soundimage.org/wp-content/uploads/2025/05/The-Ancients.mp3',
    license: 'Soundimage.org free use with attribution',
    creditText: '"The Ancients" by Eric Matyas, Soundimage.org.',
    localFiles: ['audio/wonders/dragon-bones-stinger.ogg'],
  },
  {
    id: 'soundimage-secret-catacombs',
    title: 'Secret Catacombs',
    creator: 'Eric Matyas',
    site: 'Soundimage.org',
    sourceUrl: 'http://soundimage.org/wp-content/uploads/2015/04/Secret-Catacombs.mp3',
    license: 'Soundimage.org free use with attribution',
    creditText: '"Secret Catacombs" by Eric Matyas, Soundimage.org.',
    localFiles: ['audio/wonders/dragon-bones-ambient.ogg'],
  },
```

- [ ] **Step 2: Run catalog test and verify it still fails for catalog constants**

Run:

```bash
./scripts/run-with-mise.sh yarn vitest run tests/audio/natural-wonder-audio-catalog.test.ts
```

Expected: FAIL because `MR3_NATURAL_WONDER_AUDIO_IDS` is still missing from the catalog.

- [ ] **Step 3: Commit source metadata**

Run:

```bash
git add src/audio/natural-wonder-audio-sources.ts
git commit -m "feat(audio): add stage 2h mr3 source metadata"
```

## Task 3: Add MR3 Catalog Entries

**Files:**

- Modify: `src/audio/natural-wonder-audio-catalog.ts`
- Test: `tests/audio/natural-wonder-audio-catalog.test.ts`
- Test: `tests/audio/natural-wonder-audio-director.test.ts`

- [ ] **Step 1: Add MR3 complete constants**

In `src/audio/natural-wonder-audio-catalog.ts`, replace:

```ts
export const COMPLETE_NATURAL_WONDER_AUDIO_IDS = [
  ...MR1_NATURAL_WONDER_AUDIO_IDS,
  ...MR2_NATURAL_WONDER_AUDIO_IDS,
] as const;
```

with:

```ts
export const MR3_NATURAL_WONDER_AUDIO_IDS = [
  'frozen_falls',
  'grand_canyon',
  'dragon_bones',
] as const;
export const COMPLETE_NATURAL_WONDER_AUDIO_IDS = [
  ...MR1_NATURAL_WONDER_AUDIO_IDS,
  ...MR2_NATURAL_WONDER_AUDIO_IDS,
  ...MR3_NATURAL_WONDER_AUDIO_IDS,
] as const;
```

- [ ] **Step 2: Add MR3 complete entries**

Add these entries inside `COMPLETE_ENTRIES` after the `aurora_fields` entry:

```ts
  frozen_falls: {
    wonderId: 'frozen_falls',
    status: 'complete',
    soundMood: 'frozen-fall',
    stinger: {
      id: 'frozen-falls-stinger',
      file: 'audio/wonders/frozen-falls-stinger.ogg',
      sourceId: 'soundimage-arctic-sunrise',
      gain: 0.70,
    },
    ambientLoop: {
      id: 'frozen-falls-ambient',
      file: 'audio/wonders/frozen-falls-ambient.ogg',
      sourceId: 'soundimage-icicles-looping',
      gain: 0.24,
      loop: { loopStart: 0, loopEnd: 69.8 },
      fadeInMs: 700,
      fadeOutMs: 550,
      mapFocusTimeoutMs: 12000,
    },
  },
  grand_canyon: {
    wonderId: 'grand_canyon',
    status: 'complete',
    soundMood: 'canyon-echo',
    stinger: {
      id: 'grand-canyon-stinger',
      file: 'audio/wonders/grand-canyon-stinger.ogg',
      sourceId: 'soundimage-distant-mountains',
      gain: 0.68,
    },
    ambientLoop: {
      id: 'grand-canyon-ambient',
      file: 'audio/wonders/grand-canyon-ambient.ogg',
      sourceId: 'soundimage-river-in-trouble-looping',
      gain: 0.24,
      loop: { loopStart: 0, loopEnd: 85.8 },
      fadeInMs: 700,
      fadeOutMs: 550,
      mapFocusTimeoutMs: 12000,
    },
  },
  dragon_bones: {
    wonderId: 'dragon_bones',
    status: 'complete',
    soundMood: 'ancient-bones',
    stinger: {
      id: 'dragon-bones-stinger',
      file: 'audio/wonders/dragon-bones-stinger.ogg',
      sourceId: 'soundimage-the-ancients',
      gain: 0.70,
    },
    ambientLoop: {
      id: 'dragon-bones-ambient',
      file: 'audio/wonders/dragon-bones-ambient.ogg',
      sourceId: 'soundimage-secret-catacombs',
      gain: 0.22,
      loop: { loopStart: 0, loopEnd: 106.8 },
      fadeInMs: 700,
      fadeOutMs: 550,
      mapFocusTimeoutMs: 12000,
    },
  },
```

- [ ] **Step 3: Verify sound mood strings exist**

Run:

```bash
rg -n "frozen-fall|canyon-echo|ancient-bones" src/systems/wonder-spectacle
```

Expected: all three strings appear in `src/systems/wonder-spectacle/recipes.ts`. If any string differs, use the exact recipe value and rerun the test.

- [ ] **Step 4: Run tests and verify missing asset/credit failures**

Run:

```bash
./scripts/run-with-mise.sh yarn vitest run tests/audio/natural-wonder-audio-catalog.test.ts tests/audio/natural-wonder-audio-director.test.ts
```

Expected: director test passes for MR3 metadata, but catalog test fails because the six MR3 OGG files and credits are not present yet.

- [ ] **Step 5: Commit catalog entries**

Run:

```bash
git add src/audio/natural-wonder-audio-catalog.ts
git commit -m "feat(audio): add stage 2h mr3 catalog entries"
```

## Task 4: Add MR3 Audio Assets

**Files:**

- Create: `public/audio/wonders/frozen-falls-stinger.ogg`
- Create: `public/audio/wonders/frozen-falls-ambient.ogg`
- Create: `public/audio/wonders/grand-canyon-stinger.ogg`
- Create: `public/audio/wonders/grand-canyon-ambient.ogg`
- Create: `public/audio/wonders/dragon-bones-stinger.ogg`
- Create: `public/audio/wonders/dragon-bones-ambient.ogg`
- Modify if measured durations require it: `src/audio/natural-wonder-audio-catalog.ts`
- Modify if loop fallback URLs are required: `src/audio/natural-wonder-audio-sources.ts`

- [ ] **Step 1: Confirm audio tooling**

Run:

```bash
ffmpeg -version
ffprobe -version
```

Expected: both commands print version information.

- [ ] **Step 2: Download source files**

Run:

```bash
mkdir -p /private/tmp/conquestoria-2h-mr3-audio-src public/audio/wonders
curl -L "http://soundimage.org/wp-content/uploads/2014/02/Arctic-Sunrise.mp3" -o /private/tmp/conquestoria-2h-mr3-audio-src/frozen-falls-stinger.mp3
curl -L "http://soundimage.org/wp-content/uploads/2014/02/Icicles_Looping.mp3" -o /private/tmp/conquestoria-2h-mr3-audio-src/frozen-falls-ambient.mp3
curl -L "http://soundimage.org/wp-content/uploads/2014/07/Distant-Mountains.mp3" -o /private/tmp/conquestoria-2h-mr3-audio-src/grand-canyon-stinger.mp3
curl -L "http://soundimage.org/wp-content/uploads/2014/10/River-in-Trouble_Looping.mp3" -o /private/tmp/conquestoria-2h-mr3-audio-src/grand-canyon-ambient.mp3
curl -L "https://soundimage.org/wp-content/uploads/2025/05/The-Ancients.mp3" -o /private/tmp/conquestoria-2h-mr3-audio-src/dragon-bones-stinger.mp3
curl -L "http://soundimage.org/wp-content/uploads/2015/04/Secret-Catacombs.mp3" -o /private/tmp/conquestoria-2h-mr3-audio-src/dragon-bones-ambient.mp3
```

Expected: all six files are non-empty and `file /private/tmp/conquestoria-2h-mr3-audio-src/*` reports audio data, not HTML.

- [ ] **Step 3: If loop downloads failed, apply exact fallback edits**

If `frozen-falls-ambient.mp3` is HTML or empty, rerun:

```bash
curl -L "http://soundimage.org/wp-content/uploads/2014/02/Icicles.mp3" -o /private/tmp/conquestoria-2h-mr3-audio-src/frozen-falls-ambient.mp3
```

Then update source metadata:

```ts
    id: 'soundimage-icicles-looping',
    title: 'Icicles',
    creator: 'Eric Matyas',
    site: 'Soundimage.org',
    sourceUrl: 'http://soundimage.org/wp-content/uploads/2014/02/Icicles.mp3',
    license: 'Soundimage.org free use with attribution',
    creditText: '"Icicles" by Eric Matyas, Soundimage.org.',
    localFiles: ['audio/wonders/frozen-falls-ambient.ogg'],
```

If `grand-canyon-ambient.mp3` is HTML or empty, rerun:

```bash
curl -L "http://soundimage.org/wp-content/uploads/2014/10/River-in-Trouble.mp3" -o /private/tmp/conquestoria-2h-mr3-audio-src/grand-canyon-ambient.mp3
```

Then update source metadata:

```ts
    id: 'soundimage-river-in-trouble-looping',
    title: 'River in Trouble',
    creator: 'Eric Matyas',
    site: 'Soundimage.org',
    sourceUrl: 'http://soundimage.org/wp-content/uploads/2014/10/River-in-Trouble.mp3',
    license: 'Soundimage.org free use with attribution',
    creditText: '"River in Trouble" by Eric Matyas, Soundimage.org.',
    localFiles: ['audio/wonders/grand-canyon-ambient.ogg'],
```

- [ ] **Step 4: Convert to OGG Vorbis**

Run:

```bash
ffmpeg -y -i /private/tmp/conquestoria-2h-mr3-audio-src/frozen-falls-stinger.mp3 -t 5 -af "afade=t=out:st=4.5:d=0.5" -ac 2 -ar 44100 -c:a libvorbis -q:a 4 public/audio/wonders/frozen-falls-stinger.ogg
ffmpeg -y -i /private/tmp/conquestoria-2h-mr3-audio-src/frozen-falls-ambient.mp3 -ac 2 -ar 44100 -c:a libvorbis -q:a 4 public/audio/wonders/frozen-falls-ambient.ogg
ffmpeg -y -i /private/tmp/conquestoria-2h-mr3-audio-src/grand-canyon-stinger.mp3 -t 5 -af "afade=t=out:st=4.5:d=0.5" -ac 2 -ar 44100 -c:a libvorbis -q:a 4 public/audio/wonders/grand-canyon-stinger.ogg
ffmpeg -y -i /private/tmp/conquestoria-2h-mr3-audio-src/grand-canyon-ambient.mp3 -ac 2 -ar 44100 -c:a libvorbis -q:a 4 public/audio/wonders/grand-canyon-ambient.ogg
ffmpeg -y -i /private/tmp/conquestoria-2h-mr3-audio-src/dragon-bones-stinger.mp3 -t 5 -af "afade=t=out:st=4.5:d=0.5" -ac 2 -ar 44100 -c:a libvorbis -q:a 4 public/audio/wonders/dragon-bones-stinger.ogg
ffmpeg -y -i /private/tmp/conquestoria-2h-mr3-audio-src/dragon-bones-ambient.mp3 -ac 2 -ar 44100 -c:a libvorbis -q:a 4 public/audio/wonders/dragon-bones-ambient.ogg
```

Expected: all six OGG files are created.

- [ ] **Step 5: Validate formats and durations**

Run:

```bash
file public/audio/wonders/frozen-falls-stinger.ogg public/audio/wonders/frozen-falls-ambient.ogg public/audio/wonders/grand-canyon-stinger.ogg public/audio/wonders/grand-canyon-ambient.ogg public/audio/wonders/dragon-bones-stinger.ogg public/audio/wonders/dragon-bones-ambient.ogg
ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 public/audio/wonders/frozen-falls-ambient.ogg
ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 public/audio/wonders/grand-canyon-ambient.ogg
ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 public/audio/wonders/dragon-bones-ambient.ogg
```

Expected: `file` reports Ogg Vorbis for all six. If an ambient duration is lower than the catalog `loopEnd`, patch that entry's `loopEnd` to the measured duration rounded down to one decimal place minus `0.1`.

- [ ] **Step 6: Decode-check generated OGG files**

Run one command per file:

```bash
ffmpeg -v error -i public/audio/wonders/frozen-falls-stinger.ogg -f null -
ffmpeg -v error -i public/audio/wonders/frozen-falls-ambient.ogg -f null -
ffmpeg -v error -i public/audio/wonders/grand-canyon-stinger.ogg -f null -
ffmpeg -v error -i public/audio/wonders/grand-canyon-ambient.ogg -f null -
ffmpeg -v error -i public/audio/wonders/dragon-bones-stinger.ogg -f null -
ffmpeg -v error -i public/audio/wonders/dragon-bones-ambient.ogg -f null -
```

Expected: each command exits 0 with no output.

- [ ] **Step 7: Run catalog test and verify missing credits failure**

Run:

```bash
./scripts/run-with-mise.sh yarn vitest run tests/audio/natural-wonder-audio-catalog.test.ts
```

Expected: FAIL only because MR3 credits are not in `AUDIO-CREDITS.md`.

- [ ] **Step 8: Commit assets**

Run:

```bash
git add public/audio/wonders/frozen-falls-stinger.ogg public/audio/wonders/frozen-falls-ambient.ogg public/audio/wonders/grand-canyon-stinger.ogg public/audio/wonders/grand-canyon-ambient.ogg public/audio/wonders/dragon-bones-stinger.ogg public/audio/wonders/dragon-bones-ambient.ogg src/audio/natural-wonder-audio-catalog.ts src/audio/natural-wonder-audio-sources.ts
git commit -m "feat(audio): add stage 2h mr3 natural wonder assets"
```

## Task 5: Add MR3 Audio Credits

**Files:**

- Modify: `AUDIO-CREDITS.md`
- Test: `tests/audio/natural-wonder-audio-catalog.test.ts`

- [ ] **Step 1: Add credit entries after Aurora Fields**

Append under `## Natural Wonder Audio`, after `aurora-fields-ambient.ogg`:

```md
- `audio/wonders/frozen-falls-stinger.ogg` — "Arctic Sunrise" by Eric Matyas, Soundimage.org.
  Source: http://soundimage.org/wp-content/uploads/2014/02/Arctic-Sunrise.mp3
  Used as: Frozen Falls discovery and replay stinger
  Modified: trimmed to 5 s, converted to OGG Vorbis

- `audio/wonders/frozen-falls-ambient.ogg` — "Icicles_Looping" by Eric Matyas, Soundimage.org.
  Source: http://soundimage.org/wp-content/uploads/2014/02/Icicles_Looping.mp3
  Used as: Frozen Falls Codex and map-focus ambience
  Modified: converted to OGG Vorbis

- `audio/wonders/grand-canyon-stinger.ogg` — "Distant Mountains" by Eric Matyas, Soundimage.org.
  Source: http://soundimage.org/wp-content/uploads/2014/07/Distant-Mountains.mp3
  Used as: Grand Canyon discovery and replay stinger
  Modified: trimmed to 5 s, converted to OGG Vorbis

- `audio/wonders/grand-canyon-ambient.ogg` — "River in Trouble_Looping" by Eric Matyas, Soundimage.org.
  Source: http://soundimage.org/wp-content/uploads/2014/10/River-in-Trouble_Looping.mp3
  Used as: Grand Canyon Codex and map-focus ambience
  Modified: converted to OGG Vorbis

- `audio/wonders/dragon-bones-stinger.ogg` — "The Ancients" by Eric Matyas, Soundimage.org.
  Source: https://soundimage.org/wp-content/uploads/2025/05/The-Ancients.mp3
  Used as: Dragon Bones discovery and replay stinger
  Modified: trimmed to 5 s, converted to OGG Vorbis

- `audio/wonders/dragon-bones-ambient.ogg` — "Secret Catacombs" by Eric Matyas, Soundimage.org.
  Source: http://soundimage.org/wp-content/uploads/2015/04/Secret-Catacombs.mp3
  Used as: Dragon Bones Codex and map-focus ambience
  Modified: converted to OGG Vorbis
```

If Task 4 used fallback non-looping URLs, make the same title/source substitutions in the matching credit entry.

- [ ] **Step 2: Run catalog test and verify pass**

Run:

```bash
./scripts/run-with-mise.sh yarn vitest run tests/audio/natural-wonder-audio-catalog.test.ts
```

Expected: PASS.

- [ ] **Step 3: Commit credits**

Run:

```bash
git add AUDIO-CREDITS.md
git commit -m "docs(audio): credit stage 2h mr3 wonder audio"
```

## Task 6: Targeted Verification

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

Expected: exits 0.

- [ ] **Step 2: Run targeted audio tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/audio/natural-wonder-audio-catalog.test.ts tests/audio/natural-wonder-audio-director.test.ts
```

Expected: PASS. If this repo wrapper runs the full suite and hook smokes, that is acceptable.

- [ ] **Step 3: Run wonder regressions**

Run:

```bash
./scripts/run-wonder-regressions.sh
```

Expected: PASS. A sandbox-only mise cache warning is acceptable only if the command exits 0.

- [ ] **Step 4: Commit verification fixes if needed**

If any verification command required a code/test/docs fix, run:

```bash
git add src/audio/natural-wonder-audio-sources.ts src/audio/natural-wonder-audio-catalog.ts tests/audio/natural-wonder-audio-catalog.test.ts tests/audio/natural-wonder-audio-director.test.ts AUDIO-CREDITS.md
git commit -m "fix(audio): align stage 2h mr3 validation"
```

Expected: skip this commit if there are no changes.

## Task 7: Final Verification, Diff Review, Push, And PR

**Files:**

- Review: all changed files

- [ ] **Step 1: Run build**

Run:

```bash
./scripts/run-with-mise.sh yarn build
```

Expected: exits 0. Existing Vite large-chunk warning is acceptable.

- [ ] **Step 2: Run full tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test
```

Expected: PASS.

- [ ] **Step 3: Review diffs**

Run:

```bash
git diff --stat origin/main...HEAD
git diff --stat
git diff --check origin/main...HEAD
git status -sb
```

Expected:

- committed diff includes MR3 spec, MR3 plan, source/catalog changes, two audio tests, `AUDIO-CREDITS.md`, and six OGG files
- uncommitted diff is empty
- `git diff --check` exits 0

- [ ] **Step 4: Rebase onto latest main and verify fast-forward eligibility**

Run:

```bash
git fetch origin main
git rebase origin/main
git merge-base --is-ancestor origin/main HEAD
```

Expected: rebase succeeds, and merge-base command exits 0.

- [ ] **Step 5: Push branch**

Run:

```bash
git push -u origin codex/stage-2h-mr3-ice-canyon-fossil-audio
```

Expected: branch pushes successfully.

- [ ] **Step 6: Create PR**

Run:

```bash
gh pr create --draft --base main --head codex/stage-2h-mr3-ice-canyon-fossil-audio --title "Stage 2H MR3 ice canyon fossil audio" --body-file /private/tmp/conquestoria-stage-2h-mr3-pr-body.md
```

Use this body:

```md
## Summary

- Adds complete Stage 2H-MR3 natural-wonder audio packages for Frozen Falls, Grand Canyon, and Dragon Bones.
- Extends complete natural-wonder audio coverage constants from MR1+MR2 to MR1+MR2+MR3.
- Adds Soundimage source metadata, credits, six on-demand OGG files, and catalog/director tests.

## Out of Scope

- MR4 natural wonders remain pending: Singing Sands, Sunken Ruins, Floating Islands.
- MR5 natural wonders remain pending: Bioluminescent Bay, Bottomless Lake, Eternal Storm.
- Final strict full-coverage mode remains MR5 work.

## Why This Is Safe To Merge Partial

MR3 introduces no new player-facing controls or UI paths. Existing discovery, Codex replay, Codex ambience, and map-focus paths pick up only entries that are marked complete. Pending MR4/MR5 entries still fail closed with no fallback audio, so there is no dead-end or misleading audio UX.

## Audio Sources And Validation

- Frozen Falls: "Arctic Sunrise" and "Icicles_Looping" by Eric Matyas / Soundimage.org.
- Grand Canyon: "Distant Mountains" and "River in Trouble_Looping" by Eric Matyas / Soundimage.org.
- Dragon Bones: "The Ancients" and "Secret Catacombs" by Eric Matyas / Soundimage.org.
- OGG files were format-checked, duration-checked, and decode-checked locally.
- Subjective listening approval remains a human review step unless explicitly performed outside Codex.

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
- `git merge-base --is-ancestor origin/main HEAD`
```

- [ ] **Step 7: Check PR status**

Run:

```bash
gh pr checks <PR number>
```

Expected: checks are passing or pending. If checks fail, inspect logs before making fixes.

## Plan Self-Review

- Spec coverage: Tasks cover MR3 source selection, source metadata, catalog complete IDs, local assets, credits, tests, technical audio validation, and final verification. MR4/MR5 pending behavior and MR5 final coverage deferral are explicit.
- Placeholder scan: No task says TBD, TODO, "similar to", or "write appropriate tests"; concrete code and commands are provided.
- Type consistency: `MR3_NATURAL_WONDER_AUDIO_IDS`, `COMPLETE_NATURAL_WONDER_AUDIO_IDS`, source IDs, local paths, and credit text are consistently named across test, catalog, source metadata, credits, and PR body.
- Architecture review: No existing playback, UI, renderer, service-worker, platform, gameplay, save, or visibility code is changed.
