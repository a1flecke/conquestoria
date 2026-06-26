# Issue #396 Wonder Ambitions UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Do not use subagents; this repository forbids them.

**Goal:** Redesign `src/ui/wonder-panel.ts` into the selected Option A hybrid Wonder Ambitions surface with guided cards, status chips, quest checklists, complete catalog reachability, viewer-safe rival intel, and tested stale-DOM behavior.

**Architecture:** Keep all gameplay, eligibility, recommendation, and rival-intel semantics in the existing presentation helpers. Refactor only the DOM rendering layer by adding small local render helpers and style constants in `src/ui/wonder-panel.ts`; extract a sibling helper only if the file becomes difficult to scan during implementation. Tests assert the visible DOM contract rather than internal state alone.

**Tech Stack:** TypeScript, DOM APIs, `createGameButton`, Vitest with jsdom, existing legendary wonder presentation/system helpers.

---

## Source Spec

- Design spec: `docs/superpowers/specs/2026-06-26-issue-396-wonder-ambitions-ui-design.md`
- Issue: <https://github.com/a1flecke/conquestoria/issues/396>
- Mockup reference: `docs/superpowers/specs/assets/issue-396-wonder-ambitions-option-a-guided-cards.svg`

## File Structure

- Modify: `src/ui/wonder-panel.ts`
  - Owns DOM rendering for the Wonder Ambitions panel.
  - Add local style constants and helpers:
    - `appendStatusChip(parent, entry)`
    - `appendQuestChecklist(parent, entry)`
    - `appendRewardRow(parent, entry)`
    - `appendRaceSummary(parent, entry)`
    - `appendGuidanceStrip(panel, recommendedEntry, callbacks, cityId)`
    - updated `appendProjectCard(...)`
  - Must not recompute recommendation ranking, eligibility, or rival intel.
- Modify: `tests/ui/wonder-panel.test.ts`
  - Locks visible DOM markers, chips, quest rows, guidance behavior, catalog reachability, privacy, and stale-action behavior.
- Optional modify: `tests/ui/helpers/wonder-panel-fixture.ts`
  - Add fixture helpers only if tests need cleaner state setup.
- Do not modify gameplay systems unless implementation exposes a genuine presentation-data gap. If that happens, stop and update the plan before coding.

## Player Truth Table

| Before | Player action | Internal state path | Immediate visible result |
| --- | --- | --- | --- |
| A ready recommended wonder appears in the guidance strip and card | Click guidance-strip `Start Construction` | Calls `onStartBuild(cityId, wonderId)` with selected city | Live caller closes or rerenders the panel; the same stale CTA is not clickable again. |
| A ready recommended wonder appears in its card | Click card `Start Construction` | Calls `onStartBuild(cityId, wonderId)` with selected city | Same callback contract as guidance CTA. |
| A questing, near, blocked, building, completed, or recovered recommendation appears | Read guidance strip | No mutation | Guidance strip gives next-step/status copy and renders no start CTA. |
| A lower-ranked ambition is outside the recommended set | Scroll to `All ambitions in this city` | No mutation | The ambition remains visible exactly once with status, reward, quest count, and missing/next-step copy. |
| Rival wonder intel exists for one hot-seat player | Other hot-seat player opens panel | Reads `getLegendaryWonderIntelForViewer` for current player | Rival intel does not leak. |

## Misleading UI Risks

- `Best fits right now` is a recommendation surface, not the catalog. Tests must prove non-recommended entries remain visible.
- `Best move right now` must not imply buildability unless `entry.canStartBuild` is true.
- `Available soon` and `Blocked` must come from `entry.visibleState`; UI code must not rederive them.
- Quest rows are completed versus pending only. Do not invent per-step blocked semantics.
- Rival intel must render only viewer-safe `getLegendaryWonderIntelForViewer` entries.

## Interaction Replay Checklist

