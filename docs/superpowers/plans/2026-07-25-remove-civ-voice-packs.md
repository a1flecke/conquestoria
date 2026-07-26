# Remove Civ Advisor Voice Packs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete the entire civ advisor voice/speech-pack system (spoken advisor lines on game events) — code, assets, settings UI, tooling scripts, and tests — and close the 25 open GitHub issues that track voice-pack work.

**Architecture:** The voice system is a self-contained slice of the audio stack: `VoiceDirector` (playback + ducking), `VOICE_CATALOG`/`voice-catalog.ts` (asset registry), `civ-voice-family.ts` (civ→pack mapping), a `voice` bus + `voice-duck` snapshot in `AudioMixer`, event subscriptions in `AudioSystem`, a Voice row in the pause-menu audio settings, `voiceVolume`/`voiceEnabled` in `GameSettings`, 110 OGGs under `public/audio/voice/`, and four generation scripts. Music, stingers, SFX, and ambience are untouched. Removal proceeds inside-out: playback engine first, then settings/UI, then the mixer bus, then assets/scripts/docs — each task leaves `yarn build` + targeted tests green.

**Tech Stack:** TypeScript, Vite, vitest, Web Audio API, `gh` CLI.

**Scope decision (read before implementing):** "Remove all language speech packs" includes the `generic` pack. `generic` is itself an English advisor speech pack used as the fallback for every civ — removing only the 10 hero packs would leave every civ still speaking. The whole voice-line system goes. Music (era bases, war layers, accents), stingers, and SFX are explicitly kept.

## Global Constraints

- ALL commands run via `bash scripts/run-with-mise.sh yarn <cmd>` — never `eval "$(mise activate bash)"`.
- `yarn test` does NOT type-check. `yarn build` is the only path that runs `tsc`. Both must exit 0 before any `git push` / `gh pr create`.
- Bash tool timeouts: `git commit` → 30 000 ms; `git push` / `gh pr create` → 120 000 ms.
- Work happens in this worktree on branch `claude/remove-language-speech-packs-bd899a`. Before first push: verify `git config --worktree --get core.hooksPath` returns `.githooks`, and run `mise trust <worktree-path>/mise.toml`.
- Commit messages end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Do NOT put `Closes #NNN` keywords in the PR body — the 25 issues are closed manually as "not planned" after merge (Task 6), with an explanatory comment, because the work they describe is being cancelled, not completed.
- A shared verification lock serializes `yarn test`/`yarn build` across worktrees. If a run exits with status 75, another agent holds the lock — wait and run once, don't retry in a loop.

---

### Task 1: Remove the voice playback engine

Deletes `VoiceDirector`, the voice catalog, the civ→pack mapping, and every `AudioSystem` reference to them. Leaves the `setVoiceVolume`/`setVoiceEnabled` settings passthroughs in place (Task 2 removes those with their callers).

**Files:**
- Delete: `src/audio/voice-director.ts`, `src/audio/voice-catalog.ts`, `src/audio/civ-voice-family.ts`, `tests/audio/voice-director.test.ts`
- Modify: `src/audio/audio-system.ts`, `src/audio/music-director.ts` (comments only), `tests/audio/audio-catalog.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `AudioSystem` no longer has a `voiceDirector` field or `preloadVoicePack()` method; it still has `setVoiceVolume(volume: number): void` and `setVoiceEnabled(enabled: boolean): void` (Task 2 deletes them). `MusicDirector.resolveSnapshot()` and `currentStingerPromise` remain public (tests use them).

- [ ] **Step 1: Strip voice sections from `tests/audio/audio-catalog.test.ts`**

Remove the import of the voice catalog (lines 10–12):

```ts
import {
  VOICE_CATALOG, ALL_VOICE_PACK_IDS, ALL_VOICE_EVENT_IDS,
} from '../../src/audio/voice-catalog';
```

Delete the entire `describe('voice catalog integrity (Spec 3)', …)` block and the entire `describe('voice on-disk OGG integrity (Spec 3)', …)` block (everything from the `// ─── Voice catalog integrity ───` comment to the end of the second describe). The music/SFX describes above them are untouched.

