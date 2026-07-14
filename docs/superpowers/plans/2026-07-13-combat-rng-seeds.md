# Combat RNG Seeds Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every combat encounter a unique, reproducible seed derived from the game identity, turn, attacker, and defender.

**Architecture:** Add one pure FNV-1a seed helper next to `resolveCombat`, then replace every production combat-resolution and AI-simulation seed formula with it. The helper is independent of difficulty and active viewer, so a hot-seat handoff cannot alter an encounter's result. Existing combat events, presentation, SFX, and save data remain unchanged.

**Tech Stack:** TypeScript, Vitest, Vite, seeded deterministic RNG.

> **Repository constraint:** Do not dispatch subagents. Execute this plan inline in the existing `codex/issue-521` worktree.

---

## File map

| File | Responsibility |
|---|---|
| `src/systems/combat-system.ts` | Exports the canonical deterministic seed helper with combat resolution. |
| `src/main.ts` | Uses the helper for player-initiated combat. |
| `src/core/turn-manager.ts` | Uses the helper for barbarian and beast combat. |
| `src/ai/ai-major-turn.ts` | Removes its duplicate helper and uses the canonical helper for major-AI execution. |
| `src/ai/ai-tactics.ts` | Uses the same canonical pair seed for AI attack previews and predicted combat. |
| `src/ai/basic-ai.ts` | Uses the helper for AI warship-vs-pirate combat. |
| `src/systems/pirate-system.ts` | Uses the helper for pirate-vs-major-civilization combat. |
| `src/systems/minor-civ-system.ts` | Uses the helper for purposeful minor-civilization attacks and scuffles. |
| `tests/systems/combat-system.test.ts` | Proves helper determinism, pair distinction, legacy fallback, and hot-seat invariance. |
| `tests/core/turn-manager.test.ts` | Updates the barbarian combat expectation to the canonical seed. |
| `tests/ai/ai-major-turn.test.ts` and `tests/ai/ai-tactics.test.ts` | Prove AI prediction and execution share the canonical seed. |
| `tests/main.integration.test.ts` | Proves the live player combat path derives the canonical seed. |
| `tests/storage/save-manager.test.ts` | Proves normalized legacy saves retain a stable combat seed. |

### Task 0: Synchronize the implementation base

**Files:**
- Verify: the current `codex/issue-521` worktree and `origin/main`

- [ ] **Step 1: Fetch and rebase before touching source**

```bash
git fetch origin main
git rebase origin/main
```

Expected: the branch is rebased onto the latest `origin/main` with no conflicts. If Git reports a conflict, inspect only the conflicting combat, test, or plan file; resolve it deliberately, run `git diff --check`, and continue with `git -c core.editor=true rebase --continue`. Do not start source edits until the rebase completes.

- [ ] **Step 2: Confirm the clean synchronized baseline**

```bash
git status --short --branch
git log -1 --oneline origin/main
git merge-base --is-ancestor origin/main HEAD
```

Expected: no uncommitted files, the displayed `origin/main` commit is an ancestor of `HEAD`, and the final command exits `0`.

### Task 1: Establish the canonical seed contract

**Files:**
- Modify: `tests/systems/combat-system.test.ts`
- Modify: `src/systems/combat-system.ts`

- [ ] **Step 1: Write the failing helper regressions**

Add `deterministicCombatSeed` to the combat-system test import and add this suite before `describe('resolveCombat', ...)`:

```ts
describe('deterministicCombatSeed', () => {
  it('is reproducible, distinguishes same-turn combat pairs, and supports legacy games', () => {
    const first = deterministicCombatSeed('campaign-a', 42, 'unit-1', 'unit-2');

    expect(deterministicCombatSeed('campaign-a', 42, 'unit-1', 'unit-2')).toBe(first);
    expect(deterministicCombatSeed('campaign-a', 42, 'unit-7', 'unit-9')).not.toBe(first);
    expect(deterministicCombatSeed(undefined, 42, 'unit-1', 'unit-2'))
      .toBe(deterministicCombatSeed('legacy', 42, 'unit-1', 'unit-2'));
  });

  it('does not depend on the active hot-seat player or difficulty', () => {
    const state = createNewGame({ mapSize: 'small', opponentCount: 1, seed: 'seed-hot-seat' });
    const seed = deterministicCombatSeed(state.gameId, state.turn, 'unit-1', 'unit-2');

    state.currentPlayer = 'ai-1';
    state.opponentChallenge = 'expert';

    expect(deterministicCombatSeed(state.gameId, state.turn, 'unit-1', 'unit-2')).toBe(seed);
  });
});
```