- Open panel with ready recommended wonder.
- Click guidance CTA.
- Verify callback arguments and, in the live caller path, rerender/close behavior prevents stale repeat-click.
- Open panel with ready recommended wonder again.
- Click card CTA.
- Verify callback arguments.
- Open panel with questing/near recommendation.
- Verify no guidance CTA and no dead primary CTA.
- Open panel with many seeded entries.
- Verify recommended truncation does not hide the remaining catalog.

## Queue And ETA Checklist

- Wonder start preserves existing production queue behavior in `startLegendaryWonderBuild`; this plan does not change that gameplay path.
- Wonder card must display existing queue continuity copy before the start click when `entry.queueContinuityLabel` is available or the existing copy indicates current queue continues afterward.
- Tests must keep coverage that pre-existing queued production survives starting a wonder and that the visible copy explains the continuity before the click.
- No reorder/remove queue UI is added by this plan.

---

### Task 1: Add Visible Contract Tests For Status Chips And Quest Rows

**Files:**
- Modify: `tests/ui/wonder-panel.test.ts`
- Optional Modify: `tests/ui/helpers/wonder-panel-fixture.ts`

- [ ] **Step 1: Add failing status-chip and quest-row tests**

Add these tests near the existing `wonder-panel` tests. Use existing fixture state transitions where possible.

```ts
it('renders semantic status chips for the visible wonder states', () => {
  const { container, city, state } = makeWonderPanelFixture();
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
  state.completedLegendaryWonders = {
    'moonwell-gardens': { ownerId: 'player', cityId: city.id, turnCompleted: state.turn },
  };
  state.legendaryWonderProjects!['sun-spire'] = {
    wonderId: 'sun-spire',
    ownerId: 'player',
    cityId: city.id,
    phase: 'lost_race',
    investedProduction: 0,
    transferableProduction: 45,
    questSteps: [{ id: 'sun-step', description: 'Recover effort.', completed: true }],
  };

  const panel = createWonderPanel(container, initializeLegendaryWonderProjectsForCity(state, 'player', city.id), city.id, {
    onStartBuild: () => {},
    onClose: () => {},
  });

  const chips = Array.from(panel.querySelectorAll('[data-wonder-status-chip]'));
  const states = chips.map(chip => (chip as HTMLElement).dataset.wonderStatusChip);
  expect(states).toContain('ready');
  expect(states).toContain('questing');
  expect(states).toContain('building');
  expect(states).toContain('completed');
  expect(states).toContain('recovered');
  expect(states).toContain('near');
  expect(states).toContain('blocked');
  expect(chips.map(chip => chip.textContent)).toContain('Ready to build');
  expect(chips.map(chip => chip.textContent)).toContain('Quest in progress');
  expect(chips.map(chip => chip.textContent)).toContain('Under construction');
  expect(chips.map(chip => chip.textContent)).toContain('Completed');
  expect(chips.map(chip => chip.textContent)).toContain('Race lost');
  expect(chips.map(chip => chip.textContent)).toContain('Available soon');
  expect(chips.map(chip => chip.textContent)).toContain('Blocked');
});

it('renders quest checklist rows as completed or pending without inventing blocked step state', () => {
  const { container, state } = makeWonderPanelFixture();
  state.legendaryWonderProjects!['oracle-of-delphi'].questSteps = [
    { id: 'found-site', description: 'Discover a natural wonder.', completed: true },
    { id: 'finish-rite', description: 'Complete the rite.', completed: false },
  ];

  const panel = createWonderPanel(container, state, 'city-river', {
    onStartBuild: () => {},
    onClose: () => {},
  });

  const checklist = panel.querySelector('[data-wonder-quest-list="oracle-of-delphi"]');
  expect(checklist).not.toBeNull();
  const rows = Array.from(checklist!.querySelectorAll('[data-wonder-quest-step]')) as HTMLElement[];
  expect(rows.map(row => row.dataset.wonderQuestStep)).toEqual(['completed', 'pending']);
  expect(rows[0].textContent).toContain('✓');
  expect(rows[0].textContent).toContain('Discover a natural wonder.');
  expect(rows[1].textContent).toContain('○');
  expect(rows[1].textContent).toContain('Complete the rite.');
  expect(rows.some(row => row.dataset.wonderQuestStep === 'blocked')).toBe(false);
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/wonder-panel.test.ts
```

