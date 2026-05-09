# Tauri macOS App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dual-release Tauri macOS target that produces an unsigned `.app` and `.dmg` while preserving the existing GitHub Pages/PWA release.

**Architecture:** Keep `src/` as the shared browser-first game. Add a small `src/platform/` capability boundary for distribution differences, and keep Tauri-specific Rust/config/package behavior in `src-tauri/`. Web builds keep `/conquestoria/`; Tauri builds use relative assets and skip the web service worker.

**Tech Stack:** TypeScript, Vite, Vitest, Playwright for web smoke testing, Tauri v2, Rust/Cargo, macOS `.app`/`.dmg` bundling.

---

## Source References

- Approved design: `docs/superpowers/specs/2026-05-09-tauri-macos-app-design.md`
- Repo rules: `AGENTS.md`, `CLAUDE.md`, `.claude/rules/ui-panels.md`, `.claude/rules/end-to-end-wiring.md`, `.claude/rules/spec-fidelity.md`
- Tauri config docs: https://v2.tauri.app/reference/config/
- Tauri CLI docs: https://v2.tauri.app/reference/cli/
- Tauri dialog plugin docs: https://v2.tauri.app/plugin/dialog/
- Tauri filesystem plugin docs: https://v2.tauri.app/plugin/file-system/
- Tauri DMG docs: https://v2.tauri.app/distribute/dmg/
- Tauri WebDriver limitation: https://v2.tauri.app/develop/tests/webdriver/

## File Structure

- Create `src/vite-env.d.ts`: Vite env type declarations.
- Create `src/platform/distribution.ts`: shared distribution detection and service-worker eligibility.
- Create `src/platform/service-worker.ts`: service-worker registration wrapper.
- Create `src/platform/save-file-adapter.ts`: save file adapter interface and runtime adapter loader.
- Create `src/platform/browser-save-file-adapter.ts`: browser download/file-input implementation.
- Create `src/platform/tauri-save-file-adapter.ts`: Tauri dialog/filesystem implementation.
- Create `src/storage/save-file-transfer.ts`: save serialization, parsing, export/import orchestration.
- Modify `src/ui/save-panel.ts`: route Import/Export buttons through save transfer functions.
- Modify `src/main.ts`: call service-worker wrapper and keep imported saves on the existing load path.
- Modify `vite.config.ts`: make base path depend on distribution mode.
- Modify `package.json`: add desktop build scripts and dependencies.
- Create `src-tauri/**`: Tauri config, Rust shell, capabilities, and icon files generated in Task 6.
- Create `scripts/generate-tauri-icon.mjs`: deterministic icon asset generation.
- Create `scripts/check-tauri-macos-artifacts.mjs`: artifact verification.
- Create `tests/platform/*.test.ts`: distribution, service worker, adapters.
- Create `tests/storage/save-file-transfer.test.ts`: save import/export contracts.
- Modify `tests/ui/save-panel.test.ts`: visible import/export behavior.
- Create `tests/e2e/web-smoke.spec.ts`: automated web smoke test.
- Create `playwright.config.ts`: web smoke runner config.
- Modify `AGENTS.md`: dual-release architecture guardrails.
- Modify `README.md` or add `docs/macos-app.md`: dual-release commands and limitations.

## Commit Plan

Use one commit per task. Do not stage unrelated dirty work already present in the worktree. Before each commit, run `git diff --stat` and `git diff --cached --stat` to verify the staged scope.

---

### Task 1: Distribution Mode And Vite Base

**Files:**
- Create: `src/vite-env.d.ts`
- Create: `src/platform/distribution.ts`
- Create: `tests/platform/distribution.test.ts`
- Create: `tests/platform/vite-config.test.ts`
- Modify: `vite.config.ts`

- [ ] **Step 1: Read required rules**

Run:

```bash
sed -n '1,220p' .claude/rules/end-to-end-wiring.md
sed -n '1,220p' .claude/rules/spec-fidelity.md
```

Expected: both files print successfully. Keep the rules in mind for every later task.

- [ ] **Step 2: Write failing distribution tests**

Create `tests/platform/distribution.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { resolveDistribution, shouldRegisterServiceWorker } from '@/platform/distribution';

describe('distribution platform detection', () => {
  it('defaults to the web distribution', () => {
    expect(resolveDistribution({})).toBe('web');
  });

  it('uses the tauri distribution when Vite mode marks it', () => {
    expect(resolveDistribution({ VITE_CONQUESTORIA_DISTRIBUTION: 'tauri' })).toBe('tauri');
  });

  it('uses the tauri distribution when Tauri build env vars are present', () => {
    expect(resolveDistribution({ TAURI_ENV_PLATFORM: 'darwin' })).toBe('tauri');
  });

  it('registers service workers only for the web distribution with browser support', () => {
    expect(shouldRegisterServiceWorker('web', { serviceWorker: {} })).toBe(true);
    expect(shouldRegisterServiceWorker('tauri', { serviceWorker: {} })).toBe(false);
    expect(shouldRegisterServiceWorker('web', {})).toBe(false);
  });
});
```

Create `tests/platform/vite-config.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { UserConfig } from 'vite';
import viteConfig from '../../vite.config';

function resolveConfig(mode: string): UserConfig {
  if (typeof viteConfig === 'function') {
    return viteConfig({
      mode,
      command: 'build',
      isSsrBuild: false,
      isPreview: false,
    }) as UserConfig;
  }
  return viteConfig as UserConfig;
}

describe('vite distribution config', () => {
  it('keeps the GitHub Pages base for normal web builds', () => {
    expect(resolveConfig('production').base).toBe('/conquestoria/');
  });

  it('uses relative assets for Tauri builds', () => {
    expect(resolveConfig('tauri').base).toBe('./');
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/platform/distribution.test.ts tests/platform/vite-config.test.ts
```

Expected: FAIL because `@/platform/distribution` does not exist and `vite.config.ts` does not yet expose mode-specific `base`.

- [ ] **Step 4: Add Vite env types**

Create `src/vite-env.d.ts`:

```ts
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CONQUESTORIA_DISTRIBUTION?: 'web' | 'tauri';
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
```

- [ ] **Step 5: Add distribution helper**

Create `src/platform/distribution.ts`:

```ts
export type Distribution = 'web' | 'tauri';

type DistributionEnv = Partial<Record<'VITE_CONQUESTORIA_DISTRIBUTION' | 'TAURI_ENV_PLATFORM', string>>;
type NavigatorLike = Pick<Navigator, 'serviceWorker'> | Record<string, unknown>;

export function resolveDistribution(env: DistributionEnv = import.meta.env): Distribution {
  if (env.VITE_CONQUESTORIA_DISTRIBUTION === 'tauri') {
    return 'tauri';
  }

  if (env.TAURI_ENV_PLATFORM) {
    return 'tauri';
  }

  return 'web';
}

export function getDistribution(): Distribution {
  return resolveDistribution(import.meta.env);
}

export function isTauriDistribution(): boolean {
  return getDistribution() === 'tauri';
}

export function shouldRegisterServiceWorker(
  distribution: Distribution = getDistribution(),
  navigatorLike: NavigatorLike = navigator,
): boolean {
  return distribution === 'web' && 'serviceWorker' in navigatorLike;
}
```

- [ ] **Step 6: Make Vite base distribution-aware**

Replace `vite.config.ts` with:

```ts
import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig(({ mode }) => {
  const isTauri = mode === 'tauri' || process.env.TAURI_ENV_PLATFORM !== undefined;

  return {
    base: isTauri ? './' : '/conquestoria/',
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: true,
    },
    test: {
      globals: true,
      environment: 'node',
      exclude: ['**/node_modules/**', '**/.worktrees/**', '**/.claude/worktrees/**'],
    },
  };
});
```

- [ ] **Step 7: Run tests and source rule check**

Run:

```bash
scripts/check-src-rule-violations.sh src/platform/distribution.ts src/vite-env.d.ts
./scripts/run-with-mise.sh yarn test --run tests/platform/distribution.test.ts tests/platform/vite-config.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

Run:

```bash
git add src/vite-env.d.ts src/platform/distribution.ts tests/platform/distribution.test.ts tests/platform/vite-config.test.ts vite.config.ts
git commit -m "feat: add distribution-aware vite mode"
```

Expected: commit succeeds with only these files staged.

---

### Task 2: Service Worker Boundary

**Files:**
- Create: `src/platform/service-worker.ts`
- Create: `tests/platform/service-worker.test.ts`
- Modify: `src/main.ts`

- [ ] **Step 1: Read UI rules**

Run:

```bash
sed -n '1,220p' .claude/rules/ui-panels.md
```

Expected: file prints successfully. This task touches `src/main.ts`.

- [ ] **Step 2: Write failing service-worker tests**

Create `tests/platform/service-worker.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { registerConquestoriaServiceWorker } from '@/platform/service-worker';

