# Bug Fix April 13 Milestone

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement these plans task-by-task. Each per-issue file is self-contained and uses checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix five April-13 playtest bugs (#78, #79, #80, #81, #82) covering both their direct symptoms and the root-cause patterns that allowed them.

**Architecture:** Each bug gets a focused fix wired through the data flow that broke. We add a regression test before changing code so the fix is provably real and the bug class can't quietly come back. Each issue lives in its own file so an agent can hold one bug in context at a time.

**Tech Stack:** TypeScript, Vite, vitest, Canvas 2D, DOM. All randomness through seeded RNG, all dynamic DOM text via `textContent`. Test environment uses `// @vitest-environment jsdom` per file.

---

## Index — recommended execution order

| # | Issue | File | Why this order |
|---|---|---|---|
| 1 | #78 — Bronze Working falsely unlocks Barracks | [01-issue-78-bronze-working.md](01-issue-78-bronze-working.md) | Smallest, isolated; warm-up. |
| 2 | #80 — Message log leaks across hotseat players | [02-issue-80-notification-log.md](02-issue-80-notification-log.md) | Touches `main.ts`. Do before #82 to avoid merge conflicts in the same file. |
| 3 | #81 — Map wrap duplicates cities | [03-issue-81-zoom-clamp.md](03-issue-81-zoom-clamp.md) | Self-contained renderer change. |
| 4 | #82 — City UI cycle + tap-to-open | [04-issue-82-city-ui.md](04-issue-82-city-ui.md) | Touches `main.ts` again; do after #80. |
| 5 | #79 — Council UI visual pass | [05-issue-79-council-ui.md](05-issue-79-council-ui.md) | Largest design work; do last after smaller wins. |

Each file is independently shippable as its own commit and PR. Bundle them into one PR titled `fix: April 13 bug sweep — #78 #79 #80 #81 #82` only if all five land in the same session.

---

## Diagnosis Summary (read once before starting)

### #78 — Bronze Working falsely claims to unlock Barracks
- **Direct cause:** `src/systems/tech-definitions.ts:7` lists `'Unlock Barracks building'` in `bronze-working.unlocks`. But `src/systems/city-system.ts:37` defines `barracks` with `techRequired: null` — Barracks is buildable from turn 1. The unlock string lies. Description `'Trains soldiers'` also doesn't tell the player what Barracks does mechanically.
- **Root cause:** No automated test asserts that strings in `tech.unlocks` matching `"Unlock <Name> building"` correspond to a building gated by that tech. Tech copy and gameplay drift apart silently.
- **Fix shape:** Remove the false claim (Barracks stays starter-tier, matching code). Rewrite description. Add a consistency regression that catches future drift across all tech entries.

### #79 — Council UI needs work
- **Direct cause:** `src/ui/council-panel.ts` produces a flat `<section><h3>` / `<article><strong><p>` tree with four bare `<button>` talk-level controls. No spacing, no panel chrome, no active-state on talk-level buttons, default browser button styling on Close. Looks like a wireframe.
- **Root cause:** Council panel was shipped as functional MVP; no design pass and no styling-conformance test.
- **Fix shape:** Restructure as a proper panel matching `city-panel.ts`'s inline-style conventions: header row with title + close, talk-level pills with `aria-pressed` active state, four agenda buckets as cards with colored left borders, subdued memory sections. Add regressions on `aria-pressed` invariant and `<header>` structure so the next regression in styling fails loudly.

### #80 — Message log leaks other hotseat player actions
- **Direct cause:** `src/main.ts:201` declares `notificationLog: NotificationEntry[]` as one global array. `showNotification` (line 205) appends regardless of player; `toggleNotificationLog` (line 256) renders the whole array. Player 2's notifications appear in Player 1's log.
- **Root cause:** Notification log predates hotseat (same family as #87 we just fixed for combat events). Any module-level mutable state crosses handoff. Also worth grepping `main.ts` for sibling globals (`currentCityIndex` is one — already ephemeral and acceptable, but worth a glance).
- **Fix shape:** Extract `src/ui/notification-log.ts` with `createNotificationLog`, `appendNotification(log, civId, entry)`, `getNotificationsForPlayer(log, civId)`. Wire `main.ts` to use it scoped by `gameState.currentPlayer`. Each player's log capped at 50 independently.

### #81 — Map wrapping duplicates cities
- **Direct cause:** `src/renderer/wrap-rendering.ts` returns a copy per `mapWidth` offset across the visible world span. When the player zooms out far enough that visible world width > one `mapWidthInPixels`, the helper returns ≥ 2 copies. Cities/units render at every copy; visually the map shows the same world tiled.
- **Root cause:** `Camera.minZoom = 0.3` is hardcoded (`src/renderer/camera.ts:9`) and ignores map width. There's no zoom floor that says "you may not zoom out past one full map."
- **Fix shape:** Compute `minZoom = camera.width / mapPixelWidth` once map bounds are known, where `mapPixelWidth = mapWidth * hexSize * Math.sqrt(3)` (verified from `hexToPixel` in `src/systems/hex-utils.ts:73`). Apply only when `state.map.wrapsHorizontally`. Wrap rendering then naturally returns ≤ 2 copies for any in-range zoom (one base + at most one ghost at the seam).

### #82 — City UI needs cycle + tap-to-open
- **Direct cause (a):** `src/ui/city-panel.ts` shows one specific `City`; no in-panel prev/next controls. Cycling is implemented at the call site (`src/main.ts:402-406`) by closing and re-opening on each press of the action bar's city button.
- **Direct cause (b):** `src/main.ts:893 handleHexTap` has unit-detection and movement-target branches but no city-detection branch. Tapping a city hex does nothing useful.
- **Root cause:** City panel was built as a "show one" leaf without navigation; map-tap routing was never extended for cities as the city system grew.
- **Fix shape:** Extract a tiny `getCityTapAction(state, viewerCivId, hex)` helper (testable in isolation, no DOM). Add prev/next controls to the city panel via a new `cities[]` + `currentIndex` + `onCycle` callback API. Add a city-tap branch in `handleHexTap` that uses `getCityTapAction` — own city → open panel via shared `openCityPanelAtIndex`, foreign city → read-only info panel mirroring the enemy-unit info pattern.

---

## Common verification

After each task file's commits, run from repo root:

```bash
eval "$(mise activate bash)"
yarn test
yarn build
```

Both must succeed. `yarn test` must show no skipped or `.only` tests. `yarn build` must succeed with zero TS errors.

For UI-affecting changes (#79, #81, #82), each task file lists a manual smoke test under `yarn dev`. Do not skip these — type checking and unit tests verify code correctness, not feature correctness. If the dev server is unavailable in the agent's environment, say so in the PR rather than claim success.

Before opening the PR, run the `code-review:code-review` skill on the branch.