Expected: FAIL because `[data-wonder-status-chip]` and `[data-wonder-quest-list]` do not exist yet.

- [ ] **Step 3: Leave the red test changes uncommitted and continue to implementation**

Do not commit the red state. The next task implements the minimum rendering contract, then commits after the focused test is green.

---

### Task 2: Add Card Rendering Helpers, Status Chips, Quest Checklist, Reward, And Race Rows

**Files:**
- Modify: `src/ui/wonder-panel.ts`
- Test: `tests/ui/wonder-panel.test.ts`

- [ ] **Step 1: Add style constants and helper signatures**

In `src/ui/wonder-panel.ts`, add local style constants near the top after `appendText`.

```ts
const CARD_BASE_STYLE = [
  'background:rgba(255,255,255,0.06)',
  'border:1px solid rgba(255,255,255,0.12)',
  'border-radius:12px',
  'padding:14px',
  'margin-bottom:12px',
].join(';');

const RECOMMENDED_CARD_STYLE = [
  CARD_BASE_STYLE,
  'border-color:rgba(232,193,112,0.55)',
  'box-shadow:0 0 0 1px rgba(232,193,112,0.12)',
].join(';');

const COMPACT_CARD_STYLE = [
  CARD_BASE_STYLE,
  'background:rgba(255,255,255,0.045)',
].join(';');

const CHIP_BASE_STYLE = [
  'display:inline-flex',
  'align-items:center',
  'gap:4px',
  'border-radius:999px',
  'padding:3px 8px',
  'font-size:11px',
  'font-weight:700',
  'margin-right:6px',
  'margin-bottom:6px',
].join(';');
```

- [ ] **Step 2: Add status style and icon helpers**

Add these helpers below `getVisibleStateLabel`.

```ts
function getStatusChipStyle(state: LegendaryWonderVisibleState): string {
  const colors: Record<LegendaryWonderVisibleState, string> = {
    ready: 'background:rgba(122,216,143,0.18);border:1px solid rgba(122,216,143,0.52);color:#d9f8df',
    questing: 'background:rgba(215,173,88,0.18);border:1px solid rgba(215,173,88,0.52);color:#f4d188',
    building: 'background:rgba(104,166,255,0.18);border:1px solid rgba(104,166,255,0.48);color:#d7e8ff',
    completed: 'background:rgba(122,216,143,0.16);border:1px solid rgba(122,216,143,0.45);color:#d9f8df',
    recovered: 'background:rgba(215,173,88,0.12);border:1px solid rgba(215,173,88,0.36);color:#dfc891',
    near: 'background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.20);color:#e8eef8',
    blocked: 'background:rgba(224,114,114,0.14);border:1px solid rgba(224,114,114,0.42);color:#f3b5b5',
  };
  return `${CHIP_BASE_STYLE};${colors[state]}`;
}

function getStatusIcon(state: LegendaryWonderVisibleState): string {
  const icons: Record<LegendaryWonderVisibleState, string> = {
    ready: '✓',
    questing: '…',
    building: '⚒️',
    completed: '★',
    recovered: '↩',
    near: '◇',
    blocked: '!',
  };
  return icons[state];
}
```

- [ ] **Step 3: Add rendering helpers**

Add these helpers before `appendProjectCard`.

