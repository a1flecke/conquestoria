# Issue 437 HUD Alignment and Tauri Distribution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align every HUD yield label on one visual baseline, make every distribution select the correct capabilities, and ensure wrapped macOS package commands build the active linked worktree.

**Architecture:** Keep the HUD fix in the shared live `updateHUD()` path by centering the yield row's children while preserving the gold button's touch target and truncation. Keep platform selection inside `src/platform/` and inject its existing client enum from Vite's single `isTauri` build decision. Route linked-worktree Tauri commands by resolving the installed CLI from the main checkout but executing it, its frontend wrapper, Cargo, and artifact checks in the active worktree.

**Tech Stack:** TypeScript, Vite 8, Vitest 4, Playwright 1.59, Tauri 2, Yarn 4 through the repository mise wrapper.

---

## Scope and File Map

- Modify `vite.config.ts`
  - Inject `import.meta.env.VITE_CONQUESTORIA_DISTRIBUTION` as a JSON string literal.
  - Preserve existing base paths, HTML transformation, aliases, build output, sourcemaps, and Vitest settings.
- Modify `tests/platform/vite-config.test.ts`
  - Assert web, explicit Tauri mode, and Tauri CLI development environment injection.
  - Preserve asset-base and manifest coverage.
- Create `tests/platform/save-file-adapter.test.ts`
  - Characterize both branches of the existing capability selector so the corrected distribution identity is proven to reach the native save adapter.
- Modify `src/main.ts`
  - Add a stable inspection attribute to the live yield row.
  - Add parent-level `align-items:center`.
  - Preserve all text, calculations, callbacks, and child sizing/overflow rules.
- Create `tests/e2e/issue-437-hud-alignment.spec.ts`
  - Load a deterministic saved game at the Tauri main-window viewport.
  - Measure actual text rectangles and assert a baseline spread of at most one pixel.
  - Verify nowrap, the 44-pixel gold target, and repeated treasury drawer toggling.
- Modify `scripts/run-with-mise.sh`
  - Route Tauri development, build, macOS bundle, and artifact-check commands to
    the active linked worktree without duplicating the Yarn install.
  - Override nested Tauri frontend commands with the worktree-aware wrapper.
- Modify `tests/hooks/run-with-mise-worktree.test.sh`
  - Prove macOS packaging and artifact checking execute against the linked
    worktree.
- No changes to `src-tauri/`, save schemas, service-worker cache logic, gameplay state, or renderer code.

## Player Truth Table

| Before | Action | Immediate visible result |
|---|---|---|
| Gold text appears 14 pixels below food, production, and science | Load or start a game | All visible HUD yield text shares one baseline |
| Gold shows a non-zero treasury and net rate | Click the gold control | Treasury drawer opens with the existing breakdown |
| Treasury drawer is open | Click the same gold control again | Treasury drawer closes; the HUD remains aligned |
| Web build starts | Application initialization | PWA service worker follows the existing web path |
| Tauri development or packaged app starts | Application initialization | Web service worker is skipped and native capability selectors follow the Tauri path |
| Wrapped macOS build starts in a linked worktree | Build silently packages the main checkout | Frontend, Cargo, bundle, and artifact check use the linked worktree |

## Misleading UI Risks

- Do not report this as a wrapping fix: the observed defect is a 14-pixel text offset inside a non-wrapping row.
- Do not shrink the gold button to make its text line up; that would violate the 44-pixel touch target.
- Do not use a macOS media query or Tauri-only HUD style; the shared flex row is defective on every distribution.
- Do not treat successful `build:tauri` output alone as proof of distribution identity; inspect the emitted bundle and test the injected literal.
- Do not change displayed economy values, research labels, or stability semantics while repairing layout.
- Do not accept a macOS bundle merely because Tauri exits successfully; its
  frontend hash, Cargo source path, and artifact path must belong to the active
  worktree.

## Interaction Replay Checklist

- Load the deterministic saved game.
- Confirm all visible HUD yield text aligns.
- Click gold once and confirm the treasury drawer opens.
- Click gold again and confirm the drawer closes.
- Re-read the HUD geometry after both interactions and confirm it remains aligned.
- Reload through the same saved-game path and confirm the alignment assertion still passes.