describe('registerConquestoriaServiceWorker', () => {
  it('registers the GitHub Pages service worker for web builds', async () => {
    const register = vi.fn().mockResolvedValue(undefined);

    await registerConquestoriaServiceWorker('web', {
      serviceWorker: { register },
    } as unknown as Navigator);

    expect(register).toHaveBeenCalledWith('/conquestoria/sw.js');
  });

  it('skips service worker registration for Tauri builds', async () => {
    const register = vi.fn().mockResolvedValue(undefined);

    await registerConquestoriaServiceWorker('tauri', {
      serviceWorker: { register },
    } as unknown as Navigator);

    expect(register).not.toHaveBeenCalled();
  });

  it('swallows registration failures so the game can continue', async () => {
    const register = vi.fn().mockRejectedValue(new Error('offline'));

    await expect(registerConquestoriaServiceWorker('web', {
      serviceWorker: { register },
    } as unknown as Navigator)).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/platform/service-worker.test.ts
```

Expected: FAIL because `@/platform/service-worker` does not exist.

- [ ] **Step 4: Add service-worker wrapper**

Create `src/platform/service-worker.ts`:

```ts
import { type Distribution, getDistribution, shouldRegisterServiceWorker } from './distribution';

export async function registerConquestoriaServiceWorker(
  distribution: Distribution = getDistribution(),
  navigatorLike: Navigator = navigator,
): Promise<void> {
  if (!shouldRegisterServiceWorker(distribution, navigatorLike)) {
    return;
  }

  try {
    await navigatorLike.serviceWorker.register('/conquestoria/sw.js');
  } catch {
    // Service worker registration is a web-only enhancement. The game still runs without it.
  }
}
```

- [ ] **Step 5: Wire main through the wrapper**

In `src/main.ts`, add:

```ts
import { registerConquestoriaServiceWorker } from '@/platform/service-worker';
```

Then replace the service-worker block in `init()`:

```ts
  // Register service worker
  if ('serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register('/conquestoria/sw.js');
    } catch {
      // SW registration failed — game still works
    }
  }
```

with:

```ts
  await registerConquestoriaServiceWorker();
```

- [ ] **Step 6: Run targeted checks**

Run:

```bash
scripts/check-src-rule-violations.sh src/platform/service-worker.ts src/main.ts
./scripts/run-with-mise.sh yarn test --run tests/platform/service-worker.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```bash
git add src/platform/service-worker.ts tests/platform/service-worker.test.ts src/main.ts
git commit -m "fix: isolate web service worker registration"
```

Expected: commit succeeds.

---

### Task 3: Save File Codec And Platform Interface

**Files:**
- Create: `src/platform/save-file-adapter.ts`
- Create: `src/storage/save-file-transfer.ts`
- Create: `tests/storage/save-file-transfer.test.ts`

- [ ] **Step 1: Write failing save transfer tests**

Create `tests/storage/save-file-transfer.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SaveFileAdapter } from '@/platform/save-file-adapter';
import {
  exportMostRecentAutoSave,
  importSaveFromFile,
  parseSaveFile,
  serializeSaveFile,
} from '@/storage/save-file-transfer';

const mocks = vi.hoisted(() => ({
  loadAutoSave: vi.fn(),
}));

vi.mock('@/storage/save-manager', () => ({
  loadAutoSave: mocks.loadAutoSave,
}));

function makeState(turn: number = 7): any {
  return {
    turn,
    currentPlayer: 'player',
    civilizations: {
      player: { civType: 'egypt' },
    },
    cities: {},
    units: {},
    map: { width: 1, height: 1, tiles: [], wrapsHorizontally: false },
  };
}

function makeAdapter(overrides: Partial<SaveFileAdapter> = {}): SaveFileAdapter {
  return {
    exportText: vi.fn(async () => ({ status: 'success' })),
    importText: vi.fn(async () => ({ status: 'success', text: serializeSaveFile(makeState(11)) })),
    ...overrides,
  };
}

describe('save-file-transfer', () => {
  beforeEach(() => {
    mocks.loadAutoSave.mockReset();
  });

  it('serializes saves as stable JSON text', () => {
    const text = serializeSaveFile(makeState(9));
    expect(JSON.parse(text).turn).toBe(9);
    expect(text.endsWith('\n')).toBe(true);
  });

  it('parses valid save JSON', () => {
    const parsed = parseSaveFile(serializeSaveFile(makeState(12)));
    expect(parsed.status).toBe('success');
    if (parsed.status === 'success') {
      expect(parsed.state.turn).toBe(12);
    }
  });

  it('rejects invalid JSON with a clear error', () => {
    expect(parseSaveFile('{not-json')).toEqual({
      status: 'error',
      message: 'Invalid save file: JSON could not be parsed.',
    });
  });

  it('rejects JSON that is not a game save shape', () => {
    expect(parseSaveFile(JSON.stringify({ hello: 'world' }))).toEqual({
      status: 'error',
      message: 'Invalid save file: missing required game state fields.',
    });
  });

  it('exports the most recent autosave through the injected adapter', async () => {
    const adapter = makeAdapter();
    mocks.loadAutoSave.mockResolvedValue(makeState(14));

    const result = await exportMostRecentAutoSave(adapter);

    expect(result).toEqual({ status: 'success' });
    expect(adapter.exportText).toHaveBeenCalledWith(
      'conquestoria-save-turn14.json',
      serializeSaveFile(makeState(14)),
    );
  });

  it('returns an error when there is no autosave to export', async () => {
    mocks.loadAutoSave.mockResolvedValue(undefined);

    await expect(exportMostRecentAutoSave(makeAdapter())).resolves.toEqual({
      status: 'error',
      message: 'No save to export.',
    });
  });

  it('imports valid save text through the injected adapter', async () => {
    const adapter = makeAdapter({
      importText: vi.fn(async () => ({ status: 'success', text: serializeSaveFile(makeState(21)) })),
    });

    const result = await importSaveFromFile(adapter);

    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.state.turn).toBe(21);
    }
  });

  it('passes canceled import through without an error', async () => {
    const adapter = makeAdapter({
      importText: vi.fn(async () => ({ status: 'cancelled' })),
    });

    await expect(importSaveFromFile(adapter)).resolves.toEqual({ status: 'cancelled' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/storage/save-file-transfer.test.ts
```

Expected: FAIL because the transfer modules do not exist.

- [ ] **Step 3: Add save adapter interface**

Create `src/platform/save-file-adapter.ts`:

```ts
export type SaveFileWriteResult =
  | { status: 'success' }
  | { status: 'cancelled' }
  | { status: 'error'; message: string };

export type SaveFileReadResult =
  | { status: 'success'; text: string }
  | { status: 'cancelled' }
  | { status: 'error'; message: string };

export interface SaveFileAdapter {
  exportText(filename: string, text: string): Promise<SaveFileWriteResult>;
  importText(): Promise<SaveFileReadResult>;
}
```

- [ ] **Step 4: Add save transfer orchestration**

Create `src/storage/save-file-transfer.ts`:

```ts
import type { GameState } from '@/core/types';
import { loadAutoSave } from '@/storage/save-manager';
import type { SaveFileAdapter, SaveFileReadResult, SaveFileWriteResult } from '@/platform/save-file-adapter';

export type SaveFileParseResult =
  | { status: 'success'; state: GameState }
  | { status: 'error'; message: string };

export type SaveFileImportResult =
  | { status: 'success'; state: GameState }
  | { status: 'cancelled' }
  | { status: 'error'; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isGameStateShape(value: unknown): value is GameState {
  return isRecord(value)
    && typeof value.turn === 'number'
    && typeof value.currentPlayer === 'string'
    && isRecord(value.civilizations);
}

export function serializeSaveFile(state: GameState): string {
  return `${JSON.stringify(state, null, 2)}\n`;
}

export function parseSaveFile(raw: string): SaveFileParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { status: 'error', message: 'Invalid save file: JSON could not be parsed.' };
  }

  if (!isGameStateShape(parsed)) {
    return { status: 'error', message: 'Invalid save file: missing required game state fields.' };
  }

  return { status: 'success', state: parsed };
}

export async function exportMostRecentAutoSave(adapter: SaveFileAdapter): Promise<SaveFileWriteResult> {
  const state = await loadAutoSave();
  if (!state) {
    return { status: 'error', message: 'No save to export.' };
  }

  return adapter.exportText(`conquestoria-save-turn${state.turn}.json`, serializeSaveFile(state));
}

export async function importSaveFromFile(adapter: SaveFileAdapter): Promise<SaveFileImportResult> {
  const imported: SaveFileReadResult = await adapter.importText();
  if (imported.status !== 'success') {
    return imported;
  }

  return parseSaveFile(imported.text);
}
```

- [ ] **Step 5: Run targeted checks**

Run:

```bash
scripts/check-src-rule-violations.sh src/platform/save-file-adapter.ts src/storage/save-file-transfer.ts
./scripts/run-with-mise.sh yarn test --run tests/storage/save-file-transfer.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add src/platform/save-file-adapter.ts src/storage/save-file-transfer.ts tests/storage/save-file-transfer.test.ts
git commit -m "feat: add save file transfer boundary"
```

Expected: commit succeeds.

---

### Task 4: Browser Adapter And Save Panel Wiring

**Files:**
- Create: `src/platform/browser-save-file-adapter.ts`
- Modify: `src/platform/save-file-adapter.ts`
- Modify: `src/ui/save-panel.ts`
- Modify: `tests/ui/save-panel.test.ts`

**Player Truth Table:**

| Before | Action | Immediate visible result |
|---|---|---|
| Start save panel shows Backup & Restore buttons | Click `Export Save` and no autosave exists | Panel remains open and the player sees `No save to export.` |
| Start save panel shows Backup & Restore buttons | Click `Import Save` and choose a valid save | Panel closes, the normal imported-save callback starts the game |
| Start save panel shows Backup & Restore buttons | Click `Import Save` and cancel the picker | Panel remains open with no warning |
| Start save panel shows Backup & Restore buttons | Click `Import Save` and choose invalid data | Panel remains open and the player sees the invalid-save message |

**Misleading UI Risks:**

- `Export Save` must not imply success when no autosave exists.
- `Import Save` cancellation must not look like a corrupt file.
- Native and browser import paths must produce the same callback state shape.

**Interaction Replay Checklist:**

- Click export with no save.
- Click import and cancel.
- Click import with invalid data.
- Click import with valid data.
- Reopen the save panel after a failed import and confirm buttons still exist.

- [ ] **Step 1: Extend save-panel mocks and add failing UI tests**

In `tests/ui/save-panel.test.ts`, extend the hoisted mocks:

```ts
const mocks = vi.hoisted(() => ({
  listSaves: vi.fn(),
  hasAutoSave: vi.fn(),
  loadAutoSave: vi.fn(),
  deleteSaveEntry: vi.fn(),
  renameSave: vi.fn(),
  getSaveFileAdapter: vi.fn(),
  exportMostRecentAutoSave: vi.fn(),
  importSaveFromFile: vi.fn(),
}));
```

Add this mock before importing `createSavePanel`:

```ts
vi.mock('@/platform/save-file-adapter', () => ({
  getSaveFileAdapter: mocks.getSaveFileAdapter,
}));

vi.mock('@/storage/save-file-transfer', () => ({
  exportMostRecentAutoSave: mocks.exportMostRecentAutoSave,
  importSaveFromFile: mocks.importSaveFromFile,
}));
```

Reset the new mocks in `beforeEach()`:

```ts
mocks.getSaveFileAdapter.mockReset();
mocks.exportMostRecentAutoSave.mockReset();
mocks.importSaveFromFile.mockReset();
mocks.getSaveFileAdapter.mockResolvedValue({ adapter: 'mock' });
```

Append these tests:

```ts
it('shows an inline error when exporting without an available save', async () => {
  const container = mountContainer();
  mocks.hasAutoSave.mockResolvedValue(false);
  mocks.listSaves.mockResolvedValue([]);
  mocks.exportMostRecentAutoSave.mockResolvedValue({ status: 'error', message: 'No save to export.' });

  await createSavePanel(container, {
    onNewGame: () => {},
    onContinue: () => {},
    onLoadSlot: () => {},
  });

  (document.querySelector('#btn-export-save') as HTMLButtonElement).click();
  await new Promise(resolve => setTimeout(resolve, 0));

  expect(document.body.textContent).toContain('No save to export.');
  expect(document.querySelector('#save-panel')).not.toBeNull();
});

it('keeps the panel open without an error when import is cancelled', async () => {
  const container = mountContainer();
  mocks.hasAutoSave.mockResolvedValue(false);
  mocks.listSaves.mockResolvedValue([]);
  mocks.importSaveFromFile.mockResolvedValue({ status: 'cancelled' });

  await createSavePanel(container, {
    onNewGame: () => {},
    onContinue: () => {},
    onLoadSlot: () => {},
  });

  (document.querySelector('#btn-import-save') as HTMLButtonElement).click();
  await new Promise(resolve => setTimeout(resolve, 0));

  expect(document.querySelector('#save-panel')).not.toBeNull();
  expect(document.querySelector('#save-panel-status')?.textContent).toBe('');
});

it('keeps the panel open and shows an error when import data is invalid', async () => {
  const container = mountContainer();
  mocks.hasAutoSave.mockResolvedValue(false);
  mocks.listSaves.mockResolvedValue([]);
  mocks.importSaveFromFile.mockResolvedValue({
    status: 'error',
    message: 'Invalid save file: missing required game state fields.',
  });

  await createSavePanel(container, {
    onNewGame: () => {},
    onContinue: () => {},
    onLoadSlot: () => {},
  });

  (document.querySelector('#btn-import-save') as HTMLButtonElement).click();
  await new Promise(resolve => setTimeout(resolve, 0));

  expect(document.querySelector('#save-panel')).not.toBeNull();
  expect(document.body.textContent).toContain('Invalid save file: missing required game state fields.');
});

it('imports a valid save through the shared callback and closes the panel', async () => {
  const container = mountContainer();
  const onImportSave = vi.fn();
  const importedState = {
    turn: 30,
    currentPlayer: 'player',
    civilizations: { player: { civType: 'egypt' } },
  } as any;
  mocks.hasAutoSave.mockResolvedValue(false);
  mocks.listSaves.mockResolvedValue([]);
  mocks.importSaveFromFile.mockResolvedValue({ status: 'success', state: importedState });

  await createSavePanel(container, {
    onNewGame: () => {},
    onContinue: () => {},
    onLoadSlot: () => {},
    onImportSave,
  });

  (document.querySelector('#btn-import-save') as HTMLButtonElement).click();
  await new Promise(resolve => setTimeout(resolve, 0));

  expect(onImportSave).toHaveBeenCalledWith(importedState);
  expect(document.querySelector('#save-panel')).toBeNull();
});
```

- [ ] **Step 2: Run UI tests to verify failure**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/save-panel.test.ts
```

Expected: FAIL because `getSaveFileAdapter`, `exportMostRecentAutoSave`, and `importSaveFromFile` are not wired into `save-panel.ts`.

- [ ] **Step 3: Add browser adapter**

Create `src/platform/browser-save-file-adapter.ts`:

```ts
import type { SaveFileAdapter, SaveFileReadResult, SaveFileWriteResult } from './save-file-adapter';

export function createBrowserSaveFileAdapter(documentRef: Document = document): SaveFileAdapter {
  return {
    async exportText(filename: string, text: string): Promise<SaveFileWriteResult> {
      const blob = new Blob([text], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = documentRef.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);
      return { status: 'success' };
    },

    async importText(): Promise<SaveFileReadResult> {
      return new Promise(resolve => {
        const input = documentRef.createElement('input');
        input.type = 'file';
        input.accept = '.json,application/json';
        input.addEventListener('change', () => {
          const file = input.files?.[0];
          if (!file) {
            resolve({ status: 'cancelled' });
            return;
          }

          const reader = new FileReader();
          reader.onload = event => {
            resolve({ status: 'success', text: String(event.target?.result ?? '') });
          };
          reader.onerror = () => {
            resolve({ status: 'error', message: 'Save file could not be read.' });
          };
          reader.readAsText(file);
        }, { once: true });
        input.click();
      });
    },
  };
}
```

- [ ] **Step 4: Add runtime adapter loader**

Modify `src/platform/save-file-adapter.ts` to include the existing exported types plus:

```ts
import { isTauriDistribution } from './distribution';
import { createBrowserSaveFileAdapter } from './browser-save-file-adapter';

export async function getSaveFileAdapter(): Promise<SaveFileAdapter> {
  if (isTauriDistribution()) {
    const { createTauriSaveFileAdapter } = await import('./tauri-save-file-adapter');
    return createTauriSaveFileAdapter();
  }

  return createBrowserSaveFileAdapter();
}
```

- [ ] **Step 5: Wire save panel to transfer boundary**

In `src/ui/save-panel.ts`, replace:

```ts
import { listSaves, deleteSaveEntry, hasAutoSave, loadAutoSave } from '@/storage/save-manager';
```

with:

```ts
import { listSaves, deleteSaveEntry, hasAutoSave } from '@/storage/save-manager';
import { getSaveFileAdapter } from '@/platform/save-file-adapter';
import { exportMostRecentAutoSave, importSaveFromFile } from '@/storage/save-file-transfer';
```

Inside `createSavePanel`, after `container.appendChild(panel);`, add:

```ts
  const status = panel.querySelector('#save-panel-status');
  const setStatus = (message: string): void => {
    if (status) {
      status.textContent = message;
    }
  };
```

In `renderBackupButtons()`, add a status node after the buttons:

```ts
      <div id="save-panel-status" style="min-height:16px;margin-top:8px;text-align:center;font-size:11px;color:#f0a060;"></div>
```

Replace the current export click handler with:

```ts
  panel.querySelector('#btn-export-save')?.addEventListener('click', async () => {
    setStatus('');
    const adapter = await getSaveFileAdapter();
    const result = await exportMostRecentAutoSave(adapter);
    if (result.status === 'error') {
      setStatus(result.message);
    }
  });
```

Replace the current import click handler with:

```ts
  panel.querySelector('#btn-import-save')?.addEventListener('click', async () => {
    setStatus('');
    const adapter = await getSaveFileAdapter();
    const result = await importSaveFromFile(adapter);
    if (result.status === 'cancelled') {
      return;
    }
    if (result.status === 'error') {
      setStatus(result.message);
      return;
    }
    panel.remove();
    callbacks.onImportSave?.(result.state);
  });
```

- [ ] **Step 6: Run targeted checks**

Run:

```bash
scripts/check-src-rule-violations.sh src/platform/browser-save-file-adapter.ts src/platform/save-file-adapter.ts src/storage/save-file-transfer.ts src/ui/save-panel.ts
./scripts/run-with-mise.sh yarn test --run tests/storage/save-file-transfer.test.ts tests/ui/save-panel.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```bash
git add src/platform/browser-save-file-adapter.ts src/platform/save-file-adapter.ts src/ui/save-panel.ts tests/ui/save-panel.test.ts
git commit -m "feat: route save import export through platform adapter"
```

Expected: commit succeeds.

---

### Task 5: Tauri Scaffold, Plugins, And Native Save Adapter

**Files:**
- Create: `src/platform/tauri-save-file-adapter.ts`
- Create: `src/platform/desktop-menu.ts`
- Create: `tests/platform/tauri-save-file-adapter.test.ts`
- Create: `tests/platform/desktop-menu.test.ts`
- Create: `src-tauri/Cargo.toml`
- Create: `src-tauri/build.rs`
- Create: `src-tauri/tauri.conf.json`
- Create: `src-tauri/src/main.rs`
- Create: `src-tauri/src/lib.rs`
- Create: `src-tauri/capabilities/default.json`
- Modify: `src/main.ts`
- Modify: `package.json`
- Modify: `yarn.lock`

- [ ] **Step 1: Add Tauri dependencies**

Run:

```bash
./scripts/run-with-mise.sh yarn add @tauri-apps/api@latest @tauri-apps/plugin-dialog@latest @tauri-apps/plugin-fs@latest
./scripts/run-with-mise.sh yarn add -D @tauri-apps/cli@latest
```

Expected: `package.json` and `yarn.lock` update. Do not keep or stage `package-lock.json`.

- [ ] **Step 2: Add package scripts**

Modify `package.json` scripts to include:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "build:tauri": "tsc && vite build --mode tauri",
    "preview": "vite preview",
    "tauri:dev": "tauri dev",
    "tauri:build": "tauri build",
    "tauri:build:mac": "tauri build --bundles app,dmg",
    "setup:hooks": "git config core.hooksPath .githooks",
    "test": "vitest run && bash tests/hooks/run.sh",
    "test:hooks": "bash tests/hooks/run.sh",
    "test:watch": "vitest"
  }
}
```

Keep all existing dependency entries that were added by Yarn.

- [ ] **Step 3: Write failing Tauri adapter tests**

Create `tests/platform/tauri-save-file-adapter.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  open: vi.fn(),
  writeTextFile: vi.fn(),
  readTextFile: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({
  save: mocks.save,
  open: mocks.open,
}));

