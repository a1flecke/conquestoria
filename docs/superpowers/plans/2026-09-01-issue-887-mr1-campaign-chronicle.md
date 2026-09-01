# #887 MR1 — Great General campaign-history ledger — Implementation Plan

> Execute inline (repo forbids subagents). TDD, frequent commits. Design:
> `docs/superpowers/specs/2026-09-01-issue-887-mr1-campaign-chronicle-design.md`.

**Goal:** record meaningful Great General career events at canonical gameplay
mutation sources, persisted per-General inside `GeneralHistoryEntry.careerEvents`,
with a pure aggregation helper and a viewer-safe boundary. **No Hall of Fame UI.**

## Global Constraints

- No `Math.random()` / `Date.now()`. Immutable state updates (spread-copy).
- Career recording never reads `state.opponentChallenge` (difficulty parity).
- AI and human flow through the same domain sources → same events (AI parity).
- Attribution is conservative: only an active G-issued `lastStandHold` on, or G's
  same-turn `seizeGrantedBy` to, a combat participant counts as "influenced".
- One `battle-influenced` / `city-defended` / `city-captured` per `(General, event)`.
- Migration 24 never fabricates events for legacy saves.
- No new bus events, no new notifications/SFX, no UI. The only player-facing
  change: the existing end-of-career line gains a terse career-stat clause.
- Commit trailer: `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.

---

### Task 1: Types + `great-general-career.ts` (append + summary + viewer helpers)

**Files:** `src/core/types.ts` (modify), `src/systems/great-general-career.ts`
(create), `tests/systems/great-general-career.test.ts` (create).

**Steps (TDD):**
1. Failing test: `summarizeGeneralCareer` over a hand-built `GeneralHistoryEntry`
   with a mix of events returns exact counts; `undefined` `careerEvents` → zeros;
   `status` from terminal event; `careerTurns` from `retiredTurn ?? diedTurn ??
   lastActiveTurn` minus `spawnedTurn` (min 0). `appendGeneralCareerEvent` no-ops
   on falsy id / missing civ / no matching entry; appends immutably otherwise
   (new array identity). `getGeneralCareerForViewer` returns the summary when the
   viewer's `generalHistory` has the entry, `undefined` otherwise.
   `summarizeCivHallOfFame` maps over `civ.generalHistory`.
2. `src/core/types.ts`: add
   ```ts
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
   Add `careerEvents?: GeneralCareerEvent[];` to `GeneralHistoryEntry`.
   Add `generalDefinitionId?: string;` to `LastStandHoldState`.
   Add `seizeGrantedBy?: { generalDefinitionId: string; turn: number };` to `Unit`.
3. `src/systems/great-general-career.ts`: `appendGeneralCareerEvent`,
   `GeneralCareerSummary`, `summarizeGeneralCareer`, `summarizeCivHallOfFame`,
   `getGeneralCareerForViewer`. Imports: `@/core/types` only (helpers need no
   name resolution — counts only; the end-of-career clause formats in Task 6).
4. Green. Commit.

---

### Task 2: spawn + Last Stand identity/issuance

**Files:** `src/systems/great-general-system.ts` (`spawnGeneralForCiv`),
`src/systems/great-general-abilities.ts` (`issueLastStand`),
`tests/systems/great-general-system.test.ts`, `tests/systems/great-general-abilities.test.ts`.

1. Failing tests: after `spawnGeneralForCiv`, the new entry's `careerEvents` is
   `[{ type: 'spawned', turn }]`. After a successful `issueLastStand`, the
   General's entry has `last-stand-issued` (unitsProtected = targets.length) and
   every protected unit's `lastStandHold.generalDefinitionId` === the General's id.
2. `spawnGeneralForCiv`: seed the new entry with `careerEvents: [{ type: 'spawned', turn: state.turn }]`.
3. `issueLastStand`: set `hold.generalDefinitionId = resolveGeneralDefinition(state, general.generalDefinitionId)?.id`
   (the stable id — for a generated General this is the `generated:*` id); after
   `spendHeroicCommandCharge`, `appendGeneralCareerEvent(result, general.owner,
   general.generalDefinitionId, { type: 'last-stand-issued', turn, unitsProtected })`.
4. Green. Commit.

---

### Task 3: Rally + Seize + Final Command + seizeGrantedBy clear

**Files:** `src/systems/great-general-abilities.ts` (`issueRally`,
`issueSeizeTheMoment`, `spendHeroicCommandCharge`), the end-of-turn unit sweep
(find via `grep -rn "rallyProtectedThisRound" src/` — likely
`turn-manager.ts`), tests.