---

### Task 1: Inject and propagate the correct build distribution

**Files:**
- Modify: `tests/platform/vite-config.test.ts`
- Modify: `vite.config.ts`
- Create: `tests/platform/save-file-adapter.test.ts`
- Verify: `tests/platform/distribution.test.ts`
- Verify: `tests/platform/service-worker.test.ts`
- Verify: `tests/platform/desktop-menu.test.ts`
- Verify: `tests/platform/tauri-config.test.ts`

- [ ] **Step 1: Replace the Vite test helper and add failing distribution-injection tests**

Update the imports and helpers at the top of
`tests/platform/vite-config.test.ts` to exercise the real default Vite
configuration entrypoint while restoring the process environment after each
configuration read:

```typescript
import { describe, expect, it } from 'vitest';
import type { Plugin, UserConfig } from 'vite';
import viteConfig from '../../vite.config';

function resolveConfig(mode: string, tauriPlatform?: string): UserConfig {
  if (typeof viteConfig !== 'function') {
    return viteConfig as UserConfig;
  }

  const previousPlatform = process.env.TAURI_ENV_PLATFORM;
  if (tauriPlatform === undefined) {
    delete process.env.TAURI_ENV_PLATFORM;
  } else {
    process.env.TAURI_ENV_PLATFORM = tauriPlatform;
  }

  try {
    return viteConfig({
      mode,
      command: mode === 'development' ? 'serve' : 'build',
      isSsrBuild: false,
      isPreview: false,
    }) as UserConfig;
  } finally {
    if (previousPlatform === undefined) {
      delete process.env.TAURI_ENV_PLATFORM;
    } else {
      process.env.TAURI_ENV_PLATFORM = previousPlatform;
    }
  }
}

function resolveInjectedDistribution(mode: string, tauriPlatform?: string): 'web' | 'tauri' {
  const define = resolveConfig(mode, tauriPlatform).define as Record<string, string> | undefined;
  const raw = define?.['import.meta.env.VITE_CONQUESTORIA_DISTRIBUTION'];
  if (!raw) {
    throw new Error('VITE_CONQUESTORIA_DISTRIBUTION is not injected');
  }
  return JSON.parse(raw) as 'web' | 'tauri';
}
```

Keep `transformIndexHtml()` unchanged except that it continues calling the new
`resolveConfig()` helper. Add these tests before the manifest test:

```typescript
  it('injects the web distribution for normal builds', () => {
    expect(resolveInjectedDistribution('production')).toBe('web');
  });

  it('injects the Tauri distribution for explicit Tauri builds', () => {
    expect(resolveInjectedDistribution('tauri')).toBe('tauri');
  });

  it('injects the Tauri distribution when the Tauri CLI starts development', () => {
    expect(resolveInjectedDistribution('development', 'darwin')).toBe('tauri');
  });
```

- [ ] **Step 2: Run the Vite configuration test and verify the red failure**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/platform/vite-config.test.ts
```

Expected: the three new distribution-injection tests FAIL with
`VITE_CONQUESTORIA_DISTRIBUTION is not injected`; the existing base and manifest
tests continue to pass. This proves the new build-identity contract is absent
without invalidating existing configuration behavior.

- [ ] **Step 3: Inject the distribution from the existing Vite build decision**

Add the `define` property shown below immediately after the existing `base`
property in the object returned by the default Vite configuration:

```typescript
    define: {
      'import.meta.env.VITE_CONQUESTORIA_DISTRIBUTION': JSON.stringify(
        isTauri ? 'tauri' : 'web',
      ),
    },
```

Do not add a named export to `vite.config.ts`; mixed named/default config exports
produce a bundler warning. Do not alter the manifest-removal regular expression,
paths, sourcemap setting, test exclusions, cache comments, or cache location.

- [ ] **Step 4: Run the Vite configuration test and verify it passes**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/platform/vite-config.test.ts
```

Expected: all tests in `vite-config.test.ts` PASS, including existing web/Tauri
base and manifest assertions.

- [ ] **Step 5: Add save-file capability selection coverage**

