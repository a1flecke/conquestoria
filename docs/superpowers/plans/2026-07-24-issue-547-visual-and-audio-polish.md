# Issue 547 Visual and Audio Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Repository subagent
> approval rules still apply.

**Goal:** Replace every temporary combat-program visual and audio mapping in small
independent batches without changing mechanics, information boundaries, or save data.

**Architecture:** Repo-native SVG components register through the canonical sprite
catalog. Provenance-cleared offline audio registers through the existing SFX catalog,
mixer, and event director. Both lanes consume stable IDs/events created by mechanics PRs.

**Tech Stack:** TSX/SVG, Canvas sprite renderer, Web Audio mixer, Vitest catalog/routing
tests.

---

## Tasks 44–49: Visual batches

Each task modifies `src/renderer/sprites/v2/index.ts`,
`src/renderer/sprites/sprite-catalog.ts`, and focused new
`src/renderer/sprites/v2/*.svg.ts` components; crisis route/fort markers remain in their
focused renderer modules. Tests:
`tests/renderer/sprites/v2/index.test.ts`,
`tests/renderer/sprites/sprite-catalog.test.ts`,
`tests/renderer/sprites/sprite-system.test.ts`, and relevant unit/improvement/overlay
tests.

1. **Task 44:** Chariot, distinct Cavalry/Cuirassier silhouettes, Beast Handler, War
   Elephant.
2. **Task 45:** Armored Car, Anti-Tank Gun, Mechanized Infantry, Main Battle Tank.
3. **Task 46:** WWII Fighter, Mobile AA, SAM Site, Radar Station.
4. **Task 47:** Trebuchet, Rocket Artillery, Battleship, Missile Cruiser.
5. **Task 48:** Fort/Citadel state variants, Coastal Battery, Bunker.
6. **Task 49:** Stampede herd, Rogue Handler, Rogue Elephant, route marker.

For each batch, first add failing unique-ID/catalog and semantic marker tests. Implement
readable 128×128 units or 192×192 buildings in the repo-native style; verify at map size,
selected/disabled/high-contrast states, mobile scale, fog, color-vision-independent
silhouette, and reduced motion. Delete only the batch's temporary mapping, record
provenance, and capture representative rendered screenshots. Do not alter definitions or
balance.

## Tasks 50–55: Audio batches

Each task modifies `src/audio/sfx-catalog.ts`,
`src/audio/sfx-director.ts`, appropriate source/provenance catalogs, and `public/audio/`
assets; tests `tests/audio/sfx-catalog.test.ts`,
`tests/audio/sfx-director.test.ts`, `tests/audio/sfx-routing.test.ts`,
`tests/audio/audio-mixer.test.ts`, plus source/provenance checks.

1. **Task 50:** ancient mounted and beast combat.
2. **Task 51:** industrial vehicles and anti-armor.
3. **Task 52:** air combat and air-defense alerts.
4. **Task 53:** siege and naval heavy weapons.
5. **Task 54:** fort construction, completion, damage, pillage, and repair.
6. **Task 55:** Stampede/Host warning, movement, command break, and resolution.

For each batch, add failing event-to-cue and mute/volume tests, then register offline-safe
assets through the mixer. Coalesce repeated multi-actor cues in a bounded window; route
one representative attack, death, movement, lifecycle, warning, and resolution event as
applicable. Test no hidden hot-seat activity leaks through sound, muted playback keeps
the visual/text event, missing assets fail soft, and no direct browser/Tauri branch enters
shared audio code.

## Presentation merge gate

Run build/full tests after every batch. Visually inspect every sprite at native and map
scale and listen at low/default/high category volume. Verify the placeholder audit has no
program entry left after Task 55 and that mechanics diffs are empty.
