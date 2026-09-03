# #887 Phase B — Great General Hall of Fame — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task (this repo forbids subagents — CLAUDE.md "Agent Policy"). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the player-facing Hall of Fame — a read-only screen listing every Great General the viewing civ has ever had, each with a ranked "memorable moments" mini-timeline and a compact stat line — plus a career line + link on the active General in `selected-unit-info`.

**Architecture:** A pure view-model builder `src/systems/great-general-hall-of-fame.ts` (`getHallOfFameForViewer(state, civId): HallOfFameEntry[]` + pure `classifyCareerEventImportance` / `describeMoment` / `selectMemorableMoments`) reads the MR1 ledger via `summarizeGeneralCareer` and resolves names/profiles/specialties. A pure render panel `src/ui/hall-of-fame-panel.ts` takes `HallOfFameEntry[]` only. Wiring mirrors the existing Bestiary panel: one `PanelId`, one `panelRegistry` entry, one `panel-actions-controller` open function, one `game-shell` toolbar button (hidden until the civ earns its first General, toggled in `hud-controller.update()` exactly like `btn-pirate-waters`).

**Tech Stack:** TypeScript, Canvas 2D game with DOM/CSS panels, Vitest (+ jsdom for UI tests), Vite. Run everything through `bash scripts/run-with-mise.sh yarn <cmd>`.

## Global Constraints

- Presentation only. No change to the MR1 ledger, recording sites, `GeneralCareerEvent` schema, `SAVE_VERSION`, or any migration.
- No `Math.random()` / `Date.now()` anywhere.
- Deterministic, pure builder: reads no `opponentChallenge` / challenge-profile input; identical output across Explorer / Standard / Veteran.
- Hot-seat: every builder call, the toolbar-button visibility check, and the selected-unit line use `state.currentPlayer`. Never read another civ's `generalHistory`.
- No new bus events, notifications, audio assets, ceremony/fanfare, bespoke art, animation, or persisted "unread" state.
- All dynamic DOM text via `textContent` / `createTextNode()` — never `innerHTML` with data-derived strings.
- Buttons: `createGameButton(label, variant)` from `@/ui/ui-kit` (variants `primary|secondary|ghost|danger|close`), or `createFloatingButton` for the utility toolbar. `min-height: 44px` touch targets.
- Commit trailer on every commit: `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`
- Before any `git push` / `gh pr create`: `bash scripts/run-with-mise.sh yarn build` AND `bash scripts/run-with-mise.sh yarn test` must both exit 0.
- Bash tool timeouts: `git commit` → 30000 ms; `git push` / `gh pr create` → 120000 ms.

## MR1 backend surface (already merged, PR #940) — consumed by this plan

From `src/systems/great-general-career.ts`:
```ts
export interface GeneralCareerSummary {
  generalDefinitionId: string; spawnedTurn: number; lastActiveTurn: number;
  status: 'active' | 'retired' | 'fallen';
  careerTurns: number;               // (retiredTurn ?? diedTurn ?? lastActiveTurn) − spawnedTurn, floored at 0
  battlesInfluenced: number; citiesCaptured: number; uniqueCitiesDefended: number;
  cityDefenseActions: number; unitsSaved: number;
  rallyUses: number; seizeUses: number; lastStandUses: number; finalCommandUsed: boolean;
}
export function summarizeGeneralCareer(entry: GeneralHistoryEntry): GeneralCareerSummary;
export function summarizeCivHallOfFame(civ: Pick<Civilization, 'generalHistory'>): GeneralCareerSummary[];
export function getGeneralCareerForViewer(state: GameState, viewerCivId: string, generalDefinitionId: string): GeneralCareerSummary | undefined;
export function describeGeneralCareerHighlights(summary: GeneralCareerSummary): string; // ' — 1 city captured, 2 battles influenced.' or ''
```
From `src/core/types.ts`:
```ts
export interface GeneralHistoryEntry {
  unitId: string; generalDefinitionId: string; spawnedTurn: number;
  diedTurn?: number; outcome?: 'retired' | 'died'; retiredTurn?: number;
  endOfCareerLine?: string; heroicCommandsUsed?: number;
  careerEvents?: GeneralCareerEvent[];
}
export type GeneralCareerEventReason = 'last-stand' | 'seize';
export type GeneralCareerEvent =
  | { type: 'spawned'; turn: number }
  | { type: 'rally-used'; turn: number; unitsAffected: number; totalHpRestored: number }
  | { type: 'seize-used'; turn: number; unitsRefreshed: number }
  | { type: 'last-stand-issued'; turn: number; unitsProtected: number }
  | { type: 'unit-saved'; turn: number; via: 'last-stand'; unitId: string; unitType: UnitType; remainingHp: number; location: HexCoord }
  | { type: 'battle-influenced'; turn: number; combatId: string; reasons: GeneralCareerEventReason[]; location: HexCoord }
  | { type: 'city-defended'; turn: number; cityId: string; cityName: string }
  | { type: 'city-captured'; turn: number; cityId: string; cityName: string }
  | { type: 'final-command'; turn: number }
  | { type: 'retired'; turn: number; reason: 'charges-expended' }
  | { type: 'killed'; turn: number };
```
Other helpers:
```ts
// src/systems/great-general-definitions.ts
export function resolveGeneralDefinition(source: { generatedGenerals?: Record<string, GeneratedGeneralIdentity> } | null | undefined, generalId: string | undefined): GeneralDefinition | undefined;
// GeneralDefinition: { id, name, civTypeEligibility, era, descriptor, portraitIcon, commandRange, commandCapacity, abilityIds, maxCommandCharges, cooldownTurns, origin? }

// src/systems/great-general-profiles.ts
export function getGeneralProfile(generalId: string | undefined): GeneralProfile | undefined;
// GeneralProfile: { kind: 'historical' | 'lore'; summary: string; facts: string[]; context?: string; sources: GeneralSourceNote[]; loreWork?: string }

// src/systems/great-general-specialties.ts
export function getGeneralSpecialtyPresentation(def: Pick<GeneralDefinition, 'id'>): { id: GeneralSpecialtyId; displayName: string; summary: string } | undefined;

// src/systems/unit-system.ts
export const UNIT_DEFINITIONS: Record<UnitType, { type: UnitType; name: string; /* … */ }>;
```

---

### Task 1: `great-general-hall-of-fame.ts` — pure event ranking + moment selection — ✅ done (`27f8f89d`)

**Files:**
- Create: `src/systems/great-general-hall-of-fame.ts`
- Create: `tests/systems/great-general-hall-of-fame.test.ts`
- Modify: `tests/systems/great-general-career.test.ts` (extend the "AI never reads" guard — around line 194)

**Interfaces:**
- Consumes: `GeneralCareerEvent`, `GeneralHistoryEntry` from `@/core/types`; `summarizeGeneralCareer`, `GeneralCareerSummary` from `@/systems/great-general-career`; `UNIT_DEFINITIONS` from `@/systems/unit-system`.
- Produces (used by Tasks 2, 3):
  ```ts
  export interface HallOfFameMoment { turn: number; text: string; }
  export function classifyCareerEventImportance(event: GeneralCareerEvent): number;
  export function describeMoment(event: GeneralCareerEvent): string | null;
  export function selectMemorableMoments(entry: GeneralHistoryEntry, cap?: number): HallOfFameMoment[];
  ```

- [x] **Step 1: Write the failing test**

