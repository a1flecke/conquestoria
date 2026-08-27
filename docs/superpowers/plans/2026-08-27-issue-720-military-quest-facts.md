# Issue 720 Military Quest Facts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Repository subagent approval rules still apply.

**Goal:** Add generic, typed, viewer-safe military quest facts that future legendary wonders can evaluate without ID-specific core logic.

**Architecture:** Keep transition history in `legendaryWonderHistory.militaryFacts`, with recording owned by the mutation that creates the outcome. Keep simultaneous unit fielding as a bounded owner-roster query because it is present state rather than history. Extend quest metadata and evaluation generically; later wonder definitions will only declare requirements.

**Tech Stack:** TypeScript, Vitest, existing legendary-wonder history/system, combat settlement, improvement turns, air operations, save migrations.

---

## Reviewed implementation constraints

- **Gameplay and fun:** facts only unlock future quest decisions; they do not alter damage, healing, pacing, rewards, or difficulty. A player’s actions remain understandable because future quest progress comes from exact, definition-provided text rather than hidden counters.
- **Player ages and play styles:** no timed input, audio-only cue, color-only status, or irreversible action is added. Aggressive, defensive, builder, air, and mixed play earn only the facts their actual actions produce.
- **AI and difficulty:** all owners use the same settlement recorder; no AI reads rival facts and Explorer/Standard/Veteran receive identical legality/counts.
- **UX and hot seat:** existing owner-scoped quest cards render descriptions/completion from generic projects. No rival progress, unit identity, position, or interception detail crosses handoff.
- **Architecture/extensibility:** facts are a small discriminated union, not analytics. Definition step kinds state what to count; mutation systems never branch on wonder IDs.
- **Data and saves:** stable serializable IDs, idempotent recorders, no reconstruction, next schema migration selected only after rebase, and malformed/current/legacy coverage.
- **SFX/visuals:** none. #720 must not add or imply a visual/audio event, so deferred #725/#726 remain untouched.
- **Regression safety:** settlement-time tests cover human/AI parity, Last Stand/capture counterexamples, crisis actors, and duplicate resolution; migration tests cover load behavior.

## Task 1: Define military facts and generic quest steps

**Files:**
- Modify: `src/core/types.ts`
- Test: `tests/systems/legendary-wonder-history.test.ts`
- Test: `tests/systems/legendary-wonder-system.test.ts`

- [ ] **Step 1: Write failing type-level/system tests for the five generic requirement families.**

```ts
expect(getCurrentCombatRoleFielding(state, 'player')).toEqual({ frontline: 2, ranged: 1 });
expect(countMilitaryQuestFacts(state, 'player', { kind: 'surviving-combat-win' })).toBe(1);
```

- [ ] **Step 2: Run the focused history/system tests and verify they fail because the query/types do not exist.**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/systems/legendary-wonder-history.test.ts tests/systems/legendary-wonder-system.test.ts`

Expected: failing imports/assertions for the new military fact/query contract.

- [ ] **Step 3: Add `LegendaryWonderMilitaryFact` and quest-step union members.**

```ts
export type LegendaryWonderMilitaryFact =
  | { id: string; kind: 'surviving-combat-win'; civId: string; unitId: string; role: CombatRole; turn: number }
  | { id: string; kind: 'fort-completed'; civId: string; cityId: string; position: HexCoord; turn: number }
  | { id: string; kind: 'fortification-repel'; civId: string; unitId: string; tier: 'fort' | 'citadel'; turn: number }
  | { id: string; kind: 'successful-interception'; civId: string; interceptorId: string; turn: number };
```

Add matching definition-driven quest variants that carry target counts and typed filters. Do not add any wonder ID to these types.

- [ ] **Step 4: Run the focused tests and confirm the typed contract compiles.**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/systems/legendary-wonder-history.test.ts tests/systems/legendary-wonder-system.test.ts`

Expected: the new contract tests pass once recording/evaluation tasks land; no existing quest-step behavior changes.

## Task 2: Add normalized history helpers and generic evaluation

