# Fix #220: Worker "In Progress" Shows No Turns Remaining — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the player tries to move a worker that is mid-improvement, the warning panel shows how many turns the improvement will take to complete.

**Architecture:** Add a `turnsLeft: number` field to `WorkerTaskWarningPanelConfig`. Update the panel title to include turn count. Pass `tile.improvementTurnsLeft` from the call site in `main.ts`. The tile renderer already shows a hammer icon and turn count on in-progress tiles (`hex-renderer.ts` lines 256–264) — no renderer changes needed.

**Tech Stack:** TypeScript, jsdom/vitest

---

### Task 1: Write failing tests

**Files:**
- Modify: `tests/ui/worker-task-warning-panel.test.ts`

- [ ] **Step 1: Add two new tests to the existing `describe` block (before the closing `}`)**

```typescript
  it('shows turns remaining in the title', () => {
    createWorkerTaskWarningPanel(document.body, {
      improvementName: 'Farm',
      turnsLeft: 3,
      onConfirm: vi.fn(),
      onCancel: vi.fn(),
    });

    expect(document.body.textContent).toContain('3 turns remaining');
  });

  it('uses singular "turn" when only 1 turn remains', () => {
    createWorkerTaskWarningPanel(document.body, {
      improvementName: 'Mine',
      turnsLeft: 1,
      onConfirm: vi.fn(),
      onCancel: vi.fn(),
    });

    expect(document.body.textContent).toContain('1 turn remaining');
    expect(document.body.textContent).not.toContain('1 turns remaining');
  });
```

- [ ] **Step 2: Run the tests to confirm they fail**

```bash
bash scripts/run-with-mise.sh yarn test tests/ui/worker-task-warning-panel.test.ts
```

Expected: the two new tests `FAIL` — TypeScript compile error because `turnsLeft` is not in the config type.

---

### Task 2: Update the panel config and component

**Files:**
- Modify: `src/ui/worker-task-warning-panel.ts`

- [ ] **Step 3: Replace the file content**

Current content of `src/ui/worker-task-warning-panel.ts`:

```typescript
export interface WorkerTaskWarningPanelConfig {
  improvementName: string;
  onConfirm: () => void;
  onCancel: () => void;
}

import { createGameButton } from '@/ui/ui-kit';

export function createWorkerTaskWarningPanel(
  container: HTMLElement,
  config: WorkerTaskWarningPanelConfig,
): HTMLElement {
  container.querySelector('#worker-task-warning-panel')?.remove();
  let closed = false;
  const panel = document.createElement('div');
  panel.id = 'worker-task-warning-panel';
  panel.style.cssText = 'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:1000;background:rgba(18,18,18,0.96);border:1px solid rgba(255,255,255,0.25);border-radius:8px;padding:16px;max-width:360px;color:white;';

  const title = document.createElement('h3');
  title.textContent = `${config.improvementName} in progress`;
  const body = document.createElement('p');
  body.textContent = 'Moving this worker now means work in progress will be lost.';

  const buttonRow = document.createElement('div');
  buttonRow.style.cssText = 'display:flex;gap:8px;';

  const cancel = createGameButton('Keep working', 'ghost');
  cancel.addEventListener('click', () => {
    if (closed) return;
    closed = true;
    panel.remove();
    config.onCancel();
  });

  const confirm = createGameButton('Move anyway', 'danger');
  confirm.addEventListener('click', () => {
    if (closed) return;
    closed = true;
    panel.remove();
    config.onConfirm();
  });

  buttonRow.append(cancel, confirm);
  panel.append(title, body, buttonRow);
  container.appendChild(panel);
  return panel;
}
```

Replace with:

