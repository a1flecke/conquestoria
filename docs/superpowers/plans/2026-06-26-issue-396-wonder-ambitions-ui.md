# Issue #396 Wonder Ambitions UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Execute inline; this repository forbids subagents.

**Goal:** Redesign the Wonder Ambitions panel into the selected Option A hybrid: truthful guided cards, scannable quest progress, complete catalog reachability, viewer-safe rival intel, and responsive touch-first behavior on phones and laptops.

**Architecture:** Keep eligibility, quest, race, queue, and viewer-intel truth in the existing system presentation helpers. Correct one narrow presentation-layer classification gap so seeded project shells become `near` or `blocked` when their requirements are not currently reachable; do not change gameplay eligibility or race mutation rules. Keep `src/ui/wonder-panel.ts` as the data/lifecycle orchestrator and move reusable DOM rendering and responsive style constants to `src/ui/wonder-panel-view.ts`.

**Tech Stack:** TypeScript, DOM APIs, CSS Grid through inline styles, `createGameButton`, Vitest with jsdom, existing legendary-wonder presentation/system helpers.

---

## Source Contract

- Design spec: `docs/superpowers/specs/2026-06-26-issue-396-wonder-ambitions-ui-design.md`
- Issue: <https://github.com/a1flecke/conquestoria/issues/396>
- Visual reference: `docs/superpowers/specs/assets/issue-396-wonder-ambitions-option-a-guided-cards.svg`
- Repository guardrails:
  - `CLAUDE.md`
  - `.claude/rules/game-systems.md`
  - `.claude/rules/strategy-game-mechanics.md`
  - `.claude/rules/ui-panels.md`
  - `.claude/rules/end-to-end-wiring.md`
  - `.claude/rules/spec-fidelity.md`
  - `.claude/rules/incremental-mr-completion.md`
  - `docs/superpowers/plans/README.md`

## Review Corrections Incorporated

This revision fixes the following problems in the first plan:

- The live presentation helper currently classifies every newly seeded shell as `questing`, making normal `near` and `blocked` states unreachable. Task 1 fixes that presentation-only semantic boundary with positive and negative tests.
- The first plan had no concrete phone/laptop layout contract. Tasks 2 and 3 add a fluid, width-bounded shell, wrapping header/guidance layout, auto-fit card grids, overflow protection, and DOM assertions for those invariants.
- Full quest checklists on every catalog card would make the complete catalog exhausting on mobile. Recommended cards keep full checklists; compact cards show the count and at most the next pending step.
- Guidance formerly preferred a pending quest step over missing requirements, which could tell a `near` project to pursue a quest while hiding its actual tech/resource blocker. Missing requirements now take precedence for `near` and `blocked` entries.
- The duplicate guidance/card CTAs could invoke the callback repeatedly before the live caller rerendered. A panel-local one-shot controller disables every CTA for the same wonder before invoking the callback.
- The empty-state test in the first plan could never reach the empty branch because the presentation helper seeds entries. The revised tests exercise the empty renderer directly and exercise missing/foreign city integration paths explicitly.
- Rival intel was silently truncated to three entries. The revised plan renders every viewer-safe started-intel entry in a responsive compact grid.
- The first plan relied on optional or conditional test instructions for the live caller. This revision uses deterministic panel-level stale-action coverage and preserves the already-wired `src/main.ts` rerender path.
- Final verification now includes `./scripts/run-wonder-regressions.sh`, both mirrored test files, both changed source files in the rule check, full diff inspection, build, and full tests.

## File Structure

- Modify: `src/systems/legendary-wonder-presentation.ts`
  - Classify seeded `questing` shells as `near` or `blocked` while eligibility requirements are missing.
  - Keep true questing projects as `questing` once current requirements are met.
  - Do not mutate state or change construction eligibility.
- Modify: `tests/systems/legendary-wonder-presentation.test.ts`
  - Add positive and negative coverage for `questing`, `near`, and `blocked`.
- Create: `src/ui/wonder-panel-view.ts`
  - Own repeated card/chip/grid styles and DOM-only render helpers.
  - Render only `LegendaryWonderPresentationEntry` and viewer-safe started intel.
  - Export focused helpers used by the live panel and directly testable empty/guidance rendering.
- Modify: `src/ui/wonder-panel.ts`
  - Own current-player/city validation, canonical presentation calls, recommendation split, section order, one-shot action controller, and panel lifecycle.
  - Do not recompute tech, resource, quest, race, or rival-intel rules.
- Modify: `tests/ui/wonder-panel.test.ts`
  - Cover visible status semantics, guidance, responsive structure, compact/full card density, catalog completeness, one-shot actions, empty/error handling, and hot-seat privacy.
- Modify: `tests/ui/helpers/wonder-panel-fixture.ts`
  - Add a typed presentation-entry factory for direct DOM-helper tests without inventing game-state transitions.
- Inspect only: `src/main.ts`
  - Preserve the existing `openWonderPanel()` call after `startLegendaryWonderBuild`.
  - Do not refactor the launcher or create a second mutation path.

## Player Truth Table

| Before | Player action | Internal path | Immediate visible result | Must remain reachable |
| --- | --- | --- | --- | --- |
| Ready recommendation appears in guidance and card | Tap either `Start Construction` | Panel one-shot guard calls `onStartBuild(cityId, wonderId)` once; live caller uses `startLegendaryWonderBuild` | Both duplicate CTAs disable immediately, then the live caller rerenders the panel from new state | Existing production queue remains behind the wonder |
| Recommended project is questing | Read guidance/card | Presentation entry only | Guidance names the next pending quest step; full card shows every completed/pending step | Card details and full catalog |
| Recommended project is near | Read guidance/card | Presentation entry only | Missing tech/resource/city requirements appear before quest advice; no CTA | Compact catalog card |
| Project is building | Reopen or rerender panel | Presentation entry derives progress/ETA | Status, milestone, invested production, ETA, and queue-resume copy update | Bottom close and other projects |
| Project is completed or recovered | Reopen panel | Presentation entry only | Reward-active or recovered-effort copy is visible; no CTA | Other projects |
| Lower-ranked or blocked ambition is outside top three | Scroll to `All ambitions in this city` | Existing presentation order, minus recommended IDs | Exactly one compact card shows status, reward, quest count, blocker/next step, and detail copy | Every selected-city entry |
| Four viewer-safe rival race reports exist | Open panel | `getLegendaryWonderIntelForViewer(state, currentPlayer)` | All four safe cards render; exact progress and quest data do not | Player’s own complete catalog |
| Another hot-seat player opens the panel | Open panel | Same viewer helper with new `currentPlayer` | Intel learned only by the previous player is absent | Current player’s own entries |
| Missing or foreign city ID reaches the panel | Open panel | Guard before presentation rendering | Fallback IDs and explanatory non-action card render; no start CTA | Top and bottom close controls |

## Misleading UI Risks

- `Best fits right now` is a ranked subset, never the complete catalog. Every omitted entry must appear exactly once in `All ambitions in this city`.
- `questing` means current eligibility requirements are satisfied and quest work remains. A seeded shell missing requirements must be `near` or `blocked`, not `questing`.
- `near` means `isNearEligible(...)` is true; far-era or heavily blocked entries must stay out. The presentation test proves `Starvault Observatory` is near while `Manhattan Project` is blocked in the same state.
- `Best move right now` must not imply buildability unless both `entry.canStartBuild` and `entry.startActionLabel` are present.
- Missing requirements outrank pending-step guidance for `near` and `blocked` cards. UI code reads `entry.missingRequirements`; it does not recheck techs/resources.
- Quest rows expose only completed and pending. Do not invent per-step blocked semantics.
- `Race status: not yet in construction` describes the player’s local project only. Never claim a race is safe, uncontested, or rival-free without viewer-safe intel.
- Rival cards render only started entries returned by `getLegendaryWonderIntelForViewer`; never read rival project objects.
- The `All ambitions` section is compact, not incomplete. Compact mode may shorten quest rows, but it may not remove status, reward, quest count, blockers/next step, or start actions.