**Files:**
- Modify: `src/systems/legendary-wonder-history.ts`
- Modify: `src/systems/legendary-wonder-system.ts`
- Test: `tests/systems/legendary-wonder-history.test.ts`
- Test: `tests/systems/legendary-wonder-system.test.ts`

- [ ] **Step 1: Write failing regressions for duplicate IDs, current role fielding, distinct Fort cities, and owner isolation.**

```ts
expect(recordMilitaryQuestFacts(state, [fact, fact])).toEqual(recordMilitaryQuestFacts(state, [fact]));
expect(evaluateProjectStep(state, project, 'three-roles')).toBe(true);
expect(evaluateProjectStep({ ...state, currentPlayer: 'rival' }, project, 'three-roles')).toBe(true);
```

- [ ] **Step 2: Implement immutable append/query helpers.**

```ts
export function appendLegendaryWonderMilitaryFacts(
  state: GameState,
  additions: readonly LegendaryWonderMilitaryFact[],
): GameState;

export function getCurrentCombatRoleFielding(
  state: GameState,
  civId: string,
): ReadonlyMap<CombatRole, number>;
```

Filter fielding to the owner’s extant, untransported, strength-positive units with a typed role. Evaluate history only for `project.ownerId`; use a set of `cityId` values for distinct-territory Fort requirements.

- [ ] **Step 3: Extend description/progress formatting with exact visible counters.**

Implement `getMilitaryQuestProgress` so descriptions such as `Field 4 combat units across 3 roles. (2 roles, 3/4 units)` and `Win 3 battles while your unit survives. (1/3)` are derived from the same evaluator inputs.

- [ ] **Step 4: Run focused history/system/panel tests.**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/systems/legendary-wonder-history.test.ts tests/systems/legendary-wonder-system.test.ts tests/ui/wonder-panel.test.ts`

Expected: exact owner progress renders; rivals continue to receive only existing sanitized intel.

## Task 3: Record settled combat wins and Fort/Citadel repels

**Files:**
- Modify: `src/systems/combat-reward-system.ts`
- Test: `tests/systems/combat-reward-system.test.ts`
- Test: `tests/ai/ai-major-turn.test.ts`

- [ ] **Step 1: Write failing post-settlement tests.**

```ts
expect(applied.state.legendaryWonderHistory?.militaryFacts).toContainEqual(
  expect.objectContaining({ kind: 'surviving-combat-win', civId: 'player' }),
);
expect(lastStandApplied.state.legendaryWonderHistory?.militaryFacts ?? []).not.toContainEqual(
  expect.objectContaining({ kind: 'surviving-combat-win', unitId: defeatedUnit.id }),
);
```

Include a defender victory on an owned completed Fort and a Citadel-tier victory; negative cases cover enemy/pillaged/incomplete Forts, transported/civilian units, capture, and a saved loser.

- [ ] **Step 2: Record facts after the outcome is fully settled.**

Use original combatants for identity and final `units`/defeat flags for truth. Append at most one win and one repel per settled combat ID. A repel requires an actually defeated attacker, surviving defending combat unit, completed owned `fort`, and tier derived from the defender owner’s completed technology.

- [ ] **Step 3: Prove human and non-human paths use the same recorder.**

Run player-action controller and AI major-turn focused cases; do not add caller hooks because both already call `applyCombatOutcomeToState`.

- [ ] **Step 4: Run focused combat tests.**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/systems/combat-reward-system.test.ts tests/ai/ai-major-turn.test.ts tests/systems/legendary-wonder-history.test.ts`

Expected: player and AI facts are equal for equivalent outcomes; previews produce no facts.

## Task 4: Record completed Forts and successful interceptions

**Files:**
- Modify: `src/systems/improvement-turn-system.ts`
- Modify: `src/systems/air-operations-system.ts`
- Test: `tests/systems/improvement-turn-system.test.ts`
- Test: `tests/systems/air-operations-system.test.ts`

- [ ] **Step 1: Write failing transition tests.**

