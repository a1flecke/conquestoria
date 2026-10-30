# Image-generated unit art: prompts and pipeline (prototype)

How to turn a unit into a full set of painted animation frames with ChatGPT image generation plus `strips.py`. It generalises
the Spearman prototype (`design/png-sprites/previews/spearman/`, draft PR #1624). Nothing here is wired into the game yet: the
output is a sheet, a mask, a manifest and a preview page. What the game's PNG player would need is in the Spearman README
("Player and manifest: the real work").

## The rule: the model draws poses, code draws cycles

What the Spearman runs showed (three ChatGPT conversations, two full sets, five walk attempts):

| Worked | Failed |
|---|---|
| The same character across every image of one conversation, when the master is attached and named as the authoritative reference (2 of 2 sets) | Any **cycle**. Four drawn walks: stiff, then a skip (the second step copied the first), then high knees, then a gallop shuffle (the same leg led both steps). ChatGPT's own code-assembled walk was rigid and crossed its legs at frames 4 to 5 |
| Four damage tiers in the master's pose, clearly different at a glance | Exact pixel sizes. Every image comes back at its own zoom (the same soldier was 415 px tall in one image and 607 px in another) and its own canvas size |
| One-shot actions where every frame is a distinct pose: thrust, hit reaction, defeat, work | Contradictory constraints. "Exactly the master's pixel height inside a 256 px strip" made ChatGPT refuse and rewrite the prompt |
| Real transparency (asked for magenta, got RGBA with a faint glow at alpha <= 20) | |

And the walk built in code from the master (`LegRig`) was approved by the owner after one tuning pass. So:

- **ChatGPT draws:** the master, the four damage tiers (in the master's exact pose), and the one-shot actions (attack, hit,
  defeat, plus work for units that work).
- **Code builds:** every looping motion: idle breathing, walking, galloping, rolling, flying, rocking. It builds them from the
  master and again from each damage tier, so a wounded unit walks wounded.
- **Prompts ask for proportions, spacing and order, never pixels.** `strips.py` finds each figure, scales each image to one
  height, aligns baselines and packs the sheet.

## Unit families

Every combat unit belongs to one family. The family decides the master's pose (it must be cuttable), which images are
drawn, and which rig builds the loops.

| Family | Units (examples) | ChatGPT draws | Code builds | The master must have |
|---|---|---|---|---|
| **Biped** | spearman, archer, warrior, swordsman, axeman, pikeman, musketeer, rifleman, infantry, marine | master, damage x4, attack, hit, defeat | idle, walk (`LegRig`, two-bone legs), per tier | two separate legs below the garment hem with a gap between the feet; nothing below the hem but at most one straight thin shaft |
| **Mounted** | horseman, knight, cavalry, cuirassier, war_elephant | master, damage x4, attack, hit, defeat | idle, walk (four-leg rig, lateral-sequence gait), tail sway, per tier | the animal standing square, four legs separate with gaps; tail clear of the hind legs; coat not red-brown |
| **Vehicle** | tank, main_battle_tank, armored_car, mobile_aa, artillery, cannon, catapult, wagons | master, damage x4, wreck (3 frames) | idle engine shake, move (bob, vibration, wheel spin or tread scroll, exhaust), fire (recoil, flash, smoke), hit (shake) | level on one ground line; wheels as full circles with spokes or bolts, or a clear track band; barrel horizontal and free |
| **Aircraft** | biplane, wwii_fighter, jet_fighter, bomber, attack_helicopter | master, damage x4, going down (3 frames) | idle and move (bob, bank roll, propeller blur, rotor, jet flicker), fire (flash or bomb release) | flat side view in level flight; propeller stopped and edge-on; no ground |
| **Naval** | galley, trireme, frigate, ironclad, destroyer | master, damage x4, sinking (3 frames) | rock and sway, bow wave, oar sweep (galleys), fire | a straight horizontal waterline with the hull cut off at it (no water drawn) |

Siege engines with a crew (catapult, trebuchet) are vehicles that also get a drawn attack strip: the throwing arm is a pose,
not a loop. Beasts use the mounted rig without a rider (boar, wolf) or the aircraft rig (roc, dragon).

## The process, per unit

1. **Spec.** Copy a family's spec in `strip-rigs/` to `strip-rigs/<id>.json` and fill its `prompt` block (what the unit looks
   like, its team-colour area, its weapon, its attack). Run `strips.py prompt strip-rigs/<id>.json` to print the two prompts.