## Interaction Replay Checklist

- Open a ready panel, tap guidance CTA, verify callback once and both same-wonder CTAs disable.
- Dispatch another click on the stale guidance node and then the stale card node; verify callback remains once.
- Reopen/rerender through the live caller and verify the wonder now shows `Under construction`, not a start CTA.
- Open with no ready recommendation and verify no dead primary CTA.
- Open with four or more entries; verify recommendation count is at most three and every remainder appears once.
- Open with four rival reports; verify all viewer-safe reports render.
- Switch hot-seat current player and reopen; verify previous-player intel disappears.
- Open with missing and foreign city IDs; verify safe explanatory cards and working close controls.

## Queue And ETA Guardrails

- `startLegendaryWonderBuild` remains the only mutation path and prepends `legendary:<wonderId>` without discarding the queue tail.
- Before a start, the card says the current queue continues after the wonder.
- While building, the card renders `milestoneLabel`, invested/required production, `turnsRemaining` when non-null, and `queueContinuityLabel` when a tail exists.
- This feature adds no reorder/remove controls. Existing queue preservation coverage in `tests/systems/legendary-wonder-system.test.ts` must remain green.
- If the build is rejected by current canonical eligibility, the live caller rerenders from unchanged state; no UI-only mutation may pretend construction started.

## Responsive And Accessibility Contract

| Surface | Phone (~360px) | Laptop (~1366px) |
| --- | --- | --- |
| Panel shell | Uses full available width, border-box sizing, no horizontal scrolling | Content is centered and capped at `1120px` |
| Header | Wraps title/subtitle and close control without clipping | Title context and close control share the row |
| Guidance | Copy and CTA stack through auto-fit grid | Copy and CTA can sit side by side |
| Recommended cards | One column | Auto-fit at `minmax(min(100%, 420px), 1fr)` |
| Catalog/rival cards | One column | Auto-fit at `minmax(min(100%, 300px), 1fr)` |
| Text | `min-width:0` and `overflow-wrap:anywhere` prevent long dynamic names from widening cards | Comfortable line lengths inside centered shell |
| Actions | `createGameButton` supplies at least 44px touch height | Keyboard focus follows top close, guidance CTA, cards, bottom close |

The panel uses `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, initial focus on the top close control, `Escape` dismissal, explicit status text, and `✓ Complete:` / `○ Pending:` labels so color and symbols are not the only signals. No HTTP server is required for this implementation-plan execution; DOM tests lock the responsive CSS invariants and the checked-in SVG remains the visual reference.

---

### Task 1: Make Questing, Near, And Blocked Presentation States Truthful

**Files:**
- Modify: `tests/systems/legendary-wonder-presentation.test.ts`
- Modify: `src/systems/legendary-wonder-presentation.ts`

- [ ] **Step 1: Add the failing presentation-boundary regression**

Add after `keeps stale ready projects build-blocked...`:

```ts
it('does not present seeded project shells as questing before requirements are reachable', () => {
  const state = makeLegendaryWonderFixture({
    completedTechs: ['philosophy', 'pilgrimages'],
    resources: ['stone'],
  });
  state.era = 4;
  state.legendaryWonderProjects = undefined;

  const entries = getLegendaryWonderPresentationForCity(state, 'player', 'city-river');

  expect(entries.find(entry => entry.wonderId === 'oracle-of-delphi')).toMatchObject({
    visibleState: 'questing',
    eligibilityState: 'near',
  });
  expect(entries.find(entry => entry.wonderId === 'starvault-observatory')).toMatchObject({
    visibleState: 'near',
    eligibilityState: 'near',
  });
  expect(entries.find(entry => entry.wonderId === 'manhattan-project')).toMatchObject({
    visibleState: 'blocked',
    eligibilityState: 'blocked',
  });
});
```

This is the required negative boundary: a seeded project record alone is insufficient to earn the `questing` label.

- [ ] **Step 2: Run the mirrored system test and confirm the semantic failure**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/legendary-wonder-presentation.test.ts
```

Expected: FAIL because Starvault and Manhattan are currently both reported as `questing`.

- [ ] **Step 3: Correct only the presentation classification**

Replace the `questing` branch in `getVisibleState`:

```ts
if (project?.phase === 'questing') {
  if (missingRequirements.length > 0) {
    return isNearEligible(state, missingRequirements, era) ? 'near' : 'blocked';
  }
  return 'questing';
}
```

Do not alter `getEligibleLegendaryWonders`, `initializeLegendaryWonderProjectsForCity`, or any race/build mutation.

- [ ] **Step 4: Run the system test and verify positive plus negative cases**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/legendary-wonder-presentation.test.ts
```

Expected: PASS, including the existing stale-ready blocked test and compact-list far-era negative test.

- [ ] **Step 5: Commit**

```bash
git add src/systems/legendary-wonder-presentation.ts tests/systems/legendary-wonder-presentation.test.ts
git commit -m "fix(wonders): classify seeded ambition reachability"
```

---

### Task 2: Add The Visible, Responsive, And Accessible Panel Contract

**Files:**
- Modify: `tests/ui/helpers/wonder-panel-fixture.ts`
- Modify: `tests/ui/wonder-panel.test.ts`

- [ ] **Step 1: Add a typed presentation-entry factory**

Add imports and this helper to `tests/ui/helpers/wonder-panel-fixture.ts`:

```ts
import type { LegendaryWonderPresentationEntry } from '@/systems/legendary-wonder-presentation';

export function makeWonderPresentationEntry(
  overrides: Partial<LegendaryWonderPresentationEntry> = {},
): LegendaryWonderPresentationEntry {
  return {
    wonderId: 'oracle-of-delphi',
    queueItemId: 'legendary:oracle-of-delphi',
    name: 'Oracle of Delphi',
    era: 3,
    productionCost: 120,
    rewardSummary: '+60 research immediately.',
    visibleState: 'questing',
    eligibilityState: 'near',
    phase: 'questing',
    questCompleted: 0,
    questTotal: 2,
    questSteps: [
      { id: 'first', description: 'Discover a natural wonder.', completed: false },
      { id: 'second', description: 'Establish a pilgrimage route.', completed: false },
    ],
    investedProduction: 0,
    transferableProduction: 0,
    missingRequirements: [],
    canStartBuild: false,
    startActionLabel: null,
    progressPercent: 0,
    turnsRemaining: null,
    milestoneLabel: null,
    queueContinuityLabel: null,
    productionResumedLabel: null,
    recoveryLabel: null,
    raceTensionLabel: null,
    ...overrides,
  };
}
```

- [ ] **Step 2: Add targeted seven-state and quest semantics tests**

Import `makeWonderPresentationEntry` with the existing fixture imports, then add:

```ts
it('renders the seven visible states on their exact project cards', () => {
  const { container, city, state } = makeWonderPanelFixture();
  state.civilizations.player.techState.completed.push('printing', 'diplomats');
  state.legendaryWonderProjects!['oracle-of-delphi'].phase = 'ready_to_build';
  state.legendaryWonderProjects!['grand-canal'].phase = 'building';
  state.legendaryWonderProjects!['world-archive'] = {
    wonderId: 'world-archive',
    ownerId: 'player',
    cityId: city.id,
    phase: 'questing',
    investedProduction: 0,
    transferableProduction: 0,
    questSteps: [{ id: 'archive-step', description: 'Collect records.', completed: false }],
  };
  state.legendaryWonderProjects!['sun-spire'] = {
    wonderId: 'sun-spire',
    ownerId: 'player',
    cityId: city.id,
    phase: 'lost_race',
    investedProduction: 80,
    transferableProduction: 20,
    questSteps: [],
  };
  state.completedLegendaryWonders = {
    'moonwell-gardens': { ownerId: 'player', cityId: city.id, turnCompleted: state.turn },
  };

  const panel = createWonderPanel(container, state, city.id, {
    onStartBuild: () => {},
    onClose: () => {},
  });
  const expectState = (wonderId: string, visibleState: string, label: string) => {
    const card = panel.querySelector(`[data-project-card="${wonderId}"]`);
    const chip = card?.querySelector(`[data-wonder-status-chip="${visibleState}"]`);
    expect(chip?.textContent).toContain(label);
  };

  expectState('oracle-of-delphi', 'ready', 'Ready to build');
  expectState('world-archive', 'questing', 'Quest in progress');
  expectState('grand-canal', 'building', 'Under construction');
  expectState('moonwell-gardens', 'completed', 'Completed');
  expectState('sun-spire', 'recovered', 'Race lost');
  expectState('starvault-observatory', 'near', 'Available soon');
  expectState('manhattan-project', 'blocked', 'Blocked');
});