```ts
function appendStatusChip(parent: HTMLElement, entry: LegendaryWonderPresentationEntry): HTMLElement {
  const chip = document.createElement('span');
  chip.dataset.wonderStatusChip = entry.visibleState;
  chip.style.cssText = getStatusChipStyle(entry.visibleState);
  chip.textContent = `${getStatusIcon(entry.visibleState)} ${getVisibleStateLabel(entry.visibleState)}`;
  parent.appendChild(chip);
  return chip;
}

function appendBestFitChip(parent: HTMLElement, entry: LegendaryWonderPresentationEntry): void {
  const chip = document.createElement('span');
  chip.dataset.wonderBestFitChip = entry.wonderId;
  chip.style.cssText = `${CHIP_BASE_STYLE};background:rgba(232,193,112,0.18);border:1px solid rgba(232,193,112,0.55);color:#f4d188`;
  chip.textContent = 'Best fit';
  parent.appendChild(chip);
}

function appendQuestChecklist(parent: HTMLElement, entry: LegendaryWonderPresentationEntry): void {
  const wrapper = document.createElement('div');
  wrapper.dataset.wonderQuestList = entry.wonderId;
  wrapper.style.cssText = 'display:flex;flex-direction:column;gap:6px;margin:8px 0 10px;';
  appendText(wrapper, 'p', `Quest steps: ${entry.questCompleted}/${entry.questTotal} complete.`);
  for (const step of entry.questSteps) {
    const row = document.createElement('div');
    row.dataset.wonderQuestStep = step.completed ? 'completed' : 'pending';
    row.style.cssText = 'display:flex;gap:8px;align-items:flex-start;font-size:13px;line-height:1.35;';
    const icon = document.createElement('span');
    icon.textContent = step.completed ? '✓' : '○';
    icon.style.cssText = `color:${step.completed ? '#7ad88f' : '#d7ad58'};font-weight:bold;`;
    const label = document.createElement('span');
    label.textContent = step.description;
    row.appendChild(icon);
    row.appendChild(label);
    wrapper.appendChild(row);
  }
  parent.appendChild(wrapper);
}

function appendRewardRow(parent: HTMLElement, entry: LegendaryWonderPresentationEntry): void {
  const row = appendText(parent, 'p', `Reward: ${entry.rewardSummary}`);
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
  const row = appendText(parent, 'p', text);
  row.dataset.wonderRaceSummary = entry.wonderId;
}
```

- [ ] **Step 4: Replace the flat card body with the helper-based card body**

Inside `appendProjectCard`, use the helpers and keep all existing copy that matters.

```ts
article.style.cssText = options.recommended ? RECOMMENDED_CARD_STYLE : COMPACT_CARD_STYLE;

const heading = appendText(article, 'h3', `${options.recommended ? '🏛️ ' : ''}${entry.name}`);
heading.style.cssText = 'margin:0 0 8px;';

const chipRow = document.createElement('div');
chipRow.style.cssText = 'display:flex;flex-wrap:wrap;align-items:center;gap:4px;margin-bottom:4px;';
appendStatusChip(chipRow, entry);
if (options.recommended) appendBestFitChip(chipRow, entry);
article.appendChild(chipRow);

appendText(article, 'p', `Requires ${entry.productionCost} production.`);
appendText(article, 'p', entry.missingRequirements.length > 0
  ? `Missing: ${entry.missingRequirements.join(', ')}.`
  : 'Missing: none.');
appendQuestChecklist(article, entry);
appendRewardRow(article, entry);
if (entry.milestoneLabel) appendText(article, 'p', `Construction: ${entry.milestoneLabel}.`);
if (entry.turnsRemaining !== null) appendText(article, 'p', `${entry.turnsRemaining} turns remaining.`);
if (entry.raceTensionLabel) appendText(article, 'p', entry.raceTensionLabel);
if (entry.queueContinuityLabel) appendText(article, 'p', entry.queueContinuityLabel);
if (entry.productionResumedLabel) appendText(article, 'p', entry.productionResumedLabel);
if (entry.visibleState === 'completed') appendText(article, 'p', 'Reward active.');
if (entry.recoveryLabel) appendText(article, 'p', entry.recoveryLabel);
appendRaceSummary(article, entry);
```

- [ ] **Step 5: Run the focused test and verify Task 1 tests pass**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/wonder-panel.test.ts
```

