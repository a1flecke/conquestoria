# sprite-puppet — painted PNG in, animated civ-tintable unit sprite out

Turns **one painted PNG of a unit** (generated with SpriteCook, drawn by hand, anything) into a spritesheet the game
plays, with no per-frame art and no per-civ art. First unit: the Horseman (#1040). The game supports these **alongside**
the serialized SVG sprites, one unit at a time, so units migrate over as their art is replaced.

```
source png ──puppet.py──▶ public/images/units/<id>/sheet.png   (painted frames; tint region left as a grey ramp)
   │                     ▶ public/images/units/<id>/mask.png    (which pixels take the owner's colour)
   │                     ▶ src/renderer/sprites/png/generated/<id>.manifest.ts
   └─ rig spec (json)    ▶ .verification/puppet/<id>/preview.png (review only, git-ignored)
```

At runtime the DOM overlay tints with a CSS mask + `mix-blend-mode: multiply` (`src/assets/png-sprite-animations.css`),
and the Canvas layer bakes the same result (`png-sprite-canvas.ts`), so any civ colour works — not just the six faction
palettes.

## Add or replace a unit

1. **Get a source image** — see "Source image rules" below. Save it to `design/png-sprites/sources/<id>.png` and write
   `<id>.provenance.json` beside it (tool, model, prompt, asset id, date, licence note). The catalog test fails without it.
2. **Write the rig spec** `scripts/sprite-puppet/rigs/<id>.json` (copy `horseman.json`; reference below).
3. **Build**: `python3 -I scripts/sprite-puppet/puppet.py build scripts/sprite-puppet/rigs/<id>.json`
   (needs Python 3.11+, `pillow`, `numpy`, `scipy`; dev-time only, nothing here ships).
4. **Look at** `.verification/puppet/<id>/preview.png` (rows: idle, walk, attack, tinted blue on map green). Iterate on the
   spec until the joints are clean *at game scale* (48–128 px), not at 1024 px.
5. **Register** the unit: add its manifest import and one row to `PNG_UNIT_SPRITES` in
   `src/renderer/sprites/png/png-sprite-catalog.ts`. The unit's SVG sprite **stays** in `sprite-catalog.ts` — it is the
   fallback (failed Canvas bake, a PNG row removed). `tests/renderer/sprites/png/` enforces the manifest, files, rig spec,
   provenance and the SVG fallback.
6. **Verify in the game**: `yarn dev`, open `/?scenario=png-sprite-spike` (add your unit to that scenario), select the
   unit, move it (walk row) and attack with it (attack row); check a second civ's tint. Stop the dev server afterwards.
7. `./scripts/dev.sh verify-impact` for the evidence the change requires.

To **migrate a unit back**, delete its row from `PNG_UNIT_SPRITES`. Nothing else changes.

**Drawn strips instead of a rig:** a unit drawn frame by frame (`strips.py`, see `STRIPS.md`) is exported with
`strips.py export` and listed in `STRIP_UNITS` in the catalog instead of `PUPPET_UNITS`; its checks read
`strip-rigs/<id>.json` and `design/png-sprites/previews/<id>/provenance.json`. Preview it with `/?scenario=strip-units-showcase`.

## Source image rules (what makes a good source)

- One unit, **side view facing right**, full figure, transparent background, even lighting, ~1K square.
- **Tint region = saturated red.** Every piece of cloth that should take the owner's colour (tunic, shield boss, banner)
  is red, and **nothing else is red** (no red plume, no red blaze, no red gem). The key is hue < 4.5 % or > 95.5 %,
  saturation > 0.45 (`tint` in the spec).
- Painted style, bold dark outline, readable silhouette at 64 px. Reuse the Horseman's SpriteCook asset as
  `style_asset_ids` so the roster stays one family.
- Limbs/weapons that should move must be **separable**: a gap or clear edge between each leg, the weapon clear of the head.

## Profiles

| profile | needs | animates |
|---|---|---|
| `static` | nothing — works on any image | whole-sprite breathe (idle), bob + sway (walk), lunge (attack) |
| `mounted` | cut coordinates for 4 legs / tail / weapon arm | legs on a lateral-sequence gait, tail sway, weapon wind-up and thrust |
| `firearm` | `muzzle` point; optional `cut_y`/`overlap_top`/`hip_y` for two separable legs, `prop` for a propeller | body bob + sway, two-leg stride (when cut), recoil + muzzle flash and smoke on attack; `attack_fx`: `muzzle` (default), `torpedo` (bubbles + torpedo) or `none` (non-offensive unit); `sway_deg` for ships/balloons (#621) |

Start every new unit on `static` (no coordinates, ships in minutes); upgrade to a rigged profile only when it is worth it.
A new profile is a class in `puppet.py` with `frame(state, i, n)` returning an RGBA image, plus an entry in `PROFILES`.

## Rig spec reference

```jsonc
{
  "id": "horseman",                       // unit type; also the output folder name
  "source": "design/png-sprites/sources/horseman.png",
  "profile": "mounted",                   // static | mounted
  "facing": "right",
  "frame": { "size": 192,                 // cell edge in px (sheet is 8 cols x 3 rows)
             "fit_width": 0.9,            // max sprite width as a fraction of the cell
             "baseline": 0.8,             // where the feet sit, fraction of cell height (the map hex is below)
             "top_margin": 0.03,
             "shadow": { "rx": 0.3, "ry": 0.045, "opacity": 0.3 } },
  "tint": { "hue_ranges": [[0,0.045],[0.955,1]], "min_sat": 0.45, "min_val": 0.18 },
  "animations": { "idle": 4, "walk": 8, "attack": 8 },   // frames per row (2..8)
  "fps": { "idle": 4, "walk": 11, "attack": 8 },
  "rig": { /* profile-specific, in SOURCE-image pixels */ }
}
```

`mounted` rig: `cut_y` — a y below the belly where the four legs are separate components (the tool asserts it finds 4);
`overlap_top` — how far up each leg layer copies body pixels so the joint stays closed; `tail` — pivot, the slanted
cut line (`line_x0/line_y0/line_slope`) and `low_cut_y/x_max_low` for the tail's free end; `arm` — pivot, a polygon around
the weapon arm, and `keep_x/keep_y` (the torso corner that stays in the body). To find coordinates: open the PNG, read
pixel positions off a few crops, build, and compare `preview.png`.

## Joint technique (why it looks clean at game scale)

Moving layers carry a copy of the body pixels they overlap; legs are drawn **behind** the body, fully opaque, and the
body's bottom edge fades out over the leg tops, so no flat ledge shows when a leg swings; the tail root blends over a
short fade. Cuts are visible only above ~512 px, which the map never shows.

## Known limits (be honest about these when migrating)

- One facing: the painted unit faces right and the map does not mirror units today (the SVG sprites don't either).
- Rigid rider/head: only legs, tail and the weapon arm move in `mounted`.
- `hurt`/`death`/`work` reuse the idle row with a CSS filter (see `png-sprite-animations.css`); damage tiers are not drawn.
- Size: ~560 KB per unit (sheet + mask, 192 px cells). ~100 units would be ~55 MB of runtime-cached images — budget this
  before migrating the whole roster (options: WebP, 128 px cells, fewer frames, lazy-load by era).
