# Legendary Wonder UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Target worker model:** GPT-5.4, reasoning effort medium.

**Goal:** Fix issue #217 by making legendary wonders discoverable from the normal city Build list, then opening a clearer Crafted Journal-style detail panel for requirements, quest progress, race state, and Start Construction.

**Architecture:** Add one system-adjacent presentation helper that turns existing legendary wonder project state into city-scoped, viewer-safe UI entries. City and wonder panels render that shared view model, while `legendary-wonder-system.ts` remains authoritative for eligibility, starting construction, race resolution, and intel masking.

**Tech Stack:** TypeScript, DOM UI panels, Canvas-adjacent production metadata, Vitest with jsdom UI tests, existing EventBus and legendary wonder systems.

---

## Scope Check

This plan implements **Stage 1 only** from `docs/superpowers/specs/2026-05-20-legendary-wonder-ui-and-spectacle-design.md`.

It does not implement Stage 2 wonder SVGs, map animations, completion ceremony, or Empire Legacy gallery. Those are intentionally separate follow-up work after the build-flow contract is accepted.

---

## Files And Responsibilities

- Create `src/systems/legendary-wonder-presentation.ts`
  - Single source for city-scoped wonder presentation entries, missing requirement labels, near-eligible filtering, state buckets, action labels, and legendary production metadata.
- Create `tests/systems/legendary-wonder-presentation.test.ts`
  - Unit coverage for entry classification, human-readable labels, compact-list filtering, metadata, stale-ready guards, and negative near-eligible boundaries.
- Modify `src/systems/legendary-wonder-system.ts`
  - Re-check current eligibility inside `startLegendaryWonderBuild` so stale UI/direct calls cannot start invalid wonders.
- Modify `src/systems/city-system.ts`
  - Expose display helpers for production item name/icon/cost, including `legendary:<wonderId>`.
- Modify `tests/systems/city-system.test.ts`
  - Assert legendary queue display metadata and production costs.
- Modify `src/ui/city-panel.ts`
  - Render the compact Legendary Wonders subsection in the normal Build list, use shared production display helpers for current build and queue rows, and route wonder cards to the detail panel.
- Modify `tests/ui/city-panel.test.ts`
  - Click-through coverage for the build-list doorway, human-readable legendary queue rows, ETA, no far-future crowding, and queue preservation after Start Construction.
- Modify `src/ui/wonder-panel.ts`
  - Render Crafted Journal sections from shared presentation entries, expose Start Construction with explicit queue-preservation copy, close at the top, and refresh after action.
- Modify `tests/ui/wonder-panel.test.ts`
  - Section grouping, close behavior, Start Construction callback, current-player scoping, full catalog reachability, and earned rival intel masking.
- Modify `src/ui/legendary-wonder-notifications.ts`
  - Tighten notification copy so ready/lost/completed/revealed messages point to city action and remain understandable.
- Modify `tests/ui/legendary-wonder-notifications.test.ts`
  - Assert player-facing notification copy and intel masking.
- Review `src/ui/advisor-system.ts`
  - Confirm current Artisan text points toward city action; if it does not, adjust only the relevant wonder advice strings.
- Review `tests/ui/advisor-system.test.ts`
  - Add text coverage when `advisor-system.ts` changes.

---

## Player Truth Table

| Before | Action | Internal state change | Immediate visible result | Must remain reachable |
|---|---|---|---|---|
| City Build list shows buildings, Legendary Wonders subsection, and units | Click `Oracle of Delphi` wonder card | No production mutation | City panel closes and Wonder panel opens for the same city | Buildings, units, and all selected-city wonder ambitions |
| Wonder panel shows `Ready` Oracle with `Start Construction - current queue continues after this wonder` | Click Start Construction | `startLegendaryWonderBuild` inserts `legendary:oracle-of-delphi` at queue front and keeps old queue behind it | Open panel refreshes: Oracle moves to Building, active production text shows Oracle, queue shows previous work as follow-ups | Reopen city panel still shows previous queue entries |
| City has current queue `library, warrior, worker` | Start Oracle construction | Queue becomes `legendary:oracle-of-delphi, library, warrior, worker` | Current build row shows `Oracle of Delphi`; queue rows show `Library`, `Warrior`, `Worker` with ETA/order text | Reorder/remove controls still work on follow-ups |
| City has early-era far-future wonder with only two formal requirements missing | Open city Build list | No mutation | Far-future wonder is absent from compact subsection | Full Wonder panel still has a complete ambitions surface |
| Rival wonder intel exists only for another hot-seat player | Open current player's Wonder panel | No mutation | Rival section is hidden | Current player's own wonders remain visible |

## Misleading UI Risks

- `Ready` means quest steps are complete **and** current tech/resource/city/global/same-owner eligibility is valid. A stale `ready_to_build` project with missing stone or wrong terrain must not show Start Construction.
- `Near-eligible` means era is current or next era **and** at most two requirements are missing. A late wonder outside the era window must stay out of the compact Build list.
- `Recommended` or `Best fits` cannot be the only action surface. `Show all ambitions` or complete section coverage must prove every selected-city project remains reachable.
- `Start Construction` must not read as a harmless append. Copy must tell the player that the wonder becomes active and the current queue continues after it.
- `Rival Intel` must render from stored viewer-safe intel, never from live rival projects.

## Interaction Replay Checklist

- Open city panel, click wonder card, open wonder panel.
- Start construction, then inspect refreshed visible state.
- Start construction with a non-empty queue and verify preserved follow-ups.
- Reopen city panel and verify active item and ETA/order text.
- Reorder and remove follow-up queue entries after a legendary item becomes active.
- Repeat-click stale Start Construction and verify only one active legendary item exists.
- Switch current hot-seat player and verify city-scoped/rival intel visibility updates.

## Queue And ETA Checklist

- Active item is shown in the current production header.
- Follow-up queue entries are shown in the Production Queue section.
- Legendary active/follow-up labels use wonder names, not raw `legendary:` ids.
- ETA uses the legendary wonder production cost when `legendary:<wonderId>` is active or queued.
- Reorder/remove rows continue to target queue indexes after a legendary item becomes active.
- Invalid unknown legendary queue ids show a safe fallback name and do not crash rendering.

---

### Task 0: Prepare Workspace And Read Rules

**Files:**
- Read: `CLAUDE.md`
- Read: `.claude/rules/game-systems.md`
- Read: `.claude/rules/ui-panels.md`
- Read: `.claude/rules/strategy-game-mechanics.md`
- Read: `.claude/rules/end-to-end-wiring.md`
- Read: `.claude/rules/spec-fidelity.md`
- Read: `docs/superpowers/specs/2026-05-20-legendary-wonder-ui-and-spectacle-design.md`

