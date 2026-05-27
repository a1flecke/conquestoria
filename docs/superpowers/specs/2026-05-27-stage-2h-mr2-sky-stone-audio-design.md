# Stage 2H-MR2: Sky And Stone Natural Wonder Audio Design

**Date:** 2026-05-27
**Status:** Reviewed design for implementation planning
**Related roadmap:** `docs/superpowers/specs/2026-05-27-stage-2h-natural-wonder-audio-design.md`
**Builds on:** `docs/superpowers/plans/2026-05-27-stage-2h-natural-wonder-audio-mr1.md`

## Purpose

Stage 2H-MR2 continues the natural-wonder bespoke audio rollout after MR1 established the catalog, source manifest, playback director, mixer ambience path, viewer-safe focus helper, and UI hooks. MR2 is an asset/data completion slice for the sky-and-stone set:

- `sacred_mountain`
- `crystal_caverns`
- `aurora_fields`

The goal is for each of those three natural wonders to behave like MR1's complete wonders: discovery and Codex replay stingers play through the existing ducked stinger path, Codex/map focus ambience uses the dedicated SFX-controlled ambience loop path, source and credit metadata resolve through tests, and all remaining natural wonders stay explicit pending entries that play nothing.

## Scope

MR2 includes:

- one real discovery/replay stinger for each MR2 wonder
- one real ambient loop for each MR2 wonder
- local OGG files under `public/audio/wonders/`
- `src/audio/natural-wonder-audio-sources.ts` entries for every new source
- source-manifest hardening so every complete source records reusable credit text and local output paths
- `src/audio/natural-wonder-audio-catalog.ts` complete entries for the three MR2 wonders
- `AUDIO-CREDITS.md` attribution for every new source
- catalog/source/credit/asset tests updated from MR1-only coverage to MR1+MR2 coverage
- listening and bundle-size notes in the implementation PR

MR2 does not include:

- architecture changes to the director, mixer, Codex, map focus helper, discovery queue, service worker, or platform layer unless implementation uncovers a blocking MR1 defect
- natural-wonder gameplay, yields, placement, saves, AI, or visibility changes
- audio for MR3, MR4, or MR5 wonders
- strict final coverage; `FINAL_NATURAL_WONDER_AUDIO_COVERAGE` remains `false`
- non-Soundimage assets unless Soundimage-first curation fails for a specific wonder

## Source Policy

MR2 is Soundimage-first for consistency with MR1. Use Soundimage.org assets by Eric Matyas for all six clips unless a specific wonder cannot be matched at acceptable quality. If a fallback is needed, it must come from the approved Stage 2H source families and must be documented in the implementation plan before code or assets are added.

Source assumptions checked during design:

- Soundimage's attribution page requires crediting Eric Matyas / Soundimage.org for music tracks and sound effects.
- Soundimage's OGG music page says OGG tracks loop seamlessly in game engines, while MP3 files may need editing because encoding can add tiny gaps.
- Soundimage's looping music page has a directly relevant `Crystal Caverns` MP3 track, but this is a candidate source, not an automatic selection.

The implementation plan must still name the exact six selected source URLs before assets are downloaded or converted. Candidate direction:

| Wonder | Stinger feel | Ambient feel | Soundimage-first curation target |
|---|---|---|---|
| `sacred_mountain` | high-altitude reveal, restrained awe, low ceremonial lift | thin wind, open height, meditative stone | quiet mystical/ceremonial music or environment loops |
| `crystal_caverns` | glassy sparkle, resonant reveal, brief crystalline shimmer | cool subterranean pulse, gemlike repetition | `Crystal Caverns` and related puzzle/mystery loops |
| `aurora_fields` | luminous sky swell, gentle wonder, non-combat sparkle | airy electro-drone, night-sky shimmer, soft loop | ambient sci-fi/electro drone or celestial loops |

Do not force a track just because the title matches. Listening quality takes priority over title fit; a source with the right mood but less literal title is better than a named track that feels goofy, busy, or foregrounded. The plan must include a small source-selection table with exact source page or direct media URL, intended local output, license category, and why the clip fits the wonder.

## Architecture

MR2 should extend the MR1 data path without introducing a parallel audio path.

Catalog changes should be small and explicit:

- introduce `COMPLETE_NATURAL_WONDER_AUDIO_IDS` for all currently complete natural-wonder audio packages: MR1 plus MR2
- keep `MR1_NATURAL_WONDER_AUDIO_IDS` only if useful for historical tests or PR language, but do not leave production or coverage tests tied to an MR1-only name
- introduce `MR2_NATURAL_WONDER_AUDIO_IDS` for this slice's three new complete packages
- add complete entries for `sacred_mountain`, `crystal_caverns`, and `aurora_fields`
- type `COMPLETE_ENTRIES` against the full complete-ID union so missing authored entries fail at compile time
- keep all other non-complete wonders as `status: 'pending'`
- keep `FINAL_NATURAL_WONDER_AUDIO_COVERAGE = false`

Source manifest changes should add one structured record per new source and harden the existing MR1 records to match the Stage 2H source contract. Extend `NaturalWonderAudioSource` with:

- `creditText`, the exact human-readable attribution fragment expected in `AUDIO-CREDITS.md`
- `localFiles`, a readonly list of local output paths derived from that source

This shape handles both the normal one-source-to-one-output case and the allowed one-source-to-multiple-outputs case without duplicating license metadata. Reusing one Soundimage source for both stinger and ambient is allowed only if the implementation intentionally derives two different local clips from the same source and the manifest/credits make that clear. Prefer distinct source IDs per output file when the source material is distinct.

Asset paths must remain relative public paths such as `audio/wonders/crystal-caverns-ambient.ogg`. Do not add the files to service-worker precache lists. The existing fetch/cache behavior remains the loading strategy for browser/PWA and macOS/Tauri.

## Player Experience

MR2 does not add new UI. It fills three existing natural-wonder audio slots.

| Before | Action | Immediate result |
|---|---|---|
| Discovery ceremony starts for `sacred_mountain` | The reveal begins for the current human player | Sacred Mountain stinger plays once with music ducking; reveal visuals and Atlas actions remain unchanged |
| Codex page opens for discovered `crystal_caverns` | Player selects Crystal Caverns | Crystal Caverns ambient fades in quietly; previous natural-wonder ambience fades out |
| Codex page shows `aurora_fields` | Player clicks `Replay animation` | Aurora Fields replay animation runs, stinger plays once, and its ambient loop starts or refreshes |
| Map shows a currently visible discovered MR2 wonder tile | Player taps/focuses/inspects the tile | Matching short map-focus ambience starts and times out through the existing director |
| Player opens a pending MR3-MR5 wonder page | Page appears if already discoverable through existing Codex rules | No stinger, no ambient loop, and no fallback audio |

All privacy rules from the Stage 2H base spec remain unchanged. MR2 audio must not play for undiscovered, last-seen-only, fog-only, rival-only, AI, or wrong hot-seat viewer situations.

## Audio Quality Requirements

Each selected clip must pass a listening review before final implementation:

- stingers should be short enough to feel like a reveal accent rather than a music cue that takes over the scene
- ambient loops should sit behind the UI and music, not compete with reading or map interaction
- loops should avoid obvious clicks, hard cuts, or distracting rhythmic peaks
- gains should be tuned against MR1 clips so MR2 does not feel substantially louder or quieter
- map-focus ambience should work as a brief environmental response, not persistent camera ambience

If a selected source is too long, too loud, too busy, or too large, implementation should trim, re-encode, choose another Soundimage source, or pause for a user decision. The PR must include a short listening note for each wonder and a total asset-size note.

## Testing Requirements

MR2 implementation must update or add tests proving:

- complete coverage now includes all MR1 and MR2 wonder IDs
- `sacred_mountain`, `crystal_caverns`, and `aurora_fields` have `status: 'complete'`
- all remaining MR3-MR5 wonders remain explicit `pending` entries
- every complete entry's `soundMood` still matches the Stage 2E spectacle recipe
- every complete stinger and ambient path exists under `public/audio/wonders/`
- every complete audio file has OGG magic bytes
- every new source ID resolves in `natural-wonder-audio-sources.ts`
- every complete source record, including MR1 and MR2, has title, creator, URL, license, `creditText`, and `localFiles`
- every complete clip's file path appears in its source record's `localFiles`
- every complete source's `creditText`, source URL, and local output path appear in `AUDIO-CREDITS.md`
- pending entries still make no loader, stinger, or mixer calls through `NaturalWonderAudioDirector`
- at least one MR2 complete entry works through replay/ambient director coverage, either by expanding existing parameterized tests or adding a focused MR2 case

MR2 should not need new UI tests unless implementation changes UI code. If UI code changes, rerun and update the relevant Codex, Atlas, discovery queue, or focus tests according to the MR1 architecture.

## Required Checks

For implementation:

```bash
scripts/check-src-rule-violations.sh src/audio/natural-wonder-audio-sources.ts src/audio/natural-wonder-audio-catalog.ts
./scripts/run-with-mise.sh yarn test --run tests/audio/natural-wonder-audio-catalog.test.ts tests/audio/natural-wonder-audio-director.test.ts
./scripts/run-wonder-regressions.sh
./scripts/run-with-mise.sh yarn build
./scripts/run-with-mise.sh yarn test
```

If implementation touches any source file beyond the audio catalog/source manifest, add that file to the source-rule command and run its mirrored or smallest relevant tests. If implementation changes service worker, platform, Vite distribution config, or asset path behavior, run the dual-release checks required by `AGENTS.md`.

## Acceptance Criteria

- MR2's three natural wonders have complete, real, credited audio packages.
- MR1 audio remains complete and unchanged except for shared constants or test naming needed to represent MR1+MR2 coverage.
- MR3-MR5 wonders remain explicit pending entries that play nothing.
- The existing Stage 2H playback architecture requires no new UI or state wiring for MR2.
- Asset/source/credit tests fail if any MR1 or MR2 complete clip, source record, local output path, or credit text is missing.
- Privacy and pending-entry fail-closed behavior remain intact.
- PR notes include exact selected sources, listening notes, bundle-size impact, and verification commands.
