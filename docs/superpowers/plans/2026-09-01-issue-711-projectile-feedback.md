# Issue 711 Projectile Feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Trebuchet and Rocket Artillery attacks visibly fire, without allowing a projectile, exhaust, or sling geometry to escape the native 128×128 sprite frame.

**Architecture:** Keep permanent silhouettes in `units-v2.jsx`; place separate attack-only payload layers beside—not inside—the Trebuchet sling and rocket tube groups. CSS owns timing, opacity, and bounded local transforms through named `data-state="attack"` hooks. The existing serializer distributes that production payload to native V2 TypeScript sprites and the file-safe preview; the review scripts turn it into committed PNG and GIF evidence for remote approval.

**Tech Stack:** JSX sprite source, generated TypeScript SVG payloads, CSS keyframes, Vitest, Playwright, ffmpeg.

---

### Task 1: Specify the player-visible attack feedback in tests

**Files:**
- Modify: `tests/renderer/sprites/v2/index.test.ts`
- Modify: `tests/renderer/sprites/sprite-animations-v2-css.test.ts`

- [x] **Step 1: Add a failing native-payload test**

Add `cq-trebuchet-stone` and both `cq-rocket-artillery-rocket--a` / `cq-rocket-artillery-rocket--b` to the Issue 711 native-hook expectations. Keep the existing assertion that the sling itself contains no circle, then assert the stone hook is a separate source layer.

- [x] **Step 2: Add a failing CSS-contract test**

Require `.cq-trebuchet-stone` and `.cq-rocket-artillery-rocket` to default to `opacity: 0`, require the attack selectors to assign `cq711-trebuchet-stone-flight` and `cq711-rocket-flight`, and require reduced-motion selectors to leave both payload layers hidden.

- [x] **Step 3: Run the two focused tests and observe the missing-hook failure**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/renderer/sprites/v2/index.test.ts tests/renderer/sprites/sprite-animations-v2-css.test.ts`

Expected: FAIL because the current native SVG has no projectile hooks and CSS has no projectile animation names.

### Task 2: Implement bounded projectile silhouettes and motion

**Files:**
- Modify: `design/conquestoria-sprites/lib/units-v2.jsx:1896-1922`
- Modify: `src/assets/sprite-animations-v2.css:#711 motion contract`
- Generated: `src/renderer/sprites/v2/trebuchet.svg.ts`
- Generated: `src/renderer/sprites/v2/rocket_artillery.svg.ts`
- Generated: `docs/reviews/assets/issue-711/sprite-preview.html`

- [x] **Step 1: Move the Trebuchet pivot art inward and add a detached stone layer**

Shift the beam and sling pivot left from the edge-prone placement, retain an empty `cq-trebuchet-sling`, and add a sibling `cq-trebuchet-stone` near the sling release point. The stone is a small dark outlined circle, never a sling child, so it cannot persist in idle geometry.

- [x] **Step 2: Add two staggered rocket layers from the foremost tube bank**

Add sibling `cq-rocket-artillery-rocket cq-rocket-artillery-rocket--a` and `cq-rocket-artillery-rocket cq-rocket-artillery-rocket--b` groups, each with a short body, colored nose, and small `cq-rocket-artillery-exhaust`. Their starting coordinates align with the rightmost launch tubes; neither layer changes the chassis, wheels, rack, or stabilizers.

- [x] **Step 3: Add CSS-only bounded local flight timelines**

Default stone, rockets, and exhaust to `opacity: 0`. During `data-state="attack"`, animate the stone from sling to a short up-right arc and fade before the frame edge. Animate rocket A then rocket B through short up-right trajectories with brief exhaust flashes. Keep existing beam/rack mechanical motion and set all projectile layers to `animation: none; opacity: 0` under `prefers-reduced-motion: reduce`.

- [x] **Step 4: Regenerate serialized production payloads and preview data**

Run: `bash scripts/run-with-mise.sh yarn node scripts/serialize-sprites.mjs`

Expected: regenerated `trebuchet.svg.ts`, `rocket_artillery.svg.ts`, and Issue 711 preview embed include the new classes.