- [ ] **Step 1: Create a fresh worktree from latest origin/main**

Run:

```bash
git fetch origin main
git worktree add .worktrees/issue-217-legendary-wonder-ui origin/main -b codex/issue-217-legendary-wonder-ui
```

Expected: worktree created on `codex/issue-217-legendary-wonder-ui`.

- [ ] **Step 2: Enter the worktree and trust/install only if needed**

Run:

```bash
cd .worktrees/issue-217-legendary-wonder-ui
mise trust
./scripts/run-with-mise.sh yarn install
```

Expected: `mise trust` succeeds or reports already trusted; `yarn install` succeeds or reports install is already current.

- [ ] **Step 3: Read required rules and spec**

Run:

```bash
sed -n '1,220p' CLAUDE.md
sed -n '1,220p' .claude/rules/game-systems.md
sed -n '1,240p' .claude/rules/ui-panels.md
sed -n '1,220p' .claude/rules/strategy-game-mechanics.md
sed -n '1,220p' .claude/rules/end-to-end-wiring.md
sed -n '1,180p' .claude/rules/spec-fidelity.md
sed -n '1,380p' docs/superpowers/specs/2026-05-20-legendary-wonder-ui-and-spectacle-design.md
```

Expected: rules are read before editing `src/` files.

---

### Task 1: Add Legendary Wonder Presentation Helper

**Files:**
- Create: `src/systems/legendary-wonder-presentation.ts`
- Create: `tests/systems/legendary-wonder-presentation.test.ts`
- Modify: `src/systems/legendary-wonder-system.ts`
- Test: `tests/systems/legendary-wonder-presentation.test.ts`
- Test: `tests/systems/legendary-wonder-system.test.ts`

- [ ] **Step 1: Write failing presentation tests**

Add `tests/systems/legendary-wonder-presentation.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { EventBus } from '@/core/event-bus';
import {
  getCompactLegendaryWonderEntriesForCity,
  getLegendaryWonderPresentationForCity,
  getLegendaryWonderQueueItemMetadata,
} from '@/systems/legendary-wonder-presentation';
import { startLegendaryWonderBuild } from '@/systems/legendary-wonder-system';
import { makeLegendaryWonderFixture } from './helpers/legendary-wonder-fixture';

describe('legendary-wonder-presentation', () => {
  it('classifies ready, questing, building, recovered, near, and blocked entries for one city', () => {
    const state = makeLegendaryWonderFixture({
      completedTechs: ['philosophy', 'pilgrimages', 'city-planning', 'printing'],
      resources: ['stone'],
      oracleStepsCompleted: 2,
    });
    state.legendaryWonderProjects!['oracle-of-delphi'].phase = 'ready_to_build';
    state.legendaryWonderProjects!['grand-canal'].phase = 'lost_race';
    state.legendaryWonderProjects!['grand-canal'].transferableProduction = 24;
    state.legendaryWonderProjects!['sun-spire:player:city-river'] = {
      wonderId: 'sun-spire',
      ownerId: 'player',
      cityId: 'city-river',
      phase: 'building',
      investedProduction: 70,
      transferableProduction: 0,
      questSteps: [
        { id: 'complete-sacred-route', description: 'Establish a sacred trade route.', completed: true },
        { id: 'defeat-nearby-stronghold', description: 'Clear a nearby barbarian stronghold.', completed: true },
      ],
    };
    state.cities['city-river'].productionQueue = ['legendary:sun-spire'];
    state.cities['city-river'].productionProgress = 70;

    const entries = getLegendaryWonderPresentationForCity(state, 'player', 'city-river', 10);
    expect(entries.find(entry => entry.wonderId === 'oracle-of-delphi')).toMatchObject({
      name: 'Oracle of Delphi',
      visibleState: 'ready',
      eligibilityState: 'buildable',
      canStartBuild: true,
      startActionLabel: 'Start Construction',
      queueItemId: 'legendary:oracle-of-delphi',
    });
    expect(entries.find(entry => entry.wonderId === 'grand-canal')).toMatchObject({
      visibleState: 'recovered',
      transferableProduction: 24,
    });
    expect(entries.find(entry => entry.wonderId === 'sun-spire')).toMatchObject({
      visibleState: 'building',
      investedProduction: 70,
    });
  });

  it('keeps far-future blocked wonders out of the compact build-list surface', () => {
    const state = makeLegendaryWonderFixture({ completedTechs: [], resources: [] });
    state.era = 1;
    state.legendaryWonderProjects = undefined;

    const compact = getCompactLegendaryWonderEntriesForCity(state, 'player', 'city-river', 4);

    expect(compact.map(entry => entry.wonderId)).not.toContain('internet');
    expect(compact.map(entry => entry.wonderId)).not.toContain('manhattan-project');
  });

  it('surfaces near-eligible current-era wonders only when the era and missing-condition boundary both hold', () => {
    const state = makeLegendaryWonderFixture({ completedTechs: ['philosophy'], resources: ['stone'] });
    state.era = 3;
    state.legendaryWonderProjects!['oracle-of-delphi'].phase = 'questing';

    const compact = getCompactLegendaryWonderEntriesForCity(state, 'player', 'city-river', 4);
    const oracle = compact.find(entry => entry.wonderId === 'oracle-of-delphi');

    expect(oracle).toMatchObject({
      eligibilityState: 'near-eligible',
      missingRequirements: ['Pilgrimages'],
    });
  });

  it('uses human-readable legendary production metadata', () => {
    expect(getLegendaryWonderQueueItemMetadata('legendary:oracle-of-delphi')).toEqual({
      kind: 'legendary-wonder',
      wonderId: 'oracle-of-delphi',
      name: 'Oracle of Delphi',
      icon: '✦',
      productionCost: 120,
    });
    expect(getLegendaryWonderQueueItemMetadata('legendary:missing-wonder')).toEqual({
      kind: 'legendary-wonder',
      wonderId: 'missing-wonder',
      name: 'Missing Wonder',
      icon: '✦',
      productionCost: 0,
    });
  });

  it('does not treat seeded shells as actionable before eligibility and quest completion are true', () => {
    const state = makeLegendaryWonderFixture({ completedTechs: [], resources: [] });
    state.legendaryWonderProjects = undefined;

    const entries = getLegendaryWonderPresentationForCity(state, 'player', 'city-river', 4);
    const oracle = entries.find(entry => entry.wonderId === 'oracle-of-delphi');

    expect(oracle?.canStartBuild).toBe(false);
    expect(oracle?.visibleState).not.toBe('ready');
  });

  it('refuses a stale ready project when current requirements are no longer satisfied', () => {
    const state = makeLegendaryWonderFixture({ oracleStepsCompleted: 2, completedTechs: ['philosophy'], resources: [] });
    state.legendaryWonderProjects!['oracle-of-delphi'].phase = 'ready_to_build';

    const result = startLegendaryWonderBuild(state, 'player', 'city-river', 'oracle-of-delphi', new EventBus());

    expect(result.legendaryWonderProjects!['oracle-of-delphi'].phase).toBe('ready_to_build');
    expect(result.cities['city-river'].productionQueue).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/legendary-wonder-presentation.test.ts tests/systems/legendary-wonder-system.test.ts
```

