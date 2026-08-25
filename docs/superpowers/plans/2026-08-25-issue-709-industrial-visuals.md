# Issue 709 Industrial Vehicles Visual Batch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Armored Car, Mechanized Infantry, and Main Battle Tank aliases with readable, animated native-v2 sprites and review evidence that catches attachment defects before live registration.

**Architecture:** Author the canonical illustrations in `design/conquestoria-sprites/lib/units-v2.jsx`, serialize faction-specific output, then register generated modules in the native lookup. Dedicated `units.tsx` fallbacks retain the same role-defining markers for minor-civ rendering; CSS variants own vehicle/rifle recoil rather than generic melee weapon motion.

**Tech Stack:** TypeScript, JSX SVG runtime, generated SVG TypeScript modules, CSS animation, Vitest, Node review-capture scripts.

---

## File map

| File | Responsibility |
| --- | --- |
| `design/conquestoria-sprites/lib/units-v2.jsx` | Canonical 128×128 native-v2 art and semantic animation hooks. |
| `src/renderer/sprites/units.tsx` | Dedicated palette-driven live fallbacks with equivalent role markers. |
| `src/renderer/sprites/sprite-catalog.ts` | Replace the three donor catalog functions. |
| `scripts/serialize-sprites.mjs` | Serialize the three source components and embed their review-preview payload. |
| `src/renderer/sprites/v2/{armored_car,mechanized_infantry,main_battle_tank}.svg.ts` | Generated six-faction native payloads; never hand-edit. |
| `src/renderer/sprites/v2/index.ts` | Native lookup imports and registrations. |
| `src/assets/sprite-animations-v2.css` | Variant-only wheel, body, carrier, turret, cannon, and rifle state motion. |
| `docs/reviews/assets/issue-709/sprite-preview.html` | File-safe all-faction/state/reduced-motion reviewer surface. |
| `scripts/capture-issue-709-sprite-review.mjs` | Generate 40/64/128 identity sheets and paused phase-sampled contact sheets. |
| `docs/reviews/issue-709-industrial-visual-review.md` | Human-review checklist and committed visual evidence. |

### Task 1: Lock the visual contract in failing tests

**Files:**
- Modify: `tests/renderer/sprites/v2/index.test.ts`
- Modify: `tests/renderer/sprites/sprite-catalog.test.ts`
- Modify: `tests/renderer/sprites/sprite-animations-v2-css.test.ts`
- Create: `tests/renderer/sprites/issue-709-sprite-preview.test.ts`

- [ ] **Step 1: Add the failing native-v2 contract.**

  Add `ISSUE_709_NATIVE` and `ISSUE_709_HOOKS` alongside the #708 describe block. Require each of the six faction results to be native, to carry `data-kind="melee"`, its exact `data-kind-variant`, and every hook in the approved design:

  ```ts
  const ISSUE_709_NATIVE = {
    armored_car: 'armored-car',
    mechanized_infantry: 'mechanized-infantry',
    main_battle_tank: 'main-battle-tank',
  } as const;
  const ISSUE_709_HOOKS = {
    armored_car: ['cq-armored-car-body', 'cq-wheel', 'cq-armored-car-turret', 'cq-armored-car-cannon', 'cq-weapon'],
    mechanized_infantry: ['cq-mech-soldier', 'cq-arm-l', 'cq-arm-r', 'cq-leg-l', 'cq-leg-r', 'cq-mech-carrier', 'cq-wheel', 'cq-weapon'],
    main_battle_tank: ['cq-mbt-body', 'cq-mbt-tracks', 'cq-mbt-turret', 'cq-mbt-cannon', 'cq-weapon'],
  } as const;
  ```

- [ ] **Step 2: Add catalog non-alias and fallback-parity failures.**

  In `sprite-catalog.test.ts`, render every target and its old donor with `derivePalette('#4a90d9')`; assert unequal markup. Assert Armored Car differs from `TankSprite`, Mechanized Infantry differs from `InfantrySprite`, MBT differs from `TankSprite`, and each target contains the approved role marker. Keep existing #769 Anti-Tank Gun assertions unchanged.