- [x] **Step 5: Re-run the two focused tests and observe green**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/renderer/sprites/v2/index.test.ts tests/renderer/sprites/sprite-animations-v2-css.test.ts`

Expected: PASS.

### Task 3: Make remote review evidence prove the real launch motion

**Files:**
- Modify: `scripts/capture-issue-711-remote-review.mjs:14-18`
- Modify: `docs/reviews/issue-711-remote-sprite-review.md`
- Modify: `docs/reviews/issue-711-native-sprite-visual-review.md`
- Generated: `docs/reviews/assets/issue-711/*-identity-sheet.png`
- Generated: `docs/reviews/assets/issue-711/*-contact-sheet.png`
- Generated: `docs/reviews/assets/issue-711/*-animation.gif`

- [x] **Step 1: Make GIF capture validate the payload hook itself**

Set the Trebuchet `attackSelector` to `.cq-trebuchet-stone` and Rocket Artillery `attackSelector` to `.cq-rocket-artillery-rocket`. The capture command must fail if either visible payload lacks a real CSS animation.

- [x] **Step 2: Describe the corrected visual contract in both review documents**

Replace the old no-projectile wording with: Trebuchet has an empty idle sling and one bounded attack-only stone; Rocket Artillery emits two staggered bounded rockets from its foremost tube bank. State that each effect disappears before the loop and is hidden for non-attack and reduced-motion states.

- [x] **Step 3: Regenerate static sheets and remote GIF reels**

Run: `bash scripts/run-with-mise.sh yarn node scripts/capture-issue-711-sprite-review.mjs`

Run: `bash scripts/run-with-mise.sh yarn node scripts/capture-issue-711-remote-review.mjs`

Expected: four identity sheets, four contact sheets, and four GIF reels are regenerated; the two siege GIFs contain actual payload-flight frames.

- [x] **Step 4: Inspect the Trebuchet and Rocket Artillery visual evidence**

Open the regenerated contact sheets and GIFs. Confirm the Trebuchet stone is fully visible at release and disappears before the right edge; confirm both rockets launch in sequence, originate from the tube bank, and do not overlap the chassis or clip frame edges.

### Task 4: Verify, publish review evidence, and open the requested draft PR

**Files:**
- Modify: `docs/superpowers/plans/2026-09-01-issue-711-projectile-feedback.md`

- [x] **Step 1: Run focused regression and source-rule checks**

Run: `scripts/check-src-rule-violations.sh src/assets/sprite-animations-v2.css src/renderer/sprites/v2/trebuchet.svg.ts src/renderer/sprites/v2/rocket_artillery.svg.ts`

Run: `bash scripts/run-with-mise.sh yarn test --run tests/renderer/sprites/v2/index.test.ts tests/renderer/sprites/sprite-animations-v2-css.test.ts tests/renderer/sprites/issue-711-sprite-preview.test.ts tests/renderer/sprites/issue-711-remote-review.test.ts tests/renderer/sprites/sprite-catalog.test.ts`

Expected: every focused regression and source-rule check passes.

- [ ] **Step 2: Inspect all committed and local changes against `origin/main`**

Run: `git diff --check origin/main...HEAD` and `git diff --stat origin/main...HEAD`, followed by `git diff --check` and `git diff --stat`. Read the full source diff for the changed V2 SVG payloads and animation CSS.

- [ ] **Step 3: Run release-level verification**

Run separately: `bash scripts/run-with-mise.sh yarn build`

Then: `bash scripts/run-with-mise.sh yarn test:durable`

Then: `bash scripts/run-with-mise.sh yarn test:durable:status`

Expected: build succeeds and durable status accepts the exact current `HEAD` and working tree.

- [ ] **Step 4: Commit and push the corrected review package**

Run: `git add design/conquestoria-sprites/lib/units-v2.jsx src/assets/sprite-animations-v2.css src/renderer/sprites/v2/trebuchet.svg.ts src/renderer/sprites/v2/rocket_artillery.svg.ts scripts/capture-issue-711-remote-review.mjs tests/renderer/sprites/v2/index.test.ts tests/renderer/sprites/sprite-animations-v2-css.test.ts docs/reviews docs/superpowers/plans/2026-09-01-issue-711-projectile-feedback.md`

Run: `git commit -m "fix(711): animate siege payloads"`

Run: `git push -u origin codex/issue-711-visual-sprites`

- [ ] **Step 5: Open the requested draft pull request and synchronize this plan**

Create a draft PR into `main` with `Closes #711`, a link to `docs/reviews/issue-711-remote-sprite-review.md`, and the build/durable evidence. Replace this task’s checkboxes with completed state and append `🟡 draft PR #<number>; awaiting remote visual approval` to this task heading, commit the plan update, and push it to the same PR.
