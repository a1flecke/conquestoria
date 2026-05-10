---
# Button Design System
**Issues:** #190 (solo campaign styling) + systemic audit  
**Date:** 2026-05-10

---

## Problem

11 buttons across 6 UI files have no visual styling — they render with browser-default gray chrome on a dark game background. This is a recurring pattern: every new UI file re-invents button construction and frequently omits `background` and `color`. There is no shared primitive, no hook check, and no rule to catch new violators before they ship.

**Complete list of currently broken buttons:**

| File | Button | Symptom |
|------|--------|---------|
| `foreign-city-entry-panel.ts:26` | `cancel` | Bare browser default |
| `foreign-city-entry-panel.ts:35` | `confirm` | Bare browser default |
| `worker-task-warning-panel.ts:25` | `cancel` | Bare browser default |
| `worker-task-warning-panel.ts:34` | `confirm` | Bare browser default |
| `required-choice-panel.ts:62` | `openTechButton` | Bare browser default |
| `required-choice-panel.ts:90` | `openCityButton` | Bare browser default |
| `wonder-panel.ts:130` | `startBuild` | Bare browser default |
| `campaign-setup.ts:118` | `chooseCivButton` | Bare browser default |
| `campaign-setup.ts:318` | `cancelButton` | Bare browser default |
| `campaign-setup.ts:327` | `startButton` | Bare browser default |
| `civ-select.ts:19` | `createButton` helper | Missing `background`/`color` |

---

## Design

### 1. `src/ui/ui-kit.ts` — centralized button factory

Two exported functions:

```ts
export function createGameButton(
  label: string,
  variant: ButtonVariant,
  options?: { disabled?: boolean; type?: 'button' | 'submit' }
): HTMLButtonElement

export function setButtonDisabled(btn: HTMLButtonElement, disabled: boolean): void
```

`setButtonDisabled` applies/removes the disabled visual state (opacity, cursor, pointer-events) without replacing the element. Use it when a button's enabled state changes after creation (e.g. Start Campaign becomes enabled once a civ is selected).

**Variants:**

| Variant | Background | Text | Border | Use case |
|---------|-----------|------|--------|----------|
| `'primary'` | `#e8c170` | `#1f1a12` bold | none | Main CTA: Start, Confirm, Save |
| `'secondary'` | `rgba(255,255,255,0.08)` | `#f4f1e8` | `1px solid rgba(232,193,112,0.45)` | Secondary action: Choose Civ, Open Tech, Open City, Start Build |
| `'ghost'` | `transparent` | `rgba(244,241,232,0.7)` | `1px solid rgba(255,255,255,0.2)` | Cancel / Back |
| `'danger'` | `#b91c1c` | `white` bold | none | Destructive: Raze, Delete, Move Anyway |
| `'close'` | `transparent` | `rgba(255,255,255,0.6)` | none | Panel ✕ buttons |

All variants enforce:
- `min-height: 44px` (touch target)
- `min-width: 44px`
- `padding: 10px 16px`
- `border-radius: 8px`
- `cursor: pointer`
- `font: inherit`
- `color` explicitly set (never inherited from browser)

Disabled state: `opacity: 0.45`, `cursor: not-allowed`, `pointer-events: none`.

### 2. Fix all 11 broken buttons

Replace bare `createElement('button')` calls in the 6 affected files with `createGameButton`. Exact variant assignments:

| Button | Variant |
|--------|---------|
| `foreign-city-entry-panel` cancel | `'ghost'` |
| `foreign-city-entry-panel` confirm | `'secondary'` |
| `worker-task-warning-panel` cancel | `'ghost'` |
| `worker-task-warning-panel` confirm | `'danger'` |
| `required-choice-panel` openTechButton | `'secondary'` |
| `required-choice-panel` openCityButton | `'secondary'` |
| `wonder-panel` startBuild | `'primary'` |
| `campaign-setup` chooseCivButton | `'secondary'` |
| `campaign-setup` cancelButton | `'ghost'` |
| `campaign-setup` startButton | `'primary'` (disabled until civ chosen) |
| `civ-select` createButton helper | replace with `createGameButton(label, 'ghost')` |