```typescript
export interface WorkerTaskWarningPanelConfig {
  improvementName: string;
  turnsLeft: number;
  onConfirm: () => void;
  onCancel: () => void;
}

import { createGameButton } from '@/ui/ui-kit';

export function createWorkerTaskWarningPanel(
  container: HTMLElement,
  config: WorkerTaskWarningPanelConfig,
): HTMLElement {
  container.querySelector('#worker-task-warning-panel')?.remove();
  let closed = false;
  const panel = document.createElement('div');
  panel.id = 'worker-task-warning-panel';
  panel.style.cssText = 'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:1000;background:rgba(18,18,18,0.96);border:1px solid rgba(255,255,255,0.25);border-radius:8px;padding:16px;max-width:360px;color:white;';

  const turnsLabel = config.turnsLeft === 1 ? '1 turn remaining' : `${config.turnsLeft} turns remaining`;
  const title = document.createElement('h3');
  title.textContent = `${config.improvementName} in progress — ${turnsLabel}`;
  const body = document.createElement('p');
  body.textContent = 'Moving this worker now means work in progress will be lost.';

  const buttonRow = document.createElement('div');
  buttonRow.style.cssText = 'display:flex;gap:8px;';

  const cancel = createGameButton('Keep working', 'ghost');
  cancel.addEventListener('click', () => {
    if (closed) return;
    closed = true;
    panel.remove();
    config.onCancel();
  });

  const confirm = createGameButton('Move anyway', 'danger');
  confirm.addEventListener('click', () => {
    if (closed) return;
    closed = true;
    panel.remove();
    config.onConfirm();
  });

  buttonRow.append(cancel, confirm);
  panel.append(title, body, buttonRow);
  container.appendChild(panel);
  return panel;
}
```

- [ ] **Step 4: Update all existing tests in `tests/ui/worker-task-warning-panel.test.ts` to pass `turnsLeft`**

Every existing call to `createWorkerTaskWarningPanel` in that file needs `turnsLeft: 2` added to the config (any non-zero value works for tests not checking the label):

Find each call like:
```typescript
createWorkerTaskWarningPanel(document.body, { improvementName: 'Farm', onConfirm, onCancel: vi.fn() });
```

Add `turnsLeft: 2`:
```typescript
createWorkerTaskWarningPanel(document.body, { improvementName: 'Farm', turnsLeft: 2, onConfirm, onCancel: vi.fn() });
```

There are 5 existing `createWorkerTaskWarningPanel` calls in that file (lines 13, 25, 46, 58, 67). Update all of them.

- [ ] **Step 5: Run the panel tests**

```bash
bash scripts/run-with-mise.sh yarn test tests/ui/worker-task-warning-panel.test.ts
```

Expected: all 7 tests `PASS`.

---

### Task 3: Update the call site in main.ts

**Files:**
- Modify: `src/main.ts` (lines ~1959–1976)

- [ ] **Step 6: Update the `createWorkerTaskWarningPanel` call to pass `turnsLeft`**

Find the call site (around line 1959):

```typescript
      if (isWorkerBusy(gameState, selectedUnitId)) {
        const selectedId = selectedUnitId;
        const task = gameState.units[selectedId]?.workerTask;
        createWorkerTaskWarningPanel(uiLayer, {
          improvementName: task ? getImprovementDisplayName(task.action) : 'Improvement',
          onCancel: () => selectUnit(selectedId),
          onConfirm: () => {
```

Replace with:

```typescript
      if (isWorkerBusy(gameState, selectedUnitId)) {
        const selectedId = selectedUnitId;
        const task = gameState.units[selectedId]?.workerTask;
        const taskTile = task ? gameState.map.tiles[hexKey(task.coord)] : undefined;
        createWorkerTaskWarningPanel(uiLayer, {
          improvementName: task ? getImprovementDisplayName(task.action) : 'Improvement',
          turnsLeft: taskTile?.improvementTurnsLeft ?? 1,
          onCancel: () => selectUnit(selectedId),
          onConfirm: () => {
```

- [ ] **Step 7: Run the full test suite**

```bash
bash scripts/run-with-mise.sh yarn test
```

Expected: all tests `PASS`.

- [ ] **Step 8: Commit**

```bash
git add src/ui/worker-task-warning-panel.ts src/main.ts tests/ui/worker-task-warning-panel.test.ts
git commit -m "fix(worker): show turns remaining in move-warning panel

The warning panel previously said 'Farm in progress' with no indication
of how long the build would take. Players had no basis for deciding
whether to keep working or move the unit.

Adds turnsLeft to WorkerTaskWarningPanelConfig and renders
'Farm in progress — 2 turns remaining' (singular/plural handled).

Fixes #220"
```