Create `tests/systems/great-general-hall-of-fame.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import type { GeneralCareerEvent, GeneralHistoryEntry } from '@/core/types';
import {
  classifyCareerEventImportance,
  describeMoment,
  selectMemorableMoments,
} from '@/systems/great-general-hall-of-fame';

function entry(careerEvents: GeneralCareerEvent[], over: Partial<GeneralHistoryEntry> = {}): GeneralHistoryEntry {
  return { unitId: 'u1', generalDefinitionId: 'gen_caesar', spawnedTurn: 5, careerEvents, ...over };
}

describe('classifyCareerEventImportance', () => {
  it('ranks city events highest, then final command, then unit-saved', () => {
    expect(classifyCareerEventImportance({ type: 'city-captured', turn: 1, cityId: 'c', cityName: 'Thebes' })).toBe(5);
    expect(classifyCareerEventImportance({ type: 'city-defended', turn: 1, cityId: 'c', cityName: 'Thebes' })).toBe(5);
    expect(classifyCareerEventImportance({ type: 'final-command', turn: 1 })).toBe(4);
    expect(classifyCareerEventImportance({ type: 'unit-saved', turn: 1, via: 'last-stand', unitId: 'x', unitType: 'warrior', remainingHp: 1, location: { q: 0, r: 0 } })).toBe(3);
  });

  it('ranks a two-reason battle above a one-reason battle', () => {
    expect(classifyCareerEventImportance({ type: 'battle-influenced', turn: 1, combatId: 'a:b:1', reasons: ['last-stand', 'seize'], location: { q: 0, r: 0 } })).toBe(2);
    expect(classifyCareerEventImportance({ type: 'battle-influenced', turn: 1, combatId: 'a:b:1', reasons: ['last-stand'], location: { q: 0, r: 0 } })).toBe(1);
  });

  it('ranks routine ability use and any unrecognised future type at 0', () => {
    expect(classifyCareerEventImportance({ type: 'rally-used', turn: 1, unitsAffected: 2, totalHpRestored: 20 })).toBe(0);
    expect(classifyCareerEventImportance({ type: 'seize-used', turn: 1, unitsRefreshed: 2 })).toBe(0);
    expect(classifyCareerEventImportance({ type: 'last-stand-issued', turn: 1, unitsProtected: 2 })).toBe(0);
    expect(classifyCareerEventImportance({ type: 'spawned', turn: 1 })).toBe(0);
    expect(classifyCareerEventImportance({ type: 'future-thing', turn: 1 } as unknown as GeneralCareerEvent)).toBe(0);
  });
});

describe('describeMoment', () => {
  it('produces plain, coordinate-free text for each mapped kind', () => {
    expect(describeMoment({ type: 'city-captured', turn: 1, cityId: 'c', cityName: 'Thebes' })).toBe('captured Thebes');
    expect(describeMoment({ type: 'city-defended', turn: 1, cityId: 'c', cityName: 'Memphis' })).toBe('defended Memphis');
    expect(describeMoment({ type: 'unit-saved', turn: 1, via: 'last-stand', unitId: 'x', unitType: 'warrior', remainingHp: 1, location: { q: 3, r: -2 } }))
      .toBe('pulled a Warrior back from the brink');
    expect(describeMoment({ type: 'final-command', turn: 1 })).toBe('gave their final command');
    expect(describeMoment({ type: 'battle-influenced', turn: 1, combatId: 'a:b:1', reasons: ['last-stand', 'seize'], location: { q: 0, r: 0 } })).toBe('turned a desperate battle');
    expect(describeMoment({ type: 'battle-influenced', turn: 1, combatId: 'a:b:1', reasons: ['seize'], location: { q: 0, r: 0 } })).toBe('helped win a hard-fought battle');
  });

  it('returns null for an unrecognised or bookend/routine kind', () => {
    expect(describeMoment({ type: 'spawned', turn: 1 })).toBeNull();
    expect(describeMoment({ type: 'rally-used', turn: 1, unitsAffected: 1, totalHpRestored: 5 })).toBeNull();
    expect(describeMoment({ type: 'future-thing', turn: 1 } as unknown as GeneralCareerEvent)).toBeNull();
  });

  it('never emits a raw axial-coordinate substring', () => {
    const m = describeMoment({ type: 'unit-saved', turn: 1, via: 'last-stand', unitId: 'x', unitType: 'archer', remainingHp: 1, location: { q: 12, r: -8 } });
    expect(m).not.toMatch(/\(-?\d+,\s*-?\d+\)/);
  });
});

describe('selectMemorableMoments', () => {
  it('caps at 5, picks highest importance first, then returns them chronologically', () => {
    const events: GeneralCareerEvent[] = [
      { type: 'spawned', turn: 1 },
      { type: 'battle-influenced', turn: 3, combatId: 'a:b:3', reasons: ['seize'], location: { q: 0, r: 0 } },
      { type: 'battle-influenced', turn: 4, combatId: 'a:b:4', reasons: ['last-stand'], location: { q: 0, r: 0 } },
      { type: 'city-captured', turn: 10, cityId: 'c1', cityName: 'Thebes' },
      { type: 'unit-saved', turn: 8, via: 'last-stand', unitId: 'x', unitType: 'warrior', remainingHp: 1, location: { q: 0, r: 0 } },
      { type: 'city-defended', turn: 12, cityId: 'c2', cityName: 'Memphis' },
      { type: 'final-command', turn: 14 },
      { type: 'battle-influenced', turn: 15, combatId: 'a:b:15', reasons: ['seize'], location: { q: 0, r: 0 } },
    ];
    const moments = selectMemorableMoments(entry(events));
    expect(moments).toHaveLength(5);
    expect(moments.map(m => m.turn)).toEqual([8, 10, 12, 14, 15].slice().sort((a, b) => a - b));
    // the two rank-5 city events and rank-4 final-command are kept; one of the rank-1 battles is dropped
    expect(moments.map(m => m.text)).toContain('captured Thebes');
    expect(moments.map(m => m.text)).toContain('defended Memphis');
    expect(moments.map(m => m.text)).toContain('gave their final command');
  });

  it('city events and unit-saved always beat single-reason battle-influenced when capped', () => {
    const events: GeneralCareerEvent[] = [
      ...Array.from({ length: 6 }, (_v, i): GeneralCareerEvent => ({ type: 'battle-influenced', turn: 2 + i, combatId: `a:b:${i}`, reasons: ['seize'], location: { q: 0, r: 0 } })),
      { type: 'city-captured', turn: 20, cityId: 'c1', cityName: 'Thebes' },
    ];
    const moments = selectMemorableMoments(entry(events));
    expect(moments.map(m => m.text)).toContain('captured Thebes');
  });

  it('drops an unrecognised event without throwing', () => {
    const events = [
      { type: 'future-thing', turn: 4 },
      { type: 'city-captured', turn: 5, cityId: 'c', cityName: 'Thebes' },
    ] as unknown as GeneralCareerEvent[];
    expect(selectMemorableMoments(entry(events)).map(m => m.text)).toEqual(['captured Thebes']);
  });

  it('synthesises one "steadied the ranks" moment for a General with only ability uses', () => {
    const events: GeneralCareerEvent[] = [
      { type: 'spawned', turn: 5 },
      { type: 'rally-used', turn: 7, unitsAffected: 3, totalHpRestored: 40 },
      { type: 'seize-used', turn: 9, unitsRefreshed: 2 },
    ];
    expect(selectMemorableMoments(entry(events))).toEqual([{ turn: 5, text: 'steadied the ranks through 2 heroic commands' }]);
  });

  it('returns [] for a career with only a spawn event', () => {
    expect(selectMemorableMoments(entry([{ type: 'spawned', turn: 5 }]))).toEqual([]);
  });
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/great-general-hall-of-fame.test.ts`
Expected: FAIL — `Cannot find module '@/systems/great-general-hall-of-fame'`.

- [x] **Step 3: Create the module with the pure helpers**

Create `src/systems/great-general-hall-of-fame.ts`:
```ts
/**
 * #887 Phase B — the player-facing Great General Hall of Fame view-model.
 *
 * Presentation/aggregation over the MR1 career ledger (`great-general-career.ts`,
 * which stays pure and import-only-`@/core/types`). Nothing here mutates state
 * or reads `opponentChallenge`; output is identical across difficulty modes.
 * The AI never imports this module (guard in great-general-career.test.ts).
 */
import type { GeneralCareerEvent, GeneralHistoryEntry } from '@/core/types';
import { summarizeGeneralCareer } from '@/systems/great-general-career';
import { UNIT_DEFINITIONS } from '@/systems/unit-system';

export interface HallOfFameMoment {
  turn: number;
  text: string;
}

/**
 * How memorable one career event is, for "moments" selection. Higher = more
 * memorable. `spawned`/`killed`/`retired` are bookends (rendered separately);
 * routine ability use and any event type a later MR adds without teaching this
 * function fall through to 0 and are never surfaced as an individual moment.
 * Opt a new memorable type in by adding a case here.
 */
export function classifyCareerEventImportance(event: GeneralCareerEvent): number {
  switch (event.type) {
    case 'city-captured':
    case 'city-defended':
      return 5;
    case 'final-command':
      return 4;
    case 'unit-saved':
      return 3;
    case 'battle-influenced':
      return event.reasons.length >= 2 ? 2 : 1;
    default:
      return 0;
  }
}

/**
 * Plain-language, coordinate-free, `textContent`-safe phrasing for one moment.
 * `null` for a kind that is not an individual moment (bookend, routine, or an
 * unrecognised future type) so callers filter it out.
 */
export function describeMoment(event: GeneralCareerEvent): string | null {
  switch (event.type) {
    case 'city-captured':
      return `captured ${event.cityName}`;
    case 'city-defended':
      return `defended ${event.cityName}`;
    case 'unit-saved':
      return `pulled a ${UNIT_DEFINITIONS[event.unitType]?.name ?? 'unit'} back from the brink`;
    case 'final-command':
      return 'gave their final command';
    case 'battle-influenced':
      return event.reasons.length >= 2 ? 'turned a desperate battle' : 'helped win a hard-fought battle';
    default:
      return null;
  }
}

/**
 * Up to `cap` ranked memorable moments for the card timeline, returned
 * chronologically. If nothing ranks and the General still used heroic commands
 * (a peaceful/builder playstyle), synthesise one summary line so the timeline
 * is never blank.
 */
export function selectMemorableMoments(entry: GeneralHistoryEntry, cap = 5): HallOfFameMoment[] {
  const events = entry.careerEvents ?? [];
  const moments = events
    .map(event => ({ event, importance: classifyCareerEventImportance(event) }))
    .filter(x => x.importance >= 1)
    .sort((a, b) => b.importance - a.importance || a.event.turn - b.event.turn)
    .slice(0, cap)
    .map(x => {
      const text = describeMoment(x.event);
      return text === null ? null : { turn: x.event.turn, text };
    })
    .filter((m): m is HallOfFameMoment => m !== null)
    .sort((a, b) => a.turn - b.turn);

  if (moments.length === 0) {
    const summary = summarizeGeneralCareer(entry);
    const commands = summary.rallyUses + summary.seizeUses + summary.lastStandUses;
    if (commands > 0) {
      return [{ turn: entry.spawnedTurn, text: `steadied the ranks through ${commands} heroic commands` }];
    }
  }
  return moments;
}
```

- [x] **Step 4: Run the test to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/great-general-hall-of-fame.test.ts`
Expected: PASS (all `describe` blocks green).

- [x] **Step 5: Extend the MR1 "AI never reads the career ledger" guard**

In `tests/systems/great-general-career.test.ts`, replace the body of the `it('no file under src/ai references great-general-career', …)` test (around line 194) with:
```ts
  it('no file under src/ai references the career ledger or its Hall of Fame view', () => {
    for (const f of tsFiles('src/ai')) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).not.toContain('great-general-career');
      expect(src, f).not.toContain('great-general-hall-of-fame');
      expect(src, f).not.toContain('hall-of-fame-panel');
    }
  });
