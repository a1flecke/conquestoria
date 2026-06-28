# Audio Remaining Work — Consolidated Plan

> **For agentic workers:** Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Audit date:** 2026-06-28

**What's complete (the full list):**
- Spec 1 (music foundation infrastructure, all 4 MRs) ✅
- Spec 2 (SFX catalog + director + curation for eras 1-5, all 3 MRs) ✅
- Spec 3 (adaptive music + voice system + mixer UI, all 4 MRs) ✅
- Natural wonder audio all 15 wonders (`FINAL_NATURAL_WONDER_AUDIO_COVERAGE = true`) ✅
- Legendary beasts MR8 (roar SFX, beast-territory layer, AI hunting, balance tests) ✅
- Era advance stinger wired in `MusicDirector.handleEraAdvanced()` ✅
- Era bases eras 1-5, war layers 1-5, unrest/defeat/beast-territory adaptive layers ✅
- All 13 accent tracks (civ-specific background layers) ✅
- All stingers (era-advance 1-5, era-transition-cue 1-5, city-founded, war-declared, wonder-built, tech-researched, peace-signed, civ-defeated, victory, defeat) ✅
- Non-beast combat SFX all eras 1-5 units ✅
- Spy death SFX (5 types) ✅
- Naval transport SFX (load, unload) ✅
- Pirate SFX + stingers (all 6 ship types + 6 strategic stingers) ✅
- Voice packs: generic, china, egypt, rome, england, france, viking (70/110 lines real) ✅

**What remains (this plan, in priority order):**

---

## Priority 1: Voice Curation — 4 Remaining Civs

**Why first:** Voice lines fire on every major game event (era advance, war declared, wonder built, etc.). Silent packs fall back to `generic`, so gameplay is functional, but Zulu/Aztec/Mongolia/Gondor players hear a generic English voice instead of their civ's character.

**Method:** ElevenLabs — same approach as England/France/Viking (MR3). Scripts live in `scripts/synthesise-elevenlabs.py`. For each civ:
1. Add a `VOICE_NAMES` entry (ElevenLabs voice name → ID)
2. Add a `SCRIPTS` block (10 event→text pairs)
3. Run `python scripts/synthesise-elevenlabs.py --dry-run` to preview
4. Run `python scripts/synthesise-elevenlabs.py --pack <civ>` to generate OGGs
5. OGGs land at `public/audio/voice/<civ>/<event>.ogg` automatically
6. Add attribution to `AUDIO-CREDITS.md`
7. `bash scripts/run-with-mise.sh yarn test` → PASS
8. Commit + PR

**Encoding convention:** The script uses ffmpeg to convert ElevenLabs MP3 → OGG at `-q:a 4`. This is correct — do not change.

**Attribution:** Add to `AUDIO-CREDITS.md` under a "Voice Lines" section: `<civ>/*.ogg — synthesised via ElevenLabs API (eleven_multilingual_v2 model), voice: <voice-name>.`

---

### Voice MR1: Zulu

- [ ] **Step 1: Choose an ElevenLabs voice for Zulu**

  Look for a deep, authoritative voice with an African accent or a resonant bass delivery. Options to try in ElevenLabs voice library: search "Zulu", "African", "deep African male". Pick one voice name and note it.

- [ ] **Step 2: Write the Zulu scripts**

  Add to `scripts/synthesise-elevenlabs.py` VOICE_NAMES + SCRIPTS:

  ```python
  VOICE_NAMES = {
      ...
      "zulu": "<chosen-voice-name>",
  }

  SCRIPTS = {
      ...
      "zulu": {
          "era-advance":    "Our warriors' footsteps shake the earth as we march into a new age.",
          "city-founded":   "A new kraal is established. Let our people grow strong here.",
          "war-declared":   "The impi is ready. No enemy can stand before us.",
          "tech-completed": "Our knowledge grows. The Zulu nation is unstoppable.",
          "wonder-built":   "This monument shall inspire our people for generations.",
          "wonder-lost":    "They have taken what is ours. We will reclaim it.",
          "city-lost":      "A kraal has fallen. Rise and avenge it.",
          "near-defeat":    "We have survived before. The Zulu do not break.",
          "victory":        "The earth trembles at the name of the Zulu. As it should.",
          "peace-signed":   "We grant them time. Let them use it wisely.",
      },
  }
  ```

