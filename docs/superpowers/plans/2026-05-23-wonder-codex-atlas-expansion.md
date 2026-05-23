# Wonder Codex Atlas Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Stage 2D: an immersive, viewer-safe, full 2D illustrated Wonder Codex launched from the existing Wonder Atlas entry point.

**Architecture:** Add a focused `src/systems/wonder-codex/` package for strict authored content, related-link generation, and viewer-safe presentation view models. Add render-only codex UI modules that consume those view models, then delegate the existing `createWonderAtlasPanel` entry point to the new codex shell so browser/PWA and macOS/Tauri share one implementation path.

**Tech Stack:** TypeScript, DOM/CSS UI modules, Canvas-safe existing visual catalog, Vitest, jsdom UI tests, existing `GameState`, existing Wonder Atlas, existing legendary/natural wonder definitions.

---

## Scope Check

This is one coherent slice. It touches content, presentation, UI, existing Atlas wiring, and docs because those pieces are required for one player-visible codex experience. Do not split out content coverage or Atlas delegation; a shell without complete content or a complete content table without the live Atlas entry point violates the spec.

This plan deliberately does not implement rival-known legendary records, richer bespoke landmark art, or real videos. It records those deferred items in roadmap/spec/plan docs as part of Task 7.

## Required Context

Read before editing:

- `CLAUDE.md`
- `.claude/rules/spec-fidelity.md`
- `.claude/rules/ui-panels.md`
- `.claude/rules/end-to-end-wiring.md`
- `.claude/rules/game-systems.md`
- `.claude/rules/strategy-game-mechanics.md`
- `.claude/rules/incremental-mr-completion.md`
- `docs/superpowers/plans/README.md`
- `docs/superpowers/specs/2026-05-23-wonder-codex-atlas-expansion-design.md`

Invoke `.claude/skills/button-styling.md` before adding new buttons in `src/ui/**`.

## Current Wonder IDs

Natural wonder IDs that must have codex content:

```ts
[
  'great_volcano',
  'sacred_mountain',
  'crystal_caverns',
  'ancient_forest',
  'coral_reef',
  'grand_canyon',
  'aurora_fields',
  'frozen_falls',
  'dragon_bones',
  'singing_sands',
  'sunken_ruins',
  'floating_islands',
  'bioluminescent_bay',
  'bottomless_lake',
  'eternal_storm',
]
```

Legendary wonder IDs that must have codex content:

```ts
[
  'oracle-of-delphi',
  'grand-canal',
  'sun-spire',
  'world-archive',
  'moonwell-gardens',
  'ironroot-foundry',
  'tidecaller-bastion',
  'starvault-observatory',
  'whispering-exchange',
  'hall-of-champions',
  'gate-of-the-world',
  'leviathan-drydock',
  'storm-signal-spire',
  'manhattan-project',
  'internet',
]
```

## File Structure

Create:

- `src/systems/wonder-codex/types.ts` - strict content/view-model/tag types.
- `src/systems/wonder-codex/natural-content.ts` - authored content for every natural wonder.
- `src/systems/wonder-codex/legendary-content.ts` - authored content for every legendary wonder.
- `src/systems/wonder-codex/content.ts` - content aggregation and lookup helpers.
- `src/systems/wonder-codex/related.ts` - deterministic convention-driven related links.
- `src/systems/wonder-codex/presentation.ts` - viewer-safe codex view models and first-selection behavior.
- `src/ui/wonder-codex-page.ts` - render-only reader page.
- `src/ui/wonder-codex-panel.ts` - immersive overlay shell, catalog drawer, responsive flow.
- `tests/systems/wonder-codex/content.test.ts`
- `tests/systems/wonder-codex/related.test.ts`
- `tests/systems/wonder-codex/presentation.test.ts`
- `tests/ui/wonder-codex-page.test.ts`
- `tests/ui/wonder-codex-panel.test.ts`

Modify:

- `src/ui/wonder-atlas-panel.ts` - keep public API and delegate to codex shell.
- `tests/ui/wonder-atlas-panel.test.ts` - update existing public-entry tests to expect codex shell behavior.
- `tests/systems/wonder-atlas-presentation.test.ts` - keep or update legacy presentation tests only if the old helper remains used by other code.
- `docs/superpowers/specs/2026-05-21-wonder-atlas-and-map-identity-design.md` - update roadmap notes.
- `docs/superpowers/specs/2026-05-22-legendary-wonder-city-presence-design.md` - update roadmap notes.
- `docs/superpowers/specs/2026-05-23-wonder-codex-atlas-expansion-design.md` - add any implementation-discovered clarifications.
- `docs/superpowers/plans/2026-05-22-legendary-wonder-city-presence.md` - update deferred work references if still pointing to old stage labels.
- `docs/superpowers/plans/2026-05-23-wonder-codex-atlas-expansion.md` - update checkboxes while executing.

## Player Truth Table

| Before | Action | State change | Immediate visible result | Must remain reachable |
| --- | --- | --- | --- | --- |
| Desktop Atlas opens with visible entries | Open Atlas | None | Rich reader selects safe `initialWonderId` or first stable visible entry | Catalog drawer, close, related visible entries |
| Desktop selected page visible | Click catalog item | UI selection only | Reader text and actions update to selected item | Full visible catalog remains reachable |
| Mobile Atlas opens without deep link | Open Atlas | None | Catalog list appears first | Every visible catalog item |
| Mobile catalog visible | Tap catalog item | UI selection only | Reader page opens with core story and expandable sections | Back/catalog action |
| Mobile reader visible | Tap expandable section | UI expansion only | Secondary details become visible | Core story and back/catalog action |
| Reader has related visible entries | Tap related wonder | UI selection only | Reader updates to related page if visible | Previous catalog and close |
| Discovered natural wonder page | Tap `View on Map` | None in gameplay state | Callback receives safe coord/id | Atlas can reopen |
| Owned legendary page with safe host city | Tap `Open City` | None in codex UI | Callback receives safe city id | Atlas entry point remains usable |

## Misleading UI Risks

- `Visible` means viewer-safe, not present in authored content.
- `All wonders covered` means content coverage, not every page shown.
- `Available` means city/legendary presentation says buildable; raw project phase alone is insufficient.
- `Completed` cannot describe rival legendary completions in Stage 2D.
- `Related` means conventionally linked through valid tags, never raw hidden state.
- `View on Map` appears only with a safe coordinate.
- `Open City` appears only with a safe owned host city.

Negative tests in Tasks 1, 3, 4, and 5 must prove these boundaries.

## Interaction Replay Checklist

Cover these replay paths in UI tests:

- open desktop codex, select first catalog item, select another catalog item
- open mobile codex without deep link, select item, return to catalog, select another item
- open mobile codex with safe deep link and confirm it starts on the reader
- expand a mobile section twice and confirm no duplicate content or stale state
- select a related link and confirm reader text updates immediately
- close and reopen through `createWonderAtlasPanel`

## Task 1: Codex Types And Content Contract Tests

**Files:**

- Create: `src/systems/wonder-codex/types.ts`
- Create: `tests/systems/wonder-codex/content.test.ts`
- Later tasks create: `src/systems/wonder-codex/natural-content.ts`, `src/systems/wonder-codex/legendary-content.ts`, `src/systems/wonder-codex/content.ts`

- [ ] **Step 1: Create the failing content contract test**

