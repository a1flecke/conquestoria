# HUD Alignment + Service Worker Cache Versioning (#437) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the actual root cause of #437 — a service worker that can serve a stale cached bundle indefinitely because `CACHE_NAME` is a hardcoded literal that never changes on deploy — and add defensive CSS hardening to the one remaining unstyled HUD element, even though live verification during design showed it isn't the cause of this specific screenshot.

**Architecture:** Two independent, small pieces. (1) Service worker: templatize `public/sw.js`'s `CACHE_NAME` with a safe default that works standalone in dev mode, add a small testable `.mjs` postbuild script that stamps in a real build-time version, wire it into `yarn build`. (2) HUD: add the same `min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex-shrink:1` treatment `sciSpan` already has to `goldBtn`, the one `yieldsRow` child still missing it.

**Tech Stack:** TypeScript, Vitest, plain JS service worker script, Node `.mjs` build script.

## Global Constraints
- `public/sw.js` remains a plain, unbundled JS file (not processed through the module/import system) — this is the file's existing convention (raw `self.addEventListener(...)` service worker script) and this PR doesn't restructure that.
- The versioning script must not touch anything except `CACHE_NAME` — the offline-first guarantee (media/audio precache list, cache-first fetch strategy for those assets) is unchanged.
- `infoRow` (`nameSpan`/`turnSpan` in `main.ts`) is explicitly NOT touched — confirmed during design it's a separate, non-flex block container and doesn't share `yieldsRow`'s failure mode.
- Run `bash scripts/run-with-mise.sh yarn test` after each task; all tests must pass before moving to the next task.

---

### Task 1: Templatize `CACHE_NAME` + testable version-stamping script

**Files:**
- Modify: `public/sw.js` (change the hardcoded `CACHE_NAME` literal to a dev-safe default)
- Create: `scripts/version-sw-cache.mjs` (exports a pure, testable replacement function; runs as a postbuild step)
- Modify: `package.json` (wire the script into the `build` command)
- Test: `tests/scripts/version-sw-cache.test.ts` (new file — no existing test directory for `scripts/`, create it)

