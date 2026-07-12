# MR1 — Audio Resilience (#550) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task inline (this repo forbids subagents — see CLAUDE.md Agent Policy). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A loaded game can never be silently muted: the AudioContext unlock retries until it works, save-embedded audio settings are reconciled with the player's persisted settings, and the pause menu shows true audio state.

**Architecture:** Three independent hardening changes to `src/audio/audio-system.ts` and the settings flow in `src/main.ts`. No new systems; no state-schema change.

**Tech Stack:** TypeScript, vitest, Web Audio API.

## Global Constraints

- All commands via `bash scripts/run-with-mise.sh yarn <cmd>` (never `mise activate`).
- Worktree required; run `mise trust <worktree>/mise.toml` before first push.
- `yarn build` (tsc) AND `yarn test` must both exit 0 before push.
- Tests live in `tests/` mirroring `src/`.
- No `Math.random()`; no `innerHTML` with game strings; buttons via `createGameButton()`.

## Background for the implementer (zero-context)

- `AudioSystem` (src/audio/audio-system.ts) wraps an `AudioContext` created at
  module load in src/main.ts (~line 306). Browsers create such contexts
  `suspended` until a user gesture.
- `armIosResume()` (src/audio/audio-system.ts:521–539) registers a **one-shot**
  `pointerdown` handler that calls `tryResume()` and immediately removes itself
  — if `ctx.resume()` fails or races on that first tap (observed on macOS
  Safari), audio is silent forever. This is bug candidate 1.
- `audio.start(state, …)` calls `this.applySettings(state)` — audio settings
  come from the **save file's** `state.settings`. The pause-menu audio UI
  (src/main.ts ~1667–1678) reads the **global** `persistedSettings` instead.
  Two sources of truth: a stale save loads silent while the menu shows sound
  on. This is bug candidate 2.
- Hot-seat handoff mutes via `audio.setMasterVolume(0)` (src/main.ts:3283,
  4166) and restores in `releaseHandoffToViewer` / the `enterCampaign` onReady
  callback. Solo load never mutes; no change needed there, but Task 3's
  diagnostics make any future regression of this class visible.

---

### Task 1: Gesture unlock retries until the context is running

**Files:**
- Modify: `src/audio/audio-system.ts:521-539` (`armIosResume`)
- Test: `tests/audio/audio-system-unlock.test.ts` (new)

**Interfaces:**
- Produces: no API change; behavioral contract "pointerdown listener stays armed until `ctx.state === 'running'`".

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi } from 'vitest';
import { AudioSystem } from '@/audio/audio-system';

function makeStubCtx(resumeBehavior: Array<'fail' | 'ok'>) {
  let call = 0;
  const ctx: any = {
    state: 'suspended',
    resume: vi.fn(async () => {
      const behavior = resumeBehavior[Math.min(call, resumeBehavior.length - 1)];
      call += 1;
      if (behavior === 'ok') ctx.state = 'running';
      else throw new Error('NotAllowedError');
    }),
    createGain: () => ({ connect: () => {}, gain: { value: 1, setValueAtTime: () => {} } }),
    destination: {},
    currentTime: 0,
  };
  return ctx;
}

describe('AudioContext gesture unlock', () => {
  it('keeps the pointerdown handler armed until resume actually succeeds', async () => {
    const ctx = makeStubCtx(['fail', 'ok']);
    const audio = new AudioSystem(ctx);
    (audio as any).armIosResume();

    document.dispatchEvent(new Event('pointerdown'));
    await vi.waitFor(() => expect(ctx.resume).toHaveBeenCalledTimes(1));
    expect(ctx.state).toBe('suspended'); // first attempt failed

    document.dispatchEvent(new Event('pointerdown'));
    await vi.waitFor(() => expect(ctx.resume).toHaveBeenCalledTimes(2));
    expect(ctx.state).toBe('running');

    // Handler must now be disarmed: further taps do not call resume again.
    document.dispatchEvent(new Event('pointerdown'));
    await new Promise(r => setTimeout(r, 10));
    expect(ctx.resume).toHaveBeenCalledTimes(2);
  });
});
```

Note: if `AudioSystem`'s constructor needs more of the ctx surface than the
stub provides, extend the stub with no-op methods until construction succeeds —
do not weaken the assertions. If `armIosResume` is private, either invoke via
`(audio as any)` as shown, or (preferred) export a small internal for tests via
the existing pattern in this file if one exists — check first.

- [ ] **Step 2: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/audio/audio-system-unlock.test.ts`
Expected: FAIL — third assertion (`toHaveBeenCalledTimes(2)` after second tap) fails because the current handler self-removed after the first failed attempt, so resume is called only once.