Create `tests/systems/wonder-codex/content.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { WONDER_DEFINITIONS } from '@/systems/wonder-definitions';
import { getLegendaryWonderDefinitions } from '@/systems/legendary-wonder-definitions';
import {
  getAllWonderCodexContent,
  getLegendaryWonderCodexContent,
  getNaturalWonderCodexContent,
} from '@/systems/wonder-codex/content';
import {
  CODEX_SECTION_KINDS,
  CODEX_STATUS_HOOKS,
  CODEX_TAGS,
  CODEX_VISUAL_TONES,
  type WonderCodexContent,
} from '@/systems/wonder-codex/types';

const FORBIDDEN_TEXT = ['TODO', 'TBD', 'lorem', 'placeholder'];

function sorted(values: string[]): string[] {
  return [...values].sort((a, b) => a.localeCompare(b));
}

function assertNoForbiddenText(entry: WonderCodexContent): void {
  const serialized = JSON.stringify(entry).toLowerCase();
  for (const token of FORBIDDEN_TEXT) {
    expect(serialized).not.toContain(token.toLowerCase());
  }
}

function assertNonEmptyText(value: string): void {
  expect(value.trim().length).toBeGreaterThan(0);
}

describe('wonder-codex content contracts', () => {
  it('covers exactly every natural wonder definition', () => {
    expect(sorted(getNaturalWonderCodexContent().map(entry => entry.id))).toEqual(
      sorted(WONDER_DEFINITIONS.map(definition => definition.id)),
    );
  });

  it('covers exactly every legendary wonder definition', () => {
    expect(sorted(getLegendaryWonderCodexContent().map(entry => entry.id))).toEqual(
      sorted(getLegendaryWonderDefinitions().map(definition => definition.id)),
    );
  });

  it('has no duplicate or unknown codex ids', () => {
    const entries = getAllWonderCodexContent();
    const ids = entries.map(entry => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    const knownIds = new Set([
      ...WONDER_DEFINITIONS.map(definition => definition.id),
      ...getLegendaryWonderDefinitions().map(definition => definition.id),
    ]);
    expect(ids.filter(id => !knownIds.has(id))).toEqual([]);
  });

  it('requires complete authored museum-label fields for every entry', () => {
    for (const entry of getAllWonderCodexContent()) {
      assertNonEmptyText(entry.title);
      assertNonEmptyText(entry.subtitle);
      assertNonEmptyText(entry.authoredLead);
      assertNonEmptyText(entry.learningText);
      expect(CODEX_VISUAL_TONES).toContain(entry.visualTone);
      expect(entry.tags.length).toBeGreaterThanOrEqual(3);
      for (const tag of entry.tags) expect(CODEX_TAGS).toContain(tag);
      expect(entry.relatedSeedTags.length).toBeGreaterThanOrEqual(2);
      for (const tag of entry.relatedSeedTags) expect(entry.tags).toContain(tag);
      expect(entry.sections.length).toBeGreaterThanOrEqual(2);
      for (const section of entry.sections) {
        expect(CODEX_SECTION_KINDS).toContain(section.kind);
        assertNonEmptyText(section.heading);
        assertNonEmptyText(section.body);
      }
      expect(entry.statusHooks.length).toBeGreaterThanOrEqual(2);
      for (const hook of entry.statusHooks) expect(CODEX_STATUS_HOOKS).toContain(hook);
      assertNoForbiddenText(entry);
    }
  });

  it('requires kind-specific status hooks', () => {
    for (const entry of getNaturalWonderCodexContent()) {
      expect(entry.statusHooks).toContain('natural-effect');
      expect(entry.statusHooks).toContain('natural-location');
    }
    for (const entry of getLegendaryWonderCodexContent()) {
      expect(entry.statusHooks).toContain('legendary-status');
      expect(entry.statusHooks).toContain('legendary-reward');
    }
  });
});
```

- [ ] **Step 2: Run the test and verify it fails because modules do not exist**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/wonder-codex/content.test.ts
```

Expected: FAIL with import errors for `@/systems/wonder-codex/content` and `@/systems/wonder-codex/types`.

- [ ] **Step 3: Add codex type definitions**

Create `src/systems/wonder-codex/types.ts`:

```ts
export const CODEX_TAGS = [
  'fire',
  'water',
  'stone',
  'forest',
  'ice',
  'sky',
  'sea',
  'desert',
  'science',
  'gold',
  'food',
  'production',
  'faith',
  'trade',
  'defense',
  'healing',
  'vision',
  'ancient',
  'classical',
  'medieval',
  'renaissance',
  'industrial',
  'modern',
  'exploration',
  'infrastructure',
  'military',
  'culture',
  'nature',
  'knowledge',
] as const;

export type WonderCodexTag = typeof CODEX_TAGS[number];

export const CODEX_VISUAL_TONES = [
  'awe',
  'mystery',
  'reverence',
  'danger',
  'ingenuity',
  'prosperity',
  'discovery',
  'memory',
] as const;

export type WonderCodexVisualTone = typeof CODEX_VISUAL_TONES[number];

export const CODEX_SECTION_KINDS = [
  'origin',
  'landscape',
  'legacy',
  'craft',
  'ritual',
  'campaign',
  'reward',
  'construction',
] as const;

export type WonderCodexSectionKind = typeof CODEX_SECTION_KINDS[number];

export const CODEX_STATUS_HOOKS = [
  'natural-effect',
  'natural-location',
  'legendary-status',
  'legendary-reward',
  'legendary-host-city',
  'legendary-progress',
] as const;

export type WonderCodexStatusHook = typeof CODEX_STATUS_HOOKS[number];

export interface WonderCodexSection {
  kind: WonderCodexSectionKind;
  heading: string;
  body: string;
}

export interface WonderCodexContent {
  id: string;
  kind: 'natural' | 'legendary';
  title: string;
  subtitle: string;
  authoredLead: string;
  learningText: string;
  visualTone: WonderCodexVisualTone;
  tags: WonderCodexTag[];
  sections: WonderCodexSection[];
  statusHooks: WonderCodexStatusHook[];
  relatedSeedTags: WonderCodexTag[];
}
```

- [ ] **Step 4: Run the test and verify it still fails because content modules do not exist**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/wonder-codex/content.test.ts
```

Expected: FAIL with import error for `@/systems/wonder-codex/content`.

- [ ] **Step 5: Do not commit yet**

Task 2 adds content and should be committed with the type contract.

## Task 2: Strict Authored Codex Content

**Files:**

- Create: `src/systems/wonder-codex/natural-content.ts`
- Create: `src/systems/wonder-codex/legendary-content.ts`
- Create: `src/systems/wonder-codex/content.ts`
- Modify: `tests/systems/wonder-codex/content.test.ts`

- [ ] **Step 1: Create natural content**

Create `src/systems/wonder-codex/natural-content.ts` exporting `NATURAL_WONDER_CODEX_CONTENT`.

Use this exact shape for each entry:

```ts
import type { WonderCodexContent } from '@/systems/wonder-codex/types';

export const NATURAL_WONDER_CODEX_CONTENT = [
  {
    id: 'great_volcano',
    kind: 'natural',
    title: 'Great Volcano',
    subtitle: 'A mountain that makes creation and ruin visible at the same time.',
    authoredLead: 'The Great Volcano dominates its horizon with a lesson no settlement can ignore: the earth is still being made. Its slopes promise rich soil and hard stone, but every gift arrives under a plume of risk.',
    learningText: 'Volcanic landscapes are often among the most fertile and dangerous places people inhabit. Ash can renew fields, lava can erase them, and the memory of eruption shapes settlement, ritual, and engineering for generations.',
    visualTone: 'danger',
    tags: ['fire', 'stone', 'production', 'science', 'nature'],
    relatedSeedTags: ['fire', 'stone', 'nature'],
    statusHooks: ['natural-effect', 'natural-location'],
    sections: [
      {
        kind: 'landscape',
        heading: 'Living Stone',
        body: 'The volcano reads as a living landmark: smoke, mineral color, and exposed rock make the tile feel powerful even before its yields matter.',
      },
      {
        kind: 'legacy',
        heading: 'Settling Near Fire',
        body: 'Cities near volcanic ground inherit both abundance and anxiety. The codex should frame this as a source of story, not only a yield modifier.',
      },
    ],
  },
] satisfies WonderCodexContent[];
```

The final `NATURAL_WONDER_CODEX_CONTENT` array must contain the `great_volcano` entry above plus one complete entry for each of these IDs:

```ts
[
  'sacred_mountain',
  'crystal_caverns',
  'ancient_forest',
  'coral_reef',
  'grand_canyon',
  'aurora_fields',
  'frozen_falls',
  'dragon_bones',
  'singing_sands',
  'sunken_ruins',
  'floating_islands',
  'bioluminescent_bay',
  'bottomless_lake',
  'eternal_storm',
]
```

Each entry must have unique museum-label prose. Do not copy the same body text across entries.

- [ ] **Step 2: Create legendary content**

Create `src/systems/wonder-codex/legendary-content.ts` exporting `LEGENDARY_WONDER_CODEX_CONTENT`.

Use this exact shape for each entry:

```ts
import type { WonderCodexContent } from '@/systems/wonder-codex/types';

export const LEGENDARY_WONDER_CODEX_CONTENT = [
  {
    id: 'oracle-of-delphi',
    kind: 'legendary',
    title: 'Oracle of Delphi',
    subtitle: 'A civic voice built around mystery, counsel, and interpretation.',
    authoredLead: 'The Oracle of Delphi turns uncertainty into institution. Pilgrims arrive with questions, rulers arrive with fear, and the city that hosts the oracle learns to make listening itself a form of power.',
    learningText: 'Oracle traditions joined religion, politics, travel, and memory. Their value was not only prediction; they created a shared place where decisions could be staged, interpreted, and remembered.',
    visualTone: 'reverence',
    tags: ['knowledge', 'faith', 'science', 'ancient', 'culture'],
    relatedSeedTags: ['knowledge', 'faith', 'science'],
    statusHooks: ['legendary-status', 'legendary-reward', 'legendary-host-city', 'legendary-progress'],
    sections: [
      {
        kind: 'ritual',
        heading: 'Questions Made Public',
        body: 'An oracle gives private fear a public setting. The wonder page should make that tension visible: counsel, ambiguity, and civic prestige.',
      },
      {
        kind: 'reward',
        heading: 'Knowledge As Legacy',
        body: 'Its reward is framed as research and science because the wonder represents organized attention to signs, records, and interpretation.',
      },
    ],
  },
] satisfies WonderCodexContent[];
```

