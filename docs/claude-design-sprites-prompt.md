# Claude Design Prompt: Conquestoria Sprites

**Active prompt below: issue #759 batch 1 — v2-native animation upgrade for the 5 Era 13 units.**

## Correction to #759's original scope (found 2026-07-31, before writing this prompt)

Issue #759 (and the design work in #755 that led to it) described the difference between
"v2-native" and "live-fallback" unit sprites as **6 hand-drawn body/armor variants per unit, one
per civilization visual family**. That claim is **wrong** — verified by reading the actual
`design/conquestoria-sprites/lib/units-v2.jsx` source directly. Every existing v2-native sprite
(including `SwordsmanV2Sprite`, the file's own flagship/most-detailed example) uses `faction` only
to derive **4-5 fill colors** (`f.mid`, `f.bright`, `f.trim`, `f.dark`) applied to one fixed
geometric shape — the same "one shape, palette-recolored" pattern the live `units.tsx` catalog
already uses. There is no separate illustration per faction.

**What v2-native sprites actually have that live-fallback sprites don't** is CSS-animation-hook
richness: articulated limbs (`.cq-leg-l`/`.cq-leg-r` wrapped for walk-cycle rotation), a
weapon/tool pivot (`.cq-weapon` with `--pivot-x`/`--pivot-y` CSS vars), secondary motion
(`.cq-plume`, capes, etc.), and state-gated effects (`.cq-hit-spark` on attack, `.cq-step-dust` on
walk). This is a much smaller, more honest scope than "6x the art" — it's "add the same
animation-hook wiring every other v2-native sprite has" to a fixed, already-designed silhouette.

Also corrected: **the fallback-tier roster has grown from 24 to 39 units** since #759 was filed
(new naval/air/logistics/cyber content shipped in the meantime). Re-run
`Object.keys(UNIT_SPRITE_CATALOG).filter(t => !isV2NativeUnit(t))` before picking future batches —
don't trust either the 24 or 39 counts as durable.

## Batch 1 scope: the 5 Era 13 units

Chosen because they're what originally motivated both #755 (their `.cq-glow` usage was invisible
until the live-fallback fix shipped) and #759 (filed as the follow-up). Upgrading them to
v2-native gives back the full animation-hook richness (walk-cycle limbs, weapon pivots, secondary
motion) that the live-fallback tier can't provide.

- `combat_drone` — live source: `src/renderer/sprites/units.tsx:1744`, `data-kind`: no existing
  v2 convention for airborne units — default to `civilian` (no body-plan-specific CSS depends on
  it; revisit only if a future issue defines an `air` kind).
- `autonomous_frigate` — live source: `src/renderer/sprites/units.tsx:1790`, `data-kind: naval`
- `exosuit_infantry` — live source: `src/renderer/sprites/units.tsx:1838`, `data-kind: melee`
- `propagandist` — live source: `src/renderer/sprites/units.tsx:1904`, `data-kind: civilian`
- `drone_controller` — live source: `src/renderer/sprites/units.tsx:1935`, `data-kind: spy`

---

## Copy everything below into Claude Design (Sonnet 5)

