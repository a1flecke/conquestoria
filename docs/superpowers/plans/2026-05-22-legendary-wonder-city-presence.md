# Legendary Wonder City Presence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task inline. Do not use subagents unless the user explicitly re-authorizes them for this slice. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Stage 2C city-first legendary wonder presence: clearer city construction state, owner-only completion ceremony, minimal Atlas labels, and viewer-safe completed landmarks around host cities.

**Architecture:** Core legendary systems remain authoritative for mutation. System-adjacent presentation helpers derive viewer-safe UI and map entries; DOM modules render ceremonies and city/Atlas surfaces; Canvas renderer draws only ready-to-draw landmark entries. `main.ts` subscribes to events and delegates orchestration to focused queue modules.

**Tech Stack:** TypeScript, Vitest, jsdom UI tests, Canvas 2D renderer, existing EventBus, existing Wonder Atlas, city panel, wonder panel, and renderer modules. Designed for GPT-5.4 on medium effort.

---

## Scope Check

This is one cohesive implementation slice. It touches multiple layers, but they are sequentially dependent: completion event payload -> presentation helpers -> city UI/ceremony -> Atlas/map presentation -> renderer wiring. Do not split these into independent PRs unless the PR body explicitly lists omitted player-visible surfaces and proves no dead-end UX ships.

## File Structure

- Modify `src/core/types.ts`
  - Add `turnCompleted` to `wonder:legendary-completed` event payload.
- Modify `src/systems/legendary-wonder-system.ts`
  - Emit `turnCompleted` from the mutation source.
- Modify `src/ui/legendary-wonder-notifications.ts`
  - Accept the widened completion event shape without leaking `turnCompleted`.
- Modify `src/ui/notification-routing.ts`
  - Accept the widened completion event shape.
- Modify `src/systems/legendary-wonder-presentation.ts`
  - Add city-facing milestone, progress, ETA, race/recovery, queue-continuity, and production-resumed labels.
- Create `src/systems/legendary-wonder-completion-presentation.ts`
  - Build owner-safe ceremony items from event payloads.
- Create `src/ui/legendary-wonder-completion-ceremony.ts`
  - Render the owner-only skippable overlay.
- Create `src/ui/legendary-wonder-completion-queue.ts`
  - Queue and sequence completion ceremonies.
- Modify `src/ui/city-panel.ts`
  - Render compact active legendary construction/recovery/completion state.
- Modify `src/ui/wonder-panel.ts`
  - Align Journal state with new presentation fields.
- Modify `src/systems/wonder-atlas-presentation.ts`
  - Add minimal safe legendary state labels.
- Modify `src/ui/wonder-atlas-panel.ts`
  - Render those labels without adding full detail pages.
- Modify `src/systems/wonder-visual-catalog.ts`
  - Add legendary completed landmark metadata.
- Create `src/systems/legendary-wonder-map-presentation.ts`
  - Return viewer-safe landmark entries.
- Create `src/renderer/wonders/legendary-wonder-slots.ts`
  - Pure deterministic around-city slot helper.
- Create `src/renderer/wonders/legendary-wonder-renderer.ts`
  - Draw viewer-safe completed landmarks.
- Modify `src/renderer/city-renderer.ts`
  - Draw completed legendary landmarks near city rendering without stealing input.
- Modify `src/renderer/render-loop.ts`
  - Pass the existing reduced-motion setting into city rendering.
- Modify `src/ui/territory-inspection-panel.ts`
  - Mention completed legendary wonders when safely visible.
- Modify `src/main.ts`
  - Wire completion queue, event delegation, Atlas refresh, and renderer refresh.
- Tests:
  - `tests/systems/legendary-wonder-system.test.ts`
  - `tests/systems/legendary-wonder-presentation.test.ts`
  - `tests/systems/legendary-wonder-completion-presentation.test.ts`
  - `tests/systems/wonder-atlas-presentation.test.ts`
  - `tests/systems/legendary-wonder-map-presentation.test.ts`
  - `tests/ui/city-panel.test.ts`
  - `tests/ui/wonder-panel.test.ts`
  - `tests/ui/legendary-wonder-completion-ceremony.test.ts`
  - `tests/ui/legendary-wonder-completion-queue.test.ts`
  - `tests/ui/wonder-atlas-panel.test.ts`
  - `tests/ui/territory-inspection-panel.test.ts`
  - `tests/renderer/legendary-wonder-slots.test.ts`
  - `tests/renderer/legendary-wonder-renderer.test.ts`
  - `tests/renderer/city-renderer.test.ts`

## Player Truth Table

| Before | Action | Internal change | Immediate visible result | Must remain reachable |
| --- | --- | --- | --- | --- |
| City panel shows a `Ready` legendary wonder in Wonder Ambitions | Click `Start Construction` in Journal | `startLegendaryWonderBuild` inserts `legendary:<id>` at active production | City panel rerenders with active legendary medallion, progress, ETA, `Foundation laid`, and queue-continuity copy | Queue follow-ups, Wonder Journal, Build list |
| City panel shows active legendary wonder at 60% | End turn / production ticks | Existing production progress increases | City row updates milestone to `Final works` and ETA decreases | Journal detail, queue controls |
| City completes legendary wonder | Completion event fires | Core state records completion and queue resumes | Owner sees completion ceremony; after resolving, city shows `Reward active` and production-resumed copy | Open City/Open Journal secondary path |
| Another human player is current viewer when owner completes | Completion event fires | State completes wonder | No ceremony appears for the wrong viewer | Owner ceremony may show later only when safe |
| Rival has no earned intel | Open Atlas or view map | No new intel state | No rival city/reward/progress/landmark detail appears | Masked legendary slot |
| City has 7 completed visible legendary wonders | Render map | Slot helper assigns first 5 plus overflow | Five landmarks plus `+2` medallion render around city | Full list remains in city/Journal; deeper archive waits for 2D |
| Lost race becomes `lost_race` | Open city panel | Existing recovery data is read | City shows `Effort recovered`, carryover/refund, and production-resumed copy | Wonder Journal with full recovery context |

## Misleading UI Risks

- `Available` in Atlas must mean an owned/city-visible presentation helper says the wonder is ready or buildable. Near or blocked wonders must not be labelled `Available`.
- `Under construction` must mean the viewer owns the project or has earned an existing viewer-safe intel record for that state. Raw rival project state is not enough.
- `Known rival completed` is a roadmap label, not a Stage 2C label. Current `LegendaryWonderIntelEntry` only records `intelLevel: 'started'`, so Stage 2C must keep rival completions at `Legendary wonder` until a later intel schema explicitly stores viewer-scoped completion knowledge. It must not reveal host city, reward, progress, completion turn, or map landmark.
- `Construction underway` must be neutral when no rival intel exists. Do not use `Uncontested`.
- `Race at risk` must require existing earned rival intel. Add a negative test proving no-intel active builds do not show it.
- `Reward active` must appear only after a completed state is recorded for the owner, not merely when production progress passes the cost.