The final `LEGENDARY_WONDER_CODEX_CONTENT` array must contain the `oracle-of-delphi` entry above plus one complete entry for each of these IDs:

```ts
[
  'grand-canal',
  'sun-spire',
  'world-archive',
  'moonwell-gardens',
  'ironroot-foundry',
  'tidecaller-bastion',
  'starvault-observatory',
  'whispering-exchange',
  'hall-of-champions',
  'gate-of-the-world',
  'leviathan-drydock',
  'storm-signal-spire',
  'manhattan-project',
  'internet',
]
```

Each legendary entry must include `legendary-status` and `legendary-reward`. Include `legendary-host-city` and `legendary-progress` unless the implementation proves a specific entry cannot use those hooks; if omitted, add a content-test assertion documenting the allowed exception.

- [ ] **Step 3: Add content aggregator**

Create `src/systems/wonder-codex/content.ts`:

```ts
import { LEGENDARY_WONDER_CODEX_CONTENT } from '@/systems/wonder-codex/legendary-content';
import { NATURAL_WONDER_CODEX_CONTENT } from '@/systems/wonder-codex/natural-content';
import type { WonderCodexContent } from '@/systems/wonder-codex/types';

export function getNaturalWonderCodexContent(): WonderCodexContent[] {
  return NATURAL_WONDER_CODEX_CONTENT.map(entry => ({
    ...entry,
    tags: [...entry.tags],
    relatedSeedTags: [...entry.relatedSeedTags],
    statusHooks: [...entry.statusHooks],
    sections: entry.sections.map(section => ({ ...section })),
  }));
}

export function getLegendaryWonderCodexContent(): WonderCodexContent[] {
  return LEGENDARY_WONDER_CODEX_CONTENT.map(entry => ({
    ...entry,
    tags: [...entry.tags],
    relatedSeedTags: [...entry.relatedSeedTags],
    statusHooks: [...entry.statusHooks],
    sections: entry.sections.map(section => ({ ...section })),
  }));
}

export function getAllWonderCodexContent(): WonderCodexContent[] {
  return [...getNaturalWonderCodexContent(), ...getLegendaryWonderCodexContent()];
}

export function getWonderCodexContent(wonderId: string): WonderCodexContent | undefined {
  return getAllWonderCodexContent().find(entry => entry.id === wonderId);
}
```

- [ ] **Step 4: Run content contract tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/wonder-codex/content.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit content contract**

Run:

```bash
git add src/systems/wonder-codex/types.ts src/systems/wonder-codex/natural-content.ts src/systems/wonder-codex/legendary-content.ts src/systems/wonder-codex/content.ts tests/systems/wonder-codex/content.test.ts
git commit -m "feat(wonders): add strict codex content"
```

## Task 3: Convention-Driven Related Links

**Files:**

- Create: `src/systems/wonder-codex/related.ts`
- Create: `tests/systems/wonder-codex/related.test.ts`

- [ ] **Step 1: Write related-link tests**

Create `tests/systems/wonder-codex/related.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { getAllWonderCodexContent, getWonderCodexContent } from '@/systems/wonder-codex/content';
import { getRelatedWonderCodexEntries } from '@/systems/wonder-codex/related';

describe('wonder-codex related links', () => {
  it('returns deterministic valid related ids without self-links', () => {
    const entries = getAllWonderCodexContent();
    for (const entry of entries) {
      const first = getRelatedWonderCodexEntries(entry.id, entries, 4).map(related => related.id);
      const second = getRelatedWonderCodexEntries(entry.id, [...entries].reverse(), 4).map(related => related.id);
      expect(first).toEqual(second);
      expect(first).not.toContain(entry.id);
      for (const id of first) {
        expect(getWonderCodexContent(id)).toBeTruthy();
      }
    }
  });

  it('uses shared seed tags as the primary convention', () => {
    const entries = getAllWonderCodexContent();
    const volcano = entries.find(entry => entry.id === 'great_volcano');
    expect(volcano).toBeTruthy();
    const related = getRelatedWonderCodexEntries('great_volcano', entries, 4);
    expect(related.length).toBeGreaterThan(0);
    for (const candidate of related) {
      expect(candidate.tags.some(tag => volcano!.relatedSeedTags.includes(tag))).toBe(true);
    }
  });

  it('respects the requested limit', () => {
    const related = getRelatedWonderCodexEntries('oracle-of-delphi', getAllWonderCodexContent(), 2);
    expect(related).toHaveLength(2);
  });

  it('returns an empty list for unknown source ids', () => {
    expect(getRelatedWonderCodexEntries('unknown-wonder', getAllWonderCodexContent(), 4)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run related tests and verify they fail**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/wonder-codex/related.test.ts
```

Expected: FAIL with import error for `@/systems/wonder-codex/related`.

- [ ] **Step 3: Implement related helper**

Create `src/systems/wonder-codex/related.ts`:

```ts
import type { WonderCodexContent } from '@/systems/wonder-codex/types';

function sharedSeedScore(source: WonderCodexContent, candidate: WonderCodexContent): number {
  return candidate.tags.filter(tag => source.relatedSeedTags.includes(tag)).length;
}

export function getRelatedWonderCodexEntries(
  wonderId: string,
  entries: WonderCodexContent[],
  limit: number = 4,
): WonderCodexContent[] {
  const source = entries.find(entry => entry.id === wonderId);
  if (!source || limit <= 0) return [];

  return [...entries]
    .filter(candidate => candidate.id !== wonderId)
    .map(candidate => ({
      candidate,
      score: sharedSeedScore(source, candidate),
      sameKind: candidate.kind === source.kind ? 1 : 0,
    }))
    .filter(item => item.score > 0)
    .sort((left, right) =>
      right.score - left.score
      || right.sameKind - left.sameKind
      || left.candidate.title.localeCompare(right.candidate.title)
      || left.candidate.id.localeCompare(right.candidate.id),
    )
    .slice(0, limit)
    .map(item => item.candidate);
}
```

- [ ] **Step 4: Run content and related tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/wonder-codex/content.test.ts tests/systems/wonder-codex/related.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit related links**

Run:

```bash
git add src/systems/wonder-codex/related.ts tests/systems/wonder-codex/related.test.ts
git commit -m "feat(wonders): derive codex related links"
```

## Task 4: Viewer-Safe Codex Presentation

**Files:**

- Create: `src/systems/wonder-codex/presentation.ts`
- Create: `tests/systems/wonder-codex/presentation.test.ts`
- Read: `src/systems/wonder-atlas-presentation.ts`
- Read: `src/systems/legendary-wonder-presentation.ts`
- Read: `tests/systems/helpers/legendary-wonder-fixture.ts`

- [ ] **Step 1: Write presentation tests**