it('labels quest rows with visible and machine-readable completion semantics', () => {
  const { container, state } = makeWonderPanelFixture();
  state.legendaryWonderProjects!['oracle-of-delphi'].questSteps = [
    { id: 'found-site', description: 'Discover a natural wonder.', completed: true },
    { id: 'finish-rite', description: 'Complete the rite.', completed: false },
  ];

  const panel = createWonderPanel(container, state, 'city-river', {
    onStartBuild: () => {},
    onClose: () => {},
  });
  const rows = Array.from(
    panel.querySelectorAll<HTMLElement>('[data-wonder-quest-list="oracle-of-delphi"] [data-wonder-quest-step]'),
  );

  expect(rows.map(row => row.dataset.wonderQuestStep)).toEqual(['completed', 'pending']);
  expect(rows[0].textContent).toContain('✓ Complete: Discover a natural wonder.');
  expect(rows[1].textContent).toContain('○ Pending: Complete the rite.');
  expect(rows.some(row => row.dataset.wonderQuestStep === 'blocked')).toBe(false);
});
```

- [ ] **Step 3: Add header, dialog, and responsive-layout tests**

```ts
it('renders a labelled dialog with responsive phone and laptop layout invariants', () => {
  const { container, state } = makeWonderPanelFixture();
  const onClose = vi.fn();
  const panel = createWonderPanel(container, state, 'city-river', {
    onStartBuild: () => {},
    onClose,
  });

  expect(panel.getAttribute('role')).toBe('dialog');
  expect(panel.getAttribute('aria-modal')).toBe('true');
  expect(panel.getAttribute('aria-labelledby')).toBe('wonder-panel-title');
  expect(panel.querySelector('#wonder-panel-title')?.textContent).toBe('🏛️ Legendary Wonders');
  expect(panel.textContent).toContain('Player · city-river');
  expect(panel.style.boxSizing).toBe('border-box');
  expect(panel.style.overflowX).toBe('hidden');

  const shell = panel.querySelector<HTMLElement>('[data-wonder-layout="responsive-shell"]');
  expect(shell?.style.width).toBe('100%');
  expect(shell?.style.maxWidth).toBe('1120px');
  expect(shell?.style.margin).toBe('0px auto');

  const header = panel.querySelector<HTMLElement>('[data-wonder-layout="header"]');
  expect(header?.style.flexWrap).toBe('wrap');
  for (const grid of panel.querySelectorAll<HTMLElement>('[data-wonder-card-grid]')) {
    expect(grid.style.gridTemplateColumns).toContain('auto-fit');
    expect(grid.style.gridTemplateColumns).toContain('min(100%,');
  }

  const topClose = panel.querySelector<HTMLButtonElement>('[data-wonder-panel-close="top"]');
  expect(document.activeElement).toBe(topClose);
  panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  expect(onClose).toHaveBeenCalledOnce();
});
```

- [ ] **Step 4: Run the UI test and confirm it fails on missing view contracts**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/wonder-panel.test.ts
```

Expected: FAIL on status markers, quest row labels, dialog attributes, title, shell, and grids.

- [ ] **Step 5: Leave these tests red and continue to Task 3**

Do not commit a knowingly failing test-only state.

---

### Task 3: Build Focused View Helpers And Responsive Card Layout

**Files:**
- Create: `src/ui/wonder-panel-view.ts`
- Modify: `src/ui/wonder-panel.ts`
- Test: `tests/ui/wonder-panel.test.ts`

- [ ] **Step 1: Create shared visual constants and semantic helpers**

Create `src/ui/wonder-panel-view.ts` with imports, types, and constants:

```ts
import type { LegendaryWonderStartedIntelEntry } from '@/core/types';
import { getLegendaryWonderDefinition } from '@/systems/legendary-wonder-definitions';
import type {
  LegendaryWonderPresentationEntry,
  LegendaryWonderVisibleState,
} from '@/systems/legendary-wonder-presentation';
import { createGameButton } from '@/ui/ui-kit';

export type WonderCardMode = 'recommended' | 'compact';
export type StartWonderAction = (wonderId: string) => void;

const CARD_BASE_STYLE = [
  'min-width:0',
  'overflow-wrap:anywhere',
  'background:rgba(255,255,255,0.06)',
  'border:1px solid rgba(255,255,255,0.12)',
  'border-radius:14px',
  'padding:14px',
].join(';');

const RECOMMENDED_CARD_STYLE = [
  CARD_BASE_STYLE,
  'border-color:rgba(232,193,112,0.55)',
  'box-shadow:inset 4px 0 0 #e8c170,0 0 0 1px rgba(232,193,112,0.10)',
].join(';');

const COMPACT_CARD_STYLE = `${CARD_BASE_STYLE};background:rgba(255,255,255,0.045)`;
const CHIP_BASE_STYLE = [
  'display:inline-flex',
  'align-items:center',
  'gap:4px',
  'border-radius:999px',
  'padding:4px 9px',
  'font-size:12px',
  'font-weight:700',
].join(';');

const STATUS_LABELS: Record<LegendaryWonderVisibleState, string> = {
  ready: 'Ready to build',
  questing: 'Quest in progress',
  building: 'Under construction',
  completed: 'Completed',
  recovered: 'Race lost',
  near: 'Available soon',
  blocked: 'Blocked',
};

const STATUS_ICONS: Record<LegendaryWonderVisibleState, string> = {
  ready: '✓',
  questing: '…',
  building: '⚒',
  completed: '★',
  recovered: '↩',
  near: '◇',
  blocked: '!',
};

const STATUS_COLORS: Record<LegendaryWonderVisibleState, string> = {
  ready: 'background:rgba(122,216,143,0.18);border:1px solid rgba(122,216,143,0.52);color:#d9f8df',
  questing: 'background:rgba(215,173,88,0.18);border:1px solid rgba(215,173,88,0.52);color:#f4d188',
  building: 'background:rgba(104,166,255,0.18);border:1px solid rgba(104,166,255,0.48);color:#d7e8ff',
  completed: 'background:rgba(122,216,143,0.16);border:1px solid rgba(122,216,143,0.45);color:#d9f8df',
  recovered: 'background:rgba(215,173,88,0.12);border:1px solid rgba(215,173,88,0.36);color:#dfc891',
  near: 'background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.20);color:#e8eef8',
  blocked: 'background:rgba(224,114,114,0.14);border:1px solid rgba(224,114,114,0.42);color:#f3b5b5',
};

function appendText(
  parent: HTMLElement,
  tagName: keyof HTMLElementTagNameMap,
  text: string,
  style?: string,
): HTMLElement {
  const element = document.createElement(tagName);
  element.textContent = text;
  if (style) element.style.cssText = style;
  parent.appendChild(element);
  return element;
}
```