**Interfaces:**
- Produces: `export function applyCacheVersion(swSource: string, version: string): string` from `scripts/version-sw-cache.mjs` — a pure string-transform function, the only piece worth unit testing directly (the `main()` file I/O wrapper is a thin, untested shell around it, matching how the other `.mjs` scripts in this repo are structured — no test scaffolding exists for `check-tauri-macos-artifacts.mjs`/`generate-tauri-icon.mjs` either, since they're thin I/O wrappers around simple logic).

- [ ] **Step 1: Change the `CACHE_NAME` literal to a dev-safe default**

In `public/sw.js`, change:
```js
const CACHE_NAME = 'conquestoria-v1';
```
to:
```js
const CACHE_NAME = 'conquestoria-dev';
```
This value is valid and functional on its own — `yarn dev` serves `public/sw.js` unprocessed (no build step runs in dev mode), so the service worker must work correctly without any templating. Only the production build (Task 1 Step 4) stamps in a real version.

- [ ] **Step 2: Write the failing test**

Create `tests/scripts/version-sw-cache.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { applyCacheVersion } from '../../scripts/version-sw-cache.mjs';

describe('applyCacheVersion', () => {
  it('replaces the CACHE_NAME literal with a build-specific version', () => {
    const source = "const CACHE_NAME = 'conquestoria-dev';\nconst PRECACHE_URLS = [];\n";
    const result = applyCacheVersion(source, '1730000000000');
    expect(result).toContain("const CACHE_NAME = 'conquestoria-1730000000000';");
    expect(result).not.toContain("'conquestoria-dev'");
  });

  it('only touches the CACHE_NAME line, leaving the rest of the file untouched', () => {
    const source = "const CACHE_NAME = 'conquestoria-dev';\nconst PRECACHE_URLS = ['/conquestoria/'];\n";
    const result = applyCacheVersion(source, 'abc123');
    expect(result).toContain("const PRECACHE_URLS = ['/conquestoria/'];");
  });

  it('is idempotent-safe: replacing an already-versioned CACHE_NAME still works', () => {
    const source = "const CACHE_NAME = 'conquestoria-999';\n";
    const result = applyCacheVersion(source, '1000');
    expect(result).toContain("const CACHE_NAME = 'conquestoria-1000';");
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/scripts/version-sw-cache.test.ts`
Expected: FAIL — `scripts/version-sw-cache.mjs` doesn't exist yet (module not found).

- [ ] **Step 4: Create the version-stamping script**

Create `scripts/version-sw-cache.mjs`:

```javascript
#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function applyCacheVersion(swSource, version) {
  return swSource.replace(
    /const CACHE_NAME = '[^']+';/,
    `const CACHE_NAME = 'conquestoria-${version}';`,
  );
}

function main() {
  const swPath = resolve(process.cwd(), 'dist/sw.js');
  const source = readFileSync(swPath, 'utf-8');
  const version = process.env.CONQUESTORIA_BUILD_VERSION ?? Date.now().toString();
  writeFileSync(swPath, applyCacheVersion(source, version));
  console.log(`sw.js CACHE_NAME stamped: conquestoria-${version}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/scripts/version-sw-cache.test.ts`
Expected: all 3 tests PASS.

- [ ] **Step 6: Wire the script into the build**

In `package.json`, find the current build script:
```json
    "build": "tsc && vite build",
```
Change it to:
```json
    "build": "tsc && vite build && node scripts/version-sw-cache.mjs",
```

- [ ] **Step 7: Run a real build and verify the output — expect this to fail the first time**

Run: `bash scripts/run-with-mise.sh yarn build`

In a worktree (the normal case for any Claude session — check with `git worktree list`), this will very likely exit 0 **without** running the postbuild step, because `scripts/run-with-mise.sh` has a hardcoded `yarn,build)` case that expands to its own literal 2-step sequence (`tsc --noEmit` then `vite build`) instead of reading `package.json`'s actual `"build"` script string — a worktree-isolation workaround (`.pnp.cjs`/yarn state only exist in the main worktree) that predates this change and doesn't know about it. Confirm this is happening: `grep "CACHE_NAME" dist/sw.js` will show `conquestoria-dev`, not a stamped version, even though `yarn build` exited 0.

If you're running from the **main working tree** (not a worktree), this step will already work correctly — `scripts/run-with-mise.sh` falls through to `exec mise exec -- "$@"` for that case, which does read the real `package.json` script. The fix in the next step is still required for the (much more common) worktree case.

- [ ] **Step 8: Fix `scripts/run-with-mise.sh`'s hardcoded `yarn build` expansion**

In `scripts/run-with-mise.sh`, update the header comment's mapping table:
```
#   yarn build         → tsc --project $CURRENT_ROOT/tsconfig.json --noEmit
#                      + vite build $CURRENT_ROOT
```
to:
```
#   yarn build         → tsc --project $CURRENT_ROOT/tsconfig.json --noEmit
#                      + vite build $CURRENT_ROOT
#                      + node $CURRENT_ROOT/scripts/version-sw-cache.mjs
#                        (this mirrors package.json's "build" script — keep both in
#                        sync if that script's composition ever changes)
```

Then update the actual `yarn,build)` case:
```sh
    yarn,build)
      # Expand so tsc targets the worktree's tsconfig; vite targets the worktree's root
      (cd "$MAIN_ROOT" && run_without_local_git_env "$MAIN_RUN" yarn tsc --project "$CURRENT_ROOT/tsconfig.json" --noEmit) \
        && (cd "$MAIN_ROOT" && run_without_local_git_env "$MAIN_RUN" yarn vite build "$CURRENT_ROOT")
      exit
      ;;
```
to:
```sh
    yarn,build)
      # Expand so tsc targets the worktree's tsconfig; vite targets the worktree's root.
      # Third step mirrors package.json's "build" script (tsc && vite build && node
      # scripts/version-sw-cache.mjs) — the worktree path never reads that script
      # string, so it must be kept in sync here by hand.
      (cd "$MAIN_ROOT" && run_without_local_git_env "$MAIN_RUN" yarn tsc --project "$CURRENT_ROOT/tsconfig.json" --noEmit) \
        && (cd "$MAIN_ROOT" && run_without_local_git_env "$MAIN_RUN" yarn vite build "$CURRENT_ROOT") \
        && (cd "$CURRENT_ROOT" && node "$CURRENT_ROOT/scripts/version-sw-cache.mjs")
      exit
      ;;
