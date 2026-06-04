# Stage 2J Legendary Landmark Intel Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. For this repo and user, execute inline with `superpowers:executing-plans`; do not dispatch subagents unless the user explicitly authorizes them.

**Goal:** Add explicit host/location rival intel so known-rival landmark previews and map markers render only from paired viewer-scoped location and completion records.

**Architecture:** Keep privacy rules in system and presentation helpers. Add one new discriminated intel union member, mint it only in the canonical stationed-spy start-build path, then pair it with existing completed intel before producing finished landmark previews or map entries. The UI and renderer consume safe view models and never inspect hidden rival projects, hidden completions, or rival city objects to enrich missing intel.

**Tech Stack:** TypeScript, Vitest, Canvas 2D city render passes, DOM UI helpers, existing legendary wonder metadata/rendering catalog, repo verification scripts.

---

## Source Contract

- Design spec: `docs/superpowers/specs/2026-06-04-stage-2j-legendary-landmark-intel-visibility-design.md`
- Existing architecture to preserve:
  - `src/systems/legendary-wonder-intel.ts` owns normalization, sanitization, construction, and dedupe.
  - `src/systems/legendary-wonder-intel-presentation.ts` owns rival summary copy and safe event views.
  - `src/systems/legendary-wonder-landmark-presentation.ts` owns landmark preview conversion.
  - `src/systems/legendary-wonder-map-presentation.ts` owns map-safe landmark entries.
  - `src/renderer/city-renderer.ts` and `src/renderer/city-render-passes.ts` own layer placement, not intel decisions.
  - `src/ui/wonder-codex-page.ts` and `src/ui/territory-inspection-panel.ts` render prepared view models.

## File Structure

- Modify: `src/core/types.ts`
  - Add `LegendaryWonderHostLocationIntelEntry`.
  - Extend `LegendaryWonderIntelKind`, `LegendaryWonderIntelEntry`, and `NormalizedLegendaryWonderIntelEntry`.
- Modify: `src/systems/legendary-wonder-intel.ts`
  - Normalize and sanitize host-location records.
  - Reject malformed coordinates, unknown wonders, missing snapshot labels, and self-rival records.
  - Add `createHostLocationLegendaryWonderIntelEntry`.
- Create: `tests/systems/legendary-wonder-intel.test.ts`
  - Move focused intel coverage out of the large legendary wonder system test surface.
- Modify: `src/systems/legendary-wonder-system.ts`
  - Record host-location intel beside existing started intel when a stationed spy observes a rival legendary start.
- Modify: `tests/systems/legendary-wonder-system.test.ts`
  - Prove the stationed-spy source creates both records and never grants self or missing-host records.
- Modify: `src/systems/legendary-wonder-intel-presentation.ts`
  - Add safe host-location event and summary support without city action IDs.
- Modify: `src/systems/legendary-wonder-landmark-presentation.ts`
  - Add known-rival landmark preview views sourced from paired host-location plus completed records and static metadata.
- Modify: `src/systems/wonder-codex/presentation.ts`
  - Add `knownRivalLandmarkPreview` to legendary Codex pages.
  - Keep owned `landmarkPreview` primary.
- Modify: `tests/systems/wonder-codex/presentation.test.ts`
  - Cover completed-only, started-only, host-location-only, paired host-location plus completed, hot-seat, and no hidden live enrichment cases.
- Modify: `src/ui/wonder-codex-page.ts`
  - Render compact `Known rival landmark` preview from the new page view model only.
- Modify: `tests/ui/wonder-codex-page.test.ts`
  - Cover visible copy and absence of rival actions.
- Modify: `src/systems/legendary-wonder-map-presentation.ts`
  - Add known-rival map entries from paired completed-plus-location intel, explicit stored coordinates, and viewer visibility.
- Modify: `tests/systems/legendary-wonder-map-presentation.test.ts`
  - Cover host-location, fog, unexplored, and partial intel negatives.
- Modify: `src/renderer/city-renderer.ts`
  - Group legendary entries by coordinate, support landmark-only projections for known rival locations without live city state, and preserve pass ordering.
- Modify: `src/renderer/city-render-passes.ts`
  - Allow a `landmark-only` projection mode where only the landmark pass draws.
- Modify: `tests/renderer/city-renderer.test.ts`
  - Cover known-rival landmark drawing and no ghost/status/production leakage.
- Modify: `src/ui/territory-inspection-panel.ts`
  - Render known-rival landmark copy for the inspected coordinate from safe presentation data only.
- Modify: `tests/ui/territory-inspection-panel.test.ts`
  - Cover matching coordinate, viewer scoping, and started/completed/host-location-only negatives.

## Player Truth Table

| Before | Player action | Internal state used | Immediate visible result | Must remain hidden |
|---|---|---|---|---|
| Codex shows completed rival intel only | Open legendary page | `completed` intel record only | `Known rival completed` text row | host city, coordinate, map marker, preview, reward, progress, city action |
| Codex shows started rival intel only | Open legendary page | `started` intel record only | event row names stored city as historical text | coordinate, preview, map marker, live city lookup, city action |
| Codex has host-location rival intel only | Open legendary page | `host-location-known` record and metadata catalog | known-host event/copy with stored city name and learned turn | landmark preview, reward, quest steps, production, progress, rival `cityId` action target |
| Codex has host-location plus completed rival intel | Open legendary page | paired `host-location-known` and `completed` records | `Known rival landmark` preview with stored city name and learned turn | reward, quest steps, production, progress, rival `cityId` action target |
| Map has paired completed-plus-location intel at visible coordinate | Pan camera over coordinate | map entry from paired records and stored coordinate | medallion landmark glyph renders below labels/badges | active construction ghost, live production badge, hidden rival project data |
| Map has paired completed-plus-location intel at fog coordinate | Pan camera over coordinate | stored coordinate and viewer fog knowledge | landmark glyph renders as remembered completed landmark intel | live rival city population, current production, current status |
| Map has host-location rival intel at unexplored coordinate | Pan camera over coordinate | sanitized intel plus viewer visibility | no marker | all host/location visual output |
| Hot-seat viewer changes | Open Codex or render map as another player | `state.legendaryWonderIntel[viewerId]` only | previous viewer's rows and markers disappear | previous viewer's host city and map marker |

## Misleading UI Risks

- `Known rival landmark` must mean both `host-location-known` and `completed` records exist for the same viewer, wonder, and rival.
- Host-location-only intel must remain known-host text, not a finished landmark promise.
- `Spotted rival project` must not imply map location; only the event text may name the stored city.
- `Known rival completed` must not imply host city or reward visibility.
- Owned preview and owned actions must remain primary when owned state and rival location intel coexist.
- Negative tests must prove completed-only, started-only, and host-location-only records cannot produce `knownRivalLandmarkPreview` or known-rival map entries.

## Interaction Replay Checklist

- Open a Codex page with started-plus-location rival intel and verify only known-host copy appears.
- Reopen the page after adding completed intel and verify the completed landmark preview appears from the new view model.
- Open a Codex page with host-location intel as viewer A, then rerender as viewer B and verify host/location copy disappears.
- Inspect a tile with matching host-location intel, then inspect a neighboring tile and verify the known-rival line disappears.
- Render the city pass with known-rival map entries twice and verify landmark operations are stable and do not create production or status badge operations.
- No queue, ETA, reorder, remove, or repeat-click workflows are introduced in this slice.

## Audio, SFX, PWA, And Attribution Guardrail

This slice does not add or modify audio files, SFX triggers, source media, service workers, web manifest files, platform code, or Tauri configuration. Code review must still confirm no changed file enters `src/audio/**`, `public/audio/**`, `public/manifest*`, `src/platform/**`, `src-tauri/**`, or source-attribution catalogs.

## Task 1: Typed Host-Location Intel

