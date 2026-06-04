# Audio Overhaul Spec 3 — Index Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add adaptive music states (unrest, brink-of-defeat), complete the stinger catalog (6 new slots), add civ-specific advisor voice lines via a fully data-driven architecture, restructure the mixer for per-channel volume control, and ship a 5-channel settings UI.

**Architecture:** Four sequential MRs. MR1 (mixer + catalog foundations) gates everything else. MR2 (state machine + stinger wiring) gates nothing but should merge before MR3. MR3 (voice system) and MR4 (mixer UI) can be developed in parallel after MR1 merges. Curation MRs (real assets replacing placeholders) are parallel-safe after MR1 merges.

**Spec:** `docs/superpowers/specs/2026-05-15-audio-overhaul-spec-3-adaptive-voice.md`

**Tech Stack:** TypeScript, Vite, Web Audio API, Vitest, ffmpeg (on PATH via mise).

---

## MR Summary

| MR | Plan file | Scope | Gate |
|---|---|---|---|
| MR1 | `2026-06-03-audio-overhaul-spec-3-mr1-mixer-catalog.md` | Mixer topology split, new snapshots, UNREST/DEFEAT catalog entries, 6 new stinger slots, placeholder OGGs, new GameEvents, extended handoff payload, new GameSettings fields | All MRs depend on this |
| MR2 | `2026-06-03-audio-overhaul-spec-3-mr2-state-machine.md` | MusicDirector flag-based resolver, revolt handler, new stinger wiring, handleGameEnded revision, game event emission (near-defeat/eliminated/recovered) | Depends on MR1 |
| MR3 | `2026-06-03-audio-overhaul-spec-3-mr3-voice.md` | voice-catalog.ts, civ-voice-family.ts, VoiceDirector, EVENT_TO_VOICE/EVENTS_WITH_STINGER, voice bus wiring, 110 placeholder OGGs, synthesis scripts | Depends on MR1 |
| MR4 | `2026-06-03-audio-overhaul-spec-3-mr4-mixer-ui.md` | 5-channel sliders in pause menu, settings persistence | Depends on MR1 |

## Dependency order

```
MR1 (mixer + catalog)
├── MR2 (state machine + stingers)
├── MR3 (voice) — parallel with MR2
└── MR4 (mixer UI) — parallel with MR2 + MR3
```

All MRs are safe to merge independently after MR1. No player-visible regression is possible from MR1 alone — it only adds silent placeholders and splits gain nodes that had identical behavior before and after.

## Cross-MR type reference

These are defined in MR1 and referenced in all later MRs. Do not redefine them.

```typescript
// src/core/types.ts additions (MR1):
// GameEvents additions:
'civ:near-defeat':                { civId: string }
'civ:recovered-from-near-defeat': { civId: string }
'civ:eliminated':                 { civId: string; eliminatedBy: string }
// Extended:
'currentPlayer:changed-after-handoff': { civId: string; atWar: boolean; unrestCityCount: number; nearDefeat: boolean }

// Civilization additions:
nearDefeat?: boolean   // true when cities.length <= 1

// GameSettings additions:
voiceVolume: number     // 0-1, default 1.0
voiceEnabled: boolean   // default true
stingerVolume: number   // 0-1, default 1.0
stingerEnabled: boolean // default true

// src/audio/audio-mixer.ts additions (MR1):
type SnapshotId = 'silent' | 'peace' | 'at-war' | 'unrest' | 'brink-of-defeat' | 'stinger-duck' | 'voice-duck'
type MusicBusId = 'era' | 'accent' | 'adaptive' | 'stinger' | 'voice'
// New methods: setMasterVolume, setStingerVolume, setStingerEnabled, setVoiceVolume, setVoiceEnabled
// Renamed: setMasterMusicVolume → setMasterVolume (update all callers)
```
