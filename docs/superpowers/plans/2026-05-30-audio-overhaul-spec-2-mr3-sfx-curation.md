# Spec 2 MR3: SFX Audio Curation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace 65 silent SFX placeholders with real CC0/CC-BY audio assets, add 5 spy-type death entries to the SFX catalog, and create two tracking plan docs for deferred audio work.

**Architecture:** Audio sourced from Kenney CC0 packs via direct ZIP download + ffmpeg re-encode at -14 LUFS. Task B (spy entries) is pure TypeScript + placeholder OGG copy. Task C is docs-only. SfxDirector gains a `unit:created` subscription to cache mid-game trained units.

**Tech Stack:** TypeScript, ffmpeg 8.0.1 (on PATH), OGG/Vorbis, vitest, Kenney CC0 packs

---

## Files

### Modified
- `src/audio/sfx-catalog.ts` — add 5 spy death entries; update `bpm`, `key`, `loop.loopEnd` for each real file sourced
- `tests/audio/sfx-catalog.test.ts` — update entry count 65 → 70; add spy-types and non-combat tests
- `public/audio/sfx/*.ogg` — replace 65 silent stubs with real audio; add 5 spy death stubs
- `AUDIO-CREDITS.md` — add CC-BY attribution for any non-CC0 asset; CC0 entries added for traceability

### Created
- `docs/superpowers/plans/audio-era-advance-stinger-wiring.md` — Task C1 tracking plan
- `docs/superpowers/plans/audio-natural-wonder-curation-index.md` — Task C2 tracking plan

---

## Background: Kenney Pack Download Pattern

All Kenney assets are CC0 (public domain). ZIP files can be fetched directly:

```bash
mkdir -p /tmp/kenney-audio
# Check exact URL via WebSearch "kenney impact sounds zip download" if these 404
curl -fSL "https://kenney.nl/content/assets/kenney_impact-sounds.zip" -o /tmp/kenney-audio/impact.zip
curl -fSL "https://kenney.nl/content/assets/kenney_rpg-audio.zip"     -o /tmp/kenney-audio/rpg.zip
```

If the URLs 404, use WebFetch on `https://kenney.nl/assets/impact-sounds` to find the actual download href, then re-run curl with the correct URL.

Standard ffmpeg encode command (used for all replacements):
```bash
ffmpeg -i INPUT.wav -af loudnorm=I=-14:TP=-1 -vn -c:a libvorbis -q:a 2 OUTPUT.ogg
# For clips < 0.5s use -q:a 4 instead of -q:a 2
```

---

## Task 1: Spy Death Catalog Entries (Task B — TDD)

Adds catalog entries and placeholder OGGs for the 5 spy unit types. These are deferred from MR1/2 because real audio wasn't sourced yet; placeholder OGGs are acceptable here per the MR3 spec. The test integrity suite (`on-disk OGG integrity`) will pass as long as each file exists and has OGG magic bytes.

**Files:**
- Modify: `src/audio/sfx-catalog.ts` (after the non-combat section, ~line 138)
- Modify: `tests/audio/sfx-catalog.test.ts` (count assertion + new spy test)
- Create: `public/audio/sfx/spy_scout-death.ogg`
- Create: `public/audio/sfx/spy_informant-death.ogg`
- Create: `public/audio/sfx/spy_agent-death.ogg`
- Create: `public/audio/sfx/spy_operative-death.ogg`
- Create: `public/audio/sfx/spy_hacker-death.ogg`

- [ ] **Step 1: Write failing tests**

In `tests/audio/sfx-catalog.test.ts`, add `SPY_TYPES` constant near the top (after `SIEGE_TYPES`):

```typescript
const SPY_TYPES: UnitType[] = ['spy_scout', 'spy_informant', 'spy_agent', 'spy_operative', 'spy_hacker'];
```

Add this `it` block inside `describe('sfx-catalog completeness')`, after the existing siege test:

```typescript
it('every spy type has a death entry', () => {
  for (const unitType of SPY_TYPES) {
    const sfx = UNIT_SFX[unitType];
    expect(sfx, `UNIT_SFX missing for ${unitType}`).toBeDefined();
    expect(sfx!['death'], `${unitType} missing death`).toBeDefined();
  }
});
```

Also update the count test — change the description and the count:

```typescript
it('allSfxEntries returns exactly 70 entries', () => {
  // 18 foot-melee (6×3) + 8 foot-ranged (2×4) + 9 mounted (3×3) + 6 naval combat (2×3)
  // + 6 siege (2×3) + 9 special-combat (3×3) + 6 non-combat (6×1) + 5 spy-death (5×1) + 3 move-step = 70
  expect(allSfxEntries()).toHaveLength(70);
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
bash scripts/run-with-mise.sh yarn test tests/audio/sfx-catalog.test.ts
```
Expected: FAIL — "every spy type has a death entry" fails with `UNIT_SFX missing for spy_scout`; count test fails with `expected 65 to equal 70`.

- [ ] **Step 3: Add spy death entries to sfx-catalog.ts**

In `src/audio/sfx-catalog.ts`, after `expedition: { death: ph('sfx-expedition-death', 'audio/sfx/expedition-death.ogg') },` (the last non-combat line, currently ~line 137), add:

```typescript
  // === Spy Types (death only — spies are dispatched, never attack directly) ===
  spy_scout:     { death: ph('sfx-spy_scout-death',     'audio/sfx/spy_scout-death.ogg') },
  spy_informant: { death: ph('sfx-spy_informant-death', 'audio/sfx/spy_informant-death.ogg') },
  spy_agent:     { death: ph('sfx-spy_agent-death',     'audio/sfx/spy_agent-death.ogg') },
  spy_operative: { death: ph('sfx-spy_operative-death', 'audio/sfx/spy_operative-death.ogg') },
  spy_hacker:    { death: ph('sfx-spy_hacker-death',    'audio/sfx/spy_hacker-death.ogg') },
```