- [ ] **Step 3: Make the handler self-remove only on success**

Replace the gesture-resume block in `armIosResume` with:

```ts
    // Gesture resume: AudioContext created before the first user interaction is
    // suspended by the browser. Retry on every tap until the context is
    // actually running — a single failed resume() (seen on macOS Safari) must
    // not permanently disarm the unlock. Disarm only once state === 'running'.
    this.gestureResumeHandler = () => {
      void this.tryResume().then(() => {
        if (this.ctx.state === 'running' && this.gestureResumeHandler) {
          document.removeEventListener('pointerdown', this.gestureResumeHandler);
          this.gestureResumeHandler = null;
        }
      }).catch(() => { /* stay armed; next tap retries */ });
    };
    document.addEventListener('pointerdown', this.gestureResumeHandler);
```

Also harden `tryResume` so a rejected `resume()` does not propagate:

```ts
  private async tryResume(): Promise<void> {
    if (this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume();
      } catch {
        // Browser refused (no valid gesture yet) — caller stays armed and retries.
      }
    }
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/audio/audio-system-unlock.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/audio/audio-system-unlock.test.ts src/audio/audio-system.ts
git commit -m "fix(audio): retry AudioContext gesture unlock until running (#550)"
```

### Task 2: One source of truth for audio settings on load

**Files:**
- Create: `src/core/audio-settings.ts`
- Modify: `src/main.ts` `startGame()` (~line 4563, just before `audio.start(...)`)
- Test: `tests/core/audio-settings.test.ts` (new)

**Interfaces:**
- Produces: `reconcileAudioSettings(saveSettings: GameState['settings'], persisted: GameState['settings'] | undefined): GameState['settings']` — returns saveSettings with the seven audio fields (`soundEnabled`, `musicEnabled`, `musicVolume`, `sfxVolume`, `voiceVolume`, `voiceEnabled`, `stingerVolume`, `stingerEnabled`) overlaid from `persisted` when persisted defines them. Persisted wins because the pause menu writes it on every change — it is the player's latest expressed intent; the save's copy is frozen at save time.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { reconcileAudioSettings } from '@/core/audio-settings';
import { createDefaultSettings } from '@/core/game-state';

