# Spec 1 — Asset Catalog and Curation Workflow

Subsection of [Spec 1 — Music Foundation](./2026-05-15-audio-overhaul-spec-1-music-foundation.md).

## Asset inventory

| Category | Count | Per-file size (est.) | Total |
|---|---|---|---|
| Era base loops (eras 1–5) | 5 | ~1.5 MB | ~7.5 MB |
| Civ accent loops (12 families, era-agnostic per Ac1) | 12 | ~500 KB | ~6 MB |
| War tension layers (one per era) | 5 | ~800 KB | ~4 MB |
| Stingers — era advance (1–5) | 5 | ~150 KB | ~0.75 MB |
| Stinger — city founded (generic) | 1 | ~120 KB | ~0.12 MB |
| Stinger — war declared (generic) | 1 | ~150 KB | ~0.15 MB |
| **Total** | **29 files** | | **~18.5 MB** |

Initial PWA install per L2 strategy: era 1 base + a default accent + war layer for era 1 + 7 stingers ≈ **~3 MB**. The remaining ~15 MB lazy-loads on demand and persists in the Service Worker cache.

## Musical constraints

Layered playback only sounds good if the simultaneously-playing files share a key and BPM zone. Practical constraints:

- **All era bases in the same key.** Likely D-minor or A-minor — most common "epic strategy" keys.
- **Era bases within ~20 BPM range** so era-advance crossfades don't lurch tempo.
- **Each war layer in the same key as its era base**, BPM = same or 2× (a faster war drum pattern on top of a slower base is fine).
- **Each civ accent compatible with every era base.** Same key constraint; sparse melodic content so it sits over any base without harmonic collision.
- **Era-advance stingers end on the tonic chord** of the new era's base so the crossfade lands musically (per Flow C).

## Curation order

The musical constraints determine the sequence:

1. **Era bases first** — establish the key and BPM zone for all layered content.
2. **War layers second** — each pairs with its era base.
3. **Civ accents third** — filtered to the bases' shared key.
4. **Stingers last** — tied to the era base they bridge to.

## Curation workflow (per-asset loop)

1. **Claude proposes a shortlist** of 3–5 candidates per slot:
   - Source URL (incompetech / soundimage / freesound / kenney / sonniss / freepd / musopen)
   - License (CC0 / CC-BY only — never SA/NC)
   - Author + track name
   - Length, BPM, key (where the source provides them; flagged as "unknown" otherwise)
   - One-sentence rationale
   - Direct preview link

2. **User listens and responds** with one of: ✅ this one / ❌ all of these / 🔁 closer but try X-flavored instead.

3. **On approval**, Claude:
   - Writes a `curl` or `wget` command for the user to run locally to download the source file.
   - Writes ffmpeg one-liners to convert to OGG Vorbis and trim to loop points if needed.
   - Adds the file at `public/audio/<category>/<id>.ogg` after the user runs the commands.
   - Adds an entry to `AUDIO-CREDITS.md`.
   - Updates the relevant `AudioCatalog` entry with real `bpm`, `key`, `loopStart`, `loopEnd`.
   - Commits the asset + credit + catalog update as a single MR.

4. **Verification before merge** — user runs `yarn dev`, plays through cold start + an era advance + war declaration + handoff, listens, confirms no audible glitches; user runs `yarn build` and `yarn test` and confirms exit 0.

## Source preferences

Initial sourcing targets (open to revision per shortlist quality):

- **Era bases** — Kevin MacLeod (incompetech.com). Largest historical/era catalog, CC-BY 4.0. Candidates from his "Cinematic" and "Tribal/World" sections for early eras; "Classical" and "Orchestral" for later eras.
- **War layers** — MacLeod and Eric Matyas (soundimage.org). Both have explicit "Battle" / "War" themed sections.
- **Civ accents** — Eric Matyas (soundimage.org). His "World/Cultural" section has Asian, Middle Eastern, African, Latin American, Celtic, and fantasy-friendly tracks. Strong fit for the 12-family grouping.
- **Stingers** — Kenney.nl (CC0, no attribution) and Sonniss GDC bundles (royalty-free game audio). Short cinematic stingers are well-represented.
- **Public domain fallbacks** — freepd.com and musopen.org for any slot where CC0 is preferred.

## Honest limits

- Claude cannot listen to audio or analyze BPM/key from a URL. The shortlist filters on metadata, author reputation, and track descriptions. The user provides the ear.
- For BPM/key analysis of approved tracks, the user runs `aubio` or a free web BPM-detection tool, or accepts the author's stated values where provided.
- The ffmpeg trim/loop step is mechanical. Claude writes the exact commands; the user runs them.

## Attribution file

`AUDIO-CREDITS.md` lives at the repo root. Required by CC-BY. One entry per track:

```
- "Bronze Age Theme" by Kevin MacLeod (incompetech.com)
  Licensed under CC-BY 4.0 — https://creativecommons.org/licenses/by/4.0/
  Source: https://incompetech.com/music/royalty-free/...
  Modified: trimmed to 64s loop, transposed to D-minor
```

The "Modified" line is required by CC-BY when the track was edited; "Modified: none" if used as-is.

## Placeholder-OGG strategy

Spec 1's implementation MR ships with **silent placeholder OGGs** at every catalog path. Each is a 1-byte OGG header + valid 0-sample buffer, ~50 bytes per file. The catalog's `loopStart` and `loopEnd` are set to placeholder values (e.g., 0 and 30 seconds) so the engine's loop scheduling code is exercised.

Behavior with silent placeholders:
- Mixer initializes correctly, fades buses normally, plays "stingers" that are silent.
- No hum (the procedural drone is deleted).
- No console errors — silent placeholders are valid AudioBuffers.

The curation MR series replaces placeholder files one at a time. Each curation MR:
- Replaces one (or a few related) placeholder OGGs with real audio.
- Updates the matching `AudioCatalog` entry's metadata.
- Adds the attribution entry.
- Includes a short test confirming the OGG file is parseable (already covered by `audio-catalog.test.ts` — see [testing doc](./2026-05-15-audio-overhaul-spec-1-testing.md)).

## Why this curation strategy is safe

Per `.claude/rules/incremental-mr-completion.md`: when Spec 1 merges with only placeholder audio, the player-visible surface is "no hum + silent audio." That is an honest incremental delivery — the bug (the hum) is fixed, and silence is not a half-built feature. No feature flag required. The curation MR series progressively improves the surface from silent to full-quality without any flip-of-a-switch moment.
