# Game Pacing Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Conquestoria noticeably more active and less boring from the first turns by shipping reviewable vertical slices that each deliver player-visible pacing improvements, safer production/research flow, and clearer UI feedback.

**Architecture:** Implement the overhaul as small, mergeable vertical slices that share a thin pacing/planning foundation. Each slice must be understandable to a Sonnet 4.5-level implementation agent, must preserve existing behavior outside its scope, and must finish in a player-visible improvement that can be demonstrated immediately in the browser.

**Tech Stack:** TypeScript, DOM/CSS UI panels, Vitest, `./scripts/run-with-mise.sh`, IndexedDB/local storage persistence

---

## Delivery Rules

These rules are part of the plan, not optional guidance.

### 1. Model Target

This plan is intentionally sized so `Sonnet 4.5` can execute each task with high confidence:

- each task changes a limited set of files
- each task has one primary player-facing outcome
- each task includes targeted tests and explicit verification
- each task avoids mixing unrelated refactors with feature work

### 2. User-Value Rule

Every task must deliver something the player will notice immediately. Internal scaffolding is allowed only when it is tightly bundled with a visible improvement in the same task.

### 3. MR Quality Rule

Every task should produce an MR that is:

- easy to review
- easy to demo
- properly tested
- matched to the approved spec
- regression-conscious
- correct before merge

### 4. Slice Rule

Do not land a “foundation-only” MR that has no player-visible impact. If a helper or metadata layer is needed, pair it with the smallest visible feature that uses it.

### 5. Verification Rule

Before any task is called done:

- run the targeted tests for the changed behavior
- run `scripts/check-src-rule-violations.sh` on changed `src/` files
- run any additional relevant integration/build verification
- inspect the changed UI/flow mentally or interactively and confirm the feature is actually surfaced to the player

---

## File Map

| File | Responsibility |
|---|---|
| `src/core/types.ts` | Queue-aware `TechState` and pacing metadata types |
| `src/core/game-state.ts` | Seed new planning fields in fresh games |
| `src/storage/save-manager.ts` | Migrate older saves to queue-aware fields |
| `src/systems/pacing-model.ts` | Band tables, ETA helpers, recommended-cost helpers |
| `src/systems/pacing-audit.ts` | Local audit rows for techs/buildings/units |
| `src/systems/planning-system.ts` | Shared enqueue/reorder/remove helpers and idle-choice detection |
| `src/systems/tech-definitions.ts` | Tech pacing metadata and retuned costs |
| `src/systems/city-system.ts` | Building/unit pacing metadata and queue-safe production behavior |
| `src/systems/tech-system.ts` | Research queue helpers and queue progression |
| `src/systems/legendary-wonder-system.ts` | Preserve queue tails when wonder builds start/resolve |
| `src/core/turn-manager.ts` | Queue progression regressions and shared turn behavior |
| `src/ui/tech-panel.ts` | Layered dependency view, ETA text, research queue controls |
| `src/ui/city-panel.ts` | ETA-first production list and production queue controls |
| `src/ui/required-choice-panel.ts` | Blocking chooser for idle production/research |
| `src/ui/pacing-debug-panel.ts` | Optional local-only pacing/debug surface |
| `src/ui/tutorial.ts` | Shared idle-choice logic for tutorial prompts |
| `src/ui/advisor-system.ts` | Shared idle-choice logic for advisor prompts |
| `src/main.ts` | Queue-aware UI callbacks, end-turn gating, debug wiring |

---

## Slice Overview

The implementation is split into five vertical slices. Each slice is independently reviewable and delivers immediate player value.

### Slice 1: Faster Opening And Visible ETAs

Player value:

- early units/buildings/techs finish noticeably faster
- city and tech panels start showing meaningful ETA language

MR review theme:

- “Does the opening feel faster and do the panels explain that speed?”

### Slice 2: City Planning Momentum

Player value:

- cities can queue up to 3 builds
- players can reorder/remove queued builds
- city panel feels less stop-start

MR review theme:

- “Can players keep cities moving without losing control or scheduled work?”

### Slice 3: Research Momentum And Better Tech Tree

Player value:

- research can queue up to 3 techs
- tech tree shows current/available/next-layer focus
- issue `#56` is directly improved

MR review theme:

- “Does the tech UI feel less overwhelming and more alive?”

### Slice 4: No More Accidental Idle Turns

Player value:

- the game no longer lets players ignore idle research or idle cities when valid options exist
- prompts are helpful and actionable, not punitive

MR review theme:

- “Can the player still move smoothly, but no longer waste turns by accident?”

### Slice 5: Local Balance Audit And Debug View

Player value:

- visible developer/debug support for pacing inspection
- better tuned broader roster with confidence against regressions

MR review theme:

- “Is the pacing model inspectable, deterministic, and actually reflected in the current costs?”

---

## Task 1: Faster Opening And Visible ETAs

**Goal:** Make Era 1 feel faster right away and expose that improvement through ETA text in the existing city and tech panels.

**Why this task delivers value:** Players will notice faster opening completions immediately, and the UI will finally tell them how soon things happen.

**Files:**
- Create: `src/systems/pacing-model.ts`
- Modify: `src/core/types.ts`
- Modify: `src/systems/tech-definitions.ts`
- Modify: `src/systems/city-system.ts`
- Modify: `src/ui/city-panel.ts`
- Modify: `src/ui/tech-panel.ts`
- Test: `tests/systems/pacing-model.test.ts`
- Test: `tests/ui/city-panel.test.ts`
- Test: `tests/ui/tech-panel.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/systems/pacing-model.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { estimateTurnsToComplete, getTargetTurnWindow } from '@/systems/pacing-model';

describe('pacing-model', () => {
  it('gives Era 1 starter items a 2-4 turn target window', () => {
    expect(getTargetTurnWindow({ era: 1, band: 'starter', contentType: 'building' })).toEqual({ min: 2, max: 4 });
  });

  it('rounds ETA values up by turn', () => {
    expect(estimateTurnsToComplete({ cost: 12, outputPerTurn: 4 })).toBe(3);
    expect(estimateTurnsToComplete({ cost: 13, outputPerTurn: 4 })).toBe(4);
  });
});
```