**Files:**
- Modify: `src/core/types.ts`
- Modify: `src/systems/legendary-wonder-intel.ts`
- Create: `tests/systems/legendary-wonder-intel.test.ts`

- [ ] **Step 1: Write failing intel normalization tests**

Create `tests/systems/legendary-wonder-intel.test.ts` with these tests:

```ts
import { describe, expect, it } from 'vitest';
import {
  createHostLocationLegendaryWonderIntelEntry,
  getLegendaryWonderIntelForViewer,
  recordLegendaryWonderIntel,
  sanitizeLegendaryWonderIntel,
} from '@/systems/legendary-wonder-intel';
import { makeLegendaryWonderFixture } from './helpers/legendary-wonder-fixture';

describe('legendary-wonder-intel host-location records', () => {
  it('normalizes host-location records with stored coordinate snapshots', () => {
    const state = makeLegendaryWonderFixture();
    state.legendaryWonderIntel = {
      player: [{
        kind: 'host-location-known',
        eventId: 'location:oracle-of-delphi:rival:city-rival:41',
        wonderId: 'oracle-of-delphi',
        civId: 'rival',
        civName: 'Rival',
        cityId: 'city-rival',
        cityName: 'Rival Harbor',
        coord: { q: 4, r: 2 },
        learnedTurn: 41,
        source: 'spy-location',
      }],
    };

    expect(getLegendaryWonderIntelForViewer(state, 'player')).toEqual([
      expect.objectContaining({
        kind: 'host-location-known',
        eventId: 'location:oracle-of-delphi:rival:city-rival:41',
        cityName: 'Rival Harbor',
        coord: { q: 4, r: 2 },
      }),
    ]);
  });

  it('sanitizes malformed host-location records and self-rival records', () => {
    const state = makeLegendaryWonderFixture();
    state.legendaryWonderIntel = {
      player: [
        {
          kind: 'host-location-known',
          eventId: 'location:unknown:rival:city-rival:41',
          wonderId: 'unknown',
          civId: 'rival',
          civName: 'Rival',
          cityId: 'city-rival',
          cityName: 'Rival Harbor',
          coord: { q: 4, r: 2 },
          learnedTurn: 41,
          source: 'spy-location',
        },
        {
          kind: 'host-location-known',
          eventId: 'location:oracle-of-delphi:player:city-river:41',
          wonderId: 'oracle-of-delphi',
          civId: 'player',
          civName: 'Player',
          cityId: 'city-river',
          cityName: 'River City',
          coord: { q: 2, r: 2 },
          learnedTurn: 41,
          source: 'spy-location',
        },
        {
          kind: 'host-location-known',
          eventId: 'location:oracle-of-delphi:rival:bad-city:41',
          wonderId: 'oracle-of-delphi',
          civId: 'rival',
          civName: 'Rival',
          cityId: 'bad-city',
          cityName: '',
          coord: { q: Number.NaN, r: 2 },
          learnedTurn: 41,
          source: 'spy-location',
        },
      ],
    };

    expect(sanitizeLegendaryWonderIntel(state)).toEqual({});
  });

  it('dedupes exact host-location event IDs while preserving distinct intel tiers', () => {
    const state = makeLegendaryWonderFixture();
    const started = {
      kind: 'started' as const,
      eventId: 'started:oracle-of-delphi:rival:city-rival:41',
      projectKey: 'oracle-of-delphi:rival:city-rival',
      wonderId: 'oracle-of-delphi',
      civId: 'rival',
      civName: 'Rival',
      cityId: 'city-rival',
      cityName: 'Rival Harbor',
      revealedTurn: 41,
    };
    const location = createHostLocationLegendaryWonderIntelEntry({
      projectKey: 'oracle-of-delphi:rival:city-rival',
      wonderId: 'oracle-of-delphi',
      civId: 'rival',
      civName: 'Rival',
      cityId: 'city-rival',
      cityName: 'Rival Harbor',
      coord: { q: 4, r: 2 },
      learnedTurn: 41,
      source: 'spy-location',
    });
    const first = recordLegendaryWonderIntel(state, 'player', started);
    const second = recordLegendaryWonderIntel({ ...state, legendaryWonderIntel: first }, 'player', location);
    const third = recordLegendaryWonderIntel({ ...state, legendaryWonderIntel: second }, 'player', location);

    expect(third.player.map(entry => entry.kind)).toEqual(['started', 'host-location-known']);
  });

  it('keeps legacy started records text-only and distinct from host-location records', () => {
    const state = makeLegendaryWonderFixture();
    state.legendaryWonderIntel = {
      player: [{
        projectKey: 'oracle-of-delphi:rival:city-rival',
        wonderId: 'oracle-of-delphi',
        civId: 'rival',
        civName: 'Rival',
        cityId: 'city-rival',
        cityName: 'Rival Harbor',
        revealedTurn: 41,
        intelLevel: 'started',
      }],
    };

    expect(getLegendaryWonderIntelForViewer(state, 'player')[0]).toMatchObject({
      kind: 'started',
      cityName: 'Rival Harbor',
    });
  });
});
```

- [ ] **Step 2: Run the failing intel tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/legendary-wonder-intel.test.ts
```

Expected: FAIL because `createHostLocationLegendaryWonderIntelEntry` and the `host-location-known` union member do not exist.

- [ ] **Step 3: Add host-location types**

In `src/core/types.ts`, replace the current intel type block with:

```ts
export type LegendaryWonderIntelKind = 'started' | 'completed' | 'host-location-known';

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

export interface LegendaryWonderHostLocationIntelEntry {
  kind: 'host-location-known';
  eventId: string;
  wonderId: string;
  civId: string;
  civName: string;
  cityId: string;
  cityName: string;
  coord: HexCoord;
  learnedTurn: number;
  source: 'spy-location' | 'map-intel' | 'debug-grant';
}

export type LegendaryWonderIntelEntry =
  | LegacyLegendaryWonderStartedIntelEntry
  | LegendaryWonderStartedIntelEntry
  | LegendaryWonderCompletedIntelEntry
  | LegendaryWonderHostLocationIntelEntry;

export type NormalizedLegendaryWonderIntelEntry =
  | LegendaryWonderStartedIntelEntry
  | LegendaryWonderCompletedIntelEntry
  | LegendaryWonderHostLocationIntelEntry;
```

- [ ] **Step 4: Add normalization, sanitization, and construction helpers**

In `src/systems/legendary-wonder-intel.ts`:

```ts
import type {
  GameState,
  HexCoord,
  LegendaryWonderCompletedIntelEntry,
  LegendaryWonderHostLocationIntelEntry,
  LegendaryWonderIntelEntry,
  LegendaryWonderStartedIntelEntry,
  NormalizedLegendaryWonderIntelEntry,
} from '@/core/types';
```

Add helpers near the existing event ID helpers:

```ts
function hostLocationEventId(projectKey: string, learnedTurn: number): string {
  return `location:${projectKey}:${learnedTurn}`;
}

function isValidCoord(coord: HexCoord | undefined): coord is HexCoord {
  return !!coord && Number.isFinite(coord.q) && Number.isFinite(coord.r);
}
```

Add this branch to `normalizeLegendaryWonderIntelEntry` before the legacy `intelLevel` branch:

```ts
  if (entry.kind === 'host-location-known') {
    if (!getLegendaryWonderDefinition(entry.wonderId)) return null;
    if (!entry.eventId || !entry.civId || !entry.civName || !entry.cityId || !entry.cityName) return null;
    if (!isValidCoord(entry.coord)) return null;
    if (entry.source !== 'spy-location' && entry.source !== 'map-intel' && entry.source !== 'debug-grant') return null;
    return {
      ...entry,
      coord: { ...entry.coord },
    };
  }