```

- [x] **Step 6: Run the guard + full career test file**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/great-general-career.test.ts tests/systems/great-general-hall-of-fame.test.ts`
Expected: PASS (guard green — no `src/ai` file references any of the three).

- [x] **Step 7: Commit**

```bash
git add src/systems/great-general-hall-of-fame.ts tests/systems/great-general-hall-of-fame.test.ts tests/systems/great-general-career.test.ts
git commit -m "$(printf 'feat(#887): Hall of Fame moment ranking (classify + describe + select)\n\nPure, state-free helpers over the MR1 career ledger. A rank-0 default and\na null describeMoment fallback keep an unrecognised future event type from\ncrashing or rendering [object Object]. Peaceful-General fallback synthesises\none "steadied the ranks" moment. AI-import guard extended.\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>')"
```

---

### Task 2: `getHallOfFameForViewer` + `HallOfFameEntry` — ✅ done (`f7b34519`; used `gen_caesar` → `initiative` specialty per Step 1 note)

**Files:**
- Modify: `src/systems/great-general-hall-of-fame.ts`
- Modify: `tests/systems/great-general-hall-of-fame.test.ts`

**Interfaces:**
- Consumes: `classifyCareerEventImportance`, `selectMemorableMoments`, `HallOfFameMoment` from Task 1; `GameState` from `@/core/types`; `summarizeGeneralCareer`, `describeGeneralCareerHighlights` from `@/systems/great-general-career`; `resolveGeneralDefinition` from `@/systems/great-general-definitions`; `getGeneralProfile` from `@/systems/great-general-profiles`; `getGeneralSpecialtyPresentation` from `@/systems/great-general-specialties`.
- Produces (used by Task 3, Task 4):
  ```ts
  export interface HallOfFameEntry {
    generalDefinitionId: string;
    name: string;
    portraitIcon: string;
    era: number | null;
    descriptor: string;
    status: 'active' | 'retired' | 'fallen';
    stats: GeneralCareerSummary;
    statLine: string;
    specialtyLine?: string;
    profile?: { kind: 'historical' | 'lore'; summary: string; facts: string[]; context?: string; loreWork?: string };
    bookendStart: string;
    bookendEnd?: string;
    moments: HallOfFameMoment[];
  }
  export function getHallOfFameForViewer(state: GameState, civId: string): HallOfFameEntry[];
  ```

- [x] **Step 1: Write the failing test**

Append to `tests/systems/great-general-hall-of-fame.test.ts`:
```ts
import type { GameState } from '@/core/types';
import { getHallOfFameForViewer } from '@/systems/great-general-hall-of-fame';

function civState(generalHistory: GeneralHistoryEntry[]): Pick<GameState, 'civilizations' | 'generatedGenerals'> {
  return {
    generatedGenerals: {},
    civilizations: {
      player: { id: 'player', generalHistory } as never,
      'ai-1': { id: 'ai-1', generalHistory: [
        { unitId: 'e1', generalDefinitionId: 'gen_ramesses', spawnedTurn: 2, careerEvents: [{ type: 'spawned', turn: 2 }] },
      ] } as never,
    },
  };
}

describe('getHallOfFameForViewer', () => {
  it('returns one entry per generalHistory entry, active first then most-recent-end first', () => {
    const history: GeneralHistoryEntry[] = [
      { unitId: 'u1', generalDefinitionId: 'gen_caesar', spawnedTurn: 4, outcome: 'died', diedTurn: 20,
        careerEvents: [{ type: 'spawned', turn: 4 }, { type: 'city-captured', turn: 10, cityId: 'c', cityName: 'Thebes' }, { type: 'killed', turn: 20 }] },
      { unitId: 'u2', generalDefinitionId: 'gen_boudica', spawnedTurn: 25, outcome: 'retired', retiredTurn: 40,
        careerEvents: [{ type: 'spawned', turn: 25 }, { type: 'retired', turn: 40, reason: 'charges-expended' }] },
      { unitId: 'u3', generalDefinitionId: 'gen_hannibal', spawnedTurn: 45,
        careerEvents: [{ type: 'spawned', turn: 45 }] },
    ];
    const state = civState(history) as unknown as GameState;
    const entries = getHallOfFameForViewer(state, 'player');
    expect(entries.map(e => e.generalDefinitionId)).toEqual(['gen_hannibal', 'gen_boudica', 'gen_caesar']);
    expect(entries.map(e => e.status)).toEqual(['active', 'retired', 'fallen']);
    expect(entries[0].bookendEnd).toBeUndefined();
    expect(entries[1].bookendEnd).toBe('Turn 40 — retired from service');
    expect(entries[2].bookendEnd).toBe('Turn 20 — fell in battle');
    expect(entries[2].bookendStart).toBe('Turn 4 — took command');
    expect(entries[2].moments.map(m => m.text)).toEqual(['captured Thebes']);
    expect(entries[2].statLine).toBe('1 city captured.');
  });

  it('returns [] when the civ has no general history', () => {
    const state = civState([]) as unknown as GameState;
    expect(getHallOfFameForViewer(state, 'player')).toEqual([]);
  });

  it('never returns another civ\'s Generals', () => {
    const state = civState([
      { unitId: 'u1', generalDefinitionId: 'gen_caesar', spawnedTurn: 4, careerEvents: [{ type: 'spawned', turn: 4 }] },
    ]) as unknown as GameState;
    const entries = getHallOfFameForViewer(state, 'player');
    expect(entries).toHaveLength(1);
    expect(entries.some(e => e.generalDefinitionId === 'gen_ramesses')).toBe(false);
  });

  it('renders a generated officer with no profile and no specialty line', () => {
    const genId = 'generated:rome:3:abcd1234';
    const state = {
      generatedGenerals: { [genId]: {
        id: genId, name: 'Servius Longinus', civTypeEligibility: ['rome'], era: 3,
        descriptor: 'Legatus. A Roman field commander.', portraitIcon: '🦅', origin: 'generated',
        commandRange: 2, commandCapacity: 3, abilityIds: ['rally', 'seize_the_moment', 'last_stand'],
        maxCommandCharges: 3, cooldownTurns: 10,
      } },
      civilizations: { player: { id: 'player', generalHistory: [
        { unitId: 'u1', generalDefinitionId: genId, spawnedTurn: 3, careerEvents: [{ type: 'spawned', turn: 3 }] },
      ] } as never },
    } as unknown as GameState;
    const [e] = getHallOfFameForViewer(state, 'player');
    expect(e.name).toBe('Servius Longinus');
    expect(e.profile).toBeUndefined();
    expect(e.specialtyLine).toBeUndefined();
  });

  it('renders a "forgotten commander" fallback card for an unresolvable definition id', () => {
    const state = civState([
      { unitId: 'u1', generalDefinitionId: 'gen_deleted_in_a_later_release', spawnedTurn: 4, outcome: 'died', diedTurn: 9,
        careerEvents: [{ type: 'spawned', turn: 4 }, { type: 'city-captured', turn: 6, cityId: 'c', cityName: 'Ur' }, { type: 'killed', turn: 9 }] },
    ]) as unknown as GameState;
    const [e] = getHallOfFameForViewer(state, 'player');
    expect(e.name).toBe('A forgotten commander');
    expect(e.portraitIcon).toBe('');
    expect(e.era).toBeNull();
    expect(e.descriptor).toBe('');
    expect(e.profile).toBeUndefined();
    expect(e.moments.map(m => m.text)).toEqual(['captured Ur']);
    expect(e.bookendEnd).toBe('Turn 9 — fell in battle');
  });

  it('carries an authored profile and specialty line for an authored General', () => {
    const state = civState([
      { unitId: 'u1', generalDefinitionId: 'gen_caesar', spawnedTurn: 4, careerEvents: [{ type: 'spawned', turn: 4 }] },
    ]) as unknown as GameState;
    const [e] = getHallOfFameForViewer(state, 'player');
    expect(e.profile?.kind).toBe('historical');
    expect(typeof e.profile?.summary).toBe('string');
    // gen_caesar has an authored specialty; the line is "displayName — summary"
    expect(e.specialtyLine && e.specialtyLine.includes(' — ')).toBe(true);
  });

  it('gives an all-zeros active General an empty statLine and empty moments', () => {
    const state = civState([
      { unitId: 'u1', generalDefinitionId: 'gen_caesar', spawnedTurn: 4, careerEvents: [{ type: 'spawned', turn: 4 }] },
    ]) as unknown as GameState;
    const [e] = getHallOfFameForViewer(state, 'player');
    expect(e.statLine).toBe('');
    expect(e.moments).toEqual([]);
    expect(e.status).toBe('active');
  });
});
```
> Note: `gen_caesar`, `gen_boudica`, `gen_hannibal`, `gen_ramesses` are real authored roster ids. If any of these has no authored specialty in the current roster, the "authored profile and specialty line" test's specialty assertion may need a different id — pick one from `GENERAL_SPECIALTY_ASSIGNMENTS` in `src/systems/great-general-specialties.ts` that maps to a non-`generalist` specialty. Verify with a quick grep during implementation.