- [ ] **Step 2: Delete the voice modules and their test**

```bash
git rm src/audio/voice-director.ts src/audio/voice-catalog.ts src/audio/civ-voice-family.ts tests/audio/voice-director.test.ts
```

- [ ] **Step 3: Remove all voice wiring from `src/audio/audio-system.ts`**

Apply these exact removals:

1. Imports — delete these three lines:
```ts
import { VoiceDirector } from './voice-director';
import { getVoicePackForCiv } from './civ-voice-family';
import { VOICE_CATALOG, ALL_VOICE_EVENT_IDS, type VoicePackId } from './voice-catalog';
```

2. Field — delete `private voiceDirector: VoiceDirector;`

3. Constructor — delete:
```ts
    this.voiceDirector = new VoiceDirector(
      this.mixer,
      this.loader,
      () => this.director.resolveSnapshot(),
    );
```

4. `start()` — delete the pack-preload block:
```ts
    // Spec 3: set current voice pack and preload its clips
    this.voiceDirector.setVoicePack(this.currentCivType);
    void this.preloadVoicePack(this.currentCivType);
    // Always preload generic pack — used as fallback for partial hero packs
    // and for all 19 non-hero civs. 10 clips ≈ 350 KB, negligible cost.
    if (this.currentCivType !== 'generic') {
      void this.preloadVoicePack('generic');
    }
```

5. `dispose()` — delete `this.voiceDirector.stop();`

6. `rebindCampaign()` — delete:
```ts
    this.voiceDirector.stop();
    this.voiceDirector.setVoicePack(this.currentCivType);
    void this.preloadVoicePack(this.currentCivType);
```

7. Player-handoff subscription (`bus.on('game:player-changed', …)` — the block ending with the hot-seat privacy comment) — delete:
```ts
        // Spec 3: hot-seat voice privacy — stop any in-progress voice line from outgoing player
        this.voiceDirector.stop();
        this.voiceDirector.setVoicePack(this.currentCivType);
        void this.preloadVoicePack(this.currentCivType);
```

8. `bus.on('game:over', …)` — replace:
```ts
      bus.on('game:over', p => {
        const outcome = p.winnerId === this.currentPlayerId ? 'victory' : 'defeat';
        this.naturalWonderDirector.stopAmbient('game-ended');
        this.voiceDirector.stop(); // cut any in-progress voice line
        const stingerPromise = this.director.handleGameEnded({ outcome });
        if (outcome === 'victory') {
          // Chain victory voice line after stinger completes, then silence
          void stingerPromise.then(() => this.voiceDirector.playLine('victory'));
        }
      }),
```
with:
```ts
      bus.on('game:over', p => {
        const outcome = p.winnerId === this.currentPlayerId ? 'victory' : 'defeat';
        this.naturalWonderDirector.stopAmbient('game-ended');
        void this.director.handleGameEnded({ outcome });
      }),
```

9. The entire voice-subscription block — delete everything from the comment
```ts
      // ── Spec 3: voice line subscriptions ─────────────────────────────────
```
down to (and including) the `diplomacy:peace-made` subscription, EXCEPT keep these two stinger subscriptions that are interleaved in that block:
```ts
      bus.on('tech:completed', p => {
        if (p.civId !== this.currentPlayerId) return;
        this.director.handleTechResearched();
      }),

      bus.on('wonder:legendary-completed', p => {
        if (p.civId !== this.currentPlayerId) return;
        this.director.handleWonderBuilt();
      }),
```
Concretely, delete these subscriptions entirely — in every case the deletion target is the handler that calls `this.voiceDirector.playLine(…)`, never a same-named subscription elsewhere in the file: the second `era:advanced` (voice), `city:founded` (voice), the second `diplomacy:war-declared` (voice — the stinger subscription at ~line 322 calling `this.director.handleWarDeclared(…)` stays), the second `tech:completed` (voice), the second `wonder:legendary-completed` (voice), `wonder:legendary-lost` (voice-only handler), the `city:captured` voice handler (body is only a `playLine('city-lost')` call), the `civ:near-defeat` voice handler (the separate `civ:near-defeat` subscription calling `this.director.handleNearDefeat(…)` in the adaptive-state block stays), and the second `diplomacy:peace-made` (voice — the stinger subscription calling `this.director.handlePeaceSigned(…)` stays). Also delete the now-orphaned comment:
```ts
      // Stinger subs registered BEFORE voice subs for the same event so that
      // when the event fires the stinger handler updates currentStingerPromise
      // first, and the voice handler then awaits the correct (new) promise.
```

