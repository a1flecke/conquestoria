# Issue 441 Espionage Building Era Rebalance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the two counter-intelligence buildings to their intended eras and have AI cities respond to detected hostile spies.

**Architecture:** `Building` owns optional `defensiveEspionageAiValue`; `ai-production` reads it through a generic city-local detected-threat helper. Gates remain definition/backlink data. No save migration, difficulty branch, UI action, or SFX is introduced.

**Tech Stack:** TypeScript, Vitest, JSDOM.

---

## File map

- `src/core/types.ts` — `Building.defensiveEspionageAiValue`.
- `src/systems/city-system.ts` — gates, Security Bureau copy, metadata values.
- `src/systems/tech-definitions-eras1-4.ts`, `eras8.ts`, `eras10.ts` — gate backlinks.
- `src/ai/ai-production.ts` — generic threat score.
- `tests/systems/espionage-buildings.test.ts`, `tests/ai/ai-production.test.ts`, `tests/storage/save-manager.test.ts`, `tests/systems/city-system.test.ts`, `tests/ui/city-panel.test.ts` — regression coverage.

## Player Truth Table

| Before | Action | Immediate result |
|---|---|---|
| Owner lacks Political Intelligence | Open city production | Intelligence Agency is not actionable. |
| Owner researches Political Intelligence | Reopen city production | Intelligence Agency is actionable. |
| `currentPlayer` differs from city owner | Open city panel | Availability still follows city owner. |
| Legacy queue has Intelligence Agency | Load and process city | Queue remains, but new choices use the new gate. |

## Misleading UI Risks and Replay Checklist

- Another hot-seat player’s research must not unlock an item in the viewed city.
- A grandfathered queue must not make the building return to the fresh build list.
- Security Bureau must say `counter-intelligence (CI)` on first use.
- Test the list before/after the owner gains the gate, with a different `currentPlayer`, and after a legacy queued item completes.

### Task 1: Add rebalance data with tests first

**Files:**

- Modify: `src/core/types.ts`, `src/systems/city-system.ts`, `src/systems/tech-definitions-eras1-4.ts`, `src/systems/tech-definitions-eras8.ts`, `src/systems/tech-definitions-eras10.ts`
- Test: `tests/systems/espionage-buildings.test.ts`, `tests/systems/tech-unlocks-consistency.test.ts`

- [ ] **Step 1: Write the failing building tests**

Replace the old gates and assert metadata:

```ts
expect(BUILDINGS['intelligence-agency'].techRequired).toBe('political-intelligence');
expect(BUILDINGS['security-bureau'].techRequired).toBe('cold-war-networks');
expect(BUILDINGS['intelligence-agency'].defensiveEspionageAiValue).toBe(40);
expect(BUILDINGS['security-bureau'].defensiveEspionageAiValue).toBe(40);
```

Using a `foundCity` fixture, assert Intelligence Agency is unavailable with `espionage-informants` and available with `political-intelligence`; assert Security Bureau is unavailable with `counter-intelligence` and available with `cold-war-networks`. Retain +20/+30/fade tests and add the negative case that Security Bureau is +30 before Signals Intelligence.

- [ ] **Step 2: Confirm the tests fail**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/systems/espionage-buildings.test.ts`

Expected: FAIL because the existing gates and definitions are old.

- [ ] **Step 3: Implement typed, canonical data**

Add to `Building`:

```ts
/** AI priority granted only when this city has a live detected hostile-spy threat. */
defensiveEspionageAiValue?: number;
```

Set both definitions to `defensiveEspionageAiValue: 40`; set Intelligence Agency’s gate to `political-intelligence`; set Security Bureau’s gate to `cold-war-networks`; change its description to:

```ts
'Raises counter-intelligence (CI) by 30 each turn and makes captured spies 50% less likely to be turned. Bonus halves when Signals Intelligence is researched.'
```

Do not alter `applyBuildingCI`; Digital Surveillance and Signals Intelligence already implement the approved fades.

- [ ] **Step 4: Move bidirectional tech backlinks**

Remove `intelligence-agency` from `espionage-informants.unlocksBuildings` and `security-bureau` from `counter-intelligence.unlocksBuildings`. Add:

```ts
// political-intelligence in eras8.ts
unlocksBuildings: ['intelligence-agency'],
// cold-war-networks in eras10.ts
unlocksBuildings: ['security-bureau'],
```

Do not change the existing `unlocks` prose because it names neither building.

- [ ] **Step 5: Run and commit**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/systems/espionage-buildings.test.ts tests/systems/espionage-system.test.ts tests/systems/tech-unlocks-consistency.test.ts`

Expected: PASS.

Run: `git add src/core/types.ts src/systems/city-system.ts src/systems/tech-definitions-eras1-4.ts src/systems/tech-definitions-eras8.ts src/systems/tech-definitions-eras10.ts tests/systems/espionage-buildings.test.ts tests/systems/tech-unlocks-consistency.test.ts && git commit -m "fix(espionage): rebalance counter-intelligence building eras"`

### Task 2: Make AI respond only to live city-local threats

**Files:**

- Modify: `src/ai/ai-production.ts`
- Test: `tests/ai/ai-production.test.ts`