- [ ] **Step 3: Generate**

  ```bash
  python scripts/synthesise-elevenlabs.py --dry-run --pack zulu
  python scripts/synthesise-elevenlabs.py --pack zulu
  ```

- [ ] **Step 4: Listen to output**

  Spot-check 2-3 lines in a browser or `ffplay`. If a line sounds wrong, regenerate with `--force` or edit the text and rerun.

- [ ] **Step 5: Credits + test + commit**

  ```bash
  bash scripts/run-with-mise.sh yarn test
  git add public/audio/voice/zulu scripts/synthesise-elevenlabs.py AUDIO-CREDITS.md
  git commit -m "feat(audio): curate Zulu voice pack — 10 advisor lines"
  ```

---

### Voice MR2: Aztec

Same process as Zulu. Voice character: fierce, ceremonial, slightly grave.

- [ ] **Step 1: Choose ElevenLabs voice** — search "Aztec", "warrior", "ceremonial". Pick a voice with gravitas.

- [ ] **Step 2: Write scripts**

  ```python
  "aztec": "<chosen-voice-name>",

  "aztec": {
      "era-advance":    "The sun demands tribute. We answer with a new age.",
      "city-founded":   "The gods smile on this place. Build the temples.",
      "war-declared":   "The sacred flowery war begins. Capture them for the sun.",
      "tech-completed": "Our priests have unlocked new sacred knowledge.",
      "wonder-built":   "The gods are pleased. The pyramid rises.",
      "wonder-lost":    "They have defiled what the gods gave us.",
      "city-lost":      "A sacred city has fallen. We will retake it.",
      "near-defeat":    "We are still here. The sun has not abandoned us.",
      "victory":        "The fifth sun shines on our empire. It is our time.",
      "peace-signed":   "The war rests. For now.",
  },
  ```

- [ ] **Step 3-5:** Generate → listen → credits + test + commit as above.

---

### Voice MR3: Mongolia

Voice character: commanding, vast-horizon confidence, measured aggression.

- [ ] **Step 1: Choose ElevenLabs voice** — search "Mongolian", "steppe", "Khan". Deep confident male voice.

- [ ] **Step 2: Write scripts**

  ```python
  "mongolia": "<chosen-voice-name>",

  "mongolia": {
      "era-advance":    "The horizon retreats before us. A new era is ours to claim.",
      "city-founded":   "Another city bends to the Great Khan's will.",
      "war-declared":   "The horde moves. Nothing stands for long.",
      "tech-completed": "Our scouts have returned with knowledge that changes everything.",
      "wonder-built":   "Even stone submits to the Khan.",
      "wonder-lost":    "They will regret this. We do not forget.",
      "city-lost":      "A city lost is a city to be recaptured.",
      "near-defeat":    "The steppe has seen worse. We adapt.",
      "victory":        "From the rising sun to the setting sea — all of it, ours.",
      "peace-signed":   "The horses need rest. But only briefly.",
  },
  ```

- [ ] **Step 3-5:** Generate → listen → credits + test + commit as above.

---

### Voice MR4: Gondor

Voice character: noble, weary, epic fantasy register. Think Tolkien-flavored high fantasy.

- [ ] **Step 1: Choose ElevenLabs voice** — search "noble", "fantasy", "British noble". Resonant, dignified, older-sounding.

