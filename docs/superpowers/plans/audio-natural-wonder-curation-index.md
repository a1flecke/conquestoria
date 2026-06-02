# Natural Wonder Audio Curation Index

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Source stinger + ambient-loop OGGs for all 9 pending natural wonders and add `CompleteNaturalWonderAudioEntry` records to `natural-wonder-audio-catalog.ts` until `FINAL_NATURAL_WONDER_AUDIO_COVERAGE = true`.

**Architecture:** Each wonder needs two CC0/CC-BY OGG files placed in `public/audio/wonders/`. An entry is added to `COMPLETE_ENTRIES` in `src/audio/natural-wonder-audio-catalog.ts`. When all 9 pending wonders are done, flip `FINAL_NATURAL_WONDER_AUDIO_COVERAGE` to `true` and add the 9 IDs to `MR5_NATURAL_WONDER_AUDIO_IDS` / `COMPLETE_NATURAL_WONDER_AUDIO_IDS`. Recommended pace: 2–3 wonders per MR, committed individually.

**Tech Stack:** TypeScript, ffmpeg, CC0/CC-BY audio sources (soundimage.org, freesound.org, kenney.nl)

**Reference:** Completed entries in `natural-wonder-audio-catalog.ts` (great_volcano, ancient_forest, coral_reef, sacred_mountain, crystal_caverns, aurora_fields) show the exact structure to follow.

---

## Pending Wonders (9 of 15)

| wonderId | soundMood | stinger target | ambient target |
|---|---|---|---|
| grand_canyon | `canyon-echo` | `audio/wonders/grand-canyon-stinger.ogg` | `audio/wonders/grand-canyon-ambient.ogg` |
| frozen_falls | `frozen-fall` | `audio/wonders/frozen-falls-stinger.ogg` | `audio/wonders/frozen-falls-ambient.ogg` |
| dragon_bones | `ancient-bones` | `audio/wonders/dragon-bones-stinger.ogg` | `audio/wonders/dragon-bones-ambient.ogg` |
| singing_sands | `singing-sand` | `audio/wonders/singing-sands-stinger.ogg` | `audio/wonders/singing-sands-ambient.ogg` |
| sunken_ruins | `sunken-ruin` | `audio/wonders/sunken-ruins-stinger.ogg` | `audio/wonders/sunken-ruins-ambient.ogg` |
| floating_islands | `floating-wind` | `audio/wonders/floating-islands-stinger.ogg` | `audio/wonders/floating-islands-ambient.ogg` |
| bioluminescent_bay | `glowing-bay` | `audio/wonders/bioluminescent-bay-stinger.ogg` | `audio/wonders/bioluminescent-bay-ambient.ogg` |
| bottomless_lake | `deep-lake` | `audio/wonders/bottomless-lake-stinger.ogg` | `audio/wonders/bottomless-lake-ambient.ogg` |
| eternal_storm | `distant-thunder` | `audio/wonders/eternal-storm-stinger.ogg` | `audio/wonders/eternal-storm-ambient.ogg` |

---

## Sourcing Notes Per Wonder

### grand_canyon — `canyon-echo`
- **Stinger:** A deep canyon resonance or wind-swept echo. Look for "canyon" or "echo" on soundimage.org or freesound.org (CC0).
- **Ambient loop:** Wide open wind with subtle reverb, 30–90s loopable. Try soundimage.org "outdoor wind" section.

### frozen_falls — `frozen-fall`
- **Stinger:** Ice crack or frozen waterfall trickle. freesound.org: search "ice crack" or "frozen water", CC0.
- **Ambient loop:** Slow trickle + cold wind, loopable. soundimage.org "winter" or "water" section.

### dragon_bones — `ancient-bones`
- **Stinger:** Deep resonant hum, bone rattle, or ancient cave echo. freesound.org: "bone rattle" CC0, or soundimage.org "mystery/dungeon".
- **Ambient loop:** Haunting cave ambience, 30–90s. soundimage.org "dungeon" or "cave" section.

### singing_sands — `singing-sand`
- **Stinger:** Light ethereal tone, subtle wind whistle, or harmonic hum. freesound.org: "sand dune singing" CC0.
- **Ambient loop:** Dry desert wind with faint harmonic tone, loopable. soundimage.org "desert" section.