- [ ] **Step 4: Create 5 silent placeholder OGGs**

Copy an existing silent stub so the on-disk integrity test passes immediately:

```bash
for type in spy_scout spy_informant spy_agent spy_operative spy_hacker; do
  cp public/audio/sfx/scout-death.ogg "public/audio/sfx/${type}-death.ogg"
done
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
bash scripts/run-with-mise.sh yarn test tests/audio/sfx-catalog.test.ts
```
Expected: PASS — all spy types have death entries; total entries = 70; all OGG files exist with valid magic bytes.

- [ ] **Step 6: Build**

```bash
bash scripts/run-with-mise.sh yarn build
```
Expected: exit 0 (no TypeScript errors).

- [ ] **Step 7: Commit**

```bash
git add src/audio/sfx-catalog.ts tests/audio/sfx-catalog.test.ts \
  public/audio/sfx/spy_scout-death.ogg \
  public/audio/sfx/spy_informant-death.ogg \
  public/audio/sfx/spy_agent-death.ogg \
  public/audio/sfx/spy_operative-death.ogg \
  public/audio/sfx/spy_hacker-death.ogg
git commit -m "feat(sfx): add spy type death catalog entries + placeholder OGGs (Task B)"
```

---

## Task 2: Download Kenney CC0 Audio Packs (Task A setup)

Download the two primary Kenney CC0 packs that will cover all 65 SFX slots.

**Kenney Impact Sounds** covers: metal impacts, weapon swings, wooden impacts, soft thuds — good for attack-swing, attack-impact, siege-fire, siege-impact, death.

**Kenney RPG Audio** covers: footsteps, animal sounds, naval creaks, character grunts — good for movement, death, ranged sounds.

- [ ] **Step 1: Download Kenney Impact Sounds**

```bash
mkdir -p /tmp/kenney-audio
curl -fSL "https://kenney.nl/content/assets/kenney_impact-sounds.zip" -o /tmp/kenney-audio/impact.zip
```
If this 404s, use WebFetch on `https://kenney.nl/assets/impact-sounds` to find the actual download URL, then re-run with the correct URL.

- [ ] **Step 2: Extract Impact Sounds**

```bash
unzip /tmp/kenney-audio/impact.zip -d /tmp/kenney-audio/impact/
find /tmp/kenney-audio/impact/ -name "*.wav" -o -name "*.ogg" | head -30
```
Expected: Files named like `impactMetal_000.ogg`, `impactPunch_000.ogg`, `impactSoft_000.ogg`, etc.

- [ ] **Step 3: Download Kenney RPG Audio**

```bash
curl -fSL "https://kenney.nl/content/assets/kenney_rpg-audio.zip" -o /tmp/kenney-audio/rpg.zip
```
If this 404s, WebFetch `https://kenney.nl/assets/rpg-audio` for the real download URL.

- [ ] **Step 4: Extract RPG Audio**

```bash
unzip /tmp/kenney-audio/rpg.zip -d /tmp/kenney-audio/rpg/
find /tmp/kenney-audio/rpg/ -name "*.wav" -o -name "*.ogg" | head -30
```

- [ ] **Step 5: List available files to guide mapping**

```bash
find /tmp/kenney-audio/impact/ -name "*.wav" | sort
find /tmp/kenney-audio/rpg/    -name "*.wav" | sort
```
Note the actual filenames — the mapping in Tasks 3–7 uses the patterns you see here; adjust if Kenney's pack structure has changed since this plan was written.

---

## Task 3: Foot Melee + Ranged Audio (Task A — part 1)

Replaces 26 files: warrior (3), axeman (3), spearman (3), swordsman (3), pikeman (3), musketeer (3), archer (4), crossbowman (4).

**Mapping strategy:**
- `attack-swing` → a sharp whoosh (impactPunch or sword-swing from RPG pack)
- `attack-impact` → hard metal clang (impactMetal_00N)
- `ranged-loose` → light spring/snap (impactWood or bow-release)
- `ranged-impact` → soft thud (impactSoft or arrow-impact)
- `death` → soft thud, distinct from impact (impactSoft or character-death)

Each unit type should use a DIFFERENT numbered variant (e.g., warrior→000, axeman→001, spearman→002) to avoid all swords sounding identical.

**Files:**
- Modify: `src/audio/sfx-catalog.ts` (update ph() → real TrackEntry for 26 entries)
- Modify: `public/audio/sfx/warrior-attack-swing.ogg` … (26 files replaced in-place)
- Modify: `AUDIO-CREDITS.md` (add Kenney pack attribution block)

- [ ] **Step 1: Encode foot melee attack-swing sounds**

Use impactPunch variants (numbered 000–005) for the 6 foot melee types:

```bash
INPUT=/tmp/kenney-audio/impact
OUT=public/audio/sfx
ffmpeg -i "$INPUT/impactPunch_000.ogg" -af loudnorm=I=-14:TP=-1 -vn -c:a libvorbis -q:a 4 "$OUT/warrior-attack-swing.ogg" -y
ffmpeg -i "$INPUT/impactPunch_001.ogg" -af loudnorm=I=-14:TP=-1 -vn -c:a libvorbis -q:a 4 "$OUT/axeman-attack-swing.ogg" -y
ffmpeg -i "$INPUT/impactPunch_002.ogg" -af loudnorm=I=-14:TP=-1 -vn -c:a libvorbis -q:a 4 "$OUT/spearman-attack-swing.ogg" -y
ffmpeg -i "$INPUT/impactPunch_003.ogg" -af loudnorm=I=-14:TP=-1 -vn -c:a libvorbis -q:a 4 "$OUT/swordsman-attack-swing.ogg" -y
ffmpeg -i "$INPUT/impactPunch_004.ogg" -af loudnorm=I=-14:TP=-1 -vn -c:a libvorbis -q:a 4 "$OUT/pikeman-attack-swing.ogg" -y
ffmpeg -i "$INPUT/impactPunch_005.ogg" -af loudnorm=I=-14:TP=-1 -vn -c:a libvorbis -q:a 4 "$OUT/musketeer-attack-swing.ogg" -y
```
If `impactPunch_00N.ogg` files don't exist at that path, use `find /tmp/kenney-audio/impact/ -name "impactPunch*" | sort` to see the real names and adjust.

- [ ] **Step 2: Encode foot melee attack-impact sounds**

```bash
ffmpeg -i "$INPUT/impactMetal_000.ogg" -af loudnorm=I=-14:TP=-1 -vn -c:a libvorbis -q:a 4 "$OUT/warrior-attack-impact.ogg" -y
ffmpeg -i "$INPUT/impactMetal_001.ogg" -af loudnorm=I=-14:TP=-1 -vn -c:a libvorbis -q:a 4 "$OUT/axeman-attack-impact.ogg" -y
ffmpeg -i "$INPUT/impactMetal_002.ogg" -af loudnorm=I=-14:TP=-1 -vn -c:a libvorbis -q:a 4 "$OUT/spearman-attack-impact.ogg" -y
ffmpeg -i "$INPUT/impactMetal_003.ogg" -af loudnorm=I=-14:TP=-1 -vn -c:a libvorbis -q:a 4 "$OUT/swordsman-attack-impact.ogg" -y
ffmpeg -i "$INPUT/impactMetal_004.ogg" -af loudnorm=I=-14:TP=-1 -vn -c:a libvorbis -q:a 4 "$OUT/pikeman-attack-impact.ogg" -y
ffmpeg -i "$INPUT/impactMining_000.ogg" -af loudnorm=I=-14:TP=-1 -vn -c:a libvorbis -q:a 4 "$OUT/musketeer-attack-impact.ogg" -y
```

- [ ] **Step 3: Encode foot melee death sounds**

```bash
ffmpeg -i "$INPUT/impactSoft_000.ogg" -af loudnorm=I=-14:TP=-1 -vn -c:a libvorbis -q:a 4 "$OUT/warrior-death.ogg" -y
ffmpeg -i "$INPUT/impactSoft_001.ogg" -af loudnorm=I=-14:TP=-1 -vn -c:a libvorbis -q:a 4 "$OUT/axeman-death.ogg" -y
ffmpeg -i "$INPUT/impactSoft_002.ogg" -af loudnorm=I=-14:TP=-1 -vn -c:a libvorbis -q:a 4 "$OUT/spearman-death.ogg" -y
ffmpeg -i "$INPUT/impactSoft_003.ogg" -af loudnorm=I=-14:TP=-1 -vn -c:a libvorbis -q:a 4 "$OUT/swordsman-death.ogg" -y
ffmpeg -i "$INPUT/impactSoft_004.ogg" -af loudnorm=I=-14:TP=-1 -vn -c:a libvorbis -q:a 4 "$OUT/pikeman-death.ogg" -y
ffmpeg -i "$INPUT/impactSoft_005.ogg" -af loudnorm=I=-14:TP=-1 -vn -c:a libvorbis -q:a 4 "$OUT/musketeer-death.ogg" -y
```

- [ ] **Step 4: Encode archer + crossbowman ranged sounds**

```bash
# attack-swing (draw motion — use a light punch)
ffmpeg -i "$INPUT/impactPunch_006.ogg" -af loudnorm=I=-14:TP=-1 -vn -c:a libvorbis -q:a 4 "$OUT/archer-attack-swing.ogg" -y
ffmpeg -i "$INPUT/impactPunch_007.ogg" -af loudnorm=I=-14:TP=-1 -vn -c:a libvorbis -q:a 4 "$OUT/crossbowman-attack-swing.ogg" -y
# ranged-loose (bow release — use wood impact)
ffmpeg -i "$INPUT/impactWood_000.ogg" -af loudnorm=I=-14:TP=-1 -vn -c:a libvorbis -q:a 4 "$OUT/archer-ranged-loose.ogg" -y
ffmpeg -i "$INPUT/impactWood_001.ogg" -af loudnorm=I=-14:TP=-1 -vn -c:a libvorbis -q:a 4 "$OUT/crossbowman-ranged-loose.ogg" -y
# ranged-impact (arrow hit — soft impact)
ffmpeg -i "$INPUT/impactSoft_006.ogg" -af loudnorm=I=-14:TP=-1 -vn -c:a libvorbis -q:a 4 "$OUT/archer-ranged-impact.ogg" -y
ffmpeg -i "$INPUT/impactSoft_007.ogg" -af loudnorm=I=-14:TP=-1 -vn -c:a libvorbis -q:a 4 "$OUT/crossbowman-ranged-impact.ogg" -y
# death
ffmpeg -i "$INPUT/impactSoft_008.ogg" -af loudnorm=I=-14:TP=-1 -vn -c:a libvorbis -q:a 4 "$OUT/archer-death.ogg" -y
ffmpeg -i "$INPUT/impactSoft_009.ogg" -af loudnorm=I=-14:TP=-1 -vn -c:a libvorbis -q:a 4 "$OUT/crossbowman-death.ogg" -y
```