```ts
expect(completed.legendaryWonderHistory?.militaryFacts).toContainEqual(
  expect.objectContaining({ kind: 'fort-completed', cityId: 'city-a' }),
);
expect(airResult.state.legendaryWonderHistory?.militaryFacts).toContainEqual(
  expect.objectContaining({ kind: 'successful-interception', interceptorId: fighter.id }),
);
```

Test distinct city territories, one-time completion, non-Fort improvements, interceptor survival, striker survival, and repeated attempts.

- [ ] **Step 2: Add transition-owned Fort recording.**

At `improvementTurnsLeft` reaching zero, require `improvement === 'fort'`, resolve the owning city from the completed tile’s territory, and append one fact. Never infer historical completion from tiles on later turns.

- [ ] **Step 3: Add settlement-owned interception recording.**

In the already selected interceptor branch of `resolveAirStrike`, append only after combat settlement confirms the interceptor remains and the striker does not. Do not alter AA coverage, aircraft visibility, airbase state, or strategic systems.

- [ ] **Step 4: Run focused improvement/air tests.**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/systems/improvement-turn-system.test.ts tests/systems/air-operations-system.test.ts tests/systems/air-defense-system.test.ts`

Expected: one fact per actual transition; no hidden-provider or overlay behavior changes.

## Task 5: Normalize saves and complete verification

**Files:**
- Modify: `src/storage/save-migrations.ts`
- Test: `tests/storage/save-migrations.test.ts`
- Test: `tests/storage/save-persistence.test.ts`
- Modify: `docs/superpowers/plans/2026-07-24-issue-547-wonders-and-final-audit.md`

- [ ] **Step 1: Write failing schema-0, prior-schema, malformed, duplicate, and round-trip tests.**

```ts
expect(migrateSaveToCurrent(malformed).legendaryWonderHistory?.militaryFacts).toEqual([]);
expect(migrateSaveToCurrent(current)).toEqual(migrateSaveToCurrent(migrateSaveToCurrent(current)));
```

- [ ] **Step 2: Add the next available migration and unconditional normalization.**

Select the next schema only after the final pre-edit fetch. Preserve valid facts, remove malformed/duplicate entries, initialize omitted arrays, and avoid any world-state reconstruction.

- [ ] **Step 3: Update the parent #547 plan status in this PR.**

Mark Task 56 complete only when the implementation and verification are complete; do not mark Tasks 57–63 started.

- [ ] **Step 4: Run source, focused, wonder, build, and durable checks.**

Run:

```bash
scripts/check-src-rule-violations.sh src/core/types.ts src/systems/legendary-wonder-history.ts src/systems/legendary-wonder-system.ts src/systems/combat-reward-system.ts src/systems/improvement-turn-system.ts src/systems/air-operations-system.ts src/storage/save-migrations.ts
git diff --check
bash scripts/run-with-mise.sh yarn build
bash scripts/run-with-mise.sh yarn test:durable
bash scripts/run-with-mise.sh yarn test:durable:status
./scripts/run-wonder-regressions.sh
```

Expected: all commands exit zero, durable evidence belongs to the current worktree and HEAD, and no visual/audio files change.

## UI truth and replay review

| Before | State transition | Immediate owner-visible result |
| --- | --- | --- |
| Quest card has a pending military step | A qualifying fact records or roster changes | Existing card rerender presents the same step with updated exact progress on next state render |
| Rival card is visible through earned intel | Any fact records | No fact count, role, location, unit, or interception detail is shown |
| Hot-seat handoff occurs | A prior player earned a fact | New current player sees only their own project/state |

Misleading UI risks: never label lifetime role history as a current simultaneous roster; do not call a saved/captured loser a victory; do not label an incomplete, enemy, or pillaged Fort as a repel; do not call a surviving striker an interception success.

Replay coverage: initialize questing project, qualify one condition, re-render, repeat the same transition, switch current player, save/load, re-render. No new buttons, queues, overlays, audio, or animation are introduced.

## Plan self-review

All five issue requirement families map to Tasks 1–4. Actor completeness is handled at canonical settlement/mutation sources, persistence at Task 5, and visible owner progress at Task 2. The plan intentionally excludes tactical rewards, actual wonder definitions, assets, audio, strategic deterrence, and final audit work.
