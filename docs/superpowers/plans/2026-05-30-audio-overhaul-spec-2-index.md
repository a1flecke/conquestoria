# Spec 2 Audio Overhaul — Index Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add combat and movement SFX to Conquestoria in three shippable MRs.

**Architecture:** A new `src/audio/sfx-catalog.ts` mirrors `audio-catalog.ts`'s `TrackEntry` shape and registers every unit SFX slot as a `ph()` placeholder. A thin director layer (`sfx-director.ts`, MR2) subscribes to `combat:resolved` and `unit:move` events and calls `mixer.playOneShot('sfx', buffer)`. Curation MRs replace placeholders with real OGGs.

**Tech Stack:** TypeScript, Vite, Web Audio API (AudioMixer already has an `sfx` bus), Vitest for tests.

---

## MR1 — SFX Catalog + Placeholder OGGs + Preloading

**Plan file:** [`2026-05-30-audio-overhaul-spec-2-mr1-sfx-catalog.md`](./2026-05-30-audio-overhaul-spec-2-mr1-sfx-catalog.md)

**Deliverable:** `src/audio/sfx-catalog.ts` with 63 placeholder entries, matching OGG stubs under `public/audio/sfx/`, catalog integrity tests, and `preloadSfx()` wired into `AudioSystem.start()`.

**No player-visible change** — the SFX bus plays nothing until MR2 wires the director.

---

## MR2 — SFX Director (trigger layer)

**Plan file:** TBD (create when MR1 merges)

**Deliverable:** `src/audio/sfx-director.ts` that subscribes to `combat:resolved`, `unit:move`, and `unit:destroyed` events and plays one-shot SFX via `mixer.playOneShot('sfx', buffer)`. Movement scheduling: N sounds at `MOVEMENT_MS_PER_HEX` (220 ms) intervals via `setTimeout` for a path of length N.

**Event payloads consumed:**
- `combat:resolved` — `{ attackerId, defenderId, attackerSurvived, defenderSurvived }` → look up `state.units[id].type` for unit type
- `unit:move` — `{ unitId, path: HexCoord[] }` → locomotion class from `getLocomotionClass(unitType)`
- `unit:destroyed` — `{ unitId }` → play death sound for non-combat unit deaths

---

## MR3+ — Audio Curation

Replace placeholder OGGs with real CC0/CC-BY assets sourced from kenney.nl and freesound.org. Encode with `ffmpeg -i input -vn -c:a libvorbis -q:a 2 output.ogg`. Update `bpm: 0` and `key: 'placeholder'` fields with real values. Attribution in `AUDIO-CREDITS.md`.

---

## Cross-cutting notes

- `UNIT_MOTION_STYLES` in `src/renderer/sprites/sprite-catalog.ts` is the locomotion class source of truth. `getLocomotionClass()` in `sfx-catalog.ts` must stay in sync — comment in both files.
- `mixer.playOneShot('sfx', buffer)` is already wired; the SFX bus is live. MR2 just needs to call it.
- OGG files go in `public/audio/sfx/`. File naming: `<unittype-or-locomotion>-<sfxclass>.ogg`.
- Attribution for real audio: add to `AUDIO-CREDITS.md`. CC0 or CC-BY 3.0/4.0 only — no SA or NC licenses.