- [ ] **Step 2: Write scripts**

  ```python
  "gondor": "<chosen-voice-name>",

  "gondor": {
      "era-advance":    "The White Tree blooms anew. Our kingdom enters a greater age.",
      "city-founded":   "Another beacon of civilization is raised against the shadow.",
      "war-declared":   "Gondor has called for aid. Now let Gondor answer with steel.",
      "tech-completed": "The loremasters have uncovered what was long forgotten.",
      "wonder-built":   "A monument to those who came before, and those who will follow.",
      "wonder-lost":    "The darkness has taken much from us. We do not yield.",
      "city-lost":      "A bastion has fallen. The line must hold elsewhere.",
      "near-defeat":    "Even in the final hour, Gondor does not break.",
      "victory":        "The age of Men endures. As it was always meant to.",
      "peace-signed":   "We accept this peace, though our eyes remain open.",
  },
  ```

- [ ] **Step 3-5:** Generate → listen → credits + test + commit as above.

---

## Priority 2: Era 6-12 Combat SFX

**Why second:** Combat happens every game at every era. Silent attacks and deaths for 14 unit types (cannon, grenadier, rifleman, ironclad, machine_gunner, pre_dreadnought, tank, submarine, biplane, jet_fighter, carrier, attack_helicopter, missile_submarine, observation_balloon) are jarring.

**Mechanics:** `UNIT_SFX` is a `Partial<>` map — no coverage test failure for missing entries. New entries use `real()`. No changes to `SfxDirector` needed — it already routes all unit types.

**Observation_balloon**: cannot attack (confirmed in unit descriptions). Death sound only.
**Carrier**: naval combat unit. Needs attack-swing, attack-impact, death.

**Sourcing approach:**
- Kenney CC0: `kenney_impact-sounds`, `kenney_rpg-audio`, `kenney_sci-fi-sounds`
- ffmpeg synthesis for futuristic/air units (same pattern as beast SFX)
- All SFX encoded: `ffmpeg -i input -af loudnorm=I=-14:TP=-1 -vn -c:a libvorbis -q:a 3 output.ogg`
- Attribution in `AUDIO-CREDITS.md`

---

### SFX MR1: Era 6 Land Units (cannon, grenadier, rifleman)

**Files to create** (11 OGGs in `public/audio/sfx/`):
- cannon: `cannon-siege-fire.ogg`, `cannon-siege-impact.ogg`, `cannon-death.ogg`
- grenadier: `grenadier-attack-swing.ogg`, `grenadier-ranged-loose.ogg`, `grenadier-ranged-impact.ogg`, `grenadier-death.ogg`
- rifleman: `rifleman-attack-swing.ogg`, `rifleman-ranged-loose.ogg`, `rifleman-ranged-impact.ogg`, `rifleman-death.ogg`

- [ ] **Step 1: Source cannon SFX**

  Download Kenney Impact Sounds (`kenney_impact-sounds.zip`). Look for:
  - `cannon-siege-fire.ogg`: heavy artillery boom (cannon blast)
  - `cannon-siege-impact.ogg`: distant explosion
  - `cannon-death.ogg`: wood splintering or unit collapse (reuse a humanoid death variant)

  ```bash
  mkdir -p /tmp/kenney && curl -fSL "https://kenney.nl/content/assets/kenney_impact-sounds.zip" -o /tmp/kenney/impact.zip
  cd /tmp/kenney && unzip impact.zip
  # Browse /tmp/kenney/Impact Sounds/ for suitable files
  ```

- [ ] **Step 2: Source grenadier + rifleman SFX**

  From `kenney_rpg-audio.zip` or `kenney_impact-sounds.zip`:
  - `attack-swing`: musket/pistol cock or short wind-up sound
  - `ranged-loose`: flintlock fire / gunshot crack
  - `ranged-impact`: bullet impact thud (leather+flesh)
  - `death`: humanoid death (reuse closest Kenney human death)

  ```bash
  curl -fSL "https://kenney.nl/content/assets/kenney_rpg-audio.zip" -o /tmp/kenney/rpg.zip
  cd /tmp/kenney && unzip rpg.zip
  ```

- [ ] **Step 3: Encode all 11 files**

  ```bash
  # Example for each file:
  ffmpeg -y -i "/tmp/kenney/<source-file>" -af "loudnorm=I=-14:TP=-1" -vn -c:a libvorbis -q:a 3 public/audio/sfx/cannon-siege-fire.ogg
  # Repeat for each of the 11 files
  ```