10. Delete the `preloadVoicePack` method:
```ts
  /**
   * Preload the current voice pack (10 clips ≈ 350 KB).
   * Called on game start and on each player handoff.
   * Only preloads the current player's pack — generic is lazy-loaded on first use.
   */
  private preloadVoicePack(civType: string): Promise<void> {
    const packId: VoicePackId = getVoicePackForCiv(civType);
    const files = ALL_VOICE_EVENT_IDS
      .map(e => VOICE_CATALOG[packId]?.[e]?.file)
      .filter((f): f is string => !!f);
    return this.loader.preload(files);
  }
```

- [ ] **Step 4: Update stale comments in `src/audio/music-director.ts`**

Three comments reference the removed system (keep the code they describe — `currentStingerPromise` and `resolveSnapshot()` stay public because `tests/audio/music-director*.test.ts` assert on them):
- Line ~67: `* AudioSystem (MR3) awaits this before playing voice lines for co-fire events.` → `* Public: exposed for stinger-sequencing tests.`
- Line ~79: `* Public so AudioSystem can inject it as the VoiceDirector getSnapshot callback.` → `* Public: exposed for snapshot-priority tests.`
- Line ~243: `* AudioSystem (MR3) awaits this before playing the victory voice line.` → delete that line from the doc comment.

- [ ] **Step 5: Run targeted tests and type-check**

```bash
bash scripts/run-with-mise.sh yarn vitest run tests/audio/audio-catalog.test.ts tests/audio/music-director.test.ts tests/audio/music-director-crisis.test.ts
```
Expected: PASS (voice describes gone, music untouched).
```bash
bash scripts/run-with-mise.sh yarn build
```
Expected: exit 0 — proves no dangling imports of the deleted modules. (`grep -rn "voice-catalog\|voice-director\|civ-voice-family\|VoiceDirector\|VOICE_CATALOG\|getVoicePackForCiv\|preloadVoicePack" src/ tests/` must return nothing.)

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "refactor(audio): remove advisor voice-line playback engine

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Remove the Voice settings row and settings plumbing

**Files:**
- Modify: `src/ui/pause-menu-panel.ts`, `src/main.ts`, `src/core/types.ts`, `src/core/game-state.ts`, `src/audio/audio-system.ts`, `tests/ui/pause-menu-panel.test.ts`

**Interfaces:**
- Consumes: Task 1's `AudioSystem` (still has `setVoiceVolume`/`setVoiceEnabled` until this task).
- Produces: `AudioSettingsSnapshot` = `{ masterVolume, musicVolume, sfxVolume, stingerVolume, musicEnabled, soundEnabled, stingerEnabled }`; `GameSettings` no longer has `voiceVolume`/`voiceEnabled`. Old saves that still carry those keys load fine — every read site used `?? default` and the keys are simply ignored (`tests/fixtures/issue-365-crowded-map-save.json` needs no change).

- [ ] **Step 1: Update `tests/ui/pause-menu-panel.test.ts` to the 4-slider/3-checkbox layout**