Expected: FAIL because `legendary-wonder-presentation.ts` does not exist and `startLegendaryWonderBuild` still trusts stale ready state.

- [ ] **Step 3: Create presentation helper**

Create `src/systems/legendary-wonder-presentation.ts`:

```ts
import type { GameState, LegendaryWonderProject } from '@/core/types';
import { getLegendaryWonderDefinition } from '@/systems/legendary-wonder-definitions';
import {
  getEligibleLegendaryWonders,
  initializeLegendaryWonderProjectsForCity,
} from '@/systems/legendary-wonder-system';
import { getTechById } from '@/systems/tech-system';

export const LEGENDARY_WONDER_PRODUCTION_ICON = '✦';

export type LegendaryWonderVisibleState =
  | 'ready'
  | 'questing'
  | 'building'
  | 'blocked'
  | 'recovered'
  | 'completed'
  | 'lost';

export type LegendaryWonderEligibilityState =
  | 'buildable'
  | 'questing'
  | 'near-eligible'
  | 'blocked'
  | 'in-progress'
  | 'resolved';

export interface LegendaryWonderPresentationEntry {
  wonderId: string;
  queueItemId: `legendary:${string}`;
  projectKey: string;
  name: string;
  cityId: string;
  ownerId: string;
  visibleState: LegendaryWonderVisibleState;
  eligibilityState: LegendaryWonderEligibilityState;
  missingRequirements: string[];
  questCompleted: number;
  questTotal: number;
  nextQuestStep: string | null;
  rewardSummary: string;
  productionCost: number;
  turnsRemaining: number | null;
  investedProduction: number;
  transferableProduction: number;
  canStartBuild: boolean;
  startActionLabel: string | null;
  sortBucket: 'ready' | 'active' | 'questing' | 'near' | 'blocked' | 'resolved';
}

export interface LegendaryWonderQueueItemMetadata {
  kind: 'legendary-wonder';
  wonderId: string;
  name: string;
  icon: string;
  productionCost: number;
}

function titleCaseKebab(value: string): string {
  return value
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase());
}

function ownedResources(state: GameState, cityId: string): Set<string> {
  const city = state.cities[cityId];
  if (!city) return new Set();
  return new Set(
    city.ownedTiles
      .map(coord => state.map.tiles[`${coord.q},${coord.r}`]?.resource)
      .filter((resource): resource is string => resource !== null),
  );
}

export function getLegendaryWonderQueueItemMetadata(itemId: string): LegendaryWonderQueueItemMetadata | null {
  if (!itemId.startsWith('legendary:')) return null;
  const wonderId = itemId.slice('legendary:'.length);
  const definition = getLegendaryWonderDefinition(wonderId);
  return {
    kind: 'legendary-wonder',
    wonderId,
    name: definition?.name ?? titleCaseKebab(wonderId),
    icon: LEGENDARY_WONDER_PRODUCTION_ICON,
    productionCost: definition?.productionCost ?? 0,
  };
}

export function getLegendaryWonderDisplayName(itemId: string): string | null {
  return getLegendaryWonderQueueItemMetadata(itemId)?.name ?? null;
}

export function getLegendaryWonderProductionCost(itemId: string): number | null {
  return getLegendaryWonderQueueItemMetadata(itemId)?.productionCost ?? null;
}

function hasCityRequirement(state: GameState, cityId: string, requirement: 'river' | 'coastal' | 'any'): boolean {
  const city = state.cities[cityId];
  if (!city) return false;
  if (requirement === 'river') {
    return city.ownedTiles.some(coord => state.map.tiles[`${coord.q},${coord.r}`]?.hasRiver);
  }
  if (requirement === 'coastal') {
    return city.ownedTiles.some(coord => {
      const terrain = state.map.tiles[`${coord.q},${coord.r}`]?.terrain;
      return terrain === 'coast' || terrain === 'ocean';
    });
  }
  return true;
}

export function getLegendaryWonderMissingRequirements(
  state: GameState,
  civId: string,
  cityId: string,
  wonderId: string,
): string[] {
  const definition = getLegendaryWonderDefinition(wonderId);
  const civ = state.civilizations[civId];
  if (!definition || !civ || !state.cities[cityId]) return ['Requirements unavailable'];
  const resources = ownedResources(state, cityId);
  const missing = [
    ...definition.requiredTechs
      .filter(techId => !civ.techState.completed.includes(techId))
      .map(techId => getTechById(techId)?.name ?? titleCaseKebab(techId)),
    ...definition.requiredResources
      .filter(resource => !resources.has(resource))
      .map(titleCaseKebab),
  ];
  if (!hasCityRequirement(state, cityId, definition.cityRequirement)) {
    missing.push(definition.cityRequirement === 'river' ? 'River city' : 'Coastal city');
  }
  return missing;
}

function visibleStateFor(project: LegendaryWonderProject): LegendaryWonderVisibleState {
  if (project.phase === 'ready_to_build') return 'ready';
  if (project.phase === 'lost_race') return 'recovered';
  if (project.phase === 'locked') return 'blocked';
  return project.phase;
}

function sortBucketFor(entry: Pick<LegendaryWonderPresentationEntry, 'visibleState' | 'eligibilityState'>): LegendaryWonderPresentationEntry['sortBucket'] {
  if (entry.visibleState === 'ready') return 'ready';
  if (entry.visibleState === 'building') return 'active';
  if (entry.visibleState === 'questing') return 'questing';
  if (entry.eligibilityState === 'near-eligible') return 'near';
  if (entry.visibleState === 'completed' || entry.visibleState === 'lost' || entry.visibleState === 'recovered') return 'resolved';
  return 'blocked';
}

function isNearEligible(state: GameState, wonderId: string, missingCount: number): boolean {
  const definition = getLegendaryWonderDefinition(wonderId);
  if (!definition) return false;
  return definition.era <= state.era + 1 && missingCount <= 2;
}

function turnsRemaining(cost: number, invested: number, productionPerTurn: number): number | null {
  if (productionPerTurn <= 0) return null;
  return Math.max(0, Math.ceil(Math.max(0, cost - invested) / productionPerTurn));
}

export function getLegendaryWonderPresentationForCity(
  state: GameState,
  civId: string,
  cityId: string,
  productionPerTurn: number = 0,
): LegendaryWonderPresentationEntry[] {
  const seededState = initializeLegendaryWonderProjectsForCity(state, civId, cityId);
  const eligible = new Set(getEligibleLegendaryWonders(seededState, civId, cityId));
  return Object.entries(seededState.legendaryWonderProjects ?? {})
    .filter(([, project]) => project.ownerId === civId && project.cityId === cityId)
    .map(([projectKey, project]) => {
      const definition = getLegendaryWonderDefinition(project.wonderId);
      const missingRequirements = getLegendaryWonderMissingRequirements(seededState, civId, cityId, project.wonderId);
      const questCompleted = project.questSteps.filter(step => step.completed).length;
      const questTotal = project.questSteps.length;
      const metadata = getLegendaryWonderQueueItemMetadata(`legendary:${project.wonderId}`);
      const visibleState = visibleStateFor(project);
      const canStartBuild = project.phase === 'ready_to_build' && eligible.has(project.wonderId);
      const eligibleForQuest = eligible.has(project.wonderId);
      const eligibilityState: LegendaryWonderEligibilityState = project.phase === 'building'
        ? 'in-progress'
        : project.phase === 'completed' || project.phase === 'lost_race'
          ? 'resolved'
          : canStartBuild
            ? 'buildable'
            : eligibleForQuest
              ? 'questing'
              : isNearEligible(seededState, project.wonderId, missingRequirements.length)
                ? 'near-eligible'
                : 'blocked';
      const baseEntry = {
        wonderId: project.wonderId,
        queueItemId: `legendary:${project.wonderId}` as const,
        projectKey,
        name: metadata?.name ?? project.wonderId,
        cityId,
        ownerId: civId,
        visibleState,
        eligibilityState,
        missingRequirements,
        questCompleted,
        questTotal,
        nextQuestStep: project.questSteps.find(step => !step.completed)?.description ?? null,
        rewardSummary: definition?.reward.summary ?? 'Reward unavailable.',
        productionCost: definition?.productionCost ?? 0,
        turnsRemaining: turnsRemaining(definition?.productionCost ?? 0, project.investedProduction, productionPerTurn),
        investedProduction: project.investedProduction,
        transferableProduction: project.transferableProduction,
        canStartBuild,
        startActionLabel: canStartBuild ? 'Start Construction' : null,
      };
      return {
        ...baseEntry,
        sortBucket: sortBucketFor(baseEntry),
      };
    })
    .sort((left, right) => {
      const bucketRank = { ready: 0, active: 1, questing: 2, near: 3, blocked: 4, resolved: 5 };
      return bucketRank[left.sortBucket] - bucketRank[right.sortBucket]
        || left.name.localeCompare(right.name);
    });
}

export function getCompactLegendaryWonderEntriesForCity(
  state: GameState,
  civId: string,
  cityId: string,
  productionPerTurn: number = 0,
): LegendaryWonderPresentationEntry[] {
  return getLegendaryWonderPresentationForCity(state, civId, cityId, productionPerTurn)
    .filter(entry =>
      entry.visibleState === 'ready'
      || entry.visibleState === 'questing'
      || entry.visibleState === 'building'
      || entry.visibleState === 'recovered'
      || entry.eligibilityState === 'near-eligible',
    );
}
```