```
(Leave the neighboring `yarn,build:tauri)` case untouched — the Tauri distribution never registers a service worker at all (`shouldRegisterServiceWorker` returns `false` for it), so `dist/sw.js` is dead/unused in that build; no need to version it there.)

`scripts/version-sw-cache.mjs` uses only `node:fs`/`node:path`/`node:url` (no PnP-resolved dependencies), so unlike the `yarn,node)` case it does not need the `.pnp.cjs`/`.pnp.loader.mjs` injection — a plain `node` invocation from `$CURRENT_ROOT` is sufficient.

- [ ] **Step 9: Re-run the build and verify the fix**

Run: `rm -f dist/sw.js && bash scripts/run-with-mise.sh yarn build`
Expected: exits 0, and prints a line like `sw.js CACHE_NAME stamped: conquestoria-<timestamp>`.

Then run: `grep "CACHE_NAME" dist/sw.js`
Expected: shows `const CACHE_NAME = 'conquestoria-<some large number>';` — NOT `conquestoria-dev` and NOT `conquestoria-v1`.

- [ ] **Step 10: Commit**

```bash
git add public/sw.js scripts/version-sw-cache.mjs scripts/version-sw-cache.d.mts scripts/run-with-mise.sh package.json tests/scripts/version-sw-cache.test.ts
git commit -m "feat(sw): stamp a real cache version at build time instead of a hardcoded literal (#437)

CACHE_NAME was hardcoded ('conquestoria-v1') and never bumped, so the
existing activate-time old-cache purge could never fire on a real
deploy — a returning user's stale index.html/bundle could be served
indefinitely under the cache-first fetch strategy. public/sw.js now
uses a dev-safe default ('conquestoria-dev', valid standalone since
yarn dev serves it unprocessed); the production build stamps in a
real per-build version via a small, unit-tested postbuild script.

Also fixes scripts/run-with-mise.sh, discovered by actually running
the build rather than trusting a green exit code: in a worktree (the
normal case for any Claude session), that wrapper hardcodes its own
2-step yarn-build expansion (tsc --noEmit + vite build) instead of
reading package.json's real \"build\" script string, so the new
postbuild step would have silently never run for anyone using the
project's own mandated build command. Added it as a third step there,
matching the existing pattern."
```

---

### Task 2: Raw service-worker execution test — activate handler purges stale caches

**Files:**
- Modify: `tests/platform/service-worker.test.ts` (add a new `describe` block; existing tests in this file only cover the JS-side `registerConquestoriaServiceWorker` wrapper, not `sw.js` itself)

**Interfaces:** None — this is regression coverage only, no new exports.

**Context:** `public/sw.js` is a raw, unbundled script using `self.addEventListener(...)` in the global service worker scope — it has no ES module exports to import directly. This task loads and executes its actual source inside a sandboxed context (Node's built-in `vm` module) with mock `self`/`caches` globals, captures the registered `install`/`activate` handlers, and invokes them directly to prove the real cache-purge logic works — not a reimplementation of the logic in test code.

- [ ] **Step 1: Write the test**

Add to `tests/platform/service-worker.test.ts`:

```typescript
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';

interface MockCache {
  addAll: (urls: string[]) => Promise<void>;
  put: (req: unknown, res: unknown) => Promise<void>;
  match: (req: unknown) => Promise<unknown>;
}

function makeEmptyMockCache(): MockCache {
  return { addAll: async () => {}, put: async () => {}, match: async () => undefined };
}

function makeMockCachesApi(existingCacheNames: string[]) {
  const stores = new Map<string, MockCache>();
  for (const name of existingCacheNames) stores.set(name, makeEmptyMockCache());
  const deleted: string[] = [];
  const opened: string[] = [];
  const cachesApi = {
    open: async (name: string) => {
      opened.push(name);
      if (!stores.has(name)) stores.set(name, makeEmptyMockCache());
      return stores.get(name)!;
    },
    keys: async () => Array.from(stores.keys()),
    delete: async (name: string) => {
      deleted.push(name);
      return stores.delete(name);
    },
    match: async () => undefined,
  };
  return { cachesApi, deleted, opened };
}

type SwEventHandler = (event: { waitUntil: (p: Promise<unknown>) => void }) => void;