In the `DEFAULT_TEST_AUDIO` fixture at the top, remove `voiceVolume: 1.0,` and `voiceEnabled: true,`. Then:
- `'renders 5 range sliders (Master, Music, SFX, Voice, Stinger)'` → title `'renders 4 range sliders (Master, Music, SFX, Stinger)'`, assertion `expect(sliders).toHaveLength(4);`
- `'renders 4 checkboxes (Music, SFX, Voice, Stinger — Master has no toggle)'` → title `'renders 3 checkboxes (Music, SFX, Stinger — Master has no toggle)'`, assertion `expect(checkboxes).toHaveLength(3);`
- Delete the `'Voice slider calls onAudioSettingChange with voiceVolume'` test entirely.
- Add a regression that the row is really gone:
```ts
    it('renders no Voice row (voice packs removed)', () => {
      showPauseMenu(document.body, makeCallbacks());
      expect(document.querySelector('input[aria-label="Voice volume"]')).toBeNull();
      expect(document.querySelector('input[aria-label="Voice enabled"]')).toBeNull();
    });
```

- [ ] **Step 2: Run to verify the updated tests fail**

```bash
bash scripts/run-with-mise.sh yarn vitest run tests/ui/pause-menu-panel.test.ts
```
Expected: FAIL — 5 sliders rendered where 4 expected, Voice row still present.

- [ ] **Step 3: Remove the Voice row and snapshot fields in `src/ui/pause-menu-panel.ts`**

In `AudioSettingsSnapshot`, delete `voiceVolume: number;` and `voiceEnabled: boolean;`.
In `DEFAULT_AUDIO_SETTINGS`, delete `voiceVolume: 1.0,` and `voiceEnabled: true,` (leaving `stingerVolume: 1.0,` and the remaining enabled flags).
In the `rows` array, delete:
```ts
    { label: 'Voice',   volumeKey: 'voiceVolume',   enabledKey: 'voiceEnabled' },
```
Update the section doc comment `Build the 5-channel audio settings section.` → `Build the 4-channel audio settings section.`

- [ ] **Step 4: Remove settings plumbing in `src/main.ts`**

In the pause-menu `audioSettings:` object, delete:
```ts
          voiceVolume:    gameState.settings.voiceVolume    ?? 1.0,
          voiceEnabled:   gameState.settings.voiceEnabled   ?? true,
```
In the `onAudioSettingChange` switch, delete:
```ts
            case 'voiceVolume':    audio.setVoiceVolume(value as number);   break;
            case 'voiceEnabled':   audio.setVoiceEnabled(value as boolean); break;
```
In the persisted-settings mapping (~line 1882), delete:
```ts
    voiceVolume:    persistedSettings.voiceVolume    ?? 1.0,
    voiceEnabled:   persistedSettings.voiceEnabled   ?? true,
```

- [ ] **Step 5: Remove the fields from `src/core/types.ts` and `src/core/game-state.ts`**

`GameSettings` in `types.ts` — delete:
```ts
  voiceVolume?: number;      // 0-1; default 1.0
  voiceEnabled?: boolean;    // default true
```
Default-settings factory in `game-state.ts` — delete:
```ts
    voiceVolume: 1.0,
    voiceEnabled: true,
```

- [ ] **Step 6: Remove the passthroughs in `src/audio/audio-system.ts`**

Delete:
```ts
  setVoiceVolume(volume: number): void {
    this.mixer.setVoiceVolume(volume);
  }

  setVoiceEnabled(enabled: boolean): void {
    this.mixer.setVoiceEnabled(enabled);
  }
```
In `applySettings()`, delete:
```ts
    this.mixer.setVoiceEnabled(settings.voiceEnabled ?? true);
    this.mixer.setVoiceVolume(settings.voiceVolume ?? 1.0);
```

- [ ] **Step 7: Run tests and type-check**

```bash
bash scripts/run-with-mise.sh yarn vitest run tests/ui/pause-menu-panel.test.ts
```
Expected: PASS.
```bash
bash scripts/run-with-mise.sh yarn build
```
Expected: exit 0 (catches any remaining `voiceVolume`/`voiceEnabled` reads — `yarn test` alone would not).

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "refactor(ui): remove Voice audio settings channel

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Remove the voice bus from AudioMixer

**Files:**
- Modify: `src/audio/audio-mixer.ts`, `tests/audio/audio-mixer.test.ts`

