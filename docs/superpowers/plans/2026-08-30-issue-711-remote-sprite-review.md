# Issue 711 Remote Sprite Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish a GitHub-rendered Issue 711 review document that embeds each native sprite and every production animation state for remote visual approval.

**Architecture:** A dedicated Playwright capture script mounts the existing file-safe V2 sprite payload with the production animation CSS, creates a labelled five-state reel per unit, captures deterministic frame sequences, and uses the repository's existing `ffmpeg` dependency to encode four looping GIFs. A Markdown review page embeds those GIFs and the existing identity sheets with repository-relative paths; an artifact test prevents a future review page from omitting a unit or linking an invalid GIF.

**Tech Stack:** Node.js ESM, `@playwright/test`, `ffmpeg`, Vitest, GitHub-flavored Markdown.

---

## File Structure

- Create: `scripts/capture-issue-711-remote-review.mjs` — generate and validate the four remote-review GIFs from production payload/CSS.
- Create: `docs/reviews/issue-711-remote-sprite-review.md` — remote approval surface with image embeds.
- Create: `docs/reviews/assets/issue-711/{trebuchet,rocket-artillery,battleship,missile-cruiser}-animation.gif` — generated five-state animated reels.
- Create: `tests/renderer/sprites/issue-711-remote-review.test.ts` — validate the Markdown embeds and GIF assets.

### Task 1: Define the remote-review artifact contract

**Files:**
- Create: `tests/renderer/sprites/issue-711-remote-review.test.ts`

- [ ] **Step 1: Write the failing artifact test**

```ts
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const units = [
  ['trebuchet', 'Trebuchet'],
  ['rocket-artillery', 'Rocket Artillery'],
  ['battleship', 'Battleship'],
  ['missile-cruiser', 'Missile Cruiser'],
] as const;

describe('Issue 711 remote sprite review', () => {
  it('embeds every unit identity sheet and looping animation GIF', () => {
    const markdown = readFileSync(resolve(root, 'docs/reviews/issue-711-remote-sprite-review.md'), 'utf8');

    for (const [id, label] of units) {
      expect(markdown).toContain(`## ${label}`);
      expect(markdown).toContain(`assets/issue-711/${id}-identity-sheet.png`);
      expect(markdown).toContain(`assets/issue-711/${id}-animation.gif`);
      const gif = readFileSync(resolve(root, `docs/reviews/assets/issue-711/${id}-animation.gif`));
      expect(gif.subarray(0, 6).toString('ascii')).toBe('GIF89a');
      expect(gif.byteLength).toBeGreaterThan(1_000);
    }
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails because the remote document and GIFs do not exist**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/renderer/sprites/issue-711-remote-review.test.ts`

Expected: FAIL with a missing `issue-711-remote-sprite-review.md` or animation GIF path.

### Task 2: Generate one five-state GIF reel per native unit

**Files:**
- Create: `scripts/capture-issue-711-remote-review.mjs`
- Create: `docs/reviews/assets/issue-711/trebuchet-animation.gif`
- Create: `docs/reviews/assets/issue-711/rocket-artillery-animation.gif`
- Create: `docs/reviews/assets/issue-711/battleship-animation.gif`
- Create: `docs/reviews/assets/issue-711/missile-cruiser-animation.gif`

- [ ] **Step 1: Implement the capture script**

Use `chromium` from `@playwright/test` to load the existing file-safe
`docs/reviews/assets/issue-711/sprite-preview.html`. For each unit, clone its
rendered card into a five-column reel labelled `Idle`, `Walk`, `Attack`,
`Hurt`, and `Death`; set `data-state` on both `.cq-sprite-wrap` and its SVG;
and leave the production CSS active.

For each reel, capture twelve screenshots at 125ms intervals into a unique
directory under `node:os.tmpdir()`. Before capturing, evaluate the unit's
attack selector (`.cq-trebuchet-beam`, `.cq-rocket-artillery-rack`,
`.cq-battleship-turret-fore`, or `.cq-missile-cruiser-vls-lid`) and throw when
its computed `animationName` is empty or `none`.

Encode each sequence with:

```js
spawnSync('ffmpeg', [
  '-hide_banner', '-loglevel', 'error', '-y',
  '-framerate', '8', '-i', resolve(frameDirectory, 'frame-%02d.png'),
  '-vf', 'fps=8,scale=1000:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer',
  '-loop', '0', outputGif,
], { stdio: 'inherit' });
```

Treat a nonzero `ffmpeg` status as an error, validate that the completed GIF
begins with `GIF89a`, and remove the temporary frame directory in `finally`.

- [ ] **Step 2: Run the capture script**

Run: `node scripts/capture-issue-711-remote-review.mjs`

Expected: exit 0 and one `*-animation.gif` asset for every unit.

### Task 3: Publish the GitHub-rendered approval document

**Files:**
- Create: `docs/reviews/issue-711-remote-sprite-review.md`

- [ ] **Step 1: Create the Markdown review page**

Write a short introduction stating that all remote evidence is generated from
the production V2 payload and animation CSS. State that each GIF has five
left-to-right animation lanes in this order: Idle, Walk, Attack, Hurt, Death.
For each unit, include its intended mechanical distinction and these exact
repository-relative embeds:

```md
![Trebuchet identity sheet](assets/issue-711/trebuchet-identity-sheet.png)

![Trebuchet animation reel — Idle, Walk, Attack, Hurt, Death](assets/issue-711/trebuchet-animation.gif)
```

Repeat the same two embeds with the exact unit IDs and labels for Rocket
Artillery, Battleship, and Missile Cruiser. End with an explicit instruction
that the review remains unapproved until a remote reviewer gives visual
approval; do not add a merge instruction or a live-preview dependency.

- [ ] **Step 2: Run the artifact test and confirm it passes**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/renderer/sprites/issue-711-remote-review.test.ts`

Expected: PASS, with all four GIF signatures and all eight Markdown embeds
validated.

### Task 4: Verify and prepare the draft pull request

**Files:**
- Modify: `docs/superpowers/plans/2026-08-30-issue-711-remote-sprite-review.md`

- [ ] **Step 1: Inspect the generated evidence**

Run:

```bash
file docs/reviews/assets/issue-711/*-animation.gif
git diff --check
git diff --stat origin/main...HEAD
git diff --stat
```

Expected: four GIF images, no whitespace errors, and only the planned script,
test, Markdown, generated assets, and plan-status changes.

- [ ] **Step 2: Mark this plan complete**

Tick every completed checkbox in this document and annotate this task header
with `✅ complete in draft PR #<number>` after GitHub returns the draft PR
number.

- [ ] **Step 3: Commit, push, and create a draft pull request**

Use the title `docs(711): add remote animated sprite review`. In the pull
request body, link `Closes #711`, list the four reviewed units, note that the
GIFs are generated from production V2 SVG/CSS rather than synthetic art, and
state that the PR is deliberately draft pending explicit visual approval.

Run before push:

```bash
bash scripts/run-with-mise.sh yarn build
bash scripts/run-with-mise.sh yarn test:durable
bash scripts/run-with-mise.sh yarn test:durable:status
```

Expected: build passes and durable test status accepts the current `HEAD` and
working tree.
