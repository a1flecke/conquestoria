# #887 Phase B — Great General Hall of Fame — design

**Issue:** [#887](https://github.com/a1flecke/conquestoria/issues/887) — "Expanded Great Generals campaign chronicle / Hall of Fame".
**Builds on:** MR1 backend ledger (PR #940, merged) — `GeneralHistoryEntry.careerEvents`,
`summarizeGeneralCareer`, `summarizeCivHallOfFame`, `getGeneralCareerForViewer`,
`describeGeneralCareerHighlights` in `src/systems/great-general-career.ts`.

MR1 explicitly deferred the entire player-facing surface and the
`classifyCareerEventImportance` selection helper (design Phase 20) to this MR.

## 1. Goal

A read-only screen where the player browses **every Great General their civ has
ever had** — active, retired, and fallen — each with a career stat line and a
short ranked "memorable moments" mini-timeline. Plus a compact "Career so far"
line on the active General in the selected-unit info panel, with a link into the
new screen.

## 2. Scope

**In:**
- A new full-screen `hall-of-fame` panel (transient group), opened from a
  dedicated `🎖️` button in the game shell's top-right utility toolbar.
- A view-model builder `getHallOfFameForViewer(state, civId): HallOfFameEntry[]`.
- `classifyCareerEventImportance` + `selectMemorableMoments` — pure ranking over
  `GeneralCareerEvent`.
- A compact career line + "Open Hall of Fame" link in `selected-unit-info.ts`
  for a selected Great General.

**Out:**
- Full chronological event log (the moments list is the chosen depth).
- Enemy / rival Generals — `getGeneralCareerForViewer` already forbids this and
  no enemy-discovery model exists. A future "discovered enemy Hall of Fame" is
  its own issue.
- Any change to the MR1 ledger, recording sites, event schema, or
  `SAVE_VERSION`. This MR is presentation only.
- New bus events, notifications, SFX, bespoke art, animation. Generals render
  with their existing `portraitIcon` emoji.

## 3. Architecture — mirrors the existing Bestiary pattern

Precedent: `src/systems/beast-presentation.ts` exports the `BestiaryEntry`
interface + `getBestiaryEntriesForPlayer(state, civId)`;
`src/app/controllers/panel-actions-controller.ts` calls the builder;
`src/ui/bestiary-panel.ts` imports only the entry type and renders. Same shape
here.

| Piece | File | Responsibility |
|---|---|---|
| View-model builder | `src/systems/great-general-hall-of-fame.ts` **(new)** | `HallOfFameEntry` interface; `getHallOfFameForViewer(state, civId): HallOfFameEntry[]`; pure `classifyCareerEventImportance(event): number` and `selectMemorableMoments(entry, cap): { turn, text }[]`. Resolves each `generalHistory` entry via `summarizeGeneralCareer` + `resolveGeneralDefinition` + `getGeneralProfile` + `getGeneralSpecialtyPresentation`. Presentation/aggregation layer — the pure `great-general-career.ts` is **not** touched and keeps importing only `@/core/types`. |
| Panel | `src/ui/hall-of-fame-panel.ts` **(new)** | `createHallOfFamePanel(container, entries: HallOfFameEntry[], callbacks: { onClose }): HTMLElement`. Pure render over the view-model — **no `GameState` import**. Full-screen `position:absolute;inset:0;overflow:auto`, one card per General, `textContent`/`createTextNode` only, `createGameButton('✕','close')`, 44px touch targets, empty-state message when `entries` is empty. |
| Open action | `src/app/controllers/panel-actions-controller.ts` | `openHallOfFame()` — build entries from `session.getState()` + `session.getState().currentPlayer`, call `createHallOfFamePanel`. Rebuilt fresh on every open (read-only snapshot; no in-panel mutation). |
| Panel wiring | `src/app/panel-registry.ts` | Add `'hall-of-fame'` to the `PanelId` union. |
| Panel wiring | `src/app/bootstrap.ts` | Add registry entry: `'hall-of-fame': { domId: 'hall-of-fame-panel', group: 'transient', open: () => panelActions.openHallOfFame() }`. |
| Toolbar button | `src/ui/game-shell.ts` | Add `onOpenHallOfFame: () => void` to `GameShellCallbacks`; append `createFloatingButton('btn-hall-of-fame', '🎖️', 'Great Generals — Hall of Fame', callbacks.onOpenHallOfFame)` to the utility toolbar (next to Wonder Atlas). Add `'btn-hall-of-fame'` to the id-cleanup list at the top of the file. |
| Callback wiring | `src/app/controllers/game-session-controller.ts` | In the `createGameShell` call: `onOpenHallOfFame: () => deps.router.open('hall-of-fame')`. |
| In-play line | `src/ui/selected-unit-info.ts` | In the existing `unit.type === 'great_general'` block: `getGeneralCareerForViewer(state, state.currentPlayer, generalDef.id)` → render a compact line via `describeGeneralCareerHighlights` ("Career so far — 2 cities captured, 1 unit saved."), omitted when the clause is empty. Below it, a small "Open Hall of Fame" text link wired through a new optional `onOpenHallOfFame?: () => void` on `SelectedUnitInfoCallbacks` (threaded from `game-session-controller.ts` → `router.open('hall-of-fame')`). |

## 4. `HallOfFameEntry` view-model

```ts
export interface HallOfFameMoment {
  turn: number;
  text: string;   // e.g. "Turn 44 — captured Thebes", "Turn 51 — saved a Warrior at (3, -2)"
}

export interface HallOfFameEntry {
  generalDefinitionId: string;
  name: string;
  portraitIcon: string;
  era: number;
  descriptor: string;
  status: 'active' | 'retired' | 'fallen';
  stats: GeneralCareerSummary;          // structured, for a small stat grid
  statLine: string;                     // describeGeneralCareerHighlights(stats) without the leading " — ", or "No notable actions yet."
  profile?: {                           // #886 — authored Generals only; omitted for generated officers
    kind: 'historical' | 'lore';
    summary: string;
    facts: string[];
    context?: string;
    loreWork?: string;
  };
  specialtyLine?: string;               // #885 — "Swift Command — extended reach, fewer charges"; omitted for generalist / generated
  bookendStart: string;                 // synthesized short string: "Turn N — took command"
  bookendEnd?: string;                  // synthesized short string: "Turn M — fell in battle" | "Turn M — retired from service"; absent while active. NOT entry.endOfCareerLine (that already carries the stat clause and would duplicate statLine).
  moments: HallOfFameMoment[];          // <= 5, ranked then turn-ascending
}
```

`getHallOfFameForViewer` maps `state.civilizations[civId].generalHistory` (via
`summarizeCivHallOfFame` for the stats, plus the raw entry for events/outcome/
turns). Returns `[]` when the civ has no history. Never reads another civ's
`generalHistory`. Hot-seat: callers pass `state.currentPlayer`.

## 5. `classifyCareerEventImportance` — the Phase-20-deferred piece

Pure `(event: GeneralCareerEvent) => number`, higher = more memorable:

| Rank | Event kinds | Rationale |
|---|---|---|
| 5 | `city-captured`, `city-defended` | Names a specific place; the biggest single moments. |
| 4 | `final-command` | The last heroic order of the General's career. |
| 3 | `unit-saved` | Names a unit type and a location; a dramatic rescue. |
| 2 | `battle-influenced` **with `reasons.length >= 2`** | Both Last Stand and Seize shaped the same fight. |
| 1 | `battle-influenced` single-reason | Frequent; the aggregate count carries the weight. |
| 0 | `rally-used`, `seize-used`, `last-stand-issued` | Routine ability use — represented only by totals in the stat grid, never as an individual moment. |
| — | `spawned`, `killed`, `retired` | **Bookends**, not moments. Rendered separately and always shown (`bookendStart` / `bookendEnd`). |

`selectMemorableMoments(entry, cap = 5)`: filter to importance `>= 1`, sort by
importance desc then `turn` asc, take `cap`, then **re-sort the taken set by
`turn` asc** so the mini-timeline reads chronologically. Each surviving event is
formatted to a `{ turn, text }` by a small internal `describeMoment(event)`
(plain strings, `textContent`-safe, no profile/specialty prose).

## 6. Card layout (mobile-first)

Per `HallOfFameEntry`, top to bottom:
1. `portraitIcon` + `name` + `— Era {era}` + a status badge (`Active` gold /
   `Retired` neutral / `Fallen` muted-red text label, not color-only — include
   the word).
2. `descriptor` (one line, dim).
3. `specialtyLine` if present.
4. Stat grid: Battles influenced / Cities captured / Cities defended / Units
   saved / Rally · Seize · Last Stand uses / Career length (turns). Zero values
   shown as `0` (a factual record, not a recommendation surface).
5. `bookendStart`, then each `moments` entry as `turn — text`, then `bookendEnd`
   if present. If `moments` is empty and there is no `bookendEnd`, show
   "Still serving — no notable actions recorded yet."
6. `profile` (authored only) in a collapsed `<details>` — `summary`, bulleted
   `facts`, `context`, `From: {loreWork}` — mirroring the existing
   `selected-unit-info.ts` bio block. `sources` are never shown (audit-only, per
   `.claude/rules/great-general-content.md`).

Roster order: `status === 'active'` first, then career-ended Generals by
`bookend end turn` descending (most recent first), ties by `spawnedTurn`
descending. All entries always rendered — no truncation (catalog-panel rule;
though this is a record, not an action catalog, a regression asserts every roster
entry appears).

## 7. Edge cases

- **Empty roster** (no General ever earned): panel shows a single centered
  message — "No Great Generals have served yet. Earn one through sustained
  combat and command." — and nothing else. The `🎖️` button is always present
  (consistent with Bestiary, which also opens on an empty world).
- **Generated officer (#888):** `resolveGeneralDefinition` returns the persisted
  `state.generatedGenerals` identity; `getGeneralProfile` → `undefined` (no bio
  block); `getGeneralSpecialtyPresentation` → `undefined` (no specialty line).
  Card still renders name + descriptor + stats + moments + bookends.
- **Active General with zero events beyond `spawned`:** `statLine` = "No notable
  actions yet.", `moments` empty, no `bookendEnd` → the "Still serving" line.
- **Hot-seat:** every builder call and the selected-unit line use
  `state.currentPlayer`; player A never sees player B's roster.
- **Save compatibility:** none needed — reads existing persisted
  `generalHistory`; a pre-#940 save has `careerEvents: []` (MR1 tail
  normalization) → every General shows as a valid empty record.

## 8. Testing

**`tests/systems/great-general-hall-of-fame.test.ts`**
- `classifyCareerEventImportance`: exact rank per event kind;
  `battle-influenced` two-reason ranks above one-reason; ability-use kinds rank 0.
- `selectMemorableMoments`: caps at 5; picks highest-importance first; the
  returned list is turn-ascending; a routine-only career yields `[]`;
  `city-*`/`unit-saved` always beat single-reason `battle-influenced`.
- `getHallOfFameForViewer`: returns one entry per `generalHistory` entry
  (active + retired + fallen); status derived from `outcome`; **never** returns
  an entry from another civ's history (negative test with two civs); empty
  roster → `[]`; a generated-officer entry has no `profile`/`specialtyLine`;
  ordering (active first, then most-recent-end first).
- Guard: no file under `src/ai/` imports `great-general-hall-of-fame`
  (extend the MR1 guard in `great-general-career.test.ts` or add a sibling).
- Guard: `src/ui/hall-of-fame-panel.ts` takes no `GameState` and its source
  imports no `GameState` — it renders only the `HallOfFameEntry` view-model
  (type-only import of the entry interface is expected, same as
  `bestiary-panel.ts` importing `BestiaryEntry`).

**`tests/ui/hall-of-fame-panel.test.ts`**
- One `[data-hall-of-fame-entry]` card per entry; the count matches
  `entries.length` (no truncation).
- Status badge text present ("Active" / "Retired" / "Fallen").
- Stat grid shows each summary number including zeros.
- `moments` render turn-ascending between the two bookends.
- Empty `entries` → the empty-state message, no cards.
- Close button → `onClose` called and panel removed.
- A General `name` containing `<b>` renders as literal text (no element
  injected) — `textContent` discipline.

**`tests/ui/selected-unit-info.test.ts`** (extend)
- A selected Great General whose civ history has real deeds → the "Career so
  far — …" line is present with the expected clause.
- A freshly-spawned General (only `spawned`) → no career line.
- The "Open Hall of Fame" link is present for a Great General and calls
  `onOpenHallOfFame`; absent for a non-General unit.

**`tests/app/architecture-boundaries.test.ts`** — already asserts "a new panel is
one `PANEL_REGISTRY` entry"; the wiring above must keep it green (no new
`main.ts` behavior; registry + registrar-style callback only).

## 9. File-by-file change list

Create:
- `src/systems/great-general-hall-of-fame.ts`
- `src/ui/hall-of-fame-panel.ts`
- `tests/systems/great-general-hall-of-fame.test.ts`
- `tests/ui/hall-of-fame-panel.test.ts`

Modify:
- `src/app/panel-registry.ts` — `PanelId` union
- `src/app/bootstrap.ts` — registry entry
- `src/app/controllers/panel-actions-controller.ts` — `openHallOfFame()`
- `src/app/controllers/game-session-controller.ts` — `onOpenHallOfFame`
  callbacks (shell + selected-unit-info)
- `src/ui/game-shell.ts` — `GameShellCallbacks.onOpenHallOfFame`, toolbar
  button, id-cleanup list
- `src/ui/selected-unit-info.ts` — career line + Hall of Fame link;
  `SelectedUnitInfoCallbacks.onOpenHallOfFame?`
- `tests/ui/selected-unit-info.test.ts` — new assertions
- `docs/superpowers/plans/README.md` checklist items are satisfied by §8
- Issue #887: comment that MR2 (Hall of Fame UI) is complete; the issue can
  then be closed (it is the last piece).

## 10. Non-goals recap (do not build here)

Enemy Generals, full event log, sorting/filtering controls, portrait art,
audio, animation, a "share card" export, cross-civ comparison, any change to
how career events are recorded.