## Interaction Replay Checklist

- Start construction from Journal, then reopen city panel and confirm active legendary row.
- Repeat-click `Start Construction` using stale DOM; mutation helper must still reject invalid duplicate starts.
- Resolve completion ceremony with `Continue`, then verify overlay removed and city state visible.
- Resolve completion ceremony with `Skip`, then verify overlay removed and state visible.
- Resolve completion ceremony with `Open City` and `Open Journal`, including fallback when target city is missing.
- Reopen Atlas after hot-seat current-player switch and confirm labels refresh.
- Re-render city/map after city capture or raze and confirm unsafe landmarks disappear.

## Queue And ETA Checklist

- Active item is shown in city production row.
- Follow-up queue rows remain visible below active production.
- Active legendary ETA uses the same effective production calculation as the city panel yields.
- Follow-up queue ETA/order text stays intact after starting a legendary wonder.
- Completion and lost-race recovery both show production-resumed copy.
- Legendary wonders remain blocked from rush-buy; existing rush-buy copy remains visible.

---

### Task 1: Event Payload And City Presentation Foundation

**Files:**
- Modify: `src/core/types.ts`
- Modify: `src/systems/legendary-wonder-system.ts`
- Modify: `src/ui/legendary-wonder-notifications.ts`
- Modify: `src/ui/notification-routing.ts`
- Modify: `src/systems/legendary-wonder-presentation.ts`
- Test: `tests/systems/legendary-wonder-system.test.ts`
- Test: `tests/systems/legendary-wonder-presentation.test.ts`

- [ ] **Step 1: Write failing event payload test**

Add this test to `tests/systems/legendary-wonder-system.test.ts` near the existing completion tests:

```ts
it('emits the completion turn in legendary completion events', () => {
  const state = makeLegendaryWonderFixture({
    completedTechs: ['philosophy', 'pilgrimages', 'city-planning', 'printing'],
    resources: ['stone'],
    oracleStepsCompleted: 2,
  });
  state.turn = 41;
  state.legendaryWonderProjects!['oracle-of-delphi'].phase = 'building';
  state.cities['city-river'].productionQueue = ['legendary:oracle-of-delphi'];
  state.cities['city-river'].productionProgress = 120;
  const events: Array<{ civId: string; cityId: string; wonderId: string; turnCompleted: number }> = [];
  const bus = new EventBus();
  bus.on('wonder:legendary-completed', event => events.push(event));

  tickLegendaryWonderProjects(state, bus);

  expect(events).toEqual([
    { civId: 'player', cityId: 'city-river', wonderId: 'oracle-of-delphi', turnCompleted: 41 },
  ]);
});
```

- [ ] **Step 2: Run failing event test**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/legendary-wonder-system.test.ts
```

Expected: TypeScript/Vitest failure because `turnCompleted` is not in the emitted event payload.

- [ ] **Step 3: Implement event payload**

In `src/core/types.ts`, change the event map entry:

```ts
'wonder:legendary-completed': { civId: string; cityId: string; wonderId: string; turnCompleted: number };
```

In `src/systems/legendary-wonder-system.ts`, update the emission inside `tickLegendaryWonderProjects`:

```ts
_bus.emit('wonder:legendary-completed', {
  civId: project.ownerId,
  cityId: project.cityId,
  wonderId: project.wonderId,
  turnCompleted: state.turn,
});
```

In `src/ui/legendary-wonder-notifications.ts` and `src/ui/notification-routing.ts`, widen the local union type for `wonder:legendary-completed` to include `turnCompleted: number`. Do not show `turnCompleted` in rival messages.

- [ ] **Step 4: Write failing city presentation tests**

Extend `tests/systems/legendary-wonder-presentation.test.ts`:

```ts
it('derives legendary construction milestones, ETA, and queue continuity without mutating state', () => {
  const state = makeLegendaryWonderFixture({
    completedTechs: ['philosophy', 'pilgrimages'],
    resources: ['stone'],
  });
  state.legendaryWonderProjects!['oracle-of-delphi'].phase = 'building';
  state.cities['city-river'].productionQueue = ['legendary:oracle-of-delphi', 'library'];
  state.cities['city-river'].productionProgress = 72;
  state.cities['city-river'].focus = 'production';
  const before = structuredClone(state.legendaryWonderProjects);

  const oracle = getLegendaryWonderPresentationForCity(state, 'player', 'city-river')
    .find(entry => entry.wonderId === 'oracle-of-delphi');

  expect(oracle).toMatchObject({
    visibleState: 'building',
    progressPercent: 60,
    milestoneLabel: 'Final works',
    queueContinuityLabel: 'Queue resumes after this wonder.',
    raceTensionLabel: 'Construction underway',
  });
  expect(oracle?.turnsRemaining).toBeGreaterThan(0);
  expect(state.legendaryWonderProjects).toEqual(before);
});

it('derives recovery and completed production-resumed copy', () => {
  const state = makeLegendaryWonderFixture({ completedTechs: [], resources: [] });
  state.legendaryWonderProjects!['grand-canal'].phase = 'lost_race';
  state.legendaryWonderProjects!['grand-canal'].transferableProduction = 24;
  state.completedLegendaryWonders = {
    'oracle-of-delphi': { ownerId: 'player', cityId: 'city-river', turnCompleted: 50 },
  };

  const entries = getLegendaryWonderPresentationForCity(state, 'player', 'city-river');
  expect(entries.find(entry => entry.wonderId === 'grand-canal')).toMatchObject({
    visibleState: 'recovered',
    recoveryLabel: 'Effort recovered: 24 production carryover preserved.',
    productionResumedLabel: 'Normal production has resumed.',
  });
  expect(entries.find(entry => entry.wonderId === 'oracle-of-delphi')).toMatchObject({
    visibleState: 'completed',
    productionResumedLabel: 'Normal production has resumed.',
  });
});

it('does not label no-intel builds as safe or uncontested', () => {
  const state = makeLegendaryWonderFixture({
    completedTechs: ['architecture-arts', 'theology-tech'],
    resources: ['stone'],
  });
  state.legendaryWonderProjects!['oracle-of-delphi'].phase = 'building';
  state.cities['city-river'].productionQueue = ['legendary:oracle-of-delphi'];
  state.cities['city-river'].productionProgress = 10;

  const oracle = getLegendaryWonderPresentationForCity(state, 'player', 'city-river')
    .find(entry => entry.wonderId === 'oracle-of-delphi');

  expect(oracle?.raceTensionLabel).toBe('Construction underway');
  expect(oracle?.raceTensionLabel).not.toMatch(/uncontested/i);
});
```

- [ ] **Step 5: Run failing presentation tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/legendary-wonder-presentation.test.ts
```

Expected: FAIL because new fields do not exist.

