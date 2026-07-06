# Issue 437 HUD Alignment and Tauri Distribution Design

## Goal

Fix the still-visible HUD alignment defect reported in issue 437 and correct the
Tauri frontend build's distribution identity so macOS uses the intended desktop
capabilities instead of falling back to web behavior.

The change must preserve one shared HUD and gameplay frontend for GitHub
Pages/PWA and macOS/Tauri. It must not introduce macOS-only layout rules or fork
gameplay, UI behavior, storage formats, or renderer logic.

## Confirmed Root Causes

### HUD text is vertically misaligned

The HUD yield row is a flex container without cross-axis alignment. Its gold
control has a 44-pixel minimum touch target and centers its own text, while the
food, production, science, and stability spans place their text at the top of
the stretched row.

At a 1440 by 960 viewport with device pixel ratio 2, matching the Tauri main
window's content size, live browser measurements showed:

- food, production, and science glyph tops at 8.5 pixels
- gold glyph top at 22.5 pixels
- a 14-pixel visual offset

The row is already configured not to wrap. The defect is therefore cross-axis
alignment, not line wrapping, stale assets, save data, or different new-game
and saved-game rendering paths.

### The Tauri bundle identifies itself as web

`vite.config.ts` knows whether it is producing a Tauri build, but that value is
not injected into the client environment. The generated Tauri bundle contains
`MODE: "tauri"` while `src/platform/distribution.ts` checks only
`VITE_CONQUESTORIA_DISTRIBUTION` and `TAURI_ENV_PLATFORM`. Neither is present in
the emitted client environment, so `getDistribution()` returns `web`.

The same bundle was produced by both `yarn build:tauri` and an actual
`tauri:build:mac-app` run. Consequences include:

- service-worker registration follows the web branch instead of being
  deliberately skipped
- desktop menu initialization can be skipped
- native save-file capability selection can fall back to the browser adapter

This build defect is separate from the HUD's 14-pixel offset. It does, however,
show why the previous service-worker cache fix could not establish that the
macOS HUD problem was solved.

## Architecture

### Shared HUD layout

`src/main.ts` remains responsible for populating the live HUD. The yield row
will align its children at the center on the cross axis.

The fix belongs on the parent row because it expresses the shared relationship
between all yield items. The gold button keeps its 44-pixel minimum touch target,
drawer callback, nowrap behavior, and ellipsis overflow handling. No individual
margin, transform, relative-position, or line-height compensation will be added.

The row will expose a stable data attribute for rendered-layout regression
coverage. This attribute is a test/inspection contract only and does not affect
styling or behavior.

### Explicit distribution injection

`vite.config.ts` remains the build-distribution authority. Its existing
`isTauri` calculation already covers:

- `vite build --mode tauri`
- Tauri CLI build and development commands that set `TAURI_ENV_PLATFORM`
- ordinary web development and production builds

The Vite configuration will inject
`import.meta.env.VITE_CONQUESTORIA_DISTRIBUTION` as the literal string `tauri`
or `web` from that calculation. Only this non-secret enum is exposed to client
code.

`src/platform/distribution.ts` remains the sole shared platform boundary.
Service-worker registration, native menu initialization, and save-file adapter
selection continue consuming its existing API. Shared UI and gameplay modules
will not import Tauri APIs or inspect Tauri globals.

This preserves the current safe fallback: if code is evaluated outside the Vite
configuration without an injected identity, distribution resolution defaults
to `web`.

## Data Flow

### HUD

1. `updateHUD()` calculates the current civilization's displayed values.
2. It creates one non-wrapping yield row.
3. The row centers every child on the same cross axis.
4. Each child renders its existing text and behavior.
5. The player sees food, production, gold, science, and optional stability on
   one visual baseline.

### Distribution

1. Vite evaluates the build mode and Tauri CLI environment.
2. Vite injects one literal distribution value into the client bundle.
3. `getDistribution()` reads the injected value through
   `src/platform/distribution.ts`.
4. Platform capability factories and initializers select web or Tauri behavior.
5. The Tauri bundle deliberately skips the web service worker and enables native
   integrations; the web bundle retains PWA behavior.

## Player Truth Table

| Context | Before | After |
|---|---|---|
| New solo game in the macOS app | Gold text appears about one text line below adjacent yield text | All yield text shares one visual baseline |
| Loaded solo game with larger values and stability | Gold appears lower and makes the HUD look like two rows | All yield text remains centered in one non-wrapping row |
| Narrow web viewport with a long economy label | Gold and science can shrink and truncate without wrapping | Existing truncation behavior remains unchanged |
| GitHub Pages/PWA | Web distribution registers the service worker | Behavior remains unchanged |
| Tauri development or packaged macOS app | Client can resolve as web and skip native integrations | Client resolves as Tauri, skips the web service worker, and selects native capabilities |

