# Spearman: image-generated animation strips (prototype)

> **Shipped (#1627):** Spearman now plays these strips in the game; the gap table below is resolved and kept as history.

A one-unit experiment: can an image generator draw **every frame** of a unit (walk, attack, hurt, death, work and four damage
tiers), instead of the game animating one still with a rig (`scripts/sprite-puppet/puppet.py`)? Nothing here is wired into the
game (as written at the time; see the note above). It is a preview page plus the prototype tool that built its sheet.

This is the second run. The first (single-row strips on a magenta field, 6-frame walk) had a stiff walk and a barely visible
first damage tier; it was replaced by the set described here and is in this branch's git history.

## Look at it

The page tints on `<canvas>` rather than with CSS masks (which browsers block on `file://`), so it should open from disk too, but only
the served route below has been checked. Serving it is the easiest:

```bash
./scripts/dev-server.sh start
```

then open `http://localhost:<port>/conquestoria/design/png-sprites/previews/viewer.html?unit=spearman` (the port is printed;
`spearman/index.html` redirects there). The viewer is shared by every strip unit: `?unit=<id>` loads `<id>/manifest.js`. Stop the
server with `./scripts/dev-server.sh stop`.

What it shows: the soldier on a hex map with buttons for each state the game sends a unit (`idle`, `walk`, `attack`, `hurt`,
`death`, `work`), a health slider driving the four damage tiers, the six faction colours plus a free colour picker, four unit
sizes, every animation looping, the damage tiers side by side, and a size check at 36 to 150 px.

Walking is shown at the game's real pace: one hex in 220 ms, and a whole move capped at 800 ms (`MOVEMENT_MS_PER_HEX` and
`MOVEMENT_MAX_MS` in `src/renderer/unit-movement-animation.ts`), plus a walk-in-place loop. A speed control (game, half, quarter)
slows everything down so the cycle can be studied, and a "Walk" switch chooses the rigged legs (the default), the drawn frames, or
one drawn step repeated.

## What is in this folder