### 3. Migration of existing per-file helpers

`game-mode-select.ts` has two private helpers:
- `createActionButton` (Back button) — migrate to `createGameButton(label, 'ghost')`.
- `createModeButton` (Solo/Hot Seat mode tiles with 96px height, two-line label+description layout) — **do NOT migrate**; this is a selection tile, not a button variant. Keep as-is with a comment `// mode-tile: intentionally not a createGameButton variant`.

`civ-select.ts`'s `createButton` helper is replaced entirely with `createGameButton(label, 'ghost')`.

No other well-styled buttons need to change; they are already correct and may keep their inline styles for now (they're consistent with what `createGameButton` would produce).

### 4. Tests

In `tests/ui/ui-kit.test.ts`:
- Assert all 5 variants produce a button with non-empty `background` and non-empty `color`
- Assert `minHeight` is `'44px'`
- Assert disabled buttons have `opacity: '0.45'` and `cursor: 'not-allowed'`

In each panel's test file: smoke-assert that the specific formerly-broken buttons have `style.background` set and `style.color` set (not empty string).

### 5. Rule update (`.claude/rules/ui-panels.md`)

Add section **"No Bare Buttons"**:
> Every `document.createElement('button')` in `src/ui/` must receive a `style.cssText` or `Object.assign(button.style, {...})` that includes at minimum `background` and `color`. Prefer `createGameButton()` from `src/ui/ui-kit.ts`. The `check-src-edit` hook blocks edits that introduce a new bare `createElement('button')` in `src/ui/` without an adjacent style assignment.

### 6. Hook extension (`.claude/hooks/check-src-edit.sh`)

Add a check that runs only on `src/ui/*.ts` files (exempt: `ui-kit.ts`, `primary-action-bar.ts`):
- For each line containing `createElement('button')`, read lines N..N+8 using `sed`.
- If none of those lines match `\.style\.|cssText|createGameButton|Object\.assign`, flag the button.
- This approach (bash `while read` + `sed`) is safe: no awk `getline` stream consumption, handles multiple buttons at any spacing, and matches all style-setting patterns (individual property access, cssText, Object.assign, or createGameButton).

### 7. Hook smoke test additions (`tests/hooks/check-src-edit.test.sh`)

Add to the existing smoke test:
- **Block**: `src/ui/bare.ts` containing `const btn = document.createElement('button');` with no style on following lines → exit 2.
- **Allow**: `src/ui/styled.ts` containing `createElement('button')` followed by `btn.style.background = '#e8c170'` → exit 0.
- **Allow**: `src/ui/kit.ts` containing `createElement('button')` → exit 0 (exempt because filename matches `ui-kit.ts`... use a fixture path like `src/ui/ui-kit.ts`).
- **Allow**: `src/ui/game-btn.ts` containing `createGameButton('label', 'primary')` → exit 0.

### 7. Project-level skill (`.claude/skills/button-styling.md`)

Documents the `createGameButton` API, lists all variants with visual descriptions and use cases, and instructs to invoke before writing any button in `src/ui/`.

---

## What this does NOT change

- Panel layouts, colors, or overall visual design
- Buttons that already have correct styling (city-capture, unit-delete, council, tech-panel, etc.)
- Any game logic

---

## Acceptance criteria

- [ ] `src/ui/ui-kit.ts` exists and exports `createGameButton`
- [ ] All 11 listed buttons pass a visual smoke test showing non-browser-default colors
- [ ] `yarn test` passes (unit tests + hook smoke test for the new check)
- [ ] `yarn build` clean
- [ ] `check-src-edit` hook blocks a test input with a bare unstyled button in `src/ui/`
- [ ] `.claude/skills/button-styling.md` exists and is referenced in CLAUDE.md rules index