1. Failing tests: successful `issueRally` → one `rally-used` with correct
   `unitsAffected` / `totalHpRestored`; ineligible/zero-target Rally → none.
   Successful `issueSeizeTheMoment` → one `seize-used` (`unitsRefreshed` =
   activated count) **and** each activated unit gets
   `seizeGrantedBy = { generalDefinitionId, turn }`; empty selection → none.
   `spendHeroicCommandCharge` on the charge that reaches resolved
   `maxCommandCharges` → one `final-command`; earlier charges → none.
   The turn sweep that clears `rallyProtectedThisRound` also clears `seizeGrantedBy`.
2. Implement each at the success point (after/inside `spendHeroicCommandCharge`
   for the ability events; inside `spendHeroicCommandCharge` itself for
   `final-command`, guarded by `(used ?? 0) + 1 === resolveGeneralMechanics(def).maxCommandCharges`).
3. Add `seizeGrantedBy` to the same delete/clear list as `rallyProtectedThisRound`.
4. Green. Commit.

---

### Task 4: combat — unit-saved + battle-influenced + city-defended

**Files:** `src/systems/combat-reward-system.ts`, `tests/systems/combat-reward-system.test.ts`.

1. Failing tests:
   - A Last Stand that prevents an otherwise-lethal hit → one `unit-saved`
     (via 'last-stand', `remainingHp: 1`, `unitType`, `location`) for the
     issuing General. A non-lethal protected hit → no `unit-saved`. Two
     formation-mates: the shared hold's one consume → at most the saves that
     actually fired, never a phantom.
   - A combat where a participant carries an active G Last Stand hold → one
     `battle-influenced` (`reasons: ['last-stand']`, `combatId`, `location`).
   - A combat where a participant has G's same-turn `seizeGrantedBy` → one
     `battle-influenced` (`reasons: ['seize']`).
   - Both on one participant / both Generals different → one `battle-influenced`
     with `reasons: ['last-stand','seize']` (sorted) resp. one event per General.
   - A General merely within command range, no hold/seize → **no** event.
   - Defender on an owned-city tile survives, attacker does not → one
     `city-defended` per influencing General. Attacker survives / defender not
     on a city tile → no `city-defended`.
2. Add `unit-saved` capture at each `checkLastStandHold → health: 1` site
   (attacker branch, defender branch, splash loop): push
   `{ generalDefinitionId: <participant>Before.lastStandHold?.generalDefinitionId,
   unitId, unitType, remainingHp: 1, location: <participant>Before.position }`
   into a local `savedEvents[]`; after the outcome, for each append via
   `appendGeneralCareerEvent`.
3. Add `recordGeneralCareerCombatEvents(preState, result, nextState): GameState`
   and call it next to the existing `recordGeneralDeaths` call. It:
   - reads `preState.units[result.attackerId]`, `preState.units[result.defenderId]`;
   - for each, if it has an active `lastStandHold` (`preState.turn <= expiresTurn`)
     add `'last-stand'` for `hold.generalDefinitionId`; if `seizeGrantedBy?.turn
     === preState.turn` add `'seize'` for that `generalDefinitionId`;
   - append one `battle-influenced` per distinct General (`reasons` sorted,
     `combatId = ${result.attackerId}:${result.defenderId}:${preState.turn}`,
     `location = result.defenderPosition`);
   - if `result.defenderPosition` is a tile of a city owned by the defender's
     civ, the defender unit still exists in `nextState.units`, and the attacker
     does not (`!nextState.units[result.attackerId]`), also append one
     `city-defended` (`cityId`, `cityName`) per influencing General.
4. Green + existing `combat-reward-system.test.ts` unaffected. Commit.

---

### Task 5: city captured

**Files:** `src/systems/city-capture-system.ts` (`recordCityCaptureCareerEvents`),
`src/main.ts` (human capture site), the AI capture path
(`grep -rn "resolveMajorCityCapture" src/` → wire every real caller), tests.

1. Failing tests: a General who influenced the garrison-breaking `precedingCombat`
   or holds a same-turn `seizeGrantedBy` on the capturing `attackerId` → one
   `city-captured` (`cityId`, `cityName` = name at capture time) for that General,
   under the `newOwner` civ. An uninvolved General of the same civ → none. Works
   for occupy and raze. Parity: same event for an AI capture.
2. `recordCityCaptureCareerEvents(state, cityId, cityName, newOwnerId, attackerId, precedingCombat?): GameState`
   — collects influencing `generalDefinitionId`s (attacker's active hold / same-turn
   seize; `precedingCombat`'s participants' holds/seize), appends one
   `city-captured` each to `newOwnerId`'s history.
