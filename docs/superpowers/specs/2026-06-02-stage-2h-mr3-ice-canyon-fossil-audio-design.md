# Stage 2H-MR3 Ice, Canyon, And Fossil Natural Wonder Audio Design

**Date:** 2026-06-02
**Status:** Approved for implementation planning
**Related spec:** `docs/superpowers/specs/2026-05-27-stage-2h-natural-wonder-audio-design.md`
**Builds on:** Stage 2H MR1 natural-wonder audio architecture and Stage 2H MR2 catalog/source metadata hardening

## Purpose

Stage 2H-MR3 adds complete natural-wonder audio packages for the next three pending wonders:

- `frozen_falls`
- `grand_canyon`
- `dragon_bones`

This is a data, asset, and validation slice. It must not change natural-wonder playback architecture, UI behavior, renderer behavior, gameplay, saves, AI, service-worker precache rules, or platform-specific loading. MR1 already wired discovery, Codex replay, Codex ambience, and map-focus ambience through viewer-safe paths. MR3 only makes three more catalog entries complete so those existing paths can play their bespoke audio.

## Goals

- Add one real discovery/replay stinger and one real ambient loop for each MR3 natural wonder.
- Keep all assets sourced from Soundimage.org by Eric Matyas under the existing free-use-with-attribution policy.
- Keep `AUDIO-CREDITS.md` synchronized with typed source metadata and local file paths.
- Preserve MR1+MR2 complete entries unchanged.
- Keep MR4/MR5 wonders explicit pending entries with no fallback audio.
- Keep `FINAL_NATURAL_WONDER_AUDIO_COVERAGE = false`; strict full coverage remains MR5 work.
- Keep asset loading on demand under `public/audio/wonders/`; do not add these files to service-worker precache.

## Non-Goals

- No UI labels, controls, or copy changes.
- No new audio settings.
- No natural-wonder gameplay, reward, placement, visibility, or save changes.
- No generated audio, unclear-license audio, CC-BY-SA, or CC-BY-NC sources.
- No claim that tests prove subjective audio taste. Technical validation is required; human listening approval remains a review step.

## Source Selection

Use Soundimage-first sources to match MR1/MR2 attribution and conversion patterns.

| Wonder | Output | Source title | Source URL | Fit rationale |
|---|---|---|---|---|
| `frozen_falls` | `audio/wonders/frozen-falls-stinger.ogg` | `Arctic Sunrise` | `http://soundimage.org/wp-content/uploads/2014/02/Arctic-Sunrise.mp3` | Short polar reveal cue; the source description explicitly places the sun over ice. |
| `frozen_falls` | `audio/wonders/frozen-falls-ambient.ogg` | `Icicles_Looping` | `http://soundimage.org/wp-content/uploads/2014/02/Icicles_Looping.mp3` | Glistening ice ambience; direct match for `frozen-fall` without implying combat or storm. |
| `grand_canyon` | `audio/wonders/grand-canyon-stinger.ogg` | `Distant Mountains` | `http://soundimage.org/wp-content/uploads/2014/07/Distant-Mountains.mp3` | Broad landscape cue with explicit American Southwest fit. |
| `grand_canyon` | `audio/wonders/grand-canyon-ambient.ogg` | `River in Trouble_Looping` | `http://soundimage.org/wp-content/uploads/2014/10/River-in-Trouble_Looping.mp3` | Colorado River association gives canyon identity while staying environmental. |
| `dragon_bones` | `audio/wonders/dragon-bones-stinger.ogg` | `The Ancients` | `https://soundimage.org/wp-content/uploads/2025/05/The-Ancients.mp3` | Ancient discovery cue suitable for fossil remains. |
| `dragon_bones` | `audio/wonders/dragon-bones-ambient.ogg` | `Secret Catacombs` | `http://soundimage.org/wp-content/uploads/2015/04/Secret-Catacombs.mp3` | Subterranean ancient ambience suitable for skeletal remains; use low gain so it does not read as horror foreground music. |

If a listed loop-variant URL fails during implementation, use the non-looping source from the same Soundimage page, convert it to OGG, measure the resulting duration, and set the catalog loop end to a safe value below the decoded duration. Record the exact URL used in both source metadata and credits.

## Catalog Contract

MR3 adds:

```ts
export const MR3_NATURAL_WONDER_AUDIO_IDS = [
  'frozen_falls',
  'grand_canyon',
  'dragon_bones',
] as const;
```

`COMPLETE_NATURAL_WONDER_AUDIO_IDS` becomes MR1 + MR2 + MR3. The final coverage flag remains false:

```ts
export const FINAL_NATURAL_WONDER_AUDIO_COVERAGE = false;
```

