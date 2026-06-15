# Badge Clarity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace cryptic "F" and "2" unit badges with self-explanatory 🛡️ (fortified) and 🪖️×N (stack count) icons in both the Canvas and DOM unit renderers.

**Architecture:** Two source files touch badge rendering — `unit-renderer.ts` (Canvas, low zoom) and `sprite-overlay.ts` (DOM, high zoom). Each has existing tests that must be updated first (TDD: red→green). No logic changes — purely visual glyph and layout substitutions.

**Tech Stack:** TypeScript, Canvas 2D API, jsdom (vitest), `replaceChildren()` DOM API.

**Emoji note:** Every emoji in this plan includes the invisible Unicode variation selector-16 (U+FE0F) appended, which forces colour-emoji rendering on all platforms. Copy emoji strings from this document rather than retyping them.

---

## File Map

| File | Change |
|------|--------|
| `src/renderer/unit-renderer.ts` | `'F'` → `'🛡️'` for fortified; `String(count)` → `` `🪖️×${count}` `` + 1.2× radius for stack |
| `src/renderer/sprite-overlay.ts` | `'F'` → `'🛡️'` for fortified; circle badge → pill with two child spans for stack |
| `tests/renderer/unit-renderer.test.ts` | Update 3 assertions + 2 test description strings |
| `tests/renderer/sprite-overlay.test.ts` | Update 2 assertions + add re-render regression test |

---

## Task 1: Fix fortified badge glyph in both renderers

**Files:**
- Modify: `tests/renderer/unit-renderer.test.ts` (lines 146, 160, 163, 177)
- Modify: `tests/renderer/sprite-overlay.test.ts` (line 226)
- Modify: `src/renderer/unit-renderer.ts` (line 121)
- Modify: `src/renderer/sprite-overlay.ts` (line 294)

- [ ] **Step 1: Update Canvas fortified-badge test — description and assertion**

In `tests/renderer/unit-renderer.test.ts`, make these changes:

```ts
// line 146 — update the test description
it('draws a 🛡️ badge for a fortified unit', () => {

// line 160 — update the assertion (inside that test)
expect(ctx.fillText).toHaveBeenCalledWith('🛡️', expect.any(Number), expect.any(Number));

// line 163 — update the sibling test description
it('does not draw a 🛡️ badge for a non-fortified unit', () => {

// line 177 — update the negative assertion (inside that test)
expect(fillTextCalls.some(([text]) => text === '🛡️')).toBe(false);
```

- [ ] **Step 2: Update DOM fortified-badge test assertion**

In `tests/renderer/sprite-overlay.test.ts`, find the test `'renders stack, selection, health, fortified, and role decorations for DOM units'` (around line 211). Change line 226:

```ts
// before
expect(mount.querySelector('.cq-unit-fortified')?.textContent).toBe('F');
// after
expect(mount.querySelector('.cq-unit-fortified')?.textContent).toBe('🛡️');
```

- [ ] **Step 3: Run tests and confirm they fail for the right reason**

```bash
bash scripts/run-with-mise.sh yarn test tests/renderer/unit-renderer.test.ts tests/renderer/sprite-overlay.test.ts
```

Expected: 3 failures, each showing received `'F'` vs expected `'🛡️'`.

- [ ] **Step 4: Fix the Canvas renderer**

In `src/renderer/unit-renderer.ts` line 121, change:

```ts
ctx.fillText('F', badgeX, badgeY);
```
to:
```ts
ctx.fillText('🛡️', badgeX, badgeY);
```

- [ ] **Step 5: Fix the DOM renderer**

In `src/renderer/sprite-overlay.ts` line 294, change:

```ts
fortified.textContent = 'F';
```
to:
```ts
fortified.textContent = '🛡️';
```

- [ ] **Step 6: Run tests and confirm they pass**

```bash
bash scripts/run-with-mise.sh yarn test tests/renderer/unit-renderer.test.ts tests/renderer/sprite-overlay.test.ts
```