```

Update `sanitizeLegendaryWonderIntel` so it rejects self-rival records while iterating each viewer:

```ts
          const safeEntry = normalizeLegendaryWonderIntelEntry(entry);
          if (!safeEntry || safeEntry.civId === viewerId || seen.has(safeEntry.eventId)) continue;
```

Add the constructor after `createCompletedLegendaryWonderIntelEntry`:

```ts
export function createHostLocationLegendaryWonderIntelEntry(input: {
  projectKey: string;
  wonderId: string;
  civId: string;
  civName: string;
  cityId: string;
  cityName: string;
  coord: HexCoord;
  learnedTurn: number;
  source: LegendaryWonderHostLocationIntelEntry['source'];
}): LegendaryWonderHostLocationIntelEntry {
  return {
    kind: 'host-location-known',
    eventId: hostLocationEventId(input.projectKey, input.learnedTurn),
    wonderId: input.wonderId,
    civId: input.civId,
    civName: input.civName,
    cityId: input.cityId,
    cityName: input.cityName,
    coord: { ...input.coord },
    learnedTurn: input.learnedTurn,
    source: input.source,
  };
}
```

- [ ] **Step 5: Run intel tests until they pass**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/legendary-wonder-intel.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit typed intel work**

Run:

```bash
git add src/core/types.ts src/systems/legendary-wonder-intel.ts tests/systems/legendary-wonder-intel.test.ts
git commit -m "feat(wonders): add host location landmark intel"
```

## Task 2: Stationed-Spy Grant Path

**Files:**
- Modify: `src/systems/legendary-wonder-system.ts`
- Modify: `tests/systems/legendary-wonder-system.test.ts`

- [ ] **Step 1: Write failing grant-path tests**

Append these tests near the existing stationed-spy start intel tests in `tests/systems/legendary-wonder-system.test.ts`:

```ts
  it('records host-location intel when a stationed spy observes a rival legendary start', () => {
    const state = makeLegendaryWonderFixture({ oracleStepsCompleted: 2, resources: ['stone'] });
    state.turn = 41;
    state.civilizations.player.knownCivilizations = ['rival'];
    state.civilizations.rival.knownCivilizations = ['player'];
    state.legendaryWonderProjects = {
      'oracle-of-delphi:rival:city-rival': {
        wonderId: 'oracle-of-delphi',
        ownerId: 'rival',
        cityId: 'city-rival',
        phase: 'ready_to_build',
        investedProduction: 0,
        transferableProduction: 0,
        questSteps: [],
      },
    };
    state.cities['city-rival'] = {
      ...state.cities['city-rival'],
      name: 'Rival Harbor',
      productionQueue: [],
      productionProgress: 12,
    };
    state.espionage = {
      player: {
        spies: {
          spy1: {
            id: 'spy1',
            name: 'Watcher',
            owner: 'player',
            unitType: 'spy_scout',
            status: 'stationed',
            targetCivId: 'rival',
            targetCityId: 'city-rival',
            position: state.cities['city-rival'].position,
            experience: 0,
            currentMission: null,
            cooldownTurns: 0,
            promotionAvailable: false,
          },
        },
        maxSpies: 1,
        counterIntelligence: {},
      },
    };

    const result = startLegendaryWonderBuild(state, 'rival', 'city-rival', 'oracle-of-delphi');

    expect(result.legendaryWonderIntel?.player).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'started', cityName: 'Rival Harbor' }),
      expect.objectContaining({
        kind: 'host-location-known',
        wonderId: 'oracle-of-delphi',
        civId: 'rival',
        cityName: 'Rival Harbor',
        coord: state.cities['city-rival'].position,
        learnedTurn: 41,
        source: 'spy-location',
      }),
    ]));
  });

  it('does not record host-location intel for the builder or when the host city is missing', () => {
    const state = makeLegendaryWonderFixture({ oracleStepsCompleted: 2, resources: ['stone'] });
    state.turn = 41;
    state.legendaryWonderProjects = {
      'oracle-of-delphi:rival:missing-city': {
        wonderId: 'oracle-of-delphi',
        ownerId: 'rival',
        cityId: 'missing-city',
        phase: 'ready_to_build',
        investedProduction: 0,
        transferableProduction: 0,
        questSteps: [],
      },
    };
    state.espionage = {
      rival: {
        spies: {
          selfSpy: {
            id: 'selfSpy',
            name: 'Self',
            owner: 'rival',
            unitType: 'spy_scout',
            status: 'stationed',
            targetCivId: 'rival',
            targetCityId: 'missing-city',
            position: { q: 0, r: 0 },
            experience: 0,
            currentMission: null,
            cooldownTurns: 0,
            promotionAvailable: false,
          },
        },
        maxSpies: 1,
        counterIntelligence: {},
      },
    };

    const result = startLegendaryWonderBuild(state, 'rival', 'missing-city', 'oracle-of-delphi');

    expect(result.legendaryWonderIntel?.rival).toBeUndefined();
  });
```

- [ ] **Step 2: Run the failing system test file**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/legendary-wonder-system.test.ts
```

Expected: FAIL because start build records only `started` intel.

- [ ] **Step 3: Record host-location intel in the canonical start path**

In `src/systems/legendary-wonder-system.ts`, add `createHostLocationLegendaryWonderIntelEntry` to the import from `legendary-wonder-intel`.

Inside the stationed-spy observer block in `startLegendaryWonderBuild`, immediately after recording `createStartedLegendaryWonderIntelEntry`, add:

```ts
    if (city) {
      legendaryWonderIntel = recordLegendaryWonderIntel(
        {
          ...seededState,
          legendaryWonderIntel,
        },
        observerId,
        createHostLocationLegendaryWonderIntelEntry({
          projectKey,
          wonderId: project.wonderId,
          civId,
          civName: civilization ? civilization.name : civId,
          cityId,
          cityName: city.name,
          coord: city.position,
          learnedTurn: state.turn,
          source: 'spy-location',
        }),
      );
    }
```

- [ ] **Step 4: Run system tests until they pass**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/legendary-wonder-system.test.ts tests/systems/legendary-wonder-intel.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the grant path**

Run:

```bash
git add src/systems/legendary-wonder-system.ts tests/systems/legendary-wonder-system.test.ts
git commit -m "feat(wonders): record legendary host location intel"
```

## Task 3: Safe Rival Location Presentation And Codex Model

**Files:**
- Modify: `src/systems/legendary-wonder-intel-presentation.ts`
- Modify: `src/systems/legendary-wonder-landmark-presentation.ts`
- Modify: `src/systems/wonder-codex/presentation.ts`
- Modify: `tests/systems/wonder-codex/presentation.test.ts`

- [ ] **Step 1: Write failing presentation tests**

Add these tests to `tests/systems/wonder-codex/presentation.test.ts`:

```ts
  it('keeps host-location-only rival intel as known-host text without landmark preview', () => {
    const state = makeState();
    state.legendaryWonderIntel = {
      player: [{
        kind: 'host-location-known',
        eventId: 'location:oracle-of-delphi:ai-1:rival-city:62',
        wonderId: 'oracle-of-delphi',
        civId: 'ai-1',
        civName: 'Rival',
        cityId: 'rival-city',
        cityName: 'Rival Harbor',
        coord: { q: 4, r: 2 },
        learnedTurn: 62,
        source: 'spy-location',
      }],
    };

    const model = getWonderCodexViewModel(state, 'player', { initialWonderId: 'oracle-of-delphi' });
    const serialized = JSON.stringify(model.selectedPage);

    expect(model.selectedPage?.stateLabel).toBe('Known rival host');
    expect(model.selectedPage?.knownRivalLandmarkPreview).toBeUndefined();
    expect(model.selectedPage?.rivalIntel?.summaryLine).toContain('Known host: Rival Harbor');
    expect(serialized).not.toContain('"cityId":"rival-city"');
    expect(serialized).not.toContain('Reward:');
    expect(model.selectedPage?.actions).toEqual([]);
  });

  it('adds known-rival landmark preview only from paired host-location and completed intel', () => {
    const state = makeState();
    state.legendaryWonderIntel = {
      player: [
        {
          kind: 'host-location-known',
          eventId: 'location:oracle-of-delphi:ai-1:rival-city:62',
          wonderId: 'oracle-of-delphi',
          civId: 'ai-1',
          civName: 'Rival',
          cityId: 'rival-city',
          cityName: 'Rival Harbor',
          coord: { q: 4, r: 2 },
          learnedTurn: 62,
          source: 'spy-location',
        },
        {
          kind: 'completed',
          eventId: 'completed:oracle-of-delphi:ai-1:70',
          wonderId: 'oracle-of-delphi',
          civId: 'ai-1',
          civName: 'Rival',
          completionTurn: 70,
          learnedTurn: 70,
        },
      ],
    };

    const model = getWonderCodexViewModel(state, 'player', { initialWonderId: 'oracle-of-delphi' });
    const serialized = JSON.stringify(model.selectedPage);

    expect(model.selectedPage?.stateLabel).toBe('Known rival completed');
    expect(model.selectedPage?.knownRivalLandmarkPreview).toMatchObject({
      cityName: 'Rival Harbor',
      learnedTurn: 62,
      items: [{ wonderId: 'oracle-of-delphi', label: 'Oracle of Delphi', state: 'completed' }],
    });
    expect(serialized).not.toContain('"cityId":"rival-city"');
    expect(serialized).not.toContain('Reward:');
    expect(model.selectedPage?.actions).toEqual([]);
  });

  it('does not enrich completed-only rival intel from hidden rival city state', () => {
    const state = makeState();
    state.cities['hidden-city'] = {
      ...state.cities[Object.keys(state.cities)[0]],
      id: 'hidden-city',
      name: 'Hidden Harbor',
      owner: 'ai-1',
      position: { q: 4, r: 2 },
    };
    state.completedLegendaryWonders = {
      'oracle-of-delphi': { ownerId: 'ai-1', cityId: 'hidden-city', turnCompleted: 58 },
    };
    state.legendaryWonderIntel = {
      player: [{
        kind: 'completed',
        eventId: 'completed:oracle-of-delphi:ai-1:58',
        wonderId: 'oracle-of-delphi',
        civId: 'ai-1',
        civName: 'Rival',
        completionTurn: 58,
        learnedTurn: 58,
      }],
    };

    const model = getWonderCodexViewModel(state, 'player', { initialWonderId: 'oracle-of-delphi' });
    const serialized = JSON.stringify(model.selectedPage);

    expect(model.selectedPage?.knownRivalLandmarkPreview).toBeUndefined();
    expect(serialized).not.toContain('Hidden Harbor');
    expect(serialized).not.toContain('"cityId":"hidden-city"');
  });

  it('keeps host-location intel scoped to the current hot-seat viewer', () => {
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
      player: [{
        kind: 'host-location-known',
        eventId: 'location:oracle-of-delphi:ai-1:rival-city:62',
        wonderId: 'oracle-of-delphi',
        civId: 'ai-1',
        civName: 'Rival',
        cityId: 'rival-city',
        cityName: 'Rival Harbor',
        coord: { q: 4, r: 2 },
        learnedTurn: 62,
        source: 'spy-location',
      }],
    };

    const viewerA = getWonderCodexViewModel(state, 'player', { initialWonderId: 'oracle-of-delphi' });
    const viewerB = getWonderCodexViewModel(state, 'player-2', { initialWonderId: 'oracle-of-delphi' });

    expect(viewerA.selectedPage?.rivalIntel?.summaryLine).toContain('Known host: Rival Harbor');
    expect(viewerA.selectedPage?.knownRivalLandmarkPreview).toBeUndefined();
    expect(viewerB.catalogEntries.some(entry => entry.id === 'oracle-of-delphi')).toBe(false);
    expect(viewerB.selectedPage).toBeNull();
  });
```

- [ ] **Step 2: Run failing Codex presentation tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/wonder-codex/presentation.test.ts
```

Expected: FAIL because host-location presentation and `knownRivalLandmarkPreview` do not exist.

- [ ] **Step 3: Add safe host-location presentation types**

In `src/systems/legendary-wonder-intel-presentation.ts`, update the label and event types:

```ts
export type LegendaryWonderRivalIntelStateLabel =
  | 'Known rival completed'
  | 'Spotted rival project'
  | 'Known rival host';

export interface LegendaryWonderRivalIntelEventView {
  id: string;
  kind: 'started' | 'completed' | 'host-location-known';
  civId: string;
  civName: string;
  turn: number;
  title: string;
  text: string;
}

export interface LegendaryWonderRivalHostLocationView {
  id: string;
  wonderId: string;
  civId: string;
  civName: string;
  cityName: string;
  coord: HexCoord;
  learnedTurn: number;
}
```

Import `HexCoord` from `@/core/types`. Update `eventView`, `bestState`, and `summaryLine` so a host-location record renders without implying completion:

```ts
  if (entry.kind === 'host-location-known') {
    return {
      id: entry.eventId,
      kind: 'host-location-known',
      civId: entry.civId,
      civName: entry.civName,
      turn: entry.learnedTurn,
      title: 'Known rival host',
      text: `${entry.civName} location for ${name}: ${entry.cityName}. Location learned on turn ${entry.learnedTurn}.`,
    };
  }
```

Use this priority:

```ts
function bestState(events: LegendaryWonderRivalIntelEventView[]): LegendaryWonderRivalIntelStateLabel {
  if (events.some(event => event.kind === 'completed')) return 'Known rival completed';
  if (events.some(event => event.kind === 'started')) return 'Spotted rival project';
  if (events.some(event => event.kind === 'host-location-known')) return 'Known rival host';
  return 'Spotted rival project';
}
```

Update `summaryLine` so completed status remains primary, started status remains a construction clue, and host-only intel is useful but not celebratory:

```ts
  const location = [...events].reverse().find(event => event.kind === 'host-location-known');
  if (completed) {
    return location
      ? `Known rival completed: ${completed.text} Known host: ${location.text}`
      : `Known rival completed: ${completed.text}`;
  }

  const started = [...events].reverse().find(event => event.kind === 'started');
  if (started) {
    return location
      ? `Last known: under construction. ${started.text} Known host: ${location.text}`
      : `Last known: under construction. ${started.text}`;
  }

  if (location) {
    return `Known host: ${location.text}`;
  }
```

Add a safe location selector:

```ts
export function getLegendaryWonderHostLocationIntelForViewer(
  state: GameState,
  viewerId: string,
  wonderId: string,
): LegendaryWonderRivalHostLocationView[] {
  return getLegendaryWonderIntelForViewer(state, viewerId)
    .filter((entry): entry is Extract<NormalizedLegendaryWonderIntelEntry, { kind: 'host-location-known' }> =>
      entry.kind === 'host-location-known' && entry.wonderId === wonderId,
    )
    .map(entry => ({
      id: entry.eventId,
      wonderId: entry.wonderId,
      civId: entry.civId,
      civName: entry.civName,
      cityName: entry.cityName,
      coord: { ...entry.coord },
      learnedTurn: entry.learnedTurn,
    }))
    .sort((a, b) => b.learnedTurn - a.learnedTurn || a.civName.localeCompare(b.civName) || a.id.localeCompare(b.id));
}
```

- [ ] **Step 4: Add known-rival landmark preview helper**

In `src/systems/legendary-wonder-landmark-presentation.ts`, add:

```ts
import { getLegendaryWonderHostLocationIntelForViewer } from '@/systems/legendary-wonder-intel-presentation';
import { getLegendaryWonderIntelForViewer } from '@/systems/legendary-wonder-intel';
```

Add these interfaces and function:

```ts
export interface KnownRivalLegendaryLandmarkPreviewView {
  cityName: string;
  civName: string;
  learnedTurn: number;
  items: Array<{
    wonderId: string;
    label: string;
    state: 'completed';
  }>;
}

