# Spec 3 MR4 — Mixer UI (5-Channel Sliders)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the pause menu with 5-channel audio sliders (master / music / SFX / voice / stinger), each with an enable toggle; persist the new settings through the existing settings mechanism in `main.ts`.

**Architecture:** The existing pause menu panel (`src/ui/pause-menu-panel.ts`) gets a new "Audio Settings" section. Each row has a labeled toggle (checkbox) and a range slider (0–1). Values are stored in `GameSettings` (already extended in MR1) and applied to `AudioSystem` on change. Settings are persisted on the next auto-save or save-game call (the existing persistence path handles them automatically since they live in `GameSettings`).

**Prerequisite:** MR1 merged (`GameSettings` has `voiceVolume`, `voiceEnabled`, `stingerVolume`, `stingerEnabled`; `AudioSystem` exposes `setVoiceVolume`, `setVoiceEnabled`, `setStingerVolume`, `setStingerEnabled`, `setMasterVolume`).

**Tech Stack:** TypeScript, DOM APIs, Vitest.

**No new files** — all changes are to existing files. Total DOM changes are additive (new section; no removals).

---

## File map

| Action | Path |
|---|---|
| Modify | `src/ui/pause-menu-panel.ts` |
| Modify | `src/main.ts` (pass AudioSystem + settings to pause menu) |

---

## Background: current pause menu

`src/ui/pause-menu-panel.ts` exposes `showPauseMenu(container, callbacks)`. The `PauseMenuCallbacks` interface has `turn`, `civName`, `onResume`, `onSave`, `onNewGame`, `autoSave`. There are no audio settings controls in the current menu.

The panel is assembled by `buildMainView()` which creates Resume / Save / New Game buttons. We will add an "Audio Settings" section at the bottom of this view.

---

## Task 1: Extend `PauseMenuCallbacks` and build audio settings section

**Files:**
- Modify: `src/ui/pause-menu-panel.ts`

- [ ] **Step 1.1: Add audio callbacks to `PauseMenuCallbacks`**

Find the `PauseMenuCallbacks` interface and extend it:

```typescript
export interface PauseMenuCallbacks {
  turn: number;
  civName: string;
  onResume: () => void;
  onSave: (slotId: string, name: string) => Promise<void>;
  onNewGame: () => void;
  autoSave: () => Promise<void>;
  // Audio settings (Spec 3)
  audioSettings: {
    masterVolume: number;
    musicVolume: number;
    sfxVolume: number;
    voiceVolume: number;
    stingerVolume: number;
    musicEnabled: boolean;
    soundEnabled: boolean;
    voiceEnabled: boolean;
    stingerEnabled: boolean;
  };
  onAudioSettingChange: (key: string, value: number | boolean) => void;
}
```

- [ ] **Step 1.2: Write `buildAudioSettings()` helper**

Add this function to `pause-menu-panel.ts` (before `buildMainView`):