- [ ] **Step 2: Add status, quest, reward, and race renderers**

Continue the same module:

```ts
function appendStatusChip(parent: HTMLElement, entry: LegendaryWonderPresentationEntry): void {
  const chip = document.createElement('span');
  chip.dataset.wonderStatusChip = entry.visibleState;
  chip.style.cssText = `${CHIP_BASE_STYLE};${STATUS_COLORS[entry.visibleState]}`;
  chip.textContent = `${STATUS_ICONS[entry.visibleState]} ${STATUS_LABELS[entry.visibleState]}`;
  parent.appendChild(chip);
}

function appendBestFitChip(parent: HTMLElement, wonderId: string): void {
  const chip = document.createElement('span');
  chip.dataset.wonderBestFitChip = wonderId;
  chip.style.cssText = `${CHIP_BASE_STYLE};background:rgba(232,193,112,0.18);border:1px solid rgba(232,193,112,0.55);color:#f4d188`;
  chip.textContent = 'Best fit';
  parent.appendChild(chip);
}

function appendQuestChecklist(
  parent: HTMLElement,
  entry: LegendaryWonderPresentationEntry,
  mode: WonderCardMode,
): void {
  const wrapper = document.createElement('div');
  wrapper.dataset.wonderQuestList = entry.wonderId;
  wrapper.style.cssText = 'display:flex;flex-direction:column;gap:6px;margin:8px 0 10px;';
  appendText(wrapper, 'p', `Quest steps: ${entry.questCompleted}/${entry.questTotal} complete.`, 'margin:0;');

  const rows = mode === 'recommended'
    ? entry.questSteps
    : entry.questSteps.filter(step => !step.completed).slice(0, 1);
  for (const step of rows) {
    const completed = step.completed;
    const row = document.createElement('div');
    row.dataset.wonderQuestStep = completed ? 'completed' : 'pending';
    row.style.cssText = 'display:flex;gap:8px;align-items:flex-start;font-size:13px;line-height:1.4;';
    row.textContent = `${completed ? '✓ Complete' : '○ Pending'}: ${step.description}`;
    wrapper.appendChild(row);
  }
  parent.appendChild(wrapper);
}

function appendRewardRow(parent: HTMLElement, entry: LegendaryWonderPresentationEntry): void {
  const row = appendText(parent, 'p', `Reward: ${entry.rewardSummary}`, 'margin:8px 0;line-height:1.4;');
  row.dataset.wonderRewardSummary = entry.wonderId;
}

function appendRaceSummary(parent: HTMLElement, entry: LegendaryWonderPresentationEntry): void {
  let text = 'Race status: not yet in construction.';
  if (entry.visibleState === 'building') {
    text = `Race status: ${entry.investedProduction}/${entry.productionCost} production invested.`;
  } else if (entry.visibleState === 'completed') {
    text = 'Race status: won.';
  } else if (entry.visibleState === 'recovered') {
    text = `Race status: lost. ${entry.transferableProduction} carryover remains in this city.`;
  }
  const row = appendText(parent, 'p', text, 'margin:8px 0;line-height:1.4;');
  row.dataset.wonderRaceSummary = entry.wonderId;
}

function appendRequirementsOrNextStep(parent: HTMLElement, entry: LegendaryWonderPresentationEntry): void {
  if (entry.missingRequirements.length > 0) {
    appendText(parent, 'p', `Missing: ${entry.missingRequirements.join(', ')}.`, 'margin:8px 0;line-height:1.4;');
    return;
  }
  const pending = entry.questSteps.find(step => !step.completed);
  appendText(
    parent,
    'p',
    pending ? `Next: ${pending.description}` : 'All quest steps complete.',
    'margin:8px 0;line-height:1.4;',
  );
}
```

- [ ] **Step 3: Add project-card and grid renderers**

```ts
export function createWonderCardGrid(kind: 'recommended' | 'catalog' | 'rival'): HTMLElement {
  const grid = document.createElement('div');
  grid.dataset.wonderCardGrid = kind;
  const minimum = kind === 'recommended' ? '420px' : '300px';
  grid.style.cssText = [
    'display:grid',
    `grid-template-columns:repeat(auto-fit,minmax(min(100%, ${minimum}),1fr))`,
    'gap:12px',
    'align-items:start',
  ].join(';');
  return grid;
}

export function appendProjectCard(
  entry: LegendaryWonderPresentationEntry,
  grid: HTMLElement,
  onStart: StartWonderAction,
  mode: WonderCardMode,
): void {
  const article = document.createElement('article');
  article.dataset.projectCard = entry.wonderId;
  article.style.cssText = mode === 'recommended' ? RECOMMENDED_CARD_STYLE : COMPACT_CARD_STYLE;
  if (mode === 'recommended') article.dataset.recommendedProject = 'true';

  appendText(article, 'h4', `${mode === 'recommended' ? '🏛️ ' : ''}${entry.name}`, 'margin:0 0 8px;');
  const chips = document.createElement('div');
  chips.style.cssText = 'display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-bottom:6px;';
  appendStatusChip(chips, entry);
  if (mode === 'recommended') appendBestFitChip(chips, entry.wonderId);
  article.appendChild(chips);

  appendRewardRow(article, entry);
  appendRequirementsOrNextStep(article, entry);
  appendQuestChecklist(article, entry, mode);
  appendText(article, 'p', `Cost: ${entry.productionCost} production.`, 'margin:8px 0;');

  if (mode === 'recommended' || ['building', 'completed', 'recovered'].includes(entry.visibleState)) {
    appendRaceSummary(article, entry);
  }
  if (entry.milestoneLabel) appendText(article, 'p', `Construction: ${entry.milestoneLabel}.`);
  if (entry.turnsRemaining !== null) appendText(article, 'p', `ETA: ${entry.turnsRemaining} turns.`);
  if (entry.raceTensionLabel) appendText(article, 'p', entry.raceTensionLabel);
  if (entry.queueContinuityLabel) appendText(article, 'p', entry.queueContinuityLabel);
  if (entry.productionResumedLabel) appendText(article, 'p', entry.productionResumedLabel);
  if (entry.visibleState === 'completed') appendText(article, 'p', 'Reward active.');
  if (entry.recoveryLabel) appendText(article, 'p', entry.recoveryLabel);

  if (entry.canStartBuild && entry.startActionLabel) {
    appendText(article, 'p', 'Starting now makes this the active production; current queue continues after this wonder.');
    const button = createGameButton(entry.startActionLabel, 'primary');
    button.dataset.wonderStartBuild = entry.wonderId;
    button.dataset.wonderStartTarget = entry.wonderId;
    button.addEventListener('click', () => onStart(entry.wonderId));
    article.appendChild(button);
  }

  grid.appendChild(article);
}
```

- [ ] **Step 4: Refactor the panel into a bounded responsive shell**

In `src/ui/wonder-panel.ts`:

- add this import:

```ts
import {
  appendProjectCard,
  createWonderCardGrid,
  type StartWonderAction,
  type WonderCardMode,
} from '@/ui/wonder-panel-view';
```

- then:
- delete the old local `getVisibleStateLabel` and `appendProjectCard`;
- keep the local `appendText` for header/section orchestration;
- keep the existing rival helper until Task 6 replaces it.

Initialize the panel and shell as follows:

```ts
const panel = document.createElement('div');
panel.id = 'wonder-panel';
panel.setAttribute('role', 'dialog');
panel.setAttribute('aria-modal', 'true');
panel.setAttribute('aria-labelledby', 'wonder-panel-title');
panel.style.cssText = [
  'position:absolute',
  'inset:0',
  'box-sizing:border-box',
  'background:rgba(15,15,25,0.97)',
  'z-index:31',
  'overflow-y:auto',
  'overflow-x:hidden',
  'padding:clamp(12px,2vw,24px)',
  'padding-bottom:80px',
].join(';');