Create `tests/systems/wonder-codex/presentation.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import type { GameState } from '@/core/types';
import { hexKey } from '@/systems/hex-utils';
import {
  getWonderCodexViewModel,
  type WonderCodexResponsiveMode,
} from '@/systems/wonder-codex/presentation';
import { makeLegendaryWonderFixture } from '../helpers/legendary-wonder-fixture';

function makeNaturalState(): GameState {
  const state = createNewGame(undefined, 'wonder-codex-presentation-test');
  for (const tile of Object.values(state.map.tiles)) tile.wonder = null;
  state.map.tiles[hexKey({ q: 0, r: 0 })].wonder = 'great_volcano';
  state.discoveredWonders = {};
  state.wonderDiscoverers = {};
  return state;
}

function view(state: GameState, mode: WonderCodexResponsiveMode = 'desktop', initialWonderId?: string) {
  return getWonderCodexViewModel(state, state.currentPlayer, { mode, initialWonderId });
}

describe('wonder-codex presentation', () => {
  it('shows discovered natural wonders and hides undiscovered natural wonders', () => {
    const state = makeNaturalState();
    expect(view(state).catalogEntries.some(entry => entry.id === 'great_volcano')).toBe(false);

    state.discoveredWonders.great_volcano = 'player';
    state.wonderDiscoverers.great_volcano = ['player'];
    const model = view(state);

    expect(model.catalogEntries.some(entry => entry.id === 'great_volcano')).toBe(true);
    expect(model.selectedPage?.id).toBe('great_volcano');
    expect(JSON.stringify(model)).not.toContain('undiscovered');
  });

  it('does not leak natural wonder pages across hot-seat viewers', () => {
    const state = makeNaturalState();
    state.discoveredWonders.great_volcano = 'player';
    state.wonderDiscoverers.great_volcano = ['ai-1'];

    expect(getWonderCodexViewModel(state, 'player', { mode: 'desktop' }).catalogEntries).toEqual(
      expect.not.arrayContaining([expect.objectContaining({ id: 'great_volcano' })]),
    );
    expect(getWonderCodexViewModel(state, 'ai-1', { mode: 'desktop' }).catalogEntries).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'great_volcano' })]),
    );
  });

  it('exposes owned legendary state without raw project objects', () => {
    const state = makeLegendaryWonderFixture({ completedTechs: ['philosophy', 'pilgrimages'], resources: ['stone'] });
    state.legendaryWonderProjects!['oracle-of-delphi'].phase = 'building';
    state.cities['city-river'].productionQueue = ['legendary:oracle-of-delphi'];
    state.cities['city-river'].productionProgress = 60;

    const model = view(state, 'desktop', 'oracle-of-delphi');
    expect(model.selectedPage).toMatchObject({
      id: 'oracle-of-delphi',
      kind: 'legendary',
      statusLabel: 'Under construction',
    });
    expect(model.selectedPage?.statusLines.join(' ')).toContain('Construction');
    expect(JSON.stringify(model)).not.toContain('investedProduction');
    expect(JSON.stringify(model)).not.toContain('questSteps');
  });

  it('does not expose rival legendary project or completion details in Stage 2D', () => {
    const state = makeLegendaryWonderFixture();
    state.legendaryWonderProjects!['rival-oracle'] = {
      wonderId: 'oracle-of-delphi',
      ownerId: 'rival',
      cityId: 'city-rival',
      phase: 'building',
      investedProduction: 99,
      transferableProduction: 0,
      questSteps: [],
    };
    state.completedLegendaryWonders = {
      'grand-canal': { ownerId: 'rival', cityId: 'city-rival', turnCompleted: 45 },
    };

    const model = view(state);
    expect(JSON.stringify(model)).not.toContain('city-rival');
    expect(JSON.stringify(model)).not.toContain('99');
    expect(JSON.stringify(model)).not.toContain('turnCompleted');
  });

  it('uses deterministic first-selection rules for desktop and mobile', () => {
    const state = makeNaturalState();
    state.discoveredWonders.great_volcano = 'player';
    state.wonderDiscoverers.great_volcano = ['player'];

    expect(view(state, 'desktop').selectedPage?.id).toBe('great_volcano');
    expect(view(state, 'mobile').selectedPage).toBeNull();
    expect(view(state, 'mobile', 'great_volcano').selectedPage?.id).toBe('great_volcano');
    expect(view(state, 'desktop', 'hidden-wonder').selectedPage?.id).toBe('great_volcano');
  });

  it('omits related links that are not visible to the viewer', () => {
    const state = makeNaturalState();
    state.discoveredWonders.great_volcano = 'player';
    state.wonderDiscoverers.great_volcano = ['player'];

    const model = view(state, 'desktop', 'great_volcano');
    expect(model.selectedPage?.relatedEntries.every(entry =>
      model.catalogEntries.some(catalog => catalog.id === entry.id),
    )).toBe(true);
  });
});
```

- [ ] **Step 2: Run presentation tests and verify they fail**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/wonder-codex/presentation.test.ts
```

Expected: FAIL with import error for `@/systems/wonder-codex/presentation`.

- [ ] **Step 3: Implement presentation types and helper**

Create `src/systems/wonder-codex/presentation.ts`:

```ts
import type { GameState, HexCoord } from '@/core/types';
import { getLegendaryWonderDefinitions } from '@/systems/legendary-wonder-definitions';
import { getLegendaryWonderPresentationForCity } from '@/systems/legendary-wonder-presentation';
import { getWonderDefinition, WONDER_DEFINITIONS } from '@/systems/wonder-definitions';
import { formatNaturalWonderEffectSummary } from '@/systems/wonder-presentation-formatting';
import { getWonderVisualDefinition, type WonderVisualDefinition } from '@/systems/wonder-visual-catalog';
import { getAllWonderCodexContent, getWonderCodexContent } from '@/systems/wonder-codex/content';
import { getRelatedWonderCodexEntries } from '@/systems/wonder-codex/related';
import type { WonderCodexContent, WonderCodexSection } from '@/systems/wonder-codex/types';

export type WonderCodexResponsiveMode = 'desktop' | 'mobile';

export interface WonderCodexCatalogEntry {
  id: string;
  kind: 'natural' | 'legendary';
  title: string;
  subtitle: string;
  stateLabel: string;
  visual: WonderVisualDefinition;
}

export interface WonderCodexAction {
  type: 'view-map' | 'open-city';
  label: string;
  wonderId: string;
  coord?: HexCoord;
  cityId?: string;
}

export interface WonderCodexPageViewModel extends WonderCodexCatalogEntry {
  authoredLead: string;
  learningText: string;
  statusLabel: string;
  statusLines: string[];
  sections: WonderCodexSection[];
  relatedEntries: WonderCodexCatalogEntry[];
  actions: WonderCodexAction[];
}

export interface WonderCodexViewModel {
  mode: WonderCodexResponsiveMode;
  catalogEntries: WonderCodexCatalogEntry[];
  selectedPage: WonderCodexPageViewModel | null;
  emptyState: string | null;
}

export interface WonderCodexPresentationOptions {
  mode: WonderCodexResponsiveMode;
  initialWonderId?: string;
}

function findWonderCoord(state: GameState, wonderId: string): HexCoord | null {
  const tile = Object.values(state.map.tiles).find(candidate => candidate.wonder === wonderId);
  return tile ? { ...tile.coord } : null;
}

function naturalVisibleIds(state: GameState, viewerId: string): Set<string> {
  return new Set(Object.entries(state.wonderDiscoverers ?? {})
    .filter(([, discoverers]) => discoverers.includes(viewerId))
    .map(([wonderId]) => wonderId));
}

function naturalCatalogEntry(state: GameState, content: WonderCodexContent): WonderCodexCatalogEntry | null {
  const definition = getWonderDefinition(content.id);
  if (!definition) return null;
  return {
    id: content.id,
    kind: 'natural',
    title: content.title,
    subtitle: content.subtitle,
    stateLabel: 'Discovered natural wonder',
    visual: getWonderVisualDefinition(content.id),
  };
}

function legendaryCatalogEntries(state: GameState, viewerId: string): WonderCodexCatalogEntry[] {
  const entries: WonderCodexCatalogEntry[] = [];
  for (const definition of getLegendaryWonderDefinitions()) {
    const content = getWonderCodexContent(definition.id);
    if (!content) continue;
    const ownedProject = Object.values(state.legendaryWonderProjects ?? {}).find(project =>
      project.ownerId === viewerId && project.wonderId === definition.id,
    );
    const ownedCompletion = state.completedLegendaryWonders?.[definition.id]?.ownerId === viewerId
      ? state.completedLegendaryWonders[definition.id]
      : null;
    if (!ownedProject && !ownedCompletion) continue;

    const cityId = ownedProject?.cityId ?? ownedCompletion?.cityId;
    const cityEntry = cityId
      ? getLegendaryWonderPresentationForCity(state, viewerId, cityId).find(entry => entry.wonderId === definition.id)
      : null;
    const stateLabel = cityEntry?.visibleState === 'completed'
      ? 'Completed'
      : cityEntry?.visibleState === 'building'
        ? 'Under construction'
        : cityEntry?.visibleState === 'recovered'
          ? 'Recovered'
          : cityEntry?.canStartBuild
            ? 'Available'
            : 'Legendary wonder';
    entries.push({
      id: content.id,
      kind: 'legendary',
      title: content.title,
      subtitle: content.subtitle,
      stateLabel,
      visual: getWonderVisualDefinition(content.id),
    });
  }
  return entries;
}

function stableCatalogSort(left: WonderCodexCatalogEntry, right: WonderCodexCatalogEntry): number {
  return left.kind.localeCompare(right.kind) || left.title.localeCompare(right.title) || left.id.localeCompare(right.id);
}