## Error Handling and Safeguards

- Distribution injection is a closed `web | tauri` value, not an arbitrary
  environment string.
- Missing distribution identity keeps the existing web fallback for tests or
  unusual direct module evaluation.
- Service-worker registration retains its current failure swallowing; it remains
  a web-only enhancement.
- The HUD change does not alter state, events, save data, calculations, or
  interaction callbacks.
- The 44-pixel gold touch target remains intact.
- No platform-specific stylesheet or renderer branch is introduced.

## Test Design

### Rendered HUD regression

Add a Playwright regression under `tests/e2e/` that:

1. sets the viewport to 1440 by 960
2. installs an existing deterministic saved-game fixture in local storage,
   overriding the current civilization's gold and research label with fixed
   non-zero values before storage
3. enters the campaign through the live Continue flow
4. locates the live HUD yield row through its stable data attribute
5. measures each visible child's text rectangle with a DOM `Range`
6. asserts the difference between the highest and lowest text top is no more
   than 1 pixel
7. asserts the row remains non-wrapping and the gold control retains a minimum
   height of 44 pixels

This test must fail against the current implementation with the measured
14-pixel offset and pass after the parent alignment fix. It covers the same live
path used by both saved and new games while exercising non-zero saved-game HUD
values.

### Distribution and configuration regressions

Extend Vite configuration tests to prove:

- web mode injects `web`
- Tauri mode injects `tauri`
- a Tauri CLI platform environment injects `tauri` during development mode
- the GitHub Pages base remains `/conquestoria/`
- the Tauri base remains relative

Retain and run platform tests proving:

- injected Tauri identity resolves to `tauri`
- web identity resolves to `web`
- service workers register only for web
- Tauri configuration invokes `build:tauri`
- desktop menu initialization still follows the distribution boundary

Add save-file adapter selection coverage proving that a Tauri distribution
chooses the Tauri adapter and a web distribution chooses the browser adapter.

### Build verification

Run:

- the targeted Vite, distribution, service-worker, Tauri configuration, and HUD
  Playwright tests
- `scripts/check-src-rule-violations.sh` for changed source files
- the full Vitest and hook suite
- the production web build
- the Tauri frontend build
- the macOS `.app` build
- the macOS artifact checker

Inspect the emitted web and Tauri bundles to confirm their embedded distribution
values, and confirm web assets still use `/conquestoria/` while Tauri assets use
relative paths.

## Alternatives Rejected

### macOS-only HUD CSS

Rejected because the defect exists in shared flex layout. A platform-only rule
would fork UI behavior and mask the real cause.

### Individual gold offsets or reduced touch target

Rejected because positional compensation is brittle and shrinking the button
would violate the touch target convention.

### Broad HUD renderer extraction

Rejected because the live rendered-layout regression provides stronger coverage
for this CSS defect without expanding the production change across a large
`main.ts` extraction.

### Runtime Tauri-global sniffing

Rejected because the repo already has explicit dual build commands and a small
platform boundary. Injecting the distribution from the build configuration is
deterministic, testable, and avoids branching on globals in shared code.

### Exposing all Tauri environment variables to client code

Rejected because this change needs only one non-secret distribution enum.
Injecting that value directly keeps the client contract narrow.

## Acceptance Criteria

- Gold and every adjacent HUD yield label share a visual baseline within 1 pixel
  at the Tauri main-window viewport.
- The gold button remains clickable, single-line, truncatable, and at least
  44 pixels tall.
- Both loaded and new games continue using the same corrected HUD path.
- Web builds resolve as web and continue registering the PWA service worker.
- Tauri development and packaged builds resolve as Tauri, skip the web service
  worker, and select native capability paths.
- Web and Tauri asset bases remain correct.
- Targeted tests, full tests, web build, Tauri build, macOS app build, and artifact
  checks pass.
- Branch and uncommitted diffs contain no unrelated changes.

## Out of Scope

- Redesigning the HUD or changing its information hierarchy
- Changing economy calculations or labels
- Changing save schemas or migration behavior
- Refactoring all of `updateHUD()` into a new module
- Modifying service-worker cache semantics
- Adding Tauri-only gameplay, UI, or renderer behavior
