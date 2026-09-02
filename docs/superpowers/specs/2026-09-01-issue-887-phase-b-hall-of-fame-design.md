# #887 Phase B — Great General Hall of Fame — design

**Issue:** [#887](https://github.com/a1flecke/conquestoria/issues/887) — "Expanded Great Generals campaign chronicle / Hall of Fame".
**Builds on:** MR1 backend ledger (PR #940, merged) — `GeneralHistoryEntry.careerEvents`,
`summarizeGeneralCareer`, `summarizeCivHallOfFame`, `getGeneralCareerForViewer`,
`describeGeneralCareerHighlights` in `src/systems/great-general-career.ts`.

MR1 explicitly deferred the entire player-facing surface and the
`classifyCareerEventImportance` selection helper (design Phase 20) to this MR.

## 1. Goal

A read-only screen where the player browses **every Great General their civ has
ever had** — active, retired, and fallen — each with a short "memorable moments"
mini-timeline and a compact career-stat line. Plus a compact "Career so far"
line and a link into the screen on the active General in the selected-unit info
panel.

Presentation only. No gameplay effect, no mechanic, no new recording, no
`SAVE_VERSION` change.

## 2. Scope

**In:**
- A new full-screen `hall-of-fame` panel (transient group), opened from a
  dedicated `🎖️` button in the game shell's top-right utility toolbar.
- `src/systems/great-general-hall-of-fame.ts`: `getHallOfFameForViewer(state, civId): HallOfFameEntry[]`
  plus pure `classifyCareerEventImportance` / `selectMemorableMoments`.
- A compact career line + a "View Hall of Fame" link in `selected-unit-info.ts`
  for a selected Great General.

**Out:**
- Full chronological event log (the ranked moments list is the chosen depth).
- Enemy / rival Generals — `getGeneralCareerForViewer` already forbids this and
  no enemy-discovery model exists. A future "discovered enemy Hall of Fame" is
  its own issue.
- Any change to the MR1 ledger, recording sites, `GeneralCareerEvent` schema, or
  save version.
- New bus events, notifications, audio assets, ceremony/fanfare, bespoke art,
  animation. Generals render with their existing `portraitIcon` emoji.
- Any persisted "unread / last-viewed" state (would force a save migration for a
  cosmetic dot — not worth it; see §7 discoverability).

## 3. Architecture — mirrors the existing Bestiary pattern

Precedent, verified against current code: `src/systems/beast-presentation.ts`
exports the `BestiaryEntry` interface + `getBestiaryEntriesForPlayer(state, civId)`;
`src/app/controllers/panel-actions-controller.ts`'s `openBestiary()` calls the
builder and hands the result to `createBestiaryPanel`; `src/ui/bestiary-panel.ts`
imports only the entry type and renders. Same shape here.

| Piece | File | Responsibility |
|---|---|---|
| View-model builder | `src/systems/great-general-hall-of-fame.ts` **(new)** | `HallOfFameEntry` / `HallOfFameMoment` interfaces; `getHallOfFameForViewer(state, civId): HallOfFameEntry[]`; pure `classifyCareerEventImportance(event): number` and `selectMemorableMoments(entry, cap): HallOfFameMoment[]`. Resolves each `generalHistory` entry via `summarizeGeneralCareer` + `resolveGeneralDefinition(state, id)` + `getGeneralProfile(id)` + `getGeneralSpecialtyPresentation({ id })`. Presentation/aggregation layer (same tier as `beast-presentation.ts`) — the pure `great-general-career.ts` is **not** touched and keeps importing only `@/core/types`. Reads no `opponentChallenge` / challenge-profile input. |
| Panel | `src/ui/hall-of-fame-panel.ts` **(new)** | `createHallOfFamePanel(container, entries: HallOfFameEntry[], callbacks: { onClose: () => void }): HTMLElement`. Pure render over the view-model — **takes no `GameState`, imports no `GameState`** (type-only import of `HallOfFameEntry` is expected, exactly as `bestiary-panel.ts` imports `BestiaryEntry`). Clears its own prior instance first (`container.querySelector('#hall-of-fame-panel')?.remove()`), like `createBestiaryPanel`. Full-screen `position:absolute;inset:0;z-index:40;overflow:auto`, `textContent`/`createTextNode` only, `createGameButton('✕','close')` self-removing header button, 44px touch targets, empty-state message when `entries` is empty. |
| Open action | `src/app/controllers/panel-actions-controller.ts` | `openHallOfFame()` — one call, mirroring `openBestiary()`: `createHallOfFamePanel(deps.uiLayer, getHallOfFameForViewer(state, state.currentPlayer), { onClose: () => {} })`. Rebuilt fresh on every open (read-only snapshot; no in-panel mutation). Add `openHallOfFame(): void` to the controller's return interface. |
| Panel wiring | `src/app/panel-registry.ts` | Add `'hall-of-fame'` to the `PanelId` union. |
| Panel wiring | `src/app/bootstrap.ts` | Add registry entry: `'hall-of-fame': { domId: 'hall-of-fame-panel', group: 'transient', open: () => panelActions.openHallOfFame() }`. |
| Toolbar button | `src/ui/game-shell.ts` | Add **optional** `onOpenHallOfFame?: () => void` to `GameShellCallbacks` (mirrors the existing optional `onOpenPirateWaters?`). Create `createFloatingButton('btn-hall-of-fame', '🎖️', 'Great Generals — Hall of Fame', () => callbacks.onOpenHallOfFame?.())`, **inserted immediately before `btn-pause-menu`**, set `hidden = true` on creation. Add `'btn-hall-of-fame'` to the id-cleanup list at the top of the file. |
| Button visibility | `src/app/controllers/hud-controller.ts` | In `update()`, next to the existing `btn-pirate-waters` toggle: `const b = deps.getElementById('btn-hall-of-fame'); if (b) b.hidden = (state.civilizations[state.currentPlayer]?.generalHistory?.length ?? 0) === 0;`. `currentPlayer`-scoped and re-run every render/turn → hot-seat handoff re-evaluates automatically. Once a civ has earned its first General the button stays visible for that player (history never shrinks). |
| Callback wiring | `src/app/controllers/game-session-controller.ts` | In the `createGameShell` call: `onOpenHallOfFame: () => deps.router.open('hall-of-fame')`. In the `selected-unit-info` callbacks it already builds: `onOpenHallOfFame: () => deps.router.open('hall-of-fame')`. |
| In-play line | `src/ui/selected-unit-info.ts` | In the existing `unit.type === 'great_general'` block, immediately after the specialty line and before the bio `<details>`: (a) `const career = getGeneralCareerForViewer(state, state.currentPlayer, generalDef.id)` — when `career` exists **and** `describeGeneralCareerHighlights(career)` is non-empty, render `Career so far${clause}` (the clause already begins with ` — `). Omitted for a freshly-spawned General (empty clause) and for an enemy General (`career` is `undefined` — no rival data). (b) When `callbacks.onOpenHallOfFame` is provided, always render a `createGameButton('View Hall of Fame', 'ghost')` that calls it. Add optional `onOpenHallOfFame?: () => void` to `SelectedUnitInfoCallbacks`. |

## 4. View-model

```ts
export interface HallOfFameMoment {
  turn: number;
  text: string;   // plain, concrete, coordinate-free; textContent-safe. e.g. "captured Thebes"
}

export interface HallOfFameEntry {
  generalDefinitionId: string;
  name: string;                 // definition name, or "A forgotten commander" when unresolvable (see §7)
  portraitIcon: string;         // "" when unresolvable
  era: number | null;           // null when unresolvable
  descriptor: string;           // "" when unresolvable
  status: 'active' | 'retired' | 'fallen';
  stats: GeneralCareerSummary;                 // from summarizeGeneralCareer
  statLine: string;                            // describeGeneralCareerHighlights(stats) with the leading " — " stripped; "" when the General has no notable deeds
  specialtyLine?: string;                      // "{displayName} — {summary}"; omitted for generalist / generated / unresolvable
  profile?: {                                  // authored Generals only; omitted otherwise
    kind: 'historical' | 'lore';
    summary: string; facts: string[]; context?: string; loreWork?: string;
  };
  bookendStart: string;                        // synthesized: "Turn N — took command"
  bookendEnd?: string;                         // synthesized: "Turn M — fell in battle" | "Turn M — retired from service"; absent while active. NOT entry.endOfCareerLine (that already carries a stat clause).
  moments: HallOfFameMoment[];                 // <= 5 ranked memorable moments, plus at most one synthesized "steadied the ranks" line (see §5); chronological
}
```

`getHallOfFameForViewer(state, civId)` maps `state.civilizations[civId].generalHistory`
(each raw entry → `summarizeGeneralCareer` + resolution above). Returns `[]` when
the civ has no history. **Never** reads another civ's `generalHistory`. Callers
pass `state.currentPlayer`.

## 5. `classifyCareerEventImportance` + moment selection — the Phase-20-deferred piece

Pure `(event: GeneralCareerEvent) => number`, higher = more memorable:

| Rank | Event kinds | Rationale |
|---|---|---|
| 5 | `city-captured`, `city-defended` | Names a specific place; the biggest single moments. |
| 4 | `final-command` | The last heroic order of the General's career. |
| 3 | `unit-saved` | A dramatic rescue of a named unit type. |
| 2 | `battle-influenced` with `reasons.length >= 2` | Both Last Stand and Seize shaped the same fight. |
| 1 | `battle-influenced` single-reason | Frequent; the aggregate count carries the weight. |
| 0 | `rally-used`, `seize-used`, `last-stand-issued`, **and any unrecognised future `type`** | Routine ability use (or an event kind added by a later MR that hasn't taught this helper its rank yet) — never an individual moment. A new memorable event type is opted in by adding a row here. |
| — | `spawned`, `killed`, `retired` | **Bookends**, not moments — rendered separately, always shown. |

`selectMemorableMoments(entry, cap = 5): HallOfFameMoment[]`:
1. From `entry.careerEvents`, keep events with importance `>= 1`.
2. Sort by importance desc, then `turn` asc; take the first `cap`.
3. Map each through `describeMoment(event)` → `{ turn, text } | null`; drop `null`
   (an unrecognised `type` yields `null` — never `[object Object]`, never a crash).
4. **Re-sort the surviving list by `turn` asc** so it reads chronologically.
5. **Peaceful-General fallback:** if the list is now empty *and*
   `stats.rallyUses + stats.seizeUses + stats.lastStandUses > 0`, append one
   synthesized moment: `{ turn: entry.spawnedTurn, text: "steadied the ranks through N heroic commands" }`
   (N = that sum). This keeps a builder-playstyle General's timeline from being blank.

`describeMoment` templates (plain language, no raw coordinates, no profile/specialty prose):

| Event | Text |
|---|---|
| `city-captured` | `captured {cityName}` |
| `city-defended` | `defended {cityName}` |
| `unit-saved` | `pulled a {UNIT_DEFINITIONS[unitType].name} back from the brink` |
| `final-command` | `gave their final command` |
| `battle-influenced`, `reasons.length >= 2` | `turned a desperate battle` |
| `battle-influenced`, one reason | `helped win a hard-fought battle` |
| any other `type` | `null` (skipped) |

The panel renders each as `Turn {turn} — {text}`. `cityName` is the MR1
historical name (razed cities keep the name they had at capture — correct for a
record). A General who captures the same city on two different turns legitimately
gets **two** moments (`citiesCaptured` still counts it once) — distinct turns are
distinct stories; this is intentional, not deduped.

## 6. Card layout (mobile-first, age 7–43)

Each roster entry is a **`<details>` accordion** (scales a 20-General warmonger
roster and keeps the reading load opt-in for a young player):

- **`<summary>` (always visible):** `{portraitIcon} {name}` · `Era {era}` (omit
  when `era === null`) · a status word badge — `Active` / `Retired` / `Fallen`
  (the literal word, never colour-only) · then `statLine` if non-empty, else
  `— no notable actions yet`.
- **Expanded body, in narrative-first order:**
  1. `descriptor` (dim, omitted when `""`).
  2. `specialtyLine` if present.
  3. **Timeline:** `bookendStart`, then each `moments` entry as `Turn N — text`,
     then `bookendEnd` if present. If the timeline would otherwise be just the
     two bookends (no moments, no fallback line) and the General is still active,
     add `Still serving — no notable actions recorded yet.`
  4. **Compact stat line** (one row, not a grid): `Battles turned N · Cities
     captured N · Cities defended N · Units saved N · Rally/Seize/Last Stand N ·
     N turns in command`. "Cities defended" = `stats.uniqueCitiesDefended`
     (distinct places), not `cityDefenseActions`. Zeros shown (`0`) — it is a
     factual record.
  5. `profile` (authored only) in a nested collapsed `<details>` — `summary`,
     bulleted `facts`, `context`, `From: {loreWork}` — mirroring the
     `selected-unit-info.ts` bio block. `sources` are never shown (audit-only,
     per `.claude/rules/great-general-content.md`).

Accordion default state: `status === 'active'` entries start `open`; ended
entries start collapsed.

Roster order: `status === 'active'` first, then career-ended Generals by career
end turn (`retiredTurn ?? diedTurn`) descending — most recent first — ties broken
by `spawnedTurn` descending. **All entries always rendered — no truncation;** a
regression asserts one card per `generalHistory` entry.

## 7. Edge cases

- **Empty roster** (civ has never earned a General): the `🎖️` button is
  `hidden`, so the panel is normally unreachable. If opened anyway (router call),
  it shows one centred line — "No Great Generals have served yet. Earn one by
  leading your armies to hard-won victories." — and nothing else.
- **Discoverability:** the button appears the moment the civ earns its first
  General and stays thereafter — that transition is the signal. No persisted
  "unread" badge (would need a save migration; out of scope). Optional, non-required
  polish for the plan: `register-general-presentation.ts`'s existing
  retirement / death notification handler *may* append "— see the Hall of Fame"
  to its own toast text, but it must not alter the MR1-owned
  `describeGeneralCareerEnd` string stored on the entry.
- **Generated officer (#888):** `resolveGeneralDefinition` returns the persisted
  `state.generatedGenerals` identity; `getGeneralProfile` → `undefined` (no bio),
  `getGeneralSpecialtyPresentation` → `undefined` (no specialty line). Card still
  renders name + descriptor + timeline + stats.
- **Unresolvable `generalDefinitionId`** (authored id removed in a later release,
  or a generated identity dropped by `normalizeGeneratedGenerals` while its
  history id is retained for re-draw exclusion): `getHallOfFameForViewer` still
  emits a card — `name: "A forgotten commander"`, `portraitIcon: ""`,
  `era: null`, `descriptor: ""`, no `profile`/`specialtyLine`; `stats`,
  `bookendStart/End` and `moments` are still shown. A General never silently
  vanishes from the player's own record.
- **Active General, only `spawned`:** `statLine: ""`, `moments: []`, no
  `bookendEnd` → summary shows `— no notable actions yet`, body shows the "Still
  serving" line.
- **Hot-seat:** every builder call, the button-visibility check, and the
  selected-unit line use `state.currentPlayer`. Player A's roster never renders
  for player B; the button hides again on handoff to a player with no General
  history and reappears for one who has it.
- **Difficulty modes:** the builder and panel take no challenge-profile input;
  output is identical across Explorer / Standard / Veteran (matches MR1's
  difficulty-parity discipline — MR1 recording also reads no `opponentChallenge`).
- **AI:** AI civs accumulate `careerEvents` (MR1 parity) but no AI code path
  reads this feature; a guard test forbids `src/ai/` importing either new module.
- **Save compatibility:** no migration, no version bump. Reads existing persisted
  `generalHistory`; a save written before #940 has `careerEvents: []` from MR1's
  unconditional tail normalization → every General renders as a valid record
  with an empty timeline.
- **Panel staleness:** a General's career only changes on the viewer's own turn
  actions or end-of-turn processing — neither happens while this transient panel
  is the player's focus — and the panel is rebuilt from current state on every
  open, so there is no stale-view path. No in-panel control mutates state.

## 8. Testing

**`tests/systems/great-general-hall-of-fame.test.ts`**
- `classifyCareerEventImportance`: exact rank per event kind; two-reason
  `battle-influenced` ranks above one-reason; ability-use kinds and an
  unrecognised synthetic `{ type: 'future-thing', turn: 1 }` both rank `0`.
- `selectMemorableMoments`: caps at 5; highest-importance first; the returned
  list is `turn`-ascending; `city-*` / `unit-saved` always beat single-reason
  `battle-influenced`; an unrecognised event never appears and never throws;
  a routine-only career with ability uses yields the single synthesized
  "steadied the ranks through N heroic commands" line; a truly empty career
  (only `spawned`) yields `[]`.
- `describeMoment`: output for every mapped kind matches the §5 templates and
  contains no `(-?\d+, ?-?\d+)` coordinate substring; `unit-saved` uses the
  friendly `UNIT_DEFINITIONS[type].name`; unmapped kind → `null`.
- `getHallOfFameForViewer`: one entry per `generalHistory` entry (active +
  retired + fallen); `status` from `outcome`; **never** returns an entry from
  another civ's history (two-civ negative test); empty roster → `[]`;
  generated-officer entry has no `profile` / `specialtyLine`;
  **unresolvable-id entry** → the "A forgotten commander" fallback card with
  stats + timeline intact; ordering = active first then most-recent-end first,
  `spawnedTurn`-desc tie-break.
- Guard: no file under `src/ai/` imports `great-general-hall-of-fame`
  **or** `hall-of-fame-panel` (extend the MR1 guard in
  `great-general-career.test.ts`).

**`tests/ui/hall-of-fame-panel.test.ts`** (jsdom)
- One `[data-hall-of-fame-entry]` `<details>` per entry; count === `entries.length`
  (no truncation).
- `<summary>` carries the status word ("Active" / "Retired" / "Fallen") and the
  stat line (or "no notable actions yet").
- Active entry renders with the `open` attribute; an ended entry does not.
- Expanded body order is descriptor → specialty → timeline → stat line → bio;
  `moments` render `turn`-ascending between `bookendStart` and `bookendEnd`.
- Compact stat line shows every summary number including zeros; "Cities defended"
  reflects `uniqueCitiesDefended`.
- Empty `entries` → the empty-state message, no cards.
- Close button → `onClose` called and `#hall-of-fame-panel` removed; a second
  `createHallOfFamePanel` call replaces rather than duplicates the panel.
- A General `name` of `"<b>x</b>"` renders as literal text (no `<b>` element).
- The panel module's source contains no `GameState` import.

**`tests/app/controllers/panel-actions-controller.test.ts`** (extend, mirroring
the `openBestiary` test)
- `openHallOfFame()` builds entries from `session.getState().currentPlayer` and
  passes them to `createHallOfFamePanel`.

**`tests/ui/game-shell.test.ts`** (extend)
- **Required edit:** the "keeps desktop utility controls in a non-overlapping
  toolbar" test asserts the exact ordered button-id list — add `'btn-hall-of-fame'`
  immediately before `'btn-pause-menu'`.
- `#btn-hall-of-fame` exists, `hidden` on creation, `title` is
  "Great Generals — Hall of Fame"; un-hiding it and clicking calls
  `onOpenHallOfFame`; a shell built without the optional callback does not throw
  on click.

**`tests/app/controllers/hud-controller.test.ts`** (extend)
- `update()` leaves `#btn-hall-of-fame` `hidden` when
  `currentPlayer.generalHistory` is empty and un-hides it when it is non-empty;
  a hot-seat handoff to a player with no history re-hides it.

**`tests/ui/selected-unit-info.test.ts`** (extend — additive `toContain`
assertions only; no existing assertion removed; the existing "no extra text when
`generalDefinitionId` does not resolve" case stays green because the new block is
inside `if (generalDef)`)
- Selected Great General whose civ history has real deeds → "Career so far — …"
  line present with the expected clause.
- Freshly-spawned General (only `spawned`) → no "Career so far" line.
- Enemy-owned General selected → no "Career so far" line (viewer-scoped).
- "View Hall of Fame" `createGameButton` present whenever a Great General is
  selected and the callback is supplied; clicking it calls `onOpenHallOfFame`;
  absent for a non-General unit.

**`tests/app/architecture-boundaries.test.ts`** — no change expected. (This test
checks `main.ts` size/purity and that no `app|presentation|ui` file mutates
`session.getState()`'s return — it does *not* police the panel registry.) The
plan verifies it stays green: no `main.ts` edit, the builder is pure, the panel
is read-only.

**`docs/superpowers/plans/README.md` checklist mapping:** no player-visible
*state transitions* (read-only feature); the one derived label ("memorable" /
importance ranking) has positive coverage (city event ranks highest) and
negative coverage (routine ability use / unknown type is never surfaced as a
moment); replayable-interaction coverage = open → close → reopen renders a fresh
snapshot.

## 9. File-by-file change list

**Create:**
- `src/systems/great-general-hall-of-fame.ts`
- `src/ui/hall-of-fame-panel.ts`
- `tests/systems/great-general-hall-of-fame.test.ts`
- `tests/ui/hall-of-fame-panel.test.ts`

**Modify:**
- `src/app/panel-registry.ts` — `PanelId` union `+ 'hall-of-fame'`
- `src/app/bootstrap.ts` — registry entry
- `src/app/controllers/panel-actions-controller.ts` — `openHallOfFame()` + interface
- `src/app/controllers/game-session-controller.ts` — `onOpenHallOfFame` on the
  shell callbacks and the selected-unit-info callbacks
- `src/app/controllers/hud-controller.ts` — `btn-hall-of-fame` visibility toggle in `update()`
- `src/ui/game-shell.ts` — optional `GameShellCallbacks.onOpenHallOfFame?`,
  toolbar button (before `btn-pause-menu`, `hidden` initially), id-cleanup list
- `src/ui/selected-unit-info.ts` — career line + "View Hall of Fame" button;
  `SelectedUnitInfoCallbacks.onOpenHallOfFame?`
- `tests/ui/game-shell.test.ts` — toolbar id-list assertion + new button tests
- `tests/app/controllers/hud-controller.test.ts` — visibility test
- `tests/app/controllers/panel-actions-controller.test.ts` — `openHallOfFame` test
- `tests/ui/selected-unit-info.test.ts` — new assertions
- The PR updates issue #887 (comment that MR2 is complete); closing #887 is the
  maintainer's call at merge — the PR body proposes it as the final piece.

## 10. Non-goals recap (do not build here)

Enemy Generals, full event log, sort/filter controls, portrait art, audio,
ceremony/fanfare, animation, a share-card export, cross-civ comparison, a
persisted "unread" indicator, any change to how career events are recorded.