function buildPage(
  state: GameState,
  viewerId: string,
  entry: WonderCodexCatalogEntry,
  visibleEntries: WonderCodexCatalogEntry[],
): WonderCodexPageViewModel | null {
  const content = getWonderCodexContent(entry.id);
  if (!content) return null;
  const actions: WonderCodexAction[] = [];
  const statusLines: string[] = [];

  if (entry.kind === 'natural') {
    const definition = getWonderDefinition(entry.id);
    const coord = findWonderCoord(state, entry.id);
    statusLines.push(formatNaturalWonderEffectSummary(entry.id));
    if (coord) {
      statusLines.push(`Known location: Q${coord.q}, R${coord.r}`);
      actions.push({ type: 'view-map', label: 'View on Map', wonderId: entry.id, coord });
    }
    if (!definition) return null;
  } else {
    const ownedProject = Object.values(state.legendaryWonderProjects ?? {}).find(project =>
      project.ownerId === viewerId && project.wonderId === entry.id,
    );
    const ownedCompletion = state.completedLegendaryWonders?.[entry.id]?.ownerId === viewerId
      ? state.completedLegendaryWonders[entry.id]
      : null;
    const cityId = ownedProject?.cityId ?? ownedCompletion?.cityId;
    const cityEntry = cityId
      ? getLegendaryWonderPresentationForCity(state, viewerId, cityId).find(candidate => candidate.wonderId === entry.id)
      : null;
    const definition = getLegendaryWonderDefinitions().find(candidate => candidate.id === entry.id);
    if (definition) statusLines.push(`Reward: ${definition.reward.summary}`);
    if (cityEntry?.milestoneLabel) statusLines.push(`Construction: ${cityEntry.milestoneLabel}`);
    if (cityEntry?.productionResumedLabel) statusLines.push(cityEntry.productionResumedLabel);
    const city = cityId ? state.cities[cityId] : undefined;
    if (city?.owner === viewerId) {
      statusLines.push(`Host city: ${city.name}`);
      actions.push({ type: 'open-city', label: 'Open City', wonderId: entry.id, cityId: city.id });
    }
  }

  const visibleIds = new Set(visibleEntries.map(candidate => candidate.id));
  const relatedEntries = getRelatedWonderCodexEntries(entry.id, getAllWonderCodexContent(), 4)
    .filter(related => visibleIds.has(related.id))
    .map(related => visibleEntries.find(candidate => candidate.id === related.id))
    .filter((candidate): candidate is WonderCodexCatalogEntry => Boolean(candidate));

  return {
    ...entry,
    authoredLead: content.authoredLead,
    learningText: content.learningText,
    statusLabel: entry.stateLabel,
    statusLines,
    sections: content.sections.map(section => ({ ...section })),
    relatedEntries,
    actions,
  };
}

export function getWonderCodexViewModel(
  state: GameState,
  viewerId: string,
  options: WonderCodexPresentationOptions,
): WonderCodexViewModel {
  const discoveredNaturalIds = naturalVisibleIds(state, viewerId);
  const naturalEntries = WONDER_DEFINITIONS
    .filter(definition => discoveredNaturalIds.has(definition.id))
    .map(definition => getWonderCodexContent(definition.id))
    .filter((content): content is WonderCodexContent => Boolean(content))
    .map(content => naturalCatalogEntry(state, content))
    .filter((entry): entry is WonderCodexCatalogEntry => Boolean(entry));
  const catalogEntries = [...naturalEntries, ...legendaryCatalogEntries(state, viewerId)].sort(stableCatalogSort);

  const initialEntry = options.initialWonderId
    ? catalogEntries.find(entry => entry.id === options.initialWonderId)
    : undefined;
  const selectedEntry = initialEntry ?? (options.mode === 'desktop' ? catalogEntries[0] : undefined);
  const selectedPage = selectedEntry ? buildPage(state, viewerId, selectedEntry, catalogEntries) : null;

  return {
    mode: options.mode,
    catalogEntries,
    selectedPage,
    emptyState: catalogEntries.length === 0 ? 'No wonders recorded yet.' : null,
  };
}
```

- [ ] **Step 4: Run presentation tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/wonder-codex/presentation.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit presentation**

Run:

```bash
git add src/systems/wonder-codex/presentation.ts tests/systems/wonder-codex/presentation.test.ts
git commit -m "feat(wonders): derive codex presentation"
```

## Task 5: Render-Only Codex Page UI

**Files:**

- Create: `src/ui/wonder-codex-page.ts`
- Create: `tests/ui/wonder-codex-page.test.ts`
- Read: `.claude/skills/button-styling.md`

- [ ] **Step 1: Read button styling skill**

Run:

```bash
sed -n '1,220p' .claude/skills/button-styling.md
```

Expected: command prints the local button guidance. Use existing button helpers if required by that guidance.

- [ ] **Step 2: Write page UI tests**

Create `tests/ui/wonder-codex-page.test.ts`:

```ts
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getWonderVisualDefinition } from '@/systems/wonder-visual-catalog';
import type { WonderCodexPageViewModel } from '@/systems/wonder-codex/presentation';
import { createWonderCodexPage } from '@/ui/wonder-codex-page';

function page(overrides: Partial<WonderCodexPageViewModel> = {}): WonderCodexPageViewModel {
  return {
    id: 'great_volcano',
    kind: 'natural',
    title: 'Great Volcano',
    subtitle: 'A mountain that makes creation and ruin visible at the same time.',
    stateLabel: 'Discovered natural wonder',
    statusLabel: 'Discovered natural wonder',
    authoredLead: 'The Great Volcano dominates its horizon.',
    learningText: 'Volcanic landscapes are fertile and dangerous.',
    visual: getWonderVisualDefinition('great_volcano'),
    statusLines: ['Yields: +3 production, +1 science', 'Known location: Q0, R0'],
    sections: [
      { kind: 'landscape', heading: 'Living Stone', body: 'Smoke and exposed rock make the tile feel powerful.' },
      { kind: 'legacy', heading: 'Settling Near Fire', body: 'Cities near volcanic ground inherit abundance and anxiety.' },
    ],
    relatedEntries: [
      {
        id: 'sacred_mountain',
        kind: 'natural',
        title: 'Sacred Mountain',
        subtitle: 'A peak held in reverence.',
        stateLabel: 'Discovered natural wonder',
        visual: getWonderVisualDefinition('sacred_mountain'),
      },
    ],
    actions: [{ type: 'view-map', label: 'View on Map', wonderId: 'great_volcano', coord: { q: 0, r: 0 } }],
    ...overrides,
  };
}

describe('wonder-codex-page', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('renders authored museum-label text and status from the view model', () => {
    const root = createWonderCodexPage(page(), {
      mode: 'desktop',
      onAction: vi.fn(),
      onSelectRelated: vi.fn(),
    });

    expect(root.textContent).toContain('Great Volcano');
    expect(root.textContent).toContain('The Great Volcano dominates its horizon.');
    expect(root.textContent).toContain('Volcanic landscapes are fertile and dangerous.');
    expect(root.textContent).toContain('Yields: +3 production, +1 science');
  });

  it('renders related links from valid visible entries', () => {
    const onSelectRelated = vi.fn();
    const root = createWonderCodexPage(page(), {
      mode: 'desktop',
      onAction: vi.fn(),
      onSelectRelated,
    });

    root.querySelector<HTMLButtonElement>('[data-related-wonder-id="sacred_mountain"]')?.click();
    expect(onSelectRelated).toHaveBeenCalledWith('sacred_mountain');
  });

  it('emits safe actions from the view model', () => {
    const onAction = vi.fn();
    const root = createWonderCodexPage(page(), {
      mode: 'desktop',
      onAction,
      onSelectRelated: vi.fn(),
    });

    root.querySelector<HTMLButtonElement>('[data-codex-action="view-map"]')?.click();
    expect(onAction).toHaveBeenCalledWith(page().actions[0]);
  });

  it('uses expandable sections on mobile', () => {
    const root = createWonderCodexPage(page(), {
      mode: 'mobile',
      onAction: vi.fn(),
      onSelectRelated: vi.fn(),
    });

    const detail = root.querySelector('details[data-codex-section="legacy"]');
    expect(detail).toBeTruthy();
    expect(detail?.textContent).toContain('Settling Near Fire');
  });

  it('does not invent rival-hidden details outside the view model', () => {
    const root = createWonderCodexPage(page({ statusLines: [] }), {
      mode: 'desktop',
      onAction: vi.fn(),
      onSelectRelated: vi.fn(),
    });

    expect(root.textContent).not.toContain('rival');
    expect(root.textContent).not.toContain('progress');
    expect(root.textContent).not.toContain('turnCompleted');
  });
});
```

- [ ] **Step 3: Run page tests and verify they fail**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/wonder-codex-page.test.ts
```

