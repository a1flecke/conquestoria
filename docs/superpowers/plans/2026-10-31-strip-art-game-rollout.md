# Strip Art In The Game (#1627) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task (this repo
> forbids subagents, see `CLAUDE.md` "Agent Policy"). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The game plays the image-generated strip art (Spearman, Archer, Horseman, Tank, Ironclad, Biplane) with damage tiers,
play-once attack / hurt / death rows and a death pose for every unit that has one, inside a fixed size budget.

**Architecture:** One normalised sprite type (`PngUnitSprite`) describes both the existing square puppet sheets and the new
strip sheets. A pure resolver picks the clip (row, first column, frames, fps, loop) for a unit's state and damage tier, and the
overlay writes that clip as CSS variables. `strips.py export` turns an approved preview into a game sheet: only the rows the game
plays, repacked, palette-quantised, with a budget and anchor check. Units switch one catalog row at a time, after the owner approves
each one.

**Tech Stack:** TypeScript, DOM/CSS sprite overlay, Canvas 2D (low-zoom bake), Python 3 + Pillow + NumPy (`strips.py`), vitest,
Playwright.

**Spec:** issue #1627 (game-side checklist) plus the gap table in `design/png-sprites/previews/spearman/README.md` ("The game's PNG
player was built for one still rigged into three rows") and `scripts/sprite-puppet/STRIPS.md` (results and decision).

## Global Constraints

- A unit is PNG exactly when it has a row in `PNG_UNIT_SPRITES`; the SVG sprite stays in `UNIT_SPRITE_CATALOG` as the fallback
  (`.claude/rules/sprites.md`).
- Never hand-edit a generated manifest or sheet; `strips.py export` (strip units) or `puppet.py build` (puppet units) writes them.
- Colours reaching a style attribute pass `resolvePngTint`'s hex check; values written to the DOM are numbers this code built.
- Damage tier from health, as the overlay already defines it: 0 = 76–100 HP, 1 = 51–75, 2 = 26–50, 3 = 0–25.
- State holds (`src/renderer/pirate-sprite-state.ts`): attack 1500 ms, hurt 700 ms, death 1200 ms. A one-shot clip must finish
  inside its hold.
- Budget per strip unit, enforced by the export and by the catalog test: sheet + mask on disk ≤ 640 KB; decoded
  (`cols × cellWidth × rows × cellHeight × 4 × 2`) ≤ 24 MiB.
- Originals are never committed; provenance records their SHA-256 (`design/png-sprites/previews/<id>/provenance.json`).
- Mobile first: no hover-only cue; reduced motion holds a still frame.

## Decisions taken here (owner may overrule at the review gates)

