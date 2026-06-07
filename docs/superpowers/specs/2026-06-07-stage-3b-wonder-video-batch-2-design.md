# Stage 3B Wonder Video Batch 2 Design

**Date:** 2026-06-07
**Status:** Draft for review
**Related roadmap:** `docs/superpowers/specs/2026-05-21-wonder-atlas-and-map-identity-design.md`
**Builds on:** Stage 3 Real Video Spike

## Purpose

Stage 3B expands the Stage 3 real-video spike with a second small, source-led batch. The first spike proved the architecture for silent local video on Wonder Codex and ceremony surfaces, but two clips are too rare in normal play to teach the project enough about encounter frequency, source availability, asset cost, and player value. Stage 3B adds more real opportunities for players to see the feature without committing to a full-roster media program.

This slice adds exactly six new local video clips: three natural wonders and three legendary wonders. Candidate selection is likelihood-first, then source-quality-driven. The implementation must rank the likely candidates before browsing for media, then choose final clips only from those ranked shortlists after checking source quality, license clarity, visual fit, loop quality, and asset size.

## Goals

- Add exactly three new natural-wonder videos and three new legendary-wonder videos.
- Exclude the already-videoed `great_volcano` and `starvault-observatory` entries from candidate selection.
- Preserve the existing Stage 3 video architecture: typed manifest, safe presentation helper, reusable DOM video view, still fallback, and existing ceremony/Codex hosts.
- Weight candidate selection first by in-game encounter likelihood, then by real media quality and sourcing.
- Keep all shipped clips silent, local, sourced, and under asset-size review thresholds.
- Add batch metadata so future video batches can be audited without changing UI behavior.
- Update source attribution in both the typed manifest and the human-readable source ledger.
- Keep the optional future `sfxCueId` extension point unconsumed.

## Non-Goals

- Do not add video support to every wonder.
- Do not add generated videos.
- Do not stream or hotlink remote videos at runtime.
- Do not add audible video tracks, autoplay sound, new SFX playback, or a second audio system.
- Do not change natural wonder placement, discovery, yields, legendary eligibility, quests, rewards, AI, saves, city rendering, map rendering, PWA registration, or Tauri behavior.
- Do not change the Codex, discovery ceremony, or legendary completion ceremony layout except where existing video slots naturally render the additional supported entries.
- Do not choose final clips from outside the top-ten likelihood shortlists unless fewer than three candidates in a category have acceptable sources; in that case, pause for a user decision instead of silently broadening scope.

## Selection Contract

The implementation must follow this order:

1. Score un-videoed natural wonders by encounter likelihood.
2. Take the top ten natural candidates.
3. Score un-videoed legendary wonders by encounter likelihood.
4. Take the top ten legendary candidates.
5. Research reusable video sources only for those twenty candidates.
6. Score media quality and source suitability for each candidate with viable source options.
7. Select the top three natural and top three legendary candidates after source-quality sorting.
8. If a selected candidate fails asset preparation, move to the next source-quality-ranked candidate within the same top-ten shortlist.
9. If fewer than three viable candidates remain in either category, stop and document the failure instead of weakening license, silence, or asset-size rules.

The design intentionally does not preselect the final six shipped wonders. Final selection depends on real media availability and asset preparation. The implementation plan and PR body must include the ranked candidate table, final selected six, skipped high-likelihood candidates, and the reason each skipped candidate lost.

## Likelihood Scoring

Likelihood scores are design-time heuristics, not gameplay rules. They must not be added to save data or affect game mechanics.

### Natural Wonder Likelihood

Natural-wonder likelihood must use:

- terrain commonness and map accessibility
- expected discovery timing by scouts, settlers, or early coastal exploration
- whether the wonder is reachable before late naval exploration
- whether the current roster already has a video for that wonder

The top-ten natural shortlist for Stage 3B is:

| Rank | Wonder ID | Reason |
|---:|---|---|
| 1 | `ancient_forest` | Forest terrain is common, land-accessible, and likely to be found early. |
| 2 | `crystal_caverns` | Hills are common and often near early expansion routes. |
| 3 | `dragon_bones` | Plains are common and land-accessible, even if media sourcing may be harder. |
| 4 | `sacred_mountain` | Mountains are common landmarks and visually legible, though some tiles may be less directly traversable. |
| 5 | `floating_islands` | Hills make it likely to appear near land exploration, but source fit may be challenging. |
| 6 | `grand_canyon` | Desert is less universal than hills/forest/plains but still commonly encountered. |
| 7 | `singing_sands` | Desert shares Grand Canyon's encounter profile, with a more abstract media challenge. |
| 8 | `coral_reef` | Coast is common and discoverable by coastal settlement and exploration. |
| 9 | `sunken_ruins` | Coast is common, but the underwater theme may require stronger source vetting. |
| 10 | `bioluminescent_bay` | Coast is common and visually promising, with sourcing likely to determine viability. |