**Interfaces:**
- Consumes: nothing calls `mixer.setVoiceVolume`/`setVoiceEnabled`/the `voice` bus after Tasks 1–2.
- Produces: `BusId = 'era' | 'accent' | 'adaptive' | 'stinger' | 'sfx'`; `SnapshotId` without `'voice-duck'`; `MusicBusId` without `'voice'`; snapshot rows without a `voice` key.

- [ ] **Step 1: Update `tests/audio/audio-mixer.test.ts`**

- Construction test: title → `'creates at least 9 GainNodes (4 bus snapshot gains + sfx + ambience + masterGain + musicLayerGain + stingerMasterGain)'`; comment → `// 4 music bus snapshot gains (era,accent,adaptive,stinger) + 1 sfxBus gain + 1 ambienceGain + 3 master gain nodes = 9 minimum`; assertion → `expect(ctx.opsOf('createGain').length).toBeGreaterThanOrEqual(9);`
- In `SNAPSHOT_CASES`, delete the `{ id: 'voice-duck', … }` row.
- In `'new snapshots unrest, brink-of-defeat, voice-duck do not throw'`: title → `'new snapshots unrest, brink-of-defeat do not throw'`; delete `expect(() => mixer.setSnapshot('voice-duck', 0)).not.toThrow();`
- `'constructs with voice bus (new MusicBusId)'` → title `'constructs with stinger bus (Spec 3 topology)'` (body unchanged).
- Delete these three tests entirely: `'setMusicEnabled(false) does not disable setVoiceEnabled/setVoiceVolume'`, `'setMasterVolume(0) does not zero voiceMasterGain — voice bypasses masterGain'`, `'playOneShot on voice bus creates a buffer source node (voice bus in musicBuses)'`.

- [ ] **Step 2: Run the edited test file**

```bash
bash scripts/run-with-mise.sh yarn vitest run tests/audio/audio-mixer.test.ts
```
Expected: PASS. This step only removes/renames assertions, so the edited file is green against the current mixer too (≥9 GainNodes is satisfied by the current 11). The real gate for this task is Step 4's `yarn build` after the source removal — a leftover `'voice'` or `'voice-duck'` usage anywhere fails `tsc`, not vitest.

- [ ] **Step 3: Remove voice from `src/audio/audio-mixer.ts`**

- `BusId`: `'era' | 'accent' | 'adaptive' | 'stinger' | 'sfx'` (drop `'voice'`).
- `SnapshotId`: drop `| 'voice-duck'`.
- `MusicBusId`: `'era' | 'accent' | 'adaptive' | 'stinger'` (drop `'voice'`).
- Delete the header-comment sentence about the voice bus routing (`// voice bus routes through voiceMasterGain …` through `…setVoiceVolume() on voiceMasterGain.`).
- `SNAPSHOTS`: remove the `voice:` key from every row and delete the `'voice-duck'` row entirely, leaving:
```ts
const SNAPSHOTS: Record<SnapshotId, Record<MusicBusId, number>> = {
  silent:             { era: 0.0, accent: 0.00, adaptive: 0.0, stinger: 0.0 },
  peace:              { era: 1.0, accent: 0.70, adaptive: 0.0, stinger: 1.0 },
  'beast-territory':  { era: 1.0, accent: 0.60, adaptive: 0.3, stinger: 1.0 },
  'at-war':           { era: 1.0, accent: 0.50, adaptive: 0.8, stinger: 1.0 },
  unrest:             { era: 1.0, accent: 0.55, adaptive: 0.5, stinger: 1.0 },
  'brink-of-defeat':  { era: 0.7, accent: 0.15, adaptive: 1.0, stinger: 1.0 },
  'stinger-duck':     { era: 0.5, accent: 0.35, adaptive: 0.4, stinger: 1.0 },
};
```
- Delete field declarations `private voiceMasterGain: GainNode;`, `private currentVoiceVolume = 1.0;`, `private voiceEnabled = true;` (and the `voice → destination` comment on the field).
- Constructor: delete the `voiceMasterGain` creation block (the three statements plus its two comment lines), and delete `voice: makeMusicBus(this.voiceMasterGain),` from `this.musicBuses`.
- Delete the whole `// --- Voice volume (bypasses masterGain) ---` section: `setVoiceVolume()` and `setVoiceEnabled()`.