Expected: FAIL with import error for `@/ui/wonder-codex-page`.

- [ ] **Step 4: Implement codex page UI**

Create `src/ui/wonder-codex-page.ts`:

```ts
import type {
  WonderCodexAction,
  WonderCodexPageViewModel,
  WonderCodexResponsiveMode,
} from '@/systems/wonder-codex/presentation';
import { createWonderVisualVignette } from '@/ui/wonder-vignette';

export interface WonderCodexPageCallbacks {
  onAction: (action: WonderCodexAction) => void;
  onSelectRelated: (wonderId: string) => void;
}

export interface WonderCodexPageOptions extends WonderCodexPageCallbacks {
  mode: WonderCodexResponsiveMode;
  reducedMotion?: boolean;
}

function appendText(parent: HTMLElement, tag: keyof HTMLElementTagNameMap, text: string, style?: string): HTMLElement {
  const element = document.createElement(tag);
  element.textContent = text;
  if (style) element.style.cssText = style;
  parent.appendChild(element);
  return element;
}

function createButton(text: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = text;
  button.style.cssText = 'min-height:44px;border:1px solid rgba(232,193,112,0.45);border-radius:6px;background:rgba(232,193,112,0.14);color:#f5e4b3;padding:8px 12px;cursor:pointer;';
  return button;
}

export function createWonderCodexPage(
  page: WonderCodexPageViewModel,
  options: WonderCodexPageOptions,
): HTMLElement {
  const root = document.createElement('article');
  root.dataset.codexPage = page.id;
  root.style.cssText = 'min-width:0;display:flex;flex-direction:column;gap:14px;color:#f8f1df;';

  const hero = document.createElement('div');
  hero.style.cssText = 'display:flex;gap:16px;align-items:center;flex-wrap:wrap;';
  const vignette = createWonderVisualVignette(page.title, page.visual, {
    kind: page.kind,
    reducedMotion: options.reducedMotion,
  });
  vignette.style.width = options.mode === 'desktop' ? '168px' : '128px';
  vignette.style.height = options.mode === 'desktop' ? '168px' : '128px';
  hero.appendChild(vignette);

  const titleBlock = document.createElement('div');
  titleBlock.style.cssText = 'min-width:0;flex:1 1 240px;';
  appendText(titleBlock, 'p', page.stateLabel, 'margin:0;color:#e8c170;font-size:12px;text-transform:uppercase;font-weight:700;letter-spacing:0;');
  appendText(titleBlock, 'h2', page.title, 'margin:4px 0 4px;font-size:30px;line-height:1.08;letter-spacing:0;');
  appendText(titleBlock, 'p', page.subtitle, 'margin:0;font-size:14px;line-height:1.4;opacity:0.82;');
  hero.appendChild(titleBlock);
  root.appendChild(hero);

  appendText(root, 'p', page.authoredLead, 'margin:0;font-size:16px;line-height:1.55;max-width:72ch;');
  appendText(root, 'p', page.learningText, 'margin:0;font-size:14px;line-height:1.5;opacity:0.84;max-width:76ch;');

  if (page.statusLines.length > 0) {
    const status = document.createElement('section');
    status.style.cssText = 'display:grid;gap:7px;padding:12px;border:1px solid rgba(232,193,112,0.22);border-radius:8px;background:rgba(255,255,255,0.05);';
    appendText(status, 'h3', page.statusLabel, 'margin:0;font-size:14px;color:#e8c170;');
    for (const line of page.statusLines) appendText(status, 'p', line, 'margin:0;font-size:13px;line-height:1.35;');
    root.appendChild(status);
  }

  const sections = document.createElement('div');
  sections.style.cssText = 'display:grid;gap:10px;';
  page.sections.forEach(section => {
    if (options.mode === 'mobile') {
      const details = document.createElement('details');
      details.dataset.codexSection = section.kind;
      details.style.cssText = 'border:1px solid rgba(255,255,255,0.12);border-radius:8px;padding:10px;background:rgba(255,255,255,0.04);';
      const summary = document.createElement('summary');
      summary.textContent = section.heading;
      summary.style.cssText = 'cursor:pointer;color:#f0d897;font-weight:700;';
      details.appendChild(summary);
      appendText(details, 'p', section.body, 'margin:8px 0 0;font-size:13px;line-height:1.45;');
      sections.appendChild(details);
    } else {
      const card = document.createElement('section');
      card.dataset.codexSection = section.kind;
      card.style.cssText = 'border:1px solid rgba(255,255,255,0.10);border-radius:8px;padding:12px;background:rgba(255,255,255,0.04);';
      appendText(card, 'h3', section.heading, 'margin:0 0 6px;font-size:15px;color:#f0d897;');
      appendText(card, 'p', section.body, 'margin:0;font-size:13px;line-height:1.45;');
      sections.appendChild(card);
    }
  });
  root.appendChild(sections);

  if (page.actions.length > 0) {
    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;';
    for (const action of page.actions) {
      const button = createButton(action.label);
      button.dataset.codexAction = action.type;
      button.addEventListener('click', () => options.onAction(action));
      actions.appendChild(button);
    }
    root.appendChild(actions);
  }

  if (page.relatedEntries.length > 0) {
    const related = document.createElement('section');
    related.style.cssText = 'display:grid;gap:8px;';
    appendText(related, 'h3', 'Related Wonders', 'margin:0;font-size:15px;color:#e8c170;');
    const list = document.createElement('div');
    list.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;';
    for (const entry of page.relatedEntries) {
      const button = createButton(entry.title);
      button.dataset.relatedWonderId = entry.id;
      button.addEventListener('click', () => options.onSelectRelated(entry.id));
      list.appendChild(button);
    }
    related.appendChild(list);
    root.appendChild(related);
  }

  return root;
}
```

- [ ] **Step 5: Run page tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/wonder-codex-page.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit page UI**

Run:

```bash
git add src/ui/wonder-codex-page.ts tests/ui/wonder-codex-page.test.ts
git commit -m "feat(wonders): render codex reader pages"
```

## Task 6: Immersive Codex Panel And Responsive Flow

**Files:**

- Create: `src/ui/wonder-codex-panel.ts`
- Create: `tests/ui/wonder-codex-panel.test.ts`

- [ ] **Step 1: Write panel UI tests**

Create `tests/ui/wonder-codex-panel.test.ts`:

```ts
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createNewGame } from '@/core/game-state';
import type { GameState } from '@/core/types';
import { hexKey } from '@/systems/hex-utils';
import { createWonderCodexPanel } from '@/ui/wonder-codex-panel';

function click(element: Element | null | undefined): void {
  expect(element).toBeTruthy();
  element!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

function makeState(): GameState {
  const state = createNewGame(undefined, 'wonder-codex-panel-test');
  for (const tile of Object.values(state.map.tiles)) tile.wonder = null;
  state.map.tiles[hexKey({ q: 0, r: 0 })].wonder = 'great_volcano';
  state.discoveredWonders = { great_volcano: 'player' };
  state.wonderDiscoverers = { great_volcano: ['player'] };
  return state;
}

describe('wonder-codex-panel', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('renders desktop rich reader with catalog drawer by default', () => {
    const panel = createWonderCodexPanel(document.body, makeState(), {
      mode: 'desktop',
      onViewOnMap: vi.fn(),
      onOpenCity: vi.fn(),
      onClose: vi.fn(),
    });

    expect(panel.id).toBe('wonder-codex-panel');
    expect(panel.querySelector('[data-codex-catalog]')).toBeTruthy();
    expect(panel.querySelector('[data-codex-reader]')?.textContent).toContain('Great Volcano');
    expect(panel.textContent).toContain('The Great Volcano');
  });

  it('starts mobile catalog-first without a deep link', () => {
    const panel = createWonderCodexPanel(document.body, makeState(), {
      mode: 'mobile',
      onViewOnMap: vi.fn(),
      onOpenCity: vi.fn(),
      onClose: vi.fn(),
    });

    expect(panel.querySelector('[data-codex-catalog]')).toBeTruthy();
    expect(panel.querySelector('[data-codex-reader]')).toBeNull();
  });

  it('opens mobile reader directly with a safe deep link', () => {
    const panel = createWonderCodexPanel(document.body, makeState(), {
      mode: 'mobile',
      initialWonderId: 'great_volcano',
      onViewOnMap: vi.fn(),
      onOpenCity: vi.fn(),
      onClose: vi.fn(),
    });

    expect(panel.querySelector('[data-codex-reader]')?.textContent).toContain('Great Volcano');
    expect(panel.querySelector('[data-codex-catalog-back]')).toBeTruthy();
  });

  it('selects every visible catalog item and updates the reader', () => {
    const panel = createWonderCodexPanel(document.body, makeState(), {
      mode: 'desktop',
      onViewOnMap: vi.fn(),
      onOpenCity: vi.fn(),
      onClose: vi.fn(),
    });

    const entries = [...panel.querySelectorAll<HTMLElement>('[data-codex-entry-id]')];
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      click(entry);
      expect(panel.querySelector('[data-codex-reader]')?.textContent).toContain(entry.textContent!.trim().split('\n')[0].trim());
    }
  });

  it('emits map and close actions', () => {
    const onViewOnMap = vi.fn();
    const onClose = vi.fn();
    const panel = createWonderCodexPanel(document.body, makeState(), {
      mode: 'desktop',
      onViewOnMap,
      onOpenCity: vi.fn(),
      onClose,
    });

    click(panel.querySelector('[data-codex-action="view-map"]'));
    expect(onViewOnMap).toHaveBeenCalledWith({ q: 0, r: 0 }, 'great_volcano');

    click(panel.querySelector('[data-codex-close]'));
    expect(onClose).toHaveBeenCalled();
    expect(document.querySelector('#wonder-codex-panel')).toBeNull();
  });
});
```