Expected: all passing.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/unit-renderer.ts src/renderer/sprite-overlay.ts \
        tests/renderer/unit-renderer.test.ts tests/renderer/sprite-overlay.test.ts
git commit -m "fix(badges): fortified badge F → 🛡️ in canvas and DOM renderers"
```

---

## Task 2: Fix stack count badge in DOM renderer (pill layout)

**Files:**
- Modify: `tests/renderer/sprite-overlay.test.ts` (lines 222–222 and new test after line 237)
- Modify: `src/renderer/sprite-overlay.ts` (lines 265–274)

- [ ] **Step 1: Update the DOM stack-count test to check the pill structure**

In `tests/renderer/sprite-overlay.test.ts`, the test `'renders stack, selection, health, fortified...'` starts at line 211. Currently line 222 is:

```ts
expect(mount.querySelector('.cq-unit-stack-count')?.textContent).toBe('2');
```

Replace that **single line** with this block (everything else in the `it` stays the same):

```ts
const pill = mount.querySelector('.cq-unit-stack-count') as HTMLElement | null;
expect(pill).not.toBeNull();
const spans = pill!.querySelectorAll('span');
expect(spans.length).toBe(2);
expect(spans[0].textContent).toBe('🪖️');
expect(spans[1].textContent).toBe('×2');
```

- [ ] **Step 2: Add a re-render regression test**

Still in `tests/renderer/sprite-overlay.test.ts`, after the closing `});` of the `'renders stack, selection, health, fortified...'` test (around line 228), add:

```ts
it('pill children are replaced cleanly on re-render, not accumulated', () => {
  const { overlay, mount } = mountOverlay();
  const e = entity({ stackCount: 2, memberIds: ['u1', 'u2'] });
  overlay.sync(cam({ zoom: 1 }), [e], MAP, OPTS);
  overlay.sync(cam({ zoom: 1 }), [e], MAP, OPTS);
  const pill = mount.querySelector('.cq-unit-stack-count') as HTMLElement | null;
  expect(pill?.querySelectorAll('span').length).toBe(2); // not 4 — replaceChildren, not appendChild
});
```

This guards against a future regression where `replaceChildren()` is swapped for `appendChild()`, which would silently double the spans on each re-render.

- [ ] **Step 3: Run tests and confirm they fail for the right reason**

```bash
bash scripts/run-with-mise.sh yarn test tests/renderer/sprite-overlay.test.ts
```

Expected: 2 failures:
- `'renders stack...'`: `spans.length` received 0, expected 2 (no child spans yet)
- `'pill children...'`: `spans.length` received 0, expected 2

- [ ] **Step 4: Replace the stack count circle with a pill in sprite-overlay.ts**

In `src/renderer/sprite-overlay.ts`, replace lines 265–274 (the entire `if ((entity.stackCount ?? 1) > 1)` block, which currently uses `const count`). The new variable name is `pill` (the old `count` is replaced):

```ts
if ((entity.stackCount ?? 1) > 1) {
  const pill = getOrCreateDecoration(wrapper, 'cq-unit-stack-count');
  pill.style.cssText =
    'position:absolute;right:2%;top:2%;min-width:42%;height:28%;border-radius:999px;' +
    'background:rgba(0,0,0,.82);border:1px solid rgba(255,255,255,.85);color:#fff;' +
    'font:700 0.65em system-ui;display:flex;align-items:center;justify-content:center;' +
    'gap:2px;padding:0 3%;pointer-events:none';
  const icon = document.createElement('span');
  icon.textContent = '🪖️';
  icon.style.cssText = 'font-size:0.9em;line-height:1';
  const label = document.createElement('span');
  label.textContent = `×${entity.stackCount}`;
  label.style.cssText = 'font-weight:700';
  pill.replaceChildren(icon, label);
} else {
  removeDecoration(wrapper, 'cq-unit-stack-count');
}
```

**Why `replaceChildren` not `innerHTML`:** Project rules prohibit `innerHTML` for game-generated strings (XSS risk, per `.claude/rules/ui-panels.md`). `replaceChildren()` rebuilds children safely on every render cycle. `getOrCreateDecoration` reuses the outer div across renders, so children must be replaced explicitly — otherwise a second call would append duplicates.

- [ ] **Step 5: Run tests and confirm they pass**

```bash
bash scripts/run-with-mise.sh yarn test tests/renderer/sprite-overlay.test.ts
```

Expected: all passing.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/sprite-overlay.ts tests/renderer/sprite-overlay.test.ts
git commit -m "fix(badges): stack count badge DOM — circle → helmet pill (🪖️×N)"
```