export function getKnownRivalLegendaryLandmarkPreviewForWonder(
  state: GameState,
  viewerId: string,
  wonderId: string,
): KnownRivalLegendaryLandmarkPreviewView | null {
  const completion = getLegendaryWonderIntelForViewer(state, viewerId)
    .find(entry => entry.kind === 'completed' && entry.wonderId === wonderId);
  if (!completion) return null;
  const [location] = getLegendaryWonderHostLocationIntelForViewer(state, viewerId, wonderId)
    .filter(candidate => candidate.civId === completion.civId);
  if (!location) return null;
  return {
    cityName: location.cityName,
    civName: location.civName,
    learnedTurn: location.learnedTurn,
    items: [{
      wonderId,
      label: getLegendaryWonderDefinition(wonderId) ? getLegendaryWonderDefinition(wonderId)!.name : 'Legendary wonder',
      state: 'completed',
    }],
  };
}
```

- [ ] **Step 5: Wire Codex page model**

In `src/systems/wonder-codex/presentation.ts`, import the new type and helper:

```ts
import {
  getKnownRivalLegendaryLandmarkPreviewForWonder,
  getLegendaryLandmarkPreviewViewForCity,
  type KnownRivalLegendaryLandmarkPreviewView,
  type LegendaryWonderLandmarkPreviewView,
} from '@/systems/legendary-wonder-landmark-presentation';
```

Add a field to `WonderCodexPageViewModel`:

```ts
  knownRivalLandmarkPreview?: KnownRivalLegendaryLandmarkPreviewView;
```

In `buildPage`, after computing `landmarkPreview`, compute:

```ts
  const knownRivalLandmarkPreview = entry.kind === 'legendary'
    ? getKnownRivalLegendaryLandmarkPreviewForWonder(state, viewerId, entry.id)
    : null;
```

In the returned object, add:

```ts
    ...(knownRivalLandmarkPreview ? { knownRivalLandmarkPreview } : {}),
```

- [ ] **Step 6: Run Codex presentation tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/wonder-codex/presentation.test.ts tests/systems/legendary-wonder-intel.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit safe presentation work**

Run:

```bash
git add src/systems/legendary-wonder-intel-presentation.ts src/systems/legendary-wonder-landmark-presentation.ts src/systems/wonder-codex/presentation.ts tests/systems/wonder-codex/presentation.test.ts
git commit -m "feat(wonders): present known rival landmark intel"
```

## Task 4: Codex And Inspection UI

**Files:**
- Modify: `src/ui/wonder-codex-page.ts`
- Modify: `tests/ui/wonder-codex-page.test.ts`
- Modify: `src/ui/territory-inspection-panel.ts`
- Modify: `tests/ui/territory-inspection-panel.test.ts`

- [ ] **Step 1: Write failing Codex UI test**

Add this test to `tests/ui/wonder-codex-page.test.ts`:

```ts
  it('renders known-rival landmark preview without rival actions', () => {
    const root = createWonderCodexPage(page({
      id: 'oracle-of-delphi',
      kind: 'legendary',
      title: 'Oracle of Delphi',
      subtitle: 'A sanctuary of prophecy.',
      stateLabel: 'Known rival landmark',
      visual: getWonderVisualDefinition('oracle-of-delphi'),
      actions: [],
      landmarkPreview: undefined,
      knownRivalLandmarkPreview: {
        cityName: 'Rival Harbor',
        civName: 'Rival',
        learnedTurn: 62,
        items: [{
          wonderId: 'oracle-of-delphi',
          label: 'Oracle of Delphi',
          state: 'completed',
        }],
      },
    }), { onAction: vi.fn(), onSelectRelated: vi.fn() });

    expect(root.querySelector('[data-section="known-rival-landmark-preview"]')?.textContent).toContain('Known rival landmark');
    expect(root.textContent).toContain('Rival Harbor');
    expect(root.textContent).toContain('Location learned on turn 62');
    expect(root.querySelector('[data-codex-action="open-city"]')).toBeNull();
    expect(root.querySelector('[data-codex-action="view-map"]')).toBeNull();
  });