Create `tests/platform/save-file-adapter.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  isTauriDistribution: vi.fn(),
  createBrowserSaveFileAdapter: vi.fn(),
  createTauriSaveFileAdapter: vi.fn(),
}));

vi.mock('@/platform/distribution', () => ({
  isTauriDistribution: mocks.isTauriDistribution,
}));

vi.mock('@/platform/browser-save-file-adapter', () => ({
  createBrowserSaveFileAdapter: mocks.createBrowserSaveFileAdapter,
}));

vi.mock('@/platform/tauri-save-file-adapter', () => ({
  createTauriSaveFileAdapter: mocks.createTauriSaveFileAdapter,
}));

import { getSaveFileAdapter } from '@/platform/save-file-adapter';

describe('getSaveFileAdapter', () => {
  const browserAdapter = {
    exportText: vi.fn(),
    importText: vi.fn(),
  };
  const tauriAdapter = {
    exportText: vi.fn(),
    importText: vi.fn(),
  };

  beforeEach(() => {
    mocks.isTauriDistribution.mockReset();
    mocks.createBrowserSaveFileAdapter.mockReset();
    mocks.createTauriSaveFileAdapter.mockReset();
    mocks.createBrowserSaveFileAdapter.mockReturnValue(browserAdapter);
    mocks.createTauriSaveFileAdapter.mockReturnValue(tauriAdapter);
  });

  it('uses the browser adapter for web builds', async () => {
    mocks.isTauriDistribution.mockReturnValue(false);

    await expect(getSaveFileAdapter()).resolves.toBe(browserAdapter);
    expect(mocks.createBrowserSaveFileAdapter).toHaveBeenCalledOnce();
    expect(mocks.createTauriSaveFileAdapter).not.toHaveBeenCalled();
  });

  it('uses the native adapter for Tauri builds', async () => {
    mocks.isTauriDistribution.mockReturnValue(true);

    await expect(getSaveFileAdapter()).resolves.toBe(tauriAdapter);
    expect(mocks.createTauriSaveFileAdapter).toHaveBeenCalledOnce();
    expect(mocks.createBrowserSaveFileAdapter).not.toHaveBeenCalled();
  });
});
```

This is characterization coverage for an existing consumer of the distribution
boundary. It is expected to pass immediately; the failing Vite test above is the
red test for the production defect.

- [ ] **Step 6: Run the complete targeted platform suite**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/platform/vite-config.test.ts tests/platform/distribution.test.ts tests/platform/service-worker.test.ts tests/platform/desktop-menu.test.ts tests/platform/save-file-adapter.test.ts tests/platform/tauri-save-file-adapter.test.ts tests/platform/browser-save-file-adapter.test.ts tests/platform/tauri-config.test.ts
```

Expected: all targeted platform tests PASS. This proves the injected identity,
service-worker separation, desktop-menu branch, save-adapter branch, and Tauri
build command remain consistent.

- [ ] **Step 7: Build the Tauri frontend and inspect the emitted identity and paths**

Run:

```bash
./scripts/run-with-mise.sh yarn build:tauri
```

Expected: TypeScript and Vite build PASS. Then run:

```bash
rg -n 'VITE_CONQUESTORIA_DISTRIBUTION.{0,80}tauri|tauri.{0,80}VITE_CONQUESTORIA_DISTRIBUTION' dist/assets/index-*.js
rg -n 'src="\./assets/|href="\./assets/' dist/index.html
```

Expected: the built JavaScript contains the injected `tauri` distribution and
`dist/index.html` uses relative `./assets/` paths. If minification inlines the
value and removes the property name, inspect the compiled `resolveDistribution`
call and confirm its default environment object contains the literal `tauri`;
do not accept build success without that evidence.

- [ ] **Step 8: Review and commit Task 1**

Review:

```bash
git diff --check
git diff -- vite.config.ts tests/platform/vite-config.test.ts tests/platform/save-file-adapter.test.ts
```

Confirm no web path, manifest behavior, test exclusion, or sourcemap setting
changed. Then commit:

```bash
git add vite.config.ts tests/platform/vite-config.test.ts tests/platform/save-file-adapter.test.ts
git commit -m "fix(platform): inject Tauri distribution into client builds"
```

---

### Task 2: Reproduce and fix the live HUD baseline defect

**Files:**
- Create: `tests/e2e/issue-437-hud-alignment.spec.ts`
- Modify: `src/main.ts:544-561`

- [ ] **Step 1: Write the rendered-layout regression**

Create `tests/e2e/issue-437-hud-alignment.spec.ts`:

```typescript
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const FIXTURE_TEXT = readFileSync(
  join(__dirname, '..', 'fixtures', 'issue-365-crowded-map-save.json'),
  'utf8',
);