- [ ] **Step 2: Run panel tests and verify they fail**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/wonder-codex-panel.test.ts
```

Expected: FAIL with import error for `@/ui/wonder-codex-panel`.

- [ ] **Step 3: Implement codex panel**

Create `src/ui/wonder-codex-panel.ts`:

```ts
import type { GameState, HexCoord } from '@/core/types';
import {
  getWonderCodexViewModel,
  type WonderCodexAction,
  type WonderCodexCatalogEntry,
  type WonderCodexPageViewModel,
  type WonderCodexResponsiveMode,
} from '@/systems/wonder-codex/presentation';
import { createWonderCodexPage } from '@/ui/wonder-codex-page';

export interface WonderCodexPanelCallbacks {
  onViewOnMap: (coord: HexCoord, wonderId: string) => void;
  onOpenCity: (cityId: string) => void;
  onClose: () => void;
  initialWonderId?: string;
  mode?: WonderCodexResponsiveMode;
  reducedMotion?: boolean;
}

function defaultMode(): WonderCodexResponsiveMode {
  return typeof window !== 'undefined' && window.innerWidth < 680 ? 'mobile' : 'desktop';
}

function appendText(parent: HTMLElement, tag: keyof HTMLElementTagNameMap, text: string, style?: string): HTMLElement {
  const element = document.createElement(tag);
  element.textContent = text;
  if (style) element.style.cssText = style;
  parent.appendChild(element);
  return element;
}

function createButton(text: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = text;
  button.style.cssText = 'min-height:44px;border:1px solid rgba(232,193,112,0.42);border-radius:8px;background:rgba(255,255,255,0.06);color:#f8f1df;padding:8px 12px;cursor:pointer;text-align:left;';
  return button;
}

export function createWonderCodexPanel(
  container: HTMLElement,
  state: GameState,
  callbacks: WonderCodexPanelCallbacks,
): HTMLElement {
  container.querySelector('#wonder-codex-panel')?.remove();
  container.querySelector('#wonder-atlas-panel')?.remove();

  const mode = callbacks.mode ?? defaultMode();
  let selectedWonderId = callbacks.initialWonderId;
  let mobileShowingCatalog = mode === 'mobile' && !callbacks.initialWonderId;

  const panel = document.createElement('section');
  panel.id = 'wonder-codex-panel';
  panel.style.cssText = 'position:absolute;inset:56px 12px 80px;z-index:42;background:rgba(10,13,18,0.97);border:1px solid rgba(232,193,112,0.42);border-radius:8px;color:#f8f1df;box-shadow:0 20px 70px rgba(0,0,0,0.55);display:flex;flex-direction:column;overflow:hidden;';

  const header = document.createElement('header');
  header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:12px;padding:12px 14px;border-bottom:1px solid rgba(255,255,255,0.10);';
  const titleBlock = document.createElement('div');
  appendText(titleBlock, 'h2', 'Wonder Codex', 'margin:0;font-size:19px;letter-spacing:0;');
  appendText(titleBlock, 'p', 'Illustrated records of discovered marvels and your legendary works.', 'margin:2px 0 0;font-size:12px;opacity:0.72;');
  header.appendChild(titleBlock);
  const close = createButton('Close');
  close.dataset.codexClose = 'true';
  close.addEventListener('click', () => {
    panel.remove();
    callbacks.onClose();
  });
  header.appendChild(close);
  panel.appendChild(header);

  const body = document.createElement('div');
  body.style.cssText = 'min-height:0;flex:1;display:grid;overflow:hidden;';
  panel.appendChild(body);

  function handleAction(action: WonderCodexAction): void {
    if (action.type === 'view-map' && action.coord) callbacks.onViewOnMap(action.coord, action.wonderId);
    if (action.type === 'open-city' && action.cityId) callbacks.onOpenCity(action.cityId);
  }

  function renderCatalog(entries: WonderCodexCatalogEntry[]): HTMLElement {
    const catalog = document.createElement('nav');
    catalog.dataset.codexCatalog = 'true';
    catalog.style.cssText = 'min-width:0;overflow:auto;padding:12px;display:flex;flex-direction:column;gap:8px;border-right:1px solid rgba(255,255,255,0.08);';
    for (const entry of entries) {
      const button = createButton(entry.title);
      button.dataset.codexEntryId = entry.id;
      appendText(button, 'span', ` ${entry.stateLabel}`, 'display:block;font-size:11px;opacity:0.68;margin-top:3px;');
      button.addEventListener('click', () => {
        selectedWonderId = entry.id;
        mobileShowingCatalog = false;
        render();
      });
      catalog.appendChild(button);
    }
    return catalog;
  }

  function renderReader(page: WonderCodexPageViewModel | null): HTMLElement {
    const reader = document.createElement('main');
    reader.dataset.codexReader = 'true';
    reader.style.cssText = 'min-width:0;overflow:auto;padding:16px;';
    if (mode === 'mobile') {
      const back = createButton('Back to Catalog');
      back.dataset.codexCatalogBack = 'true';
      back.style.marginBottom = '12px';
      back.addEventListener('click', () => {
        mobileShowingCatalog = true;
        render();
      });
      reader.appendChild(back);
    }
    if (page) {
      reader.appendChild(createWonderCodexPage(page, {
        mode,
        reducedMotion: callbacks.reducedMotion,
        onAction: handleAction,
        onSelectRelated: wonderId => {
          selectedWonderId = wonderId;
          mobileShowingCatalog = false;
          render();
        },
      }));
    } else {
      appendText(reader, 'p', 'No wonders recorded yet.', 'margin:0;opacity:0.74;');
    }
    return reader;
  }

  function render(): void {
    body.textContent = '';
    const model = getWonderCodexViewModel(state, state.currentPlayer, { mode, initialWonderId: selectedWonderId });
    selectedWonderId = model.selectedPage?.id ?? selectedWonderId;
    if (mode === 'mobile') {
      body.style.gridTemplateColumns = '1fr';
      body.appendChild(mobileShowingCatalog ? renderCatalog(model.catalogEntries) : renderReader(model.selectedPage));
      return;
    }
    body.style.gridTemplateColumns = 'minmax(220px,300px) 1fr';
    body.append(renderCatalog(model.catalogEntries), renderReader(model.selectedPage));
  }

  render();
  container.appendChild(panel);
  return panel;
}
```

- [ ] **Step 4: Run panel and page tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/wonder-codex-page.test.ts tests/ui/wonder-codex-panel.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit panel UI**

Run:

```bash
git add src/ui/wonder-codex-panel.ts tests/ui/wonder-codex-panel.test.ts
git commit -m "feat(wonders): add immersive codex panel"
```

## Task 7: Delegate Existing Atlas Entry Point And Update Roadmap

**Files:**

- Modify: `src/ui/wonder-atlas-panel.ts`
- Modify: `tests/ui/wonder-atlas-panel.test.ts`
- Modify: `docs/superpowers/specs/2026-05-21-wonder-atlas-and-map-identity-design.md`
- Modify: `docs/superpowers/specs/2026-05-22-legendary-wonder-city-presence-design.md`
- Modify: `docs/superpowers/specs/2026-05-23-wonder-codex-atlas-expansion-design.md`
- Modify: `docs/superpowers/plans/2026-05-22-legendary-wonder-city-presence.md`

- [ ] **Step 1: Write/modify Atlas public-entry tests**

Update `tests/ui/wonder-atlas-panel.test.ts` so it verifies the existing public function opens the codex shell. Keep the old privacy expectations, but assert against `#wonder-codex-panel`.

