# #887 MR1 — canonical Great General campaign-history ledger (Phase A / backend only)

Deferred from #544 §33.F. **Phase A only: audit, data model, transition-owned
event capture, persistence, migration, aggregation helpers, tests. NO Hall of
Fame UI, no campaign-timeline component, no new player-facing screen.**

Builds on #888 (`resolveGeneralDefinition`, persisted generated registry), #886
(`getGeneralProfile`, profiles ≠ mechanics), #885 (`resolveGeneralMechanics`,
static specialties), #932 (candidate seed). Does not recreate any of them.

## Phase 0 — current history model (audited against `79b5441a`)

- `civ.generalHistory?: GeneralHistoryEntry[]` — one entry per General *lifetime*.
  `{ unitId, generalDefinitionId, spawnedTurn, diedTurn?, outcome?: 'retired'|'died',
  retiredTurn?, endOfCareerLine?, heroicCommandsUsed? }`. A retired/fallen entry
  **persists forever** (this is how "used General never returns" works —
  `generateGeneralCandidates` reads the ids).
- Save schema `CURRENT_SAVE_SCHEMA_VERSION = 23` (migration 23 = `normalizeGeneratedGenerals`).
  This MR adds an unconditional additive normalization pass (`normalizeGeneralCareerLedger`)
  in the `migrateSaveToCurrent` tail. **It does not take a numbered slot: schema
  version 24 is already reserved for the pending research-cost retune**
  (`research-cost-migration-v24.ts`, pinned by `research-pacing-report.test.ts`).
  The tail pass is idempotent and fabricates no history, so it gives the same
  guarantee a numbered migration would.

## Phase 1 — canonical event-source map

| Career fact | Canonical mutation source | Persisted today? | Reliable attribution? |
|---|---|---|---|
| General spawned | `spawnGeneralForCiv` (`great-general-system.ts`) — pushes the `GeneralHistoryEntry` | yes (entry) | yes |
| Rally used | `issueRally` success, just before `spendHeroicCommandCharge` (`great-general-abilities.ts`) | no | yes — `generalUnitId` → `generalDefinitionId` |
| Seize used | `issueSeizeTheMoment` success, same point | no | yes |
| Last Stand issued | `issueLastStand` success, same point | no | yes |
| Unit saved by Last Stand | the 3 `checkLastStandHold(...) → health: 1` sites in `applyCombatOutcomeToState` (`combat-reward-system.ts` L453/563/646) | no | yes — via `lastStandHold` (see identity note) |
| Battle influenced | `applyCombatOutcomeToState` (L383) — the one canonical combat mutation | no | yes — from the participant units' `lastStandHold` / seize marker |
| City defended | `applyCombatOutcomeToState` when the defender is garrisoning an owned city and wins | no | derived from battle-influenced |
| City captured | `resolveMajorCityCapture` occupy/raze (`city-capture-system.ts` L469), attacker = `pending.attackerId`, garrison-breaker = `options.precedingCombat` | no | via attacker unit + precedingCombat |
| Final Command | `spendHeroicCommandCharge` when the spent charge is the last (`used+1 === resolved maxCommandCharges`) | no | yes |
| Retired | `retireGeneralsAtTurnEnd` (`great-general-system.ts`) — already sets `outcome:'retired'` | yes (entry) | yes |
| Died in combat | `recordGeneralDeaths` (`combat-reward-system.ts` L351) — already sets `outcome:'died'` | yes (entry) | yes |
| Passive stabilization | `getPassiveStabilizationTargets` per turn | **NOT RECORDED** (Phase 17 — telemetry spam) | n/a |

## Phase 2 — what "influenced" means (conservative, mechanically truthful)

A General **G** *influenced* a combat resolved by `applyCombatOutcomeToState` iff,
for the attacker unit **or** the defender unit, at least one is true:

1. the unit carries a `lastStandHold` **issued by G** and still active this turn
   (`turn <= hold.expiresTurn`) — whether or not it triggered a save; **or**
2. the unit's `hasActed` was cleared by **G's** Seize the Moment **this turn**,
   tracked by a new transient `unit.seizeGrantedBy?: { generalDefinitionId: string; turn: number }`
   set in `issueSeizeTheMoment`. It is **read only when `seizeGrantedBy.turn === state.turn`**
   (stale entries are inert), and is **cleared in the same end-of-turn unit sweep
   that clears `hasActed` / `hasMoved` / `rallyProtectedThisRound`** — verified
   against that sweep's location during implementation. Not a combat-affecting
   field: recording only.