vi.mock('@tauri-apps/plugin-fs', () => ({
  writeTextFile: mocks.writeTextFile,
  readTextFile: mocks.readTextFile,
}));

import { createTauriSaveFileAdapter } from '@/platform/tauri-save-file-adapter';

describe('createTauriSaveFileAdapter', () => {
  beforeEach(() => {
    mocks.save.mockReset();
    mocks.open.mockReset();
    mocks.writeTextFile.mockReset();
    mocks.readTextFile.mockReset();
  });

  it('writes exported text to the path chosen by the native save dialog', async () => {
    mocks.save.mockResolvedValue('/Users/me/Desktop/save.json');
    const adapter = createTauriSaveFileAdapter();

    await expect(adapter.exportText('save.json', '{"turn":1}')).resolves.toEqual({ status: 'success' });

    expect(mocks.save).toHaveBeenCalledWith({
      defaultPath: 'save.json',
      filters: [{ name: 'Conquestoria Save', extensions: ['json'] }],
    });
    expect(mocks.writeTextFile).toHaveBeenCalledWith('/Users/me/Desktop/save.json', '{"turn":1}');
  });

  it('reports export cancellation without writing a file', async () => {
    mocks.save.mockResolvedValue(null);
    const adapter = createTauriSaveFileAdapter();

    await expect(adapter.exportText('save.json', '{}')).resolves.toEqual({ status: 'cancelled' });
    expect(mocks.writeTextFile).not.toHaveBeenCalled();
  });

  it('reads imported text from the path chosen by the native open dialog', async () => {
    mocks.open.mockResolvedValue('/Users/me/Desktop/save.json');
    mocks.readTextFile.mockResolvedValue('{"turn":2}');
    const adapter = createTauriSaveFileAdapter();

    await expect(adapter.importText()).resolves.toEqual({ status: 'success', text: '{"turn":2}' });

    expect(mocks.open).toHaveBeenCalledWith({
      multiple: false,
      directory: false,
      filters: [{ name: 'Conquestoria Save', extensions: ['json'] }],
    });
    expect(mocks.readTextFile).toHaveBeenCalledWith('/Users/me/Desktop/save.json');
  });

  it('reports import cancellation without reading a file', async () => {
    mocks.open.mockResolvedValue(null);
    const adapter = createTauriSaveFileAdapter();

    await expect(adapter.importText()).resolves.toEqual({ status: 'cancelled' });
    expect(mocks.readTextFile).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/platform/tauri-save-file-adapter.test.ts
```

Expected: FAIL because `src/platform/tauri-save-file-adapter.ts` does not exist.

- [ ] **Step 5: Add Tauri save adapter**

Create `src/platform/tauri-save-file-adapter.ts`:

```ts
import { open, save } from '@tauri-apps/plugin-dialog';
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import type { SaveFileAdapter, SaveFileReadResult, SaveFileWriteResult } from './save-file-adapter';

const SAVE_FILTER = [{ name: 'Conquestoria Save', extensions: ['json'] }];

export function createTauriSaveFileAdapter(): SaveFileAdapter {
  return {
    async exportText(filename: string, text: string): Promise<SaveFileWriteResult> {
      try {
        const selectedPath = await save({
          defaultPath: filename,
          filters: SAVE_FILTER,
        });
        if (!selectedPath) {
          return { status: 'cancelled' };
        }

        await writeTextFile(selectedPath, text);
        return { status: 'success' };
      } catch {
        return { status: 'error', message: 'Save file could not be written.' };
      }
    },

    async importText(): Promise<SaveFileReadResult> {
      try {
        const selectedPath = await open({
          multiple: false,
          directory: false,
          filters: SAVE_FILTER,
        });
        if (!selectedPath || Array.isArray(selectedPath)) {
          return { status: 'cancelled' };
        }

        const text = await readTextFile(selectedPath);
        return { status: 'success', text };
      } catch {
        return { status: 'error', message: 'Save file could not be read.' };
      }
    },
  };
}
```

- [ ] **Step 6: Create Tauri Rust scaffold**

Create `src-tauri/Cargo.toml`:

```toml
[package]
name = "conquestoria"
version = "0.1.0"
description = "Conquestoria"
authors = ["Aaron Fleckenstein"]
edition = "2021"

[lib]
name = "conquestoria_lib"
crate-type = ["staticlib", "cdylib", "rlib"]

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri = { version = "2", features = [] }
tauri-plugin-dialog = "2"
tauri-plugin-fs = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
```

Create `src-tauri/build.rs`:

```rust
fn main() {
    tauri_build::build()
}
```

Create `src-tauri/src/main.rs`:

```rust
fn main() {
    conquestoria_lib::run()
}
```

Create `src-tauri/src/lib.rs`:

```rust
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .run(tauri::generate_context!())
        .expect("error while running Conquestoria");
}
```

- [ ] **Step 7: Add desktop menu initialization test**

Create `tests/platform/desktop-menu.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  isTauriDistribution: vi.fn(),
  defaultMenu: vi.fn(),
  setAsAppMenu: vi.fn(),
}));