Add or replace with:

```ts
it('keeps createWonderAtlasPanel as the public entry point for the codex shell', () => {
  const state = makeState();
  state.discoveredWonders.great_volcano = 'player';
  state.wonderDiscoverers.great_volcano = ['player'];

  const panel = createWonderAtlasPanel(document.body, state, {
    onViewOnMap: () => {},
    onClose: () => {},
  });

  expect(panel.id).toBe('wonder-codex-panel');
  expect(document.querySelector('#wonder-codex-panel')).toBeTruthy();
  expect(document.body.textContent).toContain('Wonder Codex');
  expect(document.body.textContent).toContain('Great Volcano');
});
```

Update existing selectors:

- `[data-wonder-entry="great_volcano"]` becomes `[data-codex-entry-id="great_volcano"]`
- `[data-view-wonder-on-map="great_volcano"]` becomes `[data-codex-action="view-map"]`
- `#wonder-atlas-panel` becomes `#wonder-codex-panel`

- [ ] **Step 2: Run Atlas UI tests and verify they fail**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/wonder-atlas-panel.test.ts
```

Expected: FAIL because `createWonderAtlasPanel` still renders the old panel.

- [ ] **Step 3: Delegate `createWonderAtlasPanel` to codex panel**

Replace the implementation body of `src/ui/wonder-atlas-panel.ts` with a compatibility wrapper around `createWonderCodexPanel`. Keep exported callback names stable.

```ts
import type { GameState, HexCoord } from '@/core/types';
import { createWonderCodexPanel } from '@/ui/wonder-codex-panel';

export interface WonderAtlasCallbacks {
  onViewOnMap: (coord: HexCoord, wonderId: string) => void;
  onClose: () => void;
  initialWonderId?: string;
  reducedMotion?: boolean;
}

export function createWonderAtlasPanel(
  container: HTMLElement,
  state: GameState,
  callbacks: WonderAtlasCallbacks,
): HTMLElement {
  return createWonderCodexPanel(container, state, {
    initialWonderId: callbacks.initialWonderId,
    reducedMotion: callbacks.reducedMotion,
    onViewOnMap: callbacks.onViewOnMap,
    onOpenCity: () => {},
    onClose: callbacks.onClose,
  });
}
```

If live main wiring can pass an `onOpenCity` callback through an expanded public API without breaking callers, add it as optional:

```ts
onOpenCity?: (cityId: string) => void;
```

Then pass `callbacks.onOpenCity ?? (() => {})` to `createWonderCodexPanel`.

- [ ] **Step 4: Update roadmap docs**

Edit the relevant docs so deferred work is explicit and consistent:

- Stage 2E: richer bespoke landmark/codex art expansion.
- Stage 2F: Atlas Intel Records with explicit viewer-scoped rival-known legendary records.
- Stage 3: real 3-5 second video spike.

In `docs/superpowers/specs/2026-05-21-wonder-atlas-and-map-identity-design.md`, add a roadmap note after its non-goals or roadmap paragraph:

```md
Stage 2D replaces the initial practical Atlas detail surface with the immersive illustrated Wonder Codex. Stage 2E owns richer bespoke per-wonder art. Stage 2F owns explicit viewer-scoped rival-known legendary records. Stage 3 remains the real video spike.
```

In `docs/superpowers/specs/2026-05-22-legendary-wonder-city-presence-design.md`, ensure the deferred list includes Stage 2F:

```md
- **Stage 2F: Atlas Intel Records** - explicit viewer-scoped rival-known legendary records and safe known-rival Atlas pages after the intel model stores that knowledge.
```

In `docs/superpowers/specs/2026-05-23-wonder-codex-atlas-expansion-design.md`, add an implementation note if not already present:

```md
Implementation must update earlier Atlas and legendary-wonder roadmap docs in the same branch so Stage 2E, Stage 2F, and Stage 3 ownership remains visible.
```

- [ ] **Step 5: Run Atlas and codex tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/wonder-atlas-panel.test.ts tests/ui/wonder-codex-panel.test.ts tests/ui/wonder-codex-page.test.ts tests/systems/wonder-codex/presentation.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit Atlas delegation and roadmap updates**

Run:

```bash
git add src/ui/wonder-atlas-panel.ts tests/ui/wonder-atlas-panel.test.ts docs/superpowers/specs/2026-05-21-wonder-atlas-and-map-identity-design.md docs/superpowers/specs/2026-05-22-legendary-wonder-city-presence-design.md docs/superpowers/specs/2026-05-23-wonder-codex-atlas-expansion-design.md docs/superpowers/plans/2026-05-22-legendary-wonder-city-presence.md
git commit -m "feat(wonders): route atlas to illustrated codex"
```

## Task 8: Final Review, Verification, And Polish

**Files:**

- Inspect all changed files.
- Modify only files with issues discovered during review.

- [ ] **Step 1: Run source rule checks**

Run:

```bash
scripts/check-src-rule-violations.sh src/systems/wonder-codex/types.ts src/systems/wonder-codex/natural-content.ts src/systems/wonder-codex/legendary-content.ts src/systems/wonder-codex/content.ts src/systems/wonder-codex/related.ts src/systems/wonder-codex/presentation.ts src/ui/wonder-codex-page.ts src/ui/wonder-codex-panel.ts src/ui/wonder-atlas-panel.ts
```

Expected: exits 0.

- [ ] **Step 2: Run all targeted codex and Atlas tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/wonder-codex/content.test.ts tests/systems/wonder-codex/related.test.ts tests/systems/wonder-codex/presentation.test.ts tests/ui/wonder-codex-page.test.ts tests/ui/wonder-codex-panel.test.ts tests/ui/wonder-atlas-panel.test.ts tests/systems/wonder-atlas-presentation.test.ts
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

Expected: PASS.

- [ ] **Step 5: Run full tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test
```

Expected: PASS.

- [ ] **Step 6: Inspect branch and local diffs**

Run:

```bash
git diff --stat origin/main...HEAD
git diff --stat
git diff --check
```

Expected:

- branch diff includes only Stage 2D docs, codex system files, codex UI files, Atlas wrapper/tests, and required roadmap updates
- local diff is empty unless review fixes are still pending
- `git diff --check` exits 0

- [ ] **Step 7: Inline code review**

Review the branch for:

- completeness against `docs/superpowers/specs/2026-05-23-wonder-codex-atlas-expansion-design.md`
- content coverage for all natural and legendary wonder IDs
- UI rendering on desktop and mobile modes
- no direct Tauri imports
- no raw rival project/completion leakage into view models
- no old/new Atlas implementation drift
- tests enforcing future wonder/tag conventions
- roadmap updates for Stage 2E, Stage 2F, and Stage 3

If issues are found, fix them in the same branch and rerun the affected targeted tests plus build.

- [ ] **Step 8: Commit review fixes if any**

If Step 7 produced edits, run:

```bash
git add <changed-files>
git commit -m "fix(wonders): polish codex atlas regressions"
```

If Step 7 produced no edits, do not create an empty commit.

## Final Verification Commands

Before push or PR creation, the branch must have successful output for:

```bash
scripts/check-src-rule-violations.sh src/systems/wonder-codex/types.ts src/systems/wonder-codex/natural-content.ts src/systems/wonder-codex/legendary-content.ts src/systems/wonder-codex/content.ts src/systems/wonder-codex/related.ts src/systems/wonder-codex/presentation.ts src/ui/wonder-codex-page.ts src/ui/wonder-codex-panel.ts src/ui/wonder-atlas-panel.ts
./scripts/run-with-mise.sh yarn test --run tests/systems/wonder-codex/content.test.ts tests/systems/wonder-codex/related.test.ts tests/systems/wonder-codex/presentation.test.ts tests/ui/wonder-codex-page.test.ts tests/ui/wonder-codex-panel.test.ts tests/ui/wonder-atlas-panel.test.ts tests/systems/wonder-atlas-presentation.test.ts
./scripts/run-wonder-regressions.sh
./scripts/run-with-mise.sh yarn build
./scripts/run-with-mise.sh yarn test
```

## Self-Review Notes

- Spec coverage: Tasks 1-2 cover strict content; Task 3 covers related conventions; Task 4 covers presentation/privacy/selection; Tasks 5-7 cover UI, Atlas delegation, and responsive behavior; Task 7 covers roadmap updates; Task 8 covers verification and review.
- Type consistency: content entries use `WonderCodexContent`; presentation returns `WonderCodexViewModel`; UI consumes `WonderCodexPageViewModel` and `WonderCodexAction`.
- Known deferred work remains outside implementation: Stage 2E art, Stage 2F rival intel records, Stage 3 videos.