| Decision | Choice | Why |
|---|---|---|
| Feet line | A strip cell's baseline lands at **0.8** of the square unit box (`PNG_STRIP_FEET_LINE`) | Puppet units put feet at 0.74–0.8 (`rigs/*.json` `baseline`); the health bar sits at 0.78. The strip baseline is 176/192 = 0.917, which would put feet below the bar |
| Scale | Export at **0.75** (cells 144 px tall) | Decoded memory: Spearman at full size is 36 MiB, at 0.75 about 20 MiB. The largest on-screen unit box is ~86 CSS px (hex 32 × 0.9 × zoom 3), so 144 px is ~1:1 at DPR 2 |
| Compression | 256-colour palette sheet, no dither; mask as grey+alpha | Measured on the six previews: 1.1–2.1 MB → 0.24–0.49 MB per unit, 99th-percentile colour error 17/255 |
| Tier mapping | Exactly the viewer's (`viewer.html` `tierOf`/`tierRow`): idle tier 0 = master, tier t>0 = damage column t; walk tier t = tier group entry t+1 when the group has 5 rows | The owner approved what the viewer shows |
| Rows the game plays | idle+damage (one row of 4), walk per tier (deduplicated), attack, hurt, death. No `work` row | The game sends `work` only to trade units (`applyDeliveryVisual`); none of these units is one |
| One-shot end | Hold the last frame (`animation-fill-mode: forwards`) | Attack and hit end on a recovered pose, death on the fallen pose |
| Reduced motion | Loops hold their first frame (today's rule); one-shots hold their last frame | The outcome (fallen, recovered) is the information |
| Death pose | Kept for any unit whose sprite has a real death clip, plus pirates (today) | An SVG unit with no death art would otherwise stand idle for 1.2 s after dying |

## Review Focus

1. A unit that attacks twice inside the 1.5 s hold must replay the attack (the transient is renewed; the CSS animation must restart).
   Pinned in Task 3.
2. Damage tier from odd health (`undefined`, `NaN`, negative, above 100, a fraction) must clamp to 0..3, never index a missing
   clip. Pinned in Task 2.
3. A one-frame clip (idle, each damage pose) must not use `steps(1, jump-none)`, which is invalid CSS and stalls the layer. Pinned
   in Tasks 2 and 3.
4. A one-shot must start on its first frame: the per-unit `--phase` offset applies to loops only. Pinned in Task 2.
5. A dead unit's pose must only show where the viewing seat can see its hex (hot seat), and an SVG-only unit must not get a
   standing ghost. Pinned in Task 5.

## File Structure

| File | Responsibility |
|---|---|
| `src/renderer/sprites/png/png-sprite-types.ts` (modify) | Keep `PngSpriteManifest` (the puppet sheet shape the generated puppet files import); add `PngUnitSprite`, `PngClip`, `PngTierClips`, `PngDamageTier` |
| `src/renderer/sprites/png/png-sprite-normalise.ts` (create) | `fromPuppetManifest` – the one conversion from the old shape |
| `src/renderer/sprites/png/png-sprite-playback.ts` (create) | `resolvePngPlayback`, `getPngPlaybackCssVars`, `applyPngPlayback` |
| `src/renderer/sprites/png/png-sprite-layout.ts` (create) | `PNG_STRIP_FEET_LINE`, `getPngCellPlacement`, `getPngBakeGeometry` |
| `src/renderer/sprites/png/png-sprite-catalog.ts` (modify) | Holds `PngUnitSprite`s; `hasPngDeathClip` |
| `src/renderer/sprites/png/png-sprite-html.ts`, `png-sprite-canvas.ts`, `src/assets/png-sprite-animations.css` (modify) | Build, bake and play from clips and placement |
| `src/renderer/sprite-overlay.ts` (modify) | Calls `applyPngPlayback` for PNG units; `overflow: visible` for strip units |
| `src/renderer/pirate-sprite-state.ts` (modify) | Records when a transient started; exports the hold constants |
| `src/renderer/render-loop.ts` (modify) | `unitDeathSnapshots` for every unit with a death clip; passes `stateEpoch` |
| `scripts/sprite-puppet/strips.py` (modify) | `export` command; aircraft idle anchor fix |
| `src/testing/scenarios.ts` (modify) | `strip-units-showcase` scenario (DEV only) |
| `tests/e2e/issue-1627-strip-units.spec.ts` (create) | Real-browser check of placement, tiers and loading |

---

### Task 1: Secure the originals

The six units' downloaded originals live only in a session scratchpad under `/private/tmp`, which the OS clears. Every rebuild
(Task 9's biplane fix included) needs them.

**Files:** none in the repo.

- [ ] **Step 1:** Copy each unit's originals to `~/conquestoria-art-originals/strips/<unit>/` (`a.png`, `b.png`, …, the letters in its
  `strip-rigs/<unit>.json`). The tank's are in the scratchpad `tank-v2/`, the ironclad's in `ironclad-src/`, the biplane's in
  `biplane-src/`, the spearman's in `spearman-src/`. For the archer and horseman, use the folders whose hashes match.
- [ ] **Step 2:** For each unit, `shasum -a 256` every file and compare it with `originals[].sha256` in
  `design/png-sprites/previews/<unit>/provenance.json`. Expected: every hash matches. If one has no match, stop and tell the owner
  which file is missing; the shipped preview stays exportable (Task 7 needs only the committed preview), only a rebuild is blocked.

### Task 2: One sprite type and a clip resolver

**Files:**
- Modify: `src/renderer/sprites/png/png-sprite-types.ts`
- Create: `src/renderer/sprites/png/png-sprite-normalise.ts`, `src/renderer/sprites/png/png-sprite-playback.ts`
- Modify: `src/renderer/sprites/png/png-sprite-catalog.ts`
- Test: `tests/renderer/sprites/png/png-sprite-playback.test.ts` (create), `tests/renderer/sprites/png/png-sprite-catalog.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type PngSpriteState = 'idle' | 'walk' | 'attack' | 'hurt' | 'death' | 'work';
  export type PngDamageTier = 0 | 1 | 2 | 3;
  export interface PngClip { row: number; firstCol: number; frames: number; fps: number; loop: boolean }
  export type PngTierClips = readonly [PngClip, PngClip, PngClip, PngClip];
  export interface PngUnitSprite {
    id: string; cellWidth: number; cellHeight: number; cols: number; rows: number;
    /** Pixels from a cell's top to the ground line; null = a square puppet cell that fills the unit box. */
    baseline: number | null;
    clips: Record<'idle' | 'walk' | 'attack', PngTierClips> & Partial<Record<'hurt' | 'death' | 'work', PngTierClips>>;
    sheet: string; mask: string; facing: 'right' | 'left';
  }
  export function fromPuppetManifest(m: PngSpriteManifest): PngUnitSprite;           // png-sprite-normalise.ts
  export interface PngPlayback { clip: PngClip; tier: PngDamageTier; fallback: 'hurt' | 'death' | 'work' | null }
  export function toPngDamageTier(damage: number | undefined): PngDamageTier;      // png-sprite-playback.ts
  export function resolvePngPlayback(sprite: PngUnitSprite, state: PngSpriteState, damage: number | undefined): PngPlayback;
  export function getPngPlaybackCssVars(sprite: PngUnitSprite, playback: PngPlayback, phase: number): Record<string, string>;
  ```
  The catalog's `getPngUnitManifest` / `listPngUnitManifests` return `PngUnitSprite`; puppet rows go through `fromPuppetManifest`,
  strip rows are imported already in this shape. Add `hasPngDeathClip(unitType: string): boolean` (true only when `clips.death`
  exists; use the manifest list, not a keyed lookup, for the `__proto__` reason in `unit-icon-source.ts`).

- [ ] **Step 1: Write the failing tests** in `png-sprite-playback.test.ts`:
  - `fromPuppetManifest keeps a puppet unit's behaviour`: for the shipped `cavalry` manifest, `cellWidth === cellHeight === 192`,
    `baseline === null`, and every state's four tier clips equal `{row, firstCol: 0, frames, fps, loop: true}` from the old entry.
  - `toPngDamageTier clamps`: `undefined → 0`, `NaN → 0`, `-1 → 0`, `2.6 → 2`, `7 → 3`.
  - `a missing state falls back to idle at the same tier, flagged`: a fixture without `hurt` →
    `resolvePngPlayback(s, 'hurt', 2)` returns the tier-2 idle clip and `fallback: 'hurt'`; with `hurt` present, `fallback: null`.
  - `loops take the phase, one-shots start at frame 0`: `getPngPlaybackCssVars` gives `--delay: -0.25s` for a 1 s loop at phase
    0.25 and `--delay: 0s`, `--iter: 1` for a one-shot at the same phase; a loop gives `--iter: infinite`.
  - `positions are background-position percentages`: with `cols: 8`, a clip `{firstCol: 2, frames: 1}` gives
    `--from: 28.5714%` and `--to: 28.5714%`; `{firstCol: 0, frames: 8}` gives `0%` and `100%`; `--row` for row 3 of 8 rows is
    `42.8571%`; `--steps` is the frame count, `--dur` `frames / fps` seconds.
- [ ] **Step 2:** Run `./scripts/dev.sh test tests/renderer/sprites/png/png-sprite-playback.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3:** Implement the types and the three modules, and switch the catalog. In `png-sprite-catalog.test.ts`, replace the
  `frameSize` / `states` / `rows === 3` assertions with the same checks on `PngUnitSprite` (every clip's `row < rows`,
  `firstCol + frames <= cols`, `fps > 0`; sheet and mask are `cols × cellWidth` by `rows × cellHeight`).
- [ ] **Step 4:** Run `./scripts/dev.sh test tests/renderer/sprites/png/`. Expected: PASS.
- [ ] **Step 5:** Commit: `art: one PNG unit sprite type and a clip resolver per state and damage tier (#1627)`.

### Task 3: The player plays clips (DOM overlay and CSS)

**Files:**
- Create: `src/renderer/sprites/png/png-sprite-layout.ts`
- Modify: `src/renderer/sprites/png/png-sprite-html.ts`, `src/assets/png-sprite-animations.css`, `src/renderer/sprite-overlay.ts`
- Test: `tests/renderer/sprites/png/png-sprite-overlay.test.ts`, `tests/renderer/sprites/png/png-sprite-layout.test.ts` (create)

**Interfaces:**
- Consumes: Task 2's `PngUnitSprite`, `resolvePngPlayback`, `getPngPlaybackCssVars`, `getPngUnitManifest`.
- Produces:
  ```ts
  export const PNG_STRIP_FEET_LINE = 0.8;                                            // png-sprite-layout.ts
  export interface PngCellPlacement { widthPct: number; leftPct: number; topPct: number }
  export function getPngCellPlacement(sprite: PngUnitSprite): PngCellPlacement;
  /** Writes the clip for (state, tier, epoch) onto the `.cq-png` root; a no-op when that key has not changed. */
  export function applyPngPlayback(el: HTMLElement, sprite: PngUnitSprite, state: PngSpriteState,
    damage: number | undefined, epoch: number, phase: number): void;                // png-sprite-playback.ts
  ```
  `SpriteEntity` gains `stateEpoch?: number` (when the current transient began; 0 or absent = none).

Placement: `baseline === null` → `{widthPct: 100, leftPct: 0, topPct: 0}` (today's layout). A strip cell is as tall as the box,
`widthPct = cellWidth / cellHeight × 100`, `leftPct = 50 − widthPct / 2`, `topPct = (PNG_STRIP_FEET_LINE − baseline / cellHeight) × 100`.
`applyPngPlayback` keeps the key `${state}:${tier}:${epoch}` in `data-png-key`; when it changes it writes the vars, flips
`data-png-epoch` between `0` and `1` (the CSS uses keyframes `cq-png-play-a` / `cq-png-play-b`, so the animation restarts), sets
`data-png-static` when `frames === 1` and `data-png-fallback` when the playback is a fallback. The hurt/death filters stay, but only
under `[data-png-fallback]`. Reduced motion: loops hold `--from`, one-shots hold `--to`.

- [ ] **Step 1: Write the failing tests:**
  - `png-sprite-layout.test.ts`: a 240 × 192 strip with baseline 176 → `widthPct 125`, `leftPct −12.5`, `topPct −11.6667`
    (±0.001); a puppet sprite → `{100, 0, 0}`.
  - Overlay, `plays the damage tier of the idle pose`: a strip fixture sprite synced with `state 'idle', damage 2` → the root's
    `--from` is column 2's percentage and `data-png-static="true"`.
  - Overlay, `replays an attack renewed inside its hold`: sync `attack` with epoch 1000, then `attack` with epoch 2000 →
    `data-png-epoch` flips (0 → 1 → 0); a third sync with epoch 2000 leaves it unchanged.
  - Overlay, `a loop is not restarted by an unchanged sync`: two `walk` syncs with the same tier and epoch leave `data-png-epoch` as
    it was.
  - Overlay, `strip units may draw outside the unit box`: the wrapper of a strip unit has `overflow: visible`; a puppet unit keeps
    `overflow: hidden`.
  - Existing overlay tests (tint, decorations, LOD) still pass unchanged.
- [ ] **Step 2:** Run `./scripts/dev.sh test tests/renderer/sprites/png/`. Expected: the new tests FAIL.
- [ ] **Step 3:** Implement. `buildPngUnitSpriteHtml` builds the root with the placement inline (`width`, `left`, `top` as
  percentages) and the idle tier-0 vars; the overlay calls `applyPngPlayback` on pool create and pool hit when the root has
  `data-sprite-kind="png"`; the city-panel icon path (`unit-icon-source.ts`) keeps `.cq-png-static`.
- [ ] **Step 4:** Run `./scripts/dev.sh test tests/renderer/` and `./scripts/check-src-rule-violations.sh src/renderer/sprite-overlay.ts src/renderer/sprites/png`. Expected: PASS, no violations.
- [ ] **Step 5:** Commit: `art: the PNG player plays per-state, per-tier clips, once for one-shots (#1627)`.

### Task 4: Transients record when they started

**Files:**
- Modify: `src/renderer/pirate-sprite-state.ts`, `src/renderer/render-loop.ts` (`buildUnitEntities`, `buildMovingUnitEntities`)
- Test: `tests/renderer/pirate-sprite-state.test.ts`, `tests/renderer/render-loop-combat-sprite-state.test.ts`

**Interfaces:**
- Produces: `TransientState.startedAtMs: number`; `PirateSpriteStateTracker.resolveTransientEpoch(entityId: string, nowMs: number): number`
  (the start time of the live transient, `0` when none or expired); export `ATTACK_STATE_MS` and `HURT_STATE_MS` beside
  `DEATH_STATE_MS`. Unit entities carry `stateEpoch`.

- [ ] **Step 1: Write the failing tests:** `two attacks on one unit give two epochs` (apply attack at 1000 and at 1800 →
  `resolveTransientEpoch(id, 1900) === 1800`); `an expired transient has epoch 0` (at 1000 + 1500 + 1 → `0`); in the render-loop
  test, a unit entity built after `applyCombatVisual` carries `stateEpoch` equal to that call's `nowMs`.
- [ ] **Step 2:** Run both test files. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run both test files plus `tests/renderer/render-loop-invalidation-boundary.test.ts`. Expected: PASS.
- [ ] **Step 5:** Commit: `art: sprite transients record when they began, so a renewed attack replays (#1627)`.

### Task 5: A death pose for every unit that has one

**Files:**
- Modify: `src/renderer/render-loop.ts`, `src/renderer/sprites/png/png-sprite-catalog.ts`
- Test: `tests/renderer/render-loop-combat-sprite-state.test.ts`

**Interfaces:**
- Consumes: `hasPngDeathClip` (Task 2), `DEATH_STATE_MS`.
- Produces: `pirateUnitDeathSnapshots` renamed `unitDeathSnapshots`; `export function unitSpriteFaction(state: GameState, unit: Unit): string`
  in `render-loop.ts`, the one place the pirate / crisis / civ-type faction is chosen (today it is written out in
  `buildMovingUnitEntities` and `buildUnitEntities`).

A dead unit is snapshotted when `isPirateOwner(unit.owner) || hasPngDeathClip(unit.type)`. The snapshot entity uses
`unitSpriteFaction`, not the hard-coded `'pirates'`, `damage: 3`, `state: 'death'`, and is drawn only where the viewer's visibility
of its hex is `'visible'` (the check that exists today).

- [ ] **Step 1: Write the failing tests:**
  - `a PNG unit with a death clip keeps its pose for DEATH_STATE_MS`: a fixture registered sprite with `clips.death`; kill it via
    `applyCombatVisual`; the overlay entities include it in `death` with its owner's faction until `nowMs + 1200`, and not after.
  - `an SVG-only unit gets no death pose`: same with a unit with no PNG row → no snapshot entity.
  - `a death the viewer cannot see is not drawn`: the dead unit's hex is fogged for `currentPlayer` → no snapshot entity.
  - The existing pirate snapshot tests pass unchanged.
- [ ] **Step 2:** Run the test file. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `./scripts/dev.sh test tests/renderer/`. Expected: PASS.
- [ ] **Step 5:** Commit: `art: a fallen unit keeps its death pose when its sprite has one (#1627)`.

### Task 6: Canvas bake and list icons use the same framing

**Files:**
- Modify: `src/renderer/sprites/png/png-sprite-canvas.ts`, `src/renderer/sprites/png/png-sprite-layout.ts`
- Test: `tests/renderer/sprites/png/png-sprite-canvas.test.ts` (create), `tests/renderer/sprites/unit-icon-source.test.ts`

**Interfaces:**
- Produces: `export function getPngBakeGeometry(sprite: PngUnitSprite, clip: PngClip, col: number): { side: number; sx: number; sy: number; dx: number; dy: number }`
  in `png-sprite-layout.ts`. `side = cellHeight` (the square the canvas draws, unchanged for puppets), `sx = col × cellWidth`,
  `sy = clip.row × cellHeight`, `dx = (side − cellWidth) / 2`, `dy = topPct / 100 × side`. `getPngCanvasFrame` picks from the
  tier-0 clips: `idle` → idle column 0; `move-a` / `move-b` → walk columns 1 and 5 modulo frames (today's choice).

- [ ] **Step 1: Write the failing tests:** `a strip cell is centred in the baked square`: 240 × 192, baseline 176 →
  `{side: 192, dx: −24, dy: −22.4}` (±0.01); `a puppet cell fills it`: `dx = dy = 0`; `move-b on a 6-frame walk uses column 5`.
  In `unit-icon-source.test.ts`, a strip fixture's icon HTML carries the same `width`/`left`/`top` placement as the overlay.
- [ ] **Step 2:** Run the two files. Expected: FAIL.
- [ ] **Step 3:** Implement; `bakePngUnitImage` draws the cell at `(dx, dy)` into a `side × side` canvas (both layers).
- [ ] **Step 4:** Run `./scripts/dev.sh test tests/renderer/ tests/ui/city-panel-production-art.test.ts`. Expected: PASS.
- [ ] **Step 5:** Commit: `art: the low-zoom bake and list icons frame strip cells like the map (#1627)`.
- [ ] **Step 6:** Open the PR for Tasks 2–6 (`art: PNG player for strip sheets, damage tiers, one-shots and death poses (#1627)`,
  partial-MR rules: no unit switches yet, every puppet unit keeps its look; say so under "Why this is safe to merge partial").
  Before pushing: `./scripts/dev.sh build`, `./scripts/dev.sh test-regular`. Start the dev server
  (`./scripts/dev-server.sh start`), load a game with a puppet unit (horseman) and confirm idle, walk and attack look as on
  `main` (screenshot), then `./scripts/dev-server.sh stop`.

### Task 7: `strips.py export`

**Files:**
- Modify: `scripts/sprite-puppet/strips.py`, `scripts/sprite-puppet/STRIPS.md` (new "Export to the game" section)
- Test: `tests/scripts/sprite-strips-tool.test.ts` (new describe `strips.py export (#1627)`)

**Interfaces:**
- Produces: `python3 -I scripts/sprite-puppet/strips.py export <spec.json> [--preview DIR] [--scale 0.75] [--public DIR] [--generated DIR]`.
  Defaults: `--preview design/png-sprites/previews/<id>`, `--public public/images/units/<id>`, `--generated src/renderer/sprites/png/generated`.
  Writes `sheet.png` (256-colour palette, no dither), `mask.png` (grey+alpha: L 0, A the mask) and `<id>.manifest.ts`:
  ```ts
  // Auto-generated by scripts/sprite-puppet/strips.py export — do not edit manually.
  // Source: design/png-sprites/previews/<id>/ (spec scripts/sprite-puppet/strip-rigs/<id>.json).
  import type { PngUnitSprite } from '../png-sprite-types';
  export const sprite: PngUnitSprite = { ... };
  ```
  `GAME_ROLES = {'walk': ('walkrig', 'move', 'walk'), 'attack': ('attack', 'fire'), 'hurt': ('hit',), 'death': ('defeat', 'wreck', 'sinking', 'down')}`
  (first present name wins). Game rows, in order: row 0 = `[idle frame 0, damage col 1, damage col 2, damage col 3]`; then the walk
  rows for tiers 0..3 (tier group entries 1..4 when the group has five, else the one walk row for every tier), deduplicated; then
  attack, hurt, death. `baseline` and the cell size are scaled by `--scale` (Lanczos on the straight-alpha frames, re-premultiplied).
  Exit 1, with a message naming the unit and row, when: a role is missing; a one-shot's `frames / fps` exceeds its hold
  (attack 1.5 s, hurt 0.7 s, death 1.2 s); any row's opaque-pixel centre differs from the idle centre by more than 6 px (horizontal,
  in exported pixels); the idle or any walk frame reaches outside the unit box placed at the feet line
  (`top < (baseline/cellHeight − 0.8) × cellHeight` or `|x − cellWidth/2| > cellHeight/2`); disk > 640 KB; decoded > 24 MiB.
  Prints KB and decoded MiB.

- [ ] **Step 1: Write the failing tests** (synthetic previews built in the sandbox, as the existing build tests do):
  `export packs the game rows and maps the tiers` (a 5-entry walk group → walk tier 0 is the group's entry 1, idle tier 2 is row 0
  col 2, `death` maps from `wreck`); `export drops rows the game never plays` (a `work` row and the master walk row are not in the
  sheet); `export refuses an attack longer than its hold`; `export refuses a row off the idle centre`; `export refuses a rest pose
  that leaves the unit box`; `export writes a palette sheet and an alpha mask within budget` (sheet mode `P`, mask mode `LA`, sizes
  printed); `the generated manifest round-trips` (parse the written TS object literal as JSON; it has `baseline`, `clips.idle`
  with four entries).
- [ ] **Step 2:** Run `./scripts/dev.sh test tests/scripts/sprite-strips-tool.test.ts`. Expected: the new tests FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the file again. Expected: PASS. Then export all six into a scratch folder (`--public`/`--generated` pointed at
  the scratchpad) and record each unit's KB, MiB and any refusal. Expected now: the biplane fails the centre check (its idle row is
  about 40 px left of its move rows; Task 9 fixes it), the other five pass.
- [ ] **Step 5:** Commit: `art: strips.py export writes a game sheet within budget from an approved preview (#1627)`.

### Task 8: Spearman and Archer in the game

These two are SVG units today, so nothing painted is replaced.

**Files:**
- Create (by export): `public/images/units/{spearman,archer}/{sheet,mask}.png`, `src/renderer/sprites/png/generated/{spearman,archer}.manifest.ts`
- Modify: `src/renderer/sprites/png/png-sprite-catalog.ts`, `tests/renderer/sprites/png/png-sprite-catalog.test.ts`,
  `tests/systems/asset-rights-ledger.test.ts`, `docs/asset-rights-ledger.md`, `docs/sprite-design-system.md`,
  `.claude/rules/sprites.md`, `scripts/sprite-puppet/README.md`, `design/png-sprites/previews/spearman/README.md`
- Create: `src/testing/scenarios.ts` entry `strip-units-showcase`, `tests/e2e/issue-1627-strip-units.spec.ts`

- [ ] **Step 1: Write the failing tests:**
  - Catalog, `a strip unit stays regenerable`: for every sprite with `baseline !== null`,
    `scripts/sprite-puppet/strip-rigs/<id>.json` exists with the same id, `design/png-sprites/previews/<id>/provenance.json` lists
    `originals` with 64-hex `sha256`s and a `licence_note` over 40 characters, the SVG sprite is still in `UNIT_SPRITE_CATALOG`, and
    the shipped files meet the disk and decoded budgets. Puppet units keep today's check (rig in `rigs/`, source PNG, provenance).
  - Catalog, `spearman and archer are strip units with every clip`: `clips.hurt` and `clips.death` exist; every one-shot fits its
    hold (import the exported constants).
  - Ledger: a new family row `ChatGPT image generation (unit strips)` counting `design/png-sprites/previews/*/provenance.json` of the
    units in the catalog.
  - e2e `strip units render with their tier and placement`: `/?scenario=strip-units-showcase` (a spearman at 100 HP, an archer at
    30 HP, adjacent); both roots are `.cq-png` with `data-unit-type`; the archer's `--from` is the tier-2 column; the sheet URLs
    answer 200; the wrapper's computed `overflow` is `visible`.
- [ ] **Step 2:** Run the catalog and ledger tests. Expected: FAIL.
- [ ] **Step 3:** Export both (Task 7 command), add the two catalog rows, the scenario, the ledger row and note, and the docs: the
  sprites rule's PNG section (strip layout, clips, budgets; drop "hurt/death/work reuse the idle row" except as the fallback), the
  design-system rows, the README recipe, and the Spearman README gap table marked resolved with this issue.
- [ ] **Step 4:** Run `./scripts/dev.sh test tests/renderer/ tests/systems/asset-rights-ledger.test.ts tests/ui/`, `./scripts/dev.sh build`,
  then the e2e spec. Expected: PASS.
- [ ] **Step 5: Owner gate.** Start the dev server, load the scenario, and send the owner screenshots at zoom 1, 2 and 3 of: idle at
  each tier, walking, an attack, a hit and a death (play them by moving and attacking in the scenario), plus the city panel's
  production icons. Ask about the feet line, the 0.75 scale and the palette. Change `PNG_STRIP_FEET_LINE` or `--scale` only on the
  owner's word, then stop the dev server.
- [ ] **Step 6:** Commit `art: Spearman and Archer play their painted strips in the game (#1627)` and open the PR.

### Task 9: Tank, Ironclad, Biplane and Horseman replace their puppet art

The game already shows painted puppet sheets for these four. Each switches only on the owner's word; a unit the owner keeps on the
puppet keeps its row as is.

**Files:**
- Modify: `scripts/sprite-puppet/strips.py` (aircraft idle anchor), `design/png-sprites/previews/biplane/*`,
  `public/images/units/{tank,ironclad,biplane,horseman}/*`, their generated manifests, `png-sprite-catalog.ts`, the ledger, docs,
  `tests/renderer/sprites/png/png-sprite-catalog.test.ts` (`MILITARY_IDENTITY_UNITS` provenance test reads the strip record for a
  strip unit)
- Test: `tests/scripts/sprite-strips-tool.test.ts`

- [ ] **Step 1: Biplane idle anchor.** Write the failing test `an aircraft's idle row is centred like its move rows`: a synthetic
  flight spec whose master has a wheel hanging below the left of the fuselage → after `build`, the idle row's opaque centre is within
  6 px of the move row's. Hypothesis to verify first: the idle row (drawn file `a`) anchors on its lowest pixels (the
  undercarriage), while the rig rows anchor on the box centre. Fix it in `build` for the `flight` and `naval` families (anchor on the
  bounding box centre), rebuild the biplane preview from the Task 1 originals, and confirm `export` now passes.
- [ ] **Step 2: Side by side.** For each of the four, take the same in-game screenshots as Task 8 Step 5 on `main` (puppet) and on
  the branch (strip), at the same zoom and scenario, and send them to the owner paired. Note for the Horseman: the owner preferred the
  puppet's chestnut horse and the strip's actions (`STRIPS.md` results row); ask whether to switch it, keep the puppet, or redraw a
  chestnut coat first (which needs a tint-key `probe` before any drawing).
- [ ] **Step 3:** Export each approved unit, which replaces `public/images/units/<id>/` and its generated manifest, and switch the
  catalog import from the puppet manifest to the strip sprite. Keep the puppet rig and source (`rigs/<id>.json`,
  `design/png-sprites/sources/<id>.*`): rolling back is `puppet.py build` plus the old import, and the ledger notes them as kept for
  rollback.
- [ ] **Step 4:** Run `./scripts/dev.sh test tests/renderer/ tests/scripts/sprite-strips-tool.test.ts tests/systems/asset-rights-ledger.test.ts`,
  `./scripts/dev.sh build`, the e2e spec (extend the scenario with the switched units). Expected: PASS.
- [ ] **Step 5:** Commit per unit (`art: <Unit> plays its painted strip in the game (#1627)`) and open the PR.

### Task 10: Close out

- [ ] **Step 1:** Update #1627 (with the owner's OK): tick the game-side checklist, list which of the six ship strip art, and
  leave the per-unit rollout for the remaining units open with the recipe (`STRIPS.md` plus "Export to the game").
- [ ] **Step 2:** Delete this plan in the PR that lands the last task and move its manifest entry to `deleted` as `delivered-stale`
  (`.claude/rules/spec-fidelity.md`); anything still worth keeping (the feet line, the scale, the budgets) already lives in
  `.claude/rules/sprites.md` from Task 8.