Note: if the Kenney pack doesn't have enough numbered variants, reuse variants from other unit types — slight repetition is acceptable at this stage. Verify available counts with `find /tmp/kenney-audio/impact/ -name "impactSoft*" | wc -l` before running.

- [ ] **Step 5: Measure actual durations and update sfx-catalog.ts**

```bash
for f in "$OUT"/warrior-attack-swing.ogg "$OUT"/warrior-attack-impact.ogg "$OUT"/warrior-death.ogg; do
  echo "$f: $(ffprobe -v quiet -show_entries format=duration -of csv=p=0 "$f")s"
done
```
Run for all 26 replaced files (or use a loop over the full list). Record the duration returned by ffprobe — that value goes into `loop.loopEnd` in sfx-catalog.ts.

For each unit in `src/audio/sfx-catalog.ts`, replace the `ph(...)` call with a real entry. Example for warrior:

```typescript
  warrior: {
    'attack-swing':  { id: 'sfx-warrior-attack-swing',  file: 'audio/sfx/warrior-attack-swing.ogg',  bpm: 0, key: 'impact', loop: { loopStart: 0, loopEnd: 0.38 } },
    'attack-impact': { id: 'sfx-warrior-attack-impact', file: 'audio/sfx/warrior-attack-impact.ogg', bpm: 0, key: 'impact', loop: { loopStart: 0, loopEnd: 0.42 } },
    death:           { id: 'sfx-warrior-death',          file: 'audio/sfx/warrior-death.ogg',          bpm: 0, key: 'impact', loop: { loopStart: 0, loopEnd: 0.55 } },
  },
```
Use `key: 'impact'` for all weapon/impact sounds and `key: 'death'` for death sounds. Use the actual ffprobe duration for `loopEnd`. Repeat for all 26 entries in this task.

- [ ] **Step 6: Add Kenney attribution to AUDIO-CREDITS.md**

Kenney packs are CC0 so attribution is not required, but add for traceability. Append to `AUDIO-CREDITS.md`:

```markdown
## SFX — Kenney Impact Sounds (CC0)

All files in `public/audio/sfx/` sourced from the "Impact Sounds" pack.
Source: https://kenney.nl/assets/impact-sounds
License: CC0 1.0 Universal — https://creativecommons.org/publicdomain/zero/1.0/
Used for: foot melee attack-swing, attack-impact, death; ranged attack-swing, ranged-loose, ranged-impact, death
```

- [ ] **Step 7: Run tests**

```bash
bash scripts/run-with-mise.sh yarn test tests/audio/sfx-catalog.test.ts
```
Expected: PASS. The on-disk integrity test checks OGG magic bytes — real files will pass.

- [ ] **Step 8: Commit**

```bash
git add src/audio/sfx-catalog.ts AUDIO-CREDITS.md public/audio/sfx/warrior-*.ogg public/audio/sfx/axeman-*.ogg public/audio/sfx/spearman-*.ogg public/audio/sfx/swordsman-*.ogg public/audio/sfx/pikeman-*.ogg public/audio/sfx/musketeer-*.ogg public/audio/sfx/archer-*.ogg public/audio/sfx/crossbowman-*.ogg
git commit -m "feat(sfx): replace foot-melee + ranged placeholder OGGs with Kenney CC0 assets (Task A part 1)"
```

---

## Task 4: Mounted + Naval + Siege Audio (Task A — part 2)

Replaces 21 files: horseman (3), cavalry (3), knight (3), galley (3), trireme (3), catapult (3), ballista (3).

**Mapping strategy:**
- Mounted attack-swing → heavy punch/whoosh (impactPunch high-numbered variants)
- Mounted attack-impact → heavy metal (impactMetal high-numbered variants)
- Mounted death → heavy soft (impactSoft high-numbered variants)
- Naval attack-swing → wood creak (impactWood variants)
- Naval attack-impact → wood heavy impact
- Naval death → plank break (impactPlank variants)
- Siege fire → spring/thud combo (impactWood or impactPlank heavy)
- Siege impact → stone crash (impactGlass or impactMining heavy)
- Siege death → wood splinter (impactPlank or impactWood)

**Files:**
- Modify: `src/audio/sfx-catalog.ts` (21 entries updated)
- Modify: `public/audio/sfx/horseman-*.ogg` … (21 files replaced in-place)

- [ ] **Step 1: Encode mounted sounds**

```bash
INPUT=/tmp/kenney-audio/impact
OUT=public/audio/sfx
# horseman
ffmpeg -i "$INPUT/impactPunch_008.ogg" -af loudnorm=I=-14:TP=-1 -vn -c:a libvorbis -q:a 4 "$OUT/horseman-attack-swing.ogg" -y
ffmpeg -i "$INPUT/impactMetal_005.ogg" -af loudnorm=I=-14:TP=-1 -vn -c:a libvorbis -q:a 4 "$OUT/horseman-attack-impact.ogg" -y
ffmpeg -i "$INPUT/impactSoft_010.ogg"  -af loudnorm=I=-14:TP=-1 -vn -c:a libvorbis -q:a 4 "$OUT/horseman-death.ogg" -y
# cavalry
ffmpeg -i "$INPUT/impactPunch_009.ogg" -af loudnorm=I=-14:TP=-1 -vn -c:a libvorbis -q:a 4 "$OUT/cavalry-attack-swing.ogg" -y
ffmpeg -i "$INPUT/impactMetal_006.ogg" -af loudnorm=I=-14:TP=-1 -vn -c:a libvorbis -q:a 4 "$OUT/cavalry-attack-impact.ogg" -y
ffmpeg -i "$INPUT/impactSoft_011.ogg"  -af loudnorm=I=-14:TP=-1 -vn -c:a libvorbis -q:a 4 "$OUT/cavalry-death.ogg" -y
# knight
ffmpeg -i "$INPUT/impactPunch_010.ogg" -af loudnorm=I=-14:TP=-1 -vn -c:a libvorbis -q:a 4 "$OUT/knight-attack-swing.ogg" -y
ffmpeg -i "$INPUT/impactMetal_007.ogg" -af loudnorm=I=-14:TP=-1 -vn -c:a libvorbis -q:a 4 "$OUT/knight-attack-impact.ogg" -y
ffmpeg -i "$INPUT/impactSoft_012.ogg"  -af loudnorm=I=-14:TP=-1 -vn -c:a libvorbis -q:a 4 "$OUT/knight-death.ogg" -y
```