```typescript
function buildAudioSettings(callbacks: PauseMenuCallbacks): HTMLElement {
  const section = document.createElement('div');
  Object.assign(section.style, {
    borderTop: '1px solid rgba(255,255,255,0.1)',
    paddingTop: '12px',
    marginTop: '12px',
  });

  const heading = document.createElement('p');
  heading.textContent = 'Audio';
  Object.assign(heading.style, {
    margin: '0 0 8px',
    fontSize: '11px',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    opacity: '0.5',
    color: '#fff',
  });
  section.appendChild(heading);

  type AudioRow = { label: string; volumeKey: string; enabledKey: string };
  const rows: AudioRow[] = [
    { label: 'Master',  volumeKey: 'masterVolume',  enabledKey: '' },          // no enable toggle for master
    { label: 'Music',   volumeKey: 'musicVolume',   enabledKey: 'musicEnabled' },
    { label: 'SFX',     volumeKey: 'sfxVolume',     enabledKey: 'soundEnabled' },
    { label: 'Voice',   volumeKey: 'voiceVolume',   enabledKey: 'voiceEnabled' },
    { label: 'Stinger', volumeKey: 'stingerVolume', enabledKey: 'stingerEnabled' },
  ];

  const s = callbacks.audioSettings;

  for (const row of rows) {
    const rowEl = document.createElement('div');
    Object.assign(rowEl.style, {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      marginBottom: '6px',
    });

    // Label
    const label = document.createElement('span');
    label.textContent = row.label;
    Object.assign(label.style, {
      fontSize: '13px',
      color: '#ccc',
      width: '52px',
      flexShrink: '0',
    });
    rowEl.appendChild(label);

    // Slider
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = '1';
    slider.step = '0.05';
    slider.value = String((s as Record<string, number | boolean>)[row.volumeKey] ?? 1);
    Object.assign(slider.style, { flex: '1', minHeight: '44px', cursor: 'pointer' });
    slider.addEventListener('input', () => {
      callbacks.onAudioSettingChange(row.volumeKey, Number(slider.value));
    });
    rowEl.appendChild(slider);

    // Enable toggle (skip for master)
    if (row.enabledKey) {
      const toggle = document.createElement('input');
      toggle.type = 'checkbox';
      toggle.checked = Boolean((s as Record<string, number | boolean>)[row.enabledKey] ?? true);
      Object.assign(toggle.style, { width: '20px', height: '20px', cursor: 'pointer', minHeight: '44px' });
      toggle.addEventListener('change', () => {
        callbacks.onAudioSettingChange(row.enabledKey, toggle.checked);
      });
      rowEl.appendChild(toggle);
    }

    section.appendChild(rowEl);
  }

  return section;
}
```

- [ ] **Step 1.3: Call `buildAudioSettings` from `buildMainView`**

In `buildMainView()`, after the `newGameBtn` is appended, add:

```typescript
  body.appendChild(buildAudioSettings(callbacks));
```

- [ ] **Step 1.4: Run build — expect TypeScript error for missing `audioSettings` + `onAudioSettingChange` in callers**

```bash
bash scripts/run-with-mise.sh yarn build 2>&1 | tail -20
```

Expected: errors at `showPauseMenu` call sites in `main.ts`. Fix in Task 2.

- [ ] **Step 1.5: Commit skeleton**

```bash
git add src/ui/pause-menu-panel.ts
git commit -m "feat(spec3-mr4): add 5-channel audio settings section to pause menu"
```

---

## Task 2: Wire audio settings into `main.ts`

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 2.1: Find the `showPauseMenu` call**

```bash
grep -n "showPauseMenu" src/main.ts
```

Note the line number. It should look like:

```typescript
showPauseMenu(container, {
  turn: gameState.turn,
  civName: currentCiv()?.name ?? '?',
  onResume: ...,
  onSave: ...,
  onNewGame: ...,
  autoSave: ...,
});
```

- [ ] **Step 2.2: Extend the call with audio callbacks**

Add `audioSettings` and `onAudioSettingChange` to the callback object:

```typescript
showPauseMenu(container, {
  turn: gameState.turn,
  civName: currentCiv()?.name ?? '?',
  onResume: ...,
  onSave: ...,
  onNewGame: ...,
  autoSave: ...,
  // Spec 3 audio settings
  audioSettings: {
    masterVolume:   1.0,   // master has no persisted field — always starts at 1.0; reset on each game load
    musicVolume:    gameState.settings.musicVolume,
    sfxVolume:      gameState.settings.sfxVolume,
    voiceVolume:    gameState.settings.voiceVolume   ?? 1.0,
    stingerVolume:  gameState.settings.stingerVolume ?? 1.0,
    musicEnabled:   gameState.settings.musicEnabled,
    soundEnabled:   gameState.settings.soundEnabled,
    voiceEnabled:   gameState.settings.voiceEnabled  ?? true,
    stingerEnabled: gameState.settings.stingerEnabled ?? true,
  },
  onAudioSettingChange: (key: string, value: number | boolean) => {
    // Mutate settings in place
    (gameState.settings as Record<string, number | boolean>)[key] = value;
    // Apply to audio system immediately
    switch (key) {
      case 'masterVolume':   audioSystem.setMasterVolume(value as number); break;
      case 'musicVolume':    audioSystem.setMusicVolume(value as number); break;
      case 'sfxVolume':      audioSystem.setSfxVolume(value as number); break;
      case 'voiceVolume':    audioSystem.setVoiceVolume(value as number); break;
      case 'stingerVolume':  audioSystem.setStingerVolume(value as number); break;
      case 'musicEnabled':   audioSystem.setMusicEnabled(value as boolean); break;
      case 'soundEnabled':   audioSystem.setSfxEnabled(value as boolean); break;
      case 'voiceEnabled':   audioSystem.setVoiceEnabled(value as boolean); break;
      case 'stingerEnabled': audioSystem.setStingerEnabled(value as boolean); break;
    }
    // Settings are persisted on next save (existing auto-save path handles this)
  },
});
```

- [ ] **Step 2.3: Build**

```bash
bash scripts/run-with-mise.sh yarn build 2>&1 | tail -10
```

Expected: 0 errors.

- [ ] **Step 2.4: Commit**

```bash
git add src/main.ts
git commit -m "feat(spec3-mr4): wire audio settings callbacks into showPauseMenu call in main.ts"
```

---

## Task 3: Verify settings persistence

Settings in `GameSettings` are saved to IndexedDB via the existing `autoSave()` / `onSave()` path. No new persistence code is needed because `gameState.settings` is already serialised on every save. Verify by tracing the save path:

- [ ] **Step 3.1: Confirm `gameState.settings` is included in saved data**

```bash
grep -n "settings\|GameSettings" src/main.ts | grep -E "save|persist|IndexedDB|store" | head -10
```

If `gameState` (which contains `settings`) is passed directly to the save function, persistence is automatic. Confirm and move on.

- [ ] **Step 3.2: Verify defaults on fresh load**

The `main.ts` defaults added in MR1 ensure old saves without the new fields default to `1.0` / `true`:

```bash
grep -n "voiceVolume\|stingerVolume\|voiceEnabled\|stingerEnabled" src/main.ts
```

Expected: 4 default assignment lines (added in MR1 Task 6).

---

## Task 4: Final MR4 verification

- [ ] **Step 4.1: Full test suite + build**

```bash
bash scripts/run-with-mise.sh yarn test 2>&1 | tail -5
bash scripts/run-with-mise.sh yarn build 2>&1 | tail -5
```

Expected: both clean.

- [ ] **Step 4.2: Manual smoke test**

Run the dev server and verify:

```bash
bash scripts/run-with-mise.sh yarn dev
```

1. Start a new game.
2. Open pause menu (pause button).
3. Verify "Audio" section appears with 5 rows: Master, Music, SFX, Voice, Stinger.
4. Move the Music slider — music volume changes audibly.
5. Uncheck the Music toggle — music mutes; SFX continues.
6. Recheck toggle — music resumes.
7. Move Voice slider — no audible change yet (voice lines are placeholders), but no error.
8. Close pause menu, re-open — slider values persist at their set positions.

- [ ] **Step 4.3: Verify `createGameButton` rule compliance**

The audio settings section uses `<input type="range">` and `<input type="checkbox">` — not `<button>`. The `no-bare-buttons` rule only applies to `createElement('button')`. No violation.

```bash
grep -n "createElement('button')" src/ui/pause-menu-panel.ts
```

Expected: only `createGameButton()` calls; no raw button elements in the new section.

- [ ] **Step 4.4: Commit final**

```bash
git add src/ui/pause-menu-panel.ts src/main.ts
git commit -m "feat(spec3-mr4): complete 5-channel mixer UI with settings persistence — Spec 3 MR4 done"
```