- [ ] **Step 6: Implement presentation fields**

In `src/systems/legendary-wonder-presentation.ts`, add these exports and fields:

```ts
export type LegendaryWonderMilestoneLabel =
  | 'Foundation laid'
  | 'Rising'
  | 'Final works'
  | 'Nearly complete';

export function getLegendaryWonderConstructionMilestone(investedProduction: number, productionCost: number): LegendaryWonderMilestoneLabel {
  const progress = productionCost > 0 ? Math.floor((investedProduction / productionCost) * 100) : 0;
  if (progress >= 90) return 'Nearly complete';
  if (progress >= 60) return 'Final works';
  if (progress >= 25) return 'Rising';
  return 'Foundation laid';
}
```

Extend `LegendaryWonderPresentationEntry`:

```ts
progressPercent: number;
turnsRemaining: number | null;
milestoneLabel: LegendaryWonderMilestoneLabel | null;
queueContinuityLabel: string | null;
productionResumedLabel: string | null;
recoveryLabel: string | null;
raceTensionLabel: string | null;
```

Add helper logic:

```ts
function progressPercent(investedProduction: number, productionCost: number): number {
  if (productionCost <= 0) return 0;
  return Math.max(0, Math.min(100, Math.floor((investedProduction / productionCost) * 100)));
}

function turnsRemaining(cityProductionPerTurn: number, investedProduction: number, productionCost: number): number | null {
  if (cityProductionPerTurn <= 0) return null;
  return Math.max(0, Math.ceil(Math.max(0, productionCost - investedProduction) / cityProductionPerTurn));
}

function cityProductionPerTurn(state: GameState, cityId: string): number {
  const city = state.cities[cityId];
  if (!city) return 0;
  const base = calculateProjectedCityYields(state, cityId);
  const multiplier = Math.min(getUnrestYieldMultiplier(city), getOccupiedCityYieldMultiplier(city));
  return Math.floor(base.production * multiplier);
}
```

Import `calculateProjectedCityYields`, `getUnrestYieldMultiplier`, and `getOccupiedCityYieldMultiplier`. Populate the new fields when building each entry. For `building` entries, use `city.productionProgress` when the active queue item is `legendary:<wonderId>`; otherwise use `project.investedProduction`.

- [ ] **Step 7: Run task tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/legendary-wonder-system.test.ts tests/systems/legendary-wonder-presentation.test.ts tests/ui/legendary-wonder-notifications.test.ts tests/ui/notification-routing.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit Task 1**

```bash
git add src/core/types.ts src/systems/legendary-wonder-system.ts src/systems/legendary-wonder-presentation.ts src/ui/legendary-wonder-notifications.ts src/ui/notification-routing.ts tests/systems/legendary-wonder-system.test.ts tests/systems/legendary-wonder-presentation.test.ts tests/ui/legendary-wonder-notifications.test.ts tests/ui/notification-routing.test.ts
git commit -m "feat(wonders): derive legendary construction presentation"
```

---

### Task 2: City Production And Journal UI

**Files:**
- Modify: `src/ui/city-panel.ts`
- Modify: `src/ui/wonder-panel.ts`
- Test: `tests/ui/city-panel.test.ts`
- Test: `tests/ui/wonder-panel.test.ts`

**Player Truth Table:**

| Before | Action | Immediate visible result |
| --- | --- | --- |
| Active item is `legendary:oracle-of-delphi` | Open city panel | Current production row shows Oracle name, medallion, progress, milestone, ETA, reward teaser, `Queue resumes after this wonder.` |
| Project is `lost_race` | Open city panel | Compact wonder area shows `Effort recovered`, carryover, and `Normal production has resumed.` |
| Project is completed | Open Journal | Completed card shows `Reward active` and production-resumed copy |

**Misleading UI Risks:**

- Do not hide the Wonder Journal link; it is the only full detail surface.
- Do not duplicate long quest/reward text in the compact city row.
- Do not use `innerHTML` for dynamic wonder names, rewards, or recovery text.

- [ ] **Step 1: Write failing city UI tests**

Add to `tests/ui/city-panel.test.ts`:

```ts
it('shows active legendary construction as a compact living production row', () => {
  const { container, city, state } = makeWonderPanelFixture();
  state.legendaryWonderProjects!['oracle-of-delphi'].phase = 'building';
  city.productionQueue = ['legendary:oracle-of-delphi', 'library'];
  city.productionProgress = 72;

  const panel = createCityPanel(container, city, state, {
    onBuild: () => {},
    onOpenWonderPanel: () => {},
    onClose: () => {},
  });
  const text = collectText(panel);

  expect(text).toContain('Producing: * Oracle of Delphi');
  expect(text).toContain('Final works');
  expect(text).toContain('Queue resumes after this wonder.');
  expect(text).toContain('Construction underway');
  expect(text).toContain('Open Journal');
  expect(text).not.toContain('legendary:oracle-of-delphi');
});

it('shows recovered legendary effort and production resume copy in the city flow', () => {
  const { container, city, state } = makeWonderPanelFixture();
  state.legendaryWonderProjects!['grand-canal'].phase = 'lost_race';
  state.legendaryWonderProjects!['grand-canal'].transferableProduction = 24;

  const panel = createCityPanel(container, city, state, {
    onBuild: () => {},
    onOpenWonderPanel: () => {},
    onClose: () => {},
  });
  const text = collectText(panel);

  expect(text).toContain('Effort recovered');
  expect(text).toContain('24 production carryover preserved');
  expect(text).toContain('Normal production has resumed.');
});
```

- [ ] **Step 2: Write failing Journal UI tests**

Add to `tests/ui/wonder-panel.test.ts`:

```ts
it('shows construction milestone and reward-active completion copy from presentation entries', () => {
  const { container, city, state } = makeWonderPanelFixture();
  state.legendaryWonderProjects!['oracle-of-delphi'].phase = 'building';
  city.productionQueue = ['legendary:oracle-of-delphi'];
  city.productionProgress = 72;
  state.completedLegendaryWonders = {
    'grand-canal': { ownerId: 'player', cityId: city.id, turnCompleted: 44 },
  };

  const panel = createWonderPanel(container, state, city.id, {
    onStartBuild: () => {},
    onClose: () => {},
  });
  const text = collectText(panel);

  expect(text).toContain('Final works');
  expect(text).toContain('Reward active');
  expect(text).toContain('Normal production has resumed.');
});
```

- [ ] **Step 3: Run failing UI tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/city-panel.test.ts tests/ui/wonder-panel.test.ts
```

Expected: FAIL because new copy is absent.

- [ ] **Step 4: Implement compact city row**

In `src/ui/city-panel.ts`, import `getLegendaryWonderQueueItemMetadata` and `getLegendaryWonderPresentationForCity`. Build a `activeLegendaryEntry` near current production:

```ts
const cityWonderEntries = getLegendaryWonderPresentationForCity(state, state.currentPlayer, city.id);
const activeLegendaryEntry = city.productionQueue[0]?.startsWith('legendary:')
  ? cityWonderEntries.find(entry => entry.queueItemId === city.productionQueue[0])
  : null;