- [ ] **Step 2: Encode naval sounds**

```bash
# galley
ffmpeg -i "$INPUT/impactWood_002.ogg"  -af loudnorm=I=-14:TP=-1 -vn -c:a libvorbis -q:a 4 "$OUT/galley-attack-swing.ogg" -y
ffmpeg -i "$INPUT/impactWood_003.ogg"  -af loudnorm=I=-14:TP=-1 -vn -c:a libvorbis -q:a 4 "$OUT/galley-attack-impact.ogg" -y
ffmpeg -i "$INPUT/impactPlank_000.ogg" -af loudnorm=I=-14:TP=-1 -vn -c:a libvorbis -q:a 4 "$OUT/galley-death.ogg" -y
# trireme
ffmpeg -i "$INPUT/impactWood_004.ogg"  -af loudnorm=I=-14:TP=-1 -vn -c:a libvorbis -q:a 4 "$OUT/trireme-attack-swing.ogg" -y
ffmpeg -i "$INPUT/impactWood_005.ogg"  -af loudnorm=I=-14:TP=-1 -vn -c:a libvorbis -q:a 4 "$OUT/trireme-attack-impact.ogg" -y
ffmpeg -i "$INPUT/impactPlank_001.ogg" -af loudnorm=I=-14:TP=-1 -vn -c:a libvorbis -q:a 4 "$OUT/trireme-death.ogg" -y
```

- [ ] **Step 3: Encode siege sounds**

```bash
# catapult
ffmpeg -i "$INPUT/impactWood_006.ogg"    -af loudnorm=I=-14:TP=-1 -vn -c:a libvorbis -q:a 4 "$OUT/catapult-siege-fire.ogg" -y
ffmpeg -i "$INPUT/impactMining_001.ogg"  -af loudnorm=I=-14:TP=-1 -vn -c:a libvorbis -q:a 4 "$OUT/catapult-siege-impact.ogg" -y
ffmpeg -i "$INPUT/impactPlank_002.ogg"   -af loudnorm=I=-14:TP=-1 -vn -c:a libvorbis -q:a 4 "$OUT/catapult-death.ogg" -y
# ballista
ffmpeg -i "$INPUT/impactWood_007.ogg"    -af loudnorm=I=-14:TP=-1 -vn -c:a libvorbis -q:a 4 "$OUT/ballista-siege-fire.ogg" -y
ffmpeg -i "$INPUT/impactMining_002.ogg"  -af loudnorm=I=-14:TP=-1 -vn -c:a libvorbis -q:a 4 "$OUT/ballista-siege-impact.ogg" -y
ffmpeg -i "$INPUT/impactPlank_003.ogg"   -af loudnorm=I=-14:TP=-1 -vn -c:a libvorbis -q:a 4 "$OUT/ballista-death.ogg" -y
```

If a specific variant number doesn't exist in the pack, run:
```bash
find /tmp/kenney-audio/impact/ -name "impactWood*" | sort
```
and use the highest available index, accepting some duplication between unit types.

- [ ] **Step 4: Measure durations and update sfx-catalog.ts for all 21 entries**

Run ffprobe on each new file (same pattern as Task 3 Step 5), then update the corresponding entries in sfx-catalog.ts from `ph(...)` to explicit TrackEntry objects. Use `key: 'impact'` for attack/siege sounds and `key: 'death'` for death sounds.

- [ ] **Step 5: Run tests**

```bash
bash scripts/run-with-mise.sh yarn test tests/audio/sfx-catalog.test.ts
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/audio/sfx-catalog.ts public/audio/sfx/horseman-*.ogg public/audio/sfx/cavalry-*.ogg public/audio/sfx/knight-*.ogg public/audio/sfx/galley-*.ogg public/audio/sfx/trireme-*.ogg public/audio/sfx/catapult-*.ogg public/audio/sfx/ballista-*.ogg
git commit -m "feat(sfx): replace mounted + naval + siege placeholder OGGs with Kenney CC0 assets (Task A part 2)"
```

---

## Task 5: Special Combat + Non-Combat + Movement Audio (Task A — part 3)

Replaces 17 files: shadow_warden (3), scout_hound (3), war_hound (3), settler/worker/caravan/scout/expedition death (5), 3 movement step sounds.

**Mapping strategy:**
- shadow_warden → same as foot melee, using higher-indexed variants
- scout_hound / war_hound → use impactSoft (animal-like) for all 3 slots
- Non-combat death → impactSoft (same character-death sound, distinct indexed variants)
- humanoid-move-step → footstep: use RPG Audio pack footstep sound, or generate a short humanoid step
- animal-move-step → paw/hoof: RPG Audio animal step, or a short light impact
- naval-move-step → water splash/oar creak: impactWood short variant

**Files:**
- Modify: `src/audio/sfx-catalog.ts` (17 entries updated)
- Modify: `public/audio/sfx/shadow_warden-*.ogg`, `public/audio/sfx/scout_hound-*.ogg`, etc.
- Modify: `public/audio/sfx/humanoid-move-step.ogg`, `public/audio/sfx/animal-move-step.ogg`, `public/audio/sfx/naval-move-step.ogg`