Required sound moods must match Stage 2E spectacle recipes exactly:

- `frozen_falls`: `frozen-fall`
- `grand_canyon`: `canyon-echo`
- `dragon_bones`: `ancient-bones`

MR4 and MR5 wonders remain pending:

- `singing_sands`
- `sunken_ruins`
- `floating_islands`
- `bioluminescent_bay`
- `bottomless_lake`
- `eternal_storm`

Pending means no playable file path and no fallback playback.

## Player Experience

Once MR3 lands, the existing MR1 audio surfaces gain three more complete wonders:

- Discovery reveal for `frozen_falls`, `grand_canyon`, or `dragon_bones` plays the matching stinger through existing music ducking.
- Codex selection for a discovered MR3 wonder starts the matching low-gain ambience through the existing Codex ambience path.
- `Replay animation` for a discovered MR3 wonder plays its stinger and refreshes ambience through the existing replay path.
- Map focus or territory inspection for a currently visible discovered MR3 wonder starts the matching short-lived map-focus ambience.

No new player-facing control is introduced. MR4/MR5 pending wonders remain readable in eligible Codex contexts but play no audio.

## Privacy And Visibility

MR3 inherits MR1 privacy rules:

- Discovery audio only plays from the current human viewer's reveal ceremony.
- Codex audio only plays for discovered natural-wonder Codex pages.
- Map-focus ambience requires current live visibility plus discovered status.
- Pending entries play nothing.
- Audio must not reveal undiscovered, fog-only, last-seen-only, rival-only, AI-only, or wrong hot-seat-player knowledge.

Because MR3 does not alter the focus helper or UI wiring, existing MR1 privacy tests remain the authority. MR3 director tests should still prove a pending wonder remains a no-op after adding the new complete IDs.

## Asset And Bundle Constraints

- Store generated OGG files under `public/audio/wonders/`.
- Do not add the new files to service-worker precache.
- Use OGG Vorbis with 44.1 kHz stereo output, matching MR1/MR2.
- Trim stingers to five seconds with a short fade-out if the source is longer than a reveal accent.
- Ambient loops should stay below foreground music: use conservative per-entry gains and existing ambience fade timings.
- If an encoded file is unexpectedly large, pause for review rather than landing a disproportionate asset.

## Testing Requirements

MR3 must extend the existing audio tests:

- Catalog test expects MR1+MR2+MR3 complete IDs and MR4/MR5 pending IDs.
- Catalog test verifies every complete entry's `soundMood` matches the spectacle recipe.
- Catalog test verifies each complete source has title, creator, source URL, license, credit text, and local files.
- Catalog test verifies every complete OGG path exists and starts with `OggS`.
- Catalog test verifies `AUDIO-CREDITS.md` includes the exact credit text, source URL, and local output path.
- Director test proves one MR3 complete entry works through replay and ambience loading.
- Director test uses a still-pending MR4/MR5 wonder for no-op behavior.

## Verification

Before PR creation or merge, run:

```bash
scripts/check-src-rule-violations.sh src/audio/natural-wonder-audio-sources.ts src/audio/natural-wonder-audio-catalog.ts
./scripts/run-with-mise.sh yarn test --run tests/audio/natural-wonder-audio-catalog.test.ts tests/audio/natural-wonder-audio-director.test.ts
./scripts/run-wonder-regressions.sh
./scripts/run-with-mise.sh yarn build
./scripts/run-with-mise.sh yarn test
git diff --check origin/main...HEAD
```

Technical audio validation must include:

```bash
file public/audio/wonders/frozen-falls-stinger.ogg public/audio/wonders/frozen-falls-ambient.ogg public/audio/wonders/grand-canyon-stinger.ogg public/audio/wonders/grand-canyon-ambient.ogg public/audio/wonders/dragon-bones-stinger.ogg public/audio/wonders/dragon-bones-ambient.ogg
ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 <ambient files>
ffmpeg -v error -i <each generated ogg> -f null -
```

The PR body must call out that technical validation passed and that subjective listening review still needs human approval unless the user has explicitly listened to the files.

## Acceptance Criteria

MR3 is complete when:

- `frozen_falls`, `grand_canyon`, and `dragon_bones` have complete catalog entries.
- The six MR3 local OGG files exist under `public/audio/wonders/`.
- All six MR3 source records resolve and include exact credit text plus local file paths.
- `AUDIO-CREDITS.md` includes all six MR3 entries.
- MR1 and MR2 complete entries remain unchanged.
- MR4/MR5 entries remain explicit pending no-ops.
- `FINAL_NATURAL_WONDER_AUDIO_COVERAGE` remains false.
- Targeted tests, wonder regressions, build, and full tests pass.