Also import `createNewGame` from `@/core/game-state`. Do not assert that two distinct seeds produce different rounded damage; equal rounded damage is a valid outcome.

- [ ] **Step 2: Run the focused test and confirm the missing-export failure**

Run:

```bash
bash scripts/run-with-mise.sh yarn test --run tests/systems/combat-system.test.ts
```

Expected: FAIL because `deterministicCombatSeed` is not exported.

- [ ] **Step 3: Implement the pure FNV-1a helper**

Add this exported function immediately before `resolveCombat` in `src/systems/combat-system.ts`:

```ts
export function deterministicCombatSeed(
  gameId: string | undefined,
  turn: number,
  attackerId: string,
  defenderId: string,
): number {
  const source = [gameId ?? 'legacy', turn, attackerId, defenderId].join(':');
  let hash = 2166136261;
  for (let index = 0; index < source.length; index++) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.max(1, hash >>> 0);
}
```

- [ ] **Step 4: Run the helper and existing combat behavior tests**

Run:

```bash
bash scripts/run-with-mise.sh yarn test --run tests/systems/combat-system.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the contract**

```bash
git add src/systems/combat-system.ts tests/systems/combat-system.test.ts
git commit -m "fix(combat): add deterministic pair seeds"
```

### Task 2: Route every runtime combat and AI simulation through the helper

**Files:**
- Modify: `src/main.ts`
- Modify: `src/core/turn-manager.ts`
- Modify: `src/ai/ai-major-turn.ts`
- Modify: `src/ai/ai-tactics.ts`
- Modify: `src/ai/basic-ai.ts`
- Modify: `src/systems/pirate-system.ts`
- Modify: `src/systems/minor-civ-system.ts`

- [ ] **Step 1: Replace every collision-prone runtime seed**

Extend each existing `resolveCombat` import to include `deterministicCombatSeed`, then replace the local seed expressions with the following exact call shape:

```ts
const seed = deterministicCombatSeed(
  state.gameId,
  state.turn,
  attacker.id,
  defender.id,
);
```

Use `gameState` in `src/main.ts` and `nextState` or `newState` where that is the state variable at the call site. Apply this to:

```ts
// src/main.ts executeAttack
const seed = deterministicCombatSeed(gameState.gameId, gameState.turn, attacker.id, defender.id);

// src/core/turn-manager.ts barbarian and beast attack loops
const combatSeed = deterministicCombatSeed(newState.gameId, newState.turn, attacker.id, defender.id);

// src/ai/basic-ai.ts warship attack
const seed = deterministicCombatSeed(nextState.gameId, nextState.turn, warship.id, adjacentPirate.id);

// src/systems/pirate-system.ts resolvePirateAttack
const seed = deterministicCombatSeed(state.gameId, state.turn, attacker.id, defender.id);

