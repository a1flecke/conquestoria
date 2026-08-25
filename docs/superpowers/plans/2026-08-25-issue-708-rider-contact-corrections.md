# Issue 708 Rider Contact Corrections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct the floating Handler legs and Cuirassier rider/tail anatomy in draft PR #878 without changing any gameplay-facing behaviour.

**Architecture:** Keep `units-v2.jsx` as the single authored native-SVG source. Move Handler rotation into nested joint groups so source placement persists, use SVG painter order to occlude the far rider leg behind the horse, and redraw the near seat/leg/tail in source before regenerating the v2 modules and file-safe preview payload. CSS continues to own only time-based joint motion.

**Tech Stack:** JSX SVG source, serializer, CSS keyframes, Vitest, `rsvg-convert` review capture, Vite interactive preview.

---

## File map

| File | Responsibility |
| --- | --- |
| `design/conquestoria-sprites/lib/units-v2.jsx` | Authoritative Handler leg hierarchy and Cuirassier painter-order/anatomy. |
| `src/assets/sprite-animations-v2.css` | Animate Handler inner joints without replacing source placement. |
| `src/renderer/sprites/v2/beast_handler.svg.ts`, `cuirassier.svg.ts` | Regenerated native output; never hand edited. |
| `docs/reviews/assets/issue-708/sprite-preview.html` | Regenerated file-safe payload and reviewer-facing descriptions. |
| `tests/renderer/sprites/v2/index.test.ts` | Serialized source hierarchy and painter-order regression. |
| `tests/renderer/sprites/sprite-animations-v2-css.test.ts` | Inner-joint animation regression. |
| `tests/renderer/sprites/issue-708-sprite-preview.test.ts` | Review-surface wording and embedded-evidence regression. |
| `docs/reviews/assets/issue-708/*-state-sheet.png` | Refreshed committed 40/64/128 px anatomy evidence. |
| `docs/reviews/issue-708-mounted-beast-visual-review.md` | Corrected reviewer-facing anatomy claims. |

## Player truth table

| Before | Action | Immediate visible result |
| --- | --- | --- |
| Handler is idle | Select Walk or Attack | Both feet remain attached below the tunic while the inner joints swing. |
| Cuirassier is idle | Select any state | The rider reads as seated; one near leg is visible and the far leg stays behind the horse flank. |
| Any Cuirassier state | Select Walk or Attack | The hindquarter has a downward horse tail; no loop, lion tuft, or detached tail appears. |
| Any faction/state | Enable reduced motion | Anatomy and occlusion remain visible while motion stops. |

## Misleading-review risks

- A source hook alone does not prove a limb is correctly layered: the far rider leg must occur before the horse body in serialized SVG, while the near leg occurs after it.
- A CSS transform applied to an outer group can erase an authored SVG `translate`; tests must assert animation targets the nested joint, not the positioned leg container.
- Still sheets do not prove timing. The Vite preview must be manually replayed through Walk and Attack before calling the correction review-ready.

## Interaction replay checklist

- At Imperials/64 px, replay Idle → Walk → Attack → Idle for Handler and confirm foot-to-tunic continuity.
- At Imperials/64 px, replay all five states for Cuirassier and confirm one visible rider leg, saddle contact, and a downward tail.
- Change to each faction and back to Imperials; current state and all three cards remain present.
- Enable reduced motion in Walk and Attack, then disable it; the current state remains selected and anatomy remains unchanged.

### Task 1: Specify the correction regressions before source changes

**Files:**
- Modify: `tests/renderer/sprites/v2/index.test.ts`
- Modify: `tests/renderer/sprites/sprite-animations-v2-css.test.ts`

- [x] **Step 1: Add failing serialized-anatomy assertions.**

  Add this test inside `#708 mounted and beast native sprites`:

  ```ts
  it('keeps Handler placement outside animated joints and layers the Cuirassier rider correctly', () => {
    const handler = getUnitSpriteV2('beast_handler', 'imperials')!;
    const cuirassier = getUnitSpriteV2('cuirassier', 'imperials')!;

    expect(handler).toContain('class="cq-handler-leg-l" transform="translate(35 78)"');
    expect(handler).toContain('class="cq-handler-leg-r" transform="translate(44 78)"');
    expect(handler).toContain('cq-handler-leg-l-joint');
    expect(handler).toContain('cq-handler-leg-r-joint');
    expect(cuirassier.indexOf('cq-rider-leg-r')).toBeLessThan(cuirassier.indexOf('cq-horse-body'));
    expect(cuirassier.indexOf('cq-rider-leg-l')).toBeGreaterThan(cuirassier.indexOf('cq-horse-body'));
    expect(cuirassier).toContain('M-27,-7 C-40,-9 -45,2 -42,15');
    expect(cuirassier).not.toContain('Q-39,-1 -40,13');
  });
  ```

- [x] **Step 2: Add the failing CSS target assertion.**

  Add this focused expectation to the `#708 mounted animal animation contract` describe block:

  ```ts
  it('rotates Handler inner joints without replacing their positioned outer groups', () => {
    for (const state of ['walk', 'attack']) {
      for (const joint of ['cq-handler-leg-l-joint', 'cq-handler-leg-r-joint']) {
        expect(css).toContain(`[data-state="${state}"] .${joint}`);
      }
    }
    expect(css).not.toContain('[data-state="walk"] .cq-handler-leg-l {');
    expect(css).not.toContain('[data-state="attack"] .cq-handler-leg-r {');
  });
  ```

- [x] **Step 3: Run the focused tests and confirm RED.**

  Run:

  ```bash
  ./scripts/run-with-mise.sh yarn test --run tests/renderer/sprites/v2/index.test.ts tests/renderer/sprites/sprite-animations-v2-css.test.ts
  ```

  Expected: the new nested-joint, painter-order, tail-path, and CSS-selector expectations fail while unrelated cases remain green.