async function installFixture(page: Page): Promise<void> {
  await page.addInitScript((fixtureText) => {
    const fixture = JSON.parse(fixtureText);
    const civ = fixture.civilizations[fixture.currentPlayer];
    civ.gold = 1012;
    civ.techState.currentResearch = 'natural-philosophy';
    fixture.marketplace.purchasedResources = [{
      civId: fixture.currentPlayer,
      resource: 'silk',
      expiresOnTurn: fixture.turn + 10,
    }];
    localStorage.setItem('conquestoria-autosave', JSON.stringify(fixture));
  }, FIXTURE_TEXT);
}

async function continueFixture(page: Page): Promise<void> {
  await page.goto('/');
  const continueButton = page.getByRole('button', { name: 'Continue', exact: true });
  await continueButton.click();
  await expect(page.getByRole('dialog', { name: 'Choose Opponent Challenge' })).toBeVisible();
  await page.locator(
    '[data-opponent-challenge-selector="migration"] [data-challenge="standard"]',
  ).click();
  await page.getByRole('button', { name: 'Continue Campaign', exact: true }).click();
  await expect(continueButton).toBeHidden();
}

async function readTextTops(page: Page): Promise<number[]> {
  return page.locator('[data-role="hud-yields"] > *').evaluateAll(elements =>
    elements.map((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      return range.getBoundingClientRect().top;
    }),
  );
}

test('Tauri-sized HUD keeps every yield on one visual baseline', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await installFixture(page);
  await continueFixture(page);

  const yieldsRow = page.locator('[data-role="hud-yields"]');
  await expect(yieldsRow).toBeVisible();
  await expect(yieldsRow).toContainText('☺ 1 (stability)');
  const textTops = await readTextTops(page);
  expect(textTops).toHaveLength(5);
  expect(Math.max(...textTops) - Math.min(...textTops)).toBeLessThanOrEqual(1);

  const rowStyles = await yieldsRow.evaluate(element => ({
    alignItems: getComputedStyle(element).alignItems,
    flexWrap: getComputedStyle(element).flexWrap,
  }));
  expect(rowStyles).toEqual({ alignItems: 'center', flexWrap: 'nowrap' });

  const goldButton = yieldsRow.getByRole('button');
  const goldBox = await goldButton.boundingBox();
  expect(goldBox?.height).toBeGreaterThanOrEqual(44);

  const netRow = page.locator('[data-row="net"]');
  await expect(netRow).toBeHidden();
  await goldButton.click();
  await expect(netRow).toBeVisible();
  await goldButton.click();
  await expect(netRow).toBeHidden();

  const replayedTextTops = await readTextTops(page);
  expect(Math.max(...replayedTextTops) - Math.min(...replayedTextTops))
    .toBeLessThanOrEqual(1);
});
```

- [ ] **Step 2: Run the browser regression and verify the first red failure**

Run:

```bash
./scripts/run-with-mise.sh yarn test:web-smoke tests/e2e/issue-437-hud-alignment.spec.ts
```

Expected: FAIL because `[data-role="hud-yields"]` does not exist yet.

- [ ] **Step 3: Expose the live yield row through the stable inspection contract**

In `src/main.ts`, immediately after creating `yieldsRow`, add:

```typescript
  yieldsRow.dataset.role = 'hud-yields';