const shell = document.createElement('div');
shell.dataset.wonderLayout = 'responsive-shell';
shell.style.cssText = 'width:100%;max-width:1120px;margin:0 auto;';
panel.appendChild(shell);

const header = document.createElement('div');
header.dataset.wonderLayout = 'header';
header.style.cssText = 'display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px;';
const title = document.createElement('h2');
title.id = 'wonder-panel-title';
title.textContent = '🏛️ Legendary Wonders';
title.style.margin = '0';
header.appendChild(title);
```

Append all content and both close buttons to `shell`, not directly to `panel`. Always append subtitle context:

```ts
appendText(shell, 'p', `${civilization?.name ?? state.currentPlayer} · ${city?.name ?? cityId}`);
```

Register keyboard dismissal on the panel:

```ts
panel.addEventListener('keydown', event => {
  if (event.key === 'Escape') callbacks.onClose();
});
```

After all content is ready, append and focus in this order:

```ts
container.appendChild(panel);
topClose.focus();
return panel;
```

Replace `appendProjectSection` with this exact signature and body:

```ts
function appendProjectSection(
  shell: HTMLElement,
  heading: string,
  dataSection: string,
  entries: LegendaryWonderPresentationEntry[],
  onStart: StartWonderAction,
  mode: WonderCardMode,
): void {
  if (entries.length === 0) return;
  const section = document.createElement('section');
  section.dataset.section = dataSection;
  section.style.cssText = 'margin-top:16px;min-width:0;';
  appendText(section, 'h3', heading);
  const grid = createWonderCardGrid(mode === 'recommended' ? 'recommended' : 'catalog');
  for (const entry of entries) {
    appendProjectCard(entry, grid, onStart, mode);
  }
  section.appendChild(grid);
  shell.appendChild(section);
}
```

Before rendering sections, use the existing callback contract through a typed adapter:

```ts
const startWonder: StartWonderAction = wonderId => callbacks.onStartBuild(cityId, wonderId);

appendProjectSection(
  shell,
  'Best fits right now',
  'recommended-wonders',
  recommendedEntries,
  startWonder,
  'recommended',
);
appendProjectSection(
  shell,
  'All ambitions in this city',
  'all-city-wonders',
  laterEntries,
  startWonder,
  'compact',
);
```

- [ ] **Step 5: Run the focused UI test**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/wonder-panel.test.ts
```

Expected: PASS for the Task 2 status, quest, header, responsive-layout, existing start-action, privacy, and catalog tests.

- [ ] **Step 6: Commit the green card/layout slice**

```bash
git add src/ui/wonder-panel.ts src/ui/wonder-panel-view.ts tests/ui/wonder-panel.test.ts tests/ui/helpers/wonder-panel-fixture.ts
git commit -m "feat(wonders): add responsive ambition card views"
```

---

### Task 4: Add Truthful Guidance And One-Shot Duplicate CTAs

**Files:**
- Modify: `src/ui/wonder-panel-view.ts`
- Modify: `src/ui/wonder-panel.ts`
- Modify: `tests/ui/wonder-panel.test.ts`

- [ ] **Step 1: Add direct guidance truth tests**

Import `appendGuidanceStrip` from `@/ui/wonder-panel-view`, then add:

```ts
it('prioritizes missing requirements over quest advice for near guidance', () => {
  const host = document.createElement('div');
  appendGuidanceStrip(host, makeWonderPresentationEntry({
    visibleState: 'near',
    missingRequirements: ['Printing', 'Stone'],
  }), () => {});

  expect(host.textContent).toContain('Missing Printing, Stone');
  expect(host.textContent).not.toContain('next step');
  expect(host.querySelector('[data-wonder-guidance-start-build]')).toBeNull();
});

it('renders guidance CTA only when buildability and action label are both present', () => {
  const start = vi.fn();
  const readyHost = document.createElement('div');
  appendGuidanceStrip(readyHost, makeWonderPresentationEntry({
    visibleState: 'ready',
    eligibilityState: 'buildable',
    phase: 'ready_to_build',
    canStartBuild: true,
    startActionLabel: 'Start Construction',
    questCompleted: 2,
  }), start);
  readyHost.querySelector<HTMLButtonElement>('[data-wonder-guidance-start-build]')!.click();
  expect(start).toHaveBeenCalledWith('oracle-of-delphi');

  for (const visibleState of ['questing', 'building', 'completed', 'recovered', 'near', 'blocked'] as const) {
    const host = document.createElement('div');
    appendGuidanceStrip(host, makeWonderPresentationEntry({
      visibleState,
      canStartBuild: false,
      startActionLabel: null,
    }), start);
    expect(host.querySelector('[data-wonder-guidance-start-build]')).toBeNull();
  }

  const missingLabelHost = document.createElement('div');
  appendGuidanceStrip(missingLabelHost, makeWonderPresentationEntry({
    visibleState: 'ready',
    canStartBuild: true,
    startActionLabel: null,
  }), start);
  expect(missingLabelHost.querySelector('[data-wonder-guidance-start-build]')).toBeNull();
});
```

- [ ] **Step 2: Add stale/repeat-click integration coverage**

```ts
it('allows only one start callback across duplicate guidance and card CTAs', () => {
  const { container, state } = makeWonderPanelFixture();
  state.legendaryWonderProjects!['oracle-of-delphi'].phase = 'ready_to_build';
  const onStartBuild = vi.fn();
  const panel = createWonderPanel(container, state, 'city-river', {
    onStartBuild,
    onClose: () => {},
  });

  const guidance = panel.querySelector<HTMLButtonElement>(
    '[data-wonder-guidance-start-build="oracle-of-delphi"]',
  )!;
  const card = panel.querySelector<HTMLButtonElement>(
    '[data-wonder-start-build="oracle-of-delphi"]',
  )!;

  guidance.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  guidance.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  card.dispatchEvent(new MouseEvent('click', { bubbles: true }));

  expect(onStartBuild).toHaveBeenCalledTimes(1);
  expect(onStartBuild).toHaveBeenCalledWith('city-river', 'oracle-of-delphi');
  expect(guidance.disabled).toBe(true);
  expect(card.disabled).toBe(true);
});
```

- [ ] **Step 3: Implement guidance copy in the view module**

