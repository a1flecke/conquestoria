# #694 Integration Review Repair Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task.

**Goal:** Repair the two reproducible integration defects from the approved #694 review: AI production undervalues typed building air defense, and the city panel omits local building gates while another conjunctive requirement is still unmet.

**Architecture:** Keep both repairs generic and definition-driven. AI production will derive a per-city defensive score from `building.airDefenseProvider` and the AI's own visible hostile strike aircraft; it must never special-case `sam_site` or inspect hidden opponents. The city panel will use each building's same typed `requiredBuildings` and resource requirements in every locked-catalog path, rather than treating the partial-technology branch as a reduced model.

**Tech Stack:** TypeScript, Vitest, existing AI perception/visibility helpers, DOM city-panel tests.

## Player Truth Table

| Before | Action | Immediate visible result |
|---|---|---|
| SAM Site lacks Rocketry, Anti-Air Battery, and Radar Station | Open Production, then `Show more` | The locked SAM Site remains reachable and states the completed and missing technology plus both missing local buildings. |
| SAM Site meets all gates | Click SAM Site | The panel rerenders with `Producing: SAM Site`; this existing behavior remains covered. |
| AI has no owner-visible hostile strike aircraft | AI evaluates production | An air-defense building receives no threat bonus and remains an ordinary zero-yield candidate. |
| AI sees a hostile strike aircraft that can reach its city | AI evaluates production | Any eligible typed air-defense building earns a bounded local defensive score; the score makes a defender a rational choice without changing legality. |

## Misleading UI Risks

- A partially met technology gate must not imply that only technology is still required. The locked card must combine every unmet local building and resource gate using the city owner's state.
- `Show more` remains the complete explanatory fallback: locked content never becomes actionable until *all* gates pass, and its button remains absent.
- The city panel must not read the previous hot-seat player's technology or buildings. Existing owner-isolation coverage stays in the focused run.

## Interaction Replay Checklist

1. Open a city whose SAM Site has one completed technology but no local prerequisites; activate `Show more` and inspect the ordered requirement text.
2. Confirm its production button is absent, so an explanatory catalog entry cannot enqueue invalid work.
3. Open a fully eligible city, queue SAM Site, and confirm the still-open panel immediately shows the active production item (existing regression).
4. Run the same locked-catalog scenario for the active hot-seat owner, retaining the existing privacy assertion.

## Queue And ETA Checklist

- The active item remains visible as `Producing: SAM Site` after the build action, and queued items continue to use the existing order/ETA rendering.
- This repair does not change queue ordering or ETA calculation.
- The canonical city-system queue validation continues to remove a future queued building if a required local predecessor is absent; the UI change only makes the same truth comprehensible before queueing.

### Task 1: Add red tests for threat-aware generic AI building defense

**Files:**
- Modify: `tests/ai/ai-production.test.ts`
- Modify: `src/ai/ai-production.ts`

- [ ] **Step 1: Write the failing AI production regression**

Extend the #694 fixture so an AI-owned city can build SAM Site, then add an owner-visible hostile strike aircraft inside that aircraft's operational range of the city. Assert that the SAM candidate receives a positive air-defense score and outranks its no-threat score. Repeat with the aircraft hidden by fog and assert the bonus is zero. Keep the existing Explorer, Standard, and Veteran legality parameterization unchanged: difficulty must not reveal hidden units or alter eligibility.

- [ ] **Step 2: Run the focused test and confirm red**

Run:

```bash
bash scripts/run-with-mise.sh yarn test --run tests/ai/ai-production.test.ts
```

Expected: FAIL because building candidates currently have no air-defense threat score.

- [ ] **Step 3: Implement the generic score at the AI production owner**

In `src/ai/ai-production.ts`, add a focused helper that:

1. Returns zero unless the candidate has `airDefenseProvider` metadata.
2. Considers only strike-capable, AI-hostile aircraft at tiles visible to the acting civilization.
3. Counts a threat only when its `airOperation.operationalRange` reaches the evaluated city, using the canonical wrapped-map distance helper.
4. Returns a bounded score based on the provider's typed defense modifier; no building ID, foreign-city state, or challenge-specific rule enters the calculation.

Expose the result on `AIProductionCandidate` as a named diagnostic field, include it in the building score, and retain stable candidate ordering. Reuse the established AI hostility and visibility contracts rather than reading an opponent's raw intent or fogged units.

- [ ] **Step 4: Run focused AI regression green**

Run the same command from Step 2.

Expected: PASS; visible local strike pressure raises the typed defensive candidate score, while fogged pressure does not.

### Task 2: Add red UI regression for complete conjunctive locked guidance

**Files:**
- Modify: `tests/ui/city-panel.test.ts`
- Modify: `src/ui/city-panel.ts`

- [ ] **Step 1: Write the failing city-panel assertion**

Modify the existing partial-Rocketry SAM Site test to leave the local prerequisites absent as well. After `Show more`, assert one plain `Requires:` line includes the completed Radar Systems marker, missing Rocketry, Anti-Air Battery, and Radar Station in canonical requirement order. Assert SAM Site is still non-actionable and no resource-finder affordance is created.

- [ ] **Step 2: Run the focused UI test and confirm red**

Run:

```bash
bash scripts/run-with-mise.sh yarn test --run tests/ui/city-panel.test.ts
```

Expected: FAIL because the partial-technology catalog branch currently supplies an empty `requiredBuildings` list.

- [ ] **Step 3: Use full local requirement data in the partial-tech branch**

In `src/ui/city-panel.ts`, populate the partial-technology locked-building view model with missing local `requiredBuildings` and resources using the same owner-scoped city and resource data as the fully locked branch. Do not duplicate labels or add a SAM-specific rendering path. Preserve the existing tech-first, then building, then resource wording and the current `Show more` reachability behavior.

- [ ] **Step 4: Run focused UI regression green**

Run the same command from Step 2.

Expected: PASS, including existing post-queue refresh and hot-seat owner isolation cases.

### Task 3: Verify the repair slice

**Files:**
- Verify: `src/ai/ai-production.ts`
- Verify: `src/ui/city-panel.ts`
- Verify: `tests/ai/ai-production.test.ts`
- Verify: `tests/ui/city-panel.test.ts`

- [ ] **Step 1: Run source-rule and focused regressions**

Run:

```bash
scripts/check-src-rule-violations.sh src/ai/ai-production.ts src/ui/city-panel.ts
bash scripts/run-with-mise.sh yarn test --run tests/ai/ai-production.test.ts tests/ui/city-panel.test.ts
```

Expected: no rule violations and all focused tests pass.

- [ ] **Step 2: Run complete verification**

Run separately:

```bash
bash scripts/run-with-mise.sh yarn build
bash scripts/run-with-mise.sh yarn test:durable
bash scripts/run-with-mise.sh yarn test:durable:status
```

Expected: TypeScript build and durable suite pass for the exact working tree.

- [ ] **Step 3: Review every branch delta before handoff**

Run:

```bash
git diff --check origin/main...HEAD
git diff --stat origin/main...HEAD
git diff --stat
git diff origin/main...HEAD
git status --short --branch
```

Expected: the branch contains only the approved #694 delivery and these two generic repairs; no Radar operational-state work, bespoke SAM audio, save schema change, or combat/UI ID switch.

- [ ] **Step 4: Commit the repair**

Run:

```bash
git add src/ai/ai-production.ts src/ui/city-panel.ts tests/ai/ai-production.test.ts tests/ui/city-panel.test.ts
git commit -m "fix(694): complete SAM Site integration"
```

Expected: one focused repair commit after all verification passes.

