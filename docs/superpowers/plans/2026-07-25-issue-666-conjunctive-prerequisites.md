# Issue #666 Conjunctive Prerequisites Implementation Plan

> **For agentic workers:** Execute this plan inline. Do not delegate: repository policy
> requires explicit user approval for any subagent, and the user requested inline work.

**Goal:** Add one canonical, explainable conjunctive-tech prerequisite contract for
trainable units and buildings without changing existing save semantics or difficulty rules.

**Architecture:** Keep legacy `techRequired` readable while adding optional
`requiredTechs`. A pure `production-prerequisites` helper returns stable ordered
required/satisfied/missing facts, and city production, upgrades, AI, and presentation
delegate to it. Static definition metadata remains non-persisted; existing queue
revalidation removes an old queued item that has become ineligible and records its
existing `no-longer-available` reason.

**Tech Stack:** TypeScript, Vitest, DOM tests, Vite.

---

## Inline review resolution

- **Balance/fun/difficulty:** This changes eligibility explanation, not unit strength,
  costs, combat, rewards, or Explorer/Standard/Veteran legality. Every difficulty uses
  the same helper and catalog.
- **Ages 7–43 and play styles:** The default explanation says `Requires A + B` with
  individual done/missing facts. The catalog remains browseable; no player must infer
  a missing gate from a vanished option.
- **AI:** AI production and research use definition data and the shared helper only;
  no opponent state or map scan is introduced.
- **Hot seat:** City production evaluates the displayed city's owner; the research
  inspector evaluates its displayed civilization. No prerequisite, queue, hint,
  notification, or sound state is stored per viewer. There is no SFX event because
  eligibility itself has no mutation.
- **Saves:** `requiredTechs` lives in static definitions. Existing saved queues use the
  established revalidation path: an entry made newly ineligible is removed with an
  explicit `no-longer-available` reason. No schema increment or migration is warranted.

## Player Truth Table

| State | City catalog result | Upgrade result | Visible explanation |
|---|---|---|---|
| All required techs complete | Actionable | Eligible if other gates pass | No prerequisite blocker |
| One of two techs complete | Locked, still browseable | Ineligible | `Requires A + B`; A done, B missing |
| Neither complete | Locked, still browseable | Ineligible | Both requirements missing |
| Legacy single-tech definition | Existing behavior | Existing behavior | One requirement fact |
| Old queued item after a definition adds a second gate | Removed with existing explicit reason | N/A | Existing `no-longer-available` save-compat path |

## Misleading UI Risks

- A partially complete conjunction must never be represented as `Available now`.
- A resource-locked item is not a tech-locked item; both blockers remain distinct.
- A focused locked section must not hide the complete production catalog behind a
  recommendation-only surface.
- The displayed city's owner determines city-production facts; the displayed
  civilization determines research facts. Neither surface may read another hot-seat
  player's completed-tech list.

## Interaction Replay Checklist

1. Open a city with one required technology complete; inspect the locked item.
2. Complete the second technology, rerender the same city panel, and see the item become
   actionable without reopening a different player’s panel.
3. Attempt an upgrade with one requirement missing; see every missing fact.
4. Switch `currentPlayer` in a two-human state and verify the same definition evaluates
   from the new viewer’s own technologies.

## Task 1: Define and test the pure prerequisite contract

**Files:**
- Modify: `src/core/types.ts`
- Create: `src/systems/production-prerequisites.ts`
- Test: `tests/systems/production-prerequisites.test.ts`

1. Write failing tests for legacy-only, conjunction complete, A-only, B-only, duplicate,
   empty, and unknown prerequisite IDs. Assert ordered output:

   ```ts
   expect(evaluateProductionPrerequisites(
     { techRequired: 'alpha', requiredTechs: ['beta'] },
     new Set(['alpha']),
   )).toEqual({ required: ['alpha', 'beta'], satisfied: ['alpha'], missing: ['beta'] });
   ```

2. Run `bash scripts/run-with-mise.sh yarn test --run tests/systems/production-prerequisites.test.ts`
   and confirm the test fails because the helper does not exist.
