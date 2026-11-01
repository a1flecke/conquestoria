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
| **Mounted** | horseman, knight, cavalry, cuirassier, war_elephant | master, damage x4, attack, hit, defeat | idle, walk (`QuadRig`, `"kind": "mounted"`: four two-bone legs, lateral-sequence gait), per tier | the animal standing square; below the knees four separate legs with gaps (they may merge into the body above); the tail ending well above the hooves; coat not red-brown |
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
| A horse's legs merge into its body high up (the Horseman's fore pair at 0.22 of its height, the hind pair at 0.27) | `calibrate` with a belly-line cut fails: "found [1, 2, 3] pieces". The first plan guessed a cut at 0.30 to 0.50 and was wrong | Nothing: a horse is not drawn with separate thighs | `"kind": "mounted"` cuts low (`hem` default `[0.08, 0.30]`, the cut lands near 0.21) and swings only the lower legs. Only pieces that reach the ground count as legs, so a hanging tail is left on the body. A leg walk from the shoulder and hip would need a cut through the body |
| A rigged walk looks like a shuffle (legs scissor through each other, no stride) | Owner, at quarter speed. Horseman first pass: a sine swing at 16 degrees on rigid lower legs crossed the front pair | - | A walk is not a sine: `QuadRig` plants each hoof for 60% of the cycle sliding back at one pace (`QUAD_STANCE`), then lifts and folds it forward. The stride is smaller (9 degrees) and each leg is lowered as it leans so a planted hoof stays on the ground line |
| A shield, cloak or weapon hangs below the hem and touches a leg | `calibrate`: the cut sits too high (the red line in `rig-review.png` runs through the hem). On the Spearman it was 93 px, 0.077 of his height, above the hand-tuned cut | Repeat the "nothing hangs below the hem" rule in conversation A | `hem: [lo, hi]` narrows the search to below the hanging part (Spearman `[0.22, 0.30]` gives cut 861 against the hand-tuned 880), or an absolute `cut_y` |
| The spear, or any prop, touches a boot in a damage tier | `calibrate`: `warn rig_cut` for that tier (all four Spearman tiers failed this way; in the master the spear stands clear) | Conversation B's damage image says "keep the spear a hand's width clear of the boots" | That tier walks like the master |
| A damage tier changed the pose (slumped onto one leg) | `probe`: that tier will not calibrate | "Keep the legs and feet exactly as in the master; show the slump in the head and shoulders only" | That tier walks with the nearest tier that calibrates |
| A rigged loop looks wrong (gap at the hip, specks, lopsided stride, foot slide, short steps) | Owner, at quarter speed | - | Rig keys: `overlap_top`, `stride_deg`, `lift`, `knee_bend`, `bob`; the hip line is shared |
| A drawn one-shot strip has bad timing | Owner, at game speed (the game holds attack 1.5 s, hurt 0.7 s, death 1.2 s) | Ask for a missing beat (an anticipation, a recovery) | `fps`, and holding a frame |
| The sheet is too big | `build` prints KB | Fewer frames per strip | Palette quantisation (measure first) |
| A source figure is too small (8 figures in a 1024 px image) | `probe`: figure height under 300 px | Ask for a grid of 2 or 3 per row instead of one long row | - |

Stop rules: at most three regenerations of one image in one conversation, then a fresh conversation; at most two
conversation-B attempts per unit before changing the prompt template itself.

## Results so far (proof under #364)