- [ ] **Step 4: Add catalog entries to `src/audio/sfx-catalog.ts`**

  Add inside `UNIT_SFX` (after the siege section, before the non-combat section):

  ```typescript
  // === Era 6 Land (attack/siege/ranged + death) ===
  cannon: {
    'siege-fire':   real('sfx-cannon-siege-fire',   'audio/sfx/cannon-siege-fire.ogg',   <duration>),
    'siege-impact': real('sfx-cannon-siege-impact', 'audio/sfx/cannon-siege-impact.ogg', <duration>),
    death:          real('sfx-cannon-death',         'audio/sfx/cannon-death.ogg',         <duration>, 'death'),
  },
  grenadier: {
    'attack-swing':  real('sfx-grenadier-attack-swing',  'audio/sfx/grenadier-attack-swing.ogg',  <duration>),
    'ranged-loose':  real('sfx-grenadier-ranged-loose',  'audio/sfx/grenadier-ranged-loose.ogg',  <duration>),
    'ranged-impact': real('sfx-grenadier-ranged-impact', 'audio/sfx/grenadier-ranged-impact.ogg', <duration>),
    death:           real('sfx-grenadier-death',          'audio/sfx/grenadier-death.ogg',          <duration>, 'death'),
  },
  rifleman: {
    'attack-swing':  real('sfx-rifleman-attack-swing',  'audio/sfx/rifleman-attack-swing.ogg',  <duration>),
    'ranged-loose':  real('sfx-rifleman-ranged-loose',  'audio/sfx/rifleman-ranged-loose.ogg',  <duration>),
    'ranged-impact': real('sfx-rifleman-ranged-impact', 'audio/sfx/rifleman-ranged-impact.ogg', <duration>),
    death:           real('sfx-rifleman-death',          'audio/sfx/rifleman-death.ogg',          <duration>, 'death'),
  },
  ```

  Duration = `ffprobe -v quiet -show_entries format=duration -of csv=p=0 <file>` rounded to 3 decimals.

- [ ] **Step 5: Test + commit**

  ```bash
  bash scripts/run-with-mise.sh yarn test tests/audio/sfx-catalog.test.ts
  bash scripts/run-with-mise.sh yarn build
  git add public/audio/sfx/cannon*.ogg public/audio/sfx/grenadier*.ogg public/audio/sfx/rifleman*.ogg src/audio/sfx-catalog.ts AUDIO-CREDITS.md
  git commit -m "feat(audio): era 6 land SFX — cannon, grenadier, rifleman"
  ```

---

### SFX MR2: Era 6-7 Naval + Machine Gunner (ironclad, machine_gunner, pre_dreadnought)

**Files to create** (10 OGGs):
- ironclad: `ironclad-attack-swing.ogg`, `ironclad-attack-impact.ogg`, `ironclad-death.ogg`
- machine_gunner: `machine_gunner-attack-swing.ogg`, `machine_gunner-ranged-loose.ogg`, `machine_gunner-ranged-impact.ogg`, `machine_gunner-death.ogg`
- pre_dreadnought: `pre_dreadnought-attack-swing.ogg`, `pre_dreadnought-attack-impact.ogg`, `pre_dreadnought-death.ogg`

- [ ] **Step 1: Source naval SFX** — Kenney Impact Sounds for ship cannons + explosion sounds. Pre-dreadnought is heavier/louder than ironclad.

- [ ] **Step 2: Source machine_gunner SFX** — Kenney RPG Audio for rapid-fire: attack-swing=aim click, ranged-loose=burst fire, ranged-impact=hit. Or synthesize with ffmpeg noise burst.

  ```bash
  # Machine gun burst — synthesized
  ffmpeg -y -f lavfi -i "anoisesrc=color=white:duration=0.25:amplitude=0.6" \
    -filter_complex "highpass=f=1000,lowpass=f=4000,afade=t=in:st=0:d=0.02,afade=t=out:st=0.18:d=0.07,volume=1.5" \
    public/audio/sfx/machine_gunner-ranged-loose.ogg
  ```