- [x] **Step 2: Run the test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/great-general-hall-of-fame.test.ts`
Expected: FAIL — `getHallOfFameForViewer` is not exported.

- [x] **Step 3: Add the builder to `great-general-hall-of-fame.ts`**

Add these imports at the top of `src/systems/great-general-hall-of-fame.ts`:
```ts
import type { GameState, GeneralHistoryEntry } from '@/core/types';
import { summarizeGeneralCareer, describeGeneralCareerHighlights, type GeneralCareerSummary } from '@/systems/great-general-career';
import { resolveGeneralDefinition } from '@/systems/great-general-definitions';
import { getGeneralProfile } from '@/systems/great-general-profiles';
import { getGeneralSpecialtyPresentation } from '@/systems/great-general-specialties';
```
(merge the `GeneralHistoryEntry` / `summarizeGeneralCareer` imports with Task 1's — do not duplicate import lines).

Append to the module:
```ts
export interface HallOfFameEntry {
  generalDefinitionId: string;
  name: string;
  portraitIcon: string;
  era: number | null;
  descriptor: string;
  status: 'active' | 'retired' | 'fallen';
  stats: GeneralCareerSummary;
  /** describeGeneralCareerHighlights(stats) with the leading " — " stripped; "" when nothing notable. */
  statLine: string;
  /** "{displayName} — {summary}"; omitted for generalist / generated / unresolvable. */
  specialtyLine?: string;
  /** Authored Generals only. */
  profile?: { kind: 'historical' | 'lore'; summary: string; facts: string[]; context?: string; loreWork?: string };
  bookendStart: string;
  bookendEnd?: string;
  moments: HallOfFameMoment[];
}

function bookendEndFor(entry: GeneralHistoryEntry): string | undefined {
  if (entry.outcome === 'died') return `Turn ${entry.diedTurn ?? entry.spawnedTurn} — fell in battle`;
  if (entry.outcome === 'retired') return `Turn ${entry.retiredTurn ?? entry.spawnedTurn} — retired from service`;
  return undefined;
}

function buildHallOfFameEntry(state: GameState, entry: GeneralHistoryEntry): HallOfFameEntry {
  const stats = summarizeGeneralCareer(entry);
  const definition = resolveGeneralDefinition(state, entry.generalDefinitionId);
  const profile = definition ? getGeneralProfile(definition.id) : undefined;
  const specialty = definition ? getGeneralSpecialtyPresentation(definition) : undefined;
  const highlights = describeGeneralCareerHighlights(stats);
  return {
    generalDefinitionId: entry.generalDefinitionId,
    name: definition?.name ?? 'A forgotten commander',
    portraitIcon: definition?.portraitIcon ?? '',
    era: definition?.era ?? null,
    descriptor: definition?.descriptor ?? '',
    status: stats.status,
    stats,
    statLine: highlights.startsWith(' — ') ? highlights.slice(3) : highlights,
    specialtyLine: specialty ? `${specialty.displayName} — ${specialty.summary}` : undefined,
    profile: profile
      ? { kind: profile.kind, summary: profile.summary, facts: profile.facts, context: profile.context, loreWork: profile.loreWork }
      : undefined,
    bookendStart: `Turn ${entry.spawnedTurn} — took command`,
    bookendEnd: bookendEndFor(entry),
    moments: selectMemorableMoments(entry),
  };
}

function compareHallOfFameEntries(a: HallOfFameEntry, b: HallOfFameEntry): number {
  const activeRank = (s: HallOfFameEntry['status']) => (s === 'active' ? 0 : 1);
  if (activeRank(a.status) !== activeRank(b.status)) return activeRank(a.status) - activeRank(b.status);
  const endA = a.stats.spawnedTurn + a.stats.careerTurns;
  const endB = b.stats.spawnedTurn + b.stats.careerTurns;
  if (endA !== endB) return endB - endA;
  return b.stats.spawnedTurn - a.stats.spawnedTurn;
}

/**
 * Every Great General `civId` has ever had, resolved for display. Viewer-scoped:
 * reads only `civId`'s own `generalHistory` — never another civ's. `[]` when the
 * civ has never earned a General. Callers pass `state.currentPlayer`.
 */
export function getHallOfFameForViewer(state: GameState, civId: string): HallOfFameEntry[] {
  const history = state.civilizations[civId]?.generalHistory ?? [];
  return history.map(entry => buildHallOfFameEntry(state, entry)).sort(compareHallOfFameEntries);
}
```

- [x] **Step 4: Run the test to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/great-general-hall-of-fame.test.ts`
Expected: PASS. If the "authored profile and specialty line" test fails only on the specialty assertion, swap the id per the Step 1 note and re-run.

- [x] **Step 5: Typecheck**

Run: `bash scripts/run-with-mise.sh yarn build`
Expected: exits 0 (tsc clean).

- [x] **Step 6: Commit**

```bash
git add src/systems/great-general-hall-of-fame.ts tests/systems/great-general-hall-of-fame.test.ts
git commit -m "$(printf 'feat(#887): getHallOfFameForViewer + HallOfFameEntry view-model\n\nMaps a civ own generalHistory to display entries: resolved name/era/\ndescriptor/portrait, authored profile + specialty line, synthesised\nbookends, ranked moments. Viewer-scoped (never another civ). Unresolvable\ndefinition id -> "A forgotten commander" fallback card. Active first, then\nmost-recent career end first.\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>')"
```

---

### Task 3: `hall-of-fame-panel.ts` — pure render — ✅ done (`ec6c8b05`)

**Files:**
- Create: `src/ui/hall-of-fame-panel.ts`
- Create: `tests/ui/hall-of-fame-panel.test.ts`

**Interfaces:**
- Consumes: `HallOfFameEntry` (type-only) from `@/systems/great-general-hall-of-fame`; `createGameButton` from `@/ui/ui-kit`.
- Produces (used by Task 4):
  ```ts
  export interface HallOfFamePanelCallbacks { onClose: () => void; }
  export function createHallOfFamePanel(container: HTMLElement, entries: HallOfFameEntry[], callbacks: HallOfFamePanelCallbacks): HTMLElement;
  ```

- [x] **Step 1: Write the failing test**

Create `tests/ui/hall-of-fame-panel.test.ts`:
```ts
// @vitest-environment jsdom

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHallOfFamePanel } from '@/ui/hall-of-fame-panel';
import type { HallOfFameEntry } from '@/systems/great-general-hall-of-fame';

function makeEntry(over: Partial<HallOfFameEntry> = {}): HallOfFameEntry {
  return {
    generalDefinitionId: 'gen_caesar',
    name: 'Julius Caesar',
    portraitIcon: '🦅',
    era: 2,
    descriptor: 'Dictator of Rome.',
    status: 'fallen',
    stats: {
      generalDefinitionId: 'gen_caesar', spawnedTurn: 4, lastActiveTurn: 20, status: 'fallen',
      careerTurns: 16, battlesInfluenced: 3, citiesCaptured: 2, uniqueCitiesDefended: 1,
      cityDefenseActions: 4, unitsSaved: 2, rallyUses: 1, seizeUses: 0, lastStandUses: 1, finalCommandUsed: true,
    },
    statLine: '2 cities captured, 1 city defended, 2 units saved, 3 battles influenced.',
    specialtyLine: 'Vanguard — presses the attack, weaker on defence',
    profile: { kind: 'historical', summary: 'A Roman general and statesman.', facts: ['Crossed the Rubicon.'], context: 'Late Republic.' },
    bookendStart: 'Turn 4 — took command',
    bookendEnd: 'Turn 20 — fell in battle',
    moments: [
      { turn: 10, text: 'captured Thebes' },
      { turn: 14, text: 'defended Memphis' },
      { turn: 20, text: 'gave their final command' },
    ],
    ...over,
  };
}

describe('hall of fame panel', () => {
  let container: HTMLElement;
  beforeEach(() => {
    document.body.innerHTML = '';
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  it('renders one <details> card per entry with no truncation', () => {
    const entries = [makeEntry({ generalDefinitionId: 'a', name: 'A' }), makeEntry({ generalDefinitionId: 'b', name: 'B' }), makeEntry({ generalDefinitionId: 'c', name: 'C' })];
    createHallOfFamePanel(container, entries, { onClose: () => {} });
    expect(container.querySelectorAll('[data-hall-of-fame-entry]')).toHaveLength(3);
  });

  it('shows the status word and the stat line in the summary', () => {
    createHallOfFamePanel(container, [makeEntry()], { onClose: () => {} });
    const summary = container.querySelector('[data-hall-of-fame-entry] summary')!;
    expect(summary.textContent).toContain('Julius Caesar');
    expect(summary.textContent).toContain('Fallen');
    expect(summary.textContent).toContain('2 cities captured');
  });

  it('opens the active General card and leaves an ended one collapsed', () => {
    const [active, ended] = [makeEntry({ generalDefinitionId: 'x', status: 'active', bookendEnd: undefined }), makeEntry({ generalDefinitionId: 'y', status: 'retired' })];
    createHallOfFamePanel(container, [active, ended], { onClose: () => {} });
    const cards = container.querySelectorAll<HTMLDetailsElement>('[data-hall-of-fame-entry]');
    expect(cards[0].open).toBe(true);
    expect(cards[1].open).toBe(false);
  });

  it('renders the timeline chronologically between the two bookends', () => {
    createHallOfFamePanel(container, [makeEntry()], { onClose: () => {} });
    const body = container.querySelector('[data-hall-of-fame-entry]')!.textContent!;
    const iStart = body.indexOf('Turn 4 — took command');
    const iT10 = body.indexOf('Turn 10 — captured Thebes');
    const iT14 = body.indexOf('Turn 14 — defended Memphis');
    const iEnd = body.indexOf('Turn 20 — fell in battle');
    expect(iStart).toBeGreaterThanOrEqual(0);
    expect(iStart).toBeLessThan(iT10);
    expect(iT10).toBeLessThan(iT14);
    expect(iT14).toBeLessThan(iEnd);
  });

  it('renders every stat number including zeros and uses uniqueCitiesDefended', () => {
    createHallOfFamePanel(container, [makeEntry()], { onClose: () => {} });
    const text = container.querySelector('[data-hall-of-fame-entry]')!.textContent!;
    expect(text).toContain('Cities defended 1');   // uniqueCitiesDefended, not cityDefenseActions (4)
    expect(text).toContain('Seize'); // the Rally/Seize/Last Stand triplet label
    expect(text).toMatch(/0/);       // seizeUses is 0 and must still be shown
  });

  it('shows the empty-state message and no cards for an empty roster', () => {
    createHallOfFamePanel(container, [], { onClose: () => {} });
    expect(container.querySelectorAll('[data-hall-of-fame-entry]')).toHaveLength(0);
    expect(container.textContent).toContain('No Great Generals have served yet');
  });

  it('close button removes the panel and calls onClose; a second call replaces rather than duplicates', () => {
    let closed = 0;
    createHallOfFamePanel(container, [makeEntry()], { onClose: () => { closed += 1; } });
    createHallOfFamePanel(container, [makeEntry()], { onClose: () => { closed += 1; } });
    expect(container.querySelectorAll('#hall-of-fame-panel')).toHaveLength(1);
    container.querySelector<HTMLButtonElement>('#hall-of-fame-panel [data-action="close"]')!.click();
    expect(container.querySelector('#hall-of-fame-panel')).toBeNull();
    expect(closed).toBe(1);
  });

  it('renders a name containing markup as literal text', () => {
    createHallOfFamePanel(container, [makeEntry({ name: '<b>Nero</b>' })], { onClose: () => {} });
    expect(container.querySelector('#hall-of-fame-panel b')).toBeNull();
    expect(container.textContent).toContain('<b>Nero</b>');
  });

  it('the panel module imports no GameState', () => {
    const src = readFileSync(resolve(__dirname, '../../src/ui/hall-of-fame-panel.ts'), 'utf8');
    expect(src).not.toMatch(/\bGameState\b/);
  });
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/ui/hall-of-fame-panel.test.ts`
Expected: FAIL — `Cannot find module '@/ui/hall-of-fame-panel'`.