```

In `currentProductionHtml`, when `activeLegendaryEntry` exists, add static placeholders:

```html
<div data-active-legendary="true" style="margin-top:10px;border-top:1px solid rgba(232,193,112,0.22);padding-top:10px;">
  <div style="font-size:12px;color:#e8c170;" data-text="legendary-milestone"></div>
  <div style="font-size:12px;opacity:0.82;" data-text="legendary-reward-teaser"></div>
  <div style="font-size:12px;opacity:0.82;" data-text="legendary-race-tension"></div>
  <div style="font-size:12px;opacity:0.82;" data-text="legendary-queue-continuity"></div>
  <button type="button" data-open-active-wonder-journal="true" style="min-height:44px;margin-top:8px;padding:7px 10px;background:rgba(232,193,112,0.16);border:1px solid rgba(232,193,112,0.45);border-radius:6px;color:#f0d897;cursor:pointer;font-size:12px;">Open Journal</button>
</div>
```

Set dynamic text with `setText`:

```ts
if (activeLegendaryEntry) {
  setText('legendary-milestone', activeLegendaryEntry.milestoneLabel ?? '');
  setText('legendary-reward-teaser', `Reward: ${activeLegendaryEntry.rewardSummary}`);
  setText('legendary-race-tension', activeLegendaryEntry.raceTensionLabel ?? 'Construction underway');
  setText('legendary-queue-continuity', activeLegendaryEntry.queueContinuityLabel ?? '');
}
```

Wire the Journal button:

```ts
panel.querySelector<HTMLElement>('[data-open-active-wonder-journal]')?.addEventListener('click', () => {
  callbacks.onOpenWonderPanel(city.id);
  panel.remove();
});
```

- [ ] **Step 5: Implement recovered/completed compact copy**

When rendering `compactWonderEntries`, add placeholders for recovery and production-resumed labels:

```html
<div style="font-size:10px;opacity:0.72;" data-text="wonder-recovery-${idx}"></div>
<div style="font-size:10px;opacity:0.72;" data-text="wonder-resumed-${idx}"></div>
```

Set:

```ts
setText(`wonder-recovery-${index}`, entry.recoveryLabel ?? '');
setText(`wonder-resumed-${index}`, entry.productionResumedLabel ?? '');
```

- [ ] **Step 6: Update Wonder Journal cards**

In `appendProjectCard` in `src/ui/wonder-panel.ts`, add:

```ts
if (entry.milestoneLabel) appendText(article, 'p', `Construction: ${entry.milestoneLabel}.`);
if (entry.turnsRemaining !== null) appendText(article, 'p', `${entry.turnsRemaining} turns remaining.`);
if (entry.raceTensionLabel) appendText(article, 'p', entry.raceTensionLabel);
if (entry.productionResumedLabel) appendText(article, 'p', entry.productionResumedLabel);
if (entry.visibleState === 'completed') appendText(article, 'p', 'Reward active.');
if (entry.recoveryLabel) appendText(article, 'p', entry.recoveryLabel);
```

- [ ] **Step 7: Run UI tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/city-panel.test.ts tests/ui/wonder-panel.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit Task 2**

```bash
git add src/ui/city-panel.ts src/ui/wonder-panel.ts tests/ui/city-panel.test.ts tests/ui/wonder-panel.test.ts
git commit -m "feat(wonders): show legendary construction in city UI"
```

---

### Task 3: Owner-Only Completion Ceremony And Queue

**Files:**
- Create: `src/systems/legendary-wonder-completion-presentation.ts`
- Create: `src/ui/legendary-wonder-completion-ceremony.ts`
- Create: `src/ui/legendary-wonder-completion-queue.ts`
- Modify: `src/main.ts`
- Test: `tests/systems/legendary-wonder-completion-presentation.test.ts`
- Test: `tests/ui/legendary-wonder-completion-ceremony.test.ts`
- Test: `tests/ui/legendary-wonder-completion-queue.test.ts`

**Player Truth Table:**

| Before | Action | Immediate visible result |
| --- | --- | --- |
| Owner completes wonder and no blocking UI is active | Event enqueued | Ceremony appears with `Continue`, `Open City`, `Open Journal`, `Skip` |
| Ceremony visible | Click any action repeatedly | Overlay resolves once and removes |
| Wrong hot-seat viewer active | Event enqueued | No ceremony appears for wrong viewer |

- [ ] **Step 1: Write failing completion presentation tests**

Create `tests/systems/legendary-wonder-completion-presentation.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildLegendaryWonderCompletionCeremonyItem } from '@/systems/legendary-wonder-completion-presentation';
import { makeLegendaryWonderFixture } from './helpers/legendary-wonder-fixture';

describe('legendary-wonder-completion-presentation', () => {
  it('builds owner-safe ceremony items from event payloads', () => {
    const state = makeLegendaryWonderFixture({ completedTechs: [], resources: [] });
    state.currentPlayer = 'player';

    const item = buildLegendaryWonderCompletionCeremonyItem(state, {
      civId: 'player',
      cityId: 'city-river',
      wonderId: 'oracle-of-delphi',
      turnCompleted: 42,
    });

    expect(item).toMatchObject({
      civId: 'player',
      cityId: 'city-river',
      wonderId: 'oracle-of-delphi',
      turnCompleted: 42,
      title: 'Legendary Wonder Completed',
      name: 'Oracle of Delphi',
      cityName: 'city-river',
      rewardActiveLabel: 'Reward active',
    });
  });

  it('returns null for wrong-viewer and unknown-wonder events', () => {
    const state = makeLegendaryWonderFixture({ completedTechs: [], resources: [] });
    state.currentPlayer = 'ai-1';

    expect(buildLegendaryWonderCompletionCeremonyItem(state, {
      civId: 'player',
      cityId: 'city-river',
      wonderId: 'oracle-of-delphi',
      turnCompleted: 42,
    })).toBeNull();

    state.currentPlayer = 'player';
    expect(buildLegendaryWonderCompletionCeremonyItem(state, {
      civId: 'player',
      cityId: 'city-river',
      wonderId: 'missing-wonder',
      turnCompleted: 42,
    })).toBeNull();
  });
});
```

- [ ] **Step 2: Implement completion presentation helper**

Create `src/systems/legendary-wonder-completion-presentation.ts`:

```ts
import type { GameState, GameEventMap } from '@/core/types';
import { getLegendaryWonderDefinition } from '@/systems/legendary-wonder-definitions';
import { getWonderVisualDefinition, type WonderVisualDefinition } from '@/systems/wonder-visual-catalog';