Lower-likelihood natural wonders for this batch are `aurora_fields`, `frozen_falls`, `bottomless_lake`, and `eternal_storm`, because tundra, snow, swamp, and ocean encounters are more map-dependent or later-game than the shortlisted terrain types. `great_volcano` is excluded because Stage 3 already added a video for it.

### Legendary Wonder Likelihood

Legendary-wonder likelihood must use:

- era availability, with earlier eras weighted higher
- city requirement difficulty
- resource requirement difficulty
- quest friction and dependency on late systems
- likely player and AI completion frequency
- whether the current roster already has a video for that wonder

The top-ten legendary shortlist for Stage 3B is:

| Rank | Wonder ID | Reason |
|---:|---|---|
| 1 | `oracle-of-delphi` | Earliest legendary wonder, any-city requirement, and simple first quest profile. |
| 2 | `world-archive` | Era 4, any-city requirement, no resource gate, and broad tech/trade theme. |
| 3 | `whispering-exchange` | Era 4, any-city requirement, no resource gate, and trade routes are central gameplay. |
| 4 | `moonwell-gardens` | Era 4, no resource gate, common river-city fit, and natural-discovery quest synergy. |
| 5 | `grand-canal` | Era 4 and highly recognizable, but river plus stone gates lower likelihood slightly. |
| 6 | `sun-spire` | Era 4 any-city wonder, but stone and stronghold quest friction reduce frequency. |
| 7 | `hall-of-champions` | Era 4 any-city wonder with strong source/media prospects, but iron gate and combat quest add friction. |
| 8 | `ironroot-foundry` | Era 4 any-city wonder, but iron plus industrial/stronghold quest requirements add friction. |
| 9 | `tidecaller-bastion` | Coastal city and stone requirements make it more map-dependent. |
| 10 | `gate-of-the-world` | Coastal and exploration/trade requirements make it later and map-dependent, but still more likely than era 5 entries. |

Lower-likelihood legendary wonders for this batch are `leviathan-drydock`, `storm-signal-spire`, `manhattan-project`, and `internet`, because they are more coastal-specialized, later-era, or endgame-weighted. `starvault-observatory` is excluded because Stage 3 already added a video for it.

## Source-Quality Scoring

After the top-ten likelihood shortlists are fixed, score each candidate's best viable source option out of 100:

| Category | Points | Requirement |
|---|---:|---|
| License and source reliability | 30 | Clear reuse rights from Wikimedia Commons, NASA, NOAA, NPS, USGS, ESO, other institutional sources, or equivalently reliable sources. |
| Visual match and player readability | 25 | The clip clearly reads as the wonder's theme in a 3-5 second loop and works at ceremony/Codex size. |
| Derivative feasibility | 20 | Can be trimmed, muted, and encoded as local MP4/H.264 under target size without ugly compression artifacts. |
| Attribution completeness | 15 | Creator, source URL, license, derivative notes, and local asset path can be documented in the ledger. |
| Fallback compatibility | 10 | Existing sourced still-image fallback fits the same wonder identity and remains valid when video is unavailable. |

Tie-breakers:

1. Choose the candidate with clearer license terms.
2. Choose the candidate with lower expected local file size.
3. Choose the candidate that improves thematic variety across the video roster.
4. Choose the candidate with a stronger existing fallback image.

Candidates with unclear license terms, missing attribution, audible-only source value, or expected file size over the hard threshold are not viable no matter how likely they are in game.

## User Experience

Stage 3B preserves the Stage 3 user experience. A supported wonder uses video only where the existing video preview view model is already consumed:

- Wonder Codex detail page
- natural discovery ceremony for natural wonders
- legendary completion ceremony for legendary wonders

Videos remain muted, looped, local, and paired with visible pause/play controls. Reduced-motion users, playback failures, blocked autoplay, missing files, and unsupported formats must still show the sourced still/static fallback with no broken or empty media surface.

Unsupported wonders continue to show existing still images, vignettes, and ceremony visuals. The larger manifest must not make un-videoed wonders feel broken, incomplete, disabled, or lower-value.

## Architecture

Stage 3B must extend the existing modules instead of creating a parallel media path:

```text
src/systems/wonder-codex/video-sources.ts
src/systems/wonder-codex/video-presentation.ts
src/ui/wonder-video-view.ts
```

The main expected data change is adding required batch metadata to video source records:

```ts
export type WonderCodexVideoBatchId = 'stage-3-spike' | 'stage-3b-batch-2';

batchId: WonderCodexVideoBatchId
```

Tests must prove every record has a batch id, the two existing spike records use `stage-3-spike`, and every Stage 3B record uses `stage-3b-batch-2`.

UI modules must not branch on batch id. Batch metadata is for tests, auditability, source review, and future maintenance only.

Do not add mutable runtime caches, source lookups from UI code, gameplay-state dependencies in `wonder-video-view.ts`, or direct DOM/platform reads in system presentation helpers.

## Audio And Future SFX Contract