### Task 2: Correct source anatomy and animation ownership

**Files:**
- Modify: `design/conquestoria-sprites/lib/units-v2.jsx:892-960`
- Modify: `src/assets/sprite-animations-v2.css:722-816`
- Regenerate: `src/renderer/sprites/v2/beast_handler.svg.ts`
- Regenerate: `src/renderer/sprites/v2/cuirassier.svg.ts`
- Regenerate: `docs/reviews/assets/issue-708/sprite-preview.html`

- [x] **Step 1: Nest Handler leg joints.**

  Keep the outer placement groups, but place the leg paths inside new animated joints:

  ```jsx
  <g className="cq-handler-leg-l" transform="translate(35 78)">
    <g className="cq-handler-leg-l-joint">
      <path d="M-3,0 L4,0 L2,16 L-5,16 Z" fill={_P2.cloth.wool} stroke={_P2.ink.line} strokeWidth="0.65" />
      <path d="M-6,16 L3,16 L5,19 L-7,19 Z" fill={_P2.wood.dark} />
    </g>
  </g>
  ```

  Repeat for the right leg. Change every Handler Walk/Attack selector from `.cq-handler-leg-l`/`.cq-handler-leg-r` to the corresponding `-joint` class, preserving current duration, delay, and transform origin.

- [x] **Step 2: Re-layer and seat the Cuirassier.**

  Draw `cq-rider-leg-r` immediately before the horse group, with its complete path confined to the horse flank. Draw the horse group next. Keep the rider torso after the horse, but replace the current two dangling legs with one near `cq-rider-leg-l` beginning inside the lowered rider seat and bending across the near flank. Preserve the named far-leg hook for catalog/anatomy compatibility, but do not let it emerge beyond the horse silhouette.

  Draw the replacement tail in the horse group as an outlined tapered mass rooted at the hindquarter:

  ```jsx
  <g className="cq-horse-tail">
    <path d="M-27,-7 C-40,-9 -45,2 -42,15 C-40,25 -35,31 -28,34 L-24,30 C-30,25 -34,18 -34,11 C-35,2 -31,-3 -24,-4 Z" fill="#2a1a10" stroke={_P2.ink.line} strokeWidth="0.7" />
    <path d="M-34,4 C-39,14 -35,24 -28,30" stroke="#5e3f24" strokeWidth="1.2" fill="none" />
  </g>
  ```

- [x] **Step 3: Regenerate only from the source of truth.**

  Run:

  ```bash
  ./scripts/run-with-mise.sh yarn node scripts/serialize-sprites.mjs
  ```

  Restore any unrelated generated building files that receive serializer phase-only churn; retain only the Handler/Cuirassier generated modules and preview payload changes.

- [x] **Step 4: Run the correction regressions and source rule check.**

  Run separately:

  ```bash
  ./scripts/run-with-mise.sh yarn test --run tests/renderer/sprites/v2/index.test.ts tests/renderer/sprites/sprite-animations-v2-css.test.ts tests/renderer/sprites/issue-708-sprite-preview.test.ts tests/renderer/sprite-overlay.test.ts tests/renderer/render-loop-combat-sprite-state.test.ts
  scripts/check-src-rule-violations.sh src/assets/sprite-animations-v2.css src/renderer/sprites/v2/beast_handler.svg.ts src/renderer/sprites/v2/cuirassier.svg.ts
  ```

  Expected: all targeted tests pass; the rule checker reports no violations.

### Task 3: Refresh review evidence and draft MR

**Files:**
- Modify: `docs/reviews/issue-708-mounted-beast-visual-review.md`
- Modify: `tests/renderer/sprites/issue-708-sprite-preview.test.ts`
- Generate: `docs/reviews/assets/issue-708/beast-handler-state-sheet.png`
- Generate: `docs/reviews/assets/issue-708/cuirassier-state-sheet.png`
- Modify: draft PR #878 body

- [x] **Step 1: Update the review wording and preview regression.**

  State that Handler feet remain attached by nested joints and that the Cuirassier has one visible near rider leg, a naturally occluded far leg, a seated saddle contact, and a downward tail. Extend the preview test to reject the stale phrase `forward-straddling rider` and require `one visible near rider leg`.

- [x] **Step 2: Regenerate and inspect visual evidence.**

  Run:

  ```bash
  ./scripts/run-with-mise.sh yarn node scripts/capture-issue-708-sprite-review.mjs
  ```

  Inspect Handler and Cuirassier state sheets at 40, 64, and 128 px. In Vite, replay the interaction checklist; reject the change if legs detach, both rider legs emerge, the pelvis floats above the saddle, or the tail loops.

- [ ] **Step 3: Verify, commit, and publish the existing draft MR.**

  Run separately:

  ```bash
  ./scripts/run-with-mise.sh yarn build
  ./scripts/run-with-mise.sh yarn test:durable
  ./scripts/run-with-mise.sh yarn test:durable:status
  ```

  Commit with `fix(708): correct rider contact and handler leg animation`, update PR #878’s embedded images/body, push the existing branch, and confirm the remote head equals local `HEAD`. If the local pre-push hook again exceeds its 600-second limit after final HEAD verification, document the timeout and use the same reviewed no-verify publication exception.

## Plan self-review

- Spec coverage: Task 1 proves every source/layering contract; Task 2 implements the three approved visual corrections; Task 3 refreshes the reviewer-facing evidence and final verification.
- Placeholder scan: no deferred work, generic test directions, or undefined helpers remain.
- Type consistency: all selector and hook names match the approved spec and current v2 source (`cq-handler-leg-*-joint`, `cq-rider-leg-l/r`, `cq-horse-body`, `cq-horse-tail`).
