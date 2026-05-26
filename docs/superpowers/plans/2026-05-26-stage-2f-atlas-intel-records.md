# Stage 2F Atlas Intel Records Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Do not use subagents. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add safe viewer-scoped rival legendary wonder intel records to the Wonder Atlas/Codex without leaking hidden rival state.

**Architecture:** Keep `legendaryWonderIntel` as the only rival Atlas knowledge source and move it to a discriminated union with stable event IDs. Canonical legendary-wonder systems create and preserve intel records; presentation helpers fold explicit viewer records into safe Atlas/Codex labels, badges, status lines, and event rows. UI renders the view model only and never reads rival projects, rival cities, rewards, or another viewer's intel.

**Tech Stack:** TypeScript, Vite, Vitest, jsdom UI tests, existing Canvas/DOM split, existing `./scripts/run-with-mise.sh yarn ...` command wrapper.

---

## Source Spec

Implement exactly from:

- `docs/superpowers/specs/2026-05-26-stage-2f-atlas-intel-records-design.md`

Rules to re-read before editing:

- `CLAUDE.md`
- `.claude/rules/game-systems.md`
- `.claude/rules/ui-panels.md`
- `.claude/rules/strategy-game-mechanics.md`
- `.claude/rules/end-to-end-wiring.md`
- `.claude/rules/spec-fidelity.md`
- `.claude/rules/incremental-mr-completion.md`
- `docs/superpowers/plans/README.md`

## File Structure

- Modify `src/core/types.ts`
  - Define discriminated legendary intel entry types.
  - Keep legacy `intelLevel: 'started'` save compatibility.
- Modify `src/systems/legendary-wonder-intel.ts`
  - Normalize legacy and new records.
  - Deduplicate by stable event identity.
  - Preserve valid historical started records after live projects disappear.
  - Record completed rival intel for known human viewers.
- Modify `src/systems/legendary-wonder-system.ts`
  - Stop passing live project maps into intel cleanup.
  - Call canonical completed-intel recording when a legendary wonder completes.
- Create `src/systems/legendary-wonder-intel-presentation.ts`
  - Fold viewer-scoped records into safe per-wonder summaries.
  - Never expose rival city IDs, coordinates, actions, progress, quest text, reward summaries, or another viewer's records.
- Modify `src/systems/wonder-atlas-presentation.ts`
  - Add rival activity count/badge fields to legendary entries.
  - Add rival status labels only when no owned label has priority.
- Modify `src/systems/wonder-codex/presentation.ts`
  - Add rival activity badges to catalog entries.
  - Add safe rival intel summary/event rows to page view models.
  - Preserve owned reward/status/action behavior.
- Modify `src/ui/wonder-codex-panel.ts`
  - Render catalog rival activity badge/count.
- Modify `src/ui/wonder-codex-page.ts`
  - Render safe rival journal section with no action buttons.
- Modify tests:
  - `tests/systems/legendary-wonder-system.test.ts`
  - `tests/systems/wonder-atlas-presentation.test.ts`
  - `tests/systems/wonder-codex/presentation.test.ts`
  - `tests/ui/wonder-atlas-panel.test.ts`
  - `tests/storage/save-persistence.test.ts`

## Player Truth Table

| Before | Player action | Immediate visible result | Must remain reachable |
|---|---|---|---|
| Atlas entry has no owned state and no rival intel | Open Atlas/Codex | Entry reads `Legendary wonder`; no rival badge or journal | The legendary catalog entry remains browseable |
| Atlas entry has started rival intel only | Select that wonder | Catalog shows rival badge; page shows `Spotted rival project` and `Last known: under construction` | Educational Codex content and related links still render |
| Atlas entry has completed rival intel only | Select that wonder | Entry can read `Known rival completed`; page shows rival name and completion turn | No map/city action appears for the rival record |
| Atlas entry has own state and rival intel | Select that wonder | Owned label remains primary; rival intel is secondary | Existing owned `Open City` action remains if it was safe before |
| Hot-seat player changes | Reopen Atlas for next current player | Badge/count and journal rerender from the new viewer only | The same one-entry-per-wonder catalog remains available |

## Misleading UI Risks

- `Known rival completed` must mean an explicit completed intel record exists for the current viewer. Hidden `completedLegendaryWonders` alone is insufficient.
- `Spotted rival project` must mean an explicit started intel record exists for the current viewer. Hidden rival `legendaryWonderProjects` alone is insufficient.
- A started snapshot city name is plain text memory, not map permission. The view model must not expose that city ID as an action target.
- Owned state labels have priority. Rival intel must not overwrite `Available`, `Under construction`, `Completed`, or `Recovered`.
- Completed rival intel does not reveal host city or reward. Public educational Codex content remains visible, but gameplay reward summary/effect detail must not appear because of rival completion alone.

## Interaction Replay Checklist

- Open Atlas with no rival intel, verify no badge/journal.
- Reopen Atlas for a viewer with started intel, verify badge/journal.
- Select the rival-intel wonder, then select a different wonder, then reselect the rival-intel wonder; verify the section rerenders and does not duplicate rows.
- Reopen Atlas after `state.currentPlayer` changes; verify prior viewer rows disappear.
- Click any owned safe action still present on an owned wonder; verify the callback still works.
- Verify no rival-intel page renders `data-codex-action="open-city"` or `data-codex-action="view-map"` from rival records.

---

## Task 1: Upgrade Legendary Intel Types And Ledger Helpers

**Files:**
- Modify: `src/core/types.ts`
- Modify: `src/systems/legendary-wonder-intel.ts`
- Test: `tests/storage/save-persistence.test.ts`
- Test: `tests/systems/legendary-wonder-system.test.ts`

- [ ] **Step 1: Write failing save compatibility tests**

Add these tests to `tests/storage/save-persistence.test.ts` near the existing legendary wonder intel round-trip test:

```ts
it('round-trips completed legendary wonder intel through JSON serialization', () => {
  const state = {
    legendaryWonderIntel: {
      observer: [
        {
          kind: 'completed',
          eventId: 'completed:oracle-of-delphi:rival:58',
          wonderId: 'oracle-of-delphi',
          civId: 'rival',
          civName: 'Rival',
          completionTurn: 58,
          learnedTurn: 58,
        },
      ],
    },
  };

  const roundTrip = JSON.parse(JSON.stringify(state));

  expect(roundTrip.legendaryWonderIntel.observer[0]).toEqual({
    kind: 'completed',
    eventId: 'completed:oracle-of-delphi:rival:58',
    wonderId: 'oracle-of-delphi',
    civId: 'rival',
    civName: 'Rival',
    completionTurn: 58,
    learnedTurn: 58,
  });
});

it('keeps legacy started legendary wonder intel serializable', () => {
  const state = {
    legendaryWonderIntel: {
      observer: [
        {
          projectKey: 'oracle-of-delphi:rival:city-rival',
          wonderId: 'oracle-of-delphi',
          civId: 'rival',
          civName: 'Rival',
          cityId: 'city-rival',
          cityName: 'Rival Harbor',
          revealedTurn: 41,
          intelLevel: 'started',
        },
      ],
    },
  };

  const roundTrip = JSON.parse(JSON.stringify(state));

  expect(roundTrip.legendaryWonderIntel.observer[0].intelLevel).toBe('started');
  expect(roundTrip.legendaryWonderIntel.observer[0].cityName).toBe('Rival Harbor');
});
```