**Not** influence: a General merely standing within command range with no
mechanic applied (there is no generic "command aura combat bonus" in the current
mechanics — #885's passive stabilization is a *supply* pause, not a combat
effect); a General elsewhere in the empire; Rally that healed a participant on a
prior turn (Rally credit is its own `rally-used` event — a healed unit later
winning a fight is not re-credited to Rally).

**City defended:** G gets `city-defended` credit iff a combat's `defenderPosition`
is a tile of an **owned city**, the defender survived, the attacker did not
survive *or* did not go on to capture, **and** G influenced the defender under
the rule above. (The intrinsic-strength defense path — `awardDefenseProgress`,
an undefended city surviving via walls — has no combat and no General mechanic,
so it is never `city-defended`.)

**City captured:** at `resolveMajorCityCapture`, G gets `city-captured` credit iff
G influenced `pending.attackerId`'s `precedingCombat` (the garrison-breaking
fight) **or** `pending.attackerId` carries G's `seizeGrantedBy` this turn (Seize
enabled the capturing action). **Not** every General of the attacking civ.

**Dedup:** one `battle-influenced` / `city-defended` / `city-captured` event per
`(General, combat)` / `(General, city event)`. Multiple influence reasons on one
combat → one `battle-influenced` with `reasons: ('last-stand'|'seize')[]`. Two
*different* Generals legitimately influencing the same combat → one event each
(no stacking rule is violated — they influenced different participants or added
different reasons).

## Phase 3-4 — data model (events stored, totals derived)

Extend `GeneralHistoryEntry` (Option A — nested; identity already present,
survives death/retirement, minimal migration). Types live in `core/types.ts`
alongside `GeneralHistoryEntry` (`GameState` transitively references them):

```ts
export interface GeneralHistoryEntry {
  /* ...existing fields unchanged... */
  careerEvents?: GeneralCareerEvent[];
}

export type GeneralCareerEvent =
  | { type: 'spawned';            turn: number }
  | { type: 'rally-used';         turn: number; unitsAffected: number; totalHpRestored: number }
  | { type: 'seize-used';         turn: number; unitsRefreshed: number }
  | { type: 'last-stand-issued';  turn: number; unitsProtected: number }
  | { type: 'unit-saved';         turn: number; via: 'last-stand'; unitId: string; unitType: UnitType; remainingHp: number; location: HexCoord }
  | { type: 'battle-influenced';  turn: number; combatId: string; reasons: Array<'last-stand' | 'seize'>; location: HexCoord }
  | { type: 'city-defended';      turn: number; cityId: string; cityName: string }
  | { type: 'city-captured';      turn: number; cityId: string; cityName: string }
  | { type: 'final-command';      turn: number }
  | { type: 'retired';            turn: number; reason: 'charges-expended' }
  | { type: 'killed';             turn: number };
```

