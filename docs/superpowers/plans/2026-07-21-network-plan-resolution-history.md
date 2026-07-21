# NetworkPlan Resolution History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record legendary-wonder NetworkPlan quest progress from explicit owner-turn resolution facts.

**Architecture:** Add a typed resolution result to `network-plan-system`, call it before a civilization's city effects resolve, and pass its facts into a pure history append helper. Keep quest evaluation definition-driven and retain serializable history records.

**Tech Stack:** TypeScript, Vitest.

---

### Task 1: Establish canonical resolution facts

**Files:**
- Modify: `src/systems/network-plan-system.ts`
- Modify: `tests/systems/network-plan-system.test.ts`

- [x] **Step 1: Write failing resolver tests**

Add tests for an active `research-mesh` resolving once, a `survey-grid` resolving once with its source city preserved, and negative cases for `surgeResolutionTurn === state.turn` and active recovery.

- [x] **Step 2: Run the focused tests**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/systems/network-plan-system.test.ts`

Expected: failure because no owner-turn resolution API exists.

- [x] **Step 3: Implement the minimal typed resolver**

Export `resolveStableNetworkPlansForOwnerTurn(state, civId)`. It must call existing invalid-plan cleanup, return its resulting immutable state plus one sorted fact per eligible active plan, and exclude Surge/recovery facts.

- [x] **Step 4: Re-run the focused tests**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/systems/network-plan-system.test.ts`

Expected: pass.

### Task 2: Append supplied facts and wire the turn lifecycle

**Files:**
- Modify: `src/core/types.ts`
- Modify: `src/systems/legendary-wonder-history.ts`
- Modify: `src/core/turn-manager.ts`
- Modify: `tests/systems/legendary-wonder-history.test.ts`

- [x] **Step 1: Write failing history tests**

Replace the active-plan scan test with a supplied-resolution test that checks idempotency and host city preservation. Add a negative test proving an empty supplied list does not infer an active plan.

- [x] **Step 2: Run the focused history test**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/systems/legendary-wonder-history.test.ts`

Expected: failure because the existing helper scans active plans.

- [x] **Step 3: Implement typed history append and turn-manager wiring**

Define a reusable serializable record type in `src/core/types.ts`. Change the history helper to append only its supplied facts and deduplicate by owner, plan, and turn. Call the owner-turn resolver after surge state advances and before city yield processing; append its returned facts in that same turn flow.

- [x] **Step 4: Re-run focused system tests and rule checks**

Run:

```bash
scripts/check-src-rule-violations.sh src/systems/network-plan-system.ts src/systems/legendary-wonder-history.ts src/core/turn-manager.ts src/core/types.ts
bash scripts/run-with-mise.sh yarn test --run tests/systems/network-plan-system.test.ts tests/systems/legendary-wonder-history.test.ts
```

Expected: exit 0.

### Task 3: Validate and publish the stacked MR

**Files:**
- Modify: none

- [ ] **Step 1: Run full verification**

Run: `bash scripts/verify-before-push.sh --fast` and `bash scripts/run-with-mise.sh yarn build`.

- [ ] **Step 2: Inspect and commit**

Run: `git diff --check`, inspect `git diff origin/codex/issue-516-era13-launch-hardening...HEAD`, then commit the implementation, mirrored tests, and these design documents.

- [ ] **Step 3: Push and create a draft PR targeting #661's branch**

Run: `git push -u origin codex/network-plan-history-mr`, then create a draft PR with base `codex/issue-516-era13-launch-hardening`.