Stage 3B videos are silent. They must not ship usable audio tracks, create `HTMLAudioElement`s, trigger Web Audio nodes, call the audio mixer, or consume `sfxCueId`.

The optional `sfxCueId` field remains reserved for future SFX integration. Stage 3B must preserve the field as metadata only; it must not play SFX or imply that video has sound. If a source clip contains audio, the shipped derivative must remove it, and `ffprobe` verification must show video-only streams.

## Asset, Offline, And Distribution Rules

Each Stage 3B clip must be:

- 3-5 seconds
- local under `public/videos/wonders/`
- MP4/H.264 unless implementation proves another local format works across supported surfaces
- silent, with no usable audio stream
- target under 2 MB
- hard-fail over 5 MB
- documented with source URL, creator, license, attribution, derivative notes, duration, size, format, MIME type, and local path
- compatible with existing browser/PWA and macOS/Tauri frontend playback expectations

Batch-level asset review:

- target total added Stage 3B video bytes: 12 MB or less
- hard review threshold for Stage 3B total added video bytes: 18 MB
- if the six selected clips exceed the 18 MB batch threshold, stop and either replace candidates within the top-ten shortlist or ask for a user decision

Do not change service-worker, Vite, PWA, Tauri, or platform code unless implementation proves local public video delivery requires it. If any distribution file changes, run the extra distribution checks required by `AGENTS.md`.

## Attribution And Source Ledger

The source ledger remains required. Each new video source must appear in:

- `src/systems/wonder-codex/video-sources.ts`
- `docs/superpowers/specs/2026-05-23-wonder-codex-atlas-source-ledger.md`

Each ledger row must include wonder ID, clip title or description, source URL, creator, license, local asset path, and derivative notes such as trimming, muting, resizing, or re-encoding.

The implementation plan must include a source-research step. That step must verify candidate source pages and cite them in the plan or PR notes. Do not rely on memory for license or source facts.

## Privacy And Visibility

Stage 3B must preserve existing viewer-safe rules:

- undiscovered natural wonders do not expose videos in Codex or ceremonies
- natural videos only appear when the existing natural discovery/Codex presentation allows that wonder
- legendary videos only appear when existing owned/player-visible Codex or completion presentation allows that wonder
- rival legendary intel must not unlock video previews unless an existing viewer-safe page state already allows the same level of visual presentation
- UI code must not derive video visibility from raw rival, hidden map, or hidden project state

## Testing Requirements

Source and manifest tests:

- video source records increase from two to eight after Stage 3B.
- exactly six records have `batchId: 'stage-3b-batch-2'`.
- exactly three Stage 3B records are natural wonders with `codex` and `natural-reveal` surfaces.
- exactly three Stage 3B records are legendary wonders with `codex` and `legendary-completion` surfaces.
- `great_volcano` and `starvault-observatory` remain videoed but are not counted as Stage 3B records.
- every video record has `audio: 'silent'`, duration, size, format, MIME type, loop note, source URL, license, attribution, local path, fallback image source ID, and batch id.
- every local video file exists.
- every video size is under the 5 MB hard per-file threshold.
- Stage 3B total added video bytes are at or below the 18 MB batch hard threshold.
- every source appears in the human-readable source ledger.
- shipped files have no usable audio stream, verified with `ffprobe` when available.

Presentation and UI tests:

- supported Stage 3B Codex pages expose `videoPreview`.
- unsupported and hidden pages still do not expose `videoPreview`.
- at least one Stage 3B natural reveal item exposes a natural-reveal video preview.
- at least one Stage 3B legendary completion item exposes a legendary-completion video preview.
- reduced-motion Codex and ceremonies render fallbacks instead of video.
- blocked playback and media error fallbacks continue to work with Stage 3B records.
- existing Stage 3 spike records still render through the same path.

Regression verification:

- run targeted video source, video presentation, Codex UI, natural ceremony UI, and legendary ceremony UI tests
- run source rule checks for changed `src/` files
- run `./scripts/run-wonder-regressions.sh`
- run `./scripts/run-with-mise.sh yarn build`
- run `./scripts/run-with-mise.sh yarn test`
- run `./scripts/run-with-mise.sh yarn test:web-smoke` because the change increases local media payload and should keep the web frontend healthy

## Acceptance Criteria

- Stage 3B adds exactly six new sourced, silent local video clips.
- The final six are selected by the documented likelihood-first, source-quality-second process.
- The final batch has exactly three natural and three legendary videos.
- All six new videos render through existing Codex and ceremony video surfaces.
- Existing still/static fallbacks work for reduced motion, playback failure, and unsupported entries.
- No audio playback, SFX playback, gameplay rule, save format, AI, map rendering, PWA registration, Tauri, or platform behavior changes are introduced.
- Source attribution is present in typed data and the source ledger.
- Tests cover manifest completeness, source ledger sync, silence, size thresholds, safe presentation, reduced motion, and fallback behavior.