```

Do not change its style yet.

- [ ] **Step 4: Re-run the browser regression and verify the exact geometry failure**

Run:

```bash
./scripts/run-with-mise.sh yarn test:web-smoke tests/e2e/issue-437-hud-alignment.spec.ts
```

Expected: FAIL because the measured text-top spread is approximately 14 pixels,
not at most 1 pixel. This is the red test for the reported defect.

- [ ] **Step 5: Apply the minimal parent-level alignment fix**

Change the yield row setup in `src/main.ts` to:

```typescript
  const yieldsRow = document.createElement('div');
  yieldsRow.dataset.role = 'hud-yields';
  yieldsRow.style.cssText =
    'display:flex;align-items:center;gap:10px;flex-wrap:nowrap;overflow:hidden;min-width:0;';
```

Also add `font-family:inherit` to the existing `goldBtn.style.cssText` string,
between `border:none` and `font-size:inherit`:

```typescript
  goldBtn.style.cssText =
    'background:transparent;color:inherit;border:none;font-family:inherit;font-size:inherit;padding:0;cursor:pointer;min-height:44px;display:inline-flex;align-items:center;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex-shrink:1;';
```

The parent rule removes the 15.5-pixel row offset. Inheriting the font family
removes the remaining default form-control font mismatch and keeps the measured
spread within 1 pixel. Do not alter any child text, gold callback, minimum
height, nowrap, overflow, or flex-shrink styles.

- [ ] **Step 6: Run the browser regression and verify it passes**

Run:

```bash
./scripts/run-with-mise.sh yarn test:web-smoke tests/e2e/issue-437-hud-alignment.spec.ts
```

Expected: PASS. The baseline spread is at most 1 pixel, the row is centered and
non-wrapping, the gold target is at least 44 pixels tall, and repeated drawer
toggles work.

- [ ] **Step 7: Run source policy checks and the mirrored UI test**

Run:

```bash
scripts/check-src-rule-violations.sh src/main.ts
./scripts/run-with-mise.sh yarn test --run tests/main.integration.test.ts tests/ui/hud-happiness.test.ts tests/ui/treasury-drawer.test.ts
```

Expected: source policy check exits 0 and all targeted Vitest files PASS.
`src/main.ts` has no exact `tests/main.test.ts`, so `tests/main.integration.test.ts`
is the closest main wiring regression; HUD happiness and treasury drawer tests
cover the affected children and interaction.

- [ ] **Step 8: Review and commit Task 2**

Review:

```bash
git diff --check
git diff -- src/main.ts tests/e2e/issue-437-hud-alignment.spec.ts
```

Confirm the production delta is limited to one stable data attribute and one
parent alignment declaration. Then commit:

```bash
git add src/main.ts tests/e2e/issue-437-hud-alignment.spec.ts
git commit -m "fix(hud): align yield labels across web and macOS"
```

---

### Task 3: Route wrapped Tauri packaging through the active worktree

**Files:**
- Modify: `tests/hooks/run-with-mise-worktree.test.sh`
- Modify: `scripts/run-with-mise.sh`

- [ ] **Step 1: Add failing linked-worktree package-routing regressions**

Inside the existing fake main-wrapper heredoc, immediately before
`exec mise exec -- "$@"`, add:

```bash
[ "$*" != "yarn bin tauri" ] || {
  printf '%s\n' '/fake/tauri.js'
  exit 0
}
```

In `tests/hooks/run-with-mise-worktree.test.sh`, add these checks after the
existing linked-worktree web build assertion:

```bash
rm -f "$mise_log"
(
  cd "$linked"
  PATH="$fake_bin:$PATH" \
    MISE_LOG="$mise_log" \
    ./scripts/run-with-mise.sh yarn tauri:build:mac-app
)
grep -Eq "^$linked\\|exec -- node /fake/tauri\\.js build --config .* --bundles app$" "$mise_log" || {
  echo "worktree macOS app build ran outside the active worktree"
  exit 1
}
grep -Fq './scripts/run-with-mise.sh yarn build:tauri' "$mise_log" || {
  echo "worktree macOS app build did not override the frontend command"
  exit 1
}