- [ ] **Step 4: Run tests and type-check**

```bash
bash scripts/run-with-mise.sh yarn vitest run tests/audio/audio-mixer.test.ts tests/audio/music-director.test.ts tests/audio/music-director-crisis.test.ts
```
Expected: PASS.
```bash
bash scripts/run-with-mise.sh yarn build
```
Expected: exit 0. (`grep -rn "voice" src/audio/` must return nothing.)

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "refactor(audio): remove voice bus and voice-duck snapshot from mixer

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Delete voice assets, tooling scripts, and stale docs

**Files:**
- Delete: `public/audio/voice/` (11 pack directories, ~1.7 MB), `scripts/gen-voice-manifest.ts`, `scripts/synthesise-voice.sh`, `scripts/synthesise-elevenlabs.py`, `scripts/split-elevenlabs.py`
- Modify: `docs/superpowers/plans/audio-remaining-work.md`

**Interfaces:**
- Consumes: Tasks 1–3 removed every code reference to `audio/voice/` paths; the four scripts are voice-only and referenced by nothing in `package.json`, other scripts, or CI (verified 2026-07-25).
- Produces: no repo artifact references `public/audio/voice`.

- [ ] **Step 1: Delete assets and scripts**

```bash
git rm -r public/audio/voice
git rm scripts/gen-voice-manifest.ts scripts/synthesise-voice.sh scripts/synthesise-elevenlabs.py scripts/split-elevenlabs.py
```

- [ ] **Step 2: Update `docs/superpowers/plans/audio-remaining-work.md`**

- In the "What's complete" list, replace the line `- Voice packs: generic, china, egypt, rome, england, france, viking (70/110 lines real) ✅` with `- ~~Voice packs~~ — removed 2026-07-25: playtest feedback, advisor speech lines cut entirely (see 2026-07-25-remove-civ-voice-packs.md)`.
- Delete the entire `## Priority 1: Voice Curation — 4 Remaining Civs` section including `### Voice MR1: Zulu` through the end of `### Voice MR4: Gondor` (everything up to but not including `## Priority 2: Era 6-12 Combat SFX`).
- In the `## Summary Table` section, delete any rows for Voice MR1–MR4 and renumber/re-title nothing else.
- Do not renumber "Priority 2/3" headings — leave them as-is so historical cross-references stay valid.

- [ ] **Step 3: Repo-wide leftover sweep**