- [ ] **Step 4: Harden `startLegendaryWonderBuild` eligibility**

Modify `src/systems/legendary-wonder-system.ts` so `startLegendaryWonderBuild` imports no presentation helper and reuses local truth:

```ts
  const eligibleWonderIds = new Set(getEligibleLegendaryWonders(seededState, civId, cityId));
  if (
    !projectKey
    || !project
    || project.phase !== 'ready_to_build'
    || !eligibleWonderIds.has(wonderId)
    || !isLegendaryWonderStillAvailable(seededState, wonderId)
    || hasActiveLegendaryWonderBuildForCiv(seededState, civId, wonderId, cityId)
  ) {
    return seededState;
  }
```

Keep this inside `startLegendaryWonderBuild` after `seededState`, `projectKey`, and `project` are defined.

- [ ] **Step 5: Run presentation tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/legendary-wonder-presentation.test.ts tests/systems/legendary-wonder-system.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit Task 1**

Run:

```bash
git add src/systems/legendary-wonder-presentation.ts src/systems/legendary-wonder-system.ts tests/systems/legendary-wonder-presentation.test.ts tests/systems/legendary-wonder-system.test.ts
git commit -m "feat(wonders): add city wonder presentation helper"
```

Expected: commit succeeds.

---

### Task 2: Wire Legendary Production Display Metadata

**Files:**
- Modify: `src/systems/city-system.ts`
- Modify: `tests/systems/city-system.test.ts`
- Test: `tests/systems/city-system.test.ts`

- [ ] **Step 1: Write failing city-system metadata tests**

Add to `tests/systems/city-system.test.ts`:

```ts
import {
  getCatalogProductionCost,
  getProductionDisplayName,
  getProductionIconForItem,
  getProductionCostForItem,
} from '@/systems/city-system';

describe('legendary wonder production display metadata', () => {
  it('returns human-readable names, costs, and icon for legendary queue ids', () => {
    expect(getProductionDisplayName('legendary:oracle-of-delphi')).toBe('Oracle of Delphi');
    expect(getProductionIconForItem('legendary:oracle-of-delphi')).toBe('✦');
    expect(getCatalogProductionCost('legendary:oracle-of-delphi')).toBe(120);
    expect(getProductionCostForItem('legendary:oracle-of-delphi')).toBe(120);
  });

  it('returns safe fallback metadata for unknown legendary queue ids', () => {
    expect(getProductionDisplayName('legendary:lost-masterpiece')).toBe('Lost Masterpiece');
    expect(getProductionIconForItem('legendary:lost-masterpiece')).toBe('✦');
    expect(getCatalogProductionCost('legendary:lost-masterpiece')).toBe(0);
  });
});
```

If the file already imports some of these functions, extend the existing import rather than duplicating it.

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/city-system.test.ts
```

Expected: FAIL because the display helper functions do not exist and legendary costs are still `0`.

- [ ] **Step 3: Add production display helpers**

Modify `src/systems/city-system.ts`:

```ts
import {
  getLegendaryWonderDisplayName,
  getLegendaryWonderProductionCost,
  getLegendaryWonderQueueItemMetadata,
  LEGENDARY_WONDER_PRODUCTION_ICON,
} from './legendary-wonder-presentation';
```

Then update/add helpers:

```ts
export function getCatalogProductionCost(itemId: string, era: number = 1): number {
  const legendaryCost = getLegendaryWonderProductionCost(itemId);
  if (legendaryCost !== null) return legendaryCost;

  const building = BUILDINGS[itemId];
  if (building) return building.productionCost;

  const unit = TRAINABLE_UNITS.find(candidate => candidate.type === itemId);
  if (!unit) return 0;
  if (unit.type === 'settler') return getSettlerProductionCost(era);
  return unit.cost;
}