// src/systems/minor-civ-system.ts purposeful order and scuffle paths
const seed = deterministicCombatSeed(nextState.gameId, nextState.turn, attacker.id, defender.id);
const seed = deterministicCombatSeed(state.gameId, state.turn, attackerUnit.id, defenderUnit.id);
```

Remove no longer used per-turn combat variables only when they have no remaining planning or state-application use.

- [ ] **Step 2: Remove the duplicate major-AI helper**

In `src/ai/ai-major-turn.ts`, import `deterministicCombatSeed` from `@/systems/combat-system`, delete the file-local FNV-1a function, and call:

```ts
const seed = deterministicCombatSeed(next.gameId, next.turn, attacker.id, defender.id);
```

- [ ] **Step 3: Align AI tactical prediction with execution**

In `src/ai/ai-tactics.ts`, keep `createRng` because the tactical-choice tie-breaker still uses it. Replace the action/plan-derived `combatSeed` function with a pair-only wrapper:

```ts
function combatSeed(
  state: GameState,
  attackerId: string,
  defenderId: string,
): number {
  return deterministicCombatSeed(state.gameId, state.turn, attackerId, defenderId);
}
```

Update both callers to pass the evaluated state and the actual attacking/defending unit IDs:

```ts
combatSeed(context.state, unit.id, defender.id)
combatSeed(next, unit.id, defender.id)
```

This preserves deterministic tactical ranking while ensuring the preview and `processMajorCivStrategicTurn` resolve the same pair roll.

- [ ] **Step 4: Check that no production combat call site retains an ad hoc seed**

Run:

```bash
rg -n -C 2 'resolveCombat\(' src/main.ts src/core/turn-manager.ts src/ai/ai-major-turn.ts src/ai/ai-tactics.ts src/ai/basic-ai.ts src/systems/pirate-system.ts src/systems/minor-civ-system.ts
```

Expected: every displayed production call passes a `deterministicCombatSeed`-derived value; the local helper remains only as the pair wrapper in `ai-tactics.ts`.

- [ ] **Step 5: Commit the caller migration**

```bash
git add src/main.ts src/core/turn-manager.ts src/ai/ai-major-turn.ts src/ai/ai-tactics.ts src/ai/basic-ai.ts src/systems/pirate-system.ts src/systems/minor-civ-system.ts
git commit -m "fix(combat): share seeds across combat paths"
```

### Task 3: Lock down turn processing, AI parity, and legacy-load behavior

**Files:**
- Modify: `tests/core/turn-manager.test.ts`
- Modify: `tests/ai/ai-major-turn.test.ts`
- Modify: `tests/ai/ai-tactics.test.ts`
- Modify: `tests/main.integration.test.ts`
- Modify: `tests/storage/save-manager.test.ts`

- [ ] **Step 1: Update the existing barbarian expectation**

In the `#519` barbarian city-defense regression, import `deterministicCombatSeed` and replace:

```ts
const combatSeed = (state.turn * 31337 + 1) ^ raider.id.charCodeAt(0);
```

with:

```ts
const combatSeed = deterministicCombatSeed(state.gameId, state.turn, raider.id, garrison.id);
```

Keep the existing assertion that the event result equals the context-aware expected result. It proves the non-human turn path uses the canonical seed and preserves combat-context behavior.

- [ ] **Step 2: Add a live player-path wiring regression**

In `tests/main.integration.test.ts`, add this test in a `describe('player combat wiring', ...)` block:

```ts
it('derives each player combat seed from the game, turn, and unit pair', () => {
  const main = readFileSync(resolve(PROJECT_ROOT, 'src/main.ts'), 'utf8');
  const executeAttack = main.slice(
    main.indexOf('function executeAttack('),
    main.indexOf("bus.on('combat:resolved'"),
  );

  expect(executeAttack).toContain(
    'deterministicCombatSeed(gameState.gameId, gameState.turn, attacker.id, defender.id)',
  );
});
```

This complements the turn-manager regression: it proves the human entry point and a non-human entry point both use the shared seed contract.

- [ ] **Step 3: Add AI execution and tactical-simulation parity regressions**

Export no new AI production API. In `tests/ai/ai-major-turn.test.ts`, add imports for `resolveCombat` and `deterministicCombatSeed` from `@/systems/combat-system` and `buildCombatContextForDefender` from `@/systems/combat-context`. Then use the existing `makeState`, `addUnit`, `makePlan`, and `prepared` helpers to place an adjacent AI warrior and human warrior. Calculate the expected result before processing:

```ts
const expected = resolveCombat(
  attacker,
  defender,
  state.map,
  deterministicCombatSeed(state.gameId, state.turn, attacker.id, defender.id),
  buildCombatContextForDefender(state, attacker, defender),
  state.era,
);
```

After `processMajorCivStrategicTurn`, assert the defender's resulting health is `Math.max(0, defender.health - expected.defenderDamage)`.

In `tests/ai/ai-tactics.test.ts`, change the Vitest import to include `vi` and add `import * as combatSystem from '@/systems/combat-system';`. Use the analogous adjacent-unit fixture, then spy on the actual resolver while selecting tactics:

```ts
const expectedSeed = combatSystem.deterministicCombatSeed(
  state.gameId,
  state.turn,
  attacker.id,
  defender.id,
);
const resolveCombatSpy = vi.spyOn(combatSystem, 'resolveCombat');

try {
  const actions = chooseTacticalSequence(context(state, plan));
  const matchingSeeds = resolveCombatSpy.mock.calls.filter(
    ([seenAttacker, seenDefender, , seed]) => seenAttacker.id === attacker.id
      && seenDefender.id === defender.id
      && seed === expectedSeed,
  );

  expect(actions).toContainEqual({
    kind: 'attack', unitId: attacker.id, targetUnitId: defender.id,
  });
  expect(matchingSeeds.length).toBeGreaterThanOrEqual(2);
} finally {
  resolveCombatSpy.mockRestore();
}
```

The two observed calls are the tactical preview and predicted-action simulation. This directly proves both use the canonical pair seed; the major-turn test separately proves execution uses it.

- [ ] **Step 4: Add the normalized legacy-save regression**

In `tests/storage/save-manager.test.ts`, import `deterministicCombatSeed`. Extend the existing `runs the ordered save schema migration before legacy normalization` test after its `gameId` assertion:

```ts
const first = deterministicCombatSeed(normalized.gameId, normalized.turn, 'unit-1', 'unit-2');
const reloaded = normalizeLoadedStateForTest(structuredClone(legacy));

expect(deterministicCombatSeed(reloaded.gameId, reloaded.turn, 'unit-1', 'unit-2')).toBe(first);
```

This covers the real save-load path without adding a migration solely for combat seeds.

- [ ] **Step 5: Run all focused regressions**

Run:

```bash
bash scripts/run-with-mise.sh yarn test --run tests/systems/combat-system.test.ts tests/core/turn-manager.test.ts tests/ai/ai-major-turn.test.ts tests/ai/ai-tactics.test.ts tests/ai/basic-ai-pirates.test.ts tests/systems/minor-civ-system.test.ts tests/systems/pirate-system.test.ts tests/main.integration.test.ts tests/storage/save-manager.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit the regressions**

```bash
git add tests/systems/combat-system.test.ts tests/core/turn-manager.test.ts tests/ai/ai-major-turn.test.ts tests/ai/ai-tactics.test.ts tests/systems/minor-civ-system.test.ts tests/systems/pirate-system.test.ts tests/main.integration.test.ts tests/storage/save-manager.test.ts
git commit -m "test(combat): cover seed parity and save compatibility"
```

### Task 4: Verify the complete change

**Files:**
- Verify: every source and test file changed by Tasks 1–3

- [ ] **Step 1: Run the source-rule check**

```bash
scripts/check-src-rule-violations.sh src/systems/combat-system.ts src/main.ts src/core/turn-manager.ts src/ai/ai-major-turn.ts src/ai/ai-tactics.ts src/ai/basic-ai.ts src/systems/pirate-system.ts src/systems/minor-civ-system.ts
```

Expected: exit 0.

- [ ] **Step 2: Build and run the full test suite**

```bash
bash scripts/run-with-mise.sh yarn build
bash scripts/run-with-mise.sh yarn test
```

Expected: both commands exit 0.

- [ ] **Step 3: Inspect both branch and worktree deltas**

```bash
git diff --stat origin/main...HEAD
git diff --stat
git diff origin/main...HEAD -- src/systems/combat-system.ts src/main.ts src/core/turn-manager.ts src/ai/ai-major-turn.ts src/ai/ai-tactics.ts src/ai/basic-ai.ts src/systems/pirate-system.ts src/systems/minor-civ-system.ts tests/systems/combat-system.test.ts tests/core/turn-manager.test.ts tests/ai/ai-major-turn.test.ts tests/ai/ai-tactics.test.ts tests/storage/save-manager.test.ts
git diff --check
```

Expected: only the documented deterministic-seed changes and no whitespace errors.

- [ ] **Step 4: Confirm plan status**

This plan is already committed. Do not create an empty documentation commit. If implementation required revising this plan, include that amended file in the final intentional implementation commit instead.
