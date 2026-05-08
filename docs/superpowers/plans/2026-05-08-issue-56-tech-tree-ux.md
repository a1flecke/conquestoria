# Issue 56 Tech Tree UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish issue [#56](https://github.com/a1flecke/conquestoria/issues/56) by turning the research panel into a progressive discovery tree that starts small, grows as the player researches more, focuses on the current or newly discovered tech, and still allows zooming out to inspect broader research paths.

**Architecture:** Keep gameplay state unchanged and derive all tech-map presentation from `TECH_TREE` plus `TechState`. Add one shared progression view model for node state, dependency edges, path eligibility, track ordering, progressive reveal, focus target, and zoom scope; the DOM panel renders that model as an era-column/track-row tree with SVG dependency edges, focus/zoom controls, and a selected-tech inspector.

**Tech Stack:** TypeScript, Vitest, jsdom, DOM/CSS/SVG UI, existing research queue helpers.

---

## Issue Status

Issue #56 is still open and still materially valid.

The current implementation partially addressed the original complaint:

- `src/ui/tech-panel.ts` no longer renders a single full wall by default.
- The default view includes current research, available techs, next-layer techs, completed techs, ETA text, and `Show all techs`.
- Research queue add, reorder, remove, and rerender behavior already has UI coverage in `tests/ui/tech-panel.test.ts`.

The remaining gap is the core ask from the issue body: "display as a tree showing dependencies." The current panel is a grouped list, not a dependency tree. It does not render prerequisite edges, does not explain which prerequisites are satisfied versus missing, and does not let a player visually follow a route from a goal back to the current frontier. The panel also hardcodes the track list even though repo UI rules require deriving tech tracks from `TECH_TREE` or the type definition.

