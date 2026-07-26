# Issue #668 Unit Role Legibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show canonical unit roles, counters, vulnerabilities, prerequisites, and upgrade direction on each live unit decision surface.

**Architecture:** A pure presentation module converts canonical role and prerequisite data into ordered, viewer-neutral display facts. City production, selected-unit information, and the tech inspector render that model without changing eligibility, combat, AI, saves, audio, or notifications.

**Tech Stack:** TypeScript, Vitest, DOM rendering tests.

---

## Inline review resolution

- No gameplay value, unit definition, AI behavior, difficulty rule, save shape, audio event,
  or notification changes are allowed in this MR.
- The live app lacks a unit Codex. Do not create an unlaunched module; cover the three
  player-reachable surfaces specified by Task 4 and declare a future unit Codex out of scope.
- All labels must be icon plus text; role summaries remain 18 words or fewer by the existing
  catalog validator; all catalog entries remain reachable.
- `run-with-mise.sh` special install/setup paths must exit after their delegated command;
  the linked-worktree smoke test must reject a fall-through `install --immutable` call.
- Long-running verification must retain and poll one terminal session through its final exit
  code and summary; an incomplete response blocks completion and never justifies a retry.

### Task 1: Canonical unit-role presentation model

**Files:**
- Create: `src/ui/unit-role-presentation.ts`
- Create: `tests/ui/unit-role-presentation.test.ts`
- Modify: `src/ui/selected-unit-info.ts`

- [ ] **Step 1: Write failing presentation tests**

```ts
expect(getUnitRolePresentation('pikeman', ['fortification'])).toMatchObject({
  summary: 'Polearm defender that stops charging mounted attackers.',
  counters: [{ icon: '🎯', text: 'Strong against shock units' }],
  vulnerabilities: [{ icon: '⚠️', text: 'Vulnerable to ranged units' }],
});
expect(getUnitRolePresentation('artillery', ['mass-firepower'])?.upgrade.text)
  .toContain('Current siege apex');
```

- [ ] **Step 2: Run the focused test and verify it fails because the module is absent**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/ui/unit-role-presentation.test.ts`

- [ ] **Step 3: Implement the pure model**

```ts
export interface UnitRolePresentation {
  summary: string;
  roleText: string;
  counters: readonly IconTextFact[];
  vulnerabilities: readonly IconTextFact[];
  upgrade: IconTextFact;
  requirements: readonly IconTextFact[];
}

export function getUnitRolePresentation(
  type: UnitType,
  completedTechs: readonly string[] = [],
): UnitRolePresentation | undefined
```

Use `getUnitRoleDefinition`, `TRAINABLE_UNITS`, `evaluateProductionPrerequisites`, and
`TECH_TREE`; convert only typed role keys to label text in one local map. For a terminal
unit render its explicit `terminalReason`; for a missing conjunction render each required
technology with `Complete` or `Missing` text.

- [ ] **Step 4: Run the focused test and verify it passes**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/ui/unit-role-presentation.test.ts`

### Task 2: Render live selected-unit information

**Files:**
- Modify: `src/ui/selected-unit-info.ts`
- Modify: `tests/ui/selected-unit-info.test.ts`

- [ ] **Step 1: Write failing rendered-DOM tests**

```ts
renderSelectedUnitInfo(container, state, 'pikeman', {});
expect(collectAllText(container).join(' ')).toContain('Strong against shock units');
expect(collectAllText(container).join(' ')).toContain('Vulnerable to ranged units');
expect(findDetails(container)?.textContent).toContain('Role details');
```

Add a terminal-artillery test proving it renders the terminal explanation and does not
invent a successor.

- [ ] **Step 2: Run the selected-unit test and verify the new assertions fail**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/ui/selected-unit-info.test.ts`

- [ ] **Step 3: Render the shared model**

Append a static summary line and a native `details` element after the existing description.
Populate every dynamic label with `textContent`; give disclosure summary `Role details`;
render counter, vulnerability, upgrade, and requirement rows as icon-plus-text divs.

- [ ] **Step 4: Run the selected-unit test and verify it passes**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/ui/selected-unit-info.test.ts`

### Task 3: Render the city production catalog without filtering it

**Files:**
- Modify: `src/ui/city-panel.ts`
- Modify: `tests/ui/city-panel.test.ts`