export function getProductionDisplayName(itemId: string): string {
  const legendaryName = getLegendaryWonderDisplayName(itemId);
  if (legendaryName) return legendaryName;
  return BUILDINGS[itemId]?.name
    ?? TRAINABLE_UNITS.find(unit => unit.type === itemId)?.name
    ?? itemId;
}

export function getProductionIconForItem(itemId: string): string {
  if (getLegendaryWonderQueueItemMetadata(itemId)) {
    return LEGENDARY_WONDER_PRODUCTION_ICON;
  }
  return PRODUCTION_ICONS[itemId] ?? PRODUCTION_ICON_FALLBACK;
}
```

- [ ] **Step 4: Run city-system tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/city-system.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 2**

Run:

```bash
git add src/systems/city-system.ts tests/systems/city-system.test.ts
git commit -m "feat(wonders): display legendary production names"
```

Expected: commit succeeds.

---

### Task 3: Add City Build List Wonder Doorway

**Files:**
- Modify: `src/ui/city-panel.ts`
- Modify: `tests/ui/city-panel.test.ts`
- Test: `tests/ui/city-panel.test.ts`

- [ ] **Step 1: Write failing city-panel doorway tests**

Add tests to the existing `describe('city-panel legendary wonders', ...)` block in `tests/ui/city-panel.test.ts`:

```ts
  it('shows relevant legendary wonders in the normal Build list with readable state and reward text', () => {
    const { container, city, state } = makeWonderPanelFixture();
    state.era = 3;
    state.legendaryWonderProjects!['oracle-of-delphi'].phase = 'ready_to_build';
    state.legendaryWonderProjects!['oracle-of-delphi'].questSteps = state.legendaryWonderProjects!['oracle-of-delphi'].questSteps
      .map(step => ({ ...step, completed: true }));

    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
    });

    const wonderSection = panel.querySelector<HTMLElement>('[data-section="city-build-legendary-wonders"]');
    expect(wonderSection).toBeTruthy();
    expect(wonderSection!.textContent).toContain('Legendary Wonders');
    expect(wonderSection!.textContent).toContain('Oracle of Delphi');
    expect(wonderSection!.textContent).toContain('Ready');
    expect(wonderSection!.textContent).toContain('Quest 2/2');
    expect(wonderSection!.textContent).toContain('+60 research');
  });

  it('opens the wonder panel callback instead of starting production when a build-list wonder card is clicked', () => {
    const { container, city, state } = makeWonderPanelFixture();
    state.legendaryWonderProjects!['oracle-of-delphi'].phase = 'ready_to_build';
    const onBuild = vi.fn();
    const onOpenWonderPanel = vi.fn();

    const panel = createCityPanel(container, city, state, {
      onBuild,
      onOpenWonderPanel,
      onClose: () => {},
    });

    clickElement(panel.querySelector('[data-wonder-card="oracle-of-delphi"]'));

    expect(onOpenWonderPanel).toHaveBeenCalledWith('city-river');
    expect(onBuild).not.toHaveBeenCalled();
  });

  it('does not crowd the compact Build list with far-future blocked wonders', () => {
    const { container, city, state } = makeWonderPanelFixture();
    state.era = 1;
    state.civilizations.player.techState.completed = [];
    state.legendaryWonderProjects = undefined;

    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
    });

    const wonderSection = panel.querySelector<HTMLElement>('[data-section="city-build-legendary-wonders"]');
    expect(wonderSection?.textContent ?? '').not.toContain('Internet');
    expect(wonderSection?.textContent ?? '').not.toContain('Manhattan Project');
  });

  it('renders legendary current production and follow-up queue rows with names and ETA text', () => {
    const { container, city, state } = makeWonderPanelFixture();
    city.productionQueue = ['legendary:oracle-of-delphi', 'library'];
    city.productionProgress = 20;
    state.cities[city.id] = city;

    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onMoveQueueItem: () => {},
      onRemoveQueueItem: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
    });

    const rendered = collectText(panel);
    expect(rendered).toContain('Building: ✦ Oracle of Delphi');
    expect(rendered).toContain('Library');
    expect(rendered).toContain('Starts in');
    expect(rendered).not.toContain('legendary:oracle-of-delphi');
  });
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/city-panel.test.ts
```

Expected: FAIL because the new subsection and legendary display helpers are not wired into the panel.

- [ ] **Step 3: Render the compact Legendary Wonders subsection**

Modify the top import in `src/ui/city-panel.ts`:

```ts
import {
  getAvailableBuildings,
  BUILDINGS,
  TRAINABLE_UNITS,
  getTrainableUnitsForCiv,
  getProductionCostForItem,
  getProductionDisplayName,
  getProductionIconForItem,
} from '@/systems/city-system';
import { getCompactLegendaryWonderEntriesForCity } from '@/systems/legendary-wonder-presentation';
```

After `availableBuildings`, compute entries:

```ts
  const compactWonderEntries = getCompactLegendaryWonderEntriesForCity(
    state,
    state.currentPlayer,
    city.id,
    yields.production,
  );
```

Build wonder HTML before units using static markup and `data-text` placeholders for dynamic text:

```ts
  const formatWonderStateLabel = (value: string): string =>
    value.replace(/[-_]/g, ' ').replace(/\b\w/g, char => char.toUpperCase());

  const wonderItemPlaceholders = compactWonderEntries.map((entry, idx) => {
    return `<div class="wonder-build-card" data-wonder-card="${entry.wonderId}" style="background:rgba(232,193,112,0.12);border:1px solid rgba(232,193,112,0.36);border-radius:8px;padding:10px;margin-bottom:6px;cursor:pointer;">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
        <div style="font-weight:bold;font-size:13px;" data-text="wonder-name-${idx}"></div>
        <div style="font-size:11px;color:#e8c170;" data-text="wonder-state-${idx}"></div>
      </div>
      <div style="font-size:11px;opacity:0.76;" data-text="wonder-progress-${idx}"></div>
      <div style="font-size:10px;opacity:0.68;" data-text="wonder-reward-${idx}"></div>
      <div style="font-size:10px;opacity:0.62;" data-text="wonder-missing-${idx}"></div>
      <div style="font-size:10px;opacity:0.62;" data-text="wonder-next-${idx}"></div>
    </div>`;
  }).join('');