- [ ] **Step 3-5:** Encode → catalog entries → test → commit as MR1 pattern.

---

### SFX MR3: Modern + Air Units (tank, submarine, carrier, observation_balloon, biplane, jet_fighter, attack_helicopter, missile_submarine)

**Files to create** (22 OGGs):
- tank: `tank-siege-fire.ogg`, `tank-siege-impact.ogg`, `tank-death.ogg`
- submarine: `submarine-attack-swing.ogg`, `submarine-attack-impact.ogg`, `submarine-death.ogg`
- observation_balloon: `observation_balloon-death.ogg` (cannot attack)
- carrier: `carrier-attack-swing.ogg`, `carrier-attack-impact.ogg`, `carrier-death.ogg`
- biplane: `biplane-attack-swing.ogg`, `biplane-attack-impact.ogg`, `biplane-death.ogg`
- jet_fighter: `jet_fighter-attack-swing.ogg`, `jet_fighter-attack-impact.ogg`, `jet_fighter-death.ogg`
- attack_helicopter: `attack_helicopter-attack-swing.ogg`, `attack_helicopter-attack-impact.ogg`, `attack_helicopter-death.ogg`
- missile_submarine: `missile_submarine-attack-swing.ogg`, `missile_submarine-attack-impact.ogg`, `missile_submarine-death.ogg`

- [ ] **Step 1: Download Kenney Sci-Fi Sounds** for futuristic units:

  ```bash
  curl -fSL "https://kenney.nl/content/assets/kenney_sci-fi-sounds.zip" -o /tmp/kenney/scifi.zip
  cd /tmp/kenney && unzip scifi.zip
  ```

  Assign: jet/helicopter/missile sounds → air units; submarine torpedo → submarine + missile_submarine.

- [ ] **Step 2: Synthesize remaining**

  **Tank** (heavy, mechanical):
  ```bash
  # Tank siege-fire: low boom + rattle
  ffmpeg -y -f lavfi -i "sine=frequency=60:duration=0.8" -f lavfi -i "anoisesrc=color=brown:duration=0.8:amplitude=0.5" \
    -filter_complex "[0]vibrato=f=3:d=0.5,afade=t=out:st=0.3:d=0.5[a];[1]lowpass=f=800[b];[a][b]amix=2,afade=t=in:st=0:d=0.02,volume=1.6" \
    public/audio/sfx/tank-siege-fire.ogg
  ```

  **Biplane** (propeller, machine gun):
  ```bash
  # Biplane attack-swing: prop rattle + aim
  ffmpeg -y -f lavfi -i "anoisesrc=color=pink:duration=0.35:amplitude=0.4" \
    -filter_complex "bandpass=f=800:width_type=o:w=2,afade=t=in:st=0:d=0.05,afade=t=out:st=0.2:d=0.15,volume=1.2" \
    public/audio/sfx/biplane-attack-swing.ogg
  ```

  **Observation balloon death**: light pop + fabric tear
  ```bash
  ffmpeg -y -f lavfi -i "anoisesrc=color=white:duration=0.6:amplitude=0.5" \
    -filter_complex "highpass=f=2000,afade=t=in:st=0:d=0.02,afade=t=out:st=0.2:d=0.4,volume=1.1" \
    public/audio/sfx/observation_balloon-death.ogg
  ```

- [ ] **Step 3: Catalog entries** for `observation_balloon` (death only):

  ```typescript
  observation_balloon: { death: real('sfx-observation_balloon-death', 'audio/sfx/observation_balloon-death.ogg', <dur>, 'death') },
  ```

  All other new units: attack-swing + attack-impact (or siege-fire + siege-impact) + death.