**Review fix B/C:** `location` (the defender's hex) is on `battle-influenced` and
`unit-saved` so a future timeline can place the event on a map without
reconstructing from units that may be gone. `unitType` is on `unit-saved` so
`UNIT_DEFINITIONS[type].name` always resolves (the saved unit itself may later
die). `rally-used` / `seize-used` deliberately carry counts only (no unit-id
lists — Phase 8).

- Plain serializable objects, no class instances, stable string `type`s.
- **No UI strings, no profile prose, no specialty display copy.** `cityName` is
  the *historical* city name at event time (cities can be renamed / razed;
  persisting the name-at-event is required for a legible future chronicle — it is
  a campaign *fact*, not display copy).
- IDs only otherwise. Presentation resolves `name` / profile / specialty later
  via `resolveGeneralDefinition` + `getGeneralProfile` + `getGeneralSpecialtyPresentation`.
- `combatId`: `${result.attackerId}:${result.defenderId}:${state.turn}`
  (deterministic). **Review fix N:** a Seize-enabled *repeat* attack on the same
  target in the same turn produces the same `combatId`, so it counts as **one**
  influenced battle — the conservative choice ("influenced the fighting around X
  on turn 82"), not a double-count.

## Phase 5 — identity

Every event is stored **inside the `GeneralHistoryEntry`** whose
`generalDefinitionId` is the stable id (`gen_*` or `generated:*`). No display
name is stored. Generated identities stay resolvable via #888's persisted
`state.generatedGenerals` registry after death/retirement.

**Review fix D:** `LastStandHoldState` gains **only** `generalDefinitionId`
(dropped the `generalUnitId` — YAGNI; a future message resolves the name via
`resolveGeneralDefinition`). Set at `issueLastStand` time so unit-saved /
battle-influenced attribution survives the General unit dying. Bounded addition.
A legacy save's in-flight hold has no
`generalDefinitionId` → that one hold yields no attribution (bounded, acceptable;
the next issuance has it).

## Immutable append helper (Phase 29) — `appendGeneralCareerEvent`

`src/systems/great-general-career.ts`:

```ts
export function appendGeneralCareerEvent(
  state: GameState, civId: string, generalDefinitionId: string | undefined, event: GeneralCareerEvent,
): GameState;
```

- **No-ops (`return state`)** when `generalDefinitionId` is falsy, the civ has no
  `generalHistory`, or no entry in it has that `generalDefinitionId` (review fix
  R — covers legacy holds and a General whose entry was dropped by save
  normalization).
- Otherwise spread-copies `civilizations[civId].generalHistory` → the matching
  entry → its `careerEvents` array, appending `event`. One correct
  immutable-append implementation, called by every capture site.
- Callers always know `civId` (spawn/retire from the owner; ability sites from
  `general.owner`; combat sites from `unit.owner`; capture from `newOwnerId`) —
  **no roster scan** (review fix J).
- Imports only `@/core/types`. The summary helpers below additionally import
  `@/systems/unit-system` + `@/systems/great-general-definitions` for name
  resolution — no cycle (review fix K).

## Phase 7 — ordering

`turn` on every event. Same-turn order = **append order within the per-General
`careerEvents[]` array**, which JSON round-trips in order and is guaranteed by
the save format (arrays serialize positionally). No wall-clock. No global `seq`
field in Phase A — a cross-General merged timeline is Phase B and can add a
tiebreak then without disturbing stored events. Within one turn events are
appended in mutation order (Rally issued → combat resolves → capture resolves),
so "Turn 82 — Rally / Battle influenced / City captured" reproduces.

## Phases 8-16 — per-event capture points

- **spawned** — `spawnGeneralForCiv`: the new entry starts with
  `careerEvents: [{ type: 'spawned', turn }]`.
- **rally-used** — `issueRally` success: `unitsAffected = preview.targets.length`,
  `totalHpRestored = Σ(healthAfter − healthBefore)`. No unit-id list, no snapshot.
- **seize-used** — `issueSeizeTheMoment` success: `unitsRefreshed = toActivate.length`.
- **last-stand-issued** — `issueLastStand` success: `unitsProtected = preview.targets.length`.
- **unit-saved** — recorded at each of the 3 `checkLastStandHold → health:1`
  sites in `applyCombatOutcomeToState` (localized 2-line additions): push
  `{ unit-saved, via:'last-stand', unitId, unitType, remainingHp: 1, location }`
  keyed to `<participant>Before.lastStandHold!.generalDefinitionId` into a local
  array, appended after the outcome (review fix X). These branches **only** run
  on an otherwise-lethal result (verified) — a non-lethal protected hit never
  reaches them, so no false save. Formation-wide consume already prevents a
  second save from the same hold.
- **battle-influenced** + **city-defended** — one new helper in
  `combat-reward-system.ts`, `recordGeneralCareerCombatEvents(preState, result, nextState)`,
  called right beside the existing `recordGeneralDeaths` call near the end of
  `applyCombatOutcomeToState` (review fix X — the giant function's body is not
  edited). It reads `preState.units[result.attackerId / defenderId]` for active
  `lastStandHold` / same-turn `seizeGrantedBy`, builds
  `{ generalDefinitionId → Set<'last-stand'|'seize'> }`, and appends **one**
  `battle-influenced` per distinct General with sorted `reasons`. If the
  defender's tile is an owned city, the defender survived, and the attacker did
  not survive, it also appends **one** `city-defended` per influencing General.
- **city-captured** — a separate caller-invoked helper
  `recordCityCaptureCareerEvents(state, cityId, cityName, attackerId, precedingCombat?): GameState`
  in `city-capture-system.ts` (review fix Y — **no signature change to
  `resolveMajorCityCapture`**). Wired at both capture call sites (human in
  `main.ts`, AI in the major-turn path), each with a parity test. It credits the
  `newOwner`'s Generals who influenced `attackerId` (active `lastStandHold` /
  same-turn `seizeGrantedBy`) or influenced `precedingCombat`'s participants;
  appends `{ city-captured, cityId, cityName }` once per such General.
- **final-command** — `spendHeroicCommandCharge` when
  `(used ?? 0) + 1 === resolveGeneralMechanics(def).maxCommandCharges`.
- **retired** — `retireGeneralsAtTurnEnd`: append `{ retired, reason: 'charges-expended' }`
  (the only retirement path today is "all charges spent"; `final-command` already
  marks the last spend, so chronology reads "Turn N: Final Command" then
  "Turn N: Retired").
- **killed** — `recordGeneralDeaths`: append `{ killed, turn }`. No cause string
  (not reliably available; "persist facts, don't invent"). Death and retirement
  stay distinct: `recordGeneralDeaths` sets `outcome:'died'` and appends
  `killed`; `retireGeneralsAtTurnEnd` sets `outcome:'retired'` and appends
  `retired`. A General removed by death is filtered out of
  `retireGeneralsAtTurnEnd` (its unit is gone), so no double terminal event.

## Phase 17-18 — volume

No per-turn events. Passive stabilization is not recorded. Realistic worst case
per General (3-4 charges, ~2-turn Last Stand windows): ~1 spawned + ≤4
ability-issued + ≤~8 battle-influenced + ≤~4 unit-saved + ≤~4 city events + ≤2
terminal ≈ **~25 events**. A synthetic long-career fixture (Phase 34) asserts a
hard sanity ceiling (e.g. < 200) and that no path emits per-turn.

## Phase 19 — pure aggregation helper

`src/systems/great-general-career.ts`:

```ts
export interface GeneralCareerSummary {
  generalDefinitionId: string;
  spawnedTurn: number;
  lastActiveTurn: number;             // turn of the last event (spawn turn if none else)
  status: 'active' | 'retired' | 'fallen';
  careerTurns: number;                // (retiredTurn ?? diedTurn ?? lastActiveTurn) − spawnedTurn, min 0
  battlesInfluenced: number;          // distinct combatId in battle-influenced
  citiesCaptured: number;             // distinct cityId in city-captured
  uniqueCitiesDefended: number;       // distinct cityId in city-defended
  cityDefenseActions: number;         // total city-defended events
  unitsSaved: number;
  rallyUses: number;
  seizeUses: number;
  lastStandUses: number;              // last-stand-issued count
  finalCommandUsed: boolean;
}
export function summarizeGeneralCareer(entry: GeneralHistoryEntry): GeneralCareerSummary;
export function summarizeCivHallOfFame(civ: Pick<Civilization,'generalHistory'>): GeneralCareerSummary[];
```

Pure, O(events for one General), tolerates `careerEvents` `undefined`
(review fix S — `entry.careerEvents ?? []`), no world scan, no rendered strings.
`generalDefinitionId` comes from `entry.generalDefinitionId`. This is the
canonical data source a future Hall of Fame UI consumes with zero world-state
reconstruction. `summarizeGeneralCareer` is wired now (see "Existing-surface
enrichment"); `summarizeCivHallOfFame` + `getGeneralCareerForViewer` are
Phase-B-facing but tested and small — the assignment (Phase 38) explicitly lands
deployable backend data ahead of the UI.

## Phase 20 — importance classification — DEFERRED to Phase B

**Review fix I:** `classifyCareerEventImportance` is dropped from MR1 (YAGNI —
Phase 20 itself says "leave selection to Phase B"). It has no backend caller and
selection/ordering is a presentation concern.

## Existing-surface enrichment (Phase 31) — the one player-facing change

**Review fix I:** `summarizeGeneralCareer` needs a real consumer (repo rule: no
dead exports). `describeGeneralCareerEnd(definition, outcome)` in
`great-general-system.ts` already produces the one end-of-career line shown in
the `general:retired` notification and stored as `endOfCareerLine`. It gains a
terse, truthful career-stat clause built from the summary, e.g.
`"Julius Caesar retired after a distinguished career — 3 battles influenced, 2 cities defended."`
The clause is **omitted entirely** when the career has only `spawned` + a
terminal event (a peaceful-empire General's line is unchanged). This is a
minimal, mechanically-truthful change to an existing string (Phase 31), not a
redesign, and it wires the summary helper. `describeGeneralCareerEnd` gains an
optional `summary?: GeneralCareerSummary` param; callers
(`retireGeneralsAtTurnEnd`, `recordGeneralDeaths`) pass
`summarizeGeneralCareer(entry)` for the just-ended General.

## Phase 25 — viewer-safe boundary

`export function getGeneralCareerForViewer(state, viewerCivId, generalDefinitionId): GeneralCareerSummary | undefined`
— returns the summary **only** if `viewerCivId`'s `generalHistory` contains an
entry for that `generalDefinitionId` (i.e. the viewer owns / owned it). A rival's
General → `undefined`. Phase A never exposes rival career data; a future
"discovered enemy Hall of Fame" needs a discovery model that does not exist yet.
The raw per-civ `generalHistory` is already viewer-scoped state; UI must use this
helper, not iterate all civs.

## Phase 22-24 — separation & parity

- **#886**: nothing here reads/persists profile strings. `great-general-career.ts`
  never imports `great-general-profiles`.
- **#885**: no specialty display text persisted. A career event does **not**
  remember the General's specialty (authored specialties are static definition
  content; a future consumer resolves `getGeneralSpecialtyPresentation(def)`).
- **AI parity**: every capture point is a domain mutation source that AI and
  human both flow through (`issueRally`/`issueSeizeTheMoment`/`issueLastStand`
  are called by `ai-general-command.ts`'s `chosen.execute`;
  `applyCombatOutcomeToState` / `resolveMajorCityCapture` / `recordGeneralDeaths`
  / `retireGeneralsAtTurnEnd` are actor-agnostic; `recordCityCaptureCareerEvents`
  is wired at both the human and AI capture call sites). Parity tests for one AI
  path and one human path per event class.
- **Difficulty parity**: no capture point reads `opponentChallenge`; recorded
  facts, attribution, and summary math are identical across Explorer/Standard/Veteran.
- **Review fix H — AI does not read the ledger**: a regression test asserts no
  file under `src/ai/` imports `great-general-career.ts`. The AI writes events
  (via shared domain sources) but never reads career history for a decision.

## Phase 26 — ledger normalization (`normalizeGeneralCareerLedger`, additive tail pass)

For every civ's every `GeneralHistoryEntry`: `careerEvents = Array.isArray(x) ? x.filter(isValidCareerEvent) : []`.
`isValidCareerEvent` = object with a string `type` in the known set and a numeric
`turn`. **Idempotent.** **No fabricated events** for legacy saves — a pre-#887
save simply begins richer tracking from load onward (more truthful than inventing
prior battles). Also add `hold.generalDefinitionId`/`generalUnitId` defaulting is
unnecessary — a legacy active `lastStandHold` without them just yields no
attribution for that one in-flight hold (bounded, acceptable; next issuance has
it).

## Phase 29 — immutability

Every append is a spread-copy producing a new `civilizations[civId].generalHistory`
array with a new entry object with a new `careerEvents` array. A tiny shared
helper `appendGeneralCareerEvent(state, generalDefinitionId, event): GameState`
does this once (used by every capture site) so there is one correct
immutable-append implementation.

## Phase 36 — self-review answers

1. **Battle influenced** — an active G-issued `lastStandHold` on, or G's
   same-turn Seize grant to, the attacker or defender of a combat. Nothing else.
2. **City defended** — combat whose defender tile is an owned city, defender
   wins, attacker doesn't capture, and G influenced the defender (rule 1).
3. **City captured** — G influenced `pending.attackerId`'s garrison-breaking
   `precedingCombat`, or Seize enabled the capturing action. Not every civ General.
4. **Unit saved** — only at the 3 lethal-clamp sites where `checkLastStandHold`
   actually prevents an otherwise-lethal result; one event per save; formation-wide
   consume already prevents a second save from the same hold.
5. **Persisted vs derived** — events persisted (`careerEvents`); all totals
   (`battlesInfluenced`, `citiesCaptured`, …) derived by `summarizeGeneralCareer`.
   No duplicate mutable counters.
6. **Same-turn order** — append order within the per-General `careerEvents[]`
   array (JSON-positional, save-format-guaranteed). No global seq in Phase A.
7. **Legacy migration** — the `normalizeGeneralCareerLedger` tail pass sets
   `careerEvents: []` on old entries; never fabricates history.
8. **Retired/fallen generated General resolves** — yes; its `GeneralHistoryEntry`
   persists with `generalDefinitionId: 'generated:*'` and #888's registry entry
   persists; `resolveGeneralDefinition` still returns it.
9. **Future Hall of Fame without world scan** — yes; `summarizeCivHallOfFame(civ)`
   + `getGeneralCareerForViewer` are pure over `generalHistory` only.
10. **Ledger exposing hidden rival info** — mitigated: `getGeneralCareerForViewer`
    returns `undefined` for a General the viewer never owned; UI must use it.

## Non-goals (Phase B — do NOT implement here)

Hall of Fame screen, campaign timeline component, cards, portraits, filters,
sorting UI, navigation, CSS, animation, audio, icons, any player-facing surface.
No debug Hall of Fame. Inspection is via tests + a pure JSON helper only.