- [ ] **Step 2: Write failing ledger helper tests**

Add imports at the top of `tests/systems/legendary-wonder-system.test.ts`:

```ts
import {
  getLegendaryWonderIntelForViewer,
  recordLegendaryWonderIntel,
  sanitizeLegendaryWonderIntel,
} from '@/systems/legendary-wonder-intel';
```

Add these tests in the existing legendary wonder system `describe` block:

```ts
it('preserves started rival wonder intel after the live project is no longer building', () => {
  const state = makeLegendaryWonderFixture();
  state.legendaryWonderIntel = {
    player: [
      {
        kind: 'started',
        eventId: 'started:grand-canal:rival:rival-city:41',
        projectKey: 'grand-canal:rival:rival-city',
        wonderId: 'grand-canal',
        civId: 'rival',
        civName: 'Rival',
        cityId: 'rival-city',
        cityName: 'Rival Harbor',
        revealedTurn: 41,
      },
    ],
  };
  state.legendaryWonderProjects = {};

  const sanitized = sanitizeLegendaryWonderIntel(state);

  expect(sanitized.player).toHaveLength(1);
  expect(sanitized.player[0]).toMatchObject({
    kind: 'started',
    eventId: 'started:grand-canal:rival:rival-city:41',
    cityName: 'Rival Harbor',
  });
});

it('normalizes legacy started rival wonder intel without requiring a live project', () => {
  const state = makeLegendaryWonderFixture();
  state.legendaryWonderIntel = {
    player: [
      {
        projectKey: 'grand-canal:rival:rival-city',
        wonderId: 'grand-canal',
        civId: 'rival',
        civName: 'Rival',
        cityId: 'rival-city',
        cityName: 'Rival Harbor',
        revealedTurn: 41,
        intelLevel: 'started',
      },
    ],
  };
  state.legendaryWonderProjects = {};

  const [entry] = getLegendaryWonderIntelForViewer(state, 'player');

  expect(entry).toMatchObject({
    kind: 'started',
    eventId: 'started:grand-canal:rival:rival-city:41',
    cityName: 'Rival Harbor',
  });
});

it('dedupes exact intel events without removing distinct started and completed events', () => {
  const state = makeLegendaryWonderFixture();
  const first = recordLegendaryWonderIntel(state, 'player', {
    kind: 'started',
    eventId: 'started:grand-canal:rival:rival-city:41',
    projectKey: 'grand-canal:rival:rival-city',
    wonderId: 'grand-canal',
    civId: 'rival',
    civName: 'Rival',
    cityId: 'rival-city',
    cityName: 'Rival Harbor',
    revealedTurn: 41,
  });
  const second = recordLegendaryWonderIntel({ ...state, legendaryWonderIntel: first }, 'player', {
    kind: 'started',
    eventId: 'started:grand-canal:rival:rival-city:41',
    projectKey: 'grand-canal:rival:rival-city',
    wonderId: 'grand-canal',
    civId: 'rival',
    civName: 'Rival',
    cityId: 'rival-city',
    cityName: 'Rival Harbor',
    revealedTurn: 41,
  });
  const third = recordLegendaryWonderIntel({ ...state, legendaryWonderIntel: second }, 'player', {
    kind: 'completed',
    eventId: 'completed:grand-canal:rival:58',
    wonderId: 'grand-canal',
    civId: 'rival',
    civName: 'Rival',
    completionTurn: 58,
    learnedTurn: 58,
  });

  expect(third.player).toHaveLength(2);
  expect(third.player.map(entry => entry.kind)).toEqual(['started', 'completed']);
});
```

- [ ] **Step 3: Run tests to verify failure**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/storage/save-persistence.test.ts tests/systems/legendary-wonder-system.test.ts
```

Expected: FAIL because `kind: 'completed'`, `eventId`, normalization, and the new `sanitizeLegendaryWonderIntel(state)` signature do not exist yet.

- [ ] **Step 4: Update `src/core/types.ts`**

Replace the existing `LegendaryWonderIntelEntry` interface with:

```ts
export type LegendaryWonderIntelKind = 'started' | 'completed';

export interface LegacyLegendaryWonderStartedIntelEntry {
  projectKey: string;
  wonderId: string;
  civId: string;
  civName: string;
  cityId: string;
  cityName: string;
  revealedTurn: number;
  intelLevel: 'started';
  kind?: undefined;
  eventId?: undefined;
}

export interface LegendaryWonderStartedIntelEntry {
  kind: 'started';
  eventId: string;
  projectKey: string;
  wonderId: string;
  civId: string;
  civName: string;
  cityId: string;
  cityName: string;
  revealedTurn: number;
  intelLevel?: 'started';
}

export interface LegendaryWonderCompletedIntelEntry {
  kind: 'completed';
  eventId: string;
  wonderId: string;
  civId: string;
  civName: string;
  completionTurn: number;
  learnedTurn: number;
}

export type LegendaryWonderIntelEntry =
  | LegacyLegendaryWonderStartedIntelEntry
  | LegendaryWonderStartedIntelEntry
  | LegendaryWonderCompletedIntelEntry;

export type NormalizedLegendaryWonderIntelEntry =
  | LegendaryWonderStartedIntelEntry
  | LegendaryWonderCompletedIntelEntry;
```

- [ ] **Step 5: Replace `src/systems/legendary-wonder-intel.ts` helpers**

Replace the file contents with:

```ts
import type {
  GameState,
  LegendaryWonderCompletedIntelEntry,
  LegendaryWonderIntelEntry,
  LegendaryWonderStartedIntelEntry,
  NormalizedLegendaryWonderIntelEntry,
} from '@/core/types';
import { getLegendaryWonderDefinition } from '@/systems/legendary-wonder-definitions';
import { shouldListMajorCivForViewer } from '@/systems/viewer-intel';

function startedEventId(projectKey: string, revealedTurn: number): string {
  return `started:${projectKey}:${revealedTurn}`;
}

function completedEventId(wonderId: string, civId: string, completionTurn: number): string {
  return `completed:${wonderId}:${civId}:${completionTurn}`;
}

export function normalizeLegendaryWonderIntelEntry(
  entry: LegendaryWonderIntelEntry,
): NormalizedLegendaryWonderIntelEntry | null {
  if (entry.kind === 'completed') {
    if (!getLegendaryWonderDefinition(entry.wonderId)) return null;
    if (!entry.eventId || !entry.civId || !entry.civName) return null;
    return { ...entry };
  }

  if (entry.kind === 'started') {
    if (!getLegendaryWonderDefinition(entry.wonderId)) return null;
    if (!entry.projectKey || !entry.cityId || !entry.cityName) return null;
    return {
      ...entry,
      eventId: entry.eventId || startedEventId(entry.projectKey, entry.revealedTurn),
      intelLevel: entry.intelLevel,
    };
  }

  if (entry.intelLevel === 'started') {
    if (!getLegendaryWonderDefinition(entry.wonderId)) return null;
    return {
      kind: 'started',
      eventId: startedEventId(entry.projectKey, entry.revealedTurn),
      projectKey: entry.projectKey,
      wonderId: entry.wonderId,
      civId: entry.civId,
      civName: entry.civName,
      cityId: entry.cityId,
      cityName: entry.cityName,
      revealedTurn: entry.revealedTurn,
      intelLevel: 'started',
    };
  }

  return null;
}