Expected: PASS for the new status-chip and quest-row tests while existing glossary-copy tests still pass because the old glossary has not been removed yet.

- [ ] **Step 6: Commit**

```bash
git add src/ui/wonder-panel.ts tests/ui/wonder-panel.test.ts tests/ui/helpers/wonder-panel-fixture.ts
git commit -m "feat(wonders): render ambition cards with status chips"
```

---

### Task 3: Add Guidance Strip And CTA Contract

**Files:**
- Modify: `src/ui/wonder-panel.ts`
- Modify: `tests/ui/wonder-panel.test.ts`

- [ ] **Step 1: Add failing guidance-strip tests**

Add tests near the start-action tests.

```ts
it('renders a best-move guidance CTA only for a startable recommended wonder', () => {
  const { container, state } = makeWonderPanelFixture();
  state.wonderDiscoverers = { 'natural-1': ['player'] };
  state.marketplace = {
    prices: {} as any,
    priceHistory: {} as any,
    fashionable: null,
    fashionTurnsLeft: 0,
    tradeRoutes: [{
      id: 'route-1',
      fromCityId: 'city-river',
      toCityId: 'city-rival',
      goldPerTrip: 12,
      turnsPerTrip: 3,
      foreignCivId: 'rival',
    }],
  };
  const seededState = initializeLegendaryWonderProjectsForCity(state, 'player', 'city-river');
  const onStartBuild = vi.fn();

  const panel = createWonderPanel(container, seededState, 'city-river', {
    onStartBuild,
    onClose: () => {},
  });

  const guidance = panel.querySelector<HTMLElement>('[data-wonder-guidance]');
  expect(guidance).not.toBeNull();
  expect(guidance?.textContent).toContain('Best move right now');
  const cta = guidance!.querySelector<HTMLButtonElement>('[data-wonder-guidance-start-build]');
  expect(cta).not.toBeNull();
  cta!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  expect(onStartBuild).toHaveBeenCalledWith('city-river', cta!.dataset.wonderGuidanceStartBuild);
});

it('does not render a guidance start CTA for a non-startable recommended wonder', () => {
  const { container, state } = makeWonderPanelFixture();
  state.legendaryWonderProjects!['oracle-of-delphi'].phase = 'questing';
  state.legendaryWonderProjects!['oracle-of-delphi'].questSteps = [
    { id: 'pending', description: 'Complete the omen rite.', completed: false },
  ];

  const panel = createWonderPanel(container, state, 'city-river', {
    onStartBuild: () => {},
    onClose: () => {},
  });

  const guidance = panel.querySelector<HTMLElement>('[data-wonder-guidance]');
  expect(guidance).not.toBeNull();
  expect(guidance?.querySelector('[data-wonder-guidance-start-build]')).toBeNull();
  expect(guidance?.textContent).toContain('Complete the omen rite.');
});
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/wonder-panel.test.ts
```

Expected: FAIL because `[data-wonder-guidance]` does not exist yet.

- [ ] **Step 3: Implement guidance copy helper**

Add this helper in `src/ui/wonder-panel.ts`.

```ts
function getGuidanceCopy(entry: LegendaryWonderPresentationEntry): string {
  if (entry.canStartBuild) {
    return `${entry.name} is ready. Starting now begins the construction race while preserving queued production.`;
  }
  const pendingStep = entry.questSteps.find(step => !step.completed);
  if (pendingStep) return `${entry.name}: next step — ${pendingStep.description}`;
  if (entry.missingRequirements.length > 0) return `${entry.name}: missing ${entry.missingRequirements.join(', ')}.`;
  if (entry.visibleState === 'building') return `${entry.name}: construction is already underway.`;
  if (entry.visibleState === 'completed') return `${entry.name}: reward is already active.`;
  if (entry.visibleState === 'recovered') return `${entry.name}: race lost, but recovered effort remains available.`;
  return `${entry.name}: review the card below for the next step.`;
}
```