| Unit | Family | Images | `probe` | Walk | Verdict |
|---|---|---|---|---|---|
| Spearman | biped | two full sets | Not run (the Spearman came before `probe`) | `LegRig`, after four drawn walks failed | Owner approved the rigged walk after one tuning pass |
| Archer | biped | five, accepted first generation | 0 errors, 1 warning (the defeat figure is 174 px) | `LegRig` plus `foot_level`: the three-quarter boot tipped toe-down with the back leg until the boot was hinged at the ankle. Stride 24, knee bend 14 | Owner: damage tier 3 worked at once, the others needed the boot and stride fixes; a viewer bug showed the previous tier's walk row |
| Horseman | mounted | five, accepted first generation | 0 errors, 0 warnings | `QuadRig`: cut low (near the knee), tail left on the body, a planted-then-lifted gait. The first sine swing was judged "a shuffle where the legs crisscross"; the planted gait was "a lot better" | Owner approved the walk. Side by side with the game's current puppet horseman (`previews/horseman/compare.html`): **the current horse looks better, the new actions look better** (the drawn attack, hit and defeat against the puppet's one stiff attack). The horse was the spec's choice: it was drawn dapple-grey to keep the coat out of the team-colour key (`coat` in `horseman.json`), so a chestnut or bay coat would need the tint key checked first (`probe` tint fraction). Sheet and mask are 2.0 MB |
| Tank | vehicle | three: master, damage x4, wreck (3 frames). The master was redrawn once, the wreck prompt rewritten once | 0 errors, 2 warnings, both on the wreck row (a figure touches the image edge but nothing is cut off; the smallest figure is 299 px against a 300 px limit) | `VehicleRig`: bounce, wheel spin, a track that scrolls a quarter link per frame, recoil with a muzzle flash and smoke, a decaying hit shake. No rig keys set by hand now (the first draft needed `tread.depth` 0.085, `tread.above` 0.277 and `muzzle`): the track band is 0.085 deep by default and stops at the hull top, read from the silhouette (the first row at least half as wide as the figure, so a turret, an open hatch or smoke is left out), and the muzzle is the right-most pixel in the figure's top 30% (the gun, not the track's front tip). Frame settings: `restHeight` 74 and `restFrames [0, 1]` on the damage sheet (hatch and smoke frames had skewed the scale) | Owner approved after the viewer (all four damage tiers, move, fire, hit, wreck). Not compared side by side with the game's current puppet tank. The sheet and mask are 1.0 MB |
| Ironclad | naval | three, accepted first generation: master, damage x4, sinking (3 frames in one row) | 0 errors, 0 warnings | `NavalRig` on the vehicle rig: roll about the keel, heave, white bow foam and a pale wake while moving (never red); fire and hit are the vehicle's. Rig keys set by hand: `muzzle` only (the front gun port; a gun port on a casemate cannot be told from the drawing alone). The heave and roll that first read as nothing at game size (0.02 and 1.6 degrees) are now the `NavalRig` defaults (`bob` 0.07, `rock` 3.2). `restHeight` 58. The viewer draws ships on water hexes | Owner: bobbing better after the first increase. Not compared side by side with the game's current puppet ironclad. The sheet and mask are 0.5 MB |
| Biplane | aircraft | three: master, damage x4, going down (3 frames in one row). The going-down row was redrawn once (the first came back with the red fuselage repainted brown and black, which loses the team colour; the template said "scorched dark") | 0 errors, 0 warnings | `FlightRig` on the vehicle rig: heave, nose pitch about the middle of the aircraft (nose up while it climbs), a grey shimmering propeller blur disc that follows the aircraft, a nose-gun flash with a small kick; no ground anchoring. No rig keys set by hand: the propeller disc is read from the drawn blade (`flight_prop`: as tall as the blade, centred on it), the muzzle sits just behind it (`flight_muzzle`), and the heave and pitch are the `FlightRig` defaults (`bob` 0.05, `pitch` 4). The first draft needed `prop`, `muzzle`, `bob` and `pitch` by hand | Owner approved after the viewer (aircraft are drawn over sky-blue hexes). Not compared side by side with the game's current puppet biplane. The sheet and mask are 1.4 MB |

What carried over to the next units:

- **Master and set prompts worked as written.** Neither the Archer nor the Horseman needed a regeneration, and both passed `probe` on the first try.
- **A cycle can be wrong in two ways**: the legs cross or alternate wrongly (fixed by building it in code), and a shape of motion that is not a walk (a sine on rigid legs). Check a new rig at quarter speed before blaming the drawing.
- **A rig must be checked on every damage tier**, not only the master: each tier walks wounded, and `check_rigs` warns for a tier it cannot cut.
- **A chestnut coat is safe; a red-brown one is not.** The team-colour key is hue <= 0.045 (or >= 0.955) at saturation >= 0.45. The
  puppet's chestnut measured hue 0.050-0.090 (median 0.073, #89542E) and the second Horseman set 0.053-0.086, so only the red
  tunic and saddle cloth take a player's colour (10.7-12.9% of each image in the key). Ask for an *orange* chestnut in the
  prompt (the Horseman spec's `coat` gives the two hex values) and measure each image's coat hue before building.
- **Standing rows and the walk need one anchor.** When the standing pose (anchored on the hooves, `'feet'`) and the walk (on the torso)
  disagree by more than 12 px for a damage tier, `export` refuses the unit. The Horseman's standing rows are set to `"anchor": "torso"`
  to match its walk.
- **The look of the coat is a spec decision, not a pipeline limit.** The Horseman's grey coat was chosen to dodge the red-brown team-colour key, and the owner preferred the old chestnut horse. Before choosing a coat, run `probe` on a master with that coat and read the tint fraction (a healthy figure is about a tenth).
- **Describe where the gun sits as a geometry, not a feature.** The first Tank master had a "side sponson" gun pointing forward, which cannot be both. A top turret with a forward barrel was drawn correctly at once. Ask for a shape that can exist.
- **Say "one row" and forbid the grid in the wreck prompt.** A wreck asked for among other images came back as a damage grid twice; a prompt that names the one image, the exact layout ("not a grid, not a column") and says the band darkens in the burning frames came back right. `probe` then confirmed three separate figures and no flame in the tint key.
- **Measure scale from frames that match the master.** Smoke and an open hatch make a damage frame taller; `restFrames` picks the frames that set the scale, and a tread position given as a width fraction from the bottom (`above`) stays put when something rises above the hull.
- **Ships need a bigger heave than a first guess.** A rock of 1.6 degrees and a bob of 2% of the hull's height were invisible at 58 px tall; 3.2 degrees and 7% read as a ship. The drawing must stop at a straight waterline with no water, so all of the water is code and viewer.
- **A wreck must not repaint the team colour.** The Tank and Ironclad wrecks darken the band and were approved, but the first Biplane going-down row turned the whole fuselage brown and black and the owner disliked it. For aircraft the template now says the red stays the same and the damage is soot, scorch marks, flames and smoke drawn over it. A burning frame's orange sits close to the tint key (hue 0 to 0.045); check a few factions in the viewer.
- **Family defaults carry what every unit of the family needs.** Ships and aircraft all need a heave and tilt that read at game size, so those are the `NavalRig` and `FlightRig` defaults, not a number each spec re-discovers. The aircraft propeller disc is read from the drawn blade (a tall thin sliver at the nose), so a spec gives no `prop` or `muzzle`. A ship's gun port still needs a hand-set key because the drawing alone cannot say where it is; a tank's track band and gun are read from the silhouette.
- **Still open:** the game-side work (non-square cells, hurt/death/work rows, play-once, tier rows, the death snapshot) that the preview does not need.


## Decision (plan Task 10)

Against the plan's thresholds (approved in the viewer, master redrawn at most twice, at most three regenerations, at most two rig keys moved from their defaults):

| Family | Approved | Redraws | Rig keys set by hand (after the family defaults change) | Verdict |
|---|---|---|---|---|
| Biped (Spearman, Archer) | yes | Spearman two sets, Archer 0 | `foot_level`, calibrated cut | proven |
| Mounted (Horseman) | yes | 0 | cut height, tail, gait | proven |
| Vehicle (Tank) | yes | master 1, wreck prompt 1 | none (`restHeight` and `restFrames` are frame settings) | proven |
| Naval (Ironclad) | yes | 0 | muzzle (one) | proven |
| Aircraft (Biplane) | yes | going-down row 1 | none | proven |

The owner approved moving the strengths into family defaults, and it is done: the first drafts of the Ironclad and Biplane
needed the heave, the tilt, the propeller disc and the muzzle by hand; `NavalRig` and `FlightRig` now carry sensible defaults
and read the propeller from the drawing. The Tank is under the limit too: its track band stops at a hull top read from the
silhouette and its gun is found in the top 30% of the figure, so `tank.json` sets no rig key by hand. Every family is within
the key limit.

## Export to the game (#1627)

The game's PNG player now takes wide cells, a pose per damage tier, play-once one-shots and a death pose (#1634). `export`
repacks an approved preview into the files it plays; it does not wire a unit in (that is a catalog row, done per unit on the
owner's word).

```
python3 -I scripts/sprite-puppet/strips.py export scripts/sprite-puppet/strip-rigs/<id>.json [--scale 0.75]
```

It reads `design/png-sprites/previews/<id>/` and writes `public/images/units/<id>/{sheet,mask}.png` and
`src/renderer/sprites/png/generated/<id>.manifest.ts` (a `PngUnitSprite`; never hand-edit it). Nothing is written unless every
check passes.

| Game row | Built from the preview | Played |
|---|---|---|
| poses (row 0) | idle frame 0, then column 1 to 3 of the damage row (tiers 0 to 3) | one still frame per tier |
| walk | `walkrig`, else `move`, else `walk`; one row per tier when the preview has a tier group (tier t is the group's entry t + 1, as the viewer shows it), else one row for all tiers | loop |
| attack | `attack`, else `fire` | once, then holds its last frame |
| hurt | `hit` | once |
| death | `defeat`, else `wreck`, `sinking`, `down` | once |

The drawn walk, the master walk and a `work` row are not exported: the game never plays them. Cells are scaled by `--scale`
(default 0.75: the largest on-screen unit box is about 86 CSS px, and the Spearman's wide thrust would take 36 MiB at full size).
The sheet is a 256-colour palette PNG with no dither (median error 4, 99th percentile 17 of 255 on the six previews; watch smooth
gradients for banding at the screenshot review), the mask is grey plus alpha.

**It refuses**, naming the unit and the row, when:

- a role is missing (no attack, hurt or death row);
- a one-shot is longer than the game holds it (attack 1.5 s, hurt 0.7 s, death 1.2 s, mirrored from `pirate-sprite-state.ts` and pinned by a test), so the clip would be cut off;
- the idle pose is more than 12 px from the middle of its cell, or a standing pose or walk frame is more than 12 px from the idle pose (a unit would jump when it starts to move). One-shots are not held to this: a thrust and a recoil legitimately move the figure;
- a standing pose or walk frame reaches outside the unit box placed on the feet line (lower `--scale`, or redraw it smaller);
- the sheet and mask are over 640 KB on disk or 24 MiB decoded (`--max-kb`, `--max-mib` override this for experiments).

Results at 0.75 (Ironclad after its `restHeight` rise, Biplane after the anchor fix below): Spearman 158 KB and 12.1 MiB, Archer
248 KB and 11.8 MiB, Horseman 265 KB and 12.7 MiB (the chestnut set), Tank 154 KB and 11.0 MiB, Ironclad 123 KB and 11.0 MiB, Biplane 224 KB and
9.3 MiB.

**The Biplane used to be refused** (#1627): its idle pose sat 29 px left of the middle of its cell while the rows built in code
were centred. A drawn row was anchored on the mean x of its lowest 10% of rows (`anchor_x`, `'feet'`), which for an aircraft is
the undercarriage, well off the middle of a long tail, and the rig rows are centred on their bounding box. Drawn rows of a spec
that has a `flight` or `naval` rig now default to `anchor: 'center'` (the middle of the drawing's box); a spec's own `anchor`
still wins, and a biped keeps `'feet'` (`tests/scripts/sprite-strips-tool.test.ts`, "drawn rows of a flight or naval unit").

**Size on the hex is a spec choice, not an export choice.** The Ironclad's first `restHeight` (58 of 192) made the ship fill 58%
of the box width where the puppet filled 94%, so it read as a regression in the game. Compare the widest idle figure with the
cell height (`idle figure width / cell height`: Tank 0.92, Biplane 0.74, Ironclad 0.88 after `restHeight` 88) when you pick
`restHeight` for a low, wide unit, and look at it in `/?scenario=strip-units-showcase` next to the unit it replaces.