export function recordLegendaryWonderIntel(
  state: GameState,
  viewerId: string,
  entry: NormalizedLegendaryWonderIntelEntry,
): Record<string, NormalizedLegendaryWonderIntelEntry[]> {
  const normalized = normalizeLegendaryWonderIntelEntry(entry);
  if (!normalized) {
    return sanitizeLegendaryWonderIntel(state);
  }

  const sanitized = sanitizeLegendaryWonderIntel(state);
  const existing = sanitized[viewerId] ?? [];
  return {
    ...sanitized,
    [viewerId]: [
      ...existing.filter(candidate => candidate.eventId !== normalized.eventId),
      normalized,
    ],
  };
}

export function sanitizeLegendaryWonderIntel(
  state: GameState,
): Record<string, NormalizedLegendaryWonderIntelEntry[]> {
  return Object.fromEntries(
    Object.entries(state.legendaryWonderIntel ?? {})
      .map(([viewerId, entries]) => {
        const normalized: NormalizedLegendaryWonderIntelEntry[] = [];
        const seen = new Set<string>();
        for (const entry of entries) {
          const safeEntry = normalizeLegendaryWonderIntelEntry(entry);
          if (!safeEntry || seen.has(safeEntry.eventId)) continue;
          seen.add(safeEntry.eventId);
          normalized.push(safeEntry);
        }
        return [viewerId, normalized] as const;
      })
      .filter(([, entries]) => entries.length > 0),
  );
}

export function getLegendaryWonderIntelForViewer(
  state: GameState,
  viewerId: string,
): NormalizedLegendaryWonderIntelEntry[] {
  return (state.legendaryWonderIntel?.[viewerId] ?? [])
    .map(entry => normalizeLegendaryWonderIntelEntry(entry))
    .filter((entry): entry is NormalizedLegendaryWonderIntelEntry => entry !== null);
}

export function createStartedLegendaryWonderIntelEntry(input: {
  projectKey: string;
  wonderId: string;
  civId: string;
  civName: string;
  cityId: string;
  cityName: string;
  revealedTurn: number;
}): LegendaryWonderStartedIntelEntry {
  return {
    kind: 'started',
    eventId: startedEventId(input.projectKey, input.revealedTurn),
    ...input,
    intelLevel: 'started',
  };
}

export function createCompletedLegendaryWonderIntelEntry(input: {
  wonderId: string;
  civId: string;
  civName: string;
  completionTurn: number;
  learnedTurn: number;
}): LegendaryWonderCompletedIntelEntry {
  return {
    kind: 'completed',
    eventId: completedEventId(input.wonderId, input.civId, input.completionTurn),
    ...input,
  };
}

export function recordKnownHumanLegendaryWonderCompletionIntel(
  state: GameState,
  completed: { wonderId: string; civId: string; completionTurn: number; learnedTurn: number },
): Record<string, NormalizedLegendaryWonderIntelEntry[]> {
  let legendaryWonderIntel = sanitizeLegendaryWonderIntel(state);
  const completingCiv = state.civilizations[completed.civId];
  if (!completingCiv) return legendaryWonderIntel;

  for (const viewer of Object.values(state.civilizations)) {
    if (!viewer.isHuman || viewer.id === completed.civId) continue;
    if (!shouldListMajorCivForViewer(state, viewer.id, completed.civId)) continue;
    legendaryWonderIntel = recordLegendaryWonderIntel(
      { ...state, legendaryWonderIntel },
      viewer.id,
      createCompletedLegendaryWonderIntelEntry({
        wonderId: completed.wonderId,
        civId: completed.civId,
        civName: completingCiv.name,
        completionTurn: completed.completionTurn,
        learnedTurn: completed.learnedTurn,
      }),
    );
  }

  return legendaryWonderIntel;
}
```

- [ ] **Step 6: Run targeted tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/storage/save-persistence.test.ts tests/systems/legendary-wonder-system.test.ts
```

Expected: Some failures remain from old `sanitizeLegendaryWonderIntel(state, projects)` call sites. The new helper tests should compile once call sites are updated in Task 2.

- [ ] **Step 7: Hold the commit until Task 2 updates call sites**

Do not commit after Task 1 while the codebase still has old `sanitizeLegendaryWonderIntel(state, projects)` call sites. Continue directly to Task 2. Task 2 Step 8 commits the type, helper, system, and test changes together after the targeted tests pass.


---

## Task 2: Record Completed Rival Intel In Canonical Wonder System

**Files:**
- Modify: `src/systems/legendary-wonder-system.ts`
- Modify: `src/systems/legendary-wonder-intel.ts`
- Test: `tests/systems/legendary-wonder-system.test.ts`

- [ ] **Step 1: Write failing completed-intel system tests**

Add these tests to `tests/systems/legendary-wonder-system.test.ts`:

```ts
it('records completed rival wonder intel for human viewers who know the completing rival', () => {
  const state = makeLegendaryWonderFixture();
  state.turn = 58;
  state.civilizations.player.knownCivilizations = ['rival'];
  state.civilizations.rival = {
    ...state.civilizations.player,
    id: 'rival',
    name: 'Rival',
    isHuman: false,
    cities: ['rival-city'],
    units: [],
    knownCivilizations: ['player'],
  };
  state.cities['rival-city'] = {
    ...state.cities['city-river'],
    id: 'rival-city',
    owner: 'rival',
    name: 'Rival Harbor',
    position: { q: 20, r: 20 },
    ownedTiles: [],
    productionQueue: ['legendary:oracle-of-delphi'],
    productionProgress: 999,
  };
  state.legendaryWonderProjects = {
    'oracle-of-delphi:rival:rival-city': {
      wonderId: 'oracle-of-delphi',
      ownerId: 'rival',
      cityId: 'rival-city',
      phase: 'building',
      investedProduction: 0,
      transferableProduction: 0,
      questSteps: [],
    },
  };

  const result = tickLegendaryWonderProjects(state, new EventBus());

  expect(result.legendaryWonderIntel?.player).toContainEqual({
    kind: 'completed',
    eventId: 'completed:oracle-of-delphi:rival:58',
    wonderId: 'oracle-of-delphi',
    civId: 'rival',
    civName: 'Rival',
    completionTurn: 58,
    learnedTurn: 58,
  });
});

it('does not record completed rival wonder intel for human viewers who do not know the completing rival', () => {
  const state = makeLegendaryWonderFixture();
  state.turn = 58;
  state.civilizations.player.knownCivilizations = [];
  state.civilizations.rival = {
    ...state.civilizations.player,
    id: 'rival',
    name: 'Rival',
    isHuman: false,
    cities: ['rival-city'],
    units: [],
    knownCivilizations: [],
  };
  state.cities['rival-city'] = {
    ...state.cities['city-river'],
    id: 'rival-city',
    owner: 'rival',
    name: 'Rival Harbor',
    position: { q: 20, r: 20 },
    ownedTiles: [],
    productionQueue: ['legendary:oracle-of-delphi'],
    productionProgress: 999,
  };
  state.legendaryWonderProjects = {
    'oracle-of-delphi:rival:rival-city': {
      wonderId: 'oracle-of-delphi',
      ownerId: 'rival',
      cityId: 'rival-city',
      phase: 'building',
      investedProduction: 0,
      transferableProduction: 0,
      questSteps: [],
    },
  };

  const result = tickLegendaryWonderProjects(state, new EventBus());

  expect(result.legendaryWonderIntel?.player).toBeUndefined();
});

it('records separate completed rival wonder intel for each known human hot-seat viewer', () => {
  const state = makeLegendaryWonderFixture();
  state.turn = 58;
  state.civilizations.player.knownCivilizations = ['rival'];
  state.civilizations['player-2'] = {
    ...state.civilizations.player,
    id: 'player-2',
    name: 'Second Player',
    isHuman: true,
    cities: [],
    units: [],
    knownCivilizations: ['rival'],
  };
  state.civilizations.rival = {
    ...state.civilizations.player,
    id: 'rival',
    name: 'Rival',
    isHuman: false,
    cities: ['rival-city'],
    units: [],
    knownCivilizations: ['player', 'player-2'],
  };
  state.cities['rival-city'] = {
    ...state.cities['city-river'],
    id: 'rival-city',
    owner: 'rival',
    name: 'Rival Harbor',
    position: { q: 20, r: 20 },
    ownedTiles: [],
    productionQueue: ['legendary:oracle-of-delphi'],
    productionProgress: 999,
  };
  state.legendaryWonderProjects = {
    'oracle-of-delphi:rival:rival-city': {
      wonderId: 'oracle-of-delphi',
      ownerId: 'rival',
      cityId: 'rival-city',
      phase: 'building',
      investedProduction: 0,
      transferableProduction: 0,
      questSteps: [],
    },
  };

  const result = tickLegendaryWonderProjects(state, new EventBus());

  expect(result.legendaryWonderIntel?.player).toContainEqual(expect.objectContaining({
    kind: 'completed',
    eventId: 'completed:oracle-of-delphi:rival:58',
  }));
  expect(result.legendaryWonderIntel?.['player-2']).toContainEqual(expect.objectContaining({
    kind: 'completed',
    eventId: 'completed:oracle-of-delphi:rival:58',
  }));
});

it('does not record completed wonder intel as rival intel for the completing human civ', () => {
  const state = makeLegendaryWonderFixture();
  state.turn = 58;
  state.civilizations.player.knownCivilizations = ['rival'];
  state.legendaryWonderProjects!['oracle-of-delphi'].phase = 'building';
  state.cities['city-river'].productionQueue = ['legendary:oracle-of-delphi'];
  state.cities['city-river'].productionProgress = 999;

  const result = tickLegendaryWonderProjects(state, new EventBus());

  expect(result.completedLegendaryWonders?.['oracle-of-delphi']?.ownerId).toBe('player');
  expect(result.legendaryWonderIntel?.player).toBeUndefined();
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/legendary-wonder-system.test.ts
```

Expected: FAIL because completions are not written to `legendaryWonderIntel` and legacy cleanup call sites still use the old helper signature.

- [ ] **Step 3: Update imports in `src/systems/legendary-wonder-system.ts`**

Change the intel import to include the new factory/recorder:

```ts
import {
  createStartedLegendaryWonderIntelEntry,
  recordKnownHumanLegendaryWonderCompletionIntel,
  recordLegendaryWonderIntel,
  sanitizeLegendaryWonderIntel,
} from './legendary-wonder-intel';
```

- [ ] **Step 4: Update sanitize call sites**

Replace these patterns:

```ts
legendaryWonderIntel: sanitizeLegendaryWonderIntel(state, sanitizeLegendaryWonderProjects(state)),
```

and:

```ts
legendaryWonderIntel: sanitizeLegendaryWonderIntel(
  {
    ...seededState,
    legendaryWonderProjects: updatedProjects,
  },
  updatedProjects,
),
```

with:

```ts
legendaryWonderIntel: sanitizeLegendaryWonderIntel(state),
```

or, inside the final `tickLegendaryWonderProjects` return:

```ts
legendaryWonderIntel,
```

where `legendaryWonderIntel` is the local variable updated in Step 5.

- [ ] **Step 5: Preserve and update local intel during completion**

In `tickLegendaryWonderProjects`, after `const completedLegendaryWonders = ...`, add:

```ts
let legendaryWonderIntel = sanitizeLegendaryWonderIntel(seededState);
```

Immediately after writing `completedLegendaryWonders[project.wonderId] = ...`, add:

```ts
legendaryWonderIntel = recordKnownHumanLegendaryWonderCompletionIntel(
  {
    ...seededState,
    civilizations: updatedCivilizations,
    cities: updatedCities,
    completedLegendaryWonders,
    legendaryWonderIntel,
  },
  {
    wonderId: project.wonderId,
    civId: project.ownerId,
    completionTurn: state.turn,
    learnedTurn: state.turn,
  },
);
```

In the final returned object, set:

```ts
legendaryWonderIntel,
```

- [ ] **Step 6: Update start-intel recording to use the factory**

In `startLegendaryWonderBuild`, replace the inline started entry with:

```ts
createStartedLegendaryWonderIntelEntry({
  projectKey,
  wonderId: project.wonderId,
  civId,
  civName: civilization?.name ?? civId,
  cityId,
  cityName: city?.name ?? cityId,
  revealedTurn: state.turn,
})
```

- [ ] **Step 7: Run targeted tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/legendary-wonder-system.test.ts tests/storage/save-persistence.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit Task 1 and Task 2**

Run:

```bash
git add src/core/types.ts src/systems/legendary-wonder-intel.ts src/systems/legendary-wonder-system.ts tests/storage/save-persistence.test.ts tests/systems/legendary-wonder-system.test.ts
git commit -m "feat(wonders): preserve viewer legendary intel ledger"
```

---

## Task 3: Add Safe Rival Intel Presentation Summary

**Files:**
- Create: `src/systems/legendary-wonder-intel-presentation.ts`
- Test: `tests/systems/wonder-codex/presentation.test.ts`
- Test: `tests/systems/wonder-atlas-presentation.test.ts`

- [ ] **Step 1: Write failing presentation tests for safe summaries**

Add to `tests/systems/wonder-codex/presentation.test.ts`:

```ts
it('surfaces started rival intel from explicit records without action targets', () => {
  const state = makeState();
  state.legendaryWonderIntel = {
    player: [
      {
        kind: 'started',
        eventId: 'started:oracle-of-delphi:ai-1:rival-city:41',
        projectKey: 'oracle-of-delphi:ai-1:rival-city',
        wonderId: 'oracle-of-delphi',
        civId: 'ai-1',
        civName: 'Rival',
        cityId: 'rival-city',
        cityName: 'Rival Harbor',
        revealedTurn: 41,
      },
    ],
  };

  const model = getWonderCodexViewModel(state, 'player', { initialWonderId: 'oracle-of-delphi' });
  const serialized = JSON.stringify(model);

  expect(model.selectedPage?.stateLabel).toBe('Spotted rival project');
  expect(model.selectedPage?.rivalIntel?.activityCount).toBe(1);
  expect(model.selectedPage?.rivalIntel?.summaryLine).toContain('Last known: under construction');
  expect(model.selectedPage?.rivalIntel?.events[0]?.text).toContain('Rival began Oracle of Delphi in Rival Harbor on turn 41');
  expect(model.selectedPage?.actions).toEqual([]);
  expect(serialized).not.toContain('"cityId":"rival-city"');
  expect(serialized).not.toContain('Quest steps');
  expect(serialized).not.toContain('Reward:');
});

it('surfaces completed rival intel without host city or reward leakage', () => {
  const state = makeState();
  state.completedLegendaryWonders = {
    'oracle-of-delphi': { ownerId: 'ai-1', cityId: 'hidden-city', turnCompleted: 58 },
  };
  state.legendaryWonderIntel = {
    player: [
      {
        kind: 'completed',
        eventId: 'completed:oracle-of-delphi:ai-1:58',
        wonderId: 'oracle-of-delphi',
        civId: 'ai-1',
        civName: 'Rival',
        completionTurn: 58,
        learnedTurn: 58,
      },
    ],
  };

  const model = getWonderCodexViewModel(state, 'player', { initialWonderId: 'oracle-of-delphi' });
  const serialized = JSON.stringify(model);

  expect(model.selectedPage?.stateLabel).toBe('Known rival completed');
  expect(model.selectedPage?.rivalIntel?.summaryLine).toBe('Known rival completed: Rival completed Oracle of Delphi on turn 58.');
  expect(serialized).not.toContain('hidden-city');
  expect(serialized).not.toContain('Reward:');
  expect(model.selectedPage?.actions).toEqual([]);
});

it('keeps owned state primary when owned state and rival intel both exist', () => {
  const state = makeState();
  state.legendaryWonderProjects = {
    own: {
      wonderId: 'oracle-of-delphi',
      ownerId: 'player',
      cityId: 'city-river',
      phase: 'building',
      investedProduction: 40,
      transferableProduction: 0,
      questSteps: [],
    },
  };
  state.legendaryWonderIntel = {
    player: [
      {
        kind: 'completed',
        eventId: 'completed:oracle-of-delphi:ai-1:58',
        wonderId: 'oracle-of-delphi',
        civId: 'ai-1',
        civName: 'Rival',
        completionTurn: 58,
        learnedTurn: 58,
      },
    ],
  };

  const model = getWonderCodexViewModel(state, 'player', { initialWonderId: 'oracle-of-delphi' });

  expect(model.selectedPage?.stateLabel).toBe('Under construction');
  expect(model.selectedPage?.rivalIntel?.stateLabel).toBe('Known rival completed');
});
```

Add to `tests/systems/wonder-atlas-presentation.test.ts`:

```ts
it('adds a rival activity badge count from explicit viewer intel only', () => {
  const state = makeAtlasState();
  state.legendaryWonderIntel = {
    player: [
      {
        kind: 'completed',
        eventId: 'completed:oracle-of-delphi:ai-1:58',
        wonderId: 'oracle-of-delphi',
        civId: 'ai-1',
        civName: 'Rival',
        completionTurn: 58,
        learnedTurn: 58,
      },
    ],
    'player-2': [
      {
        kind: 'completed',
        eventId: 'completed:grand-canal:ai-1:59',
        wonderId: 'grand-canal',
        civId: 'ai-1',
        civName: 'Rival',
        completionTurn: 59,
        learnedTurn: 59,
      },
    ],
  };

  const oracle = getWonderAtlasEntries(state, 'player')
    .find(entry => entry.kind === 'legendary' && entry.wonderId === 'oracle-of-delphi');
  const canal = getWonderAtlasEntries(state, 'player')
    .find(entry => entry.kind === 'legendary' && entry.wonderId === 'grand-canal');

  expect(oracle).toMatchObject({
    kind: 'legendary',
    stateLabel: 'Known rival completed',
    rivalIntelCount: 1,
    rivalIntelBadgeLabel: 'Known rival activity',
  });
  expect(canal).toMatchObject({
    kind: 'legendary',
    stateLabel: 'Legendary wonder',
    rivalIntelCount: 0,
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/wonder-codex/presentation.test.ts tests/systems/wonder-atlas-presentation.test.ts
```

Expected: FAIL because `rivalIntel`, `rivalIntelCount`, `rivalIntelBadgeLabel`, and rival state labels are not implemented.

- [ ] **Step 3: Create `src/systems/legendary-wonder-intel-presentation.ts`**

Add:

```ts
import type { GameState, NormalizedLegendaryWonderIntelEntry } from '@/core/types';
import { getLegendaryWonderDefinition } from '@/systems/legendary-wonder-definitions';
import { getLegendaryWonderIntelForViewer } from '@/systems/legendary-wonder-intel';

export type LegendaryWonderRivalIntelStateLabel = 'Known rival completed' | 'Spotted rival project';

export interface LegendaryWonderRivalIntelEventView {
  id: string;
  kind: 'started' | 'completed';
  civId: string;
  civName: string;
  turn: number;
  title: string;
  text: string;
}

export interface LegendaryWonderRivalIntelSummary {
  wonderId: string;
  activityCount: number;
  badgeLabel: string;
  stateLabel: LegendaryWonderRivalIntelStateLabel;
  summaryLine: string;
  events: LegendaryWonderRivalIntelEventView[];
}

function wonderName(wonderId: string): string {
  return getLegendaryWonderDefinition(wonderId)?.name ?? wonderId;
}

function eventTurn(entry: NormalizedLegendaryWonderIntelEntry): number {
  return entry.kind === 'completed' ? entry.learnedTurn : entry.revealedTurn;
}

function eventView(entry: NormalizedLegendaryWonderIntelEntry): LegendaryWonderRivalIntelEventView {
  const name = wonderName(entry.wonderId);
  if (entry.kind === 'completed') {
    return {
      id: entry.eventId,
      kind: 'completed',
      civId: entry.civId,
      civName: entry.civName,
      turn: entry.learnedTurn,
      title: 'Known rival completed',
      text: `${entry.civName} completed ${name} on turn ${entry.completionTurn}.`,
    };
  }

  return {
    id: entry.eventId,
    kind: 'started',
    civId: entry.civId,
    civName: entry.civName,
    turn: entry.revealedTurn,
    title: 'Spotted rival project',
    text: `${entry.civName} began ${name} in ${entry.cityName} on turn ${entry.revealedTurn}.`,
  };
}

function bestState(events: LegendaryWonderRivalIntelEventView[]): LegendaryWonderRivalIntelStateLabel {
  return events.some(event => event.kind === 'completed')
    ? 'Known rival completed'
    : 'Spotted rival project';
}

function summaryLine(wonderId: string, events: LegendaryWonderRivalIntelEventView[]): string {
  const completed = [...events].reverse().find(event => event.kind === 'completed');
  if (completed) {
    return `Known rival completed: ${completed.text}`;
  }

  const started = [...events].reverse().find(event => event.kind === 'started');
  if (started) {
    return `Last known: under construction. ${started.text}`;
  }

  return `No known rival activity for ${wonderName(wonderId)}.`;
}

export function getLegendaryWonderRivalIntelSummariesForViewer(
  state: GameState,
  viewerId: string,
): Map<string, LegendaryWonderRivalIntelSummary> {
  const grouped = new Map<string, NormalizedLegendaryWonderIntelEntry[]>();

  for (const entry of getLegendaryWonderIntelForViewer(state, viewerId)) {
    const entries = grouped.get(entry.wonderId) ?? [];
    entries.push(entry);
    grouped.set(entry.wonderId, entries);
  }

  const summaries = new Map<string, LegendaryWonderRivalIntelSummary>();
  for (const [wonderId, entries] of grouped.entries()) {
    const events = entries
      .map(eventView)
      .sort((a, b) => a.turn - b.turn || a.civName.localeCompare(b.civName) || a.id.localeCompare(b.id));
    summaries.set(wonderId, {
      wonderId,
      activityCount: events.length,
      badgeLabel: events.length === 1 ? 'Known rival activity' : `${events.length} rival records`,
      stateLabel: bestState(events),
      summaryLine: summaryLine(wonderId, events),
      events,
    });
  }

  return summaries;
}
```