export interface LegendaryWonderCompletionCeremonyItem {
  title: 'Legendary Wonder Completed';
  civId: string;
  cityId: string;
  wonderId: string;
  turnCompleted: number;
  name: string;
  cityName: string;
  achievementLine: string;
  rewardSummary: string;
  rewardActiveLabel: 'Reward active';
  visual: WonderVisualDefinition;
}

export function buildLegendaryWonderCompletionCeremonyItem(
  state: GameState,
  event: GameEventMap['wonder:legendary-completed'],
): LegendaryWonderCompletionCeremonyItem | null {
  if (state.currentPlayer !== event.civId) return null;
  const definition = getLegendaryWonderDefinition(event.wonderId);
  const city = state.cities[event.cityId];
  if (!definition || !city || city.owner !== event.civId) return null;

  return {
    title: 'Legendary Wonder Completed',
    civId: event.civId,
    cityId: event.cityId,
    wonderId: event.wonderId,
    turnCompleted: event.turnCompleted,
    name: definition.name,
    cityName: city.name,
    achievementLine: `${city.name} has completed a work that will shape its legacy.`,
    rewardSummary: definition.reward.summary,
    rewardActiveLabel: 'Reward active',
    visual: getWonderVisualDefinition(event.wonderId),
  };
}
```

- [ ] **Step 3: Write failing ceremony UI tests**

Create `tests/ui/legendary-wonder-completion-ceremony.test.ts` mirroring the discovery ceremony tests:

```ts
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createLegendaryWonderCompletionCeremony } from '@/ui/legendary-wonder-completion-ceremony';
import { getWonderVisualDefinition } from '@/systems/wonder-visual-catalog';
import type { LegendaryWonderCompletionCeremonyItem } from '@/systems/legendary-wonder-completion-presentation';

function item(): LegendaryWonderCompletionCeremonyItem {
  return {
    title: 'Legendary Wonder Completed',
    civId: 'player',
    cityId: 'city-river',
    wonderId: 'oracle-of-delphi',
    turnCompleted: 42,
    name: 'Oracle of Delphi',
    cityName: 'city-river',
    achievementLine: 'city-river has completed a work that will shape its legacy.',
    rewardSummary: '+20% science in this city',
    rewardActiveLabel: 'Reward active',
    visual: getWonderVisualDefinition('oracle-of-delphi'),
  };
}

describe('legendary-wonder-completion-ceremony', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('renders completion copy and actions', () => {
    createLegendaryWonderCompletionCeremony(document.body, item(), { onResolve: () => {} }, { reducedMotion: false });
    expect(document.body.textContent).toContain('Legendary Wonder Completed');
    expect(document.body.textContent).toContain('Oracle of Delphi');
    expect(document.body.textContent).toContain('city-river');
    expect(document.body.textContent).toContain('Reward active');
    expect(document.querySelector('[data-legendary-completion-action="continue"]')).toBeTruthy();
    expect(document.querySelector('[data-legendary-completion-action="open-city"]')).toBeTruthy();
    expect(document.querySelector('[data-legendary-completion-action="open-journal"]')).toBeTruthy();
    expect(document.querySelector('[data-legendary-completion-action="skip"]')).toBeTruthy();
  });

  it('resolves exactly once for repeated clicks', () => {
    const onResolve = vi.fn();
    createLegendaryWonderCompletionCeremony(document.body, item(), { onResolve }, { reducedMotion: false });
    document.querySelector('[data-legendary-completion-action="continue"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    document.querySelector('[data-legendary-completion-action="skip"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onResolve).toHaveBeenCalledTimes(1);
    expect(onResolve).toHaveBeenCalledWith('continue');
    expect(document.querySelector('#legendary-wonder-completion-ceremony')).toBeNull();
  });
});
```

- [ ] **Step 4: Implement ceremony UI**

Create `src/ui/legendary-wonder-completion-ceremony.ts` using the discovery ceremony pattern. Export:

```ts
export type LegendaryWonderCompletionCeremonyAction = 'continue' | 'skip' | 'open-city' | 'open-journal';
```

Use `createGameButton`, `textContent`, and a `resolved` boolean. Set `overlay.dataset.legendaryCompletionMotion` to `static` or `animated`.

- [ ] **Step 5: Write and implement queue tests**

Create `tests/ui/legendary-wonder-completion-queue.test.ts` with tests for:

```ts
it('waits for action settlement and blocking UI before presenting');
it('opens city or journal after the ceremony resolves');
it('does not present wrong-viewer items');
it('deduplicates repeat enqueue for the same civ/wonder/turn');
```

Implement `src/ui/legendary-wonder-completion-queue.ts` with options:

```ts
export interface LegendaryWonderCompletionQueueOptions {
  container: HTMLElement;
  isInteractionBlocked: () => boolean;
  reducedMotion: () => boolean;
  openCity: (cityId: string) => void;
  openJournal: (cityId: string, wonderId: string) => void;
  present?: (item: LegendaryWonderCompletionCeremonyItem) => Promise<LegendaryWonderCompletionCeremonyAction>;
  setBlockingOverlay?: (id: string | null) => void;
}
```

Follow the `createWonderDiscoveryRevealQueue` structure, but use key `${item.civId}:${item.wonderId}:${item.turnCompleted}`.

- [ ] **Step 6: Wire `main.ts`**

In `src/main.ts`, import the queue and presentation helper. Create `legendaryCompletionQueue` near `wonderDiscoveryQueue`. In the `wonder:legendary-completed` listener:

```ts
bus.on('wonder:legendary-completed', event => {
  routeLegendaryWonder(gameState, { type: 'wonder:legendary-completed', ...event }, appendToCivLog);
  const ceremonyItem = buildLegendaryWonderCompletionCeremonyItem(gameState, event);
  if (ceremonyItem) {
    legendaryCompletionQueue?.enqueue(ceremonyItem);
    legendaryCompletionQueue?.notifyActionSettled();
  }
});
```

Use existing open-city/open-wonder-panel behavior for secondary actions. If a target city is missing, resolve like `Continue`.

- [ ] **Step 7: Run ceremony tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/legendary-wonder-completion-presentation.test.ts tests/ui/legendary-wonder-completion-ceremony.test.ts tests/ui/legendary-wonder-completion-queue.test.ts tests/ui/notification-routing.test.ts tests/ui/legendary-wonder-notifications.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit Task 3**

```bash
git add src/main.ts src/systems/legendary-wonder-completion-presentation.ts src/ui/legendary-wonder-completion-ceremony.ts src/ui/legendary-wonder-completion-queue.ts tests/systems/legendary-wonder-completion-presentation.test.ts tests/ui/legendary-wonder-completion-ceremony.test.ts tests/ui/legendary-wonder-completion-queue.test.ts
git commit -m "feat(wonders): add legendary completion ceremony"
```

---

### Task 4: Minimal Legendary Atlas Labels

**Files:**
- Modify: `src/systems/wonder-atlas-presentation.ts`
- Modify: `src/ui/wonder-atlas-panel.ts`
- Test: `tests/systems/wonder-atlas-presentation.test.ts`
- Test: `tests/ui/wonder-atlas-panel.test.ts`

**Misleading UI Risks:**

- Stage 2C must not ship `Known rival completed`; the current intel shape has only `intelLevel: 'started'`, so there is no safe completed-rival source yet.
- `Available` must not appear for blocked/near/far-future wonders.

- [ ] **Step 1: Write failing Atlas presentation tests**

Add:

```ts
it('derives minimal safe legendary state labels for owned entries', () => {
  const state = makeState();
  state.legendaryWonderProjects = {
    'oracle-of-delphi:player:city-river': {
      wonderId: 'oracle-of-delphi',
      ownerId: 'player',
      cityId: 'city-river',
      phase: 'building',
      investedProduction: 40,
      transferableProduction: 0,
      questSteps: [],
    },
  };

  const oracle = getWonderAtlasEntries(state, 'player')
    .find(entry => entry.kind === 'legendary' && entry.wonderId === 'oracle-of-delphi');

  expect(oracle).toMatchObject({ kind: 'legendary', stateLabel: 'Under construction' });
});