- [ ] **Step 4: Implement `appendGuidanceStrip`**

Add this helper in `src/ui/wonder-panel.ts`.

```ts
function appendGuidanceStrip(
  panel: HTMLElement,
  entry: LegendaryWonderPresentationEntry,
  callbacks: WonderPanelCallbacks,
  cityId: string,
): void {
  const strip = document.createElement('section');
  strip.dataset.wonderGuidance = entry.wonderId;
  strip.style.cssText = [
    'background:rgba(232,193,112,0.10)',
    'border:1px solid rgba(232,193,112,0.28)',
    'border-radius:14px',
    'padding:12px',
    'margin-bottom:14px',
  ].join(';');
  appendText(strip, 'h3', 'Best move right now');
  appendText(strip, 'p', getGuidanceCopy(entry));
  if (entry.canStartBuild && entry.startActionLabel) {
    const button = createGameButton(entry.startActionLabel, 'primary');
    button.dataset.wonderGuidanceStartBuild = entry.wonderId;
    button.addEventListener('click', () => callbacks.onStartBuild(cityId, entry.wonderId));
    strip.appendChild(button);
  }
  panel.appendChild(strip);
}
```

- [ ] **Step 5: Call guidance helper after recommended entries are known**

In `createWonderPanel`, after `recommendedEntries` and `laterEntries` are computed and before `appendProjectSection(...)`, add:

```ts
if (recommendedEntries.length > 0) {
  appendGuidanceStrip(panel, recommendedEntries[0], callbacks, cityId);
}
```

- [ ] **Step 6: Run focused tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/wonder-panel.test.ts
```

Expected: PASS for guidance tests.

- [ ] **Step 7: Commit**

```bash
git add src/ui/wonder-panel.ts tests/ui/wonder-panel.test.ts
git commit -m "feat(wonders): add ambition guidance strip"
```

---

### Task 4: Remove Glossary-Style Intro And Preserve Complete Catalog Reachability

**Files:**
- Modify: `src/ui/wonder-panel.ts`
- Modify: `tests/ui/wonder-panel.test.ts`

- [ ] **Step 1: Update the old glossary test into contextual-copy assertions**

Replace the current test named `shows eligibility, quest steps, build city, and race compensation text` with:

```ts
it('teaches wonder rules through contextual card copy instead of glossary blocks', () => {
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
  expect(rendered).toContain('Race status:');
  expect(rendered).toContain('Reward:');
  expect(rendered).toContain('Discover a natural wonder');
});
```

- [ ] **Step 2: Add complete-catalog negative test**

Add this test near `does not overwhelm the player with an undifferentiated list of wonders`.

```ts
it('keeps non-recommended near and blocked ambitions visible exactly once', () => {
  const { container, state } = makeWonderPanelFixture();
  state.civilizations.player.techState.completed = ['philosophy', 'pilgrimages'];
  const seededState = initializeLegendaryWonderProjectsForCity(state, 'player', 'city-river');

  const panel = createWonderPanel(container, seededState, 'city-river', {
    onStartBuild: () => {},
    onClose: () => {},
  });

  const cards = Array.from(panel.querySelectorAll<HTMLElement>('[data-project-card]'));
  const ids = cards.map(card => card.dataset.projectCard);
  expect(new Set(ids).size).toBe(ids.length);
  expect(ids).toContain('world-archive');
  expect(ids).toContain('manhattan-project');
  expect(panel.querySelector('[data-section="all-city-wonders"]')?.textContent).toContain('World Archive');
  expect(panel.querySelector('[data-section="all-city-wonders"]')?.textContent).toContain('Manhattan Project');
});
```

- [ ] **Step 3: Run test to verify failure**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/wonder-panel.test.ts
```

