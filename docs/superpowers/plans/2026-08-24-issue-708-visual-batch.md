# Issue 708 Visual Batch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace issue 708's three remaining temporary mounted-and-beast sprite aliases with accessible native v2 art and an embedded remote review board.

**Architecture:** Author source components in the tracked v2 design library, register them in the serializer, regenerate the per-faction static modules, and route them through `UNIT_SPRITES`. Keep the low-zoom catalog functions distinct from their former donors. Commit reproducible SVG review sheets with the implementation and embed them in the Markdown board.

**Tech Stack:** JSX/SVG, TypeScript, CSS animation hooks, Vitest, existing sprite serializer.

---

## Scope and inline review conclusions

| Dimension | Finding / required outcome |
| --- | --- |
| Balance, fun, mechanics, ages, play styles, difficulty, AI | Art-only change: preserve every definition, cost, formula, legality, AI candidate, and difficulty field byte-for-byte. Distinct silhouettes improve readable tactical choice for all players without changing play. |
| UI/UX and hot seat | The map overlay already filters viewer-visible units before sprite resolution. Add no panel/action/state path; prove native art preserves selection, health, fog and reduced-motion renderer contracts. |
| Architecture/extensibility/data/saves | Use the existing authored-source → serializer → generated-v2-module pipeline. No new state, events, data IDs, migration, persistence, or audio registration. |
| SFX | No source or event change. The review board explicitly labels this batch silent. |
| Visual system | Preserve the 128×128 wrapper, palette-derived identity, ink outlines, mobile legibility, native `data-kind` semantics, state hooks, phase desynchronization, and reduced-motion suppression. |

### Task 1: Lock the exact visual-only contract with failing regressions

**Files:**
- Modify: `tests/renderer/sprites/v2/index.test.ts`
- Modify: `tests/renderer/sprites/sprite-catalog.test.ts`
- Modify: `tests/renderer/sprite-overlay.test.ts`
- Test: `tests/renderer/sprites/v2/index.test.ts`
- Test: `tests/renderer/sprites/sprite-catalog.test.ts`

- [ ] **Step 1: Add native-v2 expectations before implementation.**

  Add `beast_handler`, `war_elephant`, and `cuirassier` to a dedicated `ISSUE_708_NATIVE` table. For every listed ID assert `isV2NativeUnit(id) === true`, all six faction results contain `.cq-sprite-wrap`, `.cq-v2`, and the documented `data-kind`; assert `beast_handler` and `war_elephant` carry a supported hound body-plan variant, while Cuirassier carries `data-kind="melee"`, a `.cq-weapon`, and `.cq-hit-spark`.

  In `sprite-catalog.test.ts`, render the three catalog entries with `derivePalette('#4a90d9')` and assert each is not byte-identical to its former donor (`WarHoundSprite` for handler and elephant; `KnightSprite` for cuirassier). Add a negative assertion that `chariot` remains distinct from its already-shipped donor without modifying Chariot source.

  In `sprite-overlay.test.ts`, sync each subtype with `selected: true`, a nonzero damage tier, and `reducedMotion: true`. Assert the final native `data-kind` is preserved while the selected and health decorations remain visible. The existing fallback path omits `data-kind`, making this a player-visible RED regression before the native entries exist.

- [ ] **Step 2: Run the focused tests and confirm RED.**

  Run: `bash scripts/run-with-mise.sh yarn test --run tests/renderer/sprites/v2/index.test.ts tests/renderer/sprites/sprite-catalog.test.ts tests/renderer/sprite-overlay.test.ts`

  Expected: failures identify all three IDs as non-native and/or still equal to their donors, and the overlay checks show the absent native `data-kind`; unrelated tests remain green.

- [ ] **Step 3: Commit the red tests.**

  Run: `git add tests/renderer/sprites/v2/index.test.ts tests/renderer/sprites/sprite-catalog.test.ts tests/renderer/sprite-overlay.test.ts && git commit -m "test(708): cover mounted and beast native sprites"`

### Task 2: Author source art and replace the low-zoom aliases

**Files:**
- Modify: `design/conquestoria-sprites/lib/units-v2.jsx`
- Modify: `scripts/serialize-sprites.mjs`
- Modify: `src/renderer/sprites/units.tsx`
- Modify: `src/renderer/sprites/sprite-catalog.ts`
- Modify: `src/renderer/sprites/v2/index.ts`
- Test: `tests/renderer/sprites/sprite-catalog.test.ts`

- [ ] **Step 1: Add three source components to `units-v2.jsx`.**

  Implement `BeastHandlerV2Sprite`, `WarElephantV2Sprite`, and `CuirassierV2Sprite` using `SpriteFrameV2`, `_fa2(faction)`, `_P2`, a `cq-sprite-figure`, reactive `cq-shadow`, and wrapper-separated animated transforms. Use `kind="hound" variant="war"` for the two quadrupeds and `kind="melee"` for Cuirassier. Handler visual cues: upright handler, command staff, leash, and smaller trained hound. Elephant cues: larger body, tusks, howdah/rider, and four hound-compatible leg hooks. Cuirassier cues: horse, breastplate, high boots, faction sash, and a `cq-weapon` sabre with `cq-hit-spark`.