it('does not leak rival legendary progress through Atlas labels', () => {
  const state = makeState();
  state.legendaryWonderProjects = {
    'oracle-rival': {
      wonderId: 'oracle-of-delphi',
      ownerId: 'ai-1',
      cityId: 'rival-city',
      phase: 'building',
      investedProduction: 90,
      transferableProduction: 0,
      questSteps: [],
    },
  };

  const oracle = getWonderAtlasEntries(state, 'player')
    .find(entry => entry.kind === 'legendary' && entry.wonderId === 'oracle-of-delphi');

  expect(oracle).toMatchObject({ kind: 'legendary', stateLabel: 'Legendary wonder' });
  expect(JSON.stringify(oracle)).not.toContain('rival-city');
  expect(JSON.stringify(oracle)).not.toContain('90');
});
```

- [ ] **Step 2: Implement Atlas labels**

Extend `LegendaryWonderAtlasEntry`:

```ts
stateLabel: 'Available' | 'Under construction' | 'Completed' | 'Recovered' | 'Legendary wonder';
```

Add a helper that checks only owned projects/completions for the viewer. For rival completions, always return `Legendary wonder` in Stage 2C. Add a comment in the helper noting that a future 2D/3-stage intel expansion can add a `Known rival completed` label after the state model stores explicit viewer-scoped completion intel.

- [ ] **Step 3: Update Atlas UI**

In `src/ui/wonder-atlas-panel.ts`, display `entry.stateLabel` for legendary entries instead of only generic masked copy. The detail panel must still avoid full lore/detail pages.

- [ ] **Step 4: Run Atlas tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/wonder-atlas-presentation.test.ts tests/ui/wonder-atlas-panel.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 4**

```bash
git add src/systems/wonder-atlas-presentation.ts src/ui/wonder-atlas-panel.ts tests/systems/wonder-atlas-presentation.test.ts tests/ui/wonder-atlas-panel.test.ts
git commit -m "feat(wonders): add safe legendary atlas labels"
```

---

### Task 5: Landmark Map Presentation, Slots, And Renderer

**Files:**
- Modify: `src/systems/wonder-visual-catalog.ts`
- Create: `src/systems/legendary-wonder-map-presentation.ts`
- Create: `src/renderer/wonders/legendary-wonder-slots.ts`
- Create: `src/renderer/wonders/legendary-wonder-renderer.ts`
- Modify: `src/renderer/city-renderer.ts`
- Modify: `src/renderer/render-loop.ts`
- Test: `tests/systems/legendary-wonder-map-presentation.test.ts`
- Test: `tests/renderer/legendary-wonder-slots.test.ts`
- Test: `tests/renderer/legendary-wonder-renderer.test.ts`
- Test: `tests/renderer/city-renderer.test.ts`

- [ ] **Step 1: Write slot helper tests**

Create `tests/renderer/legendary-wonder-slots.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { assignLegendaryWonderSlots } from '@/renderer/wonders/legendary-wonder-slots';

describe('legendary-wonder-slots', () => {
  it('assigns stable slots sorted by turnCompleted then wonderId', () => {
    const slots = assignLegendaryWonderSlots([
      { wonderId: 'sun-spire', turnCompleted: 12 },
      { wonderId: 'oracle-of-delphi', turnCompleted: 10 },
      { wonderId: 'grand-canal', turnCompleted: 10 },
    ]);

    expect(slots.map(slot => slot.wonderId)).toEqual(['grand-canal', 'oracle-of-delphi', 'sun-spire']);
    expect(slots.map(slot => slot.slotIndex)).toEqual([0, 1, 2]);
  });

  it('uses first five plus overflow when more than six wonders are visible', () => {
    const slots = assignLegendaryWonderSlots([
      'a', 'b', 'c', 'd', 'e', 'f', 'g',
    ].map((wonderId, index) => ({ wonderId, turnCompleted: index + 1 })));

    expect(slots).toHaveLength(6);
    expect(slots[5]).toMatchObject({ kind: 'overflow', overflowCount: 2 });
  });
});
```

- [ ] **Step 2: Implement slot helper**

Create `src/renderer/wonders/legendary-wonder-slots.ts`:

```ts
export interface LegendaryWonderSlotInput {
  wonderId: string;
  turnCompleted: number;
}

export type LegendaryWonderSlot =
  | { kind: 'landmark'; wonderId: string; turnCompleted: number; slotIndex: number; dx: number; dy: number }
  | { kind: 'overflow'; slotIndex: number; overflowCount: number; dx: number; dy: number };

const OFFSETS = [
  { dx: 0, dy: -0.78 },
  { dx: 0.66, dy: -0.38 },
  { dx: 0.66, dy: 0.34 },
  { dx: 0, dy: 0.74 },
  { dx: -0.66, dy: 0.34 },
  { dx: -0.66, dy: -0.38 },
];

export function assignLegendaryWonderSlots(inputs: LegendaryWonderSlotInput[]): LegendaryWonderSlot[] {
  const sorted = [...inputs].sort((a, b) => a.turnCompleted - b.turnCompleted || a.wonderId.localeCompare(b.wonderId));
  const visible = sorted.length > 6 ? sorted.slice(0, 5) : sorted.slice(0, 6);
  const slots: LegendaryWonderSlot[] = visible.map((input, index) => ({
    kind: 'landmark',
    wonderId: input.wonderId,
    turnCompleted: input.turnCompleted,
    slotIndex: index,
    ...OFFSETS[index],
  }));
  if (sorted.length > 6) {
    slots.push({ kind: 'overflow', slotIndex: 5, overflowCount: sorted.length - 5, ...OFFSETS[5] });
  }
  return slots;
}
```

- [ ] **Step 3: Write map presentation tests**

Create `tests/systems/legendary-wonder-map-presentation.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { getLegendaryWonderMapEntries } from '@/systems/legendary-wonder-map-presentation';
import { hexKey } from '@/systems/hex-utils';
import { makeLegendaryWonderFixture } from './helpers/legendary-wonder-fixture';

