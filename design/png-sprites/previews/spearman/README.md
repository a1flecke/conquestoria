# Spearman: image-generated animation strips (prototype)

A one-unit experiment: can an image generator draw **every frame** of a unit (walk, attack, hurt, death, work and four damage
tiers), instead of the game animating one still with a rig (`scripts/sprite-puppet/puppet.py`)? Nothing here is wired into the
game. It is a preview page plus the prototype tool that built its sheet.

## Look at it

The page tints on `<canvas>` rather than with CSS masks (which browsers block on `file://`), so it should open from disk too, but only
the served route below has been checked. Serving it is the easiest:

```bash
./scripts/dev-server.sh start
```

then open `http://localhost:<port>/conquestoria/design/png-sprites/previews/spearman/index.html` (the port is printed). Stop it
with `./scripts/dev-server.sh stop`.

What it shows: the soldier on a hex map with buttons for each state the game sends a unit (`idle`, `walk`, `attack`, `hurt`,
`death`, `work`), a health slider driving the four damage tiers, the six faction colours plus a free colour picker, four unit
sizes, every animation looping, the damage tiers side by side, and a size check at 36 to 150 px.

## What is in this folder

| File | What |
|---|---|
| `index.html`, `manifest.js` | the preview page and the sheet layout it reads |
| `sheet.png`, `mask.png` | 6 x 7 cells of 304 x 192 px. The cloth is a grey ramp in the sheet; the mask says how much of each pixel takes the civ colour (same scheme as the game's PNG units) |
| `manifest.json` | the same layout as JSON |
| `prompt.txt` | the single ChatGPT prompt that produced all seven images |
| `provenance.json` | generator, date, scan result, SHA-256 of the seven originals (the originals are not committed, about 11 MB) |

Rebuild with the originals in a folder (named `1-idle.bin` ... `7-work.bin`):

```bash
python3 -I scripts/sprite-puppet/strips.py build scripts/sprite-puppet/strip-rigs/spearman.json --sources <folder>
```

## How hard is a proper pipeline? (findings from building this)

### Intake: easy, and mostly done

`scripts/sprite-puppet/strips.py` cuts, normalises and packs the strips. It worked on the first run with no hand tuning:

- **Keying.** The generated "magenta" was about `#F807F9` with a spread of a few levels, so a simple colour test separates it. Every
  figure comes out as its own connected component (6 walk, 5 attack, 4 per other strip), so no cell grid has to be trusted.
  ChatGPT's cells were *not* equal width (the lunge spears cross cell borders), which is why cutting by component matters.
- **Scale.** ChatGPT drew each strip at its own scale (idle figure 541 to 690 px tall depending on the strip). The tool scales each
  strip from its rest-pose frames to one common height. After that the rows match.
- **Position.** Boots on one baseline, boot centre on one vertical line. No jitter visible between frames.
- **Tint.** The existing red-hue key picked up only the tunic and cloak. Skin, leather, shield and spear were untouched.
- **Edges.** Magenta spill is removed by replacing edge colours with the nearest interior colour; no magenta fringe at 192 px.

What the tool does not do yet: tests, a rig-spec validator, palette quantisation, and a provenance writer. All small.

### Player and manifest: the real work (medium)

The game's PNG player was built for one still rigged into three rows. These are the gaps, each checked against the source:

| Gap | Where | Size |
|---|---|---|
| **Cells are square.** `PngSpriteManifest.frameSize` is one number, the CSS sizes the sheet as `cols * 100%` by `rows * 100%` of a square element, and the canvas bake copies `S x S`. A spear thrust is wider than the soldier is tall (this sheet needs 304 x 192). Fitting the thrust into a square cell would shrink the figure to about 63% of its height; the alternative is a `cellWidth`/`cellHeight` pair, which touches the manifest type, the generated-manifest writer, the CSS variables, the canvas bake and the overlay wrapper. | `png-sprite-types.ts`, `png-sprite-html.ts`, `png-sprite-canvas.ts`, `png-sprite-animations.css` | medium |
| **Only three states have rows.** `hurt`, `death` and `work` reuse the idle row with a colour filter. Real rows mean adding them to `PngSpriteState`, the CSS selectors and the per-state variables. | same files | small |
| **Everything loops.** The player runs `infinite`. Attack, hurt and death should play once. The game holds `attack` for 1.5 s, `hurt` for 0.7 s and `death` for 1.2 s (`pirate-sprite-state.ts`), so a 0.55 s thrust would loop about three times per attack today. | CSS | small |
| **Damage tiers are not drawn.** `data-damage` exists on the wrapper (`render-loop.ts` computes it for every combat unit) and the SVG sprites use it, but the PNG player ignores it. One more row offset per tier would do it, if the rows exist. | CSS + manifest | small, but see size below |
| **A death pose is only kept for pirates.** When a regular unit dies it is removed from state, so no `death` frame would ever show. Only pirate units get a death snapshot (`pirateUnitDeathSnapshots` in `render-loop.ts`). Showing a death animation for everyone is a presentation change beyond the sprite. | `render-loop.ts` | medium, separate from art |

### Size and art workload

- Today's PNG units are 212 to 628 KB each on disk (sheet plus mask). This prototype is 719 KB for **28** drawn frames in a 42-slot
  sheet (14 slots are empty), so roughly 26 KB per drawn frame.
- Drawing every movement at every damage tier is 24 frames x 4 tiers = 96 frames, about 2.5 MB per unit before any compression.
  Across the ~100 units in the game that is on the order of 250 MB of runtime-cached images. WebP or a reduced palette would cut
  that a lot, but it needs measuring. The README for the existing rig already flags ~55 MB for the whole roster as a budget risk.
- Art: one ChatGPT conversation produced all seven images here. Full per-tier coverage would be roughly four times the strips.
  Damage on the standing pose only (what is in this prototype) is one extra strip.

### What the experiment says about quality

- The character stayed the same across all seven images (one sample, so not proof it always will).
- The walk cycle is stiff: little leg change between frames, frames 2 and 5 nearly alike.
- The thrust, defeat and work strips read well. Damage tier 1 is barely different from healthy and would need a re-prompt.
- Everything faces right only, as with every unit today.

### Options

1. **Keep the rig pipeline, use ChatGPT only for the master image and the four damage poses.** Fits today's player unchanged
   (idle/walk/attack synthesized by `puppet.py`, damage poses would need only the small tier-row change). Cheapest, but the walk is
   still a bobbing still.
2. **Hybrid.** Real strips only where a rig cannot fake it: the thrust and the death. Walk and idle stay rigged.
3. **Full strips (this prototype).** Needs the non-square cell, extra states, play-once and tier rows, plus a size budget decision.
   Best motion, largest cost.

If the look is approved, option 2 or 3 starts with one PR that changes the manifest and player and ships one unit.
