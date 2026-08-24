# Issue 708 Grounded-Mythic Sprite Replacement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the three placeholder-like issue-708 sprites with grounded-mythic native SVG art and a correct mounted/animal animation contract.

**Architecture:** The tracked JSX source remains authoritative. A new `animal` CSS body plan owns mounted and elephant motion; the existing `hound` plan remains the handler's controlled war-beast. The serializer creates the native output, and the Markdown review embeds actual serialized-state renders.

**Tech Stack:** JSX/SVG, CSS animations, existing serializer, Vitest, Markdown/SVG review assets.

---

### Task 1: Define the failing animation and art contract

**Files:**
- Modify: `tests/renderer/sprites/v2/index.test.ts`
- Modify: `tests/renderer/sprites/sprite-animations-v2-css.test.ts`
- Modify: `tests/renderer/render-loop-combat-sprite-state.test.ts`

- [ ] **Step 1: Write failing native-art tests.**

  In `index.test.ts`, require all six factions of `beast_handler` to contain `data-kind="hound"`, `cq-command-sigil`, and each `cq-leg-fl`, `cq-leg-fr`, `cq-leg-bl`, and `cq-leg-br`. Require `war_elephant` to contain `data-kind="animal"`, `data-kind-variant="elephant"`, the four leg hooks, `cq-elephant-trunk`, `cq-howdah`, and `cq-rune-standard`. Require `cuirassier` to contain `data-kind="animal"`, `data-kind-variant="mount"`, the four leg hooks, `cq-weapon`, `cq-hit-spark`, and `cq-moonsteel-inlay`.

- [ ] **Step 2: Write failing CSS contract tests.**

  In `sprite-animations-v2-css.test.ts`, assert CSS selectors and real animation declarations for animal idle, walk, attack, all four leg hooks, `mount`, `elephant`, and an animal-scoped weapon attack. Assert the command/trunk effects are visibly meaningful static layers or receive a state-gated animation; never permit a used inert animation class.

- [ ] **Step 3: Add combat-overlay coverage.**

  In `render-loop-combat-sprite-state.test.ts`, adapt the existing combat fixture so a `cuirassier` attacks a `war_elephant`. Assert `attack`/`hurt` state remains present alongside `data-kind="animal"` for both entities.

- [ ] **Step 4: Run RED.**

  Run: `bash scripts/run-with-mise.sh yarn test --run tests/renderer/sprites/v2/index.test.ts tests/renderer/sprites/sprite-animations-v2-css.test.ts tests/renderer/render-loop-combat-sprite-state.test.ts`

  Expected: failures only for absent final-art hooks and animal CSS contract.

- [ ] **Step 5: Commit.**

  Run: `git add tests/renderer/sprites/v2/index.test.ts tests/renderer/sprites/sprite-animations-v2-css.test.ts tests/renderer/render-loop-combat-sprite-state.test.ts && git commit -m "test(708): specify mythic mounted animation contract"`

### Task 2: Add the mounted animal body plan

**Files:**
- Modify: `design/conquestoria-sprites/lib/units-v2.jsx`
- Modify: `src/assets/sprite-animations-v2.css`
- Test: `tests/renderer/sprites/sprite-animations-v2-css.test.ts`

- [ ] **Step 1: Extend the source contract.**

  Add `animal` to the `SpriteFrameV2` documentation and use `mount`/`elephant` only as its variants. Do not change existing hound behavior.

- [ ] **Step 2: Implement CSS.**

  Add animal idle, walk, and attack selectors alongside hound rules. Reuse diagonal-pair leg semantics with animal-specific timing variables. `mount` gets a responsive gait and longer lunge; `elephant` gets a slower cadence, shallower leg arc, heavier bob, and shorter lunge. Add animal attack support for `.cq-weapon` with the same phase delay. Animated elements must not also carry an SVG `transform` attribute.

- [ ] **Step 3: Run the contract tests.**

  Run: `bash scripts/run-with-mise.sh yarn test --run tests/renderer/sprites/sprite-animations-v2-css.test.ts tests/renderer/sprites/v2/index.test.ts`

  Expected: CSS contract passes; native-art assertions remain red until Task 3.

- [ ] **Step 4: Commit.**

  Run: `git add design/conquestoria-sprites/lib/units-v2.jsx src/assets/sprite-animations-v2.css tests/renderer/sprites/sprite-animations-v2-css.test.ts && git commit -m "feat(708): add mounted animal animation plan"`

### Task 3: Replace the art and generated v2 modules

