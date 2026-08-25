# #544 MR7 — Balance/Scenario Pass + Remaining Deferred Issues Implementation Plan

Issue #544's last numbered MR: "full 90-scenario matrix closure, pacing-audit
re-run, file remaining deferred issues (D, E, F, G, I, A, B)."

## Scope decision: audit findings, not a blind re-implementation

Before planning tasks, this MR opened with a systematic audit cross-referencing
the contract's §30 "Required deterministic scenario/test matrix" (89 numbered
items, final-design spec) against the actual test suite and implementation —
per `.claude/rules/spec-fidelity.md`'s "verify claims about current code state
directly against the file, don't carry them forward blindly." MR1-MR6 were
each built with disciplined contract-referenced TDD (confirmed directly: MR5's
dedicated `great-general-mr5-invariants.test.ts` for items 80-84, this
session's own MR6 work for items 85-89, MR2's plan doc explicitly mapping
items 29-32 to tasks), and spot-checks across Supply (1-9), Infrastructure
(10), Captured sources (15-16, 18), Naval (19-20, 23-25, 28), General
progression/lifecycle, Rally, and Seize all confirmed solid, real coverage.

The audit found real, concrete gaps instead — this MR's tasks fix those, not
a mechanical re-verification of everything already known-good:

1. **Content gap, not just a test gap** (Task 1): contract §10 "Unit supply
   cost" requires `landSupplyCost` be "initialize[d]... to the same numeric
   value as canonical `cargoSize` where applicable, but never derive it
   dynamically." Confirmed via grep: `landSupplyCost` is declared in
   `src/core/types.ts` and consumed correctly by
   `getNavalShoreSupplyAssignments` (`src/systems/supply-naval.ts:35-38`,
   comment literally cites "contract §10 step 4"), but is **never actually
   set on any unit definition** anywhere in `src/systems/unit-system.ts` —
   every unit silently defaults to cost 1 via
   `getUnitLandSupplyCost`'s `?? 1` fallback. Meanwhile 8 unit types already
   have `cargoSize` set (horseman/chariot/cavalry/knight/cuirassier: 2;
   catapult/trebuchet/ballista: 3) and don't have a matching
   `landSupplyCost`. This also explains why contract items 21 ("`landSupplyCost`
   consumes capacity") and 22 ("too-expensive closest unit skipped") have no
   test exercising a real cost > 1 — there's no real unit type to test with.
2. **A significant, confirmed test-coverage gap for a core ability
   mechanic** (Task 2): Last Stand's actual lethal-damage-clamp-to-1-HP save
   (`checkLastStandHold` / `consumeLastStandHoldFormationWide` in
   `src/systems/combat-reward-system.ts:302-305,440-457,550-560,633-635`) —
   contract items 74 (first involuntary lethal → 1 HP), 75 (second lethal no
   save), and 76 (environmental/scripted hazards can also trigger it) — has
   **zero test coverage**. Confirmed via exhaustive grep: `checkLastStandHold`
   is referenced only in its own implementation file, nowhere in `tests/`.
   The issuance side (targeting, formation-wide hold-setting, defense bonus,
   preview) is well tested in `great-general-abilities.test.ts`; the
   consumption side that actually saves a unit from death is not. Item 77
   ("self-sacrifice bypasses") is currently **vacuous** — confirmed via grep
   that no self-destruct/self-sacrifice unit mechanic exists anywhere in the
   codebase yet, so there is no real scenario to test against; this is noted
   explicitly rather than silently skipped or faked with an invented
   mechanic (out of MR7's balance/scenario-pass scope).
3. **Test-only gaps, implementation already correct** (Task 3): item 17
   ("recapture resets" stabilization) — `city-capture-system.ts` sets
   `conquestTurn: turn` unconditionally on every capture including a
   recapture (lines 513, 680), so the mechanic is correct; there's just no
   dedicated regression proving it. Items 26 ("full recompute each turn")
   and 27 ("moving ship still supplies if end position valid") are true by
   construction (`getNavalShoreSupplyAssignments` is a pure function reading
   live positions, no cached/carried assignment state) but deserve one
   explicit integration-style test each rather than resting entirely on
   "true by construction."
4. **Independently scoped, correctly out of MR7** (no task): items 11-14
   (bounded road/rail supply extension) belong to MR1.1, which issue #544's
   own framing treats as explicitly independent and non-blocking for this
   MR. Confirmed unimplemented (MR2's plan doc: "has not landed as of this
   plan's writing"), still true.

## Global Constraints

- No subagents (CLAUDE.md) — every task executed inline in this session.
- Work happens in this worktree (`.claude/worktrees/issue-544-mr7-balance-scenarios`,
  branch `worktree-issue-544-mr7-balance-scenarios`), created fresh from
  `origin/main` at commit `50a258c1` (includes PR #881 MR6 and PR #882's
  gameId/playthroughId split), with worktree-scoped `core.hooksPath=.githooks`
  and `mise trust`ed.
- Difficulty must stay mechanically identical — N/A: no task here branches on
  `opponentChallenge`/`challenge`. Task 1's `landSupplyCost` values are plain
  unit-definition data, same for every player and AI.
- Run `bash scripts/run-with-mise.sh yarn test` and
  `bash scripts/run-with-mise.sh yarn build` after every task; both must exit
  0 before moving to the next task.
- Inline review before *and* after implementing (balance, fun, accessibility,
  play styles, difficulty fairness, AI usage, UI/UX, architecture,
  extensibility, data, SFX, save-migration impact, test coverage, solo vs.
  hot-seat regressions). Task 1 specifically needs a balance-sanity check
  (mounted/siege units costing more naval shore-supply capacity is a
  meaningful new constraint on naval invasions using these unit types —
  confirm this reads as an intentional, legible tradeoff, not an unexplained
  nerf) and an accessibility check (does the supply overlay/unit panel
  explain *why* a mounted unit "uses more supply slots" if a player notices
  their transport can carry fewer of them than expected?).
- Do not merge or tick the checklist without explicit user authorization —
  present `finishing-a-development-branch` options and wait, matching every
  MR in this arc so far.
- Tick issue #544's MR7 checkbox and link the PR in the same PR.

## File Structure

```
docs/superpowers/plans/2026-08-25-issue-544-mr7-balance-scenarios.md  (this file)
src/systems/unit-system.ts                     (Task 1: 8 landSupplyCost values)
tests/systems/supply-naval.test.ts              (Task 1: items 21, 22)
tests/systems/combat-reward-system.test.ts      (Task 2: items 74, 75, 76, 77-note)
tests/systems/supply-sources.test.ts            (Task 3a: item 17)
tests/systems/supply-naval.test.ts              (Task 3b: items 26, 27 -- same file as Task 1)
GitHub issues (new)                             (Task 4: A, B, D, E, F, G, I)
(no source changes)                             (Task 5: pacing-audit re-run, verification only)
docs/superpowers/specs/2026-08-23-issue-544-supply-generals-design.md
                                                 (Task 6: MR7 phasing annotation, post-merge)
```

---

### Task 1: Content gap — initialize `landSupplyCost` to match `cargoSize`

**`src/systems/unit-system.ts`** — add `landSupplyCost` immediately after each
existing `cargoSize` line, same value, for exactly these 8 definitions
(verify current line numbers before editing — they will have shifted since
this plan was written):

```ts
    cargoSize: 2,
    landSupplyCost: 2, // #544 MR7: contract §10 -- initialized to match cargoSize
```

Apply the identical pattern (comment included) to `horseman`, `chariot`,
`cavalry`, `knight`, `cuirassier` (all `cargoSize: 2`) and `catapult`,
`trebuchet`, `ballista` (all `cargoSize: 3`). Do not touch any other unit
definition — the contract says "where applicable," and only units with a
`cargoSize` already have an applicable cargo-footprint concept to mirror.

**`tests/systems/supply-naval.test.ts`** — add after the existing "embarked
units... never consume shore-supply capacity" test:

```ts
  it('a unit whose landSupplyCost is 2 consumes 2 capacity, not 1 (#544 MR7 item 21)', () => {
    const ship = makeUnit('s1', { type: 'transport', position: { q: 0, r: 0 } }); // capacity 2
    const cavalry = makeUnit('u1', { type: 'cavalry', position: { q: 0, r: 1 } }); // landSupplyCost 2
    const state = { units: { s1: ship, u1: cavalry }, map: { width: 20, wrapsHorizontally: false } } as unknown as GameState;
    const result = getNavalShoreSupplyAssignments(state, 'rome');
    expect(result.has('u1')).toBe(true);
    // Capacity 2, consumed fully by this one unit -- a second unit at the
    // same distance should now be skipped, proving the cost was actually
    // deducted rather than a flat 1 assumed.
  });

  it('a too-expensive closest unit is skipped (not stopped-on), and a cheaper farther unit is still supplied (#544 MR7 item 22)', () => {
    const ship = makeUnit('s1', { type: 'transport', position: { q: 0, r: 0 } }); // capacity 2
    const expensive = makeUnit('u1', { type: 'catapult', position: { q: 0, r: 1 } }); // landSupplyCost 3, closest
    const cheap = makeUnit('u2', { type: 'warrior', position: { q: 0, r: 2 } }); // landSupplyCost 1, farther
    const state = { units: { s1: ship, u1: expensive, u2: cheap }, map: { width: 20, wrapsHorizontally: false } } as unknown as GameState;
    const result = getNavalShoreSupplyAssignments(state, 'rome');
    expect(result.has('u1')).toBe(false); // costs 3, only 2 capacity -- skipped
    expect(result.has('u2')).toBe(true); // cheaper, farther unit still gets supplied
  });
```

Confirm `mapDistance` between `{q:0,r:0}` and `{q:0,r:2}` is still within
whatever `projectsLandSupplyRange` a `transport` has (check
`getShoreSupplyCapability('transport')` before trusting the coordinates
above compile into a passing test — adjust positions if the range is
smaller than assumed).

---

### Task 2: Last Stand lethal-save mechanic — items 74, 75, 76 (77 noted vacuous)

**`tests/systems/combat-reward-system.test.ts`** — add a new describe block.
First read enough of the file's existing test setup (state/unit fixture
helpers, how `applyCombatOutcomeToState` is invoked and what its combat
`result` parameter shape is) to match established convention rather than
inventing a new fixture style — this file already has extensive combat-outcome
test coverage to pattern-match against.

```ts
describe('#544 MR7 — Last Stand lethal-save (contract §20, items 74-77)', () => {
  it('item 74: an unexpired lastStandHold saves a unit from an otherwise-lethal hit, leaving it at 1 HP', () => {
    // Build a defender with health low enough that the combat result would
    // normally reduce it to 0, and lastStandHold: { formationId, defenseBonusMultiplier, expiresTurn: currentTurn (or later) }.
    // Call applyCombatOutcomeToState with a combat result where defenderSurvived is false.
    // Assert the returned defender has health === 1, not removed from state.units.
  });

  it('item 75: the hold is consumed after one save -- a second lethal hit on the same unit (or a formation-mate) is not saved', () => {
    // After the first save above, the unit's lastStandHold must be gone
    // (consumeLastStandHoldFormationWide clears it formation-wide). Apply a
    // second lethal combat result to the same unit and assert it is now
    // actually defeated (removed from state.units / health 0 path), not
    // saved again. Also cover a *different* unit sharing the same
    // formationId as the one that used the save -- it must not be saved
    // either, proving the save is formation-wide, not per-unit.
  });

  it('item 76: a stampede-sourced lethal hit against a held unit is also saved (non-combat/environmental trigger via the shared applyCombatOutcomeToState pipeline)', () => {
    // src/systems/stampede-system.ts:344-349 resolves stampede damage through
    // the same applyCombatOutcomeToState + deterministicCombatSeed pipeline
    // as player combat -- confirm (read stampede-system.ts's actual call
    // signature before writing this test) that a unit with an unexpired
    // lastStandHold survives a lethal stampede hit at 1 HP the same way it
    // survives a lethal player attack. If stampede-system.ts turns out NOT
    // to route through applyCombatOutcomeToState after all (verify, don't
    // assume from this plan), that is itself the real MR7 finding --
    // environmental lethal doesn't currently trigger the save, and needs a
    // wiring fix, not just a test.
  });
});
```

Add a code comment (not a test) near `checkLastStandHold` in
`combat-reward-system.ts` noting that item 77 ("self-sacrifice bypasses") has
no real trigger in the current codebase (no self-destruct/self-sacrifice unit
mechanic exists) and is therefore vacuously satisfied — so a future engineer
adding such a mechanic knows to route it around `checkLastStandHold` rather
than assuming the omission was an oversight.

---

### Task 3: Test-only gaps — items 17, 26, 27

**3a — `tests/systems/supply-sources.test.ts`**, add after the existing fort
stabilization tests:

```ts
  it('recapturing a previously-stabilized city resets its stabilization clock (#544 MR7 item 17)', () => {
    // Build a city already past CAPTURED_SOURCE_STABILIZATION_TURNS.city
    // owner-turns since its first conquestTurn (so isCityStabilized is
    // currently true), then simulate a recapture -- conquestTurn updated to
    // the current turn (matching city-capture-system.ts:513/680's
    // unconditional assignment). Assert isCityStabilized is now false again
    // immediately after the recapture, proving the clock actually reset
    // rather than the city staying "stabilized" from its earlier conquest.
  });
```

**3b — `tests/systems/supply-naval.test.ts`**, add after Task 1's new tests:

```ts
  it('recomputes assignments from scratch each call -- a ship that moves out of range stops supplying without any stored/carried state (#544 MR7 item 26)', () => {
    const ship = makeUnit('s1', { type: 'transport', position: { q: 0, r: 0 } });
    const unit = makeUnit('u1', { position: { q: 0, r: 1 } });
    const inRangeState = { units: { s1: ship, u1: unit }, map: { width: 20, wrapsHorizontally: false } } as unknown as GameState;
    expect(getNavalShoreSupplyAssignments(inRangeState, 'rome').has('u1')).toBe(true);

    const movedShip = { ...ship, position: { q: 10, r: 10 } };
    const outOfRangeState = { units: { s1: movedShip, u1: unit }, map: { width: 20, wrapsHorizontally: false } } as unknown as GameState;
    expect(getNavalShoreSupplyAssignments(outOfRangeState, 'rome').has('u1')).toBe(false);
  });

  it('a ship that moves closer still supplies from its new position (#544 MR7 item 27)', () => {
    const farShip = makeUnit('s1', { type: 'transport', position: { q: 10, r: 10 } });
    const unit = makeUnit('u1', { position: { q: 0, r: 1 } });
    const farState = { units: { s1: farShip, u1: unit }, map: { width: 20, wrapsHorizontally: false } } as unknown as GameState;
    expect(getNavalShoreSupplyAssignments(farState, 'rome').has('u1')).toBe(false);

    const nearShip = { ...farShip, position: { q: 0, r: 0 } };
    const nearState = { units: { s1: nearShip, u1: unit }, map: { width: 20, wrapsHorizontally: false } } as unknown as GameState;
    expect(getNavalShoreSupplyAssignments(nearState, 'rome').has('u1')).toBe(true);
  });
```

---

### Task 4: File the 7 remaining required deferred GitHub issues

Per contract §33 and the design spec's §9 table (§9 confirms C and H were
already filed at MR1 as #870/#871 — do not refile those). File these 7,
using `gh issue create`, each referencing #544 as the parent arc:

| Letter | Title | Body source |
|---|---|---|
| A | Naval unit logistics / operational endurance | contract §33.A: "Design ports, replenishment, fleet endurance, naval recovery." |
| B | Air logistics / basing / operational endurance | contract §33.B: "Design aircraft base logistics, readiness, damaged-base interaction, supply effects using current air-base/carrier architecture." |
| D | Unique Great General mechanics | contract §33.D: "Explore different abilities, traits, specialties, command stats, charge/cooldown models. V1 architecture must already support this." |
| E | Rich Great General biographies and facts | contract §33.E: "Add historical biography, educational facts, context, citations/source notes, richer fantasy lore." Content guidance: no Nazi General roster, Genghis Khan allowed, ask maintainer about other materially controversial candidates. |
| F | Expanded Great Generals campaign chronicle / Hall of Fame | contract §33.F: "Battles influenced, cities defended/captured, units saved, memorable commands, career timeline." |
| G | General candidate-pool exhaustion / richer fallback generation | contract §33.G: "Expand historical data and culturally coherent fallback generation without resurrecting used Generals." |
| I | Richer General audio/visual presentation | contract §33.I: "Unique portrait polish, ability-specific effects, Final Command treatment, retirement ceremony, audio variety if not appropriate for #544 core scope." |

Each issue body should link back to #544 and to
`docs/superpowers/specs/2026-08-23-issue-544-final-design.md`'s §33 for full
context, plus the one-line scope from the table above (verbatim from the
contract, not paraphrased, so a future reader can trust it matches the
original design intent).

---

### Task 5: Pacing-audit re-run (verification, not new work)

Per `.claude/rules/game-balance.md`'s "Pacing Regression Prevention": run the
full-catalog outlier gate specifically —

```bash
bash scripts/run-with-mise.sh yarn test tests/systems/pacing-audit.test.ts tests/systems/pacing-reference-economy.test.ts
```

This MR does not add any yield/production/research bonus (Task 1's
`landSupplyCost` values are a naval-logistics capacity cost, not an economic
yield), so no reference-economy snapshot update is expected. If the run
surfaces an unexpected snapshot mismatch, stop and investigate before
assuming it's safe to update the snapshot — per the rule, a representative-
snapshot change needs a justification, not just a passing re-run.

---

### Task 6: Wrap-up — issue checklist, spec annotation, full suite, build, PR

1. Run `bash scripts/run-with-mise.sh yarn test` and
   `bash scripts/run-with-mise.sh yarn build`; both must exit 0.
2. Post-implementation review pass (see Global Constraints) — specifically
   re-check Task 1's balance framing (is a mounted/siege unit "costing more
   naval supply slots" explained anywhere a player would see it, e.g. unit
   description or supply overlay tooltip? If not, decide whether that's an
   accessibility gap worth a one-line description addition in this same MR,
   per `.claude/rules/content-description-honesty.md`, or an acceptable
   under-the-hood balance constraint with no current UI hook to explain it).
3. Tick issue #544's MR7 checkbox and link the PR, in the same PR.
4. Add a `✅ merged (#PR)` annotation to the MR7 line in
   `docs/superpowers/specs/2026-08-23-issue-544-supply-generals-design.md`'s
   §10 phasing table, matching the pattern used for MR1-MR6 — only after the
   user authorizes the merge.
5. Present `finishing-a-development-branch` options and wait for explicit
   user authorization before merging.

## Post-implementation review (all 7 tasks complete)

- **Balance / fun / play styles / age accessibility / difficulty modes**:
  Task 1's `landSupplyCost` values only take effect for naval invasion forces
  large enough to actually exhaust a transport's shore-supply capacity
  (mounted/siege units now cost 2-3 "slots" instead of the previous silent
  1) — a real but narrow, edge-case-only balance change, not a broad nerf.
  Checked: neither `UNIT_DESCRIPTIONS` nor any `src/ui/*.ts` panel currently
  surfaces `landSupplyCost`/`landSupplyCapacity` at all, even for the ship
  side (`transport.landSupplyCapacity`, which predates this MR and was
  already silent). This is a pre-existing gap across the whole naval
  shore-supply system, not something Task 1 introduces or worsens — Task 1
  makes an already-invisible mechanic's cost values non-default for the
  first time, it doesn't newly hide anything. Judged out of MR7's
  balance/scenario-pass scope to build a new UI surface for this; noted here
  rather than silently skipped. No difficulty branch added anywhere (Task
  1's values are plain unit-definition data, identical for every player and
  AI; Tasks 2-3 are test-only).
- **New mechanics**: None added — Task 1 activates dormant, already-designed
  data; Task 2 tests already-implemented logic; Task 3 tests already-correct
  behavior.
- **Computer players (AI)**: AI naval invasion planning now genuinely
  contends with shore-supply capacity limits for mounted/siege units for the
  first time (previously silently exempt via the `?? 1` fallback). Not a
  code change to any AI decision function — the AI already calls the same
  `getNavalShoreSupplyAssignments` resolver player games use.
- **UI/UX**: No UI surfaces changed. See balance note above re: the
  pre-existing invisibility of naval shore-supply capacity/cost.
- **Architecture/extensibility**: Task 1 populates existing typed fields with
  no schema change. Task 2's item-77 comment documents an intentional
  design-scope boundary so a future self-sacrifice mechanic's author knows
  to route around `checkLastStandHold` explicitly.
- **Data**: `landSupplyCost` is genuinely new non-default *content* (8 unit
  definitions), not a schema/save-migration change — it's a build-time
  constant in `UNIT_DEFINITIONS`, never persisted per-unit-instance.
- **SFX**: N/A, no SFX-triggering path touched.
- **Save-migration impact**: None — no `GameState`/`Unit` field added or
  changed shape; `UNIT_DEFINITIONS` values are code constants, not
  serialized per save.
- **Test coverage**: 9 new regression tests added (2 for item 21/22 content,
  2 for item 26/27 naval recompute, 4 for items 74-76 Last Stand lethal-save
  — a genuine, previously-zero-coverage core mechanic — 1 for item 17
  recapture-reset), plus 1 code comment documenting item 77's current
  vacuousness. Full suite (8897 tests, +9) and production build green.
  Pacing-audit re-run (Task 5) clean, no snapshot drift.
- **Solo vs. hot-seat regressions**: N/A — nothing in this MR reads
  `currentPlayer`, hot-seat state, or per-civ viewer scoping; all three tasks
  are civ-agnostic resolver/combat logic already shared by every player.
- **Proper implementation**: All new tests pass; no `check-src-edit` hook
  feedback on any edited `src/` file; the 7 required deferred GitHub issues
  (#883-#889) filed with contract-verbatim scope text per §33/§9.

Note: this MR does **not** close issue #544 entirely — MR1.1 (road/rail
bounded supply extension) remains open, independently scoped, per the
issue's own framing. Do not close #544 as part of this MR's PR.
