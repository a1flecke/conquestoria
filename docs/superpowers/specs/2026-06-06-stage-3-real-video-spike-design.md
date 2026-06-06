# Stage 3 Real Video Spike Design

**Date:** 2026-06-06
**Status:** Draft for review
**Related roadmap:** `docs/superpowers/specs/2026-05-21-wonder-atlas-and-map-identity-design.md`
**Builds on:** Stage 2D Wonder Codex, Stage 2E Natural Wonder Spectacle, Stage 2H Natural Wonder Audio, Stage 2I Legendary Bespoke Landmarks, Stage 2J Legendary Landmark Intel Visibility, Stage 2K City Renderer Layers

## Purpose

Stage 3 answers whether real 3-5 second video loops are worth carrying in Conquestoria before the project commits to a broader media program. This is a spike, not a full rollout. It should prove the real constraints: licensed source availability, local asset size, offline/PWA cost, macOS/Tauri behavior, reduced-motion fallback, playback reliability, and maintenance burden.

The selected design is a shared media spike across the Wonder Codex and ceremony surfaces. It adds exactly two silent, sourced, reusable video loops: one natural wonder and one legendary wonder. The two prototype wonders are source-led: implementation should first find acceptable reusable clips, then choose matching wonders from the current roster. This keeps the spike honest about licensing and asset budgets instead of designing around media the project may not be able to ship.

## Goals

- Add a typed wonder video manifest for exactly two prototype entries.
- Use one natural wonder video and one legendary wonder video, selected from viable reusable sources.
- Render supported videos in the Wonder Codex detail page.
- Render supported videos as the main visual panel inside natural discovery and legendary completion ceremonies.
- Keep video assets silent and routed separately from the audio mixer.
- Keep the manifest extensible for future SFX cue metadata without implementing SFX playback in this spike.
- Preserve existing still-image/static-vignette fallbacks for reduced motion and playback failure.
- Measure and document local asset sizes and build/distribution impact.
- Add attribution and source-ledger coverage comparable to existing Codex images.

## Non-Goals

- Do not roll video out to the full natural or legendary roster.
- Do not add generated videos.
- Do not stream video from remote URLs at runtime.
- Do not add video audio tracks, autoplay with sound, or a competing audio mixer.
- Do not implement future SFX cue playback.
- Do not change wonder gameplay, rewards, discovery, construction, questing, AI, saves, or visibility rules.
- Do not add new map-rendered videos, animated terrain video, or city-landmark video.
- Do not change natural-wonder audio stinger/ambient behavior.
- Do not add service-worker or Tauri behavior unless implementation proves it is required for local video delivery.

## Prototype Scope

The first implementation must include exactly two local clips:

- one natural wonder clip that can appear on that wonder's Codex detail page and natural discovery ceremony
- one legendary wonder clip that can appear on that wonder's Codex detail page and legendary completion ceremony

Prototype selection is source-led. Preferred sources are reliable institutional or clearly licensed repositories such as Wikimedia Commons, NASA, NOAA, NPS, USGS, or equivalent sources with explicit reuse terms. If no acceptable clip exists for an initially tempting wonder, choose a different wonder rather than weakening source or size rules.

## User Experience

### Wonder Codex

For a supported wonder, the Codex detail page uses the video as the primary rich-media surface when motion is allowed and playback is available. The video is:

- muted
- looped
- `playsInline`
- locally loaded
- autoplayed only when the media is in view
- paired with visible pause/play controls

If reduced motion is enabled, playback fails, the file is unavailable, or the browser blocks playback, the Codex shows the existing sourced still image. The fallback must not show a broken video icon, empty black box, or inaccessible control state.

Unsupported wonders continue to use the current still image and vignette surfaces. The spike must not make the rest of the Codex look incomplete.

### Natural Discovery Ceremony

For the supported natural wonder, video replaces the current spectacle vignette as the main visual panel inside the existing ceremony card. It does not become a full-screen background or splash screen. Existing Skip, Continue, and Open Atlas actions remain visible and immediate.

When reduced motion is enabled or playback fails, the ceremony uses the existing static reveal visual or sourced still fallback. The ceremony remains skippable before, during, and after attempted playback.

### Legendary Completion Ceremony

For the supported legendary wonder, video replaces the current legendary vignette as the main visual panel inside the existing ceremony card. It does not obscure the title, city name, achievement line, reward text, or Continue/Open City/Open Journal actions.