- [ ] **Step 4: Run presentation helper tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/wonder-codex/presentation.test.ts tests/systems/wonder-atlas-presentation.test.ts
```

Expected: Still FAIL because Atlas/Codex presentation has not consumed the helper.

- [ ] **Step 5: Commit after Task 4 passes**

Commit Task 3 and Task 4 together after both presentation files consume this helper:

```bash
git add src/systems/legendary-wonder-intel-presentation.ts tests/systems/wonder-codex/presentation.test.ts tests/systems/wonder-atlas-presentation.test.ts
git commit -m "feat(wonders): summarize rival atlas intel"
```

---

## Task 4: Wire Atlas And Codex Presentation View Models

**Files:**
- Modify: `src/systems/wonder-atlas-presentation.ts`
- Modify: `src/systems/wonder-codex/presentation.ts`
- Test: `tests/systems/wonder-atlas-presentation.test.ts`
- Test: `tests/systems/wonder-codex/presentation.test.ts`

- [ ] **Step 1: Update Atlas entry type and labels**

In `src/systems/wonder-atlas-presentation.ts`, import the helper:

```ts
import { getLegendaryWonderRivalIntelSummariesForViewer, type LegendaryWonderRivalIntelSummary } from '@/systems/legendary-wonder-intel-presentation';
```

Extend `LegendaryWonderAtlasEntry`:

```ts
stateLabel: 'Available' | 'Under construction' | 'Completed' | 'Recovered' | 'Known rival completed' | 'Spotted rival project' | 'Legendary wonder';
rivalIntelCount: number;
rivalIntelBadgeLabel?: string;
```

Change `getLegendaryStateLabel` to accept a summary:

```ts
function getLegendaryStateLabel(
  state: GameState,
  viewerId: string,
  wonderId: string,
  rivalIntel: LegendaryWonderRivalIntelSummary | undefined,
): LegendaryWonderAtlasEntry['stateLabel'] {
  const completion = state.completedLegendaryWonders?.[wonderId];
  if (completion?.ownerId === viewerId) return 'Completed';

  const ownedProject = Object.values(state.legendaryWonderProjects ?? {}).find(project =>
    project.ownerId === viewerId && project.wonderId === wonderId,
  );
  if (!ownedProject) return rivalIntel?.stateLabel ?? 'Legendary wonder';

  if (ownedProject.phase === 'ready_to_build') {
    const cityEntry = getLegendaryWonderPresentationForCity(state, viewerId, ownedProject.cityId)
      .find(entry => entry.wonderId === wonderId);
    return cityEntry?.canStartBuild ? 'Available' : rivalIntel?.stateLabel ?? 'Legendary wonder';
  }
  if (ownedProject.phase === 'building') return 'Under construction';
  if (ownedProject.phase === 'completed') return 'Completed';
  if (ownedProject.phase === 'lost_race') return 'Recovered';
  return rivalIntel?.stateLabel ?? 'Legendary wonder';
}
```

Change `legendaryWonderEntry` to accept the summary and return count/badge:

```ts
function legendaryWonderEntry(
  state: GameState,
  viewerId: string,
  wonderId: string,
  name: string,
  rivalIntel: LegendaryWonderRivalIntelSummary | undefined,
): LegendaryWonderAtlasEntry {
  const visual = getWonderVisualDefinition(wonderId);
  return {
    kind: 'legendary',
    wonderId,
    visibility: 'masked',
    name,
    maskedLabel: visual.maskedLabel ?? 'Legendary wonder',
    stateLabel: getLegendaryStateLabel(state, viewerId, wonderId, rivalIntel),
    canViewOnMap: false,
    visual,
    rivalIntelCount: rivalIntel?.activityCount ?? 0,
    rivalIntelBadgeLabel: rivalIntel?.badgeLabel,
  };
}
```

In `getWonderAtlasEntries`, compute summaries once:

```ts
const rivalIntelSummaries = getLegendaryWonderRivalIntelSummariesForViewer(state, viewerId);
const legendaryEntries = getLegendaryWonderDefinitions().map(definition =>
  legendaryWonderEntry(state, viewerId, definition.id, definition.name, rivalIntelSummaries.get(definition.id)),
);
```

- [ ] **Step 2: Update Codex presentation types**

In `src/systems/wonder-codex/presentation.ts`, import:

```ts
import { getLegendaryWonderRivalIntelSummariesForViewer, type LegendaryWonderRivalIntelSummary } from '@/systems/legendary-wonder-intel-presentation';
```

Extend `WonderCodexCatalogEntry`:

```ts
rivalIntelCount?: number;
rivalIntelBadgeLabel?: string;
```

Extend `WonderCodexPageViewModel`:

```ts
rivalIntel?: LegendaryWonderRivalIntelSummary;
```

- [ ] **Step 3: Update Codex legendary state label and catalog**

Change `legendaryStateLabel` to accept summary and preserve owned priority:

```ts
function legendaryStateLabel(
  state: GameState,
  viewerId: string,
  wonderId: string,
  rivalIntel: LegendaryWonderRivalIntelSummary | undefined,
): string {
  const completion = state.completedLegendaryWonders?.[wonderId];
  if (completion?.ownerId === viewerId) return 'Completed';

  const project = ownedProject(state, viewerId, wonderId);
  if (!project) return rivalIntel?.stateLabel ?? 'Legendary wonder';
  if (project.phase === 'ready_to_build') {
    const cityEntry = getLegendaryWonderPresentationForCity(state, viewerId, project.cityId)
      .find(entry => entry.wonderId === wonderId);
    return cityEntry?.canStartBuild ? 'Available' : rivalIntel?.stateLabel ?? 'Legendary wonder';
  }
  if (project.phase === 'building') return 'Under construction';
  if (project.phase === 'completed') return 'Completed';
  if (project.phase === 'lost_race') return 'Recovered';
  if (project.phase === 'questing') return 'Quest in progress';
  return rivalIntel?.stateLabel ?? 'Legendary wonder';
}
```

Change `visibleCatalogEntries` to compute summaries and include badge fields:

```ts
const rivalIntelSummaries = getLegendaryWonderRivalIntelSummariesForViewer(state, viewerId);
const legendaryEntries = getLegendaryWonderDefinitions().map(definition => {
  const content = getWonderCodexContent(definition.id);
  const rivalIntel = rivalIntelSummaries.get(definition.id);
  return {
    id: definition.id,
    kind: 'legendary' as const,
    title: content?.title ?? definition.name,
    subtitle: content?.subtitle ?? 'Legendary wonder',
    stateLabel: legendaryStateLabel(state, viewerId, definition.id, rivalIntel),
    visual: getWonderVisualDefinition(definition.id),
    rivalIntelCount: rivalIntel?.activityCount ?? 0,
    rivalIntelBadgeLabel: rivalIntel?.badgeLabel,
  };
});
```

- [ ] **Step 4: Update Codex page building**

Change `buildLegendaryStatus` signature:

```ts
function buildLegendaryStatus(
  state: GameState,
  viewerId: string,
  wonderId: string,
  rivalIntel: LegendaryWonderRivalIntelSummary | undefined,
): { statusLines: string[]; actions: WonderCodexAction[] } {
  const definition = getLegendaryWonderDefinition(wonderId);
  const label = legendaryStateLabel(state, viewerId, wonderId, rivalIntel);
  const statusLines = [`Status: ${label}`];
  const ownsKnownState = label !== 'Legendary wonder'
    && label !== 'Known rival completed'
    && label !== 'Spotted rival project';
  if (definition && ownsKnownState) statusLines.push(`Reward: ${definition.reward.summary}`);

  const project = ownedProject(state, viewerId, wonderId);
  if (project?.phase === 'building') {
    statusLines.push(`Progress recorded in your city: ${project.investedProduction} production invested.`);
  }

  const completion = state.completedLegendaryWonders?.[wonderId];
  const cityId = safeOwnedHostCityId(state, viewerId, completion?.cityId ?? project?.cityId);
  const actions: WonderCodexAction[] = cityId
    ? [{ type: 'open-city', label: 'Open City', wonderId, cityId }]
    : [];
  return { statusLines, actions };
}
```

Change `buildPage` to pass and store `entry.rivalIntel`:

```ts
const rivalIntel = entry.kind === 'legendary' ? rivalIntelSummaries.get(entry.id) : undefined;
const status = content.kind === 'natural'
  ? buildNaturalStatus(state, entry.id)
  : buildLegendaryStatus(state, viewerId, entry.id, rivalIntel);