Extend `tests/ui/city-panel.test.ts`:

```typescript
it('shows ETA text for buildable units and buildings', () => {
  const { container, city, state } = makeWonderPanelFixture();
  const panel = createCityPanel(container, city, state, {
    onBuild: () => {},
    onOpenWonderPanel: () => {},
    onClose: () => {},
  });

  expect(panel.textContent).toContain('turns');
});
```

Extend `tests/ui/tech-panel.test.ts`:

```typescript
it('shows ETA language for the active research summary', () => {
  const state = createNewGame(undefined, 'tech-eta-test');
  state.civilizations.player.techState.currentResearch = 'fire';

  const panel = createTechPanel(document.body, state, {
    onStartResearch: () => {},
    onClose: () => {},
  });

  expect(panel.textContent).toContain('Turns remaining');
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/pacing-model.test.ts tests/ui/city-panel.test.ts tests/ui/tech-panel.test.ts
```

Expected: FAIL because pacing helpers and the ETA language are not implemented yet.

- [ ] **Step 3: Add pacing types and helpers**

In `src/core/types.ts`, add:

```typescript
export type PacingBand =
  | 'starter'
  | 'core'
  | 'specialist'
  | 'infrastructure'
  | 'power-spike'
  | 'marquee';

export type PacingContentType = 'building' | 'unit' | 'tech' | 'wonder';

export interface PacingMetadata {
  band: PacingBand;
  role: string;
  impact: number;
  scope: 'city' | 'military' | 'empire';
  snowball: number;
  urgency: number;
  situationality: number;
  unlockBreadth: number;
}
```

Create `src/systems/pacing-model.ts`:

```typescript
import type { PacingBand, PacingContentType } from '@/core/types';

const BAND_WINDOWS: Record<PacingBand, { early: [number, number]; late: [number, number] }> = {
  starter: { early: [2, 4], late: [2, 5] },
  core: { early: [3, 5], late: [4, 7] },
  specialist: { early: [4, 6], late: [5, 8] },
  infrastructure: { early: [5, 8], late: [6, 10] },
  'power-spike': { early: [6, 9], late: [7, 11] },
  marquee: { early: [10, 12], late: [10, 16] },
};

export function getTargetTurnWindow(input: { era: number; band: PacingBand; contentType: PacingContentType }): { min: number; max: number } {
  const [min, max] = input.era <= 1 ? BAND_WINDOWS[input.band].early : BAND_WINDOWS[input.band].late;
  return { min, max };
}

export function estimateTurnsToComplete(input: { cost: number; outputPerTurn: number }): number {
  if (input.outputPerTurn <= 0) return Number.POSITIVE_INFINITY;
  return Math.ceil(input.cost / input.outputPerTurn);
}
```

- [ ] **Step 4: Retune the opening catalog and annotate starter items**

In `src/systems/city-system.ts`, retune visible opening items and add pacing metadata:

```typescript
shrine: {
  id: 'shrine',
  name: 'Shrine',
  category: 'culture',
  yields: { food: 0, production: 0, gold: 0, science: 1 },
  productionCost: 15,
  description: 'Place of worship',
  techRequired: null,
  adjacencyBonuses: [],
  pacing: {
    band: 'starter',
    role: 'early-science',
    impact: 1,
    scope: 'city',
    snowball: 1.1,
    urgency: 1.1,
    situationality: 1,
    unlockBreadth: 1,
  },
},
barracks: {
  id: 'barracks',
  name: 'Barracks',
  category: 'military',
  yields: { food: 0, production: 0, gold: 0, science: 0 },
  productionCost: 18,
  description: 'A training ground. Required by future military doctrines.',
  techRequired: null,
  adjacencyBonuses: [],
  pacing: {
    band: 'starter',
    role: 'military-enabler',
    impact: 1,
    scope: 'city',
    snowball: 1,
    urgency: 1.15,
    situationality: 1,
    unlockBreadth: 1.05,
  },
},
```

And:

```typescript
export const TRAINABLE_UNITS = [
  { type: 'warrior', name: 'Warrior', cost: 15 },
  { type: 'scout', name: 'Scout', cost: 12 },
  { type: 'worker', name: 'Worker', cost: 20 },
  // ...
];
```

In `src/systems/tech-definitions.ts`, retune visible opening techs:

```typescript
{ id: 'fire', name: 'Fire', track: 'science', cost: 12, prerequisites: [], unlocks: ['Unlock basic research'], era: 1, pacing: { band: 'starter', role: 'foundational-science', impact: 1, scope: 'empire', snowball: 1.15, urgency: 1.1, situationality: 1, unlockBreadth: 1.1 } },
{ id: 'gathering', name: 'Gathering', track: 'economy', cost: 12, prerequisites: [], unlocks: ['Foundational economy knowledge'], era: 1, pacing: { band: 'starter', role: 'foundational-economy', impact: 1, scope: 'empire', snowball: 1.1, urgency: 1.05, situationality: 1, unlockBreadth: 1.05 } },
{ id: 'tribal-council', name: 'Tribal Council', track: 'civics', cost: 12, prerequisites: [], unlocks: ['Basic governance'], era: 1, pacing: { band: 'starter', role: 'foundational-civics', impact: 1, scope: 'empire', snowball: 1, urgency: 1, situationality: 1, unlockBreadth: 1.05 } },
{ id: 'pathfinding', name: 'Pathfinding', track: 'exploration', cost: 12, prerequisites: [], unlocks: ['Scouts get +1 vision'], era: 1, pacing: { band: 'starter', role: 'foundational-exploration', impact: 1, scope: 'military', snowball: 1, urgency: 1.1, situationality: 1, unlockBreadth: 1 } },
{ id: 'stone-weapons', name: 'Stone Weapons', track: 'military', cost: 15, prerequisites: [], unlocks: ['Warriors deal +2 damage'], era: 1, pacing: { band: 'starter', role: 'foundational-military', impact: 1.05, scope: 'military', snowball: 1, urgency: 1.15, situationality: 1, unlockBreadth: 1 } },
```