When reduced motion is enabled or playback fails, the ceremony uses the existing static legendary vignette or sourced still fallback.

## Audio And Future SFX Contract

Stage 3 videos are silent. They must not include audible tracks, create `HTMLAudioElement`s, trigger Web Audio nodes, or bypass the existing audio system. The existing wonder audio, stinger, voice, SFX, mute, reduced-audio, and mixer behavior remains authoritative.

The video manifest should include a future-facing optional field such as `sfxCueId?: string`, but the first implementation must not consume it. This keeps future SFX integration discoverable without coupling this spike to audio playback.

## Architecture

Add a small typed media layer under the wonder Codex/system boundary. Likely modules:

```text
src/systems/wonder-codex/video-sources.ts
src/systems/wonder-codex/video-presentation.ts
src/ui/wonder-video-view.ts
```

The source manifest owns source and asset facts. A video record should include:

- `id`
- `wonderId`
- eligible surfaces: `codex`, `natural-reveal`, `legendary-completion`
- local video path
- fallback image source ID resolving to an existing sourced Codex image
- source URL
- creator/author when available
- license
- attribution
- duration in seconds
- local file size in bytes
- format and MIME type
- loop suitability note
- `audio: 'silent'`
- optional future `sfxCueId?: string`

Presentation helpers expose an optional safe `videoPreview` view model only when:

- the selected wonder has a supported video record
- the current surface is eligible for that record
- the player is already allowed to see that Codex page or ceremony item through existing presentation rules

UI modules consume the view model. They must not inspect raw discovery state, raw legendary completion state, rival state, source manifests, or file-system-like asset details.

`src/ui/wonder-video-view.ts` owns DOM playback behavior:

- create the `<video>` element
- set `muted`, `loop`, and `playsInline`
- use local source paths only
- expose accessible pause/play controls
- use in-view autoplay for Codex, preferably through `IntersectionObserver`
- support immediate ceremony playback attempts
- switch to fallback content on error or reduced motion
- avoid game-state mutation
- avoid audio playback

## Data Flow

Codex flow:

1. The player opens a Wonder Codex page.
2. Existing Codex presentation builds the page view model.
3. Video presentation resolves an optional `videoPreview` for the page and surface.
4. The Codex UI passes that preview to `wonder-video-view`.
5. The reusable video view plays silently when in view, or renders the existing still fallback.

Natural reveal flow:

1. The player discovers a natural wonder.
2. Existing reveal presentation creates a `WonderDiscoveryRevealItem`.
3. Video presentation resolves an optional natural-reveal preview for that wonder.
4. The ceremony uses the video view as its main visual panel when available.
5. Skip/continue/open actions remain ordinary ceremony callbacks.

Legendary completion flow:

1. The player completes a legendary wonder.
2. Existing completion presentation creates a `LegendaryWonderCompletionCeremonyItem`.
3. Video presentation resolves an optional legendary-completion preview for that wonder.
4. The ceremony uses the video view as its main visual panel when available.
5. Completion actions remain ordinary ceremony callbacks.

## Asset, Offline, And Distribution Rules

Video assets live under:

```text
public/videos/wonders/
```

Rules for each prototype clip:

- 3-5 seconds
- encoded without a usable audio track, or processed so the shipped local file has no usable audio track
- loopable or explicitly marked as acceptable for spike evaluation
- target under 2 MB
- hard review threshold at 5 MB
- locally bundled
- no runtime remote URL dependency
- documented creator/license/source URL
- compatible with browser/PWA and macOS/Tauri frontend playback
- preferred delivery format is MP4/H.264 with an explicit MIME type such as `video/mp4`; another format may be used only if implementation verifies it plays in the supported web and Tauri surfaces

Implementation must report:

- individual video sizes
- total added video bytes
- production build output impact
- whether service-worker precache behavior changed
- whether Tauri frontend build behavior changed, if distribution code is touched

If local videos make PWA install/cache cost unreasonable, the spike should document that finding instead of hiding the cost behind a larger warning threshold.

## Attribution And Source Ledger

The typed manifest is not enough by itself. The human-readable source ledger must be updated with the two video sources, including:

- wonder ID
- title or description of clip
- source URL
- creator/author when available
- license
- local asset path
- notes on edits such as trimming, muting, resizing, or re-encoding