- [ ] **Step 3: Add failing CSS variant tests.**

  Require all three selectors to declare their own state-scoped animation:

  ```ts
  '.cq-v2[data-kind="melee"][data-kind-variant="armored-car"][data-state="attack"] .cq-armored-car-turret'
  '.cq-v2[data-kind="melee"][data-kind-variant="mechanized-infantry"][data-state="attack"] .cq-weapon'
  '.cq-v2[data-kind="melee"][data-kind-variant="main-battle-tank"][data-state="attack"] .cq-mbt-turret'
  ```

  Also assert the variant selectors cancel generic `.cq-weapon` swing before applying their recoil, and that every new animated class occurs in the existing reduced-motion pause selector.

- [ ] **Step 4: Add a failing file-safe review test.**

  Model it on `issue-708-sprite-preview.test.ts`, but require the three Issue-709 IDs, all six factions, five state buttons, reduced motion, an embedded `globalThis.__ISSUE_709_SPRITES__` payload, no `import`, no module script, identity-sheet links, and paused phase labels `0%`, `25%`, `50%`, `75%`.

- [ ] **Step 5: Run the tests and confirm the expected failures.**

  Run:

  ```bash
  bash scripts/run-with-mise.sh yarn test --run tests/renderer/sprites/v2/index.test.ts tests/renderer/sprites/sprite-catalog.test.ts tests/renderer/sprites/sprite-animations-v2-css.test.ts tests/renderer/sprites/issue-709-sprite-preview.test.ts
  ```

  Expected: failures state the three units are not native and the Issue-709 preview file is absent.

- [ ] **Step 6: Commit the red tests.**

  ```bash
  git add tests/renderer/sprites/v2/index.test.ts tests/renderer/sprites/sprite-catalog.test.ts tests/renderer/sprites/sprite-animations-v2-css.test.ts tests/renderer/sprites/issue-709-sprite-preview.test.ts
  git commit -m "test(709): specify industrial vehicle sprite contract"
  ```

### Task 2: Author readable fallback and native-v2 silhouettes

**Files:**
- Modify: `src/renderer/sprites/units.tsx`
- Modify: `design/conquestoria-sprites/lib/units-v2.jsx`
- Modify: `src/renderer/sprites/sprite-catalog.ts`

- [ ] **Step 1: Add palette-driven catalog fallbacks.**

  Export `ArmoredCarSprite`, `MechanizedInfantrySprite`, and `MainBattleTankSprite` with the normal `UnitSpriteProps` signature. Each uses `SpriteFrame`, `Shadow`, `HexBase`, `Banner`, palette-only faction surfaces, and the target’s native hook names. Build the car from four wheel groups, a compact sloped hull, small turret/cannon, and periscope; build Mechanized Infantry from a readable rifle soldier in front of a simplified armored carrier; build MBT from broad tracks, low hull, turret, and long cannon. Do not reuse donor component output.

- [ ] **Step 2: Replace only the three catalog aliases.**

  Change the existing entries to:

  ```ts
  armored_car: withMotion('armored_car', ArmoredCarSprite),
  mechanized_infantry: withMotion('mechanized_infantry', MechanizedInfantrySprite),
  main_battle_tank: withMotion('main_battle_tank', MainBattleTankSprite),
  ```

  Preserve `anti_tank_gun: withMotion('anti_tank_gun', AntiTankGunSprite)` exactly.

- [ ] **Step 3: Add the canonical native-v2 components.**

  In `units-v2.jsx`, create `ArmoredCarV2Sprite`, `MechanizedInfantryV2Sprite`, and `MainBattleTankV2Sprite`. Each calls `SpriteFrameV2` with `kind="melee"`, the exact approved variant, and `phase={phase}`. Use one outer body group and nested movable subgroups; never animate the positioned parent that establishes wheel, weapon, soldier, or turret attachment.

  Use this structure for every rigid weapon:

  ```jsx
  <g className="cq-mbt-turret">
    <path /* turret */ />
    <g className="cq-weapon cq-mbt-cannon">
      <rect /* cannon remains a child of turret */ />
    </g>
  </g>
  ```

  Mechanized Infantry’s rifle stays under both hand/arm groups; the carrier is a separate background mass. At 40px no individual carrier interior detail is required.

- [ ] **Step 4: Run the three contract suites.**

  Run the Task-1 command. Expected: native and catalog tests pass; CSS and preview tests still fail until Tasks 4–5.

- [ ] **Step 5: Commit authored silhouette work.**

  ```bash
  git add src/renderer/sprites/units.tsx src/renderer/sprites/sprite-catalog.ts design/conquestoria-sprites/lib/units-v2.jsx
  git commit -m "art(709): author industrial vehicle silhouettes"
  ```