2. **Conversation A, the master** (`strip-prompts/master.md`). A fresh ChatGPT conversation, no attachment. Regenerate until
   the owner likes it. Save it as a PNG (save the file; a pasted image arrives as WebP) and name it `a.png`.
3. **Conversation B, the set** (`strip-prompts/set.md`). A fresh conversation with `a.png` attached. It draws the damage tiers
   and the one-shot strips one image at a time. Save them as `b.png`, `c.png` ... in the order the spec lists.
4. **Intake.** In a folder that holds only the downloaded images:
   - `python3 -I scripts/portrait-pixelate/portrait_pixelate.py scan <file>` for each image (security scan; originals are never
     committed),
   - `strips.py probe strip-rigs/<id>.json --sources <dir>`: figure counts, scale spread, figures touching an edge, team-colour
     leaks, and whether the rig can cut each source. Fix what it reports before building,
   - `strips.py build strip-rigs/<id>.json --sources <dir>`: sheet, mask, manifest, review sheet.
5. **Review** in the preview viewer (`design/png-sprites/previews/viewer.html?unit=<id>`): every state at game speed and at
   quarter speed, all four damage tiers walking, six faction colours, and the size check at 36 to 150 px.
6. **Iterate** with the failure playbook below. Record what happened in `design/png-sprites/previews/<id>/provenance.json`.

## Failure playbook

| Symptom | How it shows up | Fix in the conversation | Fix in the tool |
|---|---|---|---|
| ChatGPT refuses or rewrites the prompt | It answers with a plan or a new prompt instead of an image | Use its rewrite if it keeps every rule; record the prompt that actually ran | - |
| The character drifts (face, beard, shield, coat) | Owner compares to the master | "Image N changed X. Redraw only image N, keep X as in the attached master." Twice in a row: fresh conversation B with only the missing images | - |
| Wrong frame count, figures touching, a detached piece (a flying arrow, dust, sparks) | `probe`: "expected 6, found 5" or "a 4000 px piece is left over" | Ask for more space between figures and "nothing detached from the figure" | `grid` ordering; a `minPiece` area to ignore specks |
| One image at a different zoom | `probe`: scale per image | Nothing; it is expected | Automatic: rest-frame height, or `matchSteelTo` for a strip with no upright frame; `scaleOverride` if two methods disagree by more than 10% |
| Team colour leaks (chestnut horse, rust, skin, brick, flame) | `probe`: tint fraction per image and a red overlay in the review sheet | Name the colour that leaked and forbid it ("the horse is grey, not chestnut") | Narrow `tint.hue_ranges` or raise `min_sat` for this unit |
| Team colour too small to read at 48 px | Owner, at the size check | Make the area bigger: a banner, saddle cloth, hull band, tail fin | - |
| The rig cannot cut the master (legs touching, cloak or shield over a leg, horse legs overlapping) | `probe`/`calibrate`: "expected 2 legs below the hem, found 1" | Redraw the master with the family's pose rules repeated; this is the most likely failure | `calibrate` searches cut heights; a `split_x` line separates two touching legs; last resort the `static` rig (bob only) |
| A damage tier changed the pose (slumped onto one leg) | `probe`: that tier will not calibrate | "Keep the legs and feet exactly as in the master; show the slump in the head and shoulders only" | That tier walks with the nearest tier that calibrates |
| A rigged loop looks wrong (gap at the hip, specks, lopsided stride, foot slide, short steps) | Owner, at quarter speed | - | Rig keys: `overlap_top`, `stride_deg`, `lift`, `knee_bend`, `bob`; the hip line is shared |
| A drawn one-shot strip has bad timing | Owner, at game speed (the game holds attack 1.5 s, hurt 0.7 s, death 1.2 s) | Ask for a missing beat (an anticipation, a recovery) | `fps`, and holding a frame |
| The sheet is too big | `build` prints KB | Fewer frames per strip | Palette quantisation (measure first) |
| A source figure is too small (8 figures in a 1024 px image) | `probe`: figure height under 300 px | Ask for a grid of 2 or 3 per row instead of one long row | - |

Stop rules: at most three regenerations of one image in one conversation, then a fresh conversation; at most two
conversation-B attempts per unit before changing the prompt template itself.