- [ ] **Step 1: Check RPG Audio pack structure**

```bash
find /tmp/kenney-audio/rpg/ -name "*.wav" -o -name "*.ogg" | sort | head -40
```
Identify footstep, animal-step, and any other relevant sound categories.

- [ ] **Step 2: Encode special combat sounds**

```bash
INPUT=/tmp/kenney-audio/impact
OUT=public/audio/sfx
# shadow_warden (use late-index punch/metal/soft)
ffmpeg -i "$INPUT/impactPunch_011.ogg" -af loudnorm=I=-14:TP=-1 -vn -c:a libvorbis -q:a 4 "$OUT/shadow_warden-attack-swing.ogg" -y
ffmpeg -i "$INPUT/impactMetal_008.ogg" -af loudnorm=I=-14:TP=-1 -vn -c:a libvorbis -q:a 4 "$OUT/shadow_warden-attack-impact.ogg" -y
ffmpeg -i "$INPUT/impactSoft_013.ogg"  -af loudnorm=I=-14:TP=-1 -vn -c:a libvorbis -q:a 4 "$OUT/shadow_warden-death.ogg" -y
# scout_hound (light animal feel — soft impacts)
ffmpeg -i "$INPUT/impactSoft_014.ogg"  -af loudnorm=I=-14:TP=-1 -vn -c:a libvorbis -q:a 4 "$OUT/scout_hound-attack-swing.ogg" -y
ffmpeg -i "$INPUT/impactSoft_015.ogg"  -af loudnorm=I=-14:TP=-1 -vn -c:a libvorbis -q:a 4 "$OUT/scout_hound-attack-impact.ogg" -y
ffmpeg -i "$INPUT/impactSoft_016.ogg"  -af loudnorm=I=-14:TP=-1 -vn -c:a libvorbis -q:a 4 "$OUT/scout_hound-death.ogg" -y
# war_hound (heavier animal feel)
ffmpeg -i "$INPUT/impactPunch_012.ogg" -af loudnorm=I=-14:TP=-1 -vn -c:a libvorbis -q:a 4 "$OUT/war_hound-attack-swing.ogg" -y
ffmpeg -i "$INPUT/impactMetal_009.ogg" -af loudnorm=I=-14:TP=-1 -vn -c:a libvorbis -q:a 4 "$OUT/war_hound-attack-impact.ogg" -y
ffmpeg -i "$INPUT/impactSoft_017.ogg"  -af loudnorm=I=-14:TP=-1 -vn -c:a libvorbis -q:a 4 "$OUT/war_hound-death.ogg" -y
```

- [ ] **Step 3: Encode non-combat death sounds**

```bash
for i in 0 1 2 3 4; do
  TYPES=(settler worker caravan scout expedition)
  ffmpeg -i "$INPUT/impactSoft_0$(printf '%02d' $((18+i))).ogg" -af loudnorm=I=-14:TP=-1 -vn -c:a libvorbis -q:a 4 "$OUT/${TYPES[$i]}-death.ogg" -y
done
```
If fewer than 23 impactSoft variants exist, loop back using modulo — e.g. `impactSoft_000.ogg` reused for settler-death is acceptable at this stage.

- [ ] **Step 4: Encode movement step sounds**

```bash
RPG=/tmp/kenney-audio/rpg
# Find a footstep WAV in the RPG pack
FOOTSTEP=$(find "$RPG" -iname "*footstep*" -o -iname "*step*" | head -1)
echo "Using footstep: $FOOTSTEP"
ffmpeg -i "$FOOTSTEP" -af loudnorm=I=-14:TP=-1 -vn -c:a libvorbis -q:a 4 "$OUT/humanoid-move-step.ogg" -y

# Animal step
ANIMAL_STEP=$(find "$RPG" -iname "*animal*" -o -iname "*hoof*" -o -iname "*paw*" | head -1)
if [ -z "$ANIMAL_STEP" ]; then
  # Fallback: use a short soft impact
  ANIMAL_STEP="$INPUT/impactSoft_000.ogg"
fi
ffmpeg -i "$ANIMAL_STEP" -af loudnorm=I=-14:TP=-1 -vn -c:a libvorbis -q:a 4 "$OUT/animal-move-step.ogg" -y

# Naval step (oar/water — use impactWood short)
ffmpeg -i "$INPUT/impactWood_000.ogg" -t 0.4 -af loudnorm=I=-14:TP=-1 -vn -c:a libvorbis -q:a 4 "$OUT/naval-move-step.ogg" -y
```

- [ ] **Step 5: Measure durations and update sfx-catalog.ts for all 17 entries**

Same ffprobe pattern as prior tasks. Update MOVEMENT_SFX entries from `ph(...)` to explicit objects with real `loopEnd` values. Use `key: 'footstep'` for movement sounds.

- [ ] **Step 6: Run all tests**

```bash
bash scripts/run-with-mise.sh yarn test
```
Expected: PASS.

- [ ] **Step 7: Build**

```bash
bash scripts/run-with-mise.sh yarn build
```
Expected: exit 0.

- [ ] **Step 8: Commit**

```bash
git add src/audio/sfx-catalog.ts AUDIO-CREDITS.md \
  public/audio/sfx/shadow_warden-*.ogg public/audio/sfx/scout_hound-*.ogg public/audio/sfx/war_hound-*.ogg \
  public/audio/sfx/settler-death.ogg public/audio/sfx/worker-death.ogg public/audio/sfx/caravan-death.ogg \
  public/audio/sfx/scout-death.ogg public/audio/sfx/expedition-death.ogg \
  public/audio/sfx/humanoid-move-step.ogg public/audio/sfx/animal-move-step.ogg public/audio/sfx/naval-move-step.ogg
git commit -m "feat(sfx): replace special-combat + non-combat + movement placeholder OGGs with Kenney CC0 assets (Task A part 3)"
```