```ts
function getGuidanceCopy(entry: LegendaryWonderPresentationEntry): string {
  if (entry.canStartBuild && entry.startActionLabel) {
    return `${entry.name} is ready. Starting now begins construction while preserving queued production.`;
  }
  if (entry.visibleState === 'building') return `${entry.name}: construction is already underway.`;
  if (entry.visibleState === 'completed') return `${entry.name}: reward is already active.`;
  if (entry.visibleState === 'recovered') return `${entry.name}: race lost, but recovered effort remains available.`;
  if (entry.missingRequirements.length > 0) {
    return `${entry.name}: Missing ${entry.missingRequirements.join(', ')}.`;
  }
  const pending = entry.questSteps.find(step => !step.completed);
  if (pending) return `${entry.name}: next step — ${pending.description}`;
  return `${entry.name}: review the card below for the next step.`;
}

export function appendGuidanceStrip(
  parent: HTMLElement,
  entry: LegendaryWonderPresentationEntry,
  onStart: StartWonderAction,
): void {
  const strip = document.createElement('section');
  strip.dataset.wonderGuidance = entry.wonderId;
  strip.style.cssText = [
    'display:grid',
    'grid-template-columns:repeat(auto-fit,minmax(min(100%, 260px),1fr))',
    'align-items:center',
    'gap:12px',
    'background:rgba(232,193,112,0.10)',
    'border:1px solid rgba(232,193,112,0.28)',
    'border-radius:14px',
    'padding:12px',
    'margin-bottom:14px',
    'min-width:0',
  ].join(';');
  const copy = document.createElement('div');
  appendText(copy, 'h3', 'Best move right now', 'margin:0 0 6px;');
  appendText(copy, 'p', getGuidanceCopy(entry), 'margin:0;line-height:1.4;');
  strip.appendChild(copy);

  if (entry.canStartBuild && entry.startActionLabel) {
    const button = createGameButton(entry.startActionLabel, 'primary');
    button.dataset.wonderGuidanceStartBuild = entry.wonderId;
    button.dataset.wonderStartTarget = entry.wonderId;
    button.addEventListener('click', () => onStart(entry.wonderId));
    strip.appendChild(button);
  }
  parent.appendChild(strip);
}
```

- [ ] **Step 4: Add one panel-local action controller**

Import `setButtonDisabled` from `@/ui/ui-kit`. In `createWonderPanel`, replace the Task 3 `startWonder` adapter with:

```ts
const pendingStarts = new Set<string>();
const startOnce = (wonderId: string) => {
  if (pendingStarts.has(wonderId)) return;
  pendingStarts.add(wonderId);
  for (const button of panel.querySelectorAll<HTMLButtonElement>('[data-wonder-start-target]')) {
    if (button.dataset.wonderStartTarget === wonderId) setButtonDisabled(button, true);
  }
  callbacks.onStartBuild(cityId, wonderId);
};
```

Pass `startOnce` to guidance and every project card. After deriving `recommendedEntries`, render:

```ts
if (recommendedEntries.length > 0) {
  appendGuidanceStrip(shell, recommendedEntries[0], startOnce);
}
```

The live `src/main.ts` callback remains responsible for canonical mutation and immediate rerender.

- [ ] **Step 5: Run focused tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/wonder-panel.test.ts
```

Expected: PASS, including requirement-first guidance, no dead CTA, and stale/repeat-click suppression.

- [ ] **Step 6: Commit**

```bash
git add src/ui/wonder-panel.ts src/ui/wonder-panel-view.ts tests/ui/wonder-panel.test.ts
git commit -m "feat(wonders): add safe ambition guidance actions"
```

---

### Task 5: Preserve The Complete Catalog Without Overloading Mobile

**Files:**
- Modify: `src/ui/wonder-panel.ts`
- Modify: `tests/ui/wonder-panel.test.ts`

- [ ] **Step 1: Replace glossary expectations with contextual-card expectations**

Replace `shows eligibility, quest steps, build city, and race compensation text` with:

```ts
it('teaches wonder rules through contextual cards instead of glossary blocks', () => {
  const { container, state } = makeWonderPanelFixture();
  const panel = createWonderPanel(container, state, 'city-river', {
    onStartBuild: () => {},
    onClose: () => {},
  });
  const rendered = collectText(panel);

  expect(rendered).not.toContain('Eligibility Required techs, resources');
  expect(rendered).not.toContain('Construction Race Losing returns');
  expect(rendered).toContain('Missing:');
  expect(rendered).toContain('Quest steps:');
  expect(rendered).toContain('Reward:');
  expect(rendered).toContain('Discover a natural wonder');
});
```

- [ ] **Step 2: Add canonical completeness and compact-density regressions**

Import `getLegendaryWonderPresentationForCity`, then add:

```ts
it('renders every canonical selected-city entry exactly once across both sections', () => {
  const { container, state } = makeWonderPanelFixture();
  const expected = getLegendaryWonderPresentationForCity(state, 'player', 'city-river');
  const panel = createWonderPanel(container, state, 'city-river', {
    onStartBuild: () => {},
    onClose: () => {},
  });

  const cards = Array.from(panel.querySelectorAll<HTMLElement>('[data-project-card]'));
  const renderedIds = cards.map(card => card.dataset.projectCard);
  expect(renderedIds).toHaveLength(expected.length);
  expect(new Set(renderedIds).size).toBe(expected.length);
  expect(new Set(renderedIds)).toEqual(new Set(expected.map(entry => entry.wonderId)));
  expect(panel.querySelectorAll('[data-recommended-project="true"]').length).toBeLessThanOrEqual(3);

  const recommendedIds = new Set(
    Array.from(panel.querySelectorAll<HTMLElement>('[data-recommended-project="true"]'))
      .map(card => card.dataset.projectCard),
  );
  const catalogIds = new Set(
    Array.from(panel.querySelectorAll<HTMLElement>('[data-section="all-city-wonders"] [data-project-card]'))
      .map(card => card.dataset.projectCard),
  );
  for (const entry of expected) {
    expect(recommendedIds.has(entry.wonderId) || catalogIds.has(entry.wonderId)).toBe(true);
  }
  expect(catalogIds.has('manhattan-project')).toBe(true);
});

it('keeps catalog cards compact while preserving required decision data', () => {
  const { container, state } = makeWonderPanelFixture();
  const panel = createWonderPanel(container, state, 'city-river', {
    onStartBuild: () => {},
    onClose: () => {},
  });
  const catalogCards = Array.from(
    panel.querySelectorAll<HTMLElement>('[data-section="all-city-wonders"] [data-project-card]'),
  );

  for (const card of catalogCards) {
    expect(card.querySelector('[data-wonder-status-chip]')).not.toBeNull();
    expect(card.querySelector('[data-wonder-reward-summary]')).not.toBeNull();
    expect(card.querySelector('[data-wonder-quest-list]')).not.toBeNull();
    expect(card.querySelectorAll('[data-wonder-quest-step]').length).toBeLessThanOrEqual(1);
    expect(card.textContent).toMatch(/Missing:|Next:|All quest steps complete/);
  }
});
```

- [ ] **Step 3: Run the UI test and verify it fails while glossary/flat rendering remains**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/wonder-panel.test.ts
```

Expected: FAIL until old intro sections are removed and compact cards use the view helper.

- [ ] **Step 4: Remove only the global glossary blocks**

Delete `appendIntroSection` and its three `Eligibility`, `Quest`, and `Construction Race` calls. Do not remove per-card blocker, quest, reward, queue, race, recovery, or ETA copy.

- [ ] **Step 5: Keep recommendation membership derived from the canonical order**

Preserve this split without adding another score:

```ts
const recommendedEntries = cityEntries
  .filter(entry => entry.visibleState !== 'blocked' && entry.visibleState !== 'completed')
  .slice(0, 3);
const recommendedIds = new Set(recommendedEntries.map(entry => entry.wonderId));
const laterEntries = cityEntries.filter(entry => !recommendedIds.has(entry.wonderId));
```