| File | What |
|---|---|
| `index.html`, `manifest.js` | the preview page and the sheet layout it reads |
| `sheet.png`, `mask.png` | 8 x 8 cells of 368 x 192 px, 41 frames (33 drawn, 8 rigged) in 64 slots, 1.2 MB together. The cloth is a grey ramp in the sheet; the mask says how much of each pixel takes the civ colour (same scheme as the game's PNG units) |
| `manifest.json` | the same layout as JSON |
| `prompt.txt` | the prompt written for this run (ChatGPT altered it before it would run; see `provenance.json`) |
| `prompt-walk.txt` | the prompt for the final walk image (the walk was redrawn three times) |
| `provenance.json` | generator, date, scan result, SHA-256 of the seven originals (the originals are not committed, about 11 MB) |

Rebuild with the originals in a folder (named `a` to `g`, `.png` or `.bin`, as the spec lists them):

```bash
python3 -I scripts/sprite-puppet/strips.py build scripts/sprite-puppet/strip-rigs/spearman.json --sources <folder>
```

## How hard is a proper pipeline? (findings from building this)

### Intake: easy, and mostly done

`scripts/sprite-puppet/strips.py` cuts, normalises and packs the strips. Both runs worked with no hand tuning of the cut:

- **Finding the figures.** Run 1 came back on a flat magenta field; run 2 came back with real transparency (RGBA). The tool handles
  both. Each figure is one connected component, so single rows and grids (the second run laid its walk out as 4 x 2, the attack
  as 3 x 2, and so on) both cut cleanly, and ChatGPT's cell borders are never trusted (the lunge spears cross them).
- **Transparency has a catch.** The hit and defeat images carry a faint glow baked into their transparent background. It sits at
  alpha 20 or below while the figures are at 231 or above, so a threshold at 200 removes it and gives exactly the expected frame
  count in every image.
- **Scale is the weak point.** ChatGPT draws each image at its own zoom (the same soldier is 415 px tall in the walk image and 607 px in
  the damage image), even when told to keep one size. The tool scales each strip from its upright rest frames. The attack strip has no
  upright frame, so its scale comes from the area of the steel shield and spear head matched against the walk. The shield method and
  the height method agree to within about 7% where both can be used, so expect that much error on the attack. This is the one
  place a person should eyeball the result.
- **Anchoring.** Boots go on one baseline. Horizontally, the walk is anchored on the torso (the body stays still while the legs swing:
  torso drift fell from 28 px to 1 px of a 150 px figure) and everything else on the boots (so a lunge or a stagger moves the body
  while the feet stay planted).
- **Tint.** The existing red-hue key picked up only the tunic and cloak. Skin, leather, shield and spear were untouched.
- **Edges.** Background spill is removed by replacing edge colours with the nearest interior colour; no fringe at 192 px.

What the tool does not do yet: tests, a rig-spec validator, palette quantisation, and a provenance writer. All small.

### Player and manifest: the real work (medium)

The game's PNG player was built for one still rigged into three rows. These were the gaps (all resolved by #1634 and #1627), each checked against the source at the time:

| Gap | Where | Size |
|---|---|---|
| **Cells are square.** `PngSpriteManifest.frameSize` is one number, the CSS sizes the sheet as `cols * 100%` by `rows * 100%` of a square element, and the canvas bake copies `S x S`. A spear thrust is wider than the soldier is tall (this sheet needs 368 x 192). Fitting the thrust into a square cell would shrink the figure to about half its height; the alternative is a `cellWidth`/`cellHeight` pair, which touches the manifest type, the generated-manifest writer, the CSS variables, the canvas bake and the overlay wrapper. | `png-sprite-types.ts`, `png-sprite-html.ts`, `png-sprite-canvas.ts`, `png-sprite-animations.css` | medium |
| **Only three states have rows.** `hurt`, `death` and `work` reuse the idle row with a colour filter. Real rows mean adding them to `PngSpriteState`, the CSS selectors and the per-state variables. | same files | small |
| **Everything loops.** The player runs `infinite`. Attack, hurt and death should play once. The game holds `attack` for 1.5 s, `hurt` for 0.7 s and `death` for 1.2 s (`pirate-sprite-state.ts`), so a 0.67 s thrust would loop about twice per attack today. | CSS | small |
| **Damage tiers are not drawn.** `data-damage` exists on the wrapper (`render-loop.ts` computes it for every combat unit) and the SVG sprites use it, but the PNG player ignores it. One more row offset per tier would do it, if the rows exist. | CSS + manifest | small, but see size below |
| **A death pose is only kept for pirates.** When a regular unit dies it is removed from state, so no `death` frame would ever show. Only pirate units get a death snapshot (`pirateUnitDeathSnapshots` in `render-loop.ts`). Showing a death animation for everyone is a presentation change beyond the sprite. | `render-loop.ts` | medium, separate from art |

### Size and art workload

- Today's PNG units are 212 to 628 KB each on disk (sheet plus mask). This prototype is 1.1 MB for **33** drawn frames in a 56-slot
  sheet, so roughly 33 KB per drawn frame. The art is more detailed than run 1 (which was 26 KB per frame).
- Drawing every movement at every damage tier is 29 frames x 4 tiers = 116 frames, about 3.9 MB per unit before any compression.
  Across the ~100 units in the game that is on the order of 390 MB of runtime-cached images (estimates, not measurements). WebP or a
  reduced palette would cut that a lot, but it needs measuring. The README for the existing rig already flags ~55 MB for the whole
  roster as a budget risk.
- Art: one ChatGPT conversation produced all seven images. Full per-tier coverage would be roughly four times the strips.
  Damage on the standing pose only (what is in this prototype) is one extra image.

### What the experiment says about quality

- **The character stayed the same across all seven images again** (two samples now, still not proof it always will).
- **The walk took four attempts** (`prompt-walk.txt` is the last prompt). The first (6 frames) was stiff. The second (8 frames)
  repeated one step, so the same leg led every time and it read as a skip. The third swapped one frame but had high knees (the prompt
  asked for "knee raised and forward") and uneven pacing. The fourth, a relaxed walk with low feet, has no high knees and almost
  no vertical bounce (1 px of head movement on a 150 px figure). The second step still is not an exact mirror of the first
  (frame 3 has the trailing foot lifted behind, frame 7 has the legs together). Played in the preview it still read as a
  **gallop shuffle**: the same leg goes forward and the same leg goes back, because the drawn contact frames of the two steps are
  copies. Four generations never produced a true leg swap, even with the near and far legs named in the prompt.
- **The rigged walk (`walkrig`) is the fix for that.** `strips.py` can build a walk in code from the idle drawing (`LegRig`): it cuts
  the figure below the hem into the body, the spear shaft and two legs, brings both hips onto one line (the master's stance is wide, so
  swinging the legs about their own hips made the strides lopsided: wide one way and crossed the other), and swings the two legs in
  opposite directions, lifting each foot as it moves forward. The legs alternate by construction. The first version had rigid legs
  and short steps; each leg is now two bones joined at the knee (the boot top), so the shin folds back and then reaches forward in
  every step, which allowed a wider stride (28 degrees) with a smaller foot lift. The steps are still short because the figure is
  stylised with short legs (about 27% of his height): a step of about a quarter of his height is what 28 degrees gives. It is a
  two-bone rig, so it is plainer than a drawn walk. The page defaults to it and lets you switch to the drawn frames.
- **Damage tiers are clearly different at a glance**: dirt and a slash, then torn cloth and a cracked shield, then bandages, a broken
  shield and a bent spear. Tier 1 was the weak one before.
- The thrust, hit reaction, defeat and work strips all read well. The attack opens with an extra anticipation and an overhead wind-up.
- **Not yet judged:** how the motion feels at 60 fps in a real browser (the review browser here throttles animation), and the
  ~7% scale uncertainty on the attack strip.
- Everything faces right only, as with every unit today. Damage tiers exist for the standing pose only.

### Options

1. **Keep the rig pipeline, use ChatGPT only for the master image and the four damage poses.** Fits today's player unchanged
   (idle/walk/attack synthesized by `puppet.py`, damage poses would need only the small tier-row change). Cheapest, but the walk is
   still a bobbing still.
2. **Hybrid.** Real strips only where a rig cannot fake it: the thrust and the death. Walk and idle stay rigged. The experiment
   points here: it is also what practitioners report (see the search notes in the PR): AI for the poses, code or a skeleton for the walk.
3. **Full strips (this prototype).** Needs the non-square cell, extra states, play-once and tier rows, plus a size budget decision.
   Best motion, largest cost.

If the look is approved, option 2 or 3 starts with one PR that changes the manifest and player and ships one unit.