- [ ] **Step 4: Test + commit**

  ```bash
  bash scripts/run-with-mise.sh yarn test && bash scripts/run-with-mise.sh yarn build
  git add public/audio/sfx/tank*.ogg public/audio/sfx/submarine*.ogg public/audio/sfx/carrier*.ogg \
    public/audio/sfx/biplane*.ogg public/audio/sfx/jet_fighter*.ogg public/audio/sfx/attack_helicopter*.ogg \
    public/audio/sfx/missile_submarine*.ogg public/audio/sfx/observation_balloon*.ogg \
    src/audio/sfx-catalog.ts AUDIO-CREDITS.md
  git commit -m "feat(audio): modern + air SFX — tank, sub, carrier, biplane, jet, helicopter, missile_sub, balloon"
  ```

---

## Priority 3: Era 6-12 Music

**Why this complexity exists:** The `EraId` type is `1 | 2 | 3 | 4 | 5` and `resolveEra()` hard-clamps anything ≥5 to 5. To support real era 6-12 music, both the type and all era-keyed catalog Records must expand. This is a code change + asset sourcing effort.

**Game currently has eras 1-8 active** (confirmed by "era-8" commits).

**Architecture:** Two-MR approach — MR0 expands the type system and ships placeholder OGGs; curation MRs replace them.

---

### Music MR0: Architecture + Placeholder OGGs (code-only, no real audio)

**Files:**
- Modify: `src/audio/audio-catalog.ts`
- Create: 21 placeholder OGGs (era6-8 base × 3, era6-8 war × 3, era6-8 unrest × 3, era6-8 defeat × 3, era6-8 advance stinger × 3, era6-8 transition-cue × 3) = 18 OGGs + 3 era-bases

- [ ] **Step 1: Expand `EraId` type**

  In `src/audio/audio-catalog.ts`:
  ```typescript
  export type EraId = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  ```

  Update `resolveEra()`:
  ```typescript
  export function resolveEra(era: number): EraId {
    if (era <= 1) return 1;
    if (era >= 8) return 8;
    return era as EraId;
  }
  ```

- [ ] **Step 2: Add placeholder entries for eras 6-8**

  In `ERA_BASE`, `WAR_LAYER`, `UNREST_LAYER`, `DEFEAT_LAYER`, and `STINGER.eraAdvance` / `STINGER.eraTransitionCue`, add records 6, 7, 8 using `ph()`.

  Example (repeat for all era-keyed Records):
  ```typescript
  export const ERA_BASE: Record<EraId, TrackEntry> = {
    // existing eras 1-5 unchanged
    6: ph('era6-base', 'audio/era/era6-base.ogg', 180),
    7: ph('era7-base', 'audio/era/era7-base.ogg', 180),
    8: ph('era8-base', 'audio/era/era8-base.ogg', 180),
  };
  ```

- [ ] **Step 3: Generate silent placeholder OGGs**

  ```bash
  for era in 6 7 8; do
    ffmpeg -y -f lavfi -i "anullsrc=r=44100:cl=stereo" -t 30 -c:a libvorbis -q:a 0 public/audio/era/era${era}-base.ogg
    ffmpeg -y -f lavfi -i "anullsrc=r=44100:cl=stereo" -t 30 -c:a libvorbis -q:a 0 public/audio/war/era${era}-war.ogg
    ffmpeg -y -f lavfi -i "anullsrc=r=44100:cl=stereo" -t 30 -c:a libvorbis -q:a 0 public/audio/adaptive/era${era}-unrest.ogg
    ffmpeg -y -f lavfi -i "anullsrc=r=44100:cl=stereo" -t 30 -c:a libvorbis -q:a 0 public/audio/adaptive/era${era}-defeat.ogg
    ffmpeg -y -f lavfi -i "anullsrc=r=44100:cl=stereo" -t 5 -c:a libvorbis -q:a 0 public/audio/stinger/era${era}-advance.ogg
    ffmpeg -y -f lavfi -i "anullsrc=r=44100:cl=stereo" -t 2 -c:a libvorbis -q:a 0 public/audio/stinger/era${era}-transition-cue.ogg
  done
  ```