```

Insert the subsection in the Build list before Units:

```ts
        ${wonderItemPlaceholders ? `<div data-section="city-build-legendary-wonders" style="margin-top:12px;margin-bottom:12px;"><h3 style="font-size:14px;margin:0 0 8px;color:#e8c170;">Legendary Wonders</h3>${wonderItemPlaceholders}</div>` : ''}
        <div style="margin-top:12px;font-size:12px;opacity:0.5;margin-bottom:8px;">Units</div>
```

Register click handlers after the existing `.build-item` handlers:

```ts
  panel.querySelectorAll<HTMLElement>('[data-wonder-card]').forEach(el => {
    el.addEventListener('click', () => {
      callbacks.onOpenWonderPanel(city.id);
      panel.remove();
    });
  });
```

After the existing `setText` calls for buildings and units, fill the wonder card placeholders with `textContent`:

```ts
  compactWonderEntries.forEach((entry, idx) => {
    const eta = entry.turnsRemaining !== null ? ` · ${entry.turnsRemaining} turns` : '';
    setText(`wonder-name-${idx}`, `✦ ${entry.name}`);
    setText(`wonder-state-${idx}`, formatWonderStateLabel(entry.visibleState));
    setText(`wonder-progress-${idx}`, `Quest ${entry.questCompleted}/${entry.questTotal} · Cost ${entry.productionCost}${eta}`);
    setText(`wonder-reward-${idx}`, entry.rewardSummary);
    setText(`wonder-missing-${idx}`, entry.missingRequirements.length > 0 ? `Missing: ${entry.missingRequirements.join(', ')}` : '');
    setText(`wonder-next-${idx}`, entry.nextQuestStep ? `Next: ${entry.nextQuestStep}` : '');
  });
```

- [ ] **Step 4: Use production display helpers everywhere in `city-panel.ts`**

Replace production icon/name expressions:

```ts
${getProductionIconForItem(b.id)}
${getProductionIconForItem(u.type)}
${getProductionIconForItem(currentItem)}
${getProductionIconForItem(city.productionQueue[idx])}
```

Replace current and queue name setters:

```ts
setText('prod-name', getProductionDisplayName(currentItem));
```

```ts
city.productionQueue.forEach((itemId, index) => {
  setText(`queue-name-${index}`, getProductionDisplayName(itemId));
});
```

- [ ] **Step 5: Run city-panel tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/city-panel.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit Task 3**

Run:

```bash
git add src/ui/city-panel.ts tests/ui/city-panel.test.ts
git commit -m "feat(wonders): surface wonders in city build list"
```

Expected: commit succeeds.

---

### Task 4: Redesign Wonder Panel And Start Construction Refresh

**Files:**
- Modify: `src/ui/wonder-panel.ts`
- Modify: `src/main.ts`
- Modify: `tests/ui/wonder-panel.test.ts`
- Test: `tests/ui/wonder-panel.test.ts`
- Test: `tests/ui/city-panel.test.ts`

- [ ] **Step 1: Write failing wonder-panel tests**

Add to `tests/ui/wonder-panel.test.ts`:

```ts
  it('renders a Crafted Journal city title, top close control, sections, and Show all ambitions', () => {
    const { container, state } = makeWonderPanelFixture();
    state.cities['city-river'].name = 'Athens';
    state.legendaryWonderProjects!['oracle-of-delphi'].phase = 'ready_to_build';

    const panel = createWonderPanel(container, state, 'city-river', {
      onStartBuild: () => {},
      onClose: () => {},
    });

    expect(panel.querySelector('[data-action="close-wonder-panel"]')).toBeTruthy();
    expect(panel.textContent).toContain('Athens Wonders');
    expect(panel.textContent).toContain('Show all ambitions');
    expect(panel.querySelector('[data-section="ready-wonders"]')).toBeTruthy();
    expect(panel.querySelector('[data-section="blocked-wonders"]')).toBeTruthy();
  });

  it('shows explicit Start Construction copy and calls the start callback only for buildable ready wonders', () => {
    const { container, state } = makeWonderPanelFixture();
    state.legendaryWonderProjects!['oracle-of-delphi'].phase = 'ready_to_build';
    state.legendaryWonderProjects!['oracle-of-delphi'].questSteps = state.legendaryWonderProjects!['oracle-of-delphi'].questSteps
      .map(step => ({ ...step, completed: true }));
    const started: Array<[string, string]> = [];

    const panel = createWonderPanel(container, state, 'city-river', {
      onStartBuild: (cityId, wonderId) => started.push([cityId, wonderId]),
      onClose: () => {},
    });

    expect(panel.textContent).toContain('Start Construction - current queue continues after this wonder.');
    clickElement(panel.querySelector('[data-action="start-legendary-wonder"][data-wonder-id="oracle-of-delphi"]'));

    expect(started).toEqual([['city-river', 'oracle-of-delphi']]);
  });

  it('keeps every selected-city wonder reachable in the full ambitions section', () => {
    const { container, state } = makeWonderPanelFixture();
    const seededState = initializeLegendaryWonderProjectsForCity(state, 'player', 'city-river');

    const panel = createWonderPanel(container, seededState, 'city-river', {
      onStartBuild: () => {},
      onClose: () => {},
    });

    const selectedCityProjects = Object.values(seededState.legendaryWonderProjects ?? {}).filter(project =>
      project.ownerId === seededState.currentPlayer && project.cityId === 'city-river',
    );
    expect(panel.querySelectorAll('[data-project-card]')).toHaveLength(selectedCityProjects.length);
  });