```

Add `rivalIntel` to the returned object only when defined:

```ts
...(rivalIntel ? { rivalIntel } : {}),
```

Pass `rivalIntelSummaries` into `buildPage` from `getWonderCodexViewModel`:

```ts
const rivalIntelSummaries = getLegendaryWonderRivalIntelSummariesForViewer(state, viewerId);
...
selectedPage: selectedEntry ? buildPage(state, viewerId, selectedEntry, visibleWonderIds, rivalIntelSummaries) : null,
```

- [ ] **Step 5: Run targeted presentation tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/wonder-atlas-presentation.test.ts tests/systems/wonder-codex/presentation.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit Task 3 and Task 4**

Run:

```bash
git add src/systems/legendary-wonder-intel-presentation.ts src/systems/wonder-atlas-presentation.ts src/systems/wonder-codex/presentation.ts tests/systems/wonder-atlas-presentation.test.ts tests/systems/wonder-codex/presentation.test.ts
git commit -m "feat(wonders): summarize rival atlas intel"
```

---

## Task 5: Render Rival Intel Badges And Journal UI

**Files:**
- Modify: `src/ui/wonder-codex-panel.ts`
- Modify: `src/ui/wonder-codex-page.ts`
- Test: `tests/ui/wonder-atlas-panel.test.ts`

- [ ] **Step 1: Write failing UI tests**

Add to `tests/ui/wonder-atlas-panel.test.ts`:

```ts
it('renders rival activity badge and journal for the current viewer only', () => {
  const state = makeState();
  state.legendaryWonderIntel = {
    player: [
      {
        kind: 'started',
        eventId: 'started:oracle-of-delphi:ai-1:rival-city:41',
        projectKey: 'oracle-of-delphi:ai-1:rival-city',
        wonderId: 'oracle-of-delphi',
        civId: 'ai-1',
        civName: 'Rival',
        cityId: 'rival-city',
        cityName: 'Rival Harbor',
        revealedTurn: 41,
      },
    ],
    'player-2': [
      {
        kind: 'completed',
        eventId: 'completed:grand-canal:ai-1:58',
        wonderId: 'grand-canal',
        civId: 'ai-1',
        civName: 'Rival',
        completionTurn: 58,
        learnedTurn: 58,
      },
    ],
  };

  const panel = createWonderAtlasPanel(document.body, state, {
    initialWonderId: 'oracle-of-delphi',
    onViewOnMap: () => {},
    onClose: () => {},
  });

  expect(panel.querySelector('[data-rival-intel-badge]')?.textContent).toContain('Known rival activity');
  expect(panel.querySelector('[data-rival-intel-section]')?.textContent).toContain('Spotted rival project');
  expect(panel.querySelector('[data-rival-intel-section]')?.textContent).toContain('Rival Harbor');
  expect(panel.textContent).not.toContain('Grand Canal on turn 58');
  expect(panel.querySelector('[data-codex-action="open-city"]')).toBeNull();
  expect(panel.querySelector('[data-codex-action="view-map"]')).toBeNull();
});

it('rerenders rival intel when reopened for a different hot-seat viewer', () => {
  const state = makeState();
  state.civilizations['player-2'] = {
    ...state.civilizations.player,
    id: 'player-2',
    name: 'Second Player',
    isHuman: true,
    cities: [],
    units: [],
  };
  state.legendaryWonderIntel = {
    player: [
      {
        kind: 'started',
        eventId: 'started:oracle-of-delphi:ai-1:rival-city:41',
        projectKey: 'oracle-of-delphi:ai-1:rival-city',
        wonderId: 'oracle-of-delphi',
        civId: 'ai-1',
        civName: 'Rival',
        cityId: 'rival-city',
        cityName: 'Rival Harbor',
        revealedTurn: 41,
      },
    ],
    'player-2': [
      {
        kind: 'completed',
        eventId: 'completed:grand-canal:ai-1:58',
        wonderId: 'grand-canal',
        civId: 'ai-1',
        civName: 'Rival',
        completionTurn: 58,
        learnedTurn: 58,
      },
    ],
  };

  createWonderAtlasPanel(document.body, state, {
    initialWonderId: 'oracle-of-delphi',
    onViewOnMap: () => {},
    onClose: () => {},
  });
  expect(document.body.textContent).toContain('Rival Harbor');

  state.currentPlayer = 'player-2';
  createWonderAtlasPanel(document.body, state, {
    initialWonderId: 'grand-canal',
    onViewOnMap: () => {},
    onClose: () => {},
  });

  expect(document.querySelectorAll('#wonder-codex-panel')).toHaveLength(1);
  expect(document.body.textContent).toContain('Rival completed Grand Canal on turn 58');
  expect(document.body.textContent).not.toContain('Rival Harbor');
});
```

- [ ] **Step 2: Run UI tests to verify failure**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/wonder-atlas-panel.test.ts
```

Expected: FAIL because the UI does not render badges or journal sections yet.

- [ ] **Step 3: Render catalog badge in `wonder-codex-panel.ts`**

Inside `renderCatalog`, after appending `entry.stateLabel`, add:

```ts
if (entry.rivalIntelCount && entry.rivalIntelBadgeLabel) {
  const badge = appendText(copy, 'span', entry.rivalIntelBadgeLabel, 'display:inline-block;margin-top:5px;padding:2px 6px;border:1px solid rgba(232,193,112,0.36);border-radius:999px;font-size:10px;color:#f4d188;background:rgba(232,193,112,0.10);');
  badge.dataset.rivalIntelBadge = 'true';
}
```