### Task 3: Serialize and register the reviewed native path

**Files:**
- Modify: `scripts/serialize-sprites.mjs`
- Create: `src/renderer/sprites/v2/armored_car.svg.ts`
- Create: `src/renderer/sprites/v2/mechanized_infantry.svg.ts`
- Create: `src/renderer/sprites/v2/main_battle_tank.svg.ts`
- Modify: `src/renderer/sprites/v2/index.ts`

- [ ] **Step 1: Add the serializer unit pairs.**

  Add these exact entries to `UNIT_SPRITES` in `serialize-sprites.mjs`:

  ```js
  ['armored_car', 'ArmoredCarV2Sprite'],
  ['mechanized_infantry', 'MechanizedInfantryV2Sprite'],
  ['main_battle_tank', 'MainBattleTankV2Sprite'],
  ```

  Add a dedicated `writeIssue709PreviewData` parallel to the existing Issue-708 writer. It must replace only `<!-- ISSUE_709_SPRITES_START -->` through `<!-- ISSUE_709_SPRITES_END -->` in the Issue-709 preview and JSON-escape `<` before embedding.

- [ ] **Step 2: Register generated modules.**

  Import the three generated `svg` records in `v2/index.ts` and add each to `UNIT_SPRITES` under its stable unit ID. Do not change live fallback behavior for other types or any faction key resolution.

- [ ] **Step 3: Generate artifacts.**

  Run:

  ```bash
  bash scripts/run-with-mise.sh yarn node scripts/serialize-sprites.mjs
  ```

  Expected: three new auto-generated modules contain all six faction keys; the Issue-709 preview payload is replaced between its markers.

- [ ] **Step 4: Run native and catalog tests.**

  Run the Task-1 command. Expected: all native lookup, six-faction hook, and non-alias tests pass; only CSS/review assertions may remain.

- [ ] **Step 5: Commit generated and lookup artifacts.**

  ```bash
  git add scripts/serialize-sprites.mjs src/renderer/sprites/v2/armored_car.svg.ts src/renderer/sprites/v2/mechanized_infantry.svg.ts src/renderer/sprites/v2/main_battle_tank.svg.ts src/renderer/sprites/v2/index.ts
  git commit -m "feat(709): register native industrial vehicle sprites"
  ```

### Task 4: Implement physically attached variant motion

**Files:**
- Modify: `src/assets/sprite-animations-v2.css`
- Modify: `tests/renderer/sprites/sprite-animations-v2-css.test.ts`

- [ ] **Step 1: Define variant keyframes and selectors.**

  Add state-scoped rules after existing body-plan rules. Armored Car rotates `.cq-wheel`, settles `.cq-armored-car-body`, and recoils `.cq-armored-car-turret`; Mechanized Infantry uses the normal leg cadence plus a rifle recoil selector scoped to `mechanized-infantry`; MBT animates the nested turret/cannon and a restrained body response. Each variant disables the generic melee `.cq-weapon` swing before its own recoil selector.

- [ ] **Step 2: Keep contact stable.**

  Every rule transforms a nested joint only. The wheel parent stays positioned under the hull, rifle stays under hands, cannon stays under turret, and banner stays under its mast/root group. Use `transform-box: fill-box` and a declared local `transform-origin`; do not animate a `translate(...)` placement wrapper.

- [ ] **Step 3: Extend the reduced-motion pause list.**

  Include every new animated class in the existing `@media (prefers-reduced-motion: reduce)` pause selector, then ensure the ambient-class test still finds a real animation rule for every used class.

- [ ] **Step 4: Run CSS and native tests.**

  Run the Task-1 command. Expected: all source-level tests pass except preview evidence tests.

- [ ] **Step 5: Commit motion.**

  ```bash
  git add src/assets/sprite-animations-v2.css tests/renderer/sprites/sprite-animations-v2-css.test.ts
  git commit -m "feat(709): animate industrial vehicle body plans"
  ```

### Task 5: Build phase-sampled review evidence and complete the visual gate

**Files:**
- Create: `docs/reviews/assets/issue-709/sprite-preview.html`
- Create: `scripts/capture-issue-709-sprite-review.mjs`
- Create: `docs/reviews/issue-709-industrial-visual-review.md`
- Create: `docs/reviews/assets/issue-709/{armored-car,mechanized-infantry,main-battle-tank}-identity-sheet.png`
- Create: `docs/reviews/assets/issue-709/{armored-car,mechanized-infantry,main-battle-tank}-contact-sheet.png`
- Modify: `tests/renderer/sprites/issue-709-sprite-preview.test.ts`