- [ ] **Step 5: Show ETAs in city and tech panels**

In `src/ui/city-panel.ts`, keep the current turn display but make the active section explicit:

```typescript
<div style="font-size:12px;opacity:0.7;"><span data-text="prod-turns"></span> turns remaining</div>
```

And ensure build cards continue to show:

```typescript
<div style="font-size:11px;opacity:0.7;">${yieldStr}${turns} turns</div>
```

In `src/ui/tech-panel.ts`, update the summary block:

```typescript
function buildCurrentResearchSummary(currentTech: Tech | undefined, progress: number, turnsRemaining: number | null): HTMLDivElement | null {
  if (!currentTech) {
    return null;
  }

  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'background:rgba(255,255,255,0.1);border-radius:10px;padding:12px;margin-bottom:16px;';

  const heading = document.createElement('div');
  heading.textContent = `Researching: ${currentTech.name}`;
  heading.style.cssText = 'font-weight:bold;color:#e8c170;';
  wrapper.appendChild(heading);

  const summary = document.createElement('div');
  summary.textContent = turnsRemaining === null
    ? `${titleCase(currentTech.track)}`
    : `${titleCase(currentTech.track)} · Turns remaining: ${turnsRemaining}`;
  summary.style.cssText = 'font-size:12px;opacity:0.7;';
  wrapper.appendChild(summary);

  return wrapper;
}
```

Then compute:

```typescript
const estimatedSciencePerTurn = 3;
const turnsRemaining = currentTech
  ? estimateTurnsToComplete({
      cost: Math.max(0, currentTech.cost - civ.techState.researchProgress),
      outputPerTurn: estimatedSciencePerTurn,
    })
  : null;
```

- [ ] **Step 6: Run targeted tests, rule checks, and build**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/pacing-model.test.ts tests/ui/city-panel.test.ts tests/ui/tech-panel.test.ts
scripts/check-src-rule-violations.sh src/core/types.ts src/systems/pacing-model.ts src/systems/tech-definitions.ts src/systems/city-system.ts src/ui/city-panel.ts src/ui/tech-panel.ts
./scripts/run-with-mise.sh yarn build
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/core/types.ts src/systems/pacing-model.ts src/systems/tech-definitions.ts src/systems/city-system.ts src/ui/city-panel.ts src/ui/tech-panel.ts tests/systems/pacing-model.test.ts tests/ui/city-panel.test.ts tests/ui/tech-panel.test.ts
git commit -m "feat(pacing): speed up the opening and add eta feedback"
```

---

## Task 2: City Planning Momentum

**Goal:** Add a 3-item city production queue with reorder/remove controls and preserve scheduled work across city actions.

**Why this task delivers value:** Players can keep cities progressing without revisiting the panel every completion, and the city panel will feel much more alive.

**Files:**
- Create: `src/systems/planning-system.ts`
- Modify: `src/core/types.ts`
- Modify: `src/core/game-state.ts`
- Modify: `src/storage/save-manager.ts`
- Modify: `src/systems/city-system.ts`
- Modify: `src/systems/legendary-wonder-system.ts`
- Modify: `src/ui/city-panel.ts`
- Modify: `src/main.ts`
- Test: `tests/systems/planning-system.test.ts`
- Test: `tests/systems/city-system.test.ts`
- Test: `tests/systems/legendary-wonder-system.test.ts`
- Test: `tests/ui/city-panel.test.ts`
- Test: `tests/storage/save-persistence.test.ts`

- [ ] **Step 1: Write the failing queue tests**

Create `tests/systems/planning-system.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { enqueueCityProduction, moveQueuedId, removeQueuedId } from '@/systems/planning-system';