- [ ] **Step 4: Render rival journal in `wonder-codex-page.ts`**

After the status `<ul>` is appended and before action buttons, add:

```ts
if (page.rivalIntel) {
  const rivalIntel = document.createElement('section');
  rivalIntel.dataset.rivalIntelSection = 'true';
  rivalIntel.style.cssText = 'border:1px solid rgba(232,193,112,0.24);border-radius:8px;padding:10px;background:rgba(232,193,112,0.07);display:grid;gap:8px;';
  appendText(rivalIntel, 'h4', 'Known rival activity', 'margin:0;font-size:13px;color:#f4d188;');
  appendText(rivalIntel, 'p', page.rivalIntel.summaryLine, 'margin:0;font-size:12px;line-height:1.45;color:rgba(248,241,223,0.78);');
  const list = document.createElement('ul');
  list.style.cssText = 'margin:0;padding-left:18px;display:grid;gap:4px;font-size:12px;color:rgba(248,241,223,0.74);';
  for (const event of page.rivalIntel.events) {
    const item = document.createElement('li');
    item.dataset.rivalIntelEvent = event.kind;
    item.textContent = `${event.title}: ${event.text}`;
    list.appendChild(item);
  }
  rivalIntel.appendChild(list);
  root.appendChild(rivalIntel);
}
```

- [ ] **Step 5: Run UI tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/wonder-atlas-panel.test.ts
```

Expected: PASS.

- [ ] **Step 6: Run presentation tests again**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/wonder-codex/presentation.test.ts tests/systems/wonder-atlas-presentation.test.ts tests/ui/wonder-atlas-panel.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit Task 5**

Run:

```bash
git add src/ui/wonder-codex-panel.ts src/ui/wonder-codex-page.ts tests/ui/wonder-atlas-panel.test.ts
git commit -m "feat(wonders): render rival atlas intel journal"
```

---

## Task 6: Regression Sweep And Architecture Review Fixes

**Files:**
- Modify only files touched by review findings.
- Test all changed areas.

- [ ] **Step 1: Run source rule check**

Run with every changed `src` file:

```bash
scripts/check-src-rule-violations.sh src/core/types.ts src/systems/legendary-wonder-intel.ts src/systems/legendary-wonder-system.ts src/systems/legendary-wonder-intel-presentation.ts src/systems/wonder-atlas-presentation.ts src/systems/wonder-codex/presentation.ts src/ui/wonder-codex-panel.ts src/ui/wonder-codex-page.ts
```

Expected: PASS with no rule violations.

- [ ] **Step 2: Run focused tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/legendary-wonder-system.test.ts tests/storage/save-persistence.test.ts tests/systems/wonder-atlas-presentation.test.ts tests/systems/wonder-codex/presentation.test.ts tests/ui/wonder-atlas-panel.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run wonder regressions**

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

Expected: PASS. This is the TypeScript correctness gate.

- [ ] **Step 5: Run full tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test
```

Expected: PASS.

- [ ] **Step 6: Inspect committed and uncommitted diffs**

Run:

```bash
git diff --stat origin/main...HEAD
git diff --stat
git diff origin/main...HEAD -- src/core/types.ts src/systems/legendary-wonder-intel.ts src/systems/legendary-wonder-system.ts src/systems/legendary-wonder-intel-presentation.ts src/systems/wonder-atlas-presentation.ts src/systems/wonder-codex/presentation.ts src/ui/wonder-codex-panel.ts src/ui/wonder-codex-page.ts tests/systems/legendary-wonder-system.test.ts tests/storage/save-persistence.test.ts tests/systems/wonder-atlas-presentation.test.ts tests/systems/wonder-codex/presentation.test.ts tests/ui/wonder-atlas-panel.test.ts
git diff
```

Expected:

- branch diff includes only the Stage 2F design, plan, implementation, and tests
- uncommitted diff is empty before PR creation
- no rival city IDs, hidden completed city IDs, reward summaries, progress values, quest steps, or action targets leak into rival presentation view models

- [ ] **Step 7: Commit review fixes if any**

If review finds fixes, make them and run the smallest affected test. Then commit:

```bash
git add src/core/types.ts src/systems/legendary-wonder-intel.ts src/systems/legendary-wonder-system.ts src/systems/legendary-wonder-intel-presentation.ts src/systems/wonder-atlas-presentation.ts src/systems/wonder-codex/presentation.ts src/ui/wonder-codex-panel.ts src/ui/wonder-codex-page.ts tests/systems/legendary-wonder-system.test.ts tests/storage/save-persistence.test.ts tests/systems/wonder-atlas-presentation.test.ts tests/systems/wonder-codex/presentation.test.ts tests/ui/wonder-atlas-panel.test.ts
git commit -m "fix(wonders): address atlas intel review findings"
```

- [ ] **Step 8: Push and open PR**

Run:

```bash
git push -u origin codex/stage-2f-atlas-intel-records
gh pr create --base main --head codex/stage-2f-atlas-intel-records --title "feat(wonders): add atlas intel records" --body "## Summary
- add viewer-scoped rival legendary wonder intel records for started and completed events
- render safe Atlas/Codex rival activity badges and journal rows
- preserve historical started intel without reading hidden rival state

## Tests
- ./scripts/run-with-mise.sh yarn test --run tests/systems/legendary-wonder-system.test.ts tests/storage/save-persistence.test.ts tests/systems/wonder-atlas-presentation.test.ts tests/systems/wonder-codex/presentation.test.ts tests/ui/wonder-atlas-panel.test.ts
- ./scripts/run-wonder-regressions.sh
- ./scripts/run-with-mise.sh yarn build
- ./scripts/run-with-mise.sh yarn test

## Privacy
- rival Atlas/Codex pages read only viewer-scoped legendaryWonderIntel
- completed rival intel records owner and turn only
- hot-seat viewers do not share rival records"
```

Expected: branch pushes and PR opens.

## Plan Self-Review Notes

- Spec coverage:
  - Viewer-scoped discriminated intel ledger: Tasks 1 and 2.
  - Started intel preservation after cleanup: Task 1.
  - Completed intel for known human viewers: Task 2.
  - No hidden rival state in presentation: Tasks 3 and 4.
  - Catalog badge/count and page journal: Tasks 4 and 5.
  - Owned status precedence: Tasks 3 and 4.
  - Hot-seat privacy and current-player refresh: Task 5.
  - Persistence and legacy compatibility: Task 1.
  - Verification and regression sweep: Task 6.
- Placeholder scan:
  - The plan contains no `TBD`, `TODO`, or open-ended implementation placeholders.
- Type consistency:
  - `LegendaryWonderIntelEntry` includes legacy and new records.
  - `NormalizedLegendaryWonderIntelEntry` is the internal safe union used by helpers.
  - `rivalIntelCount`, `rivalIntelBadgeLabel`, and `rivalIntel` are used consistently across presentation and UI.
- Regression focus:
  - Existing owned reward/status/action behavior remains separate from rival intel.
  - Started city names can render as text, but city IDs/actions cannot leak.
  - Completed-only rival intel cannot reveal reward, host city, or map action.