---

## Task 6: Task C1 — Era Advance Stinger Wiring Plan

Create a tracking plan for wiring `STINGER.eraAdvance` into `MusicDirector.handleEraAdvanced()`. The stinger OGGs already exist and are curated; this is a code-only change in `music-director.ts`.

**Context:**
- `src/audio/audio-catalog.ts:72-83` — `STINGER.eraAdvance` has 5 era-keyed entries
- `src/audio/music-director.ts:50-55` — `handleEraAdvanced` currently plays only `STINGER.eraTransitionCue` (short cue), not the full `STINGER.eraAdvance` stinger
- The desired behavior: after the transition cue plays, also play the era-advance stinger as a "big reveal" moment
- Tests must verify the stinger fires exactly once per era-advance event

**Files:**
- Create: `docs/superpowers/plans/audio-era-advance-stinger-wiring.md`

- [ ] **Step 1: Write the plan document**

```markdown
# Audio: Era Advance Stinger Wiring Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans

**Goal:** Wire STINGER.eraAdvance[era] into MusicDirector.handleEraAdvanced() so the full stinger plays after the transition cue on each era advance.

**Architecture:** handleEraAdvanced already calls playStingerWithDuck for the transition cue. A second sequential call plays the full stinger. The era resolve path already exists via resolveEra(p.era).

**Tech Stack:** TypeScript, vitest

---

## Files
- Modify: `src/audio/music-director.ts:50-55`
- Modify: `tests/audio/music-director.test.ts` (add stinger assertion)

---

## Task 1: Wire eraAdvance stinger

**Files:**
- Modify: `src/audio/music-director.ts:50-55`

- [ ] **Step 1: Write failing test**

In `tests/audio/music-director.test.ts`, add:
\`\`\`typescript
it('handleEraAdvanced plays the eraAdvance stinger for the correct era', async () => {
  const playCalls: string[] = [];
  const mockDirector = createMockMusicDirector({ onPlayOneShot: (path) => playCalls.push(path) });
  await mockDirector.handleEraAdvanced({ era: 3 });
  expect(playCalls).toContain(STINGER.eraAdvance[3].file);
});

it('handleEraAdvanced plays eraAdvance stinger exactly once per call', async () => {
  const playCalls: string[] = [];
  const mockDirector = createMockMusicDirector({ onPlayOneShot: (path) => playCalls.push(path) });
  await mockDirector.handleEraAdvanced({ era: 2 });
  const stingerCalls = playCalls.filter(p => p === STINGER.eraAdvance[2].file);
  expect(stingerCalls).toHaveLength(1);
});
\`\`\`

- [ ] **Step 2: Run test → FAIL**

\`\`\`bash
bash scripts/run-with-mise.sh yarn test tests/audio/music-director.test.ts
\`\`\`

- [ ] **Step 3: Add eraAdvance stinger call to handleEraAdvanced**

In `src/audio/music-director.ts`, update `handleEraAdvanced`:
\`\`\`typescript
handleEraAdvanced(p: EraAdvancedPayload): void {
  const target: SnapshotId = this.intendedSnapshot === 'at-war' ? 'at-war' : 'peace';
  this.intendedSnapshot = target;
  this.mixer.setSnapshot(target, CROSSFADE_MS);
  void this.playStingerWithDuck(STINGER.eraTransitionCue[resolveEra(p.era)].file);
  void this.playStingerWithDuck(STINGER.eraAdvance[resolveEra(p.era)].file);
}
\`\`\`

- [ ] **Step 4: Run test → PASS**

\`\`\`bash
bash scripts/run-with-mise.sh yarn test tests/audio/music-director.test.ts
\`\`\`

- [ ] **Step 5: Full test + build**

\`\`\`bash
bash scripts/run-with-mise.sh yarn test && bash scripts/run-with-mise.sh yarn build
\`\`\`

- [ ] **Step 6: Commit**

\`\`\`bash
git add src/audio/music-director.ts tests/audio/music-director.test.ts
git commit -m "feat(audio): wire eraAdvance stinger into MusicDirector.handleEraAdvanced"
\`\`\`
```

- [ ] **Step 2: Commit the plan doc**

```bash
git add docs/superpowers/plans/audio-era-advance-stinger-wiring.md
git commit -m "docs: add era-advance stinger wiring plan (Task C1)"
```

---

## Task 7: Task C2 — Natural Wonder Curation Index

Create a tracking plan enumerating all pending natural wonder IDs and the work per wonder.

**Context:**
- `src/audio/natural-wonder-audio-catalog.ts:39` — `FINAL_NATURAL_WONDER_AUDIO_COVERAGE = false`
- Complete wonders: `great_volcano`, `ancient_forest`, `coral_reef`, `sacred_mountain`, `crystal_caverns`, `aurora_fields` (6 of 15)
- Pending wonders (9): `grand_canyon`, `frozen_falls`, `dragon_bones`, `singing_sands`, `sunken_ruins`, `floating_islands`, `bioluminescent_bay`, `bottomless_lake`, `eternal_storm`
- Each pending wonder needs: stinger OGG, ambient loop OGG, CompleteNaturalWonderAudioEntry in COMPLETE_ENTRIES, soundMood from its spectacle recipe

**Files:**
- Create: `docs/superpowers/plans/audio-natural-wonder-curation-index.md`

- [ ] **Step 1: Get soundMood for each pending wonder**