rm -f "$mise_log"
(
  cd "$linked"
  PATH="$fake_bin:$PATH" \
    MISE_LOG="$mise_log" \
    ./scripts/run-with-mise.sh yarn tauri:check:mac-artifacts
)
grep -Fq "$linked|exec -- node $linked/scripts/check-tauri-macos-artifacts.mjs" "$mise_log" || {
  echo "worktree macOS artifact check ran outside the active worktree"
  exit 1
}
```

- [ ] **Step 2: Run the wrapper smoke test and verify the red failure**

Run:

```bash
bash tests/hooks/run-with-mise-worktree.test.sh
```

Expected: FAIL with
`worktree macOS app build ran outside the active worktree`. The catch-all Yarn
route currently delegates the package script to the main checkout.

- [ ] **Step 3: Add explicit worktree-aware Tauri routes**

In the linked-worktree case statement in `scripts/run-with-mise.sh`, add these
routes immediately before the existing `yarn,node)` route:

```bash
    yarn,tauri:check:mac-artifacts)
      shift 2
      cd "$CURRENT_ROOT"
      NODE_OPTIONS="--require $MAIN_ROOT/.pnp.cjs --experimental-loader file://$MAIN_ROOT/.pnp.loader.mjs ${NODE_OPTIONS:-}" \
        exec mise exec -- node "$CURRENT_ROOT/scripts/check-tauri-macos-artifacts.mjs" "$@"
      ;;
    yarn,tauri:dev|yarn,tauri:build|yarn,tauri:build:mac|yarn,tauri:build:mac-app)
      tauri_script="$2"
      shift 2
      tauri_cli="$(cd "$MAIN_ROOT" && run_without_local_git_env "$MAIN_RUN" yarn bin tauri)"
      worktree_build_config='{"build":{"beforeBuildCommand":{"cwd":"../","script":"./scripts/run-with-mise.sh yarn build:tauri","wait":true}}}'
      worktree_dev_config='{"build":{"beforeDevCommand":{"cwd":"../","script":"./scripts/run-with-mise.sh yarn dev --host 127.0.0.1","wait":false}}}'
      cd "$CURRENT_ROOT"
      case "$tauri_script" in
        tauri:dev)
          set -- dev --config "$worktree_dev_config" "$@"
          ;;
        tauri:build)
          set -- build --config "$worktree_build_config" "$@"
          ;;
        tauri:build:mac)
          set -- build --config "$worktree_build_config" --bundles app,dmg "$@"
          ;;
        tauri:build:mac-app)
          set -- build --config "$worktree_build_config" --bundles app "$@"
          ;;
      esac
      NODE_OPTIONS="--require $MAIN_ROOT/.pnp.cjs --experimental-loader file://$MAIN_ROOT/.pnp.loader.mjs ${NODE_OPTIONS:-}" \
        exec mise exec -- node "$tauri_cli" "$@"
      ;;