- [ ] **Step 1: Create the file-safe preview.**

  Base it on the committed Issue-708 preview, replacing only the unit metadata and marker names. Embed serialized data between `ISSUE_709_SPRITES_START` and `ISSUE_709_SPRITES_END`; load only the local animation stylesheet; expose all six factions, five states, reduced motion, and a paused phase control with 0/25/50/75 percent options.

- [ ] **Step 2: Create reproducible identity and contact capture.**

  Adapt the #708 capture script. Identity sheets render 40/64/128px zero-phase `idle`, `walk`, `attack`, `hurt`, and `death`. Contact sheets render paused `walk` and `attack` at 0%, 25%, 50%, and 75%; they use the preview’s committed serialized payload and stylesheet, not copied SVG artwork. The script fails when any expected unit/faction/state payload is absent.

- [ ] **Step 3: Generate review images.**

  Run:

  ```bash
  bash scripts/run-with-mise.sh yarn node scripts/capture-issue-709-sprite-review.mjs
  ```

  Expected: six committed PNGs, two per target, with explicit unit, size, state, and phase labels.

- [ ] **Step 4: Write the review Markdown.**

  Link all six images. Record the target-specific identity checks, the 40px readability check, all phase attachment checks, palette/banner checks, reduced-motion review, and the file-safe interactive timing review. State that this is visual-only and does not claim gameplay or SFX changes.

- [ ] **Step 5: Complete the human visual gate.**

  Open `docs/reviews/assets/issue-709/sprite-preview.html` through Vite and directly as `file://`. Review all three identities at 40px, every captured phase, all factions, and reduced motion. If any wheel/track, rifle/hand, turret/cannon, or banner detaches, return to Task 2 or 4 before live registration/push.

- [ ] **Step 6: Run focused proof.**

  Run:

  ```bash
  bash scripts/run-with-mise.sh yarn test --run tests/renderer/sprites/v2/index.test.ts tests/renderer/sprites/sprite-catalog.test.ts tests/renderer/sprites/sprite-animations-v2-css.test.ts tests/renderer/sprites/issue-709-sprite-preview.test.ts tests/renderer/sprite-overlay.test.ts tests/renderer/render-loop-combat-sprite-state.test.ts
  ```

  Expected: all focused tests pass.

- [ ] **Step 7: Commit review evidence.**

  ```bash
  git add docs/reviews/assets/issue-709 docs/reviews/issue-709-industrial-visual-review.md scripts/capture-issue-709-sprite-review.mjs tests/renderer/sprites/issue-709-sprite-preview.test.ts
  git commit -m "docs(709): record industrial vehicle sprite review"
  ```

### Task 6: Verify and prepare the focused PR

**Files:**
- Modify: `docs/superpowers/plans/2026-08-25-issue-709-industrial-visuals.md`

- [ ] **Step 1: Run source-rule validation.**

  ```bash
  scripts/check-src-rule-violations.sh src/renderer/sprites/units.tsx src/renderer/sprites/sprite-catalog.ts src/renderer/sprites/v2/index.ts src/assets/sprite-animations-v2.css
  ```

- [ ] **Step 2: Run final verification separately.**

  ```bash
  git diff --check
  bash scripts/run-with-mise.sh yarn build
  bash scripts/run-with-mise.sh yarn test:durable
  bash scripts/run-with-mise.sh yarn test:durable:status
  ```

- [ ] **Step 3: Inspect the exact delivery delta.**

  ```bash
  git diff --stat origin/main...HEAD
  git diff --stat
  git diff origin/main...HEAD -- design/conquestoria-sprites/lib/units-v2.jsx src/renderer/sprites/units.tsx src/renderer/sprites/sprite-catalog.ts src/renderer/sprites/v2/index.ts src/assets/sprite-animations-v2.css scripts/serialize-sprites.mjs
  ```

- [ ] **Step 4: Sync plan status in the delivery PR.**

  Once the PR number exists and all six tasks are complete, mark Tasks 1–6 complete and add `✅ merged (#PR)` to this plan in the final documentation commit on that same PR, so the merged branch records the completed phase rather than leaving a stale unchecked plan.