```

Ensure `clickElement` exists in this file. If it does not, add:

```ts
function clickElement(element: Element | null | undefined): void {
  expect(element).toBeTruthy();
  element!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/wonder-panel.test.ts
```

Expected: FAIL because the panel still renders the old structure and button copy.

- [ ] **Step 3: Render panel from presentation entries**

Modify `src/ui/wonder-panel.ts` imports:

```ts
import {
  getLegendaryWonderPresentationForCity,
  type LegendaryWonderPresentationEntry,
} from '@/systems/legendary-wonder-presentation';
```

Replace local missing-condition and priority logic with presentation entries:

```ts
function formatWonderStateLabel(value: string): string {
  return value.replace(/[-_]/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
}

function appendProjectCard(
  entry: LegendaryWonderPresentationEntry,
  section: HTMLElement,
  callbacks: WonderPanelCallbacks,
): void {
  const article = document.createElement('article');
  article.dataset.projectCard = entry.wonderId;
  article.style.cssText = 'border:1px solid rgba(232,193,112,0.28);border-radius:8px;padding:12px;margin-bottom:10px;background:rgba(255,255,255,0.06);';

  const header = document.createElement('h3');
  header.textContent = `✦ ${entry.name}`;
  article.appendChild(header);

  const stateLine = document.createElement('p');
  stateLine.textContent = `${formatWonderStateLabel(entry.visibleState)} · Quest ${entry.questCompleted}/${entry.questTotal}`;
  article.appendChild(stateLine);

  if (entry.missingRequirements.length > 0) {
    const missing = document.createElement('p');
    missing.textContent = `Missing: ${entry.missingRequirements.join(', ')}.`;
    article.appendChild(missing);
  }

  if (entry.nextQuestStep) {
    const next = document.createElement('p');
    next.textContent = `Next: ${entry.nextQuestStep}`;
    article.appendChild(next);
  }

  const reward = document.createElement('p');
  reward.textContent = `Reward: ${entry.rewardSummary}`;
  article.appendChild(reward);

  const progress = document.createElement('p');
  progress.textContent = entry.visibleState === 'building'
    ? `Construction: ${entry.investedProduction}/${entry.productionCost} production${entry.turnsRemaining !== null ? ` · ${entry.turnsRemaining} turns` : ''}.`
    : entry.visibleState === 'recovered'
      ? `Recovered effort: ${entry.transferableProduction} carryover remains in this city.`
      : `Cost: ${entry.productionCost} production.`;
  article.appendChild(progress);

  if (entry.canStartBuild) {
    const help = document.createElement('p');
    help.textContent = 'Start Construction - current queue continues after this wonder.';
    article.appendChild(help);

    const startBuild = createGameButton('Start Construction', 'primary');
    startBuild.dataset.action = 'start-legendary-wonder';
    startBuild.dataset.wonderId = entry.wonderId;
    startBuild.addEventListener('click', () => callbacks.onStartBuild(entry.cityId, entry.wonderId));
    article.appendChild(startBuild);
  }

  section.appendChild(article);
}
```

Build sections with a helper:

```ts
function appendEntrySection(
  panel: HTMLElement,
  heading: string,
  dataSection: string,
  entries: LegendaryWonderPresentationEntry[],
  callbacks: WonderPanelCallbacks,
): void {
  const section = document.createElement('section');
  section.dataset.section = dataSection;
  const header = document.createElement('h3');
  header.textContent = heading;
  section.appendChild(header);
  if (entries.length === 0) {
    const empty = document.createElement('p');
    empty.textContent = 'None right now.';
    section.appendChild(empty);
  } else {
    for (const entry of entries) appendProjectCard(entry, section, callbacks);
  }
  panel.appendChild(section);
}
```

Inside `createWonderPanel`, replace the old body with:

```ts
  const city = state.cities[cityId];
  const entries = getLegendaryWonderPresentationForCity(state, state.currentPlayer, cityId);
  const titleRow = document.createElement('div');
  titleRow.style.cssText = 'display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:12px;';

  const titleWrap = document.createElement('div');
  const eyebrow = document.createElement('div');
  eyebrow.textContent = 'Legendary Ambitions';
  eyebrow.style.cssText = 'font-size:12px;text-transform:uppercase;letter-spacing:0.08em;color:#d9a25c;';
  const title = document.createElement('h2');
  title.textContent = `${city?.name ?? 'City'} Wonders`;
  title.style.cssText = 'margin:4px 0 4px;color:#e8c170;';
  const intro = document.createElement('p');
  intro.textContent = 'Track quests, requirements, rival races, and the construction that will define this city.';
  intro.style.cssText = 'margin:0;color:rgba(244,241,232,0.72);font-size:13px;';
  titleWrap.append(eyebrow, title, intro);

  const close = createGameButton('Close', 'ghost');
  close.dataset.action = 'close-wonder-panel';
  close.addEventListener('click', () => callbacks.onClose());
  titleRow.append(titleWrap, close);
  panel.appendChild(titleRow);

  const allLabel = document.createElement('p');
  allLabel.textContent = 'Show all ambitions';
  allLabel.style.cssText = 'font-size:12px;color:#e8c170;';
  panel.appendChild(allLabel);

  appendEntrySection(panel, 'Ready', 'ready-wonders', entries.filter(entry => entry.visibleState === 'ready'), callbacks);
  appendEntrySection(panel, 'Questing', 'questing-wonders', entries.filter(entry => entry.visibleState === 'questing'), callbacks);
  appendEntrySection(panel, 'Building', 'building-wonders', entries.filter(entry => entry.visibleState === 'building'), callbacks);
  appendEntrySection(panel, 'Blocked', 'blocked-wonders', entries.filter(entry => entry.visibleState === 'blocked'), callbacks);
  appendEntrySection(panel, 'Recovered', 'recovered-wonders', entries.filter(entry => entry.visibleState === 'recovered'), callbacks);
```

Keep rival intel rendering through `getLegendaryWonderIntelForViewer(state, state.currentPlayer)`, but rename the section to `Rival Intel` and preserve the existing no-leak behavior.

Update existing `tests/ui/wonder-panel.test.ts` assertions that refer to the old `Best fits right now`, `All ambitions in this city`, or `In progress elsewhere` headings so they assert the new section names and `Show all ambitions` complete-catalog affordance instead.

- [ ] **Step 4: Refresh the open wonder panel after Start Construction in `src/main.ts`**

Extend the city-system import near the top of `src/main.ts`:

```ts
import { foundCity, getProductionDisplayName } from '@/systems/city-system';
```

Inside `openCityPanelForCity`, replace the current inline `onOpenWonderPanel` callback body with a local helper and callback:

```ts
  const openWonderPanelForCity = (selectedCityId: string): void => {
    gameState = initializeLegendaryWonderProjectsForCity(gameState, gameState.currentPlayer, selectedCityId);
    document.getElementById('wonder-panel')?.remove();
    createWonderPanel(uiLayer, gameState, selectedCityId, {
      onStartBuild: (buildCityId, wonderId) => {
        gameState = startLegendaryWonderBuild(gameState, gameState.currentPlayer, buildCityId, wonderId, bus);
        const targetCity = gameState.cities[buildCityId];
        renderLoop.setGameState(gameState);
        updateHUD();
        if (targetCity?.productionQueue[0] === `legendary:${wonderId}`) {
          showNotification(`${targetCity.name}: started ${getProductionDisplayName(`legendary:${wonderId}`)}`, 'info');
        }
        openWonderPanelForCity(buildCityId);
      },
      onClose: () => {
        document.getElementById('wonder-panel')?.remove();
      },
    });
  };
```

Then wire the city-panel callback to the helper:

```ts
    onOpenWonderPanel: openWonderPanelForCity,
```

The final code must keep this helper inside `openCityPanelForCity`, because it closes over the live `gameState`, `renderLoop`, `updateHUD`, and `showNotification`.

- [ ] **Step 5: Run panel tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/wonder-panel.test.ts tests/ui/city-panel.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit Task 4**

Run:

```bash
git add src/ui/wonder-panel.ts src/main.ts tests/ui/wonder-panel.test.ts tests/ui/city-panel.test.ts
git commit -m "feat(wonders): refresh journal wonder panel"
```

Expected: commit succeeds.

---

### Task 5: Tighten Notifications And Advisor Copy

**Files:**
- Modify: `src/ui/legendary-wonder-notifications.ts`
- Modify: `tests/ui/legendary-wonder-notifications.test.ts`
- Review or modify: `src/ui/advisor-system.ts`
- Review or modify: `tests/ui/advisor-system.test.ts`
- Test: `tests/ui/legendary-wonder-notifications.test.ts`

- [ ] **Step 1: Add notification copy tests**

In `tests/ui/legendary-wonder-notifications.test.ts`, add:

```ts
  it('tells the owning player which city can start a ready wonder', () => {
    const state = makeLegendaryWonderFixture();
    state.cities['city-river'].name = 'Athens';

    const notification = getLegendaryWonderNotification(state, 'player', {
      type: 'wonder:legendary-ready',
      civId: 'player',
      cityId: 'city-river',
      wonderId: 'oracle-of-delphi',
    });

    expect(notification?.message).toBe('Athens can start Oracle of Delphi from its Wonders panel.');
    expect(notification?.type).toBe('info');
  });

  it('keeps rival start intel scoped to observers with spy reports', () => {
    const state = makeLegendaryWonderFixture();

    const notification = getLegendaryWonderNotification(state, 'player', {
      type: 'wonder:legendary-race-revealed',
      observerId: 'observer',
      civId: 'rival',
      cityId: 'city-rival',
      wonderId: 'grand-canal',
    });

    expect(notification).toBeNull();
  });
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/legendary-wonder-notifications.test.ts
```

Expected: FAIL because copy still uses the older message.

- [ ] **Step 3: Update notification copy**

In `src/ui/legendary-wonder-notifications.ts`, update only message text:

```ts
  if (event.type === 'wonder:legendary-ready') {
    return {
      message: `${city.name} can start ${wonder?.name ?? event.wonderId} from its Wonders panel.`,
      type: 'info',
      turn: state.turn,
    };
  }
```

Keep existing completion, lost, and race-revealed gates intact. If lost copy still says `abandoned`, change it to:

```ts
    message: `${city.name} lost the race for ${wonder?.name ?? event.wonderId}. +${event.goldRefund} gold and ${event.transferableProduction} carryover recovered.`,
```

- [ ] **Step 4: Review Artisan copy**

Run:

```bash
rg -n "artisan_wonder|wonder" src/ui/advisor-system.ts tests/ui/advisor-system.test.ts
```

If `artisan_wonder_available` already points to choosing the city/action clearly, leave it unchanged. If it does not, update only the affected message to:

```ts
message: 'A legendary wonder is ready. Open the city Wonders panel and choose whether to make it our active construction.',
```

If `src/ui/advisor-system.ts` changes, add a focused assertion in `tests/ui/advisor-system.test.ts` that the visible advice includes `city Wonders panel`.

- [ ] **Step 5: Run notification/advisor tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/legendary-wonder-notifications.test.ts tests/ui/advisor-system.test.ts
```

Expected: PASS. If `advisor-system.ts` was not changed and the advisor test file is unrelated, it is still fine to run it as a small guard.

- [ ] **Step 6: Commit Task 5**

Run:

```bash
git add src/ui/legendary-wonder-notifications.ts tests/ui/legendary-wonder-notifications.test.ts src/ui/advisor-system.ts tests/ui/advisor-system.test.ts
git commit -m "fix(wonders): clarify wonder notifications"
```

Expected: commit succeeds. If advisor files were unchanged, Git ignores them.

---

### Task 6: Rule Checks, Wonder Regression Pack, Build, And Final Review

**Files:**
- Verify all changed `src/` files
- Verify all changed tests
- Verify spec and plan remain aligned

- [ ] **Step 1: Run source rule checks**

Run:

```bash
scripts/check-src-rule-violations.sh src/systems/legendary-wonder-presentation.ts src/systems/legendary-wonder-system.ts src/systems/city-system.ts src/ui/city-panel.ts src/ui/wonder-panel.ts src/ui/legendary-wonder-notifications.ts src/main.ts
```

Expected: PASS with no rule violations. If `src/ui/advisor-system.ts` changed, include it in the same command.

- [ ] **Step 2: Run targeted tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/legendary-wonder-presentation.test.ts tests/systems/legendary-wonder-system.test.ts tests/systems/city-system.test.ts tests/ui/city-panel.test.ts tests/ui/wonder-panel.test.ts tests/ui/legendary-wonder-notifications.test.ts tests/ui/advisor-system.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run wonder regression pack**

Run:

```bash
./scripts/run-wonder-regressions.sh
```

Expected: PASS.

- [ ] **Step 4: Run build**

Run:

```bash
./scripts/run-with-mise.sh yarn build
```

Expected: PASS with TypeScript and Vite build success.

- [ ] **Step 5: Inspect branch and local diffs**

Run:

```bash
git diff --stat origin/main...HEAD
git diff --stat
git diff
```

Expected: committed branch delta contains only the planned wonder UI/system/test/docs changes; local uncommitted diff is empty or intentionally documented.

- [ ] **Step 6: Final commit for verification updates if any**

If Task 6 required code/test fixes, commit them:

```bash
git add src tests docs
git commit -m "test(wonders): cover legendary wonder ui flow"
```

Expected: commit succeeds only if files changed.

---

## Final Acceptance Checklist

- [ ] City Build list shows relevant legendary wonder cards between buildings and units.
- [ ] Compact card click opens the Wonder panel and does not mutate production.
- [ ] Wonder panel has top close control, city title, Crafted Journal treatment, section buckets, and complete ambitions reachability.
- [ ] Start Construction is available only when current system eligibility is valid.
- [ ] Start Construction makes the wonder active and preserves prior queue entries behind it.
- [ ] Current production and queue rows show legendary wonder names, icon, cost, ETA, and no raw `legendary:` ids.
- [ ] Far-future blocked wonders do not crowd the compact Build list.
- [ ] Stale ready projects cannot start if tech/resource/city requirements are no longer satisfied.
- [ ] Rival intel remains viewer-safe in hot-seat and espionage cases.
- [ ] Targeted tests, wonder regressions, rule checks, and build pass.