3. Add `requiredTechs?: string[]` to `Building` and `TrainableUnitEntry`. Implement a
   pure helper with `getRequiredTechIds(definition)` and
   `evaluateProductionPrerequisites(definition, completedTechs)`. Legacy `techRequired`
   is first, duplicates are removed, and result order is deterministic.
4. Rerun the focused test and commit the green contract.

## Task 2: Route production and upgrades through the helper

**Files:**
- Modify: `src/systems/city-system.ts`
- Modify: `src/systems/unit-upgrade-system.ts`
- Test: `tests/systems/city-system.test.ts`
- Test: `tests/systems/unit-upgrade.test.ts`

1. Write failing production tests for a synthetic two-tech unit/building that is absent
   with one prerequisite and eligible with both. Add an upgrade test whose returned
   `missing` facts contain the incomplete second technology.
2. Verify red with the two mirrored test files.
3. Replace local `techRequired` checks in `getTrainableUnitsForCiv`,
   `getAvailableBuildings`, and `evaluateUnitUpgrade` with the helper. Preserve
   obsolescence/resource/coastal/building/air-base checks and the existing old-save
   queue fallback.
4. Rerun both focused suites and commit.

## Task 3: Make AI and unlock metadata conjunction-aware

**Files:**
- Modify: `src/ai/ai-research.ts`
- Modify: `src/systems/tech-definitions.ts` or its existing consistency seam
- Modify: `tests/systems/tech-unlocks-consistency.test.ts`
- Test: `tests/ai/ai-research.test.ts`

1. Write red tests proving a partially completed gate supplies no production candidate
   and that research planning can value the remaining prerequisite without claiming the
   unit is already enabled.
2. Change unlock-consistency coverage so each declared prerequisite recognizes an item,
   while a full-catalog validator rejects empty, duplicate, unknown, or unreachable
   required IDs.
3. Keep tech `unlocksUnits`/`unlocksBuildings` as discoverability metadata; do not
   duplicate every conjunction into a second eligibility rule.
4. Rerun the focused AI and consistency suites and commit.

## Task 4: Render partial gates without hiding the catalog

**Files:**
- Modify: `src/ui/city-panel.ts`
- Modify: `src/ui/tech-panel.ts`
- Test: `tests/ui/city-panel.test.ts`
- Test: `tests/ui/tech-panel.test.ts`

1. Write red DOM tests for `Requires A + B`, individual done/missing states, and a
   two-human `currentPlayer` switch. Include a negative assertion that an A-only item
   is not labeled available.
2. Derive locked prerequisite presentation from the shared evaluator. Preserve the
   existing resource-locked presentation, and add a tested `Show all` path if the
   focused locked section truncates items.
3. Have tech-panel unlock copy use the same requirement facts so it never promises a
   conjunction after only one tech completes.
4. Rerun focused UI tests and commit.

## Task 5: Save, parity, and completion verification

**Files:**
- Modify: `tests/storage/save-migrations.test.ts` only if a current fixture proves the
  queue compatibility path; no schema version change.
- Test: `tests/systems/city-system.test.ts`, `tests/systems/unit-upgrade.test.ts`,
  `tests/ai/ai-production.test.ts`, `tests/ai/ai-research.test.ts`,
  `tests/ui/city-panel.test.ts`, `tests/ui/tech-panel.test.ts`,
  `tests/systems/tech-unlocks-consistency.test.ts`.

1. Add a regression showing an old queue item made ineligible by a newly added
   conjunction is removed through the existing explicit save-compatibility path.
2. Add Explorer/Standard/Veteran legality parity and two-human hot-seat coverage where
   the relevant harnesses exist; requirements must depend only on the acting civ’s
   completed technologies.
3. Run `scripts/check-src-rule-violations.sh` for every changed `src/` file, all
   mirrored focused tests in one command, `git diff --check`, and inspect both diff
   stats and full source diff.
4. Before delivery run `bash scripts/run-with-mise.sh yarn build` and
   `bash scripts/run-with-mise.sh yarn test`.