vi.mock('@/platform/distribution', () => ({
  isTauriDistribution: mocks.isTauriDistribution,
}));

vi.mock('@tauri-apps/api/menu', () => ({
  Menu: {
    default: mocks.defaultMenu,
  },
}));

import { initializeDesktopMenu } from '@/platform/desktop-menu';

describe('initializeDesktopMenu', () => {
  beforeEach(() => {
    mocks.isTauriDistribution.mockReset();
    mocks.defaultMenu.mockReset();
    mocks.setAsAppMenu.mockReset();
    mocks.defaultMenu.mockResolvedValue({ setAsAppMenu: mocks.setAsAppMenu });
  });

  it('does nothing in the web distribution', async () => {
    mocks.isTauriDistribution.mockReturnValue(false);

    await initializeDesktopMenu();

    expect(mocks.defaultMenu).not.toHaveBeenCalled();
  });

  it('installs the default native app menu in the Tauri distribution', async () => {
    mocks.isTauriDistribution.mockReturnValue(true);

    await initializeDesktopMenu();

    expect(mocks.defaultMenu).toHaveBeenCalled();
    expect(mocks.setAsAppMenu).toHaveBeenCalled();
  });

  it('does not block startup when menu creation fails', async () => {
    mocks.isTauriDistribution.mockReturnValue(true);
    mocks.defaultMenu.mockRejectedValue(new Error('menu unavailable'));

    await expect(initializeDesktopMenu()).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 8: Run desktop menu test to verify it fails**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/platform/desktop-menu.test.ts
```

Expected: FAIL because `src/platform/desktop-menu.ts` does not exist.

- [ ] **Step 9: Add desktop menu initializer**

Create `src/platform/desktop-menu.ts`:

```ts
import { isTauriDistribution } from './distribution';

export async function initializeDesktopMenu(): Promise<void> {
  if (!isTauriDistribution()) {
    return;
  }

  try {
    const { Menu } = await import('@tauri-apps/api/menu');
    const menu = await Menu.default();
    await menu.setAsAppMenu();
  } catch {
    // Menu polish should not block the game from starting.
  }
}
```

- [ ] **Step 10: Call desktop menu initializer from main**

In `src/main.ts`, add:

```ts
import { initializeDesktopMenu } from '@/platform/desktop-menu';
```

Then add this line in `init()` immediately after `await registerConquestoriaServiceWorker();`:

```ts
  await initializeDesktopMenu();
```

- [ ] **Step 11: Create Tauri config and capability**

Create `src-tauri/tauri.conf.json`:

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "Conquestoria",
  "version": "0.1.0",
  "identifier": "com.conquestoria.app",
  "build": {
    "beforeDevCommand": {
      "cwd": "../",
      "script": "./scripts/run-with-mise.sh yarn dev --host 127.0.0.1",
      "wait": false
    },
    "beforeBuildCommand": {
      "cwd": "../",
      "script": "./scripts/run-with-mise.sh yarn build:tauri",
      "wait": true
    },
    "devUrl": "http://127.0.0.1:5173",
    "frontendDist": "../dist"
  },
  "app": {
    "windows": [
      {
        "label": "main",
        "title": "Conquestoria",
        "width": 1440,
        "height": 960,
        "minWidth": 1024,
        "minHeight": 720,
        "resizable": true,
        "fullscreen": false
      }
    ],
    "security": {
      "csp": null
    }
  },
  "bundle": {
    "active": true,
    "targets": ["app", "dmg"],
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ],
    "macOS": {
      "dmg": {
        "windowSize": {
          "width": 660,
          "height": 400
        },
        "appPosition": {
          "x": 180,
          "y": 220
        },
        "applicationFolderPosition": {
          "x": 480,
          "y": 220
        }
      }
    }
  }
}
```

Create `src-tauri/capabilities/default.json`:

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "main-capability",
  "description": "Desktop permissions for Conquestoria's main window",
  "windows": ["main"],
  "permissions": [
    "dialog:default",
    "fs:read-files",
    "fs:write-files"
  ]
}
```

- [ ] **Step 12: Run targeted checks**

Run:

```bash
scripts/check-src-rule-violations.sh src/platform/tauri-save-file-adapter.ts src/platform/desktop-menu.ts src/platform/save-file-adapter.ts src/main.ts
./scripts/run-with-mise.sh yarn test --run tests/platform/tauri-save-file-adapter.test.ts tests/platform/desktop-menu.test.ts tests/storage/save-file-transfer.test.ts tests/ui/save-panel.test.ts
./scripts/run-with-mise.sh yarn build:tauri
```

Expected: all commands PASS. `build:tauri` produces `dist` with relative asset references.

- [ ] **Step 13: Commit**

Run:

```bash
git add package.json yarn.lock src/platform/tauri-save-file-adapter.ts src/platform/desktop-menu.ts tests/platform/tauri-save-file-adapter.test.ts tests/platform/desktop-menu.test.ts src/main.ts src-tauri
git commit -m "feat: add tauri desktop shell"
```

Expected: commit succeeds.

---

### Task 6: Icon Pipeline, Bundle Scripts, And Artifact Check

**Files:**
- Create: `scripts/generate-tauri-icon.mjs`
- Create: `scripts/check-tauri-macos-artifacts.mjs`
- Modify: `package.json`
- Create/modify: `src-tauri/icons/**`

- [ ] **Step 1: Add deterministic icon generator**

Create `scripts/generate-tauri-icon.mjs`:

```js
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const iconDir = join(process.cwd(), 'src-tauri', 'icons');
mkdirSync(iconDir, { recursive: true });

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#1a1a2e"/>
      <stop offset="0.55" stop-color="#27496d"/>
      <stop offset="1" stop-color="#6b9b4b"/>
    </linearGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#f7d77a"/>
      <stop offset="1" stop-color="#b8832d"/>
    </linearGradient>
  </defs>
  <rect width="1024" height="1024" rx="220" fill="url(#sky)"/>
  <path d="M176 688 L512 264 L848 688 Z" fill="url(#gold)" stroke="#fff2b8" stroke-width="26" stroke-linejoin="round"/>
  <path d="M276 682 L512 388 L748 682 Z" fill="#1a1a2e" opacity="0.3"/>
  <path d="M196 746 H828" stroke="#e8c170" stroke-width="54" stroke-linecap="round"/>
  <circle cx="512" cy="512" r="88" fill="#e8c170" stroke="#fff2b8" stroke-width="18"/>
</svg>
`;

writeFileSync(join(iconDir, 'icon.svg'), svg);
console.log(`Wrote ${join(iconDir, 'icon.svg')}`);
console.log('Next: run `./scripts/run-with-mise.sh yarn tauri icon src-tauri/icons/icon.svg` to generate PNG, ICNS, and ICO outputs.');
```

- [ ] **Step 2: Generate icon assets**

Run:

```bash
node scripts/generate-tauri-icon.mjs
./scripts/run-with-mise.sh yarn tauri icon src-tauri/icons/icon.svg
```

Expected: `src-tauri/icons/icon.svg`, PNG icons, `icon.icns`, and `icon.ico` exist.

- [ ] **Step 3: Add artifact checker**

Create `scripts/check-tauri-macos-artifacts.mjs`:

```js
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const appPath = join(root, 'src-tauri', 'target', 'release', 'bundle', 'macos', 'Conquestoria.app');
const dmgDir = join(root, 'src-tauri', 'target', 'release', 'bundle', 'dmg');

const failures = [];

if (!existsSync(appPath)) {
  failures.push(`Missing app bundle: ${appPath}`);
}

let dmgFiles = [];
if (existsSync(dmgDir)) {
  dmgFiles = readdirSync(dmgDir).filter(file => file.endsWith('.dmg'));
}

if (dmgFiles.length === 0) {
  failures.push(`Missing dmg artifact in: ${dmgDir}`);
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log(`Found app bundle: ${appPath}`);
console.log(`Found dmg artifact(s): ${dmgFiles.join(', ')}`);
```

- [ ] **Step 4: Add artifact check script**

Modify `package.json` scripts to include:

```json
"tauri:check:mac-artifacts": "node scripts/check-tauri-macos-artifacts.mjs"
```

- [ ] **Step 5: Build desktop artifacts and verify them**

Run:

```bash
./scripts/run-with-mise.sh yarn tauri:build:mac
./scripts/run-with-mise.sh yarn tauri:check:mac-artifacts
```

Expected: both commands PASS on macOS. The second command prints the `.app` path and at least one `.dmg` filename.

- [ ] **Step 6: Commit**

Run:

```bash
git add package.json scripts/generate-tauri-icon.mjs scripts/check-tauri-macos-artifacts.mjs src-tauri/icons
git commit -m "feat: add macos icon and artifact checks"
```

Expected: commit succeeds.

---

### Task 7: Automated Web Smoke

**Files:**
- Create: `playwright.config.ts`
- Create: `tests/e2e/web-smoke.spec.ts`
- Modify: `package.json`
- Modify: `yarn.lock`

- [ ] **Step 1: Add Playwright dependency**

Run:

```bash
./scripts/run-with-mise.sh yarn add -D @playwright/test@latest
```

Expected: `package.json` and `yarn.lock` update. Playwright is chosen because jsdom cannot prove that the real canvas app renders in a browser.

- [ ] **Step 2: Add Playwright config**

Create `playwright.config.ts`:

```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  webServer: {
    command: './scripts/run-with-mise.sh yarn dev --host 127.0.0.1',
    url: 'http://127.0.0.1:5173/conquestoria/',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  use: {
    baseURL: 'http://127.0.0.1:5173/conquestoria/',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
```

- [ ] **Step 3: Add web smoke test**

Create `tests/e2e/web-smoke.spec.ts`:

```ts
import { expect, test } from '@playwright/test';

test('web build renders the start surface and canvas', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('#game-canvas')).toBeVisible();
  await expect(page.locator('#ui-layer')).toBeVisible();
  await expect(page.getByRole('button', { name: 'New Game' })).toBeVisible();

  const canvasBox = await page.locator('#game-canvas').boundingBox();
  expect(canvasBox?.width).toBeGreaterThan(200);
  expect(canvasBox?.height).toBeGreaterThan(200);
});
```

- [ ] **Step 4: Add smoke script**

Modify `package.json` scripts to include:

```json
"test:web-smoke": "playwright test"
```

- [ ] **Step 5: Install browser runtime**

Run:

```bash
./scripts/run-with-mise.sh yarn playwright install chromium
```

Expected: Chromium browser dependency is installed for Playwright. If this command fails because of network sandboxing, rerun it with escalated permission in the implementation session.

- [ ] **Step 6: Run smoke test**

Run:

```bash
./scripts/run-with-mise.sh yarn test:web-smoke
```

Expected: PASS. The browser opens the app at `/conquestoria/`, sees the canvas, sees the UI layer, and sees `New Game`.

- [ ] **Step 7: Commit**

Run:

```bash
git add package.json yarn.lock playwright.config.ts tests/e2e/web-smoke.spec.ts
git commit -m "test: add web smoke coverage"
```

Expected: commit succeeds.

---

### Task 8: Repo Guidance And Release Docs

**Files:**
- Modify: `AGENTS.md`
- Modify: `README.md`

- [ ] **Step 1: Update AGENTS.md project structure**

In `AGENTS.md`, under `## Project Structure & Module Organization`, append:

```md
Platform and distribution-specific code lives outside the gameplay core. Use `src/platform/` for browser-vs-Tauri capability boundaries and `src-tauri/` for the macOS shell, bundle config, capabilities, icons, and Rust entrypoint. Shared systems, renderer, UI panels, save format, and storage logic must stay distribution-neutral.
```

- [ ] **Step 2: Update AGENTS.md commands**

In `AGENTS.md`, under `## Build, Test, and Development Commands`, add:

```md
Dual-release commands:

- `./scripts/run-with-mise.sh yarn build` builds the GitHub Pages/PWA release and must keep `/conquestoria/` asset paths.
- `./scripts/run-with-mise.sh yarn build:tauri` builds the frontend for the Tauri shell with relative asset paths.
- `./scripts/run-with-mise.sh yarn tauri:dev` starts the macOS app in development mode.
- `./scripts/run-with-mise.sh yarn tauri:build:mac` produces the personal unsigned macOS `.app` and `.dmg`.
- `./scripts/run-with-mise.sh yarn tauri:check:mac-artifacts` verifies the expected macOS bundle artifacts exist after a desktop build.
- `./scripts/run-with-mise.sh yarn test:web-smoke` runs the browser smoke test for the shared web frontend.
```

- [ ] **Step 3: Update AGENTS.md architecture notes**

In `AGENTS.md`, under `## Architecture Notes`, append:

```md
Dual-release rule: GitHub Pages/PWA and macOS/Tauri are distribution layers around one shared game. Do not fork gameplay, UI rules, renderer behavior, or save format for macOS. Release-specific behavior must enter shared code through a small capability interface in `src/platform/`; shared modules must not directly import Tauri APIs or branch on Tauri/macOS globals. If a native-only feature is requested, first decide whether it belongs in the platform layer, a shared capability interface, or a deferred desktop-specific feature.
```

- [ ] **Step 4: Update AGENTS.md verification**

In `AGENTS.md`, under `## Required Verification`, add:

```md
When touching `src/platform/**`, `src-tauri/**`, Vite distribution config, service worker registration, or save import/export:

- run `scripts/check-src-rule-violations.sh` for any changed `src/` files
- run the mirrored platform/storage/UI tests
- run `./scripts/run-with-mise.sh yarn build`
- run `./scripts/run-with-mise.sh yarn build:tauri`
- if Tauri packaging changed, run `./scripts/run-with-mise.sh yarn tauri:build:mac` and `./scripts/run-with-mise.sh yarn tauri:check:mac-artifacts`

Before claiming dual-release work is complete, confirm the web build still uses `/conquestoria/` and the Tauri build uses relative asset paths.
```

- [ ] **Step 5: Add README release section**

Append to `README.md`:

```md
## Dual Release

Conquestoria has two supported local build targets:

- Web/PWA for GitHub Pages and iPad play.
- Personal unsigned macOS app built with Tauri.

Use the web build for GitHub Pages:

```bash
./scripts/run-with-mise.sh yarn build
```

Use the desktop frontend build for Tauri:

```bash
./scripts/run-with-mise.sh yarn build:tauri
```

Run the macOS app in development:

```bash
./scripts/run-with-mise.sh yarn tauri:dev
```

Build the personal macOS app and DMG:

```bash
./scripts/run-with-mise.sh yarn tauri:build:mac
./scripts/run-with-mise.sh yarn tauri:check:mac-artifacts
```

The macOS build is unsigned and not notarized. It is intended for local personal use, not public distribution. Gameplay, save data, rendering, and UI behavior should remain shared between the web/PWA and macOS releases.
```

- [ ] **Step 6: Run documentation diff check**

Run:

```bash
git diff -- AGENTS.md README.md
```

Expected: diff contains only dual-release guidance and commands.

- [ ] **Step 7: Commit**

Run:

```bash
git add AGENTS.md README.md
git commit -m "docs: add dual-release guidance"
```

Expected: commit succeeds.

---

### Task 9: Final Verification

**Files:**
- No new files.
- Verify all files changed by previous tasks.

- [ ] **Step 1: Run targeted Vitest suites**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/platform/distribution.test.ts tests/platform/vite-config.test.ts tests/platform/service-worker.test.ts tests/platform/tauri-save-file-adapter.test.ts tests/storage/save-file-transfer.test.ts tests/ui/save-panel.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run source rule checks**

Run:

```bash
scripts/check-src-rule-violations.sh src/platform/distribution.ts src/platform/service-worker.ts src/platform/save-file-adapter.ts src/platform/browser-save-file-adapter.ts src/platform/tauri-save-file-adapter.ts src/storage/save-file-transfer.ts src/ui/save-panel.ts src/main.ts src/vite-env.d.ts
```

Expected: PASS.

- [ ] **Step 3: Run web and desktop frontend builds**

Run:

```bash
./scripts/run-with-mise.sh yarn build
./scripts/run-with-mise.sh yarn build:tauri
```

Expected: both commands PASS. Inspect `dist/index.html` after `yarn build` to confirm `/conquestoria/` paths; inspect after `yarn build:tauri` to confirm relative paths.

- [ ] **Step 4: Run web smoke**

Run:

```bash
./scripts/run-with-mise.sh yarn test:web-smoke
```

Expected: PASS.

- [ ] **Step 5: Run macOS packaging**

Run on macOS:

```bash
./scripts/run-with-mise.sh yarn tauri:build:mac
./scripts/run-with-mise.sh yarn tauri:check:mac-artifacts
```

Expected: PASS. The artifact checker prints a `Conquestoria.app` path and at least one `.dmg` file.

- [ ] **Step 6: Inspect full diff against base and local worktree**

Run:

```bash
git diff --stat origin/main...HEAD
git diff --stat
```

Expected: diffs show only intentional Tauri, platform, save import/export, tests, and docs work plus any unrelated pre-existing dirty files that were not staged by these tasks.

---

## Manual Acceptance Deferred To Maintainer

After the generated app is downloaded or installed on the maintainer's laptop, manually confirm:

- the app icon appears correctly in Finder and the DMG window
- the app launches despite being unsigned
- native Import/Export save dialogs work
- fullscreen can be entered and exited
- audio starts after normal user interaction
- the canvas is crisp and nonblank on the laptop display

These checks are not required as an implementation gate because macOS WKWebView automation is not supported by Tauri's desktop WebDriver path.