Targeted verification run while writing this plan:

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/tech-panel.test.ts tests/systems/tech-system.test.ts
```

Observed result: all 143 test files and 1452 tests passed; hook tests passed; branch-switching hook smoke test skipped because the working tree was dirty.

## UX Brainstorm

### Approach A: Progressive Discovery Tree (Recommended)

Render the tech panel as a living tree that begins with only starter techs and the immediate frontier. As the player completes research, the tree reveals downstream children and recent discoveries become visible branches. The camera or scroll focus centers on current research; after completion, it can focus the newly completed tech or the auto-started queued follow-up. Players can zoom from `Focus` to `Known tree` to `All techs`.

Why this is the right first implementation:

- It directly satisfies the issue's dependency-tree request.
- It keeps the existing "current plus next layer" focus.
- It creates a sense of discovery instead of exposing the entire rules catalog on turn 1.
- It preserves mobile usability because the default surface stays bounded.
- It works with the existing queue and ETA systems.
- It avoids adding a large graph-layout dependency.

### Approach B: Goal Route Planner

Let players select a locked goal such as `Banking`, `Harbors`, or `Spy Networks`; the panel highlights the shortest required chain and offers to queue the next reachable prerequisite.

Why it helps gameplay:

- It turns the tech tree from a catalog into a strategic planning tool.
- It makes cross-track prerequisites understandable.
- It gives the player an immediate next action even when the desired tech is several steps away.

Tradeoff: this is best as a layer on top of Approach A. A route planner without a readable map can feel like opaque automation.

### Approach C: Full Pan/Zoom Classic Tree

Render every tech in one large graph with pan/zoom, minimap, and filters.

Why not first:

- It risks recreating the "too long" problem in a different shape.
- It is harder to make reliable on mobile.
- It needs more interaction design than the current issue requires.

Keep this as the `All techs` zoom level's long-term direction, not the first default.

## Recommended Design

Implement Approach A and include the smallest useful part of Approach B: selecting any known locked or next-layer tech highlights its visible prerequisite path and shows the next queueable prerequisite. Do not add automatic multi-tech queueing in this pass; queue actions must stay explicit, visible, and bounded by the existing 3-item research queue.

Progressive reveal model:

- `Focus` shows the current research or most recent completed tech, its prerequisites, its direct children, queued follow-ups, available choices, and one child layer beyond the immediate frontier.
- `Known tree` shows completed, current, queued, available, and all revealed future techs. A tech is revealed when every prerequisite is completed, current, queued, available, or already part of the immediate frontier.
- `All techs` shows the complete catalog for planning and debugging the full shape of the game. It replaces the current `Show all techs` button behavior.
- If `currentResearch` exists, it is the default focus target.
- If no `currentResearch` exists, the default focus target is the last item in `techState.completed`.
- If implementation wants exact "just researched" focus while a queued item auto-starts, `createTechPanel` may accept an optional `initialFocusTechId` from `main.ts`; do not add persistent save-state only for this view preference.

Default map behavior:

- Start in `Focus` zoom.
- Show current research, queued research, available-now techs, next-layer techs, and completed techs that connect to visible nodes.
- Hide unrevealed deep locked nodes by default.
- Keep tested `Known tree` and `All techs` controls for broader inspection.
- Use track rows derived from `TECH_TREE`, not the current hardcoded `TRACKS` array.
- Arrange eras as columns so left-to-right movement communicates progress.
- Render dependency edges only for visible nodes by default; render all edges in `All techs`.
- Selecting a node opens or updates the same-panel detail inspector instead of navigating away.

Selected-tech inspector:

- Shows name, track, era, cost, ETA when queueable, and all unlocks.
- Shows prerequisites as `Done`, `Researching`, `Queued`, `Available now`, or `Locked`.
- Shows one explicit action when legal: `Research` if no active research, or `Add to queue` if the tech can legally follow the active/queued chain.
- For locked goals, shows `Next step: <tech name>` when a prerequisite is available or next-layer.

## Player Truth Table

| Before | Action | Internal state change | Immediate visible result | Must remain reachable |
|---|---|---|---|---|
| No active research; focused map shows available starter techs | Click `Fire` card or inspector `Research` | `currentResearch` becomes `fire`, progress resets to 0 | Header shows `Researching: Fire`, `Fire` card becomes current, `Writing` edge/path appears as next-layer | Other available starter techs remain clickable or visible |
| Active `Fire`; `Writing` is next-layer | Select `Writing` | No gameplay mutation | Inspector shows `Fire` prerequisite as `Researching`, unlocks, and ETA/path context | `All techs` still exposes complete catalog |
| Active `Fire`; `Writing` selected and queue has space | Click `Add to queue` for `Writing` | `researchQueue` appends `writing` | `Writing` card becomes queued, queue section updates order/ETA, `Mathematics` becomes next-layer if its prerequisites are satisfied by completed/current/queued chain | Existing queue items remain in order |
| `Fire` completes and `Writing` auto-starts from the queue | Open Research | No gameplay mutation | Tree focuses on `Writing` by default; `Fire` remains visible as a completed parent; newly revealed `Mathematics` appears as a future branch | Other starter branches remain visible through `Known tree` |
| Focused map hides deep `Banking` | Switch zoom to `All techs` | No gameplay mutation | Full tree renders including `Banking`; all dependency edges for visible nodes render | Available actions are unchanged and still clickable |
| `Banking` selected in full tree but prerequisites are missing | Click next-step action for an available prerequisite | Only the selected prerequisite is queued or started | Path highlight updates and `Banking` stays locked until every prerequisite is satisfied by completed/current/queued chain | The player can inspect other branches without losing current queue |
| Queue contains `Writing`, `Wheel` | Click remove on `Writing` | `researchQueue` removes index 0 | Queue rerenders immediately, card state changes from queued to next-layer or available according to the shared model, ETA/order text recalculates | `Wheel` remains queued if still valid in the planned chain |

## Misleading UI Risks

- `available-now` is misleading if it includes a tech whose prerequisites are not all completed. Negative test: with only `trade-routes` completed, `banking` is not available because `mathematics` is missing.
- `next-layer` is misleading if it includes a tech whose prerequisites are not all completed, current, queued, or available as the immediate frontier. Negative test: `banking` is not default-visible when only `trade-routes` is available and `mathematics` is still deep locked.
- `queued` is misleading if queue order does not satisfy prerequisites. Negative test: a planned chain can queue `writing` after current `fire`, but cannot queue `banking` after current `fire` with no `trade-routes` or `mathematics` plan.
- `path to selected` is misleading if it highlights unrelated same-track ancestors. Negative test: selecting `medicine` highlights `philosophy` and `pottery`, not unrelated `astronomy`.
- `revealed` is misleading if the tree shows deep future content just because it exists in `TECH_TREE`. Negative test: `nuclear-theory` is not visible in `Focus` or `Known tree` at game start.
- `focus` is misleading if it jumps to an arbitrary first track. Negative test: with `currentResearch = 'writing'`, the selected/focused card is `writing`, not `stone-weapons`.
- `All techs` must not become the only way to start valid research. Negative test: every currently queueable tech has either a visible `Focus` card or an explicit inspector action.

## Interaction Replay Checklist

- Add first research from the focused map.
- Add second and third queued research from the focused map.
- Select a next-layer node before and after queueing its prerequisite.
- Complete a tech, reopen the panel, and confirm the tree focuses on current research or latest completed research.
- Toggle `Focus`, `Known tree`, and `All techs` without mutating research state.
- Remove a queued item and confirm node state, path highlight, queue order, and ETA text rerender.
- Move queued research up and down and confirm the selected-path labels recalculate.
- Attempt to move a queued tech before one of its prerequisites and confirm the control is disabled.
- Repeat-click a card after the first mutation to ensure stale DOM does not call callbacks with old indices.
- Reopen the tech panel and confirm current, queued, available, next-layer, and selected defaults match state.
- Switch to `All techs` and confirm all `TECH_TREE` ids are present.

## Task 1: Add Shared Tech Progression View Model

**Files:**

- Create: `src/systems/tech-progression.ts`
- Create: `tests/systems/tech-progression.test.ts`
- Modify: `src/systems/planning-system.ts`
- Modify: `tests/systems/planning-system.test.ts`

- [ ] **Step 1: Write failing progression tests**

Create `tests/systems/tech-progression.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { createTechState, TECH_TREE } from '@/systems/tech-system';
import {
  buildTechProgressionView,
  getDerivedTechTracks,
  getQueueableResearchIds,
} from '@/systems/tech-progression';