**Files:**
- Modify: `design/conquestoria-sprites/lib/units-v2.jsx`
- Modify: `scripts/serialize-sprites.mjs`
- Modify: `src/renderer/sprites/units.tsx`
- Modify: `src/renderer/sprites/sprite-catalog.ts`
- Modify: `src/renderer/sprites/v2/index.ts`
- Modify: `src/renderer/sprites/v2/beast_handler.svg.ts`
- Modify: `src/renderer/sprites/v2/war_elephant.svg.ts`
- Modify: `src/renderer/sprites/v2/cuirassier.svg.ts`

- [ ] **Step 1: Replace all three native source components.**

  Handler: readable humanoid, command staff, rune leash/sigil, and rune-collared hound. Elephant: anatomically readable trunk, tusks, plated head, four wrapper-separated legs, howdah/crew, and rune standard. Cuirassier: horse head/neck/mane, four wrapper-separated legs, armored rider/saddle, moonsteel inlay, and pivoted sabre. Keep colours to `_P2` materials and `_fa2(faction)` identity values.

- [ ] **Step 2: Replace corresponding low-zoom catalog silhouettes.**

  Update only the matching `units.tsx` functions and catalog mappings. Do not edit Chariot or Cavalry.

- [ ] **Step 3: Regenerate and register.**

  Run: `bash scripts/run-with-mise.sh yarn node scripts/serialize-sprites.mjs`

  Keep only intended generated unit artifacts if legacy auto-phase output changes. Verify v2 index imports/maps all three.

- [ ] **Step 4: Run GREEN and source checks.**

  Run: `scripts/check-src-rule-violations.sh src/renderer/sprites/units.tsx src/renderer/sprites/sprite-catalog.ts src/renderer/sprites/v2/index.ts && bash scripts/run-with-mise.sh yarn test --run tests/renderer/sprites/v2/index.test.ts tests/renderer/sprites/sprite-catalog.test.ts tests/renderer/sprites/sprite-animations-v2-css.test.ts tests/renderer/render-loop-combat-sprite-state.test.ts`

  Expected: every focused test and source check passes.

- [ ] **Step 5: Commit.**

  Run: `git add design/conquestoria-sprites/lib/units-v2.jsx scripts/serialize-sprites.mjs src/renderer/sprites/units.tsx src/renderer/sprites/sprite-catalog.ts src/renderer/sprites/v2/index.ts src/renderer/sprites/v2/beast_handler.svg.ts src/renderer/sprites/v2/war_elephant.svg.ts src/renderer/sprites/v2/cuirassier.svg.ts && git commit -m "art(708): replace mounted and beast sprite art"`

### Task 4: Replace the remote review with real asset state sheets

**Files:**
- Modify: `docs/reviews/assets/issue-708/mounted-beast-silhouettes.svg`
- Modify: `docs/reviews/issue-708-mounted-beast-visual-review.md`

- [ ] **Step 1: Generate state sheets from serialized source.**

  Commit visuals for idle, walk, attack, hurt, death, and reduced motion at 40px, 64px, and 128px; never substitute hand-drawn proxy silhouettes.

- [ ] **Step 2: Update the Markdown review.**

  Embed the images by relative path. For every unit name its silhouette cue, animation cue, palette contract, and reduced-motion static presentation. State that only visual/animation presentation changed.

- [ ] **Step 3: Run visual-path tests and commit.**

  Run: `bash scripts/run-with-mise.sh yarn test --run tests/renderer/sprite-overlay.test.ts tests/renderer/render-loop-combat-sprite-state.test.ts tests/renderer/sprites/v2/index.test.ts tests/renderer/sprites/sprite-catalog.test.ts`

  Then: `git add docs/reviews/assets/issue-708/mounted-beast-silhouettes.svg docs/reviews/issue-708-mounted-beast-visual-review.md && git commit -m "docs(708): review mythic mounted sprite states"`

### Task 5: Verify and update draft PR #878

**Files:**
- Modify: draft PR #878 description

- [ ] **Step 1: Inspect all diffs.**

  Run: `git diff --check && git diff --stat origin/main...HEAD && git diff --stat && git diff origin/main...HEAD`

  Expected: sprite source/output, CSS, tests, and review docs only.

- [ ] **Step 2: Verify.**

  Run separately: `bash scripts/run-with-mise.sh yarn build`, `bash scripts/run-with-mise.sh yarn test:durable`, then `bash scripts/run-with-mise.sh yarn test:durable:status`.

  Expected: build succeeds and durable status accepts current HEAD and worktree.

- [ ] **Step 3: Update the existing draft.**

  Replace the old review claim with the real-source state board, describe grounded-mythic art and the animal body-plan repair, identify Chariot/Cavalry as unchanged scope drift, and retain draft status until the new visual review passes.