- [x] **Step 3: Create the panel**

Create `src/ui/hall-of-fame-panel.ts`:
```ts
import type { HallOfFameEntry } from '@/systems/great-general-hall-of-fame';
import { createGameButton } from '@/ui/ui-kit';

export interface HallOfFamePanelCallbacks {
  onClose: () => void;
}

const STATUS_WORD: Record<HallOfFameEntry['status'], string> = {
  active: 'Active',
  retired: 'Retired',
  fallen: 'Fallen',
};

function line(text: string, css: string): HTMLDivElement {
  const el = document.createElement('div');
  el.textContent = text;
  el.style.cssText = css;
  return el;
}

function renderCard(entry: HallOfFameEntry): HTMLDetailsElement {
  const card = document.createElement('details');
  card.dataset.hallOfFameEntry = entry.generalDefinitionId;
  card.open = entry.status === 'active';
  card.style.cssText = 'margin-bottom:12px;background:rgba(255,255,255,0.06);border-radius:10px;padding:12px;';

  const summary = document.createElement('summary');
  summary.style.cssText = 'cursor:pointer;font-size:14px;color:#e8c170;list-style:none;';
  const eraText = entry.era === null ? '' : ` · Era ${entry.era}`;
  const tail = entry.statLine ? ` — ${entry.statLine}` : ' — no notable actions yet';
  summary.textContent = `${entry.portraitIcon ? entry.portraitIcon + ' ' : ''}${entry.name}${eraText} · ${STATUS_WORD[entry.status]}${tail}`;
  card.appendChild(summary);

  if (entry.descriptor) card.appendChild(line(entry.descriptor, 'font-size:11px;opacity:0.75;margin-top:6px;'));
  if (entry.specialtyLine) card.appendChild(line(entry.specialtyLine, 'font-size:11px;color:#f0c674;margin-top:3px;'));

  const timeline = document.createElement('div');
  timeline.style.cssText = 'font-size:12px;margin-top:8px;opacity:0.9;';
  timeline.appendChild(line(entry.bookendStart, 'margin-top:2px;'));
  for (const moment of entry.moments) {
    timeline.appendChild(line(`Turn ${moment.turn} — ${moment.text}`, 'margin-top:2px;'));
  }
  if (entry.bookendEnd) {
    timeline.appendChild(line(entry.bookendEnd, 'margin-top:2px;'));
  } else if (entry.moments.length === 0) {
    timeline.appendChild(line('Still serving — no notable actions recorded yet.', 'margin-top:2px;opacity:0.7;'));
  }
  card.appendChild(timeline);

  const s = entry.stats;
  card.appendChild(line(
    `Battles turned ${s.battlesInfluenced} · Cities captured ${s.citiesCaptured} · Cities defended ${s.uniqueCitiesDefended} · `
    + `Units saved ${s.unitsSaved} · Rally/Seize/Last Stand ${s.rallyUses}/${s.seizeUses}/${s.lastStandUses} · ${s.careerTurns} turns in command`,
    'font-size:11px;opacity:0.8;margin-top:8px;',
  ));

  if (entry.profile) {
    const bio = document.createElement('details');
    bio.style.cssText = 'margin-top:8px;font-size:11px;opacity:0.85;';
    const bioSummary = document.createElement('summary');
    bioSummary.style.cssText = 'cursor:pointer;opacity:0.8;';
    bioSummary.textContent = entry.profile.kind === 'historical' ? `Who was ${entry.name}?` : `About ${entry.name}`;
    bio.appendChild(bioSummary);
    bio.appendChild(line(entry.profile.summary, 'margin-top:4px;'));
    for (const fact of entry.profile.facts) bio.appendChild(line(`• ${fact}`, 'margin-top:3px;'));
    if (entry.profile.context) bio.appendChild(line(entry.profile.context, 'margin-top:4px;opacity:0.7;'));
    if (entry.profile.loreWork) bio.appendChild(line(`From: ${entry.profile.loreWork}`, 'margin-top:4px;opacity:0.6;font-style:italic;'));
    card.appendChild(bio);
  }

  return card;
}

export function createHallOfFamePanel(
  container: HTMLElement,
  entries: HallOfFameEntry[],
  callbacks: HallOfFamePanelCallbacks,
): HTMLElement {
  container.querySelector('#hall-of-fame-panel')?.remove();

  const panel = document.createElement('div');
  panel.id = 'hall-of-fame-panel';
  panel.style.cssText = 'position:absolute;inset:0;background:rgba(12,12,24,0.96);z-index:40;padding:16px;overflow:auto;';

  const header = document.createElement('div');
  header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;';
  const title = document.createElement('h2');
  title.textContent = 'Hall of Fame';
  title.style.cssText = 'font-size:20px;color:#e8c170;margin:0;';
  header.appendChild(title);
  const closeButton = createGameButton('✕', 'close');
  closeButton.dataset.action = 'close';
  closeButton.setAttribute('aria-label', 'Close panel');
  closeButton.addEventListener('click', () => { panel.remove(); callbacks.onClose(); });
  header.appendChild(closeButton);
  panel.appendChild(header);

  panel.appendChild(line('Every Great General who has served your civilization.', 'font-size:13px;opacity:0.8;margin:0 0 16px;'));

  if (entries.length === 0) {
    panel.appendChild(line(
      'No Great Generals have served yet. Earn one by leading your armies to hard-won victories.',
      'text-align:center;opacity:0.75;margin-top:32px;font-size:14px;',
    ));
  } else {
    for (const entry of entries) panel.appendChild(renderCard(entry));
  }

  container.appendChild(panel);
  return panel;
}
```

- [x] **Step 4: Run the test to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/ui/hall-of-fame-panel.test.ts`
Expected: PASS.

- [x] **Step 5: Confirm the src-edit hook is satisfied (no bare buttons)**

The panel creates no raw `document.createElement('button')` — the only button is `createGameButton('✕', 'close')`. If the `check-src-edit` hook flags anything on the Write, fix per its message before continuing.

- [x] **Step 6: Commit**

```bash
git add src/ui/hall-of-fame-panel.ts tests/ui/hall-of-fame-panel.test.ts
git commit -m "$(printf 'feat(#887): Hall of Fame panel (pure render over HallOfFameEntry)\n\nFull-screen transient panel, one <details> accordion per General (active\ncard open, ended collapsed), narrative timeline first then a compact stat\nline then an optional bio <details>. textContent-only; takes and imports\nno GameState. Empty-state message for an empty roster. Self-removing close\nbutton; a second call replaces rather than duplicates.\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>')"
```

---

### Task 4: Panel wiring — PanelId, registry entry, `openHallOfFame()` — ✅ done (`8642bb74`)

**Files:**
- Modify: `src/app/panel-registry.ts` (`PanelId` union, ~line 12-16)
- Modify: `src/app/bootstrap.ts` (`panelRegistry` object, ~line 585-607)
- Modify: `src/app/controllers/panel-actions-controller.ts` (imports ~line 64-65; interface ~line 114; impl near `openBestiary` ~line 189; return object ~line 1127)
- Modify: `tests/app/controllers/panel-actions-controller.test.ts`

**Interfaces:**
- Consumes: `getHallOfFameForViewer` from `@/systems/great-general-hall-of-fame`; `createHallOfFamePanel` from `@/ui/hall-of-fame-panel`.
- Produces: `PanelId` gains `'hall-of-fame'`; `PanelActionsController` gains `openHallOfFame(): void` (used by Task 5 registry entry and Task 6 selection-controller dep).

- [x] **Step 1: Write the failing test**

In `tests/app/controllers/panel-actions-controller.test.ts`, find the existing `openBestiary` test (search for `openBestiary`) and add a sibling directly after it. Mirror that test's setup exactly; the shape is:
```ts
  it('openHallOfFame renders the Hall of Fame for the current player', () => {
    // reuse the same `deps` / controller construction the openBestiary test uses
    const state = makeState(); // whatever helper that file already uses
    state.currentPlayer = 'player';
    state.civilizations.player.generalHistory = [
      { unitId: 'u1', generalDefinitionId: 'gen_caesar', spawnedTurn: 3,
        careerEvents: [{ type: 'spawned', turn: 3 }, { type: 'city-captured', turn: 6, cityId: 'c', cityName: 'Thebes' }] },
    ];
    session.setState(state); // however the file seeds session state

    controller.openHallOfFame();

    const panel = uiLayer.querySelector('#hall-of-fame-panel');
    expect(panel).not.toBeNull();
    expect(panel!.textContent).toContain('captured Thebes');
  });