function loadServiceWorkerListeners(cachesApi: unknown): Record<string, SwEventHandler[]> {
  const listeners: Record<string, SwEventHandler[]> = {};
  const sandbox: Record<string, unknown> = {
    caches: cachesApi,
    addEventListener: (type: string, handler: SwEventHandler) => {
      (listeners[type] ??= []).push(handler);
    },
    skipWaiting: () => {},
    clients: { claim: () => {} },
    fetch: async () => ({ ok: true, clone: () => ({}) }),
    console,
  };
  sandbox.self = sandbox;
  vm.createContext(sandbox);
  const source = readFileSync(resolve(__dirname, '../../public/sw.js'), 'utf-8');
  vm.runInContext(source, sandbox);
  return listeners;
}

describe('public/sw.js — activate handler cache versioning', () => {
  it('deletes every cache whose name differs from the current CACHE_NAME', async () => {
    const { cachesApi, deleted } = makeMockCachesApi(['conquestoria-old-version', 'some-unrelated-cache']);
    const listeners = loadServiceWorkerListeners(cachesApi);

    expect(listeners.activate).toBeDefined();
    let waited: Promise<unknown> = Promise.resolve();
    listeners.activate![0]({ waitUntil: (p) => { waited = p; } });
    await waited;

    expect(deleted.sort()).toEqual(['conquestoria-old-version', 'some-unrelated-cache']);
  });

  it('does not delete a cache that already matches the current CACHE_NAME', async () => {
    // Read the real CACHE_NAME out of the source instead of hardcoding it, so this
    // test doesn't silently drift from public/sw.js's actual current value.
    const source = readFileSync(resolve(__dirname, '../../public/sw.js'), 'utf-8');
    const match = source.match(/const CACHE_NAME = '([^']+)'/);
    expect(match).toBeTruthy();
    const currentCacheName = match![1];

    const { cachesApi, deleted } = makeMockCachesApi([currentCacheName, 'conquestoria-old-version']);
    const listeners = loadServiceWorkerListeners(cachesApi);

    let waited: Promise<unknown> = Promise.resolve();
    listeners.activate![0]({ waitUntil: (p) => { waited = p; } });
    await waited;

    expect(deleted).toEqual(['conquestoria-old-version']);
  });

  it('install handler precaches into the current CACHE_NAME', async () => {
    const source = readFileSync(resolve(__dirname, '../../public/sw.js'), 'utf-8');
    const match = source.match(/const CACHE_NAME = '([^']+)'/);
    const currentCacheName = match![1];

    const { cachesApi, opened } = makeMockCachesApi([]);
    const listeners = loadServiceWorkerListeners(cachesApi);

    expect(listeners.install).toBeDefined();
    let waited: Promise<unknown> = Promise.resolve();
    listeners.install![0]({ waitUntil: (p) => { waited = p; } });
    await waited;

    expect(opened).toContain(currentCacheName);
  });
});
```

Add the necessary imports at the top of `tests/platform/service-worker.test.ts` — the current file starts with:
```typescript
import { describe, expect, it, vi } from 'vitest';
import { registerConquestoriaServiceWorker } from '@/platform/service-worker';
```
Add `readFileSync` from `'node:fs'`, `resolve` from `'node:path'`, and `vm` from `'node:vm'` to that import block (as separate `import` lines, since they're Node builtins not `@/`-aliased modules).

- [ ] **Step 2: Run the tests to verify they pass**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/platform/service-worker.test.ts`
Expected: all tests PASS — the 3 new ones plus the 3 pre-existing `registerConquestoriaServiceWorker` tests.

(These tests don't need a red-green cycle — they exercise `public/sw.js`'s already-correct `activate`/`install` logic as it exists today; Task 1 didn't change that logic, only `CACHE_NAME`'s value. This is regression coverage for behavior that already works, proving it stays correct going forward.)

- [ ] **Step 3: Commit**

```bash
git add tests/platform/service-worker.test.ts
git commit -m "test(sw): exercise public/sw.js's real install/activate handlers directly (#437)

Loads the actual unbundled service worker source into a sandboxed
vm context with mock self/caches globals, captures the registered
event handlers, and invokes them — proves the existing stale-cache
purge logic actually works, rather than only testing the JS-side
registration wrapper as tests/platform/service-worker.test.ts did
before this."
```

---

### Task 3: Defensive CSS hardening on `goldBtn`

**Files:**
- Modify: `src/main.ts` (add the same nowrap/ellipsis treatment `sciSpan` already has to `goldBtn`)
- Verify: a throwaway Playwright script (not a permanent test file — see "No automated test" below)