- [ ] **Step 1: Write failing candidate and choice tests**

With the existing `setupState` helper, give `ai-1` `cold-war-networks` and `writing`, and leave only `security-bureau` and `library` unbuilt. Add this threat:

```ts
state.espionage ??= {};
state.espionage['ai-1'] = {
  ...createEspionageCivState(),
  detectedThreats: {
    hostile: { cityId: 'city-a', foreignCivId: 'player', detectedTurn: state.turn, expiresOnTurn: state.turn + 5 },
  },
};
```

Assert Security Bureau has defensive score 40, outranks Library, and `applyAIProduction(state, 'ai-1', [], aggressive)` queues it. Repeat with no threats and with `expiresOnTurn: state.turn - 1`; assert defensive score 0 and Library is queued.

- [ ] **Step 2: Confirm the tests fail**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/ai/ai-production.test.ts`

Expected: FAIL because candidates currently do not read detected threats.

- [ ] **Step 3: Implement generic scoring**

Add `defensiveEspionageScore: number` to `AIProductionCandidate`, return `0` for unit candidates, and add this helper:

```ts
function defensiveEspionageScore(state: GameState, civId: string, cityId: string, buildingId: string): number {
  const value = BUILDINGS[buildingId]?.defensiveEspionageAiValue ?? 0;
  if (value <= 0) return 0;
  const threats = Object.values(state.espionage?.[civId]?.detectedThreats ?? {});
  return threats.some(threat => threat.cityId === cityId && threat.expiresOnTurn >= state.turn) ? value : 0;
}
```

In the building loop, calculate the score, add it to the existing candidate formula, and return it as `defensiveEspionageScore`. Do not use CI alone or opponent challenge as a trigger.

- [ ] **Step 4: Run and commit**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/ai/ai-production.test.ts`

Expected: PASS for live, absent, and expired threats.

Run: `git add src/ai/ai-production.ts tests/ai/ai-production.test.ts && git commit -m "fix(ai): prioritize espionage defense after spy detection"`

### Task 3: Lock in legacy queues and hot-seat UI

**Files:**

- Test: `tests/storage/save-manager.test.ts`, `tests/systems/city-system.test.ts`, `tests/ui/city-panel.test.ts`

- [ ] **Step 1: Write queue/load regressions**

Normalize a cloned old state with only `espionage-informants` and `productionQueue: ['intelligence-agency']`; assert the queue remains. Process the same queue with sufficient production; assert `completedBuilding === 'intelligence-agency'` and no dropped item. This defines grandfathering without a migration.

- [ ] **Step 2: Write a hot-seat panel regression**

Create a second human civ, set the fixture city owner to it, give only the owner `political-intelligence`, and set `state.currentPlayer` to the first human. Assert `[data-item-id="intelligence-agency"]` exists. Remove the owner’s tech while granting it to `currentPlayer`; recreate the panel and assert it is absent. Assert Security Bureau text includes `counter-intelligence (CI)`.

- [ ] **Step 3: Run and commit**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/storage/save-manager.test.ts tests/systems/city-system.test.ts tests/ui/city-panel.test.ts`

Expected: PASS; do not add a migration, queue-tech dequeue, special hot-seat path, UI action, or sound.

Run: `git add tests/storage/save-manager.test.ts tests/systems/city-system.test.ts tests/ui/city-panel.test.ts && git commit -m "test(espionage): cover rebalance saves and hot-seat UI"`

### Task 4: Verify the completed change

**Files:** Verify all files changed by Tasks 1–3.

- [ ] **Step 1: Run source checks and focused tests**

Run: `scripts/check-src-rule-violations.sh src/core/types.ts src/systems/city-system.ts src/systems/tech-definitions-eras1-4.ts src/systems/tech-definitions-eras8.ts src/systems/tech-definitions-eras10.ts src/ai/ai-production.ts`

Expected: exit 0.

Run: `bash scripts/run-with-mise.sh yarn test --run tests/systems/espionage-buildings.test.ts tests/systems/espionage-system.test.ts tests/systems/tech-unlocks-consistency.test.ts tests/ai/ai-production.test.ts tests/storage/save-manager.test.ts tests/systems/city-system.test.ts tests/ui/city-panel.test.ts`

Expected: PASS.

- [ ] **Step 2: Run build and full suite**

Run: `bash scripts/run-with-mise.sh yarn build`

Expected: exit 0.

Run: `bash scripts/run-with-mise.sh yarn test`

Expected: exit 0.

- [ ] **Step 3: Inspect both deltas**

Run: `git diff --check origin/main...HEAD && git diff --stat origin/main...HEAD && git diff origin/main...HEAD && git diff --stat && git diff`

Expected: committed delta contains only the approved spec, rebalance, generic AI response, and regressions; uncommitted delta is empty.

## Plan self-review

- Spec coverage: Tasks 1–3 cover gates, CI, AI, UI, saves, solo, and hot-seat; Task 4 covers integration.
- Placeholder scan: every task has exact paths, names, tests, commands, and expected outcomes.
- Type consistency: `defensiveEspionageAiValue` and `defensiveEspionageScore` are used consistently.