---

## Task 3: Fix stack count badge in Canvas renderer

**Files:**
- Modify: `tests/renderer/unit-renderer.test.ts` (line 123)
- Modify: `src/renderer/unit-renderer.ts` (lines 196–218)

- [ ] **Step 1: Update the Canvas stack-count test**

In `tests/renderer/unit-renderer.test.ts`, change line 123:

```ts
// before
expect(ctx.fillText).toHaveBeenCalledWith('2', expect.any(Number), expect.any(Number));

// after
expect(ctx.fillText).toHaveBeenCalledWith('🪖️×2', expect.any(Number), expect.any(Number));
```

Leave line 124 unchanged — it checks the warrior unit glyph `'⚔️'`, not the badge.

- [ ] **Step 2: Run tests and confirm they fail for the right reason**

```bash
bash scripts/run-with-mise.sh yarn test tests/renderer/unit-renderer.test.ts
```

Expected: 1 failure — `fillText` was called with `'2'`, not `'🪖️×2'`.

- [ ] **Step 3: Fix the Canvas stack badge in unit-renderer.ts**

In `src/renderer/unit-renderer.ts`, replace lines 196–218 (the `if (presentation.stackCount > 1)` block).

**Context:** this block lives inside `drawUnitPresentations()`, in a `for (const renderCoord of renderCoords)` loop. The variable `size` is already defined two lines above the block as `const size = camera.hexSize * camera.zoom` (line 165) — it is in scope here.

Replace the block with:

```ts
if (presentation.stackCount > 1) {
  ctx.beginPath();
  ctx.arc(
    screen.x + metrics.countBadge.x,
    screen.y + metrics.countBadge.y,
    metrics.countBadge.radius * 1.2,   // wider to fit emoji + number
    0,
    Math.PI * 2,
  );
  ctx.fillStyle = 'rgba(0,0,0,0.82)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.stroke();
  ctx.font = `${size * 0.18}px system-ui`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'white';
  ctx.fillText(
    `🪖️×${presentation.stackCount}`,
    screen.x + metrics.countBadge.x,
    screen.y + metrics.countBadge.y,
  );
}
```

- [ ] **Step 4: Run tests and confirm they pass**

```bash
bash scripts/run-with-mise.sh yarn test tests/renderer/unit-renderer.test.ts
```

Expected: all passing.

- [ ] **Step 5: Run the full test suite**

```bash
bash scripts/run-with-mise.sh yarn test
```

Expected: all 267 test files passing, 0 failures. (No new test files were added; existing files were modified.)

- [ ] **Step 6: Commit**

```bash
git add src/renderer/unit-renderer.ts tests/renderer/unit-renderer.test.ts
git commit -m "fix(badges): stack count badge canvas — wider circle with 🪖️×N glyph"
```

---

## Manual Verification Checklist

After all three tasks pass:

1. **Low zoom (Canvas):** Start the dev server (`bash scripts/run-with-mise.sh yarn dev`). Zoom out on the map. Fortified unit: gold circle shows 🛡️. Stacked units: dark wider circle shows 🪖️×N.
2. **High zoom (DOM sprites):** Zoom in until sprites appear. Fortified unit: gold circle shows 🛡️. Stacked units: dark pill shows 🪖️ on left, ×N on right.
3. **Both badges together:** A fortified unit in a 2+ stack shows 🛡️ top-left and 🪖️×N pill top-right, no overlap.