```bash
grep -rni "voicepack\|voice pack\|voice-pack\|voice/\|voiceVolume\|voiceEnabled\|VoiceDirector\|VOICE_CATALOG" src/ tests/ scripts/ public/ docs/superpowers/plans/audio-remaining-work.md package.json
```
Expected: no hits in `src/`, `tests/`, `scripts/`, `public/`, or `package.json`. (Hits in historical spec files under `docs/superpowers/specs/` and in `tests/fixtures/issue-365-crowded-map-save.json` are acceptable — specs are immutable history and the fixture's extra JSON keys are ignored at load. `AUDIO-CREDITS.md` has no voice-pack attribution section — its two "voice recording" mentions are privacy-disclaimer boilerplate about SFX generation and stay.)

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "chore(audio): delete voice pack assets, tooling, and curation docs

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Full verification and PR

**Files:** none new.

- [ ] **Step 1: Worktree push preconditions**

```bash
git config --worktree --get core.hooksPath
```
Expected: `.githooks` (if empty, run `bash scripts/setup-git-hooks.sh`).
```bash
mise trust "$(git rev-parse --show-toplevel)/mise.toml"
```

- [ ] **Step 2: Full test suite + build**

```bash
bash scripts/run-with-mise.sh yarn test
```
Expected: exit 0.
```bash
bash scripts/run-with-mise.sh yarn build
```
Expected: exit 0. If either fails, fix before proceeding — do not push red.

- [ ] **Step 3: Push and open PR** (timeout 120 000 ms — pre-push hook runs the fast tier)

```bash
git push -u origin claude/remove-language-speech-packs-bd899a
```

```bash
gh pr create --title "refactor(audio): remove civ advisor voice packs" --body "$(cat <<'EOF'
## Summary
Removes the entire civ advisor voice/speech-pack system based on playtest feedback: the spoken advisor lines are disliked by the target audience, and no further packs will be curated.

Deleted end-to-end:
- `VoiceDirector`, `VOICE_CATALOG`/`voice-catalog.ts`, `civ-voice-family.ts`, and all `AudioSystem` voice-event subscriptions
- The `voice` mixer bus, `voice-duck` snapshot, and `voiceMasterGain`
- The Voice row in pause-menu audio settings and `voiceVolume`/`voiceEnabled` in `GameSettings` (old saves with those keys load unchanged — extra JSON keys are ignored)
- `public/audio/voice/` (11 packs, 110 OGGs, ~1.7 MB) and the four voice generation scripts
- Voice curation sections of `docs/superpowers/plans/audio-remaining-work.md`

Music (era bases, war layers, accents), stingers, SFX, and ambience are untouched.

## Related issues (to be closed as not planned after merge — intentionally no close keywords)
#421 #423 #424 #623 #624 #625 #626 #627 #628 #629 #630 #631 #632 #633 #634 #635 #636 #637 #638 #639 #640 #641 #642 #643 #644

## Test plan
- `yarn test` and `yarn build` green
- Updated: `pause-menu-panel.test.ts` (4 sliders / 3 checkboxes / no Voice row), `audio-mixer.test.ts` (no voice bus), `audio-catalog.test.ts` (voice describes removed)
- Deleted: `voice-director.test.ts`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4: Wait for CI, then merge per the user's normal review flow** (do not self-merge without the user's go-ahead if that is the session convention).

---

### Task 6: Close the 25 voice-pack GitHub issues (after PR merge)

**Files:** none.

**Interfaces:**
- Consumes: the merged PR number from Task 5 (substitute for `<PR>` below).
- Produces: all voice-pack issues closed as "not planned" with an explanatory comment.

- [ ] **Step 1: Close every voice-pack issue**

Issue inventory (verified open on 2026-07-25):
- Curation (legacy): #421 (Zulu), #423 (Mongolia), #424 (Gondor)
- QA/provenance: #623
- Trackers: #624 (fantasy), #625 (historical)
- Child packs: #626 Ottoman, #627 Prydain, #628 India, #629 Germany, #630 Lothlorien, #631 Babylon, #632 Japan, #633 Annuvin, #634 Russia, #635 Rohan, #636 Greece, #637 The Shire, #638 Spain, #639 Wakanda, #640 Persia, #641 Avalon, #642 Narnia, #643 Atlantis, #644 Isengard

```bash
for n in 421 423 424 623 624 625 626 627 628 629 630 631 632 633 634 635 636 637 638 639 640 641 642 643 644; do
  gh issue close "$n" --reason "not planned" \
    --comment "Closing as not planned: playtest feedback showed the civ advisor voice/speech packs aren't enjoyed by the target audience, so the entire voice-line system (playback engine, catalog, settings, assets, and generation tooling) was removed in PR #<PR>. No further packs will be curated."
done
```

- [ ] **Step 2: Verify**

```bash
gh issue list --state open --limit 300 --json number,title -q '.[] | select(.title | test("voice|Voice")) | "\(.number) \(.title)"'
```
Expected: no output.

- [ ] **Step 3: Leave a note on the placeholder-audit tracker #622**

#622 tracks all placeholder audio/art; its voice-pack rows are now moot. Do not close it — comment only:

```bash
gh issue comment 622 --body "Voice-pack placeholder rows are obsolete: the advisor voice system was removed entirely in PR #<PR> (see issues #623–#644, closed as not planned)."
```