```

- [ ] **Step 2: Write failing inspection UI tests**

Add these tests to `tests/ui/territory-inspection-panel.test.ts`:

```ts
  it('mentions known-rival legendary landmarks only on the matching completed known coordinate', () => {
    const state = makeLegendaryWonderFixture({ completedTechs: [], resources: [] });
    const rivalCoord = state.cities['city-rival'].position;
    state.civilizations.player.visibility.tiles[hexKey(rivalCoord)] = 'visible';
    state.legendaryWonderIntel = {
      player: [
        {
          kind: 'host-location-known',
          eventId: 'location:oracle-of-delphi:rival:city-rival:62',
          wonderId: 'oracle-of-delphi',
          civId: 'rival',
          civName: 'Rival',
          cityId: 'city-rival',
          cityName: 'Rival Harbor',
          coord: rivalCoord,
          learnedTurn: 62,
          source: 'spy-location',
        },
        {
          kind: 'completed',
          eventId: 'completed:oracle-of-delphi:rival:70',
          wonderId: 'oracle-of-delphi',
          civId: 'rival',
          civName: 'Rival',
          completionTurn: 70,
          learnedTurn: 70,
        },
      ],
    };

    const matching = createTerritoryInspectionPanel(state, rivalCoord, 'player');
    const nearby = createTerritoryInspectionPanel(state, { q: rivalCoord.q + 1, r: rivalCoord.r }, 'player');

    expect(matching.textContent).toContain('Known rival legendary landmark');
    expect(matching.textContent).toContain('Oracle of Delphi');
    expect(matching.textContent).toContain('Rival Harbor');
    expect(nearby.textContent).not.toContain('Known rival legendary landmark');
  });

  it('does not mention known-rival landmarks from started, completed, or host-location intel alone', () => {
    const state = makeLegendaryWonderFixture({ completedTechs: [], resources: [] });
    const rivalCoord = state.cities['city-rival'].position;
    state.civilizations.player.visibility.tiles[hexKey(rivalCoord)] = 'visible';
    state.legendaryWonderIntel = {
      player: [
        {
          kind: 'started',
          eventId: 'started:oracle-of-delphi:rival:city-rival:41',
          projectKey: 'oracle-of-delphi:rival:city-rival',
          wonderId: 'oracle-of-delphi',
          civId: 'rival',
          civName: 'Rival',
          cityId: 'city-rival',
          cityName: 'Rival Harbor',
          revealedTurn: 41,
        },
        {
          kind: 'host-location-known',
          eventId: 'location:oracle-of-delphi:rival:city-rival:62',
          wonderId: 'oracle-of-delphi',
          civId: 'rival',
          civName: 'Rival',
          cityId: 'city-rival',
          cityName: 'Rival Harbor',
          coord: rivalCoord,
          learnedTurn: 62,
          source: 'spy-location',
        },
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
    };

    const panel = createTerritoryInspectionPanel(state, rivalCoord, 'player');

    expect(panel.textContent).not.toContain('Known rival legendary landmark');
  });
```

- [ ] **Step 3: Run failing UI tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/wonder-codex-page.test.ts tests/ui/territory-inspection-panel.test.ts
```

Expected: FAIL because the DOM sections do not exist.

- [ ] **Step 4: Render known-rival Codex section**

In `src/ui/wonder-codex-page.ts`, after the owned `page.landmarkPreview` section and before rival activity, add:

```ts
  if (page.knownRivalLandmarkPreview) {
    const preview = document.createElement('section');
    preview.dataset.section = 'known-rival-landmark-preview';
    preview.style.cssText = 'border:1px solid rgba(232,193,112,0.24);border-radius:8px;padding:10px;background:rgba(232,193,112,0.07);display:grid;gap:6px;';
    appendText(preview, 'h4', 'Known rival landmark', 'margin:0;font-size:13px;color:#f4d188;');
    appendText(
      preview,
      'p',
      `${page.knownRivalLandmarkPreview.civName} host: ${page.knownRivalLandmarkPreview.cityName}. Location learned on turn ${page.knownRivalLandmarkPreview.learnedTurn}.`,
      'margin:0;font-size:12px;color:rgba(248,241,223,0.74);',
    );
    const list = document.createElement('ul');
    list.style.cssText = 'margin:0;padding-left:18px;display:grid;gap:4px;font-size:12px;color:rgba(248,241,223,0.74);';
    for (const item of page.knownRivalLandmarkPreview.items) {
      const li = document.createElement('li');
      li.dataset.knownRivalLandmarkPreview = item.wonderId;
      li.textContent = `${item.label} — Completed`;
      list.appendChild(li);
    }
    preview.appendChild(list);
    root.appendChild(preview);
  }
```

- [ ] **Step 5: Render inspection known-rival copy from safe helper**

In `src/ui/territory-inspection-panel.ts`, import:

```ts
import { getLegendaryWonderHostLocationIntelForViewer } from '@/systems/legendary-wonder-intel-presentation';
import { getLegendaryWonderIntelForViewer } from '@/systems/legendary-wonder-intel';
import { getLegendaryWonderDefinition } from '@/systems/legendary-wonder-definitions';
```

After the owned completed legendary wonder line, add:

```ts
  const completedRivalKeys = new Set(
    getLegendaryWonderIntelForViewer(state, viewerId)
      .filter(entry => entry.kind === 'completed')
      .map(entry => `${entry.wonderId}:${entry.civId}`),
  );
  const knownRivalAtCoord = getLegendaryWonderHostLocationIntelForViewer(state, viewerId)
    .filter(entry => completedRivalKeys.has(`${entry.wonderId}:${entry.civId}`))
    .filter(entry => hexKey(entry.coord) === key)
    .map(entry => {
      const definition = getLegendaryWonderDefinition(entry.wonderId);
      return `${definition ? definition.name : entry.wonderId} in ${entry.cityName}`;
    });
```

Adjust the helper from Task 3 before using this code so `wonderId` is optional:

```ts
export function getLegendaryWonderHostLocationIntelForViewer(
  state: GameState,
  viewerId: string,
  wonderId?: string,
): LegendaryWonderRivalHostLocationView[] {
  return getLegendaryWonderIntelForViewer(state, viewerId)
    .filter((entry): entry is Extract<NormalizedLegendaryWonderIntelEntry, { kind: 'host-location-known' }> =>
      entry.kind === 'host-location-known' && (!wonderId || entry.wonderId === wonderId),
    )
    .map(entry => ({
      id: entry.eventId,
      wonderId: entry.wonderId,
      civId: entry.civId,
      civName: entry.civName,
      cityName: entry.cityName,
      coord: { ...entry.coord },
      learnedTurn: entry.learnedTurn,
    }))
    .sort((a, b) => b.learnedTurn - a.learnedTurn || a.civName.localeCompare(b.civName) || a.id.localeCompare(b.id));
}
```

Then in `src/ui/territory-inspection-panel.ts` render:

```ts
  if (knownRivalAtCoord.length > 0) {
    addLine(panel, 'Known rival legendary landmark', knownRivalAtCoord.join(', '));
  }
```

- [ ] **Step 6: Run UI tests until they pass**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/wonder-codex-page.test.ts tests/ui/territory-inspection-panel.test.ts tests/systems/wonder-codex/presentation.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit UI work**

Run:

```bash
git add src/ui/wonder-codex-page.ts tests/ui/wonder-codex-page.test.ts src/ui/territory-inspection-panel.ts tests/ui/territory-inspection-panel.test.ts src/systems/legendary-wonder-intel-presentation.ts
git commit -m "feat(wonders): show known rival landmark previews"
```

## Task 5: Map Entries And City Renderer

**Files:**
- Modify: `src/systems/legendary-wonder-map-presentation.ts`
- Modify: `tests/systems/legendary-wonder-map-presentation.test.ts`
- Modify: `src/renderer/city-renderer.ts`
- Modify: `src/renderer/city-render-passes.ts`
- Modify: `tests/renderer/city-renderer.test.ts`

- [ ] **Step 1: Write failing map presentation tests**

Add these tests to `tests/systems/legendary-wonder-map-presentation.test.ts`:

```ts
  it('returns known-rival map entries from paired completed and host-location intel at visible or fog coordinates', () => {
    const state = makeLegendaryWonderFixture({ completedTechs: [], resources: [] });
    const coord = state.cities['city-rival'].position;
    state.civilizations.player.visibility.tiles[hexKey(coord)] = 'visible';
    state.legendaryWonderIntel = {
      player: [
        {
          kind: 'host-location-known',
          eventId: 'location:oracle-of-delphi:rival:city-rival:62',
          wonderId: 'oracle-of-delphi',
          civId: 'rival',
          civName: 'Rival',
          cityId: 'city-rival',
          cityName: 'Rival Harbor',
          coord,
          learnedTurn: 62,
          source: 'spy-location',
        },
        {
          kind: 'completed',
          eventId: 'completed:oracle-of-delphi:rival:70',
          wonderId: 'oracle-of-delphi',
          civId: 'rival',
          civName: 'Rival',
          completionTurn: 70,
          learnedTurn: 70,
        },
      ],
    };

    expect(getLegendaryWonderMapEntries(state, 'player')).toContainEqual(expect.objectContaining({
      wonderId: 'oracle-of-delphi',
      relationship: 'known-rival',
      state: 'completed',
      coord,
      label: 'Oracle of Delphi',
      progressRatio: undefined,
    }));

    state.civilizations.player.visibility.tiles[hexKey(coord)] = 'fog';
    expect(getLegendaryWonderMapEntries(state, 'player')).toContainEqual(expect.objectContaining({
      wonderId: 'oracle-of-delphi',
      relationship: 'known-rival',
      coord,
    }));
  });

  it('does not return known-rival map entries for unexplored, host-location-only, or completed-only intel', () => {
    const state = makeLegendaryWonderFixture({ completedTechs: [], resources: [] });
    const coord = state.cities['city-rival'].position;
    state.civilizations.player.visibility.tiles[hexKey(coord)] = 'visible';
    state.legendaryWonderIntel = {
      player: [
        {
          kind: 'started',
          eventId: 'started:oracle-of-delphi:rival:city-rival:41',
          projectKey: 'oracle-of-delphi:rival:city-rival',
          wonderId: 'oracle-of-delphi',
          civId: 'rival',
          civName: 'Rival',
          cityId: 'city-rival',
          cityName: 'Rival Harbor',
          revealedTurn: 41,
        },
        {
          kind: 'host-location-known',
          eventId: 'location:oracle-of-delphi:rival:city-rival:62',
          wonderId: 'oracle-of-delphi',
          civId: 'rival',
          civName: 'Rival',
          cityId: 'city-rival',
          cityName: 'Rival Harbor',
          coord,
          learnedTurn: 62,
          source: 'spy-location',
        },
        {
          kind: 'completed',
          eventId: 'completed:grand-canal:rival:70',
          wonderId: 'grand-canal',
          civId: 'rival',
          civName: 'Rival',
          completionTurn: 70,
          learnedTurn: 70,
        },
      ],
    };

    expect(getLegendaryWonderMapEntries(state, 'player').some(entry => entry.relationship === 'known-rival')).toBe(false);

    state.legendaryWonderIntel.player.push({
      kind: 'completed',
      eventId: 'completed:oracle-of-delphi:rival:70',
      wonderId: 'oracle-of-delphi',
      civId: 'rival',
      civName: 'Rival',
      completionTurn: 70,
      learnedTurn: 70,
    });
    state.civilizations.player.visibility.tiles[hexKey(coord)] = 'unexplored';
    expect(getLegendaryWonderMapEntries(state, 'player').some(entry => entry.relationship === 'known-rival')).toBe(false);
  });
```

- [ ] **Step 2: Write failing renderer tests**

Add these tests to `tests/renderer/city-renderer.test.ts` near the rival intel renderer tests:

```ts
  it('draws known-rival landmark entries from paired intel without live rival labels or badges', () => {
    const state = createNewGame(undefined, 'known-rival-landmark-render', 'small');
    const coord = { q: 4, r: 2 };
    state.civilizations.player.visibility.tiles[hexKey(coord)] = 'fog';
    state.legendaryWonderIntel = {
      player: [
        {
          kind: 'host-location-known',
          eventId: 'location:oracle-of-delphi:ai-1:rival-city:62',
          wonderId: 'oracle-of-delphi',
          civId: 'ai-1',
          civName: 'Rival',
          cityId: 'rival-city',
          cityName: 'Rival Harbor',
          coord,
          learnedTurn: 62,
          source: 'spy-location',
        },
        {
          kind: 'completed',
          eventId: 'completed:oracle-of-delphi:ai-1:70',
          wonderId: 'oracle-of-delphi',
          civId: 'ai-1',
          civName: 'Rival',
          completionTurn: 70,
          learnedTurn: 70,
        },
      ],
    };

    const ctx = new MockCanvasContext() as unknown as CanvasRenderingContext2D;
    drawCities(ctx, state, makeCamera(), 'player', { nowMs: 1000 });

    expect((ctx as unknown as MockCanvasContext).operations).toContain('legendary-landmarks:start');
    expect((ctx as unknown as MockCanvasContext).operations).toContain('city-pass:landmarks');
    const texts = (ctx as unknown as MockCanvasContext).fillTextCalls.map(call => call.text);
    expect(texts).not.toContain('Rival Harbor (0)');
    expect(texts).not.toContain('🏗️');
    expect(texts).not.toContain('⚡');
  });

  it('does not draw construction ghosts for known-rival location intel', () => {
    const state = createNewGame(undefined, 'known-rival-no-ghost', 'small');
    const coord = { q: 4, r: 2 };
    state.civilizations.player.visibility.tiles[hexKey(coord)] = 'visible';
    state.legendaryWonderIntel = {
      player: [
        {
          kind: 'host-location-known',
          eventId: 'location:oracle-of-delphi:ai-1:rival-city:62',
          wonderId: 'oracle-of-delphi',
          civId: 'ai-1',
          civName: 'Rival',
          cityId: 'rival-city',
          cityName: 'Rival Harbor',
          coord,
          learnedTurn: 62,
          source: 'spy-location',
        },
        {
          kind: 'completed',
          eventId: 'completed:oracle-of-delphi:ai-1:70',
          wonderId: 'oracle-of-delphi',
          civId: 'ai-1',
          civName: 'Rival',
          completionTurn: 70,
          learnedTurn: 70,
        },
      ],
    };

    const entries = getLegendaryWonderMapEntries(state, 'player');

    expect(entries).toContainEqual(expect.objectContaining({
      relationship: 'known-rival',
      state: 'completed',
      progressRatio: undefined,
    }));
  });
```

- [ ] **Step 3: Run failing map and renderer tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/legendary-wonder-map-presentation.test.ts tests/renderer/city-renderer.test.ts
```

Expected: FAIL because known-rival map entries and landmark-only projections do not exist.

- [ ] **Step 4: Add known-rival map entries**

In `src/systems/legendary-wonder-map-presentation.ts`:

```ts
import { hexKey } from '@/systems/hex-utils';
import { getLegendaryWonderDefinition } from '@/systems/legendary-wonder-definitions';
import { getLegendaryWonderHostLocationIntelForViewer } from '@/systems/legendary-wonder-intel-presentation';
import { getLegendaryWonderIntelForViewer } from '@/systems/legendary-wonder-intel';
```

Update `LegendaryWonderMapEntry`:

```ts
export interface LegendaryWonderMapEntry {
  wonderId: string;
  cityId?: string;
  cityName?: string;
  coord: HexCoord;
  ownerId: string;
  relationship: 'owned' | 'known-rival';
  state: LegendaryWonderLandmarkState;
  turnCompleted: number;
  label: string;
  visual: WonderVisualDefinition;
  metadata: LegendaryWonderLandmarkMetadata;
  progressRatio?: number;
}
```

After owned city scanning, append known-rival entries only for paired completed-plus-location records:

```ts
  const completedRivalKeys = new Set(
    getLegendaryWonderIntelForViewer(state, viewerId)
      .filter(entry => entry.kind === 'completed')
      .map(entry => `${entry.wonderId}:${entry.civId}`),
  );
  const seenKnownRival = new Set<string>();
  for (const location of getLegendaryWonderHostLocationIntelForViewer(state, viewerId)) {
    if (!completedRivalKeys.has(`${location.wonderId}:${location.civId}`)) continue;
    const tileVisibility = getVisibility(visibility, location.coord);
    if (tileVisibility === 'unexplored') continue;
    const key = `${location.wonderId}:${location.civId}:${hexKey(location.coord)}`;
    if (seenKnownRival.has(key)) continue;
    seenKnownRival.add(key);
    entries.push({
      wonderId: location.wonderId,
      cityName: location.cityName,
      coord: { ...location.coord },
      ownerId: location.civId,
      relationship: 'known-rival',
      state: 'completed',
      turnCompleted: location.learnedTurn,
      label: getLegendaryWonderDefinition(location.wonderId)
        ? getLegendaryWonderDefinition(location.wonderId)!.name
        : 'Legendary wonder',
      visual: getWonderVisualDefinition(location.wonderId),
      metadata: getLegendaryWonderLandmarkMetadata(location.wonderId),
    });
  }
```

- [ ] **Step 5: Support landmark-only render items without hidden city data**

In `src/renderer/city-render-passes.ts`, update `CityRenderProjection`:

```ts
export interface CityRenderProjection {
  name: string;
  position: HexCoord;
  population: number;
  owner: string;
  isLive: boolean;
  liveCityId?: string;
  renderMode?: 'city' | 'landmark-only';
}
```

At the top of each non-landmark pass, before `markPass`, skip landmark-only projections:

```ts
  if (item.projection.renderMode === 'landmark-only') return;
```

Apply that skip in `drawCityBasePass`, `drawCityIconPass`, `drawCityLabelPass`, `drawCityStatusBadgePass`, `drawCityProductionBadgePass`, and `drawCityIdleBadgePass`. Do not add the skip to `drawCityLandmarkPass`.

In `src/renderer/city-renderer.ts`, replace `landmarksByCity` grouping with coordinate grouping:

```ts
  const landmarksByCoord = new Map<string, LegendaryWonderMapEntry[]>();
  for (const entry of getLegendaryWonderMapEntries(state, playerCivId)) {
    const key = `${entry.coord.q},${entry.coord.r}`;
    landmarksByCoord.set(key, [...(landmarksByCoord.get(key) || []), entry]);
  }
```

When assigning `landmarkEntries` inside the projection loop:

```ts
      const landmarkEntries = landmarksByCoord.get(`${projection.position.q},${projection.position.r}`) || [];
```

Before iterating projections, store projections in a local variable and create a set of projection coordinate keys:

```ts
  const projections = getCityRenderProjection(state, playerCivId);
  const projectedKeys = new Set(projections.map(projection => `${projection.position.q},${projection.position.r}`));
```

After the normal projection loop:

```ts
  for (const [coordKey, landmarkEntries] of landmarksByCoord.entries()) {
    if (projectedKeys.has(coordKey)) continue;
    const [q, r] = coordKey.split(',').map(Number);
    const coord = { q, r };
    if (!camera.isHexVisible(coord)) continue;
    const pixel = hexToPixel(coord, camera.hexSize);
    const screen = camera.worldToScreen(pixel.x, pixel.y);
    items.push({
      projection: {
        name: landmarkEntries[0].cityName !== undefined ? landmarkEntries[0].cityName : landmarkEntries[0].label,
        position: coord,
        population: 0,
        owner: landmarkEntries[0].ownerId,
        isLive: false,
        renderMode: 'landmark-only',
      },
      screen,
      size: camera.hexSize * camera.zoom,
      ownerColor: state.civilizations[landmarkEntries[0].ownerId]
        ? state.civilizations[landmarkEntries[0].ownerId].color
        : OWNER_COLORS[landmarkEntries[0].ownerId] || '#888',
      playerCivId,
      isMinorCiv: false,
      landmarkEntries,
      lowZoom: camera.zoom < LOD_SPRITE_ZOOM_THRESHOLD,
      reducedMotion,
      nowMs,
      turn: state.turn,
    });
  }
```

- [ ] **Step 6: Run map and renderer tests until they pass**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/legendary-wonder-map-presentation.test.ts tests/renderer/city-renderer.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit map and renderer work**

Run:

```bash
git add src/systems/legendary-wonder-map-presentation.ts tests/systems/legendary-wonder-map-presentation.test.ts src/renderer/city-renderer.ts src/renderer/city-render-passes.ts tests/renderer/city-renderer.test.ts
git commit -m "feat(wonders): render known rival landmark intel"
```

## Task 6: Review, Rule Checks, And Full Verification

**Files:**
- Review all changed files from Tasks 1-5.

- [ ] **Step 1: Run targeted test set**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/legendary-wonder-intel.test.ts tests/systems/legendary-wonder-system.test.ts tests/systems/legendary-wonder-map-presentation.test.ts tests/systems/wonder-codex/presentation.test.ts tests/ui/wonder-codex-page.test.ts tests/ui/territory-inspection-panel.test.ts tests/renderer/city-renderer.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run source rule checks**

Run:

```bash
scripts/check-src-rule-violations.sh src/core/types.ts src/systems/legendary-wonder-intel.ts src/systems/legendary-wonder-system.ts src/systems/legendary-wonder-intel-presentation.ts src/systems/legendary-wonder-landmark-presentation.ts src/systems/wonder-codex/presentation.ts src/ui/wonder-codex-page.ts src/ui/territory-inspection-panel.ts src/systems/legendary-wonder-map-presentation.ts src/renderer/city-renderer.ts src/renderer/city-render-passes.ts
```

Expected: PASS with no rule violations.

- [ ] **Step 3: Run wonder regressions**

Run:

```bash
./scripts/run-wonder-regressions.sh
```

Expected: PASS. A sandbox-only mise cache warning is acceptable only when the script exits 0.

- [ ] **Step 4: Run build**

Run:

```bash
./scripts/run-with-mise.sh yarn build
```

Expected: PASS. Existing Vite chunk-size warnings are acceptable when the command exits 0.

- [ ] **Step 5: Run full test suite**

Run:

```bash
./scripts/run-with-mise.sh yarn test
```

Expected: PASS.

- [ ] **Step 6: Inspect branch and working-tree diffs**

Run:

```bash
git diff --stat origin/main...HEAD
git diff --stat
git diff origin/main...HEAD
git diff
```

Expected:
- Branch diff contains only Stage 2J spec, plan, implementation, and tests.
- Working-tree diff is empty before final PR work.
- No files under `src/audio/**`, `public/audio/**`, `src/platform/**`, `src-tauri/**`, PWA manifest, or service worker paths changed.
- No serialized view model exposes rival `cityId`, rival production, rival quest steps, rival reward, or hidden completion city.

- [ ] **Step 7: Commit verification fixes if review finds issues**

If Step 6 reveals a concrete issue, write the smallest regression test that fails for that issue, implement the fix, rerun the relevant targeted command, and commit:

```bash
git add <changed-files>
git commit -m "fix(wonders): harden known rival landmark intel"
```

## Task 7: Rebase, Fast-Forward Check, Push, And PR

**Files:**
- No source edits unless rebase conflict resolution requires them.

- [ ] **Step 1: Fetch latest main**

Run:

```bash
git fetch origin main
```

Expected: fetch succeeds.

- [ ] **Step 2: Rebase onto latest `origin/main`**

Run:

```bash
git rebase origin/main
```

Expected: rebase succeeds. On conflict, resolve by preserving Stage 2J privacy contracts, rerun affected targeted tests, then continue with `git -c core.editor=true rebase --continue`.

- [ ] **Step 3: Verify fast-forward eligibility**

Run:

```bash
git merge-base --is-ancestor origin/main HEAD
```

Expected: exit 0.

- [ ] **Step 4: Re-run final verification after rebase**

Run:

```bash
./scripts/run-with-mise.sh yarn build
./scripts/run-with-mise.sh yarn test
```

Expected: both PASS.

- [ ] **Step 5: Push branch**

Run:

```bash
git push -u origin codex/stage-2j-legendary-landmark-intel
```

Expected: push succeeds.

- [ ] **Step 6: Create draft PR**

Run:

```bash
gh pr create --draft --base main --head codex/stage-2j-legendary-landmark-intel --title "Stage 2J legendary landmark intel visibility" --body "## Summary
- add explicit host/location legendary wonder intel records
- show known-rival landmark previews and map markers only from paired location and completion intel
- preserve started/completed rival privacy and hot-seat viewer scoping

## Tests
- ./scripts/run-with-mise.sh yarn test --run tests/systems/legendary-wonder-intel.test.ts tests/systems/legendary-wonder-system.test.ts tests/systems/legendary-wonder-map-presentation.test.ts tests/systems/wonder-codex/presentation.test.ts tests/ui/wonder-codex-page.test.ts tests/ui/territory-inspection-panel.test.ts tests/renderer/city-renderer.test.ts
- scripts/check-src-rule-violations.sh src/core/types.ts src/systems/legendary-wonder-intel.ts src/systems/legendary-wonder-system.ts src/systems/legendary-wonder-intel-presentation.ts src/systems/legendary-wonder-landmark-presentation.ts src/systems/wonder-codex/presentation.ts src/ui/wonder-codex-page.ts src/ui/territory-inspection-panel.ts src/systems/legendary-wonder-map-presentation.ts src/renderer/city-renderer.ts src/renderer/city-render-passes.ts
- ./scripts/run-wonder-regressions.sh
- ./scripts/run-with-mise.sh yarn build
- ./scripts/run-with-mise.sh yarn test"
```

Expected: PR URL is printed.

## Plan Self-Review

- Spec coverage: The plan maps the new union tier, existing started/completed privacy, canonical stationed-spy source, safe Codex/inspection/map views, hot-seat scoping, renderer layer preservation, and verification requirements to Tasks 1-7.
- Architecture check: Privacy decisions stay in `src/systems/**`; DOM and Canvas code receive safe view objects and map entries. The renderer gains a landmark-only projection mode so known-rival markers can render from stored coordinates without reading live rival city state.
- Testing check: Every behavior change starts with a failing Vitest test. Negative tests cover completed-only, started-only, unexplored location, hidden live enrichment, self-rival sanitization, and hot-seat leakage.
- UI/UX check: The Codex adds compact passive copy, not new actions. Inspection adds informational text only at the matching known coordinate. No queue or repeat-click workflow is introduced.
- Audio/SFX check: The plan changes no audio files, SFX triggers, media attribution, PWA files, service worker code, platform code, or Tauri code.
- Regression check: Targeted tests, source rule checks, wonder regressions, build, full test suite, branch diff, and working-tree diff are required before PR creation.