3. Call it at each `resolveMajorCityCapture` caller, right after the capture
   resolves, using the `PendingMajorCityCapture.attackerId` + the combat.
4. Green. Commit.

---

### Task 6: death + retirement + end-of-career-line enrichment

**Files:** `src/systems/combat-reward-system.ts` (`recordGeneralDeaths`),
`src/systems/great-general-system.ts` (`retireGeneralsAtTurnEnd`,
`describeGeneralCareerEnd`), `tests/systems/great-general-system.test.ts`,
`tests/systems/combat-reward-system.test.ts`, `tests/presentation/register-general-presentation.test.ts`.

1. Failing tests: `recordGeneralDeaths` appends `{ type: 'killed', turn }` to the
   dead General's entry (and still sets `outcome:'died'`). `retireGeneralsAtTurnEnd`
   appends `{ type: 'retired', reason: 'charges-expended', turn }`. A General that
   died is not also given a `retired` event. `describeGeneralCareerEnd(def,
   outcome, summary)` appends `" — N battles influenced, M cities defended"`-style
   clause when the summary has any non-spawn/terminal counts, and is byte-identical
   to today when it does not.
2. Implement: both lifecycle sites spread `careerEvents: [...(entry.careerEvents ?? []),
   <terminal event>]` inside their existing `.map`. `describeGeneralCareerEnd`
   gains `summary?: GeneralCareerSummary`; callers pass `summarizeGeneralCareer(entry)`
   for the just-ended entry (compute it from the *pre-terminal* entry or include
   the terminal event — either is fine, document which).
3. Green. Commit.

---

### Task 7: migration 24

**Files:** `src/storage/save-migrations.ts`, `tests/storage/save-migrations.test.ts`.

1. Failing tests: a v23 save with old minimal `generalHistory` migrates to v24
   with `careerEvents: []` on every entry and **no fabricated events**. A save
   already at v24 with real events round-trips unchanged. Malformed
   `careerEvents` (not an array / entries missing `type` or numeric `turn` /
   unknown `type`) normalize to a clean array. Migration is idempotent. Generated
   General entries handled identically.
2. `CURRENT_SAVE_SCHEMA_VERSION = 24`; add
   `24: normalizeGeneralCareerLedger` to `SAVE_MIGRATIONS`.
   `normalizeGeneralCareerLedger(state)`: for each civ, for each `generalHistory`
   entry, `careerEvents = Array.isArray(e.careerEvents) ? e.careerEvents.filter(isValidCareerEvent) : []`.
   `isValidCareerEvent` = object, `typeof type === 'string'` in the MR1 known set,
   `typeof turn === 'number' && Number.isFinite(turn)`. Idempotent + unconditional
   (same additive-safety pattern as `normalizeGeneratedGenerals`). Comment that
   the known-set is the MR1 set — a future MR adding types adds its own migration.
3. Green. Commit.

---

### Task 8: regression + verification + docs + PR

1. AI-import guard test (in `great-general-career.test.ts`): no file under
   `src/ai/` contains `great-general-career`.
2. Bounded-history fixture (Phase 34): a synthetic long career (many combats /
   rallies / seizes / last stands) → total events per General < 200 and no
   per-turn event kind exists.
3. `bash scripts/run-with-mise.sh yarn vitest run` on: `great-general-career`,
   `great-general-system`, `great-general-abilities`, `great-general-definitions`,
   `great-general-specialties`, `great-general-fallback-content`,
   `great-general-mr3/4/5-invariants`, `great-general-profiles`,
   `great-general-specialty-balance`, `ai-general-command`, `combat-reward-system`,
   `combat-context`, `city-capture-system` (+ any `tests/systems/*capture*`),
   `turn-manager`, `save-migrations`, `save-persistence`,
   `register-general-presentation`, `advisor-system`, `selected-unit-info`.
4. `git diff --check`; `bash scripts/run-with-mise.sh yarn build`;
   `bash scripts/run-with-mise.sh yarn test` (full + hook smoke tests).
5. Post-implementation review of the real diff against design Phase 39 list.
6. Update `#544` supply-generals-design.md row F to
   `🟡 MR1 backend shipped #887; MR2 Hall of Fame UI outstanding`.
7. Open PR: **"#887 MR1 — canonical Great General campaign-history ledger (backend, no UI)"**.
   Body per design's Delivery section + explicit "No Hall of Fame UI is included
   in this PR." Do **not** close #887; comment "MR1 backend/history foundation
   complete; MR2 Hall of Fame presentation still outstanding."
8. STOP. Do not start Phase B.