```

Also document `yarn tauri:*` in the wrapper's command-routing comment. The main
checkout remains the dependency source; the Tauri CLI, nested frontend command,
Cargo source tree, bundle output, and artifact checker use `CURRENT_ROOT`.

- [ ] **Step 4: Run the wrapper regression and full hook suite**

Run:

```bash
bash tests/hooks/run-with-mise-worktree.test.sh
./scripts/run-with-mise.sh yarn test:hooks
```

Expected: the focused wrapper regression and every hook smoke test PASS.

- [ ] **Step 5: Build and inspect the macOS app through the corrected wrapper**

Run:

```bash
./scripts/run-with-mise.sh yarn tauri:build:mac-app
```

Expected evidence:

- Tauri reports `./scripts/run-with-mise.sh yarn build:tauri` as the nested
  `beforeBuildCommand`.
- The frontend output matches the active worktree Tauri bundle.
- Cargo reports the active worktree's `src-tauri` path.
- The final `.app` path is under the active worktree.

Then run:

```bash
./scripts/run-with-mise.sh yarn tauri:check:mac-artifacts
```

Expected: the checker reports the `.app` inside the active worktree and exits 0.

- [ ] **Step 6: Review and commit Task 3**

Run:

```bash
git diff --check
git diff -- scripts/run-with-mise.sh tests/hooks/run-with-mise-worktree.test.sh
```

Confirm ordinary Yarn commands still route to the main installed project, web
and Tauri frontend build routes are unchanged, and only Tauri package/runtime
commands plus the artifact checker use the new path. Then commit:

```bash
git add scripts/run-with-mise.sh tests/hooks/run-with-mise-worktree.test.sh
git commit -m "fix(tooling): package Tauri apps from active worktrees"
```

---

### Task 4: Verify both releases and review the complete implementation

**Files:**
- Verify all branch changes against `origin/main`
- No planned production edits; fix any review finding in its owning file and add
  or strengthen the nearest regression before proceeding.

- [ ] **Step 1: Run the full required test suite**

Run:

```bash
./scripts/run-with-mise.sh yarn test
```

Expected: all Vitest files and hook smoke tests PASS with no failures.

- [ ] **Step 2: Run all browser smoke and issue regressions**

Run:

```bash
./scripts/run-with-mise.sh yarn test:web-smoke
```

Expected: every Playwright test PASS, including the issue 437 geometry and
interaction regression.

- [ ] **Step 3: Build and inspect the GitHub Pages/PWA release**

Run:

```bash
./scripts/run-with-mise.sh yarn build
```

Expected: TypeScript and production Vite build PASS and the service-worker cache
version is stamped. Then run:

```bash
rg -n 'src="/conquestoria/assets/|href="/conquestoria/assets/' dist/index.html
rg -n 'VITE_CONQUESTORIA_DISTRIBUTION.{0,80}web|web.{0,80}VITE_CONQUESTORIA_DISTRIBUTION' dist/assets/index-*.js
rg -n "const CACHE_NAME = 'conquestoria-[^']+'" dist/sw.js
```

Expected: web assets use `/conquestoria/`, the bundle contains the web
distribution identity, and `sw.js` has a stamped non-development cache name.

- [ ] **Step 4: Build and inspect the Tauri frontend**

Run:

```bash
./scripts/run-with-mise.sh yarn build:tauri
```

Expected: TypeScript and Tauri-mode Vite build PASS. Then run:

```bash
rg -n 'src="\./assets/|href="\./assets/' dist/index.html
rg -n 'VITE_CONQUESTORIA_DISTRIBUTION.{0,80}tauri|tauri.{0,80}VITE_CONQUESTORIA_DISTRIBUTION' dist/assets/index-*.js
```

Expected: Tauri assets use relative paths and the bundle contains the Tauri
distribution identity.

- [ ] **Step 5: Build and validate the macOS application artifact**

Run:

```bash
./scripts/run-with-mise.sh yarn tauri:build:mac-app
./scripts/run-with-mise.sh yarn tauri:check:mac-artifacts
```

Expected: the unsigned macOS `.app` is built and the artifact checker exits 0.

- [ ] **Step 6: Inspect committed and uncommitted diffs for correctness and completeness**

Run:

```bash
git status --short --branch
git diff --stat origin/main...HEAD
git diff --stat
git diff origin/main...HEAD
git diff
```

Review every changed line for:

- exact agreement with the approved design
- real red/green coverage for both root causes
- no macOS-only UI branch
- no lost 44-pixel touch target or treasury callback
- correct web and Tauri identities
- preserved service-worker and native capability routing
- no unrelated formatting, generated output, or user changes
- no stale comments claiming service-worker caching caused the HUD offset

- [ ] **Step 7: Repair every inline review finding**

For each finding, first add or strengthen the smallest failing regression when
the problem is behaviorally testable. Apply the minimal fix, rerun that targeted
test, then rerun Steps 1 through 5 if source or build configuration changed.

- [ ] **Step 8: Commit any review repairs**

If review produced changes:

```bash
git add vite.config.ts tests/platform/vite-config.test.ts tests/platform/save-file-adapter.test.ts src/main.ts tests/e2e/issue-437-hud-alignment.spec.ts
git commit -m "fix(review): harden issue 437 regression coverage"
```

If no review changes exist, do not create an empty commit.

- [ ] **Step 9: Prepare the pull request evidence**

Record:

- issue 437 link
- both confirmed root causes
- player-visible HUD impact
- corrected Tauri capability impact
- exact targeted, full, browser, web-build, Tauri-build, and macOS-build commands
- screenshots or Playwright trace artifacts only if a failure needs illustration
- explicit confirmation that web paths remain `/conquestoria/` and Tauri paths
  remain relative