describe('reconcileAudioSettings', () => {
  it('overlays persisted audio fields onto save-embedded settings', () => {
    const save = { ...createDefaultSettings('small'), musicEnabled: false, musicVolume: 0 };
    const persisted = { ...createDefaultSettings('small'), musicEnabled: true, musicVolume: 0.8 };
    const merged = reconcileAudioSettings(save, persisted);
    expect(merged.musicEnabled).toBe(true);
    expect(merged.musicVolume).toBe(0.8);
  });

  it('keeps non-audio save settings untouched', () => {
    const save = { ...createDefaultSettings('large') };
    const persisted = { ...createDefaultSettings('small') };
    const merged = reconcileAudioSettings(save, persisted);
    expect(merged.mapSize).toBe('large');
  });

  it('returns save settings unchanged when nothing is persisted', () => {
    const save = { ...createDefaultSettings('small'), musicVolume: 0.3 };
    expect(reconcileAudioSettings(save, undefined).musicVolume).toBe(0.3);
  });

  it('falls back to save values for audio fields persisted settings lack', () => {
    const save = { ...createDefaultSettings('small'), voiceVolume: 0.5 };
    const persisted = { ...createDefaultSettings('small') } as any;
    delete persisted.voiceVolume;
    expect(reconcileAudioSettings(save, persisted).voiceVolume).toBe(0.5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/core/audio-settings.test.ts`
Expected: FAIL — module `@/core/audio-settings` does not exist.

- [ ] **Step 3: Implement**

```ts
// src/core/audio-settings.ts
import type { GameState } from './types';

type Settings = GameState['settings'];

const AUDIO_FIELDS = [
  'soundEnabled', 'musicEnabled', 'musicVolume', 'sfxVolume',
  'voiceVolume', 'voiceEnabled', 'stingerVolume', 'stingerEnabled',
] as const;

// Persisted global settings win over the save's frozen copy: the pause menu
// writes persisted settings on every change, so they are the player's latest
// intent. The save's audio fields are only a fallback for fresh installs.
export function reconcileAudioSettings(
  saveSettings: Settings,
  persisted: Settings | undefined,
): Settings {
  if (!persisted) return saveSettings;
  const merged: Settings = { ...saveSettings };
  for (const field of AUDIO_FIELDS) {
    if (persisted[field] !== undefined) {
      (merged as any)[field] = persisted[field];
    }
  }
  return merged;
}
```

Check `GameState['settings']` in src/core/types.ts for the exact audio field
names before finalizing `AUDIO_FIELDS` — if any of the eight names differ,
use the type's names (the test will catch typos via tsc).

- [ ] **Step 4: Wire into startGame**

In `src/main.ts`, immediately before `audio.start(...)` in `startGame()`:

```ts
  gameState.settings = reconcileAudioSettings(gameState.settings, persistedSettings);
```

Add the import alongside the other `@/core/*` imports:

```ts
import { reconcileAudioSettings } from '@/core/audio-settings';
```

- [ ] **Step 5: Run tests and build**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/core/audio-settings.test.ts` → PASS
Run: `bash scripts/run-with-mise.sh yarn build` → exit 0

- [ ] **Step 6: Commit**

```bash
git add src/core/audio-settings.ts tests/core/audio-settings.test.ts src/main.ts
git commit -m "fix(audio): reconcile save-embedded audio settings with persisted settings on load (#550)"
```

### Task 3: Audio diagnostics in the pause menu

**Files:**
- Modify: `src/audio/audio-system.ts` (add `getDiagnostics()`)
- Modify: `src/ui/pause-menu-panel.ts` (render a status line in the audio section)
- Test: `tests/audio/audio-system-unlock.test.ts` (extend), `tests/ui/pause-menu-panel.test.ts` (extend if it exists; create otherwise following the panel-test pattern in tests/ui/)

**Interfaces:**
- Produces: `AudioSystem.getDiagnostics(): { contextState: 'running' | 'suspended' | 'closed'; masterVolume: number; musicEnabled: boolean; sfxEnabled: boolean }`

- [ ] **Step 1: Write the failing test** (append to tests/audio/audio-system-unlock.test.ts)

```ts
  it('reports context state and effective volumes', () => {
    const ctx = makeStubCtx(['ok']);
    const audio = new AudioSystem(ctx);
    audio.setMasterVolume(0.7);
    const diag = audio.getDiagnostics();
    expect(diag.contextState).toBe('suspended');
    expect(diag.masterVolume).toBeCloseTo(0.7);
    expect(typeof diag.musicEnabled).toBe('boolean');
    expect(typeof diag.sfxEnabled).toBe('boolean');
  });
```

- [ ] **Step 2: Run to verify failure, then implement**

`getDiagnostics()` on `AudioSystem`: read `this.ctx.state`, the mixer's master
gain value and enabled flags — the mixer (`src/audio/audio-mixer.ts`) owns
`setMusicEnabled`/`setSfxEnabled`; add tiny getters there if none exist
(`isMusicEnabled(): boolean`, `isSfxEnabled(): boolean`, `getMasterVolume(): number`).

- [ ] **Step 3: Render in pause menu**

In `src/ui/pause-menu-panel.ts`, in the audio settings section, add a status
line (plain text via `textContent`, no innerHTML):

```ts
  const diag = options.getAudioDiagnostics();
  const statusLine = document.createElement('p');
  statusLine.dataset.role = 'audio-status';
  statusLine.style.cssText = 'font-size:11px;color:#9aa5b1;margin:4px 0;';
  statusLine.textContent = diag.contextState === 'running'
    ? `Audio engine: on (master ${Math.round(diag.masterVolume * 100)}%)`
    : 'Audio engine: waiting for a tap/click to unlock sound';
  audioSection.appendChild(statusLine);
```

Thread `getAudioDiagnostics: () => audio.getDiagnostics()` through the pause
menu's options object from src/main.ts (find where the pause menu is
constructed — grep `pause-menu-panel` in src/main.ts — and add the callback
to its options; extend the options interface in pause-menu-panel.ts).

UI test asserts: rendering the panel with a stubbed `getAudioDiagnostics`
returning `contextState: 'suspended'` shows the "waiting for a tap" text, and
with `'running'` shows the percentage line.

- [ ] **Step 4: Full test + build, commit**

```bash
bash scripts/run-with-mise.sh yarn test
bash scripts/run-with-mise.sh yarn build
git add -A && git commit -m "feat(audio): pause-menu audio diagnostics line (#550)"
```

### Task 4: Manual verification against the repro

- [ ] Start dev server (`bash scripts/run-with-mise.sh yarn dev`), load a solo
  save, click once anywhere, confirm music starts and SFX play on end-turn.
- [ ] Open pause menu → audio section shows "Audio engine: on".
- [ ] In devtools set `ctx` suspended (or test in Safari): status line shows
  the unlock hint; one click flips it.
- [ ] Load an OLD save (from before this MR) — sound must follow the pause-menu
  settings, not the save's embedded copy.

---

## Inline Dimension Review

- **Gameplay balance:** No gameplay effect — audio infrastructure only.
- **Fun:** Restores music/SFX, the game's primary feel channel; silent sessions were the #1 reported atmosphere killer.
- **New mechanics:** None — deliberately. Bug-class hardening only.
- **Ages 7–43:** The diagnostics line uses plain words ("waiting for a tap to unlock sound"), readable by the 7-year-old; no jargon like "AudioContext suspended".
- **Play styles:** Neutral — applies equally to all.
- **Difficulty modes:** Not applicable; audio is challenge-independent.
- **AI usage:** Not applicable.
- **UI:** One new status line in an existing pause-menu section; no layout change; textContent only (XSS-safe).
- **UX:** Converts an invisible failure ("why is it silent?") into a visible, self-explaining state with a recovery instruction — the core fix for the bug report's confusion.
- **Architecture:** Fix stays inside AudioSystem/mixer boundaries; settings reconciliation is a pure function in `src/core/`, testable without DOM or audio.
- **Extensibility:** `getDiagnostics()` gives future audio work (e.g. a HUD mute icon) a stable read surface; `AUDIO_FIELDS` is one list to extend when new audio settings appear.
- **Data:** No schema change; no new state fields.
- **SFX:** No new SFX. Verification explicitly checks end-turn SFX after unlock.
- **Saved games:** Old saves with stale/missing audio fields now inherit persisted settings — that is the fix itself. `reconcileAudioSettings` tolerates missing fields on both sides (tested).
- **Testing:** Unit tests for retry-until-running, reconciliation matrix (4 cases), diagnostics shape; UI test for both status-line states; manual repro checklist.
- **Solo regressions:** Solo load path is the bug path; Task 4 verifies it directly.
- **Hot-seat regressions:** Handoff mute/restore untouched; diagnostics line would expose any future stuck-at-0 master volume, which is the hot-seat failure mode.
- **Implementation correctness:** The one-shot→retry change is the only behavioral edit to the unlock path; disarm still happens (on success), so no per-tap resume() spam after unlock.
