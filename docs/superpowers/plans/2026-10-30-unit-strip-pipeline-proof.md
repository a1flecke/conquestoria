# Unit Strip Pipeline Proof Implementation Plan

> **For agentic workers:** this repository forbids subagents (`CLAUDE.md`, "Agent Policy"). Execute inline with
> superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove the generalised "ChatGPT draws the poses, code draws the cycles" pipeline on three more units from three
different families (Archer: biped, Horseman: mounted, Tank: vehicle), with measured results and a go/no-go decision.

**Architecture:** `strips.py` gains four commands (`prompt`, `probe`, `calibrate`, `build`) and three family rigs (biped
`LegRig` generalised, a four-leg rig, a vehicle rig). Rig coordinates become fractions of the figure, found by calibration,
so a new unit needs no hand-picked pixels. A rig can run on every damage tier, so a wounded unit moves wounded. One shared
preview viewer replaces the Spearman-only page. Each unit is then generated, taken in, reviewed by the owner and iterated
with the playbook.

**Tech Stack:** Python 3.11+ (Pillow, numpy, scipy; dev-time only), vitest (runs the tool in a sandbox), plain HTML/JS
viewer, ChatGPT image generation (run by the owner).

**Spec:** `scripts/sprite-puppet/STRIPS.md` (families, process, failure playbook) with the prompt templates
`scripts/sprite-puppet/strip-prompts/master.md` and `set.md`. Background and findings:
`design/png-sprites/previews/spearman/README.md`.

## Global Constraints

- Nothing under `src/` or `public/` changes. Output lives in `design/png-sprites/previews/<id>/` and `.verification/strips/<id>/`.
- Run Python as `python3 -I`. Downloaded originals live in their own folder outside the repo, are scanned with
  `portrait_pixelate.py scan` before any other use, and are never committed; their SHA-256 goes in `provenance.json`.
- Team colour: the existing key `{"hue_ranges": [[0, 0.045], [0.955, 1]], "min_sat": 0.45, "min_val": 0.18}`, base `#E01010`.
- Family-friendly: no blood, no gore, no text in any image.
- Game timing the preview must reproduce: `MOVEMENT_MS_PER_HEX = 220`, `MOVEMENT_MAX_MS = 800`, attack held 1500 ms, hurt
  700 ms, death 1200 ms.
- Existing absolute rig keys (`cut_y`, `hip_y`, `knee_y`, `overlap_top` in source pixels) keep working and win over
  calibration, so `strip-rigs/spearman.json` builds byte-identical output before and after.
- Tests: `./scripts/dev.sh test tests/scripts/sprite-strips-tool.test.ts`. Commits end with the attribution line from the
  session. Push with `./scripts/sync-main.sh` then `./scripts/push-branch.sh`; the work stays on draft PR #1624 (prototype,
  not for merge).

## Review Focus

1. A source on a solid non-magenta background (white, grey) is read as one giant figure: `probe` must say "background is
   neither transparent nor flat magenta" instead of a confusing count error. Test in Task 1.
2. A grid whose rows are uneven (a slumped damage tier sits lower) must still read in reading order, or tier 3 and tier 4
   swap. Test in Task 1.