- [ ] **Step 6: Run focused tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/wonder-panel.test.ts
```

Expected: PASS with every entry rendered once and catalog cards limited to at most one quest row.

- [ ] **Step 7: Commit**

```bash
git add src/ui/wonder-panel.ts tests/ui/wonder-panel.test.ts
git commit -m "feat(wonders): preserve compact ambition catalog"
```

---

### Task 6: Render All Viewer-Safe Rival Intel And Safe Empty/Error States

**Files:**
- Modify: `src/ui/wonder-panel-view.ts`
- Modify: `src/ui/wonder-panel.ts`
- Modify: `tests/ui/wonder-panel.test.ts`

- [ ] **Step 1: Add all-intel and hot-seat privacy coverage**

Extend the existing rival tests:

```ts
it('renders every viewer-safe started report without exposing live project detail', () => {
  const { container, state } = makeWonderPanelFixture();
  state.legendaryWonderIntel = {
    player: ['grand-canal', 'sun-spire', 'world-archive', 'moonwell-gardens'].map((wonderId, index) => ({
      projectKey: `${wonderId}-rival`,
      wonderId,
      civId: 'rival',
      civName: 'Rival',
      cityId: `rival-city-${index}`,
      cityName: `Known Rival City ${index + 1}`,
      revealedTurn: 40 + index,
      intelLevel: 'started' as const,
    })),
  };

  const panel = createWonderPanel(container, state, 'city-river', {
    onStartBuild: () => {},
    onClose: () => {},
  });
  const rivalSection = panel.querySelector('[data-section="rival-wonders"]');

  expect(rivalSection?.querySelectorAll('[data-rival-intel-card]')).toHaveLength(4);
  expect(rivalSection?.textContent).toContain('Known Rival City 4');
  expect(rivalSection?.textContent).toContain('Current progress unknown without fresh infiltration.');
  expect(rivalSection?.textContent).not.toContain('production invested');
  expect(rivalSection?.textContent).not.toContain('Quest steps:');
});
```

Keep the existing tests that switch `state.currentPlayer` and prove previous-player intel is absent.

- [ ] **Step 2: Add direct empty rendering and invalid-city integration tests**

Import `appendWonderEmptyState`, then add:

```ts
it('renders the no-ambitions state as an explanatory card', () => {
  const host = document.createElement('div');
  appendWonderEmptyState(
    host,
    'No known wonder ambitions in this city',
    'Keep exploring, researching, or meeting city conditions to reveal new ambitions.',
  );
  const empty = host.querySelector('[data-wonder-empty-state]');
  expect(empty?.textContent).toContain('No known wonder ambitions in this city');
  expect(empty?.textContent).toContain('Keep exploring, researching');
});

it('renders fallback context and no actions for a missing city', () => {
  const { container, state } = makeWonderPanelFixture();
  const panel = createWonderPanel(container, state, 'missing-city', {
    onStartBuild: () => {},
    onClose: () => {},
  });

  expect(panel.textContent).toContain('Player · missing-city');
  expect(panel.querySelector('[data-wonder-error-state]')).not.toBeNull();
  expect(panel.querySelector('[data-wonder-start-target]')).toBeNull();
  expect(panel.querySelector('[data-wonder-panel-close="top"]')).not.toBeNull();
  expect(panel.querySelector('[data-wonder-panel-close="bottom"]')).not.toBeNull();
});

it('does not render current-player ambitions against a foreign selected city', () => {
  const { container, state } = makeWonderPanelFixture();
  const panel = createWonderPanel(container, state, 'city-rival', {
    onStartBuild: () => {},
    onClose: () => {},
  });

  expect(panel.querySelector('[data-wonder-error-state]')).not.toBeNull();
  expect(panel.querySelector('[data-project-card]')).toBeNull();
  expect(panel.querySelector('[data-wonder-start-target]')).toBeNull();
});

it('renders fallback IDs without crashing when the current civilization is missing', () => {
  const { container, state } = makeWonderPanelFixture();
  delete state.civilizations.player;
  const panel = createWonderPanel(container, state, 'city-river', {
    onStartBuild: () => {},
    onClose: () => {},
  });

  expect(panel.textContent).toContain('player · city-river');
  expect(panel.querySelector('[data-wonder-error-state]')).not.toBeNull();
  expect(panel.querySelector('[data-project-card]')).toBeNull();
  expect(panel.querySelector('[data-wonder-start-target]')).toBeNull();
});
```

- [ ] **Step 3: Add empty, error, and rival view helpers**

In `src/ui/wonder-panel-view.ts`:

```ts
export function appendWonderEmptyState(parent: HTMLElement, heading: string, body: string): void {
  const empty = document.createElement('section');
  empty.dataset.wonderEmptyState = 'true';
  empty.style.cssText = COMPACT_CARD_STYLE;
  appendText(empty, 'h3', heading, 'margin:0 0 8px;');
  appendText(empty, 'p', body, 'margin:0;line-height:1.4;');
  parent.appendChild(empty);
}

export function appendWonderErrorState(parent: HTMLElement, body: string): void {
  const error = document.createElement('section');
  error.dataset.wonderErrorState = 'true';
  error.style.cssText = COMPACT_CARD_STYLE;
  appendText(error, 'h3', 'Wonder ambitions unavailable', 'margin:0 0 8px;');
  appendText(error, 'p', body, 'margin:0;line-height:1.4;');
  parent.appendChild(error);
}

export function appendRivalIntelCard(
  intel: LegendaryWonderStartedIntelEntry,
  grid: HTMLElement,
): void {
  const definition = getLegendaryWonderDefinition(intel.wonderId);
  const article = document.createElement('article');
  article.dataset.rivalIntelCard = intel.wonderId;
  article.style.cssText = COMPACT_CARD_STYLE;
  appendText(article, 'h4', definition?.name ?? intel.wonderId, 'margin:0 0 8px;');
  appendText(article, 'p', `${intel.civName} is pursuing this in ${intel.cityName}.`);
  appendText(article, 'p', `Spy report from turn ${intel.revealedTurn}.`);
  appendText(article, 'p', 'Current progress unknown without fresh infiltration.');
  grid.appendChild(article);
}
```

- [ ] **Step 4: Guard panel data access and remove rival truncation**

Import `appendRivalIntelCard`, `appendWonderEmptyState`, and `appendWonderErrorState` from `@/ui/wonder-panel-view`.

Replace `appendRivalIntelSection` with:

```ts
function appendRivalIntelSection(
  shell: HTMLElement,
  entries: LegendaryWonderStartedIntelEntry[],
): void {
  if (entries.length === 0) return;
  const section = document.createElement('section');
  section.dataset.section = 'rival-wonders';
  section.style.cssText = 'margin-top:16px;min-width:0;';
  appendText(section, 'h3', 'In progress elsewhere');
  const grid = createWonderCardGrid('rival');
  for (const entry of entries) appendRivalIntelCard(entry, grid);
  section.appendChild(grid);
  shell.appendChild(section);
}
```

In `createWonderPanel`, always render fallback subtitle IDs, then use this complete branch:

```ts
const selectedCityIsOwned = city?.owner === state.currentPlayer;
if (!civilization || !city || !selectedCityIsOwned) {
  appendWonderErrorState(
    shell,
    !city
      ? `City ${cityId} could not be found. Close this panel and select one of your cities.`
      : `City ${city.name} is not available to ${civilization?.name ?? state.currentPlayer}.`,
  );
} else {
  const cityEntries = getLegendaryWonderPresentationForCity(state, state.currentPlayer, cityId);
  if (cityEntries.length === 0) {
    appendWonderEmptyState(
      shell,
      'No known wonder ambitions in this city',
      'Keep exploring, researching, or meeting city conditions to reveal new ambitions.',
    );
  } else {
    const recommendedEntries = cityEntries
      .filter(entry => entry.visibleState !== 'blocked' && entry.visibleState !== 'completed')
      .slice(0, 3);
    const recommendedIds = new Set(recommendedEntries.map(entry => entry.wonderId));
    const laterEntries = cityEntries.filter(entry => !recommendedIds.has(entry.wonderId));
    if (recommendedEntries.length > 0) {
      appendGuidanceStrip(shell, recommendedEntries[0], startOnce);
    }
    appendProjectSection(
      shell,
      'Best fits right now',
      'recommended-wonders',
      recommendedEntries,
      startOnce,
      'recommended',
    );
    appendProjectSection(
      shell,
      'All ambitions in this city',
      'all-city-wonders',
      laterEntries,
      startOnce,
      'compact',
    );
  }

  const rivalIntel = getLegendaryWonderIntelForViewer(state, state.currentPlayer)
    .filter((entry): entry is LegendaryWonderStartedIntelEntry => entry.kind === 'started');
  appendRivalIntelSection(shell, rivalIntel);
}
```

Give the bottom close button its marker:

```ts
bottomClose.dataset.wonderPanelClose = 'bottom';
```

- [ ] **Step 5: Run focused tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/wonder-panel.test.ts
```