```
<role>
You are a senior SVG sprite artist and React/JSX developer specializing in hand-crafted,
animatable game graphics. You write clean, geometric SVG with explicit CSS-animation class hooks
— no photorealism, no gradient meshes, no blur filters. Your work integrates directly into a
production codebase's "v2" animated sprite dialect.
</role>

<context>
**Project**: Conquestoria — HTML5 Canvas + DOM strategy game, mobile-first, played by families
including young children. This is NOT the game's live rendering source — it's a separate authoring
dialect (`design/conquestoria-sprites/lib/units-v2.jsx`) that gets converted by
`scripts/serialize-sprites.mjs` into pre-serialized `.svg.ts` files consumed by the game's DOM
sprite overlay, which is what lets CSS keyframe animations actually run (unlike the Canvas
rasterization path, which is always static).

**Task**: 5 units currently render through a live-fallback path (correct art, but only basic idle
motion — no articulated limbs, no weapon pivot, no secondary motion). Your job is to give each one
the SAME animation-hook richness every other v2-native sprite already has, reusing the EXACT
existing silhouette/geometry from the live source cited per-sprite below — this is a rigging
upgrade, not a redesign. Do not change the character design, proportions, or color usage; only add
the class-hook wrapper structure that makes limbs/weapons/effects independently animatable.

**Repository**: https://github.com/a1flecke/conquestoria
</context>

<reference_files>
1. The v2 dialect's shared helpers and 2 flagship examples (read `SpriteFrameV2`, `HumanoidV2`, and
   `SwordsmanV2Sprite` in full — `SwordsmanV2Sprite`'s file-header comment documents the complete
   class-hook contract and the "wrapper rule" that governs every animated element):
   https://raw.githubusercontent.com/a1flecke/conquestoria/main/design/conquestoria-sprites/lib/units-v2.jsx

2. A second, simpler reference (ranged unit, locked-arm archer pose, weapon pivot without full limb
   articulation — closer to what a drone/infantry unit might need):
   Read `ArcherV2Sprite` in the same file above (same URL, different function).

3. The 5 units' CURRENT live silhouettes — reuse this exact geometry, do not redesign:
   https://raw.githubusercontent.com/a1flecke/conquestoria/main/src/renderer/sprites/units.tsx
   (read `CombatDroneSprite` at line 1744, `AutonomousFrigateSprite` at line 1790,
   `ExosuitInfantrySprite` at line 1838, `PropagandistSprite` at line 1904, `DroneControllerSprite`
   at line 1935 — these use a `{palette}` prop with `palette.dark/mid/bright/trim`, matching what
   `factionAccent(faction)` in the v2 dialect resolves to, so colors map over directly.)

4. CSS animation system — every keyframe and class hook your output needs to actually animate once
   serialized (search for `.cq-leg`, `.cq-weapon`, `.cq-plume`, `.cq-step-dust`, `.cq-hit-spark`,
   `.cq-shadow` to see what each hook does):
   https://raw.githubusercontent.com/a1flecke/conquestoria/main/src/assets/sprite-animations-v2.css
</reference_files>

<design_system>
**Faction color contract**: `const f = _fa2(faction)` gives `{dark, mid, bright, trim}` — use these
exactly like the live sprites' `palette.dark/mid/bright/trim`. Never hardcode a civ-identity color;
route every "this is the unit's team color" surface through `f.*`. Non-team materials (metal, glass,
lens, wood, skin) use `_P2.*` (the shared material palette — same values as the live `P` import,
just namespaced `_P2` in this dialect).

**The wrapper rule (from the file's own header — follow exactly)**: any element that gets a
CSS-animated `transform` must NOT also carry an SVG `transform="..."` attribute — they don't
compose, and the element snaps to viewBox origin before rotating. Always split into an OUTER group
(`transform="translate(X Y)"`, positions the part, no class) wrapping an INNER group
(`className="cq-foo"`, animated, no SVG transform attribute). The one exception is `.cq-weapon`,
which uses `transform-box: view-box` plus `--pivot-x`/`--pivot-y` CSS vars and sits unwrapped.

**Required hooks, add whichever apply to each unit's actual anatomy** (do not force a hook onto a
part that doesn't exist — e.g. a wheeled/tracked unit has no legs to articulate):
- `.cq-shadow` — ground shadow, reacts to body bob (every sprite should have this)
- `.cq-step-dust` (+ a second `.cq-step-dust--b` instance) — foot/tread landing puffs, only for
  units that touch the ground when moving
- `.cq-leg-l` / `.cq-leg-r` — wrapped per the rule above, for any unit with legs
- `.cq-weapon` with `--pivot-x`/`--pivot-y` — for any unit with a wieldable weapon or directional
  tool/sensor arm (a drone's turret/sensor counts)
- A secondary-motion hook analogous to `.cq-plume` (antenna, cape, banner, exhaust trail, whatever
  reads naturally for that unit) — optional, only where it fits
- `.cq-hit-spark` — appears only on the attack hold frame, for any combat-capable unit
  (`exosuit_infantry`, `autonomous_frigate`, `combat_drone` — not `propagandist`/`drone_controller`,
  which are non-combat support units)

**Do NOT add**: wound-tier classes (`cq-wound-*`), `data-damage` handling, or any beast-specific
hook — confirmed via direct source inspection that these are exclusively used by legendary-beast
sprites, not regular units. Adding them here would be inventing an unimplemented mechanic.

**data-kind per unit** (see batch list above for the exact value each unit should pass to
`SpriteFrameV2`'s `kind` prop):
- `combat_drone` → `"civilian"` (no existing airborne convention — do not invent a new `kind`
  value; that's a separate design decision outside this batch's scope)
- `autonomous_frigate` → `"naval"`
- `exosuit_infantry` → `"melee"`
- `propagandist` → `"civilian"`
- `drone_controller` → `"spy"`
</design_system>

<sprites>

## SPRITE 1 — CombatDroneV2Sprite (Unit)

**Insert into**: `design/conquestoria-sprites/lib/units-v2.jsx`, after the last existing unit
function in the file
**Catalog note**: no code registration needed from you — that's a separate build step
(`node scripts/serialize-sprites.mjs`) run by the developer after your output lands
**data-kind**: `civilian`
**Live source to match exactly**: `CombatDroneSprite`, `src/renderer/sprites/units.tsx:1744`

### Concept
A small hovering quadcopter-style combat drone — sensor eyes, rotor arms, a mounted weapon
emitter. Reuse the live sprite's exact silhouette and proportions; this is a rigging pass, not a
redesign.

### Key requirements
- Ground shadow (`.cq-shadow`) even though it hovers — subtle, smaller/softer than a ground unit's
- No legs (it flies) — skip `.cq-leg-l/r` and `.cq-step-dust` entirely
- Rotor arms or sensor housing get a subtle idle sway hook if the live design has independently
  posable parts — use your judgment on whether this reads as a distinct "secondary motion" element
  or is better left static
- `.cq-weapon` wrapping its mounted emitter/turret, with `--pivot-x`/`--pivot-y` at the emitter's
  mount point, so it can rotate to track a target on attack
- `.cq-hit-spark` at the emitter's muzzle, appearing only on the attack hold frame
- Tone: mechanical, precise, quietly threatening

## SPRITE 2 — AutonomousFrigateV2Sprite (Unit)

**Insert into**: `design/conquestoria-sprites/lib/units-v2.jsx`
**data-kind**: `naval`
**Live source to match exactly**: `AutonomousFrigateSprite`, `src/renderer/sprites/units.tsx:1790`

### Concept
An unmanned naval combat vessel — sleek hull, radar/sensor mast, a deck-mounted weapon system.
Reuse the live sprite's exact hull silhouette.

### Key requirements
- `.cq-shadow` for the water-contact shadow/wake base
- No legs — naval unit, use whatever existing naval idle-bob convention `SpriteFrameV2`'s
  `kind="naval"` CSS provides (check `sprite-animations-v2.css` for `[data-kind="naval"]` rules —
  don't reinvent bobbing logic that already exists)
- `.cq-weapon` wrapping the deck weapon/turret with a pivot at its mount
- `.cq-hit-spark` at the weapon's firing point
- A sensor mast or antenna array could get a subtle secondary-motion hook if it reads naturally
- Tone: cold, autonomous, mechanically efficient

## SPRITE 3 — ExosuitInfantryV2Sprite (Unit)

**Insert into**: `design/conquestoria-sprites/lib/units-v2.jsx`
**data-kind**: `melee`
**Live source to match exactly**: `ExosuitInfantrySprite`, `src/renderer/sprites/units.tsx:1838`

### Concept
A powered exoskeleton infantry unit — bulky armored frame, reinforced limbs, a helmet with a
sensor visor. Reuse the live sprite's exact armor silhouette.

### Key requirements
- `.cq-shadow`, `.cq-step-dust` (+ `--b` variant) — this unit walks
- `.cq-leg-l` / `.cq-leg-r`, each properly wrapped per the wrapper rule, for a heavy mechanical
  gait
- `.cq-weapon` for its primary weapon (rifle, cannon, or melee weapon per the live design), pivot
  at the grip/mount point
- `.cq-hit-spark` at the weapon's business end
- Consider a `.cq-plume`-style secondary motion for an antenna, exhaust vent, or shoulder-mounted
  detail if the live design has one
- Tone: heavy, armored, deliberate movement

## SPRITE 4 — PropagandistV2Sprite (Unit)

**Insert into**: `design/conquestoria-sprites/lib/units-v2.jsx`
**data-kind**: `civilian`
**Live source to match exactly**: `PropagandistSprite`, `src/renderer/sprites/units.tsx:1904`

### Concept
A non-combat civic/media unit — likely carries a device, banner, or broadcasting equipment. Reuse
the live sprite's exact silhouette.

### Key requirements
- `.cq-shadow`, `.cq-step-dust` (+ `--b` variant) — walks like other civilian units
- `.cq-leg-l` / `.cq-leg-r`, wrapped per the rule, `arms="free"` on `HumanoidV2` if built on that
  primitive (civilian gait, swinging arms) — or `arms="locked"` if carrying equipment, matching
  whatever the live design shows
- **No `.cq-weapon` and no `.cq-hit-spark`** — this is a non-combat unit
- Whatever the unit carries (banner, broadcast device, signage) is a natural `.cq-plume`-style
  secondary-motion candidate — give it one if it reads naturally
- Tone: civic, persuasive, media-savvy — not military

## SPRITE 5 — DroneControllerV2Sprite (Unit)

**Insert into**: `design/conquestoria-sprites/lib/units-v2.jsx`
**data-kind**: `spy`
**Live source to match exactly**: `DroneControllerSprite`, `src/renderer/sprites/units.tsx:1935`

### Concept
A specialist operator with a handheld control device or wrist-mounted interface for directing
drones. Reuse the live sprite's exact silhouette — likely similar build to the existing spy-class
v2 sprites (`SpyOperativeV2Sprite`, `SpyHackerV2Sprite` — read one of these too if useful for
`data-kind="spy"` convention reference).

### Key requirements
- `.cq-shadow`, `.cq-step-dust` (+ `--b` variant)
- `.cq-leg-l` / `.cq-leg-r`, wrapped per the rule
- `arms="locked"` on `HumanoidV2` if holding a control device with both hands, matching the live
  design
- **No `.cq-weapon` and no `.cq-hit-spark`** — non-combat specialist unit
- The control device/interface screen is a natural secondary-motion or glow-accent candidate
- Tone: focused, technical, alert

</sprites>

<output_format>
Output one complete TypeScript/JSX function at a time, in the order listed above (Sprite 1 through
5), each as its own fenced code block so it can be copied individually. Function names must be
exactly `CombatDroneV2Sprite`, `AutonomousFrigateV2Sprite`, `ExosuitInfantryV2Sprite`,
`PropagandistV2Sprite`, `DroneControllerV2Sprite` — matching the file's existing `FooV2Sprite`
naming convention exactly (not `FooSpriteV2` or any other ordering). Each function signature must
be `function FooV2Sprite({ faction = 'imperials', state = 'idle', phase }) { ... }` — matching
every existing function in the file. Wait for confirmation before moving to the next sprite unless
told otherwise.
</output_format>

<style_checklist>
Before finalizing each sprite, verify:
- [ ] Every color that represents team/civ identity uses `f.dark`/`f.mid`/`f.bright`/`f.trim` —
      never a hardcoded hex for that purpose
- [ ] Every non-team material uses `_P2.*` (matching the existing material palette)
- [ ] Every animated element follows the wrapper rule (outer positions, inner class-hooked group
      animates) — except `.cq-weapon`, which is the documented exception
- [ ] `.cq-shadow` is present
- [ ] Ground-contact units have `.cq-step-dust` + `.cq-step-dust--b`; the flying `combat_drone`
      does not
- [ ] Combat units (`combat_drone`, `autonomous_frigate`, `exosuit_infantry`) have `.cq-weapon`
      with `--pivot-x`/`--pivot-y` and `.cq-hit-spark`; non-combat units (`propagandist`,
      `drone_controller`) have neither
- [ ] No `cq-wound-*` classes, no `data-damage` handling — those are beast-exclusive, not part of
      this batch
- [ ] The silhouette matches the cited live sprite — this is a rigging upgrade, not a redesign
- [ ] `SpriteFrameV2`'s `kind` prop is set to the exact value specified per sprite above
</style_checklist>
```

---

## After Claude Design responds

1. Save each function's output into `design/conquestoria-sprites/lib/units-v2.jsx`, appended after
   the last existing unit function.
2. Run `node scripts/serialize-sprites.mjs` to regenerate the `.svg.ts` files under
   `src/renderer/sprites/v2/`.
3. Add the new imports + `UNIT_SPRITES` entries to `src/renderer/sprites/v2/index.ts` for each of
   the 5 unit type keys (`combat_drone`, `autonomous_frigate`, `exosuit_infantry`, `propagandist`,
   `drone_controller`).
4. Verify: `isV2NativeUnit('combat_drone')` etc. should become `true` for all 5. Run the existing
   `tests/renderer/sprites/v2/index.test.ts` structural-guarantee test to confirm nothing broke.
5. Visually verify at least one sprite animates correctly (idle breathe + a weapon-pivot check on
   `data-state="attack"`) before considering the batch done — matching the verification pattern
   already established for #755 (extract real markup, check against the real CSS, either via
   `rsvg-convert` for a static check or a published Artifact for a live `getComputedStyle` check).
6. Prune this prompt back out of this file once the batch ships, per this file's own standing
   convention (see git history for prior examples).
