# Stage 3C Wonder Video Batch 3 Design

**Date:** 2026-06-09
**Status:** Reviewed for implementation planning
**Related roadmap:** `docs/superpowers/specs/2026-05-21-wonder-atlas-and-map-identity-design.md`
**Builds on:** Stage 3 Real Video Spike and Stage 3B Wonder Video Batch 2

## Purpose

Stage 3C continues the complete wonder asset approach with another small real-video batch. Stage 3 and Stage 3B proved that local, silent, sourced clips can make Wonder Codex entries and ceremonies feel more special without changing gameplay, saves, PWA behavior, or the audio system. The next useful step is not a full-roster media pass yet; it is another compact source-led batch that teaches the project which source types, themes, and compression targets hold up in normal play.

This slice adds exactly six new local video clips: three natural wonders and three legendary wonders. Candidate selection remains likelihood-first, then source-quality-driven. This design records the current un-videoed likelihood shortlists, the source-quality sorting, the final six selections, and alternates so implementation does not choose a different batch ad hoc.

## Goals

- Add exactly three new natural-wonder videos and three new legendary-wonder videos.
- Exclude every wonder that already has video after Stage 3B.
- Preserve the existing Stage 3 video architecture: typed manifest, safe presentation helper, reusable DOM video view, still fallback, and existing ceremony/Codex hosts.
- Weight candidate selection first by in-game encounter likelihood, then by real media quality and sourcing.
- Keep all shipped clips silent, local, sourced, and under asset-size review thresholds.
- Add auditable `stage-3c-batch-3` metadata without changing UI behavior.
- Update source attribution in both the typed manifest and the human-readable source ledger.
- Keep the optional future `sfxCueId` extension point unconsumed and architecture-compatible with later wonder SFX.

## Non-Goals

- Do not add video support to every wonder.
- Do not add generated videos.
- Do not stream or hotlink remote videos at runtime.
- Do not add audible video tracks, autoplay sound, new SFX playback, or a second audio system.
- Do not change natural wonder placement, discovery, yields, legendary eligibility, quests, rewards, AI, saves, city rendering, map rendering, PWA registration, or Tauri behavior.
- Do not change the Codex, discovery ceremony, or legendary completion ceremony layout except where existing video slots naturally render the additional supported entries.
- Do not choose final clips from outside the top-ten likelihood shortlists unless every selected source and every listed alternate for that category fails asset preparation; in that case, pause for a user decision instead of silently broadening scope.

## Selection Contract

The design and implementation must follow this order:

1. Exclude videoed wonders from the current roster.
2. Score un-videoed natural wonders by encounter likelihood.
3. Take the top ten natural candidates.
4. Score un-videoed legendary wonders by encounter likelihood.
5. Take the top ten legendary candidates.
6. Research reusable video sources only for those twenty candidates.
7. Score media quality and source suitability for each candidate with viable source options.
8. Select the top three natural and top three legendary candidates after source-quality sorting.
9. If a selected candidate fails asset preparation, move to the next source-quality-ranked candidate within the same top-ten shortlist.
10. If fewer than three viable candidates remain in either category, stop and document the failure instead of weakening license, silence, or asset-size rules.

The final six selected by this design are:

- natural: `ancient_forest`, `bioluminescent_bay`, `singing_sands`
- legendary: `world-archive`, `ironroot-foundry`, `sun-spire`

The implementation plan and PR body must include the ranked candidate table, final selected six, skipped high-likelihood candidates, and the reason each skipped candidate lost.

## Current Exclusions

The following wonders already have local video and are excluded from Stage 3C selection:

- natural: `great_volcano`, `sacred_mountain`, `coral_reef`, `grand_canyon`
- legendary: `starvault-observatory`, `oracle-of-delphi`, `grand-canal`, `moonwell-gardens`

## Likelihood Scoring

Likelihood scores are design-time heuristics, not gameplay rules. They must not be added to save data or affect game mechanics.

### Natural Wonder Likelihood

Natural-wonder likelihood must use:

- terrain commonness and map accessibility
- expected discovery timing by scouts, settlers, or early coastal exploration
- whether the wonder is reachable before late naval exploration
- whether the current roster already has a video for that wonder

After the current exclusions, the top-ten natural shortlist for Stage 3C is:

| Rank | Wonder ID | Reason |
|---:|---|---|
| 1 | `ancient_forest` | Forest terrain is common, land-accessible, and likely to be found early. |
| 2 | `crystal_caverns` | Hills are common and often near early expansion routes. |
| 3 | `dragon_bones` | Plains are common and land-accessible, even if media sourcing is harder. |
| 4 | `floating_islands` | Hills make it likely to appear near land exploration, but the theme is fantastical. |
| 5 | `singing_sands` | Desert is less universal than hills/forest/plains but still commonly encountered. |
| 6 | `sunken_ruins` | Coast is common, but underwater source fit requires stronger vetting. |
| 7 | `bioluminescent_bay` | Coast is common and visually promising, with source quality deciding viability. |
| 8 | `aurora_fields` | Tundra is more map-dependent than forest/hills/plains/desert/coast. |
| 9 | `frozen_falls` | Snow encounters are more map-dependent and later than the land-accessible top tier. |
| 10 | `bottomless_lake` | Swamp/lake placement is more map-dependent, but water motion sources are likely. |

Lower-likelihood natural wonders for this batch are `eternal_storm`, because ocean/storm encounters are more map-dependent and later-game than the shortlisted terrain types.

### Legendary Wonder Likelihood

Legendary-wonder likelihood must use:

- era availability, with earlier eras weighted higher
- city requirement difficulty
- resource requirement difficulty
- quest friction and dependency on late systems
- likely player and AI completion frequency
- whether the current roster already has a video for that wonder

After the current exclusions, the top-ten legendary shortlist for Stage 3C is:

| Rank | Wonder ID | Reason |
|---:|---|---|
| 1 | `world-archive` | Era 4, any-city requirement, no resource gate, and broad tech/trade theme. |
| 2 | `whispering-exchange` | Era 4, any-city requirement, no resource gate, and trade routes are central gameplay. |
| 3 | `sun-spire` | Era 4 any-city wonder, but stone and stronghold quest friction reduce frequency. |
| 4 | `hall-of-champions` | Era 4 any-city wonder with strong theme, but iron gate and combat quest add friction. |
| 5 | `ironroot-foundry` | Era 4 any-city wonder, but iron plus industrial/stronghold quest requirements add friction. |
| 6 | `tidecaller-bastion` | Coastal city and stone requirements make it more map-dependent. |
| 7 | `gate-of-the-world` | Coastal and exploration/trade requirements make it later and map-dependent. |
| 8 | `leviathan-drydock` | Coastal specialization plus later naval theme reduce normal encounter frequency. |
| 9 | `storm-signal-spire` | Weather-warning theme is strong, but later and more specialized than era-4 any-city wonders. |
| 10 | `manhattan-project` | Endgame weighting makes it rare, but source availability is plausible. |

Lower-likelihood legendary wonders for this batch are `internet`, because it is the latest endgame entry in the current roster.

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

## Source Review And Final Batch

The following source review was performed after fixing the top-ten likelihood shortlists above. Source pages must be re-opened during implementation to verify nothing has changed before downloading.

The `ancient_forest` source has a special verification gate: its Commons page includes both CC BY 2.0 metadata and U.S. Bureau of Land Management public-domain metadata, but it also still carries Commons Flickr-review-needed categories at design time. Implementation may use it only if the source page and original mypubliclands/BLM source still provide compatible reuse terms when assets are prepared. If that verification is not clean, implementation must treat `ancient_forest` as failed asset preparation and move to `crystal_caverns`, the next natural alternate, instead of weakening the license rules.

### Source-Quality Ordering Result

Natural source-quality order:

| Source Rank | Likelihood Rank | Wonder ID | Stage 3C Result | Reason |
|---:|---:|---|---|---|
| 1 | 1 | `ancient_forest` | selected with verification gate | Highest remaining encounter likelihood, short 7.1-second BLM/mypubliclands source, forest/coast motion, CC BY 2.0 and U.S. BLM public-domain metadata, and matching `image-forest` fallback. Because Commons still marks the Flickr import as review-needed at design time, implementation must verify the original source terms before shipping. |
| 2 | 7 | `bioluminescent_bay` | selected | Direct Vieques bioluminescent bay footage, compact 720p source, clear CC BY-SA 3.0 attribution, and matching `image-coral` fallback. |
| 3 | 5 | `singing_sands` | selected | Strong desert/sand readability, BLM public-domain structured data, compact 13-second source, and matching `image-desert` fallback; selected despite silent-video limits because no audio is allowed. |
| 4 | 2 | `crystal_caverns` | first natural alternate | High encounter likelihood and clear CC BY-SA/GFDL licensing, but the direct Carlsbad Caverns source surfaced during design is 352x240 and likely weaker in Codex/ceremony than the selected clips. Use it if the `ancient_forest` source verification is not clean or if a selected natural asset fails preparation. |
| 5 | 6 | `sunken_ruins` | alternate | Coastal likelihood is acceptable, but underwater-ruins source fit needs more vetting than this small batch allows. |
| 6 | 9 | `frozen_falls` | alternate | Strong visual prospects, but snow placement is lower-likelihood after current exclusions. |
| 7 | 8 | `aurora_fields` | skipped | Good visual prospects, but tundra placement is lower-likelihood and aurora clips overlap the already-videoed observatory/night-sky mood. |
| 8 | 3 | `dragon_bones` | skipped | Strong likelihood, but no direct reusable real-video source fits fossil/bone spectacle at ceremony scale. |
| 9 | 4 | `floating_islands` | skipped | Likely enough in game, but the theme is fantastical and lacks a direct real-world video match for this source-led batch. |
| 10 | 10 | `bottomless_lake` | skipped | Viable water footage is likely, but the lower likelihood and generic lake identity make it less valuable than selected sources. |

Legendary source-quality order:

| Source Rank | Likelihood Rank | Wonder ID | Stage 3C Result | Reason |
|---:|---:|---|---|---|
| 1 | 1 | `world-archive` | selected | Highest remaining legendary likelihood, clear knowledge/recordkeeping metaphor, CC0 printing-press source, and matching `image-archive` fallback. |
| 2 | 5 | `ironroot-foundry` | selected | Strong forge/glowing-metal readability, reviewed CC BY 3.0 source, compact enough after trimming, and matching `image-foundry` fallback. |
| 3 | 3 | `sun-spire` | selected | Public-domain NOAA/CIRA solar-panel glint source is compact and cleanly licensed; the theme is slightly abstract but better sourced than the remaining high-likelihood alternates. |
| 4 | 4 | `hall-of-champions` | alternate | Strong theme, but available Olympic/arena video candidates are less direct or have weaker compact-source fit. |
| 5 | 2 | `whispering-exchange` | alternate | High encounter likelihood, but source search still favors still images over compact reusable trading-floor video. |
| 6 | 6 | `tidecaller-bastion` | alternate | Coastal/bastion source options are plausible, but likely overlap existing ruins/coastal imagery. |
| 7 | 7 | `gate-of-the-world` | skipped | Coastal and exploration/trade requirements make it later and source identity overlaps maritime alternates. |
| 8 | 8 | `leviathan-drydock` | skipped | Direct drydock footage may be possible, but the wonder is more specialized and later than selected entries. |
| 9 | 9 | `storm-signal-spire` | skipped | Weather signal imagery is plausible, but lower-likelihood and overlaps storm/satellite moods. |
| 10 | 10 | `manhattan-project` | skipped | Source material is plausible but endgame rarity makes it a poor candidate for this small batch. |

### Final Natural Selections

| Selected Wonder | Source | License / Creator | Why Selected | Local Path |
|---|---|---|---|---|
| `ancient_forest` | `https://commons.wikimedia.org/wiki/File:-TravelTuesday_with_My_Public_Lands_(23825649569).webm` | mypubliclands, CC BY 2.0 and U.S. BLM public-domain metadata; implementation must verify review-needed status/source terms | Highest remaining encounter likelihood, short 1920x1280 source, forest/redwood/coastal public-lands read, existing `image-forest` fallback. Use only if source verification is clean during implementation. | `/videos/wonders/ancient-forest-headwaters-redwoods.mp4` |
| `bioluminescent_bay` | `https://commons.wikimedia.org/wiki/File:Kayaking_in_the_Bioluminescent_Bay_Vieques.webm` | Z22, CC BY-SA 3.0 | Direct bioluminescent bay footage with a compact source and existing `image-coral` fallback. Implementation must trim to a visible glow moment and avoid a muddy black loop. | `/videos/wonders/bioluminescent-bay-vieques-kayak.mp4` |
| `singing_sands` | `https://commons.wikimedia.org/wiki/File:Mojave_Desert_Sunset_(40480403760).webm` | Kyle Sullivan / BLM California, public domain U.S. Bureau of Land Management material | Strong sand/desert identity, reliable institutional source, compact 13-second source, existing `image-desert` fallback. | `/videos/wonders/singing-sands-mojave-sunset.mp4` |

Natural alternates if asset preparation fails:

| Alternate Wonder | Source | Reason Not Selected First |
|---|---|---|
| `crystal_caverns` | `https://commons.wikimedia.org/wiki/File:CarlsbadCaverns.ogv` | High encounter likelihood, direct cave subject, and clear CC BY-SA/GFDL licensing, but the source is only 352x240 and likely weaker at ceremony size. This is the first natural alternate if the forest source cannot pass verification. |
| `sunken_ruins` | `https://commons.wikimedia.org/wiki/Category:Videos_of_shipwrecks` | Coastal likelihood is acceptable, but the source fit should distinguish ruins from generic shipwreck or open-water footage. |
| `frozen_falls` | `https://commons.wikimedia.org/wiki/Category:Videos_of_waterfalls` | Strong visual prospects, but lower encounter likelihood after current exclusions. |

### Final Legendary Selections

| Selected Wonder | Source | License / Creator | Why Selected | Local Path |
|---|---|---|---|---|
| `world-archive` | `https://commons.wikimedia.org/wiki/File:Demonstration_of_printing_press.webm` | Krassotkin, CC0 1.0 | Highest remaining legendary likelihood and clear recordkeeping/knowledge metaphor; source is large, so implementation should prefer a Commons transcode or short trim that still looks clean before encoding the local derivative. | `/videos/wonders/world-archive-printing-press.mp4` |
| `ironroot-foundry` | `https://commons.wikimedia.org/wiki/File:Smithy-_steel_forging_(2).webm` | Sounds of Changes, CC BY 3.0; source credits Museum of Municipal Engineering plus the named sound/photography/video recordists | Glowing metal and forging action read immediately as foundry work; implementation must strip source audio and keep attribution complete. | `/videos/wonders/ironroot-foundry-steel-forging.mp4` |
| `sun-spire` | `https://commons.wikimedia.org/wiki/File:Solar_panel_sun_glint_sparkles_across_Minnesota_(from_7_July_2018)_(CIRA_2018-07-11).webm` | GOES imagery: CSU/CIRA and NOAA, public domain NOAA material | Compact solar-energy source with excellent license clarity; abstract satellite view is acceptable because the fallback still anchors the tower identity. | `/videos/wonders/sun-spire-solar-glint.mp4` |

Legendary alternates if asset preparation fails:

| Alternate Wonder | Source | Reason Not Selected First |
|---|---|---|
| `hall-of-champions` | `https://commons.wikimedia.org/wiki/Category:Ancient_Olympia` | Strong theme, but available video candidates are less direct or need more vetting. |
| `whispering-exchange` | `https://commons.wikimedia.org/wiki/Category:New_York_Stock_Exchange_trading_floor` | High encounter likelihood, but Commons search still surfaces still images more reliably than compact trading-floor video. |
| `tidecaller-bastion` | `https://commons.wikimedia.org/wiki/Category:Videos_of_coastal_forts` | Plausible coastal/bastion fit, but lower likelihood and source overlap with maritime/ruins imagery. |

## User Experience

Stage 3C preserves the existing Stage 3 user experience. A supported wonder uses video only where the existing video preview view model is already consumed:

- Wonder Codex detail page
- natural discovery ceremony for natural wonders
- legendary completion ceremony for legendary wonders

Videos remain muted, looped, local, and paired with visible pause/play controls. Reduced-motion users, playback failures, blocked autoplay, missing files, and unsupported formats must still show the sourced still/static fallback with no broken or empty media surface.

Unsupported wonders continue to show existing still images, vignettes, and ceremony visuals. The larger manifest must not make un-videoed wonders feel broken, incomplete, disabled, or lower-value.

## Audio And SFX

Stage 3C is silent. Video source audio must be removed during asset preparation, the typed manifest must keep `audio: 'silent'`, and UI tests must continue to prove no video preview introduces audio playback. Do not add new SFX cues in this slice.

The architecture must remain extensible for future wonder SFX:

- keep video metadata separate from audio playback
- do not add `sfxCueId` values yet
- do not make UI playback depend on batch id
- keep `sfxCueId` optional and inert if it already exists in the shared type surface

## Architecture

Stage 3C must extend the existing modules instead of creating a parallel media path:

```text
src/systems/wonder-codex/types.ts
src/systems/wonder-codex/video-sources.ts
src/systems/wonder-codex/video-presentation.ts
src/ui/wonder-video-view.ts
```

The main expected data change is extending batch metadata:

```ts
export type WonderCodexVideoBatchId =
  | 'stage-3-spike'
  | 'stage-3b-batch-2'
  | 'stage-3c-batch-3';
```

Tests must prove every record has a batch id, the two existing spike records use `stage-3-spike`, the six Stage 3B records use `stage-3b-batch-2`, and exactly six Stage 3C records use `stage-3c-batch-3`.

UI modules must not branch on batch id. Batch metadata is for tests, auditability, source review, and future maintenance only.

Do not add mutable runtime caches, source lookups from UI code, gameplay-state dependencies in `wonder-video-view.ts`, or direct DOM/platform reads in system presentation helpers.

## Asset And Distribution Constraints

Each selected source must be converted into a local derivative under `public/videos/wonders/`. Each derivative must be:

- MP4/H.264
- muted with no audio track
- short enough for fast ceremony/Codex load, targeting 3-5 seconds
- scaled/cropped only as needed to preserve the wonder identity
- under `HARD_VIDEO_ASSET_REVIEW_BYTES`
- preferably under `TARGET_VIDEO_ASSET_BYTES`

If a derivative exceeds the hard review threshold or looks visually poor after compression, implementation must use the category alternate path instead of shipping a bad clip.

If the `ancient_forest` source cannot pass the explicit review-needed/source-terms verification gate, the implementation must switch the natural selection from `ancient_forest` to `crystal_caverns` and update the manifest, ledger, plan status, and PR body to explain the substitution. Do not ship a source with unresolved reuse rights merely to preserve the preferred selection.

No service worker, PWA manifest, Tauri config, or platform capability changes are expected. If local videos do not naturally flow through the current public-asset build, stop and document the issue before adding distribution-specific behavior.

## Attribution And Source Ledger

Implementation must update `docs/superpowers/specs/2026-05-23-wonder-codex-atlas-source-ledger.md` with one row per new Stage 3C video source. Each row must include:

- video source id
- wonder id
- exact source URL
- creator
- license
- local asset path
- derivative notes, including trim, scaling/cropping if any, muted audio, MP4/H.264 encoding, and attribution text

The typed runtime manifest in `src/systems/wonder-codex/video-sources.ts` must match the source ledger exactly for source URL, creator, license, attribution, local path, audio, and batch id.

## Testing

Stage 3C must add or update tests that prove:

- `WonderCodexVideoBatchId` includes `stage-3c-batch-3`.
- The manifest has exactly fourteen records after implementation: two Stage 3 spike records, six Stage 3B records, and six Stage 3C records.
- Exactly six records have `batchId: 'stage-3c-batch-3'`.
- The selected six wonder ids are present and map to the expected surfaces.
- Every video record is silent, local, MP4, has positive duration and size, stays under the hard review threshold, and references an existing fallback image source.
- Safe presentation helpers expose the Stage 3C videos on Codex and the correct ceremony surfaces.
- Unsupported wonders still fall back to still images.
- Reduced-motion and playback-failure UI behavior remains covered by existing `wonder-video-view` tests.
- Natural discovery ceremony tests include at least one Stage 3C natural video.
- Legendary completion ceremony tests include at least one Stage 3C legendary video.
- The source ledger includes all Stage 3C source ids and no placeholder attribution.

Expected targeted verification:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/wonder-codex/sources.test.ts tests/systems/wonder-codex/presentation.test.ts tests/systems/wonder-discovery-reveal.test.ts tests/systems/legendary-wonder-completion-presentation.test.ts tests/ui/wonder-codex-page.test.ts tests/ui/wonder-discovery-ceremony.test.ts tests/ui/legendary-wonder-completion-ceremony.test.ts tests/ui/wonder-video-view.test.ts
scripts/check-src-rule-violations.sh src/systems/wonder-codex/types.ts src/systems/wonder-codex/video-sources.ts src/systems/wonder-codex/video-presentation.ts src/ui/wonder-video-view.ts
./scripts/run-wonder-regressions.sh
./scripts/run-with-mise.sh yarn build
./scripts/run-with-mise.sh yarn test
```

## Acceptance

Stage 3C is complete when:

- The selected six local MP4 assets are present under `public/videos/wonders/`.
- Each selected wonder has one typed video source record with correct surfaces and `stage-3c-batch-3`.
- The source ledger matches the typed manifest.
- No UI code branches on batch id.
- No audio track or SFX playback is introduced.
- Reduced-motion, fallback, and unsupported-wonder behavior continue to work.
- Targeted tests, wonder regressions, build, and full test suite pass.
