# Unit SFX Coverage (#612)

A new or changed `UnitType` is checked against its own capabilities, not a roster. The enforcers:

| Contract | Mechanism |
|---|---|
| Every unit has the cues its capabilities need | `getUnitSfxRequirement` (`tests/audio/helpers/sfx-coverage-policy.ts`) derives them from `UNIT_DEFINITIONS` (strength, `attackProfile.kind`/`targets`) and `UNIT_ROLE_DEFINITIONS` (a role that counters nothing is self-defence only). `tests/audio/sfx-coverage.test.ts` fails with the unit and missing class. Never add a fixed count or a hand-kept roster. |
| The mapping mirrors what `SfxDirector` plays | attacker: `ranged-loose ?? siege-fire ?? attack-swing`; defender (its own entry): `attack-impact ?? ranged-impact ?? siege-impact`; removed: `death`. Non-offensive units (missionary, recon/patrol aircraft, balloon, scouts, spies, traders) get **death only** — never fabricate an attack cue. |
| Sharing a file is deliberate | Point several units at the SAME entry object (`sfx-catalog.ts` family consts). Every file played by >1 unit must fit inside one `INTENTIONAL_SFX_FAMILIES` entry; a stale family also fails. A bespoke batch (#425–#427, #714–#719) replaces one unit's mapping, not the family. |
| No placeholder aliases | no two catalog files may be byte-identical; `air-move-step.ogg` must differ from every other locomotion cue. |
| Assets are real | Ogg header parse: duration matches `loopEnd`, not silent. `scripts/validate-unit-sfx.sh` (ffmpeg) adds decode, mono 44.1 kHz, no tags, true peak ≤ −1 dBTP, no clipping, LUFS cap. |
| Provenance | `scripts/generate-unit-sfx.sh` is the only source for the files it names. Some cues are synthetic; others are derived from three CC0 OpenGameArt recordings that `scripts/fetch-unit-sfx-sources.sh` downloads with pinned SHA-256s (never committed). `docs/audio/unit-sfx-manifest.md` carries size/duration/LUFS/TP/SHA-256 and is pinned by the test; regenerate with `validate-unit-sfx.sh --write-manifest`. |

Playback always goes through `SfxDirector` → `AudioMixer` (viewer-gated, mute/volume, one-shot cross-cut ≈200 ms — put a cue's identifying transient in its first ~150 ms). Audio never touches gameplay, saves, RNG or AI. The service worker runtime-caches every fetched response and `preloadSfx` fetches `allSfxEntries()`, so a catalog entry is offline-ready without a precache edit.

Recorded material beats synthesis for guns and explosions (a pure-synthesis first pass was rejected by ear). Further external sources: Kenney CC0 first, then individually verified Freesound CC0/CC-BY; never CC-BY-NC, mirrors or free-tier generators. Record URL, creator, license, retrieval date, original and final SHA-256 in `AUDIO-CREDITS.md`.