### sunken_ruins — `sunken-ruin`
- **Stinger:** Underwater muffled boom or ancient structure creak. soundimage.org: "underwater" section; look for something with mystery/weight.
- **Ambient loop:** Underwater ambience, deep low hum, 20–80s. soundimage.org "underwater world" or similar.

### floating_islands — `floating-wind`
- **Stinger:** Ascending wind chime or magical lift sound. soundimage.org "fantasy" or "celestial" section.
- **Ambient loop:** High-altitude wind, gentle and mysterious, loopable. soundimage.org "atmospheric" section.

### bioluminescent_bay — `glowing-bay`
- **Stinger:** Shimmering water sparkle, gentle magical tone. soundimage.org "life-in-a-drop" type or "water sparkle" freesound CC0.
- **Ambient loop:** Gentle water lapping with subtle magical shimmer, 20–60s. soundimage.org "water/ocean" looping section.

### bottomless_lake — `deep-lake`
- **Stinger:** Deep reverberant tone, water echo, or low rumble. soundimage.org "deep water" or "mystery/depth". freesound.org "deep lake" CC0.
- **Ambient loop:** Still deep water ambience, low drone, 30–90s. soundimage.org "quiet tension" or "deep water".

### eternal_storm — `distant-thunder`
- **Stinger:** Distant thunder crack with long reverb tail. freesound.org: "thunder" CC0 (many available). Or soundimage.org "storm" section.
- **Ambient loop:** Continuous distant thunder rumble + wind, loopable, 30–90s. soundimage.org "storm" or "weather" section.

---

## Per-Wonder Checklist (repeat for each)

- [ ] Source stinger OGG (CC0/CC-BY, 2–6s, evocative of the soundMood)
- [ ] Source ambient loop OGG (CC0/CC-BY, 20–90s, cleanly loopable)
- [ ] Encode both: `ffmpeg -i input -af loudnorm=I=-14:TP=-1 -vn -c:a libvorbis -q:a 2 output.ogg`
- [ ] Copy to `public/audio/wonders/<wonder-id>-stinger.ogg` and `-ambient.ogg`
- [ ] Measure loop duration: `ffprobe -v quiet -show_entries format=duration -of csv=p=0 output.ogg`
- [ ] Add `CompleteNaturalWonderAudioEntry` to `COMPLETE_ENTRIES` in `src/audio/natural-wonder-audio-catalog.ts`:

```typescript
wonder_id: {
  wonderId: 'wonder_id',
  status: 'complete',
  soundMood: 'the-mood',        // from soundMood column above
  stinger: {
    id: 'wonder-id-stinger',
    file: 'audio/wonders/wonder-id-stinger.ogg',
    sourceId: 'source-identifier',  // e.g. 'soundimage-canyon-wind'
    gain: 0.72,                     // adjust by ear; typical range 0.65–0.85
  },
  ambientLoop: {
    id: 'wonder-id-ambient',
    file: 'audio/wonders/wonder-id-ambient.ogg',
    sourceId: 'source-identifier',
    gain: 0.28,                     // typical ambient gain 0.20–0.35
    loop: { loopStart: 0, loopEnd: <measured duration> },
    fadeInMs: 700,
    fadeOutMs: 550,
    mapFocusTimeoutMs: 12000,
  },
},
```

- [ ] Add attribution to `AUDIO-CREDITS.md` (required for CC-BY, optional but recommended for CC0)
- [ ] Run `bash scripts/run-with-mise.sh yarn test` → PASS
- [ ] Commit: `feat(audio): add <wonderId> natural wonder audio`

---

## Completion Gate

When all 9 wonders are complete, in `src/audio/natural-wonder-audio-catalog.ts`:

1. Add the 9 IDs to `MR5_NATURAL_WONDER_AUDIO_IDS` (or create `MR3_NATURAL_WONDER_AUDIO_IDS`
   matching the batch MR number used)
2. Add them to `COMPLETE_NATURAL_WONDER_AUDIO_IDS`
3. Flip the flag:

```typescript
export const FINAL_NATURAL_WONDER_AUDIO_COVERAGE = true;
```

4. Run full test + build:

```bash
bash scripts/run-with-mise.sh yarn test && bash scripts/run-with-mise.sh yarn build
```

5. Commit: `feat(audio): complete natural wonder audio coverage — FINAL_NATURAL_WONDER_AUDIO_COVERAGE = true`