Tests should prove every video source ID resolves, every local video path exists, every source includes license and attribution text, and every video source appears in the source ledger.

## Reduced Motion And Accessibility

Reduced motion disables video playback and uses the existing sourced still image or static vignette. This applies to both Codex and ceremonies.

Video controls must be keyboard reachable and labeled. Pause/play state must be exposed in button text or ARIA labels. The video should include a descriptive accessible label tied to the wonder name and surface. The UI must not communicate state only through motion.

## Error Handling

Playback is opportunistic. On error, blocked autoplay, missing source, or unsupported format:

- replace the video with the existing still/static fallback
- keep all text and actions usable
- avoid throwing from UI render functions
- avoid persistent retry loops
- avoid logging noisy repeated errors every frame

Unsupported wonders simply do not receive `videoPreview` data.

## Performance

- Do not preload all videos at startup.
- Load Codex video only when rendering a supported page.
- Autoplay Codex video only while in view.
- Load ceremony video only for the active ceremony.
- Do not add per-frame polling.
- Do not perform runtime network requests.
- Do not read DOM, storage, or platform capability APIs from system presentation helpers.
- Do not introduce persistent mutable caches unless a later measured performance issue requires them.

## Privacy And Visibility

Video must follow the same viewer-safe rules as the surface that hosts it.

- Undiscovered natural wonders must not expose video records in Codex or ceremony views.
- Legendary videos appear only for owned/player-visible Codex or completion ceremony states already allowed by existing presentation helpers.
- Rival legendary completion intel must not unlock a video preview unless an existing viewer-safe page state explicitly allows the same level of visual presentation.
- UI must not derive video visibility from raw rival or hidden map state.

## Testing Requirements

Source and manifest tests:

- exactly two spike video records exist.
- one record targets a natural wonder and one targets a legendary wonder.
- every video record has a real wonder ID.
- every video record has `audio: 'silent'`.
- every video record has duration, size, format, MIME type, loop note, source URL, license, attribution, and local path.
- every video record resolves to an existing sourced still image fallback.
- every local video file exists.
- every video size is under the hard review threshold or the test fails.
- every video source appears in the human-readable source ledger.
- implementation verifies shipped files have no usable audio track when tooling is available; otherwise the PR must document how silence was confirmed.
- future `sfxCueId` may exist structurally but is not required and is not consumed.

Presentation tests:

- Codex page view models include `videoPreview` only for the supported, visible prototype entries.
- unsupported wonders keep existing image/vignette behavior.
- reduced-motion presentation exposes static fallback behavior.
- hidden/undiscovered natural wonders and unsafe rival legendary states do not expose videos.

UI tests:

- Codex renders a muted looped video with pause/play controls when `videoPreview` exists.
- Codex renders the existing still fallback when reduced motion is enabled.
- Codex handles video error by showing fallback content.
- natural discovery ceremony uses video as the main visual panel when available.
- legendary completion ceremony uses video as the main visual panel when available.
- ceremony actions remain reachable when video is present.
- reduced-motion ceremonies render static fallback instead of video.

Verification:

- targeted video source, Codex presentation, Codex UI, natural ceremony UI, and legendary ceremony UI tests
- source rule checks for changed `src/` files
- `./scripts/run-wonder-regressions.sh`
- `./scripts/run-with-mise.sh yarn build`
- `./scripts/run-with-mise.sh yarn test`
- if service worker, platform, Tauri, Vite, or manifest behavior changes, run the matching distribution checks required by `AGENTS.md`

## Acceptance Criteria

- Exactly two real, sourced, silent local video clips are added.
- The two prototypes cover one natural wonder and one legendary wonder.
- Videos render in Codex details for supported entries when motion is allowed.
- Videos render as main visual panels inside matching natural reveal and legendary completion ceremonies.
- Existing sourced still/static fallback appears for reduced motion and playback failure.
- No video audio plays and no SFX cue is consumed.
- Future SFX metadata has an explicit extension point.
- Source attribution is present in typed source data and the human-readable source ledger.
- Runtime playback uses local assets only.
- Asset-size and build-impact findings are documented in the PR.
- Existing unsupported wonders, privacy boundaries, gameplay rules, saves, audio system behavior, PWA behavior, and Tauri behavior remain unchanged unless a documented distribution adjustment is necessary and tested.