- [ ] **Step 4: Update `public/sw.js`** — add the 6 new era-base/war OGGs to `PRECACHE_URLS`.

- [ ] **Step 5: Test + build + commit**

  ```bash
  bash scripts/run-with-mise.sh yarn test && bash scripts/run-with-mise.sh yarn build
  git commit -m "feat(audio): expand EraId to 8, placeholder OGGs for eras 6-8"
  ```

---

### Music MR1-3: Curation (replace placeholders with real tracks)

One MR per era cluster: MR1 = era 6, MR2 = era 7, MR3 = era 8.

**Sources:** Kevin MacLeod (incompetech.com, CC-BY 3.0), Soundimage (soundimage.org, free use), Free Music Archive (CC0/CC-BY).

**Musical progression guidance:**
- Era 6 (Industrial): heavier orchestral, minor key, driving percussion (e.g., Kevin MacLeod "Toccata and Fugue in D Minor" style)
- Era 7 (Modern): military march, darker tone, brass-heavy
- Era 8 (Contemporary): cinematic orchestral tension, modern percussion

**Per MR, per track:**

- [ ] Source era N base track (2–4 min, loopable, matches musical era)
- [ ] Source era N war layer (tension/action, same key as base or relative minor, loopable)
- [ ] Source era N unrest layer (reuse eras 1-5 pattern: same "Darkness Approaches" track or similar atonal loop)
- [ ] Source era N defeat layer (reuse eras 1-5 pattern: "Anguish" or similar)
- [ ] Source era N advance stinger (4-5s fanfare — Kevin MacLeod "big hit" type)
- [ ] Source era N transition-cue stinger (1.5-2s brief fanfare)
- [ ] Encode all: `ffmpeg -i input -af loudnorm=I=-14:TP=-1 -vn -c:a libvorbis -q:a 4 output.ogg`
- [ ] Measure loop duration: `ffprobe -v quiet -show_entries format=duration -of csv=p=0 output.ogg`
- [ ] Update catalog entries (replace `ph()` with `real()` with actual bpm, key, loopEnd)
- [ ] Update `AUDIO-CREDITS.md`
- [ ] `bash scripts/run-with-mise.sh yarn test && bash scripts/run-with-mise.sh yarn build`
- [ ] `git commit -m "feat(audio): curate era N music — base + war + stingers"`

---

## Housekeeping

- [ ] **Close GitHub issue #3** ("Music is not great — a lot of hum in the stone age")

  The procedural drone bug was fixed in Spec 1 MR4 (deleted `src/audio/music-generator.ts` + `src/audio/audio-manager.ts` and replaced with `AudioSystem` + `MusicDirector`). Era 1 base track is now a real curated OGG (C#-minor, 165s loop). The issue is resolved. Close with comment linking to the Spec 1 MR.

---

## Summary Table

| Work item | Unit | Status | Priority |
|---|---|---|---|
| Voice: Zulu | 10 ElevenLabs lines | Not started | P1 |
| Voice: Aztec | 10 ElevenLabs lines | Not started | P1 |
| Voice: Mongolia | 10 ElevenLabs lines | Not started | P1 |
| Voice: Gondor | 10 ElevenLabs lines | Not started | P1 |
| SFX MR1: cannon + grenadier + rifleman | 11 OGGs + catalog | Not started | P2 |
| SFX MR2: ironclad + machine_gunner + pre_dreadnought | 10 OGGs + catalog | Not started | P2 |
| SFX MR3: modern/air (8 unit types) | 22 OGGs + catalog | Not started | P2 |
| Music MR0: EraId expand to 8, placeholders | Code + 18 OGGs | Not started | P3 |
| Music MR1: Era 6 curation | 6 tracks curated | Not started | P3 |
| Music MR2: Era 7 curation | 6 tracks curated | Not started | P3 |
| Music MR3: Era 8 curation | 6 tracks curated | Not started | P3 |
| Close issue #3 | GitHub | Not started | Housekeeping |