describe('tech progression view model', () => {
  it('derives track order from TECH_TREE instead of a hardcoded UI list', () => {
    expect(getDerivedTechTracks(TECH_TREE)).toEqual([
      'military', 'economy', 'science', 'civics', 'exploration',
      'agriculture', 'medicine', 'philosophy', 'arts', 'maritime',
      'metallurgy', 'construction', 'communication', 'espionage', 'spirituality',
    ]);
  });

  it('marks current, queued, available, next-layer, and deep locked nodes distinctly', () => {
    const techState = {
      ...createTechState(),
      completed: ['gathering', 'pottery'],
      currentResearch: 'fire',
      researchQueue: ['writing'],
    };

    const view = buildTechProgressionView(techState);

    expect(view.nodesById.get('fire')?.state).toBe('current');
    expect(view.nodesById.get('writing')?.state).toBe('queued');
    expect(view.nodesById.get('stone-weapons')?.state).toBe('available');
    expect(view.nodesById.get('mathematics')?.state).toBe('next-layer');
    expect(view.nodesById.get('banking')?.state).toBe('locked');
    expect(view.nodesById.get('banking')?.visibleByDefault).toBe(false);
  });

  it('does not treat a conjunctive prerequisite as next-layer when only one branch is near', () => {
    const techState = {
      ...createTechState(),
      completed: ['gathering', 'pottery', 'currency'],
      currentResearch: 'trade-routes',
      researchQueue: [],
    };

    const view = buildTechProgressionView(techState);

    expect(view.nodesById.get('banking')?.state).toBe('locked');
    expect(view.nodesById.get('banking')?.visibleByDefault).toBe(false);
  });

  it('allows queued research only when the planned chain satisfies prerequisites in order', () => {
    const techState = {
      ...createTechState(),
      currentResearch: 'fire',
      researchQueue: ['writing'],
    };

    expect(getQueueableResearchIds(techState)).toContain('mathematics');
    expect(getQueueableResearchIds(techState)).not.toContain('banking');
  });

  it('starts with a small revealed tree and keeps far future tech hidden outside all-tech zoom', () => {
    const view = buildTechProgressionView(createTechState());

    expect(view.visibleIds.has('fire')).toBe(true);
    expect(view.visibleIds.has('writing')).toBe(true);
    expect(view.visibleIds.has('nuclear-theory')).toBe(false);
    expect(view.knownVisibleIds.has('nuclear-theory')).toBe(false);
  });

  it('grows the known tree as research reveals downstream children', () => {
    const early = buildTechProgressionView(createTechState());
    const later = buildTechProgressionView({
      ...createTechState(),
      completed: ['fire', 'writing'],
    });

    expect(early.knownVisibleIds.has('mathematics')).toBe(false);
    expect(later.knownVisibleIds.has('mathematics')).toBe(true);
  });

  it('focuses current research before the latest completed tech', () => {
    const currentView = buildTechProgressionView({
      ...createTechState(),
      completed: ['fire'],
      currentResearch: 'writing',
    });
    const completedView = buildTechProgressionView({
      ...createTechState(),
      completed: ['fire', 'writing'],
      currentResearch: null,
    });

    expect(currentView.focusTechId).toBe('writing');
    expect(completedView.focusTechId).toBe('writing');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/tech-progression.test.ts tests/systems/planning-system.test.ts
```

Expected: FAIL because `src/systems/tech-progression.ts` does not exist.

- [ ] **Step 3: Implement the shared progression model**

Create `src/systems/tech-progression.ts`:

```typescript
import type { Tech, TechState, TechTrack } from '@/core/types';
import { TECH_TREE } from '@/systems/tech-system';
import { estimateTurnsToComplete } from '@/systems/pacing-model';

export type TechNodeState = 'completed' | 'current' | 'queued' | 'available' | 'next-layer' | 'locked';
export type TechEdgeState = 'satisfied' | 'planned' | 'open' | 'blocked';
export type TechTreeZoom = 'focus' | 'known' | 'all';

export interface TechProgressionNode {
  tech: Tech;
  state: TechNodeState;
  track: TechTrack;
  era: number;
  visibleByDefault: boolean;
  prerequisiteIds: string[];
  satisfiedPrerequisiteIds: string[];
  missingPrerequisiteIds: string[];
  turnsToResearch: number | null;
  revealed: boolean;
  visibleInFocus: boolean;
  visibleInKnown: boolean;
}

export interface TechProgressionEdge {
  fromId: string;
  toId: string;
  state: TechEdgeState;
  visibleByDefault: boolean;
}

export interface TechProgressionView {
  tracks: TechTrack[];
  nodes: TechProgressionNode[];
  nodesById: Map<string, TechProgressionNode>;
  edges: TechProgressionEdge[];
  defaultVisibleIds: Set<string>;
  visibleIds: Set<string>;
  knownVisibleIds: Set<string>;
  queueableIds: Set<string>;
  focusTechId: string | null;
  zoom: TechTreeZoom;
}

export function getDerivedTechTracks(techs: Tech[] = TECH_TREE): TechTrack[] {
  const tracks: TechTrack[] = [];
  for (const tech of techs) {
    if (!tracks.includes(tech.track)) {
      tracks.push(tech.track);
    }
  }
  return tracks;
}

function buildPlannedCompletionSet(state: TechState): Set<string> {
  return new Set([
    ...state.completed,
    ...(state.currentResearch ? [state.currentResearch] : []),
    ...state.researchQueue,
  ]);
}

function hasAllPrerequisites(tech: Tech, ids: Set<string>): boolean {
  return tech.prerequisites.every(prereq => ids.has(prereq));
}

export function getQueueableResearchIds(state: TechState, techs: Tech[] = TECH_TREE): Set<string> {
  const queueable = new Set<string>();
  const planned = buildPlannedCompletionSet(state);

  for (const tech of techs) {
    if (state.completed.includes(tech.id)) continue;
    if (state.currentResearch === tech.id) continue;
    if (state.researchQueue.includes(tech.id)) continue;
    if (hasAllPrerequisites(tech, planned)) {
      queueable.add(tech.id);
    }
  }

  return queueable;
}

export function buildTechProgressionView(
  state: TechState,
  options: { sciencePerTurn?: number; zoom?: TechTreeZoom; initialFocusTechId?: string } = {},
): TechProgressionView {
  const completed = new Set(state.completed);
  const planned = buildPlannedCompletionSet(state);
  const queueableIds = getQueueableResearchIds(state);
  const zoom = options.zoom ?? 'focus';
  const focusTechId = options.initialFocusTechId
    ?? state.currentResearch
    ?? state.researchQueue[0]
    ?? state.completed.at(-1)
    ?? null;
  const nodes: TechProgressionNode[] = [];
  const nodesById = new Map<string, TechProgressionNode>();
  const defaultVisibleIds = new Set<string>();
  const knownVisibleIds = new Set<string>();
  const visibleIds = new Set<string>();
  const sciencePerTurn = Math.max(1, options.sciencePerTurn ?? 1);
  const completedOrPlannedOrAvailable = new Set([
    ...planned,
    ...queueableIds,
  ]);

  for (const tech of TECH_TREE) {
    const satisfiedPrerequisiteIds = tech.prerequisites.filter(prereq => planned.has(prereq));
    const missingPrerequisiteIds = tech.prerequisites.filter(prereq => !planned.has(prereq));
    const everyPrereqPlanned = missingPrerequisiteIds.length === 0;
    const isAvailable = !completed.has(tech.id)
      && state.currentResearch !== tech.id
      && !state.researchQueue.includes(tech.id)
      && tech.prerequisites.every(prereq => completed.has(prereq));
    const isNextLayer = !isAvailable
      && !completed.has(tech.id)
      && state.currentResearch !== tech.id
      && !state.researchQueue.includes(tech.id)
      && everyPrereqPlanned;

    const nodeState: TechNodeState = completed.has(tech.id)
      ? 'completed'
      : state.currentResearch === tech.id
        ? 'current'
        : state.researchQueue.includes(tech.id)
          ? 'queued'
          : isAvailable
            ? 'available'
            : isNextLayer
              ? 'next-layer'
      : 'locked';

    const revealed = nodeState !== 'locked'
      || tech.prerequisites.every(prereq => completedOrPlannedOrAvailable.has(prereq));
    const isFocusTech = focusTechId === tech.id;
    const isFocusNeighbor = isFocusTech
      || tech.prerequisites.includes(focusTechId ?? '')
      || (focusTechId ? TECH_TREE.find(candidate => candidate.id === focusTechId)?.prerequisites.includes(tech.id) : false);
    const visibleInKnown = revealed;
    const visibleInFocus = nodeState !== 'locked' || isFocusNeighbor || revealed;
    const visibleByDefault = visibleInFocus;

    if (visibleByDefault) defaultVisibleIds.add(tech.id);
    if (visibleInKnown) knownVisibleIds.add(tech.id);
    if (zoom === 'all' || (zoom === 'known' && visibleInKnown) || (zoom === 'focus' && visibleInFocus)) {
      visibleIds.add(tech.id);
    }

    const node: TechProgressionNode = {
      tech,
      state: nodeState,
      track: tech.track,
      era: tech.era,
      visibleByDefault,
      prerequisiteIds: tech.prerequisites,
      satisfiedPrerequisiteIds,
      missingPrerequisiteIds,
      turnsToResearch: queueableIds.has(tech.id)
        ? estimateTurnsToComplete({ cost: tech.cost, outputPerTurn: sciencePerTurn })
        : null,
      revealed,
      visibleInFocus,
      visibleInKnown,
    };

    nodes.push(node);
    nodesById.set(tech.id, node);
  }

  const edges: TechProgressionEdge[] = [];
  for (const tech of TECH_TREE) {
    for (const prereq of tech.prerequisites) {
      const prereqNode = nodesById.get(prereq);
      const targetNode = nodesById.get(tech.id);
      if (!prereqNode || !targetNode) continue;

      const stateForEdge: TechEdgeState = completed.has(prereq)
        ? 'satisfied'
        : planned.has(prereq)
          ? 'planned'
          : queueableIds.has(prereq)
            ? 'open'
            : 'blocked';

      edges.push({
        fromId: prereq,
        toId: tech.id,
        state: stateForEdge,
        visibleByDefault: prereqNode.visibleByDefault && targetNode.visibleByDefault,
      });
    }
  }

  return {
    tracks: getDerivedTechTracks(),
    nodes,
    nodesById,
    edges,
    defaultVisibleIds,
    visibleIds,
    knownVisibleIds,
    queueableIds,
    focusTechId,
    zoom,
  };
}
```

- [ ] **Step 4: Route research queue legality through the shared model**

Modify `src/systems/planning-system.ts`:

```typescript
import { getQueueableResearchIds } from '@/systems/tech-progression';
```

Update `enqueueResearch`:

```typescript
export function enqueueResearch(state: TechState, techId: string): TechState {
  if (state.completed.includes(techId) || state.currentResearch === techId || state.researchQueue.includes(techId)) {
    return state;
  }

  if (!getQueueableResearchIds(state).has(techId)) {
    return state;
  }

  if (!state.currentResearch) {
    return {
      ...state,
      currentResearch: techId,
      researchProgress: 0,
    };
  }

  if (state.researchQueue.length >= MAX_RESEARCH_QUEUE_ITEMS) {
    throw new Error('Queue limit reached');
  }

  return {
    ...state,
    researchQueue: [...state.researchQueue, techId],
  };
}
```

Extend `tests/systems/planning-system.test.ts`:

```typescript
it('does not queue research whose prerequisites are outside the planned chain', () => {
  const techState = {
    ...createTechState(),
    currentResearch: 'fire',
    researchQueue: [],
  };

  const result = enqueueResearch(techState, 'banking');

  expect(result.researchQueue).toEqual([]);
  expect(result.currentResearch).toBe('fire');
});
```

- [ ] **Step 5: Run model tests**

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/tech-progression.test.ts tests/systems/planning-system.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/systems/tech-progression.ts src/systems/planning-system.ts tests/systems/tech-progression.test.ts tests/systems/planning-system.test.ts
git commit -m "feat(tech): model dependency progression paths"
```

## Task 2: Render The Progressive Discovery Tree

**Files:**

- Modify: `src/ui/tech-panel.ts`
- Modify: `tests/ui/tech-panel.test.ts`

- [ ] **Step 1: Add failing UI tests for dependency rendering**

Extend `tests/ui/tech-panel.test.ts`:

```typescript
import { TECH_TREE } from '@/systems/tech-system';

it('renders a dependency map with visible edges between visible techs', () => {
  const state = createNewGame(undefined, 'tech-dependency-map-test');
  state.civilizations.player.techState.currentResearch = 'fire';

  const panel = createTechPanel(document.body, state, {
    onQueueResearch: () => {},
    onMoveQueuedResearch: () => {},
    onRemoveQueuedResearch: () => {},
    onClose: () => {},
  });

  expect(panel.querySelector('[data-layout="tech-dependency-map"]')).toBeTruthy();
  expect(panel.querySelector('[data-role="tech-dependency-edges"]')).toBeTruthy();
  expect(panel.querySelector('[data-edge-from="fire"][data-edge-to="writing"]')).toBeTruthy();
});

it('zooms from focus to known tree to the complete catalog', () => {
  const state = createNewGame(undefined, 'tech-zoom-count-test');
  const panel = createTechPanel(document.body, state, {
    onQueueResearch: () => {},
    onMoveQueuedResearch: () => {},
    onRemoveQueuedResearch: () => {},
    onClose: () => {},
  });

  const focusedCount = panel.querySelectorAll('[data-tech-id]').length;
  const known = panel.querySelector<HTMLButtonElement>('[data-zoom="known"]');
  const all = panel.querySelector<HTMLButtonElement>('[data-zoom="all"]');
  expect(known).toBeTruthy();
  expect(all).toBeTruthy();

  known!.click();
  const knownCount = document.body.querySelectorAll('#tech-panel [data-tech-id]').length;
  all!.click();

  expect(document.body.querySelectorAll('#tech-panel [data-tech-id]').length).toBe(TECH_TREE.length);
  expect(knownCount).toBeGreaterThanOrEqual(focusedCount);
  expect(focusedCount).toBeLessThan(TECH_TREE.length);
});

it('focuses current research in the rendered tree', () => {
  const state = createNewGame(undefined, 'tech-render-focus-test');
  state.civilizations.player.techState.completed.push('fire');
  state.civilizations.player.techState.currentResearch = 'writing';

  const panel = createTechPanel(document.body, state, {
    onQueueResearch: () => {},
    onMoveQueuedResearch: () => {},
    onRemoveQueuedResearch: () => {},
    onClose: () => {},
  });

  expect(panel.querySelector('[data-tech-id="writing"]')?.getAttribute('data-focused')).toBe('true');
  expect(panel.querySelector('[data-tech-id="nuclear-theory"]')).toBeFalsy();
});

it('shows prerequisite status in the selected-tech inspector', () => {
  const state = createNewGame(undefined, 'tech-inspector-test');
  state.civilizations.player.techState.currentResearch = 'fire';

  const panel = createTechPanel(document.body, state, {
    onQueueResearch: () => {},
    onMoveQueuedResearch: () => {},
    onRemoveQueuedResearch: () => {},
    onClose: () => {},
  });

  panel.querySelector<HTMLElement>('[data-tech-id="writing"]')?.click();

  const inspector = document.body.querySelector('[data-role="tech-detail"]');
  expect(inspector?.textContent).toContain('Writing');
  expect(inspector?.textContent).toContain('Fire');
  expect(inspector?.textContent).toContain('Researching');
});
```

- [ ] **Step 2: Run UI tests to verify they fail**

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/tech-panel.test.ts
```

Expected: FAIL because the panel still renders `tech-tree-grid` and does not render dependency edges or an inspector.

- [ ] **Step 3: Refactor `createTechPanel` to consume `buildTechProgressionView`**

In `src/ui/tech-panel.ts`, replace local `TRACKS`, `getNextLayerTechIds`, and availability state derivation with:

```typescript
import {
  buildTechProgressionView,
  type TechProgressionNode,
} from '@/systems/tech-progression';
```

Build the view once per render:

```typescript
const progression = buildTechProgressionView(civ.techState, { sciencePerTurn });
```

Keep the existing queue section and current research summary. Replace the track/era list body with a map container:

```typescript
const mapWrap = document.createElement('div');
mapWrap.dataset.layout = 'tech-dependency-map';
mapWrap.style.cssText = 'position:relative;display:grid;gap:10px;overflow:auto;padding-bottom:12px;';
```

Each node should retain stable testable attributes:

```typescript
item.dataset.techId = node.tech.id;
item.dataset.techState = node.state;
item.dataset.track = node.track;
item.dataset.era = String(node.era);
if (progression.focusTechId === node.tech.id) item.dataset.focused = 'true';
```

Render `progression.visibleIds` for the active zoom. Add a compact segmented control with three buttons:

```typescript
button.dataset.zoom = 'focus';
button.dataset.zoom = 'known';
button.dataset.zoom = 'all';
```

The `focus` button rerenders with `zoom: 'focus'`, the `known` button rerenders with `zoom: 'known'`, and the `all` button rerenders with `zoom: 'all'`. The `all` zoom must include every `TECH_TREE` node.

- [ ] **Step 4: Render dependency edges as DOM/SVG data, then style visually**

Inside the map container, add:

```typescript
const edgeLayer = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
edgeLayer.setAttribute('data-role', 'tech-dependency-edges');
```

For jsdom reliability, every visible edge must produce a data-bearing SVG path even before exact pixel coordinates are calculated:

```typescript
path.dataset.edgeFrom = edge.fromId;
path.dataset.edgeTo = edge.toId;
path.dataset.edgeState = edge.state;
```

After the DOM is mounted, compute approximate card centers with `getBoundingClientRect()` and set path `d` values. If jsdom returns zeros, keep the data-bearing path in place; tests should assert the data contract and browser verification should assert visual placement during implementation review.

- [ ] **Step 5: Add selected-tech inspector**

Use panel-local state:

```typescript
let selectedTechId = civ.techState.currentResearch
  ?? civ.techState.researchQueue[0]
  ?? progression.nodes.find(node => node.state === 'available')?.tech.id
  ?? null;
```

When a node is clicked:

- update `selectedTechId`
- rerender the inspector
- apply `data-selected="true"` to the selected card
- do not mutate gameplay state unless the player clicks the inspector action button

Inspector action rules:

- `Research` or `Add to queue` appears only if `progression.queueableIds.has(selectedTechId)`.
- Locked techs show a prerequisite breakdown and a `Next step` label, but no direct queue button for the locked tech.

- [ ] **Step 6: Run UI tests**

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/tech-panel.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/ui/tech-panel.ts tests/ui/tech-panel.test.ts
git commit -m "feat(tech-ui): render dependency map"
```

## Task 3: Make Path Planning Gameplay-Useful Without Autopilot

**Files:**

- Modify: `src/systems/tech-progression.ts`
- Modify: `tests/systems/tech-progression.test.ts`
- Modify: `src/ui/tech-panel.ts`
- Modify: `tests/ui/tech-panel.test.ts`

- [ ] **Step 1: Add tests for selected path highlighting**

Extend `tests/systems/tech-progression.test.ts`:

```typescript
it('returns the dependency path for a selected goal without including unrelated same-track techs', () => {
  const techState = {
    ...createTechState(),
    completed: ['gathering', 'pottery', 'fire', 'writing', 'philosophy'],
  };

  const view = buildTechProgressionView(techState, { selectedTechId: 'medicine' });

  expect(view.selectedPathIds).toEqual(new Set(['pottery', 'philosophy', 'medicine']));
  expect(view.selectedPathIds.has('astronomy')).toBe(false);
});
```

Extend `tests/ui/tech-panel.test.ts`:

```typescript
it('highlights the selected path and exposes only the next legal queue action', () => {
  const state = createNewGame(undefined, 'tech-path-action-test');
  state.civilizations.player.techState.completed.push('gathering', 'pottery', 'fire', 'writing');

  const queued: string[] = [];
  const panel = createTechPanel(document.body, state, {
    onQueueResearch: (techId) => queued.push(techId),
    onMoveQueuedResearch: () => {},
    onRemoveQueuedResearch: () => {},
    onClose: () => {},
  });

  panel.querySelector<HTMLButtonElement>('[data-zoom="all"]')?.click();
  document.body.querySelector<HTMLElement>('[data-tech-id="medicine"]')?.click();

  expect(document.body.querySelector('[data-role="tech-detail"]')?.textContent).toContain('Philosophy');
  expect(document.body.querySelector('[data-role="tech-detail"]')?.textContent).toContain('Pottery');
  expect(document.body.querySelector('[data-action="queue-selected-tech"]')).toBeFalsy();
});
```

- [ ] **Step 2: Implement selected path metadata**

Extend `TechProgressionView`:

```typescript
selectedTechId?: string;
selectedPathIds: Set<string>;
nextStepId: string | null;
```

Add a deterministic direct-prerequisite collector:

```typescript
function collectPrerequisitePath(techId: string, path: Set<string>): void {
  const tech = TECH_TREE.find(candidate => candidate.id === techId);
  if (!tech || path.has(tech.id)) return;
  for (const prereq of tech.prerequisites) {
    path.add(prereq);
  }
  path.add(tech.id);
}
```

Compute `nextStepId` as the first path id, excluding completed/current/queued ids, that appears in `queueableIds`. If none exists, return `null`.

- [ ] **Step 3: Render path labels and next-step copy**

In `src/ui/tech-panel.ts`:

- add `data-path="selected"` to cards whose ids are in `selectedPathIds`
- add `data-edge-path="selected"` to edges whose `fromId` and `toId` are both in the selected path
- show `Next step: <name>` in the inspector when `nextStepId` exists
- show `No direct queue action yet` when a locked selected goal has no legal next step in the current planned chain

The copy must describe state, not instructions. Use concise labels such as `Done`, `Researching`, `Queued`, `Available now`, and `Locked`.

- [ ] **Step 4: Run focused tests**

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/tech-progression.test.ts tests/ui/tech-panel.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/systems/tech-progression.ts src/ui/tech-panel.ts tests/systems/tech-progression.test.ts tests/ui/tech-panel.test.ts
git commit -m "feat(tech-ui): highlight selected research paths"
```

## Task 4: Polish Responsive Layout And Accessibility

**Files:**

- Modify: `src/ui/tech-panel.ts`
- Modify: `tests/ui/tech-panel.test.ts`

- [ ] **Step 1: Add regression tests for compact controls and labels**

Extend `tests/ui/tech-panel.test.ts`:

```typescript
it('uses button labels and aria labels that stay meaningful in compact map controls', () => {
  const state = createNewGame(undefined, 'tech-a11y-test');
  const panel = createTechPanel(document.body, state, {
    onQueueResearch: () => {},
    onMoveQueuedResearch: () => {},
    onRemoveQueuedResearch: () => {},
    onClose: () => {},
  });

  expect(panel.querySelector<HTMLButtonElement>('[data-zoom="focus"]')?.textContent).toContain('Focus');
  expect(panel.querySelector<HTMLButtonElement>('[data-zoom="known"]')?.textContent).toContain('Known tree');
  expect(panel.querySelector<HTMLButtonElement>('[data-zoom="all"]')?.textContent).toContain('All techs');
  expect(panel.querySelector('[data-role="tech-detail"]')).toBeTruthy();
});
```

- [ ] **Step 2: Apply responsive layout constraints**

Use inline styles or local helper constants consistent with the existing panel style:

- `grid-template-columns` should be era-based and use fixed minimum card widths.
- Track headers should remain sticky only if that does not overlap cards on mobile.
- Node cards must use stable dimensions so state labels, ETA text, and selected styles do not resize the grid.
- The inspector should appear below the map on narrow screens and to the side on wide screens.
- Buttons should keep text short and never rely only on color.
- Dependency edges should have real browser geometry, not only test data attributes.
- Queue reorder buttons should be disabled when moving an item would place a tech before one of its prerequisites.

- [ ] **Step 3: Confirm no unsafe DOM rendering**

Search and inspect the tech panel:

```bash
rg -n "innerHTML|insertAdjacentHTML" src/ui/tech-panel.ts
```

Expected: no results. Dynamic tech text must use `textContent` or created text nodes.

- [ ] **Step 4: Run focused tests**

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/tech-panel.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/tech-panel.ts tests/ui/tech-panel.test.ts
git commit -m "fix(tech-ui): polish responsive dependency map"
```

## Task 5: Verification And Issue Closure Evidence

**Files:**

- Modify only if prior tasks reveal gaps.

- [ ] **Step 1: Run required source rule checks**

```bash
scripts/check-src-rule-violations.sh src/systems/tech-progression.ts src/systems/planning-system.ts src/ui/tech-panel.ts
```

Expected: PASS.

- [ ] **Step 2: Run mirrored and relevant tests**

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/tech-progression.test.ts tests/systems/planning-system.test.ts tests/systems/tech-system.test.ts tests/ui/tech-panel.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run build**

```bash
./scripts/run-with-mise.sh yarn build
```

Expected: PASS.

- [ ] **Step 4: Browser-check the live panel**

Run the dev server:

```bash
./scripts/run-with-mise.sh yarn dev
```

Open the local app, start or load a game, open Research, and verify:

- default `Focus` view shows current/available/queued/next-layer nodes, not all 125 techs
- `Known tree` grows beyond focus without revealing distant future techs too early
- visible dependency edges are not blank or wildly misplaced
- selecting a tech updates the inspector immediately
- `All techs` reveals the full catalog
- queue actions rerender the current panel immediately
- no text overlaps on a narrow mobile viewport

- [ ] **Step 5: Review diffs before publishing**

```bash
git diff --stat origin/main...HEAD
git diff --stat
git diff origin/main...HEAD -- src/systems/tech-progression.ts src/systems/planning-system.ts src/ui/tech-panel.ts tests/systems/tech-progression.test.ts tests/systems/planning-system.test.ts tests/ui/tech-panel.test.ts
git diff -- src/systems/tech-progression.ts src/systems/planning-system.ts src/ui/tech-panel.ts tests/systems/tech-progression.test.ts tests/systems/planning-system.test.ts tests/ui/tech-panel.test.ts
```

Expected: source changes match this issue only.

- [ ] **Step 6: Commit final verification notes if documentation changed**

If implementation changes this plan, commit the plan update with the source changes that caused it:

```bash
git add docs/superpowers/plans/2026-05-08-issue-56-tech-tree-ux.md
git commit -m "docs: update issue 56 tech tree plan"
```

## Acceptance Criteria

- Issue #56 can be closed because the tech panel visibly presents dependencies as a map/tree rather than only as grouped lists.
- The default research view focuses on current or newly completed research plus queued, available, and next-layer techs.
- The tree starts small and reveals additional branches as research completes.
- Deep locked techs do not dominate the default panel.
- `All techs` exposes the complete `TECH_TREE` catalog.
- Cross-track prerequisites are visible through edges and selected-tech prerequisite status.
- The panel derives track order from `TECH_TREE`.
- Queue buttons only appear for legal planned-chain research choices.
- Clicking research, queue, remove, reorder, select, reopen, focus, known-tree, and all-tech paths updates the visible panel immediately.
- Tests include positive and negative coverage for `available`, `next-layer`, `queued`, `selected path`, and complete-catalog reachability.