```
> If that test file mocks `@/ui/*` panels (some controller tests do), mock `@/ui/hall-of-fame-panel` the same way the others are mocked and assert `createHallOfFamePanel` was called with `(uiLayer, <entries>, { onClose: expect.any(Function) })` where `<entries>` is `getHallOfFameForViewer(state, 'player')`. Match the file's existing convention rather than introducing a new one.

- [x] **Step 2: Run the test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/app/controllers/panel-actions-controller.test.ts`
Expected: FAIL — `controller.openHallOfFame is not a function`.

- [x] **Step 3: Add `'hall-of-fame'` to the `PanelId` union**

In `src/app/panel-registry.ts`, extend the union:
```ts
export type PanelId =
  | 'council' | 'tech' | 'city' | 'espionage' | 'diplomacy' | 'marketplace'
  | 'network' | 'wonder' | 'wonder-atlas' | 'bestiary' | 'pirate-waters'
  | 'notification-log' | 'city-overview' | 'territory-inspection' | 'pacing-debug'
  | 'strategic-arsenal' | 'hall-of-fame';
```

- [x] **Step 4: Add `openHallOfFame` to the panel-actions controller**

In `src/app/controllers/panel-actions-controller.ts`:

Add imports next to the bestiary imports (~line 64):
```ts
import { getHallOfFameForViewer } from '@/systems/great-general-hall-of-fame';
import { createHallOfFamePanel } from '@/ui/hall-of-fame-panel';
```

Add to the controller interface (near `openBestiary(): void;` ~line 114):
```ts
  openHallOfFame(): void;
```

Add the implementation directly after `openBestiary` (~line 195):
```ts
  function openHallOfFame(): void {
    const state = deps.session.getState();
    createHallOfFamePanel(
      deps.uiLayer,
      getHallOfFameForViewer(state, state.currentPlayer),
      { onClose: () => {} },
    );
  }
```

Add `openHallOfFame` to the returned object (near `openBestiary,` ~line 1127):
```ts
    openHallOfFame,
```

- [x] **Step 5: Add the registry entry**

In `src/app/bootstrap.ts`, in the `panelRegistry` object (right after the `bestiary:` line ~607):
```ts
    'hall-of-fame': { domId: 'hall-of-fame-panel', group: 'transient', open: () => panelActions.openHallOfFame() },
```

- [x] **Step 6: Run the test to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/app/controllers/panel-actions-controller.test.ts tests/app/bootstrap.test.ts`
Expected: PASS.

- [x] **Step 7: Typecheck**

Run: `bash scripts/run-with-mise.sh yarn build`
Expected: exits 0.

- [x] **Step 8: Commit**

```bash
git add src/app/panel-registry.ts src/app/bootstrap.ts src/app/controllers/panel-actions-controller.ts tests/app/controllers/panel-actions-controller.test.ts
git commit -m "$(printf 'feat(#887): wire the hall-of-fame panel (PanelId + registry + open action)\n\npanel-actions-controller.openHallOfFame() builds getHallOfFameForViewer\nfor state.currentPlayer and hands it to createHallOfFamePanel. Registered\nas a transient panel, mirroring bestiary.\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>')"
```

---

### Task 5: Toolbar button (`🎖️`) + earned-first visibility — ✅ done (`23442c59`; hud-controller pirate-waters block now ~L228, not L179 — upstream `387cbe42`)

**Files:**
- Modify: `src/ui/game-shell.ts` (id-cleanup list line 24; `GameShellCallbacks` ~line 3-9; button append ~line 108)
- Modify: `src/app/controllers/hud-controller.ts` (`update()`, after the `btn-pirate-waters` block ~line 179-182)
- Modify: `src/app/controllers/game-session-controller.ts` (`createGameShell` call ~line 124-153)
- Modify: `tests/ui/game-shell.test.ts` (the exact toolbar id-list assertion + new button tests)
- Modify: `tests/app/controllers/hud-controller.test.ts` (visibility test)

**Interfaces:**
- Consumes: `PanelId` `'hall-of-fame'` (Task 4); `panelActions.openHallOfFame` reached via `deps.router.open('hall-of-fame')`.
- Produces: `GameShellCallbacks.onOpenHallOfFame?: () => void` (optional, like `onOpenPirateWaters?`); DOM button `#btn-hall-of-fame`, hidden until the current player's `generalHistory` is non-empty.

- [x] **Step 1: Write the failing test — game-shell**

In `tests/ui/game-shell.test.ts`:

(a) In the test `'keeps desktop utility controls in a non-overlapping toolbar'`, update the expected id list to include the new button before `btn-pause-menu`:
```ts
    expect([...toolbar?.querySelectorAll('button') ?? []].map(button => button.id)).toEqual([
      'btn-next-unit', 'btn-notif-log', 'btn-icon-legend', 'btn-wonder-atlas',
      'btn-supply-overlay', 'btn-pirate-waters', 'btn-hall-of-fame', 'btn-pause-menu',
    ]);
```

(b) Add a new test after the pirate-waters test:
```ts
  it('provides a Hall of Fame button, hidden on creation, that routes its optional callback', () => {
    let opened = 0;
    const shell = createGameShell(document.body, {
      onOpenCouncil: () => {}, onOpenTech: () => {}, onOpenCity: () => {},
      onOpenEspionage: () => {}, onOpenDiplomacy: () => {}, onOpenMarketplace: () => {},
      onEndTurn: () => {}, onNextUnit: () => {}, onOpenNotificationLog: () => {},
      onToggleIconLegend: () => {}, onOpenWonderAtlas: () => {}, onOpenMenu: () => {},
      onOpenHallOfFame: () => { opened += 1; },
      supplyOverlayEnabled: false, onToggleSupplyOverlay: () => false,
    });
    const button = shell.querySelector<HTMLButtonElement>('#btn-hall-of-fame');
    expect(button).toBeTruthy();
    expect(button?.hidden).toBe(true);
    expect(button?.title).toBe('Great Generals — Hall of Fame');
    button!.hidden = false;
    button!.click();
    expect(opened).toBe(1);
  });

  it('does not throw when the Hall of Fame button is clicked without the optional callback wired', () => {
    const shell = createGameShell(document.body, {
      onOpenCouncil: () => {}, onOpenTech: () => {}, onOpenCity: () => {},
      onOpenEspionage: () => {}, onOpenDiplomacy: () => {}, onOpenMarketplace: () => {},
      onEndTurn: () => {}, onNextUnit: () => {}, onOpenNotificationLog: () => {},
      onToggleIconLegend: () => {}, onOpenWonderAtlas: () => {}, onOpenMenu: () => {},
      supplyOverlayEnabled: false, onToggleSupplyOverlay: () => false,
    });
    const button = shell.querySelector<HTMLButtonElement>('#btn-hall-of-fame')!;
    expect(() => button.click()).not.toThrow();
  });
```

- [x] **Step 2: Run the test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/ui/game-shell.test.ts`
Expected: FAIL — no `#btn-hall-of-fame`; the id-list assertion mismatches.

- [x] **Step 3: Add the button to `game-shell.ts`**

(a) Line 24 — add `'btn-hall-of-fame'` to the id array in `removeExistingShell`:
```ts
  for (const id of ['game-shell', 'hud', 'bottom-bar', 'btn-next-unit', 'btn-notif-log', 'btn-icon-legend', 'btn-wonder-atlas', 'btn-hall-of-fame', 'btn-pirate-waters', 'notifications', 'info-panel', 'icon-legend']) {
```

(b) `GameShellCallbacks` — add the optional field alongside `onOpenPirateWaters?`:
```ts
  onOpenHallOfFame?: () => void;
```

(c) In `createGameShell`, immediately BEFORE the `btn-pause-menu` append (currently `utilityToolbar.appendChild(createFloatingButton('btn-pause-menu', …))` ~line 109):
```ts
  const hallOfFameButton = createFloatingButton('btn-hall-of-fame', '🎖️', 'Great Generals — Hall of Fame', () => callbacks.onOpenHallOfFame?.());
  hallOfFameButton.hidden = true;
  utilityToolbar.appendChild(hallOfFameButton);
```

- [x] **Step 4: Run the game-shell test to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/ui/game-shell.test.ts`
Expected: PASS.

- [x] **Step 5: Write the failing test — hud-controller visibility**

In `tests/app/controllers/hud-controller.test.ts`, mirror the existing `btn-pirate-waters` visibility test (search `btn-pirate-waters`). Add:
```ts
  it('reveals #btn-hall-of-fame only once the current player has earned a General, per viewer', () => {
    // build the shell + hud-controller the way the pirate-waters test does
    const button = document.createElement('button');
    button.id = 'btn-hall-of-fame';
    button.hidden = true;
    document.body.appendChild(button);

    const state = makeState();            // the helper this file already uses
    state.currentPlayer = 'player';
    state.civilizations.player.generalHistory = [];
    hud.update(state);                    // match this file's update() call convention
    expect(button.hidden).toBe(true);

    state.civilizations.player.generalHistory = [
      { unitId: 'u1', generalDefinitionId: 'gen_caesar', spawnedTurn: 2, careerEvents: [{ type: 'spawned', turn: 2 }] },
    ];
    hud.update(state);
    expect(button.hidden).toBe(false);

    // hot-seat handoff to a player with no history re-hides it
    state.currentPlayer = 'ai-1';
    state.civilizations['ai-1'].generalHistory = [];
    hud.update(state);
    expect(button.hidden).toBe(true);
  });
```
> Adapt `makeState` / `hud.update(...)` to the file's actual helpers and controller-construction pattern — do not invent new ones.

- [x] **Step 6: Run to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/app/controllers/hud-controller.test.ts`
Expected: FAIL — the button stays `hidden` unconditionally.

- [x] **Step 7: Add the visibility toggle to `hud-controller.ts`**

In `src/app/controllers/hud-controller.ts` `update()`, directly after the `btn-pirate-waters` block (~line 182):
```ts
      const hallOfFameButton = deps.getElementById('btn-hall-of-fame');
      if (hallOfFameButton) {
        hallOfFameButton.hidden = (state.civilizations[state.currentPlayer]?.generalHistory?.length ?? 0) === 0;
      }
```

- [x] **Step 8: Wire the shell callback in `game-session-controller.ts`**

In `src/app/controllers/game-session-controller.ts`, in the `createGameShell(deps.uiLayer, { … })` object (next to `onOpenWonderAtlas` ~line 150):
```ts
      onOpenHallOfFame: () => deps.router.open('hall-of-fame'),
```

- [x] **Step 9: Run the affected tests**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/ui/game-shell.test.ts tests/app/controllers/hud-controller.test.ts tests/app/controllers/game-session-controller.test.ts`
Expected: PASS.

- [x] **Step 10: Typecheck**

Run: `bash scripts/run-with-mise.sh yarn build`
Expected: exits 0.

- [x] **Step 11: Commit**

```bash
git add src/ui/game-shell.ts src/app/controllers/hud-controller.ts src/app/controllers/game-session-controller.ts tests/ui/game-shell.test.ts tests/app/controllers/hud-controller.test.ts
git commit -m "$(printf 'feat(#887): Hall of Fame toolbar button, hidden until the civ earns a General\n\n%s button in the utility toolbar (optional GameShellCallbacks entry,\nmirrors onOpenPirateWaters). hud-controller.update() reveals it once\nstate.currentPlayer generalHistory is non-empty -- currentPlayer-scoped so\nhot-seat handoff re-evaluates. game-session-controller routes it to\nrouter.open(hall-of-fame).\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>' '🎖️')"
```

---

### Task 6: `selected-unit-info` — "Career so far" line + "View Hall of Fame" link — ✅ done (`5b1571b0`; deviation: `SelectionControllerDeps.openHallOfFame` made **optional** — required broke 3 existing deps fixtures (`map-interaction-controller`, `selection-controller-establish-outpost`, `selection-controller` tests); `selected-unit-info` already only renders the link when the callback is present, so passing `deps.openHallOfFame` straight through is safe)

**Files:**
- Modify: `src/ui/selected-unit-info.ts` (imports ~line 1-15; `SelectedUnitInfoCallbacks` type; the `unit.type === 'great_general'` block, right after the specialty line ~line 380)
- Modify: `src/app/controllers/selection-controller.ts` (`SelectionControllerDeps` ~line 114-118; the `renderSelectedUnitInfo(...)` callbacks object ~line 191)
- Modify: `src/app/bootstrap.ts` (`createSelectionController({ … })` deps ~line 336-345)
- Modify: `tests/ui/selected-unit-info.test.ts` (additive assertions only)

**Interfaces:**
- Consumes: `getGeneralCareerForViewer`, `describeGeneralCareerHighlights` from `@/systems/great-general-career`; `createGameButton` (already imported in `selected-unit-info.ts`); `panelActions.openHallOfFame` (Task 4) reached through a new `SelectionControllerDeps.openHallOfFame`.
- Produces: `SelectedUnitInfoCallbacks.onOpenHallOfFame?: () => void`.

- [x] **Step 1: Write the failing test**

In `tests/ui/selected-unit-info.test.ts`, inside the `describe('Great General identity display (#544 MR3)', …)` block, add:
```ts
  it('#887 — shows a "Career so far" line when the viewer civ has recorded deeds for this General', () => {
    const romeGeneral = GENERAL_DEFINITIONS.find(g => g.civTypeEligibility.includes('rome'))!;
    const state = makeGeneralState('887-career-line', romeGeneral.id); // the helper this block already uses to build a state + select
    state.civilizations.player.generalHistory = [
      { unitId: 'u1', generalDefinitionId: romeGeneral.id, spawnedTurn: 2, careerEvents: [
        { type: 'spawned', turn: 2 },
        { type: 'city-captured', turn: 6, cityId: 'c1', cityName: 'Thebes' },
        { type: 'unit-saved', turn: 8, via: 'last-stand', unitId: 'x', unitType: 'warrior', remainingHp: 1, location: { q: 0, r: 0 } },
      ] },
    ];
    const text = renderAndCollect(state, 'u1'); // match the block's existing render+collectAllText helper
    expect(text).toContain('Career so far');
    expect(text).toContain('1 city captured');
    expect(text).toContain('1 unit saved');
  });

  it('#887 — shows no "Career so far" line for a General with only a spawn event', () => {
    const romeGeneral = GENERAL_DEFINITIONS.find(g => g.civTypeEligibility.includes('rome'))!;
    const state = makeGeneralState('887-no-career', romeGeneral.id);
    state.civilizations.player.generalHistory = [
      { unitId: 'u1', generalDefinitionId: romeGeneral.id, spawnedTurn: 2, careerEvents: [{ type: 'spawned', turn: 2 }] },
    ];
    expect(renderAndCollect(state, 'u1')).not.toContain('Career so far');
  });

  it('#887 — renders a "View Hall of Fame" button that fires onOpenHallOfFame, only for a Great General', () => {
    const romeGeneral = GENERAL_DEFINITIONS.find(g => g.civTypeEligibility.includes('rome'))!;
    const state = makeGeneralState('887-hof-link', romeGeneral.id);
    let opened = 0;
    const panel = document.createElement('div');
    renderSelectedUnitInfo(panel, state, 'u1', { onClose: () => {}, onOpenHallOfFame: () => { opened += 1; } });
    const btn = [...panel.querySelectorAll('button')].find(b => b.textContent === 'View Hall of Fame');
    expect(btn).toBeTruthy();
    btn!.click();
    expect(opened).toBe(1);

    // a plain warrior gets no such button
    const warriorPanel = document.createElement('div');
    renderSelectedUnitInfo(warriorPanel, state, 'warrior-unit-id', { onClose: () => {}, onOpenHallOfFame: () => {} });
    expect([...warriorPanel.querySelectorAll('button')].some(b => b.textContent === 'View Hall of Fame')).toBe(false);
  });
```
> Use the exact helpers this test file already provides (state builder, unit selection, `collectAllText`). The names above (`makeGeneralState`, `renderAndCollect`) are placeholders for whatever the file uses — do not add new helpers.

- [x] **Step 2: Run to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/ui/selected-unit-info.test.ts`
Expected: FAIL — no "Career so far" text, no "View Hall of Fame" button.

- [x] **Step 3: Extend `SelectedUnitInfoCallbacks` and the General block**

In `src/ui/selected-unit-info.ts`:

(a) Add to the `SelectedUnitInfoCallbacks` interface (near `onOpenRally?` etc.):
```ts
  onOpenHallOfFame?: () => void;
```

(b) Add to the imports from `@/systems/great-general-career` (create the import if absent):
```ts
import { getGeneralCareerForViewer, describeGeneralCareerHighlights } from '@/systems/great-general-career';
```

(c) In the `unit.type === 'great_general'` block, immediately AFTER the specialty-line `if (specialty) { … }` and BEFORE the `const profile = getGeneralProfile(...)` bio block (~line 383):
```ts
      const career = getGeneralCareerForViewer(state, state.currentPlayer, generalDef.id);
      if (career) {
        const clause = describeGeneralCareerHighlights(career); // ' — 1 city captured, …' or ''
        if (clause) {
          const careerLine = document.createElement('div');
          careerLine.style.cssText = 'font-size:11px;margin-top:3px;opacity:0.85;';
          careerLine.textContent = `Career so far${clause}`;
          wrapper.appendChild(careerLine);
        }
      }
      if (callbacks.onOpenHallOfFame) {
        const hofButton = createGameButton('View Hall of Fame', 'ghost');
        hofButton.style.marginTop = '4px';
        hofButton.addEventListener('click', () => callbacks.onOpenHallOfFame!());
        wrapper.appendChild(hofButton);
      }
```

- [x] **Step 4: Thread the callback through `selection-controller.ts`**

In `src/app/controllers/selection-controller.ts`:

(a) Add to `SelectionControllerDeps` (near `openPirateHeadquartersAssault` ~line 116):
```ts
  readonly openHallOfFame: () => void;
```

(b) In the `renderSelectedUnitInfo(panel, session.getState(), unitId, { … })` callbacks object (~line 191), add:
```ts
        onOpenHallOfFame: () => deps.openHallOfFame(),
```

- [x] **Step 5: Provide the dep in `bootstrap.ts`**

In `src/app/bootstrap.ts`, in `createSelectionController({ … })` (near `openPirateHeadquartersAssault: panelActions.openPirateHeadquartersAssault,` ~line 338):
```ts
    openHallOfFame: panelActions.openHallOfFame,
```

- [x] **Step 6: Run the affected tests**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/ui/selected-unit-info.test.ts tests/app/controllers/selection-controller.test.ts tests/app/bootstrap.test.ts`
Expected: PASS. (Existing selected-unit-info assertions are `toContain`-based and additive text does not break them; the "no extra text when `generalDefinitionId` does not resolve" case stays green because the new block is inside `if (generalDef)`.)

- [x] **Step 7: Typecheck**

Run: `bash scripts/run-with-mise.sh yarn build`
Expected: exits 0.

- [x] **Step 8: Commit**

```bash
git add src/ui/selected-unit-info.ts src/app/controllers/selection-controller.ts src/app/bootstrap.ts tests/ui/selected-unit-info.test.ts
git commit -m "$(printf 'feat(#887): Career-so-far line + View Hall of Fame link on the active General\n\nselected-unit-info shows describeGeneralCareerHighlights for the viewer\ncivs record of the selected General (omitted when there are no deeds, and\nfor an enemy General -- getGeneralCareerForViewer returns undefined), plus\na ghost View Hall of Fame button wired through\nSelectionControllerDeps.openHallOfFame -> panelActions.openHallOfFame.\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>')"
```

---

### Task 7: Full verification, docs sync, PR — ✅ done (full `yarn test` 565 files / 9894 passed / 3 skipped; `yarn build` clean; `architecture-boundaries.test.ts` green with no edits; `plans/README.md` checklist satisfied — read-only feature, no queue, negative coverage for the importance ranking, open/close/reopen replay covered)

**Files:**
- Modify: `docs/superpowers/plans/2026-09-01-issue-887-phase-b-hall-of-fame.md` (tick boxes, add status annotations)
- No source changes unless verification finds a defect.

- [x] **Step 1: Targeted regression sweep**

Run:
```bash
bash scripts/run-with-mise.sh yarn vitest run \
  tests/systems/great-general-hall-of-fame.test.ts \
  tests/systems/great-general-career.test.ts \
  tests/ui/hall-of-fame-panel.test.ts \
  tests/ui/game-shell.test.ts \
  tests/ui/selected-unit-info.test.ts \
  tests/app/controllers/panel-actions-controller.test.ts \
  tests/app/controllers/hud-controller.test.ts \
  tests/app/controllers/game-session-controller.test.ts \
  tests/app/controllers/selection-controller.test.ts \
  tests/app/bootstrap.test.ts \
  tests/app/architecture-boundaries.test.ts \
  tests/app/panel-router.test.ts
```
Expected: all PASS. `architecture-boundaries.test.ts` must be green with no edits — the feature adds no `main.ts` behavior, the builder is pure, and the panel never mutates `session.getState()`.

- [x] **Step 2: `git diff --check`**

Run: `git diff --check origin/main...HEAD`
Expected: no output (no whitespace errors).

- [x] **Step 3: Full build**

Run: `bash scripts/run-with-mise.sh yarn build`
Expected: exits 0 (tsc + production bundle).

- [x] **Step 4: Full test suite**

Run: `bash scripts/run-with-mise.sh yarn test`
Expected: exits 0 (vitest + hook smoke tests). If a pre-existing unrelated flake appears, confirm it fails on `origin/main` too before proceeding; do not paper over a real failure this plan introduced.

- [x] **Step 5: `docs/superpowers/plans/README.md` checklist pass**

Open `docs/superpowers/plans/README.md` and confirm this feature satisfies it:
- **Player-visible state transitions:** none — the feature is read-only; the only state read (`generalHistory`) is never written here.
- **Misleading derived labels:** the one derived label is "memorable" (importance ranking). Positive coverage: a `city-captured` event is surfaced as a moment (Task 1 tests). Negative coverage: `rally-used` / `seize-used` / `last-stand-issued` and an unrecognised type are never surfaced as an individual moment (Task 1 tests).
- **Replayable interaction:** open → close → reopen renders a fresh snapshot — covered by the "a second call replaces rather than duplicates" panel test (Task 3) and `panel-router` `isOpen`/`close` behavior.
No code change expected here; if the README lists a check this feature genuinely misses, add the missing test to the relevant task and re-run.

- [x] **Step 6: Tick this plan's checkboxes + status annotations**

Edit this file: mark every `- [ ]` you completed as `- [x]`, and add to each `### Task N` header line ` — ✅ done` (or ` — ✅ done (deviation: …)` where you diverged, e.g. the specialty-id swap in Task 2 Step 1). Commit:
```bash
git add docs/superpowers/plans/2026-09-01-issue-887-phase-b-hall-of-fame.md
git commit -m "$(printf 'docs(#887): Phase B plan — mark tasks complete\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>')"
```

- [x] **Step 7: Push and open the PR**

```bash
git push -u origin HEAD
```
Then create the PR (use `--body-file` with a scratchpad file — heredocs into `gh` trip the worktree guard):

Title: `#887 Phase B — Great General Hall of Fame (player-facing)`

Body must include:
- What shipped: the `hall-of-fame` panel, `getHallOfFameForViewer` + `classifyCareerEventImportance` / `selectMemorableMoments`, the `🎖️` toolbar button (hidden until the civ earns its first General), the "Career so far" line + "View Hall of Fame" link in selected-unit-info.
- Deviations from the spec, verbatim: (1) the selected-unit-info link callback is wired in `selection-controller.ts` via a new `SelectionControllerDeps.openHallOfFame` (= `panelActions.openHallOfFame`), not in `game-session-controller.ts` (the spec's stale wiring seam) — `router` is a `let` unassigned at `createSelectionController` time; (2) `GameShellCallbacks.onOpenHallOfFame` is optional, matching `onOpenPirateWaters?`, so the existing `createGameShell` fixtures compile unchanged; (3) `tests/ui/game-shell.test.ts`'s exact toolbar id-list assertion was updated to include `btn-hall-of-fame`.
- Safety: presentation only — no ledger/schema/save-version change; no migration; viewer-scoped (own civ only); no `opponentChallenge` read (difficulty parity); AI never imports either new module (guard test); `textContent`-only rendering.
- Verification: `yarn build` + `yarn test` both exit 0.
- `Closes #887` (Phase B is the final piece of the issue; MR1 backend already merged as #940).
- Footer: `🤖 Generated with [Claude Code](https://claude.com/claude-code)`

- [x] **Step 8: Comment on issue #887**

After the PR is open, comment on #887: Phase B (Hall of Fame UI) is up as PR #<n>; with it #887 is fully delivered (MR1 backend #940 + MR2 UI). Do not close the issue by hand — `Closes #887` in the PR body closes it on merge.

---

## Self-review (done while writing — recorded for the executor)

**Spec coverage:**
- Spec §3 builder → Tasks 1–2. Spec §3 panel → Task 3. Spec §3 wiring rows (registry, bootstrap, panel-actions, game-shell, hud-controller, game-session-controller, selected-unit-info) → Tasks 4–6. Spec §4 view-model → Task 2 `HallOfFameEntry`. Spec §5 ranking/`describeMoment`/fallback → Task 1. Spec §6 card layout (accordion, narrative-first, compact stat line, bio `<details>`) → Task 3. Spec §7 edge cases: empty roster → Task 3 test; generated officer → Task 2 test; unresolvable id → Task 2 test; active-only-spawn → Task 2 test; hot-seat → Task 5 hud-controller test + Task 2 viewer-scoping test; difficulty → builder takes no challenge input (Task 1/2, no such param exists); AI guard → Task 1 Step 5; save compat → no migration, MR1 tail already backfills (nothing to build). Spec §8 tests → distributed across Tasks 1/2/3/4/5/6; `docs/superpowers/plans/README.md` mapping → Task 7 Step 5.
- One spec line intentionally not built: the "optional, non-required" note about `register-general-presentation.ts` appending "— see the Hall of Fame" to its own toast. It is explicitly optional in the spec and YAGNI for this MR; skipped.

**Placeholder scan:** the only deliberately non-literal spots are the two test-helper name notes (Task 2 Step 1 specialty-id, Task 5/Task 6 "use the file's existing helpers") — flagged inline with concrete fallback instructions, not left blank.

**Type consistency:** `HallOfFameEntry` / `HallOfFameMoment` fields are identical between Task 2's `Produces` block, the Task 2 implementation, and Task 3's `makeEntry`. `classifyCareerEventImportance` returns `number` everywhere; `describeMoment` returns `string | null` everywhere; `selectMemorableMoments(entry, cap?)` signature matches across Task 1 impl and Task 2 usage. `getHallOfFameForViewer(state, civId)` matches Task 2, Task 4 (`panel-actions-controller`), and the guard reasoning. `GameShellCallbacks.onOpenHallOfFame?` optional in both game-shell (Task 5) and its tests. `SelectedUnitInfoCallbacks.onOpenHallOfFame?` optional; `SelectionControllerDeps.openHallOfFame` required (Task 6).