```bash
bash scripts/run-with-mise.sh yarn --silent node -e "
const { getNaturalWonderAudioCatalog } = require('./src/audio/natural-wonder-audio-catalog');
getNaturalWonderAudioCatalog()
  .filter(e => e.status === 'pending')
  .forEach(e => console.log(e.wonderId, e.soundMood));
" 2>/dev/null || grep -A2 "grand_canyon\|frozen_falls\|dragon_bones\|singing_sands\|sunken_ruins\|floating_islands\|bioluminescent_bay\|bottomless_lake\|eternal_storm" src/systems/wonder-definitions.ts | head -60
```
Record the soundMood for each pending wonder — needed for the plan doc.

- [ ] **Step 2: Write the plan document**

In `docs/superpowers/plans/audio-natural-wonder-curation-index.md`, write:

```markdown
# Natural Wonder Audio Curation Index

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans

**Goal:** Source stinger + ambient-loop OGGs for all 9 pending natural wonders and add CompleteNaturalWonderAudioEntry records until FINAL_NATURAL_WONDER_AUDIO_COVERAGE = true.

**Architecture:** Each wonder gets two CC0/CC-BY OGG files. An entry is added to COMPLETE_ENTRIES in natural-wonder-audio-catalog.ts. When all 9 are done, flip FINAL_NATURAL_WONDER_AUDIO_COVERAGE to true.

**Tech Stack:** TypeScript, ffmpeg, Kenney/Freesound CC0/CC-BY sources

---

## Pending Wonders (9)

Each row: wonderId | soundMood | stinger file | ambient file | status

| wonderId | soundMood | stinger | ambient |
|---|---|---|---|
| grand_canyon | <check soundMood> | audio/wonders/grand-canyon-stinger.ogg | audio/wonders/grand-canyon-ambient.ogg |
| frozen_falls | <check soundMood> | audio/wonders/frozen-falls-stinger.ogg | audio/wonders/frozen-falls-ambient.ogg |
| dragon_bones | <check soundMood> | audio/wonders/dragon-bones-stinger.ogg | audio/wonders/dragon-bones-ambient.ogg |
| singing_sands | <check soundMood> | audio/wonders/singing-sands-stinger.ogg | audio/wonders/singing-sands-ambient.ogg |
| sunken_ruins | <check soundMood> | audio/wonders/sunken-ruins-stinger.ogg | audio/wonders/sunken-ruins-ambient.ogg |
| floating_islands | <check soundMood> | audio/wonders/floating-islands-stinger.ogg | audio/wonders/floating-islands-ambient.ogg |
| bioluminescent_bay | <check soundMood> | audio/wonders/bioluminescent-bay-stinger.ogg | audio/wonders/bioluminescent-bay-ambient.ogg |
| bottomless_lake | <check soundMood> | audio/wonders/bottomless-lake-stinger.ogg | audio/wonders/bottomless-lake-ambient.ogg |
| eternal_storm | <check soundMood> | audio/wonders/eternal-storm-stinger.ogg | audio/wonders/eternal-storm-ambient.ogg |

## Per-Wonder Work (template)

For each pending wonder, repeat this checklist:

- [ ] Source stinger OGG (CC0/CC-BY, 2-6s, evocative of the wonder's mood)
- [ ] Source ambient loop OGG (CC0/CC-BY, 20-90s, loopable background)
- [ ] Encode both files: `ffmpeg -i input -af loudnorm=I=-14:TP=-1 -vn -c:a libvorbis -q:a 2 output.ogg`
- [ ] Copy to `public/audio/wonders/<wonder-id>-stinger.ogg` and `-ambient.ogg`
- [ ] Add CompleteNaturalWonderAudioEntry to COMPLETE_ENTRIES in natural-wonder-audio-catalog.ts
- [ ] Add attribution to AUDIO-CREDITS.md if CC-BY
- [ ] Run `bash scripts/run-with-mise.sh yarn test` → PASS
- [ ] Commit: `feat(audio): add <wonderId> natural wonder audio`

## Completion Gate

When all 9 wonders are complete:

\`\`\`typescript
// src/audio/natural-wonder-audio-catalog.ts
export const FINAL_NATURAL_WONDER_AUDIO_COVERAGE = true;
\`\`\`

Add it to MR5_NATURAL_WONDER_AUDIO_IDS and COMPLETE_NATURAL_WONDER_AUDIO_IDS.
Run full test + build to confirm. Then commit.
```

Note: fill in the actual soundMood values from Step 1 before committing this plan doc.

- [ ] **Step 3: Commit the plan doc**

```bash
git add docs/superpowers/plans/audio-natural-wonder-curation-index.md
git commit -m "docs: add natural wonder audio curation index (Task C2)"
```

---

## Final Verification

- [ ] **Run full test suite**

```bash
bash scripts/run-with-mise.sh yarn test
```
Expected: PASS — all 70 SFX catalog entries present, all OGG files exist with OGG magic bytes.

- [ ] **Run build**

```bash
bash scripts/run-with-mise.sh yarn build
```
Expected: exit 0.

---

## Self-Review Checklist

- Task A: 65 placeholder OGGs replaced with real Kenney CC0 audio ✓
- Task A: sfx-catalog.ts updated with real `loopEnd` durations ✓
- Task A: AUDIO-CREDITS.md updated with pack attribution ✓
- Task B: 5 spy death entries added to UNIT_SFX ✓
- Task B: 5 spy death OGG files created (stubs) ✓
- Task B: test updated to 70 entries + non-combat + spy assertion ✓
- Task C1: era-advance stinger wiring plan created ✓
- Task C2: natural wonder curation index created ✓
- SfxDirector: `unit:created` subscription added for mid-game unit caching ✓
- Build + test both green before PR ✓