3. A weapon tip just above the knees (the archer's bow) adds a piece below some candidate cut heights: `calibrate` must
   choose a cut below the tip, not fail. Test in Task 2.
4. One damage tier that will not calibrate must not abort the build: that tier walks with the nearest tier that does, with
   a warning. Test in Task 2.
5. A strip that adds red the master does not have (flames, a red-brown horse in one image) must be flagged per image, not
   averaged away. Test in Task 1.

---

### Task 1: Tool tests, `probe`, source references ✅ done (cbec8792)

**Files:**
- Modify: `scripts/sprite-puppet/strips.py`
- Create: `tests/scripts/sprite-strips-tool.test.ts`

**Interfaces:**
- Produces: `Finding = dataclass(level: Literal['error','warn','info'], image: str, code: str, message: str)`;
  `probe(spec: dict, sources: Path) -> list[Finding]`; CLI `strips.py probe <spec> --sources <dir>` prints one line per
  finding and exits 1 when any `error`. Codes: `background`, `count`, `leftover`, `edge`, `small` (figure height < 300 px),
  `tint_leak`, `rig_cut` (filled in by Task 2).
- Produces: `load_source_figure(spec: dict, sources: Path, ref: str) -> np.ndarray` (uint8 RGBA crop of one figure); `ref` is
  a file name (`"a"`, a one-figure image) or `"<file>#<index>"` (figure `index` in reading order of the state that uses that
  file, e.g. `"d#2"` = damage tier 3).
- Test sandbox: copy `scripts/sprite-puppet/{strips.py,puppet.py,strip-prompts/}` into a temp root (both tools derive the
  repo root from their own path, as in `tests/scripts/codex-image-tool.test.ts`), make synthetic images with Pillow, skip the
  suite when `python3 -I -c "import PIL, numpy, scipy"` fails.

- [ ] **Step 1: Write the failing tests** (`describe('strips.py (#364 prototype)')`):
  - `probe reports a white background as code "background"`: a 1200x400 RGB white image with three dark rectangles,
    spec expects 3 cells → exit 1, stdout contains `background`.
  - `probe counts figures`: magenta image with 5 rectangles, spec expects 6 → `error count expected 6, found 5`.
  - `probe reports a leftover piece`: 6 figures plus a 4000 px detached blob → `error leftover`.
  - `reads an uneven 2x2 grid in reading order`: four figures, the bottom-left one 40 px lower than the bottom-right,
    each a different grey → `load_source_figure(spec, dir, 'd#2')` returns the bottom-left grey.
  - `flags a red leak in one image only`: master with a small red tunic (3% of figure), attack strip whose frames are 25% red
    → `warn tint_leak` naming the attack file and not the master.
- [ ] **Step 2: Run** `./scripts/dev.sh test tests/scripts/sprite-strips-tool.test.ts` → FAIL (`invalid choice: 'probe'`).
- [ ] **Step 3: Implement `probe` and `load_source_figure`.** Background rule: transparent when more than 20% of pixels have
  alpha < 250 (as today); else magenta when the border pixels are more than 90% `field_mask`; else `error background`.
  Tint leak: per image, tinted fraction of figure pixels (`puppet.tint_membership > 0.5`); warn when an image's fraction is
  more than 1.5x the master's. Turn `load_figures`' `SystemExit`s into findings inside `probe` (keep them as exits in
  `build`).
- [ ] **Step 4: Run** the test file → PASS. Also run `build` on the Spearman originals (if present in the scratchpad) and
  confirm `sheet.png` hash is unchanged.
- [ ] **Step 5: Commit** `art: strips.py probe and source references, with tool tests (#364)`.

### Task 2: Calibrated biped rig, per-tier walks ✅ done

Deviations found by running it on the real Spearman drawings (recorded in `STRIPS.md`): the cut is the highest row from
which the piece count stays right **all the way down** to the last 5% of the figure (a hem that briefly splits into the
right number of pieces would otherwise win); `knee` defaults to a quarter of the way from cut to feet (the hand-tuned
Spearman value is 0.255, not 0.45); `LegRig`'s pixel constants scale with figure height (tuned on 1216 px) so the Spearman
build stays byte-identical; a `hem` key narrows the search when a shield or cloak hangs below the hem (the Spearman needs
`[0.22, 0.30]`; unaided, calibrate cuts 93 px too high); all four Spearman damage tiers fail to cut because the spear touches
a boot, so those tiers walk like the master until the prompt change in `set.md` is tried.

**Files:**
- Modify: `scripts/sprite-puppet/strips.py` (`LegRig`, `rig_frames`, `build`, new `calibrate`)
- Modify: `scripts/sprite-puppet/strip-rigs/spearman.json` (add `family`, keep absolute keys)
- Test: `tests/scripts/sprite-strips-tool.test.ts`

**Interfaces:**
- Consumes: `load_source_figure` (Task 1).
- Produces: `calibrate(rgba: np.ndarray, rig: dict) -> dict` returning absolute `cut_y, overlap_top, hip_y, knee_y` for that
  drawing. Relative keys (fractions of figure height measured up from the lowest opaque row): `hem` = search band
  `[0.22, 0.40]` by default, `knee` default `0.45` of the leg length below the cut, `overlap` default `0.02`, `hip` default
  `+0.01`. `shafts` (0 or 1, default 1) = straight pieces that stay with the body. The cut is the highest row in the band
  where the pieces below it number exactly `2 + shafts` and stay that number for at least 2% of the figure height
  below it. Absolute keys present in `rig` are returned unchanged.
- Produces: rig `sources: list[str]` (default `[rig.source]`). `build` emits one row per source: `<state>` for the first,
  `<state>@1`, `<state>@2`, `<state>@3` for the rest; the manifest gains `"tiers": {"walk": ["walk", "walk@1", ...]}`.
- Produces: CLI `strips.py calibrate <spec> --sources <dir>` writing `.verification/strips/<id>/rig.json` and a review image
  with the cut, hip and knee lines drawn on every source.

- [ ] **Step 1: Write the failing tests:**
  - `calibrate finds the hem on a synthetic biped`: body rectangle, two leg rectangles of different colours with a 30 px
    gap, one 6 px shaft → returned `cut_y` within 3 px of the body's bottom edge.
  - `calibrate cuts below a bow tip`: same figure, no shaft, a 20x40 px "bow tip" hanging 30 px below the hem, `shafts: 0`
    → `cut_y` is below the tip's bottom.
  - `calibrate fails clearly when the legs touch`: legs joined by a bar → exit 1, message contains
    `expected 2 legs below the hem` and `redraw the master` (the playbook's fix).
  - `the walk alternates legs`: rig 8 frames from the synthetic biped; leg colours identify the legs; the forward-most foot
    colour in frame 2 differs from frame 6.
  - `a tier that will not calibrate walks with its neighbour`: sources `["a", "d#1"]` where `d#1` has touching legs →
    build exits 0, prints `warn rig_cut`, and rows `walk` and `walk@1` are identical.
  - `absolute keys win`: spearman-style absolute keys skip calibration (`calibrate` returns them unchanged).
- [ ] **Step 2: Run** the test file → the new tests FAIL.
- [ ] **Step 3: Implement** `calibrate`, `shafts`, `sources`, tier rows and the `rig_cut` probe finding (probe runs
  `calibrate` on every rig source).
- [ ] **Step 4: Run** the test file → PASS. With the Spearman originals: run `calibrate` with the absolute keys removed and
  record in the Spearman README how far the found values are from the hand-tuned ones (880 / 968 / 890 / 856).
- [ ] **Step 5: Commit** `art: calibrated biped rig and a walk per damage tier (#364)`.

### Task 3: `prompt` command

**Files:**
- Modify: `scripts/sprite-puppet/strips.py`; `scripts/sprite-puppet/strip-rigs/spearman.json` (add its `prompt` block, the
  values from `design/png-sprites/previews/spearman/prompt.txt`)
- Test: `tests/scripts/sprite-strips-tool.test.ts`

**Interfaces:**
- Produces: `build_prompts(spec: dict, template_dir: Path) -> tuple[str, str]` (conversation A, conversation B). Templates
  are the "## Prompt" section of `master.md` / `set.md`; the family's `### <key>` subsections fill `{{pose}}`, `{{check}}`,
  `{{not_red}}`, `{{images}}`; spec `prompt` keys fill the rest; optional keys (`extra_images`) default to empty.
- Produces: CLI `strips.py prompt <spec>` printing both and writing `.verification/strips/<id>/prompt-a.txt`, `prompt-b.txt`.

- [ ] **Step 1: Write the failing tests:** `fills every placeholder` (a biped spec → neither prompt contains `{{`, A contains
  the biped pose line "two separate shapes", B contains "DAMAGE (4 frames"); `names a missing key` (no `team_area` →
  exit 1, message `prompt.team_area`); `rejects an unknown family` (`family: "boat"` → exit 1 listing the families).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `art: strips.py prompt builds both ChatGPT prompts from the spec (#364)`.

### Task 4: Shared preview viewer

**Files:**
- Create: `design/png-sprites/previews/viewer.html` (from `spearman/index.html`)
- Modify: `design/png-sprites/previews/spearman/index.html` (becomes a redirect to `../viewer.html?unit=spearman`)

**Interfaces:**
- Consumes: `<id>/manifest.js` (`window.STRIP_MANIFEST`, now with `tiers` and an optional `family`).
- Decisions: the unit comes from `?unit=` (letters, digits, `_`, `-` only; anything else shows an error line). State buttons
  are built from the manifest rows; the move buttons ("1 hex", "4 hexes", loop) play the row in `tiers.walk` (or `tiers.move`
  for vehicles) that matches the health slider's tier; one-shot rows (`loop: false`) play once and hold their last frame.

- [ ] **Step 1:** Build the viewer; keep the Spearman page's speed control, faction swatches, size check and tier panel.
- [ ] **Step 2: Verify** with `./scripts/dev-server.sh start` and the browser preview's `url` form: `?unit=spearman` shows
  every Spearman state with no console errors; the slider at 30% health switches the walk to `walk@2`; `?unit=../x` shows
  the error line. `./scripts/dev-server.sh stop`.
- [ ] **Step 3: Commit** `art: one preview viewer for every strip unit (#364)`.

### Task 5: Archer (biped proof)

**Files:**
- Create: `scripts/sprite-puppet/strip-rigs/archer.json`, `design/png-sprites/previews/archer/{sheet.png,mask.png,manifest.json,manifest.js,provenance.json}`
- Modify: `scripts/sprite-puppet/STRIPS.md` (results table row)

Spec `prompt` block (exact values):
- `name`: `Archer`
- `look`: `An ancient-to-medieval archer: a lean young man with a short dark beard, a brown leather hood, a knee-length tunic with a brown leather belt, bare forearms with a leather bracer on the left forearm, brown leather boots to mid-calf, a quiver of arrows on his back and a plain wooden longbow.`
- `team_area`: `his tunic`
- `identity`: `the same face and beard, hood, red tunic, belt, bracer, boots, quiver and bow`
- `weapon_pose`: `He holds the bow upright in his left hand in front of his body, its lower tip ending above his knees; his right hand hangs at his side. No arrow is nocked.`
- `attack_frames`: `6`; `attack`: `(1) ready, bow held low; (2) he draws an arrow from the quiver; (3) he nocks it and raises the bow, aiming right; (4) full draw, the string pulled back to his cheek, the arrow pointing right; (5) release: the string has snapped forward and the arrow is gone (do not draw it in flight), his drawing hand flies back; (6) recover, lowering the bow.`
- `damage_gear`: `a cracked bow and a few broken arrows in the quiver`; `damage_gear_critical`: `a split bow limb bound with cord and an almost empty quiver`; `defeat_prop`: `leaning on the bow planted on the ground`
- Rig: `{"kind": "biped", "shafts": 0, "sources": ["a", "b#0", "b#1", "b#2", "b#3"], "stride_deg": 28, "knee_bend": 30}`
  with the damage image as `b`; attack `c` (`matchSteelTo` not available, the archer has little steel: use `restFrames: [0, 5]`),
  hit `d` (`restFrames: [0, 4]`), defeat `e` (`restFrames: [0]`).

- [ ] **Step 1:** `strips.py prompt strip-rigs/archer.json`; give the owner `prompt-a.txt`.
- [ ] **Step 2 (owner):** conversation A until the master is approved; save `a.png` to `~/Downloads`.
  Gate: probe on `a` alone has no `rig_cut` error. If it has one, apply the playbook row "The rig cannot cut the master"
  (a redraw quoting the pose rules) before conversation B; never start B on a master that does not calibrate.
- [ ] **Step 3 (owner):** conversation B with `prompt-b.txt` and `a.png` attached; save `b.png` to `e.png`.
- [ ] **Step 4:** scan every image; copy them to a fresh folder; `probe`; fix every `error` with the playbook (regenerate the
  named image in conversation B, at most three times; then a fresh conversation B for that image only).
- [ ] **Step 5:** `build`; open the viewer; the owner reviews idle, walk (all four tiers), attack, hurt, death at game speed
  and quarter speed, six colours, the size check. Adjust only the rig keys the owner's notes point at.
- [ ] **Step 6: Record** in `provenance.json` (hashes, prompts that actually ran, regenerations per image) and add the
  results row to STRIPS.md: conversations, regenerations, rig keys changed from defaults, probe errors met, KB, minutes, the
  owner's verdict.
- [ ] **Step 7: Commit** `art: Archer strips through the generalised pipeline (#364)`; push.

### Task 6: Four-leg rig

**Files:**
- Modify: `scripts/sprite-puppet/strips.py` (new `QuadRig`, shared two-bone leg code with `LegRig`)
- Test: `tests/scripts/sprite-strips-tool.test.ts`

**Interfaces:**
- Consumes: `calibrate` with `legs: 4` (pieces below the cut = 4 + `shafts`, default `shafts: 0`; the cut sits at the
  belly line, band `[0.30, 0.50]`).
- Produces: `QuadRig(rgba, rig)` with `.frame(i, n) -> Image`; rig `kind: "mounted"`. Legs left to right are
  hind-far, hind-near, fore-far, fore-near (the animal faces right); draw order far legs first; walk phases
  `{hind_far: 0.0, hind_near: 0.5, fore_far: 0.75, fore_near: 0.25}` (the lateral-sequence walk `puppet.MountedRig` uses).
  Keys `stride_deg` (default 16), `lift`, `knee_bend` (default 25), `bob`. Each leg is two bones joined at `knee` (default
  `0.5` of the leg length).

- [ ] **Step 1: Write the failing tests:** `four legs, one gait`: a synthetic body over four coloured posts → 8 frames;
  in every frame at least two hooves touch the ground line (within 2 px); each leg's forward-most frame matches its phase
  (hind-far at frame 0's opposite, and so on); `three posts fail`: exit 1 naming `expected 4 legs`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** by extracting the thigh/shin construction from `LegRig` into a helper
  both rigs use. **Step 4: Run** → PASS (and the biped tests still pass).
- [ ] **Step 5: Commit** `art: four-leg rig for mounted units (#364)`.

### Task 7: Horseman (mounted proof)

**Files:** as Task 5 with `horseman`.

Spec `prompt` block:
- `name`: `Horseman`
- `look`: `A classical light cavalryman on a dapple-grey horse with a dark grey mane and tail and white socks. The rider has a short brown beard, a bronze open-faced helmet, a short-sleeved tunic and brown leather boots, and carries a long javelin. The horse wears a saddle cloth under a brown leather saddle and a brown bridle.`
- `team_area`: `the rider's tunic and the saddle cloth`
- `coat`: `The horse is dapple-grey with a dark grey mane and tail: no chestnut, bay or orange-brown anywhere on it.`
- `identity`: `the same rider, helmet, beard, red tunic and javelin, and the same dapple-grey horse, saddle, red saddle cloth and bridle`
- `weapon_pose`: `He holds the javelin upright in his right hand, its butt end above the horse's belly.`
- `attack_frames`: `6`; `attack`: `(1) ready, javelin upright; (2) he raises the javelin to his shoulder, pointing right; (3) wind-up: arm drawn far back, body twisting; (4) the thrust: arm and javelin driving forward and down to the right; (5) full extension, the javelin still in his hand; (6) recover to ready.`
- `damage_gear`: `a dented helmet`; `damage_gear_critical`: `a broken javelin shaft and a torn bridle`
- Rig: `{"kind": "mounted", "sources": ["a", "b#0", "b#1", "b#2", "b#3"]}`; hit and defeat use the mounted image list
  (4 frames each).

- [ ] **Steps 1-7** as Task 5. Extra check in Step 5: compare side by side with the current puppet horseman
  (`design/png-sprites/sources/horseman.png` rigged by `puppet.py`); the owner says which is better and why, recorded in
  the results row. Most likely failure: the master's legs overlap (horses are usually drawn mid-stride); the gate in Step 2
  catches it.

### Task 8: Vehicle rig

**Files:**
- Modify: `scripts/sprite-puppet/strips.py` (new `VehicleRig`)
- Test: `tests/scripts/sprite-strips-tool.test.ts`

**Interfaces:**
- Produces: `VehicleRig(rgba, rig)` with `.frame(state: Literal['idle','move','fire','hit'], i, n) -> Image`; rig
  `kind: "vehicle"`. Keys, all fractions of the figure box: `wheels: [[cx, cy, r], ...]` (each disc rotates
  `wheel_deg_per_frame`, default 45), `tread: {"depth": 0.06}` (figure pixels within `depth` of the outline, below
  `tread_top`, default the whole outline, get a light/dark stripe pattern that advances half a link per frame),
  `muzzle: [fx, fy]` (flash and smoke ported from `puppet.FirearmRig._flash`; default: the right-most opaque pixel in the
  figure's upper 80%, drawn on the calibrate review image so a wrong guess is visible), `bob` (default 0.01), `recoil` (default
  0.02 of the width), `shake` (hit, default 0.015). `build` emits `move`, `fire` and `hit` rows from code and, with
  `sources`, `move@1..3` from the damage tiers; the drawn wreck strip is the `death` row.

- [ ] **Step 1: Write the failing tests:** `wheels spin`: a synthetic hull over a disc with one coloured spoke → the spoke's
  angle advances by 45 degrees per frame; `tread scrolls`: a band's stripe phase moves by half a period per frame while
  pixels outside the band only bob; `fire flashes once`: the flash pixels (hue 0.10-0.17) appear only in frames 2-4 of 8
  and none fall in the tint key's hue range.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `art: vehicle rig (wheels, tread, recoil, flash) (#364)`.

### Task 9: Tank (vehicle proof)

**Files:** as Task 5 with `tank`.

Spec `prompt` block:
- `name`: `Tank (First World War)`
- `look`: `A First World War rhomboid tank: a long low rhomboid hull with caterpillar tracks running all the way around its sides, riveted olive-drab armour plates, a short cannon in a side sponson pointing right, and a small commander hatch on top. A broad horizontal band is painted along the middle of the hull side.`
- `team_area`: `the broad band along the hull side`
- `running_gear`: `The caterpillar track wraps the whole hull outline as one clear dark-grey band of separate links, each link a distinct plate with a visible gap between links.`
- `running_gear_check`: `track drawn as a band of separate links`
- `identity`: `the same hull shape, plates, rivets, track, sponson gun, hatch and red band`
- `damage_gear`: `a few track links missing`; `damage_gear_critical`: `a bent gun barrel and a sagging broken track`
- Rig: `{"kind": "vehicle", "tread": {"depth": 0.06}, "sources": ["a", "b#0", "b#1", "b#2", "b#3"]}` (default muzzle; set
  `muzzle` only if the calibrate review image puts it off the sponson barrel);
  wreck `c` (3 frames, `restFrames: [0]`).

- [ ] **Steps 1-7** as Task 5. Extra check: compare with the current puppet tank. Most likely failures: flames in the wreck
  strip leak into the tint key (probe `tint_leak`; fix by narrowing `min_sat` for this unit or asking for yellow flames), and
  the track drawn as one smooth belt (no links to scroll; redraw quoting `running_gear`).

### Task 10: Results and decision

**Files:**
- Modify: `scripts/sprite-puppet/STRIPS.md` (results table complete, decision section), `design/png-sprites/previews/spearman/README.md` (link), PR #1624 body

- [ ] **Step 1:** Fill the decision from the three rows, by these thresholds: the pipeline is **proven** for a family when
  the owner approved every state, the master needed at most two redraws to calibrate, no more than two rig keys moved from
  their defaults, and no image needed more than three regenerations. A family that misses goes back to the playbook once,
  then is marked "puppet rig only" (one master, today's `puppet.py`).
- [ ] **Step 2:** Write the aircraft adaptation as the next proof (biplane: a `FlightRig` with bob, bank roll, propeller blur
  from `puppet.FirearmRig._prop_blur`, gun flash; drawn going-down strip), and the naval one (rock and sway, bow wave), each
  as a short task list, only for families still wanted.
- [ ] **Step 3:** If at least two families are proven, list the game-side PR from the Spearman README's gap table (non-square
  cells, extra state rows, play-once, tier rows, a death snapshot for all units) as the next step for the owner to approve.
- [ ] **Step 4: Commit** `art: unit strip pipeline proof results (#364)`; push; update the PR body.