- [ ] **Step 1: Write failing catalog tests**

```ts
expect(collectText(panel)).toContain('Polearm defender that stops charging mounted attackers.');
expect(panel.querySelectorAll('[data-unit-role-summary]').length)
  .toBe(getTrainableUnitsForCity(/* matching city context */).length);
```

Add a partial-prerequisite state asserting the remaining technology is named and the unit
is not in the legal trainable section.

- [ ] **Step 2: Run the city-panel test and verify the new assertions fail**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/ui/city-panel.test.ts`

- [ ] **Step 3: Add role placeholders to every legal unit card**

For every `availableUnits` entry, derive the shared presentation with the active
civilization's completed technologies. Add a `data-unit-role-summary` placeholder and
populate it through the existing safe `setText` path. Do not alter `availableUnits`, its
sort order, build-item click handler, queue behavior, or locked-item visibility.

- [ ] **Step 4: Run the city-panel test and verify it passes**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/ui/city-panel.test.ts`

### Task 4: Render role facts and conjunctions in the tech inspector

**Files:**
- Modify: `src/ui/tech-panel.ts`
- Modify: `tests/ui/tech-panel.test.ts`

- [ ] **Step 1: Write failing inspector tests**

```ts
expect(panel.textContent).toContain('Strong against shock units');
expect(panel.textContent).toContain('Bronze Working · Missing');
```

Add a hot-seat regression that renders the same inspected tech after changing
`state.currentPlayer` and asserts only the new player’s completed-tech markers appear.

- [ ] **Step 2: Run the tech-panel test and verify the new assertions fail**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/ui/tech-panel.test.ts`

- [ ] **Step 3: Render shared presentation for each unlocked unit**

In `renderInspector`, replace plain unit-only unlock strings with child rows that retain
the existing unlock copy and append role summary plus a native details disclosure. Use the
current player's completed technology IDs plus the inspected technology, because the
details describe the unit after that unlock is researched. Do not change research queue
eligibility or controls.

- [ ] **Step 4: Run the tech-panel test and verify it passes**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/ui/tech-panel.test.ts`

### Task 5: Cross-surface regression and source-rule verification

**Files:**
- Verify: `src/ui/unit-role-presentation.ts`, `src/ui/selected-unit-info.ts`, `src/ui/city-panel.ts`, `src/ui/tech-panel.ts`
- Verify: `tests/ui/unit-role-presentation.test.ts`, `tests/ui/selected-unit-info.test.ts`, `tests/ui/city-panel.test.ts`, `tests/ui/tech-panel.test.ts`

- [ ] **Step 1: Run all focused tests together**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/ui/unit-role-presentation.test.ts tests/ui/selected-unit-info.test.ts tests/ui/city-panel.test.ts tests/ui/tech-panel.test.ts tests/systems/combat-role-definitions.test.ts`

- [ ] **Step 2: Check source rules**

Run: `scripts/check-src-rule-violations.sh src/ui/unit-role-presentation.ts src/ui/selected-unit-info.ts src/ui/city-panel.ts src/ui/tech-panel.ts`

- [ ] **Step 3: Inspect MR scope**

Run: `git diff --check && git diff --stat origin/main...HEAD && git diff --stat`

## Player Truth Table

| Before | Action | Immediate visible result |
|---|---|---|
| Legal unit card | Open city Build tab | Role summary appears; every legal card remains reachable. |
| Selected friendly unit | Open info panel | Role details, counters, vulnerabilities, and successor/terminal reason appear. |
| Tech unlock has an unmet conjunction | Inspect tech | Missing technology is stated; no false “available” claim appears. |
| Hot-seat handoff | Reopen player panel | Completed/missing requirement markers reflect only `currentPlayer`. |

## Misleading UI Risks

- Never infer a terminal successor.
- Never mark a partial conjunction as available.
- Never show icon-only role or counter information.
- Never use roles to filter or rank the legal production catalog.

## Interaction Replay Checklist

- Build catalog open → queue item → rerender retains catalog and summary.
- Selected unit open → upgrade → rerender presents the target unit facts.
- Tech inspector open → queue research → panel reopens with updated facts.
- Switch `currentPlayer` → reopen each surface → requirements recompute without stale markers.