Expected: PASS with four safe rival cards, no cross-viewer leak, and safe missing/foreign city behavior.

- [ ] **Step 6: Commit**

```bash
git add src/ui/wonder-panel.ts src/ui/wonder-panel-view.ts tests/ui/wonder-panel.test.ts
git commit -m "feat(wonders): harden ambition intel and empty states"
```

---

### Task 7: Prove Queue Continuity, Live Refresh, And Regression Safety

**Files:**
- Modify: `tests/ui/wonder-panel.test.ts`
- Inspect: `src/main.ts`
- Inspect: `tests/systems/legendary-wonder-system.test.ts`

- [ ] **Step 1: Strengthen the visible queue/ETA card regression**

Add:

```ts
it('shows active build progress, ETA, and queue continuity from presentation data', () => {
  const { container, city, state } = makeWonderPanelFixture();
  state.legendaryWonderProjects!['oracle-of-delphi'].phase = 'building';
  city.productionQueue = ['legendary:oracle-of-delphi', 'library', 'warrior'];
  city.productionProgress = 72;
  city.focus = 'production';

  const panel = createWonderPanel(container, state, city.id, {
    onStartBuild: () => {},
    onClose: () => {},
  });
  const card = panel.querySelector('[data-project-card="oracle-of-delphi"]');

  expect(card?.textContent).toContain('Under construction');
  expect(card?.textContent).toContain('Race status: 72/120 production invested.');
  expect(card?.textContent).toMatch(/ETA: \d+ turns\./);
  expect(card?.textContent).toContain('Queue resumes after this wonder.');
  expect(card?.querySelector('[data-wonder-start-build]')).toBeNull();
});
```

- [ ] **Step 2: Confirm the canonical queue-preservation regression remains explicit**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/legendary-wonder-system.test.ts -t "preserves every queued city item when a legendary wonder starts"
```

Expected: PASS with:

```ts
[
  'legendary:oracle-of-delphi',
  'library',
  'warrior',
  'worker',
  'shrine',
]
```

- [ ] **Step 3: Preserve the live rerender path**

Inspect:

```bash
rg -n "startLegendaryWonderBuild|openWonderPanel\\(\\)" src/main.ts
```

Confirm the existing `onStartBuild` callback:

1. assigns the result of `startLegendaryWonderBuild`;
2. updates the render loop and HUD;
3. calls `openWonderPanel()` after either success or canonical rejection.

Do not move mutation into UI code. The Task 4 one-shot test covers the pre-rerender stale-node window; the live caller continues to provide post-action visible truth.

- [ ] **Step 4: Run the paired system and UI tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/legendary-wonder-presentation.test.ts tests/ui/wonder-panel.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the regression if Step 1 changed tests**

```bash
git add tests/ui/wonder-panel.test.ts
git commit -m "test(wonders): cover ambition queue and ETA truth"
```

---

### Task 8: Final Verification, Diff Review, And Draft PR Update

**Files:**
- Inspect all files changed by Tasks 1–7.
- Update draft PR #407 body if implementation scope or checks differ.

- [ ] **Step 1: Run source-rule checks for every changed source file**

Run:

```bash
scripts/check-src-rule-violations.sh \
  src/systems/legendary-wonder-presentation.ts \
  src/ui/wonder-panel.ts \
  src/ui/wonder-panel-view.ts
```

Expected: exit 0.

- [ ] **Step 2: Run mirrored tests together**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run \
  tests/systems/legendary-wonder-presentation.test.ts \
  tests/ui/wonder-panel.test.ts
```

Expected: both files pass.

- [ ] **Step 3: Run the mandatory wonder regression suite**

Run:

```bash
./scripts/run-wonder-regressions.sh
```

Expected: all listed wonder, UI, AI, turn-manager, and persistence regressions pass.

- [ ] **Step 4: Build for TypeScript and production-bundle validation**

Run:

```bash
./scripts/run-with-mise.sh yarn build
```

Expected: exit 0. Treat ordinary Vite chunk-size output as a warning only; fix any TypeScript or bundle error.

- [ ] **Step 5: Run the full repository suite before push**

Run:

```bash
./scripts/run-with-mise.sh yarn test
```

Expected: all Vitest files and hook smoke tests pass.

- [ ] **Step 6: Inspect committed and uncommitted changes, including full source/test diffs**

Run:

```bash
git diff --stat origin/main...HEAD
git diff --stat
git diff --check
git diff origin/main...HEAD -- \
  src/systems/legendary-wonder-presentation.ts \
  src/ui/wonder-panel.ts \
  src/ui/wonder-panel-view.ts \
  tests/systems/legendary-wonder-presentation.test.ts \
  tests/ui/wonder-panel.test.ts \
  tests/ui/helpers/wonder-panel-fixture.ts
git diff
```

Expected:

- branch diff contains only issue #396 docs/mockups plus the intended presentation, UI, and mirrored-test changes;
- local diff is empty after the final commit;
- full diff shows no `innerHTML`, hardcoded `'player'` in source, duplicate eligibility/ranking logic, fixed-width mobile overflow, rival live-project reads, or dead buttons;
- whitespace check exits 0.

- [ ] **Step 7: Replay the player-visible checklist from test evidence**

Confirm:

- all seven status chips are tied to exact project cards;
- quest rows say Complete/Pending as well as using symbols and color;
- guidance blocker priority is truthful;
- duplicate CTAs invoke one callback and disable together;
- every canonical city entry renders exactly once;
- compact cards retain decision data without full repeated quest lists;
- all viewer-safe rival reports render and cross-viewer reports do not;
- missing/foreign city paths expose no action;
- phone/laptop style invariants and 44px buttons are present;
- active construction shows progress, ETA, and queue continuity.

- [ ] **Step 8: Update draft PR #407 and push**

The PR body must include:

- the presentation-only fix for seeded `near`/`blocked` truth;
- guided/full versus catalog/compact responsive behavior;
- one-shot CTA and live rerender behavior;
- all-intel privacy behavior;
- gameplay impact: no eligibility, quest, race, recommendation-score, reward, or queue mutation changes;
- exact checks run;
- screenshots already in the draft design assets, with no HTTP server started for this plan.

Then push:

```bash
git push origin codex/issue-396-wonder-ui-brainstorm
```

Expected: draft PR #407 updates to the verified implementation commits.

## Out Of Scope

- Changing legendary-wonder gameplay eligibility, quest definitions, reward balance, construction cost, recommendation scoring, race compensation, or AI behavior.
- Adding wonder art, animation, sound effects, or new network/runtime dependencies.
- Adding a separate Wonder Atlas flow.
- Replacing the city-panel Legendary Wonders launcher.
- Adding queue reorder/remove controls.

No gameplay balance values change in this work. The gameplay-quality gain is informational: players can distinguish “work on this quest,” “meet these near-term requirements,” “far-future blocked,” “build now,” and “race already underway” without the UI overstating what is actionable.