describe('planning-system city queues', () => {
  it('appends new city builds up to a limit of three', () => {
    const city = { productionQueue: ['warrior'] } as any;
    const queued = enqueueCityProduction(city, 'shrine');
    expect(queued.productionQueue).toEqual(['warrior', 'shrine']);
  });

  it('reorders queue items without dropping them', () => {
    expect(moveQueuedId(['warrior', 'shrine', 'worker'], 2, 0)).toEqual(['worker', 'warrior', 'shrine']);
  });

  it('removes queue items cleanly', () => {
    expect(removeQueuedId(['warrior', 'shrine', 'worker'], 1)).toEqual(['warrior', 'worker']);
  });
});
```

Extend `tests/ui/city-panel.test.ts`:

```typescript
it('renders production queue rows with move and remove controls', () => {
  const { container, city, state } = makeWonderPanelFixture();
  city.productionQueue = ['warrior', 'shrine', 'worker'];

  const panel = createCityPanel(container, city, state, {
    onBuild: () => {},
    onMoveQueueItem: () => {},
    onRemoveQueueItem: () => {},
    onOpenWonderPanel: () => {},
    onClose: () => {},
  } as any);

  expect(panel.textContent).toContain('Queue');
  expect(panel.querySelector('[data-queue-action="remove"]')).toBeTruthy();
});
```

Extend `tests/systems/legendary-wonder-system.test.ts`:

```typescript
it('preserves existing queue entries when a legendary wonder starts', () => {
  const state = makeLegendaryWonderFixture({ oracleStepsCompleted: 2 });
  state.cities['city-river'].productionQueue = ['library', 'warrior'];

  const result = startLegendaryWonderBuild(state, 'player', 'city-river', 'oracle-of-delphi', new EventBus());

  expect(result.cities['city-river'].productionQueue).toEqual(['legendary:oracle-of-delphi', 'library', 'warrior']);
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/planning-system.test.ts tests/ui/city-panel.test.ts tests/systems/legendary-wonder-system.test.ts tests/storage/save-persistence.test.ts
```

Expected: FAIL because the queue helpers and controls do not exist yet.

- [ ] **Step 3: Add queue helpers and save-safe city state**

In `src/systems/planning-system.ts`, add:

```typescript
import type { City } from '@/core/types';

const MAX_QUEUE_ITEMS = 3;

export function enqueueCityProduction(city: City, itemId: string): City {
  if (city.productionQueue.includes(itemId)) return city;
  if (city.productionQueue.length >= MAX_QUEUE_ITEMS) {
    throw new Error('Queue limit reached');
  }
  return {
    ...city,
    productionQueue: [...city.productionQueue, itemId],
  };
}

export function moveQueuedId<T>(items: T[], fromIndex: number, toIndex: number): T[] {
  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

export function removeQueuedId<T>(items: T[], index: number): T[] {
  return items.filter((_, currentIndex) => currentIndex !== index);
}
```

In `src/storage/save-manager.ts`, keep old saves safe:

```typescript
function migrateLegacyPlanningState(state: GameState): GameState {
  for (const city of Object.values(state.cities ?? {})) {
    city.productionQueue ??= [];
    if (city.productionQueue.length > 3) {
      city.productionQueue = city.productionQueue.slice(0, 3);
    }
  }
  return state;
}
```

Thread that migration through the existing load paths.

- [ ] **Step 4: Make city build actions append instead of replace**

In `src/main.ts`, replace:

```typescript
targetCity.productionQueue = [itemId];
targetCity.productionProgress = 0;
```

with:

```typescript
gameState.cities[cityId] = enqueueCityProduction(targetCity, itemId);
renderLoop.setGameState(gameState);
showNotification(`${targetCity.name}: queued ${itemId}`, 'info');
```

This preserves scheduled work and satisfies the `No Silent Destructive UI` rule.

- [ ] **Step 5: Add queue controls to `createCityPanel`**

Extend `CityPanelCallbacks`:

```typescript
export interface CityPanelCallbacks {
  onBuild: (cityId: string, itemId: string) => void;
  onMoveQueueItem?: (cityId: string, fromIndex: number, toIndex: number) => void;
  onRemoveQueueItem?: (cityId: string, index: number) => void;
  onOpenWonderPanel: (cityId: string) => void;
  onClose: () => void;
  onPrevCity?: () => void;
  onNextCity?: () => void;
}
```

Render a queue section:

```typescript
const queueRows = city.productionQueue.map((itemId, index) => `
  <div data-queue-index="${index}" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
    <div>
      <div style="font-weight:bold;">${itemId}</div>
      <div style="font-size:11px;opacity:0.7;">Queue slot ${index + 1}</div>
    </div>
    <div style="display:flex;gap:6px;">
      <button type="button" data-queue-action="up" data-queue-index="${index}">↑</button>
      <button type="button" data-queue-action="down" data-queue-index="${index}">↓</button>
      <button type="button" data-queue-action="remove" data-queue-index="${index}">✕</button>
    </div>
  </div>
`).join('');
```

Wire the event listeners to `callbacks.onMoveQueueItem` and `callbacks.onRemoveQueueItem`.

- [ ] **Step 6: Preserve queue tails for legendary wonders**

In `src/systems/legendary-wonder-system.ts`, prepend the wonder instead of wiping the queue:

```typescript
const preservedTail = city.productionQueue.filter(item => item !== `legendary:${wonderId}`);

productionQueue: [`legendary:${wonderId}`, ...preservedTail].slice(0, 3),
```

- [ ] **Step 7: Run targeted tests, rule checks, and build**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/planning-system.test.ts tests/ui/city-panel.test.ts tests/systems/city-system.test.ts tests/systems/legendary-wonder-system.test.ts tests/storage/save-persistence.test.ts
scripts/check-src-rule-violations.sh src/core/types.ts src/core/game-state.ts src/storage/save-manager.ts src/systems/planning-system.ts src/systems/city-system.ts src/systems/legendary-wonder-system.ts src/ui/city-panel.ts src/main.ts
./scripts/run-with-mise.sh yarn build
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/core/types.ts src/core/game-state.ts src/storage/save-manager.ts src/systems/planning-system.ts src/systems/city-system.ts src/systems/legendary-wonder-system.ts src/ui/city-panel.ts src/main.ts tests/systems/planning-system.test.ts tests/systems/city-system.test.ts tests/systems/legendary-wonder-system.test.ts tests/ui/city-panel.test.ts tests/storage/save-persistence.test.ts
git commit -m "feat(city-ui): add build queues and preserve scheduled work"
```

---

## Task 3: Research Momentum And Better Tech Tree

**Goal:** Add a 3-item research queue and redesign the tech panel so it emphasizes current research, available choices, and the next unlock layer instead of a giant wall of disabled items.

**Why this task delivers value:** Players will feel less overwhelmed, see that progress is real, and avoid repeated “pick one tech, wait, reopen” friction.

**Files:**
- Modify: `src/core/types.ts`
- Modify: `src/storage/save-manager.ts`
- Modify: `src/systems/planning-system.ts`
- Modify: `src/systems/tech-system.ts`
- Modify: `src/ui/tech-panel.ts`
- Modify: `src/main.ts`
- Test: `tests/systems/planning-system.test.ts`
- Test: `tests/systems/tech-system.test.ts`
- Test: `tests/ui/tech-panel.test.ts`
- Test: `tests/storage/save-persistence.test.ts`

- [ ] **Step 1: Write the failing research-queue and layered-UI tests**

Extend `tests/systems/planning-system.test.ts`:

```typescript
import { enqueueResearch } from '@/systems/planning-system';

it('starts research immediately and queues follow-up techs after that', () => {
  const techState = {
    completed: [],
    currentResearch: null,
    researchQueue: [],
    researchProgress: 0,
    trackPriorities: {} as any,
  };

  const started = enqueueResearch(techState, 'fire');
  const queued = enqueueResearch(started, 'writing');

  expect(started.currentResearch).toBe('fire');
  expect(queued.researchQueue).toEqual(['writing']);
});
```

Extend `tests/ui/tech-panel.test.ts`:

```typescript
it('keeps deep locked items out of the default view while keeping a show-all affordance', () => {
  const state = createNewGame(undefined, 'tech-layer-test');
  const panel = createTechPanel(document.body, state, {
    onQueueResearch: () => {},
    onMoveQueuedResearch: () => {},
    onRemoveQueuedResearch: () => {},
    onClose: () => {},
  } as any);

  expect(panel.querySelector('[data-action="show-all-techs"]')).toBeTruthy();
});

it('renders research queue controls', () => {
  const state = createNewGame(undefined, 'tech-queue-test');
  state.civilizations.player.techState.currentResearch = 'fire';
  state.civilizations.player.techState.researchQueue = ['writing', 'wheel'];

  const panel = createTechPanel(document.body, state, {
    onQueueResearch: () => {},
    onMoveQueuedResearch: () => {},
    onRemoveQueuedResearch: () => {},
    onClose: () => {},
  } as any);

  expect(panel.textContent).toContain('Research Queue');
  expect(panel.querySelector('[data-queue-action="remove"]')).toBeTruthy();
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/planning-system.test.ts tests/systems/tech-system.test.ts tests/ui/tech-panel.test.ts tests/storage/save-persistence.test.ts
```

Expected: FAIL because `researchQueue` and the new panel behavior do not exist.

- [ ] **Step 3: Add `researchQueue` to `TechState` and migrate old saves**

In `src/core/types.ts`:

```typescript
export interface TechState {
  completed: string[];
  currentResearch: string | null;
  researchQueue: string[];
  researchProgress: number;
  trackPriorities: Record<TechTrack, 'high' | 'medium' | 'low' | 'ignore'>;
}
```

In `src/systems/tech-system.ts`, update `createTechState()`:

```typescript
return {
  completed: [],
  currentResearch: null,
  researchQueue: [],
  researchProgress: 0,
  trackPriorities: { /* existing defaults */ },
};
```

In `src/storage/save-manager.ts`:

```typescript
for (const civ of Object.values(state.civilizations ?? {})) {
  civ.techState.researchQueue ??= [];
}
```

- [ ] **Step 4: Add shared research queue helpers and progression**

In `src/systems/planning-system.ts`:

```typescript
import type { TechState } from '@/core/types';

export function enqueueResearch(state: TechState, techId: string): TechState {
  if (state.completed.includes(techId) || state.currentResearch === techId || state.researchQueue.includes(techId)) {
    return state;
  }

  if (!state.currentResearch) {
    return { ...state, currentResearch: techId, researchProgress: 0 };
  }

  if (1 + state.researchQueue.length >= 3) {
    throw new Error('Queue limit reached');
  }

  return { ...state, researchQueue: [...state.researchQueue, techId] };
}
```

In `src/systems/tech-system.ts`, auto-advance on completion:

```typescript
if (newProgress >= tech.cost) {
  const [nextQueuedResearch, ...remainingQueue] = state.researchQueue;
  return {
    state: {
      ...state,
      completed: [...state.completed, tech.id],
      currentResearch: nextQueuedResearch ?? null,
      researchQueue: remainingQueue,
      researchProgress: 0,
    },
    completedTech: tech.id,
  };
}
```

- [ ] **Step 5: Rebuild the tech panel around visible layers and queue controls**

Update the callbacks:

```typescript
export interface TechPanelCallbacks {
  onQueueResearch: (techId: string) => void;
  onMoveQueuedResearch: (fromIndex: number, toIndex: number) => void;
  onRemoveQueuedResearch: (index: number) => void;
  onClose: () => void;
}
```

Add a helper to compute next-layer tech ids:

```typescript
function getNextLayerTechIds(civ: GameState['civilizations'][string]): Set<string> {
  const availableIds = new Set(getAvailableTechs(civ.techState).map(tech => tech.id));
  const completedIds = new Set(civ.techState.completed);
  return new Set(
    TECH_TREE
      .filter(tech => !availableIds.has(tech.id) && !completedIds.has(tech.id))
      .filter(tech => tech.prerequisites.some(prereq => availableIds.has(prereq) || civ.techState.currentResearch === prereq))
      .map(tech => tech.id),
  );
}
```

Default rendering rules:

- show current research
- show available-now techs
- show next-layer techs
- do not show deep locked items by default
- show a `Show all techs` button to expose the full catalog

Render a `Research Queue` section mirroring the city queue pattern.

- [ ] **Step 6: Wire `main.ts` to enqueue, reorder, and remove research**

In `src/main.ts`:

```typescript
createTechPanel(uiLayer, gameState, {
  onQueueResearch: (techId) => {
    currentCiv().techState = enqueueResearch(currentCiv().techState, techId);
    renderLoop.setGameState(gameState);
    updateHUD();
  },
  onMoveQueuedResearch: (fromIndex, toIndex) => {
    currentCiv().techState = {
      ...currentCiv().techState,
      researchQueue: moveQueuedId(currentCiv().techState.researchQueue, fromIndex, toIndex),
    };
    renderLoop.setGameState(gameState);
    updateHUD();
  },
  onRemoveQueuedResearch: (index) => {
    currentCiv().techState = {
      ...currentCiv().techState,
      researchQueue: removeQueuedId(currentCiv().techState.researchQueue, index),
    };
    renderLoop.setGameState(gameState);
    updateHUD();
  },
  onClose: () => {},
});
```

- [ ] **Step 7: Run targeted tests, rule checks, and build**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/planning-system.test.ts tests/systems/tech-system.test.ts tests/ui/tech-panel.test.ts tests/storage/save-persistence.test.ts
scripts/check-src-rule-violations.sh src/core/types.ts src/storage/save-manager.ts src/systems/planning-system.ts src/systems/tech-system.ts src/ui/tech-panel.ts src/main.ts
./scripts/run-with-mise.sh yarn build
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/core/types.ts src/storage/save-manager.ts src/systems/planning-system.ts src/systems/tech-system.ts src/ui/tech-panel.ts src/main.ts tests/systems/planning-system.test.ts tests/systems/tech-system.test.ts tests/ui/tech-panel.test.ts tests/storage/save-persistence.test.ts
git commit -m "feat(tech-ui): add research queues and layered tree focus"
```

---

## Task 4: No More Accidental Idle Turns

**Goal:** Block end turn when the player has idle production or idle research with valid options, and present a helpful chooser instead of letting the player waste turns.

**Why this task delivers value:** Players stop losing momentum to accidental empty queues and immediately feel the game is guiding them toward meaningful play.

**Files:**
- Create: `src/ui/required-choice-panel.ts`
- Modify: `src/systems/planning-system.ts`
- Modify: `src/ui/tutorial.ts`
- Modify: `src/ui/advisor-system.ts`
- Modify: `src/main.ts`
- Test: `tests/ui/required-choice-panel.test.ts`
- Test: `tests/ui/tutorial.test.ts`
- Test: `tests/ui/advisor-system.test.ts`
- Test: `tests/integration/end-turn-gating.test.ts`

- [ ] **Step 1: Write the failing required-choice tests**

Create `tests/ui/required-choice-panel.test.ts`:

```typescript
import { describe, expect, it, vi } from 'vitest';
import { createRequiredChoicePanel } from '@/ui/required-choice-panel';

describe('required-choice-panel', () => {
  it('renders both research and production prompts with actionable buttons', () => {
    const panel = createRequiredChoicePanel(document.body, {
      researchChoices: [{ techId: 'fire', label: 'Fire', turns: 4 }],
      cityChoices: [{ cityId: 'city-1', cityName: 'Roma', itemId: 'warrior', label: 'Warrior', turns: 3 }],
      onChooseResearch: vi.fn(),
      onChooseCityBuild: vi.fn(),
      onOpenTech: vi.fn(),
      onOpenCity: vi.fn(),
    });

    expect(panel.textContent).toContain('Choose Research');
    expect(panel.textContent).toContain('Choose Production');
  });
});
```

Create `tests/integration/end-turn-gating.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import { needsResearchChoice } from '@/systems/planning-system';

describe('end-turn gating', () => {
  it('detects when the player has no active research but valid options exist', () => {
    const state = createNewGame(undefined, 'end-turn-gating-seed', 'small');
    expect(needsResearchChoice(state, state.currentPlayer)).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/required-choice-panel.test.ts tests/ui/tutorial.test.ts tests/ui/advisor-system.test.ts tests/integration/end-turn-gating.test.ts
```

Expected: FAIL because the shared idle-choice helpers and required-choice panel do not exist.

- [ ] **Step 3: Add shared idle-choice helpers**

Extend `src/systems/planning-system.ts`:

```typescript
import type { GameState } from '@/core/types';
import { getAvailableTechs } from '@/systems/tech-system';
import { getAvailableBuildings, TRAINABLE_UNITS } from '@/systems/city-system';

export function getIdleCityIds(state: GameState, civId: string): string[] {
  const completedTechs = state.civilizations[civId]?.techState.completed ?? [];
  return Object.values(state.cities)
    .filter(city => city.owner === civId)
    .filter(city => city.productionQueue.length === 0)
    .filter(city => {
      const buildableBuildings = getAvailableBuildings(city, completedTechs).length > 0;
      const buildableUnits = TRAINABLE_UNITS.some(unit => !unit.techRequired || completedTechs.includes(unit.techRequired));
      return buildableBuildings || buildableUnits;
    })
    .map(city => city.id);
}

export function needsResearchChoice(state: GameState, civId: string): boolean {
  const civ = state.civilizations[civId];
  if (!civ) return false;
  if (civ.techState.currentResearch) return false;
  return getAvailableTechs(civ.techState).length > 0;
}
```

- [ ] **Step 4: Add the required-choice panel**

Create `src/ui/required-choice-panel.ts`:

```typescript
export function createRequiredChoicePanel(
  container: HTMLElement,
  config: {
    researchChoices: Array<{ techId: string; label: string; turns: number }>;
    cityChoices: Array<{ cityId: string; cityName: string; itemId: string; label: string; turns: number }>;
    onChooseResearch: (techId: string) => void;
    onChooseCityBuild: (cityId: string, itemId: string) => void;
    onOpenTech: () => void;
    onOpenCity: (cityId: string) => void;
  },
): HTMLElement {
  const panel = document.createElement('div');
  panel.id = 'required-choice-panel';
  panel.style.cssText = 'position:absolute;inset:0;background:rgba(12,12,24,0.96);z-index:40;padding:16px;overflow:auto;';

  const title = document.createElement('h2');
  title.textContent = 'Choose Your Next Step';
  panel.appendChild(title);

  const researchHeading = document.createElement('h3');
  researchHeading.textContent = 'Choose Research';
  panel.appendChild(researchHeading);

  const cityHeading = document.createElement('h3');
  cityHeading.textContent = 'Choose Production';
  panel.appendChild(cityHeading);

  container.appendChild(panel);
  return panel;
}
```

Use `textContent` / `createElement()` throughout.

- [ ] **Step 5: Gate `endTurn()` and align tutorial/advisor prompts**

In `src/main.ts`, add:

```typescript
function showRequiredChoicesIfNeeded(): boolean {
  const civId = gameState.currentPlayer;
  const idleCityIds = getIdleCityIds(gameState, civId);
  const missingResearch = needsResearchChoice(gameState, civId);

  if (!idleCityIds.length && !missingResearch) {
    return false;
  }

  uiInteractions.setBlockingOverlay('required-choice');
  createRequiredChoicePanel(uiLayer, {
    researchChoices: [],
    cityChoices: idleCityIds.map(cityId => ({ cityId, cityName: gameState.cities[cityId].name, itemId: 'warrior', label: 'Warrior', turns: 3 })),
    onChooseResearch: (techId) => {
      currentCiv().techState = enqueueResearch(currentCiv().techState, techId);
      document.getElementById('required-choice-panel')?.remove();
      uiInteractions.setBlockingOverlay(null);
      renderLoop.setGameState(gameState);
      updateHUD();
    },
    onChooseCityBuild: (cityId, itemId) => {
      const city = gameState.cities[cityId];
      if (!city) return;
      gameState.cities[cityId] = enqueueCityProduction(city, itemId);
      document.getElementById('required-choice-panel')?.remove();
      uiInteractions.setBlockingOverlay(null);
      renderLoop.setGameState(gameState);
      updateHUD();
    },
    onOpenTech: () => togglePanel('tech'),
    onOpenCity: (cityId) => openCityPanelForCity(gameState.cities[cityId]),
  });

  return true;
}
```

At the top of `endTurn()`:

```typescript
if (showRequiredChoicesIfNeeded()) {
  showNotification('Choose production and research before ending the turn.', 'info');
  return;
}
```

In `src/ui/tutorial.ts`, replace the current checks:

```typescript
trigger: (state) => needsResearchChoice(state, state.currentPlayer) && state.turn >= 2,
```

and:

```typescript
trigger: (state) => getIdleCityIds(state, state.currentPlayer).length > 0,
```

In `src/ui/advisor-system.ts`, replace the existing `cities[0]` / `currentResearch === null` idle logic with the same shared helpers.

- [ ] **Step 6: Run targeted tests, rule checks, and build**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/required-choice-panel.test.ts tests/ui/tutorial.test.ts tests/ui/advisor-system.test.ts tests/integration/end-turn-gating.test.ts
scripts/check-src-rule-violations.sh src/systems/planning-system.ts src/ui/required-choice-panel.ts src/ui/tutorial.ts src/ui/advisor-system.ts src/main.ts
./scripts/run-with-mise.sh yarn build
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/systems/planning-system.ts src/ui/required-choice-panel.ts src/ui/tutorial.ts src/ui/advisor-system.ts src/main.ts tests/ui/required-choice-panel.test.ts tests/ui/tutorial.test.ts tests/ui/advisor-system.test.ts tests/integration/end-turn-gating.test.ts
git commit -m "feat(turn-flow): block accidental idle turns with required choices"
```

---

## Task 5: Local Balance Audit And Debug View

**Goal:** Add deterministic, local-only pacing audit/debug tools and use them to validate the current retuned catalog.

**Why this task delivers value:** Developers and playtesters can inspect pacing locally, and the retune becomes easier to trust and maintain without a server.

**Files:**
- Create: `src/systems/pacing-audit.ts`
- Create: `src/ui/pacing-debug-panel.ts`
- Modify: `src/main.ts`
- Test: `tests/systems/pacing-audit.test.ts`
- Test: `tests/integration/pacing-simulation.test.ts`

- [ ] **Step 1: Write the failing audit and simulation tests**

Create `tests/systems/pacing-audit.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { buildPacingAudit } from '@/systems/pacing-audit';

describe('pacing-audit', () => {
  it('returns audit rows for current techs, units, and buildings', () => {
    const rows = buildPacingAudit();
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some(row => row.id === 'warrior')).toBe(true);
    expect(rows.some(row => row.id === 'fire')).toBe(true);
  });
});
```

Create `tests/integration/pacing-simulation.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import { EventBus } from '@/core/event-bus';
import { processTurn } from '@/core/turn-manager';
import { foundCity } from '@/systems/city-system';

describe('pacing simulation', () => {
  it('produces an early completion within a few turns on a deterministic seed', () => {
    const state = createNewGame(undefined, 'pacing-sim-seed', 'small');
    const bus = new EventBus();
    const city = foundCity('player', state.units[state.civilizations.player.units[0]].position, state.map);
    state.cities[city.id] = city;
    state.civilizations.player.cities.push(city.id);
    state.cities[city.id].productionQueue = ['warrior'];
    state.civilizations.player.techState.currentResearch = 'fire';

    let next = state;
    let warriorDone = false;
    let fireDone = false;

    for (let i = 0; i < 6; i++) {
      next = processTurn(next, bus);
      warriorDone = warriorDone || Object.values(next.units).some(unit => unit.owner === 'player' && unit.type === 'warrior' && unit.id !== state.civilizations.player.units[1]);
      fireDone = fireDone || next.civilizations.player.techState.completed.includes('fire');
    }

    expect(warriorDone || fireDone).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/pacing-audit.test.ts tests/integration/pacing-simulation.test.ts
```

Expected: FAIL because the audit module and debug surface do not exist yet.

- [ ] **Step 3: Add a local audit builder**

Create `src/systems/pacing-audit.ts`:

```typescript
import { BUILDINGS, TRAINABLE_UNITS } from '@/systems/city-system';
import { TECH_TREE } from '@/systems/tech-definitions';
import { estimateTurnsToComplete, getTargetTurnWindow } from '@/systems/pacing-model';

export interface PacingAuditRow {
  id: string;
  label: string;
  contentType: 'building' | 'unit' | 'tech';
  era: number;
  band: string;
  currentCost: number;
  estimatedTurns: number;
  target: { min: number; max: number };
}

export function buildPacingAudit(): PacingAuditRow[] {
  return [
    ...Object.values(BUILDINGS).map(building => ({
      id: building.id,
      label: building.name,
      contentType: 'building' as const,
      era: building.techRequired ? 2 : 1,
      band: building.pacing?.band ?? 'core',
      currentCost: building.productionCost,
      estimatedTurns: estimateTurnsToComplete({ cost: building.productionCost, outputPerTurn: 4 }),
      target: getTargetTurnWindow({ era: building.techRequired ? 2 : 1, band: building.pacing?.band ?? 'core', contentType: 'building' }),
    })),
    ...TRAINABLE_UNITS.map(unit => ({
      id: unit.type,
      label: unit.name,
      contentType: 'unit' as const,
      era: unit.techRequired ? 2 : 1,
      band: unit.type === 'warrior' || unit.type === 'scout' ? 'starter' : 'core',
      currentCost: unit.cost,
      estimatedTurns: estimateTurnsToComplete({ cost: unit.cost, outputPerTurn: 4 }),
      target: getTargetTurnWindow({ era: unit.techRequired ? 2 : 1, band: unit.type === 'warrior' || unit.type === 'scout' ? 'starter' : 'core', contentType: 'unit' }),
    })),
    ...TECH_TREE.map(tech => ({
      id: tech.id,
      label: tech.name,
      contentType: 'tech' as const,
      era: tech.era,
      band: tech.pacing?.band ?? 'core',
      currentCost: tech.cost,
      estimatedTurns: estimateTurnsToComplete({ cost: tech.cost, outputPerTurn: tech.era === 1 ? 3 : 8 }),
      target: getTargetTurnWindow({ era: tech.era, band: tech.pacing?.band ?? 'core', contentType: 'tech' }),
    })),
  ];
}
```

- [ ] **Step 4: Add a local-only pacing debug panel**

Create `src/ui/pacing-debug-panel.ts`:

```typescript
import type { GameState } from '@/core/types';
import { buildPacingAudit } from '@/systems/pacing-audit';

export function createPacingDebugPanel(container: HTMLElement, _state: GameState): HTMLElement {
  const panel = document.createElement('div');
  panel.id = 'pacing-debug-panel';
  panel.style.cssText = 'position:absolute;top:12px;right:12px;z-index:45;background:rgba(0,0,0,0.88);color:white;padding:12px;border-radius:10px;width:320px;max-height:70vh;overflow:auto;';

  const title = document.createElement('h3');
  title.textContent = 'Pacing Debug';
  panel.appendChild(title);

  buildPacingAudit().slice(0, 12).forEach(row => {
    const entry = document.createElement('div');
    entry.textContent = `${row.label}: ${row.estimatedTurns} turns (target ${row.target.min}-${row.target.max})`;
    entry.style.cssText = 'font-size:12px;margin-bottom:6px;';
    panel.appendChild(entry);
  });

  container.appendChild(panel);
  return panel;
}
```

Wire it in `src/main.ts` behind a developer-only toggle, for example:

```typescript
let pacingDebugOpen = false;
window.addEventListener('keydown', event => {
  if (event.key === '`') {
    pacingDebugOpen = !pacingDebugOpen;
    document.getElementById('pacing-debug-panel')?.remove();
    if (pacingDebugOpen) {
      createPacingDebugPanel(uiLayer, gameState);
    }
  }
});
```

- [ ] **Step 5: Run targeted tests, rule checks, and build**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/pacing-audit.test.ts tests/integration/pacing-simulation.test.ts
scripts/check-src-rule-violations.sh src/systems/pacing-audit.ts src/ui/pacing-debug-panel.ts src/main.ts
./scripts/run-with-mise.sh yarn build
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/systems/pacing-audit.ts src/ui/pacing-debug-panel.ts src/main.ts tests/systems/pacing-audit.test.ts tests/integration/pacing-simulation.test.ts
git commit -m "feat(balance): add local pacing audit and debug tools"
```

---

## Verification Checklist Per Task

For every task above, complete all of the following before moving on:

- [ ] Feature behavior is visible in the browser or clearly demonstrable from tests
- [ ] Targeted tests pass
- [ ] `scripts/check-src-rule-violations.sh` passes for changed `src/` files
- [ ] Relevant UI/reachability regressions are covered
- [ ] No pre-existing queue content is silently discarded
- [ ] Save/load behavior is still correct when queue state changes
- [ ] The task’s MR diff is small enough to review comfortably

---

## Self-Review

### Spec Coverage

- Faster early pacing: Task 1
- ETA visibility in city and tech UI: Task 1
- City 3-item queue with reorder/remove: Task 2
- Research 3-item queue with reorder/remove: Task 3
- Issue `#56` tech tree redesign: Task 3
- Forced player choice for idle production/research: Task 4
- Browser-only local audit/debug tooling: Task 5

### User-Value Check

Every task now ends in something the player will notice:

- Task 1: faster opening plus ETA feedback
- Task 2: city queues and smoother city momentum
- Task 3: research queues and a better tech tree
- Task 4: no more accidental idle turns
- Task 5: visible local pacing/debug inspection and safer broader tuning

### Reviewability Check

Every task is a single MR theme with bounded file touch points and targeted verification.

## Execution Handoff

Plan updated and saved to `docs/superpowers/plans/2026-04-16-game-pacing-overhaul.md`.

Recommended execution approach:

**1. Subagent-Driven** - one fresh implementation agent per task, with review between tasks. Best fit for the “each MR should be easy to review and deliver user value” requirement.

**2. Inline Execution** - do the tasks in this session with checkpoints after each slice.

If you want, I can start with **Task 1** and keep each slice MR-shaped from the beginning.