- [ ] **Step 2: Register and serialize the native sprites.**

  Insert these exact entries after the existing mounted entries in `UNIT_SPRITES`:

  ```js
  ['beast_handler', 'BeastHandlerV2Sprite'],
  ['war_elephant', 'WarElephantV2Sprite'],
  ['cuirassier', 'CuirassierV2Sprite'],
  ```

  Run: `bash scripts/run-with-mise.sh yarn node scripts/serialize-sprites.mjs`

  Expected: `src/renderer/sprites/v2/beast_handler.svg.ts`, `war_elephant.svg.ts`, and `cuirassier.svg.ts` contain non-empty records for all six factions.

  Import those generated records in `v2/index.ts` and add the same three IDs to `UNIT_SPRITES`; this changes `isV2NativeUnit()` and lets the existing overlay select the native path without any new renderer branch.

- [ ] **Step 3: Replace only the three low-zoom donors.**

  Add matching live-catalog functions to `units.tsx`, retaining `palette.*` for faction identity and the `withMotion` contract. Change only these three catalog lines to their own function names, delete their temporary-alias comments, and leave `chariot` and `cavalry` unchanged.

- [ ] **Step 4: Run GREEN and source-rule checks.**

  Run: `scripts/check-src-rule-violations.sh src/renderer/sprites/units.tsx src/renderer/sprites/sprite-catalog.ts src/renderer/sprites/v2/index.ts && bash scripts/run-with-mise.sh yarn test --run tests/renderer/sprites/v2/index.test.ts tests/renderer/sprites/sprite-catalog.test.ts`

  Expected: no source-rule violations; all focused tests pass.

- [ ] **Step 5: Commit implementation.**

  Run: `git add design/conquestoria-sprites/lib/units-v2.jsx scripts/serialize-sprites.mjs src/renderer/sprites/units.tsx src/renderer/sprites/sprite-catalog.ts src/renderer/sprites/v2/beast_handler.svg.ts src/renderer/sprites/v2/war_elephant.svg.ts src/renderer/sprites/v2/cuirassier.svg.ts src/renderer/sprites/v2/index.ts && git commit -m "feat(708): add mounted and beast native sprites"`

### Task 3: Create the remote visual review

**Files:**
- Create: `docs/reviews/assets/issue-708/mounted-beast-review.svg`
- Create: `docs/reviews/issue-708-mounted-beast-visual-review.md`

- [ ] **Step 1: Create the embedded visual board.**

  Generate `mounted-beast-review.svg` from the serialized final art: show handler, elephant, and cuirassier at map and mobile scales; normal and high-contrast palette samples; visible/selected/fog-obscured context labels; and reduced-motion static frames. In the Markdown board embed the SVG with a relative image link, name the three distinguishing silhouettes, record the visual-system checklist, and include the inline-review matrix above plus a plain-language note that gameplay, saves, AI, difficulty, and SFX are unchanged.

- [ ] **Step 2: Run renderer and sprite checks.**

  Run: `bash scripts/run-with-mise.sh yarn test --run tests/renderer/sprite-overlay.test.ts tests/renderer/render-loop-combat-sprite-state.test.ts tests/renderer/sprites/v2/index.test.ts tests/renderer/sprites/sprite-catalog.test.ts`

  Expected: PASS.

- [ ] **Step 3: Commit review artifacts.**

  Run: `git add docs/reviews/assets/issue-708/mounted-beast-review.svg docs/reviews/issue-708-mounted-beast-visual-review.md && git commit -m "docs(708): add mounted beast visual review"`

### Task 4: Verify and deliver the draft PR

**Files:**
- Modify: `docs/superpowers/plans/2026-07-24-issue-547-visual-and-audio-polish.md` only if that plan is present on the rebased base; annotate Task 44 as partial or merged truthfully.

- [ ] **Step 1: Inspect both committed and working-tree deltas.**

  Run: `git diff --check && git diff --stat origin/main...HEAD && git diff --stat && git diff origin/main...HEAD`

  Expected: source changes are only sprite-pipeline, tests, and review documentation; no systems, AI, saves, audio, or UI action changes.

- [ ] **Step 2: Run final verification.**

  Run separately: `bash scripts/run-with-mise.sh yarn build`; then `bash scripts/run-with-mise.sh yarn test:durable`; then `bash scripts/run-with-mise.sh yarn test:durable:status`.

  Expected: build and durable status pass for the current HEAD and working tree.

- [ ] **Step 3: Open the requested draft PR.**

  Title: `art(708): replace mounted and beast sprite aliases`

  Body: link issue #708; state that Chariot was already delivered by #769 and is intentionally untouched; link the embedded visual board; list `beast_handler`, `war_elephant`, and `cuirassier`; state that the PR is a safe visual-only partial of #547 Task 44, with audio and other visual batches out of scope; include test/build evidence.