describe('legendary-wonder-map-presentation', () => {
  it('returns owner-safe completed landmark entries for visible owned host cities', () => {
    const state = makeLegendaryWonderFixture({ completedTechs: [], resources: [] });
    state.currentPlayer = 'player';
    state.completedLegendaryWonders = {
      'oracle-of-delphi': { ownerId: 'player', cityId: 'city-river', turnCompleted: 20 },
    };
    state.civilizations.player.visibility.tiles[hexKey(state.cities['city-river'].position)] = 'visible';

    const entries = getLegendaryWonderMapEntries(state, 'player');

    expect(entries).toEqual([
      expect.objectContaining({
        wonderId: 'oracle-of-delphi',
        cityId: 'city-river',
        coord: state.cities['city-river'].position,
        turnCompleted: 20,
      }),
    ]);
  });

  it('does not expose rival completed landmarks without earned visibility', () => {
    const state = makeLegendaryWonderFixture({ completedTechs: [], resources: [] });
    state.completedLegendaryWonders = {
      'oracle-of-delphi': { ownerId: 'ai-1', cityId: 'rival-city', turnCompleted: 20 },
    };

    expect(getLegendaryWonderMapEntries(state, 'player')).toEqual([]);
  });
});
```

- [ ] **Step 4: Implement map presentation**

Create `src/systems/legendary-wonder-map-presentation.ts`:

```ts
import type { GameState, HexCoord } from '@/core/types';
import { getVisibility } from '@/systems/fog-of-war';
import { getLegendaryWonderDefinition } from '@/systems/legendary-wonder-definitions';
import { getWonderVisualDefinition, type WonderVisualDefinition } from '@/systems/wonder-visual-catalog';

export interface LegendaryWonderMapEntry {
  wonderId: string;
  cityId: string;
  coord: HexCoord;
  ownerId: string;
  relationship: 'owned';
  turnCompleted: number;
  label: string;
  visual: WonderVisualDefinition;
}

export function getLegendaryWonderMapEntries(state: GameState, viewerId: string): LegendaryWonderMapEntry[] {
  const visibility = state.civilizations[viewerId]?.visibility;
  if (!visibility) return [];

  return Object.entries(state.completedLegendaryWonders ?? {})
    .flatMap(([wonderId, completion]) => {
      if (completion.ownerId !== viewerId) return [];
      const city = state.cities[completion.cityId];
      if (!city) return [];
      if (getVisibility(visibility, city.position) !== 'visible') return [];
      const definition = getLegendaryWonderDefinition(wonderId);
      return [{
        wonderId,
        cityId: city.id,
        coord: { ...city.position },
        ownerId: completion.ownerId,
        relationship: 'owned' as const,
        turnCompleted: completion.turnCompleted,
        label: definition?.name ?? 'Legendary wonder',
        visual: getWonderVisualDefinition(wonderId),
      }];
    });
}
```

- [ ] **Step 5: Implement visual catalog and renderer**

Extend `WonderVisualDefinition` with:

```ts
legendaryLandmark?: 'spire' | 'arch' | 'dome' | 'obelisk' | 'citadel' | 'archive' | 'masked';
```

For initial 2C, derive a stable landmark type from the wonder id, not object insertion order:

```ts
const LEGENDARY_LANDMARK_TYPES = ['spire', 'arch', 'dome', 'obelisk', 'citadel', 'archive'] as const;

function landmarkTypeForLegendaryWonder(wonderId: string): typeof LEGENDARY_LANDMARK_TYPES[number] {
  const hash = [...wonderId].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return LEGENDARY_LANDMARK_TYPES[hash % LEGENDARY_LANDMARK_TYPES.length];
}
```

Create `src/renderer/wonders/legendary-wonder-renderer.ts` with:

```ts
export interface LegendaryWonderRenderEntry {
  wonderId: string;
  label: string;
  turnCompleted: number;
  visual: WonderVisualDefinition;
}

export function drawLegendaryWonderLandmarks(options: {
  ctx: CanvasRenderingContext2D;
  cx: number;
  cy: number;
  size: number;
  entries: LegendaryWonderRenderEntry[];
  reducedMotion: boolean;
  lowZoom: boolean;
}): void {
  const slots = assignLegendaryWonderSlots(options.entries);
  // Draw simple geometric silhouettes and +N overflow medallion.
}
```

Use canvas primitives only; no emoji for the completed landmark silhouettes.

- [ ] **Step 6: Wire city renderer**

In `src/renderer/city-renderer.ts`, compute grouped entries once:

```ts
const landmarksByCity = new Map<string, LegendaryWonderMapEntry[]>();
for (const entry of getLegendaryWonderMapEntries(state, playerCivId)) {
  landmarksByCity.set(entry.cityId, [...(landmarksByCity.get(entry.cityId) ?? []), entry]);
}
```

Inside each live city draw, after city circle/name but before production/idle badges:

```ts
const legendaryEntries = projection.liveCityId ? landmarksByCity.get(projection.liveCityId) ?? [] : [];
if (legendaryEntries.length > 0) {
  drawLegendaryWonderLandmarks({
    ctx,
    cx: screen.x,
    cy: screen.y,
    size,
    entries: legendaryEntries,
    reducedMotion: false,
    lowZoom: camera.zoom < LOD_SPRITE_ZOOM_THRESHOLD,
  });
}
```

Add a fifth `reducedMotion: boolean = false` parameter to `drawCities`. In `src/renderer/render-loop.ts`, add a tiny local helper that reads `window.matchMedia('(prefers-reduced-motion: reduce)')` in browser contexts and returns `false` in test/non-window contexts, then pass that boolean into `drawCities`. Keep the default `false` for renderer tests that call `drawCities` directly.

- [ ] **Step 7: Run renderer tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/legendary-wonder-map-presentation.test.ts tests/renderer/legendary-wonder-slots.test.ts tests/renderer/legendary-wonder-renderer.test.ts tests/renderer/city-renderer.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit Task 5**

```bash
git add src/systems/wonder-visual-catalog.ts src/systems/legendary-wonder-map-presentation.ts src/renderer/wonders/legendary-wonder-slots.ts src/renderer/wonders/legendary-wonder-renderer.ts src/renderer/city-renderer.ts src/renderer/render-loop.ts tests/systems/legendary-wonder-map-presentation.test.ts tests/renderer/legendary-wonder-slots.test.ts tests/renderer/legendary-wonder-renderer.test.ts tests/renderer/city-renderer.test.ts
git commit -m "feat(wonders): render completed legendary landmarks"
```

---

### Task 6: Inspection Copy And Final Wiring

**Files:**
- Modify: `src/ui/territory-inspection-panel.ts`
- Modify: `src/main.ts`
- Test: `tests/ui/territory-inspection-panel.test.ts`
- Test: `tests/ui/city-panel.test.ts`

- [ ] **Step 1: Write failing inspection test**

Add to `tests/ui/territory-inspection-panel.test.ts`:

```ts
import { makeLegendaryWonderFixture } from '../systems/helpers/legendary-wonder-fixture';