Expected: FAIL while old glossary sections still render or while new complete-catalog markers are missing.

- [ ] **Step 4: Remove global intro sections**

In `createWonderPanel`, delete the `appendIntroSection` helper and these calls:

```ts
appendIntroSection(
  'Eligibility',
  'Required techs, resources, and city conditions must still be true when construction starts.',
);
appendIntroSection('Quest', 'Complete every step before construction unlocks.');
appendIntroSection('Construction Race', 'Losing returns 25% coins and 25% carryover.');
```

- [ ] **Step 5: Ensure contextual card rows cover requirements, quest, race, reward**

Keep these rows inside `appendProjectCard`:

```ts
appendText(article, 'p', entry.missingRequirements.length > 0
  ? `Missing: ${entry.missingRequirements.join(', ')}.`
  : 'Missing: none.');
appendQuestChecklist(article, entry);
appendRewardRow(article, entry);
appendRaceSummary(article, entry);
```

- [ ] **Step 6: Run focused tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/wonder-panel.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/ui/wonder-panel.ts tests/ui/wonder-panel.test.ts
git commit -m "feat(wonders): make ambitions catalog contextual"
```

---

### Task 5: Lock CTA Safety, Queue Continuity Copy, And Stale DOM Refresh

**Files:**
- Modify: `tests/ui/wonder-panel.test.ts`
- Modify: `src/ui/wonder-panel.ts` if tests expose missing datasets/copy
- Inspect: `src/main.ts:987-1012`

- [ ] **Step 1: Add CTA safety and queue continuity test**

Add or update a test near `starts construction from the selected city and keeps the panel action explicit`.

```ts
it('renders no dead primary CTA and explains queue continuity before starting', () => {
  const { container, city, state } = makeWonderPanelFixture();
  state.legendaryWonderProjects!['oracle-of-delphi'].phase = 'ready_to_build';
  city.productionQueue = ['warrior'];
  const onStartBuild = vi.fn();

  const panel = createWonderPanel(container, state, city.id, {
    onStartBuild,
    onClose: () => {},
  });

  const startButtons = Array.from(panel.querySelectorAll<HTMLButtonElement>('[data-wonder-start-build="oracle-of-delphi"]'));
  expect(startButtons).toHaveLength(1);
  expect(panel.textContent).toContain('current queue continues after this wonder');
  expect(panel.querySelector('[data-wonder-start-build="grand-canal"]')).toBeNull();

  startButtons[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
  expect(onStartBuild).toHaveBeenCalledWith(city.id, 'oracle-of-delphi');
});
```

- [ ] **Step 2: Add implementation-caller refresh note test if a main/UI integration harness exists**

Search first:

```bash
rg -n "openWonderPanelForCityId|startLegendaryWonderBuild|renderLoop.setGameState" tests src/main.ts
```

If there is no existing `main.ts` integration harness, do not create a brittle full-main test. Instead, keep the source inspection in this plan and rely on `src/main.ts:993-1005`, which already calls `openWonderPanel()` after `startLegendaryWonderBuild`. Preserve that code path in implementation and call it out in the PR body.

- [ ] **Step 3: Ensure start buttons have the required dataset**

In `appendProjectCard`, update the existing card CTA block:

```ts
if (entry.canStartBuild && entry.startActionLabel) {
  appendText(article, 'p', 'Starting now makes this the active production; current queue continues after this wonder.');
  const startBuild = createGameButton(entry.startActionLabel, 'primary');
  startBuild.dataset.wonderStartBuild = entry.wonderId;
  startBuild.addEventListener('click', () => callbacks.onStartBuild(cityId, entry.wonderId));
  article.appendChild(startBuild);
}
```

- [ ] **Step 4: Run focused tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/wonder-panel.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/wonder-panel.ts tests/ui/wonder-panel.test.ts
git commit -m "test(wonders): protect ambition start actions"
```

---

### Task 6: Preserve Rival Intel Privacy And Empty/Error States In The New Layout

**Files:**
- Modify: `src/ui/wonder-panel.ts`
- Modify: `tests/ui/wonder-panel.test.ts`

- [ ] **Step 1: Add rival intel styling marker test**

Update existing rival tests to keep their current privacy assertions and add stable marker assertions:

```ts
expect(rivalSection?.querySelector('[data-rival-intel-card="grand-canal"]')).not.toBeNull();
expect(rivalSection?.textContent).toContain('Current progress unknown without fresh infiltration.');
```

- [ ] **Step 2: Add empty-state card test**

Add this test:

```ts
it('renders no-ambitions empty state as an explanatory card', () => {
  const { container, state } = makeWonderPanelFixture();
  state.legendaryWonderProjects = {};
  state.completedLegendaryWonders = {};
  state.civilizations.player.techState.completed = [];

  const panel = createWonderPanel(container, state, 'city-river', {
    onStartBuild: () => {},
    onClose: () => {},
  });

  const empty = panel.querySelector('[data-wonder-empty-state]');
  expect(empty).not.toBeNull();
  expect(empty?.textContent).toContain('No known wonder ambitions in this city');
  expect(empty?.textContent).toContain('Keep exploring, researching, or meeting city conditions');
});
```

- [ ] **Step 3: Run focused test and verify failure**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/wonder-panel.test.ts
```

Expected: FAIL until empty state has `[data-wonder-empty-state]` and updated copy.

- [ ] **Step 4: Implement styled empty state**

Replace the empty `cityEntries.length === 0` branch with:

```ts
if (cityEntries.length === 0) {
  const empty = document.createElement('section');
  empty.dataset.wonderEmptyState = 'true';
  empty.style.cssText = COMPACT_CARD_STYLE;
  appendText(empty, 'h3', 'No known wonder ambitions in this city');
  appendText(empty, 'p', 'Keep exploring, researching, or meeting city conditions to reveal new legendary ambitions here.');
  panel.appendChild(empty);
}
```

- [ ] **Step 5: Run focused tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/wonder-panel.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/ui/wonder-panel.ts tests/ui/wonder-panel.test.ts
git commit -m "feat(wonders): preserve ambition privacy and empty states"
```

---

### Task 7: Final Verification And PR Update

**Files:**
- Inspect: `src/ui/wonder-panel.ts`
- Inspect: `tests/ui/wonder-panel.test.ts`
- Update PR body only if implementation scope or verification differs from this plan.

- [ ] **Step 1: Run src rule checks**

Run:

```bash
scripts/check-src-rule-violations.sh src/ui/wonder-panel.ts
```

Expected: exit 0.

- [ ] **Step 2: Run mirrored UI test**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/wonder-panel.test.ts
```

Expected: all `wonder-panel` tests pass.

- [ ] **Step 3: Run build**

Run:

```bash
./scripts/run-with-mise.sh yarn build
```

Expected: exit 0.

- [ ] **Step 4: Run full tests before push**

Run:

```bash
./scripts/run-with-mise.sh yarn test
```

Expected: all test files pass; hook smoke tests pass.

- [ ] **Step 5: Inspect diffs**

Run:

```bash
git diff --stat origin/main...HEAD
git diff --stat
git diff --check
```

Expected:

- branch diff includes only the intended docs, `src/ui/wonder-panel.ts`, and `tests/ui/wonder-panel.test.ts` changes;
- local diff is empty after final commit;
- whitespace check exits 0.

- [ ] **Step 6: Update draft PR body**

Update PR #407 with:

- implementation summary;
- UI/UX changes;
- tests run;
- note that no gameplay rules, recommendation ranking, or rival intel semantics changed.

- [ ] **Step 7: Push**

```bash
git push origin codex/issue-396-wonder-ui-brainstorm
```

Expected: branch pushed.