**Interfaces:** None — pure CSS/styling change.

**Context:** Live-verified during design (Playwright render at the exact reported viewport/data) that this is *not* the cause of the reported screenshot — the real cause is Task 1's stale service worker cache. This is defensive hardening only: `goldBtn` is the one `yieldsRow` child that still lacks the `min-width:0`/ellipsis pattern `b6c5cd0` established for `sciSpan`, and a long enough `formatGoldHudText` strain suffix on a narrow device could still make its own text wrap internally. Safe to truncate visually — `goldBtn` opens the full treasury drawer on click, so the compact label losing a trailing clause doesn't lose information the player can't reach in one tap.

**No automated test:** `tests/ui/hud-happiness.test.ts`'s own header comment states the established project constraint explicitly: *"We test the helper directly since `updateHUD()` lives in `main.ts` and is not unit-testable."* `updateHUD` has no extractable pure-data helper the way happiness-chip visibility does (`getCivHappinessFromResources`) — the CSS string is inline in the DOM-building code itself, not behind a testable function. Per CLAUDE.md's "For UI or frontend changes, start the dev server and use the feature in a browser before reporting the task as complete" requirement, this task substitutes a one-off Playwright render check (Step 2) for a permanent unit test, matching the same verification approach already used during design (`docs/superpowers/specs/2026-07-02-bug-fixing-spree-design.md`'s #437 section describes the identical technique). This is consistent with the codebase's own established position that `updateHUD` isn't unit-testable — not a gap this task should try to close on its own.

- [ ] **Step 1: Apply the CSS change**

In `src/main.ts`, find:
```typescript
  const goldBtn = document.createElement('button');
  goldBtn.style.cssText =
    'background:transparent;color:inherit;border:none;font-size:inherit;padding:0;cursor:pointer;min-height:44px;display:inline-flex;align-items:center;';
```
Change to:
```typescript
  const goldBtn = document.createElement('button');
  goldBtn.style.cssText =
    'background:transparent;color:inherit;border:none;font-size:inherit;padding:0;cursor:pointer;min-height:44px;display:inline-flex;align-items:center;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex-shrink:1;';
```

- [ ] **Step 2: Verify with a throwaway Playwright render (not a permanent test)**

In the scratchpad directory (not the repo), write a minimal HTML file replicating `createHud()` (`src/ui/game-shell.ts`) + the modified `updateHUD()` DOM/CSS, matching the technique already used during design. Render it with Playwright (`@playwright/test`, already a devDependency — run via `yarn node <script>.mjs` since this is a Yarn PnP project and `node` alone can't resolve `playwright`/`@playwright/test` imports) at a narrow viewport (e.g. 380×400) with a long `formatGoldHudText`-style string (e.g. `"💰 999999999 (+123456 net) · Critical strain"`) forced into `goldBtn`'s content, and confirm visually (screenshot) that the text truncates with an ellipsis instead of wrapping or overflowing. Delete the scratch files when done — this step produces no artifact in the repo.

- [ ] **Step 3: Run the full test suite**

Run: `bash scripts/run-with-mise.sh yarn test`
Expected: exits 0 (this change has no dedicated automated test per the "No automated test" note above — the full suite here is a blast-radius check, confirming this one-line CSS addition didn't break anything else).

- [ ] **Step 4: Commit**

```bash
git add src/main.ts
git commit -m "fix(hud): add ellipsis/nowrap protection to the gold button (#437)

Defensive hardening, not the root cause of the reported screenshot
(that's the service worker cache fix). goldBtn was the one yieldsRow
child still missing the min-width:0/ellipsis pattern b6c5cd0 already
established for sciSpan."
```

---

## Final verification checklist (run after all tasks complete)

- [ ] `bash scripts/run-with-mise.sh yarn build` exits 0 and prints the sw.js version-stamp line.
- [ ] `bash scripts/run-with-mise.sh yarn test` exits 0.
- [ ] `grep "CACHE_NAME" dist/sw.js` (after a build) shows a stamped version, not `conquestoria-dev` or `conquestoria-v1`.
- [ ] `git diff` (against the correct merge-base — check with `git merge-base HEAD origin/main` first, since origin/main may have moved, per `spec-fidelity.md`) shows only `public/sw.js`, `scripts/version-sw-cache.mjs`, `package.json`, `src/main.ts`, and the two test files changed.