it('mentions completed legendary wonders for safely visible owned host cities', () => {
  const state = makeLegendaryWonderFixture({ completedTechs: [], resources: [] });
  state.completedLegendaryWonders = {
    'oracle-of-delphi': { ownerId: 'player', cityId: 'city-river', turnCompleted: 20 },
  };
  const panel = createTerritoryInspectionPanel(state, state.cities['city-river'].position, 'player', () => {});

  expect(panel.textContent).toContain('Completed legendary wonders');
  expect(panel.textContent).toContain('Oracle of Delphi');
});
```

- [ ] **Step 2: Implement inspection copy**

In `src/ui/territory-inspection-panel.ts`, after city/wonder lines, add owner-safe completed wonder text:

```ts
const completedInCity = Object.entries(state.completedLegendaryWonders ?? {})
  .filter(([, completion]) => completion.ownerId === state.currentPlayer && completion.cityId === city?.id)
  .map(([wonderId]) => getLegendaryWonderDefinition(wonderId)?.name ?? 'Legendary wonder');
if (completedInCity.length > 0) {
  addLine(panel, 'Completed legendary wonders', completedInCity.join(', '));
}
```

Use the actual city variable available in the file; if the panel only has a tile, resolve a city at the inspected coord through `Object.values(state.cities).find(candidate => same coord)`.

- [ ] **Step 3: Final `main.ts` wiring review**

Confirm:

- `wonder:legendary-completed` listener routes notifications and enqueues ceremony.
- Queue uses current `blockingOverlay` or existing interaction-blocking predicate.
- `Open City` opens the host city panel.
- `Open Journal` opens the host city's `createWonderPanel`; selecting a specific wonder inside the Journal is out of scope unless the existing API already supports it without new state.
- Wrong-viewer completion events do not open ceremony.
- No landmark click/input path was added.

- [ ] **Step 4: Run wiring and UI tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/territory-inspection-panel.test.ts tests/ui/city-panel.test.ts tests/ui/wonder-panel.test.ts tests/ui/legendary-wonder-completion-queue.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 6**

```bash
git add src/main.ts src/ui/territory-inspection-panel.ts tests/ui/territory-inspection-panel.test.ts tests/ui/city-panel.test.ts tests/ui/wonder-panel.test.ts tests/ui/legendary-wonder-completion-queue.test.ts
git commit -m "feat(wonders): wire legendary presence inspection"
```

---

### Task 7: Final Regression, Review, And PR Prep

**Files:**
- Review all changed files.
- No new source files expected unless a prior task found a necessary focused helper.

- [ ] **Step 1: Run source rule checks**

Run with the actual changed `src` files:

```bash
scripts/check-src-rule-violations.sh src/core/types.ts src/systems/legendary-wonder-system.ts src/systems/legendary-wonder-presentation.ts src/systems/legendary-wonder-completion-presentation.ts src/systems/wonder-atlas-presentation.ts src/systems/wonder-visual-catalog.ts src/systems/legendary-wonder-map-presentation.ts src/ui/city-panel.ts src/ui/wonder-panel.ts src/ui/wonder-atlas-panel.ts src/ui/legendary-wonder-completion-ceremony.ts src/ui/legendary-wonder-completion-queue.ts src/ui/territory-inspection-panel.ts src/ui/legendary-wonder-notifications.ts src/ui/notification-routing.ts src/renderer/city-renderer.ts src/renderer/render-loop.ts src/renderer/wonders/legendary-wonder-slots.ts src/renderer/wonders/legendary-wonder-renderer.ts src/main.ts
```

Expected: no violations.

- [ ] **Step 2: Run targeted tests**

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/legendary-wonder-system.test.ts tests/systems/legendary-wonder-presentation.test.ts tests/systems/legendary-wonder-completion-presentation.test.ts tests/systems/wonder-atlas-presentation.test.ts tests/systems/legendary-wonder-map-presentation.test.ts tests/ui/city-panel.test.ts tests/ui/wonder-panel.test.ts tests/ui/wonder-atlas-panel.test.ts tests/ui/legendary-wonder-completion-ceremony.test.ts tests/ui/legendary-wonder-completion-queue.test.ts tests/ui/territory-inspection-panel.test.ts tests/ui/legendary-wonder-notifications.test.ts tests/ui/notification-routing.test.ts tests/renderer/legendary-wonder-slots.test.ts tests/renderer/legendary-wonder-renderer.test.ts tests/renderer/city-renderer.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run wonder regressions**

```bash
./scripts/run-wonder-regressions.sh
```

Expected: PASS.

- [ ] **Step 4: Run build and full tests**

```bash
./scripts/run-with-mise.sh yarn build
./scripts/run-with-mise.sh yarn test
```

Expected: both exit 0.

- [ ] **Step 5: Inspect diffs**

```bash
git diff --stat origin/main...HEAD
git diff --stat
git diff origin/main...HEAD -- src docs tests
git diff -- src docs tests
```

Expected:

- branch diff contains only Stage 2C spec/plan and implementation files
- working tree diff is empty or only intentional final edits
- no `.superpowers/` files staged

- [ ] **Step 6: Final commit for review fixes**

If Task 7 produced test-only or review fixes, stage the concrete changed files from `src/`, `tests/`, and `docs/superpowers/plans/`:

```bash
git add src tests docs/superpowers/plans/2026-05-22-legendary-wonder-city-presence.md
git commit -m "fix(wonders): polish legendary presence regressions"
```

---

## Self-Review Checklist

- Spec coverage:
  - City construction identity: Tasks 1-2.
  - Completion ceremony: Task 3.
  - Minimal Atlas labels: Task 4.
  - Multiple completed landmarks and overflow: Task 5.
  - Inspection text and final wiring: Task 6.
  - Verification: Task 7.
- Placeholder scan:
  - Search this plan for red-flag placeholder language before execution; no ambiguous fill-in instructions should remain.
- Type consistency:
  - `turnCompleted` exists in event payload, completion item, map entries, and slot input.
  - Completion ceremony action ids are `continue`, `skip`, `open-city`, `open-journal`.
  - Atlas `stateLabel` union matches UI tests.
- Regression risks:
  - Existing natural wonder Atlas and discovery reveal paths stay untouched except shared visual catalog type additions.
  - Existing notification routing should continue to fan out completion notifications with redacted rival text.
  - Existing rush-buy block for legendary wonders stays intact.
